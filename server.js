#!/usr/bin/env node
/* ============================================================================
 * Friendship Quiz — zero-dependency Node server
 * ----------------------------------------------------------------------------
 * Serves the static site AND persists everything to JSON files in ./data:
 *
 *   data/questions.json   quiz questions (draft / live)
 *   data/attempts.json    participant submissions (private)
 *   data/admin.json       admin account (hashed password, never plaintext)
 *   data/secret.txt       session-signing secret (auto-generated)
 *
 * Because questions live on the server, ANY change the admin makes and
 * publishes is immediately visible to every visitor on every device.
 *
 * RUN
 *   node server.js
 *   # then open http://localhost:3000
 *
 * OPTIONS (env)
 *   PORT=3000                 port to listen on
 *   ADMIN_USERNAME=admin      initial username (first run only)
 *   ADMIN_PASSWORD=1234       initial password (first run only)
 *   SESSION_SECRET=<random>   override the stored session secret
 * ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PORT = process.env.PORT || 3000;
const INITIAL_USER = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const INITIAL_PASS = process.env.ADMIN_PASSWORD || "1234";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  questions: path.join(DATA_DIR, "questions.json"),
  attempts: path.join(DATA_DIR, "attempts.json"),
  admin: path.join(DATA_DIR, "admin.json"),
  secret: path.join(DATA_DIR, "secret.txt")
};

/* ---------- tiny JSON store (atomic writes) ---------- */
function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { return fallback; }
}
function writeJSON(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/* ---------- password hashing ---------- */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function safeEqual(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

/* ---------- one-time bootstrap ---------- */
function loadAdmin() {
  let admin = readJSON(FILES.admin, null);
  if (!admin) {
    const salt = crypto.randomBytes(16).toString("hex");
    admin = { username: INITIAL_USER, salt, passHash: hashPassword(INITIAL_PASS, salt), mustChangePassword: true };
    writeJSON(FILES.admin, admin);
    console.log(`• Created admin account "${INITIAL_USER}" (password "${INITIAL_PASS}") — change it after first login.`);
  }
  return admin;
}

const BUILTIN_QUESTIONS = [
  { text: "Who is your best friend?", options: { A: "My school friend", B: "My college friend", C: "My neighbour", D: "My cousin" } },
  { text: "What is my favourite colour?", options: { A: "Blue", B: "Green", C: "Red", D: "Black" } },
  { text: "Where did we first meet?", options: { A: "College", B: "A party", C: "Online", D: "Work" } },
  { text: "What do we argue about most?", options: { A: "Food", B: "Movies", C: "Music", D: "Nothing" } },
  { text: "What is my dream trip?", options: { A: "Beach", B: "Mountains", C: "City", D: "Space" } }
];

function loadQuestions() {
  let qs = readJSON(FILES.questions, null);
  if (!qs) {
    // Prefer a root-level questions.json (exported from the admin panel).
    let seed = BUILTIN_QUESTIONS;
    const rootSeed = readJSON(path.join(ROOT, "questions.json"), null);
    if (Array.isArray(rootSeed) && rootSeed.length) seed = rootSeed;
    qs = seed.filter((q) => q && q.text && q.options).map((q, i) => ({
      id: "q" + (i + 1), text: q.text, options: q.options,
      order: i + 1, enabled: q.enabled !== false, live: true, updatedAt: new Date().toISOString()
    }));
    writeJSON(FILES.questions, qs);
    console.log(`• Seeded ${qs.length} published questions.`);
  }
  return qs;
}

function loadAttempts() { return readJSON(FILES.attempts, []); }

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let s = "";
  try { s = fs.readFileSync(FILES.secret, "utf8").trim(); } catch {}
  if (!s) { s = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(FILES.secret, s); }
  return s;
}
const SECRET = loadSecret();
loadAdmin();
loadQuestions();
if (!fs.existsSync(FILES.attempts)) writeJSON(FILES.attempts, []);

/* ---------- sessions (HMAC-signed cookie) ---------- */
const COOKIE = "fq_session";
const SESSION_MS = 1000 * 60 * 60 * 12; // 12h
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (!safeEqual(sig, expect)) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function currentAdmin(req) {
  const p = verifyToken(parseCookies(req)[COOKIE]);
  return p && p.role === "admin" ? p : null;
}

/* ---------- helpers ---------- */
function send(res, status, body, type = "application/json") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(data);
}
function readBody(req, limit = 1024 * 512) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("Payload too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain" };
// Detect image types for files without an extension (e.g. the "teddy" mascot).
function sniffType(buf) {
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return "image/webp";
  return "application/octet-stream";
}
function serveStatic(req, res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  // Never expose server-side data or config files over HTTP.
  const lower = clean.toLowerCase();
  if (
    lower === "/data" || lower.startsWith("/data/") ||
    lower.startsWith("/tools/") ||
    lower.startsWith("/.git") ||
    ["/server.js", "/package.json", "/package-lock.json", "/firestore.rules",
     "/firestore.indexes.json", "/firebase.json", "/data"].includes(lower)
  ) {
    return send(res, 404, "Not found", "text/plain");
  }
  const file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, "Forbidden", "text/plain");
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      if (!path.extname(pathname)) return serveStatic(req, res, "/index.html"); // SPA fallback
      return send(res, 404, "Not found", "text/plain");
    }
    fs.readFile(file, (e, buf) => {
      if (e) return send(res, 500, "Server error", "text/plain");
      let type = MIME[path.extname(file).toLowerCase()];
      if (!type) type = sniffType(buf);
      send(res, 200, buf, type);
    });
  });
}

/* ---------- validation ---------- */
const str = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
function validOptions(o) { return o && ["A", "B", "C", "D"].every((L) => str(o[L], 1, 160)); }
function cleanOptions(o) { const r = {}; ["A", "B", "C", "D"].forEach((L) => r[L] = String(o[L]).trim()); return r; }

/* ---------- API ---------- */
async function handleApi(req, res, pathname) {
  const method = req.method;

  // ---- public ----
  if (pathname === "/api/config" && method === "GET") return send(res, 200, { mode: "api" });

  if (pathname === "/api/questions" && method === "GET") {
    const live = loadQuestions().filter((q) => q.live && q.enabled).sort((a, b) => a.order - b.order);
    return send(res, 200, live);
  }

  if (pathname === "/api/attempts" && method === "POST") {
    let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    if (!str(b.name, 2, 40)) return send(res, 400, { error: "Invalid name." });
    if (!str(b.attemptId, 6, 80)) return send(res, 400, { error: "Invalid attempt id." });
    if (!Array.isArray(b.answers) || !b.answers.length || b.answers.length > 100) return send(res, 400, { error: "Invalid answers." });
    const attempts = loadAttempts();
    if (attempts.some((a) => a.attemptId === b.attemptId)) return send(res, 409, { error: "Already submitted." });
    const answers = [];
    for (const a of b.answers) {
      if (!str(a.questionId, 1, 80) || !str(a.questionText, 1, 300) || !["A", "B", "C", "D"].includes(a.optionLetter) || !str(a.optionText, 1, 160)) {
        return send(res, 400, { error: "Malformed answer." });
      }
      answers.push({ questionId: a.questionId, questionText: a.questionText, questionOrder: Number(a.order) || 0, optionLetter: a.optionLetter, optionText: a.optionText });
    }
    attempts.unshift({ id: b.attemptId, attemptId: b.attemptId, name: b.name.trim(), status: "completed", totalQuestions: answers.length, createdAt: new Date().toISOString(), answers });
    writeJSON(FILES.attempts, attempts);
    return send(res, 201, { ok: true });
  }

  // ---- auth ----
  if (pathname === "/api/admin/login" && method === "POST") {
    let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const admin = loadAdmin();
    const user = String(b.username || "").trim().toLowerCase();
    const okUser = user === admin.username.toLowerCase();
    const okPass = str(b.password, 1, 200) && safeEqual(hashPassword(b.password, admin.salt), admin.passHash);
    if (!okUser || !okPass) return send(res, 401, { error: "Invalid username or password." });
    const token = signToken({ role: "admin", username: admin.username, exp: Date.now() + SESSION_MS });
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${process.env.HTTPS === "1" ? "; Secure" : ""}`);
    return send(res, 200, { ok: true, mustChangePassword: !!admin.mustChangePassword });
  }
  if (pathname === "/api/admin/logout" && method === "POST") {
    res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    return send(res, 200, { ok: true });
  }
  if (pathname === "/api/admin/session" && method === "GET") {
    const s = currentAdmin(req);
    if (!s) return send(res, 401, { error: "Not signed in." });
    const admin = loadAdmin();
    return send(res, 200, { username: admin.username, mustChangePassword: !!admin.mustChangePassword });
  }

  // ---- everything below requires admin ----
  if (pathname.startsWith("/api/admin/")) {
    const s = currentAdmin(req);
    if (!s) return send(res, 401, { error: "Unauthorized." });

    if (pathname === "/api/admin/questions" && method === "GET") {
      return send(res, 200, loadQuestions().sort((a, b) => a.order - b.order));
    }
    if (pathname === "/api/admin/questions" && method === "POST") {
      const b = await readBody(req);
      if (!str(b.text, 3, 300) || !validOptions(b.options)) return send(res, 400, { error: "Question text and four options are required." });
      const qs = loadQuestions();
      const order = qs.length ? Math.max(...qs.map((q) => q.order)) + 1 : 1;
      qs.push({ id: "q" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex"), text: b.text.trim(), options: cleanOptions(b.options), order, enabled: true, live: false, updatedAt: new Date().toISOString() });
      writeJSON(FILES.questions, qs);
      return send(res, 201, { ok: true });
    }
    let m = pathname.match(/^\/api\/admin\/questions\/([^/]+)$/);
    if (m && method === "PUT") {
      const b = await readBody(req);
      if (!str(b.text, 3, 300) || !validOptions(b.options)) return send(res, 400, { error: "Question text and four options are required." });
      const qs = loadQuestions(); const q = qs.find((x) => x.id === m[1]);
      if (!q) return send(res, 404, { error: "Not found." });
      q.text = b.text.trim(); q.options = cleanOptions(b.options); q.live = false; q.updatedAt = new Date().toISOString();
      writeJSON(FILES.questions, qs);
      return send(res, 200, { ok: true });
    }
    if (m && method === "DELETE") {
      let qs = loadQuestions(); const before = qs.length;
      qs = qs.filter((x) => x.id !== m[1]);
      if (qs.length === before) return send(res, 404, { error: "Not found." });
      qs.forEach((q, i) => q.order = i + 1);
      writeJSON(FILES.questions, qs);
      return send(res, 200, { ok: true });
    }
    m = pathname.match(/^\/api\/admin\/questions\/([^/]+)\/toggle$/);
    if (m && method === "POST") {
      const b = await readBody(req);
      const qs = loadQuestions(); const q = qs.find((x) => x.id === m[1]);
      if (!q) return send(res, 404, { error: "Not found." });
      q.enabled = !!b.enabled; q.live = false; q.updatedAt = new Date().toISOString();
      writeJSON(FILES.questions, qs);
      return send(res, 200, { ok: true });
    }
    m = pathname.match(/^\/api\/admin\/questions\/([^/]+)\/move$/);
    if (m && method === "POST") {
      const b = await readBody(req);
      const qs = loadQuestions().sort((a, b2) => a.order - b2.order);
      const i = qs.findIndex((x) => x.id === m[1]);
      const j = b.dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= qs.length) return send(res, 400, { error: "Cannot move." });
      [qs[i], qs[j]] = [qs[j], qs[i]];
      qs.forEach((q, idx) => q.order = idx + 1);
      writeJSON(FILES.questions, qs);
      return send(res, 200, { ok: true });
    }
    if (pathname === "/api/admin/publish" && method === "POST") {
      const qs = loadQuestions();
      qs.forEach((q) => { q.live = q.enabled; q.updatedAt = new Date().toISOString(); });
      writeJSON(FILES.questions, qs);
      return send(res, 200, { ok: true, count: qs.filter((q) => q.live).length });
    }
    if (pathname === "/api/admin/attempts" && method === "GET") {
      return send(res, 200, loadAttempts());
    }
    m = pathname.match(/^\/api\/admin\/attempts\/([^/]+)$/);
    if (m && method === "DELETE") {
      let attempts = loadAttempts(); const before = attempts.length;
      attempts = attempts.filter((a) => a.id !== m[1] && a.attemptId !== m[1]);
      if (attempts.length === before) return send(res, 404, { error: "Not found." });
      writeJSON(FILES.attempts, attempts);
      return send(res, 200, { ok: true });
    }
    if (pathname === "/api/admin/credentials" && method === "POST") {
      const b = await readBody(req);
      const admin = loadAdmin();
      if (!str(b.currentPassword, 1, 200) || !safeEqual(hashPassword(b.currentPassword, admin.salt), admin.passHash)) {
        return send(res, 400, { error: "Current password is incorrect." });
      }
      if (b.newUsername && String(b.newUsername).trim()) {
        const uname = String(b.newUsername).trim().toLowerCase().replace(/\s+/g, "");
        if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(uname)) return send(res, 400, { error: "Username must be 3-24 chars (letters, numbers, _ . -)." });
        admin.username = uname;
      }
      if (b.newPassword) {
        if (String(b.newPassword).length < 6) return send(res, 400, { error: "New password must be at least 6 characters." });
        admin.salt = crypto.randomBytes(16).toString("hex");
        admin.passHash = hashPassword(b.newPassword, admin.salt);
      }
      admin.mustChangePassword = false;
      writeJSON(FILES.admin, admin);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "Unknown admin endpoint." });
  }

  return send(res, 404, { error: "Unknown API endpoint." });
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/api" || pathname.startsWith("/api/")) return await handleApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (e) {
    send(res, 500, { error: "Server error: " + e.message });
  }
});

server.listen(PORT, () => {
  console.log("\n  🌌  Friendship Quiz server running");
  console.log(`      ➜  http://localhost:${PORT}`);
  console.log(`      ➜  Admin login: ${INITIAL_USER} / ${INITIAL_PASS} (change on first login)\n`);
});

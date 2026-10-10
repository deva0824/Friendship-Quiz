#!/usr/bin/env node
/* ============================================================================
 * Friendship Quiz — one-time administrator bootstrap
 * ----------------------------------------------------------------------------
 * Creates (or resets) the first administrator account and its Firestore
 * `admins/{uid}` record, and seeds some starter questions.
 *
 * The default credentials are:
 *     username: admin
 *     password: 1234
 * and the account is flagged `mustChangePassword`, so the dashboard forces a
 * password change on first login.
 *
 * REQUIREMENTS
 *   1. A Firebase project with Email/Password auth + Firestore enabled.
 *   2. A service account key:
 *        Firebase Console -> Project settings -> Service accounts
 *        -> Generate new private key  (save as  tools/serviceAccount.json)
 *      OR set GOOGLE_APPLICATION_CREDENTIALS to its path.
 *
 * USAGE
 *   cd tools
 *   npm install
 *   node setup-admin.js
 *
 * ENV OVERRIDES
 *   ADMIN_USERNAME   (default: admin)
 *   ADMIN_PASSWORD   (default: 1234)
 *   EMAIL_DOMAIN     (default: friendshipquiz.app)
 *   SEED_QUESTIONS   (default: true)
 * ========================================================================== */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const admin = require("firebase-admin");

const USERNAME = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "1234";
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "friendshipquiz.app";
const SEED = String(process.env.SEED_QUESTIONS || "true") !== "false";
const EMAIL = `${USERNAME}@${EMAIL_DOMAIN}`;

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, "serviceAccount.json");

if (fs.existsSync(keyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const auth = admin.auth();
const db = admin.firestore();

const SEED_DATA = [
  { text: "Who is your best friend?", options: { A: "My school friend", B: "My college friend", C: "My neighbour", D: "My cousin" } },
  { text: "What is my favourite colour?", options: { A: "Blue", B: "Green", C: "Red", D: "Black" } },
  { text: "Where did we first meet?", options: { A: "College", B: "A party", C: "Online", D: "Work" } }
];

// If a questions.json exists at the project root, use it as the permanent
// default question set (exported from the admin's "Export Questions" button).
const SEED_PATH = path.join(__dirname, "..", "questions.json");
(function loadSeed() {
  if (!fs.existsSync(SEED_PATH)) return;
  try {
    const json = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
    if (Array.isArray(json) && json.length) {
      SEED_DATA.length = 0;
      json.filter((q) => q && q.text && q.options).forEach((q) => SEED_DATA.push({ text: q.text, options: q.options }));
      console.log(`• Using questions.json as the default question set (${SEED_DATA.length} questions)`);
    }
  } catch (err) {
    console.warn("⚠ Could not parse questions.json — using built-in defaults.", err.message);
  }
})();

(async () => {
  try {
    let user;
    try {
      user = await auth.getUserByEmail(EMAIL);
      console.log(`• Existing admin user found (${EMAIL}), resetting password…`);
      await auth.updateUser(user.uid, { password: PASSWORD });
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      console.log(`• Creating admin user (${EMAIL})…`);
      user = await auth.createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
    }

    await db.collection("admins").doc(user.uid).set({
      username: USERNAME,
      email: EMAIL,
      mustChangePassword: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`• admins/${user.uid} written (mustChangePassword = true)`);

    if (SEED) {
      const existing = await db.collection("questions").limit(1).get();
      if (existing.empty) {
        const batch = db.batch();
        SEED_DATA.forEach((q, i) => {
          const ref = db.collection("questions").doc();
          batch.set(ref, {
            text: q.text, options: q.options,
            order: i + 1, enabled: true, live: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
        console.log(`• Seeded ${SEED_DATA.length} live questions`);
      } else {
        console.log("• Questions already exist — skipping seed");
      }
    }

    console.log("\n✅ Done. Log in with username '%s' and password '%s'.", USERNAME, PASSWORD);
    console.log("   You will be required to change the password after signing in.");
  } catch (err) {
    console.error("\n❌ Bootstrap failed:", err.message);
    if (!fs.existsSync(keyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error("   No service account key found. See the header of this file.");
    }
    process.exit(1);
  }
})();

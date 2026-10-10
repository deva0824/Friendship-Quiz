# 🌌 Friendship Quiz — Dark Animated Quiz Website

A premium, animated, dark-themed **Friendship Quiz** website with a secure
**Admin Panel** and a **User Quiz System**. Built with pure HTML/CSS/JavaScript
(one `index.html`) plus a choice of backends:

- 🖥️ **Node server** (`server.js`, zero dependencies) — questions the admin edits
  are saved to disk and shown to **every visitor**. Best for hosting on your own box.
- 🔥 **Firebase Auth + Cloud Firestore** — managed, secure, real-time, cross-device.
- 🧪 **Demo mode** (localStorage) — instant, single-browser trial of the UI.

> **How well do your friends know you?**
> Users answer the admin's questions; the admin privately sees every participant,
> question, and exact option selected.

---

## ✨ Features

| Area | Included |
|---|---|
| 🎨 Design | Deep navy/black background, neon purple/blue/pink gradients, glassmorphism, floating particles, glow orbs, reduced-motion support |
| 🏠 Home | Animated title, subtitle, description, name field (validated), unique Attempt ID, "answers go to admin" notice |
| 📝 Quiz | One question at a time, A–D options, glow selection, next/previous, question counter, animated progress bar, dots navigator, required-answer validation |
| ✅ Completion | Animated tick, friendly confirmation, answer summary, new attempt / home |
| 🔐 Admin Login | Separate page, secure backend auth, forced password change on first login |
| 📊 Dashboard | Animated stat cards, recent activity, live question counts |
| 🧩 Manage Questions | Create, edit, delete (with confirm), reorder, enable/disable, preview, **draft→publish** workflow, 4 options each |
| 🕵️ User Responses | Per-participant records, click to view all answers, search, date & status filters, sort newest/oldest, CSV export, per-question aggregate stats, and **Select → Clear** (select rows in a checkbox mode and delete them with a fade-out animation) |
| ⚙️ Settings | Change username + password (current password required), backend info |
| 🛡️ Security | Firestore rules enforce all permissions server-side; snapshots keep historical answers intact |

---

## 🗂️ Project structure

```
friendship-quiz/
├── index.html               # The entire frontend (SPA): user + admin
├── server.js                # Zero-dependency Node server (static + JSON API + storage)
├── package.json             # npm start -> node server.js
├── data/                    # Auto-created by server.js on first run (your content)
│   ├── questions.json       #   questions (shared with every visitor)
│   ├── attempts.json        #   participants' responses (private)
│   ├── admin.json           #   admin username + hashed password
│   └── secret.txt           #   session signing secret (auto-generated)
├── firestore.rules          # Cloud Firestore security rules (Firebase mode)
├── firestore.indexes.json   # Required composite index (Firebase mode)
├── firebase.json            # Hosting + Firestore deploy config (Firebase mode)
├── tools/
│   ├── package.json
│   └── setup-admin.js       # One-time admin bootstrap (Firebase Admin SDK)
└── README.md
```

---

## ⚡ What works immediately vs. what needs configuration

The app auto-detects its backend at load time: it first looks for the **Node
server**, then Firebase (if configured), otherwise falls back to **Demo** mode.
Add `?demo=1` to any URL to force demo mode.

### 1. Node server mode (recommended for a self-hosted site)
Run the included server and share one URL with everyone:

```bash
cd friendship-quiz
node server.js          # or: npm start
# open http://localhost:3000
```

- ✅ Questions you create/publish in the admin panel are written to
  `data/questions.json` and served to **all** visitors.
- ✅ Participants' responses are stored privately in `data/attempts.json` and only
  visible after admin login.
- ✅ Credentials are hashed (scrypt) and sessions are signed `httpOnly` cookies.
- Default login: **admin / 1234** (you'll be forced to change it in-app).
- Configure with env vars: `PORT` (default `3000`), `ADMIN_USERNAME`,
  `ADMIN_PASSWORD`, `SESSION_SECRET`, and `HTTPS=1` behind a TLS proxy.

### 2. Demo mode (works instantly, no setup) — INSECURE
Open `index.html` in a browser (or add `?demo=1`). Uses `localStorage`.

- ✅ Every feature works: quiz, all 10 pages, admin dashboard, responses, CSV export, settings.
- Default login: **admin / 1234** (you'll be forced to change it in-app).
- ⚠️ **Data lives only in one browser.** Credentials are *not* securely protected,
  and responses are **not** shared across devices. This is for trying the UI only.

### 3. Firebase mode (real, secure, cross-device) — REQUIRES CONFIGURATION
Fill in `FIREBASE_CONFIG` in `index.html` and run the setup steps below.
Then credentials are protected by Firebase Auth and all reads/writes are
enforced by `firestore.rules` on the server. **Use this for a real website.**

> ℹ️ A single HTML file **cannot** by itself securely protect admin credentials or
> privately store responses across devices. The Firebase backend below is what
> makes those guarantees real.

---

## 🚀 Full setup (Firebase mode)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**.
2. In **Build → Authentication → Sign-in method**, enable **Email/Password**.
3. In **Build → Firestore Database**, click **Create database** (start in
   *production mode*; the rules are deployed next).

### 2. Get your web app config
Project settings ⚙️ → **Your apps** → **Web (`</>`)** → register an app, then copy
the `firebaseConfig` object into `index.html`:

```js
const FIREBASE_CONFIG = {
  apiKey: "…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};
```

### 3. Install the Firebase CLI and log in
```bash
npm install -g firebase-tools
firebase login
cd friendship-quiz
# edit .firebaserc or run:
firebase use --add        # select your project
```

### 4. Bootstrap the first administrator (admin / 1234)
Create a service account key: **Project settings → Service accounts → Generate new
private key**, save it as `tools/serviceAccount.json`, then:

```bash
cd tools
npm install
node setup-admin.js
```
This creates the Auth user `admin@friendshipquiz.app` (password `1234`),
writes the `admins/{uid}` record with `mustChangePassword: true`, and seeds a few
starter questions.

> Override the defaults if you like:
> `ADMIN_USERNAME=boss ADMIN_PASSWORD=Secret123 node setup-admin.js`

### 5. Deploy rules, indexes and hosting
```bash
cd ..            # back to the project root
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only hosting
```
Your site is now live at `https://your-project.web.app`.

---

## 🧑‍💻 Run locally

### Option A — Node server (shares questions across devices)
```bash
cd friendship-quiz
node server.js            # serves http://localhost:3000
```
Open <http://localhost:3000>. The badge at the bottom shows
“Node server active”.

### Option B — Static file server (demo / Firebase mode)
Because the app uses ES module imports, serve it over HTTP (not `file://`):

```bash
# from the project root
python3 -m http.server 5173
# then open http://localhost:5173
```

- Demo mode (no config needed): `http://localhost:5173/?demo=1`
- Firebase mode: `http://localhost:5173/` (after step 2 above)

---

## 🔑 Administrator instructions

**Initial credentials:** `admin` / `1234`
(demo mode uses these too; Firebase mode creates them in step 4).

- **First login**: the dashboard forces you to the **Account Settings** page to
  change the default password before continuing.
- **Change credentials**: Account Settings → enter current password (and a new
  username and/or password) → Save.
- **Usernames**: the app maps a username to `<username>@friendshipquiz.app`.
  Changing the username updates the login email.
- **Add more admins** (optional): create an Auth user in the console and add a
  matching document at `admins/{their-uid}` with `{ "username": "..." }`.

### Publish workflow
1. **Manage Questions** → create/edit/reorder/enable questions. Edits become
   **DRAFT** (users can't see them yet).
2. Click **Preview Quiz** to check.
3. Click **Publish Updates** → drafts turn **LIVE** and users see the changes.

### Make your questions the permanent default set
Your questions are saved in the app's database, but a brand-new deploy starts fresh.
To pin *your* questions as the default that every new site/copy uses:

1. **Admin → Manage Questions → Export Questions** → downloads a `questions.json`
   file containing your exact questions.
2. Save `questions.json` into the **project root** (next to `index.html`).
3. That's it — from now on:
   - **Demo mode** seeds these questions on first run (instead of the built-in 5),
   - **`tools/setup-admin.js`** seeds these exact questions into Firestore
     (marked live) instead of its 3 placeholders.

`questions.json` is bundled with the site when you `firebase deploy`, so hosting
always ships your question set. The file is only read on first setup; existing
databases keep their current questions.

---

## 🗄️ Data model (Cloud Firestore)

```
admins/{uid}
  username: string
  email: string
  mustChangePassword: boolean
  updatedAt: timestamp

questions/{questionId}
  text: string
  options: { A, B, C, D: string }
  order: number
  enabled: boolean          // admin on/off
  live: boolean             // published to users
  createdAt / updatedAt: timestamp

config/quiz
  publishedAt: timestamp
  count: number

attempts/{attemptId}                       // PRIVATE (admin-only read)
  name: string
  attemptId: string
  status: "completed"
  totalQuestions: number
  createdAt: timestamp                     // server timestamp

  └─ answers/{questionId}                  // snapshot at submission time
       questionId: string
       questionText: string                // frozen text
       questionOrder: number
       optionLetter: "A"|"B"|"C"|"D"
       optionText: string                  // frozen option text
```

**Why snapshots?** Each answer stores the question text and option text *as shown*.
If the admin later edits a question, historical responses stay correct.

---

## 🛡️ Security model (`firestore.rules`)

- **Public users** can read **only** `live == true && enabled == true` questions.
- **Public users** can **create** an attempt + answers (validated for shape/length),
  with a **duplicate-submission guard** (`attemptId` must not already exist).
- **Public users cannot read** attempts/answers, nor create/update/delete questions.
- **Admins** (a document exists at `admins/{uid}` for the signed-in user) can manage
  questions, read responses, and change settings — enforced **server-side**, not by
  hiding buttons.
- Passwords are handled by **Firebase Authentication** (never stored in the app);
  no secret keys live in the frontend.

Everyone else is denied by the catch-all rule at the bottom of the file.

---

## 🖥️ Node server mode (`server.js`)

A single zero-dependency Node file that serves the SPA and a small JSON API, and
persists everything to disk under `data/`.

```bash
node server.js                 # http://localhost:3000
PORT=8080 node server.js       # custom port
ADMIN_USERNAME=boss ADMIN_PASSWORD=Secret123 node server.js
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_USERNAME` | `admin` | Seeds the first admin (only if no `data/admin.json`) |
| `ADMIN_PASSWORD` | `1234` | Seeds the first admin password |
| `SESSION_SECRET` | auto | Secret used to sign session cookies |
| `HTTPS=1` | off | Sets `Secure` cookies (use behind a TLS proxy such as nginx/Caddy) |

**API surface**

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /api/config` | – | Reports `{ "mode": "api" }` so the frontend auto-selects this backend |
| `GET /api/questions` | – | Public, **live + enabled** questions only |
| `POST /api/attempts` | – | Submit a participant's answers (validated, deduped) |
| `POST /api/admin/login` / `logout` | – | Create / destroy a session |
| `GET /api/admin/session` | admin | Current admin, or `401` |
| `GET/POST /api/admin/questions` | admin | List / create |
| `PUT /api/admin/questions/:id` | admin | Edit (sets draft) |
| `DELETE /api/admin/questions/:id` | admin | Delete |
| `POST /api/admin/questions/:id/toggle` | admin | Enable/disable |
| `POST /api/admin/questions/:id/move` | admin | Reorder up/down |
| `POST /api/admin/publish` | admin | Publish all drafts (live = enabled) |
| `GET /api/admin/attempts` | admin | All participant responses |
| `DELETE /api/admin/attempts/:id` | admin | Delete a response |
| `POST /api/admin/credentials` | admin | Change username/password (current password required) |

**Security:** passwords are hashed with **scrypt** (salted, `timingSafeEqual`
comparison); sessions are **HMAC-signed `httpOnly` cookies** (`SameSite=Lax`);
public endpoints never expose responses or non-live questions. Back up the
`data/` folder; deleting it resets the site.

> ⚠️ `data/` is **not** deployed to Firebase Hosting (it is in `firebase.json`'s
> `ignore` list) — run `server.js` on your own host when using this mode.

---

## 🧾 Pages / views delivered

1. Home · 2. Name Entry · 3. Quiz · 4. Completion · 5. Admin Login ·
6. Admin Dashboard · 7. Question Management · 8. User Responses ·
9. Individual Participant Details · 10. Admin Account Settings

---

## 🧯 Troubleshooting

| Symptom | Fix |
|---|---|
| "The query requires an index" | Run `firebase deploy --only firestore:indexes`, or click the link in the console error. |
| Can't log in as admin (Firebase) | Re-run `tools/setup-admin.js`; ensure the `admins/{uid}` doc exists. |
| Users see no questions | In **Manage Questions**, click **Publish Updates** (drafts are hidden). |
| `file://` refuses to run | Serve over HTTP (`python3 -m http.server`, or `node server.js`). |
| Want pure demo | Open the site with `?demo=1`. |
| Admin edits vanish / not shared | You're in **demo mode** (browser-only). Run `node server.js` and open that URL instead. |

---

## 📦 Deploying elsewhere

### Static host (demo / Firebase mode)
Any static host works (Netlify, Vercel, GitHub Pages, Cloudflare Pages, Firebase
Hosting). Upload `index.html` (Firebase mode requires the config from step 2).
Firestore, Auth and the security rules remain on Firebase.

### Node host (Node server mode)
Any Node-capable host or VPS (Render, Railway, Fly.io, a plain server, Docker…):

```bash
node server.js
```

Persist the `data/` directory (mount a volume / disk) so questions and responses
survive restarts, and set `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `SESSION_SECRET`
via environment variables. Put it behind HTTPS and start with `HTTPS=1`.

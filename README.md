# ChopCircle

A social cookbook platform for Nigerian home cooks — discover recipes, share
food, follow cooks, and build a personal cookbook. Vanilla JS (ES Modules) +
Firebase, structured like a modern component-based app.

**Live status:** deployed and under active testing on Netlify (GitHub →
auto-deploy), not Firebase Hosting — see "Hosting" below. Firebase project
in use is an existing, previously-unrelated project, reused rather than
created fresh — see the caution note in that section too.

## Getting started

1. Create (or reuse) a Firebase project → enable **Authentication**
   (Email/Password + Google), **Firestore**, and **Storage**.
2. Copy your web app config into `firebase/firebase-config.js` — **only**
   the plain `export const firebaseConfig = { ... }` object, six fields
   (`apiKey`/`authDomain`/`projectId`/`storageBucket`/`messagingSenderId`/
   `appId`). The Firebase console's default "copy config" snippet is
   npm/bundler-style (`import { initializeApp } from "firebase/app"`) —
   this project has no bundler, so that import breaks with `Failed to
   resolve module specifier "firebase/app"` if pasted in as-is. Strip
   everything except the object itself.
3. Deploy the security rules — either via the CLI:
   ```
   firebase deploy --only firestore:rules,storage:rules
   ```
   or by pasting `firebase/firestore.rules` / `firebase/storage.rules`
   directly into the console's rules editor (works equally well; just
   remember the local files and the live rules can drift apart if you
   edit one without the other afterward).
4. Seed the `categories` collection (see `firebase/firestore-schema.md`)
   with the category list from the product brief (Breakfast, Rice, Soups,
   Swallow, Drinks, Local Dishes, etc).
5. Serve the project with any static server, e.g. `npx serve .`, and open
   `index.html`. (ES Modules require `http(s)://`, not `file://`.)

Composite indexes are **not** required up front — Firestore's console
error links you straight to a pre-filled "create index" page the first
time a query actually needs one you haven't made yet. `TESTING_PHASE_SETUP.md`
§4 has the full table if you'd rather create them all ahead of time instead.

## Hosting

Deployed on **Netlify**, connected to a GitHub repo for auto-deploy on
push, with a custom domain layered on top of the `*.netlify.app`
subdomain. `firebase.json`'s `hosting` block was written for Firebase
Hosting as a default option but isn't in use — nothing needs to change
about it, it's just inert while Netlify serves the static files instead.
Firestore/Storage/Auth are unaffected either way; they're called
client-side via the SDK regardless of where the HTML/CSS/JS is served
from.

**One setup step specific to this path:** Google sign-in
(`signInWithPopup` in `js/auth/login.js`/`signup.js`) needs your Netlify
domain(s) added under Firebase console → Authentication → Settings →
Authorized domains, or it throws an "unauthorized domain" error. Email/
password auth is unaffected.

**Caution on the Firebase project in use:** the project currently wired
up (`firebase/firebase-config.js`) is an existing project that predates
ChopCircle, reused rather than created fresh — its name suggests it may
serve another, unrelated app. Two things worth confirming before this
goes further into testing: (1) that project's Firestore/Storage rules
were overwritten with ChopCircle's during setup — if it had its own rules
protecting other data, they're gone; (2) ChopCircle's collections now
share a database with whatever else lives in that project, which is only
a problem if there's a naming collision (e.g., another `users` collection
with a different shape). If this project is genuinely just an old unused
test project, there's no issue — this is flagged so it doesn't get
forgotten either way.

## Project structure

See `PLANNING.md` for the design system and phase status, and `HANDOFF.md`
for exactly where to pick the build back up. `TESTING_PHASE_SETUP.md`
covers Firebase project setup end to end (Auth/Firestore/Storage, rules,
indexes, seeding) for anyone setting this up from scratch.

```
cookbook/
├── assets/                images, icons, logos, illustrations
├── css/                   base tokens/reset/typography, layouts, components, pages
├── js/                    one folder per feature domain, firebase/ holds the SDK init
├── pages/                 every route except the public home (index.html)
├── firebase/               config, Firestore schema doc, security rules
├── functions/              Cloud Functions scaffold (Phase 11+, not deployed — see functions/README.md)
├── index.html              public marketing home
├── firebase.json           written for Firebase Hosting — inert while deployed on Netlify instead
├── .firebaserc              Firebase project alias (placeholder — fill in your project ID)
├── PLANNING.md              design system + data model summary + phase status
├── HANDOFF.md               continuation brief for the next work session
├── MANUAL_SETUP.md          Phase 9 (PWA) manual testing checklist
└── TESTING_PHASE_SETUP.md   full manual setup checklist for Phase 11
```

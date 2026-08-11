# ChopCircle

A social cookbook platform for Nigerian home cooks — discover recipes, share
food, follow cooks, and build a personal cookbook. Vanilla JS (ES Modules) +
Firebase, structured like a modern component-based app.

## Getting started

1. Create a Firebase project → enable **Authentication** (Email/Password +
   Google), **Firestore**, and **Storage**.
2. Copy your web app config into `firebase/firebase-config.js`.
3. Deploy the security rules:
   ```
   firebase deploy --only firestore:rules,storage:rules
   ```
4. Seed the `categories` collection (see `firebase/firestore-schema.md`)
   with the category list from the product brief (Breakfast, Rice, Soups,
   Swallow, Drinks, Local Dishes, etc).
5. Serve the project with any static server, e.g. `npx serve .`, and open
   `index.html`. (ES Modules require `http(s)://`, not `file://`.)

## Project structure

See `PLANNING.md` for the design system and phase status, and `HANDOFF.md`
for exactly where to pick the build back up. Before testing on a real
Firebase project, work through `TESTING_PHASE_SETUP.md` — it covers
project creation, enabling Auth/Firestore/Storage, deploying rules and
indexes, and seeding data; none of that can be done from inside this repo.

```
cookbook/
├── assets/                images, icons, logos, illustrations
├── css/                   base tokens/reset/typography, layouts, components, pages
├── js/                    one folder per feature domain, firebase/ holds the SDK init
├── pages/                 every route except the public home (index.html)
├── firebase/               config, Firestore schema doc, security rules
├── functions/              Cloud Functions scaffold (Phase 11+, not deployed — see functions/README.md)
├── index.html              public marketing home
├── firebase.json           hosting + firestore/storage rules + functions wiring
├── .firebaserc              Firebase project alias (placeholder — fill in your project ID)
├── PLANNING.md              design system + data model summary + phase status
├── HANDOFF.md               continuation brief for the next work session
├── MANUAL_SETUP.md          Phase 9 (PWA) manual testing checklist
└── TESTING_PHASE_SETUP.md   full manual setup checklist for Phase 11
```

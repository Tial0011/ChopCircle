# ChopCircle Cloud Functions — Phase 11+ scaffold

Status: **folder created, nothing here is deployed or wired up yet.**
Every function in `index.js` is written but commented out (not exported).
This exists so Phase 11 ("Testing") and beyond has a real place to put the
backend work that `firebase/firestore-schema.md` and `firebase/firestore.rules`
already say is coming — it isn't part of Phase 10 (Notifications), which
this project just finished client-side-only, on purpose (see
`service-worker.js`'s comment and `HANDOFF.md`).

## What's in `index.js`

- **Counter maintenance** (example: recipe like counts) — the plan to move
  `likeCount`/`commentCount`/`followerCount`/etc. off client-side
  transactions (in `js/feed/feedService.js`, `js/recipes/recipeService.js`,
  `js/profile/profileService.js`) and onto Firestore triggers, so a client
  can't desync or fake a counter.
- **Server-side notification creation** (example: follow notifications) —
  the same move for `js/notifications/notificationService.js`'s
  `createNotification()`, so a client can't spoof `actorId`/`actorName` on
  someone else's behalf.
- **Account deletion** — referenced by `firebase/firestore.rules`
  (`users/{uid}`'s `allow delete: if false` comment) but not implemented;
  left commented out because it's incomplete, not because of double-firing
  (see the comment above it in `index.js`).

## Before you deploy ANY of this

Uncommenting and deploying a trigger while its client-side equivalent is
still live will double-count (e.g. a like would increment `likeCount`
twice — once from the client transaction, once from the new trigger).
For each function you turn on:

1. Uncomment it in `index.js`.
2. Remove or guard the matching client-side call in the corresponding
   `js/*Service.js` file so the two don't both fire.
3. Test against the Firestore emulator (`npm run serve` from this folder)
   before deploying to production.
4. `npm run deploy` (or `firebase deploy --only functions` from the repo
   root once `firebase.json` points at this folder — see the root
   `MANUAL_SETUP.md`).

## Setup this folder itself still needs (can't be done from inside the repo)

- `cd functions && npm install` — nothing has been installed yet, this
  folder only has `package.json`, not `node_modules/`.
- A Firebase project on the **Blaze (pay-as-you-go)** plan — Cloud
  Functions aren't available on the free Spark plan.
- `firebase login` + `firebase use <your-project-id>` (or fill in the
  placeholder in the root `.firebaserc`) so `firebase deploy` knows which
  project to target.

# ChopCircle Cloud Functions

Status: **`sendPush` is written and exported (Phase 12 — active once
deployed). Everything else in `index.js` is written but commented out (not
exported).** This folder exists so Phase 11+ ("Testing" and beyond) has a
real place to put backend work that `firebase/firestore-schema.md` and
`firebase/firestore.rules` already say is coming — most of it isn't part
of what's shipped client-side-only on purpose (see `HANDOFF.md`).
`sendPush` is the one exception: it has nothing client-side to conflict
with (creating the `notifications/{id}` doc stays entirely client-side,
in `js/notifications/notificationService.js`'s `createNotification()` —
this function only adds push delivery on top of that write, see its
comment in `index.js`), so it's safe to deploy without touching any
`js/*Service.js` file.

## What's in `index.js`

- **`sendPush` (Phase 12, active)** — sends a real FCM push whenever a
  `notifications/{id}` doc is created, to every token in that recipient's
  `users/{uid}.fcmTokens` (saved client-side by `js/notifications/push.js`'s
  `enablePush()`). Prunes tokens FCM reports as dead. See the repo root's
  `MANUAL_SETUP.md` → "Web push notifications (FCM)" for the console setup
  this needs before deploying (VAPID key, Blaze plan).
- **Counter maintenance** (example: recipe like counts, commented out) — the
  plan to move `likeCount`/`commentCount`/`followerCount`/etc. off client-side
  transactions (in `js/feed/feedService.js`, `js/recipes/recipeService.js`,
  `js/profile/profileService.js`) and onto Firestore triggers, so a client
  can't desync or fake a counter.
- **Server-side notification creation** (example: follow notifications,
  commented out) — the same move for
  `js/notifications/notificationService.js`'s `createNotification()`, so a
  client can't spoof `actorId`/`actorName` on someone else's behalf.
- **Account deletion** (commented out) — referenced by
  `firebase/firestore.rules` (`users/{uid}`'s `allow delete: if false`
  comment) but not implemented; left commented out because it's
  incomplete, not because of double-firing (see the comment above it in
  `index.js`).

## Before you deploy the COMMENTED-OUT functions

Uncommenting and deploying a trigger while its client-side equivalent is
still live will double-count (e.g. a like would increment `likeCount`
twice — once from the client transaction, once from the new trigger).
`sendPush` above is NOT in this category — deploy it whenever, independent
of the rest. For each of the other, still-commented functions you turn on:

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
- For `sendPush` specifically: a VAPID key from Firebase console → Cloud
  Messaging (see root `MANUAL_SETUP.md`) — the function itself needs no
  extra config beyond that, since it authenticates as the project via the
  Admin SDK's default credentials.

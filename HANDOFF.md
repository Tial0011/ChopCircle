==========================
PROJECT HANDOFF SUMMARY
==========================

Current Phase: 10 (Notifications) — COMPLETE. Phase 11 (Testing) is next
and is blocked on manual setup a human has to do outside this repo — see
TESTING_PHASE_SETUP.md, which is now the entry point for that phase.

==========================
WHAT SHIPPED THIS SESSION (finishing Phase 10)
==========================

Picked up from the previous session's partial handoff (data layer +
header controller were already done) and completed PENDING steps 1-5:

1. firebase/firestore-schema.md — updated BEFORE anything else, per the
   previous handoff's instruction. `notifications/{notificationId}` now
   documents `actorName`, `actorPhotoURL`, `targetPreview`, and the
   widened `targetType` enum (added `"user"` for follow notifications).
   `chats/{chatId}` now documents `lastMessageStatus`.

2. css/components/header-auth.css — NEW. Avatar button + image, notif-bell
   icon button, the notif-bell-wrap `.badge` (small circular unread
   count, positioned absolute top-right of the bell), a shared
   `.dropdown-panel` shell used by both `#notif-dropdown` and
   `#account-dropdown`, `.notif-item`/`.notif-item--unread`/
   `.notif-item__dot` row styling (mirrors `.chat-list__item`'s
   avatar + two-line layout), `.messages-badge` (small dot on the
   Messages nav link), and `.mobile-account-links` (the plain-link-list
   style for the mobile drawer's auth-user block — see the design
   decision below). Added `--z-dropdown: 300` to css/base/tokens.css
   (between `--z-header` and `--z-modal`, same "claim an unclaimed
   token" move `--z-toast` used in Phase 9) and a `.text-xs` utility to
   css/base/typography.css (was referenced by notificationItem.js but
   didn't exist — real gap, not a Phase 10 addition, fixed while in
   the area). Both files' imports added to css/style.css.

3. pages/notifications.html + js/notifications/notifications-page.js —
   NEW. Full-history equivalent of the bell dropdown: requireAuth(),
   listenNotifications() for the full 30, markAllRead() on load, empty
   state, rendered via the SAME notificationItemHTML() the bell dropdown
   uses so the two surfaces can't drift. css/pages/notifications.css is
   small — mostly a `.container` + `.card` wrapper around the shared
   `.notif-item` rows. Deliberately NOT added to service-worker.js's
   SHELL_ASSETS, matching the existing "only the home page shell is
   precached" decision from Phase 9.

4. HTML markup — added the `#auth-guest`/`#auth-user` blocks to all 8
   pages with a `.site-header` (index.html, pages/feed.html,
   pages/recipes.html, pages/recipe-details.html, pages/recipe-form.html,
   pages/profile.html, pages/profile-edit.html, pages/chat.html), in
   both `.header-actions` (desktop) and `.mobile-drawer__actions`
   (mobile — recipe-form.html and profile-edit.html didn't have this div
   at all before, it was added). `.messages-badge` spans added to every
   existing "Messages" nav link, in both nav-links and
   mobile-drawer__links, on the 6 pages that have one (index, chat, feed,
   profile, recipe-details, recipes) — skipped on profile-edit/
   recipe-form, which don't link to Messages at all.

   DESIGN DECISION (the one open call flagged in the previous handoff):
   the notif bell + avatar dropdown are DESKTOP-ONLY — `#notif-bell`,
   `#avatar-btn`, `#notif-dropdown`, `#account-dropdown` etc. exist once
   per page, in `.header-actions` only. The mobile drawer's `.auth-user`
   block is a plain link list instead (`.mobile-account-links`: "My
   profile" / "Notifications" / "Log out", no dropdown, no bell/badge
   duplication) — this was the path of least resistance the previous
   session's header.js already assumed (its `$()` calls all target
   single IDs), and it avoids ID collisions between a desktop dropdown
   and a mobile drawer copy of the same widget.

5. js/utils/header.js — extended (not rewritten) to support #4's design
   decision. `wireAvatarMenu()` no longer owns profile-link-href-setting
   or logout-button-wiring directly — those moved to two new
   page-independent functions, `wireAccountProfileLinks()` and
   `wireLogoutButtons()`, which use `$$(".account-profile-link")` /
   `$$(".logout-btn")` (class-based, same plural reasoning as the
   existing guest/user swap) so BOTH the desktop dropdown's link/button
   AND the mobile drawer's plain-list link/button get wired from one
   call, without duplicate IDs. `initAuthHeader()` now calls both
   unconditionally (for any signed-in user, mobile or desktop), then
   `wireAvatarMenu()`/`wireNotifications()` still run to wire the
   desktop-only dropdown behavior when those elements exist.

   Page-controller wiring: `initAuthHeader(user, { basePath })` called
   from every controller right after its existing getCurrentUser()/
   requireAuth() call — js/app.js and js/recipes/recipes-page.js didn't
   call getCurrentUser() at all before this session; that call was added
   to both. All 8 pages plus the new notifications-page.js are wired.

6. service-worker.js — the Phase 9 comment speculating Phase 10 "will
   likely add a push/notificationclick handler" was updated to state the
   actual decision made last session: real web push needs a backend
   (VAPID keys + FCM send calls) this app doesn't have, so in-app
   notifications (bell/badge/page, all live via onSnapshot) ship the
   value without that dependency. Now points at /functions and
   TESTING_PHASE_SETUP.md instead of framing it as still-undecided.

==========================
NEW THIS SESSION, BEYOND THE PHASE 10 HANDOFF — FUNCTIONS + PROJECT WIRING
==========================

Two things the user asked for that weren't part of the Phase 10 handoff:

- functions/ — NEW folder, a Cloud Functions scaffold for the Phase 11+
  backend move already documented as the plan in firestore-schema.md and
  firestore.rules ("counters updated client-side for now — Cloud
  Functions once traffic justifies it"). package.json + index.js +
  README.md + .gitignore. Every function in index.js is written but
  commented out (not exported) — turning one on while its client-side
  equivalent (in js/*Service.js) is still active would double-count.
  index.js has one worked example each for: counter maintenance (recipe
  like counts), server-side notification creation (follow notifications),
  and account deletion (referenced by firestore.rules' `users/{uid}`
  delete-rule comment but never implemented — left commented out because
  it's incomplete, not because of double-firing: no cascade-delete of the
  account's recipes/posts/comments/likes/follows/chats yet). See
  functions/README.md for the turn-it-on checklist.

- firebase.json + .firebaserc — NEW, root of the repo. Didn't exist
  before this session despite README.md's existing "firebase deploy
  --only firestore:rules,storage:rules" instructions implying they
  should. `firebase.json` wires hosting (serves the repo root, ignoring
  doc/config files), firestore/storage rules paths, and the functions/
  folder. `.firebaserc` has a placeholder project ID to fill in.
  IMPORTANT: hosting has NO rewrite rules — this is a multi-page site
  (pages/*.html), not a client-side-routed SPA, so a catch-all rewrite to
  index.html would have broken direct navigation to every other page.
  Deliberately left out rather than copied from a SPA template.

- TESTING_PHASE_SETUP.md — NEW, root of the repo. The consolidated
  "everything a human needs to do outside this repo before/during
  testing" checklist the user asked for: Firebase project creation,
  enabling Auth/Firestore/Storage, filling in firebase-config.js and
  .firebaserc, deploying rules, creating the 7 composite indexes (table
  form, sourced from HANDOFF's running list, cross-checked against
  firestore-schema.md), seeding the categories collection (blocked by
  firestore.rules' `allow write: if false` on purpose — needs console or
  a future admin Cloud Function), serving/deploying hosting, and an
  explicitly-optional Functions section pointing at functions/README.md.
  Also lists the known non-setup gaps (verify-email.html/
  forgot-password.html still 404, image uploads still URL-only, no
  manifest screenshots, no update-available UI) so they don't look like
  bugs during testing. MANUAL_SETUP.md (Phase 9's PWA-specific checklist)
  now points to this file at the top rather than duplicating it;
  README.md's project-structure section and file tree updated to list
  both new root files plus functions/.

==========================
DELIBERATELY OUT OF SCOPE (carried over from previous session, still true)
==========================

- Real web push notifications — see service-worker.js's comment and
  functions/README.md. Revisit once/if a Cloud Functions backend exists.
- Share notifications (schema's `type` enum includes "share") — the
  post-card share button has never been wired to do anything.
- Comment/reply notifications on RECIPES — recipe-details.html has no
  comment UI at all; all comment/reply notifications only ever fire with
  targetType "post" as a result. Not a bug, just a ceiling.

==========================
COMPOSITE INDEXES REQUIRED
==========================
Unchanged from previous sessions — nothing this session added a new one.
Full table (with field order) now lives in TESTING_PHASE_SETUP.md §4
rather than duplicated here; firestore-schema.md's "Indexes to create"
section is the other copy, kept in sync with that table.

==========================
PENDING — FULL LIST (unchanged from earlier phases, still true)
==========================
- pages/verify-email.html and pages/forgot-password.html — still not
  built, still linked from the auth pages, still 404 today.
- Image uploads still not wired anywhere in the app (recipe/post/profile
  photo fields all take a URL, not a file picker — storage.rules already
  has rules ready for this).
- Marketing/conversion copy pass on index.html — still NOT started.
- No `screenshots` array in manifest.json (needs a real browser/device).
- No "update available" UI for the service worker.
- functions/ is a scaffold only — nothing in it is deployed, and the app
  works fully without it (all counters/notifications are client-side).

==========================
CODING STANDARDS FOLLOWED (unchanged, kept consistent)
==========================
- ES Modules throughout, async/await, one concern per file, no file over
  ~150 lines. header.js grew slightly this session (new
  wireAccountProfileLinks()/wireLogoutButtons() functions) but stayed
  under the guideline — if Phase 11 testing surfaces a need for more
  page-specific header logic, split it out rather than growing this file
  further, per the previous session's note.
- Notification-raising code still lives in the *Service.js file that owns
  the triggering collection, never the reverse — unchanged, nothing this
  session touched that boundary.
- All colors/spacing/type in new CSS (header-auth.css, notifications.css)
  reference css/base/tokens.css custom properties — no hardcoded hex/px
  values, continuing the existing rule.

==========================
IMPORTANT NOTES FOR THE NEXT CLAUDE INSTANCE
==========================
- Phase 10 is done. Do not re-open it unless the user reports a specific
  bug — HANDOFF.md's job now is Phase 11 (Testing), which starts with a
  human working through TESTING_PHASE_SETUP.md, not more code changes.
- If asked to "start testing," the honest first move is confirming with
  the user whether TESTING_PHASE_SETUP.md's steps 1-5 (Firebase project,
  config, rules, indexes, seeded categories) are actually done yet — the
  app will fail in ways that look like bugs (empty category chips, every
  Firestore query throwing a console error with an index-creation link,
  Google sign-in erroring) if they aren't, and that's setup, not a code
  regression to chase.
- If asked to move a counter or a notification server-side, start from
  functions/README.md's checklist — the double-counting trap (client AND
  server both incrementing) is the one mistake to actively avoid there.
- Continue using this same HANDOFF.md format at the end of your session.

Continue from: TESTING_PHASE_SETUP.md, starting at §1 (Create the
Firebase project) — this is a human-in-the-loop phase, not a
Claude-alone one; the next session's job is mostly supporting whoever
works through that checklist, not writing more app code.

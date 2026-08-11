==========================
PROJECT HANDOFF SUMMARY
==========================

Current Phase: 11 (Testing) — IN PROGRESS. This session added a repost
feature, removed default/fake profile photos in favor of a plain
silhouette icon (with existing posts/comments now syncing to a new photo
on profile edit), and fixed the PWA install banner re-prompting behavior.
See "THIS SESSION" section near the top for details — READ IT, especially
the Firestore rules note, before this goes further into testing.

==========================
THIS SESSION — REPOST, AVATARS, PWA RE-PROMPT
==========================

1. **Repost button** — previously wired to nothing (`shareCount` displayed
   live but nothing incremented it). Now a real toggle, same shape as the
   like button: `feedService.js`'s `toggleRepostPost(postId, uid)` writes
   a `reposts/{uid}_post_{postId}` tracking doc (deterministic id, same
   trick as `likes`) AND creates an actual repost post in `posts`
   (authorId = reposter, `sharedPostId`/`sharedPost` pointing at/snapshotting
   the original — see firebase/firestore-schema.md's updated `posts` and
   new `reposts` sections). `postCard.js` renders any post with
   `sharedPostId` set as a "🔁 X reposted" card wrapping the original
   instead of normal caption/media. Un-reposting deletes that repost post
   again. Raises a "share" notification for the original author (not on
   un-repost, not on reposting your own post) — `notificationService.js`'s
   `notificationText()` was missing a `"share"` case entirely (fell
   through to a vague "interacted with you"); added.
   **⚠️ ACTION NEEDED:** `firebase/firestore.rules` got a new `reposts`
   match block. Per this file's existing "Caution" notes, rules are
   pasted directly into the Firebase console, not deployed via CLI — copy
   the updated rules file into the console before repost writes will
   actually pass security rules live.

2. **No more default/fake profile photos** — every place that fell back
   to a randomly-generated `i.pravatar.cc` photo per user id (header
   avatar, post/comment authors, chat list, notifications, featured
   creators, recipe author) now falls back to one shared plain silhouette
   icon instead (`js/utils/avatar.js`'s `avatarSrc()`), same "no photo ⇒
   generic person icon" convention as Facebook/most social apps, rather
   than a fake photo standing in for "no photo set."

3. **Profile photo updates now reach the feed** — posts/comments
   denormalize `authorName`/`authorPhotoURL` at write time (read-speed
   trade-off, see schema doc), which meant a profile picture change never
   showed up on anything already posted. `profileService.js`'s
   `updateUserProfile()` now also fans the new name/photo out to every
   post and comment that uid has authored (batched, fire-and-forget so
   the edit page doesn't block on it). Not yet extended to `chats`
   (`participants` also denormalizes photoURL) or past `notifications`
   rows — same trade-off, just not done this session; flagging as a gap.

4. **PWA install banner now re-prompts** — "Not now" previously wrote a
   `localStorage` flag that suppressed the banner forever. It no longer
   persists anything on dismiss — the banner just closes for that view
   and comes back on the next page load/visit. Only an actual install
   (the `appinstalled` event) is still persisted, so someone who's
   already installed the app doesn't keep getting asked.

5. **Index hero CTA hides "Start cooking free" for signed-in visitors** —
   that button (`#hero-start-cooking` in index.html) is removed by
   `js/app.js` once `getCurrentUser()` resolves to a logged-in user,
   leaving just "Explore recipes" — no point pitching a signup CTA at
   someone who already has an account.

6. **Verify-email page now mentions spam/junk** — a static line under the
   existing "we sent a verification link" text on pages/verify-email.html
   ("Don't see it? Check your spam or junk folder…"). Deliberately a
   separate `<p>`, not appended into `#verify-email-lede` — that element's
   text gets overwritten client-side in `verify-email-page.js` (it
   re-renders with the user's actual email), which would've wiped out
   anything appended into it.

==========================
DEPLOYMENT — WHAT'S ACTUALLY LIVE
==========================

- Hosted on **Netlify**, connected to a **GitHub** repo, auto-deploying on
  push to main. Custom domain layered on top of the netlify.app subdomain.
  `firebase.json`'s `hosting` block (written for Firebase Hosting) is
  unused but harmless — left in place rather than removed, in case Netlify
  is ever swapped back out.
- Firebase project in use is an **existing project that predates
  ChopCircle** (its name suggests it may be used for something unrelated,
  possibly named after "MBBS Financial"), reused rather than created
  fresh, because project creation was having trouble on the user's end.
  This is flagged, not resolved — see README.md's "Caution on the Firebase
  project in use" section for the two specific risks (rules possibly
  overwritten, collection-name collisions) and confirm with the user
  before this goes further into testing if it hasn't come up again.
- Auth (Email/Password + Google), Firestore, and Storage are all enabled
  and rules are deployed (pasted directly into the console's rules editor,
  not via CLI — so remember local `firebase/*.rules` and the live rules
  can drift if one gets edited without the other going forward).
- Composite indexes were deliberately NOT pre-created — the user chose to
  let Firestore's own error links create them on demand as real queries
  hit them during testing, rather than front-loading all 7 from
  TESTING_PHASE_SETUP.md §4. None have come up as broken yet; if a
  "the query requires an index" error surfaces, that table is still the
  reference for which fields/order to expect.
- `categories` collection: seeding status wasn't re-confirmed this
  session — if the home page's category chips or the recipe form's
  category dropdown render empty, that's the first thing to check.

==========================
BUGS FOUND DURING TESTING THIS SESSION, AND FIXES SHIPPED
==========================

1. **`Failed to resolve module specifier "firebase/app"`** — the
   browser couldn't load the app at all. Root cause: `firebase/
   firebase-config.js` had been overwritten with the Firebase console's
   default npm/bundler-style snippet (`import { initializeApp } from
   "firebase/app"`), which needs a bundler this project doesn't have —
   AND it was actually a copy-paste of the wrong project's config
   entirely (the pre-existing project's original snippet, mixing in a
   `databaseURL` and `measurementId` this project doesn't use). Fixed by
   reducing the file back down to just the plain `export const
   firebaseConfig = { ... }` object with the six fields this app
   actually reads (`js/firebase/firebase-init.js` is the only file that
   imports it and calls `initializeApp()`). Documented as a "watch for
   this" pitfall in README.md's Getting Started, since the Firebase
   console's default copy button produces the broken snippet, not the
   working one.

2. **`pages/verify-email.html` 404'd mid-signup** — signup.js redirects
   here after `sendEmailVerification()`, but the page never existed (it
   was on TESTING_PHASE_SETUP.md's "known gaps" list as a someday-item,
   then became a live-breaking bug once real signups were being tested).
   Built pages/verify-email.html + js/auth/verify-email-page.js:
   shows "check your inbox", an "I've verified — continue" button that
   calls `user.reload()` (Firebase doesn't push emailVerified changes to
   an open tab — this is the only way to pick up the change without the
   user leaving and coming back), a resend button with a 60s soft
   cooldown, and a logout-and-restart link. Redirects to feed.html
   automatically via onAuthStateChanged if the user is already verified
   on page load (e.g., they verified, closed the tab, came back later).
   `pages/forgot-password.html` is the other 404 on that same "known
   gaps" list — still not built, still just a future gap for now, not
   yet hit live the way verify-email was.

3. **Repeated `FAILED_PRECONDITION` / `400` errors piling up on post
   likes** — `js/feed/postCard.js`'s like button had NO guard against
   rapid/double clicks (unlike the recipe page's like button, which
   already had one). Each click fired a fresh `toggleLikePost()`
   transaction immediately, so fast clicking raced several transactions
   against the same document, each invalidating the next's read version.
   Fixed with a `likePending` flag that ignores clicks while one is in
   flight. First pass used `likeBtn.disabled = true` during the wait
   (matching the recipe page's existing pattern) — the user pushed back
   that waiting on a full transaction round-trip before showing any
   change would feel laggy, which was a fair critique of the EXISTING
   recipe-page pattern too, not just the new fix. Both like buttons
   (postCard.js AND recipe-details-page.js) were then rewritten to
   optimistic-update: flip the icon/count instantly on click, let the
   transaction resolve underneath, roll back only if it actually fails.

==========================
REAL-TIME PASS (feed likes/comments/shares) — THIS SESSION
==========================

User asked to make likes/comments/shares update live for everyone
watching, not just the person who clicked. Added to feedService.js:

- `listenPost(postId, callback)` — live post doc (likeCount/commentCount/
  shareCount).
- `listenUserLikedPost(postId, uid, callback)` — live liked/unliked state
  for one user (syncs the heart icon across tabs/devices).
- `listenComments(parentType, parentId, callback)` — live comment list,
  replacing the one-time `listComments()` fetch as postCard.js's comment
  panel's data source (`listComments()` itself was kept, unused now, in
  case a future non-live use case wants it — see its own updated
  doc-comment).

All three follow the exact `listenX(id, callback) → unsubscribe`
convention chatService.js's `listenMessages()`/`listenUserChats()` and
notificationService.js's `listenNotifications()` already established —
no new convention introduced.

**The one real subtlety, worth understanding before touching this again:**
Firestore's local cache gives an INSTANT echo of your own writes to any
listener on the same document — but only for plain `set()`/`update()`/
`addDoc()` calls, NOT for writes made inside `runTransaction()`. Both
`toggleLikePost()` and `toggleLikeRecipe()` use a transaction (to keep
`likeCount` accurate under concurrent likes), so `listenPost()`/
`listenUserLikedPost()` only reflect YOUR OWN like/unlike once the server
actually confirms it — same round-trip delay as before, just now also
visible to a live listener. Left un-gated, this would flicker: the manual
optimistic update flips the icon, then a moment later a stale snapshot
event (still showing the pre-write state) briefly flips it back, then the
real update corrects it again. postCard.js's `likePending` flag now gates
BOTH the manual optimistic update's own click handler AND the live
listener's rendering — the listener still tracks the latest server value
in a variable the whole time, it just doesn't paint the DOM with it until
`likePending` clears, at which point it repaints from whatever the most
recent value actually was (so it's still eventually consistent, just
without the visible flicker). `addComment()` uses a plain write, so
`listenComments()` needed no such gating — new comments (including your
own) render instantly.

`feed-page.js` changed too: `initPostCard()` now returns a `cleanup()`
function (unsubscribes all 2-3 listeners a card started). `feed-page.js`
tracks these in a `cardCleanups` array and calls them before any non-
append re-render of the feed list — not a scenario the app currently
triggers (pagination only ever appends), but correct now instead of
silently leaking listeners on removed DOM nodes if a refresh feature is
ever added.

**Share button still does nothing** — `shareCount` is now wired to
display live (via `listenPost()`), matching like/comment, but nothing in
the app increments it. This was a known gap before this session
(`postCard.js`'s share button has never been functional) and remains one
— the real-time wiring is just "ready" for whenever that gets built.

==========================
DELIBERATELY OUT OF SCOPE (carried over, still true)
==========================

- ~~Real web push notifications~~ — done, Phase 12. See
  `js/notifications/push.js`, `service-worker.js`'s `push`/
  `notificationclick` handlers, and `functions/index.js`'s `sendPush`.
  Needs the manual Firebase console setup in `MANUAL_SETUP.md` §6 (VAPID
  key, Blaze plan, function deploy) before it actually delivers anything.
- Share button functionality (see above).
- Comment/reply notifications on RECIPES — recipe-details.html still has
  no comment UI.

==========================
PENDING — FULL LIST
==========================
- **`pages/forgot-password.html`** — still not built, still linked from
  login.html, not yet hit live (verify-email.html was the same kind of
  gap and became urgent the moment real signups happened — this one will
  likely do the same the first time someone tests password reset).
- Image uploads still not wired anywhere (recipe/post/profile photo
  fields all take a URL, not a file picker).
- Marketing/conversion copy pass on index.html — still not started.
- No `screenshots` array in manifest.json.
- No "update available" UI for the service worker.
- functions/ is still a scaffold only, nothing deployed.
- Confirm the Firebase-project-reuse risk from the Deployment section
  above with the user if it hasn't come up again.
- Composite indexes: watch for "the query requires an index" errors as
  more of the app gets exercised (recipe filtering, chat list, comments)
  — the reference table is TESTING_PHASE_SETUP.md §4.

==========================
CODING STANDARDS FOLLOWED (unchanged, kept consistent)
==========================
- ES Modules throughout, async/await, one concern per file.
  feedService.js and postCard.js both grew this session (3 new listener
  functions; postCard.js's like/comment logic got notably more detailed
  for the optimistic-update + gating behavior) — still each under the
  ~150-line guideline, but postCard.js in particular is now dense enough
  that if it grows further, splitting the like-button logic into its own
  small module is worth considering rather than growing this file more.
- `listenX(id, callback) → unsubscribe` convention (from chatService.js/
  notificationService.js) extended into feedService.js rather than
  inventing a new shape.
- All colors/spacing/type in any CSS touched this session already used
  css/base/tokens.css custom properties — nothing new needed.

==========================
IMPORTANT NOTES FOR THE NEXT CLAUDE INSTANCE
==========================
- This app is LIVE. Bugs reported from here forward are real users (or
  the user themself testing) hitting real broken behavior in production,
  not hypothetical edge cases — treat reports with that urgency, and
  don't assume something is "future testing-phase work" if it's actually
  actively blocking someone right now (verify-email.html is the textbook
  example from this session: it was correctly deprioritized in
  TESTING_PHASE_SETUP.md, then became urgent the moment it was actually
  hit).
- When debugging a live report, ask for the browser console output AND,
  for anything involving a failed network request, the actual response
  body (Network tab → click the failed request → Response/Preview) —
  the console stack trace alone often only shows THAT something failed,
  not the server's actual reason why (this is exactly how the
  FAILED_PRECONDITION root cause was found this session).
- If asked to extend the real-time pattern to another part of the app
  (recipes, chat reactions, whatever comes next), read this file's
  "REAL-TIME PASS" section first — the transaction-vs-plain-write local-
  echo distinction is easy to miss and produces a real, user-visible
  flicker bug if skipped.
- Continue using this same HANDOFF.md format at the end of your session.

Continue from: whatever the user reports next from live testing. If
nothing's actively broken, the next planned items are
`pages/forgot-password.html` (same shape of gap as verify-email.html —
build it proactively before it's hit) and confirming the Firebase-
project-reuse question above.

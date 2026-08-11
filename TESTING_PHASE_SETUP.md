# ChopCircle — Manual setup checklist for Testing (Phase 11)

Everything in this file is stuff **no Claude session can do from inside
this repo** — it needs a human with a browser, a Firebase/Google account,
and (for a couple of items) a real phone. Phases 1–10 are code-complete
(see `PLANNING.md`'s phase table); this is the full punch-list of what's
left before the app actually works end-to-end for a real user. Work
through it top to bottom — later sections depend on earlier ones.

---

## 1. Create the Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) →
   **Add project**. Any name/ID is fine, but note the **Project ID** —
   you'll need it twice below.
2. **Upgrade to the Blaze (pay-as-you-go) plan.** Cloud Functions
   (`/functions`) don't run on the free Spark plan at all — you can skip
   this if you're not deploying Functions yet, but Auth/Firestore/Storage
   alone are free-tier friendly, so there's no downside to upgrading now.
3. **Add a Web app** (the `</>` icon on the project overview page) and
   copy the config object it gives you — you'll paste it into
   `firebase/firebase-config.js` in step 3 below.

## 2. Turn on the products the app uses

In the Firebase console, for your new project:

- **Authentication** → Sign-in method → enable **Email/Password** and
  **Google**. For Google sign-in specifically, you'll also be prompted to
  set a support email — any email you control works.
  (Code-side, both are already wired: `js/auth/login.js` and
  `js/auth/signup.js` both call `signInWithPopup()` with
  `GoogleAuthProvider` already.)
- **Firestore Database** → Create database → start in production mode
  (the real rules get deployed in step 4, not the defaults).
- **Storage** → Get started → same production-mode choice.

## 3. Fill in the real config

Open `firebase/firebase-config.js` and replace the three `"YOUR_..."`
placeholders (`apiKey`, `messagingSenderId`, `appId`) with the values from
step 1.3. `authDomain`/`projectId`/`storageBucket` are already filled in
with the placeholder project ID `chopcircle-app` — update those three too
if your real Project ID is different.

Also open `.firebaserc` in the repo root and replace
`"YOUR_FIREBASE_PROJECT_ID"` with your real Project ID — the Firebase CLI
uses this file to know which project `firebase deploy` targets.

## 4. Install the Firebase CLI and deploy rules + indexes

```
npm install -g firebase-tools     # if you don't already have it
firebase login
firebase deploy --only firestore:rules,storage:rules
```

This deploys `firebase/firestore.rules` and `firebase/storage.rules` —
both already written and reviewed (see those files' comments for the
reasoning behind each collection's rule). `firebase.json` in the repo
root already points at both files' paths, so no extra config is needed.

### Composite indexes

Firestore will refuse certain queries until their composite index exists.
Create these now rather than waiting to hit the console error link
mid-testing (Firestore console → Firestore Database → Indexes → Composite
→ Create index):

| Collection | Fields |
|---|---|
| `recipes` | `category` Asc, `createdAt` Desc |
| `recipes` | `category` Asc, `likeCount` Desc |
| `recipes` | `authorId` Asc, `createdAt` Desc |
| `posts` | `authorId` Asc, `createdAt` Desc |
| `comments` | `parentType` Asc, `parentId` Asc, `createdAt` Asc |
| `notifications` | `recipientId` Asc, `createdAt` Desc |
| `chats` | `participantIds` Array-contains, `lastMessageAt` Desc |

(Full detail on each in `firebase/firestore-schema.md`'s "Indexes to
create" section — kept in sync with this list.)

## 5. Seed the `categories` collection

`firestore.rules` deliberately blocks client writes to `categories` (`allow
write: if false` — "seeded/managed via Firebase console or an admin Cloud
Function"). Add the category list from the product brief (Breakfast,
Rice, Soups, Swallow, Drinks, Local Dishes, etc.) as documents by hand in
the Firestore console, matching the shape in
`firebase/firestore-schema.md`'s `categories/{categoryId}` section
(`name`, `slug`, `iconURL`, `sortOrder`). The home page's category chips
and the recipe form's category dropdown both read from this collection —
they'll render empty until it's seeded.

## 6. Serve and test the app itself

```
npx serve .
```

then open the printed `localhost` URL — ES Modules require `http(s)://`,
not opening `index.html` directly via `file://`.

For a real deploy instead of local testing:

```
firebase deploy --only hosting
```

`firebase.json`'s `hosting` block already points at the repo root and
excludes the doc/config files that shouldn't ship (`*.md`,
`firebase.json` itself, `functions/`, dotfiles).

### PWA-specific testing

See `MANUAL_SETUP.md` for the full Phase 9 checklist (HTTPS requirement,
manifest verification, install-flow testing on Android/desktop/iOS,
offline-mode testing, and bumping `CACHE_VERSION` in `service-worker.js`
after any deploy that changes `SHELL_ASSETS`).

## 7. Cloud Functions (optional — not required for the app to work)

`/functions` is a scaffold, not deployed, and nothing in the app currently
depends on it — all counters and notifications work client-side today.
See `functions/README.md` for what's in there and the checklist for
turning any of it on. Skip this section entirely unless you're
specifically moving counter/notification logic server-side.

---

## Known gaps to test around (not blocked on setup — code/content work)

These aren't manual-setup items, just things worth knowing about while
testing so a missing page or feature doesn't look like a bug:

- **`pages/verify-email.html` and `pages/forgot-password.html` don't
  exist yet** — both are linked from the auth pages and currently 404.
- **Image uploads aren't wired anywhere** — recipe/post/profile photo
  fields all take a URL, not a file picker, despite `storage.rules`
  already having rules ready for `users/`, `recipes/`, `posts/`, and
  `chats/` paths.
- **No marketing/conversion copy pass on `index.html` yet** — content is
  placeholder-quality in a few sections.
- **No `screenshots` array in `manifest.json`** — needs real captured
  screenshots (can't be generated from inside the repo); optional, only
  affects the richer desktop Chrome install prompt.
- **No "update available" UI for the service worker** — a hard refresh
  always picks up the newest deploy, but there's no in-app toast telling
  a returning visitor with a stale tab that one's available.
- **Real web push notifications were deliberately not built** in Phase
  10 — in-app notifications (bell, badge, `pages/notifications.html`) are
  live via `onSnapshot()` instead. See `service-worker.js`'s comment for
  why, and `functions/README.md` if you decide to revisit this once a
  Functions backend exists.

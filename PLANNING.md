# ChopCircle — Project Planning (Phase 1)

## Name
**ChopCircle** — "chop" is Nigerian pidgin for "eat/food," "circle" is the community
of people around a pot. Reads as native to the Nigerian market, scales globally
without translation, and the mark (a scalloped pot-rim circle) doubles as a logomark.

## Vision
A food-first social network: Pinterest's save-and-discover model + Instagram's feed
+ Cookpad's structured recipe data + Facebook Groups' community layer — built for
how Nigerians actually cook and share food, architected so international recipes,
AI features, and monetization can be layered in later without a rewrite.

## Design system (token summary — full values in css/base/tokens.css)
- **Palette:** `--color-pepper #E8542A` (primary — tomato-stew orange-red, not a
  generic terracotta), `--color-cream #FBF2E3`, `--color-charcoal #2B241E`
  (warm near-black, not pure gray), `--color-palm #3D7A46` (fresh green),
  `--color-egusi #D9A441` (golden accent — ratings/sponsored).
- **Type:** Fraunces (display, used sparingly for headlines/quotes) + Inter (body/UI)
  + IBM Plex Mono (utility — servings, cook time, timestamps, nutrition figures).
- **Signature element:** a scalloped "pot-rim" divider (SVG, repeating arcs) used
  between major sections instead of a straight rule or generic blob-wave — ties the
  visual language literally to a cooking pot / plate edge.
- **Cards:** rounded 16–20px, soft two-layer shadow, glass surface only on
  overlays (modals, nav-on-scroll) — not on every card, to keep food photography
  the focus per the brief.

## Firestore data model (see firebase/firestore-schema.md for full detail)
Top-level collections: `users`, `recipes`, `posts`, `comments`, `follows`,
`likes`, `savedCollections`, `notifications`, `chats`/`messages`, `categories`.
Denormalized counters (likeCount, commentCount, followerCount) on parent docs,
kept in sync via batched writes / Cloud Functions triggers (future) so feed
queries never require aggregation reads.

Real-time (`onSnapshot`) is used for anything another user's action should
update live without a refresh: chats, notifications, and (as of the Phase
11 testing pass) feed post likes/comments/shares. One caveat that matters
if this pattern gets extended further: Firestore's local-cache "instant
echo" for your own writes only applies to plain `set`/`update`/`addDoc`
calls — a write made inside `runTransaction()` (used for both
`toggleLikePost()` and `toggleLikeRecipe()`, to keep counters accurate
under concurrent likes) does NOT get that echo, so a live listener on the
same document only reflects it once the server confirms. Both toggle
functions' callers handle this with a manual optimistic UI update gated
behind a pending-flag, rather than trusting the listener alone — see
`js/feed/postCard.js`'s header comment for the full reasoning.

## Phase status
| Phase | Status |
|---|---|
| 1. Planning | ✅ Done (this doc) |
| 2. Folder structure | ✅ Done |
| 3. UI components (design system + home) | ✅ Done |
| 4. Authentication (UI + Firebase wiring) | ✅ Done |
| 5. Recipes | ✅ Done |
| 6. Social feed | ✅ Done |
| 7. Profiles | ✅ Done |
| 8. Chat | ✅ Done |
| 9. PWA (installability + manual setup checklist) | ✅ Done |
| 10. Notifications | ✅ Done |
| 11. Testing | 🚧 In progress — deployed on Netlify, real users/data flowing; several bugs found and fixed live (see HANDOFF.md). `forgot-password.html` is the one known 404 still outstanding. |
| 12. Optimization | ⏳ Not started |

Cross-cutting passes (not tied to one phase number, applied opportunistically
as the app grows): mobile responsiveness/nav, and marketing/conversion copy
on the public pages. Current status of each is in HANDOFF.md.

See `HANDOFF.md` for the detailed continuation brief.

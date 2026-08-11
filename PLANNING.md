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
| 11. Testing | ⏳ Not started — see `TESTING_PHASE_SETUP.md` for the manual setup this phase needs first |
| 12. Optimization | ⏳ Not started |

Cross-cutting passes (not tied to one phase number, applied opportunistically
as the app grows): mobile responsiveness/nav, and marketing/conversion copy
on the public pages. Current status of each is in HANDOFF.md.

See `HANDOFF.md` for the detailed continuation brief.

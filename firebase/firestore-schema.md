# ChopCircle — Firestore Schema (Phase 1 design)

Denormalize for read speed; the feed and profile pages are read-heavy.
Counters are updated via transactions client-side for now — plan to move
to Cloud Functions triggers once traffic justifies it (Phase 11+).

## `users/{uid}`
```
displayName: string
email: string
photoURL: string | null
coverURL: string | null
bio: string
followerCount: number
followingCount: number
recipeCount: number
postCount: number
createdAt: timestamp
fcmTokens: string[]        (Phase 12 — web push, added by js/notifications/push.js)
```
`fcmTokens` (Phase 12) holds every browser/device FCM registration token
this user has granted push permission on — a plain array rather than a
single field because the same person can be signed in on a phone and a
laptop at once. `js/notifications/push.js`'s `enablePush()` appends to it
with `arrayUnion` (never overwrites); the `sendPush` Cloud Function
(`functions/index.js`) reads it to know where to deliver. A token FCM
reports back as invalid (uninstalled app, revoked permission, expired) is
removed with `arrayRemove` from inside that function. Absent entirely for
any user who has never opted in — always guard with `|| []`.

## `recipes/{recipeId}`
```
authorId: string          -> users/{uid}
title: string
description: string
coverImageURL: string
galleryURLs: string[]
videoURL: string | null   -> a short 20-30s cook-along clip, uploaded via
                             js/utils/videoUpload.js (recipes/{uid}/{file}
                             in Storage). Optional — most recipes won't have
                             one.
ingredients: { id, name, amount, unit }[]
steps: { id, order, text }[]
cookTimeMinutes: number
difficulty: "easy" | "medium" | "hard"
servings: number
nutrition: { calories, protein, carbs, fat } | null
category: string          -> matches categories/{id}
likeCount: number
commentCount: number
saveCount: number
isSponsored: boolean
createdAt: timestamp
updatedAt: timestamp
```

## `posts/{postId}`
```
authorId: string
caption: string
imageURLs: string[]
mentions: string[]        -> uids
hashtags: string[]
likeCount: number
commentCount: number
shareCount: number
createdAt: timestamp
sharedPostId: string | undefined   -> posts/{originalPostId}, only present on a repost
sharedPost: { authorId, authorName, authorPhotoURL, caption, imageURLs, createdAt } | undefined
```
`sharedPostId`/`sharedPost` (repost pass) are only set on a post created by
`toggleRepostPost()` (`js/feed/feedService.js`) — a repost is a real post
doc (own `id`, `authorId` = the reposter, empty `caption`/`imageURLs` of
its own) that additionally carries a denormalized snapshot of the
original post it's sharing, same read-speed trade-off as `authorName`/
`authorPhotoURL` above. `postCard.js` renders any post with `sharedPostId`
set as a "🔁 reposted" card wrapping that snapshot instead of the normal
caption/media. The original's `shareCount` is incremented/decremented
alongside — see the `reposts` collection below for the toggle/undo
tracking doc.

## `comments/{commentId}`
```
parentType: "recipe" | "post"
parentId: string
authorId: string
text: string
replyToCommentId: string | null
createdAt: timestamp
```

## `likes/{likeId}`  (id = `${uid}_${parentType}_${parentId}`)
```
uid: string
parentType: "recipe" | "post" | "comment"
parentId: string
createdAt: timestamp
```
Deterministic doc IDs make "did I already like this" a single doc read
and prevent duplicate likes without a query.

## `reposts/{repostId}`  (id = `${uid}_post_${postId}`)
```
uid: string
postId: string             -> posts/{originalPostId}
repostPostId: string        -> posts/{repostId}, the actual repost doc this tracks
createdAt: timestamp
```
Deterministic doc IDs, same "did I already do this" single-read pattern as
`likes` — `toggleRepostPost()` uses this doc's existence to decide whether
a tap on the share button reposts or un-reposts, and (on un-repost) reads
`repostPostId` off it to find and delete the repost post it created.

## `follows/{followId}`  (id = `${followerId}_${followingId}`)
```
followerId: string
followingId: string
createdAt: timestamp
```

## `savedCollections/{collectionId}`
```
ownerId: string
name: string
recipeIds: string[]
isPrivate: boolean
createdAt: timestamp
```

## `notifications/{notificationId}`
```
recipientId: string
type: "like" | "follow" | "comment" | "reply" | "share" | "message"
actorId: string
actorName: string
actorPhotoURL: string | null
targetType: "recipe" | "post" | "comment" | "user" | "chat"
targetId: string
targetPreview: string
isRead: boolean
createdAt: timestamp
```
`actorName`/`actorPhotoURL` are denormalized onto the doc at write time
(Phase 10) — same read-speed trade-off as `authorName` on
posts/recipes/comments, applied here so rendering N notification rows
never means N extra `users` reads. `targetPreview` is a short snippet of
the liked/commented-on content (a recipe title, a post caption excerpt)
for the same reason. `targetType: "user"` (Phase 10 addition to the
original 3-value enum) is used for follow notifications, where `targetId`
is set to the actor's own uid — see `js/profile/profileService.js`'s
`toggleFollow()`.

## `chats/{chatId}`  (id = sorted `${uidA}_${uidB}`)
```
participantIds: string[]
participants: { [uid]: { displayName: string, photoURL: string | null } }
lastMessage: string
lastMessageAt: timestamp
lastSenderId: string | null
lastMessageStatus: "sent" | "seen" | null
```
`participants` denormalizes both users' displayName/photoURL onto the chat
doc at creation time (Phase 8) — same read-speed trade-off as authorName on
`posts`/`recipes`, applied here so the conversation list never needs an
extra profile read per row. `lastMessageStatus` (Phase 10 addition) lets
the header's Messages nav badge (`js/utils/header.js`) work off the
existing `listenUserChats()` call instead of opening every thread to check
for unread messages — `sendMessage()` sets it to `"sent"`,
`markThreadSeen()` always flips it to `"seen"` when it runs (safe because
it only ever runs while that thread is the one currently open, see
`js/chat/chatService.js`).
### `chats/{chatId}/messages/{messageId}`
```
senderId: string
text: string | null
imageURL: string | null
audioURL: string | null    (Phase 12 — voice notes)
audioDurationSec: number | null
status: "sent" | "delivered" | "seen"
createdAt: timestamp
```
A message carries exactly one of `text`/`imageURL`/`audioURL` (the other
two are `null`) — same "denormalize per kind rather than a generic
`type` + `payload` blob" shape the rest of this schema already uses.
`audioDurationSec` is read off the recorded `Blob` client-side before
upload (see `js/chat/chatMedia.js`) so the bubble can show a length
without loading the audio first.

## `categories/{categoryId}`
```
name: string
slug: string
iconURL: string
sortOrder: number
```

## Indexes to create (Firestore console → Indexes)
- `recipes`: composite on `category ASC, createdAt DESC`
- `recipes`: composite on `likeCount DESC` (trending)
- `recipes`: composite on `authorId ASC, createdAt DESC` (profile page's "their recipes" tab — Phase 7)
- `posts`: composite on `authorId ASC, createdAt DESC`
- `comments`: composite on `parentType ASC, parentId ASC, createdAt ASC`
- `notifications`: composite on `recipientId ASC, createdAt DESC`
- `chats`: composite on `participantIds ARRAY-CONTAINS, lastMessageAt DESC` (Phase 8 — chat-page.js's conversation list)

## Future AI features (no restructure needed)
`recipes` documents already carry structured `ingredients`/`nutrition` —
an ingredient-substitute or meal-planner feature reads these fields
directly. A future `aiGenerations/{id}` collection can log
prompt/response pairs without touching existing collections.

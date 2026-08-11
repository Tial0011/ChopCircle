// ChopCircle — shared "no profile photo" fallback
// No user is ever assigned a default/random profile photo (photoURL stays
// `null` in Firestore until they actually upload one) — every place in the
// app that renders an avatar falls back to this single neutral silhouette
// icon instead, the same way Facebook/most social apps show a plain
// person-outline rather than a random stock photo for accounts with no
// picture set. Previously several files fell back to a different
// i.pravatar.cc-generated fake photo per user id — replaced everywhere
// with this one shared icon so "no photo" actually looks like no photo.
const SILHOUETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="#dde3e9"/>
  <circle cx="48" cy="38" r="18" fill="#a7b0ba"/>
  <path d="M48 60c-20 0-36 11.5-36 27v3a6 6 0 0 0 6 6h60a6 6 0 0 0 6-6v-3c0-15.5-16-27-36-27z" fill="#a7b0ba"/>
</svg>`;

export const DEFAULT_AVATAR = "data:image/svg+xml;utf8," + encodeURIComponent(SILHOUETTE_SVG);

/** Returns `photoURL` if the user has one, else the shared silhouette placeholder. */
export function avatarSrc(photoURL) {
  return photoURL || DEFAULT_AVATAR;
}

// ChopCircle — Thumbnail URL helper
// Pairs with functions/index.js's generateThumbnail(): whenever an image is
// uploaded to users/recipes/posts, that Cloud Function drops a ~720px-wide
// copy next to the original named `thumb_<originalFileName>`. This module
// just does the URL rewrite from "original" to "its thumbnail" so cards/
// grids can request the small copy instead of the up-to-8MB original.
//
// Deliberately a pure string rewrite, not a Firestore read — recipes/posts
// only ever store the ORIGINAL's URL (imageUpload.js writes that
// synchronously, before the thumbnail exists), so there's no thumbnail URL
// to read from the doc. This derives it on the fly instead.

/**
 * @param {string|null|undefined} originalURL a Storage download URL, e.g.
 *   from recipe.coverImageURL, post.imageURLs[i], or user.photoURL
 * @returns {string|null} the matching thumbnail URL, or null if `originalURL`
 *   isn't a recognizable Storage download URL (falls back to the original
 *   in that case — see attachThumbnail() below).
 */
export function thumbnailURL(originalURL) {
  if (!originalURL) return null;
  try {
    const url = new URL(originalURL);
    const match = url.pathname.match(/^(.*\/o\/)(.+)$/);
    if (!match) return null;
    const [, prefix, encodedPath] = match;
    const objectPath = decodeURIComponent(encodedPath);
    const segments = objectPath.split("/");
    const fileName = segments.pop();
    if (fileName.startsWith("thumb_")) return originalURL; // already a thumbnail
    segments.push(`thumb_${fileName}`);
    url.pathname = prefix + encodeURIComponent(segments.join("/"));
    // The original URL's download token is specific to that exact file —
    // it won't authorize the thumbnail. Drop it and rely on storage.rules'
    // public read on users/recipes/posts instead (see firebase/storage.rules).
    url.searchParams.delete("token");
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Wires an <img> to load the thumbnail first, falling back to the full
 * original if the thumbnail 404s (not generated yet — the Cloud Function
 * runs asynchronously right after upload — or generation failed). Use this
 * anywhere an image renders at card/grid size: recipeCard.js, postCard.js,
 * avatar rendering, render-creators.js, render-trending.js.
 * @param {HTMLImageElement} img
 * @param {string} originalURL
 */
export function setThumbnailSrc(img, originalURL) {
  if (!img || !originalURL) return;
  const thumb = thumbnailURL(originalURL);
  if (!thumb) {
    img.src = originalURL;
    return;
  }
  img.addEventListener("error", () => { img.src = originalURL; }, { once: true });
  img.src = thumb;
}

// Global fallback for every OTHER place a thumbnail URL gets set directly
// as an <img src="...">/`.src =` (avatar.js's avatarSrc(), and anywhere
// that uses it) without going through setThumbnailSrc() above — e.g. a
// template-string `<img src="${avatarSrc(...)}">`. `error` doesn't bubble,
// but it's still catchable in the capture phase on a shared ancestor, so
// one listener here covers every page rather than needing per-call-site
// wiring. Recovers by stripping the `thumb_` prefix thumbnailURL() added,
// falling back to the original file — covers the brief window right after
// upload before generateThumbnail() has run, or if it ever fails outright.
// `dataset.thumbFallback` guards against retrying more than once if the
// original itself 404s for some unrelated reason.
if (typeof document !== "undefined") {
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.src.includes("thumb_")) return;
      if (img.dataset.thumbFallback) return;
      img.dataset.thumbFallback = "1";
      img.src = img.src.replace("thumb_", "");
    },
    true
  );
}

// ChopCircle — Shared formatting helpers

/**
 * Formats a Firestore Timestamp (or Date, or null while serverTimestamp()
 * is still pending) as a short relative string ("2h", "3d", "just now").
 */
export function relativeTime(timestamp) {
  if (!timestamp) return "just now";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

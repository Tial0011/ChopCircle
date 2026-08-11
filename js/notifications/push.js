// ChopCircle — Web push notifications (Phase 12)
// Client half of real push delivery. The server half is functions/index.js's
// `sendPush` trigger, which fires whenever notificationService.js's
// createNotification() writes a notifications/{id} doc and reads the
// tokens this file saves. In-app notifications (bell + badge +
// pages/notifications.html, all live via onSnapshot — see
// notificationService.js) keep working exactly as before regardless of
// whether push is ever enabled; this is a purely additive "also buzz my
// phone when the tab isn't open" layer on top.
//
// Needs a VAPID key from the Firebase console before enablePush() will
// succeed — see MANUAL_SETUP.md's "Web push notifications (FCM)" section.
// The placeholder below fails with a clear, caught error rather than a
// cryptic SDK exception if that step hasn't been done yet.
import { getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import app, { db } from "../firebase/firebase-init.js";

// PASTE the "Web Push certificate" key pair value from Firebase console →
// Project settings → Cloud Messaging → Web configuration here. See
// MANUAL_SETUP.md — this is the one manual step that can't be done from
// inside this repo.
const VAPID_KEY = "REPLACE_WITH_YOUR_FIREBASE_VAPID_KEY";

/** @returns {Promise<boolean>} whether this browser can receive web push at all. */
export async function isPushSupported() {
  try {
    return "Notification" in window && "serviceWorker" in navigator && (await isSupported());
  } catch {
    return false;
  }
}

/** @returns {"default"|"granted"|"denied"} the current browser permission state, without prompting. */
export function pushPermissionState() {
  return "Notification" in window ? Notification.permission : "denied";
}

/**
 * Prompts for notification permission (if not already decided), registers
 * this browser for push, and saves the resulting FCM token onto
 * `users/{uid}.fcmTokens` (see firebase/firestore-schema.md). Safe to call
 * repeatedly — `arrayUnion` no-ops if the token is already saved, and FCM
 * itself reuses the same token for a given browser/site pair until it
 * expires or permission is revoked.
 * @param {string} uid
 * @returns {Promise<string>} the FCM token
 */
export async function enablePush(uid) {
  if (!(await isPushSupported())) {
    throw new Error("This browser doesn't support push notifications.");
  }
  if (VAPID_KEY.startsWith("REPLACE_WITH_")) {
    throw new Error(
      "Push notifications aren't fully set up yet — a VAPID key is still needed. See MANUAL_SETUP.md."
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  // Reuse the SAME service worker registration pwa.js already registered
  // for offline caching (service-worker.js), rather than letting the SDK
  // register its own default `/firebase-messaging-sw.js` — a page can only
  // have one active service worker per scope, and this app's already has
  // the `push`/`notificationclick` handlers FCM needs (see that file).
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Couldn't get a push token — please try again.");

  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
  return token;
}

/**
 * Listens for push messages that arrive while this tab is open and in the
 * foreground — FCM delivers those here instead of through the service
 * worker's `push` event, so without this listener a foreground user would
 * see nothing (the bell/badge from notificationService.js's onSnapshot
 * listener still updates either way; this is only about the OS-level
 * popup). Renders the browser's native Notification UI to match what a
 * backgrounded tab would show via the service worker.
 * @returns {Promise<() => void>} unsubscribe function (no-ops if unsupported)
 */
export async function listenForegroundPush() {
  if (!(await isPushSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || "ChopCircle";
    const body = payload.notification?.body || "";
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: "/assets/icons/icon-192.png",
        data: payload.data || {},
      });
    });
  });
}

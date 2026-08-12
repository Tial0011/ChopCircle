// ChopCircle — Food Shorts (coming soon) page controller
import { initTheme } from "./utils/theme.js";
import { initMobileNav } from "./utils/mobileNav.js";
import { initAuthHeader, initHeaderSearch } from "./utils/header.js";
import { registerServiceWorker, initInstallPrompt } from "./utils/pwa.js";
import { getCurrentUser } from "./auth/authGuard.js";

initTheme();
initMobileNav();
registerServiceWorker();
initInstallPrompt();
getCurrentUser().then((user) => {
  initAuthHeader(user, { basePath: "" });
  initHeaderSearch("");
});

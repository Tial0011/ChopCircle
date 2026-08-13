// ChopCircle — Food Shorts page controller
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

// ---- Shorts video reel: autoplay whichever slide is on screen ----------

function initShortsReel() {
  const reel = document.getElementById("shorts-reel");
  if (!reel) return;

  const slides = Array.from(reel.querySelectorAll("[data-shorts-slide]"));
  if (!slides.length) return;

  const videoFor = (slide) => slide.querySelector(".shorts-view__video");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = videoFor(entry.target);
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
  );

  slides.forEach((slide) => {
    const video = videoFor(slide);
    if (video) observer.observe(slide);

    // Tap the video itself to play/pause.
    if (video) {
      video.addEventListener("click", () => {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      });
    }

    // Mute/unmute button, per slide.
    const muteBtn = slide.querySelector("[data-shorts-mute]");
    if (video && muteBtn) {
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? "🔇" : "🔊";
      });
    }
  });
}

initShortsReel();

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

const SOUND_PREF_KEY = "chopcircle_shorts_sound";

function initShortsReel() {
  const shortsView = document.querySelector(".shorts-view");
  const reel = document.getElementById("shorts-reel");
  if (!shortsView || !reel) return;

  const slides = Array.from(reel.querySelectorAll("[data-shorts-slide]"));
  if (!slides.length) return;

  const videos = slides
    .map((slide) => slide.querySelector(".shorts-view__video"))
    .filter(Boolean);

  const soundGranted = localStorage.getItem(SOUND_PREF_KEY) === "granted";
  if (soundGranted) {
    shortsView.classList.add("shorts-view--sound-on");
    videos.forEach((video) => { video.muted = false; });
  }

  // Whichever slide is >=60% on screen plays; everything else pauses.
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target.querySelector(".shorts-view__video");
        if (!video) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.play().catch(() => {
            // Autoplay with sound can still be blocked by the browser even
            // after a previous grant — fall back to muted playback rather
            // than leaving the video frozen.
            video.muted = true;
            video.play().catch(() => {});
          });
        } else {
          video.pause();
        }
      });
    },
    { threshold: [0, 0.6, 1] }
  );

  slides.forEach((slide) => {
    const video = slide.querySelector(".shorts-view__video");
    if (!video) return;

    observer.observe(slide);

    // Tap anywhere on the slide (outside the mute button) to play/pause.
    slide.addEventListener("click", (e) => {
      if (e.target.closest("[data-shorts-mute]")) return;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });

    // Per-video mute toggle — only relevant before sound has been granted.
    const muteBtn = slide.querySelector("[data-shorts-mute]");
    if (muteBtn) {
      muteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? "🔇" : "🔊";
      });
    }
  });

  initSoundPermission(shortsView, videos, slides, reel);
}

function initSoundPermission(shortsView, videos, slides, reel) {
  const modal = document.getElementById("shorts-permission");
  const allowBtn = document.getElementById("shorts-permission-allow");
  const skipBtn = document.getElementById("shorts-permission-skip");
  if (!modal || !allowBtn || !skipBtn) return;

  const alreadyGranted = localStorage.getItem(SOUND_PREF_KEY) === "granted";
  if (alreadyGranted) {
    modal.classList.add("hidden");
    return;
  }

  // Ask immediately when the page loads.
  modal.classList.remove("hidden");

  const currentVideo = () => {
    const visible = slides.find((slide) => {
      const rect = slide.getBoundingClientRect();
      return rect.top >= -1 && rect.top < window.innerHeight / 2;
    });
    return (visible || slides[0]).querySelector(".shorts-view__video");
  };

  allowBtn.addEventListener("click", () => {
    localStorage.setItem(SOUND_PREF_KEY, "granted");
    shortsView.classList.add("shorts-view--sound-on");
    videos.forEach((video) => { video.muted = false; });
    const video = currentVideo();
    if (video) video.play().catch(() => {});
    modal.classList.add("hidden");
  });

  skipBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
  });
}

initShortsReel();

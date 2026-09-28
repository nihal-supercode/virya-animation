// The opening shot's load-in: once the exterior campus has loaded
// (ExteriorScene calls startIntro), the camera sweeps in to the opening shot
// (CameraRig), the campus fades in (ExteriorScene) and the headline + first
// card rise in (StoryOverlay). A plain mutable object like scrollStore.js —
// read every frame, never React state.
//
// Skipped (everything shown as it rests) when the page loads already
// scrolled into the story, or the user prefers reduced motion.

/** Seconds the camera sweep takes. */
export const INTRO_DURATION = 3.2;

const introStore = {
  startedAt: null, // performance.now() ms, or -Infinity when skipped
};

export function startIntro(progress) {
  if (introStore.startedAt !== null) return;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  introStore.startedAt = reduceMotion || progress > 0.001 ? -Infinity : performance.now();
}

/** Seconds since the intro started: 0 before it has, Infinity if skipped. */
export function getIntroElapsed() {
  if (introStore.startedAt === null) return 0;
  return (performance.now() - introStore.startedAt) / 1000;
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

/** 0-1 progress of something that runs `duration` s from `delay` s into the intro. */
export function getIntroStep(delay, duration) {
  return clamp01((getIntroElapsed() - delay) / duration);
}

// Plain mutable object written by the GSAP ScrollTrigger ticker (see
// hooks/useScrollTimeline.js) and read imperatively inside React Three
// Fiber's useFrame (see components/scene/CameraRig.jsx).
//
// Deliberately NOT React state / NOT a Zustand store: scroll fires at up to
// 60fps and camera reads happen every render frame, so routing this through
// setState would thrash React's reconciler for no benefit — nothing here
// needs to trigger a component re-render.
export const scrollStore = {
  progress: 0,
};

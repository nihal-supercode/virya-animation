// Single source of truth for Scene 1's scroll-progress breakpoints (0-1),
// shared by cameraPath.js, sceneTransition.js, vehiclePaths.js and
// Experience.jsx so they can't drift out of sync with each other.
//
// [0, EXTERIOR_END]          : wide isometric exterior shot -> close-up
//                              push in on Building B2.
// [EXTERIOR_END, FADE_END]   : B2 fades out, Factory Interior 1 fades in,
//                              in its place — camera pulls back from B2's
//                              tight framing to a wider view sized for the
//                              full room.
// [FADE_END, MOVEMENT_END]   : AMR10 and the Forklift drive their
//                              factory-floor choreography (AMR10 yields at
//                              the aisle crossing until the Forklift has
//                              passed, then continues) WHILE the camera
//                              gradually lifts toward a top-down view —
//                              starting with a slight downward/angled
//                              shift, not a static hold.
// [MOVEMENT_END, TOP_VIEW_END] : the vehicles have settled and the camera
//                              rests at the finished top-down view of
//                              Factory Interior 1, matching the
//                              storyboard's "TOP VIEW INTERIOR / SAFETY"
//                              beat.
// [TOP_VIEW_END, EXIT_END]   : AMR10 physically drives on, out through
//                              Factory Interior 1's far wall, across an
//                              outdoor gap, and into a second factory —
//                              for now a second instance of the SAME
//                              Factory Interior 1 model (see
//                              components/scene/NextFactoryScene.jsx —
//                              swap in real Exterior 2 / Factory Interior 2
//                              assets there once available) — while the
//                              camera pulls back down from the top-down
//                              view into a normal angled shot revealing the
//                              journey.
//
// Fractions below keep the exterior travel, crossfade, vehicle
// choreography and top-view rest phases at the SAME absolute scroll
// distance as before (450vh / 270vh / 360vh / 135vh out of Experience.jsx's
// SCROLL_LENGTH_VH) — only the new EXIT phase (350vh) was appended after
// TOP_VIEW_END, so nothing already-tuned shifts.
export const EXTERIOR_END = 0.2875;
export const FADE_END = 0.4601;
export const MOVEMENT_END = 0.6901;
export const TOP_VIEW_END = 0.7764;
export const EXIT_END = 1.0;

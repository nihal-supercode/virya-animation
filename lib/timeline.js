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
//                              outdoor gap, and into Factory Interior 2
//                              (see components/scene/NextFactoryScene.jsx)
//                              — while the
//                              camera swings from the top-down view into a
//                              side view for the crossing, then back up to
//                              a top view of Factory Interior 2 (see
//                              cameraPath.js's getExitCameraState).
//
// [EXIT_END, FACTORY2_DRIVE_END] : AMR10 swerves around the floor box in
//                              Factory Interior 2, then makes a wide right
//                              turn onto a straight line running through the
//                              trolley area's corner gap, and stops on it
//                              (see vehiclePaths.js's getAmr10Rig), with the
//                              camera holding the corner view it swung into
//                              as AMR10 approached.
// [FACTORY2_DRIVE_END, PARK_REVERSE_END] : AMR10 reverses dead straight
//                              along that line, its trolley leading, through
//                              the gap into the trolley area, and stays
//                              there with it, while the camera closes in on
//                              AMR50.
// [PARK_REVERSE_END, AMR50_EXIT_END] : AMR50 picks up the AMR50 trolley and
//                              tows it out of Factory 2 toward Factory 3 (see
//                              amr50Paths.js): radar detect, approach, reverse
//                              onto the drawbar, hitch, then one straight
//                              drive out and across to Factory 3 (B2) — with
//                              the same top view -> side view camera swing
//                              and building crossfade (Factory 2 -> a B4,
//                              Factory 3's B2 appearing) as the Factory
//                              1 -> 2 crossing — then B2 turns into the
//                              Final Scene interior as AMR50 arrives, and it
//                              drives on in down its central aisle.
//
// Scroll distribution. Every major section gets the same scroll length,
// SECTION_VH, so the same amount of scrolling moves the story on by a
// similar amount everywhere. Two sections that are really two beats' worth
// of continuous action get two units:
//   - AMR10's crossing from Factory 1 to Factory 2 plus its drive in
//     Factory 2 — ONE continuous drive (see vehiclePaths.js), kept at its
//     350:250 internal split so everything keyed to where AMR10 is along it
//     (crossfades, camera swings) stays aligned;
//   - AMR50's drive out to Factory 3 and on into the Final Scene.
// The exception is Factory 1's AMR10/Forklift choreography: it packs more
// travel into its beat, so its length is set by distance instead — enough
// scroll that they move at the same metres per vh as the other sections
// (vehiclePaths.js's getMovementT spreads it along their paths).
// Sub-steps within a section keep their relative proportions. Everything
// else (camera, vehicles, crossfades) is defined as fractions of these
// phases, so it all stays the same — only its scroll pace is evened out.
const SECTION_VH = 330;
const PHASE_VH = [
  ["EXTERIOR", SECTION_VH], // 1. exterior camera travel
  ["FADE", SECTION_VH], // 2. B2 -> Factory Interior 1 crossfade + pull-back
  ["MOVEMENT", 530], // 3. AMR10/Forklift choreography (sized so they move at the other sections' pace — see vehiclePaths.js's getMovementT)...
  ["TOP_VIEW", SECTION_VH * (40 / 400)], //    ...and the brief top-view rest
  ["EXIT", 2 * SECTION_VH * (350 / 600)], // 4. AMR10 Factory 1 -> Factory 2 crossing...
  ["FACTORY2_DRIVE", 2 * SECTION_VH * (250 / 600)], //    ...and on around the box in Factory 2
  ["PARK_REVERSE", SECTION_VH], // 5. AMR10 reverses into the trolley area
  ["AMR50_DETECT", SECTION_VH * (60 / 410)], // 6. AMR50: radar detect,
  ["AMR50_APPROACH", SECTION_VH * (200 / 410)], //    approach,
  ["AMR50_DOCK", SECTION_VH * (120 / 410)], //    reverse onto the drawbar,
  ["AMR50_HITCH", SECTION_VH * (30 / 410)], //    hitch
  ["AMR50_EXIT", 2 * SECTION_VH], // 7. AMR50 tows out to Factory 3 and into the Final Scene
];

/** Total scroll length in vh — Experience.jsx sizes its scroll wrapper with it. */
export const SCROLL_LENGTH_VH = PHASE_VH.reduce((sum, [, vh]) => sum + vh, 0);

const PHASE_END = (() => {
  const ends = {};
  let total = 0;
  for (const [name, vh] of PHASE_VH) {
    total += vh;
    ends[name] = total / SCROLL_LENGTH_VH;
  }
  return ends;
})();

export const EXTERIOR_END = PHASE_END.EXTERIOR;
export const FADE_END = PHASE_END.FADE;
export const MOVEMENT_END = PHASE_END.MOVEMENT;
export const TOP_VIEW_END = PHASE_END.TOP_VIEW;
export const EXIT_END = PHASE_END.EXIT;
export const FACTORY2_DRIVE_END = PHASE_END.FACTORY2_DRIVE;
export const PARK_REVERSE_END = PHASE_END.PARK_REVERSE;
export const AMR50_DETECT_END = PHASE_END.AMR50_DETECT;
export const AMR50_APPROACH_END = PHASE_END.AMR50_APPROACH;
export const AMR50_DOCK_END = PHASE_END.AMR50_DOCK;
export const AMR50_HITCH_END = PHASE_END.AMR50_HITCH;
export const AMR50_EXIT_END = 1.0;

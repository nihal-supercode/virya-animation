import { EXTERIOR_END, FADE_END } from "./timeline";
import { getAmr50ProgressAtX, FACTORY2_EDGE_X, FACTORY3_ENTRY_X } from "./amr50Paths";

// Exterior -> Factory Interior 1 crossfade.
//
// progress < EXTERIOR_END        : pure exterior scene, camera still
//                                  traveling toward Building B2.
// progress in [EXTERIOR_END, FADE_END] : Factory Interior 1 materialises
//                                  in B2's place, then the exterior
//                                  dissolves away around it, while the
//                                  camera slows almost to a stop (see
//                                  cameraPath.js).
// progress > FADE_END            : pure interior scene — Factory Interior 1
//                                  (room + AMR10 + Forklift) stays visible
//                                  from here on, including through the
//                                  TOP_VIEW_END..EXIT_END phase where AMR10
//                                  physically drives out to Factory
//                                  Interior 2 (see
//                                  vehiclePaths.js's AMR10_EXIT_TARGET and
//                                  components/scene/NextFactoryScene.jsx)
//                                  — a spatial journey, not a crossfade.
//
// Note: Building B2 couldn't be isolated as its own fadeable mesh — the
// asset pipeline's `join` step (scripts/optimize-models.mjs) merges
// same-material meshes for draw-call efficiency, so B2's geometry ended up
// combined with other buildings inside exterior.glb (confirmed via
// `gltf-transform inspect`). Since the camera is tightly framed on B2 by
// EXTERIOR_END — the rest of the exterior campus is out of frame — fading
// the whole exterior scene reads as equivalent to fading B2 alone.
// Staged rather than a straight swap, so it reads as B2 turning into the
// factory instead of two half-transparent scenes overlapping: the room
// materialises first, in place, while the campus is still (nearly) solid
// around it (INTERIOR_IN_END), and only then does the campus dissolve away
// to reveal it (EXTERIOR_OUT_START onward). The two overlap in the middle,
// where the camera is almost still (see cameraPath.js). Both on the same
// smootherstep curve as the later building crossfades.
const INTERIOR_IN_END = 0.6; // fraction of the fade window
const EXTERIOR_OUT_START = 0.3;

function fadeSmootherstep(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function getFadeOpacities(progress) {
  if (progress <= EXTERIOR_END) return { exterior: 1, interior: 0 };
  if (progress >= FADE_END) return { exterior: 0, interior: 1 };

  const u = (progress - EXTERIOR_END) / (FADE_END - EXTERIOR_END);
  return {
    exterior: 1 - fadeSmootherstep((u - EXTERIOR_OUT_START) / (1 - EXTERIOR_OUT_START)),
    interior: fadeSmootherstep(u / INTERIOR_IN_END),
  };
}

// Factory interiors <-> B4/B5 exterior buildings, during the exit phase
// (TOP_VIEW_END..EXIT_END). The same opacity crossfade as the exterior ->
// Factory Interior 1 transition above, run out and back, but longer and on a
// gentler curve (smootherstep: soft start and finish, and a much less steep
// middle than easeInOutCubic) so the swaps read as a slow dissolve rather
// than a quick switch:
// Factory Interior 1 -> B4 and Factory Interior 2 -> B5 as AMR10 drives out
// and the camera swings down into its side view; B4/B5 then hold while
// AMR10 crosses, and only once it reaches Factory 2 do they crossfade back
// to the interiors (as the camera rises back to the top view), revealing
// AMR10 driving in to its stop. AMR10 itself never fades.
//
// Windows are fractions of the exit phase (getExitT) and are shared with
// cameraPath.js's side-view swing so the two stay locked together. Bounded
// by AMR10's own drive — see getAmr10ExitTransform:
//   ~0.13 its nose leaves Factory 1, ~0.25 its tail clears the wall
//   ~0.84 its nose reaches B5's front wall (Factory 2's sits 0.5 further
//         inside B5); it drives on past the box just after the phase ends
// Both run long (closer to the exterior -> Factory Interior 1 fade's pace):
// the fade-in starts as AMR10 sets off out of Factory 1 and runs ~170vh,
// the fade-back starts well before it reaches B5 and finishes as the phase
// ends. AMR10 is drawn after the buildings (Interior1Scene), so a
// half-faded building never veils it.
export const TO_EXTERIOR_START = 0.04;
export const TO_EXTERIOR_END = 0.52;
export const TO_INTERIOR_START = 0.72;
export const TO_INTERIOR_END = 1.0;

function smootherstep(x) {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function ramp(t, start, end) {
  return smootherstep(Math.min(1, Math.max(0, (t - start) / (end - start))));
}

/** 0 = factory interiors, 1 = B4/B5 exterior buildings. Takes getExitT. */
export function getExitExteriorAmount(exitT) {
  return (
    ramp(exitT, TO_EXTERIOR_START, TO_EXTERIOR_END) *
    (1 - ramp(exitT, TO_INTERIOR_START, TO_INTERIOR_END))
  );
}

// The same crossfade again for AMR50's crossing from Factory 2 to Factory 3:
// Factory Interior 2 -> a B4, with B2 (standing in for Factory 3, which has no
// interior model) fading in, keyed to where AMR50 actually is on its drive
// out — starting as its centre crosses Factory 2's edge, done once its
// trolley is well clear. Same smootherstep curve. They stay as buildings
// from then on (AMR50 ends up at Factory 3's door). AMR50 and its trolley
// never fade.
// Spread over ~5m of AMR50's travel (from 1.5 before the edge to 3.5 past
// it): at ~2.2m this and the camera's top -> side swing that shares it read
// as rushed.
export const F2_TO_EXTERIOR_START = getAmr50ProgressAtX(FACTORY2_EDGE_X - 1.5);
export const F2_TO_EXTERIOR_END = getAmr50ProgressAtX(FACTORY2_EDGE_X + 3.5);

/** 0 = Factory Interior 2, 1 = the B4/B2 exterior buildings. Takes raw scroll progress. */
export function getFactory2ExteriorAmount(progress) {
  return ramp(progress, F2_TO_EXTERIOR_START, F2_TO_EXTERIOR_END);
}

/**
 * Factory 1's building amount (0 = Factory Interior 1, 1 = its B4). It's a
 * B4 while AMR10 crosses to Factory 2, back to its interior once the camera
 * is inside Factory 2 (out of view), and a B4 again from AMR50's crossing to
 * Factory 3 on — the Final Scene's closing shot looks back past it, so it
 * has to read as a building like Factory 2 does. Takes getExitT and raw
 * scroll progress.
 */
export function getFactory1ExteriorAmount(exitT, progress) {
  return Math.max(getExitExteriorAmount(exitT), getFactory2ExteriorAmount(progress));
}

// And once more as AMR50 arrives at Factory 3: B2 -> the Final Scene
// interior, with the same curve, starting a little before AMR50 reaches
// B2's wall (so it's already thinning as it arrives) and done as AMR50's
// nose is ~0.35 inside — so it drives on into a visible room.
export const F3_TO_INTERIOR_START = getAmr50ProgressAtX(FACTORY3_ENTRY_X - 3.0);
export const F3_TO_INTERIOR_END = getAmr50ProgressAtX(FACTORY3_ENTRY_X + 0.35);

/** 0 = B2 building, 1 = the Final Scene interior. Takes raw scroll progress. */
export function getFactory3InteriorAmount(progress) {
  return ramp(progress, F3_TO_INTERIOR_START, F3_TO_INTERIOR_END);
}

/**
 * How visible a factory room is while its exterior building (B4/B5) is at
 * `buildingAmount` (0-1). Rather than both fading at once (two
 * half-transparent versions overlapping, and the room seeming to vanish),
 * the building materialises AROUND the room while the room stays solid, and
 * the room only fades over the last stretch, once the building is nearly
 * opaque and it's hidden inside anyway. Run backward, the room comes back
 * first (still hidden inside) and then the building dissolves to reveal it.
 * The effect reads as the factory transforming into the building.
 */
export function roomVisibility(buildingAmount) {
  const x = Math.min(1, Math.max(0, (buildingAmount - 0.75) / 0.25));
  return 1 - x * x * (3 - 2 * x);
}

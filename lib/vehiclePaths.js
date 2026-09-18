import { FADE_END, MOVEMENT_END, TOP_VIEW_END, EXIT_END } from "./timeline";

// AMR10 <-> Forklift factory-floor choreography, played out during the
// FADE_END -> MOVEMENT_END scroll window, while the camera gradually lifts
// toward a top-down view (see cameraPath.js). Coordinates are in
// Interior1Scene's local space (i.e. inside its outer POSITION group, same
// frame as FORKLIFT_LOCAL_CENTER/AMR10_LOCAL_CENTER in Interior1Scene.jsx).
// The Forklift rests at FORKLIFT_END after MOVEMENT_END, but AMR10 keeps
// going — see getAmr10ExitTransform below — driving on, out of Factory
// Interior 1 and into a second factory instance during
// TOP_VIEW_END..EXIT_END.
//
// AMR10 drives down its aisle (x ~0.51, heading -Z) toward the point where
// that aisle crosses the Forklift's aisle (z ~-0.625, heading +X), but
// PAUSES at a SAFE point BEFORE the crossing — not on top of it — real AMR
// obstacle-yield behavior stops clear of the hazard, not in it. It waits
// there until the Forklift (which drives its own aisle at a steady,
// uninterrupted pace) has passed with clearance to spare, then continues
// through the now-clear crossing to its destination.
//
// Start positions match the vehicles' post-swap resting spots from
// Interior1Scene.jsx (AMR10_TARGET / FORKLIFT_TARGET there) so there's no
// pop when the movement phase begins.
export const AMR10_START = [0.505505, 0, 2.11];
export const AMR10_END = [0.505505, 0, -2.6];

export const FORKLIFT_START = [-2.554975, 0, -0.625155];
export const FORKLIFT_END = [2.5, 0, -0.625155];

// Where AMR10 ends up after driving straight on, out through Factory
// Interior 1's far wall and across an outdoor gap, into the second factory
// (see components/scene/NextFactoryScene.jsx). Per request, the second
// factory sits PARALLEL to Factory Interior 1 — directly opposite it along
// the same aisle/x-alignment AMR10 already travels, a straight crossing
// rather than a diagonal detour toward Building B3's real site-plan
// position. This target is expressed in Interior1Scene's local frame
// (relative to its own POSITION [-2.05, 0, -2.41]): world z -12.5, about a
// unit inside that second room's near wall (world bbox z:[-17.83,-11.43]).
export const AMR10_EXIT_TARGET = [0.505505, 0, -10.09];

// The point where AMR10's aisle (constant x) and the Forklift's aisle
// (constant z) actually cross.
const CROSSING = [AMR10_START[0], 0, FORKLIFT_START[2]];

// Clearance kept between each vehicle and the crossing/each other. Without
// a live view to measure exact (rotated) vehicle footprints against, these
// are estimates rather than values derived from real bounding boxes — flag
// it if the vehicles still read as too close or too far apart once
// visible, and they can be tightened or loosened precisely. Split into two
// so AMR10's stop distance can be tuned independently of how much of a
// head start the Forklift needs before AMR10 resumes.
const AMR10_STOP_MARGIN = 1.0; // how far back AMR10 stops, short of the crossing
const FORKLIFT_CLEAR_MARGIN = 0.8; // how far past the crossing the Forklift must be before AMR10 resumes

// AMR10 stops AMR10_STOP_MARGIN short of the crossing along its own aisle
// (still heading -Z, well short of z ~-0.625) — not at the crossing itself.
const STOP_POINT = [AMR10_START[0], 0, CROSSING[2] + AMR10_STOP_MARGIN];

// AMR10's own local-t windows within the movement phase (t is 0-1, see
// getMovementT below):
//   [0, ARRIVE_T]        drive from START to STOP_POINT
//   [ARRIVE_T, RESUME_T] paused, holding at STOP_POINT
//   [RESUME_T, 1]        drive from STOP_POINT through the crossing to END
// ARRIVE_T (t≈0.368) is AMR10's exact path-length fraction to STOP_POINT,
// so it arrives right as it should, not early/late. RESUME_T (t≈0.80) is
// set past the Forklift's own eased arrival at x = crossing +
// FORKLIFT_CLEAR_MARGIN, now t≈0.61 (re-verified after easing the Forklift
// below — its S-curve moves fastest through the middle of its journey, so
// it clears that point EARLIER in t than the old linear estimate of
// t≈0.76 did, leaving an even larger safety margin, not a smaller one) —
// i.e. AMR10 only continues once the Forklift has fully passed its aisle
// with a safety margin, not merely once its centerline has crossed.
const AMR10_ARRIVE_T = 0.37;
const AMR10_RESUME_T = 0.8;

// Fixed facing for both vehicles' STRAIGHT-line segments. Deliberately NOT
// derived from each path's direction of travel via a blind atan2 formula —
// an earlier attempt at that tied the Forklift's rotation to its
// (assumed) travel-direction vector using an UNCALIBRATED reference angle,
// which changed its resting-pose facing too and visibly broke it. Kept as
// a plain constant for these two, confirmed correct by the user.
const VEHICLE_ROTATION_Y = Math.PI / 2;
// Forklift's front was reported facing backwards — a 180° flip from the
// shared value above (not a full 360°, which would look identical).
const FORKLIFT_ROTATION_Y = VEHICLE_ROTATION_Y + Math.PI;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpVec3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Zero velocity at BOTH t=0 and t=1 — used for both of AMR10's drive
// segments. Each one borders a frozen/clamped region on BOTH ends (before
// FADE_END and during the pause on one side; the pause and after
// MOVEMENT_END on the other — see getMovementT's clamping), so both
// boundaries need to match that zero velocity, not just the one nearest
// the pause. An earlier version used easeOutCubic (zero velocity only at
// t=1) for the approach and easeInCubic (zero velocity only at t=0) for
// the departure — each had a NONZERO velocity at its other end, so AMR10
// arrived at STOP_POINT fine but left AMR10_END at full speed right before
// freezing, and departed STOP_POINT fine but entered motion at FADE_END at
// full speed too. Scrolling backward through either of those non-eased
// boundaries meant jumping from fully frozen to full speed instantly —
// the abrupt reversal. easeInOutCubic fixes every boundary at once.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Maps raw scroll progress to the movement phase's local t (0-1). */
export function getMovementT(progress) {
  if (progress <= FADE_END) return 0;
  if (progress >= MOVEMENT_END) return 1;
  return (progress - FADE_END) / (MOVEMENT_END - FADE_END);
}

export function getAmr10Transform(t) {
  const clamped = Math.min(1, Math.max(0, t));

  if (clamped <= AMR10_ARRIVE_T) {
    const localT = easeInOutCubic(clamped / AMR10_ARRIVE_T);
    return {
      position: lerpVec3(AMR10_START, STOP_POINT, localT),
      rotationY: VEHICLE_ROTATION_Y,
    };
  }
  if (clamped <= AMR10_RESUME_T) {
    // Paused clear of the crossing, waiting for the Forklift to pass.
    return { position: [...STOP_POINT], rotationY: VEHICLE_ROTATION_Y };
  }
  const localT = easeInOutCubic((clamped - AMR10_RESUME_T) / (1 - AMR10_RESUME_T));
  return {
    position: lerpVec3(STOP_POINT, AMR10_END, localT),
    rotationY: VEHICLE_ROTATION_Y,
  };
}

/** Maps raw scroll progress to the exit phase's local t (0-1). */
export function getExitT(progress) {
  if (progress <= TOP_VIEW_END) return 0;
  if (progress >= EXIT_END) return 1;
  return (progress - TOP_VIEW_END) / (EXIT_END - TOP_VIEW_END);
}

// AMR10's exit drive, from AMR10_END straight out to AMR10_EXIT_TARGET —
// a single straight line, no turn needed, since the second factory sits
// parallel/directly opposite along the same heading AMR10 is already
// facing. Same easeInOutCubic as the movement-phase segments above — zero
// velocity at both t=0 (bordering the frozen post-MOVEMENT_END rest) and
// t=1 (bordering the frozen post-EXIT_END rest), so this hands off from
// and into those frozen states smoothly in either scroll direction.
export function getAmr10ExitTransform(exitT) {
  const clamped = Math.min(1, Math.max(0, exitT));
  const localT = easeInOutCubic(clamped);
  return {
    position: lerpVec3(AMR10_END, AMR10_EXIT_TARGET, localT),
    rotationY: VEHICLE_ROTATION_Y,
  };
}

// Combines the movement-phase and exit-phase transforms into one function
// of raw scroll progress, so callers don't need to know which phase is
// active — AMR10_END (movement phase's t=1) and the exit phase's t=0 are
// numerically identical, so this is continuous across the handoff.
export function getAmr10FullTransform(progress) {
  if (progress >= TOP_VIEW_END) {
    return getAmr10ExitTransform(getExitT(progress));
  }
  return getAmr10Transform(getMovementT(progress));
}

export function getForkliftTransform(t) {
  const clamped = Math.min(1, Math.max(0, t));
  // Same easeInOutCubic as AMR10 (see above) — the Forklift's path also
  // borders frozen zones at both t=0 (before FADE_END) and t=1 (after
  // MOVEMENT_END), so it had the identical abrupt-start/abrupt-stop-on-
  // reversal issue with plain linear motion.
  const localT = easeInOutCubic(clamped);
  return {
    position: lerpVec3(FORKLIFT_START, FORKLIFT_END, localT),
    rotationY: FORKLIFT_ROTATION_Y,
  };
}

import * as THREE from "three";
import {
  EXTERIOR_END,
  FADE_END,
  MOVEMENT_END,
  TOP_VIEW_END,
  EXIT_END,
} from "./timeline";
import { getExitT, getAmr10ExitTransform } from "./vehiclePaths";
import { B4_WORLD_CENTER } from "./exteriorLayout";

// Camera path for Scene 1 (Factory Exterior -> Factory Interior 1), built
// as ONE continuous Catmull-Rom spline through 4 waypoints, rather than 3
// independently-eased straight-line segments (the earlier approach — each
// segment's ease-in-out drove velocity to ~0 at every waypoint, so the
// camera visibly stopped and relaunched at B2_CLOSE and INTERIOR_REVEAL,
// which read as "jumpy"). A spline's tangent through an interior point is
// derived from its neighbors, so velocity stays continuous all the way
// through — the camera only truly decelerates at the very start and end.
//
// START            -> wide isometric establishing shot, matching the
//                     storyboard's "Factory Exterior (1) / Existing
//                     Infrastructure / Isometric View" beat.
// B2_CLOSE          -> pushed in on Building B2 (confirmed by rendering
//                     B2.glb highlighted red over the full scene).
// INTERIOR_REVEAL   -> while sceneTransition.js crossfades B2 out and
//                     Factory Interior 1 in, in its place, the camera has
//                     pulled back to a wider framing sized for the full
//                     room rather than B2's much smaller footprint.
// TOP_VIEW          -> a true 90° top-down view of Factory Interior 1,
//                     matching the storyboard's "TOP VIEW INTERIOR /
//                     SAFETY" beat. The camera eases into this gradually
//                     over the SAME window as the AMR10/Forklift
//                     choreography (see progressToCurveT below) rather
//                     than holding still and then jumping — it starts
//                     with a slight downward/angled shift off of
//                     INTERIOR_REVEAL and settles into the proper
//                     top-down framing as the vehicles finish moving.
// NEXT_FACTORY_REVEAL -> AMR10 has physically driven out of Factory
//                     Interior 1 and into a second, distinct factory (see
//                     vehiclePaths.js's AMR10_EXIT_TARGET and
//                     NextFactoryScene.jsx) — the camera pulls back down
//                     off TOP_VIEW's vertical look-down into a normal
//                     angled shot again, mirroring INTERIOR_REVEAL's style
//                     for the new location.
//
// The exterior model's bounding box (verified via `gltf-transform inspect`
// on the optimized output) is roughly x:[-3.27, 3.27] y:[0, 0.59]
// z:[-3.53, 3.53]. Building B2's own bbox (same inspect, on
// buildings/B2.glb) is x:[-3.08, -1.02] y:[0, 0.31] z:[-3.27, -1.55],
// center ~(-2.05, 0.16, -2.41) — B2_CLOSE targets that center.
// Factory Interior 1's world-space center (its own bbox center plus the
// world offset it's placed at, see Interior1Scene.jsx's POSITION) is
// ~(-2.05, 0.43, -3.03) — INTERIOR_REVEAL and TOP_VIEW target that
// instead, since by FADE_END the interior (not B2) is what's on screen.

// Default "up" for every waypoint except TOP_VIEW. Three.js's
// Camera.lookAt() derives the camera's right/up basis from this vector
// crossed with the view direction — it only needs to change for a
// perfectly vertical look-down (see TOP_VIEW below). Kept out of the
// spline entirely (see lerpUp below) since a 3-point position/rotation
// spline has no meaningful use for a mostly-constant orientation vector.
const UP_DEFAULT = [0, 1, 0];

const START = {
  position: [6.75, 5.8, 6.75],
  lookAt: [0, 0.3, 0],
  fov: 35,
  up: UP_DEFAULT,
};

// The push-in now targets Building B4 — with the exterior model rotated
// (see exteriorLayout.js), B4 is the building sitting where Factory
// Interior 1 fades in. Derived from the rotation so it stays centered if
// the rotation is tweaked again.
const B2_CENTER = B4_WORLD_CENTER;

const B2_CLOSE = {
  position: [B2_CENTER[0] + 0.95, B2_CENTER[1] + 0.5, B2_CENTER[2] + 1.0],
  lookAt: B2_CENTER,
  fov: 55,
  up: UP_DEFAULT,
};

const INTERIOR_1_CENTER = [-2.05, 0, -3.03];

// Wider than B2_CLOSE — Factory Interior 1 is a full ~6.4x6.4 room versus
// B2's much smaller ~2x1.7 footprint, so the tight B2 framing would leave
// it looking cropped. Offset direction kept roughly consistent with
// B2_CLOSE's so the pull-back reads as one continuous camera move.
const INTERIOR_REVEAL = {
  position: [
    INTERIOR_1_CENTER[0] + 2.65,
    INTERIOR_1_CENTER[1] + 1.6,
    INTERIOR_1_CENTER[2] + 2.9,
  ],
  lookAt: [INTERIOR_1_CENTER[0], INTERIOR_1_CENTER[1] + 0.4, INTERIOR_1_CENTER[2]],
  fov: 53.5,
  up: UP_DEFAULT,
};

const TOP_VIEW = {
  // Directly overhead — position and lookAt share the same x/z, only y
  // differs, for a true 90° top-down shot. A perfectly vertical look-down
  // is a well-known three.js gimbal-lock trap for Camera.lookAt() when
  // `up` is (0,1,0) — the view direction (0,-1,0) ends up parallel to up,
  // so the derived right/up basis collapses. Fixed properly here (not by
  // faking the angle): `up` is swapped to (0,0,-1) for this waypoint, and
  // CameraRig applies the interpolated `up` every frame before calling
  // lookAt, so the basis stays well-defined all the way through.
  position: [INTERIOR_1_CENTER[0], 8, INTERIOR_1_CENTER[2]],
  lookAt: INTERIOR_1_CENTER,
  fov: 45,
  up: [0, 0, -1],
};

// Where AMR10 ends up (see vehiclePaths.js's AMR10_EXIT_TARGET) — a second
// Factory Interior 1 instance at its own distinct world position (see
// components/scene/NextFactoryScene.jsx's POSITION), not a
// crossfade-in-place at INTERIOR_1_CENTER. Positioned PARALLEL to Factory
// Interior 1 and directly opposite it — same x, continued along the same
// -Z heading AMR10 already travels. Its own world center is that POSITION
// plus the room model's own local bbox center (~(0, 0.43, -0.63), same
// value used to derive INTERIOR_1_CENTER above).
const NEXT_FACTORY_CENTER = [-2.05, 0, -14.63];

// Must match Interior1Scene.jsx's own exported POSITION — used below to
// convert AMR10's exit-path coordinates (local to that group) into world
// space, so the camera can track its actual live position during the exit
// phase rather than a fixed lookAt spline.
const INTERIOR1_POSITION = [-2.05, 0, -2.41];

// Extra vertical lift added ON TOP OF the position spline during the exit
// phase (see the outdoorMood bell curve in getCameraState below), peaking
// at the midpoint of the TOP_VIEW_END..EXIT_END crossing and zero at both
// ends — so it introduces no discontinuity with the states already tuned
// just outside this phase. Without it, the camera's height simply
// descends the whole way from TOP_VIEW's y=8 down to NEXT_FACTORY_REVEAL's
// y=1.6, which reads as one flat pull-back rather than a natural
// indoor -> outdoor -> indoor beat. With it, the camera rises further
// still partway through — as if pulling up and back to take in the
// open-air gap AMR10 crosses between the two buildings — before settling
// back down into the next factory. OUTDOOR_FOV_BUMP (used alongside it,
// see the fov branch below) widens the shot at the same moment, for the
// same "open outdoor space" read.
const OUTDOOR_LIFT_HEIGHT = 1.8;
const OUTDOOR_FOV_BUMP = 6;

// Deliberately mirrors INTERIOR_REVEAL's offset/style (same relative
// position/fov) so arriving at the second factory reads as an echo of
// arriving at the first — `up` returns to UP_DEFAULT here too, off of
// TOP_VIEW's vertical look-down.
const NEXT_FACTORY_REVEAL = {
  position: [
    NEXT_FACTORY_CENTER[0] + 2.65,
    NEXT_FACTORY_CENTER[1] + 1.6,
    NEXT_FACTORY_CENTER[2] + 2.9,
  ],
  lookAt: [NEXT_FACTORY_CENTER[0], NEXT_FACTORY_CENTER[1] + 0.4, NEXT_FACTORY_CENTER[2]],
  fov: 53.5,
  up: UP_DEFAULT,
};

const WAYPOINTS = [START, B2_CLOSE, INTERIOR_REVEAL, TOP_VIEW, NEXT_FACTORY_REVEAL];

// "centripetal" parameterization avoids the loops/overshoot that plain
// uniform Catmull-Rom can produce when control points aren't evenly
// spaced — ours aren't (B2_CLOSE -> INTERIOR_REVEAL is a much bigger jump
// than INTERIOR_REVEAL -> TOP_VIEW), so this matters here.
const POSITION_CURVE = new THREE.CatmullRomCurve3(
  WAYPOINTS.map((w) => new THREE.Vector3(...w.position)),
  false,
  "centripetal"
);

const LOOKAT_CURVE = new THREE.CatmullRomCurve3(
  WAYPOINTS.map((w) => new THREE.Vector3(...w.lookAt)),
  false,
  "centripetal"
);

// Curve.getPoint(t) maps t ∈ [0,1] across a CatmullRomCurve3's segments by
// point INDEX, uniformly — segment i (between waypoint i and i+1) always
// owns t ∈ [i/3, (i+1)/3], regardless of how far apart those waypoints are
// in space or in scroll-progress. This remaps our raw scroll progress onto
// that same index-uniform t, piecewise-LINEARLY (deliberately no easing
// here — easing per segment is exactly what caused the old stop-start
// feel; the curve's own geometry now supplies all the smoothing).
//
// The INTERIOR_REVEAL -> TOP_VIEW segment spans FADE_END -> MOVEMENT_END —
// the SAME window as the AMR10/Forklift choreography in vehiclePaths.js —
// so the lift into the top-down view happens gradually WHILE the vehicles
// move, not as a static hold followed by a separate camera move. It starts
// gently (the spline eases out of INTERIOR_REVEAL rather than snapping)
// and settles into the true top-down framing right as the vehicles finish.
// Past MOVEMENT_END the camera simply rests at TOP_VIEW.
function progressToCurveT(progress) {
  const p = Math.min(1, Math.max(0, progress));
  const segments = WAYPOINTS.length - 1; // 4

  if (p <= EXTERIOR_END) {
    return (0 + p / EXTERIOR_END) / segments;
  }
  if (p <= FADE_END) {
    return (1 + (p - EXTERIOR_END) / (FADE_END - EXTERIOR_END)) / segments;
  }
  if (p <= MOVEMENT_END) {
    return (2 + (p - FADE_END) / (MOVEMENT_END - FADE_END)) / segments;
  }
  if (p <= TOP_VIEW_END) {
    return 3 / segments; // rest at TOP_VIEW for MOVEMENT_END..TOP_VIEW_END
  }
  // TOP_VIEW_END..EXIT_END: pull back down toward NEXT_FACTORY_REVEAL as
  // AMR10 drives out of Factory Interior 1 and into the next factory.
  return (3 + (p - TOP_VIEW_END) / (EXIT_END - TOP_VIEW_END)) / segments;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Matches the easeInOutCubic duplicated in vehiclePaths.js/NextFactoryScene.jsx
// (project convention: small pure helpers are kept local to each file rather
// than shared) — used below to ease the lookAt handoff at the start of the
// exit phase.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// How much of the exit phase (TOP_VIEW_END..EXIT_END, as a 0-1 fraction of
// getExitT) the lookAt handoff below is eased over, before settling into
// pure AMR10 tracking for the rest of the journey.
const LOOKAT_HANDOFF_T = 0.25;

// Linear-interpolate two unit vectors and re-normalize. Not a true slerp
// (angular velocity isn't perfectly constant), but for the single ~90°
// up-vector swing used here (UP_DEFAULT -> TOP_VIEW's up, confined to the
// last segment only) it reads as a smooth continuous roll with no snap.
function lerpUp(a, b, t) {
  const x = lerp(a[0], b[0], t);
  const y = lerp(a[1], b[1], t);
  const z = lerp(a[2], b[2], t);
  const len = Math.sqrt(x * x + y * y + z * z);
  return len < 1e-6 ? UP_DEFAULT : [x / len, y / len, z / len];
}

export function getCameraState(progress) {
  const p = Math.min(1, Math.max(0, progress));
  const t = progressToCurveT(p);

  const position = POSITION_CURVE.getPoint(t);
  let lookAt = LOOKAT_CURVE.getPoint(t);

  // Exit-phase-only quantities, computed once here and reused below by the
  // lookAt handoff, the outdoor lift, and the outdoor fov bump.
  // outdoorMood is bell-shaped: 0 at both ends of the exit phase (still
  // "indoors" at TOP_VIEW_END, already "indoors" again on arrival at
  // EXIT_END), peaking at the midpoint — the open-air gap AMR10 crosses
  // between the two buildings (see vehiclePaths.js's AMR10_EXIT_TARGET).
  // Smooth and zero-derivative at both ends, so anything driven by it stays
  // continuous with the states already tuned just outside this phase.
  let exitT = 0;
  let outdoorMood = 0;
  if (p > TOP_VIEW_END) {
    exitT = getExitT(p);
    outdoorMood = Math.sin(Math.PI * exitT);
  }

  if (outdoorMood > 0) {
    // Extra lift on top of the base spline position (see
    // OUTDOOR_LIFT_HEIGHT's own comment) — the camera rises further to
    // take in the open yard between the two buildings, then settles back
    // down as AMR10 (and the camera) arrive, rather than a flat,
    // purely-descending pull-back the whole way.
    position.y += OUTDOOR_LIFT_HEIGHT * outdoorMood;
  }

  // During the exit phase, DON'T use the fixed lookAt spline (a straight
  // interpolation between just the TOP_VIEW and NEXT_FACTORY_REVEAL
  // endpoints) — AMR10's own path curves through a turn in between (see
  // vehiclePaths.js), and TOP_VIEW's steep overhead angle only has a
  // narrow ~3.3-unit visible ground radius, so AMR10 was drifting out of
  // frame almost immediately after leaving Factory Interior 1 and not
  // reappearing until the camera caught up near the very end. Tracking
  // AMR10's actual live position as the lookAt target instead keeps it
  // framed for the whole journey; the camera's POSITION still eases along
  // the spline above for the cinematic pull-back/pan.
  //
  // But switching straight to that tracked target the instant p crosses
  // TOP_VIEW_END was itself a discontinuity: LOOKAT_CURVE.getPoint(t) rests
  // exactly at TOP_VIEW.lookAt (the room's center) right up to that point,
  // while AMR10's tracked position at exitT=0 is AMR10_END — a different
  // point ~2 units away — so the very next frame snapped the look-at target
  // sideways, read as a sudden jump/flicker right as the outside/next-
  // factory view came into frame. Fixed by cross-fading FROM that same
  // TOP_VIEW.lookAt point TO the AMR10-tracked target over the first
  // LOOKAT_HANDOFF_T fraction of the exit phase (both AMR10 and the camera
  // are moving slowly there anyway, per their own easeInOutCubic curves, so
  // the handoff itself stays imperceptible) rather than snapping instantly.
  if (p > TOP_VIEW_END) {
    const amr10Local = getAmr10ExitTransform(exitT).position;
    const trackedLookAt = new THREE.Vector3(
      amr10Local[0] + INTERIOR1_POSITION[0],
      amr10Local[1] + INTERIOR1_POSITION[1] + 0.3,
      amr10Local[2] + INTERIOR1_POSITION[2]
    );
    const handoff = easeInOutCubic(Math.min(1, exitT / LOOKAT_HANDOFF_T));
    // lookAt here is still LOOKAT_CURVE.getPoint(t) from above (t is
    // continuous in p across the TOP_VIEW_END boundary, per
    // progressToCurveT), so at exitT=0 it equals TOP_VIEW.lookAt exactly —
    // the same value the curve-only branch produces one frame earlier —
    // making handoff=0 a continuous starting point for the blend.
    lookAt = lookAt.clone().lerp(trackedLookAt, handoff);
  }

  // fov/up still interpolate per-segment (a spline through 4 scalars/unit
  // vectors isn't meaningfully smoother than a plain lerp for this use),
  // but WITHOUT the per-segment ease-to-zero-velocity that caused the
  // jumpiness for position — a linear ramp for these is imperceptible.
  let fov;
  let up;
  if (p <= EXTERIOR_END) {
    const localT = p / EXTERIOR_END;
    fov = lerp(START.fov, B2_CLOSE.fov, localT);
    up = lerpUp(START.up, B2_CLOSE.up, localT);
  } else if (p <= FADE_END) {
    const localT = (p - EXTERIOR_END) / (FADE_END - EXTERIOR_END);
    fov = lerp(B2_CLOSE.fov, INTERIOR_REVEAL.fov, localT);
    up = lerpUp(B2_CLOSE.up, INTERIOR_REVEAL.up, localT);
  } else if (p <= MOVEMENT_END) {
    // Gradually lifting toward TOP_VIEW while the vehicles move.
    const localT = (p - FADE_END) / (MOVEMENT_END - FADE_END);
    fov = lerp(INTERIOR_REVEAL.fov, TOP_VIEW.fov, localT);
    up = lerpUp(INTERIOR_REVEAL.up, TOP_VIEW.up, localT);
  } else if (p <= TOP_VIEW_END) {
    // Resting at the finished top-down view.
    fov = TOP_VIEW.fov;
    up = TOP_VIEW.up;
  } else {
    // Pulling back down toward NEXT_FACTORY_REVEAL as AMR10 drives out.
    // OUTDOOR_FOV_BUMP widens the shot at the same midpoint the outdoor
    // lift above peaks at (outdoorMood is 0 at both ends of this branch —
    // see its own comment — so this stays continuous with the fov already
    // resting at TOP_VIEW.fov just before, and with NEXT_FACTORY_REVEAL.fov
    // exactly at arrival).
    const localT = (p - TOP_VIEW_END) / (EXIT_END - TOP_VIEW_END);
    fov = lerp(TOP_VIEW.fov, NEXT_FACTORY_REVEAL.fov, localT) + OUTDOOR_FOV_BUMP * outdoorMood;
    up = lerpUp(TOP_VIEW.up, NEXT_FACTORY_REVEAL.up, localT);
  }

  return {
    position: [position.x, position.y, position.z],
    lookAt: [lookAt.x, lookAt.y, lookAt.z],
    fov,
    up,
  };
}

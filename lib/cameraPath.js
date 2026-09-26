import * as THREE from "three";
import {
  EXTERIOR_END,
  FADE_END,
  MOVEMENT_END,
  TOP_VIEW_END,
  EXIT_END,
  FACTORY2_DRIVE_END,
  PARK_REVERSE_END,
  AMR50_DETECT_END,
  AMR50_APPROACH_END,
  AMR50_HITCH_END,
  AMR50_EXIT_END,
} from "./timeline";
import { getAmr50Position, FINAL_SCENE_POSITION, FINAL_SCENE_ROTATION_Y } from "./amr50Paths";
import {
  getExitT,
  getAmr10ExitTransform,
  getAmr10Rig,
  getBoxDetectProgress,
} from "./vehiclePaths";
import { B4_WORLD_CENTER } from "./exteriorLayout";
import {
  F2_TO_EXTERIOR_START,
  F2_TO_EXTERIOR_END,
  F3_TO_INTERIOR_START,
  TO_EXTERIOR_START,
  TO_EXTERIOR_END,
  TO_INTERIOR_START,
  TO_INTERIOR_END,
} from "./sceneTransition";

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
// NEXT_FACTORY_REVEAL -> spline tangent control only. The exit phase
//                     (AMR10 driving from Factory Interior 1 to Factory
//                     Interior 2) doesn't use the spline at all — see
//                     getExitCameraState below — but this point stays in
//                     WAYPOINTS so the INTERIOR_REVEAL -> TOP_VIEW
//                     segment's already-tuned curvature doesn't change.
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

// Same view/zoom as before, but camera + lookAt are both slid by
// START_SHIFT along +x/+z — on screen that reads as the model sitting
// further back, so its front edge isn't cropped at the bottom of the
// frame. Done on the camera rather than the model so B4 (and the Factory
// Interior 1 swap that happens in its place) stays where it is. Keep
// Experience.jsx's initial Canvas camera in sync.
const START_SHIFT = 0.7;
const START = {
  position: [6.75 + START_SHIFT, 5.8, 6.75 + START_SHIFT],
  lookAt: [START_SHIFT, 0.3, START_SHIFT],
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

// Where AMR10 ends up (see vehiclePaths.js's AMR10_EXIT_TARGET) — Factory
// Interior 2 at its own distinct world position (see
// components/scene/NextFactoryScene.jsx's POSITION), not a
// crossfade-in-place at INTERIOR_1_CENTER. Positioned PARALLEL to Factory
// Interior 1 and directly opposite it — same x, continued along the same
// -Z heading AMR10 already travels (nudged so AMR10 stops on its floor
// box). That model is centered on its own origin, so this equals its
// POSITION.
const NEXT_FACTORY_CENTER = [-1.5515, 0, -16.1596];

// Must match Interior1Scene.jsx's own exported POSITION — used below to
// convert AMR10's exit-path coordinates (local to that group) into world
// space, so the camera can track its actual live position during the exit
// phase rather than a fixed lookAt spline.
const INTERIOR1_POSITION = [-2.05, 0, -2.41];

// Exit-phase camera (TOP_VIEW_END..EXIT_END): top view -> side view ->
// corner top view, orbiting AMR10 as it drives from Factory Interior 1 to
// Factory Interior 2. Expressed as an orbit around a moving target —
// distance, elevation angle, azimuth, fov and up vector all blend together,
// so position and rotation can never disagree with each other and each
// swing is one smooth motion.
//
// Side view: camera off to AMR10's right (+X, AMR10 travels -Z), low and
// level, so AMR10 crosses the screen left -> right with Factory Interior 1
// behind it and Factory Interior 2 ahead. Going from TOP_VIEW (screen-up =
// -Z) to that framing (screen-up = +Y) is inherently a pitch AND a 90°
// roll; the roll angle is locked linearly to the same blend as the pitch
// (see getExitCameraState) so it reads as one steady banking swing rather
// than a roll that bunches up mid-move.
// Far enough back to frame both buildings whole: B4's far end (world z
// ~0.17) to B5's far end (~-17.26) is ~17.4m; at SIDE_VIEW_FOV 40° vertical
// on a 16:9 screen (~66° horizontal) fitting all of it needs ~13.5m. Pulled
// in from that to keep AMR10 readable — the view tracks AMR10, so the
// building it's leaving/approaching stays in frame while the far ends of
// the two buildings crop.
const SIDE_VIEW_DISTANCE = 10;
// In the side view the camera aims this far AHEAD of AMR10 (toward Factory
// 2, -Z), so the frame shows less of Factory 1 behind it and more of
// Factory 2 ahead. Scaled by the same side-view blend as everything else,
// so the top views are unaffected.
const SIDE_VIEW_LEAD = 2;
const SIDE_VIEW_ELEVATION = THREE.MathUtils.degToRad(15);
const SIDE_VIEW_FOV = 40;
const TOP_VIEW_HEIGHT = TOP_VIEW.position[1] - TOP_VIEW.lookAt[1];

// Corner top view of Factory Interior 2: high above its far-right corner
// (the far side AMR10 drives toward, on its right — the same side the side
// view is on, so the swing into it is a short continuation), looking down
// diagonally across the whole room at ~40°, so the floor box, AMR10's
// route around it and the surrounding factory all read clearly, facing
// AMR10's front three-quarters. The look-at target sits halfway between
// the room's center and AMR10 (on its travel line), so the camera drifts
// gently as AMR10 drives, keeping it near the middle of a frame that still
// takes in the whole factory.
const CORNER_VIEW_AZIMUTH = (3 * Math.PI) / 4; // toward +X / -Z from the target
const CORNER_VIEW_ELEVATION = THREE.MathUtils.degToRad(40);
const CORNER_VIEW_DISTANCE = 5.5;
const CORNER_VIEW_LOOK_HEIGHT = 0.2;
const CORNER_VIEW_AMR10_FOLLOW = 0.5; // 0 = room center, 1 = AMR10
const CORNER_VIEW_FOV = 42;

// Timing, as fractions of the exit phase (getExitT). Both swings share
// their windows with the Factory <-> B4/B5 crossfades (sceneTransition.js)
// so each camera move and building swap read as one beat:
//   0    .. 0.04 : top view as AMR10 sets off through Factory 1.
//   0.04 .. 0.52 : top view -> side view as AMR10 drives out of Factory 1
//                  and on into the gap, over exactly the window B4/B5
//                  materialise around the factories (sceneTransition.js) —
//                  long and soft, like the exterior -> Factory 1 fade.
//   0.52 .. 0.66 : side view of B4/B5 while AMR10 crosses the gap.
//   0.66 .. 0.97 : side view -> corner top view as AMR10 approaches and
//                  drives into Factory 2 (B5 dissolving back to Factory 2
//                  over 0.72..1.0) — the camera rises and swings an
//                  eighth-turn round (from AMR10's right side to Factory 2's
//                  far-right corner) and settles just before AMR10 reaches
//                  the box, which it drives straight on past, into its
//                  swerve, right after this phase ends.
const TO_SIDE_START = TO_EXTERIOR_START;
const TO_SIDE_END = TO_EXTERIOR_END;
// Starts while AMR10 is still crossing the gap so the ~135° swing gets
// ~100vh rather than ~65vh (it read as rushed at the shorter length).
const TO_CORNER_START = 0.66;
const TO_CORNER_END = 0.97;

// The look-at target hands off from Factory Interior 1's center (where
// TOP_VIEW rests) to AMR10's live position over the first
// LOOKAT_HANDOFF_T of the phase.
const LOOKAT_HANDOFF_T = 0.25;

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
// Knots: the scroll positions where the camera reaches each waypoint (index
// t = i/4). Between them the mapping is a monotone cubic (Fritsch–Carlson)
// rather than straight lines, so the camera carries smoothly through each
// waypoint instead of kinking where adjacent sections have different scroll
// lengths — and eases to a stop arriving at TOP_VIEW (slope 0 there) rather
// than halting dead, since it rests there next. Every waypoint is still
// reached at exactly the same scroll position.
function smoothKnotMap(p, ys) {
  const xs = [0, EXTERIOR_END, FADE_END, MOVEMENT_END];
  if (p >= MOVEMENT_END) return ys[3];
  const secants = [0, 1, 2].map((i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  // Speed at each interior waypoint = the slower neighbouring section's
  // average, so the camera still eases INTO its framings (e.g. slowing onto
  // the B2 close-up) rather than sweeping through them — just without the
  // abrupt speed jump. (Always monotone-safe for a Fritsch–Carlson cubic.)
  const slopes = [
    secants[0],
    Math.min(secants[0], secants[1]),
    Math.min(secants[1], secants[2]),
    0,
  ];
  const i = p <= EXTERIOR_END ? 0 : p <= FADE_END ? 1 : 2;
  const h = xs[i + 1] - xs[i];
  const u = (p - xs[i]) / h;
  const h00 = 2 * u * u * u - 3 * u * u + 1;
  const h10 = u * u * u - 2 * u * u + u;
  const h01 = -2 * u * u * u + 3 * u * u;
  const h11 = u * u * u - u * u;
  return h00 * ys[i] + h10 * h * slopes[i] + h01 * ys[i + 1] + h11 * h * slopes[i + 1];
}

// Spline index t (for the look-at curve and the per-segment fov/up blends).
function progressToCurveT(progress) {
  const p = Math.min(1, Math.max(0, progress));
  return smoothKnotMap(p, [0, 0.25, 0.5, 0.75]);
}

// The position spline's segments differ in length, so even a smooth index
// mapping leaves its SPEED jumping at each waypoint. So the camera position
// runs on arc length instead: the same knots, with each waypoint's share of
// the path's length — continuous actual speed through every waypoint.
// Fine arc-length table, so getPointAt lands on each waypoint precisely (the
// exit phase takes over from TOP_VIEW's exact position).
POSITION_CURVE.arcLengthDivisions = 4000;
const POSITION_ARC_AT_WAYPOINT = (() => {
  const N = 2000;
  const lengths = [0];
  let prev = POSITION_CURVE.getPoint(0);
  for (let i = 1; i <= N; i++) {
    const pt = POSITION_CURVE.getPoint(i / N);
    lengths.push(lengths[i - 1] + pt.distanceTo(prev));
    prev = pt;
  }
  const total = lengths[N];
  return [0, 1, 2, 3].map((k) => lengths[Math.round((k / 4) * N)] / total);
})();

function progressToArc(progress) {
  const p = Math.min(1, Math.max(0, progress));
  return smoothKnotMap(p, POSITION_ARC_AT_WAYPOINT);
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

// Linear-interpolate two unit vectors and re-normalize. Not a true slerp
// (angular velocity isn't perfectly constant), but for the ~90° up-vector
// swings used here (UP_DEFAULT <-> TOP_VIEW's up) it reads as a smooth
// continuous roll with no snap.
function lerpUp(a, b, t) {
  const x = lerp(a[0], b[0], t);
  const y = lerp(a[1], b[1], t);
  const z = lerp(a[2], b[2], t);
  const len = Math.sqrt(x * x + y * y + z * z);
  return len < 1e-6 ? UP_DEFAULT : [x / len, y / len, z / len];
}

function smoothRamp(t, start, end) {
  return easeInOutCubic(Math.min(1, Math.max(0, (t - start) / (end - start))));
}

// Gentler than easeInOutCubic (peak speed ~1.57x average instead of 3x) —
// used for the view swings themselves, which cover large angles and read
// as abrupt mid-move with a steeper curve.
function sineRamp(t, start, end) {
  const x = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

function getExitCameraState(p) {
  const exitT = getExitT(p);
  const side = sineRamp(exitT, TO_SIDE_START, TO_SIDE_END);
  const corner = sineRamp(exitT, TO_CORNER_START, TO_CORNER_END);

  // Top/side look-at target: Factory 1 center -> AMR10 (+ the side view's
  // lead toward Factory 2). At exitT=0 this is exactly TOP_VIEW.lookAt, so
  // it's continuous with the rest held just before TOP_VIEW_END.
  const amr10Local = getAmr10ExitTransform(exitT).position;
  const amr10World = new THREE.Vector3(
    amr10Local[0] + INTERIOR1_POSITION[0],
    amr10Local[1] + INTERIOR1_POSITION[1] + 0.3,
    amr10Local[2] + INTERIOR1_POSITION[2]
  );
  const target = new THREE.Vector3(...TOP_VIEW.lookAt).lerp(
    amr10World,
    smoothRamp(exitT, 0, LOOKAT_HANDOFF_T)
  );
  target.z -= SIDE_VIEW_LEAD * side;
  target.lerp(cornerViewTarget(p), corner);

  // Orbit: straight above -> off to +X (side view) -> up and round toward
  // -Z (corner view). azimuth is the camera's horizontal direction from the
  // target, measured from +Z toward +X.
  const elevation = lerp(
    lerp(Math.PI / 2, SIDE_VIEW_ELEVATION, side),
    CORNER_VIEW_ELEVATION,
    corner
  );
  const distance = lerp(
    lerp(TOP_VIEW_HEIGHT, SIDE_VIEW_DISTANCE, side),
    CORNER_VIEW_DISTANCE,
    corner
  );
  const azimuth = lerp(Math.PI / 2, CORNER_VIEW_AZIMUTH, corner);
  const ce = Math.cos(elevation);
  const position = [
    target.x + distance * ce * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * ce * Math.cos(azimuth),
  ];

  return {
    position,
    lookAt: [target.x, target.y, target.z],
    fov: lerp(lerp(TOP_VIEW.fov, SIDE_VIEW_FOV, side), CORNER_VIEW_FOV, corner),
    // Rotates TOP_VIEW.up (0,0,-1) toward UP_DEFAULT (0,1,0) at a constant
    // angular rate in `side` (a true slerp between the two, unlike lerpUp's
    // normalized lerp, which bunches most of the roll into the middle). It
    // never has an X component while the view direction never has a Z one
    // during that swing, so lookAt's basis stays well-defined. From the side
    // view on it's plain world up — every later view is well below vertical.
    up: [0, Math.sin((side * Math.PI) / 2), -Math.cos((side * Math.PI) / 2)],
  };
}

function amr10BodyWorld(progress) {
  const [x, y, z] = getAmr10Rig(progress).body.position;
  return [x + INTERIOR1_POSITION[0], y + INTERIOR1_POSITION[1], z + INTERIOR1_POSITION[2]];
}

// Corner-view look-at target: on AMR10's travel line (x fixed at its
// lane), halfway in depth between Factory 2's center and AMR10.
function cornerViewTarget(progress) {
  const laneX = amr10BodyWorld(EXIT_END)[0];
  const z = lerp(NEXT_FACTORY_CENTER[2], amr10BodyWorld(progress)[2], CORNER_VIEW_AMR10_FOLLOW);
  return new THREE.Vector3(laneX, CORNER_VIEW_LOOK_HEIGHT, z);
}

// AMR50 shot. Once AMR10 detects the Factory 2 floor box (reaches the point
// just short of it where it starts steering round — getBoxDetectProgress),
// the camera orbits all the way round to the OPPOSITE side of the factory
// and settles on a medium/wide shot with AMR50 as the subject, holding it
// while AMR10 carries on in the background.
//
// AMR50 is part of the Factory 2 model (its Blk#2 / grey#2 / White#3
// meshes): model-local bbox centre (-1.3588, 0.3622, 2.5023), ~0.72 tall —
// world ~(-0.19, 0.36, -18.66) via NextFactoryScene's POSITION and 180°
// rotation.
// The final shot: a wide, high view across Factory 2 — the trolley area
// bottom-left, the pallet racks top-right, AMR50 top-left, the conveyor
// along the bottom right, AMR10 near the middle. Fitted to a reference
// frame (landmarks projected through the camera, matched to where they sit
// in it): ~7 from the factory's middle, ~45° down.
const FINAL_SHOT_TARGET = [NEXT_FACTORY_CENTER[0], 0.2, NEXT_FACTORY_CENTER[2]];
const FINAL_SHOT_POSITION = [-6.351, 5.161, -14.967];

// A true orbit around the factory: the camera circles Factory 2's centre,
// sweeping round toward the opposite side (~165°), from where the corner view
// has it when the swing starts to the final shot — its radius, height and
// look-at point all easing between the two on the same curve, so it widens
// and rises steadily as it goes rather than changing distance abruptly. No
// zoom (fov fixed).
const ORBIT_PIVOT = [NEXT_FACTORY_CENTER[0], 0, NEXT_FACTORY_CENTER[2]];
// Scroll the orbit takes, as a fraction of the Factory 2 drive phase —
// slow, settling a little before the end of the phase.
const AMR50_SWING_SHARE = 0.6;
const AMR50_SWING_START = getBoxDetectProgress();
const AMR50_SWING_END =
  AMR50_SWING_START + AMR50_SWING_SHARE * (FACTORY2_DRIVE_END - EXIT_END);

function smootherstep(x) {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function orbitRamp(t, start, end) {
  return smootherstep(Math.min(1, Math.max(0, (t - start) / (end - start))));
}

// Corner view (identical to where getExitCameraState's corner swing
// settles, so the EXIT_END handoff is seamless).
function cornerViewPosition(target) {
  const ce = Math.cos(CORNER_VIEW_ELEVATION);
  return new THREE.Vector3(
    target.x + CORNER_VIEW_DISTANCE * ce * Math.sin(CORNER_VIEW_AZIMUTH),
    target.y + CORNER_VIEW_DISTANCE * Math.sin(CORNER_VIEW_ELEVATION),
    target.z + CORNER_VIEW_DISTANCE * ce * Math.cos(CORNER_VIEW_AZIMUTH)
  );
}

// The orbit's circle, from where the corner view has the camera at the
// moment the swing starts.
const ORBIT_START = cornerViewPosition(cornerViewTarget(AMR50_SWING_START));
const ORBIT_RADIUS_START = Math.hypot(ORBIT_START.x - ORBIT_PIVOT[0], ORBIT_START.z - ORBIT_PIVOT[2]);
const ORBIT_HEIGHT_START = ORBIT_START.y;
const ORBIT_AZIMUTH_START = Math.atan2(ORBIT_START.x - ORBIT_PIVOT[0], ORBIT_START.z - ORBIT_PIVOT[2]);
// Final shot, as a point on the same orbit around the pivot.
const ORBIT_RADIUS_END = Math.hypot(FINAL_SHOT_POSITION[0] - ORBIT_PIVOT[0], FINAL_SHOT_POSITION[2] - ORBIT_PIVOT[2]);
const ORBIT_HEIGHT_END = FINAL_SHOT_POSITION[1];
// Sweep forward (increasing azimuth) round to it — the way that passes the
// far side, the full swing to the opposite side of the factory.
const ORBIT_AZIMUTH_END = (() => {
  const raw = Math.atan2(FINAL_SHOT_POSITION[0] - ORBIT_PIVOT[0], FINAL_SHOT_POSITION[2] - ORBIT_PIVOT[2]);
  let a = raw;
  while (a <= ORBIT_AZIMUTH_START) a += 2 * Math.PI;
  return a;
})();
// Share of the orbit over which the corner view's gentle tracking of AMR10
// fades out (so the camera doesn't stop tracking dead as the orbit begins).
const TRACKING_FADE = 0.3;

// Once AMR10 starts reversing into the trolley area, the camera dollies in
// on AMR50 — moving physically closer along its current line of sight
// (natural perspective, fov unchanged) while the aim slides from the middle
// of the factory onto AMR50 — and settles ~5.8 from it, then holds its
// position. It's the separately-modelled AMR50 (amr50.glb, beside the one
// built into the factory model) — the one that then picks up the AMR50
// trolley — so once that starts moving the aim gently follows it (see
// AMR50_TRACKING) instead of the camera moving or zooming again.
//
// Factory 2 model-local -> world: x = -1.5515 - lx, z = -16.1596 - lz (its
// POSITION, turned 180°; see NextFactoryScene.jsx).
function factory2ToWorld([lx, ly, lz]) {
  return new THREE.Vector3(-1.5515 - lx, ly, -16.1596 - lz);
}
const AMR50_CENTRE = factory2ToWorld([-0.5975, 0.35, 2.5026]).toArray();
// How far the aim follows the moving AMR50 (1 = dead on it); eased in over
// the start of its approach.
const AMR50_TRACKING = 0.75;
// AMR50 leaves by driving straight along its trolley bay's axis (+x in the
// factory's frame), which heads under the camera. Past AMR50_TRACK_EASE_X
// the aim eases to a stop instead of following — a soft limit, so it glides
// to rest rather than halting — and AMR50 drives out of the bottom of a
// steady frame, rather than the view pitching down after it.
const AMR50_TRACK_EASE_X = 0.6;
const AMR50_TRACK_EASE_SPAN = 0.6;
function softLimit(x) {
  if (x <= AMR50_TRACK_EASE_X) return x;
  return AMR50_TRACK_EASE_X + AMR50_TRACK_EASE_SPAN * (1 - Math.exp(-(x - AMR50_TRACK_EASE_X) / AMR50_TRACK_EASE_SPAN));
}
const AMR50_ZOOM_DISTANCE = 5.8;
const AMR50_ZOOM_SHARE = 0.7; // of the reverse phase
const AMR50_ZOOM_POSITION = (() => {
  const d = [0, 1, 2].map((i) => FINAL_SHOT_POSITION[i] - AMR50_CENTRE[i]);
  const len = Math.hypot(...d);
  return d.map((v, i) => AMR50_CENTRE[i] + (v / len) * AMR50_ZOOM_DISTANCE);
})();

// Factory 2 camera from EXIT_END on: the corner view, the orbit round to
// the wide shot, then the dolly in on AMR50.
function getFactory2BaseView(p) {
  const u = orbitRamp(p, AMR50_SWING_START, AMR50_SWING_END);
  const cornerTarget = cornerViewTarget(p);
  const azimuth = lerp(ORBIT_AZIMUTH_START, ORBIT_AZIMUTH_END, u);
  const radius = lerp(ORBIT_RADIUS_START, ORBIT_RADIUS_END, u);
  const position = new THREE.Vector3(
    ORBIT_PIVOT[0] + radius * Math.sin(azimuth),
    lerp(ORBIT_HEIGHT_START, ORBIT_HEIGHT_END, u),
    ORBIT_PIVOT[2] + radius * Math.cos(azimuth)
  );
  // Before the orbit this is exactly the (tracking) corner view; the
  // tracking then eases out over the first part of the orbit.
  const tracking = cornerViewPosition(cornerTarget).sub(ORBIT_START);
  position.addScaledVector(tracking, 1 - smootherstep(Math.min(1, u / TRACKING_FADE)));
  const lookAt = cornerTarget.lerp(new THREE.Vector3(...FINAL_SHOT_TARGET), u);
  const z = orbitRamp(
    p,
    FACTORY2_DRIVE_END,
    FACTORY2_DRIVE_END + AMR50_ZOOM_SHARE * (PARK_REVERSE_END - FACTORY2_DRIVE_END)
  );
  if (z > 0) {
    position.lerp(new THREE.Vector3(...AMR50_ZOOM_POSITION), z);
    lookAt.lerp(new THREE.Vector3(...AMR50_CENTRE), z);
  }
  if (p > AMR50_DETECT_END) {
    const w =
      AMR50_TRACKING *
      orbitRamp(p, AMR50_DETECT_END, AMR50_DETECT_END + 0.3 * (AMR50_APPROACH_END - AMR50_DETECT_END));
    const [lx, , lz] = getAmr50Position(p);
    lookAt.lerp(factory2ToWorld([softLimit(lx), AMR50_CENTRE[1], lz]), w);
  }
  return { position, lookAt };
}

// Once AMR50 sets off out of the factory with the trolley, the camera
// follows it and rises into a top-down view — the same camera move as the
// Factory 1/B4 -> Factory 2/B5 swings (getExitCameraState): an orbit around
// a moving target whose elevation blends on a sine ease, with the orbit's
// natural up vector (Y·cos(elevation) − dir·sin(elevation)) so the image
// never rolls or snaps on the way to straight overhead.
//
// The target slides from wherever the view was aimed onto AMR50 itself and
// then tracks it exactly (AMR50 centred); distance eases to
// AMR50_TOP_DISTANCE so AMR50 and its trolley stay clearly in frame. The
// orbit keeps the side it starts on (no extra swing round), so from above
// AMR50 travels down the screen.
const AMR50_TOP_DISTANCE = 5.5;
// AMR50 drives toward world -x on its way to Factory 3; the side view looks
// at it from its left-hand side, world +z (azimuth 0) — also the shorter
// swing (~80°) round from where the top view has the camera.
const AMR50_SIDE_AZIMUTH = 0;

// Closing shot of the Final Scene, fitted to the client's reference render:
// an elevated three-quarter view of the whole room from its +x/+z corner
// (model frame) — robot arm and conveyor at the bottom, pallet rack and APT
// at the top, AMR50 coming in from the upper left down the aisle through
// the middle. The model is turned half round in the world
// (FINAL_SCENE_ROTATION_Y), so that corner is world -x/-z: the camera swings
// from AMR50's left side round ahead of it. It takes over from the side view
// as B2 dissolves into the Final Scene and AMR50 drives in, and settles as
// AMR50 stops.
const FINAL_VIEW_TARGET = new THREE.Vector3(
  FINAL_SCENE_POSITION[0],
  0.2,
  FINAL_SCENE_POSITION[2] - 0.25
);
const FINAL_VIEW_AZIMUTH = THREE.MathUtils.degToRad(50) - FINAL_SCENE_ROTATION_Y;
const FINAL_VIEW_ELEVATION = THREE.MathUtils.degToRad(26);
const FINAL_VIEW_DISTANCE = 7.5;
const FINAL_VIEW_FOV = 42;
const AMR50_TOP_SHARE = 0.6; // of the drive-out phase
const AMR50_TOP_START = (() => {
  const { position, lookAt } = getFactory2BaseView(AMR50_HITCH_END);
  const off = position.clone().sub(lookAt);
  const distance = off.length();
  return {
    distance,
    elevation: Math.asin(off.y / distance),
    azimuth: Math.atan2(off.x, off.z),
  };
})();

function getFactory2CameraState(p) {
  const base = getFactory2BaseView(p);
  if (p <= AMR50_HITCH_END) {
    return {
      position: base.position.toArray(),
      lookAt: base.lookAt.toArray(),
      fov: CORNER_VIEW_FOV,
      up: UP_DEFAULT,
    };
  }
  const u = sineRamp(p, AMR50_HITCH_END, AMR50_HITCH_END + AMR50_TOP_SHARE * (AMR50_EXIT_END - AMR50_HITCH_END));
  // Then, as AMR50 leaves Factory 2 for Factory 3, the side view — the same
  // swing as AMR10's Factory 1 -> 2 crossing (SIDE_VIEW_* distance,
  // elevation, lead and fov), over exactly the window Factory 2 crossfades
  // into a B4 and Factory 3 (B2) appears (sceneTransition.js), so the two stay locked
  // together. It swings round to AMR50's left-hand side and aims
  // SIDE_VIEW_LEAD ahead of it, toward Factory 3.
  const v = sineRamp(p, F2_TO_EXTERIOR_START, F2_TO_EXTERIOR_END);
  const [lx, , lz] = getAmr50Position(p);
  const amr50 = factory2ToWorld([lx + SIDE_VIEW_LEAD * v, AMR50_CENTRE[1], lz]);
  const target = base.lookAt.lerp(amr50, u);
  const { distance: d0, elevation: e0, azimuth: a0 } = AMR50_TOP_START;
  const elevation = lerp(lerp(e0, Math.PI / 2, u), SIDE_VIEW_ELEVATION, v);
  const distance = lerp(lerp(d0, AMR50_TOP_DISTANCE, u), SIDE_VIEW_DISTANCE, v);
  const azimuth = lerp(a0, AMR50_SIDE_AZIMUTH, v);
  // Finally, into the Final Scene's closing shot.
  const w = sineRamp(p, F3_TO_INTERIOR_START, AMR50_EXIT_END);
  target.lerp(FINAL_VIEW_TARGET, w);
  const finalElevation = lerp(elevation, FINAL_VIEW_ELEVATION, w);
  const finalDistance = lerp(distance, FINAL_VIEW_DISTANCE, w);
  const finalAzimuth = lerp(azimuth, FINAL_VIEW_AZIMUTH, w);
  const dirX = Math.sin(finalAzimuth);
  const dirZ = Math.cos(finalAzimuth);
  const ce = Math.cos(finalElevation);
  const se = Math.sin(finalElevation);
  return {
    position: [
      target.x + finalDistance * ce * dirX,
      target.y + finalDistance * se,
      target.z + finalDistance * ce * dirZ,
    ],
    lookAt: [target.x, target.y, target.z],
    fov: lerp(lerp(CORNER_VIEW_FOV, SIDE_VIEW_FOV, v), FINAL_VIEW_FOV, w),
    up: [-dirX * se, ce, -dirZ * se],
  };
}

export function getCameraState(progress) {
  const p = Math.min(1, Math.max(0, progress));
  if (p > EXIT_END) return getFactory2CameraState(p);
  if (p > TOP_VIEW_END) return getExitCameraState(p);

  const t = progressToCurveT(p);
  const position = POSITION_CURVE.getPointAt(progressToArc(p));
  const lookAt = LOOKAT_CURVE.getPoint(t);

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
  } else {
    // Resting at the finished top-down view.
    fov = TOP_VIEW.fov;
    up = TOP_VIEW.up;
  }

  return {
    position: [position.x, position.y, position.z],
    lookAt: [lookAt.x, lookAt.y, lookAt.z],
    fov,
    up,
  };
}

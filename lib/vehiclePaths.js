import {
  FADE_END,
  MOVEMENT_END,
  TOP_VIEW_END,
  EXIT_END,
  FACTORY2_DRIVE_END,
  PARK_REVERSE_END,
  SCROLL_LENGTH_VH,
} from "./timeline";

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
// AMR10 starts back behind the room's near wall (z ~2.57), out of the
// room-reveal camera's frame along with its radar rings (which reach ~1m
// round it; checked by rendering that frame), and drives in once the
// Forklift is on its way (see AMR10_SET_OFF_T).
export const AMR10_START = [0.505505, 0, 3.5];
// Where AMR10 used to stop at the end of the movement phase, before the exit
// drive. It no longer stops there — it drives on from STOP_POINT in one go —
// but the exit drive's timing (and so the camera's and the building
// crossfades', which are keyed to it) is still laid out from here.
const AMR10_END = [0.505505, 0, -2.6];

export const FORKLIFT_START = [-2.554975, 0, -0.625155];
export const FORKLIFT_END = [2.5, 0, -0.625155];

// End of AMR10's straight run (a waypoint it drives through, not a stop —
// see the continuous drive below), out through Factory Interior 1's far
// wall and across an outdoor gap, into Factory Interior 2
// (see components/scene/NextFactoryScene.jsx). Per request, the second
// factory sits PARALLEL to Factory Interior 1 — directly opposite it along
// the same aisle/x-alignment AMR10 already travels, a straight crossing
// rather than a diagonal detour toward Building B3's real site-plan
// position. This target is expressed in Interior1Scene's local frame
// (relative to its own POSITION [-2.05, 0, -2.41]): world (-1.5445, -13.4236)
// — just short of Factory Interior 2's floor box (see
// NextFactoryScene.jsx's POSITION), which is lined up on this same x. The
// box's near face is at world z -14.4106; AMR10 + Trolley is ~0.974 long
// (half 0.487 along its heading) so this leaves a ~0.5 gap to its nose —
// the room it needs to swerve around the box smoothly while driving (see
// the Factory 2 swerve below).
export const AMR10_EXIT_TARGET = [0.505505, 0, -11.0136];

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
// getMovementT below). The Forklift sets off first, driving its aisle the
// whole phase (eased, t 0..1):
//   [0, SET_OFF_T]        AMR10 waits out of view, at START
//   [SET_OFF_T, ARRIVE_T] once the Forklift is on its way toward the
//                         crossing (~15% along, x ~-1.8), AMR10 drives in
//                         and stops at STOP_POINT as the Forklift is about
//                         to reach it (~53% along, x ~0.1, the crossing at
//                         x 0.51)
//   [ARRIVE_T, ...]       holds at STOP_POINT while the Forklift passes
// It sets off again only once the Forklift has driven its whole aisle and
// parked (it's past crossing + FORKLIFT_CLEAR_MARGIN from t ~0.61, its
// S-curve, and parked at t 1): just after MOVEMENT_END, as the camera rests
// in its top view (see getAmr10ResumeProgress) — and drives straight on out
// of Factory 1 into Factory 2 in one go (see getAmr10DriveDistance), without
// stopping at the far wall.
const AMR10_SET_OFF_T = 0.33;
const AMR10_ARRIVE_T = 0.52;

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

// Scroll pacing for the movement phase. Its choreography runs on t (0-1),
// but AMR10 covers 1.7m in its first 37% of t and 3m in its last 20%, and
// the Forklift peaks mid-way — so a linear scroll -> t mapping had AMR10
// racing at up to ~14m per 100vh on its second leg, against ~2-2.75 for
// every other AMR section. Instead the phase's scroll is spread over t in
// proportion to how fast the fastest vehicle is moving at that t (plus a
// steady share, MOVEMENT_HOLD_VH, for the pause and the ease in/out), so
// whichever vehicle is moving does so at about MOVEMENT_PACE m per vh of
// scroll — the same rate as the other sections. The paths and their easing
// are untouched; only where along the scroll each t falls changes. The
// phase's length in timeline.js (MOVEMENT) is this mapping's total, ~440vh.
const MOVEMENT_PACE = 0.024; // metres per vh, at cruising speed
const MOVEMENT_HOLD_VH = 150; // vh per unit of t, on top of the travel share
const MOVEMENT_SAMPLES = 2000;
let movementScrollTable = null; // cumulative scroll share at t = i / MOVEMENT_SAMPLES, 0-1

function planarSpeed(transform, t) {
  const t0 = Math.max(0, t - 1e-4);
  const t1 = Math.min(1, t + 1e-4);
  const a = transform(t0).position;
  const b = transform(t1).position;
  return Math.hypot(b[0] - a[0], b[2] - a[2]) / (t1 - t0);
}

function getMovementScrollTable() {
  if (movementScrollTable) return movementScrollTable;
  const weight = (t) =>
    Math.max(planarSpeed(getAmr10Transform, t), planarSpeed(getForkliftTransform, t)) /
      MOVEMENT_PACE +
    MOVEMENT_HOLD_VH;
  const table = [0];
  let total = 0;
  let prev = weight(0);
  for (let i = 1; i <= MOVEMENT_SAMPLES; i++) {
    const w = weight(i / MOVEMENT_SAMPLES);
    total += (w + prev) / 2 / MOVEMENT_SAMPLES;
    table.push(total);
    prev = w;
  }
  movementScrollTable = table.map((v) => v / total);
  return movementScrollTable;
}

/** Maps raw scroll progress to the movement phase's local t (0-1). */
export function getMovementT(progress) {
  if (progress <= FADE_END) return 0;
  if (progress >= MOVEMENT_END) return 1;
  const u = (progress - FADE_END) / (MOVEMENT_END - FADE_END);
  const table = getMovementScrollTable();
  let lo = 0;
  let hi = MOVEMENT_SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = table[hi] - table[lo];
  return (lo + (span > 0 ? (u - table[lo]) / span : 0)) / MOVEMENT_SAMPLES;
}

/** AMR10's pose during the movement phase, before it sets off for Factory 2, by movement t. */
// AMR10's approach isn't a symmetric ease — it reacts to the Forklift. It
// picks up speed, cruises in, and then, as it detects the Forklift ahead
// (AMR10_DETECT_T, when its radar brightens; see getAmr10Alert), brakes
// quickly down to a slow creep, creeps on cautiously, and stops. Its speed
// profile over the approach's own time u (0-1), relative to cruising speed:
//   [0, 0.15]     speeding up, 0 -> 1
//   [0.15, 0.4]   cruising
//   [0.4, 0.55]   detected: braking, 1 -> CREEP
//   [0.55, 0.88]  creeping
//   [0.88, 1]     stopping, CREEP -> 0
// (CREEP is low: the movement phase's scroll pacing, getMovementT, evens
// speeds out against the Forklift's, which is at full speed here, so on
// screen the creep reads at roughly twice this.)
// Every change of speed eases in and out (smootherstep), and it's zero at
// both ends, as before. Distance is its integral (APPROACH_PROFILE).
const CREEP = 0.15;
const APPROACH_SPEED_KEYS = [
  [0, 0],
  [0.15, 1],
  [0.4, 1],
  [0.55, CREEP],
  [0.88, CREEP],
  [1, 0],
];
const AMR10_DETECT_T = AMR10_SET_OFF_T + 0.4 * (AMR10_ARRIVE_T - AMR10_SET_OFF_T);

function approachSpeed(u) {
  let i = 0;
  while (i < APPROACH_SPEED_KEYS.length - 2 && u > APPROACH_SPEED_KEYS[i + 1][0]) i++;
  const [u0, v0] = APPROACH_SPEED_KEYS[i];
  const [u1, v1] = APPROACH_SPEED_KEYS[i + 1];
  const x = Math.min(1, Math.max(0, (u - u0) / (u1 - u0)));
  return v0 + (v1 - v0) * x * x * x * (x * (x * 6 - 15) + 10);
}

// Cumulative distance (0-1) at u = i / APPROACH_SAMPLES.
const APPROACH_SAMPLES = 1000;
const APPROACH_PROFILE = (() => {
  const d = [0];
  for (let i = 1; i <= APPROACH_SAMPLES; i++) {
    const u0 = (i - 1) / APPROACH_SAMPLES;
    const u1 = i / APPROACH_SAMPLES;
    d.push(d[i - 1] + ((approachSpeed(u0) + approachSpeed(u1)) / 2) * (u1 - u0));
  }
  return d.map((v) => v / d[APPROACH_SAMPLES]);
})();

function approachProgress(u) {
  const x = Math.min(1, Math.max(0, u)) * APPROACH_SAMPLES;
  const i = Math.min(APPROACH_SAMPLES - 1, Math.floor(x));
  return APPROACH_PROFILE[i] + (APPROACH_PROFILE[i + 1] - APPROACH_PROFILE[i]) * (x - i);
}

export function getAmr10Transform(t) {
  const localT = approachProgress((t - AMR10_SET_OFF_T) / (AMR10_ARRIVE_T - AMR10_SET_OFF_T));
  // Waiting out of view, driving in, then paused clear of the crossing while
  // the Forklift passes.
  return {
    position: lerpVec3(AMR10_START, STOP_POINT, localT),
    rotationY: VEHICLE_ROTATION_Y,
  };
}

// How long the radar takes to settle back once AMR10 pulls away again.
export const ALERT_CLEAR_VH = 60;

/**
 * AMR10's "detected something" level (0-1) — its radar rings brighten with
 * it (Interior1Scene). Comes up quickly as it detects the Forklift and
 * starts slowing (AMR10_DETECT_T), holds while it waits for it to pass, and
 * settles back once it's clear and pulling away.
 */
export function getAmr10Alert(progress) {
  const t = getMovementT(progress);
  const on = easeInOutCubic(Math.min(1, Math.max(0, (t - AMR10_DETECT_T) / 0.03)));
  const off = easeInOutCubic(
    Math.min(1, Math.max(0, ((progress - getAmr10ResumeProgress()) * SCROLL_LENGTH_VH) / ALERT_CLEAR_VH))
  );
  return on * (1 - off);
}

// Scroll progress at which the movement phase reaches local t — getMovementT
// only ever increases, so a bisection is exact.
function getMovementProgressAt(t) {
  let lo = FADE_END;
  let hi = MOVEMENT_END;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (getMovementT(mid) < t) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Scroll progress at which AMR10 comes to a stop short of the crossing
 * (AMR10_ARRIVE_T), radar lit, as the Forklift reaches it — for anything
 * keyed to that moment (e.g. the safety card, see StoryOverlay.jsx).
 */
let amr10ArriveProgress = null;
export function getAmr10ArriveProgress() {
  amr10ArriveProgress ??= getMovementProgressAt(AMR10_ARRIVE_T);
  return amr10ArriveProgress;
}

/** Maps raw scroll progress to the exit phase's local t (0-1). */
export function getExitT(progress) {
  if (progress <= TOP_VIEW_END) return 0;
  if (progress >= EXIT_END) return 1;
  return (progress - TOP_VIEW_END) / (EXIT_END - TOP_VIEW_END);
}

// AMR10's drive from Factory Interior 1 to the far end of Factory Interior 2
// is ONE continuous drive: straight from STOP_POINT, through the crossing
// and out of Factory 1, to AMR10_EXIT_TARGET (in front of the Factory 2
// floor box — a waypoint, not a stop), then straight on into the swerve
// around the box and down to the far end (DODGE_PATH below).
//
// Its timing from TOP_VIEW_END on is laid out as it always was, as a drive
// from AMR10_END (getLaidOutDistance below) — the camera's swings and the
// building crossfades are keyed to where AMR10 is then. AMR10 just gets
// there without stopping: it sets off from STOP_POINT earlier, during the
// movement phase, and accelerates steadily to exactly the laid-out drive's
// cruising speed, reaching it at TOP_VIEW_END on the line that drive cruises
// along — so it joins it where that drive has finished accelerating and is
// on it from then on (getAmr10DriveDistance).
//
// Speed profile is a single trapezoid over that whole distance: accelerate
// over the first DRIVE_ACCEL_T, cruise at constant speed straight through
// the box area and the swerve, then brake over the last DRIVE_BRAKE_T into
// the final stop. (An earlier version braked to a dead stop at the box and
// set off again, which read as the animation ending there.) Velocity is
// zero at both ends (bordering the frozen rests either side) and
// continuous throughout, so there's no jolt in either scroll direction.
// Fractions of the whole TOP_VIEW_END..FACTORY2_DRIVE_END span: ~35vh to
// get going, ~62vh to brake at the end.
const DRIVE_ACCEL_T = (0.1 * (EXIT_END - TOP_VIEW_END)) / (FACTORY2_DRIVE_END - TOP_VIEW_END);
const DRIVE_BRAKE_T = (0.25 * (FACTORY2_DRIVE_END - EXIT_END)) / (FACTORY2_DRIVE_END - TOP_VIEW_END);

function trapezoidProgress(t, accel, brake) {
  const v = 1 / (1 - accel / 2 - brake / 2); // cruise speed
  if (t < accel) return (v * t * t) / (2 * accel);
  if (t > 1 - brake) return 1 - (v * (1 - t) * (1 - t)) / (2 * brake);
  return v * (t - accel / 2);
}

const LAID_OUT_STRAIGHT = Math.hypot(
  AMR10_EXIT_TARGET[0] - AMR10_END[0],
  AMR10_EXIT_TARGET[2] - AMR10_END[2]
);
// STOP_POINT -> AMR10_END, the stretch AMR10 now drives before that.
const LEAD_STRAIGHT = STOP_POINT[2] - AMR10_END[2];
const EXIT_STRAIGHT_LENGTH = LEAD_STRAIGHT + LAID_OUT_STRAIGHT;

/** Metres along the laid-out drive from AMR10_END at `progress` (TOP_VIEW_END on). */
function getLaidOutDistance(progress) {
  const t = Math.min(
    1,
    Math.max(0, (progress - TOP_VIEW_END) / (FACTORY2_DRIVE_END - TOP_VIEW_END))
  );
  return trapezoidProgress(t, DRIVE_ACCEL_T, DRIVE_BRAKE_T) * (LAID_OUT_STRAIGHT + DODGE_PATH.total);
}

// The laid-out drive's cruising speed, in metres per unit of scroll progress,
// and where its cruise line is at TOP_VIEW_END (metres from STOP_POINT):
// AMR10 is accelerating up to that speed until then (and, from STOP_POINT,
// is already on the cruise line) — it meets the laid-out drive where that
// finishes accelerating.
// (Worked out on first use: DODGE_PATH is defined further down.)
let cruise = null;
function getCruise() {
  if (!cruise) {
    const speed =
      (LAID_OUT_STRAIGHT + DODGE_PATH.total) /
      (1 - DRIVE_ACCEL_T / 2 - DRIVE_BRAKE_T / 2) /
      (FACTORY2_DRIVE_END - TOP_VIEW_END);
    cruise = {
      speed,
      leadIn: LEAD_STRAIGHT - (speed * DRIVE_ACCEL_T * (FACTORY2_DRIVE_END - TOP_VIEW_END)) / 2,
    };
  }
  return cruise;
}

/**
 * Scroll progress at which AMR10 sets off from STOP_POINT: early enough to
 * accelerate evenly up to the laid-out drive's cruising speed by TOP_VIEW_END.
 */
export function getAmr10ResumeProgress() {
  const { speed, leadIn } = getCruise();
  return TOP_VIEW_END - (2 * leadIn) / speed;
}

/** Metres AMR10 has driven from STOP_POINT, along its route to Factory 2, at `progress`. */
function getAmr10DriveDistance(progress) {
  const { speed, leadIn } = getCruise();
  const resume = getAmr10ResumeProgress();
  if (progress <= resume) return 0;
  if (progress <= TOP_VIEW_END) {
    const u = (progress - resume) / (TOP_VIEW_END - resume);
    return leadIn * u * u;
  }
  // Cruising while the laid-out drive is still accelerating, then on it: the
  // two meet exactly where it reaches the same cruising speed, so there's no
  // jolt.
  if (progress - TOP_VIEW_END < DRIVE_ACCEL_T * (FACTORY2_DRIVE_END - TOP_VIEW_END)) {
    return leadIn + speed * (progress - TOP_VIEW_END);
  }
  return LEAD_STRAIGHT + getLaidOutDistance(progress);
}

/**
 * Scroll progress at which AMR10 reaches AMR10_EXIT_TARGET — the point just
 * short of the Factory 2 floor box where it "detects" the box and starts
 * steering around it. Solved once from the drive's own speed profile (the
 * drive distance only ever increases, so a bisection is exact), so anything
 * keyed to that moment (e.g. the camera, see cameraPath.js) stays in sync if
 * the timing or route changes.
 */
export function getBoxDetectProgress() {
  let lo = TOP_VIEW_END;
  let hi = FACTORY2_DRIVE_END;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (getAmr10DriveDistance(mid) < EXIT_STRAIGHT_LENGTH) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * AMR10's combined-centre pose during the exit phase, by exit-phase t —
 * used by the camera to track it. On the straight it's a point on the
 * line; if it's already into the swerve, its combined centre on the path.
 */
export function getAmr10ExitTransform(exitT) {
  const clamped = Math.min(1, Math.max(0, exitT));
  const d = getAmr10DriveDistance(TOP_VIEW_END + clamped * (EXIT_END - TOP_VIEW_END));
  if (d <= EXIT_STRAIGHT_LENGTH) {
    return {
      position: lerpVec3(STOP_POINT, AMR10_EXIT_TARGET, d / EXIT_STRAIGHT_LENGTH),
      rotationY: VEHICLE_ROTATION_Y,
    };
  }
  const p = samplePath((d - EXIT_STRAIGHT_LENGTH) / DODGE_PATH.total);
  return { position: fromPathLocal(p.lat, p.fwd), rotationY: VEHICLE_ROTATION_Y + p.heading };
}

// ---------------------------------------------------------------------------
// Factory 2 swerve (the tail of AMR10's single continuous drive — see
// getAmr10DriveDistance): from AMR10_EXIT_TARGET just short of the floor box,
// AMR10 carries straight on into a swerve left around the box, curves back
// right into its lane, and drives straight on to the far end of Factory
// Interior 2.
//
// Worked in a path-local 2D frame relative to AMR10_EXIT_TARGET: `lat` is
// metres to AMR10's LEFT (world -X — it faces -Z), `fwd` metres ahead
// (world -Z). The box's footprint in that frame is lat [-0.198, 0.198],
// fwd [0.987, 1.324] (see NextFactoryScene.jsx), and AMR10 + Trolley is
// 0.974 x 0.30.
//
// No pivoting on the spot — it steers out while driving, starting and
// ending every curve dead straight (so the turn rate eases in and out).
// Swerve width/length were checked by sweeping the full footprints (AMR10
// body and its towed trolley) against the box: from 0.5 short of it, a
// 0.6 sideways shift over 1.2 forward keeps >= ~13cm clear throughout (~25cm
// while alongside the box), peak heading ~45°.
// Heading always follows the path tangent (no sideways sliding).
const DODGE_LATERAL = 0.6; // lane offset while passing the box
const DODGE_OUT_END = 1.2; // fwd where AMR10 is fully out in its side lane
// After the box, instead of curving back into its lane, AMR10 makes a right
// turn (radius ~0.8) onto PARK_LINE_FWD — a straight line across its lane
// that runs through the middle of the trolley area's corner gap — and
// drives just far enough along it, away from the area, for the trolley to
// straighten out behind it (to within ~0.7°) before it stops. Kept as close
// to its lane as that allows (~0.8 past it) rather than swinging far out.
const DODGE_TURN_START = 3.1; // fwd where it starts the right turn (well past the box)
const DODGE_TURN_HANDLE = 0.7; // shapes the turn (fraction of its radius)
const DODGE_STOP_LAT = -0.8; // stop here on the line, rig straight

// Reverse into the trolley area (FACTORY2_DRIVE_END..PARK_REVERSE_END).
// Factory 2 model-local (lx, lz) maps to this frame as lat = lx + 0.007,
// fwd = lz + 2.736. The area (the model's "Trolley Flat" units): three
// trolleys parked in a zigzag of columns 0.464 apart (model lx 2.9415 and
// 2.4775), all with their drawbar toward the far end — the same way ours
// faces while towed. A barricade runs across its near side (fwd ~3.45, lat
// >= 1.78) and down its lane side (lat ~1.32, fwd 4.41..5.88), with a gap
// at that corner. The free slot continuing the zigzag is the next column
// over (lx 2.0135) in the first trolley's row (rails lz 0.977..1.356).
//
// From its stop, AMR10 reverses dead straight back along that line, through
// the gap and into the area, and stays there with the trolley still
// hitched, side-on (it doesn't have to line up with the other trolleys) —
// nothing turns inside the area. The line is the widest straight
// corridor through the gap (~20cm spare each side of the rig); the trolley
// stops short of the parked trolleys and rack. Planned by sweeping both
// footprints against an obstacle map rasterised from the Factory 2 model
// (everything taller than ~12cm): >= ~15cm clear throughout.
const PARK_LINE_FWD = 3.88; // the straight line through the gap
// Trolley centre when parked: deep enough that AMR10 ends fully inside the
// barricades too (~0.15 past the gap), ~11cm short of the parked trolley ahead.
const PARK_TROLLEY_LAT = 2.45;

function cubicBezier2(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// AMR10 + Trolley rig geometry, in metres along AMR10's heading, measured
// from the combined model's centre (the point every phase's pose above is
// expressed for — AMR10_LOCAL_CENTER in Interior1Scene). From the separate
// amr10.glb / amr10-trolley.glb bboxes (shared source frame, forward +Z):
// AMR10's body spans z [-2.658, -2.203] (centre -2.4305), the tow hitch pin
// sits at z -2.72 where its bar meets the trolley, and the trolley spans
// z [-3.177, -2.696] (centre -2.9365); the combined model's centre is z -2.690.
export const AMR10_BODY_OFFSET = 0.2595; // AMR10 body centre, ahead of the combined centre
export const AMR10_HITCH_OFFSET = -0.03; // hitch pin, just behind the combined centre
const TROLLEY_TOW_LENGTH = 0.2165; // hitch pin -> trolley centre (its wheelbase pivot)

// Samples the whole drive path once, with cumulative arc length, so AMR10
// can move along it at the trapezoid speed profile by distance (constant
// speed through the curves, not bunched by curve parameterization).
//
// The path is the COMBINED centre's path (what the box clearance above was
// swept against); AMR10's body is driven along that same curve shifted
// forward by AMR10_BODY_OFFSET — identical at the straight start/end, where
// it must line up with the exit drive and the rest pose.
//
// The trolley isn't rigidly attached: it's towed on its hitch, with the
// standard trailer constraint (its wheels can't slide sideways), so its
// heading turns toward wherever the hitch pulls it —
//   d(trolleyHeading) = (hitch displacement · trolley's left normal) / towLength
// — integrated once along the whole path here. It lags into each turn,
// cuts slightly inside it, and straightens out on its own afterwards, like
// a real towed cart. Precomputed per sample (not simulated per frame), so
// scrubbing backward retraces exactly the same poses.
const DODGE_PATH = (() => {
  const L = DODGE_LATERAL;
  const turnEndLat = L - (PARK_LINE_FWD - DODGE_TURN_START); // ~quarter turn
  const turnSpan = PARK_LINE_FWD - DODGE_TURN_START;
  const segments = [
    // S-curve out to the left into the side lane.
    (t) => {
      const h = DODGE_OUT_END / 2;
      return cubicBezier2([0, 0], [0, h], [L, DODGE_OUT_END - h], [L, DODGE_OUT_END], t);
    },
    // Past the box, straight in the side lane.
    (t) => [L, DODGE_OUT_END + (DODGE_TURN_START - DODGE_OUT_END) * t],
    // Wide right turn onto the line through the gap.
    (t) =>
      cubicBezier2(
        [L, DODGE_TURN_START],
        [L, DODGE_TURN_START + DODGE_TURN_HANDLE * turnSpan],
        [turnEndLat + DODGE_TURN_HANDLE * turnSpan, PARK_LINE_FWD],
        [turnEndLat, PARK_LINE_FWD],
        t
      ),
    // Straight along the line, away from the area, to straighten the trolley.
    (t) => [turnEndLat + (DODGE_STOP_LAT - turnEndLat) * t, PARK_LINE_FWD],
  ];
  const SAMPLES = 600;
  const points = [];
  for (const seg of segments) {
    for (let i = points.length ? 1 : 0; i <= SAMPLES; i++) points.push(seg(i / SAMPLES));
  }
  const n = points.length;

  // Heading (radians LEFT of straight ahead) from central differences.
  const headings = points.map((_, i) => {
    const p = points[Math.max(0, i - 1)];
    const q = points[Math.min(n - 1, i + 1)];
    return Math.atan2(q[0] - p[0], q[1] - p[1]);
  });
  headings[0] = 0; // path starts straight ahead and ends straight along the line
  headings[n - 1] = -Math.PI / 2;

  const lengths = [0];
  for (let i = 1; i < n; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }

  // Hitch pin path, then the towed trolley's heading along it.
  const hitch = points.map((p, i) => [
    p[0] + AMR10_HITCH_OFFSET * Math.sin(headings[i]),
    p[1] + AMR10_HITCH_OFFSET * Math.cos(headings[i]),
  ]);
  const trolleyHeadings = [0];
  for (let i = 1; i < n; i++) {
    const th = trolleyHeadings[i - 1];
    const dl = hitch[i][0] - hitch[i - 1][0];
    const df = hitch[i][1] - hitch[i - 1][1];
    trolleyHeadings.push(th + (dl * Math.cos(th) - df * Math.sin(th)) / TROLLEY_TOW_LENGTH);
  }

  return { points, headings, hitch, trolleyHeadings, lengths, total: lengths[n - 1] };
})();

function cumulativeLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  return lengths;
}

// Index/blend of arc-length fraction s along a cumulative-length table.
function locate(lengths, s) {
  const target = Math.min(1, Math.max(0, s)) * lengths[lengths.length - 1];
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi] - lengths[lo] || 1;
  return { lo, hi, f: (target - lengths[lo]) / span };
}

// Reverse into the slot. Backing a trailer is steered by where the TRAILER
// should go, so this plans the trolley's path — rear-first from where it
// stopped into its slot, arriving dead straight — and derives AMR10 from
// it: the hitch rides on the trolley's front (hitch = trolley centre + tow
// length along its heading), and AMR10's drive axle (its body centre, 0.29
// ahead of the hitch) follows the hitch like a trailer does its tug —
//   d(AMR10 heading) = -(hitch displacement · AMR10's left normal) / 0.29
// — the stable direction when reversing, so AMR10 swings round smoothly
// behind the trolley as it pushes it in. Precomputed per sample, so
// scrubbing backward retraces exactly the same poses.
const REVERSE_PATH = (() => {
  const n = DODGE_PATH.points.length - 1;
  const th0 = DODGE_PATH.trolleyHeadings[n];
  const hitch0 = DODGE_PATH.hitch[n];
  const c0 = [
    hitch0[0] - TROLLEY_TOW_LENGTH * Math.sin(th0),
    hitch0[1] - TROLLEY_TOW_LENGTH * Math.cos(th0),
  ];
  const cPark = [PARK_TROLLEY_LAT, PARK_LINE_FWD];
  const centres = [];
  for (let i = 0; i <= 800; i++) {
    const t = i / 800;
    centres.push([c0[0] + (cPark[0] - c0[0]) * t, c0[1] + (cPark[1] - c0[1]) * t]);
  }
  const SAMPLES = centres.length - 1;
  // Trolley faces opposite to its (rear-first) direction of motion.
  const trolleyHeadings = centres.map((_, i) => {
    const a = centres[Math.max(0, i - 1)];
    const b = centres[Math.min(SAMPLES, i + 1)];
    return Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
  });
  trolleyHeadings[0] = th0;
  trolleyHeadings[SAMPLES] = trolleyHeadings[SAMPLES - 1];
  const hitch = centres.map((c, i) => [
    c[0] + TROLLEY_TOW_LENGTH * Math.sin(trolleyHeadings[i]),
    c[1] + TROLLEY_TOW_LENGTH * Math.cos(trolleyHeadings[i]),
  ]);
  const axleAhead = AMR10_BODY_OFFSET - AMR10_HITCH_OFFSET; // drive axle, ahead of the hitch
  const refAhead = -AMR10_HITCH_OFFSET; // the pose reference point, ahead of the hitch
  const headings = [DODGE_PATH.headings[n]];
  for (let i = 1; i <= SAMPLES; i++) {
    const h = headings[i - 1];
    const dl = hitch[i][0] - hitch[i - 1][0];
    const df = hitch[i][1] - hitch[i - 1][1];
    headings.push(h - (dl * Math.cos(h) - df * Math.sin(h)) / axleAhead);
  }
  const points = hitch.map((p, i) => [
    p[0] + refAhead * Math.sin(headings[i]),
    p[1] + refAhead * Math.cos(headings[i]),
  ]);
  return { points, headings, hitch, trolleyHeadings, lengths: cumulativeLengths(hitch) };
})();

// Combined-centre pose, AMR10 heading, hitch and trolley heading at
// arc-length fraction s of DODGE_PATH (path-local lat/fwd frame).
function samplePath(s) {
  const { points, headings, hitch, trolleyHeadings, lengths, total } = DODGE_PATH;
  const target = Math.min(1, Math.max(0, s)) * total;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi] - lengths[lo] || 1;
  const f = (target - lengths[lo]) / span;
  const mix = (a, b) => a + (b - a) * f;
  return {
    lat: mix(points[lo][0], points[hi][0]),
    fwd: mix(points[lo][1], points[hi][1]),
    heading: mix(headings[lo], headings[hi]),
    hitchLat: mix(hitch[lo][0], hitch[hi][0]),
    hitchFwd: mix(hitch[lo][1], hitch[hi][1]),
    trolleyHeading: mix(trolleyHeadings[lo], trolleyHeadings[hi]),
  };
}

/** Path-local pose (lat/fwd/headings) at arc-length fraction s of the swerve path — exported for tests. */
export function getDodgePose(s) {
  return samplePath(s);
}

function fromPathLocal(lat, fwd) {
  return [AMR10_EXIT_TARGET[0] - lat, AMR10_EXIT_TARGET[1], AMR10_EXIT_TARGET[2] - fwd];
}

/**
 * Full AMR10 rig pose for any scroll progress, in Interior1Scene's group
 * frame: AMR10's body (positioned at its own centre) and its trolley
 * (positioned at the hitch pin it pivots on), each with its own rotationY.
 * Before the Factory 2 drive everything moves in straight lines, so the
 * trolley simply trails in line; during it, the trolley articulates.
 * Every phase starts exactly where the previous one ends, so this is
 * continuous across every handoff.
 */
export function getAmr10Rig(progress) {
  if (progress > FACTORY2_DRIVE_END) {
    const R = REVERSE_PATH;
    // Eases out of the stop, holds a slow steady reversing speed, eases in.
    const t = Math.min(
      1,
      Math.max(0, (progress - FACTORY2_DRIVE_END) / (PARK_REVERSE_END - FACTORY2_DRIVE_END))
    );
    const { lo, hi, f } = locate(R.lengths, trapezoidProgress(t, 0.25, 0.25));
    const mix = (arr, j) => arr[lo][j] + (arr[hi][j] - arr[lo][j]) * f;
    const mixS = (arr) => arr[lo] + (arr[hi] - arr[lo]) * f;
    const heading = mixS(R.headings);
    const lat = mix(R.points, 0);
    const fwd = mix(R.points, 1);
    return {
      body: {
        position: fromPathLocal(
          lat + AMR10_BODY_OFFSET * Math.sin(heading),
          fwd + AMR10_BODY_OFFSET * Math.cos(heading)
        ),
        rotationY: VEHICLE_ROTATION_Y + heading,
      },
      trolley: {
        position: fromPathLocal(mix(R.hitch, 0), mix(R.hitch, 1)),
        rotationY: VEHICLE_ROTATION_Y + mixS(R.trolleyHeadings),
      },
    };
  }

  const drivenPastBox = getAmr10DriveDistance(progress) - EXIT_STRAIGHT_LENGTH;
  if (drivenPastBox > 0) {
    const p = samplePath(drivenPastBox / DODGE_PATH.total);
    return {
      body: {
        position: fromPathLocal(
          p.lat + AMR10_BODY_OFFSET * Math.sin(p.heading),
          p.fwd + AMR10_BODY_OFFSET * Math.cos(p.heading)
        ),
        // Turning left while facing -Z is a positive rotation about Y.
        rotationY: VEHICLE_ROTATION_Y + p.heading,
      },
      trolley: {
        position: fromPathLocal(p.hitchLat, p.hitchFwd),
        rotationY: VEHICLE_ROTATION_Y + p.trolleyHeading,
      },
    };
  }

  const { position, rotationY } =
    progress > getAmr10ResumeProgress()
      ? {
          position: lerpVec3(
            STOP_POINT,
            AMR10_EXIT_TARGET,
            getAmr10DriveDistance(progress) / EXIT_STRAIGHT_LENGTH
          ),
          rotationY: VEHICLE_ROTATION_Y,
        }
      : getAmr10Transform(getMovementT(progress));
  // Heading is always straight along -Z before the Factory 2 drive.
  const along = (d) => [position[0], position[1], position[2] - d];
  return {
    body: { position: along(AMR10_BODY_OFFSET), rotationY },
    trolley: { position: along(AMR10_HITCH_OFFSET), rotationY },
  };
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

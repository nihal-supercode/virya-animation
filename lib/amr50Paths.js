import {
  PARK_REVERSE_END,
  AMR50_DETECT_END,
  AMR50_APPROACH_END,
  AMR50_DOCK_END,
  AMR50_HITCH_END,
  AMR50_EXIT_END,
} from "./timeline";

// AMR50 picks up the AMR50 trolley in Factory Interior 2 and tows it out
// (after AMR10 has parked its own trolley — PARK_REVERSE_END onward):
//
//   detect   : stationary, its radar rings fade in (it "detects" the trolley)
//   approach : drives forward out of its spot, then a smooth turn to face
//              away from the trolley's bay, lined up with its drawbar
//   dock     : reverses straight back until its tow hitch meets the drawbar
//   hitch    : a short pause as it connects
//   exit     : pulls the trolley straight out of the bay and keeps going,
//              dead straight along the bay's axis, out of the factory, across
//              to Factory 3 (building B2, which turns into the Final Scene
//              interior as it arrives) and on down that interior's central
//              aisle, stopping near its middle
//
// Everything here is in Factory Interior 2's own model-local frame (x, z) —
// the AMR50 and trolley models were exported in that frame, and are rendered
// inside NextFactoryScene's group, which carries the factory's placement.
// Headings are "direction of travel/facing" angles: direction = (sin θ, cos θ)
// in (x, z).
//
// From the models (see scripts/optimize-models.mjs):
// - AMR50: bbox x [-0.791, -0.404], z [2.140, 2.865], facing -z (steering
//   column and front bumper at the -z end), tow hitch at the +z end.
// - AMR50 trolley: body x [-2.85, -2.05] in its bay (z centre 0.018), with a
//   drawbar pointing +x out of the bay to a tip at x -1.743.
export const AMR50_PIVOT = [-0.5975, 0, 2.5026]; // body centre (model frame)
export const AMR50_TROLLEY_PIVOT = [-1.743, 0, 0.018]; // drawbar tip (model frame)
const AMR50_HEADING_0 = Math.PI; // facing -z as exported
const TROLLEY_HEADING_0 = Math.PI / 2; // drawbar toward +x as exported
const HITCH_BEHIND = 0.3625; // AMR50 centre -> tow hitch, backward
const TOW_LENGTH = 0.707; // drawbar tip -> trolley body centre (its axle pivot)

// Approach: straight out along its own line, then a quarter turn onto the
// trolley's bay axis, facing away from the bay.
const BAY_Z = AMR50_TROLLEY_PIVOT[2];
const APPROACH_TURN_RADIUS = 0.7;
// Dock: AMR50 centre when its hitch is on the drawbar tip, facing +x.
const DOCK_X = AMR50_TROLLEY_PIVOT[0] + HITCH_BEHIND;
// Exit: straight out along the bay's axis (+x), out through the factory's
// side (x ~3.2) — clear of the trolley area's barricade and the parked AMR10
// (both ~0.5+ to the side of that line) — and across the gap to Factory 3.
// Factory 3 is building B2 (see ExitBuildingsScene), set across a
// FACTORY_GAP-wide gap, its near wall at FACTORY3_NEAR_X on this same line.
// As AMR50 arrives it turns into the Final Scene interior (FinalScene.jsx),
// placed so its clear central aisle (model z ~-0.05, ~1.3 wide, running the
// full length of its model x) lies on AMR50's line, entering at B2's wall.
// AMR50 drives on down that aisle and stops just past the middle
// (FINAL_SCENE_STOP_X, in the Final Scene model's own x).
export const FACTORY2_EDGE_X = 3.2;
const FACTORY_GAP = 7.0;
export const FACTORY3_NEAR_X = FACTORY2_EDGE_X + FACTORY_GAP;
const AMR50_FRONT = 0.3625; // centre -> front bumper

// World placement of the Final Scene model. It's turned half round
// (FINAL_SCENE_ROTATION_Y) so AMR50 drives in along the model's +x, the way
// the client's reference shows it entering, with the other vehicles moving
// the same way (FinalScene.jsx). Its -x edge (-3.2668) sits on B2's wall and
// its aisle (FINAL_SCENE_AISLE_Z, the lane the reference's AMR50 comes in
// on) on AMR50's line. Final Scene model -> world: x = pos.x - mx,
// z = pos.z - mz. Factory 2 model-local -> world: x = -1.5515 - lx,
// z = -16.1596 - lz.
export const FINAL_SCENE_ROTATION_Y = Math.PI;
const FINAL_SCENE_AISLE_Z = -0.025;
export const FINAL_SCENE_POSITION = [
  -1.5515 - FACTORY3_NEAR_X - 3.2668,
  0,
  -16.1596 - 0.018 + FINAL_SCENE_AISLE_Z,
];
// AMR50's centre when it stops, in the Final Scene model's x: its nose then
// just past the middle, where the reference's arrow ends, and the trolley
// fully inside the aisle.
const FINAL_SCENE_STOP_X = 0.15;
const EXIT_END_X = -1.5515 - (FINAL_SCENE_POSITION[0] - FINAL_SCENE_STOP_X);
// Where AMR50's nose reaches the Final Scene's entrance (B2's wall).
export const FACTORY3_ENTRY_X = FACTORY3_NEAR_X - AMR50_FRONT;

function cubic(p0, p1, p2, p3, t) {
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

// Quarter turn from `start` (moving along dir0) to `end` (moving along
// dir1), as a cubic with ~circular handles.
function quarterTurn(start, dir0, end, dir1, radius) {
  const k = 0.55 * radius;
  return (t) =>
    cubic(
      start,
      [start[0] + dir0[0] * k, start[1] + dir0[1] * k],
      [end[0] - dir1[0] * k, end[1] - dir1[1] * k],
      end,
      t
    );
}

function sample(segments, n = 300) {
  const points = [];
  for (const seg of segments) {
    for (let i = points.length ? 1 : 0; i <= n; i++) points.push(seg(i / n));
  }
  const last = points.length - 1;
  const headings = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(last, i + 1)];
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  });
  // Keep headings continuous (never jump across ±180°).
  for (let i = 1; i <= last; i++) {
    while (headings[i] - headings[i - 1] > Math.PI) headings[i] -= 2 * Math.PI;
    while (headings[i] - headings[i - 1] < -Math.PI) headings[i] += 2 * Math.PI;
  }
  const lengths = [0];
  for (let i = 1; i <= last; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  return { points, headings, lengths };
}

// Approach path (AMR50 centre).
const APPROACH_PATH = (() => {
  const x0 = AMR50_PIVOT[0];
  const z0 = AMR50_PIVOT[2];
  const R = APPROACH_TURN_RADIUS;
  const turnStart = [x0, BAY_Z + R];
  const turnEnd = [x0 + R, BAY_Z];
  const path = sample([
    (t) => [x0, z0 + (turnStart[1] - z0) * t],
    quarterTurn(turnStart, [0, -1], turnEnd, [1, 0], R),
  ]);
  path.headings[0] = AMR50_HEADING_0;
  path.headings[path.headings.length - 1] = Math.PI / 2;
  return path;
})();
const APPROACH_END_X = AMR50_PIVOT[0] + APPROACH_TURN_RADIUS;

// Exit path (AMR50 centre), with the towed trolley's heading integrated
// along it — the same trailer constraint as AMR10's trolley: its wheels
// can't slide sideways, so its heading turns toward wherever the hitch pulls
// it (d(heading) = hitch displacement · its left normal / tow length). On
// this straight exit it simply stays in line behind AMR50.
const EXIT_PATH = (() => {
  const path = sample([(t) => [DOCK_X + (EXIT_END_X - DOCK_X) * t, BAY_Z]]);
  path.headings[0] = Math.PI / 2;
  path.headings[path.headings.length - 1] = Math.PI / 2;
  const hitch = path.points.map((p, i) => [
    p[0] - HITCH_BEHIND * Math.sin(path.headings[i]),
    p[1] - HITCH_BEHIND * Math.cos(path.headings[i]),
  ]);
  const trolleyHeadings = [TROLLEY_HEADING_0];
  for (let i = 1; i < hitch.length; i++) {
    const th = trolleyHeadings[i - 1];
    const dx = hitch[i][0] - hitch[i - 1][0];
    const dz = hitch[i][1] - hitch[i - 1][1];
    // left normal of direction (sin th, cos th) is (cos th, -sin th)
    trolleyHeadings.push(th + (dx * Math.cos(th) - dz * Math.sin(th)) / TOW_LENGTH);
  }
  return { ...path, hitch, trolleyHeadings };
})();

function phaseT(progress, start, end) {
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

// Eases out of rest, cruises, eases into rest — the same profile style as
// AMR10's drives.
function trapezoid(t, accel = 0.25, brake = 0.25) {
  const v = 1 / (1 - accel / 2 - brake / 2);
  if (t < accel) return (v * t * t) / (2 * accel);
  if (t > 1 - brake) return 1 - (v * (1 - t) * (1 - t)) / (2 * brake);
  return v * (t - accel / 2);
}

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

function mix(arr, lo, hi, f) {
  return Array.isArray(arr[lo])
    ? [arr[lo][0] + (arr[hi][0] - arr[lo][0]) * f, arr[lo][1] + (arr[hi][1] - arr[lo][1]) * f]
    : arr[lo] + (arr[hi] - arr[lo]) * f;
}

const pose = (x, z, heading, heading0) => ({
  position: [x, 0, z],
  rotationY: heading - heading0,
});

const TROLLEY_AT_REST = pose(AMR50_TROLLEY_PIVOT[0], AMR50_TROLLEY_PIVOT[2], TROLLEY_HEADING_0, TROLLEY_HEADING_0);

/**
 * AMR50 + its trolley at a given scroll progress, in Factory Interior 2's
 * model-local frame: each pose is { position, rotationY } for a group whose
 * child model is offset by -pivot (AMR50_PIVOT / AMR50_TROLLEY_PIVOT).
 * `radar` is the AMR50 radar rings' opacity (0-1).
 */
export function getAmr50Rig(progress) {
  const radar = phaseT(progress, PARK_REVERSE_END, AMR50_DETECT_END);

  if (progress <= AMR50_DETECT_END) {
    return {
      body: pose(AMR50_PIVOT[0], AMR50_PIVOT[2], AMR50_HEADING_0, AMR50_HEADING_0),
      trolley: TROLLEY_AT_REST,
      radar,
    };
  }
  if (progress <= AMR50_APPROACH_END) {
    const A = APPROACH_PATH;
    const { lo, hi, f } = locate(A.lengths, trapezoid(phaseT(progress, AMR50_DETECT_END, AMR50_APPROACH_END)));
    const [x, z] = mix(A.points, lo, hi, f);
    return { body: pose(x, z, mix(A.headings, lo, hi, f), AMR50_HEADING_0), trolley: TROLLEY_AT_REST, radar };
  }
  if (progress <= AMR50_DOCK_END) {
    // Straight reverse onto the drawbar.
    const t = trapezoid(phaseT(progress, AMR50_APPROACH_END, AMR50_DOCK_END));
    const x = APPROACH_END_X + (DOCK_X - APPROACH_END_X) * t;
    return { body: pose(x, BAY_Z, Math.PI / 2, AMR50_HEADING_0), trolley: TROLLEY_AT_REST, radar };
  }
  if (progress <= AMR50_HITCH_END) {
    return { body: pose(DOCK_X, BAY_Z, Math.PI / 2, AMR50_HEADING_0), trolley: TROLLEY_AT_REST, radar };
  }
  const E = EXIT_PATH;
  const { lo, hi, f } = locate(E.lengths, trapezoid(phaseT(progress, AMR50_HITCH_END, AMR50_EXIT_END), 0.2, 0.15));
  const [x, z] = mix(E.points, lo, hi, f);
  const [hx, hz] = mix(E.hitch, lo, hi, f);
  return {
    body: pose(x, z, mix(E.headings, lo, hi, f), AMR50_HEADING_0),
    trolley: pose(hx, hz, mix(E.trolleyHeadings, lo, hi, f), TROLLEY_HEADING_0),
    radar,
  };
}

/**
 * Scroll progress at which AMR50's centre reaches x (Factory Interior 2's
 * model-local frame) on its drive out — so the camera and building
 * crossfade can key off where AMR50 actually is. The drive only ever moves
 * forward, so a bisection is exact.
 */
export function getAmr50ProgressAtX(x) {
  let lo = AMR50_HITCH_END;
  let hi = AMR50_EXIT_END;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (getAmr50Rig(mid).body.position[0] < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** AMR50 body centre in Factory Interior 2's model-local frame (for the camera). */
export function getAmr50Position(progress) {
  return getAmr50Rig(progress).body.position;
}

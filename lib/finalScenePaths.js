import { FINAL_PARK_END } from "./timeline";
import { F3_TO_INTERIOR_START } from "./sceneTransition";

// The Final Scene's moving APT20 (a pallet truck carrying a pallet): as
// AMR50 comes in, it drives along its lane, on past its parking bay,
// stops, and reverses — forks first — round into the bay beside the room's
// parked AMR50, stopping parallel to it. And the room's AMR10 G1.5 drives
// off and turns left into the bay beside the room's AMR10 parked by the
// crates.
//
// All in the Final Scene model's own frame (x, z), which is the frame the
// APT20's file was exported in. Headings are "direction it faces" angles:
// direction = (sin θ, cos θ) in (x, z).
//
// From the models (see scripts/optimize-models.mjs):
// - APT20 with pallet: x 0.037..0.790, z -1.430..-1.016, facing +x — its
//   tractor (and tiller) at the +x end, forks and pallet trailing at -x.
// - The room's parked AMR50: x 1.25..1.63, z -2.89..-2.16 against the -z
//   wall, facing +z out toward the room — it reversed in. Its -x neighbour
//   is a trolley rack (x 0.25..0.60, z -2.70..-2.10).
//
// A pallet truck steers with the drive wheel under its tractor; the load
// rollers near its fork tips are fixed. So, like a car's rear axle, the
// point between those rollers only ever moves along the truck's own axis:
// the maneuver is laid out as that point's path (APT20_PIVOT), and the
// truck's heading is the path's direction — its tractor end swinging round
// as it steers, as a real one does.
export const APT20_PIVOT = [0.14, 0, -1.223];
const APT20_HEADING_0 = Math.PI / 2;
const APT20_REAR = APT20_PIVOT[0] - 0.037; // pivot -> pallet's rear edge
const LANE_Z = APT20_PIVOT[2];

// The bay: between the trolley rack and the parked AMR50, centred in the
// gap (0.65), which leaves ~0.12 either side of the truck (0.41 wide) — the
// truck parallel to the parked AMR50, 0.52 apart centre to centre, side by
// side with it: the pallet's rear level with the AMR50's rear.
const BAY_X = (0.6 + 1.25) / 2;
const BAY_REAR_Z = -2.87;

// The reverse, read outward from the bay: straight out along +z, then a
// quarter turn right onto the lane (+x), then a short straight along it to
// where the truck stops before reversing. The turn's curvature rises from
// and falls back to zero (a sin² bump), so the steering winds on and off
// smoothly rather than snapping to full lock. Its length is set so that,
// stopped past the bay, the truck's nose (x ~1.95) stays ~0.1 clear of the
// post where its lane ends (x ~2.05, z -0.95). The whole maneuver clears
// the room's fixtures by 0.11 or more.
const TURN = { length: 0.55, turn: Math.PI / 2 };
const RUN_OUT = 0.05;

function turnHeading(turn, u) {
  return turn * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
}

// Samples the pivot's path from `start`, facing `heading0`, through
// `segments` of { length, turn } (turn 0: straight).
function samplePath(start, heading0, segments, step = 0.005) {
  const points = [start.slice()];
  const headings = [heading0];
  let heading = heading0;
  for (const { length, turn = 0 } of segments) {
    const n = Math.max(1, Math.ceil(length / step));
    const base = heading;
    for (let i = 1; i <= n; i++) {
      const mid = base + turnHeading(turn, (i - 0.5) / n);
      const [x, z] = points[points.length - 1];
      points.push([x + Math.sin(mid) * (length / n), z + Math.cos(mid) * (length / n)]);
      headings.push(base + turnHeading(turn, i / n));
    }
    heading = base + turn;
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    );
  }
  return { points, headings, lengths };
}

// The reverse path (outward), its opening straight solved so it lands on
// the lane.
const REVERSE_PATH = (() => {
  const probe = samplePath([0, 0], 0, [TURN, { length: RUN_OUT }]);
  const [, reach] = probe.points[probe.points.length - 1];
  const bay = [BAY_X, BAY_REAR_Z + APT20_REAR];
  const path = samplePath(bay, 0, [{ length: LANE_Z - bay[1] - reach }, TURN, { length: RUN_OUT }]);
  // Land exactly on the lane (removes only the integration error).
  const last = path.points.length - 1;
  const dz = LANE_Z - path.points[last][1];
  path.points.forEach((p, i) => (p[1] += (dz * i) / last));
  return path;
})();
const START_X = APT20_PIVOT[0] - 0.6; // where its file places it, less its run-up
const PASS_X = REVERSE_PATH.points[REVERSE_PATH.points.length - 1][0];

// The room's vehicles all get going as AMR50 enters — as B2 starts turning
// into the room — rather than waiting for AMR50 to stop: their beats are
// fractions of the stretch from then to the end of the scroll.
const sceneBeat = (f) => F3_TO_INTERIOR_START + f * (FINAL_PARK_END - F3_TO_INTERIOR_START);

// The APT20's beats: it drives on past its bay, stops, and — after a pause
// as it shifts into reverse — reverses into it.
const PASS_START = sceneBeat(0);
const PASS_END = sceneBeat(0.4);
const REVERSE_START = sceneBeat(0.47);
const REVERSE_END = sceneBeat(0.9);

function phaseT(progress, start, end) {
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

// Eases out of rest, cruises, eases into rest.
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

/**
 * The moving APT20's pose at a given scroll progress, in the Final Scene
 * model's frame: { position, rotationY } for a group whose child model is
 * offset by -APT20_PIVOT.
 */
export function getApt20Pose(progress) {
  if (progress < REVERSE_START) {
    const x = START_X + (PASS_X - START_X) * trapezoid(phaseT(progress, PASS_START, PASS_END), 0.25, 0.3);
    return { position: [x, 0, LANE_Z], rotationY: 0 };
  }
  const P = REVERSE_PATH;
  const s = trapezoid(phaseT(progress, REVERSE_START, REVERSE_END), 0.25, 0.3);
  const { lo, hi, f } = locate(P.lengths, 1 - s);
  const x = P.points[lo][0] + (P.points[hi][0] - P.points[lo][0]) * f;
  const z = P.points[lo][1] + (P.points[hi][1] - P.points[lo][1]) * f;
  const heading = P.headings[lo] + (P.headings[hi] - P.headings[lo]) * f;
  return { position: [x, 0, z], rotationY: heading - APT20_HEADING_0 };
}

// The AMR10 G1.5: part of the room's model (x 0.50..1.14, z 0.79..1.10,
// lengthwise along x), lifted out of it by FinalScene.jsx (AMR10G15_BOX) so
// it can move. It's a symmetric differential-drive platform — mast and
// wheels centred, the same at either end — turning about its centre, so
// its path is its centre's and its heading the path's direction; it sets
// off along -x.
//
// It parks beside the room's AMR10 parked by the crates (x -1.21..-0.91, z
// 1.75..2.29, lengthwise along z): on its -x side (its +x side, against the
// crates, is too narrow), parallel to it and level with it, 0.15 apart.
// Beyond that bay are a post (x ~-1.8, z ~1.6) and shelving (x -1.9 and
// beyond, from z 1.8).
//
// Its route: straight along -x on its own line, past a barricade post (x
// ~-0.78, z ~1.17) on its left, then a quarter turn left (to +z) that lands
// it on the bay's centre line, and straight in — nose first; being
// symmetric, it looks the same parked either way round. The turn is a sin²
// curvature bump, as above. The whole route clears the room's fixtures by
// ~0.08 or more.
export const AMR10G15_BOX = { min: [0.46, -0.02, 0.75], max: [1.18, 0.47, 1.14] };
export const AMR10G15_PIVOT = [0.8165, 0, 0.9455];
const AMR10G15_HEADING_0 = (3 * Math.PI) / 2; // setting off along -x
const AMR10G15_BAY = [-1.21 - 0.15 - 0.1545, 2.02]; // 0.309 wide, centred level with the AMR10
const AMR10G15_TURN = { length: 0.8, turn: Math.PI / 2 };

const AMR10G15_PATH = (() => {
  const probe = samplePath([0, 0], AMR10G15_HEADING_0, [AMR10G15_TURN]);
  const [reachX, reachZ] = probe.points[probe.points.length - 1];
  const [x0, , z0] = AMR10G15_PIVOT;
  const path = samplePath([x0, z0], AMR10G15_HEADING_0, [
    { length: x0 - (AMR10G15_BAY[0] - reachX) },
    AMR10G15_TURN,
    { length: AMR10G15_BAY[1] - (z0 + reachZ) },
  ]);
  // Land exactly on the bay's centre line (removes only the integration error).
  const last = path.points.length - 1;
  const dx = AMR10G15_BAY[0] - path.points[last][0];
  path.points.forEach((p, i) => (p[0] += (dx * i) / last));
  return path;
})();

// It sets off just after the APT20, as AMR50 enters,
// and is parked before the APT20 is.
const AMR10G15_START = sceneBeat(0.03);
const AMR10G15_END = sceneBeat(0.75);

/**
 * The AMR10 G1.5's pose at a given scroll progress, in the Final Scene
 * model's frame: { position, rotationY } for a group whose child part is
 * offset by -AMR10G15_PIVOT.
 */
export function getAmr10G15Pose(progress) {
  const P = AMR10G15_PATH;
  const { lo, hi, f } = locate(P.lengths, trapezoid(phaseT(progress, AMR10G15_START, AMR10G15_END), 0.25, 0.3));
  const x = P.points[lo][0] + (P.points[hi][0] - P.points[lo][0]) * f;
  const z = P.points[lo][1] + (P.points[hi][1] - P.points[lo][1]) * f;
  const heading = P.headings[lo] + (P.headings[hi] - P.headings[lo]) * f;
  return { position: [x, 0, z], rotationY: heading - AMR10G15_HEADING_0 };
}

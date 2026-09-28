"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid } from "@react-three/drei";

// TWO stacked ground-level grids, shared by the WHOLE scroll journey
// (exterior -> Factory Interior 1 -> the next factory) rather than one pair
// per scene — every model here sits on the same y=0 floor (see
// cameraPath.js's INTERIOR_1_CENTER/NEXT_FACTORY_CENTER, both y=0), so one
// pair at that height reads as continuous ground under all three.
//
// - STATIC_Y: the light-colored base grid, fixed in place.
// - MOVING_Y: an orange grid of the same spacing, currently also static
//   (the flow animation is parked, not removed — see FLOW_SPEED below).
//   Sits above the static grid (both slightly below y=0) so the two don't
//   z-fight.
//
// The gap between them needs to be meaningfully bigger than it looks —
// both are large (infiniteGrid) planes viewed from far away (the exit
// phase alone reaches camera heights up to ~10 units, see cameraPath.js's
// OUTDOOR_LIFT_HEIGHT, looking across a fadeDistance of 55 units), and
// depth-buffer precision gets coarser with distance from the camera. An
// earlier 0.001-unit gap was well inside that imprecision at range, so the
// two grids' depth values could round to the same value and interleave
// per-pixel between frames — real flicker, camera-independent, worst
// exactly where the camera pulls back/up furthest during the AMR10
// exit/crossing. 0.03 units is comfortably outside that range while still
// being an imperceptible offset for a flat floor.
const STATIC_Y = -0.03;
const MOVING_Y = 0;

const CELL_SIZE = 0.75;

// How far out the grid fades, at the camera's usual near/far range. The
// campus is shown scaled up at either end of the journey (see
// exteriorLayout.js), with the camera well further out, and CameraRig scales
// the camera's far plane up with it (the camera state's depthScale). The
// grid keeps the same cells throughout, so it never changes size — but seen
// from that far, far more of its (fixed pixel width) lines are on screen, and
// at full strength out to the horizon they turned the ground into a solid
// orange shimmer. So the fade reaches out only part of the way (by the square
// root of that scale) and the lines lighten a little (by its fourth root:
// below a pixel wide, a line's coverage, so its alpha, scales with its
// thickness), keeping the grid visible without flooding the frame.
const FADE_DISTANCE = 55;
const BASE_THICKNESS = 0.5;
const OVERLAY_THICKNESS = 0.7;
const BASE_FAR = 100; // CameraRig's unscaled far plane

// Units/second the orange grid pattern would flow along world X — a
// continuous, looping "conveyor" motion over the static base, independent
// of scroll. Parked for now (see GridBackground below); kept here so the
// effect is easy to re-enable later. drei's Grid derives its line pattern
// from the mesh's OWN local position (via modelMatrix, unaffected by the
// separate followCamera recentering that keeps the visible quad under the
// camera — see Grid.js's shader), so animating just this mesh's position.x
// every frame slides the pattern through world space without needing a
// custom shader.
const FLOW_SPEED = 0.15; // eslint-disable-line no-unused-vars -- parked animation, re-enable later

export default function GridBackground() {
  const base = useRef(null);
  const overlay = useRef(null);

  useFrame(({ camera }) => {
    const k = Math.sqrt(camera.far / BASE_FAR);
    for (const [grid, thickness] of [
      [base.current, BASE_THICKNESS],
      [overlay.current, OVERLAY_THICKNESS],
    ]) {
      if (!grid) continue;
      grid.material.uniforms.fadeDistance.value = FADE_DISTANCE * k;
      grid.material.uniforms.cellThickness.value = thickness / Math.sqrt(k);
    }
  });

  return (
    <>
      {/* Static base grid — light gray, never animated. */}
      <Grid
        ref={base}
        position={[0, STATIC_Y, 0]}
        args={[10, 10]}
        infiniteGrid
        followCamera
        cellSize={CELL_SIZE}
        cellThickness={BASE_THICKNESS}
        cellColor="#c3cad1"
        sectionThickness={0}
        fadeDistance={FADE_DISTANCE}
        fadeStrength={1.3}
      />
      {/* Orange overlay grid — same spacing as the base grid, static for now
          (flow animation parked, see FLOW_SPEED above). */}
      <Grid
        ref={overlay}
        position={[0, MOVING_Y, 0]}
        args={[10, 10]}
        infiniteGrid
        followCamera
        cellSize={CELL_SIZE}
        // Thicker line + a gentler/farther-reaching fade — the Grid shader
        // fades opacity with distance from the camera (fadeDistance/
        // fadeStrength) AND applies an extra 25% alpha penalty whenever the
        // section grid is off (sectionThickness=0 below), so a thin line at
        // a steeper fade read as barely-there orange rather than a clearly
        // colored line.
        cellThickness={OVERLAY_THICKNESS}
        cellColor="#f97316"
        sectionThickness={0}
        fadeDistance={FADE_DISTANCE}
        fadeStrength={1.3}
      />
    </>
  );
}

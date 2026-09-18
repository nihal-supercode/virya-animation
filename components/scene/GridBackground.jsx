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
// - MOVING_Y: an orange grid of the same spacing, animated (see FLOW_SPEED
//   below) so it slides across the static one — the base grid itself never
//   moves, only the orange overlay does. Sits above the static grid (both
//   slightly below y=0) so the two don't z-fight.
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

const CELL_SIZE = 0.5;

// Units/second the orange grid pattern flows along world X — a continuous,
// looping "conveyor" motion over the static base, independent of scroll.
// drei's Grid derives its line pattern from the mesh's OWN local position
// (via modelMatrix, unaffected by the separate followCamera recentering
// that keeps the visible quad under the camera — see Grid.js's shader), so
// animating just this mesh's position.x every frame slides the pattern
// through world space without needing a custom shader.
const FLOW_SPEED = 0.15;

export default function GridBackground() {
  const movingGridRef = useRef(null);

  useFrame((state) => {
    if (!movingGridRef.current) return;
    // Wrapped modulo CELL_SIZE rather than left to grow forever — the
    // pattern repeats exactly every CELL_SIZE, so wrapping there is
    // visually seamless (no jump) and keeps the driven value small and
    // precise indefinitely instead of accumulating float error over a long
    // scroll session.
    movingGridRef.current.position.x =
      (state.clock.elapsedTime * FLOW_SPEED) % CELL_SIZE;
  });

  return (
    <>
      {/* Static base grid — light gray, never animated. */}
      <Grid
        position={[0, STATIC_Y, 0]}
        args={[10, 10]}
        infiniteGrid
        followCamera
        cellSize={CELL_SIZE}
        cellThickness={0.5}
        cellColor="#c3cad1"
        sectionThickness={0}
        fadeDistance={55}
        fadeStrength={1.3}
      />
      {/* Orange overlay grid — same spacing, but its mesh position (and so
          its pattern phase) is driven every frame above, sliding it across
          the static grid underneath. */}
      <Grid
        ref={movingGridRef}
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
        cellThickness={0.7}
        cellColor="#f97316"
        sectionThickness={0}
        fadeDistance={55}
        fadeStrength={1.3}
      />
    </>
  );
}

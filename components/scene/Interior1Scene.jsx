"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";
import {
  getMovementT,
  getAmr10FullTransform,
  getForkliftTransform,
} from "@/lib/vehiclePaths";

export const INTERIOR_1_MODEL_URL = "/models/interior-1/factory-interior-1.glb";
const FORKLIFT_MODEL_URL = "/models/interior-1/forklift.glb";
const AMR10_TROLLEY_MODEL_URL = "/models/interior-1/amr10-with-trolley.glb";

// World-space position for the whole Factory Interior 1 group (room +
// vehicles) — matches Building B2's center so the interior appears "in
// place of" B2 as the crossfade completes (see cameraPath.js's B2_CENTER).
export const POSITION = [-2.05, 0, -2.41];

// Forklift and AMR10-with-Trolley were exported from the same source scene
// as the room shell, so their geometry carries an in-room position baked
// directly into its vertices rather than being centered at each file's own
// origin (confirmed via `gltf-transform inspect`). Each is re-centered on
// this value (see `negate` below) so it can be positioned/rotated as a
// unit around its own visual center instead of around wherever its raw
// vertices happen to sit.
const FORKLIFT_LOCAL_CENTER = [0.505505, 0, 3.058885];
const AMR10_LOCAL_CENTER = [-2.554975, 0, -0.625155];

function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

// How quickly the rendered vehicle position catches up to its true
// scroll-driven target, in 1/seconds (higher = snappier, lower = more lag).
// Without this, position snapped directly to f(scrollProgress) every
// frame, so a fast scroll advanced that function's input quickly and the
// vehicle visibly jumped ahead in lockstep — "moves too fast" when
// scrolling normally, fine only when scrolling slowly. Frame-rate-
// independent exponential smoothing decouples how fast you scroll from
// how fast the vehicle appears to move: the target can still jump ahead
// instantly, but the rendered position chases it smoothly over real time
// instead of snapping, capping the vehicle's max apparent speed.
const FOLLOW_LAMBDA = 5;

function damp3(current, target, lambda, delta) {
  const f = 1 - Math.exp(-lambda * delta);
  return [
    current[0] + (target[0] - current[0]) * f,
    current[1] + (target[1] - current[1]) * f,
    current[2] + (target[2] - current[2]) * f,
  ];
}

function useFadingModel(url) {
  const { scene } = useModel(url);
  const materials = useRef([]);

  useEffect(() => {
    const mats = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [scene]);

  return { scene, materials };
}

export default function Interior1Scene() {
  const room = useFadingModel(INTERIOR_1_MODEL_URL);
  const forklift = useFadingModel(FORKLIFT_MODEL_URL);
  const amr10Trolley = useFadingModel(AMR10_TROLLEY_MODEL_URL);

  // Refs to the outer per-vehicle group (the one carrying the re-centered
  // model) — position/rotation are driven imperatively every frame from
  // lib/vehiclePaths.js rather than through React state, matching
  // CameraRig's approach (avoids a re-render on every scroll tick).
  const forkliftRig = useRef(null);
  const amr10Rig = useRef(null);

  // Current RENDERED position for each vehicle — distinct from the raw
  // target lib/vehiclePaths.js computes from scroll progress. null until
  // first frame, so the very first render snaps straight to the target
  // instead of sliding in from an arbitrary starting point.
  const forkliftSmoothed = useRef(null);
  const amr10Smoothed = useRef(null);

  useFrame((_state, delta) => {
    const progress = scrollStore.progress;

    // Fades IN over EXTERIOR_END..FADE_END as Factory Interior 1 replaces
    // Building B2, then stays fully visible for the rest of the scene —
    // it doesn't fade back out; AMR10 physically drives away from it
    // instead (see below).
    const { interior } = getFadeOpacities(progress);
    for (const { scene, materials } of [room, forklift, amr10Trolley]) {
      scene.visible = interior > 0.001;
      for (const mat of materials.current) {
        mat.opacity = interior;
      }
    }

    // Vehicle choreography (AMR10 <-> Forklift crossing, see
    // lib/vehiclePaths.js for the full timing/behavior) — plays out during
    // the FADE_END -> MOVEMENT_END scroll window; before/after that window
    // getMovementT clamps to 0/1, holding the Forklift at its start/end.
    const t = getMovementT(progress);

    if (forkliftRig.current) {
      const { position, rotationY } = getForkliftTransform(t);
      forkliftSmoothed.current = forkliftSmoothed.current
        ? damp3(forkliftSmoothed.current, position, FOLLOW_LAMBDA, delta)
        : position;
      forkliftRig.current.position.set(...forkliftSmoothed.current);
      forkliftRig.current.rotation.y = rotationY;
    }
    if (amr10Rig.current) {
      // Unlike the Forklift, AMR10 keeps going after MOVEMENT_END — it
      // drives out of the room and into the next factory during
      // TOP_VIEW_END..EXIT_END (see getAmr10FullTransform, which switches
      // phases internally).
      const { position, rotationY } = getAmr10FullTransform(progress);
      amr10Smoothed.current = amr10Smoothed.current
        ? damp3(amr10Smoothed.current, position, FOLLOW_LAMBDA, delta)
        : position;
      amr10Rig.current.position.set(...amr10Smoothed.current);
      amr10Rig.current.rotation.y = rotationY;
    }
  });

  return (
    <group position={POSITION}>
      {/* Explicit position prop even for identity — useGLTF/useModel's
          cache is module-level and survives Fast Refresh, and R3F only
          reliably re-applies props that are actually present in JSX on
          every render. */}
      <primitive object={room.scene} position={[0, 0, 0]} />

      <group ref={forkliftRig}>
        <primitive object={forklift.scene} position={negate(FORKLIFT_LOCAL_CENTER)} />
      </group>
      <group ref={amr10Rig}>
        <primitive object={amr10Trolley.scene} position={negate(AMR10_LOCAL_CENTER)} />
      </group>
    </group>
  );
}

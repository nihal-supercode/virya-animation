"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import AmrRadar from "./AmrRadar";
import { getAmr50Rig } from "@/lib/amr50Paths";
import { scrollStore } from "@/lib/scrollStore";
import {
  getFadeOpacities,
  getExitExteriorAmount,
  getFactory2ExteriorAmount,
  roomVisibility,
} from "@/lib/sceneTransition";
import {
  getMovementT,
  getExitT,
  getAmr10Rig,
  getForkliftTransform,
} from "@/lib/vehiclePaths";

export const INTERIOR_1_MODEL_URL = "/models/interior-1/factory-interior-1.glb";
const FORKLIFT_MODEL_URL = "/models/interior-1/forklift.glb";
// AMR10 and its towed trolley as separate models so the trolley can
// articulate on its hitch (see getAmr10Rig in lib/vehiclePaths.js).
const AMR10_BODY_MODEL_URL = "/models/interior-1/amr10.glb";
const AMR10_TROLLEY_MODEL_URL = "/models/interior-1/amr10-trolley.glb";

// World-space position for the whole Factory Interior 1 group (room +
// vehicles) — matches Building B2's center so the interior appears "in
// place of" B2 as the crossfade completes (see cameraPath.js's B2_CENTER).
export const POSITION = [-2.05, 0, -2.41];

// The Forklift was exported from the same source scene as the room shell,
// so its geometry carries an in-room position baked directly into its
// vertices rather than being centered at its own origin (confirmed via
// `gltf-transform inspect`). It's re-centered on this value (see `negate`
// below) so it can be positioned/rotated as a unit around its own visual
// center instead of around wherever its raw vertices happen to sit.
const FORKLIFT_LOCAL_CENTER = [0.505505, 0, 3.058885];

// AMR10 body / trolley pivots in their models' shared source frame
// (forward +Z): the body's centre, and the hitch pin the trolley swings on.
// Each model sits under an extra +90° Y turn (AMR10_MODEL_ROTATION_Y) that
// maps that +Z forward onto +X, the forward axis getAmr10Rig's rotationY
// values assume (inherited from the old combined model).
const AMR10_BODY_PIVOT = [0.0035, 0, -2.4305];
const AMR10_HITCH_PIVOT = [0.0035, 0, -2.72];
const AMR10_MODEL_ROTATION_Y = Math.PI / 2;

function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

// AMR10's radar: fades in with Factory Interior 1, and hands over to AMR50's
// — fading out exactly as AMR50's fades in, once AMR50 activates.
function amr10RadarOpacity(progress) {
  return getFadeOpacities(progress).interior * (1 - getAmr50Rig(progress).radar);
}

// How quickly the rendered vehicle position catches up to its true
// scroll-driven target, in 1/seconds (higher = snappier, lower = more lag).
// Frame-rate-independent exponential smoothing, so a fast scroll doesn't
// snap the vehicles straight to where the scroll says they should be.
const FOLLOW_LAMBDA = 5;

function damp3(current, target, lambda, delta) {
  const f = 1 - Math.exp(-lambda * delta);
  return [
    current[0] + (target[0] - current[0]) * f,
    current[1] + (target[1] - current[1]) * f,
    current[2] + (target[2] - current[2]) * f,
  ];
}

// AMR10 (and its trolley) draw after the B4/B5 buildings (renderOrder 2), so
// a building fading in or out around it never veils it — while a solid
// building (which writes depth) still hides it inside.
const AMR10_RENDER_ORDER = 3;

function useFadingModel(url, renderOrder = 0) {
  const { scene } = useModel(url);
  const materials = useRef([]);

  useEffect(() => {
    const mats = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = renderOrder;
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [scene, renderOrder]);

  return { scene, materials };
}

export default function Interior1Scene() {
  const room = useFadingModel(INTERIOR_1_MODEL_URL);
  const forklift = useFadingModel(FORKLIFT_MODEL_URL);
  const amr10Body = useFadingModel(AMR10_BODY_MODEL_URL, AMR10_RENDER_ORDER);
  const amr10Trolley = useFadingModel(AMR10_TROLLEY_MODEL_URL, AMR10_RENDER_ORDER);

  // Refs to the outer per-vehicle group (the one carrying the re-centered
  // model) — position/rotation are driven imperatively every frame from
  // lib/vehiclePaths.js rather than through React state, matching
  // CameraRig's approach (avoids a re-render on every scroll tick).
  const forkliftRig = useRef(null);
  const amr10BodyRig = useRef(null);
  const amr10TrolleyRig = useRef(null);

  // Current RENDERED position for each vehicle — distinct from the raw
  // target lib/vehiclePaths.js computes from scroll progress. null until
  // first frame, so the very first render snaps straight to the target
  // instead of sliding in from an arbitrary starting point.
  const forkliftSmoothed = useRef(null);
  // AMR10 smooths its scroll PROGRESS rather than its output position:
  // with an articulated rig (body + towed trolley, each with its own
  // heading) smoothing positions alone let them lag behind rotations that
  // had already jumped ahead, so the rig visibly slid sideways through
  // turns. Smoothing the input keeps every part of the pose consistent.
  const amr10Progress = useRef(null);

  useFrame((_state, delta) => {
    const progress = scrollStore.progress;

    // Fades IN over EXTERIOR_END..FADE_END as Factory Interior 1 replaces
    // Building B2, then stays fully visible for the rest of the scene —
    // it doesn't fade back out; AMR10 physically drives away from it
    // instead (see below).
    const { interior } = getFadeOpacities(progress);
    // The room (and the Forklift parked in it) also crossfades out to B4
    // while AMR10 crosses to Factory Interior 2, and back — see
    // ExitBuildingsScene.jsx. AMR10 stays fully visible throughout.
    const roomOpacity = interior * roomVisibility(getExitExteriorAmount(getExitT(progress)));
    // Once AMR10 has parked its trolley in Factory Interior 2, the pair are
    // part of that room: they fade out with it as it dissolves into B5 on
    // AMR50's crossing to Factory 3 — B5's solid block doesn't reach the
    // trolley area, so otherwise they'd be left standing outside it.
    const amr10Opacity = interior * roomVisibility(getFactory2ExteriorAmount(progress));
    for (const [{ scene, materials }, opacity] of [
      [room, roomOpacity],
      [forklift, roomOpacity],
      [amr10Body, amr10Opacity],
      [amr10Trolley, amr10Opacity],
    ]) {
      scene.visible = opacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = opacity;
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
    if (amr10BodyRig.current && amr10TrolleyRig.current) {
      // Unlike the Forklift, AMR10 keeps going after MOVEMENT_END — out of
      // the room, into Factory Interior 2, and around its floor box (see
      // getAmr10Rig, which switches phases internally).
      amr10Progress.current =
        amr10Progress.current === null
          ? progress
          : amr10Progress.current +
            (progress - amr10Progress.current) * (1 - Math.exp(-FOLLOW_LAMBDA * delta));
      const { body, trolley } = getAmr10Rig(amr10Progress.current);
      amr10BodyRig.current.position.set(...body.position);
      amr10BodyRig.current.rotation.y = body.rotationY;
      amr10TrolleyRig.current.position.set(...trolley.position);
      amr10TrolleyRig.current.rotation.y = trolley.rotationY;
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
      <group ref={amr10BodyRig}>
        <AmrRadar getOpacity={amr10RadarOpacity} />
        <group rotation={[0, AMR10_MODEL_ROTATION_Y, 0]}>
          <primitive object={amr10Body.scene} position={negate(AMR10_BODY_PIVOT)} />
        </group>
      </group>
      <group ref={amr10TrolleyRig}>
        <group rotation={[0, AMR10_MODEL_ROTATION_Y, 0]}>
          <primitive object={amr10Trolley.scene} position={negate(AMR10_HITCH_PIVOT)} />
        </group>
      </group>
    </group>
  );
}

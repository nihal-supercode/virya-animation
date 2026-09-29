"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { addStencilMask } from "@/lib/fadeDepth";
import AmrRadar from "./AmrRadar";
import { scrollStore } from "@/lib/scrollStore";
import { FADE_END, TOP_VIEW_END, SCROLL_LENGTH_VH } from "@/lib/timeline";
import {
  getFadeOpacities,
  getFactory1ExteriorAmount,
  getFactory2ExteriorAmount,
  getOutroOpacities,
  roomVisibility,
} from "@/lib/sceneTransition";
import {
  getMovementT,
  getExitT,
  getAmr10Rig,
  getAmr10Alert,
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

// AMR10's radar: fades in with Factory Interior 1 and stays on with AMR10 —
// including while AMR50's comes on and AMR50 sets off beside it — fading
// only with AMR10 itself (amr10Opacity in the frame loop).
// AMR10 waits outside the room, behind its near wall (vehiclePaths.js's
// AMR10_START) — between the camera and the room as the camera closes in on
// B4 — so it stays hidden until the room has fully replaced B4 (FADE_END),
// then fades in over the next AMR10_APPEAR_VH, while it's still out of the
// camera's frame. It only comes into view as it drives in.
const AMR10_APPEAR_VH = 20;

function amr10Visibility(progress) {
  const appear = Math.min(
    1,
    Math.max(0, ((progress - FADE_END) * SCROLL_LENGTH_VH) / AMR10_APPEAR_VH)
  );
  return appear * getOutroOpacities(progress).others;
}

function amr10RadarOpacity(progress) {
  return amr10Visibility(progress) * roomVisibility(getFactory2ExteriorAmount(progress));
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

// From its exit on (TOP_VIEW_END), AMR10 (and its trolley) draw after the
// B4/B5 buildings (renderOrder 2), so a building fading in or out around it
// never veils it — while a solid building (which writes depth) still hides
// it inside. Not before, though: as the room first appears inside B4, B4
// dissolving over it veils the whole room, and AMR10 has to fade in with it,
// under the same veil, not show through it on its own.
const AMR10_RENDER_ORDER = 3;

function useFadingModel(url) {
  const { scene } = useModel(url);
  const materials = useRef([]);
  const meshes = useRef([]);

  useEffect(() => {
    const mats = [];
    const found = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 0;
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        mats.push(obj.material);
        found.push(obj);
      }
    });
    materials.current = mats;
    meshes.current = found;
  }, [scene]);

  return { scene, materials, meshes };
}

export default function Interior1Scene() {
  const room = useFadingModel(INTERIOR_1_MODEL_URL);
  const forklift = useFadingModel(FORKLIFT_MODEL_URL);
  const amr10Body = useFadingModel(AMR10_BODY_MODEL_URL);
  const amr10Trolley = useFadingModel(AMR10_TROLLEY_MODEL_URL);

  // AMR10 marks its pixels so a fading B4/B5 skips them and never veils it
  // (lib/fadeDepth.js) — drawn just before the buildings' depth pre-pass.
  const amr10Masks = useRef([]);
  useEffect(() => {
    amr10Masks.current = [amr10Body.scene, amr10Trolley.scene].map((root) =>
      addStencilMask(root, { renderOrder: 1.9 })
    );
    return () => {
      for (const mask of amr10Masks.current) mask.dispose();
      amr10Masks.current = [];
    };
  }, [amr10Body.scene, amr10Trolley.scene]);

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
    // ...and all of it dissolves for good as the campus forms in the outro.
    const interior = getFadeOpacities(progress).interior * getOutroOpacities(progress).others;
    // The room (and the Forklift parked in it) also crossfades out to B4
    // while AMR10 crosses to Factory Interior 2, and back, then to B4 again
    // for good as AMR50 leaves Factory 2 — see ExitBuildingsScene.jsx.
    const roomOpacity = interior * roomVisibility(getFactory1ExteriorAmount(getExitT(progress), progress));
    // Once AMR10 has parked its trolley in Factory Interior 2, the pair are
    // part of that room: they fade out with it as it dissolves into B5 on
    // AMR50's crossing to Factory 3 — B5's solid block doesn't reach the
    // trolley area, so otherwise they'd be left standing outside it.
    const amr10Opacity = amr10Visibility(progress) * roomVisibility(getFactory2ExteriorAmount(progress));
    // Drawn over the buildings (unveiled) only while fully opaque; while it's
    // fading with Factory 2 it's part of the room, so it's drawn with it and
    // veiled by B5 the same way — drawn after, B5's depth pre-pass
    // (lib/fadeDepth.js) would hide it outright.
    const amr10Order =
      progress > TOP_VIEW_END && amr10Opacity > 0.999 ? AMR10_RENDER_ORDER : 0;
    for (const mesh of [...amr10Body.meshes.current, ...amr10Trolley.meshes.current]) {
      mesh.renderOrder = amr10Order;
    }
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
    // Only while it's drawn over the buildings (so fully opaque) — a fading
    // AMR10 would cut its outline out of the building around it.
    const maskAmr10 = amr10Order === AMR10_RENDER_ORDER;
    for (const mask of amr10Masks.current) mask.update(maskAmr10);

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
        <AmrRadar getOpacity={amr10RadarOpacity} getAlert={getAmr10Alert} />
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

"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFactory3InteriorAmount, getOutroOpacities, F3_TO_INTERIOR_START } from "@/lib/sceneTransition";
import { AMR50_EXIT_END, FINAL_PARK_END } from "@/lib/timeline";
import { FINAL_SCENE_POSITION, FINAL_SCENE_ROTATION_Y } from "@/lib/amr50Paths";
import { getApt20Pose, APT20_PIVOT, getAmr10G15Pose, AMR10G15_PIVOT, AMR10G15_BOX } from "@/lib/finalScenePaths";
import AmrRadar from "./AmrRadar";

// The Final Scene interior — Factory 3's inside. Building B2 (standing in
// for Factory 3 from outside) crossfades into it as AMR50 arrives, the same
// way B5 turned into Factory Interior 2 when AMR10 arrived, and AMR50 then
// drives on down its central aisle (see lib/amr50Paths.js for the placement:
// that aisle lies on AMR50's line, its entrance at B2's wall). Its parked
// vehicles (an AMR50, AMR10, APT20 and more) are part of the model and stay
// as scenery; two more are at work, as the client's reference shows: an
// AMR10 towing two carts, which drives along +x down its lane beside AMR50
// as it comes in and stops at the end of the room, and an APT20 carrying a pallet, which then drives on past
// a parking bay beside the room's parked AMR50 and reverses into it. And the
// room's own AMR10 G1.5 (lifted out of its model) drives off, turns left and
// parks beside the room's AMR10 parked by the crates (their routes in
// lib/finalScenePaths.js). Like AMR50, all three carry their radar rings.
// Optimized from public/models/4_Interior Final Scene/GLB with Color/ (see
// scripts/optimize-models.mjs); all in the room's frame.
export const FINAL_SCENE_MODEL_URL = "/models/final/final-scene.glb";
const APT20_MODEL_URL = "/models/final/apt20-moving.glb";
const AMR10_MODEL_URL = "/models/final/amr10-moving.glb";

// The APT20's radar rings centre on its body, 0.27 ahead of its pivot (its
// load rollers).
const APT20_RADAR_AHEAD = 0.27;

// How far along +x the AMR10 is from where its file places it, from the
// start to the end of its drive. Its lane runs the room's full length, and
// it drives on down it to where its file places it, stopping at the end of
// the room (the train spans x 1.63..3.05 as placed; the room ends at x 3.27)
// — as the room appears and AMR50 comes in, into the park beat, easing off
// and on. Its rings centre on the AMR10 itself (the +x end of the train, x
// 2.51..3.05, z 0.30..0.60).
const AMR10_FROM = -1.0;
const AMR10_TO = 0;
const AMR10_END = AMR50_EXIT_END + 0.4 * (FINAL_PARK_END - AMR50_EXIT_END);
const AMR10_RADAR_CENTRE = [2.78, 0, 0.4485];

function amr10Offset(progress) {
  const t = Math.min(1, Math.max(0, (progress - F3_TO_INTERIOR_START) / (AMR10_END - F3_TO_INTERIOR_START)));
  return AMR10_FROM + (AMR10_TO - AMR10_FROM) * t * t * (3 - 2 * t);
}

function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

// The room (with everything in it) fades in as AMR50 arrives, and back out
// into campus building B2 in the outro.
function roomOpacity(progress) {
  return getFactory3InteriorAmount(progress) * getOutroOpacities(progress).room;
}

// The rings show whenever the room does.
function radarOpacity(progress) {
  return roomOpacity(progress);
}

// Moves the triangles of `scene` lying wholly inside `box` (model frame)
// into meshes under `target` (a group in the same frame), so that part can
// be posed on its own. Returns an undo.
function liftPart(scene, box, target) {
  scene.updateMatrixWorld(true);
  const toModel = scene.matrixWorld.clone().invert();
  const bounds = new THREE.Box3(new THREE.Vector3(...box.min), new THREE.Vector3(...box.max));
  const v = new THREE.Vector3();
  const meshes = [];
  scene.traverse((obj) => obj.isMesh && meshes.push(obj));
  const undos = [];
  for (const obj of meshes) {
    const { geometry } = obj;
    const matrix = toModel.clone().multiply(obj.matrixWorld);
    const position = geometry.attributes.position;
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const keep = [];
    const part = [];
    for (let t = 0; t < count; t += 3) {
      const ids = [0, 1, 2].map((j) => (index ? index.getX(t + j) : t + j));
      const inside = ids.every((i) => bounds.containsPoint(v.fromBufferAttribute(position, i).applyMatrix4(matrix)));
      (inside ? part : keep).push(...ids);
    }
    if (!part.length) continue;
    const withIndex = (list) => {
      const g = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) g.setAttribute(name, attribute);
      g.setIndex(list);
      return g;
    };
    const rest = withIndex(keep);
    const lifted = new THREE.Mesh(withIndex(part), obj.material);
    matrix.decompose(lifted.position, lifted.quaternion, lifted.scale);
    target.add(lifted);
    obj.geometry = rest;
    undos.push(() => {
      target.remove(lifted);
      obj.geometry = geometry;
      rest.dispose();
      lifted.geometry.dispose();
    });
  }
  return () => undos.forEach((undo) => undo());
}

// `lift`, if given, is { box, target }: that part of the model is lifted
// out into the target group (see liftPart), after the material clones, so
// it shares them and fades with the rest.
function useFadingModel(url, lift) {
  const { scene } = useModel(url);
  const materials = useRef([]);

  // Own material clones (opacity animated per frame; the cached originals
  // are shared by useModel's URL cache).
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
    if (lift?.target.current) return liftPart(scene, lift.box, lift.target.current);
  }, [scene, lift]);

  return { scene, materials };
}

// The room's AMR10 G1.5, lifted out of it so it can drive off and park
// (lib/finalScenePaths.js) — into this group, posed per frame.
const amr10G15Part = { box: AMR10G15_BOX, target: { current: null } };

export default function FinalScene() {
  const room = useFadingModel(FINAL_SCENE_MODEL_URL, amr10G15Part);
  const apt20 = useFadingModel(APT20_MODEL_URL);
  const amr10 = useFadingModel(AMR10_MODEL_URL);
  const apt20Rig = useRef(null);
  const amr10Rig = useRef(null);
  const amr10G15Rig = useRef(null);

  useFrame(() => {
    const progress = scrollStore.progress;
    const opacity = roomOpacity(progress);
    for (const { scene, materials } of [room, apt20, amr10]) {
      scene.visible = opacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = opacity;
      }
    }
    // The G1.5 was lifted out of the room's scene into its own group, so
    // hiding the room doesn't hide it: at opacity 0 it would still write
    // depth, cutting its silhouette out of the grid from far across the site.
    if (amr10G15Rig.current) amr10G15Rig.current.visible = opacity > 0.001;
    for (const [rig, getPose] of [
      [apt20Rig, getApt20Pose],
      [amr10G15Rig, getAmr10G15Pose],
    ]) {
      if (!rig.current) continue;
      const { position, rotationY } = getPose(progress);
      rig.current.position.set(...position);
      rig.current.rotation.y = rotationY;
    }
    if (amr10Rig.current) amr10Rig.current.position.x = amr10Offset(progress);
  });

  return (
    <group position={FINAL_SCENE_POSITION} rotation={[0, FINAL_SCENE_ROTATION_Y, 0]}>
      <primitive object={room.scene} position={[0, 0, 0]} />
      {/* The APT20's and AMR10 G1.5's groups are posed by
          lib/finalScenePaths.js, each model offset by -pivot so it turns
          about its pivot (the APT20's load rollers, the G1.5's centre). */}
      <group ref={apt20Rig}>
        <group position={[APT20_RADAR_AHEAD, 0, 0]}>
          <AmrRadar getOpacity={radarOpacity} />
        </group>
        <primitive object={apt20.scene} position={negate(APT20_PIVOT)} />
      </group>
      <group ref={amr10G15Rig}>
        <AmrRadar getOpacity={radarOpacity} />
        <group ref={(g) => (amr10G15Part.target.current = g)} position={negate(AMR10G15_PIVOT)} />
      </group>
      <group ref={amr10Rig}>
        <group position={AMR10_RADAR_CENTRE}>
          <AmrRadar getOpacity={radarOpacity} />
        </group>
        <primitive object={amr10.scene} position={[0, 0, 0]} />
      </group>
    </group>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFactory3InteriorAmount, F3_TO_INTERIOR_START } from "@/lib/sceneTransition";
import { AMR50_EXIT_END } from "@/lib/timeline";
import { FINAL_SCENE_POSITION, FINAL_SCENE_ROTATION_Y } from "@/lib/amr50Paths";
import { getApt20Pose, APT20_PIVOT } from "@/lib/finalScenePaths";
import AmrRadar from "./AmrRadar";

// The Final Scene interior — Factory 3's inside. Building B2 (standing in
// for Factory 3 from outside) crossfades into it as AMR50 arrives, the same
// way B5 turned into Factory Interior 2 when AMR10 arrived, and AMR50 then
// drives on down its central aisle (see lib/amr50Paths.js for the placement:
// that aisle lies on AMR50's line, its entrance at B2's wall). Its parked
// vehicles (an AMR50, AMR10, APT20 and more) are part of the model and stay
// as scenery; two more are at work, as the client's reference shows: an
// AMR10 towing two carts, which drives along +x down its lane beside AMR50
// as it comes in, and an APT20 carrying a pallet, which then drives on past
// a parking bay beside the room's parked AMR50 and reverses into it
// (lib/finalScenePaths.js). Like AMR50, both carry their radar rings.
// Optimized from public/models/4_Interior Final Scene/GLB with Color/ (see
// scripts/optimize-models.mjs); all in the room's frame.
export const FINAL_SCENE_MODEL_URL = "/models/final/final-scene.glb";
const APT20_MODEL_URL = "/models/final/apt20-moving.glb";
const AMR10_MODEL_URL = "/models/final/amr10-moving.glb";

// The APT20's radar rings centre on its body, 0.27 ahead of its pivot (its
// load rollers).
const APT20_RADAR_AHEAD = 0.27;

// How far along +x the AMR10 is from where its file places it, from the
// start to the end of its drive — as the room appears and AMR50 comes in,
// easing off and on. Its lane runs the room's full length. Its rings centre
// on the AMR10 itself (the +x end of the train, x 2.51..3.05, z
// 0.30..0.60).
const AMR10_FROM = -1.0;
const AMR10_TO = 0;
const AMR10_RADAR_CENTRE = [2.78, 0, 0.4485];

function amr10Offset(progress) {
  const t = Math.min(1, Math.max(0, (progress - F3_TO_INTERIOR_START) / (AMR50_EXIT_END - F3_TO_INTERIOR_START)));
  return AMR10_FROM + (AMR10_TO - AMR10_FROM) * t * t * (3 - 2 * t);
}

function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

// The rings show whenever the room does.
function radarOpacity(progress) {
  return getFactory3InteriorAmount(progress);
}

function useFadingModel(url) {
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
  }, [scene]);

  return { scene, materials };
}

export default function FinalScene() {
  const room = useFadingModel(FINAL_SCENE_MODEL_URL);
  const apt20 = useFadingModel(APT20_MODEL_URL);
  const amr10 = useFadingModel(AMR10_MODEL_URL);
  const apt20Rig = useRef(null);
  const amr10Rig = useRef(null);

  useFrame(() => {
    const progress = scrollStore.progress;
    const opacity = getFactory3InteriorAmount(progress);
    for (const { scene, materials } of [room, apt20, amr10]) {
      scene.visible = opacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = opacity;
      }
    }
    if (apt20Rig.current) {
      const { position, rotationY } = getApt20Pose(progress);
      apt20Rig.current.position.set(...position);
      apt20Rig.current.rotation.y = rotationY;
    }
    if (amr10Rig.current) amr10Rig.current.position.x = amr10Offset(progress);
  });

  return (
    <group position={FINAL_SCENE_POSITION} rotation={[0, FINAL_SCENE_ROTATION_Y, 0]}>
      <primitive object={room.scene} position={[0, 0, 0]} />
      {/* The APT20's group is posed by getApt20Pose, its model offset by
          -pivot so it turns about its load rollers. */}
      <group ref={apt20Rig}>
        <group position={[APT20_RADAR_AHEAD, 0, 0]}>
          <AmrRadar getOpacity={radarOpacity} />
        </group>
        <primitive object={apt20.scene} position={negate(APT20_PIVOT)} />
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

"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFactory3InteriorAmount, F3_TO_INTERIOR_START } from "@/lib/sceneTransition";
import { AMR50_EXIT_END } from "@/lib/timeline";
import { FINAL_SCENE_POSITION, FINAL_SCENE_ROTATION_Y } from "@/lib/amr50Paths";

// The Final Scene interior — Factory 3's inside. Building B2 (standing in
// for Factory 3 from outside) crossfades into it as AMR50 arrives, the same
// way B5 turned into Factory Interior 2 when AMR10 arrived, and AMR50 then
// drives on down its central aisle (see lib/amr50Paths.js for the placement:
// that aisle lies on AMR50's line, its entrance at B2's wall). Its parked
// vehicles (an AMR50, AMR10, APT20 and more) are part of the model and stay
// as scenery; two more — an APT20 carrying a pallet and an AMR10 towing a
// trolley — drive along +x beside AMR50 as it comes in, as the client's
// reference shows. Optimized from public/models/4_Interior Final Scene/GLB
// with Color/ (see scripts/optimize-models.mjs); all in the room's frame.
export const FINAL_SCENE_MODEL_URL = "/models/final/final-scene.glb";
const APT20_MODEL_URL = "/models/final/apt20-moving.glb";
const AMR10_MODEL_URL = "/models/final/amr10-moving.glb";

// How far along +x each moving vehicle is from where its file places it,
// from the start to the end of its drive. Kept inside the clear stretch of
// its lane (checked against the room's geometry): the APT20's lane is open
// for x -1.42..2.04 and it spans 0.04..0.79; the AMR10's runs the room's
// full length.
const MOVERS = [
  { url: APT20_MODEL_URL, from: -0.6, to: 1.0 },
  { url: AMR10_MODEL_URL, from: -1.0, to: 0 },
];

// They drive as the room appears and AMR50 comes in, easing off and on.
function moverT(progress) {
  const t = Math.min(1, Math.max(0, (progress - F3_TO_INTERIOR_START) / (AMR50_EXIT_END - F3_TO_INTERIOR_START)));
  return t * t * (3 - 2 * t);
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
  const movers = useRef([]);

  useFrame(() => {
    const progress = scrollStore.progress;
    const opacity = getFactory3InteriorAmount(progress);
    for (const { scene, materials } of [room, apt20, amr10]) {
      scene.visible = opacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = opacity;
      }
    }
    const t = moverT(progress);
    MOVERS.forEach(({ from, to }, i) => {
      if (movers.current[i]) movers.current[i].position.x = from + (to - from) * t;
    });
  });

  return (
    <group position={FINAL_SCENE_POSITION} rotation={[0, FINAL_SCENE_ROTATION_Y, 0]}>
      <primitive object={room.scene} position={[0, 0, 0]} />
      {[apt20, amr10].map(({ scene }, i) => (
        <group key={MOVERS[i].url} ref={(g) => (movers.current[i] = g)}>
          <primitive object={scene} position={[0, 0, 0]} />
        </group>
      ))}
    </group>
  );
}

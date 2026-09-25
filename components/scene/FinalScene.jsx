"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFactory3InteriorAmount } from "@/lib/sceneTransition";
import { FINAL_SCENE_POSITION } from "@/lib/amr50Paths";

// The Final Scene interior — Factory 3's inside. Building B2 (standing in
// for Factory 3 from outside) crossfades into it as AMR50 arrives, the same
// way B5 turned into Factory Interior 2 when AMR10 arrived, and AMR50 then
// drives on down its central aisle (see lib/amr50Paths.js for the placement:
// that aisle lies on AMR50's line, its entrance at B2's wall). Its own
// vehicles (an AMR50, AMR10, APT20 and more) are part of the model and stay
// as scenery. Optimized from public/models/4_Interior Final Scene/GLB with
// Color/Final Scene.glb (see scripts/optimize-models.mjs).
export const FINAL_SCENE_MODEL_URL = "/models/final/final-scene.glb";

export default function FinalScene() {
  const { scene } = useModel(FINAL_SCENE_MODEL_URL);
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

  useFrame(() => {
    const opacity = getFactory3InteriorAmount(scrollStore.progress);
    scene.visible = opacity > 0.001;
    for (const mat of materials.current) {
      mat.opacity = opacity;
    }
  });

  return <primitive object={scene} position={FINAL_SCENE_POSITION} />;
}

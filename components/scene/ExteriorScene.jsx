"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";

export const EXTERIOR_MODEL_URL = "/models/exterior/exterior.glb";

export default function ExteriorScene() {
  const { scene } = useModel(EXTERIOR_MODEL_URL);
  const materials = useRef([]);

  // Clone materials once so we can animate opacity on our own copies
  // without mutating the cached/shared glTF materials (useGLTF caches by
  // URL — mutating the originals would leak into any other place this
  // model is reused). Colors are left exactly as authored — verified
  // against the raw source file (a warm tan, ~#a19384, despite the
  // materials being named "White"/"Grey") — no override applied, per
  // request to keep the true original color rather than correcting it to
  // look white.
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
    const { exterior } = getFadeOpacities(scrollStore.progress);
    scene.visible = exterior > 0.001;
    for (const mat of materials.current) {
      mat.opacity = exterior;
    }
  });

  return <primitive object={scene} />;
}

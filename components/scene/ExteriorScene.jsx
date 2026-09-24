"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";
import { EXTERIOR_ROTATION_Y } from "@/lib/exteriorLayout";

// Draco-compressed copy of "Exterior (Darker than original).glb" (KeyShot
// export, 195MB -> 21MB via `gltf-transform draco`). Same coordinate frame
// and bounds as the previous exterior-model.glb, so exteriorLayout.js and
// cameraPath.js still line up. It carries its own darker materials, so
// they're used as-is rather than overridden.
export const EXTERIOR_MODEL_URL = "/models/exterior/exterior-model-dark.glb";

// The model's materials are tuned for model-viewer's default look (a
// bright studio "room" environment + neutral tone mapping). The shared
// scene IBL in Experience.jsx is much dimmer (tuned for the old bright-tan
// override), which made this model read noticeably darker than in
// model-viewer. So the exterior gets its own RoomEnvironment envMap —
// three's equivalent of model-viewer's neutral environment — set per
// material, so the interior scenes keep the shared lighting untouched.
const EXTERIOR_ENV_INTENSITY = 0.8;

export default function ExteriorScene() {
  const { scene } = useModel(EXTERIOR_MODEL_URL);
  const gl = useThree((s) => s.gl);
  const materials = useRef([]);

  const envMap = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);
  useEffect(() => () => envMap.dispose(), [envMap]);

  // Clone materials once so we can animate opacity on our own copies
  // without mutating the cached/shared glTF materials (useGLTF caches by
  // URL — mutating the originals would leak into any other place this
  // model is reused).
  useEffect(() => {
    const mats = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        obj.material.envMap = envMap;
        obj.material.envMapIntensity = EXTERIOR_ENV_INTENSITY;
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [scene, envMap]);

  useFrame(() => {
    const { exterior } = getFadeOpacities(scrollStore.progress);
    scene.visible = exterior > 0.001;
    for (const mat of materials.current) {
      mat.opacity = exterior;
    }
  });

  return <primitive object={scene} rotation={[0, EXTERIOR_ROTATION_Y, 0]} />;
}

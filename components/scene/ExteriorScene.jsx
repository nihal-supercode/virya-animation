"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";
import { EXTERIOR_ROTATION_Y } from "@/lib/exteriorLayout";
import { applyModelViewerLook, createModelViewerEnvMap } from "@/lib/modelViewerEnvironment";

// Color variants of the same campus, switchable at runtime (see
// ExteriorVariantSwitcher.jsx) to compare against the reference renders.
// The three KeyShot exports ("Exterior (Darker/Lighter than original).glb"
// and buildings/Exterior.glb, 195MB each) were Draco-compressed to ~21MB
// via `gltf-transform draco`. All share the previous exterior-model.glb's
// coordinate frame and bounds, so exteriorLayout.js and cameraPath.js
// line up for every variant. Every variant is shown with its own
// materials as-is — "previous" is the older single-material export, whose
// own color is plain white.
export const EXTERIOR_VARIANTS = [
  { id: "dark", label: "Darker", url: "/models/exterior/exterior-model-dark.glb" },
  { id: "original", label: "Original", url: "/models/exterior/exterior-model-original.glb" },
  { id: "light", label: "Lighter", url: "/models/exterior/exterior-model-light.glb" },
  { id: "previous", label: "Previous", url: "/models/exterior/exterior-model.glb" },
];
export const DEFAULT_EXTERIOR_VARIANT = "dark";

// Every variant is shown the way <model-viewer> shows it by default (its
// generated "neutral" studio environment, neutral tone mapping at its
// effective 1.3 exposure, no punctual lights) — see
// lib/modelViewerEnvironment.js. Applied per material, so the interior
// scenes keep the shared lighting/tone mapping in Experience.jsx.

export default function ExteriorScene({ variant = DEFAULT_EXTERIOR_VARIANT }) {
  const { url } =
    EXTERIOR_VARIANTS.find((v) => v.id === variant) ?? EXTERIOR_VARIANTS[0];
  const { scene } = useModel(url);
  const gl = useThree((s) => s.gl);
  const materials = useRef([]);

  const envMap = useMemo(() => createModelViewerEnvMap(gl), [gl]);
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
        applyModelViewerLook(obj.material, envMap);
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

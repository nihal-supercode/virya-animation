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

// While the campus dissolves into Factory Interior 1 it's drawn AFTER the
// room (renderOrder 0), as a veil over it, and stops writing depth — the
// same treatment as the B4/B5 building crossfades. Its ground sits flush
// with the room's floor, so it's also nudged toward the camera in the depth
// test (polygonOffset) while fading: the ground then consistently lies
// over the floor instead of the two flickering through each other.
// Unchanged whenever the campus is fully solid.
const EXTERIOR_RENDER_ORDER = 2;
const FADE_POLYGON_OFFSET = -1;

// Loads the chosen variant with its own material clones (opacity is
// animated per frame on these, not on the glTF cache's shared originals).
function useFadingExterior(url, envMap) {
  const { scene } = useModel(url);
  const materials = useRef([]);

  // Clone materials once so we can animate opacity on our own copies
  // without mutating the cached/shared glTF materials (useGLTF caches by
  // URL — mutating the originals would leak into any other place this
  // model is reused).
  useEffect(() => {
    const mats = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = EXTERIOR_RENDER_ORDER;
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        applyModelViewerLook(obj.material, envMap);
        obj.material.polygonOffsetFactor = FADE_POLYGON_OFFSET;
        obj.material.polygonOffsetUnits = FADE_POLYGON_OFFSET;
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [scene, envMap]);

  return { scene, materials };
}

export default function ExteriorScene({ variant = DEFAULT_EXTERIOR_VARIANT }) {
  const { url } =
    EXTERIOR_VARIANTS.find((v) => v.id === variant) ?? EXTERIOR_VARIANTS[0];
  const gl = useThree((s) => s.gl);

  const envMap = useMemo(() => createModelViewerEnvMap(gl), [gl]);
  useEffect(() => () => envMap.dispose(), [envMap]);
  const exterior = useFadingExterior(url, envMap);

  useFrame(() => {
    const { exterior: opacity } = getFadeOpacities(scrollStore.progress);
    const fading = opacity < 0.999;
    for (const { scene, materials } of [exterior]) {
      scene.visible = opacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = opacity;
        mat.depthWrite = !fading;
        mat.polygonOffset = fading;
      }
    }
  });

  return <primitive object={exterior.scene} rotation={[0, EXTERIOR_ROTATION_Y, 0]} />;
}

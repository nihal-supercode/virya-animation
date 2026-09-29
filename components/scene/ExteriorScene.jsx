"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities, getOutroOpacities } from "@/lib/sceneTransition";
import {
  EXTERIOR_ROTATION_Y,
  EXTERIOR_ENTRY_PLACEMENT,
  EXTERIOR_OUTRO_PLACEMENT,
} from "@/lib/exteriorLayout";
import { FINAL_PARK_END } from "@/lib/timeline";
import { applyModelViewerLook, createModelViewerEnvMap } from "@/lib/modelViewerEnvironment";
import { getIntroStep, startIntro } from "@/lib/introStore";

// The campus fades in over the start of the load-in camera sweep
// (introStore.js), which kicks off once this has loaded.
const INTRO_FADE_IN = 0.9; // seconds

// Color variants of the same campus, switchable at runtime (see
// ExteriorVariantSwitcher.jsx) to compare against the reference renders.
// The four KeyShot exports ("Exterior (Darker/Lighter than original).glb",
// "Exterior (coloured version).glb" and buildings/Exterior.glb, ~195MB
// each) were Draco-compressed to ~21MB via `gltf-transform draco`. All share the previous exterior-model.glb's
// coordinate frame and bounds, so exteriorLayout.js and cameraPath.js
// line up for every variant. Every variant is shown with its own
// materials as-is — "previous" is the older single-material export, whose
// own color is plain white.
export const EXTERIOR_VARIANTS = [
  { id: "dark", label: "Darker", url: "/models/exterior/exterior-model-dark.glb" },
  { id: "original", label: "Original", url: "/models/exterior/exterior-model-original.glb" },
  { id: "light", label: "Lighter", url: "/models/exterior/exterior-model-light.glb" },
  { id: "coloured", label: "Coloured", url: "/models/exterior/exterior-model-coloured.glb" },
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
  const placement = useRef(null);

  // Mounted only once the model has loaded (Suspense), so the intro starts
  // with the campus there to show.
  useEffect(() => startIntro(scrollStore.progress), []);

  useFrame(() => {
    const progress = scrollStore.progress;
    // The campus appears twice, both times at the factory buildings' scale
    // (exteriorLayout.js): dissolving into Factory Interior 1 at the start,
    // with its B4 around that room, and again at the end, forming around the
    // Final Scene as the camera exits it (sceneTransition.js's
    // getOutroOpacities), with its B1 around that room. It's invisible for
    // the whole journey between the two, so it simply moves over then.
    const outro = progress > FINAL_PARK_END;
    const { position, scale } = outro ? EXTERIOR_OUTRO_PLACEMENT : EXTERIOR_ENTRY_PLACEMENT;
    if (placement.current) {
      placement.current.position.set(...position);
      placement.current.scale.setScalar(scale);
    }
    const opacity =
      (outro ? getOutroOpacities(progress).exterior : getFadeOpacities(progress).exterior) *
      getIntroStep(0, INTRO_FADE_IN);
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

  return (
    <group ref={placement}>
      <primitive object={exterior.scene} rotation={[0, EXTERIOR_ROTATION_Y, 0]} />
    </group>
  );
}

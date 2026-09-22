"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";

export const EXTERIOR_MODEL_URL = "/models/exterior/exterior-model.glb";

// The leftover per-building files (public/models/exterior/buildings/
// B1-B5.glb, from an earlier pipeline run — currently unused elsewhere)
// all share this exact tan/grey, "Paint Matte White #2" material
// (baseColorFactor [0.6298, 0.5754, 0.5181, 1]) — confirmed by inspecting
// their glb JSON directly. exterior-model.glb's own single material
// ("Paint Matte White #3") is a genuine pure white [1,1,1,1] instead.
// Since exterior-model.glb is the complete campus (the B-files only cover
// 5 small building blocks — the large detailed structures have no
// separate per-building export), this overrides its one material's color
// to match the B-files' tan tone directly, rather than swapping in the
// incomplete B-file set and losing most of the campus geometry.
// Scaled up ~60% from that raw tone (same hue/ratio, just brighter) — the
// raw value read too dark under this scene's lighting. The R channel is
// now at its ceiling (clamped to 1) — pushing the multiplier much further
// from here starts flattening the warm hue toward plain white rather than
// making a warmer/lighter tan, since G and B still have headroom but R
// doesn't.
const TAN_COLOR = [0.6298472285270691, 0.575425386428833, 0.5180901885032654].map(
  (c) => Math.min(1, c * 1.6)
);

export default function ExteriorScene() {
  const { scene } = useModel(EXTERIOR_MODEL_URL);
  const materials = useRef([]);

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
        obj.material.color.setRGB(...TAN_COLOR);
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

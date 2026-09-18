"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getExitT } from "@/lib/vehiclePaths";
import { INTERIOR_1_MODEL_URL } from "./Interior1Scene";

// TEMPORARY PLACEHOLDER — there is no real "Factory Interior 2" asset yet
// (per the storyboard's beat 3/4, "ZOOM OUT (EXT 2) -> INDOOR-OUTDOOR" ->
// "NEW FACTORY ZOOM IN"). For now it's a SECOND instance of the same
// Factory Interior 1 model standing in for it, not a crossfade-in-place,
// and not a crude primitive placeholder, since the ask was specifically
// for AMR10 to physically drive there. Swap the model URL here for the
// real Factory Interior 2 asset once it's available; nothing else needs
// to change.
//
// Positioned PARALLEL to Factory Interior 1 and directly opposite it —
// same x as Interior1Scene's own POSITION [-2.05, 0, -2.41], continued
// further along the same -Z heading AMR10 already travels, so it's a
// straight crossing rather than a diagonal detour.
const POSITION = [-2.05, 0, -14];

// Fades in across the ENTIRE exit phase (TOP_VIEW_END..EXIT_END), tied
// directly to getExitT — the same 0-1 progress that drives AMR10's own
// journey out of Factory Interior 1 and into this building (see
// getAmr10ExitTransform in vehiclePaths.js). Two earlier versions were both
// wrong: a hard binary visibility toggle at TOP_VIEW_END (invisible ->
// fully visible in one frame) read as an abrupt jump; a short ~15%-of-phase
// fade window fixed that pop in isolation but finished LONG before AMR10
// (and the camera, which only reaches this building as it tracks AMR10 —
// see cameraPath.js) actually got here — the building sat fully opaque and
// off-screen for most of the journey, then still seemed to "appear from
// nowhere" the moment it entered frame, which is exactly the "no smooth
// transition... while the AMR10 is moving" complaint. Spanning the whole
// phase means the building is visibly still materializing WHILE AMR10
// drives toward it and the camera pans over, finishing (opacity 1) exactly
// as AMR10 arrives at AMR10_EXIT_TARGET — a single continuous reveal
// synced to the journey instead of a fade that races ahead of it.

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function NextFactoryScene() {
  // useModel/useGLTF caches by URL — Interior1Scene already renders this
  // exact same GLTF's scene object elsewhere. An Object3D can only live in
  // one place in the graph at a time (adding it to a second parent just
  // MOVES it, it doesn't duplicate it), so this needs its own clone of the
  // hierarchy. .clone() is the standard/efficient way to do this: node
  // transforms are duplicated, geometries and materials are shared by
  // reference (no extra GPU memory for a second copy).
  const { scene } = useModel(INTERIOR_1_MODEL_URL);
  const cloned = useMemo(() => scene.clone(), [scene]);
  const materials = useRef([]);

  // Materials still need their own clone (like ExteriorScene/Interior1Scene)
  // since opacity is now animated per-frame below — mutating the shared
  // cached materials would leak into Interior1Scene's own instance of the
  // same model.
  useEffect(() => {
    const mats = [];
    cloned.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [cloned]);

  useFrame(() => {
    const progress = scrollStore.progress;
    // getExitT already clamps to 0 at/before TOP_VIEW_END and 1 at/after
    // EXIT_END, matching AMR10's own exit-phase timing exactly.
    const opacity = easeInOutCubic(getExitT(progress));

    cloned.visible = opacity > 0.001;
    for (const mat of materials.current) {
      mat.opacity = opacity;
    }
  });

  return <primitive object={cloned} position={POSITION} />;
}

"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getFactory3InteriorAmount, F3_TO_INTERIOR_START } from "@/lib/sceneTransition";
import { AMR50_EXIT_END, FINAL_PARK_END } from "@/lib/timeline";
import { FINAL_SCENE_POSITION, FINAL_SCENE_ROTATION_Y } from "@/lib/amr50Paths";

// The Final Scene interior — Factory 3's inside. Building B2 (standing in
// for Factory 3 from outside) crossfades into it as AMR50 arrives, the same
// way B5 turned into Factory Interior 2 when AMR10 arrived, and AMR50 then
// drives on down its central aisle (see lib/amr50Paths.js for the placement:
// that aisle lies on AMR50's line, its entrance at B2's wall). Its parked
// vehicles (an AMR50, AMR10, APT20 and more) are part of the model and stay
// as scenery; two more — an APT20 carrying a pallet and an AMR10 towing a
// trolley — drive along +x beside AMR50 as it comes in, as the client's
// reference shows. The AMR10 keeps going, out of the room past its +x end,
// clearing the way for AMR50 to swing out and reverse into its parking bay
// (amr50Paths.js's park beat). Optimized from public/models/4_Interior
// Final Scene/GLB with Color/ (see scripts/optimize-models.mjs); all in the
// room's frame.
export const FINAL_SCENE_MODEL_URL = "/models/final/final-scene.glb";
const APT20_MODEL_URL = "/models/final/apt20-moving.glb";
const AMR10_MODEL_URL = "/models/final/amr10-moving.glb";

// How far along +x each moving vehicle is from where its file places it,
// from the start to the end of its drive, and over which scroll window
// (see below). Kept inside the clear stretch of its lane (checked against
// the room's geometry): the APT20's lane is open for x -1.42..2.04 and it
// spans 0.04..0.79. The AMR10's runs the room's full length and it spans
// 1.63..3.05, so it drives on out past the room's +x end (3.27), fading as
// it leaves the floor (fadeOut, of its offset) — gone before AMR50 swings
// out into its lane (z 0.30..0.60) to reverse into its bay.
const AMR10_EXIT_END = AMR50_EXIT_END + 0.25 * (FINAL_PARK_END - AMR50_EXIT_END);
const MOVERS = [
  { url: APT20_MODEL_URL, from: -0.6, to: 1.0, end: AMR50_EXIT_END, stops: true },
  { url: AMR10_MODEL_URL, from: -1.0, to: 1.8, end: AMR10_EXIT_END, fadeOut: [0.35, 1.6] },
];

// They drive as the room appears and AMR50 comes in, easing off from rest;
// the APT20 eases to a stop as AMR50 does, the AMR10 drives straight on out.
function moverT(progress, { end, stops }) {
  const t = Math.min(1, Math.max(0, (progress - F3_TO_INTERIOR_START) / (end - F3_TO_INTERIOR_START)));
  if (stops) return t * t * (3 - 2 * t);
  // Eases in over the first ACCEL of it, then cruises (no braking).
  const ACCEL = 0.4;
  const v = 1 / (1 - ACCEL / 2);
  return t < ACCEL ? (v * t * t) / (2 * ACCEL) : v * (t - ACCEL / 2);
}

function fadeOut(offset, [start, end]) {
  const x = Math.min(1, Math.max(0, (offset - start) / (end - start)));
  return 1 - x * x * (3 - 2 * x);
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
    [room, apt20, amr10].forEach(({ scene, materials }, i) => {
      const mover = MOVERS[i - 1];
      let vehicleOpacity = opacity;
      if (mover) {
        const offset = mover.from + (mover.to - mover.from) * moverT(progress, mover);
        if (movers.current[i - 1]) movers.current[i - 1].position.x = offset;
        if (mover.fadeOut) vehicleOpacity *= fadeOut(offset, mover.fadeOut);
      }
      scene.visible = vehicleOpacity > 0.001;
      for (const mat of materials.current) {
        mat.opacity = vehicleOpacity;
      }
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

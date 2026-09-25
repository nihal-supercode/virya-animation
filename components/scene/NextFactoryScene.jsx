"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import { getExitT } from "@/lib/vehiclePaths";
import {
  getExitExteriorAmount,
  getFactory2ExteriorAmount,
  roomVisibility,
} from "@/lib/sceneTransition";
import { getAmr50Rig, AMR50_PIVOT, AMR50_TROLLEY_PIVOT } from "@/lib/amr50Paths";
import AmrRadar from "./AmrRadar";

export const INTERIOR_2_MODEL_URL = "/models/interior-2/factory-interior-2.glb";
// Extra props added to Factory 2, exported from the same source scene so
// their geometry already sits at its spot in the factory's own local frame —
// they share the factory's POSITION/ROTATION and fade with it:
// - a second AMR50, beside the one built into the factory model (same row,
//   ~0.37 to its side) — this one's separate, so it can drive: it picks up
//   the trolley below and tows it out (lib/amr50Paths.js), with the same
//   radar rings as AMR10;
// - an AMR50 trolley in the empty bay among the large cage trolleys, lined
//   up with the other three between the barricades.
const EXTRA_MODEL_URLS = [
  "/models/interior-2/amr50.glb",
  "/models/interior-2/amr50-trolley.glb",
];

// Factory Interior 2 (storyboard beat "NEW FACTORY ZOOM IN") — the building
// AMR10 drives into from Factory Interior 1. Optimized from
// public/models/3_Factory Interior 2/GLB with color/Factory Interior_2_with
// color.glb (see scripts/optimize-models.mjs). Its geometry is centered on
// its own origin (bbox ~x:[-3.2,3.2] z:[-3.18,3.18]).
//
// Positioned so the lone floor box in the aisle (model-local center
// ~(-0.007, -1.581), bbox z:[-1.749,-1.412], measured from a top-down
// raster of the source geometry) sits on AMR10's travel line, directly
// ahead of where it stops. With the 180° ROTATION below that box's center
// is at POSITION + (0.007, 0, 1.581) in world space — lined up on
// AMR10's travel line (x -1.5445);
// AMR10_EXIT_TARGET (vehiclePaths.js) stops AMR10 just short of it.
//
// Then set back a further 2.0786 in -Z: 1.5786 so its near wall lines up
// with where B5's actual building walls start (world z ~-12.48) — B5's
// outline extends past that toward the gap with only a thin arm/low ramp
// (see ExitBuildingsScene.jsx), and the room was poking out in front of B5
// during the crossfade — plus 0.5 so it sits a little inside B5 (near wall
// at world z ~-12.98). AMR10_EXIT_TARGET moved by the same amount, so the
// box is now at world (-1.5445, -14.5786).
const POSITION = [-1.5515, 0, -16.1596];

// Visibility: fades in quickly at the start of the exit phase — while the
// camera is still in the top view over Factory Interior 1, ~5m+ away, so
// it's off-screen — then follows the same Factory <-> B5 crossfade as
// Factory Interior 1 <-> B4 (see sceneTransition.js's
// getExitExteriorAmount and ExitBuildingsScene.jsx), so by the time AMR10
// reaches it, it's the fully visible interior again.
const APPEAR_END_T = 0.1;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Turned 180° around its own vertical axis (the model is centered on its
// origin, so this flips it in place — same footprint, bbox is symmetric) so
// AMR10 drives in through what was the building's far side.
const ROTATION = [0, Math.PI, 0];

// Same smoothing rate as AMR10's (Interior1Scene's FOLLOW_LAMBDA).
const AMR50_FOLLOW_LAMBDA = 5;

function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

function amr50RadarOpacity(progress) {
  return getAmr50Rig(progress).radar;
}

export default function NextFactoryScene() {
  const { scene } = useModel(INTERIOR_2_MODEL_URL);
  const amr50 = useModel(EXTRA_MODEL_URLS[0]).scene;
  const amr50Trolley = useModel(EXTRA_MODEL_URLS[1]).scene;
  // Factory room materials, and the moving AMR50 + trolley's, separately:
  // the room also dissolves into B5 as AMR50 leaves for Factory 3, but AMR50
  // and its trolley never fade then.
  const materials = useRef([]);
  const amr50Materials = useRef([]);
  const amr50Rig = useRef(null);
  const amr50TrolleyRig = useRef(null);
  // Smoothed scroll progress for AMR50 — the same smoothing (rate and
  // approach) as AMR10's in Interior1Scene, so both drive with the same feel.
  const amr50Progress = useRef(null);

  // Materials get their own clone (like ExteriorScene/Interior1Scene) since
  // opacity is animated per-frame below and the cached originals are shared
  // by useModel's URL cache.
  useEffect(() => {
    const collect = (roots, renderOrder = 0) => {
      const mats = [];
      for (const root of roots) {
        root.traverse((obj) => {
          if (obj.isMesh) {
            obj.renderOrder = renderOrder;
            obj.material = obj.material.clone();
            obj.material.transparent = true;
            mats.push(obj.material);
          }
        });
      }
      return mats;
    };
    materials.current = collect([scene]);
    // AMR50 and its trolley draw after the B4/B5 buildings (renderOrder 2),
    // like AMR10, so a building forming around them never veils them.
    amr50Materials.current = collect([amr50, amr50Trolley], 3);
  }, [scene, amr50, amr50Trolley]);

  useFrame((_state, delta) => {
    const progress = scrollStore.progress;
    // getExitT already clamps to 0 at/before TOP_VIEW_END and 1 at/after
    // EXIT_END, matching AMR10's own exit-phase timing exactly.
    const exitT = getExitT(progress);
    const opacity =
      easeInOutCubic(Math.min(1, exitT / APPEAR_END_T)) * roomVisibility(getExitExteriorAmount(exitT));
    const roomOpacity = opacity * roomVisibility(getFactory2ExteriorAmount(progress));

    scene.visible = roomOpacity > 0.001;
    for (const mat of materials.current) {
      mat.opacity = roomOpacity;
    }
    const amr50Visible = opacity > 0.001;
    amr50.visible = amr50Visible;
    amr50Trolley.visible = amr50Visible;
    for (const mat of amr50Materials.current) {
      mat.opacity = opacity;
    }

    if (amr50Rig.current && amr50TrolleyRig.current) {
      amr50Progress.current =
        amr50Progress.current === null
          ? progress
          : amr50Progress.current +
            (progress - amr50Progress.current) * (1 - Math.exp(-AMR50_FOLLOW_LAMBDA * delta));
      const { body, trolley } = getAmr50Rig(amr50Progress.current);
      amr50Rig.current.position.set(...body.position);
      amr50Rig.current.rotation.y = body.rotationY;
      amr50TrolleyRig.current.position.set(...trolley.position);
      amr50TrolleyRig.current.rotation.y = trolley.rotationY;
    }
  });

  return (
    <group position={POSITION} rotation={ROTATION}>
      {/* Explicit identity positions (see Interior1Scene): useModel's cache
          survives Fast Refresh and R3F only re-applies props present here. */}
      <primitive object={scene} position={[0, 0, 0]} />
      {/* Each rig group is posed in the factory's local frame by
          getAmr50Rig; its model is offset by -pivot so it turns about its
          own centre (AMR50) or drawbar tip (trolley, where it hitches). */}
      <group ref={amr50Rig}>
        <AmrRadar getOpacity={amr50RadarOpacity} />
        <primitive object={amr50} position={negate(AMR50_PIVOT)} />
      </group>
      <group ref={amr50TrolleyRig}>
        <primitive object={amr50Trolley} position={negate(AMR50_TROLLEY_PIVOT)} />
      </group>
    </group>
  );
}

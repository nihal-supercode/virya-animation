"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useModel } from "@/lib/loaders";
import { scrollStore } from "@/lib/scrollStore";
import {
  getExitExteriorAmount,
  getFactory2ExteriorAmount,
  getFactory3InteriorAmount,
} from "@/lib/sceneTransition";
import { getExitT } from "@/lib/vehiclePaths";
import { FACTORY3_NEAR_X } from "@/lib/amr50Paths";
import { applyModelViewerLook, createModelViewerEnvMap } from "@/lib/modelViewerEnvironment";

// B4 and B5 stand in for Factory Interior 1 and Factory Interior 2 as seen
// from outside while AMR10 crosses between them, and a B4 and B2 for
// Factory Interior 2 and Factory 3 while AMR50 crosses between those (see
// sceneTransition.js's getFactory2ExteriorAmount, and
// getExitExteriorAmount for the crossfade timing).
//
// The source building blocks are small (they're sized for the exterior
// campus model) with their site-plan offset baked into the vertices, so
// each is uniformly scaled until its long side (Z) matches its factory's
// Z extent, times its sizeBoost, and centered on that factory in X. The extra
// size grows AWAY from the gap: each building's gap-facing wall is pinned
// to its factory's gap-facing wall, so the gap AMR10 drives across is
// unchanged and it never passes through a building. AMR10's line (world
// x ~-1.54) stays well inside both buildings' ~5m widths. Bboxes from
// `gltf-transform inspect`; factory centers/extents from each room model's
// bbox plus its POSITION (and Factory 2's 180° rotation) — see
// Interior1Scene.jsx and NextFactoryScene.jsx.
const BUILDINGS = [
  {
    url: "/models/exterior/buildings/B4.glb",
    bboxMin: [1.16836, 0.00355, -3.15265],
    bboxMax: [2.32499, 0.36365, -1.30505],
    factoryCenter: [-2.04774, -3.035245],
    factoryDepthZ: 6.40019,
    // Factory 1's far wall (toward Factory 2) is its min Z.
    gapSide: "min",
    sizeBoost: 1.6,
    getOpacity: (p) => getExitExteriorAmount(getExitT(p)),
  },
  {
    url: "/models/exterior/buildings/B5.glb",
    bboxMin: [1.14194, 0.00355, -0.11526],
    bboxMax: [2.87615, 0.45042, 2.69944],
    // Deliberately 0.5 short of Factory 2's actual center (NextFactoryScene
    // POSITION) — Factory 2 is set that much further inside B5.
    factoryCenter: [-1.55376, -15.65853],
    factoryDepthZ: 6.36188,
    // Factory 2's near wall (toward Factory 1) is its max Z.
    gapSide: "max",
    // Pin B5's actual front wall (the highest Z of anything taller than
    // ~0.2 in source units) to that factory wall, not its bbox max Z — the
    // bbox extends ~0.54 further (~2m once scaled) with only a thin arm and
    // a low ramp, which would otherwise leave the room poking out in front.
    gapFaceZ: 2.16221,
    sizeBoost: 1.6,
    // B5 stands in for Factory 2 as AMR10 arrives from Factory 1 (AMR50's
    // crossing to Factory 3 uses a B4 for Factory 2 instead — below).
    getOpacity: (p) => getExitExteriorAmount(getExitT(p)),
  },
  {
    // Factory 2 as AMR50 leaves it for Factory 3, shown as a B4 — a solid
    // block, so unlike B5 (whose walls only cover part of the factory) it
    // hides the whole room. Centred on Factory 2 and sized so its width
    // clears the 6.4-wide factory by ~0.2 each side (x1.7 rather than
    // Factory 1's x1.6). B4 is used elsewhere too, so this renders its own
    // copy.
    key: "factory2-b4",
    url: "/models/exterior/buildings/B4.glb",
    clone: true,
    bboxMin: [1.16836, 0.00355, -3.15265],
    bboxMax: [2.32499, 0.36365, -1.30505],
    transform: (() => {
      const scale = (6.40019 / (3.15265 - 1.30505)) * 1.7;
      // Factory 2's centre (NextFactoryScene's POSITION).
      const centre = [-1.5515, -16.1596];
      return {
        scale,
        position: [
          centre[0] - ((1.16836 + 2.32499) / 2) * scale,
          -0.00355 * scale,
          centre[1] - ((-3.15265 + -1.30505) / 2) * scale,
        ],
      };
    })(),
    getOpacity: getFactory2ExteriorAmount,
  },
  {
    // Factory 3 (there's no interior model for it) — the building AMR50
    // tows the AMR50 trolley across to — shown as B2. Set on AMR50's straight
    // exit line from Factory 2, turned a quarter (+90° about Y: source
    // (x, z) -> world (z, -x)) so its source max-z side faces Factory 2, at
    // FACTORY3_NEAR_X. That side is irregular (recesses, a courtyard), so
    // rather than centring B2 on AMR50's line it's placed so the line meets
    // a stretch (~1m wide) where the wall is right on that face — AMR50
    // drives up to an actual wall instead of stopping short of a recess.
    // Scaled to read alongside the other buildings: ~9.4 across AMR50's
    // path, ~8.1 along it, ~1.6 tall.
    key: "factory3-b2",
    url: "/models/exterior/buildings/B2.glb",
    bboxMin: [-3.08058, 0.00355, -3.26876],
    bboxMax: [-1.02311, 0.30948, -1.55451],
    transform: (() => {
      const scale = 5.2;
      // Source extents of its parts taller than ~0.12.
      const faceZ = -1.555; // faces Factory 2 once turned (world x = pos.x + z * scale)
      const wallStretchX = -2.323; // source x of that flush wall stretch, put on the line (world z = pos.z - x * scale)
      // Factory 2 model-local -> world: x = -1.5515 - lx, z = -16.1596 - lz.
      const nearWallX = -1.5515 - FACTORY3_NEAR_X;
      const lineZ = -16.1596 - 0.018; // AMR50's drive line
      return {
        scale,
        rotationY: Math.PI / 2,
        position: [nearWallX - faceZ * scale, -0.00355 * scale, lineZ + wallStretchX * scale],
      };
    })(),
    // Then turns into the Final Scene interior as AMR50 arrives.
    getOpacity: (p) => getFactory2ExteriorAmount(p) * (1 - getFactory3InteriorAmount(p)),
  },
];

function fitTransform({
  bboxMin,
  bboxMax,
  factoryCenter,
  factoryDepthZ,
  gapSide,
  gapFaceZ,
  sizeBoost,
}) {
  const scale = (factoryDepthZ / (bboxMax[2] - bboxMin[2])) * sizeBoost;
  const cx = (bboxMin[0] + bboxMax[0]) / 2;
  const z =
    gapSide === "min"
      ? factoryCenter[1] - factoryDepthZ / 2 - bboxMin[2] * scale
      : factoryCenter[1] + factoryDepthZ / 2 - (gapFaceZ ?? bboxMax[2]) * scale;
  return {
    scale,
    position: [factoryCenter[0] - cx * scale, -bboxMin[1] * scale, z],
  };
}

function FadingBuilding({ building, envMap }) {
  const gltf = useModel(building.url);
  // A model used for more than one building gets its own copy of the scene
  // graph (an Object3D can only be in the scene once); its materials are
  // cloned per mesh below anyway.
  const scene = useMemo(
    () => (building.clone ? gltf.scene.clone(true) : gltf.scene),
    [gltf.scene, building.clone]
  );
  const materials = useRef([]);
  const { scale, position, rotationY = 0 } = useMemo(
    () => building.transform ?? fitTransform(building),
    [building]
  );

  // Same per-material clone + model-viewer look as ExteriorScene, so these
  // read as the same "filled" exterior buildings as the campus model.
  //
  // Each building encloses its factory room, so it has to be drawn AFTER the
  // room (and AMR10) — renderOrder overrides three.js's transparent sorting,
  // which here is effectively arbitrary since these models' origins sit far
  // from their geometry (their site-plan offset is baked into the vertices).
  // And while partly transparent it mustn't write depth (see useFrame), or
  // the moment it became even faintly visible its walls would cut the room
  // out behind them — a sudden swap instead of a dissolve.
  useEffect(() => {
    const mats = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.renderOrder = 2;
        obj.material = obj.material.clone();
        obj.material.transparent = true;
        applyModelViewerLook(obj.material, envMap);
        mats.push(obj.material);
      }
    });
    materials.current = mats;
  }, [scene, envMap]);

  useFrame(() => {
    const opacity = building.getOpacity(scrollStore.progress);
    scene.visible = opacity > 0.001;
    const solid = opacity > 0.999;
    for (const mat of materials.current) {
      mat.opacity = opacity;
      mat.depthWrite = solid;
    }
  });

  return (
    <primitive object={scene} position={position} rotation={[0, rotationY, 0]} scale={scale} />
  );
}

export default function ExitBuildingsScene() {
  const gl = useThree((s) => s.gl);
  const envMap = useMemo(() => createModelViewerEnvMap(gl), [gl]);
  useEffect(() => () => envMap.dispose(), [envMap]);

  return BUILDINGS.map((building) => (
    <FadingBuilding key={building.key ?? building.url} building={building} envMap={envMap} />
  ));
}

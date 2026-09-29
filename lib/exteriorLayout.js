import { FACTORY3_B2, FINAL_SCENE_POSITION } from "./amr50Paths";

// Y rotation applied to the whole exterior model (see ExteriorScene.jsx).
// Shared with cameraPath.js so the camera's building target stays in sync
// whenever this is tweaked.
// Exactly 90° — the model's edges are authored axis-aligned, so this keeps
// them parallel to GridBackground's (world-axis-aligned) lines. The earlier
// 1.5 rad (~85.9°) left the campus visibly ~4° skewed against the grid.
export const EXTERIOR_ROTATION_Y = Math.PI / 2;

// Building B4's bbox center in the exterior model's own local space
// (`gltf-transform inspect` on buildings/B4.glb, which shares
// exterior-model.glb's coordinate frame): x:[1.17, 2.32] y:[0, 0.36]
// z:[-3.15, -1.31].
const B4_LOCAL_CENTER = [1.75, 0.18, -2.23];

// Rotates a model-local point about Y by EXTERIOR_ROTATION_Y, matching
// three.js's Object3D rotation, to get its world-space position.
export function toWorld([x, y, z]) {
  const c = Math.cos(EXTERIOR_ROTATION_Y);
  const s = Math.sin(EXTERIOR_ROTATION_Y);
  return [x * c + z * s, y, -x * s + z * c];
}

// Factory Interior 1's world-space centre (Interior1Scene.jsx's room, see
// ExitBuildingsScene.jsx's factory centres).
const FACTORY_1_CENTER = [-2.05, 0, -3.03];

// The campus as it's first seen, and entered (see ExteriorScene.jsx): at the
// factory buildings' scale, with Building B4 (source bbox x:[1.17, 2.32]
// z:[-3.15, -1.31], turned with the campus so it runs ~10.9 along world x
// and ~6.8 along z) centred on Factory Interior 1 — just big enough that the
// 6.4 x 6.4 room fits inside it. The room then materialises inside B4 as the
// camera closes in, and B4 dissolves away around it, the reverse of the
// outro (EXTERIOR_OUTRO_PLACEMENT). Factory 1 is shown as this same B4 from
// outside later on, while AMR10 crosses to Factory 2 (ExitBuildingsScene.jsx).
const ENTRY_SCALE = 5.9;
export const EXTERIOR_ENTRY_PLACEMENT = (() => {
  const b4 = toWorld(B4_LOCAL_CENTER);
  const position = [FACTORY_1_CENTER[0] - b4[0] * ENTRY_SCALE, 0, FACTORY_1_CENTER[2] - b4[2] * ENTRY_SCALE];
  return {
    position,
    scale: ENTRY_SCALE,
    /** Maps a point in the unscaled campus's world space (campus at the origin) into this placement. */
    toWorld: ([x, y, z]) => [position[0] + x * ENTRY_SCALE, y * ENTRY_SCALE, position[2] + z * ENTRY_SCALE],
  };
})();

/** Building B4's centre in the campus's entry placement: Factory Interior 1's centre. */
export const B4_WORLD_CENTER = EXTERIOR_ENTRY_PLACEMENT.toWorld(toWorld(B4_LOCAL_CENTER));

// Building B1's bbox center in the exterior model's own local space
// (buildings/B1.glb's node transform applied to its mesh bounds): x:[-3.04,
// -0.98] y:[0, 0.59] z:[-0.63, 2.87]. It stands right beside B2, on its +z
// side.
export const B1_LOCAL_CENTER = [-2.01, 0.2, 1.12];

// For the outro, the campus is set down again (see ExteriorScene.jsx), at
// Factory 3's B2's scale (amr50Paths.js's FACTORY3_B2), but with its B1 —
// not the B2 AMR50 arrived at — centred on the Final Scene room. Turned with
// the campus, B1 runs ~18.2 along world x and ~10.7 along z, round the ~6.5 x
// 6.3 room. The room turns into it as the camera exits, and the story leaves
// by a different building than B4, the one it entered by. Same turn as the
// opening's (EXTERIOR_ROTATION_Y), so the opening shot, scaled up with it,
// frames it the same way. Its y is 0 so its ground sits just above the grid,
// as in the opening.
export const EXTERIOR_OUTRO_PLACEMENT = (() => {
  const { scale } = FACTORY3_B2;
  const b1 = toWorld(B1_LOCAL_CENTER);
  const offset = [FINAL_SCENE_POSITION[0] - b1[0] * scale, 0, FINAL_SCENE_POSITION[2] - b1[2] * scale];
  return {
    position: offset,
    scale,
    /** Maps a point in the unscaled campus's world space (campus at the origin) into the outro placement. */
    toWorld: ([x, y, z]) => [offset[0] + x * scale, offset[1] + y * scale, offset[2] + z * scale],
  };
})();

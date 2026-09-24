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
function toWorld([x, y, z]) {
  const c = Math.cos(EXTERIOR_ROTATION_Y);
  const s = Math.sin(EXTERIOR_ROTATION_Y);
  return [x * c + z * s, y, -x * s + z * c];
}

export const B4_WORLD_CENTER = toWorld(B4_LOCAL_CENTER);

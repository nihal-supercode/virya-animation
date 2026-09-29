import {
  AlwaysStencilFunc,
  KeepStencilOp,
  MeshBasicMaterial,
  Mesh,
  NotEqualStencilFunc,
  ReplaceStencilOp,
} from "three";

// Buildings dissolve by fading their opacity with depth writes off (so they
// veil what's inside them instead of cutting it out). Without depth, though,
// a building can't hide its own far side: its back faces, inner walls and
// roof underside (the models are double-sided) show through its outside, and
// which of them overlap changes as the camera moves — the "shifting roof".
//
// The fix is a depth pre-pass: an invisible, depth-only twin of each mesh,
// drawn just before the building's colour, so only the building's front-most
// surface gets coloured. It's drawn after whatever the building encloses (the
// rooms, renderOrder 0), so those still show through the veil.
//
// Vehicles that are meant to stay unveiled by a fading building (AMR10 and
// AMR50 cross between them) would be hidden by that pre-pass depth, so they
// mark their pixels in the stencil buffer first (addStencilMask), and the
// masked buildings skip those pixels in both passes while fading.
// Needs a stencil buffer (Experience.jsx's Canvas `gl.stencil`).

export const VEHICLE_STENCIL_REF = 1;

function addTwins(root, makeMaterial, renderOrder) {
  const twins = [];
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh && !obj.userData.fadeTwin) meshes.push(obj);
  });
  for (const mesh of meshes) {
    const twin = new Mesh(mesh.geometry, makeMaterial(mesh.material));
    twin.userData.fadeTwin = true;
    twin.renderOrder = renderOrder;
    twin.raycast = () => {};
    // A child with an identity transform, so it follows the mesh (and its
    // visibility) for free.
    mesh.add(twin);
    twins.push({ twin, source: mesh });
  }
  return twins;
}

function removeTwins(twins) {
  for (const { twin } of twins) {
    twin.removeFromParent();
    twin.material.dispose();
  }
}

function applyVehicleStencilTest(material, enabled) {
  // three.js enables the stencil test via stencilWrite.
  material.stencilWrite = enabled;
  material.stencilRef = VEHICLE_STENCIL_REF;
  material.stencilFunc = NotEqualStencilFunc;
  material.stencilFail = KeepStencilOp;
  material.stencilZFail = KeepStencilOp;
  material.stencilZPass = KeepStencilOp;
}

/**
 * Adds a depth pre-pass to every mesh under `root`, drawn at `renderOrder`
 * (just below the building's own). Call `update(fading)` every frame: the
 * pre-pass only runs while the building is partly transparent. With
 * `maskVehicles`, the building also skips pixels marked by addStencilMask
 * while fading. `dispose()` removes the twins.
 */
export function addDepthPrepass(root, { renderOrder, maskVehicles = false }) {
  const twins = addTwins(
    root,
    (source) =>
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: true,
        // In the transparent render list, so renderOrder places it after the
        // (fading) rooms rather than before everything.
        transparent: true,
        side: source.side,
      }),
    renderOrder
  );
  for (const { twin } of twins) twin.visible = false;

  return {
    update(fading) {
      for (const { twin, source } of twins) {
        twin.visible = fading;
        if (!fading) continue;
        // Same depth as the colour pass, so it passes LessEqual exactly.
        const from = source.material;
        const to = twin.material;
        to.side = from.side;
        to.polygonOffset = from.polygonOffset;
        to.polygonOffsetFactor = from.polygonOffsetFactor;
        to.polygonOffsetUnits = from.polygonOffsetUnits;
        if (maskVehicles) applyVehicleStencilTest(to, true);
      }
      if (maskVehicles) {
        for (const { source } of twins) applyVehicleStencilTest(source.material, fading);
      }
    },
    dispose() {
      removeTwins(twins);
    },
  };
}

/**
 * Marks the pixels of every mesh under `root` in the stencil buffer, at
 * `renderOrder` (before the masked buildings' pre-pass), so a fading
 * building never draws over it. Depth-tested, so parts hidden behind the
 * rooms aren't marked. Call `update(active)` every frame — only while the
 * vehicle is fully opaque, or a fading one would cut its outline out of the
 * building. `dispose()` removes the twins.
 */
export function addStencilMask(root, { renderOrder }) {
  const twins = addTwins(
    root,
    (source) =>
      new MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        transparent: true,
        side: source.side,
        stencilWrite: true,
        stencilRef: VEHICLE_STENCIL_REF,
        stencilFunc: AlwaysStencilFunc,
        stencilFail: KeepStencilOp,
        stencilZFail: KeepStencilOp,
        stencilZPass: ReplaceStencilOp,
      }),
    renderOrder
  );
  return {
    update(active) {
      for (const { twin } of twins) twin.visible = active;
    },
    dispose() {
      removeTwins(twins);
    },
  };
}

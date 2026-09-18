import { EXTERIOR_END, FADE_END } from "./timeline";

// Exterior -> Factory Interior 1 crossfade.
//
// progress < EXTERIOR_END        : pure exterior scene, camera still
//                                  traveling toward Building B2.
// progress in [EXTERIOR_END, FADE_END] : the exterior scene fades out and
//                                  Factory Interior 1 fades in, in its
//                                  place, while the camera holds still
//                                  (see cameraPath.js).
// progress > FADE_END            : pure interior scene — Factory Interior 1
//                                  (room + AMR10 + Forklift) stays visible
//                                  from here on, including through the
//                                  TOP_VIEW_END..EXIT_END phase where AMR10
//                                  physically drives out to a second
//                                  Factory Interior 1 instance (see
//                                  vehiclePaths.js's AMR10_EXIT_TARGET and
//                                  components/scene/NextFactoryScene.jsx)
//                                  — a spatial journey, not a crossfade.
//
// Note: Building B2 couldn't be isolated as its own fadeable mesh — the
// asset pipeline's `join` step (scripts/optimize-models.mjs) merges
// same-material meshes for draw-call efficiency, so B2's geometry ended up
// combined with other buildings inside exterior.glb (confirmed via
// `gltf-transform inspect`). Since the camera is tightly framed on B2 by
// EXTERIOR_END — the rest of the exterior campus is out of frame — fading
// the whole exterior scene reads as equivalent to fading B2 alone.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getFadeOpacities(progress) {
  if (progress <= EXTERIOR_END) return { exterior: 1, interior: 0 };
  if (progress >= FADE_END) return { exterior: 0, interior: 1 };

  const t = easeInOutCubic((progress - EXTERIOR_END) / (FADE_END - EXTERIOR_END));
  return { exterior: 1 - t, interior: t };
}

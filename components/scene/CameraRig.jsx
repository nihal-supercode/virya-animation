"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollStore } from "@/lib/scrollStore";
import { getCameraState } from "@/lib/cameraPath";
import { TOP_VIEW_END } from "@/lib/timeline";
import { INTRO_DURATION, getIntroStep } from "@/lib/introStore";

// Same rate as Interior1Scene's FOLLOW_LAMBDA. During the exit phase the
// camera orbits AMR10's scroll-driven position, but AMR10 itself is RENDERED
// through that exponential smoothing — following the raw position made the
// two drift apart on fast scrolls (AMR10 visibly wobbling in frame).
// Smoothing the camera with the identical filter keeps them locked together
// and softens the view swings too.
const EXIT_FOLLOW_LAMBDA = 5;

// Experience.jsx's Canvas camera near/far, scaled by the state's depthScale
// (the outro's closing shot sits much further out than anything else).
const NEAR = 0.1;
const FAR = 100;

// Load-in sweep (see introStore.js): the camera starts swung round the
// opening shot's look-at point by INTRO_ORBIT, INTRO_DISTANCE times further
// out and INTRO_RISE higher, and eases in to it. Applied as an offset on top
// of the scroll-driven state that shrinks to nothing, so scrolling during
// the sweep just blends into the path.
const INTRO_ORBIT = -0.5; // radians about the vertical axis
const INTRO_DISTANCE = 1.35;
const INTRO_RISE = 0.25; // extra height, as a fraction of the look-at distance

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function withIntroSweep(state) {
  const remaining = 1 - easeInOutCubic(getIntroStep(0, INTRO_DURATION));
  if (remaining <= 0) return state;
  const [px, py, pz] = state.position;
  const [lx, ly, lz] = state.lookAt;
  const dx = px - lx;
  const dy = py - ly;
  const dz = pz - lz;
  const angle = INTRO_ORBIT * remaining;
  const scale = 1 + (INTRO_DISTANCE - 1) * remaining;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dist = Math.hypot(dx, dy, dz);
  return {
    ...state,
    // The opening shot already sits ~65 out against a far plane of 100, so
    // the depth range widens with the pull-back to keep the campus in it.
    depthScale: (state.depthScale ?? 1) * (1 + remaining),
    position: [
      lx + (dx * cos + dz * sin) * scale,
      ly + dy * scale + INTRO_RISE * dist * remaining,
      lz + (-dx * sin + dz * cos) * scale,
    ],
  };
}

function dampArray(current, target, f) {
  for (let i = 0; i < current.length; i++) {
    current[i] += (target[i] - current[i]) * f;
  }
}

function maxDiff(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
}

/** Moves the default camera along cameraPath.js every frame, driven by scrollStore.progress. */
export default function CameraRig() {
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3());
  const smoothed = useRef(null);

  useFrame((_state, delta) => {
    const progress = scrollStore.progress;
    const target = withIntroSweep(getCameraState(progress));

    // Smoothing only applies in the exit phase — earlier phases stay
    // snapped to the scroll exactly as tuned. When scrolling back out of the
    // exit phase, keep smoothing until the lag has caught up rather than
    // snapping, so that boundary can't jump either.
    const s = smoothed.current;
    const settling =
      s &&
      (maxDiff(s.position, target.position) > 1e-3 ||
        maxDiff(s.lookAt, target.lookAt) > 1e-3 ||
        maxDiff(s.up, target.up) > 1e-3 ||
        Math.abs(s.fov - target.fov) > 1e-2);

    if (s && (progress > TOP_VIEW_END || settling)) {
      const f = 1 - Math.exp(-EXIT_FOLLOW_LAMBDA * delta);
      dampArray(s.position, target.position, f);
      dampArray(s.lookAt, target.lookAt, f);
      dampArray(s.up, target.up, f);
      const len = Math.hypot(s.up[0], s.up[1], s.up[2]) || 1;
      s.up[0] /= len;
      s.up[1] /= len;
      s.up[2] /= len;
      s.fov += (target.fov - s.fov) * f;
    } else {
      smoothed.current = {
        position: [...target.position],
        lookAt: [...target.lookAt],
        up: [...target.up],
        fov: target.fov,
      };
    }

    const { position, lookAt, fov, up } = smoothed.current;

    camera.position.set(position[0], position[1], position[2]);
    // Must be set before lookAt() — lookAt derives the camera's
    // right/up basis from the current `up` vector, so applying it after
    // would use last frame's value.
    camera.up.set(up[0], up[1], up[2]);
    lookAtTarget.current.set(lookAt[0], lookAt[1], lookAt[2]);
    camera.lookAt(lookAtTarget.current);

    // Applied unsmoothed: the near/far planes don't move the image.
    const depthScale = target.depthScale ?? 1;
    if (camera.fov !== fov || camera.far !== FAR * depthScale) {
      camera.fov = fov;
      camera.near = NEAR * depthScale;
      camera.far = FAR * depthScale;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

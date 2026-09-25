"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollStore } from "@/lib/scrollStore";
import { getCameraState } from "@/lib/cameraPath";
import { TOP_VIEW_END } from "@/lib/timeline";

// Same rate as Interior1Scene's FOLLOW_LAMBDA. During the exit phase the
// camera orbits AMR10's scroll-driven position, but AMR10 itself is RENDERED
// through that exponential smoothing — following the raw position made the
// two drift apart on fast scrolls (AMR10 visibly wobbling in frame).
// Smoothing the camera with the identical filter keeps them locked together
// and softens the view swings too.
const EXIT_FOLLOW_LAMBDA = 5;

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
    const target = getCameraState(progress);

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

    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

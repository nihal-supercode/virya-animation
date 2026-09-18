"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollStore } from "@/lib/scrollStore";
import { getCameraState } from "@/lib/cameraPath";

/** Moves the default camera along cameraPath.js every frame, driven by scrollStore.progress. */
export default function CameraRig() {
  const { camera } = useThree();
  const lookAtTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    const { position, lookAt, fov, up } = getCameraState(scrollStore.progress);

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

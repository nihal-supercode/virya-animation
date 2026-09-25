"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollStore } from "@/lib/scrollStore";
import { getFadeOpacities } from "@/lib/sceneTransition";

// Sensor "radio wave" ripples on the floor under AMR10 — a 3D port of the
// virya-frontend technology page banner's rings
// (src/components/technology/components/Hero.jsx + css/Hero.module.css):
// the same three waves, each a radial gradient from transparent (inside
// 48.56% of the radius) to solid #F43D00 at the rim, scaling 0.2 -> 1.4 over
// a 6.6s linear loop, staggered 2.2s apart, with the same per-wave opacity
// keyframes. The banner's ellipse is a flat ring seen in perspective; here
// it's an actual flat disc on the floor, so the perspective comes for free.
const COLOR = "#F43D00";
const INNER_STOP = 0.485577;
const DURATION = 6.6;
// Keyframe opacities at 20% and 70% of each cycle (0 at 0% and 100%).
const WAVES = [
  { delay: 0, peak: 0.1, late: 0.045 }, // waveOuter
  { delay: 2.2, peak: 0.3, late: 0.14 }, // waveMid
  { delay: 4.4, peak: 0.5, late: 0.23 }, // waveInner
];
// Disc radius at scale 1 (so it reaches 1.4x this at the end of a cycle).
// AMR10 + trolley is ~1m long; this spreads the rings well past it.
const RADIUS = 0.75;
// Just above the floor so it doesn't z-fight with it.
const FLOOR_OFFSET = 0.004;

// CSS keyframes are linear between stops.
function waveOpacity(x, { peak, late }) {
  if (x < 0.2) return (x / 0.2) * peak;
  if (x < 0.7) return peak + ((x - 0.2) / 0.5) * (late - peak);
  return late * (1 - (x - 0.7) / 0.3);
}

function createRingTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(INNER_STOP, "rgba(244, 61, 0, 0)");
  gradient.addColorStop(1, COLOR);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Default visibility: follows AMR10's own fade-in with Factory Interior 1.
function amr10RadarOpacity(progress) {
  return getFadeOpacities(progress).interior;
}

/**
 * Radar rings under an AMR. `getOpacity(progress)` (0-1) sets how visible
 * they are at a given scroll position — defaults to AMR10's.
 */
export default function AmrRadar({ getOpacity = amr10RadarOpacity }) {
  const texture = useMemo(() => createRingTexture(), []);
  const geometry = useMemo(() => new THREE.CircleGeometry(RADIUS, 64), []);
  const materials = useMemo(
    () =>
      WAVES.map(
        () =>
          new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            opacity: 0,
          })
      ),
    [texture]
  );
  const meshes = useRef([]);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return () => {
      texture.dispose();
      geometry.dispose();
      materials.forEach((m) => m.dispose());
    };
  }, [texture, geometry, materials]);

  useFrame((state) => {
    const visibility = getOpacity(scrollStore.progress);
    const time = state.clock.elapsedTime;
    WAVES.forEach((wave, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      if (reducedMotion.current || visibility < 0.001) {
        mesh.visible = false;
        return;
      }
      const elapsed = time - wave.delay;
      // Like the CSS animation-delay, each wave stays hidden until it starts.
      if (elapsed < 0) {
        mesh.visible = false;
        return;
      }
      const x = (elapsed % DURATION) / DURATION;
      const scale = 0.2 + 1.2 * x;
      mesh.visible = true;
      mesh.scale.set(scale, scale, 1);
      materials[i].opacity = waveOpacity(x, wave) * visibility;
    });
  });

  return (
    <group position={[0, FLOOR_OFFSET, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {WAVES.map((wave, i) => (
        <mesh
          key={wave.delay}
          ref={(m) => (meshes.current[i] = m)}
          geometry={geometry}
          material={materials[i]}
          renderOrder={1}
        />
      ))}
    </group>
  );
}

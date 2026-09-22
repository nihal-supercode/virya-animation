"use client";

import { Suspense, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import CameraRig from "./CameraRig";
import EnvironmentMood from "./EnvironmentMood";
import ExteriorScene from "./ExteriorScene";
import GridBackground from "./GridBackground";
import Interior1Scene from "./Interior1Scene";
import NextFactoryScene from "./NextFactoryScene";
import { useScrollTimeline } from "@/hooks/useScrollTimeline";

// 1565vh. Split per lib/timeline.js's breakpoints: 450vh for the exterior
// camera travel, 270vh for the B2 -> Factory Interior 1 crossfade +
// pull-back, 360vh for the AMR10/Forklift vehicle choreography, and 135vh
// for the lift/rest at the top-down interior view — all UNCHANGED from
// before, since that pacing was already confirmed to feel right. The final
// 350vh EXIT phase has AMR10 physically drive out of Factory Interior 1
// and into a second factory (see NextFactoryScene.jsx — a real second
// instance of the Factory Interior 1 model, standing in until the real
// next-factory assets arrive) while the camera follows.
const SCROLL_LENGTH_VH = "1565vh";

export default function Experience() {
  const wrapperRef = useScrollTimeline();
  const ambientLightRef = useRef(null);
  const directionalLightRef = useRef(null);

  return (
    <div
      ref={wrapperRef}
      style={{ height: SCROLL_LENGTH_VH, position: "relative" }}
    >
      <div style={{ position: "sticky", top: 0, height: "100vh" }}>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [6.75, 4.85, 6.75], fov: 35, near: 0.1, far: 100 }}
          // R3F defaults to ACES Filmic tone mapping, which deliberately
          // compresses/desaturates mid-tones for a cinematic look — that
          // was making the (correct, verified-against-source) material
          // colors read as flatter/greyer than intended. NoToneMapping
          // reproduces baseColorFactor -> sRGB more literally, which is
          // what we want here (matching the original color, not grading
          // it). IMPORTANT: NoToneMapping also removes ACES's built-in
          // highlight rolloff/protection — the light intensities below
          // were re-tuned lower to match (see their comment); reusing the
          // old ACES-era intensities here clipped the already-light
          // ~0.63 base color straight to white in well-lit areas, which
          // read as "still grey" even with tone mapping disabled.
          gl={{ toneMapping: THREE.NoToneMapping }}
        >
          {/* Tried adding drei's <Environment preset="city"> here for extra
              richness, but it fetches an HDR file from an external CDN and
              — placed outside any Suspense boundary — hung the whole
              render tree with nothing shown when that fetch didn't
              resolve. Reverted then, no external dependency; see the
              procedural <Environment> (Lightformers, no network fetch)
              added below instead — that's the fix for the same goal.
              Intensities re-tuned for NoToneMapping (no highlight
              rolloff/protection above 1.0 now, unlike ACES). The previous
              pass (0.35/0.75) undershot and read too dark; this splits
              the difference with the original ACES-era levels (0.5/1.6,
              which clipped) — combined ~1.5 on the brightest-facing
              surfaces, close to but not over the clipping point. */}
          {/* Fixed regardless of the OS light/dark setting — the lighting
              above (and the asset colors it's tuned against, see their own
              comments) is tuned for one specific look, so the background
              shouldn't shift underneath it depending on system theme. The
              initial value here is the "indoor" resting tone — EnvironmentMood
              below takes over animating it (and the two lights' intensity)
              during the exit phase, see its own comment. */}
          <color attach="background" args={["#FDF8F5"]} />
          <ambientLight ref={ambientLightRef} intensity={0.42} />
          <directionalLight ref={directionalLightRef} position={[5, 8, 5]} intensity={1.05} />
          {/* Procedural studio IBL, built entirely from a solid backdrop +
              Lightformer panels (plane lights) baked into a PMREM cubemap
              once (resolution 256 is plenty for such low-frequency
              lighting) — no HDR file, no network fetch, so it can't hang
              the render tree the way the CDN preset above did.
              background=false (the component default) on <Environment>
              itself — this only feeds material.envMap-style IBL
              (diffuse/specular fill + reflections), it doesn't replace the
              main scene's own <color> background above.
              The inner <color> below fills the VIRTUAL scene used to bake
              that cubemap (not the visible one) with a MUTED, darker
              version of the page's #FDF8F5 (same warm hue, ~45% of its
              brightness) — using the full-brightness page color here
              floods every surface with near-max irradiance from every
              direction at once and, combined with the ambient/directional
              lights below under NoToneMapping (no highlight rolloff),
              clips the whole model to solid white. At reduced brightness
              it still tints reflections/ambient fill warm instead of
              cool/grey, without blowing out exposure. Lightformer
              intensities were reduced to match for the same reason. */}
          <Environment resolution={256}>
            <color attach="background" args={["#726A62"]} />
            <Lightformer
              form="rect"
              intensity={1.1}
              color="#ffffff"
              position={[0, 6, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[10, 10, 1]}
            />
            <Lightformer
              form="rect"
              intensity={0.5}
              color="#FDF8F5"
              position={[-6, 3, 4]}
              rotation={[0, Math.PI / 4, 0]}
              scale={[6, 6, 1]}
            />
            <Lightformer
              form="rect"
              intensity={0.5}
              color="#FDF8F5"
              position={[6, 3, -4]}
              rotation={[0, -Math.PI / 4, 0]}
              scale={[6, 6, 1]}
            />
          </Environment>
          <EnvironmentMood
            ambientLightRef={ambientLightRef}
            directionalLightRef={directionalLightRef}
          />
          <GridBackground />
          <Suspense fallback={null}>
            <ExteriorScene />
          </Suspense>
          <Suspense fallback={null}>
            <Interior1Scene />
          </Suspense>
          <Suspense fallback={null}>
            <NextFactoryScene />
          </Suspense>
          <CameraRig />
        </Canvas>
      </div>
    </div>
  );
}

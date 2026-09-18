"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollStore } from "@/lib/scrollStore";
import { TOP_VIEW_END } from "@/lib/timeline";
import { getExitT } from "@/lib/vehiclePaths";

// Shifts the whole scene's mood — background tone, atmospheric fog, and
// light intensity — from an enclosed "indoor" read to an open "outdoor"
// one and back, over the SAME TOP_VIEW_END..EXIT_END exit phase (and the
// same bell-shaped curve, peaking at the midpoint) that cameraPath.js's
// outdoor lift/fov bump use — see that file's own comment. Together they
// sell AMR10's exit as a genuine indoor -> outdoor -> indoor beat: the
// camera pulls up and widens right as the room brightens, cools toward
// open sky, and gains a touch of haze, then both settle back down into the
// next factory's enclosed interior at the same moment.
//
// There's no real outdoor asset for the gap between the two buildings yet
// (NextFactoryScene.jsx is a placeholder second interior, not a modeled
// exterior) — this is deliberately achieved with lighting/fog/color alone
// rather than geometry, so it drops in cleanly once a real asset exists.

// Matches Experience.jsx's own fixed <color attach="background"> value —
// kept as the resting/indoor tone this animates away from and back to.
const INDOOR_BG = new THREE.Color("#e9edf1");
// A cooler, barely-tinted tone — a hint of open sky rather than a strong
// blue wash. Its own saturation was toned down (from an earlier, more
// vivid "#cfe8fb") AND the blend toward it is capped well below full
// strength (see BACKGROUND_MOOD_CAP below) — between the two, the color
// shift reads as a subtle atmosphere change rather than the room visibly
// turning blue.
const OUTDOOR_BG = new THREE.Color("#dfeaf1");

// Caps how far the background/fog color actually blends toward OUTDOOR_BG,
// even at the mood curve's peak (mood=1) — kept separate from the
// ambient/directional light lerps below, which still use the full mood
// curve, since the light brightening alone (without a strong color shift)
// already reads as "stepping into daylight" without looking like a color
// filter was applied.
const BACKGROUND_MOOD_CAP = 0.4;

const INDOOR_AMBIENT = 0.42;
const OUTDOOR_AMBIENT = 0.58;
const INDOOR_DIRECTIONAL = 1.05;
const OUTDOOR_DIRECTIONAL = 1.35;

// Light atmospheric haze while "outside", absent indoors (density 0 has no
// visible effect, so it's harmless to leave the fog object in place at all
// times rather than adding/removing it).
const OUTDOOR_FOG_DENSITY = 0.02;

export default function EnvironmentMood({ ambientLightRef, directionalLightRef }) {
  const { scene } = useThree();
  const mixedBg = useRef(new THREE.Color());

  useFrame(() => {
    const progress = scrollStore.progress;
    let mood = 0;
    if (progress > TOP_VIEW_END) {
      // Bell-shaped: 0 at both ends of the exit phase, peaking at the
      // midpoint — see this component's top comment.
      mood = Math.sin(Math.PI * getExitT(progress));
    }

    mixedBg.current.copy(INDOOR_BG).lerp(OUTDOOR_BG, mood * BACKGROUND_MOOD_CAP);

    // scene.background is the same THREE.Color instance Experience.jsx's
    // <color attach="background"> created — mutated in place here rather
    // than replaced, since nothing else needs to react to it changing.
    if (scene.background?.isColor) {
      scene.background.copy(mixedBg.current);
    }

    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(mixedBg.current.getHex(), 0);
    }
    scene.fog.color.copy(mixedBg.current);
    scene.fog.density = OUTDOOR_FOG_DENSITY * mood;

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = THREE.MathUtils.lerp(
        INDOOR_AMBIENT,
        OUTDOOR_AMBIENT,
        mood
      );
    }
    if (directionalLightRef.current) {
      directionalLightRef.current.intensity = THREE.MathUtils.lerp(
        INDOOR_DIRECTIONAL,
        OUTDOOR_DIRECTIONAL,
        mood
      );
    }
  });

  return null;
}

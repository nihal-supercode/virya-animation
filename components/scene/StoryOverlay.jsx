"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { getIntroStep } from "@/lib/introStore";
import { scrollStore } from "@/lib/scrollStore";
import { F2_TO_EXTERIOR_START, F3_TO_INTERIOR_END } from "@/lib/sceneTransition";
import {
  AMR50_HITCH_END,
  EXTERIOR_END,
  FACTORY2_DRIVE_END,
  FINAL_PARK_END,
  SCROLL_LENGTH_VH,
} from "@/lib/timeline";
import {
  ALERT_CLEAR_VH,
  getAmr10ArriveProgress,
  getAmr10ResumeProgress,
  getBoxDetectProgress,
  getExitT,
} from "@/lib/vehiclePaths";

// Copy laid over the 3D story (Figma "Virya - Internal"): the opening
// headline plus the "difference we deliver" cards, each shown during the
// beat it describes. Every piece's opacity is a function of scroll progress.

function smoothstep(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

// Opening shot (Figma node 4337:7665): fully shown, then faded out early in
// the push-in toward B4 — gone well before the campus dissolves into Factory
// Interior 1. Fractions of the EXTERIOR phase (see timeline.js).
const INTRO_FADE_OUT_START = EXTERIOR_END * 0.05;
const INTRO_FADE_OUT_END = EXTERIOR_END * 0.3;
// ...and on load, the headline then the card rise in as the camera's sweep
// (introStore.js) settles: [delay, duration] in seconds into the intro.
const TITLE_REVEAL = [1.9, 1.0];
const CARD_REVEAL = [2.4, 1.0];
const REVEAL_RISE = 24; // px
function introOpacity(progress) {
  return 1 - smoothstep((progress - INTRO_FADE_OUT_START) / (INTRO_FADE_OUT_END - INTRO_FADE_OUT_START));
}

// Safety card (Figma node 4337:8808): tied to AMR10's radar alert in Factory
// Interior 1 (vehiclePaths.js's getAmr10Alert) — fades in as AMR10, having
// detected the Forklift, comes to a stop short of the crossing, holds while it
// waits for it to pass, and fades out with the radar as AMR10 pulls away.
const SAFETY_FADE_IN_VH = 40;
function safetyOpacity(progress) {
  const fadeIn = smoothstep(((progress - getAmr10ArriveProgress()) * SCROLL_LENGTH_VH) / SAFETY_FADE_IN_VH);
  const fadeOut = smoothstep(((progress - getAmr10ResumeProgress()) * SCROLL_LENGTH_VH) / ALERT_CLEAR_VH);
  return fadeIn * (1 - fadeOut);
}

// Indoor & outdoor card (Figma node 4337:8837): AMR10's drive outdoors from
// Factory 1 to Factory 2. Fractions of the exit phase (getExitT), set around
// sceneTransition.js's building crossfade — it fades in as the factories
// finish turning into buildings (TO_EXTERIOR_END, 0.52) with AMR10 out on the
// open ground, holds while it crosses, and fades out once they start turning
// back into interiors (TO_INTERIOR_START, 0.72) as it nears Factory 2.
const OUTDOOR_FADE_IN = [0.3, 0.42];
const OUTDOOR_FADE_OUT = [0.76, 0.88];
function outdoorOpacity(progress) {
  const t = getExitT(progress);
  const fadeIn = smoothstep((t - OUTDOOR_FADE_IN[0]) / (OUTDOOR_FADE_IN[1] - OUTDOOR_FADE_IN[0]));
  const fadeOut = smoothstep((t - OUTDOOR_FADE_OUT[0]) / (OUTDOOR_FADE_OUT[1] - OUTDOOR_FADE_OUT[0]));
  return fadeIn * (1 - fadeOut);
}

// Live environments card (Figma node 4337:8790): AMR10 in Factory Interior 2
// — fades in as it detects the floor box ahead and starts steering around it
// (getBoxDetectProgress), holds through the swerve and its turn onto the
// trolley area's line, and fades out once it stops there (FACTORY2_DRIVE_END)
// and begins reversing in.
const LIVE_FADE_VH = 40;
let boxDetectProgress = null; // getBoxDetectProgress bisects on every call
function liveOpacity(progress) {
  boxDetectProgress ??= getBoxDetectProgress();
  const fadeIn = smoothstep(((progress - boxDetectProgress) * SCROLL_LENGTH_VH) / LIVE_FADE_VH);
  const fadeOut = smoothstep(((progress - FACTORY2_DRIVE_END) * SCROLL_LENGTH_VH) / LIVE_FADE_VH);
  return fadeIn * (1 - fadeOut);
}

// Payload card (Figma node 4337:8792): AMR50 and the loaded trolley in
// Factory Interior 2 — fully in as it finishes hitching onto the drawbar
// (AMR50_HITCH_END), holds while it tows the load off across the room, and
// gone just before Factory 2 starts turning into a building on its way out
// (sceneTransition.js's F2_TO_EXTERIOR_START).
const PAYLOAD_FADE_VH = 40;
function payloadOpacity(progress) {
  const fadeIn = smoothstep(
    ((progress - AMR50_HITCH_END) * SCROLL_LENGTH_VH) / PAYLOAD_FADE_VH + 1
  );
  const fadeOut = smoothstep(
    ((progress - F2_TO_EXTERIOR_START) * SCROLL_LENGTH_VH) / PAYLOAD_FADE_VH + 1
  );
  return fadeIn * (1 - fadeOut);
}

// Workflows card (Figma node 4337:8794): the Final Scene's whole fleet at work
// — fades in once B2 has fully turned into the room around AMR50
// (sceneTransition.js's F3_TO_INTERIOR_END) with the other vehicles under
// way, holds while they finish their moves and park, and fades out as the
// outro's camera sets off out of the room (FINAL_PARK_END).
const WORKFLOWS_FADE_VH = 40;
function workflowsOpacity(progress) {
  const fadeIn = smoothstep(((progress - F3_TO_INTERIOR_END) * SCROLL_LENGTH_VH) / WORKFLOWS_FADE_VH);
  const fadeOut = smoothstep(((progress - FINAL_PARK_END) * SCROLL_LENGTH_VH) / WORKFLOWS_FADE_VH);
  return fadeIn * (1 - fadeOut);
}

/**
 * Writes `getOpacity(scrollStore.progress)` straight to the element's style
 * from GSAP's ticker (the clock scrollStore is updated on, see
 * useScrollTimeline.js) instead of React state, so scrolling never
 * re-renders. It also slides `drift` px as it fades (negative = upward).
 * `reveal` ([delay, duration] s) additionally fades it in, rising
 * REVEAL_RISE px, during the load-in intro.
 */
function useScrollFade(getOpacity, drift, reveal) {
  const ref = useRef(null);
  useGSAP(() => {
    const el = ref.current;
    let last = -1;
    const onTick = () => {
      const scrolled = getOpacity(scrollStore.progress);
      const revealed = reveal ? smoothstep(getIntroStep(...reveal)) : 1;
      const opacity = scrolled * revealed;
      if (opacity === last) return;
      last = opacity;
      el.style.opacity = String(opacity);
      el.style.transform = `translateY(${drift * (1 - scrolled) + REVEAL_RISE * (1 - revealed)}px)`;
      el.style.visibility = opacity <= 0 ? "hidden" : "visible";
    };
    onTick();
    gsap.ticker.add(onTick);
    return () => gsap.ticker.remove(onTick);
  }, []);
  return ref;
}

const SIDE_GUTTER = "left-[clamp(16px,4.63vw,70px)]";

// The card's frosted surface, exactly as specified in the design.
const CARD_SURFACE = {
  borderRadius: 5,
  background: "rgba(0, 0, 0, 0.30)",
  backdropFilter: "blur(25px)",
  WebkitBackdropFilter: "blur(25px)",
};

/** Frosted "The difference we deliver" card, bottom-left of the viewport. */
function StoryCard({ getOpacity, drift, reveal, title, titleWidth, children }) {
  const ref = useScrollFade(getOpacity, drift, reveal);
  return (
    <div
      ref={ref}
      className={`invisible absolute bottom-[33px] ${SIDE_GUTTER} w-[593px] max-w-[calc(100%-32px)] min-h-[275px] overflow-clip p-[30px] opacity-0`}
      style={CARD_SURFACE}
    >
      <div className="flex w-full max-w-[520px] flex-col items-start gap-[21px]">
        <div className="flex items-center gap-[12px]">
          <span aria-hidden className="size-[8px] shrink-0 bg-[#f43d00]" />
          <p className="font-chakra text-[14px] leading-[1.4] font-medium tracking-[1.12px] whitespace-nowrap text-[#fdf8f5] uppercase">
            The difference we deliver
          </p>
        </div>
        <h2
          className="text-[30px] leading-[1.1] font-normal text-white uppercase"
          style={{ maxWidth: titleWidth }}
        >
          {title}
        </h2>
        <p className="w-full text-[16px] leading-[1.4] font-normal text-white">
          {children}
        </p>
      </div>
    </div>
  );
}

function IntroTitle() {
  const ref = useScrollFade(introOpacity, -40, TITLE_REVEAL);
  return (
    <h1
      ref={ref}
      className={`absolute top-[88px] ${SIDE_GUTTER} right-[clamp(16px,4.63vw,70px)] max-w-[1173px] text-[clamp(28px,3.31vw,50px)] leading-[1.1] font-normal text-black uppercase`}
    >
      Purpose built for the realities of your operations. No compromises, no
      complexity.
    </h1>
  );
}

export default function StoryOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] font-grotesk">
      <IntroTitle />
      <StoryCard
        getOpacity={introOpacity}
        drift={-40}
        reveal={CARD_REVEAL}
        title="Works Within Existing Infrastructure"
        titleWidth={381}
      >
        Deploy without disrupting the way you work. Virya integrates with your
        existing facility, reducing implementation time, infrastructure costs,
        and accelerating your return on investment.
      </StoryCard>
      <StoryCard
        getOpacity={safetyOpacity}
        drift={24}
        title={
          <>
            Built with
            <br />
            Safety at the Core
          </>
        }
        titleWidth={293}
      >
        From intelligent obstacle detection to advanced navigation and
        real-time monitoring, every journey is designed to protect people,
        equipment, and operations.
      </StoryCard>
      <StoryCard
        getOpacity={outdoorOpacity}
        drift={24}
        title="Indoor & Outdoor Operations"
        titleWidth={293}
      >
        Operate seamlessly across warehouses, production floors, campuses and
        outdoor logistics routes with consistent performance in diverse
        operating conditions.
      </StoryCard>
      <StoryCard
        getOpacity={liveOpacity}
        drift={24}
        title="Adapts to Live Environments"
        titleWidth={293}
      >
        Navigate changing layouts, moving personnel, and evolving workflows
        with intelligent autonomy that continuously adapts to real-world
        industrial environments.
      </StoryCard>
      <StoryCard
        getOpacity={payloadOpacity}
        drift={24}
        title="Handles Varied Payload Demands"
        titleWidth={293}
      >
        From lightweight deliveries to heavy industrial loads, our autonomous
        platforms support a wide range of payloads without compromising
        efficiency or reliability.
      </StoryCard>
      <StoryCard
        getOpacity={workflowsOpacity}
        drift={24}
        title="Simplifies Complex Operational Workflows"
        titleWidth={480}
      >
        Automate repetitive transport tasks, streamline material flow and
        coordinate movement across your facility with intelligent fleet
        management and orchestration.
      </StoryCard>
    </div>
  );
}

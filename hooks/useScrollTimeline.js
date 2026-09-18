"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { scrollStore } from "@/lib/scrollStore";

gsap.registerPlugin(ScrollTrigger);

/**
 * Drives scrollStore.progress (0-1) from how far the caller has scrolled
 * through a tall wrapper element. Returns a ref to attach to that wrapper.
 *
 * The wrapper is tall (see Experience.jsx, `height: 300vh`) with the
 * `<Canvas>` pinned via CSS `position: sticky` inside it — scrolling
 * through the wrapper's height scrubs the camera while the canvas itself
 * stays fixed on screen, the standard scrollytelling pattern.
 *
 * Lenis smooth-scrolls the whole page (inertia on wheel/touch input);
 * ScrollTrigger needs to be told about every Lenis-driven scroll tick to
 * stay in sync, and Lenis in turn is stepped from GSAP's own ticker
 * (instead of its default requestAnimationFrame loop) so both stay on the
 * same clock — the standard Lenis + GSAP ScrollTrigger integration.
 * Currently set up per-experience since there's only one scene; if a
 * second scene/page-level scroll container is added later, promote this
 * to a single page-level hook so there's only ever one Lenis instance.
 */
export function useScrollTimeline() {
  const wrapperRef = useRef(null);

  useGSAP(() => {
    if (!wrapperRef.current) return;

    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);

    const onTick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    const trigger = ScrollTrigger.create({
      trigger: wrapperRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        scrollStore.progress = self.progress;
      },
    });

    return () => {
      trigger.kill();
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);

  return wrapperRef;
}

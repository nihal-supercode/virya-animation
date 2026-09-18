"use client";

import dynamic from "next/dynamic";

// next/dynamic's `ssr: false` is only legal inside a Client Component, not
// a Server Component — this wrapper is that boundary so app/page.js can
// stay a plain Server Component.
const Experience = dynamic(() => import("./Experience"), { ssr: false });

export default function ExperienceLoader() {
  return <Experience />;
}

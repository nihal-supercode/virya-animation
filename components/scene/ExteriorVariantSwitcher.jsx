"use client";

import { EXTERIOR_VARIANTS } from "./ExteriorScene";

/** Overlay buttons for comparing the exterior model's color variants. */
export default function ExteriorVariantSwitcher({ value, onChange }) {
  return (
    <div className="absolute top-4 right-4 z-10 flex gap-1 rounded-full bg-white/80 p-1 text-sm shadow-md backdrop-blur">
      {EXTERIOR_VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          aria-pressed={value === v.id}
          className={`rounded-full px-3 py-1.5 transition-colors ${
            value === v.id
              ? "bg-neutral-900 text-white"
              : "text-neutral-700 hover:bg-neutral-200"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

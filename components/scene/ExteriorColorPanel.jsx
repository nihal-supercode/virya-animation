"use client";

import { useState } from "react";

/**
 * Colour pickers for the exterior model's materials (one per material in the
 * file, applied everywhere it's used), for designers trying out colourways.
 * `materials` is the loaded model's list ({ key, name, baseColor }), `colors`
 * the overrides ({ [key]: "#rrggbb" }). "Copy colours" puts the current
 * colours on the clipboard as JSON, by material name.
 */
export default function ExteriorColorPanel({ materials, status, colors, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const current = (m) => colors[m.key] ?? m.baseColor;
  const copy = async () => {
    const json = JSON.stringify(
      Object.fromEntries((materials ?? []).map((m) => [m.name, current(m)])),
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure origin) — nothing else to do.
    }
  };

  return (
    <div className="w-64 rounded-2xl bg-white/85 text-sm text-neutral-800 shadow-md backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5"
      >
        <span className="font-medium">Exterior colours</span>
        <span aria-hidden className="text-neutral-500">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 px-4 pt-2 pb-3">
          {status === "loading" && <p className="py-2 text-neutral-500">Loading model…</p>}
          {status === "error" && (
            <p className="py-2 text-red-600">
              Couldn&apos;t load that file. Check it&apos;s a valid .glb.
            </p>
          )}
          {status === "ready" && materials.length === 0 && (
            <p className="py-2 text-neutral-500">This model has no editable colours.</p>
          )}
          {status === "ready" && materials.length > 0 && (
            <>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto py-1">
                {materials.map((m) => (
                  <li key={m.key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={current(m)}
                      onChange={(e) => onChange(m.key, e.target.value)}
                      aria-label={`Colour for ${m.name}`}
                      className="h-7 w-9 shrink-0 cursor-pointer rounded border border-neutral-300 bg-transparent p-0.5"
                    />
                    <span className="min-w-0 flex-1 truncate" title={m.name}>
                      {m.name}
                    </span>
                    <span className="font-mono text-xs text-neutral-500 uppercase">{current(m)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onReset}
                  className="flex-1 rounded-full px-3 py-1.5 text-neutral-700 hover:bg-neutral-200"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={copy}
                  className="flex-1 rounded-full bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700"
                >
                  {copied ? "Copied" : "Copy colours"}
                </button>
              </div>
            </>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            Tip: drop a .glb anywhere on the page to try it. It must share the
            campus exports&apos; layout to line up with the scene.
          </p>
        </div>
      )}
    </div>
  );
}

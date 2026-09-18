#!/usr/bin/env node
/**
 * Asset optimization pipeline — Scene 1 (Exterior) + the Factory Interior 1
 * shell used for the exterior->interior crossfade transition.
 *
 * Reads raw GLBs from the user's local reference folder (NOT part of the
 * repo — this only exists on the machine that ran the export) and writes
 * optimized, web-viable GLBs into public/models/.
 *
 * The source GLBs were inspected with `gltf-transform inspect` during
 * planning: every file reports "No textures found" — these are flat
 * matte-color KeyShot exports with zero image textures. The size bloat is
 * pure over-tessellated geometry, so `--texture-compress webp` below is a
 * defensive no-op for this asset set (kept so the pipeline stays correct
 * if a future scene DOES ship with textures).
 *
 * Not run as part of `next build` — it reads an absolute path outside the
 * repo that won't exist on other machines/CI. Run manually via:
 *   npm run optimize-models
 * Its *output* (public/models/) is committed; the raw source is not.
 */
import { execFileSync } from "node:child_process";
import { statSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SOURCE_ROOT = "/Users/sc-04-nihal/Downloads/Scroll Animation";

const CLI = join(REPO_ROOT, "node_modules", ".bin", "gltf-transform");

/** @type {{src: string, dest: string, args: string[]}[]} */
const MANIFEST = [
  {
    // Main exterior scene — aggressive decimation profile ("scene" category).
    src: join(SOURCE_ROOT, "1_Exterior Scene/GLB with Color/Exterior.glb"),
    dest: join(REPO_ROOT, "public/models/exterior/exterior.glb"),
    args: [
      "optimize",
      "--compress",
      "draco",
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.15",
      "--simplify-error",
      "0.01",
      "--texture-compress",
      "webp",
    ],
  },
  ...["B1", "B2", "B3", "B4", "B5"].map((name) => ({
    // Tiny low-poly building blocks — compress only, no decimation needed.
    src: join(SOURCE_ROOT, `1_Exterior Scene/GLB with Color/${name}.glb`),
    dest: join(REPO_ROOT, `public/models/exterior/buildings/${name}.glb`),
    args: ["optimize", "--compress", "draco", "--simplify", "false"],
  })),
  {
    // Factory Interior 1 shell — same aggressive "scene" profile. Unlike
    // the exterior files, this one DOES ship a real texture (a 1.45MB
    // normal map), so --texture-compress webp isn't a no-op here.
    src: join(SOURCE_ROOT, "2_Factory Interior 1/GLB with Color/Factory Interior 1.glb"),
    dest: join(REPO_ROOT, "public/models/interior-1/factory-interior-1.glb"),
    args: [
      "optimize",
      "--compress",
      "draco",
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.15",
      "--simplify-error",
      "0.01",
      "--texture-compress",
      "webp",
    ],
  },
  {
    // Forklift — "vehicle-hero" profile (gentle decimation, preserve
    // silhouette since the camera gets close to these). No textures.
    // NOTE: this file's geometry is NOT centered at its own origin — its
    // vertices already carry the correct in-room world position from the
    // original scene export (bbox ~x:[0.3,0.7] z:[2.3,3.8], matching where
    // it sits in Scene Reference.png), so it must be rendered with zero
    // extra position offset inside the same local space as the room.
    src: join(SOURCE_ROOT, "2_Factory Interior 1/GLB with Color/Forklift.glb"),
    dest: join(REPO_ROOT, "public/models/interior-1/forklift.glb"),
    args: [
      "optimize",
      "--compress",
      "draco",
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.5",
      "--simplify-error",
      "0.001",
      "--texture-compress",
      "webp",
    ],
  },
  {
    // AMR10 + Trolley (combined — the only colored variant available for
    // this scene). Same "vehicle-hero" profile and same note as Forklift
    // above: geometry already carries its correct in-room position baked
    // in (bbox ~x:[-3.0,-2.1] z:[-0.8,-0.5]).
    src: join(SOURCE_ROOT, "2_Factory Interior 1/GLB with Color/AMR10 with Trolley.glb"),
    dest: join(REPO_ROOT, "public/models/interior-1/amr10-with-trolley.glb"),
    args: [
      "optimize",
      "--compress",
      "draco",
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.5",
      "--simplify-error",
      "0.001",
      "--texture-compress",
      "webp",
    ],
  },
];

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function inspectSummary(file) {
  try {
    const out = execFileSync(CLI, ["inspect", file], { encoding: "utf8" });
    const meshMatch = out.match(/MESHES[\s\S]*?(\d+)\s+rows?/i);
    return { raw: out, hasMeshes: /MESHES/.test(out) };
  } catch (err) {
    return { raw: String(err), hasMeshes: false };
  }
}

const results = [];

for (const { src, dest, args } of MANIFEST) {
  if (!existsSync(src)) {
    console.error(`✗ MISSING SOURCE: ${src}`);
    process.exitCode = 1;
    continue;
  }

  mkdirSync(dirname(dest), { recursive: true });

  const srcSize = statSync(src).size;

  console.log(`\n→ ${src.split("/").pop()}`);
  execFileSync(CLI, [...args, src, dest], { stdio: "inherit" });

  if (!existsSync(dest)) {
    console.error(`✗ Optimize did not produce output: ${dest}`);
    process.exitCode = 1;
    continue;
  }

  const destSize = statSync(dest).size;
  const ratio = destSize / srcSize;

  // Guard: compression should meaningfully shrink the file. >50% retained
  // usually means a flag typo or an already-small/incompressible input —
  // only fail loud for files we expect real compression from.
  if (ratio > 0.5 && srcSize > 1024 * 1024) {
    console.error(
      `✗ SUSPICIOUS: ${dest} only shrank to ${(ratio * 100).toFixed(
        1
      )}% of source size. Check flags.`
    );
    process.exitCode = 1;
  }

  const { hasMeshes } = inspectSummary(dest);
  if (!hasMeshes) {
    console.error(`✗ SUSPICIOUS: ${dest} — inspect found no MESHES section.`);
    process.exitCode = 1;
  }

  results.push({
    file: dest.replace(REPO_ROOT + "/", ""),
    srcSize,
    destSize,
    reduction: `${(srcSize / destSize).toFixed(1)}x`,
  });
}

console.log("\n\n=== Optimization summary ===");
console.table(
  results.map((r) => ({
    file: r.file,
    before: formatBytes(r.srcSize),
    after: formatBytes(r.destSize),
    reduction: r.reduction,
  }))
);

const totalBefore = results.reduce((s, r) => s + r.srcSize, 0);
const totalAfter = results.reduce((s, r) => s + r.destSize, 0);
console.log(
  `Total: ${formatBytes(totalBefore)} → ${formatBytes(totalAfter)}\n`
);

if (process.exitCode) {
  console.error("Completed with warnings/errors — see above.");
} else {
  console.log("All good.");
}

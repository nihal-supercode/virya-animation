"use client";

import { useRef } from "react";

/**
 * "Upload .glb" for trying a designer's own exterior export in the scene.
 * The file is read locally in the browser — nothing is sent anywhere.
 * `fileName` is the currently shown upload's name, if any.
 */
export default function ExteriorUploadButton({ fileName, onUpload }) {
  const input = useRef(null);
  return (
    <div className="flex max-w-full items-center gap-2 rounded-full bg-white/85 p-1 text-sm shadow-md backdrop-blur">
      {fileName && (
        <span className="min-w-0 truncate pl-3 text-neutral-600" title={fileName}>
          {fileName}
        </span>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-white transition-colors hover:bg-neutral-700"
      >
        {fileName ? "Upload another .glb" : "Upload .glb"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".glb,model/gltf-binary"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

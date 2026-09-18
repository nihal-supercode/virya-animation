import { useGLTF } from "@react-three/drei";

// Self-hosted Draco decoder (public/draco/, copied from
// three/examples/jsm/libs/draco/gltf) instead of drei's default Google CDN
// — more reliable offline/in restricted networks, one less third-party
// origin.
const DRACO_DECODER_PATH = "/draco/";

/** useGLTF wrapper that always points the Draco decoder at our own files. */
export function useModel(url) {
  return useGLTF(url, DRACO_DECODER_PATH);
}

useModel.preload = (url) => useGLTF.preload(url, DRACO_DECODER_PATH);

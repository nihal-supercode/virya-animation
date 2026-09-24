/* Port of @google/model-viewer's generated "neutral" studio environment
 * (lib/three-components/EnvironmentScene.js, model-viewer v4.3.1) — the
 * default lighting <model-viewer> uses when no environment-image is set.
 *
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as THREE from "three";

const NEUTRAL = {
  topLight: { intensity: 400, position: [0.5, 14.0, 0.5] },
  room: { position: [0.0, 13.2, 0.0], scale: [31.5, 28.5, 31.5] },
  boxes: [
    { position: [-10.906, -1.0, 1.846], rotation: -0.195, scale: [2.328, 7.905, 4.651] },
    { position: [-5.607, -0.754, -0.758], rotation: 0.994, scale: [1.97, 1.534, 3.955] },
    { position: [6.167, -0.16, 7.803], rotation: 0.561, scale: [3.927, 6.285, 3.687] },
    { position: [-2.017, 0.018, 6.124], rotation: 0.333, scale: [2.002, 4.566, 2.064] },
    { position: [2.291, -0.756, -2.621], rotation: -0.286, scale: [1.546, 1.552, 1.496] },
    { position: [-2.193, -0.369, -5.547], rotation: 0.516, scale: [3.875, 3.487, 2.986] },
  ],
  lights: [
    { intensity: 80, position: [-14.0, 10.0, 8.0], scale: [0.1, 2.5, 2.5] },
    { intensity: 80, position: [-14.0, 14.0, -4.0], scale: [0.1, 2.5, 2.5] },
    { intensity: 23, position: [14.0, 12.0, 0.0], scale: [0.1, 5.0, 5.0] },
    { intensity: 16, position: [0.0, 9.0, 14.0], scale: [5.0, 5.0, 0.1] },
    { intensity: 80, position: [7.0, 8.0, -14.0], scale: [2.5, 2.5, 0.1] },
    { intensity: 80, position: [-7.0, 16.0, -14.0], scale: [2.5, 2.5, 0.1] },
    { intensity: 1, position: [0.0, 20.0, 0.0], scale: [0.1, 0.1, 0.1] },
  ],
};

// model-viewer blurs its generated cubemap by this sigma (radians) before
// use (TextureUtils.js's GENERATED_SIGMA); PMREMGenerator.fromScene's own
// sigma blur stands in for it here.
const GENERATED_SIGMA = 0.04;

// With tone-mapping="neutral" and the generated neutral environment,
// model-viewer multiplies the renderer exposure by this (Renderer.js's
// COMMERCE_EXPOSURE) — so its default look is effectively exposure 1.3.
export const MODEL_VIEWER_EXPOSURE = 1.3;

class NeutralEnvironmentScene extends THREE.Scene {
  constructor() {
    super();
    this.position.y = -3.5;
    const geometry = new THREE.BoxGeometry();
    geometry.deleteAttribute("uv");
    const roomMaterial = new THREE.MeshStandardMaterial({ metalness: 0, side: THREE.BackSide });
    const boxMaterial = new THREE.MeshStandardMaterial({ metalness: 0 });

    const mainLight = new THREE.PointLight(0xffffff, NEUTRAL.topLight.intensity, 28, 2);
    mainLight.position.set(...NEUTRAL.topLight.position);
    this.add(mainLight);

    const room = new THREE.Mesh(geometry, roomMaterial);
    room.position.set(...NEUTRAL.room.position);
    room.scale.set(...NEUTRAL.room.scale);
    this.add(room);

    for (const box of NEUTRAL.boxes) {
      const mesh = new THREE.Mesh(geometry, boxMaterial);
      mesh.position.set(...box.position);
      mesh.rotation.set(0, box.rotation, 0);
      mesh.scale.set(...box.scale);
      this.add(mesh);
    }
    for (const light of NEUTRAL.lights) {
      const material = new THREE.MeshBasicMaterial();
      material.color.setScalar(light.intensity);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...light.position);
      mesh.scale.set(...light.scale);
      this.add(mesh);
    }
  }

  dispose() {
    this.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        obj.material.dispose();
      }
    });
  }
}

/** Bakes model-viewer's neutral environment into a PMREM envMap texture. */
export function createModelViewerEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new NeutralEnvironmentScene();
  const texture = pmrem.fromScene(scene, GENERATED_SIGMA).texture;
  scene.dispose();
  pmrem.dispose();
  return texture;
}

// three's NeutralToneMapping (identical to model-viewer's, which uses it),
// inlined because the renderer runs with NoToneMapping globally — so its
// tonemapping_pars chunk isn't compiled into our shaders.
const NEUTRAL_TONE_MAPPING_GLSL = /* glsl */ `
vec3 mvNeutralToneMapping( vec3 color ) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  color *= ${MODEL_VIEWER_EXPOSURE.toFixed(4)};
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}
`;

/**
 * Makes a standard/physical material render the way <model-viewer> would
 * show it by default, while the rest of the scene keeps its own lighting:
 * - lit ONLY by `envMap` (the scene's ambient/directional lights are
 *   zeroed out for this material — model-viewer has no punctual lights),
 * - neutral tone mapping at model-viewer's effective 1.3 exposure, applied
 *   per material since the renderer itself runs with NoToneMapping.
 */
export function applyModelViewerLook(material, envMap) {
  material.envMap = envMap;
  material.envMapIntensity = 1;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NEUTRAL_TONE_MAPPING_GLSL}`)
      .replace(
        "#include <lights_fragment_begin>",
        `#include <lights_fragment_begin>
        reflectedLight.directDiffuse = vec3( 0.0 );
        reflectedLight.directSpecular = vec3( 0.0 );
        irradiance = vec3( 0.0 );`
      )
      .replace(
        "#include <tonemapping_fragment>",
        "gl_FragColor.rgb = mvNeutralToneMapping( gl_FragColor.rgb );"
      );
  };
  material.customProgramCacheKey = () => "model-viewer-look";
  material.needsUpdate = true;
}

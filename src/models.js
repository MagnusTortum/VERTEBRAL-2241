// GLB models packed by pack-models.mjs (window.MAPGEN_MODELS, base64). Loaded once at startup; props
// clone them with their own baked-light attribute. Textured with the shared map material (map × bake + sun).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mapMaterial } from './materials.js';

export const MODELS = {};
const MAT = new Map();

export async function loadModels() {
  const src = (typeof window !== 'undefined' && window.MAPGEN_MODELS) || {};
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(src).map(async ([name, b64]) => {
    try {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const gltf = await loader.parseAsync(bin.buffer, '');
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        const map = o.material?.map || null;
        let m = MAT.get(map);
        if (!m) {
          if (map) { map.colorSpace = THREE.NoColorSpace; map.magFilter = THREE.LinearFilter; }
          m = mapMaterial(map || whiteTex(), null, { linear: true });
          m.userData.shared = true;
          MAT.set(map, m);
        }
        parts.push({ g, m });
      });
      const box = new THREE.Box3();
      for (const p of parts) { p.g.computeBoundingBox(); box.union(p.g.boundingBox); }
      MODELS[name] = { parts, box };
    } catch (e) { console.warn('model failed', name, e); }
  }));
  console.log(`[models] ${Object.keys(MODELS).length} loaded`);
}

let WHITE = null;
function whiteTex() {
  if (WHITE) return WHITE;
  WHITE = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1, THREE.RGBAFormat);
  WHITE.needsUpdate = true;
  return WHITE;
}

// fresh meshes for one placement (own geometry: the baker writes per-vertex light into it)
export function modelParts(name, scale = 1) {
  const M = MODELS[name];
  if (!M) return null;
  return M.parts.map(({ g, m }) => {
    const gg = g.clone();
    if (scale !== 1) gg.scale(scale, scale, scale);
    gg.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 3).fill(1), 3));
    return new THREE.Mesh(gg, m);
  });
}

// Build-menu thumbnails: each catalog item is rendered once from its real model into a small image
// (lambert-lit vertex colours, 3/4 view), cached for the session. Rendering is queued and spread over
// frames so opening a tab never freezes the editor.
import * as THREE from 'three';
import { RNG } from './rng.js';
import { buildProp } from './props.js';
import { buildStructure } from './buildings.js';
import { buildFence } from './fences.js';
import { Flora } from './vegetation.js';
import { foliageAtlas, plantAtlas } from './textures.js';

const SIZE = 112, RS = 224; // drawn at 2x, then the line art is scaled down
const cache = new Map();
const queue = [];
let busy = false, ctx = null;

function setup(renderer) {
  if (ctx) return ctx;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a7a60, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 6); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const rt = new THREE.WebGLRenderTarget(RS, RS, { samples: 4 });
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const big = document.createElement('canvas'); big.width = big.height = RS;
  const atlas = foliageAtlas();
  ctx = {
    renderer, scene, cam, rt, canvas, big, g2: canvas.getContext('2d'), gb: big.getContext('2d'), buf: new Uint8Array(RS * RS * 4),
    solid: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    cards: new THREE.MeshLambertMaterial({ vertexColors: true, map: atlas, alphaTest: 0.45, side: THREE.DoubleSide }),
    leaf: (() => { const t = plantAtlas().clone(); t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; return new THREE.MeshLambertMaterial({ vertexColors: true, map: t, alphaTest: 0.45, side: THREE.DoubleSide }); })(),
  };
  return ctx;
}

function groupFor(item, seed) {
  const g = new THREE.Group(), C = ctx;
  const add = (geo, mat) => { if (geo) g.add(new THREE.Mesh(geo, mat)); };
  const rng = new RNG(`thumb:${item.key}`);
  if (item.kind === 'prop') {
    const b = buildProp(item.type, rng, { ...(item.opts || {}), _r: 9 });
    if (!b) return null;
    for (const [ch, geo] of Object.entries(b.geoms || {})) add(geo, ch === 'leaf' ? C.leaf : C.solid);
    for (const p of b.parts || []) {
      const map = p.material?.uniforms?.uMap?.value || p.material?.map || null;
      const m = new THREE.Mesh(p.geometry, map ? new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }) : C.solid);
      m.position.copy(p.position); m.rotation.copy(p.rotation); m.scale.copy(p.scale);
      g.add(m);
    }
  } else if (item.kind === 'building') {
    const { geoms } = buildStructure({ id: `thumb-${item.key}`, kind: item.type, shape: item.shape || 'rect', size: item.size || [10, 8], floors: item.floors || 1, origin: item.origin || 'new', condition: item.condition, ruinType: item.ruinType, material: item.material, roof: item.roof, porch: item.porch, layout: item.layout }, 'thumbs');
    for (const [ch, geo] of Object.entries(geoms)) add(geo, ch === 'leaf' ? C.leaf : C.solid);
  } else if (item.kind === 'wall') {
    const flat = { height: () => 0 };
    const geoms = buildFence({ id: 'thumb', type: item.type, path: [[-3, 0], [3, 0]], condition: 0.9 }, flat, 'thumbs');
    for (const geo of Object.values(geoms)) add(geo, C.solid);
  } else if (item.kind === 'plant') {
    const fl = new Flora('thumbs');
    const k = fl.def(item.type, 0), d = fl.defs[k];
    add(d.solid, C.solid); add(d.cards, C.cards);
  } else return null;
  return g;
}

function renderOne(item) {
  const C = ctx;
  const g = groupFor(item);
  if (!g || !g.children.length) return null;
  C.scene.add(g);
  const box = new THREE.Box3().setFromObject(g), sph = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(0.3, sph.radius), dist = r / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
  const dir = new THREE.Vector3(0.75, 0.62, 1).normalize();
  C.cam.position.copy(sph.center).addScaledVector(dir, dist);
  C.cam.near = dist / 20; C.cam.far = dist * 4; C.cam.lookAt(sph.center); C.cam.updateProjectionMatrix();
  const R = C.renderer, prevRT = R.getRenderTarget(), prevC = R.getClearColor(new THREE.Color()), prevA = R.getClearAlpha();
  R.setRenderTarget(C.rt); R.setClearColor(0x000000, 0); R.clear(); R.render(C.scene, C.cam);
  R.readRenderTargetPixels(C.rt, 0, 0, RS, RS, C.buf);
  R.setRenderTarget(prevRT); R.setClearColor(prevC, prevA);
  C.scene.remove(g);
  g.traverse((o) => { if (o.isMesh && o.material !== C.solid && o.material !== C.cards) o.material.dispose?.(); });
  // schematic: a dark green body shaded by the light, bright green lines on the outline and where colour / light
  // changes sharply (edges between parts), like the rest of the terminal UI
  const N = RS, src = C.buf, Lm = new Float32Array(N * N), Am = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = ((N - 1 - y) * N + x) * 4, o = y * N + x;
    Am[o] = src[i + 3] / 255;
    Lm[o] = Math.pow((src[i] * 0.3 + src[i + 1] * 0.55 + src[i + 2] * 0.15) / 255, 1 / 2.2) * Am[o];
  }
  const img = C.gb.createImageData(N, N), d = img.data;
  const sob = (F, x, y) => {
    const f = (dx, dy) => F[Math.min(N - 1, Math.max(0, y + dy)) * N + Math.min(N - 1, Math.max(0, x + dx))];
    const gx = f(1, -1) + 2 * f(1, 0) + f(1, 1) - f(-1, -1) - 2 * f(-1, 0) - f(-1, 1), gy = f(-1, 1) + 2 * f(0, 1) + f(1, 1) - f(-1, -1) - 2 * f(0, -1) - f(1, -1);
    return Math.hypot(gx, gy);
  };
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = y * N + x, a = Am[o];
    const eA = sm(0.25, 1.2, sob(Am, x, y)), eL = a > 0.5 ? sm(0.22, 0.6, sob(Lm, x, y)) * 0.75 : 0, e = Math.max(eA, eL);
    const k = a > 0.5 ? 0.07 + 0.3 * (Lm[o] / Math.max(0.01, a)) : 0;
    const r = 4 + 61 * k, gg = 14 + 255 * k, b = 8 + 122 * k;
    d[o * 4] = r + (61 - r) * e; d[o * 4 + 1] = gg + (255 - gg) * e; d[o * 4 + 2] = b + (122 - b) * e; d[o * 4 + 3] = 255 * Math.max(a > 0.5 ? 1 : 0, e);
  }
  C.gb.putImageData(img, 0, 0);
  C.g2.clearRect(0, 0, SIZE, SIZE); C.g2.imageSmoothingQuality = 'high'; C.g2.drawImage(C.big, 0, 0, SIZE, SIZE);
  return C.canvas.toDataURL('image/png');
}

// ask for a thumbnail; `cb(url)` runs when it's ready (immediately if cached)
export function thumb(renderer, item, cb) {
  if (cache.has(item.key)) { cb(cache.get(item.key)); return; }
  setup(renderer);
  queue.push([item, cb]);
  if (!busy) pump();
}
function pump() {
  busy = true;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 24) {
    const [item, cb] = queue.shift();
    if (!cache.has(item.key)) { let url = null; try { url = renderOne(item); } catch (e) { console.warn('thumb', item.key, e); } cache.set(item.key, url); }
    cb(cache.get(item.key));
  }
  if (queue.length) setTimeout(pump, 16); else busy = false;
}

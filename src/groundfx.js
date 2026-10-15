// Ground effects, all generated from context, deterministic, never saved:
//  - vegetation cover field: a smooth green-cover map from trees, shrubs, crops, irrigation and ponds; low cover
//    reads sandier / dustier in the terrain shader, high cover darker and richer (editor overlay: uVegShow)
//  - decals: oil stains, cart ruts, trampled rings, cracks, dry-mud cracks, wet stains, soot, dung, trash.
//    Old-school "modulate 2x" blending (0.5 grey = no change), so they darken / lighten whatever light falls there.
//    Density scales with spec.wear (the "Wear & litter" slider, 0..2) and, in plots, with the plot's liveliness.
//  - ground clutter: grass, weeds, pebbles, leaf litter as alpha cards, only round the view, seeded by position
import * as THREE from 'three';
import { RNG } from './rng.js';
import { Builder } from './builder.js';
import { PLANT, LEAF } from './textures.js';
import { U, MATS } from './materials.js';
import { pointInPoly, nearestWithin } from './geo.js';

const hash = (x, z, k = 0) => { const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
const BIG = new Set(['eucalyptus', 'tamarisk', 'mesquite', 'palo_verde', 'pepper_tree', 'fan_palm', 'date_palm', 'fruit_tree', 'elephant_tree', 'cardon']);
const DRY = new Set(['cholla', 'nopal', 'agave', 'cardon', 'boulder', 'datilillo', 'ocotillo', 'barrel_cactus']);
const GREEN_FIELDS = new Set(['field', 'garden', 'orchard', 'vineyard', 'crop', 'milpa']);

// ---------------------------------------------------------------- vegetation cover
export function vegField(world, box = null, prev = null) {
  const T = world.terrain, res = 2, Nx = Math.ceil(T.W / res) + 1, Nz = Math.ceil(T.D / res) + 1, x0 = -T.W / 2, z0 = -T.D / 2;
  // regional: an edit only moves stamps inside its box; their reach (stamp radius + the blur) is ~20 m, so recompute the
  // cells within 20 m of the box from the raw stamps of a window 20 m wider still, and keep the rest of the old field
  const reg = box && prev && prev.Nx === Nx && prev.Nz === Nz && prev.x0 === x0 && prev.z0 === z0;
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  const O = reg ? [cl(Math.floor((box[0] - 20 - x0) / res), Nx), cl(Math.floor((box[1] - 20 - z0) / res), Nz), cl(Math.ceil((box[2] + 20 - x0) / res), Nx), cl(Math.ceil((box[3] + 20 - z0) / res), Nz)] : [0, 0, Nx - 1, Nz - 1];
  const W = reg ? [cl(O[0] - 10, Nx), cl(O[1] - 10, Nz), cl(O[2] + 10, Nx), cl(O[3] + 10, Nz)] : O;
  const wx0 = x0 + W[0] * res, wz0 = z0 + W[1] * res, wx1 = x0 + W[2] * res, wz1 = z0 + W[3] * res;
  const a = reg ? prev.a : new Float32Array(Nx * Nz), tree = reg ? prev.tree : new Uint8Array(Nx * Nz);
  const raw = reg ? new Float32Array(Nx * Nz) : a, tr = reg ? new Uint8Array(Nx * Nz) : tree;
  const stamp = (x, z, r, w, isTree = false) => {
    if (x + r < wx0 || x - r > wx1 || z + r < wz0 || z - r > wz1) return;
    const i0 = Math.max(W[0], Math.floor((x - r - x0) / res)), i1 = Math.min(W[2], Math.ceil((x + r - x0) / res));
    const j0 = Math.max(W[1], Math.floor((z - r - z0) / res)), j1 = Math.min(W[3], Math.ceil((z + r - z0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(x0 + i * res - x, z0 + j * res - z); if (d > r) continue;
      const k = j * Nx + i; raw[k] += w * (1 - (d / r) ** 2); if (isTree && d < r * 0.75) tr[k] = 1;
    }
  };
  for (const { sp, e } of world.flora?.entries?.() || []) {
    if (sp === 'grass') { stamp(e[0], e[2], 1.5, 0.08); continue; }
    const big = BIG.has(sp), dry = DRY.has(sp), s = e[3] || 1;
    stamp(e[0], e[2], (big ? 4.2 : 1.8) * s, (big ? 0.55 : dry ? 0.06 : 0.22) * (dry ? 1 : 1), big);
  }
  for (const f of world.fields || []) {
    if (!f.poly || f.fallow || !GREEN_FIELDS.has(f.type) || f._irr === false) continue;
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [x, z] of f.poly) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    if (bx1 + 2.2 < wx0 || bx0 - 2.2 > wx1 || bz1 + 2.2 < wz0 || bz0 - 2.2 > wz1) continue;
    for (let z = bz0; z <= bz1; z += res) { if (z < wz0 - 2.2 || z > wz1 + 2.2) continue; for (let x = bx0; x <= bx1; x += res) if (x >= wx0 - 2.2 && x <= wx1 + 2.2 && pointInPoly(x, z, f.poly)) stamp(x, z, 2.2, 0.32); }
  }
  for (const w of world.walls || []) if ((w.type === 'acequia' && w._wet !== false) || w.type === 'stream') for (let i = 0; i < w.path.length - 1; i++) {
    const [ax, az] = w.path[i], [bx, bz] = w.path[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (Math.max(ax, bx) + 5 < wx0 || Math.min(ax, bx) - 5 > wx1 || Math.max(az, bz) + 5 < wz0 || Math.min(az, bz) - 5 > wz1) continue;
    for (let t = 0; t <= L; t += res) stamp(ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L, 5, 0.5);
  }
  for (const p of [...(world.spec.props || []), ...(world.genProps || [])]) if (p.type === 'pond' || p.type === 'trough' || p.type === 'well' || p.type === 'spring' || p.type === 'bordo' || p.type === 'tanque') { const at = world.propAt(p); if (at) stamp(at[0], at[1], p.type === 'pond' ? 9 : 4, p.type === 'pond' ? 0.7 : 0.25); }
  // blur twice (box 5 cells, ~10 m), then soft-saturate; neighbours count to the map edge, as in the whole-map pass
  const tmp = new Float32Array(raw.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = W[1]; j <= W[3]; j++) for (let i = W[0]; i <= W[2]; i++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const ii = i + d; if (ii >= 0 && ii < Nx) { s += raw[j * Nx + ii]; n++; } } tmp[j * Nx + i] = s / n; }
    for (let j = W[1]; j <= W[3]; j++) for (let i = W[0]; i <= W[2]; i++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const jj = j + d; if (jj >= 0 && jj < Nz) { s += tmp[jj * Nx + i]; n++; } } raw[j * Nx + i] = s / n; }
  }
  const data = reg ? prev.tex.image.data : new Uint8Array(Nx * Nz * 4);
  for (let j = O[1]; j <= O[3]; j++) for (let i = O[0]; i <= O[2]; i++) { const k = j * Nx + i, v = 1 - Math.exp(-raw[k] * 2.2); a[k] = v; tree[k] = tr[k]; data[k * 4] = Math.round(v * 255); data[k * 4 + 1] = tr[k] * 255; data[k * 4 + 3] = 255; }
  let sum = 0; for (let k = 0; k < a.length; k++) sum += a[k];
  let tex; if (reg) { tex = prev.tex; tex.needsUpdate = true; } else { tex = new THREE.DataTexture(data, Nx, Nz, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; }
  const at = (x, z) => { const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res); return i < 0 || j < 0 || i >= Nx || j >= Nz ? 0 : a[j * Nx + i]; };
  const treeAt = (x, z) => { const i = Math.round((x - x0) / res), j = Math.round((z - z0) / res); return i < 0 || j < 0 || i >= Nx || j >= Nz ? 0 : tree[j * Nx + i]; };
  return { tex, rect: [x0, z0, x0 + (Nx - 1) * res, z0 + (Nz - 1) * res], at, treeAt, mean: sum / a.length, a, tree, Nx, Nz, x0, z0 };
}

// ---------------------------------------------------------------- decal atlas (4x4, modulate-2x: 128 grey = no change)
const D = { oil: 0, drips: 1, rut: 2, cracks: 3, mud: 4, wet: 5, soot: 6, dung: 7, trash: 8, ring: 9, wear: 10, drift: 11, trash2: 12, weeds: 13 };
let ATLAS = null;
function decalAtlas() {
  if (ATLAS) return ATLAS;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S * 4;
  const g = cv.getContext('2d'), R = new RNG('decals');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); fn(); g.restore(); };
  const blot = (x, y, r, rgba, n = 7) => { for (let k = 0; k < n; k++) { const a = R.next() * 6.28, d = R.next() * r * 0.5, rr = r * (0.35 + R.next() * 0.5), gr = g.createRadialGradient(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, x + Math.cos(a) * d, y + Math.sin(a) * d, rr); gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)')); g.fillStyle = gr; g.fillRect(0, 0, S, S); } };
  cell(D.oil, () => { blot(128, 128, 110, 'rgba(20,18,16,0.7)', 9); blot(128, 128, 60, 'rgba(10,10,12,0.6)', 5); g.globalAlpha = 0.25; g.strokeStyle = 'rgb(90,70,120)'; g.lineWidth = 3; g.beginPath(); g.ellipse(128, 128, 84, 70, 0.3, 0, 6.28); g.stroke(); g.globalAlpha = 1; });
  cell(D.drips, () => { for (let k = 0; k < 14; k++) blot(40 + R.next() * 176, 40 + R.next() * 176, 10 + R.next() * 22, 'rgba(18,16,14,0.65)', 3); });
  cell(D.rut, () => { const gr = g.createLinearGradient(80, 0, 176, 0); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(0.25, 'rgba(50,40,30,0.8)'); gr.addColorStop(0.5, 'rgba(66,54,42,0.65)'); gr.addColorStop(0.75, 'rgba(50,40,30,0.8)'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(190,170,140,0.35)'; for (let y = 0; y < S; y += 9) g.fillRect(100 + R.next() * 50, y, 6, 3); });
  cell(D.cracks, () => { g.strokeStyle = 'rgba(25,22,20,0.8)'; g.lineCap = 'round'; for (let k = 0; k < 5; k++) { let x = 128, y = 128, a = R.next() * 6.28; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 14; s++) { a += (R.next() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); } });
  cell(D.mud, () => { g.fillStyle = 'rgba(200,180,150,0.35)'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(40,32,26,0.85)'; g.lineWidth = 2.2; for (let y = 10; y < S; y += 34) for (let x = 10; x < S; x += 34) { g.beginPath(); const jx = (R.next() - 0.5) * 12, jy = (R.next() - 0.5) * 12; g.moveTo(x + jx, y + jy); g.lineTo(x + 34 + (R.next() - 0.5) * 12, y + jy); g.lineTo(x + 30 + (R.next() - 0.5) * 12, y + 34 + (R.next() - 0.5) * 10); g.stroke(); }
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over'; });
  cell(D.wet, () => { blot(128, 128, 115, 'rgba(40,36,34,0.55)', 9); });
  cell(D.soot, () => { blot(128, 128, 118, 'rgba(14,12,10,0.75)', 8); for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(170,165,160,${0.3 + R.next() * 0.4})`; const a = R.next() * 6.28, d = R.next() * 70; g.fillRect(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3, 3); } });
  cell(D.dung, () => { for (let k = 0; k < 9; k++) { const x = 30 + R.next() * 196, y = 30 + R.next() * 196, r = 9 + R.next() * 12; g.fillStyle = 'rgba(52,40,26,0.85)'; g.beginPath(); g.ellipse(x, y, r, r * 0.8, R.next() * 3, 0, 6.28); g.fill(); g.fillStyle = 'rgba(90,72,48,0.6)'; g.beginPath(); g.ellipse(x - 2, y - 2, r * 0.5, r * 0.35, 0, 0, 6.28); g.fill(); } });
  const trash = (dense) => { for (let k = 0; k < (dense ? 26 : 14); k++) { const x = 20 + R.next() * 216, y = 20 + R.next() * 216, kind = R.next(); g.save(); g.translate(x, y); g.rotate(R.next() * 6.28);
    if (kind < 0.45) { g.fillStyle = `rgba(${235 - R.next() * 30},${230 - R.next() * 30},${215 - R.next() * 40},0.95)`; g.fillRect(-12, -8, 24, 16); } // paper
    else if (kind < 0.7) { g.fillStyle = R.pick(['rgba(170,40,30,0.95)', 'rgba(200,200,205,0.95)', 'rgba(60,90,150,0.95)']); g.fillRect(-10, -5, 20, 10); g.fillStyle = 'rgba(230,230,230,0.9)'; g.fillRect(-10, -5, 3, 10); } // can
    else { g.fillStyle = R.pick(['rgba(50,110,60,0.8)', 'rgba(120,70,30,0.8)', 'rgba(200,210,200,0.7)']); g.fillRect(-14, -5, 28, 10); g.fillRect(14, -2.5, 8, 5); } // bottle
    g.restore(); } };
  cell(D.trash, () => trash(false)); cell(D.trash2, () => trash(true));
  cell(D.ring, () => { g.lineWidth = 46; g.strokeStyle = 'rgba(210,190,160,0.45)'; g.beginPath(); g.arc(128, 128, 80, 0, 6.28); g.stroke(); blot(128, 128, 90, 'rgba(170,150,120,0.25)', 4); });
  cell(D.wear, () => { const gr = g.createLinearGradient(40, 0, 216, 0); gr.addColorStop(0, 'rgba(200,180,150,0)'); gr.addColorStop(0.5, 'rgba(205,185,155,0.5)'); gr.addColorStop(1, 'rgba(200,180,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
  cell(D.drift, () => { for (let k = 0; k < 6; k++) blot(40 + k * 36, 150 + R.next() * 30, 70, 'rgba(225,205,170,0.35)', 3); });
  cell(D.weeds, () => { // overgrowth: olive mottling, dry stalks, dead leaves
    blot(128, 128, 120, 'rgba(78,84,46,0.85)', 12); blot(128, 128, 80, 'rgba(58,62,36,0.7)', 8);
    g.lineCap = 'round'; for (let k = 0; k < 260; k++) { const x = 20 + R.next() * 216, y = 20 + R.next() * 216, a = -1.57 + (R.next() - 0.5) * 1.6, l = 6 + R.next() * 16; g.strokeStyle = R.pick(['rgba(52,56,30,1)', 'rgba(170,155,100,0.95)', 'rgba(100,92,52,1)', 'rgba(44,48,28,1)']); g.lineWidth = 1.2 + R.next() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let k = 0; k < 30; k++) { g.fillStyle = R.pick(['rgba(120,90,50,0.7)', 'rgba(90,70,40,0.7)']); g.beginPath(); g.ellipse(20 + R.next() * 216, 20 + R.next() * 216, 3 + R.next() * 3, 1.5 + R.next() * 2, R.next() * 3, 0, 6.28); g.fill(); }
    const gr = g.createRadialGradient(128, 128, 50, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gr; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  });
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.NoColorSpace;
  ATLAS = tex; return tex;
}
let DECAL_MAT = null;
function decalMaterial() { // one for the map's life: a new material each rebuild recompiled its shader on every edit
  return (DECAL_MAT ||= decalMaterial0());
}
function decalMaterial0() {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: decalAtlas() }, uFogNear: U.uFogNear, uWear: { value: 1 } },
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
    vertexShader: 'attribute float fade; varying vec2 vUv; varying float vF; void main(){ vUv = uv; vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D uMap; uniform float uFogNear; varying vec2 vUv; varying float vF;
      void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vF * (1.0 - uFogNear * 0.8); gl_FragColor = vec4(mix(vec3(0.5), t.rgb, a), 1.0); }`,
  });
}

// ---------------------------------------------------------------- decals from context
// box (editor): only decals centred in the box are rebuilt; the rest come from prevQuads (the same seeded logic runs
// for everything, so the choices match a full build — only the costly draping is skipped outside the box)
export function buildDecals(world, box = null, prevQuads = null) {
  const T = world.terrain, spec = world.spec, wear = Math.max(0, Math.min(2, spec.wear ?? 1));
  if (wear <= 0.01) return null;
  const Q = [];
  const inB = (x, z) => !box || (x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3]);
  const wealth = { dead_broke: 0, poor: 0, struggling: 1, average: 1, comfortable: 2, prosperous: 3, wealthy: 3, rich: 3 }[spec.settlement?.wealth] ?? 1;
  const tidy = [1.4, 1.1, 0.75, 0.45][wealth];
  const fields = (world.fields || []).filter((f) => f.poly && f.type !== 'corral');
  const inField = (x, z) => fields.some((f) => pointInPoly(x, z, f.poly));
  const plotLife = (x, z) => { const pl = (spec.plots || []).find((q) => q.poly && pointInPoly(x, z, q.poly)); return pl ? 0.4 + (pl.life ?? 0.5) * 1.2 : 1; };
  // one decal: centre, size (w across, l along), angle, atlas cell, strength; draped on the ground in a 3x3 grid
  const quad = (x, z, w, l, a, cell, k = 1, n = 3) => {
    if (!T.inBounds(x, z, 1) || !inB(x, z)) return;
    const c = Math.cos(a), s = Math.sin(a), u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 4, e = 0.004;
    const P = [], UV = [], F = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const lu = (i / n - 0.5) * w, lv = (j / n - 0.5) * l, px = x + lu * c + lv * s, pz = z - lu * s + lv * c;
      P.push(px, T.height(px, pz) + 0.03, pz); UV.push(u0 + e + (i / n) * (0.25 - 2 * e), v0 + e + (j / n) * (0.25 - 2 * e)); F.push(Math.min(1, k));
    }
    Q.push({ x, z, n, P, UV, F });
  };
  const rng = new RNG(`${world.seed}:decals`);
  const props = [...(spec.props || []), ...(world.genProps || [])].map((p) => ({ p, at: world.propAt(p) })).filter((q) => q.at);
  for (const { p, at: [x, z] } of props) {
    const r = rng.next(), a = rng.next() * 6.28, life = plotLife(x, z);
    switch (p.type) {
      case 'car_wreck': case 'truck_chassis': case 'generator': case 'engine_block': case 'tractor':
        quad(x + rng.range(-0.6, 0.6), z + rng.range(-0.6, 0.6), 2.4, 2.4, a, D.oil, 0.85 * wear); if (r < 0.5) quad(x + rng.range(-1.5, 1.5), z + rng.range(-1.5, 1.5), 1.6, 1.6, a, D.drips, 0.8 * wear); break;
      case 'gas_pump': quad(x, z + 1.2, 2.6, 2.6, a, D.oil, 0.8 * wear); quad(x + 1.5, z + 1.6, 1.8, 1.8, a + 1, D.drips, 0.8 * wear); break;
      case 'well': case 'trough': case 'pila': case 'hand_pump': case 'rain_barrel': case 'water_jugs':
        quad(x, z, p.type === 'well' ? 3.4 : 2.4, p.type === 'well' ? 3.4 : 2.2, a, D.wet, 0.75 * wear); if (p.type === 'well' || p.type === 'trough') quad(x, z, 6, 6, a, D.ring, 0.8 * wear * life); break;
      case 'firepit': case 'drum_stove': case 'horno': case 'kiln': case 'forge': case 'campfire': case 'comal':
        quad(x, z, p.type === 'horno' || p.type === 'kiln' ? 3.6 : 2.6, p.type === 'horno' || p.type === 'kiln' ? 3.6 : 2.6, a, D.soot, 0.85 * Math.min(1.3, wear)); break;
      case 'bench': case 'bench_park': quad(x, z + 0.6, 2.6, 1.8, a, D.ring, 0.55 * wear * life); break;
      case 'hitching_rail': quad(x, z + 1.0, 3.4, 2.2, a, D.dung, 0.9 * wear); quad(x, z + 0.8, 4, 2.6, a, D.ring, 0.6 * wear); break;
      case 'brahmin': case 'burro': case 'goat': case 'horse': case 'pig': quad(x + rng.range(-1, 1), z + rng.range(-1, 1), 2.2, 2.2, a, D.dung, 0.85 * wear); break;
      case 'tarp_stall': case 'cart_shop': case 'market_stall': case 'stall': if (r < 0.85 * wear * tidy) quad(x + rng.range(-1.5, 1.5), z + rng.range(0.5, 2), 2.4, 2.4, a, r < 0.4 ? D.trash2 : D.trash, Math.min(1, 0.9 * wear * tidy)); break;
      case 'pond': for (let k = 0; k < 6; k++) { const aa = k * 1.05 + rng.next(), d = 5.5 + rng.range(0, 2); quad(x + Math.cos(aa) * d, z + Math.sin(aa) * d, 4, 4, rng.next() * 6, D.mud, 0.8); } break;
    }
  }
  // corrals: dung; acequias: dry mud along the banks
  for (const f of world.fields || []) if (f.type === 'corral' && f.poly) {
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [x, z] of f.poly) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    const n = Math.round(((bx1 - bx0) * (bz1 - bz0)) / 14 * wear);
    for (let k = 0; k < n; k++) { const x = rng.range(bx0, bx1), z = rng.range(bz0, bz1); if (pointInPoly(x, z, f.poly)) quad(x, z, 2.4, 2.4, rng.next() * 6, D.dung, 0.9); }
  }
  for (const w of world.walls || []) if (w.type === 'acequia') for (let i = 0; i < w.path.length - 1; i++) {
    const [ax, az] = w.path[i], [bx, bz] = w.path[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let t = rng.range(0, 4); t < L; t += rng.range(4, 9)) { const sd = rng.chance(0.5) ? 1 : -1, x = ax + ((bx - ax) * t) / L + nx * sd * 1.6, z = az + ((bz - az) * t) / L + nz * sd * 1.6; if (!inField(x, z)) quad(x, z, 3, 3, rng.next() * 6, D.mud, 0.6); }
  }
  // cart / tyre ruts on dirt and gravel roads: two tracks ~1.6 m apart, deeper on the busier classes, fading near junctions
  for (const r of world.roads || []) {
    if (r.paved || r.surface === 'pavers' || r.surface === 'cobble' || !r.samples || r.type === 'path' || r.type === 'track') continue; // tracks are wheel ruts already
    const busy = r.class === 'main' || r.class === 'arterial' ? 1 : r.type === 'track' || r.type === 'lane' || r.type === 'alley' ? 0.55 : 0.8, k = 0.75 * busy * Math.min(1.4, wear);
    const S = r.samples;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.05) continue;
      if ((r.laid || []).some(([s0, s1]) => a.s >= s0 - 1 && a.s <= s1 + 1)) continue; // laid stone: no ruts
      const nearJ = (r._junc || []).some((j) => Math.hypot((a.x + b.x) / 2 - j.x, (a.z + b.z) / 2 - j.z) < (j.r || 6) + 3);
      const ang = Math.atan2(b.x - a.x, b.z - a.z), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = Math.cos(ang), nz = -Math.sin(ang);
      for (const sd of [-0.8, 0.8]) quad(mx + nx * sd, mz + nz * sd, 0.55, L + 0.06, ang, D.rut, nearJ ? k * 0.35 : k, 1);
      if (rng.chance(0.06 * wear)) quad(mx + nx * rng.range(-1, 1), mz + nz * rng.range(-1, 1), 1.2, 1.2, rng.next() * 6, D.drips, 0.6 * wear); // a leak
      if (busy >= 0.8 && rng.chance(0.07 * wear * tidy)) { const sd = rng.chance(0.5) ? 1 : -1, off = r.hw + 0.4; quad(mx + nx * sd * off, mz + nz * sd * off, 1.6, 1.6, rng.next() * 6, D.trash, Math.min(1, wear * tidy * 0.8)); }
    }
  }
  // buildings: cantinas / markets / the Pemex get trash at the front and in the corners; concrete forecourts crack;
  // sand drifts against the walls where the ground is bare; litter piles at wall bases in poor places
  for (const s of world.structures || []) {
    if (!s._masses?.length || ['ruin'].includes(s.kind)) continue;
    const m = s._masses[0], c = Math.cos(m.r), sn = Math.sin(m.r), W = (u, v) => [m.cx + u * c + v * sn, m.cz - u * sn + v * c];
    const busy = ['cantina', 'store', 'shop', 'trade', 'cafe', 'pemex', 'market'].includes(s.kind) ? 1 : s.kind === 'house' ? 0.25 : 0.4;
    const nT = Math.round(busy * wear * tidy * 2 + rng.next() * 0.8);
    for (let k = 0; k < nT; k++) { const corner = rng.chance(0.5), u = corner ? (rng.chance(0.5) ? -1 : 1) * (m.w / 2 + 0.4) : rng.range(-m.w / 2, m.w / 2), v = m.d / 2 + (corner ? 0.4 : rng.range(1.2, 3)); const [x, z] = W(u, v); if (!inField(x, z)) quad(x, z, 1.6, 1.6, rng.next() * 6, k % 2 ? D.trash : D.trash2, Math.min(1, 0.85 * wear * tidy)); }
    if (s.kind === 'pemex') for (let k = 0; k < 6; k++) { const [x, z] = W(rng.range(-m.w / 2 - 2, m.w / 2 + 2), m.d / 2 + rng.range(2, 8)); quad(x, z, 3, 3, rng.next() * 6, k % 3 ? D.cracks : D.oil, 0.85 * wear); }
    const cover = world.veg?.at(m.cx, m.cz) ?? 0.3;
    if (cover < 0.2 && wear > 0.3) for (const sd of [-1, 1]) { const [x, z] = W(sd * (m.w / 2 + 0.5), rng.range(-m.d / 3, m.d / 3)); quad(x, z, 1.4, m.d * 0.7, m.r + Math.PI / 2 * 0, D.drift, (0.2 - cover) * 4 * 0.8); }
  }
  // concrete ground in plots: cracks
  for (const pl of spec.plots || []) {
    const surf = pl.ground?.surface || pl.ground; if (!pl.poly || !['concrete', 'slab'].includes(surf)) continue;
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [x, z] of pl.poly) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    const n = Math.round(((bx1 - bx0) * (bz1 - bz0)) / 30 * wear);
    for (let k = 0; k < n; k++) { const x = rng.range(bx0, bx1), z = rng.range(bz0, bz1); if (pointInPoly(x, z, pl.poly)) quad(x, z, 3, 3, rng.next() * 6, D.cracks, 0.8); }
  }
  // activity (life.js): worn paths from busy doors toward the street, litter by the busiest doors; alleys: a damp
  // gutter stain down the middle, a worn lane, rubbish at the dead end
  for (const q of world.lifePaths || []) {
    if (q.a < 0.3) continue;
    const ang = Math.atan2(q.nx, q.nz), len = 2 + q.a * 5;
    for (let t = 0.6; t < len; t += 1.6) quad(q.x + q.nx * t + rng.range(-0.2, 0.2), q.z + q.nz * t + rng.range(-0.2, 0.2), 1.3 + q.a * 0.6, 1.8, ang, D.wear, Math.min(1, (q.a - 0.2) * 1.1 * wear) * (1 - t / (len + 2)));
    if (q.a >= 0.12 && q.a <= 0.65 && rng.chance(0.8 * wear * tidy)) for (let k = 0; k < rng.int(2, 5); k++) quad(q.x + q.nx * rng.range(0.6, 4) + q.nz * rng.range(-4, 4), q.z + q.nz * rng.range(0.6, 4) - q.nx * rng.range(-4, 4), 1.2, 1.2, rng.next() * 6, rng.chance(0.5) ? D.trash : D.trash2, Math.min(1, 0.7 * wear * tidy)); // residential: a bit of litter about
    if (q.a > 0.6 && rng.chance(q.a * wear * tidy * 0.7)) quad(q.x + q.nx * rng.range(1, 3) + q.nz * rng.range(-2, 2), q.z + q.nz * rng.range(1, 3) - q.nx * rng.range(-2, 2), 1.4, 1.4, rng.next() * 6, rng.chance(0.5) ? D.trash : D.trash2, Math.min(1, wear * tidy * 0.8));
  }
  // verges (verge.js): a worn shortcut down the middle of some strips, litter and drifted sand along the rest
  for (const v of world.verges || []) {
    if (!v.path || rng.chance(0.3)) quad(v.x + rng.range(-0.3, 0.3), v.z + rng.range(-0.3, 0.3), rng.range(1.6, 2.4), rng.range(1.6, 2.4), rng.next() * 6, D.weeds, (v.road ? 0.6 : 1) * rng.range(0.8, 1));
    if (v.path) quad(v.x + rng.range(-0.15, 0.15), v.z + rng.range(-0.15, 0.15), 0.9, 1.4, v.ang, D.wear, 0.45 * Math.min(1.2, wear));
    else if (rng.chance(0.05 * tidy)) quad(v.x + rng.range(-0.3, 0.3), v.z + rng.range(-0.3, 0.3), 1.1, 1.1, rng.next() * 6, rng.chance(0.5) ? D.trash : D.trash2, Math.min(1, 0.7 * wear * tidy + 0.2));
    else if (rng.chance(0.06)) quad(v.x, v.z, 1.4, 1.4, rng.next() * 6, D.drift, 0.5);
  }
  for (const al of world.alleys || []) {
    const [ax, az] = al.a, [bx, bz] = al.b, L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
    const ang = Math.atan2(bx - ax, bz - az);
    for (let t = 0.5; t < L; t += 1.8) { const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L; quad(x, z, 0.7, 2.0, ang, D.wet, 0.55 * Math.min(1.3, wear)); if (rng.chance(0.5)) quad(x + rng.range(-0.3, 0.3), z + rng.range(-0.3, 0.3), 1.2, 2.0, ang, D.wear, 0.5 * wear); }
    if (al.dead) { const [ex, ez] = al.end; quad(ex, ez, Math.min(2, al.g), 1.6, ang, D.trash, Math.min(1, 0.9 * wear * tidy + 0.3)); }
  }
  const all = box && prevQuads ? [...prevQuads.filter((q) => !inB(q.x, q.z)), ...Q] : Q;
  world._decalQ = all;
  if (!all.length) return null;
  const P = [], UV = [], F = [], idx = [];
  for (const q of all) {
    const base = P.length / 3, n = q.n;
    for (let i = 0; i < q.P.length; i++) P.push(q.P[i]); for (let i = 0; i < q.UV.length; i++) UV.push(q.UV[i]); for (let i = 0; i < q.F.length; i++) F.push(q.F[i]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = base + j * (n + 1) + i; idx.push(v, v + n + 1, v + 1, v + 1, v + n + 1, v + n + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('fade', new THREE.Float32BufferAttribute(F, 1));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, decalMaterial());
  mesh.name = 'decals'; mesh.renderOrder = 1; mesh.userData.noBake = true; mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- ground clutter (near view only)
export class Clutter {
  constructor() { this.mesh = null; this.key = ''; }
  dispose(group) { if (this.mesh) { group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; } this.key = ''; }
  // rebuild when the view moved / zoomed enough; r = visible radius (m). Off when zoomed out.
  update(world, group, x, z, r, preset, force = 0) {
    if (!world || !preset) return;
    const R = Math.min(r, force || 46);
    if ((!force && r > 70) || world.spec.clutter === false) { if (this.mesh) this.dispose(group); return; }
    const step = Math.max(4, R / 3), key = `${Math.round(x / step)}:${Math.round(z / step)}:${Math.round(R / 6)}:${preset.key || preset.id}:${world._gen || 0}`;
    if (key === this.key) return;
    this.key = key;
    if (this.mesh) { group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const T = world.terrain, b = new Builder(), veg = world.veg, cs = 0.7;
    const amb = preset.amb.map((c) => c * preset.ambK * 0.95), fields = (world.fields || []).filter((f) => f.poly);
    const fieldBox = fields.map((f) => { let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [px, pz] of f.poly) { bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); bz0 = Math.min(bz0, pz); bz1 = Math.max(bz1, pz); } return [bx0, bz0, bx1, bz1, f]; });
    const inField = (px, pz) => fieldBox.some(([a, c2, d, e, f]) => px > a && px < d && pz > c2 && pz < e && pointInPoly(px, pz, f.poly));
    const hardP = world.hardGround?.(x - R, z - R, x + R, z + R) || [], laidR = (world.roads || []).filter((q) => q.laid?.length);
    const onHard = (px, pz) => hardP.some((P) => pointInPoly(px, pz, P)) || (laidR.length && world.onWalk?.(px, pz));
    const tintOf = (green) => new THREE.Color().setRGB(0.92 - green * 0.06, 0.92 + green * 0.04, 0.86 - green * 0.04); // near-neutral: the cell carries the colour
    for (let gz = Math.floor((z - R) / cs); gz <= Math.ceil((z + R) / cs); gz++) for (let gx = Math.floor((x - R) / cs); gx <= Math.ceil((x + R) / cs); gx++) {
      const h0 = hash(gx, gz), px = (gx + hash(gx, gz, 1)) * cs, pz = (gz + hash(gx, gz, 2)) * cs, d = Math.hypot(px - x, pz - z);
      if (d > R || !T.inBounds(px, pz, 1)) continue;
      const fadeD = 1 - Math.max(0, (d - R * 0.7) / (R * 0.3));
      const wt = T.surfaceAt?.(px, pz), paved = wt ? Math.min(1, wt[2] * 0.6 + wt[3] + wt[5] + wt[6] + wt[7]) : 0, dirt = wt ? Math.min(1, wt[0] + wt[2] * 0.4) : 0, till = wt ? wt[1] : 0;
      if (till > 0.3) continue;
      if (world.hard?.test(px, pz)) { // walls, buildings, props: nothing on them, but more at their foot
        continue;
      }
      if (world.roadNear(px, pz, 0) || onHard(px, pz)) continue; // tile, flagstone, laid walks: swept clean
      const shoulder = world.roadNear(px, pz, 1.4);
      const foot = world.hard?.test(px, pz, 1) ? 2.2 : 1;
      const cover = veg ? veg.at(px, pz) : 0.3, under = veg?.treeAt(px, pz);
      let dens, cell;
      if (paved > 0.5) { dens = 0.06 * foot; cell = PLANT.weed; }
      else if (dirt > 0.5) { dens = (0.12 + cover * 0.2) * foot; cell = h0 < 0.5 ? PLANT.pebbles : PLANT.weed; }
      else { dens = (0.26 + cover * 0.8) * foot; cell = under ? PLANT.litter : h0 < 0.2 ? PLANT.pebbles : h0 < 0.42 ? PLANT.weed : hash(gx, gz, 5) < cover * 1.4 ? 16 + LEAF.green_grass : 16 + LEAF.dry_grass; } // bare ground: dry bunch grass; covered: green
      if (shoulder) dens *= 0.4;
      if (hash(gx, gz, 3) > dens * cs * cs * 1.6) continue;
      if (inField(px, pz)) continue;
      const y = T.height(px, pz), s = (0.45 + hash(gx, gz, 4) * 0.6) * fadeD * (cell === PLANT.pebbles || cell === PLANT.litter ? 0.9 : 1);
      if (s < 0.08) continue;
      const tint = tintOf(cover);
      if (cell === PLANT.pebbles || cell === PLANT.litter) b.leafFlat(px, y + 0.02, pz, s * 1.4, cell, tint, h0 * 6.28);
      else b.leafCross(px, y - 0.02, pz, s, s * (cell >= 16 ? 0.75 : 0.7), cell, tint, 2, h0 * 3.14, false);
    }
    const out = b.build();
    if (!out.leaf) return;
    const g = out.leaf, n = g.attributes.position.count, bake = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { bake[k * 3] = amb[0]; bake[k * 3 + 1] = amb[1]; bake[k * 3 + 2] = amb[2]; }
    g.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
    this.mesh = new THREE.Mesh(g, MATS.leaf); this.mesh.name = 'clutter'; this.mesh.userData.noBake = true; this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }
}
void nearestWithin;

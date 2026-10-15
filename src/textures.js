// Procedural texture set. Layers are "detail maps": linear RGB with mean ~0.5, multiplied ×2 with
// the vertex albedo in the shader (classic modulate-2x), so vertex colours keep the hue and
// textures add surface detail. User textures (window.MAPGEN_TEXTURES) override layers by name.
import * as THREE from 'three';
import { LAYER_DEFS } from './layers.js';

const S = 512; // texture-array resolution
const SG = 256; // procedural layers are generated at this size and upsampled

// --- tileable value noise ---
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
function vn(x, y, P, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = fade(x - xi), fy = fade(y - yi);
  const m = (v) => ((v % P) + P) % P;
  const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u, v, base, oct = 4, s = 0) {
  let sum = 0, amp = 1, norm = 0, P = base;
  for (let o = 0; o < oct; o++) { sum += amp * vn(u * P, v * P, P, s + o * 17); norm += amp; amp *= 0.5; P *= 2; }
  return sum / norm;
}
// tileable voronoi: returns [d1, d2, cellId]
function voro(u, v, N, s = 0, jit = 0.9) {
  const x = u * N, y = v * N, xi = Math.floor(x), yi = Math.floor(y);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
    const px = cx + 0.5 + (hash(wx, wy, s) - 0.5) * jit, py = cy + 0.5 + (hash(wx, wy, s + 9) - 0.5) * jit;
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = hash(wx, wy, s + 3); } else if (d < d2) d2 = d;
  }
  return [d1, d2, id];
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// each generator returns luminance (number) or [r,g,b] for coords u,v in [0,1)
const G = {
  plain: (u, v) => 0.5 + (fbm(u, v, 16, 3, 1) - 0.5) * 0.18 + (hash(u * S | 0, v * S | 0, 2) - 0.5) * 0.08,
  adobe: (u, v) => {
    let l = 0.5 + (fbm(u, v, 6, 4, 3) - 0.5) * 0.35;
    const course = Math.abs(((v * 10) % 1) - 0.5);
    l -= sm(0.47, 0.5, course) * 0.06 * fbm(u, v, 8, 2, 4);
    if (hash(u * S | 0, v * S | 0, 5) > 0.985) l += 0.12; // straw specks
    if (hash(u * S | 0, v * S | 0, 6) > 0.99) l -= 0.15;
    const cr = Math.abs(fbm(u, v, 5, 3, 7) - 0.5);
    l -= sm(0.012, 0.0, cr) * 0.18;
    return l;
  },
  plaster: (u, v) => {
    let l = 0.5 + (fbm(u, v, 4, 4, 11) - 0.5) * 0.18;
    const streak = fbm(u * 1, v * 0.15, 12, 3, 12);
    l -= sm(0.55, 0.75, streak) * 0.12 * (1 - v * 0.6);
    l += (hash(u * S | 0, v * S | 0, 13) - 0.5) * 0.05;
    return l;
  },
  stone: (u, v) => {
    const [d1, d2, id] = voro(u + (fbm(u, v, 8, 2, 21) - 0.5) * 0.05, v, 6, 20, 0.95);
    const mortar = sm(0.06, 0.13, d2 - d1);
    let l = 0.32 + mortar * (0.22 + id * 0.18) + (fbm(u, v, 24, 3, 22) - 0.5) * 0.12;
    return [l * 1.02, l, l * 0.96];
  },
  brick: (u, v) => {
    const rows = 16, cols = 6;
    const ry = v * rows, row = Math.floor(ry);
    const rx = u * cols + (row % 2) * 0.5, colI = Math.floor(rx);
    const fy = ry - row, fx = rx - colI;
    const mortar = Math.min(sm(0.0, 0.1, fy), sm(1.0, 0.9, fy), sm(0, 0.035, fx), sm(1, 0.965, fx));
    const id = hash(((colI % cols) + cols) % cols, row, 31);
    const brick = 0.42 + id * 0.16 + (fbm(u, v, 32, 2, 32) - 0.5) * 0.12;
    const m = 0.62 + (hash(u * S | 0, v * S | 0, 33) - 0.5) * 0.06;
    const l = m + (brick - m) * mortar;
    return [l * 1.04, l * 0.98, l * 0.94];
  },
  concrete: (u, v) => {
    let l = 0.5 + (fbm(u, v, 5, 4, 41) - 0.5) * 0.2;
    if (hash(u * S | 0, v * S | 0, 42) > 0.975) l -= 0.18;
    const lift = Math.abs(((v * 5) % 1) - 0.5);
    l -= sm(0.485, 0.5, lift) * 0.08;
    l -= sm(0.55, 0.8, fbm(u * 0.8, v * 0.2, 10, 3, 43)) * 0.1 * (1 - v);
    return l;
  },
  block: (u, v) => {
    const rows = 8, cols = 4;
    const ry = v * rows, row = Math.floor(ry);
    const rx = u * cols + (row % 2) * 0.5, c = Math.floor(rx);
    const fy = ry - row, fx = rx - c;
    const mortar = Math.min(sm(0, 0.05, fy), sm(1, 0.95, fy), sm(0, 0.025, fx), sm(1, 0.975, fx));
    const id = hash(((c % cols) + cols) % cols, row, 51);
    let b = 0.5 + id * 0.1 + (fbm(u, v, 40, 2, 52) - 0.5) * 0.15;
    if (hash(u * S | 0, v * S | 0, 53) > 0.96) b -= 0.15;
    return 0.33 + (b - 0.33) * mortar;
  },
  wood: (u, v) => {
    const planks = 6, pu = u * planks, p = Math.floor(pu), f = pu - p;
    const gap = Math.min(sm(0, 0.05, f), sm(1, 0.95, f));
    const id = hash(p % planks, 0, 61);
    const grain = Math.sin((f * 6 + fbm(u, v, 4, 3, 62 + p) * 8) * Math.PI) * 0.05;
    let l = 0.42 + id * 0.18 + grain + (fbm(u * 3, v * 0.3, 16, 3, 63) - 0.5) * 0.15;
    const knot = vn(u * 12, v * 3, 12, 64);
    if (knot > 0.82) l -= (knot - 0.82) * 1.2;
    l = 0.2 + (l - 0.2) * gap;
    return [l * 1.05, l, l * 0.92];
  },
  corrugated: (u, v) => {
    const wave = Math.sin(u * 24 * Math.PI) * 0.5 + 0.5;
    let l = 0.42 + wave * 0.2 + (fbm(u, v, 6, 3, 71) - 0.5) * 0.1;
    const rust = sm(0.55, 0.75, fbm(u * 2, v * 0.4, 8, 4, 72));
    const seam = sm(0.49, 0.5, Math.abs(((u * 2) % 1) - 0.5));
    l -= seam * 0.1;
    if (hash(u * S | 0, v * 24 | 0, 73) > 0.995) l -= 0.2; // nail rows
    return [l * (1 + rust * 0.35), l * (1 - rust * 0.05), l * (1 - rust * 0.35)];
  },
  roof_tile: (u, v) => {
    const cols = 6, rows = 6;
    const cu = u * cols, ci = Math.floor(cu), fu = cu - ci;
    const rv = v * rows + (ci % 2) * 0.15, ri = Math.floor(rv), fv = rv - ri;
    const arc = Math.sin(fu * Math.PI);
    const id = hash(ci, ((ri % rows) + rows) % rows, 81);
    let l = 0.32 + arc * 0.32 + id * 0.12 - sm(0.8, 1, fv) * 0.18;
    l += (fbm(u, v, 20, 2, 82) - 0.5) * 0.08;
    return [l * 1.05, l * 0.98, l * 0.92];
  },
  thatch: (u, v) => {
    const strands = vn(u * 90, v * 4, 90, 91) * 0.6 + vn(u * 180, v * 6, 180, 92) * 0.4;
    const layers = Math.abs(((v * 7 + vn(u * 6, 0, 6, 93) * 0.3) % 1) - 0.5);
    return 0.34 + strands * 0.35 - sm(0.42, 0.5, layers) * 0.15;
  },
  slab: (u, v) => {
    let l = 0.5 + (fbm(u, v, 3, 5, 101) - 0.5) * 0.25;
    const cr = Math.abs(fbm(u, v, 4, 3, 102) - 0.5);
    l -= sm(0.01, 0.0, cr) * 0.2;
    return l;
  },
  sand: (u, v) => {
    const warp = fbm(u, v, 3, 3, 111) * 0.6;
    const rip = Math.sin((v * 22 + warp * 6 + u * 2) * Math.PI) * 0.035;
    let l = 0.5 + (fbm(u, v, 8, 4, 112) - 0.5) * 0.18 + rip + (hash(u * S | 0, v * S | 0, 113) - 0.5) * 0.1;
    if (hash(u * 128 | 0, v * 128 | 0, 114) > 0.992) l -= 0.18;
    return [l * 1.01, l, l * 0.98];
  },
  dirt: (u, v) => {
    let l = 0.5 + (fbm(u, v, 6, 4, 121) - 0.5) * 0.3 + (hash(u * S | 0, v * S | 0, 122) - 0.5) * 0.12;
    const [d1, , id] = voro(u, v, 20, 123, 1);
    if (d1 < 0.18 && id > 0.6) l += (id - 0.5) * 0.35 * sm(0.18, 0.08, d1);
    return l;
  },
  rock: (u, v) => {
    const [d1, d2, id] = voro(u, v, 5, 131, 1);
    let l = 0.42 + id * 0.2 + (fbm(u, v, 10, 4, 132) - 0.5) * 0.3;
    l -= sm(0.05, 0.0, d2 - d1) * 0.25;
    return l;
  },
  asphalt: (u, v) => {
    let l = 0.5 + (fbm(u, v, 8, 3, 141) - 0.5) * 0.15;
    const h = hash(u * S | 0, v * S | 0, 142);
    if (h > 0.93) l += 0.25; else if (h < 0.05) l -= 0.2;
    const cr = Math.abs(fbm(u, v, 3, 4, 143) - 0.5);
    l -= sm(0.008, 0.0, cr) * 0.3;
    return l;
  },
  bark: (u, v) => {
    const ridge = Math.abs(Math.sin((u * 10 + fbm(u, v, 4, 3, 151) * 2) * Math.PI));
    return 0.3 + ridge * 0.35 + (fbm(u, v * 4, 10, 3, 152) - 0.5) * 0.2;
  },
  cactus: (u, v) => {
    const rib = Math.abs(Math.sin(u * 8 * Math.PI));
    let l = 0.38 + rib * 0.25 + (fbm(u, v, 8, 3, 161) - 0.5) * 0.1;
    if (hash(u * 64 | 0, v * 48 | 0, 162) > 0.9 && rib > 0.9) l += 0.25;
    return l;
  },
  azulejo: (u, v) => { // decorative tile — colours carried by the texture
    const n = 4, tu = (u * n) % 1, tv = (v * n) % 1;
    const x = tu - 0.5, y = tv - 0.5, r = Math.hypot(x, y);
    const grout = Math.min(sm(0, 0.03, tu), sm(1, 0.97, tu), sm(0, 0.03, tv), sm(1, 0.97, tv));
    const petal = Math.abs(Math.cos(Math.atan2(y, x) * 2)) * 0.32;
    let c = [0.92, 0.88, 0.78];
    if (r < petal) c = [0.18, 0.32, 0.62];
    if (r < 0.08) c = [0.85, 0.62, 0.15];
    if (Math.abs(r - 0.42) < 0.03) c = [0.18, 0.32, 0.62];
    const age = 0.9 + (fbm(u, v, 8, 2, 171) - 0.5) * 0.15;
    return c.map((k) => (0.55 + (k - 0.55) * grout) * age * 0.55);
  },
  limewash: (u, v) => {
    const strokes = fbm(u * 0.4, v * 3, 6, 3, 181);
    return 0.5 + (strokes - 0.5) * 0.12 + (fbm(u, v, 3, 4, 182) - 0.5) * 0.1;
  },
  metal: (u, v) => {
    let l = 0.5 + (vn(u * 2, v * 160, 160, 191) - 0.5) * 0.06 + (fbm(u, v, 4, 4, 192) - 0.5) * 0.18;
    const sc = Math.abs(fbm(u, v, 6, 3, 193) - 0.5);
    l += sm(0.006, 0, sc) * 0.12;
    return l;
  },
  fabric: (u, v) => 0.5 + (Math.sin(u * S * 0.9) * Math.sin(v * S * 0.9)) * 0.06 + (fbm(u, v, 6, 3, 201) - 0.5) * 0.18,
  gravel: (u, v) => {
    const [d1, , id] = voro(u, v, 28, 211, 1);
    return 0.36 + id * 0.3 * sm(0.45, 0.25, d1) + (hash(u * S | 0, v * S | 0, 212) - 0.5) * 0.1;
  },
  hide: (u, v) => 0.55 - sm(0.55, 0.62, fbm(u, v, 4, 4, 221)) * 0.25 + (vn(u * 128, v * 128, 128, 222) - 0.5) * 0.05,
  mud_roof: (u, v) => {
    let l = 0.5 + (fbm(u, v, 5, 4, 231) - 0.5) * 0.22;
    const [d1, d2] = voro(u, v, 7, 232, 1);
    l -= sm(0.03, 0.0, d2 - d1) * 0.15;
    return l;
  },
  door: (u, v) => {
    const pu = u * 4, f = pu - Math.floor(pu);
    const gap = Math.min(sm(0, 0.06, f), sm(1, 0.94, f));
    const bar = (Math.abs(v - 0.2) < 0.04 || Math.abs(v - 0.8) < 0.04) ? 0.08 : 0;
    const l = 0.42 + (fbm(u * 2, v * 0.3, 16, 3, 241) - 0.5) * 0.2 + bar;
    return 0.22 + (l - 0.22) * gap;
  },
  tilled: (u, v) => {
    const furrow = Math.sin(u * 16 * Math.PI) * 0.5 + 0.5;
    return 0.38 + furrow * 0.22 + (fbm(u, v, 12, 3, 251) - 0.5) * 0.18 + (hash(u * S | 0, v * S | 0, 252) - 0.5) * 0.08;
  },
  scrub: (u, v) => { // dry grass / low scrub cover, greener specks
    let l = 0.5 + (fbm(u, v, 10, 4, 271) - 0.5) * 0.3;
    const blade = vn(u * 180, v * 60, 180, 272), tuft = fbm(u, v, 24, 2, 273);
    l += (blade - 0.5) * 0.18 * sm(0.45, 0.7, tuft);
    const g = sm(0.5, 0.75, fbm(u, v, 14, 3, 274));
    return [l * (1 - 0.06 * g), l * (1 + 0.06 * g), l * (1 - 0.1 * g)];
  },
  urban: (u, v) => { // trampled town ground: packed earth, grit, debris flecks, stains
    let l = 0.5 + (fbm(u, v, 7, 4, 281) - 0.5) * 0.28 + (hash(u * S | 0, v * S | 0, 282) - 0.5) * 0.14;
    const st = fbm(u, v, 4, 3, 283);
    l -= sm(0.6, 0.75, st) * 0.12;
    const h = hash(u * 96 | 0, v * 96 | 0, 284);
    if (h > 0.985) l += 0.22; else if (h < 0.012) l -= 0.22;
    const [d1, , id] = voro(u, v, 12, 285, 1);
    if (id > 0.85 && d1 < 0.12) l -= 0.08; // half-buried stones
    return l;
  },
  cobble: (u, v) => {
    const [d1, d2, id] = voro(u, v, 14, 291, 0.7);
    const edge = sm(0.0, 0.08, d2 - d1);
    let l = 0.25 + edge * (0.3 + id * 0.25) + (fbm(u, v, 20, 2, 292) - 0.5) * 0.1;
    return [l, l * 0.98, l * 0.95];
  },
  pavers: (u, v) => {
    const rows = 8, rv = v * rows, r = Math.floor(rv), fv = rv - r;
    const cu = u * 8 + (r % 2) * 0.5, c = Math.floor(cu), fu = cu - c;
    const id = hash(((c % 8) + 8) % 8, ((r % rows) + rows) % rows, 301);
    const gap = Math.min(sm(0, 0.05, fu), sm(1, 0.95, fu), sm(0, 0.05, fv), sm(1, 0.95, fv));
    let l = 0.32 + gap * (0.22 + id * 0.12) + (fbm(u, v, 10, 3, 302) - 0.5) * 0.12;
    if (id > 0.93) l = 0.3 + (fbm(u, v, 30, 2, 303) - 0.5) * 0.1; // missing paver, dirt showing
    return l;
  },
  // ---- plot surfaces
  saltillo: (u, v) => { // handmade terracotta squares (4×4 per tile), wide light grout, each tile its own tone, mottled
    const n = 4, x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const id = hash(((i % n) + n) % n, ((j % n) + n) % n, 401);
    const g = Math.min(sm(0, 0.045, fx), sm(1, 0.955, fx), sm(0, 0.045, fy), sm(1, 0.955, fy));
    const t = 0.36 + id * 0.26 + (fbm(u, v, 16, 3, 402) - 0.5) * 0.22 - sm(0.3, 0.0, Math.min(fx, fy, 1 - fx, 1 - fy)) * 0.06;
    return t * g + 0.95 * (1 - g);
  },
  encaustic: (u, v) => { // cement tiles (pasta / mosaico): 4×4, a four-fold motif that joins across tiles; colours in the texture
    const n = 4, x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j; if (i % 2) fx = 1 - fx; if (j % 2) fy = 1 - fy; // mirror: motifs meet at the corners
    const cream = [0.78, 0.72, 0.6], red = [0.55, 0.2, 0.13], slate = [0.18, 0.24, 0.28], ochre = [0.72, 0.52, 0.22];
    const g = Math.min(sm(0, 0.02, x - i), sm(1, 0.98, x - i), sm(0, 0.02, y - j), sm(1, 0.98, y - j));
    const r = Math.hypot(fx, fy), r2 = Math.hypot(1 - fx, 1 - fy);
    let c = cream;
    if (r < 0.42) c = red; if (r < 0.3) c = cream; if (r < 0.16) c = slate;
    if (r2 < 0.5 && Math.abs(fx - fy) < 0.12) c = ochre;
    if (Math.abs(fx - 0.5) < 0.04 || Math.abs(fy - 0.5) < 0.04) { if (r > 0.42 && r2 > 0.5) c = slate; }
    const k = 0.92 + (fbm(u, v, 12, 3, 405) - 0.5) * 0.12;
    return c.map((q) => (q * k) * g + 0.55 * (1 - g));
  },
  laja: (u, v) => { // laja flagstone: irregular slabs, wide mortar joints
    const [d1, d2, id] = voro(u, v, 6, 411, 0.85);
    const joint = sm(0.02, 0.07, d2 - d1);
    const t = 0.42 + id * 0.26 + (fbm(u, v, 14, 3, 412) - 0.5) * 0.18;
    return t * joint + 0.22 * (1 - joint);
  },
  herringbone: (u, v) => { // adobe bricks 2×1 in herringbone (cells of 1×1, pattern repeats every 4)
    const n = 8, x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const m = (((i - j) % 4) + 4) % 4; // 0 horizontal left, 1 horizontal right, 2 vertical top, 3 vertical bottom
    const e = 0.07;
    let gx0 = sm(0, e, fx), gx1 = sm(1, 1 - e, fx), gy0 = sm(0, e, fy), gy1 = sm(1, 1 - e, fy);
    if (m === 0) gx1 = 1; if (m === 1) gx0 = 1; if (m === 3) gy1 = 1; if (m === 2) gy0 = 1;
    const g = Math.min(gx0, gx1, gy0, gy1);
    const bi = m === 0 ? [i, j] : m === 1 ? [i - 1, j] : m === 3 ? [i, j] : [i, j - 1];
    const id = hash(((bi[0] % n) + n) % n, ((bi[1] % n) + n) % n, 421 + (m > 1 ? 7 : 0));
    const t = 0.34 + id * 0.24 + (fbm(u, v, 20, 3, 422) - 0.5) * 0.16;
    return t * g + 0.9 * (1 - g);
  },
  lot: (u, v) => { // old parking lot: asphalt aggregate, cracks, oil
    let l = 0.42 + (fbm(u, v, 40, 3, 431) - 0.5) * 0.16 + (fbm(u, v, 6, 3, 432) - 0.5) * 0.12;
    const [d1, d2] = voro(u, v, 5, 433, 0.9); if (d2 - d1 < 0.012) l -= 0.12;
    return l;
  },
  rust: (u, v) => G.metal(u, v),
  drystone: (u, v) => G.stone(u, v),
  fence_wood: (u, v) => G.wood(u, v),
  palm_bark: (u, v) => G.bark(u, v),
  date_bark: (u, v) => G.bark(u, v),
  grime: (u, v) => 0.5 + (fbm(u, v, 3, 5, 311) - 0.5) * 0.5,
  ladrillo: (u, v) => { // handmade fired brick: uneven courses, deep raked joints, each brick its own tone, pitted faces
    const rows = 11, ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const cols = 5, rx = u * cols + hash(((row % rows) + rows) % rows, 0, 71) * 0.9, colI = Math.floor(rx), fx = rx - colI;
    const ci = ((colI % cols) + cols) % cols, ri = ((row % rows) + rows) % rows;
    const jy = 0.07 + hash(ci, ri, 72) * 0.05, jx = 0.03 + hash(ci, ri, 73) * 0.03; // joint widths vary brick to brick
    const inB = Math.min(sm(0, jy, fy), sm(1, 1 - jy * 0.6, fy), sm(0, jx, fx), sm(1, 1 - jx, fx));
    const id = hash(ci, ri, 74), tone = 0.44 + id * 0.2 + (fbm(u, v, 24, 2, 75) - 0.5) * 0.1;
    const pit = hash(u * S | 0, v * S | 0, 76) > 0.985 ? -0.16 : 0, pit2 = fbm(u, v, 64, 1, 77) > 0.78 ? -0.07 : 0;
    const joint = 0.3 + (hash(u * S | 0, v * S | 0, 78) - 0.5) * 0.05; // recessed: the joint reads dark
    const l = joint + (tone + pit + pit2 - joint) * inB;
    return [l * (1 + id * 0.05), l, l * (0.97 - id * 0.03)];
  },
  shingle: (u, v) => {
    const rows = 10, rv = v * rows, r = Math.floor(rv), fv = rv - r;
    const cu = u * 7 + (r % 2) * 0.5, c = Math.floor(cu), fu = cu - c;
    const id = hash(((c % 7) + 7) % 7, ((r % rows) + rows) % rows, 261);
    const l = 0.38 + id * 0.22 + fv * 0.1 - sm(0.85, 1, fv) * 0.15 - sm(0.04, 0, Math.min(fu, 1 - fu)) * 0.12;
    return l;
  },
};

function makeLayer(name) {
  const gen = G[name] || G.plain;
  const N = SG;
  const px = new Float32Array(N * N * 3);
  let sum = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let c = gen(x / N, y / N);
    if (typeof c === 'number') c = [c, c, c];
    const k = (y * N + x) * 3;
    px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2];
    sum += (c[0] + c[1] + c[2]) / 3;
  }
  // normalise mean luminance to 0.5 (except colour-carrying layers)
  const scale = name === 'azulejo' || name === 'encaustic' ? 1 : 0.5 / (sum / (N * N));
  const out = new Uint8Array(S * S * 4);
  const f = S / N;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(y / f) * N + Math.floor(x / f), o = (y * S + x) * 4;
    out[o] = clamp(px[i * 3] * scale) * 255;
    out[o + 1] = clamp(px[i * 3 + 1] * scale) * 255;
    out[o + 2] = clamp(px[i * 3 + 2] * scale) * 255;
    out[o + 3] = 255;
  }
  return out;
}

// layers whose photo hue is dropped entirely: the vertex colour alone sets it (brick: the photo was far too red)
const NEUTRAL_TEX = new Set(['brick', 'ladrillo', 'roof_tile', 'corrugated']);
// user override: image -> linear detail map (keeps hue, normalises brightness to mean 0.5)
function imageToLayer(img, keepColor = true) {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const lin = (v) => Math.pow(v / 255, 2.2);
  let sum = 0;
  const f = new Float32Array(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    f[i * 3] = lin(d[i * 4]); f[i * 3 + 1] = lin(d[i * 4 + 1]); f[i * 3 + 2] = lin(d[i * 4 + 2]);
    sum += (f[i * 3] + f[i * 3 + 1] + f[i * 3 + 2]) / 3;
  }
  const sc = 0.5 / Math.max(1e-4, sum / (S * S));
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const L = (f[i * 3] + f[i * 3 + 1] + f[i * 3 + 2]) / 3;
    for (let k = 0; k < 3; k++) {
      // keep some of the photo's hue (vertex colour carries the rest)
      const v = keepColor ? L + (f[i * 3 + k] - L) * 0.45 : L;
      out[i * 4 + k] = clamp(v * sc) * 255;
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

let ARRAY = null;
export function textureArray() {
  if (ARRAY) return ARRAY;
  const n = LAYER_DEFS.length;
  const data = new Uint8Array(S * S * 4 * n);
  const user = (typeof window !== 'undefined' && window.MAPGEN_TEXTURES) || {};
  // procedural layers only where no user texture replaces them (grey placeholder until the image decodes)
  LAYER_DEFS.forEach(([name], i) => { if (user[name]) data.fill(128, i * S * S * 4, (i + 1) * S * S * 4); else data.set(makeLayer(name), i * S * S * 4); });
  const tex = new THREE.DataArrayTexture(data, S, S, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  ARRAY = tex;
  // user overrides (data URLs registered by textures/_pack.js)
  for (const [name, url] of Object.entries(user)) {
    const i = LAYER_DEFS.findIndex(([nm]) => nm === name);
    if (i < 0) continue;
    const img = new Image();
    img.onload = () => {
      try { data.set(imageToLayer(img, !NEUTRAL_TEX.has(name)), i * S * S * 4); tex.needsUpdate = true; } catch (e) { console.warn('texture override failed', name, e); }
    };
    img.src = url;
  }
  return tex;
}

// ---------------------------------------------------------------- foliage atlas (4x4 cells, alpha)
export const LEAF = { mesquite: 0, palo_verde: 1, pepper: 2, fruit: 3, palm: 4, date_palm: 5, scrub: 6, dry_grass: 7, green_grass: 8, encelia: 9, tumble: 10, vine: 11, elephant: 12, twigs: 13, palm_dead: 14, sage: 15 };
// cells replaced by the packed photo atlas (textures/_foliage.png) when present
const PHOTO_CELLS = [0, 1, 2, 3, 6, 7, 8, 9, 10, 12, 13, 15];
let ATLAS = null;
export function foliageAtlas() {
  if (ATLAS) return ATLAS;
  const C = 512, N = 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = C * N;
  const g = cv.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cell = (i) => [(i % N) * C, Math.floor(i / N) * C];
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const leafCluster = (i, { hue, sat, light, n, size, elong = 2.2, spread = 0.42, twig = null, droop = 0, dark = 12 }) => {
    const [ox, oy] = cell(i);
    g.save(); g.beginPath(); g.rect(ox, oy, C, C); g.clip();
    if (twig) {
      g.strokeStyle = twig; g.lineWidth = 3;
      for (let k = 0; k < 7; k++) {
        g.beginPath(); g.moveTo(ox + C / 2, oy + C * 0.95);
        g.quadraticCurveTo(ox + C / 2 + (rnd() - 0.5) * C * 0.5, oy + C * 0.55, ox + C * (0.15 + rnd() * 0.7), oy + C * (0.12 + rnd() * 0.5));
        g.stroke();
      }
    }
    for (let k = 0; k < n; k++) {
      // gaussian-ish blob distribution, denser in the middle
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread * C;
      const x = ox + C / 2 + Math.cos(a) * r, y = oy + C / 2 + Math.sin(a) * r * 0.9 + droop * (r / C) * C * 0.5;
      const l = light + (rnd() - 0.5) * dark - (y - oy) / C * dark * 0.6;
      g.fillStyle = hsl(hue + (rnd() - 0.5) * 10, sat, l);
      g.beginPath();
      g.ellipse(x, y, size * (0.6 + rnd() * 0.6), size * elong * (0.6 + rnd() * 0.6), rnd() * Math.PI + droop * 1.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };
  leafCluster(LEAF.mesquite, { hue: 75, sat: 30, light: 34, n: 900, size: 4, elong: 2.4, twig: '#4a3a2a' });
  leafCluster(LEAF.palo_verde, { hue: 72, sat: 42, light: 52, n: 500, size: 3, elong: 2.6, spread: 0.45, twig: '#8a9a50' });
  leafCluster(LEAF.pepper, { hue: 80, sat: 32, light: 36, n: 1300, size: 3, elong: 3.2, droop: 0.9 });
  leafCluster(LEAF.fruit, { hue: 95, sat: 35, light: 30, n: 700, size: 6, elong: 1.6 });
  leafCluster(LEAF.scrub, { hue: 70, sat: 25, light: 38, n: 1100, size: 3, elong: 1.5, spread: 0.45 });
  leafCluster(LEAF.sage, { hue: 80, sat: 14, light: 52, n: 1100, size: 3, elong: 1.4, spread: 0.45 });
  leafCluster(LEAF.encelia, { hue: 78, sat: 18, light: 54, n: 900, size: 4, elong: 1.3, spread: 0.43 });
  leafCluster(LEAF.vine, { hue: 90, sat: 38, light: 36, n: 500, size: 9, elong: 1.0 });
  leafCluster(LEAF.elephant, { hue: 85, sat: 30, light: 44, n: 600, size: 3, elong: 2, twig: '#b8a890' });
  // encelia flowers on top
  { const [ox, oy] = cell(LEAF.encelia); for (let k = 0; k < 60; k++) { g.fillStyle = hsl(48, 85, 55); g.beginPath(); g.arc(ox + C * (0.15 + rnd() * 0.7), oy + C * (0.12 + rnd() * 0.6), 5, 0, 7); g.fill(); } }
  // grasses: blades from the bottom
  const blades = (i, hue, sat, light, n, h) => {
    const [ox, oy] = cell(i);
    for (let k = 0; k < n; k++) {
      const x0 = ox + C * (0.2 + rnd() * 0.6), lean = (rnd() - 0.5) * C * 0.5;
      g.strokeStyle = hsl(hue + (rnd() - 0.5) * 8, sat, light + (rnd() - 0.5) * 14);
      g.lineWidth = 2 + rnd() * 3;
      g.beginPath(); g.moveTo(x0, oy + C); g.quadraticCurveTo(x0 + lean * 0.3, oy + C * (1 - h * 0.6), x0 + lean, oy + C * (1 - h * (0.6 + rnd() * 0.4))); g.stroke();
    }
  };
  blades(LEAF.dry_grass, 45, 38, 58, 120, 0.85);
  blades(LEAF.green_grass, 80, 35, 40, 70, 0.95);
  // palm fronds: curved central rib with dense thin leaflets (SA-style feather fronds); base at the bottom
  const frond = (i, hue, sat, light, opt = {}) => {
    const [ox, oy] = cell(i);
    g.save(); g.beginPath(); g.rect(ox, oy, C, C); g.clip();
    g.translate(ox + C / 2, oy + C * 0.99);
    const H = C * 0.97, n = opt.n || 90;
    g.strokeStyle = hsl(hue - 8, sat - 12, light - 10); g.lineWidth = C / 70;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    for (let k = 0; k < n; k++) {
      const t = k / n, y = -H * t;
      for (const sd of [-1, 1]) {
        if (rnd() < (opt.gaps || 0.06)) continue;
        const len = C * (opt.width || 0.46) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)), 0.7) * (0.8 + rnd() * 0.3);
        const lift = len * (opt.lift ?? 0.35), droop = len * (opt.droop ?? 0.25);
        const l = light + (rnd() - 0.5) * 16 + (opt.tipFade ? -t * 10 : 0);
        g.strokeStyle = hsl(hue + (rnd() - 0.5) * 12, sat + (rnd() - 0.5) * 10, l);
        g.lineWidth = C / 150 + rnd() * C / 220;
        g.beginPath(); g.moveTo(0, y);
        g.quadraticCurveTo(sd * len * 0.5, y - lift, sd * len, y - lift + droop);
        g.stroke();
      }
    }
    g.restore();
  };
  frond(LEAF.palm, 70, 22, 26, { n: 70, width: 0.48, lift: 0.5, droop: 0.15, gaps: 0.12 });
  frond(LEAF.date_palm, 72, 20, 27, { n: 100, width: 0.42, lift: 0.3, droop: 0.32, tipFade: true, gaps: 0.14 });
  frond(LEAF.palm_dead, 38, 40, 42, { n: 90, width: 0.34, lift: 0.1, droop: 0.45, gaps: 0.2 });

  // tumbleweed / twigs
  const twigs = (i, color, n) => {
    const [ox, oy] = cell(i);
    g.strokeStyle = color; g.lineWidth = 2;
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.28, r = rnd() * C * 0.42;
      g.beginPath(); g.moveTo(ox + C / 2 + Math.cos(a) * r, oy + C / 2 + Math.sin(a) * r);
      const b = a + (rnd() - 0.5) * 2, r2 = rnd() * C * 0.45;
      g.lineTo(ox + C / 2 + Math.cos(b) * r2, oy + C / 2 + Math.sin(b) * r2); g.stroke();
    }
  };
  twigs(LEAF.tumble, '#a08a62', 260);
  // branch card (GTA-SA style): a forking branch from the bottom centre up, thin twigs and a few leaves at the tips
  {
    const [ox, oy] = cell(LEAF.twigs);
    const leafC = ['#4a6a32', '#5a7a3a', '#3e5a2c'];
    const br = (x, y, a, len, w, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.strokeStyle = d < 2 ? '#5e4c3a' : '#6e5c48'; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ox + x, oy + y); g.quadraticCurveTo(ox + (x + x2) / 2 + (rnd() - 0.5) * len * 0.2, oy + (y + y2) / 2, ox + x2, oy + y2); g.stroke();
      if (d >= 5 || w < 0.9) { for (let k = 0; k < 3; k++) { g.fillStyle = leafC[Math.floor(rnd() * 3)]; g.beginPath(); g.ellipse(ox + x2 + (rnd() - 0.5) * 10, oy + y2 + (rnd() - 0.5) * 10, 5, 2.6, rnd() * 3, 0, 6.28); g.fill(); } return; }
      const n = d < 1 ? 3 : 2;
      for (let k = 0; k < n; k++) br(x2, y2, a + (k - (n - 1) / 2) * (0.5 + rnd() * 0.35) + (rnd() - 0.5) * 0.3, len * (0.62 + rnd() * 0.18), w * 0.62, d + 1);
    };
    br(C / 2, C - 4, -Math.PI / 2 + (rnd() - 0.5) * 0.2, C * 0.3, 7, 0);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.premultiplyAlpha = false;
  ATLAS = tex;
  const photo = typeof window !== 'undefined' && window.MAPGEN_TEXTURES?._foliage;
  if (photo) {
    const img = new Image();
    img.onload = () => {
      const s = img.width / N;
      for (const i of PHOTO_CELLS) {
        const [x, y] = cell(i);
        g.clearRect(x, y, C, C);
        g.drawImage(img, (i % N) * s, Math.floor(i / N) * s, s, s, x, y, C, C);
      }
      tex.needsUpdate = true;
    };
    img.src = photo;
  }
  return tex;
}
export const atlasUV = (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4, 1 / 4]; // u0, v0, size (flipY)

// ---------------------------------------------------------------- particle sprites
let SPRITES = null;
export function spriteTextures() {
  if (SPRITES) return SPRITES;
  const mk = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; draw(cv.getContext('2d')); const t = new THREE.CanvasTexture(cv); return t; };
  SPRITES = {
    glow: mk((g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
    puff: mk((g) => {
      for (let i = 0; i < 9; i++) {
        const x = 32 + (Math.random() - 0.5) * 22, y = 32 + (Math.random() - 0.5) * 22, r = 10 + Math.random() * 12;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      }
    }),
    streak: mk((g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(30, 0, 3, 64); }),
    grain: mk((g) => { for (let i = 0; i < 14; i++) { const x = 8 + Math.random() * 48, y = 20 + Math.random() * 24; g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`; g.fillRect(x, y, 2 + Math.random() * 7, 1.5); } }),
    bird: mk((g) => { g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(6, 26); g.quadraticCurveTo(20, 18, 32, 32); g.quadraticCurveTo(44, 18, 58, 26); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(32, 33, 4, 3, 0, 0, 7); g.fill(); }),
    tumble: mk((g) => { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.4; for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 20; g.beginPath(); g.arc(32 + Math.cos(a) * 3, 32 + Math.sin(a) * 3, r, a, a + 1 + Math.random() * 1.6); g.stroke(); } }),
    flame: mk((g) => { const gr = g.createRadialGradient(32, 40, 0, 32, 40, 26); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,160,60,0.8)'); gr.addColorStop(1, 'rgba(200,60,20,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(32, 38, 16, 26, 0, 0, 7); g.fill(); }),
  };
  return SPRITES;
}

// ---------------------------------------------------------------- murals (finishes)
export function muralTexture(kind, palette, rngNext, w = 512, h = 256) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const [bg, c1, c2, c3, c4] = palette;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const r = rngNext;
  if (kind === 'sea') { g.fillStyle = '#2f5a78'; g.fillRect(0, 0, w, h); }
  if (kind === 'landscape') {
    // sun, mountains, agaves, a road — desert-ish, stylised
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, c3); sky.addColorStop(1, bg);
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
    g.fillStyle = c1; g.beginPath(); g.arc(w * (0.25 + r() * 0.5), h * 0.36, h * 0.16, 0, 7); g.fill();
    g.strokeStyle = c1; g.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const cx = w * 0.5, cy = h * 0.36; }
    g.fillStyle = c2; g.beginPath(); g.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.38 + r() * 0.2));
    g.lineTo(w, h * 0.62); g.fill();
    g.fillStyle = c4; g.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 5; i++) { // agaves
      const x = w * (0.08 + i * 0.21 + r() * 0.05), y = h * 0.9;
      g.fillStyle = c2;
      for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + Math.cos(a) * 40, y + Math.sin(a) * 50); g.lineTo(x + 5, y); g.fill(); }
    }
  } else if (kind === 'geometric') {
    // stepped frets and zigzag bands
    const bands = 5;
    for (let b = 0; b < bands; b++) {
      const y0 = (h / bands) * b, bh = h / bands;
      g.fillStyle = [c1, c2, c3, c4, c1][b];
      g.fillRect(0, y0 + bh * 0.1, w, bh * 0.8);
      g.fillStyle = bg;
      const step = bh * 0.8;
      for (let x = (b % 2) * step * 0.5; x < w; x += step * 1.2) {
        if (b % 2) { g.beginPath(); g.moveTo(x, y0 + bh * 0.9); g.lineTo(x + step * 0.5, y0 + bh * 0.1); g.lineTo(x + step, y0 + bh * 0.9); g.fill(); }
        else { g.fillRect(x, y0 + bh * 0.3, step * 0.3, bh * 0.4); g.fillRect(x + step * 0.3, y0 + bh * 0.2, step * 0.3, bh * 0.25); }
      }
    }
  } else if (kind === 'sea') {
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = [c1, '#e6dcc4', c3][i % 3]; g.lineWidth = 12;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.1 + i * 0.1) + Math.sin(x / 30 + i) * 12);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) { // fish
      const x = w * r(), y = h * (0.3 + r() * 0.5);
      g.fillStyle = c4; g.beginPath(); g.ellipse(x, y, 26, 10, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - 24, y); g.lineTo(x - 40, y - 10); g.lineTo(x - 40, y + 10); g.fill();
    }
  } else { // 'saint' — abstract figure with halo and rays, folk-style
    g.fillStyle = c3; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.moveTo(w / 2, h * 0.45); g.lineTo(w / 2 + Math.cos(a) * w, h * 0.45 + Math.sin(a) * w); g.lineTo(w / 2 + Math.cos(a + 0.12) * w, h * 0.45 + Math.sin(a + 0.12) * w); g.fill(); }
    g.fillStyle = c1; g.beginPath(); g.arc(w / 2, h * 0.3, h * 0.13, 0, 7); g.fill();
    g.fillStyle = c2; g.beginPath(); g.moveTo(w / 2, h * 0.38); g.lineTo(w / 2 - h * 0.22, h * 0.98); g.lineTo(w / 2 + h * 0.22, h * 0.98); g.fill();
    g.fillStyle = c4; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(w * (0.05 + r() * 0.9), h * (0.75 + r() * 0.22), 9, 0, 7); g.fill(); }
  }
  // weathering
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${160 + r() * 40},${0.03 + r() * 0.09})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 30, 2 + r() * 10);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- small-plant atlas (4x4, alpha)
// Pots, beds, roof gardens, flower boxes, crops in yards, ground clutter: everything leafy that isn't a
// tree. Drawn procedurally (painted-texture look, GTA-SA era). Builder 'leaf' cards use cells 0..15 of
// this atlas (uv.x offset by +1 in the mesh) or 16..31 for the tree atlas.
export const PLANT = { herb: 0, geranium: 1, bougainvillea: 2, marigold: 3, chile: 4, aloe: 5, sansevieria: 6, ivy: 7, tomato: 8, lettuce: 9, grass: 10, weed: 11, litter: 12, pebbles: 13, flowers: 14, shrub: 15 };
let PLANTS = null;
export function plantAtlas() {
  if (PLANTS) return PLANTS;
  const C = 512, N = 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = C * N;
  const g = cv.getContext('2d');
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  const cell = (i, fn) => { const ox = (i % N) * C, oy = Math.floor(i / N) * C; g.save(); g.beginPath(); g.rect(ox, oy, C, C); g.clip(); g.translate(ox, oy); fn(); g.restore(); };
  // a leaf: pointed ellipse along an angle
  const leaf = (x, y, len, wid, ang, fill, vein) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
    if (vein) { g.strokeStyle = vein; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.9, 0); g.stroke(); }
    g.restore();
  };
  const stems = (n, color, spread = 0.38, top = 0.25) => { g.strokeStyle = color; g.lineWidth = 3; for (let k = 0; k < n; k++) { g.beginPath(); g.moveTo(C / 2 + (rnd() - 0.5) * 30, C); g.quadraticCurveTo(C / 2 + (rnd() - 0.5) * C * spread, C * 0.6, C * (0.5 + (rnd() - 0.5) * spread * 2), C * (top + rnd() * 0.3)); g.stroke(); } };
  // bushy clump of leaves, densest in the middle, darker underneath
  const bush = (n, hue, sat, light, len, wid, opt = {}) => {
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * C * (opt.spread || 0.36);
      const x = C / 2 + Math.cos(a) * r, y = C * (opt.cy || 0.52) + Math.sin(a) * r * (opt.flat || 0.85);
      const l = light + (rnd() - 0.5) * 14 - ((y / C) - 0.5) * 18;
      leaf(x, y, len * (0.7 + rnd() * 0.6), wid * (0.7 + rnd() * 0.6), rnd() * Math.PI * 2, hsl(hue + (rnd() - 0.5) * 10, sat, l), opt.vein ? hsl(hue, sat - 10, l - 12) : null);
    }
  };
  const blossoms = (n, colors, r0, r1, area = [0.15, 0.85, 0.12, 0.62]) => { for (let k = 0; k < n; k++) { const x = C * (area[0] + rnd() * (area[1] - area[0])), y = C * (area[2] + rnd() * (area[3] - area[2])), r = r0 + rnd() * (r1 - r0), c = colors[Math.floor(rnd() * colors.length)]; for (let p = 0; p < 6; p++) { g.fillStyle = c; g.beginPath(); g.arc(x + Math.cos(p) * r * 0.55, y + Math.sin(p) * r * 0.55, r * 0.55, 0, 7); g.fill(); } g.fillStyle = 'rgba(60,40,20,0.6)'; g.beginPath(); g.arc(x, y, r * 0.25, 0, 7); g.fill(); } };
  const blades = (n, hue, sat, light, h, w = 4, curl = 0.5) => { for (let k = 0; k < n; k++) { const x0 = C * (0.25 + rnd() * 0.5), lean = (rnd() - 0.5) * C * curl; g.strokeStyle = hsl(hue + (rnd() - 0.5) * 10, sat, light + (rnd() - 0.5) * 16); g.lineWidth = w * (0.6 + rnd() * 0.8); g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, C); g.quadraticCurveTo(x0 + lean * 0.3, C * (1 - h * 0.6), x0 + lean, C * (1 - h * (0.55 + rnd() * 0.45))); g.stroke(); } };

  cell(PLANT.herb, () => { stems(14, '#4a5432', 0.3, 0.3); bush(420, 88, 24, 31, 26, 13, { spread: 0.34, vein: true }); });
  cell(PLANT.geranium, () => { stems(10, '#4a5a2a', 0.3, 0.25); bush(160, 90, 24, 28, 34, 26, { spread: 0.36, cy: 0.58 }); blossoms(16, ['#d8243a', '#e8405a', '#c81a2a'], 16, 26, [0.2, 0.8, 0.12, 0.5]); });
  cell(PLANT.bougainvillea, () => { g.strokeStyle = '#5a4a32'; g.lineWidth = 4; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(C / 2, C); g.bezierCurveTo(C * rnd(), C * 0.5, C * rnd(), C * 0.3, C * (0.05 + rnd() * 0.9), C * (0.05 + rnd() * 0.6)); g.stroke(); } bush(260, 90, 24, 29, 22, 13, { spread: 0.42, cy: 0.45 }); for (let k = 0; k < 420; k++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * C * 0.42; leaf(C / 2 + Math.cos(a) * r, C * 0.42 + Math.sin(a) * r * 0.8, 16, 11, rnd() * 6.28, hsl(318 + (rnd() - 0.5) * 16, 70, 48 + (rnd() - 0.5) * 14)); } });
  cell(PLANT.marigold, () => { stems(12, '#4a6a2a', 0.34, 0.35); bush(300, 88, 26, 31, 18, 6, { spread: 0.34, cy: 0.6 }); blossoms(22, ['#f09a10', '#f0b020', '#e07a10'], 14, 22, [0.18, 0.82, 0.2, 0.6]); });
  cell(PLANT.chile, () => { stems(10, '#3e5a26', 0.32, 0.25); bush(240, 90, 26, 30, 30, 12, { spread: 0.36, vein: true }); for (let k = 0; k < 26; k++) { const x = C * (0.2 + rnd() * 0.6), y = C * (0.3 + rnd() * 0.45); leaf(x, y, 34, 7, Math.PI / 2 + (rnd() - 0.5) * 0.6, rnd() < 0.7 ? hsl(2, 80, 42) : hsl(95, 50, 34)); } });
  cell(PLANT.aloe, () => { for (let k = 0; k < 22; k++) { const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.4, len = C * (0.35 + rnd() * 0.5); g.save(); g.translate(C / 2, C * 0.98); g.rotate(ang + Math.PI / 2); g.fillStyle = hsl(128 + (rnd() - 0.5) * 20, 13, 44 + (rnd() - 0.5) * 12); g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-8, -len * 0.6, 0, -len); g.quadraticCurveTo(8, -len * 0.6, 14, 0); g.fill(); g.restore(); } });
  cell(PLANT.sansevieria, () => { for (let k = 0; k < 16; k++) { const x = C * (0.3 + rnd() * 0.4), h = C * (0.45 + rnd() * 0.5), lean = (rnd() - 0.5) * 60; g.fillStyle = hsl(100, 20, 30 + rnd() * 10); g.beginPath(); g.moveTo(x - 16, C); g.quadraticCurveTo(x - 14 + lean * 0.5, C - h * 0.6, x + lean, C - h); g.quadraticCurveTo(x + 14 + lean * 0.5, C - h * 0.6, x + 16, C); g.fill(); g.strokeStyle = hsl(70, 40, 60, 0.6); g.lineWidth = 3; g.beginPath(); g.moveTo(x - 14, C); g.quadraticCurveTo(x - 12 + lean * 0.5, C - h * 0.6, x + lean, C - h); g.stroke(); } });
  cell(PLANT.ivy, () => { g.strokeStyle = '#4a3a2a'; g.lineWidth = 3; for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(C * rnd(), C); g.bezierCurveTo(C * rnd(), C * 0.6, C * rnd(), C * 0.3, C * rnd(), 0); g.stroke(); } for (let k = 0; k < 900; k++) { const x = C * rnd(), y = C * rnd(); if (rnd() < 0.18 && y < C * 0.25) continue; leaf(x, y, 22, 14, rnd() * 6.28, hsl(98 + (rnd() - 0.5) * 16, 26, 25 + rnd() * 16)); } });
  cell(PLANT.tomato, () => { stems(16, '#4a6a2a', 0.36, 0.2); bush(380, 90, 25, 29, 24, 11, { spread: 0.38, vein: true }); for (let k = 0; k < 18; k++) { const x = C * (0.2 + rnd() * 0.6), y = C * (0.3 + rnd() * 0.45), r = 12 + rnd() * 9; g.fillStyle = rnd() < 0.75 ? hsl(6, 78, 44) : hsl(80, 50, 42); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, 7); g.fill(); } });
  cell(PLANT.lettuce, () => { for (let ring = 5; ring >= 0; ring--) { const n = 6 + ring * 2; for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + ring * 0.4, r = ring * 34; leaf(C / 2 + Math.cos(a) * r * 0.3, C / 2 + Math.sin(a) * r * 0.3, 70 + ring * 18, 40 + ring * 6, a, hsl(95 - ring * 2, 45, 52 - ring * 4)); } } });
  cell(PLANT.grass, () => { blades(90, 75, 30, 44, 0.75, 5, 0.6); blades(40, 48, 35, 58, 0.6, 4, 0.7); });
  cell(PLANT.weed, () => { blades(50, 42, 30, 52, 0.85, 3, 0.4); for (let k = 0; k < 30; k++) { const x = C * (0.2 + rnd() * 0.6), y = C * (0.08 + rnd() * 0.35); g.fillStyle = hsl(38, 35, 62); g.beginPath(); g.ellipse(x, y, 6, 14, rnd(), 0, 7); g.fill(); } });
  cell(PLANT.litter, () => { for (let k = 0; k < 160; k++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * C * 0.47; leaf(C / 2 + Math.cos(a) * r, C / 2 + Math.sin(a) * r, 26, 11, rnd() * 6.28, hsl(30 + rnd() * 25, 40, 30 + rnd() * 25)); } });
  cell(PLANT.pebbles, () => { for (let k = 0; k < 90; k++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * C * 0.46, x = C / 2 + Math.cos(a) * r, y = C / 2 + Math.sin(a) * r, s = 6 + rnd() * 16; g.fillStyle = hsl(35, 10 + rnd() * 10, 45 + rnd() * 25); g.beginPath(); g.ellipse(x, y, s, s * (0.6 + rnd() * 0.4), rnd() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x + 2, y + 3, s, s * 0.5, 0, 0, 7); g.fill(); } });
  cell(PLANT.flowers, () => { stems(20, '#4a6a2a', 0.4, 0.25); bush(220, 90, 25, 30, 20, 9, { spread: 0.38, cy: 0.62 }); blossoms(30, ['#e84a8a', '#f0d040', '#f07a30', '#f0f0e8', '#a050c0', '#e83a3a'], 13, 22, [0.12, 0.88, 0.12, 0.6]); });
  cell(PLANT.shrub, () => { bush(800, 88, 24, 28, 22, 11, { spread: 0.44, cy: 0.5 }); });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.premultiplyAlpha = false;
  PLANTS = tex;
  return tex;
}
// UVs for builder leaf cards: cells 0..15 = plant atlas (u + 1), 16..31 = tree atlas
export const leafUV = (cell) => { const i = cell % 16, u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 4; return [u0 + (cell < 16 ? 1 : 0), v0, 0.25]; };

// ---------------------------------------------------------------- water tile (old-school scrolling water)
// Seamless 256² tile: R = ripple height, G = bright crest lines, B = foam / scum mottling.
let WATERTEX = null;
export function waterTexture() {
  if (WATERTEX) return WATERTEX;
  const S = 256, data = new Uint8Array(S * S * 4);
  const waves = [[3, 1, 0.3], [1, 4, 1.7], [5, -2, 2.9], [-2, 5, 4.1], [7, 3, 0.9], [2, -7, 5.3], [9, 5, 2.2], [-6, 8, 3.7]];
  const foamW = [[4, 6, 1.1], [11, -3, 2.4], [-8, 9, 0.7], [13, 12, 3.3], [17, -9, 4.4]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    let h = 0; for (const [a, b, p] of waves) h += Math.cos(a * u + b * v + p) / Math.hypot(a, b);
    let f = 0; for (const [a, b, p] of foamW) f += Math.cos(a * u + b * v + p + Math.sin(u * 2 + p) * 0.8);
    const hn = h / 2.2, crest = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(h * 2.6))), 10);
    const k = (y * S + x) * 4;
    data[k] = Math.max(0, Math.min(255, 128 + hn * 110));
    data[k + 1] = Math.max(0, Math.min(255, crest * 255));
    data[k + 2] = Math.max(0, Math.min(255, 128 + f * 40));
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  WATERTEX = t;
  return t;
}

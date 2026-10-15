// Baja flora. Woody parts / cacti are textured low-poly geometry; foliage is alpha-tested
// leaf cards (crossed quads, GTA-SA style) with fake spherical normals. Everything is instanced
// and gets per-instance baked light.
import * as THREE from 'three';
import { Builder, col } from './builder.js';
import { RNG, makeNoise, smooth } from './rng.js';
import { nearestWithin } from './geo.js';
import { LEAF, atlasUV } from './textures.js';
import { MATS } from './materials.js';
import { betterCacti } from './veg2.js';
import { tube } from './shapes.js';

// ---------------------------------------------------------------- card builder
class Cards {
  constructor() { this.P = []; this.N = []; this.UV = []; this.C = []; }
  // vertical card centred at c, facing yaw; normals point away from `ctr` (fake sphere)
  card(c, w, h, yaw, cell, ctr, tint = [1, 1, 1], pitch = 0, flip = false) {
    const [u0, v0, s] = atlasUV(cell);
    const cx = Math.cos(yaw), sz = -Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // local corners: x across, y up (pitched toward the facing normal)
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const corner = (a, b) => [c[0] + cx * a * w / 2 + nx * sp * b * h / 2, c[1] + cp * b * h / 2, c[2] + sz * a * w / 2 + nz * sp * b * h / 2];
    const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const uvs = flip ? [[u0 + s, v0], [u0, v0], [u0, v0 + s], [u0 + s, v0 + s]] : [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const p = pts[idx];
      this.P.push(...p);
      let n = [p[0] - ctr[0], p[1] - ctr[1] + 0.25, p[2] - ctr[2]];
      const l = Math.hypot(...n) || 1;
      this.N.push(n[0] / l, n[1] / l, n[2] / l);
      this.UV.push(...uvs[idx]);
      this.C.push(...tint);
    }
  }
  // horizontal card (looking down)
  flat(c, w, cell, ctr, tint = [1, 1, 1], yaw = 0) {
    const [u0, v0, s] = atlasUV(cell);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + (a * cs - b * sn) * w / 2, c[1], c[2] + (a * sn + b * cs) * w / 2]);
    const uvs = [[u0, v0], [u0 + s, v0], [u0 + s, v0 + s], [u0, v0 + s]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const p = pts[idx];
      this.P.push(...p);
      let n = [p[0] - ctr[0], p[1] - ctr[1] + 0.6, p[2] - ctr[2]];
      const l = Math.hypot(...n) || 1;
      this.N.push(n[0] / l, n[1] / l, n[2] / l);
      this.UV.push(...uvs[idx]);
      this.C.push(...tint);
    }
  }
  // a leaf clump: 3 crossed vertical cards + a top card
  clump(c, size, cell, r, tint, hScale = 0.85) {
    const y0 = r.next() * Math.PI;
    for (let k = 0; k < 3; k++) this.card(c, size, size * hScale, y0 + (k * Math.PI) / 3, cell, c, tint, 0, r.chance(0.5));
    this.flat([c[0], c[1] + size * hScale * 0.2, c[2]], size * 0.9, cell, c, tint, r.next() * 6);
  }
  // free quad: corners p0..p3 (p0,p1 bottom → v0; p2,p3 top), normals from ctr (fake sphere)
  quad(p, cell, ctr, tint, vr = [0, 1], up = 0.25) {
    const [u0, v0, s] = atlasUV(cell);
    const uvs = [[u0, v0 + s * vr[0]], [u0 + s, v0 + s * vr[0]], [u0 + s, v0 + s * vr[1]], [u0, v0 + s * vr[1]]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const q = p[idx];
      this.P.push(...q);
      const n = [q[0] - ctr[0], q[1] - ctr[1] + up, q[2] - ctr[2]], l = Math.hypot(...n) || 1;
      this.N.push(n[0] / l, n[1] / l, n[2] / l);
      this.UV.push(...uvs[idx]);
      this.C.push(...tint);
    }
  }
  // bent strip along a spine (palm frond): width per point, `side` = unit vector across the frond, `fold` lifts the edges (V-shape)
  strip(spine, widths, side, cell, ctr, tint, fold = 0.15) {
    const n = spine.length - 1;
    for (let i = 0; i < n; i++) {
      const a = spine[i], b = spine[i + 1], wa = widths[i] / 2, wb = widths[i + 1] / 2;
      const P = (c, w, sg) => [c[0] + side[0] * w * sg, c[1] + Math.abs(w) * fold, c[2] + side[2] * w * sg];
      this.quad([P(a, wa, -1), P(a, wa, 1), P(b, wb, 1), P(b, wb, -1)], cell, ctr, tint, [i / n, (i + 1) / n], 0.6);
    }
  }
  // SA-style spray: cards fanned around a branch, each plane containing the branch direction
  spray(base, dir, len, width, cell, r, tint, ctr, n = 4) {
    const L = Math.hypot(...dir) || 1, d = dir.map((v) => v / L);
    // perpendicular basis
    let px = [-d[2], 0, d[0]]; const pl = Math.hypot(...px) || 1; px = px.map((v) => v / pl);
    const py = [d[1] * px[2] - d[2] * px[1], d[2] * px[0] - d[0] * px[2], d[0] * px[1] - d[1] * px[0]];
    const a0 = r.next() * Math.PI;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * Math.PI) / n, ax = [px[0] * Math.cos(a) + py[0] * Math.sin(a), px[1] * Math.cos(a) + py[1] * Math.sin(a), px[2] * Math.cos(a) + py[2] * Math.sin(a)];
      const w = width * r.range(0.8, 1.15) / 2, l0 = -len * 0.15, l1 = len * r.range(0.9, 1.1);
      const at = (t, sg) => [base[0] + d[0] * t + ax[0] * w * sg, base[1] + d[1] * t + ax[1] * w * sg, base[2] + d[2] * t + ax[2] * w * sg];
      this.quad([at(l0, -1), at(l0, 1), at(l1, 1), at(l1, -1)], cell, ctr, tint, [0, 1], 0.35);
    }
  }
  build() {
    if (!this.P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(new Float32Array(this.P.length / 3), 1));
    return g;
  }
}
const tintOf = (r, base = 1, v = 0.12) => { const k = base * (1 - v / 2 + r.next() * v); return [k, k, k * (0.96 + r.next() * 0.06)]; };

// ---------------------------------------------------------------- species: (b: Builder, c: Cards, r) -> {h, r}
const SP = {};
SP.creosote = (b, c, r) => {
  b.t('bark');
  for (let i = 0; i < 4; i++) b.beam([0, 0, 0], [r.range(-0.5, 0.5), r.range(0.8, 1.3), r.range(-0.5, 0.5)], 0.03, 3, 0x5e4e3a);
  c.clump([0, 0.85, 0], 1.7, LEAF.scrub, r, tintOf(r));
  return { h: 1.4, r: 0.8 };
};
// overgrowth: a big wild mound of mixed scrub where nobody clears — 2.5-4 m across, dead stems poking out, a brown
// dried-out side; 'bramble' is the low spreading kind that climbs fences
SP.overgrowth = (b, c, r) => {
  const W = r.range(1.3, 2.0), H = r.range(1.4, 2.3);
  b.t('bark'); for (let i = 0; i < 7; i++) { const a = r.range(0, 6.28), d = r.range(0.2, W * 0.8); b.beam([Math.cos(a) * d * 0.3, 0, Math.sin(a) * d * 0.3], [Math.cos(a) * d, r.range(H * 0.5, H * 1.1), Math.sin(a) * d], 0.035, 3, 0x5a4a38); }
  const cells = [LEAF.scrub, LEAF.mesquite, LEAF.sage, LEAF.pepper];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + r.range(-0.4, 0.4), d = r.range(0.3, W * 0.65); c.clump([Math.cos(a) * d, H * r.range(0.35, 0.6), Math.sin(a) * d], r.range(1.2, 1.8), r.pick(cells), r, tintOf(r, r.range(0.85, 1)), 0.8); }
  c.clump([0, H * 0.7, 0], r.range(1.6, 2.1), r.pick(cells), r, tintOf(r, 0.9), 0.85);
  if (r.chance(0.7)) c.clump([r.range(-W, W) * 0.5, H * 0.45, r.range(-W, W) * 0.5], 1.3, LEAF.twigs, r, tintOf(r, 0.9), 0.8);
  if (r.chance(0.5)) c.clump([r.range(-W, W) * 0.6, H * 0.3, r.range(-W, W) * 0.6], 1.1, LEAF.dry_grass, r, tintOf(r, 0.9), 0.7);
  return { h: H, r: W };
};
SP.bramble = (b, c, r) => {
  const W = r.range(1.0, 1.6);
  for (let i = 0; i < 5; i++) { const a = r.range(0, 6.28), d = r.range(0.1, W); c.clump([Math.cos(a) * d, r.range(0.35, 0.6), Math.sin(a) * d], r.range(0.9, 1.3), r.pick([LEAF.vine, LEAF.scrub, LEAF.twigs]), r, tintOf(r), 0.6); }
  return { h: 0.9, r: W };
};
// tree tobacco (tabaquillo, Nicotiana glauca): spindly 2-4 m, a few pale grey-green stems, sparse bluish leaves,
// drooping yellow tube flowers at the tips — the classic weed of Baja roadsides and town gaps
SP.tree_tobacco = (b, c, r) => {
  const H = r.range(2.2, 3.8), n = r.int(2, 4), tips = [];
  b.t('bark'); for (let i = 0; i < n; i++) { const a = r.range(0, 6.28), lean = r.range(0.15, 0.5), tip = [Math.cos(a) * lean * H * 0.4, H * r.range(0.75, 1), Math.sin(a) * lean * H * 0.4]; b.beam([0, 0, 0], tip, 0.035, 3, 0x7a8072); tips.push(tip); }
  for (const t of tips) { c.clump([t[0] * 0.8, t[1] * 0.78, t[2] * 0.8], r.range(0.8, 1.1), LEAF.palo_verde, r, tintOf(r, 0.95), 0.9);
    b.t('plain'); for (let k = 0; k < r.int(3, 6); k++) b.box(t[0] + r.range(-0.25, 0.25), t[1] - r.range(0, 0.35), t[2] + r.range(-0.25, 0.25), 0.03, 0.12, 0.03, 0xc8a83a); }
  return { h: H, r: 0.9 };
};
// castor bean (higuerilla): a rank 1.5-3 m shrub of thick reddish stems and big hand-shaped leaves, red seed spikes
SP.castor_bean = (b, c, r) => {
  const H = r.range(1.6, 2.8), red = r.chance(0.5);
  b.t('bark'); for (let i = 0; i < r.int(3, 5); i++) { const a = r.range(0, 6.28), d = r.range(0.2, 0.7); b.beam([0, 0, 0], [Math.cos(a) * d, H * r.range(0.6, 1), Math.sin(a) * d], 0.04, 4, red ? 0x6a3a32 : 0x5a6a42); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + r.range(-0.4, 0.4), d = r.range(0.3, 0.8); c.clump([Math.cos(a) * d, H * r.range(0.55, 0.85), Math.sin(a) * d], r.range(1.1, 1.5), LEAF.fruit, r, red ? tintOf(r, 0.82) : tintOf(r, 0.95), 0.8); }
  b.t('plain'); for (let k = 0; k < r.int(1, 3); k++) b.box(r.range(-0.5, 0.5), H + 0.1, r.range(-0.5, 0.5), 0.08, 0.3, 0.08, red ? 0x8a2a22 : 0x6a7a3a);
  return { h: H, r: 1.0 };
};
SP.sage = (b, c, r) => { c.clump([0, 0.42, 0], 1.25, LEAF.sage, r, tintOf(r), 0.75); return { h: 0.8, r: 0.6 }; };
SP.encelia = (b, c, r) => { c.clump([0, 0.42, 0], 1.15, LEAF.encelia, r, tintOf(r), 0.8); return { h: 0.8, r: 0.55 }; };
SP.agave = (b, c, r) => {
  b.t('cactus');
  const n = 11, cc = 0x7f9a8a;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + r.range(-0.2, 0.2), tilt = r.range(0.45, 1.05);
    b.cone(Math.cos(a) * 0.32, 0.38, Math.sin(a) * 0.32, 0.13, 0.95, 3, col(cc, 0.06, r), Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
  }
  b.cone(0, 0.45, 0, 0.12, 0.8, 3, col(cc, 0.04, r));
  return { h: 0.9, r: 0.6 };
};
SP.agave_bloom = (b, c, r) => {
  SP.agave(b, c, r);
  b.t('bark'); b.beam([0, 0.4, 0], [r.range(-0.3, 0.3), 4.5, r.range(-0.3, 0.3)], 0.07, 4, 0x8a7a50);
  for (let i = 0; i < 4; i++) b.blob(r.range(-0.6, 0.6), 3.6 + i * 0.25, r.range(-0.6, 0.6), 0.3, 0.12, 0.3, 0xc8a840, 'oct');
  return { h: 4.5, r: 0.6 };
};
SP.cholla = (b, c, r) => {
  const cc = 0xb0ae78;
  b.t('bark'); b.cyl(0, 0.5, 0, 0.09, 0.11, 1.0, 5, col(0x7a6a4a, 0.05, r));
  b.t('cactus');
  for (let i = 0; i < 5; i++) {
    const a = r.next() * 6.28, y = r.range(0.7, 1.1), L = r.range(0.35, 0.6);
    const ex = [Math.cos(a) * L, y + r.range(0.1, 0.4), Math.sin(a) * L];
    b.beam([0, y - 0.15, 0], ex, 0.08, 5, col(cc, 0.06, r));
    b.beam(ex, [ex[0] * 1.3, ex[1] + 0.3, ex[2] * 1.3], 0.075, 5, col(cc, 0.06, r));
  }
  return { h: 1.6, r: 0.6 };
};
SP.cardon = (b, c, r) => {
  b.t('cactus');
  const cc = 0x7c8e60, H = r.range(4, 8);
  b.cyl(0, H / 2, 0, 0.32, 0.38, H, 8, col(cc, 0.05, r));
  const arms = r.int(2, 5);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * 6.28 + r.next(), y = r.range(1.2, H * 0.5), out = r.range(0.7, 1.2), top = y + r.range(1.5, H * 0.6);
    b.beam([0, y, 0], [Math.cos(a) * out, y + 0.4, Math.sin(a) * out], 0.24, 7, col(cc, 0.05, r));
    b.cyl(Math.cos(a) * out, (y + 0.4 + top) / 2, Math.sin(a) * out, 0.25, 0.27, top - y - 0.4, 8, col(cc, 0.05, r));
  }
  return { h: H, r: 1 };
};
SP.datilillo = (b, c, r) => {
  const H = r.range(2, 4);
  b.t('bark'); b.cyl(0, H / 2, 0, 0.14, 0.2, H, 5, col(0x6a5a44, 0.05, r));
  const heads = r.int(1, 3);
  for (let i = 0; i < heads; i++) {
    const a = r.next() * 6.28, d = heads > 1 ? r.range(0.4, 0.8) : 0, y = H - (heads > 1 ? r.range(0, 0.6) : 0);
    b.t('bark'); if (d) b.beam([0, y - 0.6, 0], [Math.cos(a) * d, y, Math.sin(a) * d], 0.1, 5, 0x6a5a44);
    b.t('cactus');
    for (let k = 0; k < 9; k++) {
      const aa = (k / 9) * 6.28, t = r.range(0.4, 1.3);
      b.cone(Math.cos(a) * d + Math.cos(aa) * 0.2, y + 0.25, Math.sin(a) * d + Math.sin(aa) * 0.2, 0.05, 0.75, 3, col(0x6f8a5a, 0.06, r), Math.sin(aa) * t, 0, -Math.cos(aa) * t);
    }
  }
  return { h: H + 0.5, r: 0.7 };
};
// Broadleaf tree, GTA SA style: trunk splits into a few limbs; each limb carries a fan of big leaf
// cards (a "spray") pointing outward and up, plus a couple of crown cards. Reads as a tree from any angle.
// broadleaf trees, GTA-SA style: the trunk and its 2-3 main limbs are one model (tapered tubes that grow out of
// each other, no seams), everything finer is alpha cards: branch cards fanned along the limbs, leaf sprays at their
// ends, a few crossed crown cards and a cap
const tree = (b, c, r, { H, trunk, trunkR, cell, clumps, spread, size, tint = 1, lean = 0.3, layer = 'bark', droop = 0 }) => {
  const tc = col(trunk, 0.05, r);
  b.t(layer);
  const fork = [r.range(-lean, lean), H * r.range(0.34, 0.46), r.range(-lean, lean)];
  const pts = [], rad = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([fork[0] * t * t, -0.25 + (fork[1] + 0.25) * t, fork[2] * t * t]); rad.push(trunkR * (1 + 0.5 * Math.exp(-t * 7)) * (1 - 0.15 * t)); }
  tube(b, pts, rad, tc, { seg: 10, cap: false });
  const crown = [fork[0], H * 0.72, fork[2]];
  const nL = r.int(2, 3), limbs = [];
  for (let i = 0; i < nL; i++) {
    const a = (i / nL) * 6.28 + r.range(-0.5, 0.5), d = spread * r.range(0.35, 0.6);
    const tip = [fork[0] + Math.cos(a) * d, H * r.range(0.66, 0.8), fork[2] + Math.sin(a) * d];
    const s0 = [fork[0] * 0.8, fork[1] - trunkR * 1.4, fork[2] * 0.8];
    const m1 = [fork[0] + (tip[0] - fork[0]) * 0.18, fork[1] + (tip[1] - fork[1]) * 0.22, fork[2] + (tip[2] - fork[2]) * 0.18];
    const mid = [fork[0] + (tip[0] - fork[0]) * 0.5, fork[1] + (tip[1] - fork[1]) * 0.58, fork[2] + (tip[2] - fork[2]) * 0.5];
    tube(b, [s0, fork, m1, mid, tip], [trunkR * 0.78, trunkR * 0.7, trunkR * 0.55, trunkR * 0.36, trunkR * 0.1], tc, { seg: 8, cap: false });
    limbs.push({ mid, tip, a });
  }
  // branch cards along the limbs (the visible branching between the leaves)
  for (const L of limbs) {
    const dir = [L.tip[0] - L.mid[0], L.tip[1] - L.mid[1] + H * 0.12, L.tip[2] - L.mid[2]];
    c.spray(L.mid, dir, size * 1.15, size * 0.95, LEAF.twigs, r, tintOf(r, 1.05, 0.1), crown, 2);
  }
  // leaf sprays where the branches end
  for (let i = 0; i < clumps; i++) {
    const L = limbs[i % nL], a = L.a + r.range(-0.9, 0.9), d = r.range(spread * 0.45, spread);
    const base = [L.mid[0] + (L.tip[0] - L.mid[0]) * r.range(0.2, 0.9), L.mid[1] + (L.tip[1] - L.mid[1]) * r.range(0.3, 0.9), L.mid[2] + (L.tip[2] - L.mid[2]) * r.range(0.2, 0.9)];
    const tip = [fork[0] + Math.cos(a) * d, H * r.range(0.66, 0.94), fork[2] + Math.sin(a) * d];
    const dir = [tip[0] - base[0], tip[1] - base[1] + H * 0.12 - droop * H * 0.3, tip[2] - base[2]];
    c.spray(base, dir, size * 1.25, size * 1.05, cell, r, tintOf(r, tint), crown, 3);
  }
  // crown: two crossed cards + a cap
  for (let k = 0; k < 2; k++) c.card([crown[0], H * 0.8, crown[2]], size * 1.5, size * 1.2, r.next() * 3 + k * 1.57, cell, crown, tintOf(r, tint * 0.95));
  c.flat([crown[0], H * 0.93, crown[2]], size * 1.3, cell, crown, tintOf(r, tint * 1.05), r.next() * 6);
};
SP.elephant_tree = (b, c, r) => {
  b.t('bark');
  b.cyl(0, 0.5, 0, 0.3, 0.45, 1.0, 6, col(0xb8a890, 0.05, r));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + r.next(), e = [Math.cos(a) * 1.1, r.range(1.3, 1.9), Math.sin(a) * 1.1];
    b.beam([0, 0.9, 0], e, 0.12, 5, col(0xb8a890, 0.05, r));
    c.clump([e[0], e[1] + 0.25, e[2]], 1.3, LEAF.elephant, r, tintOf(r));
  }
  return { h: 2.3, r: 1.4 };
};
SP.palo_verde = (b, c, r) => { const H = r.range(2.8, 4.5); tree(b, c, r, { H, trunk: 0x8a9a58, trunkR: 0.15, cell: LEAF.palo_verde, clumps: 5, spread: 1.7, size: 2.0, layer: 'plain' }); return { h: H, r: 2 }; };
SP.mesquite = (b, c, r) => { const H = r.range(3, 5.5); tree(b, c, r, { H, trunk: 0x5a4836, trunkR: 0.2, cell: LEAF.mesquite, clumps: 6, spread: 2.2, size: 2.4 }); return { h: H, r: 2.6 }; };
SP.pepper_tree = (b, c, r) => { const H = r.range(5, 8); tree(b, c, r, { H, trunk: 0x5a4a3a, trunkR: 0.3, cell: LEAF.pepper, clumps: 7, spread: 2.6, size: 3.0, droop: 1 }); return { h: H, r: 3.2 }; };
SP.eucalyptus = (b, c, r) => { const H = r.range(11, 17); tree(b, c, r, { H, trunk: 0xcfc4b2, trunkR: 0.38, cell: LEAF.pepper, clumps: 6, spread: 2.6, size: 3.0, droop: 1, tint: 0.92, lean: 0.6 }); return { h: H, r: 3.4 }; };
SP.tamarisk = (b, c, r) => { const H = r.range(5, 8); tree(b, c, r, { H, trunk: 0x5e4c3c, trunkR: 0.3, cell: LEAF.mesquite, clumps: 9, spread: 2.8, size: 2.9, droop: 0.7, tint: 0.85, lean: 0.5 }); return { h: H, r: 3.2 }; };
SP.fruit_tree = (b, c, r) => { const H = r.range(2.8, 4); tree(b, c, r, { H, trunk: 0x5e4a3a, trunkR: 0.12, cell: LEAF.fruit, clumps: 4, spread: 1.1, size: 1.9 }); return { h: H, r: 1.6 }; };
// Palm: tapered, slightly curved textured trunk; crown of bent feather fronds (3-segment strips) with
// a skirt of dead brown fronds hanging below — like the SA / LA palms.
const palm = (b, c, r, cell, H, fronds, len, droop, bark = 'palm_bark', dead = 6) => {
  // one continuous tapered trunk following a gentle curve (no stacked cylinders): fan palms are slim with
  // a swollen foot and fine rings; date palms are thicker and straighter, covered in old frond stubs
  const date = bark === 'date_bark';
  const lean = date ? [r.range(-0.35, 0.35), r.range(-0.35, 0.35)] : [r.range(-1.1, 1.1), r.range(-1.1, 1.1)];
  const P = (t) => [lean[0] * t * t, H * t, lean[1] * t * t];
  const n = 9, pts = [], rad = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = P(t);
    pts.push([p[0], p[1] - (i === 0 ? 0.25 : 0), p[2]]);
    rad.push(date ? 0.36 - 0.05 * t + (i === n ? 0.06 : 0) : 0.24 + 0.2 * Math.exp(-t * 9) - 0.04 * t + (i === n ? 0.05 : 0));
  }
  b.t(bark); tube(b, pts, rad, col(date ? 0x7a6448 : 0x8a7a66, 0.05, r), { seg: 10, cap: false });
  const top = P(1);
  // the boot: short stubs of old frond bases just under the crown
  b.t(bark); for (let k = 0; k < (date ? 10 : 6); k++) { const a2 = (k / (date ? 10 : 6)) * 6.28 + r.next() * 0.4, y = H - 0.15 - r.range(0, date ? 0.9 : 0.5); b.box(top[0] + Math.sin(a2) * 0.26, y, top[2] + Math.cos(a2) * 0.26, 0.12, 0.42, 0.06, col(0x6a5440, 0.06, r), a2, 0.5, 0); }
  if (date && r.chance(0.6)) for (let k = 0; k < r.int(1, 3); k++) { // suckers at the foot
    const a2 = r.next() * 6.28, sx = Math.sin(a2) * 0.7, sz = Math.cos(a2) * 0.7, sctr = [sx, 0.6, sz];
    for (let f = 0; f < 6; f++) { const fa = (f / 6) * 6.28; c.strip([[sx, 0, sz], [sx + Math.sin(fa) * 0.5, 0.9, sz + Math.cos(fa) * 0.5], [sx + Math.sin(fa) * 1.0, 1.2, sz + Math.cos(fa) * 1.0], [sx + Math.sin(fa) * 1.4, 1.0, sz + Math.cos(fa) * 1.4]], [0.1, 0.45, 0.4, 0.2], [Math.cos(fa), 0, -Math.sin(fa)], cell, sctr, tintOf(r, 1, 0.2), 0.12); }
  }
  const ctr = [top[0], H - 0.3, top[2]];
  const frondAt = (a, pitch, curl, L, wid, cl, tint, yOff) => {
    const dx = Math.sin(a), dz = Math.cos(a), side = [Math.cos(a), 0, -Math.sin(a)];
    const spine = [], widths = [];
    let p = [top[0] + dx * 0.25, H + yOff, top[2] + dz * 0.25], ang = pitch;
    for (let k = 0; k <= 3; k++) {
      spine.push(p.slice()); widths.push(wid * [0.35, 1, 0.95, 0.55][k]);
      const l = L / 3;
      p = [p[0] + dx * Math.cos(ang) * l, p[1] - Math.sin(ang) * l, p[2] + dz * Math.cos(ang) * l];
      ang += curl;
    }
    c.strip(spine, widths, side, cl, ctr, tint, 0.12);
  };
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * 6.28 + r.range(-0.15, 0.15);
    const upper = i % 3 === 0;
    frondAt(a, upper ? r.range(-0.9, -0.5) : r.range(droop[0], droop[1]), r.range(0.4, 0.65), len * r.range(0.85, 1.1), len * 0.5, cell, tintOf(r, 1, 0.22), upper ? 0.3 : 0.1);
  }
  // dead skirt (petticoat): fan palms often keep a thick one, cared-for palms are trimmed
  if (!date && r.chance(0.35)) dead = 0;
  for (let i = 0; i < dead; i++) {
    const a = r.next() * 6.28;
    frondAt(a, r.range(1.0, 1.35), r.range(0.05, 0.2), len * r.range(0.6, 0.85), len * 0.45, LEAF.palm_dead, tintOf(r, 0.95, 0.2), -0.5);
  }
};
SP.fan_palm = (b, c, r) => { const H = r.range(8, 14); palm(b, c, r, LEAF.palm, H, 14, 3.0, [-0.25, 0.3], 'palm_bark', r.int(6, 12)); return { h: H, r: 2.8 }; };
SP.date_palm = (b, c, r) => { const H = r.range(6, 10); palm(b, c, r, LEAF.date_palm, H, 20, 4.2, [-0.45, 0.2], 'date_bark', r.int(4, 9)); return { h: H, r: 3.4 }; };
SP.nopal = (b, c, r) => {
  b.t('cactus');
  const cc = 0x7a9a5a, pads = r.int(5, 10), pts = [[0, 0.35, 0]];
  for (let i = 0; i < pads; i++) {
    const p = r.pick(pts), a = r.next() * 6.28;
    const q = [p[0] + Math.cos(a) * 0.3, p[1] + r.range(0.25, 0.45), p[2] + Math.sin(a) * 0.3];
    b.blob(q[0], q[1], q[2], 0.28, 0.34, 0.07, col(cc, 0.06, r), 'ico', a);
    pts.push(q);
  }
  b.blob(0, 0.3, 0, 0.3, 0.35, 0.08, col(cc, 0.06, r), 'ico');
  return { h: 1.4, r: 0.6 };
};
SP.ocotillo = (b, c, r) => {
  b.t('bark');
  const n = r.int(8, 14);
  for (let i = 0; i < n; i++) {
    const a = r.next() * 6.28, t = r.range(0.1, 0.45), L = r.range(2.2, 4);
    b.beam([0, 0, 0], [Math.cos(a) * Math.sin(t) * L, Math.cos(t) * L, Math.sin(a) * Math.sin(t) * L], 0.035, 3, col(0x6a6a48, 0.06, r));
  }
  return { h: 3.2, r: 0.8 };
};
SP.grass = (b, c, r) => {
  const y0 = r.next() * 3;
  for (let k = 0; k < 2; k++) c.card([0, 0.28, 0], 0.75, 0.6, y0 + k * 1.57, LEAF.dry_grass, [0, -0.5, 0], tintOf(r), 0, r.chance(0.5));
  return { h: 0.5, r: 0.35 };
};
// carrizo (giant reed): a stand of tall green canes by springs and streams
SP.carrizo = (b, c, r) => {
  const n = r.int(8, 14), H = r.range(2.4, 3.6), cane = col(0x9a9a62, 0.08, r);
  b.t('bark');
  for (let i = 0; i < n; i++) { const a = r.next() * 6.28, d = r.range(0, 0.55), x = Math.cos(a) * d, z = Math.sin(a) * d, h = H * r.range(0.7, 1.05); b.beam([x, 0, z], [x * 1.6 + r.range(-0.2, 0.2), h, z * 1.6 + r.range(-0.2, 0.2)], 0.025, 3, cane); }
  const y0 = r.next() * 3;
  for (let k = 0; k < 4; k++) c.card([0, H * 0.5, 0], 1.5, H, y0 + k * 0.8, LEAF.green_grass, [0, -0.5, 0], tintOf(r), 0, r.chance(0.5));
  return { h: H, r: 0.9 };
};
SP.tumbleweed = (b, c, r) => { c.clump([0, 0.45, 0], 0.95, LEAF.tumble, r, tintOf(r), 1.0); return { h: 0.9, r: 0.5 }; };
SP.rock = (b, c, r) => { b.t('rock'); b.blob(0, 0.15, 0, r.range(0.4, 0.8), r.range(0.25, 0.5), r.range(0.4, 0.8), col(0x9a8b78, 0.07, r), 'dodec', r.next() * 6); return { h: 0.4, r: 0.6 }; };
SP.boulder = (b, c, r) => {
  b.t('rock');
  b.blob(0, 0.5, 0, r.range(1.0, 1.8), r.range(0.8, 1.2), r.range(1.0, 1.6), col(0x968a78, 0.06, r), 'dodec', r.next() * 6);
  b.blob(r.range(0.5, 1), 0.3, r.range(-0.6, 0.6), 0.6, 0.45, 0.6, col(0x8e8272, 0.06, r), 'dodec', r.next() * 6);
  return { h: 1.4, r: 1.5 };
};
// crops
SP.corn = (b, c, r) => {
  b.t('bark'); b.beam([0, 0, 0], [r.range(-0.1, 0.1), 1.8, r.range(-0.1, 0.1)], 0.035, 3, col(0x9a9a50, 0.05, r));
  for (let k = 0; k < 2; k++) c.card([0, 0.95, 0], 0.8, 1.8, r.next() * 3 + k * 1.57, LEAF.green_grass, [0, 0, 0], tintOf(r));
  return { h: 1.9, r: 0.4 };
};
SP.beans = (b, c, r) => { c.clump([0, 0.3, 0], 0.7, LEAF.vine, r, tintOf(r, 1.05), 0.8); return { h: 0.6, r: 0.35 }; };
SP.squash = (b, c, r) => { c.flat([0, 0.12, 0], 1.1, LEAF.vine, [0, -1, 0], tintOf(r), r.next() * 6); b.t('plain'); b.blob(0.3, 0.12, 0.2, 0.15, 0.12, 0.15, 0xd89a3a, 'ico'); return { h: 0.3, r: 0.5 }; };
SP.chili = (b, c, r) => { c.clump([0, 0.3, 0], 0.6, LEAF.fruit, r, tintOf(r, 1.1), 0.9); b.t('plain'); b.blob(0.1, 0.35, 0.15, 0.06, 0.06, 0.06, 0xb8302a, 'oct'); return { h: 0.6, r: 0.3 }; };
SP.maguey = (b, c, r) => SP.agave(b, c, r);
SP.vine = (b, c, r) => { b.t('bark'); b.beam([0, 0, 0], [0, 1.1, 0], 0.05, 4, 0x5a4636); c.clump([0, 1.1, 0], 1.0, LEAF.vine, r, tintOf(r), 0.7); return { h: 1.4, r: 0.5 }; };

betterCacti(SP);
export const SPECIES = Object.keys(SP);

const VARIANTS = 3;
export class Flora {
  constructor(seed) { this.seed = seed; this.defs = {}; this.lists = {}; this.dirty = new Set(); }
  def(sp, v) {
    const k = `${sp}:${v}`;
    if (!this.defs[k]) {
      const b = new Builder(), c = new Cards();
      const info = SP[sp](b, c, new RNG(`${this.seed}:${k}`)) || { h: 1, r: 0.5 };
      this.defs[k] = { solid: b.isEmpty() ? null : b.build().main, cards: c.build(), ...info };
    }
    return k;
  }
  add(sp, x, y, z, s = 1, ry = 0, rng = null, src = this._src || 'other') {
    if (!SP[sp]) return;
    const v = rng ? rng.int(0, VARIANTS - 1) : 0;
    const k = this.def(sp, v);
    (this.lists[k] ||= []).push([x, y, z, s, ry, rng ? 0.9 + rng.next() * 0.2 : 1, src]);
    this.dirty.add(k);
  }
  // editor: drop entries matching fn(entry) (entry = [x, y, z, scale, rotY, tint, src])
  removeWhere(fn) { for (const k of Object.keys(this.lists)) { const n = this.lists[k].length; this.lists[k] = this.lists[k].filter((e) => !fn(e)); if (this.lists[k].length !== n) this.dirty.add(k); } }
  // fn may change entries in place: return true for one it changed (its species mesh is rebuilt)
  forEach(fn) { for (const [k, list] of Object.entries(this.lists)) for (const e of list) if (fn(e) === true) this.dirty.add(k); }
  // [{ sp, e }] — species from the list key "<species>:<variant>"
  entries() { const out = []; for (const [k, list] of Object.entries(this.lists)) { const sp = k.slice(0, k.lastIndexOf(':')); for (const e of list) out.push({ sp, e, def: this.defs[k] }); } return out; }
  // prev: the group built last time — species whose list didn't change keep their instanced meshes (and their baked
  // light); only changed ones are rebuilt. Without prev everything is built.
  build(prev = null) {
    const grp = new THREE.Group();
    grp.name = 'flora';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const old = new Map(); if (prev) for (const im of prev.children) old.set(`${im.userData.key}|${im.userData.cards ? 'cards' : 'solid'}`, im);
    const kept = new Set();
    for (const [k, list] of Object.entries(this.lists)) {
      const d = this.defs[k];
      for (const [part, mat] of [['solid', MATS.veg], ['cards', MATS.cards]]) {
        if (!d[part]) continue;
        const o = prev && !this.dirty.has(k) ? old.get(`${k}|${part}`) : null;
        if (o && o.count === list.length) { grp.add(o); kept.add(o); continue; }
        if (!list.length) continue;
        const g = d[part].clone();
        const n = list.length;
        g.setAttribute('iBake', new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(0.8), 3));
        g.setAttribute('iSun', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1));
        g.setAttribute('iTint', new THREE.InstancedBufferAttribute(new Float32Array(list.map((e) => e[5])), 1));
        const im = new THREE.InstancedMesh(g, mat, n);
        list.forEach(([x, y, z, s, ry], i) => {
          q.setFromAxisAngle(up, ry);
          m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
          im.setMatrixAt(i, m);
        });
        im.userData = { veg: true, cards: part === 'cards', h: d.h, r: d.r, key: k };
        im.frustumCulled = false;
        grp.add(im);
      }
    }
    if (prev) for (const im of old.values()) if (!kept.has(im)) im.geometry.dispose();
    this.dirty.clear();
    return grp;
  }
}

// default species mixes per biome
const MIX = {
  coastal_desert: { sage: 5, encelia: 3, creosote: 3, agave: 2.5, cholla: 1.5, datilillo: 0.8, cardon: 0.07, elephant_tree: 0.15, grass: 3, rock: 1.2, tumbleweed: 0.3, nopal: 0.4 },
  desert: { creosote: 6, cholla: 2.5, ocotillo: 1, cardon: 0.25, agave: 1, grass: 1.5, rock: 2, tumbleweed: 0.6, elephant_tree: 0.3 },
  scrubland: { sage: 4, creosote: 3, grass: 5, nopal: 1, agave: 1, mesquite: 0.3, rock: 1, tumbleweed: 0.4 },
  valley: { grass: 7, sage: 2, mesquite: 0.6, pepper_tree: 0.15, nopal: 0.8, rock: 0.5 },
  sierra: { grass: 4, sage: 3, rock: 3, boulder: 0.6, agave: 1, datilillo: 0.6 },
  coastal_valley: { grass: 8, sage: 3.5, encelia: 2.5, nopal: 0.8, agave: 0.6, pepper_tree: 0.06, mesquite: 0.1, tamarisk: 0.07, eucalyptus: 0.03, rock: 0.4, creosote: 1 },
};
const RIPARIAN = { mesquite: 3, palo_verde: 2.5, sage: 2, grass: 3, encelia: 2, fan_palm: 0.15 };
const BIG = new Set(['eucalyptus', 'tamarisk', 'mesquite', 'palo_verde', 'pepper_tree', 'fan_palm', 'date_palm', 'cardon', 'elephant_tree', 'boulder', 'datilillo']);

// Natural vegetation. Every 2.4 m cell has its own random stream, so a region can be regrown on its own
// (editor) and edits never reshuffle plants elsewhere. box = [x0, z0, x1, z1] limits it to a region.
export function scatter(flora, world, spec, box = null) {
  const veg = spec.vegetation || {};
  const density = (veg.density ?? 0.5) * 0.7; // the slider's full range is 70% of what it once was (performance)
  const rng = new RNG(`${world.seed}:veg`);
  const noise = makeNoise(`${world.seed}:vegn`);
  const mix = veg.mix || MIX[spec.biome] || MIX.coastal_desert;
  const T = world.terrain;
  const arroyos = T.features.filter((f) => f.type === 'arroyo');
  // editor: erased circles (hashed on a 10 m grid)
  const EH = new Map();
  for (const e of veg.erase || []) for (let i = Math.floor((e.at[0] - e.r) / 10); i <= Math.floor((e.at[0] + e.r) / 10); i++) for (let j = Math.floor((e.at[1] - e.r) / 10); j <= Math.floor((e.at[1] + e.r) / 10); j++) { const k = i * 9973 + j; if (!EH.has(k)) EH.set(k, []); EH.get(k).push(e); }
  const erased = (x, z) => { const a = EH.get(Math.floor(x / 10) * 9973 + Math.floor(z / 10)); return !!a && a.some((e) => (x - e.at[0]) ** 2 + (z - e.at[1]) ** 2 < e.r * e.r); };
  world.vegErased = erased;
  const X0 = T.xs[0] + 2, X1 = T.xs[T.xs.length - 1] - 2, Z0 = T.zs[0] + 2, Z1 = T.zs[T.zs.length - 1] - 2;
  const cell = 2.4;
  const inBox = (x, z) => !box || (x >= box[0] && x < box[2] && z >= box[1] && z < box[3]);
  const kx0 = box ? Math.max(0, Math.floor((box[0] - cell - X0) / cell)) : 0, kx1 = box ? Math.ceil((box[2] - X0) / cell) : Infinity;
  const kz0 = box ? Math.max(0, Math.floor((box[1] - cell - Z0) / cell)) : 0, kz1 = box ? Math.ceil((box[3] - Z0) / cell) : Infinity;
  for (let kz = kz0; kz <= kz1; kz++) {
    const z = Z0 + kz * cell; if (z >= Z1) break;
    for (let kx = kx0; kx <= kx1; kx++) {
      const x = X0 + kx * cell; if (x >= X1) break;
      // own random stream per cell: editing one spot never reshuffles the plants everywhere else
      const rng = new RNG(`${world.seed}:veg:${Math.round(x * 10)}:${Math.round(z * 10)}`);
      const out = T.outside(x, z);
      if (out > 0.9) continue;
      const px = x + rng.next() * cell, pz = z + rng.next() * cell;
      if (!inBox(px, pz)) continue;
      const patch = smooth(noise.fbm(px / 30, pz / 30, 3) * 0.9 + 0.55);
      let p = density * (0.25 + 0.9 * patch);
      let riparian = 0;
      for (const a of arroyos) {
        const hw = (a.width || 10) / 2, q = nearestWithin(a.samples, px, pz, hw * 2.6);
        const d = q ? q.d : 1e9;
        if (q) riparian = Math.max(riparian, 1 - smooth((d - hw * 0.3) / (hw * 2.3)));
      }
      p += riparian * 0.4;
      if (out > 0) p *= (1 - out) * 0.45;
      if (world.townDensity) p *= 1 - 0.85 * world.townDensity(px, pz); // trampled town ground
      if (T.water && T.height(px, pz) < (T.water.level ?? 0) + 0.4) continue;
      if (!rng.chance(Math.min(p, 0.95))) continue;
      const sp = riparian > 0.3 && rng.chance(riparian * 0.75) ? rng.weighted(RIPARIAN) : rng.weighted(mix);
      if (EH.size && erased(px, pz)) continue;
      const big = BIG.has(sp);
      if (out === 0 && world.blocked(px, pz, big ? 2.5 : 0.9)) continue;
      if (out > 0 && world.roadNear(px, pz, 3)) continue;
      const s = rng.range(0.75, 1.25) * (veg.scale || 1);
      flora.add(sp, px, T.height(px, pz) - 0.05, pz, s, rng.next() * 6.28, rng, 'scatter');
    }
  }
  if (!box) for (const g of veg.groves || []) {
    const n = g.count || 6;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * 6.28, d = Math.sqrt(rng.next()) * (g.radius || 8);
      const px = g.at[0] + Math.cos(a) * d, pz = g.at[1] + Math.sin(a) * d;
      if (!T.inMap(px, pz, 1) || (g.avoid !== false && world.blocked(px, pz, 1)) || (EH.size && erased(px, pz))) continue;
      const sp = typeof g.species === 'string' ? g.species : rng.weighted(g.species);
      flora.add(sp, px, T.height(px, pz) - 0.05, pz, rng.range(0.8, 1.2) * (g.scale || 1), rng.next() * 6.28, rng, 'grove');
    }
  }
  (veg.plants || []).forEach((pl, i) => {
    if (!inBox(pl.at[0], pl.at[1]) || world.roadNear?.(pl.at[0], pl.at[1], 0.2)) return;
    const r2 = new RNG(`${world.seed}:plant:${i}:${pl.at.join(',')}`);
    flora.add(pl.species, pl.at[0], world.roofAt?.(pl.at[0], pl.at[1]) ?? T.height(pl.at[0], pl.at[1]) - 0.05, pl.at[1], pl.scale || 1, ((pl.rot || 0) * Math.PI) / 180, r2, 'plant');
  });
}

// Flags and banners as rippled vertex-coloured cloth (one flat colour per cell, early-2000s blocky look).
// No national flags: a settlement flies its own (spec.settlement.flag) or, without one, a homemade rag
// banner seeded per place. Factions (designs invented here, the gazetteer gives no colours):
//   Red Misionera       — hanging gonfalon: undyed cream, a madder-red cross, green hem (seeds/fields), swallowtail
//   Hermandad del Camino — pennant: asphalt-black with a yellow dashed centre line and white edge lines (the road)
// settlement.flag = { colors: ['#hex', ...], layout: 'h'|'v'|'canton'|'diag'|'plain', emblem: 'none'|'star'|'sun'|'ring'|'cross'|'chevron', emblemColor }
import * as THREE from 'three';
import { RNG } from './rng.js';

let SRC = { flag: null, seed: 'place' };
export function setFlagSource(flag, seed) { SRC = { flag: flag || null, seed: String(seed || 'place') }; _rag = null; }
let _rag = null;

const C = (h) => new THREE.Color(h);
const DYES = ['#2e4a7a', '#a8402c', '#c8a040', '#4a6a3a', '#e6dcc4', '#2a2622', '#7a3a5a', '#3a7a7a'];
const STAR = Array.from({ length: 10 }, (_, k) => { const a = (k * Math.PI) / 5, r = k % 2 ? 0.4 : 1; return [Math.sin(a) * r, Math.cos(a) * r]; });
const inStar = (x, y, R) => { let c = false; for (let i = 0, j = 9; i < 10; j = i++) { const [xi, yi] = STAR[i], [xj, yj] = STAR[j]; if ((yi * R > y) !== (yj * R > y) && x < ((xj - xi) * R * (y - yi * R)) / ((yj - yi) * R) + xi * R) c = !c; } return c; };
function emblemAt(em, x, y) { // x, y in -1..1 around the emblem centre
  const r = Math.hypot(x, y);
  switch (em) {
    case 'star': return inStar(x, y, 0.95);
    case 'sun': return r < 0.45 || (r < 0.95 && Math.cos(Math.atan2(y, x) * 12) > 0.55 && r > 0.55);
    case 'ring': return r > 0.55 && r < 0.9;
    case 'cross': return (Math.abs(x) < 0.2 && Math.abs(y) < 0.95) || (Math.abs(y - 0.25) < 0.18 && Math.abs(x) < 0.65);
    case 'chevron': return Math.abs(y - (0.6 - Math.abs(x) * 1.1)) < 0.28 && Math.abs(x) < 0.95;
    default: return false;
  }
}

// a design: (u, v) in 0..1 (u along the fly, v down) -> THREE.Color or null (cut away)
export function flagDesign(kind) {
  if (kind === 'misionera') {
    const cream = C('#e2d6b8'), red = C('#9a3424'), green = C('#4a6a34');
    return { aspect: 0.62, shape: 'swallow', hang: true, f: (u, v) => {
      if (v > 0.82) return green;
      if ((Math.abs(u - 0.5) < 0.09 && v > 0.12 && v < 0.74) || (Math.abs(v - 0.32) < 0.07 && Math.abs(u - 0.5) < 0.3)) return red;
      return cream;
    } };
  }
  if (kind === 'hermandad') {
    const dark = C('#262624'), yel = C('#d8b030'), wht = C('#d8d4c8');
    return { aspect: 2.2, shape: 'pennant', f: (u, v) => {
      const half = 0.5 * (1 - u); // pennant half-height at u
      const d = Math.abs(v - 0.5);
      if (Math.abs(d - half * 0.82) < 0.045) return wht;
      if (d < 0.05 && (u * 7) % 1 < 0.55 && u < 0.9) return yel;
      return dark;
    } };
  }
  if (SRC.flag) return designFrom(SRC.flag, false);
  return (_rag ||= ragDesign());
}
function designFrom(F, rag, rng) {
  const cols = (F.colors && F.colors.length ? F.colors : ['#a8402c', '#e6dcc4']).map(C), ec = C(F.emblemColor || (cols.length > 2 ? cols[2] : '#e6dcc4'));
  const lay = F.layout || 'h', em = F.emblem || 'none', n = cols.length;
  const field = (u, v) => {
    switch (lay) {
      case 'v': return cols[Math.min(n - 1, Math.floor(u * n))];
      case 'canton': return u < 0.42 && v < 0.5 ? cols[0] : cols[1 + (Math.floor(v * 2 * Math.max(1, n - 1)) % Math.max(1, n - 1))] || cols[0];
      case 'diag': return u + v < 1 ? cols[0] : cols[1 % n];
      case 'plain': return cols[0];
      default: return cols[Math.min(n - 1, Math.floor(v * n))];
    }
  };
  const ex = lay === 'canton' ? 0.21 : lay === 'v' ? 0.5 : 0.5, ey = lay === 'canton' ? 0.25 : 0.5, es = lay === 'canton' ? 0.17 : 0.28;
  const patch = rag && rng.chance(0.5) ? { u0: rng.range(0.2, 0.6), v0: rng.range(0.1, 0.6), w: rng.range(0.12, 0.25), h: rng.range(0.15, 0.3), c: C(rng.pick(DYES)).lerp(C('#c8bca0'), 0.4) } : null;
  const fray = rag ? Array.from({ length: 12 }, () => rng.range(0.86, 1.0)) : null;
  return { aspect: 1.6, shape: 'rect', f: (u, v) => {
    if (fray && u > fray[Math.min(11, Math.floor(v * 12))]) return null; // frayed fly end
    let c = field(u, v);
    if (em !== 'none' && emblemAt(em, (u - ex) / (es * 0.62), (ey - v) / es)) c = ec;
    if (patch && u > patch.u0 && u < patch.u0 + patch.w && v > patch.v0 && v < patch.v0 + patch.h) c = patch.c;
    if (rag) c = c.clone().lerp(C('#d8ccb0'), 0.1 + u * 0.18); // sun-faded, worst at the fly
    return c;
  } };
}
// homemade rag banner for a place without a flag of its own
function ragDesign() {
  const rng = new RNG(`${SRC.seed}:ragflag`), n = rng.int(2, 3), cols = [];
  while (cols.length < n) { const d = rng.pick(DYES); if (!cols.includes(d)) cols.push(d); }
  const F = { colors: cols, layout: rng.weighted({ h: 3, v: 2, canton: 1, diag: 1, plain: 1 }), emblem: rng.weighted({ none: 2, star: 1.5, sun: 1, ring: 1, cross: 0.6, chevron: 0.8 }) };
  F.emblemColor = rng.pick(DYES.filter((d) => !cols.includes(d)));
  return designFrom(F, true, rng);
}

// draw a flag hanging from (0, top, 0) in the current builder frame, flying toward +x.
// h = hoist height; ripple bakes a static wave; double-sided.
export function drawFlag(b, design, top, h, r, { nx = 18, ny = 11, ripple = 0.07, x0 = 0.05, cloth = true } = {}) {
  const hang = design.hang, W = h * design.aspect, H = h;
  const ph = r.next() * 6.28;
  const pt = (u, v) => {
    if (hang) { const x = x0 - W / 2 + u * W, y = top - v * H, z = Math.sin(u * 3.0 + ph + v * 2) * ripple * 0.5 * v; return [x, y, z]; }
    const x = x0 + u * W, y = top - v * H - u * u * H * 0.08, z = Math.sin(u * 7.5 + ph) * ripple * u * 1.2 + Math.sin(v * 3 + ph) * ripple * 0.2 * u;
    return [x, y, z];
  };
  const cut = (u, v) => {
    if (design.shape === 'pennant') return Math.abs(v - 0.5) > 0.5 * (1 - u) + 0.02;
    if (design.shape === 'swallow') return v > 0.88 && Math.abs(u - 0.5) < (v - 0.88) * 2.6;
    return false;
  };
  if (cloth) b.ch('cloth');
  b.t('fabric');
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    if (cut(um, vm)) continue;
    const c = design.f(um, vm); if (!c) continue;
    const a = pt(u0, v0), bb = pt(u1, v0), cc = pt(u1, v1), d = pt(u0, v1);
    b.quad(a, d, cc, bb, c); b.quad(a, bb, cc, d, c); // both faces
  }
  if (cloth) b.ch('main');
  return { w: W, h: H };
}

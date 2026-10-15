// Builder plots (Manor Lords style): straight-sided strips along a road. Each plot is a 4-point polygon
// [frontA, frontB, backB, backA]; edge 0 (frontA→frontB) faces the street. Fences / walls follow the
// plot lines: one fence per shared line, a gate on the street side, cut where a building stands.
import { ROOF_STYLES } from './buildings.js';
import { RNG } from './rng.js';
import { sampleAt, pathLength, nearestOnSamples, toLocal, toWorld, facingAngle, pointInPoly } from './geo.js';
import { SIZES, DEN_FIXED } from './layout.js';

export const FENCE_STYLES = ['auto', 'adobe', 'compound', 'block', 'brick', 'stone', 'stone_low', 'stone_ruin', 'herreria', 'ocotillo', 'wood', 'wood_old', 'pole', 'wire', 'rail', 'chain', 'bollard', 'scrap', 'none'];
const STRONG0 = 0;
const STRONG = { herreria: 6, bollard: 1, chain: 1, compound: 7, adobe: 6, block: 6, brick: 6, stone: 6, stone_ruin: 4, scrap: 4, stone_low: 4, wood: 3, wood_old: 3, ocotillo: 3, rail: 2, pole: 2, wire: 1, none: 0 };
const HEIGHT = { herreria: 1.95, compound: 2.1, adobe: 1.9, block: 1.9, brick: 1.9, stone: 1.8 };

// road frontage geometry at s on one side: [x, z] of the frontage line and the inward normal
export function frontAt(road, s, side, verge) {
  const p = sampleAt(road.samples, s);
  const nx = -p.tz * side, nz = p.tx * side, off = road.hw + (road.frontage || 0) + verge;
  return { x: p.x + nx * off, z: p.z + nz * off, nx, nz };
}

// a strip of plots along `road` between arc positions s0..s1 on `side` (+1 left / -1 right of travel)
export function plotStrip(road, s0, s1, side, o, isFree) {
  const L = pathLength(road.samples);
  [s0, s1] = [Math.max(0, Math.min(s0, s1)), Math.min(L, Math.max(s0, s1))];
  const len = s1 - s0, w = Math.max(4, o.width || 10), verge = o.verge ?? 1;
  const cuts = mixCuts(len, w, o.depth || 20, o.mix, `${o.seed ?? ''}:${road.id}:${side}`), n = cuts.length;
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = s0 + cuts[k].a, b = s0 + cuts[k].b;
    const A = frontAt(road, a, side, verge), B = frontAt(road, b, side, verge);
    // depth: as deep as asked, shortened if it would run onto another road or plot
    let d = cuts[k].d;
    if (isFree) for (let t = 1.5; t <= d; t += 0.75) {
      const ok = isFree(A.x + A.nx * t, A.z + A.nz * t) && isFree(B.x + B.nx * t, B.z + B.nz * t) && isFree((A.x + B.x) / 2 + (A.nx + B.nx) / 2 * t, (A.z + B.z) / 2 + (A.nz + B.nz) / 2 * t);
      if (!ok) { d = t - 0.75; break; }
    }
    if (d < 6) continue;
    const r2 = (v) => Math.round(v * 100) / 100;
    // side == +1: walking along the road the plot is on the left, so A→B→B'→A' runs clockwise
    const poly = [[A.x, A.z], [B.x, B.z], [B.x + B.nx * d, B.z + B.nz * d], [A.x + A.nx * d, A.z + A.nz * d]].map((q) => q.map(r2));
    out.push({ poly, road: road.id, side, fence: o.fence || 'auto', s0: r2(a), s1: r2(b), depth: r2(d), verge });
  }
  return out;
}

// split a frontage of length len into plots: even widths, or (mix) each plot its own size and / or shape
// mix = { size, shape }: size scales width and depth together (tiny..huge), shape trades width for depth (narrow..wide)
export function mixCuts(len, w, D, mix, seed) {
  if (!mix?.size && !mix?.shape) { const n = Math.max(1, Math.round(len / w)); return Array.from({ length: n }, (_, k) => ({ a: (len * k) / n, b: (len * (k + 1)) / n, d: D })); }
  const rng = new RNG(`mixplots:${seed}`), P = [];
  let acc = 0;
  while (acc < len - 2) {
    const sz = mix.size ? rng.pick([0.62, 0.8, 1, 1, 1.25, 1.5]) : 1, [kw, kd] = mix.shape ? rng.pick([[0.65, 1.2], [1, 1], [1, 1], [1.6, 0.75]]) : [1, 1];
    const pw = Math.max(5, w * sz * kw); P.push({ w: pw, d: Math.max(8, D * Math.min(1.3, sz) * kd) }); acc += pw;
  }
  if (P.length > 1 && acc - len > P[P.length - 1].w / 2) { acc -= P.pop().w; } // closer to the length without the last one
  const f = len / acc; let u = 0;
  return P.map((p) => { const a = u; u += p.w * f; return { a, b: u, d: p.d }; });
}

// frame of a plot: front centre, rotation facing the street, width, depth
export function plotFrame(pl) {
  if (pl.poly.length !== 4) return polyFrame(pl.poly);
  const [a, b, c, d] = pl.poly;
  const fx = (a[0] + b[0]) / 2, fz = (a[1] + b[1]) / 2, bx = (c[0] + d[0]) / 2, bz = (c[1] + d[1]) / 2;
  const rot = facingAngle(fx - bx, fz - bz); // building front (+z local) toward the street
  return { front: [fx, fz], back: [bx, bz], rot, deg: (rot * 180) / Math.PI, w: Math.min(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - d[0], c[1] - d[1])), d: Math.hypot(fx - bx, fz - bz) };
}

// frame of an N-gon plot: edge 0 is the street front; depth = farthest point inward; width = the
// narrowest of the front and a mid-depth chord
function polyFrame(P) {
  const [a, b] = P, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
  const c = P.reduce((m, q) => [m[0] + q[0] / P.length, m[1] + q[1] / P.length], [0, 0]);
  let nx = -tz, nz = tx;
  if ((c[0] - a[0]) * nx + (c[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
  const v = (q) => (q[0] - a[0]) * nx + (q[1] - a[1]) * nz, u = (q) => (q[0] - a[0]) * tx + (q[1] - a[1]) * tz;
  const d = Math.max(...P.map(v));
  const chord = (vv) => { const us = []; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], vp = v(p), vq = v(q); if ((vp - vv) * (vq - vv) <= 0 && vp !== vq) { const t = (vv - vp) / (vq - vp); us.push(u(p) + (u(q) - u(p)) * t); } } return us.length >= 2 ? Math.max(...us) - Math.min(...us) : L; };
  const fx = (a[0] + b[0]) / 2, fz = (a[1] + b[1]) / 2, bx = fx + nx * d, bz = fz + nz * d;
  const rot = facingAngle(-nx, -nz);
  return { front: [fx, fz], back: [bx, bz], rot, deg: (rot * 180) / Math.PI, w: Math.min(L, chord(Math.min(d * 0.45, 8))), d };
}

// ---------------------------------------------------------------- polygon helpers
export function polySigned(P) { let A = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; } return A / 2; }
const ccw = (P) => (polySigned(P) < 0 ? [...P].reverse() : P);
// keep the part of P left of a→b (Sutherland–Hodgman step)
function clipHalf(P, a, b) {
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
export function clipConvex(P, C) { C = ccw(C); let R = ccw(P); for (let i = 0; i < C.length && R.length >= 3; i++) R = clipHalf(R, C[i], C[(i + 1) % C.length]); return R; }
function hull(P) {
  const pts = [...P].sort((p, q) => p[0] - q[0] || p[1] - q[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// P minus convex C: the largest of the pieces outside C
function subtractConvex(P, C) {
  C = ccw(C);
  let best = null, rest = ccw(P);
  for (let i = 0; i < C.length && rest.length >= 3; i++) {
    const a = C[i], b = C[(i + 1) % C.length];
    const out = clipHalf(rest, b, a); // right of a→b = outside C
    if (out.length >= 3 && (!best || Math.abs(polySigned(out)) > Math.abs(polySigned(best)))) best = out;
    rest = clipHalf(rest, a, b);
  }
  return best || [];
}
function cleanPoly(P, eps = 0.05) {
  let Q = P.filter((p, i) => Math.hypot(p[0] - P[(i + 1) % P.length][0], p[1] - P[(i + 1) % P.length][1]) > eps);
  for (let k = 0; k < 3; k++) Q = Q.filter((p, i) => { const a = Q[(i - 1 + Q.length) % Q.length], b = Q[(i + 1) % Q.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) > 0.04; });
  return Q;
}
// orient like road plots (signed area < 0) and rotate so edge 0 is the one scoring lowest (the street front)
export function frontFirst(P, score) {
  let Q = polySigned(P) > 0 ? [...P].reverse() : [...P];
  let bi = 0, bs = Infinity;
  for (let i = 0; i < Q.length; i++) { const sc = score(Q[i], Q[(i + 1) % Q.length]); if (sc < bs) { bs = sc; bi = i; } }
  return Q.slice(bi).concat(Q.slice(0, bi));
}

// Divide a drawn zone polygon into plots: strips along each road frontage (edges of the zone that lie
// on a road's edge), as wide / deep as asked, clipped to the zone; corners go to the longer frontage.
// No road frontage at all: strips along the zone's longest edge.
export function subdivideZone(zone, roads, o) {
  const W = Math.max(4, o.width || 11), D = Math.max(6, o.depth || 22), verge = o.verge ?? 1;
  const Z = cleanPoly(zone);
  if (Z.length < 3) return [];
  // frontage chains
  const onRoad = (p) => { let best = null; for (const r of roads) { if (r._gate || r.type === 'path') continue; const q = nearestOnSamples(r.samples, p[0], p[1]); const off = q.d - r.hw - (r.frontage || 0); if ((o.frontPt ? off > -1.5 && off < verge + 6 : Math.abs(off - verge) < 1.6) && (!best || q.d < best.q.d)) { const a = r.samples[q.i], b = r.samples[Math.min(q.i + 1, r.samples.length - 1)]; best = { r, q, s: a.s + (b.s - a.s) * q.t, side: (b.x - a.x) * (p[1] - a.z) - (b.z - a.z) * (p[0] - a.x) >= 0 ? 1 : -1 }; } } return best; };
  const marks = Z.map(onRoad);
  const chains = [];
  for (let i = 0; i < Z.length; i++) {
    const m0 = marks[i], m1 = marks[(i + 1) % Z.length];
    const mid = [(Z[i][0] + Z[(i + 1) % Z.length][0]) / 2, (Z[i][1] + Z[(i + 1) % Z.length][1]) / 2], mm = onRoad(mid);
    if (!m0 || !m1 || !mm || m0.r !== m1.r || m0.side !== m1.side || mm.r !== m0.r) continue;
    const last = chains[chains.length - 1];
    if (last && last.r === m0.r && last.side === m0.side && last.end === i) { last.s0 = Math.min(last.s0, m0.s, m1.s); last.s1 = Math.max(last.s1, m0.s, m1.s); last.end = (i + 1) % Z.length; }
    else chains.push({ r: m0.r, side: m0.side, s0: Math.min(m0.s, m1.s), s1: Math.max(m0.s, m1.s), start: i, end: (i + 1) % Z.length });
  }
  // a chain that wraps around the start of the ring
  if (chains.length > 1) { const f = chains[0], l = chains[chains.length - 1]; if (l.end === f.start && l.r === f.r && l.side === f.side) { f.s0 = Math.min(f.s0, l.s0); f.s1 = Math.max(f.s1, l.s1); chains.pop(); } }
  // the first side drawn is the street front, absolutely (Danyil): only the road chain under it, or (off the road) that edge
  const FP = o.frontPt;
  let fi = -1;
  if (FP) { let bd = Infinity; for (let i = 0; i < Z.length; i++) { const a = Z[i], c2 = Z[(i + 1) % Z.length], dx = c2[0] - a[0], dz = c2[1] - a[1], t = Math.max(0, Math.min(1, ((FP[0] - a[0]) * dx + (FP[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))), dd = Math.hypot(FP[0] - a[0] - dx * t, FP[1] - a[1] - dz * t); if (dd < bd) { bd = dd; fi = i; } } }
  if (FP) { // keep only the road chain that runs along the first side drawn; none = that side isn't on a road
    const inChain = (c) => { for (let i = c.start, n = 0; n <= Z.length; i = (i + 1) % Z.length, n++) { if (i === fi) return true; if ((i + 1) % Z.length === c.end) break; } return false; };
    const keep = chains.filter(inChain); chains.length = 0; chains.push(...keep);
  }
  chains.sort((p, q) => (q.s1 - q.s0) - (p.s1 - p.s0));
  const strips = [];
  for (const c of chains) {
    if (c.s1 - c.s0 < 3) continue;
    for (const q of plotStrip(c.r, c.s0 - 0.5, c.s1 + 0.5, c.side, { width: W, depth: D, verge, mix: o.mix, seed: o.seed })) strips.push({ quad: q.poly, road: c.r, side: c.side });
  }
  if (!strips.length) { // no road: along the longest edge, inward
    let bi = 0, bl = 0;
    for (let i = 0; i < Z.length; i++) { const L = Math.hypot(Z[(i + 1) % Z.length][0] - Z[i][0], Z[(i + 1) % Z.length][1] - Z[i][1]); if (L > bl) { bl = L; bi = i; } }
    if (FP && fi >= 0) { bi = fi; bl = Math.hypot(Z[(fi + 1) % Z.length][0] - Z[fi][0], Z[(fi + 1) % Z.length][1] - Z[fi][1]); }
    const a = Z[bi], b = Z[(bi + 1) % Z.length], tx = (b[0] - a[0]) / bl, tz = (b[1] - a[1]) / bl;
    const C = Z.reduce((m, q) => [m[0] + q[0] / Z.length, m[1] + q[1] / Z.length], [0, 0]);
    let nx = -tz, nz = tx; if ((C[0] - a[0]) * nx + (C[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
    const cuts = mixCuts(bl, W, D, o.mix, `${o.seed ?? ''}:edge`), n = cuts.length;
    for (let k = 0; k < n; k++) {
      const u0 = cuts[k].a - (k === 0 ? 2 : 0), u1 = cuts[k].b + (k === n - 1 ? 2 : 0), Dk = cuts[k].d;
      const A = [a[0] + tx * u0 - nx, a[1] + tz * u0 - nz], B = [a[0] + tx * u1 - nx, a[1] + tz * u1 - nz];
      strips.push({ quad: [A, B, [B[0] + nx * (Dk + 1), B[1] + nz * (Dk + 1)], [A[0] + nx * (Dk + 1), A[1] + nz * (Dk + 1)]], line: [a, b] });
    }
  }
  const made = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const st of strips) {
    let P = clipConvex(Z, hull(st.quad));
    for (const m of made) { if (P.length < 3) break; const H = hull(m.poly); if (Math.abs(polySigned(clipConvex(P, H))) > 0.5) P = subtractConvex(P, H); }
    P = cleanPoly(P);
    if (P.length < 3 || Math.abs(polySigned(P)) < 30) continue;
    const front = st.road
      ? (p, q) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], d = (z) => Math.abs(nearestOnSamples(st.road.samples, z[0], z[1]).d - st.road.hw - (st.road.frontage || 0) - verge); return d(p) + d(q) + d(m) - 0.01 * Math.hypot(q[0] - p[0], q[1] - p[1]); }
      : (p, q) => { const [a, b] = st.line, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = (z) => Math.abs((b[0] - a[0]) * (z[1] - a[1]) - (b[1] - a[1]) * (z[0] - a[0])) / L; return d(p) + d(q) - 0.01 * Math.hypot(q[0] - p[0], q[1] - p[1]); };
    const poly = frontFirst(P, front).map((q) => q.map(r2));
    made.push({ poly, ...(st.road ? { road: st.road.id, side: st.side } : {}), fence: o.fence || 'auto', custom: true });
  }
  return made;
}

// auto-generated building for a plot: kind, size, shape, floors, material, origin; placed at the front
const SHAPES = { shack: { rect: 1 }, guardpost: { rect: 1 }, bunker: { rect: 1 }, barracks: { rect: 3, L: 1 }, armory: { rect: 1 }, house: { rect: 4, L: 3, T: 1, stepped: 1.3, U: 0.8, courtyard: 0.6, H: 0.4 }, shop: { rect: 5, L: 1.5, stepped: 0.8 }, cantina: { rect: 4, L: 2, T: 1, U: 0.6 },
  workshop: { rect: 5, L: 2, U: 0.5 }, garage: { rect: 6, L: 1 }, warehouse: { rect: 6 }, barn: { rect: 5, L: 1 }, chapel: { rect: 4, T: 1.5 }, hall: { rect: 3, T: 1.5, H: 1, U: 1, courtyard: 0.8 },
  mission: { rect: 1 }, granary: { rect: 1 }, mill: { rect: 1 }, bodega: { rect: 1 }, townhall: { rect: 1 }, comandancia: { rect: 1 }, trade: { rect: 3, L: 1 }, pemex: { rect: 1 },
  posada: { rect: 1 }, store: { rect: 4, L: 1 }, clinic: { rect: 4, L: 1.5 }, cafe: { rect: 4, L: 1 },
  office: { rect: 4, L: 1.5, H: 0.8, U: 0.8 }, shelter: { rect: 3, L: 1.5, U: 1.5, courtyard: 1.5 } };
// zone categories (Plot block tool): what a block of plots is built up with. `mix` weights building kinds and plot
// uses ('use:<plot use>', 'mf:<multifamily kind>'); `once` = at most one per zone; `origins` = new / mixed / prewar
// shares; `mats` (optional) = materials for the new-built ones; `ui` = the plot defaults it sets.
export const ZONE_CATS = {
  residential: { label: 'Residential', mix: { house: 10, 'mf:': 1.2, shop: 0.5, store: 0.3, 'use:vacant': 0.7 }, origins: { new: 5, mixed: 2, prewar: 2 }, ui: { dens: 0.5 } },
  wealthy: { label: 'Wealthy residential', mix: { house: 10, biz: 1.3, resto: 0.6, cafe: 0.2 }, origins: { prewar: 4, mixed: 2, new: 2 }, mats: { plaster: 4, block: 1, concrete: 1, brick: 0.6, stone: 0.4 }, ui: { dens: 0.35, psize: 0.75 } },
  lowcom: { label: 'Low commercial (houses + small shops)', mix: { house: 6, shop: 3, store: 1.5, stand: 1.2, cafe: 1, cantina: 0.5, workshop: 0.6, garage: 0.4, 'mf:locales': 0.5 }, origins: { new: 5, mixed: 2, prewar: 2 }, ui: { dens: 0.55 } },
  colonia: { label: 'Colonia / shanty', mix: { shack: 6, house: 4, 'use:vacant': 2, 'use:salvage': 0.6, shop: 0.3 }, origins: { new: 9, mixed: 1 }, mats: { block: 1.5, brick: 1, timber: 1, metal: 1.2, adobe: 1 }, ui: { dens: 0.35, psize: 0.25 } },
  centro: { label: 'Centro / main street', mix: { shop: 4, store: 2, cantina: 1.5, cafe: 1.2, posada: 0.7, bodega: 0.6, clinic: 0.4, house: 1.5, 'mf:locales': 1 }, once: ['clinic', 'posada'], origins: { new: 4, mixed: 2, prewar: 2 }, ui: { dens: 0.75, brow: true } },
  highway: { label: 'Highway strip', mix: { pemex: 1, garage: 2, workshop: 1.5, stand: 1.8, posada: 1, store: 1.2, cantina: 0.8, cafe: 1, house: 1, 'use:trader': 0.6, 'use:salvage': 0.5 }, once: ['pemex', 'posada'], origins: { new: 4, mixed: 2, prewar: 2 }, ui: { dens: 0.4, psize: 0.75, pshape: 'wide' } },
  civic: { label: 'Civic', mix: { townhall: 1, comandancia: 1, chapel: 1.2, hall: 1, clinic: 1, office: 0.6, 'use:plaza': 1, 'use:market': 0.8 }, once: ['townhall', 'comandancia', 'chapel', 'use:plaza', 'use:market'], origins: { prewar: 2, mixed: 2, new: 2 }, ui: { dens: 0.55, psize: 0.75 } },
  fallout: { label: 'Fallout mix (pre-war, rebuilt)', mix: { house: 8, 'mf:block': 0.8, 'mf:': 0.3, shop: 1.5, store: 0.8, cantina: 0.6, cafe: 0.5, workshop: 0.6, garage: 0.5, clinic: 0.2, 'use:vacant': 0.5 }, once: ['clinic'], origins: { mixed: 6, prewar: 3, new: 1 }, ui: { dens: 0.55 } },
};
// one pick from a zone category (kind, plot use or multifamily); `taken` holds the once-only picks already made
export function zonePick(cat, rng, taken) {
  const C = ZONE_CATS[cat]; if (!C) return null;
  const W = Object.fromEntries(Object.entries(C.mix).filter(([k]) => !(C.once || []).includes(k) || !taken.has(k)));
  const k = rng.weighted(W); if ((C.once || []).includes(k)) taken.add(k);
  return k;
}
export const BUILD_KINDS = ['auto', 'house', 'shack', 'guardpost', 'barracks', 'bunker', 'armory', 'shop', 'cantina', 'workshop', 'garage', 'warehouse', 'barn', 'chapel', 'hall', 'office', 'shelter', 'factory', 'pumphouse', 'silos', 'posada', 'store', 'clinic', 'cafe', 'mission', 'granary', 'mill', 'bodega', 'townhall', 'comandancia', 'trade', 'pemex', 'stand', 'utility'];
export const SETBACKS = { row: [0, 0.3], tight: [0.6, 2], set_back: [3, 6] };
const ROOF_ODDS = {
  adobe: { mud: 4, flat: 3, shed: 1, gable_tin: 0.8, hip_tile: 0.15 },
  stone: { mud: 2, gable_tile: 0.3, hip_tile: 0.3, flat: 1.5, gable_tin: 0.6 },
  plaster: { flat: 4, gable_tile: 0.25, hip_tile: 0.3, shed: 0.8, hip_tin: 0.4, gable_tin: 0.5 },
  block: { flat: 4, shed: 2.5, gable_tin: 1.5, hip_tin: 0.6 },
  timber: { gable_tin: 4, gable_shingle: 2.5, shed: 1.5 },
  concrete: { flat: 6, shed: 1 }, brick: { flat: 5, gable_tile: 0.15 }, metal: { shed: 3, gable_tin: 2 },
};
export function autoBuilding(pl, o, seed) {
  const rng = new RNG(`${seed}:auto:${pl.id}:${o.v || 0}`);
  const F = plotFrame(pl);
  const kind = !o.kind || o.kind === 'auto' ? rng.weighted({ house: 8, shop: 1.4, store: 0.8, workshop: 1.2, cantina: 0.5, cafe: 0.4, garage: 0.5, warehouse: 0.3, posada: 0.2, clinic: 0.15 }) : o.kind;
  const ks = SIZES[kind] || SIZES.house;
  const mode = o.setback || 'tight';
  const row = mode === 'row';
  // density (0..1, editor slider): low = set back, room round the building, one storey; high = up to the street,
  // filling the plot, taller. Without it the old setback ranges apply.
  const D = o.density, hasD = D != null, lerp = (a, b) => a + (b - a) * D;
  const set = row ? rng.range(0, 0.3) : hasD ? Math.max(0.3, lerp(6, 0.6) * rng.range(0.75, 1.25)) : rng.range(...(SETBACKS[mode] || SETBACKS.tight));
  // each building drifts a little off the line (the offset is approximate, not ruled): ±~0.5 m, rows only a hand's width
  const drift = row ? rng.range(-0.12, 0.2) : rng.range(-0.45, 0.85);
  const gap = row ? 0 : hasD ? Math.max(0.6, lerp(2.8, 0.7) * rng.range(0.8, 1.2)) : rng.range(0.8, 2);
  let w = row ? F.w : hasD ? Math.max(4, (F.w - 2 * gap) * lerp(0.6, 1.0) * rng.range(0.85, 1.0)) : Math.min(rng.range(ks.w[0], ks.w[1] * 1.15), F.w - 2 * gap);
  if (hasD && !row) w = Math.min(w, ks.w[1] * 1.6);
  let d = hasD ? Math.min((F.d - set - 3) * lerp(0.35, 0.7) * rng.range(0.85, 1.1), ks.d[1] * (row ? 1.8 : 1.5)) : Math.min(rng.range(ks.d[0], ks.d[1]) * (row ? 1.3 : 1.1), F.d - set - 3);
  if (hasD) d = Math.max(Math.min(ks.d[0], F.d - set - 3), d);
  // row houses run back with the plot: on a deep (narrow-front) plot the building is long, on a shallow (wide) one short;
  // a backyard of at least ~4 m stays behind it
  if (row) d = Math.max(Math.min(ks.d[0], F.d - set - 3), Math.min(30, F.d - set - 4, (F.d - set) * (hasD ? lerp(0.45, 0.72) : 0.55) * rng.range(0.9, 1.08)));
  if (w < 4 || d < 4) return null;
  const fx = kind === 'den' && DEN_FIXED[o.layout]; if (fx) { w = Math.min(F.w, fx[0]); d = Math.min(F.d - set - 1, fx[1]); }
  let shape = rng.weighted(SHAPES[kind] || SHAPES.house);
  if (row && shape !== 'rect' && shape !== 'L') shape = 'rect';
  if ((shape === 'U' || shape === 'courtyard' || shape === 'H') && (w < 11 || d < 9)) shape = 'L';
  if (shape === 'L' && (w < 7 || d < 7)) shape = 'rect';
  if (shape === 'courtyard') d = Math.min(F.d - set - 2, Math.max(d, w * 0.9));
  const floors = hasD && !['hall', 'chapel', 'warehouse', 'barn', 'garage', 'shed'].includes(kind) ? (D < 0.7 ? +rng.weighted({ 1: 100, 2: 3 }) : ((t) => +rng.weighted({ 1: 10 - 8.5 * t, 2: 0.3 + 4.7 * t, 3: 1.4 * t }))((D - 0.7) / 0.3)) : kind === 'house' ? +rng.weighted({ 1: 7, 2: 2 }) : ['shop', 'cantina', 'office', 'store', 'cafe', 'posada'].includes(kind) ? +rng.weighted({ 1: 4, 2: 3 }) : ['hall', 'chapel'].includes(kind) ? 1 : +rng.weighted({ 1: 9, 2: 1 });
  const origin = rng.weighted(o.origins || { new: 5, mixed: 2, prewar: 2 });
  const material = origin === 'new' ? rng.weighted({ adobe: 5, stone: 0.25, plaster: 1.5, block: 0.6, timber: 0.4 }) : origin === 'mixed' ? rng.weighted({ adobe: 3, stone: 0.2, block: 1, plaster: 0.6 }) : rng.weighted({ concrete: 2, block: 2, plaster: 2, brick: 0.6 });
  const off = row ? 0 : rng.chance(0.5) ? 0 : (rng.chance(0.5) ? 1 : -1) * Math.max(0, (F.w - w) / 2 - gap) * rng.range(0.3, 1);
  const [ox, oz] = toWorld(off, -(Math.max(0, set + drift) + d / 2), F.rot);
  const st = {
    kind, shape, size: [Math.round(w * 4) / 4, Math.round(d * 4) / 4], floors, origin, material,
    ...(origin === 'mixed' ? { newShare: Math.round(rng.range(0.3, 0.9) * 20) / 20 } : {}),
    ...(origin === 'prewar' && rng.chance(0.55) ? { adapt: [...new Set([rng.chance(0.7) ? 'bricked' : null, rng.chance(0.4) ? 'leanto' : null, rng.chance(0.3) ? 'newroof' : null].filter(Boolean))] } : {}),
    at: [Math.round((F.front[0] + ox) * 100) / 100, Math.round((F.front[1] + oz) * 100) / 100], rot: Math.round(F.deg * 10) / 10, plot: pl.id, snap: false,
  };
  if (row) st.row = true;
  if (o.layout) st.layout = o.layout;
  if (shape === 'L' || shape === 'stepped') st.flip = rng.chance(0.5);
  if (!['warehouse', 'barn', 'chapel', 'shed', 'outhouse'].includes(kind) && origin !== 'ruin') {
    const R = row ? { flat: 3, mud: 1 } : ROOF_ODDS[material] || ROOF_ODDS.plaster;
    [st.roof, st.roofMat] = ROOF_STYLES[rng.weighted(R)];
  }
  if (!row && kind !== 'garage' && (shape !== 'rect' || w >= 8) && (floors > 1 ? rng.chance(0.45) : !hasD && rng.chance(0.25))) st.heights = 'mixed';
  if (['shop', 'cantina'].includes(kind) && rng.chance(0.5)) st.porch = rng.chance(0.5) ? true : { roof: rng.pick(['latilla', 'corrugated', 'thatch']) };
  // porches never reach into the street: decide it here and set the building back by its depth (rows: none)
  { const pr = new RNG(`${seed}:${pl.id}:porch:${o.v || 0}`);
    if (kind === 'house' && st.porch === undefined && origin !== 'prewar') st.porch = pr.chance(0.4) ? { roof: pr.pick(['latilla', 'latilla', 'corrugated']) } : false;
    if (kind === 'cantina' && st.porch === undefined) st.porch = true;
    if (row) st.porch = false;
    if (st.porch) {
      const dp = 2.4, room = F.d - (Math.max(0, set + drift) + d) - 1.2; // what's left behind the building
      if (room < dp + 0.4) st.porch = false;
      else { if (typeof st.porch === 'object') st.porch.depth = dp; else st.porch = { depth: dp }; const [px, pz] = toWorld(0, -(dp + 0.4), F.rot); st.at = [Math.round((st.at[0] + px) * 100) / 100, Math.round((st.at[1] + pz) * 100) / 100]; }
    } }
  if (kind === 'house' && rng.chance(0.35)) st.extras = ['tinaco'];
  // odd-shaped plots: shrink until the footprint sits inside the plot
  const fits = () => { const r = (st.rot * Math.PI) / 180; return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([u, v]) => { const [x, z] = toWorld((u * st.size[0] * 0.48), (v * st.size[1] * 0.48), r); return pointInPoly(st.at[0] + x, st.at[1] + z, pl.poly); }); };
  const w0 = w, d0 = d, at0 = [...st.at], size0 = [...st.size];
  for (let k = 0; k < 6 && !fits(); k++) {
    w *= 0.88; d *= 0.9;
    if (w < 4 || d < 4) return null;
    const [ax, az] = toWorld(off * 0.8 ** (k + 1), -(set + d / 2), F.rot);
    st.size = [Math.round(w * 4) / 4, Math.round(d * 4) / 4]; st.at = [Math.round((F.front[0] + ax) * 100) / 100, Math.round((F.front[1] + az) * 100) / 100];
    if (st.shape !== 'rect' && (w < 7 || d < 7)) st.shape = 'rect';
  }
  // still out (a skewed or clipped plot): slide it across and back inside the plot, then step the size down, before
  // giving up — an empty plot should be a choice ('use:vacant'), not a misfit
  if (!fits()) {
    st.shape = 'rect'; let ok = false;
    const C = pl.poly.reduce((m, q) => [m[0] + q[0] / pl.poly.length, m[1] + q[1] / pl.poly.length], [0, 0]), [cu, cv] = toLocal(C[0] - F.front[0], C[1] - F.front[1], F.rot);
    for (const sc of [0.92, 0.8, 0.68, 0.56]) {
      const sw = Math.max(4, Math.round(w0 * sc * 4) / 4), sd = Math.max(4, Math.round(d0 * sc * 4) / 4); st.size = [sw, sd];
      const v0 = -(set + sd / 2);
      for (const [du, dv] of [[0, v0], [cu, v0], [cu, cv], [cu * 0.5, v0], [-1.5, v0], [1.5, v0], [-3, v0], [3, v0], [cu, v0 - 2], [0, v0 - 2], [cu, v0 - 4], [cu * 0.5, cv]]) {
        const [ax, az] = toWorld(du, dv, F.rot);
        st.at = [Math.round((F.front[0] + ax) * 100) / 100, Math.round((F.front[1] + az) * 100) / 100];
        if (fits()) { ok = true; break; }
      }
      if (ok) break;
    }
    if (!ok) return null;
    if (st.porch) st.porch = false;
  }
  return st;
}

// fences along plot lines. One per shared line (stronger style wins), a street gate, cut at buildings.
const SECURE = new Set(['slavers', 'caravan', 'cult', 'chemden', 'fightpit']);
export function plotFences(plots, structures, seed, solids) {
  const edges = new Map();
  const key = (p, q) => { const a = p.map((v) => Math.round(v * 4)), b = q.map((v) => Math.round(v * 4)); return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}|${b}` : `${b}|${a}`; };
  const styleOf = (pl) => {
    if (pl.fence && pl.fence !== 'auto') return pl.fence;
    const rng = new RNG(`${seed}:pfence:${pl.id}:${pl.v || 0}`);
    if (pl.use === 'empty' || pl.use === 'vacant') return rng.chance(0.75) ? 'none' : 'stone_ruin'; // nobody walls an empty lot
    // ocotillo cane fences go round fields, orchards and gardens; a house plot only rarely gets one
    const farm = ['field', 'fallow', 'orchard', 'corral', 'vineyard', 'farmstead', 'era'].includes(pl.use);
    return rng.weighted(farm ? { ocotillo: 3, stone_low: 2, pole: 1.5, wire: 1.2, wood: 0.8, adobe: 0.5, none: 1 } : { adobe: 3, block: 1.5, stone_low: 2, ocotillo: 0.25, wood: 1, pole: 1, wire: 0.6, none: 1 });
  };
  const rowIds = new Set(), rowPl = new Set(); for (const st of structures || []) if (st.row) { rowIds.add(st.id); if (st.plot) rowPl.add(st.plot); }
  // a building built up to the street line (within ~0.6 m of the front edge) makes the facade the street wall too
  const atFront = (pl) => {
    const [fa, fb] = [pl.poly[0], pl.poly[1]], L = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]) || 1;
    for (const st of structures || []) {
      if ((st.plot !== pl.id && st.inPlot !== pl.id) || !st._masses?.length) continue;
      for (const m of st._masses) { if (m.w * m.d < 12) continue; const c = Math.cos(m.r), sn = Math.sin(m.r);
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = m.cx + (u * m.w) / 2 * c + (v * m.d) / 2 * sn, z = m.cz - (u * m.w) / 2 * sn + (v * m.d) / 2 * c;
          if (Math.abs((fb[0] - fa[0]) * (z - fa[1]) - (fb[1] - fa[1]) * (x - fa[0])) / L < 0.6) return true; } }
    }
    return false;
  };
  const rowFront = (pl) => (!pl.use || pl.use === 'building' || pl.use === 'multifamily') && (pl.row || rowPl.has(pl.id) || (pl.building != null && rowIds.has(pl.building)) || atFront(pl)); // compounds (camps, yards, markets…) always walled all round; row mode, a row building, or built to the street line
  // row houses: the side walls start behind the building (its back wall line), never out in front of it by the porch
  const byId = new Map((structures || []).map((st) => [st.id, st]));
  const rowClip = (pl) => {
    if (!rowFront(pl)) return null;
    const st = byId.get(pl.building) || (structures || []).find((q) => q.plot === pl.id && q._masses?.length) || (structures || []).find((q) => q.inPlot === pl.id && !q._sub && q._masses?.length); if (!st?._masses?.length) return null;
    const [fa, fb] = [pl.poly[0], pl.poly[1]], L = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]) || 1;
    const dist = (x, z) => Math.abs((fb[0] - fa[0]) * (z - fa[1]) - (fb[1] - fa[1]) * (x - fa[0])) / L;
    let depth = 0;
    for (const m of st._masses) { const c = Math.cos(m.r), sn = Math.sin(m.r); for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const lu = (u * m.w) / 2, lv = (v * m.d) / 2; depth = Math.max(depth, dist(m.cx + lu * c + lv * sn, m.cz - lu * sn + lv * c)); } }
    return depth > 0.5 ? { dist, depth } : null;
  };
  for (const pl of plots) {
    if (pl.use === 'visitors' || pl.use === 'wayhouse') continue; // these build their own wall
    const style = styleOf(pl);
    if (style === 'none') continue;
    const clip = rowClip(pl);
    for (let e = 0; e < pl.poly.length; e++) {
      const a = pl.poly[e], b = pl.poly[(e + 1) % pl.poly.length];
      if (e === 0 && (pl.frontFence === false || pl.use === 'market' || rowFront(pl))) continue; // row houses: the facade is the street line
      if (pl.noFence?.includes(e)) continue;
      const k = key(a, b), cur = edges.get(k);
      if (cur && clip) (cur.clips ||= []).push(clip);
      const rank = (SECURE.has(pl.use) ? 100 : 0) + (STRONG[style] ?? 0); // guarded compounds keep their own wall on a shared line
      if (cur && (cur.rank ?? STRONG[cur.style] ?? 0) >= rank) continue;
      edges.set(k, { a, b, style, rank, owner: pl.id, e, front: e === 0 && !(cur && cur.front === false), h: pl.fenceH, paint: pl.fencePaint, glass: pl.fenceGlass, barbed: pl.fenceBarbed, clips: [...(cur?.clips || []), ...(clip ? [clip] : [])] });
    }
  }
  // a fence gives way only where it runs through a building or right along its wall line (within 0.15 m), never
  // because a building (or its porch) merely stands next to it
  const bodies = (structures || []).flatMap((st) => st._masses || []);
  // a coarse grid over the building masses: every point test only looks at the few masses near it
  const GC = 8, mg = new Map(), gk = (i, j) => i * 73856093 ^ j * 19349663;
  for (const m of bodies) { const r = Math.hypot(m.w, m.d) / 2 + 0.6; for (let i = Math.floor((m.cx - r) / GC); i <= Math.floor((m.cx + r) / GC); i++) for (let j = Math.floor((m.cz - r) / GC); j <= Math.floor((m.cz + r) / GC); j++) { const k = gk(i, j); if (!mg.has(k)) mg.set(k, []); mg.get(k).push(m); } }
  const NONE = [], nearM = (x, z) => mg.get(gk(Math.floor(x / GC), Math.floor(z / GC))) || NONE;
  const inSolid = (x, z) => nearM(x, z).some((s) => { const dx = x - s.cx, dz = z - s.cz, c = Math.cos(s.r), sn = Math.sin(s.r); return Math.abs(dx * c - dz * sn) <= s.w / 2 + 0.15 && Math.abs(dx * sn + dz * c) <= s.d / 2 + 0.15; });
  // row houses: a shared side line starts at the back of the shallower of the two houses (so the yard wall meets it);
  // along the deeper one it is cut only where that house stands on (or right by) the line
  const nearMass = (x, z, k) => nearM(x, z).some((m) => { const dx = x - m.cx, dz = z - m.cz, c = Math.cos(m.r), sn = Math.sin(m.r); return Math.abs(dx * c - dz * sn) <= m.w / 2 + k && Math.abs(dx * sn + dz * c) <= m.d / 2 + k; });
  const clipped = (e, x, z) => { if (!e.clips?.length) return false; const dmin = Math.min(...e.clips.map((c) => c.depth)), d = e.clips[0].dist(x, z);
    if (d < dmin - 0.05) return true; return e.clips.some((c) => c.dist(x, z) < c.depth - 0.05) && nearMass(x, z, 0.7); };
  const walls = [];
  const userGates = plots.flatMap((pl) => pl.gates || []);
  const baked = new Set(plots.filter((pl) => pl.bakedFence).map((pl) => pl.id));
  for (const e of edges.values()) {
    if (baked.has(e.owner)) continue; // edited plot: its fences are spec walls now
    let n = 0;
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    if (L < 1) continue;
    const steps = Math.max(2, Math.ceil(L / 0.5));
    const runs = []; let cur = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = e.a[0] + (e.b[0] - e.a[0]) * t, z = e.a[1] + (e.b[1] - e.a[1]) * t;
      if (inSolid(x, z) || clipped(e, x, z)) { cur = null; continue; }
      if (!cur) { cur = { t0: t }; runs.push(cur); }
      cur.t1 = t;
    }
    // a run that stops at a building runs on right into its wall (no gap): extend the end until it is just
    // inside the building's footprint
    const inMass = (x, z, k) => nearM(x, z).some((m) => { const dx = x - m.cx, dz = z - m.cz, c = Math.cos(m.r), sn = Math.sin(m.r); return Math.abs(dx * c - dz * sn) <= m.w / 2 + k && Math.abs(dx * sn + dz * c) <= m.d / 2 + k; });
    const Pt = (t) => [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
    for (const r of runs) for (const [end, dir] of [['t1', 1], ['t0', -1]]) {
      if ((dir > 0 && r.t1 >= 1) || (dir < 0 && r.t0 <= 0)) continue;
      // reach the building (its box grown 0.3 m, so a fence running along a wall line counts), then push on
      // until just inside the wall — or 0.3 m further when it runs along the wall line itself
      let hit = null;
      for (let d = 0.02; d <= 1.6; d += 0.02) { const t = r[end] + (dir * d) / L; if (t < 0 || t > 1) break; if (inMass(...Pt(t), 0.3)) { hit = t; break; } }
      if (hit == null) continue;
      let t2 = Math.min(1, Math.max(0, hit + (dir * 0.6) / L));
      for (let d = 0; d <= 0.6; d += 0.02) { const t = hit + (dir * d) / L; if (t < 0 || t > 1) break; if (inMass(...Pt(t), -0.1)) { t2 = t; break; } }
      r[end] = t2;
    }
    for (const r of runs) {
      const len = (r.t1 - r.t0) * L;
      if (len < 1.6) continue;
      const P = (t) => [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
      const A = P(r.t0), B = P(r.t1), dx = B[0] - A[0], dz = B[1] - A[1];
      const gates = userGates.map((g) => { const t = ((g.at[0] - A[0]) * dx + (g.at[1] - A[1]) * dz) / (len * len), d = Math.abs((g.at[0] - A[0]) * dz - (g.at[1] - A[1]) * dx) / len; return t > 0 && t < 1 && d < 0.6 ? { s: t * len, width: g.width || 3, ...(g.leaf ? { leaf: g.leaf } : {}), ...(g.state ? { state: g.state } : {}), ...(g.posts === false ? { posts: false } : {}) } : null; }).filter(Boolean);
      // no automatic gates: plots are closed until a gate is added with the Gate tool
      // an end left short of a house that stands a little in from the line (row houses): a short return to its wall
      const hook = (q) => { let best = null, bd = 1.6; for (const m of nearM(q[0], q[1])) { const c = Math.cos(m.r), sn = Math.sin(m.r), dx = q[0] - m.cx, dz = q[1] - m.cz, u = Math.max(-m.w / 2 + 0.1, Math.min(m.w / 2 - 0.1, dx * c - dz * sn)), v = Math.max(-m.d / 2 + 0.1, Math.min(m.d / 2 - 0.1, dx * sn + dz * c)), p2 = [m.cx + u * c + v * sn, m.cz - u * sn + v * c], d = Math.hypot(p2[0] - q[0], p2[1] - q[1]); if (d > 0.25 && d < bd) { bd = d; best = p2; } } return best; };
      const hA = r.t0 > 0.001 ? hook(A) : null, hB = r.t1 < 0.999 ? hook(B) : null;
      if (hA) for (const g of gates) g.s += Math.hypot(hA[0] - A[0], hA[1] - A[1]);
      walls.push({ id: `${e.owner}-fence-${e.e}-${n++}`, type: e.style, path: [...(hA ? [hA] : []), P(r.t0), P(r.t1), ...(hB ? [hB] : [])], height: e.h ?? HEIGHT[e.style], ...(e.paint != null ? { paint: e.paint } : {}), ...(e.glass ? { glass: true } : {}), ...(e.barbed ? { barbed: e.barbed } : {}), condition: 0.7, gates, _plot: e.owner });
    }
  }
  return walls;
}

// nearest road position for a point: { road, s, side, d }
export function nearestRoadPos(roads, x, z, maxD = 30) {
  let best = null;
  for (const r of roads) {
    if (r._gate || r.type === 'path') continue;
    const q = nearestOnSamples(r.samples, x, z);
    if (q.d > maxD + r.hw) continue;
    if (!best || q.d - r.hw < best.d) {
      const a = r.samples[q.i], b = r.samples[Math.min(q.i + 1, r.samples.length - 1)];
      const s = a.s + (b.s - a.s) * q.t;
      const side = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x) >= 0 ? 1 : -1;
      best = { road: r, s, side, d: q.d - r.hw };
    }
  }
  return best;
}
export { pointInPoly, toLocal };

// row buildings that touch across a shared plot line get party walls on that side (no windows / doors)
export function rowParty(spec) {
  const S = spec.structures || [], P = new Map((spec.plots || []).map((p) => [p.id, p]));
  const rows = S.filter((s) => s.plot && s.row);
  for (const s of rows) delete s.party;
  for (const s of rows) {
    const r = (s.rot * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
    for (const o of rows) {
      if (o === s || Math.abs(((o.rot - s.rot + 540) % 360) - 180) > 8) continue;
      const dx = o.at[0] - s.at[0], dz = o.at[1] - s.at[1], lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      if (Math.abs(lz) > 3 || Math.abs(Math.abs(lx) - (s.size[0] + o.size[0]) / 2) > 0.8) continue;
      (s.party ||= []).push(lx > 0 ? 'right' : 'left');
    }
  }
}

// fields / areas that plots turn into (plot.use): field | fallow | orchard | corral | visitors | market
export const PLOT_USES = ['building', 'empty', 'vacant', 'field', 'fallow', 'orchard', 'corral', 'visitors', 'market', 'wayhouse', 'plaza', 'cemetery', 'vineyard', 'era', 'brickyard', 'salvage', 'acopio', 'lienzo', 'outskirts', 'outgrounds', 'farmstead', 'mystic', 'farmers_market', 'trader', 'multifamily', 'slavers', 'caravan', 'chemden', 'fightpit', 'scavmarket', 'cult'];
export function plotDerived(spec) {
  const fields = [], areas = [];
  for (const pl of spec.plots || []) {
    if (!pl.id || !pl.use || pl.use === 'building' || pl.use === 'empty') continue;
    const id = `${pl.id}:use`, poly = shrink(pl.poly, 0.6), baked = pl.bakedUse === pl.use;
    if (baked && !['visitors', 'market', 'wayhouse'].includes(pl.use)) continue; // a spec field now
    if (pl.use === 'field' || pl.use === 'fallow') fields.push({ id, type: 'field', poly, crop: pl.crop || 'corn', ...(pl.use === 'fallow' ? { fallow: true } : {}), ...(pl.water ? { water: pl.water } : {}), _plot: pl.id });
    else if (pl.use === 'orchard') fields.push({ id, type: 'orchard', poly, tree: pl.tree || 'fruit_tree', spacing: 6, ...(pl.water ? { water: pl.water } : {}), _plot: pl.id });
    else if (pl.use === 'corral') fields.push({ id, type: 'corral', poly, animals: { brahmin: Math.max(1, Math.min(8, Math.round(polyArea(pl.poly) / 90))) }, _plot: pl.id });
    else if (pl.use === 'visitors' || pl.use === 'market' || pl.use === 'wayhouse') {
      // layout frame: the plot's bounding box in the street-facing frame; the polygon clips the contents
      const F = plotFrame(pl), P = shrink(pl.poly, 0.6);
      const L = P.map((q) => toLocal(q[0] - F.front[0], q[1] - F.front[1], F.rot));
      const u0 = Math.min(...L.map((q) => q[0])), u1 = Math.max(...L.map((q) => q[0])), v0 = Math.min(...L.map((q) => q[1])), v1 = Math.max(...L.map((q) => q[1]));
      const [cx, cz] = toWorld((u0 + u1) / 2, (v0 + v1) / 2, F.rot), A = polyArea(P);
      areas.push({ id, type: pl.use, name: pl.name || (pl.use === 'market' ? 'Market' : pl.use === 'wayhouse' ? 'Casa de Paso' : "Visitors' grounds"), stats: pl.stats, at: [F.front[0] + cx, F.front[1] + cz], size: [Math.max(10, u1 - u0), Math.max(10, v1 - v0)], rot: F.deg, poly: P, brahmin: Math.round(A / 160), ...(pl.density != null ? { fill: pl.density } : {}), ...(pl.life != null ? { life: pl.life } : {}), ...(pl.wealth ? { wealth: pl.wealth } : {}), tents: Math.round(A / 260), _plot: pl.id, ...(baked ? { baked: true } : {}) });
    }
  }
  return { fields, areas };
}
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); }
function shrink(P, d) { const c = P.reduce((a, q) => [a[0] + q[0] / P.length, a[1] + q[1] / P.length], [0, 0]); return P.map(([x, z]) => { const L = Math.hypot(x - c[0], z - c[1]) || 1; return [+(x - ((x - c[0]) / L) * d).toFixed(2), +(z - ((z - c[1]) / L) * d).toFixed(2)]; }); }

// split a plot into two along its depth (two narrower plots); merge two neighbours sharing a side line
export function splitPlot(pl) {
  const [a, b, c, d] = pl.poly, m = (p, q) => [+((p[0] + q[0]) / 2).toFixed(2), +((p[1] + q[1]) / 2).toFixed(2)];
  const fm = m(a, b), bm = m(d, c);
  const base = { ...pl }; delete base.id; delete base.building; delete base.name; delete base.stats;
  const sm = pl.s0 != null ? +((pl.s0 + pl.s1) / 2).toFixed(2) : null;
  return [{ ...base, poly: [a, fm, bm, d], ...(sm != null ? { s1: sm } : {}) }, { ...base, poly: [fm, b, c, bm], ...(sm != null ? { s0: sm } : {}) }];
}
export function mergeablePair(plots, pl) {
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.3;
  for (const q of plots) {
    if (q === pl || q.poly.length !== 4 || pl.poly.length !== 4) continue;
    if (near(pl.poly[1], q.poly[0]) && near(pl.poly[2], q.poly[3])) return { other: q, poly: [pl.poly[0], q.poly[1], q.poly[2], pl.poly[3]], left: pl, right: q };
    if (near(q.poly[1], pl.poly[0]) && near(q.poly[2], pl.poly[3])) return { other: q, poly: [q.poly[0], pl.poly[1], pl.poly[2], q.poly[3]], left: q, right: pl };
  }
  return null;
}

// after a road's path changes: plots laid along it slide with it (nearest point on the new road), and
// their buildings keep their place within the plot
export function refitPlots(spec, road, frontAtFn, nearestS) {
  for (const pl of spec.plots || []) {
    if (pl.road !== road.id || pl.custom || pl.s0 == null) continue;
    const F0 = plotFrame(pl);
    const w = pl.s1 - pl.s0, sm = nearestS(F0.front[0], F0.front[1]);
    const s0 = Math.max(0, sm - w / 2), s1 = s0 + w;
    const A = frontAtFn(s0, pl.side, pl.verge ?? 1), B = frontAtFn(s1, pl.side, pl.verge ?? 1), d = pl.depth || F0.d;
    const r2 = (v) => Math.round(v * 100) / 100;
    pl.poly = [[A.x, A.z], [B.x, B.z], [B.x + B.nx * d, B.z + B.nz * d], [A.x + A.nx * d, A.z + A.nz * d]].map((q) => q.map(r2));
    pl.s0 = r2(s0); pl.s1 = r2(s1);
    const F1 = plotFrame(pl);
    for (const st of spec.structures || []) {
      if (st.plot !== pl.id) continue;
      const [lx, lz] = toLocal(st.at[0] - F0.front[0], st.at[1] - F0.front[1], F0.rot);
      const [x, z] = toWorld(lx, lz, F1.rot);
      st.at = [r2(F1.front[0] + x), r2(F1.front[1] + z)];
      st.rot = Math.round((st.rot + F1.deg - F0.deg) * 10) / 10;
    }
  }
}

// union of touching plots (shift-select + Merge): shared edges cancel, T-junctions are split first. Returns
// { ok, poly, why }. The result keeps the first plot's winding and its street front as edge 0.
export function unionPlots(list) {
  if (!list || list.length < 2) return { ok: false, why: 'Select two or more plots' };
  const TOL = 0.35, V = [], snap = (p) => { for (let i = 0; i < V.length; i++) if (Math.hypot(V[i][0] - p[0], V[i][1] - p[1]) < TOL) return i; V.push([p[0], p[1]]); return V.length - 1; };
  const rings = list.map((pl) => ccw(pl.poly).map(snap));
  const onSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) return -1; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2; if (t <= 0.001 || t >= 0.999) return -1; return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t) < TOL ? t : -1; };
  const edges = []; // [from, to, plotIndex]
  rings.forEach((R, k) => { for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; if (a === b) continue;
    const mids = []; for (let vi = 0; vi < V.length; vi++) { if (vi === a || vi === b) continue; const t = onSeg(V[vi], V[a], V[b]); if (t > 0) mids.push([t, vi]); }
    mids.sort((x, y) => x[0] - y[0]); const ch = [a, ...mids.map((m) => m[1]), b];
    for (let j = 0; j < ch.length - 1; j++) edges.push([ch[j], ch[j + 1], k]); } });
  // cancel opposite pairs; shared edges link plots
  const key = (a, b) => `${a}>${b}`, map = new Map();
  for (const e of edges) { const k = key(e[0], e[1]); if (!map.has(k)) map.set(k, []); map.get(k).push(e); }
  const par = list.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  const keep = [];
  for (const e of edges) { const rev = map.get(key(e[1], e[0])); if (rev && rev.length) { for (const r of rev) par[find(r[2])] = find(e[2]); continue; } keep.push(e); }
  const roots = new Set(list.map((_, i) => find(i)));
  if (roots.size > 1) return { ok: false, why: 'The selected plots must touch (share an edge)' };
  // chain the outline
  const out = new Map(); for (const e of keep) { if (!out.has(e[0])) out.set(e[0], []); out.get(e[0]).push(e[1]); }
  const loops = [], used = new Set();
  for (const e of keep) { const k0 = key(e[0], e[1]); if (used.has(k0)) continue;
    const L = [e[0]]; let cur = e[1], prev = e[0]; used.add(k0); let guard = 0;
    while (cur !== e[0] && guard++ < 5000) { L.push(cur); const nx = (out.get(cur) || []).find((n) => !used.has(key(cur, n))); if (nx == null) break; used.add(key(cur, nx)); prev = cur; cur = nx; }
    loops.push(L); }
  if (loops.length !== 1) return { ok: false, why: loops.length ? 'Merging these would leave a hole or a pinch' : 'Could not join these plots' };
  let P = loops[0].map((i) => V[i]);
  // drop collinear points
  for (let changed = true; changed && P.length > 3;) { changed = false;
    for (let i = 0; i < P.length; i++) { const a = P[(i + P.length - 1) % P.length], b = P[i], c = P[(i + 1) % P.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (Math.abs(cr) < 0.02 * la * lc || la < 0.05) { P.splice(i, 1); changed = true; break; } } }
  // first plot's winding, its front edge first
  const f = list[0].poly; if (polySigned(f) < 0) P = P.reverse();
  const fm = [(f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2];
  let best = 0, bd = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((fm[0] - a[0]) * dx + (fm[1] - a[1]) * dz) / L2)), d = Math.hypot(fm[0] - a[0] - dx * t, fm[1] - a[1] - dz * t); if (d < bd) { bd = d; best = i; } }
  P = [...P.slice(best), ...P.slice(0, best)].map((q) => [+q[0].toFixed(2), +q[1].toFixed(2)]);
  return { ok: true, poly: P };
}

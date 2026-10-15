// Plot ground surfaces. Soft ones are ground paint (soft edges); hard ones (slab, parking lot, tiles,
// flagstone, brick) are draped meshes with texture aligned to the plot and a crisp kerb / tile-row edge.
// pl.ground = { surface, cover: 'all' | 'yard' | 'patio', fill } — fill is a second surface for the rest.
import * as THREE from 'three';
import { PAINT, ASPHALT } from './palette.js';
import { LAYER, LAYER_SCALE } from './layers.js';
import { RNG } from './rng.js';
import { plotFrame, clipConvex } from './plots.js';
import { toWorld, toLocal, pointInPoly } from './geo.js';

export const SURFACES = {
  natural: { label: 'natural ground' },
  shrubland: { label: 'shrubland', paint: { color: 0x8a8556, layer: 'scrub', alpha: 0.85 } },
  dirt: { label: 'dirt', paint: { color: PAINT.dirt, layer: 'dirt', alpha: 0.9 } },
  packed: { label: 'packed earth', paint: { color: PAINT.packed, layer: 'urban', alpha: 0.9 } },
  caliche: { label: 'packed caliche', paint: { color: 0xd6cbb0, layer: 'urban', alpha: 0.92 } },
  gravel: { label: 'gravel', paint: { color: 0x9e9384, layer: 'gravel', alpha: 0.95 } },
  sand: { label: 'sand', paint: { color: PAINT.sand, layer: null, alpha: 0.9 } },
  tilled: { label: 'tilled', paint: { color: PAINT.tilled, layer: 'till', alpha: 0.9 } },
  cobble: { label: 'cobble', paint: { color: 0x9e958a, layer: 'cobble', alpha: 0.95 } },
  rock: { label: 'bare rock', paint: { color: 0x948572, layer: 'gravel', alpha: 0.8 } },
  slab: { label: 'concrete slab', hard: { layer: 'concrete', color: 0xb4aea2, kerb: 0xa29c90, joints: 3 } },
  lot: { label: 'asphalt lot', hard: { layer: 'lot', color: 0x67635d, kerb: 0xa29c90, bays: true } },
  saltillo: { label: 'Saltillo terracotta', hard: { layer: 'saltillo', color: 0xb86a44, kerb: 0x8e4a30 } },
  encaustic: { label: 'cement tiles (pasta)', hard: { layer: 'encaustic', color: 0x9a9a9a, kerb: 0x7a3626, border: true } },
  laja: { label: 'laja flagstone', hard: { layer: 'laja', color: 0xa69478, kerb: 0x8a7a62 } },
  brick: { label: 'adobe brick (herringbone)', hard: { layer: 'herringbone', color: 0xa8603e, kerb: 0x8a4a30 } },
};
export const COVERS = { all: 'whole plot', yard: 'yard round the building', patio: 'front patio + path to the gate' };

// defaults when the plot doesn't say: rolled per plot, richer finishes get better floors
export function rollGround(pl, st, seed) {
  const r = new RNG(`${seed}:ground:${pl.id}:${pl.v || 0}`);
  const tier = typeof st?.finish === 'string' ? st.finish : st?.finish?.tier;
  const prewar = st && ['prewar', 'maintained', 'repurposed', 'rebuilt', 'built_on_ruin'].includes(st.origin);
  if (pl.use === 'market') return { surface: r.pick(['packed', 'cobble']), cover: 'all' };
  if (pl.use === 'wayhouse' || pl.use === 'visitors') return { surface: 'packed', cover: 'all' };
  if (pl.use && pl.use !== 'building') return { surface: 'natural', cover: 'all' };
  if (!st) return { surface: 'natural', cover: 'all' };
  if (prewar) return r.weighted([[{ surface: 'slab', cover: 'patio', fill: 'packed' }, 2], [{ surface: 'lot', cover: 'all' }, ['shop', 'garage', 'office', 'warehouse'].includes(st.kind) ? 2 : 0.3], [{ surface: 'packed', cover: 'yard' }, 2]]);
  switch (tier) {
    case 'showpiece': return r.weighted([[{ surface: 'encaustic', cover: 'patio', fill: 'laja' }, 2], [{ surface: 'saltillo', cover: 'yard', fill: 'caliche' }, 2]]);
    case 'ornate': return r.weighted([[{ surface: 'encaustic', cover: 'patio', fill: 'caliche' }, 1.5], [{ surface: 'laja', cover: 'patio', fill: 'packed' }, 1], [{ surface: 'saltillo', cover: 'patio', fill: 'packed' }, 1.5]]);
    case 'decorated': return r.weighted([[{ surface: 'saltillo', cover: 'patio', fill: 'packed' }, 2], [{ surface: 'laja', cover: 'patio', fill: 'packed' }, 1.5], [{ surface: 'brick', cover: 'patio', fill: 'caliche' }, 1]]);
    case 'painted': case 'wash': return r.weighted([[{ surface: 'caliche', cover: 'yard' }, 2], [{ surface: 'packed', cover: 'yard' }, 2], [{ surface: 'brick', cover: 'patio', fill: 'packed' }, 0.6]]);
    default: return r.weighted([[{ surface: 'packed', cover: 'yard' }, 3], [{ surface: 'dirt', cover: 'yard' }, 1], [{ surface: 'natural', cover: 'all' }, 1]]);
  }
}

const inset = (P, d) => { const c = P.reduce((a, q) => [a[0] + q[0] / P.length, a[1] + q[1] / P.length], [0, 0]); return P.map(([x, z]) => { const L = Math.hypot(x - c[0], z - c[1]) || 1; return [x - ((x - c[0]) / L) * d, z - ((z - c[1]) / L) * d]; }); };
// building footprint (oriented box) of the plot's building, grown by g
const footBox = (st, g) => { const r = ((st.rot || 0) * Math.PI) / 180, [w, d] = st.size; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const [x, z] = toWorld((a * (w + 2 * g)) / 2, (b * (d + 2 * g)) / 2, r); return [st.at[0] + x, st.at[1] + z]; }); };

// polygons the surface covers: [{ poly, path? }]
export function groundRegions(pl, st, cover) {
  const P = inset(pl.poly, 0.35);
  if (cover === 'all' || !st?.size) return [P];
  if (cover === 'yard') { const R = clipConvex(P.map((q) => q.slice()), footBox(st, 2.6)); return R.length >= 3 ? [R] : [P]; }
  // patio along the building front + a path from it to the gate (or the middle of the street side)
  const r = ((st.rot || 0) * Math.PI) / 180, [w, d] = st.size;
  const L = (u, v) => { const [x, z] = toWorld(u, v, r); return [st.at[0] + x, st.at[1] + z]; };
  const pd = Math.min(3.2, Math.max(1.8, w * 0.25));
  const patio = clipConvex(P.map((q) => q.slice()), [L(-w / 2 - 0.4, d / 2 - 0.2), L(w / 2 + 0.4, d / 2 - 0.2), L(w / 2 + 0.4, d / 2 + pd), L(-w / 2 - 0.4, d / 2 + pd)]);
  const out = patio.length >= 3 ? [patio] : [];
  const gate = (pl.gates || [])[0]?.at || [(pl.poly[0][0] + pl.poly[1][0]) / 2, (pl.poly[0][1] + pl.poly[1][1]) / 2];
  const s = L(0, d / 2 + pd), dx = gate[0] - s[0], dz = gate[1] - s[1], len = Math.hypot(dx, dz);
  if (len > 1) {
    const ux = dx / len, uz = dz / len, nx = -uz * 0.7, nz = ux * 0.7, e = [gate[0] - ux * 0.3, gate[1] - uz * 0.3];
    const path = clipConvex(P.map((q) => q.slice()), [[s[0] + nx, s[1] + nz], [e[0] + nx, e[1] + nz], [e[0] - nx, e[1] - nz], [s[0] - nx, s[1] - nz]]);
    if (path.length >= 3) out.push(path);
  }
  return out.length ? out : [P];
}

export function groundPaints(pl, g, regions, opts = {}) {
  const out = [], F = SURFACES[g.fill];
  if (F?.paint) out.push({ type: 'poly', poly: inset(pl.poly, 0.35), color: F.paint.color, edge: 0.6, alpha: F.paint.alpha, layer: F.paint.layer, layerK: 1 });
  const S = SURFACES[g.surface];
  if (S?.paint) for (const R of regions) out.push({ type: 'poly', poly: R, color: S.paint.color, edge: 0.5, alpha: S.paint.alpha, layer: S.paint.layer, layerK: 1 });
  if (S?.hard) for (const R of regions) out.push({ type: 'poly', poly: R, color: PAINT.packed, edge: 0.3, alpha: 0.6, layer: 'urban', layerK: 1 }); // under the slab: no grass poking at the edge
  if (S?.paint && CHAR[g.surface]) for (const R of regions) out.push(...groundCharacter(pl, g.surface, R, opts));
  return out;
}

// ground character for soft surfaces: a flat fill reads as a carpet, so break it up the way a used yard looks —
// trampled hard pan where people walk and work, loose dust in the corners, sand drifted against the fence on the
// windward side, gravel scatter, a damp spot, oil / ash stains, weeds creeping in at the edge, tracks from the gate
const CHAR = {
  dirt: { hard: 0xd9c7a0, loose: 0xa98c66, dark: 0x8a7458 },
  packed: { hard: 0xd4c19a, loose: 0xae9470, dark: 0x8c7860 },
  caliche: { hard: 0xe0d6be, loose: 0xc8b896, dark: 0xb4a688 },
  sand: { hard: 0xd6c4a0, loose: 0xe8d8b2, dark: 0xc4b08a },
  gravel: { hard: 0xa89e90, loose: 0xbcae98, dark: 0x8e8478 },
};
function groundCharacter(pl, surf, R, opts = {}) {
  const r = new RNG(`gchar:${pl.id}:${pl.v || 0}:${surf}`), C = CHAR[surf], out = [];
  const n = R.length, A = Math.abs(R.reduce((a, q, i) => { const w = R[(i + 1) % n]; return a + q[0] * w[1] - w[0] * q[1]; }, 0) / 2);
  const xs = R.map((q) => q[0]), zs = R.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const edgeD = (x, z) => { let m = 1e9; for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return m; };
  const spot = (rad) => { for (let k = 0; k < 14; k++) { const x = r.range(x0, x1), z = r.range(z0, z1); if (pointInPoly(x, z, R) && edgeD(x, z) > rad * 0.8) return [x, z]; } return null; };
  const blob = (rad, color, alpha, layer, edge = null) => { const c = spot(rad); if (!c) return; // a few overlapping circles, never a perfect disc
    for (let k = 0; k < r.int(2, 4); k++) { const rr = rad * r.range(0.5, 0.9), a = r.range(0, 6.28), d = rad * r.range(0, 0.55); out.push({ type: 'circle', at: [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d], r: rr, color, edge: edge ?? rr * 0.8, alpha: alpha * r.range(0.75, 1.1), layer, layerK: 1 }); } };
  // 1. big tonal patches: trampled hard pan / loose dust
  for (let k = 0; k < Math.max(3, Math.round(A / 40)); k++) r.chance(0.55) ? blob(r.range(2.5, 6), C.hard, 0.6, 'urban') : blob(r.range(2, 5), C.loose, 0.6, surf === 'gravel' ? 'gravel' : 'dirt');
  // 2. weeds and sand at the edge: a soft band just inside the outline, heavier on the windward side
  const wind = r.range(0, 6.28), wx = Math.cos(wind), wz = Math.sin(wind);
  for (let i = 0; i < n; i++) { const a = R[i], b = R[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue;
    const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, inw = pointInPoly(cx + nx * 0.8, cz + nz * 0.8, R) ? 1 : -1;
    const lee = (nx * inw * wx + nz * inw * wz) > 0.3; // inward normal along the wind: sand piles against this fence
    const P = (t, o) => [a[0] + (b[0] - a[0]) * t + nx * inw * o, a[1] + (b[1] - a[1]) * t + nz * inw * o];
    out.push({ type: 'path', path: [P(0.02, 0.6), P(0.5, 0.6 + r.range(-0.2, 0.3)), P(0.98, 0.6)], width: 1.4, color: 0x9a9468, edge: 1.0, alpha: 0.5, layer: 'scrub', layerK: 1 });
    if (lee) out.push({ type: 'path', path: [P(0.05, 1.0), P(0.35, 1.4 + r.range(0, 0.8)), P(0.7, 1.1), P(0.95, 0.9)], width: r.range(1.6, 2.6), color: PAINT.sand, edge: 1.2, alpha: 0.6, layer: null, layerK: 1 }); }
  // 3. gravel scatter, a damp patch, small dark stains
  if (surf !== 'gravel') for (let k = 0; k < r.int(0, 2) + Math.round(A / 220); k++) blob(r.range(1.2, 3), 0x9a9286, 0.5, 'gravel');
  if (r.chance(0.45)) blob(r.range(1, 2.2), PAINT.wet, 0.5, 'dirt');
  for (let k = 0; k < r.int(1, 3) + Math.round(A / 300); k++) blob(r.range(0.4, 1.1), r.chance(0.5) ? PAINT.oil : C.dark, 0.45, 'dirt', 0.5);
  // 4. trampled ground round the things in the yard, and tracks from the gate to them
  const items = (opts.items || []).filter(([x, z]) => pointInPoly(x, z, R));
  for (const [x, z, rad] of items) out.push({ type: 'circle', at: [x + r.range(-0.3, 0.3), z + r.range(-0.3, 0.3)], r: (rad || 1) + r.range(0.6, 1.4), color: C.hard, edge: 1.2, alpha: 0.5, layer: 'urban', layerK: 1 });
  if (opts.gate) { const tg = items.length ? items.map((q) => [q, r.next()]).sort((a, b) => a[1] - b[1]).slice(0, 3).map((q) => q[0]) : [spot(2), spot(2)].filter(Boolean);
    for (const t of tg) { const mx = (opts.gate[0] + t[0]) / 2 + r.range(-1.5, 1.5), mz = (opts.gate[1] + t[1]) / 2 + r.range(-1.5, 1.5);
      out.push({ type: 'path', path: [opts.gate, [mx, mz], [t[0], t[1]]], width: r.range(1.1, 1.8), color: C.hard, edge: 0.9, alpha: 0.6, layer: 'urban', layerK: 1 }); }
    if (opts.vehicles) for (const sd of [-0.85, 0.85]) { const t = tg[0]; if (!t) break; const dx = t[0] - opts.gate[0], dz = t[1] - opts.gate[1], L = Math.hypot(dx, dz) || 1, px = -dz / L * sd, pz = dx / L * sd;
      out.push({ type: 'path', path: [[opts.gate[0] + px, opts.gate[1] + pz], [t[0] + px, t[1] + pz]], width: 0.35, color: C.dark, edge: 0.25, alpha: 0.55, layer: 'dirt', layerK: 1 }); } }
  return out;
}

// hard surface mesh: plot-aligned UVs, draped, kerb strip round the edge; parking bays / slab joints as thin decals
export function groundMesh(pl, g, regions, terrain) {
  const S = SURFACES[g.surface]?.hard;
  if (!S) return null;
  const F = plotFrame(pl), rot = F.rot, sc = 1 / (LAYER_SCALE[LAYER[S.layer]] || 2);
  const pos = [], uv = [], colA = [], lay = [], win = [];
  const col = new THREE.Color(S.color), kc = new THREE.Color(S.kerb), dark = new THREE.Color(0x2e2c2a), line = new THREE.Color(0xd8d4c8);
  const lift = 0.03;
  const push = (x, z, y, c, L) => { const [lu, lv] = toLocal(x - F.front[0], z - F.front[1], rot); pos.push(x, y, z); uv.push(lu * sc, lv * sc); colA.push(c.r, c.g, c.b); lay.push(L); win.push(-1); };
  const tri = (a, b, c, color, L, dy = 0) => {
    const split = (p, q, r, depth) => {
      const e = Math.max(Math.hypot(p[0] - q[0], p[1] - q[1]), Math.hypot(q[0] - r[0], q[1] - r[1]), Math.hypot(r[0] - p[0], r[1] - p[1]));
      if (e > 1.6 && depth < 8) { // split the longest edge
        const ls = [[p, q, r], [q, r, p], [r, p, q]].sort((A, B) => Math.hypot(B[0][0] - B[1][0], B[0][1] - B[1][1]) - Math.hypot(A[0][0] - A[1][0], A[0][1] - A[1][1]))[0];
        const m = [(ls[0][0] + ls[1][0]) / 2, (ls[0][1] + ls[1][1]) / 2];
        split(ls[0], m, ls[2], depth + 1); split(m, ls[1], ls[2], depth + 1); return;
      }
      // up-facing winding
      const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const [A, B, C] = cr < 0 ? [p, q, r] : [p, r, q];
      for (const v of [A, B, C]) push(v[0], v[1], terrain.height(v[0], v[1]) + lift + dy, color, L);
    };
    split(a, b, c, 0);
  };
  const L = LAYER[S.layer];
  for (const R of regions) {
    const idx = THREE.ShapeUtils.triangulateShape(R.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [a, b, c] of idx) tri(R[a], R[b], R[c], col, L);
    // kerb / tile-row edge: a strip just inside the outline, a hair higher
    const n = R.length, cx = R.reduce((s, q) => s + q[0], 0) / n, cz = R.reduce((s, q) => s + q[1], 0) / n;
    const w = S.border ? 0.22 : 0.12;
    for (let i = 0; i < n; i++) {
      const p = R[i], q = R[(i + 1) % n], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz) || 1;
      let nx = -dz / len, nz = dx / len; if ((cx - p[0]) * nx + (cz - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
      const mo = [(p[0] + q[0]) / 2 - nx * 0.15, (p[1] + q[1]) / 2 - nz * 0.15];
      if (regions.some((O) => O !== R && pointInPoly(mo[0], mo[1], O))) continue; // shared with the patio / path next to it: no kerb across
      const p2 = [p[0] + nx * w, p[1] + nz * w], q2 = [q[0] + nx * w, q[1] + nz * w];
      tri(p, q, q2, kc, S.border ? L : LAYER.concrete, 0.012); tri(p, q2, p2, kc, S.border ? L : LAYER.concrete, 0.012);
    }
  }
  // decals in the plot frame: parking bay lines, slab joints
  const dec = (u0, v0, u1, v1, c, wd) => {
    const [ax, az] = toWorld(u0, v0, rot), [bx, bz] = toWorld(u1, v1, rot), A = [F.front[0] + ax, F.front[1] + az], B = [F.front[0] + bx, F.front[1] + bz];
    const dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz) || 1, nx = (-dz / len) * wd, nz = (dx / len) * wd;
    const steps = Math.max(1, Math.ceil(len / 1.2));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps, t1 = (k + 1) / steps, p = [A[0] + dx * t0, A[1] + dz * t0], q = [A[0] + dx * t1, A[1] + dz * t1];
      if (!regions.some((R) => pointInPoly((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, R))) continue;
      tri([p[0] - nx, p[1] - nz], [q[0] - nx, q[1] - nz], [q[0] + nx, q[1] + nz], c, LAYER.plain, 0.008);
      tri([p[0] - nx, p[1] - nz], [q[0] + nx, q[1] + nz], [p[0] + nx, p[1] + nz], c, LAYER.plain, 0.008);
    }
  };
  if (S.bays) { const fade = line.clone().lerp(new THREE.Color(S.color), 0.45); for (let u = -F.w / 2 + 2.6; u < F.w / 2 - 1; u += 2.6) dec(u, -1.2, u, -6.2, fade, 0.05); }
  if (S.joints) { const jc = col.clone().lerp(dark, 0.35); for (let u = -F.w / 2 + S.joints; u < F.w / 2; u += S.joints) dec(u, 0, u, -F.d, jc, 0.012); for (let v = -S.joints; v > -F.d; v -= S.joints) dec(-F.w / 2, v, F.w / 2, v, jc, 0.012); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  geo.setAttribute('layer', new THREE.Float32BufferAttribute(lay, 1));
  geo.setAttribute('win', new THREE.Float32BufferAttribute(win, 1));
  geo.computeVertexNormals();
  return geo;
}

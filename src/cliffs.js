// Cliffs: sharp edges between two ground surfaces — retaining walls, raised platforms, the fills either
// side of a road crossing an arroyo on a culvert.
//
// The height field (Terrain.raw) is discontinuous along a cliff line. The terrain mesh is a grid, so its
// triangles would smear that jump into a slope; instead the terrain shader discards a narrow band along
// every cliff (a mask texture) and the band is rebuilt here as exact ground strips on each side (terrain
// material, so paint and textures match), plus the wall mesh. Terrain.height() returns the exact surface
// inside the band so things placed there sit right.
import * as THREE from 'three';
import { Builder, col } from './builder.js';
import { RNG, smooth } from './rng.js';
import { MAT, WOOD, METAL } from './palette.js';
import { pointInPoly } from './geo.js';

export const RETAIN_TYPES = { drystone: 'Dry stone', concrete: 'Concrete', adobe: 'Adobe', block: 'Cinder block', gabion: 'Gabion / rubble' };
const R_LAYER = { drystone: 'drystone', concrete: 'concrete', adobe: 'adobe', block: 'block', gabion: 'drystone' };
const R_COL = { drystone: () => MAT.stone.wall, concrete: () => [0xa8a398, 0xb0aba0], adobe: () => MAT.adobe.wall, block: () => MAT.block.wall, gabion: () => [0x9a8f7e, 0x8e8576] };
const THICK = { gabion: 0.9, adobe: 0.55, drystone: 0.5, concrete: 0.35, block: 0.3 };

// ------------------------------------------------------------------ path helpers
// resample a polyline every ~step m, keeping its corners; returns [[x, z]...] (closed: no repeat of first)
export function resample(path, closed, step = 1) {
  const P = closed ? [...path, path[0]] : path, out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (!closed) out.push(P[P.length - 1].slice());
  return out;
}
// unit "high side" normal per point, mitred (scaled so offset lines stay parallel), clamped at sharp turns
export function miterNormals(P, closed, side) {
  const n = P.length, out = [];
  const segN = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [(-dz / L) * side, (dx / L) * side]; }; // left of travel × side
  for (let i = 0; i < n; i++) {
    const prev = closed ? P[(i - 1 + n) % n] : P[Math.max(0, i - 1)], next = closed ? P[(i + 1) % n] : P[Math.min(n - 1, i + 1)];
    let a = i > 0 || closed ? segN(prev, P[i]) : null, b = i < n - 1 || closed ? segN(P[i], next) : null;
    if (!a) a = b; if (!b) b = a;
    let mx = a[0] + b[0], mz = a[1] + b[1]; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
    const cos = mx * a[0] + mz * a[1], k = Math.min(2, 1 / Math.max(0.5, cos));
    out.push([mx * k, mz * k, mx, mz]); // scaled miter, unit
  }
  return out;
}
export function arcLen(P, closed) { const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); if (closed) S.total = S[S.length - 1] + Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]); else S.total = S[S.length - 1]; return S; }
// nearest point on the polyline: distance, side (+1 left of travel), segment, t, arc position, beyond an end?
export function project(P, S, closed, x, z) {
  let best = null;
  const n = P.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const tr = ((x - a[0]) * dx + (z - a[1]) * dz) / L2, t = Math.max(0, Math.min(1, tr));
    const qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz);
    if (!best || d < best.d - 1e-9) best = { d, i, t, side: dx * (z - a[1]) - dz * (x - a[0]) >= 0 ? 1 : -1, s: S[i] + t * Math.sqrt(L2), end: !closed && ((i === 0 && tr < 0) || (i === m - 1 && tr > 1)) };
  }
  return best;
}

// ------------------------------------------------------------------ retaining wall -> terrain zone + cliff
// rt: { id, path, closed?, side (+1 left of drawing = high), mode: 'fill' | 'cut', rise, depth, type, cap,
//       rail, road? (road id the wall was snapped to) }
export function retainZone(rt, T, roads = []) {
  const closed = !!rt.closed && rt.path.length >= 3;
  const P = resample(rt.path, closed, 1.5);
  let side = rt.side || 1;
  if (closed) { // inside is high
    const N0 = miterNormals(P, true, 1)[0];
    side = pointInPoly(P[0][0] + N0[2] * 0.4, P[0][1] + N0[3] * 0.4, P) ? 1 : -1;
  }
  const N = miterNormals(P, closed, side), S = arcLen(P, closed), L = S.total;
  const lowN = P.map((p, i) => T.raw(p[0] - N[i][2] * 1.2, p[1] - N[i][3] * 1.2));
  const highN = P.map((p, i) => T.raw(p[0] + N[i][2] * 1.2, p[1] + N[i][3] * 1.2));
  let mode = rt.mode === 'cut' ? 'cut' : 'fill';
  let rise = rt.rise === 'match' || rt.rise == null ? Math.max(0.4, highN.reduce((a, h, i) => a + h - lowN[i], 0) / P.length) : Math.max(0.2, +rt.rise);
  // snapped to a road: the road sets the level on its side
  const road = rt.road && roads.find((r) => r.id === rt.road);
  let target, revert = false;
  if (road) {
    const bed = (x, z) => { let best = null; for (let i = 0; i < road.samples.length - 1; i++) { const a = road.samples[i], b = road.samples[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t); if (!best || d < best.d) best = { d, h: (a.h ?? 0) + ((b.h ?? 0) - (a.h ?? 0)) * t, x: a.x + dx * t, z: a.z + dz * t }; } return best; };
    const q = bed(P[0][0], P[0][1]), towardRoad = (q.x - P[0][0]) * N[0][2] + (q.z - P[0][1]) * N[0][3];
    mode = towardRoad > 0 ? 'fill' : 'cut';
    target = P.map(([x, z]) => bed(x, z).h);
    revert = true;
  } else target = P.map((_, i) => (mode === 'fill' ? lowN[i] + rise : highN[i] - rise));
  // smooth the target along the wall
  for (let pass = 0; pass < 3; pass++) { const t2 = target.slice(); for (let i = 0; i < P.length; i++) { const a = closed ? target[(i - 1 + P.length) % P.length] : target[Math.max(0, i - 1)], b = closed ? target[(i + 1) % P.length] : target[Math.min(P.length - 1, i + 1)]; t2[i] = 0.25 * a + 0.5 * target[i] + 0.25 * b; } target = t2; }
  // open walls taper into the ground at their ends (wall height -> 0)
  const tl = closed || road ? 0 : Math.min(L / 3, Math.max(2.5, rise * 2.2));
  const lev = P.map((_, i) => {
    const k = tl ? smooth(Math.min(1, S[i] / tl, (L - S[i]) / tl)) : 1;
    return mode === 'fill' ? lowN[i] + (target[i] - lowN[i]) * k : highN[i] - (highN[i] - target[i]) * k;
  });
  if (closed) { const m = lev.reduce((a, b) => a + b, 0) / lev.length; lev.fill(m); }
  const D = rt.depth || 10, blend = Math.max(3, Math.min(12, rise * 2 + 1.5));
  const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]), pad = D + blend + 7;
  const zone = { kind: 'terrace', P, S, closed, side, mode, lev, D, blend, revert, bb: { x0: Math.min(...xs) - pad, z0: Math.min(...zs) - pad, x1: Math.max(...xs) + pad, z1: Math.max(...zs) + pad } };
  T.addTerrace(zone);
  rt._side = side; rt._mode = mode;
  return { id: rt.id, P, closed, side, wall: { type: rt.type || 'drystone', cap: !!rt.cap, rail: !!rt.rail, steps: closed && rt.steps !== false }, owner: rt.id };
}

// Terrain.raw() hook for a terrace zone
export function terraceAt(T, zn, x, z, h, k) {
  const q = project(zn.P, zn.S, zn.closed, x, z);
  if (!q) return h;
  const n = zn.P.length, a = zn.lev[q.i], b = zn.lev[(q.i + 1) % n], L = a + (b - a) * q.t;
  if (zn.closed) {
    if (pointInPoly(x, z, zn.P)) return zn.mode === 'fill' ? L : h;
    return h;
  }
  if (q.end) return h;
  const high = q.side === zn.side;
  const fillSide = zn.mode === 'fill' ? high : !high; // the side that gets levelled
  if (fillSide) {
    if (q.d <= zn.D) return L;
    if (q.d < zn.D + zn.blend) return h + (L - h) * (1 - smooth((q.d - zn.D) / zn.blend));
    return h;
  }
  if (zn.revert && q.d < 6) return h + (T.natural(x, z, k) - h) * (1 - smooth(Math.max(0, q.d - 4) / 2));
  return h;
}

// ------------------------------------------------------------------ road crossings: fills held by walls
export function roadCliffs(r, T) {
  const out = [], S = r.samples, hw = r.hw + (r.shoulder || 0) * 0.5;
  for (const c of r.cross || []) {
    if (c.mode !== 'culvert' && c.mode !== 'pipe') continue;
    for (const sd of [-1, 1]) {
      const pts = [];
      let started = false;
      for (let i = Math.max(0, c.i0 - 6); i <= Math.min(S.length - 1, c.i1 + 6); i++) {
        const q = S[i], ex = q.x - q.tz * sd * hw, ez = q.z + q.tx * sd * hw;
        const fill = q.h - T.base(q.x - q.tz * sd * (hw + 0.6), q.z + q.tx * sd * (hw + 0.6));
        if (q.steep && fill > 0.15) { pts.push([ex, ez]); started = true; } else if (started) break;
      }
      if (pts.length < 2) continue;
      // high side = toward the road centre: left of travel when sd = -1 (edge on the right)
      const im = S[c.im], ox = im.x - im.tz * sd * hw, oz = im.z + im.tx * sd * hw;
      const P = resample(pts, false, 0.8);
      const sideHigh = -sd; // offset line runs along the road; its left normal points to -sd·n ... see below
      // left-of-travel normal of the edge line equals the road's left normal (-tz, tx); the road centre is
      // at -sd along it
      out.push({ id: `${r.id}:cliff${out.length}`, P, closed: false, side: sideHigh, wall: { type: c.mode === 'culvert' ? 'concrete' : 'drystone', cap: true, rail: false, culvert: { at: [ox, oz], mode: c.mode, floor: T.base(im.x, im.z), w: c.hw * 2 } }, owner: r.id });
    }
  }
  return out;
}

// ------------------------------------------------------------------ mask (terrain discard band)
export function cliffBand(T) { return T.cell * 2.05; }
export function buildCutMask(T, cliffs) {
  const res = 0.25, x0 = -T.W / 2 - 4, z0 = -T.D / 2 - 4, nx = Math.ceil((T.W + 8) / res), nz = Math.ceil((T.D + 8) / res);
  const data = new Uint8Array(nx * nz);
  const band = cliffBand(T), inner = band - 0.22;
  for (const c of cliffs) {
    const S = arcLen(c.P, c.closed);
    const xs = c.P.map((p) => p[0]), zs = c.P.map((p) => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - band - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + band - x0) / res));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - band - z0) / res)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) + band - z0) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res, q = project(c.P, S, c.closed, x, z);
      if (q && !q.end && q.d < inner) data[j * nx + i] = 255;
    }
  }
  return { res, x0, z0, nx, nz, data };
}

// ------------------------------------------------------------------ meshes: ground strips + wall
export function cliffStrips(c, T) {
  const band = cliffBand(T), P = c.P, N = miterNormals(P, c.closed, c.side), n = P.length;
  const ROWS = [0.0, 0.35, 0.7, 1.0];
  const pos = [];
  const grid = (x, z) => T.gridHeight(x, z);
  for (const sg of [1, -1]) { // +1 high side, -1 low side
    const row = (i, r) => { const d = Math.max(0.03, ROWS[r] * band), x = P[i][0] + N[i][0] * sg * d, z = P[i][1] + N[i][1] * sg * d; const y = r === ROWS.length - 1 ? grid(x, z) : T.raw(x, z); return [x, y + 0.012, z]; };
    const m = c.closed ? n : n - 1;
    const rows = P.map((_, i) => ROWS.map((_, r) => row(i, r)));
    for (let i = 0; i < m; i++) {
      const A = rows[i], B = rows[(i + 1) % n];
      for (let r = 0; r < ROWS.length - 1; r++) pos.push(...A[r], ...B[r], ...B[r + 1], ...A[r], ...B[r + 1], ...A[r + 1]);
    }
  }
  return groundGeometry(pos, T);
}

export function groundGeometry(pos, T) {
  for (let i = 0; i < pos.length; i += 9) { // every triangle faces up (the terrain material culls back faces)
    const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
    if (uz * vx - ux * vz < 0) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
  }
  const m = pos.length / 3, Nn = new Float32Array(m * 3), C = new Float32Array(m * 3), B = new Float32Array(m * 4);
  for (let i = 0; i < m; i++) { const nd = T.sampleNode(pos[i * 3], pos[i * 3 + 2], 0); C[i * 3] = nd.c.r; C[i * 3 + 1] = nd.c.g; C[i * 3 + 2] = nd.c.b; B[i * 4 + 1] = nd.dirt; B[i * 4 + 2] = nd.till; B[i * 4 + 3] = nd.scrub; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('blend', new THREE.BufferAttribute(B, 4));
  g.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(m * 3).fill(1), 3));
  g.computeBoundingSphere();
  return g;
}

export function cliffWall(c, T, seed) {
  const b = new Builder(), rng = new RNG(`${seed}:cliff:${c.id}`);
  const w = c.wall, type = w.type, Tk = THICK[type] ?? 0.45, P = c.P, n = P.length, N = miterNormals(P, c.closed, c.side);
  const base = col(rng.pick(R_COL[type]()), 0.03, rng), layer = R_LAYER[type];
  const hi = (i) => T.raw(P[i][0] + N[i][2] * 0.05, P[i][1] + N[i][3] * 0.05);
  const lo = (i) => Math.min(T.raw(P[i][0] - N[i][0] * (Tk + 0.06), P[i][1] - N[i][1] * (Tk + 0.06)), T.raw(P[i][0] - N[i][2] * 0.05, P[i][1] - N[i][3] * 0.05));
  const lip = w.cap ? 0.02 : 0.1;
  const top = P.map((_, i) => hi(i) + lip), bot = P.map((_, i) => lo(i) - 0.5);
  const F = (i, d, y) => [P[i][0] - N[i][0] * d, y, P[i][1] - N[i][1] * d]; // d into the low side
  const m = c.closed ? n : n - 1;
  b.t(layer);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    if (top[i] - bot[i] < 0.55 && top[j] - bot[j] < 0.55) continue;
    const cc = base.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.03);
    // face (low side): split at the ground line so underground vertices don't darken the visible face
    const gi = lo(i) + 0.02, gj = lo(j) + 0.02;
    b.quad(F(i, Tk, bot[i]), F(j, Tk, bot[j]), F(j, Tk, gj), F(i, Tk, gi), cc);
    const rows = Math.max(1, Math.round(Math.max(top[i] - gi, top[j] - gj) / 0.9));
    for (let k = 0; k < rows; k++) {
      const a0 = k / rows, a1 = (k + 1) / rows, yi0 = gi + (top[i] - gi) * a0, yi1 = gi + (top[i] - gi) * a1, yj0 = gj + (top[j] - gj) * a0, yj1 = gj + (top[j] - gj) * a1;
      b.quad(F(i, Tk, yi0), F(j, Tk, yj0), F(j, Tk, yj1), F(i, Tk, yi1), cc);
    }
    b.quad(F(i, 0, top[i]), F(j, 0, top[j]), F(j, Tk, top[j]), F(i, Tk, top[i]), cc.clone().offsetHSL(0, 0, 0.03)); // top
    b.quad(F(j, 0, bot[j]), F(i, 0, bot[i]), F(i, 0, top[i]), F(j, 0, top[j]), cc); // back (only shows above a lower high side)
  }
  if (!c.closed) for (const i of [0, n - 1]) { const sg = i === 0 ? 1 : -1, j = i === 0 ? 0 : n - 1; b.quad(F(j, 0, bot[j]), F(j, Tk, bot[j]), F(j, Tk, top[j]), F(j, 0, top[j]), base); }
  // coping cap
  if (w.cap) {
    const cap = col(type === 'concrete' || type === 'block' ? 0x9a958a : rng.pick(MAT.stone.wall), 0.03, rng).offsetHSL(0, 0, 0.04);
    b.t(type === 'adobe' ? 'adobe' : 'concrete');
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n, y0 = top[i], y1 = top[j];
      if (y0 - bot[i] < 0.55 && y1 - bot[j] < 0.55) continue;
      b.quad(F(i, -0.06, y0 + 0.12), F(j, -0.06, y1 + 0.12), F(j, Tk + 0.07, y1 + 0.12), F(i, Tk + 0.07, y0 + 0.12), cap);
      b.quad(F(i, Tk + 0.07, y0 - 0.02), F(j, Tk + 0.07, y1 - 0.02), F(j, Tk + 0.07, y1 + 0.12), F(i, Tk + 0.07, y0 + 0.12), cap);
    }
  }
  // face detail: form lines (concrete), wire courses (gabion), weep holes
  const faceAt = (i, t, d) => { const j = Math.min(n - 1, i + 1), a = F(i, Tk + d, 0), c2 = F(j, Tk + d, 0); return [a[0] + (c2[0] - a[0]) * t, a[2] + (c2[2] - a[2]) * t]; };
  let sAcc = 0;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n, L = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]), ry = Math.atan2(P[j][0] - P[i][0], P[j][1] - P[i][1]);
    const h0 = top[i] - lo(i);
    if (type === 'gabion' && h0 > 0.6) { b.t('metal'); for (let y = lo(i) + 0.5; y < top[i] - 0.1; y += 0.5) { const [x, z] = faceAt(i, 0.5, 0.012); b.box(x, y, z, L + 0.02, 0.025, 0.02, col(METAL.steel), ry + Math.PI / 2); } }
    if (type === 'concrete' && h0 > 1) { b.t('plain'); for (let y = lo(i) + 0.9; y < top[i] - 0.2; y += 0.9) { const [x, z] = faceAt(i, 0.5, 0.004); b.box(x, y, z, L + 0.01, 0.025, 0.006, base.clone().offsetHSL(0, 0, -0.08), ry + Math.PI / 2); } }
    if ((type === 'concrete' || type === 'block') && h0 > 1.2 && Math.floor((sAcc + L) / 2.6) > Math.floor(sAcc / 2.6)) { const [x, z] = faceAt(i, 0.5, 0.01); b.t('plain').cyl(x, lo(i) + 0.45, z, 0.06, 0.06, 0.04, 8, col(0x1c1c1e), Math.PI / 2, ry + Math.PI / 2, 0); }
    sAcc += L;
  }
  // culvert / pipe opening at the channel
  if (w.culvert) {
    const cu = w.culvert, S = arcLen(P, false), q = project(P, S, false, cu.at[0], cu.at[1]);
    if (q) {
      const i = q.i, j = Math.min(n - 1, i + 1), ry = Math.atan2(P[j][0] - P[i][0], P[j][1] - P[i][1]) + Math.PI / 2;
      const [x, z] = faceAt(i, q.t, 0.01), topH = top[i] + (top[j] - top[i]) * q.t, room = topH - cu.floor - 0.4;
      if (cu.mode === 'culvert') {
        // box culverts: the barrel is painted onto the headwall in perspective (soffit, side walls, sandy floor, a slit
        // of daylight at the far end), silt drifted into the mouth, a flood line on the wall, cobbles and brush in front
        const nb = Math.max(1, Math.round(cu.w / 3.4)), ow = Math.min(1.9, (cu.w / nb) * 0.55), oh = Math.max(0.6, Math.min(1.4, room * 0.7));
        const [ox1, oz1] = faceAt(i, q.t, 1.01), on = [ox1 - x, oz1 - z], tx = Math.sin(ry - Math.PI / 2), tz = Math.cos(ry - Math.PI / 2);
        const P3 = (off, u, y, d) => [x + tx * (off + u) + on[0] * d, y, z + tz * (off + u) + on[1] * d];
        const y0 = cu.floor + 0.1, y1 = y0 + oh, iw = ow * 0.28, yb = y0 + oh * 0.14, yt = y1 - oh * 0.3;
        const flood = cu.floor + Math.min(room, rng.range(0.9, 1.4));
        b.t('plain').box(x, flood, z, cu.w + 1.2, 0.18, 0.012, col(0x8a8476, 0.03, rng), ry); // the flood line
        for (let k = 0; k < nb; k++) {
          const off = -cu.w / 2 + ((k + 0.5) * cu.w) / nb, hw = ow / 2;
          b.t('plain');
          b.quad(P3(off, -hw, y0, 0.02), P3(off, hw, y0, 0.02), P3(off, hw, y1, 0.02), P3(off, -hw, y1, 0.02), col(0x121214)); // the dark core
          b.quad(P3(off, -hw, y1, 0.025), P3(off, hw, y1, 0.025), P3(off, hw - iw, yt, 0.025), P3(off, -hw + iw, yt, 0.025), col(0x403c36)); // soffit
          b.quad(P3(off, -hw, y0, 0.025), P3(off, -hw + iw, yb, 0.025), P3(off, -hw + iw, yt, 0.025), P3(off, -hw, y1, 0.025), col(0x524d45)); // side walls
          b.quad(P3(off, hw, y0, 0.025), P3(off, hw, y1, 0.025), P3(off, hw - iw, yt, 0.025), P3(off, hw - iw, yb, 0.025), col(0x34312c));
          b.quad(P3(off, -hw, y0, 0.028), P3(off, hw, y0, 0.028), P3(off, hw - iw, yb, 0.028), P3(off, -hw + iw, yb, 0.028), col(0x7e6c52)); // the sandy floor going in
          const lw = (ow - 2 * iw) * 0.42, lh = (yt - yb) * 0.55; // daylight at the far end
          b.quad(P3(off, -lw / 2, yb, 0.03), P3(off, lw / 2, yb, 0.03), P3(off, lw / 2, yb + lh, 0.03), P3(off, -lw / 2, yb + lh, 0.03), col(0x8c7e64));
          b.t('concrete').box(x + tx * off + on[0] * 0.03, y1 + 0.1, z + tz * off + on[1] * 0.03, ow + 0.3, 0.2, 0.08, col(0x8f8a80), ry); // lintel
          b.t('plain').plank(P3(off, 0, y0 + oh * 0.1, 0.02), P3(off, 0, cu.floor - 0.08, 0.7), ow * 0.8, 0.05, col(0x9c8a6a, 0.05, rng)); // silt in the mouth
          b.t('rock'); for (let n2 = 0; n2 < 3; n2++) { const s2 = rng.range(0.14, 0.3), p = P3(off, rng.range(-ow, ow), cu.floor + s2 * 0.3, rng.range(0.8, 2.2)); b.box(p[0], p[1], p[2], s2, s2 * 0.7, s2 * 0.9, col(rng.pick([0x8a8072, 0x9a8e7c, 0x7a7266]), 0.05, rng), rng.range(0, 3)); }
          if (rng.chance(0.5)) { b.t('bark'); const p = P3(off, rng.range(-ow / 2, ow / 2), cu.floor + 0.1, rng.range(0.4, 1.0)); b.plank(p, [p[0] + rng.range(-1, 1), p[1] + 0.05, p[2] + rng.range(-1, 1)], 0.06, 0.06, col(0x6a5a46, 0.05, rng)); } // a flood-borne branch
        }
      } else {
        const pr = Math.max(0.3, Math.min(0.6, room / 2));
        b.t('concrete').cyl(x, cu.floor + 0.15 + pr, z, pr + 0.1, pr + 0.1, 0.06, 14, col(0xa8a398), Math.PI / 2, ry, 0);
        b.t('plain').cyl(x, cu.floor + 0.15 + pr, z, pr, pr, 0.08, 14, col(0x141416), Math.PI / 2, ry, 0);
      }
    }
  }
  // railing on the high side
  if (w.rail) {
    const rc = col(rng.pick([METAL.dark, METAL.rust, METAL.steel]), 0.04, rng);
    b.t('metal');
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (top[i] - bot[i] < 0.9) continue;
      const [x, , z] = F(i, -0.18, 0);
      if (i === 0 || acc >= 1.6) { b.box(x, top[i] + 0.5, z, 0.05, 1.0, 0.05, rc); acc = 0; }
      const j = c.closed ? (i + 1) % n : i + 1;
      if (j < n && (c.closed || i < n - 1)) { const [x2, , z2] = F(j, -0.18, 0); b.plank([x, top[i] + 1.0, z], [x2, top[j] + 1.0, z2], 0.05, 0.05, rc); b.plank([x, top[i] + 0.55, z], [x2, top[j] + 0.55, z2], 0.03, 0.03, rc); }
    }
  }
  // platform steps: a flight against the longest side, coming down outward
  if (w.steps && c.closed) {
    let bi = 0, bl = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, L = Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]); if (L > bl) { bl = L; bi = i; } }
    const j = (bi + 1) % n, mx = (P[bi][0] + P[j][0]) / 2, mz = (P[bi][1] + P[j][1]) / 2, ox = -N[bi][2], oz = -N[bi][3];
    const H = top[bi] - lo(bi), sw = 1.4, nS = Math.ceil(H / 0.18), tread = 0.3, sc = base.clone().offsetHSL(0, 0, 0.03);
    if (H > 0.3) for (let k = 0; k < nS; k++) {
      const yTop = top[bi] - (k * H) / nS, d = Tk + (k + 0.5) * tread, x = mx + ox * d, z = mz + oz * d;
      b.t(layer).box(x, (yTop + lo(bi) - 0.3) / 2, z, sw, yTop - lo(bi) + 0.3, tread + 0.01, sc, Math.atan2(ox, oz));
    }
  }
  return b.build({ maxEdge: 3.2 });
}

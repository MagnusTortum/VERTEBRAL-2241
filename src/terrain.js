// Height field: noise + authored features (hills, mesas, ridges, arroyos, tilt) + flatten zones
// (road beds, building pads). The grid is fine over the play area and coarsens outward into a
// margin that fades into haze. Per-face albedo (low-poly facets), per-vertex texture blend weights.
import * as THREE from 'three';
import { makeNoise, RNG, smooth, clamp, lerp } from './rng.js';
import { samplePath, nearestOnSamples, nearestWithin, obbDist, pointInPoly, polyBounds } from './geo.js';
import { GROUND, PAINT } from './palette.js';
import { terraceAt, buildCutMask } from './cliffs.js';
import { MATS } from './materials.js';

const TILL = new Set([PAINT.tilled, PAINT.irrigated, PAINT.wet]);
// faceted = old low-poly look (one normal and colour per triangle); smooth = per-vertex (default)
export const TERRAIN_LOOK = { faceted: false };

function axis(L, cell, M) {
  const n = Math.max(2, Math.round(L / cell));
  const inner = Array.from({ length: n + 1 }, (_, i) => -L / 2 + (i * L) / n);
  const out = [];
  let s = cell, acc = 0;
  while (acc < M) { s = Math.min(s * 1.22, 12); acc += s; out.push(acc); }
  return [...out.reverse().map((d) => -L / 2 - d), ...inner, ...out.slice().reverse().map((d) => L / 2 + d)];
}
function findCell(arr, v) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
  return lo;
}

export class Terrain {
  constructor(spec, seed) {
    const t = spec.terrain || {};
    [this.W, this.D] = spec.size || [240, 240];
    this.cell = t.cell || Math.max(1.25, Math.max(this.W, this.D) / 190);
    this.margin = t.margin ?? Math.max(90, Math.max(this.W, this.D) * 0.7);
    this.xs = axis(this.W, this.cell, this.margin);
    this.zs = axis(this.D, this.cell, this.margin);
    this.noise = makeNoise(seed + ':terrain');
    this.cnoise = makeNoise(seed + ':colour');
    this.relief = t.relief ?? 2;
    this.scale = t.scale ?? 110;
    this.biome = GROUND[spec.biome] || GROUND.coastal_desert;
    this.features = (t.features || []).map((f) => {
      const g = { ...f };
      if (f.path) g.samples = samplePath(extendAtEdges(f.path, this.W, this.D, this.margin + 20), 2);
      return g;
    });
    this.zones = [];
    this.paints = [];
    this.water = spec.water || null;
    this.backdropSpec = spec.backdrop;
    this.backdrop = !!spec.backdrop; // distant hills are drawn in the sky now; mesh ring only on request
    this.rng = new RNG(seed + ':tfacet');
    // hand-sculpted height offsets (editor brushes): a grid over the play area
    this.delta = t.delta ? (t.delta.data ? t.delta : decodeDelta(t.delta)) : null;
    this._owner = null;
  }
  deltaAt(x, z) {
    const D = this.delta, gx = (x + this.W / 2) / D.res, gz = (z + this.D / 2) / D.res;
    if (gx < 0 || gz < 0 || gx > D.nx - 1 || gz > D.nz - 1) return 0;
    const i = Math.min(D.nx - 2, Math.floor(gx)), j = Math.min(D.nz - 2, Math.floor(gz)), u = gx - i, v = gz - j, a = D.data;
    const k = j * D.nx + i;
    return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + D.nx] * (1 - u) + a[k + D.nx + 1] * u) * v;
  }
  // editor: recompute the nodes in a box and patch the terrain mesh in place (no rebuild)
  liveUpdate(x0, z0, x1, z1, mesh) {
    const { xs, zs } = this, N = xs.length, M = zs.length;
    const i0 = Math.max(0, findCell(xs, x0) - 1), i1 = Math.min(N - 1, findCell(xs, x1) + 2);
    const j0 = Math.max(0, findCell(zs, z0) - 1), j1 = Math.min(M - 1, findCell(zs, z1) + 2);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.h[j * N + i] = this.raw(xs[i], zs[j]);
    if (!mesh) return;
    const pos = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal, P = pos.array, Nn = nrm.array;
    const setTri = (base, ids) => {
      ids.forEach(([i, j], q) => { P[(base + q) * 3 + 1] = this.h[j * N + i]; });
      const a = base * 3, ux = P[a + 3] - P[a], uy = P[a + 4] - P[a + 1], uz = P[a + 5] - P[a + 2], vx = P[a + 6] - P[a], vy = P[a + 7] - P[a + 1], vz = P[a + 8] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (TERRAIN_LOOK.faceted) for (let q = 0; q < 3; q++) { Nn[a + q * 3] = nx; Nn[a + q * 3 + 1] = ny; Nn[a + q * 3 + 2] = nz; }
      else ids.forEach(([i, j], q) => { const k = (j * N + i) * 3; Nn[a + q * 3] = this.nN[k]; Nn[a + q * 3 + 1] = this.nN[k + 1]; Nn[a + q * 3 + 2] = this.nN[k + 2]; });
    };
    this.nodeNormals(Math.max(0, i0 - 1), Math.min(N - 1, i1 + 1), Math.max(0, j0 - 1), Math.min(M - 1, j1 + 1));
    for (let j = Math.max(0, j0 - 1); j <= Math.min(M - 2, j1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(N - 2, i1); i++) {
      const c = j * (N - 1) + i;
      setTri(c * 6, [[i, j], [i, j + 1], [i + 1, j]]);
      setTri(c * 6 + 3, [[i, j + 1], [i + 1, j + 1], [i + 1, j]]);
    }
    pos.needsUpdate = true; nrm.needsUpdate = true;
  }

  // ---------- height ----------
  base(x, z, noArroyo = false) {
    const n = this.noise;
    let h = n.fbm(x / this.scale, z / this.scale, 4) * this.relief;
    h += n.fbm(x / 16 + 40, z / 16 - 17, 2) * this.relief * 0.12;
    for (const f of this.features) {
      switch (f.type) {
        case 'hill': {
          const d = Math.hypot(x - f.at[0], z - f.at[1]) / (f.radius || 30);
          if (d < 1.6) h += (f.height || 5) * Math.exp(-d * d * 2.2);
          break;
        }
        case 'mesa': {
          const ang = Math.atan2(z - f.at[1], x - f.at[0]);
          const r = (f.radius || 30) * (1 + 0.18 * n.noise2(Math.cos(ang) * 2 + 9, Math.sin(ang) * 2));
          const d = Math.hypot(x - f.at[0], z - f.at[1]);
          h += (f.height || 10) * smooth((r - d) / (r * 0.18) + 0.5);
          break;
        }
        case 'ridge': {
          const hw = (f.width || 30) / 2;
          const r = nearestWithin(f.samples, x, z, hw);
          if (r) h += (f.height || 6) * smooth(1 - r.d / hw) * (0.8 + 0.2 * n.noise2(r.s / 30, 3));
          break;
        }
        case 'coast': { // sea on the `dir` side beyond distance `at` (m from centre)
          const a = ((f.dir ?? 270) * Math.PI) / 180;
          const t = x * Math.sin(a) - z * Math.cos(a) - (f.at ?? 200) + n.noise2(x / 90, z / 90) * (f.wiggle ?? 25);
          if (t > 0) h -= (f.depth ?? 6) * smooth(t / (f.fall ?? 40));
          break;
        }
        case 'tilt': {
          const a = ((f.dir || 0) * Math.PI) / 180;
          h += (Math.sin(a) * x - Math.cos(a) * z) * (f.amount || 1) / 100;
          break;
        }
      }
    }
    if (!noArroyo) { // where washes join, the deeper one wins (no pit at the confluence)
      let cut = 0;
      for (const f of this.features) {
        if (f.type !== 'arroyo') continue;
        const hw = (f.width || 10) / 2, bank = hw * 1.8;
        const r = nearestWithin(f.samples, x, z, bank);
        if (r) {
          let depth = (f.depth || 1.5) * (0.85 + 0.15 * n.noise2(r.s / 25, 7));
          // a wide wash braids: low sand bars between shallow channels
          if (f.braided && r.d < hw * 0.92) depth *= 1 - 0.35 * smooth(n.noise2(x / 9 + 31, z / 9 - 17) * 1.6 + 0.2);
          const k = r.d < hw ? 1 - 0.25 * (r.d / hw) ** 4 : 0.75 * (1 - smooth((r.d - hw) / (bank - hw)));
          cut = Math.max(cut, depth * k);
        }
      }
      h -= cut;
    }
    if (this.delta) h += this.deltaAt(x, z);
    return h;
  }

  addPad(obbBox, h, blend = 3) { this.zones.push({ kind: 'pad', obb: obbBox, h, blend, r: Math.hypot(obbBox.w, obbBox.d) / 2 + blend, o: this._owner }); }
  addPolyPad(poly, h, blend = 2) { this.zones.push({ kind: 'poly', poly, h, blend, bb: polyBounds(poly), o: this._owner }); }
  // arroyo under a point: { f, d, hw, bank, depth }
  arroyoAt(x, z) {
    for (const f of this.features) {
      if (f.type !== 'arroyo' || !f.samples) continue;
      const hw = (f.width || 10) / 2, bank = hw * 1.8, r = nearestWithin(f.samples, x, z, bank);
      if (r) return { f, d: r.d, hw, bank, depth: f.depth || 1.5, r };
    }
    return null;
  }
  // Road bed: the base height along the road, smoothed. Where the road crosses an arroyo it keeps its
  // level (embankment over culverts / a bridge) or dips through it (ford), by `cross(depth)`.
  // A road whose end (or crossing) meets an earlier road takes that road's bed height there and eases
  // back to its own grade over ~20 m.
  addPathBed(samples, halfWidth, blend = 4, strength = 1, cross = null, raise = 0) {
    const zn = { kind: 'path', samples, hw: halfWidth, blend: blend + (raise > 0 ? 1.5 : 0), strength, cross: null, crossFn: cross, raise, o: this._owner };
    this._bed(zn);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const s of samples) { x0 = Math.min(x0, s.x); z0 = Math.min(z0, s.z); x1 = Math.max(x1, s.x); z1 = Math.max(z1, s.z); }
    const m = halfWidth + blend;
    zn.bb = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
    this._pin(zn, this.zones.filter((z) => z.kind === 'path'));
    if (strength > 0) this.zones.push(zn);
    return zn;
  }
  _bed(zn) {
    const S = zn.samples;
    // crossing runs (once): samples inside an arroyo's banks
    if (!zn.cross) {
      zn.cross = [];
      let cur = null;
      S.forEach((q, i) => {
        const a = this.arroyoAt(q.x, q.z);
        if (a && a.d < a.bank * 0.95) { if (!cur || cur.f !== a.f) { cur = { i0: i, i1: i, f: a.f, hw: a.hw, depth: a.depth, im: i, dmin: a.d }; zn.cross.push(cur); } cur.i1 = i; if (a.d < cur.dmin) { cur.dmin = a.d; cur.im = i; } }
        else cur = null;
      });
      for (const c of zn.cross) { c.mode = zn.crossFn ? zn.crossFn(c.depth, c) : 'fill'; c.s0 = S[c.i0].s; c.s1 = S[c.i1].s; c.span = 2 * c.hw + (c.mode === 'culvert' ? 2.5 : 1.2); }
      zn.cross = zn.cross.filter((c) => c.mode && c.dmin < c.hw);
    }
    const inRun = new Int16Array(S.length).fill(-1);
    zn.cross.forEach((c, k) => { for (let i = c.i0; i <= c.i1; i++) inRun[i] = k; });
    const raw = S.map((q, i) => { const c = inRun[i] >= 0 ? zn.cross[inRun[i]] : null; return this.base(q.x, q.z, !!c && (c.mode === 'culvert' || c.mode === 'pipe')); });
    const step = S.length > 1 ? S[1].s - S[0].s : 2;
    const win = Math.max(2, Math.round(14 / Math.max(0.5, step)));
    S.forEach((q, i) => {
      let a = 0, c = 0;
      for (let k = -win; k <= win; k++) { const j = i + k; if (j >= 0 && j < raw.length) { a += raw[j]; c++; } }
      q.h = a / c;
      const run = inRun[i] >= 0 ? zn.cross[inRun[i]] : null;
      if (run?.mode === 'ford') q.h = lerp(q.h, raw[i] + 0.05, 0.85);
      const ad = run ? this.arroyoAt(q.x, q.z)?.d ?? 99 : 99;
      // bridge: open channel under the deck; culvert / pipe: the channel stays open between the headwalls
      // too, the road crosses on a deck flush with the wall tops (no earth slope up to the walls)
      q.nobed = run?.mode === 'bridge' && ad < run.hw + 1.2;
      q.steep = false;
      if (run && (run.mode === 'culvert' || run.mode === 'pipe')) { // fill held by walls: sharp edge where it stands proud
        const e = zn.hw + 0.6, f = Math.max(q.h - this.base(q.x - q.tz * e, q.z + q.tx * e), q.h - this.base(q.x + q.tz * e, q.z - q.tx * e));
        q.steep = f > 0.2;
      }
      if (zn.raise && run?.mode !== 'ford' && run?.mode !== 'bridge') q.h += zn.raise;
      q.h0 = q.h;
    });
  }
  // match the bed of earlier roads where this one touches them
  _pin(zn, earlier) {
    const S = zn.samples, total = S[S.length - 1].s;
    for (const o of earlier) {
      if (o === zn) break;
      const b = o.bb;
      if (zn.bb.x1 < b.x0 || zn.bb.x0 > b.x1 || zn.bb.z1 < b.z0 || zn.bb.z0 > b.z1) continue;
      if ((zn.raise || 0) > (o.raise || 0) + 0.05) { // a raised road keeps its grade: the lower road ramps up to meet it
        const O = o.samples, oT = O[O.length - 1].s, L = Math.min(24, Math.max(6, oT / 2)), runs = [];
        let cur = null;
        O.forEach((q, i) => { const r = nearestWithin(S, q.x, q.z, zn.hw + 0.5); if (r) { if (!cur || cur.end !== i - 1) { cur = { r, i, end: i }; runs.push(cur); } else cur.end = i; if (r.d < cur.r.d) { cur.r = r; cur.i = i; } } });
        for (const p of runs) {
          const a = S[p.r.i], c = S[Math.min(p.r.i + 1, S.length - 1)], dh = lerp(a.h, c.h, p.r.t) - O[p.i].h, s0 = O[p.i].s;
          if (Math.abs(dh) < 0.02) continue;
          let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
          for (const q of O) { const d = Math.abs(q.s - s0); if (d < L) { q.h += dh * (1 - smooth(d / L)); x0 = Math.min(x0, q.x); z0 = Math.min(z0, q.z); x1 = Math.max(x1, q.x); z1 = Math.max(z1, q.z); } }
          const m = o.hw + o.blend;
          (this._pinDirty ||= []).push({ o: o.o, box: [x0 - m, z0 - m, x1 + m, z1 + m] });
        }
        continue;
      }
      // contact runs: samples on the other road's surface; pin at the closest one
      let run = null;
      const pins = [], up = (o.raise || 0) > (zn.raise || 0) + 0.05; // meeting a raised road: ramp from its edge
      S.forEach((q, i) => {
        const r = nearestWithin(o.samples, q.x, q.z, up ? o.hw + 0.5 : o.hw * 0.7);
        if (r) { if (!run || run.end !== i - 1) { run = { best: r, i, end: i }; pins.push(run); } else run.end = i; if (r.d < run.best.d) { run.best = r; run.i = i; } }
      });
      for (const p of pins) {
        const a = o.samples[p.best.i], c = o.samples[Math.min(p.best.i + 1, o.samples.length - 1)];
        const th = lerp(a.h, c.h, p.best.t), q0 = S[p.i], dh = th - q0.h;
        if (Math.abs(dh) < 0.02) continue;
        const L = Math.min(up ? 24 : 20, Math.max(6, total / 2));
        for (const q of S) { const d = Math.abs(q.s - q0.s); if (d < L) q.h += dh * (1 - smooth(d / L)); }
      }
    }
  }
  // flatten an area (visitors' grounds, market) most of the way to its mean height, with an earth ramp
  addFlat(poly, k = 0.9, blend = 4) {
    const bb0 = polyBounds(poly);
    let a = 0, c = 0;
    for (let x = bb0.x0; x <= bb0.x1; x += 2) for (let z = bb0.z0; z <= bb0.z1; z += 2) if (pointInPoly(x, z, poly)) { a += this.base(x, z); c++; }
    const h = c ? a / c : this.base((bb0.x0 + bb0.x1) / 2, (bb0.z0 + bb0.z1) / 2);
    this.zones.push({ kind: 'flat', poly, h, k, blend, bb: { x0: bb0.x0 - blend, z0: bb0.z0 - blend, x1: bb0.x1 + blend, z1: bb0.z1 + blend }, o: this._owner });
  }
  // retaining wall terrace: ground on the high side of the line (or inside a closed outline) at `level`
  addTerrace(t) { this.zones.push({ kind: 'terrace', ...t, o: this._owner }); }

  raw(x, z) {
    let h = this.base(x, z);
    for (let k = 0; k < this.zones.length; k++) {
      const zn = this.zones[k];
      if (zn.kind === 'path') {
        const bb = zn.bb;
        if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
        const r = nearestWithin(zn.samples, x, z, zn.hw + zn.blend);
        if (!r) continue;
        const a = zn.samples[r.i], b = zn.samples[Math.min(r.i + 1, zn.samples.length - 1)];
        if (a.nobed || b.nobed) continue; // bridge: the channel stays open under it
        const th = lerp(a.h, b.h, r.t);
        const bl = a.steep && b.steep ? 0.04 : a.steep || b.steep ? 0.6 : zn.blend;
        if (r.d > zn.hw + bl) continue;
        const w = (r.d <= zn.hw ? 1 : 1 - smooth((r.d - zn.hw) / bl)) * (a.steep || b.steep ? 1 : zn.strength);
        h = lerp(h, th, w);
      } else if (zn.kind === 'pad') {
        if (Math.abs(x - zn.obb.cx) > zn.r || Math.abs(z - zn.obb.cz) > zn.r) continue;
        const d = obbDist(zn.obb, x, z);
        if (d > zn.blend) continue;
        h = lerp(h, zn.h, 1 - smooth(d / zn.blend));
      } else if (zn.kind === 'poly') {
        const bb = zn.bb;
        if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
        if (pointInPoly(x, z, zn.poly)) h = zn.h;
      } else if (zn.kind === 'flat') {
        const bb = zn.bb;
        if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
        if (pointInPoly(x, z, zn.poly)) h = lerp(h, zn.h, zn.k);
        else { const d = polyEdgeDist(zn.poly, x, z); if (d < zn.blend) h = lerp(h, zn.h, zn.k * (1 - smooth(d / zn.blend))); }
      } else if (zn.kind === 'terrace') {
        const bb = zn.bb;
        if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
        h = terraceAt(this, zn, x, z, h, k);
      }
    }
    return h;
  }

  // ground without road beds, up to zone k (a retaining wall's far side reverts to it)
  natural(x, z, k) {
    const save = this.zones;
    this.zones = save.slice(0, k).filter((zn) => zn.kind !== 'path');
    try { return this.raw(x, z); } finally { this.zones = save; }
  }
  // cliffs (retaining walls, culvert fills): build the discard mask for the terrain shader
  setCliffs(cliffs) {
    this.cliffs = cliffs;
    this.cut = cliffs.length ? buildCutMask(this, cliffs) : null;
    if (this.cutTex) { this.cutTex.dispose(); this.cutTex = null; }
    if (this.cut) {
      const c = this.cut, t = new THREE.DataTexture(c.data, c.nx, c.nz, THREE.RedFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
      this.cutTex = t;
    }
  }
  inCut(x, z) {
    const c = this.cut; if (!c) return false;
    const i = Math.floor((x - c.x0) / c.res), j = Math.floor((z - c.z0) / c.res);
    return i >= 0 && j >= 0 && i < c.nx && j < c.nz && c.data[j * c.nx + i] > 0;
  }

  computeHeights() {
    const { xs, zs } = this;
    const N = xs.length;
    this.h = new Float32Array(N * zs.length);
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < N; i++) {
      const v = this.raw(xs[i], zs[j]);
      this.h[j * N + i] = v;
      if (Math.abs(xs[i]) <= this.W / 2 && Math.abs(zs[j]) <= this.D / 2) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    }
    this.minH = mn; this.maxH = mx;
  }

  _tri(x, z) {
    const { xs, zs } = this;
    const i = findCell(xs, x), j = findCell(zs, z);
    const u = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1), v = clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
    return { i, j, u, v };
  }
  // height on the rendered surface (matches the triangle split of the mesh)
  height(x, z) {
    if (!this.h) return this.raw(x, z);
    if (this.cut && this.inCut(x, z)) return this.raw(x, z); // exact surface along cliffs
    return this.gridHeight(x, z);
  }
  gridHeight(x, z) {
    if (!this.h) return this.raw(x, z);
    const { i, j, u, v } = this._tri(x, z);
    const N = this.xs.length;
    const a = this.h[j * N + i], b = this.h[(j + 1) * N + i], c = this.h[(j + 1) * N + i + 1], d = this.h[j * N + i + 1];
    if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
    return c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }
  // face normal of the triangle under (x,z)
  // smooth normal per grid node (central differences on the height grid)
  nodeNormals(i0 = 0, i1 = this.xs.length - 1, j0 = 0, j1 = this.zs.length - 1) {
    const { xs, zs } = this, N = xs.length, M = zs.length;
    if (!this.nN) this.nN = new Float32Array(N * M * 3);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), c = Math.max(0, j - 1), d = Math.min(M - 1, j + 1);
      const sx = (this.h[j * N + b] - this.h[j * N + a]) / (xs[b] - xs[a]), sz = (this.h[d * N + i] - this.h[c * N + i]) / (zs[d] - zs[c]);
      const l = Math.hypot(sx, 1, sz), k = (j * N + i) * 3;
      this.nN[k] = -sx / l; this.nN[k + 1] = 1 / l; this.nN[k + 2] = -sz / l;
    }
  }
  normalAt(x, z) {
    if (!TERRAIN_LOOK.faceted && this.nN) {
      const { i, j, u, v } = this._tri(x, z), N = this.xs.length, n = this.nN;
      const o = [0, 0, 0];
      for (const [ii, jj, w] of [[i, j, (1 - u) * (1 - v)], [i + 1, j, u * (1 - v)], [i, j + 1, (1 - u) * v], [i + 1, j + 1, u * v]]) { const k = (jj * N + ii) * 3; o[0] += n[k] * w; o[1] += n[k + 1] * w; o[2] += n[k + 2] * w; }
      const l = Math.hypot(o[0], o[1], o[2]) || 1;
      return [o[0] / l, o[1] / l, o[2] / l];
    }
    const { i, j, u, v } = this._tri(x, z);
    const { xs, zs } = this, N = xs.length;
    const P = (ii, jj) => [xs[ii], this.h[jj * N + ii], zs[jj]];
    let A, B, C;
    if (u + v <= 1) { A = P(i, j); B = P(i, j + 1); C = P(i + 1, j); } else { A = P(i, j + 1); B = P(i + 1, j + 1); C = P(i + 1, j); }
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  }
  // ground-map surface weights at (x, z): [dirt, tilled, gravel, urban, scrub, cobble, concrete, pavers] (0..1), or null
  surfaceAt(x, z) {
    const g = this.gm; if (!g) return null;
    const i = Math.floor((x - g.x0) / g.res), j = Math.floor((z - g.z0) / g.res);
    if (i < 0 || j < 0 || i >= g.Nx || j >= g.Nz) return null;
    const k = (j * g.Nx + i) * 8; return g.wt.subarray(k, k + 8);
  }
  slope(x, z) {
    const e = 0.8;
    return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
  }
  inBounds(x, z, m = 0) { return Math.abs(x) < this.W / 2 - m && Math.abs(z) < this.D / 2 - m; }
  inMap(x, z, m = 0) { return x > this.xs[0] + m && x < this.xs[this.xs.length - 1] - m && z > this.zs[0] + m && z < this.zs[this.zs.length - 1] - m; }
  // 0 inside the play area, rising to 1 at the end of the fade margin
  outside(x, z) {
    const dx = Math.max(Math.abs(x) - this.W / 2, 0), dz = Math.max(Math.abs(z) - this.D / 2, 0);
    return clamp(Math.hypot(dx, dz) / this.margin, 0, 1);
  }

  // ---------- paint ----------
  addPaint(p) {
    p.edge = p.edge ?? 1.5;
    p.alpha = p.alpha ?? 1;
    p.kind = p.kind || (TILL.has(p.color) ? 'tilled' : p.color === PAINT.sand ? 'sand' : 'dirt');
    // ground-map texture layer this paint lays down (per-pixel): dirt | till | gravel | urban | scrub | cobble | concrete | pavers | null
    if (p.layer === undefined) p.layer = TILL.has(p.color) ? 'till' : p.color === PAINT.gravel ? 'gravel' : p.color === PAINT.sand ? null
      : p.color === PAINT.dirt ? 'dirt' : [PAINT.yard, PAINT.packed, PAINT.oil, PAINT.ash].includes(p.color) ? 'urban' : 'dirt';
    p.layerK = p.layerK ?? (p.layer === 'urban' && p.color === PAINT.yard ? 0.55 : 1);
    if (p.type === 'path') {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const s of p.samples) { x0 = Math.min(x0, s.x); z0 = Math.min(z0, s.z); x1 = Math.max(x1, s.x); z1 = Math.max(z1, s.z); }
      const m = p.width / 2 + p.edge * 2;
      p.bb = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
    } else if (p.type === 'poly') { const b = polyBounds(p.poly); const m = p.edge * 2; p.bb = { x0: b.x0 - m, z0: b.z0 - m, x1: b.x1 + m, z1: b.z1 + m }; }
    else if (p.type === 'circle') { const m = p.r + p.edge * 2; p.bb = { x0: p.at[0] - m, z0: p.at[1] - m, x1: p.at[0] + m, z1: p.at[1] + m }; }
    else if (p.type === 'obb') { const m = Math.hypot(p.obb.w, p.obb.d) / 2 + (p.pad || 0) + p.edge * 2; p.bb = { x0: p.obb.cx - m, z0: p.obb.cz - m, x1: p.obb.cx + m, z1: p.obb.cz + m }; }
    if (p.o === undefined) p.o = this._owner;
    this.paints.push(p);
  }

  // albedo + blend weights at a node
  sampleNode(x, z, slope) {
    const B = this.biome, n = this.cnoise;
    if (!this._tones) this._tones = B.base.map((h) => new THREE.Color(h));
    const tones = this._tones;
    const c = new THREE.Color();
    const a = n.fbm(x / 55, z / 55, 3) * 0.5 + 0.5;
    const b = n.fbm(x / 23 + 50, z / 23, 2) * 0.5 + 0.5;
    c.copy(tones[0]).lerp(tones[1], smooth(a * 1.6 - 0.3)).lerp(tones[2], smooth(b * 1.8 - 0.6) * 0.7);
    const dry = n.fbm(x / 35 - 70, z / 35 + 11, 2);
    if (dry > 0.25) c.lerp(new THREE.Color(B.dry), smooth((dry - 0.25) * 3) * 0.6);
    const scrub = n.fbm(x / 14 + 5, z / 14 + 99, 2);
    if (scrub > 0.3) c.lerp(new THREE.Color(B.scrub), smooth((scrub - 0.3) * 3) * 0.35);
    let wDirt = smooth(n.fbm(x / 18 + 3, z / 18 - 8, 2) * 1.5) * 0.35, wTill = 0;
    for (const f of this.features) {
      if (f.type !== 'arroyo') continue;
      const hw = (f.width || 10) / 2;
      const r = nearestWithin(f.samples, x, z, hw * 1.1);
      if (r) { const w = 1 - smooth((r.d - hw * 0.6) / (hw * 0.5)); c.lerp(new THREE.Color(B.bed), w); wDirt *= 1 - w; }
    }
    const wRock = smooth((slope - 0.4) * 2.5);
    if (wRock > 0) c.lerp(new THREE.Color(B.rock), wRock);
    // green / scrub cover: biome greenness, moisture noise, low ground and arroyo banks
    const moist = n.fbm(x / 70 + 13, z / 70 - 41, 3) * 0.5 + 0.5;
    let wScrub = clamp((B.green ?? 0.25) * 1.6 * smooth((moist - 0.35) * 2.2), 0, 1) * (1 - wRock);
    for (const f of this.features) if (f.type === 'arroyo') { const r = nearestWithin(f.samples, x, z, (f.width || 10) * 1.6); if (r) wScrub = Math.max(wScrub, 0.7 * (1 - smooth(r.d / ((f.width || 10) * 1.6)))); }
    if (B.scrubMin) wScrub = Math.max(wScrub, B.scrubMin * (1 - wRock) * (0.75 + 0.5 * moist));
    if (wScrub > 0.05 && B.green_c) c.lerp(new THREE.Color(B.green_c), wScrub * (B.scrubK ?? 0.45));
    // shoreline
    if (this.water) { const hh = this.raw ? this.base(x, z) : 0; const dw = hh - (this.water.level ?? 0); if (dw < 1.2) { const k = 1 - smooth(dw / 1.2); c.lerp(new THREE.Color(B.beach || 0xd9c9a2), k * 0.8); wScrub *= 1 - k; } }
    const ec = new THREE.Color();
    const inPlay = Math.abs(x) < this.W / 2 - 1 && Math.abs(z) < this.D / 2 - 1; // per-pixel ground map covers the play area
    for (const p of inPlay ? [] : this.paints) {
      const bb = p.bb;
      if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) continue;
      let d;
      if (p.type === 'path') { const q = nearestWithin(p.samples, x, z, p.width / 2 + p.edge * 2); if (!q) continue; d = q.d - p.width / 2; }
      else if (p.type === 'circle') d = Math.hypot(x - p.at[0], z - p.at[1]) - p.r;
      else if (p.type === 'obb') d = obbDist(p.obb, x, z) - (p.pad || 0);
      else d = pointInPoly(x, z, p.poly) ? -1 : this._polyEdgeDist(p.poly, x, z);
      d += n.noise2(x / 3.5, z / 3.5) * p.edge * 0.8;
      const w = (1 - smooth(d / p.edge + 0.5)) * p.alpha;
      if (w <= 0) continue;
      c.lerp(ec.set(p.color), w);
      if (p.kind === 'tilled') { wTill = Math.max(wTill, w); wDirt *= 1 - w; }
      else if (p.kind === 'dirt') wDirt = Math.max(wDirt, w);
      else if (p.kind === 'sand') wDirt *= 1 - w;
    }
    return { c, rock: wRock, dirt: wDirt, till: wTill, scrub: wScrub };
  }
  _polyEdgeDist(poly, x, z) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  }

  // ---------- mesh ----------
  build() {
    this.computeHeights();
    this.nodeNormals();
    const { xs, zs } = this;
    const N = xs.length, M = zs.length;
    // node samples
    const nodes = new Array(N * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const x = xs[i], z = zs[j];
      const ii = Math.min(i, N - 2), jj = Math.min(j, M - 2);
      const sx = (this.h[j * N + ii + 1] - this.h[j * N + ii]) / (xs[ii + 1] - xs[ii]);
      const sz = (this.h[(jj + 1) * N + i] - this.h[jj * N + i]) / (zs[jj + 1] - zs[jj]);
      nodes[j * N + i] = this.sampleNode(x, z, Math.hypot(sx, sz));
    }
    const nTri = (N - 1) * (M - 1) * 2;
    const pos = new Float32Array(nTri * 9), colA = new Float32Array(nTri * 9), blend = new Float32Array(nTri * 12), nrm = new Float32Array(nTri * 9);
    let kb = 0;
    let k = 0;
    const fc = new THREE.Color();
    const tri = (ids) => {
      const P = ids.map(([i, j]) => [xs[i], this.h[j * N + i], zs[j]]);
      const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
      const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      fc.setRGB(0, 0, 0);
      for (const [i, j] of ids) { const nd = nodes[j * N + i]; fc.r += nd.c.r / 3; fc.g += nd.c.g / 3; fc.b += nd.c.b / 3; }
      const facet = TERRAIN_LOOK.faceted;
      if (facet) fc.offsetHSL(0, 0, (this.rng.next() - 0.5) * 0.02);
      ids.forEach(([i, j], q) => {
        const nd = nodes[j * N + i], nk = (j * N + i) * 3;
        pos[k] = P[q][0]; pos[k + 1] = P[q][1]; pos[k + 2] = P[q][2];
        if (facet) { colA[k] = fc.r; colA[k + 1] = fc.g; colA[k + 2] = fc.b; } else { colA[k] = nd.c.r; colA[k + 1] = nd.c.g; colA[k + 2] = nd.c.b; }
        blend[kb] = nd.rock; blend[kb + 1] = nd.dirt; blend[kb + 2] = nd.till; blend[kb + 3] = nd.scrub; kb += 4;
        if (facet) { nrm[k] = nx; nrm[k + 1] = ny; nrm[k + 2] = nz; } else { nrm[k] = this.nN[nk]; nrm[k + 1] = this.nN[nk + 1]; nrm[k + 2] = this.nN[nk + 2]; }
        k += 3;
      });
    };
    for (let j = 0; j < M - 1; j++) for (let i = 0; i < N - 1; i++) {
      tri([[i, j], [i, j + 1], [i + 1, j]]);
      tri([[i, j + 1], [i + 1, j + 1], [i + 1, j]]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.setAttribute('blend', new THREE.BufferAttribute(blend, 4));
    g.setAttribute('bake', new THREE.BufferAttribute(new Float32Array(nTri * 9).fill(1), 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, MATS.terrain);
    mesh.name = 'terrain';
    mesh.userData.terrain = true;
    const group = new THREE.Group();
    group.add(mesh);
    if (this.water) group.add(this.buildWater());
    this.buildGroundMap();
    if (this.backdrop !== false) group.add(this.buildBackdrop());
    return group;
  }

  // Per-pixel ground over the play area: paint colour + coverage, and texture-layer weights.
  // Each paint is rasterised over its bounding box only.
  buildGroundMap() {
    const t0 = performance.now();
    const pad = 2, W = this.W + pad * 2, D = this.D + pad * 2;
    const res = Math.max(0.3, Math.max(W, D) / 1500);
    const Nx = Math.ceil(W / res), Nz = Math.ceil(D / res), N = Nx * Nz;
    const x0 = -W / 2, z0 = -D / 2;
    this.gm = { res, Nx, Nz, N, x0, z0, col: new Float32Array(N * 3), cov: new Float32Array(N), wt: new Float32Array(N * 8), scratch: new Float32Array(N), touched: [] };
    for (const p of this.paints) this._rasterPaint(p);
    const mk = () => { const a = new Uint8Array(N * 4); const tx = new THREE.DataTexture(a, Nx, Nz, THREE.RGBAFormat); tx.magFilter = tx.minFilter = THREE.LinearFilter; return tx; };
    this.ground = { g1: mk(), g2: mk(), g3: mk(), rect: [x0, z0, -x0, -z0] };
    this._encodeGround(0, Nx - 1, 0, Nz - 1);
    console.log(`[ground] ${Nx}x${Nz} ${this.paints.length} paints ${Math.round(performance.now() - t0)}ms`);
  }
  // editor: clear a box of the ground map and re-rasterise every paint that touches it (idempotent)
  repaintGround(bx0, bz0, bx1, bz1) {
    const { res, Nx, Nz, x0, z0, col, cov, wt } = this.gm;
    const clip = [Math.max(0, Math.floor((bx0 - x0) / res)), Math.min(Nx - 1, Math.ceil((bx1 - x0) / res)), Math.max(0, Math.floor((bz0 - z0) / res)), Math.min(Nz - 1, Math.ceil((bz1 - z0) / res))];
    if (clip[1] < clip[0] || clip[3] < clip[2]) return;
    for (let j = clip[2]; j <= clip[3]; j++) for (let i = clip[0]; i <= clip[1]; i++) {
      const k = j * Nx + i; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = 0; cov[k] = 0;
      for (let q = 0; q < 8; q++) wt[k * 8 + q] = 0;
    }
    for (const p of this.paints) { const b = p.bb; if (b.x1 < bx0 || b.x0 > bx1 || b.z1 < bz0 || b.z0 > bz1) continue; this._rasterPaint(p, clip); }
    this._encodeGround(...clip);
  }
  removeOwned(id) { this.zones = this.zones.filter((z) => z.o !== id); this.paints = this.paints.filter((p) => p.o !== id); }
  // road beds follow the smoothed base height; after sculpting, recompute the ones in a box
  rebed(bx0, bz0, bx1, bz1) {
    for (const zn of this.zones) {
      if (zn.kind !== 'path') continue;
      const b = zn.bb; if (b.x1 < bx0 || b.x0 > bx1 || b.z1 < bz0 || b.z0 > bz1) continue;
      this._bed(zn);
    }
    const paths = this.zones.filter((z) => z.kind === 'path');
    for (const zn of paths) for (const q of zn.samples) q.h = q.h0;
    for (const zn of paths) this._pin(zn, paths);
  }
  // add one paint after the map is built (editor brushes): rasterise it and re-upload its region
  livePaint(p) {
    p._live = true;
    this.addPaint(p);
    const r = this._rasterPaint(p);
    if (r) this._encodeGround(...r);
  }
  _encodeGround(i0, i1, j0, j1) {
    const { Nx, col, cov, wt } = this.gm;
    const a1 = this.ground.g1.image.data, a2 = this.ground.g2.image.data, a3 = this.ground.g3.image.data;
    const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * Nx + i, cv = cov[k] || 1;
      // colour stored premultiplied-ish: rgb = paint colour where covered (gamma 1/2 for 8-bit precision)
      a1[k * 4] = c8(Math.sqrt(col[k * 3] / cv)); a1[k * 4 + 1] = c8(Math.sqrt(col[k * 3 + 1] / cv)); a1[k * 4 + 2] = c8(Math.sqrt(col[k * 3 + 2] / cv)); a1[k * 4 + 3] = c8(cov[k]);
      for (let q = 0; q < 4; q++) { a2[k * 4 + q] = c8(wt[k * 8 + q]); a3[k * 4 + q] = c8(wt[k * 8 + 4 + q]); }
    }
    for (const t of ['g1', 'g2', 'g3']) this.ground[t].needsUpdate = true;
  }
  _rasterPaint(p, clip = null) {
    const { res, Nx, Nz, x0, z0, col, cov, wt, scratch, touched } = this.gm;
    const ci0 = clip ? clip[0] : 0, ci1 = clip ? clip[1] : Nx - 1, cj0 = clip ? clip[2] : 0, cj1 = clip ? clip[3] : Nz - 1;
    const LAY = { dirt: 0, till: 1, gravel: 2, urban: 3, scrub: 4, cobble: 5, concrete: 6, pavers: 7 };
    const n = this.cnoise, ec = new THREE.Color();
      const bb = p.bb;
      const i0 = Math.max(ci0, Math.floor((bb.x0 - x0) / res)), i1 = Math.min(ci1, Math.ceil((bb.x1 - x0) / res));
      const j0 = Math.max(cj0, Math.floor((bb.z0 - z0) / res)), j1 = Math.min(cj1, Math.ceil((bb.z1 - z0) / res));
      if (i1 < i0 || j1 < j0) return null;
      touched.length = 0;
      const cover = (i, j, d) => {
        const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
        d += n.noise2(x / 3.5, z / 3.5) * p.edge * 0.8;
        const w = (1 - smooth(d / p.edge + 0.5)) * p.alpha;
        if (w <= 0) return;
        const k = j * Nx + i;
        if (scratch[k] === 0) touched.push(k);
        if (w > scratch[k]) scratch[k] = w;
      };
      if (p.type === 'path') {
        // per segment: only texels near the segment
        const S = p.samples, reach = p.width / 2 + p.edge * 2;
        for (let q = 0; q < S.length - 1; q++) {
          const a = S[q], b = S[q + 1];
          if (Math.max(a.x, b.x) < x0 - reach || Math.min(a.x, b.x) > -x0 + reach || Math.max(a.z, b.z) < z0 - reach || Math.min(a.z, b.z) > -z0 + reach) continue;
          const si0 = Math.max(i0, Math.floor((Math.min(a.x, b.x) - reach - x0) / res)), si1 = Math.min(i1, Math.ceil((Math.max(a.x, b.x) + reach - x0) / res));
          const sj0 = Math.max(j0, Math.floor((Math.min(a.z, b.z) - reach - z0) / res)), sj1 = Math.min(j1, Math.ceil((Math.max(a.z, b.z) + reach - z0) / res));
          const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1;
          for (let j = sj0; j <= sj1; j++) for (let i = si0; i <= si1; i++) {
            const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
            const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
            const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t) - p.width / 2;
            if (d < p.edge * 1.5) cover(i, j, d);
          }
        }
      } else if (p.type === 'poly') {
        // scanline: inside spans are free; only texels near the outline pay for an edge distance
        const P = p.poly, margin = p.edge * 1.5, mr = Math.ceil(margin / res) + 1;
        const rows = [];
        for (let j = j0; j <= j1; j++) {
          const z = z0 + (j + 0.5) * res, xs = [];
          for (let a = 0, nP = P.length; a < nP; a++) { const A = P[a], B = P[(a + 1) % nP]; if ((A[1] > z) !== (B[1] > z)) xs.push(A[0] + ((z - A[1]) * (B[0] - A[0])) / (B[1] - A[1])); }
          xs.sort((u, v) => u - v);
          rows.push(xs);
        }
        for (let j = j0; j <= j1; j++) {
          const xs = rows[j - j0];
          for (let i = i0; i <= i1; i++) {
            const x = x0 + (i + 0.5) * res;
            let inside = false; for (let q = 0; q + 1 < xs.length; q += 2) if (x >= xs[q] && x <= xs[q + 1]) { inside = true; break; }
            if (inside) { cover(i, j, -1); continue; }
            let near = false;
            for (let r = Math.max(j0, j - mr); r <= Math.min(j1, j + mr) && !near; r++) { const ys = rows[r - j0]; for (let q = 0; q + 1 < ys.length; q += 2) if (x >= ys[q] - margin && x <= ys[q + 1] + margin) { near = true; break; } }
            if (!near) continue;
            const z = z0 + (j + 0.5) * res, d = this._polyEdgeDist(P, x, z);
            if (d < margin) cover(i, j, d);
          }
        }
      } else {
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res;
          let d;
          if (p.type === 'circle') d = Math.hypot(x - p.at[0], z - p.at[1]) - p.r;
          else if (p.type === 'obb') d = obbDist(p.obb, x, z) - (p.pad || 0);
          else d = pointInPoly(x, z, p.poly) ? -1 : this._polyEdgeDist(p.poly, x, z);
          if (d < p.edge * 1.5) cover(i, j, d);
        }
      }
      ec.set(p.color);
      const L = p.layer ? LAY[p.layer] : -1, lk = p.layerK ?? 1;
      for (const k of touched) {
        const w = scratch[k]; scratch[k] = 0;
        if (p.tint !== false) { col[k * 3] += (ec.r - col[k * 3]) * w; col[k * 3 + 1] += (ec.g - col[k * 3 + 1]) * w; col[k * 3 + 2] += (ec.b - col[k * 3 + 2]) * w; cov[k] = 1 - (1 - cov[k]) * (1 - w); }
        if (L >= 0) {
          for (let c = 0; c < 8; c++) if (c !== L) wt[k * 8 + c] *= 1 - w * 0.85;
          wt[k * 8 + L] = Math.max(wt[k * 8 + L], w * lk);
        } else for (let c = 0; c < 8; c++) wt[k * 8 + c] *= 1 - w;
      }
    
    return [i0, i1, j0, j1];
  }


  // Distant hills / sierra beyond the map, fading into the haze. spec.backdrop: { n, e, s, w } heights (m)
  buildBackdrop() {
    const bd = this.backdropSpec || {};
    const R0 = Math.max(this.W, this.D) / 2 + this.margin * 0.85, R1 = R0 + 900;
    const seg = 128, rings = 7, n = this.noise;
    const H = (a) => { // compass-weighted height
      const dirs = [[0, bd.n ?? 60], [90, bd.e ?? 60], [180, bd.s ?? 60], [270, bd.w ?? 60]];
      let h = 0, ws = 0;
      for (const [d, v] of dirs) { let da = Math.abs(((a - d + 540) % 360) - 180); const w = Math.exp(-((da / 55) ** 2)); h += v * w; ws += w; }
      return h / ws;
    };
    const pos = [], colr = [];
    const B = this.biome;
    const cA = new THREE.Color(B.rock), cB = new THREE.Color(B.dry), cG = new THREE.Color(B.green_c || B.scrub);
    const P = (i, r) => {
      const a = (i / seg) * Math.PI * 2, deg = (a * 180) / Math.PI;
      const t = r / (rings - 1);
      const R = R0 + (R1 - R0) * t;
      const x = Math.sin(a) * R, z = -Math.cos(a) * R;
      const peak = H(deg) * (0.35 + 0.65 * (n.fbm(Math.cos(a) * 3 + 7, Math.sin(a) * 3, 4) * 0.5 + 0.6)) * (0.6 + 0.4 * n.fbm(x / 120, z / 120, 3));
      const prof = r === 0 ? -2 : Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * peak * (0.7 + 0.3 * n.noise2(i * 0.37, r));
      return [x, Math.max(-2, prof), z];
    };
    const grid = [];
    for (let r = 0; r < rings; r++) for (let i = 0; i <= seg; i++) grid.push(P(i % seg, r));
    const c = new THREE.Color();
    for (let r = 0; r < rings - 1; r++) for (let i = 0; i < seg; i++) {
      const a = grid[r * (seg + 1) + i], b = grid[r * (seg + 1) + i + 1], cc = grid[(r + 1) * (seg + 1) + i + 1], d = grid[(r + 1) * (seg + 1) + i];
      for (const [p, q, s2] of [[a, d, b], [b, d, cc]]) {
        const hy = (p[1] + q[1] + s2[1]) / 3;
        c.copy(cB).lerp(cA, clamp(hy / 120, 0, 1)).lerp(cG, 0.25 * (1 - clamp(hy / 60, 0, 1)));
        c.offsetHSL(0, 0, (this.rng.next() - 0.5) * 0.04);
        for (const v of [p, q, s2]) { pos.push(...v); colr.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, MATS.backdrop);
    m.name = 'backdrop';
    m.userData.noBake = true;
    m.frustumCulled = false;
    return m;
  }

  buildWater() {
    const lvl = this.water.level ?? 0;
    const W = this.xs[this.xs.length - 1] - this.xs[0], D = this.zs[this.zs.length - 1] - this.zs[0];
    const g = new THREE.PlaneGeometry(W, D);
    g.rotateX(-Math.PI / 2);
    g.translate(0, lvl, 0);
    const m = new THREE.Mesh(g, MATS.water);
    m.name = 'water'; m.layers.set(1); // drawn in the water pass
    m.userData.noBake = true;
    return m;
  }
}

// extend a polyline past ends that touch the play-area edge (roads/arroyos run on into the haze)
export function extendAtEdges(path, W, D, d) {
  if (path.length < 2) return path;
  const atEdge = (p) => Math.abs(p[0]) > W / 2 - 8.5 || Math.abs(p[1]) > D / 2 - 8.5;
  const ext = (a, b) => { const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; return [a[0] + ((a[0] - b[0]) / L) * d, a[1] + ((a[1] - b[1]) / L) * d]; };
  const out = [...path];
  if (atEdge(path[0])) out.unshift(ext(path[0], path[1]));
  if (atEdge(path[path.length - 1])) out.push(ext(path[path.length - 1], path[path.length - 2]));
  return out;
}

// sculpt offsets <-> spec: Int16 centimetres, base64
export function encodeDelta(D) {
  const q = new Int16Array(D.data.length);
  for (let i = 0; i < q.length; i++) q[i] = Math.max(-32767, Math.min(32767, Math.round(D.data[i] * 100)));
  const u8 = new Uint8Array(q.buffer);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { res: D.res, nx: D.nx, nz: D.nz, b64: btoa(bin) };
}
export function decodeDelta(d) {
  const bin = atob(d.b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const q = new Int16Array(u8.buffer), data = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) data[i] = q[i] / 100;
  return { res: d.res, nx: d.nx, nz: d.nz, data };
}

// distance from a point to a polygon's outline
export function polyEdgeDist(P, x, z) {
  let best = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}
// nearest point on an open polyline: distance and which side (+1 left of travel / -1 right)
export function sideDist(P, x, z) {
  let best = { d: Infinity, side: 1 };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best.d) best = { d, side: dx * (z - a[1]) - dz * (x - a[0]) >= 0 ? 1 : -1, end: (i === 0 && t <= 0) || (i === P.length - 2 && t >= 1) };
  }
  return best;
}

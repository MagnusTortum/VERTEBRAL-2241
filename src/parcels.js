// Parcels: the whole map as ONE tiling of polygons — town lots, back-of-block interiors, reserved areas
// and farm fields — with no dead space between them and every boundary shared by exactly two parcels.
//
// How: a 1 m label raster.
//  1. Every cell is owned by its nearest road edge (road half-width + sidewalk / apron), remembering the
//     arc position s and side. Where two streets meet at an angle the ownership boundary is the bisector,
//     so corner lots become wedges instead of leaving a gap.
//  2. Each road side is cut along s into lot frontages (width/depth by density, like before). A cell
//     belongs to a lot if it lies within that lot's depth; beyond it the lots grow a little further back,
//     then what is left inside a block becomes an interior parcel (courtyard, garden, corral) and what is
//     left outside the town becomes farmland, cut into fields on a grid aligned with the town.
//  3. Authored buildings take over (merge) the lots under them; areas (market, visitors) are reserved rects.
//  4. Boundaries are traced on the grid and split at junctions (where 3+ parcels meet); each boundary run
//     is simplified once and shared, so neighbouring polygons match exactly and each fence is built once.
import { RNG, deg, makeNoise } from './rng.js';
import { sampleAt, toWorld, toLocal, facingAngle, pointInPoly } from './geo.js';
import { SIZES, CLASS_K, MIX, NO_ROW, ORIGINS, NEW_MATS, PREWAR, densityField, classOf, modeOf } from './layout.js';

export const LOT = { // width, depth, setback, side gap (each side), vacancy
  attached: { w: [6.5, 9.5], d: [18, 26], set: [0, 0.3], gap: [0, 0], vac: 0.04 },
  tight:    { w: [10, 14], d: [18, 26], set: [0.5, 2.5], gap: [0.6, 1.8], vac: 0.08 },
  separate: { w: [14, 20], d: [22, 30], set: [2.5, 5], gap: [1.5, 4], vac: 0.16 },
  sparse:   { w: [22, 34], d: [26, 38], set: [4, 10], gap: [4, 10], vac: 0.3 },
};
const SIDEWALK = { main: 2.2, street: 1.4, arterial: 0, lane: 0, track: 0 };
export const ROAD = -2, FREE = -1, OUT = -9;
const FARMQ = -4, MERGE = -5;

export function runParcels(spec, rule, roads, seed, ctx) {
  const t0 = performance.now();
  const { out, id } = ctx;
  const rng = new RNG(`${seed}:parcels:${rule.id || ''}`);
  const S = spec.settlement || {};
  const spine = S.spine || 'main';
  const field = densityField(spec, seed);
  const noise = makeNoise(`${seed}:lotn`);
  const poor = ['dead_broke', 'poor'].includes(S.wealth);
  const newMats = rule.materials || (poor ? { ...NEW_MATS, metal: 0.8, timber: 1 } : NEW_MATS);
  const c = rule.cell || 1;
  const W = spec.size[0], Dm = spec.size[1];
  const NX = Math.ceil(W / c), NZ = Math.ceil(Dm / c), N = NX * NZ;
  const X = (ix) => -W / 2 + (ix + 0.5) * c, Z = (iz) => -Dm / 2 + (iz + 0.5) * c;
  const cellOf = (x, z) => { const ix = Math.floor((x + W / 2) / c), iz = Math.floor((z + Dm / 2) / c); return ix < 0 || iz < 0 || ix >= NX || iz >= NZ ? -1 : ix + iz * NX; };
  const parcels = [];
  const newParcel = (p) => { p.id = parcels.length; parcels.push(p); return p; };

  // ---------------------------------------------------------------- 1. road ownership
  const use = roads.filter((r) => !r._gate && r.type !== 'path' && r.samples.length > 1);
  const effClass = (road, x, z) => { const k = classOf(road); return k === 'arterial' && spine === 'main' && field(x, z) > 0.12 ? 'main' : k; };
  const frontOf = (road, s, side) => road.frontage
    ? road.hw + (road.shoulder || 0) * 0.5 + road.frontage * (0.85 + 0.3 * (0.5 + 0.5 * noise.noise2(s / 45, side * 3)))
    : road.hw + (road.sidewalk || (SIDEWALK[classOf(road)] ?? 0) * 0.4) + 0.3;
  // ownership: real distance from the road edge minus a class bonus, so a main street's lots run their
  // full depth and the side streets' corner lots start behind them (not a 45° split at every corner)
  const PRIO = { main: 22, arterial: 14, street: 0, lane: -3, track: -6, ...(rule.priority || {}) };
  const best = new Float32Array(N).fill(1e9), eff = new Float32Array(N).fill(1e9), own = new Int16Array(N).fill(-1), sArr = new Float32Array(N), sideArr = new Int8Array(N);
  const REACH = 75;
  use.forEach((r, ri) => {
    const SS = r.samples, L = SS[SS.length - 1].s, bonus = r.priority ?? PRIO[classOf(r)] ?? 0;
    r._front = [[], []];
    for (let s = 0; s <= L + 2; s += 2) { r._front[0].push(frontOf(r, s, 1)); r._front[1].push(frontOf(r, s, -1)); }
    const sp = SS[1].s - SS[0].s || 1.5, step = Math.max(1, Math.round(5 / sp));
    const idx = []; for (let i = 0; i < SS.length; i += step) idx.push(i); if (idx[idx.length - 1] !== SS.length - 1) idx.push(SS.length - 1);
    const R = r.hw + 20 + REACH;
    const E = SS[SS.length - 1], S0 = SS[0], dz2 = (iz) => Z(iz) - E.z;
    for (let k = 0; k < idx.length - 1; k++) {
      const a = SS[idx[k]], b = SS[idx[k + 1]];
      const ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const ux = ex / len, uz = ez / len;
      const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R + W / 2) / c)), ix1 = Math.min(NX - 1, Math.ceil((Math.max(a.x, b.x) + R + W / 2) / c));
      const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R + Dm / 2) / c)), iz1 = Math.min(NZ - 1, Math.ceil((Math.max(a.z, b.z) + R + Dm / 2) / c));
      for (let iz = iz0; iz <= iz1; iz++) {
        const dz = Z(iz) - a.z;
        for (let ix = ix0; ix <= ix1; ix++) {
          const dx = X(ix) - a.x;
          let t = dx * ux + dz * uz;
          const pe = (X(ix) - E.x) * E.tx + dz2(iz) * E.tz, ps = (X(ix) - S0.x) * S0.tx + (Z(iz) - S0.z) * S0.tz;
          if (pe > 1 || ps < -1) continue; // past a dead end: not this road's frontage
          if (t < 0) t = 0; else if (t > len) t = len;
          const qx = dx - ux * t, qz = dz - uz * t, d = Math.sqrt(qx * qx + qz * qz);
          if (d > R) continue;
          const side = ux * dz - uz * dx >= 0 ? 1 : -1, s = a.s + t;
          const F = r._front[side > 0 ? 0 : 1];
          const e = d - F[Math.min(F.length - 1, Math.round(s / 2))];
          const i = ix + iz * NX;
          if (e < 0 && e < best[i]) best[i] = e; // inside some road's band: road, whoever owns it
          const ee = e - (e < 0 ? 0 : bonus);
          if (ee < eff[i]) { eff[i] = ee; own[i] = ri; sArr[i] = s; sideArr[i] = side; if (best[i] >= 0) best[i] = e; }
        }
      }
    }
  });
  const lab = new Int32Array(N).fill(FREE);
  for (let i = 0; i < N; i++) if (best[i] < 0) lab[i] = ROAD;

  // ---------------------------------------------------------------- 2. reserved areas
  for (const a of ctx.areas || []) {
    const p = newParcel({ type: 'area', area: a.id, use: 'area' });
    const r = deg(a.rot || 0);
    a._parcel = p.id;
    const R = Math.hypot(a.size[0], a.size[1]) / 2 + 1;
    forBox(a.at[0] - R, a.at[1] - R, a.at[0] + R, a.at[1] + R, (i, x, z) => {
      const [lx, lz] = toLocal(x - a.at[0], z - a.at[1], r);
      if (Math.abs(lx) <= a.size[0] / 2 && Math.abs(lz) <= a.size[1] / 2 && lab[i] !== ROAD) lab[i] = p.id;
    });
  }
  if (ctx.plaza?.poly) {
    const p = newParcel({ type: 'area', area: 'plaza', use: 'area' });
    const xs = ctx.plaza.poly.map((q) => q[0]), zs = ctx.plaza.poly.map((q) => q[1]);
    forBox(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), (i, x, z) => { if (lab[i] !== ROAD && pointInPoly(x, z, ctx.plaza.poly)) lab[i] = p.id; });
  }
  function forBox(x0, z0, x1, z1, fn) {
    const a0 = Math.max(0, Math.floor((x0 + W / 2) / c)), a1 = Math.min(NX - 1, Math.ceil((x1 + W / 2) / c));
    const b0 = Math.max(0, Math.floor((z0 + Dm / 2) / c)), b1 = Math.min(NZ - 1, Math.ceil((z1 + Dm / 2) / c));
    for (let iz = b0; iz <= b1; iz++) for (let ix = a0; ix <= a1; ix++) fn(ix + iz * NX, X(ix), Z(iz));
  }

  // ---------------------------------------------------------------- 3. cut road sides into lots
  const cuts = use.map(() => ({ 1: [], '-1': [] }));
  use.forEach((road, ri) => {
    const L = road.samples[road.samples.length - 1].s;
    for (const side of [1, -1]) {
      const list = cuts[ri][side];
      // is the ground just behind the frontage at s ours? (not a cross street, an area, or another road's lots)
      const F = road._front[side > 0 ? 0 : 1];
      const blocked = (s) => {
        const p = sampleAt(road.samples, s), fo = F[Math.min(F.length - 1, Math.max(0, Math.round(s / 2)))] + 2.5;
        const i = cellOf(p.x - p.tz * side * fo, p.z + p.tx * side * fo);
        return i < 0 || lab[i] !== FREE || own[i] !== ri || sideArr[i] !== side;
      };
      let s = rng.range(0, 4);
      list.push({ s0: -1e9, s1: s, lot: null });
      while (s < L) {
        if (blocked(s)) { list.push({ s0: s, s1: s + 1, lot: null }); s += 1; continue; }
        const p = sampleAt(road.samples, s);
        const cls = effClass(road, p.x, p.z);
        const D = Math.min(1, field(p.x, p.z) * (CLASS_K[cls] ?? 0.6) * (rule.density ?? 1) * (1 + 0.15 * noise.noise2(s / 30, side * 7)));
        if (Math.abs(p.x) > W / 2 - 4 || Math.abs(p.z) > Dm / 2 - 4 || D < (rule.edge ?? 0.05) || (cls === 'arterial' && spine !== 'main')) {
          list.push({ s0: s, s1: s + 6, lot: null }); s += 6; continue;
        }
        const mode = rule.placement && rule.placement !== 'auto' ? rule.placement : modeOf(D);
        const M = LOT[mode];
        let kind = rng.weighted(rule.kinds?.[cls] || (D > 0.4 ? MIX[cls]?.hi : MIX[cls]?.lo) || MIX.street.lo);
        const ks = SIZES[kind] || SIZES.house;
        let w = rng.range(M.w[0], M.w[1]);
        if (mode !== 'attached' || NO_ROW.has(kind)) w = Math.max(w, ks.w[0] + 2 * M.gap[0] + 0.5);
        if (mode === 'attached' && NO_ROW.has(kind)) kind = 'house';
        // stop at the next cross street: a sliver is added to the previous lot instead of becoming a lot
        let k = 1; while (k < w && !blocked(s + k)) k += 1;
        if (k < w) {
          const last = list[list.length - 1];
          if (k < M.w[0] * 0.75 && last.lot && Math.abs(last.s1 - s) < 0.01) { last.s1 = last.lot.s1 = s + k; s += k; continue; }
          if (k < 4) { list.push({ s0: s, s1: s + k, lot: null }); s += k; continue; }
          w = k;
        }
        const depth = ((M.d[0] + M.d[1]) / 2) * (0.85 + 0.3 * (0.5 + 0.5 * noise.noise2(s / 40, side * 5 + ri)));
        const lot = newParcel({ type: 'lot', road: road.id, ri, side, s0: s, s1: s + w, mode, D, cls, kind, depth, era: road.era || 'postwar' });
        list.push({ s0: s, s1: s + w, lot });
        s += w;
      }
      list.push({ s0: s, s1: 1e9, lot: null });
    }
  });
  const cutAt = (ri, side, s) => {
    const list = cuts[ri][side];
    let lo = 0, hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].s0 <= s) lo = m; else hi = m - 1; }
    return list[lo];
  };
  for (let i = 0; i < N; i++) {
    if (lab[i] !== FREE || own[i] < 0) continue;
    const ct = cutAt(own[i], sideArr[i], sArr[i]);
    if (ct.lot && best[i] <= ct.lot.depth) lab[i] = ct.lot.id;
  }

  // ---------------------------------------------------------------- 4. authored buildings take their lots
  const uf = parcels.map((_, i) => i);
  const find = (a) => { while (uf[a] !== a) a = uf[a] = uf[uf[a]]; return a; };
  for (const s of ctx.authored || []) {
    if (!s._masses?.length) continue;
    const cnt = new Map();
    for (const m of s._masses) {
      const R = Math.hypot(m.w, m.d) / 2 + 1.5;
      forBox(m.cx - R, m.cz - R, m.cx + R, m.cz + R, (i, x, z) => {
        const l = lab[i];
        if (l < 0 || parcels[l].type !== 'lot' || !inOBB(m, x, z, 1.5)) return;
        const k = find(l); cnt.set(k, (cnt.get(k) || 0) + 1);
      });
    }
    if (!cnt.size) continue;
    const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const k of cnt.keys()) if (k !== main) {
      uf[k] = main;
      const A = parcels[main], B = parcels[k];
      if (A.ri === B.ri && A.side === B.side) { A.s0 = Math.min(A.s0, B.s0); A.s1 = Math.max(A.s1, B.s1); }
      A.depth = Math.max(A.depth, B.depth);
    }
    const A = parcels[main];
    A.authored = s.id; A.kind = s.kind;
    s._parcel = main;
  }
  for (let i = 0; i < N; i++) if (lab[i] >= 0) lab[i] = find(lab[i]);
  for (const p of parcels) if (find(p.id) !== p.id) p.dead = true;

  // ---------------------------------------------------------------- 5. lots grow back; interiors; farmland
  const nb4 = (i) => { const ix = i % NX, iz = (i / NX) | 0; return [ix > 0 ? i - 1 : -1, ix < NX - 1 ? i + 1 : -1, iz > 0 ? i - NX : -1, iz < NZ - 1 ? i + NX : -1]; };
  const grow = (limitOf, target) => {
    const q = new Int32Array(N), dist = new Float32Array(N);
    let h = 0, t = 0;
    for (let i = 0; i < N; i++) if (lab[i] >= 0 && parcels[lab[i]].type === 'lot') { q[t++] = i; dist[i] = 0; }
    if (target === MERGE) for (let i = 0; i < N; i++) if (lab[i] >= 0 && parcels[lab[i]].type !== 'lot') q[t++] = i;
    while (h < t) {
      const i = q[h++];
      for (const j of nb4(i)) {
        if (j < 0 || lab[j] !== target) continue;
        const d = dist[i] + c;
        if (limitOf && d > limitOf(parcels[lab[i]])) continue;
        lab[j] = lab[i]; dist[j] = d; q[t++] = j;
      }
    }
  };
  const ENC = -6;
  const compsOf = (target) => {
    const seen = new Uint8Array(N), comps = [];
    for (let i = 0; i < N; i++) {
      if (lab[i] !== target || seen[i]) continue;
      const cells = [i]; seen[i] = 1;
      let border = false;
      for (let k = 0; k < cells.length; k++) {
        const a = cells[k], ix = a % NX, iz = (a / NX) | 0;
        if (ix === 0 || iz === 0 || ix === NX - 1 || iz === NZ - 1) border = true;
        for (const j of nb4(a)) if (j >= 0 && lab[j] === target && !seen[j]) { seen[j] = 1; cells.push(j); }
      }
      comps.push({ cells, border, area: cells.length * c * c });
    }
    return comps;
  };
  const interiorMax = rule.interiorMax ?? 1600;
  const farmSpec = spec.farmland;
  // free ground reaching the map edge is countryside (lot backs stay straight against it); free ground
  // enclosed by lots is the inside of a block: the lots take it, leftovers become courtyards/gardens/pens
  for (const C of compsOf(FREE)) {
    if (C.border || C.area > interiorMax * 4) { if (farmSpec) for (const i of C.cells) lab[i] = FARMQ; }
    else for (const i of C.cells) lab[i] = ENC;
  }
  grow((p) => (p.type === 'lot' ? p.depth * 0.6 : 0), ENC);
  for (const C of compsOf(ENC)) {
    if (C.area < 150) { for (const i of C.cells) lab[i] = MERGE; continue; }
    const p = newParcel({ type: 'interior', area: C.area });
    for (const i of C.cells) lab[i] = p.id;
  }
  grow(null, MERGE);
  for (let i = 0; i < N; i++) if (lab[i] === MERGE || lab[i] === ENC) lab[i] = FREE;

  // farmland: fields on a grid aligned with the frame (rows of random height, columns of random width)
  if (farmSpec) {
    const fr = farmSpec.frame && spec._frames?.[farmSpec.frame];
    const o = fr ? fr.o : [0, 0], fa = fr ? fr.r : 0;
    const frng = new RNG(`${seed}:farms`);
    const [fw, fh] = farmSpec.cell || [[40, 70], [24, 40]];
    const bands = [];
    for (let v = -800; v < 800;) { const h = frng.range(fh[0], fh[1]); const cols = []; for (let u = -800 + frng.range(0, fw[1]); u < 800;) { const w = frng.range(fw[0], fw[1]); cols.push(u); u += w; } bands.push({ v0: v, cols }); v += h; }
    const bsearch = (arr, x, get) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (get(arr[m]) <= x) lo = m; else hi = m - 1; } return lo; };
    const keyMap = new Map();
    for (let i = 0; i < N; i++) {
      if (lab[i] !== FARMQ) continue;
      const ix = i % NX, iz = (i / NX) | 0;
      const [u, v] = toLocal(X(ix) - o[0], Z(iz) - o[1], fa);
      const b = bsearch(bands, v, (q) => q.v0), cl = bsearch(bands[b].cols, u, (q) => q);
      const key = b * 10000 + cl;
      let p = keyMap.get(key);
      if (p == null) { p = newParcel({ type: 'farm' }).id; keyMap.set(key, p); }
      lab[i] = p;
    }
  }

  // ---------------------------------------------------------------- 6. cleanup: smooth, one piece per parcel
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    const l = lab[i]; if (l < 0) continue;
    const ns = nb4(i).map((j) => (j < 0 ? OUT : lab[j]));
    const same = ns.filter((x) => x === l).length;
    if (same >= 2) continue;
    const counts = new Map(); for (const x of ns) if (x >= 0 && x !== l) counts.set(x, (counts.get(x) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) lab[i] = top[0];
  }
  {
    const seen = new Int32Array(N).fill(-1);
    const pieces = new Map(); // label -> [{cells}]
    for (let i = 0; i < N; i++) {
      const l = lab[i]; if (l < 0 || seen[i] >= 0) continue;
      const cells = [i]; seen[i] = 1;
      for (let k = 0; k < cells.length; k++) for (const j of nb4(cells[k])) if (j >= 0 && lab[j] === l && seen[j] < 0) { seen[j] = 1; cells.push(j); }
      if (!pieces.has(l)) pieces.set(l, []);
      pieces.get(l).push(cells);
    }
    for (const [l, list] of pieces) {
      list.sort((a, b) => b.length - a.length);
      for (const cells of list.slice(1)) {
        if (parcels[l].type === 'farm' && cells.length * c * c >= 150) { const p = newParcel({ type: 'farm' }); for (const i of cells) lab[i] = p.id; }
        else for (const i of cells) lab[i] = MERGE;
      }
    }
    grow(null, MERGE);
    for (let i = 0; i < N; i++) if (lab[i] === MERGE) lab[i] = FREE;
  }

  // ---------------------------------------------------------------- 7. polygons with shared edges
  const { edges, loops } = tracePolys(lab, NX, NZ, rule.tolerance ?? 1.15);
  const V = (v) => [-W / 2 + (v % (NX + 1)) * c, -Dm / 2 + Math.floor(v / (NX + 1)) * c];
  for (const e of edges) e.pts = e.ids.map(V);
  for (const p of parcels) {
    const L = loops.get(p.id);
    if (!L || p.dead) { p.dead = true; continue; }
    p.poly = L.ids.map(V);
    p.edges = L.edges;
    p.areaM2 = Math.abs(polyArea(p.poly));
  }
  const labelAt = (x, z) => { const i = cellOf(x, z); return i < 0 ? OUT : lab[i]; };

  // ---------------------------------------------------------------- 8. uses + buildings
  const lots = parcels.filter((p) => !p.dead && p.type === 'lot');
  const originFor = (p) => p.era === 'prewar' ? rng.weighted(rule.prewarOrigins || { repurposed: 3, rebuilt: 3, maintained: 2, built_on_ruin: 1.2, new: 1.5, ruin: 0.35 })
    : rng.weighted(rule.origins || ORIGINS[S.mode || spec.mode] || { new: 6, rebuilt: 0.6, repurposed: 0.3 });
  const materialFor = (origin) => origin === 'new' ? rng.weighted(newMats) : origin === 'rebuilt' || origin === 'built_on_ruin' ? rng.weighted({ adobe: 3, stone: 0.2, block: 1, plaster: 0.6 }) : rng.weighted(PREWAR);
  const floorsFor = (kind, D, cls) => {
    if (['shed', 'outhouse', 'barn', 'warehouse', 'kiosk', 'garage'].includes(kind)) return 1;
    if (cls === 'main') return D > 0.62 ? +rng.weighted({ 1: 2, 2: 4, 3: 1 }) : D > 0.4 ? +rng.weighted({ 1: 4, 2: 2 }) : 1;
    if (cls === 'street') return D > 0.6 ? +rng.weighted({ 1: 4, 2: 2 }) : +rng.weighted({ 1: 9, 2: 1 });
    return rng.chance(0.05) ? 2 : 1;
  };
  for (const l of lots) {
    const road = use[l.ri];
    const sm = (l.s0 + l.s1) / 2, p = sampleAt(road.samples, sm);
    const nx = -p.tz * l.side, nz = p.tx * l.side;
    const F = road._front[l.side > 0 ? 0 : 1], fo = F[Math.min(F.length - 1, Math.max(0, Math.round(sm / 2)))];
    l.F = [p.x + nx * fo, p.z + nz * fo];
    l.r = facingAngle(-nx, -nz); l.deg = (l.r * 180) / Math.PI;
    l.tan = [p.tx, p.tz];
    l.P = l.poly.map(([x, z]) => toLocal(x - l.F[0], z - l.F[1], l.r));
    const vi = vIntervals(l.P, 0).find(([a, b]) => a <= -0.5 && b >= -0.5) || vIntervals(l.P, 0)[0];
    l.front = vi ? vi[1] : 0; l.back = vi ? vi[0] : -l.depth;
    if (l.authored) continue;
    if (rng.chance(LOT[l.mode].vac + (rule.vacancy ?? 0))) { l.use = rng.weighted({ vacant: 3, garden: 2, ruin: l.era === 'prewar' ? 2 : 0.3 }); l._why = 'vac'; }
    const M = LOT[l.mode], ks = SIZES[l.kind] || SIZES.house;
    if (l.use === 'ruin') {
      const b = fitBuilding(l, rng.range(6, 12), rng.range(7, 11), rng.range(0.5, 3), true);
      if (b) out.push({ id: id(), kind: 'ruin', origin: rng.chance(0.5) ? 'stripped' : 'ruin', material: rng.pick(['concrete', 'block', 'brick']), size: b.size, at: b.at, rot: l.deg, snap: false, surround: false, auto: rule.id || 'town', _parcel: l.id, _lot: l });
      continue;
    }
    if (l.use) continue;
    const set = rng.range(M.set[0], M.set[1]);
    const bd0 = rng.range(ks.d[0], ks.d[1]) * (l.mode === 'attached' ? 1.25 : 1);
    const b = fitBuilding(l, l.mode === 'attached' ? 99 : rng.range(ks.w[0], ks.w[1]), bd0, set, l.mode === 'attached', rng.range(M.gap[0], M.gap[1]));
    if (!b || b.size[0] < 4 || b.size[1] < 4) { l.use = rng.chance(0.5) ? 'garden' : 'vacant'; l._why = `nofit ${l.mode} ${l.kind} f${l.front.toFixed(1)} b${l.back.toFixed(1)} a${Math.round(l.areaM2)}`; continue; }
    const origin = originFor(l);
    const st = {
      id: id(), kind: l.kind, size: b.size, origin, material: materialFor(origin), floors: floorsFor(l.kind, l.D, l.cls),
      auto: rule.id || 'town', shape: 'rect', at: b.at, rot: l.deg, snap: false,
      _density: l.D, _mode: l.mode, _class: l.cls, _road: l.road, _lot: l, _parcel: l.id, _set: set, _bx: b.bx,
    };
    if (origin === 'ruin') st.surround = false;
    if (l.mode === 'attached' || (l.D > 0.5 && rng.chance(0.6))) st.roof = ['house', 'shop', 'cantina', 'workshop', 'office'].includes(l.kind) && st.material !== 'timber' && st.material !== 'metal' ? 'flat' : undefined;
    if (['shop', 'cantina'].includes(l.kind) && l.cls !== 'lane' && rng.chance(l.mode === 'attached' ? 0.3 : 0.45)) st.porch = rng.chance(0.5) ? true : { roof: rng.pick(['latilla', 'corrugated', 'thatch']) };
    if (l.kind === 'house' && rng.chance(0.35)) st.extras = ['tinaco'];
    l.building = st.id; l.st = st; l.b = b;
    out.push(st);
  }
  // party walls: a building side that sits on its lot line, with an attached neighbour's building behind it
  for (const l of lots) {
    if (!l.st || l.mode !== 'attached') continue;
    const { bx, bw, z0, z1 } = l.b;
    for (const [sx, wall] of [[1, 'right'], [-1, 'left']]) {
      const xo = bx + sx * (bw / 2 + 0.6);
      const probes = [z0 + 0.6, (z0 + z1) / 2, z1 - 0.6].map((zz) => { const [wx, wz] = toWorld(xo, zz, l.r); return labelAt(l.F[0] + wx, l.F[1] + wz); });
      const nbL = probes[1];
      if (nbL < 0 || nbL === l.id || !probes.every((q) => q === nbL)) continue;
      const nb = parcels[nbL];
      if (nb.type !== 'lot' || nb.mode !== 'attached' || !nb.st) continue;
      (l.st.party ||= []).push(wall);
    }
  }
  for (const l of lots) delete l.st;

  // interiors and farms
  const fields = [];
  const irng = new RNG(`${seed}:interiors`);
  for (const p of parcels) {
    if (p.dead) continue;
    if (p.type === 'interior') {
      p.use = irng.weighted(p.areaM2 > 500 ? { garden: 2, orchard: 2, corral: 2, yard: 1.5, vacant: 1.5 } : { garden: 3, yard: 2.5, vacant: 2, corral: 0.8 });
      const poly = p.poly;
      if (p.use === 'garden') fields.push({ type: 'garden', poly, crop: 'mixed', _parcel: p.id });
      else if (p.use === 'orchard') fields.push({ type: 'orchard', poly, tree: irng.weighted({ fruit_tree: 3, date_palm: 0.8, pepper_tree: 0.5 }), _parcel: p.id });
      else if (p.use === 'corral') fields.push({ type: 'corral', poly, animals: { brahmin: Math.max(1, Math.min(6, Math.round(p.areaM2 / 140))) }, _parcel: p.id });
      else fields.push({ type: 'yard', poly, paint: p.use === 'yard' ? 'packed' : 'yard', alpha: 0.6, _parcel: p.id });
    } else if (p.type === 'farm') {
      const mix = farmSpec?.mix || { field: 7, fallow: 1.6, orchard: 1, pasture: 0.5, corral: 0.35 };
      p.use = p.areaM2 < 260 ? irng.weighted({ fallow: 1, pasture: 1, field: 1 }) : irng.weighted(mix);
      const crop = irng.weighted(farmSpec?.crops || { corn: 4, beans: 2.5, mixed: 1.5, chili: 1.2, squash: 1, maguey: 0.6 });
      if (p.use === 'field') fields.push({ type: 'field', poly: p.poly, crop, rowK: 1.5, stepK: 1.6, sparse: 0.08, _parcel: p.id, _farm: true });
      else if (p.use === 'fallow') fields.push({ type: 'field', poly: p.poly, fallow: true, _parcel: p.id, _farm: true, alpha: 0.7 });
      else if (p.use === 'orchard') fields.push({ type: 'orchard', poly: p.poly, tree: irng.weighted({ fruit_tree: 3, date_palm: 1, pepper_tree: 0.4 }), spacing: 7, _parcel: p.id, _farm: true });
      else if (p.use === 'corral') fields.push({ type: 'corral', poly: p.poly, animals: { brahmin: Math.max(2, Math.min(9, Math.round(p.areaM2 / 220))) }, _parcel: p.id, _farm: true });
      // pasture: left as natural ground (scrub grows there)
    }
  }
  out.lots = lots;
  out.parcels = parcels;
  out.parcelEdges = edges;
  out.parcelFields = fields;
  out.labelAt = labelAt;
  out._raster = { lab, own, NX, NZ, c };
  console.log(`[parcels] ${lots.length} lots, ${parcels.filter((p) => !p.dead && p.type === 'interior').length} interiors, ${parcels.filter((p) => !p.dead && p.type === 'farm').length} farms, ${edges.length} edges, ${Math.round(performance.now() - t0)} ms`);
  return out;
}

// largest building of the wanted size that fits the lot polygon at the front (lot-local frame)
function fitBuilding(l, wantW, wantD, set, fill, gap = 0) {
  const front = l.front, z1 = front - set;
  let bd = Math.min(wantD, front - l.back - set - 2.5);
  if (bd < 4) bd = Math.min(wantD, front - l.back - set - 0.5);
  if (bd < 3.5) return null;
  for (let k = 0; k < 3; k++, bd *= 0.8) {
    const z0 = z1 - bd;
    const iv = band(l.P, z0, z1 - 0.05, 0);
    if (!iv) continue;
    const avail = iv[1] - iv[0];
    let bw, bx;
    if (fill) { bw = avail; bx = (iv[0] + iv[1]) / 2; }
    else {
      bw = Math.min(wantW, avail - 2 * gap);
      if (bw < 4 && avail >= 4.6) bw = Math.min(wantW, avail - 0.6);
      if (bw < 4) continue;
      const slack = avail - bw;
      bx = iv[0] + slack / 2; // centred; side yards on both sides
    }
    if (bw < 3.5) continue;
    const [wx, wz] = toWorld(bx, (z0 + z1) / 2, l.r);
    return { at: [l.F[0] + wx, l.F[1] + wz], size: [Math.round(bw * 4) / 4, Math.round(bd * 4) / 4], bx, bw, z0, z1 };
  }
  return null;
}

// ---------------------------------------------------------------- polygon helpers (local frames)
export function hIntervals(P, z) {
  const xs = [];
  for (let i = 0, n = P.length; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}
export function vIntervals(P, x) {
  return hIntervals(P.map(([a, b]) => [b, a]), x);
}
// the x-interval that stays inside the polygon for every z in [z0, z1], near xc
export function band(P, z0, z1, xc) {
  const zs = [];
  for (let k = 0; k <= 6; k++) zs.push(z0 + ((z1 - z0) * k) / 6);
  for (const [, z] of P) if (z > z0 && z < z1) zs.push(z - 0.01, z + 0.01);
  let cur = null;
  for (const z of zs) {
    const ivs = hIntervals(P, z);
    if (!ivs.length) return null;
    if (!cur) { cur = ivs.find(([a, b]) => a <= xc && xc <= b) || ivs.reduce((m, q) => (q[1] - q[0] > m[1] - m[0] ? q : m)); continue; }
    let bestO = null;
    for (const iv of ivs) { const o = [Math.max(cur[0], iv[0]), Math.min(cur[1], iv[1])]; if (o[1] > o[0] && (!bestO || o[1] - o[0] > bestO[1] - bestO[0])) bestO = o; }
    if (!bestO) return null;
    cur = bestO;
  }
  return cur;
}
export function polyArea(P) { let a = 0; for (let i = 0, n = P.length; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function inOBB(m, x, z, pad) {
  const dx = x - m.cx, dz = z - m.cz, cs = Math.cos(m.r), sn = Math.sin(m.r);
  return Math.abs(dx * cs - dz * sn) <= m.w / 2 + pad && Math.abs(dx * sn + dz * cs) <= m.d / 2 + pad;
}

// ---------------------------------------------------------------- boundary tracing
// Directed cell-side edges with the parcel on the left, chained into loops; loops split at junction
// vertices (3+ labels meet) into runs; each run is simplified once in a canonical direction so the two
// parcels that share it get identical vertices.
function tracePolys(lab, NX, NZ, tol) {
  const VX = NX + 1;
  const L = (ix, iz) => (ix < 0 || iz < 0 || ix >= NX || iz >= NZ ? OUT : lab[ix + iz * NX]);
  const isJ = (v) => {
    const vx = v % VX, vz = (v / VX) | 0;
    const a = L(vx - 1, vz - 1), b = L(vx, vz - 1), cc = L(vx - 1, vz), d = L(vx, vz);
    const set = new Set([a, b, cc, d]);
    return set.size >= 3 || (set.size === 2 && a === d && b === cc);
  };
  // edges per label
  const per = new Map();
  const push = (l, from, to, other) => { let e = per.get(l); if (!e) per.set(l, (e = [])); e.push(from, to, other); };
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const l = lab[ix + iz * NX]; if (l < 0) continue;
    const v = ix + iz * VX;
    let o;
    if ((o = L(ix, iz - 1)) !== l) push(l, v, v + 1, o);
    if ((o = L(ix + 1, iz)) !== l) push(l, v + 1, v + 1 + VX, o);
    if ((o = L(ix, iz + 1)) !== l) push(l, v + 1 + VX, v + VX, o);
    if ((o = L(ix - 1, iz)) !== l) push(l, v + VX, v, o);
  }
  const cache = new Map();
  const edges = [];
  const loops = new Map();
  const jcache = new Map();
  const J = (v) => { let r = jcache.get(v); if (r == null) { r = isJ(v); jcache.set(v, r); } return r; };
  for (const [l, E] of per) {
    const n = E.length / 3;
    const byFrom = new Map();
    for (let k = 0; k < n; k++) { const f = E[k * 3]; const a = byFrom.get(f); if (a) a.push(k); else byFrom.set(f, [k]); }
    const used = new Uint8Array(n);
    let bestLoop = null, bestA = -Infinity;
    for (let k0 = 0; k0 < n; k0++) {
      if (used[k0]) continue;
      const loop = [];
      let k = k0;
      while (k != null && !used[k]) {
        used[k] = 1; loop.push(k);
        const nx = byFrom.get(E[k * 3 + 1]);
        k = nx ? nx.find((q) => !used[q]) : null;
      }
      if (loop.length < 4) continue;
      let A = 0;
      for (const q of loop) { const a = E[q * 3], b = E[q * 3 + 1]; A += (a % VX) * ((b / VX) | 0) - (b % VX) * ((a / VX) | 0); }
      if (A > bestA) { bestA = A; bestLoop = loop; }
    }
    if (!bestLoop) continue;
    const vs = bestLoop.map((q) => E[q * 3]), others = bestLoop.map((q) => E[q * 3 + 2]);
    const js = [];
    for (let i = 0; i < vs.length; i++) if (J(vs[i]) || others[i] !== others[(i - 1 + vs.length) % vs.length]) js.push(i);
    const polyIds = [], polyEdges = [];
    if (!js.length) {
      const r = runOf(vs, true, others[0], l);
      polyIds.push(...r.ids); polyEdges.push(r.edge);
    } else {
      for (let k = 0; k < js.length; k++) {
        const i0 = js[k], i1 = js[(k + 1) % js.length];
        const ids = [];
        for (let i = i0; ; i = (i + 1) % vs.length) { ids.push(vs[i]); if (i === i1 && ids.length > 1) break; }
        const r = runOf(ids, false, others[i0], l);
        polyIds.push(...r.ids.slice(0, -1)); polyEdges.push(r.edge);
      }
    }
    loops.set(l, { ids: polyIds, edges: polyEdges });
  }
  return { edges, loops };

  function runOf(ids, closed, other, l) {
    let canon = ids, flipped = false;
    if (closed) {
      let m = 0; for (let i = 1; i < ids.length; i++) if (ids[i] < ids[m]) m = i;
      const rot = ids.slice(m).concat(ids.slice(0, m));
      const rev = [rot[0], ...rot.slice(1).reverse()];
      if (rev[1] < rot[1]) { canon = rev; flipped = true; } else canon = rot;
    } else {
      const a = ids[0], b = ids[ids.length - 1];
      if (a > b || (a === b && ids[1] > ids[ids.length - 2])) { canon = [...ids].reverse(); flipped = true; }
    }
    const key = (closed ? 'c' : '') + canon[0] + ',' + canon[1] + ',' + canon[canon.length - 1] + ',' + canon.length;
    let rec = cache.get(key);
    if (!rec) {
      const xy = canon.map((v) => [v % VX, (v / VX) | 0]);
      let keep;
      if (closed) {
        let far = 0, fd = -1; for (let i = 1; i < xy.length; i++) { const d = (xy[i][0] - xy[0][0]) ** 2 + (xy[i][1] - xy[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
        const k1 = dp(xy, 0, far, tol), k2 = dp([...xy, xy[0]], far, xy.length, tol);
        keep = [...k1, ...k2.slice(1, -1)];
      } else keep = dp(xy, 0, xy.length - 1, tol);
      rec = { ids: keep.map((i) => canon[i]), edge: edges.length, closed };
      edges.push({ id: edges.length, ids: closed ? [...rec.ids, rec.ids[0]] : rec.ids, a: l, b: other });
      cache.set(key, rec);
    }
    let out = rec.ids;
    if (flipped) out = closed ? [out[0], ...out.slice(1).reverse()] : [...out].reverse();
    // for a closed run the polygon is the ring itself; for an open run keep both endpoints
    return { ids: closed ? out : out, edge: rec.edge };
  }
}

function dp(P, i0, i1, tol) {
  const keep = new Uint8Array(P.length); keep[i0] = 1; keep[i1] = 1;
  const st = [[i0, i1]];
  while (st.length) {
    const [a, b] = st.pop();
    if (b - a < 2) continue;
    const [ax, az] = P[a], [bx, bz] = P[b];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    let m = -1, md = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / L; if (d > md) { md = d; m = i; } }
    if (md > tol) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  const out = []; for (let i = i0; i <= i1; i++) if (keep[i]) out.push(i);
  return out;
}

// ---------------------------------------------------------------- fences along shared parcel edges
// One fence per boundary. Which fence: the stronger claim of the two parcels (compound wall > row-house
// wall > a yard's fence > interior > farm). Pieces running along/through a building are dropped, so a
// fence ends at the building wall and continues on the other side.
export function planParcelFences(world) {
  const P = world.parcels, E = world.parcelEdges;
  if (!P || !E) return [];
  const S = world.spec.settlement || {};
  const walls = [];
  const poor = ['dead_broke', 'poor'].includes(S.wealth);
  const lotFenceT = poor ? { ocotillo: 3, scrap: 2, pole: 1.5, wire: 1, stone_low: 1 } : S.wealth === 'struggling' ? { ocotillo: 2, adobe: 2, stone_low: 2, wood: 1, pole: 1 } : { adobe: 3, block: 2, stone_low: 1.5, wood: 1, ocotillo: 1 };
  const fenceOf = (p) => {
    if (p.fence !== undefined) return p.fence;
    const rng = new RNG(`${world.seed}:pf:${p.id}`);
    if (p.type === 'lot') {
      if (p.use === 'vacant' || p.use === 'ruin') p.fence = rng.chance(0.3) ? [rng.weighted({ ocotillo: 2, scrap: 1.5, wire: 1, pole: 1 })] : null;
      else if (p.use === 'garden') p.fence = [rng.weighted({ ocotillo: 2, pole: 1, stone_low: 1, wood: 1 })];
      else if (p.mode === 'attached') p.fence = [rng.weighted({ adobe: 3, block: 2, stone: 1 }), 2.0];
      else if (rng.chance(p.mode === 'sparse' ? 0.45 : 0.65)) { const t = rng.weighted(lotFenceT); p.fence = [t, t === 'adobe' || t === 'block' ? rng.range(1.4, 1.9) : undefined]; }
      else p.fence = null;
    } else if (p.type === 'interior') p.fence = p.use === 'corral' ? ['rail'] : p.use === 'garden' ? [rng.weighted({ ocotillo: 2, wood: 1, pole: 1 })] : null;
    else if (p.type === 'farm') p.fence = p.use === 'corral' ? ['rail'] : null;
    else p.fence = null;
    return p.fence;
  };
  const prio = (p) => (p.compound ? 6 : p.use === 'corral' ? 5 : p.type === 'lot' && p.mode === 'attached' && p.building ? 4 : p.type === 'lot' ? 3 : p.type === 'interior' ? 2 : 1);
  // building masses, hashed
  const H = new Map(), HC = 8;
  for (const s of world.structures) for (const m of s._masses || []) {
    const R = Math.hypot(m.w, m.d) / 2 + 1;
    for (let i = Math.floor((m.cx - R) / HC); i <= Math.floor((m.cx + R) / HC); i++) for (let j = Math.floor((m.cz - R) / HC); j <= Math.floor((m.cz + R) / HC); j++) {
      const k = i * 7919 + j; let a = H.get(k); if (!a) H.set(k, (a = [])); a.push(m);
    }
  }
  const onBuilding = (x, z) => { const a = H.get(Math.floor(x / HC) * 7919 + Math.floor(z / HC)); return a ? a.some((m) => inOBB(m, x, z, 0.35)) : false; };
  const byId = new Map(world.structures.map((s) => [s.id, s]));

  for (const e of E) {
    const pa = P[e.a], pb = e.b >= 0 ? P[e.b] : null;
    if (e.b === OUT || pa.dead || pb?.dead) continue;
    if (pa.type === 'area' || pb?.type === 'area') continue;
    const rng = new RNG(`${world.seed}:pe:${e.id}`);
    let f = null, owner = pa, toRoad = !pb;
    if (!pb) {
      if (pa.type === 'farm') f = rng.chance(0.2) ? [rng.weighted({ pole: 2, wire: 1.5, ocotillo: 1, stone_low: 1 })] : pa.use === 'corral' ? ['rail'] : null;
      else if (pa.type === 'lot') {
        f = fenceOf(pa);
        if (f && pa.building && pa.mode === 'attached') f = null; // the row's front is its walls
      } else f = fenceOf(pa);
    } else {
      const [hi, lo] = prio(pa) >= prio(pb) ? [pa, pb] : [pb, pa];
      owner = hi;
      if (hi.type === 'farm' && lo.type === 'farm' && !fenceOf(hi) && !fenceOf(lo)) f = rng.chance(0.3) ? [rng.weighted({ pole: 2, wire: 2, stone_low: 1, ocotillo: 0.6 })] : null;
      else f = fenceOf(hi) || fenceOf(lo) || (lo.type === 'farm' && rng.chance(0.4) ? [rng.weighted({ pole: 2, wire: 1.5, ocotillo: 1 })] : null);
    }
    if (!f) continue;
    // resample, drop pieces along/under buildings
    const pts = e.pts, samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.5));
      for (let k = 0; k < n; k++) samples.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, k === 0]);
    }
    samples.push([...pts[pts.length - 1], true]);
    // a street-side fence never runs across the face of a house that sits close to the street
    const st0 = toRoad && pa.type === 'lot' && (pa.building || pa.authored) ? byId.get(pa.building || pa.authored) : null;
    const blocksFace = st0 && (st0._set ?? 0) <= 2.2 ? (x, z) => { const [lx, lz] = toLocal(x - st0.at[0], z - st0.at[1], deg(st0.rot)); return Math.abs(lx) <= st0.size[0] / 2 + 0.6 && lz > 0; } : null;
    const runs = [];
    let cur = null;
    for (const q of samples) {
      if (onBuilding(q[0], q[1]) || blocksFace?.(q[0], q[1])) { cur = null; continue; }
      if (!cur) { cur = []; runs.push(cur); }
      cur.push(q);
    }
    for (const run of runs) {
      if (run.length < 3) continue;
      const path = run.filter((q, i) => i === 0 || i === run.length - 1 || q[2]).map((q) => [q[0], q[1]]);
      let len = 0; for (let i = 0; i < path.length - 1; i++) len += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      if (len < 1.2) continue;
      const gates = [];
      if (toRoad && pa.type === 'lot') {
        // gate facing the street: at the door if the house is set back, else in the middle of the gap
        const st = (pa.building || pa.authored) && byId.get(pa.building || pa.authored);
        let gs = len / 2;
        if (st && (st._set ?? 0) > 2.2) {
          const [dx, dz] = toWorld(0, st.size[1] / 2 + (st._set ?? 0), deg(st.rot)); const door = [st.at[0] + dx, st.at[1] + dz];
          let acc = 0, bd = Infinity;
          for (let i = 0; i < path.length - 1; i++) { const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); for (let t = 0; t <= 1; t += 0.1) { const x = path[i][0] + (path[i + 1][0] - path[i][0]) * t, z = path[i][1] + (path[i + 1][1] - path[i][1]) * t; const d = Math.hypot(x - door[0], z - door[1]); if (d < bd) { bd = d; gs = acc + t * L; } } acc += L; }
        }
        if (len > 2.6 && rng.chance(0.85)) gates.push({ s: Math.max(1, Math.min(len - 1, gs)), width: owner.compound ? 3.2 : 1.6, track: false });
      } else if (toRoad && pa.type !== 'lot' && len > 6) gates.push({ s: len * rng.range(0.3, 0.7), width: 3, track: false });
      walls.push({ id: `pf-${e.id}-${walls.length}`, type: f[0], path, height: f[1], condition: 0.55 + 0.4 * rng.next(), gates, _edge: e.id });
    }
  }
  return walls;
}

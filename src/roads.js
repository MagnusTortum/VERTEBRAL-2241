// Roads: spline centrelines that flatten the terrain into a bed. Paved roads get a broken asphalt
// ribbon (holes, patches, sand drifts, faded lines); dirt roads/tracks are painted into the ground.
import * as THREE from 'three';
import { Builder, col } from './builder.js';
import { RNG, makeNoise } from './rng.js';
import { samplePath, sampleAt, nearestOnSamples } from './geo.js';
import { ASPHALT, PAINT } from './palette.js';
import { extendAtEdges } from './terrain.js';

export const ROAD_DEFAULTS = {
  highway: { width: 9, paved: true, lines: true, shoulder: 2 },
  paved: { width: 7, paved: true, lines: false, shoulder: 1.2 },
  street: { width: 6, paved: false, shoulder: 0.5 },
  dirt: { width: 4.5, paved: false, shoulder: 0.8 },
  gravel: { width: 6, paved: false, shoulder: 0.6 },
  lane: { width: 3.4, paved: false, shoulder: 0.3 },
  alley: { width: 3.0, paved: false, shoulder: 0.2 },
  track: { width: 2.6, paved: false, shoulder: 0.3 },
  path: { width: 1.2, paved: false, shoulder: 0 },
};

// roads that reach the map edge run on ~150 m into the haze, narrowing (q.wk) as they go (q.out: 0 inside, 1 at the end)
export function roadSamples(road, terrain) {
  const S = samplePath(extendAtEdges(road.path, terrain.W, terrain.D, Math.min(150, terrain.margin)), road.type === 'path' ? 1 : 1.5, road.smooth !== false);
  for (const q of S) { q.out = terrain.outside(q.x, q.z); q.wk = 1 - 0.45 * q.out; }
  return S;
}

// unpaved run-out beyond the map edge (the ground paint stops at the edge): a draped ribbon, dustier
// and narrower as it goes, the haze takes it from there
export function buildRunout(r, terrain) {
  if (r.paved || r.type === 'path') return null;
  const S = r.samples, b = new Builder();
  const base = new THREE.Color(r.type === 'gravel' ? 0x8e8474 : r.color || PAINT.dirt), dust = new THREE.Color(0xc8b48a), layer = r.type === 'gravel' ? 'gravel' : 'dirt';
  const US = [-1.2, -0.85, 0, 0.85, 1.2];
  let any = false;
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], c = S[i + 1];
    if ((a.out || 0) <= 0 && (c.out || 0) <= 0) continue;
    any = true;
    const P = (q, u) => { const w = r.hw * (q.wk ?? 1), x = q.x - q.tz * u * w, z = q.z + q.tx * u * w; return [x, terrain.height(x, z) + 0.04, z]; };
    const k = Math.min(1, ((a.out || 0) + (c.out || 0)) / 2 * 1.6);
    for (let j = 0; j < US.length - 1; j++) {
      const edge = j === 0 || j === US.length - 2;
      const cc = base.clone().lerp(dust, k * 0.8 + (edge ? 0.3 : 0));
      b.t(edge ? 'sand' : layer).quad(P(a, US[j]), P(c, US[j]), P(c, US[j + 1]), P(a, US[j + 1]), cc);
    }
  }
  return any ? b.build() : null;
}

export function prepareRoad(road, terrain) {
  const d = ROAD_DEFAULTS[road.type || 'dirt'] || ROAD_DEFAULTS.dirt;
  const r = { ...d, ...road };
  r.samples = roadSamples(road, terrain);
  r.hw = r.width / 2;
  // arroyo crossings: asphalt keeps its level on an embankment over box culverts; gravel / dirt over a
  // pipe culvert (deep) or through a concrete ford (shallow); tracks and paths on a timber bridge
  // (vado = ford: dirt / gravel roads dip through all but deep arroyos; tracks and paths ford shallow ones, bridge deep ones)
  const crossFn = (depth) => (r.paved || r.type === 'highway' ? 'culvert' : ['track', 'path'].includes(r.type) ? (depth > 0.9 ? 'bridge' : 'ford') : depth > 0.6 ? 'pipe' : 'ford'); // gravel / dirt: the road stays level over a pipe; only a shallow wash is forded
  // a raised bed (highways by default; spec.raised = metres, 0 = off): the road stands proud of the ground on its own fill
  const zn = terrain.addPathBed(r.samples, r.hw + (r.shoulder || 0) * 0.5, r.paved ? 5 : 3, r.type === 'path' ? 0 : r.paved ? 1 : 0.85, crossFn, +(r.raised ?? (r.type === 'highway' ? 0.8 : 0)) || 0);
  r.cross = zn.cross;
  // sidewalks on pre-war paved streets / main streets (paint + curb mesh in buildRoad)
  const cls = r.class || { highway: 'arterial', paved: 'main' }[r.type] || 'street';
  r.sidewalk = r.frontage ? 0 : r.sidewalk ?? (r.paved && (r.era === 'prewar' || r.class === 'main') && r.type !== 'highway' ? (cls === 'main' ? 2.2 : 1.4) : r.class === 'main' && r.type === 'highway' ? 2.2 : 0);
  if (LAID(r)) for (const sd of [-1, 1]) { // laid-stone street: a green parkway between the curb and the walk when the walk would be too wide
    let run = [], gw = 0; const flush = () => { if (run.length > 1) terrain.addPaint({ type: 'path', samples: run, width: gw, color: 0x6c7a44, edge: 0.4, alpha: 0.9, layer: 'scrub', layerK: 1 }); run = []; };
    for (const q of r.samples) { const { green } = laidAt(r, q.s) ? walkOf(r, sd, q.s) : { green: 0 }; if (green <= 0 || (run.length && Math.abs(green - gw) > 0.3)) flush(); if (green > 0) { gw = green; const off = r.hw + 0.22 + walkOf(r, sd, q.s).walk + green / 2; run.push({ ...q, x: q.x - q.tz * off * sd, z: q.z + q.tx * off * sd }); } }
    flush();
  }
  else if (r.sidewalk) for (const sd of [-1, 1]) {
    const off = r.hw + r.sidewalk / 2 + 0.1;
    const ss = r.samples.map((q) => ({ ...q, x: q.x - q.tz * off * sd, z: q.z + q.tx * off * sd }));
    terrain.addPaint({ type: 'path', samples: ss, width: r.sidewalk, color: 0xbab2a2, edge: 0.4, alpha: 0.9, layer: 'pavers', layerK: 0.85 });
  }
  // frontage: a wide packed-dirt apron between the road and the first buildings (parking, stalls,
  // poles) — the real MEX-1 through San Quintín; no curb, the asphalt just ends in dirt
  if (r.frontage) for (const sd of [-1, 1]) { // (broken where the road crosses an arroyo: the wash keeps its own bed)
    const F = r.frontage, off = r.hw + (r.shoulder || 0) * 0.5 + F / 2;
    const ss = r.samples.map((q) => ({ ...q, x: q.x - q.tz * off * sd, z: q.z + q.tx * off * sd }));
    const step = r.samples.length > 1 ? Math.max(0.5, r.samples[1].s - r.samples[0].s) : 2, cut = new Uint8Array(ss.length);
    for (const c of r.cross || []) { const pad = Math.ceil((c.hw + 2) / step); for (let i = Math.max(0, c.i0 - pad); i <= Math.min(ss.length - 1, c.i1 + pad); i++) cut[i] = 1; }
    for (let i = 0; i < ss.length; i++) if (!cut[i] && terrain.arroyoAt?.(ss[i].x, ss[i].z)) cut[i] = 1; // the apron itself over a wash
    let run = [];
    const flush = () => { if (run.length > 1) terrain.addPaint({ type: 'path', samples: run, width: F + 1.5, color: PAINT.packed, edge: 1.6, alpha: 0.85, layer: 'urban', layerK: 0.6 }); run = []; };
    ss.forEach((q, i) => { if (cut[i]) flush(); else run.push(q); }); flush();
  }
  if (r.surface && !r.paved) {
    const L = { pavers: ['pavers', 0xb4a896], cobble: ['cobble', 0x9e958a], gravel: ['gravel', PAINT.gravel], packed: ['urban', PAINT.packed], dirt: ['dirt', PAINT.dirt] }[r.surface] || ['dirt', PAINT.dirt];
    terrain.addPaint({ type: 'path', samples: r.samples, width: r.width, color: L[1], edge: 0.6, alpha: 0.95, layer: L[0] });
  }
  // gravel street: grey-brown pebble bed with worn ruts and dry-grass verges
  if (r.type === 'gravel') {
    terrain.addPaint({ type: 'path', samples: r.samples, width: r.width, color: 0x8e8474, edge: 0.7, alpha: 0.95, layer: 'gravel', layerK: 1 });
    for (const off of [-1.1, 1.1]) {
      const rs = r.samples.map((q) => ({ ...q, x: q.x - q.tz * off, z: q.z + q.tx * off }));
      terrain.addPaint({ type: 'path', samples: rs, width: 0.7, color: 0x7d7466, edge: 0.4, alpha: 0.5 * (r.condition ?? 0.7), layer: 'dirt', layerK: 0.5 });
    }
    for (const sd of [-1, 1]) {
      const off = r.hw + 0.7;
      const ss = r.samples.map((q) => ({ ...q, x: q.x - q.tz * off * sd, z: q.z + q.tx * off * sd }));
      terrain.addPaint({ type: 'path', samples: ss, width: 1.6, color: 0x7f7a50, edge: 0.8, alpha: 0.55, layer: 'scrub', layerK: 0.8 });
    }
    return r;
  }
  // ground paint
  if (r.paved) {
    terrain.addPaint({ type: 'path', samples: r.samples, width: r.width + r.shoulder * 2, color: PAINT.gravel, edge: 1.2, alpha: 0.75 });
  } else if (r.surface === 'pavers' || r.surface === 'cobble') { // laid stone: adoquín or empedrado, edge to edge, no ruts
    const L = r.surface === 'pavers' ? ['pavers', 0x8e877c] : ['cobble', 0x7e776c];
    terrain.addPaint({ type: 'path', samples: r.samples, width: r.width + 0.3, color: L[1], edge: 0.35, alpha: 1, layer: L[0], layerK: 1 });
  } else {
    const cond = r.condition ?? 0.7;
    terrain.addPaint({ type: 'path', samples: r.samples, width: r.width, color: r.color || (r.type === 'path' ? PAINT.yard : ['track', 'lane', 'alley'].includes(r.type) ? PAINT.packed : PAINT.dirt), edge: r.type === 'path' ? 0.5 : 1.2, alpha: r.type === 'path' ? 0.7 : 0.9 });
    if (['dirt', 'street', 'lane', 'track'].includes(r.type)) {
      // wheel ruts
      for (const off of r.type === 'track' ? [-0.65, 0.65] : [-0.9, 0.9]) {
        const rs = r.samples.map((s) => ({ ...s, x: s.x - s.tz * off, z: s.z + s.tx * off }));
        terrain.addPaint({ type: 'path', samples: rs, width: 0.55, color: PAINT.packed, edge: 0.4, alpha: 0.6 * cond });
      }
    }
  }
  return r;
}

// laid stone (adoquín / empedrado): the bed, curbs and walks are meshes, so the street has hard edges and the walk runs
// from the curb to the walls (r.walk = [gap on side -1, gap on side +1], metres from the road edge to the plot fronts)
// laid stretches: r.laid = [[s0, s1], ...] along the road (only where the good side of town lines it), in r.laidSurface;
// a whole road laid by hand: r.surface = pavers | cobble
export const LAID = (r) => r.surface === 'pavers' || r.surface === 'cobble' || !!r.laid?.length;
export const laidAt = (r, s) => r.surface === 'pavers' || r.surface === 'cobble' || (r.laid || []).some(([a, b]) => s >= a && s <= b);
const laidSurf = (r) => (r.surface === 'pavers' || r.surface === 'cobble' ? r.surface : r.laidSurface || 'pavers');
export function walkOf(r, sd, s = null) {
  const seg = s == null ? null : (r.walkSeg || []).find((g) => g[0] === sd && s >= g[1] - 0.6 && s <= g[2] + 0.6);
  const gap = Math.max(0.8, seg ? seg[3] : r.walk?.[sd > 0 ? 1 : 0] ?? r.sidewalk ?? 1.2), wMin = Math.max(1.0, Math.min(2.2, (r.walk?.[sd > 0 ? 1 : 0] ?? 1.6) - 0.22)), walk = Math.min(gap - 0.22, gap - 0.22 > 3.2 ? wMin : gap - 0.22);
  return { gap, walk, green: Math.max(0, gap - 0.22 - walk) };
}
function buildLaid(r, terrain, seed) {
  const b = new Builder(), S = r.samples, rng = new RNG(`${seed}:laid:${r.id}`);
  const J = (r._junc || []), near = (q, pad) => J.some((j) => (q.x - j.x) ** 2 + (q.z - j.z) ** 2 < (j.r + pad) ** 2);
  const others = [...new Set(J.flatMap((j) => j.roads))].filter((q) => q !== r && q.samples);
  const onOther = (x, z, m = 0.25) => others.some((q) => nearestOnSamples(q.samples, x, z).d < q.hw + m);
  const H = (x, z) => terrain.height(x, z), at = (q, o) => [q.x - q.tz * o, q.z + q.tx * o];
  const quad2 = (A, B, C, D, c) => b.quad(A, B, C, D, c).quad(D, C, B, A, c);
  const surf = laidSurf(r), on = (a, c) => laidAt(r, a.s) && laidAt(r, c.s);
  const bed = col(surf === 'pavers' ? 0x8e877c : 0x7e776c, 0.03, rng), walkC = col(0xb4aa98, 0.03, rng), curbC = col(0xa8a296, 0.02, rng);
  const US = [-1, -0.5, 0, 0.5, 1];
  b.t(surf);
  for (let i = 0; i < S.length - 1; i++) { const a = S[i], c = S[i + 1]; if (!on(a, c)) continue;
    for (let k = 0; k < US.length - 1; k++) { const P = (q, u) => { const [x, z] = at(q, u * r.hw); return [x, H(x, z) + 0.035, z]; }; quad2(P(a, US[k]), P(c, US[k]), P(c, US[k + 1]), P(a, US[k + 1]), bed); }
  }
  // the crossing: a pad of the same stone over the junction (each laid road lays its own; they coincide), out to the
  // other roads' edges and the walks' corners
  for (const j of J) {
    const q = nearestOnSamples(S, j.x, j.z), sj = S[q.i].s; if (!laidAt(r, sj) && !laidAt(r, sj - j.r) && !laidAt(r, sj + j.r)) continue;
    const R0 = j.r, n = 24, y = H(j.x, j.z) + 0.035;
    const ring = Array.from({ length: n }, (_, k) => { const a2 = (k / n) * Math.PI * 2, x = j.x + Math.cos(a2) * R0, z = j.z + Math.sin(a2) * R0; return [x, H(x, z) + 0.03, z]; });
    if (j.roads.every((q) => LAID(q))) continue; // every road through it is laid: their beds and walks meet on their own
    const up = (P, Q, R2) => { const ux = Q[0] - P[0], uz = Q[2] - P[2], vx = R2[0] - P[0], vz = R2[2] - P[2]; return uz * vx - ux * vz > 0; }; // face up only (a doubled face shades dark)
    b.t(surf); for (let k = 0; k < n; k++) { const A = ring[k], B = ring[(k + 1) % n], C = [j.x, y, j.z]; if (up(C, A, B)) b.tri(C, A, B, bed); else b.tri(C, B, A, bed); }
  }
  for (const sd of [-1, 1]) {
    for (let i = 0; i < S.length - 1; i++) { const a0 = S[i], c0 = S[i + 1], { gap, green, walk } = walkOf(r, sd, (a0.s + c0.s) / 2), o0 = r.hw + 0.22, o1 = green > 0 ? r.hw + 0.22 + walk : r.hw + gap + 0.15;
      if (!on(a0, c0)) continue;
      // in short steps, so the walk and curb run right up to the crossing road's edge (they turn the corner there)
      const L0 = Math.hypot(c0.x - a0.x, c0.z - a0.z), n = others.length ? Math.max(1, Math.ceil(L0 / 0.3)) : 1;
      const lerp = (t) => { const tx = a0.tx + (c0.tx - a0.tx) * t, tz = a0.tz + (c0.tz - a0.tz) * t, l = Math.hypot(tx, tz) || 1; return { x: a0.x + (c0.x - a0.x) * t, z: a0.z + (c0.z - a0.z) * t, tx: tx / l, tz: tz / l, s: a0.s + (c0.s - a0.s) * t }; };
      for (let k = 0; k < n; k++) {
        const a = lerp(k / n), c = lerp((k + 1) / n);
        const [ix, iz] = at(a, sd * o0), [jx, jz] = at(c, sd * o0), walkOn = !(onOther(ix, iz, 0.02) || onOther(jx, jz, 0.02));
        const [ax, az] = at(a, sd * (r.hw + 0.11)), [cx, cz] = at(c, sd * (r.hw + 0.11)), curbOn = !(onOther(ax, az, 0.12) || onOther(cx, cz, 0.12));
        if (curbOn) { const mx = (ax + cx) / 2, mz = (az + cz) / 2, L = Math.hypot(cx - ax, cz - az); b.t('concrete').box(mx, H(mx, mz) + 0.07, mz, 0.22, 0.2, L + 0.02, curbC, Math.atan2(cx - ax, cz - az)); } // the curb
        if (!walkOn) continue;
        b.t('pavers'); const W = (q, o) => { const [x, z] = at(q, sd * o); return [x, H(x, z) + 0.12, z]; };
        quad2(W(a, o0), W(c, o0), W(c, o1), W(a, o1), walkC); // the walk, curb (or parkway) to the walls
        if (green > 0) { const E = (q, o, y) => { const [x, z] = at(q, sd * o); return [x, H(x, z) + y, z]; }; b.t('concrete'); quad2(E(a, o1, 0), E(c, o1, 0), E(c, o1, 0.12), E(a, o1, 0.12), curbC); } // the walk's edge against the parkway
      }
    }
  }
  // a path across the parkway from each gate to the walk
  for (const [sd, sl, w] of r.walkLinks || []) {
    if (!laidAt(r, sl)) continue; const { gap, green, walk } = walkOf(r, sd, sl); if (green <= 0.2) continue;
    const pa = sampleAt(S, sl - w / 2), pc = sampleAt(S, sl + w / 2), o0 = r.hw + 0.22 + walk - 0.02, o1 = r.hw + gap + 0.15;
    const W = (q, o) => { const [x, z] = at(q, sd * o); return [x, H(x, z) + 0.12, z]; };
    b.t('pavers'); quad2(W(pa, o0), W(pc, o0), W(pc, o1), W(pa, o1), walkC);
  }
  return b.build({ cullDown: false });
}

export function buildRoad(r, terrain, seed) {
  if (LAID(r) && !r.paved) return { surface: null, curbs: buildLaid(r, terrain, seed) };
  if (!r.paved) return null;
  const rng = new RNG(`${seed}:road:${r.id}`);
  const n = makeNoise(`${seed}:roadn:${r.id}`);
  const cond = r.condition ?? (r.era === 'prewar' || r.type === 'highway' ? 0.35 : 0.6);
  const S = r.samples.slice(); // (a copy: the ends may be extended below)
  const lift = (r._junc || []).some((j) => j.kind === 'aa' && j.main && j.main !== r) ? 0.055 : 0.06;
  const condS = (s) => { if (!r.condAt) return cond; const p = sampleAt(S, s); return r.condAt(p.x, p.z); };
  // washouts: where the road has failed completely — low frequency, only on poor roads
  const failed = (s) => n.fbm(s / 55, 11.3, 2) * 0.5 + 0.5 < (1 - condS(s)) * 0.32 - 0.08;
  const J = (r._junc || []).filter((j) => j.kind === 'aa');
  const inJ = (q, pad = 0) => J.some((j) => (q.x - j.x) ** 2 + (q.z - j.z) ** 2 < (j.r + pad) ** 2);
  // a side road ends just inside the main road's edge (the main road is drawn over it: no seam)
  // (not past the main road's own end: two roads joined end to end just run on into each other)
  const under = (q) => J.some((j) => { if (!j.main || j.main === r || (q.x - j.x) ** 2 + (q.z - j.z) ** 2 >= (j.r + 2) ** 2) return false; const M = j.main.samples, nq = nearestOnSamples(M, q.x, q.z); const atEnd = (nq.i === 0 && nq.t <= 0.02) || (nq.i >= M.length - 2 && nq.t >= 0.98); return !atEnd && nq.d < j.main.hw * 0.9; });
  const lines = (r.lines || r.type === 'highway' ? 1 : 0) + (r.type === 'highway' ? 4 : 0);
  // a ribbon a little wider than the road: the shader crumbles the edge inside it
  const US = [-1.12, -1, -0.8, -0.55, -0.3, 0, 0.3, 0.55, 0.8, 1, 1.12];
  const pos = [], rd = [], rl = [];
  const vert = (q, u, c, lf) => { const hw = r.hw * (q.wk ?? 1), x = q.x - q.tz * u * hw, z = q.z + q.tx * u * hw; pos.push(x, (q.nobed ? q.h + 0.03 : terrain.height(x, z)) + lift, z); rd.push(u, q.s, c, hw); rl.push(lf); };
  // a road continued end to end by another: run each ribbon on past the joint so the two overlap (no seam, no wedge)
  const E2E = (r._junc || []).filter((j) => j.e2e && j.roads.every((q) => q.paved));
  if (E2E.length && S.length > 1) {
    const ext = (j) => r.hw * Math.min(1.8, Math.tan((j.bend || 0) / 2) + 0.35) + 0.5;
    for (const [e, nb, at] of [[S[0], S[1], 0], [S[S.length - 1], S[S.length - 2], 1]]) {
      const j = E2E.find((q) => Math.hypot(e.x - q.x, e.z - q.z) < r.hw + 2); if (!j) continue;
      const dx = e.x - nb.x, dz = e.z - nb.z, l = Math.hypot(dx, dz) || 1, L = ext(j), v = { ...e, x: e.x + (dx / l) * L, z: e.z + (dz / l) * L, s: e.s + (at ? L : -L) };
      if (at) S.push(v); else S.unshift(v);
    }
  }
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], c = S[i + 1];
    if (failed(a.s) || failed(c.s)) continue;
    if (under(a) && under(c)) continue;
    const ca = condS(a.s), cc = condS(c.s), la = (inJ(a, 1) ? 0 : lines) + 8, lc = (inJ(c, 1) ? 0 : lines) + 8;
    for (let k = 0; k < US.length - 1; k++) {
      const u0 = US[k], u1 = US[k + 1];
      vert(a, u0, ca, la); vert(c, u0, cc, lc); vert(c, u1, cc, lc);
      vert(a, u0, ca, la); vert(c, u1, cc, lc); vert(a, u1, ca, la);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('rd', new THREE.Float32BufferAttribute(rd, 4));
  g.setAttribute('rl', new THREE.Float32BufferAttribute(rl, 1));
  g.computeVertexNormals();
  g.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  const curbs = buildCurbs(r, terrain, rng, cond, failed, inJ);
  return { surface: g, curbs };
}

function buildCurbs(r, terrain, rng, cond, failed, inJ) {
  if (!r.sidewalk) return null;
  const b = new Builder(), S = r.samples;
  {
    b.t('concrete');
    const cc = new THREE.Color(0xa8a296);
    for (let i = 0; i < S.length - 1; i += 1) {
      const a = S[i], c = S[i + 1];
      if (failed(a.s) && rng.chance(0.7)) continue;
      if (inJ(a, 1.5) || inJ(c, 1.5)) continue;
      for (const sd of [-1, 1]) {
        if (rng.chance(0.06 + (1 - cond) * 0.12)) continue; // missing curb stones
        const off = r.hw + 0.1;
        const ax = a.x - a.tz * off * sd, az = a.z + a.tx * off * sd, cx2 = c.x - c.tz * off * sd, cz2 = c.z + c.tx * off * sd;
        const mx = (ax + cx2) / 2, mz = (az + cz2) / 2, L = Math.hypot(cx2 - ax, cz2 - az);
        b.box(mx, terrain.height(mx, mz) + 0.05, mz, 0.22, 0.26, L + 0.02, cc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.04), Math.atan2(cx2 - ax, cz2 - az));
      }
    }
  }
  return b.build({ cullDown: false });
}

// Where roads meet or cross. A junction is a disc (centre + radius) covering the overlap; paved ones get
// an asphalt pad over both ribbons (rounded corners, no line paint across), unpaved ones a ground blend.
export function findJunctions(roads) {
  const R = roads.filter((r) => !r._gate && r.type !== 'path' && r.samples.length > 1);
  const pts = [];
  const seg = (a, b, c, d) => {
    const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z, den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den, u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + rx * t, z: a.z + rz * t } : null;
  };
  const coarse = (r) => r.samples.filter((_, i) => i % 2 === 0 || i === r.samples.length - 1);
  for (let i = 0; i < R.length; i++) for (let k = i + 1; k < R.length; k++) {
    const A = R[i], B = R[k], a = coarse(A), b = coarse(B);

    const hits = [];
    for (let p = 0; p < a.length - 1; p++) for (let q = 0; q < b.length - 1; q++) { const h = seg(a[p], a[p + 1], b[q], b[q + 1]); if (h) hits.push(h); }
    // T-junctions: an end of one road on (or near) the other
    for (const [X, Y] of [[A, B], [B, A]]) for (const e of [X.samples[0], X.samples[X.samples.length - 1]]) {
      let best = Infinity, bq = null;
      for (let q = 0; q < Y.samples.length - 1; q++) {
        const c = Y.samples[q], d = Y.samples[q + 1], dx = d.x - c.x, dz = d.z - c.z, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((e.x - c.x) * dx + (e.z - c.z) * dz) / L2)), x = c.x + dx * t, z = c.z + dz * t, dd = Math.hypot(e.x - x, e.z - z);
        if (dd < best) { best = dd; bq = { x, z }; }
      }
      if (best < Y.hw + 1.5) hits.push(bq);
    }
    for (const h of hits) pts.push({ x: h.x, z: h.z, roads: [A, B] });

  }
  // merge nearby points
  const out = [];
  for (const p of pts) {
    const r0 = Math.max(...p.roads.map((r) => r.hw)) * 1.08 + 0.5;
    const m = out.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < Math.max(o.r, r0));
    if (m) { for (const r of p.roads) if (!m.roads.includes(r)) m.roads.push(r); m.r = Math.max(m.r, r0); continue; }
    out.push({ x: p.x, z: p.z, r: r0, roads: [...p.roads] });
  }
  for (const j of out) {
    j.paved = j.roads.some((r) => r.paved); j.ids = j.roads.map((r) => r.id).sort();
    const np = j.roads.filter((r) => r.paved).length;
    j.kind = np >= 2 ? 'aa' : np === 1 ? 'au' : 'uu';
    // asphalt × asphalt: the main road (widest, then highway, then longest) runs through untouched
    if (j.kind === 'aa') j.main = [...j.roads].filter((r) => r.paved).sort((a, b) => b.width - a.width || (b.type === 'highway') - (a.type === 'highway') || b.samples.length - a.samples.length)[0];
    // on / off ramps: two roads meeting at a shallow angle merge — no junction pad (it would fill the whole gore
    // between them); the ramp's ribbon simply runs into the main road, which is drawn over its end
    if (j.roads.length === 2) {
      const t = j.roads.map((r) => { const q = nearestOnSamples(r.samples, j.x, j.z), a = r.samples[q.i], b = r.samples[Math.min(q.i + 1, r.samples.length - 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; });
      const c = Math.abs(t[0][0] * t[1][0] + t[0][1] * t[1][1]);
      if (c > Math.cos(0.62)) j.merge = true;
      // two roads joined end to end (a road continued, straight or at a bend): no ramp merge — a pad covers the joint
      const endNear = (r) => [r.samples[0], r.samples[r.samples.length - 1]].some((e) => Math.hypot(e.x - j.x, e.z - j.z) < r.hw + 1.5);
      if (j.roads.every(endNear)) { j.merge = true; j.e2e = true; j.bend = Math.acos(Math.min(1, c)); } // no pad: each ribbon runs on past its end and they overlap
    }
  }
  return out;
}

// Junction outline from its arms: road edges meet in rounded corners (fillets), the area between is
// road surface. Returns { poly, arcs: [{ O, r, pts }] }.
export function junctionShape(j) {
  if (j.merge) return null; // ramps merge without a pad
  const arms = [];
  for (const r of j.roads) {
    const S = r.samples, q = nearestOnSamples(S, j.x, j.z), a = S[q.i], b2 = S[Math.min(q.i + 1, S.length - 1)];
    const s = a.s + (b2.s - a.s) * q.t, L = S[S.length - 1].s, hw = r.hw + (r.shoulder || 0) * 0.5;
    for (const sg of [-1, 1]) {
      const s2 = s + sg * Math.max(6, hw * 2.5);
      if (s2 < 0.5 || s2 > L - 0.5) continue;
      const p = sampleAt(S, s2), dx = p.x - j.x, dz = p.z - j.z, l = Math.hypot(dx, dz);
      if (l < 1) continue;
      arms.push({ th: Math.atan2(dz, dx), hw, paved: r.paved, r });
    }
  }
  if (arms.length < 2) return null;
  arms.sort((p, q) => p.th - q.th);
  const C = [j.x, j.z], poly = [], arcs = [], open = [];
  const corner = arms.map((A, i) => {
    const B = arms[(i + 1) % arms.length];
    let dth = B.th - A.th; if (dth <= 0) dth += Math.PI * 2;
    if (dth < 0.25 || dth > Math.PI - 0.12) return null;
    const a = [Math.cos(A.th), Math.sin(A.th)], b = [Math.cos(B.th), Math.sin(B.th)];
    const nL = [-a[1], a[0]], nR = [b[1], -b[0]];
    // C + nL*hwA + a*t = C + nR*hwB + b*u
    const px = nR[0] * B.hw - nL[0] * A.hw, pz = nR[1] * B.hw - nL[1] * A.hw, den = a[0] * -b[1] - a[1] * -b[0];
    if (Math.abs(den) < 1e-6) return null;
    const t = (px * -b[1] - pz * -b[0]) / den;
    const X = [C[0] + nL[0] * A.hw + a[0] * t, C[1] + nL[1] * A.hw + a[1] * t];
    const rf = A.paved && B.paved ? 5 : 3, tt = rf / Math.tan(dth / 2);
    const TA = [X[0] + a[0] * tt, X[1] + a[1] * tt], TB = [X[0] + b[0] * tt, X[1] + b[1] * tt];
    const bl = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1, bis = [(a[0] + b[0]) / bl, (a[1] + b[1]) / bl], od = rf / Math.sin(dth / 2);
    const O = [X[0] + bis[0] * od, X[1] + bis[1] * od];
    let g0 = Math.atan2(TA[1] - O[1], TA[0] - O[0]), g1 = Math.atan2(TB[1] - O[1], TB[0] - O[0]);
    let dg = g1 - g0; while (dg > Math.PI) dg -= Math.PI * 2; while (dg < -Math.PI) dg += Math.PI * 2;
    const pts = []; for (let k = 0; k <= 8; k++) { const g = g0 + (dg * k) / 8; pts.push([O[0] + Math.cos(g) * rf, O[1] + Math.sin(g) * rf]); }
    return { TA, TB, O, rf, pts, X, A, B, ta: (TA[0] - C[0]) * a[0] + (TA[1] - C[1]) * a[1], tb: (TB[0] - C[0]) * b[0] + (TB[1] - C[1]) * b[1] };
  });
  arms.forEach((A, i) => {
    const prev = corner[(i - 1 + arms.length) % arms.length], cur = corner[i];
    const a = [Math.cos(A.th), Math.sin(A.th)], nL = [-a[1], a[0]];
    const E = Math.max(A.hw * 1.3, (prev?.tb ?? 0) + 0.8, (cur?.ta ?? 0) + 0.8);
    open.push(poly.length); // the arm-end edge (across the road) is open, not a road edge
    poly.push([C[0] + a[0] * E - nL[0] * A.hw, C[1] + a[1] * E - nL[1] * A.hw], [C[0] + a[0] * E + nL[0] * A.hw, C[1] + a[1] * E + nL[1] * A.hw]);
    if (cur) { poly.push(...cur.pts); arcs.push({ O: cur.O, r: cur.rf, pts: cur.pts }); }
  });
  return { poly, arcs, open, corners: corner.filter(Boolean) };
}

// asphalt × asphalt: a pad over the junction, edged by the road edges and rounded corners. Its `u` is
// the distance to that edge (as on the ribbons), so the crumbling edge, sand and wheel paths run on round
// the corners and meet the ribbons without a seam; no lane lines; condition from the nearest road.
export function buildJunction(j, terrain, seed) {
  const sh = junctionShape(j);
  if (!sh) return null;
  const pr = j.roads.filter((r) => r.paved), lift = 0.068;
  const condOf = (r) => r.condition ?? (r.era === 'prewar' || r.type === 'highway' ? 0.35 : 0.6);
  const P = sh.poly, n = P.length, open = new Set(sh.open);
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const near = (x, z) => { let best = null; for (const r of pr) { const q = nearestOnSamples(r.samples, x, z); if (!best || q.d < best.q.d) best = { r, q }; } return best; };
  const V = [];
  const vert = (x, z) => {
    let d = Infinity; for (let i = 0; i < n; i++) if (!open.has(i)) d = Math.min(d, segD(x, z, P[i], P[(i + 1) % n]));
    const nb = near(x, z), r = nb.r, a = r.samples[nb.q.i], b = r.samples[Math.min(nb.q.i + 1, r.samples.length - 1)];
    const u = Math.max(0, Math.min(1.02, 1 - d / r.hw));
    V.push([x, terrain.height(x, z) + lift, z, u, a.s + (b.s - a.s) * nb.q.t, condOf(r), r.hw]);
    return V.length - 1;
  };
  // densify the outline, fan to the centre in rings
  const dense = [];
  P.forEach((p, i) => { const q = P[(i + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 1.2)); for (let k = 0; k < m; k++) dense.push([p[0] + ((q[0] - p[0]) * k) / m, p[1] + ((q[1] - p[1]) * k) / m]); });
  const RINGS = [0.25, 0.5, 0.72, 0.88, 1.0], C = [j.x, j.z], ids = RINGS.map((k) => dense.map((p) => vert(C[0] + (p[0] - C[0]) * k, C[1] + (p[1] - C[1]) * k))), c0 = vert(C[0], C[1]);
  const tris = [], m = dense.length;
  for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m;
    tris.push(c0, ids[0][k2], ids[0][k]);
    for (let r = 0; r < RINGS.length - 1; r++) tris.push(ids[r][k], ids[r][k2], ids[r + 1][k2], ids[r][k], ids[r + 1][k2], ids[r + 1][k]);
  }
  const pos = [], rd = [];
  for (const t of tris) { const v = V[t]; pos.push(v[0], v[1], v[2]); rd.push(v[3], v[4], v[5], v[6]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('rd', new THREE.Float32BufferAttribute(rd, 4));
  g.setAttribute('rl', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(8), 1)); // road frame, no lines
  g.computeVertexNormals();
  const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
  g.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  return g;
}

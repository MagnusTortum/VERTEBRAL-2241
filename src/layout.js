// Procedural placement of structures — no grid. Frontage follows a road's curve; clusters gather
// around a centre (plaza / well) or follow an old pre-war street axis with jitter.
// `town` lays a whole settlement out along a road hierarchy with a density field:
//   dense core -> attached rows (party walls), mid -> tight lots, outskirts -> spaced lots / homesteads.
import { RNG, deg, makeNoise } from './rng.js';
import { runLots } from './lots.js';
import { runParcels } from './parcels.js';
import { obb, obbOverlap, sampleAt, pathLength, nearestWithin, facingAngle, toWorld } from './geo.js';

export const SIZES = {
  den: { w: [8, 11], d: [7, 9] },
  house: { w: [7, 12], d: [6, 9] }, shop: { w: [6, 10], d: [7, 11] }, cantina: { w: [9, 14], d: [8, 11] },
  workshop: { w: [9, 14], d: [8, 12] }, garage: { w: [8, 12], d: [8, 12] }, warehouse: { w: [14, 24], d: [10, 16] },
  barn: { w: [10, 16], d: [8, 12] }, shelter: { w: [12, 18], d: [7, 10] }, chapel: { w: [8, 11], d: [16, 22] },
  shed: { w: [3, 5], d: [3, 4] }, shack: { w: [2.8, 4.6], d: [2.4, 3.6] }, guardpost: { w: [4, 6], d: [4, 5] }, bunker: { w: [5, 8], d: [4, 6] }, barracks: { w: [14, 20], d: [7, 9] }, armory: { w: [9, 13], d: [8, 11] }, outhouse: { w: [1.4, 1.6], d: [1.4, 1.6] }, office: { w: [10, 16], d: [9, 13] },
  hall: { w: [14, 20], d: [12, 16] }, kiosk: { w: [4, 6], d: [4, 5] }, ruin: { w: [8, 16], d: [7, 12] }, tower: { w: [6, 8], d: [6, 8] },
  mission: { w: [24, 30], d: [22, 28] }, granary: { w: [5, 8], d: [4, 6] }, mill: { w: [6, 9], d: [5, 7] }, bodega: { w: [12, 18], d: [7, 10] }, townhall: { w: [14, 20], d: [9, 12] }, comandancia: { w: [9, 12], d: [9, 12] }, trade: { w: [6, 9], d: [6, 8] }, pemex: { w: [16, 20], d: [18, 22] }, utility: { w: [16, 24], d: [14, 20] },
  stand: { w: [2.4, 4.6], d: [2.2, 3] }, posada: { w: [12, 18], d: [10, 16] }, store: { w: [7, 11], d: [7, 10] }, clinic: { w: [8, 12], d: [7, 10] }, cafe: { w: [7, 11], d: [7, 10] },
};

// ---------------------------------------------------------------- road hierarchy
export const ROAD_CLASS = { highway: 'arterial', paved: 'main', street: 'street', dirt: 'street', gravel: 'street', lane: 'lane', alley: 'lane', track: 'track', path: 'lane' };
export const classOf = (r) => r.class || ROAD_CLASS[r.type] || 'street';
export const CLASS_ORDER = ['main', 'street', 'arterial', 'lane', 'track'];
export const CLASS_K = { main: 1.0, street: 0.78, arterial: 0.4, lane: 0.62, track: 0.3 };
export const MIX = {
  main:     { hi: { store: 1.2, cafe: 0.8, posada: 0.3, clinic: 0.15, shop: 5, cantina: 1.3, house: 2.5, workshop: 1, hall: 0.35, office: 0.25, garage: 0.4 }, lo: { house: 4, shop: 2, workshop: 1, cantina: 0.5 } },
  street:   { hi: { store: 0.4, cafe: 0.2, clinic: 0.1, house: 7, shop: 1.2, workshop: 0.8, cantina: 0.25 }, lo: { house: 7, workshop: 0.7, shop: 0.4, shed: 0.3 } },
  lane:     { hi: { house: 6, workshop: 0.8, shed: 1 }, lo: { house: 4, shed: 1.5, workshop: 0.5 } },
  arterial: { hi: { posada: 1, cafe: 0.8, store: 0.6, garage: 2, cantina: 1.2, shelter: 1.5, shop: 1.2, warehouse: 0.6, house: 0.4 }, lo: { garage: 1.5, shelter: 1, cantina: 0.6, warehouse: 0.6, house: 0.6 } },
  track:    { hi: { house: 3, barn: 1.5, shed: 1 }, lo: { house: 2.5, barn: 2, shed: 1 } },
};
export const NO_ROW = new Set(['warehouse', 'barn', 'chapel', 'shelter', 'shed', 'outhouse', 'hall']);
// placement by density: setback, gap to next lot, angular jitter, overlap pad
const MODES = {
  attached: { setback: [0.3, 1.2], gap: [0, 0], jitter: 0, pad: -0.2 },
  tight:    { setback: [1, 3], gap: [0.8, 2.5], jitter: 1.5, pad: 0.8 },
  separate: { setback: [2.5, 6], gap: [3, 8], jitter: 4, pad: 2 },
  sparse:   { setback: [4, 12], gap: [10, 26], jitter: 10, pad: 4 },
};
export const modeOf = (D) => (D > 0.62 ? 'attached' : D > 0.38 ? 'tight' : D > 0.16 ? 'separate' : 'sparse');

export const ORIGINS = {
  ground_up: { new: 1 },
  hybrid: { new: 4, maintained: 1, repurposed: 1.2, rebuilt: 1.4, built_on_ruin: 0.6 },
  ruins: { maintained: 2, repurposed: 2, rebuilt: 2, new: 1.5, built_on_ruin: 1, ruin: 0.6 },
};
export const NEW_MATS = { adobe: 5, stone: 0.25, plaster: 1.5, block: 0.5, timber: 0.4 };
export const PREWAR = { concrete: 2, block: 2, plaster: 2, brick: 0.6 };

// density of the settlement at a point (0..1), before the road-class factor
export function densityField(spec, seed) {
  const S = spec.settlement || {};
  const core = S.core || [0, 0], peak = S.density ?? 0.65;
  // radius: number, or [along, across] an axis (deg, compass-style like rot) for towns strung along a road
  const [Ra, Rc] = Array.isArray(S.radius) ? S.radius : [S.radius || 50, S.radius || 50];
  const ax = ((S.axis ?? 0) * Math.PI) / 180, ca = Math.cos(ax), sa = Math.sin(ax);
  const n = makeNoise(`${seed}:density`);
  return (x, z) => {
    const dx = x - core[0], dz = z - core[1];
    const along = dx * sa + dz * ca, across = dx * ca - dz * sa;
    const d = Math.hypot(along / Ra, across / Rc);
    return Math.max(0, Math.min(1, peak * Math.exp(-d * d * 1.1) * (1 + 0.22 * n.noise2(x / 40, z / 40))));
  };
}

function pickNum(rng, v, def) {
  if (v == null) return def;
  if (Array.isArray(v)) return rng.range(v[0], v[1]);
  if (typeof v === 'object') return Number(rng.weighted(v));
  return v;
}
function pickKey(rng, v, def) {
  if (v == null) return def;
  if (typeof v === 'string') return v;
  return rng.weighted(v);
}

function makeStructure(rule, rng, id, kind) {
  const sz = rule.size?.[kind] || rule.size || SIZES[kind] || SIZES.house;
  const w = Array.isArray(sz.w) ? rng.range(sz.w[0], sz.w[1]) : sz.w;
  const d = Array.isArray(sz.d) ? rng.range(sz.d[0], sz.d[1]) : sz.d;
  const s = {
    id, kind,
    size: [Math.round(w * 4) / 4, Math.round(d * 4) / 4],
    shape: pickKey(rng, rule.shapes, 'rect'),
    material: pickKey(rng, rule.materials, undefined),
    origin: pickKey(rng, rule.origins, 'new'),
    floors: Math.round(pickNum(rng, rule.floors, 1)),
    auto: rule.id || true,
  };
  if (s.shape !== 'rect' && (w < 8 || d < 7)) s.shape = 'rect';
  if (rule.porch && rng.chance(rule.porch)) s.porch = true;
  if (rule.extras) {
    s.extras = [];
    for (const [ex, p] of Object.entries(rule.extras)) if (rng.chance(p)) s.extras.push(ex);
  }
  if (rule.roofs) s.roof = pickKey(rng, rule.roofs);
  return s;
}

export function footprintOBBs(s) {
  const r = deg(s.rot || 0);
  const [w, d] = s.size || [10, 7];
  return [obb(s.at[0], s.at[1], w, d, r)];
}

export function runAuto(spec, roads, seed, extra = {}) {
  const out = [];
  out.camps = [];
  const taken = extra.taken ? [...extra.taken] : []; // OBBs
  for (const s of spec.structures || []) {
    if (!s.at) continue;
    const [w, d] = s.size || [10, 8];
    taken.push(obb(s.at[0], s.at[1], w + 1, d + 1, deg(s.rot || 0)));
  }
  const roadHit = (b, margin, skip, skipMargin = 0.15) => {
    const pts = [[b.cx, b.cz], ...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, z]) => {
      const [wx, wz] = toWorld((x * b.w) / 2, (z * b.d) / 2, b.r); return [b.cx + wx, b.cz + wz];
    })];
    for (const r of roads) {
      if (r === skip) continue;
      const fr = r.frontage ? r.frontage * 0.85 + (r.shoulder || 0) * 0.5 : 0; // nobody builds on another road's apron
      for (const [x, z] of pts) if (nearestWithin(r.samples, x, z, r.hw + margin + fr)) return true;
    }
    if (skip) for (const [x, z] of pts.slice(1)) if (nearestWithin(skip.samples, x, z, skip.hw + skipMargin)) return true;
    return false;
  };
  const W = spec.size?.[0] || 240, D = spec.size?.[1] || 240;
  const inMap = (b) => Math.abs(b.cx) + Math.max(b.w, b.d) / 2 < W / 2 - 3 && Math.abs(b.cz) + Math.max(b.w, b.d) / 2 < D / 2 - 3;

  (spec.auto || []).forEach((rule, ri) => {
    const rng = new RNG(`${seed}:auto:${rule.id || ri}`);
    let n = 0;
    const id = () => `${rule.id || 'auto' + ri}-${++n}`;
    const accept = (s, b, pad = 1.2) => {
      if (!inMap(b)) return false;
      if (taken.some((t) => obbOverlap(b, t, pad))) return false;
      if (roadHit(b, rule.roadMargin ?? 1.5)) return false;
      taken.push(b); out.push(s); return true;
    };
    if (rule.type === 'town' && rule.lots !== false && rule.lots !== 'rect') return runParcels(spec, rule, roads, seed, { rng, taken, out, roadHit, inMap, id: () => `${rule.id || 'town'}-${++n}`, authored: extra.authored, areas: extra.areas, plaza: extra.plaza });
    if (rule.type === 'town' && rule.lots !== false) return runLots(spec, rule, roads, seed, { rng, taken, out, roadHit, inMap, id: () => `${rule.id || 'town'}-${++n}` });
    if (rule.type === 'town') return runTown(spec, rule, roads, seed, { rng, taken, out, roadHit, inMap, id: () => `${rule.id || 'town'}-${++n}` });
    if (rule.type === 'frontage') {
      const road = roads.find((r) => r.id === rule.road);
      if (!road) return;
      const L = pathLength(road.samples);
      const sides = rule.side === 'left' ? [1] : rule.side === 'right' ? [-1] : [1, -1];
      for (const side of sides) {
        let s = (rule.from ?? 0) * L;
        const end = (rule.to ?? 1) * L;
        let placed = 0;
        let line = pickNum(rng, rule.setback, 3); // building line: one setback per run, small wobble
        while (s < end && placed < (rule.count ?? 999)) {
          const kind = pickKey(rng, rule.kinds, 'house');
          const st = makeStructure(rule, rng, id(), kind);
          const [w, d] = st.size;
          const p = sampleAt(road.samples, s + w / 2);
          if (!p) break;
          if (rng.chance(rule.lineBreak ?? 0.12)) line = pickNum(rng, rule.setback, 3);
          const setback = line + rng.range(-0.35, 0.35);
          const nx = -p.tz * side, nz = p.tx * side; // left normal * side
          const cx = p.x + nx * (road.hw + setback + d / 2), cz = p.z + nz * (road.hw + setback + d / 2);
          const rot = facingAngle(-nx, -nz) + deg(rng.range(-1, 1) * (rule.jitter ?? 1.5));
          st.at = [cx, cz]; st.rot = (rot * 180) / Math.PI;
          if (accept(st, obb(cx, cz, w, d, rot))) { placed++; s += w + pickNum(rng, rule.gap, 3); }
          else s += 2.5;
        }
      }
    } else if (rule.type === 'cluster') {
      const count = rule.count ?? 8;
      const R = rule.radius ?? 30;
      let tries = 0, placed = 0;
      while (placed < count && tries < count * 40) {
        tries++;
        const a = rng.next() * Math.PI * 2, dist = R * Math.sqrt(rng.next()) * (rule.ring ? 0.6 + 0.4 * rng.next() : 1);
        const cx = rule.at[0] + Math.cos(a) * dist, cz = rule.at[1] + Math.sin(a) * dist;
        const kind = pickKey(rng, rule.kinds, 'house');
        const st = makeStructure(rule, rng, `${rule.id || 'auto' + ri}-${n + 1}`, kind);
        const [w, d] = st.size;
        let rot;
        if (rule.axis != null) rot = deg(rule.axis + Math.round(rng.range(-1, 1)) * 90 * (rule.quarterTurns ? 1 : 0) + rng.range(-1, 1) * (rule.jitter ?? 3));
        else rot = facingAngle(rule.at[0] - cx, rule.at[1] - cz) + deg(rng.range(-1, 1) * (rule.jitter ?? 12));
        st.at = [cx, cz]; st.rot = (rot * 180) / Math.PI;
        if (accept(st, obb(cx, cz, w, d, rot), rule.pad ?? 2)) { n++; placed++; }
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------- town
function runTown(spec, rule, roads, seed, ctx) {
  const { rng, taken, out, roadHit, inMap } = ctx;
  const S = spec.settlement || {};
  const core = S.core || [0, 0], R = S.radius || 50;
  const spine = S.spine || 'bypass';
  const field = densityField(spec, seed);
  const noise = makeNoise(`${seed}:town:${rule.id || ''}`);
  const origins = rule.origins || ORIGINS[S.mode || spec.mode] || ORIGINS.hybrid;
  const poor = ['dead_broke', 'poor'].includes(S.wealth);
  const newMats = rule.materials || (poor ? { ...NEW_MATS, metal: 0.8, timber: 1 } : NEW_MATS);
  const use = rule.roads ? roads.filter((r) => rule.roads.includes(r.id)) : roads.filter((r) => classOf(r) !== 'none');
  const arterials = roads.filter((r) => classOf(r) === 'arterial');
  // where the town meets the arterial (spur junction) — services and caravan yards gather there
  let junction = null;
  for (const a of arterials) {
    let best = null;
    for (const sm of a.samples) { const d = Math.hypot(sm.x - core[0], sm.z - core[1]); if (!best || d < best.d) best = { d, x: sm.x, z: sm.z, s: sm.s, tx: sm.tx, tz: sm.tz, road: a }; }
    if (best && (!junction || best.d < junction.d)) junction = best;
  }
  const effClass = (road, x, z) => {
    const c = classOf(road);
    if (c === 'arterial' && spine === 'main' && Math.hypot(x - core[0], z - core[1]) < R * 1.4) return 'main';
    return c;
  };
  const sorted = [...use].sort((a, b) => CLASS_ORDER.indexOf(classOf(a)) - CLASS_ORDER.indexOf(classOf(b)));
  const kindSize = (kind, mode, cls) => {
    const sz = rule.size?.[kind] || SIZES[kind] || SIZES.house;
    let w = rng.range(sz.w[0], sz.w[1]), d = rng.range(sz.d[0], sz.d[1]);
    if (mode === 'attached' && !NO_ROW.has(kind)) { w *= 0.78; d *= 1.15; }
    if (cls === 'lane') { w *= 0.85; d *= 0.85; }
    return [Math.round(w * 4) / 4, Math.round(d * 4) / 4];
  };
  const floorsFor = (kind, D, cls) => {
    if (['shed', 'outhouse', 'barn', 'warehouse', 'kiosk', 'garage'].includes(kind)) return 1;
    if (cls === 'main' || (cls === 'arterial' && spine === 'main')) return D > 0.65 ? +rng.weighted({ 1: 2, 2: 4, 3: 1 }) : D > 0.4 ? +rng.weighted({ 1: 4, 2: 2 }) : 1;
    if (cls === 'street') return D > 0.62 ? +rng.weighted({ 1: 4, 2: 2 }) : +rng.weighted({ 1: 9, 2: 1 });
    return rng.chance(0.06) ? 2 : 1;
  };
  const materialFor = (origin) => {
    if (origin === 'new') return rng.weighted(newMats);
    if (origin === 'rebuilt' || origin === 'built_on_ruin') return rng.weighted({ adobe: 3, stone: 0.2, block: 1, plaster: 0.6 });
    return rng.weighted(PREWAR);
  };

  for (const road of sorted) {
    const L = pathLength(road.samples);
    for (const side of [1, -1]) {
      let s = 0, row = null, line = null;
      while (s < L) {
        const p = sampleAt(road.samples, s);
        if (!p) break;
        if (Math.abs(p.x) > spec.size[0] / 2 - 4 || Math.abs(p.z) > spec.size[1] / 2 - 4) { s += 3; row = null; continue; }
        const cls = effClass(road, p.x, p.z);
        let D = Math.min(1, field(p.x, p.z) * (CLASS_K[cls] ?? 0.6) * (rule.density ?? 1) * (1 + 0.15 * noise.noise2(s / 25, side * 9)));
        if (cls === 'arterial') {
          // bypass: the spine is a traffic road — services only near where the town meets it
          const nearJ = junction ? Math.hypot(p.x - junction.x, p.z - junction.z) : Infinity;
          if (nearJ > R * 0.9) { s += 6; row = null; continue; }
          D = Math.min(0.32, D + 0.08);
        }
        const outskirts = D < 0.05;
        if (outskirts && !rng.chance(rule.outskirts ?? 0.04)) { s += 8; row = null; continue; }
        const mode = rule.placement && rule.placement !== 'auto' ? rule.placement : modeOf(D);
        const M = MODES[mode];
        // vacant lots, more of them as density drops
        if (!row && rng.chance(Math.max(0, 0.55 - D * 0.9))) { s += rng.range(4, 12) * (1.3 - D); continue; }
        let kind = rng.weighted((rule.kinds?.[cls]) || (D > 0.4 ? MIX[cls]?.hi : MIX[cls]?.lo) || MIX.street.lo);
        let rowMode = mode === 'attached' && !NO_ROW.has(kind);
        const origin = rng.weighted(origins);
        const [w, d] = kindSize(kind, mode, cls);
        const st = {
          id: ctx.id(), kind, size: [w, d], origin, material: materialFor(origin),
          floors: floorsFor(kind, D, cls), auto: rule.id || 'town', shape: 'rect',
          _density: D, _mode: rowMode ? 'attached' : mode === 'attached' ? 'tight' : mode, _class: cls, _road: road.id,
        };
        if (!rowMode && w >= 9 && d >= 8 && mode !== 'attached' && kind === 'house' && rng.chance(0.25)) st.shape = rng.pick(['L', 'L', 'T', 'U']);
        if (rowMode) { st.snap = false; if (!st.roof && ['house', 'shop', 'cantina', 'workshop', 'office'].includes(kind)) st.roof = 'flat'; }
        if (['shop', 'cantina'].includes(kind) && cls !== 'lane' && rng.chance(0.35)) st.porch = rng.chance(0.5) ? true : { roof: rng.pick(['latilla', 'corrugated', 'thatch']) };
        if (kind === 'house' && rng.chance(0.35)) st.extras = ['tinaco'];
        let placedB = null;
        // continue an attached row: touch the previous building, fronts aligned
        if (rowMode && row && row.mode === 'attached') {
          const pv = row.prev, pr = deg(pv.rot);
          const [ax, az] = toWorld(1, 0, pr), [fx, fz] = toWorld(0, 1, pr);
          const sign = ax * p.tx + az * p.tz > 0 ? 1 : -1;
          const along = pv.size[0] / 2 + w / 2 - 0.02, back = pv.size[1] / 2 - d / 2;
          const cx = pv.at[0] + ax * sign * along + fx * back, cz = pv.at[1] + az * sign * along + fz * back;
          const frontX = cx + fx * d / 2, frontZ = cz + fz * d / 2;
          const q = nearestWithin(road.samples, frontX, frontZ, road.hw + 6);
          const sb = q ? q.d - road.hw : 99;
          if (sb > 0.15 && sb < M.setback[1] + 1.6) {
            const b = obb(cx, cz, w, d, pr);
            if (inMap(b) && !taken.some((t) => t !== row.box && obbOverlap(b, t, -0.25)) && !roadHit(b, 1.0, road)) {
              st.at = [cx, cz]; st.rot = pv.rot;
              st.party = [sign > 0 ? 'left' : 'right'];
              (pv.party ||= []).push(sign > 0 ? 'right' : 'left');
              placedB = b;
              s = (q ? q.s : s) + w / 2;
            }
          }
        }
        if (!placedB) {
          if (!row || row.mode !== mode || rng.chance(0.12)) line = rng.range(M.setback[0], M.setback[1]) + (cls === 'arterial' ? 5 : 0);
          const q = sampleAt(road.samples, s + w / 2);
          const nx = -q.tz * side, nz = q.tx * side;
          const sb = line + (mode === 'attached' ? 0 : rng.range(-0.35, 0.35));
          const cx = q.x + nx * (road.hw + sb + d / 2), cz = q.z + nz * (road.hw + sb + d / 2);
          const rot = facingAngle(-nx, -nz) + deg(rng.range(-1, 1) * M.jitter);
          const b = obb(cx, cz, w, d, rot);
          if (inMap(b) && !taken.some((t) => obbOverlap(b, t, Math.max(M.pad, 0.3))) && !roadHit(b, 1.2, road)) {
            st.at = [cx, cz]; st.rot = (rot * 180) / Math.PI;
            placedB = b;
            s += w;
          }
        }
        if (!placedB) { s += 2; row = null; continue; }
        taken.push(placedB); out.push(st);
        row = { prev: st, box: placedB, mode: st._mode };
        if (st._mode !== 'attached') { s += rng.range(M.gap[0], M.gap[1]) * (rule.spread ?? 1); row = mode === 'attached' ? null : row; }
      }
    }
  }
  // camps: caravan yard where the town meets the arterial; a travellers' camp out on the edge
  if (rule.camps !== false && junction) {
    const a = junction.road;
    const Lr = pathLength(a.samples);
    const coreSide = Math.sign((junction.tx) * (core[1] - junction.z) - (junction.tz) * (core[0] - junction.x)) || 1;
    if (spine === 'bypass') {
      // across the arterial from the spur, outside the town
      const sa = Math.min(Lr, Math.max(0, junction.s + rng.range(-1, 1) * 18));
      const q = sampleAt(a.samples, sa), side = -coreSide, off = a.hw + 16;
      out.camps.push({ id: 'caravan-yard', type: 'caravan', at: [q.x - q.tz * off * side, q.z + q.tx * off * side], rot: (Math.atan2(q.tx, q.tz) * 180) / Math.PI, radius: 13 });
      const sb = Math.min(Lr, Math.max(0, junction.s + (rng.chance(0.5) ? 1 : -1) * R * 1.2));
      const q2 = sampleAt(a.samples, sb), off2 = a.hw + 10;
      out.camps.push({ id: 'travellers-camp', type: 'travellers', at: [q2.x - q2.tz * off2 * coreSide, q2.z + q2.tx * off2 * coreSide], radius: 7 });
    } else {
      // main-street spine: caravans stop at the edge of town
      for (const [k, sg] of [['caravan-yard', 1], ['travellers-camp', -1]]) {
        const sa = Math.min(Lr - 5, Math.max(5, junction.s + sg * R * 1.35));
        const q = sampleAt(a.samples, sa), side = k === 'caravan-yard' ? coreSide : -coreSide, off = a.hw + (k === 'caravan-yard' ? 15 : 9);
        out.camps.push({ id: k, type: k === 'caravan-yard' ? 'caravan' : 'travellers', at: [q.x - q.tz * off * side, q.z + q.tx * off * side], rot: (Math.atan2(q.tx, q.tz) * 180) / Math.PI, radius: k === 'caravan-yard' ? 13 : 7 });
      }
    }
  }
  return out;
}
// the wasteland buildings whose body sets the footprint (kinds3.js / styles.js customs)
export const DEN_FIXED = { bus: [11, 2.6], fuselage: [16, 3.6], gatehouse: [11, 4], cages: [12, 9], water: [8, 11] };

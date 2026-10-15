// Lots planner. A town is roads → blocks → lots → building + yard, not buildings dropped near roads.
// Each road (main streets first) is walked on both sides and cut into rectangular lots facing it. A
// lot's depth shrinks until it fits between the road and whatever is behind it (the back of another
// street's lots, a road, a reserved area), so where roads form a grid the lots meet back-to-back and
// blocks emerge on their own. Lot size and building placement follow the density field:
//   attached: narrow deep lots, building fills the frontage (party walls), rear yard
//   tight:    medium lots, small side gaps        separate: wider lots, front setback, side yard
//   sparse:   big lots / homesteads on the outskirts
// Pre-war roads (era: 'prewar') carry mostly pre-war buildings (repurposed / rebuilt / maintained);
// post-war roads carry new builds.
import { RNG, deg, makeNoise } from './rng.js';
import { obb, obbOverlap, sampleAt, pathLength, toWorld, facingAngle, nearestWithin } from './geo.js';
import { SIZES, CLASS_ORDER, CLASS_K, MIX, NO_ROW, ORIGINS, NEW_MATS, PREWAR, densityField, classOf, modeOf } from './layout.js';

const LOT = { // width, depth, setback, side gap (each side), vacancy
  attached: { w: [6.5, 9.5], d: [18, 26], set: [0, 0.4], gap: [0, 0], vac: 0.04 },
  tight:    { w: [10, 14], d: [18, 26], set: [0.5, 2.5], gap: [0.6, 1.8], vac: 0.08 },
  separate: { w: [14, 20], d: [22, 30], set: [2.5, 5], gap: [1.5, 4], vac: 0.16 },
  sparse:   { w: [22, 34], d: [26, 38], set: [4, 10], gap: [4, 10], vac: 0.3 },
};
const SIDEWALK = { main: 2.2, street: 1.4, arterial: 0, lane: 0, track: 0 };

export function runLots(spec, rule, roads, seed, ctx) {
  const { taken, out, roadHit, inMap } = ctx;
  const rng = new RNG(`${seed}:lots:${rule.id || ''}`);
  const S = spec.settlement || {};
  const spine = S.spine || 'main';
  const field = densityField(spec, seed);
  const noise = makeNoise(`${seed}:lotn`);
  const poor = ['dead_broke', 'poor'].includes(S.wealth);
  const newMats = rule.materials || (poor ? { ...NEW_MATS, metal: 0.8, timber: 1 } : NEW_MATS);
  const lots = (out.lots = []);
  const use = rule.roads ? roads.filter((r) => rule.roads.includes(r.id)) : roads.filter((r) => !r._gate && r.type !== 'path');
  const effClass = (road, x, z) => {
    const c = classOf(road);
    if (c === 'arterial' && spine === 'main' && field(x, z) > 0.12) return 'main';
    return c;
  };
  const sorted = [...use].sort((a, b) => CLASS_ORDER.indexOf(effClass(a, a.samples[0].x, a.samples[0].z)) - CLASS_ORDER.indexOf(effClass(b, b.samples[0].x, b.samples[0].z)) || (a.era === 'prewar' ? -1 : 1));
  const floorsFor = (kind, D, cls) => {
    if (['shed', 'outhouse', 'barn', 'warehouse', 'kiosk', 'garage'].includes(kind)) return 1;
    if (cls === 'main') return D > 0.62 ? +rng.weighted({ 1: 2, 2: 4, 3: 1 }) : D > 0.4 ? +rng.weighted({ 1: 4, 2: 2 }) : 1;
    if (cls === 'street') return D > 0.6 ? +rng.weighted({ 1: 4, 2: 2 }) : +rng.weighted({ 1: 9, 2: 1 });
    return rng.chance(0.05) ? 2 : 1;
  };
  const originFor = (road) => {
    if (road.era === 'prewar') return rng.weighted(rule.prewarOrigins || { repurposed: 3, rebuilt: 3, maintained: 2, built_on_ruin: 1.2, new: 1.5, ruin: 0.35 });
    return rng.weighted(rule.origins || ORIGINS[S.mode || spec.mode] || { new: 6, rebuilt: 0.6, repurposed: 0.3 });
  };
  const materialFor = (origin) => {
    if (origin === 'new') return rng.weighted(newMats);
    if (origin === 'rebuilt' || origin === 'built_on_ruin') return rng.weighted({ adobe: 3, stone: 0.2, block: 1, plaster: 0.6 });
    return rng.weighted(PREWAR);
  };

  for (const road of sorted) {
    const L = pathLength(road.samples);
    for (const side of [1, -1]) {
      let s = rng.range(0, 4), prev = null;
      while (s < L - 4) {
        const p0 = sampleAt(road.samples, s);
        if (!p0 || Math.abs(p0.x) > spec.size[0] / 2 - 6 || Math.abs(p0.z) > spec.size[1] / 2 - 6) { s += 4; prev = null; continue; }
        const cls = effClass(road, p0.x, p0.z);
        const D = Math.min(1, field(p0.x, p0.z) * (CLASS_K[cls] ?? 0.6) * (rule.density ?? 1) * (1 + 0.15 * noise.noise2(s / 30, side * 7)));
        if (D < (rule.edge ?? 0.05)) { s += 8; prev = null; continue; } // beyond the town
        if (cls === 'arterial' && spine !== 'main') { s += 8; prev = null; continue; }
        const mode = rule.placement && rule.placement !== 'auto' ? rule.placement : modeOf(D);
        const M = LOT[mode];
        let kind = rng.weighted(rule.kinds?.[cls] || (D > 0.4 ? MIX[cls]?.hi : MIX[cls]?.lo) || MIX.street.lo);
        const ks = SIZES[kind] || SIZES.house;
        let w = rng.range(M.w[0], M.w[1]);
        if (mode !== 'attached' || NO_ROW.has(kind)) w = Math.max(w, ks.w[0] + 2 * M.gap[0] + 0.5);
        if (mode === 'attached' && NO_ROW.has(kind)) kind = 'house';
        const p = sampleAt(road.samples, s + w / 2);
        const tx = p.tx, tz = p.tz, nx = -tz * side, nz = tx * side;
        const front = road.frontage ? road.hw + (road.shoulder || 0) * 0.5 + road.frontage * (0.85 + 0.3 * (0.5 + 0.5 * noise.noise2(s / 45, side * 3))) : road.hw + (SIDEWALK[cls] ?? 0) * (road.era === 'prewar' || cls === 'main' ? 1 : 0.4) + 0.3;
        const rot = facingAngle(-nx, -nz);
        let lot = null;
        for (const k of [1, 0.85, 0.7, 0.58, 0.48]) {
          const d = rng.range(M.d[0], M.d[1]) * k;
          if (d < 11) break;
          const cx = p.x + nx * (front + d / 2), cz = p.z + nz * (front + d / 2);
          const b = obb(cx, cz, w, d, rot);
          if (!inMap(b) || taken.some((t) => obbOverlap(b, t, -0.35)) || roadHit({ ...b, w: w - 0.4, d: d - 0.6 }, 0.2, road, 0.05)) continue;
          lot = { cx, cz, w, d, r: rot, deg: (rot * 180) / Math.PI, road: road.id, era: road.era || 'postwar', cls, side, s, mode, D };
          break;
        }
        if (!lot) { s += 3; prev = null; continue; }
        taken.push(obb(lot.cx, lot.cz, lot.w, lot.d, lot.r));
        lots.push(lot);
        s += w;
        // vacant lot: kept as a lot (dirt yard, rubble or a garden plot) — gaps are part of a real street
        if (rng.chance(M.vac + (rule.vacancy ?? 0))) { lot.use = rng.weighted({ vacant: 3, garden: 2, ruin: road.era === 'prewar' ? 2 : 0.3 }); prev = null; continue; }
        // building
        const origin = originFor(road);
        const bw0 = mode === 'attached' ? w : Math.min(w - 2 * rng.range(M.gap[0], M.gap[1]), rng.range(ks.w[0], ks.w[1]));
        const bw = Math.max(Math.min(bw0, w), 4);
        const bd = Math.min(rng.range(ks.d[0], ks.d[1]) * (mode === 'attached' ? 1.25 : 1), lot.d - 3);
        const slack = w - bw, bx = mode === 'attached' ? 0 : rng.chance(0.5) ? rng.range(-slack / 2, slack / 2) : (rng.chance(0.5) ? 1 : -1) * slack / 2 * 0.85;
        const set = rng.range(M.set[0], M.set[1]);
        const bz = lot.d / 2 - set - bd / 2;
        const [ox, oz] = toWorld(bx, bz, rot);
        const st = {
          id: ctx.id(), kind, size: [Math.round(bw * 4) / 4, Math.round(bd * 4) / 4], origin, material: materialFor(origin),
          floors: floorsFor(kind, D, cls), auto: rule.id || 'town', shape: 'rect', at: [lot.cx + ox, lot.cz + oz], rot: lot.deg, snap: false,
          _density: D, _mode: mode, _class: cls, _road: road.id, _lot: lot,
        };
        if (origin === 'ruin') st.surround = false;
        if (mode === 'attached' || (D > 0.5 && rng.chance(0.6))) st.roof = st.roof || (['house', 'shop', 'cantina', 'workshop', 'office'].includes(kind) && st.material !== 'timber' && st.material !== 'metal' ? 'flat' : undefined);
        if (['shop', 'cantina'].includes(kind) && cls !== 'lane' && rng.chance(mode === 'attached' ? 0.3 : 0.45)) st.porch = rng.chance(0.5) ? true : { roof: rng.pick(['latilla', 'corrugated', 'thatch']) };
        if (kind === 'house' && rng.chance(0.35)) st.extras = ['tinaco'];
        lot.building = st.id; lot.bx = bx; lot.bz = bz; lot.bw = bw; lot.bd = bd;
        // party walls with the neighbour in an attached run
        if (mode === 'attached' && prev && prev.mode === 'attached' && prev.st && Math.abs(prev.s + prev.w - s + w) < 0.6) {
          const a = prev.st;
          // building-local +x is its 'right' wall; is the next lot along the road on that side?
          const nextIsPlusX = Math.cos(rot) * tx - Math.sin(rot) * tz > 0;
          (a.party ||= []).push(nextIsPlusX ? 'right' : 'left');
          (st.party ||= []).push(nextIsPlusX ? 'left' : 'right');
        }
        lot.st = st;
        out.push(st);
        prev = lot;
      }
    }
  }
  for (const l of lots) delete l.st;
  return out;
}

// lot corners in world space
export function lotPoly(l) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const [x, z] = toWorld((a * l.w) / 2, (b * l.d) / 2, l.r); return [l.cx + x, l.cz + z]; });
}

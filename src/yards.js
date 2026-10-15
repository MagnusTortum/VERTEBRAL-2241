// Yard planner: populates a residential (or work) plot round its building with editable baked items:
// props, plants, small structures (annex, shack, outhouse), garden plots, pens and their fences,
// worn footpaths and a street gate. Rules taken from hand-built yards: the house sits in the back half,
// a shade set in the front yard, the cart by the gate, a fenced garden of 15–25% of the plot, trees in
// the corners and by the house, palm pairs along walls, a cactus corner and a scrub patch, bench /
// coop / workbench, a well when there's money; plus pila + washing line, outdoor kitchen, outhouse,
// rain barrels, pens, junk corner, shrine niche, pots by the door. Size-aware: what doesn't fit is
// skipped, small plots get a few things, big ones get more and bigger. Everything is tagged
// { inPlot, bake: 'yard' }; a re-roll drops the untouched ones and plans again around the rest.
import { RNG } from './rng.js';
import { plotFrame, autoBuilding, polySigned } from './plots.js';
import { toWorld, toLocal, pointInPoly } from './geo.js';
import { massesFor } from './buildings.js';
import { lifeSet } from './props3.js';
import { SURFACES } from './grounds.js';
import { TIER_RANK } from './finishes.js';
import { standSize } from './stands.js';

export const HOUSEHOLDS = { auto: 'auto', family: 'family', wealthy: 'wealthy family', farmer: 'farmer', rancher: 'rancher', trader: 'trader', shopkeeper: 'shopkeeper (home behind the shop)', craftsman: 'craftsman', mechanic: 'mechanic yard', salvager: 'salvager (pepenador)', fisher: 'fisher', innkeeper: 'innkeeper', foodseller: 'food seller (stand)', aguador: 'aguador (water seller)', curandero: 'curandero', military: 'military compound' };
export const CRAFTS = { auto: 'auto', carpenter: 'carpenter', potter: 'potter', tanner: 'saddler / tanner', weaver: 'weaver' };
const WEALTH = { poor: 0, struggling: 0, average: 1, comfortable: 2, prosperous: 2, wealthy: 3, rich: 3 };

// footprints (w × d, m) used for fitting; anything not listed gets 1 × 1
const FOOT = {
  well: [2.6, 2.6], ramada: [4.2, 4.2], shade_cloth: [4, 4], table: [1.6, 1.2], cafe_table: [2, 2], chair: [0.7, 0.7], bench: [1.7, 0.7], bench_park: [1.8, 0.7],
  pila: [1.4, 1.0], laundry_line: [4.2, 0.8], rain_barrel: [0.9, 0.9], chicken_coop: [2.2, 1.8], chickens: [1.6, 1.6], dog: [1, 0.6], drum_stove: [1, 1],
  tires: [1.4, 1.4], scrap_pile: [2.6, 2.2], car_wreck: [4.8, 2.2], truck_chassis: [6.5, 2.6], engine_block: [1.1, 1.1], workbench: [2.2, 1], barrel: [0.9, 0.9],
  crates: [1.3, 1.3], cart: [2.8, 1.6], wagon: [4.2, 2.2], haystack: [2.8, 2.8], woodpile: [2.2, 1.2], generator: [1.6, 1.1], watchtower: [3.2, 3.2],
  sandbags: [3.2, 1.2], barrier: [2.8, 0.9], water_tower: [3.2, 3.2], tent_wall: [4.2, 5.2], stall: [3.2, 2.2], tarp_stall: [3.2, 3.2], cart_shop: [2.8, 1.6],
  goods: [1.3, 1.3], hitching_rail: [3.4, 0.8], burro: [2, 1], brahmin: [3, 1.6], tire_swing: [2.6, 1.8], toys: [1, 1], hammock: [3.8, 1.2], domino_table: [2.3, 2.3],
  nicho: [1, 0.8], pot_plant: [0.6, 0.6], water_jugs: [1, 1], water_tank: [2.4, 2.4], windmill: [3.2, 3.2], drying_rack: [2.8, 0.9], ollas: [1.4, 1.4],
  food_cart: [2.2, 1.4], agua_fresca: [1.8, 1.2], goat: [1, 0.6], pig: [1.2, 0.7], spotlight_tower: [2, 2], radio_mast: [2, 2], wire_coil: [3, 1], cheval: [3.2, 1.6],
  solar_panel: [2.2, 1.6], car_fan_turbine: [1.5, 1.5], gas_pump: [1.2, 1], cistern: [4.8, 5], lantern: [0.5, 0.5],
  fountain: [3, 3], pergola: [4.8, 3.8], patio_slab: [4, 3], garden_bed: [3.2, 1.4], tree_ring: [2.2, 2.2], dining_table: [3, 2.2], grill: [1.6, 1.0], iron_bench: [1.8, 0.8], swing_chair: [2.4, 1.6], citrus_pot: [0.9, 0.9], pier_lamp: [0.7, 0.7], generator_shed: [2.8, 1.6], stable: [5.4, 3.2], pickup: [2.2, 5.2],
  sawhorse: [2.4, 1.0], potters_wheel: [1.5, 1.9], loom: [1.6, 2.0], yarn_line: [3.8, 1.2], saddle_rack: [3.2, 1.9], panga: [2.2, 6.8], net_rack: [4.4, 1.2],
  fish_rack: [3.2, 1.0], crab_traps: [2.6, 1.0], sort_bins: [3.8, 1.2], scale: [1.8, 1.6], water_cart: [2, 3.6], herb_bed: [2.9, 1.3], altar: [1.7, 1.1],
  kiln: [2.9, 2], lumber: [3.4, 1.8], tan_pit: [4.5, 1.9], hide_frame: [2.1, 0.8], mud_pit: [4.6, 3.8], temazcal: [3.2, 4.8], lean_to: [3.2, 2.4], trough: [3.1, 0.9],
  scrap_heap: [3.4, 1.6], firepit: [1.8, 1.8], horno: [2.7, 1.9], sacks: [1.8, 1.1], pottery_rack: [2.6, 0.7], meat_rack: [2.6, 1.4], cooler: [0.9, 0.6],
};
const TREES = { shade: { pepper_tree: 3, mesquite: 2.5, fruit_tree: 2, eucalyptus: 0.6, tamarisk: 0.6, palo_verde: 0.8 }, palm: { fan_palm: 2, date_palm: 1.5 }, cactus: { nopal: 3, agave: 2, cholla: 1.2, ocotillo: 0.6 }, scrub: { sage: 3, encelia: 2.5, creosote: 2 } };

export function autoHousehold(pl, st, rng) {
  const k = st?.kind || 'house';
  if (['garage', 'workshop'].includes(k)) return 'mechanic';
  if (k === 'trade' && st?.layout === 'alfareria') return 'craftsman';
  // shops: the trader (stall, stock out back) or the shopkeeper who lives behind the shop (a second row / back wing)
  if (['shop', 'store', 'cantina', 'cafe', 'trade'].includes(k)) return rng.weighted(st?.zcat === 'centro' || st?.zcat === 'lowcom' ? { shopkeeper: 3, trader: 1 } : { shopkeeper: 2, trader: 1.2 });
  if (['barracks', 'armory', 'guardpost', 'bunker'].includes(k)) return 'military';
  if (k === 'posada') return 'innkeeper';
  if (k === 'clinic' && st?.layout === 'curandero') return 'curandero';
  if (k === 'shack') return rng.chance(0.4) ? 'salvager' : 'family';
  const A = Math.abs(polySigned(pl.poly));
  if (A > 650) return rng.weighted({ farmer: 6, rancher: 2, family: 2 });
  return rng.weighted({ family: 20, craftsman: 1.5, foodseller: 1, salvager: 0.6, aguador: 0.4, curandero: 0.3 });
}
const KIND_FOR = { wealthy: 'house', family: 'house', farmer: 'house', rancher: 'house', trader: 'store', shopkeeper: 'store', craftsman: 'workshop', mechanic: 'garage', salvager: 'house', fisher: 'house', innkeeper: 'posada', foodseller: 'house', aguador: 'house', curandero: 'house', military: 'barracks' };
const HOMELY = new Set(['wealthy', 'family', 'farmer', 'rancher', 'craftsman', 'foodseller', 'salvager', 'fisher', 'aguador', 'curandero']); // live in the house, house sits back

// ---------------------------------------------------------------------------------------------
// plan(spec, pl, opts) → { structure?, props, plants, structures, walls, fields, paint, gate?, fence?, ground? }
// opts: { household, life (0..1), seed, v, world } — world (optional) gives the built door position
export function planYard(spec, pl, opts = {}) {
  const rng = new RNG(`${opts.seed}:yard:${pl.id}:${opts.v || 0}`);
  const F = plotFrame(pl), A = Math.abs(polySigned(pl.poly));
  const size = A < 150 ? 0 : A < 320 ? 1 : A < 650 ? 2 : 3;
  const out = { props: [], plants: [], structures: [], walls: [], fields: [], paint: [] };
  const tag = (e) => ({ ...e, inPlot: pl.id, bake: 'yard' });
  const L = (q) => toLocal(q[0] - F.front[0], q[1] - F.front[1], F.rot), W = (u, v) => { const [x, z] = toWorld(u, v, F.rot); return [+(F.front[0] + x).toFixed(2), +(F.front[1] + z).toFixed(2)]; };
  const LP = pl.poly.map(L);

  // the building: the plot's own, or a new one set into the back half
  // the building already on the plot: linked, tagged to it, or simply standing in it (the biggest one)
  let st = (spec.structures || []).find((s) => s.id === pl.building) || (spec.structures || []).find((s) => s.plot === pl.id && !s.inPlot);
  if (!st) st = (spec.structures || []).filter((s) => s.at && pointInPoly(s.at[0], s.at[1], pl.poly) && !(s.inPlot === pl.id && s.bake)).sort((a, b) => (b.size?.[0] || 8) * (b.size?.[1] || 8) - (a.size?.[0] || 8) * (a.size?.[1] || 8))[0] || null;
  if (st && !pl.building) out.linkBuilding = st.id;
  let household = opts.household && opts.household !== 'auto' ? opts.household : pl.household && pl.household !== 'auto' ? pl.household : null;
  if (!st && opts.addBuilding) { // only when asked: populate never adds a building on its own
    household ||= autoHousehold(pl, null, rng);
    const kind = opts.kind && opts.kind !== 'auto' ? opts.kind : KIND_FOR[household] || 'house';
    st = autoBuilding(pl, { kind, setback: household === 'trader' || household === 'shopkeeper' || household === 'mechanic' ? 'tight' : 'set_back', v: (opts.v || 0) * 7 + 3, origins: opts.origins }, opts.seed);
    if (!st) return null;
    if (HOMELY.has(household) && household !== 'craftsman') { // into the back half, keeping 2 m behind it
      const [, vc] = L(st.at), hd = st.size[1] / 2, minV = Math.min(...LP.map((q) => q[1]));
      const want = Math.max(-F.d * 0.62 + hd, minV + hd + 2.2);
      for (const k of [1, 0.66, 0.33]) {
        const nv = vc + (Math.min(vc, want) - vc) * k, [x, z] = toWorld(L(st.at)[0], nv, F.rot);
        const at = [+(F.front[0] + x).toFixed(2), +(F.front[1] + z).toFixed(2)], r = (st.rot * Math.PI) / 180;
        const ok = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => { const [ox, oz] = toWorld(a * st.size[0] * 0.5, b * st.size[1] * 0.5, r); return pointInPoly(at[0] + ox, at[1] + oz, pl.poly); });
        if (ok) { st.at = at; break; }
      }
    }
    if (household === 'military') { st.origin = 'prewar'; st.material = 'concrete'; delete st.roof; delete st.roofMat; }
    out.structure = st;
  }
  const autoHH = !household;
  household ||= pl.zcat === 'wealthy' ? 'wealthy' : autoHousehold(pl, st, rng); // the good side of town: a kept garden, whatever the trade out front
  const set = spec.settlement || {}, tier = !st ? null : typeof st.finish === 'string' ? st.finish : st._finish?.tier || st.finish?.tier;
  const wealth = Math.max(pl.zcat === 'wealthy' ? 2 : 0, Math.min(3, (WEALTH[set.wealth] ?? 1) + ((TIER_RANK[tier] ?? 1) >= 3 ? 1 : (TIER_RANK[tier] ?? 1) <= 0 ? -1 : 0)));
  if (autoHH && household === 'family') { const wr = new RNG(`${opts.seed}:wealthy:${pl.id}`); if (wealth >= 3 || (wealth >= 2 && wr.chance(pl.zcat === 'wealthy' ? 0.8 : 0.3))) household = 'wealthy'; }
  out.household = household;
  let life = opts.life ?? pl.life ?? 0.5;

  // ---- occupancy grid in the plot frame (u across, v from the street (0) inward (negative))
  const C = 0.5, us = LP.map((q) => q[0]), vs = LP.map((q) => q[1]);
  const u0 = Math.min(...us), v0 = Math.min(...vs), NU = Math.ceil((Math.max(...us) - u0) / C) + 1, NV = Math.ceil((Math.max(...vs) - v0) / C) + 1;
  const grid = new Uint8Array(NU * NV); // 0 free, 1 blocked, 2 path (blocked for things, ok to walk)
  const cu = (i) => u0 + (i + 0.5) * C, cv = (j) => v0 + (j + 0.5) * C;
  const edgeDist = (u, v) => { let m = 1e9; for (let i = 0; i < LP.length; i++) { const a = LP[i], b = LP[(i + 1) % LP.length], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(u - a[0] - dx * t, v - a[1] - dz * t)); } return m; };
  const inside = (u, v) => pointInPoly(u, v, LP);
  const EDGE = 0.45;
  const dist = new Float32Array(NU * NV);
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const u = cu(i), v = cv(j), k = j * NU + i; dist[k] = inside(u, v) ? edgeDist(u, v) : -1; if (dist[k] < EDGE) grid[k] = 1; }
  const markRect = (u, v, w, d, rot, val = 1, pad = 0) => { // rot: radians in the plot frame
    const c = Math.cos(rot), s = Math.sin(rot), R = Math.hypot(w, d) / 2 + pad;
    for (let j = Math.max(0, Math.floor((v - R - v0) / C)); j <= Math.min(NV - 1, Math.ceil((v + R - v0) / C)); j++) for (let i = Math.max(0, Math.floor((u - R - u0) / C)); i <= Math.min(NU - 1, Math.ceil((u + R - u0) / C)); i++) {
      const du = cu(i) - u, dv = cv(j) - v, lu = du * c - dv * s, lv = du * s + dv * c;
      if (Math.abs(lu) <= w / 2 + pad && Math.abs(lv) <= d / 2 + pad) { const k = j * NU + i; if (grid[k] !== 1) grid[k] = Math.max(grid[k], val); }
    }
  };
  const fits = (u, v, w, d, rot, allowPath = false) => {
    const c = Math.cos(rot), s = Math.sin(rot), R = Math.hypot(w, d) / 2;
    for (let j = Math.max(0, Math.floor((v - R - v0) / C)); j <= Math.min(NV - 1, Math.ceil((v + R - v0) / C)); j++) for (let i = Math.max(0, Math.floor((u - R - u0) / C)); i <= Math.min(NU - 1, Math.ceil((u + R - u0) / C)); i++) {
      const du = cu(i) - u, dv = cv(j) - v, lu = du * c - dv * s, lv = du * s + dv * c;
      if (Math.abs(lu) <= w / 2 && Math.abs(lv) <= d / 2) { const g = grid[j * NU + i]; if (g === 1 || (g === 2 && !allowPath)) return false; }
    }
    // the corners themselves must be inside too (cells only sample)
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = u + (a * w / 2) * c + (b * d / 2) * s, z = v - (a * w / 2) * s + (b * d / 2) * c; if (!inside(x, z) || edgeDist(x, z) < 0.3) return false; }
    return true;
  };

  // the house and anything else already on the plot
  const houses = [];
  for (const s of spec.structures || []) {
    if (s.id !== st?.id && !pointInPoly(s.at[0], s.at[1], pl.poly)) continue;
    const r = (s.rot * Math.PI) / 180, rl = r - F.rot;
    for (const m of massesFor(s, null)) {
      const [mx, mz] = toWorld(m.x, m.z, r), [lu, lv] = L([s.at[0] + mx, s.at[1] + mz]);
      const porchD = s.id === st?.id && m.main && s.porch ? (s.porch.depth || 2.4) : 0;
      const [pu, pv] = toWorld(0, porchD / 2, rl);
      markRect(lu + pu, lv + pv, m.w, m.d + porchD, rl, 1, s.id === st?.id ? 0.25 : 0.4);
      if (s.id === st?.id) houses.push({ u: lu, v: lv, w: m.w, d: m.d, rl, main: m.main });
    }
  }
  if (st && !(spec.structures || []).includes(st)) { // the new building isn't in the spec yet
    const r = (st.rot * Math.PI) / 180, rl = r - F.rot;
    for (const m of massesFor(st, null)) { const [mx, mz] = toWorld(m.x, m.z, r), [lu, lv] = L([st.at[0] + mx, st.at[1] + mz]); markRect(lu, lv, m.w, m.d, rl, 1, 0.25); houses.push({ u: lu, v: lv, w: m.w, d: m.d, rl, main: m.main }); }
  }
  // a building's side shade (built with its own tables, chairs or workbench): nothing else goes under it
  for (const s of spec.structures || []) {
    const RA = opts.world?.items?.get?.(s.id)?.info?.roofAccess; // the outside stair / ladder up to the roof garden
    if (RA && (s.id === st?.id || pointInPoly(s.at[0], s.at[1], pl.poly))) { const r = ((s.rot || 0) * Math.PI) / 180, [ox, oz] = toWorld(RA.x, RA.z, r), [su, sv] = L([s.at[0] + ox, s.at[1] + oz]); markRect(su, sv, RA.w, RA.d, r - F.rot, 1, 0.4); }
    const sh = opts.world?.items?.get?.(s.id)?.info?.shade;
    if (!sh || !(s.id === st?.id || pointInPoly(s.at[0], s.at[1], pl.poly))) continue;
    const r = ((s.rot || 0) * Math.PI) / 180, [ox, oz] = toWorld(sh.x, sh.z, r), [su, sv] = L([s.at[0] + ox, s.at[1] + oz]);
    markRect(su, sv, sh.w, sh.d, r + sh.ry - F.rot, 1, 0.35);
  }
  for (const p of spec.props || []) if (!(p.inPlot === pl.id && p.bake === 'yard' && !p.touched) && p.at && pointInPoly(p.at[0], p.at[1], pl.poly)) { const [a, b] = L(p.at), f = FOOT[p.type] || [1, 1]; markRect(a, b, f[0], f[1], ((p.rot || 0) * Math.PI) / 180 - F.rot, 1, 0.2); }
  for (const p of spec.vegetation?.plants || []) if (!(p.inPlot === pl.id && p.bake === 'yard' && !p.touched) && pointInPoly(p.at[0], p.at[1], pl.poly)) { const [a, b] = L(p.at); markRect(a, b, 1.2, 1.2, 0, 1); }
  for (const f of spec.fields || []) if (f.poly && !(f.inPlot === pl.id && f.bake === 'yard' && !f.touched)) { const c = f.poly.reduce((m, q) => [m[0] + q[0] / f.poly.length, m[1] + q[1] / f.poly.length], [0, 0]); if (pointInPoly(c[0], c[1], pl.poly)) for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const [x, z] = W(cu(i), cv(j)); if (pointInPoly(x, z, f.poly)) grid[j * NU + i] = 1; } }

  // house frame: front (toward the street) / back / door
  const H = houses.find((h) => h.main) || houses[0] || { u: 0, v: -F.d * 0.55, w: 0.1, d: 0.1, rl: 0 }; // no building: an open yard round the middle
  const ext = (h) => { const c = Math.abs(Math.cos(h.rl)), s = Math.abs(Math.sin(h.rl)); return [h.w * c + h.d * s, h.w * s + h.d * c]; };
  const [hW, hD] = ext(H), hFront = H.v + hD / 2, hBack = H.v - hD / 2;
  let door = [H.u, hFront];
  const built = st && opts.world?.items?.get?.(st.id)?.info?.frontDoor;
  if (built && st._y != null) { const r = (st.rot * Math.PI) / 180, [x, z] = toWorld(built.x, built.z, r); door = L([st.at[0] + x, st.at[1] + z]); }
  // gate: the plot's own, else one on the street front in line with the door (when the street side is fenced)
  const front = [pl.poly[0], pl.poly[1]];
  // not every yard is walled: on an 'auto' plot the household decides — no wall at all, a light stick /
  // wire fence, a low stone wall, an open street side, or the usual wall
  if ((pl.fence || 'auto') === 'auto' && !pl.bakedFence) {
    const W0 = {
      wealthy: { compound: 2, adobe: 1.5, block: 1.2 },
      family: { auto: 2 + wealth, none: wealth <= 0 ? 2 : 1, ocotillo: 0.2, pole: 0.7, wire: 0.7, stone_low: 0.6, picket: wealth >= 2 ? 0.5 : 0 },
      farmer: { none: 2, wire: 2, ocotillo: 1.5, pole: 1, stone_low: 0.6, auto: 0.5 },
      trader: { auto: 3, none: 1.2, wire: 0.5 }, shopkeeper: { auto: 3, none: 0.5 }, mechanic: { auto: 1.5, scrap: 2, none: 1, wire: 0.8 }, military: { compound: 3, auto: 1 },
      rancher: { wire: 2.5, none: 1.5, pole: 1.5, stone_low: 0.6 }, craftsman: { auto: 2, none: 1, pole: 0.6, wire: 0.6 }, salvager: { scrap: 3, none: 1.5, wire: 1 },
      fisher: { none: 2.5, pole: 1, ocotillo: 0.3, wire: 0.8 }, innkeeper: { auto: 3, none: 0.6 }, aguador: { auto: 1.5, none: 1.2, pole: 0.8, wire: 0.6 },
      curandero: { auto: 1.5, ocotillo: 0.8, none: 1, pole: 0.6 }, foodseller: { auto: 1.5, none: 1.5, pole: 0.5 },
    }[household] || { auto: 1 };
    const f = rng.weighted(W0);
    if (f !== 'auto') out.fence = f;
    if (household === 'wealthy') { out.fenceH = 2.4; out.fenceGlass = rng.chance(0.5); }
    if (f !== 'none' && household !== 'military' && household !== 'wealthy' && rng.chance(household === 'trader' || household === 'shopkeeper' ? 0.4 : 0.15)) out.noFence = [0]; // street side left open
  }
  const fenceNow = out.fence || pl.fence || 'auto';
  let gate = pl.gates?.[0]?.at ? L(pl.gates[0].at) : null;
  const streetFenced = fenceNow !== 'none' && !(out.noFence || pl.noFence || []).includes(0);
  if (!gate) {
    const a = L(front[0]), b = L(front[1]), dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0.15, Math.min(0.85, ((door[0] - a[0]) * dx + (door[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    gate = [a[0] + dx * t, a[1] + dz * t];
    if (streetFenced) out.gate = { at: W(gate[0], gate[1]), width: ['mechanic', 'military', 'farmer', 'rancher', 'innkeeper', 'aguador', 'fisher', 'wealthy'].includes(household) ? 3.5 : 3, leaf: wealth >= 2 ? 'metal' : 'wood' };
  }
  // keep the way from the gate to the door clear (and the drive for mechanics / farmers)
  const pathW = ['mechanic', 'farmer', 'military', 'rancher', 'innkeeper', 'aguador', 'fisher'].includes(household) ? 3.2 : 1.6;
  const seg = (a, b, w, val) => { const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); markRect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L2, w, rot, val); };
  const doorOut = [door[0], door[1] + 1.2];
  if (!st) seg([gate[0], gate[1] - 0.2], [gate[0], gate[1] - 4.5], pathW, 2); // open yard: just keep the way in clear
  else { seg([gate[0], gate[1] - 0.2], [gate[0], doorOut[1]], pathW, 2); seg([gate[0], doorOut[1]], doorOut, pathW, 2); }
  if (st) out.paint.push(pathPaint([W(gate[0], gate[1] - 0.3), W(gate[0], doorOut[1]), W(doorOut[0], doorOut[1]), W(door[0], door[1] + 0.2)], 1.1));

  // nothing in front of any ground-floor door of a building on the plot (side and back doors too)
  for (const s2 of [...(spec.structures || []), ...(st && !(spec.structures || []).includes(st) ? [st] : [])]) {
    if (s2.id !== st?.id && !pointInPoly(s2.at[0], s2.at[1], pl.poly)) continue;
    const inf = opts.world?.items?.get?.(s2.id)?.info, r = ((s2.rot || 0) * Math.PI) / 180;
    const ds = inf ? (inf.openings || []).filter((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && (o.y0 ?? 0) < 0.6) : [];
    for (const o of ds) {
      const [x, z] = toWorld(o.x, o.z, r), [nx, nz] = toWorld(o.nx, o.nz, r), P0 = [s2.at[0] + x, s2.at[1] + z];
      const a0 = L(P0), a1 = L([P0[0] + nx, P0[1] + nz]), nu = a1[0] - a0[0], nv = a1[1] - a0[1], dep = o.type === 'bigdoor' ? 3.0 : 1.9;
      markRect(a0[0] + nu * dep / 2, a0[1] + nv * dep / 2, (o.w || 1) + 0.9, dep, Math.atan2(nu, nv), 1);
    }
    if (!ds.length && s2.id === st?.id) markRect(door[0], door[1] + 0.95, 1.9, 1.9, 0, 1); // not built yet: the estimated front door
  }

  // ---- placement
  const zone = (u, v) => (v > hFront + 0.4 ? 'front' : v < hBack - 0.4 ? 'back' : 'side');
  const corners = LP.map((q, i) => ({ u: q[0], v: q[1], i }));
  const near = (u, v, p) => Math.hypot(u - p[0], v - p[1]);
  const houseDist = (u, v) => Math.max(Math.abs(u - H.u) - hW / 2, Math.abs(v - H.v) - hD / 2, 0) + Math.min(0, Math.max(Math.abs(u - H.u) - hW / 2, Math.abs(v - H.v) - hD / 2));
  const PREF = {
    front: (u, v) => (zone(u, v) === 'front' ? 0 : 50) + Math.abs(u - door[0]) * 0.15,
    door: (u, v) => near(u, v, door) * 1.2 + (zone(u, v) === 'front' ? 0 : 3),
    porch: (u, v) => near(u, v, door) + (zone(u, v) === 'front' ? 0 : 6),
    gate: (u, v) => near(u, v, gate) + (zone(u, v) === 'front' ? 0 : 20),
    back: (u, v) => (zone(u, v) === 'back' ? 0 : zone(u, v) === 'side' ? 15 : 40) + houseDist(u, v) * 0.3,
    backFar: (u, v) => (zone(u, v) === 'back' ? 0 : 30) - houseDist(u, v) * 0.5,
    backHouse: (u, v) => (zone(u, v) === 'front' ? 30 : 0) + Math.abs(houseDist(u, v) - 0.4) * 2,
    house: (u, v) => Math.abs(houseDist(u, v) - 0.3) * 2 + (zone(u, v) === 'front' ? 3 : 0),
    side: (u, v) => (zone(u, v) === 'side' ? 0 : 12) + houseDist(u, v) * 0.5,
    corner: (u, v) => Math.min(...corners.map((c) => near(u, v, [c.u, c.v]))),
    backCorner: (u, v) => Math.min(...corners.filter((c) => c.v < hBack).map((c) => near(u, v, [c.u, c.v])).concat([99])),
    frontCorner: (u, v) => Math.min(...corners.filter((c) => c.v > hFront - 1).map((c) => near(u, v, [c.u, c.v])).concat([99])),
    edge: (u, v) => { const k = Math.floor((v - v0) / C) * NU + Math.floor((u - u0) / C); return Math.abs((dist[k] ?? 0) - 1.2) * 2 + (zone(u, v) === 'front' ? 4 : 0); },
    any: () => 0,
  };
  const used = new Set();
  const spot = (w, d, pref, { rot = null, pad = 0.3, path = false, jitter = 1.5, val = 1 } = {}) => {
    const P = PREF[pref] || pref, rots = rot != null ? [rot] : [0, Math.PI / 2];
    let best = null;
    for (let j = 0; j < NV; j += 1) for (let i = 0; i < NU; i += 1) {
      const k = j * NU + i; if (grid[k] !== 0 && !(path && grid[k] === 2)) continue;
      const u = cu(i), v = cv(j), sc = P(u, v) + rng.next() * jitter;
      if (best && sc >= best.sc) continue;
      for (const r of rots) if (fits(u, v, w, d, r, path)) { best = { u, v, r, sc }; break; }
    }
    if (best) markRect(best.u, best.v, w, d, best.r, val, pad);
    return best;
  };
  const prop = (type, pref, o = {}) => {
    const f = o.foot || FOOT[type] || [1, 1], s = spot(f[0], f[1], pref, o);
    if (!s) return null;
    const face = o.face ?? (rng.chance(0.5) ? 0 : Math.PI); // front = +Z
    const deg = Math.round((F.deg + ((s.r + face) * 180) / Math.PI + (o.wobble ?? rng.range(-8, 8))) * 10) / 10;
    const p = tag({ type, at: W(s.u, s.v), rot: deg, ...(o.extra || {}) });
    out.props.push(p); used.add(type);
    return { ...s, p };
  };
  const plant = (species, pref, clear = 1.2, o = {}) => {
    const s = spot(clear, clear, pref, { pad: o.pad ?? 0.4, jitter: o.jitter ?? 2 });
    if (!s) return null;
    out.plants.push(tag({ species, at: W(s.u + rng.range(-0.15, 0.15), s.v + rng.range(-0.15, 0.15)), rot: Math.round(rng.range(0, 360)), ...(o.scale ? { scale: o.scale } : {}) }));
    return s;
  };
  const shed = (kind, size, pref) => {
    const s = spot(size[0] + 0.6, size[1] + 0.6, pref, { pad: 0.6, jitter: 2 });
    if (!s) return null;
    const front = zone(s.u, s.v) === 'back' ? 0 : Math.PI; // doors face the house / yard
    const st2 = tag({ id: `${pl.id}-y${out.structures.length}-${opts.v || 0}`, kind, size, at: W(s.u, s.v), rot: Math.round(F.deg + ((s.r + front) * 180) / Math.PI), origin: 'new', material: kind === 'shed' ? rng.pick(['timber', 'block', 'adobe']) : kind === 'outhouse' ? 'timber' : undefined, floors: 1, snap: false });
    if (kind === 'shed' || kind === 'outhouse') st2.roof = 'shed';
    out.structures.push(st2);
    return s;
  };
  const fenceRect = (s, w, d, type, gapSide = 'auto') => { // fence the sides that aren't already plot fence, a gap toward the house
    const c = Math.cos(s.r), sn = Math.sin(s.r), P = (a, b) => [s.u + a * c + b * sn, s.v - a * sn + b * c];
    const cs = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
    const toHouse = (a, b) => near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [H.u, H.v]);
    let gi = 0, gd = 1e9; for (let i = 0; i < 4; i++) { const dd = toHouse(cs[i], cs[(i + 1) % 4]); if (dd < gd) { gd = dd; gi = i; } }
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (fenceNow !== 'none' && edgeDist(m[0], m[1]) < 1.0) continue; // the plot's own fence is there
      if (i === gi && gapSide) { const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]), t0 = 0.5 - 0.55 / L2, t1 = 0.5 + 0.55 / L2, q0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], q1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]; out.walls.push(tag({ type, path: [W(...a), W(...q0)] })); out.walls.push(tag({ type, path: [W(...q1), W(...b)] })); }
      else out.walls.push(tag({ type, path: [W(...a), W(...b)] }));
    }
    return cs;
  };
  const pick = (o) => rng.weighted(o);
  const chance = (p) => rng.chance(Math.max(0, Math.min(1, p)));

  // ---- composition (agreed rules, Oct 2026)
  // zones: front = the public face (trade, selling, shade, bench by the gate) · side = service (water, pila,
  // washing) · back = private / working (animals, garden, outhouse, junk). Everything comes in small
  // pre-arranged groups (vignettes) set AGAINST something: a house wall, the plot wall, a corner; only
  // shades stand free. A budget keeps 40–70% of the yard as swept ground (density). Liveliness only adds
  // the signs of people (washing out, chairs pulled out, fire lit, animals loose, things left lying); it
  // never moves anything. Wealth picks quality (well vs barrels, ramada vs tarp), not quantity.
  const poor = wealth <= 0, rich = wealth >= 2;
  const houseArea = houses.reduce((m, h) => m + h.w * h.d, 0);
  const yardArea = Math.max(10, A - houseArea);
  // the slider is the household's habit; the room sets the scale: a big empty yard fills up and gets busy, a strip
  // round a house that takes the whole plot stays bare and quiet (~80 m² of yard is neutral)
  const roomK = Math.max(-0.35, Math.min(0.3, Math.log2(yardArea / 80) * 0.22)) - (yardArea / A < 0.35 ? 0.1 : 0);
  const density = Math.max(0.05, Math.min(1, (opts.density ?? pl.density ?? 0.5) + roomK)) * (pl.zcat === 'wealthy' ? 0.3 : 1); // a kept garden: room to walk
  life = Math.max(0.05, Math.min(1, life + roomK * 0.8));
  let budget = yardArea * (0.18 + 0.32 * density), spent = 0; // footprint m² the vignettes may take
  const room = (w, d) => spent + w * d <= budget;
  const stickFence = poor ? pick({ ocotillo: 3, pole: 2, wire: 1.5 }) : pick({ wire: 2, ocotillo: 1.5, pole: 1 });

  // anchors: the house walls and the plot walls, with the normal pointing into the yard
  const segs = [];
  for (const h of houses) {
    const c = Math.cos(h.rl), sn = Math.sin(h.rl), P = (a, b) => [h.u + (a * h.w / 2) * c + (b * h.d / 2) * sn, h.v - (a * h.w / 2) * sn + (b * h.d / 2) * c];
    const cs = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
    for (let i = 0; i < 4; i++) {
      const a = cs[i], b = cs[(i + 1) % 4], L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = [(b[0] - a[0]) / L2, (b[1] - a[1]) / L2];
      let n = [-t[1], t[0]]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (n[0] * (m[0] - h.u) + n[1] * (m[1] - h.v) < 0) n = [-n[0], -n[1]];
      segs.push({ kind: 'house', main: h.main, a, b, t, n, L: L2, m });
    }
  }
  { const cu = LP.reduce((s2, q) => s2 + q[0], 0) / LP.length, cv = LP.reduce((s2, q) => s2 + q[1], 0) / LP.length;
    for (let i = 0; i < LP.length; i++) {
      const a = LP[i], b = LP[(i + 1) % LP.length], L2 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = [(b[0] - a[0]) / L2, (b[1] - a[1]) / L2];
      let n = [-t[1], t[0]]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (n[0] * (cu - m[0]) + n[1] * (cv - m[1]) < 0) n = [-n[0], -n[1]];
      segs.push({ kind: 'plot', street: i === 0, a, b, t, n, L: L2, m });
    } }
  // a w × d footprint with its back against an anchor; local +z points away from the wall
  const anchor = (w, d, pref, { on = 'any', corner = false, pad = 0.3, jitter = 1.2, street = false, gap = null } = {}) => {
    const P = PREF[pref] || pref; let best = null;
    for (const sg of segs) {
      if (on !== 'any' && sg.kind !== on) continue;
      if (sg.kind === 'plot' && sg.street && !street) continue; // the street wall stays clear unless asked
      if (sg.L < w + 0.4) continue;
      const g = gap ?? (sg.kind === 'house' ? 0.4 : 0.55), r = Math.atan2(sg.n[0], sg.n[1]);
      const ss = corner ? [w / 2 + 0.15, sg.L - w / 2 - 0.15] : []; if (!corner) for (let s2 = w / 2 + 0.2; s2 <= sg.L - w / 2 - 0.2; s2 += 0.5) ss.push(s2);
      for (const s2 of ss) {
        const u = sg.a[0] + sg.t[0] * s2 + sg.n[0] * (d / 2 + g), v = sg.a[1] + sg.t[1] * s2 + sg.n[1] * (d / 2 + g);
        const sc = P(u, v) + rng.next() * jitter;
        if (best && sc >= best.sc) continue;
        if (fits(u, v, w, d, r)) best = { u, v, r, sc, sg, w, d };
      }
    }
    if (best) { markRect(best.u, best.v, w, d, best.r, 1, pad); spent += w * d; }
    return best;
  };
  // free-standing (shades, pens in the open): the old grid search, counted against the budget
  const free = (w, d, pref, o2 = {}) => { const s2 = spot(w, d, pref, o2); if (s2) { s2.w = w; s2.d = d; spent += w * d; } return s2; };
  const at = (V, lx, lz) => { const c = Math.cos(V.r), s2 = Math.sin(V.r); return [V.u + lx * c + lz * s2, V.v - lx * s2 + lz * c]; };
  const put = (V, type, lx, lz, a = 0, extra = {}) => { const [u, v] = at(V, lx, lz); const jit = (Math.abs(Math.sin(u * 12.9898 + v * 78.233)) * 43758.5453 % 1) * 8 - 4; const p = tag({ type, at: W(u, v), rot: Math.round((F.deg + ((V.r + a) * 180) / Math.PI + jit) * 10) / 10, ...extra }); out.props.push(p); used.add(type); return p; };
  // liveliness has its own random stream and its own late pass, so moving the slider never moves the layout
  const lrng = new RNG(`${opts.seed}:yardlife:${pl.id}:${opts.v || 0}`), later = [], L8 = (fn) => later.push(fn);
  const live = (p) => lrng.chance(Math.max(0, Math.min(1, p * Math.min(1, life * 2.5)))); // a sign of life, by liveliness (none at 0)
  const tree = (pref, sp = null) => plant(sp || pick(TREES.shade), pref, 1.6, { pad: 0.8 });
  const trees = (n, pref) => { for (let k = 0; k < n; k++) tree(pref); };
  const cactusCorner = () => { const s2 = spot(2.4, 2.4, rng.chance(0.5) ? 'frontCorner' : 'corner', { pad: 0, jitter: 2 }); if (!s2) return; for (let k = 0; k < rng.int(2, 4); k++) out.plants.push(tag({ species: pick(TREES.cactus), at: W(s2.u + rng.range(-0.8, 0.8), s2.v + rng.range(-0.8, 0.8)), rot: rng.int(0, 359), scale: +rng.range(0.7, 1.1).toFixed(2) })); };
  const hardYard = ['saltillo', 'laja', 'encaustic', 'brick', 'slab', 'cobble', 'pavers', 'herringbone'].includes(pl.ground?.surface) && (pl.ground?.cover || 'all') === 'all';
  const scrub = (n) => { if (hardYard) return; for (let k = 0; k < n; k++) plant(pick(TREES.scrub), 'edge', 0.8, { pad: 0, jitter: 6 }); };

  // ---- vignettes (each returns its anchor or null)
  const VG = {
    // rain barrel and jugs at a house corner
    water: () => { const V = anchor(1.8, 0.9, 'house', { on: 'house', corner: true, jitter: 3 }); if (!V) return null; put(V, 'rain_barrel', -0.45, 0); if (rich || chance(0.5)) put(V, rng.chance(0.5) ? 'water_jugs' : 'barrel', 0.45, 0); return V; },
    // pila against the house; the washing line strung from the house wall to the plot wall (or on posts)
    laundry: () => {
      const V = anchor(1.5, 1.0, 'backHouse', { on: 'house', jitter: 2 }); if (!V) return null; put(V, 'pila', 0, 0);
      const [pu, pv] = at(V, 0, -V.d / 2 - 0.4), dir = V.sg.n; let hitL = null; // from the house wall, out to the plot wall
      for (let s2 = 3; s2 <= 8.5; s2 += 0.5) { const u = pu + dir[0] * s2, v = pv + dir[1] * s2; if (!inside(u, v) || edgeDist(u, v) < 0.4) { hitL = s2; break; } }
      const Ln = hitL ?? 4.5, [mu, mv] = [pu + dir[0] * Ln / 2, pv + dir[1] * Ln / 2];
      const lowWall = ['none', 'wire', 'pole', 'ocotillo', 'stone_low', 'rail'].includes(fenceNow);
      markRect(mu, mv, 0.4, Ln - 1.0, V.r, 2); // walkable under it
      out.props.push(tag({ type: 'laundry_line', at: W(mu, mv), rot: Math.round(F.deg + ((V.r + Math.PI / 2) * 180) / Math.PI), length: +Ln.toFixed(1), posts: hitL && !lowWall ? false : 'far', hang: +Math.min(1, life * 1.4).toFixed(2) }));
      return V;
    },
    // outdoor kitchen against the house: drum stove, table, ollas, jugs
    kitchen: () => {
      const V = anchor(3.4, 1.9, 'backHouse', { on: 'house', jitter: 2 }); if (!V) return null;
      put(V, 'drum_stove', -1.05, -0.35, 0, { lit: live(0.25 + life * 0.6) });
      put(V, poor && chance(0.4) ? 'crates' : 'table', 0.6, 0.15, 0, { chairs: Math.round(life * 3 * lrng.next()) });
      put(V, 'ollas', 1.45, -0.55); if (live(0.2 + life * 0.5)) put(V, 'water_jugs', -1.6, 0.45);
      return V;
    },
    // a shade in front of the house (ramada when there's money), table and chairs under it
    patio: (pref = 'front') => {
      if (!room(4.2, 3.4)) return null;
      const kind = rich ? pick({ ramada: 2, shade_cloth: 1 }) : pick({ ramada: 1, shade_cloth: 2 }), w = 4, d = 3.2;
      const V = anchor(w, d, pref, { on: 'house', jitter: 1.5, gap: 0.15 }) || free(w, d, pref, { pad: 0.3, rot: 0 }); if (!V) return null;
      V.r ??= 0; put(V, kind, 0, 0, 0, { width: w, depth: d, ...(kind === 'ramada' ? { roof: rng.chance(0.6) ? 'latilla' : 'corrugated' } : {}) });
      put(V, rng.chance(0.6) ? 'table' : 'cafe_table', 0, 0.2, 0, { chairs: Math.round(life * 4 * (0.5 + lrng.next() * 0.5)) });
      const hb = lrng.chance(0.5) ? 'hammock' : 'bench'; if (live(life * 0.7)) put(V, hb, 0, -1.1, 0);
      return V;
    },
    // nicho on the front wall, pots by the door
    shrine: () => { const V = anchor(1.0, 0.7, 'door', { on: 'house', jitter: 2, gap: 0.2 }); if (!V) return null; put(V, 'nicho', 0, -0.2, 0); return V; },
    pots: (n) => { const V = anchor(Math.max(1, n * 0.5), 0.6, 'door', { on: 'house', jitter: 1.5, gap: 0.15, pad: 0.1 }); if (!V) return null; for (let k = 0; k < n; k++) put(V, 'pot_plant', (k - (n - 1) / 2) * 0.5, 0, 0, { count: 1 }); return V; },
    // chicken coop against the back wall; the chickens out when it's lively
    coop: () => { const V = anchor(2.3, 1.9, 'back', { on: 'plot' }); if (!V) return null; put(V, 'chicken_coop', 0, 0, 0); if (live(0.2 + life * 0.7)) put(V, 'chickens', lrng.range(-1, 1), 1.6, 0, { count: lrng.int(2, 5) }); return V; },
    // tidy stack along the plot wall
    stack: (types, n, pref = 'back') => { const fw = Math.max(...types.map((t) => (FOOT[t] || [0.8, 0.8])[0])) + 0.12, fd = Math.max(...types.map((t) => (FOOT[t] || [0.8, 0.8])[1])), w = n * fw; if (!room(w, fd)) return null; const V = anchor(w, fd, pref, { on: 'plot', jitter: 2 }); if (!V) return null; for (let k = 0; k < n; k++) put(V, rng.pick(types), (k - (n - 1) / 2) * fw, 0, fw > 1.2 ? 0 : rng.range(-0.2, 0.2)); return V; },
    woodpile: (pref = 'side') => { const V = anchor(2.2, 1.1, pref, { jitter: 2 }); if (!V) return null; put(V, 'woodpile', 0, 0); return V; },
    // junk in a back corner
    junk: () => { if (!room(3, 2.4)) return null; const V = anchor(3, 2.2, 'backCorner', { on: 'plot', corner: true, jitter: 2 }); if (!V) return null; put(V, 'scrap_pile', -0.6, 0, rng.next() * 6); put(V, 'tires', 0.9, -0.3, rng.next() * 6); if (chance(0.5)) put(V, 'barrel', 0.9, 0.6); return V; },
    // the cart parked along the front wall by the gate
    cart: (type = rng.chance(0.65) ? 'cart' : 'wagon') => { const w = type === 'wagon' ? 4.4 : 3.0; const V = anchor(w, 1.8, 'gate', { on: 'plot', street: true, jitter: 1.5 }) || anchor(w, 1.8, 'side', { on: 'plot', jitter: 1.5 }); if (!V) return null; put(V, type, 0, 0, Math.PI / 2, { load: live(0.3 + life * 0.4) }); return V; },
    // tie-up: rail and trough on the front wall, an animal tied when it's lively
    tie: (animals = ['burro']) => { const V = anchor(3.6, 1.6, 'gate', { on: 'plot', street: true, jitter: 1.5 }) || anchor(3.6, 1.6, 'front', { on: 'plot', jitter: 1.5 }); if (!V) return null; put(V, 'hitching_rail', 0, -0.4, 0); if (chance(0.6)) put(V, 'trough', 0, 0.4, 0, { length: 2.4 }); if (live(0.3 + life * 0.6)) put(V, lrng.pick(animals), lrng.range(-1, 1), 1.4, lrng.range(-0.4, 0.4)); return V; },
    // a pen in a back corner, fenced on the sides that aren't plot wall
    pen: (animal, n, w, d, fence) => { if (!room(w, d)) return null; const V = anchor(w, d, 'backFar', { on: 'plot', corner: true, jitter: 2, pad: 0.4 }) || anchor(w, d, 'back', { on: 'plot', jitter: 2, pad: 0.4 }); if (!V) return null; fenceRect(V, w, d, fence); for (let k = 0; k < n; k++) put(V, animal, rng.range(-w / 3, w / 3), rng.range(-d / 3, d / 3), rng.next() * 6.28); return V; },
    // fenced kitchen garden against the back wall
    garden: (share) => {
      const target = A * share * (0.7 + density * 0.6), d0 = Math.max(2.4, Math.min(7, Math.sqrt(target / 1.8))), w0 = Math.max(3, Math.min(14, target / d0));
      for (const k of [1, 0.8, 0.62, 0.48]) {
        const w = w0 * k, d = d0 * Math.sqrt(k); if (w * d < 6) break;
        const V = anchor(w + 0.4, d + 0.4, household === 'farmer' || household === 'rancher' ? 'backFar' : 'back', { on: 'plot', jitter: 2, pad: 0.5 });
        if (!V) continue;
        spent -= (w + 0.4) * (d + 0.4) * 0.5; // a garden is open ground in its own way
        const cs = fenceRect(V, w, d, stickFence);
        out.fields.push(tag({ type: 'garden', poly: cs.map((q) => W(q[0], q[1])), crop: pick(household === 'farmer' ? { mixed: 3, corn: 2, beans: 1.5, chili: 1, squash: 1 } : { mixed: 4, chili: 1, beans: 1, squash: 0.6, nopal: 0.4 }) }));
        return V;
      }
      return null;
    },
    outhouse: () => { const s2 = shed('outhouse', [1.4, 1.4], 'backCorner'); if (s2) spent += 2; return s2; },
    well: () => { const V = anchor(2.6, 2.6, 'back', { on: 'any', jitter: 2, gap: 0.8 }); if (!V) return null; put(V, 'well', 0, 0, 0, { variant: rich ? 'town' : 'rural' }); return V; },
    // a work shade with the trade's things under it and its stock along the wall behind
    workshade: (pref, fill) => {
      if (!room(4, 3.4)) return null;
      const V = anchor(4, 3.2, pref, { on: 'any', jitter: 1.2, gap: 0.2 }) || free(4, 3.2, pref, { pad: 0.3, rot: 0 }); if (!V) return null;
      V.r ??= 0; put(V, rich || chance(0.5) ? 'ramada' : 'shade_cloth', 0, 0, 0, { width: 4, depth: 3.2 }); fill(V); return V;
    },
  };
  const home = (o2 = {}) => { // what every lived-in plot has, before its trade
    VG.water(); if (o2.laundry !== false) VG.laundry();
    VG.pots(o2.pots ?? (rich ? 3 : 2));
    if (size >= 1 && wealth <= 1 && o2.outhouse !== false) VG.outhouse();
    if (o2.dog !== false) L8(() => { if (live(0.25 + life * 0.6)) { const V = anchor(1, 0.7, 'door', { on: 'house', jitter: 2, gap: 0.6, pad: 0 }); if (V) put(V, 'dog', 0, 0, lrng.next() * 6.28); } });
    if (chance(0.2)) VG.shrine();
  };
  const greenery = (k = 1) => { // trees in corners, one by the house, a cactus corner, scrub on the edges (by size and density)
    const nT = Math.round((size === 0 ? 0 : size === 1 ? 1 : size === 2 ? 2 : 3) * (0.5 + density * 0.7) * k);
    trees(nT, 'corner'); if (size >= 1 && chance(0.6)) tree('house');
    if (size >= 1 && chance(0.5)) cactusCorner();
    { // a lone cardón: left standing when the lot was cleared, or planted — tall, in a corner or by the wall, often in the front
      const B = spec.biome || '', p = /desert/.test(B) ? 0.35 : B === 'coastal_valley' || B === 'valley' ? 0.12 : 0.2;
      if (size >= 1 && chance(p)) { const s2 = spot(2.2, 2.2, rng.chance(0.55) ? 'frontCorner' : 'corner', { pad: 0.4, jitter: 2 }); if (s2) out.plants.push(tag({ species: 'cardon', at: W(s2.u, s2.v), rot: rng.int(0, 359), scale: +rng.range(0.9, 1.35).toFixed(2) })); }
    }
    if (size >= 2) scrub(Math.round((2 + size) * (0.5 + density)));
  };
  const opt = (p) => chance(p * (0.55 + density * 0.9)); // optional vignettes get rarer as density drops

  if (household === 'wealthy') {
    // walled and gated; the front is for show (paving, a tree in a raised ring, a bench, the fountain); water shown
    // off; a shaded patio with the long table; a green garden; the service yard behind a low wall at the back;
    // animals and the truck away from the house. Ordered, with more open paving than any other yard.
    budget = yardArea * (0.16 + 0.22 * density);
    // gate piers with lamps, just inside
    // (only on a walled street front, as the gate's own pillars on the wall line, never out in the yard by the door)
    if (streetFenced) for (const sd of [-1, 1]) { const gw = pl.gates?.[0]?.width || 2.6, V = { u: gate[0] + sd * (gw / 2 + 0.4), v: gate[1] - 0.3, r: 0 }; if (Math.hypot(V.u - door[0], V.v - door[1]) > 2.5 && fits(V.u, V.v, 0.7, 0.7, 0)) { markRect(V.u, V.v, 0.7, 0.7, 0, 1, 0.1); put(V, 'pier_lamp', 0, 0, 0, { electric: rich && chance(0.5) }); } }
    // the forecourt: paving from the door toward the gate
    if (st) { const fd = Math.min(4.5, gate[1] - door[1] - 1.2), fw = Math.min(7, Math.max(3.5, hW * 0.7)); if (fd >= 2) { const V = { u: door[0], v: door[1] + 0.3 + fd / 2, r: 0 }; markRect(V.u, V.v, fw, fd, 0, 2); put(V, 'patio_slab', 0, 0, 0, { width: +fw.toFixed(1), depth: +fd.toFixed(1), kind: 'stone' }); } }
    // a shade tree in a raised ring at the front, a bench by it; the fountain where there is room
    { const V = free(2.2, 2.2, 'front', { pad: 0.6, jitter: 3 }); if (V) { V.r = 0; put(V, 'tree_ring', 0, 0, 0); out.plants.push(tag({ species: pick({ pepper_tree: 3, fruit_tree: 2, mesquite: 1, fan_palm: 1 }), at: W(V.u, V.v), rot: rng.int(0, 359) })); const B = anchor(1.8, 0.8, (u, v) => near(u, v, [V.u, V.v]) + (zone(u, v) === 'front' ? 0 : 10), { on: 'any', jitter: 1 }); if (B) put(B, 'iron_bench', 0, 0, 0); } }
    if (size >= 3 && houseArea >= 140 && chance(0.25)) { const V = free(3.0, 3.0, (u, v) => (zone(u, v) === 'front' ? 0 : 20) + Math.abs(near(u, v, door) - 5), { pad: 0.8, jitter: 1.5, rot: 0 }); if (V) put(V, 'fountain', 0, 0, 0, { radius: size >= 2 ? 1.3 : 1.0 }); }
    VG.pots(4);
    { const V = anchor(0.9, 0.9, 'door', { on: 'house', jitter: 1.5, gap: 0.25 }); if (V) put(V, 'citrus_pot', 0, 0, 0); }
    // the shaded patio: paving, a pergola over it, the long table, a swing seat or hammock, the grill
    { const w = size >= 2 ? 6 : 4.8, d = size >= 2 ? 4.4 : 3.8; const V = anchor(w, d, size >= 1 ? 'side' : 'backHouse', { on: 'house', jitter: 1.5, gap: 0.4 }) || anchor(w, d, 'backHouse', { on: 'house', jitter: 1.5, gap: 0.4 }) || free(w, d, 'side', { pad: 0.4, rot: 0 }); if (V) V.r ??= 0;
      if (V) { put(V, 'patio_slab', 0, 0, 0, { width: w, depth: d, kind: 'tile' }); put(V, 'pergola', 0, 0, 0, { width: w - 0.4, depth: d - 0.4 }); put(V, 'dining_table', 0, 0.2, 0, { length: size >= 2 ? 3.2 : 2.4 }); if (live(0.4 + life * 0.5)) put(V, lrng.chance(0.5) ? 'swing_chair' : 'hammock', 0, -d / 2 + 0.9, 0); put(V, 'citrus_pot', w / 2 - 0.5, d / 2 - 0.5, 0); }
      const G = anchor(1.6, 1.0, (u, v) => (V ? near(u, v, [V.u, V.v]) : 0) + (zone(u, v) === 'front' ? 20 : 0), { on: 'any', jitter: 1 }); if (G) put(G, 'grill', 0, 0, 0); }
    // a green garden: edged beds along the plot wall, irrigated
    for (let k = 0; k < 1 + Math.min(2, size); k++) { const V = anchor(3.2, 1.4, k ? 'back' : 'side', { on: 'plot', jitter: 2 }); if (V) put(V, 'garden_bed', 0, 0, 0, { width: 3, depth: 1.2 }); }
    // water: a cistern with a pump against the house
    if (size >= 1) { const V = anchor(1.8, 1.8, (u, v) => (zone(u, v) === 'front' ? 100 : 0) + PREF.backHouse(u, v), { on: 'house', jitter: 2, gap: 0.4 }); if (V) { put(V, 'cistern', 0, 0, 0, { radius: 0.75, height: 1.3 }); put(V, 'hand_pump', 1.0, 0.5, 0); } else VG.water(); } else VG.water();
    // the service yard: a low wall round a back corner, the oven, the washing, the generator, a store shed
    if (size >= 2) {
      const sw = Math.min(9, 5 + size), sdp = Math.min(7, 4 + size);
      const V = anchor(sw, sdp, 'backCorner', { on: 'plot', corner: true, jitter: 2, pad: 0.5 }) || anchor(sw, sdp, 'back', { on: 'plot', jitter: 2, pad: 0.5 });
      if (V) {
        fenceRect(V, sw, sdp, 'stone_low');
        put(V, 'horno', -sw / 2 + 1.5, -sdp / 2 + 1.2, 0); put(V, 'generator_shed', sw / 2 - 1.4, -sdp / 2 + 1.0, 0); put(V, 'pila', 0, -sdp / 2 + 0.8, 0);
        out.props.push(tag({ type: 'laundry_line', at: W(...at(V, 0, 0.4)), rot: Math.round(F.deg + (V.r * 180) / Math.PI), length: +(sw - 1.2).toFixed(1), posts: true, hang: +Math.min(1, life * 1.4).toFixed(2) }));
        if (chance(0.7)) put(V, 'woodpile', -sw / 2 + 1.3, sdp / 2 - 0.8, 0);
      }
      const s2 = shed('shed', [4, 3.2], 'back'); if (s2) spent += 12;
    } else { VG.laundry(); { const V = anchor(2, 1.6, 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'generator_shed', 0, 0, 0); } }
    // animals and vehicles: a small stable at the back, the pickup (or the wagon) under cover by the drive
    if (size >= 2 && pl.zcat !== 'wealthy') { const V = anchor(5.4, 3.2, 'backFar', { on: 'plot', jitter: 2, pad: 0.5 }); if (V) { put(V, 'stable', 0, 0, 0); if (live(0.4 + life * 0.5)) put(V, lrng.chance(0.5) ? 'burro' : 'brahmin', -1.2, 0.6, 0.2); } }
    if (pl.zcat !== 'wealthy') { const V = anchor(3.4, 5.6, (u, v) => near(u, v, gate) + (zone(u, v) === 'front' ? 0 : 6), { on: 'any', jitter: 1.5, pad: 0.4 }) || anchor(3.4, 5.6, 'side', { on: 'any', jitter: 1.5, pad: 0.4 }); // (the good side of town keeps its car in a garage on the street)
      if (V) { put(V, 'ramada', 0, 0, 0, { width: 3.2, depth: 5.4, roof: 'corrugated' }); put(V, rich && chance(0.6) ? 'pickup' : 'wagon', 0, 0, Math.PI, { cover: true }); } }
    if (life > 0.3) L8(() => { if (live(0.5 + life * 0.4)) { const V = anchor(1, 0.7, 'gate', { on: 'plot', street: true, jitter: 2, gap: 0.6, pad: 0 }); if (V) put(V, 'dog', 0, 0, lrng.next() * 6.28); } });
    trees(Math.max(1, size), 'corner');
    if (size >= 2) for (let k = 0; k < 2; k++) plant(pick({ fan_palm: 2, date_palm: 1 }), 'edge', 1.4, { pad: 0.6 });
  } else if (household === 'family' || household === 'farmer') {
    const farmer = household === 'farmer';
    home();
    if (size >= 1) VG.patio();
    if (size >= 1 || farmer) VG.garden(farmer ? rng.range(0.22, 0.3) : rng.range(0.12, 0.18));
    if (size >= 2 || (poor && size >= 1)) VG.kitchen();
    if (size >= 1 && opt(0.6)) VG.coop();
    if (opt(0.5)) VG.woodpile();
    if (size >= 1 && opt(0.4)) VG.cart();
    if ((rich && size >= 2) || (farmer && size >= 2 && opt(0.5))) VG.well();
    if (size >= 2 && poor && opt(0.5)) VG.junk();
    if (farmer) {
      VG.stack(['haystack'], 1, 'backFar');
      if (size >= 2) VG.pen('goat', rng.int(2, 4), 4.5, 4, rng.chance(0.5) ? 'rail' : 'pole');
      if (size >= 3 && opt(0.5)) VG.pen('pig', rng.int(1, 2), 3.2, 2.6, 'stone_low');
      VG.tie(['burro', 'brahmin']);
      if (size >= 3 && opt(0.4)) { const V = anchor(3.2, 3.2, 'backHouse', { on: 'any', jitter: 2 }); if (V) put(V, rng.chance(0.5) ? 'water_tank' : 'windmill', 0, 0); }
    } else if (size >= 3 && opt(0.3)) VG.pen(rng.chance(0.6) ? 'goat' : 'pig', rng.int(1, 3), 3.6, 3, rng.chance(0.5) ? 'pole' : 'stone_low');
    if (size >= 1) L8(() => { if (live(life * 0.5)) { const V = anchor(1, 1, 'front', { on: 'house', jitter: 3, gap: 1.2 }); if (V) put(V, lrng.chance(0.5) ? 'toys' : 'tire_swing', 0, 0, lrng.next() * 6); } });
    greenery();
  } else if (household === 'shopkeeper') {
    // the shop keeps the street; the family lives behind it. With room behind: a second row against the back wall —
    // their house, a storeroom, a shack (a relative, a lodger), a small workshop — round a back patio. On a
    // shallow plot (or now and then anyway): a wing built onto the back of the shop instead.
    const minV = Math.min(...vs), backD = hBack - minV, q4 = (x) => Math.round(x * 4) / 4;
    const mat = (kind) => kind === 'shack' ? pick({ metal: 2, timber: 1.5 }) : kind === 'shed' ? pick({ block: 2, timber: 1, adobe: 1 })
      : st?.origin === 'new' && st.material ? st.material : pick({ adobe: 3, block: 2, plaster: 1.5 });
    const mk = (kind, w, d, V, extra = {}) => {
      const st2 = tag({ id: `${pl.id}-y${out.structures.length}-${opts.v || 0}`, kind, size: [q4(w), q4(d)], at: W(V.u, V.v), rot: Math.round((F.deg + (V.r * 180) / Math.PI) * 10) / 10, origin: 'new', material: mat(kind), floors: 1, snap: false, ...extra });
      if (kind === 'shed' || kind === 'shack') st2.roof = 'shed';
      out.structures.push(st2); return st2;
    };
    const backPref = (u, v) => (zone(u, v) === 'back' ? 0 : 40) + (v - minV) * 0.6;
    let built = 0;
    const wing = backD >= 4.5 && (backD < 10 || F.w < 9 || chance(0.3));
    if (st && wing) { // a wing on the back of the shop, narrower than it, same build
      const w = Math.max(3.5, Math.min(hW - 0.6, hW * rng.range(0.5, 0.85))), d = Math.max(3.2, Math.min(5.5, backD - 2.6));
      const V = anchor(w, d, (u, v) => (zone(u, v) === 'back' ? 0 : 60) + Math.abs(u - H.u) * 0.15, { on: 'house', gap: 0.35, pad: 0.4, jitter: 0.8 });
      if (V) { V.u -= V.sg.n[0] * 0.33; V.v -= V.sg.n[1] * 0.33; /* butt it up against the shop's back wall */ mk(rng.weighted({ house: 3, shed: 1.2 }), w, d, V, { origin: st.origin || 'new', material: st.material, ...(st.roof ? { roof: st.roof } : {}), ...(st.roofMat ? { roofMat: st.roofMat } : {}) }); built++; }
    }
    if (!built && backD >= 9) { // the second row, against the back wall, door toward the shop
      const room2 = Math.min(6.5, backD - 4.2), kinds = [rng.weighted({ house: 3, shed: 1.2, shack: 0.8 })];
      if (F.w >= 14 && room2 >= 4) kinds.push(rng.weighted({ shed: 2, shack: 1.2, workshop: st?.kind === 'trade' ? 1.5 : 0.5, house: 0.6 }));
      for (const kind of kinds) {
        const W2 = { house: [rng.range(6, 8.5), rng.range(4.5, 6)], shed: [rng.range(4, 6), rng.range(3.4, 4.6)], shack: [rng.range(3.2, 4.4), rng.range(3, 3.8)], workshop: [rng.range(5, 7), rng.range(4.2, 5.5)] }[kind];
        const w = Math.min(W2[0], F.w - 2), d = Math.min(W2[1], room2); if (w < 3 || d < 3) continue;
        const V = anchor(w, d, backPref, { on: 'plot', pad: 0.8, jitter: 2, gap: 0.3 });
        if (V) { mk(kind, w, d, V); built++; }
      }
    }
    // the back patio between them: the pila and washing, a shade, the shop's stock, gas, a cart
    VG.water(); VG.laundry();
    if (built && size >= 1 && opt(0.6)) VG.patio('back');
    VG.stack(['crates', 'sacks', 'barrel', 'crates'], rng.int(2, 4), 'back');
    if (size >= 1 && opt(0.4)) VG.cart('cart');
    VG.pots(2);
    if (!built && size >= 1 && wealth <= 1) VG.outhouse();
    L8(() => { if (live(0.2 + life * 0.5)) { const V = anchor(1, 0.7, 'backHouse', { on: 'house', jitter: 2, gap: 0.6, pad: 0 }); if (V) put(V, 'dog', 0, 0, lrng.next() * 6.28); } });
    greenery(0.5);
  } else if (household === 'trader') {
    // the shop owns the front: a stall by the gate, stock out back in rows, a store shed, the cart
    { const V = anchor(3.2, 2.2, 'gate', { on: 'plot', street: true, jitter: 1 }) || anchor(3.2, 2.2, 'front', { jitter: 1 }); if (V) { put(V, rng.chance(0.5) ? 'stall' : 'tarp_stall', 0, 0, Math.PI); if (live(life)) put(V, 'crates', 1.9, 0.2); } }
    if (size >= 1) VG.tie(['burro', 'brahmin']);
    if (size >= 1) { const s2 = shed('shed', size >= 2 ? [4.6, 3.6] : [3.4, 2.8], 'back'); if (s2) spent += 12; }
    VG.stack(['crates', 'sacks', 'barrel', 'barrel_rack'], rng.int(3, 4) + Math.min(2, size), 'back');
    if (size >= 2) VG.stack(['crates', 'sacks', 'goods'], rng.int(2, 4), 'side');
    if (size >= 2) VG.cart('wagon');
    VG.water(); VG.pots(2);
    if (wealth <= 1) VG.outhouse();
    if (size >= 2 && opt(0.15)) VG.garden(0.06);
    greenery(0.7);
  } else if (household === 'mechanic') {
    VG.workshade('front', (V) => { put(V, 'workbench', 0, -1.1, 0); put(V, 'engine_block', 1.1, 0.4, rng.next() * 6); if (live(life)) put(V, 'tires', -1.2, 0.5, lrng.next() * 6); });
    for (let k = 0; k < (size >= 2 ? 2 : 1); k++) { const V = anchor(2.4, 4.8, k ? 'back' : 'side', { on: 'plot', jitter: 2 }); if (V) put(V, rng.chance(0.7) ? 'car_wreck' : 'truck_chassis', 0, 0, rng.chance(0.5) ? 0 : Math.PI); }
    VG.stack(['tires', 'barrel', 'tires'], rng.int(2, 4), 'side');
    { const V = anchor(1.6, 1.1, 'house', { on: 'house', jitter: 2 }); if (V) put(V, 'generator', 0, 0); }
    VG.junk(); L8(() => { if (live(0.4 + life * 0.5)) { const V = anchor(1, 0.7, 'door', { on: 'house', jitter: 2, gap: 0.6, pad: 0 }); if (V) put(V, 'dog', 0, 0, lrng.next() * 6); } });
    if (wealth <= 1) VG.outhouse();
    greenery(0.5);
  } else if (household === 'craftsman') {
    const craft = opts.craft && opts.craft !== 'auto' ? opts.craft : pl.craft && pl.craft !== 'auto' ? pl.craft : pl.yardCraft || rng.weighted({ carpenter: 3, potter: 2.5, tanner: 1.5, weaver: 2 });
    out.craft = craft;
    if (out.structure) out.structure.signText = rng.pick({ carpenter: ['CARPINTERÍA', 'MUEBLES', 'CARPINTERÍA {N}'], potter: ['ALFARERÍA', 'BARRO', 'OLLAS Y CAZUELAS'], tanner: ['TALABARTERÍA', 'SILLAS DE MONTAR', 'CUEROS'], weaver: ['TEJIDOS', 'TELARES', 'COBIJAS Y SARAPES'] }[craft]).replace('{N}', rng.pick(['DON CHUY', 'LOS COMPAS', 'EL GÜERO', 'LA FE']));
    const ws = size >= 1 ? 'front' : 'side';
    if (craft === 'carpenter') {
      VG.workshade(ws, (V) => { put(V, 'sawhorse', 0, 0.3, 0); put(V, 'workbench', 0, -1.15, 0); });
      VG.stack(['lumber'], size >= 2 ? 2 : 1, 'side'); VG.woodpile('back');
      if (size >= 1) { const V = anchor(2.4, 1.6, 'gate', { on: 'plot', street: true, jitter: 1 }); if (V) { put(V, 'table', 0, 0, 0, { chairs: 0 }); put(V, 'chair', -1, 0.2, 0.3); put(V, 'chair', 1, 0.2, -0.3); } } // pieces for sale
    } else if (craft === 'potter') {
      VG.workshade(ws, (V) => { put(V, 'potters_wheel', 0, 0, 0); });
      { const V = anchor(3, 2.1, 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'kiln', 0, 0, 0); }
      VG.stack(['pottery_rack'], size >= 1 ? 2 : 1, 'side');
      { const V = anchor(2.2, 1.2, 'gate', { on: 'plot', street: true, jitter: 1 }); if (V) { put(V, 'ollas', -0.5, 0); put(V, 'ollas', 0.6, 0.1); } } // for sale by the gate
      if (size >= 2) { const V = anchor(4.6, 3.8, 'backFar', { on: 'plot', corner: true, jitter: 2 }); if (V) put(V, 'mud_pit', 0, 0); }
      VG.woodpile('back');
    } else if (craft === 'tanner') {
      VG.workshade(ws, (V) => { put(V, 'saddle_rack', 0, 0, 0); });
      { const V = anchor(4.6, 2, size >= 2 ? 'backFar' : 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'tan_pit', 0, 0, 0); } // the smell goes to the back
      VG.stack(['hide_frame'], size >= 1 ? rng.int(2, 3) : 1, 'back');
      if (size >= 2) { const V = anchor(2.6, 1.4, 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'meat_rack', 0, 0); }
      if (size >= 1) VG.tie(['brahmin', 'burro']);
    } else { // weaver
      VG.workshade(ws, (V) => { put(V, 'loom', 0, 0, 0); if (live(life)) put(V, 'chair', 1.4, 0.6, 2.8); });
      { const V = anchor(3.8, 1.2, 'side', { on: 'plot', jitter: 2 }); if (V) put(V, 'yarn_line', 0, 0, 0); }
      VG.stack(['sacks'], 2, 'back');
      if (size >= 1) { const V = anchor(1.6, 1.4, 'gate', { on: 'plot', street: true, jitter: 1 }); if (V) put(V, 'goods', 0, 0, 0, { goods: 'cloth' }); }
      if (size >= 2 && opt(0.5)) VG.pen('goat', rng.int(2, 3), 4, 3.6, rng.chance(0.5) ? 'pole' : 'ocotillo');
    }
    home({ pots: 1 });
    greenery(0.6);
  } else if (household === 'rancher') {
    // a big rail corral against the back wall with brahmin and a trough; hay, pack saddles, branding fire, burros
    let cw = Math.min(14, 6 + size * 2.5), cd = Math.min(11, 5 + size * 2), cor = null;
    const cf = rng.chance(0.7) ? 'rail' : 'pole';
    for (const k of [1, 0.85, 0.7, 0.58, 0.48]) { budget += cw * k * cd * k; if ((cor = VG.pen('brahmin', Math.max(1, Math.round((rng.int(2, 3) + size) * k * k)), cw * k, cd * k, cf))) { cw *= k; cd *= k; break; } budget -= cw * k * cd * k; }
    if (cor) { put(cor, 'trough', 0, cd / 2 - 1.2, 0); put(cor, 'haystack', -cw / 2 + 1.8, -cd / 2 + 1.8, 0); if (live(life) && size >= 1) put(cor, 'firepit', cw / 2 + 1.4, cd / 2 - 1, 0); }
    VG.stack(['haystack'], 1, 'back');
    { const V = anchor(3.2, 1.9, 'side', { on: 'house', jitter: 2 }); if (V) put(V, 'saddle_rack', 0, 0, 0); }
    VG.tie(['burro', 'brahmin']);
    { const V = anchor(3.2, 3.2, 'backHouse', { on: 'any', jitter: 2 }); if (V) put(V, rng.chance(0.5) ? 'water_tank' : 'windmill', 0, 0); }
    VG.woodpile();
    if (size >= 2) VG.cart('wagon');
    if (size >= 1) VG.patio();
    home({ pots: 1 });
    greenery(0.6);
  } else if (household === 'fisher') {
    { const V = anchor(2.3, 6.8, 'side', { on: 'plot', jitter: 2 }) || anchor(2.3, 6.8, 'back', { jitter: 2 }); if (V) put(V, 'panga', 0, 0, rng.chance(0.5) ? 0 : Math.PI, { upturned: rng.chance(0.6) }); }
    { const V = anchor(4.4, 1.2, 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'net_rack', 0, 0, 0); }
    if (size >= 1) { const V = anchor(3.2, 1.0, 'side', { on: 'any', jitter: 2 }); if (V) put(V, 'fish_rack', 0, 0, 0); }
    { const V = anchor(2.6, 1.0, 'house', { on: 'house', jitter: 2 }); if (V) put(V, 'crab_traps', 0, 0, 0); }
    VG.stack(['barrel', 'sacks', 'crates'], rng.int(1, 3), 'side');
    if (size >= 1) VG.kitchen();
    if (size >= 1) VG.patio();
    home();
    greenery(0.6);
  } else if (household === 'salvager') {
    VG.stack(['sort_bins'], 1, 'side'); if (size >= 2) VG.stack(['sort_bins'], 1, 'back');
    { const V = anchor(3.4, 1.7, 'backCorner', { on: 'plot', corner: true, jitter: 2 }); if (V) put(V, 'scrap_heap', 0, 0, 0); }
    if (size >= 1) VG.junk();
    { const V = anchor(1.8, 1.6, 'gate', { on: 'plot', street: true, jitter: 1 }); if (V) put(V, 'scale', 0, 0, 0); }
    VG.cart('cart');
    VG.stack(['sacks', 'tires', 'crates', 'barrel'], rng.int(2, 4), 'back');
    if (size >= 2 && opt(0.5)) { const V = anchor(2.4, 4.8, 'back', { on: 'plot', jitter: 2 }); if (V) put(V, 'car_wreck', 0, 0, 0); }
    if (size >= 1 && opt(0.4)) VG.coop();
    home({ pots: 1 });
    greenery(0.5);
  } else if (household === 'innkeeper') {
    VG.tie(['brahmin', 'burro']); if (size >= 2) VG.tie(['brahmin', 'burro']);
    if (size >= 1) { const V = anchor(3.4, 2.6, 'back', { on: 'plot', jitter: 2 }); if (V) { put(V, 'lean_to', 0, 0, 0); put(V, 'haystack', 0, -0.2, 0); if (live(life)) put(V, 'burro', 0.9, 0.9, lrng.next()); } } // stabling
    VG.patio(size >= 2 ? 'side' : 'front');
    if (size >= 2 && opt(0.7)) VG.patio('front');
    VG.laundry(); VG.kitchen(); if (size >= 2 && opt(0.5)) { const V = anchor(2.8, 2, 'back', { on: 'house', jitter: 2 }); if (V) put(V, 'horno', 0, 0, 0); }
    VG.outhouse(); if (size >= 1) VG.outhouse();
    { const V = anchor(2.6, 2.6, 'backHouse', { on: 'any', jitter: 2 }); if (V) put(V, 'water_tank', 0, 0); }
    VG.woodpile(); VG.pots(rng.int(3, 5));
    greenery();
  } else if (household === 'aguador') {
    if (size >= 1) { const V = anchor(2.0, 2.0, 'back', { on: 'any', jitter: 2, gap: 0.3 }); if (V) put(V, 'cistern', 0, 0, 0, { radius: 0.85, height: 1.4 }); }
    if (rich || opt(0.4)) VG.well();
    { const V = anchor(2.2, 3.8, 'gate', { on: 'plot', street: true, jitter: 1 }) || anchor(2.2, 3.8, 'front', { jitter: 1 }); if (V) { put(V, 'water_cart', 0, 0, Math.PI / 2); if (live(0.4 + life * 0.5)) put(V, 'burro', 0, 1.6, Math.PI / 2); } }
    VG.stack(['barrel', 'barrel', 'water_jugs', 'rain_barrel'], rng.int(3, 4) + Math.min(2, size), 'side');
    VG.tie(['burro']);
    home({ laundry: chance(0.5) });
    greenery(0.6);
  } else if (household === 'curandero') {
    { const V = anchor(1.8, 1.2, size >= 1 ? 'side' : 'house', { on: 'house', jitter: 1.5, gap: 0.2 }); if (V) put(V, 'altar', 0, 0, 0); }
    for (let k = 0; k < 1 + Math.min(2, size); k++) { const V = anchor(2.9, 1.3, k ? 'back' : 'side', { on: 'plot', jitter: 2 }); if (V) put(V, 'herb_bed', 0, 0, 0); }
    VG.stack(['drying_rack'], size >= 2 ? 2 : 1, 'side');
    { const V = anchor(1.8, 0.8, 'gate', { on: 'plot', street: true, jitter: 1 }); if (V) put(V, 'bench', 0, 0, 0); } // those who wait sit by the gate
    if (size >= 2 && opt(0.45)) { const V = anchor(3.2, 4.8, 'backFar', { on: 'plot', jitter: 2 }); if (V) put(V, 'temazcal', 0, 0, 0); }
    if (size >= 1 && opt(0.6)) VG.coop(); // eggs for limpias
    if (size >= 1) L8(() => { if (live(life)) { const V = anchor(1.8, 1.8, 'backHouse', { on: 'house', jitter: 2, gap: 0.8 }); if (V) put(V, 'firepit', 0, 0, 0); } });
    { const V = anchor(2.2, 0.6, 'door', { on: 'house', jitter: 1.5, gap: 0.15, pad: 0.1 }); if (V) for (let k = 0; k < 4; k++) put(V, 'pot_plant', (k - 1.5) * 0.5, 0, 0, { count: 1, kind: rng.pick(['aloe', 'herb', 'herb', 'marigold']) }); }
    home({ pots: 0 });
    greenery(0.7);
  } else if (household === 'foodseller') {
    // the stand out on the street front, its back to the yard; a table set or two by it; the cooler by the house
    const lay = rng.weighted({ taqueria: 3, tortas: 1.5, fritanga: 1.5, bar: 1.2, trailer: 0.5 }), [sw, sd] = standSize({ layout: lay });
    const s2 = spot(sw + 1.0, sd + 2.6, (u, v) => (zone(u, v) === 'front' ? 0 : 60) - v * 2 + Math.abs(u - gate[0]) * 0.1, { rot: 0, pad: 0.4, jitter: 1.5 });
    if (s2) out.structures.push(tag({ id: `${pl.id}-y${out.structures.length}-${opts.v || 0}`, kind: 'stand', layout: lay, size: [sw, sd], at: W(s2.u, s2.v - 0.8), rot: Math.round(F.deg), origin: lay === 'trailer' ? 'prewar' : 'new', snap: false }));
    { const V = anchor(0.9, 0.6, 'house', { on: 'house', jitter: 2 }); if (V) put(V, 'cooler', 0, 0, 0); }
    VG.stack(['crates', 'water_jugs', 'sacks'], rng.int(1, 3), 'back');
    if (size >= 1) VG.kitchen();
    home({ pots: 1 });
    greenery(0.6);
  } else if (household === 'military') {
    prop('watchtower', 'frontCorner', { pad: 0.6 }); if (size >= 2) prop('watchtower', 'backCorner', { pad: 0.6 });
    prop('sandbags', 'gate', { pad: 0.2, face: 0 }); prop('barrier', 'gate', { pad: 0.2, path: false, face: 0 });
    prop('generator', 'house', { pad: 0.3 }); prop('water_tower', 'back', { pad: 0.6 });
    for (let k = 0; k < (size >= 2 ? rng.int(2, 3) : 1); k++) prop('tent_wall', 'side', { pad: 0.5 });
    for (let k = 0; k < rng.int(2, 4); k++) prop(rng.pick(['crates', 'barrel', 'sandbags']), 'house', { pad: 0.1 });
    if (size >= 2) prop(rng.chance(0.5) ? 'radio_mast' : 'spotlight_tower', 'backCorner', { pad: 0.4 });
    if (size >= 2) prop('truck_chassis', 'side', { pad: 0.4 });
    prop('wire_coil', 'edge', { pad: 0.2 });
  }

  for (const fn of later) fn(); // the late life pass
  // worn footpaths from the back door side to the outhouse / pila / garden gap
  const backDoor = [H.u, hBack - 0.3];
  for (const p of [...out.structures.filter((s) => s.kind === 'outhouse').map((s) => s.at), ...out.props.filter((p) => ['pila', 'well', 'chicken_coop'].includes(p.type)).map((p) => p.at)].slice(0, 3)) {
    const q = L(p); out.paint.push(pathPaint([W(...(zone(q[0], q[1]) === 'front' ? doorOut : backDoor)), W(q[0], q[1])], 0.8, 0.45));
  }
  // outskirts farms: often no wall at all, or a light fence
  if (!pl.ground) out.ground = { cover: 'patio', surface: household === 'wealthy' || rich ? 'caliche' : 'packed' };
  return out;
}

function pathPaint(path, width, alpha = 0.55) {
  const G = SURFACES.packed.paint;
  return { path, width, color: G.color, edge: 0.6, alpha, layer: G.layer, layerK: 1, bake: 'yard' };
}

// apply a plan to the spec (editor state): removes the plot's untouched yard items first
export function clearYard(spec, pl, keepTouched = true) {
  const drop = (e) => e.inPlot === pl.id && e.bake === 'yard' && !(keepTouched && e.touched);
  for (const k of ['props', 'walls', 'structures', 'fields', 'paint']) if (spec[k]) spec[k] = spec[k].filter((e) => !drop(e));
  if (spec.vegetation?.plants) spec.vegetation.plants = spec.vegetation.plants.filter((e) => !drop(e));
}
export function applyYard(spec, pl, plan, uid) {
  if (!plan) return false;
  if (plan.structure) { plan.structure.id = uid('bld'); (spec.structures ||= []).push(plan.structure); pl.building = plan.structure.id; }
  if (plan.linkBuilding && !pl.building) pl.building = plan.linkBuilding; // the building that was already standing there
  for (const s of plan.structures) s.id = uid('bld');
  (spec.props ||= []).push(...plan.props.map((q) => ({ ...q, id: q.id || uid('prop') }))); // ids: generated props can be picked and moved
  (spec.structures ||= []).push(...plan.structures);
  (spec.walls ||= []).push(...plan.walls.map((w) => ({ ...w, id: uid('wall') })));
  (spec.fields ||= []).push(...plan.fields.map((f) => ({ ...f, id: uid('field') })));
  (spec.paint ||= []).push(...plan.paint.map((p) => ({ ...p, inPlot: pl.id })));
  spec.vegetation ||= {}; (spec.vegetation.plants ||= []).push(...plan.plants);
  if (plan.gate && !pl.gates?.length && !pl.bakedFence && !pl.gatesEdited) pl.gates = [plan.gate];
  if (plan.fence) pl.fence = plan.fence;
  if (plan.fenceH && pl.fenceH == null) pl.fenceH = plan.fenceH;
  if (plan.fenceGlass && pl.fenceGlass == null) pl.fenceGlass = true;
  if (plan.noFence && !pl.noFence) pl.noFence = plan.noFence;
  if (plan.ground) pl.ground = plan.ground;
  if (!pl.household || pl.household === 'auto') pl.yardHousehold = plan.household;
  if (plan.craft) pl.yardCraft = plan.craft;
  pl.yard = true;
  return true;
}

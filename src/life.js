// Signs of life, placed by the activity map (activity.js). Never loose: everything hangs off a door, a wall, a fence,
// a road edge or an alley wall.
//  - frontage: at each lived-in building's front (or outside its plot's street fence), a kind-specific set chosen by the
//    activity tier there (traces · lived-in · life · busy)
//  - roadside: on busy stretches, vendors at the road edge and parked carts / animals near busy places
//  - alleys: gaps of 1.2–5 m between two buildings (or a building and a wall) running ≥ 8 m, open at one end at least.
//    A 1.1 m walking lane stays clear down the middle; life goes up the walls and overhead; the neighbours decide the
//    kind (service / domestic / derelict); the mouth takes the street's activity, deeper in it fades
// Each anchor has its own random stream and its own owner key, so edits only redo what's near them.
// Items tagged 'day' are hidden between 21:30 and 06:30 (stands, tables, A-frames); fire barrels and lamps light at night.
import * as THREE from 'three';
import { RNG } from './rng.js';
import { plotFrame } from './plots.js';
import { pointInPoly } from './geo.js';
import { ATTRACT, DEAD } from './activity.js';

const COMMERCE = new Set(['shop', 'store', 'trade', 'cantina', 'cafe', 'stand', 'pemex', 'market', 'posada', 'motel', 'bodega', 'hermandad']);
const DAY = new Set(['elote_cart', 'raspados_cart', 'skewer_grill', 'water_seller', 'scrap_blanket', 'basket_table', 'bread_trike', 'umbrella_table', 'food_cart', 'agua_fresca', 'tarp_stall', 'cart_shop', 'produce_crates', 'cafe_table', 'domino_table', 'farm_stand', 'produce_pile']);
// by kind: [tier1 (lived-in), tier2 (life), tier3 (busy)] weighted pools
const SETS = {
  house: [{ chair: 3, pot_plant: 3, buckets: 2, water_jugs: 1.5, bicycle: 0.4, trash_heap: 2.6 }, { chair: 3, pot_plant: 2, buckets: 1.5, bicycle: 0.6, wheelbarrow: 0.8, rain_barrel: 1, dog: 0.7, trash_heap: 2.6 }, { chair: 3, chair_stack: 1, bicycle: 0.6, cafe_table: 1, dog: 1, wheelbarrow: 1, trash_heap: 2.6, handcart: 0.4, shopping_cart: 0.3 }],
  shop: [{ crates: 2, chair: 1.5 }, { produce_crates: 2, cooler: 1.2, chair: 1.5, crates: 1.5 }, { produce_crates: 3, cooler: 1.5, umbrella_table: 1, handcart: 0.6, pack_burro: 0.5, cargo_trike: 0.5, chair_stack: 1, bicycle: 0.4 }],
  cantina: [{ chair: 2, bottle_crates: 1.5 }, { chair: 3, bottle_crates: 2, cafe_table: 1.5 }, { umbrella_table: 2, cafe_table: 2, chair: 3, bottle_crates: 2, domino_table: 1 }],
  cafe: [{ chair: 2 }, { cafe_table: 2.5, chair: 2 }, { umbrella_table: 3, cafe_table: 2, chair_stack: 1 }],
  trade: [{ chair: 2, buckets: 1 }, { chair: 3, buckets: 1, bicycle: 0.4 }, { chair: 4, chair_stack: 1, wheelbarrow: 1, bicycle: 0.6 }], // tortillería: the line of chairs
  clinic: [{ bench: 2, water_jugs: 1 }, { bench: 2.5, chair: 2, water_jugs: 1.5 }, { bench: 3, chair: 3, water_jugs: 1.5, chair_stack: 1 }],
  chapel: [{ pot_plant: 2, bench_park: 1 }, { bench_park: 2, pot_plant: 2, nicho: 1 }, { bench_park: 2.5, pot_plant: 2, nicho: 1 }],
  garage: [{ tires: 2, barrel: 1.5 }, { tires: 2, barrel: 2, engine_block: 1, wheelbarrow: 1 }, { tires: 2.5, barrel: 2, engine_block: 1, wheelbarrow: 1 }],
  posada: [{ chair: 2, pot_plant: 1.5 }, { chair: 2.5, bench: 1.5, pot_plant: 1.5 }, { chair: 3, bench: 2, umbrella_table: 1, hitching_rail: 1 }],
  hall: [{ bench_park: 1.5 }, { bench_park: 2, chair: 1 }, { bench_park: 2, chair_stack: 1 }],
};
const KIND_SET = { store: 'shop', stand: 'shop', bodega: 'shop', pemex: 'garage', workshop: 'garage', mission: 'chapel', church: 'chapel', townhall: 'hall', comandancia: 'hall', office: 'hall', motel: 'posada', hermandad: 'posada' };
const RAD = { mystic_stall: 1.4, farm_cart: 1.5, brahmin_wagon: 2.6, hulk_wagon: 2.8, pack_burro: 1.1, handcart: 1.2, shopping_cart: 0.6, cargo_trike: 1.0, rebuilt_truck: 2.7, motorcycle: 1.0, caravan_trailer: 2.6, elote_cart: 1.1, raspados_cart: 1.1, skewer_grill: 1.4, water_seller: 1.6, scrap_blanket: 1.4, basket_table: 1.0, bread_trike: 1.0, nuka_shack: 1.5, umbrella_table: 1.3, cafe_table: 1.1, domino_table: 1.1, food_cart: 1.3, agua_fresca: 1.2, tarp_stall: 1.6, cart_shop: 1.4, wheelbarrow: 0.8, bench: 0.9, bench_park: 1.0, hitching_rail: 1.3, cart: 1.5, brahmin: 1.4, pickup: 2.6, bicycle: 0.45, engine_block: 0.7 };
// street vendors and parked vehicles (props9): by place
const VENDORS = { food_cart: 2, agua_fresca: 1.5, elote_cart: 1.5, raspados_cart: 1.2, skewer_grill: 1.2, basket_table: 1.3, scrap_blanket: 0.8, bread_trike: 0.8, tarp_stall: 1, cart_shop: 1, water_seller: 0.6, nuka_shack: 0.3, mystic_stall: 0.1 };
const HIGHWAY_VENDORS = { water_seller: 2, scrap_blanket: 1.5, skewer_grill: 1.5, agua_fresca: 1, nuka_shack: 0.6, food_cart: 1 };
const PARKED = (S, highway) => ({ farm_cart: 1.5, handcart: 1.3, pack_burro: 1.2, brahmin: 0.8, cargo_trike: 0.8, shopping_cart: 0.5, wheelbarrow: 0.5, bicycle: 0.3, brahmin_wagon: highway ? 1.2 : 0.5, hulk_wagon: highway ? 0.9 : 0.3,
  ...(['some', 'grid'].includes(S.power) && !['dead_broke', 'poor'].includes(S.wealth) ? { motorcycle: 0.1, rebuilt_truck: highway ? 0.08 : 0.03 } : {}), /* engines are rare and kept indoors */ caravan_trailer: highway ? 0.25 : 0 });
const ALONG = new Set(['cart', 'brahmin', 'farm_cart', 'handcart', 'pack_burro', 'cargo_trike', 'brahmin_wagon', 'hulk_wagon', 'motorcycle', 'rebuilt_truck', 'caravan_trailer', 'wagon', 'shopping_cart']);
const tierOf = (a) => (a < 0.2 ? 0 : a < 0.45 ? 1 : a < 0.7 ? 2 : 3);

export function placeLife(world, act, onlyKeys = null) {
  const S = world.spec.settlement || {};
  if (S.life === false || world.spec.activity === 0) return;
  // region mode (editor): only anchors inside the box are redone (their old items removed first)
  const region = onlyKeys, inR = (x, z) => !region || (x >= region[0] && x <= region[2] && z >= region[1] && z <= region[3]);
  const redone = new Set();
  const want = (k, x, z, any = null) => { if (!region) return true; if (any ? !any() : !inR(x, z)) return false; world.removeOwned(k); redone.add(k); return true; };
  if (region) { world.lifeItems = (world.lifeItems || []).filter((g) => g.parent); world.lifeTaken = (world.lifeTaken || []).filter(([x, z]) => !inR(x, z)); } else world.lifeTaken = [];
  world.lifeItems ||= [];
  // hug = the item stands against a wall / fence (whose blocker band it sits in): only its centre is tested
  const put = (key, rng, p, x, z, rad = 0.55, hug = false) => {
    const T = world.terrain;
    if (!T.inBounds(x, z, rad + 0.5) || world.hard.test(x, z, hug ? 0 : rad * 0.6) || world.roadNear(x, z, rad * 0.5 + 0.3)) return false;
    if (hug && (world.lifeTaken || []).some(([qx, qz, qr]) => Math.hypot(qx - x, qz - z) < qr + rad * 0.8)) return false;
    if ((world.propFoot || []).some((q) => Math.hypot(q.x - x, q.z - z) < q.r + rad * 0.75)) return false; // never on top of a prop already there (building dressing, yards, hand-placed)
    const n0 = world.group.children.length, f0 = (world.propFoot || []).length, l0 = world.lights.length, e0 = world.emitters.length;
    world.own(key, () => world.addProp({ keep: 'doors', ...p, at: [x, z] }, true));
    const g = world.group.children[n0];
    // addProp pushes things out of doorways: if it moved this one, it may now sit on something else — take it back
    if (g && Math.hypot(g.position.x - x, g.position.z - z) > 0.3) {
      world.group.remove(g); g.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
      world.propFoot.length = f0; world.lights.length = l0; world.emitters.length = e0;
      return false;
    }
    world.hard.circle(x, z, rad * 0.8); (world.lifeTaken ||= []).push([x, z, rad * 0.8]);
    if (g) { g.userData.life = DAY.has(p.type) ? 'day' : 'any'; world.lifeItems.push(g); }
    return true;
  };
  const pick = (rng, pool) => rng.weighted(pool);
  const live = (world.structures || []).filter((s) => s._masses?.length && !s._sub && !DEAD(s));
  // ---- frontage
  for (const s of live) {
    const key = `life:${s.id}`; if (!want(key, s.at[0], s.at[1])) continue;
    const it = world.items?.get(s.id), fd = it?.info?.frontDoor; if (!fd) continue;
    const R = (s.rot || 0) * Math.PI / 180, c = Math.cos(R), sn = Math.sin(R);
    const dx = s.at[0] + fd.x * c + fd.z * sn, dz = s.at[1] - fd.x * sn + fd.z * c;
    const nx = fd.nx * c + fd.nz * sn, nz = -fd.nx * sn + fd.nz * c, tx = nz, tz = -nx;
    const plot = (world.plots || []).find((pl) => pl.poly && pointInPoly(s.at[0], s.at[1], pl.poly));
    let a = world.activity ? world.activity.at(dx + nx * 2, dz + nz * 2) : 0.3;
    if (plot?.life != null) a *= 0.6 + plot.life * 0.8;
    const tier = tierOf(a), rng = new RNG(`${world.seed}:${key}`);
    if (tier === 0 && !rng.chance((s.kind === 'house' || !s.kind) ? 0.35 : 0.15)) continue;
    const FAM = { bench: 'seat', bench_park: 'seat', iron_bench: 'seat', notice_board: 'board', painted_sign: 'board', water_jugs: 'water', water_cart: 'water', rain_barrel: 'water', cafe_table: 'table', umbrella_table: 'table', domino_table: 'table' };
    const have = new Set((world.propFoot || []).filter((q) => q.o === s.id || Math.hypot(q.x - dx, q.z - dz) < 6).map((q) => FAM[q.type] || q.type));
    const rich = plot?.zcat === 'wealthy';
    const pool0 = rich ? (s.kind === 'house' ? { pot_plant: 3, topiary: 1.5, citrus_pot: 1, iron_bench: 0.8, bicycle: 0.25 } : { pot_plant: 2, topiary: 2, iron_bench: 1.2, citrus_pot: 1 }) : (SETS[s.kind] || SETS[KIND_SET[s.kind]] || SETS.house)[Math.max(0, tier - 1)];
    const pool = Object.fromEntries(Object.entries(pool0).filter(([t]) => !have.has(FAM[t] || t))); // the building's own dressing wins: life adds what's missing
    if (!Object.keys(pool).length) continue;
    const n = [1, rng.int(1, 2), rng.int(2, 4), rng.int(4, 7)][tier];
    // anchors: beside the door, along the front wall, toward the street (busy only). In a fenced plot: outside the street fence
    const m = s._masses[0], half = (Math.abs(tx * Math.sin(m.r) + tz * Math.cos(m.r)) > 0.7 ? m.d : m.w) / 2;
    let anchors = [];
    const wallAt = (u, off) => [dx + tx * u + nx * off, dz + tz * u + nz * off];
    const fenced = plot && plot.fence !== 'none' && plot.use !== 'market';
    if (fenced && plot.poly.length >= 2) {
      const [p0, p1] = plot.poly, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), ux = (p1[0] - p0[0]) / L, uz = (p1[1] - p0[1]) / L;
      let ox = -uz, oz = ux; const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if ((s.at[0] - mid[0]) * ox + (s.at[1] - mid[1]) * oz > 0) { ox = -ox; oz = -oz; } // outward = away from the building
      for (let t = 1.2; t < L - 1.2; t += 1.3) anchors.push({ x: p0[0] + ux * t + ox * 0.8, z: p0[1] + uz * t + oz * 0.8, nx: ox, nz: oz, wall: true });
    } else {
      for (const u of [-1.25, 1.25, -2.2, 2.2, -half + 0.6, half - 0.6, -3.2, 3.2]) if (Math.abs(u) < half - 0.3) { const [x, z] = wallAt(u, 0.8); anchors.push({ x, z, nx, nz, wall: true }); }
      if (tier >= 3) { const pd = it?.info?.porch?.depth || 0; for (const u of [-2.5, 0, 2.5]) { const [x, z] = wallAt(u, Math.max(pd + 1.4, 2.6) + rng.range(0, 1)); anchors.push({ x, z, nx, nz, street: true }); } }
    }
    anchors = anchors.sort(() => rng.next() - 0.5);
    let placed = 0, tables = 0;
    const porchD = it?.info?.porch?.depth || 0;
    for (const A of anchors) {
      if (placed >= n) break;
      const type = pick(rng, pool), rad = RAD[type] ?? 0.55;
      if (type === 'umbrella_table' || type === 'cafe_table' || type === 'domino_table') { // tables: never under the porch, only on open ground in front, one or two
        if (tables >= (tier >= 3 ? 2 : 1) || fenced) continue;
        const d = Math.max(porchD + 1.5, 2.6) + rng.range(0, 0.8), u = (A.x - dx) * tx + (A.z - dz) * tz;
        const [x, z] = wallAt(u, d);
        const blocked = (world.solids || []).some((b) => Math.abs((x - b.cx) * Math.cos(b.r) - (z - b.cz) * Math.sin(b.r)) < b.w / 2 + rad && Math.abs((x - b.cx) * Math.sin(b.r) + (z - b.cz) * Math.cos(b.r)) < b.d / 2 + rad)
          || (world.keepOut || []).some((b) => Math.abs((x - b.cx) * Math.cos(b.r) - (z - b.cz) * Math.sin(b.r)) < b.w / 2 + rad * 0.5 && Math.abs((x - b.cx) * Math.sin(b.r) + (z - b.cz) * Math.cos(b.r)) < b.d / 2 + rad * 0.5)
          || world.roadNear(x, z, rad + 0.6) || world.roofAt?.(x, z) != null;
        if (!blocked && put(key, rng, { type, rot: rng.range(0, 360) }, x, z, rad)) { placed++; tables++; }
        continue;
      }
      const faceOut = (Math.atan2(A.nx, A.nz) * 180) / Math.PI;
      const alongWall = ['bench', 'bench_park', 'bicycle', 'wheelbarrow', 'chair_stack', 'tires', 'crates', 'bottle_crates', 'produce_crates', 'water_jugs', 'buckets', 'pot_plant', 'hitching_rail', 'notice_board'].includes(type);
      const rot = type === 'bicycle' || type === 'wheelbarrow' ? faceOut : type === 'chair' ? faceOut + rng.range(-35, 35) : alongWall ? faceOut : faceOut + rng.range(-20, 20);
      if (type === 'bicycle' && fenced) continue; // fence piers every few metres: no room to lean a bike
      const back = type === 'bicycle' ? 0.42 : ALONG.has(type) ? -(rad - 0.45) : 0; // a bike leans on the wall; carts stand clear of it, parallel
      if (put(key, rng, { type, rot: ALONG.has(type) ? faceOut + 90 + (rng.chance(0.5) ? 180 : 0) : rot, ...(type === 'tires' || type === 'crates' ? { count: rng.int(2, 3) } : {}) }, A.x - A.nx * back, A.z - A.nz * back, rad, !!A.wall)) placed++;
    }
    // a cart, wagon or animal parked beside the building (or out at the street fence): trade more than homes,
    // and far more along the highway, where the caravans stop
    {
      const at2 = [dx + nx * 6, dz + nz * 6], hwy = (world.roads || []).some((r) => (r.type === 'highway' || r.class === 'arterial') && r.samples?.some((q) => Math.hypot(q.x - at2[0], q.z - at2[1]) < 22));
      const trade = s.kind !== 'house' && !!(SETS[s.kind] || KIND_SET[s.kind]) && !['chapel', 'hall', 'clinic'].includes(KIND_SET[s.kind] || s.kind);
      const pc = rich ? 0 : trade ? (hwy ? 0.85 : 0.35 + tier * 0.12) : (hwy ? 0.4 : tier >= 2 ? 0.15 : 0); // the good side of town keeps its carts and animals in back
      const nv = trade && hwy && tier >= 2 && rng.chance(0.5) ? 2 : 1;
      for (let k = 0; k < nv && rng.chance(pc); k++) {
        const P0 = PARKED(S, hwy); for (const t of ['bicycle', 'wheelbarrow', 'shopping_cart']) delete P0[t];
        const type = pick(rng, P0), rad = RAD[type] ?? 1.2, faceOut = (Math.atan2(nx, nz) * 180) / Math.PI, flip = rng.chance(0.5) ? 180 : 0;
        const spots = fenced ? anchors.filter((A) => A.wall).slice(0, 6).map((A) => [A.x + A.nx * (rad - 0.3), A.z + A.nz * (rad - 0.3), faceOut + 90 + flip])
          : [...[1, -1].sort(() => rng.next() - 0.5).map((sd) => [...wallAt(sd * (half + rad * 0.55 + 0.5), -0.6), faceOut + flip]), // beside, along the side wall
            ...[0, 1, 2].map(() => [...wallAt(rng.range(-half + 1, half - 1), Math.max(porchD + 2.2, 3.0) + rad * 0.4), faceOut + 90 + flip])]; // out front, parallel to the street
        for (const [x, z, rot] of spots) if (put(key, rng, { type, rot: rot + rng.range(-6, 6) }, x, z, rad)) break;
      }
    }
    if (!rich && (s.kind === 'house' || KIND_SET[s.kind] === 'house' || !SETS[s.kind]) && tier >= 1 && rng.chance(0.55)) { // the household's rubbish: at a front corner, against the wall
      const sd = rng.chance(0.5) ? 1 : -1, [x, z] = wallAt(sd * (half - 0.5), 0.75); put(key, rng, { type: 'trash_heap', count: rng.int(4, 10) }, x, z, 0.55, true);
    }
    // worn footpath door → road for the decals
    (world.lifePaths ||= []).push({ x: dx, z: dz, nx, nz, a, key, fresh: !!region });
  }
  // ---- roadside: vendors at the edge, parked carts / animals near busy places
  for (const r of world.roads || []) {
    if (!r.samples || r._gate || r.type === 'path' || r.type === 'track') continue;
    const key = `life:road:${r.id}`; if (!want(key, 0, 0, region ? () => r.samples.some((q) => inR(q.x, q.z)) : null)) continue;
    const rng = new RNG(`${world.seed}:${key}`), Sm = r.samples;
    const richRoad = (world.spec.plots || []).some((q) => q.zcat === 'wealthy' && q.road === r.id);
    if (richRoad) { // a kept street: lamps along the sidewalk, every ~22 m, alternating sides; no carts or junk sellers
      let acc = 0, sd = 1;
      for (let i = 1; i < Sm.length; i++) { acc += Math.hypot(Sm[i].x - Sm[i - 1].x, Sm[i].z - Sm[i - 1].z); if (acc < 22) continue; acc = 0; sd = -sd;
        const a0 = Sm[i - 1], ux = Sm[i].x - a0.x, uz = Sm[i].z - a0.z, L = Math.hypot(ux, uz) || 1, off = r.hw + 0.5, x = Sm[i].x - (uz / L) * sd * off, z = Sm[i].z + (ux / L) * sd * off;
        if ((world.spec.plots || []).some((q) => q.zcat === 'wealthy' && q.road === r.id && q.side === sd)) put(key, rng, { type: 'street_lamp', rot: (Math.atan2(-ux * sd, uz * sd) * 180) / Math.PI }, x, z, 0.3, true); }
      continue;
    }
    let last = -99, sAcc = 0;
    for (let i = 1; i < Sm.length - 1; i++) {
      sAcc += Math.hypot(Sm[i].x - Sm[i - 1].x, Sm[i].z - Sm[i - 1].z);
      if (sAcc - last < (r.type === 'highway' || r.class === 'arterial' ? 7 : 9)) continue;
      const a0 = Sm[i - 1], b0 = Sm[i + 1], L = Math.hypot(b0.x - a0.x, b0.z - a0.z) || 1, ux = (b0.x - a0.x) / L, uz = (b0.z - a0.z) / L;
      for (const sd of [-1, 1]) {
        const x0 = Sm[i].x - uz * sd * (r.hw + (r.shoulder || 0) + 1.6), z0 = Sm[i].z + ux * sd * (r.hw + (r.shoulder || 0) + 1.6);
        const highway = r.type === 'highway' || r.class === 'arterial', a = world.activity ? world.activity.at(x0, z0) : 0; if (a < (highway ? 0.45 : 0.62) || !rng.chance(highway ? (a - 0.3) * 1.1 : (a - 0.55) * 0.9)) continue;
        const nearJ = (r._junc || []).some((j) => Math.hypot(x0 - j.x, z0 - j.z) < (j.r || 6) + 8);
        const vend = nearJ || rng.chance(highway ? 0.35 : 0.45);
        const type = rng.weighted(vend ? (highway ? HIGHWAY_VENDORS : VENDORS) : PARKED(world.spec.settlement || {}, highway));
        const rad = RAD[type] ?? 0.9, off = r.hw + (r.shoulder || 0) + Math.max(1.6, rad + 0.5), x = Sm[i].x - uz * sd * off, z = Sm[i].z + ux * sd * off;
        const face = (Math.atan2(uz * sd, -ux * sd) * 180) / Math.PI; // toward the road
        if (put(key, rng, { type, ...(type === 'bicycle' ? { lean: 0.06 } : {}), rot: ALONG.has(type) ? Math.atan2(ux, uz) * 180 / Math.PI + (rng.chance(0.5) ? 180 : 0) : face }, x, z, rad)) { last = sAcc; break; }
      }
    }
  }
  // ---- in front of visitors' grounds, casas de paso and markets: vendors selling to travellers, carts parked along the front
  for (const ar of world.areas || []) {
    if (!['visitors', 'wayhouse', 'market'].includes(ar.type) || !ar.size) continue;
    const key = `life:area:${ar.id}`; if (!want(key, ar.at[0], ar.at[1])) continue;
    const rng = new RNG(`${world.seed}:${key}`), R = (ar.rot || 0) * Math.PI / 180, c = Math.cos(R), sn = Math.sin(R), [W, D] = ar.size;
    const P = (u, v) => [ar.at[0] + u * c + v * sn, ar.at[1] - u * sn + v * c], face = ar.rot || 0;
    const a = Math.max(0.35, world.activity ? world.activity.at(...P(0, D / 2 + 3)) : 0.5);
    const nV = Math.round(1 + a * 3), nP = Math.round(1 + a * 2.5), highway = (world.roads || []).some((r) => (r.type === 'highway' || r.class === 'arterial') && r.samples?.some((q) => Math.hypot(q.x - ar.at[0], q.z - ar.at[1]) < Math.max(W, D) / 2 + 25));
    const slots = []; for (let u = -W / 2 + 1.5; u < W / 2 - 1.5; u += 2.6) slots.push(u);
    slots.sort(() => rng.next() - 0.5);
    let v = 0, p = 0;
    for (const u of slots) {
      if (v < nV) { const t = v === 0 && rng.chance(ar.type === 'market' ? 0.06 : 0.1) ? 'mystic_stall' : rng.weighted(ar.type === 'visitors' || highway ? { ...HIGHWAY_VENDORS, ...VENDORS, water_seller: 3 } : VENDORS), rad = RAD[t] ?? 1, [x, z] = P(u, D / 2 + rad + 0.8); if (put(key, rng, { type: t, rot: face + 180 + rng.range(-10, 10) }, x, z, rad)) v++; continue; }
      if (p < nP) { const t = rng.weighted(PARKED(world.spec.settlement || {}, true)), rad = RAD[t] ?? 1.2, [x, z] = P(u, D / 2 + rad + 2.6); if (put(key, rng, { type: t, rot: face + 90 + (rng.chance(0.5) ? 180 : 0) }, x, z, rad)) p++; }
    }
  }
  // ---- farms: now and then a farm stand at the gate, a cart loaded with produce on the road side
  for (const pl of world.spec.plots || []) {
    if (pl.use !== 'farmstead' || !pl.poly) continue;
    const F = plotFrame(pl), key = `life:farm:${pl.id}`; if (!want(key, F.front[0], F.front[1])) continue;
    const rng = new RNG(`${world.seed}:${key}`), out = [Math.sin(F.rot), Math.cos(F.rot)], side = [out[1], -out[0]]; // out = toward the street
    const gate = (world.spec.plots.find((q) => q === pl).gates || [])[0], g = gate?.at && Array.isArray(gate.at) ? gate.at : F.front;
    const P = (along, off) => [g[0] + side[0] * along + out[0] * off, g[1] + side[1] * along + out[1] * off];
    const a = world.activity ? world.activity.at(...P(0, 3)) : 0.3;
    if (rng.chance(0.3 + a * 0.4)) { const s2 = rng.chance(0.5) ? 1 : -1; for (const d of [3.2, 4.5, 6]) { const [x, z] = P(s2 * d, 2.2); if (put(key, rng, { type: 'farm_stand', rot: F.deg + 180 + rng.range(-6, 6) }, x, z, 1.5)) break; } }
    if (rng.chance(0.3 + a * 0.3)) { const s2 = rng.chance(0.5) ? 1 : -1; for (const d of [6, 8, 10]) { const [x, z] = P(s2 * d, 2.6); if (put(key, rng, { type: rng.chance(0.6) ? 'farm_cart' : 'brahmin_wagon', load: 'produce', cover: 'none', rot: F.deg + 90 + (rng.chance(0.5) ? 180 : 0) + rng.range(-8, 8) }, x, z, 2.2)) break; } }
  }
  // ---- alleys
  placeAlleys(world, want, put, region);
  if (region) { // orphans: life whose anchor is gone (building deleted / moved, road or area removed) never gets redone, so drop it here
    const ids = new Set((world.structures || []).map((q) => q.id)), rids = new Set((world.roads || []).map((q) => q.id)), aids = new Set((world.areas || []).map((q) => q.id));
    const owners = new Set(world.group.children.map((c) => c.userData.owner).filter((o) => typeof o === 'string' && o.startsWith('life:') && !redone.has(o)));
    for (const o of owners) {
      const f = o.split(':'); let dead = false;
      if (f[1] === 'road') dead = !rids.has(f[2]);
      else if (f[1] === 'area') dead = !aids.has(f[2]);
      else if (f[1] === 'farm') dead = !(world.spec.plots || []).some((q) => q.id === f[2] && q.use === 'farmstead');
      else if (f[1] === 'alley') { const [mx, mz] = (f[4] || '').split(',').map(Number); dead = !ids.has(f[2]) || (f[3] !== 'f' && !ids.has(f[3])) || (Number.isFinite(mx) && inR(mx, mz)); }
      else if (f.length === 2) dead = !ids.has(f[1]);
      if (dead) world.removeOwned(o);
    }
  }
  if (region) for (const k of ['alleys', 'lifePaths']) { world[k] = (world[k] || []).filter((q) => q.fresh || !redone.has(q.key)); world[k].forEach((q) => delete q.fresh); }
}

// a real built wall right behind (x, z)? (n points out of the wall). Footprints can run where nothing got built
// (ruins, courtyards, cut masses), so wall-hung props ray-test the building's own meshes
const _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
function wallBehind(world, s, x, z, nx, nz, y = 1.3) {
  const obj = s && world.items?.get(s.id)?.object; if (!obj) return false;
  obj.updateMatrixWorld(true);
  _o.set(x + nx * 0.5, world.terrain.height(x, z) + y, z + nz * 0.5); _d.set(-nx, 0, -nz);
  _rc.set(_o, _d); _rc.far = 1.0;
  return _rc.intersectObject(obj, true).length > 0;
}

// ---------------------------------------------------------------- alleys
function placeAlleys(world, want, put, region) {
  const S = world.spec.settlement || {};
  if (S.alleys === false) return;
  const powered = ['some', 'grid'].includes(S.power) ? 0.65 : S.power === 'scarce' ? 0.25 : 0;
  const poor = ['dead_broke', 'poor', 'struggling'].includes(S.wealth);
  // sides: each mass's four walls, plus long wall / fence segments
  const sides = [];
  for (const s of world.structures || []) for (const m of s._masses || []) {
    const c = Math.cos(m.r), sn = Math.sin(m.r), W = (u, v) => [m.cx + u * c + v * sn, m.cz - u * sn + v * c];
    for (const [ou, ov, L] of [[m.w / 2, 0, m.d], [-m.w / 2, 0, m.d], [0, m.d / 2, m.w], [0, -m.d / 2, m.w]]) {
      const n = [ou ? Math.sign(ou) : 0, ov ? Math.sign(ov) : 0], nW = [n[0] * c + n[1] * sn, -n[0] * sn + n[1] * c], mid = W(ou, ov);
      sides.push({ s, mid, n: nW, L, t: [nW[1], -nW[0]], kind: 'wall' });
    }
  }
  for (const f of [...(world.walls || []), ...(world.plotWalls || [])]) {
    if (!f.path || ['powerline', 'acequia', 'stream', 'wire', 'pole', 'rail', 'chain'].includes(f.type)) continue;
    for (let i = 0; i < f.path.length - 1; i++) {
      const [ax, az] = f.path[i], [bx, bz] = f.path[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 8) continue;
      const t = [(bx - ax) / L, (bz - az) / L];
      sides.push({ s: null, mid: [(ax + bx) / 2, (az + bz) / 2], n: [t[1], -t[0]], L, t, kind: 'fence', twoSided: true });
    }
  }
  const seen = new Set();
  const R2D = 180 / Math.PI;
  // candidates by a coarse grid (a side is listed in every cell its length crosses); in an edit, only frames near the box
  const GC = 16, grid = new Map(), gk = (i, j) => i * 73856093 ^ j * 19349663;
  sides.forEach((e, k) => { e.k = k; const r = e.L / 2 + 1; for (let i = Math.floor((e.mid[0] - r) / GC); i <= Math.floor((e.mid[0] + r) / GC); i++) for (let j = Math.floor((e.mid[1] - r) / GC); j <= Math.floor((e.mid[1] + r) / GC); j++) { const q = gk(i, j); if (!grid.has(q)) grid.set(q, []); grid.get(q).push(e); } });
  const nearSides = (F) => { const out = new Set(), r = F.L / 2 + 6; for (let i = Math.floor((F.mid[0] - r) / GC); i <= Math.floor((F.mid[0] + r) / GC); i++) for (let j = Math.floor((F.mid[1] - r) / GC); j <= Math.floor((F.mid[1] + r) / GC); j++) for (const e of grid.get(gk(i, j)) || []) out.add(e); return [...out].sort((a, b) => a.k - b.k); };
  const near = (F) => !region || (F.mid[0] > region[0] - F.L / 2 - 8 && F.mid[0] < region[2] + F.L / 2 + 8 && F.mid[1] > region[1] - F.L / 2 - 8 && F.mid[1] < region[3] + F.L / 2 + 8);
  for (let i = 0; i < sides.length; i++) { const F = sides[i]; if (!F.s || !near(F)) continue; for (const O of nearSides(F)) { const j = O.k;
    if (i === j || !F.s || (O.s && O.s === F.s)) continue; // F: a building wall (the frame); O: the wall / fence across
    const cosN = F.n[0] * O.n[0] + F.n[1] * O.n[1];
    if (O.s ? cosN > -0.985 : Math.abs(cosN) < 0.985) continue; // facing each other
    if (O.s && i > j && sides[j].s) continue; // building–building pairs once
    const g = (O.mid[0] - F.mid[0]) * F.n[0] + (O.mid[1] - F.mid[1]) * F.n[1]; if (g < 1.2 || g > 5) continue;
    const tt = F.t, nn = F.n, uo = (O.mid[0] - F.mid[0]) * tt[0] + (O.mid[1] - F.mid[1]) * tt[1];
    const u0 = Math.max(-F.L / 2, uo - O.L / 2), u1 = Math.min(F.L / 2, uo + O.L / 2); if (u1 - u0 < 8) continue;
    const P = (u, v) => [F.mid[0] + tt[0] * u + nn[0] * v, F.mid[1] + tt[1] * u + nn[1] * v];
    const wallA = F, other = O;
    const key = `life:alley:${F.s.id}:${O.s?.id || 'f'}:${Math.round(F.mid[0])},${Math.round(F.mid[1])}`;
    if (seen.has(key)) continue; seen.add(key);
    if (!want(key, F.mid[0], F.mid[1])) continue;
    // ends: open if nothing solid just beyond them in the alley's middle
    const mid0 = P(u0 - 1.5, g / 2), mid1 = P(u1 + 1.5, g / 2);
    const open0 = !world.hard.test(mid0[0], mid0[1], 0.4), open1 = !world.hard.test(mid1[0], mid1[1], 0.4);
    if (!open0 && !open1) continue; // a closed slot
    const a0 = world.activity ? world.activity.at(...P(u0 - 2.5, g / 2)) : 0.3, a1 = world.activity ? world.activity.at(...P(u1 + 2.5, g / 2)) : 0.3;
    const aMouth = Math.max(open0 ? a0 : 0, open1 ? a1 : 0) * 0.8;
    const kinds = [wallA.s, other.s].filter(Boolean);
    const type = kinds.some(DEAD) ? 'derelict' : kinds.some((s) => COMMERCE.has(s.kind)) ? 'service' : 'domestic';
    const rng = new RNG(`${world.seed}:${key}`);
    const Lr = u1 - u0, lane = 1.1, room = (g - lane) / 2; // floor room on each side of the lane
    const rotAlong = Math.atan2(-tt[1], tt[0]) * R2D, rotAcross = Math.atan2(-nn[1], nn[0]) * R2D; // local x along the alley / across it
    const faceIn = (v) => (Math.atan2(nn[0] * (v < g / 2 ? 1 : -1), nn[1] * (v < g / 2 ? 1 : -1)) * 180) / Math.PI;
    const deep = (u) => { const dm = Math.min(open0 ? u - u0 : 1e9, open1 ? u1 - u : 1e9); return Math.max(0.4, 1 - dm / 10); }; // 1 at a mouth → 0.4 deep in
    const hTop = 2.6 + Math.min(...kinds.map((s) => (s.floors || 1))) * 0.3;
    world.alleys ||= []; world.alleys.push({ fresh: !!region, a: P(u0, g / 2), b: P(u1, g / 2), g, type, dead: !(open0 && open1), end: open0 ? P(u1 - 0.8, g / 2) : P(u0 + 0.8, g / 2), key });
    // overhead: laundry lines and tarps wall to wall, cables where there's power (all above 2.3 m)
    if (wallA.s && other.s) {
      const nl = Math.max(1, Math.floor(Lr / 3.6));
      for (let k = 0; k < nl; k++) {
        const u = u0 + ((k + 0.5) * Lr) / nl + rng.range(-0.5, 0.5), [x, z] = P(u, g / 2);
        if (type === 'derelict') continue;
        if (rng.chance(type === 'domestic' ? 0.7 : 0.35)) world.own(key, () => world.addProp({ type: 'alley_line', at: [x, z], length: g + 0.2, height: Math.max(2.4, Math.min(hTop, rng.range(2.5, 3.2))), rot: rotAcross, seat: false, keep: true }, true));
        else if (rng.chance(0.35)) world.own(key, () => world.addProp({ type: 'alley_tarp', at: [x, z], length: g + 0.1, depth: rng.range(2, 3), height: Math.max(2.4, Math.min(hTop, 2.9)), rot: rotAcross, seat: false, keep: true }, true));
      }
      if (rng.chance(powered)) for (let k = 0; k < rng.int(1, 2); k++) { const [x, z] = P(rng.range(u0 + 1, u1 - 1), g / 2); world.own(key, () => world.addProp({ type: 'cables', at: [x, z], length: g + 0.3, height: hTop + 0.3, rot: rotAcross + rng.range(-25, 25), seat: false, keep: true }, true)); }
    }
    // on the walls: drain spouts, a tank on a bracket, a bulb over the side door (the door counts as life)
    for (const W of [wallA, other.s ? other : null].filter(Boolean)) {
      const onA = W === wallA, v = onA ? 0.02 : g - 0.02, face = faceIn(onA ? 0 : g);
      const on = onA ? [nn[0], nn[1]] : [-nn[0], -nn[1]], hung = (x, z) => wallBehind(world, W.s, x, z, on[0], on[1]);
      for (let k = 0; k < rng.int(1, 2); k++) { const [x, z] = P(rng.range(u0 + 0.6, u1 - 0.6), v); if (hung(x, z)) world.own(key, () => world.addProp({ type: 'drain_spout', at: [x, z], rot: face, height: hTop - 0.2, keep: true, seat: false }, true)); }
      if (type === 'domestic' && rng.chance(0.3)) { const [x, z] = P(rng.range(u0 + 1, u1 - 1), v); if (hung(x, z)) world.own(key, () => world.addProp({ type: 'wall_tank', at: [x, z], rot: face, keep: true }, true)); }
      const it = W.s && world.items?.get(W.s.id), R = W.s ? (W.s.rot || 0) * Math.PI / 180 : 0;
      for (const o of it?.info?.openings || []) {
        if (!(o.type === 'door' && (o.floor ?? 0) === 0)) continue;
        const c = Math.cos(R), sn = Math.sin(R), wx = W.s.at[0] + o.x * c + o.z * sn, wz = W.s.at[1] - o.x * sn + o.z * c, onx = o.nx * c + o.nz * sn, onz = -o.nx * sn + o.nz * c;
        const toAlley = onx * (onA ? nn[0] : -nn[0]) + onz * (onA ? nn[1] : -nn[1]);
        const along = (wx - F.mid[0]) * tt[0] + (wz - F.mid[1]) * tt[1];
        if (toAlley < 0.9 || along < u0 - 0.5 || along > u1 + 0.5) continue;
        if (rng.chance(powered + 0.15)) world.own(key, () => world.addProp({ type: 'wall_lamp', at: [wx + onx * 0.05, wz + onz * 0.05], rot: (Math.atan2(onx, onz) * 180) / Math.PI, height: Math.min(2.6, (o.y1 ?? 2.2) + 0.35), keep: true, seat: false }, true));
        if (room >= 0.35 && rng.chance(0.6)) { // the kitchen / back door: a stool, a bucket
          const sideU = rng.chance(0.5) ? 0.9 : -0.9, [x, z] = [wx + onx * 0.45 + onz * sideU, wz + onz * 0.45 - onx * sideU];
          put(key, rng, { type: type === 'service' ? rng.weighted({ chair: 2, buckets: 1.5, bottle_crates: 1.5 }) : rng.weighted({ chair: 2.5, buckets: 1.5, pot_plant: 1 }), rot: (Math.atan2(onx, onz) * 180) / Math.PI + rng.range(-30, 30) }, x, z, 0.4, true);
        }
      }
    }
    // the floor along the walls (never in the lane): by kind, fading with depth
    if (room >= 0.3) {
      const pool = type === 'service' ? { bottle_crates: 2, crates: 2, barrel: 1.5, trash_heap: 1.5, buckets: 1 } : type === 'derelict' ? { rubble: 2, scrap_pile: 1.5, trash_heap: 2, tires: 1 } : { buckets: 2, pot_plant: 2.5, water_jugs: 1.5, bicycle: room > 0.45 ? 0.48 : 0, chair: 1.2 };
      const n = Math.round(Lr / 3.2 * (0.5 + aMouth));
      for (let k = 0; k < n; k++) {
        const u = rng.range(u0 + 0.5, u1 - 0.5); if (!rng.chance(deep(u) + 0.2)) continue;
        const t = rng.weighted(pool), onA = t === 'bicycle' || rng.chance(0.5) || !other.s, v = onA ? Math.min(room, t === 'bicycle' ? 0.3 : 0.4) : g - Math.min(room, 0.4), [x, z] = P(u, v); // a bike leans on wall A (its lean is toward -n)
        put(key, rng, { type: t, rot: t === 'bicycle' ? rotAlong : faceIn(v) + (t === 'chair' ? rng.range(-30, 30) : 0), ...(t === 'crates' || t === 'tires' ? { count: 2 } : {}) }, x, z, Math.min(0.45, room), true);
      }
      // dead end: the heap at the end; a fire barrel there in poor places
      if (!(open0 && open1)) { const al = world.alleys[world.alleys.length - 1].end; put(key, rng, { type: 'trash_heap' }, al[0], al[1], 0.5, true); if (poor && rng.chance(0.5)) { const e2 = [al[0] + nn[0] * Math.min(room, 0.5), al[1] + nn[1] * Math.min(room, 0.5)]; put(key, rng, { type: 'fire_barrel' }, e2[0] + tt[0] * 0.8, e2[1] + tt[1] * 0.8, 0.4, true); } }
    }
    // the mouth on a busy street: an A-frame pointing in, or a parked bike
    if (aMouth >= 0.5 && g >= 2.4) {
      const atStart = open0 && (!open1 || a0 >= a1), u = atStart ? u0 + 0.6 : u1 - 0.6, v = Math.min(room, 0.45), [x, z] = P(u, v);
      const mt = g >= 3.5 && rng.chance(0.5) ? rng.pick(['handcart', 'shopping_cart']) : rng.chance(type === 'service' ? 0.3 : 0.4) ? 'bicycle' : null; // (bikes cut by 60%; no A-frame signs)
      if (mt) put(key, rng, { type: mt, rot: type === 'service' ? rotAlong + (atStart ? 180 : 0) : rotAlong }, x, z, 0.4, true);
    }
  } }
}

// day items hidden at night
export function lifeTimeOfDay(world, h) {
  const day = h >= 6.5 && h < 21.5;
  for (const g of world.lifeItems || []) if (g.userData.life === 'day') g.visible = day;
}

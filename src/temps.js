// Temporary and semi-permanent gatherings: caravan yards, travellers' camps, markets, and the plaza
// a market usually sits on. Items are props, so they're selectable and carry stat blocks.
import * as THREE from 'three';
import { RNG } from './rng.js';
import { obb, obbOverlap, toWorld, toLocal, nearestWithin, pointInPoly } from './geo.js';
import { clipConvex } from './plots.js';

const GOODS = { produce: 3, pottery: 1.5, cloth: 1.5, scrap: 1.2, water: 1, meat: 1, ammo: 0.6, tools: 1, sacks: 1, mixed: 2 };
const GOODS_NAME = { produce: 'produce', pottery: 'pottery', cloth: 'cloth', scrap: 'scrap & parts', water: 'water', meat: 'meat', ammo: 'ammunition', tools: 'tools', sacks: 'grain & beans', mixed: 'general goods' };

// settlement.plaza: true | { at, r, well }
export function planPlaza(world) {
  const S = world.spec.settlement || {};
  if (!S.plaza) return null;
  const P = S.plaza === true ? {} : S.plaza;
  const at = P.at || S.core || [0, 0], r = P.r || 12;
  const rng = new RNG(`${world.seed}:plaza`);
  const poly = Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2 + 0.2, rr = r * rng.range(0.9, 1.08); return [at[0] + Math.cos(a) * rr, at[1] + Math.sin(a) * rr]; });
  world.plaza = { at, r, poly, obb: obb(at[0], at[1], r * 1.8, r * 1.8, 0) };
  world.fields.push({ id: 'plaza', name: P.name || 'Plaza', type: 'plaza', poly, paint: 'packed', stats: P.stats });
  const props = [];
  if (P.well !== false) {
    let [x, z] = at;
    for (let k = 0; k < 8 && world.roadNear(x, z, 2.2); k++) { x = at[0] + Math.cos(k * 0.8) * r * 0.55; z = at[1] + Math.sin(k * 0.8) * r * 0.55; }
    props.push({ id: 'plaza-well', name: P.wellName || 'Plaza well', type: P.well === 'pump' ? 'hand_pump' : 'well', at: [x, z], roof: true, clear: 2 });
    world.plaza.wellAt = [x, z];
  }
  // town PA on the plaza edge when the town has power (settlement.plaza.pa: false | 'siren' | 'pole')
  if (P.pa !== false && (P.pa || (S.power && S.power !== 'none'))) {
    const a = rng.range(0, Math.PI * 2);
    let x = at[0] + Math.cos(a) * r * 0.82, z = at[1] + Math.sin(a) * r * 0.82;
    for (let k = 1; k < 8 && world.roadNear(x, z, 1.8); k++) { x = at[0] + Math.cos(a + k * 0.7) * r * 0.82; z = at[1] + Math.sin(a + k * 0.7) * r * 0.82; }
    const siren = P.pa === 'siren' || (P.pa !== 'pole' && S.power === 'grid' && rng.chance(0.3));
    props.push({ id: 'plaza-pa', name: siren ? 'Civil-defense siren' : 'Town PA', type: siren ? 'cd_siren' : 'pa_pole', at: [x, z], rot: (Math.atan2(at[0] - x, at[1] - z) * 180) / Math.PI, clear: 1.2 });
  }
  return props;
}

function placeItem(world, rng, p, rad, at, jitter = 1.5, within = null) {
  const T = world.terrain;
  for (let k = 0; k < 7; k++) {
    const x = at[0] + (k ? rng.range(-jitter, jitter) : 0), z = at[1] + (k ? rng.range(-jitter, jitter) : 0);
    if (within && ![[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]].every(([dx, dz]) => pointInPoly(x + dx, z + dz, within))) continue;
    if (!T.inBounds(x, z, rad + 1) || world.hard.test(x, z, rad * 0.75) || world.roadNear(x, z, rad * 0.6 + 0.5)) continue;
    world.addProp({ ...p, at: [x, z] }, true);
    world.raster.circle(x, z, rad);
    world.hard.circle(x, z, rad * 0.8);
    return [x, z];
  }
  return null;
}

// { id, type: 'caravan' | 'travellers', at, rot, radius, name, stats }
export function placeCamp(world, c) {
  const rng = new RNG(`${world.seed}:camp:${c.id || c.at.join(',')}`);
  const [cx, cz] = c.at, base = c.rot ?? rng.range(0, 360);
  const P = (r, aDeg) => { const a = ((base + aDeg) * Math.PI) / 180; return [cx + Math.sin(a) * r, cz + Math.cos(a) * r]; };
  const face = (x, z) => (Math.atan2(cx - x, cz - z) * 180) / Math.PI;
  const id = c.id || 'camp';
  if (c.type === 'caravan') {
    placeItem(world, rng, { type: 'firepit', id: `${id}-fire`, name: c.name || 'Caravan yard', stats: c.stats }, 1.2, [cx, cz], 0.5);
    const nw = c.wagons ?? rng.int(2, 4);
    for (let i = 0; i < nw; i++) {
      const a = -100 + (i * 200) / Math.max(1, nw - 1) + rng.range(-12, 12);
      const [x, z] = P(rng.range(6.5, 8), a);
      placeItem(world, rng, { type: 'wagon', id: `${id}-wagon-${i + 1}`, name: 'Caravan wagon', rot: base + a + 90 + rng.range(-15, 15), cover: rng.chance(0.8) }, 2.4, [x, z], 1.2);
      if (rng.chance(0.6)) placeItem(world, rng, { type: rng.pick(['crates', 'barrel', 'goods']), count: rng.int(2, 4), rot: rng.range(0, 360) }, 0.9, P(rng.range(4.2, 5), a + rng.range(-10, 10)), 0.8);
    }
    // picket line with the brahmin
    const [hx, hz] = P(rng.range(9, 11), 180 + rng.range(-25, 25));
    const hr = face(hx, hz) + 90;
    if (placeItem(world, rng, { type: 'hitching_rail', length: 7, rot: hr }, 3.6, [hx, hz], 1)) {
      const nb = c.brahmin ?? nw * 2;
      for (let i = 0; i < nb; i++) {
        const [ox, oz] = toWorld(-3 + (i * 6) / Math.max(1, nb - 1), 1.6 + rng.range(-0.2, 0.4), (hr * Math.PI) / 180);
        world.addProp({ type: 'brahmin', at: [hx + ox, hz + oz], rot: hr + 180 + rng.range(-20, 20) }, true);
      }
      placeItem(world, rng, { type: 'trough', length: 3, rot: hr }, 1.6, toWorldOff(hx, hz, 0, -1.5, hr), 0.5);
    }
    const nt = c.tents ?? rng.int(1, 3);
    for (let i = 0; i < nt; i++) {
      const [x, z] = P(rng.range(9, 12), rng.range(-70, 70));
      placeItem(world, rng, { type: rng.weighted({ tent_wall: 3, tent_bell: 1, tent_aframe: 1 }), id: `${id}-tent-${i + 1}`, name: 'Caravan tent', rot: face(x, z) }, 2.6, [x, z], 1.5);
    }
    placeItem(world, rng, { type: 'lantern', rot: 0 }, 0.4, P(2.2, rng.range(0, 360)), 0.6);
  } else if (c.type === 'travellers') {
    placeItem(world, rng, { type: 'firepit', id: `${id}-fire`, name: c.name || "Travellers' camp", stats: c.stats }, 1.2, [cx, cz], 0.5);
    const nt = c.tents ?? rng.int(1, 3);
    for (let i = 0; i < nt; i++) {
      const [x, z] = P(rng.range(3.2, 4.2), (i * 360) / nt + rng.range(-25, 25));
      placeItem(world, rng, { type: rng.weighted({ tent_aframe: 3, lean_to: 2, tarp_tent: 2 }), id: `${id}-tent-${i + 1}`, name: "Traveller's tent", rot: face(x, z) + 180 }, 1.8, [x, z], 0.8);
    }
    for (let i = 0; i < rng.int(0, 2); i++) { const [x, z] = P(2.0, rng.range(0, 360)); placeItem(world, rng, { type: 'bedroll', rot: face(x, z) + 90 }, 1.0, [x, z], 0.5); }
    if (rng.chance(0.35)) placeItem(world, rng, { type: 'cart', load: true, rot: rng.range(0, 360) }, 1.8, P(6, rng.range(0, 360)), 1);
    if (rng.chance(0.5)) placeItem(world, rng, { type: 'brahmin', rot: rng.range(0, 360) }, 1.4, P(7, rng.range(0, 360)), 1.5);
  }
  world.raster.circle(cx, cz, (c.radius || 8) * 0.7);
}

function toWorldOff(x, z, lx, lz, rotDeg) { const [a, b] = toWorld(lx, lz, (rotDeg * Math.PI) / 180); return [x + a, z + b]; }

// { id, at, r, count, axis?, name }  — stalls in a ring facing the centre, or two rows along `axis`
export function placeMarket(world, m) {
  const rng = new RNG(`${world.seed}:market:${m.id || 'market'}`);
  const [cx, cz] = m.at, r = m.r || 10;
  // front toward the nearest road (that's where people come in), else m.axis
  let face = m.axis ?? 0, bd = 1e9;
  if (m.axis == null) for (const rd of world.roads) { const q = nearestWithin(rd.samples, cx, cz, rd.hw + r + 20); if (q && q.d < bd) { bd = q.d; face = (Math.atan2(q.qx - cx, q.qz - cz) * 180) / Math.PI; } }
  const W = m.length || r * 1.55, D = m.axis != null ? (m.aisle || 3.2) * 2 + 9 : r * 1.55, R = (face * Math.PI) / 180;
  const P = (u, v) => { const [x, z] = toWorld(u, v, R); return [cx + x, cz + z]; };
  const T = world.terrain;
  layoutMarket(world, rng, { id: m.id || 'market', P, rot: face, W, D, fill: m.fill ?? m.density, life: m.life, wealth: m.wealth || world.spec.settlement?.wealth, svc: 3, hasWater: !!world.plaza?.wellAt && Math.hypot(world.plaza.wellAt[0] - cx, world.plaza.wellAt[1] - cz) < r + 4,
    inside: (u, v, mm = 0) => m.axis != null || Math.hypot(u, v) < r - mm * 0.5 + 1.5, ok: (x, z, rad) => T.inBounds(x, z, rad + 1) && !world.hard.test(x, z, rad * 0.75) && !world.roadNear(x, z, rad * 0.6 + 0.5) });
}


// ------------------------------------------------------------------ market rules
// A market is laid out, never scattered: rows of stalls on a grid with aisles; back-to-back pairs under one shared
// shade per row; goods zoned (food at the front where people come in, dry goods in the middle, hard goods at the
// back by the workshops); one stall type per row; everything else (crates, barrels, carts, animals, water) on the
// service edge at the back. Nothing loose on the floor. fill (Density) = how many rows / stalls; life (Liveliness)
// = signs of people only (chairs, stock out, animals, carts) on its own random stream; wealth = quality (tarps and
// blankets → wooden stalls under tin).
// f: { P(u, v) -> [x, z], rot (deg, front = +v), W, D, inside(u, v, m), ok(x, z, rad), id, fill, life, wealth, svc }
const ZONE_GOODS = [{ produce: 3, meat: 1.2, water: 1, sacks: 1.4 }, { cloth: 1.5, pottery: 1.5, mixed: 2, sacks: 0.6 }, { tools: 1.4, scrap: 1.5, ammo: 0.7, mixed: 0.6 }];
function layoutMarket(world, rng, f) {
  const lrng = new RNG(`${world.seed}:market-life:${f.id}`), fill = Math.max(0.05, Math.min(1, f.fill ?? 0.7)), life = Math.max(0, Math.min(1, f.life ?? 0.5));
  const tier = ['dead_broke', 'poor', 'struggling'].includes(f.wealth) ? 0 : ['comfortable', 'rich', 'wealthy', 'very_wealthy', 'filthy_rich', 'prosperous'].includes(f.wealth) ? 2 : 1;
  const { W, D } = f, svcD = f.svc ?? (D > 22 ? 5 : 3), walk = 2.6, aisle = tier === 2 ? 3.6 : 3.2, pairD = 4.2;
  const add = (p, u, v, lrot = 0) => world.addProp({ ...p, rot: f.rot + lrot + (p.rot || 0), at: f.P(u, v) }, true);
  const okAt = (u, v, rad) => f.inside(u, v, rad) && f.ok(...f.P(u, v), rad);
  const mark = (u, v, w, d) => { const [x, z] = f.P(u, v); world.hard.obb(obb(x, z, w, d, (f.rot * Math.PI) / 180), 0.2); world.raster.obb(obb(x, z, w, d, (f.rot * Math.PI) / 180), 0.3); };
  // rows (pair centre lines) from the front walk back to the service edge
  const vTop = D / 2 - walk - aisle * 0.15, vBot = -D / 2 + svcD + 0.6, rows = [];
  for (let v = vTop - pairD / 2; v - pairD / 2 >= vBot; v -= pairD + aisle) rows.push(v);
  const nRows = Math.max(1, Math.round(rows.length * Math.min(1, 0.35 + fill * 0.75)));
  // cross aisle in the middle when wide
  const cross = W > 18 ? (tier === 2 ? 3.6 : 3.0) : 0, uMin = -W / 2 + 1.4, uMax = W / 2 - 1.4;
  const segs = cross ? [[uMin, -cross / 2], [cross / 2, uMax]] : [[uMin, uMax]];
  let k = 0;
  rows.slice(0, nRows).forEach((vc, ri) => {
    const zone = Math.min(2, Math.floor((ri / Math.max(1, rows.length)) * 3 + (rows.length === 1 ? 0 : 0)));
    for (const [u0, u1] of segs) {
      const type = rng.weighted(tier === 0 ? { tarp_stall: 3, cart_shop: 1.4, stall: 0.8 } : tier === 2 ? { stall: 5, cart_shop: 0.8 } : { stall: 3, tarp_stall: 1.4, cart_shop: 1 });
      const slot = type === 'cart_shop' ? 2.5 : 3.1, n = Math.floor((u1 - u0) / slot);
      if (n < 1) continue;
      const len = n * slot, uc = (u0 + u1) / 2;
      // shared shade over the pair
      const roof = tier === 0 ? rng.weighted({ tarp: 3, thatch: 2 }) : tier === 2 ? rng.weighted({ corrugated: 3, latilla: 1 }) : rng.weighted({ latilla: 2, corrugated: 1.5, tarp: 1.5 });
      if (!okAt(uc, vc, 1.5)) continue;
      add({ type: 'ramada', width: len + 0.3, depth: pairD + 0.5, roof, height: 2.7, id: `${f.id}-row${++k}`, name: `Market row ${ri + 1}` }, uc, vc);
      const goodsA = rng.weighted(ZONE_GOODS[zone]), goodsB = rng.chance(0.35) ? rng.weighted(ZONE_GOODS[zone]) : goodsA;
      for (const sg of [1, -1]) for (let i = 0; i < n; i++) {
        const u = u0 + (u1 - u0 - len) / 2 + (i + 0.5) * slot, v = vc + sg * (pairD / 4 + 0.05);
        if (rng.next() > Math.min(1, 0.25 + fill * 0.85) || !okAt(u, v, 0.8)) continue;
        const goods = (i + (sg > 0 ? 0 : 1)) % 2 ? goodsB : goodsA;
        add({ type, cover: 'none', width: slot - 0.5, goods, id: `${f.id}-${++k}`, name: `Market stall · ${GOODS_NAME[goods]}` }, u, v + (type === 'tarp_stall' ? -sg * 0.35 : type === 'cart_shop' ? 0 : -sg * 0.15), sg > 0 ? 0 : 180);
        // life: the stallholder's chair behind the counter, spare stock under it
        if (lrng.chance(life * 0.55) && type === 'stall') add({ type: 'chair' }, u + lrng.range(-0.6, 0.6), v - sg * 0.75, sg > 0 ? 180 : 0);
      }
      mark(uc, vc, len + 0.6, pairD + 0.6);
      // row ends: a stack of the row's stock, tucked against the end post
      { const ue = uc + (lrng.chance(0.5) ? 1 : -1) * (len / 2 + 0.55); if (lrng.chance(0.3 + life * 0.5) && okAt(ue, vc, 0.5)) add({ type: lrng.pick(['crates', 'sacks', 'barrel']), count: 2 }, ue, vc, 90); }
    }
  });
  // the service edge: water, carts, animals and the stacks all live along the back
  const vs = -D / 2 + svcD / 2;
  const svc = [];
  for (let u = uMin + 1.5; u < uMax - 1; u += 3.2) svc.push(u);
  const take = () => svc.splice(Math.floor(rng.next() * svc.length), 1)[0];
  const putS = (p, rad, lrot = 0) => { for (let t = 0; t < 4 && svc.length; t++) { const u = take(); if (okAt(u, vs, rad)) { add(p, u, vs, lrot); return true; } } return false; };
  if (!f.hasWater) putS({ type: rng.chance(0.5) ? 'well' : 'hand_pump', roof: true, id: `${f.id}-water`, name: 'Market water' }, 1.2);
  putS({ type: 'trough', length: 2.6 }, 1.2, 0);
  putS({ type: 'crates', count: 3 }, 0.9, 0); putS({ type: 'barrel', count: 3 }, 0.8, 0);
  for (let i = 0; i < 1 + Math.round(life * 2); i++) if (lrng.chance(0.4 + life * 0.5)) putS({ type: 'cart', load: lrng.chance(0.6) }, 1.5, 90);
  if (lrng.chance(0.2 + life * 0.6)) putS({ type: 'brahmin' }, 1.4, 90);
  if (tier >= 1 && lrng.chance(0.3 + life * 0.4)) putS({ type: 'sacks', count: 3 }, 0.9, 0);
  if (tier === 2 && world.settlement?.power && world.settlement.power !== 'none') for (const su of [-1, 1]) { const u = su * (W / 2 - 1), v = D / 2 - 0.8; if (okAt(u, v, 0.5)) add({ type: 'street_lamp', height: 5 }, u, v, su > 0 ? -90 : 90); }
}

// ------------------------------------------------------------------ areas (reserved lots)
// { id, type: 'market' | 'visitors', at, size: [w, d], rot, name, stats, wall, wealth }
// Local frame: u across (width), v toward the road (front = +v).
export function placeArea(world, a) {
  const rng = new RNG(`${world.seed}:area:${a.id || a.type}`);
  const [W, D] = a.size, r = (a.rot * Math.PI) / 180;
  const P = (u, v) => { const [x, z] = toWorld(u, v, r); return [a.at[0] + x, a.at[1] + z]; };
  const poly = a.poly || [P(-W / 2, -D / 2), P(W / 2, -D / 2), P(W / 2, D / 2), P(-W / 2, D / 2)];
  const inside = (u, v, m = 0) => !a.poly || [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([du, dv]) => { const q = P(u + du, v + dv); return pointInPoly(q[0], q[1], a.poly); });
  const S = world.spec.settlement || {};
  const poor = ['dead_broke', 'poor'].includes(a.wealth || S.wealth);
  const put = (p, rad, u, v, jit = 0.4) => placeItem(world, rng, { rot: a.rot, ...p }, rad, P(u, v), jit, a.poly);
  const T = world.terrain;
  const shed = (id, u, v, size, kind = 'shed', name, more = {}) => {
    if (!inside(u, v, Math.max(...size) * 0.7)) return;
    const st = world.resolveStructure({ id, name, kind, size, at: P(u, v), rot: a.rot + 180, origin: 'new', material: kind === 'outhouse' ? 'timber' : rng.weighted({ adobe: 2, timber: 1.5, metal: 1 }), snap: false, surround: false, _sub: true, _area: a.id, ...more });
    let sum = 0; for (const m of st._masses) sum += T.height(m.cx, m.cz);
    st._y = sum / st._masses.length;
    world.structures.push(st); world.addStructure(st);
    for (const m of st._masses) world.hard.obb(m, 0.8);
  };
  world.register({ id: a.id, name: a.name || (a.type === 'market' ? 'Market' : "Visitors' area"), type: 'area', spec: a, object: null, outline: poly, anchor: () => new THREE.Vector3(a.at[0], T.height(a.at[0], a.at[1]) + 3, a.at[1]) });
  if (a.baked) { // contents live in the spec now (edited by hand inside the plot)
    if (a.type !== 'market') { if (a.poly) world.raster.poly(shrinkPoly(a.poly, 1.2)); else world.raster.obb(obb(a.at[0], a.at[1], W - 2.4, D - 2.4, r), 0); }
    return;
  }

  // ---- footprint placer shared by the visitors' grounds and the wayhouse
  const occ = []; // local footprints: { cx, cz, w, d, r, pad }
  const inPoly = (u, v, m = 0.6) => [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([du, dv]) => { const q = P(u + du, v + dv); return a.poly ? pointInPoly(q[0], q[1], a.poly) : Math.abs(u + du) < W / 2 && Math.abs(v + dv) < D / 2; });
  const fits = (u, v, w, d, rr, pad) => {
    const o = obb(u, v, w, d, rr);
    const c = Math.cos(rr), sn = Math.sin(rr);
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) { if (!inPoly(u + x * c + z * sn, v - x * sn + z * c, 0.9)) return false; }
    return occ.every((b) => !obbOverlap(o, b, Math.max(pad, b.pad)));
  };
  const take = (u, v, w, d, rr, pad) => occ.push({ ...obb(u, v, w, d, rr), pad });
  const near = (u, v) => occ.reduce((m, b) => Math.min(m, Math.hypot(u - b.cx, v - b.cz) - Math.max(b.w, b.d) / 2), 99);
  // best of N candidates inside a zone: room around it, close to the zone's anchor
  const pick = (zone, w, d, rr, pad, n = 40) => {
    let best = null;
    for (let i = 0; i < n; i++) {
      const u = rng.range(zone.u0, zone.u1), v = rng.range(zone.v0, zone.v1), rot = typeof rr === 'function' ? rr() : rr;
      if (!fits(u, v, w, d, rot, pad)) continue;
      const sc = Math.min(near(u, v), 8) - 0.15 * Math.hypot(u - (zone.au ?? (zone.u0 + zone.u1) / 2), v - (zone.av ?? (zone.v0 + zone.v1) / 2));
      if (!best || sc > best.sc) best = { u, v, rot, sc };
    }
    if (best) take(best.u, best.v, w, d, best.rot, pad);
    return best;
  };
  const prop = (p, u, v, lrot = 0) => world.addProp({ rot: a.rot + (lrot * 180) / Math.PI, ...p, at: P(u, v) }, true);
  if (a.type === 'market') {
    // back strip: makeshift workshops under ramadas (the service edge), then the stall rows by the market rules
    const wv = -D / 2 + 3.2, big = D > 24 && W > 16;
    if (big) {
      put({ type: 'ramada', width: Math.min(9, W * 0.4), depth: 4, roof: 'corrugated' }, 0.1, -W / 4, wv, 0);
      put({ type: 'workbench', rot: a.rot + 180 }, 0.8, -W / 4 - 2, wv - 0.8, 0.2);
      put({ type: 'forge', id: `${a.id}-forge`, name: 'Market forge (makeshift)', rot: a.rot }, 1.5, -W / 4 + 2.6, wv, 0.2);
      put({ type: 'tarp_stall', goods: 'scrap', id: `${a.id}-tinker`, name: 'Tinker (makeshift workshop)', rot: a.rot }, 1.8, W / 4 - 2, wv, 0.3);
    }
    const S2 = world.spec.settlement || {};
    layoutMarket(world, rng, { id: a.id, P, rot: a.rot, W, D, fill: a.fill, life: a.life, wealth: a.wealth || S2.wealth, svc: big ? 6.5 : 3.2,
      inside: (u, v, mm = 0.6) => inside(u, v, mm) && Math.abs(u) < W / 2 - mm && Math.abs(v) < D / 2 - mm, ok: (x, z, rad) => T.inBounds(x, z, rad + 1) && !world.hard.test(x, z, rad * 0.6) && !world.roadNear(x, z, rad * 0.6 + 0.5) });
    put({ type: 'sign', text: a.sign || 'MERCADO', width: 3.4, height: 0.7, post: 2.2, rot: a.rot }, 0.5, -W / 2 + 1.5, D / 2 - 0.8, 0);
    return;
  }

  if (a.type === 'wayhouse') {
    // Hermandad del Camino wayhouse (Casa de Paso): a walled compound off the road. Every casa has a reception /
    // office, dormitories, a secure store, room for animals and vehicles, and a shaded dining area; a big one also
    // has private rooms. The livery is plain whitewash with a white stripe at the top and a black one at the foot;
    // the compound wall is an ordinary wall.
    const gateW = 6;
    let gateU = 0, path;
    if (a.poly) {
      const [p0, p1] = a.poly, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, t = (k) => [p0[0] + ((p1[0] - p0[0]) * k) / L, p0[1] + ((p1[1] - p0[1]) * k) / L], gw = Math.min(gateW, L - 1);
      gateU = toLocal((p0[0] + p1[0]) / 2 - a.at[0], (p0[1] + p1[1]) / 2 - a.at[1], r)[0];
      path = [t(L / 2 + gw / 2), ...a.poly.slice(1), a.poly[0], t(L / 2 - gw / 2)];
    } else path = [P(gateW / 2, D / 2), P(W / 2, D / 2), P(W / 2, -D / 2), P(-W / 2, -D / 2), P(-W / 2, D / 2), P(-gateW / 2, D / 2)];
    const LIV = a.livery === 'none' ? null : a.livery || 'hermandad';
    const cmat = a.material || rng.weighted({ adobe: 3, block: 2, plaster: 1.5 }), croof = cmat === 'adobe' ? 'flat_adobe' : 'slab';
    const wt = a.wall || (cmat === 'adobe' ? 'adobe' : rng.chance(0.5) ? 'block' : 'adobe');
    world.addFence({ id: `${a.id}-wall`, type: wt, path, height: ['adobe', 'block'].includes(wt) ? 2.0 : undefined, condition: 0.85 });
    if (a.poly) world.raster.poly(shrinkPoly(a.poly, 1.2)); else world.raster.obb(obb(a.at[0], a.at[1], W - 2.4, D - 2.4, r), 0);
    const yard = { u: gateU * 0.5, v: D * 0.05 };
    take((gateU + yard.u) / 2, (D / 2 + yard.v) / 2, 6.5, Math.hypot(yard.u - gateU, D / 2 - yard.v), Math.atan2(gateU - yard.u, D / 2 - yard.v), 0.3); // gate lane
    const HER = 'La Hermandad del Camino', big = W * D > 1250;
    const build = (key, kind, w, d, zones, rotOff, name, stats, more = {}) => {
      let p = null; for (const z of Array.isArray(zones) ? zones : [zones]) { p = pick(z, w + 0.6, d + 0.6, rotOff, 1.2, 60); if (p) break; }
      if (!p) return null;
      const st = world.resolveStructure({ id: `${a.id}-${key}`, name, kind, size: [w, d], at: P(p.u, p.v), rot: a.rot + (rotOff * 180) / Math.PI, origin: 'new', material: LIV ? cmat : rng.weighted({ adobe: 3, stone: 1, plaster: 1 }), snap: false, surround: false, _sub: true, stats, finish: 'painted', _area: a.id, ...(LIV ? { livery: LIV, vstyle: 'plain', roof: 'flat', roofMat: croof } : {}), ...more });
      let sum = 0; for (const m of st._masses) sum += T.height(m.cx, m.cz);
      st._y = sum / st._masses.length;
      world.structures.push(st); world.addStructure(st);
      for (const m of st._masses) world.hard.obb(m, 0.8);
      return p;
    };
    const wsign = (text) => ({ sign: { text, style: LIV ? 'wall' : 'painted' } });
    const sd = rng.chance(0.5) ? 1 : -1; // dorms on -sd, the vehicle side on +sd
    // 1. reception / office: the back wall, its front toward the gate
    const rw = Math.min(14, Math.max(8, W * 0.38)), rd = 8;
    const rec = build('reception', 'hall', rw, rd, [{ u0: -W / 2 + rw / 2 + 1, u1: W / 2 - rw / 2 - 1, v0: -D / 2 + rd / 2 + 1, v1: -D / 2 + rd / 2 + 2.5, au: gateU * 0.3, av: -D / 2 }], 0, 'Casa de Paso — recepción',
      { owner: HER, occupants: ['The keeper', 'Kitchen and yard staff'], condition: 'Kept', gm_notes: ['Reception, office and kitchen', 'A portrait of San Mecánico hangs above the reception desk', 'Currency exchange: caps, salt, ammunition. Caminantes pay near-zero; outsiders 8–20% depending on distance from a city', 'Shelter, help with breakdowns and medical care for Caminantes', 'The Code of the Road is honoured here: no one arriving in peace is turned away'] },
      { porch: { roof: 'latilla' }, ...wsign('CASA DE PASO'), floors: big && rng.chance(0.5) ? 2 : 1 });
    // 2. the shaded dining area, always: a ramada in front of the reception (the kitchen), tables and benches under it
    {
      const dw = big ? 9 : 7, dd = big ? 5.5 : 4.5, rv = rec ? rec.v + rd / 2 + 2.6 + dd / 2 + 0.8 : yard.v - 3, ru = rec ? rec.u + (rng.chance(0.5) ? 1 : -1) * Math.max(0, rw / 2 - dw / 2) : yard.u; // clear of the reception porch
      let dn = null;
      for (const [w2, d2, z] of [[dw, dd, { u0: ru - 4, u1: ru + 4, v0: rv - 0.5, v1: rv + 2.5, au: ru, av: rv }], [dw, dd, { u0: yard.u - 10, u1: yard.u + 10, v0: yard.v - 9, v1: yard.v + 3, au: ru, av: rv }], [6, 4, { u0: -W / 2 + 4, u1: W / 2 - 4, v0: -D / 2 + 4, v1: D / 2 - 6, au: ru, av: rv }]]) { dn = pick(z, w2 + 0.8, d2 + 0.8, 0, 0.8, 60); if (dn) { dn.w = w2; dn.d = d2; break; } }
      if (dn) {
        prop({ type: 'ramada', width: dn.w, depth: dn.d, roof: rng.weighted({ latilla: 3, corrugated: 1.5, thatch: 1 }), id: `${a.id}-comedor`, name: 'Comedor (shaded dining)' }, dn.u, dn.v);
        const nt = Math.max(2, Math.floor(dn.w / 2.6));
        for (let k = 0; k < nt; k++) prop({ type: 'table', chairs: 4 }, dn.u - dn.w / 2 + (k + 0.5) * (dn.w / nt), dn.v);
        prop({ type: 'drum_stove' }, dn.u + dn.w / 2 + 0.8, dn.v - dn.d / 2 + 0.6);
      }
    }
    // 3. dormitories along one side
    const dl = Math.min(16, Math.max(8, D * 0.42));
    build('dorm', 'shelter', dl, 6.5, [{ u0: -sd * (W / 2 - 8), u1: -sd * (W / 2 - 4.0), v0: -D / 2 + dl / 2 + 2, v1: D / 2 - dl / 2 - 3, au: -sd * W / 2, av: 0 }, { u0: -W / 2 + 5, u1: W / 2 - 5, v0: -D / 2 + 5, v1: D / 2 - 6, au: -sd * W / 2, av: 0 }], -sd * Math.PI / 2, 'Dormitorio', { owner: HER, occupants: ['Travellers'], gm_notes: ['Bunks and bedrolls; a bed costs little, less for Caminantes'] }, wsign('DORMITORIO'));
    // 4. the secure store: a small block building with a steel door, by the reception
    build('store', 'shed', 6, 4.5, [{ u0: -sd * (W / 2 - 4), u1: -sd * (W / 2 - 9), v0: -D / 2 + 3, v1: -D / 2 + 5, au: -sd * W / 2, av: -D / 2 }, { u0: sd * (W / 2 - 4), u1: sd * (W / 2 - 9), v0: -D / 2 + 3, v1: -D / 2 + 5, au: sd * W / 2, av: -D / 2 }, { u0: -W / 2 + 4, u1: W / 2 - 4, v0: -D / 2 + 3, v1: D / 2 - 6, au: 0, av: -D / 2 }], 0, 'Bodega (secure store)', { owner: HER, gm_notes: ['Locked store: travellers\' goods held for safekeeping, the casa\'s stock'] }, { material: 'block', ...wsign('BODEGA') });
    // 5. private rooms (big casas): a row of rooms with their own doors
    if (big) build('rooms', 'posada', Math.min(14, W * 0.3), 7, [{ u0: -sd * (W / 2 - 6), u1: sd * 2, v0: D * 0.05, v1: D / 2 - 6, au: -sd * W / 3, av: D / 4 }, { u0: -W / 2 + 6, u1: W / 2 - 6, v0: -D / 4, v1: D / 2 - 6, au: 0, av: D / 4 }], 0, 'Cuartos privados', { owner: HER, occupants: ['Travellers who can pay'], gm_notes: ['Private rooms with a lock'] }, { layout: 'gallery', ...wsign('CUARTOS') });
    // 6. animals and vehicles: the repair bay with the wagons by it, a corral in a back corner
    const bay = build('bay', 'workshop', 9, 7, [{ u0: sd * (W / 2 - 8), u1: sd * (W / 2 - 4.0), v0: -D / 4, v1: D / 2 - 6, au: sd * W / 2, av: D / 4 }], sd * Math.PI / 2, 'Taller de la Hermandad', { owner: HER, occupants: ['A mechanic'], gm_notes: ['Help with breakdowns: tools, parts on hand, a pit for wagons'] }, wsign('TALLER'));
    for (let i = 0; i < rng.int(2, 4); i++) { const p = pick({ u0: sd * 2, u1: sd * (W / 2 - 9), v0: -D / 4, v1: D / 2 - 5, au: bay ? bay.u - sd * 5 : sd * W / 4, av: bay ? bay.v : 0 }, 2.2, 4.4, () => rng.range(-0.3, 0.3), 0.6, 30); if (p) prop({ type: rng.weighted({ wagon: 3, cart: 2, car_wreck: 0.5 }), cover: rng.chance(0.6), load: rng.chance(0.6) }, p.u, p.v, p.rot); }
    for (const [cu, cz] of [[sd * (W / 2 - 4.5), -D / 2 + 4], [-sd * (W / 2 - 4.5), -D / 2 + 4], [sd * (W / 2 - 4.5), D / 2 - 6], [-sd * (W / 2 - 4.5), D / 2 - 6]]) {
      if (!fits(cu, cz, 7, 6, 0, 0.5)) continue;
      take(cu, cz, 7, 6, 0, 0.5);
      world.addFence({ id: `${a.id}-corral`, type: 'rail', path: [P(cu - 3.5, cz - 3), P(cu + 3.5, cz - 3), P(cu + 3.5, cz + 3), P(cu - 3.5, cz + 3)], closed: true, gates: [{ at: 0.6, width: 2.5 }] });
      for (let i = 0; i < rng.int(1, 3); i++) world.addProp({ type: rng.chance(0.7) ? 'brahmin' : 'burro', at: P(cu + rng.range(-2, 2), cz + rng.range(-1.6, 1.6)), rot: rng.range(0, 360) }, true);
      prop({ type: 'trough', length: 2.6 }, cu, cz - 2.2);
      break;
    }
    // water in the yard
    const well = pick({ u0: yard.u - 5, u1: yard.u + 5, v0: yard.v - 4, v1: yard.v + 4, au: yard.u, av: yard.v }, 2.4, 2.4, 0, 1.2);
    if (well) { prop({ type: rng.chance(0.6) ? 'hand_pump' : 'cistern', id: `${a.id}-water`, name: 'Agua de la casa de paso' }, well.u, well.v); const tr = pick({ u0: well.u - 3, u1: well.u + 3, v0: well.v - 3, v1: well.v + 3, au: well.u, av: well.v }, 3.2, 0.9, 0, 0.6); if (tr) prop({ type: 'trough', length: 3 }, tr.u, tr.v); }
    // the gate: San Mecánico shrine inside, a sign and lanterns outside
    prop({ type: 'shrine', id: `${a.id}-shrine`, name: 'San Mecánico', stats: { gm_notes: ['Candles, a spark plug, a wrench — offerings to San Mecánico'] } }, gateU + gateW / 2 + 1.4, D / 2 - 1.6, Math.PI);
    prop({ type: 'lantern', essential: true }, gateU + gateW / 2 + 0.4, D / 2 + 0.3);
    prop({ type: 'lantern', essential: true }, gateU - gateW / 2 - 0.4, D / 2 + 0.3);
    put({ type: 'sign', text: a.sign || 'CASA DE PASO · HERMANDAD DEL CAMINO', width: 5.2, height: 0.8, post: 2.2, rot: a.rot }, 0.5, gateU - gateW / 2 - 2.8, D / 2 + 1.2, 0);
    return;
  }

  if (a.type === 'visitors') {
    // ---- layout by zones relative to the gate, every item a footprint with clearance (no clumps)
    const wt = a.wall || (poor ? 'pole' : rng.weighted({ adobe: 2, stone_low: 1.5, pole: 1, wood: 1 }));
    const gateW = 5.5;
    let gateU = a.gateU ?? 0, path;
    if (a.poly) {
      const [p0, p1] = a.poly, L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, t = (k) => [p0[0] + ((p1[0] - p0[0]) * k) / L, p0[1] + ((p1[1] - p0[1]) * k) / L];
      const gw = Math.min(gateW, L - 1);
      gateU = toLocal((p0[0] + p1[0]) / 2 - a.at[0], (p0[1] + p1[1]) / 2 - a.at[1], r)[0];
      path = [t(L / 2 + gw / 2), ...a.poly.slice(1), a.poly[0], t(L / 2 - gw / 2)];
    } else path = [P(gateU + gateW / 2, D / 2), P(W / 2, D / 2), P(W / 2, -D / 2), P(-W / 2, -D / 2), P(-W / 2, D / 2), P(gateU - gateW / 2, D / 2)];
    world.addFence({ id: `${a.id}-wall`, type: wt, path, height: wt === 'adobe' ? 1.6 : undefined, condition: 0.75 });
    // clear scrub inside (a little stays along the inner edge)
    if (a.poly) world.raster.poly(shrinkPoly(a.poly, 1.2)); else world.raster.obb(obb(a.at[0], a.at[1], W - 2.4, D - 2.4, r), 0);

    // the gate lane: kept clear from the gate to the yard
    const yard = { u: gateU * 0.4, v: D * 0.02 };
    const laneLen = Math.hypot(yard.u - gateU, D / 2 - yard.v), laneR = Math.atan2(gateU - yard.u, D / 2 - yard.v);
    take((gateU + yard.u) / 2, (D / 2 + yard.v) / 2, 5, laneLen, laneR, 0.3);
    // gate furniture
    prop({ type: 'lantern', essential: true }, gateU + gateW / 2 + 0.4, D / 2 + 0.3);
    prop({ type: 'lantern', essential: true }, gateU - gateW / 2 - 0.4, D / 2 + 0.3);
    put({ type: 'sign', text: a.sign || 'VISITANTES · AGUA · CORRAL', width: 4.6, height: 0.8, post: 2.0, rot: a.rot }, 0.5, gateU + gateW / 2 + 2.6, D / 2 + 1.2, 0);
    { const hu = gateU - gateW / 2 - 2.2, hv = D / 2 - 2.4; if (fits(hu, hv, 2.6, 2.6, 0, 0.3)) { take(hu, hv, 2.6, 2.6, 0, 0.3); prop({ type: 'guard_shack', id: `${a.id}-gate`, name: 'Gate hut', stats: { owner: a.keeper || 'Town (visitors\' warden)', occupants: ['A warden; a guard after dark'], condition: 'Kept', gm_notes: ['Animals and wagons are logged in and out', 'Small fee per head of brahmin and per wagon — GM call'] } }, hu, hv, Math.PI / 2); } }
    // sides: corral in the back corner away from the gate, parking + camp on the other side
    const cs = gateU > 0 ? -1 : 1; // corral side
    const cu0 = cs < 0 ? -W / 2 + 1 : W / 2 - W * 0.42, cu1 = cs < 0 ? -W / 2 + W * 0.42 : W / 2 - 1, cv0 = -D / 2 + 1, cv1 = -D / 2 + D * 0.46;
    let cpoly = [P(cu0, cv0), P(cu1, cv0), P(cu1, cv1), P(cu0, cv1)];
    if (a.poly) cpoly = clipConvex(a.poly.map((q) => q.slice()), cpoly).map(([x, z]) => { const [lu, lv] = toLocal(x - a.at[0], z - a.at[1], r); const k = 0.9; const [wx, wz] = toWorld(lu * k + ((cu0 + cu1) / 2) * (1 - k), lv * k + ((cv0 + cv1) / 2) * (1 - k), r); return [a.at[0] + wx, a.at[1] + wz]; });
    if (cpoly.length >= 3) {
      world.addFence({ id: `${a.id}-corral`, type: 'rail', path: cpoly, closed: true, gates: [{ at: 0.62, width: 3 }] });
      take((cu0 + cu1) / 2, (cv0 + cv1) / 2, cu1 - cu0 + 1, cv1 - cv0 + 1, 0, 0.5);
      const inC = (u, v) => { const q = P(u, v); return pointInPoly(q[0], q[1], cpoly); };
      const spots = [];
      for (let i = 0, n = 0; i < 80 && n < (a.brahmin ?? rng.int(4, 8)); i++) { const u = rng.range(cu0 + 1.5, cu1 - 1.5), v = rng.range(cv0 + 1.8, cv1 - 1.8); if (!inC(u, v) || spots.some(([x, z]) => Math.hypot(x - u, z - v) < 2.6)) continue; spots.push([u, v]); n++; world.addProp({ type: 'brahmin', at: P(u, v), rot: rng.range(0, 360) }, true); }
      const tu = cs < 0 ? cu1 - 1.0 : cu0 + 1.0; if (inC(tu, (cv0 + cv1) / 2)) prop({ type: 'trough', length: 3 }, tu, (cv0 + cv1) / 2, Math.PI / 2);
      const hu = cs < 0 ? cu0 + 1.8 : cu1 - 1.8; if (inC(hu, cv0 + 1.8)) prop({ type: 'haystack' }, hu, cv0 + 1.8);
    }
    // water + shade in the yard
    const yz = { u0: yard.u - 5, u1: yard.u + 5, v0: yard.v - 4, v1: yard.v + 3, au: yard.u, av: yard.v };
    const well = pick(yz, 2.4, 2.4, 0, 1.2);
    if (well) prop({ type: rng.chance(0.6) ? 'well' : 'hand_pump', roof: true, id: `${a.id}-water`, name: 'Visitors\' well' }, well.u, well.v);
    if (!poor) { const rz = { ...yz, u0: yard.u - 9, u1: yard.u + 9, v0: yard.v - 8, v1: yard.v + 6 }; const rm = pick(rz, 6.4, 4.4, 0, 1.2); if (rm) { prop({ type: 'ramada', width: 6, depth: 4, roof: rng.chance(0.5) ? 'thatch' : 'corrugated' }, rm.u, rm.v); prop({ type: 'table', chairs: 4 }, rm.u, rm.v); } }
    // parking: wagons nose to the wall along the side away from the corral, 4 m apart, front to back
    const pu = -cs * (W / 2 - 3.2);
    let parked = 0;
    for (let v = D / 2 - 6; v > -D / 2 + 4 && parked < Math.max(2, Math.floor(D / 5)); v -= 4.2) {
      let u = pu; for (let k = 0; k < 6 && !fits(u, v, 2.2, 4.4, Math.PI / 2, 0.4); k++) u += cs * 1.2; // slide in from the wall on odd shapes
      if (!fits(u, v, 2.2, 4.4, Math.PI / 2, 0.4)) continue;
      if (rng.chance(0.25)) { take(u, v, 2.2, 4.4, Math.PI / 2, 0.4); continue; } // an empty bay
      take(u, v, 2.2, 4.4, Math.PI / 2, 0.4); parked++;
      prop({ type: rng.chance(0.75) ? 'wagon' : 'cart', cover: rng.chance(0.7), load: true, id: rng.chance(0.4) ? `${a.id}-wagon-${parked}` : undefined, name: 'Parked wagon' }, u, v, -cs * Math.PI / 2 + rng.range(-0.08, 0.08));
    }
    // camping ground: the back half on the parking side, tents spread out, one fire pit in the middle
    const camp = { u0: cs < 0 ? -W * 0.05 : -W / 2 + 3, u1: cs < 0 ? W / 2 - 3 : W * 0.05, v0: -D / 2 + 3, v1: -D * 0.02 };
    camp.au = (camp.u0 + camp.u1) / 2; camp.av = (camp.v0 + camp.v1) / 2;
    const fire = pick({ ...camp, u0: camp.au - 3, u1: camp.au + 3, v0: camp.av - 2, v1: camp.av + 2 }, 1.8, 1.8, 0, 2.0);
    if (fire) prop({ type: 'firepit' }, fire.u, fire.v);
    const TENT = { tent_aframe: [2.4, 3.2], tent_wall: [3.6, 4.6], lean_to: [2.6, 2.4], tarp_tent: [3, 3] };
    for (let i = 0; i < (a.tents ?? rng.int(3, 6)); i++) {
      const tp = rng.weighted({ tent_aframe: 3, tent_wall: 1.5, lean_to: 1.5, tarp_tent: 1 }), [tw, td] = TENT[tp];
      const z = { ...camp, au: fire ? fire.u : camp.au, av: fire ? fire.v : camp.av };
      const t = pick(z, tw, td, () => rng.range(-0.7, 0.7), 1.4, 30);
      if (t) prop({ type: tp }, t.u, t.v, t.rot);
    }
    if (fire) for (let i = 0; i < 2; i++) { const b = pick({ u0: fire.u - 3, u1: fire.u + 3, v0: fire.v - 3, v1: fire.v + 3, au: fire.u, av: fire.v }, 0.9, 2, () => rng.range(0, 3.1), 0.5, 20); if (b) prop({ type: 'bedroll' }, b.u, b.v, b.rot); }
    // storage units + latrine along the back wall
    const back = { u0: -W / 2 + 3, u1: W / 2 - 3, v0: -D / 2 + 2.9, v1: -D / 2 + 4.5, av: -D / 2 };
    if (a.storage !== false) for (let i = 0; i < (poor ? 1 : 2); i++) { const s0 = pick({ ...back, au: -cs * W * 0.15 }, 4.4, 3.6, 0, 0.6); if (s0) shed(`${a.id}-store-${i + 1}`, s0.u, s0.v, [4, 3.2], 'shed', 'Storage unit'); }
    { const l = pick({ ...back, au: -cs * W / 2 }, 1.9, 1.9, 0, 0.8); if (l) shed(`${a.id}-latrine`, l.u, l.v, [1.5, 1.5], 'outhouse'); }
    // a few bushes kept along the inner edge
  }
}

function shrinkPoly(P, d) { const c = P.reduce((m, q) => [m[0] + q[0] / P.length, m[1] + q[1] / P.length], [0, 0]); return P.map(([x, z]) => { const L = Math.hypot(x - c[0], z - c[1]) || 1; return [x - ((x - c[0]) / L) * d, z - ((z - c[1]) / L) * d]; }); }

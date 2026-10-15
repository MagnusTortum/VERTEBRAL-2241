// Kinds with layouts: guesthouse (posada), general store, medical, café. Each kind has 2–3 layouts; the
// layout picks the plan (masses, rooms, portals, floors) and the dressing built into the structure
// (galleries, stairs, canopies, tables, tents, crosses, crates...). Layout is spec.layout or picked
// from the id, so the footprint (massesFor) and the build always agree.
import { col } from './builder.js';
import { plant, herbBundle } from './foliage.js';
import { RNG } from './rng.js';
import { WOOD, METAL, ROOF } from './palette.js';
import { LIGHT_COL } from './presets.js';

import { STAND_LAYOUTS, standLayout } from './stands.js';
import { UTILITY_LAYOUTS, utilityMasses, utilityFloors, utilityColors } from './utilities.js';
export const KIND_LAYOUTS = {
  stand: STAND_LAYOUTS,
  utility: UTILITY_LAYOUTS,
  posada: { courtyard: 'courtyard posada', gallery: 'two-storey gallery', motel: 'pre-war motor court' },
  store: { tienda: 'tienda de abarrotes', trading: 'trading post' },
  clinic: { clinic: 'clinic', curandero: 'curandero / herbalist', field: 'field hospital' },
  cafe: { fonda: 'fonda', diner: 'pre-war diner', rooftop: 'rooftop café' },
  mission: { mission: 'mission complex' },
  granary: { troje: 'troje (raised store)' },
  mill: { tahona: 'tahona mill' },
  bodega: { bodega: 'winery' },
  townhall: { presidencia: 'town hall' },
  comandancia: { post: 'post-war comandancia', station: 'pre-war police station (re-used)' },
  trade: { tortilleria: 'tortillería', panaderia: 'panadería (bread oven)', carniceria: 'carnicería', herreria: 'herrería (smithy)', alfareria: 'alfarería (potter)' },
  den: { cages: 'slave pen (cage block)', brothel: 'brothel (casa de citas)', gambling: 'gambling den', chopshop: 'chop-shop doctor', gunshop: "gun runner's bunker", bounty: 'bounty office', water: 'water merchant (tower)', bus: 'bus home (pre-war bus)', fuselage: 'fuselage home (plane)', gatehouse: 'junk gatehouse', rotunda: 'round temple (cult)' },
  pemex: { working: 'Damex — working', stripped: 'Damex — stripped', ruined: 'Damex — ruined', lapemex: 'La Damex (gazetteer)' },
};
export const LAYOUT_KINDS = Object.keys(KIND_LAYOUTS);

export function kindLayout(spec) {
  const L = KIND_LAYOUTS[spec.kind]; if (!L) return null;
  if (spec.kind === 'stand') return standLayout(spec);
  const [w, d] = spec.size || [10, 8];
  let lay = spec.layout && L[spec.layout] ? spec.layout : null;
  if (!lay) {
    const r = new RNG(`${spec.id || ''}:layout`), pre = (spec.origin || 'new') !== 'new';
    lay = {
      posada: () => (pre ? 'motel' : w >= 13 && d >= 12 && r.chance(0.65) ? 'courtyard' : 'gallery'),
      store: () => (r.chance(0.3) ? 'trading' : 'tienda'),
      clinic: () => (pre ? (r.chance(0.5) ? 'field' : 'clinic') : r.chance(0.4) ? 'curandero' : 'clinic'),
      cafe: () => (pre ? (r.chance(0.7) ? 'diner' : 'rooftop') : r.chance(0.35) ? 'rooftop' : 'fonda'),
      comandancia: () => (pre ? 'station' : 'post'),
      den: () => r.pick(['brothel', 'gambling', 'chopshop', 'gunshop', 'bounty', 'water']),
      trade: () => r.pick(['tortilleria', 'panaderia', 'carniceria', 'herreria', 'alfareria']),
      utility: () => r.pick(Object.keys(UTILITY_LAYOUTS)),
      pemex: () => (spec.condition != null && spec.condition < 0.45 ? 'ruined' : r.chance(0.15) ? 'working' : 'stripped'),
    }[spec.kind]?.() || Object.keys(L)[0];
  }
  if (lay === 'courtyard' && (w < 12 || d < 11)) lay = 'gallery'; // too small for rooms round a patio
  return lay;
}
export function layoutFloors(spec, lay = kindLayout(spec)) {
  const f = spec.floors || 1;
  if (UTILITY_LAYOUTS[lay] && spec.kind === 'utility') return utilityFloors(lay, spec);
  if (spec.kind === 'den') return lay === 'brothel' || lay === 'gatehouse' ? Math.max(2, f) : ['bus', 'fuselage', 'cages', 'gunshop', 'rotunda'].includes(lay) ? 1 : f;
  return lay === 'gallery' || lay === 'rooftop' || lay === 'presidencia' ? Math.max(2, f) : ['curandero', 'troje', 'mission'].includes(lay) || spec.kind === 'pemex' ? 1 : f;
}
export function layoutRoof(lay) { return UTILITY_LAYOUTS[lay] ? ['flat', 'slab'] : ['rooftop', 'motel', 'diner', 'clinic', 'presidencia', 'station', 'working', 'stripped', 'ruined', 'lapemex', 'gunshop', 'bounty', 'cages', 'gatehouse', 'chopshop'].includes(lay) ? ['flat', 'slab'] : null; }

// plan: the courtyard posada is four ranges of rooms round a patio with a portal on the inner faces; the
// gallery and the motel are one block with a row of rooms along the front
export function layoutMasses(spec, lay) {
  const [w, d] = spec.size || [10, 8];
  if (spec.kind === 'utility') return utilityMasses(spec, lay);
  if (lay === 'courtyard') {
    const t = Math.max(3.4, Math.min(5, Math.min(w, d) * 0.28)), pd = 1.6;
    return [
      { x: 0, z: d / 2 - t / 2, w, d: t, main: true, rooms: ['back'], portal: 'back', portalLen: w - 2 * t, zaguan: true, court: { w: w - 2 * t, d: d - 2 * t } },
      { x: 0, z: -d / 2 + t / 2, w, d: t, rooms: ['front'], portal: 'front', portalLen: w - 2 * t },
      { x: -w / 2 + t / 2, z: 0, w: t, d: d - 2 * t, noDoor: true, rooms: ['right'], portal: 'right', portalLen: d - 2 * t - 2 * pd - 0.2 },
      { x: w / 2 - t / 2, z: 0, w: t, d: d - 2 * t, noDoor: true, rooms: ['left'], portal: 'left', portalLen: d - 2 * t - 2 * pd - 0.2 },
    ];
  }
  if (lay === 'gallery' || lay === 'motel') return [{ x: 0, z: 0, w, d, main: true, rooms: ['front'] }];
  if (lay === 'mission') { // church on the left behind its atrium; convent range at the back with an arcade; school at the front right
    const cw = Math.max(7, Math.min(10, w * 0.36)), a = Math.max(5, Math.min(9, d * 0.28)), cd = d - a, wr = w - cw;
    const out = [{ x: -w / 2 + cw / 2, z: d / 2 - a - cd / 2, w: cw, d: cd, main: true, atrium: a }];
    if (wr >= 5) {
      const dc = Math.min(7, cd * 0.45);
      out.push({ x: -w / 2 + cw + wr / 2, z: -d / 2 + dc / 2, w: wr, d: dc, fh: 3.2, roof: 'flat', rooms: ['front'], portal: 'front', portalLen: wr - 1, noDoor: true });
      const ws = Math.min(9, wr * 0.75), ds = Math.min(6, cd - dc - 3);
      if (ds >= 4) out.push({ x: w / 2 - ws / 2, z: d / 2 - a - ds / 2, w: ws, d: ds, fh: 3.2, roof: 'flat', doors: 1, school: true });
    }
    return out;
  }
  if (lay === 'post' || lay === 'station') { // office at the front, the cell block behind
    const df = Math.max(4, d * 0.6), dc = d - df;
    if (dc < 3 || w < 6) return null;
    return [{ x: 0, z: d / 2 - df / 2, w, d: df, main: true }, { x: 0, z: -d / 2 + dc / 2, w: Math.max(4, w * 0.65), d: dc, cells: true, noDoor: true }];
  }
  if (spec.kind === 'den') {
    if (lay === 'cages') { const hw = Math.max(3.5, Math.min(5, w * 0.35)), hd = Math.max(3.5, Math.min(5, d * 0.5)); return [{ x: -w / 2 + hw / 2, z: -d / 2 + hd / 2, w: hw, d: hd, main: true, denW: w, denD: d }]; } // the guards' hut; cages are dressing
    if (lay === 'water') { const df = Math.max(4, Math.min(6, d * 0.55)); return [{ x: 0, z: d / 2 - df / 2, w, d: df, main: true, denD: d }]; } // the shop; the tower stands behind
    if (lay === 'gatehouse') { const tw = Math.max(2.6, Math.min(3.4, w * 0.3)); return [{ x: -w / 2 + tw / 2, z: 0, w: tw, d, main: true, gateW: w - 2 * tw }, { x: w / 2 - tw / 2, z: 0, w: tw, d, noDoor: true }]; }
    return null;
  }
  if (spec.kind === 'pemex') { // the shop / office at the back; the canopy and islands are dressing in front
    const wo = Math.max(5, Math.min(9, w * 0.45)), dof = Math.max(4, Math.min(6, d * 0.3));
    return [{ x: w / 2 - wo / 2, z: -d / 2 + dof / 2, w: wo, d: dof, main: true, pemexD: d, pemexW: w }];
  }
  return null;
}

// the porch each layout wants (null: the usual rules)
export function layoutPorch(lay, spec, rng) {
  const [w] = spec.size || [10, 8];
  if (UTILITY_LAYOUTS[lay]) return false;
  if (lay === 'brothel') return { roof: rng.pick(['corrugated', 'latilla']), depth: 2.2 };
  if (lay === 'gambling') return rng.chance(0.6) ? { roof: 'corrugated', depth: 2.4 } : false;
  if (['cages', 'chopshop', 'gunshop', 'bounty', 'water', 'bus', 'fuselage', 'gatehouse', 'rotunda'].includes(lay)) return false;
  if (lay === 'motel') return { roof: 'slab', length: w - 0.3, depth: 2.2, height: 2.6 };
  if (lay === 'fonda') return { roof: rng.pick(['latilla', 'corrugated', 'tile']), length: Math.min(w * 0.92, 12), depth: 2.8 };
  if (lay === 'curandero') return { roof: rng.pick(['latilla', 'thatch']), depth: 2.0 };
  if (lay === 'presidencia') return { roof: 'tile', length: w * 0.94, depth: 3.0 };
  if (lay === 'post') return { roof: rng.pick(['latilla', 'corrugated']), depth: 2.2 };
  if (['tortilleria', 'carniceria', 'panaderia'].includes(lay)) return rng.chance(0.5) ? { roof: rng.pick(['corrugated', 'latilla']), depth: 2.2 } : false;
  if (['gallery', 'courtyard', 'rooftop', 'diner', 'clinic', 'trading', 'tienda', 'field', 'mission', 'troje', 'station', 'herreria', 'alfareria', 'tahona', 'bodega', 'working', 'stripped', 'ruined', 'lapemex'].includes(lay)) return false;
  return null;
}

// room bays along a wall: a door and a small window per room, on every floor
export function roomBays(lo, hi, floors, fh, free, pre) {
  const out = [], span = hi - lo, n = Math.floor(span / 3.1);
  if (n < 1) return out;
  for (let f = 0; f < floors; f++) for (let i = 0; i < n; i++) {
    const um = lo + ((i + 0.5) * span) / n, base = f * fh + (f === 0 ? 0.3 : 0.05);
    const du = um - 0.55, wu = um + 0.75, ww = pre ? 1.1 : 0.75;
    if (f > 0 || free(du - 0.45, du + 0.45)) out.push({ u0: du - 0.45, u1: du + 0.45, y0: base, y1: Math.min(base + 2.05, (f + 1) * fh - 0.3), type: 'door', floor: f, room: true });
    if (f > 0 || free(wu - ww / 2, wu + ww / 2)) out.push({ u0: wu - ww / 2, u1: wu + ww / 2, y0: f * fh + 1.05 + (f === 0 ? 0.3 : 0), y1: Math.min(f * fh + 2.05 + (f === 0 ? 0.3 : 0), (f + 1) * fh - 0.35), type: 'win', floor: f, room: true });
  }
  return out;
}

// colours the layout asks for: the clinic whitewashed, the diner and motel in pre-war pastels
const PASTEL = [0xd8e8dc, 0xf0e2c0, 0xe8d0c8, 0xcfe0e4, 0xf2ead8];
export function kindColors(lay, c) {
  if (UTILITY_LAYOUTS[lay]) return utilityColors(lay, c);
  const { colors, L, finish, rng } = c, plain = ['none', 'faded'].includes(finish?.tier || 'none');
  if (lay === 'clinic') { colors.old = col(0xeeeadf, 0.01, rng); colors.neu = colors.old.clone(); L.old = 'limewash'; L.neu = 'limewash'; colors.trim = col(rng.pick([0x3a5a7a, 0x4a6a5a]), 0.03, rng); }
  if (lay === 'mission') { colors.old = col(rng.pick([0xeeeadf, 0xe8dcc4, 0xd8c8a8, 0xc8b898]), 0.02, rng); L.old = rng.chance(0.6) ? 'limewash' : 'stone'; colors.trim = col(0x4a3a2a, 0.03, rng); }
  if (lay === 'presidencia' && plain) { colors.old = col(rng.pick([0xe8d8b0, 0xd8a878, 0xe8e0d0, 0xc8d0b8]), 0.02, rng); L.old = 'plaster'; colors.trim = col(0xf0ece2, 0.01, rng); }
  if (['working', 'stripped', 'ruined', 'lapemex'].includes(lay)) { colors.old = col(lay === 'working' ? 0xf0ece2 : 0xd8d0c0, 0.02, rng); L.old = 'plaster'; colors.trim = col(0x2a7a4a, 0.03, rng); }
  if (lay === 'brothel' && plain) { colors.old = col(rng.pick([0xd88a8a, 0xc85a6a, 0xe8a8a0, 0xb84a4a]), 0.03, rng); L.old = 'plaster'; colors.trim = col(rng.pick([0x5a1a2a, 0xe8d8b0]), 0.03, rng); }
  if (lay === 'gambling' && plain) { colors.old = col(rng.pick([0x3a5a4a, 0x2a4a3a, 0x6a5a3a]), 0.03, rng); L.old = 'plaster'; colors.trim = col(0xd8b040, 0.03, rng); }
  if (lay === 'chopshop' && plain) { colors.old = col(rng.pick([0xd8d4c8, 0xc8c4b4]), 0.03, rng); colors.trim = col(0x8a2a2a, 0.03, rng); }
  if (lay === 'bounty' && plain) { colors.old = col(rng.pick([0xc8a878, 0xb89868]), 0.03, rng); colors.trim = col(0x3a2a1a, 0.03, rng); }
  if (lay === 'carniceria' && plain) { colors.old = col(rng.pick([0xe8e0d0, 0xd8c8b0]), 0.02, rng); L.old = 'plaster'; colors.trim = col(0xa82a2a, 0.03, rng); }
  if ((lay === 'diner' || lay === 'motel') && plain && !['brick', 'metal', 'timber'].includes(c.baseMat)) { colors.old = col(rng.pick(PASTEL), 0.02, rng); L.old = 'plaster'; colors.trim = col(rng.pick([0xa83a32, 0x2f6a8a, 0x3a7a5a]), 0.03, rng); }
}

// ---------------------------------------------------------------------------------------------
// dressing
const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const PRODUCE = [0xe08a20, 0xc03020, 0x3a7a2a, 0xe8d8b0, 0x4a5a2a, 0xd8b030, 0x8a2a4a];
const HERBS = [0x6a7a3a, 0x8a7a4a, 0x5a6a32, 0xa08a50, 0x7a5a3a];

export function dressKind(b, c, masses, info, S, H) {
  const lay = c.layout; if (!lay) return;
  const { rng } = c, m = masses.find((q) => q.main) || masses[0], mr = (m.rot || 0) * Math.PI / 180;
  const front = info.walls.front, fd = info.openings.find((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && o.side === 'front' && o.main);
  const at = (o, u, out) => [o.x + o.tx * u + o.nx * out, o.z + o.tz * u + o.nz * out];
  const R = (o) => Math.atan2(o.nx, o.nz);
  // a sign in mass-local coordinates (b is pushed into the main mass)
  const sign = (text, x, y, z, ry, w, h, style, opts = {}) => {
    const p = c.toLocal(x, y, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry));
    info.signs.push({ text, x: p[0], y: p[1], z: p[2], ry: Math.atan2(nx, nz), w, h, style, rng: new RNG(`${c.spec.id}:${text}:${x.toFixed(1)}`), opts });
  };
  const light = (x, y, z, kind, essential = false, electric = true, color = LIGHT_COL.incandescent, radius = 6, intensity = 0.9) => {
    const p = c.toLocal(x, y, z), r = c.lightR(essential, electric);
    info.lights.push({ x: p[0], y: p[1], z: p[2], color, radius, intensity, kind, r, flicker: !electric });
    return r;
  };
  const lit = (electric) => c.powered || (!electric && rng.chance(0.6));
  const F = c.floors0 || 1, fh = c.fh, roofY = F * fh;
  c._mass = m; c._mr = mr;
  const atM = (o, u, out) => toMassL(c, b, ...at(o, u, out)), RM = (o) => R(o) - mr;
  b.pushT(m.x, 0, m.z, mr);
  const w = m.w, d = m.d, zf = d / 2; // mass-local: front face at z = +d/2, x along the front
  const xu = (u) => -u; // frontSpace u runs along -x on the front face
  const takeX = (x0, x1, d0, d1) => S && S.takeGround(xu(x1), xu(x0), d0, d1);
  const doorX = fd ? xu(S ? S.U(fd) : 0) : 0;

  switch (lay) {
    case 'courtyard': {
      const cw = m.court.w, cd = m.court.d, z0 = -d / 2 - cd / 2; // patio centre, behind the front range
      b.t('saltillo').box(0, -0.3, z0, cw + 0.1, 0.8, cd + 0.1, col(0xb06a48, 0.04, rng));
      // fountain (or a well when it's poor)
      const poor = ['none', 'faded'].includes(c.finish.tier);
      b.t('stone').cyl(0, 0.3, z0, 0.95, 1.0, 0.55, 8, col(poor ? 0xa89c88 : 0xd8d0c0, 0.03, rng));
      b.ch('water').t('plain').cyl(0, 0.52, z0, 0.82, 0.82, 0.04, 8, col(0x3a5a5a)).ch('main');
      if (!poor) { b.t('stone').cyl(0, 0.9, z0, 0.12, 0.16, 0.8, 8, col(0xd8d0c0)).cyl(0, 1.32, z0, 0.45, 0.2, 0.14, 8, col(0xd8d0c0)); }
      else { b.t('wood'); for (const sd of [-1, 1]) b.box(sd * 0.75, 1.1, z0, 0.12, 1.6, 0.12, col(WOOD.pole)); b.box(0, 1.85, z0, 1.7, 0.12, 0.12, col(WOOD.pole)); }
      // pots in the patio corners
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pot(b, rng, sx * (cw / 2 - 2.1), z0 + sz * (cd / 2 - 2.1), true);
      break;
    }
    case 'gallery': {
      // a walkway deck at every upper floor, posts to the ground, rails, a tin canopy over the top one; the stair runs up
      // the side wall in two narrow lanes: the first flight (outer lane) climbs to the first gallery, then each next
      // flight (inner lane, open treads) climbs back along the wall to a landing, and a side walkway leads to that gallery
      const dep = 1.5, lane = 0.8, gap = 0.15, ext = gap + 2 * lane + 0.15, x0 = -w / 2, x1 = w / 2 + ext, len = x1 - x0, xc = (x0 + x1) / 2, top = roofY + 0.25;
      const wc = col(WOOD.weathered, 0.05, rng), pc = col(WOOD.pole, 0.05, rng), masonry = ['adobe', 'stone', 'brick', 'block', 'concrete', 'plaster'].includes(c.newMat) && rng.chance(0.5);
      const deckC = masonry ? col(0xb8b0a0, 0.03, rng) : wc, deckT = masonry ? 'concrete' : 'wood', rc = masonry ? col(METAL.dark) : wc, railT = masonry ? 'metal' : 'wood';
      const xIn = w / 2 + gap + lane / 2, xOut = w / 2 + gap + lane * 1.5; // the two stair lanes along the side wall
      const nS = Math.max(1, Math.ceil(fh / 0.18)), rise = fh / nS, tread = Math.max(0.22, Math.min(0.29, (d - 1.2) / nS)), run = nS * tread, zb = zf - run; // zb: the back end of a flight
      const rail = (xa, za, xb, zb2, y) => { b.t(railT); const L = Math.hypot(xb - xa, zb2 - za), ry = Math.atan2(xb - xa, zb2 - za); for (const h of [0.6, 1.05]) b.box((xa + xb) / 2, y + h, (za + zb2) / 2, 0.06, 0.06, L, rc, ry); for (let t = 0; t <= L; t += 0.45) b.box(xa + (xb - xa) * (t / L), y + 0.53, za + (zb2 - za) * (t / L), 0.035, 0.95, 0.035, rc); };
      for (let fl = 1; fl < F; fl++) { // the galleries
        const y = fl * fh;
        b.t(deckT).box(xc, y + 0.05, zf + dep / 2, len, 0.2, dep, deckC);
        rail(x0 + 0.1, zf + dep - 0.1, x1 - 0.1, zf + dep - 0.1, y);
        rail(x1 - 0.06, zf + dep - 0.1, x1 - 0.06, zf + 0.05, y); // end rail
        rail(x0 + 0.06, zf + dep - 0.1, x0 + 0.06, zf + 0.05, y);
      }
      const n = Math.max(2, Math.round(len / 2.6) + 1);
      b.t(masonry ? 'plaster' : 'bark');
      for (let i = 0; i < n; i++) { const x = x0 + 0.12 + ((len - 0.24) * i) / (n - 1); if (masonry) b.box(x, top / 2, zf + dep - 0.12, 0.24, top, 0.24, c.colors.old); else b.cyl(x, top / 2, zf + dep - 0.1, 0.09, 0.1, top, 6, pc); }
      b.t('corrugated').plank([xc, top, zf - 0.05], [xc, top - 0.3, zf + dep + 0.35], len + 0.3, 0.06, col(rng.pick(ROOF.corrugated), 0.06, rng));
      // flight 1: solid, outer lane, from the ground at the back up to the first gallery at the front
      stairRun(b, xOut, zf - 0.02, 0, -1, fh + 0.15, 0, lane, deckC, deckT, false, tread);
      for (let fl = 2; fl < F; fl++) {
        const y0 = (fl - 1) * fh, y1 = fl * fh;
        stairRun(b, xIn, zb, 0, 1, y1 + 0.1, y0 + 0.1, lane, deckC, deckT, true, tread); // inner lane: up from the gallery front to the back
        // the landing at the back across both lanes, posts down to the ground, and the walkway back to the gallery
        b.t(deckT).box((xIn + xOut) / 2, y1 + 0.05, zb - 0.45, 2 * lane + 0.1, 0.16, 0.9, deckC);
        b.t(deckT).box(xOut, y1 + 0.05, (zb + zf) / 2, lane, 0.16, zf - zb, deckC);
        b.t(masonry ? 'metal' : 'bark'); for (const [px, pz] of [[xOut + lane / 2 - 0.05, zb - 0.85], [xIn - lane / 2 + 0.05, zb - 0.85], [xOut + lane / 2 - 0.05, (zb + zf) / 2]]) b.box(px, y1 / 2, pz, 0.1, y1, 0.1, masonry ? col(METAL.dark) : pc);
        rail(xOut + lane / 2, zf, xOut + lane / 2, zb - 0.85, y1); rail(xOut + lane / 2, zb - 0.85, xIn - lane / 2, zb - 0.85, y1);
      }
      takeX(x0, x1, 0, dep + 0.2);
      break;
    }
    case 'motel': {
      // parking apron with bays, and the tall roadside sign at the corner
      const az = zf + 2.2, adep = 7;
      // the parking apron and its bay lines are ground paint (world.seatStructure), not geometry
      const sx = w / 2 + 1.1, sz = az + adep - 0.6, H = 6.8;
      b.t('metal').cyl(sx, H / 2, sz, 0.12, 0.16, H, 10, col(METAL.steel));
      b.t('concrete').box(sx, 0.1, sz, 0.7, 0.4, 0.7, col(0x9a948a));
      const neon = c.powered;
      sign('MOTEL', sx, H - 0.8, sz + 0.12, 0, 3.0, 1.3, neon ? 'neon' : 'prewar', neon ? { r: c.lightR(false, true) } : { rust: true, missing: 0.15 });
      sign(rng.chance(0.5) ? 'VACANCY' : 'NO VACANCY', sx, H - 2.0, sz + 0.12, 0, 2.2, 0.5, neon ? 'neon' : 'prewar', neon ? { r: c.lightR(false, true) } : { rust: true, missing: 0.3 });
      if (neon) light(sx, H - 1.2, sz + 1.2, 'neon', false, true, LIGHT_COL.neon_red || LIGHT_COL.incandescent, 9, 1.1);
      // a drinks machine by the office door
      if (fd) { const x = doorX + 1.3; b.t('metal').box(x, 0.95, zf + 0.45, 0.9, 1.7, 0.7, col(rng.pick([0xa83a32, 0x2f5a8a])), 0); }
      break;
    }
    case 'tienda': {
      shutters(b, c, info, rng);
      // produce crates out front either side of the door
      for (const sd of [-1, 1]) {
        if (!S) break;
        const u = S.findGround(S.U(fd || front) + sd * 1.6, 1.3, 0.3, 1.1); if (u == null) continue;
        S.takeGround(u - 0.65, u + 0.65, 0.3, 1.1);
        const [x, z] = atM(front, u, 0.7); crates(b, rng, x, z, RM(front));
      }
      priceBoards(info, front, S, fd, rng, c);
      break;
    }
    case 'trading': {
      shutters(b, c, info, rng);
      // loading dock along the free side of the front, steps at its end; a scale and a hitching rail
      const side = doorX > 0 ? -1 : 1, xa = side > 0 ? doorX + 1.0 : -w / 2 + 0.3, xb = side > 0 ? w / 2 - 0.3 : doorX - 1.0, len = xb - xa;
      if (len > 2.2) {
        const xc = (xa + xb) / 2, dep = 2.2, ph = 1.0;
        b.t('wood').box(xc, (ph - 0.5) / 2, zf + dep / 2, len, ph + 0.5, dep, col(WOOD.weathered, 0.05, rng));
        b.t('wood').box(xc, ph - 0.05, zf + dep - 0.05, len, 0.12, 0.12, col(WOOD.dark, 0.05, rng));
        stairRun(b, side > 0 ? xb : xa, zf + dep - 0.6, side, 0, ph, 0, 1.0, col(WOOD.weathered, 0.05, rng), 'wood', true);
        for (let k = 0; k < Math.min(5, Math.floor(len / 1.2)); k++) { const x = xa + 0.6 + k * 1.15 + rng.range(-0.1, 0.1); if (k % 2) b.t('metal').cyl(x, ph + 0.45, zf + 0.6 + rng.range(0, 0.8), 0.3, 0.3, 0.9, 10, col(rng.pick([0x5a6a4a, 0x8a3a2a, 0x3a4a5a]), 0.05, rng)); else b.t('wood').box(x, ph + 0.3, zf + 0.7 + rng.range(0, 0.6), 0.7, 0.6, 0.6, col(WOOD.fresh, 0.06, rng), rng.range(-0.3, 0.3)); }
        // platform scale at the dock end
        const kx = side > 0 ? xb - 0.9 : xa + 0.9, kz = zf + dep + 1.2;
        b.t('metal').box(kx, 0.08, kz, 1.4, 0.16, 1.0, col(METAL.dark)).box(kx + side * 0.75, 0.75, kz - 0.4, 0.1, 1.4, 0.1, col(METAL.dark)).box(kx + side * 0.75, 1.5, kz - 0.4, 0.4, 0.4, 0.12, col(0xd8d0b8));
        takeX(xa - 0.3, xb + 0.3, 0, dep + 2.0);
      }
      // hitching rail and a trough out by the street
      const hz = zf + 4.6, hx = doorX * 0.3;
      b.t('bark'); for (const sd of [-1, 1]) b.cyl(hx + sd * 1.4, 0.55, hz, 0.08, 0.09, 1.1, 6, col(WOOD.pole));
      b.t('wood').plank([hx - 1.6, 1.0, hz], [hx + 1.6, 1.0, hz], 0.1, 0.1, col(WOOD.pole));
      b.t('wood').box(hx + 2.6, 0.3, hz, 1.6, 0.55, 0.6, col(WOOD.dark, 0.05, rng)); b.ch('water').t('plain').box(hx + 2.6, 0.5, hz, 1.45, 0.02, 0.45, col(0x3a5048)).ch('main');
      priceBoards(info, front, S, fd, rng, c);
      break;
    }
    case 'clinic': case 'field': {
      // red crosses: on the front wall, and big on a flat roof so it reads from above
      if (S) {
        for (let y = Math.min(front.top - 1.4, 2.6); y >= 1.6; y -= 0.1) { const u = S.findWall(S.U(fd || front) + 1.6, 1.1, y, y + 1.1); if (u != null) { S.takeWall(u - 0.6, u + 0.6, y - 0.05, y + 1.15); const [x, z] = atM(front, u, 0.014); cross(b, x, y + 0.55, z, RM(front), 1.0, false); break; } }
      }
      if (false) { // (the big painted roof cross: removed)
        const y = roofY + 0.06;
        b.t('limewash').box(0, y, 0, Math.min(w, d) * 0.55, 0.03, Math.min(w, d) * 0.55, col(0xeeeadf));
        cross(b, 0, y + 0.02, 0, 0, Math.min(w, d) * 0.45, true);
      }
      // bench by the door, generator by the side wall, sheets drying on a line
      if (fd && S) { const u = S.findGround(S.U(fd) - 1.6, 1.5, 0.25, 0.75); if (u != null) { S.takeGround(u - 0.75, u + 0.75, 0.25, 0.75); const [x, z] = atM(front, u, 0.45); bench(b, x, z, RM(front), rng); } }
      const sw = info.walls.right || info.walls.left;
      if (sw && c.powered) { const [x, z] = at(sw, -sw.L / 4, 0.9), p = toMass(c, b, x, z); b.t('metal').box(p[0], 0.45, p[1], 1.1, 0.9, 0.7, col(rng.pick([0x5a6a4a, 0x8a7a3a]), 0.05, rng), mr0(sw, c, b)); }
      const lw = info.walls.left || info.walls.right;
      if (lw) { const [ax, az] = at(lw, -lw.L * 0.35, 2.6), [bx, bz] = at(lw, lw.L * 0.35, 2.6); sheets(b, toMass(c, b, ax, az), toMass(c, b, bx, bz), rng); }
      if (lay === 'field') { // canvas ward tents along the other side
        const tw = info.walls.right || info.walls.left;
        if (tw) for (let k = 0; k < 2 + (tw.L > 9 ? 1 : 0); k++) {
          const u = -tw.L / 2 + 2 + k * 4.3; if (u > tw.L / 2) break;
          const [x, z] = at(tw, u, 4.2), p = toMass(c, b, x, z);
          tent(b, p[0], p[1], mr0(tw, c, b), 3.2, 5.0, col(rng.pick([0xc8bc98, 0xb8ac88, 0xd8d0b8]), 0.04, rng), rng);
        }
      }
      break;
    }
    case 'curandero': {
      // herb bundles hung along the porch beam, a drying rack, ollas by the door, a candle niche
      const P = info.porch, len = Math.min(w * 0.9, w - 0.2);
      if (P) for (let x = -len / 2 + 0.3; x < len / 2 - 0.2; x += 0.32 + rng.range(0, 0.12)) {
        const y = P.h + 0.15, hc = col(rng.pick(HERBS), 0.06, rng);
        herbBundle(b, rng, x, y, zf + P.depth, 0.36); void hc;
      }
      const sw = info.walls.right || info.walls.left;
      if (sw) { const [x, z] = at(sw, 0, 1.6), p = toMass(c, b, x, z); rack(b, p[0], p[1], mr0(sw, c, b), rng); }
      for (let k = 0; k < 4; k++) { const x = doorX + (k < 2 ? -1 : 1) * (0.9 + (k % 2) * 0.45), r = rng.range(0.16, 0.26); b.t('plain').blob(x, r * 0.9, zf + (P ? 0.4 : 0.35) + rng.range(0, 0.3), r * 2, r * 1.8, r * 2, col(rng.pick(TERRA), 0.05, rng), 'ico'); }
      if (S) { const u = S.findWall(S.U(fd || front) + 1.4, 0.4, 1.3, 1.8); if (u != null) { S.takeWall(u - 0.2, u + 0.2, 1.3, 1.8); const [x, z] = at(front, u, 0.02), p = toMass(c, b, x, z); b.t('plain').box(p[0], 1.55, p[1] + 0.02, 0.36, 0.45, 0.06, col(0x3a2a20)); b.ch('lamp').w(c.lightR(false, false)).t('plain').box(p[0], 1.42, p[1] + 0.06, 0.05, 0.12, 0.05, 0xffd890).w(-1).ch('main'); } }
      break;
    }
    case 'fonda': {
      const P = info.porch, len = Math.min(w * 0.92, 12);
      if (P) {
        const xs = []; for (let x = -len / 2 + 1.1; x <= len / 2 - 1.0; x += 2.1) if (Math.abs(x - doorX) > 1.3) xs.push(x);
        for (const x of xs) table(b, x, zf + 1.4, rng, rng.chance(0.5) ? 'tin' : 'wood');
        const on = lit(true) || rng.chance(0.5);
        stringLights(b, c, info, [-len / 2, P.h + 0.15, zf + P.depth], [len / 2, P.h + 0.15, zf + P.depth], 0.18, on, light);
        // chalkboard out by the street
        b.t('wood').box(len / 2 + 0.4, 0.45, zf + P.depth + 0.6, 0.6, 0.9, 0.04, col(WOOD.dark), 0.4, -0.18);
        sign(rng.pick(['HOY\nPOZOLE · TACOS', 'MENÚ\nCALDO · FRIJOLES', 'COMIDA CORRIDA\n3 TIEMPOS', 'HOY\nIGUANA · ARROZ']), len / 2 + 0.4 + Math.sin(0.4) * 0.03, 0.5, zf + P.depth + 0.6 + Math.cos(0.4) * 0.03, 0.4, 0.5, 0.6, 'chalk', { tilt: -0.18 });
      }
      // drum stove with a comal at the side, ollas
      const sx = w / 2 + 0.9;
      b.t('rust').cyl(sx, 0.45, zf - 1.0, 0.3, 0.3, 0.9, 12, col(0x6a4a3a, 0.05, rng));
      b.t('metal').cyl(sx, 0.93, zf - 1.0, 0.42, 0.42, 0.04, 14, col(0x2a2826));
      for (let k = 0; k < 3; k++) { const r = rng.range(0.18, 0.26); b.t('plain').blob(sx + rng.range(-0.3, 0.5), r * 0.9, zf - 2.0 - k * 0.5, r * 2, r * 1.8, r * 2, col(rng.pick(TERRA), 0.05, rng), 'ico'); }
      break;
    }
    case 'diner': {
      const ch = c.colors.chrome;
      b.t('metal');
      for (const y of [0.95, Math.min(fh - 0.3, front?.wallH ? front.wallH - 0.3 : fh - 0.3)]) { b.box(0, y, zf + 0.04, w + 0.02, 0.09, 0.05, ch); b.box(w / 2 + 0.04, y, 0, 0.05, 0.09, d + 0.02, ch); b.box(-w / 2 - 0.04, y, 0, 0.05, 0.09, d + 0.02, ch); }
      // a couple of tables under umbrellas at the side
      for (let k = 0; k < 2; k++) { const x = w / 2 + 1.6, z = zf - 1.2 - k * 2.6; table(b, x, z, rng, 'tin'); umbrella(b, x, z, rng); }
      break;
    }
    case 'rooftop': {
      // the roof is the café: tables under umbrellas, string lights between corner poles, an outside stair
      const y0 = roofY + 0.05, iw = w - 1.6, id = d - 1.6;
      const nx = Math.max(1, Math.floor(iw / 2.6)), nz = Math.max(1, Math.floor(id / 2.8));
      b.pushT(0, y0, 0, 0);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = -iw / 2 + ((i + 0.5) * iw) / nx, z = -id / 2 + ((j + 0.5) * id) / nz; table(b, x, z, rng, rng.chance(0.5) ? 'tin' : 'wood'); if ((i + j) % 2 === 0) umbrella(b, x, z, rng); }
      b.t('bark'); const pts = [[-w / 2 + 0.4, -d / 2 + 0.4], [w / 2 - 0.4, -d / 2 + 0.4], [w / 2 - 0.4, d / 2 - 0.4], [-w / 2 + 0.4, d / 2 - 0.4]];
      for (const [x, z] of pts) b.cyl(x, 1.3, z, 0.05, 0.06, 2.6, 6, col(WOOD.pole));
      b.pop();
      const on = lit(true) || rng.chance(0.5);
      for (const [a, bb] of [[0, 2], [1, 3], [0, 1], [3, 2]]) stringLights(b, c, info, [pts[a][0], y0 + 2.55, pts[a][1]], [pts[bb][0], y0 + 2.55, pts[bb][1]], 0.35, on, light);
      // two runs of outside stair up the side wall: ground → first floor, first floor → roof
      const sc = col(0xb8b0a0, 0.03, rng);
      const zl = zf - 1.2, n2 = Math.ceil((roofY - fh) / 0.18), zs = zl - n2 * 0.29;
      b.t('concrete').box(w / 2 + 1.15, (fh - 0.3) / 2, zf - 0.6, 2.2, fh + 0.3, 1.2, sc); // landing
      stairRun(b, w / 2 + 0.6, zl, 0, -1, fh, 0, 1.0, sc, 'concrete');
      stairRun(b, w / 2 + 1.7, zs, 0, 1, roofY, fh, 1.0, sc, 'concrete');
      b.t('concrete').box(w / 2 + 1.1, roofY - 0.1, zs - 0.25, 2.3, 0.2, 0.5, sc); // onto the roof
      break;
    }
  }
  b.pop();
}

// ---------------------------------------------------------------------------------------------
// pieces (b in any frame; x, z, ry in that frame)
function pot(b, rng, x, z, big) {
  const r = big ? rng.range(0.28, 0.36) : rng.range(0.16, 0.22), h = r * 1.9;
  b.t('plain').cyl(x, h / 2, z, r, r * 0.72, h, 9, col(rng.pick(TERRA), 0.05, rng));
  plant(b, rng.weighted({ geranium: 2, bougainvillea: big ? 1 : 0, shrub: 1, aloe: 1 }), x, h - 0.02, z, r * 3, rng);
}
function cross(b, x, y, z, ry, s, flat) {
  const rc = col(0xb02020, 0.02);
  b.t('plain');
  if (flat) { b.box(x, y, z, s, 0.03, s * 0.3, rc, ry); b.box(x, y, z, s * 0.3, 0.03, s, rc, ry); }
  else { b.box(x, y, z, s, s * 0.3, 0.02, rc, ry); b.box(x, y, z, s * 0.3, s, 0.02, rc, ry); }
}
function bench(b, x, z, ry, rng) {
  const wc = col(rng.pick([WOOD.weathered, WOOD.dark, 0x3a5a6a]), 0.05, rng);
  b.t('wood').box(x, 0.45, z, 1.4, 0.06, 0.4, wc, ry);
  for (const sd of [-1, 1]) b.box(x + Math.cos(ry) * sd * 0.6, 0.22, z - Math.sin(ry) * sd * 0.6, 0.06, 0.44, 0.36, wc, ry);
}
function crates(b, rng, x, z, ry) {
  const wc = col(WOOD.fresh, 0.08, rng), ca = Math.cos(ry), sa = Math.sin(ry);
  for (const sd of [-0.33, 0.33]) {
    const cx = x + ca * sd, cz = z - sa * sd, pc = col(rng.pick(PRODUCE), 0.06, rng);
    b.t('wood').box(cx, 0.3, cz, 0.58, 0.6, 0.44, wc, ry, -0.12);
    b.t('plain'); for (let k = 0; k < 7; k++) b.blob(cx + rng.range(-0.2, 0.2), 0.62 + rng.range(0, 0.06), cz + rng.range(-0.14, 0.14), 0.13, 0.12, 0.13, pc, 'ico');
  }
}
function table(b, x, z, rng, kind) {
  const tc = kind === 'tin' ? col(rng.pick([0xc8a040, 0xa83a32, 0x2f6a8a, 0xd8d0c0]), 0.04, rng) : col(WOOD.weathered, 0.05, rng);
  b.t(kind === 'tin' ? 'metal' : 'wood').cyl(x, 0.74, z, 0.45, 0.45, 0.04, 14, tc).cyl(x, 0.37, z, 0.04, 0.05, 0.72, 6, col(METAL.dark));
  const n = rng.int(2, 4), a0 = rng.next() * Math.PI;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, cx = x + Math.cos(a) * 0.72, cz = z + Math.sin(a) * 0.72, ry = Math.atan2(x - cx, z - cz);
    b.box(cx, 0.44, cz, 0.42, 0.05, 0.42, tc, ry);
    b.box(cx - Math.sin(ry) * 0.2, 0.7, cz - Math.cos(ry) * 0.2, 0.42, 0.5, 0.04, tc, ry);
    b.box(cx, 0.22, cz, 0.36, 0.44, 0.36, tc.clone().offsetHSL(0, 0, -0.12), ry);
  }
}
function umbrella(b, x, z, rng) {
  b.t('metal').cyl(x, 1.15, z, 0.025, 0.025, 2.3, 6, col(METAL.dark));
  b.t('fabric').cone(x, 2.2, z, 1.2, 0.45, 8, col(rng.pick([0xa83a32, 0xe8e0d0, 0x2f6a8a, 0xd8a040, 0x5a8a4a]), 0.04, rng));
}
function stringLights(b, c, info, A, B, sag, on, light) {
  const L = Math.hypot(B[0] - A[0], B[2] - A[2]), n = Math.max(4, Math.round(L / 0.6));
  const P = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  b.t('plain'); for (let k = 0; k < n; k++) b.beam(P(k / n), P((k + 1) / n), 0.01, 3, col(0x2a2826));
  const r = on ? light(...P(0.5), 'lamp', false, true, LIGHT_COL.incandescent, Math.min(9, 4 + L / 2), 0.75) : 9;
  b.ch('lamp').w(r).t('plain');
  for (let k = 1; k < n; k++) { const p = P(k / n); b.box(p[0], p[1] - 0.07, p[2], 0.07, 0.09, 0.07, 0xfff0c0); }
  b.w(-1).ch('main');
}
function sheets(b, A, B, rng) {
  b.t('bark'); for (const p of [A, B]) b.cyl(p[0], 1.0, p[1], 0.05, 0.06, 2.0, 6, col(WOOD.pole));
  b.t('plain').beam([A[0], 1.9, A[1]], [B[0], 1.9, B[1]], 0.008, 3, col(0x4a4a44));
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ry = Math.atan2(B[1] - A[1], B[0] - A[0]), n = Math.floor(L / 1.15);
  b.t('fabric'); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t; b.box(x, 1.32, z, 0.95, 1.15, 0.02, col(rng.pick([0xf2f0ea, 0xe8e6de, 0xdcd8cc]), 0.01, rng), -ry); }
}
function rack(b, x, z, ry, rng) {
  const ca = Math.cos(ry), sa = Math.sin(ry);
  b.t('bark'); for (const sd of [-1, 1]) b.cyl(x + ca * sd * 1.1, 0.8, z - sa * sd * 1.1, 0.05, 0.06, 1.6, 6, col(WOOD.pole));
  b.t('wood').box(x, 1.55, z, 2.3, 0.06, 0.06, col(WOOD.pole), ry);
  for (let k = 0; k < 7; k++) { const u = -0.95 + k * 0.32; herbBundle(b, rng, x + ca * u, 1.55, z - sa * u, 0.38); }
}
function tent(b, x, z, ry, w, d, cc, rng) {
  const ca = Math.cos(ry), sa = Math.sin(ry), wallH = 1.3, ridge = 2.5;
  const L = (u, v, y) => [x + ca * u + sa * v, y, z - sa * u + ca * v]; // u across, v along (outward)
  b.t('fabric').box(x, wallH / 2, z, w, wallH, d, cc, ry);
  for (const sd of [-1, 1]) b.quad(L(sd * w / 2 + sd * 0.1, -d / 2 - 0.15, wallH - 0.05), L(sd * w / 2 + sd * 0.1, d / 2 + 0.15, wallH - 0.05), L(0, d / 2 + 0.15, ridge), L(0, -d / 2 - 0.15, ridge), cc.clone().offsetHSL(0, 0, sd * 0.03));
  for (const v of [-d / 2, d / 2]) b.tri(L(-w / 2, v, wallH), L(w / 2, v, wallH), L(0, v, ridge), cc);
  // red cross on the outward end, guy lines
  const [ex, , ez] = L(0, d / 2 + 0.02, 0); cross(b, ex, 1.45, ez, ry, 0.7, false);
  b.t('plain'); for (const sd of [-1, 1]) for (const v of [-d / 3, d / 3]) { const a = L(sd * (w / 2 + 0.1), v, wallH), g = L(sd * (w / 2 + 1.0), v, 0.02); b.beam(a, g, 0.008, 3, col(0x8a8270)); }
  void rng;
}
// a solid stair run: from (x, z) at height yTop going along (dx, dz) down to yBot; open = a stringer stair
function stairRun(b, x, z, dx, dz, yTop, yBot, w, color, layer, open = false, tread = 0.29) {
  const H = yTop - yBot, n = Math.max(1, Math.ceil(H / 0.18)), rise = H / n, ry = Math.atan2(dx, dz);
  b.t(layer);
  for (let k = 0; k < n; k++) {
    const top = yTop - (k + 1) * rise + rise, dd = (k + 0.5) * tread;
    if (open) b.box(x + dx * dd, top - 0.04, z + dz * dd, w, 0.08, tread + 0.02, color, ry);
    else b.box(x + dx * dd, (top - 0.3) / 2, z + dz * dd, w, top + 0.3, tread + 0.01, color, ry);
  }
  if (open) for (const sd of [-1, 1]) { const ox = Math.cos(ry) * sd * (w / 2), oz = -Math.sin(ry) * sd * (w / 2); b.plank([x + ox, yTop, z + oz], [x + ox + dx * n * tread, yBot, z + oz + dz * n * tread], 0.06, 0.25, color); }
}
// steel roll shutters over the shopfront openings: the drum box above, guide rails, some half down
function shutters(b, c, info, rng) {
  const sc = col(rng.pick([0x8a8f8c, 0x6a7a7a, 0x9a5d3e]), 0.05, rng);
  for (const o of info.openings) {
    if (o.side !== 'front' || !o.main || o.floor !== 0 || !['store', 'door', 'win'].includes(o.type)) continue;
    const ry = Math.atan2(o.nx, o.nz), p = (out, y, u = 0) => [o.x + o.nx * out + o.tx * u, y, o.z + o.nz * out + o.tz * u];
    // info.openings are structure-local; b is pushed into the main mass: undo it for these
    const P = (q) => toMassL(c, b, q[0], q[2]);
    const top = o.y1 + 0.2, [hx, hz] = P(p(0.16, 0));
    const ryM = ry - (c._mr || 0);
    b.t('metal').box(hx, top, hz, o.w + 0.25, 0.3, 0.26, sc, ryM);
    for (const sd of [-1, 1]) { const [gx, gz] = P(p(0.06, 0, sd * (o.w / 2 + 0.06))); b.box(gx, (o.y0 + top) / 2, gz, 0.06, top - o.y0, 0.07, sc.clone().offsetHSL(0, 0, -0.06), ryM); }
    if (rng.chance(0.4)) { const hh = (o.y1 - o.y0) * rng.range(0.25, 0.5), [sx, sz] = P(p(0.08, 0)); b.t('corrugated').box(sx, o.y1 - hh / 2, sz, o.w, hh, 0.03, sc, ryM); }
  }
}
function priceBoards(info, front, S, fd, rng, c) {
  if (!S || !fd) return;
  const items = ['HUEVO', 'FRIJOL', 'TORTILLA', 'AGUA', 'SAL', 'MAÍZ', 'CHILE', 'JABÓN', 'PILAS', 'CERILLOS'];
  for (const sd of [-1, 1]) {
    if (!rng.chance(0.7)) continue;
    const u = S.findWall(S.U(fd) + sd * (fd.w / 2 + 0.7), 0.62, 1.2, 1.85); if (u == null) continue;
    S.takeWall(u - 0.33, u + 0.33, 1.2, 1.85);
    const t = [0, 1, 2].map(() => `${rng.pick(items)} ${rng.int(1, 9)}`).join('\n'), ry = Math.atan2(front.nx, front.nz);
    info.signs.push({ text: t, x: front.x + front.tx * u + front.nx * 0.04, y: 1.52, z: front.z + front.tz * u + front.nz * 0.04, ry, w: 0.58, h: 0.62, style: rng.chance(0.5) ? 'chalk' : 'painted', rng: new RNG(`${c.spec.id}:price${sd}`), opts: { bg: '#2a2a28' } });
  }
}
// structure-local (x, z) -> the main mass frame b is pushed into
function toMassL(c, b, x, z) { const m = c._mass, r = c._mr || 0, dx = x - m.x, dz = z - m.z; return [dx * Math.cos(r) - dz * Math.sin(r), dx * Math.sin(r) + dz * Math.cos(r)]; }
const toMass = (c, b, x, z) => toMassL(c, b, x, z);
const mr0 = (wall, c) => Math.atan2(wall.nx, wall.nz) - (c._mr || 0);

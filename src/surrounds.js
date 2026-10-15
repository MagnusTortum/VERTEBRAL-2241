// What people build around their buildings: yards, gardens, pens, work yards, patios, waystation
// compounds — rolled per plot from building kind, density, wealth and (for keyed buildings) the
// owner's trade. Space-aware: a yard takes the free ground behind (or beside) the building; with no
// room left, a flat-roofed building gets a roof garden / rooftop storage instead.
import { RNG, deg } from './rng.js';
import { Raster, toWorld, toLocal, obbCorners, pointInPoly, segDist } from './geo.js';
import { vIntervals, band } from './parcels.js';
import { roofTop, KIND_ROOF } from './buildings.js';
import { densityField, modeOf } from './layout.js';

const TRADES = [
  ['waystation', /waystation|hermandad|caravanserai|posada|travell?ers'? (shelter|rest)|\binn\b/],
  ['butcher', /butcher|carnicer|slaughter/],
  ['smith', /blacksmith|\bsmith\b|herrer|forge|farrier/],
  ['tanner', /tanner|tannery|curtid|leather/],
  ['farmer', /farmer|campesin|rancher|\branch\b|grower|milpa/],
  ['healer', /healer|doctor|curander|herbal|medic|clinic|partera/],
  ['mechanic', /mechanic|repair|garage|tinker|salvag|junk/],
  ['potter', /potter|alfarer|kiln|ceramic/],
  ['carpenter', /carpent|carpinter|joiner|cooper/],
  ['brewer', /brewer|mezcal|distill|tequila|cantina|tavern|saloon/],
  ['trader', /trader|merchant|comerciant|tienda|general store|shopkeep|trading post/],
];
export function tradeOf(s) {
  const txt = [s.trade, s.stats?.owner, s.stats?.occupation, s.name, ...(Array.isArray(s.stats?.gm_notes) ? s.stats.gm_notes : [s.stats?.gm_notes])].filter(Boolean).join(' ').toLowerCase();
  if (!txt) return null;
  for (const [t, re] of TRADES) if (re.test(txt)) return t;
  return null;
}

// min depth, wanted depth, side extension, rooftop fallback, label
const RECIPES = {
  garden:     { min: 3, want: [4, 8], ext: 3, roof: 'garden', label: 'Yard with a kitchen garden' },
  homework:   { min: 3, want: [4, 7], ext: 2, roof: 'storage', label: 'Yard used for a home trade' },
  workyard:   { min: 4, want: [6, 10], ext: 3, label: 'Work yard' },
  storage:    { min: 2.5, want: [3, 6], ext: 2, roof: 'storage', label: 'Storage yard' },
  pen:        { min: 5, want: [6, 10], ext: 3, label: 'Yard with an animal pen' },
  patio:      { min: 3.5, want: [4, 7], ext: 2, roof: 'terrace', label: 'Back patio' },
  bare:       { min: 2, want: [3, 5], ext: 1, label: 'Bare yard' },
  waystation: { min: 8, want: [12, 18], ext: 5, label: 'Compound: corral, common ramada, storage' },
  graveyard:  { min: 5, want: [6, 10], ext: 2, label: 'Churchyard graves' },
  field:      { min: 6, want: [10, 20], ext: 6, label: 'Field plot' },
  butcher:    { min: 5, want: [6, 9], ext: 3, label: 'Slaughter yard' },
  smith:      { min: 3.5, want: [4, 7], ext: 2, label: 'Forge yard' },
  tanner:     { min: 5, want: [6, 9], ext: 3, label: 'Tanning yard' },
  farmer:     { min: 6, want: [10, 18], ext: 6, label: 'Field plot and pen' },
  healer:     { min: 3, want: [4, 7], ext: 2, roof: 'garden', label: 'Herb garden' },
  potter:     { min: 3.5, want: [4, 7], ext: 2, label: 'Kiln yard' },
  carpenter:  { min: 3.5, want: [4, 7], ext: 2, label: 'Timber yard' },
  brewer:     { min: 3, want: [4, 7], ext: 2, roof: 'storage', label: 'Barrel yard' },
  trader:     { min: 3, want: [4, 7], ext: 2, roof: 'storage', label: 'Goods yard' },
};
const TRADE_RECIPE = { waystation: 'waystation', butcher: 'butcher', smith: 'smith', tanner: 'tanner', farmer: 'farmer', healer: 'healer', mechanic: 'workyard', potter: 'potter', carpenter: 'carpenter', brewer: 'brewer', trader: 'trader' };
const KIND_TABLE = {
  house: { garden: 35, homework: 12, storage: 10, pen: 10, bare: 12, none: 14 },
  shop: { storage: 40, bare: 20, garden: 12, none: 28 },
  cantina: { patio: 45, storage: 30, none: 25 },
  workshop: { workyard: 60, storage: 20, none: 20 },
  garage: { workyard: 70, none: 30 },
  warehouse: { storage: 65, none: 35 },
  barn: { pen: 55, field: 25, none: 20 },
  shelter: { waystation: 85, bare: 15 },
  chapel: { garden: 40, graveyard: 35, none: 25 },
  hall: { bare: 40, garden: 20, none: 40 },
  office: { bare: 40, garden: 20, none: 40 },
};
const ROOF_LABEL = { garden: 'Roof garden', storage: 'Rooftop storage', terrace: 'Roof terrace' };
const SKIP_KINDS = new Set(['shed', 'outhouse', 'kiosk', 'tower', 'ruin', 'canopy']);

function fenceFor(s, S, mode, rng) {
  if (mode === 'attached') return [rng.weighted({ adobe: 3, block: 2, stone: 1 }), 2.1];
  const t = ['dead_broke', 'poor'].includes(S.wealth) ? { ocotillo: 3, scrap: 2, pole: 1.5, wire: 1, stone_low: 1, stone_ruin: 0.6, wood_old: 0.8 }
    : S.wealth === 'struggling' ? { ocotillo: 2, adobe: 2, stone_low: 2, wood_old: 1, pole: 1 }
    : { adobe: 3, block: 2, stone_low: 1.5, wood: 1 };
  if (s.material === 'block' || s.material === 'concrete') t.block = (t.block || 0) + 2;
  if (s.material === 'stone') t.stone_low = (t.stone_low || 0) + 2;
  const type = rng.weighted(t);
  return [type, type === 'adobe' || type === 'block' ? rng.range(1.4, 1.9) : undefined];
}

// ------------------------------------------------------------------ yard frame
// origin on the building wall, v = distance away from the building, u along the wall
class Yard {
  constructor(o, r, L, ua, ub, D) { Object.assign(this, { o, r, L, ua, ub, D, W: ub - ua, deg: (r * 180) / Math.PI }); this.obst = []; }
  P(u, v) { const [x, z] = toWorld(u, v, this.r); return [this.o[0] + x, this.o[1] + z]; }
  rect(u0, u1, v0, v1) { return [this.P(u0, v0), this.P(u1, v0), this.P(u1, v1), this.P(u0, v1)]; }
  poly() { return this.rect(this.ua, this.ub, 0, this.D); }
  free(u0, u1, v0, v1) {
    if (u0 < this.ua + 0.15 || u1 > this.ub - 0.15 || v0 < 0.25 || v1 > this.D - 0.15) return false;
    return !this.obst.some((q) => u0 < q[1] && u1 > q[0] && v0 < q[3] && v1 > q[2]);
  }
  claim(u0, u1, v0, v1) { this.obst.push([u0, u1, v0, v1]); }
}

export function planSurrounds(world) {
  const spec = world.spec, T = world.terrain, S = spec.settlement || {};
  const out = { fields: [], walls: [], props: [], structures: [], plants: [] };
  const occ = new Raster(T.W, T.D);
  world.occ = occ;
  for (const r of world.roads) occ.path(r.samples, r.hw + 0.5);
  for (const s of world.structures) for (const m of s._masses) occ.obb(m, 0.2);
  for (const f of world.fields) occ.poly(f.poly);
  for (const w of spec.walls || []) occ.path(simplePath(w.closed ? [...w.path, w.path[0]] : w.path), 0.5);
  for (const p of spec.props || []) { const at = world.propAt(p); if (at) occ.circle(at[0], at[1], 1.0); }
  for (const c of world.camps || []) occ.circle(c.at[0], c.at[1], c.radius || 8);
  const fenced = []; // world segments already fenced/walled
  for (const w of spec.walls || []) { const p = w.closed ? [...w.path, w.path[0]] : w.path; for (let i = 0; i < p.length - 1; i++) fenced.push([p[i], p[i + 1]]); }
  const field = densityField(spec, world.seed);
  const inMap = (x, z) => Math.abs(x) < T.W / 2 - 3 && Math.abs(z) < T.D / 2 - 3;

  const jobs = [];
  for (const s of world.structures) {
    if (s.surround === false || SKIP_KINDS.has(s.kind) || ['ruin', 'stripped'].includes(s.origin) || s._sub) continue;
    if (!s.auto && s.surround == null) continue; // authored buildings opt in with `surround`
    const rng = new RNG(`${world.seed}:yard:${s.id}`);
    const D = s._density ?? field(s.at[0], s.at[1]);
    const mode = s._mode || s.placement || modeOf(D);
    const trade = tradeOf(s);
    let recipe = typeof s.surround === 'string' ? s.surround : trade && TRADE_RECIPE[trade] && (trade !== 'brewer' || s.kind === 'cantina' || rng.chance(0.6)) ? TRADE_RECIPE[trade] : null;
    if (!recipe) {
      const t = { ...(KIND_TABLE[s.kind] || KIND_TABLE.house) };
      if (mode === 'attached') { t.none = (t.none || 0) * 1.6; t.pen = (t.pen || 0) * 0.3; }
      if (mode === 'sparse') { t.none = (t.none || 0) * 0.4; t.pen = (t.pen || 0) * 1.6; t.field = (t.field || 0) + (s.kind === 'house' ? 8 : 0); }
      if (['dead_broke', 'poor', 'struggling'].includes(S.wealth)) { t.garden = (t.garden || 0) * 1.3; t.bare = (t.bare || 0) * 1.3; }
      recipe = rng.weighted(t);
    }
    if (recipe === 'none' && s._lot && rng.chance(0.7)) recipe = rng.chance(0.6) ? 'bare' : 'storage';
    if (recipe === 'none') { s._surround = 'None'; continue; }
    if (s.kind === 'house' && recipe === 'field') recipe = 'farmer';
    jobs.push({ s, rng, D, mode, recipe, trade });
  }
  // big compounds first, they need the room
  jobs.sort((a, b) => (RECIPES[b.recipe]?.min || 0) - (RECIPES[a.recipe]?.min || 0));

  for (const J of jobs) {
    const { s, rng, mode } = J;
    const rec = RECIPES[J.recipe];
    if (!rec) continue;
    const yard = s._lot ? lotYard(s, rec) : findYard(s, rec, mode, occ, rng, inMap);
    const flatOK = !KIND_ROOF[s.kind] && (!s.roof || s.roof === 'flat') && !['timber', 'metal'].includes(s.material) && (s.shape || 'rect') === 'rect' && !s.masses;
    const roofFirst = mode === 'attached' && rec.roof && flatOK && rng.chance(0.25);
    if (yard && !roofFirst) {
      s.backDoor = true;
      occ.poly(yard.poly());
      fillYard(J, yard, out, world, S, fenced, rng);
      s._surround = rec.label;
    } else if (rec.roof && flatOK) {
      s.roof = 'flat';
      roofProps(s, rec.roof, out, rng);
      s._surround = ROOF_LABEL[rec.roof];
    } else s._surround = 'No room for a yard';
    if (J.trade) s._trade = J.trade;
  }
  return out;
}

// yard = the lot behind the building (full lot width, to the back lot line)
function lotYard(s, rec) {
  if (s._lot.poly) return parcelYard(s, rec);
  const l = s._lot, br = deg(s.rot || 0), [w, d] = s.size;
  const D = l.d / 2 + l.bz - d / 2 - 0.15;
  if (D < Math.min(rec.min, 2.5)) return null;
  const [ox, oz] = toWorld(0, -d / 2, br);
  const Y = new Yard([s.at[0] + ox, s.at[1] + oz], br + Math.PI, w, l.bx - l.w / 2 + 0.05, l.bx + l.w / 2 - 0.05, D);
  Y.lot = true;
  Y.vF = l.bz - d / 2 - l.d / 2;            // lot front line (negative: in front of the back wall)
  Y.set = l.d / 2 - (l.bz + d / 2);         // front setback
  return Y;
}

// yard inside a polygon lot: the biggest rectangle behind the building that the lot polygon holds
// (props go there); paint and fences come from the whole polygon
function parcelYard(s, rec) {
  const l = s._lot, br = deg(s.rot || 0), [w, d] = s.size;
  const r = br + Math.PI;
  const [ox, oz] = toWorld(0, -d / 2, br), o = [s.at[0] + ox, s.at[1] + oz];
  const P = l.poly.map(([x, z]) => toLocal(x - o[0], z - o[1], r));
  const vi = vIntervals(P, 0).find(([a, b]) => a <= 0.3 && b >= 0.3);
  if (!vi) return null;
  const D0 = vi[1] - 0.15;
  if (D0 < Math.min(rec.min, 2.5)) return null;
  let best = null;
  for (let D = D0; D >= Math.min(rec.min, 2.5); D -= 1) {
    const iv = band(P, 0.2, D, 0);
    if (!iv) continue;
    const Wd = iv[1] - iv[0];
    if (Wd < Math.min(w * 0.6, 3)) continue;
    const sc = Wd * Math.min(D, rec.want[1]) + (Wd >= w * 0.8 ? 40 : 0);
    if (!best || sc > best.sc) best = { sc, iv, D };
    if (Wd >= w * 0.9) break;
  }
  if (!best) return null;
  const Y = new Yard(o, r, w, best.iv[0] + 0.05, best.iv[1] - 0.05, best.D);
  Y.lot = true; Y.parcel = l; Y.set = s._set ?? 0;
  return Y;
}

function findYard(s, rec, mode, occ, rng, inMap) {
  const br = deg(s.rot || 0), [w, d] = s.size || [10, 8];
  const frames = [
    { r: br + Math.PI, o: toWorld(0, -d / 2, br), L: w },     // behind
    { r: br + Math.PI / 2, o: toWorld(w / 2, 0, br), L: d },  // right side
    { r: br - Math.PI / 2, o: toWorld(-w / 2, 0, br), L: d }, // left side
  ];
  const E = mode === 'attached' ? 0 : rec.ext;
  const want = rng.range(rec.want[0], rec.want[1]);
  const exts = E ? [E, E / 2, 0] : [0];
  for (let fi = 0; fi < frames.length; fi++) {
    if (fi > 0 && (mode === 'attached' || s.party?.length)) break; // row houses only have the back
    const F = frames[fi];
    const o = [s.at[0] + F.o[0], s.at[1] + F.o[1]];
    let best = null;
    for (const eL of exts) for (const eR of exts) {
      for (let D = Math.ceil(want); D >= rec.min; D -= 1) {
        const Y = new Yard(o, F.r, F.L, -F.L / 2 - eL, F.L / 2 + eR, D);
        if (!fits(Y, occ, inMap)) continue;
        const score = Y.W * Math.min(D, want) + (D >= rec.want[0] ? 50 : 0) - (eL + eR) * 0.5;
        if (!best || score > best.score) best = { Y, score };
        break;
      }
    }
    if (best) return best.Y;
  }
  return null;
}

function fits(Y, occ, inMap) {
  for (let v = 0.55; v <= Y.D - 0.2; v += 0.6) for (let u = Y.ua + 0.3; u <= Y.ub - 0.3; u += 0.6) {
    const [x, z] = Y.P(u, v);
    if (!inMap(x, z) || occ.test(x, z, 0)) return false;
  }
  // far edge and corners exactly
  for (const [u, v] of [[Y.ua + 0.2, Y.D - 0.1], [Y.ub - 0.2, Y.D - 0.1], [(Y.ua + Y.ub) / 2, Y.D - 0.1]]) { const [x, z] = Y.P(u, v); if (!inMap(x, z) || occ.test(x, z, 0)) return false; }
  return true;
}

// ------------------------------------------------------------------ contents
function fillYard(J, Y, out, world, S, fenced, rng) {
  const { s, recipe, mode } = J;
  const sid = s.id;
  let n = 0;
  const put = (type, u, v, opts = {}, ru = 0.7, rv = 0.7, rot = 0) => {
    if (!Y.free(u - ru, u + ru, v - rv, v + rv)) return false;
    Y.claim(u - ru, u + ru, v - rv, v + rv);
    out.props.push({ type, at: Y.P(u, v), rot: Y.deg + rot, _yard: sid, ...opts });
    return true;
  };
  // try a list of [u, v] spots
  const putAny = (type, spots, opts, ru, rv, rot) => spots.some(([u, v]) => put(type, u, v, opts, ru, rv, typeof rot === 'function' ? rot(u, v) : rot));
  const named = (type, name, extra = {}) => ({ id: `${sid}-${type}-${++n}`, name, ...extra });
  const { ua, ub, D, W } = Y;
  const um = (ua + ub) / 2;
  const nearWall = (r = 0.7) => [[ua + r + 0.3, r + 0.35], [ub - r - 0.3, r + 0.35], [um + rng.range(-1, 1) * (W / 2 - r - 0.5), r + 0.35]];
  const far = (r = 0.8) => [[ua + r + 0.3, D - r - 0.3], [ub - r - 0.3, D - r - 0.3], [um, D - r - 0.3]];
  const anywhere = (r = 0.8, k = 8) => Array.from({ length: k }, () => [rng.range(ua + r + 0.3, ub - r - 0.3), rng.range(r + 0.4, D - r - 0.3)]);
  const field = (type, u0, u1, v0, v1, extra = {}) => {
    if (u1 - u0 < 1.6 || v1 - v0 < 1.4 || !Y.free(u0, u1, v0, v1)) return false;
    Y.claim(u0, u1, v0, v1);
    out.fields.push({ type, poly: Y.rect(u0, u1, v0, v1), _yard: sid, ...extra });
    return true;
  };
  const shed = (kind = 'shed') => {
    const [w2, d2] = kind === 'outhouse' ? [1.5, 1.5] : [rng.range(3, 4.2), rng.range(2.6, 3.4)];
    for (const [u, v] of far(Math.max(w2, d2) / 2 + 0.2)) {
      if (!Y.free(u - w2 / 2 - 0.2, u + w2 / 2 + 0.2, v - d2 / 2 - 0.2, v + d2 / 2 + 0.2)) continue;
      Y.claim(u - w2 / 2 - 0.2, u + w2 / 2 + 0.2, v - d2 / 2 - 0.2, v + d2 / 2 + 0.2);
      out.structures.push({ id: `${sid}-${kind}`, kind, size: [Math.round(w2 * 4) / 4, Math.round(d2 * 4) / 4], at: Y.P(u, v), rot: Y.deg + 180, origin: 'new', material: kind === 'outhouse' ? 'timber' : rng.weighted({ adobe: 2, timber: 1.5, metal: 1, block: 0.5 }), snap: false, _sub: true, surround: false, name: kind === 'shed' ? 'Shed' : undefined });
      return true;
    }
    return false;
  };
  const brahmin = (count, u0, u1, v0, v1) => { for (let i = 0; i < count; i++) out.props.push({ type: 'brahmin', at: Y.P(rng.range(u0 + 1, u1 - 1), rng.range(v0 + 1, v1 - 1)), rot: rng.range(0, 360) }); };
  const pen = (u0, u1, v0, v1, count, fence = 'rail') => {
    if (!field('corral', u0, u1, v0, v1, { fence, gates: [{ at: 0.1 + rng.next() * 0.2, width: 2.4 }] })) return false;
    brahmin(count, u0, u1, v0, v1);
    put('trough', (u0 + u1) / 2, v0 - 0.7, { length: Math.min(3, u1 - u0 - 1) }, 1.5, 0.45);
    return true;
  };
  const yardPaint = (paint = 'yard') => out.fields.push({ type: 'yard', poly: Y.parcel ? Y.parcel.poly : Y.poly(), paint, _yard: sid, alpha: Y.parcel ? 0.7 : 0.85 });
  let fence = true;

  switch (recipe) {
    case 'garden': case 'healer': {
      yardPaint();
      const v0 = D >= 4.5 ? Math.max(1.8, D * 0.42) : 1.3, v1 = D - 0.6;
      const shrink = rng.chance(0.5) ? W * 0.2 : 0;
      field('garden', ua + 0.6 + (rng.chance(0.5) ? shrink : 0), ub - 0.6 - (rng.chance(0.5) ? shrink : 0), v0, v1, { crop: 'mixed' });
      if (recipe === 'healer') { putAny('drying_rack', nearWall(0.9), {}, 0.9, 0.5); if (rng.chance(0.6)) putAny('drying_rack', anywhere(0.9), {}, 0.9, 0.5); putAny('bench', nearWall(0.9), {}, 0.9, 0.4); }
      else {
        if (rng.chance(0.55) && W > 4.5) { const L = Math.min(5, W - 1.8); put('laundry_line', um + rng.range(-0.5, 0.5), Math.min(1.3, v0 - 0.5), { length: L }, L / 2 + 0.2, 0.35); }
        putAny('barrel', nearWall(0.45), { count: rng.int(1, 2) }, 0.5, 0.5);
        if (rng.chance(0.35)) putAny('bench', nearWall(0.9), {}, 0.9, 0.4);
        if (rng.chance(0.35)) putAny(rng.chance(0.5) ? 'chicken_coop' : 'chickens', [...far(1.2), ...anywhere(1.2)], {}, 1.3, 1.0);
        if (rng.chance(0.3)) putAny('woodpile', nearWall(0.7), {}, 0.8, 0.5);
      }
      if (rng.chance(0.45)) for (const [u, v] of far(1.3)) if (Y.free(u - 1.2, u + 1.2, v - 1.2, v + 1.2)) { Y.claim(u - 1.2, u + 1.2, v - 1.2, v + 1.2); out.plants.push({ species: rng.weighted({ fruit_tree: 3, pepper_tree: 1, date_palm: 0.6, nopal: 1 }), at: Y.P(u, v) }); break; }
      if (mode === 'sparse' && rng.chance(0.4)) shed('outhouse');
      break;
    }
    case 'homework': {
      yardPaint('packed');
      putAny('workbench', nearWall(1.1), {}, 1.1, 0.5);
      if (rng.chance(0.45)) putAny('ramada', [[um, 2.0]], { width: Math.min(4, W - 1), depth: 3 }, Math.min(2, W / 2 - 0.5), 1.6);
      putAny(rng.pick(['scrap_pile', 'tires', 'crates']), anywhere(0.9), { count: 3 }, 0.9, 0.9);
      putAny('barrel', nearWall(0.45), { count: 2 }, 0.5, 0.5);
      if (rng.chance(0.4)) putAny('laundry_line', [[um, D - 0.8]], { length: Math.min(4.5, W - 1.5) }, Math.min(2.4, W / 2 - 0.4), 0.3);
      break;
    }
    case 'workyard': {
      yardPaint('oil');
      if (rng.chance(0.6)) putAny('car_wreck', [...far(2.4), ...anywhere(2.4)], { burned: rng.chance(0.2), hoodOpen: rng.chance(0.5) }, 1.1, 2.4, rng.chance(0.5) ? 90 : 0);
      if (rng.chance(0.2)) putAny('truck_chassis', anywhere(3.2), {}, 1.3, 3.2);
      putAny('engine_block', anywhere(0.6), {}, 0.6, 0.6);
      putAny('tires', anywhere(0.6), { count: rng.int(3, 6) }, 0.6, 0.6);
      putAny('scrap_pile', anywhere(1.2), {}, 1.2, 1.2);
      putAny('workbench', nearWall(1.1), {}, 1.1, 0.5);
      putAny('barrel', nearWall(0.5), { count: rng.int(1, 3) }, 0.6, 0.6);
      if (rng.chance(0.15)) putAny('generator', nearWall(0.8), {}, 0.8, 0.6);
      if (rng.chance(0.5)) putAny('crates', anywhere(1), { count: 3 }, 1, 0.9);
      break;
    }
    case 'storage': case 'trader': case 'brewer': {
      yardPaint('packed');
      if (W >= 5 && D >= 4.5 && rng.chance(0.4)) shed();
      if (recipe === 'brewer') { for (let i = 0; i < 3; i++) putAny('barrel', anywhere(0.7), { count: 3 }, 0.8, 0.8); putAny('table', nearWall(1.0), { chairs: 2 }, 1.1, 0.9); }
      else { putAny('crates', [...nearWall(1), ...anywhere(1)], { count: rng.int(3, 5) }, 1, 0.9); putAny('barrel', anywhere(0.6), { count: 3 }, 0.7, 0.7); }
      if (rng.chance(0.35)) putAny('shade_cloth', [[um, D / 2]], { width: Math.min(4, W - 1), depth: Math.min(3, D - 1) }, Math.min(2.1, W / 2 - 0.3), Math.min(1.6, D / 2 - 0.3));
      if (recipe === 'trader') {
        if (rng.chance(0.5)) putAny('cart', anywhere(1.6), { load: true }, 0.9, 1.7);
        if (rng.chance(0.3) && D >= 6) putAny('wagon', anywhere(3), {}, 1.1, 3.0, 90);
        if (rng.chance(0.5)) { putAny('hitching_rail', far(2), { length: 4 }, 2.1, 0.4); }
      } else if (rng.chance(0.25)) putAny('cart', anywhere(1.6), { load: rng.chance(0.5) }, 0.9, 1.7);
      break;
    }
    case 'pen': {
      yardPaint('packed');
      if (!pen(ua + 0.6, ub - 0.6, Math.max(1.6, D * 0.3), D - 0.5, rng.int(1, 3))) putAny('chickens', anywhere(1.2), {}, 1.2, 1.2);
      if (rng.chance(0.5)) putAny('haystack', nearWall(1.3), {}, 1.3, 1.1);
      putAny('barrel', nearWall(0.5), {}, 0.5, 0.5);
      break;
    }
    case 'patio': {
      yardPaint('packed');
      const rw = Math.min(5, W - 1.4);
      let shaded = false;
      if (rw >= 3 && rng.chance(0.7)) shaded = put('ramada', um, 2.2, { width: rw, depth: 3.4, roof: rng.chance(0.5) ? 'corrugated' : 'thatch' }, rw / 2, 1.8);
      else if (W > 3.4) shaded = put('shade_cloth', um, 2.2, { width: Math.min(4, W - 1), depth: 3 }, Math.min(2, W / 2 - 0.4), 1.6);
      if (shaded) Y.obst.pop(); // tables go under the shade
      for (let i = 0; i < rng.int(1, 3); i++) putAny('table', [[um + (i - 1) * 2.1, 2.2], ...anywhere(1)], { chairs: rng.int(2, 4) }, 1.0, 0.9);
      if (rng.chance(0.4)) putAny('firepit', far(0.9), {}, 0.9, 0.9);
      putAny('barrel', nearWall(0.5), { count: 2 }, 0.5, 0.5);
      if (rng.chance(0.5)) putAny('lantern', nearWall(0.3), {}, 0.3, 0.3);
      fence = rng.chance(0.85);
      break;
    }
    case 'bare': {
      yardPaint(rng.chance(0.5) ? 'packed' : 'yard');
      for (let i = rng.int(1, 2); i > 0; i--) putAny(rng.pick(['barrel', 'woodpile', 'bench', 'firepit', 'cart']), anywhere(0.9), { count: 2 }, 0.9, 0.9);
      fence = rng.chance(0.4);
      break;
    }
    case 'waystation': {
      yardPaint('packed');
      const split = um + W * 0.05;
      // brahmin corral on one side at the back
      pen(ua + 0.8, split - 0.6, Math.max(3, D * 0.42), D - 0.8, rng.int(3, 7));
      putAny('hitching_rail', [[(ua + split) / 2, Math.max(1.3, D * 0.42 - 1.6)]], { length: Math.min(6, split - ua - 1.5) }, Math.min(3, (split - ua) / 2 - 0.5), 0.4);
      // common area under a ramada
      const rw = Math.min(6, ub - split - 1);
      if (rw > 3) {
        const cu = (split + ub) / 2;
        if (put('ramada', cu, 2.6, { width: rw, depth: 4, roof: rng.chance(0.6) ? 'thatch' : 'corrugated' }, rw / 2, 2.1)) Y.obst.pop();
        put('table', cu - 1.2, 2.4, { chairs: 4 }, 1.0, 0.9); put('table', cu + 1.3, 2.8, { chairs: 3 }, 1.0, 0.9);
        putAny('firepit', [[cu, 5.6], ...anywhere(1)], {}, 0.9, 0.9);
      }
      if (rng.chance(0.5)) putAny(rng.chance(0.5) ? 'hand_pump' : 'well', [...anywhere(1.3)], { roof: rng.chance(0.5) }, 1.3, 1.3);
      if (!shed()) putAny('crates', anywhere(1), { count: 4 }, 1, 1);
      putAny('barrel', nearWall(0.6), { count: 3 }, 0.7, 0.7);
      if (rng.chance(0.4)) putAny('wagon', anywhere(3), { cover: rng.chance(0.6) }, 1.1, 3.0, 90);
      out.walls.push(null); // marker: waystation compounds get a proper wall
      break;
    }
    case 'graveyard': {
      field('graveyard', ua + 0.6, ub - 0.6, 1.4, D - 0.6);
      break;
    }
    case 'field': case 'farmer': {
      yardPaint('packed');
      const fu1 = J.recipe === 'farmer' && W > 9 ? ub - Math.min(5, W * 0.35) : ub - 0.6;
      field('field', ua + 0.6, fu1, 1.6, D - 0.6, { crop: rng.weighted({ corn: 3, beans: 2, mixed: 2, maguey: 1, chili: 1 }) });
      if (fu1 < ub - 3) pen(fu1 + 0.5, ub - 0.6, Math.max(1.6, D * 0.4), D - 0.6, rng.int(1, 2), 'pole');
      putAny('cart', nearWall(1.6), { load: rng.chance(0.4) }, 0.9, 1.7);
      if (rng.chance(0.6)) putAny('haystack', nearWall(1.3), {}, 1.3, 1.1);
      if (J.mode === 'sparse' && rng.chance(0.4)) shed('outhouse');
      fence = rng.chance(0.5);
      break;
    }
    case 'butcher': {
      yardPaint('packed');
      pen(ua + 0.6, Math.min(ub - 0.6, ua + Math.max(5, W * 0.5)), Math.max(2.5, D * 0.45), D - 0.5, rng.int(1, 3));
      putAny('meat_rack', [...nearWall(1.4), ...anywhere(1.4)], {}, 1.4, 0.8);
      putAny('table', anywhere(1), { chairs: 0 }, 1.0, 0.6);
      putAny('barrel', nearWall(0.5), { count: 2 }, 0.6, 0.6);
      if (rng.chance(0.4)) putAny('bones', anywhere(0.8), {}, 0.8, 0.8);
      if (rng.chance(0.4)) putAny('hide_frame', anywhere(1), {}, 1.0, 0.6);
      break;
    }
    case 'smith': {
      yardPaint('ash');
      putAny('forge', [[um, 1.5], ...nearWall(1.8)], {}, 1.9, 1.2);
      putAny('scrap_pile', anywhere(1.2), {}, 1.2, 1.2);
      putAny('woodpile', [...nearWall(0.8), ...anywhere(0.8)], {}, 0.8, 0.6);
      putAny('barrel', anywhere(0.5), {}, 0.5, 0.5);
      putAny('workbench', nearWall(1.1), {}, 1.1, 0.5);
      if (rng.chance(0.4)) putAny('crates', anywhere(1), { count: 2 }, 1, 0.9);
      break;
    }
    case 'tanner': {
      yardPaint('wet');
      putAny('tan_pit', [[um, D - 1.4], ...far(2.4), ...anywhere(2.4)], { count: W > 6 ? 3 : 2 }, W > 6 ? 2.4 : 1.7, 0.9);
      for (let i = 0; i < rng.int(2, 3); i++) putAny('hide_frame', anywhere(1), {}, 1.0, 0.6);
      putAny('barrel', nearWall(0.5), { count: 3 }, 0.6, 0.6);
      break;
    }
    case 'potter': {
      yardPaint('packed');
      putAny('kiln', [...far(1.5), ...anywhere(1.5)], {}, 1.5, 1.4);
      putAny('table', nearWall(1.0), { chairs: 1 }, 1.0, 0.8);
      putAny('goods', anywhere(1), { goods: 'pottery', width: 1.4, depth: 1.0 }, 0.9, 0.7);
      putAny('crates', anywhere(1), { count: 2 }, 1, 0.9);
      break;
    }
    case 'carpenter': {
      yardPaint('packed');
      putAny('lumber', [...anywhere(1.7)], {}, 1.7, 1.4);
      putAny('workbench', nearWall(1.1), {}, 1.1, 0.5);
      putAny('woodpile', anywhere(0.8), {}, 0.8, 0.6);
      putAny('crates', anywhere(1), { count: 2 }, 1, 0.9);
      break;
    }
  }
  const compound = out.walls[out.walls.length - 1] === null;
  if (compound) out.walls.pop();
  if (Y.parcel) {
    // polygon lots: fences are built once per shared lot line (planParcelFences); just state the claim
    const P = Y.parcel;
    P.compound = compound || P.compound;
    if (compound) P.fence = [rng.weighted({ adobe: 3, stone: 1, block: 1 }), 2.2];
    else if (mode === 'attached') P.fence = [rng.weighted({ adobe: 3, block: 2, stone: 1 }), 2.0];
    else if (fence) { const [t, h] = fenceFor(s, S, mode, rng); P.fence = [t, h]; }
    else P.fence = null;
    return;
  }
  if ((!fence && !Y.lot) || recipe === 'graveyard' && rng.chance(0.5)) return;
  // fence the open sides; skip edges already fenced by a neighbour or lying along another building
  let [ftype, fh] = compound ? [rng.weighted({ adobe: 3, stone: 1, block: 1 }), 2.2] : fenceFor(s, S, mode, rng);
  const L2 = Y.L / 2;
  let pts = [];
  let frontGate = null;
  if (Y.lot) {
    // fence the lot lines; a front wall with a gate when the building is set back from the street
    const vF = Y.vF + 0.15;
    if (Y.set > 2.2 && mode !== 'attached') {
      pts = [[Y.ua, vF], [Y.ua, D], [Y.ub, D], [Y.ub, vF], [Y.ua, vF]];
      frontGate = (D - vF) * 2 + (Y.ub - Y.ua) + (Y.ub - 0); // distance along the path to the door line
    } else {
      if (Y.ua < -L2 - 0.6) pts.push([-L2, vF + 0.0], [Y.ua, vF]); else pts.push([Y.ua, 0]);
      pts.push([Y.ua, D], [Y.ub, D]);
      if (Y.ub > L2 + 0.6) pts.push([Y.ub, vF], [L2, vF]); else pts.push([Y.ub, 0]);
    }
    if (compound) ftype = ftype; else if (mode === 'attached') { ftype = rng.weighted({ adobe: 3, block: 2, stone: 1 }); fh = 2.0; }
  } else {
    if (Y.ua < -L2 - 0.3) pts.push([-L2, 0]);
    pts.push([Y.ua, 0], [Y.ua, D], [Y.ub, D], [Y.ub, 0]);
    if (Y.ub > L2 + 0.3) pts.push([L2, 0]);
  }
  const wpts = pts.map(([u, v]) => Y.P(u, v));
  const keep = [];
  for (let i = 0; i < wpts.length - 1; i++) {
    const a = wpts[i], b = wpts[i + 1];
    const probes = [0.2, 0.5, 0.8].map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    const dup = probes.filter(([x, z]) => fenced.some(([p, q]) => segDist(x, z, p[0], p[1], q[0], q[1]).d < 0.7)).length >= 2;
    const onWall = probes.filter(([x, z]) => world.structures.some((o) => o !== s && o._masses.some((m) => inOBB(m, x, z, 0.6)))).length >= 2;
    keep.push(!dup && !onWall);
  }
  // contiguous runs -> fence paths; gate on the far side (or the longest run)
  const runs = [];
  let cur = null;
  keep.forEach((k, i) => { if (k) { if (!cur) { cur = [wpts[i]]; runs.push(cur); } cur.push(wpts[i + 1]); } else cur = null; });
  const farMid = Y.P((Y.ua + Y.ub) / 2, D);
  let gated = false;
  runs.forEach((path, ri) => {
    let total = 0, gateS = null;
    for (let i = 0; i < path.length - 1; i++) {
      const L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      const q = segDist(farMid[0], farMid[1], path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
      if (q.d < 0.5 && gateS == null) gateS = total + q.t * L + rng.range(-1, 1) * Math.min(1.5, L / 4);
      total += L;
    }
    if (total < 1.2) return;
    const gates = [];
    if (frontGate != null && runs.length === 1 && path.length === pts.length) gates.push({ s: frontGate, width: compound ? 3.2 : 1.6, track: false });
    if (gateS != null && !gated && rng.chance(0.85)) { gates.push({ s: gateS, width: compound ? 3.2 : 1.3, track: false }); gated = true; }
    out.walls.push({ id: `${sid}-yard-${ri}`, type: ftype, path, height: fh, condition: 0.6 + 0.35 * rng.next(), gates });
    for (let i = 0; i < path.length - 1; i++) fenced.push([path[i], path[i + 1]]);
  });
}

function inOBB(m, x, z, pad) {
  const dx = x - m.cx, dz = z - m.cz, c = Math.cos(m.r), sn = Math.sin(m.r);
  return Math.abs(dx * c - dz * sn) <= m.w / 2 + pad && Math.abs(dx * sn + dz * c) <= m.d / 2 + pad;
}

// ------------------------------------------------------------------ rooftops
function roofProps(s, kind, out, rng) {
  const [w, d] = s.size, y = roofTop(s);
  const iw = w / 2 - 0.85, id = d / 2 - 0.85;
  if (iw < 1 || id < 1) return;
  const put = (type, x, z, rot = 0, opts = {}) => out.props.push({ type, in: s.id, local: [x, z], y, rot, _roof: s.id, ...opts });
  if (kind === 'garden') {
    const nb = Math.max(1, Math.floor((2 * iw) / 1.7));
    for (let i = 0; i < nb; i++) if (rng.chance(0.85)) put('planter', -iw + 0.7 + i * ((2 * iw - 1.4) / Math.max(1, nb - 1)), -id + 0.35, 0, { length: 1.4 });
    if (rng.chance(0.7)) for (let i = 0; i < Math.floor((2 * id - 1.5) / 1.7); i++) put('planter', -iw + 0.35, -id + 1.6 + i * 1.7, 90, { length: 1.4 });
    if (rng.chance(0.45) && iw > 1.6) put('shade_cloth', 0.3, id - 1.4, 0, { width: Math.min(3, 2 * iw - 1), depth: Math.min(2.4, 2 * id - 2.2), height: 2.0 });
    if (rng.chance(0.5)) put('barrel', iw - 0.4, -id + 0.4, 0, { count: 1 });
  } else if (kind === 'storage') {
    put('crates', rng.range(-iw + 1, iw - 1), rng.range(-id + 1, 0), rng.range(0, 90), { count: rng.int(2, 4) });
    put('barrel', iw - 0.5, -id + 0.5, 0, { count: rng.int(2, 3) });
    if (rng.chance(0.4)) put('shade_cloth', 0, 0, 0, { width: Math.min(3, 2 * iw - 0.5), depth: Math.min(2.5, 2 * id - 0.5), height: 1.9 });
    if (rng.chance(0.35)) put('planter', -iw + 0.7, id - 0.35, 0, { length: 1.4 });
  } else if (kind === 'terrace') {
    put('shade_cloth', 0, 0, 0, { width: Math.min(4, 2 * iw - 0.3), depth: Math.min(3.2, 2 * id - 0.3), height: 2.1 });
    put('table', 0, 0, rng.range(-10, 10), { chairs: 4 });
    put('planter', -iw + 0.7, -id + 0.35, 0, { length: 1.4 });
    if (iw > 2.5) put('planter', iw - 0.7, -id + 0.35, 0, { length: 1.4 });
  }
}

function simplePath(p) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k <= n; k++) out.push({ x: p[i][0] + ((p[i + 1][0] - p[i][0]) * k) / n, z: p[i][1] + ((p[i + 1][1] - p[i][1]) * k) / n });
  }
  return out;
}

// ------------------------------------------------------------------ town wall
// Encloses the built-up core (not the arterial services / outskirts). Gaps where roads pass,
// with lanterns on the gateposts.
export function planWall(world, gen) {
  const spec = world.spec, S = spec.settlement || {};
  if (!S.wall) return { walls: [], props: [] };
  const core = S.core || [0, 0], R = S.radius || 50;
  const pts = [];
  const inside = (s) => (s._mode && s._mode !== 'sparse' && s._class !== 'arterial') || (!s.auto && !s._sub && Math.hypot(s.at[0] - core[0], s.at[1] - core[1]) < R * 0.8 && s.inWall !== false);
  const inner = world.structures.filter(inside);
  for (const s of inner) for (const m of s._masses) for (const c of obbCorners(m)) pts.push(c);
  for (const f of gen.fields) if (f._yard && inner.some((s) => s.id === f._yard)) for (const c of f.poly) pts.push(c);
  if (world.plaza) for (const c of world.plaza.poly) pts.push(c);
  if (pts.length < 3) return { walls: [], props: [] };
  const margin = S.wallMargin ?? 3.5;
  const exp = [];
  for (const [x, z] of pts) for (let k = 0; k < 8; k++) exp.push([x + Math.cos((k * Math.PI) / 4) * margin, z + Math.sin((k * Math.PI) / 4) * margin]);
  const hull = convexHull(exp);
  // resample at ~1 m, cut where roads cross or other buildings sit
  const ring = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k < n; k++) ring.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const T = world.terrain;
  const roadAt = (x, z) => world.roads.find((r) => r.type !== 'path' && nearestOK(r, x, z));
  const nearestOK = (r, x, z) => { for (const sm of r.samples) if (Math.hypot(sm.x - x, sm.z - z) < r.hw + 2.2) return true; return false; };
  const state = ring.map(([x, z]) => {
    if (Math.abs(x) > T.W / 2 - 2 || Math.abs(z) > T.D / 2 - 2) return 'out';
    if (roadAt(x, z)) return 'gate';
    if (world.structures.some((s) => s._masses.some((m) => inOBB(m, x, z, 1.0)))) return 'cut';
    return 'wall';
  });
  // rotate so we start on a gap (no wrap-around run)
  let start = state.findIndex((st) => st !== 'wall');
  if (start < 0) start = 0;
  const walls = [], props = [];
  const rng = new RNG(`${world.seed}:townwall`);
  let run = [];
  const flush = () => { if (run.length >= 3) walls.push({ id: `town-wall-${walls.length}`, type: S.wall === true ? 'adobe' : S.wall, path: thin(run), height: S.wallHeight || 2.6, condition: S.wallCondition ?? 0.75 }); run = []; };
  for (let k = 0; k <= ring.length; k++) {
    const i = (start + k) % ring.length;
    if (state[i] === 'wall' && k < ring.length) run.push(ring[i]);
    else {
      flush();
      // gatepost lanterns on both sides of a road gap
      if (state[i] === 'gate' && state[(i - 1 + ring.length) % ring.length] === 'wall') props.push({ type: 'lantern', at: ring[(i - 1 + ring.length) % ring.length], essential: true, name: 'Gate lantern', _gate: true });
      if (state[i] === 'gate' && state[(i + 1) % ring.length] === 'wall') props.push({ type: 'lantern', at: ring[(i + 1) % ring.length], essential: true, _gate: true });
    }
  }
  return { walls, props };
}

function thin(run) {
  const out = [run[0]];
  for (let i = 3; i < run.length - 1; i += 3) out.push(run[i]);
  out.push(run[run.length - 1]);
  return out;
}

function convexHull(P) {
  const pts = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

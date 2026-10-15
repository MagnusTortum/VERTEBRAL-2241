// Decoration by finish tier, and signs for businesses.
//   decorated  — a few potted plants, a tiled surround on the door, wall lanterns
//   ornate     — maximalist: plants everywhere, flower boxes, string lights, a bench
//   showpiece  — the best of it: arched stone door surround, cornice, balcony, lantern posts, glazed pots, a flag
// Signs (businesses only): painted on the wall, a board over the door, a salvaged pre-war sign, a roof
// board, neon where there's power; chalkboards and ABIERTO plaques. Text is placeholder flavour — the GM
// rewrites it in the panel.
import { signFromName } from './names.js';
import { flagDesign, drawFlag } from './flags.js';
import { col } from './builder.js';
import { pottedPlant, plantRow } from './foliage.js';
import { RNG } from './rng.js';
import { WOOD, METAL, MISC } from './palette.js';
import { TIER_RANK } from './finishes.js';
import { LIGHT_COL } from './presets.js';

const TERRACOTTA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const GLAZED = [0x2f6a8a, 0x3a7a5a, 0xc8a040, 0x9a3a3a, 0x2a4a7a];
const FLOWERS = [0xc0306a, 0xd84a8a, 0xe0b030, 0xd85030, 0xf0e0d0, 0x9a40a0];
const LEAF = [0x4a6a32, 0x5a7a3a, 0x3e5a2c, 0x6a8a4a];
const PICADO = [0xd8406a, 0x40a0d0, 0xe8c040, 0x60b060, 0xe07030, 0x9a5ad0];

const ry = (o) => Math.atan2(o.nx, o.nz);
const at = (o, u, out) => [o.x + o.tx * u + o.nx * out, o.z + o.tz * u + o.nz * out];

function pot(b, rng, x, z, big = false, glazed = false) {
  pottedPlant(b, rng, x, 0, z, big, { glazed, kind: rng.weighted({ geranium: 2.5, aloe: 1.5, flowers: 1.5, herb: 1, bougainvillea: big ? 0.8 : 0, sansevieria: 1 }) });
}

// ---------------------------------------------------------------------------------------------
// Space on the front of the main block: rectangles on the wall face (u along the wall from its centre,
// y up) and footprints on the ground in front (u, d out from the wall). Everything placed claims its
// space first, so signs, lanterns, papel picado, pots and benches never overlap the openings, the vigas,
// each other or the door approach.
export function frontSpace(c, info) {
  const f = info.walls.front;
  if (!f || f.party) return null;
  const U = (o) => (o.x - f.x) * f.tx + (o.z - f.z) * f.tz;
  const wall = [], ground = [];
  const S = {
    f, U, wall, ground, L: f.L, top: f.top,
    wallFree: (u0, u1, y0, y1) => u0 >= -f.L / 2 + 0.15 && u1 <= f.L / 2 - 0.15 && y0 >= 0.3 && y1 <= f.top - 0.22 && wall.every((r) => u1 <= r.u0 || u0 >= r.u1 || y1 <= r.y0 || y0 >= r.y1),
    takeWall: (u0, u1, y0, y1) => wall.push({ u0, u1, y0, y1 }),
    groundFree: (u0, u1, d0, d1) => u0 >= -f.L / 2 - 1 && u1 <= f.L / 2 + 1 && ground.every((r) => u1 <= r.u0 || u0 >= r.u1 || d1 <= r.d0 || d0 >= r.d1),
    takeGround: (u0, u1, d0, d1) => ground.push({ u0, u1, d0, d1 }),
    // nearest free spot to u (searching outward) for a w×h rect at height y0..y1
    findWall(u, w, y0, y1) { for (let k = 0; k < 60; k++) { const du = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.2, uu = u + du; if (S.wallFree(uu - w / 2, uu + w / 2, y0, y1)) return uu; } return null; },
    findGround(u, w, d0, d1) { for (let k = 0; k < 60; k++) { const du = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.15, uu = u + du; if (S.groundFree(uu - w / 2, uu + w / 2, d0, d1)) return uu; } return null; },
  };
  for (const o of info.openings) {
    if (o.side !== 'front' || !o.main) continue;
    const u = U(o);
    S.takeWall(u - o.w / 2 - 0.32, u + o.w / 2 + 0.32, o.y0 - 0.15, o.y1 + 0.25);
    if ((o.type === 'door' || o.type === 'bigdoor') && o.floor === 0) S.takeGround(u - o.w / 2 - 0.25, u + o.w / 2 + 0.25, -0.1, 1.9); // the way in
  }
  if (info.awning) S.takeWall(info.awning.u0, info.awning.u1, info.awning.y0, info.awning.y1);
  if (info.vigas?.faces.includes('front')) S.takeWall(-f.L, f.L, info.vigas.y0, info.vigas.y1);
  if (info.porch) { S.takeWall(-f.L, f.L, 0, info.porch.h + 0.3); S.takeGround(-f.L, f.L, 0, info.porch.depth + 0.3); }
  if (c.vstyle === 'casona') { S.takeWall(-f.L, f.L, 0, 1.15); for (let k = 1; k < c.floors; k++) S.takeWall(-f.L, f.L, k * c.fh - 0.2, k * c.fh + 0.12); }
  if (c.finish.border) S.takeWall(-f.L, f.L, f.wallH - 0.45, f.top);
  return S;
}

export function buildDecor(b, c, masses, info, S) {
  const { rng } = c, rank = TIER_RANK[c.finish.tier] ?? 0;
  if (rank < 3 || !c.inhabited || !S) return;
  const front = S.f, R0 = ry(front);
  const fd = info.openings.find((o) => o.type === 'door' && o.floor === 0 && o.side === 'front' && o.main);
  const ornate = rank >= 4, show = rank >= 5;
  const atU = (u, out) => at(front, u, out);
  if (fd) {
    const du = S.U(fd), w = fd.w, y1 = fd.y1;
    // tiled / stone surround on the front door (its own frame zone is already reserved with the opening)
    const sc = show ? col(0xc8b89a, 0.03, rng) : col(rng.pick([0x2f6a8a, 0x8a3a3a, 0x3a6a4a, 0xc8a040]), 0.04, rng);
    b.t(show ? 'stone' : 'azulejo');
    for (const sd of [-1, 1]) { const [x, z] = atU(du + sd * (w / 2 + 0.2), 0.03); b.box(x, (fd.y0 + y1) / 2, z, 0.2, y1 - fd.y0 + 0.1, 0.05, sc, R0); }
    if (show && S.wallFree(du - w / 2 - 0.35, du + w / 2 + 0.35, y1 + 0.25, y1 + w / 2 + 0.5)) { // arch over the door
      S.takeWall(du - w / 2 - 0.35, du + w / 2 + 0.35, y1 + 0.25, y1 + w / 2 + 0.5);
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8), u = Math.cos(a) * (w / 2 + 0.2), yy = y1 + Math.sin(a) * (w / 2 + 0.2); const [x, z] = atU(du + u, 0.03); b.box(x, yy, z, 0.24, 0.22, 0.06, sc, R0, 0, a - Math.PI / 2); }
    } else { const [x, z] = atU(du, 0.03); b.box(x, y1 + 0.1, z, w + 0.6, 0.2, 0.05, sc, R0); }
    // wall lanterns either side, only where the wall is clear
    const lit = c.powered && rng.chance(0.5);
    for (const sd of [-1, 1]) {
      if (!ornate && !show && sd > 0) continue;
      const u = du + sd * (w / 2 + 0.6);
      if (!S.wallFree(u - 0.15, u + 0.15, y1 - 0.3, y1 + 0.25)) continue;
      S.takeWall(u - 0.15, u + 0.15, y1 - 0.3, y1 + 0.25);
      const [x, z] = atU(u, 0.18), r = c.lightR(false, lit);
      b.t('metal').box(x, y1 + 0.05, z, 0.06, 0.3, 0.16, col(METAL.dark), R0);
      b.ch('lamp').w(r).t('plain').box(x, y1 - 0.1, z, 0.16, 0.24, 0.16, lit ? 0xfff0d0 : 0xffc070); b.w(-1).ch('main');
      info.lights.push({ x, y: y1 - 0.1, z, color: lit ? LIGHT_COL.incandescent : LIGHT_COL.oil, radius: 5, intensity: 0.9, kind: 'lamp', r, flicker: !lit });
    }
    // lantern posts flanking the approach (showpiece)
    if (show) for (const sd of [-1, 1]) {
      const u = S.findGround(du + sd * (w / 2 + 1.0), 0.3, 1.6, 2.0);
      if (u == null) continue;
      S.takeGround(u - 0.15, u + 0.15, 1.6, 2.0);
      const [x, z] = atU(u, 1.8), r = c.lightR(true, c.powered);
      b.t('metal').cyl(x, 1.1, z, 0.05, 0.07, 2.2, 6, col(METAL.dark)); b.ch('lamp').w(r).t('plain').box(x, 2.3, z, 0.26, 0.32, 0.26, 0xffe0b0); b.w(-1).ch('main');
      info.lights.push({ x, y: 2.3, z, color: LIGHT_COL.incandescent, radius: 6, intensity: 1, kind: 'lamp', r, flicker: false });
    }
    // a bench against the wall (ornate+)
    if (ornate) {
      const u = S.findGround(du + (rng.chance(0.5) ? -1 : 1) * (w / 2 + 1.6), 1.5, 0.15, 0.7);
      if (u != null && S.wallFree(u - 0.75, u + 0.75, 0.3, 0.6)) {
        S.takeGround(u - 0.75, u + 0.75, 0.15, 0.7);
        const [x, z] = atU(u, 0.42); b.t('wood').box(x, 0.42, z, 1.4, 0.07, 0.4, col(WOOD.weathered, 0.05, rng), R0).box(x, 0.2, z, 1.3, 0.4, 0.06, col(WOOD.dark, 0.05, rng), R0);
      }
    }
    // pots: either side of the door first, then along the front
    const n = show ? 4 : ornate ? rng.int(5, 7) : 2;
    for (let i = 0, placed = 0; i < n * 3 && placed < n; i++) {
      const sd = i % 2 ? 1 : -1, k = Math.floor(i / 2), big = show || (ornate && rng.chance(0.4)), rr = big ? 0.34 : 0.22;
      const u = S.findGround(du + sd * (w / 2 + 0.5 + k * 0.7), rr * 2 + 0.1, 0.12, 0.12 + rr * 2);
      if (u == null) continue;
      S.takeGround(u - rr - 0.05, u + rr + 0.05, 0.12, 0.12 + rr * 2);
      const [x, z] = atU(u, 0.14 + rr); pot(b, rng, x, z, big, show); placed++;
    }
  }
  // flower boxes under the front windows (ornate+), balconies on upper floors (showpiece)
  if (ornate) for (const o of info.openings) {
    if (o.side !== 'front' || !o.main || !['win', 'ribbon', 'tall'].includes(o.type) || o.y0 < 0.6 || o.balcony) continue;
    const u = S.U(o);
    if (show && o.floor >= 1) { // balcony
      const bw = o.w + 0.8, y = o.y0 - 0.05;
      if (!S.wallFree(u - bw / 2, u + bw / 2, y - 0.1, y + 0.05) && false) continue;
      const [x, z] = atU(u, 0.5);
      b.t('stone').box(x, y, z, bw, 0.12, 1.0, col(0xc8bca8, 0.03, rng), R0);
      b.t('metal');
      const nb = Math.round(bw / 0.14);
      for (let k = 0; k <= nb; k++) { const [px, pz] = atU(u - bw / 2 + (k * bw) / nb, 0.97); b.box(px, y + 0.5, pz, 0.025, 0.9, 0.025, col(METAL.dark), R0); }
      for (const sd of [-1, 1]) { const [px, pz] = atU(u + (sd * bw) / 2, 0.5); b.box(px, y + 0.5, pz, 0.025, 0.9, 1.0, col(METAL.dark), R0); }
      const [tx, tz] = atU(u, 0.97); b.box(tx, y + 0.95, tz, bw, 0.04, 0.04, col(METAL.dark), R0);
      continue;
    }
    const [x, z] = atU(u, 0.16);
    b.t('wood').box(x, o.y0 - 0.14, z, o.w + 0.2, 0.2, 0.24, col(rng.pick([WOOD.dark, 0x3a5a4a, 0x7a3a2a]), 0.05, rng), R0);
    b.t('plain');
    { const [ax, az] = atU(u - o.w / 2 + 0.08, 0.16), [bx, bz] = atU(u + o.w / 2 - 0.08, 0.16); plantRow(b, rng, ax, az, bx, bz, o.y0 - 0.04, 0.32, { geranium: 3, flowers: 2, marigold: 1, herb: 1 }, 0.22); }
  }
  // string lights across the front (ornate+): hung in the free runs of a band under the
  // parapet, broken around signs and anything else on the wall
  if (ornate && front.L > 4) {
    let band = null;
    for (let y = Math.min(front.top - 0.3, 3.2); y > 1.9; y -= 0.1) { if (runs(S, y - 0.55, y).some(([a, b2]) => b2 - a > 2)) { band = y; break; } }
    if (band != null) {
      const lit = c.powered || rng.chance(0.5), r = c.lightR(false, true);
      for (const [a, b2] of runs(S, band - 0.55, band)) {
        const L = b2 - a - 0.3; if (L < 2) continue;
        const u0 = a + 0.15, [ax, az] = atU(u0, 0.5), [bx, bz] = atU(u0 + L, 0.5);
        if (!lit) continue; // no papel picado (it read as party bunting): only string lights, and only when lit
        b.t('plain').plank([ax, band, az], [bx, band, bz], 0.012, 0.012, col(0x3a3a3a));
        {
          const nl = Math.floor(L / 0.7);
          b.ch('lamp').w(r).t('plain');
          for (let k = 0; k < nl; k++) { const t = (k + 0.5) / nl, [x, z] = atU(u0 + t * L, 0.3); b.box(x, band + 0.05 - Math.sin(Math.PI * t) * 0.15, z, 0.07, 0.09, 0.07, 0xfff0c0); }
          b.w(-1).ch('main');
          const [mx, mz] = atU(u0 + L / 2, 0.8); info.lights.push({ x: mx, y: band - 0.2, z: mz, color: LIGHT_COL.incandescent, radius: 6, intensity: 0.8, kind: 'lamp', r, flicker: false });
        }
        S.takeWall(a, b2, band - 0.55, band + 0.05);
      }
    }
  }
  if (show) {
    // cornice along the top of the front
    const [x, z] = at(front, 0, 0.1);
    b.t('stone').box(x, front.top - 0.18, z, front.L + 0.3, 0.22, 0.22, col(0xc8bca8, 0.03, rng), R0);
    // a flag on the roof
    const [fx, fz] = at(front, (rng.chance(0.5) ? -1 : 1) * (front.L / 2 - 0.8), -1.0);
    b.t('metal').cyl(fx, front.top + 1.6, fz, 0.035, 0.045, 3.2, 6, col(METAL.steel));
    b.pushT(fx, 0, fz, Math.atan2(-front.tz, front.tx)); drawFlag(b, flagDesign('settlement'), front.top + 3.15, 0.7, rng, { nx: 14, ny: 9, cloth: false }); b.pop();
  }
}
// free u-runs of the wall at height band y0..y1
function runs(S, y0, y1) {
  const L = S.L, blocks = S.wall.filter((r) => !(y1 <= r.y0 || y0 >= r.y1)).map((r) => [r.u0, r.u1]).sort((a, b) => a[0] - b[0]);
  if (y0 < 0.3 || y1 > S.top - 0.22) return [];
  const out = []; let u = -L / 2 + 0.2;
  for (const [a, b] of blocks) { if (a > u) out.push([u, Math.min(a, L / 2 - 0.2)]); u = Math.max(u, b); }
  if (u < L / 2 - 0.2) out.push([u, L / 2 - 0.2]);
  return out.filter(([a, b]) => b > a);
}

// ---------------------------------------------------------------------------------------------
// signs
const NAMES = ['LA PALOMA', 'EL OASIS', 'LA ÚLTIMA GOTA', 'EL ALACRÁN', 'LOS COMPAS', 'LA SIRENA', 'EL COYOTE', 'LA PERLA', 'EL FARO', 'DON CHUY', 'LA GÜERA', 'EL GÜERO', 'SAN JUDAS', 'LA FE', 'EL NOPAL', 'LOS PINOS', 'LA LUNA', 'EL GALLO'];
const TEXT = {
  cantina: ['CANTINA', 'CANTINA\n{N}', 'CERVEZA FRÍA', 'BAR {N}', 'MEZCAL · CERVEZA', 'COMIDA Y BEBIDA', 'SALOON', 'CANTINA {N}'],
  shop: ['ABARROTES', 'TIENDA {N}', 'MISCELÁNEA\n{N}', 'AGUA PURIFICADA', 'COMPRA Y VENTA', 'TRADING POST', 'ABARROTES {N}', 'SE VENDE · SE COMPRA'],
  kiosk: ['REFRESCOS', 'TACOS', 'AGUA', 'TORTAS', 'CAFÉ'],
  workshop: ['TALLER', 'HERRERÍA', 'SOLDADURA', 'REPARACIONES', 'TALLER {N}', 'CARPINTERÍA'],
  garage: ['TALLER MECÁNICO', 'LLANTAS', 'VULCANIZADORA', 'GARAGE', 'AUTO PARTES', 'MECÁNICO'],
  hall: ['SALÓN', 'SALÓN {N}', 'SALÓN DE EVENTOS'],
  office: ['OFICINA', 'REGISTRO', 'CORREOS'],
  warehouse: ['BODEGA', 'ALMACÉN', 'BODEGA {N}'],
  posada: ['POSADA {N}', 'CASA DE HUÉSPEDES', 'CUARTOS', 'HOSPEDAJE', 'POSADA'], posada_motel: ['OFFICE', 'OFICINA', 'RECEPCIÓN'],
  store: ['ABARROTES', 'ABARROTES {N}', 'TIENDA {N}', 'MISCELÁNEA {N}', 'ABARROTES\n{N}'], store_trading: ['TRADING POST', 'COMPRA Y VENTA', 'TRUEQUE', 'ALMACÉN {N}'],
  clinic: ['CLÍNICA', 'DISPENSARIO', 'CLÍNICA {N}', 'MÉDICO', 'ENFERMERÍA'], clinic_curandero: ['HIERBAS', 'CURANDERO', 'YERBERÍA', 'REMEDIOS'], clinic_field: ['HOSPITAL', 'PUESTO MÉDICO', 'ENFERMERÍA'],
  bodega: ['BODEGA {N}', 'VINOS {N}', 'VINÍCOLA {N}'], mill: ['MOLINO', 'MOLINO {N}'], townhall: ['PRESIDENCIA'],
  comandancia: ['COMANDANCIA', 'ALGUACIL', 'COMANDANCIA\nDE POLICÍA'], comandancia_station: ['POLICÍA', 'POLICÍA MUNICIPAL', 'SEGURIDAD PÚBLICA'],
  trade_tortilleria: ['TORTILLERÍA', 'TORTILLERÍA {N}'], trade_panaderia: ['PANADERÍA', 'PANADERÍA {N}'], trade_carniceria: ['CARNICERÍA', 'CARNICERÍA {N}'], trade_herreria: ['HERRERÍA', 'HERRERÍA {N}'], trade_alfareria: ['ALFARERÍA', 'BARRO {N}'], trade: ['TALLER'],
  cafe: ['FONDA {N}', 'COCINA ECONÓMICA', 'LONCHERÍA', 'FONDA', 'COMIDA CORRIDA'], cafe_diner: ['DINER', 'EAT', 'DINER {N}', 'CAFÉ'], cafe_rooftop: ['CAFÉ {N}', 'TERRAZA {N}', 'CAFÉ'],
};
export const COMMERCIAL = new Set(Object.keys(TEXT).filter((k) => k !== 'townhall'));
export function signText(kind, rng, layout) { return rng.pick(TEXT[`${kind}_${layout}`] || TEXT[kind] || TEXT.shop).replace('{N}', rng.pick(NAMES)); }

export function autoSigns(b, c, masses, info, S) {
  const { rng, spec } = c, kind = spec.kind || 'house';
  if (!COMMERCIAL.has(kind) || !c.inhabited || !S) return;
  const rank = TIER_RANK[c.finish.tier] ?? 0, front = S.f;
  const fd = info.openings.find((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && o.side === 'front' && o.main);
  const W = {
    wall: rank <= 2 ? 3 : 1, board: rank >= 2 ? 2 : 0.6, prewar: c.retro ? 3 : c.prewar ? 1 : 0.2,
    neon: c.powered && rank >= 3 ? (rank >= 4 ? 4 : 1.5) : 0, roof: ['cantina', 'garage', 'shop'].includes(kind) && rank >= 2 ? 1 : 0,
  };
  let type = spec.signType || (c.layout === 'diner' ? 'roof' : c.layout === 'station' ? 'prewar' : rng.weighted(W));
  // the business's own name on its sign (most of the time; now and then just the trade)
  const own = spec.name || spec._name, text = spec.signText || (own && new RNG(`${spec.id}:signname`).chance(0.75) ? signFromName(own) : signText(kind, rng, c.layout));
  const R0 = ry(front), wallHex = '#' + c.colors.old.getHexString();
  const du = fd ? S.U(fd) : 0, chars = text.replace('\n', '').length;
  const push = (o) => info.signs.push({ text, ry: R0, rng: new RNG(`${spec.id}:sign`), ...o });
  if (type === 'neon' && info.fin) { // vertical neon down the fin
    const m = info.fin.mass, mr = (m.rot || 0) * Math.PI / 180, cs = Math.cos(mr), sn = Math.sin(mr);
    const fx = m.x + info.fin.x * cs + info.fin.z * sn, fz = m.z - info.fin.x * sn + info.fin.z * cs, sd = info.fin.x > 0 ? 1 : -1;
    const word = text.split(/[\n ]/)[0].slice(0, 8), h = Math.min(info.fin.h * 0.7, word.length * 0.55 + 0.4), r = c.lightR(false, true);
    info.signs.push({ text: word.split('').join('\n'), x: fx + sd * 0.14 * cs, y: info.fin.h - h / 2 - 0.3, z: fz - sd * 0.14 * sn, ry: mr + sd * Math.PI / 2, w: 0.85, h, style: 'neon', rng: new RNG(`${spec.id}:neon`), opts: { r } });
    info.lights.push({ x: fx + sd * 0.8 * cs, y: info.fin.h - h / 2, z: fz - sd * 0.8 * sn, color: LIGHT_COL[rng.pick(['neon_red', 'neon_blue', 'neon_pink'])], radius: 7, intensity: 1.1, kind: 'neon', r, flicker: true });
  } else if (info.nameBand && type !== 'roof' && !info.porch) { // a storefront's name band: the lettering goes on it, centred
    const nb = info.nameBand, m = nb.mass || { x: 0, z: 0, rot: 0 }, mr = (m.rot || 0) * Math.PI / 180, cs = Math.cos(mr), sn = Math.sin(mr);
    const x = (m.x || 0) + nb.x * cs + nb.z * sn, z = (m.z || 0) - nb.x * sn + nb.z * cs, w = Math.min(nb.w * 0.94, 1.2 + chars * 0.42), h = nb.h * 0.92;
    const style = type === 'neon' ? 'neon' : type === 'prewar' ? 'prewar' : type === 'board' ? 'painted' : 'wall', r = type === 'neon' ? c.lightR(false, true) : undefined;
    push({ x, y: nb.y, z, w, h, style, opts: { bg: wallHex, missing: type === 'prewar' ? 0.15 : 0, rust: type === 'prewar' || rank <= 1, r, level: true } });
    if (type === 'neon') info.lights.push({ x: x + front.nx * 0.6, y: nb.y, z: z + front.nz * 0.6, color: LIGHT_COL[rng.pick(['neon_red', 'neon_blue', 'neon_pink', 'neon_green'])], radius: 6, intensity: 1.0, kind: 'neon', r, flicker: true });
    S.takeWall?.(-nb.w / 2, nb.w / 2, nb.y - nb.h / 2, nb.y + nb.h / 2);
  } else if (type === 'roof') { // board on posts at the roof edge
    const w = Math.min(front.L * 0.8, 1.5 + chars * 0.32), h = 1.0, [x, z] = at(front, 0, -0.3), y = front.top + 0.4 + h / 2;
    b.t('wood'); for (const sd of [-1, 1]) { const [px, pz] = at(front, sd * (w / 2 - 0.3), -0.4); b.box(px, front.top + 0.5, pz, 0.1, 1.3, 0.1, col(WOOD.pole)); }
    push({ x, y, z, w, h, style: rng.chance(0.5) ? 'painted' : 'metal', rng: new RNG(`${spec.id}:roof`), opts: { rust: true } });
  } else if (info.porch) { // a porch hides the wall: a tall board stands on the porch beam, clear above the canopy
    const P = info.porch, w = Math.min(front.L * 0.75, 1.2 + chars * 0.36), h = 0.95, u = Math.max(-front.L / 2 + w / 2, Math.min(front.L / 2 - w / 2, du));
    const [x, z] = at(front, u, P.depth + 0.14), y0 = P.h + 0.95; // the canopy tops out ~h + 0.75 at the wall, lower at the beam
    b.t('wood'); for (const sd of [-1, 1]) { const [px, pz] = at(front, u + sd * (w / 2 - 0.25), P.depth + 0.08); b.box(px, (P.h + 0.25 + y0 + h) / 2, pz, 0.1, y0 + h - P.h - 0.25, 0.1, col(WOOD.pole)); }
    push({ x, y: y0 + h / 2, z, w, h, style: rng.chance(0.4) ? 'metal' : 'painted', opts: { rust: rank <= 1 } });
  } else {
    // on the wall: the biggest clear rectangle near the door, above it first, then anywhere on the face
    const big = type === 'wall';
    let w = Math.min(front.L * (big ? 0.85 : 0.6), (big ? 1.2 : 0.9) + chars * (big ? 0.42 : 0.3)), h = big ? 1.1 : 0.7, spot = null;
    const above = fd ? fd.y1 + 0.3 : 2.2;
    // clear of the roof: under a pitched / tin roof the eave, its rafter ends and gutter hang over the top of the wall and
    // hide it from above, so the lettering stays well below (a flat roof's parapet only needs a hand's width)
    const eave = c.roofType === 'flat' || c.roofType === 'none' ? 0 : c.roofLow ? 0.3 : c.S?.eave ?? (c.roofMat === 'thatch' ? 0.7 : c.vstyle === 'casona' ? 0.5 : 0.28);
    const lowTin = c.roofLow || c.roofType === 'shed' || c.vstyle === 'nortena'; // a low tin roof: its fascia and brackets hang well down the wall
    const lim = front.top - (eave ? 0.35 + eave * 0.9 + (lowTin ? 0.75 : 0.1) : 0.22);
    for (const k of [1, 0.85, 0.7, 0.58]) {
      const ww = w * k, hh = Math.max(0.45, h * (k > 0.8 ? 1 : 0.8));
      for (let y = above; y + hh <= lim && !spot; y += 0.1) { const u = S.findWall(du, ww, y, y + hh); if (u != null) spot = { u, y, w: ww, h: hh }; }
      if (!spot && big) for (let y = 0.8; y + hh <= lim && !spot; y += 0.1) { const u = S.findWall(du, ww, y, y + hh); if (u != null) spot = { u, y, w: ww, h: hh }; }
      if (spot) break;
    }
    if (spot) {
      S.takeWall(spot.u - spot.w / 2 - 0.1, spot.u + spot.w / 2 + 0.1, spot.y - 0.08, spot.y + spot.h + 0.08);
      const [x, z] = at(front, spot.u, big ? 0.012 : 0.08);
      const style = big ? 'wall' : type === 'board' ? (rng.chance(0.3) ? 'metal' : 'painted') : type === 'prewar' ? 'prewar' : 'neon';
      const r = type === 'neon' ? c.lightR(false, true) : undefined;
      push({ x, y: spot.y + spot.h / 2, z, w: spot.w, h: spot.h, style, opts: { bg: wallHex, missing: type === 'prewar' ? 0.15 : 0, rust: type === 'prewar' || rank <= 1, r } });
      if (type === 'neon') info.lights.push({ x: x + front.nx * 0.6, y: spot.y + spot.h / 2, z: z + front.nz * 0.6, color: LIGHT_COL[rng.pick(['neon_red', 'neon_blue', 'neon_pink', 'neon_green'])], radius: 6, intensity: 1.0, kind: 'neon', r, flicker: true });
    } else if (fd) { // no clear wall: a blade sign sticking out on a bracket beside the door
      const sd = rng.chance(0.5) ? 1 : -1, u = du + sd * (fd.w / 2 + 0.5), y = Math.min(front.top - 0.6, fd.y1 + 0.1);
      const [bx, bz] = at(front, u, 0.45);
      b.t('metal').box(bx, y + 0.36, bz, 0.04, 0.04, 0.95, col(METAL.dark), R0 + Math.PI / 2);
      info.signs.push({ text, x: bx, y, z: bz, ry: R0 + Math.PI / 2, w: 0.8, h: 0.6, style: rng.chance(0.5) ? 'painted' : 'metal', rng: new RNG(`${spec.id}:blade`), opts: { rust: rank <= 1, twoSided: true } });
    }
  }
  // small extras: ABIERTO plaque, chalkboard menu (each only where there's room)
  if (fd && rng.chance(0.35)) {
    const u = S.findWall(du + (rng.chance(0.5) ? -1 : 1) * (fd.w / 2 + 0.6), 0.66, 1.42, 1.68);
    if (u != null) { S.takeWall(u - 0.33, u + 0.33, 1.42, 1.68); const [x, z] = at(front, u, 0.05); info.signs.push({ text: 'ABIERTO', x, y: 1.55, z, ry: R0, w: 0.62, h: 0.22, style: rng.chance(0.5) ? 'painted' : 'metal', rng: new RNG(`${spec.id}:open`), opts: {} }); }
  }
  if (fd && ['cantina', 'kiosk', 'shop'].includes(kind) && rng.chance(0.4)) {
    const u = S.findGround(du + (rng.chance(0.5) ? -1 : 1) * (fd.w / 2 + 1.1), 0.7, 0.6, 1.2);
    if (u != null) {
      S.takeGround(u - 0.35, u + 0.35, 0.6, 1.2);
      const [x, z] = at(front, u, 0.9);
      b.t('wood'); b.box(x, 0.45, z, 0.62, 0.9, 0.04, col(WOOD.dark), R0, -0.18);
      const menu = rng.pick(['HOY\nCALDO · TACOS', 'MENÚ\nFRIJOLES · TORTILLAS', 'HAY\nAGUA · CERVEZA', 'HOY\nIGUANA · ARROZ']);
      info.signs.push({ text: menu, x: x + Math.sin(R0) * 0.03, y: 0.5, z: z + Math.cos(R0) * 0.03, ry: R0, w: 0.52, h: 0.6, style: 'chalk', rng: new RNG(`${spec.id}:chalk`), opts: { tilt: -0.18 } });
    }
  }
}

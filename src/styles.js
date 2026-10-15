// Building styles, each tied to the materials it is really built in.
// Post-war (new build) styles per material, regular and industrial pre-war styles. A style can set
// defaults (floor height, roof, parapet, wall layer, colours), a window scheme, and hooks that add parts
// per mass (`mass`) or per building (`after`), or replace a mass entirely (`custom`).
import * as THREE from 'three';
import { col } from './builder.js';
import { RNG } from './rng.js';
import { MAT, ROOF, WOOD, METAL } from './palette.js';
import { ellip, rod, tube } from './shapes.js';

const VIVID = [0x3f7fb0, 0xd86a8a, 0xe8c040, 0x5aa070, 0xe08a3a, 0x8a5ab0, 0x40a8a0, 0xc84a3a];
const at = (s, u, out) => [s.ax + s.dx * u + s.nx * out, s.az + s.dz * u + s.nz * out];

// ------------------------------------------------------------------ registry
export const STYLES = {
  // post-war
  adobe: { era: 'new', mats: ['adobe'], label: 'buttressed adobe' },
  plain: { era: 'new', mats: ['adobe', 'plaster', 'block', 'stone'], label: 'plain walls' },
  sonoran: { era: 'new', mats: ['adobe', 'plaster'], label: 'Sonoran row house (zaguán, canales)', roof: ['flat', 'flat_adobe'], parapet: 0.75, noPorch: true },
  pill: { era: 'new', mats: ['plaster', 'adobe', 'block'], label: 'rounded stucco (portholes)' },
  casona: { era: 'new', mats: ['plaster', 'stone', 'brick'], label: 'casona (arcade, balcony, tile roof)' },
  painted: { era: 'new', mats: ['plaster', 'block'], label: 'painted town house', roof: ['flat', 'slab'], parapet: 0.45 },
  nortena: { era: 'both', mats: ['plaster', 'block', 'brick', 'concrete'], label: 'norteña (one strong colour, low tin gable, herrería)', roof: ['gable', 'corrugated'], pitch: 6, eave: 0.35, fh: 2.7 },
  ranch_stone: { bare: true, era: 'new', mats: ['stone'], label: 'dry-stone ranch hut', fh: 2.6, layer: 'drystone', roof: ['gable', 'thatch|corrugated'], plinth: false },
  fieldstone: { era: 'new', mats: ['stone'], label: 'fieldstone house, tile gable', layer: 'stone', roof: ['gable', 'tile'] },
  casa_fuerte: { era: 'new', mats: ['stone', 'adobe'], label: 'casa fuerte (fortified)', thick: 0.7, roof: ['flat', 'flat_adobe'], parapet: 0.95, noPorch: true },
  obra_negra: { bare: true, era: 'new', mats: ['brick', 'block'], label: 'obra negra (concrete frame, rebar)', roof: ['flat', 'slab'], parapet: 0.0, plinth: false, raw: true, noPorch: true },
  boveda: { bare: true, era: 'new', mats: ['brick'], label: 'brick vaults (bóveda catalana)', roof: ['vaults', 'brick'], parapet: 0.2, raw: true },
  brick_front: { era: 'new', mats: ['brick'], label: 'plastered street front', roof: ['flat', 'slab'], parapet: 0.3, raw: true },
  block_box: { era: 'new', mats: ['block'], label: 'raw block, tin roof', roof: ['shed', 'corrugated'], raw: true, plinth: false },
  block_stack: { era: 'new', mats: ['block'], label: 'storeys added over time', roof: ['flat', 'slab'], parapet: 0.25, raw: true, floorsMin: 2 },
  block_shop: { era: 'new', mats: ['block'], label: 'block, steel roll-up shutters', roof: ['flat', 'slab'], parapet: 0.4, raw: true },
  cabin: { noBand: true, era: 'new', mats: ['timber'], label: 'board-and-batten cabin', roof: ['gable', 'corrugated|shingle'], fh: 2.7 },
  palapa: { hidden: true, era: 'new', mats: ['timber', 'adobe'], label: 'palapa (palm thatch)', roof: ['hip', 'thatch'], eave: 1.1, pitch: 34, fh: 2.6, noPorch: true },
  stilt: { bare: true, plinth: false, era: 'new', mats: ['timber'], label: 'fishing shack on stilts', roof: ['shed', 'corrugated'], fh: 2.5, stilts: true, noPorch: true },
  tin_shack: { bare: true, era: 'new', mats: ['metal'], label: 'corrugated shack', roof: ['shed', 'corrugated'], fh: 2.5, plinth: false },
  container: { bare: true, era: 'new', mats: ['metal'], label: 'shipping container conversion', custom: 'container', noPorch: true },
  quonset: { bare: true, era: 'new', mats: ['metal'], label: 'salvaged Quonset hut', custom: 'quonset', noPorch: true },
  bus_home: { bare: true, era: 'both', mats: ['metal'], label: 'pre-war bus home', custom: 'bus', noPorch: true, hidden: true },
  fuselage: { bare: true, era: 'both', mats: ['metal'], label: 'plane fuselage home', custom: 'fuselage', noPorch: true, hidden: true },
  rotunda: { era: 'both', mats: ['adobe', 'plaster', 'block'], label: 'round temple', custom: 'rotunda', noPorch: true, hidden: true },
  // pre-war, regular
  spanish: { era: 'prewar', mats: ['plaster', 'concrete', 'block'], label: 'Spanish revival', roof: ['hip|gable', 'tile'], eave: 0.35 },
  storefront: { era: 'prewar', mats: ['brick', 'plaster', 'concrete', 'block'], label: 'downtown storefront', roof: ['flat', 'slab'], parapet: 0.9 },
  midcentury: { era: 'prewar', mats: ['plaster', 'block', 'concrete', 'brick', 'stone'], label: 'mid-century', roof: ['flat', 'slab'], parapet: 0.0 },
  // pre-war, plain houses (no overhanging roofs)
  box_house: { era: 'prewar', mats: ['concrete', 'block', 'plaster'], label: 'plain box house (flat roof)', roof: ['flat', 'slab'], parapet: 0.3, fh: 2.9 },
  two_storey: { era: 'prewar', mats: ['plaster', 'concrete', 'block'], label: 'plain two-storey house', roof: ['flat', 'slab'], parapet: 0.35, fh: 2.85, floorsMin: 2 },
  low_gable: { era: 'prewar', mats: ['plaster', 'block', 'concrete'], label: 'low-gable house (flush eaves)', roof: ['gable', 'corrugated|shingle|corrugated|shingle|corrugated|shingle|tile'], pitch: 13, eave: 0.08, fh: 2.8 },
  patio_house: { era: 'prewar', mats: ['plaster', 'concrete', 'block'], label: 'courtyard house (walled front patio)', roof: ['flat', 'slab'], parapet: 0.3, fh: 2.9, noPorch: true, patio: true },
  // pre-war, industrial
  sawtooth: { era: 'prewar', ind: true, mats: ['brick', 'concrete', 'block'], label: 'sawtooth factory', roof: ['sawtooth', 'corrugated'], fh: 5.0, parapet: 0.3 },
  steel_shed: { era: 'prewar', ind: true, mats: ['metal', 'concrete', 'block'], label: 'steel-frame warehouse', roof: ['barrel|gable', 'corrugated'], fh: 5.5 },
  cannery: { era: 'prewar', ind: true, mats: ['brick', 'concrete'], label: 'cannery (brick, chimney)', roof: ['gable', 'corrugated'], fh: 5.0 },
  pumphouse: { era: 'prewar', ind: true, mats: ['concrete', 'brick', 'block'], label: 'pump house / substation', roof: ['flat', 'slab'], parapet: 0.25, fh: 3.6 },
  silos: { bare: true, era: 'prewar', ind: true, mats: ['concrete', 'metal'], label: 'silos', custom: 'silos', noPorch: true },
  retro: { era: 'prewar', mats: ['plaster', 'concrete', 'block', 'brick'], label: 'retro-futurist (later)', hidden: true },
};
export const STYLE_KEYS = Object.keys(STYLES);
export const eraOk = (k, era) => STYLES[k] && (STYLES[k].era === era || STYLES[k].era === 'both');
export const stylesFor = (era, mat) => STYLE_KEYS.filter((k) => !STYLES[k].hidden && eraOk(k, era) && (!mat || STYLES[k].mats.includes(mat)));

// auto choice by kind / era / material
const IND_KINDS = ['warehouse', 'barn', 'factory', 'pumphouse', 'silos'];
export function pickStyle(spec, era, mat, kindName, rng) {
  if (spec.vstyle && eraOk(spec.vstyle, era) && (!mat || STYLES[spec.vstyle].mats.includes(mat))) return spec.vstyle;
  const fl = spec.floors || 1, big = (spec.size?.[0] || 10) * (spec.size?.[1] || 8) > 110;
  const shopish = ['shop', 'cantina', 'cafe', 'store', 'office', 'hall', 'kiosk', 'clinic'].includes(kindName);
  // rounded stucco: only small service buildings (shops, cafés, clinics, offices, stands…)
  const area = (spec.size?.[0] || 10) * (spec.size?.[1] || 8), pillOk = ['shop', 'cantina', 'cafe', 'store', 'office', 'kiosk', 'clinic', 'trade', 'stand', 'comandancia'].includes(kindName) && area <= 100 && fl <= 2;
  const PILL = (k) => (pillOk ? k : 0);
  let W;
  if (era === 'prewar') {
    if (kindName === 'factory') W = { sawtooth: 2, cannery: 1.4 };
    else if (kindName === 'pumphouse') W = { pumphouse: 1 };
    else if (kindName === 'silos') W = { silos: 1 };
    else if (IND_KINDS.includes(kindName)) W = { steel_shed: 2, sawtooth: 1.2, cannery: 0.8 };
    else if (['workshop', 'garage'].includes(kindName)) W = { steel_shed: 1.6, storefront: 0.8, midcentury: 0.12 };
    else if (shopish) W = { storefront: 3, spanish: 0.15, midcentury: 0.15 };
    else if (kindName === 'house') W = { box_house: 2.5, two_storey: fl >= 2 ? 3 : 0.7, low_gable: 1.8, patio_house: big ? 1.6 : 0.5, midcentury: 0.12, spanish: 0.12, nortena: fl < 2 ? 2.6 : 0 };
    else W = { midcentury: 0.3, spanish: 0.3, storefront: 1 };
  } else {
    W = {
      adobe: { adobe: 1.5, plain: 2, sonoran: 1.2, pill: PILL(1.2), casona: fl >= 2 ? 3 : big ? 0.6 : 0.15, casa_fuerte: 0.2, palapa: 0 /* parked: broken */ },
      plaster: { pill: PILL(1.8), casona: fl >= 2 ? 3 : 0.4, painted: 2, sonoran: 1, plain: 1, nortena: fl < 2 ? 2.2 : 0 },
      stone: { ranch_stone: fl < 2 ? 1 : 0, fieldstone: 1.5, casa_fuerte: 0.6, plain: 0.5 },
      brick: { obra_negra: 2.5, boveda: fl < 2 ? 1 : 0.2, brick_front: shopish ? 2.5 : 1.2, casona: fl >= 2 ? 0.6 : 0, nortena: fl < 2 ? 0.8 : 0 },
      block: { block_box: fl < 2 ? 2 : 0.3, block_stack: fl >= 2 ? 3 : 0.4, block_shop: shopish ? 3 : 0.4, obra_negra: 1, painted: 1, pill: PILL(0.6), nortena: fl < 2 ? 1.6 : 0 },
      timber: { cabin: 2, palapa: 0 /* parked: broken */, stilt: kindName === 'house' && !spec._sub && !spec.inPlot ? 0.5 : 0 }, // stilts: fishing shacks only, never yard sheds
      metal: { tin_shack: 2, container: 1.2, quonset: ['workshop', 'garage', 'warehouse', 'barn'].includes(kindName) ? 2 : 0.6 },
      concrete: { painted: 1, plain: 1 },
    }[mat || 'adobe'] || { plain: 1 };
  }
  const keys = Object.keys(W).filter((k) => W[k] > 0 && (!mat || STYLES[k].mats.includes(mat)));
  if (!keys.length) return null;
  return rng.weighted(Object.fromEntries(keys.map((k) => [k, W[k]])));
}
// material a style is built in when the spec doesn't say
export const styleMaterial = (key, rng) => { const S = STYLES[key]; return S ? (S.mats.length > 1 ? rng.weighted(Object.fromEntries(S.mats.map((m, i) => [m, i === 0 ? 3 : 1]))) : S.mats[0]) : null; };
export const pickVariant = (v, rng) => (typeof v === 'string' && v.includes('|') ? rng.pick(v.split('|')) : v);

// ------------------------------------------------------------------ colours / layers
export function styleColors(key, c) {
  const { rng, colors, L, finish } = c;
  const tier = finish?.tier || 'none';
  const plainTier = ['none', 'faded'].includes(tier);
  switch (key) {
    case 'painted': if (plainTier) { colors.old = col(rng.pick(VIVID), 0.04, rng).lerp(colors.base.old, 0.25); L.old = 'plaster'; colors.trim = col(rng.pick([0xf0e8d8, 0x2a3a4a, 0x8a2a2a]), 0.03, rng); } break;
    case 'nortena': if (['none', 'faded', 'wash', 'painted'].includes(tier) && !c.spec?.color) { // one strong colour all round, faded by the sun
      const k = col(rng.pick([0x9a4a40, 0x8c3e36, 0xc89a4a, 0x8ab8a0, 0x8aa8c0, 0xd09a9a, 0xd8caa8, 0x5a9a7a, 0xb8a04a]), 0.04, rng).lerp(col(0xc8bca8), tier === 'faded' || tier === 'none' ? 0.3 : 0.15);
      colors.old = k; colors.neu = k.clone(); L.old = 'plaster'; L.neu = 'plaster'; colors.trim = col(rng.pick([0xe0dcd0, 0x6a4a3a, 0x3a3a38]), 0.03, rng);
    } break;
    case 'sonoran': if (plainTier && c.baseMat !== 'adobe') { colors.old = col(rng.pick([0xd8b890, 0xc88a6a, 0x9fb8a8, 0xe0c890]), 0.03, rng); L.old = 'plaster'; } break;
    case 'ranch_stone': L.old = 'drystone'; L.neu = 'drystone'; break;
    case 'fieldstone': L.old = 'stone'; L.neu = 'stone'; break;
    case 'obra_negra': case 'boveda': case 'block_box': case 'block_shop': case 'block_stack':
      if (plainTier) { L.old = MATL(c.baseMat); L.neu = MATL(c.newMat); colors.old = colors.base.old.clone(); colors.neu = colors.base.neu.clone(); } break;
    case 'brick_front': L.old = 'brick'; L.neu = 'brick'; colors.old = colors.base.old.clone(); colors.front = col(plainTier ? rng.pick(VIVID) : finish.body, 0.04, rng); break;
    case 'cabin': case 'stilt': L.old = 'fence_wood'; L.neu = 'fence_wood'; break;
    case 'tin_shack': L.old = 'corrugated'; L.neu = 'corrugated'; break;
    case 'spanish': if (plainTier) { colors.old = col(rng.pick([0xeee6d6, 0xe8dcc4, 0xf2ead8, 0xe0cfb0]), 0.02, rng); L.old = 'plaster'; } colors.trim = col(rng.pick([0x3a2a20, 0x4a3a2a, 0x2a2a28]), 0.03, rng); break;
    case 'storefront': if (plainTier && c.baseMat !== 'brick') { colors.old = col(rng.pick([0xd8c8a8, 0xc8b898, 0xb8c0b0, 0xe0d0b8]), 0.03, rng); L.old = 'plaster'; } break;
    case 'box_house': case 'two_storey': case 'low_gable': case 'patio_house': if (plainTier) { colors.old = col(rng.pick([0xe8e0d0, 0xdcd0b8, 0xd8c8a8, 0xc8d0c0, 0xe0d0c0, 0xd0b8a0]), 0.03, rng); L.old = 'plaster'; } break;
    case 'midcentury': if (plainTier) { colors.old = col(rng.pick([0xe8e0d0, 0xd8d0c0, 0xc8d8d0, 0xe0d8c8]), 0.02, rng); L.old = 'plaster'; } break;
    case 'steel_shed': if (c.baseMat === 'metal') { L.old = 'corrugated'; colors.old = col(rng.pick([0x8c9294, 0x9a5d3e, 0x7d8a80]), 0.05, rng); } break;
    case 'sawtooth': case 'cannery': if (c.baseMat === 'brick') { L.old = 'brick'; colors.old = colors.base.old.clone(); } break;
  }
}
const MATL = (m) => ({ adobe: 'adobe', plaster: 'plaster', stone: 'stone', brick: 'brick', concrete: 'concrete', block: 'block', timber: 'wood', metal: 'corrugated' }[m] || 'plaster');

// window scheme override (null = use the default)
export function styleWindows(key, c, s) {
  const st = c.kind.style;
  switch (key) {
    case 'sonoran': return { kind: 'win', w: 0.8, h: 1.6, sill: 0.7, bay: 2.8 };
    case 'ranch_stone': return { kind: 'win', w: 0.6, h: 0.7, sill: 1.1, bay: 4.2 };
    case 'fieldstone': return { kind: 'win', w: 0.8, h: 1.0, sill: 1.0, bay: 3.4 };
    case 'casa_fuerte': return { kind: 'win', w: 0.55, h: 0.7, sill: 1.5, bay: 4.0 };
    case 'obra_negra': case 'block_box': case 'block_stack': return { kind: 'win', w: 1.1, h: 1.1, sill: 1.0, bay: 3.0 };
    case 'block_shop': case 'brick_front': if (s.name === 'front' && st !== 'res') return { kind: 'store', w: 2.8, h: 2.1, sill: 0.4, bay: 3.4 }; return null;
    case 'cabin': case 'stilt': return { kind: 'win', w: 0.7, h: 0.8, sill: 1.0, bay: 3.2 };
    case 'tin_shack': return { kind: 'win', w: 0.7, h: 0.6, sill: 1.2, bay: 4.0 };
    case 'palapa': return null;
    case 'spanish': return { kind: 'win', w: 1.0, h: 1.6, sill: 0.75, bay: 2.8, arch: true };
    case 'storefront': if (s.name === 'front') return { kind: 'store', w: 3.0, h: 2.3, sill: 0.35, bay: 3.6 }; return { kind: 'win', w: 1.0, h: 1.3, sill: 1.0, bay: 3.2 };
    case 'midcentury': if ((s.name === 'front' || s.name === 'back') && st !== 'res') return { kind: 'ribbon', w: 99, h: 1.0, sill: 1.0, bay: 99 }; return { kind: 'win', w: 1.4, h: 1.0, sill: 1.1, bay: 3.6 }; // ribbon windows: offices / shops, never homes
    case 'box_house': case 'patio_house': return { kind: 'win', w: 1.2, h: 1.2, sill: 0.9, bay: 3.2 };
    case 'two_storey': return { kind: 'win', w: 1.0, h: 1.3, sill: 0.9, bay: 3.0 };
    case 'low_gable': return { kind: 'win', w: 1.2, h: 1.1, sill: 0.95, bay: 3.2 };
    case 'sawtooth': case 'cannery': return { kind: 'high', w: 2.2, h: 1.6, sill: 2.4, bay: 3.2 };
    case 'steel_shed': return { kind: 'high', w: 3.0, h: 0.7, sill: 4.0, bay: 4.5 };
    case 'pumphouse': return { kind: 'high', w: 1.2, h: 0.7, sill: 2.2, bay: 3.0 };
  }
  return null;
}

// ------------------------------------------------------------------ per-mass parts
// d = { w, d, wallH, parapet, t, m, floors }
export function styleMass(key, b, c, sides, d) {
  if (c.damage >= 0.6) return;
  const fn = MASS[key];
  if (fn) fn(b, c, sides, d);
}
const MASS = {
  sonoran(b, c, sides, d) { // canales (roof spouts) through the parapet, a zaguán gate in the front
    const { rng } = c;
    b.t('wood');
    for (const s of sides) {
      if (s.name !== 'front' && s.name !== 'back') continue;
      const n = Math.max(1, Math.round((s.u1 - s.u0) / 4.5));
      for (let i = 0; i < n; i++) {
        const u = s.u0 + ((i + 0.5) * (s.u1 - s.u0)) / n;
        if (s.openings.some((o) => u > o.u0 - 0.3 && u < o.u1 + 0.3 && o.y1 > d.wallH - 0.4)) continue;
        const [x, z] = at(s, u, 0.35);
        b.box(x, d.wallH + 0.12, z, 0.22, 0.14, 0.75, col(rng.chance(0.5) ? WOOD.dark : METAL.rust, 0.05, rng), s.ry + Math.PI / 2, -0.12);
      }
    }
    // parapet coping in a darker tone, stepped at the corners
    b.t(c.L.old);
    const cap = c.colors.old.clone().offsetHSL(0, 0, -0.06);
    for (const s of sides) { if (c.spec.party?.includes(s.name)) continue; const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.02); b.box(x, d.wallH + d.parapet - 0.04, z, s.u1 - s.u0, 0.1, 0.06, cap, s.ry); }
  },
  casa_fuerte(b, c, sides, d) { // merlons along the parapet, loopholes, a corner garita
    const { rng } = c, top = d.wallH + d.parapet, mc = c.colors.old.clone().offsetHSL(0, 0, -0.03);
    b.t(c.L.old);
    for (const s of sides) {
      if (c.spec.party?.includes(s.name)) continue;
      for (let u = s.u0 + 0.4; u < s.u1 - 0.3; u += 1.1) { const [x, z] = at(s, u, -d.t / 2); b.box(x, top + 0.22, z, 0.55, 0.44, d.t, mc, s.ry); }
      b.t('plain');
      for (let u = s.u0 + 1.2; u < s.u1 - 0.8; u += 2.4) { if (s.openings.some((o) => u > o.u0 - 0.4 && u < o.u1 + 0.4)) continue; const [x, z] = at(s, u, 0.006); b.box(x, d.wallH - 0.6, z, 0.12, 0.55, 0.01, col(0x141210), s.ry); }
      b.t(c.L.old);
    }
    if (d.m.main && rng.chance(0.7)) { // garita: a small round sentry turret on a corner
      const s = sides[2], [x, z] = at(s, s.u0 + 0.2, 0.2);
      b.sm().cyl(x, top + 0.5, z, 0.65, 0.5, 1.6, 16, mc).sm(false);
      b.t('plain'); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; b.box(x + Math.cos(a) * 0.62, top + 0.7, z + Math.sin(a) * 0.62, 0.1, 0.35, 0.03, col(0x141210), -a + Math.PI / 2); }
    }
  },
  obra_negra(b, c, sides, d) { // concrete frame: castillos at the corners and every ~3 m, dalas at each floor (no rebar sticking up)
    const { rng } = c, conc = col(0xa8a49a, 0.04, rng), fh = c.fh;
    for (const s of sides) {
      if (c.spec.party?.includes(s.name)) continue;
      const span = s.u1 - s.u0, n = Math.max(1, Math.round(span / 3.2));
      const cols = Array.from({ length: n + 1 }, (_, i) => s.u0 + (span * i) / n).filter((u) => !s.openings.some((o) => u > o.u0 - 0.1 && u < o.u1 + 0.1)); // openings were slid clear of these; any that couldn't move keep their gap
      b.t('concrete');
      for (const u of cols) { const [x, z] = at(s, u, 0.01); b.box(x, d.wallH / 2 + 0.1, z, 0.24, d.wallH + 0.2, d.t + 0.04, conc, s.ry); }
      for (let f = 1; f <= d.floors; f++) { // the dala breaks where a door (or any tall opening) runs through it
        const y = f * fh - 0.1, cuts = s.openings.filter((o) => o.y1 > y - 0.11 && o.y0 < y + 0.11).map((o) => [o.u0, o.u1]).sort((p, q) => p[0] - q[0]);
        let u = s.u0 - 0.02;
        for (const [o0, o1] of [...cuts, [s.u1 + 0.02, s.u1 + 0.02]]) { if (o0 - u > 0.05) { const [x, z] = at(s, (u + o0) / 2, 0.012); b.box(x, y, z, o0 - u, 0.22, d.t + 0.05, conc, s.ry); } u = Math.max(u, o1); }
      }
    }
  },
  brick_front(b, c, sides, d) { // the street face plastered + painted, with a raised false front
    const s = sides[2]; if (!s || c.spec.party?.includes('front')) return;
    const fc = c.colors.front || c.colors.old, top = d.wallH + d.parapet;
    b.t('plaster');
    const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.025);
    // plaster panel with the openings left clear: piers between openings + band above them
    const ops = s.openings.filter((o) => o.floor === 0).sort((p, q) => p.u0 - q.u0);
    let u = s.u0;
    for (const o of [...ops, { u0: s.u1, u1: s.u1, y1: 0 }]) { if (o.u0 - u > 0.05) { const [px, pz] = at(s, (u + o.u0) / 2, 0.025); b.box(px, (0.25 + d.wallH) / 2, pz, o.u0 - u, d.wallH - 0.25, 0.04, fc, s.ry); } u = Math.max(u, o.u1); }
    const yTop = Math.max(...ops.map((o) => o.y1), 2.4);
    b.box(x, (yTop + top + 0.5) / 2, z, s.u1 - s.u0 + 0.04, top + 0.5 - yTop, 0.05, fc, s.ry); // false front rises above the parapet
    b.t('concrete').box(x, top + 0.55, z, s.u1 - s.u0 + 0.12, 0.1, 0.16, fc.clone().offsetHSL(0, 0, 0.08), s.ry);
  },
  block_stack(b, c, sides, d) { // each storey in a different batch of block: tone shifts per floor
    const { rng } = c, fh = c.fh;
    for (let f = 1; f < d.floors; f++) {
      const tone = c.colors.old.clone().offsetHSL(0, rng.range(-0.02, 0.02), rng.range(-0.08, 0.08));
      b.t('block');
      for (const s of sides) {
        if (c.spec.party?.includes(s.name)) continue;
        const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.008);
        // a skin over the upper floor, holes for its openings
        const ops = s.openings.filter((o) => o.floor === f).sort((p, q) => p.u0 - q.u0);
        let u = s.u0;
        for (const o of [...ops, { u0: s.u1, u1: s.u1 }]) { if (o.u0 - u > 0.05) { const [px, pz] = at(s, (u + o.u0) / 2, 0.008); b.box(px, f * fh + fh / 2, pz, o.u0 - u, fh, 0.012, tone, s.ry); } u = Math.max(u, o.u1); }
        for (const o of ops) { const [px, pz] = at(s, (o.u0 + o.u1) / 2, 0.008); b.box(px, (f * fh + o.y0) / 2, pz, o.u1 - o.u0, o.y0 - f * fh, 0.012, tone, s.ry); b.box(px, (o.y1 + (f + 1) * fh) / 2, pz, o.u1 - o.u0, (f + 1) * fh - o.y1, 0.012, tone, s.ry); }
        void x; void z;
      }
    }
  },
  block_shop(b, c, sides) { shutters(b, c, sides); },
  storefront(b, c, sides, d) { // stepped false front with a name band and cornice, steel roll-up shutters
    const s = sides[2]; if (!s) return;
    const { rng } = c, top = d.wallH + d.parapet, fc = c.colors.old.clone().offsetHSL(0, 0, 0.04), tc = c.colors.trim.clone().lerp(c.colors.old, 0.4);
    const L = s.u1 - s.u0, mid = (s.u0 + s.u1) / 2;
    b.t(c.L.old);
    const [x, z] = at(s, mid, 0.03);
    b.box(x, top + 0.45, z, L * 0.5, 0.9, 0.08, fc, s.ry); // centre step of the false front
    b.t('concrete');
    for (const [y, h, out] of [[d.wallH + 0.05, 0.12, 0.12], [top + 0.02, 0.1, 0.1], [top + 0.92, 0.1, 0.1]]) { const [cx, cz] = at(s, mid, out / 2 + 0.03); b.box(cx, y, cz, y > top + 0.5 ? L * 0.5 + 0.1 : L + 0.1, h, out, tc, s.ry); }
    b.t('plaster'); const [bx, bz] = at(s, mid, 0.045); b.box(bx, d.wallH - 0.5, bz, L * 0.8, 0.6, 0.02, tc.clone().offsetHSL(0, 0, -0.05), s.ry); // name band
    { const [nx0, nz0] = at(s, mid, 0.07); c.info.nameBand = { side: 'front', x: nx0, z: nz0, y: d.wallH - 0.5, w: L * 0.8, h: 0.6, mass: c.mass }; } // the shop sign is painted on it (decor.js autoSigns)
    shutters(b, c, [s]);
    void rng;
  },
  midcentury(b, c, sides, d) { // mixed materials (stone / timber / brick cladding), flush roof slab edge, carport
    const { rng } = c, s = sides[2]; if (!s) return;
    const slab = c.colors.old.clone().offsetHSL(0, -0.03, 0.06), e = 0.03;
    b.t('concrete').box(0, d.wallH + 0.06, 0, d.w + 2 * e, 0.12, d.d + 2 * e, slab); // flush roof slab edge (no overhanging eaves: they clipped added storeys and stairs)
    // mixed materials: one end of the house clad in stone, timber boards or brick, or a stone base along the walls
    const scheme = rng.weighted({ stone_end: 2, timber_end: 1.5, brick_end: 1, stone_base: 1.5, stone_timber: 1 });
    const stoneC = col(rng.pick(MAT.stone.wall), 0.05, rng), woodC = col(rng.pick([WOOD.dark, 0x8a6a4a, 0x6a4a32, 0xa07a50]), 0.05, rng), brickC = col(rng.pick(MAT.brick.wall), 0.04, rng);
    const clear = (sd, a, z, y1) => !sd.openings.some((o) => z > o.u0 - 0.1 && a < o.u1 + 0.1 && o.y0 < y1);
    const panel = (sd, a, z, y0, y1, kind) => { // a cladding layer over the wall from u = a to z, height y0..y1
      const W = z - a; if (W < 0.4) return; const [x, zz] = at(sd, (a + z) / 2, 0.045);
      if (kind === 'timber') { b.t('wood').box(x, (y0 + y1) / 2, zz, W, y1 - y0, 0.06, woodC, sd.ry); for (let u = a + 0.15; u < z - 0.05; u += 0.3) { const [bx, bz] = at(sd, u, 0.08); b.box(bx, (y0 + y1) / 2, bz, 0.05, y1 - y0, 0.03, woodC.clone().offsetHSL(0, 0, -0.05), sd.ry); } }
      else b.t(kind).box(x, (y0 + y1) / 2, zz, W, y1 - y0, 0.09, kind === 'stone' ? stoneC : brickC, sd.ry);
    };
    const visible = sides.filter((sd) => !c.spec.party?.includes(sd.name) && sd.name !== 'back');
    if (scheme === 'stone_base') { // a stone band along the base, broken at the doors
      for (const sd of visible) { let u = sd.u0; for (const o of [...sd.openings.filter((o) => o.y0 < 0.95).sort((p, q) => p.u0 - q.u0), { u0: sd.u1, u1: sd.u1 }]) { panel(sd, u, Math.min(o.u0, sd.u1), 0.2, 0.95, 'stone'); u = Math.max(u, o.u1); } }
    } else { // a full-height end: the whole short run of wall at one end of the front, round the corner onto the side
      const kind = scheme === 'timber_end' ? 'timber' : scheme === 'brick_end' ? 'brick' : 'stone', L = s.u1 - s.u0, sd0 = rng.chance(0.5) ? 1 : -1;
      const runs = (sd) => { const ops = sd.openings.filter((o) => o.y0 < d.wallH).sort((p, q) => p.u0 - q.u0); return sd0 > 0 ? [sd.u1 - Math.max(1.2, (ops.length ? sd.u1 - ops[ops.length - 1].u1 - 0.15 : (sd.u1 - sd.u0) * 0.3)), sd.u1] : [sd.u0, sd.u0 + Math.max(1.2, (ops.length ? ops[0].u0 - sd.u0 - 0.15 : (sd.u1 - sd.u0) * 0.3))]; };
      if (L > 5) { const [a, z] = runs(s), w = Math.min(z - a, L * 0.4), a2 = sd0 > 0 ? z - w : a, z2 = sd0 > 0 ? z : a + w; if (clear(s, a2, z2, d.wallH)) panel(s, a2, z2, 0.2, d.wallH, kind); }
      if (scheme === 'stone_timber') for (const sd of visible.filter((q) => q !== s)) { let u = sd.u0; for (const o of [...sd.openings.filter((o) => o.y0 < 0.95).sort((p, q) => p.u0 - q.u0), { u0: sd.u1, u1: sd.u1 }]) { panel(sd, u, Math.min(o.u0, sd.u1), 0.2, 0.9, 'stone'); u = Math.max(u, o.u1); } }
    }
    if (d.m.main) {
      if (['house', 'garage', undefined].includes(c.spec.kind) && rng.chance(0.6) && d.w > 7) { // carport off one side: posts + flat roof
        const sd = rng.chance(0.5) ? 1 : -1, cw = 3.2, cd = Math.min(6, d.d + 1), cx = sd * (d.w / 2 + cw / 2);
        b.t('metal'); for (const [px, pz] of [[cx + sd * (cw / 2 - 0.2), -cd / 2 + 0.3], [cx + sd * (cw / 2 - 0.2), cd / 2 - 0.3]]) b.cyl(px, 1.25, pz, 0.06, 0.06, 2.5, 8, col(METAL.dark));
        b.t('concrete').box(cx, 2.55, 0, cw, 0.12, cd, slab);
      }
    }
  },
  box_house(b, c, sides, d) { doorCanopy(b, c, sides[2], d); downpipe(b, c, sides, d); },
  patio_house(b, c, sides, d) { if (d.m.main) doorCanopy(b, c, sides[2], d); downpipe(b, c, sides, d); },
  two_storey(b, c, sides, d) { // a thin slab line at the upper floor, a downpipe; the balcony comes with the openings
    const s = sides[2]; if (s && d.floors >= 2 && !c.spec.party?.includes('front')) { b.t('concrete'); const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.03); b.box(x, c.fh - 0.05, z, s.u1 - s.u0 + 0.06, 0.14, 0.06, c.colors.old.clone().offsetHSL(0, -0.03, 0.06), s.ry); }
    if (d.m.main && !s?.openings.some((o) => o.balcony)) doorCanopy(b, c, s, d);
    downpipe(b, c, sides, d);
  },
  low_gable(b, c, sides, d) { // a carport off one side: steel posts and a flat tin roof
    if (!d.m.main || c.spec.kind !== 'house' && c.spec.kind != null || d.w < 7 || !c.rng.chance(0.55)) return;
    const { rng } = c, sd = rng.chance(0.5) ? 1 : -1, cw = 3.0, cd = Math.min(5.5, d.d), cx = sd * (d.w / 2 + cw / 2);
    if (c.spec.party?.includes(sd > 0 ? 'right' : 'left')) return;
    b.t('metal'); for (const pz of [-cd / 2 + 0.3, cd / 2 - 0.3]) b.cyl(cx + sd * (cw / 2 - 0.15), 1.15, pz, 0.05, 0.05, 2.3, 8, col(METAL.dark));
    b.box(cx + sd * (cw / 2 - 0.15), 2.3, 0, 0.08, 0.12, cd, col(METAL.dark));
    b.t('corrugated').box(cx, 2.4, 0, cw + 0.1, 0.05, cd + 0.2, col(rng.pick(ROOF.corrugated), 0.05, rng), 0, 0, -sd * 0.06);
    (c.info.sideUse ||= {})[sd > 0 ? 'right' : 'left'] = 1;
  },
  spanish(b, c, sides, d) { // arcade portal on the main front, wrought-iron grilles come from the window scheme
    if (!d.m.main || c.info.porchBuilt) return;
    const { rng } = c, s = sides[2]; if (!s) return;
    const L = s.u1 - s.u0; if (L < 6) return;
    const n = Math.max(3, Math.round(L / 2.4)), depth = 2.2, h = 2.6, pc = c.colors.old.clone();
    b.t(c.L.old);
    for (let i = 0; i <= n; i++) { const u = s.u0 + 0.3 + ((L - 0.6) * i) / n, [x, z] = at(s, u, depth); b.box(x, h / 2, z, 0.45, h, 0.45, pc, s.ry); }
    // arches between the piers: a band with arched cut-outs approximated by stepped blocks
    for (let i = 0; i < n; i++) {
      const u0 = s.u0 + 0.3 + ((L - 0.6) * i) / n, u1 = s.u0 + 0.3 + ((L - 0.6) * (i + 1)) / n, um = (u0 + u1) / 2, half = (u1 - u0) / 2 - 0.22;
      for (let k = 0; k < 7; k++) { const a = (k / 6) * Math.PI, du = Math.cos(a) * half, dy = Math.sin(a) * half * 0.6; const [x, z] = at(s, um + du, depth); b.box(x, h - 0.05 + dy / 2 + 0.3, z, 0.45, 0.6 - dy, 0.4, pc, s.ry); }
    }
    const [x, z] = at(s, (s.u0 + s.u1) / 2, depth / 2);
    b.t('roof_tile').box(x, h + 0.75, z, L + 0.2, 0.12, depth + 0.6, col(rng.pick(ROOF.tile), 0.04, rng), s.ry, -0.18);
    b.t('dirt').box(x, 0.32, z, L, 0.1, depth, col(0xb06a48, 0.04, rng), s.ry); // terracotta floor
    c.info.porchBuilt = true; c.info.porch = c.info.porch || { depth, h };
  },
  sawtooth(b, c, sides, d) { // loading dock along the front, a water tank on legs at one corner
    if (!d.m.main) return;
    const { rng } = c, s = sides[2];
    b.t('concrete').box(...at(s, (s.u0 + s.u1) / 2, 1.2).flatMap((v, i) => (i === 0 ? [v, 0.55] : [v])), s.u1 - s.u0, 1.1, 2.4, col(0x9a948a, 0.03, rng), s.ry);
  },
  cannery(b, c, sides, d) { // tall brick chimney at a back corner, a loading door with a hoist beam
    if (!d.m.main) return;
    const { rng } = c, s = sides[0], [x, z] = at(s, s.u0 + 1.2, -1.2), H = d.wallH + rng.range(7, 11);
    b.t('brick').sm().cyl(x, H / 2, z, 0.55, 0.85, H, 14, col(rng.pick(MAT.brick.wall), 0.04, rng)).sm(false);
    b.t('concrete').box(x, H + 0.1, z, 1.3, 0.25, 1.3, col(0x6a6660));
    for (let k = 1; k < 4; k++) b.t('metal').sm().cyl(x, (H * k) / 4, z, 0.62 + (1 - k / 4) * 0.25, 0.62 + (1 - k / 4) * 0.25, 0.08, 14, col(METAL.dark)).sm(false);
  },
  pumphouse(b, c, sides, d) { // pipes into the walls with valve wheels; a transformer platform on the side
    if (!d.m.main || (c.layout && c.layout !== 'pumping')) return;
    const { rng } = c, pc = col(rng.pick([0x5f6f62, METAL.rust, 0x4a5a6a]), 0.05, rng);
    for (const s of [sides[1], sides[3]]) {
      const u = (s.u0 + s.u1) / 2, [x0, z0] = at(s, u, 0), [x1, z1] = at(s, u, 3.5);
      b.t('metal'); tube(b, [[x1, 0.6, z1], [(x0 + x1) / 2, 0.6, (z0 + z1) / 2], [x0, 0.6, z0]], [0.22, 0.22, 0.22], pc, { cap: false, seg: 14 });
      const [vx, vz] = at(s, u, 1.6); b.sm().cyl(vx, 1.1, vz, 0.05, 0.05, 0.9, 8, col(METAL.dark)).sm(false);
      b.sm().cyl(vx, 1.55, vz, 0.3, 0.3, 0.04, 16, col(METAL.paint_red)).sm(false);
    }
    const s = sides[2], [tx, tz] = at(s, s.u1 - 1.2, 1.6);
    b.t('concrete').box(tx, 0.3, tz, 2.2, 0.6, 1.6, col(0x9a948a));
    b.t('metal'); for (let k = 0; k < 3; k++) b.sm().cyl(tx - 0.7 + k * 0.7, 1.05, tz, 0.26, 0.26, 0.9, 14, col(0x8a8f8c, 0.04, rng)).sm(false);
  },
  ranch_stone(b, c, sides, d) { // a stick-and-thatch ramada against the front
    if (!d.m.main || c.rng.chance(0.4)) return;
    const s = sides[2], L = Math.min(s.u1 - s.u0, 5), u = (s.u0 + s.u1) / 2, pc = col(WOOD.pole, 0.06, c.rng);
    b.t('bark'); for (const k of [-1, 1]) { const [x, z] = at(s, u + (k * L) / 2, 2); b.cyl(x, 1.1, z, 0.07, 0.08, 2.2, 6, pc); }
    const [x, z] = at(s, u, 1.0); b.t('thatch').box(x, 2.25, z, L + 0.4, 0.14, 2.4, col(c.rng.pick(ROOF.thatch), 0.05, c.rng), s.ry, -0.12);
  },
  cabin(b, c, sides) { // battens over the boards
    const { rng } = c, bc = c.colors.old.clone().offsetHSL(0, 0, -0.06);
    b.t('fence_wood');
    for (const s of sides) for (let u = s.u0 + 0.3; u < s.u1 - 0.2; u += 0.45) { if (s.openings.some((o) => u > o.u0 - 0.05 && u < o.u1 + 0.05 && o.y0 < 0.5)) continue; const [x, z] = at(s, u, 0.02); b.box(x, s.wallH / 2 + 0.12, z, 0.06, s.wallH - 0.25, 0.03, bc, s.ry); }
    void rng;
  },
  stilt(b, c, sides, d) { cabinBattens(b, c, sides); },
  palapa(b, c, sides, d) { // open-sided: posts at the corners and between, low wall only (walls are cut by the window scheme)
    const pc = col(WOOD.pole, 0.06, c.rng);
    b.t('bark');
    for (const s of sides) for (let u = s.u0; u <= s.u1 + 0.01; u += Math.max(1.6, (s.u1 - s.u0) / Math.max(1, Math.round((s.u1 - s.u0) / 2.4)))) { const [x, z] = at(s, u, 0.05); b.cyl(x, d.wallH / 2, z, 0.1, 0.12, d.wallH, 7, pc); }
  },
};
const cabinBattens = (b, c, sides) => MASS.cabin(b, c, sides);

// steel roll-up shutters (cortinas) in a box over each wide ground-floor opening; some half down
function shutters(b, c, sides) {
  const { rng } = c;
  for (const s of sides) for (const o of s.openings) {
    if (o.floor !== 0 || !['store', 'bigdoor'].includes(o.type)) continue;
    const um = (o.u0 + o.u1) / 2, w = o.u1 - o.u0, [x, z] = at(s, um, 0.1), sc = col(rng.pick([0x8c9294, 0x6a7a6a, 0x9a5d3e, 0x5a6670]), 0.05, rng);
    b.t('metal').box(x, o.y1 + 0.16, z, w + 0.2, 0.3, 0.25, sc.clone().offsetHSL(0, 0, -0.06), s.ry);
    const down = c.inhabited ? (rng.chance(0.3) ? rng.range(0.2, 0.6) : 0.06) : rng.range(0.7, 1);
    const hh = (o.y1 - o.y0) * down; if (hh < 0.05) continue;
    b.t('corrugated').box(...at(s, um, 0.06).flatMap((v, i) => (i === 0 ? [v, o.y1 - hh / 2] : [v])), w, hh, 0.03, sc, s.ry);
  }
}

// ------------------------------------------------------------------ whole-mass replacements
export function styleCustom(key, b, c, d) {
  const fn = CUSTOM[STYLES[key]?.custom];
  if (!fn) return false;
  fn(b, c, d);
  return true;
}
const CUSTOM = {
  container(b, c, d) { // one or two 20/40 ft boxes, ribbed walls, corner castings, end doors, cut windows
    const { rng } = c, m = d.m, H = 2.59, W = 2.44;
    const runs = Math.max(1, Math.round(m.w / W)), L = m.d;
    const pal = [0x9a3a2a, 0x2a5a8a, 0x3a6a4a, 0xb0802a, 0x6a6a6a, 0x8a4a2a];
    const stack = (c.floors || 1) >= 2 ? 2 : 1;
    for (let k = 0; k < stack; k++) for (let i = 0; i < runs; i++) {
      const x = -m.w / 2 + W / 2 + i * W, y = k * H, cc = col(rng.pick(pal), 0.05, rng);
      b.t('corrugated').box(x, y + H / 2, 0, W, H, L, cc);
      b.t('metal');
      for (let z = -L / 2 + 0.15; z < L / 2; z += 0.3) for (const sg of [-1, 1]) b.box(x + sg * (W / 2 + 0.01), y + H / 2, z, 0.03, H - 0.25, 0.1, cc.clone().offsetHSL(0, 0, -0.04)); // ribs
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (const yy of [y + 0.08, y + H - 0.08]) b.box(x + sx * (W / 2 - 0.08), yy, sz * (L / 2 - 0.08), 0.18, 0.16, 0.18, col(METAL.dark));
      // end doors (front), a window cut in the side, rust
      b.box(x, y + H / 2, L / 2 + 0.02, W - 0.15, H - 0.2, 0.03, cc.clone().offsetHSL(0, 0, -0.07));
      for (const sx of [-0.5, -0.15, 0.15, 0.5]) b.box(x + sx, y + H / 2, L / 2 + 0.05, 0.03, H - 0.3, 0.04, col(METAL.steel));
      if (c.inhabited) { b.t('plain'); b.box(x + W / 2 + 0.03, y + 1.4, 0, 0.02, 0.8, 1.2, col(0x1c2226)); }
      b.t('rust'); for (let r = 0; r < 3; r++) b.box(x + (rng.chance(0.5) ? -1 : 1) * (W / 2 + 0.02), y + rng.range(0.3, 2), rng.range(-L / 2 + 0.5, L / 2 - 0.5), 0.01, rng.range(0.3, 1), rng.range(0.4, 1.5), col(METAL.rust, 0.08, rng));
    }
    c.info.height = Math.max(c.info.height, stack * H + 1);
    if (c.inhabited) { const fx = -m.w / 2 + W / 2; c.info.frontDoor = { x: m.x + fx, z: m.z + L / 2, nx: 0, nz: 1, tx: 1, tz: 0, w: 1, y: 2, sill: 0.1 }; }
  },
  quonset(b, c, d) { // half-cylinder of corrugated sheet, end walls with a door and two windows
    const { rng } = c, m = d.m, R = Math.min(m.w / 2, 4.2), L = m.d;
    const cc = col(rng.pick([0x8c9294, 0x7d8a80, 0x9a8a70, 0x6e7a6a]), 0.05, rng), seg = 18;
    b.t('corrugated');
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI, am = (a0 + a1) / 2;
      const x = Math.cos(am) * R, y = Math.sin(am) * R, sw = 2 * R * Math.sin((a1 - a0) / 2) + 0.02;
      b.box(x, y, 0, 0.05, sw, L, i % 5 === 2 && rng.chance(0.5) ? cc.clone().offsetHSL(0, 0, -0.08) : cc, 0, 0, am - Math.PI / 2 + Math.PI / 2);
    }
    b.t('metal');
    for (let z = -L / 2 + 0.6; z < L / 2; z += 1.8) for (let i = 0; i < seg; i++) { const am = ((i + 0.5) / seg) * Math.PI; b.box(Math.cos(am) * (R + 0.04), Math.sin(am) * (R + 0.04), z, 0.04, 2 * R * Math.sin(Math.PI / seg / 2) * 2, 0.08, cc.clone().offsetHSL(0, 0, -0.05), 0, 0, am); }
    // end walls: fan of boxes under the arch
    for (const sg of [-1, 1]) {
      b.t(sg > 0 ? 'wood' : 'corrugated');
      const ec = sg > 0 ? col(WOOD.weathered, 0.05, rng) : cc.clone().offsetHSL(0, 0, -0.03);
      for (let i = 0; i < 8; i++) { const x0 = -R + (2 * R * i) / 8, x1 = x0 + (2 * R) / 8, xm = (x0 + x1) / 2, h = Math.sqrt(Math.max(0, R * R - xm * xm)); b.box(xm, h / 2, sg * L / 2, x1 - x0 + 0.01, h, 0.06, ec); }
    }
    b.t('door').box(0, 1.15, L / 2 + 0.04, 1.6, 2.3, 0.05, col(WOOD.dark, 0.05, rng));
    b.t('plain'); for (const sx of [-R * 0.55, R * 0.55]) b.box(sx, 1.6, L / 2 + 0.04, 0.8, 0.6, 0.03, col(0x1c2226));
    c.info.height = Math.max(c.info.height, R + 1);
    c.info.frontDoor = { x: m.x, z: m.z + L / 2, nx: 0, nz: 1, tx: 1, tz: 0, w: 1.6, y: 2.2, sill: 0.1 };
  },
  bus(b, c, d) { // a pre-war bus on blocks, long along x: the window band, some boarded, a door near the front, junk on the roof
    const { rng } = c, m = d.m, L = m.w, W = Math.min(2.6, m.d), y0 = 0.45, H = 2.6;
    const body = col(rng.pick([0xc8a040, 0x4a6a8a, 0x5a7a5a, 0xd8d4c8, 0x8a4a3a]), 0.06, rng), dark = col(0x1c2226), plate = () => col(rng.pick([METAL.rust, 0x7a6a58, 0x6a6a6a]), 0.08, rng);
    b.t('concrete'); for (const x of [-L / 2 + 1.2, -L / 6, L / 6, L / 2 - 1.4]) for (const sz of [-1, 1]) b.box(x, y0 / 2, sz * (W / 2 - 0.35), 0.4, y0, 0.4, col(0x9a968c, 0.04, rng)); // blocks
    b.t('metal').box(0, y0 + H / 2, 0, L, H, W, body).box(0, y0 + H + 0.08, 0, L - 0.3, 0.16, W - 0.25, body.clone().offsetHSL(0, 0, -0.04));
    b.box(0, y0 + 0.55, 0, L + 0.02, 0.18, W + 0.02, body.clone().offsetHSL(0, -0.1, -0.12)); // the rub strip
    for (let x = -L / 2 + 0.9; x < L / 2 - 2.2; x += 1.25) for (const sz of [-1, 1]) {
      const boarded = rng.chance(0.35);
      b.t(boarded ? 'rust' : 'plain').box(x, y0 + 1.85, sz * (W / 2 + 0.01), 1.05, 0.75, 0.02, boarded ? plate() : dark);
    }
    b.t('plain').box(L / 2 + 0.01, y0 + 1.8, 0, 0.02, 0.9, W - 0.3, dark); // windscreen
    b.t('door').box(L / 2 - 1.3, y0 + 1.1, W / 2 + 0.02, 0.9, 2.1, 0.03, dark);
    b.t('metal'); for (const [x, sz] of [[L / 2 - 1.6, 1], [-L / 2 + 1.6, -1]]) b.cyl(x, 0.48, sz * (W / 2 - 0.1), 0.48, 0.48, 0.28, 10, col(0x2a2826), Math.PI / 2); // what wheels are left
    b.t('rust'); for (let k = 0; k < 2; k++) b.cyl(rng.range(-L / 3, L / 3), y0 + H + 0.32, rng.range(-0.4, 0.4), 0.45, 0.45, 0.25, 10, col(0x2a2826)); // tires on the roof
    b.t('metal').cyl(-L / 3, y0 + H + 0.6, -W / 4, 0.07, 0.07, 1.2, 6, col(METAL.dark)); // a stovepipe
    c.info.height = Math.max(c.info.height, y0 + H + 1);
    c.info.frontDoor = { x: m.x + L / 2 - 1.3, z: m.z + W / 2, nx: 0, nz: 1, tx: 1, tz: 0, w: 0.9, y: 2, sill: y0 };
  },
  rotunda(b, c, d) { // a round temple: a fat drum, a smaller drum stacked on it, a cone roof, the sect's sign on the spire, rays round the door
    const { rng } = c, m = d.m, R = Math.min(m.w, m.d) / 2 - 0.1, H1 = 3.4, H2 = 2.0, n = 18, wc = c.colors.old, tc = c.colors.trim || col(0x4a3a2a);
    const pc = col(rng.pick([0xb83a2a, 0xd8a838, 0xe8e0d0, 0x3a8a6a]), 0.03, rng), dark = col(0x1c2226);
    const drum = (r, y0, h, cc) => { for (let k = 0; k < n; k++) { const a = ((k + 0.5) / n) * Math.PI * 2, sw = 2 * r * Math.sin(Math.PI / n) + 0.04; b.box(Math.sin(a) * r, y0 + h / 2, Math.cos(a) * r, sw, h, 0.35, cc, a); } };
    b.t(c.L.old); drum(R, 0, H1, wc); b.cyl(0, H1 - 0.05, 0, R, R, 0.1, n, wc.clone().offsetHSL(0, 0, -0.05));
    b.t(c.L.old); drum(R * 0.62, H1, H2, wc.clone().offsetHSL(0, 0, 0.03)); b.cyl(0, H1 + H2 - 0.05, 0, R * 0.62, R * 0.62, 0.1, n, wc);
    b.t('stone').cyl(0, H1 + 0.08, 0, R + 0.18, R + 0.18, 0.16, n, tc); // the cornice
    b.t(rng.chance(0.5) ? 'corrugated' : 'tile').cone(0, H1 + H2 + 1.1, 0, R * 0.72, 2.2, n, col(rng.pick([0x8a6a4a, 0x7a7a72, 0xa8643c]), 0.05, rng));
    b.t('metal').box(0, H1 + H2 + 2.6, 0, 0.08, 1.2, 0.08, col(METAL.dark));
    const y0 = H1 + H2 + 3.4; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.box(Math.cos(a) * 0.5, y0 + Math.sin(a) * 0.5, 0, 0.26, 0.08, 0.08, pc, 0, 0, a + Math.PI / 2); }
    b.box(0, y0, 0, 0.45, 0.18, 0.08, pc).box(0, y0, 0.05, 0.15, 0.15, 0.06, dark);
    b.t('door').box(0, 1.2, R + 0.19, 1.3, 2.4, 0.06, col(WOOD.dark, 0.05, rng));
    b.t('plain'); for (let k = 0; k < 7; k++) { const a = 0.12 * Math.PI + (k / 6) * 0.76 * Math.PI; b.box(Math.cos(a) * 1.15, 2.45 + Math.sin(a) * 0.75 + 0.15, R + 0.2, 0.42, 0.09, 0.01, pc, 0, 0, a); } // a sunburst over the door, never on it
    for (let k = 0; k < n; k += 3) { const a = ((k + 0.5) / n) * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) continue; b.box(Math.sin(a) * (R + 0.19), 2.3, Math.cos(a) * (R + 0.19), 0.45, 0.45, 0.02, dark, a); } // small windows
    c.info.height = Math.max(c.info.height, y0 + 1);
    c.info.frontDoor = { x: m.x, z: m.z + R + 0.18, nx: 0, nz: 1, tx: 1, tz: 0, w: 1.3, y: 2.4, sill: 0.1 };
  },
  fuselage(b, c, d) { // a plane's body on the sand, long along x: nose, stub wings, the tail fin, round windows, a cut door
    const { rng } = c, m = d.m, L = m.w, R = Math.min(2, m.d / 2), cy = R + 0.15;
    const al = col(rng.pick([0xb8bcbc, 0xa8aca8, 0xc8c4b8]), 0.04, rng), stripe = col(rng.pick([0x3a5a8a, 0x8a3a2a, 0x3a6a4a]), 0.05, rng), dark = col(0x1c2226);
    b.t('metal').sm().cyl(0, cy, 0, R, R, L, 16, al, 0, 0, Math.PI / 2);
    b.cone(L / 2 + 1.0, cy, 0, R, 2.0, 16, al, 0, 0, -Math.PI / 2);
    b.cone(-L / 2 - 1.6, cy + 0.3, 0, R * 0.9, 3.2, 16, al, 0, 0, Math.PI / 2).sm(false);
    b.box(-L / 2 - 1.2, cy + R + 1.0, 0, 2.2, 2.2, 0.14, stripe, 0, 0, 0.35); // the fin
    for (const sz of [-1, 1]) b.box(rng.range(-0.5, 0.5), cy - R * 0.4, sz * (R + 1.6), 2.6, 0.18, 3.2, al.clone().offsetHSL(0, 0, -0.04)); // stub wings
    b.t('plain').box(0, cy + 0.15, R * 0.98, L * 0.95, 0.12, 0.02, stripe);
    for (let x = -L / 2 + 1; x < L / 2 - 0.5; x += 0.9) if (rng.chance(0.85)) b.box(x, cy + 0.6, R * 0.94, 0.32, 0.38, 0.03, dark);
    b.t('door').box(L / 2 - 2.0, cy - 0.15, R * 0.92, 0.95, 1.9, 0.05, dark);
    b.t('wood').box(L / 2 - 2.0, 0.2, R + 0.5, 1.2, 0.12, 1.0, col(WOOD.weathered)); // a step
    b.t('dirt').box(0, 0.12, 0, L + 1.0, 0.24, R * 1.6, col(0xb09878, 0.04, rng)); // sand drifted under it
    c.info.height = Math.max(c.info.height, cy + R + 2.2);
    c.info.frontDoor = { x: m.x + L / 2 - 2.0, z: m.z + R, nx: 0, nz: 1, tx: 1, tz: 0, w: 0.95, y: 1.9, sill: 0.3 };
  },
  silos(b, c, d) { // a row of 2–4 concrete or steel silos with cone tops, a headhouse, ladders and a conveyor
    const { rng } = c, m = d.m, steel = c.baseMat === 'metal';
    const n = Math.max(2, Math.min(4, Math.round(m.w / 4.2))), R = Math.min(2.1, m.w / n / 2 - 0.1), H = rng.range(10, 16);
    const sc = steel ? col(rng.pick([0x9aa0a0, 0x8c9294]), 0.04, rng) : col(rng.pick(MAT.concrete.wall), 0.04, rng);
    for (let i = 0; i < n; i++) {
      const x = -m.w / 2 + m.w * (i + 0.5) / n;
      b.t(steel ? 'corrugated' : 'concrete').sm().cyl(x, H / 2, 0, R, R, H, 24, sc).cone(x, H + 0.7, 0, R + 0.05, 1.4, 24, sc.clone().offsetHSL(0, 0, -0.05)).sm(false);
      b.t('rust'); for (let k = 0; k < 3; k++) { const a = rng.range(0, Math.PI * 2), y = rng.range(2, H - 1); b.box(x + Math.cos(a) * (R + 0.01), y, Math.sin(a) * (R + 0.01), 0.15, rng.range(1, 3), 0.01, col(METAL.rust, 0.08, rng), -a + Math.PI / 2); }
      b.t('metal'); for (const sg of [-1, 1]) rod(b, [x + sg * 0.2, 0.2, R + 0.15], [x + sg * 0.2, H, R + 0.15], 0.02, col(METAL.dark), 4);
      for (let y = 0.5; y < H; y += 0.4) rod(b, [x - 0.2, y, R + 0.15], [x + 0.2, y, R + 0.15], 0.012, col(METAL.dark), 4);
    }
    // headhouse on top + conveyor down to a loading shed
    b.t('corrugated').box(0, H + 1.8, 0, m.w * 0.9, 2.2, 2.4, col(0x8c9294, 0.05, rng));
    b.t('metal'); rod(b, [m.w / 2 - 0.5, H + 1.2, 0], [m.w / 2 + 6, 1.5, 0], 0.35, col(METAL.rust, 0.05, rng), 8);
    b.t('corrugated').box(m.w / 2 + 6.5, 1.6, 0, 3, 3.2, 3.5, col(0x7d8a80, 0.05, rng));
    c.info.height = Math.max(c.info.height, H + 4);
    c.info.frontDoor = { x: m.x + m.w / 2 + 6.5, z: m.z + 1.75, nx: 0, nz: 1, tx: 1, tz: 0, w: 1.2, y: 2.2, sill: 0.1 };
  },
};

// small shared parts for the plain pre-war houses
function doorCanopy(b, c, s, d) { // a thin concrete slab over the front door
  const dr = s?.openings.find((o) => o.type === 'door' && o.floor === 0); if (!dr) return;
  const [x, z] = at(s, (dr.u0 + dr.u1) / 2, 0.42); b.t('concrete').box(x, dr.y1 + 0.18, z, dr.u1 - dr.u0 + 0.7, 0.1, 0.85, c.colors.old.clone().offsetHSL(0, -0.03, 0.05), s.ry);
}
function downpipe(b, c, sides, d) { // a rain pipe down one back corner from the parapet
  const s = sides[0]; if (!s || c.spec.party?.includes(s.name)) return;
  const [x, z] = at(s, s.u0 + 0.35, 0.08); b.t('metal').cyl(x, (d.wallH + d.parapet) / 2, z, 0.05, 0.05, d.wallH + d.parapet, 8, col(c.rng.pick([0x8a8e8c, 0x6a6c6a, 0xd8d4c8]), 0.04, c.rng));
}

// the courtyard house: rooms across the back with a wing (or two) forward round a walled front patio
export function patioMasses(spec, rng) {
  const [w, d] = spec.size || [12, 11];
  const t = Math.max(3.6, Math.min(5, Math.min(w, d) * 0.38)), ww = Math.max(3, Math.min(4.2, w * 0.28)), dw = d - t;
  const out = [{ x: 0, z: -d / 2 + t / 2, w, d: t, main: true }];
  if (dw < 3) return out;
  const two = w >= 11 && rng.chance(0.65), side = rng.chance(0.5) ? 1 : -1;
  for (const sd of two ? [-1, 1] : [side]) out.push({ x: sd * (w / 2 - ww / 2), z: d / 2 - dw / 2, w: ww, d: dw, noDoor: true });
  return out;
}
// the patio's street wall with its gate, and the patio floor (structure frame)
export function patioAfter(b, c, masses) {
  if (c.damage >= 0.6) return null;
  const { rng } = c, m = masses[0], [w, d] = c.spec.size || [12, 11], wings = masses.slice(1);
  if (!wings.length) return null;
  const z0 = m.z + m.d / 2, z1 = d / 2;
  let xa = -w / 2, xb = w / 2;
  for (const q of wings) { if (q.x < 0) xa = q.x + q.w / 2; else xb = q.x - q.w / 2; }
  const H = 1.9, th = 0.22, wc = c.colors.old.clone().offsetHSL(0, 0, -0.02), zf = z1 - th / 2, gw = 1.2, gx = (xa + xb) / 2 + rng.range(-0.25, 0.25) * (xb - xa - gw - 1);
  b.t(c.L.old);
  for (const [a, e] of [[xa, gx - gw / 2], [gx + gw / 2, xb]]) if (e - a > 0.05) b.box((a + e) / 2, H / 2, zf, e - a, H, th, wc);
  for (const sd of [-1, 1]) if (!wings.some((q) => Math.sign(q.x) === sd)) { const x = sd * (w / 2 - th / 2); b.box(x, H / 2, (z0 + z1) / 2, th, H, z1 - z0, wc); } // L plan: the open side walled too
  b.t('concrete'); for (const x of [gx - gw / 2 - 0.15, gx + gw / 2 + 0.15]) b.box(x, H / 2 + 0.1, zf, 0.3, H + 0.2, 0.3, wc.clone().offsetHSL(0, 0, -0.03));
  // a steel gate: frame and bars, sometimes left ajar
  const gc = col(rng.pick([0x2a2a28, 0x3a4a3a, 0x5a2a20, METAL.rust]), 0.05, rng), ajar = rng.chance(0.3) ? 0.6 : 0;
  b.pushT(gx - gw / 2, 0, zf, -ajar);
  b.t('metal'); for (const y of [0.1, 1.0, 1.75]) b.box(gw / 2, y, 0, gw, 0.05, 0.04, gc);
  for (let k = 0; k <= 8; k++) b.box((k * gw) / 8, 0.92, 0, 0.025, 1.7, 0.025, gc);
  b.box(gw / 2, 0.5, 0.01, gw - 0.04, 0.8, 0.015, gc);
  b.pop();
  // the patio floor: cement or tile
  b.t(rng.chance(0.5) ? 'saltillo' : 'concrete').box((xa + xb) / 2, 0.03, (z0 + z1) / 2, xb - xa, 0.06, z1 - z0 - th, col(rng.pick([0xa8a296, 0xb06a48, 0x9a948a]), 0.04, rng));
  return { x: (xa + xb) / 2, z: (z0 + z1) / 2, w: xb - xa, d: z1 - z0 };
}

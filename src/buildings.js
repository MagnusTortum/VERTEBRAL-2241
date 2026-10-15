// Gridless procedural buildings.
// A building = 1..n rotated rectangular masses. Walls are generated per side as columns of
// solid spans (so openings, broken tops and two-material rebuilds all fall out of one routine).
// Origin tags drive how pre-war fabric and new construction mix (Roman-provinces model).
import * as THREE from 'three';
import { Builder, col } from './builder.js';
import { RNG, makeNoise, clamp, smooth, deg } from './rng.js';
import { MAT, ROOF, WOOD, METAL, GLASS, MISC, LADRILLO } from './palette.js';
import { makeSign } from './signs.js';
import { muralTexture } from './textures.js';
import { mapMaterial } from './materials.js';
import { MAT_LAYER, ROOF_LAYER } from './layers.js';
import { rollFinish, settlementOf, TIER_RANK } from './finishes.js';
import { buildDecor, autoSigns, frontSpace } from './decor.js';
import { LIGHT_COL } from './presets.js';
import { toWorld, toLocal, obb, obbOverlap } from './geo.js';
import { sideShade, pickShadeSide } from './sideshade.js';
import { roofGarden, roofLevel, roofPower } from './roofgarden.js';
import { lathe, rod } from './shapes.js';
import { buildStand, standSize } from './stands.js';
import { dressValley } from './kinds2.js';
import { dressDen } from './kinds3.js';
import { dressUtility } from './utilities.js';
import { kindLayout, layoutFloors, layoutRoof, layoutMasses, layoutPorch, roomBays, kindColors, dressKind } from './kinds.js';
import { STYLES, STYLE_KEYS, eraOk, pickStyle, styleMaterial, pickVariant, styleColors, styleWindows, styleMass, styleCustom, patioMasses, patioAfter } from './styles.js';

const POWER_ODDS = { none: 0, scarce: 0.3, some: 0.65, grid: 0.95 };
const _v3 = new THREE.Vector3();

// the editor's origin choices + adaptations; legacy origins map onto them
export const ORIGIN_CHOICES = { new: 'New build (Baja vernacular)', prewar: 'Pre-war', mixed: 'Pre-war base + new build' };
export const ADAPTATIONS = { bricked: 'Bricked / boarded openings', leanto: 'Scrap lean-tos', newroof: 'New roof (tin)' };
export function resolveOrigin(spec) {
  let o = spec.origin || 'new', share = spec.newShare, ruinType = spec.ruinType || null;
  const adapt = new Set(spec.adapt || []);
  if (o === 'maintained') o = 'prewar';
  else if (o === 'repurposed') { o = 'prewar'; adapt.add('bricked'); }
  else if (o === 'rebuilt') { o = 'mixed'; share ??= 0.4; }
  else if (o === 'built_on_ruin') { o = 'mixed'; share ??= 0.8; }
  else if (o === 'ruin') { o = 'prewar'; ruinType ||= 'collapsed'; }
  else if (o === 'stripped') { o = 'prewar'; ruinType = 'stripped'; }
  let internal = o === 'new' ? 'new' : o === 'mixed' ? ((share ?? 0.5) < 0.6 ? 'rebuilt' : 'built_on_ruin') : adapt.has('bricked') ? 'repurposed' : 'maintained';
  // a legacy ruin without a condition keeps its old look
  if (spec.condition == null && (spec.origin === 'ruin' || spec.origin === 'stripped')) internal = spec.origin;
  return { choice: o, internal, share: share ?? 0.5, ruinType: ruinType || 'collapsed', adapt, arch: o === 'new' ? 'vern' : o === 'mixed' ? 'mixed' : 'prewar' };
}
export const ORIGINS = {
  new: 'New build',
  maintained: 'Pre-war, maintained since the war',
  repurposed: 'Pre-war, repurposed',
  rebuilt: 'Rebuilt on pre-war walls/foundation',
  built_on_ruin: 'New storey built on a pre-war ruin',
  ruin: 'Ruin, partly collapsed',
  stripped: 'Stripped shell (scavenged for material)',
};
const PREWAR_MATS = ['concrete', 'block', 'brick', 'plaster'];

const KINDS = {
  house:     { fh: 3.0, style: 'res', doors: 1 },
  shop:      { fh: 3.4, style: 'shop', doors: 1, awning: true },
  cantina:   { fh: 3.4, style: 'res', doors: 2, porch: true },
  workshop:  { fh: 4.2, style: 'ind', doors: 1, bigdoor: true },
  garage:    { fh: 4.2, style: 'ind', doors: 0, bigdoor: true },
  warehouse: { fh: 5.0, style: 'ind', doors: 1, bigdoor: true, roof: 'gable', roofMat: 'corrugated' },
  barn:      { fh: 4.5, style: 'none', doors: 0, bigdoor: true, roof: 'gable', roofMat: 'corrugated', material: 'timber' },
  shelter:   { fh: 3.0, style: 'res', doors: 3, porch: true },
  chapel:    { fh: 5.5, style: 'chapel', doors: 1, roof: 'gable', roofMat: 'tile', bell: true },
  shed:      { fh: 2.6, style: 'none', doors: 1, roof: 'shed', roofMat: 'corrugated' },
  outhouse:  { fh: 2.2, style: 'none', doors: 1, roof: 'shed', roofMat: 'corrugated', material: 'timber' },
  office:    { fh: 3.3, style: 'reg', doors: 1 },
  hall:      { fh: 4.0, style: 'reg', doors: 2 },
  tower:     { fh: 3.2, style: 'reg', doors: 1 },
  kiosk:     { fh: 3.0, style: 'shop', doors: 1 },
  ruin:      { fh: 3.2, style: 'reg', doors: 1 },
  canopy:    { fh: 5 },
  shack:     { fh: 2.3 },
  // security / military / reinforced: thick concrete, gun slits, steel doors, sandbagged roof
  guardpost: { fh: 2.8, style: 'mil', doors: 1, material: 'concrete', roof: 'flat', roofMat: 'slab', mil: true },
  barracks:  { fh: 3.0, style: 'mil', doors: 2, material: 'concrete', roof: 'flat', roofMat: 'slab', mil: true },
  bunker:    { fh: 2.4, style: 'mil', doors: 1, material: 'concrete', roof: 'flat', roofMat: 'slab', mil: true },
  armory:    { fh: 3.4, style: 'mil', doors: 1, bigdoor: true, material: 'concrete', roof: 'flat', roofMat: 'slab', mil: true },
  // pre-war industry
  factory:   { fh: 5.0, style: 'ind', doors: 1, bigdoor: true },
  pumphouse: { fh: 3.6, style: 'ind', doors: 1 },
  silos:     { fh: 4, style: 'none', doors: 0 },
  // kinds with layouts (kinds.js)
  posada:    { fh: 3.0, style: 'res', doors: 1 },
  store:     { fh: 3.4, style: 'shop', doors: 1, awning: true },
  clinic:    { fh: 3.2, style: 'reg', doors: 1 },
  cafe:      { fh: 3.2, style: 'shop', doors: 1 },
  // batch 7: the rest of the valley town
  mission:   { fh: 6.0, style: 'chapel', doors: 1, roof: 'gable', roofMat: 'tile', bell: true },
  granary:   { fh: 3.4, style: 'none', doors: 1, lift: 0.9 },
  mill:      { fh: 3.2, style: 'res', doors: 1 },
  bodega:    { fh: 4.0, style: 'ind', doors: 1, bigdoor: true },
  townhall:  { fh: 3.6, style: 'reg', doors: 1 },
  comandancia: { fh: 3.2, style: 'reg', doors: 1 },
  trade:     { fh: 3.2, style: 'shop', doors: 1 },
  pemex:     { fh: 3.0, style: 'shop', doors: 1, roof: 'flat', roofMat: 'slab' },
  utility:   { fh: 3.6, style: 'ind', doors: 1, roof: 'flat', roofMat: 'slab' }, // pre-war technical (utilities.js)
  den:       { fh: 3.2, style: 'shop', doors: 1 }, // the wasteland: brothel, gambling den, chop shop, gun runner... (kinds3.js)
};

// kinds whose style is fixed
const KIND_STYLE = { silos: 'silos', pumphouse: 'pumphouse', utility: 'pumphouse' };
const THICK_MIL = 0.55;
const THICK = { adobe: 0.45, plaster: 0.35, stone: 0.5, brick: 0.3, concrete: 0.25, block: 0.22, timber: 0.14, metal: 0.08 };
// liveries: a faction's design code, applied to every building (and wall) of its compounds.
// Hermandad del Camino (Danyil, toned down): plain whitewash, a bright white stripe along the top and a black
// stripe along the foot. Nothing else: doors, shutters, porches and roofs are whatever the builder used.
export const LIVERIES = {
  hermandad: { label: 'Hermandad del Camino', body: 0xe6e0d0, wash: true, band: 0x232321, bandH: 0.8, border: 0xfbfaf6, borderH: 0.32 },
};
const TRIM_PAINT = [0x4f6f86, 0x5f7f5a, 0x8a4a3a, 0x6e5a44, 0x3f5f6a, 0xa07a3a, 0x7a3f3f];

function defaultRoof(mat, rng) {
  switch (mat) {
    case 'adobe': return ['flat', 'flat_adobe'];
    case 'plaster': return rng.chance(0.95) ? ['flat', 'slab'] : ['gable', 'tile'];
    case 'stone': return rng.chance(0.9) ? ['flat', 'flat_adobe'] : ['gable', 'tile'];
    case 'brick': return ['flat', 'slab'];
    case 'concrete': return ['flat', 'slab'];
    case 'block': return rng.chance(0.6) ? ['flat', 'slab'] : ['shed', 'corrugated'];
    case 'timber': return rng.chance(0.5) ? ['gable', 'corrugated'] : ['gable', 'shingle'];
    case 'metal': return ['shed', 'corrugated'];
  }
  return ['flat', 'slab'];
}

// roof presets offered in the editor: [roofType, roofMat]
export const ROOF_STYLES = {
  flat: ['flat', 'slab'], mud: ['flat', 'flat_adobe'], shed: ['shed', 'corrugated'],
  gable_tile: ['gable', 'tile'], gable_tin: ['gable', 'corrugated'], gable_shingle: ['gable', 'shingle'],
  hip_tile: ['hip', 'tile'], hip_tin: ['hip', 'corrugated'], none: ['none', 'slab'],
};
const PASTEL = [0x7fbfb5, 0xe0a08a, 0xeadfc0, 0xa8d0b8, 0xe6c88a, 0x9fb8d8, 0xd8a8b8];
export const VSTYLES = STYLE_KEYS;
export const GLASS_TINTS = [0x2c3438, 0x2a3a3e, 0x34382e, 0x3a3630, 0x303a44];
const FLAT_MATS = ['slab', 'flat_adobe', 'tar'];

// mixed heights: the main mass stands tallest, wings step down and their roofs become terraces
function mixHeights(masses, spec, floors0, roofType, rng) {
  if (spec.heights !== 'mixed' || masses.length < 2) return;
  const top = Math.max(2, floors0);
  for (const m of masses) {
    if (m.floors) continue;
    m.floors = m.main ? top : Math.max(1, top - 1 - (top > 2 && rng.chance(0.3) ? 1 : 0));
  }
  if (['collapsed', 'none'].includes(roofType)) return;
  for (const m of masses) if (m.floors < top) {
    m.terrace = true;
    if (!m.roof) m.roof = 'flat';
    m.rail = rng.weighted({ parapet: 3, railing: 2 });
    m.shade = rng.chance(0.45) ? rng.pick(['latilla', 'tin', 'cloth']) : null;
    m.stair = rng.chance(0.4);
  }
}

// is the wall point (mass-local u along side s) up against another mass? returns that mass
function coveredBy(c, s, u) {
  const m = c.mass, r = deg(m.rot || 0);
  const [wx, wz] = toWorld(s.ax + s.dx * u + s.nx * 0.35, s.az + s.dz * u + s.nz * 0.35, r);
  const px = m.x + wx, pz = m.z + wz;
  for (const o of c.masses || []) {
    if (o === m) continue;
    const [qx, qz] = toWorld(px - o.x, pz - o.z, -deg(o.rot || 0));
    if (Math.abs(qx) < o.w / 2 && Math.abs(qz) < o.d / 2) return o;
  }
  return null;
}

// height of a flat roof surface above the structure's base (for roof gardens / rooftop props)
const UPPER_NORMAL = new Set(['workshop', 'garage', 'warehouse', 'bodega', 'factory', 'barn', 'pumphouse']);
export function roofTop(spec) {
  const k = KINDS[spec.kind] || KINDS.house, f = layoutFloors(spec), h = spec.floorH || k.fh;
  return h + (f - 1) * (UPPER_NORMAL.has(spec.kind) ? Math.min(h, 3.1) : h) + 0.02;
}
export const KIND_ROOF = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.roof || null]));

// ---------------------------------------------------------------------------------------------
// Pre-war + new build: people keep what stands and rebuild what doesn't. One plan per building (spec.mix, or
// picked from the new-build share and what fits): patched · newroof (old walls, a new roof) · infill (the pre-war
// frame, new walls between) · storey (new floor on a pre-war base) · wing (one part pre-war, the other rebuilt) ·
// leanto (new rooms against a standing pre-war block) · ruin (a new house inside the pre-war ruin's walls) ·
// salvage (a new house wearing pre-war parts). The seam always reads: material, colour, thickness.
export const MIX_KINDS = { patched: 'patched damage', newroof: 'new roof on pre-war walls', infill: 'pre-war frame, new walls', storey: 'new storey on a pre-war base', wing: 'one wing rebuilt', leanto: 'new rooms against a pre-war block', ruin: 'new house inside a ruin', salvage: 'new house, salvaged parts' };
const MIX_ON = true; // pre-war + new build plans: switched on when the batch is finished
export function mixPlan(spec) {
  if (!MIX_ON) return null;
  const O = resolveOrigin(spec);
  if (O.choice !== 'mixed' || spec.kind === 'stand' || spec.kind === 'shack' || spec.kind === 'canopy') return null;
  const r = new RNG(`${spec.id}:mix`), share = O.share, [w, d] = spec.size || [10, 7], fl = spec.floors || 1, single = !spec.shape || spec.shape === 'rect';
  let kind = MIX_KINDS[spec.mix] ? spec.mix : null;
  if (!kind) {
    if (spec.origin === 'built_on_ruin' && spec.newShare == null) kind = 'storey'; // legacy maps
    else kind = r.weighted({
      patched: share < 0.4 ? 3 : share < 0.6 ? 0.8 : 0, newroof: fl === 1 ? 2 * (1 - Math.abs(share - 0.4)) : 0.3, infill: share > 0.3 && share < 0.85 ? 1.5 : 0.4,
      storey: fl >= 2 ? 3 : 1.2, wing: w >= 8 ? 2 : 0.4, leanto: d >= 6 ? 1.5 : 0.5, ruin: w * d >= 90 && share >= 0.5 ? 1.2 : 0, salvage: share > 0.75 ? 2 : 0,
    });
  }
  return { kind, share, single, side: r.chance(0.5) ? 1 : -1, r: r.next() };
}
function mixMasses(spec, base, P) {
  const [w, d] = spec.size || [10, 7], k = clamp(P.share, 0.25, 0.75);
  const old = (m) => ({ ...m, part: 'old', ...(spec.roof ? {} : { roof: 'flat', roofMat: 'slab' }) }), neu = (m) => ({ ...m, part: 'new' });
  if (P.kind === 'wing') {
    if (base.length > 1) return base.map((m) => (m.main ? old(m) : neu({ ...m, doors: 1 })));
    const m = base[0], wn = Math.max(3, Math.min(m.w - 3, m.w * k)), wo = m.w - wn, sd = P.side;
    return [old({ ...m, x: m.x - sd * wn / 2, w: wo }), neu({ ...m, main: false, x: m.x + sd * wo / 2, w: wn, doors: 1, floors: 1 })];
  }
  if (P.kind === 'leanto') {
    const m = base.find((q) => q.main) || base[0], ld = Math.max(2.4, Math.min(3.6, m.d * 0.38)), lw = Math.max(3, m.w * (0.5 + 0.4 * k));
    if (m.d - ld < 3.5) return base.map(old);
    const rest = base.filter((q) => q !== m).map(old);
    return [old({ ...m, z: m.z + ld / 2, d: m.d - ld }), ...rest, neu({ x: m.x + P.side * (m.w - lw) / 2, z: m.z - m.d / 2 + ld / 2, w: lw, d: ld, floors: 1, fh: 2.5, roof: 'shed', roofMat: 'corrugated', doors: 0, noDoor: true, leanto: true })];
  }
  if (P.kind === 'ruin') { // the new house sits at the back of the old footprint; the ruin's walls are drawn round the whole of it
    const nw = Math.max(4, w * 0.55), nd = Math.max(3.5, d * 0.5);
    return [neu({ x: P.side * (w - nw) / 4, z: -d / 2 + nd / 2 + 0.6, w: nw, d: nd, main: true, floors: 1 })];
  }
  if (P.kind === 'salvage') return base.map(neu);
  const newRoof = spec.roof ? {} : P.r < 0.6 ? { roof: 'shed', roofMat: 'corrugated' } : { roof: 'flat', roofMat: 'flat_adobe' };
  return base.map((m) => ({ ...m, part: P.kind === 'storey' ? 'storey' : 'old', ...(P.kind === 'newroof' ? newRoof : P.kind === 'storey' || spec.roof ? {} : { roof: 'flat', roofMat: 'slab' }) }));
}

export function massesFor(spec, rng) {
  const P = !spec.masses && !kindLayout(spec) ? mixPlan(spec) : null;
  if (P) { const base = massesFor({ ...spec, origin: 'new', mix: null }, rng); return mixMasses(spec, base, P); }
  if (spec.masses) return spec.masses.map((m) => ({ x: 0, z: 0, rot: 0, ...m }));
  if (spec.kind === 'stand') { const [w, d] = standSize(spec); return [{ x: 0, z: 0, w, d, main: true }]; }
  const lm = layoutMasses(spec, kindLayout(spec));
  if (lm) return lm;
  const [w, d] = spec.size || [10, 7];
  const shape = spec.shape || 'rect';
  const flip = spec.flip ? -1 : 1;
  switch (shape) {
    case 'L': {
      const dm = d * 0.5, ww = w * (spec.wing ?? 0.42), dw = d - dm;
      return [
        { x: 0, z: d / 2 - dm / 2, w, d: dm, main: true },
        { x: flip * (-w / 2 + ww / 2), z: -d / 2 + dw / 2, w: ww, d: dw },
      ];
    }
    case 'T': {
      const dm = d * 0.5, ww = w * (spec.wing ?? 0.4), dw = d - dm;
      return [{ x: 0, z: d / 2 - dm / 2, w, d: dm, main: true }, { x: 0, z: -d / 2 + dw / 2, w: ww, d: dw }];
    }
    case 'U': {
      const dm = d * 0.45, ww = w * (spec.wing ?? 0.3), dw = d - dm;
      return [
        { x: 0, z: d / 2 - dm / 2, w, d: dm, main: true },
        { x: -w / 2 + ww / 2, z: -d / 2 + dw / 2, w: ww, d: dw },
        { x: w / 2 - ww / 2, z: -d / 2 + dw / 2, w: ww, d: dw },
      ];
    }
    case 'H': {
      const ww = w * (spec.wing ?? 0.28), dc = d * 0.5;
      return [
        { x: 0, z: 0, w: w - 2 * ww, d: dc, main: true },
        { x: -w / 2 + ww / 2, z: 0, w: ww, d },
        { x: w / 2 - ww / 2, z: 0, w: ww, d },
      ];
    }
    case 'stepped': { // two offset blocks (Z plan)
      const dd = d * 0.78, off = (d - dd) / 2;
      return [{ x: -w / 4, z: off * flip, w: w / 2, d: dd, main: true }, { x: w / 4, z: -off * flip, w: w / 2, d: dd }];
    }
    case 'courtyard': {
      const t = spec.range ?? Math.min(w, d) * 0.26;
      return [
        { x: 0, z: d / 2 - t / 2, w, d: t, main: true },
        { x: 0, z: -d / 2 + t / 2, w, d: t },
        { x: -w / 2 + t / 2, z: 0, w: t, d: d - 2 * t, noDoor: true },
        { x: w / 2 - t / 2, z: 0, w: t, d: d - 2 * t, noDoor: true },
      ];
    }
    default:
      if (spec.heights === 'mixed' && w >= 7) { // a lower wing at one end
        const ww = w * (spec.wing ?? 0.4);
        return [{ x: -flip * ww / 2, z: 0, w: w - ww, d, main: true }, { x: flip * (w - ww) / 2, z: 0, w: ww, d }];
      }
      return [{ x: 0, z: 0, w, d, main: true }];
  }
}

// ---------------------------------------------------------------------------------------------
export function buildStructure(spec, seed, opts = {}) {
  if (spec.kind === 'canopy') return buildCanopy(spec, seed);
  if (spec.kind === 'shack') return buildShack(spec, seed, opts);
  if (spec.kind === 'stand') return buildStand(spec, seed, opts);
  const rng = new RNG(`${seed}:${spec.id}${spec.v ? ':' + spec.v : ''}`);
  const noise = makeNoise(`${seed}:${spec.id}${spec.v ? ':' + spec.v : ''}:n`);
  const kind = KINDS[spec.kind] || KINDS.house;
  // origin model (editor): new = Baja vernacular · prewar = pre-war fabric · mixed = pre-war base with new
  // work on top (newShare). Old values still load. Internally the older origin names drive the fabric.
  const O = resolveOrigin(spec);
  let origin = O.internal;
  const prewar = ['maintained', 'repurposed', 'rebuilt', 'built_on_ruin', 'ruin', 'stripped'].includes(origin);
  const arch = O.arch, vern = arch === 'vern' && !prewar && !kind.mil;
  // styles belong to materials (styles.js): post-war ('new') styles per material, regular / industrial
  // pre-war ones. Retro-futurist is parked: only an explicit vstyle 'retro' gets it.
  const vrng = new RNG(`${seed}:${spec.id}:vstyle`);
  const era = vern ? 'new' : 'prewar';
  const forced = KIND_STYLE[spec.kind] || (spec.kind === 'den' ? { bus: 'bus_home', fuselage: 'fuselage', gatehouse: 'plain', rotunda: 'rotunda' }[kindLayout(spec)] : null);
  const styleOk = !kind.mil && !['shack', 'pemex', 'outhouse'].includes(spec.kind) && (vern || prewar); // an outhouse is just a plank box
  let material = spec.material || kind.material || (forced && STYLES[forced] ? styleMaterial(forced, vrng) : spec.vstyle && eraOk(spec.vstyle, era) && spec.vstyle !== 'retro' ? styleMaterial(spec.vstyle, vrng) : prewar ? rng.pick(['concrete', 'block', 'plaster']) : 'adobe');
  const layStyle = { diner: 'midcentury', motel: 'midcentury' }[kindLayout(spec)];
  let vstyle = !styleOk ? null : forced ? forced : spec.vstyle === 'retro' && prewar ? 'retro' : pickStyle(forced ? { ...spec, vstyle: forced } : !spec.vstyle && layStyle ? { ...spec, vstyle: layStyle } : spec, era, origin === 'rebuilt' || origin === 'built_on_ruin' ? null : material, spec.kind || 'house', vrng);
  if (spec.zcat === 'wealthy' && ['obra_negra', 'block_box', 'block_stack', 'block_shop', 'tin_shack', 'container', 'quonset', 'cabin', 'stilt', 'bus_home', 'fuselage', 'boveda', 'brick_front', 'ranch_stone', 'casa_fuerte'].includes(vstyle)) vstyle = eraOk('box_house', era) ? 'box_house' : 'painted'; // the good side of town: never a bare shell
  const retro = vstyle === 'retro';
  const S = (vstyle && STYLES[vstyle]) || {};
  // for rebuilds: lower = old (pre-war) material, upper = new material
  const oldMat = spec.oldMaterial || (prewar ? (PREWAR_MATS.includes(material) ? material : 'concrete') : material);
  const newMat = spec.newMaterial || (origin === 'rebuilt' || origin === 'built_on_ruin' ? (spec.material && !PREWAR_MATS.includes(spec.material) ? spec.material : 'adobe') : material);
  const baseMat = origin === 'rebuilt' || origin === 'built_on_ruin' ? oldMat : material;
  // condition slider: below 0.45 the building is a ruin, sliding down to bare foundations at 0
  if (spec.condition != null && spec.condition < 0.45 && origin !== 'stripped') origin = O.ruinType === 'stripped' ? 'stripped' : 'ruin';
  const condition = spec.condition ?? ({ new: 0.85, maintained: 0.75, repurposed: 0.65, rebuilt: 0.75, built_on_ruin: 0.6, ruin: 0.3, stripped: 0.1 }[origin]);
  let damage = origin === 'ruin' ? clamp(1 - condition, 0.35, 0.95) : origin === 'stripped' ? 0.55 : 0;
  if (spec.condition != null && spec.condition < 0.45) damage = clamp(0.3 + 0.7 * (0.45 - spec.condition) / 0.43, 0.3, 1);
  const stripped = origin === 'stripped';
  // post-war homes and shops sit low: ~2.7 m walls (pre-war ones keep their taller storeys)
  const fh = spec.floorH || S.fh || (vern && ['house', 'shop', 'cantina', 'shelter', 'office'].includes(spec.kind || 'house') ? +(kind.fh - 0.3).toFixed(2) : kind.fh);
  // garages, workshops, warehouses: only the ground floor is tall (the big doors); any storeys above are ordinary ones
  const fhU = UPPER_NORMAL.has(spec.kind) ? Math.min(fh, 3.1) : fh;
  const layout = kindLayout(spec);
  const MIX = mixPlan(spec);
  const floorsDefault = layout ? layoutFloors(spec, layout) : MIX?.kind === 'storey' ? Math.max(2, (spec.floors || 1) + (spec.floors >= 2 ? 0 : 1)) : Math.max(spec.floors || 1, S.floorsMin && !spec.floors ? S.floorsMin : 1);
  let [roofType, roofMat] = defaultRoof(origin === 'built_on_ruin' || origin === 'rebuilt' ? newMat : baseMat, rng);
  if (kind.roof) roofType = kind.roof;
  if (kind.roofMat) roofMat = kind.roofMat;
  if (spec.roof) roofType = spec.roof;
  if (spec.roofMat) roofMat = spec.roofMat;
  if (origin === 'ruin' && (!spec.roof || spec.condition != null)) roofType = damage > 0.8 ? 'none' : 'collapsed';
  if (origin === 'stripped' && !spec.roof) roofType = 'none';
  if (roofType === 'flat' && ['timber', 'metal'].includes(origin === 'built_on_ruin' ? newMat : baseMat) && !spec.roof) roofType = 'shed';
  if (S.roof && !spec.roof && !['ruin', 'stripped'].includes(origin)) { roofType = pickVariant(S.roof[0], vrng); roofMat = pickVariant(S.roof[1], vrng); }
  if (vstyle === 'pill' && !spec.roof && !['ruin', 'stripped'].includes(origin)) { roofType = 'flat'; roofMat = 'flat_adobe'; }
  if (vstyle === 'casona' && !spec.roof && !['ruin', 'stripped'].includes(origin)) { roofType = 'hip'; roofMat = 'tile'; }
  // small buildings don't get a hipped roof (a big tiled hat on a hut): a plain gable instead
  if (roofType === 'hip' && roofMat !== 'thatch' && !spec.roof && Math.min(...(spec.size || [8, 8])) < 6.5) roofType = 'gable';
  if (layoutRoof(layout) && !spec.roof && !['ruin', 'stripped'].includes(origin)) [roofType, roofMat] = layoutRoof(layout);
  if (O.adapt.has('newroof') && !['ruin', 'stripped'].includes(origin)) { roofType = rng.chance(0.6) ? 'shed' : 'gable'; roofMat = 'corrugated'; }
  // low tin roofs: near-flat corrugated sheets on joists (rafter ends showing), common on poorer post-war houses; spec.roofLow
  let lowAuto = false;
  const lrr = new RNG(`${spec.id}:roofLow`), houseish = ['house', 'shop', 'cantina', 'shelter'].includes(spec.kind || 'house');
  if (!spec.roof && !S.roof && vern && houseish && !layout && ['plaster', 'block', 'brick', 'adobe'].includes(newMat) && !['ruin', 'stripped'].includes(origin) && lrr.chance(['dead_broke', 'poor', 'struggling'].includes((opts.settlement || {}).wealth) ? 0.4 : 0.22)) { roofType = 'shed'; roofMat = 'corrugated'; lowAuto = true; }
  // norteña: about half get the near-flat tin roof on joists instead of the low gable (pre-war ones too)
  if (vstyle === 'nortena' && !spec.roof && !layoutRoof(layout) && !O.adapt.has('newroof') && !['ruin', 'stripped'].includes(origin) && lrr.chance(0.55)) { roofType = 'shed'; roofMat = 'corrugated'; lowAuto = true; }
  if (vstyle === 'pill' && !['ruin', 'stripped'].includes(origin)) { roofType = 'flat'; roofMat = 'flat_adobe'; lowAuto = false; } // rounded stucco: always a flat roof
  if (spec.tileRoof && ['gable', 'hip', 'shed'].includes(roofType) && ['corrugated', 'shingle'].includes(roofMat) && !['ruin', 'stripped'].includes(origin)) { roofMat = 'tile'; if (roofType === 'shed') roofType = 'gable'; } // the good side of town: tile, not tin
  const roofLow = roofType === 'shed' && roofMat === 'corrugated' && (spec.roofLow ?? (lowAuto || (vern && houseish && lrr.chance(0.6))));

  const wallHex = (m) => (spec.color && m === material ? spec.color : rng.pick(MAT[m].wall));
  const colors = {
    old: col(wallHex(baseMat), 0.04, rng),
    neu: col(wallHex(newMat), 0.04, rng),
    trim: col(spec.trim || (['adobe', 'plaster', 'stone'].includes(newMat) ? rng.pick(TRIM_PAINT) : MAT[newMat].trim), 0.05, rng),
    plinth: col(MAT[baseMat].plinth, 0.03, rng),
    floor: col(0x6e5f50, 0.03, rng),
    wood: col(rng.pick([WOOD.fresh, WOOD.weathered, WOOD.dark]), 0.05, rng),
    chrome: col(rng.pick([0xb4b8b4, 0x9aa4a8, 0xc8c0a8]), 0.03, rng),
  };
  const settlement = opts.settlement || settlementOf({});
  let finish = rollFinish(spec, settlement, rng);
  // raw-material styles: no paint (bare boards, tin, brick); board cabins may be painted but get no dado band
  if (S.bare && !spec.finish) finish = { ...finish, tier: 'none', band: null, border: null, wainscot: false };
  else if (S.noBand) finish = { ...finish, band: null, border: null, wainscot: false };
  const LIV = LIVERIES[spec.livery] || null;
  if (LIV) finish = { tier: LIV.wash ? 'wash' : 'painted', body: LIV.body, ...(LIV.trim ? { trim: LIV.trim } : {}), band: { hex: LIV.band, h: LIV.bandH }, border: { hex: LIV.border, h: LIV.borderH ?? 0.22 }, livery: spec.livery };
  const whole = !['rebuilt', 'built_on_ruin'].includes(origin);
  const L = { old: MAT_LAYER[baseMat], neu: MAT_LAYER[newMat] };
  { // brick: handmade (ladrillo recocido — buff, pitted, raked joints) or factory red; post-war builds lean handmade
    const hr = new RNG(`${spec.id}:ladrillo`), hand = spec.brick ? spec.brick === 'handmade' : !prewar && hr.chance(0.65);
    if (hand) for (const [k, m] of [['old', baseMat], ['neu', newMat]]) if (m === 'brick') { L[k] = 'ladrillo'; if (!(spec.color && m === material)) colors[k] = col(hr.pick(LADRILLO.wall), 0.04, hr); }
  }
  colors.base = { old: colors.old.clone(), neu: colors.neu.clone() };
  // paint wear follows the building's condition (paint and whitewash alike): pristine = fresh; kept = a little
  // colour lost here and there; worn = faded and flaking; below that = almost gone. fadeK bleaches the colours,
  // paintWear drives the soft flaking in the wall shader
  const PAINTED = ['wash', 'painted', 'decorated', 'ornate', 'showpiece'];
  let fadeK = 0, paintWear = 0;
  if (PAINTED.includes(finish.tier)) {
    const fr = new RNG(`${seed}:${spec.id}:paintfade`);
    const K = [[0.45, 0.75], [0.53, 0.45], [0.6, 0.32], [0.7, 0.14], [0.8, 0]];
    const cnd = condition ?? 0.85;
    paintWear = cnd <= K[0][0] ? K[0][1] : cnd >= K[K.length - 1][0] ? 0 : (() => { for (let i = 0; i < K.length - 1; i++) if (cnd <= K[i + 1][0]) { const t = (cnd - K[i][0]) / (K[i + 1][0] - K[i][0]); return K[i][1] + (K[i + 1][1] - K[i][1]) * t; } return 0; })();
    fadeK = Math.min(0.85, paintWear * 1.1);
    if (fadeK > 0.01) {
      const fadeHex = (h) => { if (h == null) return h; const c0 = col(h); c0.lerp(col(fr.pick(MAT[baseMat]?.wall || [0xc9b89a])), fadeK * 0.6); const hsl = {}; c0.getHSL(hsl); c0.setHSL(hsl.h, hsl.s * (1 - 0.55 * fadeK), Math.min(0.92, hsl.l + 0.07 * fadeK)); return c0.getHex(); };
      const lvl = paintWear > 0.6 ? 'gone' : paintWear > 0.28 ? 'faded' : 'light';
      finish = { ...finish, fade: lvl, body: fadeHex(finish.body), trim: fadeHex(finish.trim), band: finish.band ? { ...finish.band, hex: fadeHex(finish.band.hex) } : finish.band, border: finish.border ? { ...finish.border, hex: fadeHex(finish.border.hex) } : finish.border, accents: finish.accents?.map(fadeHex) };
    }
  }
  if (PAINTED.includes(finish.tier)) {
    const body = col(finish.body, 0.025, rng);
    const coat = (m) => (['timber', 'metal'].includes(m) ? MAT_LAYER[m] : finish.tier === 'wash' ? 'limewash' : 'plaster');
    if (whole) { colors.old = body.clone(); L.old = coat(baseMat); }
    colors.neu = body.clone(); L.neu = coat(newMat);
    if (finish.trim) colors.trim = col(finish.trim, 0.04, rng);
  }
  if (vern && vstyle !== 'adobe' && ['none'].includes(finish.tier) && ['adobe', 'plaster'].includes(baseMat)) { colors.old = col(rng.pick([0xc9a37b, 0xc89070, 0xd8b890, 0xb8805c, 0xd0a888, 0xc8a878]), 0.03, rng); L.old = 'plaster'; }
  if (retro && ['none', 'faded'].includes(finish.tier) && ['plaster', 'concrete', 'block', 'brick'].includes(baseMat) && rng.chance(0.75)) {
    colors.old = col(rng.pick(PASTEL), 0.03, rng).lerp(colors.base.old, 0.42); L.old = 'plaster';
  }
  if (vstyle) styleColors(vstyle, { rng: vrng, colors, L, finish, baseMat, newMat });
  if (layout) kindColors(layout, { rng: vrng, colors, L, finish, baseMat, newMat, condition });
  if (LIV) { // the design code wins over style / layout colours
    const body = col(finish.body, 0.012, rng), coat = (m) => (['timber', 'metal'].includes(m) ? MAT_LAYER[m] : LIV.wash ? 'limewash' : 'plaster');
    if (whole) { colors.old = body.clone(); L.old = coat(baseMat); }
    colors.neu = body.clone(); L.neu = coat(newMat); if (finish.trim) colors.trim = col(finish.trim, 0.02, rng);
  }
  const masses = S.patio && !spec.masses && !spec.shape && !layout ? patioMasses(spec, new RNG(`${seed}:${spec.id}:patio`)) : massesFor(spec, rng);
  mixHeights(masses, spec, floorsDefault, roofType, rng);
  const b = new Builder();
  const info = { outlines: [], signs: [], height: 0, lights: [], emitters: [], murals: [], finish, frontDoor: null, openings: [], walls: {}, roofs: [] };
  const inhabited = !['ruin', 'stripped'].includes(origin) && spec.inhabited !== false;
  const powered = spec.light?.on ?? rng.chance(POWER_ODDS[settlement.power] ?? 0.3);
  // light "r": < preset threshold => on. essential lights always on at night; unpowered never.
  // roof power: a small chance of a salvaged solar panel or a wind charger (spec.roofPower solar | wind | none overrides);
  // off the grid it's likelier. It runs a bulb or two (own = lit off the battery), not the house.
  const roofPowerKind = (() => {
    const v = spec.roofPower; if (v === 'none' || !inhabited || ['none', 'collapsed'].includes(roofType) || ['outhouse', 'shed'].includes(spec.kind)) return null;
    if (v === 'solar' || v === 'wind') return v;
    const pr = new RNG(`${spec.id}:roofpower-pick`), p = { none: 0.18, scarce: 0.14, some: 0.08, grid: 0.04 }[settlement.power] ?? 0.1;
    return pr.chance(p) ? (pr.chance(0.5) ? 'solar' : 'wind') : null;
  })();
  const lightR = (essential, electric, own) => (electric && !powered && !own ? 9 : essential ? -0.5 : rng.next());
  const toLocal = (x, y, z) => { _v3.set(x, y, z).applyMatrix4(b.M); return [_v3.x, _v3.y, _v3.z]; };
  const dirLocal = (nx, nz) => { const e = b.M.elements; return [e[0] * nx + e[8] * nz, e[2] * nx + e[10] * nz]; };
  const muralCands0 = ['left', 'right'].filter((sd) => !spec.party?.includes(sd));
  const muralSide = finish.mural ? (finish.mural.side || (muralCands0.length ? rng.pick(muralCands0) : 'back')) : null;
  const shadeSide = pickShadeSide(spec, layout, finish, origin, damage, muralSide);
  const lift = Math.max(0, +spec.lift || (S.stilts ? 1.5 : 0) || (kind.lift && !damage ? kind.lift : 0));
  info.lift = lift;
  const ctx = { roofLow, livery: LIV, layout, floors0: floorsDefault, lift, stilts: !!S.stilts, S, arch, vern, retro, vstyle, stripped, shadeSide, adapt: O.adapt, R: 0, lean: 0 /* walls stay plumb; the battered base + buttresses carry the look */, muralSide, spec, rng, noise, kind, origin, prewar, material, baseMat, newMat, oldMat, condition, damage, fh, fhU, Y: (f) => (f <= 0 ? 0 : fh + (f - 1) * fhU), colors, inhabited, roofType, roofMat, finish, whole, L, info, lightR, roofPowerKind, mix: MIX, toLocal, dirLocal, settlement, powered, muralCands: [], masses, glass: col(spec.glass || rng.pick(GLASS_TINTS), 0.03, rng) };
  { // window ironwork (herrería): spec.grille none | plain | sunburst | scroll | diamond; post-war homes and shops often get
    // white decorative rejas (the same pattern on every window, often a full grille 'protector' over the front door too)
    const gr = new RNG(`${spec.id}:reja`), g0 = spec.grille, homey = ['res', 'shop', 'reg'].includes(kind.style) && (!prewar || vstyle === 'nortena') && !kind.mil;
    const pat = g0 && g0 !== 'auto' ? g0 : homey && gr.chance(vstyle === 'nortena' ? 1 : 0.45) ? gr.weighted({ sunburst: 3, scroll: 3, diamond: 1.2, plain: 1.5 }) : null;
    ctx.reja = pat && pat !== 'none' ? { pat, all: !!(g0 && g0 !== 'auto') || vstyle === 'nortena' || gr.chance(0.6), door: spec.grilleDoor ?? (vstyle === 'nortena' ? gr.chance(0.8) : gr.chance(0.35)), col: col(pat === 'plain' && gr.chance(0.5) ? METAL.dark : gr.pick([0xdcd8ce, 0xd4d0c4, 0xe0dcd0, 0x3a3a38]), 0.03, gr) } : g0 === 'none' ? { pat: 'none' } : null;
  }

  // shed roofs on joined parts: each part's high edge faces its neighbour (the main part for wings),
  // so the slopes fall away from the join and the two read as one peaked roof
  const shedHigh = (m) => {
    const nb = masses.filter((q) => q !== m && Math.hypot(q.x - m.x, q.z - m.z) < (Math.hypot(q.w, q.d) + Math.hypot(m.w, m.d)) / 2);
    if (!nb.length) return null;
    const main = nb.find((q) => q.main);
    let vx = 0, vz = 0;
    for (const q of m.main || !main ? nb : [main]) { const L = Math.hypot(q.x - m.x, q.z - m.z) || 1; vx += (q.x - m.x) / L; vz += (q.z - m.z) / L; }
    if (Math.hypot(vx, vz) < 0.5) return null; // neighbours on both sides: keep the usual slope
    return toWorld(vx, vz, -deg(m.rot || 0)); // into the part's own frame
  };
  // paint wear is drawn by the wall shader (soft flaking showing the bare wall), not as patches
  { const wk = paintWear;
    if (wk) { b.wear = wk; b.wearMat = ['brick'].includes(baseMat) ? 2 : ['block', 'concrete', 'stone'].includes(baseMat) ? 1 : 0; }
    // bare (unpainted) plaster: with wear it cracks and falls off in patches, showing the masonry under it
    else if (!PAINTED.includes(finish.tier) && (L.old === 'plaster' || L.neu === 'plaster') && !damage) {
      const cnd = condition ?? 0.85, K = [[0.45, 0.62], [0.53, 0.4], [0.6, 0.27], [0.7, 0.11], [0.8, 0]];
      let pw = 0; if (cnd <= K[0][0]) pw = K[0][1]; else for (let i = 0; i < K.length - 1; i++) if (cnd > K[i][0] && cnd <= K[i + 1][0]) { pw = K[i][1] + (K[i + 1][1] - K[i][1]) * ((cnd - K[i][0]) / (K[i + 1][0] - K[i][0])); break; }
      if (pw > 0.01) { b.wear = pw; b.wearMat = baseMat === 'brick' ? 5 : baseMat === 'adobe' || (baseMat === 'plaster' && !prewar) ? 3 : 4; }
    } }
  masses.forEach((m, mi) => {
    const floors = m.floors || floorsDefault;
    const rt = m.roof || roofType;
    const rm = m.roofMat || (rt === 'flat' && !FLAT_MATS.includes(roofMat) ? (['adobe', 'stone'].includes(newMat) ? 'flat_adobe' : 'slab') : roofMat);
    const newPart = MIX && (m.part === 'new' || ['infill', 'salvage'].includes(MIX.kind));
    (info.massRoof ||= [])[mi] = { mat: origin === 'ruin' || origin === 'stripped' ? 'open' : rm, h: m.fh && m.fh !== ctx.fh ? floors * m.fh : ctx.Y(floors) };
    const mctx = { ...ctx, fh: m.fh || ctx.fh, ...(m.fh && m.fh !== ctx.fh ? { fhU: m.fh, Y: (f) => f * m.fh } : {}), mass: m, mi, floors, roofType: rt, roofMat: rm, shedHigh: rt === 'shed' && masses.length > 1 ? shedHigh(m) : null, ...(newPart ? { vern: true, vstyle: null, S: {} } : {}) };
    b.pushT(m.x, 0, m.z, deg(m.rot || 0));
    buildMass(b, mctx, info);
    b.pop();
    info.outlines.push({ x: m.x, z: m.z, w: m.w, d: m.d, rot: deg(m.rot || 0) });
  });
  if (S.patio) { const pz = patioAfter(b, ctx, masses); if (pz) info.patio = pz; } // courtyard house: the patio wall, gate and floor
  if (MIX?.kind === 'ruin' && !damage) ruinShell(b, ctx, masses, info);
  // joined shed roofs: where a part's high edge meets a taller neighbour roof, wall it up to that roof
  for (const e of info._shedEdges || []) {
    const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[2] + e.b[2]) / 2, L0 = Math.hypot(e.out[0], e.out[1]) || 1, ox = e.out[0] / L0, oz = e.out[1] / L0;
    let y = -Infinity;
    for (const k of [0.25, 0.5, 0.75]) for (const r of info._roofFns || []) { if (r.m === e.m) continue; const px = e.a[0] + (e.b[0] - e.a[0]) * k + ox * 0.35, pz = e.a[2] + (e.b[2] - e.a[2]) * k + oz * 0.35, h = r.fn(px, pz); if (h != null && h > y) y = h; }
    if (y > e.top + 0.05 && y < e.top + 6) {
      const len = Math.hypot(e.b[0] - e.a[0], e.b[2] - e.a[2]), hh = y - e.top + 0.04;
      b.t(e.layer).box(mx - ox * e.t / 2, e.top - 0.02 + hh / 2, mz - oz * e.t / 2, len, hh, e.t, e.color, Math.atan2(e.b[0] - e.a[0], e.b[2] - e.a[2]) + Math.PI / 2);
    }
  }
  delete info._shedEdges; delete info._roofFns;

  // pre-war commercial: a fin / pylon at the front corner rising over the roof (for a vertical sign)
  if (retro && !damage && ['shop', 'cantina', 'hall', 'office', 'garage', 'workshop', 'kiosk'].includes(spec.kind) && rng.chance(0.6)) {
    const m = masses.find((mm) => mm.main) || masses[0], H = ctx.Y(m.floors || floorsDefault);
    const sd = rng.chance(0.5) ? 1 : -1, fhgt = H + rng.range(1.6, 3.0);
    b.pushT(m.x, 0, m.z, deg(m.rot || 0));
    b.t('plaster').box(sd * (m.w / 2 - 0.35), fhgt / 2, m.d / 2 + 0.5, 0.24, fhgt, 1.1, colors.trim.clone().lerp(colors.old, 0.3));
    b.pop();
    info.fin = { x: sd * (m.w / 2 - 0.35), z: m.d / 2 + 0.5, h: fhgt, mass: m };
  }
  // porch / portal along the front of the main mass
  const lporch = layout ? layoutPorch(layout, spec, new RNG(`${seed}:${spec.id}:lporch`)) : null;
  const porch = spec.porch ?? lporch ?? (S.noPorch || S.custom ? false : kind.porch ? true : vern && kind.style === 'res' && rng.chance(0.4) ? { roof: rng.pick(['latilla', 'latilla', 'corrugated']) } : false);
  // inside a plot the porch stays behind the plot line: shallower when it must, none when there's no room (auto porches)
  let porchP = porch === true ? {} : porch;
  if (porchP && opts.porchRoom != null && (porchP.side || 'front') === 'front') { const room = opts.porchRoom - 0.25, dp = porchP.depth || 2.4;
    if (room < 1.3) porchP = spec.porch ? { ...porchP, depth: Math.max(0.9, room) } : null; else if (room < dp) porchP = { ...porchP, depth: room }; }
  if (porchP && origin !== 'stripped' && !info.porchBuilt) buildPorch(b, ctx, masses.find((m) => m.main) || masses[0], porchP);
  if (origin !== 'stripped' && !damage) for (const m of masses) if (m.portal && m.portalLen > 1.5) buildPorch(b, ctx, m, { side: m.portal, depth: 1.6, length: m.portalLen, roof: vern ? 'latilla' : 'tile', height: Math.min(2.6, fh * 0.85) });
  if (damage > 0) buildRubble(b, ctx, masses);
  for (const ex of [...(spec.extras || []), ...(O.adapt.has('leanto') && !['ruin', 'stripped'].includes(origin) ? ['lean_to'] : [])]) buildExtra(b, ctx, masses, ex, info);
  if (vern && !damage && vstyle !== 'casona') vernExtras(b, ctx, masses);
  if (!['ruin', 'stripped'].includes(origin)) for (const m of masses) if (m.terrace && m.stair) buildStairs(b, ctx, masses, m);
  if (kind.bell && spec.bell !== false && !S.custom) buildBellGable(b, ctx, masses.find((m) => m.main) || masses[0]);

  // door step (sill sits above grade on the plinth)
  const fd = info.frontDoor;
  if (lift > 0.05) {
    const pm = masses.find((mm) => mm.main) || masses[0];
    if (porch && info.porch) { // porch deck raised on a base, steps down from its front edge
      const len = (porch.length || pm.w * 0.9), dp = info.porch.depth, mr = deg(pm.rot || 0);
      b.pushT(pm.x, 0, pm.z, mr);
      b.t(c0Layer(ctx)).box(0, (-lift - 0.5 + 0.25) / 2, pm.d / 2 + dp / 2, len, lift + 0.75, dp, colors.plinth);
      b.pop();
      const [ex, ez] = toWorld(0, pm.d / 2 + dp, mr);
      flight(b, ctx, pm.x + ex, pm.z + ez, Math.sin(mr), Math.cos(mr), 0.25, lift, 1.8);
    } else for (const dr of [info.frontDoor, info.backDoor]) if (dr) flight(b, ctx, dr.x, dr.z, dr.nx, dr.nz, dr.sill ?? 0.3, lift, Math.max(1.2, dr.w + 0.4));
  } else if (fd && !porch && fd.sill > 0.12) {
    b.t(baseMat === 'adobe' || baseMat === 'stone' ? 'stone' : 'concrete');
    b.box(fd.x + fd.nx * 0.32, (fd.sill - 0.6) / 2, fd.z + fd.nz * 0.32, fd.w + 0.5, fd.sill + 0.6, 0.62, colors.plinth, Math.atan2(fd.nx, fd.nz));
  }
  // door lantern
  const lanternP = { posada: 0.9, clinic: 0.85, cafe: 0.8, store: 0.6, shelter: 0.9, cantina: 0.95, shop: 0.6, chapel: 0.5, house: 0.35, workshop: 0.45, hall: 0.7, office: 0.4, kiosk: 0.5 }[spec.kind || 'house'] ?? 0;
  if (fd && inhabited && spec.lantern !== false && (spec.lantern || roofPowerKind || rng.chance(lanternP))) {
    const own = !!roofPowerKind && !powered, electric = own || (powered && rng.chance(0.5));
    const essential = ['shelter', 'cantina', 'hall'].includes(spec.kind) && rng.chance(0.6);
    const r = lightR(essential, electric, own);
    const [lx, lz] = [fd.x + fd.nx * 0.35 + fd.tx * 0.9, fd.z + fd.nz * 0.35 + fd.tz * 0.9];
    b.t('metal');
    b.box(fd.x + fd.nx * 0.15 + fd.tx * 0.9, fd.y + 0.35, fd.z + fd.nz * 0.15 + fd.tz * 0.9, 0.06, 0.06, 0.3, col(METAL.dark), Math.atan2(fd.nx, fd.nz));
    b.ch('lamp').w(r).t('plain');
    b.box(lx, fd.y + 0.2, lz, 0.18, 0.26, 0.18, electric ? 0xfff0d0 : 0xffc070);
    b.w(-1).ch('main');
    info.lights.push({ x: lx, y: fd.y + 0.2, z: lz, color: electric ? LIGHT_COL.incandescent : LIGHT_COL.oil, radius: 6.5, intensity: 1.2, kind: 'lamp', r, flicker: !electric });
  }
  // livery: the San Mecánico gear stencilled over the main door
  if (fd && LIV?.gear && !damage) {
    const R = 0.19, gc = col(LIV.gear, 0.02, rng);
    b.pushT(fd.x + fd.nx * 0.025, fd.y + 0.34, fd.z + fd.nz * 0.025, Math.atan2(fd.nx, fd.nz));
    b.t('plaster').cyl(0, 0, 0, R, R, 0.012, 14, gc, Math.PI / 2);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box(Math.cos(a) * (R + 0.035), Math.sin(a) * (R + 0.035), 0, 0.075, 0.075, 0.012, gc, 0, 0, a); }
    b.cyl(0, 0, 0.004, R * 0.42, R * 0.42, 0.012, 10, colors.neu, Math.PI / 2);
    b.pop();
  }
  // spec.light: 'forge' | {at:[x,y,z], color, radius, intensity, essential}
  if (spec.light && inhabited) {
    const li = typeof spec.light === 'string' ? { type: spec.light } : spec.light;
    const m = masses.find((mm) => mm.main) || masses[0];
    if (li.type === 'forge') {
      const [ox, oz] = [m.x, m.z + m.d / 2 + 1.2];
      info.lights.push({ x: ox, y: 1.2, z: oz, color: LIGHT_COL.fire, radius: li.radius || 8, intensity: li.intensity || 1.3, kind: 'fire', r: lightR(!!li.essential, false), flicker: true });
    } else if (li.at) {
      info.lights.push({ x: li.at[0], y: li.at[1], z: li.at[2], color: LIGHT_COL[li.color] || li.color || LIGHT_COL.incandescent, radius: li.radius || 7, intensity: li.intensity || 1, kind: li.kind || 'lamp', r: lightR(!!li.essential, !!li.electric), flicker: !!li.flicker });
    }
  }
  // mural on the longest blank wall
  if (finish.mural && ctx.muralCands.length) {
    const best = ctx.muralCands.sort((a, b2) => b2.score - a.score)[0];
    info.murals.push({ ...best, kind: finish.mural.kind, palette: finish.mural.palette });
  }

  // decoration by finish tier, and auto signs on businesses
  if (!['ruin', 'stripped'].includes(origin)) {
    const face = frontSpace(ctx, info);
    if (layout && info.walls.front) { dressKind(b, ctx, masses, info, face, {}); dressValley(b, ctx, masses, info, face); dressDen(b, ctx, masses, info, face); }
    if (!spec.sign && spec.signs !== false) autoSigns(b, ctx, masses, info, face);
    if (!kind.mil) buildDecor(b, ctx, masses, info, face);
    sideShade(b, ctx, masses, info, opts.free);
  }
  if (layout && spec.kind === 'utility') dressUtility(b, ctx, masses, info); // yard kit + compound, ruins too
  // sign
  if (spec.sign) {
    const m = masses.find((mm) => mm.main) || masses[0];
    const s = typeof spec.sign === 'string' ? { text: spec.sign } : spec.sign;
    const sk = s.scale || 1, w = Math.min(m.w * 0.98, (s.width || Math.min(m.w * 0.8, 1.2 + s.text.length * 0.32)) * sk);
    let h = (s.height || 0.7) * sk, y = s.y ?? Math.min(ctx.Y(m.floors || floorsDefault) - 0.4, fh - 0.1);
    const mr = deg(m.rot || 0), off = s.offset || 0, fz = m.d / 2 + 0.06 + (s.out || 0);
    const x = m.x + off * Math.cos(mr) + fz * Math.sin(mr), z = m.z - off * Math.sin(mr) + fz * Math.cos(mr);
    if (s.y == null) { // always clear of the door and windows under it: lifted above them, up onto the parapet if it must
      const tx = Math.cos(mr), tz = -Math.sin(mr), U = (px, pz) => (px - x) * tx + (pz - z) * tz;
      const under = (info.openings || []).filter((o) => o.side === 'front' && o.main && (o.floor ?? 0) === 0 && Math.abs(U(o.x, o.z)) < w / 2 + (o.w || 1) / 2 + 0.1);
      const top = Math.max(0, ...under.map((o) => o.y1 ?? 0));
      if (top) y = Math.max(y, top + h / 2 + 0.12);
      const lim = ctx.Y(m.floors || floorsDefault) + (roofType === 'flat' ? 0.55 : 0.1);
      if (y + h / 2 > lim) { h = Math.max(0.4, Math.min(h, (lim - top - 0.12))); y = Math.max(top + h / 2 + 0.1, Math.min(y, lim - h / 2)); }
    }
    const nb = info.nameBand;
    if (nb && s.y == null && s.offset == null) { // a storefront's name band: the lettering goes on it, centred
      const bm = nb.mass || m, br = deg(bm.rot || 0), cs = Math.cos(br), sn = Math.sin(br);
      info.signs.push({ text: s.text, x: (bm.x || 0) + nb.x * cs + nb.z * sn, y: nb.y, z: (bm.z || 0) - nb.x * sn + nb.z * cs, ry: br, w: Math.min(nb.w * 0.94, w), h: Math.min(h, nb.h * 0.92), style: s.style || 'painted', rng, opts: { level: true } });
    } else info.signs.push({ text: s.text, x, y, z, ry: mr, w, h, style: s.style || 'painted', rng });
  }
  if (damage > 0) for (const sg of info.signs) { // a ruin's signs have come down: face up in the dirt in front of the wall
    const fr = new RNG(`${spec.id}:fallen:${sg.text}:${sg.x.toFixed(1)}:${sg.z.toFixed(1)}`), out = fr.range(0.5, 1.1);
    sg.x += Math.sin(sg.ry) * out + fr.range(-0.3, 0.3); sg.z += Math.cos(sg.ry) * out + fr.range(-0.3, 0.3); sg.y = 0.05; sg.ry += fr.range(-0.5, 0.5);
    sg.opts = { ...(sg.opts || {}), tilt: -Math.PI / 2 + fr.range(0, 0.12) };
  }
  if (info.vigas?.beams?.length) signsOffVigas(b, info, rng);
  return { geoms: b.build({ maxEdge: 3.2 }), info };
}

// signs never sit under the protruding vigas: a board that would is hung on the beam ends instead, on a
// plank fascia nailed across them; a sign painted on the wall drops below the beams
export function vigaFace(V, lx, lz, slack = 0.6) { // which viga face a point (main-mass local) is on, and its u along that face
  const { w, d } = V;
  if (V.faces.includes('front') && Math.abs(lz - d / 2) < slack && Math.abs(lx) < w / 2) return { face: 'front', u: lx, n: [0, 1], half: d / 2 };
  if (V.faces.includes('back') && Math.abs(lz + d / 2) < slack && Math.abs(lx) < w / 2) return { face: 'back', u: lx, n: [0, -1], half: d / 2 };
  if (V.faces.includes('right') && Math.abs(lx - w / 2) < slack && Math.abs(lz) < d / 2) return { face: 'right', u: lz, n: [1, 0], half: w / 2 };
  if (V.faces.includes('left') && Math.abs(lx + w / 2) < slack && Math.abs(lz) < d / 2) return { face: 'left', u: lz, n: [-1, 0], half: w / 2 };
  return null;
}
export function vigaReach(V, u, w) { let m = 0; for (const bm of V.beams) if (Math.abs(bm.u - u) < w / 2 + 0.15) m = Math.max(m, bm.ext); return m; }
function signsOffVigas(b, info, rng) {
  const V = info.vigas, mr = deg(V.mrot);
  for (const s of info.signs) {
    if (s.y - s.h / 2 >= V.y1 + 0.04 || s.y + s.h / 2 <= V.y0 - 0.04) continue;
    const [lx, lz] = toLocal(s.x - V.mx, s.z - V.mz, mr), F = vigaFace(V, lx, lz);
    if (!F) continue;
    if (s.style === 'wall') { s.y = V.y0 - 0.1 - s.h / 2; continue; } // painted lettering: below the beams
    const reach = vigaReach(V, F.u, s.w);
    if (!reach) continue;
    const out = F.half + reach + 0.03, along = (k) => (F.face === 'front' || F.face === 'back' ? [k, 0] : [0, k]);
    const P = (u, o) => { const [a, c2] = along(u); return [a + F.n[0] * o, c2 + F.n[1] * o]; };
    // the fascia plank across the beam ends
    b.pushT(V.mx, 0, V.mz, mr);
    const [fx, fz] = P(F.u, out - 0.04), ry = Math.atan2(F.n[0], F.n[1]);
    b.t('wood').box(fx, V.yc, fz, s.w + 0.35, 0.26, 0.05, col(WOOD.weathered, 0.05, rng), ry);
    b.pop();
    // the sign on it, centred on the beam line
    const [sx, sz] = P(F.u, out + 0.01), [wx, wz] = toWorld(sx, sz, mr);
    s.x = V.mx + wx; s.z = V.mz + wz; s.y = V.yc; s.ry = mr + ry;
  }
}

// ---------------------------------------------------------------------------------------------
function buildMass(b, c, info) {
  const { mass: m, rng, floors, fh } = c;
  const w = m.w, d = m.d;
  const wallH = c.Y(floors);
  info.height = Math.max(info.height, wallH + 2);
  if (c.S.custom && !c.damage && styleCustom(c.vstyle, b, c, { w, d, wallH, m, floors })) return;
  const tOld = c.kind.mil ? THICK_MIL : c.S.thick || THICK[c.baseMat], tNew = c.kind.mil ? THICK_MIL : c.S.thick || THICK[c.newMat];
  const t = Math.max(tOld, tNew);
  const flatRoof = c.roofType === 'flat';
  let parapet = flatRoof || c.roofType === 'vaults' || c.roofType === 'sawtooth' ? (c.kind.mil ? 1.0 : c.retro ? 0.16 : c.S.parapet != null ? c.S.parapet : c.vstyle === 'pill' ? 0.22 : c.baseMat === 'adobe' || c.newMat === 'adobe' ? 0.5 : 0.6) : 0;
  if (m.terrace && flatRoof) parapet = m.rail === 'railing' ? 0.12 : 0.9;

  // plinth + interior floor
  const plH = c.baseMat === 'adobe' || c.baseMat === 'stone' ? 0.4 : 0.25;
  b.setCenter(0, wallH / 2, 0);
  b.t(c.baseMat === 'adobe' || c.baseMat === 'stone' ? 'stone' : 'concrete');
  if (c.S.plinth !== false && !(c.vstyle === 'pill' && !c.damage && !c.spec.party?.length) && !(c.retro && !c.damage) && !(c.vstyle === 'adobe' && !c.damage)) b.box(0, plH / 2 - 0.75, 0, w + 0.24, plH + 1.5, d + 0.24, c.colors.plinth);
  else if (c.S.plinth === false) { b.t(c.L?.old || 'concrete'); b.box(0, plH / 2 - 0.75, 0, w + 0.02, plH + 1.5, d + 0.02, c.colors.old.clone().offsetHSL(0, 0, -0.06)); } // no plinth (obra negra…): the wall still runs down into the ground — no gap on a slope
  b.t('dirt');
  b.box(0, plH + 0.02, 0, w - 2 * t + 0.05, 0.06, d - 2 * t + 0.05, c.colors.floor);

  // rebuilt split height (pre-war below, new above)
  // pre-war + new build: which part of this mass is pre-war fabric (below the split) and which is new (above)
  const MX = c.mix, part = m.part;
  const splitFn = !MX ? (c.origin === 'rebuilt' ? (u, si) => Math.round((1.1 + 0.9 * c.noise.noise2(u / 2.2, si * 3.1) + 0.3 * rng.next()) / 0.2) * 0.2
      : c.origin === 'built_on_ruin' ? (u, si) => c.Y(Math.max(1, floors - 1)) + Math.round((c.noise.noise2(u / 1.6, si * 2.3) * 0.5 - 0.25) / 0.2) * 0.2 : null)
    : part === 'new' || MX.kind === 'infill' || MX.kind === 'salvage' ? () => 0 // all new (the infill keeps the pre-war frame, drawn over it)
    : MX.kind === 'storey' ? (u, si) => c.Y(Math.max(1, floors - 1)) + (c.damage ? 0 : Math.round(c.noise.noise2(u / 3.1, si * 2.3) * 0.6) * 0.1) // a level seam on the old slab
    : MX.kind === 'newroof' ? () => wallH - 0.32 // a new bond course under the new roof
    : null; // all pre-war

  const sides = [
    { ax: -w / 2, az: -d / 2, dx: 1, dz: 0, L: w, name: 'back' },
    { ax: w / 2, az: -d / 2, dx: 0, dz: 1, L: d, name: 'right' },
    { ax: w / 2, az: d / 2, dx: -1, dz: 0, L: w, name: 'front' },
    { ax: -w / 2, az: d / 2, dx: 0, dz: -1, L: d, name: 'left' },
  ];
  // pre-war streamline: rounded corners on the main mass
  let R = c.retro && !c.damage && m.main && !c.spec.party?.length && Math.min(w, d) > 5 && rng.chance(0.55) ? Math.min(1.4, Math.min(w, d) * 0.16) : 0;
  if (c.vstyle === 'pill' && !c.damage && !c.spec.party?.length) R = Math.max(0.6, Math.min(1.9, Math.min(w, d) * rng.range(0.18, 0.26)));
  // corners that run into another part of the building stay square: the join is seamless
  const Rc = RCORN.map(([sx, sz]) => (R && !cornerJoined(c, m, (sx * w) / 2, (sz * d) / 2) ? R : 0));
  if (!Rc.some((r) => r)) R = 0;
  const Rp = (k) => Rc.map((r) => (r ? r + k : 0));
  c.R = R; c.Rc = Rc;
  if (c.lift > 0.05 && c.stilts) { // on piles: posts down to the ground, cross-braced, a plank floor
    const pc = col(WOOD.pole, 0.06, rng); b.t('bark');
    for (let x = -w / 2 + 0.2; x <= w / 2 - 0.19; x += Math.max(1.6, (w - 0.4) / Math.max(1, Math.round((w - 0.4) / 2.2)))) for (const z of [-d / 2 + 0.2, d / 2 - 0.2]) b.cyl(x, (-c.lift - 1) / 2 + 0.25, z, 0.11, 0.13, c.lift + 1.0, 7, pc);
    b.t('wood').box(0, 0.2, 0, w + 0.1, 0.12, d + 0.1, col(WOOD.weathered, 0.05, rng));
  } else if (c.lift > 0.05) { // raised building: the wall carries on down to the ground as a solid base
    b.t(c.baseMat === 'adobe' || c.baseMat === 'stone' ? 'stone' : c.L.old);
    const fc = c.baseMat === 'adobe' || c.baseMat === 'stone' ? c.colors.plinth : c.colors.old.clone().offsetHSL(0, 0, -0.04);
    if (R) roundBox(b, 0, (-c.lift - 0.5 + 0.3) / 2, 0, w + 0.06, c.lift + 0.8, d + 0.06, Rp(0.03), fc);
    else b.box(0, (-c.lift - 0.5 + 0.3) / 2, 0, w + 0.06, c.lift + 0.8, d + 0.06, fc);
  }
  if (R) { // rounded plinth + floor
    b.t(c.baseMat === 'adobe' || c.baseMat === 'stone' ? 'stone' : 'concrete');
    roundBox(b, 0, plH / 2 - 0.75, 0, w + 0.24, plH + 1.5, d + 0.24, Rp(0.12), c.colors.plinth);
  }
  sides.forEach((s, si) => {
    s.si = si; s.nx = s.dz; s.nz = -s.dx; s.ry = Math.atan2(-s.dz, s.dx);
    // corner trimming so walls don't z-fight at corners
    s.u0 = si % 2 === 1 ? t : 0; s.u1 = si % 2 === 1 ? s.L - t : s.L;
    if (R) { s.u0 = Math.max(s.u0, Rc[(si + 3) % 4]); s.u1 = Math.min(s.u1, s.L - Rc[si]); }
    const top = wallH + parapet;
    let sideDmg = c.damage ? clamp(c.damage * rng.range(0.55, 1.35), 0, 0.97) : 0;
    s.topFn = sideDmg
      ? (u) => {
          const corner = Math.exp(-((Math.min(u, s.L - u) / 1.4) ** 2));
          const n = c.noise.noise2(u / 2.5 + si * 7, si) * 0.5 + 0.5;
          let drop = sideDmg * top * (0.45 + 0.75 * n) * (1 - 0.55 * corner);
          drop += (rng.next() - 0.5) * 0.35;
          return clamp(Math.round((top - drop) / 0.25) * 0.25, 0.3, top);
        }
      : () => top;
    if (c.vstyle === 'adobe' && !c.damage && flatRoof) s.topFn = (u) => top + Math.round(c.noise.noise2(u / 1.3 + si * 4, 2.2) * 2) * 0.05; // hand-built, uneven parapet
    if (c.stripped) { // scavenged: block courses taken from the top in steps, no rubble left
      s.topFn = (u) => { const n = c.noise.noise2(u / 1.8 + si * 3.3, 7.7) * 0.5 + 0.5; const drop = n > 0.45 ? (n - 0.45) * top * 1.6 : 0; return clamp(top - Math.round(drop / 0.2) * 0.2, 0.4, top); };
    }
    if (c.vstyle === 'palapa' && !c.damage) s.topFn = () => 1.15; // half walls, open above (posts carry the thatch)
    if (c.damage >= 0.97) s.topFn = (u) => clamp(Math.round((0.35 + 0.45 * (c.noise.noise2(u / 1.7 + si * 5, si) * 0.5 + 0.5)) / 0.15) * 0.15, 0.3, 0.9); // foundations only
    s.splitFn = splitFn ? (u) => Math.min(splitFn(u, si), wallH) : null;
    s.openings = layoutOpenings(s, c, wallH, t);
    if (s.stair) s.openings = s.openings.filter((o) => o.y0 === s.stair.H + 0.05 && o.type === 'door' || !(o.u1 > s.stair.ua && o.u0 < s.stair.ub)); // nothing under / beside the outside stair
    if (c.vstyle === 'obra_negra') clearCastillos(s);
    else if (c.mix?.kind === 'infill') clearCastillos(s, 3.6, 0.16);
    s.wallH = wallH; s.parapet = parapet;
    buildWall(b, s, c, t, tOld, tNew);
  });
  if (R) retroCorners(b, c, sides, w, d, wallH, parapet, Rc, t);
  if (c.retro && !c.damage) retroBands(b, c, sides, wallH, R ? Rc : null);
  if (c.vstyle === 'adobe' && !c.damage) adobeBase(b, c, sides);
  if (c.vstyle === 'adobe' && !c.damage && m.main) vernButtresses(b, c, sides, wallH);
  if (c.kind.mil && !c.damage) milDetails(b, c, sides, w, d, wallH, parapet, t, m);
  if (c.vstyle === 'pill' && !c.damage) pillTop(b, c, sides, w, d, wallH + parapet, R ? Rc : null, t);
  if (c.vstyle === 'casona' && !c.damage) casonaBands(b, c, sides, wallH, floors, fh);
  if (c.vstyle) styleMass(c.vstyle, b, c, sides, { w, d, wallH, parapet, t, m, floors });
  if (c.mix && !c.damage) mixExtras(b, c, sides, { w, d, wallH, parapet, t, m, floors, fh });

  // upper floor slabs
  b.t('slab');
  for (let f = 1; f < floors; f++) {
    const y = c.Y(f);
    if (c.damage > 0) {
      const n = Math.max(1, Math.round(w / 2.2)), k = Math.max(1, Math.round(d / 2.2));
      for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
        if (rng.chance(c.damage * 0.8)) continue;
        const sx = (w - 2 * t) / n, sz = (d - 2 * t) / k;
        b.box(-w / 2 + t + sx * (i + 0.5), y - 0.12, -d / 2 + t + sz * (j + 0.5), sx + 0.01, 0.24, sz + 0.01, c.colors.floor);
      }
    } else b.box(0, y - 0.12, 0, w - 2 * t + 0.02, 0.24, d - 2 * t + 0.02, c.colors.floor);
  }

  if (m.main && c.kind.bigdoor && c.inhabited) buildInterior(b, c, w, d, t, plH);
  c._sides = sides;
  buildRoof(b, c, w, d, wallH, t, parapet);
  if (m.terrace && flatRoof && !c.damage) buildTerrace(b, c, sides, w, d, wallH, t);
  if (flatRoof && !c.damage) {
    c.info.roofs.push({ x: m.x, z: m.z, w: w - 2 * t, d: d - 2 * t, rot: deg(m.rot || 0), y: wallH + 0.02 });
    const garden = c.inhabited && (m.main || m.terrace) && c.layout !== 'rooftop' && !(c.retro && m.main);
    c._tankSide = new RNG(`${c.spec.id}:tinaco-side`).chance(0.5) ? 1 : -1; // set before the garden so it keeps clear of the tinaco
    c._parapetH = parapet; if (garden) roofGarden(b, c, w - 2 * t, d - 2 * t, wallH + 0.02, m);
    // a roof garden needs a way up: a ladder or an outside stair on the back wall, or a hatch from inside
    if (garden && m.main && w - 2 * t >= 2.4 && d - 2 * t >= 2.4 && roofLevel(c, m) !== 'none' && !c.masses.some((q) => q.stair)) roofAccess(b, c, m, w, d, wallH, parapet, t);
    // a roof terrace (a terraced wing, or a terrace roof) is reached from inside: in at the front door, up the stairs
    if (c.inhabited && (m.terrace || (garden && roofLevel(c, m) === 'terrace')) && w - 2 * t >= 2 && d - 2 * t >= 2 && !(c.info.climbs || []).some((q) => !q.e && Math.abs(q.t[1] - (wallH + 0.02)) < 0.1)) climb(c, 'door', null, c.toLocal(0, wallH + 0.02, 0));
    // homes and guesthouses keep their water up top: a tinaco on a stand at a back corner (two on a big posada)
    if (m.main && ['house', 'posada'].includes(c.spec.kind || 'house') && c.spec.tinaco !== false) {
      const n = c.spec.kind === 'posada' && w * d > 90 ? 2 : 1;
      for (let k = 0; k < n; k++) roofTank(b, c, w - 2 * t, d - 2 * t, wallH + 0.02, m, k);
    }
    if (m.main && c.roofPowerKind && w - 2 * t >= 2.4 && d - 2 * t >= 2.4) roofPower(b, c, w - 2 * t, d - 2 * t, wallH + 0.02, m, c.roofPowerKind);
  } else if (m.main && c.roofPowerKind && !c.damage && c.roofType !== 'flat') roofPower(b, c, 0, 0, 0, m, c.roofPowerKind, { w, d, wallH });
}

function roofAccess(b, c, m, w, d, wallH, parapet, t) {
  const rng = new RNG(`${c.spec.id}:roofaccess`), dir = -(c._tankSide || 1); // up at the end away from the tinaco
  const back = (c.info.openings || []).filter((o) => o.side === 'back' && o.main === !!m.main && (o.floor ?? 0) === 0).map((o) => [o.x - (m.x || 0) - (o.w || 1) / 2 - 0.3, o.x - (m.x || 0) + (o.w || 1) / 2 + 0.3]);
  const clear = (u0, u1) => !back.some(([a, z]) => u1 > a && u0 < z), top = wallH + parapet, z0 = -d / 2;
  const wood = col(rng.pick([WOOD.weathered, WOOD.pole, WOOD.dark]), 0.05, rng);
  const nS = Math.ceil((wallH + 0.02) / 0.2), runL = nS * 0.27;
  let kind = c.spec.roofAccess || rng.weighted({ ladder: 3, stairs: wallH <= 6.2 && w - 1.2 >= runL ? 2 : 0, hatch: 2 });
  if (kind === 'stairs') { // block steps along the back wall, rising to the roof at the far end; a rail of pipe
    const uT = dir * (w / 2 - 0.55), uB = uT - dir * runL;
    if (!clear(Math.min(uT, uB) - 0.1, Math.max(uT, uB) + 0.1)) kind = 'ladder';
    else {
      const sc = c.colors.neu.clone().offsetHSL(0, -0.02, -0.04);
      b.t(c.L.neu === 'limewash' ? 'limewash' : 'plaster');
      for (let i = 0; i < nS; i++) { const yT = Math.min(wallH + 0.02, (i + 1) * ((wallH + 0.02) / nS)), u = uB + dir * (i + 0.5) * 0.27; b.box(u, yT / 2 - 0.15, z0 - 0.48, 0.28, yT + 0.3, 0.9, sc); }
      b.box(uT + dir * 0.0, wallH - 0.1, z0 - 0.48, 0.5, 0.24, 0.9, sc); // landing at the top
      b.t('metal'); const rc = col(METAL.dark, 0.05, rng);
      rod(b, [uB, 1.0, z0 - 0.9], [uT, wallH + 1.0, z0 - 0.9], 0.025, rc, 5);
      for (let i = 0; i <= 4; i++) { const f = i / 4, u = uB + (uT - uB) * f, yb = f * wallH; rod(b, [u, yb + 0.05, z0 - 0.9], [u, yb + 1.0, z0 - 0.9], 0.02, rc, 4); }
      (c.info.sideUse ||= {}).back = 1; c.info.roofAccess = { kind, x: (m.x || 0) + (uT + uB) / 2, z: (m.z || 0) + z0 - 0.5, w: runL + 0.6, d: 1.3 };
      climb(c, kind, c.toLocal(uB - dir * 0.6, 0, z0 - 0.48), c.toLocal(uT, wallH + 0.02, z0 + t + 0.7));
      return;
    }
  }
  if (kind === 'ladder') { // a homemade wooden ladder leaning on the back wall, over the parapet
    let u = null; for (const cand of [dir * (w / 2 - 0.7), dir * (w / 2 - 1.6), 0, -dir * (w / 2 - 1.6)]) if (clear(cand - 0.4, cand + 0.4)) { u = cand; break; }
    if (u != null) {
      const H = top + 0.6, foot = z0 - 0.75, head = z0 - 0.06;
      b.t('wood'); for (const sx of [-0.22, 0.22]) b.plank([u + sx, 0, foot], [u + sx, H, head], 0.06, 0.07, wood);
      for (let y = 0.3; y < H - 0.1; y += 0.3) { const f = y / H; b.box(u, y, foot + (head - foot) * f - 0.01, 0.46, 0.04, 0.05, wood); }
      (c.info.sideUse ||= {}).back = 1; c.info.roofAccess = { kind, x: (m.x || 0) + u, z: (m.z || 0) + z0 - 0.5, w: 1.0, d: 1.2 };
      climb(c, kind, c.toLocal(u, 0, z0 - 1.1), c.toLocal(u, wallH + 0.02, z0 + t + 0.7));
      return;
    }
  }
  // a roof hatch: a raised frame with its lid propped open (the stair is inside)
  const hx = -dir * 0.0, hz = d / 2 - t - 1.25, y = wallH + 0.02, fc = col(0x9c968a, 0.04, rng);
  b.t('slab').box(hx, y + 0.08, hz, 0.95, 0.16, 0.95, fc);
  b.t('plain').box(hx, y + 0.165, hz, 0.75, 0.01, 0.75, col(0x1a1816));
  b.push(new THREE.Matrix4().makeTranslation(hx, y + 0.17, hz - 0.4).multiply(new THREE.Matrix4().makeRotationX(-1.9)));
  b.t(rng.chance(0.5) ? 'metal' : 'wood').box(0, 0.02, 0.4, 0.8, 0.04, 0.8, rng.chance(0.5) ? col(METAL.rust, 0.06, rng) : wood);
  b.pop();
  climb(c, 'hatch', null, c.toLocal(hx, y, hz - 0.9)); // up from inside: the way in is the front door
}
// a way up for the walker: entry on the ground (null = the front door) and the spot on the roof, structure-local
function climb(c, kind, e, t) { (c.info.climbs ||= []).push({ kind, e: e && [e[0], e[2]], t }); }

function roofTank(b, c, iw, id, y, m, k) {
  if (iw < 2.4 || id < 2.4) return;
  const rng = new RNG(`${c.spec.id}:tinaco:${m.x}:${m.z}:${k}`), side = (k ? -1 : 1) * (c._tankSide || 1);
  const x = side * (iw / 2 - 0.6), z = -(id / 2 - 0.6), H = rng.range(0.8, 1.2), R = rng.range(0.42, 0.52), T = R * rng.range(2.0, 2.4);
  const old = c.condition < 0.55, kind = rng.weighted({ plastic: 5, cement: 2, steel: 1.5 });
  // the stand: four steel legs (or block piers) and a deck
  if (rng.chance(0.6)) { b.t('metal'); for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x + a * (R - 0.04), y + H / 2, z + e * (R - 0.04), 0.06, H, 0.06, col(old ? METAL.rust : 0x5a5c5e, 0.05, rng)); b.box(x, y + H - 0.03, z, 2 * R + 0.1, 0.06, 2 * R + 0.1, col(old ? METAL.rust : 0x6a6c6e, 0.05, rng)); }
  else { b.t('block'); for (const a of [-1, 1]) b.box(x + a * (R - 0.12), y + H / 2, z, 0.2, H, 2 * R, col(0xa8a49a, 0.04, rng)); b.t('slab').box(x, y + H - 0.04, z, 2 * R + 0.12, 0.08, 2 * R + 0.12, col(0x9c968a, 0.04, rng)); }
  const y0 = y + H;
  if (kind === 'plastic') { // ribbed polyethylene tank, black (sun-greyed when old), a domed lid
    const pc = col(old ? 0x4a4846 : 0x262624, 0.03, rng);
    b.t('plain'); lathe(b, [[R * 0.9, 0], [R, 0.06], [R, T * 0.3], [R * 0.97, T * 0.35], [R, T * 0.4], [R, T * 0.7], [R * 0.97, T * 0.75], [R, T * 0.8], [R * 0.95, T * 0.95], [R * 0.55, T * 1.05], [R * 0.3, T * 1.07]], pc, x, y0, z, 14);
    b.cyl(x, y0 + T * 1.09, z, R * 0.3, R * 0.32, 0.06, 10, pc.clone().offsetHSL(0, 0, 0.04));
  } else if (kind === 'cement') { // old asbestos-cement tank: grey-white, a flat lid, stains
    const cc = col(old ? 0x9e9a90 : 0xbab6ac, 0.03, rng);
    b.t('concrete').cyl(x, y0 + T / 2, z, R, R * 0.96, T, 12, cc).cyl(x, y0 + T + 0.03, z, R + 0.02, R + 0.02, 0.06, 12, cc.clone().offsetHSL(0, 0, -0.05));
  } else { // galvanised steel, banded, rust at the seams when old
    b.t('metal').cyl(x, y0 + T / 2, z, R, R, T, 12, col(old ? 0x8a7a6a : METAL.steel, 0.04, rng)).cyl(x, y0 + T + 0.04, z, R * 0.6, R, 0.1, 12, col(METAL.steel, 0.04, rng));
    if (old) for (const yy of [0.3, 0.65]) b.t('rust').cyl(x, y0 + T * yy, z, R + 0.01, R + 0.01, 0.06, 12, col(METAL.rust, 0.06, rng));
  }
  // the downpipe to the roof
  b.t('plain'); rod(b, [x + R * 0.7, y0 + 0.1, z], [x + R * 0.7, y + 0.05, z], 0.03, col(old ? 0x6a6a64 : 0xd8d8d0), 6);
  c.info.tanks = (c.info.tanks || 0) + 1;
}

// what shows through a big open door: a workbench on the back wall, shelving, barrels, crates
function buildInterior(b, c, w, d, t, plH) {
  const { rng } = c, y = plH + 0.05, iw = w - 2 * t, id = d - 2 * t;
  if (iw < 3 || id < 3) return;
  const wood = col(rng.pick([WOOD.weathered, WOOD.dark, WOOD.fresh]), 0.05, rng), metal = col(rng.pick([METAL.steel, METAL.rust, METAL.dark]), 0.05, rng);
  b.t('wood');
  // workbench along the back wall
  const bl = Math.min(iw * 0.6, 4), bz = -id / 2 + 0.4, bx = rng.range(-iw / 2 + bl / 2 + 0.2, iw / 2 - bl / 2 - 0.2);
  b.box(bx, y + 0.9, bz, bl, 0.08, 0.7, wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(bx + sx * (bl / 2 - 0.08), y + 0.45, bz + sz * 0.28, 0.08, 0.9, 0.08, wood);
  b.t('metal');
  for (let i = 0; i < 3; i++) b.box(bx + rng.range(-bl / 2 + 0.3, bl / 2 - 0.3), y + 1.0, bz + rng.range(-0.15, 0.15), rng.range(0.2, 0.45), rng.range(0.1, 0.25), rng.range(0.15, 0.3), col(rng.pick([METAL.rust, METAL.dark, 0x7a3a2a, 0x4a5a6a]), 0.08, rng), rng.range(0, 3));
  // shelving on a side wall
  const sx = (rng.chance(0.5) ? -1 : 1) * (iw / 2 - 0.25), sl = Math.min(id * 0.5, 3);
  for (const hh of [0.5, 1.1, 1.7]) b.box(sx, y + hh, -id / 4, 0.45, 0.05, sl, metal);
  for (const sz of [-1, 1]) b.box(sx, y + 0.95, -id / 4 + sz * (sl / 2 - 0.03), 0.45, 1.9, 0.05, metal);
  for (let i = 0; i < 5; i++) b.box(sx, y + rng.pick([0.5, 1.1, 1.7]) + 0.13, -id / 4 + rng.range(-sl / 2 + 0.2, sl / 2 - 0.2), 0.35, 0.22, rng.range(0.2, 0.5), col(rng.pick([0x8a6a4a, 0x5a6a5a, METAL.rust, 0xb0a080]), 0.08, rng));
  // barrels and crates in a corner
  const cx = -sx * 0.75, cz = id / 2 - 1.4;
  for (let i = 0; i < rng.int(2, 4); i++) b.cyl(cx + rng.range(-0.8, 0.8), y + 0.45, cz + rng.range(-0.6, 0.4), 0.3, 0.3, 0.9, 8, col(rng.pick([METAL.rust, 0x4a6a7a, 0x8a3a2a, METAL.dark]), 0.06, rng));
  b.t('wood');
  for (let i = 0; i < rng.int(1, 3); i++) b.box(-cx + rng.range(-0.6, 0.6), y + 0.3 + i * 0.6, cz - 0.3, 0.6, 0.58, 0.6, wood.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.08), rng.range(-0.3, 0.3));
  // a hanging work lamp
  b.t('metal').box(0, c.Y(c.floors) - 0.6, 0, 0.05, 1.0, 0.05, col(METAL.dark)).box(0, c.Y(c.floors) - 1.15, 0, 0.4, 0.12, 0.4, col(METAL.steel));
}

// roof terrace on a lower wing: railing on open edges, a shade (ramada) and the odd pot
function buildTerrace(b, c, sides, w, d, H, t) {
  const { rng, mass: m } = c;
  const top = H + 0.02;
  if (m.rail === 'railing') {
    const rc = col(rng.pick([METAL.dark, METAL.rust, 0x3f4a44]), 0.05, rng);
    b.t('metal');
    for (const s of sides) {
      if (coveredBy(c, s, s.L / 2) || c.spec.party?.includes(s.name)) continue;
      const at = (u) => [s.ax + s.dx * u - s.nx * t / 2, s.az + s.dz * u - s.nz * t / 2];
      const n = Math.max(1, Math.round(s.L / 1.5));
      for (let i = 0; i <= n; i++) { const [x, z] = at((i * s.L) / n); b.box(x, top + 0.55, z, 0.06, 1.0, 0.06, rc); }
      const [mx, mz] = at(s.L / 2);
      b.box(mx, top + 1.03, mz, s.L, 0.06, 0.07, rc, s.ry);
      b.box(mx, top + 0.55, mz, s.L, 0.03, 0.03, rc, s.ry);
    }
  }
  if (m.shade) {
    const sw = Math.min(w - 2 * t - 0.6, 4.2), sd = Math.min(d - 2 * t - 0.6, 3.6);
    if (sw > 1.6 && sd > 1.6) {
      const ph = 2.3, pc = col(WOOD.pole, 0.06, rng);
      b.t('wood');
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(sx * (sw / 2 - 0.08), top + ph / 2, sz * (sd / 2 - 0.08), 0.12, ph, 0.12, pc);
      for (const sz of [-1, 1]) b.box(0, top + ph + 0.06, sz * (sd / 2 - 0.08), sw + 0.3, 0.14, 0.12, pc);
      if (m.shade === 'latilla') {
        b.t('bark');
        const lc = col(WOOD.weathered, 0.05, rng);
        for (let x = -sw / 2; x <= sw / 2 + 0.01; x += 0.16) b.box(x, top + ph + 0.17, 0, 0.07, 0.07, sd + 0.3, lc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06));
      } else if (m.shade === 'tin') {
        b.t('corrugated').box(0, top + ph + 0.18, 0, sw + 0.4, 0.04, sd + 0.4, col(rng.pick(ROOF.corrugated), 0.06, rng), 0, 0.06, 0);
      } else {
        b.t('plain').box(0, top + ph + 0.16, 0, sw + 0.1, 0.02, sd + 0.1, col(rng.pick(MISC.cloth), 0.05, rng));
      }
    }
  }
  if (c.inhabited && rng.chance(0.6)) { // a few pots
    b.t('plain');
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) b.cyl(rng.range(-w / 2 + t + 0.4, w / 2 - t - 0.4), top + 0.2, rng.range(-d / 2 + t + 0.4, d / 2 - t - 0.4), 0.2, 0.14, 0.4, 7, col(0xa8643c, 0.06, rng));
  }
}

// ---------------------------------------------------------------------------------------------
function styleFor(c, s) {
  if (c.vstyle && c.kind.style !== 'none' && c.kind.style !== 'mil') { const o = styleWindows(c.vstyle, c, s); if (o === false) return null; if (o) return o; }
  const mat = c.newMat;
  const st = c.kind.style;
  const small = ['adobe', 'stone', 'timber', 'metal'].includes(c.prewar && c.origin !== 'rebuilt' ? c.baseMat : mat);
  if (c.layout === 'diner' && s.name !== 'back') return { kind: 'ribbon', w: 99, h: 1.1, sill: 0.95, bay: 99 };
  if (st === 'shop' && s.name === 'front') return { kind: 'store', w: 2.6, h: 2.0, sill: 0.5, bay: 3.4 };
  if (st === 'ind') return { kind: 'high', w: 1.8, h: 0.8, sill: c.fh - 1.3, bay: 3.8 };
  if (st === 'chapel') return s.name === 'front' ? null : { kind: 'tall', w: 0.7, h: 2.0, sill: 2.4, bay: 3.2 };
  if (st === 'none') return null;
  if (st === 'mil') return { kind: 'slit', w: 0.9, h: 0.22, sill: 1.35, bay: 2.2 };
  if (c.retro && ['res', 'reg'].includes(st) && c.rng.chance(0.6)) return { kind: 'ribbon', w: 99, h: 0.95, sill: 1.05, bay: 99 };
  if (c.vstyle === 'pill') return { kind: 'port', w: 0.8, h: 0.8, sill: 1.3, bay: 2.4 };
  if (c.vstyle === 'casona') return { kind: 'win', w: 0.95, h: 1.45, sill: 0.95, bay: 2.5 };
  if (c.vern) return { kind: 'win', w: 0.75, h: 0.95, sill: 1.05, bay: 3.6 };
  if (small) return { kind: 'win', w: 0.85, h: 1.05, sill: 1.0, bay: 3.4 };
  return { kind: 'win', w: 1.3, h: 1.35, sill: 0.95, bay: 2.8 };
}

const span0 = (lo, hi) => hi - lo;
// obra negra: the concrete columns (castillos) stand at the corners and every ~3.2 m; a door or window that
// would sit on one slides sideways to the nearest clear spot between them (the same grid styles.js draws)
export function castilloGrid(s, step = 3.2) { const span = s.u1 - s.u0, n = Math.max(1, Math.round(span / step)); return Array.from({ length: n + 1 }, (_, i) => s.u0 + (span * i) / n); }
// also the surviving pre-war frame of an infill build (columns every ~3.6 m, 0.32 wide): no window or door under one
function clearCastillos(s, step = 3.2, colHalf = 0.12) {
  const cols = castilloGrid(s, step), half = colHalf + 0.08; // column half-width + a little frame
  const hits = (o, u0, u1) => cols.some((u) => u1 > u - half && u0 < u + half) || s.openings.some((q) => q !== o && q.floor === o.floor && u1 > q.u0 - 0.15 && u0 < q.u1 + 0.15);
  for (const o of s.openings) {
    if (!cols.some((u) => o.u1 > u - half && o.u0 < u + half)) continue;
    const w = o.u1 - o.u0; let best = null;
    for (let k = 1; k <= 40; k++) for (const sg of [-1, 1]) {
      const d = sg * k * 0.1, u0 = o.u0 + d, u1 = o.u1 + d;
      if (best == null && u0 >= s.u0 + 0.35 && u1 <= s.u1 - 0.35 && !hits(o, u0, u1)) best = d;
    }
    if (best != null) { o.u0 += best; o.u1 += best; if (o.u != null) o.u += best; }
  }
}
function layoutOpenings(s, c, wallH, t) {
  const { rng, kind, mass } = c;
  const out = [];
  const margin = t + 0.5;
  const lo = s.u0 + margin, hi = s.u1 - margin;
  if (hi - lo < 0.8) return out;
  const isFront = s.name === 'front', isBack = s.name === 'back';
  if (c.spec.party?.includes(s.name)) return out; // shared wall with the neighbour in a row
  const occupied = [];
  const free = (a, bb) => occupied.every(([x0, x1]) => bb < x0 - 0.35 || a > x1 + 0.35) && a >= lo && bb <= hi;

  const E = c.spec.entrances?.[s.name];
  if (isFront && !mass.noDoor && (mass.main || mass.doors)) {
    const nd = mass.doors ?? kind.doors;
    if (kind.bigdoor && !mass.noBigDoor) {
      const bw = Math.min(3.8, (hi - lo) * 0.55);
      const u = rng.chance(0.5) ? (lo + hi) / 2 : lo + bw / 2 + (hi - lo - bw) * rng.range(0, 0.3);
      out.push({ u0: u - bw / 2, u1: u + bw / 2, y0: 0.3, y1: Math.min(3.3, wallH - 0.6), type: 'bigdoor', floor: 0 });
      occupied.push([u - bw / 2, u + bw / 2]);
    }
    for (let i = 0; i < nd; i++) {
      const dw = kind.style === 'chapel' ? 1.6 : 1.0;
      let u = nd === 1 && !kind.bigdoor ? (lo + hi) / 2 + (c.kind.style === 'res' ? rng.range(-1, 1) * (hi - lo) * 0.15 : 0) : lo + ((i + 0.5) * (hi - lo)) / nd;
      for (let tries = 0; tries < 8 && !free(u - dw / 2, u + dw / 2); tries++) u = rng.range(lo + dw / 2, hi - dw / 2);
      if (!free(u - dw / 2, u + dw / 2)) continue;
      out.push({ u0: u - dw / 2, u1: u + dw / 2, y0: 0.3, y1: kind.style === 'chapel' ? 3.0 : 2.25, type: 'door', floor: 0 });
      occupied.push([u - dw / 2, u + dw / 2]);
    }
  } else if (isBack && mass.main && (c.spec.backDoor || rng.chance(0.35)) && kind.style !== 'none') {
    const u = rng.range(lo + 0.6, hi - 0.6);
    out.push({ u0: u - 0.45, u1: u + 0.45, y0: 0.3, y1: 2.15, type: 'door', floor: 0 });
    occupied.push([u - 0.45, u + 0.45]);
  }

  // entrances chosen by hand (spec.entrances[side]: none | door | two | double | big): doors on the main block, 'none'
  // clears the side on every block; a side left out stays automatic
  if (E) { // (the automatic doors above still ran, so the random stream and the rest of the look don't change)
    out.length = 0; occupied.length = 0;
    const rng = new RNG(`${c.spec.id}:entr:${s.name}:${mass.mi ?? 0}`);
    if (E !== 'none' && mass.main) {
      const want = E === 'two' ? [[1.0, 'door'], [1.0, 'door']] : E === 'double' ? [[1.7, 'door']] : E === 'big' ? [[Math.min(3.6, Math.max(2.4, (hi - lo) * 0.55)), 'bigdoor']] : [[1.0, 'door']];
      let placed = 0;
      want.forEach(([dw, type], i) => {
        let u = want.length === 1 ? (lo + hi) / 2 : lo + ((i + 0.5) * (hi - lo)) / want.length;
        for (let tries = 0; tries < 12 && !free(u - dw / 2, u + dw / 2); tries++) u = rng.range(lo + dw / 2, hi - dw / 2);
        if (!free(u - dw / 2, u + dw / 2)) return;
        out.push({ u0: u - dw / 2, u1: u + dw / 2, y0: 0.3, y1: type === 'bigdoor' ? Math.min(3.3, wallH - 0.6) : 2.25, type, floor: 0, ...(E === 'double' ? { double: true } : {}) });
        occupied.push([u - dw / 2, u + dw / 2]); placed++;
      });
      if (placed < want.length) (c.info.entranceMiss ||= []).push(s.name);
    }
  }

  // new storey on a pre-war base: a door at the upper floor on one side, reached by an outside stair along that wall
  if (c.mix?.kind === 'storey' && mass.main && c.floors >= 2 && !c.damage && s.name === (c.mix.side > 0 ? 'right' : 'left') && !c.spec.party?.includes(s.name)) {
    const H = c.Y(c.floors - 1), n = Math.ceil(H / 0.2), run = n * 0.25, dir = s.name === 'right' ? 1 : -1; // u runs back -> front on the right side, front -> back on the left
    if (hi - lo >= run + 1.0) {
      const ud = dir > 0 ? lo + 0.55 : hi - 0.55, ua = Math.min(ud - 0.6, ud + dir * (run + 0.6)), ub = Math.max(ud + 0.6, ud + dir * (run + 0.6));
      out.push({ u0: ud - 0.45, u1: ud + 0.45, y0: H + 0.05, y1: H + 2.1, type: 'door', floor: c.floors - 1 });
      s.stair = { u: ud, dir, H, n, run, ua, ub };
    }
  }
  if (mass.rooms?.includes(s.name)) { // guest rooms: a door and a window per room, every floor
    out.push(...roomBays(lo, hi, c.floors, c.fh, free, c.prewar));
    if (mass.zaguan && isFront) zaguan(out, lo, hi, c);
    return cover(out, s, c);
  }
  let st = styleFor(c, s);
  if (st?.kind === 'ribbon') st = { kind: 'win', w: 1.45, h: st.h, sill: st.sill, bay: 2.3 }; /* no long strips: separate windows with piers between */
  if (!st || mass.noWin) return out;
  if (c.muralSide === s.name && mass.main) return out; // blank wall kept for the mural
  if (c.shadeSide === s.name && mass.main) { // blank wall under the side shade: at most a side door onto it
    if (!E && kind.style !== 'none' && span0(lo, hi) > 3 && rng.chance(0.45)) { const u = (lo + hi) / 2 + rng.range(-0.5, 0.5) * (hi - lo - 2); out.push({ u0: u - 0.45, u1: u + 0.45, y0: 0.3, y1: 2.15, type: 'door', floor: 0 }); occupied.push([u - 0.45, u + 0.45]); }
    // a long wall isn't left blank: the shade / kitchen corner takes the middle, a window near each end on every floor
    if (hi - lo > 7 && (st.kind === 'win' || st.kind === 'port' || st.kind === 'slit')) {
      const ww = Math.min(st.w, 1.2), r2 = new RNG(`${c.spec.id}:sidewin:${s.name}:${mass.mi ?? 0}`); // own stream: the rest of the building rolls as before
      for (let f = 0; f < c.floors; f++) for (const u of [lo + 0.9 + ww / 2, hi - 0.9 - ww / 2]) {
        if (f === 0 && !free(u - ww / 2, u + ww / 2)) continue;
        if (r2.chance(0.15)) continue;
        out.push({ u0: u - ww / 2, u1: u + ww / 2, y0: c.Y(f) + (f > 0 && st.kind === 'high' ? Math.min(st.sill, c.fhU - 1.3) : st.sill) + (f === 0 ? 0.3 : 0), y1: Math.min(c.Y(f) + (f > 0 && st.kind === 'high' ? Math.min(st.sill, c.fhU - 1.3) : st.sill) + st.h + (f === 0 ? 0.3 : 0), c.Y(f + 1) - 0.35), type: st.kind, floor: f });
      }
    }
    return out;
  }
  const span = hi - lo;
  const isSide = !isFront && !isBack;
  let n = Math.max(0, Math.floor(span / st.bay));
  if (st.kind === 'slit') n = Math.max(1, Math.floor(span / st.bay));
  if (isSide && (st.kind === 'win' || st.kind === 'port')) n = Math.min(n, span > 6 ? 2 : span > 3.2 ? 1 : 0);
  if (n === 0 && span > Math.min(st.w, 3) + 0.8 && (!isSide || st.kind === 'ribbon')) n = 1;
  const fullSkip = isBack ? 0.3 : 0.08;
  // self-built walls aren't laid out on a grid: windows drift off their bays, vary in width and sill, now and then
  // a small high one (bathroom / kitchen); post-war builds most, pre-war homes a little; formal styles stay regular
  const irr = ['win', 'port'].includes(st.kind) && !['casona', 'spanish', 'storefront', 'midcentury', 'two_storey'].includes(c.vstyle) ? (c.vern ? 1 : ['res', 'shop'].includes(kind.style) ? 0.4 : 0) : 0;
  const r3 = new RNG(`${c.spec.id}:winjit:${s.name}:${mass.mi ?? 0}`); // own stream, so the rest of the building rolls as before
  for (let f = 0; f < c.floors; f++) {
    for (let i = 0; i < n; i++) {
      const slot = span / n;
      let ww = st.kind === 'ribbon' ? (span - 0.6) * 0.82 : Math.min(st.w * (irr ? 1 + r3.range(-0.25, 0.4) * irr : 1), slot - 0.6);
      let h = f > 0 && st.kind === 'store' ? 1.35 : st.h, sillJ = irr ? r3.range(-0.12, 0.12) * irr : 0;
      if (irr && r3.chance(0.15 * irr)) { ww = Math.min(ww, r3.range(0.45, 0.6)); h = r3.range(0.4, 0.5); sillJ = (f === 0 ? c.fh : c.fhU) - st.sill - h - 0.55; } // a small high window
      const u = Math.max(lo + ww / 2 + 0.3, Math.min(hi - ww / 2 - 0.3, lo + (i + 0.5) * slot + (irr ? r3.range(-0.32, 0.32) * slot * irr : 0)));
      if (ww < 0.4) continue;
      if (f === 0 && !free(u - ww / 2, u + ww / 2)) continue;
      if (rng.chance(fullSkip)) continue;
      const y0 = c.Y(f) + (f === 0 && st.kind === 'store' ? st.sill : f > 0 && st.kind === 'store' ? 0.95 : f > 0 && st.kind === 'high' ? Math.min(st.sill, c.fhU - 1.3) : st.sill) + sillJ;
      out.push({ u0: u - ww / 2, u1: u + ww / 2, y0: y0 + (f === 0 ? 0.3 : 0), y1: Math.min(y0 + h + (f === 0 ? 0.3 : 0), c.Y(f + 1) - 0.35), type: st.kind, floor: f });
    }
  }
  // casona: ground-floor openings arched; the middle front window upstairs opens onto a balcony
  if (c.vstyle === 'casona') {
    for (const o of out) if (o.floor === 0 && (o.type === 'win' || o.type === 'door')) { const r = (o.u1 - o.u0) / 2; o.shape = 'arch'; o.y1 = Math.min(o.y1 + r, c.fh - 0.25); }
    if (isFront && mass.main && c.floors >= 2 && !c.damage) {
      const ups = out.filter((o) => o.floor === 1 && o.type === 'win');
      const bo = ups.sort((a, b2) => Math.abs((a.u0 + a.u1) / 2 - s.L / 2) - Math.abs((b2.u0 + b2.u1) / 2 - s.L / 2))[0];
      if (bo) { const um = (bo.u0 + bo.u1) / 2; Object.assign(bo, { type: 'door', u0: um - 0.5, u1: um + 0.5, y0: c.Y(1) + 0.05, y1: c.Y(1) + 2.15, balcony: true }); }
    }
  }
  // plain two-storey: the window over the front door opens onto a small slab balcony
  if (c.vstyle === 'two_storey' && isFront && mass.main && c.floors >= 2 && !c.damage) {
    const dr = out.find((o) => o.type === 'door' && o.floor === 0), ups = out.filter((o) => o.floor === 1 && o.type === 'win');
    const bo = dr && ups.sort((a, b2) => Math.abs((a.u0 + a.u1) / 2 - (dr.u0 + dr.u1) / 2) - Math.abs((b2.u0 + b2.u1) / 2 - (dr.u0 + dr.u1) / 2))[0];
    if (bo && c.rng.chance(0.75)) { const um = (bo.u0 + bo.u1) / 2; Object.assign(bo, { type: 'door', u0: um - 0.45, u1: um + 0.45, y0: c.Y(1) + 0.05, y1: c.Y(1) + 2.1, balcony: true }); }
  }
  if (c.vstyle === 'pill') for (const o of out) if (o.type === 'port') o.shape = 'round';
  if (c.vstyle === 'spanish' || c.vstyle === 'sonoran') for (const o of out) if (o.floor === 0 && (o.type === 'win' || (o.type === 'door' && c.vstyle === 'spanish'))) { const r = (o.u1 - o.u0) / 2; o.shape = 'arch'; o.y1 = Math.min(o.y1 + r, c.fh - 0.25); }
  // Sonoran zaguán: the main door widened into an arched carriage gate
  if (mass.zaguan && isFront) zaguan(out, lo, hi, c);
  if (c.vstyle === 'sonoran' && isFront && mass.main) { const dr = out.find((o) => o.type === 'door' && o.floor === 0); if (dr) { const um = (dr.u0 + dr.u1) / 2, hw = Math.min(1.25, (hi - lo) / 4); if (out.every((o) => o === dr || um + hw < o.u0 - 0.3 || um - hw > o.u1 + 0.3)) Object.assign(dr, { u0: um - hw, u1: um + hw, y1: Math.min(c.fh - 0.2, 2.9), shape: 'arch', zaguan: true }); } }
  // vernacular: a row of small vent slots high under the roof for the cross-breeze
  if (c.vstyle === 'adobe' && !isFront && span > 2) {
    const vy = c.Y(c.floors) - 0.55, nv = Math.max(1, Math.floor(span / 1.6));
    for (let i = 0; i < nv; i++) { const u = lo + ((i + 0.5) * span) / nv; if (out.some((o) => o.y1 > vy - 0.1 && u + 0.2 > o.u0 && u - 0.2 < o.u1)) continue; out.push({ u0: u - 0.16, u1: u + 0.16, y0: vy, y1: vy + 0.2, type: 'vent', floor: c.floors - 1 }); }
  }
  // stripped: holes where blocks were taken, on the block grid
  if (c.stripped) for (let i = 0; i < rng.int(0, 2); i++) {
    const hw2 = Math.round(rng.range(0.6, 1.4) / 0.4) * 0.4, hh = Math.round(rng.range(0.4, 1.0) / 0.2) * 0.2;
    const u = Math.round(rng.range(lo + hw2 / 2, Math.max(lo + hw2 / 2, hi - hw2 / 2)) / 0.4) * 0.4, y = Math.round(rng.range(0.6, wallH - hh - 0.3) / 0.2) * 0.2;
    if (out.some((o) => u + hw2 / 2 > o.u0 - 0.3 && u - hw2 / 2 < o.u1 + 0.3 && y + hh > o.y0 && y < o.y1)) continue;
    out.push({ u0: u - hw2 / 2, u1: u + hw2 / 2, y0: y, y1: y + hh, type: 'hole', floor: 0 });
  }
  return cover(out, s, c);
}

function zaguan(out, lo, hi, c) {
  const dr = out.find((o) => o.type === 'door' && o.floor === 0); if (!dr) return;
  const um = (dr.u0 + dr.u1) / 2, hw = Math.min(1.3, (hi - lo) / 4);
  if (out.every((o) => o === dr || um + hw < o.u0 - 0.3 || um - hw > o.u1 + 0.3)) Object.assign(dr, { u0: um - hw, u1: um + hw, y1: Math.min(c.fh - 0.2, 2.9), shape: 'arch', zaguan: true });
}

// drop openings that would open into another wing; a window facing a terrace may become its door
function cover(out, s, c) {
  if (!c.masses || c.masses.length < 2) return out;
  let terraceDoor = false;
  const res = [];
  for (const o of out) {
    const hit = [o.u0 + 0.1, (o.u0 + o.u1) / 2, o.u1 - 0.1].map((u) => coveredBy(c, s, u)).find(Boolean);
    if (!hit) { res.push(o); continue; }
    const h = c.Y(hit.floors || c.spec.floors || 1);
    if (o.y0 < h + 0.2) continue;
    if (hit.terrace && !terraceDoor && c.Y(o.floor) <= h + 0.1 && o.type === 'win' && c.rng.chance(0.85)) {
      const um = (o.u0 + o.u1) / 2;
      res.push({ u0: um - 0.48, u1: um + 0.48, y0: h + 0.05, y1: h + 2.15, type: 'door', floor: o.floor });
      terraceDoor = true;
    } else res.push(o);
  }
  return res;
}

// wall as columns of solid spans
function buildWall(b, s, c, t, tOld, tNew) {
  const { rng } = c;
  const L = s.L;
  const cuts = new Set([s.u0, s.u1]);
  for (const o of s.openings) { cuts.add(o.u0); cuts.add(o.u1); }
  const noisy = c.damage > 0 || s.splitFn;
  if (noisy) for (let u = s.u0; u < s.u1; u += 0.5) cuts.add(u);
  const xs = [...cuts].filter((u) => u >= s.u0 && u <= s.u1).sort((a, b2) => a - b2);
  // vernacular walls lean in a little (all wall work tilts about mid-height so it stays on one plane)
  const lean = c.lean || 0, piv = (s.wallH || 3) / 2, tl = Math.tan(lean);
  const place = (u0, u1, y0, y1, dIn0, dIn1, color, layer, tilt = 0) => {
    if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return;
    if (layer != null) b.t(layer);
    const um = (u0 + u1) / 2, dm = (dIn0 + dIn1) / 2 + ((y0 + y1) / 2 - piv) * tl;
    const x = s.ax + s.dx * um - s.nx * dm, z = s.az + s.dz * um - s.nz * dm;
    b.box(x, (y0 + y1) / 2, z, u1 - u0, y1 - y0, dIn1 - dIn0, color, s.ry, lean + tilt);
  };
  // columns -> solid spans (after cutting openings)
  const cols = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const u0 = xs[i], u1 = xs[i + 1], um = (u0 + u1) / 2;
    let spans = [[0.25, s.topFn(um)]];
    for (const o of s.openings) {
      if (um <= o.u0 || um >= o.u1) continue;
      const next = [];
      for (const [a, z] of spans) {
        if (o.y1 <= a || o.y0 >= z) { next.push([a, z]); continue; }
        if (o.y0 > a) next.push([a, o.y0]);
        if (o.y1 < z) next.push([o.y1, z]);
      }
      spans = next;
    }
    cols.push({ u0, u1, um, spans, split: s.splitFn ? s.splitFn(um) : null });
  }
  // merge runs of identical columns and emit boxes
  const emit = (getSpans) => {
    let run = null;
    const flush = () => { if (run) for (const sp of run.spans) place(run.u0, run.u1, ...sp); run = null; };
    for (const cl of cols) {
      const sp = getSpans(cl);
      const key = JSON.stringify(sp.map((q) => [q[0], q[1], q[2], q[3]]));
      if (run && run.key === key && Math.abs(run.u1 - cl.u0) < 1e-6) run.u1 = cl.u1;
      else { flush(); run = { key, u0: cl.u0, u1: cl.u1, spans: sp }; }
    }
    flush();
  };
  if (!s.splitFn) {
    emit((cl) => cl.spans.map(([a, z]) => [a, z, 0, t, c.colors.old, c.L.old]));
    // battered base: a sloped skirt of the same earth, thick at the ground (vernacular)
    // (battered base: a smooth swept skirt, adobeBase())
  } else {
    // pre-war fabric below a ragged line, new material above. The new wall runs down behind the
    // old one (recessed 4 cm) so it merges into clean runs; the old courses stay ragged.
    const splitMin = Math.min(...cols.map((cl) => cl.split));
    emit((cl) => cl.spans.filter(([a]) => a < cl.split).map(([a, z]) => [a, Math.min(z, cl.split), 0, tOld, c.colors.old, c.L.old]));
    emit((cl) => cl.spans.filter(([, z]) => z > splitMin).map(([a, z]) => [Math.max(a, splitMin), z, 0.04, 0.04 + tNew, c.colors.neu, c.L.neu]));
  }
  // darker splash band at the base of solid wall
  if (c.condition < 0.95) {
    const dirt = c.colors.old.clone().offsetHSL(0, 0.02, -0.06);
    emit((cl) => (cl.spans.length && cl.spans[0][0] <= 0.26 && cl.spans[0][1] > 0.6 ? [[0.25, 0.25 + Math.min(0.45, cl.spans[0][1] - 0.3), -0.012, 0.0, dirt, c.L.old]] : []));
  }
  // pre-war + new: damage patched with whatever was to hand (adobe, mismatched block, a tin sheet)
  if (c.mix && c.mass.part !== 'new' && !['infill', 'salvage'].includes(c.mix.kind) && !c.damage && (c.mix.kind === 'patched' || rng.chance(0.45))) {
    const n = Math.round((L / 3.2) * (c.mix.kind === 'patched' ? 0.8 + c.mix.share * 1.6 : 0.5));
    for (let k = 0; k < n; k++) {
      const pw = rng.range(0.5, 1.5), ph = rng.range(0.4, 1.2), u = rng.range(s.u0 + 0.3, Math.max(s.u0 + 0.4, s.u1 - pw - 0.3)), y0 = rng.range(0.35, Math.max(0.45, (s.wallH || 3) - ph - 0.2));
      if (s.topFn(u) < y0 + ph + 0.1 || s.topFn(u + pw) < y0 + ph + 0.1 || s.openings.some((o) => u + pw > o.u0 - 0.15 && u < o.u1 + 0.15 && y0 + ph > o.y0 - 0.15 && y0 < o.y1 + 0.15)) continue;
      const kd = rng.weighted({ adobe: 3, block: 2, tin: 1 });
      if (kd === 'tin') place(u, u + pw, y0, y0 + ph, -0.03, -0.01, col(rng.pick([METAL.rust, METAL.rust2, ...ROOF.corrugated]), 0.06, rng), 'corrugated');
      else if (kd === 'adobe') place(u, u + pw, y0, y0 + ph, -0.02, 0, col(rng.pick(MAT.adobe.wall), 0.05, rng), 'adobe');
      else place(u, u + pw, y0, y0 + ph, -0.02, 0, col(rng.pick(MAT.block.wall), 0.05, rng).offsetHSL(0, 0, rng.range(-0.06, 0.04)), 'block');
    }
  }
  // --- finishes on the wall surface
  const f = c.finish;
  const clip = (cl, y0, y1) => cl.spans.map(([a, z]) => [Math.max(a, y0), Math.min(z, y1)]).filter(([a, z]) => z - a > 0.05);
  if (c.whole && f.band) {
    const bc = col(f.band.hex, 0.03, rng);
    // on a battered vernacular wall the band is painted on the sloped skirt
    const skirt = false; // the smooth battered base takes the band colour instead (adobeBase)
    emit((cl) => clip(cl, 0.25, 0.25 + f.band.h).map(([a, z]) => (skirt && cl.spans[0][0] <= 0.3 && cl.spans[0][1] > 1.3 ? [a, Math.min(z, 1.3), -0.285, -0.265, f.wainscot ? new THREE.Color(0.5, 0.5, 0.5) : bc, f.wainscot ? 'azulejo' : 'plaster', 0.2] : [a, z, -0.02, -0.004, f.wainscot ? new THREE.Color(0.5, 0.5, 0.5) : bc, f.wainscot ? 'azulejo' : 'plaster'])));
  }
  if (c.whole && f.band && c.livery?.dash && s.L > 1.2) { // the road line: yellow dashes along the middle of the base band
    const ym = 0.25 + f.band.h / 2, dc = col(c.livery.dash, 0.02, rng);
    for (let u = s.u0 + 0.3; u < s.u1 - 0.7; u += 1.2) {
      if (s.openings.some((o) => u + 0.6 > o.u0 - 0.05 && u < o.u1 + 0.05 && o.y0 < ym + 0.1)) continue;
      place(u, u + 0.6, ym - 0.05, ym + 0.05, -0.026, -0.016, dc, 'plaster');
    }
  }
  if (c.whole && f.border && s.wallH) {
    const y0 = s.wallH - 0.42, y1 = s.wallH - 0.42 + f.border.h;
    const bc = col(f.border.hex, 0.03, rng);
    emit((cl) => (s.topFn(cl.um) >= y1 ? clip(cl, y0, y1).map(([a, z]) => [a, z, -0.02, -0.004, bc, 'plaster']) : []));
  }
  if ((c.vstyle === 'pill' || c.vstyle === 'casona') && c.condition < 0.95) { // plaster fallen off: brick / stone under it
    const n = rng.int(0, 2 + Math.round((1 - c.condition) * L / 4));
    for (let k = 0; k < n; k++) {
      const pw = rng.range(0.35, 1.1), u = rng.range(s.u0 + 0.3, Math.max(s.u0 + 0.4, s.u1 - pw - 0.3)), y0 = rng.range(0.4, Math.max(0.5, s.wallH - 1)), ph = rng.range(0.2, 0.6);
      if (s.topFn(u) < y0 + ph || s.openings.some((o) => u + pw > o.u0 - 0.15 && u < o.u1 + 0.15 && y0 + ph > o.y0 - 0.15 && y0 < o.y1 + 0.15)) continue;
      place(u, u + pw, y0, y0 + ph, -0.012, 0, col(rng.pick(c.vstyle === 'casona' ? MAT.stone.wall : MAT.brick.wall), 0.05, rng), c.vstyle === 'casona' ? 'stone' : 'brick');
    }
  }
  if (f.tier === 'faded' || (f.tier === 'wash' && rng.chance(0.8) && false)) { // ruins: remnants of old paint on the bare wall (worn paint on live buildings is a shader effect)
    // faded paint on ruins / flaking wash or worn paint revealing the material
    const n = f.fade === 'gone' ? rng.int(3 + Math.round(L / 4), 6 + Math.round(L / 2.5)) : f.fade === 'faded' ? rng.int(2, 4 + Math.round(L / 5)) : rng.int(1, 3 + Math.round(L / 6));
    for (let k = 0; k < n; k++) {
      const big = f.fade === 'gone' ? 1.6 : 1, pw = rng.range(0.6, 2.2) * big, u = rng.range(s.u0 + 0.3, Math.max(s.u0 + 0.4, s.u1 - pw - 0.3));
      const y0 = rng.range(0.3, 2.0), ph = rng.range(0.3, 1.1) * big;
      const cl = cols.find((q) => q.um >= u + pw / 2) || cols[0];
      if (!cl || s.topFn(u) < y0 + ph || s.topFn(u + pw) < y0 + ph) continue;
      if (s.openings.some((o) => u + pw > o.u0 && u < o.u1 && y0 + ph > o.y0 && y0 < o.y1)) continue;
      if (f.tier === 'faded') place(u, u + pw, y0, y0 + ph, -0.01, 0, col(f.body, 0.05, rng).lerp(c.colors.old, 0.45), 'limewash');
      else place(u, u + pw, y0, y0 + ph, -0.01, 0, c.colors.base.old, MAT_LAYER[c.baseMat]);
    }
  }
  // mural candidates: longest run of blank, full-height wall
  if (f.mural && c.whole && !c.spec.party?.includes(s.name) && !(c.shadeSide === s.name && c.mass.main)) {
    let run = null;
    const consider = (r) => {
      if (!r || r.u1 - r.u0 < 2.6) return;
      const base = 0.25 + (f.band ? f.band.h + 0.12 : 0.4), topY = s.wallH - (f.border ? 0.5 : 0.25);
      const h = Math.min(3.2, topY - base);
      if (h < 1.2) return;
      const um = (r.u0 + r.u1) / 2, y = base + h / 2;
      const w = Math.min(r.u1 - r.u0 - 0.6, 7);
      const p = c.toLocal(s.ax + s.dx * um + s.nx * 0.03, y, s.az + s.dz * um + s.nz * 0.03);
      const [nx, nz] = c.dirLocal(s.nx, s.nz);
      c.muralCands.push({ x: p[0], y: p[1], z: p[2], w, h, ry: Math.atan2(nx, nz), score: w + (s.name === 'front' ? 1.5 : s.name === 'back' ? -2 : 0.5) });
    };
    for (const cl of cols) {
      const blank = cl.spans.length === 1 && cl.spans[0][0] <= 0.3 && cl.spans[0][1] >= s.wallH - 0.1;
      if (blank) { if (run) run.u1 = cl.u1; else run = { u0: cl.u0, u1: cl.u1 }; }
      else { consider(run); run = null; }
    }
    consider(run);
  }

  // openings in building coords, for decoration / signs placed later
  for (const o of s.openings) {
    const um = (o.u0 + o.u1) / 2, p = c.toLocal(s.ax + s.dx * um, 0, s.az + s.dz * um);
    const [nx, nz] = c.dirLocal(s.nx, s.nz), [tx, tz] = c.dirLocal(s.dx, s.dz);
    c.info.openings.push({ x: p[0], z: p[2], nx, nz, tx, tz, w: o.u1 - o.u0, y0: o.y0, y1: o.y1, type: o.type, floor: o.floor, side: s.name, main: !!c.mass.main, wallH: s.wallH, top: s.topFn((o.u0 + o.u1) / 2) });
  }
  if (c.mass.main && !c.info.walls[s.name]) { const um = (s.u0 + s.u1) / 2, p = c.toLocal(s.ax + s.dx * um, 0, s.az + s.dz * um), [nx, nz] = c.dirLocal(s.nx, s.nz), [tx, tz] = c.dirLocal(s.dx, s.dz); c.info.walls[s.name] = { x: p[0], z: p[2], nx, nz, tx, tz, L: s.u1 - s.u0, wallH: s.wallH, top: s.topFn(um), party: !!c.spec.party?.includes(s.name) }; }
  // openings: frames, fills
  const masonry = ['adobe', 'stone'].includes(c.baseMat) || ['adobe', 'stone'].includes(c.newMat);
  for (const o of s.openings) {
    const topHere = Math.min(s.topFn(o.u0 + 0.05), s.topFn(o.u1 - 0.05));
    if (topHere < o.y0 + 0.2) continue;
    const y1 = Math.min(o.y1, topHere);
    const fill = chooseFill(o, c);
    const tw = f.surround ? 0.15 : 0.07;
    const frameCol = c.retro ? c.colors.chrome : c.finish.tier === 'ornate' && c.finish.accents ? col(c.finish.accents[(Math.round(o.u0 * 7) + o.floor) % 4], 0.03, rng) : c.colors.trim;
    const whole = y1 === o.y1;
    const isDoor = o.type === 'door';
    b.t(c.retro ? 'metal' : 'wood');
    if (o.shape) shapeOpening(b, s, c, o, y1, place, t, fill, frameCol);
    if (fill !== 'open' && fill !== 'bricked' && o.type !== 'bigdoor' && !o.shape) {
      // jambs + head (a dark timber lintel on adobe / stone)
      place(o.u0 - tw, o.u0, o.y0, y1, -0.03, 0.05, frameCol);
      place(o.u1, o.u1 + tw, o.y0, y1, -0.03, 0.05, frameCol);
      if (whole) {
        if (masonry) place(o.u0 - 0.28, o.u1 + 0.28, o.y1, o.y1 + 0.2, -0.04, t * 0.7, col(WOOD.dark, 0.06, rng), 'bark');
        else place(o.u0 - tw, o.u1 + tw, o.y1, o.y1 + tw, -0.03, 0.05, frameCol);
      }
      // sill: projecting for windows, a worn threshold for doors
      if (!isDoor) place(o.u0 - tw - 0.06, o.u1 + tw + 0.06, o.y0 - 0.08, o.y0, -0.1, 0.08, masonry ? c.colors.plinth : frameCol, masonry ? 'stone' : 'wood');
      else if (o.floor === 0) place(o.u0 - 0.06, o.u1 + 0.06, o.y0 - 0.06, o.y0 + 0.01, -0.14, t, c.colors.plinth, c.baseMat === 'adobe' || c.baseMat === 'stone' ? 'stone' : 'concrete');
    }
    const mid = t * 0.5;
    const winLike = o.type === 'win' || o.type === 'tall' || o.type === 'high';
    switch (fill) {
      case 'glass': case 'grille': case 'curtain': {
        windowGlass(b, s, c, o, y1, mid, place, fill === 'curtain');
        if (o.type === 'port') { // cross bars in the porthole
          b.t('metal'); const um = (o.u0 + o.u1) / 2, ym = (o.y0 + y1) / 2, r = (o.u1 - o.u0) / 2;
          place(um - 0.025, um + 0.025, ym - r, ym + r, mid - 0.05, mid - 0.02, col(METAL.dark)); place(o.u0, o.u1, ym - 0.025, ym + 0.025, mid - 0.05, mid - 0.02, col(METAL.dark));
          break;
        }
        b.t('wood');
        const um = (o.u0 + o.u1) / 2, ww = o.u1 - o.u0;
        if (o.type === 'store') {
          place(o.u0, o.u1, o.y0 + (y1 - o.y0) * 0.72, o.y0 + (y1 - o.y0) * 0.72 + 0.06, mid - 0.06, mid - 0.02, frameCol);
          if (ww > 1.6) place(um - 0.03, um + 0.03, o.y0, y1, mid - 0.06, mid - 0.02, frameCol);
        } else if (o.type === 'ribbon') { // ribbon window: thin metal mullions every ~0.9 m
          b.t('metal');
          const nm = Math.max(1, Math.round(ww / 0.9));
          for (let k = 1; k < nm; k++) { const uu = o.u0 + (k * ww) / nm; place(uu - 0.02, uu + 0.02, o.y0, y1, mid - 0.06, mid - 0.02, col(METAL.chrome, 0.03, rng)); }
          place(o.u0, o.u1, o.y0 + (y1 - o.y0) * 0.7, o.y0 + (y1 - o.y0) * 0.7 + 0.035, mid - 0.06, mid - 0.02, col(METAL.chrome, 0.03, rng));
        } else if (winLike) { // mullions: a cross on most windows, twin lights on wide ones
          if (ww > 0.7) place(um - 0.025, um + 0.025, o.y0, y1, mid - 0.06, mid - 0.02, frameCol);
          if (o.type !== 'high') place(o.u0, o.u1, o.y0 + (y1 - o.y0) * 0.62, o.y0 + (y1 - o.y0) * 0.62 + 0.05, mid - 0.06, mid - 0.02, frameCol);
        }
        if (fill === 'grille') { // wrought-iron reja proud of the wall (the house's herrería pattern when it has one)
          if (c.reja?.pat && c.reja.pat !== 'none') reja(b, s, o.u0 - 0.04, o.u1 + 0.04, o.y0 - 0.04, y1 + 0.04, c.reja.pat, c.reja.col, -0.06, o.shape === 'arch');
          else {
            const gc = col(METAL.dark, 0.04, rng);
            b.t('metal');
            const n = Math.max(3, Math.round(ww / 0.13));
            for (let k = 1; k < n; k++) { const u = o.u0 + (k * ww) / n; place(u - 0.012, u + 0.012, o.y0 - 0.02, y1 + 0.02, -0.07, -0.045, gc); }
            for (const yy of [o.y0 + 0.08, (o.y0 + y1) / 2, y1 - 0.08]) place(o.u0 - 0.04, o.u1 + 0.04, yy - 0.015, yy + 0.015, -0.08, -0.045, gc);
          }
        }
        break;
      }
      case 'shutters': case 'shut': {
        windowGlass(b, s, c, o, y1, mid, place, false);
        b.t('wood');
        const sw = (o.u1 - o.u0) / 2, sc = c.livery?.dark ? col(c.livery.dark) : frameCol.clone().offsetHSL(0, 0, -0.03), lc = sc.clone().offsetHSL(0, 0, c.livery?.dark ? 0.05 : -0.07);
        const leaf = (u0, u1, d0, d1) => {
          place(u0, u1, o.y0, y1, d0, d1, sc);
          const n = Math.max(3, Math.round((y1 - o.y0) / 0.11));
          for (let k = 1; k < n; k++) { const yy = o.y0 + (k * (y1 - o.y0)) / n; place(u0 + 0.05, u1 - 0.05, yy - 0.015, yy + 0.015, d0 - 0.015, d0, lc); }
        };
        if (fill === 'shut') { leaf(o.u0, o.u0 + sw - 0.005, -0.02, 0.02); leaf(o.u0 + sw + 0.005, o.u1, -0.02, 0.02); }
        else { leaf(o.u0 - sw - 0.02, o.u0 - 0.02, -0.07, -0.03); leaf(o.u1 + 0.02, o.u1 + sw + 0.02, -0.07, -0.03); }
        break;
      }
      case 'boarded': {
        b.ch('glass').t('plain'); place(o.u0, o.u1, o.y0, y1, mid, mid + 0.02, GLASS.broken); b.ch('main').t('wood');
        const n = Math.max(2, Math.round((y1 - o.y0) / 0.35));
        for (let k = 0; k < n; k++) {
          if (rng.chance(0.25)) continue;
          const yy = o.y0 + ((k + 0.5) * (y1 - o.y0)) / n;
          const um = (o.u0 + o.u1) / 2, ext = (o.u1 - o.u0) / 2 + 0.12;
          const x = s.ax + s.dx * um + s.nx * 0.03, z = s.az + s.dz * um + s.nz * 0.03;
          b.box(x, yy, z, ext * 2, 0.2, 0.04, col(WOOD.weathered, 0.08, rng), s.ry, 0, (rng.next() - 0.5) * 0.25);
        }
        break;
      }
      case 'bricked':
        place(o.u0, o.u1, o.y0, y1, 0.06, t - 0.02, col(rng.pick(MAT[c.newMat === c.baseMat ? 'block' : c.newMat].wall), 0.05, rng), MAT_LAYER[c.newMat === c.baseMat ? 'block' : c.newMat]);
        break;
      case 'door': {
        if (o.floor === 0 && s.name === 'back' && c.mass.main && !c.info.backDoor) {
          const um = (o.u0 + o.u1) / 2;
          const p = c.toLocal(s.ax + s.dx * um + s.nx * 0.02, o.y1, s.az + s.dz * um + s.nz * 0.02);
          const [nx, nz] = c.dirLocal(s.nx, s.nz);
          c.info.backDoor = { x: p[0], z: p[2], nx, nz, w: o.u1 - o.u0 };
        }
        if (o.floor === 0 && s.name === 'front' && c.mass.main && !c.info.frontDoor) {
          const um = (o.u0 + o.u1) / 2;
          const p = c.toLocal(s.ax + s.dx * um + s.nx * 0.02, o.y1, s.az + s.dz * um + s.nz * 0.02);
          const [nx, nz] = c.dirLocal(s.nx, s.nz), [tx, tz] = c.dirLocal(s.dx, s.dz);
          c.info.frontDoor = { x: p[0], y: p[1], z: p[2], nx, nz, tx, tz, w: o.u1 - o.u0, sill: p[1] - (o.y1 - o.y0) };
        }
        if (rng.chance(0.15)) { // ajar: leaf swung in, dark interior
          const dc = c.colors.trim.clone().offsetHSL(0, -0.05, -0.08);
          const um = o.u0 + 0.05, ww = o.u1 - o.u0 - 0.05;
          const x = s.ax + s.dx * um - s.nx * 0.12, z = s.az + s.dz * um - s.nz * 0.12;
          const a = s.ry - 0.9;
          b.t('door').box(x + (Math.cos(a) * ww) / 2, (o.y0 + y1) / 2, z - (Math.sin(a) * ww) / 2, ww, y1 - o.y0, 0.06, dc, a);
        } else doorLeaf(b, c, o, o.shape === 'arch' ? y1 - (o.u1 - o.u0) / 2 : y1, place, t);
        if (o.balcony) buildBalcony(b, s, c, o);
        if (c.reja?.door && c.reja.pat !== 'none' && o.floor === 0 && s.name === 'front' && c.condition >= 0.5) reja(b, s, o.u0 - 0.03, o.u1 + 0.03, o.y0 + 0.02, y1 + 0.03, c.reja.pat === 'sunburst' ? 'sundoor' : c.reja.pat, c.reja.col, -0.1, o.shape === 'arch'); // the door 'protector'
        if (c.retro && o.floor === 0 && s.name === 'front' && !c.damage) { // glass-block side light
          const gu0 = o.u1 + 0.2, gu1 = gu0 + 0.64;
          if (gu1 < s.u1 - 0.2 && !s.openings.some((o2) => o2 !== o && gu1 + 0.1 > o2.u0 && gu0 - 0.1 < o2.u1 && o2.y0 < o.y1)) {
            b.t('plain');
            for (let gy = o.y0 + 0.1; gy < o.y1 - 0.2; gy += 0.21) for (let gu = gu0; gu < gu1 - 0.1; gu += 0.21) place(gu, gu + 0.19, gy, gy + 0.19, -0.02, 0.0, col(0xbcd2d4, 0.05, rng));
          }
        }
        break;
      }
      case 'rollup': {
        const k = rng.range(0.25, 1);
        place(o.u0, o.u1, y1 - (y1 - o.y0) * k, y1, 0.08, 0.14, col(rng.pick([METAL.steel, METAL.rust, METAL.paint_teal, METAL.paint_cream]), 0.06, rng), 'corrugated');
        b.t('metal'); place(o.u0 - 0.1, o.u1 + 0.1, y1, y1 + 0.32, -0.12, 0.02, col(METAL.steel, 0.05, rng)); // roll box
        break;
      }
      case 'barn': {
        const wc = col(rng.pick([WOOD.weathered, WOOD.fresh, 0x8a4a3a]), 0.05, rng);
        const um = (o.u0 + o.u1) / 2;
        b.t('wood');
        const planks = (u0, u1) => {
          const n = Math.max(2, Math.round((u1 - u0) / 0.2));
          for (let k = 0; k < n; k++) place(u0 + (k * (u1 - u0)) / n, u0 + ((k + 1) * (u1 - u0)) / n - 0.015, o.y0, y1, 0.08, 0.15, wc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06));
          const bc = wc.clone().offsetHSL(0, 0, -0.08);
          for (const yy of [o.y0 + 0.3, y1 - 0.3]) place(u0 + 0.05, u1 - 0.05, yy - 0.07, yy + 0.07, 0.05, 0.08, bc);
        };
        if (rng.chance(0.5)) planks(o.u0, o.u1);
        else planks(o.u0, um - 0.6); // one leaf open: the inside shows
        break;
      }
      case 'open': default:
        break;
    }
  }
}

// door leaf: plank (rustic), panel (town) or steel (workshops / pre-war concrete)
// herrería: a grille in the wall's frame (u along the wall, y up, d < 0 proud of the face). Patterns: plain bars,
// sunburst (rays from the bottom middle, a half sun at the hub), scroll (bars with C-scrolls between), diamond lattice;
// 'sundoor' = a door protector: two sunbursts stacked
function reja(b, s, u0, u1, y0, y1, pat, gc, d, arch = false) {
  const P = (u, y, dd = d) => [s.ax + s.dx * u - s.nx * dd, y, s.az + s.dz * u - s.nz * dd];
  const bar = (ua, ya, ub, yb, r = 0.009) => b.beam(P(ua, ya), P(ub, yb), r, 3, gc);
  const w = u1 - u0, h = y1 - y0, um = (u0 + u1) / 2, R = w / 2, ys = arch ? y1 - R : y1; // arched opening: the grille follows the arch
  const top = (u) => (arch ? ys + Math.sqrt(Math.max(0, R * R - (u - um) ** 2)) : y1);
  // the outline from the bottom-left corner up, over the top, down to the bottom-right corner (no bottom edge)
  const outline = [[u0, y0], [u0, ys]];
  if (arch) for (let k = 1; k < 12; k++) { const a = Math.PI - (Math.PI * k) / 12; outline.push([um + Math.cos(a) * R, ys + Math.sin(a) * R]); }
  outline.push([u1, ys], [u1, y0]);
  b.t('metal');
  bar(u0, y0, u1, y0, 0.016); for (let i = 0; i < outline.length - 1; i++) bar(outline[i][0], outline[i][1], outline[i + 1][0], outline[i + 1][1], 0.016); // the frame
  const alongOutline = (t) => { // a point at fraction t of the outline's length
    const L = []; let tot = 0; for (let i = 0; i < outline.length - 1; i++) { const l = Math.hypot(outline[i + 1][0] - outline[i][0], outline[i + 1][1] - outline[i][1]); L.push(l); tot += l; }
    let x = t * tot; for (let i = 0; i < L.length; i++) { if (x <= L[i]) { const f = x / (L[i] || 1); return [outline[i][0] + (outline[i + 1][0] - outline[i][0]) * f, outline[i][1] + (outline[i + 1][1] - outline[i][1]) * f]; } x -= L[i]; }
    return outline[outline.length - 1];
  };
  const sun = (ya, yb, full) => { // rays from (um, ya) out to the outline (or to a box up to yb)
    const H = yb - ya, n = Math.max(9, Math.round((2 * H + w) / 0.16));
    for (let k = 1; k < n; k++) { const t = k / n; let q; if (full) q = alongOutline(t); else { const per = 2 * H + w, x = t * per; q = x < H ? [u0, ya + x] : x < H + w ? [u0 + (x - H), yb] : [u1, yb - (x - H - w)]; } if (q[1] > ya + 0.04) bar(um, ya, q[0], q[1]); }
    const HH = Math.min(w, H); for (const rr of [HH * 0.16, HH * 0.42]) { let pv = null; for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10), q = [um - Math.cos(a) * rr, ya + Math.sin(a) * rr]; if (pv) bar(pv[0], pv[1], q[0], q[1]); pv = q; } }
    bar(u0, ya, u1, ya, 0.012);
  };
  if (pat === 'diamond' && arch) pat = 'plain';
  if (pat === 'sunburst') sun(y0 + 0.02, y1, true);
  else if (pat === 'sundoor') { sun(y0 + 0.02, y0 + h * 0.5, false); sun(y0 + h * 0.5, y1, true); }
  else if (pat === 'diamond') {
    const sp = 0.26;
    for (let k = -Math.ceil(h / sp); k <= Math.ceil(w / sp); k++) {
      for (const sg of [1, -1]) {
        const c0 = u0 + k * sp;
        let [ax, ay] = [c0, y0], [bx, by] = [c0 + sg * h, y1];
        const clipU = (x, y, xo, yo, X) => [X, y + ((yo - y) * (X - x)) / (xo - x || 1e-9)];
        if (ax < u0) [ax, ay] = clipU(ax, ay, bx, by, u0); if (ax > u1) [ax, ay] = clipU(ax, ay, bx, by, u1);
        if (bx < u0) [bx, by] = clipU(bx, by, ax, ay, u0); if (bx > u1) [bx, by] = clipU(bx, by, ax, ay, u1);
        if (Math.abs(bx - ax) > 0.02 && ay >= y0 - 0.01 && by <= y1 + 0.01 && ax >= u0 - 0.01 && ax <= u1 + 0.01) bar(ax, ay, bx, by);
      }
    }
  } else { // plain / scroll: vertical bars up to the frame (the arch), rails
    const n = Math.max(3, Math.round(w / 0.13));
    for (let k = 1; k < n; k++) { const u = u0 + (k * w) / n; bar(u, y0, u, top(u), 0.011); }
    bar(u0, y0 + Math.min(h * 0.5, ys - y0 - 0.05), u1, y0 + Math.min(h * 0.5, ys - y0 - 0.05), 0.012);
    if (pat === 'scroll') for (let k = 0; k < n; k++) { if (k % 2) continue; const ua = u0 + (k * w) / n, ub = u0 + ((k + 1) * w) / n, cu = (ua + ub) / 2, r = (ub - ua) / 2; for (const yc of [y0 + (ys - y0) * 0.3, y0 + (ys - y0) * 0.72]) { let pv = null; for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.15 + (Math.PI * 1.7 * i) / 8, q = [cu + Math.cos(a) * r * 0.9, yc + Math.sin(a) * r * 1.3]; if (pv) bar(pv[0], pv[1], q[0], q[1], 0.007); pv = q; } } }
  }
}
function doorLeaf(b, c, o, y1, place, t) {
  const { rng } = c;
  const d0 = Math.min(0.12, t * 0.4), d1 = d0 + 0.06;
  const ww = o.u1 - o.u0, h = y1 - o.y0;
  const metal = c.kind.style === 'ind' || c.kind.style === 'mil' || (['concrete', 'block', 'brick'].includes(c.newMat) && rng.chance(0.35));
  const style = metal ? 'metal' : (TIER_RANK[c.finish.tier] ?? 0) >= 3 ? 'panel' : rng.weighted({ plank: c.prewar ? 1 : 3, panel: c.prewar ? 3 : 1.5 });
  const paint = c.livery?.dark ? col(c.livery.dark, 0.02, rng) : rng.chance(0.6) ? c.colors.trim.clone().offsetHSL(0, -0.05, -0.08) : col(rng.pick([WOOD.fresh, WOOD.weathered, WOOD.dark]), 0.05, rng);
  if (style === 'plank') {
    b.t('wood');
    const n = Math.max(3, Math.round(ww / 0.17));
    for (let k = 0; k < n; k++) place(o.u0 + (k * ww) / n, o.u0 + ((k + 1) * ww) / n - 0.012, o.y0, y1, d0, d1, paint.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.07));
    const bc = paint.clone().offsetHSL(0, 0, -0.07);
    for (const yy of [o.y0 + 0.3, o.y0 + h - 0.3]) place(o.u0 + 0.06, o.u1 - 0.06, yy - 0.06, yy + 0.06, d0 - 0.03, d0, bc);
    b.t('metal'); for (const yy of [o.y0 + 0.3, o.y0 + h - 0.3]) place(o.u1 - 0.42, o.u1 - 0.04, yy - 0.025, yy + 0.025, d0 - 0.045, d0 - 0.03, col(METAL.dark));
  } else if (style === 'panel') {
    b.t('door');
    place(o.u0, o.u1, o.y0, y1, d0, d1, paint);
    b.t('wood');
    const pc = paint.clone().offsetHSL(0, 0, 0.04), m = 0.1, gap = 0.08, cw = (ww - 2 * m - gap) / 2;
    const rows = [[o.y0 + m, o.y0 + h * 0.42], [o.y0 + h * 0.42 + gap, y1 - m]];
    for (const [ya, yb] of rows) for (let k = 0; k < 2; k++) {
      const u0 = o.u0 + m + k * (cw + gap);
      place(u0, u0 + cw, ya, yb, d0 - 0.02, d0, pc);
    }
  } else {
    b.t('metal');
    const mc = c.livery?.dark ? col(c.livery.dark, 0.02, rng) : col(rng.pick([METAL.steel, METAL.paint_teal, METAL.paint_cream, METAL.rust, 0x5a6a5a]), 0.05, rng);
    place(o.u0, o.u1, o.y0, y1, d0, d1, mc);
    const rc = mc.clone().offsetHSL(0, 0, -0.06);
    for (const yy of [o.y0 + h * 0.25, o.y0 + h * 0.5, o.y0 + h * 0.75]) place(o.u0 + 0.05, o.u1 - 0.05, yy - 0.025, yy + 0.025, d0 - 0.02, d0, rc);
    place(o.u0 + ww * 0.25, o.u1 - ww * 0.25, o.y0 + 0.15, o.y0 + 0.4, d0 - 0.015, d0, col(METAL.dark)); // kick vent
  }
  b.t('metal');
  place(o.u1 - 0.16, o.u1 - 0.08, o.y0 + 1.0, o.y0 + 1.06, d0 - 0.06, d0, col(METAL.dark)); // handle
}

// glass pane: per-window random decides whether it's lit in a given preset; a light pool goes outside
function windowGlass(b, s, c, o, y1, mid, place, curtain) {
  const r = c.inhabited ? c.rng.next() : -1;
  b.ch('glass').w(r).t('plain');
  place(o.u0, o.u1, o.y0, y1, mid - 0.02, mid + 0.02, c.glass || GLASS.dark);
  if (curtain) { // drawn curtains just behind the glass (read through it; glow when lit)
    const cc = col(c.rng.pick(MISC.cloth), 0.05, c.rng).multiplyScalar(0.8), ww = o.u1 - o.u0;
    const k = c.rng.range(0.25, 0.45);
    place(o.u0, o.u0 + ww * k, o.y0, y1, mid - 0.03, mid - 0.021, cc);
    if (c.rng.chance(0.6)) place(o.u1 - ww * k, o.u1, o.y0, y1, mid - 0.03, mid - 0.021, cc);
  }
  b.w(-1).ch('main');
  if (r >= 0) {
    const um = (o.u0 + o.u1) / 2, ym = (o.y0 + y1) / 2;
    const p = c.toLocal(s.ax + s.dx * um + s.nx * 0.7, ym - 0.2, s.az + s.dz * um + s.nz * 0.7);
    const [dnx, dnz] = c.dirLocal(s.nx, s.nz);
    c.info.lights.push({ x: p[0], y: p[1], z: p[2], color: LIGHT_COL.window, radius: o.type === 'store' ? 7 : 5.5, intensity: o.type === 'store' ? 1.0 : 0.6, kind: 'window', r, dir: [dnx, dnz] });
  }
}

// pre-war + new, house inside a ruin: the old walls round the whole footprint, broken down unevenly, with the old
// slab underfoot and a gap at the front where the door was; the new house stands inside at the back
function ruinShell(b, c, masses, info) {
  const { rng } = c, [w, d] = c.spec.size || [12, 10], t = THICK[c.baseMat] || 0.25, top = c.fh * 1.2;
  const sides = [[-w / 2, -d / 2, 1, 0, w], [w / 2, -d / 2, 0, 1, d], [w / 2, d / 2, -1, 0, w], [-w / 2, d / 2, 0, -1, d]];
  const m = masses[0], gap = [m.x - 1.1, m.x + 1.1]; // the front opening lines up with the new house
  b.t(c.L.old);
  sides.forEach(([ax, az, dx, dz, L], si) => {
    const nx = dz, nz = -dx, ry = Math.atan2(-dz, dx);
    // heights follow a slow noise along the wall (long runs, worn down toward the corners less), merged into runs
    const H = (um) => { const n = c.noise.noise2(um / 4.5 + si * 5.1, si * 1.7) * 0.5 + 0.5, corner = Math.exp(-((Math.min(um, L - um) / 1.6) ** 2)); return n < 0.16 && corner < 0.5 ? 0 : Math.max(0.4, Math.round((0.5 + (n * 0.8 + corner * 0.4) * (top - 0.5)) / 0.3) * 0.3); };
    let run = null;
    const flush = (uEnd) => { if (run && run.h > 0) { const um = (run.u + uEnd) / 2, x = ax + dx * um - nx * t / 2, z = az + dz * um - nz * t / 2; b.box(x, run.h / 2, z, uEnd - run.u + 0.01, run.h, t, c.colors.old, ry); } };
    for (let u = 0; u < L - 0.01; u += 0.5) {
      const um = u + 0.25, x = ax + dx * um;
      let h = H(um);
      if (si === 2 && x > gap[0] && x < gap[1]) h = 0;
      if (!run || run.h !== h) { flush(u); run = { u, h }; }
    }
    flush(L);
  });
  b.t('concrete').box(0, 0.04, 0, w - 0.2, 0.08, d - 0.2, col(0x9a948a, 0.03, rng)); // the old floor slab
  for (let k = 0; k < 6; k++) b.t(c.L.old).blob(rng.range(-w / 2 + 1, w / 2 - 1), 0.12, rng.range(0, d / 2 - 1), rng.range(0.2, 0.5), rng.range(0.1, 0.25), rng.range(0.2, 0.5), c.colors.old, 'dodec', rng.next() * 3); // rubble
  info.patio = { x: 0, z: 0, w: w - 0.4, d: d - 0.4 };
}

// pre-war + new: the parts that make the seam read (per mass, mass frame)
function mixExtras(b, c, sides, d) {
  const { rng } = c, M = c.mix, m = d.m, at = (s, u, out) => [s.ax + s.dx * u + s.nx * out, s.az + s.dz * u + s.nz * out];
  const oldConc = col(0xa8a49a, 0.03, rng).lerp(c.colors.base.old, 0.35).offsetHSL(0, -0.02, -0.04);
  const party = (s) => c.spec.party?.includes(s.name);
  if (M.kind === 'infill') { // the surviving pre-war frame: columns at the corners and every few metres, a beam at each floor
    b.t('concrete');
    for (const s of sides) {
      if (party(s)) continue;
      const span = s.u1 - s.u0, n = Math.max(1, Math.round(span / 3.6));
      for (let i = 0; i <= n; i++) { const u = s.u0 + (span * i) / n; if (s.openings.some((o) => u > o.u0 - 0.15 && u < o.u1 + 0.15)) continue; const [x, z] = at(s, u, 0.02); b.box(x, d.wallH / 2 + 0.1, z, 0.32, d.wallH + 0.2, d.t + 0.08, oldConc, s.ry); }
      for (let f = 1; f <= d.floors; f++) { const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.022); b.box(x, f * d.fh - 0.12, z, span + 0.1, 0.26, d.t + 0.09, oldConc, s.ry); }
    }
  }
  if (M.kind === 'storey' && m.part === 'storey') { // the old slab edge where the new storey starts, and the outside stair
    const y = d.fh * (d.floors - 1);
    b.t('concrete'); for (const s of sides) { if (party(s)) continue; const [x, z] = at(s, (s.u0 + s.u1) / 2, 0.03); b.box(x, y - 0.06, z, s.u1 - s.u0 + 0.1, 0.2, 0.08, oldConc, s.ry); }
    for (const s of sides) {
      const st = s.stair; if (!st) continue;
      const sc = c.colors.neu.clone().offsetHSL(0, 0, -0.05), lay = c.L.neu === 'corrugated' || c.L.neu === 'wood' ? 'concrete' : c.L.neu, rise = st.H / st.n;
      b.t(lay);
      { const [x, z] = at(s, st.u, 0.6); b.box(x, (st.H - 0.3) / 2, z, 1.1, st.H + 0.3, 1.0, sc, s.ry); } // landing on a pier
      for (let k = 0; k < st.n; k++) { const top = st.H - (k + 1) * rise, u = st.u + st.dir * (0.55 + (k + 0.5) * 0.25); if (top <= 0.01) break; const [x, z] = at(s, u, 0.6); b.box(x, (top - 0.3) / 2, z, 0.26, top + 0.3, 1.0, sc, s.ry); }
      const rc = col(rng.pick([0x3a3a38, METAL.rust, WOOD.weathered]), 0.05, rng);
      const P0 = at(s, st.u + st.dir * 0.55, 1.05), P1 = at(s, st.u + st.dir * (0.55 + st.run), 1.05);
      b.t('metal'); rod(b, [P0[0], st.H + 0.95, P0[1]], [P1[0], 0.95, P1[1]], 0.025, rc, 5);
      for (let k = 0; k <= 3; k++) { const f = k / 3, x = P0[0] + (P1[0] - P0[0]) * f, z = P0[1] + (P1[1] - P0[1]) * f, yb = st.H * (1 - f); rod(b, [x, yb, z], [x, yb + 0.95, z], 0.02, rc, 4); }
      (c.info.sideUse ||= {})[s.name] = 1;
    }
  }
  if (M.kind === 'salvage' && m.main) { // a new house wearing pre-war parts: a sign fragment, a car door for a shutter, hubcaps
    const sd = sides[rng.chance(0.5) ? 1 : 3];
    if (sd && !party(sd) && sd.u1 - sd.u0 > 3) {
      const u = (sd.u0 + sd.u1) / 2 + rng.range(-0.6, 0.6), y = Math.min(d.wallH - 0.5, 2.3), [x, z] = at(sd, u, 0.05), p = c.toLocal(x, y, z), [nx, nz] = c.dirLocal(sd.nx, sd.nz);
      const txt = rng.pick(['REFRESCOS', 'FARMACIA', 'LLANTAS', 'MOTEL', 'ABARROTES', 'GASOLINA', 'HOTEL', 'TALLER', 'CERVEZA']);
      c.info.signs.push({ text: txt, x: p[0], y: p[1], z: p[2], ry: Math.atan2(nx, nz), w: Math.min(2.6, sd.u1 - sd.u0 - 1), h: 0.6, style: 'prewar', rng: new RNG(`${c.spec.id}:salv`), opts: { rust: true, missing: 0.2 } });
      b.t('plain'); for (let k = 0; k < rng.int(3, 5); k++) { const [hx, hz] = at(sd, u - 1 + k * 0.5, 0.03); b.cyl(hx, 1.45 + (k % 2) * 0.12, hz, 0.19, 0.19, 0.03, 12, col(rng.pick([0xc8ccc8, 0x9aa0a0, 0xb8b4a8]), 0.04, rng), Math.PI / 2, sd.ry); }
    }
    const fr = sides[2], win = fr?.openings.find((o) => o.type === 'win' && o.floor === 0);
    if (win) { const [x, z] = at(fr, win.u1 + 0.5, 0.25); b.t('metal').box(x, (win.y0 + win.y1) / 2, z, 0.95, Math.min(1.0, win.y1 - win.y0 + 0.1), 0.06, col(rng.pick([0x8a2a22, 0x2a4a6a, 0x3a5a3a, 0xc8b070]), 0.05, rng).lerp(col(METAL.rust), 0.35), fr.ry + 0.8); }
  }
}

function chooseFill(o, c) {
  const { rng, origin } = c;
  const isDoor = o.type === 'door', big = o.type === 'bigdoor';
  if (o.type === 'vent' || o.type === 'hole' || origin === 'stripped') return 'open';
  if (origin === 'ruin') return rng.chance(0.15) ? 'boarded' : 'open';
  if (big) {
    if (c.prewar && ['concrete', 'block', 'brick'].includes(c.baseMat)) return rng.chance(0.75) ? 'rollup' : 'barn';
    return 'barn';
  }
  if (isDoor) return 'door';
  if (['win', 'high'].includes(o.type) && (c.mass?.cells || c.layout === 'station' || c.spec.kind === 'utility')) return 'grille'; // cells / police station: barred
  if (c.reja?.pat && c.reja.pat !== 'none' && c.reja.all && ['win', 'tall'].includes(o.type) && o.floor === 0 && c.condition >= 0.5) return 'grille'; // the house's herrería on every window
  const kept = c.spec.zcat === 'wealthy'; // the good side of town: nothing boarded or bricked up
  if (!kept && (origin === 'repurposed' || origin === 'built_on_ruin' && o.floor === 0)) {
    const r = rng.next();
    if (r < 0.2) return 'bricked';
    if (r < 0.35) return 'boarded';
  }
  if (!kept && origin === 'rebuilt' && o.floor === 0 && rng.chance(c.mix?.kind === 'patched' ? 0.25 : 0.1)) return rng.chance(0.6) ? 'bricked' : 'boarded';
  if (!kept && c.condition < 0.5 && rng.chance(0.3)) return 'boarded';
  if (!kept && c.condition < 0.62 && o.type === 'win' && rng.chance(0.12)) return 'boarded';
  if (o.type === 'win' && o.floor === 0 && ['res', 'shop', 'reg'].includes(c.kind.style) && rng.chance((TIER_RANK[c.finish.tier] ?? 0) >= 3 ? 0.6 : 0.3)) return 'grille';
  if (o.type === 'slit') return 'open';
  if (o.type === 'port') return c.condition < 0.5 && rng.chance(0.3) ? 'boarded' : 'glass';
  if (c.vstyle === 'casona' && o.type === 'win') return rng.chance(0.7) ? (rng.chance(0.3) ? 'shut' : 'shutters') : 'grille';
  if (['adobe', 'stone', 'plaster'].includes(c.newMat) && o.type === 'win' && rng.chance(0.45)) return rng.chance(0.25) ? 'shut' : 'shutters';
  if (c.inhabited && (o.type === 'win' || o.type === 'tall') && rng.chance(0.3)) return 'curtain';
  return 'glass';
}

// ---------------------------------------------------------------------------------------------
function roofColor(c, jitter = 0.05) {
  const r = ROOF[c.roofMat] ?? ROOF.corrugated;
  return col(Array.isArray(r) ? c.rng.pick(r) : r, jitter, c.rng);
}

function buildRoof(b, c, w, d, wallH, t, parapet) {
  const { rng } = c;
  const type = c.roofType;
  if (type === 'none') return;
  const roofFn = (fn) => { const Mi = b.M.clone().invert(), v = new THREE.Vector3(); (c.info._roofFns ||= []).push({ m: c.mass, fn: (x, z) => { v.set(x, 0, z).applyMatrix4(Mi); return fn(v.x, v.z); } }); };
  if (type === 'flat') {
    roofFn((x, z) => (Math.abs(x) <= w / 2 && Math.abs(z) <= d / 2 ? wallH + parapet : null));
    const rc = c.roofMat === 'flat_adobe' ? col(ROOF.flat_adobe, 0.05, rng) : roofColor(c);
    b.t(ROOF_LAYER[c.roofMat] || 'slab');
    if (c.R) roundBox(b, 0, wallH - 0.12, 0, w - 2 * t + 0.04, 0.28, d - 2 * t + 0.04, c.Rc.map((r) => (r ? Math.max(0.05, r - t) : 0)), rc);
    else b.box(0, wallH - 0.12, 0, w - 2 * t + 0.04, 0.28, d - 2 * t + 0.04, rc);
    if (c.retro && !c.damage && !c.mass.terrace) { // pre-war: everything inside the wall line — a flush coping, two trim bands, rooftop kit
      const top = wallH + parapet, trim = c.colors.trim.clone().lerp(c.colors.old, 0.35), Rk = (k) => (c.R ? c.Rc.map((r) => (r ? r + k : 0)) : 0);
      b.t('concrete');
      roundBox(b, 0, top + 0.05, 0, w + 0.04, 0.1, d + 0.04, Rk(0.02), c.colors.old.clone().offsetHSL(0, -0.04, 0.07));
      if (rng.chance(0.6)) roundBox(b, 0, top - 0.32, 0, w + 0.03, 0.08, d + 0.03, Rk(0.015), trim);
      // stair bulkhead + vents on the main part, set back from the edges
      if (c.mass.main && Math.min(w, d) > 6) {
        const bw = Math.min(3, w * 0.3), bd = Math.min(2.6, d * 0.3), bx = (rng.chance(0.5) ? 1 : -1) * (w / 2 - bw / 2 - 1.2), bz = -(d / 2 - bd / 2 - 1.2);
        b.t(c.L.old).box(bx, wallH + 1.1, bz, bw, 2.2, bd, c.colors.old);
        b.t('concrete').box(bx, wallH + 2.25, bz, bw + 0.1, 0.1, bd + 0.1, c.colors.old.clone().offsetHSL(0, -0.04, 0.07));
        b.t('door').box(bx, wallH + 0.95, bz + bd / 2 + 0.01, 0.9, 1.9, 0.04, col(METAL.dark));
      }
      b.t('metal');
      for (let i = 0; i < rng.int(1, 3); i++) {
        const vx = rng.range(-w / 2 + 1.2, w / 2 - 1.2), vz = rng.range(-d / 2 + 1.2, d / 2 - 1.2);
        if (rng.chance(0.5)) b.box(vx, wallH + 0.35, vz, 1.0, 0.7, 0.8, col(METAL.steel, 0.05, rng)); // condenser box
        else b.sm().cyl(vx, wallH + 0.4, vz, 0.25, 0.25, 0.8, 14, col(METAL.steel, 0.05, rng)).cone(vx, wallH + 0.95, vz, 0.32, 0.3, 14, col(METAL.dark)).sm(false); // vent cowl
      }
      return;
    }
    if (c.vstyle === 'adobe' && !c.damage && c.mass.main && rng.chance(0.35)) { // second roof: shade sheet on posts, air between
      const sw = (w - 2 * t) * 0.8, sd = (d - 2 * t) * 0.78, y = wallH + parapet + 0.45;
      b.t('wood');
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) b.box(sx * (sw / 2 - 0.1), (wallH + y) / 2, sz * (sd / 2 - 0.1), 0.09, y - wallH, 0.09, col(WOOD.pole, 0.05, rng));
      if (rng.chance(0.5)) b.t('corrugated').box(0, y + 0.04, 0, sw + 0.3, 0.05, sd + 0.3, col(rng.pick(ROOF.corrugated), 0.06, rng), 0, 0.05, 0);
      else { b.t('bark'); const lc = col(WOOD.weathered, 0.05, rng); for (let x = -sw / 2; x <= sw / 2 + 0.01; x += 0.17) b.box(x, y + 0.04, 0, 0.08, 0.07, sd + 0.25, lc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06)); }
    }
    // vigas: protruding roof beams on adobe / stone
    if (c.vstyle !== 'pill' && (['adobe', 'stone'].includes(c.newMat) || (c.newMat === 'plaster' && rng.chance(0.4)))) {
      const vc = col(WOOD.dark, 0.06, rng);
      b.t('bark');
      const long = w >= d;
      const L = long ? w : d, n = Math.floor((L - 2 * t) / 0.9);
      // the beam row sits clear above the window / door heads on its two faces (arches, high little windows), up into
      // the parapet if it has to; a beam that still can't clear an opening is left out
      const fo = (c._sides || []).filter((s) => (long ? ['front', 'back'] : ['left', 'right']).includes(s.name)).flatMap((s) => (s.openings || []).map((o) => {
        const a = s.name === 'back' ? o.u0 - w / 2 : s.name === 'front' ? w / 2 - o.u1 : s.name === 'right' ? o.u0 - d / 2 : d / 2 - o.u1;
        return { a, b: a + (o.u1 - o.u0), y1: o.y1 };
      }));
      const us = []; for (let i = 0; i < n; i++) us.push(-L / 2 + t + 0.45 + i * 0.9);
      const hits = (u) => fo.filter((o) => u + 0.15 > o.a && u - 0.15 < o.b);
      const cap = wallH + (parapet > 0.25 ? parapet - 0.22 : -0.12);
      let yc = wallH - 0.32;
      for (const u of us) for (const o of hits(u)) if (o.y1 + 0.16 <= cap) yc = Math.max(yc, o.y1 + 0.16);
      const VG = c.mass.main ? (c.info.vigas = { faces: long ? ['front', 'back'] : ['left', 'right'], y0: yc - 0.18, y1: yc + 0.2, yc, long, w, d, mx: c.mass.x || 0, mz: c.mass.z || 0, mrot: c.mass.rot || 0, beams: [] }) : null;
      for (const u of us) {
        if (rng.chance(0.12)) continue;
        const ext = rng.range(0.25, 0.55);
        if (hits(u).some((o) => o.y1 + 0.12 > yc)) continue;
        VG?.beams.push({ u, ext });
        for (const sgn of [-1, 1]) {
          if (long) b.cyl(u, yc, sgn * (d / 2 + ext / 2 - 0.05), 0.09, 0.09, ext + 0.1, 5, vc, Math.PI / 2, 0, 0);
          else b.cyl(sgn * (w / 2 + ext / 2 - 0.05), yc, u, 0.09, 0.09, ext + 0.1, 5, vc, 0, 0, Math.PI / 2);
        }
      }
      // canales (spouts)
      b.t('wood');
      const nc = rng.int(1, 2);
      for (let i = 0; i < nc; i++) {
        const u = rng.range(-w / 2 + 1, w / 2 - 1);
        b.box(u, wallH + 0.05, -d / 2 - 0.35, 0.22, 0.14, 0.75, vc);
      }
    }
    return;
  }
  if (type === 'collapsed') {
    // remaining slab tiles + a fallen one
    const rc = c.roofMat === 'flat_adobe' ? col(ROOF.flat_adobe, 0.05, rng) : col(ROOF.slab, 0.05, rng);
    b.t(ROOF_LAYER[c.roofMat] || 'slab');
    const n = Math.max(1, Math.round(w / 2.4)), k = Math.max(1, Math.round(d / 2.4));
    const sx = (w - 2 * t) / n, sz = (d - 2 * t) / k;
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) {
      const r = rng.next();
      const x = -w / 2 + t + sx * (i + 0.5), z = -d / 2 + t + sz * (j + 0.5);
      if (r < 0.3) b.box(x, wallH * (0.4 + 0.3 * rng.next()) * (c.damage > 0.6 ? 0.4 : 1), z, sx, 0.22, sz, rc, rng.range(-0.2, 0.2), rng.range(-0.6, 0.6), rng.range(-0.5, 0.5));
      else if (r < 0.3 + (1 - c.damage) * 0.5 && (i === 0 || j === 0 || i === n - 1 || j === k - 1)) b.box(x, wallH * (1 - c.damage * 0.6) - 0.12, z, sx + 0.01, 0.24, sz + 0.01, rc);
    }
    // a few bare beams
    const vc = col(WOOD.dark, 0.06, rng);
    b.t('wood');
    for (let i = 0; i < 3; i++) if (rng.chance(0.6)) {
      const z = rng.range(-d / 2 + 1, d / 2 - 1);
      b.plank([-w / 2 + t, wallH * (1 - c.damage * 0.5) - 0.3, z], [w / 2 - t - rng.range(0, w * 0.4), wallH * (1 - c.damage * 0.5) - rng.range(0.3, 2), z + rng.range(-0.4, 0.4)], 0.16, 0.18, vc);
    }
    return;
  }
  // pitched roofs, canonical frame: ridge along X (long axis)
  const sh = type === 'shed' ? c.shedHigh : null; // shed: which way the high edge faces (canonical: -Z)
  const ridgeAlongX = sh ? Math.abs(sh[1]) >= Math.abs(sh[0]) : (c.spec.ridge ? c.spec.ridge === 'x' : w >= d);
  const L = ridgeAlongX ? w : d, S = ridgeAlongX ? d : w; // L along ridge, S across
  b.pushT(0, 0, 0, sh ? (ridgeAlongX ? (sh[1] > 0 ? Math.PI : 0) : (sh[0] > 0 ? -Math.PI / 2 : Math.PI / 2)) : (ridgeAlongX ? 0 : Math.PI / 2) + (type === 'shed' && c.spec.shedFlip ? Math.PI : 0)); // shedFlip: the high edge to the front
  const low = type === 'shed' && c.roofLow; // near-flat tin on joists
  const pitch = low ? deg(3) : deg(c.S.pitch ?? ({ tile: 24, corrugated: 14, shingle: 30, thatch: 38, slab: 10 }[c.roofMat] ?? 20)) * (c.spec.pitch ? c.spec.pitch / 20 : 1);
  const o0 = low ? 0.3 : c.S.eave ?? (c.roofMat === 'thatch' ? 0.7 : c.vstyle === 'casona' ? 0.5 : 0.28);
  const o = c.roofMat === 'thatch' ? o0 : Math.min(o0, 0.12 + 0.045 * Math.min(w, d)); // eaves scale down on small buildings
  const tan = Math.tan(pitch);
  const wallCol = c.origin === 'rebuilt' || c.origin === 'built_on_ruin' ? c.colors.neu : c.colors.old;
  const wallLayer = c.origin === 'rebuilt' || c.origin === 'built_on_ruin' ? c.L.neu : c.L.old;
  // eaves sit up at the wall top (not drooping over the windows): the wall carries on up by the eave drop
  if (['gable', 'hip', 'skeleton', 'shed'].includes(type) && o > 0.15 && !c.damage) {
    const lift = Math.min(0.5, o * tan);
    b.t(wallLayer).box(0, wallH + lift / 2 - 0.01, 0, L - 0.02, lift + 0.02, S - 0.02, wallCol);
    wallH += lift;
  }
  const roofLayer = ROOF_LAYER[c.roofMat] || 'corrugated';
  const strips = (a, bb, width, thick, base, nStrip) => {
    // split a slope into strips across width for corrugated patchwork / tile rows
    for (let i = 0; i < nStrip; i++) {
      const off = -width / 2 + (width * (i + 0.5)) / nStrip;
      const sc = base.clone();
      if (c.roofMat === 'corrugated') { if (rng.chance(0.3)) sc.set(rng.pick(ROOF.corrugated)); sc.offsetHSL(0, 0, (rng.next() - 0.5) * 0.08); }
      else sc.offsetHSL(0, 0, (rng.next() - 0.5) * 0.03);
      b.t(roofLayer).plank([a[0] + off, a[1], a[2]], [bb[0] + off, bb[1], bb[2]], width / nStrip + 0.005, thick, sc);
    }
  };
  const base = roofColor(c);
  const nStrip = c.roofMat === 'corrugated' ? Math.max(2, Math.round((L + 2 * o) / 1.1)) : c.roofMat === 'tile' ? 1 : 1;
  if (type === 'gable' || type === 'skeleton' || type === 'hip') {
    const ey = wallH - o * tan, ry = wallH + (S / 2) * tan;
    roofFn((x, z) => (Math.abs(x) <= L / 2 + o && Math.abs(z) <= S / 2 + o ? Math.max(ey, ry - Math.abs(z) * tan) : null));
  }
  if (type === 'gable' || type === 'skeleton') {
    const rh = (S / 2) * tan;
    const eaveY = wallH - o * tan;
    const ridgeY = wallH + rh;
    for (const sg of [1, -1]) {
      const a = [0, eaveY, sg * (S / 2 + o)], bb = [0, ridgeY + 0.05, 0];
      if (type === 'skeleton') {
        const vc = col(WOOD.dark, 0.06, rng);
        b.t('wood');
        for (let x = -L / 2; x <= L / 2 + 0.01; x += 0.9) b.plank([x, a[1], a[2]], [x, bb[1], bb[2]], 0.1, 0.14, vc);
      } else strips(a, bb, L + 2 * o, 0.12, base, nStrip);
    }
    if (c.roofMat === 'tile' || c.roofMat === 'thatch') b.t(roofLayer).box(0, ridgeY + 0.08, 0, L + 2 * o, 0.16, 0.3, base.clone().offsetHSL(0, 0, -0.05));
    b.t(wallLayer);
    // gable ends
    for (const sg of [1, -1]) {
      const x = sg * (L / 2 - 0.02);
      b.tri([x, wallH, -S / 2], [x, wallH, S / 2], [x, ridgeY, 0], wallCol);
      const xi = sg * (L / 2 - t);
      b.tri([xi, wallH, -S / 2], [xi, wallH, S / 2], [xi, ridgeY, 0], wallCol);
    }
  } else if (type === 'vaults') { // bóveda catalana: shallow brick barrel vaults side by side, inside the parapet
    // each vault arches ACROSS x between two joists and runs the full depth in z
    const n = Math.max(1, Math.round((L - 2 * t) / 1.5)), vw = (L - 2 * t) / n, rise = Math.min(0.32, vw * 0.2), seg = 6, bc = col(rng.pick(MAT.brick.wall), 0.05, rng), D = S - 2 * t;
    b.t('brick');
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + t + vw * i, tone = bc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.04);
      const y = (u) => wallH - 0.15 + rise * (1 - (2 * u - 1) ** 2);
      for (let k = 0; k < seg; k++) { const xa = x0 + (vw * k) / seg, xb = x0 + (vw * (k + 1)) / seg; b.plank([xa, y(k / seg), 0], [xb, y((k + 1) / seg), 0], D, 0.1, tone.clone().offsetHSL(0, 0, (k - seg / 2) * 0.006)); }
      if (i > 0) b.t('metal').box(x0, wallH - 0.1, 0, 0.12, 0.14, D, col(METAL.dark)).t('brick'); // the steel joist the vaults spring from
    }
  } else if (type === 'sawtooth') { // north-light factory roof: teeth across the span, glazed on the steep face
    const n = Math.max(2, Math.round(S / 4)), tw = S / n, th = Math.min(2.4, tw * 0.55), gc = col(0x9aa8a8, 0.03, rng);
    for (let i = 0; i < n; i++) {
      const z0 = -S / 2 + tw * i, z1 = z0 + tw;
      strips([0, wallH, z0], [0, wallH + th, z1 - 0.05], L + 0.1, 0.08, base, nStrip);
      b.t(wallLayer); b.tri([-L / 2, wallH, z0], [-L / 2, wallH, z1], [-L / 2, wallH + th, z1], c.colors.old); b.tri([L / 2, wallH, z0], [L / 2, wallH, z1], [L / 2, wallH + th, z1], c.colors.old);
      b.ch('glass').w(rng.next()).t('plain').box(0, wallH + th / 2, z1 - 0.02, L - 0.3, th - 0.15, 0.04, gc); b.w(-1).ch('main');
      b.t('metal'); for (let x = -L / 2 + 0.6; x < L / 2; x += 1.5) b.box(x, wallH + th / 2, z1 - 0.01, 0.06, th, 0.06, col(METAL.dark));
    }
  } else if (type === 'barrel') { // arched roof across the span, curved gable ends
    const rise = S * 0.2, seg = 14;
    const yAt = (z) => wallH + rise * (1 - (2 * z / (S + 2 * o)) ** 2);
    for (let k = 0; k < seg; k++) { const z0 = -S / 2 - o + ((S + 2 * o) * k) / seg, z1 = -S / 2 - o + ((S + 2 * o) * (k + 1)) / seg; strips([0, yAt(z0), z0], [0, yAt(z1), z1], L + 2 * o * 0.5, 0.08, base, nStrip); }
    b.t(wallLayer);
    for (const sg of [-1, 1]) for (let k = 0; k < seg; k++) { const z0 = -S / 2 + (S * k) / seg, z1 = -S / 2 + (S * (k + 1)) / seg, x = sg * (L / 2 - 0.02); b.quad([x, wallH, z0], [x, wallH, z1], [x, yAt(z1) - 0.05, z1], [x, yAt(z0) - 0.05, z0], c.colors.old); }
  } else if (type === 'shed') {
    const rise = S * tan, oL = low && c.spec.row ? 0.0 : o; // row units: no overhang past the party walls, so the roofs run on as one
    const a = [0, wallH - o * tan, S / 2 + o], bb = [0, wallH + rise + o * tan, -S / 2 - o];
    roofFn((x, z) => (Math.abs(x) <= L / 2 + o && Math.abs(z) <= S / 2 + o ? wallH + (S / 2 - z) * tan - 0.08 : null)); // underside
    if (sh) { // the high edge of a joined part: if the neighbour's roof is higher there, a clerestory wall closes the gap (post-pass)
      const A = c.toLocal(-L / 2, wallH + rise, -S / 2), B2 = c.toLocal(L / 2, wallH + rise, -S / 2), O = c.toLocal(0, 0, -S / 2 - 1), M0 = c.toLocal(0, 0, -S / 2);
      (c.info._shedEdges ||= []).push({ m: c.mass, a: A, b: B2, out: [O[0] - M0[0], O[2] - M0[2]], top: wallH + rise, layer: wallLayer, color: wallCol, t });
    }
    strips(a, bb, L + 2 * oL, low ? 0.06 : 0.1, base, nStrip);
    if (low) { // the joists the sheets lie on, their ends showing past both walls; poorer roofs weighed down with tyres, rocks, a tarp
      const jc = col(rng.pick([WOOD.weathered, WOOD.dark, 0x8a7a62]), 0.05, rng), nj = Math.max(3, Math.round(L / 0.6));
      b.t('wood'); for (let k = 0; k <= nj; k++) { const x = -L / 2 + 0.1 + ((L - 0.2) * k) / nj; b.plank([x, wallH - (o - 0.06) * tan - 0.11, S / 2 + o - 0.06], [x, wallH + rise + (o - 0.06) * tan - 0.11, -S / 2 - o + 0.06], 0.07, 0.15, jc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06)); }
      if (rng.chance(0.4)) b.t('wood').plank([-L / 2 - oL, wallH - o * tan - 0.08, S / 2 + o], [L / 2 + oL, wallH - o * tan - 0.08, S / 2 + o], 0.03, 0.18, col(rng.pick([WOOD.weathered, 0x8a5a3a, 0x6a6a5a]), 0.05, rng), 0); // a fascia board
      const yAt = (z) => wallH + (S / 2 - z) * tan + 0.04, junk = c.condition < 0.75 ? rng.int(1, 4) : rng.int(0, 1);
      for (let k = 0; k < junk; k++) {
        const x = rng.range(-L / 2 + 0.5, L / 2 - 0.5), z = rng.range(-S / 2 + 0.5, S / 2 - 0.5), y = yAt(z), t2 = rng.weighted({ tyre: 2, rock: 2, tarp: 1.2, plank: 1 });
        if (t2 === 'tyre') b.t('plain').cyl(x, y + 0.1, z, 0.32, 0.32, 0.18, 10, col(0x2a2826, 0.04, rng));
        else if (t2 === 'rock') b.t('rock').box(x, y + 0.08, z, 0.3, 0.16, 0.25, col(rng.pick([0x8a8072, 0x9a8e7c]), 0.05, rng), rng.range(0, 3));
        else if (t2 === 'tarp') b.t('fabric').box(x, y + 0.03, z, rng.range(1.2, 2.5), 0.03, rng.range(1, 2), col(rng.pick([0x3a4a5a, 0x2a2a2a, 0x5a6a7a, 0x8a7a62]), 0.05, rng), rng.range(-0.3, 0.3));
        else b.t('wood').box(x, y + 0.04, z, 0.2, 0.05, rng.range(1.5, 2.5), col(WOOD.weathered, 0.05, rng), rng.range(-0.5, 0.5));
      }
    }
    b.t(wallLayer);
    for (const sg of [1, -1]) {
      const x = sg * (L / 2 - 0.02);
      b.tri([x, wallH, S / 2], [x, wallH, -S / 2], [x, wallH + rise, -S / 2], wallCol);
    }
    b.box(0, wallH + rise / 2, -S / 2 + t / 2, L, rise, t, wallCol);
  } else if (type === 'hip' || type === 'palapa') {
    const W2 = L + 2 * o, D2 = S + 2 * o;
    const eaveY = wallH - o * tan;
    const ridgeY = eaveY + (D2 / 2) * tan;
    const r = Math.max(0, (W2 - D2) / 2);
    const rc = base;
    const c2 = rc.clone().offsetHSL(0, 0, -0.04), c3 = rc.clone().offsetHSL(0, 0, 0.03);
    b.t(roofLayer);
    b.poly([[-W2 / 2, eaveY, D2 / 2], [W2 / 2, eaveY, D2 / 2], [r, ridgeY, 0], [-r, ridgeY, 0]], rc);
    b.poly([[W2 / 2, eaveY, -D2 / 2], [-W2 / 2, eaveY, -D2 / 2], [-r, ridgeY, 0], [r, ridgeY, 0]], c2);
    b.tri([W2 / 2, eaveY, D2 / 2], [W2 / 2, eaveY, -D2 / 2], [r, ridgeY, 0], c3);
    b.tri([-W2 / 2, eaveY, -D2 / 2], [-W2 / 2, eaveY, D2 / 2], [-r, ridgeY, 0], c3);
    // thickness lip
    b.box(0, eaveY - 0.06, D2 / 2, W2, 0.12, 0.05, c2); b.box(0, eaveY - 0.06, -D2 / 2, W2, 0.12, 0.05, c2);
    b.box(W2 / 2, eaveY - 0.06, 0, 0.05, 0.12, D2, c2); b.box(-W2 / 2, eaveY - 0.06, 0, 0.05, 0.12, D2, c2);
    if (c.vstyle === 'casona') { // exposed rafter tails under the eaves
      const rc = col(WOOD.dark, 0.05, rng);
      b.t('wood');
      // tails follow the slope just under the roof boards; none near the hip corners
      const yIn = wallH - 0.16, yOut = wallH - o * tan - 0.13;
      for (let x = -L / 2 + 0.6; x <= L / 2 - 0.55; x += 0.55) for (const sg of [1, -1]) b.plank([x, yIn, sg * (S / 2 - 0.05)], [x, yOut, sg * (S / 2 + o - 0.08)], 0.1, 0.12, rc);
      for (let z = -S / 2 + 0.6; z <= S / 2 - 0.55; z += 0.55) for (const sg of [1, -1]) b.plank([sg * (L / 2 - 0.05), yIn, z], [sg * (L / 2 + o - 0.08), yOut, z], 0.1, 0.12, rc);
    }
  }
  b.pop();
}

// ---------------------------------------------------------------------------------------------
function buildPorch(b, c, m, p) {
  const { rng } = c;
  const side = p.side || 'front';
  const depth = p.depth || 2.4;
  const len = p.length || m.w * 0.9;
  // on a multi-storey front the porch roof stays under the upper floor (balconies, upstairs windows)
  const fl = m.floors || c.floors0 || 1;
  let h = Math.min(p.height || Math.min(2.6, c.fh * 0.85), fl > 1 ? c.fh - 0.8 : 99);
  // a one-storey porch roof runs up to the wall top, tucked under the eave (no gap between the two roofs); it falls
  // ~15° to the posts, which grow to meet it
  const wallTop = fl > 1 ? null : c.Y(fl) - 0.06, topY = wallTop != null ? Math.max(h + 0.75, wallTop) : h + 0.75;
  if (wallTop != null && !p.height) h = Math.max(h, topY - (depth + 0.35) * 0.27 - 0.38);
  if (side === 'front' && m.main) c.info.porch = { depth, h };
  const mat = p.roof || (c.newMat === 'adobe' || c.newMat === 'stone' ? rng.pick(['thatch', 'latilla', 'corrugated']) : 'corrugated');
  const rotMap = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 };
  const edge = side === 'left' || side === 'right' ? m.w / 2 : m.d / 2;
  b.pushT(m.x, 0, m.z, deg(m.rot || 0) + rotMap[side]);
  const wood = c.livery?.dark ? col(c.livery.dark, 0.02, rng) : col(WOOD.pole, 0.06, rng); // livery: black posts
  const n = Math.max(2, Math.round(len / 2.6) + 1);
  if (mat === 'slab') { // pre-war canopy: thin flat slab on slim steel posts (motel walkway, filling station)
    const sc = c.colors.trim.clone().lerp(col(0xd8d4c8), 0.6);
    b.t('metal'); for (let i = 0; i < n; i++) b.box(-len / 2 + 0.15 + ((len - 0.3) * i) / (n - 1), h / 2 + 0.2, edge + depth - 0.15, 0.1, h, 0.1, col(METAL.dark));
    b.t('concrete').box(0, h + 0.3, edge + depth / 2, len + 0.3, 0.2, depth + 0.1, sc);
    b.t('plain').box(0, h + 0.3, edge + depth + 0.07, len + 0.32, 0.26, 0.06, c.colors.trim);
  } else {
  b.t('bark');
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * i) / (n - 1);
    b.cyl(x, h / 2 + 0.2, edge + depth, 0.09, 0.11, h, 6, wood);
  }
  b.plank([-len / 2 - 0.2, h + 0.25, edge + depth], [len / 2 + 0.2, h + 0.25, edge + depth], 0.18, 0.2, wood);
  const top = [0, topY, edge - 0.05], low = [0, h + 0.38, edge + depth + 0.35];
  b.t(mat === 'thatch' ? 'thatch' : mat === 'latilla' ? 'wood' : mat === 'tile' ? 'roof_tile' : 'corrugated');
  if (mat === 'tile') {
    b.plank(top, low, len + 0.4, 0.14, col(rng.pick(ROOF.tile), 0.05, rng));
  } else if (mat === 'thatch') {
    b.plank(top, low, len + 0.6, 0.22, col(rng.pick(ROOF.thatch), 0.05, rng));
  } else if (mat === 'latilla') {
    const lc = col(0x9c8a6c, 0.05, rng);
    b.plank(top, low, len + 0.4, 0.08, lc);
    for (let x = -len / 2; x <= len / 2; x += 0.8) b.plank([x, top[1] - 0.06, top[2]], [x, low[1] - 0.06, low[2]], 0.12, 0.12, col(WOOD.dark, 0.05, rng));
  } else {
    const nS = Math.max(2, Math.round(len / 1.1));
    for (let i = 0; i < nS; i++) {
      const off = -len / 2 - 0.3 + ((len + 0.6) * (i + 0.5)) / nS;
      b.plank([off, top[1], top[2]], [off, low[1], low[2]], (len + 0.6) / nS + 0.01, 0.06, c.livery?.dark ? col(0x4a4a46, 0.02, rng) : col(rng.pick(ROOF.corrugated), 0.06, rng)); // livery: one painted grey
    }
  }
  }
  // porch floor: packed earth/ tiles step
  b.t(c.newMat === 'adobe' ? 'dirt' : 'slab');
  // floor slab with a skirt that runs into the ground, so a slope never shows a gap under it
  b.box(0, -0.36, edge + depth / 2, len + 0.5, 1.2, depth + 0.3, col(c.newMat === 'adobe' ? 0xb08f6a : 0x9c968a, 0.04, rng));
  b.pop();
}

function buildRubble(b, c, masses) {
  const { rng } = c;
  for (const m of masses) {
    const n = Math.round(c.damage * (m.w + m.d) * 1.2);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const out = rng.range(-1.2, 1.6);
      let x, z;
      if (side % 2 === 0) { x = rng.range(-m.w / 2, m.w / 2); z = (side === 0 ? -1 : 1) * (m.d / 2 + out); }
      else { z = rng.range(-m.d / 2, m.d / 2); x = (side === 1 ? 1 : -1) * (m.w / 2 + out); }
      const s = rng.range(0.25, 0.8);
      const stone = rng.chance(0.75);
      const cc = stone ? c.colors.base.old.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.1) : col(WOOD.weathered, 0.1, rng);
      b.t(stone ? MAT_LAYER[c.baseMat] : 'wood');
      b.blob(m.x + x, s * 0.25, m.z + z, s * rng.range(0.8, 1.6), s * 0.6, s, cc, 'dodec', rng.range(0, 6));
    }
    // rebar stubs
    if (['concrete', 'block'].includes(c.baseMat)) for (let i = 0; i < 6; i++) {
      if (!rng.chance(c.damage)) continue;
      const x = m.x + rng.range(-m.w / 2, m.w / 2), z = m.z + (rng.chance(0.5) ? -1 : 1) * (m.d / 2 - 0.1);
      const y = 0.6 + rng.next() * c.fh * (1 - c.damage);
      b.t('metal').beam([x, y, z], [x + rng.range(-0.3, 0.3), y + rng.range(0.4, 0.9), z + rng.range(-0.2, 0.2)], 0.025, 3, METAL.rust);
    }
  }
}

function buildBellGable(b, c, m) {
  const { rng } = c;
  b.pushT(m.x, 0, m.z, deg(m.rot || 0));
  const H = c.Y(m.floors || 1);
  const ridge = (Math.min(m.w, m.d) / 2) * Math.tan(deg(24));
  const wc = c.colors.neu;
  b.t(c.L.neu);
  const gw = Math.min(m.w * 0.55, 4.2), gh = ridge + 2.6, z = m.d / 2 - 0.2;
  // espadaña: wall with an opening for the bell
  b.box(-gw / 2 + 0.45, H + gh / 2, z, 0.9, gh, 0.4, wc);
  b.box(gw / 2 - 0.45, H + gh / 2, z, 0.9, gh, 0.4, wc);
  b.box(0, H + gh - 0.35, z, gw, 0.7, 0.4, wc);
  b.box(0, H + ridge * 0.5, z, gw, ridge + 0.4, 0.4, wc);
  b.box(0, H + gh + 0.25, z, 0.7, 0.5, 0.4, wc);
  if (c.spec.cult) { // a cult's temple: the sign of the sect where the cross was, an eye in the bell's place, rays painted round it
    const pc = col(c.spec.cultColor ?? rng.pick([0xb83a2a, 0xd8a838, 0xe8e0d0, 0x3a8a6a]), 0.03, rng), y0 = H + gh + 1.25;
    b.t('metal');
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; b.box(Math.cos(a) * 0.62, y0 + Math.sin(a) * 0.62, z, 0.3, 0.09, 0.09, pc, 0, 0, a + Math.PI / 2); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; b.box(Math.cos(a) * 1.0, y0 + Math.sin(a) * 1.0, z, 0.36, 0.06, 0.06, pc, 0, 0, a); }
    b.box(0, y0, z, 0.55, 0.22, 0.08, pc).box(0, y0, z + 0.05, 0.18, 0.18, 0.06, col(0x1a1a1a));
    b.box(0, H + gh + 0.4, z, 0.1, 0.5, 0.1, col(METAL.dark));
    if (c.origin !== 'ruin' && c.origin !== 'stripped') { b.t('plain').box(0, H + ridge + 1.2, z + 0.21, 0.7, 0.35, 0.02, pc).box(0, H + ridge + 1.2, z + 0.22, 0.22, 0.22, 0.02, col(0x1a1a1a)); }
    { const yc = Math.min(H - 1.0, 3.9), rr = 0.7; if (yc - rr - 0.25 > 2.75) for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.t('plain').box(Math.cos(a) * rr, yc + Math.sin(a) * rr, m.d / 2 + 0.02, 0.36, 0.09, 0.01, pc, 0, 0, a); } } // rays on the facade, clear above the door
  } else {
  b.t('wood').box(0, H + gh + 0.85, z, 0.12, 0.7, 0.12, col(WOOD.dark));
  b.box(0, H + gh + 0.95, z, 0.45, 0.1, 0.12, col(WOOD.dark));
  if (c.origin !== 'ruin' && c.origin !== 'stripped') b.t('metal').cone(0, H + ridge + 1.2, z, 0.4, 0.75, 7, col(0x7a6a3a));
  }
  b.pop();
}

function buildExtra(b, c, masses, ex, info) {
  const { rng } = c;
  const name = typeof ex === 'string' ? ex : ex.type;
  const m = (typeof ex === 'object' && ex.mass != null ? masses[ex.mass] : null) || masses.find((mm) => mm.main) || masses[0];
  const H = c.Y(m.floors || c.spec.floors || 1);
  const at = typeof ex === 'object' && ex.at ? ex.at : null;
  b.pushT(m.x, 0, m.z, deg(m.rot || 0));
  const rx = () => (at ? at[0] : rng.range(-m.w / 2 + 1.2, m.w / 2 - 1.2));
  const rz = () => (at ? at[1] : rng.range(-m.d / 2 + 1.2, m.d / 2 - 1.2));
  switch (name) {
    case 'tinaco': { // black rooftop water tank
      const x = rx(), z = rz();
      b.t('metal');
      b.box(x, H + 0.35, z, 1.3, 0.1, 1.3, col(METAL.dark));
      for (const [ox, oz] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) b.box(x + ox, H + 0.15, z + oz, 0.08, 0.5, 0.08, col(METAL.rust));
      b.cyl(x, H + 1.0, z, 0.55, 0.6, 1.2, 9, col(rng.pick([0x2e2e30, 0x3a3a3c, 0xcfc8b8])));
      break;
    }
    case 'solar': {
      b.t('metal');
      const n = (typeof ex === 'object' && ex.count) || 2;
      const x0 = rx(), z0 = rz();
      for (let i = 0; i < n; i++) {
        const x = x0 + (i - (n - 1) / 2) * 1.25;
        const panelY = H + (c.roofType === 'flat' ? 0.9 : 1.1);
        b.box(x, panelY, z0, 1.1, 0.05, 1.7, col(0x2c3a4a), 0, deg(-25), 0);
        b.box(x, panelY - 0.45, z0 + 0.5, 0.06, 0.9, 0.06, col(METAL.steel));
        b.box(x, panelY - 0.2, z0 - 0.5, 0.06, 0.4, 0.06, col(METAL.steel));
      }
      break;
    }
    case 'chimney': { const x = rx(), z = rz(); c.info.emitters.push({ type: 'smoke', p: c.toLocal(x, H + 1.85, z), inhabited: c.inhabited }); b.t(c.L.neu).box(x, H + 0.6, z, 0.6, 2.2, 0.6, c.colors.neu); b.box(x, H + 1.75, z, 0.75, 0.1, 0.75, c.colors.plinth); break; }
    case 'antenna': {
      const x = rx(), z = rz(), h = (typeof ex === 'object' && ex.height) || 6;
      b.t('metal');
      b.beam([x, H, z], [x, H + h, z], 0.05, 4, col(METAL.steel));
      for (let i = 1; i <= 3; i++) b.box(x, H + h * (0.55 + i * 0.13), z, 1.6 - i * 0.35, 0.04, 0.04, col(METAL.steel));
      b.beam([x, H + h * 0.8, z], [x + 1.5, H, z + 1.2], 0.01, 3, col(METAL.dark));
      break;
    }
    case 'stairs': { // exterior stair to the roof, on a wall where it fits
      b.pop();
      buildStairs(b, c, masses, m);
      return;
    }
    case 'ac': { const x = rx(), z = rz(); b.t('metal').box(x, H + 0.4, z, 1.1, 0.8, 0.9, col(rng.pick([0xb8b4a8, 0x9a9890]))); break; }
    case 'dish': {
      const x = rx(), z = rz();
      b.t('metal');
      b.box(x, H + 0.4, z, 0.1, 0.8, 0.1, col(METAL.steel));
      b.cyl(x, H + 1.0, z, 0.7, 0.15, 0.3, 8, col(0xc8c4b8), deg(-50), 0, 0);
      break;
    }
    case 'awning': break; // now a side shade (sideshade.js)
    case 'porch': b.pop(); buildPorch(b, c, m, ex); return;
    case 'water_drums': {
      if (m.main) (c.info.sideUse ||= {}).right = 1;
      b.t('metal');
      for (let i = 0; i < 3; i++) b.cyl(m.w / 2 + 0.6, 0.45, -m.d / 4 + i * 0.7, 0.3, 0.3, 0.9, 8, col(rng.pick([METAL.rust, 0x4a6a7a, 0x8a3a2a]), 0.05, rng));
      break;
    }
    case 'scaffold': { // repair work in progress
      const wc = col(WOOD.fresh, 0.05, rng);
      b.t('wood');
      for (let i = 0; i < 3; i++) {
        const x = -m.w / 3 + (i * m.w) / 3;
        b.beam([x, 0, m.d / 2 + 0.8], [x, H + 0.5, m.d / 2 + 0.8], 0.06, 4, wc);
      }
      b.plank([-m.w / 3 - 0.5, H * 0.55, m.d / 2 + 0.6], [m.w / 3 + 0.5, H * 0.55, m.d / 2 + 0.6], 0.6, 0.06, wc);
      break;
    }
    case 'lean_to': { // scrap lean-to only where it fits
      const lc = col(rng.pick(ROOF.corrugated), 0.08, rng);
      b.t('corrugated');
      const len = Math.min(m.w * 0.6, 4);
      b.plank([0, 2.2, -m.d / 2], [0, 1.6, -m.d / 2 - 2.2], len, 0.06, lc);
      b.beam([-len / 2 + 0.1, 0, -m.d / 2 - 2.1], [-len / 2 + 0.1, 1.6, -m.d / 2 - 2.1], 0.06, 4, col(WOOD.pole));
      b.beam([len / 2 - 0.1, 0, -m.d / 2 - 2.1], [len / 2 - 0.1, 1.6, -m.d / 2 - 2.1], 0.06, 4, col(WOOD.pole));
      break;
    }
  }
  b.pop();
}

// Exterior masonry stair (solid under the treads, side parapet, landing at roof level).
// Tries right, left, back walls; skips party walls and anything that would run into another wing.
// Falls back to a ladder when no wall is long enough.
function buildStairs(b, c, masses, main) {
  const { rng, spec } = c;
  const W = 1.05, rise0 = 0.2;
  const sidesOf = (m) => {
    const cs = [
      { m, side: 'right', len: m.d, wall: (u, o) => [m.w / 2 + o, m.d / 2 - u] },
      { m, side: 'left', len: m.d, wall: (u, o) => [-m.w / 2 - o, m.d / 2 - u] },
      { m, side: 'back', len: m.w, wall: (u, o) => [m.w / 2 - u, -m.d / 2 - o] },
    ].filter((k) => !(m === main && spec.party?.includes(k.side)));
    if (cs.length >= 2 && cs[1].side !== 'back' && rng.chance(0.5)) [cs[0], cs[1]] = [cs[1], cs[0]];
    return cs;
  };
  const cands = [main, ...masses.filter((o) => o !== main)].flatMap(sidesOf);
  for (const tread of [0.27, 0.23]) {
    for (const k of cands) {
      const m = k.m, mr = deg(m.rot || 0);
      const H = c.Y(m.floors || c.spec.floors || 1);
      const n = Math.ceil(H / rise0), rise = H / n;
      const L = n * tread, land = 1.0;
      if (L + land + 0.5 > k.len) continue;
      const toS = (lx, lz) => { const [x, z] = toWorld(lx, lz, mr); return [m.x + x, m.z + z]; };
      const others = masses.filter((o) => o !== m).map((o) => obb(o.x, o.z, o.w + 0.2, o.d + 0.2, deg(o.rot || 0)));
      const a = k.wall(0.3, 0), bq = k.wall(0.3 + L + land, W);
      const [ax, az] = toS(...a), [bx, bz] = toS(...bq);
      const along = L + land;
      const fp = obb((ax + bx) / 2, (az + bz) / 2, k.side === 'back' ? along : W, k.side === 'back' ? W : along, mr);
      if (others.some((o) => obbOverlap(fp, o, 0.1))) continue;
      if (m.main) (c.info.sideUse ||= {})[k.side] = 1;
      const sc = c.colors.neu.clone().offsetHSL(0, 0, -0.03), cap = c.colors.neu.clone().offsetHSL(0, 0, -0.07);
      b.pushT(m.x, 0, m.z, mr);
      b.t(c.L.neu);
      const ry = k.side === 'back' ? Math.PI / 2 : 0;
      for (let i = 0; i < n; i++) {
        const u = 0.3 + (i + 0.5) * tread, top = (i + 1) * rise;
        const [x, z] = k.wall(u, W / 2);
        b.box(x, (top - 0.5) / 2, z, W, top + 0.5, tread + 0.01, sc, ry);
      }
      const [lx, lz] = k.wall(0.3 + L + land / 2, W / 2);
      b.box(lx, (H - 0.5) / 2, lz, W, H + 0.5, land, sc, ry);
      const ox = W + 0.06;
      const [p0x, p0z] = k.wall(0.3, ox), [p1x, p1z] = k.wall(0.3 + L, ox), [p2x, p2z] = k.wall(0.3 + L + land, ox);
      b.plank([p0x, 0.5, p0z], [p1x, H + 0.5, p1z], 0.14, 0.9, cap);
      b.plank([p1x, H + 0.45, p1z], [p2x, H + 0.45, p2z], 0.14, 0.9, cap);
      b.pop();
      { const e = toS(...k.wall(-0.3, W / 2)), tp = toS(...k.wall(0.3 + L + land / 2, -0.9)); climb(c, 'stairs', [e[0], 0, e[1]], [tp[0], H + 0.02, tp[1]]); }
      return;
    }
  }
  const k = cands[0];
  if (!k) return;
  if (k.m.main) (c.info.sideUse ||= {})[k.side] = 1;
  const m = k.m, mr = deg(m.rot || 0), H = c.Y(m.floors || c.spec.floors || 1);
  b.pushT(m.x, 0, m.z, mr);
  b.t('wood');
  const wc = col(WOOD.weathered, 0.05, rng);
  for (const du of [-0.25, 0.25]) { const [x0, z0] = k.wall(1.2 + du, 0.5), [x1, z1] = k.wall(1.2 + du, 0.08); b.plank([x0, 0, z0], [x1, H + 0.9, z1], 0.07, 0.07, wc); }
  for (let y = 0.3; y < H + 0.6; y += 0.32) { const t = y / (H + 0.9); const [x, z] = k.wall(1.2, 0.5 - 0.42 * t); b.box(x, y, z, k.side === 'back' ? 0.55 : 0.05, 0.05, k.side === 'back' ? 0.05 : 0.55, wc); }
  b.pop();
  { const toS = (lx, lz) => { const [x, z] = toWorld(lx, lz, mr); return [m.x + x, m.z + z]; }, e = toS(...k.wall(1.2, 1.1)), tp = toS(...k.wall(1.2, -0.9)); climb(c, 'ladder', [e[0], 0, e[1]], [tp[0], H + 0.02, tp[1]]); }
}

// signs are separate textured meshes
export function attachSigns(group, info) {
  for (const s of info.signs) {
    const m = makeSign(s.text, s.w, s.h, s.style, s.rng, s.opts || {});
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.ry;
    if (s.opts?.tilt) { m.rotation.order = 'YXZ'; m.rotation.x = s.opts.tilt; } // tilt about the sign's own axis (leaning / fallen flat)
    group.add(m);
  }
  for (const mu of info.murals || []) {
    const r = new RNG(`${mu.kind}:${mu.x}:${mu.z}`);
    const tex = muralTexture(mu.kind, mu.palette.map((h) => '#' + new THREE.Color(h).getHexString()), () => r.next());
    const g = new THREE.PlaneGeometry(mu.w, mu.h, Math.ceil(mu.w), Math.ceil(mu.h));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    const m = new THREE.Mesh(g, mapMaterial(tex));
    m.position.set(mu.x, mu.y, mu.z);
    m.rotation.y = mu.ry;
    m.userData.mural = true;
    group.add(m);
  }
}

// Gas-station canopy: columns + thick slab with fascia band. `sag`: {corner: 0-3, drop: m}
function buildCanopy(spec, seed) {
  const rng = new RNG(`${seed}:${spec.id}${spec.v ? ':' + spec.v : ''}`);
  const b = new Builder();
  const [w, d] = spec.size || [16, 10];
  const H = spec.height || 5;
  const th = 0.9;
  const sag = spec.sag || null;
  const fascia = col(spec.fascia || 0xd8d2c4, 0.03, rng);
  const stripe = col(spec.stripe || 0x5f8a5a, 0.05, rng);
  const stripe2 = col(spec.stripe2 || 0xa8473a, 0.05, rng);
  const under = col(0xb8b2a6, 0.03, rng);
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const drop = corners.map((_, i) => (sag && sag.corner === i ? sag.drop ?? 1.8 : sag && (sag.corner + 1) % 4 === i || sag && (sag.corner + 3) % 4 === i ? (sag.drop ?? 1.8) * 0.35 : 0));
  const top = corners.map(([x, z], i) => [x, H + th - drop[i], z]);
  const bot = corners.map(([x, z], i) => [x, H - drop[i], z]);
  b.setCenter(0, H, 0);
  b.t('slab').poly(top, fascia.clone().offsetHSL(0, 0, -0.08));
  b.t('concrete').poly(bot, under);
  b.t('plaster');
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    b.quad(bot[i], bot[j], top[j], top[i], fascia);
    // stripes on the fascia
    const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    const out = (p) => { const L = Math.hypot(p[0], p[2]) || 1; return [p[0] * (1 + 0.02 / L * 1), p[1], p[2] * (1 + 0.02 / L)]; };
    const s0a = lerp3(bot[i], top[i], 0.18), s0b = lerp3(bot[j], top[j], 0.18), s1a = lerp3(bot[i], top[i], 0.38), s1b = lerp3(bot[j], top[j], 0.38);
    b.quad(out(s0a), out(s0b), out(s1b), out(s1a), stripe);
    const s2a = lerp3(bot[i], top[i], 0.42), s2b = lerp3(bot[j], top[j], 0.42), s3a = lerp3(bot[i], top[i], 0.52), s3b = lerp3(bot[j], top[j], 0.52);
    b.quad(out(s2a), out(s2b), out(s3b), out(s3a), stripe2);
  }
  // columns
  const nx = Math.max(2, Math.round(w / 8) + 1), nz = d > 9 ? 2 : 1;
  const cc = col(0xc8c2b4, 0.03, rng);
  b.t('concrete');
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = -w / 2 + 1.4 + ((w - 2.8) * i) / (nx - 1), z = nz === 1 ? 0 : -d / 2 + 2 + ((d - 4) * k);
    // height under the (possibly sagging) slab: bilinear of corner drops
    const u = (x + w / 2) / w, v = (z + d / 2) / d;
    const dr = drop[0] * (1 - u) * (1 - v) + drop[1] * u * (1 - v) + drop[2] * u * v + drop[3] * (1 - u) * v;
    if (sag && dr > (sag.drop ?? 1.8) * 0.45) { // failed column: stub + fallen piece
      b.box(x, 0.6, z, 0.55, 1.2, 0.55, cc);
      b.box(x + 1.2, 0.3, z + 0.4, 0.5, 0.5, 2.6, cc, 0.7);
      continue;
    }
    b.box(x, (H - dr) / 2, z, 0.55, H - dr, 0.55, cc);
  }
  // pump islands
  for (let i = 0; i < nx - 1; i++) {
    const x = -w / 2 + 1.4 + ((w - 2.8) * (i + 0.5)) / (nx - 1);
    b.box(x, 0.12, 0, 1.2, 0.24, Math.min(5, d * 0.5), col(0xa8a296, 0.03, rng));
  }
  b.box(0, 0.04, 0, w + 4, 0.08, d + 4, col(0x9c968a, 0.04, rng)); // forecourt slab
  const info = { outlines: [{ x: 0, z: 0, w, d, rot: 0 }], signs: [], height: H + th, lights: [], emitters: [], murals: [], finish: { tier: 'none' } };
  if (spec.sign) {
    const s = typeof spec.sign === 'string' ? { text: spec.sign } : spec.sign;
    info.signs.push({ text: s.text, x: 0, y: H + th * 0.72 - (drop[2] + drop[3]) / 2, z: d / 2 + 0.05, ry: 0, w: Math.min(w * 0.5, s.text.length * 0.55), h: 0.5, style: s.style || 'prewar', rng });
  }
  return { geoms: b.build({ maxEdge: 3.5 }), info };
}

// ---------------------------------------------------------------------------------------------
// pre-war streamline: rounded corners (cylinders where the walls stop short) and horizontal speed lines
function retroCorners(b, c, sides, w, d, wallH, parapet, Rc, t) {
  // a smooth curved wall of thickness t (not a solid drum, which showed on the roof)
  b.t(c.L.old);
  RCORN.forEach(([sx, sz], k) => {
    const R = Rc[k]; if (!R) return;
    const top = Math.min(sides[k].topFn(sides[k].u1 - 0.05), sides[(k + 1) % 4].topFn(sides[(k + 1) % 4].u0 + 0.05));
    if (top < 0.5) return;
    const O = cornerArc(sx, sz, k, w, d, R, R), I = cornerArc(sx, sz, k, w, d, R, R - t);
    roundWall(b, O, 0.25, top, c.colors.old, false);
    roundWall(b, I, 0.25, top, c.colors.old, false, true);
    for (let i = 0; i < O.length - 1; i++) b.quad([O[i].p[0], top, O[i].p[1]], [O[i + 1].p[0], top, O[i + 1].p[1]], [I[i + 1].p[0], top, I[i + 1].p[1]], [I[i].p[0], top, I[i].p[1]], c.colors.old);
  });
}
function retroBands(b, c, sides, wallH, R) {
  const { rng } = c;
  if (!rng.chance(0.7)) return;
  const bc = c.colors.old.clone().offsetHSL(0, -0.05, rng.chance(0.5) ? 0.1 : -0.12);
  const ys = rng.chance(0.5) ? [wallH - 0.35, wallH - 0.55, wallH - 0.75] : [0.55, 0.75];
  b.t('plaster');
  for (const y of ys) {
    for (const s of sides) {
      if (c.spec.party?.includes(s.name) || s.topFn((s.u0 + s.u1) / 2) < y + 0.1) continue;
      const um = (s.u0 + s.u1) / 2, x = s.ax + s.dx * um + s.nx * 0.025, z = s.az + s.dz * um + s.nz * 0.025;
      b.box(x, y, z, s.u1 - s.u0, 0.06, 0.05, bc, s.ry);
    }
    if (R) { const w = Math.abs(sides[0].L), d = Math.abs(sides[1].L); RCORN.forEach(([sx, sz], k) => { if (R[k]) roundWall(b, cornerArc(sx, sz, k, w, d, R[k], R[k] + 0.025), y - 0.03, y + 0.03, bc, false); }); }
  }
}
// vernacular: corner buttresses leaning on the walls
function vernButtresses(b, c, sides, wallH) {
  const { rng } = c;
  if (!rng.chance(0.6)) return;
  const bh = Math.min(wallH * 0.7, 2.6), col0 = c.colors.old.clone().offsetHSL(0, 0, -0.03);
  b.t(c.L.old);
  for (const s of sides) {
    if (s.name !== 'front' && s.name !== 'back') continue;
    if (c.spec.party?.includes('left') && c.spec.party?.includes('right')) continue;
    for (const u of [s.u0 + 0.3, s.u1 - 0.3]) {
      if (s.openings.some((o) => o.y0 < bh && u + 0.4 > o.u0 && u - 0.4 < o.u1)) continue;
      adobeButtress(b, s, u, bh, 0.8, 1.0, col0);
    }
  }
}
// hand-plastered earth buttress: rounded sides and nose, deep at the foot, thinning upward into the wall,
// a soft dome where it dies into the wall
function adobeButtress(b, s, u, h, w, d0, color) {
  const NY = 10, NA = 12, pos = [], idx = [];
  const tx = s.dx, tz = s.dz, nx = s.nx, nz = s.nz, ox = s.ax + tx * u, oz = s.az + tz * u;
  for (let i = 0; i <= NY; i++) {
    const t = i / NY, y = -0.1 + t * h, dep = 0.06 + (d0 - 0.06) * Math.pow(1 - t, 1.15), hw = (w / 2) * (1 - 0.3 * t) * (i === NY ? 0.55 : 1);
    const flare = 1 + 0.25 * Math.pow(Math.max(0, 1 - t * 5), 2); // spreads a little at the ground
    for (let k = 0; k <= NA; k++) { // half super-ellipse: back (in the wall) to the nose
      const a = -Math.PI / 2 + (k / NA) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      const ex = Math.sign(ca) * Math.pow(Math.abs(ca), 0.6), ez = Math.sign(sa) * Math.pow(Math.abs(sa), 0.6);
      const out = -0.04 + (ex * 0.5 + 0.5) * dep * flare, along = ez * hw * flare;
      pos.push(ox + tx * along + nx * out, i === NY ? y + 0.08 : y, oz + tz * along + nz * out);
    }
  }
  for (let i = 0; i < NY; i++) for (let k = 0; k < NA; k++) { const a = i * (NA + 1) + k, q = a + NA + 1; idx.push(a, a + 1, q, a + 1, q + 1, q); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  addOutward(b, g, color, ox, oz, nx, nz);
}
// smooth battered base along each wall run: thick at the ground, curving into the wall at ~1.3 m;
// the runs break at doors and taper softly at the ends (no blocks, no gaps)
function adobeBase(b, c, sides) {
  const band = c.whole && c.finish?.band && !c.finish.wainscot ? col(c.finish.band.hex, 0.03, c.rng) : null;
  const color = band || c.colors.old.clone().offsetHSL(0, 0, -0.025), H = 1.25, B = 0.26;
  b.t(c.L.old);
  for (const s of sides) {
    if (c.spec.party?.includes(s.name) || s.u1 - s.u0 < 0.8) continue;
    const doors = s.openings.filter((o) => o.y0 < 0.4).map((o) => [o.u0 - 0.08, o.u1 + 0.08]).sort((p, q) => p[0] - q[0]);
    // runs go round the corners (they meet the next wall's base); at doors they taper away
    const c0 = -(s.si % 2 === 1 ? 0 : 0.02), runs = []; let u = c0 - B; let soft0 = false;
    for (const [a, z] of doors) { if (a - u > 0.6) runs.push([u, a, soft0, true]); u = Math.max(u, z); soft0 = true; }
    if (s.L + B - u > 0.6) runs.push([u, s.L + B, soft0, false]);
    for (const [u0, u1, s0, s1] of runs) {
      const NU = Math.max(4, Math.ceil((u1 - u0) / 0.3)), NY = 7, pos = [], idx = [];
      for (let i = 0; i <= NU; i++) {
        const uu = u0 + ((u1 - u0) * i) / NU, e = Math.min(s0 ? uu - u0 : 9, s1 ? u1 - uu : 9), k = Math.min(1, e / 0.35), taper = k * k * (3 - 2 * k);
        for (let j = 0; j <= NY; j++) {
          const t = j / NY, y = -0.15 + t * (H + 0.15), out = -0.02 + B * taper * Math.pow(1 - t, 1.7) + 0.03 * taper * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t);
          pos.push(s.ax + s.dx * uu + s.nx * out, y, s.az + s.dz * uu + s.nz * out);
        }
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NY; j++) { const a = i * (NY + 1) + j, q = a + NY + 1; idx.push(a, q, a + 1, a + 1, q, q + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      addOutward(b, g, color, s.ax + s.dx * (u0 + u1) / 2, s.az + s.dz * (u0 + u1) / 2, s.nx, s.nz);
    }
  }
}
// smooth normals, flipped (with the winding) to face away from the wall
function addOutward(b, g, color, ox, oz, nx, nz) {
  g.computeVertexNormals();
  const n = g.attributes.normal, p = g.attributes.position;
  let dot = 0; for (let i = 0; i < n.count; i++) dot += n.getX(i) * nx + n.getZ(i) * nz;
  if (dot < 0) { const I = g.index.array; for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } g.computeVertexNormals(); }
  b.sm().addGeom(g.toNonIndexed(), new THREE.Matrix4(), color).sm(false);
}
// vernacular odds and ends: wind-catcher, cistern / rain barrels, scrap patches, bottle panel
function vernExtras(b, c, masses) {
  const { rng } = c;
  const m = masses.find((mm) => mm.main) || masses[0];
  const H = c.Y(m.floors || c.spec.floors || 1), mr = deg(m.rot || 0);
  b.pushT(m.x, 0, m.z, mr);
  if (m.w * m.d > 90 && c.roofType === 'flat' && rng.chance(0.3)) { // wind-catcher tower
    const tx = (rng.chance(0.5) ? -1 : 1) * (m.w / 2 - 1.2), tz = -m.d / 2 + 1.2, th = 2.0;
    b.t(c.L.neu).box(tx, H + th / 2, tz, 1.3, th, 1.3, c.colors.neu);
    b.t('plain'); for (const [ox, oz, rw] of [[0, 0.66, 0], [0, -0.66, 0], [0.66, 0, 1], [-0.66, 0, 1]]) b.box(tx + ox, H + th - 0.45, tz + oz, rw ? 0.03 : 0.7, 0.55, rw ? 0.7 : 0.03, col(0x1c1a18));
    b.t('wood').box(tx, H + th + 0.06, tz, 1.5, 0.12, 1.5, col(WOOD.dark, 0.05, rng));
  }
  if (c.inhabited && rng.chance(0.45)) { // (was: a cistern or rain barrels by the wall — water now belongs to the yard vignettes; the rolls stay so nothing else shifts)
    rng.chance(0.5); rng.range(-m.d / 4, m.d / 4); if (!rng.chance(0.4)) { const n = rng.int(2, 3); for (let i = 0; i < n; i++) { rng.pick([0]); rng.next(); rng.next(); rng.next(); } }
  }
  if (c.condition < 0.85 && rng.chance(0.35)) { // scrap patch on a side wall
    const sd0 = rng.chance(0.5) ? 1 : -1, sd = c.shadeSide === 'right' ? -1 : c.shadeSide === 'left' ? 1 : sd0; (c.info.sideUse ||= {})[sd > 0 ? 'right' : 'left'] = 1; const z = rng.range(-m.d / 4, m.d / 4);
    b.t('corrugated').box(sd * (m.w / 2 + 0.03), rng.range(0.9, 1.6), z, 0.03, rng.range(0.8, 1.3), rng.range(0.8, 1.5), col(rng.pick([...ROOF.corrugated, METAL.rust]), 0.06, rng));
  }
  if (rng.chance(0.1)) { // bottle panel set in the wall: green and brown ends
    const sd0 = rng.chance(0.5) ? 1 : -1, sd = c.shadeSide === 'right' ? -1 : c.shadeSide === 'left' ? 1 : sd0; (c.info.sideUse ||= {})[sd > 0 ? 'right' : 'left'] = 1; const z0 = rng.range(-m.d / 4, m.d / 4);
    b.t('plain');
    for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) b.cyl(sd * (m.w / 2 + 0.01), 1.1 + k * 0.16, z0 + (i - 2.5) * 0.16 + (k % 2) * 0.08, 0.045, 0.045, 0.04, 6, col(rng.pick([0x3a6a3a, 0x5a3a1e, 0x2a5a4a, 0x7a6a2a]), 0.05, rng), 0, 0, Math.PI / 2);
  }
  b.pop();
}

// ---------------------------------------------------------------------------------------------
// Shack / salvaged hut: posts at the corners, walls patched from whatever was found (tin, plywood,
// pallets, a car door, tarp, a course of blocks), a sagging tin lean-to roof held down with tyres and
// rocks, a crooked door, a stovepipe.
const SCRAP_PANELS = { tin: 4, ply: 3, pallet: 2, tarp: 1.2, cardoor: 0.6, blocks: 1, sign: 0.4 };
// salvaged sheet for shacks: dull galvanised grey and dark weathered rust (matches the scrap walls)
const SCRAP_SHEET = [0x7c7a74, 0x8a8780, 0x6f6c66, 0x6a5a4c, 0x5e4c40, 0x76624e, 0x7a6a5a, 0x6f6c66, 0x7c7a74, 0x6e665c];
function buildShack(spec, seed, opts = {}) {
  const rng = new RNG(`${seed}:${spec.id}${spec.v ? ':' + spec.v : ''}`);
  const b = new Builder();
  const [w, d] = spec.size || [3.6, 2.8];
  const cond = spec.condition ?? 0.6, ruin = cond < 0.3;
  const hF = rng.range(2.1, 2.4), hB = hF - rng.range(0.35, 0.6); // front higher: roof sheds to the back
  const info = { outlines: [{ x: 0, z: 0, w, d, rot: 0 }], signs: [], height: hF + 0.5, lights: [], emitters: [], murals: [], finish: { tier: 'none' }, frontDoor: null, openings: [], walls: {} };
  const H = (z) => hB + ((z + d / 2) / d) * (hF - hB);
  const post = col(WOOD.pole, 0.06, rng);
  b.t('wood');
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) b.box(x, H(z) / 2, z, 0.1, H(z) + 0.1, 0.1, post, 0, rng.range(-0.04, 0.04), rng.range(-0.04, 0.04));
  // walls: run panels along each side
  const sides = [
    { ax: -w / 2, az: d / 2, dx: 1, dz: 0, L: w, name: 'front' }, { ax: w / 2, az: d / 2, dx: 0, dz: -1, L: d, name: 'right' },
    { ax: w / 2, az: -d / 2, dx: -1, dz: 0, L: w, name: 'back' }, { ax: -w / 2, az: -d / 2, dx: 0, dz: 1, L: d, name: 'left' },
  ];
  const doorU = rng.range(0.5, Math.max(0.6, w - 1.3)), doorW = 0.8;
  for (const s of sides) {
    const ry2 = Math.atan2(s.dx, s.dz) + Math.PI / 2, nx = s.dz, nz = -s.dx; // outward normal
    let u = 0;
    while (u < s.L - 0.05) {
      const pw = Math.min(s.L - u, rng.range(0.55, 1.25));
      const um = u + pw / 2, x = s.ax + s.dx * um, z = s.az + s.dz * um, top = Math.min(H(s.az + s.dz * u), H(s.az + s.dz * (u + pw))) - 0.02;
      const isDoor = s.name === 'front' && um > doorU && um < doorU + doorW;
      if (isDoor) { u += pw; continue; }
      if (ruin && rng.chance(0.4)) { u += pw; continue; }
      const kind = rng.weighted(SCRAP_PANELS), ht = top * (ruin ? rng.range(0.4, 1) : rng.range(0.92, 1));
      const ang = ry2 + rng.range(-0.03, 0.03), tilt = rng.range(-0.03, 0.03);
      if (kind === 'blocks') {
        b.t('block').box(x, 0.3, z, pw + 0.02, 0.6, 0.2, col(rng.pick(MAT.block.wall), 0.05, rng), ang);
        b.t('corrugated').box(x + nx * 0.02, 0.6 + (ht - 0.6) / 2, z + nz * 0.02, pw + 0.02, ht - 0.6, 0.03, col(SCRAP_SHEET[Math.floor(rng.next() * SCRAP_SHEET.length)], 0.035, rng), ang, tilt);
      } else if (kind === 'tin') b.t('corrugated').box(x, ht / 2, z, pw + 0.04, ht, 0.03, col(SCRAP_SHEET[Math.floor(rng.next() * SCRAP_SHEET.length)], 0.035, rng), ang, tilt);
      else if (kind === 'ply') b.t('wood').box(x, ht / 2, z, pw + 0.02, ht, 0.03, col(rng.pick([0x8e806a, 0x847660, 0x7a6e5e, 0x8a7c66]), 0.04, rng), ang, tilt);
      else if (kind === 'pallet') { b.t('fence_wood'); const pc = col(WOOD.fresh, 0.08, rng); for (let k = 0; k < Math.round(ht / 0.16); k++) b.box(x, 0.08 + k * 0.16, z, pw, 0.1, 0.03, pc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.08), ang); b.box(x, ht / 2, z - nz * 0.03, 0.08, ht, 0.06, pc, ang); }
      else if (kind === 'tarp') b.t('fabric').box(x, ht / 2, z, pw + 0.06, ht, 0.015, col(rng.pick([0x5e646a, 0x5c6266, 0x7e6a56, 0x66685a, 0x7e7c74]), 0.04, rng), ang, tilt + 0.02);
      else if (kind === 'cardoor') { b.t('metal').box(x, 0.9, z, Math.min(pw, 1.1), 1.0, 0.05, col(rng.pick([0x6e5048, 0x5e6662, 0x948e80, 0x5a5e62]), 0.04, rng), ang); b.t('plain').box(x + nx * 0.02, 1.25, z + nz * 0.02, Math.min(pw, 1.1) * 0.7, 0.32, 0.01, col(0x2a3034), ang); b.t('corrugated').box(x, (ht + 1.4) / 2, z, pw + 0.02, ht - 1.4, 0.03, col(SCRAP_SHEET[Math.floor(rng.next() * SCRAP_SHEET.length)], 0.035, rng), ang); b.box(x, 0.2, z, pw, 0.4, 0.03, col(METAL.rust), ang); }
      else { b.t('wood').box(x, ht / 2, z, pw, ht, 0.03, col(0xa8a08c, 0.05, rng), ang, tilt); } // an old painted board
      u += pw;
    }
    info.walls[s.name] = { x: s.ax + s.dx * s.L / 2, z: s.az + s.dz * s.L / 2, nx, nz, tx: s.dx, tz: s.dz, L: s.L, wallH: H(0), top: H(s.az + s.dz * s.L / 2), party: false };
  }
  // the door: planks, a bit crooked, often ajar
  const dx0 = -w / 2 + doorU + doorW / 2, dh = Math.min(hF - 0.15, 1.9), ajar = rng.chance(0.4);
  b.t('wood');
  const dc = col(rng.pick([WOOD.weathered, WOOD.dark, 0x6a4a3a]), 0.06, rng);
  if (ajar) b.box(-w / 2 + doorU + Math.cos(0.9) * doorW / 2, dh / 2, d / 2 - Math.sin(0.9) * doorW / 2, doorW, dh, 0.04, dc, -0.9);
  else b.box(dx0, dh / 2 + 0.03, d / 2 + 0.03, doorW - 0.04, dh, 0.04, dc, 0, 0, rng.range(-0.04, 0.04));
  info.frontDoor = { x: dx0, y: dh, z: d / 2 + 0.02, nx: 0, nz: 1, tx: 1, tz: 0, w: doorW, sill: 0 };
  info.openings.push({ x: dx0, z: d / 2, nx: 0, nz: 1, tx: 1, tz: 0, w: doorW, y0: 0, y1: dh, type: 'door', floor: 0, side: 'front', main: true, wallH: hF, top: hF });
  // roof: mismatched tin sheets on purlins, overhanging, sagging a little, weighted down
  if (!ruin || rng.chance(0.4)) {
    const ov = 0.35, n = Math.max(2, Math.round((w + 2 * ov) / 0.9));
    b.t('wood'); for (const z of [-d / 2, 0, d / 2]) b.box(0, H(z) + 0.05, z, w + 0.4, 0.08, 0.08, post);
    b.t('corrugated');
    for (let k = 0; k < n; k++) {
      if (ruin && rng.chance(0.5)) continue;
      const x = -w / 2 - ov + ((k + 0.5) * (w + 2 * ov)) / n;
      const a = [x, hB + 0.12 - ov * 0.15, -d / 2 - ov], c2 = [x, hF + 0.12 + ov * 0.15, d / 2 + ov];
      b.plank(a, c2, (w + 2 * ov) / n + 0.06, 0.03, col(SCRAP_SHEET[Math.floor(rng.next() * SCRAP_SHEET.length)], 0.035, rng), rng.range(-0.03, 0.03));
    }
    // tyres and rocks holding it down
    for (let k = 0; k < rng.int(2, 4); k++) { const x = rng.range(-w / 2, w / 2), z = rng.range(-d / 2, d / 2); if (rng.chance(0.6)) b.t('plain').cyl(x, H(z) + 0.25, z, 0.32, 0.32, 0.2, 10, col(0x262626)); else b.t('rock').blob(x, H(z) + 0.22, z, 0.25, 0.18, 0.22, col(0x8a8070, 0.08, rng), 'dodec'); }
  }
  // stovepipe
  if (!ruin && rng.chance(0.7)) {
    const x = rng.range(-w / 2 + 0.4, w / 2 - 0.4), z = -d / 2 + 0.4;
    b.t('metal').cyl(x, H(z) + 0.55, z, 0.07, 0.07, 1.1, 7, col(METAL.dark));
    b.box(x, H(z) + 1.12, z, 0.22, 0.04, 0.22, col(METAL.rust));
    info.emitters.push({ type: 'smoke', p: [x, H(z) + 1.15, z], inhabited: true });
  }
  // a tarp awning over the door, a window hole with plastic
  if (!ruin && rng.chance(0.5)) { b.t('fabric').plank([dx0, hF - 0.05, d / 2 + 0.05], [dx0, hF - 0.5, d / 2 + 1.4], 1.8, 0.02, col(rng.pick([0x5e646a, 0x7e6a56, 0x7a7a6a]), 0.04, rng)); b.t('wood'); for (const sx of [-0.85, 0.85]) b.box(dx0 + sx, (hF - 0.5) / 2, d / 2 + 1.4, 0.06, hF - 0.5, 0.06, post); }
  if (rng.chance(0.6)) { const z = rng.range(-d / 4, d / 4), sd = rng.chance(0.5) ? 1 : -1; b.t('plain').box(sd * (w / 2 + 0.02), 1.35, z, 0.01, 0.4, 0.5, col(0xc8ccc0, 0.05, rng)); }
  return { geoms: b.build({ maxEdge: 3.2 }), info };
}

// ---------------------------------------------------------------------------------------------
// shared shape helpers for the vernacular styles
const RCORN = [[1, -1], [1, 1], [-1, 1], [-1, -1]], SIDE_N = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const TORI = new Map();
// is this corner of mass m (local x, z) inside / against another part of the building?
function cornerJoined(c, m, x, z) {
  const r = deg(m.rot || 0), [px, pz] = toWorld(x, z, r), X = m.x + px, Z = m.z + pz;
  return (c.masses || []).some((q) => { if (q === m) return false; const [lx, lz] = toWorld(X - q.x, Z - q.z, -deg(q.rot || 0)); return Math.abs(lx) <= q.w / 2 + 0.35 && Math.abs(lz) <= q.d / 2 + 0.35; });
}
// quarter arc round corner k at radius rad (corner centre set by radius R): [{ p: [x, z], n: [nx, nz] }]
function cornerArc(sx, sz, k, w, d, R, rad, seg = 12) {
  const cx = sx * (w / 2 - R), cz = sz * (d / 2 - R), a0 = -Math.PI / 2 + (k * Math.PI) / 2;
  return Array.from({ length: seg + 1 }, (_, i) => { const a = a0 + (i / seg) * (Math.PI / 2), ca = Math.cos(a), sa = Math.sin(a); return { p: [cx + ca * rad, cz + sa * rad], n: [ca, sa] }; });
}
// outline of a w × d box with per-corner radii (sharp corners appear twice: one normal per side)
function roundOutline(w, d, Rc) {
  const V = [];
  RCORN.forEach(([sx, sz], k) => {
    const r = Math.min(Rc[k] || 0, w / 2 - 0.01, d / 2 - 0.01);
    if (r > 0.02) V.push(...cornerArc(sx, sz, k, w, d, r, r));
    else { const p = [(sx * w) / 2, (sz * d) / 2]; V.push({ p, n: SIDE_N[k] }, { p, n: SIDE_N[(k + 1) % 4] }); }
  });
  return V;
}
// smooth vertical wall along outline points (outward normals; inward = seen from inside)
function roundWall(b, V, y0, y1, color, closed = true, inward = false) {
  const n = closed ? V.length : V.length - 1;
  for (let i = 0; i < n; i++) {
    const A = V[i], B = V[(i + 1) % V.length];
    if (Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1]) < 1e-4) continue;
    const a0 = [A.p[0], y0, A.p[1]], a1 = [A.p[0], y1, A.p[1]], b0 = [B.p[0], y0, B.p[1]], b1 = [B.p[0], y1, B.p[1]];
    const na = [A.n[0], 0, A.n[1]], nb = [B.n[0], 0, B.n[1]];
    if (!inward) b.quadN(b0, a0, a1, b1, nb, na, na, nb, color);
    else { const ia = [-na[0], 0, -na[2]], ib = [-nb[0], 0, -nb[2]]; b.quadN(a0, b0, b1, a1, ia, ib, ib, ia, color); }
  }
}
// rounded box (R: one radius or four, per corner), smooth sides
function roundBox(b, x, y, z, w, h, d, R, color, bottom = false) {
  const Rc = Array.isArray(R) ? R : [R, R, R, R];
  const V = roundOutline(w, d, Rc).map((v) => ({ p: [x + v.p[0], z + v.p[1]], n: v.n }));
  roundWall(b, V, y - h / 2, y + h / 2, color);
  const U = V.filter((v, i) => i === 0 || Math.hypot(v.p[0] - V[i - 1].p[0], v.p[1] - V[i - 1].p[1]) > 1e-4);
  const up = [0, 1, 0], dn = [0, -1, 0], yt = y + h / 2, yb = y - h / 2;
  for (let i = 1; i < U.length - 1; i++) {
    b.triN([U[0].p[0], yt, U[0].p[1]], [U[i + 1].p[0], yt, U[i + 1].p[1]], [U[i].p[0], yt, U[i].p[1]], up, up, up, color);
    if (bottom) b.triN([U[0].p[0], yb, U[0].p[1]], [U[i].p[0], yb, U[i].p[1]], [U[i + 1].p[0], yb, U[i + 1].p[1]], dn, dn, dn, color);
  }
}
// pill: rounded corner towers come from retroCorners; add a bullnose along the parapet top
function pillTop(b, c, sides, w, d, top, R, t) {
  const r = t * 0.55, cc = c.colors.old.clone().offsetHSL(0, 0, 0.02);
  b.t(c.L.old);
  for (const s of sides) {
    if (c.spec.party?.includes(s.name) || s.u1 - s.u0 < 0.2) continue;
    const um = (s.u0 + s.u1) / 2, x = s.ax + s.dx * um - s.nx * t / 2, z = s.az + s.dz * um - s.nz * t / 2;
    b.sm().cyl(x, top, z, r, r, s.u1 - s.u0 + 0.02, 12, cc, 0, s.ry, Math.PI / 2).sm(false);
  }
  if (R) RCORN.forEach(([sx, sz], k) => { // a smooth quarter torus round each rounded corner
    const Rk = R[k]; if (!Rk) return;
    const cx = sx * (w / 2 - Rk), cz = sz * (d / 2 - Rk), rr = Rk - t / 2, a0 = -Math.PI / 2 + (k * Math.PI) / 2;
    const key = `qt${rr.toFixed(2)}_${r.toFixed(3)}`;
    let g = TORI.get(key); if (!g) { g = new THREE.TorusGeometry(rr, r, 10, 16, Math.PI / 2).toNonIndexed(); TORI.set(key, g); }
    b.sm().addGeom(g, new THREE.Matrix4().compose(new THREE.Vector3(cx, top, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -a0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)), cc).sm(false);
  });
}
// casona: base course of stone, string course between floors, pilasters at the corners
function casonaBands(b, c, sides, wallH, floors, fh) {
  const { rng } = c;
  const stoneC = col(rng.pick(MAT.stone.wall), 0.04, rng), band = c.colors.old.clone().offsetHSL(0, -0.03, 0.06);
  for (const s of sides) {
    if (c.spec.party?.includes(s.name)) continue;
    const L = s.u1 - s.u0, um = (s.u0 + s.u1) / 2;
    const at = (out) => [s.ax + s.dx * um + s.nx * out, s.az + s.dz * um + s.nz * out];
    // base course, cut at the ground-floor doors
    b.t(rng.chance(0.5) ? 'stone' : 'brick');
    let u = s.u0;
    const cuts = s.openings.filter((o) => o.floor === 0 && o.y0 < 1.0).sort((p, q) => p.u0 - q.u0);
    for (const o of [...cuts, { u0: s.u1, u1: s.u1 }]) {
      if (o.u0 - u > 0.1) { const m2 = (u + o.u0) / 2, x = s.ax + s.dx * m2 + s.nx * 0.03, z = s.az + s.dz * m2 + s.nz * 0.03; b.box(x, 0.25 + 0.42, z, o.u0 - u, 0.84, 0.06, stoneC, s.ry); }
      u = Math.max(u, o.u1);
    }
    b.t('plaster');
    const course = (y, h) => { // a band across the wall, broken wherever an opening (a tall door, an arch) runs through it
      const hit = s.openings.filter((o) => o.y1 > y - h / 2 - 0.02 && o.y0 < y + h / 2 + 0.02).sort((p, q) => p.u0 - q.u0); let u = s.u0 - 0.05;
      for (const o of [...hit.map((o) => ({ u0: o.u0 - 0.06, u1: o.u1 + 0.06 })), { u0: s.u1 + 0.05, u1: s.u1 + 0.05 }]) { if (o.u0 - u > 0.08) { const m2 = (u + o.u0) / 2; b.box(s.ax + s.dx * m2 + s.nx * 0.05, y, s.az + s.dz * m2 + s.nz * 0.05, o.u0 - u, h, 0.1, band, s.ry); } u = Math.max(u, o.u1); }
    };
    for (let f = 1; f < floors; f++) course(c.Y(f) - 0.05, 0.18);
    course(wallH - 0.14, 0.14);
    for (const uu of [s.u0 + 0.22, s.u1 - 0.22]) { const x = s.ax + s.dx * uu + s.nx * 0.04, z = s.az + s.dz * uu + s.nz * 0.04; b.box(x, wallH / 2 + 0.1, z, 0.44, wallH - 0.2, 0.08, band, s.ry); }
  }
}
// round (porthole) and arched openings: the square cut is filled back to a circle / arch with full-depth
// rows of wall, then framed with a ring of trim
function shapeOpening(b, s, c, o, y1, place, t, fill, frameCol) {
  const wallC = c.colors.old, layer = c.L.old, um = (o.u0 + o.u1) / 2, r = (o.u1 - o.u0) / 2;
  const yc = o.shape === 'round' ? (o.y0 + y1) / 2 : y1 - r;
  const y0f = o.shape === 'round' ? o.y0 : yc;
  const rows = 9;
  for (let k = 0; k < rows; k++) {
    const ya = y0f + ((y1 - y0f) * k) / rows, yb = y0f + ((y1 - y0f) * (k + 1)) / rows, ym = (ya + yb) / 2;
    const hw = Math.sqrt(Math.max(0, r * r - (ym - yc) ** 2));
    if (r - hw > 0.01) { place(o.u0 - 0.005, um - hw, ya, yb, 0, t, wallC, layer); place(um + hw, o.u1 + 0.005, ya, yb, 0, t, wallC, layer); }
  }
  if (fill === 'open') return;
  // ring frame (trim) proud of the wall
  b.t(c.vstyle === 'casona' ? 'stone' : 'wood');
  const ringC = c.vstyle === 'casona' ? col(0xc8bca8, 0.03, c.rng) : frameCol, n = o.shape === 'round' ? 16 : 10, a1 = o.shape === 'round' ? Math.PI * 2 : Math.PI;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * a1, uu = um + Math.cos(a) * (r + 0.06), yy = yc + Math.sin(a) * (r + 0.06), seg = (a1 / n) * (r + 0.06) + 0.03;
    const x = s.ax + s.dx * uu + s.nx * 0.03, z = s.az + s.dz * uu + s.nz * 0.03;
    b.box(x, yy, z, seg, 0.12, 0.08, ringC, s.ry, 0, a + Math.PI / 2);
  }
  if (o.shape === 'arch') { // jambs down to the sill / threshold
    place(o.u0 - 0.12, o.u0, o.y0, yc, -0.03, 0.05, ringC); place(o.u1, o.u1 + 0.12, o.y0, yc, -0.03, 0.05, ringC);
    if (o.type !== 'door') place(o.u0 - 0.16, o.u1 + 0.16, o.y0 - 0.08, o.y0, -0.1, 0.08, c.colors.plinth, 'stone');
    if (o.type === 'door') { // wooden fanlight in the arch
      b.t('wood');
      for (let k = 0; k < 6; k++) { const ya = yc + (r * k) / 6, yb = yc + (r * (k + 1)) / 6, hw = Math.sqrt(Math.max(0, r * r - ((ya + yb) / 2 - yc) ** 2)); place(um - hw, um + hw, ya, yb, 0.1, 0.16, c.colors.wood); }
    }
  } else if (o.type !== 'door') place(um - 0.3, um + 0.3, o.y0 - 0.1, o.y0 - 0.02, -0.08, 0.05, ringC);
}
// casona: wooden balcony on brackets with turned balusters
function buildBalcony(b, s, c, o) {
  const { rng } = c, um = (o.u0 + o.u1) / 2, w = Math.min(o.u1 - o.u0 + 1.8, s.u1 - s.u0 - 0.6), dp = 0.95, y = o.y0 - 0.05;
  const at = (u, out) => [s.ax + s.dx * u + s.nx * out, s.az + s.dz * u + s.nz * out];
  if (c.vstyle !== 'casona') { // plain pre-war: a cantilevered concrete slab and a simple steel rail
    const sc = c.colors.old.clone().offsetHSL(0, -0.03, 0.05), rc = col(rng.pick([0x2a2a28, 0x3a3a38, METAL.rust]), 0.05, rng), w2 = Math.min(o.u1 - o.u0 + 1.2, s.u1 - s.u0 - 0.6), dp2 = 0.85;
    { const [x, z] = at(um, dp2 / 2); b.t('concrete').box(x, y - 0.02, z, w2, 0.14, dp2, sc, s.ry); }
    b.t('metal');
    { const [x, z] = at(um, dp2 - 0.04); b.box(x, y + 0.95, z, w2, 0.04, 0.04, rc, s.ry); b.box(x, y + 0.12, z, w2, 0.03, 0.03, rc, s.ry); }
    for (const sd of [-1, 1]) { const [x, z] = at(um + sd * (w2 / 2 - 0.02), dp2 / 2); b.box(x, y + 0.95, z, 0.04, 0.04, dp2, rc, s.ry); }
    const n = Math.round(w2 / 0.14); for (let k = 0; k <= n; k++) { const [x, z] = at(um - w2 / 2 + (k * w2) / n, dp2 - 0.04); b.box(x, y + 0.53, z, 0.018, 0.84, 0.018, rc, s.ry); }
    return;
  }
  const wc = col(rng.pick([WOOD.dark, WOOD.weathered, 0x6a4a32]), 0.05, rng);
  b.t('wood');
  { const [x, z] = at(um, dp / 2); b.box(x, y, z, w, 0.1, dp, wc, s.ry); }
  for (const du of [-w / 2 + 0.2, 0, w / 2 - 0.2]) { const [x0, z0] = at(um + du, 0.02), [x1, z1] = at(um + du, dp - 0.1); b.plank([x0, y - 0.42, z0], [x1, y - 0.05, z1], 0.1, 0.12, wc); }
  const n = Math.round(w / 0.17);
  for (let k = 0; k <= n; k++) { const [x, z] = at(um - w / 2 + (k * w) / n, dp - 0.06); b.cyl(x, y + 0.48, z, 0.035, 0.045, 0.86, 6, wc); }
  for (const sd of [-1, 1]) for (let k = 1; k < 5; k++) { const [x, z] = at(um + sd * (w / 2 - 0.04), (k * dp) / 5); b.cyl(x, y + 0.48, z, 0.035, 0.045, 0.86, 6, wc); }
  { const [x, z] = at(um, dp - 0.06); b.box(x, y + 0.93, z, w + 0.06, 0.07, 0.1, wc, s.ry); }
  for (const sd of [-1, 1]) { const [x, z] = at(um + sd * (w / 2 - 0.04), dp / 2); b.box(x, y + 0.93, z, 0.1, 0.07, dp, wc, s.ry); }
}

const c0Layer = (c) => (c.baseMat === 'adobe' || c.baseMat === 'stone' ? 'stone' : 'concrete');
// a flight of steps from a door sill (local y = sill, building base at 0) down to the ground at -lift
function flight(b, c, x, z, nx, nz, sill, lift, w) {
  const H = sill + lift, n = Math.max(1, Math.ceil(H / 0.18)), rise = H / n, tread = 0.3, ry = Math.atan2(nx, nz);
  const sc = c.colors.plinth.clone().offsetHSL(0, 0, 0.02);
  b.t(c0Layer(c));
  for (let k = 0; k < n; k++) {
    const top = sill - k * rise, d = 0.08 + k * tread + tread / 2;
    b.box(x + nx * d, (top - lift - 0.3) / 2, z + nz * d, w, top + lift + 0.3, tread + 0.01, sc, ry);
  }
  if (H > 0.9) { // side walls on a tall flight
    const L = n * tread + 0.08;
    for (const sd of [-1, 1]) { const ox = nz * sd * (w / 2 + 0.1), oz = -nx * sd * (w / 2 + 0.1); b.plank([x + ox, sill + 0.15, z + oz], [x + ox + nx * L, -lift + 0.45, z + oz + nz * L], 0.18, 0.5, sc.clone().offsetHSL(0, 0, -0.04)); }
  }
}

// security / military: crenellated parapet with sandbags, wire along the top, slit shutters, a steel
// door hood, a roof lookout on the main block, sandbag walls flanking the entrance, a searchlight
function milDetails(b, c, sides, w, d, wallH, parapet, t, m) {
  const { rng } = c, sb = col(rng.pick([0xa89a78, 0x9a8c6a, 0x8a7e60]), 0.05, rng), steel = col(rng.pick([METAL.dark, 0x4a5246, 0x5a5a4a]), 0.04, rng);
  const top = wallH + parapet;
  for (const s of sides) {
    if (c.spec.party?.includes(s.name)) continue;
    // crenels: notches cut in the parapet every 1.6 m, a sandbag row behind each
    const n = Math.max(1, Math.floor((s.u1 - s.u0) / 1.6));
    for (let k = 0; k < n; k++) {
      const u = s.u0 + ((k + 0.5) * (s.u1 - s.u0)) / n, x = s.ax + s.dx * u - s.nx * (t + 0.35), z = s.az + s.dz * u - s.nz * (t + 0.35);
      b.t('fabric');
      for (let j = 0; j < 2; j++) b.box(x + s.dx * (j - 0.5) * 0.55, wallH + 0.12, z + s.dz * (j - 0.5) * 0.55, 0.52, 0.22, 0.34, sb.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06), s.ry, 0, rng.range(-0.06, 0.06));
    }
    // barbed wire on posts along the parapet
    b.t('metal');
    const np = Math.max(1, Math.round((s.u1 - s.u0) / 2.2));
    for (let k = 0; k <= np; k++) { const u = s.u0 + (k * (s.u1 - s.u0)) / np, x = s.ax + s.dx * u - s.nx * t / 2, z = s.az + s.dz * u - s.nz * t / 2; b.box(x, top + 0.3, z, 0.04, 0.6, 0.04, steel, s.ry, 0, 0.3); }
    for (const hh of [0.25, 0.45]) { const um = (s.u0 + s.u1) / 2, x = s.ax + s.dx * um - s.nx * t / 2 + s.nx * 0.08, z = s.az + s.dz * um - s.nz * t / 2 + s.nz * 0.08; b.box(x, top + hh, z, s.u1 - s.u0, 0.015, 0.015, col(METAL.steel), s.ry); }
    // steel shutters hinged above each slit
    for (const o of s.openings) {
      if (o.type !== 'slit') continue;
      const um = (o.u0 + o.u1) / 2, x = s.ax + s.dx * um + s.nx * 0.12, z = s.az + s.dz * um + s.nz * 0.12;
      b.box(x, o.y1 + 0.08, z, o.u1 - o.u0 + 0.2, 0.06, 0.3, steel, s.ry, -0.4);
    }
    if (s.name === 'front' && c.mass.main) {
      const fd = s.openings.find((o) => o.type === 'door' || o.type === 'bigdoor');
      if (fd) {
        const um = (fd.u0 + fd.u1) / 2;
        // concrete hood over the door
        { const x = s.ax + s.dx * um + s.nx * 0.45, z = s.az + s.dz * um + s.nz * 0.45; b.t('concrete').box(x, fd.y1 + 0.25, z, fd.u1 - fd.u0 + 0.9, 0.2, 0.9, c.colors.old.clone().offsetHSL(0, 0, -0.05), s.ry); }
      }
    }
  }
  // lookout on the roof of the main block: a small concrete box with a slit all round, and a searchlight
  if (c.mass.main && w > 4.5 && d > 4.5 && c.spec.kind !== 'bunker') {
    const lx = (rng.chance(0.5) ? -1 : 1) * (w / 2 - 1.6), lz = -d / 2 + 1.6, lh = 1.9;
    b.t('concrete');
    const lc = c.colors.old.clone().offsetHSL(0, 0, -0.02);
    for (const [ox, oz, bw, bd] of [[0, -0.95, 2.2, 0.3], [0, 0.95, 2.2, 0.3], [-0.95, 0, 0.3, 1.6], [0.95, 0, 0.3, 1.6]]) { b.box(lx + ox, wallH + 0.6, lz + oz, bw, 1.2, bd, lc); b.box(lx + ox, wallH + lh - 0.15, lz + oz, bw, 0.3, bd, lc); }
    for (const [ox, oz] of [[-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]]) b.box(lx + ox, wallH + lh / 2, lz + oz, 0.3, lh, 0.3, lc);
    b.box(lx, wallH + lh + 0.05, lz, 2.5, 0.16, 2.5, lc);
    const r = c.lightR(true, c.powered);
    b.t('metal').cyl(lx + 1.3, wallH + lh + 0.5, lz + 1.3, 0.05, 0.05, 0.9, 6, steel);
    b.box(lx + 1.3, wallH + lh + 0.97, lz + 1.3, 0.5, 0.05, 0.05, steel); // the yoke; the lamp head itself is live (effects), it turns with the beam
    const p = c.toLocal(lx + 1.3, wallH + lh + 1.12, lz + 1.3);
    c.info.lights.push({ x: p[0], y: p[1], z: p[2], color: [0.9, 0.95, 1.0], radius: 3.5, intensity: 1.0, kind: 'spot', r, flicker: false, search: { reach: 22, head: 0.26 } });
  }
}

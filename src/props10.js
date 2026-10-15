// Prop pass 10: mystics. A rare street stall (medium, tarot reader, crystal & charm seller, curandera cart) and the
// yard things of a curandera / bruja / wasteland mystic: a bottle tree, a scrap-and-bone totem, bone chimes on a post,
// an offering pile. Fabrics stay a little brighter than everything else, all faded by the sun. Front = +Z.
import { col } from './builder.js';
import { WOOD, METAL, GLASS } from './palette.js';
import { LIGHT_COL } from './presets.js';

const DRAPE = [0x5a3a5a, 0x6a2e3a, 0x3e3a5e, 0x7a5a3a, 0x4a5a4a, 0x8a3e2e, 0x2e4a5a];
const TRIMC = [0xb89a52, 0xa8473a, 0xc8b896, 0x8a7a9a];
const wood = (r) => col(r.pick([WOOD.weathered, WOOD.dark, 0x8a7a62]), 0.06, r);
const rust = (r) => col(r.pick([METAL.rust, METAL.rust2, 0x7a4a30]), 0.06, r);
const BONE = 0xd8ccb0;

// candles on a surface at height y: n small stubs, the flames on the lamp channel
function candles(b, r, n, x, y, z, spread = 0.25, lr = 9) {
  for (let k = 0; k < n; k++) {
    const cx = x + r.range(-spread, spread), cz = z + r.range(-spread * 0.6, spread * 0.6), h = r.range(0.06, 0.16);
    b.t('plain').cyl(cx, y + h / 2, cz, 0.022, 0.025, h, 6, col(r.pick([0xe8e0c8, 0xd8c8a0, 0x8a2a22, 0x2a2a2a]), 0.04, r));
    b.ch('lamp').w(lr).t('plain').box(cx, y + h + 0.02, cz, 0.014, 0.03, 0.014, 0xffc070).w(-1).ch('main');
  }
}
function skull(b, x, y, z, s = 1, c = BONE) {
  b.t('plain').box(x, y + 0.06 * s, z, 0.13 * s, 0.12 * s, 0.15 * s, col(c)).box(x, y + 0.01 * s, z + 0.04 * s, 0.09 * s, 0.04 * s, 0.07 * s, col(c));
  for (const sx of [-1, 1]) b.box(x + sx * 0.032 * s, y + 0.07 * s, z + 0.076 * s, 0.03 * s, 0.03 * s, 0.006, col(0x1e1a18));
}
function crystal(b, r, x, y, z, s) {
  const c = col(r.pick([0xb8a8c8, 0x9ab8b0, 0xd8d0c0, 0xa88aa8, 0xc8b890]), 0.05, r);
  b.t('plain').cyl(x, y + s * 0.5, z, 0.001, s * 0.22, s, 5, c, r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3));
}

export function addMysticProps(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  P.mystic_stall = (b, r, o) => {
    const kind = o.kind || r.pick(['medium', 'tarot', 'crystals', 'curandera']);
    const drape = col(r.pick(DRAPE), 0.06, r), trim = col(r.pick(TRIMC), 0.06, r), wc = wood(r);
    const lights = [];
    const sign = (txt, y) => { b.t('wood').box(0, y, -0.55, 1.3, 0.32, 0.04, col(r.pick([0x2a2622, 0x3a2e2a, 0x5a4a3a]), 0.05, r)); b.t('plain').box(0, y, -0.525, 1.1, 0.06, 0.01, trim); void txt; };
    if (kind === 'curandera') { // a handcart hung with herb bundles, jars of remedies, a little saint
      b.t('wood').box(0, 0.75, 0, 1.6, 0.06, 0.9, wc);
      for (const sx of [-0.78, 0.78]) b.box(sx, 0.95, 0, 0.04, 0.36, 0.9, wc);
      for (const sd of [-1, 1]) { b.t('wood').cyl(sd * 0.86, 0.38, 0.1, 0.38, 0.38, 0.05, 12, wc, 0, 0, Math.PI / 2); }
      b.box(0, 0.38, 0.1, 1.8, 0.04, 0.04, col(METAL.dark));
      for (const sd of [-1, 1]) b.beam([sd * 0.72, 0.75, 0.45], [sd * 0.62, 0.9, 1.35], 0.025, 4, wc);
      for (const sx of [-0.7, 0.7]) b.box(sx, 1.45, -0.4, 0.05, 1.4, 0.05, wc);
      b.box(0, 2.12, -0.4, 1.5, 0.04, 0.04, wc);
      for (let k = 0; k < 7; k++) { const x = -0.6 + k * 0.2; b.t('thatch').cyl(x, 1.88, -0.4, 0.05, 0.02, 0.4, 6, col(r.pick([0x6a7a4a, 0x8a8a5a, 0x7a6a4a, 0x9a8a5a]), 0.08, r)); }
      for (let k = 0; k < 9; k++) b.t('plain').cyl(r.range(-0.65, 0.65), 0.86, r.range(-0.3, 0.3), 0.05, 0.05, r.range(0.12, 0.2), 7, col(r.pick([GLASS?.bottle ?? 0x6a7a5a, 0x8a6a3a, 0xc8b890, 0x5a6a7a]), 0.06, r));
      b.t('plain').box(0.5, 0.98, -0.3, 0.12, 0.26, 0.08, col(0x8a5a4a)); candles(b, r, 2, 0.5, 0.78, -0.12, 0.08, o._r ?? 9);
      lights.push({ at: [0.5, 0.95, -0.1], color: LIGHT_COL.fire, radius: 2.5, intensity: 0.35, kind: 'lamp', flicker: true });
    } else {
      // a draped table under a canvas shade on four poles, a stool for the reader, a chair for the client
      b.t('wood'); for (const [x, z] of [[-0.55, -0.32], [0.55, -0.32], [-0.55, 0.32], [0.55, 0.32]]) b.box(x, 0.36, z, 0.05, 0.72, 0.05, wc);
      b.t('fabric').box(0, 0.74, 0, 1.3, 0.03, 0.82, drape);
      for (const sd of [-1, 1]) b.box(0, 0.48, sd * 0.42, 1.3, 0.52, 0.015, drape); b.box(-0.66, 0.48, 0, 0.015, 0.52, 0.82, drape); b.box(0.66, 0.48, 0, 0.015, 0.52, 0.82, drape);
      b.t('plain').box(0, 0.24, 0.425, 1.28, 0.05, 0.016, trim); // fringe
      const H = 2.1; b.t('wood'); for (const [x, z] of [[-0.95, -0.9], [0.95, -0.9], [-0.95, 0.9], [0.95, 0.9]]) b.box(x, H / 2, z, 0.05, H, 0.05, wc);
      b.t('fabric').box(0, H + 0.02, 0, 2.05, 0.02, 1.95, col(r.pick([0x8a7a62, 0x6a5a5a, 0x5a4a5a, 0x7a6a52]), 0.06, r), 0, 0.06);
      b.box(0, H - 0.5, -0.97, 2.0, 1.0, 0.015, drape); // back curtain
      b.t('wood').box(0, 0.24, -0.62, 0.36, 0.04, 0.36, wc); for (const [x, z] of [[-0.15, -0.77], [0.15, -0.77], [-0.15, -0.47], [0.15, -0.47]]) b.box(x, 0.11, z, 0.03, 0.22, 0.03, wc);
      b.t('wood').box(0, 0.42, 0.75, 0.42, 0.04, 0.4, wc).box(0, 0.68, 0.94, 0.42, 0.5, 0.03, wc); for (const [x, z] of [[-0.18, 0.58], [0.18, 0.58], [-0.18, 0.92], [0.18, 0.92]]) b.box(x, 0.2, z, 0.03, 0.4, 0.03, wc);
      if (kind === 'medium') { // a glass ball on a stand, a skull, candles, a framed photo of the departed
        b.t('metal').cyl(0, 0.79, 0, 0.07, 0.09, 0.06, 8, col(0x6a5a3a)); b.t('plain').cyl(0, 0.92, 0, 0.13, 0.13, 0.2, 10, col(0xb8c0c8, 0.03, r));
        skull(b, -0.42, 0.755, -0.12); candles(b, r, 5, 0.4, 0.755, -0.1, 0.18, o._r ?? 9); b.t('plain').box(-0.15, 0.86, -0.3, 0.16, 0.2, 0.02, col(0x4a3a2a));
        lights.push({ at: [0.2, 0.95, 0], color: LIGHT_COL.fire, radius: 3, intensity: 0.45, kind: 'lamp', flicker: true });
      } else if (kind === 'tarot') { // the spread on the cloth, the deck, an oil lamp, a bowl of coins
        for (let k = 0; k < 5; k++) b.t('plain').box(-0.36 + k * 0.18, 0.762, 0.06 + (k % 2) * 0.05, 0.1, 0.004, 0.16, col(r.pick([0xd8ccb0, 0xc8b890]), 0.04, r), r.range(-0.15, 0.15));
        b.box(0.45, 0.77, -0.2, 0.1, 0.03, 0.16, col(0x5a2a2a)); b.t('metal').cyl(-0.45, 0.78, -0.22, 0.07, 0.05, 0.05, 8, col(0x8a7a52));
        b.t('plain').cyl(0.15, 0.82, -0.26, 0.05, 0.06, 0.13, 8, col(0xc8a870)); b.ch('lamp').w(o._r ?? 9).t('plain').box(0.15, 0.92, -0.26, 0.02, 0.04, 0.02, 0xffc070).w(-1).ch('main');
        lights.push({ at: [0.15, 1.0, -0.2], color: LIGHT_COL.oil, radius: 3, intensity: 0.45, kind: 'lamp', flicker: true });
      } else { // crystals & charms: stones on the cloth, charms hanging from the shade
        for (let k = 0; k < 9; k++) crystal(b, r, r.range(-0.55, 0.55), 0.755, r.range(-0.3, 0.3), r.range(0.08, 0.2));
        for (let k = 0; k < 8; k++) { const x = -0.85 + k * 0.24, len = r.range(0.25, 0.55); b.t('plain').box(x, H - len / 2, 0.92, 0.006, len, 0.006, col(0x6a5a4a)); r.chance(0.5) ? crystal(b, r, x, H - len - 0.12, 0.92, 0.1) : b.t('metal').cyl(x, H - len - 0.04, 0.92, 0.04, 0.04, 0.02, 8, col(r.pick([0xb89a52, 0x8a8a8a, 0xa86a4a])), Math.PI / 2); }
        candles(b, r, 2, -0.45, 0.755, 0.2, 0.1, o._r ?? 9);
      }
      if (r.chance(0.7)) sign('', H - 0.2);
    }
    return { lights };
  };
  L('mystic_stall', 'fabric');
  PROP_LIGHT.mystic_stall = { electric: false };

  P.bottle_tree = (b, r, o) => { // a dead mesquite stuck with bottles, neck-down, to catch what wanders by
    const bark = col(r.pick([0x5a4a3a, 0x6a5a4a, 0x4a3e34]), 0.05, r), H = o.height || r.range(1.8, 2.4);
    b.t('bark').cyl(0, H / 2, 0, 0.07, 0.1, H, 6, bark);
    const tips = [];
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + r.range(-0.3, 0.3), y0 = H * r.range(0.45, 0.9), L2 = r.range(0.5, 0.9), tip = [Math.cos(a) * L2, y0 + r.range(0.2, 0.5), Math.sin(a) * L2]; b.beam([0, y0, 0], tip, 0.03, 4, bark); tips.push(tip); }
    for (const t of tips) b.t('plain').cyl(t[0], t[1] + 0.12, t[2], 0.05, 0.035, 0.24, 7, col(r.pick([0x2e4a6a, 0x3a6a8a, 0x5a7a4a, 0x6a4a2a, 0x2e5a5a]), 0.05, r), Math.PI);
    return {};
  };
  L('bottle_tree', 'bark');

  P.totem = (b, r, o) => { // wasteland totem: a pole of scrap, a hubcap sun, a brahmin skull, wire and rags
    const H = o.height || r.range(2.4, 3.2), wc = wood(r);
    b.t('wood').box(0, H / 2, 0, 0.14, H, 0.14, wc);
    b.t('metal').cyl(0, H - 0.5, 0.1, 0.32, 0.32, 0.03, 12, rust(r), Math.PI / 2); // hubcap / dish
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.beam([Math.cos(a) * 0.32, H - 0.5 + Math.sin(a) * 0.32, 0.11], [Math.cos(a) * 0.5, H - 0.5 + Math.sin(a) * 0.5, 0.11], 0.012, 3, rust(r)); }
    skull(b, 0, H - 1.25, 0.12, 2.2, 0xd0c4a8); for (const sd of [-1, 1]) b.beam([sd * 0.13, H - 1.0, 0.12], [sd * 0.42, H - 0.82, 0.14], 0.022, 4, col(0xc8b896)); // horns
    b.t('fabric'); for (let k = 0; k < 4; k++) b.box(r.range(-0.12, 0.12), H - 1.7 - k * 0.1, 0.08, 0.06, r.range(0.3, 0.5), 0.01, col(r.pick(DRAPE), 0.08, r), 0, 0, r.range(-0.2, 0.2));
    b.t('metal'); for (let k = 0; k < 3; k++) b.box(0, 0.6 + k * 0.4, 0.075, 0.16, 0.04, 0.01, col(r.pick([0x8a8a80, METAL.rust])));
    if (o.glow ?? r.chance(0.35)) { b.ch('lamp').w(o._r ?? 9).t('plain').box(0, H + 0.08, 0, 0.08, 0.08, 0.08, 0x9aff8a).w(-1).ch('main'); return { lights: [{ at: [0, H + 0.1, 0], color: LIGHT_COL.neon_green, radius: 3, intensity: 0.4, kind: 'lamp', flicker: true }] }; }
    return {};
  };
  L('totem', 'wood');

  P.bone_chimes = (b, r, o) => { // a crooked post and an arm hung with bones, cans and keys that knock in the wind
    const H = o.height || 2.2, wc = wood(r);
    b.t('wood').box(0, H / 2, 0, 0.09, H, 0.09, wc).box(0, H - 0.05, 0.35, 0.06, 0.06, 0.75, wc);
    for (let k = 0; k < 6; k++) { const z = 0.1 + k * 0.11, len = r.range(0.3, 0.6); b.t('plain').box(0, H - 0.05 - len / 2, z, 0.005, len, 0.005, col(0x5a4a3a));
      const t = r.next(); if (t < 0.5) b.box(0, H - 0.1 - len, z, 0.025, 0.16, 0.025, col(BONE, 0.05, r)); else if (t < 0.8) b.t('metal').cyl(0, H - 0.08 - len, z, 0.03, 0.03, 0.08, 6, rust(r)); else b.t('metal').box(0, H - 0.06 - len, z, 0.015, 0.06, 0.03, col(0xb89a52)); }
    return {};
  };
  L('bone_chimes', 'wood');

  P.offering_pile = (b, r, o) => { // on the ground: candles, marigolds, a bowl, bottles, a photo, salt
    b.t('plain').cyl(0, 0.01, 0, 0.5, 0.5, 0.02, 10, col(0x8a7a62, 0.05, r));
    candles(b, r, r.int(4, 8), 0, 0.02, 0, 0.35, o._r ?? 9);
    for (let k = 0; k < 6; k++) b.t('plain').cyl(r.range(-0.4, 0.4), 0.03, r.range(-0.3, 0.3), 0.04, 0.04, 0.04, 6, col(r.pick([0xc8862a, 0xb86a2a, 0xa8473a]), 0.06, r));
    b.t('plain').cyl(0.2, 0.05, -0.2, 0.09, 0.06, 0.08, 8, col(0x8a5a3a)); b.t('plain').cyl(-0.25, 0.1, -0.25, 0.035, 0.035, 0.2, 6, col(0x5a6a4a));
    if (r.chance(0.5)) skull(b, 0, 0.02, -0.25, 0.9);
    return { lights: [{ at: [0, 0.25, 0], color: LIGHT_COL.fire, radius: 2.2, intensity: 0.35, kind: 'lamp', flicker: true }] };
  };
  L('offering_pile', 'plain');
  PROP_LIGHT.offering_pile = { electric: false };
}

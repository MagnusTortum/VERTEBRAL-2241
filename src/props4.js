// Prop pass 4 (batch 7, coastal valley complete): cemetery tombs, threshing floor, stock pond, tahona
// mill, cuexcomate granary, bread oven, anvil, pottery racks, wine press and barrel racks, temazcal,
// brickyard kit (brick rows / stacks, mud pit, lime kiln), salvage kit (car stacks, sorted heaps,
// boom crane), cock-fight ring, bleachers, vine trellis, flagpole, sacks, and the pre-war layer
// (military checkpoint ruin, Poseidon substation, Nuka-Cola / RobCo kit). Front = +Z.
import { flagDesign, drawFlag } from './flags.js';
import { plant, pottedPlant } from './foliage.js';
import { PLANT } from './textures.js';
import { col } from './builder.js';
import { WOOD, METAL, MISC, ROOF } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { ellip, rod, lathe, tube, rock } from './shapes.js';

const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const TOMB = [0x3a7ab8, 0xe8e0d0, 0xd86a8a, 0x5aa070, 0xe8c040, 0x9a6ad0, 0xd84a3a, 0x7ac0c8];
const MARIGOLD = [0xf09a20, 0xe8b030, 0xd86a10];
const FLOWER = [0xc0306a, 0xf0e0d0, 0xd85030, 0x9a40a0, 0xe0b030];

export function addValleyProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);
  const flowers = (b, r, x, y, z, n = 5, spread = 0.25) => { for (let k = 0; k < Math.max(1, Math.round(n / 3)); k++) plant(b, r.chance(0.6) ? 'marigold' : 'flowers', x + r.range(-spread, spread), y, z + r.range(-spread, spread), 0.3, r); };
  const candle = (b, r, x, y, z, o) => { b.t('plain').cyl(x, y + 0.08, z, 0.05, 0.05, 0.16, 8, col(r.pick([0xe8e0d0, 0xc83030, 0x3a6ab0]))); b.ch('lamp').w(o._r ?? (r.chance(0.5) ? -0.5 : 9)).cyl(x, y + 0.19, z, 0.015, 0.015, 0.05, 5, 0xffd890).w(-1).ch('main'); };

  // ---------------------------------------------------------------- cemetery
  // variant: cross | painted | headstone | child | capilla (small chapel tomb)
  P.tomb = (b, r, o) => {
    const v = o.variant || r.weighted({ cross: 3, painted: 3, headstone: 1.2, child: 0.8, capilla: 0.35 });
    const paint = col(o.color || r.pick(TOMB), 0.04, r), plaster = r.chance(0.5) ? paint : col(0xe8e2d4, 0.02, r);
    if (v === 'cross') { // mound of earth and stones, a wood or iron cross
      b.t('dirt'); ellip(b, 0, 0.02, 0, 0.45, 0.16, 0.95, col(0x8a7058, 0.05, r));
      b.t('stone'); for (let k = 0; k < 8; k++) rock(b, r, r.range(-0.4, 0.4), 0.08, r.range(-0.85, 0.85), 0.08, 0.06, 0.08, col(0xa89c88, 0.06, r));
      const iron = r.chance(0.35), cc = iron ? col(0x2a2826) : col(r.pick([WOOD.weathered, 0xe8e2d4, 0x3a6ab0]), 0.05, r);
      b.t(iron ? 'metal' : 'wood').box(0, 0.55, -0.95, 0.07, 1.1, 0.07, cc).box(0, 0.85, -0.95, 0.5, 0.07, 0.06, cc);
      if (r.chance(0.6)) flowers(b, r, 0, 0.2, -0.6, 4, 0.2);
      return {};
    }
    if (v === 'headstone') { b.t('stone').box(0, 0.08, 0, 0.8, 0.16, 1.8, col(0x9c9488, 0.04, r)).box(0, 0.45, -0.88, 0.6, 0.75, 0.12, col(0xb0a898, 0.04, r)); flowers(b, r, 0, 0.18, -0.6, 3); return {}; }
    if (v === 'capilla') { // little chapel over the grave: walls, gable, a door with glass, a cross on top
      b.t('plaster').box(0, 0.9, 0, 1.4, 1.8, 2.0, plaster);
      b.t('roof_tile'); for (const sg of [-1, 1]) b.plank([0, 2.35, 0], [sg * 0.85, 1.8, 0], 2.2, 0.06, col(r.pick(ROOF.tile), 0.05, r));
      b.t('plaster'); for (const z of [-1.0, 1.0]) b.tri([-0.7, 1.8, z], [0.7, 1.8, z], [0, 2.3, z], plaster);
      b.t('metal').box(0, 0.75, 1.01, 0.6, 1.2, 0.03, col(0x2a2826)); b.ch('glass').w(0.4).t('plain').box(0, 0.85, 1.02, 0.45, 0.9, 0.01, col(0xa8b8b8)).w(-1).ch('main');
      b.t('stone').box(0, 2.55, 1.0, 0.06, 0.45, 0.06, col(0xd8d0c0)).box(0, 2.62, 1.0, 0.28, 0.06, 0.06, col(0xd8d0c0));
      flowers(b, r, 0, 0.05, 1.3, 5, 0.4); candle(b, r, 0.4, 0, 1.15, o);
      return {};
    }
    const child = v === 'child', s = child ? 0.6 : 1;
    // painted box tomb: plinth, body, a head piece with a niche and cross; flowers, a candle
    b.t('plaster').box(0, 0.1 * s, 0, 0.95 * s, 0.2 * s, 2.0 * s, col(0xc8c0b0, 0.03, r));
    b.box(0, 0.38 * s, 0.05 * s, 0.8 * s, 0.36 * s, 1.7 * s, paint);
    b.box(0, 0.85 * s, -0.85 * s, 0.85 * s, 1.0 * s, 0.25 * s, plaster);
    if (child) { b.t('roof_tile'); for (const sg of [-1, 1]) b.plank([0, 1.5 * s, -0.85 * s], [sg * 0.5 * s, 1.3 * s, -0.85 * s], 0.32 * s, 0.04, col(0x965b45)); }
    b.t('plain').box(0, 0.85 * s, -0.72 * s, 0.4 * s, 0.45 * s, 0.02, col(0x2a3a5a));
    b.t('stone').box(0, 1.5 * s, -0.85 * s, 0.07, 0.4 * s, 0.07, col(0xe8e2d4)).box(0, 1.58 * s, -0.85 * s, 0.26 * s, 0.06, 0.06, col(0xe8e2d4));
    flowers(b, r, 0, 0.56 * s, 0.1, 6, 0.3 * s); if (r.chance(0.6)) candle(b, r, 0.25 * s, 0.56 * s, 0.6 * s, o);
    return {};
  };
  L('tomb', 'plaster');

  // ---------------------------------------------------------------- grain
  P.era = (b, r, o) => { // threshing floor: a round stone-paved disc, low curb, a pole in the middle, straw
    const R = o.radius || 6, sc = col(0xb0a48c, 0.04, r);
    b.t('cobble'); lathe(b, [[R, -0.2], [R, 0.08], [0, 0.1]], sc, 0, 0, 0, 28, `era${R}`);
    b.t('stone'); for (let k = 0; k < Math.round(R * 6); k++) { const a = (k / Math.round(R * 6)) * Math.PI * 2; rock(b, r, Math.cos(a) * R, 0.12, Math.sin(a) * R, 0.22, 0.14, 0.18, sc.clone().offsetHSL(0, 0, r.range(-0.06, 0.04)), a); }
    b.t('bark').cyl(0, 1.2, 0, 0.08, 0.1, 2.4, 6, col(WOOD.pole));
    b.t('thatch'); for (let k = 0; k < 14; k++) { const a = r.range(0, 6.28), d = r.range(0.5, R * 0.85); ellip(b, Math.cos(a) * d, 0.12, Math.sin(a) * d, r.range(0.4, 1.0), 0.05, r.range(0.3, 0.7), col(0xd0b878, 0.06, r), 0, r.range(0, 3), 0, 8); }
    for (let k = 0; k < (o.sheaves ?? 5); k++) { const a = r.range(0, 6.28), x = Math.cos(a) * (R + 1.2), z = Math.sin(a) * (R + 1.2); b.t('thatch').cyl(x, 0.45, z, 0.25, 0.3, 0.9, 8, col(0xc8ac68, 0.05, r)); }
    return {};
  };
  L('era', 'cobble');
  P.pond = (b, r, o) => { // jagüey: a dug stock pond, mud rim, water, reeds
    const R = o.radius || 6;
    b.t('dirt'); lathe(b, [[R + 1.4, -0.1], [R + 0.5, 0.42], [R - 0.2, 0.34], [R - 0.6, 0.16], [0, 0.12]], col(0x7a6450, 0.05, r), 0, 0, 0, 30, `pond${R}`);
    b.ch('water').t('plain').cyl(0, 0.26, 0, R - 0.35, R - 0.35, 0.02, 30, MISC.water).ch('main');
    for (let k = 0; k < Math.round(R * 2.5); k++) { const a = r.range(0, 6.28), d = R - r.range(0.3, 0.9); b.leafCross(Math.cos(a) * d, 0.15, Math.sin(a) * d, r.range(0.6, 1.0), r.range(0.9, 1.5), PLANT.grass, col(r.pick([0x9ab070, 0xb0b878, 0x88a060]), 0.06, r), 2, r.next() * 3); } // reeds
    return {};
  };
  L('pond', 'dirt');
  P.tahona = (b, r, o) => { // animal-driven stone mill: round trough, an upright wheel on a beam, the pivot post
    const R = 1.8, sc = col(0xa89c88, 0.04, r);
    b.t('stone'); lathe(b, [[R + 0.4, 0], [R + 0.4, 0.6], [R + 0.25, 0.6], [R + 0.2, 0.35], [R - 0.3, 0.35], [R - 0.35, 0.6], [R - 0.5, 0.6], [R - 0.5, 0]], sc, 0, 0, 0, 28, 'tahona');
    b.t('stone').cyl(0, 0.45, 0, 0.45, 0.5, 0.9, 12, sc);
    b.t('bark').cyl(0, 1.5, 0, 0.1, 0.12, 1.4, 8, col(WOOD.pole));
    b.t('stone').cyl(R - 0.05, 0.95, 0, 0.6, 0.6, 0.32, 18, col(0xb8b0a0, 0.03, r), Math.PI / 2, 0, 0);
    b.t('wood'); rod(b, [0, 1.0, 0], [R + 2.4, 0.95, 0], 0.07, col(WOOD.dark));
    b.t('plain').cyl(R - 0.05, 0.4, 0, R * 0.2, R * 0.2, 0.02, 8, col(0xd8c890)); // meal in the trough
    return {};
  };
  L('tahona', 'stone');
  P.cuexcomate = (b, r) => { // adobe jar granary with a thatched cap
    const ac = col(0xb08a64, 0.05, r);
    b.t('adobe'); lathe(b, [[0.9, 0], [1.2, 0.6], [1.35, 1.4], [1.25, 2.1], [0.85, 2.6], [0.5, 2.75], [0, 2.78]], ac, 0, 0, 0, 20, 'cuex');
    b.t('stone').cyl(0, 0.1, 0, 1.15, 1.2, 0.2, 16, col(0x9c917e));
    b.t('thatch').cone(0, 2.95, 0, 1.0, 0.8, 12, col(0xb59c66, 0.05, r));
    b.t('wood').box(0, 1.8, 1.24, 0.5, 0.5, 0.08, col(WOOD.dark), 0, -0.25);
    return {};
  };
  L('cuexcomate', 'adobe');
  P.sacks = (b, r, o) => { // a pile of grain / maize sacks
    const n = o.count || r.int(4, 8);
    for (let k = 0; k < n; k++) { const lay = Math.floor(k / 4); b.t('fabric'); ellip(b, ((k % 4) - 1.5) * 0.42 + r.range(-0.05, 0.05), 0.18 + lay * 0.3, (lay % 2) * 0.2 + r.range(-0.08, 0.08), 0.24, 0.17, 0.36, col(r.pick([0xc8b890, 0xb8a878, 0xd8c8a0, 0xa89868]), 0.05, r), 0, r.range(-0.3, 0.3), 0, 10); }
    return {};
  };
  L('sacks', 'fabric');

  // ---------------------------------------------------------------- trades
  P.horno = (b, r, o) => { // adobe dome bread oven on a block base, arched mouth, firewood
    const ac = col(r.pick([0xb08a64, 0xc8b8a0, 0xe8e2d4]), 0.04, r);
    b.t('adobe').box(0, 0.45, 0, 1.9, 0.9, 1.9, ac.clone().offsetHSL(0, 0, -0.05));
    lathe(b, [[0.9, 0], [0.88, 0.25], [0.75, 0.55], [0.5, 0.8], [0.15, 0.92], [0, 0.93]], ac, 0, 0.9, 0, 18, 'horno');
    b.t('plain').box(0, 1.12, 0.84, 0.42, 0.34, 0.12, col(0x1a1614)).cyl(0.3, 1.85, -0.2, 0.06, 0.07, 0.2, 8, col(0x3a3430));
    if (o.lit !== false) { b.ch('lamp').w(o._r ?? 9).t('plain').box(0, 1.05, 0.86, 0.3, 0.16, 0.02, 0xff8a30).w(-1).ch('main'); }
    b.t('bark'); for (let k = 0; k < 6; k++) rod(b, [1.2 + r.range(0, 0.4), 0.1 + (k % 3) * 0.13, -0.6 + Math.floor(k / 3) * 0.2], [1.2 + r.range(0, 0.4), 0.1 + (k % 3) * 0.13, 0.5 + Math.floor(k / 3) * 0.2], 0.06, col(WOOD.dark, 0.06, r), 6);
    return o.lit === false ? {} : { lights: [{ at: [0, 1.0, 1.4], color: LIGHT_COL.fire, radius: 4, intensity: 0.8, kind: 'fire', flicker: true }], emitters: [{ type: 'smoke', p: [0.3, 2.0, -0.2], small: true }] };
  };
  L('horno', 'adobe');
  P.anvil = (b, r) => {
    b.t('bark').cyl(0, 0.3, 0, 0.3, 0.32, 0.6, 10, col(WOOD.dark));
    const iron = col(0x2a2826);
    b.t('metal').box(0, 0.68, 0, 0.32, 0.12, 0.2, iron).box(0, 0.8, 0, 0.6, 0.14, 0.22, iron);
    rod(b, [0.3, 0.84, 0], [0.48, 0.84, 0], 0.06, iron, 8);
    b.box(0.1, 0.9, 0.05, 0.3, 0.04, 0.05, col(0x5a5a58)); // hammer
    return {};
  };
  L('anvil', 'metal');
  P.pottery_rack = (b, r) => { // boards on trestles, pots drying in rows
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood'); for (const y of [0.5, 1.1]) b.box(0, y, 0, 2.4, 0.05, 0.5, wc);
    for (const x of [-1.1, 1.1]) b.box(x, 0.6, 0, 0.06, 1.2, 0.45, wc);
    b.t('plain'); for (const y of [0.53, 1.13]) for (let x = -1.0; x <= 1.0; x += 0.33) { const s = r.range(0.7, 1.0); lathe(b, [[0.06 * s, 0], [0.13 * s, 0.1 * s], [0.14 * s, 0.18 * s], [0.08 * s, 0.26 * s], [0.09 * s, 0.3 * s]], col(r.chance(0.5) ? 0xc8a07a : r.pick(TERRA), 0.05, r), x, y, r.range(-0.08, 0.08), 12); }
    return {};
  };
  L('pottery_rack', 'wood');
  P.wine_press = (b, r) => { // basket press: slatted tub on a tray, screw and beam
    const wc = col(WOOD.dark, 0.05, r);
    b.t('wood').box(0, 0.35, 0, 1.6, 0.12, 1.6, wc).box(0, 0.15, 0, 0.2, 0.3, 1.5, wc);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; b.box(Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5, 0.08, 0.9, 0.04, wc, -a + Math.PI / 2); }
    b.t('metal'); for (const y of [0.55, 1.15]) b.cyl(0, y, 0, 0.53, 0.53, 0.04, 16, col(0x3a3836));
    for (const sd of [-1, 1]) b.t('wood').box(sd * 0.75, 1.1, 0, 0.14, 1.5, 0.14, wc);
    b.box(0, 1.9, 0, 1.7, 0.18, 0.2, wc); b.t('metal').cyl(0, 1.55, 0, 0.06, 0.06, 0.8, 8, col(0x3a3836)); rod(b, [-0.5, 1.4, 0], [0.5, 1.4, 0], 0.03, col(0x3a3836));
    b.t('plain').cyl(0, 0.42, 0, 0.45, 0.45, 0.02, 14, col(0x4a1a2a)); // must
    return {};
  };
  L('wine_press', 'wood');
  P.barrel_rack = (b, r, o) => { // wine barrels lying on a timber cradle, two high
    const n = o.count || 3, wc = col(WOOD.weathered, 0.05, r);
    b.t('wood'); for (const z of [-0.45, 0.45]) b.box(0, 0.12, z, n * 0.9 + 0.2, 0.12, 0.14, wc);
    for (let k = 0; k < n; k++) for (let lay = 0; lay < (o.high === false ? 1 : 2); lay++) {
      if (lay === 1 && k === n - 1) continue;
      const x = (k - (n - 1) / 2) * 0.9 + lay * 0.45, y = 0.55 + lay * 0.72;
      b.t('wood').cyl(x, y, 0, 0.36, 0.36, 0.95, 14, col(r.pick([0x7a5232, 0x8a6040, 0x6a4a2a]), 0.05, r), Math.PI / 2, 0, 0);
      b.t('metal'); for (const zz of [-0.3, 0.3]) b.cyl(x, y, zz, 0.375, 0.375, 0.04, 14, col(0x3a3836), Math.PI / 2, 0, 0);
    }
    return {};
  };
  L('barrel_rack', 'wood');
  P.temazcal = (b, r) => { // steam bath: a low adobe/stone dome, a crawl door, the fire for the stones outside
    const ac = col(r.pick([0xb08a64, 0xa89c88]), 0.05, r);
    b.t('adobe'); lathe(b, [[1.6, 0], [1.55, 0.5], [1.3, 1.1], [0.8, 1.5], [0.3, 1.65], [0, 1.66]], ac, 0, 0, 0, 20, 'temaz');
    b.t('plain').box(0, 0.4, 1.5, 0.6, 0.75, 0.3, col(0x1a1614));
    b.t('fabric').box(0, 0.45, 1.62, 0.7, 0.85, 0.03, col(r.pick([0xa83a32, 0x3a6ab0, 0xd8a040])));
    b.t('stone'); for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; rock(b, r, Math.cos(a) * 0.5, 0.08, 2.6 + Math.sin(a) * 0.5, 0.14, 0.1, 0.12, col(0x6a6460)); }
    b.t('plain'); lathe(b, [[0.08, 0], [0.22, 0.15], [0.25, 0.3], [0.15, 0.45]], col(r.pick(TERRA)), -1.0, 0, 1.6, 12);
    return { emitters: [{ type: 'smoke', p: [0, 0.5, 2.6], small: true }] };
  };
  L('temazcal', 'adobe');

  // ---------------------------------------------------------------- brickyard
  P.brick_rows = (b, r, o) => { // adobe bricks laid flat to dry, in rows (length × rows)
    const len = o.length || 5, rows = o.rows || 3, bc = col(0xa88460, 0.04, r);
    b.t('adobe');
    for (let j = 0; j < rows; j++) for (let x = -len / 2 + 0.25; x <= len / 2 - 0.2; x += 0.5) if (!r.chance(0.08)) b.box(x + r.range(-0.03, 0.03), 0.06, (j - (rows - 1) / 2) * 0.5, 0.42, 0.11, 0.3, bc.clone().offsetHSL(0, 0, (j === 0 ? -0.05 : 0) + r.range(-0.03, 0.03)), r.range(-0.05, 0.05));
    return {};
  };
  L('brick_rows', 'adobe');
  P.brick_stack = (b, r) => { // dried bricks stacked on edge in a criss-cross block
    const bc = col(0xb0906a, 0.04, r);
    b.t('adobe');
    for (let lay = 0; lay < 6; lay++) for (let k = 0; k < 4; k++) { const rot = lay % 2 ? Math.PI / 2 : 0, o2 = (k - 1.5) * 0.32; b.box(lay % 2 ? 0 : o2, 0.06 + lay * 0.12, lay % 2 ? o2 : 0, 1.2, 0.11, 0.28, bc.clone().offsetHSL(0, 0, r.range(-0.03, 0.03)), rot); }
    return {};
  };
  L('brick_stack', 'adobe');
  P.mud_pit = (b, r) => { // a shallow pit of wet mud and straw, a shovel, moulds
    b.t('dirt'); lathe(b, [[1.9, 0.0], [1.7, 0.15], [1.4, 0.05], [0, 0.02]], col(0x6a5240, 0.05, r), 0, 0, 0, 20, 'mudpit');
    b.ch('water').t('plain').cyl(0.3, 0.04, 0.2, 0.5, 0.5, 0.01, 12, col(0x5a5040)).ch('main');
    b.t('wood'); for (let k = 0; k < 3; k++) { const x = 2.2, z = -0.6 + k * 0.6; for (const [dx, dz, w2, d2] of [[0, -0.18, 0.5, 0.04], [0, 0.18, 0.5, 0.04], [-0.23, 0, 0.04, 0.36], [0, 0, 0.04, 0.36], [0.23, 0, 0.04, 0.36]]) b.box(x + dx, 0.06, z + dz, w2, 0.1, d2, col(WOOD.weathered)); }
    b.t('wood'); rod(b, [-1.9, 0.05, -0.8], [-1.1, 0.9, -0.5], 0.025, col(WOOD.fresh)); b.t('metal').box(-1.95, 0.06, -0.82, 0.22, 0.03, 0.28, col(METAL.dark), 0.4);
    return {};
  };
  L('mud_pit', 'dirt');
  P.lime_kiln = (b, r, o) => { // round stone kiln with a fire arch at the foot, smoke
    const sc = col(0xa89c88, 0.05, r);
    b.t('drystone'); lathe(b, [[1.6, 0], [1.5, 1.2], [1.25, 2.4], [1.05, 2.6], [0.8, 2.6], [0.8, 2.0]], sc, 0, 0, 0, 18, 'limek');
    b.t('plain').box(0, 0.45, 1.45, 0.7, 0.8, 0.3, col(0x1a1614));
    b.t('plain').cyl(0, 2.55, 0, 0.8, 0.8, 0.04, 14, col(0xe8e4dc)); // quicklime glow-white top
    b.t('stone'); for (let k = 0; k < 5; k++) rock(b, r, r.range(1.6, 2.6), 0.15, r.range(-1.2, 1.2), 0.3, 0.2, 0.25, col(0xd8d4c8, 0.04, r));
    if (o.lit === false) return {};
    b.ch('lamp').w(o._r ?? 9).t('plain').box(0, 0.4, 1.61, 0.5, 0.4, 0.02, 0xff7a20).w(-1).ch('main');
    return { lights: [{ at: [0, 0.6, 2.2], color: LIGHT_COL.fire, radius: 5, intensity: 1.0, kind: 'fire', flicker: true }], emitters: [{ type: 'smoke', p: [0, 2.8, 0] }] };
  };
  L('lime_kiln', 'drystone');

  // ---------------------------------------------------------------- salvage
  const crushed = (b, r, x, y, z, ry) => { // a crushed car body: flattened box with a hint of windows
    const c = col(r.pick([0x8a3a2a, 0x3a5a7a, 0x6a6a5a, 0xa8a090, 0x4a6a4a, 0x9a7a3a]), 0.08, r);
    b.t('rust').box(x, y + 0.35, z, 1.8, 0.7, 4.0, c, ry, r.range(-0.04, 0.04), r.range(-0.05, 0.05));
    b.t('plain').box(x, y + 0.62, z, 1.6, 0.12, 1.6, col(0x2a2e30), ry);
  };
  P.car_stack = (b, r, o) => { const n = o.count || r.int(2, 4); for (let k = 0; k < n; k++) crushed(b, r, r.range(-0.15, 0.15), k * 0.72, r.range(-0.2, 0.2), r.range(-0.15, 0.15)); return {}; };
  L('car_stack', 'rust');
  P.scrap_heap = (b, r, o) => { // sorted heap: metal | tires | appliances | pipes
    const k = o.kind || r.pick(['metal', 'tires', 'appliances', 'pipes']);
    if (k === 'tires') { for (let i = 0; i < 14; i++) { const lay = Math.floor(i / 5); b.t('plain').cyl(((i % 5) - 2) * 0.55 + lay * 0.25 + r.range(-0.1, 0.1), 0.12 + lay * 0.24, r.range(-0.5, 0.5), 0.36, 0.36, 0.22, 12, col(0x222220)); } return {}; }
    if (k === 'appliances') { for (let i = 0; i < 7; i++) b.t('metal').box(r.range(-1.2, 1.2), 0.45 + (i > 4 ? 0.9 : 0), r.range(-0.8, 0.8), r.range(0.6, 0.8), r.range(0.8, 1.0), r.range(0.6, 0.7), col(r.pick([0xe8e4d8, 0xd8d0b8, 0xa8b0a8, 0x8a8f8c]), 0.05, r), r.range(0, 3), r.range(-0.2, 0.2)); return {}; }
    if (k === 'pipes') { for (let i = 0; i < 16; i++) b.t('rust').cyl(r.range(-0.4, 0.4), 0.1 + Math.floor(i / 5) * 0.18, (i % 5) * 0.22 - 0.45, 0.08, 0.08, r.range(2.5, 4), 8, col(r.pick([0x6a4a3a, 0x8a8f8c, 0x5a3a2a]), 0.05, r), 0, r.range(-0.1, 0.1), Math.PI / 2); return {}; }
    b.t('rust'); for (let i = 0; i < 18; i++) b.box(r.range(-1.3, 1.3), r.range(0.1, 0.9) * (1 - Math.abs(r.range(-1, 1)) * 0.5), r.range(-1, 1), r.range(0.3, 1.2), r.range(0.05, 0.4), r.range(0.3, 1.0), col(r.pick([0x6a4a3a, 0x8a5a3a, 0x8a8f8c, 0x5a5a58]), 0.06, r), r.range(0, 3), r.range(-0.5, 0.5), r.range(-0.5, 0.5));
    return {};
  };
  L('scrap_heap', 'rust');
  P.crane = (b, r) => { // salvage boom crane on an old truck base: tower, lattice boom, cable, magnet
    const yc = col(r.pick([0xc8a040, 0xb8473a, 0x8a8f8c]), 0.06, r), dark = col(0x2a2826);
    b.t('rust').box(0, 0.7, 0, 2.4, 1.0, 5.0, col(0x5a4a3a)); for (const [x, z] of [[-1.1, -1.8], [1.1, -1.8], [-1.1, 1.8], [1.1, 1.8]]) b.t('plain').cyl(x, 0.45, z, 0.45, 0.45, 0.35, 12, col(0x222220), 0, 0, Math.PI / 2);
    b.t('metal').box(0, 1.6, -0.8, 1.8, 0.8, 1.8, yc).box(0, 2.3, -0.8, 1.2, 0.7, 1.2, yc);
    const A = [0, 2.2, 0], B = [0, 8.5, 6.0];
    b.t('metal'); for (const sd of [-1, 1]) rod(b, [sd * 0.3, A[1], A[2]], [sd * 0.12, B[1], B[2]], 0.06, yc, 6);
    for (let k = 0; k < 10; k++) { const t0 = k / 10, t1 = (k + 1) / 10, P2 = (t, sd) => [sd * (0.3 - 0.18 * t), A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; rod(b, P2(t0, -1), P2(t1, 1), 0.025, yc, 4); }
    b.t('plain'); rod(b, B, [0, 3.0, 6.0], 0.02, dark, 4);
    b.t('metal').cyl(0, 2.85, 6.0, 0.6, 0.6, 0.25, 14, dark);
    return {};
  };
  L('crane', 'metal');

  // ---------------------------------------------------------------- arenas
  P.palenque = (b, r, o) => { // cock-fight ring: sand pit with a padded curb, tiers of benches, a conical tin roof on posts
    const R = o.radius || 5.5, wc = col(WOOD.weathered, 0.05, r);
    b.t('sand').cyl(0, 0.04, 0, 1.6, 1.6, 0.08, 18, col(0xd8c8a0));
    b.t('plaster'); lathe(b, [[1.75, 0], [1.75, 0.55], [1.6, 0.55], [1.6, 0]], col(r.pick([0xa83a32, 0x2f6a8a, 0xe8e2d4]), 0.04, r), 0, 0, 0, 20, 'palring');
    b.t('wood'); for (let t = 0; t < 4; t++) { const rr = 2.6 + t * 0.8, y = 0.45 + t * 0.45; lathe(b, [[rr + 0.4, y - 0.06], [rr + 0.4, y], [rr - 0.1, y], [rr - 0.1, y - 0.06]], wc, 0, 0, 0, 24); lathe(b, [[rr - 0.1, 0], [rr - 0.1, y - 0.06], [rr - 0.14, y - 0.06], [rr - 0.14, 0]], wc.clone().offsetHSL(0, 0, -0.08), 0, 0, 0, 24); }
    b.t('bark'); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.cyl(Math.cos(a) * (R + 0.3), 1.8, Math.sin(a) * (R + 0.3), 0.08, 0.1, 3.6, 6, col(WOOD.pole)); }
    b.t('corrugated'); lathe(b, [[R + 1.0, 3.5], [R * 0.5, 4.6], [0.4, 5.1], [0, 5.15]], col(r.pick(ROOF.corrugated), 0.05, r), 0, 0, 0, 10, 'palroof');
    return { lights: [{ at: [0, 3.5, 0], color: LIGHT_COL.incandescent, radius: 9, intensity: 1.0, kind: 'lamp', flicker: false }] };
  };
  L('palenque', 'wood');
  P.bleachers = (b, r, o) => { // stepped wooden stands (length)
    const len = o.length || 8, wc = col(WOOD.weathered, 0.05, r);
    b.t('wood');
    for (let t = 0; t < 4; t++) { b.box(0, 0.45 + t * 0.45, t * 0.7, len, 0.06, 0.4, wc); b.box(0, 0.22 + t * 0.45, t * 0.7 - 0.25, len, 0.04, 0.3, wc.clone().offsetHSL(0, 0, -0.06)); }
    for (let x = -len / 2 + 0.2; x <= len / 2; x += 2) { b.box(x, 0.95, 1.05, 0.1, 1.9, 0.1, wc); b.plank([x, 0.05, -0.3], [x, 1.85, 2.2], 0.08, 0.14, wc); }
    return {};
  };
  L('bleachers', 'wood');
  P.trellis = (b, r, o) => { // a vine row: posts every 2.5 m, two wires (vines are separate plants)
    const len = o.length || 10, pc = col(WOOD.weathered, 0.06, r);
    b.t('wood'); for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.max(1, Math.round(len / 2.5))) b.box(x, 0.65, 0, 0.08, 1.3, 0.08, pc, 0, 0, r.range(-0.04, 0.04));
    b.t('plain'); for (const y of [0.7, 1.15]) b.beam([-len / 2, y, 0], [len / 2, y, 0], 0.008, 3, col(0x5a5a58));
    return {};
  };
  L('trellis', 'wood');
  P.flagpole = (b, r, o) => { // settlement flag (no national flags): spec flag or the place's rag banner
    const H = o.height || 7;
    b.t('concrete').box(0, 0.2, 0, 0.8, 0.4, 0.8, col(0xc8c0b0));
    b.t('metal').cyl(0, H / 2, 0, 0.05, 0.07, H, 8, col(METAL.steel)).cyl(0, H + 0.05, 0, 0.08, 0.08, 0.1, 8, col(0xc8a040));
    const d = typeof o.flag === 'string' && !o.flag.startsWith('#') ? flagDesign(o.flag) : o.flag ? { aspect: 1.6, shape: 'rect', f: () => col(o.flag) } : flagDesign('settlement');
    drawFlag(b, d, H - 0.1, 1.3, r, d.shape === 'rect' ? { nx: 26, ny: 16 } : {});
    return {};
  };
  P.banner = (b, r, o) => { // Red Misionera gonfalon hanging from a crossbar on a wooden pole
    const H = o.height || 4.2, wc = col(WOOD.weathered, 0.05, r);
    b.t('bark').cyl(0, H / 2, 0, 0.06, 0.075, H, 7, wc);
    b.t('wood').box(0, H - 0.25, 0.08, 1.3, 0.06, 0.06, wc).box(0, H + 0.12, 0, 0.05, 0.25, 0.05, wc);
    b.pushT(0, 0, 0.12, 0); drawFlag(b, flagDesign(o.flag || 'misionera'), H - 0.28, 1.7, r, { nx: 10, ny: 16, ripple: 0.05 }); b.pop();
    b.t('stone').box(0, 0.12, 0, 0.5, 0.24, 0.5, col(0xb8ac98, 0.04, r));
    return {};
  };
  P.pennant = (b, r, o) => { // Hermandad del Camino pennant on a tall pole
    const H = o.height || 5.5;
    b.t('bark').cyl(0, H / 2, 0, 0.05, 0.07, H, 7, col(WOOD.pole, 0.05, r));
    b.t('plain').blob(0, 0.15, 0, 0.6, 0.3, 0.6, col(0x9a8c70, 0.05, r), 'dodec');
    drawFlag(b, flagDesign(o.flag || 'hermandad'), H - 0.1, 0.8, r, { nx: 22, ny: 9 });
    return {};
  };
  L('banner', 'wood'); L('pennant', 'wood');
  L('flagpole', 'metal');

  // ---------------------------------------------------------------- pre-war layer
  P.checkpoint_ruin = (b, r) => { // army checkpoint: concrete booth, broken boom, jersey blocks, sandbag walls, a dead sign
    const cc = col(0x9a948a, 0.04, r), olive = col(0x4a5038, 0.05, r);
    b.t('concrete').box(-3, 1.2, 0, 2.2, 2.4, 2.2, cc).box(-3, 2.5, 0, 2.6, 0.2, 2.6, cc.clone().offsetHSL(0, 0, -0.05));
    b.t('plain').box(-3, 1.5, 1.11, 1.4, 0.7, 0.03, col(0x1a1c1e)).box(-1.89, 1.0, 0, 0.03, 1.9, 0.8, col(0x1a1c1e));
    b.t('metal').box(-1.6, 0.6, 0, 0.3, 1.2, 0.3, col(0x8a8f8c)); b.box(0.2, 1.05, 0, 3.4, 0.12, 0.12, col(0xe8e4d8), 0, 0, -0.35); b.box(2.0, 0.3, 0.5, 1.6, 0.1, 0.1, col(0xc83a2a), 0.6);
    b.t('concrete'); for (const [x, z, ry] of [[3.5, -2, 0.1], [5.2, -1.6, 0.25], [3.6, 2.4, -0.2]]) b.box(x, 0.4, z, 2.0, 0.8, 0.6, cc, ry, 0, r.range(-0.1, 0.1));
    b.t('fabric'); for (let k = 0; k < 9; k++) { if (r.chance(0.25)) continue; const x = -5.6 + (k % 3) * 0.8, y = 0.2 + Math.floor(k / 3) * 0.3; ellip(b, x, y, -2.4, 0.42, 0.16, 0.25, col(0x8a7a5a, 0.05, r)); }
    b.t('metal').box(-6.2, 1.2, 1.5, 0.08, 2.4, 0.08, olive);
    return { signs: [{ text: 'ALTO\nPUESTO MILITAR', x: -6.2, y: 2.1, z: 1.56, ry: 0, w: 1.4, h: 0.8, style: 'prewar', opts: { rust: true, missing: 0.25 } }] };
  };
  L('checkpoint_ruin', 'concrete');
  P.substation = (b, r, o) => { // Poseidon substation: gravel pad, transformers, insulator frames, busbars, control hut, fence
    const steel = col(0x8a8f8c, 0.04, r), dark = col(0x3a3e40), tc = col(0x6a7a6a, 0.04, r), W2 = 12, D2 = 9;
    b.t('gravel').box(0, 0.03, 0, W2, 0.06, D2, col(0x9a948a));
    for (const x of [-3, 0.5]) { b.t('metal').box(x, 1.2, -1.5, 2.2, 2.0, 1.6, tc); for (let k = 0; k < 6; k++) b.box(x - 0.9 + k * 0.36, 1.2, -0.65, 0.05, 1.8, 0.15, tc.clone().offsetHSL(0, 0, -0.05)); for (const dx of [-0.6, 0, 0.6]) { b.t('plain').cyl(x + dx, 2.5, -1.5, 0.09, 0.12, 0.6, 10, col(0x8a5a3a)); } }
    b.t('metal'); for (const x of [-4.5, 2, 4.5]) { for (const sd of [-1, 1]) b.box(x + sd * 1.2, 2.5, 2, 0.15, 5, 0.15, steel); b.box(x, 5.0, 2, 2.6, 0.18, 0.18, steel); for (const dx of [-0.8, 0, 0.8]) b.t('plain').cyl(x + dx, 4.7, 2, 0.06, 0.08, 0.5, 8, col(0xc8d0c8)); b.t('metal'); }
    b.t('metal'); for (const dx of [-0.8, 0, 0.8]) b.beam([-4.5 + dx, 4.5, 2], [4.5 + dx, 4.5, 2], 0.04, 4, dark);
    b.t('concrete').box(4.2, 1.3, -2.8, 3, 2.6, 2.4, col(0xb0a898)); b.t('plain').box(4.2, 1.0, -1.58, 0.9, 2.0, 0.04, col(0x3a4a5a));
    b.t('metal'); for (const [a, c2] of [[[-W2 / 2, -D2 / 2], [W2 / 2, -D2 / 2]], [[W2 / 2, -D2 / 2], [W2 / 2, D2 / 2]], [[W2 / 2, D2 / 2], [-W2 / 2, D2 / 2]], [[-W2 / 2, D2 / 2], [-W2 / 2, -D2 / 2]]]) {
      const L2 = Math.hypot(c2[0] - a[0], c2[1] - a[1]), n = Math.round(L2 / 3);
      for (let k = 0; k <= n; k++) b.cyl(a[0] + ((c2[0] - a[0]) * k) / n, 1.1, a[1] + ((c2[1] - a[1]) * k) / n, 0.04, 0.04, 2.2, 6, steel);
      b.ch('glass').w(0.15).t('plain').box((a[0] + c2[0]) / 2, 1.05, (a[1] + c2[1]) / 2, a[0] === c2[0] ? 0.02 : L2, 2.0, a[0] === c2[0] ? L2 : 0.02, col(0x6a6e70)).w(-1).ch('main').t('metal');
    }
    return { signs: [{ text: o.text || 'POSEIDON ENERGY\nSUBESTACIÓN 12', x: -3, y: 1.6, z: D2 / 2 + 0.05, ry: 0, w: 2.6, h: 0.9, style: 'prewar', opts: { rust: true, missing: 0.15 } }, { text: 'PELIGRO\nALTO VOLTAJE', x: 3, y: 1.4, z: D2 / 2 + 0.05, ry: 0, w: 1.2, h: 0.7, style: 'painted', opts: { bg: '#d8c040' } }] };
  };
  L('substation', 'metal');
  P.nuka_vending = (b, r, o) => {
    const body = col(o.color || 0xb02a22, 0.04, r);
    b.t('metal').box(0, 0.95, 0, 1.0, 1.9, 0.8, body).box(0, 1.92, 0, 1.04, 0.08, 0.84, col(0xe8e4d8));
    b.ch('lamp').w(o._r ?? 9).t('plain').box(-0.15, 1.15, 0.41, 0.55, 0.8, 0.02, 0xd8f0e8).w(-1).ch('main');
    b.t('metal').box(0.33, 1.1, 0.42, 0.16, 0.5, 0.03, col(0x3a3a3a)).box(0, 0.3, 0.42, 0.7, 0.2, 0.03, col(0x2a2a2a));
    return { signs: [{ text: o.brand || 'PAPI COLA', x: 0, y: 1.7, z: 0.42, ry: 0, w: 0.9, h: 0.24, style: 'prewar', opts: { rust: true, missing: 0.1 } }] };
  };
  L('nuka_vending', 'metal');
  P.robco_vending = (b, r, o) => P.nuka_vending(b, r, { ...o, color: o.color || 0x3a5a7a, brand: 'ANTHROPIC' });
  L('robco_vending', 'metal');
  P.nuka_crates = (b, r) => { // stacked bottle crates, a few bottles
    for (let k = 0; k < 6; k++) { const lay = Math.floor(k / 3); b.t('wood').box((k % 3) * 0.5 - 0.5 + lay * 0.25, 0.16 + lay * 0.32, r.range(-0.05, 0.05), 0.46, 0.3, 0.34, col(r.pick([0xb02a22, 0x8a6a3a, 0xc8a040]), 0.06, r), r.range(-0.1, 0.1)); }
    b.t('plain'); for (let k = 0; k < 5; k++) b.cyl(r.range(-0.6, 0.6), 0.12, 0.45 + r.range(0, 0.2), 0.035, 0.035, 0.22, 8, col(0x2a4a3a), Math.PI / 2, r.range(0, 3), 0);
    return {};
  };
  L('nuka_crates', 'wood');
  // ---------------------------------------------------------------- leafy kit as cards
  P.potted_plant = (b, r, o) => { pottedPlant(b, r, 0, 0, 0, true, o.kind ? { kind: o.kind } : {}); return {}; };
  L('potted_plant', 'plain');
  P.hedge = (b, r, o) => { // clipped hedge / oleander row: a soil strip and overlapping shrub cards
    const len = o.length || 3, h = o.height || 1.2;
    b.t('dirt').box(0, 0.02, 0, len, 0.04, 0.7, col(0x5a4632));
    for (let x = -len / 2 + 0.35; x <= len / 2 - 0.3; x += 0.55) plant(b, r.chance(0.25) && !o.plain ? 'bougainvillea' : 'shrub', x + r.range(-0.08, 0.08), 0, r.range(-0.06, 0.06), h * r.range(0.9, 1.1), r);
    return {};
  };
  L('hedge', 'dirt');
  P.hedge_dead = (b, r, o) => { const len = o.length || 3; for (let x = -len / 2 + 0.3; x <= len / 2; x += 0.5) plant(b, 'weed', x, 0, r.range(-0.1, 0.1), r.range(0.8, 1.2), r); return {}; };
  L('hedge_dead', 'plain');
  void tube; void WOOD; void MARIGOLD; void FLOWER;
}

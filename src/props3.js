// Prop pass 3: the Mexican well (town / rural / pre-war), street life (carts, stands, chores, animals,
// kids, leisure, faith), street furniture (benches, bandstand, pre-war street kit), infrastructure (tanks,
// pipes, rain barrels, scrap wind turbine), notice boards and edge defences. Front = +Z.
import { plantRow } from './foliage.js';
import { col } from './builder.js';
import { WOOD, METAL, MISC } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { ellip, rod, lathe, ring, tube, rock } from './shapes.js';

const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const PAINT = [0xa83a32, 0x2f6a8a, 0x3a7a5a, 0xc8a040, 0xd8d0c0, 0x6a4a8a, 0xd86a30];
const WEALTH = { poor: 0, struggling: 0, average: 1, comfortable: 2, prosperous: 2, wealthy: 3, rich: 3 };

export function addLifeProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // ---------------------------------------------------------------- the well, three ways
  // town: whitewashed round curb with a Talavera tile rim, wrought-iron arch, pulley · rural: fieldstone
  // or adobe curb, forked mesquite posts with a crossbar · prewar: concrete slab + casing, cast-iron pump
  P.well = (b, r, o) => {
    const w = WEALTH[o._set?.wealth] ?? 1;
    const v = o.variant || r.weighted({ town: w >= 2 ? 3 : w === 1 ? 1.2 : 0.2, rural: w <= 0 ? 3 : w === 1 ? 1.5 : 0.4, prewar: 0.5 });
    const R = o.radius || 0.85;
    if (v === 'prewar') {
      const cc = col(0xa8a296, 0.03, r);
      b.t('concrete').box(0, 0.12, 0, 2.0, 0.24, 2.0, cc);
      lathe(b, [[R * 0.7, 0.24], [R * 0.7, 0.62], [R * 0.78, 0.62], [R * 0.78, 0.24]], cc.clone().offsetHSL(0, 0, 0.04), 0, 0, 0, 24, 'pwcasing');
      b.t('concrete').cyl(0, 0.64, 0, R * 0.8, R * 0.8, 0.06, 24, cc.clone().offsetHSL(0, 0, -0.05));
      const iron = col(o.pumpColor || r.pick([0x2a3a2e, 0x3a3a3a, 0x6a2a22]), 0.04, r);
      b.t('metal');
      lathe(b, [[0.16, 0], [0.12, 0.06], [0.1, 0.1], [0.1, 0.9], [0.13, 0.95], [0.13, 1.05], [0.08, 1.12], [0, 1.16]], iron, 0, 0.67, 0, 14, 'pumpbody');
      rod(b, [0, 1.25, 0.06], [0, 1.15, 0.38], 0.05, iron); rod(b, [0, 1.15, 0.38], [0, 1.05, 0.42], 0.045, iron); // spout
      rod(b, [0, 1.85, -0.05], [0, 1.75, -0.75], 0.03, iron); rod(b, [0, 1.75, -0.75], [0, 1.6, -0.95], 0.03, iron); // handle
      rod(b, [0, 1.85, -0.05], [0, 1.72, 0.02], 0.025, iron);
      b.t('rust').cyl(0, 0.79, 0.45, 0.16, 0.13, 0.26, 12, col(0x7a5a3a, 0.05, r)); // a bucket under the spout
      return {};
    }
    if (v === 'rural') {
      const adobe = r.chance(0.4), sc = col(adobe ? 0xb08a64 : 0x9c917e, 0.05, r);
      b.t(adobe ? 'adobe' : 'drystone');
      lathe(b, [[R, 0], [R, 0.72], [R * 0.82, 0.75], [R * 0.78, 0.72], [R * 0.78, 0.2]], sc, 0, 0, 0, 20);
      if (!adobe) for (let k = 0; k < 9; k++) { const a = r.range(0, 6.28); rock(b, r, Math.cos(a) * (R + 0.01), r.range(0.15, 0.65), Math.sin(a) * (R + 0.01), 0.15, 0.09, 0.1, sc.clone().offsetHSL(0, 0, r.range(-0.06, 0.06)), r.range(0, 3)); }
      b.t('plain').cyl(0, 0.3, 0, R * 0.77, R * 0.77, 0.04, 20, 0x141c1e);
      b.ch('water').cyl(0, 0.36, 0, R * 0.76, R * 0.76, 0.02, 20, MISC.water).ch('main');
      // forked mesquite posts, a crossbar log, rope and a bucket (or a cut-down can)
      const mc = col(0x5a4632, 0.06, r);
      b.t('bark');
      for (const sd of [-1, 1]) {
        const x = sd * (R + 0.12);
        tube(b, [[x, -0.2, 0], [x + sd * 0.04, 1.0, 0.03], [x, 1.6, 0]], [0.09, 0.08, 0.07], mc, { seg: 8, cap: false });
        tube(b, [[x, 1.55, 0], [x + 0.14, 1.95, 0.05]], [0.06, 0.045], mc, { seg: 7 });
        tube(b, [[x, 1.55, 0], [x - 0.14, 1.95, -0.04]], [0.06, 0.045], mc, { seg: 7 });
      }
      tube(b, [[-R - 0.35, 1.78, 0], [R + 0.35, 1.8, 0]], [0.08, 0.075], col(0x6a543c, 0.05, r), { seg: 10, cap: false });
      b.t('plain'); rod(b, [0.05, 1.72, 0], [0.05, 1.05, 0], 0.012, col(0x8a7a58), 5);
      b.t(r.chance(0.5) ? 'wood' : 'rust'); lathe(b, [[0.12, 0], [0.15, 0.28], [0.14, 0.28]], col(r.pick([WOOD.fresh, 0x7a5a3a]), 0.05, r), 0.05, 0.78, 0, 12, 'rbucket');
      return {};
    }
    // town well: whitewashed curb, a band of Talavera tiles under the cap, wrought-iron arch with a pulley
    const wc = col(0xeeeadf, 0.02, r);
    b.t('limewash');
    lathe(b, [[R + 0.12, 0], [R + 0.12, 0.12], [R, 0.16], [R, 0.78], [R * 0.82, 0.8], [R * 0.8, 0.2]], wc, 0, 0, 0, 28, 'twcurb');
    b.t('azulejo'); lathe(b, [[R + 0.015, 0.5], [R + 0.015, 0.74]], col(0x8a9ab8), 0, 0, 0, 28, 'twtile');
    b.t('stone'); lathe(b, [[R * 0.8, 0.8], [R + 0.08, 0.8], [R + 0.1, 0.86], [R + 0.08, 0.9], [R * 0.8, 0.9]], col(0xd8ccb4, 0.03, r), 0, 0, 0, 28, 'twcap');
    b.t('plain').cyl(0, 0.3, 0, R * 0.79, R * 0.79, 0.04, 24, 0x141c1e);
    b.ch('water').cyl(0, 0.36, 0, R * 0.78, R * 0.78, 0.02, 24, MISC.water).ch('main');
    const iron = col(0x22201e);
    b.t('metal');
    for (const sd of [-1, 1]) rod(b, [sd * (R - 0.02), 0.88, 0], [sd * (R - 0.02), 1.9, 0], 0.035, iron, 8);
    // the arch: a vertical half-hoop of short rods
    for (let k = 0; k < 10; k++) { const a0 = (k / 10) * Math.PI, a1 = ((k + 1) / 10) * Math.PI; rod(b, [Math.cos(a0) * (R - 0.02), 1.9 + Math.sin(a0) * 0.55, 0], [Math.cos(a1) * (R - 0.02), 1.9 + Math.sin(a1) * 0.55, 0], 0.03, iron, 6); }
    b.t('metal').cyl(0, 2.3, 0, 0.13, 0.13, 0.05, 14, col(METAL.dark), Math.PI / 2, 0, 0); // pulley wheel
    rod(b, [0, 2.45, 0], [0, 2.3, 0], 0.02, iron);
    b.t('plain'); rod(b, [0.12, 2.28, 0], [0.12, 1.1, 0], 0.01, col(0x8a7a58), 5);
    b.t('metal'); lathe(b, [[0.11, 0], [0.14, 0.24], [0.13, 0.24]], col(0x8a8f8c), 0.12, 0.86, 0, 12, 'tbucket');
    return {};
  };

  // ---------------------------------------------------------------- street food
  P.food_cart = (b, r, o) => { // taco cart: box on two bicycle wheels, glass case, comal, umbrella
    const pc = col(r.pick(PAINT), 0.05, r), steel = col(METAL.steel, 0.04, r);
    b.t('metal').box(0, 0.95, 0, 1.6, 0.7, 0.8, pc).box(0, 1.31, 0, 1.66, 0.04, 0.86, steel);
    b.t('plain'); for (const sd of [-1, 1]) b.cyl(0.3, 0.42, sd * 0.47, 0.4, 0.4, 0.04, 18, col(0x222220), Math.PI / 2, 0, 0);
    b.t('metal').box(-0.82, 0.62, 0, 0.06, 0.06, 0.6, steel).box(-0.95, 0.35, 0, 0.06, 0.6, 0.06, steel);
    b.ch('glass').w(0.5).t('plain').box(0.35, 1.52, 0, 0.8, 0.38, 0.6, col(0xb8c8c8)).w(-1).ch('main');
    b.t('metal').cyl(-0.4, 1.36, 0, 0.32, 0.32, 0.04, 14, col(0x2a2826));
    b.t('metal').cyl(0.75, 1.9, 0.3, 0.02, 0.02, 1.2, 6, steel);
    b.t('fabric').cone(0.75, 2.45, 0.3, 1.1, 0.4, 8, col(r.pick([0xe8e0d0, 0xa83a32, 0x2f6a8a, 0xd8a040]), 0.04, r));
    if (o.sign !== false) return { signs: [{ text: r.pick(['TACOS', 'TORTAS', 'ELOTES', 'TAMALES', 'HOT DOGS']), x: 0, y: 0.95, z: 0.41, ry: 0, w: 1.2, h: 0.4, style: 'painted' }] };
    return {};
  };
  L('food_cart', 'metal');
  P.agua_fresca = (b, r, o) => { // stand: table, three big glass jars of agua fresca, a parasol
    const tc = col(r.pick(PAINT), 0.05, r);
    b.t('wood').box(0, 0.78, 0, 1.4, 0.05, 0.6, tc); for (const [x, z] of [[-0.62, -0.25], [0.62, -0.25], [-0.62, 0.25], [0.62, 0.25]]) b.box(x, 0.38, z, 0.05, 0.76, 0.05, tc);
    const juice = [0xd8402a, 0xe8d8b0, 0x6aa040, 0xe89030, 0x8a2a5a];
    for (let k = 0; k < 3; k++) { const x = -0.42 + k * 0.42; b.t('plain').cyl(x, 0.98, 0, 0.15, 0.13, 0.36, 12, col(r.pick(juice), 0.05, r)); b.ch('glass').w(0.3).cyl(x, 1.0, 0, 0.17, 0.15, 0.42, 12, col(0xd8e4e4)).w(-1).ch('main'); b.t('plain').cyl(x, 1.23, 0, 0.08, 0.08, 0.04, 10, col(0x3a3a3a)); }
    b.t('metal').cyl(0.75, 1.15, -0.3, 0.02, 0.02, 2.3, 6, col(METAL.dark));
    b.t('fabric').cone(0.75, 2.2, -0.3, 1.1, 0.4, 8, col(r.pick([0xe8e0d0, 0xa83a32, 0x3a7a5a]), 0.04, r));
    return { signs: [{ text: r.pick(['AGUAS FRESCAS', 'AGUAS', 'JAMAICA · HORCHATA']), x: 0, y: 0.6, z: 0.31, ry: 0, w: 1.2, h: 0.3, style: 'painted' }] };
  };
  L('agua_fresca', 'wood');

  // ---------------------------------------------------------------- chores
  P.pila = (b, r) => { // concrete laundry basin: washboard slab + tank
    const cc = col(r.pick([0xb8b2a6, 0x9fb0a8, 0xd0c8b8]), 0.04, r);
    b.t('concrete').box(0, 0.45, 0, 1.2, 0.9, 0.7, cc);
    b.t('concrete').box(-0.3, 0.92, 0.05, 0.55, 0.06, 0.55, cc.clone().offsetHSL(0, 0, -0.04), 0, -0.12);
    for (let k = 0; k < 6; k++) b.box(-0.3, 0.96 - k * 0.012, -0.15 + k * 0.07, 0.5, 0.02, 0.02, cc.clone().offsetHSL(0, 0, -0.08));
    b.ch('water').t('plain').box(0.3, 0.86, 0, 0.5, 0.02, 0.55, col(0x4a6a6a)).ch('main');
    b.t('plain').cyl(0.3, 0.98, -0.25, 0.02, 0.02, 0.3, 6, col(METAL.dark));
    return {};
  };
  L('pila', 'concrete');
  P.ollas = (b, r) => { // clay water pots: a big olla on a wooden stand, smaller ones round it
    b.t('wood'); for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]]) b.box(x, 0.3, z, 0.05, 0.6, 0.05, col(WOOD.weathered));
    b.box(0, 0.6, 0, 0.6, 0.04, 0.6, col(WOOD.weathered));
    b.t('plain'); lathe(b, [[0.08, 0], [0.26, 0.15], [0.3, 0.3], [0.22, 0.52], [0.12, 0.6], [0.14, 0.66], [0.12, 0.66]], col(r.pick(TERRA), 0.05, r), 0, 0.62, 0, 16, 'olla');
    for (let k = 0; k < 3; k++) { const a = r.range(0, 6.28), s = r.range(0.5, 0.8); lathe(b, [[0.06 * s, 0], [0.22 * s, 0.12 * s], [0.25 * s, 0.25 * s], [0.18 * s, 0.42 * s], [0.1 * s, 0.48 * s]], col(r.pick(TERRA), 0.05, r), Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65, 14); }
    return {};
  };
  L('ollas', 'plain');
  P.drum_stove = (b, r, o) => { // oil-drum stove with a comal and a chimney pipe
    b.t('rust'); lathe(b, [[0.3, 0], [0.3, 0.85], [0.29, 0.86]], col(0x6a4a3a, 0.05, r), 0, 0, 0, 16, 'drum');
    b.t('plain').box(0, 0.25, 0.29, 0.3, 0.22, 0.02, col(0x1a1614));
    b.t('metal').cyl(0, 0.88, 0, 0.42, 0.42, 0.03, 16, col(0x2a2826)).cyl(0.2, 1.4, -0.2, 0.07, 0.07, 1.1, 8, col(0x3a3836));
    if (o.lit === false) return {};
    b.ch('lamp').w(o._r ?? 9).t('plain').box(0, 0.25, 0.3, 0.24, 0.14, 0.01, 0xff8a30).w(-1).ch('main');
    return { lights: [{ at: [0, 0.4, 0.5], color: LIGHT_COL.fire, radius: 4, intensity: 0.8, kind: 'fire', flicker: true }], emitters: [{ type: 'smoke', p: [0.2, 2.0, -0.2], small: true }] };
  };
  L('drum_stove', 'rust');

  // ---------------------------------------------------------------- animals (front = +Z)
  const quad = (b, r, o, s) => { // generic small four-legged animal
    const hide = col(o.color || r.pick(s.colors), 0.06, r), dark = hide.clone().offsetHSL(0, 0, -0.15);
    const H = s.h, Lb = s.len, Wb = s.w;
    b.t('hide');
    ellip(b, 0, H, 0, Wb, s.depth, Lb, hide);
    const graze = r.chance(0.35);
    const hz = Lb * 0.95, hy = graze ? H * 0.45 : H + s.depth * 0.7;
    rod(b, [0, H + s.depth * 0.3, Lb * 0.7], [0, hy, hz], s.neck, hide, 8);
    ellip(b, 0, hy, hz + s.head * 0.5, s.head * 0.55, s.head * 0.5, s.head, hide);
    for (const [x, z] of [[-Wb * 0.55, Lb * 0.6], [Wb * 0.55, Lb * 0.6], [-Wb * 0.55, -Lb * 0.6], [Wb * 0.55, -Lb * 0.6]]) rod(b, [x, H - s.depth * 0.4, z], [x, 0.02, z], s.leg, dark, 6);
    return { hide, dark, hy, hz };
  };
  P.goat = (b, r, o) => {
    const q = quad(b, r, o, { h: 0.55, len: 0.42, w: 0.17, depth: 0.2, neck: 0.06, head: 0.18, leg: 0.03, colors: [0xe8e0d0, 0x6a4a32, 0x2a2420, 0xb89a70, 0x8a6a4a] });
    b.t('plain'); for (const sd of [-1, 1]) rod(b, [sd * 0.05, q.hy + 0.08, q.hz + 0.05], [sd * 0.08, q.hy + 0.22, q.hz - 0.08], 0.015, col(0x3a3430));
    rod(b, [0, 0.62, -0.42], [0, 0.72, -0.5], 0.03, q.hide); // tail
    return {};
  };
  L('goat', 'hide');
  P.pig = (b, r, o) => {
    const hide = col(o.color || r.pick([0xd8a898, 0xc89888, 0x4a3a34, 0x8a6a5a]), 0.05, r);
    b.t('hide'); ellip(b, 0, 0.42, 0, 0.3, 0.28, 0.55, hide); ellip(b, 0, 0.4, 0.55, 0.2, 0.2, 0.2, hide);
    b.t('plain').cyl(0, 0.38, 0.75, 0.08, 0.09, 0.06, 10, hide.clone().offsetHSL(0, 0, 0.05), Math.PI / 2, 0, 0);
    for (const [x, z] of [[-0.16, 0.32], [0.16, 0.32], [-0.16, -0.32], [0.16, -0.32]]) rod(b, [x, 0.25, z], [x, 0.02, z], 0.05, hide.clone().offsetHSL(0, 0, -0.1), 6);
    return {};
  };
  L('pig', 'hide');
  P.dog = (b, r, o) => {
    const lie = r.chance(0.4), hide = col(o.color || r.pick([0xb8905a, 0x2a2420, 0x8a6a4a, 0xd8c8a8, 0x6a5040]), 0.06, r);
    b.t('hide');
    if (lie) { ellip(b, 0, 0.16, 0, 0.18, 0.15, 0.38, hide); ellip(b, 0, 0.18, 0.42, 0.11, 0.1, 0.15, hide); rod(b, [0, 0.14, -0.38], [0.18, 0.06, -0.62], 0.03, hide); return {}; }
    quad(b, r, { color: hide.getHex() }, { h: 0.42, len: 0.32, w: 0.13, depth: 0.14, neck: 0.05, head: 0.15, leg: 0.03, colors: [hide.getHex()] });
    rod(b, [0, 0.48, -0.32], [0, 0.58, -0.5], 0.025, hide);
    return {};
  };
  L('dog', 'hide');
  P.burro = (b, r, o) => {
    const q = quad(b, r, o, { h: 0.95, len: 0.62, w: 0.24, depth: 0.3, neck: 0.1, head: 0.3, leg: 0.05, colors: [0x7a7268, 0x8a7a6a, 0x5a5048, 0x9a8a78] });
    b.t('plain'); for (const sd of [-1, 1]) rod(b, [sd * 0.06, q.hy + 0.12, q.hz + 0.05], [sd * 0.12, q.hy + 0.42, q.hz - 0.02], 0.035, q.hide);
    if (r.chance(0.5)) { b.t('fabric'); for (const sd of [-1, 1]) b.box(sd * 0.3, 1.0, 0, 0.18, 0.4, 0.5, col(r.pick([0x8a6a4a, 0x6a5a3a, 0xa83a32]), 0.05, r)); } // panniers
    return {};
  };
  L('burro', 'hide');

  // ---------------------------------------------------------------- kids, leisure, faith
  P.tire_swing = (b, r) => {
    const mc = col(0x5a4632, 0.06, r);
    b.t('bark');
    for (const sd of [-1, 1]) { rod(b, [sd * 1.0, 0, -0.5], [sd * 0.85, 2.4, 0], 0.07, mc); rod(b, [sd * 1.0, 0, 0.5], [sd * 0.85, 2.4, 0], 0.07, mc); }
    rod(b, [-1.0, 2.42, 0], [1.0, 2.42, 0], 0.07, mc);
    b.t('plain'); rod(b, [0, 2.4, 0], [0, 0.85, 0], 0.012, col(0x8a7a58), 5);
    b.cyl(0, 0.62, 0, 0.32, 0.32, 0.18, 14, col(0x222220), Math.PI / 2, 0, 0);
    return {};
  };
  L('tire_swing', 'bark');
  P.toys = (b, r) => { // a ball, a wooden toy truck, a hoop
    b.t('plain'); ellip(b, 0.3, 0.11, 0.2, 0.11, 0.11, 0.11, col(r.pick([0xa83a32, 0x2f6a8a, 0xd8a040])));
    b.t('wood').box(-0.2, 0.1, 0, 0.35, 0.1, 0.18, col(r.pick(PAINT), 0.05, r)).box(-0.28, 0.2, 0, 0.12, 0.1, 0.16, col(r.pick(PAINT), 0.05, r));
    b.t('plain'); for (const [x, z] of [[-0.32, -0.1], [-0.08, -0.1], [-0.32, 0.1], [-0.08, 0.1]]) b.cyl(x, 0.05, z, 0.04, 0.04, 0.03, 8, col(0x222220), Math.PI / 2, 0, 0);
    return {};
  };
  L('toys', 'plain');
  P.domino_table = (b, r) => { // card table, four chairs, a game laid out
    const tc = col(r.pick([0xc8a040, 0xa83a32, 0x2f6a8a, 0xd8d0c0, WOOD.weathered]), 0.04, r);
    b.t('wood').box(0, 0.74, 0, 0.9, 0.04, 0.9, tc); for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]]) b.box(x, 0.36, z, 0.04, 0.72, 0.04, tc);
    b.t('plain'); for (let k = 0; k < 9; k++) b.box(r.range(-0.3, 0.3), 0.77, r.range(-0.3, 0.3), 0.05, 0.015, 0.1, col(0xf0ece2), r.range(0, 3.14));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2, x = Math.cos(a) * 0.75, z = Math.sin(a) * 0.75, ry = Math.atan2(-x, -z); if (r.chance(0.2)) continue; b.t('plain').box(x, 0.44, z, 0.42, 0.05, 0.42, tc, ry); b.box(x - Math.sin(ry) * 0.2, 0.7, z - Math.cos(ry) * 0.2, 0.42, 0.5, 0.04, tc, ry); b.box(x, 0.22, z, 0.36, 0.44, 0.36, tc.clone().offsetHSL(0, 0, -0.12), ry); }
    return {};
  };
  L('domino_table', 'wood');
  P.hammock = (b, r) => { // between two posts
    const pc = col(WOOD.pole, 0.05, r), hc = col(r.pick([0xd8402a, 0x2f6a8a, 0xe0b030, 0x3a7a5a, 0xe8e0d0]), 0.05, r);
    b.t('bark'); for (const sd of [-1, 1]) b.cyl(sd * 1.6, 0.9, 0, 0.07, 0.08, 1.8, 6, pc);
    b.t('fabric'); const n = 10, P2 = (t) => [-1.45 + 2.9 * t, 1.5 - 0.75 * 4 * t * (1 - t), 0];
    for (let k = 0; k < n; k++) b.plank(P2(k / n), P2((k + 1) / n), 0.7 * Math.sin(Math.PI * (k + 0.5) / n) + 0.1, 0.03, hc);
    return {};
  };
  L('hammock', 'fabric');
  P.nicho = (b, r, o) => { // roadside / wall shrine: a little house on a post, the Virgin painted inside, candles, flowers
    const wc = col(r.pick([0xeeeadf, 0x8fa6b2, 0xe0b8a0]), 0.03, r);
    b.t('plaster').box(0, 0.6, 0, 0.35, 1.2, 0.35, wc).box(0, 1.5, 0, 0.7, 0.7, 0.45, wc);
    b.t('roof_tile').plank([0, 2.0, -0.3], [0, 1.82, 0.32], 0.85, 0.06, col(0x965b45)); b.plank([0, 2.0, -0.3], [0, 2.0, -0.3], 0.85, 0.06, col(0x965b45));
    b.t('plain').box(0, 1.5, 0.21, 0.42, 0.5, 0.04, col(0x1a2a4a)).box(0, 1.48, 0.235, 0.16, 0.36, 0.01, col(0x3a7a6a)).box(0, 1.6, 0.24, 0.07, 0.07, 0.01, col(0xe0c8a0));
    plantRow(b, r, -0.25, 0.18, 0.25, 0.18, 1.18, 0.24, { flowers: 2, marigold: 1.5 }, 0.2);
    b.ch('lamp').w(o._r ?? (r.chance(0.7) ? -0.5 : 9)).t('plain'); for (const sd of [-1, 1]) b.cyl(sd * 0.22, 1.25, 0.15, 0.025, 0.025, 0.1, 6, 0xffd890); b.w(-1).ch('main');
    return { lights: [{ at: [0, 1.4, 0.5], color: LIGHT_COL.candle || LIGHT_COL.oil, radius: 2.5, intensity: 0.6, kind: 'lamp', flicker: true }] };
  };
  L('nicho', 'plaster');

  // ---------------------------------------------------------------- street furniture
  P.bench_park = (b, r) => { // cast-iron ends, slatted wood
    const iron = col(0x22201e), wc = col(r.pick([0x3a5a3a, WOOD.weathered, 0x8a3a2a]), 0.05, r);
    b.t('metal'); for (const sd of [-1, 1]) { b.box(sd * 0.8, 0.22, 0, 0.06, 0.44, 0.5, iron); b.box(sd * 0.8, 0.65, -0.24, 0.06, 0.45, 0.06, iron); }
    b.t('wood'); for (let k = 0; k < 3; k++) b.box(0, 0.45, -0.15 + k * 0.15, 1.7, 0.04, 0.1, wc); for (let k = 0; k < 2; k++) b.box(0, 0.6 + k * 0.18, -0.26, 1.7, 0.1, 0.03, wc);
    return {};
  };
  L('bench_park', 'wood');
  P.kiosko = (b, r, o) => { // bandstand: raised octagon, slim columns, a domed tin roof, railing
    const R = o.radius || 3.2, wc = col(r.pick([0xeeeadf, 0xd8c8a8]), 0.02, r), iron = col(r.pick([0x2a4a3a, 0x22201e, 0x3a4a6a]), 0.04, r);
    b.t('stone'); lathe(b, [[R + 0.1, -0.3], [R + 0.1, 0.9], [R + 0.25, 0.95], [R + 0.25, 1.05], [0, 1.05]], wc, 0, 0, 0, 8, 'kplat');
    for (let k = 0; k < 4; k++) b.t('stone').box(0, 0.15 + k * 0.22, R + 0.4 + (3 - k) * 0.28, 1.6, 0.3 + k * 0.22, 0.3, wc);
    b.t('metal');
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R; rod(b, [x, 1.05, z], [x, 4.0, z], 0.07, iron, 8); }
    for (let k = 0; k < 8; k++) { const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2; if (k === 1) continue; rod(b, [Math.cos(a0) * R, 1.85, Math.sin(a0) * R], [Math.cos(a1) * R, 1.85, Math.sin(a1) * R], 0.03, iron, 6); }
    b.t('corrugated'); lathe(b, [[R + 0.5, 3.9], [R + 0.3, 4.2], [R * 0.6, 4.9], [R * 0.2, 5.3], [0.15, 5.5], [0, 5.55]], col(r.pick([0x8a9a9a, 0xa8553a, 0x4a6a5a]), 0.04, r), 0, 0, 0, 8, 'kroof');
    b.t('metal').cyl(0, 5.8, 0, 0.04, 0.04, 0.6, 6, iron);
    return {};
  };
  L('kiosko', 'stone');
  P.bus_shelter = (b, r) => { // pre-war: steel frame, cracked glass back, bench, a faded ad
    const steel = col(r.pick([0x6a7a7a, 0x8a8f8c, 0x4a5a6a]), 0.04, r);
    b.t('metal'); for (const [x, z] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.5], [1.4, 0.5]]) b.box(x, 1.2, z, 0.08, 2.4, 0.08, steel);
    b.box(0, 2.45, 0, 3.0, 0.1, 1.4, steel, 0, 0.05);
    b.ch('glass').w(0.4).t('plain').box(0, 1.25, -0.6, 2.7, 1.8, 0.03, col(0xa8b8b8)).w(-1).ch('main');
    b.t('wood').box(0, 0.45, -0.35, 2.4, 0.05, 0.35, col(WOOD.weathered));
    return { signs: [{ text: r.pick(['PAPI COLA', 'CIVITEK', 'ALPHA BRAVO', 'OCASO ZARZAPARRILLA']), x: 1.15, y: 1.3, z: -0.57, ry: 0, w: 0.9, h: 1.5, style: 'prewar', opts: { rust: true, missing: 0.2 } }] };
  };
  L('bus_shelter', 'metal');
  P.phone_booth = (b, r) => {
    const pc = col(r.pick([0x8a8f8c, 0x2f5a8a, 0xa83a32]), 0.05, r);
    b.t('metal').box(0, 1.1, 0, 0.9, 2.2, 0.9, pc).box(0, 2.25, 0, 0.95, 0.1, 0.95, pc.clone().offsetHSL(0, 0, -0.06));
    b.ch('glass').w(0.5).t('plain').box(0, 1.25, 0.46, 0.7, 1.5, 0.02, col(0xa8b8b8)).w(-1).ch('main');
    b.t('plain').box(0, 2.1, 0.47, 0.7, 0.16, 0.01, col(0xe8e0d0));
    return {};
  };
  L('phone_booth', 'metal');
  P.mailbox = (b, r) => {
    const pc = col(r.pick([0x2f4a7a, 0x3a5a3a]), 0.05, r);
    b.t('metal'); for (const [x, z] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]]) b.box(x, 0.2, z, 0.05, 0.4, 0.05, pc);
    b.box(0, 0.75, 0, 0.45, 0.7, 0.45, pc); b.cyl(0, 1.1, 0, 0.225, 0.225, 0.45, 12, pc, 0, 0, Math.PI / 2);
    return {};
  };
  L('mailbox', 'metal');
  P.hydrant = (b, r) => {
    const hc = col(r.pick([0xb8302a, 0xc8a040, 0x8a8f8c]), 0.05, r);
    b.t('metal'); lathe(b, [[0.16, 0], [0.16, 0.06], [0.12, 0.08], [0.12, 0.62], [0.15, 0.64], [0.15, 0.7], [0.09, 0.78], [0.04, 0.85], [0, 0.86]], hc, 0, 0, 0, 12, 'hydrant');
    for (const sd of [-1, 1]) rod(b, [0, 0.48, 0], [sd * 0.2, 0.48, 0], 0.045, hc); rod(b, [0, 0.42, 0], [0, 0.42, 0.2], 0.06, hc);
    return {};
  };
  L('hydrant', 'metal');
  P.road_sign = (b, r, o) => { // pre-war road sign on a post: stop, speed, town name
    const kind = o.kind || r.pick(['stop', 'alto', 'speed', 'town']);
    b.t('metal').cyl(0, 1.2, 0, 0.035, 0.035, 2.4, 6, col(METAL.steel));
    if (kind === 'stop' || kind === 'alto') { b.t('metal').cyl(0, 2.3, 0.04, 0.38, 0.38, 0.03, 8, col(0xa82a22), Math.PI / 2, 0, Math.PI / 8); return { signs: [{ text: kind === 'stop' ? 'STOP' : 'ALTO', x: 0, y: 2.3, z: 0.06, ry: 0, w: 0.52, h: 0.2, style: 'painted', opts: { bg: '#a82a22' } }] }; }
    b.t('metal').box(0, 2.2, 0.04, kind === 'town' ? 1.4 : 0.6, kind === 'town' ? 0.45 : 0.75, 0.03, col(kind === 'town' ? 0x2a5a3a : 0xe8e4d8));
    return { signs: [{ text: kind === 'town' ? (o.text || 'SAN QUINTÍN') : r.pick(['40', '60', 'KM 190', 'CURVA']), x: 0, y: 2.2, z: 0.06, ry: 0, w: kind === 'town' ? 1.3 : 0.5, h: kind === 'town' ? 0.38 : 0.6, style: 'prewar', opts: { rust: true } }] };
  };
  L('road_sign', 'metal');
  P.notice_board = (b, r, o) => { // tablón: board on two posts with a little roof, papers pinned
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood'); for (const sd of [-1, 1]) b.box(sd * 0.75, 0.95, 0, 0.1, 1.9, 0.1, wc);
    b.box(0, 1.35, 0, 1.6, 0.9, 0.05, wc.clone().offsetHSL(0, 0, -0.05));
    b.t('corrugated').plank([0, 2.0, -0.2], [0, 1.85, 0.3], 1.8, 0.04, col(0x8a8f8c));
    b.t('plain'); for (let k = 0; k < 7; k++) b.box(r.range(-0.6, 0.6), r.range(1.05, 1.65), 0.03, r.range(0.18, 0.3), r.range(0.22, 0.32), 0.005, col(r.pick([0xf0ece2, 0xe8d8a0, 0xd8e0e8, 0xe8c8c0])), 0, 0, r.range(-0.15, 0.15));
    return { signs: [{ text: o.text || r.pick(['AVISOS', 'SE BUSCA', 'NOTICIAS']), x: 0, y: 1.72, z: 0.04, ry: 0, w: 0.9, h: 0.16, style: 'painted' }] };
  };
  L('notice_board', 'wood');
  P.painted_sign = (b, r, o) => { // hand-painted board on posts at the roadside
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood'); for (const sd of [-1, 1]) b.box(sd * 0.7, 0.8, 0, 0.09, 1.6, 0.09, wc);
    return { signs: [{ text: o.text || r.pick(['SE VENDE\nAGUA', 'HAY\nGASOLINA', 'LLANTAS', 'NO PASAR', 'PELIGRO\nRADIACIÓN', 'BIENVENIDOS']), x: 0, y: 1.25, z: 0.05, ry: 0, w: 1.6, h: 0.75, style: 'painted', opts: { rust: true } }] };
  };
  L('painted_sign', 'wood');

  // ---------------------------------------------------------------- infrastructure
  P.water_tank = (b, r, o) => { // steel tank on a timber/steel stand, a pipe down
    const H = o.height || 3.0, tc = col(r.pick([0x8a8f8c, 0x6a7a7a, 0x8a5a3a]), 0.05, r);
    b.t('wood'); for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) b.box(x, H / 2, z, 0.14, H, 0.14, col(WOOD.weathered));
    for (const y of [H * 0.4]) { b.box(0, y, -0.8, 1.7, 0.08, 0.08, col(WOOD.weathered)); b.box(0, y, 0.8, 1.7, 0.08, 0.08, col(WOOD.weathered)); }
    b.t('wood').box(0, H + 0.05, 0, 1.9, 0.1, 1.9, col(WOOD.dark));
    b.t('metal'); lathe(b, [[0.9, 0], [0.9, 1.6], [0.6, 1.85], [0, 1.9]], tc, 0, H + 0.1, 0, 20, 'wtank');
    b.t('metal').cyl(0.95, H / 2 + 0.2, 0, 0.05, 0.05, H + 0.4, 8, col(METAL.dark));
    return {};
  };
  L('water_tank', 'metal');
  P.rain_barrel = (b, r) => { // a drum under a gutter downpipe, a tin funnel
    b.t('metal'); lathe(b, [[0.3, 0], [0.3, 0.88], [0.29, 0.9]], col(r.pick([0x2f5a8a, 0x3a6a3a, 0x8a3a2a, 0x6a4a3a]), 0.05, r), 0, 0, 0, 16, 'rbarrel');
    b.t('metal'); lathe(b, [[0.06, 0.9], [0.32, 1.1], [0.3, 1.12]], col(0x9a9fa0), 0, 0, 0, 12, 'funnel');
    b.cyl(0, 1.9, 0, 0.05, 0.05, 1.6, 8, col(0x8a8f8c));
    return {};
  };
  L('rain_barrel', 'metal');
  P.pipes = (b, r, o) => { // run of pipes on trestles (water line / irrigation)
    const L2 = o.length || 6, pc = col(r.pick([0x6a5040, 0x8a8f8c, 0x2a2826]), 0.05, r);
    b.t('wood'); for (let x = -L2 / 2 + 0.3; x <= L2 / 2; x += 2) { b.box(x, 0.3, 0, 0.08, 0.6, 0.5, col(WOOD.weathered)); }
    b.t('rust'); for (const z of [-0.12, 0.12]) b.cyl(0, 0.68, z, 0.08, 0.08, L2, 10, pc, 0, 0, Math.PI / 2);
    return {};
  };
  L('pipes', 'rust');
  P.car_fan_turbine = (b, r, o) => { // a pole with a radiator fan / alternator and a tail vane
    const H = o.height || 5.5;
    b.t('metal').cyl(0, H / 2, 0, 0.05, 0.07, H, 8, col(METAL.steel));
    for (const a of [0, 2.09, 4.19]) { rod(b, [0, 0.02, 0], [Math.cos(a) * 1.2, 0.02, Math.sin(a) * 1.2], 0.01, col(0x4a4a44), 3); rod(b, [0, H * 0.7, 0], [Math.cos(a) * 1.2, 0.03, Math.sin(a) * 1.2], 0.008, col(0x4a4a44), 3); }
    b.t('metal').box(0, H + 0.05, 0, 0.18, 0.18, 0.4, col(0x5a5a58));
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + r.range(0, 1); b.t('metal').box(Math.cos(a) * 0.32, H + 0.05 + Math.sin(a) * 0.32, 0.25, 0.12, 0.5, 0.02, col(r.pick([0x8a8f8c, 0x2a2826, 0xa83a32]), 0.05, r), 0, 0, a + Math.PI / 2); }
    b.t('metal').box(0, H + 0.1, -0.5, 0.02, 0.4, 0.5, col(0x8a8f8c));
    return {};
  };
  L('car_fan_turbine', 'metal');

  // ---------------------------------------------------------------- edge defences
  P.cheval = (b, r) => { // wooden cheval-de-frise: a log with crossed sharpened stakes
    const mc = col(0x6a543c, 0.06, r);
    b.t('bark'); tube(b, [[-1.5, 0.55, 0], [1.5, 0.55, 0]], [0.12, 0.12], mc, { seg: 8, cap: false });
    for (let k = 0; k < 5; k++) { const x = -1.2 + k * 0.6; rod(b, [x, 0.0, -0.75], [x, 1.1, 0.75], 0.05, mc, 5); rod(b, [x, 0.0, 0.75], [x, 1.1, -0.75], 0.05, mc, 5); }
    return {};
  };
  L('cheval', 'bark');
}

// ---------------------------------------------------------------------------------------------
// life sets: what shows life around each kind of building, by liveliness 0..1 (front yard / street side)
export const LIFE_SETS = {
  house: { chairs: ['chair', 'chair'], laundry_line: 1, pila: 1, ollas: 1, chickens: 1, dog: 1, toys: 1, tire_swing: 0.5, hammock: 0.6, pot_plant: 2, rain_barrel: 1, drum_stove: 0.6, water_jugs: 0.6, nicho: 0.3 },
  shop: { food_cart: 0.6, agua_fresca: 0.6, crates: 1, chair: 1, water_jugs: 1, dog: 0.5, painted_sign: 0.6 },
  store: { crates: 1.5, water_jugs: 1, chair: 1, agua_fresca: 0.6, burro: 0.4, dog: 0.5, painted_sign: 0.5 },
  cantina: { domino_table: 1, chair: 2, cafe_table: 1, dog: 0.6, burro: 0.5, hitching_rail: 0.6 },
  cafe: { cafe_table: 2, chair: 2, food_cart: 0.4, drum_stove: 0.6, dog: 0.4 },
  posada: { bench: 1, burro: 0.5, chair: 1, hitching_rail: 0.6, water_jugs: 0.6 },
  clinic: { bench: 1.5, water_jugs: 1, laundry_line: 0.6 },
  workshop: { tires: 1, barrel: 1, engine_block: 0.6, crates: 1, dog: 0.6 },
  garage: { tires: 1.5, barrel: 1, engine_block: 1, car_wreck: 0.4 },
  chapel: { nicho: 0.6, bench_park: 1, pot_plant: 1 },
  hall: { bench_park: 1, notice_board: 1 },
};
export function lifeSet(kind, liveliness, rng) {
  const S = LIFE_SETS[kind] || LIFE_SETS.house, out = [];
  for (const [t, wgt] of Object.entries(S)) {
    const n = Array.isArray(wgt) ? wgt.length : wgt;
    for (let k = 0; k < Math.ceil(n); k++) if (rng.chance(Math.min(1, (n - k) * liveliness))) out.push(Array.isArray(wgt) ? wgt[k] : t);
  }
  return out;
}

// Temporary structures (tents, wagons, stalls) and yard / trade props (meat racks, forges, planters...).
// Registered into the main prop table by props.js.
import { col } from './builder.js';
import { pottedPlant, plantRow } from './foliage.js';
import { WOOD, METAL, ROOF, MISC } from './palette.js';
import { LIGHT_COL } from './presets.js';

const CANVAS = [0xc8b896, 0xb8a882, 0xa89a78, 0x9a9070, 0xd2c4a2, 0x8f9474, 0xb4a07a];
const CLOTH = [0xa8473a, 0x5f7f96, 0xc9a65a, 0x8a9a6a, 0xd8ccb0, 0x9a5a7a, 0xc07a3a, 0x4f6f5a];

// goods laid on a surface: (x, y, z) = surface centre, w × d area
export function drawGoods(b, r, x, y, z, w, d, goods = 'mixed') {
  const kinds = goods === 'mixed' ? ['produce', 'pottery', 'sacks', 'cloth', 'scrap', 'water'] : [goods];
  const n = Math.max(3, Math.round(w * d * 5));
  for (let i = 0; i < n; i++) {
    const k = r.pick(kinds);
    const gx = x + r.range(-w / 2 + 0.12, w / 2 - 0.12), gz = z + r.range(-d / 2 + 0.12, d / 2 - 0.12);
    switch (k) {
      case 'produce': b.t('plain'); b.box(gx, y + 0.06, gz, 0.34, 0.12, 0.26, col(WOOD.fresh, 0.06, r)); for (let j = 0; j < 3; j++) b.blob(gx + r.range(-0.1, 0.1), y + 0.16, gz + r.range(-0.07, 0.07), 0.06, 0.05, 0.06, col(r.pick([0x8a9a3a, 0xb8442e, 0xd08a2a, 0x6a8a3a, 0xc8b040]), 0.08, r)); break;
      case 'pottery': b.t('plain'); b.cyl(gx, y + 0.13, gz, r.range(0.06, 0.1), r.range(0.08, 0.13), 0.26, 7, col(r.pick([0xa8603e, 0xb87a52, 0x8e5a3a, 0xc89a6a]), 0.05, r)); break;
      case 'sacks': b.t('fabric'); b.blob(gx, y + 0.15, gz, 0.18, 0.16, 0.14, col(0xb8a478, 0.06, r), 'dodec', r.next() * 3); break;
      case 'cloth': b.t('fabric'); b.box(gx, y + 0.04 + (i % 3) * 0.05, gz, 0.36, 0.05, 0.28, col(r.pick(CLOTH), 0.06, r), r.range(-0.2, 0.2)); break;
      case 'scrap': b.t('metal'); if (r.chance(0.5)) b.box(gx, y + 0.07, gz, r.range(0.12, 0.3), 0.14, r.range(0.1, 0.22), col(r.pick([METAL.dark, METAL.steel, METAL.rust]), 0.06, r), r.next()); else b.cyl(gx, y + 0.1, gz, 0.05, 0.05, 0.2, 6, col(METAL.steel, 0.05, r)); break;
      case 'water': b.t('plain'); b.box(gx, y + 0.17, gz, 0.2, 0.34, 0.12, col(r.pick([0x5f7f6a, 0x4f6f86, 0x8a8a7a]), 0.05, r)); break;
      case 'meat': b.t('hide'); b.box(gx, y + 0.05, gz, 0.26, 0.1, 0.18, col(r.pick([0x8a3a2e, 0x9a4a3a, 0x7a3428]), 0.06, r), r.next()); break;
      case 'ammo': b.t('metal'); b.box(gx, y + 0.08, gz, 0.3, 0.16, 0.18, col(r.pick([0x5a6a4a, 0x6a6a5a]), 0.05, r), r.next()); break;
      case 'tools': b.t('metal'); b.plank([gx - 0.2, y + 0.03, gz], [gx + 0.2, y + 0.03, gz + r.range(-0.1, 0.1)], 0.04, 0.03, col(METAL.dark)); b.box(gx + 0.2, y + 0.05, gz, 0.08, 0.06, 0.12, col(METAL.steel)); break;
    }
  }
}

function canvasCol(r, o) { return col(o.color || r.pick(CANVAS), 0.05, r); }

export function addTempProps(P, DEF_LAYER, PROP_LIGHT) {
  // ------------------------------------------------------------------ tents
  P.tent_aframe = (b, r, o) => { // ridge tent
    const c = canvasCol(r, o), w = o.width || 2.2, L = o.length || 2.6, H = o.height || 1.5;
    b.poly([[-w / 2, 0, -L / 2], [-w / 2, 0, L / 2], [0, H, L / 2], [0, H, -L / 2]], c);
    b.poly([[w / 2, 0, L / 2], [w / 2, 0, -L / 2], [0, H, -L / 2], [0, H, L / 2]], c.clone().offsetHSL(0, 0, -0.06));
    b.tri([-w / 2, 0, -L / 2], [w / 2, 0, -L / 2], [0, H, -L / 2], c.clone().offsetHSL(0, 0, -0.03));
    // front: two flaps, one tied back
    b.tri([-w / 2, 0, L / 2], [0, 0, L / 2 + 0.05], [0, H, L / 2], c.clone().offsetHSL(0, 0, -0.04));
    b.tri([0.05, 0, L / 2 + 0.35], [w / 2, 0, L / 2], [0, H, L / 2], c.clone().offsetHSL(0, 0, -0.09));
    b.t('wood'); b.beam([0, 0, L / 2 + 0.05], [0, H + 0.12, L / 2 + 0.05], 0.03, 4, col(WOOD.pole)); b.beam([0, 0, -L / 2 - 0.05], [0, H + 0.12, -L / 2 - 0.05], 0.03, 4, col(WOOD.pole));
  };
  P.tent_wall = (b, r, o) => { // canvas wall tent (caravan / army surplus)
    const c = canvasCol(r, o), w = o.width || 3.2, L = o.length || 4.2, h = 1.5, H = o.height || 2.6;
    const s = c.clone().offsetHSL(0, 0, -0.05);
    b.quad([-w / 2, 0, -L / 2], [-w / 2, 0, L / 2], [-w / 2, h, L / 2], [-w / 2, h, -L / 2], s);
    b.quad([w / 2, 0, L / 2], [w / 2, 0, -L / 2], [w / 2, h, -L / 2], [w / 2, h, L / 2], s);
    b.poly([[-w / 2, 0, -L / 2], [w / 2, 0, -L / 2], [w / 2, h, -L / 2], [0, H, -L / 2], [-w / 2, h, -L / 2]], s.clone().offsetHSL(0, 0, -0.03));
    // front with an open door flap
    b.poly([[-w / 2, 0, L / 2], [-0.45, 0, L / 2], [-0.45, h + 0.4, L / 2], [0, H, L / 2], [-w / 2, h, L / 2]], s);
    b.poly([[0.45, 0, L / 2], [w / 2, 0, L / 2], [w / 2, h, L / 2], [0, H, L / 2], [0.45, h + 0.4, L / 2]], s);
    b.quad([0.45, 0.4, L / 2 + 0.02], [0.9, 0.5, L / 2 + 0.25], [0.6, h + 0.3, L / 2 + 0.15], [0.45, h + 0.4, L / 2 + 0.02], s.clone().offsetHSL(0, 0, -0.06));
    b.quad([-w / 2 - 0.25, h - 0.15, -L / 2], [-w / 2 - 0.25, h - 0.15, L / 2], [0, H, L / 2], [0, H, -L / 2], c);
    b.quad([w / 2 + 0.25, h - 0.15, L / 2], [w / 2 + 0.25, h - 0.15, -L / 2], [0, H, -L / 2], [0, H, L / 2], c.clone().offsetHSL(0, 0, -0.04));
    b.t('wood');
    for (const z of [-L / 2, L / 2]) b.beam([0, 0, z], [0, H + 0.15, z], 0.04, 4, col(WOOD.pole));
    b.t('plain');
    for (const sx of [-1, 1]) for (const z of [-L / 3, L / 3]) b.beam([sx * (w / 2 + 0.25), h - 0.15, z], [sx * (w / 2 + 1.0), 0, z], 0.008, 3, col(0x6a5a40));
  };
  P.tent_bell = (b, r, o) => { // big round bell tent (trading caravans, gatherings)
    const c = canvasCol(r, o), R = o.radius || 2.6, h = 0.9, H = o.height || 3.4, seg = 12;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [Math.cos(a0) * R, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
      const shade = c.clone().offsetHSL(0, 0, -0.03 * (i % 2));
      if (i !== 3) b.quad([p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], h, p1[1]], [p0[0], h, p0[1]], shade.clone().offsetHSL(0, 0, -0.05));
      b.tri([p0[0] * 1.06, h - 0.05, p0[1] * 1.06], [p1[0] * 1.06, h - 0.05, p1[1] * 1.06], [0, H, 0], shade);
    }
    b.t('wood'); b.beam([0, 0, 0], [0, H + 0.3, 0], 0.06, 5, col(WOOD.pole));
    if (o.flag !== false) { b.t('fabric'); b.box(0.25, H + 0.12, 0, 0.45, 0.28, 0.02, col(r.pick(CLOTH), 0.05, r)); }
  };
  P.lean_to = (b, r, o) => { // tarp on two poles, sloping to the ground
    const c = canvasCol(r, o), w = o.width || 3, d = o.depth || 2.2, H = o.height || 1.7;
    b.quad([-w / 2, H, d / 2], [w / 2, H, d / 2], [w / 2, 0.05, -d / 2], [-w / 2, 0.05, -d / 2], c);
    b.t('wood'); for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) b.beam([x, 0, d / 2], [x, H + 0.1, d / 2], 0.04, 4, col(WOOD.pole));
    if (o.bedroll !== false) P.bedroll(b, r, { at: [0, -0.1] });
  };
  P.bedroll = (b, r, o) => {
    const [x, z] = o.at || [0, 0];
    b.t('fabric');
    b.box(x, 0.05, z, 0.8, 0.1, 1.9, col(r.pick(CLOTH), 0.08, r), o.ry || 0);
    b.cyl(x, 0.12, z - 0.85, 0.12, 0.12, 0.7, 6, col(r.pick(CANVAS), 0.06, r), 0, o.ry || 0, Math.PI / 2);
    if (r.chance(0.6)) { b.t('hide'); b.box(x + 0.6, 0.2, z - 0.6, 0.4, 0.4, 0.25, col(0x6e5a44, 0.06, r)); }
  };

  // ------------------------------------------------------------------ caravan
  P.wagon = (b, r, o) => { // covered caravan wagon; front (+Z) has the tongue
    const w = col(WOOD.weathered, 0.06, r), L = o.length || 3.6, W = 1.7;
    b.t('wood');
    b.box(0, 1.0, 0, W, 0.14, L, w);
    for (const s of [-1, 1]) b.box(s * (W / 2 - 0.04), 1.3, 0, 0.08, 0.5, L, w);
    b.box(0, 1.3, -L / 2 + 0.04, W, 0.5, 0.08, w);
    for (const s of [-1, 1]) for (const z of [-L / 2 + 0.6, L / 2 - 0.6]) b.cyl(s * 0.95, 0.62, z, z > 0 ? 0.5 : 0.62, z > 0 ? 0.5 : 0.62, 0.1, 10, col(WOOD.dark), 0, 0, Math.PI / 2);
    b.plank([0, 0.9, L / 2], [0, 0.55, L / 2 + 2.2], 0.12, 0.12, w);
    b.box(0, 0.55, L / 2 + 2.2, 1.4, 0.08, 0.08, w);
    if (o.cover !== false) {
      const c = canvasCol(r, o), seg = 6, R = W / 2 + 0.05, y0 = 1.5;
      b.t('fabric');
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
        const x0 = Math.cos(a0) * R, h0 = Math.sin(a0) * R * 1.15, x1 = Math.cos(a1) * R, h1 = Math.sin(a1) * R * 1.15;
        b.quad([x0, y0 + h0, L / 2 - 0.1], [x1, y0 + h1, L / 2 - 0.1], [x1, y0 + h1, -L / 2 + 0.2], [x0, y0 + h0, -L / 2 + 0.2], c.clone().offsetHSL(0, 0, -0.02 * (i % 2)));
        b.tri([x0, y0 + h0, -L / 2 + 0.2], [x1, y0 + h1, -L / 2 + 0.2], [0, y0, -L / 2 + 0.2], c.clone().offsetHSL(0, 0, -0.07));
      }
      if (o.sign) return { signs: [{ text: o.sign, x: R + 0.02, y: y0 + 0.5, z: 0, ry: Math.PI / 2, w: Math.min(L * 0.7, 0.4 + o.sign.length * 0.22), h: 0.4, style: 'painted' }] };
    } else drawGoods(b, r, 0, 1.08, 0, W - 0.3, L - 0.4, o.goods || 'sacks');
  };
  P.hitching_rail = (b, r, o) => {
    const L = o.length || 6, w = col(WOOD.weathered, 0.06, r);
    const n = Math.max(2, Math.round(L / 2.5));
    for (let i = 0; i <= n; i++) b.box(-L / 2 + (i * L) / n, 0.55, 0, 0.14, 1.1, 0.14, w);
    b.box(0, 1.0, 0, L, 0.1, 0.1, w);
  };

  // ------------------------------------------------------------------ market
  P.stall = (b, r, o) => { // counter + awning on four poles; goods on the counter
    const W = o.width || 2.6, D = 1.0;
    const w = col(r.pick([WOOD.weathered, WOOD.fresh]), 0.06, r);
    b.t('wood');
    b.box(0, 0.45, 0.2, W, 0.9, 0.08, w); b.box(0, 0.92, 0.1, W + 0.1, 0.06, D * 0.8, w);
    for (const s of [-1, 1]) b.box(s * W / 2, 0.45, -0.1, 0.08, 0.9, 0.7, w);
    if (o.cover !== 'none') for (const [x, z] of [[-1, 0.7], [1, 0.7], [-1, -0.9], [1, -0.9]]) b.box(x * (W / 2 + 0.05), z > 0 ? 1.1 : 1.25, z, 0.08, z > 0 ? 2.2 : 2.5, 0.08, col(WOOD.pole, 0.05, r));
    b.t('fabric');
    const cl = col(o.color || r.pick(CLOTH), 0.05, r), cl2 = col(r.pick(CANVAS), 0.04, r);
    // the cover is whatever there was: a tin sheet, a sun-rotted tarp, a carrizo mat, tin with a tarp patch
    const cover = o.cover || r.weighted({ tin: 3, tarp: 2.5, mat: 2, patch: 1.5 }), A = [0, 2.2, 1.1], B = [0, 2.5, -0.9];
    if (cover === 'none') { /* under a shared row shade */ } else if (cover === 'tin' || cover === 'patch') {
      b.t(r.chance(0.5) ? 'rust' : 'corrugated').plank(A, B, W + 0.5, 0.04, col(r.pick([...ROOF.corrugated, METAL.rust, METAL.rust2]), 0.06, r));
      if (cover === 'patch') { b.t('fabric').plank([r.range(-W / 4, W / 4), 2.25, 0.6], [r.range(-W / 4, W / 4), 2.45, -0.5], W * 0.45, 0.02, cl.clone().lerp(cl2, 0.6)); }
    } else if (cover === 'mat') {
      b.t('thatch').plank(A, B, W + 0.5, 0.05, col(0xb8a074, 0.05, r));
      b.t('bark'); for (const x of [-W / 2, 0, W / 2]) b.plank([x, 2.26, 1.1], [x, 2.56, -0.9], 0.05, 0.05, col(WOOD.pole));
    } else { // a faded tarp, sagging between the poles
      const tc = cl.clone().lerp(cl2, 0.65), M = [0, 2.28, 0.1];
      for (const [p0, p1] of [[A, M], [M, B]]) b.plank([0, p0[1], p0[2]], [0, p1[1], p1[2]], W + 0.45, 0.02, tc);
    }
    drawGoods(b, r, 0, 0.95, 0.1, W - 0.2, D * 0.7, o.goods || 'mixed');
    if (r.chance(0.6)) { b.t('wood'); b.box(r.range(-W / 2, W / 2), 0.25, -0.6, 0.5, 0.5, 0.5, col(WOOD.fresh, 0.06, r), r.next()); }
  };
  P.tarp_stall = (b, r, o) => { // goods on a blanket, a tarp tied to two poles for shade
    const W = o.width || 2.4;
    b.t('fabric'); b.box(0, 0.015, 0.4, W, 0.03, 1.6, col(r.pick(CLOTH), 0.08, r));
    drawGoods(b, r, 0, 0.03, 0.4, W - 0.2, 1.4, o.goods || 'mixed');
    if (o.cover === 'none') return;
    const c = canvasCol(r, o);
    b.quad([-W / 2 - 0.2, 2.0, -0.4], [W / 2 + 0.2, 2.0, -0.4], [W / 2 + 0.2, 1.6, 1.6], [-W / 2 - 0.2, 1.6, 1.6], c);
    b.t('wood'); for (const x of [-W / 2 - 0.1, W / 2 + 0.1]) b.beam([x, 0, -0.4], [x, 2.1, -0.4], 0.04, 4, col(WOOD.pole));
    b.t('plain'); for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) b.beam([x, 1.6, 1.6], [x * 1.1, 0, 2.4], 0.008, 3, col(0x6a5a40));
    b.t('wood'); b.box(-W / 2 + 0.3, 0.2, -0.7, 0.4, 0.4, 0.4, col(WOOD.weathered, 0.05, r));
  };
  P.cart_shop = (b, r, o) => { // hand cart with a cloth canopy
    const w = col(WOOD.weathered, 0.06, r);
    b.t('wood');
    b.box(0, 0.85, 0, 1.3, 0.1, 1.9, w);
    for (const s of [-1, 1]) { b.box(s * 0.62, 1.0, 0, 0.06, 0.25, 1.9, w); b.cyl(s * 0.75, 0.5, 0.1, 0.5, 0.5, 0.08, 10, col(WOOD.dark), 0, 0, Math.PI / 2); }
    b.plank([0.4, 0.85, 0.95], [0.4, 0.75, 1.9], 0.06, 0.06, w); b.plank([-0.4, 0.85, 0.95], [-0.4, 0.75, 1.9], 0.06, 0.06, w);
    b.box(0, 0.3, -0.85, 0.08, 0.6, 0.08, w);
    if (o.cover !== 'none') { for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.9], [0.6, 0.9]]) b.box(x, 1.55, z, 0.05, 1.3, 0.05, col(WOOD.pole));
    b.t('fabric'); b.box(0, 2.22, 0, 1.6, 0.04, 2.2, col(o.color || r.pick(CLOTH), 0.05, r)); }
    drawGoods(b, r, 0, 0.9, 0, 1.1, 1.7, o.goods || 'mixed');
  };
  P.shade_cloth = (b, r, o) => {
    const w = o.width || 4, d = o.depth || 3, H = o.height || 2.4;
    b.t('wood'); for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([x * w / 2, 0, z * d / 2], [x * w / 2, H + 0.05, z * d / 2], 0.05, 4, col(WOOD.pole));
    b.t('fabric'); b.box(0, H, 0, w + 0.2, 0.03, d + 0.2, col(o.color || r.pick(CANVAS), 0.05, r));
  };
  P.goods = (b, r, o) => { b.t('wood'); b.box(0, 0.02, 0, (o.width || 1.6) + 0.1, 0.04, (o.depth || 1.2) + 0.1, col(WOOD.weathered, 0.05, r)); drawGoods(b, r, 0, 0.04, 0, o.width || 1.6, o.depth || 1.2, o.goods || 'mixed'); };

  // ------------------------------------------------------------------ yard / trade props
  P.meat_rack = (b, r, o) => { // butcher's hanging frame
    const L = o.length || 2.4, H = 2.2, p = col(WOOD.pole, 0.05, r);
    b.t('wood');
    for (const s of [-1, 1]) { b.beam([s * L / 2, 0, -0.6], [s * L / 2, H, 0], 0.05, 4, p); b.beam([s * L / 2, 0, 0.6], [s * L / 2, H, 0], 0.05, 4, p); }
    b.beam([-L / 2 - 0.1, H - 0.05, 0], [L / 2 + 0.1, H - 0.05, 0], 0.05, 4, p);
    b.t('hide');
    for (let x = -L / 2 + 0.35; x < L / 2 - 0.2; x += r.range(0.35, 0.6)) {
      const h = r.range(0.4, 0.9);
      b.beam([x, H - 0.05, 0], [x, H - 0.25, 0], 0.01, 3, col(0x3a3020));
      b.box(x, H - 0.25 - h / 2, 0, r.range(0.18, 0.3), h, r.range(0.12, 0.2), col(r.pick([0x8a3a2e, 0x9a4a3a, 0x6a2e24, 0xb07a6a]), 0.06, r));
    }
  };
  P.hide_frame = (b, r, o) => { // stretched hide drying on a pole frame
    const w = o.width || 1.8, h = o.height || 1.6, p = col(WOOD.pole, 0.05, r);
    b.t('wood');
    b.push(new (b.M.constructor)().makeRotationX(-0.25));
    b.box(-w / 2, h / 2 + 0.1, 0, 0.07, h + 0.4, 0.07, p); b.box(w / 2, h / 2 + 0.1, 0, 0.07, h + 0.4, 0.07, p);
    b.box(0, 0.25, 0, w + 0.2, 0.07, 0.07, p); b.box(0, h + 0.05, 0, w + 0.2, 0.07, 0.07, p);
    b.t('hide');
    const hc = col(o.herbs ? 0x7a8a4a : r.pick([0xb09070, 0xa08060, 0xc8a882, 0x8a6a4a]), 0.06, r);
    b.poly([[-w / 2 + 0.15, 0.4, 0], [-w / 2 + 0.3, h - 0.1, 0], [0, h - 0.05, 0], [w / 2 - 0.25, h - 0.15, 0], [w / 2 - 0.15, 0.45, 0], [0, 0.32, 0]], hc);
    b.pop();
  };
  P.forge = (b, r, o) => { // smith's open forge: stone hearth, hood, anvil on a stump, quench bucket
    b.t('stone');
    const st = col(0x8e8474, 0.06, r);
    b.box(0, 0.45, 0, 1.4, 0.9, 1.1, st);
    b.t('dirt'); b.box(0, 0.92, 0, 0.9, 0.05, 0.6, col(0x2e2a26));
    b.t('brick'); b.box(0, 2.2, -0.35, 0.6, 2.6, 0.45, col(0x8e5240, 0.05, r));
    b.t('metal'); b.box(0, 1.65, 0, 1.2, 0.08, 0.9, col(METAL.rust, 0.05, r), 0, 0.25);
    b.t('bark'); b.cyl(1.3, 0.35, 0.6, 0.3, 0.34, 0.7, 7, col(WOOD.dark));
    b.t('metal'); b.box(1.3, 0.8, 0.6, 0.55, 0.2, 0.22, col(METAL.dark)); b.box(1.62, 0.84, 0.6, 0.18, 0.08, 0.12, col(METAL.dark));
    b.cyl(-1.1, 0.25, 0.5, 0.26, 0.22, 0.5, 8, col(METAL.steel, 0.05, r));
    b.ch('lamp').w(o._r ?? 9).t('plain'); b.box(0, 0.98, 0, 0.6, 0.08, 0.35, 0xff7a30); b.w(-1).ch('main');
    return {
      lights: [{ at: [0, 1.2, 0.8], color: LIGHT_COL.fire, radius: 7, intensity: 1.3, kind: 'fire', flicker: true }],
      emitters: [{ type: 'smoke', p: [0, 3.6, -0.35], always: true }, { type: 'fire', p: [0, 1.0, 0], small: true }],
    };
  };
  P.tan_pit = (b, r, o) => { // tanning vats sunk in the ground
    const n = o.count || 3;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 1.5;
      b.t('stone'); const st = col(0x9a8e7a, 0.06, r);
      b.box(x, 0.12, -0.6, 1.3, 0.24, 0.12, st); b.box(x, 0.12, 0.6, 1.3, 0.24, 0.12, st);
      b.box(x - 0.6, 0.12, 0, 0.12, 0.24, 1.1, st); b.box(x + 0.6, 0.12, 0, 0.12, 0.24, 1.1, st);
      b.ch('water'); b.t('plain'); b.box(x, 0.1, 0, 1.1, 0.02, 1.1, col(r.pick([0x5a4030, 0x6a5a38, 0x4a3a2a]), 0.05, r)); b.ch('main');
    }
    b.t('wood'); b.plank([-1, 0.05, 1.1], [0.8, 0.3, 1.0], 0.08, 0.05, col(WOOD.weathered));
  };
  P.planter = (b, r, o) => { // raised planter box (roof gardens, patios)
    const L = o.length || 1.4, W = o.width || 0.6;
    b.t('wood'); b.box(0, 0.2, 0, L, 0.4, W, col(r.pick([WOOD.weathered, WOOD.fresh, 0x9a8a6a]), 0.06, r));
    b.t('dirt'); b.box(0, 0.41, 0, L - 0.1, 0.02, W - 0.1, col(0x5a4632));
    b.t('plain');
    plantRow(b, r, -L / 2 + 0.15, 0, L / 2 - 0.15, 0, 0.41, 0.42, { herb: 2, geranium: 1.5, flowers: 1.5, chile: 1, lettuce: 0.8, marigold: 1 }, 0.3);
  };
  P.chickens = (b, r, o) => {
    const n = o.count || r.int(3, 6);
    for (let i = 0; i < n; i++) {
      const x = r.range(-1.2, 1.2), z = r.range(-1.2, 1.2), a = r.next() * 6.28, c = col(r.pick([0xe8e0d0, 0x9a6a3a, 0x6a4a2a, 0xc8a070]), 0.06, r);
      b.t('plain'); b.blob(x, 0.2, z, 0.14, 0.13, 0.2, c, 'ico', a); b.blob(x + Math.sin(a) * 0.16, 0.34, z + Math.cos(a) * 0.16, 0.07, 0.08, 0.07, c);
      b.box(x + Math.sin(a) * 0.17, 0.42, z + Math.cos(a) * 0.17, 0.03, 0.05, 0.06, 0xb83a2a, a);
    }
  };
  P.chicken_coop = (b, r, o) => {
    const w = col(r.pick([WOOD.weathered, 0x8a7a5a]), 0.06, r);
    b.t('wood'); b.box(-0.6, 0.6, 0, 1.2, 1.2, 1.2, w);
    b.t('corrugated'); b.box(-0.6, 1.3, 0, 1.4, 0.06, 1.4, col(r.pick(ROOF.corrugated), 0.05, r), 0, 0, 0.15);
    b.t('wood'); const pc = col(WOOD.pole);
    for (const [x, z] of [[0, -0.6], [1.6, -0.6], [1.6, 0.6], [0, 0.6]]) b.box(x, 0.5, z, 0.05, 1.0, 0.05, pc);
    b.t('metal'); const mesh = col(0x8a8a80);
    for (const y of [0.25, 0.5, 0.75, 1.0]) { b.box(0.8, y, -0.6, 1.6, 0.012, 0.012, mesh); b.box(0.8, y, 0.6, 1.6, 0.012, 0.012, mesh); b.box(1.6, y, 0, 0.012, 0.012, 1.2, mesh); }
    P.chickens(b, r, { count: 3 });
  };
  P.kiln = (b, r) => { // potter's adobe kiln
    b.t('adobe'); const a = col(0xb08a62, 0.05, r);
    b.blob(0, 0.6, 0, 1.0, 1.1, 1.0, a, 'dodec');
    b.box(0, 0.3, 0.8, 0.5, 0.6, 0.4, col(0x2e2a26));
    b.cyl(0, 1.65, 0, 0.18, 0.22, 0.5, 6, a);
    b.t('plain'); for (let i = 0; i < 5; i++) b.cyl(r.range(1.0, 1.8), 0.15, r.range(-0.8, 0.8), 0.1, 0.13, 0.3, 7, col(r.pick([0xa8603e, 0xb87a52, 0xc89a6a]), 0.05, r));
    return { emitters: [{ type: 'smoke', p: [0, 2.0, 0] }] };
  };
  P.lumber = (b, r, o) => { // carpenter's stacked boards and sawhorses
    b.t('wood'); const w = col(WOOD.fresh, 0.06, r);
    for (let i = 0; i < 6; i++) b.box(r.range(-0.1, 0.1), 0.08 + i * 0.09, (i % 3 - 1) * 0.3, 3.2, 0.08, 0.28, w.clone().offsetHSL(0, 0, (r.next() - 0.5) * 0.06));
    for (const x of [-0.6, 0.6]) { b.plank([x, 0, 1.3], [x, 0.75, 1.0], 0.06, 0.06, col(WOOD.weathered)); b.plank([x, 0, 0.7], [x, 0.75, 1.0], 0.06, 0.06, col(WOOD.weathered)); }
    b.box(0, 0.78, 1.0, 1.6, 0.08, 0.12, col(WOOD.weathered));
  };
  P.drying_rack = (b, r) => P.hide_frame(b, r, { herbs: true, width: 1.4, height: 1.2 });

  // ------------------------------------------------------------------ security
  P.barrier = (b, r, o) => { // pole barrier across a road lane; pivot post at x=0, arm along +x
    const L = o.length || 5, up = o.open ? 1.15 : 0;
    b.t('concrete'); b.box(0, 0.45, 0, 0.6, 0.9, 0.6, col(0xb8b2a6, 0.04, r)); b.box(L, 0.45, 0, 0.35, 0.9, 0.35, col(0xb8b2a6, 0.04, r));
    b.t('wood');
    const n = Math.round(L / 0.6);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ax = Math.cos(up) * L * t0, ay = 1.0 + Math.sin(up) * L * t0, bx = Math.cos(up) * L * t1, by = 1.0 + Math.sin(up) * L * t1;
      b.plank([ax, ay, 0], [bx, by, 0], 0.12, 0.12, i % 2 ? 0xd8d2c0 : 0xa8382c);
    }
    b.t('metal'); b.box(-0.35, 1.0, 0, 0.5, 0.35, 0.3, col(METAL.dark));
  };
  P.guard_shack = (b, r, o) => { // small booth with a window band and a flat tin roof
    const w = o.width || 2.4, d = o.depth || 2.2, H = 2.5;
    const wc = col(r.pick([0xb8ad98, 0xa89c88, 0x9a8a6a]), 0.05, r);
    b.t(o.material === 'block' ? 'block' : 'wood');
    b.box(0, 0.5, 0, w, 1.0, d, wc);
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) b.box(x, 1.7, z, 0.14, 1.4, 0.14, wc);
    b.box(0, 2.3, 0, w, 0.4, d, wc);
    b.box(0, 1.65, -d / 2, w, 1.3, 0.08, wc); // back wall solid
    b.ch('glass'); b.t('plain'); b.box(0, 1.6, d / 2, w - 0.2, 1.0, 0.03, 0x2c3438); b.box(w / 2, 1.6, 0.2, 0.03, 1.0, d - 0.8, 0x2c3438); b.box(-w / 2, 1.6, 0.2, 0.03, 1.0, d - 0.8, 0x2c3438); b.ch('main');
    b.t('corrugated'); b.box(0, H + 0.05, 0, w + 0.5, 0.06, d + 0.5, col(r.pick(ROOF.corrugated), 0.05, r), 0, 0.06);
    b.t('wood'); b.box(-w / 2 + 0.5, 0.95, d / 2 + 0.15, 0.8, 0.05, 0.3, col(WOOD.weathered)); // counter
  };
  P.sandbags = (b, r, o) => { // curved sandbag wall, `length` m, `rows` high
    const L = o.length || 4, rows = o.rows || 3, curve = o.curve ?? 0.6;
    const bag = col(r.pick([0xb8a478, 0xa89a72, 0x9a9070]), 0.05, r);
    b.t('fabric');
    for (let y = 0; y < rows; y++) {
      const n = Math.round(L / 0.62) - (y % 2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5 + (y % 2) * 0.5) / Math.round(L / 0.62) - 0.5;
        const x = t * L, z = -curve * (1 - 4 * t * t);
        b.blob(x, 0.14 + y * 0.24, z, 0.32, 0.13, 0.22, bag.clone().offsetHSL(0, 0, (r.next() - 0.5) * 0.05), 'dodec', Math.atan2(curve * 8 * t, 1));
      }
    }
  };
  P.tank_trap = (b, r) => { // welded rail hedgehog
    const c = col(r.pick([METAL.rust, METAL.dark, METAL.rust2]), 0.06, r);
    b.t('metal');
    b.plank([-0.8, 0.05, -0.5], [0.8, 1.3, 0.5], 0.14, 0.14, c);
    b.plank([0.8, 0.05, -0.5], [-0.8, 1.3, 0.5], 0.14, 0.14, c);
    b.plank([0, 0.05, 0.9], [0, 1.3, -0.9], 0.14, 0.14, c);
  };
  P.wire_coil = (b, r, o) => { // concertina wire along local x
    const L = o.length || 6, R = 0.45;
    b.t('metal');
    const c = col(0x6a6a64, 0.05, r);
    for (let x = -L / 2; x < L / 2; x += 0.35) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
        b.beam([x + 0.06 * k / 6, R + Math.sin(a0) * R, Math.cos(a0) * R], [x + 0.06 * (k + 1) / 6, R + Math.sin(a1) * R, Math.cos(a1) * R], 0.012, 3, c);
      }
    }
    for (let x = -L / 2; x <= L / 2; x += 3) b.beam([x, 0, 0], [x, 1.0, 0], 0.03, 4, col(METAL.dark));
  };
  P.watchtower = (b, r, o) => { // timber / scaffold tower with a roofed platform, ladder and a light
    const H = o.height || 6.5, w = 2.6, kind = o.kind || r.pick(['timber', 'timber', 'scaffold']);
    const pc = kind === 'scaffold' ? col(METAL.steel, 0.06, r).offsetHSL(0, 0, -0.1) : col(WOOD.pole, 0.06, r);
    b.t(kind === 'scaffold' ? 'metal' : 'bark');
    const leg = (sx, sz) => b.beam([sx * (w / 2 + 0.25), 0, sz * (w / 2 + 0.25)], [sx * w / 2, H + 1.4, sz * w / 2], kind === 'scaffold' ? 0.05 : 0.11, 5, pc);
    leg(-1, -1); leg(1, -1); leg(1, 1); leg(-1, 1);
    for (let k = 1; k < 3; k++) {
      const y = (H * k) / 3, e = w / 2 + 0.25 * (1 - y / (H + 1.4));
      b.plank([-e, y, -e], [e, y + H / 3 * 0.6, e], 0.08, 0.08, pc); b.plank([e, y, -e], [-e, y + H / 3 * 0.6, e], 0.08, 0.08, pc);
      b.plank([-e, y, e], [e, y, e], 0.08, 0.08, pc); b.plank([-e, y, -e], [e, y, -e], 0.08, 0.08, pc);
    }
    b.t('wood'); const dk = col(WOOD.weathered, 0.05, r);
    b.box(0, H, 0, w + 0.6, 0.15, w + 0.6, dk);
    for (const [x, z, ry] of [[0, w / 2 + 0.25, 0], [0, -w / 2 - 0.25, 0], [w / 2 + 0.25, 0, Math.PI / 2], [-w / 2 - 0.25, 0, Math.PI / 2]]) b.box(x, H + 0.55, z, w + 0.6, 0.9, 0.08, dk, ry);
    if (r.chance(0.6)) { b.t('fabric'); b.box(0, H + 0.6, w / 2 + 0.32, w + 0.6, 0.85, 0.04, col(r.pick([0xb8a478, 0x8a9a6a, 0x9a9070]), 0.05, r)); }
    b.t('corrugated'); b.box(0, H + 2.25, 0, w + 1.1, 0.07, w + 1.1, col(r.pick(ROOF.corrugated), 0.05, r), 0, 0.1);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { b.t('wood'); b.box(x * (w / 2 + 0.2), H + 1.2, z * (w / 2 + 0.2), 0.1, 2.1, 0.1, dk); }
    b.t('wood'); // ladder
    for (const dx of [-0.25, 0.25]) b.plank([dx, 0, w / 2 + 1.1], [dx, H, w / 2 + 0.3], 0.06, 0.06, dk);
    for (let y = 0.3; y < H; y += 0.35) { const t = y / H; b.box(0, y, w / 2 + 1.1 - 0.8 * t, 0.5, 0.04, 0.05, dk); }
    b.ch('lamp').w(o._r ?? 9).t('plain'); b.box(0.6, H + 1.6, w / 2 + 0.1, 0.25, 0.3, 0.25, 0xffd9a0); b.w(-1).ch('main');
    return { lights: [{ at: [0.6, H + 1.6, w / 2 + 0.6], color: LIGHT_COL.oil, radius: 12, intensity: 1.3, kind: 'lamp', flicker: true }] };
  };

  // ------------------------------------------------------------------ alleys & stoops
  P.alley_line = (b, r, o) => { // washing strung wall to wall along local x (no posts)
    const L = o.length || 3, y = o.height || 2.9;
    b.t('plain'); b.beam([-L / 2, y, 0], [L / 2, y - 0.12, 0], 0.01, 3, col(0x3a3020));
    b.t('fabric');
    for (let x = -L / 2 + 0.25; x < L / 2 - 0.2; x += r.range(0.4, 0.8)) {
      if (r.chance(0.2)) continue;
      const h = r.range(0.35, 0.9), w = r.range(0.3, 0.6);
      b.box(x, y - 0.06 - h / 2, 0, w, h, 0.02, col(r.pick(CLOTH.concat(MISC.cloth)), 0.08, r));
    }
  };
  P.alley_tarp = (b, r, o) => { // sagging tarp across an alley
    const L = o.length || 3, d = o.depth || 2.5, y = o.height || 3.0;
    b.t('fabric');
    const c = col(o.color || r.pick(CLOTH.concat(CANVAS)), 0.05, r);
    b.quad([-L / 2, y, -d / 2], [L / 2, y, -d / 2], [L / 2 * 0.95, y - 0.35, 0], [-L / 2 * 0.95, y - 0.35, 0], c);
    b.quad([-L / 2 * 0.95, y - 0.35, 0], [L / 2 * 0.95, y - 0.35, 0], [L / 2, y, d / 2], [-L / 2, y, d / 2], c.clone().offsetHSL(0, 0, -0.05));
  };
  P.chair = (b, r, o) => {
    const c = col(o.color || r.pick([WOOD.weathered, WOOD.fresh, 0x5f7f96, 0xa8473a, 0xd8ccb0, 0x4f6f5a]), 0.06, r);
    b.t('plain'); // flat faded paint, no wood grain
    b.box(0, 0.45, 0, 0.44, 0.05, 0.42, c);
    b.box(0, 0.75, -0.2, 0.44, 0.55, 0.05, c);
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) b.box(x, 0.22, z, 0.04, 0.45, 0.04, c);
  };
  P.cafe_table = (b, r, o) => {
    const c = col(r.pick([WOOD.weathered, 0xd8ccb0, 0x8a8a80]), 0.05, r);
    b.t('wood'); b.cyl(0, 0.72, 0, 0.42, 0.42, 0.04, 9, c); b.box(0, 0.36, 0, 0.06, 0.72, 0.06, c); b.cyl(0, 0.02, 0, 0.25, 0.25, 0.04, 6, c);
    for (let i = 0; i < (o.chairs ?? 2); i++) { const a = (i / (o.chairs ?? 2)) * Math.PI * 2 + 0.4; b.pushT(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75, a + Math.PI); P.chair(b, r, {}); b.pop(); }
    if (r.chance(0.5)) { b.t('plain'); b.cyl(0.1, 0.8, 0, 0.05, 0.04, 0.14, 6, col(r.pick([0x5f7f6a, 0xa8603e, 0xd8ccb0]))); }
  };
  P.pot_plant = (b, r, o) => {
    const n = o.count || r.int(1, 4);
    for (let i = 0; i < n; i++) pottedPlant(b, r, (i - (n - 1) / 2) * 0.45 + r.range(-0.05, 0.05), 0, 0, r.chance(0.3), o.kind ? { kind: o.kind } : {});
  };
  P.water_jugs = (b, r, o) => {
    const n = o.count || r.int(2, 5);
    b.t('plain');
    for (let i = 0; i < n; i++) b.cyl((i % 3) * 0.32 - 0.3, 0.2 + Math.floor(i / 3) * 0.4, Math.floor(i / 3) * 0.05, 0.14, 0.15, 0.4, 7, col(r.pick([0x5f7f96, 0x8a9a8a, 0xd8ccb0, 0x4a6a7a]), 0.05, r));
  };
  P.cables = (b, r, o) => { // sagging cables across a gap (local x), between two wall heights
    const L = o.length || 4, y = o.height || 4.2;
    b.t('plain');
    for (let k = 0; k < (o.count || r.int(2, 4)); k++) {
      const yy = y + r.range(-0.4, 0.4), sag = r.range(0.2, 0.6), z = r.range(-0.4, 0.4), c = col(0x22201e);
      const P2 = (t) => [-L / 2 + L * t, yy - sag * 4 * t * (1 - t), z];
      for (let i = 0; i < 6; i++) b.beam(P2(i / 6), P2((i + 1) / 6), 0.015, 3, c);
    }
  };
  P.outcrop = (b, r, o) => { // weathered rock outcrop: a cluster of deformed boulders
    const R = o.radius || 4, n = o.count || r.int(4, 8);
    const rc = col(o.color || r.pick([0x9a8b78, 0xa08a70, 0x8e8070, 0xb09478]), 0.04, r);
    b.t('rock');
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2, d = r.next() * R * 0.6;
      const sx = r.range(0.4, 1) * R * 0.55, sy = r.range(0.35, 1) * R * (o.tall ? 0.9 : 0.45);
      b.blob(Math.cos(a) * d, sy * 0.45, Math.sin(a) * d, sx, sy, sx * r.range(0.6, 1.1), rc.clone().offsetHSL(0, 0, (r.next() - 0.5) * 0.06), r.chance(0.5) ? 'dodec' : 'ico', r.next() * 6);
    }
  };

  Object.assign(PROP_LIGHT, { forge: { electric: false }, watchtower: { electric: false, essential: true } });
  Object.assign(DEF_LAYER, {
    tent_aframe: 'fabric', tent_wall: 'fabric', tent_bell: 'fabric', lean_to: 'fabric', bedroll: 'fabric', wagon: 'wood', hitching_rail: 'wood',
    stall: 'wood', tarp_stall: 'fabric', cart_shop: 'wood', shade_cloth: 'fabric', goods: 'wood', meat_rack: 'wood', hide_frame: 'wood',
    forge: 'stone', tan_pit: 'stone', planter: 'wood', chickens: 'plain', chicken_coop: 'wood', kiln: 'adobe', lumber: 'wood', drying_rack: 'wood',
    barrier: 'wood', guard_shack: 'wood', sandbags: 'fabric', tank_trap: 'metal', wire_coil: 'metal', watchtower: 'wood',
    alley_line: 'fabric', alley_tarp: 'fabric', chair: 'wood', cafe_table: 'wood', pot_plant: 'plain', water_jugs: 'plain', cables: 'plain', outcrop: 'rock',
  });
}

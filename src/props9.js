// Prop pass 9: vehicles, carts and street vendors. Every one rolls its own variant (paint, wear, load, cover, missing
// parts), so no two look alike. Front = +Z (the shafts / tongue / nose), wheels turn about local x.
//  vehicles & carts: brahmin_wagon, farm_cart, hulk_wagon, pack_burro, handcart, shopping_cart, cargo_trike,
//                    rebuilt_truck, motorcycle, caravan_trailer
//  street vendors:   elote_cart, raspados_cart, skewer_grill, water_seller, scrap_blanket, basket_table, nuka_shack
import * as THREE from 'three';
import { col } from './builder.js';
import { WOOD, METAL, GLASS } from './palette.js';
import { drawGoods } from './props-temp.js';

const CAR = [0x7a9a96, 0xb8a888, 0x8a4a3a, 0x6a7a8a, 0xa89a6a, 0x5f6a5a, 0xc8b8a0, 0x8a2a22, 0x2a4a6a];
const FADED = [0x5f7f96, 0xa8473a, 0x4f6f5a, 0xc9a65a, 0xd8ccb0, 0x7a5a8a, 0x8a8a7a];
const CANVAS = [0xc8b896, 0xb8a882, 0xa89a78, 0x9a9070, 0xd2c4a2, 0x8f9474];
const rust = (r) => col(r.pick([METAL.rust, METAL.rust2, 0x7a4a30]), 0.06, r);
const wood = (r) => col(r.pick([WOOD.weathered, WOOD.fresh, WOOD.dark, 0x8a7a62]), 0.06, r);

// spoked wheel in the y-z plane (axle along x), centre (x, y, z)
function wheel(b, x, y, z, R, c, { spokes = 8, n = 14, t = 0.045, hub = null, solid = false, tread = null } = {}) {
  const P = (a, rr = R) => [x, y + Math.sin(a) * rr, z + Math.cos(a) * rr];
  if (solid) { b.cyl(x, y, z, R, R, t * 2.4, 14, c, 0, 0, Math.PI / 2); b.cyl(x, y, z, R * 0.35, R * 0.35, t * 2.8, 8, hub || c.clone().offsetHSL(0, 0, -0.1), 0, 0, Math.PI / 2); return; }
  for (let k = 0; k < n; k++) b.beam(P((k / n) * Math.PI * 2), P(((k + 1) / n) * Math.PI * 2), t, 4, tread || c);
  for (let k = 0; k < spokes; k++) { const a = (k / spokes) * Math.PI * 2; b.beam([x, y, z], P(a, R * 0.96), t * 0.45, 3, c); }
  b.cyl(x, y, z, R * 0.14, R * 0.14, t * 3, 8, hub || c.clone().offsetHSL(0, 0, -0.12), 0, 0, Math.PI / 2);
}
// a load on a flat bed (w × d) at height y: hay, sacks, barrels, firewood, crates, scrap, jugs or nothing
function load(b, r, kind, y, w, d) {
  switch (kind) {
    case 'hay': b.t('thatch'); for (let i = 0; i < 2; i++) b.box(r.range(-0.05, 0.05), y + 0.25 + i * 0.42, 0, w * 0.95, 0.42, d * (0.9 - i * 0.15), col(0xc8b070, 0.06, r), r.range(-0.05, 0.05)); break;
    case 'barrels': { b.t('metal'); const n = Math.max(2, Math.floor(w / 0.6) * Math.floor(d / 0.7)); for (let i = 0; i < n; i++) { const cx = -w / 2 + 0.32 + (i % Math.floor(w / 0.6)) * 0.62, cz = -d / 2 + 0.38 + Math.floor(i / Math.floor(w / 0.6)) * 0.72; if (cz > d / 2 - 0.3) break; b.cyl(cx, y + 0.42, cz, 0.28, 0.28, 0.84, 9, col(r.pick([METAL.rust, 0x4a6a6a, 0x3a5a3a, 0x5f7f96, 0x8a8c8e]), 0.06, r)); } break; }
    case 'wood': b.t('bark'); for (let i = 0; i < Math.round(w * d * 9); i++) b.cyl(r.range(-w / 2 + 0.1, w / 2 - 0.1), y + 0.08 + Math.floor(i / 6) * 0.14, r.range(-0.08, 0.08), 0.06, 0.07, d * r.range(0.75, 0.95), 5, col(r.pick([0x6a5240, 0x7a6248, 0x5a4434]), 0.06, r), Math.PI / 2, 0, 0); break;
    case 'jugs': b.t('plain'); for (let i = 0; i < Math.round(w * d * 5); i++) b.box(r.range(-w / 2 + 0.15, w / 2 - 0.15), y + 0.23, r.range(-d / 2 + 0.15, d / 2 - 0.15), 0.18, 0.46, 0.32, col(r.pick([0x5a6a3a, 0xa8473a, 0x4a5a6a, 0xc9a65a]), 0.06, r), r.next() * 3); break;
    case 'none': break;
    default: drawGoods(b, r, 0, y, 0, w, d, kind);
  }
}
const pickLoad = (r, opts) => r.weighted(opts);

export function addVehicleProps(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // ---------------------------------------------------------------- animal-drawn
  P.brahmin_wagon = (b, r, o) => { // four-wheel freight wagon: plank bed, painted side boards, tongue + yoke; covered or loaded
    const Lb = o.length || r.range(3.4, 4.3), W = r.range(1.5, 1.8), wc = wood(r), paint = r.chance(0.55) ? col(r.pick(FADED), 0.06, r) : null;
    const Rf = r.range(0.45, 0.55), Rb = r.range(0.6, 0.72), bedY = Rb + 0.3, wcD = col(WOOD.dark, 0.05, r);
    b.t('wood').box(0, bedY, 0, W, 0.12, Lb, wc);
    const sideH = r.range(0.35, 0.6);
    for (const s of [-1, 1]) { b.box(s * (W / 2 - 0.04), bedY + sideH / 2, 0, 0.07, sideH, Lb, paint || wc); if (paint && r.chance(0.6)) b.box(s * (W / 2), bedY + sideH * 0.5, 0, 0.02, 0.08, Lb * 0.9, col(r.pick([0xd8ccb0, 0xc9a65a, 0x2a2622]), 0.05, r)); }
    b.box(0, bedY + sideH / 2, -Lb / 2 + 0.04, W, sideH, 0.07, paint || wc);
    b.box(0, bedY - 0.15, 0, 0.14, 0.16, Lb * 0.9, wcD); // reach pole
    for (const [z, R] of [[Lb / 2 - 0.6, Rf], [-Lb / 2 + 0.6, Rb]]) { for (const s of [-1, 1]) wheel(b, s * (W / 2 + 0.1), R, z, R, wcD, { spokes: r.pick([8, 10, 12]), tread: col(r.chance(0.4) ? 0x3a3a38 : 0x5a4a3a) }); b.box(0, R, z, W + 0.25, 0.08, 0.08, wcD); }
    const tongueDown = r.chance(0.7);
    b.plank([0, Rf, Lb / 2 - 0.4], [0, tongueDown ? 0.08 : Rf + 0.1, Lb / 2 + 2.1], 0.09, 0.09, wc);
    if (r.chance(0.6)) b.box(0, tongueDown ? 0.12 : Rf + 0.12, Lb / 2 + 1.9, 1.3, 0.08, 0.1, wcD); // yoke
    b.box(0, bedY + 0.35, Lb / 2 - 0.25, W * 0.9, 0.08, 0.35, wc); // seat board
    const cover = o.cover ?? r.weighted({ canvas: 3, patched: 1.5, none: 2.5 });
    if (cover !== 'none') {
      const c0 = col(o.color || r.pick(CANVAS), 0.05, r), R = W / 2 + 0.05, y0 = bedY + sideH, seg = 6, z0 = Lb / 2 - 0.2, z1 = -Lb / 2 + 0.15;
      b.t('fabric');
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI, x0 = Math.cos(a0) * R, h0 = Math.sin(a0) * R * 1.2, x1 = Math.cos(a1) * R, h1 = Math.sin(a1) * R * 1.2;
        b.quad([x0, y0 + h0, z0], [x1, y0 + h1, z0], [x1, y0 + h1, z1], [x0, y0 + h0, z1], c0.clone().offsetHSL(0, 0, -0.02 * (i % 2)));
        b.tri([x0, y0 + h0, z1], [x1, y0 + h1, z1], [0, y0, z1], c0.clone().offsetHSL(0, 0, -0.07));
      }
      if (cover === 'patched') for (let k = 0; k < r.int(2, 5); k++) { const a = r.range(0.3, 2.8), zz = r.range(z1 + 0.4, z0 - 0.4); b.box(Math.cos(a) * (R + 0.02), y0 + Math.sin(a) * R * 1.2 + 0.01, zz, 0.5, 0.02, r.range(0.4, 0.8), col(r.pick([0x8a7a5a, 0x6a6a58, 0xa8473a, 0x5f7f96]), 0.06, r), 0, 0, Math.PI / 2 - a); }
    } else load(b, r, o.load || pickLoad(r, { sacks: 2, hay: 1.5, barrels: 1.5, wood: 1, crates: 1.2, scrap: 0.8, none: 0.6 }), bedY + 0.06, W - 0.25, Lb - 0.4);
    if (o.animal ?? r.chance(0.55)) { b.pushT(W / 2 + r.range(1.0, 1.6), 0, Lb / 2 + r.range(0.5, 1.8), r.range(-0.5, 0.5)); P.brahmin(b, r, { pose: r.chance(0.7) ? 'stand' : 'graze' }); b.pop(); }
    return {};
  };
  L('brahmin_wagon', 'wood');

  P.farm_cart = (b, r, o) => { // two big wheels, high slatted sides, shafts forward (resting on a prop stick or the ground)
    const W = r.range(1.2, 1.5), Lb = r.range(1.8, 2.4), R = r.range(0.65, 0.8), wc = wood(r), paint = r.chance(0.35) ? col(r.pick(FADED), 0.08, r) : wc, dk = col(WOOD.dark, 0.05, r);
    const tilt = r.chance(0.6) ? 0.18 : -0.05; // shafts down to the ground, or level on a stick
    b.push(new THREE.Matrix4().makeTranslation(0, R, 0).multiply(new THREE.Matrix4().makeRotationX(tilt)));
    b.t('wood').box(0, 0.12, 0, W, 0.1, Lb, wc);
    const H = r.range(0.4, 0.75), slats = r.int(3, 5);
    for (const s of [-1, 1]) { for (let i = 0; i < slats; i++) b.box(s * W / 2, 0.17 + ((i + 0.5) * H) / slats, 0, 0.05, 0.08, Lb, i % 2 ? paint : wc); for (const z of [-Lb / 2 + 0.05, 0, Lb / 2 - 0.05]) b.box(s * W / 2, 0.17 + H / 2, z, 0.07, H, 0.07, dk); }
    if (r.chance(0.7)) for (let i = 0; i < slats; i++) b.box(0, 0.17 + ((i + 0.5) * H) / slats, -Lb / 2, W, 0.08, 0.05, wc);
    for (const s of [-1, 1]) b.plank([s * 0.35, 0.08, Lb / 2 - 0.3], [s * 0.3, 0.08, Lb / 2 + 1.9], 0.07, 0.08, wc);
    load(b, r, o.load || pickLoad(r, { hay: 2, sacks: 2, produce: 1.5, wood: 1.5, barrels: 1, jugs: 1, none: 1 }), 0.17, W - 0.15, Lb - 0.2);
    b.pop();
    for (const s of [-1, 1]) wheel(b, s * (W / 2 + 0.12), R, 0, R, dk, { spokes: r.pick([6, 8, 10]), solid: r.chance(0.25), tread: col(0x4a4038) });
    b.t('wood').box(0, R, 0, W + 0.3, 0.08, 0.08, dk);
    if (tilt < 0) b.plank([0, 0, Lb / 2 + 1.6], [0, R + 0.05, Lb / 2 + 1.5], 0.05, 0.05, dk); // prop stick
    return {};
  };
  L('farm_cart', 'wood');

  P.hulk_wagon = (b, r, o) => { // pre-war sedan with the engine gone and the roof cut off, on its old wheels, pulled by brahmin
    const paint = col(r.pick(CAR), 0.06, r), rs = rust(r), dark = col(0x222220), y = 0.38;
    b.t('metal');
    b.box(0, y + 0.35, 0, 1.85, 0.5, 4.2, paint);
    b.box(0, y + 0.28, 2.15, 1.7, 0.36, 0.35, paint); b.box(0, y + 0.28, -2.15, 1.7, 0.36, 0.35, paint);
    b.t('plain').box(0, y + 0.62, 1.4, 1.6, 0.04, 1.1, dark); // empty engine bay
    b.t('fabric'); for (const z of [0.2, -0.9]) { b.box(0, y + 0.65, z, 1.5, 0.12, 0.6, col(r.pick([0x6a3a2a, 0x8a7a5a, 0x3a3a3a]), 0.06, r)); b.box(0, y + 0.95, z - 0.28, 1.5, 0.5, 0.1, col(r.pick([0x6a3a2a, 0x8a7a5a, 0x3a3a3a]), 0.06, r)); }
    b.t('metal'); for (const s of [-1, 1]) for (const z of [0.9, -1.7]) b.box(s * 0.82, y + 0.75, z, 0.06, 0.25, 0.08, paint); // cut-off pillars
    for (let i = 0; i < r.int(3, 7); i++) b.box(r.chance(0.5) ? 0.93 : -0.93, y + r.range(0.2, 0.5), r.range(-1.9, 1.9), 0.02, r.range(0.15, 0.4), r.range(0.3, 0.9), rs);
    if (r.chance(0.5)) b.t('wood').box(0, y + 0.62, -1.6, 1.5, 0.08, 0.9, wood(r)); // a plank deck in the back
    if (r.chance(0.5)) load(b, r, pickLoad(r, { sacks: 2, crates: 1.5, jugs: 1 }), y + 0.66, 1.3, 0.8);
    b.t('plain'); for (const [x, z] of [[-0.9, 1.35], [0.9, 1.35], [-0.9, -1.35], [0.9, -1.35]]) { b.cyl(x, 0.36, z, 0.36, 0.36, 0.22, 12, dark, 0, 0, Math.PI / 2); b.cyl(x, 0.36, z, 0.18, 0.18, 0.24, 8, col(0x8a8c8e), 0, 0, Math.PI / 2); }
    b.t('wood'); const wc = wood(r); b.plank([0, 0.45, 2.3], [0, r.chance(0.6) ? 0.1 : 0.5, 4.3], 0.09, 0.09, wc); b.box(0, 0.3, 4.1, 1.4, 0.08, 0.1, wc);
    if (o.animal ?? r.chance(0.6)) { const n = r.chance(0.4) ? 2 : 1; for (let k = 0; k < n; k++) { b.pushT(n === 2 ? (k ? 0.7 : -0.7) : r.range(-0.3, 0.3), 0, 4.9, r.range(-0.15, 0.15)); P.brahmin(b, r, { pose: 'stand' }); b.pop(); } }
    return {};
  };
  L('hulk_wagon', 'metal');

  P.pack_burro = (b, r, o) => { // a burro with a sawbuck pack frame: jerrycans, baskets, firewood or sacks
    P.burro(b, r, {});
    const kind = o.load || r.weighted({ jerrycans: 2, baskets: 2, wood: 1.5, sacks: 1.5 }), fw = col(WOOD.weathered, 0.06, r);
    b.t('wood'); for (const z of [-0.18, 0.18]) { b.beam([-0.22, 0.9, z], [0, 1.18, z], 0.02, 3, fw); b.beam([0.22, 0.9, z], [0, 1.18, z], 0.02, 3, fw); }
    b.t('fabric').box(0, 1.03, 0, 0.5, 0.06, 0.6, col(r.pick([0xa83a32, 0x5f7f96, 0x8a6a4a, 0xc9a65a]), 0.06, r)); // blanket
    for (const s of [-1, 1]) {
      const x = s * 0.34;
      if (kind === 'jerrycans') { b.t('metal'); for (const z of [-0.14, 0.14]) b.box(x, 0.86, z, 0.14, 0.4, 0.26, col(r.pick([0x5a6a3a, 0xa8473a, 0x4a5a6a]), 0.06, r)); }
      else if (kind === 'baskets') { b.t('thatch').cyl(x, 0.84, 0, 0.2, 0.16, 0.42, 9, col(r.pick([0xa88a5a, 0x9a7a4a, 0xb89a6a]), 0.05, r)); if (r.chance(0.6)) drawGoods(b, r, x, 1.04, 0, 0.3, 0.3, r.pick(['produce', 'pottery'])); }
      else if (kind === 'wood') { b.t('bark'); for (let i = 0; i < 5; i++) b.cyl(x + r.range(-0.08, 0.08), 0.75 + (i % 3) * 0.1, 0, 0.04, 0.05, 0.8, 5, col(r.pick([0x6a5240, 0x7a6248]), 0.06, r), Math.PI / 2, 0, 0); }
      else { b.t('fabric').box(x, 0.86, 0, 0.2, 0.36, 0.42, col(r.pick([0xc8b896, 0xb8a882, 0x9a8a6a]), 0.05, r)); }
    }
    return {};
  };
  L('pack_burro', 'hide');

  // ---------------------------------------------------------------- hand-powered
  P.handcart = (b, r, o) => { // two-wheel pull cart, long shafts resting on the ground
    const R = r.range(0.38, 0.5), W = r.range(0.9, 1.1), Lb = r.range(1.2, 1.6), wc = wood(r), dk = col(WOOD.dark, 0.05, r), pitch = Math.atan2(R - 0.05, Lb / 2 + 1.4);
    b.push(new THREE.Matrix4().makeTranslation(0, R, 0).multiply(new THREE.Matrix4().makeRotationX(pitch)));
    b.t('wood').box(0, 0.06, 0, W, 0.07, Lb, wc);
    const sides = r.chance(0.7), H = r.range(0.2, 0.4);
    if (sides) for (const s of [-1, 1]) b.box(s * W / 2, 0.08 + H / 2, 0, 0.05, H, Lb, wc);
    for (const s of [-1, 1]) b.plank([s * 0.3, 0.04, 0], [s * 0.27, 0.04, Lb / 2 + 1.4], 0.05, 0.06, wc);
    b.box(0, 0.04, Lb / 2 + 1.35, 0.62, 0.05, 0.05, dk);
    load(b, r, o.load || pickLoad(r, { wood: 2, scrap: 1.5, crates: 1.5, jugs: 1, sacks: 1.5, produce: 1, none: 1.2 }), 0.1, W - 0.12, Lb - 0.15);
    b.pop();
    const metal = r.chance(0.45), wcol = metal ? col(0x2a2a28) : dk;
    for (const s of [-1, 1]) wheel(b, s * (W / 2 + 0.08), R, 0, R, wcol, { spokes: metal ? 6 : 8, n: 12, t: metal ? 0.05 : 0.04, solid: r.chance(0.2) });
    return {};
  };
  L('handcart', 'wood');

  P.shopping_cart = (b, r, o) => { // a pre-war shopping cart full of junk, often under a tarp; rusty, a wheel gone
    const c = r.chance(0.6) ? rust(r) : col(0x9a9c9e, 0.05, r), dk = col(0x2a2a28), tip = r.chance(0.3) ? 0.08 : 0;
    b.push(new THREE.Matrix4().makeRotationZ(tip));
    b.t(r.chance(0.5) ? 'rust' : 'metal');
    const x0 = -0.27, x1 = 0.27, z0 = -0.45, z1 = 0.4, y0 = 0.45, y1 = 0.98;
    for (let x = x0; x <= x1 + 1e-3; x += 0.09) { b.beam([x, y0, z0], [x, y1, z0 - 0.08], 0.008, 3, c); b.beam([x, y0, z1], [x, y1, z1 + 0.06], 0.008, 3, c); b.beam([x, y0, z0], [x, y0, z1], 0.008, 3, c); }
    for (let z = z0; z <= z1 + 1e-3; z += 0.1) for (const x of [x0, x1]) b.beam([x, y0, z], [x, y1, z], 0.008, 3, c);
    for (let y = y0; y <= y1 + 1e-3; y += 0.13) for (const x of [x0, x1]) b.beam([x, y, z0 - (y - y0) * 0.15], [x, y, z1 + (y - y0) * 0.11], 0.008, 3, c);
    b.beam([x0 - 0.03, 1.05, z0 - 0.12], [x1 + 0.03, 1.05, z0 - 0.12], 0.016, 4, r.chance(0.5) ? col(0xa8473a) : c); // handle
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.beam([x, y0, z], [x, 0.1, z], 0.012, 3, c);
    b.t('plain'); for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) if (!(tip && x > 0 && z > 0)) b.cyl(x, 0.06, z, 0.06, 0.06, 0.04, 8, dk, 0, 0, Math.PI / 2);
    load(b, r, o.load || pickLoad(r, { scrap: 2.5, jugs: 1, sacks: 1, crates: 1 }), y0 + 0.02, 0.5, 0.8);
    if (r.chance(0.45)) b.t('fabric').box(0, y1 + 0.03, -0.02, 0.62, 0.03, 0.98, col(r.pick([0x5f7f96, 0x8a7a5a, 0x4f6f5a, 0xa8473a]), 0.08, r), 0, r.range(-0.08, 0.08));
    b.pop();
    return {};
  };
  L('shopping_cart', 'metal');

  // cargo tricycle: a box between two front wheels, rear wheel + saddle; goods by trade (bread, smokes, ice, empty)
  const trike = (b, r, o, goods) => {
    const c = col(r.pick(FADED), 0.06, r), bc = r.chance(0.5) ? col(r.pick(FADED), 0.06, r) : wood(r), dk = col(0x1c1c1a);
    b.t('metal');
    for (const s of [-1, 1]) wheel(b, s * 0.42, 0.3, 0.6, 0.3, dk, { spokes: 8, n: 12, t: 0.025, hub: col(0x8a8c8e) });
    wheel(b, 0, 0.32, -0.9, 0.32, dk, { spokes: 8, n: 12, t: 0.025, hub: col(0x8a8c8e) });
    b.box(0, 0.38, 0.6, 0.95, 0.04, 0.04, c);
    b.beam([0, 0.42, 0.45], [0, 0.32, -0.9], 0.022, 4, c); b.beam([0, 0.42, 0.25], [0, 0.85, -0.45], 0.022, 4, c); b.beam([0, 0.85, -0.45], [0, 0.32, -0.9], 0.02, 4, c);
    b.box(0, 0.88, -0.48, 0.22, 0.05, 0.1, col(0x2a2622)); b.beam([0, 0.42, 0.25], [0, 1.0, 0.22], 0.02, 4, c); b.box(0, 1.0, 0.22, 0.55, 0.03, 0.03, col(0x3a3a38));
    b.t(bc.getHex && r.chance(0.5) ? 'wood' : 'metal').box(0, 0.68, 0.62, 0.9, 0.5, 0.62, bc);
    if (goods === 'bread') { b.t('plain'); b.box(0, 0.94, 0.62, 0.88, 0.04, 0.6, col(0xb8a070)); for (let i = 0; i < 14; i++) b.box(r.range(-0.36, 0.36), 0.99, 0.62 + r.range(-0.22, 0.22), 0.12, 0.06, 0.1, col(r.pick([0xb07840, 0xc89050, 0x8a5a30, 0xd8a868]), 0.06, r), r.next() * 3); }
    else if (goods === 'smokes') { b.t('plain'); for (let i = 0; i < 18; i++) b.box(-0.36 + (i % 6) * 0.14, 0.95 + Math.floor(i / 6) * 0.04, 0.48 + Math.floor(i / 6) * 0.14, 0.11, 0.03, 0.12, col(r.pick([0xd8d4c8, 0xa8473a, 0x2a4a6a, 0xc9a65a, 0x3a5a3a]), 0.05, r)); }
    else if (goods === 'ice') { b.t('plain').box(0, 0.96, 0.62, 0.86, 0.06, 0.58, col(0xd8dcd8)); }
    const sign = { bread: ['PAN', 'PAN DULCE', 'BOLILLOS'], smokes: ['CIGARROS', 'TABACO · CERILLOS'], ice: ['PALETAS', 'HIELO'] }[goods];
    if (o.umbrella ?? r.chance(0.5)) { b.t('metal').beam([0.42, 0.6, 0.35], [0.42, 1.9, 0.35], 0.015, 4, col(0x8a8c8e)); b.t('fabric').cone(0.42, 2.0, 0.35, 0.8, 0.3, 8, col(r.pick([0xe8e0d0, 0xa83a32, 0x2f6a8a, 0xd8a040]), 0.04, r)); }
    return sign ? { signs: [{ text: r.pick(sign), x: 0, y: 0.68, z: 0.94, ry: 0, w: 0.8, h: 0.28, style: 'painted' }] } : {};
  };
  P.cargo_trike = (b, r, o) => trike(b, r, o, o.goods || r.weighted({ empty: 2, bread: 1, smokes: 1, ice: 0.6 }));
  L('cargo_trike', 'metal');
  P.bread_trike = (b, r, o) => trike(b, r, o, r.weighted({ bread: 2, smokes: 1 }));
  L('bread_trike', 'metal');

  // ---------------------------------------------------------------- motor (rare)
  P.rebuilt_truck = (b, r, o) => { // a running pickup kept alive with scrap: odd panels, wood bed sides, a wood-gas burner or gas bottle
    P.pickup(b, r, { color: r.pick(CAR) });
    const rs = rust(r);
    b.t('metal');
    for (let i = 0; i < r.int(2, 5); i++) { const s = r.chance(0.5) ? 1 : -1; b.box(s * 0.89, r.range(0.6, 1.2), r.range(-1.8, 1.6), 0.02, r.range(0.3, 0.6), r.range(0.4, 1.0), r.chance(0.5) ? rs : col(r.pick(CAR), 0.06, r)); }
    if (r.chance(0.5)) { b.t('wood'); const wc = wood(r); for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box(s * 0.86, 1.15 + k * 0.17, -1.15, 0.05, 0.12, 2.1, wc); }
    const fuel = r.weighted({ woodgas: 2, bottle: 1.5, none: 1 });
    if (fuel === 'woodgas') { b.t('rust').cyl(0.55, 1.4, -0.3, 0.26, 0.26, 1.2, 10, rs); b.cyl(0.55, 2.05, -0.3, 0.1, 0.1, 0.15, 8, col(0x2a2a28)); b.t('metal').beam([0.55, 1.6, -0.1], [0.55, 1.2, 0.0], 0.04, 5, col(0x5a5a58)); }
    else if (fuel === 'bottle') { b.t('metal').cyl(-0.5, 1.45, -0.4, 0.17, 0.17, 0.85, 10, col(r.pick([0xc9a65a, 0x8a8c8e, 0x4a6a6a]), 0.05, r)); }
    if (r.chance(0.4)) { b.t('metal'); for (const s of [-1, 1]) b.box(s * 0.65, 1.7, 0.55, 0.04, 0.04, 1.0, col(METAL.dark)); b.box(0, 1.72, 0.9, 1.3, 0.04, 0.04, col(METAL.dark)); load(b, r, pickLoad(r, { jugs: 1, sacks: 1, crates: 1 }), 1.72, 1.1, 0.8); }
    if (r.chance(0.6)) load(b, r, pickLoad(r, { barrels: 1, crates: 1.5, scrap: 1, sacks: 1.2, none: 1 }), 1.04, 1.4, 1.9);
    return {};
  };
  L('rebuilt_truck', 'metal');

  P.motorcycle = (b, r, o) => { // a pre-war motorcycle on its stand (local z along the bike); saddlebags, maybe a sidecar
    const c = col(r.pick([...CAR, 0x2a2a28]), 0.06, r), dk = col(0x1c1c1a), ch = col(0x8a8c8e), rs = rust(r), worn = r.chance(0.5);
    b.push(new THREE.Matrix4().makeRotationZ(0.1)); // leaning on the stand
    b.t('metal');
    for (const z of [0.72, -0.72]) wheel(b, 0, 0.33, z, 0.33, dk, { spokes: 10, n: 14, t: 0.05, hub: ch });
    b.beam([0, 0.33, 0.72], [0, 0.95, 0.42], 0.03, 5, ch); b.beam([0, 0.55, -0.6], [0, 0.85, 0.35], 0.035, 5, c); b.beam([0, 0.42, -0.1], [0, 0.85, 0.35], 0.035, 5, c);
    b.box(0, 0.9, 0.18, 0.28, 0.2, 0.5, worn && r.chance(0.5) ? rs : c); // tank
    b.box(0, 0.85, -0.3, 0.26, 0.1, 0.55, col(0x2a2622)); // seat
    b.box(0, 0.42, 0.0, 0.3, 0.3, 0.4, col(0x4a4a48)); // engine
    b.beam([0.1, 0.32, 0.05], [0.18, 0.4, -0.8], 0.035, 5, ch); // exhaust
    b.box(0, 1.05, 0.45, 0.75, 0.03, 0.03, ch); b.box(0, 0.95, 0.52, 0.16, 0.14, 0.08, ch); // bars, lamp
    b.box(0, 0.62, 0.72, 0.16, 0.04, 0.4, c); b.box(0, 0.62, -0.72, 0.16, 0.04, 0.45, c); // mudguards
    if (o.bags ?? r.chance(0.6)) for (const s of [-1, 1]) b.t('hide').box(s * 0.22, 0.65, -0.55, 0.12, 0.28, 0.38, col(r.pick([0x5a3a28, 0x6a4a30, 0x3a3a38]), 0.06, r));
    b.pop();
    if (o.sidecar ?? r.chance(0.2)) { b.t('metal').box(0.75, 0.55, 0, 0.55, 0.4, 1.3, c); wheel(b, 1.08, 0.3, 0, 0.3, dk, { spokes: 8, n: 12, t: 0.04 }); b.box(0.42, 0.45, 0.2, 0.4, 0.04, 0.04, ch); }
    return {};
  };
  L('motorcycle', 'metal');

  P.caravan_trailer = (b, r, o) => { // a pre-war camper shell on two wheels: someone's home; awning, patched panels, propped on blocks
    const c = col(r.pick([0xd8d4c8, 0xc8b8a0, 0xa8b8b0, 0xb8a888]), 0.05, r), band = col(r.pick([0x5f7f96, 0xa8473a, 0x4f6f5a, 0xc9a65a]), 0.05, r), Lt = r.range(3.6, 4.6), H = 2.0, W = 2.0;
    b.t('metal');
    b.box(0, 0.5 + H / 2, 0, W, H, Lt, c);
    b.cyl(0, 0.5 + H - 0.2, Lt / 2 - 0.05, W / 2, W / 2, 0.5, 12, c, Math.PI / 2, 0, 0); // rounded nose (half-hidden in the body)
    for (const s of [-1, 1]) b.box(s * (W / 2 + 0.01), 1.05, 0, 0.02, 0.14, Lt * 0.98, band);
    b.ch('glass').t('plain'); for (const z of [-Lt / 4, Lt / 4]) b.box(W / 2 + 0.02, 1.75, z, 0.02, 0.45, 0.7, r.chance(0.3) ? col(0x5a4a3a) : GLASS.dark); b.ch('main');
    b.t('metal').box(W / 2 + 0.02, 1.4, -0.1, 0.03, 1.7, 0.65, c.clone().offsetHSL(0, 0, -0.08)); // door
    for (let i = 0; i < r.int(1, 4); i++) b.box(r.chance(0.5) ? W / 2 + 0.025 : -W / 2 - 0.025, r.range(0.8, 2.1), r.range(-Lt / 2 + 0.4, Lt / 2 - 0.4), 0.02, r.range(0.3, 0.7), r.range(0.4, 1.0), rust(r));
    b.t('plain'); for (const s of [-1, 1]) { b.cyl(s * (W / 2 - 0.15), 0.35, -0.2, 0.35, 0.35, 0.22, 12, col(0x222220), 0, 0, Math.PI / 2); }
    b.t('metal').beam([0, 0.5, Lt / 2], [0, 0.4, Lt / 2 + 1.1], 0.05, 4, col(METAL.dark));
    b.t('concrete'); for (const z of [Lt / 2 - 0.3, -Lt / 2 + 0.3]) for (const s of [-1, 1]) b.box(s * 0.7, 0.25, z, 0.3, 0.5, 0.3, col(0x8a8478, 0.05, r));
    if (r.chance(0.65)) { // awning off the door side
      const ac = col(r.pick([...CANVAS, 0x5f7f96, 0xa8473a]), 0.06, r);
      b.t('fabric').box(W / 2 + 1.1, 2.3, 0, 2.2, 0.03, Lt * 0.6, ac, 0, 0, -0.12);
      b.t('metal'); for (const z of [-Lt * 0.3, Lt * 0.3]) b.beam([W / 2 + 2.15, 0, z], [W / 2 + 2.15, 2.18, z], 0.02, 4, col(0x8a8c8e));
      if (r.chance(0.6)) { b.t('plain'); P.chair(b, r, {}); }
    }
    b.t('metal').cyl(-0.6, 0.5 + H + 0.12, -Lt / 4, 0.03, 0.03, 0.25, 6, col(0x5a5a58)); // stove pipe
    return {};
  };
  L('caravan_trailer', 'metal');

  // ---------------------------------------------------------------- street vendors
  const pushcart = (b, r, c) => { // a box cart on two bicycle wheels with a push handle (shared by elotes / raspados)
    const st = col(METAL.steel, 0.04, r), dk = col(0x1c1c1a);
    b.t('metal').box(0, 0.85, 0, 1.3, 0.6, 0.7, c).box(0, 1.16, 0, 1.36, 0.04, 0.76, st);
    for (const s of [-1, 1]) { b.pushT(0.3, 0, s * 0.42, Math.PI / 2); wheel(b, 0, 0.38, 0, 0.38, dk, { spokes: 10, n: 14, t: 0.022, hub: st }); b.pop(); } // the axle runs front–back (z) on this cart
    b.box(-0.72, 0.62, 0, 0.06, 0.06, 0.55, st).box(-0.82, 0.35, 0, 0.05, 0.55, 0.05, st);
    b.beam([-0.65, 1.15, -0.25], [-1.0, 1.05, -0.25], 0.018, 4, st); b.beam([-0.65, 1.15, 0.25], [-1.0, 1.05, 0.25], 0.018, 4, st); b.beam([-1.0, 1.05, -0.25], [-1.0, 1.05, 0.25], 0.02, 4, st);
  };
  const parasol = (b, r, x, z, h = 2.2, cols = [0xe8e0d0, 0xa83a32, 0x2f6a8a, 0xd8a040, 0x3a7a5a], y0 = 0.9) => { // y0: where the pole starts (cart top, or 0 = the ground)
    b.t('metal').beam([x, y0, z], [x, h, z], 0.018, 4, col(METAL.dark));
    if (y0 < 0.1) b.cyl(x, 0.08, z, 0.16, 0.2, 0.16, 8, col(0x8a8478)); // a weighted foot
    const c = col(r.pick(cols), 0.04, r), c2 = r.chance(0.5) ? col(r.pick(cols), 0.04, r) : c;
    b.t('fabric'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box(x + Math.sin(a) * 0.5, h - 0.1, z + Math.cos(a) * 0.5, 0.75, 0.02, 0.55, k % 2 ? c : c2, a, 0.3); }
    b.cone(x, h + 0.08, z, 0.32, 0.2, 8, c); // close the crown
  };

  P.elote_cart = (b, r, o) => { // corn cart: a steaming pot, a cooler of mayo / chile, a hand bell, a parasol
    pushcart(b, r, col(r.pick([0xd8d0c0, 0xc8a040, 0x3a7a5a, 0xa83a32, 0xe8e0d0]), 0.05, r));
    b.t('metal').cyl(0.25, 1.38, 0, 0.3, 0.27, 0.42, 12, col(0x8a8c8e)); b.cyl(0.25, 1.6, 0, 0.31, 0.31, 0.03, 12, col(0x5a5a58));
    for (let k = 0; k < r.int(3, 6); k++) b.t('plain').cyl(0.25 + r.range(-0.15, 0.15), 1.68, r.range(-0.15, 0.15), 0.035, 0.035, 0.28, 6, col(0xd8b850, 0.06, r), r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4)); // cobs
    b.t('plain').box(-0.38, 1.3, 0, 0.42, 0.24, 0.32, col(r.pick([0xd8d4c8, 0x2a6aa8, 0xa8473a]), 0.05, r)); // cooler
    for (let k = 0; k < 3; k++) b.cyl(-0.4 + k * 0.1, 1.48, 0.18, 0.03, 0.03, 0.12, 6, col([0xe8e0c0, 0xa83020, 0xd8d0b0][k]));
    if (r.chance(0.6)) b.t('metal').cyl(0.6, 1.25, 0.3, 0.05, 0.03, 0.08, 8, col(0xc9a65a));
    if (o.umbrella ?? r.chance(0.75)) parasol(b, r, 0.0, 0.3);
    return { signs: [{ text: r.pick(['ELOTES', 'ELOTES · ESQUITES', 'ESQUITES']), x: 0, y: 0.85, z: 0.36, ry: 0, w: 1.0, h: 0.3, style: 'painted' }], emitters: [{ type: 'smoke', p: [0.25, 1.7, 0], small: true }] };
  };
  L('elote_cart', 'metal');

  P.raspados_cart = (b, r, o) => { // shaved ice: a block under burlap, syrup bottles in a row, a striped tin canopy
    pushcart(b, r, col(r.pick([0xe8e0d0, 0x5f9fb6, 0xd8a8b8, 0xc8d8a0]), 0.05, r));
    b.t('plain').box(0.25, 1.3, 0, 0.42, 0.26, 0.36, col(0xdce4e8)); b.t('fabric').box(0.25, 1.45, 0, 0.46, 0.04, 0.4, col(0xa89068, 0.05, r));
    const syr = [0xc82030, 0x30a040, 0x2a50c8, 0xe89020, 0xd8c830, 0x8a2a6a, 0xd84a8a];
    for (let k = 0; k < r.int(5, 8); k++) b.t('plain').cyl(-0.55 + k * 0.1, 1.33, -0.25, 0.035, 0.035, 0.3, 6, col(r.pick(syr), 0.05, r));
    for (let k = 0; k < 6; k++) b.cyl(-0.55 + (k % 3) * 0.08, 1.24 + Math.floor(k / 3) * 0.03, 0.22, 0.04, 0.025, 0.1, 6, col(0xe8e0d0));
    const c1 = col(r.pick([0xa83a32, 0x2f6a8a, 0x3a7a5a]), 0.04, r), c2 = col(0xe8e0d0, 0.03, r);
    b.t('metal'); for (const [x, z] of [[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]]) b.beam([x, 1.18, z], [x, 2.05, z], 0.014, 4, col(METAL.steel));
    for (let k = 0; k < 6; k++) b.box(-0.6 + 0.2 + k * 0.2 - 0.1, 2.08, 0, 0.2, 0.03, 0.82, k % 2 ? c1 : c2);
    return { signs: [{ text: r.pick(['RASPADOS', 'RASPADOS · NIEVE', 'HIELO RASPADO']), x: 0, y: 0.85, z: 0.36, ry: 0, w: 1.05, h: 0.3, style: 'painted' }] };
  };
  L('raspados_cart', 'metal');

  P.skewer_grill = (b, r, o) => { // brahmin skewers on a half-drum grill, a tarp lean-to, a string of jerky drying
    const rs = rust(r), pc = col(WOOD.pole, 0.05, r);
    b.t('rust'); b.cyl(0, 0.85, 0, 0.32, 0.32, 1.0, 10, rs, 0, 0, Math.PI / 2); b.box(0, 0.98, 0, 1.0, 0.04, 0.6, col(0x2a2420));
    for (const [x, z] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) b.t('metal').beam([x, 0, z], [x, 0.7, z], 0.018, 4, col(METAL.dark));
    for (let k = 0; k < r.int(4, 8); k++) { const x = -0.38 + k * 0.11; b.t('metal').beam([x, 1.02, -0.32], [x, 1.02, 0.35], 0.006, 3, col(0x8a8c8e)); for (let m = 0; m < 3; m++) b.t('plain').box(x, 1.04, -0.15 + m * 0.11, 0.05, 0.05, 0.08, col(r.pick([0x6a2a1a, 0x8a3a22, 0x5a2a18]), 0.06, r)); }
    b.t('bark'); for (const x of [-1.0, 1.0]) b.beam([x, 0, -0.9], [x, 2.75, -0.9], 0.045, 5, pc);
    b.box(0, 2.62, -0.9, 2.1, 0.06, 0.06, pc); // crossbar the sign hangs from, clear above the tarp
    { // the tarp: tied at the back poles (2.1 m), sloping down to the front on two short sticks
      const c = col(r.pick(CANVAS), 0.06, r), yb = 2.1, yf = 1.85, zf = 0.55;
      b.t('fabric').quad([-1.05, yb, -0.9], [1.05, yb, -0.9], [1.05, yf, zf], [-1.05, yf, zf], c);
      b.t('bark'); for (const x of [-1.0, 1.0]) b.beam([x, 0, zf], [x, yf, zf], 0.03, 4, pc);
    }
    b.t('bark').beam([-1.0, 1.75, -0.9], [1.0, 1.7, -0.9], 0.012, 3, col(0x3a3020));
    for (let k = 0; k < r.int(5, 9); k++) b.t('plain').box(-0.85 + k * 0.2, 1.55, -0.9, 0.06, r.range(0.18, 0.3), 0.03, col(r.pick([0x4a2a1a, 0x5a3220, 0x3a2016]), 0.06, r));
    if (r.chance(0.7)) { b.t('wood').box(0.75, 0.25, 0.5, 0.42, 0.5, 0.32, wood(r)); }
    b.t('plain').box(-0.8, 0.22, 0.45, 0.35, 0.44, 0.3, col(r.pick([0x5a6a3a, 0x4a5a6a]), 0.05, r)); // a jerrycan of fuel
    return { signs: r.chance(0.6) ? [{ text: r.pick(['CARNE ASADA', 'BRAHMIN', 'BROCHETAS', 'CECINA']), x: 0, y: 2.38, z: -0.86, ry: 0, w: 1.3, h: 0.3, style: 'painted' }] : [], emitters: [{ type: 'smoke', p: [0, 1.1, 0], small: true }] };
  };
  L('skewer_grill', 'rust');

  P.water_seller = (b, r, o) => { // purified water: a pack animal with jerrycans, a table of clay jugs, a tin cup on a chain, the board
    if (r.chance(0.6)) { b.pushT(-1.3, 0, 0, Math.PI / 2 + r.range(-0.3, 0.3)); P.pack_burro(b, r, { load: 'jerrycans' }); b.pop(); }
    else { b.pushT(-1.9, 0, -0.4, Math.PI / 2 + r.range(-0.3, 0.3)); P.brahmin(b, r, { pose: 'stand' }); b.pop(); }
    const tc = wood(r);
    b.t('wood').box(0.3, 0.75, 0, 1.2, 0.05, 0.6, tc); for (const [x, z] of [[-0.25, -0.25], [0.85, -0.25], [-0.25, 0.25], [0.85, 0.25]]) b.box(x, 0.37, z, 0.05, 0.74, 0.05, tc);
    for (let k = 0; k < r.int(2, 4); k++) b.t('plain').cyl(-0.1 + k * 0.3, 0.98, r.range(-0.1, 0.1), 0.13, 0.1, 0.42, 9, col(r.pick([0xa8643c, 0x9a5a36, 0xb87048]), 0.05, r));
    b.t('metal').cyl(0.8, 0.82, 0.2, 0.04, 0.035, 0.08, 7, col(0x9a9c9e)); b.beam([0.8, 0.86, 0.2], [0.85, 0.78, 0.3], 0.004, 3, col(0x5a5a58));
    for (let k = 0; k < r.int(2, 5); k++) b.box(0.3 + r.range(-0.5, 0.5), 0.23, 0.55 + r.range(-0.1, 0.1), 0.18, 0.46, 0.32, col(r.pick([0x5a6a3a, 0xa8473a, 0x4a5a6a, 0x2a6aa8]), 0.06, r), r.next());
    b.t('wood').beam([1.0, 0, -0.35], [1.0, 1.8, -0.35], 0.03, 4, col(WOOD.pole));
    return { signs: [{ text: r.pick(['AGUA', 'AGUA LIMPIA', 'AGUA PURA · 2 CHAPAS', 'AGUA']), x: 1.0, y: 1.55, z: -0.33, ry: 0, w: 0.8, h: 0.4, style: 'painted' }] };
  };
  L('water_seller', 'wood');

  P.scrap_blanket = (b, r, o) => { // salvage on a tarp: radios, fuses, bolts, bottle caps; a crate seat, a parasol, a price board
    const W = r.range(1.6, 2.2), D = r.range(1.2, 1.6);
    b.t('fabric').box(0, 0.03, 0, W, 0.03, D, col(r.pick([0x5f7f96, 0x8a7a5a, 0x4f6f5a, 0xa8473a, 0x6a6a58]), 0.08, r), r.range(-0.1, 0.1));
    const items = Math.round(W * D * 9);
    for (let i = 0; i < items; i++) {
      const x = r.range(-W / 2 + 0.15, W / 2 - 0.15), z = r.range(-D / 2 + 0.15, D / 2 - 0.15), k = r.next(), a = r.next() * 3;
      if (k < 0.2) { b.t('plain').box(x, 0.1, z, 0.26, 0.16, 0.14, col(r.pick([0x6a5a48, 0x3a3a38, 0x8a7a62, 0x5a4a3a]), 0.06, r), a); b.cyl(x, 0.12, z, 0.03, 0.03, 0.16, 6, col(0xc9a65a), Math.PI / 2, a); } // radio
      else if (k < 0.4) b.t('metal').cyl(x, 0.04, z, 0.03, 0.03, 0.14, 6, col(r.pick([0x8a8c8e, METAL.rust, 0xc9a65a]), 0.08, r), Math.PI / 2, a, 0); // bolts / pipes
      else if (k < 0.55) b.t('plain').box(x, 0.04, z, 0.12, 0.06, 0.08, col(r.pick([0x2a2a28, 0x5a6a3a, 0x8a2a22]), 0.06, r), a); // fuses, packs
      else if (k < 0.7) for (let m = 0; m < 4; m++) b.t('metal').cyl(x + r.range(-0.06, 0.06), 0.01, z + r.range(-0.06, 0.06), 0.02, 0.02, 0.01, 6, col(r.pick([0xc8b048, 0xa8473a, 0x8a8c8e]), 0.06, r)); // caps
      else if (k < 0.8) b.t('plain').cyl(x, 0.12, z, 0.05, 0.05, 0.24, 7, col(r.pick([0x3a5a3a, 0x6a4a2a, 0xd8d4c8]), 0.06, r)); // bottle
      else b.t('rust').box(x, 0.05, z, 0.3, 0.08, 0.2, rust(r), a); // a plate / part
    }
    b.t('wood').box(-W / 2 - 0.35, 0.2, 0.1, 0.4, 0.4, 0.4, wood(r)); // crate seat
    if (o.umbrella ?? r.chance(0.6)) parasol(b, r, -W / 2 - 0.35, -0.35, 2.1, [0xe8e0d0, 0xa83a32, 0x2f6a8a, 0x8a7a5a], 0);
    b.t('wood').box(W / 2 - 0.2, 0.3, -D / 2 - 0.1, 0.6, 0.45, 0.03, wood(r), 0, -0.25);
    return { signs: [{ text: r.pick(['PARTES', 'CHATARRA', 'RADIOS · FUSIBLES', 'COMPRO · VENDO']), x: W / 2 - 0.2, y: 0.33, z: -D / 2 - 0.08, ry: 0, w: 0.55, h: 0.22, style: 'painted' }] };
  };
  L('scrap_blanket', 'fabric');

  P.basket_table = (b, r, o) => { // tamales / tortillas: a folding table, two cloth-covered baskets, a cooler, a stool
    const tc = col(r.pick([0xd8d4c8, 0x5f7f96, 0x4f6f5a, 0xa8473a]), 0.05, r);
    b.t('plain').box(0, 0.72, 0, 1.0, 0.04, 0.6, tc); for (const s of [-1, 1]) { b.beam([s * 0.42, 0, -0.25], [s * 0.42, 0.7, 0.25], 0.015, 3, col(0x8a8c8e)); b.beam([s * 0.42, 0, 0.25], [s * 0.42, 0.7, -0.25], 0.015, 3, col(0x8a8c8e)); }
    for (const x of [-0.25, 0.25]) { b.t('thatch').cyl(x, 0.86, 0, 0.2, 0.15, 0.26, 10, col(r.pick([0xa88a5a, 0x9a7a4a, 0xb89a6a]), 0.05, r)); b.t('fabric').box(x, 1.0, 0, 0.44, 0.03, 0.44, col(r.pick([0xe8e0d0, 0xa83a32, 0x2f6a8a, 0xd8a040, 0x6a4a8a]), 0.06, r), r.next()); }
    b.t('plain').box(0.75, 0.22, 0.1, 0.45, 0.44, 0.34, col(r.pick([0xd8d4c8, 0x2a6aa8, 0xa8473a]), 0.05, r));
    b.t('wood').cyl(-0.75, 0.22, -0.2, 0.17, 0.17, 0.44, 8, wood(r));
    if (r.chance(0.5)) b.t('plain').cyl(-0.42, 0.82, 0.18, 0.08, 0.07, 0.18, 8, col(0x8a8c8e)); // a pot of salsa
    return { signs: r.chance(0.7) ? [{ text: r.pick(['TAMALES', 'TORTILLAS', 'TAMALES · ATOLE', 'GORDITAS']), x: 0, y: 0.6, z: 0.31, ry: 0, w: 0.9, h: 0.24, style: 'painted' }] : [] };
  };
  L('basket_table', 'plain');

  P.nuka_shack = (b, r, o) => { // a dented pre-war drinks kiosk with a hand-built counter and crates of empties
    const red = col(r.pick([0x8a3a2e, 0x7e342a, 0x944236]), 0.05, r), wc = wood(r);
    b.t('metal').box(0, 1.15, -0.2, 1.6, 2.3, 1.1, red);
    for (let i = 0; i < r.int(2, 5); i++) b.box(r.range(-0.7, 0.7), r.range(0.4, 2.0), 0.36, r.range(0.15, 0.35), r.range(0.1, 0.3), 0.02, rust(r)); // dents / rust
    b.box(0, 2.38, -0.15, 1.8, 0.08, 1.3, col(r.pick([0xb8b0a0, 0xa8a090, 0xc0b8a8]), 0.05, r));
    b.t('rust').box(0, 0.22, 0.355, 1.6, 0.44, 0.02, col(0x6a4a38, 0.05, r)); // splashed dirt along the foot
    for (let i = 0; i < r.int(4, 8); i++) { const x = r.range(-0.75, 0.75), h = r.range(0.3, 1.0); b.box(x, 2.3 - h / 2, 0.356, r.range(0.03, 0.08), h, 0.015, col(r.pick([0x6a3a28, 0x5a4a3a, 0x7a4a30]), 0.06, r)); } // rust runs
    if (r.chance(0.6)) b.t('metal').box(r.range(-0.4, 0.4), r.range(0.6, 1.4), 0.358, r.range(0.4, 0.8), r.range(0.3, 0.6), 0.015, col(r.pick([0x8a2a22, 0x9a3a2a, 0x7a3a2a]), 0.05, r)); // a repainted patch, not quite the same red b.ch('glass').t('plain').box(0, 1.55, 0.36, 1.2, 0.5, 0.02, GLASS.dark).ch('main');
    b.t('wood').box(0, 1.0, 0.6, 1.8, 0.06, 0.45, wc); for (const x of [-0.85, 0.85]) b.box(x, 0.5, 0.75, 0.06, 1.0, 0.06, wc);
    for (let k = 0; k < r.int(3, 6); k++) b.t('plain').cyl(-0.6 + k * 0.22, 1.12, 0.6, 0.035, 0.03, 0.18, 6, col(r.pick([0x3a2a20, 0xd84a2a, 0x8a2a1a]), 0.05, r));
    if (P.nuka_crates) { b.pushT(1.25, 0, 0.3, r.range(-0.4, 0.4)); P.nuka_crates(b, r, {}); b.pop(); }
    return { signs: [{ text: r.pick(['PAPI COLA', 'PAPI COLA · FRÍA', 'REFRESCOS']), x: 0, y: 2.05, z: 0.37, ry: 0, w: 1.4, h: 0.32, style: 'prewar' }] };
  };
  L('nuka_shack', 'metal');

  // ---------------------------------------------------------------- recycling yard (centro de acopio)
  P.scrap_press = (b, r, o) => { // a hand-built baling press: a steel box, a screw / lever, bales of crushed cans beside it
    const c = rust(r), dk = col(METAL.dark);
    b.t('rust').box(0, 0.6, 0, 1.0, 1.2, 1.0, c); b.box(0, 1.25, 0, 1.15, 0.1, 1.15, dk);
    for (const s2 of [-1, 1]) b.t('metal').box(s2 * 0.5, 1.8, 0, 0.1, 1.2, 0.1, dk);
    b.box(0, 2.4, 0, 1.15, 0.12, 0.14, dk); b.cyl(0, 1.85, 0, 0.05, 0.05, 1.1, 6, col(0x8a8c8e));
    b.beam([0, 2.45, 0], [r.chance(0.5) ? 0.9 : -0.9, 2.55, 0], 0.03, 4, dk); // the bar
    if (!o.bare) for (let k = 0; k < r.int(2, 5); k++) b.t('metal').box(1.0 + (k % 2) * 0.55, 0.22 + Math.floor(k / 2) * 0.44, -0.3 + (k % 3) * 0.15, 0.5, 0.42, 0.42, col(r.pick([0x8a8c8e, 0x9a6a4a, 0xa8473a, 0x6a7a8a]), 0.12, r), r.range(-0.2, 0.2));
    return {};
  };
  L('scrap_press', 'rust');

  P.burn_pit = (b, r, o) => { // a stone ring or a half-buried drum incinerator, an ash heap, half-burned rubbish
    const drum = o.kind ? o.kind === 'drum' : r.chance(0.5);
    if (drum) { b.t('rust').cyl(0, 0.45, 0, 0.42, 0.42, 0.9, 10, rust(r)); b.t('plain').cyl(0, 0.88, 0, 0.38, 0.38, 0.04, 10, col(0x1e1a16)); b.t('metal').cyl(0.2, 1.2, 0.1, 0.07, 0.07, 0.6, 6, col(0x3a3a38)); }
    else { b.t('stone'); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.box(Math.cos(a) * 0.9, 0.14, Math.sin(a) * 0.9, 0.35, 0.28, 0.3, col(r.pick([0x8a8478, 0x6a6458, 0x5a4e42]), 0.06, r), -a); } b.t('plain').cyl(0, 0.03, 0, 0.75, 0.8, 0.06, 12, col(0x2a2622)); for (let k = 0; k < 6; k++) b.box(r.range(-0.5, 0.5), 0.1, r.range(-0.5, 0.5), r.range(0.15, 0.4), 0.06, r.range(0.1, 0.3), col(r.pick([0x1e1a16, 0x3a3028, 0x5a5048]), 0.06, r), r.next() * 3); }
    b.t('plain'); for (let k = 0; k < 4; k++) b.cyl(1.6 + r.range(-0.3, 0.3), 0.12, r.range(-0.6, 0.6), r.range(0.3, 0.6), r.range(0.4, 0.75), r.range(0.15, 0.3), 8, col(r.pick([0x6a6460, 0x7a746c, 0x5a5450]), 0.05, r)); // ash heap
    return { lights: [{ at: [0, drum ? 1.0 : 0.4, 0], color: [1.0, 0.55, 0.25], radius: 5, intensity: 1.0, kind: 'fire', flicker: true }], emitters: [{ type: 'smoke', p: [0, drum ? 1.4 : 0.4, 0], always: true }, { type: 'fire', p: [0, drum ? 0.9 : 0.2, 0], small: true }] };
  };
  L('burn_pit', 'stone');
  PROP_LIGHT.burn_pit = { electric: false };

  P.compost_bins = (b, r) => { // three pallet / plank bays of scraps, a fork leaning on them
    const wc = wood(r), fills = [0x4a3a28, 0x5a4a2e, 0x3a3020];
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * 1.05;
      b.t('wood'); for (const [dx, dz, w, d] of [[0, -0.48, 1.0, 0.05], [-0.48, 0, 0.05, 1.0], [0.48, 0, 0.05, 1.0]]) for (let y = 0; y < 3; y++) b.box(x + dx, 0.14 + y * 0.22, dz, w, 0.14, d, wc);
      b.t('dirt').box(x, 0.25 + k * 0.08, 0, 0.9, 0.5 + k * 0.16, 0.9, col(fills[k], 0.06, r));
    }
    b.t('wood').beam([1.6, 0, 0.3], [1.55, 1.4, -0.2], 0.025, 4, col(WOOD.pole));
    return {};
  };
  L('compost_bins', 'wood');

  P.sheet_stack = (b, r, o) => { // a stack of salvaged corrugated sheet on timber skids, a few leaning
    const n = o.count || r.int(6, 14);
    b.t('wood'); for (const z of [-0.8, 0.8]) b.box(0, 0.06, z, 1.1, 0.12, 0.12, wood(r));
    b.t('corrugated'); for (let k = 0; k < n; k++) b.box(r.range(-0.04, 0.04), 0.14 + k * 0.025, r.range(-0.05, 0.05), 0.95, 0.02, 2.2, col(r.pick([0x8a8c8e, 0x9a9c9e, METAL.rust, METAL.rust2]), 0.08, r), r.range(-0.04, 0.04));
    return {};
  };
  L('sheet_stack', 'corrugated');

  P.wire_reel = (b, r) => { // a cable drum on its side, stripped copper in a tub
    b.t('wood'); const wc = wood(r); for (const z of [-0.35, 0.35]) b.cyl(0, 0.6, z, 0.6, 0.6, 0.06, 12, wc, Math.PI / 2, 0, 0);
    b.t('metal').cyl(0, 0.6, 0, 0.42, 0.42, 0.64, 12, col(r.pick([0x2a2a28, 0xb86a3a]), 0.06, r), Math.PI / 2, 0, 0);
    b.t('rust').cyl(0.95, 0.2, 0.1, 0.3, 0.26, 0.4, 10, rust(r)); b.t('metal').cyl(0.95, 0.38, 0.1, 0.26, 0.26, 0.06, 10, col(0xb86a3a, 0.08, r));
    return {};
  };
  L('wire_reel', 'wood');

  P.glass_sort = (b, r) => { // bottles and jars sorted by colour into crates and heaps, a small melting kiln with soot
    const G = [0x3a5a3a, 0x6a4a2a, 0xc8d0c8, 0x3a5a7a];
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.6; b.t('wood').box(x, 0.15, 0, 0.52, 0.3, 0.4, wood(r));
      b.t('plain'); for (let m = 0; m < 9; m++) b.cyl(x - 0.17 + (m % 3) * 0.17, 0.38, -0.12 + Math.floor(m / 3) * 0.12, 0.04, 0.04, 0.2, 6, col(G[k], 0.06, r));
    }
    b.t('adobe').cyl(1.9, 0.55, 0, 0.55, 0.65, 1.1, 10, col(0x9a7a5a, 0.05, r)); b.t('plain').box(1.9, 0.35, 0.52, 0.35, 0.3, 0.12, col(0x1a1612)); b.cyl(1.9, 1.15, 0, 0.12, 0.14, 0.3, 8, col(0x2a2622));
    return { emitters: [{ type: 'smoke', p: [1.9, 1.35, 0] }] };
  };
  L('glass_sort', 'plain');


  P.scarecrow = (b, r, o) => { // espantapájaros: a pole cross, an old shirt and hat, rags and cans that rattle
    const pc = wood(r), H = r.range(1.9, 2.3);
    b.t('wood'); b.box(0, H / 2, 0, 0.07, H, 0.07, pc); const arm = H - 0.55, aw = r.range(1.1, 1.5); b.box(0, arm, 0, aw, 0.06, 0.06, pc, r.range(-0.08, 0.08));
    const shirt = col(r.pick([0x8a7a62, 0x6a6a5a, 0x7a5a4a, 0x5a6470, 0x9a8a6a, 0x7a4a3a]), 0.06, r);
    b.t('fabric'); b.box(0, arm - 0.32, 0, 0.5, 0.72, 0.2, shirt); b.box(0, arm, 0, aw * 0.85, 0.16, 0.18, shirt);
    if (r.chance(0.6)) b.box(0, arm - 0.86, 0, 0.42, 0.42, 0.18, col(r.pick([0x4a4a52, 0x5a4a3a, 0x3a4048]), 0.05, r)); // trousers
    b.t('plain').box(0, H - 0.2, 0, 0.26, 0.3, 0.24, col(r.pick([0xc8b896, 0xa89a78, 0x8a7a62]), 0.05, r)); // sack head
    b.t('thatch'); const hat = col(r.pick([0xb89a62, 0x8a6a42, 0x6a5a4a]), 0.06, r);
    b.cyl(0, H - 0.02, 0, 0.36, 0.36, 0.04, 12, hat); b.cyl(0, H + 0.08, 0, 0.14, 0.17, 0.18, 10, hat);
    b.t('fabric'); for (const sd of [-1, 1]) if (r.chance(0.7)) b.box(sd * aw * 0.46, arm - 0.22, 0, 0.12, 0.38, 0.04, col(r.pick(CANVAS), 0.08, r), r.range(-0.2, 0.2));
    if (r.chance(0.6)) { b.t('metal'); for (const sd of [-1, 1]) b.cyl(sd * aw * 0.42, arm - 0.18, 0.05, 0.04, 0.04, 0.1, 6, rust(r)); }
    return {};
  };
  L('scarecrow', 'fabric');
}

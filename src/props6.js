// Prop pass 6: the wealthy yard. Water shown off (tiled fountain), shade and order (pergola with bougainvillea over
// paving, long dining table, iron bench, swing seat, brick grill), green things (edged garden beds, a raised tree
// ring, citrus in a big pot), the working side (generator shed, small stable), the pier lamp at the gate, and a
// restored pre-war pickup. Front = +Z.
import { col } from './builder.js';
import { plant, plantRow } from './foliage.js';
import { PLANT } from './textures.js';
import { WOOD, METAL, ROOF, GLASS } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { rod, lathe } from './shapes.js';

const TILE = [0x2f5a7a, 0x3a6a5a, 0xc8a040, 0x9a3a2a, 0xe8e0d0];
const TERRA = [0xa8643c, 0x9a5a36, 0xb87048];

export function addWealthProps(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // tiled fountain: an octagonal basin with a tiled rim, water, a column with a bowl and a spout
  P.fountain = (b, r, o) => {
    const R = o.radius || 1.3, pc = col(r.pick([0xe8e0d0, 0xd8ccb4, 0xc8b898]), 0.03, r);
    b.t('plaster').cyl(0, 0.3, 0, R, R + 0.05, 0.6, 8, pc, 0, Math.PI / 8);
    b.t('azulejo'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * R * 0.93, z = Math.sin(a) * R * 0.93; b.box(x, 0.4, z, R * 0.78, 0.22, 0.03, col(r.pick(TILE), 0.04, r), -a + Math.PI / 2); }
    b.t('stone').cyl(0, 0.62, 0, R + 0.08, R + 0.08, 0.06, 8, pc.clone().offsetHSL(0, 0, -0.05), 0, Math.PI / 8);
    if (o.dry) b.t('dirt').cyl(0, 0.36, 0, R - 0.12, R - 0.12, 0.02, 8, col(0x8a7a62), 0, Math.PI / 8);
    else b.ch('water').t('plain').cyl(0, 0.5, 0, R - 0.1, R - 0.1, 0.03, 8, col(0x2f5a5a), 0, Math.PI / 8).ch('main');
    b.t('stone'); lathe(b, [[0.22, 0], [0.16, 0.2], [0.13, 0.7], [0.18, 0.78], [0.5, 0.86], [0.55, 0.95], [0.12, 0.98], [0.08, 1.2], [0.12, 1.28], [0, 1.32]], pc, 0, 0.45, 0, 12);
    if (!o.dry) b.ch('water').t('plain').cyl(0, 1.39, 0, 0.47, 0.47, 0.02, 10, col(0x3a6a6a)).ch('main');
    return {};
  };
  L('fountain', 'plaster');

  // pergola over a patio: masonry or wood posts, beams, slatted top, bougainvillea over it and down a post
  P.pergola = (b, r, o) => {
    const W = o.width || 4.4, D = o.depth || 3.6, H = 2.55, mason = o.masonry ?? r.chance(0.5);
    const pc = mason ? col(r.pick([0xe8e0d0, 0xd8c8a8]), 0.03, r) : col(WOOD.dark, 0.05, r), wc = col(r.pick([WOOD.dark, WOOD.weathered]), 0.05, r);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (W / 2 - 0.15), z = sz * (D / 2 - 0.15); if (mason) b.t('plaster').box(x, H / 2, z, 0.3, H, 0.3, pc); else b.t('wood').box(x, H / 2, z, 0.16, H, 0.16, pc); }
    b.t('wood'); for (const sz of [-1, 1]) b.box(0, H + 0.08, sz * (D / 2 - 0.15), W + 0.4, 0.16, 0.12, wc);
    for (let x = -W / 2; x <= W / 2 + 0.01; x += 0.45) b.box(x, H + 0.22, 0, 0.07, 0.12, D + 0.4, wc);
    // the vine: flat cards over part of the top, a climber down one post
    const n = Math.round(W * D * 0.55);
    for (let k = 0; k < n; k++) { const x = r.range(-W / 2, W / 2), z = r.range(-D / 2, D / 2); if (r.chance(0.3) && Math.abs(x) < W / 4) continue; b.leafFlat(x, H + 0.3 + r.range(0, 0.08), z, r.range(0.8, 1.3), r.chance(0.75) ? PLANT.bougainvillea : PLANT.ivy, col(0xf0ecdc, 0.06, r), r.next() * 6.28); }
    const px = (r.chance(0.5) ? -1 : 1) * (W / 2 - 0.15), pz = D / 2 - 0.15;
    for (let k = 0; k < 3; k++) b.leafCard(px + r.range(-0.15, 0.15), 0.2 + k * 0.75, pz + 0.2, 0.9, 1.1, r.next() * 3, PLANT.bougainvillea, col(0xf0ecdc, 0.06, r));
    return {};
  };
  L('pergola', 'wood');

  // a paved pad: flagstones or tiles, a slightly raised edge
  P.patio_slab = (b, r, o) => {
    const W = o.width || 5, D = o.depth || 4, tile = o.kind ? o.kind === 'tile' : r.chance(0.45);
    b.t(tile ? 'saltillo' : 'laja').box(0, 0.04, 0, W, 0.08, D, col(tile ? 0xb06a48 : 0xb8ac98, 0.04, r));
    b.t('concrete'); for (const [x, z, w, d] of [[0, D / 2, W + 0.1, 0.1], [0, -D / 2, W + 0.1, 0.1], [W / 2, 0, 0.1, D], [-W / 2, 0, 0.1, D]]) b.box(x, 0.06, z, w, 0.12, d, col(0x9a948a, 0.03, r));
    return {};
  };
  L('patio_slab', 'laja');

  // edged garden bed: brick or stone border, dark soil, rows of green
  P.garden_bed = (b, r, o) => {
    const W = o.width || 3, D = o.depth || 1.2, brick = r.chance(0.5), ec = col(brick ? 0x9a4a32 : 0xb8ac98, 0.05, r);
    b.t(brick ? 'brick' : 'stone'); for (const [x, z, w, d] of [[0, D / 2, W, 0.12], [0, -D / 2, W, 0.12], [W / 2, 0, 0.12, D], [-W / 2, 0, 0.12, D]]) b.box(x, 0.12, z, w, 0.24, d, ec);
    b.t('dirt').box(0, 0.18, 0, W - 0.2, 0.06, D - 0.2, col(0x4a3a28, 0.05, r));
    const kinds = o.kinds || { herb: 2, chile: 1.5, tomato: 1.5, lettuce: 1, marigold: 1, flowers: 1 };
    for (const z of D > 1 ? [-D / 4, D / 4] : [0]) plantRow(b, r, -W / 2 + 0.35, z, W / 2 - 0.35, z, 0.2, 0.5, kinds, 0.42);
    return {};
  };
  L('garden_bed', 'brick');

  // raised ring for a shade tree (the tree itself is a plant set in it)
  P.tree_ring = (b, r, o) => {
    const R = o.radius || 0.95, wash = r.chance(0.6), c = wash ? col(0xe8e2d4, 0.02, r) : col(0xb8ac98, 0.04, r);
    b.t(wash ? 'limewash' : 'stone').cyl(0, 0.22, 0, R, R + 0.04, 0.44, 12, c);
    b.t('dirt').cyl(0, 0.45, 0, R - 0.12, R - 0.12, 0.03, 12, col(0x5a4632, 0.05, r));
    return {};
  };
  L('tree_ring', 'stone');

  // long dining table with benches or chairs, sometimes a cloth
  P.dining_table = (b, r, o) => {
    const Lx = o.length || 2.6, wc = col(r.pick([WOOD.dark, WOOD.weathered, 0x6a4a32]), 0.05, r);
    b.t('wood').box(0, 0.76, 0, Lx, 0.06, 0.95, wc);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(sx * (Lx / 2 - 0.12), 0.37, sz * 0.35, 0.08, 0.74, 0.08, wc);
    if (r.chance(0.5)) b.t('fabric').box(0, 0.795, 0, Lx * 0.7, 0.01, 1.05, col(r.pick([0xe8e2d4, 0xa83a32, 0x2f5a7a]), 0.04, r));
    const n = Math.max(2, Math.round(Lx / 0.75)), cc = wc.clone().offsetHSL(0, 0, 0.04);
    for (const sz of [-1, 1]) for (let k = 0; k < n; k++) { const x = -Lx / 2 + (k + 0.5) * (Lx / n); b.box(x, 0.45, sz * 0.72, 0.42, 0.05, 0.42, cc).box(x, 0.72, sz * 0.92, 0.42, 0.5, 0.05, cc); for (const [a, e] of [[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]]) b.box(x + a, 0.22, sz * 0.72 + e, 0.04, 0.44, 0.04, cc); }
    return {};
  };
  L('dining_table', 'wood');

  // brick grill (asador): a brick box, a steel grate, a short chimney
  P.grill = (b, r) => {
    const bc = col(0x9a4a32, 0.05, r);
    b.t('brick').box(0, 0.45, 0, 1.4, 0.9, 0.8, bc).box(-0.55, 1.35, -0.25, 0.3, 0.9, 0.3, bc);
    b.t('metal'); for (let x = -0.5; x <= 0.5; x += 0.1) b.box(x, 0.92, 0.05, 0.015, 0.015, 0.6, col(METAL.dark));
    b.t('plain').box(0, 0.8, 0.05, 1.2, 0.04, 0.62, col(0x2a2624));
    return {};
  };
  L('grill', 'brick');

  // wrought-iron bench: a scrolled frame, slats
  P.iron_bench = (b, r) => {
    const ic = col(r.pick([0x2a2a28, 0x2f3a2f]), 0.04, r), wc = col(WOOD.weathered, 0.05, r);
    b.t('metal'); for (const sx of [-0.75, 0.75]) { rod(b, [sx, 0, 0.2], [sx, 0.45, 0.15], 0.025, ic, 5); rod(b, [sx, 0, -0.2], [sx, 0.85, -0.25], 0.025, ic, 5); rod(b, [sx, 0.45, 0.2], [sx, 0.6, 0.05], 0.02, ic, 4); }
    b.t('wood'); for (let k = 0; k < 4; k++) b.box(0, 0.45, 0.18 - k * 0.11, 1.6, 0.03, 0.08, wc);
    for (let k = 0; k < 3; k++) b.box(0, 0.58 + k * 0.1, -0.24, 1.6, 0.06, 0.03, wc);
    return {};
  };
  L('iron_bench', 'metal');

  // swing seat (columpio) on an A-frame
  P.swing_chair = (b, r) => {
    const fc = col(r.pick([WOOD.dark, 0x2a2a28]), 0.05, r), sc = col(r.pick([WOOD.weathered, 0xa83a32, 0x2f5a7a]), 0.05, r);
    b.t('wood'); for (const sx of [-1, 1]) { rod(b, [sx * 1.0, 0, -0.6], [sx * 0.95, 2.1, 0], 0.05, fc, 5); rod(b, [sx * 1.0, 0, 0.6], [sx * 0.95, 2.1, 0], 0.05, fc, 5); }
    b.box(0, 2.12, 0, 2.1, 0.1, 0.1, fc);
    b.t('metal'); for (const sx of [-0.65, 0.65]) b.box(sx, 1.5, 0, 0.015, 1.2, 0.015, col(METAL.dark));
    b.t('wood').box(0, 0.88, 0, 1.4, 0.06, 0.5, sc).box(0, 1.12, -0.24, 1.4, 0.45, 0.05, sc);
    return {};
  };
  L('swing_chair', 'wood');

  // generator shed: a small block hut with louvres, an exhaust, a fuel drum, the cable out
  P.generator_shed = (b, r) => {
    const wc = col(r.pick([0xb8b0a0, 0xa8a49a]), 0.04, r);
    b.t('block').box(0, 0.9, 0, 1.8, 1.8, 1.4, wc);
    b.t('corrugated').box(0, 1.86, 0, 2.0, 0.06, 1.6, col(r.pick(ROOF.corrugated), 0.05, r), 0, 0.06);
    b.t('metal').box(0, 1.0, 0.71, 0.8, 0.5, 0.02, col(0x5a5c5e)); for (let k = 0; k < 4; k++) b.box(0, 0.82 + k * 0.12, 0.72, 0.76, 0.03, 0.02, col(0x3a3a38));
    b.cyl(0.6, 2.1, -0.4, 0.05, 0.05, 0.6, 6, col(0x3a3836));
    b.t('metal').cyl(-1.25, 0.45, 0.2, 0.3, 0.3, 0.9, 10, col(r.pick([0xa83a32, 0x3a5a3a, METAL.rust]), 0.05, r));
    return {};
  };
  L('generator_shed', 'block');

  // small stable: an open-fronted shed, plank back, two stalls, a hay rack and a trough
  P.stable = (b, r, o) => {
    const W = o.width || 5.2, D = 3.0, H = 2.4, wc = col(r.pick([WOOD.weathered, WOOD.dark]), 0.05, r);
    b.t('fence_wood').box(0, H / 2, -D / 2, W, H, 0.08, wc);
    for (const sx of [-1, 1]) b.box(sx * W / 2, H / 2 - 0.1, 0, 0.08, H - 0.2, D, wc);
    b.t('wood'); for (const sx of [-1, 1]) b.box(sx * (W / 2 - 0.05), H / 2, D / 2 - 0.05, 0.14, H, 0.14, wc);
    b.box(0, 0.6, 0, 0.06, 1.2, D - 0.3, wc); // the stall divider
    b.t(r.chance(0.5) ? 'corrugated' : 'thatch').box(0, H + 0.12, 0, W + 0.4, 0.07, D + 0.5, col(r.chance(0.5) ? r.pick(ROOF.corrugated) : 0xb8a070, 0.05, r), 0, -0.08);
    b.t('wood'); for (const sx of [-W / 4, W / 4]) { b.box(sx, 1.3, -D / 2 + 0.2, 1.4, 0.06, 0.06, wc); b.t('thatch').box(sx, 1.15, -D / 2 + 0.22, 1.3, 0.3, 0.2, col(0xc8b070, 0.05, r)); b.t('wood'); }
    b.t('wood').box(0, 0.25, D / 2 - 0.5, 1.6, 0.45, 0.45, wc); b.ch('water').t('plain').box(0, 0.42, D / 2 - 0.5, 1.45, 0.02, 0.32, col(0x3a5048)).ch('main');
    b.t('dirt').box(0, 0.02, 0, W - 0.2, 0.03, D - 0.2, col(0xa89068, 0.05, r));
    return {};
  };
  L('stable', 'wood');

  // a citrus tree in a big terracotta pot
  P.citrus_pot = (b, r) => {
    const pc = col(r.pick(TERRA), 0.05, r);
    b.t('plain').cyl(0, 0.3, 0, 0.42, 0.32, 0.6, 10, pc).cyl(0, 0.6, 0, 0.46, 0.46, 0.06, 10, pc.clone().offsetHSL(0, 0, -0.04));
    b.t('dirt').cyl(0, 0.62, 0, 0.4, 0.4, 0.02, 10, col(0x4a3a28));
    b.t('bark'); rod(b, [0, 0.6, 0], [0.05, 1.3, 0.02], 0.04, col(0x5a4632), 5);
    b.leafCross(0, 1.0, 0, 1.2, 1.1, PLANT.shrub, col(0xd8e0c0, 0.05, r), 3, r.next() * 3, true);
    b.t('plain'); for (let k = 0; k < 9; k++) { const a = r.next() * 6.28, rr = r.range(0.15, 0.45); b.blob(Math.cos(a) * rr, r.range(1.2, 1.8), Math.sin(a) * rr, 0.05, 0.05, 0.05, col(r.chance(0.7) ? 0xe08a20 : 0xe8c830, 0.05, r), 'ico'); }
    return {};
  };
  L('citrus_pot', 'plain');

  // pier lamp: a masonry gate pier with a lamp on top
  P.pier_lamp = (b, r, o) => {
    const pc = col(o.color ?? r.pick([0xe8e2d4, 0xd8c8a8]), 0.03, r);
    b.t('plaster').box(0, 1.05, 0, 0.55, 2.1, 0.55, pc).box(0, 2.14, 0, 0.66, 0.08, 0.66, pc.clone().offsetHSL(0, 0, -0.05));
    b.t('metal').box(0, 2.3, 0, 0.08, 0.24, 0.08, col(METAL.dark)).box(0, 2.62, 0, 0.3, 0.06, 0.3, col(METAL.dark));
    b.ch('lamp').w(o._r ?? 9).t('plain').box(0, 2.48, 0, 0.24, 0.3, 0.24, o.electric ? 0xfff0d0 : 0xffc070).w(-1).ch('main');
    return { lights: [{ at: [0, 2.45, 0], color: o.electric ? LIGHT_COL.incandescent : LIGHT_COL.oil, radius: 7, intensity: 1.1, kind: 'lamp', flicker: !o.electric }] };
  };
  L('pier_lamp', 'plaster');
  PROP_LIGHT.pier_lamp = { electric: false, essential: true };

  // a restored pre-war pickup: rounded cab, a bed, clean paint, chrome bumpers
  P.pickup = (b, r, o) => {
    const pc = col(o.color || r.pick([0x8a2a22, 0x2a4a6a, 0x3a5a3a, 0xc8b070, 0xd8d4c8, 0x5a6a7a]), 0.04, r), dark = col(0x222220);
    for (const [x, z] of [[-0.85, 1.5], [0.85, 1.5], [-0.85, -1.4], [0.85, -1.4]]) b.t('plain').cyl(x, 0.38, z, 0.38, 0.38, 0.26, 12, dark, 0, 0, Math.PI / 2);
    b.t('metal').box(0, 0.75, 1.75, 1.75, 0.55, 1.5, pc); // hood
    for (const sx of [-1, 1]) b.box(sx * 0.82, 0.65, 1.55, 0.25, 0.5, 1.0, pc); // front wings
    b.box(0, 1.15, 0.55, 1.7, 0.95, 1.1, pc); // cab
    b.ch('glass').t('plain').box(0, 1.35, 0.56, 1.72, 0.42, 0.9, GLASS.dark).ch('main');
    b.t('metal').box(0, 0.75, -1.15, 1.75, 0.6, 2.2, pc.clone().offsetHSL(0, 0, -0.03)); // bed
    b.t('plain').box(0, 1.02, -1.15, 1.55, 0.04, 2.05, dark); // bed floor
    b.t('metal').box(0, 0.48, 2.55, 1.85, 0.14, 0.12, col(METAL.chrome)).box(0, 0.48, -2.3, 1.85, 0.12, 0.1, col(METAL.chrome));
    b.ch('lamp').w(9).t('plain'); for (const sx of [-0.6, 0.6]) b.box(sx, 0.9, 2.52, 0.2, 0.18, 0.04, 0xf0f0e0); b.w(-1).ch('main');
    return {};
  };
  L('pickup', 'metal');
}

// Prop pass 13: the wasteland. Slaver cages, the auction block, chain posts; the chem still and the cook's table;
// the fighting pit and the bookie's booth; the bonfire, cult symbol stones; sharpened stake rows. Front = +Z.
import { col } from './builder.js';
import { WOOD, METAL } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { rod } from './shapes.js';

const RUST = [0x6e4a34, 0x5a4232, 0x7a5440];

// a barred cage on a plank floor: frame, bars on every side, a barred door at the front, a tin lid (shared with the slave pen)
export function cageGeo(b, r, x, z, w, d, h, o = {}) {
  const bar = col(r.pick(RUST), 0.06, r), fr = col(METAL.dark, 0.04, r), wc = col(WOOD.weathered, 0.05, r);
  b.t('wood').box(x, 0.08, z, w, 0.16, d, wc);
  b.t('metal');
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x + (sx * w) / 2, h / 2, z + (sz * d) / 2, 0.08, h, 0.08, fr);
  for (const y of [0.18, h]) { b.box(x, y, z - d / 2, w, 0.07, 0.07, fr); b.box(x, y, z + d / 2, w, 0.07, 0.07, fr); b.box(x - w / 2, y, z, 0.07, 0.07, d, fr); b.box(x + w / 2, y, z, 0.07, 0.07, d, fr); }
  const sp = 0.16;
  for (let u = -w / 2 + sp; u < w / 2 - 0.05; u += sp) for (const sz of [-1, 1]) b.box(x + u, h / 2 + 0.09, z + (sz * d) / 2, 0.025, h - 0.18, 0.025, bar);
  for (let u = -d / 2 + sp; u < d / 2 - 0.05; u += sp) for (const sx of [-1, 1]) b.box(x + (sx * w) / 2, h / 2 + 0.09, z + u, 0.025, h - 0.18, 0.025, bar);
  b.box(x + w * 0.18, h * 0.5, z + d / 2 + 0.03, 0.06, 0.18, 0.06, col(0x2a2826)); // the lock
  if (o.lid !== false) b.t('corrugated').box(x, h + 0.06, z, w + 0.3, 0.04, d + 0.3, col(r.pick([0x8c8a80, 0x7a6a58, 0x8a6a4a]), 0.06, r), 0, 0.06);
  if (o.inside !== false) { b.t('plain').box(x - w / 4, 0.2, z - d / 4, 0.7, 0.06, 1.4, col(r.pick([0x6a5a48, 0x5a5a4a]), 0.05, r)); b.t('metal').cyl(x + w / 4, 0.32, z - d / 4, 0.14, 0.12, 0.3, 8, col(0x7a7a72)); }
}

export function addWastelandProps(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  P.cage = (b, r, o) => { cageGeo(b, r, 0, 0, o.width || 2.2, o.depth || 2.2, o.height || 2.1, o); return {}; };
  L('cage', 'metal');

  // the auction block: a raised plank stage with steps at the front, a post and chain, a sign-board behind
  P.auction_block = (b, r, o) => {
    const W = o.width || 3.6, D = o.depth || 2.6, H = 1.1, wc = col(WOOD.weathered, 0.05, r), dk = col(WOOD.dark, 0.05, r);
    b.t('wood');
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box((sx * (W - 0.2)) / 2, H / 2, (sz * (D - 0.2)) / 2, 0.16, H, 0.16, dk);
    for (let x = -W / 2 + 0.15; x < W / 2; x += 0.3) b.box(x, H, 0, 0.28, 0.07, D, wc.clone().offsetHSL(0, 0, r.range(-0.03, 0.03)));
    for (let k = 0; k < 3; k++) b.box(0, (H * (k + 0.5)) / 3.4, D / 2 + 0.3 + (2 - k) * 0.3, 1.2, 0.08, 0.3, wc); // steps
    b.box(0, H + 1.0, -D / 2 + 0.2, 0.14, 2.0, 0.14, dk); // the post
    b.t('metal'); for (let k = 0; k < 6; k++) b.box(0.08, H + 1.5 - k * 0.12, -D / 2 + 0.3, 0.05, 0.1, 0.03, col(0x4a4844));
    b.t('wood').box(0, H + 2.2, -D / 2 + 0.12, 2.2, 0.6, 0.06, col(0x8a6a4a, 0.05, r));
    return {};
  };
  L('auction_block', 'wood');

  // a chain post: a heavy stake with an iron ring, a chain lying on the ground
  P.chain_post = (b, r) => {
    const dk = col(WOOD.dark, 0.05, r);
    b.t('wood').box(0, 0.6, 0, 0.18, 1.2, 0.18, dk);
    b.t('metal').cyl(0, 0.95, 0.12, 0.09, 0.09, 0.03, 10, col(0x3a3836), Math.PI / 2);
    for (let k = 0; k < 7; k++) b.box(0.05 + k * 0.1, 0.03, 0.2 + Math.sin(k) * 0.08, 0.09, 0.03, 0.05, col(0x4a4844), k * 0.7);
    return {};
  };
  L('chain_post', 'metal');

  // the still: a copper pot over a fire, the cap and the coil into a cooling drum, jugs at the tap
  P.still = (b, r, o) => {
    const cu = col(r.pick([0xa8643c, 0x9a5a36, 0x8a5a3a]), 0.06, r), drum = col(r.pick(RUST), 0.06, r);
    b.t('stone'); for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.28; b.box(Math.cos(a) * 0.55, 0.12, Math.sin(a) * 0.55, 0.28, 0.24, 0.24, col(0x8a8070, 0.05, r), a); }
    b.t('metal').cyl(0, 0.75, 0, 0.45, 0.5, 0.8, 12, cu).cone(0, 1.3, 0, 0.42, 0.35, 12, cu);
    rod(b, [0, 1.6, 0], [0.9, 1.55, 0], 0.04, cu, 6);
    b.cyl(1.2, 0.45, 0, 0.3, 0.3, 0.9, 12, drum); // the cooling drum
    for (let k = 0; k < 4; k++) b.cyl(1.2, 0.95 + k * 0.06, 0, 0.22, 0.22, 0.03, 10, cu);
    b.t('plain'); for (const [x, z] of [[1.55, 0.3], [1.7, -0.05], [1.5, -0.35]]) b.cyl(x, 0.18, z, 0.12, 0.13, 0.36, 8, col(0xd8d0c0, 0.04, r));
    return { lights: [{ at: [0, 0.25, 0], color: LIGHT_COL.fire, radius: 4, intensity: 0.9, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, 0.2, 0], small: true }, { type: 'smoke', p: [0, 1.8, 0], small: true }] };
  };
  L('still', 'metal');
  PROP_LIGHT.still = { electric: false };

  // the cook's table: jars, glass, a burner, stained cloth
  P.chem_table = (b, r) => {
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood').box(0, 0.86, 0, 2.0, 0.06, 0.9, wc); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(sx * 0.9, 0.42, sz * 0.38, 0.07, 0.84, 0.07, col(WOOD.dark));
    b.t('plain').box(0.1, 0.9, 0, 1.4, 0.01, 0.6, col(0x8a7a50, 0.06, r));
    for (let k = 0; k < 9; k++) b.cyl(-0.8 + k * 0.19, 1.0, r.range(-0.3, 0.3), 0.05, 0.05, r.range(0.12, 0.26), 6, col(r.pick([0x6a8a6a, 0xb0a070, 0x8a3a5a, 0xd8d4c8, 0x5a7a9a]), 0.05, r));
    b.t('metal').cyl(0.7, 0.95, 0.15, 0.12, 0.14, 0.12, 8, col(0x4a4a48)); b.cyl(0.7, 1.05, 0.15, 0.13, 0.08, 0.14, 8, col(0xd8d4c8));
    b.cyl(-1.3, 0.45, 0.2, 0.29, 0.29, 0.9, 10, col(r.pick([0x5a7a3a, 0x8a6a2a]), 0.06, r)); // a drum of something
    return {};
  };
  L('chem_table', 'wood');

  // the fighting pit: a ring dug in, a wall of planks and car doors round it, posts with lamps, sand on the floor
  P.fight_pit = (b, r, o) => {
    const R = o.radius || 4, n = 18, wc = col(WOOD.weathered, 0.05, r);
    b.t('dirt').cyl(0, -0.02, 0, R, R, 0.05, 24, col(0xb8a07a, 0.04, r));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283, x = Math.cos(a) * R, z = Math.sin(a) * R, ry = -a + Math.PI / 2, sw = 2 * R * Math.sin(Math.PI / n) + 0.05;
      const scrap = r.chance(0.4);
      b.t(scrap ? 'rust' : 'wood').box(x, 0.65, z, sw, 1.3, 0.08, scrap ? col(r.pick([0x7a6a58, 0x5a6a7a, 0x8a4a3a, ...RUST]), 0.08, r) : wc.clone().offsetHSL(0, 0, r.range(-0.04, 0.03)), ry);
      if (k % 3 === 0) b.t('wood').box(Math.cos(a) * (R + 0.1), 0.85, Math.sin(a) * (R + 0.1), 0.12, 1.7, 0.12, col(WOOD.dark));
    }
    b.t('plain'); b.blob(r.range(-1, 1), 0.01, r.range(-1, 1), 0.8, 0.01, 0.6, col(0x5a3a2a, 0.05, r), 'ico'); // the stain
    const lights = [];
    for (const a of [0.4, 2.5, 4.6]) { const x = Math.cos(a) * (R + 0.6), z = Math.sin(a) * (R + 0.6); b.t('bark').cyl(x, 1.6, z, 0.07, 0.08, 3.2, 6, col(WOOD.pole)); b.t('metal').cyl(x, 3.2, z, 0.12, 0.1, 0.2, 8, col(0x3a3a38)); lights.push({ at: [x, 3.1, z], color: LIGHT_COL.incandescent, radius: 7, intensity: 0.9, kind: 'lamp', flicker: false }); }
    return { lights };
  };
  L('fight_pit', 'wood');
  PROP_LIGHT.fight_pit = { electric: true };

  // the bookie's booth: a plank box with a hatch, odds chalked on a board, a lamp
  P.bookie_booth = (b, r) => {
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood').box(0, 1.1, 0, 1.8, 2.2, 1.4, wc).box(0, 1.2, 0.71, 1.2, 0.7, 0.02, col(0x1c1a18));
    b.t('corrugated').box(0, 2.3, 0.15, 2.1, 0.04, 1.9, col(0x8c8a80, 0.05, r), 0, 0.12);
    b.box(0, 0.95, 0.85, 1.4, 0.06, 0.35, wc);
    b.t('plain').box(-1.15, 1.6, 0.4, 0.04, 1.0, 0.8, col(0x2a3028), Math.PI / 2 * 0); for (let k = 0; k < 5; k++) b.box(-1.18, 1.95 - k * 0.15, 0.4 + r.range(-0.2, 0.2), 0.01, 0.04, r.range(0.2, 0.5), col(0xd8d8d0));
    return { lights: [{ at: [0, 2.1, 0.9], color: LIGHT_COL.incandescent, radius: 4, intensity: 0.6, kind: 'lamp', flicker: false }] };
  };
  L('bookie_booth', 'wood');
  PROP_LIGHT.bookie_booth = { electric: true };

  // a bonfire: a ring of stones, logs stacked up
  P.bonfire = (b, r, o) => {
    const R = o.radius || 1.3;
    b.t('stone'); for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28; b.box(Math.cos(a) * R, 0.15, Math.sin(a) * R, 0.38, 0.3, 0.32, col(0x8a8070, 0.06, r), a); }
    b.t('bark'); for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28; b.plank([Math.cos(a) * R * 0.75, 0.05, Math.sin(a) * R * 0.75], [Math.cos(a) * 0.1, 1.0, Math.sin(a) * 0.1], 0.14, 0.14, col(WOOD.dark, 0.06, r)); }
    b.t('plain').cyl(0, 0.03, 0, R * 0.8, R * 0.8, 0.04, 12, col(0x2a2420));
    return { lights: [{ at: [0, 1.0, 0], color: LIGHT_COL.fire, radius: 10, intensity: 1.6, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, 0.6, 0] }, { type: 'smoke', p: [0, 1.6, 0] }] };
  };
  L('bonfire', 'stone');
  PROP_LIGHT.bonfire = { electric: false };

  // a cult symbol: a standing slab (or a board on poles) painted with the sign — an eye in a ring, rays
  P.cult_symbol = (b, r, o) => {
    const paint = col(r.pick([0xb83a2a, 0xe8e0d0, 0x2a2a2a, 0xd8a838]), 0.05, r), slab = r.chance(0.5);
    if (slab) b.t('stone').box(0, 1.0, 0, 1.3, 2.0, 0.3, col(0x9a8f7e, 0.05, r));
    else { b.t('bark'); for (const sx of [-0.6, 0.6]) b.cyl(sx, 1.1, -0.05, 0.05, 0.06, 2.2, 6, col(WOOD.pole)); b.t('wood').box(0, 1.4, 0, 1.4, 1.2, 0.06, col(WOOD.weathered, 0.05, r)); }
    const y = slab ? 1.2 : 1.4, z = slab ? 0.16 : 0.04;
    b.t('plain');
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.28; b.box(Math.cos(a) * 0.42, y + Math.sin(a) * 0.42, z, 0.12, 0.05, 0.01, paint, 0, 0, a + Math.PI / 2); }
    b.box(0, y, z, 0.36, 0.14, 0.01, paint); b.box(0, y, z + 0.005, 0.12, 0.12, 0.01, col(0x1a1a1a));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.28 + 0.26; b.box(Math.cos(a) * 0.62, y + Math.sin(a) * 0.62, z, 0.2, 0.04, 0.01, paint, 0, 0, a); }
    return {};
  };
  L('cult_symbol', 'stone');

  // ---- idols: pre-war junk the sects worship
  const offerings = (b, r, R = 1.2, n = 7) => { // candles, bottles and little things round the foot
    for (let k = 0; k < n; k++) { const a = r.range(0, 6.28), d = r.range(0.4, R); b.t('plain').cyl(Math.cos(a) * d, 0.08, Math.sin(a) * d, 0.04, 0.05, r.range(0.1, 0.22), 6, col(r.pick([0xe8e0d0, 0xd8b040, 0xb83a2a, 0x5a7a5a, 0x7a5a3a]), 0.05, r)); }
  };
  P.goalpost = (b, r) => { // a pre-war football goal post, the paint mostly gone, rags tied to the uprights
    const y = col(r.pick([0xd8b040, 0xc8a038, 0xb8b0a0]), 0.08, r);
    b.t('metal').cyl(0, 1.5, -0.6, 0.12, 0.14, 3.0, 10, y); b.beam([0, 2.9, -0.6], [0, 3.2, 0], 0.1, 8, y);
    b.cyl(0, 3.2, 0, 0.09, 0.09, 5.6, 8, y, 0, 0, Math.PI / 2);
    for (const sx of [-2.8, 2.8]) b.cyl(sx, 3.2 + 3.0, 0, 0.08, 0.08, 6.0, 8, y);
    b.t('fabric'); for (let k = 0; k < 5; k++) { const sx = r.pick([-2.8, 2.8]), yy = r.range(3.6, 8.5); b.box(sx + 0.15, yy - 0.3, 0, 0.04, 0.6, 0.18, col(r.pick([0xb83a2a, 0xe8e0d0, 0x3a6a8a, 0xd8a838]), 0.05, r)); }
    offerings(b, r, 1.6, 9);
    return {};
  };
  L('goalpost', 'metal');
  P.wing_idol = (b, r) => { // an airliner's wing stood on end in the dirt, the sect's eye painted on it
    const al = col(r.pick([0xb8bcbc, 0xa8aca8, 0xc8c4b8]), 0.04, r), pc = col(r.pick([0xb83a2a, 0x1a1a1a, 0xd8a838]), 0.04, r);
    b.t('metal').box(0, 3.0, 0, 2.6, 6.2, 0.22, al, 0, 0, 0.12).box(0.5, 6.0, 0, 1.6, 0.6, 0.2, al, 0, 0, 0.5);
    b.t('stone'); for (let k = 0; k < 6; k++) b.box(r.range(-1.4, 1.4), 0.2, r.range(-0.5, 0.5), 0.5, 0.4, 0.5, col(0x8a8070, 0.05, r), r.next() * 3);
    b.t('plain'); for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.box(Math.cos(a) * 0.7 + 0.25, 3.4 + Math.sin(a) * 0.7, 0.13, 0.3, 0.08, 0.01, pc, 0, 0, a + Math.PI / 2); }
    b.box(0.25, 3.4, 0.13, 0.6, 0.22, 0.01, pc).box(0.25, 3.4, 0.14, 0.18, 0.18, 0.01, col(0x1a1a1a));
    offerings(b, r, 1.4);
    return {};
  };
  L('wing_idol', 'metal');
  P.fiberglass_giant = (b, r) => { // a roadside fiberglass giant from before the war, faded, one arm gone, garlands round its neck
    const skin = col(r.pick([0xd8a888, 0xc89878, 0xb8b0a0]), 0.05, r), shirt = col(r.pick([0x3a6a9a, 0xb83a2a, 0x3a7a5a, 0xd8b040]), 0.06, r), pants = col(r.pick([0x2a3a5a, 0x5a4a3a, 0xe8e0d0]), 0.05, r);
    b.t('concrete').box(0, 0.3, 0, 2.0, 0.6, 2.0, col(0x9a968c, 0.04, r));
    b.t('plaster'); for (const sx of [-0.45, 0.45]) b.box(sx, 2.0, 0, 0.55, 2.8, 0.6, pants);
    b.box(0, 4.3, 0, 1.6, 2.0, 0.85, shirt).box(0, 3.35, 0, 1.65, 0.2, 0.9, col(0x2a2622));
    b.box(-1.05, 4.6, 0.25, 0.42, 0.42, 1.4, shirt).box(-1.05, 4.6, 1.05, 0.38, 0.38, 0.4, skin); // the arm held out (the other is gone)
    b.box(0.9, 5.0, 0, 0.3, 0.3, 0.3, col(0x6a6a62)); // the stump
    b.blob(0, 5.9, 0, 0.62, 0.72, 0.62, skin, 'ico').box(0, 6.5, 0, 1.1, 0.12, 1.1, col(0x2a2622)).box(0, 6.7, 0, 0.7, 0.35, 0.7, col(0x2a2622));
    b.t('plain'); for (const sx of [-0.2, 0.2]) b.box(sx, 6.0, 0.6, 0.12, 0.08, 0.02, col(0x1a1a1a)); b.box(0, 5.68, 0.6, 0.36, 0.06, 0.02, col(0x6a2a2a));
    b.t('fabric'); for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI - 0.1; b.box(Math.cos(a) * 0.6, 5.25 - Math.sin(a) * 0.35, 0.46, 0.14, 0.14, 0.06, col(r.pick([0xe08a20, 0xd8b040, 0xb83a2a]), 0.05, r)); }
    offerings(b, r, 1.5, 10);
    return {};
  };
  L('fiberglass_giant', 'plaster');
  P.scrap_statue = (b, r) => { // a figure welded from drums, a hubcap face, rebar arms raised
    const rust = () => col(r.pick(RUST), 0.08, r);
    b.t('rust').cyl(0, 0.45, 0, 0.3, 0.3, 0.9, 10, rust()).cyl(0, 1.35, 0, 0.32, 0.28, 0.9, 10, rust());
    for (const sx of [-0.2, 0.2]) b.cyl(sx, 0.0 + 0.45, 0.35, 0.08, 0.08, 0.9, 6, rust());
    b.t('metal').cyl(0, 2.1, 0, 0.32, 0.32, 0.12, 14, col(0xb8bcbc, 0.04, r), Math.PI / 2);
    b.cyl(0, 2.1, 0.07, 0.08, 0.08, 0.04, 8, col(0xb83a2a), Math.PI / 2);
    for (const sx of [-1, 1]) { b.beam([sx * 0.3, 1.6, 0], [sx * 0.75, 2.4, 0], 0.04, 5, rust()); b.beam([sx * 0.75, 2.4, 0], [sx * 0.85, 3.2, 0], 0.04, 5, rust()); }
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI; b.beam([Math.cos(a) * 0.4, 2.1 + Math.sin(a) * 0.4, 0], [Math.cos(a) * 0.75, 2.1 + Math.sin(a) * 0.75, 0], 0.025, 4, rust()); }
    offerings(b, r, 1.2);
    return {};
  };
  L('scrap_statue', 'rust');
  P.dish_shrine = (b, r) => { // a fallen satellite dish face up, rain water and candles in it
    const w = col(0xd8d4c8, 0.04, r);
    b.t('metal').cone(0, 0.55, 0, 1.6, -0.5, 18, w).cyl(0, 0.62, 0, 1.5, 1.5, 0.02, 18, col(0x6a7a7a, 0.05, r));
    b.beam([0, 0.35, 0], [0, 1.6, 0.3], 0.04, 6, col(METAL.dark)); b.cyl(0, 1.65, 0.3, 0.12, 0.12, 0.2, 8, col(METAL.dark));
    b.t('concrete').box(0, 0.15, -1.2, 1.2, 0.3, 0.6, col(0x9a968c));
    offerings(b, r, 2.0, 10);
    return {};
  };
  L('dish_shrine', 'metal');
  P.rocket_idol = (b, r) => { // the nose of some pre-war rocket, upright, fins painted, ribbons tied on
    const w = col(r.pick([0xd8d4c8, 0xb8bcbc]), 0.04, r), red = col(0xa83a2a, 0.05, r);
    b.t('metal').cyl(0, 1.6, 0, 0.7, 0.75, 3.2, 14, w).cone(0, 4.3, 0, 0.7, 2.2, 14, w).cyl(0, 2.8, 0, 0.71, 0.71, 0.3, 14, red);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; b.box(Math.cos(a) * 0.95, 0.6, Math.sin(a) * 0.95, 0.06, 1.2, 0.6, red, -a); }
    offerings(b, r, 1.4);
    return {};
  };
  L('rocket_idol', 'metal');

  // sharpened stakes leaning out, along local x
  P.spikes = (b, r, o) => {
    const Lx = o.length || 4, dk = col(WOOD.dark, 0.05, r);
    b.t('bark').box(0, 0.25, 0, Lx, 0.14, 0.14, dk);
    for (let x = -Lx / 2 + 0.2; x <= Lx / 2 - 0.1; x += 0.4) { b.beam([x, 0.1, -0.3], [x + r.range(-0.08, 0.08), 1.3, 0.5], 0.05, 5, dk); b.cone(x, 1.35, 0.55, 0.05, 0.18, 5, col(0xc8b490), 0.9); }
    return {};
  };
  L('spikes', 'wood');
}

// Prop pass 5 (batch 9, household trades): craftsman kit (sawhorses, kick wheel, treadle loom, yarn
// line, saddle rack), fisher kit (panga, net rack, fish rack, crab traps), salvager kit (sorting bins,
// hanging scale), aguador water cart, curandero kit (herb bed, yard altar). Front = +Z.
import * as THREE from 'three';
import { herbBundle, plantRow, plant } from './foliage.js';
import { col } from './builder.js';
import { WOOD, METAL, MISC } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { ellip, rod, lathe, ring } from './shapes.js';

const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const DYE = [0xa83a32, 0x2f5a8a, 0xc89a30, 0x4a6a3a, 0x7a3a5a, 0xd8ccb0, 0xc86a30, 0x2a2622];
const HULL = [0xd8d4c8, 0x3a6a8a, 0x2f7a6a, 0xc8a040, 0xa83a32, 0xe0dcd0];

export function addTradeProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // ---------------------------------------------------------------- carpenter
  P.sawhorse = (b, r, o) => { // a pair of sawhorses, a plank or a log across them, shavings below
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood');
    for (const x of [-0.7, 0.7]) {
      b.box(x, 0.72, 0, 0.1, 0.08, 0.9, wc);
      for (const [dx, dz] of [[-0.18, -0.35], [0.18, -0.35], [-0.18, 0.35], [0.18, 0.35]]) rod(b, [x, 0.7, dz * 0.9], [x + dx, 0, dz], 0.03, wc, 4);
    }
    if (r.chance(0.5)) { b.t('bark'); b.cyl(0, 0.9, 0, 0.16, 0.18, 2.2, 8, col(0x6a5040, 0.05, r), 0, 0, Math.PI / 2); }
    else { b.t('wood').box(0, 0.8, 0, 2.4, 0.05, 0.3, col(WOOD.fresh, 0.05, r)); b.t('metal').box(0.3, 0.86, 0.05, 0.5, 0.08, 0.02, col(METAL.steel)); }
    b.t('dirt'); for (let k = 0; k < 4; k++) b.cyl(r.range(-0.6, 0.6), 0.01, r.range(-0.4, 0.4), r.range(0.15, 0.3), r.range(0.15, 0.3), 0.02, 6, col(0xc8a878, 0.06, r));
    return {};
  };
  L('sawhorse', 'wood');

  // ---------------------------------------------------------------- potter
  P.potters_wheel = (b, r) => { // kick wheel: a frame, a heavy flywheel below, the head with a pot on it, a bench
    const wc = col(WOOD.dark, 0.05, r);
    b.t('wood');
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) b.box(x, 0.4, z, 0.07, 0.8, 0.07, wc);
    b.box(0, 0.78, -0.35, 0.8, 0.06, 0.1, wc).box(0, 0.78, 0.35, 0.8, 0.06, 0.1, wc);
    b.t('stone').cyl(0, 0.12, 0, 0.36, 0.36, 0.12, 12, col(0x8e8474, 0.05, r));
    b.t('wood').cyl(0, 0.45, 0, 0.04, 0.04, 0.7, 6, wc).cyl(0, 0.82, 0, 0.18, 0.18, 0.04, 12, col(0x6a5a48));
    b.t('plain'); lathe(b, [[0.06, 0], [0.12, 0.08], [0.13, 0.16], [0.07, 0.24], [0.08, 0.27]], col(0x9a7a5a, 0.04, r), 0, 0.84, 0, 12);
    b.t('wood').box(0, 0.45, -0.7, 0.7, 0.06, 0.3, wc).box(-0.28, 0.22, -0.7, 0.06, 0.44, 0.26, wc).box(0.28, 0.22, -0.7, 0.06, 0.44, 0.26, wc);
    b.t('dirt').cyl(0, 0.01, 0.2, 0.7, 0.7, 0.02, 8, col(0x8a6a50, 0.04, r)); // clay slop
    return {};
  };
  L('potters_wheel', 'wood');

  // ---------------------------------------------------------------- weaver
  P.loom = (b, r) => { // floor (treadle) loom: posts, beams, a woven panel, the warp, treadles, a bench
    const wc = col(WOOD.weathered, 0.05, r), W = 1.3;
    b.t('wood');
    for (const x of [-W / 2, W / 2]) for (const z of [-0.6, 0.6]) b.box(x, 0.7, z, 0.08, 1.4, 0.08, wc);
    for (const z of [-0.6, 0.6]) b.box(0, 1.38, z, W + 0.1, 0.08, 0.08, wc);
    for (const x of [-W / 2, W / 2]) b.box(x, 1.38, 0, 0.08, 0.08, 1.3, wc);
    b.cyl(0, 0.75, 0.6, 0.07, 0.07, W, 8, wc, 0, 0, Math.PI / 2).cyl(0, 0.8, -0.6, 0.07, 0.07, W, 8, wc, 0, 0, Math.PI / 2);
    b.box(0, 1.1, 0.05, W - 0.1, 0.5, 0.05, wc); // beater
    const a = col(r.pick(DYE), 0.05, r), c2 = col(r.pick(DYE), 0.05, r);
    b.t('fabric');
    for (let k = 0; k < 6; k++) b.box(0, 0.79, 0.4 - k * 0.07, W - 0.2, 0.01, 0.07, k % 2 ? a : c2); // woven cloth on the breast beam side
    b.t('plain'); for (let k = 0; k < 12; k++) { const x = -W / 2 + 0.15 + k * ((W - 0.3) / 11); rod(b, [x, 0.8, 0.0], [x, 0.84, -0.6], 0.006, col(0xd8ccb0), 3); } // warp
    b.t('wood'); for (const x of [-0.25, 0, 0.25]) b.box(x, 0.06, -0.1, 0.08, 0.04, 0.9, wc);
    b.box(0, 0.5, 1.05, W - 0.2, 0.06, 0.3, wc).box(-0.45, 0.25, 1.05, 0.06, 0.5, 0.26, wc).box(0.45, 0.25, 1.05, 0.06, 0.5, 0.26, wc);
    return {};
  };
  L('loom', 'wood');
  P.yarn_line = (b, r, o) => { // dyed skeins drying on a line, dye pots under it
    const Ln = o.length || 3.4, p = col(WOOD.pole, 0.05, r);
    b.t('wood'); b.beam([-Ln / 2, 0, 0], [-Ln / 2, 1.9, 0], 0.05, 4, p); b.beam([Ln / 2, 0, 0], [Ln / 2, 1.9, 0], 0.05, 4, p);
    b.t('plain'); b.beam([-Ln / 2, 1.85, 0], [Ln / 2, 1.82, 0], 0.01, 3, col(0x3a3020));
    b.t('fabric');
    for (let x = -Ln / 2 + 0.3; x < Ln / 2 - 0.2; x += r.range(0.22, 0.35)) { const h = r.range(0.45, 0.7), c = col(r.pick(DYE), 0.06, r); b.box(x, 1.83 - h / 2, 0, 0.08, h, 0.06, c); b.box(x, 1.83 - h, 0, 0.1, 0.06, 0.08, c); }
    b.t('metal'); for (let k = 0; k < 2; k++) { const x = r.range(-0.8, 0.8); b.cyl(x, 0.22, 0.7, 0.28, 0.24, 0.44, 10, col(0x3a3632)); b.t('plain').cyl(x, 0.43, 0.7, 0.25, 0.25, 0.02, 10, col(r.pick(DYE))); b.t('metal'); }
    return {};
  };
  L('yarn_line', 'wood');

  // ---------------------------------------------------------------- saddler / tanner
  P.saddle_rack = (b, r) => { // a rail on legs with pack saddles and harness, coiled rope, a stool and leather on a bench
    const wc = col(WOOD.weathered, 0.05, r);
    b.t('wood').box(0, 0.95, 0, 2.4, 0.1, 0.1, wc);
    for (const x of [-1.1, 1.1]) { rod(b, [x, 0.95, 0], [x - 0.15, 0, -0.3], 0.04, wc, 4); rod(b, [x, 0.95, 0], [x - 0.15, 0, 0.3], 0.04, wc, 4); }
    b.t('hide');
    for (const x of [-0.6, 0.35]) { const c = col(r.pick([0x6a4a2e, 0x8a5a36, 0x5a3a24]), 0.05, r); ellip(b, x, 1.02, 0, 0.32, 0.12, 0.28, c); for (const s of [-1, 1]) b.box(x, 0.78, s * 0.24, 0.5, 0.4, 0.04, c); }
    b.t('plain'); ring(b, 1.45, 0.03, -0.45, 0.2, 0.03, col(0xb0a070), Math.PI * 2, 0, 12);
    b.t('wood').box(0.2, 0.42, 0.9, 1.4, 0.06, 0.45, wc).box(-0.4, 0.2, 0.9, 0.06, 0.4, 0.4, wc).box(0.8, 0.2, 0.9, 0.06, 0.4, 0.4, wc);
    b.t('hide').box(0.1, 0.46, 0.9, 0.7, 0.02, 0.38, col(0x9a6a40, 0.05, r));
    return {};
  };
  L('saddle_rack', 'wood');

  // ---------------------------------------------------------------- fisher
  P.panga = (b, r, o) => { // open fibreglass skiff, on its keel on rollers or upturned on blocks
    const up = o.upturned ?? r.chance(0.5), hull = col(o.color || r.pick(HULL), 0.05, r), band = col(r.pick(HULL), 0.05, r), Ln = 6.4, Bm = 1.0;
    const half = (z) => { const t = (z + Ln / 2) / Ln; return Bm * (t < 0.3 ? 0.85 + 0.5 * t : t < 0.62 ? 1 : 1 - Math.pow((t - 0.62) / 0.38, 1.6) * 0.94); }; // square stern (-z), fine bow (+z)
    const N = 10, H = 0.7;
    b.t('plain');
    const sgn = up ? -1 : 1, y0 = up ? 0.75 : 0.35;
    for (let i = 0; i < N; i++) {
      const z0 = -Ln / 2 + (i / N) * Ln, z1 = -Ln / 2 + ((i + 1) / N) * Ln, w0 = half(z0), w1 = half(z1);
      for (const s of [-1, 1]) { // topsides and the vee bottom, each face both ways
        const A = [s * w0, y0 + sgn * H * 0.5, z0], B = [s * w1, y0 + sgn * H * 0.5, z1], C2 = [s * w1 * 0.3, y0 - sgn * H * 0.4, z1], D = [s * w0 * 0.3, y0 - sgn * H * 0.4, z0];
        const Kb = [0, y0 - sgn * H * 0.5, z1], Ka = [0, y0 - sgn * H * 0.5, z0];
        b.quad(A, B, C2, D, hull); b.quad(A, D, C2, B, hull); b.quad(D, C2, Kb, Ka, hull); b.quad(D, Ka, Kb, C2, hull);
        b.box(s * (w0 + w1) / 2, y0 + sgn * H * 0.42, (z0 + z1) / 2, 0.04, 0.1, Ln / N + 0.02, band, s * Math.atan2(w1 - w0, Ln / N));
      }
    }
    { const w = half(-Ln / 2), z = -Ln / 2, G = [w, y0 + sgn * H * 0.5], M = [w * 0.3, y0 - sgn * H * 0.4], K = y0 - sgn * H * 0.5; // transom: both faces
      const pts = [[-G[0], G[1], z], [G[0], G[1], z], [M[0], M[1], z], [0, K, z], [-M[0], M[1], z]]; b.poly(pts, hull); b.poly([...pts].reverse(), hull); }
    if (!up) { b.t('wood'); for (const z of [-1.2, 0.6]) b.box(0, y0 + 0.15, z, Bm * 1.7, 0.05, 0.3, col(WOOD.weathered)); b.t('metal').box(0, y0 + 0.3, -Ln / 2 - 0.25, 0.3, 0.55, 0.35, col(r.pick([0x2a2a2a, 0xd8d4c8, 0x3a3a3a]))); }
    b.t('wood'); for (const z of [-1.8, 1.4]) b.cyl(0, up ? 0.15 : 0.1, z, up ? 0.15 : 0.1, up ? 0.15 : 0.1, 1.6, 8, col(WOOD.dark), 0, 0, Math.PI / 2); // rollers / blocks
    return {};
  };
  L('panga', 'plain');
  P.net_rack = (b, r, o) => { // a net hung to dry between two poles, cork floats along the head rope
    const Ln = o.length || 4, p = col(WOOD.pole, 0.05, r), nc = col(r.pick([0x3a5a4a, 0x5a6a5a, 0x2a3a4a, 0x8a7a5a]), 0.05, r);
    b.t('wood'); b.beam([-Ln / 2, 0, 0], [-Ln / 2, 2.2, 0], 0.06, 5, p); b.beam([Ln / 2, 0, 0], [Ln / 2, 2.2, 0], 0.06, 5, p);
    b.t('fabric');
    const M = 8;
    for (let i = 0; i < M; i++) { // sagging folds
      const x0 = -Ln / 2 + (i / M) * Ln, x1 = -Ln / 2 + ((i + 1) / M) * Ln, s0 = Math.sin((i / M) * Math.PI) * 0.35, s1 = Math.sin(((i + 1) / M) * Math.PI) * 0.35, f = (i % 2 ? 0.06 : -0.06);
      const A = [x0, 2.1 - s0, 0], B = [x1, 2.1 - s1, 0], C2 = [x1, 0.5 - s1 * 0.5, f], D = [x0, 0.5 - s0 * 0.5, -f];
      b.quad(A, D, C2, B, nc); b.quad(A, B, C2, D, nc);
    }
    b.t('plain'); for (let i = 0; i <= M; i += 1) { const x = -Ln / 2 + (i / M) * Ln, s = Math.sin((i / M) * Math.PI) * 0.35; b.box(x, 2.1 - s, 0, 0.1, 0.06, 0.1, col(0xd8a040)); }
    b.t('fabric'); b.box(r.range(-1, 1), 0.08, 0.6, 1.2, 0.16, 0.8, nc); // a heap of net at the foot
    return {};
  };
  L('net_rack', 'wood');
  P.fish_rack = (b, r, o) => { // split fish drying on a slatted rack (machaca de pescado), salt sacks
    const Ln = o.length || 2.4, wc = col(WOOD.weathered, 0.05, r);
    b.t('wood');
    for (const x of [-Ln / 2, Ln / 2]) for (const z of [-0.4, 0.4]) b.box(x, 0.45, z, 0.06, 0.9, 0.06, wc);
    for (let z = -0.4; z <= 0.41; z += 0.1) b.box(0, 0.9, z, Ln + 0.1, 0.03, 0.04, wc);
    b.t('hide');
    for (let x = -Ln / 2 + 0.2; x < Ln / 2 - 0.1; x += r.range(0.22, 0.32)) {
      const c = col(r.pick([0xc8a882, 0xb8987a, 0xd8c0a0, 0xa88a6a]), 0.06, r);
      b.box(x, 0.93, r.range(-0.08, 0.08), 0.16, 0.02, 0.55, c, r.range(-0.1, 0.1)); b.box(x, 0.94, 0.33, 0.1, 0.02, 0.1, c);
    }
    b.t('fabric'); b.box(Ln / 2 + 0.4, 0.25, 0.1, 0.45, 0.5, 0.35, col(0xd8ccb0, 0.05, r));
    return {};
  };
  L('fish_rack', 'wood');
  P.crab_traps = (b, r, o) => { // stacked wire box traps, a float and coil of line
    const n = o.count || r.int(3, 6), wc = col(r.pick([0x5a5a52, 0x8a6a40, 0x3a4a4a]), 0.05, r);
    b.t('metal');
    for (let k = 0; k < n; k++) {
      const x = (k % 3) * 0.66 - 0.66, y = Math.floor(k / 3) * 0.4, z = r.range(-0.05, 0.05);
      // wire frame: the twelve edges, then a sparse mesh of bars on the sides and top (see-through)
      for (const yy of [0.01, 0.39]) { b.box(x, y + yy, z - 0.25, 0.6, 0.02, 0.02, wc); b.box(x, y + yy, z + 0.25, 0.6, 0.02, 0.02, wc); b.box(x - 0.29, y + yy, z, 0.02, 0.02, 0.5, wc); b.box(x + 0.29, y + yy, z, 0.02, 0.02, 0.5, wc); }
      for (const [dx, dz] of [[-0.29, -0.25], [0.29, -0.25], [-0.29, 0.25], [0.29, 0.25]]) b.box(x + dx, y + 0.2, z + dz, 0.02, 0.38, 0.02, wc);
      for (let i = -2; i <= 2; i++) { for (const dz of [-0.25, 0.25]) b.box(x + i * 0.1, y + 0.2, z + dz, 0.008, 0.38, 0.008, wc); b.box(x + i * 0.1, y + 0.39, z, 0.008, 0.008, 0.5, wc); }
      for (let i = -1; i <= 1; i++) for (const dx of [-0.29, 0.29]) b.box(x + dx, y + 0.2, z + i * 0.12, 0.008, 0.38, 0.008, wc);
      b.box(x, y + 0.2, z, 0.58, 0.008, 0.48, wc); // mid-height bait shelf
    }
    b.t('plain'); ellip(b, 1.2, 0.15, 0.2, 0.15, 0.15, 0.15, col(r.pick([0xd85a20, 0xe8c030, 0xd8d4c8]))); ring(b, 1.2, 0.03, -0.3, 0.22, 0.03, col(0xb0a070), Math.PI * 2, 0, 12);
    return {};
  };
  L('crab_traps', 'metal');

  // ---------------------------------------------------------------- salvager (pepenador)
  P.sort_bins = (b, r) => { // cut drums and crates sorted by material: cans, copper, glass, rags, plastic
    const fills = [0x9a9a92, 0xb86a3a, 0x6a9a7a, 0xd8ccb0, 0x3a6a9a, 0x2a2826];
    b.t('rust');
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 0.75, c = col(r.pick([METAL.rust, METAL.rust2, 0x3a5a7a, 0x5a6a4a]), 0.06, r);
      if (k % 2) { b.t('wood').box(x, 0.3, 0, 0.62, 0.6, 0.62, col(WOOD.weathered, 0.05, r)); b.t('rust'); }
      else b.cyl(x, 0.35, 0, 0.3, 0.3, 0.7, 10, c);
      b.t('plain'); for (let i = 0; i < 6; i++) b.blob(x + r.range(-0.18, 0.18), (k % 2 ? 0.6 : 0.7) + r.range(-0.02, 0.06), r.range(-0.18, 0.18), r.range(0.06, 0.12), r.range(0.04, 0.08), r.range(0.06, 0.12), col(r.pick(fills), 0.08, r), 'dodec', r.next() * 3);
      b.t('rust');
    }
    b.t('fabric'); b.box(1.9, 0.3, 0.3, 0.7, 0.6, 0.6, col(0xd8ccb0, 0.06, r), 0.3); b.box(1.8, 0.75, 0.25, 0.6, 0.4, 0.5, col(0x5a7a9a, 0.06, r), -0.2); // sacks of plastic
    return {};
  };
  L('sort_bins', 'rust');
  P.scale = (b, r) => { // tripod with a hanging steelyard and pan
    const p = col(WOOD.pole, 0.05, r), iron = col(0x3a3836);
    b.t('wood'); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; rod(b, [0, 2.2, 0], [Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9], 0.05, p, 5); }
    b.t('metal'); rod(b, [0, 2.15, 0], [0, 1.7, 0], 0.01, iron, 3); rod(b, [-0.5, 1.68, 0], [0.4, 1.7, 0], 0.02, iron, 5); ellip(b, 0.35, 1.6, 0, 0.06, 0.08, 0.06, iron);
    rod(b, [-0.45, 1.68, 0], [-0.45, 1.0, 0], 0.006, iron, 3); b.cyl(-0.45, 0.98, 0, 0.3, 0.26, 0.06, 10, col(METAL.steel, 0.05, r));
    b.t('plain'); for (let i = 0; i < 3; i++) b.blob(-0.45 + r.range(-0.12, 0.12), 1.05, r.range(-0.1, 0.1), 0.08, 0.05, 0.08, col(r.pick([0xb86a3a, 0x9a9a92])), 'dodec');
    return {};
  };
  L('scale', 'wood');

  // ---------------------------------------------------------------- aguador
  P.water_cart = (b, r, o) => { // two-wheel cart with a barrel tank and a spigot, shafts for the burro, cans hanging
    const wc = col(WOOD.weathered, 0.06, r), dark = col(WOOD.dark);
    b.t('wood').box(0, 0.75, 0, 1.3, 0.08, 1.8, wc);
    for (const s of [-1, 1]) { b.cyl(s * 0.78, 0.6, 0, 0.6, 0.6, 0.08, 12, dark, 0, 0, Math.PI / 2); b.plank([s * 0.45, 0.78, 0.85], [s * 0.4, 0.55, 2.6], 0.07, 0.07, wc); }
    const steel = r.chance(0.5);
    b.t(steel ? 'rust' : 'wood').cyl(0, 1.3, 0, 0.5, 0.5, 1.5, 12, col(steel ? r.pick([METAL.rust, 0x5a7a8a, 0x8a8a80]) : WOOD.fresh, 0.05, r), Math.PI / 2, 0, 0);
    b.t('metal'); for (const z of [-0.55, 0.55]) b.cyl(0, 1.3, z, 0.52, 0.52, 0.05, 12, col(0x3a3836), Math.PI / 2, 0, 0);
    b.cyl(0, 1.85, 0.2, 0.1, 0.1, 0.1, 8, col(0x3a3836)); rod(b, [0, 1.0, -0.75], [0, 0.85, -0.9], 0.03, col(METAL.steel), 6);
    b.t('plain'); for (const s of [-1, 1]) for (let k = 0; k < 2; k++) b.cyl(s * 0.72, 1.0, -0.5 + k * 0.4, 0.13, 0.13, 0.35, 8, col(r.pick([0x8a9a8a, 0x5f7f96, 0xd8ccb0]), 0.05, r));
    return {};
  };
  L('water_cart', 'wood');

  P.cooler = (b, r) => { // pre-war ice chest
    const c = col(r.pick([0xc83a2a, 0x2a6ab0, 0xe8e4dc, 0x3a8a6a]), 0.05, r);
    b.t('plain').box(0, 0.24, 0, 0.75, 0.46, 0.45, c).box(0, 0.49, 0, 0.77, 0.06, 0.47, col(0xe8e4dc)).box(0, 0.53, 0, 0.3, 0.03, 0.06, col(0x8a8a84));
    return {};
  };
  L('cooler', 'plain');

  // ---------------------------------------------------------------- curandero
  P.herb_bed = (b, r, o) => { // low stone-edged bed of medicinal herbs (rue, epazote, estafiate, chamomile, aloe)
    const Ln = o.length || 2.6, Wd = o.width || 1.0;
    b.t('stone'); const st = col(0x9a8e7a, 0.06, r);
    b.box(0, 0.1, -Wd / 2, Ln, 0.2, 0.12, st).box(0, 0.1, Wd / 2, Ln, 0.2, 0.12, st).box(-Ln / 2, 0.1, 0, 0.12, 0.2, Wd, st).box(Ln / 2, 0.1, 0, 0.12, 0.2, Wd, st);
    b.t('dirt').box(0, 0.17, 0, Ln - 0.12, 0.04, Wd - 0.12, col(0x5a4632));
    for (const z of [-Wd / 4, Wd / 4]) plantRow(b, r, -Ln / 2 + 0.2, z, Ln / 2 - 0.2, z, 0.18, 0.38, { herb: 4, aloe: 1.2, marigold: 1, chile: 0.5, flowers: 0.8 }, 0.32);
    return {};
  };
  L('herb_bed', 'stone');
  P.altar = (b, r, o) => { // yard altar: a draped table under a little roof, saints, candles, copal, herbs and eggs for limpias
    const wc = col(WOOD.dark, 0.05, r), cloth = col(r.pick([0xe8e0d0, 0xa83a32, 0x2f5a8a]), 0.05, r);
    b.t('wood'); for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) b.box(x, 0.4, z, 0.06, 0.8, 0.06, wc);
    b.t('fabric').box(0, 0.82, 0, 1.3, 0.04, 0.75, cloth).box(0, 0.55, 0.38, 1.3, 0.55, 0.02, cloth);
    b.t('wood'); for (const x of [-0.6, 0.6]) b.box(x, 1.4, -0.32, 0.07, 1.3, 0.07, wc);
    b.box(0, 2.05, -0.15, 1.5, 0.05, 0.7, col(WOOD.weathered), 0, -0.2);
    b.box(0, 1.25, -0.36, 1.1, 0.8, 0.03, col(0x8a6a4a)); // back board
    b.t('plain');
    for (const x of [-0.3, 0.05, 0.32]) { const sc = col(r.pick([0x3a6ab0, 0xe8e0d0, 0xa83a32, 0xd8a040]), 0.05, r); b.box(x, 1.0, -0.2, 0.12, 0.3, 0.08, sc); ellip(b, x, 1.2, -0.2, 0.045, 0.05, 0.045, col(0xc8a07a)); }
    b.box(0, 1.35, -0.34, 0.35, 0.45, 0.02, col(r.pick([0x3a7a5a, 0x2f5a8a]))); // printed image
    for (let k = 0; k < 4; k++) { const x = -0.5 + k * 0.33; b.ch('lamp').w(o._r ?? (r.chance(0.5) ? -0.5 : 9)).cyl(x, 0.95, 0.15, 0.03, 0.03, 0.18, 6, 0xffd890).w(-1).ch('main'); }
    b.t('plain'); for (let k = 0; k < 3; k++) ellip(b, 0.35 + k * 0.08, 0.88, 0.2, 0.035, 0.045, 0.035, col(0xe8e0d0)); // eggs
    lathe(b, [[0.05, 0], [0.09, 0.05], [0.07, 0.1]], col(0x8e5a3a), -0.1, 0.84, 0.18, 8); // copal burner
    for (const x of [-0.45, 0.45]) herbBundle(b, r, x, 1.95, 0.1, 0.35);
    plant(b, 'marigold', -0.45, 0.84, 0.1, 0.25, r); plant(b, 'flowers', 0.15, 0.84, 0.0, 0.22, r);
    return { lights: [{ at: [0, 1.1, 0.4], color: LIGHT_COL.candle || LIGHT_COL.fire, radius: 3, intensity: 0.6, kind: 'fire', flicker: true }], emitters: [{ type: 'smoke', p: [-0.1, 0.95, 0.18], always: true, small: true }] };
  };
  L('altar', 'wood');
}

// ---------------------------------------------------------------- El Pelícano (landmark asset)
// Cantina El Pelícano (gazetteer: San Quintín, central, visible from the road, faded painted pelican on the
// sign, run by Próspero, daily special always 'Lo Que Hay'). A dead pre-war motorhome on blocks turned
// into the cantina (Danyil's canon: a pre-war luxury RV, pink pelican neon): a rusted pelican cut-out with a pink
// neon outline and neon lettering on the roof (o.neon === false: dead tubes, painted lettering), the side door open onto a plank step, a patchwork tarp on two poles, a flagstone patio with odd
// metal chairs, a chess table, lanterns, planters in crates, barrels and a potted fig. Local frame:
// the bus runs along x at the back (z -3.8..-1.2), the patio opens toward +z (the street). ~12 × 10 m.
// o.text overrides the sign; lanterns are oil (lit unless o.lit === false); the neon needs power (_r).
export function addPelicano(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);
  const steel = (r) => col(r.pick([0x6a6a64, 0x5a5650, 0x7a7068, METAL.rust]), 0.06, r);
  const metalChair = (b, r, x, z, yaw, cushion = false) => {
    b.pushT(x, 0, z, yaw);
    const c = steel(r), seat = cushion ? col(0xc8a040, 0.06, r) : c;
    b.t('metal');
    for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) rod(b, [lx, 0.45, lz], [lx * 1.08, 0, lz * 1.1], 0.015, c, 4);
    rod(b, [-0.2, 0.45, -0.2], [-0.21, 0.92, -0.25], 0.015, c, 4); rod(b, [0.2, 0.45, -0.2], [0.21, 0.92, -0.25], 0.015, c, 4);
    b.t(cushion ? 'fabric' : 'metal').box(0, 0.46, 0, 0.44, cushion ? 0.08 : 0.03, 0.42, seat).box(0, 0.76, -0.23, 0.44, cushion ? 0.38 : 0.26, cushion ? 0.08 : 0.03, seat, 0, -0.12);
    b.pop();
  };
  const lantern = (b, r, x, y, z, w) => {
    b.t('metal').cyl(x, y + 0.02, z, 0.07, 0.07, 0.04, 8, col(0x3a3836)).cyl(x, y + 0.3, z, 0.05, 0.07, 0.04, 8, col(0x3a3836));
    rod(b, [x, y + 0.32, z], [x, y + 0.38, z], 0.008, col(0x3a3836), 3);
    b.ch('lamp').w(w).t('plain').cyl(x, y + 0.16, z, 0.06, 0.06, 0.24, 8, 0xffc070).w(-1).ch('main');
  };
  P.el_pelicano = (b, r, o) => {
    const NEON = o.neon !== false, neonW = o._r ?? 9, lanW = o.lit === false ? 9 : -0.5, lights = [];
    // ---- the motorhome (class-A, dead and on blocks)
    const X0 = -4.6, X1 = 4.4, Z0 = -3.8, Z1 = -1.25, Y0 = 0.6, Y1 = 3.25, zc = (Z0 + Z1) / 2, D = Z1 - Z0;
    const body = col(r.pick([0x3a3a38, 0x34383a, 0x40403c]), 0.03, r), trim = col(0x8a8a82, 0.04, r), rust = col(METAL.rust, 0.08, r), dark = col(GLASS_DARK);
    b.t('metal');
    b.box((X0 + X1) / 2, (Y0 + Y1) / 2, zc, X1 - X0, Y1 - Y0, D, body);
    b.box((X0 + X1) / 2, Y1 + 0.05, zc, X1 - X0 - 0.2, 0.1, D - 0.2, col(0xb8b4a8, 0.05, r)); // white roof cap, faded
    // front cap: sloped windshield and a lower nose
    b.box(X1 + 0.45, Y0 + 0.65, zc, 0.9, 1.3, D, body);
    b.quad([X1, Y1, Z0], [X1, Y1, Z1], [X1 + 0.9, Y0 + 1.3, Z1], [X1 + 0.9, Y0 + 1.3, Z0], dark); // windshield
    b.quad([X1 + 0.9, Y0 + 1.3, Z1], [X1, Y1, Z1], [X1, Y0 + 1.3, Z1], [X1 + 0.9, Y0 + 1.3, Z1], body); b.quad([X1, Y1, Z0], [X1 + 0.9, Y0 + 1.3, Z0], [X1, Y0 + 1.3, Z0], [X1, Y1, Z0], body);
    b.box(X1 + 0.92, Y0 + 0.35, zc, 0.06, 0.3, D - 0.4, trim); // bumper
    // stripes, windows (some boarded), the open door, rust, bullet holes, graffiti
    for (const zs of [Z1 + 0.01, Z0 - 0.01]) { b.box((X0 + X1) / 2, Y0 + 0.9, zs, X1 - X0, 0.07, 0.02, trim); b.box((X0 + X1) / 2, Y0 + 1.0, zs, X1 - X0, 0.03, 0.02, col(0xa83a32, 0.08, r)); }
    for (const [x0, x1, boarded] of [[-4.2, -2.6, r.chance(0.5)], [-1.6, 0.6, r.chance(0.6)], [3.0, 4.2, false]]) {
      b.box((x0 + x1) / 2, Y0 + 1.85, Z1 + 0.02, x1 - x0, 0.75, 0.02, boarded ? col(0x9a8466, 0.06, r) : dark);
      if (boarded) { b.t('wood'); for (let k = 0; k < 3; k++) b.box((x0 + x1) / 2, Y0 + 1.6 + k * 0.26, Z1 + 0.04, x1 - x0 + 0.1, 0.22, 0.03, col(WOOD.weathered, 0.07, r)); b.t('metal'); }
    }
    b.box(-1.0, Y0 + 1.85, Z0 - 0.02, 5.0, 0.7, 0.02, dark);
    const DX = 1.9; // door
    b.box(DX, Y0 + 1.0, Z1 + 0.015, 0.8, 1.95, 0.02, col(0x14120f)); b.box(DX - 0.42, Y0 + 1.0, Z1 + 0.03, 0.05, 1.95, 0.03, trim); b.box(DX + 0.42, Y0 + 1.0, Z1 + 0.03, 0.05, 1.95, 0.03, trim);
    b.pushT(DX + 0.4, Y0 + 1.0, Z1 + 0.03, -1.9); b.box(0.38, 0, 0, 0.76, 1.9, 0.04, col(0x8a7a64, 0.05, r)); b.box(0.4, 0.45, 0.025, 0.4, 0.45, 0.01, dark); b.pop();
    b.ch('lamp').w(lanW).t('plain').box(DX, Y0 + 1.0, Z1 - 0.05, 0.7, 1.8, 0.02, 0x5a3a1c).w(-1).ch('main'); // warm light inside the doorway
    b.t('rust'); for (let k = 0; k < 7; k++) b.box(r.range(X0 + 0.3, X1 - 0.3), r.range(Y0 + 0.1, Y0 + 0.5), Z1 + 0.012, r.range(0.2, 0.7), r.range(0.1, 0.3), 0.01, col(0x5a3424, 0.08, r));
    b.t('plain'); for (let k = 0; k < 9; k++) b.cyl(3.4 + r.range(-0.6, 0.6), Y0 + r.range(0.7, 1.5), Z1 + 0.02, 0.035, 0.035, 0.01, 6, col(0x0a0a0a), Math.PI / 2, 0, 0); // bullet holes
    for (let k = 0; k < 6; k++) b.box(-3.6 + k * 0.28 + r.range(-0.05, 0.05), Y0 + 0.62 + r.range(-0.1, 0.1), Z1 + 0.02, 0.22, 0.04, 0.01, col(0xd8d8d0), 0, 0, r.range(-0.8, 0.8));
    b.t('metal').box(-2.4, Y1 + 0.25, zc, 0.9, 0.35, 0.8, col(0x9a9890, 0.05, r)); // roof AC
    for (let k = 0; k < 8; k++) b.box(X0 - 0.03, Y0 + 0.3 + k * 0.3, Z1 - 0.4, 0.04, 0.03, 0.5, trim); // rear ladder
    b.t('metal').box(X0 + 1.2, 0.4, Z0 - 0.55, 1.1, 0.8, 0.7, col(0x5a6a4a, 0.05, r)).box(X0 + 1.2, 0.83, Z0 - 0.55, 1.15, 0.06, 0.75, col(0x3a3a38)); rod(b, [X0 + 1.6, 0.85, Z0 - 0.7], [X0 + 1.6, 1.5, Z0 - 0.7], 0.035, col(METAL.dark), 6); // the generator out back
    // wheels (flat, half sunk) and blocks under the frame
    for (const x of [X0 + 1.6, X1 - 0.4]) for (const z of [Z0 + 0.15, Z1 - 0.15]) { b.t('plain').cyl(x, 0.42, z, 0.45, 0.45, 0.3, 12, col(0x1e1e1c), Math.PI / 2, 0, 0); b.t('metal').cyl(x, 0.42, z + Math.sign(z - zc) * 0.16, 0.22, 0.22, 0.02, 10, col(0x8a8a82), Math.PI / 2, 0, 0); }
    b.t('block'); for (const x of [-2.6, 0.6, 2.8]) for (const z of [Z0 + 0.4, Z1 - 0.4]) b.box(x, 0.3, z, 0.4, 0.6, 0.4, col(0x9a968c, 0.05, r));
    b.t('wood').box(DX, 0.12, Z1 + 0.55, 1.4, 0.24, 1.0, col(WOOD.weathered, 0.05, r)).box(DX, 0.36, Z1 + 0.25, 1.2, 0.2, 0.45, col(WOOD.weathered, 0.05, r)); // plank step
    b.t('corrugated').box(-0.3, 0.95, Z1 + 0.3, 1.2, 1.9, 0.04, col(0x6a5a4a, 0.08, r), 0, -0.14); // sheet leaning on the side
    // ---- roof sign: a rusted board with neon letters, the pelican cut-out with neon outline, a brace
    const SX = 1.2, SY = Y1 + 0.35, SW = 4.4, SH = 1.05, text = o.text || 'CANTINA\nEL PELÍCANO', signs = [{ text, x: SX, y: SY + SH / 2, z: Z1 - 0.16, ry: 0, w: SW - 0.15, h: SH - 0.12, style: NEON ? 'neon' : 'painted', rust: true, ...(NEON ? { r: neonW, color: '#ff70c0' } : {}) }];
    b.t('rust'); b.box(SX, SY + SH / 2, Z1 - 0.2, SW, SH, 0.06, rust);
    for (const x of [SX - SW / 2 + 0.3, SX + SW / 2 - 0.3]) b.box(x, SY - 0.05, Z1 - 0.35, 0.08, 0.5, 0.08, col(METAL.dark));
    // the pelican: standing in profile on the board's top-left corner, facing the lettering (after Danyil's line-art ref):
    // pointed tail low at the left, rounded breast, S-neck, small head, the long bill and pouch angled down to the right
    const S = 1.0, PX = SX - SW / 2 + 0.1, PY = SY + SH, PZ = Z1 - 0.2;
    const sil = [[0, 0.62], [0.375, 0.95], [0.75, 1.14], [1.04, 1.22], [1.17, 1.36], [1.19, 1.58], [1.2, 1.78], [1.3, 1.98], [1.47, 2.07], [1.66, 2.03],
      [2.12, 1.46], [2.16, 1.37], [1.96, 1.33], [1.74, 1.36], [1.58, 1.47], [1.5, 1.6], [1.56, 1.4], [1.6, 1.18], [1.6, 0.98], [1.5, 0.8], [1.28, 0.68], [0.94, 0.59], [0.56, 0.54], [0.19, 0.54]];
    const bill = [[1.62, 2.02], [2.12, 1.46], [2.16, 1.37], [1.96, 1.33], [1.74, 1.36], [1.58, 1.47], [1.5, 1.6], [1.52, 1.85]];
    const legs = [[[1.0, 0.57], [1.03, 0.04]], [[1.18, 0.62], [1.2, 0.04]], [[0.9, 0.03], [1.12, 0.03]], [[1.1, 0.03], [1.32, 0.03]]];
    const wing = [[0.45, 0.92], [0.8, 0.86], [1.1, 0.88], [1.36, 1.0]];
    const shp = new THREE.Shape(sil.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
    const sg = new THREE.ShapeGeometry(shp).toNonIndexed();
    const paint = NEON ? col(0x6a4030, 0.06, r) : col(0xd8ccb4, 0.04, r); b.t('plain'); b.addGeom(sg, new THREE.Matrix4().makeTranslation(PX, PY, PZ), paint); b.t('rust');
    for (let k = 0; k < 5; k++) { const [qx, qy] = r.pick(sil.slice(1, 6)); b.box(PX + qx * S * 0.9 + 0.08, PY + qy * S * 0.9, PZ + 0.006, r.range(0.1, 0.24), r.range(0.08, 0.18), 0.005, rust); } // paint flaked to rust
    b.t('plain'); b.addGeom(new THREE.ShapeGeometry(new THREE.Shape(bill.map(([x, y]) => new THREE.Vector2(x * S, y * S)))).toNonIndexed(), new THREE.Matrix4().makeTranslation(PX, PY, PZ + 0.004), NEON ? col(0x7a4a32, 0.06, r) : col(0xc89a50, 0.05, r)); // the bill
    b.t('rust'); b.addGeom(sg, new THREE.Matrix4().makeTranslation(PX, PY, PZ - 0.01).multiply(new THREE.Matrix4().makeScale(1, 1, -1)), rust);
    b.t('metal'); for (const [[x0, y0], [x1, y1]] of legs.slice(0, 2)) rod(b, [PX + x0 * S, PY + y0 * S, PZ - 0.02], [PX + x1 * S, PY, PZ - 0.02], 0.025, col(METAL.dark), 4); // the legs: steel rods on the board
    rod(b, [PX + 1.2 * S, PY + 1.5 * S, PZ - 0.05], [PX + 0.9, Y1 + 0.05, Z0 + 0.6], 0.03, col(METAL.dark), 4); // the brace to the roof
    const neon = col(NEON ? 0xff70c0 : 0x8a7a7a), nw = NEON ? neonW : 9, tube = (a, c, rr = 0.018) => rod(b, [PX + a[0] * S, PY + a[1] * S, PZ + 0.05], [PX + c[0] * S, PY + c[1] * S, PZ + 0.05], rr, neon, 4);
    b.ch('lamp').w(nw).t('plain');
    for (let i = 0; i < sil.length; i++) tube(sil[i], sil[(i + 1) % sil.length]);
    tube([1.6, 1.9], [2.1, 1.43], 0.014); // the line between the bill and the pouch
    for (let i = 0; i < wing.length - 1; i++) tube(wing[i], wing[i + 1], 0.015);
    for (const [a, c] of legs) tube(a, c, 0.016);
    b.cyl(PX + 1.44 * S, PY + 1.9 * S, PZ + 0.05, 0.03, 0.03, 0.02, 6, neon, Math.PI / 2, 0, 0); // eye
    b.w(-1).ch('main');
    // the glow sits on the neon itself: one on the lettering, one on the bird
    if (NEON) { lights.push({ at: [SX, SY + SH / 2, Z1 + 0.35], color: [1.0, 0.35, 0.75], radius: 7, intensity: 1.0, kind: 'neon', flicker: true, r: neonW }); lights.push({ at: [PX + 1.1 * S, PY + 1.1 * S, PZ + 0.35], color: [1.0, 0.35, 0.75], radius: 5, intensity: 0.8, kind: 'neon', flicker: true, r: neonW }); }
    // A-frame chalkboard out front: today's special, as for thirty years
    { const x = 2.9, z = 4.9, wc = col(WOOD.dark, 0.05, r); b.t('wood'); for (const sd of [-1, 1]) b.box(x, 0.5, z + sd * 0.18, 0.62, 1.0, 0.04, wc, 0, -sd * 0.2); signs.push({ text: 'HOY:\nLO QUE HAY', x, y: 0.55, z: z + 0.25, ry: 0, w: 0.52, h: 0.7, style: 'chalk' }); }
    // ---- patio: flagstones, gaps of dirt between
    b.t('stone');
    for (let gx = -5.4; gx < 5.4; gx += 0.82) for (let gz = -0.9; gz < 4.8; gz += 0.78) {
      if (r.chance(0.12) || (gz > 4 && r.chance(0.5)) || (Math.abs(gx) > 4.8 && r.chance(0.5))) continue;
      const cx = gx + r.range(-0.15, 0.15), cz = gz + r.range(-0.15, 0.15), n = r.int(5, 7), a0 = r.next() * 6.28, sx = r.range(0.36, 0.5), sz = r.range(0.32, 0.44), c = col(r.pick([0x7a7468, 0x857e70, 0x6e6a60, 0x8c8474, 0x777060]), 0.05, r);
      const pg = Array.from({ length: n }, (_, k) => { const a = a0 - (k / n) * Math.PI * 2 + r.range(-0.25, 0.25); return [cx + Math.cos(a) * sx * r.range(0.85, 1.1), cz + Math.sin(a) * sz * r.range(0.85, 1.1)]; });
      b.extrude(pg.reverse(), -0.06, r.range(0.07, 0.1), c, c);
    }
    // ---- the tarp: two leaning poles out front, the back edge tied along the bus roof; patchwork, sagging
    const p1 = [-5.2, 3.6], p2 = [-0.9, 4.4], ph = 3.0;
    b.t('wood'); for (const [x, z] of [p1, p2]) { rod(b, [x, 0, z], [x + 0.1, ph + 0.3, z - 0.15], 0.07, col(WOOD.pole, 0.05, r), 6); rod(b, [x + 0.1, ph + 0.1, z - 0.1], [x - 0.6, 0, z + 1.4], 0.008, col(0x8a7a58), 3); }
    const T = (u, v) => { // u along (0 at p1 .. 1 at p2), v from the poles (0) to the bus (1)
      const fx = p1[0] + (p2[0] - p1[0]) * u, fz = p1[1] + (p2[1] - p1[1]) * u, bx = -5.0 + 4.6 * u, bz = Z1 + 0.05;
      const y = ph + (Y1 - 0.1 - ph) * v - Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.35 - Math.sin(u * Math.PI) * 0.1 * (1 - v);
      return [fx + (bx - fx) * v, y, fz + (bz - fz) * v];
    };
    const CAN = [0xa89a7c, 0x9a8c70, 0x8a7e64, 0xb4a686, 0x7e745e, 0x9c8a66];
    b.ch('cloth').t('fabric');
    const NU = 6, NV = 5, patch = Array.from({ length: NU * NV }, () => col(r.pick(CAN), 0.05, r));
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = T(i / NU, j / NV), bb = T((i + 1) / NU, j / NV), c = T((i + 1) / NU, (j + 1) / NV), d = T(i / NU, (j + 1) / NV), pc = patch[Math.floor(j / 2) * NU + Math.floor(i / 2) * 2];
      b.quad(a, bb, c, d, pc); b.quad(a, d, c, bb, pc);
    }
    b.ch('main');
    // ---- tables and chairs: a round one under the tarp, the chess table by the door, a far one
    const roundT = (x, z) => { const c = steel(r); b.t('metal').cyl(x, 0.74, z, 0.42, 0.42, 0.03, 12, col(0x9a9890, 0.06, r)); rod(b, [x, 0.72, z], [x, 0.03, z], 0.025, c, 6); b.cyl(x, 0.02, z, 0.25, 0.25, 0.03, 8, c); };
    roundT(-3.6, 1.6); lantern(b, r, -3.5, 0.76, 1.55, lanW); lights.push({ at: [-3.5, 1.1, 1.55], color: [1.0, 0.66, 0.32], radius: 4.5, intensity: 0.9, kind: 'lamp', flicker: true, r: lanW });
    metalChair(b, r, -3.6, 0.9, 0); metalChair(b, r, -4.3, 2.0, 2.2); metalChair(b, r, -2.9, 2.2, -2.4);
    roundT(-2.2, -0.3); lantern(b, r, -2.1, 0.76, -0.3, r.chance(0.6) ? lanW : 9); metalChair(b, r, -1.5, -0.4, -1.6); metalChair(b, r, -2.9, -0.1, 1.5);
    { // the chess table: oblong top on a frame, board, mug, lantern
      const x = 0.4, z = 1.4, c = steel(r);
      b.t('metal').box(x, 0.74, z, 1.5, 0.04, 0.8, col(0x8a8478, 0.06, r));
      for (const [lx, lz] of [[-0.65, -0.32], [0.65, -0.32], [-0.65, 0.32], [0.65, 0.32]]) rod(b, [x + lx, 0.72, z + lz], [x + lx * 1.05, 0, z + lz * 1.05], 0.02, c, 4);
      b.t('wood').box(x - 0.05, 0.77, z, 0.48, 0.02, 0.48, col(0x6a4a2e));
      b.t('plain'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) b.box(x - 0.05 - 0.18 + i * 0.12, 0.785, z - 0.18 + j * 0.12, 0.12, 0.005, 0.12, col(0xd8c8a0));
      for (let k = 0; k < 10; k++) b.cyl(x - 0.05 + r.range(-0.2, 0.2), 0.81, z + (k % 2 ? 0.17 : -0.17) + r.range(-0.04, 0.04), 0.018, 0.022, 0.05, 5, col(k % 2 ? 0xe8e0d0 : 0x2a2420));
      b.cyl(x - 0.55, 0.81, z - 0.1, 0.045, 0.04, 0.09, 8, col(0xd8d4c8)); // tin mug
      lantern(b, r, x + 0.55, 0.76, z + 0.05, lanW); lights.push({ at: [x + 0.55, 1.1, z + 0.05], color: [1.0, 0.66, 0.32], radius: 5, intensity: 1.0, kind: 'lamp', flicker: true, r: lanW });
      metalChair(b, r, x - 0.2, z - 0.85, 0.1); metalChair(b, r, x - 0.4, z + 0.95, Math.PI + 0.2); metalChair(b, r, x + 2.2, z + 0.4, -1.9, true);
    }
    // ---- plants: agaves in crates, nopal in a drum, a fig in a big pot, small pots, a watering can
    const crate = (x, z, w2 = 0.9) => { b.t('wood').box(x, 0.2, z, w2, 0.4, 0.5, col(WOOD.weathered, 0.07, r)); b.t('dirt').box(x, 0.39, z, w2 - 0.08, 0.02, 0.42, col(0x4a3a2a)); };
    crate(-4.4, 4.1); plant(b, 'aloe', -4.6, 0.4, 4.1, 0.9, r); plant(b, 'aloe', -4.15, 0.4, 4.1, 0.7, r);
    crate(3.6, -0.5, 1.1); plantRow(b, r, 3.15, -0.5, 4.05, -0.5, 0.4, 0.45, { aloe: 2, herb: 1, sansevieria: 1 }, 0.4);
    b.t('rust').cyl(-5.3, 0.45, 2.4, 0.3, 0.3, 0.9, 10, col(METAL.rust, 0.06, r)); b.t('dirt').cyl(-5.3, 0.89, 2.4, 0.27, 0.27, 0.02, 10, col(0x4a3a2a)); plant(b, 'aloe', -5.3, 0.9, 2.4, 1.0, r);
    b.t('rust').cyl(5.2, 0.45, -0.6, 0.3, 0.3, 0.9, 10, col(METAL.rust2, 0.06, r));
    b.t('plain'); lathe(b, [[0.28, 0], [0.42, 0.55], [0.48, 0.7], [0.44, 0.74]], col(0x9a5a36, 0.05, r), 5.6, 0, 0.6, 14);
    b.t('bark'); rod(b, [5.6, 0.7, 0.6], [5.55, 1.5, 0.55], 0.06, col(0x6a6056), 6); rod(b, [5.55, 1.3, 0.55], [5.25, 1.9, 0.75], 0.04, col(0x6a6056), 5);
    plant(b, 'shrub', 5.6, 1.3, 0.6, 1.9, r); plant(b, 'shrub', 5.3, 1.6, 0.8, 1.2, r);
    for (const [x, z] of [[1.2, 3.4], [-1.3, 3.9], [4.6, 0.6]]) { b.t('plain').cyl(x, 0.17, z, 0.2, 0.15, 0.34, 8, col(r.pick(TERRA), 0.05, r)); plant(b, r.pick(['aloe', 'herb', 'geranium']), x, 0.33, z, 0.5, r); }
    b.t('metal').cyl(4.7, 0.16, 1.2, 0.13, 0.13, 0.3, 8, col(0x9a9a92, 0.05, r)); rod(b, [4.8, 0.2, 1.2], [5.05, 0.36, 1.2], 0.015, col(0x9a9a92), 4);
    b.t('wood').box(-5.6, 0.3, 0.2, 0.06, 1.5, 0.06, col(WOOD.pole), 0, 0, 0.3); // a shovel left against the pole
    return { lights, signs };
  };
  L('el_pelicano', 'metal');
  PROP_LIGHT.el_pelicano = { electric: false, essential: true }; // its own generator: the neon is on all night, power or not
}
const GLASS_DARK = 0x1c2226;

// ---------------------------------------------------------------- the sign tool's sign
// custom_sign: o.text (\n for lines), o.kind painted | printed | neon, o.size S | M | L (letter height),
// o.color (a SIGN_COLORS key), o.mount ground | wall | roof, o.height (wall: centre above the prop's
// origin), o.post (ground: post height). The board fits the text.
export const SIGN_LH = { S: 0.16, M: 0.28, L: 0.48 };
export function signDims(o) {
  const lines = String(o.text || 'SIGN').split('\n'), LH = SIGN_LH[o.size] || SIGN_LH.M, n = Math.max(...lines.map((l) => [...l].length), 1);
  const k = o.kind === 'neon' ? 0.62 : 0.74, pad = LH * (o.kind === 'neon' ? 0.9 : 0.7);
  return { w: Math.max(LH * 2, n * LH * k + pad * 2), h: lines.length * LH * 1.35 + pad, lines: lines.length, LH };
}
export function addSignProps(P, DEF_LAYER, PROP_LIGHT, SIGN_COLORS) {
  P.custom_sign = (b, r, o) => {
    const kind = ['painted', 'printed', 'neon'].includes(o.kind) ? o.kind : 'painted', mount = o.mount || 'ground';
    const { w, h } = signDims(o), pal = SIGN_COLORS[kind] || SIGN_COLORS.painted, [bg, fg] = pal[o.color] || Object.values(pal)[0];
    const postC = kind === 'painted' ? col(WOOD.pole, 0.05, r) : col(kind === 'neon' ? METAL.dark : METAL.steel, 0.04, r);
    const style = kind, board = kind === 'neon' ? 0x2a2c30 : kind === 'printed' ? 0xb8bcbc : 0x7a6248;
    let y, z = 0.02;
    if (mount === 'wall') { // flat on the wall, two brackets behind; the prop origin sits on the wall face
      y = o.height ?? 2.6; z = (o.out || 0) + 0.05;
      if (o.fascia) b.t('wood').box(0, y, z - 0.045, w + 0.35, 0.26, 0.05, col(WOOD.weathered, 0.05, r)); // nailed across the viga ends
      else { b.t('metal'); for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) b.box(sx, y, 0.012, 0.05, Math.min(h, 0.3), 0.024, col(METAL.dark)); }
    } else if (mount === 'roof') { // billboard frame: legs and braces behind it
      const H = o.post ?? 0.7; y = H + h / 2;
      b.t(kind === 'painted' ? 'wood' : 'metal');
      const legs = Math.max(2, Math.round(w / 1.6) + 1);
      for (let i = 0; i < legs; i++) { const x = -w / 2 + 0.15 + ((w - 0.3) * i) / (legs - 1); b.box(x, (H + h) / 2, -0.06, 0.07, H + h, 0.07, postC); rod(b, [x, H + h * 0.6, -0.08], [x, 0, -0.8], 0.03, postC, 4); }
      b.box(0, 0.03, -0.45, w, 0.05, 0.9, postC);
    } else { // ground: one pole for a small sign, two posts for a wide one
      const H = o.post ?? (o.size === 'L' ? 2.4 : o.size === 'S' ? 1.1 : 1.7); y = H + h / 2;
      b.t(kind === 'painted' ? 'wood' : 'metal');
      if (w <= 1.2) b.box(0, (H + h) / 2, -0.06, 0.09, H + h, 0.09, postC);
      else for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) b.box(sx, (H + h) / 2, -0.06, 0.1, H + h, 0.1, postC);
    }
    const signs = [{ text: o.text || 'SIGN', x: 0, y, z, ry: 0, w, h, style, bg, color: fg, board, level: true, twoSided: mount === 'ground', ...(kind === 'neon' ? { r: o._r ?? 9 } : {}) }];
    const lights = kind === 'neon' ? [{ at: [0, y, 0.9], color: fg.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255), radius: Math.min(9, 3 + w * 1.2), intensity: 1.0, kind: 'neon', flicker: true }] : [];
    return { signs, lights };
  };
  DEF_LAYER.custom_sign = 'metal';
  PROP_LIGHT.custom_sign = { electric: true, essential: true }; // a lit sign stays on all night where there's power
}

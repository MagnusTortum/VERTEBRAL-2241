// Prop overhaul, pass 1: smooth shading, more segments, proper wear. Replaces the old builders of
// the same name (brahmin, barrel, cistern, well, haystack, woodpile, firepit, rocks).
import { col } from './builder.js';
import { WOOD, METAL, ROOF, MISC } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { ellip, rod, lathe, ring, tube, rock } from './shapes.js';

export function addBetterProps(P, DEF_LAYER) {
  // ---------------------------------------------------------------- brahmin: two-headed mutant cattle
  // pose: stand | graze (one head down) | lie; front = +Z
  P.brahmin = (b, r, o) => {
    const hide = col(o.color || r.pick([0x8a6a4a, 0x7a5a3e, 0xa08060, 0x6e5a48, 0xb09878, 0x94704e]), 0.05, r);
    const dark = hide.clone().offsetHSL(0, -0.05, -0.12), belly = hide.clone().offsetHSL(0, -0.08, 0.07), muzzle = col(0x5a4038, 0.05, r);
    const hoof = col(0x2e2620), horn = col(0xd8ccb0, 0.04, r), patch = hide.clone().offsetHSL(0.01, 0.05, -0.18);
    const pose = o.pose || r.weighted({ stand: 5, graze: 3, lie: 1.5 });
    const lie = pose === 'lie', drop = lie ? 0.62 : 0;
    const by = 1.18 - drop;
    b.t('hide');
    // body: barrel, shoulders, haunch, belly
    ellip(b, 0, by, 0, 0.52, 0.5, 1.02, hide, 0, 0, 0, 20);
    ellip(b, 0, by + 0.1, 0.55, 0.55, 0.55, 0.6, hide, 0, 0, 0, 18); // shoulders / hump
    ellip(b, 0, by + 0.04, -0.62, 0.5, 0.5, 0.55, hide, 0, 0, 0, 18); // haunch
    ellip(b, 0, by - 0.24, 0.05, 0.44, 0.3, 0.75, belly, 0, 0, 0, 16);
    for (let i = 0; i < r.int(1, 3); i++) { const sd = r.chance(0.5) ? 1 : -1; ellip(b, sd * 0.42, by + r.range(-0.05, 0.25), r.range(-0.6, 0.5), 0.14, r.range(0.18, 0.3), r.range(0.2, 0.35), patch, 0, 0, sd * 0.3, 12); }
    // legs: upper + lower with a knee, hoof
    for (const [x, z, front] of [[-0.3, 0.68, 1], [0.3, 0.68, 1], [-0.3, -0.7, 0], [0.3, -0.7, 0]]) {
      if (lie) { // folded under the body
        rod(b, [x * 1.1, 0.42, z], [x * 1.25, 0.18, z + (front ? 0.45 : 0.35)], 0.1, dark);
        rod(b, [x * 1.25, 0.18, z + (front ? 0.45 : 0.35)], [x * 1.2, 0.12, z + (front ? 0.05 : -0.1)], 0.08, dark);
        continue;
      }
      const kz = z + (front ? 0.04 : -0.08), stride = (r.next() - 0.5) * 0.14;
      rod(b, [x, by - 0.2, z], [x * 1.02, 0.55, kz + stride], 0.12, hide);
      rod(b, [x * 1.02, 0.55, kz + stride], [x * 1.02, 0.1, z + stride], 0.075, dark);
      b.t('plain'); b.sm().cyl(x * 1.02, 0.05, z + stride, 0.085, 0.1, 0.1, 10, hoof).sm(false); b.t('hide');
    }
    // two heads on splayed necks; grazing lowers one (sometimes both)
    const down = pose === 'graze' ? (r.chance(0.3) ? [1, 1] : r.chance(0.5) ? [1, 0] : [0, 1]) : [0, 0];
    [-1, 1].forEach((s, k) => {
      const low = down[k], spread = 0.2 + r.range(0, 0.08);
      const n0 = [s * 0.18, by + 0.32, 0.95], hd = low ? [s * (spread + 0.25), 0.42 - drop * 0.3, 1.55] : [s * (spread + 0.2), by + 0.42 + r.range(-0.05, 0.08), 1.42];
      rod(b, n0, hd, 0.2, hide);
      const yaw = s * (0.25 + r.range(0, 0.15)), pitch = low ? 1.0 : 0.15;
      const fx = Math.sin(yaw) * Math.cos(pitch), fy = -Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
      const H = (t, up = 0) => [hd[0] + fx * t, hd[1] + fy * t + up, hd[2] + fz * t];
      ellip(b, ...H(0.12), 0.2, 0.22, 0.32, hide, pitch, yaw, 0, 16); // skull
      ellip(b, ...H(0.38, -0.03), 0.15, 0.15, 0.17, muzzle, pitch, yaw, 0, 12); // muzzle
      b.t('plain');
      for (const e of [-1, 1]) { // eyes, ears, horns
        const ex = Math.cos(yaw) * e * 0.17, ez = -Math.sin(yaw) * e * 0.17;
        ellip(b, H(0.18, 0.06)[0] + ex, H(0.18, 0.06)[1], H(0.18, 0.06)[2] + ez, 0.03, 0.03, 0.03, 0x161210, 0, 0, 0, 8);
        ellip(b, H(0.02, 0.12)[0] + ex * 1.35, H(0.02, 0.12)[1], H(0.02, 0.12)[2] + ez * 1.35, 0.13, 0.04, 0.07, dark, 0, yaw, e * 0.5, 10);
        const hb = [H(0.02, 0.18)[0] + ex * 0.8, H(0.02, 0.18)[1], H(0.02, 0.18)[2] + ez * 0.8];
        const hm = [hb[0] + ex * 1.1, hb[1] + 0.1, hb[2] + ez * 1.1 - 0.02], ht = [hm[0] + ex * 0.5, hm[1] + 0.22, hm[2] + 0.06];
        rod(b, hb, hm, 0.045, horn, 8); rod(b, hm, ht, 0.03, horn, 8);
      }
      b.t('hide');
    });
    // tail with a tuft
    const tz = -1.15, tl = [r.range(-0.15, 0.15), by - 0.55, tz - 0.12];
    rod(b, [0, by + 0.25, tz + 0.05], [0, by - 0.1, tz - 0.08], 0.035, dark, 8);
    rod(b, [0, by - 0.1, tz - 0.08], tl, 0.03, dark, 8);
    ellip(b, tl[0], tl[1] - 0.08, tl[2], 0.06, 0.12, 0.06, col(0x3a2e26), 0, 0, 0, 8);
  };

  // ---------------------------------------------------------------- 55-gallon drums
  const DRUM = [[0.28, 0], [0.29, 0.01], [0.29, 0.03], [0.285, 0.04], [0.285, 0.27], [0.298, 0.29], [0.285, 0.31], [0.285, 0.57], [0.298, 0.59], [0.285, 0.61], [0.285, 0.84], [0.29, 0.85], [0.29, 0.875], [0.27, 0.88], [0, 0.875]];
  P.barrel = (b, r, o) => {
    const n = o.count || 1;
    b.t('metal');
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, rr = n > 1 ? 0.33 + n * 0.04 : 0;
      const c = col(o.color || r.pick([0x4a6a7a, 0x8a3a2a, 0x5f6a4a, 0xb8a050, 0x3e4a52, METAL.rust]), 0.06, r);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, tip = o.tipped && i === 0;
      b.pushT(x, tip ? 0.29 : 0, z, a);
      if (tip) b.push(new (b.M.constructor)().makeRotationZ(Math.PI / 2).premultiply(new (b.M.constructor)().makeTranslation(0.44, 0, 0)));
      lathe(b, DRUM, c, 0, 0, 0, 28, 'drum');
      // wear: rust bands at the rolling hoops and the chime, a few streaks
      const rust = c.clone().lerp(col(METAL.rust), 0.7).offsetHSL(0, -0.1, -0.06);
      ring(b, 0, 0.3, 0, 0.297, 0.012, rust); ring(b, 0, 0.6, 0, 0.297, 0.012, rust); ring(b, 0, 0.86, 0, 0.288, 0.01, rust);
      for (let k = 0; k < r.int(1, 4); k++) { const sa = r.range(0, 6.28), top = r.range(0.4, 0.85), L = r.range(0.15, 0.4); b.box(Math.cos(sa) * 0.288, top - L / 2, Math.sin(sa) * 0.288, r.range(0.03, 0.08), L, 0.006, rust, -sa + Math.PI / 2); }
      // bungs on the lid
      b.sm().cyl(0.15, 0.885, 0.05, 0.035, 0.035, 0.02, 10, col(METAL.dark)).cyl(-0.12, 0.885, -0.08, 0.025, 0.025, 0.02, 10, col(METAL.dark)).sm(false);
      if (tip) b.pop();
      b.pop();
    }
  };

  // ---------------------------------------------------------------- cistern: ferro-cement water tank
  P.cistern = (b, r, o) => {
    const R = o.radius || 2.2, h = o.height || 1.8, c = col(o.color || 0xb3ada0, 0.04, r), stain = c.clone().offsetHSL(0, -0.03, -0.12);
    b.t('concrete');
    lathe(b, [[R + 0.12, -0.3], [R + 0.1, 0], [R, 0.1], [R - 0.03, h - 0.12], [R + 0.06, h - 0.1], [R + 0.06, h], [R - 0.1, h + 0.02], [R * 0.7, h + 0.22], [R * 0.3, h + 0.32], [0, h + 0.34]], c, 0, 0, 0, 36);
    // water stains running down from the lip, damp band at the foot
    for (let k = 0; k < r.int(5, 10); k++) { const a = r.range(0, 6.28), L = r.range(0.3, h * 0.8); b.box(Math.cos(a) * (R - 0.005), h - 0.12 - L / 2, Math.sin(a) * (R - 0.005), r.range(0.12, 0.4), L, 0.01, stain, -a + Math.PI / 2); }
    lathe(b, [[R + 0.13, -0.02], [R + 0.11, 0.25], [R, 0.27]], stain.clone().offsetHSL(0, 0, -0.03), 0, 0, 0, 36);
    // hatch, vent, outlet with a tap, a ladder
    b.t('metal');
    b.sm().cyl(R * 0.35, h + 0.3, 0, 0.32, 0.32, 0.06, 18, col(METAL.rust, 0.05, r)).sm(false);
    b.box(R * 0.35 + 0.2, h + 0.35, 0, 0.12, 0.04, 0.08, col(METAL.dark));
    rod(b, [-R * 0.3, h + 0.28, 0.2], [-R * 0.3, h + 0.7, 0.2], 0.04, col(METAL.steel)); rod(b, [-R * 0.3, h + 0.7, 0.2], [-R * 0.3 + 0.15, h + 0.62, 0.2], 0.04, col(METAL.steel));
    rod(b, [0, 0.25, R - 0.02], [0, 0.25, R + 0.3], 0.04, col(METAL.steel)); rod(b, [0, 0.25, R + 0.3], [0, 0.12, R + 0.4], 0.035, col(METAL.steel));
    ring(b, 0, 0.36, R + 0.3, 0.06, 0.01, col(METAL.paint_red));
    const lx = R * 0.7, lz = -R * 0.72, ln = Math.hypot(lx, lz), ox = -lz / ln * 0.22, oz = lx / ln * 0.22, px = lx / ln * 0.15, pz = lz / ln * 0.15;
    for (const sg of [-1, 1]) rod(b, [lx + px + ox * sg, 0, lz + pz + oz * sg], [lx + px * 0.2 + ox * sg, h + 0.25, lz + pz * 0.2 + oz * sg], 0.02, col(METAL.dark), 6);
    for (let y = 0.3; y < h; y += 0.3) rod(b, [lx + px * (1 - y / h * 0.8) - ox, y, lz + pz * (1 - y / h * 0.8) - oz], [lx + px * (1 - y / h * 0.8) + ox, y, lz + pz * (1 - y / h * 0.8) + oz], 0.014, col(METAL.dark), 5);
  };

  // ---------------------------------------------------------------- well: stone ring, windlass, bucket, roof
  P.well = (b, r, o) => {
    const R = o.radius || 1.0, stone = col(o.color || 0xa89c88, 0.04, r), cap = stone.clone().offsetHSL(0, -0.03, 0.06);
    b.t('stone');
    lathe(b, [[R * 0.78, 0.2], [R * 0.78, 0.86], [R * 0.84, 0.9], [R + 0.06, 0.9], [R + 0.06, 0.82], [R, 0.78], [R + 0.02, 0.1], [R + 0.08, 0], [R + 0.08, -0.1]], stone, 0, 0, 0, 32);
    lathe(b, [[R * 0.76, 0.98], [R + 0.1, 0.98], [R + 0.12, 0.92], [R + 0.1, 0.86], [R * 0.76, 0.86]], cap, 0, 0, 0, 32); // mortared cap course
    for (let k = 0; k < 7; k++) { const a = r.range(0, 6.28), y = r.range(0.2, 0.75); rock(b, r, Math.cos(a) * (R + 0.02), y, Math.sin(a) * (R + 0.02), 0.16, 0.08, 0.1, stone.clone().offsetHSL(0, 0, r.range(-0.08, 0.04)), -a, 1); }
    b.t('plain').sm().cyl(0, 0.25, 0, R * 0.77, R * 0.77, 0.04, 24, 0x141c1e).sm(false);
    b.ch('water'); b.sm().cyl(0, 0.32, 0, R * 0.76, R * 0.76, 0.02, 24, MISC.water).sm(false); b.ch('main');
    if (o.pump) { // casing repaired with a pre-war hand pump
      b.t('metal');
      b.sm().cyl(0.3, 1.25, 0, 0.09, 0.11, 0.7, 12, col(METAL.dark)).sm(false);
      rod(b, [0.3, 1.5, 0], [0.3, 1.5, 0.3], 0.05, col(METAL.dark)); rod(b, [0.3, 1.62, -0.05], [0.3, 1.95, -0.7], 0.025, col(METAL.steel));
    }
    // frame: two squared posts, windlass with crank, rope and bucket
    const w = col(WOOD.weathered, 0.05, r);
    b.t('wood');
    for (const s of [-1, 1]) { b.box(s * (R + 0.05), 1.2, 0, 0.16, 2.4, 0.16, w); b.box(s * (R + 0.05), 0.1, 0, 0.3, 0.2, 0.3, w.clone().offsetHSL(0, 0, -0.05)); }
    b.sm().cyl(0, 1.75, 0, 0.11, 0.11, 2 * R + 0.2, 16, col(WOOD.dark, 0.05, r), 0, 0, Math.PI / 2).sm(false);
    ring(b, -0.1, 1.75, 0, 0.115, 0.022, col(0x8a7a58), Math.PI * 2, 0, 16);
    b.t('metal'); rod(b, [R + 0.15, 1.75, 0], [R + 0.25, 1.75, 0], 0.025, col(METAL.dark)); rod(b, [R + 0.25, 1.75, 0], [R + 0.25, 1.5, 0.18], 0.02, col(METAL.dark)); rod(b, [R + 0.25, 1.5, 0.18], [R + 0.4, 1.5, 0.18], 0.025, col(WOOD.dark));
    b.t('plain'); rod(b, [0, 1.65, 0], [0, 1.15, 0], 0.012, col(0x8a7a58), 5);
    b.t('wood'); lathe(b, [[0.12, 0], [0.16, 0.3], [0.165, 0.32], [0.15, 0.32]], col(WOOD.fresh, 0.05, r), 0, 0.85, 0, 14, 'bucket');
    ring(b, 0, 0.9, 0, 0.13, 0.01, col(METAL.dark)); ring(b, 0, 1.1, 0, 0.155, 0.01, col(METAL.dark));
    if (o.roof !== false) {
      const rc = col(o.roofColor || r.pick(ROOF.thatch), 0.05, r), thatch = !o.roofColor && r.chance(0.6);
      b.t(thatch ? 'thatch' : 'shingle');
      for (const sg of [1, -1]) b.plank([0, 3.0, 0], [0, 2.38, sg * 1.35], 2 * R + 0.8, thatch ? 0.14 : 0.07, thatch ? rc : col(ROOF.shingle, 0.05, r));
      b.t('wood'); b.box(0, 3.02, 0, 2 * R + 0.8, 0.12, 0.12, w);
      for (const s of [-1, 1]) b.box(s * (R + 0.05), 2.65, 0, 0.12, 0.7, 0.12, w);
    }
    if (o.repair) b.t('concrete').box(R + 0.02, 0.45, 0, 0.1, 0.8, 0.8, col(0xc9c2b2, 0.03, r));
  };

  // ---------------------------------------------------------------- hay: stacked square bales
  P.haystack = (b, r, o) => {
    const straw = col(0xc8ac68, 0.05, r), twine = col(0x8a6a40), bl = 0.95, bw = 0.48, bh = 0.4;
    const rows = o.rows || r.int(2, 3), base = rows + r.int(0, 1);
    b.t('thatch');
    for (let y = 0; y < rows; y++) {
      const n = Math.max(1, base - y), off = (y % 2) * 0.1;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        if (y === rows - 1 && r.chance(0.25)) continue;
        const x = (i - (n - 1) / 2) * (bl + 0.03) + off + r.range(-0.03, 0.03), z = (j - 0.5) * (bw + 0.02) + r.range(-0.03, 0.03), yy = bh / 2 + y * bh, ry = r.range(-0.05, 0.05);
        const c = straw.clone().offsetHSL(0, r.range(-0.04, 0.02), r.range(-0.06, 0.04) - y * 0.01);
        b.box(x, yy, z, bl, bh, bw, c, ry);
        for (const t of [-0.25, 0.25]) b.box(x + t * Math.cos(ry), yy, z - t * Math.sin(ry), 0.02, bh + 0.01, bw + 0.01, twine, ry);
      }
    }
    for (let k = 0; k < 4; k++) ellip(b, r.range(-1, 1), 0.04, r.range(-0.9, 0.9), r.range(0.3, 0.6), 0.05, r.range(0.25, 0.5), straw.clone().offsetHSL(0, 0, -0.05), 0, r.range(0, 3), 0, 10); // loose straw
  };

  // ---------------------------------------------------------------- firewood: split logs between end stakes, chopping block
  const log = (b, r, a, c, rad, bark, end) => {
    b.t('bark'); tube(b, [a, c], [rad, rad * 0.95], bark, { cap: false, seg: 9 });
    const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], L = Math.hypot(...d) || 1, u = d.map((v) => v / L);
    b.t('wood');
    for (const [p, s] of [[a, -1], [c, 1]]) tube(b, [[p[0] - u[0] * 0.01 * s, p[1] - u[1] * 0.01 * s, p[2] - u[2] * 0.01 * s], [p[0] + u[0] * 0.012 * s, p[1] + u[1] * 0.012 * s, p[2] + u[2] * 0.012 * s]], [rad * 0.9, rad * 0.9], end, { cap: false, seg: 9 });
  };
  P.woodpile = (b, r, o) => {
    const L = o.length || 1.6, rows = o.rows || r.int(3, 5), barkC = col(WOOD.dark, 0.06, r), endC = col(0xc4a476, 0.06, r);
    for (let y = 0; y < rows; y++) {
      const n = Math.floor(L / 0.17) - (y % 2);
      for (let i = 0; i < n; i++) {
        if (y === rows - 1 && r.chance(0.3)) continue;
        const x = -L / 2 + 0.1 + i * 0.17 + (y % 2) * 0.085, yy = 0.09 + y * 0.15, len = r.range(0.5, 0.62), jz = r.range(-0.05, 0.05);
        log(b, r, [x + r.range(-0.02, 0.02), yy, -len / 2 + jz], [x + r.range(-0.02, 0.02), yy + r.range(-0.02, 0.02), len / 2 + jz], r.range(0.06, 0.085), barkC.clone().offsetHSL(0, 0, r.range(-0.04, 0.04)), endC.clone().offsetHSL(0, 0, r.range(-0.06, 0.03)));
      }
    }
    b.t('wood');
    for (const s of [-1, 1]) rod(b, [s * (L / 2 + 0.06), 0, 0], [s * (L / 2 + 0.08), rows * 0.15 + 0.15, 0], 0.035, col(WOOD.pole), 6);
    if (o.block !== false) { // chopping block with an axe
      const bx = L / 2 + 0.7;
      log(b, r, [bx, 0, 0.3], [bx, 0.45, 0.3], 0.22, barkC, endC);
      b.t('wood'); rod(b, [bx - 0.05, 0.47, 0.3], [bx - 0.5, 0.75, 0.42], 0.02, col(WOOD.fresh), 6);
      b.t('metal').box(bx - 0.02, 0.47, 0.3, 0.06, 0.12, 0.14, col(METAL.steel), 0.3);
    }
  };

  // ---------------------------------------------------------------- fire pit: stone ring, ash bed, charred logs, fire
  P.firepit = (b, r, o) => {
    const sc = col(0x8e8474, 0.06, r);
    b.t('stone');
    const n = 11;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r.range(-0.08, 0.08); rock(b, r, Math.cos(a) * 0.68, 0.08, Math.sin(a) * 0.68, r.range(0.16, 0.22), r.range(0.11, 0.16), r.range(0.13, 0.18), sc.clone().offsetHSL(0, 0, r.range(-0.07, 0.03)), -a, 1); }
    b.t('dirt'); lathe(b, [[0.58, 0], [0.55, 0.03], [0.3, 0.05], [0, 0.06]], col(0x3c3834), 0, 0, 0, 20, 'ash');
    b.t('wood');
    const char = col(0x2a2420), bark = col(WOOD.dark, 0.05, r);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + r.range(-0.3, 0.3); tube(b, [[Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45], [Math.cos(a) * 0.06, 0.34, Math.sin(a) * 0.06]], [0.05, 0.035], k % 2 ? char : bark, { cap: true, seg: 8 }); }
    b.t('plain'); for (let k = 0; k < 6; k++) ellip(b, r.range(-0.25, 0.25), 0.06, r.range(-0.25, 0.25), 0.05, 0.03, 0.04, 0x1e1a18, 0, r.range(0, 3), 0, 6);
    if (o.lit === false) return {};
    b.ch('lamp').w(o._r ?? 9).t('plain');
    b.sm().cone(0, 0.3, 0, 0.18, 0.42, 10, 0xff9a40).cone(0.06, 0.24, 0.04, 0.1, 0.28, 8, 0xffc060).sm(false);
    for (let k = 0; k < 5; k++) ellip(b, r.range(-0.2, 0.2), 0.08, r.range(-0.2, 0.2), 0.05, 0.025, 0.04, 0xff6a20, 0, 0, 0, 6);
    b.w(-1).ch('main');
    return { lights: [{ at: [0, 0.6, 0], color: LIGHT_COL.fire, radius: 7, intensity: 1.5, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, 0.25, 0] }, { type: 'smoke', p: [0, 0.6, 0], always: true }] };
  };

  // ---------------------------------------------------------------- rocks: weathered boulders, half buried, with scree
  P.rocks = (b, r, o) => {
    const n = o.count || 4, s = o.size || 1, base = col(o.color || r.pick([0x9a8b78, 0xa08a70, 0x8e8070, 0xa39684]), 0.04, r);
    b.t('rock');
    for (let i = 0; i < n; i++) {
      const k = r.range(0.35, 1) * s, a = r.range(0, 6.28), d = i ? r.range(0.5, 1.5) * s : 0;
      rock(b, r, Math.cos(a) * d, k * 0.18, Math.sin(a) * d, k * r.range(0.6, 0.9), k * r.range(0.45, 0.7), k * r.range(0.5, 0.8), base.clone().offsetHSL(0, 0, r.range(-0.05, 0.04)), r.range(0, 6), 2);
    }
    for (let i = 0; i < n * 2; i++) { const a = r.range(0, 6.28), d = r.range(0.6, 2) * s, k = r.range(0.06, 0.16); rock(b, r, Math.cos(a) * d, k * 0.2, Math.sin(a) * d, k, k * 0.6, k * 0.8, base.clone().offsetHSL(0, 0, r.range(-0.08, 0.02)), r.range(0, 6), 1); }
  };

  Object.assign(DEF_LAYER, { brahmin: 'hide', barrel: 'metal', cistern: 'concrete', well: 'stone', haystack: 'thatch', woodpile: 'bark', firepit: 'stone', rocks: 'rock' });
}

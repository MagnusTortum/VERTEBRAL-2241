// Power lines, drawn like walls (wall type 'powerline'): wooden poles set out along the line (one at
// every corner and end, the rest evenly at ~`spacing` m), crossarms square to the line (bisecting at
// corners), insulators, guy wires at corners and ends, sagging cables pole to pole. Worse condition:
// leaning poles, a missing arm, cables down.
import { Builder, col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL } from './palette.js';
import { tube, rod } from './shapes.js';

export function polePositions(path, spacing = 32) {
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / spacing));
    for (let k = 0; k < n; k++) out.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, corner: k === 0, seg: i });
  }
  const l = path[path.length - 1]; out.push({ x: l[0], z: l[1], corner: true, seg: path.length - 2 });
  return out;
}

export function buildPowerline(f, terrain, seed) {
  const b = new Builder(), rng = new RNG(`${seed}:power:${f.id || JSON.stringify(f.path[0])}`);
  const cond = f.condition ?? 0.7, H = f.height || 8.5, spacing = f.spacing || 32;
  const path = f.closed ? [...f.path, f.path[0]] : f.path;
  const poles = polePositions(path, spacing);
  const pc = col(WOOD.pole, 0.05, rng).offsetHSL(0, 0, -0.06), arm = col(WOOD.weathered, 0.05, rng), ins = col(0xc8d0c8), wire = col(0x24221f), dark = col(METAL.dark);
  const tops = [];
  poles.forEach((p, i) => {
    // line direction here (bisector at corners)
    const a = poles[Math.max(0, i - 1)], c = poles[Math.min(poles.length - 1, i + 1)];
    let dx = c.x - a.x, dz = c.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx; // across the line: the crossarm
    const y0 = terrain.height(p.x, p.z), h = H * rng.range(0.95, 1.05);
    const lean = (1 - cond) * rng.range(-0.12, 0.12), lx = p.x + nx * Math.sin(lean) * h, lz = p.z + nz * Math.sin(lean) * h;
    const top = [lx, y0 + h, lz];
    b.t('bark');
    tube(b, [[p.x, y0 - 0.3, p.z], [(p.x + lx) / 2, y0 + h / 2, (p.z + lz) / 2], top], [0.15, 0.13, 0.11], pc, { seg: 10 });
    const armY = y0 + h - 0.45, ax = (p.x + (lx - p.x) * ((h - 0.45) / h)), az = (p.z + (lz - p.z) * ((h - 0.45) / h));
    const broken = cond < 0.35 && rng.chance(0.25);
    const hw = 1.05, pins = [-0.9, -0.3, 0.9];
    if (!broken) {
      b.t('wood');
      b.box(ax, armY, az, 0.1, 0.12, hw * 2, arm, Math.atan2(nx, nz));
      for (const sg of [-1, 1]) rod(b, [ax + nx * sg * 0.6, armY - 0.06, az + nz * sg * 0.6], [ax, armY - 0.65, az], 0.025, dark, 5); // braces
      b.t('plain');
      for (const u of pins) b.sm().cyl(ax + nx * u, armY + 0.14, az + nz * u, 0.045, 0.06, 0.18, 10, ins).sm(false);
    } // else: arm gone, its cables hang down
    tops.push(broken ? null : pins.map((u) => [ax + nx * u, armY + 0.22, az + nz * u]));
    if (rng.chance(0.12 + (p.corner ? 0.1 : 0))) { // pole-top transformer can
      b.t('metal').sm().cyl(ax - dx * 0.35, armY - 1.1, az - dz * 0.35, 0.28, 0.28, 0.8, 16, col(0x8a8f8c, 0.04, rng)).sm(false);
    }
    if (p.corner || i === 0 || i === poles.length - 1) { // guy wire to a ground anchor, away from the pull
      const gx = i === 0 ? -dx : i === poles.length - 1 ? dx : -(nx * Math.sign((c.x - p.x) * nx + (c.z - p.z) * nz) || 1);
      const gz = i === 0 ? -dz : i === poles.length - 1 ? dz : -(nz * Math.sign((c.x - p.x) * nx + (c.z - p.z) * nz) || 1);
      const ex = p.x + gx * 4.5, ez = p.z + gz * 4.5;
      b.t('plain'); rod(b, [ax, armY - 0.3, az], [ex, terrain.height(ex, ez) + 0.05, ez], 0.012, dark, 4);
      b.t('concrete').box(ex, terrain.height(ex, ez), ez, 0.3, 0.12, 0.3, col(0x9a948a));
    }
  });
  // cables: catenary-ish sag between neighbouring insulators; some down in poor condition
  b.t('plain');
  for (let i = 0; i < tops.length - 1; i++) {
    const A = tops[i], B = tops[i + 1];
    for (let k = 0; k < 3; k++) {
      const pa = A ? A[k] : null, pb = B ? B[k] : null;
      if (!pa && !pb) continue;
      const down = cond < 0.5 && rng.chance((0.5 - cond) * 0.6);
      if (!pa || !pb || down) { // hanging to the ground from the pole that still holds it
        const from = pa || pb, to = pa ? pb || from : from, gx = (from[0] + (to ? to[0] : from[0])) / 2 + rng.range(-2, 2), gz = (from[2] + (to ? to[2] : from[2])) / 2 + rng.range(-2, 2);
        const g = [gx, terrain.height(gx, gz) + 0.03, gz], mid = [(from[0] + g[0]) / 2, (from[1] + g[1]) / 2 - 0.8, (from[2] + g[2]) / 2];
        rod(b, from, mid, 0.012, wire, 4); rod(b, mid, g, 0.012, wire, 4);
        continue;
      }
      const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), sag = L * (0.025 + (1 - cond) * 0.02), n = Math.max(6, Math.round(L / 4));
      const P = (t) => [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - sag * 4 * t * (1 - t), pa[2] + (pb[2] - pa[2]) * t];
      for (let s = 0; s < n; s++) b.beam(P(s / n), P((s + 1) / n), 0.014, 4, wire);
    }
  }
  return b.build();
}

// Acequia (wall type 'acequia'): an irrigation ditch drawn like a wall — earth or stone-lined banks, a
// strip of water following the ground, and now and then a board sluice gate.
export function buildAcequia(f, terrain, seed) {
  const b = new Builder(), rng = new RNG(`${seed}:acequia:${f.id || JSON.stringify(f.path[0])}`);
  const stone = (f.lining ?? (rng.chance(0.5) ? 'stone' : 'earth')) === 'stone', hw = (f.width || 1.0) / 2;
  const bank = stone ? col(0xa89c88, 0.05, rng) : col(0x8a7058, 0.05, rng), water = col(0x3a5a5a);
  const path = f.closed ? [...f.path, f.path[0]] : f.path;
  let dist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.2));
    const tx = (bx - ax) / (L || 1), tz = (bz - az) / (L || 1), nx = -tz, nz = tx, ry = Math.atan2(tx, tz);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = terrain.height(x0, z0), y1 = terrain.height(x1, z1), sl = L / n;
      for (const sd of [-1, 1]) b.t(stone ? 'drystone' : 'dirt').plank([x0 + nx * sd * (hw + 0.18), y0 + 0.1, z0 + nz * sd * (hw + 0.18)], [x1 + nx * sd * (hw + 0.18), y1 + 0.1, z1 + nz * sd * (hw + 0.18)], 0.38, 0.28, bank.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.04));
      if (f._wet !== false) b.ch('water').t('plain').plank([x0, y0 + 0.06, z0], [x1, y1 + 0.06, z1], hw * 2, 0.02, water).ch('main');
      else b.t('dirt').plank([x0, y0 + 0.03, z0], [x1, y1 + 0.03, z1], hw * 2, 0.02, col(0x9a8466, 0.04, rng)); // dry ditch: cracked mud
      dist += sl;
      if (!f._gates && dist > 14 && rng.chance(0.3)) { dist = 0; b.t('wood').box((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, (z0 + z1) / 2, hw * 2 + 0.7, 0.5, 0.06, col(WOOD.weathered, 0.05, rng), ry + Math.PI / 2); }
    }
  }
  // sluice gates (compuertas) where the wet ditch passes an irrigated field: a board in a frame
  for (const [gx, gz] of f._gates || []) {
    let best = { ry: 0 }, bd = Infinity;
    for (let i = 0; i < path.length - 1; i++) { const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az) || 1, t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gz - az) * (bz - az)) / (L * L))), d = Math.hypot(ax + (bx - ax) * t - gx, az + (bz - az) * t - gz); if (d < bd) { bd = d; best = { ry: Math.atan2((bx - ax) / L, (bz - az) / L) }; } }
    const y = terrain.height(gx, gz);
    b.t('wood').box(gx, y + 0.3, gz, hw * 2 + 0.7, 0.5, 0.06, col(WOOD.weathered, 0.05, rng), best.ry + Math.PI / 2);
    b.t(stone ? 'drystone' : 'concrete').box(gx, y + 0.12, gz, hw * 2 + 1.0, 0.3, 0.22, stone ? bank : col(0xa8a49a, 0.04, rng), best.ry + Math.PI / 2);
  }
  return b.build();
}

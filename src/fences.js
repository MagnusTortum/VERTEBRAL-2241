// Walls and fences along polylines, conforming to terrain. Gates are gaps (with posts).
import { buildStream } from './water.js';
import { Builder, col } from './builder.js';
import { RNG, makeNoise } from './rng.js';
import { MAT, WOOD, METAL, ROOF, LADRILLO } from './palette.js';
// salvaged sheet: mostly dull galvanised grey and dark weathered rust, now and then an old panel of faded paint —
// grimy and low-saturation (Fallout), never bright orange
const SCRAP_W = { 0x7c7a74: 3, 0x8a8780: 2.5, 0x6f6c66: 2, 0x6a5a4c: 2.5, 0x5e4c40: 2, 0x76624e: 1.8, 0x7a6a5a: 1.5, 0x5f6862: 0.6, 0x6e5650: 0.5, 0x6a6e5c: 0.4, 0x847a68: 0.8 };
import { buildPowerline , buildAcequia } from './power.js';

function walk(path, closed) {
  const pts0 = closed ? [...path, path[0]] : path;
  const pts = pts0.filter((p, i) => i === 0 || Math.hypot(p[0] - pts0[i - 1][0], p[1] - pts0[i - 1][1]) > 0.05);
  const segs = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, L, s0: s, dx: (bx - ax) / L, dz: (bz - az) / L });
    s += L;
  }
  return { segs, total: s };
}

export function fenceLength(f) { return walk(f.path, f.closed).total; }

export function buildFence(f, terrain, seed) {
  if (f.type === 'powerline') return buildPowerline(f, terrain, seed);
  if (f.type === 'acequia') return buildAcequia(f, terrain, seed);
  if (f.type === 'stream') return buildStream(f, terrain, seed);
  const rng = new RNG(`${seed}:fence:${f.id || JSON.stringify(f.path[0])}`);
  const noise = makeNoise(`${seed}:fencen`);
  const b = new Builder();
  const { segs, total } = walk(f.path, f.closed);
  const gates = (f.gates || []).map((g) => {
    const s = g.s ?? (g.at ?? 0) * total;
    const w = g.width || 3;
    return [s - w / 2, s + w / 2, g];
  });
  const inGate = (s) => gates.some(([a, z]) => s > a && s < z);
  const type = f.type === 'picket' ? 'wood' : f.type || 'pole'; // old maps: picket fences become wooden walls
  const H = f.height;
  const cond = f.condition ?? 0.8;
  const hAt = (x, z) => terrain.height(x, z);
  const yaw = (sg) => Math.atan2(-sg.dz, sg.dx);

  const pieces = (len, fn) => {
    for (const sg of segs) {
      const n = Math.max(1, Math.round(sg.L / len));
      const pl = sg.L / n;
      for (let i = 0; i < n; i++) {
        const sA = sg.s0 + i * pl, sB = sA + pl;
        // clip the piece to the gate openings, so the run reaches right up to the gate posts (no gap, no overlap)
        let parts = [[sA, sB]];
        for (const [ga, gz] of gates) parts = parts.flatMap(([u, v]) => (gz <= u || ga >= v ? [[u, v]] : [[u, Math.max(u, ga)], [Math.min(v, gz), v]]));
        for (const [u, v] of parts) {
          if (v - u < 0.08) continue;
          const t = (u + v) / 2 - sg.s0, x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t;
          fn(x, z, v - u, sg, (u + v) / 2);
        }
      }
    }
  };
  const posts = (every, fn) => {
    for (const sg of segs) {
      const n = Math.max(1, Math.round(sg.L / every));
      for (let i = 0; i <= n; i++) {
        if (i === n && sg !== segs[segs.length - 1] && !f.closed) continue;
        const t = (i * sg.L) / n, s = sg.s0 + t;
        if (inGate(s) || gates.some(([a, z]) => Math.abs(s - a) < 1.0 || Math.abs(s - z) < 1.0)) continue; // the gate has its own posts
        fn(sg.ax + sg.dx * t, sg.az + sg.dz * t, sg, s);
      }
    }
  };

  // post-and-span fences: the gate posts join the run so the span reaches them (posts within 1 m of a gate are skipped)
  const withGates = (P) => { for (const [ga, gz] of gates) for (const gs of [ga, gz]) { const sg = segs.find((q) => gs >= q.s0 && gs <= q.s0 + q.L) || segs[segs.length - 1], t = gs - sg.s0, x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t; P.push([x, hAt(x, z), z, gs, 0]); } P.sort((p, q) => p[3] - q[3]); return P; };
  // continuous runs between gates (one per segment), extended at the corners so the runs meet
  const runsOf = (pad = 0) => {
    const out = [];
    for (const sg of segs) {
      let cuts = [[sg.s0, sg.s0 + sg.L]];
      for (const [a, z] of gates) cuts = cuts.flatMap(([u, v]) => (z <= u || a >= v ? [[u, v]] : [[u, Math.max(u, a)], [Math.min(v, z), v]].filter(([p2, q]) => q - p2 > 0.05)));
      for (const [u, v] of cuts) {
        const atGate = (x) => gates.some(([a, z]) => Math.abs(x - a) < 0.01 || Math.abs(x - z) < 0.01);
        out.push({ sg, u: u - (atGate(u) ? 0 : pad), v: v + (atGate(v) ? 0 : pad) });
      }
    }
    return out;
  };
  const quadOut = (a, b2, c2, d, o, color) => {
    const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * o[0] + ny * o[1] + nz * o[2] < 0) b.quad(d, c2, b2, a, color); else b.quad(a, b2, c2, d, color);
  };
  // a wall body following the ground: bottom y0 / top y1 above the local ground (functions of s allowed)
  const ribbon = (run, y0, y1, th, color, step = 1.0, ends = true) => {
    const { sg, u, v } = run, n = Math.max(1, Math.ceil((v - u) / step)), px = -sg.dz, pz = sg.dx;
    const Y = (q, s2) => (typeof q === 'function' ? q(s2) : q);
    const P = (s2, side, top) => { const t = s2 - sg.s0, cx = sg.ax + sg.dx * t, cz = sg.az + sg.dz * t, g = hAt(cx, cz); return [cx + px * side * th / 2, g + (top ? Y(y1, s2) : Y(y0, s2)), cz + pz * side * th / 2]; };
    for (let i = 0; i < n; i++) {
      const s0 = u + ((v - u) * i) / n, s1 = u + ((v - u) * (i + 1)) / n;
      for (const sd of [-1, 1]) quadOut(P(s0, sd, 0), P(s1, sd, 0), P(s1, sd, 1), P(s0, sd, 1), [px * sd, 0, pz * sd], color);
      quadOut(P(s0, -1, 1), P(s1, -1, 1), P(s1, 1, 1), P(s0, 1, 1), [0, 1, 0], color);
    }
    if (ends) for (const [s2, dir] of [[u, -1], [v, 1]]) quadOut(P(s2, -1, 0), P(s2, 1, 0), P(s2, 1, 1), P(s2, -1, 1), [sg.dx * dir, 0, sg.dz * dir], color);
  };
  // worn wall tops: 1 = whole; dips are smooth (smoothstep over the noise) with a little crumble on them
  const erodedTop = (h0, depth) => (s2) => {
    const n = noise.noise2(s2 / 7, 5) * 0.5 + 0.5, t = (1 - cond) * 0.9;
    if (n >= t) return h0;
    const k = Math.min(1, (t - n) / 0.12), d = k * k * (3 - 2 * k);
    return h0 * (1 - depth * d) + (noise.noise2(s2 / 0.9, 11) * 0.06 - 0.03) * d;
  };
  const intactRuns = (run, top, h0) => { // the parts of a run whose top is whole
    const out = []; let a = null;
    for (let s2 = run.u; s2 <= run.v + 1e-6; s2 += 0.25) { const ok = top(Math.min(s2, run.v)) >= h0 - 1e-3; if (ok && a == null) a = s2; if ((!ok || s2 + 0.25 > run.v) && a != null) { const e = ok ? run.v : s2 - 0.25; if (e - a > 0.3) out.push({ sg: run.sg, u: a, v: e }); a = null; } }
    return out;
  };
  // broken glass set in the top of a masonry wall (wealthy yards): a crust of green and brown shards along the cap
  const glassTop = (top, th) => {
    b.t('plain');
    for (const run of runsOf(0)) for (let s2 = run.u + 0.1; s2 < run.v - 0.05; s2 += 0.11) {
      const t = s2 - run.sg.s0, x = run.sg.ax + run.sg.dx * t, z = run.sg.az + run.sg.dz * t, y = hAt(x, z) + top(s2) + 0.06;
      if (rng.chance(cond < 0.6 ? 0.4 : 0.12)) continue;
      const off = rng.range(-th / 3, th / 3), px = -run.sg.dz * off, pz = run.sg.dx * off;
      b.box(x + px, y + 0.05, z + pz, rng.range(0.04, 0.09), rng.range(0.06, 0.13), 0.012, col(rng.pick([0x3a6a3a, 0x5a3a1e, 0x2a5a4a, 0x8a9a8a]), 0.05, rng), rng.next() * 3, rng.range(-0.3, 0.3), rng.range(-0.4, 0.4));
    }
  };
  let pierFn = null, gatePierFn = null, wallCol = null, wallCap = null, wallLay = null; // the wall's own colours / layer, so its gate posts match
  // barbed wire on angle arms leaning out (f.barbed: true = out to the +normal side / 'in' / 'both' = a V); tops = [x, y, z, s] along the run
  const barbedTop = (tops, gapMax) => {
    const side = f.barbed === 'in' ? -1 : 1, vee = f.barbed === 'both', bc = col(cond < 0.6 ? 0x5a4a3e : 0x6a6c6c, 0.05, rng);
    const arm = (q, sg2, sd) => { const nx = -sg2.dz * sd, nz = sg2.dx * sd; return (k) => [q[0] + nx * 0.12 * k, q[1] + 0.12 * k, q[2] + nz * 0.12 * k]; };
    const segOf = (s2) => segs.find((q) => s2 >= q.s0 - 1e-6 && s2 <= q.s0 + q.L + 1e-6) || segs[segs.length - 1];
    b.t('metal');
    const sides = vee ? [1, -1] : [side];
    for (const sd of sides) {
      const arms = tops.map((q) => arm(q, segOf(q[3]), sd));
      for (const A of arms) b.beam(A(0), A(3.3), 0.012, 3, bc);
      for (let i = 0; i < tops.length - 1; i++) {
        if (tops[i + 1][3] - tops[i][3] > gapMax) continue;
        for (const k of [1.1, 2.2, 3.3]) { if (cond < 0.45 && rng.chance(0.3)) continue; b.beam(arms[i](k), arms[i + 1](k), 0.006, 3, bc); }
      }
    }
  };
 // a wall's own pier style, reused for its gate posts (a livery may stripe the gate posts)
  b.t({ stone_low: 'drystone', stone: 'stone', stone_ruin: 'drystone', brick: 'brick', wood_old: 'fence_wood', adobe: 'adobe', block: 'block', concrete: 'concrete', pole: 'bark', rail: 'fence_wood', wire: 'wood', chainlink: 'metal', ocotillo: 'bark', picket: 'fence_wood', wood: 'fence_wood', compound: 'plaster', scrap: 'corrugated' }[type] || 'wood');
  switch (type) {
    case 'stone': case 'stone_low': { // proper stone walls: mortared rubble with a flat coping / a dry-stone field wall with cap stones
      const low = type === 'stone_low', h0 = H ?? (low ? 1.1 : 1.8), th = low ? 0.55 : 0.45;
      const wc = col((f.paint ?? f.color) || rng.pick(MAT.stone.wall), 0.03, rng), cap = wc.clone().offsetHSL(0, -0.02, low ? -0.04 : 0.06);
      if (low) { wallCol = wc; wallCap = cap; wallLay = 'drystone'; }
      b.t(low ? 'drystone' : 'stone');
      for (const run of runsOf(th / 2)) {
        ribbon(run, -0.4, low ? h0 - 0.08 : h0, th, wc);
        if (!low) { b.t('concrete'); ribbon(run, h0, h0 + 0.09, th + 0.1, cap); b.t('stone'); }
        else { // cap stones laid on edge along the top
          const { sg, u, v } = run; b.t('drystone');
          for (let t = u + 0.22; t < v - 0.15; t += rng.range(0.32, 0.46)) { const tt = t - sg.s0, x = sg.ax + sg.dx * tt, z = sg.az + sg.dz * tt; b.box(x, hAt(x, z) + h0 - 0.02, z, rng.range(0.26, 0.4), rng.range(0.16, 0.24), th - 0.04, cap.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06), yaw(run.sg) + rng.range(-0.12, 0.12)); }
        }
      }
      if (!low) { pierFn = (x, z) => { const y = hAt(x, z); b.t('stone').box(x, y + (h0 + 0.3) / 2 - 0.2, z, 0.7, h0 + 0.5, 0.7, wc.clone().offsetHSL(0, 0, -0.03)); b.t('concrete').box(x, y + h0 + 0.36, z, 0.82, 0.1, 0.82, cap); }; }
      break;
    }
    case 'brick': { // fired brick wall: pilasters every 3 m, a brick-on-edge cap course, a concrete footing
      const h0 = H ?? 1.9, th = 0.24;
      const hand = f.brick ? f.brick === 'handmade' : rng.chance(0.5), BL = hand ? 'ladrillo' : 'brick'; // handmade (ladrillo) or factory brick
      const wc = col((f.paint ?? f.color) || rng.pick((hand ? LADRILLO : MAT.brick).wall), 0.03, rng), cap = wc.clone().offsetHSL(0, 0, -0.06), foot = col(0x9c968a, 0.03, rng);
      for (const run of runsOf(th / 2)) {
        b.t('concrete'); ribbon(run, -0.4, 0.12, th + 0.1, foot);
        b.t(BL); ribbon(run, 0.12, h0, th, wc);
        ribbon(run, h0, h0 + 0.08, th + 0.06, cap);
      }
      pierFn = (x, z) => { const y = hAt(x, z); b.t(BL).box(x, y + (h0 + 0.2) / 2 - 0.1, z, 0.46, h0 + 0.4, 0.46, wc.clone().offsetHSL(0, 0, -0.03)); b.box(x, y + h0 + 0.34, z, 0.54, 0.08, 0.54, cap); };
      posts(3.0, pierFn);
      break;
    }
    case 'wood': { // proper plank wall: straight, close-fitted boards on two rails, posts, a cap board
      const h0 = H ?? 1.8;
      const base = col((f.paint ?? f.color) || rng.pick([WOOD.weathered, 0x9a8a72, 0x8a6a4a, 0x7a6450]), 0.03, rng);
      b.t('fence_wood');
      for (const sg of segs) {
        const nP = Math.max(1, Math.round(sg.L / 2.4));
        for (let i = 0; i <= nP; i++) { const t = (i * sg.L) / nP, s2 = sg.s0 + t; if (inGate(s2)) continue; const x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t; b.box(x + sg.dz * 0.07, hAt(x, z) + h0 / 2 - 0.1, z - sg.dx * 0.07, 0.12, h0 + 0.3, 0.12, col(WOOD.pole, 0.04, rng), yaw(sg)); }
        const nb = Math.max(1, Math.round(sg.L / 0.16)), bw = sg.L / nb;
        for (let i = 0; i < nb; i++) {
          const t = (i + 0.5) * bw, s2 = sg.s0 + t; if (inGate(s2)) continue;
          const x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t, y = hAt(x, z);
          b.box(x, y + h0 / 2 - 0.08, z, bw - 0.012, h0 + 0.12, 0.03, base.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.035), yaw(sg));
        }
      }
      for (const run of runsOf(0)) { // rails behind and a cap board on top
        b.t('fence_wood');
        const { sg, u, v } = run, n = Math.max(1, Math.round((v - u) / 2.4)), pl = (v - u) / n;
        for (let i = 0; i < n; i++) { const t = u - sg.s0 + (i + 0.5) * pl, x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t, y = hAt(x, z); for (const hh of [0.3, h0 - 0.35]) b.box(x + sg.dz * 0.04, y + hh, z - sg.dx * 0.04, pl, 0.09, 0.05, base.clone().offsetHSL(0, 0, -0.08), yaw(sg)); }
        ribbon(run, h0 + 0.04, h0 + 0.09, 0.12, base.clone().offsetHSL(0, 0, -0.05));
      }
      break;
    }
    case 'stone_ruin': { // ruined stone wall: blocks of uneven height, broken runs (the old 'stone' look)
      const h0 = H ?? 1.6;
      pieces(1.1, (x, z, pl, sg, s) => {
        const broken = noise.noise2(s / 6, 3) * 0.5 + 0.5 < (1 - cond) * 0.8;
        const h = (broken ? h0 * rng.range(0.25, 0.6) : h0 * rng.range(0.88, 1.08));
        const y = hAt(x, z);
        b.box(x, y + h / 2 - 0.3, z, pl + 0.05, h + 0.3, 0.55 + rng.range(-0.06, 0.06), col((f.paint ?? f.color) || rng.pick(MAT.stone.wall), 0.06, rng), yaw(sg) + rng.range(-0.04, 0.04));
        if (!broken && rng.chance(0.4)) b.box(x, y + h, z, pl * 0.6, 0.12, 0.45, col(0x9a8f7c, 0.06, rng), yaw(sg) + rng.range(-0.1, 0.1));
      });
      break;
    }
    case 'adobe': case 'block': case 'concrete': {
      // masonry wall, rewritten: one continuous body that follows the ground with a cap along its whole length.
      // Adobe is battered (wider at the foot), a little wavy on top, with a rounded mud cap; block and concrete are
      // plumb with a thin concrete cap and piers. Wear (condition below 0.7) only sags the top gently — the cap
      // goes with it — and patches of render fall off; below 0.35 the odd breach collapses to a rubble heap.
      const adobe = type === 'adobe', h0 = H ?? (adobe ? 1.9 : 2.0);
      const thT = adobe ? 0.36 : 0.2, thB = adobe ? 0.52 : 0.2;
      const mat = MAT[adobe ? 'adobe' : type === 'block' ? 'block' : 'concrete'];
      const wc = col((f.paint ?? f.color) || rng.pick(mat.wall), 0.03, rng), capC = adobe || f.paint != null ? wc.clone().offsetHSL(0, -0.02, -0.07) : col(0xa8a49a, 0.03, rng);
      wallCol = wc; wallCap = capC; wallLay = f.paint != null ? 'plaster' : adobe ? 'adobe' : type;
      const wear = Math.max(0, Math.min(1, (0.7 - cond) / 0.6)), ss = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
      const breachAt = (s2) => (cond < 0.35 ? ss(((0.35 - cond) * 1.1 - (noise.noise2(s2 / 13, 21) * 0.5 + 0.5)) / 0.08) : 0);
      const top = (s2) => {
        let y = h0 + (adobe ? noise.noise2(s2 / 2.3, 3) * 0.035 : 0);
        if (wear > 0) y -= h0 * (0.08 + 0.22 * wear) * ss((wear * 0.75 - (noise.noise2(s2 / 9, 5) * 0.5 + 0.5)) / 0.2); // gentle sag
        const k = breachAt(s2); if (k > 0) y = y * (1 - k) + h0 * 0.28 * k;
        return y;
      };
      // a body whose sides go from thB at the foot to thT at the top
      const body = (run, step = 0.35) => {
        const { sg, u, v } = run, n = Math.max(1, Math.ceil((v - u) / step)), px = -sg.dz, pz = sg.dx;
        const P = (s2, side, up) => { const t = s2 - sg.s0, cx = sg.ax + sg.dx * t, cz = sg.az + sg.dz * t, g = hAt(cx, cz), hw = (up ? thT : thB) / 2; return [cx + px * side * hw, g + (up ? top(s2) : -0.3), cz + pz * side * hw]; };
        for (let i = 0; i < n; i++) {
          const s0 = u + ((v - u) * i) / n, s1 = u + ((v - u) * (i + 1)) / n;
          for (const sd of [-1, 1]) quadOut(P(s0, sd, 0), P(s1, sd, 0), P(s1, sd, 1), P(s0, sd, 1), [px * sd, 0.2, pz * sd], wc);
        }
        for (const [s2, dir] of [[u, -1], [v, 1]]) quadOut(P(s2, -1, 0), P(s2, 1, 0), P(s2, 1, 1), P(s2, -1, 1), [sg.dx * dir, 0, sg.dz * dir], wc);
      };
      for (const run of runsOf(thB / 2)) {
        b.t(f.paint != null ? 'plaster' : adobe ? 'adobe' : type); body(run);
        // the cap, unbroken except across a breach
        b.t(adobe ? 'adobe' : 'concrete');
        let a = null;
        for (let s2 = run.u; s2 <= run.v + 1e-6; s2 += 0.25) {
          const ok = breachAt(s2) < 0.25, last = s2 + 0.25 > run.v;
          if (ok && a == null) a = s2;
          if ((!ok || last) && a != null) { const e = ok ? run.v : s2; if (e - a > 0.2) ribbon({ sg: run.sg, u: a, v: e }, (q) => top(q) - 0.02, (q) => top(q) + (adobe ? 0.07 : 0.06), thT + (adobe ? 0.07 : 0.06), capC, 0.35); a = null; }
        }
        // render fallen off (adobe shows its bricks), and rubble at the foot of a breach
        const L2 = run.v - run.u, px = -run.sg.dz, pz = run.sg.dx;
        for (let k = 0; k < Math.round(L2 * (0.05 + wear * 0.35)); k++) {
          const s2 = rng.range(run.u + 0.4, run.v - 0.4), t = s2 - run.sg.s0, x = run.sg.ax + run.sg.dx * t, z = run.sg.az + run.sg.dz * t, h = top(s2), sd = rng.chance(0.5) ? 1 : -1;
          if (h < 1) continue;
          const yy = rng.range(0.35, h - 0.45), off = (thB + (thT - thB) * (yy / h)) / 2 + 0.006;
          b.t(adobe ? 'brick' : 'block').box(x + px * sd * off, hAt(x, z) + yy, z + pz * sd * off, rng.range(0.3, 0.8), rng.range(0.2, 0.45), 0.012, col(adobe ? 0x9a7356 : 0x8e8a82, 0.05, rng), yaw(run.sg));
        }
        if (cond < 0.35) for (let s2 = run.u + 0.5; s2 < run.v - 0.5; s2 += 0.7) if (breachAt(s2) > 0.6) {
          const t = s2 - run.sg.s0, x = run.sg.ax + run.sg.dx * t, z = run.sg.az + run.sg.dz * t;
          for (let k = 0; k < 3; k++) { const sd = rng.chance(0.5) ? 1 : -1; b.t(adobe ? 'adobe' : 'block').blob(x + px * sd * rng.range(0.3, 0.8), hAt(x, z) + 0.08, z + pz * sd * rng.range(0.3, 0.8), rng.range(0.2, 0.4), rng.range(0.1, 0.2), rng.range(0.2, 0.35), wc.clone().offsetHSL(0, 0, -0.05), 'dodec', rng.next() * 3); }
        }
      }
      if (!adobe) posts(3, (x, z, sg, s2) => { const y = hAt(x, z), h = Math.min(h0 + 0.12, top(s2) + 0.1); if (breachAt(s2) > 0.4) return; b.t(type).box(x, y + h / 2 - 0.15, z, 0.34, h + 0.3, 0.34, wc.clone().offsetHSL(0, 0, -0.04)); b.t('concrete').box(x, y + h + 0.02, z, 0.4, 0.06, 0.4, capC); });
      if (f.glass) glassTop((q) => top(q) + 0.06, thT);
      if (f.barbed) { const T = []; posts(3, (x, z, sg, s2) => { if (breachAt(s2) < 0.4) T.push([x, hAt(x, z) + top(s2) + 0.06, z, s2]); }); barbedTop(T, 3.6); }
      break;
    }
    case 'compound': { // stucco compound wall: piers with caps and dome finials, a coping on top
      const h0 = H ?? 2.3, th = 0.34;
      const wc = col(f.livery === 'hermandad' ? 0xdcd8cc : (f.paint ?? f.color) || rng.pick([0xc9a37b, 0xd0ac86, 0xc8a070, 0xd8b890, 0xc89a78]), 0.03, rng), cap = f.livery === 'hermandad' ? col(0x3a3936, 0.02, rng) : wc.clone().offsetHSL(0, -0.04, 0.07), brk = col(rng.pick(MAT.brick.wall), 0.04, rng);
      b.t('plaster');
      const top = erodedTop(h0, 0.45);
      for (const run of runsOf(th / 2)) {
        b.t('plaster'); ribbon(run, -0.3, top, th, wc, 0.35);
        b.t('concrete'); for (const sub of intactRuns(run, top, h0)) ribbon(sub, h0, h0 + 0.1, th + 0.12, cap, 0.5);
      }
      pieces(2.0, (x, z, pl, sg, s) => { // plaster fallen off, showing the brick
        const h = top(s), y = hAt(x, z);
        if (rng.chance(0.18 * (1.2 - cond))) b.t('brick').box(x + rng.range(-0.4, 0.4) * sg.dx, y + rng.range(0.5, Math.max(0.6, h - 0.6)), z + rng.range(-0.4, 0.4) * sg.dz, rng.range(0.4, 0.9), rng.range(0.25, 0.5), th + 0.012, brk, yaw(sg));
      });
      b.t('plaster');
      pierFn = (x, z, sg, s2) => { // a pier on a worn stretch is worn down with it (no cap)
        const y = hAt(x, z), hw = s2 != null ? top(s2) : h0;
        if (hw < h0 - 0.05) { b.t('plaster').box(x, y + (hw + 0.1) / 2 - 0.2, z, 0.62, hw + 0.3, 0.62, wc.clone().offsetHSL(0, 0, -0.03)); return; }
        b.t('plaster').box(x, y + (h0 + 0.35) / 2 - 0.2, z, 0.62, h0 + 0.55, 0.62, wc.clone().offsetHSL(0, 0, -0.03)); b.t('concrete').box(x, y + h0 + 0.42, z, 0.78, 0.12, 0.78, cap); b.box(x, y + h0 + 0.55, z, 0.5, 0.14, 0.5, cap); b.t('plaster').blob(x, y + h0 + 0.72, z, 0.24, 0.22, 0.24, cap, 'ico'); };
      if (f.livery === 'hermandad') { // design code: lime white, asphalt-grey base band with the yellow road line, dark coping
        const band = col(0x302f2c, 0.02, rng), dash = col(0xe0b030, 0.02, rng), dark = col(0x3a3936, 0.02, rng), yel = col(0xd8a62c, 0.02, rng);
        for (const run of runsOf(0)) {
          b.t('plaster'); ribbon(run, -0.2, 1.0, th + 0.03, band);
          const { sg, u, v } = run, px = -sg.dz, pz = sg.dx;
          for (let s2 = u + 0.3; s2 < v - 0.7; s2 += 1.2) for (const sd of [-1, 1]) { const t = s2 + 0.3 - sg.s0, x = sg.ax + sg.dx * t + px * sd * (th / 2 + 0.03), z = sg.az + sg.dz * t + pz * sd * (th / 2 + 0.03); b.box(x, hAt(x, z) + 0.55, z, 0.6, 0.1, 0.012, dash, yaw(sg)); }
        }
        pierFn = (x, z) => { const y = hAt(x, z); b.t('plaster').box(x, y + (h0 + 0.35) / 2 - 0.2, z, 0.62, h0 + 0.55, 0.62, wc.clone().offsetHSL(0, 0, -0.02)); b.box(x, y + 0.4, z, 0.66, 1.2, 0.66, band); b.t('concrete').box(x, y + h0 + 0.42, z, 0.78, 0.12, 0.78, dark); b.t('plaster').box(x, y + h0 + 0.56, z, 0.46, 0.16, 0.46, yel); };
        gatePierFn = (x, z) => { // road-hazard stripes on the gate posts
          const y = hAt(x, z), ph = h0 + 0.6;
          b.t('plaster'); for (let k = 0, yy = -0.2; yy < ph; k++, yy += 0.3) b.box(x, y + yy + Math.min(0.3, ph - yy) / 2, z, 0.66, Math.min(0.3, ph - yy), 0.66, k % 2 ? yel : band);
          b.t('concrete').box(x, y + ph + 0.06, z, 0.8, 0.12, 0.8, dark);
        };
      }
      if (f.glass) glassTop((q) => Math.min(top(q), h0) + 0.1, th);
      posts(4.2, pierFn);
      break;
    }
    case 'pole': case 'rail': {
      const h0 = H ?? 1.5;
      const wc = () => col(rng.pick([WOOD.weathered, WOOD.pole, 0x8a7a62]), 0.06, rng);
      const P = [];
      posts(2.4, (x, z, sg, s) => {
        const y = hAt(x, z);
        b.cyl(x, y + h0 / 2, z, 0.07, 0.09, h0 + 0.1, 5, wc(), rng.range(-0.05, 0.05), 0, rng.range(-0.05, 0.05));
        P.push([x, y, z, s]);
      });
      withGates(P);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c = P[i + 1];
        if (c[3] - a[3] > 3.5 || inGate((a[3] + c[3]) / 2)) continue; // gate / gap
        for (const yy of type === 'rail' ? [0.5, 1.0, 1.4] : [0.55, 1.15]) {
          if (rng.chance((1 - cond) * 0.4)) continue;
          b.plank([a[0], a[1] + yy * h0 / 1.5, a[2]], [c[0], c[1] + yy * h0 / 1.5 + rng.range(-0.05, 0.05), c[2]], 0.06, 0.1, wc());
        }
      }
      break;
    }
    case 'bollard': { // a row of concrete bollards: whitewashed or bare, every few a faded red-orange; a few lean, chipped, one gone
      const h0 = H ?? 0.95, every = f.spacing || 1.7;
      const base = rng.pick([0xc8c2b4, 0xb8b2a6, 0xd0cabc]), red = rng.pick([0xa85e48, 0xb0664c, 0x9a5442]), redEvery = rng.int(4, 6);
      let k = 0;
      const one = (x, z, painted, s2) => {
        const y = hAt(x, z), lean = (1 - cond) * 0.35 + 0.04, tx = rng.chance(0.15) ? rng.range(-lean, lean) : rng.range(-0.02, 0.02), tz = rng.chance(0.15) ? rng.range(-lean, lean) : rng.range(-0.02, 0.02);
        const c = col(painted ? red : base, 0.04, rng).offsetHSL(0, 0, rng.range(-0.04, 0.03)), r = rng.range(0.085, 0.105), h = h0 * rng.range(0.92, 1.06);
        b.t('concrete').cyl(x, y + h / 2 - 0.15, z, r, r * 1.05, h + 0.3, 10, c, tx, 0, tz);
        if (rng.chance(0.35)) b.cyl(x + Math.sin(tz) * h * 0.5, y + h - 0.12, z - Math.sin(tx) * h * 0.5, r * 0.8, r, 0.06, 10, c.clone().offsetHSL(0, 0, -0.08), tx, 0, tz); // a chipped top
      };
      posts(every, (x, z, sg, s2) => { k++; if (rng.chance((1 - cond) * 0.15)) return; one(x, z, k % redEvery === 0 || rng.chance(0.05), s2); });
      gatePierFn = (x, z) => one(x, z, true);
      break;
    }
    case 'herreria': { // low fieldstone wall with white square pillars (pyramid caps) and spear-topped sunburst iron panels between
      const base = H != null ? Math.min(0.7, H * 0.3) : 0.55, h0 = H ?? 1.95, th = 0.42, every = 2.6;
      const sc = col(rng.pick([0xa89c88, 0x9c917e, 0xb0a490]), 0.04, rng), mortar = col(0xb8b0a0, 0.03, rng);
      const pc = col(rng.pick([0xe0dcd2, 0xd8d4c8, 0xd0ccc0]), 0.03, rng), ic = col(rng.pick([0xdcd8ce, 0xd4d0c6, 0x3a3a38]), 0.03, rng);
      for (const run of runsOf(th / 2)) { b.t('stone'); ribbon(run, -0.3, base, th, sc, 0.5); b.t('concrete'); ribbon(run, base, base + 0.06, th + 0.06, mortar, 0.6); }
      const pillar = (x, z) => { const y = hAt(x, z); b.t('plaster').box(x, y + h0 / 2 - 0.1, z, 0.34, h0 + 0.2, 0.34, pc); b.box(x, y + h0 + 0.05, z, 0.42, 0.1, 0.42, pc); b.cyl(x, y + h0 + 0.24, z, 0.01, 0.27, 0.3, 4, pc, 0, Math.PI / 4); };
      b.t('metal');
      pieces(every, (x, z, pl, sg) => { // the panel: a frame, a fan of bars from the bottom middle with spear tips, two arcs
        const y = hAt(x, z) + base + 0.06, w = pl - 0.36, Hp = h0 - base - 0.1, dx = sg.dx, dz = sg.dz;
        if (w < 0.4) return;
        const P = (u, v) => [x + dx * u, y + v, z + dz * u];
        b.beam(P(-w / 2, 0.04), P(w / 2, 0.04), 0.016, 4, ic); b.beam(P(-w / 2, 0), P(-w / 2, Hp * 0.75), 0.014, 4, ic); b.beam(P(w / 2, 0), P(w / 2, Hp * 0.75), 0.014, 4, ic);
        const R = Math.min(Hp, w * 0.62), n = Math.max(9, Math.round(w * 7));
        for (let i = 0; i <= n; i++) { const a = -1.25 + (2.5 * i) / n, ux = Math.sin(a), uy = Math.cos(a), L = R * (0.96 + 0.04 * Math.cos(i * 1.7)); const end = [x + dx * ux * L, y + uy * L, z + dz * ux * L]; if (Math.abs(ux * L) > w / 2 + 0.02) continue; b.beam(P(0, 0.06), end, 0.009, 3, ic); b.box(end[0], end[1] + 0.035 * uy, end[2], 0.035, 0.07, 0.012, ic, yaw(sg), 0, -a); }
        for (const rr of [R * 0.32, R * 0.62]) { let prev = null; for (let i = 0; i <= 12; i++) { const a = -1.3 + (2.6 * i) / 12, q = [x + dx * Math.sin(a) * rr, y + 0.06 + Math.cos(a) * rr, z + dz * Math.sin(a) * rr]; if (prev) b.beam(prev, q, 0.008, 3, ic); prev = q; } }
      });
      posts(every, (x, z) => pillar(x, z));
      gatePierFn = pillar; wallLay = 'stone';
      break;
    }
    case 'chain': { // post-and-chain barrier: short pipe posts (painted or rusted) with a heavy chain sagging between them
      const h0 = H ?? 0.95, two = h0 > 1.2;
      const pc = col(rng.pick([0xc8b048, 0x8c9294, 0x6f7f5a, METAL.rust, 0xd8d4c8]), 0.05, rng), cc = col(rng.chance(0.5) ? 0x5a5c5e : METAL.rust, 0.05, rng);
      const P = [];
      posts(2.4, (x, z, sg, s) => {
        const y = hAt(x, z);
        b.t(cond < 0.6 ? 'rust' : 'metal').cyl(x, y + h0 / 2 - 0.15, z, 0.055, 0.06, h0 + 0.3, 8, pc, rng.range(-0.03, 0.03) * (1 - cond), 0, rng.range(-0.03, 0.03) * (1 - cond));
        b.cyl(x, y + h0 + 0.02, z, 0.07, 0.07, 0.05, 8, pc);
        P.push([x, y, z, s]);
      });
      // the gate posts join the run (the chain hooks onto them); nothing spans the opening itself
      for (const [ga, gz] of gates) for (const gs of [ga, gz]) { const sg = segs.find((q) => gs >= q.s0 && gs <= q.s0 + q.L) || segs[segs.length - 1], t = gs - sg.s0, x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t; P.push([x, hAt(x, z), z, gs]); }
      P.sort((p, q) => p[3] - q[3]);
      b.t('metal');
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c = P[i + 1];
        if (c[3] - a[3] > 6 || inGate((a[3] + c[3]) / 2)) continue; // the opening / a long gap
        for (const yy of two ? [h0 - 0.1, h0 * 0.5] : [h0 - 0.1]) {
          if (rng.chance((1 - cond) * 0.25)) { // a broken chain hangs from one post
            const q = rng.chance(0.5) ? a : c; b.plank([q[0], q[1] + yy, q[2]], [q[0], q[1] + yy - 0.55, q[2]], 0.04, 0.012, cc); continue;
          }
          const L = Math.hypot(c[0] - a[0], c[2] - a[2]), n = Math.max(8, Math.round(L / 0.075)), sag = 0.12 + L * 0.04;
          let prev = null;
          for (let k = 0; k <= n; k++) { // links: alternate flat / edge-on along a catenary
            const t = k / n, pt = [a[0] + (c[0] - a[0]) * t, a[1] + yy + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t];
            if (prev) b.plank(prev, pt, k % 2 ? 0.045 : 0.012, k % 2 ? 0.012 : 0.045, cc);
            prev = pt;
          }
        }
      }
      break;
    }
    case 'wire': {
      const h0 = H ?? 1.3;
      const P = [];
      posts(3.2, (x, z, sg, s) => { const y = hAt(x, z); b.box(x, y + h0 / 2, z, 0.09, h0, 0.09, col(WOOD.pole, 0.08, rng)); P.push([x, y, z, s]); });
      withGates(P);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c = P[i + 1];
        if (c[3] - a[3] > 4.5 || inGate((a[3] + c[3]) / 2)) continue;
        b.t('metal');
        for (const yy of [0.45, 0.85, 1.2]) b.beam([a[0], a[1] + yy, a[2]], [c[0], c[1] + yy - 0.03, c[2]], 0.012, 3, col(METAL.dark));
      }
      break;
    }
    case 'chainlink': { // galvanised chain-link on pipe posts, a top rail; worn: rust, sagging panels, a peeled-back corner, a missing panel
      const h0 = H ?? 2.1, rusty = cond < 0.6, pc = col(rusty ? 0x7a6a5a : 0x9a9e9c, 0.04, rng), mc = col(rusty ? 0x6a5a4a : 0x8a8e8c, 0.04, rng);
      const P = [];
      b.t('metal');
      posts(3.0, (x, z, sg, s) => { const y = hAt(x, z), lean = cond < 0.5 && rng.chance(0.3) ? rng.range(-0.08, 0.08) : 0; b.cyl(x, y + h0 / 2, z, 0.035, 0.035, h0, 6, pc, lean, 0, 0); P.push([x, y, z, s, lean]); });
      withGates(P);
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], c2 = P[i + 1];
        if (c2[3] - a[3] > 4.0 || inGate((a[3] + c2[3]) / 2)) continue; // gate / gap
        b.t('metal').beam([a[0], a[1] + h0 - 0.03, a[2]], [c2[0], c2[1] + h0 - 0.03, c2[2]], 0.025, 5, pc); // top rail
        if (cond < 0.35 && rng.chance(0.25)) continue; // a panel gone
        const sag = cond < 0.6 && rng.chance(0.4) ? rng.range(0.1, 0.45) : 0, peel = cond < 0.5 && rng.chance(0.25);
        const L = Math.hypot(c2[0] - a[0], c2[2] - a[2]), sp = 0.32, top = h0 - 0.06 - sag;
        // the mesh: two families of diagonal wires in the panel plane, clipped to it (u along, v up)
        const Pt = (u, v) => { const t = u / L, y0 = a[1] + (c2[1] - a[1]) * t, sv = v * (1 - sag * 4 * t * (1 - t) / Math.max(0.1, top)); return [a[0] + (c2[0] - a[0]) * t, y0 + 0.05 + sv, a[2] + (c2[2] - a[2]) * t]; };
        for (const dir of [1, -1]) for (let k = -top; k < L; k += sp) {
          // wire from (k, 0) to (k + top, top) for dir 1, mirrored for dir -1; clip u to [0, L]
          let u0 = k, v0 = 0, u1 = k + top, v1 = top;
          if (u0 < 0) { v0 = -u0; u0 = 0; } if (u1 > L) { v1 -= u1 - L; u1 = L; }
          if (v1 - v0 < 0.05) continue;
          if (peel && u0 < 0.9 && v0 < 0.9) continue; // a corner peeled back
          const A = dir > 0 ? Pt(u0, v0) : Pt(L - u0, v0), B = dir > 0 ? Pt(u1, v1) : Pt(L - u1, v1);
          b.beam(A, B, 0.007, 3, mc);
        }
        if (peel) { const [x, y, z] = Pt(0.5, 0.4); b.box(x, y, z, 0.9, 0.7, 0.02, mc, Math.atan2(-(c2[2] - a[2]), c2[0] - a[0]) + 0.9, 0.3); }
        b.beam(Pt(0, 0.03), Pt(L, 0.03), 0.01, 3, mc); // tension wire at the foot
      }
      if (f.barbed) barbedTop(P.map((q) => [q[0], q[1] + h0, q[2], q[3]]), 4.0);
      break;
    }
    case 'ocotillo': { // living fence of ocotillo cuttings
      const h0 = H ?? 2.2;
      for (const sg of segs) for (let t = 0; t < sg.L; t += 0.3) {
        const s = sg.s0 + t;
        if (inGate(s)) continue;
        const x = sg.ax + sg.dx * t + rng.range(-0.05, 0.05), z = sg.az + sg.dz * t + rng.range(-0.05, 0.05);
        const y = hAt(x, z), h = h0 * rng.range(0.75, 1.15);
        b.beam([x, y - 0.1, z], [x + rng.range(-0.2, 0.2), y + h, z + rng.range(-0.2, 0.2)], 0.035, 3, col(rng.chance(0.3) ? 0x7a8a50 : 0x6a5e46, 0.08, rng));
      }
      break;
    }
    case 'wood_old': { // decayed plank wall: rough vertical boards on rails between thick posts, uneven, salvaged
      const h0 = H ?? 1.8;
      const base = rng.chance(0.25) ? col(rng.pick([0x7a5a4a, 0x5f6f62, 0x8a7a5a]), 0.05, rng) : col(rng.pick([WOOD.weathered, WOOD.dark, 0x9a8a72]), 0.04, rng);
      for (const sg of segs) {
        // posts every ~2.4 m
        for (let t = 0; t <= sg.L + 0.01; t += sg.L / Math.max(1, Math.round(sg.L / 2.4))) {
          const s = sg.s0 + t; if (inGate(s)) continue;
          const x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t, y = hAt(x, z);
          b.box(x, y + h0 / 2, z, 0.16, h0 + 0.4, 0.16, col(WOOD.pole, 0.05, rng), yaw(sg));
        }
        // boards: uneven width / height, the odd gap, a pallet or tin patch now and then
        let t = 0;
        while (t < sg.L) {
          const bw = rng.range(0.14, 0.3), s = sg.s0 + t + bw / 2;
          if (!inGate(s) && !rng.chance(0.04 + (1 - cond) * 0.25)) {
            const x = sg.ax + sg.dx * (t + bw / 2), z = sg.az + sg.dz * (t + bw / 2), y = hAt(x, z);
            const hh = h0 * rng.range(0.9, 1.05) * (rng.chance((1 - cond) * 0.3) ? rng.range(0.5, 0.85) : 1);
            const patch = rng.chance(0.04);
            b.t(patch ? 'corrugated' : 'fence_wood');
            b.box(x - sg.dz * 0.06, y + hh / 2 - 0.05, z + sg.dx * 0.06, bw - 0.015, hh, patch ? 0.03 : 0.035, patch ? col(rng.pick([METAL.rust, METAL.steel]), 0.05, rng) : base.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.09), yaw(sg), 0, rng.range(-0.02, 0.02));
            b.t('fence_wood');
          }
          t += bw;
        }
      }
      pieces(2.4, (x, z, pl, sg) => { const y = hAt(x, z); for (const hh of [0.35, h0 * 0.55, h0 - 0.25]) b.box(x + sg.dz * 0.02, y + hh, z - sg.dx * 0.02, pl, 0.1, 0.06, col(WOOD.dark, 0.04, rng), yaw(sg)); });
      break;
    }
    case 'picket': {
      const h0 = H ?? 1.2;
      const pc = col((f.paint ?? f.color) || rng.pick([WOOD.weathered, 0xd8ccb0, 0x8a9aa0]), 0.04, rng);
      for (const sg of segs) for (let t = 0; t < sg.L; t += 0.3) {
        const s = sg.s0 + t;
        if (inGate(s) || rng.chance((1 - cond) * 0.3)) continue;
        const x = sg.ax + sg.dx * t, z = sg.az + sg.dz * t, y = hAt(x, z);
        b.box(x, y + h0 / 2, z, 0.12, h0, 0.03, pc, yaw(sg));
      }
      pieces(2.4, (x, z, pl, sg) => { const y = hAt(x, z); b.box(x, y + h0 * 0.7, z - 0, pl, 0.08, 0.05, pc, yaw(sg)); });
      break;
    }
    case 'scrap': { // corrugated sheets — only where context calls for it
      const h0 = H ?? 2.0;
      pieces(1.2, (x, z, pl, sg) => {
        const y = hAt(x, z), h = h0 * rng.range(0.8, 1.15);
        b.box(x, y + h / 2 - 0.1, z, pl + 0.15, h, 0.05, col(+rng.weighted(SCRAP_W), 0.035, rng), yaw(sg) + rng.range(-0.06, 0.06), 0, rng.range(-0.05, 0.05));
      });
      b.t('wood');
      posts(2.4, (x, z) => { const y = hAt(x, z); b.cyl(x, y + h0 / 2, z, 0.05, 0.05, h0, 4, col(WOOD.pole)); });
      break;
    }
  }
  // an open wall run that leaves a gate gap (compounds): its two ends are the gate posts
  if (gatePierFn && f.gateEnds && !f.closed && f.path.length > 1) for (const q of [f.path[0], f.path[f.path.length - 1]]) gatePierFn(q[0], q[1]);
  // gate posts / leaves
  for (const [a, z, g] of gates) {
    if (['pole', 'rail', 'wire', 'ocotillo', 'picket', 'chainlink', 'chain'].includes(type) && g.posts === false) continue;
    for (const s of [a, z]) {
      const sg = segs.find((q) => s >= q.s0 && s <= q.s0 + q.L) || segs[segs.length - 1];
      const t = s - sg.s0, x = sg.ax + sg.dx * t, zz = sg.az + sg.dz * t, y = hAt(x, zz);
      if (gatePierFn) gatePierFn(x, zz);
      else if (pierFn) pierFn(x, zz);
      else if (['stone_low', 'stone_ruin', 'adobe', 'block', 'concrete', 'compound'].includes(type)) {
        const ph = (H ?? (type === 'stone_low' ? 1.1 : 2.0)) + 0.35;
        if (wallLay) b.t(wallLay);
        b.box(x, y + ph / 2 - 0.2, zz, 0.65, ph + 0.2, 0.65, wallCol ? wallCol.clone().offsetHSL(0, 0, -0.03) : col(type === 'stone_low' || type === 'stone_ruin' ? rng.pick(MAT.stone.wall) : rng.pick(MAT[type === 'adobe' ? 'adobe' : 'block'].wall), 0.04, rng));
        if (wallCap) b.t(type === 'adobe' ? 'adobe' : 'concrete');
        b.box(x, y + ph, zz, 0.75, 0.1, 0.75, wallCap || col(0x8a7f6c));
      } else if (type === 'chainlink') { b.t('metal').cyl(x, y + (H ?? 2.1) / 2 + 0.05, zz, 0.06, 0.06, (H ?? 2.1) + 0.1, 8, col(0x8a8e8c)); }
      else if (type === 'chain') { b.t('metal').cyl(x, y + (H ?? 0.95) / 2, zz, 0.08, 0.08, (H ?? 0.95) + 0.1, 8, col(0xc8b048, 0.05, rng)); }
      else b.cyl(x, y + 1, zz, 0.11, 0.12, 2.1, 6, col(WOOD.pole));
    }
    if (g.leaf) gateLeaves(b, rng, segs, hAt, a, z, g, type, H);
  }
  return b.build({ maxEdge: 4.0 });
}

// Gate leaves: two leaves meeting in the middle (one on narrow gaps), each hinged on its post.
// g.leaf: 'wood' | 'metal'; g.state: 'closed' | 'ajar' | 'open'
const MASONRY = ['stone_low', 'stone', 'stone_ruin', 'brick', 'adobe', 'block', 'concrete', 'compound'];
function gateLeaves(b, rng, segs, hAt, a, z, g, type, H) {
  const at = (s) => { const sg = segs.find((q) => s >= q.s0 - 1e-6 && s <= q.s0 + q.L + 1e-6) || segs[segs.length - 1]; const t = s - sg.s0; return { x: sg.ax + sg.dx * t, z: sg.az + sg.dz * t, sg }; };
  const inset = MASONRY.includes(type) ? 0.34 : 0.08; // clear of the gate piers
  const A = at(a + inset), Z = at(z - inset), gap = Math.hypot(Z.x - A.x, Z.z - A.z), yaw = Math.atan2(-A.sg.dz, A.sg.dx);
  const ranch = !MASONRY.includes(type) && type !== 'wood' && type !== 'wood_old' && type !== 'scrap' && type !== 'chainlink';
  const wallH = H ?? (type === 'stone_low' ? 1.1 : MASONRY.includes(type) ? 2.0 : type === 'chainlink' ? 2.1 : type === 'wood' || type === 'wood_old' ? 1.8 : 1.4);
  const lh = ranch ? 1.3 : Math.max(1.2, Math.min(2.1, wallH - 0.05));
  const two = gap >= 1.4, lw = two ? gap / 2 - 0.02 : gap - 0.04;
  const state = g.state || 'closed', swing = { closed: 0, ajar: 0.45, open: 1.45 }[state] ?? 0;
  const scrapL = g.leaf === 'scrap' || (type === 'scrap' && g.leaf === 'metal'); // scrap fences get scrap gates
  const metal = g.leaf === 'metal' && !scrapL, wc = col(rng.pick(metal ? [METAL.rust, 0x3f4a44, 0x5a3a2a, METAL.dark] : [WOOD.weathered, WOOD.dark, 0x8a6a4a, 0x5f6f62]), 0.05, rng);
  const spikes = metal && lh >= 1.8, sheet = metal && rng.chance(0.5), sheetC = col(rng.pick([0x6a5a4c, 0x5e4c40, 0x5a5650, 0x6f6c66]), 0.04, rng); // both leaves alike
  const y0 = Math.max(hAt(A.x, A.z), hAt(Z.x, Z.z), hAt((A.x + Z.x) / 2, (A.z + Z.z) / 2)) + 0.05;
  const leaf = (hx, hz, ry, sgn, k) => {
    const y = y0; // one base height for both leaves, so they meet level in the middle
    b.pushT(hx, y, hz, ry + sgn * swing * (k === 1 && state === 'ajar' ? 0.3 : 1));
    // local frame: x from the hinge across the opening (sgn flips for the second leaf), y up
    const X = (u) => u; // both leaves' frames point from their hinge into the opening
    if (ranch && !scrapL) {
      b.t('fence_wood');
      for (const yy of [0.15, 0.5, 0.85, 1.2]) b.box(X(lw / 2), yy, 0, lw, 0.1, 0.05, wc);
      b.box(X(0.05), lh / 2, 0, 0.1, lh, 0.07, wc); b.box(X(lw - 0.05), lh / 2, 0, 0.1, lh, 0.07, wc);
      b.plank([X(0.05), 0.15, 0.03], [X(lw - 0.05), lh - 0.1, 0.03], 0.09, 0.04, wc);
    } else if (scrapL) { // scrap gate: a rough pole frame skinned with mismatched tin, a ragged top, wire hinges
      b.t('bark');
      for (const u of [0.06, lw - 0.06]) b.cyl(X(u), lh / 2, 0, 0.045, 0.05, lh + rng.range(-0.05, 0.1), 5, col(WOOD.pole, 0.06, rng));
      b.t('metal'); for (const yy of [0.18, lh - 0.22]) b.plank([X(0.04), yy, 0], [X(lw - 0.04), yy + rng.range(-0.06, 0.06), 0], 0.05, 0.05, col(rng.pick([METAL.rust, 0x5a5650, 0x3f4a44]), 0.06, rng));
      b.plank([X(0.08), 0.22, -0.03], [X(lw - 0.08), lh - 0.25, -0.03], 0.04, 0.04, col(WOOD.pole, 0.05, rng)); // brace
      const ns = Math.max(2, Math.round(lw / 0.85));
      b.t('corrugated');
      for (let i = 0; i < ns; i++) {
        const u0 = (i * lw) / ns, sw = lw / ns + 0.08, sh = lh * rng.range(0.82, 1.04);
        b.box(X(u0 + sw / 2 - 0.04), 0.1 + sh / 2, 0.035 + i * 0.006, sw, sh, 0.02, col(+rng.weighted(SCRAP_W), 0.035, rng), 0, 0, rng.range(-0.04, 0.04));
      }
      if (rng.chance(0.45)) { b.t('plain').box(X(lw * rng.range(0.3, 0.7)), lh * rng.range(0.35, 0.6), 0.06, 0.6, 0.4, 0.015, col(rng.pick([0xc8b88a, 0xa83a32, 0x2f5a8a, 0xd8d0c0]), 0.05, rng)); } // an old sign / car panel patch
      b.t('metal'); for (const yy of [0.3, lh - 0.35]) b.box(X(0.02), yy, 0, 0.1, 0.04, 0.12, col(0x6a6a66)); // wire twists
    } else if (g.leaf === 'chainlink') { // pipe frame, a diagonal brace, mesh
      const fr = col(0x8a8e8c, 0.04, rng);
      b.t('metal');
      for (const yy of [0.05, lh - 0.05]) b.beam([X(0), yy, 0], [X(lw), yy, 0], 0.025, 5, fr);
      for (const u of [0.02, lw - 0.02]) b.beam([X(u), 0.05, 0], [X(u), lh - 0.05, 0], 0.025, 5, fr);
      b.beam([X(0.05), 0.08, 0], [X(lw - 0.05), lh - 0.08, 0], 0.018, 4, fr);
      const sp = 0.32, top = lh - 0.1;
      for (const dir of [1, -1]) for (let k = -top; k < lw; k += sp) { let u0 = k, v0 = 0, u1 = k + top, v1 = top; if (u0 < 0) { v0 = -u0; u0 = 0; } if (u1 > lw) { v1 -= u1 - lw; u1 = lw; } if (v1 - v0 < 0.05) continue; const A = dir > 0 ? [X(u0), 0.05 + v0, 0] : [X(lw - u0), 0.05 + v0, 0], B = dir > 0 ? [X(u1), 0.05 + v1, 0] : [X(lw - u1), 0.05 + v1, 0]; b.beam(A, B, 0.007, 3, fr); }
    } else if (!metal) {
      b.t('fence_wood');
      const n = Math.max(3, Math.round(lw / 0.15));
      for (let i = 0; i < n; i++) b.box(X(((i + 0.5) * lw) / n), lh / 2, 0, lw / n - 0.012, lh - rng.range(0, 0.04), 0.04, wc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.07));
      const bc = wc.clone().offsetHSL(0, 0, -0.07);
      for (const yy of [0.25, lh - 0.25]) b.box(X(lw / 2), yy, 0.04, lw - 0.06, 0.12, 0.04, bc);
      const sA = sgn > 0 ? [X(0.08), 0.32, 0.04] : [X(0.08), lh - 0.32, 0.04], sB = sgn > 0 ? [X(lw - 0.08), lh - 0.32, 0.04] : [X(lw - 0.08), 0.32, 0.04];
      b.plank(sA, sB, 0.1, 0.035, bc); // Z-brace
      b.t('metal');
      for (const yy of [0.25, lh - 0.25]) b.box(X(0.22), yy, 0.065, 0.42, 0.06, 0.012, col(METAL.dark)); // strap hinges
    } else {
      b.t('metal');
      const fr = wc.clone().offsetHSL(0, 0, -0.04);
      for (const yy of [0.06, lh / 2, lh - 0.06]) b.box(X(lw / 2), yy, 0, lw, 0.06, 0.05, fr);
      for (const u of [0.03, lw - 0.03]) b.box(X(u), lh / 2, 0, 0.06, lh, 0.05, fr);
      if (sheet) { b.t('corrugated').box(X(lw / 2), lh * 0.25 + 0.03, 0, lw - 0.06, lh / 2 - 0.08, 0.02, sheetC); b.t('metal'); }
      const n = Math.max(3, Math.round(lw / 0.13));
      for (let i = 1; i < n; i++) b.box(X((i * lw) / n), lh / 2, 0, 0.022, lh - 0.1, 0.022, fr);
      if (spikes) for (let i = 0; i <= n; i++) b.cyl(X((i * lw) / n), lh + 0.08, 0, 0.0, 0.025, 0.16, 4, fr);
    }
    b.pop();
  };
  leaf(A.x, A.z, yaw, 1, 0);
  if (two) leaf(Z.x, Z.z, yaw + Math.PI, -1, 1);
  if (state === 'closed' && metal) { // chain and padlock where the leaves meet
    const mx = (A.x + Z.x) / 2, mz = (A.z + Z.z) / 2, y = hAt(mx, mz) + lh * 0.55;
    b.t('metal').box(mx, y, mz, 0.06, 0.18, 0.08, col(0x8a8a6a), yaw);
  }
}

// Baja cacti, smooth and ribbed: cardón (Pachycereus pringlei), nopal (Opuntia), cholla (Cylindropuntia), agave.
import * as THREE from 'three';
import { col } from './builder.js';
import { ellip, rod, tube, addSmooth } from './shapes.js';

export function betterCacti(SP) {
  // ---------------------------------------------------------------- cardón: massive fluted trunk, candelabra arms
  SP.cardon = (b, c, r) => {
    // Pachycereus pringlei: a short corky grey trunk, then a few to many slender ribbed arms that leave it low, bend up
    // and rise apart in a loose V — each a different height, tapering to blunt points, grey-brown and scarred low down,
    // yellow-green above, now and then a narrow joint where a season was dry, an arm branching again
    b.t('cactus');
    const H = r.range(8, 13), green = col(r.pick([0x8fa05a, 0x97a862, 0x88985a, 0x9aa86a]), 0.04, r), cork = col(r.pick([0x9a8a70, 0x8e8068, 0xa09078]), 0.04, r);
    const trunk = col(0x8a8476, 0.04, r), R0 = r.range(0.34, 0.44), ribs = r.int(11, 14), trunkH = r.range(1.4, 3.0);
    tube(b, [[0, -0.1, 0], [0, trunkH * 0.5, 0], [0, trunkH, 0]], [R0 * 1.08, R0, R0 * 0.96], trunk, { ribs, ribDepth: 0.05, cap: false });
    // a stem: lower part corky, upper green, the tip tapered
    const stem = (pts, rad) => { // corky low down, a blend, then green; where it turns differs per arm
      const n = pts.length, k1 = Math.max(1, Math.round(n * r.range(0.3, 0.55))), k2 = Math.min(n - 2, k1 + 2), mid = cork.clone().lerp(green, 0.5);
      tube(b, pts.slice(0, k1 + 1), rad.slice(0, k1 + 1), cork.clone().offsetHSL(0, 0, r.range(-0.03, 0.03)), { ribs: 10, ribDepth: 0.05, cap: false });
      tube(b, pts.slice(k1, k2 + 1), rad.slice(k1, k2 + 1), mid, { ribs: 10, ribDepth: 0.05, cap: false });
      tube(b, pts.slice(k2), rad.slice(k2), green.clone().offsetHSL(0, 0, r.range(-0.04, 0.04)), { ribs: 10, ribDepth: 0.05 });
    };
    // an arm: out from (x,y,z) along angle a, elbow, then up, leaning out; returns its points
    const arm = (x, y, z, a, top, ar, out, lean) => {
      const dx = Math.cos(a), dz = Math.sin(a), pts = [], rad = [];
      pts.push([x, y - 0.1, z]); rad.push(ar * 0.9);
      for (let k = 1; k <= 3; k++) { const ph = (k / 3) * (Math.PI / 2); pts.push([x + dx * out * Math.sin(ph), y + out * (1 - Math.cos(ph)) * 0.9, z + dz * out * Math.sin(ph)]); rad.push(ar); }
      const bx = x + dx * out, bz = z + dz * out, by = y + out * 0.9, L = top - by, joint = r.chance(0.3) ? r.range(0.3, 0.6) : -1;
      for (let k = 1; k <= 9; k++) { const t = k / 9, lt = lean * t;
        pts.push([bx + dx * lt, by + L * t, bz + dz * lt]);
        rad.push(ar * (t > 0.82 ? 1 - (t - 0.82) * 2.4 : 1) * (joint > 0 && Math.abs(t - joint) < 0.06 ? 0.72 : 1)); }
      stem(pts, rad);
      return { bx, by, bz, dx, dz, L };
    };
    const n = r.weighted({ 3: 1, 4: 2, 5: 2.5, 6: 2, 7: 1.2, 8: 0.6 }), a0 = r.range(0, 6.28);
    if (r.chance(0.6)) arm(0, trunkH - 0.2, 0, 0, H * r.range(0.9, 1), r.range(0.2, 0.26), 0.001, r.range(0, 0.3)); // the leader, straight up
    for (let i = 0; i < +n; i++) {
      const a = a0 + (i / +n) * Math.PI * 2 + r.range(-0.3, 0.3), y = trunkH - 0.3 + r.range(0, 0.9);
      const ar = r.range(0.17, 0.23), A = arm(Math.cos(a) * R0 * 0.5, y, Math.sin(a) * R0 * 0.5, a, H * r.range(0.55, 0.98), ar, r.range(0.3, 0.7), r.range(0.4, 1.8));
      if (r.chance(0.18) && A.L > 3) { const t = r.range(0.35, 0.55); arm(A.bx + A.dx * 0.2, A.by + A.L * t, A.bz + A.dz * 0.2, Math.atan2(A.dz, A.dx) + r.range(-0.8, 0.8), A.by + A.L * t + A.L * r.range(0.3, 0.5), ar * 0.8, r.range(0.35, 0.6), r.range(0.1, 0.4)); }
    }
    return { h: H, r: 1.6 };
  };

  // ---------------------------------------------------------------- nopal: chains of flat oval pads, some fruit
  SP.nopal = (b, c, r) => {
    b.t('cactus');
    const cc = col(r.pick([0x7a9a5a, 0x6f9256, 0x86a062]), 0.04, r), old = cc.clone().offsetHSL(0, -0.15, -0.08), fruit = col(r.pick([0x9a3a4a, 0xb8484a, 0xa86a3a]), 0.05, r), spine = col(0xd8d0a0);
    const pads = [], want = r.int(8, 16);
    const pad = (p, yaw, roll, s, gen) => {
      const sx = 0.22 * s, sy = 0.29 * s, sz = 0.05 * s;
      ellip(b, p[0], p[1], p[2], sx, sy, sz, gen === 0 ? old : cc.clone().offsetHSL(0, 0, r.range(-0.04, 0.04)), 0, yaw, roll, 14);
      const cy = Math.cos(yaw), sn = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
      const up = [-sr * cy, cr, sr * sn], side = [cr * cy, sr, -cr * sn], nrm = [sn, 0, cy];
      for (let k = 0; k < 6; k++) { const u = r.range(-0.6, 0.6), v = r.range(-0.6, 0.6), f = r.chance(0.5) ? 1 : -1; ellip(b, p[0] + side[0] * u * sx + up[0] * v * sy + nrm[0] * sz * 0.9 * f, p[1] + side[1] * u * sx + up[1] * v * sy, p[2] + side[2] * u * sx + up[2] * v * sy + nrm[2] * sz * 0.9 * f, 0.012, 0.012, 0.012, spine, 0, 0, 0, 4); }
      pads.push({ p, up, side, sy, s, gen, yaw, roll });
    };
    const kids = (q) => {
      if (q.gen >= 3 || pads.length >= want) return;
      const n = q.gen === 0 ? r.int(2, 3) : r.int(1, 3);
      for (let k = 0; k < n && pads.length < want; k++) {
        const e = n === 1 ? r.range(-0.4, 0.4) : -0.7 + (1.4 * k) / (n - 1) + r.range(-0.15, 0.15), s = q.s * r.range(0.82, 0.96);
        const at = [q.p[0] + q.up[0] * q.sy * 0.8 + q.side[0] * e * q.sy * 0.55, q.p[1] + q.up[1] * q.sy * 0.8 + q.side[1] * e * q.sy * 0.55, q.p[2] + q.up[2] * q.sy * 0.8 + q.side[2] * e * q.sy * 0.55];
        const yaw = q.yaw + r.range(-0.7, 0.7), roll = Math.max(-1.25, Math.min(1.25, q.roll * 0.5 + e * 0.9 + r.range(-0.2, 0.2)));
        const cr = Math.cos(roll), sr = Math.sin(roll), up = [-sr * Math.cos(yaw), cr, sr * Math.sin(yaw)], sy = 0.29 * s;
        const p = [at[0] + up[0] * sy * 0.82, at[1] + up[1] * sy * 0.82, at[2] + up[2] * sy * 0.82];
        if (p[1] < 0.15 || pads.some((o) => Math.hypot(o.p[0] - p[0], o.p[1] - p[1], o.p[2] - p[2]) < 0.16 * s)) continue;
        pad(p, yaw, roll, s, q.gen + 1);
        kids(pads[pads.length - 1]);
      }
    };
    for (let k = 0, nb = r.int(1, 2); k < nb; k++) { pad([k * r.range(0.25, 0.4), 0.27, k * r.range(-0.2, 0.2)], r.range(0, 6.28), r.range(-0.25, 0.25), 1.05, 0); kids(pads[pads.length - 1]); }
    for (const q of pads) if (q.gen >= 2 && r.chance(0.45)) for (let k = 0; k < r.int(1, 4); k++) {
      const e = r.range(-0.7, 0.7), t = [q.p[0] + q.up[0] * q.sy * 0.95 + q.side[0] * e * q.sy * 0.6, q.p[1] + q.up[1] * q.sy * 0.95 + q.side[1] * e * q.sy * 0.6, q.p[2] + q.up[2] * q.sy * 0.95 + q.side[2] * e * q.sy * 0.6];
      ellip(b, t[0], t[1] + 0.03, t[2], 0.035, 0.05, 0.035, fruit, 0, 0, 0, 10);
    }
    const top = Math.max(...pads.map((q) => q.p[1] + q.sy));
    return { h: top, r: 0.7 };
  };

  // ---------------------------------------------------------------- cholla: jointed, spiny segments on a short woody trunk
  SP.cholla = (b, c, r) => {
    const cc = col(r.pick([0xa4a862, 0x9a9e5a, 0xaeac6a]), 0.05, r), dead = col(0x6a5a44, 0.05, r);
    b.t('bark');
    const th = r.range(0.4, 0.75);
    tube(b, [[0, -0.05, 0], [r.range(-0.05, 0.05), th, r.range(-0.05, 0.05)]], [0.09, 0.07], col(0x5e5040, 0.05, r), { seg: 8 });
    b.t('cactus');
    const grow = (p, dir, n, depth) => {
      let q = p, d = dir;
      for (let i = 0; i < n; i++) {
        const L = r.range(0.14, 0.24), nd = [d[0] + r.range(-0.35, 0.35), d[1] + r.range(-0.1, 0.35), d[2] + r.range(-0.35, 0.35)], l = Math.hypot(...nd) || 1;
        d = nd.map((v) => v / l);
        const e = [q[0] + d[0] * L, q[1] + d[1] * L, q[2] + d[2] * L];
        rod(b, q, e, r.range(0.065, 0.085), depth === 0 && i === 0 ? cc.clone().offsetHSL(0, -0.1, -0.08) : cc.clone().offsetHSL(0, 0, r.range(-0.05, 0.05)), 8);
        if (depth < 2 && r.chance(0.45)) grow(e, [d[0] + r.range(-0.8, 0.8), d[1] * 0.6 + 0.3, d[2] + r.range(-0.8, 0.8)], r.int(1, 3), depth + 1);
        q = e;
      }
      if (r.chance(0.4)) ellip(b, q[0], q[1] + 0.05, q[2], 0.04, 0.05, 0.04, col(0xa8b468, 0.05, r), 0, 0, 0, 8); // fruit knob
    };
    const n = r.int(4, 7);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3); grow([0, th - r.range(0, 0.15), 0], [Math.cos(a) * 0.8, r.range(0.4, 0.9), Math.sin(a) * 0.8], r.int(2, 4), 0); }
    for (let k = 0; k < r.int(2, 5); k++) { const a = r.range(0, 6.28), d = r.range(0.2, 0.6); rod(b, [Math.cos(a) * d, 0.04, Math.sin(a) * d], [Math.cos(a) * d + 0.15, 0.05, Math.sin(a) * d + 0.08], 0.045, dead, 6); } // fallen joints
    return { h: th + 0.9, r: 0.7 };
  };

  // ---------------------------------------------------------------- agave: rosette of thick, keeled, spine-tipped leaves
  SP.agave = (b, c, r) => {
    b.t('cactus');
    const cc = col(r.pick([0x7f9a8a, 0x88a08e, 0x748f80, 0x8a9e7c]), 0.04, r), tipC = col(0x4a3a2a), n = r.int(18, 28), Lmax = r.range(0.7, 1.05);
    for (let i = 0; i < n; i++) {
      const t = i / n, a = i * 2.39996 + r.range(-0.05, 0.05), inner = 1 - t; // outer leaves first
      const elev = 0.35 + (1 - inner) * 0.9 + r.range(-0.08, 0.08), L = Lmax * (0.55 + 0.45 * inner) * r.range(0.9, 1.08), W = 0.11 * (0.7 + 0.5 * inner) * Lmax;
      const droop = inner * r.range(0.15, 0.4);
      leaf(b, a, elev, L, W, droop, cc.clone().offsetHSL(0, 0, (inner - 0.5) * -0.06 + r.range(-0.03, 0.03)), tipC);
    }
    rod(b, [0, 0.05, 0], [0, 0.42, 0], 0.07, cc.clone().offsetHSL(0, 0, 0.05), 8); // central bud
    return { h: Lmax * 0.85, r: Lmax * 0.8 };
  };
}

// one agave leaf: rises from the centre at `elev`, curving down by `droop`; concave top, keeled underside
function leaf(b, az, elev, L, W, droop, color, tipC) {
  const N = 8, pos = [], idx = [];
  const ca = Math.cos(az), sa = Math.sin(az);
  const C = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, e = elev - droop * s * s * 1.6, h = 0.05 + 0.04 * (1 - s);
    const prev = C[i - 1] || [0.06 * ca, h, 0.06 * sa];
    const step = i ? L / N : 0, pt = [prev[0] + ca * Math.cos(e) * step, prev[1] + Math.sin(e) * step, prev[2] + sa * Math.cos(e) * step];
    C.push(pt);
    const w = W * Math.min(1, 0.55 + s * 2.2) * Math.pow(1 - s, 0.85) + 0.004, th = w * 0.45;
    const side = [-sa, 0, ca], upv = [-ca * Math.sin(e), Math.cos(e), -sa * Math.sin(e)];
    const P = (u, v) => [pt[0] + side[0] * u + upv[0] * v, pt[1] + side[1] * u + upv[1] * v, pt[2] + side[2] * u + upv[2] * v];
    pos.push(...P(-w, th * 0.25), ...P(0, -th * 0.05), ...P(w, th * 0.25), ...P(0, -th)); // left, mid (concave top), right, keel
  }
  for (let i = 0; i < N; i++) {
    const a = i * 4, d = a + 4;
    const Lf = a, M = a + 1, R = a + 2, K = a + 3, Lf2 = d, M2 = d + 1, R2 = d + 2, K2 = d + 3;
    idx.push(Lf, M2, M, Lf, Lf2, M2, M, R2, R, M, M2, R2); // top
    idx.push(Lf, K, K2, Lf, K2, Lf2, K, R, R2, K, R2, K2); // underside
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(N / 2 * 4 + 1) < 0) { const I = g.index.array; for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); }
  addSmooth(b, g, null, color);
  const tip = C[N], pre = C[N - 1], d = [tip[0] - pre[0], tip[1] - pre[1], tip[2] - pre[2]], l = Math.hypot(...d) || 1;
  rod(b, tip, [tip[0] + (d[0] / l) * 0.05, tip[1] + (d[1] / l) * 0.05, tip[2] + (d[2] / l) * 0.05], 0.006, tipC, 5);
}

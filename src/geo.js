// 2D geometry on the ground plane (x, z). North = -Z.
// Rotation convention matches three.js Object3D.rotation.y (radians):
//   local (lx, lz) -> world (lx*cos + lz*sin, -lx*sin + lz*cos)
// A structure's FRONT is its local +Z side; facing direction in world = (sin r, cos r).

export function toWorld(lx, lz, r) {
  const c = Math.cos(r), s = Math.sin(r);
  return [lx * c + lz * s, -lx * s + lz * c];
}
export function toLocal(wx, wz, r) {
  const c = Math.cos(r), s = Math.sin(r);
  return [wx * c - wz * s, wx * s + wz * c];
}
export function facingAngle(dx, dz) { return Math.atan2(dx, dz); }

// Oriented box on the ground
export function obb(cx, cz, w, d, r) { return { cx, cz, w, d, r }; }
export function obbCorners(b) {
  const hw = b.w / 2, hd = b.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => {
    const [wx, wz] = toWorld(x, z, b.r);
    return [b.cx + wx, b.cz + wz];
  });
}
export function obbContains(b, x, z, pad = 0) {
  const [lx, lz] = toLocal(x - b.cx, z - b.cz, b.r);
  return Math.abs(lx) <= b.w / 2 + pad && Math.abs(lz) <= b.d / 2 + pad;
}
// signed-ish distance outside the box (0 inside)
export function obbDist(b, x, z) {
  const [lx, lz] = toLocal(x - b.cx, z - b.cz, b.r);
  const dx = Math.max(Math.abs(lx) - b.w / 2, 0);
  const dz = Math.max(Math.abs(lz) - b.d / 2, 0);
  return Math.hypot(dx, dz);
}
function project(poly, ax, az) {
  let mn = Infinity, mx = -Infinity;
  for (const [x, z] of poly) { const p = x * ax + z * az; if (p < mn) mn = p; if (p > mx) mx = p; }
  return [mn, mx];
}
export function obbOverlap(a, b, pad = 0) {
  const A = obbCorners({ ...a, w: a.w + pad * 2, d: a.d + pad * 2 });
  const B = obbCorners(b);
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % 4];
      const ax = -(z2 - z1), az = x2 - x1;
      const [a0, a1] = project(A, ax, az), [b0, b1] = project(B, ax, az);
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function polyBounds(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { x0, z0, x1, z1 };
}
export function polyCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

// distance from point to segment, returns {d, t}
export function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz || 1e-9;
  let t = ((px - ax) * vx + (pz - az) * vz) / L2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + vx * t, qz = az + vz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, qx, qz };
}

// Catmull-Rom resample of a polyline into evenly spaced samples.
// Returns [{x, z, tx, tz, s}] with unit tangent and arc length.
export function samplePath(pts, spacing = 2, smoothPath = true) {
  if (pts.length < 2) return [];
  const dense = [];
  if (smoothPath && pts.length > 2) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const n = 16;
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    dense.push(pts[pts.length - 1]);
  } else {
    dense.push(...pts);
  }
  // arc-length resample
  const out = [];
  let acc = 0, next = 0;
  for (let i = 0; i < dense.length - 1; i++) {
    const [ax, az] = dense[i], [bx, bz] = dense[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    while (next <= acc + L) {
      const t = (next - acc) / L;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, s: next });
      next += spacing;
    }
    acc += L;
  }
  const last = dense[dense.length - 1], pl = dense[dense.length - 2];
  const L = Math.hypot(last[0] - pl[0], last[1] - pl[1]) || 1;
  if (!out.length || acc - out[out.length - 1].s > spacing * 0.3)
    out.push({ x: last[0], z: last[1], tx: (last[0] - pl[0]) / L, tz: (last[1] - pl[1]) / L, s: acc });
  return out;
}

// nearest point on a sampled path
export function nearestOnSamples(samples, x, z) {
  let best = { d: Infinity, i: 0, qx: 0, qz: 0, t: 0 };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    const r = segDist(x, z, a.x, a.z, b.x, b.z);
    if (r.d < best.d) best = { d: r.d, i, qx: r.qx, qz: r.qz, t: r.t };
  }
  const a = samples[best.i], b = samples[Math.min(best.i + 1, samples.length - 1)];
  best.s = a.s + (b.s - a.s) * best.t;
  best.tx = a.tx; best.tz = a.tz;
  // side: + = left of travel direction
  best.side = Math.sign((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x));
  return best;
}

export function pathLength(samples) { return samples.length ? samples[samples.length - 1].s : 0; }
export function sampleAt(samples, s) {
  if (!samples.length) return null;
  s = Math.max(0, Math.min(s, samples[samples.length - 1].s));
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s <= s) lo = m; else hi = m; }
  const a = samples[lo], b = samples[hi];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz, s };
}

// Spatial index over a sampled path so "nearest point within maxD" is cheap.
const GRID = 6;
function gridOf(samples) {
  if (samples._grid) return samples._grid;
  const g = new Map();
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1];
    const x0 = Math.floor(Math.min(a.x, b.x) / GRID), x1 = Math.floor(Math.max(a.x, b.x) / GRID);
    const z0 = Math.floor(Math.min(a.z, b.z) / GRID), z1 = Math.floor(Math.max(a.z, b.z) / GRID);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const k = gx * 100003 + gz;
      let arr = g.get(k);
      if (!arr) g.set(k, (arr = []));
      arr.push(i);
    }
  }
  Object.defineProperty(samples, '_grid', { value: g, enumerable: false });
  return g;
}
// like nearestOnSamples but returns null when nothing is within maxD
export function nearestWithin(samples, x, z, maxD) {
  if (samples.length < 2) return null;
  const g = gridOf(samples);
  const r = Math.ceil(maxD / GRID);
  const cx = Math.floor(x / GRID), cz = Math.floor(z / GRID);
  let best = null, bd = maxD;
  const seen = new Set();
  for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
    const arr = g.get(gx * 100003 + gz);
    if (!arr) continue;
    for (const i of arr) {
      if (seen.has(i)) continue;
      seen.add(i);
      const a = samples[i], b = samples[i + 1];
      const q = segDist(x, z, a.x, a.z, b.x, b.z);
      if (q.d <= bd) { bd = q.d; best = { d: q.d, i, qx: q.qx, qz: q.qz, t: q.t }; }
    }
  }
  if (!best) return null;
  const a = samples[best.i], b = samples[best.i + 1];
  best.s = a.s + (b.s - a.s) * best.t;
  best.tx = a.tx; best.tz = a.tz;
  best.side = Math.sign((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x));
  return best;
}

// occupancy grid over the map (0.5 m cells)
export class Raster {
  constructor(W, D, res = 0.5) {
    this.W = W; this.D = D; this.res = res;
    this.nx = Math.ceil(W / res); this.nz = Math.ceil(D / res);
    this.a = new Uint8Array(this.nx * this.nz);
  }
  idx(x, z) {
    const i = Math.floor((x + this.W / 2) / this.res), j = Math.floor((z + this.D / 2) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  fill(x0, z0, x1, z1, test) {
    if (this.clip) { x0 = Math.max(x0, this.clip[0]); z0 = Math.max(z0, this.clip[1]); x1 = Math.min(x1, this.clip[2]); z1 = Math.min(z1, this.clip[3]); if (x1 < x0 || z1 < z0) return; }
    for (let z = Math.max(z0, -this.D / 2); z <= Math.min(z1, this.D / 2); z += this.res)
      for (let x = Math.max(x0, -this.W / 2); x <= Math.min(x1, this.W / 2); x += this.res) {
        if (test(x, z)) { const k = this.idx(x, z); if (k >= 0) this.a[k] = 1; }
      }
  }
  circle(cx, cz, r) { this.fill(cx - r, cz - r, cx + r, cz + r, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r); }
  obb(b, pad = 0) {
    const R = Math.hypot(b.w, b.d) / 2 + pad;
    const c = Math.cos(b.r), s = Math.sin(b.r);
    this.fill(b.cx - R, b.cz - R, b.cx + R, b.cz + R, (x, z) => {
      const dx = x - b.cx, dz = z - b.cz;
      return Math.abs(dx * c - dz * s) <= b.w / 2 + pad && Math.abs(dx * s + dz * c) <= b.d / 2 + pad;
    });
  }
  path(samples, hw) {
    const c = this.clip;
    for (const s of samples) {
      if (c && (s.x + hw < c[0] || s.x - hw > c[2] || s.z + hw < c[1] || s.z - hw > c[3])) continue;
      if (Math.abs(s.x) < this.W / 2 + hw && Math.abs(s.z) < this.D / 2 + hw) this.circle(s.x, s.z, hw);
    }
  }
  // editor: clear a box (cells whose sample point lies in it); later stamps are clipped to this.clip
  clearBox(b) {
    for (let z = Math.max(b[1], -this.D / 2); z <= Math.min(b[3], this.D / 2); z += this.res)
      for (let x = Math.max(b[0], -this.W / 2); x <= Math.min(b[2], this.W / 2); x += this.res) { const k = this.idx(x, z); if (k >= 0) this.a[k] = 0; }
  }
  poly(poly) {
    const bb = polyBounds(poly);
    this.fill(bb.x0, bb.z0, bb.x1, bb.z1, (x, z) => pointInPoly(x, z, poly));
  }
  test(x, z, r = 0) {
    const n = Math.ceil(r / this.res);
    const i0 = Math.floor((x + this.W / 2) / this.res), j0 = Math.floor((z + this.D / 2) / this.res);
    for (let j = j0 - n; j <= j0 + n; j++) for (let i = i0 - n; i <= i0 + n; i++) {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      if (this.a[j * this.nx + i]) return true;
    }
    return false;
  }
}


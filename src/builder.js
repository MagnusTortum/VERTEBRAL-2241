// Low-poly mesh accumulator. Non-indexed, flat normals, vertex colours (albedo), texture layer per
// vertex, box-projected UVs in the face's own plane, optional tessellation (so baked lighting has
// enough vertices). Channels: 'main' (opaque), 'glass' (windows; per-window random in `win`),
// 'emit' (self-lit: screens, neon, flames).
import * as THREE from 'three';
import { layerOf, LAYER_SCALE } from './layers.js';
import { leafUV } from './textures.js';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const cache = new Map();

function tmpl(key, make) {
  let g = cache.get(key);
  if (!g) { g = make(); if (g.index) g = g.toNonIndexed(); cache.set(key, g); }
  return g;
}

export function col(hex, jitter = 0, rng = null) {
  _c.set(hex);
  if (jitter && rng) {
    const j = (rng.next() - 0.5) * 2 * jitter;
    _c.offsetHSL((rng.next() - 0.5) * jitter * 0.15, (rng.next() - 0.5) * jitter * 0.5, j);
  }
  return _c.clone();
}

export class Builder {
  constructor() {
    this.channels = {};
    this.layer = 0;
    this.winv = -1;
    this.smooth = false; // true: geometry from addGeom keeps its own (smooth) vertex normals
    this.orient = 0;
    this.center = [0, 1.5, 0];
    this.ch('main');
    this.stack = [new THREE.Matrix4()];
  }
  ch(name) {
    if (!this.channels[name]) this.channels[name] = { pos: [], col: [], lay: [], win: [], ori: [], ctr: [], sm: [], vn: [] };
    this.cur = this.channels[name];
    return this;
  }
  t(name) { this.layer = typeof name === 'number' ? name : layerOf(name); return this; }
  w(r) { this.winv = r; return this; }
  sm(on = true) { this.smooth = on; return this; }
  setCenter(x, y, z) { _v.set(x, y, z).applyMatrix4(this.M); this.center = [_v.x, _v.y, _v.z]; return this; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(m) { this.stack.push(this.M.clone().multiply(m)); return this; }
  pushT(x, y, z, ry = 0, s = 1) {
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    return this.push(_m.clone());
  }
  pop() { this.stack.pop(); return this; }

  _color(c) { return c instanceof THREE.Color ? c : new THREE.Color(c); }
  _pushV(x, y, z, c) {
    const C = this.cur;
    // paint wear (bakedMaterial): main-channel geometry with no window id carries -2 - mat - wear*0.9
    const wv = this.wear && this.winv < 0 && C === this.channels.main ? -2 - (this.wearMat || 0) - Math.min(0.9, this.wear * 0.9) : this.winv;
    C.pos.push(x, y, z); C.col.push(c.r, c.g, c.b); C.lay.push(this.layer); C.win.push(wv);
  }

  addGeom(g, m, color) {
    const c = this._color(color);
    const full = this.M.clone().multiply(m);
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      _v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(full);
      this._pushV(_v.x, _v.y, _v.z, c);
    }
    const nm = this.smooth && g.attributes.normal ? g.attributes.normal.array : null;
    if (nm) {
      const R = new THREE.Matrix3().getNormalMatrix(full);
      for (let i = 0; i < nm.length; i += 3) { _v.set(nm[i], nm[i + 1], nm[i + 2]).applyMatrix3(R).normalize(); this.cur.vn.push(_v.x, _v.y, _v.z); }
    } else for (let i = 0; i < p.length; i++) this.cur.vn.push(0);
    for (let i = 0; i < p.length / 9; i++) { this.cur.ori.push(0); this.cur.ctr.push(0, 0, 0); this.cur.sm.push(nm ? 1 : 0); }
    return this;
  }
  box(x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) {
    const g = tmpl('box', () => new THREE.BoxGeometry(1, 1, 1));
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    return this.addGeom(g, _m, color);
  }
  boxB(x, y, z, sx, sy, sz, color, ry = 0) { return this.box(x, y + sy / 2, z, sx, sy, sz, color, ry); }
  cyl(x, y, z, rTop, rBot, h, seg, color, rx = 0, ry = 0, rz = 0) {
    { const R = Math.max(rTop, rBot); seg = Math.min(seg, R > 2 ? 20 : R > 0.6 ? 14 : R > 0.2 ? 10 : 8); } // polygon budget
    const key = `cyl${rTop.toFixed(3)}_${rBot.toFixed(3)}_${seg}`;
    const g = tmpl(key, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1));
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, h, 1));
    return this.addGeom(g, _m, color);
  }
  beam(a, b, r, seg, color) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A); const L = dir.length();
    if (L < 1e-5) return this;
    const g = tmpl(`beam${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    _m.compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, L, r));
    return this.addGeom(g, _m, color);
  }
  plank(a, b, w, h, color, roll = 0) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A); const L = dir.length();
    if (L < 1e-5) return this;
    const g = tmpl('box', () => new THREE.BoxGeometry(1, 1, 1));
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.asin(dir.y / L);
    _m.compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), new THREE.Vector3(w, h, L));
    return this.addGeom(g, _m, color);
  }
  blob(x, y, z, sx, sy, sz, color, kind = 'ico', ry = 0) {
    const g = tmpl(kind, () => kind === 'ico' ? new THREE.IcosahedronGeometry(1, 0)
      : kind === 'dodec' ? new THREE.DodecahedronGeometry(1, 0)
      : kind === 'oct' ? new THREE.OctahedronGeometry(1, 0)
      : new THREE.TetrahedronGeometry(1, 0));
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
    return this.addGeom(g, _m, color);
  }
  cone(x, y, z, r, h, seg, color, rx = 0, ry = 0, rz = 0) {
    const g = tmpl(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg, 1));
    _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(r, h, r));
    return this.addGeom(g, _m, color);
  }
  // free triangles: orientation of the normal is fixed in build() (up for flat-ish faces,
  // outward from the current centre hint for steep ones)
  tri(a, b, c, color) {
    const cc = this._color(color);
    for (const p of [a, b, c]) {
      _v.set(p[0], p[1], p[2]).applyMatrix4(this.M);
      this._pushV(_v.x, _v.y, _v.z, cc);
    }
    this.cur.ori.push(1); this.cur.ctr.push(...this.center); this.cur.sm.push(0); this.cur.vn.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
    return this;
  }
  // triangle with its own vertex normals (smooth surfaces); winding is taken as given
  triN(a, b, c, na, nb, nc, color) {
    const cc = this._color(color), R = new THREE.Matrix3().getNormalMatrix(this.M);
    for (const p of [a, b, c]) { _v.set(p[0], p[1], p[2]).applyMatrix4(this.M); this._pushV(_v.x, _v.y, _v.z, cc); }
    for (const n of [na, nb, nc]) { _v.set(n[0], n[1], n[2]).applyMatrix3(R).normalize(); this.cur.vn.push(_v.x, _v.y, _v.z); }
    this.cur.ori.push(0); this.cur.ctr.push(0, 0, 0); this.cur.sm.push(1);
    return this;
  }
  quadN(a, b, c, d, na, nb, nc, nd, color) { this.triN(a, b, c, na, nb, nc, color); return this.triN(a, c, d, na, nc, nd, color); }
  // smooth vertical band along a 2D path (x, z) between y0 and y1; normals = outward (left of travel when out = 1)
  band(path, y0, y1, color, out = 1, closed = false) {
    const P = closed ? [...path, path[0]] : path, n = P.length;
    const N = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; if (closed && (i === 0 || i === n - 1)) { const q = P[n - 2], r = P[1]; tx = r[0] - q[0]; tz = r[1] - q[1]; } const l = Math.hypot(tx, tz) || 1; return [(tz / l) * out, 0, (-tx / l) * out]; });
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (out > 0) this.quadN([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], N[i + 1], N[i], N[i], N[i + 1], color);
      else this.quadN([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], N[i], N[i + 1], N[i + 1], N[i], color);
    }
    return this;
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); return this.tri(a, c, d, color); }
  poly(pts, color) {
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], color);
    return this;
  }
  extrude(poly, y0, y1, color, capColor = null, convexCap = true) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      this.quad([x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1], color);
    }
    if (capColor !== false && convexCap) this.poly(poly.map(([x, z]) => [x, y1, z]), capColor ?? color);
    return this;
  }

  // ---- leaf cards: alpha-tested foliage in its own 'leaf' output (never solid geometry for leaves).
  // cell: 0..15 small-plant atlas, 16..31 tree atlas (see textures.leafUV). Normals point out from a
  // fake sphere round `ctr` (so a clump shades round, GTA-SA style).
  leafQuad(p, cell, tint, ctr, vr = [0, 1], up = 0.3) {
    const L = (this.leaves ||= { P: [], N: [], UV: [], C: [] });
    const [u0, v0, s] = leafUV(cell), c = this._color(tint ?? 0xffffff);
    const W = p.map((q) => { _v.set(q[0], q[1], q[2]).applyMatrix4(this.M); return [_v.x, _v.y, _v.z]; });
    _v.set(ctr[0], ctr[1], ctr[2]).applyMatrix4(this.M); const cc = [_v.x, _v.y, _v.z];
    const uvs = [[u0, v0 + s * vr[0]], [u0 + s, v0 + s * vr[0]], [u0 + s, v0 + s * vr[1]], [u0, v0 + s * vr[1]]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = W[i]; L.P.push(...q);
      const n = [q[0] - cc[0], q[1] - cc[1] + up, q[2] - cc[2]], l = Math.hypot(...n) || 1;
      L.N.push(n[0] / l, n[1] / l, n[2] / l); L.UV.push(...uvs[i]); L.C.push(c.r, c.g, c.b);
    }
    return this;
  }
  // upright card standing on (x, y, z), w wide, h tall, facing yaw
  leafCard(x, y, z, w, h, yaw, cell, tint, ctr = null, lean = 0) {
    const cx = Math.cos(yaw) * w / 2, cz = -Math.sin(yaw) * w / 2, lx = Math.sin(yaw) * lean, lz = Math.cos(yaw) * lean;
    return this.leafQuad([[x - cx, y, z - cz], [x + cx, y, z + cz], [x + cx + lx, y + h, z + cz + lz], [x - cx + lx, y + h, z - cz + lz]], cell, tint, ctr || [x, y + h * 0.35, z]);
  }
  // n crossed upright cards (a plant seen from anywhere) + optionally a flat top card
  leafCross(x, y, z, w, h, cell, tint, n = 3, yaw0 = 0, top = false) {
    const ctr = [x, y + h * 0.4, z];
    for (let k = 0; k < n; k++) this.leafCard(x, y, z, w, h, yaw0 + (k * Math.PI) / n, cell, tint, ctr);
    if (top) this.leafFlat(x, y + h * 0.75, z, w * 0.85, cell, tint, yaw0, ctr);
    return this;
  }
  leafFlat(x, y, z, w, cell, tint, yaw = 0, ctr = null) {
    const cs = Math.cos(yaw) * w / 2, sn = Math.sin(yaw) * w / 2;
    return this.leafQuad([[x - cs + sn, y, z - sn - cs], [x + cs + sn, y, z + sn - cs], [x + cs - sn, y, z + sn + cs], [x - cs - sn, y, z - sn + cs]], cell, tint, ctr || [x, y - w * 0.3, z], [0, 1], 0.6);
  }

  isEmpty() { return Object.values(this.channels).every((c) => !c.pos.length) && !this.leaves?.P.length; }

  // opts.maxEdge: split triangles until no edge is longer (for per-vertex baked light)
  build(opts = {}) {
    const out = {};
    const maxEdge = opts.maxEdge || 0;
    for (const [name, c] of Object.entries(this.channels)) {
      if (!c.pos.length) continue;
      const P = [], C = [], L = [], W = [], N = [], UV = [];
      const nTri = c.pos.length / 9;
      const emit = (a, b, d, ci, li, wi, n, vn) => {
        // UV basis in the face plane
        let ux, uy, uz, vx, vy, vz;
        if (Math.abs(n[1]) > 0.985) { ux = 1; uy = 0; uz = 0; vx = 0; vy = 0; vz = 1; }
        else {
          ux = n[2]; uy = 0; uz = -n[0];
          const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
          vx = n[1] * uz - n[2] * uy; vy = n[2] * ux - n[0] * uz; vz = n[0] * uy - n[1] * ux;
          if (vy < 0) { vx = -vx; vy = -vy; vz = -vz; }
        }
        const s = 1 / (LAYER_SCALE[li] || 2);
        [a, b, d].forEach((p, k) => {
          const nn = vn ? vn[k] : n;
          P.push(p[0], p[1], p[2]); C.push(ci[0], ci[1], ci[2]); L.push(li); W.push(wi); N.push(nn[0], nn[1], nn[2]);
          UV.push((p[0] * ux + p[1] * uy + p[2] * uz) * s, (p[0] * vx + p[1] * vy + p[2] * vz) * s);
        });
      };
      const nmid = (p, q) => { const m = [p[0] + q[0], p[1] + q[1], p[2] + q[2]], l = Math.hypot(m[0], m[1], m[2]) || 1; return [m[0] / l, m[1] / l, m[2] / l]; };
      const split = (a, b, d, ci, li, wi, n, depth, vn) => {
        if (maxEdge && depth < 7 && triArea(a, b, d) > maxEdge * maxEdge * 0.35) {
          const e0 = dist(a, b), e1 = dist(b, d), e2 = dist(d, a);
          const m = Math.max(e0, e1, e2);
          if (m > maxEdge) {
            const [na, nb, nd] = vn || [];
            if (m === e0) { const q = mid(a, b), nq = vn && nmid(na, nb); split(a, q, d, ci, li, wi, n, depth + 1, vn && [na, nq, nd]); split(q, b, d, ci, li, wi, n, depth + 1, vn && [nq, nb, nd]); }
            else if (m === e1) { const q = mid(b, d), nq = vn && nmid(nb, nd); split(a, b, q, ci, li, wi, n, depth + 1, vn && [na, nb, nq]); split(a, q, d, ci, li, wi, n, depth + 1, vn && [na, nq, nd]); }
            else { const q = mid(d, a), nq = vn && nmid(nd, na); split(a, b, q, ci, li, wi, n, depth + 1, vn && [na, nb, nq]); split(q, b, d, ci, li, wi, n, depth + 1, vn && [nq, nb, nd]); }
            return;
          }
        }
        emit(a, b, d, ci, li, wi, n, vn);
      };
      for (let t = 0; t < nTri; t++) {
        const k = t * 9, kc = t * 3;
        const a = [c.pos[k], c.pos[k + 1], c.pos[k + 2]], b = [c.pos[k + 3], c.pos[k + 4], c.pos[k + 5]], d = [c.pos[k + 6], c.pos[k + 7], c.pos[k + 8]];
        let n = cross(sub(b, a), sub(d, a));
        const nl = Math.hypot(n[0], n[1], n[2]);
        if (nl < 1e-10) continue;
        n = [n[0] / nl, n[1] / nl, n[2] / nl];
        // faces pointing straight down at/under ground level are never seen
        if (!c.ori[t] && opts.cullDown !== false && n[1] < -0.9 && (a[1] + b[1] + d[1]) / 3 < 0.5) continue;
        let A = a, B = b, D = d;
        if (c.ori[t]) {
          let flip = false;
          if (Math.abs(n[1]) > 0.5) flip = n[1] < 0;
          else {
            const ctr = [c.ctr[kc], c.ctr[kc + 1], c.ctr[kc + 2]];
            const fc = [(a[0] + b[0] + d[0]) / 3 - ctr[0], 0, (a[2] + b[2] + d[2]) / 3 - ctr[2]];
            flip = n[0] * fc[0] + n[2] * fc[2] < 0;
          }
          if (flip) { n = [-n[0], -n[1], -n[2]]; B = d; D = b; }
        }
        const v0 = t * 3;
        const vn = c.sm[t] ? [0, 1, 2].map((j) => [c.vn[k + j * 3], c.vn[k + j * 3 + 1], c.vn[k + j * 3 + 2]]) : null;
        split(A, B, D, [c.col[v0 * 3], c.col[v0 * 3 + 1], c.col[v0 * 3 + 2]], c.lay[v0], c.win[v0], n, 0, vn);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      g.setAttribute('layer', new THREE.Float32BufferAttribute(L, 1));
      g.setAttribute('win', new THREE.Float32BufferAttribute(W, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out[name] = g;
    }
    if (this.leaves?.P.length) {
      const L = this.leaves, g = new THREE.BufferGeometry(), n = L.P.length / 3;
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.C, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.UV, 2));
      g.setAttribute('layer', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('win', new THREE.Float32BufferAttribute(new Float32Array(n).fill(-1), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out.leaf = g;
    }
    return out;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const triArea = (a, b, c) => { const u = sub(b, a), v = sub(c, a), w = cross(u, v); return 0.5 * Math.hypot(w[0], w[1], w[2]); };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

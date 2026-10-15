// Smooth-shaded shape helpers for props and plants (all go through Builder with vertex normals).
import * as THREE from 'three';

const cache = new Map();
const cached = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const mat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
// indexed geometry -> smooth vertex normals -> non-indexed, added to the builder
export function addSmooth(b, g, m, color) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.index ? g.toNonIndexed() : g;
  return b.sm().addGeom(n, m || new THREE.Matrix4(), color).sm(false);
}
const smoothNI = (g) => { g.computeVertexNormals(); return g.index ? g.toNonIndexed() : g; };

// ellipsoid
export function ellip(b, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0, seg = 16) {
  seg = Math.min(seg, Math.max(sx, sy, sz) > 1.5 ? 14 : 10); // polygon budget: early-2000s + ~30%
  const g = cached(`sph${seg}`, () => smoothNI(new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.6)))));
  return b.sm().addGeom(g, mat(x, y, z, rx, ry, rz, sx, sy, sz), color).sm(false);
}
// rounded rod between two points (capsule)
export function rod(b, a, c, r, color, seg = 10) {
  seg = Math.min(seg, r > 0.15 ? 10 : 7);
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...c), d = B.clone().sub(A), L = d.length();
  if (L < 1e-4) return b;
  const g = cached(`cap${seg}`, () => smoothNI(new THREE.CapsuleGeometry(1, 1, 4, seg)));
  // capsule of radius 1, body length 1: scale x/z by r, y so that body + caps = L + 2r around the segment
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(r, Math.max(1e-3, L), r));
  // keep the caps round: build the body + two hemispheres separately when the rod is long
  if (L > r * 0.5) {
    const body = cached(`cylo${seg}`, () => smoothNI(new THREE.CylinderGeometry(1, 1, 1, seg, 1, true)));
    b.sm().addGeom(body, m, color);
    const hemi = cached(`hemi${seg}`, () => smoothNI(new THREE.SphereGeometry(1, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2)));
    const P = new THREE.Vector3(...c), Q = new THREE.Vector3(...a);
    b.addGeom(hemi, new THREE.Matrix4().compose(P, q, new THREE.Vector3(r, r, r)), color);
    const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
    b.addGeom(hemi, new THREE.Matrix4().compose(Q, q2, new THREE.Vector3(r, r, r)), color);
    return b.sm(false);
  }
  return b.sm().addGeom(g, m, color).sm(false);
}
// lathe: profile [[r, y], ...] bottom to top, revolved about +Y
export function lathe(b, profile, color, x = 0, y = 0, z = 0, seg = 24, key = null) {
  { const R = Math.max(...profile.map((q) => q[0])); seg = Math.min(seg, R > 3 ? 20 : R > 1 ? 14 : 10); }
  const make = () => smoothNI(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(0, r), h)), seg));
  const g = key ? cached(`lathe:${key}:${seg}`, make) : make();
  return b.sm().addGeom(g, mat(x, y, z), color).sm(false);
}
// smooth ring (torus) lying flat; arc from angle a0
export function ring(b, x, y, z, R, r, color, arc = Math.PI * 2, a0 = 0, seg = 32) {
  seg = Math.min(seg, R > 1 ? 18 : 12);
  const g = cached(`tor${R.toFixed(3)}_${r.toFixed(3)}_${arc.toFixed(3)}_${seg}`, () => new THREE.TorusGeometry(R, r, 6, seg, arc).toNonIndexed());
  return b.sm().addGeom(g, mat(x, y, z, Math.PI / 2, -a0, 0), color).sm(false);
}

// tube along a 3D path with per-point radius; ribs > 0 gives a fluted (cactus) section; cap: round top
export function tube(b, pts, radii, color, { ribs = 0, ribDepth = 0.08, seg = 0, cap = true, base = false } = {}) {
  const S = Math.min(seg || (ribs ? ribs * 4 : 12), ribs ? 32 : 12);
  const P = pts.map((p) => new THREE.Vector3(...p));
  const R = [...radii];
  if (cap) { // dome over the last point
    const n = P.length, t = P[n - 1].clone().sub(P[n - 2]).normalize(), r0 = R[n - 1];
    for (let k = 1; k <= 4; k++) { const ph = (k / 4) * (Math.PI / 2); P.push(P[n - 1].clone().addScaledVector(t, Math.sin(ph) * r0 * 0.85)); R.push(Math.max(0.002, Math.cos(ph) * r0)); }
  }
  const N = P.length, pos = [], idx = [];
  let nrm = null;
  for (let i = 0; i < N; i++) {
    const t = (i < N - 1 ? P[i + 1].clone().sub(P[i]) : P[i].clone().sub(P[i - 1])).normalize();
    if (!nrm) { nrm = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); }
    nrm = nrm.clone().sub(t.clone().multiplyScalar(nrm.dot(t))).normalize(); // parallel transport
    const bn = t.clone().cross(nrm).normalize();
    for (let j = 0; j <= S; j++) {
      const a = (j / S) * Math.PI * 2;
      const rr = R[i] * (ribs ? 1 - ribDepth + ribDepth * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 0.6) : 1);
      const v = P[i].clone().addScaledVector(nrm, Math.cos(a) * rr).addScaledVector(bn, Math.sin(a) * rr);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < S; j++) {
    const a = i * (S + 1) + j, c = a + S + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  // the seam column (j = 0 and j = S) shares positions: average its normals so no crease shows
  const nr = g.attributes.normal;
  for (let i = 0; i < N; i++) { const a = i * (S + 1), c = a + S; const x = nr.getX(a) + nr.getX(c), y = nr.getY(a) + nr.getY(c), z = nr.getZ(a) + nr.getZ(c), l = Math.hypot(x, y, z) || 1; nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(c, x / l, y / l, z / l); }
  return b.sm().addGeom(g.toNonIndexed(), new THREE.Matrix4(), color).sm(false);
}

// deformed boulder: icosphere pushed about by noise, flattened underneath; smooth-ish normals
export function rockGeo(rng, detail = 2, flat = 0.35) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  const f = [0, 1, 2].map(() => [rng.range(1, 2.4), rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)]);
  const facet = [0, 1, 2, 3, 4].map(() => new THREE.Vector3(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize());
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1;
    for (const [fr, a, b2, c] of f) k += 0.09 * Math.sin(v.x * fr * 3 + a) * Math.sin(v.y * fr * 3 + b2) * Math.sin(v.z * fr * 3 + c);
    for (const n of facet) { const d = v.dot(n); if (d > 0.78) k -= (d - 0.78) * 0.9; } // planar breaks: weathered faces
    v.multiplyScalar(k);
    if (v.y < -flat) v.y = -flat + (v.y + flat) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // merge duplicate vertices so normals come out smooth, then re-flatten to non-indexed
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const m = mergeByPos(g);
  m.computeVertexNormals();
  return m.toNonIndexed();
}
function mergeByPos(g) {
  const p = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j == null) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx);
  return out;
}
export function rock(b, rng, x, y, z, sx, sy, sz, color, ry = 0, detail = 2) {
  return b.sm().addGeom(rockGeo(rng, detail), mat(x, y, z, 0, ry, 0, sx, sy, sz), color).sm(false);
}

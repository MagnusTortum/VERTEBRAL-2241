// Light baking. One top-down height capture of everything static (GPU), then per time-of-day preset:
//  - terrain lightmap (texel = ~0.25 m): sky × AO + sun × N·L × shadow + bounce + point lights
//  - per-vertex light for buildings/props/fences/roads/signs (meshes are tessellated for this)
//  - per-instance light for vegetation (sun visibility separate so the shader can shade leaves)
// Shadows / occlusion are ray-marched through the height capture. Results are cached per preset.
import * as THREE from 'three';
const ABORT = Symbol('abort');
// the region re-light takes a small slice of each frame while the user is dragging / orbiting / zooming, a big one otherwise
let _busy = false, _wheelT = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => { _busy = true; }, true);
  window.addEventListener('pointerup', () => { _busy = false; }, true);
  window.addEventListener('wheel', () => { _wheelT = performance.now(); }, { capture: true, passive: true });
}
const sliceMs = () => (_busy || performance.now() - _wheelT < 400 ? 8 : 26);
import { heightMaterial, U } from './materials.js';
import { sunDir } from './presets.js';

const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);
const AO_D = [0.5, 1.1, 2.2, 4.2, 8];
const AO_K = 0.72;      // AO strength (was 0.95, then 0.57)
const COVER_K = 0.7;    // darkening under roofs / porches (was 0.5)

export class Baker {
  constructor(renderer, world) {
    this.r = renderer;
    this.world = world;
    this.cache = {};
  }

  // ------------------------------------------------------------------ height capture
  capture() {
    const w = this.world, T = w.terrain;
    const pad = 10;
    const x0 = -T.W / 2 - pad, x1 = T.W / 2 + pad, z0 = -T.D / 2 - pad, z1 = T.D / 2 + pad;
    const res = Math.max(0.22, Math.max(x1 - x0, z1 - z0) / 1100);
    const Nx = Math.round((x1 - x0) / res), Nz = Math.round((z1 - z0) / res);
    this.rect = { x0, z0, x1, z1, Nx, Nz, rx: (x1 - x0) / Nx, rz: (z1 - z0) / Nz };
    const box = new THREE.Box3();
    w.group.traverse((o) => { if (o.isMesh && !o.userData.noBake && !o.userData.terrain) { o.updateMatrixWorld(); const b = new THREE.Box3().setFromObject(o); if (isFinite(b.max.y)) box.union(b); } });
    // headroom so things added later in the editor still fit the height encoding
    this.hMin = T.minH - 8; this.hMax = Math.max(T.maxH, box.max.y || T.maxH) + 14;
    this.H = new Float32Array(Nx * Nz); this.G = new Float32Array(Nx * Nz); this.HO = new Float32Array(Nx * Nz);
    const t0 = performance.now();
    this._captureBox(0, Nx - 1, 0, Nz - 1);
    const t1 = performance.now();
    this.computeTexels();
    const t2 = performance.now();
    this.computeVertexAO();
    console.log(`[bake] capture ${Nx}x${Nz} ${Math.round(t1 - t0)}ms  texels ${Math.round(t2 - t1)}ms  vertexAO ${Math.round(performance.now() - t2)}ms  verts ${this.meshes.reduce((a, m) => a + m.ao.length, 0)}  inst ${this.inst.reduce((a, m) => a + m.count, 0)}`);
  }

  // GPU height captures of texels [i0..i1] x [j0..j1]: top surface (H), underside gaps (G), occluders (HO)
  _captureBox(i0, i1, j0, j1, region = false) {
    const tq = performance.now();
    const w = this.world, T = w.terrain, R = this.rect;
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
    const xa = R.x0 + i0 * R.rx, xb = R.x0 + (i1 + 1) * R.rx, za = R.z0 + j0 * R.rz, zb = R.z0 + (j1 + 1) * R.rz;
    const { hMin, hMax } = this;
    const [matSolid, matCards] = this._hmats();
    const cam = new THREE.OrthographicCamera(xa, xb, -za, -zb, 0.1, hMax - hMin + 20);
    cam.position.set(0, hMax + 5, 0); cam.up.set(0, 0, -1); cam.lookAt(0, hMin, 0); cam.updateMatrixWorld();
    // one full-size target for the baker's life; regions render into its corner (a new target per
    // region size is very slow to read back on some GPUs / drivers)
    if (!this._rt || this._rt.width !== R.Nx || this._rt.height !== R.Nz) { this._rt?.dispose(); this._rt = new THREE.WebGLRenderTarget(R.Nx, R.Nz, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }); }
    const rt = this._rt;
    rt.viewport.set(0, 0, ni, nj); rt.scissor.set(0, 0, ni, nj); rt.scissorTest = true;
    const swaps = [];
    // region mode (editor): skip the terrain (merged in from the height field below), vegetation and
    // anything outside the box — only the few meshes near the edit are drawn
    const sph = new THREE.Sphere();
    const outside = (o) => {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      return sph.center.x + sph.radius < xa || sph.center.x - sph.radius > xb || sph.center.z + sph.radius < za || sph.center.z - sph.radius > zb;
    };
    w.group.updateMatrixWorld(true);
    w.group.traverse((o) => {
      if (!o.isMesh) return;
      swaps.push([o, o.material, o.visible]);
      if (o.userData.noBake || o.userData.isPart || o.userData.noShadow) { o.visible = false; return; }
      if (region && (o.userData.terrain || o.userData.veg || (!o.isInstancedMesh && outside(o)))) { o.visible = false; return; }
      o.material = o.userData.cards ? matCards : matSolid;
    });
    const scene = new THREE.Scene(), parent = w.group.parent;
    scene.add(w.group);
    const prevRT = this.r.getRenderTarget(), prevClear = this.r.getClearColor(new THREE.Color()), prevAlpha = this.r.getClearAlpha();
    const range = hMax - hMin, buf = new Uint8Array(ni * nj * 4);
    const ground = region ? (i, j) => T.height(R.x0 + (i + 0.5) * R.rx, R.z0 + (j + 0.5) * R.rz) : null;
    const shoot = (c, clear, out, flipX = false) => {
      this.r.setRenderTarget(rt); this.r.setClearColor(clear, 1); this.r.clear(); this.r.render(scene, c);
      this.r.readRenderTargetPixels(rt, 0, 0, ni, nj, buf);
      for (let r = 0; r < nj; r++) {
        const j = j1 - r;
        for (let c2 = 0; c2 < ni; c2++) {
          const k = (r * ni + c2) * 4, i = flipX ? i1 - c2 : i0 + c2;
          const v = hMin + ((buf[k] * 65536 + buf[k + 1] * 256 + buf[k + 2]) / 16777215) * range;
          out[j * R.Nx + i] = ground && clear === 0x000000 ? Math.max(v, ground(i, j)) : v;
        }
      }
    };
    const q0 = performance.now();
    // full capture: casts sun shadows / blocks lights
    shoot(cam, 0x000000, this.H);
    const q1 = performance.now();
    // underside (from below, terrain hidden): the gap under tree crowns, tables, awnings
    const camB = new THREE.OrthographicCamera(-xb, -xa, -za, -zb, 0.1, hMax - hMin + 20);
    camB.position.set(0, hMin - 5, 0); camB.up.set(0, 0, -1); camB.lookAt(0, hMax, 0); camB.updateMatrixWorld();
    const vis0 = new Map(); w.group.traverse((o) => { if (o.isMesh && o.userData.terrain) { vis0.set(o, o.visible); o.visible = false; } });
    const B = new Float32Array(R.Nx * R.Nz);
    shoot(camB, 0xffffff, B, true);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * R.Nx + i;
      const g = T.height(R.x0 + (i + 0.5) * R.rx, R.z0 + (j + 0.5) * R.rz);
      this.G[k] = B[k] > g + 0.5 && B[k] < this.H[k] - 0.05 ? B[k] : -1e9;
    }
    for (const [o, v] of vis0) o.visible = v;
    // occluders only: buildings, walls, fences (AO and "under a roof"); trees and props cast only sun shadow
    w.group.traverse((o) => { if (o.isMesh && (o.userData.veg || o.userData.prop)) o.visible = false; });
    const q2 = performance.now();
    shoot(cam, 0x000000, this.HO);
    this.r.setRenderTarget(prevRT); this.r.setClearColor(prevClear, prevAlpha);
    for (const [o, m, v] of swaps) { o.material = m; o.visible = v; }
    if (parent) parent.add(w.group); else scene.remove(w.group);
    rt.scissorTest = false; rt.viewport.set(0, 0, R.Nx, R.Nz); rt.scissor.set(0, 0, R.Nx, R.Nz);
  }
  // height materials are kept for the baker's life: re-creating them recompiles their shaders each time
  _hmats() {
    if (!this._hm) this._hm = [heightMaterial(false, [this.hMin, this.hMax]), heightMaterial(true, [this.hMin, this.hMax])];
    for (const m of this._hm) { m.uniforms.uMin.value = this.hMin; m.uniforms.uRange.value = this.hMax - this.hMin; }
    return this._hm;
  }

  // Editor: re-light only a region after an edit (capture, texels, nearby meshes, vegetation, current preset)
  updateRegion(box, preset) {
    const t0 = performance.now(), R = this.rect, pad = 11;
    const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
    const i0 = cl(Math.floor((box[0] - pad - R.x0) / R.rx), R.Nx), i1 = cl(Math.ceil((box[2] + pad - R.x0) / R.rx), R.Nx);
    const j0 = cl(Math.floor((box[1] - pad - R.z0) / R.rz), R.Nz), j1 = cl(Math.ceil((box[3] + pad - R.z0) / R.rz), R.Nz);
    this._captureBox(i0, i1, j0, j1, true);
    const tc = performance.now();
    this._texelsBox(i0, i1, j0, j1);
    const tt = performance.now();
    const bx = [R.x0 + i0 * R.rx, R.z0 + j0 * R.rz, R.x0 + (i1 + 1) * R.rx, R.z0 + (j1 + 1) * R.rz];
    // meshes: keep entries far from the change, recompute the rest
    const keep = new Map(this.meshes.map((M) => [M.o, M]));
    const fresh = new Set();
    this.meshes = []; this.inst = [];
    const bb = new THREE.Box3();
    this.world.group.traverse((o) => {
      if (o.userData.noBake || o.userData.terrain) return;
      if (o.isInstancedMesh && o.userData.veg) { this.inst.push(o); return; }
      if (!o.isMesh || !o.geometry.attributes.bake) return;
      const old = keep.get(o);
      if (old) { bb.setFromObject(o); if (bb.max.x < bx[0] || bb.min.x > bx[2] || bb.max.z < bx[1] || bb.min.z > bx[3]) { this.meshes.push(old); return; } }
      this.meshes.push(this._meshEntry(o)); fresh.add(o);
    });
    const tm = performance.now();
    for (const im of this.inst) this._instEntry(im);
    const ti = performance.now();
    // preset caches: other times of day re-bake when picked; the current one is patched in place
    for (const [id, c] of Object.entries(this.cache)) if (id !== (preset.key || preset.id)) { c.tex.dispose(); delete this.cache[id]; }
    const c = this.cache[preset.key || preset.id];
    if (!c) return this.bake(preset);
    const C = this._ctx(preset), lm = c.tex.image.data;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) C.texel(j * R.Nx + i, lm);
    c.tex.needsUpdate = true;
    const mb = new Map();
    for (const M of this.meshes) mb.set(M.o, !fresh.has(M.o) && c.meshBakes.has(M.o) ? c.meshBakes.get(M.o) : C.mesh(M));
    c.meshBakes = mb;
    c.instBakes = new Map(this.inst.map((im) => [im, C.inst(im)]));
    const tp = performance.now();
    const r = this.apply(preset);
    console.log(`[bake region] ${i1 - i0 + 1}x${j1 - j0 + 1} texels, ${fresh.size} meshes ${Math.round(performance.now() - t0)}ms (capture ${Math.round(tc - t0)} texels ${Math.round(tt - tc)} meshes ${Math.round(tm - tt)} veg ${Math.round(ti - tm)} light ${Math.round(tp - ti)} apply ${Math.round(performance.now() - tp)})`);
    return r;
  }

  // Editor, right after an edit (sync, cheap): the sun shadow map and the point lights are redrawn at once, and every new
  // mesh gets a provisional sky / bounce light (no AO yet) so it never shows up unlit while the real re-light runs
  quickLight(preset) {
    const c = this.cache[preset.key || preset.id]; if (!c) return;
    const known = new Set(this.meshes.map((M) => M.o));
    const [sx, , sz] = sunDir(preset), sc = preset.sun.col.map((v) => v * preset.sun.k), amb = preset.amb.map((v) => v * preset.ambK), bounce = preset.bounce;
    const n = new THREE.Vector3(), nm = new THREE.Matrix3(), AO = 0.85;
    this.world.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || known.has(o) || o.userData.noBake || o.userData.terrain) return;
      const A = o.geometry.attributes.bake, N = o.geometry.attributes.normal; if (!A || !N) return;
      o.updateMatrixWorld(); nm.getNormalMatrix(o.matrixWorld);
      for (let v = 0; v < N.count; v++) {
        n.fromBufferAttribute(N, v).applyMatrix3(nm).normalize();
        const sky = (0.5 + 0.5 * n.y) * AO, gb = (0.5 - 0.5 * n.y) * AO, nd = preset.sunHidden ? 0.3 * AO * Math.max(0, n.x * sx + n.z * sz + 0.3) : 0;
        A.array[v * 3] = amb[0] * sky + sc[0] * (nd + bounce * gb); A.array[v * 3 + 1] = amb[1] * sky + sc[1] * (nd + bounce * gb * 0.95); A.array[v * 3 + 2] = amb[2] * sky + sc[2] * (nd + bounce * gb * 0.85);
      }
      A.needsUpdate = true;
    });
    this.pointLightTextures(preset);
    requestAnimationFrame(() => { if (this._job || this._regBox) this.renderShadow(preset); }); // the sun's shadow map next frame (the edit shows first)
  }

  // Editor, non-blocking: the same region re-light spread over frames — GPU readbacks are async, CPU work runs in ~8 ms
  // slices — so the game never stalls; the new light swaps in when it's ready. A newer edit (or a full bake) cancels a
  // running job; the boxes of cancelled jobs are folded into the next one.
  updateRegionAsync(box, preset) {
    this._regBox = this._regBox ? [Math.min(this._regBox[0], box[0]), Math.min(this._regBox[1], box[1]), Math.max(this._regBox[2], box[2]), Math.max(this._regBox[3], box[3])] : box.slice();
    const job = (this._job = { box: this._regBox.slice() });
    return this._runRegion(job, preset).catch((e) => {
      if (e === ABORT) return;
      console.warn('[bake region async] failed, re-lighting in one go', e); // never leave the edit unlit
      if (this._job === job) { const bx = this._regBox || job.box; this._regBox = null; this._job = null; try { this.updateRegion(bx, preset); } catch (e2) { console.warn('[bake region]', e2); this.bake(preset); } }
    });
  }
  async _runRegion(job, preset) {
    const alive = () => this._job === job;
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
    let tS = performance.now();
    const tick = async () => { if (performance.now() - tS > sliceMs()) { await nextFrame(); if (!alive()) throw ABORT; tS = performance.now(); } };
    const t0 = performance.now(), R = this.rect, pad = 11, box = job.box;
    const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
    const i0 = cl(Math.floor((box[0] - pad - R.x0) / R.rx), R.Nx), i1 = cl(Math.ceil((box[2] + pad - R.x0) / R.rx), R.Nx);
    const j0 = cl(Math.floor((box[1] - pad - R.z0) / R.rz), R.Nz), j1 = cl(Math.ceil((box[3] + pad - R.z0) / R.rz), R.Nz);
    await nextFrame(); if (!alive()) throw ABORT; // let the edited geometry show first
    await new Promise((res) => setTimeout(res, 180)); if (!alive()) throw ABORT; // a run of quick edits starts one job, not one each
    const tq0 = performance.now(); await this._captureBoxAsync(i0, i1, j0, j1, alive); if (window.__diffWhy) console.debug('[T] capture', Math.round(performance.now() - tq0));
    tS = performance.now();
    for (let j = j0; j <= j1; j += 24) { this._texelsBox(i0, i1, j, Math.min(j1, j + 23)); await tick(); }
    const bx = [R.x0 + i0 * R.rx, R.z0 + j0 * R.rz, R.x0 + (i1 + 1) * R.rx, R.z0 + (j1 + 1) * R.rz];
    const keep = new Map(this.meshes.map((M) => [M.o, M])), fresh = new Set(), meshes = [], inst = [], todo = [];
    const bb = new THREE.Box3();
    this.world.group.traverse((o) => {
      if (o.userData.noBake || o.userData.terrain) return;
      if (o.isInstancedMesh && o.userData.veg) { inst.push(o); return; }
      if (!o.isMesh || !o.geometry.attributes.bake) return;
      const old = keep.get(o);
      if (old) { bb.setFromObject(o); if (bb.max.x < bx[0] || bb.min.x > bx[2] || bb.max.z < bx[1] || bb.min.z > bx[3]) { meshes.push(old); return; } }
      todo.push([meshes.length, o]); meshes.push(null); fresh.add(o);
    });
    for (const [k, o] of todo) { meshes[k] = this._meshEntry(o); await tick(); }
    const oldInst = new Set(this.inst);
    for (const im of inst) {
      if (oldInst.has(im) && im.userData.bakePts) { // same mesh as before: refresh AO only for the instances in the box
        const pts = im.userData.bakePts, ao = im.userData.bakeAO;
        for (let k = 0; k < im.count; k++) { const x = pts[k * 4], z = pts[k * 4 + 2]; if (x >= bx[0] && x <= bx[2] && z >= bx[1] && z <= bx[3]) ao[k] = 0.6 + 0.4 * this.aoAt(x, pts[k * 4 + 1], z, pts[k * 4 + 3] + 0.5); }
      } else this._instEntry(im);
      await tick();
    }
    if (!alive()) throw ABORT;
    this.meshes = meshes; this.inst = inst;
    for (const [id, c] of Object.entries(this.cache)) if (id !== (preset.key || preset.id)) { c.tex.dispose(); delete this.cache[id]; }
    const c = this.cache[preset.key || preset.id];
    if (!c) { this._regBox = null; this._job = null; return this.bake(preset); }
    const C = this._ctx(preset), lm = c.tex.image.data.slice(); // work on a copy, swap at the end
    for (let j = j0; j <= j1; j++) { for (let i = i0; i <= i1; i++) C.texel(j * R.Nx + i, lm); await tick(); }
    const mb = new Map();
    for (const M of this.meshes) { mb.set(M.o, !fresh.has(M.o) && c.meshBakes.has(M.o) ? c.meshBakes.get(M.o) : C.mesh(M)); if (fresh.has(M.o)) await tick(); }
    const ib = new Map();
    for (const im of this.inst) { const pv = c.instBakes?.get(im); ib.set(im, oldInst.has(im) && pv ? C.instPart(im, pv, bx) : C.inst(im)); await tick(); }
    if (!alive()) throw ABORT;
    c.tex.image.data.set(lm); c.tex.needsUpdate = true; c.meshBakes = mb; c.instBakes = ib;
    const r = this.apply(preset);
    this._regBox = null; this._job = null;
    console.log(`[bake region async] ${i1 - i0 + 1}x${j1 - j0 + 1} texels, ${fresh.size} meshes, ${Math.round(performance.now() - t0)} ms wall`);
    this.onRegionDone?.(performance.now() - t0);
    return r;
  }
  // _captureBox for a region, with async readbacks: the scene is put back right after each draw (the read is queued
  // on the GPU), so the frames in between render normally
  async _captureBoxAsync(i0, i1, j0, j1, alive) {
    const w = this.world, T = w.terrain, R = this.rect;
    const ni = i1 - i0 + 1, nj = j1 - j0 + 1;
    const xa = R.x0 + i0 * R.rx, xb = R.x0 + (i1 + 1) * R.rx, za = R.z0 + j0 * R.rz, zb = R.z0 + (j1 + 1) * R.rz;
    const { hMin, hMax } = this, range = hMax - hMin;
    const [matSolid, matCards] = this._hmats();
    const cam = new THREE.OrthographicCamera(xa, xb, -za, -zb, 0.1, hMax - hMin + 20);
    cam.position.set(0, hMax + 5, 0); cam.up.set(0, 0, -1); cam.lookAt(0, hMin, 0); cam.updateMatrixWorld();
    const camB = new THREE.OrthographicCamera(-xb, -xa, -za, -zb, 0.1, hMax - hMin + 20);
    camB.position.set(0, hMin - 5, 0); camB.up.set(0, 0, -1); camB.lookAt(0, hMax, 0); camB.updateMatrixWorld();
    if (!this._rt || this._rt.width !== R.Nx || this._rt.height !== R.Nz) { this._rt?.dispose(); this._rt = new THREE.WebGLRenderTarget(R.Nx, R.Nz, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }); }
    const rt = this._rt, buf = new Uint8Array(ni * nj * 4);
    const sph = new THREE.Sphere();
    const outside = (o) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); return sph.center.x + sph.radius < xa || sph.center.x - sph.radius > xb || sph.center.z + sph.radius < za || sph.center.z - sph.radius > zb; };
    const ground = (i, j) => T.height(R.x0 + (i + 0.5) * R.rx, R.z0 + (j + 0.5) * R.rz);
    // one draw: hide / swap for the pass, render into the corner of the target, queue the read, put everything back
    const shot = async (c, clear, pass) => {
      w.group.updateMatrixWorld(true);
      const swaps = [];
      w.group.traverse((o) => {
        if (!o.isMesh) return;
        swaps.push([o, o.material, o.visible]);
        if (o.userData.noBake || o.userData.isPart || o.userData.noShadow || o.userData.terrain || o.userData.veg || (!o.isInstancedMesh && outside(o))) { o.visible = false; return; }
        if (pass === 'occ' && o.userData.prop) { o.visible = false; return; }
        o.material = o.userData.cards ? matCards : matSolid;
      });
      const scene = new THREE.Scene(), parent = w.group.parent;
      scene.add(w.group);
      const prevRT = this.r.getRenderTarget(), prevClear = this.r.getClearColor(new THREE.Color()), prevAlpha = this.r.getClearAlpha();
      rt.viewport.set(0, 0, ni, nj); rt.scissor.set(0, 0, ni, nj); rt.scissorTest = true;
      const tr0 = performance.now(); this.r.setRenderTarget(rt); this.r.setClearColor(clear, 1); this.r.clear(); this.r.render(scene, c); if (window.__diffWhy) console.debug('[T] shot render', pass, Math.round(performance.now() - tr0), swaps.filter(([o]) => o.visible).length);
      const read = this.r.readRenderTargetPixelsAsync(rt, 0, 0, ni, nj, buf);
      this.r.setRenderTarget(prevRT); this.r.setClearColor(prevClear, prevAlpha);
      rt.scissorTest = false; rt.viewport.set(0, 0, R.Nx, R.Nz); rt.scissor.set(0, 0, R.Nx, R.Nz);
      for (const [o, m, v] of swaps) { o.material = m; o.visible = v; }
      if (parent) parent.add(w.group); else scene.remove(w.group);
      await read;
      if (!alive()) throw ABORT;
      return buf;
    };
    const decode = (b, out, clear, flipX = false, withGround = false) => {
      for (let r = 0; r < nj; r++) { const j = j1 - r;
        for (let c2 = 0; c2 < ni; c2++) { const k = (r * ni + c2) * 4, i = flipX ? i1 - c2 : i0 + c2;
          const v = hMin + ((b[k] * 65536 + b[k + 1] * 256 + b[k + 2]) / 16777215) * range;
          out[j * R.Nx + i] = withGround && clear === 0x000000 ? Math.max(v, ground(i, j)) : v; } }
    };
    // full capture (sun shadows / blocking), underside (gaps under crowns, tables, awnings), occluders only (AO, "under a roof")
    const H = new Float32Array(this.H.length), HO = new Float32Array(this.HO.length), B = new Float32Array(R.Nx * R.Nz);
    decode(await shot(cam, 0x000000, 'full'), H, 0x000000, false, true);
    decode(await shot(camB, 0xffffff, 'under'), B, 0xffffff, true);
    decode(await shot(cam, 0x000000, 'occ'), HO, 0x000000, false, true);
    // commit only the box
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * R.Nx + i, g = T.height(R.x0 + (i + 0.5) * R.rx, R.z0 + (j + 0.5) * R.rz);
      this.H[k] = H[k]; this.HO[k] = HO[k];
      this.G[k] = B[k] > g + 0.5 && B[k] < this.H[k] - 0.05 ? B[k] : -1e9;
    }
  }
  hAt(x, z) {
    const R = this.rect;
    let i = Math.floor((x - R.x0) / R.rx), j = Math.floor((z - R.z0) / R.rz);
    if (i < 0 || j < 0 || i >= R.Nx || j >= R.Nz) return this.world.terrain.height(x, z);
    return this.H[j * R.Nx + i];
  }
  // is (x, yy, z) inside solid? (below the top surface and not in the open gap under a crown / table)
  solid(x, yy, z) {
    const R = this.rect;
    const i = Math.floor((x - R.x0) / R.rx), j = Math.floor((z - R.z0) / R.rz);
    if (i < 0 || j < 0 || i >= R.Nx || j >= R.Nz) return this.world.terrain.height(x, z) > yy;
    const k = j * R.Nx + i;
    return this.H[k] > yy && !(yy < this.G[k]);
  }
  // occluders only (no vegetation / props)
  oAt(x, z) {
    const R = this.rect;
    let i = Math.floor((x - R.x0) / R.rx), j = Math.floor((z - R.z0) / R.rz);
    if (i < 0 || j < 0 || i >= R.Nx || j >= R.Nz) return this.world.terrain.height(x, z);
    return this.HO[j * R.Nx + i];
  }

  // sky visibility from point (x,y,z): 1 = open sky. (nx,nz): skip directions into the surface
  aoAt(x, y, z, minD = 0, nx = 0, nz = 0) {
    let occ = 0, cnt = 0;
    for (const [dx, dz] of DIRS) {
      if (dx * nx + dz * nz < -0.3) continue;
      cnt++;
      let m = 0;
      for (const d of AO_D) {
        if (d < minD) continue;
        const t = (this.oAt(x + dx * d, z + dz * d) - y) / d;
        if (t > m) m = t;
      }
      occ += m / Math.sqrt(1 + m * m); // sin(atan(m))
    }
    return 1 - (occ / Math.max(1, cnt)) * AO_K;
  }

  // 1 = lit; march toward the sun through the height capture
  sunVis(x, y, z, sx, sy, sz, t0 = 0.15) {
    const hz = Math.hypot(sx, sz);
    if (sy <= 0.01) return 0;
    const ux = sx / hz, uz = sz / hz, rise = sy / hz;
    const top = this.hMax;
    let t = t0;
    while (t < 90) {
      const yy = y + t * rise;
      if (yy > top) return 1;
      if (this.solid(x + ux * t, yy + 0.03, z + uz * t)) return 0;
      t += Math.max(0.2, t * 0.06);
    }
    return 1;
  }

  // visibility between point and light
  lightVis(x, y, z, lx, ly, lz) {
    const dx = lx - x, dy = ly - y, dz = lz - z;
    const L = Math.hypot(dx, dz);
    if (L < 0.4) return 1;
    const n = Math.ceil(L / 0.3);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this.solid(x + dx * t, y + dy * t + 0.05, z + dz * t)) return 0;
    }
    return 1;
  }

  // ------------------------------------------------------------------ texel prep (once)
  computeTexels() {
    const R = this.rect, T = this.world.terrain;
    const n = R.Nx * R.Nz;
    this.tY = new Float32Array(n); this.tN = new Float32Array(n * 3); this.tAO = new Float32Array(n); this.tCov = new Uint8Array(n);
    for (let j = 0; j < R.Nz; j++) for (let i = 0; i < R.Nx; i++) {
      const k = j * R.Nx + i;
      const x = R.x0 + (i + 0.5) * R.rx, z = R.z0 + (j + 0.5) * R.rz;
      const y = T.height(x, z);
      this.tY[k] = y;
      const nn = T.normalAt(x, z);
      this.tN[k * 3] = nn[0]; this.tN[k * 3 + 1] = nn[1]; this.tN[k * 3 + 2] = nn[2];
      this.tCov[k] = this.HO[k] > y + 0.45 ? 1 : 0;
    }
    // AO at half resolution, upsampled
    const hx = Math.ceil(R.Nx / 2), hz = Math.ceil(R.Nz / 2), half = new Float32Array(hx * hz);
    for (let j = 0; j < hz; j++) for (let i = 0; i < hx; i++) {
      const ii = Math.min(i * 2, R.Nx - 1), jj = Math.min(j * 2, R.Nz - 1), k = jj * R.Nx + ii;
      half[j * hx + i] = this.aoAt(R.x0 + (ii + 0.5) * R.rx, this.tY[k] + 0.1, R.z0 + (jj + 0.5) * R.rz) * (this.tCov[k] ? COVER_K : 1);
    }
    upsample(blur(half, hx, hz, 4), hx, hz, R.Nx, R.Nz, this.tAO);
  }

  _texelsBox(i0, i1, j0, j1) {
    const R = this.rect, T = this.world.terrain;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * R.Nx + i, x = R.x0 + (i + 0.5) * R.rx, z = R.z0 + (j + 0.5) * R.rz, y = T.height(x, z);
      this.tY[k] = y;
      const nn = T.normalAt(x, z);
      this.tN[k * 3] = nn[0]; this.tN[k * 3 + 1] = nn[1]; this.tN[k * 3 + 2] = nn[2];
      this.tCov[k] = this.HO[k] > y + 0.45 ? 1 : 0;
    }
    // AO at full res over the box plus a margin, blurred, written back inside the box only
    const m = 8, a0 = Math.max(0, i0 - m), a1 = Math.min(R.Nx - 1, i1 + m), b0 = Math.max(0, j0 - m), b1 = Math.min(R.Nz - 1, j1 + m);
    const W = a1 - a0 + 1, Hh = b1 - b0 + 1, loc = new Float32Array(W * Hh);
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
      const k = j * R.Nx + i, x = R.x0 + (i + 0.5) * R.rx, z = R.z0 + (j + 0.5) * R.rz;
      const y = (i >= i0 && i <= i1 && j >= j0 && j <= j1) ? this.tY[k] : T.height(x, z);
      loc[(j - b0) * W + (i - a0)] = this.aoAt(x, y + 0.1, z) * (this.HO[k] > y + 0.45 ? COVER_K : 1);
    }
    const bl = blur(loc, W, Hh, 12);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.tAO[j * R.Nx + i] = bl[(j - b0) * W + (i - a0)];
  }

  _meshEntry(o) {
    const p = new THREE.Vector3(), nrm = new THREE.Vector3(), nm = new THREE.Matrix3();
    o.updateMatrixWorld();
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal;
    const cnt = P.count;
    const wp = new Float32Array(cnt * 3), wn = new Float32Array(cnt * 3), ao = new Float32Array(cnt);
    nm.getNormalMatrix(o.matrixWorld);
    for (let v = 0; v < cnt; v++) {
      p.fromBufferAttribute(P, v).applyMatrix4(o.matrixWorld);
      nrm.fromBufferAttribute(N, v).applyMatrix3(nm).normalize();
      const ox = p.x + nrm.x * 0.25, oy = p.y + nrm.y * 0.25 + 0.03, oz = p.z + nrm.z * 0.25;
      wp[v * 3] = ox; wp[v * 3 + 1] = oy; wp[v * 3 + 2] = oz;
      wn[v * 3] = nrm.x; wn[v * 3 + 1] = nrm.y; wn[v * 3 + 2] = nrm.z;
      const hl = Math.hypot(nrm.x, nrm.z) || 1;
      let a = this.aoAt(ox, oy, oz, 0.4, nrm.x / hl * (hl > 0.3 ? 1 : 0), nrm.z / hl * (hl > 0.3 ? 1 : 0));
      // under a roof / porch / canopy (probe beyond the eaves so a wall doesn't cover itself)
      const px = p.x + nrm.x * 0.8, pz = p.z + nrm.z * 0.8;
      if (this.oAt(px, pz) > oy + 0.6 && this.oAt(ox, oz) > oy + 0.4) a *= 0.67;
      ao[v] = a;
    }
    return { o, wp, wn, ao };
  }
  _instEntry(im) {
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const h = im.userData.h || 1, rad = im.userData.r || 0.6, n = im.count;
    const pts = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      im.getMatrixAt(k, m); m.decompose(pos, q, sc);
      pts[k * 4] = pos.x; pts[k * 4 + 1] = pos.y + h * sc.y * 0.6; pts[k * 4 + 2] = pos.z; pts[k * 4 + 3] = rad * sc.x;
    }
    im.userData.bakePts = pts;
    const ao = new Float32Array(n);
    for (let k = 0; k < n; k++) ao[k] = 0.6 + 0.4 * this.aoAt(pts[k * 4], pts[k * 4 + 1], pts[k * 4 + 2], pts[k * 4 + 3] + 0.5);
    im.userData.bakeAO = ao;
  }
  computeVertexAO() {
    this.meshes = [];
    this.inst = [];
    this.world.group.traverse((o) => {
      if (o.userData.noBake || o.userData.terrain) return;
      if (o.isInstancedMesh && o.userData.veg) { this.inst.push(o); return; }
      if (!o.isMesh || !o.geometry.attributes.bake) return;
      this.meshes.push(this._meshEntry(o));
    });
    for (const im of this.inst) this._instEntry(im);
  }

  // ------------------------------------------------------------------ preset bake
  lightsFor(preset) {
    const out = [];
    for (const l of this.world.lights) {
      if (l.search) continue; // searchlights are live lights only (spots.js), never baked
      let on;
      if (l.kind === 'window') on = l.r < preset.win;
      else on = preset.lights.gain > 0 && l.r < preset.lights.frac;
      if (!on) continue;
      out.push({ ...l, I: l.intensity * (l.kind === 'window' ? Math.max(0.6, preset.lights.gain) : preset.lights.gain) });
    }
    // spatial hash
    const cell = 12, grid = new Map();
    out.forEach((l, i) => {
      const r = Math.ceil(l.radius / cell);
      const cx = Math.floor(l.x / cell), cz = Math.floor(l.z / cell);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const key = (cx + a) * 73856093 ^ (cz + b) * 19349663;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    });
    return { list: out, near: (x, z) => grid.get(Math.floor(x / cell) * 73856093 ^ Math.floor(z / cell) * 19349663) || [] };
  }

  // per-preset light functions: terrain texel, mesh vertices, vegetation instances
  _ctx(preset) {
    const R = this.rect;
    const [sx, sy, sz] = sunDir(preset);
    const sc = preset.sun.col.map((c) => c * preset.sun.k);
    const amb = preset.amb.map((c) => c * preset.ambK);
    const bounce = preset.bounce;
    const lights = this.lightsFor(preset);
    const acc = [0, 0, 0], aoP = preset.aoPow || 1;
    const lightAt = (x, y, z, nx, ny, nz, out, useN = true) => {
      for (const i of lights.near(x, z)) {
        const l = lights.list[i];
        const dx = l.x - x, dy = l.y - y, dz = l.z - z;
        const d = Math.hypot(dx, dy, dz);
        if (d > l.radius) continue;
        let ndl = 1;
        if (useN) { ndl = (dx * nx + dy * ny + dz * nz) / (d || 1); if (ndl <= 0) continue; ndl = 0.25 + 0.75 * ndl; }
        const f = 1 - d / l.radius;
        let a = f * f * l.I * ndl;
        if (l.dir) { const cone = -(dx * l.dir[0] + dz * l.dir[1]) / (d || 1); a *= Math.max(0, Math.min(1, (cone + 0.1) / 0.7)); } // windows light outward
        if (a < 0.01) continue;
        if (!this.lightVis(x, y, z, l.x, l.y, l.z)) continue;
        out[0] += l.color[0] * a; out[1] += l.color[1] * a; out[2] += l.color[2] * a;
      }
    };
    const H = THREE.DataUtils.toHalfFloat;
    const texel = (k, lm) => {
      const i = k % R.Nx, j = (k / R.Nx) | 0;
      const x = R.x0 + (i + 0.5) * R.rx, z = R.z0 + (j + 0.5) * R.rz, y = this.tY[k] + 0.15;
      const nx = this.tN[k * 3], ny = this.tN[k * 3 + 1], nz = this.tN[k * 3 + 2];
      const ao = aoP === 1 ? this.tAO[k] : Math.pow(this.tAO[k], aoP);
      const sky = (0.55 + 0.45 * ny) * ao;
      // direct sun is added per pixel from the shadow map; only the hidden-sun fill is baked
      const nd = preset.sunHidden ? Math.max(0, nx * sx + ny * sy + nz * sz) * 0.35 * ao : 0;
      acc[0] = amb[0] * sky + sc[0] * nd + sc[0] * bounce * 0.12 * ao;
      acc[1] = amb[1] * sky + sc[1] * nd + sc[1] * bounce * 0.12 * ao;
      acc[2] = amb[2] * sky + sc[2] * nd + sc[2] * bounce * 0.12 * ao;
      if (lights.list.length) lightAt(x, y, z, nx, ny, nz, acc);
      lm[k * 4] = H(acc[0]); lm[k * 4 + 1] = H(acc[1]); lm[k * 4 + 2] = H(acc[2]); lm[k * 4 + 3] = H(1);
    };
    const mesh = (M) => {
      const cnt = M.ao.length, out = new Float32Array(cnt * 3);
      for (let v = 0; v < cnt; v++) {
        const x = M.wp[v * 3], y = M.wp[v * 3 + 1], z = M.wp[v * 3 + 2];
        const nx = M.wn[v * 3], ny = M.wn[v * 3 + 1], nz = M.wn[v * 3 + 2];
        const ao = aoP === 1 ? M.ao[v] : Math.pow(M.ao[v], aoP);
        const sky = (0.5 + 0.5 * ny) * ao;
        const gb = (0.5 - 0.5 * ny) * ao; // light bounced up from the ground
        const nd = preset.sunHidden ? 0.3 * ao * Math.max(0, nx * sx + nz * sz + 0.3) : 0;
        acc[0] = amb[0] * sky + sc[0] * (nd + bounce * gb);
        acc[1] = amb[1] * sky + sc[1] * (nd + bounce * gb * 0.95);
        acc[2] = amb[2] * sky + sc[2] * (nd + bounce * gb * 0.85);
        // point lights on meshes are per pixel (pointLights in the shaders): no streaks along wall columns
        out[v * 3] = acc[0]; out[v * 3 + 1] = acc[1]; out[v * 3 + 2] = acc[2];
      }
      return out;
    };
    const instK = (pts, ao, k, ib, is) => {
      const x = pts[k * 4], y = pts[k * 4 + 1], z = pts[k * 4 + 2];
      const a = aoP === 1 ? ao[k] : Math.pow(ao[k], aoP);
      acc[0] = amb[0] * a + sc[0] * bounce * 0.2; acc[1] = amb[1] * a + sc[1] * bounce * 0.2; acc[2] = amb[2] * a + sc[2] * bounce * 0.2;
      if (lights.list.length) lightAt(x, y, z, 0, 1, 0, acc, false);
      ib[k * 3] = acc[0]; ib[k * 3 + 1] = acc[1]; ib[k * 3 + 2] = acc[2];
      is[k] = 1;
    };
    const inst = (im) => {
      const pts = im.userData.bakePts, ao = im.userData.bakeAO, n2 = im.count;
      const ib = new Float32Array(n2 * 3), is = new Float32Array(n2);
      for (let k = 0; k < n2; k++) instK(pts, ao, k, ib, is);
      return [ib, is];
    };
    // an unchanged instanced mesh after an edit: only the instances inside the edited box are re-lit
    const instPart = (im, prev, bx) => {
      const pts = im.userData.bakePts, ao = im.userData.bakeAO, n2 = im.count;
      const ib = prev[0].slice(), is = prev[1].slice();
      for (let k = 0; k < n2; k++) { const x = pts[k * 4], z = pts[k * 4 + 2]; if (x >= bx[0] && x <= bx[2] && z >= bx[1] && z <= bx[3]) instK(pts, ao, k, ib, is); }
      return [ib, is];
    };
    return { texel, mesh, inst, instPart, amb, sc, bounce, lights };
  }

  bake(preset) {
    this._job = null; this._regBox = null;
    if (this.cache[preset.key || preset.id]) return this.apply(preset);
    const t0 = performance.now(), R = this.rect;
    const C = this._ctx(preset);
    const n = R.Nx * R.Nz;
    const tA = performance.now();
    const lm = new Uint16Array(n * 4);
    for (let k = 0; k < n; k++) C.texel(k, lm);
    const tex = new THREE.DataTexture(lm, R.Nx, R.Nz, THREE.RGBAFormat, THREE.HalfFloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    // terrain vertex fallback (outside lightmap)
    const terr = this.world.group.getObjectByName('terrain');
    let terrBake = null;
    if (terr) {
      const Nn = terr.geometry.attributes.normal.array;
      terrBake = new Float32Array(Nn.length);
      for (let v = 0; v < Nn.length; v += 3) { const ny = Nn[v + 1]; for (let c = 0; c < 3; c++) terrBake[v + c] = C.amb[c] * (0.55 + 0.45 * ny) + C.sc[c] * C.bounce * 0.12; }
    }
    const tB = performance.now();
    const meshBakes = new Map();
    for (const M of this.meshes) meshBakes.set(M.o, C.mesh(M));
    const tC = performance.now();
    const instBakes = new Map();
    for (const im of this.inst) instBakes.set(im, C.inst(im));
    console.log(`[bake ${preset.id}] prep ${Math.round(tA - t0)}  lightmap ${Math.round(tB - tA)}  meshes ${Math.round(tC - tB)}  veg ${Math.round(performance.now() - tC)}  lights ${C.lights.list.length}`);
    this.cache[preset.key || preset.id] = { tex, terrBake, meshBakes, instBakes, ms: performance.now() - t0 };
    return this.apply(preset);
  }

  // per-pixel sun: depth map from the sun's direction, re-rendered on each preset switch (cheap)
  // zoomed-in view: re-fit the shadow map to a ground disc (null = whole map)
  setFocus(f, preset) { this.focus = f; if (preset) this.renderShadow(preset); }

  renderShadow(preset) {
    const lit = !preset.sunHidden && sunDir(preset)[1] > 0.01;
    U.uShadowOn.value = lit ? 1 : 0;
    if (!lit) return;
    const w = this.world, T = w.terrain;
    const maxTex = Math.min(this.r.capabilities.maxTextureSize, 4096);
    const N = maxTex;
    if (!this.shadowRT || this.shadowRT.width !== N) {
      this.shadowRT?.dispose();
      this.shadowRT = new THREE.WebGLRenderTarget(N, N, { depthBuffer: true });
      this.shadowRT.depthTexture = new THREE.DepthTexture(N, N);
      this.shadowRT.depthTexture.type = THREE.UnsignedIntType;
    }
    const [sx, sy, sz] = sunDir(preset);
    const L = new THREE.Vector3(sx, sy, sz);
    const pad = 4, hx = T.W / 2 + pad, hz = T.D / 2 + pad;
    const ctr = new THREE.Vector3(0, (this.hMin + this.hMax) / 2, 0);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    cam.position.copy(ctr).addScaledVector(L, 600);
    cam.up.set(0, 1, 0);
    if (Math.abs(sy) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(ctr);
    cam.updateMatrixWorld();
    // fit the frustum to the map box (depth always spans the whole map so every caster is in);
    // zoomed in, the light-space window shrinks to the visible area for crisp shadows up close
    const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
    const fit = (ax, bx, az, bz) => {
      const o = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
      for (const X of [ax, bx]) for (const Y of [this.hMin, this.hMax]) for (const Z of [az, bz]) {
        v.set(X, Y, Z).applyMatrix4(inv);
        o[0] = Math.min(o[0], v.x); o[1] = Math.max(o[1], v.x); o[2] = Math.min(o[2], v.y); o[3] = Math.max(o[3], v.y); o[4] = Math.min(o[4], v.z); o[5] = Math.max(o[5], v.z);
      }
      return o;
    };
    const full = fit(-hx, hx, -hz, hz), f = this.focus;
    const [x0, x1, y0, y1] = f ? fit(f.x - f.r, f.x + f.r, f.z - f.r, f.z + f.r) : full, [z0, z1] = full.slice(4);
    cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1; cam.near = -z1 - 5; cam.far = -z0 + 5;
    cam.updateProjectionMatrix();
    const [matSolid, matCards] = this._hmats();
    const swaps = [];
    w.group.traverse((o) => {
      if (!o.isMesh) return;
      swaps.push([o, o.material, o.visible]);
      if (o.userData.noBake || o.userData.isPart || o.userData.noShadow) { o.visible = false; return; }
      o.material = o.userData.cards ? matCards : matSolid;
    });
    const scene = new THREE.Scene(), parent = w.group.parent;
    scene.add(w.group);
    const prevRT = this.r.getRenderTarget();
    this.r.setRenderTarget(this.shadowRT);
    this.r.clear();
    this.r.render(scene, cam);
    this.r.setRenderTarget(prevRT);
    for (const [o, m, vis] of swaps) { o.material = m; o.visible = vis; }
    if (parent) parent.add(w.group); else scene.remove(w.group);
    U.uShadow.value = this.shadowRT.depthTexture;
    U.uShadowM.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    U.uShadowTexel.value = (f ? Math.max(0.25, (full[1] - full[0]) / (x1 - x0) * 0.35) : 1) / N; // keep the penumbra about as wide in metres
    // ~4 cm of depth bias in NDC-ish depth units; texel footprint in metres sets the blur
    U.uShadowBias.value = 0.08 / (cam.far - cam.near);
  }

  // point-light list + grid textures for the shaders
  pointLightTextures(preset) {
    const L = this.lightsFor(preset).list, n = Math.min(L.length, 4000);
    U.uPLOn.value = n ? 1 : 0;
    if (!n) return;
    const data = new Float32Array(Math.max(1, n) * 3 * 4);
    for (let i = 0; i < n; i++) {
      const l = L[i], o = i * 12;
      data.set([l.x, l.y, l.z, l.radius, l.color[0] * l.I, l.color[1] * l.I, l.color[2] * l.I, 0, l.dir ? l.dir[0] : 0, l.dir ? l.dir[1] : 0, l.dir ? 1 : 0, 0], o);
    }
    const T = this.world.terrain, cell = 8, x0 = -T.W / 2 - 20, z0 = -T.D / 2 - 20, Gx = Math.ceil((T.W + 40) / cell), Gz = Math.ceil((T.D + 40) / cell);
    const grid = new Float32Array(Gx * 4 * Gz * 4), cnt = new Uint8Array(Gx * Gz);
    for (let i = 0; i < n; i++) {
      const l = L[i], r = l.radius;
      const ca = Math.max(0, Math.floor((l.x - r - x0) / cell)), cb = Math.min(Gx - 1, Math.floor((l.x + r - x0) / cell));
      const da = Math.max(0, Math.floor((l.z - r - z0) / cell)), db = Math.min(Gz - 1, Math.floor((l.z + r - z0) / cell));
      for (let cz = da; cz <= db; cz++) for (let cx = ca; cx <= cb; cx++) {
        const k = cz * Gx + cx; if (cnt[k] >= 16) continue;
        const slot = cnt[k]++, tx = cx * 4 + (slot >> 2);
        grid[(cz * Gx * 4 + tx) * 4 + (slot & 3)] = i + 1;
      }
    }
    for (const t of [U.uPLData.value, U.uPLGrid.value]) t?.dispose();
    const dt = new THREE.DataTexture(data, n * 3, 1, THREE.RGBAFormat, THREE.FloatType); dt.needsUpdate = true;
    const gt = new THREE.DataTexture(grid, Gx * 4, Gz, THREE.RGBAFormat, THREE.FloatType); gt.needsUpdate = true;
    for (const t of [dt, gt]) { t.magFilter = t.minFilter = THREE.NearestFilter; }
    U.uPLData.value = dt; U.uPLGrid.value = gt; U.uPLRect.value.set(x0, z0, cell, Gx);
  }

  apply(preset) {
    const c = this.cache[preset.key || preset.id];
    this.renderShadow(preset);
    this.pointLightTextures(preset);
    U.uLM.value = c.tex;
    U.uLMRect.value.set(this.rect.x0, this.rect.z0, this.rect.x1, this.rect.z1);
    const terr = this.world.group.getObjectByName('terrain');
    if (terr && c.terrBake && c.terrBake.length === terr.geometry.attributes.bake.array.length) { const a = terr.geometry.attributes.bake; a.array.set(c.terrBake); a.needsUpdate = true; }
    for (const [o, arr] of c.meshBakes) { const a = o.geometry.attributes.bake; a.array.set(arr); a.needsUpdate = true; }
    for (const [im, [ib, is]] of c.instBakes) {
      const g = im.geometry;
      g.attributes.iBake.array.set(ib); g.attributes.iBake.needsUpdate = true;
      g.attributes.iSun.array.set(is); g.attributes.iSun.needsUpdate = true;
    }
    return c;
  }

  dispose() { for (const c of Object.values(this.cache)) c.tex.dispose(); this.cache = {}; this._hm?.forEach((m) => m.dispose()); this._hm = null; this._rt?.dispose(); this._rt = null; this.shadowRT?.dispose(); this.shadowRT = null; }
}

function upsample(src, hx, hz, Nx, Nz, out) {
  for (let j = 0; j < Nz; j++) {
    const fj = Math.min(hz - 1.001, Math.max(0, (j - 0.5) / 2)), j0 = Math.floor(fj), tj = fj - j0;
    for (let i = 0; i < Nx; i++) {
      const fi = Math.min(hx - 1.001, Math.max(0, (i - 0.5) / 2)), i0 = Math.floor(fi), ti = fi - i0;
      const a = src[j0 * hx + i0], b = src[j0 * hx + i0 + 1], c = src[(j0 + 1) * hx + i0], d = src[(j0 + 1) * hx + i0 + 1];
      out[j * Nx + i] = (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
    }
  }
  return out;
}

function blur(a, W, Hh, passes) {
  let src = a, dst = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      let s = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let q = -1; q <= 1; q++) {
        const ii = i + q, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= W || jj >= Hh) continue;
        s += src[jj * W + ii]; c++;
      }
      dst[j * W + i] = s / c;
    }
    [src, dst] = [dst, src];
  }
  return src;
}

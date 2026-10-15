// Live searchlights: real spot lights (no baking), fed to every lit shader through U.uSpot*. Beams / heads / aim live in
// effects.js (search list); this lights, shadows and picks the level of detail:
//   slots 0–1  nearest (≤ 60 m): light + 512² shadow map, every frame
//   slots 2–3  next    (≤ 150 m): light + 256² shadow map, every 4th frame
//   slots 4–7  further (≤ 260 m): light only, no shadow
//   the rest / off screen: no light on the scene (effects keeps a cheap beam + the lens)
// Lights fade in and out over ~0.5 s as they move between levels, so nothing pops.
import * as THREE from 'three';
import { U, heightMaterial } from './materials.js';

const SH = [512, 512, 256, 256], NEAR = 60, MID = 150, FAR = 260;

export class SpotLights {
  constructor() {
    this.rts = SH.map((N) => { const rt = new THREE.WebGLRenderTarget(N, N, { depthBuffer: true }); rt.depthTexture = new THREE.DepthTexture(N, N); rt.depthTexture.type = THREE.UnsignedIntType; return rt; });
    this.cams = SH.map(() => new THREE.PerspectiveCamera(20, 1, 0.3, 60));
    this.mats = [heightMaterial(false, [-200, 800]), heightMaterial(true, [-200, 800])];
    this.frame = 0; this.list = null; this.listW = null; this.listN = -1; this._t = performance.now();
    this.frustum = new THREE.Frustum(); this.sph = new THREE.Sphere();
  }
  // meshes that cast: rebuilt when the world (or its node count) changes
  casters(world) {
    if (this.list && this.listW === world && !this._dirtyNow) return this.list;
    // casters are tagged with their own layers (4 solid, 5 alpha cards), so the shadow pass is two plain renders of the
    // main scene with an override material: no per-frame material swapping or re-parenting
    const out = [];
    world.group.traverse((o) => { if (o.isMesh && !o.userData.noBake && !o.userData.isPart && !o.userData.noShadow) { o.layers.enable(o.userData.cards ? 5 : 4); out.push(o); } });
    this.list = out; this.listW = world;
    return out;
  }
  // the lit cone, roughly: a sphere over the beam's far half and the pool
  geom(s) {
    const L = new THREE.Vector3(s.l.x, s.l.y, s.l.z), dir = s.tgt.clone().sub(L), len = dir.length() || 1; dir.divideScalar(len);
    const half = Math.atan(0.075 + 0.35 / len) * 1.15;
    return { L, dir, len, half, range: len * 1.6 + 10 };
  }
  update(renderer, world, effects, camera, gain = 1, mainScene = null) {
    this.frame++;
    const now = performance.now(), dt = Math.min(0.1, (now - this._t) / 1000); this._t = now;
    const S = (effects?.search || []).filter((s) => s.on && s.tgt);
    if (!world || !S.length) { U.uSpotN.value = 0; return; }
    this._dirtyNow = !!this.dirty; this.dirty = false;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const C = camera.isPerspectiveCamera ? camera.position : new THREE.Vector3(effects.view.x, 0, effects.view.z);
    // rank: visible lit area first, by distance from the eye (iso: from the view centre)
    for (const s of S) {
      s._g = this.geom(s);
      const mid = s._g.L.clone().lerp(s.tgt, 0.75);
      this.sph.set(mid, s._g.len * 0.35 + 4);
      s._vis = this.frustum.intersectsSphere(this.sph);
      s._d = Math.hypot(s.tgt.x - C.x, s.tgt.z - C.z);
    }
    const vis = S.filter((s) => s._vis && s._d < FAR).sort((a, b) => a._d - b._d);
    const slotOf = new Map();
    vis.forEach((s, i) => { if (i < 2 && s._d < NEAR * 1.6) slotOf.set(s, i); });
    let k = slotOf.size;
    for (const s of vis) if (!slotOf.has(s) && k < 4 && s._d < MID) slotOf.set(s, k++);
    k = Math.max(4, k);
    for (const s of vis) if (!slotOf.has(s) && k < 8) slotOf.set(s, k++);
    // shadowed slots must be filled before the unshadowed ones count (shader assumption): compact
    const order = [...slotOf.entries()].sort((a, b) => a[1] - b[1]);
    const shadowed = order.filter(([, i]) => i < 4).map(([s]) => s), plain = order.filter(([, i]) => i >= 4).map(([s]) => s);
    while (shadowed.length < 4 && plain.length) shadowed.push(plain.shift()); // promote rather than leave a hole
    const slots = [...shadowed, ...plain];
    // fades: in toward 1 while lit, out toward 0 (kept in its old slot while it fades, if there's room)
    for (const s of S) { const want = slots.includes(s) ? 1 : 0; s._lod = THREE.MathUtils.clamp((s._lod ?? 0) + (want ? 1 : -1) * dt * 2.2, 0, 1); }
    U.uSpotN.value = slots.length;
    let tagged = false;
    slots.forEach((s, i) => {
      const { L, dir, half, range } = s._g;
      U.uSpotP.value[i].copy(L); U.uSpotD.value[i].copy(dir);
      U.uSpotA.value[i].set(Math.cos(half), Math.cos(half * 0.45), range, i < 4 ? 1 : 0);
      U.uSpotC.value[i].set(0.9, 0.95, 1.0).multiplyScalar(2.6 * gain * (s._lod ?? 1));
      if (i >= 4) return;
      const cam = this.cams[i];
      cam.fov = THREE.MathUtils.radToDeg(half * 2.3); cam.near = 0.3; cam.far = range; cam.position.copy(L);
      cam.up.set(0, 1, 0); if (Math.abs(dir.y) > 0.98) cam.up.set(0, 0, -1);
      cam.lookAt(s.tgt); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      U.uSpotNF.value[i].set(cam.near, cam.far, 1 / SH[i]);
      // re-render only when the beam has moved (or the world changed); a still light keeps its map
      const moved = !s._mt || s._mt.distanceToSquared(s.tgt) > 0.0025 || this._dirtyNow;
      const every = i < 2 ? 2 : 6, due = s._slot !== i || !s._m || (moved && (this.frame + i) % every === 0);
      U[`uSpotS${i}`].value = this.rts[i].depthTexture;
      if (!due) { U.uSpotM.value[i].copy(s._m); return; }
      if (!tagged) { this.casters(world); tagged = true; }
      const scene = mainScene || world.group.parent, ov = scene.overrideMaterial, bg = scene.background, prev = renderer.getRenderTarget();
      scene.background = null;
      renderer.setRenderTarget(this.rts[i]); renderer.clear();
      cam.layers.set(4); scene.overrideMaterial = this.mats[0]; renderer.render(scene, cam);
      cam.layers.set(5); scene.overrideMaterial = this.mats[1]; renderer.render(scene, cam);
      scene.overrideMaterial = ov; scene.background = bg; renderer.setRenderTarget(prev);
      s._m = (s._m || new THREE.Matrix4()).multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); s._slot = i; (s._mt ||= new THREE.Vector3()).copy(s.tgt);
      U.uSpotM.value[i].copy(s._m);
    });
    for (const s of S) if (!slots.includes(s)) s._slot = -1;
  }
}

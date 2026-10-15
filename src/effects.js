// Sprite effects: chimney / fire smoke, flames, drifting dust, glow halos on active lights.
import * as THREE from 'three';
import { spriteTextures } from './textures.js';
import { sunDir, presetHour } from './presets.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MAX = { smoke: 900, flame: 300, glow: 600, dust: 160, rain: 1600, sand: 900, birds: 16, flock: 60, tumble: 12, sparks: 260, moths: 240, devil: 420 };

function pointsMaterial(map, blending) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uPx: { value: 10 }, uPersp: { value: 0 } },
    transparent: true, depthWrite: false, blending,
    vertexShader: /* glsl */ `
      attribute float size; attribute float alpha; attribute vec3 tint; attribute float flip; varying float vF;
      uniform float uPx; uniform float uPersp; varying vec3 vC; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * (uPersp > 0.5 ? uPx / max(-mv.z, 0.5) : uPx), 1.0, 512.0); vC = tint; vA = alpha; vF = flip; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying vec3 vC; varying float vA; varying float vF;
      void main() { vec2 pc = gl_PointCoord; if (vF > 0.5) pc.y = 1.0 - pc.y; vec4 t = texture2D(uMap, pc); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
  });
}

class Pool {
  constructor(n, map, blending) {
    this.n = n; this.count = 0;
    this.p = []; // particles {x,y,z,vx,vy,vz,age,life,s0,s1,a,col}
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('flip', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setDrawRange(0, 0);
    this.mat = pointsMaterial(map, blending);
    this.obj = new THREE.Points(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }
  spawn(o) { if (this.p.length < this.n) this.p.push({ age: 0, ...o }); }
  update(dt, wind, alphaFn) {
    const g = this.obj.geometry, P = g.attributes.position.array, S = g.attributes.size.array, A = g.attributes.alpha.array, C = g.attributes.tint.array, F = g.attributes.flip.array;
    let k = 0;
    this.p = this.p.filter((q) => (q.age += dt) < q.life);
    for (const q of this.p) {
      const t = q.age / q.life;
      q.step?.(q, dt);
      q.x += (q.vx + wind[0] * q.w) * dt; q.y += q.vy * dt; q.z += (q.vz + wind[1] * q.w) * dt;
      P[k * 3] = q.x; P[k * 3 + 1] = q.y; P[k * 3 + 2] = q.z;
      S[k] = q.s0 + (q.s1 - q.s0) * t;
      A[k] = alphaFn(q, t);
      C[k * 3] = q.col[0]; C[k * 3 + 1] = q.col[1]; C[k * 3 + 2] = q.col[2];
      F[k] = q.flip ? 1 : 0;
      k++;
    }
    g.setDrawRange(0, k);
    for (const a of ['position', 'size', 'alpha', 'tint', 'flip']) g.attributes[a].needsUpdate = true;
  }
}

export class Effects {
  constructor() {
    const T = spriteTextures();
    this.group = new THREE.Group();
    this.smoke = new Pool(MAX.smoke, T.puff, THREE.NormalBlending);
    this.dust = new Pool(MAX.dust, T.puff, THREE.NormalBlending);
    this.flame = new Pool(MAX.flame, T.flame, THREE.AdditiveBlending);
    this.glow = new Pool(MAX.glow, T.glow, THREE.AdditiveBlending);
    this.rain = new Pool(MAX.rain, T.streak, THREE.NormalBlending);
    this.sand = new Pool(MAX.sand, T.grain, THREE.NormalBlending);
    this.birds = new Pool(MAX.birds, T.bird, THREE.NormalBlending);
    this.flock = new Pool(MAX.flock, T.bird, THREE.NormalBlending);
    this.tumble = new Pool(MAX.tumble, T.tumble, THREE.NormalBlending);
    this.sparks = new Pool(MAX.sparks, T.glow, THREE.AdditiveBlending);
    this.moths = new Pool(MAX.moths, T.glow, THREE.AdditiveBlending);
    this.devil = new Pool(MAX.devil, T.puff, THREE.NormalBlending);
    this.pools = [this.smoke, this.dust, this.flame, this.glow, this.rain, this.sand, this.birds, this.flock, this.tumble, this.sparks, this.moths, this.devil];
    this.group.add(this.dust.obj, this.devil.obj, this.smoke.obj, this.tumble.obj, this.birds.obj, this.flock.obj, this.sand.obj, this.rain.obj, this.glow.obj, this.flame.obj, this.sparks.obj, this.moths.obj);
    // fake light cones under street lamps at night (additive, fading to the ground)
    this.cones = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute vec3 tint; varying vec3 vT; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vT = tint; vH = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'varying vec3 vT; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); gl_FragColor = vec4(vT * pow(vH, 1.6) * edge * 0.16, 1.0); }',
    }));
    this.cones.frustumCulled = false; this.cones.renderOrder = 4; this.cones.visible = false;
    this.group.add(this.cones);
    // searchlights: a beam and a ground pool per light, aimed every frame (sweep, or the player in Walk at dead of night)
    const beamGeo = new THREE.ConeGeometry(1, 1, 16, 1, true); beamGeo.translate(0, -0.5, 0); // apex at the origin, opening down -Y
    this.beamGeo = beamGeo; const lo = new THREE.ConeGeometry(1, 1, 6, 1, true); lo.translate(0, -0.5, 0); this.beamGeoLo = lo; // far beams: 6 sides
    this.beamMat = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; varying float vD; void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vD = distance(cameraPosition, wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 uTint; varying float vH; varying vec3 vN; varying vec3 vV; varying float vD; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.3); gl_FragColor = vec4(uTint * exp(-(1.0 - vH) * 150.0 / 38.0) * edge * 0.24 * smoothstep(2.0, 9.0, vD), 1.0); }' });
    this.search = []; this.searchGroup = new THREE.Group(); this.group.add(this.searchGroup); this.player = null;
    this.drumGeo = new THREE.CylinderGeometry(1, 1.15, 1.5, 12, 1, false).rotateX(Math.PI / 2); // axis along +Z (lookAt)
    this.lensGeo = new THREE.CircleGeometry(1.0, 16).translate(0, 0, 0.76);
    this.headMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    this.lensOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 2.05, 2.1) }); // under the bloom threshold: a tiny lens over it makes a ring of dots
    this.lensOff = new THREE.MeshBasicMaterial({ color: 0x101214 });
    this.devils = []; this.view = { x: 0, z: 0, r: 60 };
    this.t = 0;
    this.acc = new Map();
  }
  setWorld(world) { this.world = world; for (const p of this.pools) p.p = []; this.devils = []; }
  setPreset(p) {
    this.preset = p;
    const sc = p.sun.col.map((c) => c * p.sun.k), am = p.amb.map((c) => c * p.ambK);
    const sd = sunDir(p);
    const lit = sd[1] > 0 && !p.sunHidden ? 0.45 : 0.1;
    this.smokeCol = [0, 1, 2].map((i) => Math.min(1.4, (am[i] * 1.4 + sc[i] * lit) * 0.8));
    this.dustCol = [0, 1, 2].map((i) => Math.min(1.5, (am[i] + sc[i] * 0.5) * [0.95, 0.85, 0.7][i]));
    const night = p.lights.gain > 0;
    this.lampThresh = night ? p.lights.frac : -1;
    this.winThresh = p.win;
    // active glow halos (static positions, flicker in update)
    this.glow.p = [];
    if (this.world) for (const l of this.world.lights) {
      const on = l.kind === 'window' ? l.r >= 0 && l.r < p.win : l.r < this.lampThresh;
      if (!on || !l.halo || l.kind === 'window' || l.search) continue; // no halos on windows; searchlights glow from their lens
      const size = l.kind === 'window' ? 1.1 : l.kind === 'spot' ? 3.2 : l.kind === 'street' ? 2.4 : l.kind === 'screen' ? 0.9 : 1.6;
      const hz = p.hazeK ?? 0.3, hs = size * (0.75 + hz * 0.6); // more haze: bigger, stronger halos
      this.glow.p.push({ x: l.x, y: l.y, z: l.z, vx: 0, vy: 0, vz: 0, w: 0, age: 0, life: 1e9, s0: hs, s1: hs, col: l.color.map((c) => c * (l.kind === 'window' ? 0.35 : 0.6) * (p.lights.gain || 0.6)), flicker: l.flicker, ph: Math.random() * 10, a: (l.kind === 'window' ? 0.5 : 0.75) * Math.min(1.6, 0.25 + hz * 1.6) });
    }
    const w0 = this.weather;
    this.weather = p.weather || (p.overcast ? 'overcast' : 'sunny');
    if (w0 !== this.weather) { for (const q of [this.rain, this.sand, this.dust, this.devil, this.tumble, this.flock]) q.p = []; this.devils = []; }
    this.day = sd[1] > 0.05 && !p.moon && !p.sunHidden;
    this.rainCol = [0, 1, 2].map((i) => Math.min(1.2, p.sky.hor[i] * 1.1 + 0.08));
    this.sandCol = [0, 1, 2].map((i) => Math.min(1.4, (am[i] + sc[i] * 0.6) * [1.05, 0.82, 0.6][i]));
    this.birds.p = []; this.moths.p = [];
    // street-lamp cones
    const cg = [];
    if (this.world && night) for (const l of this.world.lights) {
      if (!(l.kind === 'street' || l.kind === 'lamp') || !(l.r < this.lampThresh)) continue;
      const T = this.world.terrain, g0 = T.height(l.x, l.z), h = l.y - g0; if (h < 1.6) continue;
      const g = new THREE.ConeGeometry(l.kind === 'street' ? Math.min(3.4, h * 0.55) : Math.min(1.6, h * 0.5), h - 0.05, 14, 1, true);
      g.translate(l.x, g0 + h / 2, l.z);
      const n = g.attributes.position.count, tint = new Float32Array(n * 3);
      const hk = Math.min(2, 0.15 + (p.hazeK ?? 0.3) * 1.9); // light shafts only show in the air's haze
      for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) tint[k * 3 + c] = l.color[c] * (p.lights.gain || 0.6) * hk;
      g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
      cg.push(g);
    }
    this.cones.geometry.dispose();
    this.cones.geometry = cg.length ? mergeGeometries(cg) : new THREE.BufferGeometry();
    this.cones.visible = cg.length > 0;
    this.buildSearch(p, night);
  }
  buildSearch(p, night) {
    const h = p.hour ?? presetHour(p.id);
    this.deadNight = p.id === 'dead' || p.id === 'night' || h >= 21.5 || h < 5; // Night and Dead of Night
    const old = new Map(this.search.map((s) => [s.l, s]));
    this.searchGroup.clear(); this.search = [];
    if (!this.world) return;
    const hk = Math.min(2, 0.35 + (p.hazeK ?? 0.3) * 1.7), gain = p.lights.gain || 0.6;
    this.beamMat.uniforms.uTint.value.setRGB(0.9, 0.95, 1.0).multiplyScalar(gain * hk);
    this.spotGain = gain;
    // the head: a drum on the yoke, lit like the scene (sun + ambient), its lens glowing when the light is on
    const am = p.amb.map((c) => c * p.ambK), sc = p.sun.col.map((c) => c * p.sun.k * (p.sunHidden ? 0 : 1)), sd = sunDir(p), lit = Math.max(0, sd[1]) * 0.6;
    this.headMat.color.setRGB(...[0, 1, 2].map((k) => Math.min(0.12, [0.05, 0.052, 0.055][k] * (am[k] * 1.2 + sc[k] * lit)))); // dark painted steel
    const T = this.world.terrain;
    for (const l of this.world.lights) {
      if (!l.search) continue;
      const prev = old.get(l), on = night && l.r < this.lampThresh && (h >= 21 || h < 5.75); // on at 21:00, off before sunrise
      // sweep centre: away from the nearest building (outward), else a fixed direction from its position
      let best = null, bd = 30;
      for (const st of this.world.structures || []) { const d = Math.hypot(st.at[0] - l.x, st.at[1] - l.z); if (d < bd) { bd = d; best = st; } }
      const hsh = Math.abs(Math.sin(l.x * 12.9898 + l.z * 78.233) * 43758.5453) % 1;
      const yaw0 = best && bd > 0.5 ? Math.atan2(l.x - best.at[0], l.z - best.at[1]) : hsh * Math.PI * 2;
      const r = l.search.head || 0.26, head = new THREE.Group();
      const drum = new THREE.Mesh(this.drumGeo, this.headMat); drum.scale.set(r, r, r);
      const lens = new THREE.Mesh(this.lensGeo, on ? this.lensOn : this.lensOff); lens.scale.set(r, r, r);
      head.add(drum, lens); head.position.set(l.x, l.y, l.z);
      this.searchGroup.add(head);
      let beam = null;
      // (no visible beam cone for now: it clipped through buildings; the light itself does the work)
      const gy = T.height(l.x, l.z), reach = Math.max(10, Math.min(l.search.reach || 20, (l.y - gy) * 4 + 8));
      const s = { l, on, beam, head, yaw0, arc: 1.1 + hsh * 0.5, per: 22 + hsh * 18, ph: hsh * 40, reach, tgt: prev?.tgt || null, seen: prev?.seen ?? -99, last: prev?.last || null, _m: prev?._m, _slot: prev?._slot };
      this.search.push(s);
      if (!on) { const a = yaw0; s.tgt = new THREE.Vector3(l.x + Math.sin(a) * reach * 0.6, gy, l.z + Math.cos(a) * reach * 0.6); head.lookAt(s.tgt); } // parked by day
    }
  }
  updateSearch(dt) {
    if (!this.search.length) return;
    const T = this.world.terrain, P = this.player, t = this.t;
    // only one light hunts the player at a time: the one already on you, else the nearest that can see you (20 m)
    let hunter = null;
    if (P && this.deadNight) {
      const cand = this.search.filter((s) => s.on && Math.hypot(P.x - s.l.x, P.z - s.l.z) < 20 && this.sees(s.l, P));
      hunter = cand.find((s) => s === this._hunter) || cand.sort((a, b) => Math.hypot(P.x - a.l.x, P.z - a.l.z) - Math.hypot(P.x - b.l.x, P.z - b.l.z))[0] || null;
      if (hunter) this._hunter = hunter; else if (this._hunter && t - this._hunter.seen > 3.5) this._hunter = null;
    }
    for (const s of this.search) {
      if (!s.on) continue;
      const l = s.l;
      const a = s.yaw0 + Math.sin((t + s.ph) * (Math.PI * 2) / s.per) * s.arc, dd = s.reach * (0.7 + 0.3 * Math.sin((t + s.ph) * 0.13));
      let gx = l.x + Math.sin(a) * dd, gz = l.z + Math.cos(a) * dd, k = 0.9;
      if (s === hunter) { s.seen = t; s.last = [P.x, P.z]; }
      if (s.last && t - s.seen < 3.5 && s === this._hunter) { [gx, gz] = s.last; k = 3.2; } // on you, or holding on where it lost you
      const want = new THREE.Vector3(gx, T.height(gx, gz), gz);
      if (!s.tgt) s.tgt = want.clone(); else s.tgt.lerp(want, 1 - Math.exp(-dt * k));
      const L = new THREE.Vector3(l.x, l.y, l.z), dir = s.tgt.clone().sub(L), len = dir.length(); dir.divideScalar(len || 1);
      const BL = 150, rad = 0.35 + BL * 0.075; // the beam runs on past where it lands and fades away
      if (s.beam) { s.beam.position.copy(L).addScaledVector(dir, (l.search.head || 0.26) * 1.2); s.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); s.beam.scale.set(rad, BL, rad); }
      s.head.lookAt(s.tgt);
      const cp = this.camPos; if (cp && s.beam) s.beam.geometry = Math.hypot(cp.x - l.x, cp.z - l.z) > 150 ? this.beamGeoLo : this.beamGeo; // LOD
    }
  }
  // line of sight from a light to the player over the ground (buildings ignored)
  sees(l, P) {
    const T = this.world.terrain;
    for (let i = 1; i < 8; i++) { const f = i / 8, x = l.x + (P.x - l.x) * f, z = l.z + (P.z - l.z) * f, y = l.y + (P.y - l.y) * f; if (T.height(x, z) > y) return false; }
    return true;
  }

  setView(x, z, r) { this.view.x = x; this.view.z = z; this.view.r = r; }
  // weather, wildlife and work: rain, blowing sand, dust devils, tumbleweeds, vultures, forge sparks, moths
  ambient(dt) {
    const p = this.preset, W = this.world, T = W.terrain, V = this.view, R = Math.min(V.r, 140), rnd = Math.random;
    const H = (x, z) => T.height(x, z), inMap = (x, z) => Math.abs(x) < T.W / 2 && Math.abs(z) < T.D / 2;
    const wx = 0.45, wz = 0.18, wl = Math.hypot(wx, wz), ux = wx / wl, uz = wz / wl;
    if (p.rain) { // rain: streaks falling through the view
      const n = Math.min(this.rain.n - this.rain.p.length, Math.round(dt * 1400 * Math.min(1.5, R / 60)));
      for (let k = 0; k < n; k++) { const x = V.x + (rnd() - 0.5) * 2 * R, z = V.z + (rnd() - 0.5) * 2 * R, g = H(x, z); this.rain.spawn({ x, y: g + 8 + rnd() * 10, z, vx: 1.2, vy: -24, vz: 0.5, w: 0, life: 0.45 + rnd() * 0.35, s0: 1.1, s1: 1.1, col: this.rainCol, step: (q) => { if (q.y < q.g) q.age = q.life; }, g }); }
    }
    if (p.dust) { // dust storm: grains streaming low along the wind, big brown puffs
      const n = Math.min(this.sand.n - this.sand.p.length, Math.round(dt * 600 * Math.min(1.5, R / 60)));
      for (let k = 0; k < n; k++) { const x = V.x + (rnd() - 0.5) * 2 * R, z = V.z + (rnd() - 0.5) * 2 * R; this.sand.spawn({ x, y: H(x, z) + rnd() * 3.5, z, vx: ux * 9, vy: (rnd() - 0.3) * 0.6, vz: uz * 9, w: 0, life: 0.8 + rnd() * 0.8, s0: 1.4, s1: 1.8, col: this.sandCol }); }
      if (this.dust.p.length < this.dust.n && rnd() < dt * 30) { const x = V.x + (rnd() - 0.5) * 2 * R, z = V.z + (rnd() - 0.5) * 2 * R; this.dust.spawn({ x, y: H(x, z) + 1 + rnd() * 3, z, vx: ux * 6, vy: 0.2, vz: uz * 6, w: 0, life: 4 + rnd() * 3, s0: 4, s1: 9, col: this.sandCol }); }
    }
    const windy = this.day && (this.weather === 'sunny' || this.weather === 'dust');
    // dust devils: hot clear afternoons, over open ground
    if (windy && this.weather === 'sunny' && this.devils.length < 2 && rnd() < dt * 0.04 && ['noon', 'afternoon'].includes(p.id)) {
      const x = V.x + (rnd() - 0.5) * 1.6 * R, z = V.z + (rnd() - 0.5) * 1.6 * R;
      if (inMap(x, z) && !W.blocked?.(x, z, 3)) this.devils.push({ x, z, age: 0, life: 10 + rnd() * 8, a: rnd() * 6.28 });
    }
    this.devils = this.devils.filter((d) => (d.age += dt) < d.life);
    for (const d of this.devils) {
      d.x += (ux * 1.6 + Math.sin(d.age * 0.7 + d.a) * 0.8) * dt; d.z += (uz * 1.6 + Math.cos(d.age * 0.5 + d.a) * 0.8) * dt;
      const k = Math.sin(Math.PI * d.age / d.life), g = H(d.x, d.z);
      for (let j = 0; j < Math.round(dt * 40 * k); j++) { const a = rnd() * 6.28, r = 0.3 + rnd() * 0.5; this.devil.spawn({ x: d.x + Math.cos(a) * r, y: g + 0.2, z: d.z + Math.sin(a) * r, vx: -Math.sin(a) * 2.2, vy: 2.5 + rnd() * 2.5, vz: Math.cos(a) * 2.2, w: 0.6, life: 2.2 + rnd(), s0: 0.8, s1: 3.2, col: this.dustCol, base: 0.3 * k }); }
    }
    // tumbleweeds bowling along with the wind
    if (windy && this.tumble.p.length < (this.weather === 'dust' ? 6 : 2) && rnd() < dt * (this.weather === 'dust' ? 0.6 : 0.08)) {
      const s = (rnd() - 0.5) * 2 * R, x = V.x - ux * R + -uz * s, z = V.z - uz * R + ux * s;
      if (inMap(x, z)) { const sp = this.weather === 'dust' ? 6 + rnd() * 3 : 2.5 + rnd() * 2; this.tumble.spawn({ x, y: H(x, z) + 0.5, z, vx: 0, vy: 0, vz: 0, w: 0, life: (2 * R) / sp, s0: 1.0, s1: 1.0, col: [0.62, 0.5, 0.34].map((c, i) => c * (this.dustCol[i] + 0.4)), ph: rnd() * 6,
        step: (q, dt2) => { q.x += ux * sp * dt2 + Math.sin(q.age * 1.3 + q.ph) * 0.4 * dt2; q.z += uz * sp * dt2; q.y = H(q.x, q.z) + 0.45 + Math.abs(Math.sin(q.age * 3.2 + q.ph)) * 0.35; } }); }
    }
    // vultures circling high over something dying, in the day
    if (this.day && this.weather === 'sunny' && !this.birds.p.length && W.spec?.biome !== 'urban') {
      const cx = V.x + (rnd() - 0.5) * R, cz = V.z + (rnd() - 0.5) * R, nb = 2 + Math.floor(rnd() * 4), da = rnd() * 6.28, dv = 0.6 + rnd() * 0.8, ddx = Math.cos(da) * dv, ddz = Math.sin(da) * dv;
      for (let b = 0; b < nb; b++) { const rad = 12 + rnd() * 14, h = 30 + rnd() * 18, w0 = (0.18 + rnd() * 0.12) * (rnd() < 0.5 ? 1 : -1), a0 = rnd() * 6.28;
        this.birds.spawn({ x: cx, y: h, z: cz, vx: 0, vy: 0, vz: 0, w: 0, life: 150 + rnd() * 120, s0: 2.6, s1: 2.6, col: [0.07, 0.06, 0.06], ph: rnd() * 6.28, step: (q) => { const a = a0 + q.age * w0, ox = cx + q.age * ddx, oz = cz + q.age * ddz; q.x = ox + Math.cos(a) * rad; q.z = oz + Math.sin(a) * rad; q.y = h + Math.sin(q.age * 0.4 + a0) * 1.5;
          // soaring: long glides, now and then a few slow wing beats (the sprite flips: wings up / wings down)
          q.flip = Math.sin(q.age * 0.23 + q.ph) > 0.75 && Math.sin(q.age * 6.5) > 0; } }); }
    }
    // small birds: now and then a little flock crosses the view, low, flapping (day, not in storms or rain)
    if (this.day && (this.weather === 'sunny' || this.weather === 'overcast') && this.flock.p.length === 0 && rnd() < dt / 25) {
      const ang = rnd() * 6.28, dx = Math.cos(ang), dz = Math.sin(ang), sp = 7 + rnd() * 4, n = 4 + Math.floor(rnd() * 8);
      const sx = V.x - dx * R * 1.1 + (rnd() - 0.5) * R * 0.6, sz = V.z - dz * R * 1.1 + (rnd() - 0.5) * R * 0.6, h = 7 + rnd() * 9, life = (2.4 * R) / sp;
      for (let k = 0; k < n; k++) { const ox = (rnd() - 0.5) * 5, oz = (rnd() - 0.5) * 5, oy = (rnd() - 0.5) * 2, ph = rnd() * 6.28, f = 11 + rnd() * 4, s0 = 0.45 + rnd() * 0.15;
        this.flock.spawn({ x: sx + ox, y: h + oy, z: sz + oz, vx: 0, vy: 0, vz: 0, w: 0, life, s0, s1: s0, col: [0.1, 0.09, 0.08], step: (q, dt2) => {
          q.x += dx * sp * dt2 + Math.sin(q.age * 1.7 + ph) * 0.8 * dt2; q.z += dz * sp * dt2 + Math.cos(q.age * 1.3 + ph) * 0.8 * dt2; q.y += Math.sin(q.age * 2.1 + ph) * 0.5 * dt2;
          const glide = Math.sin(q.age * 0.9 + ph) > 0.6; q.flip = !glide && Math.sin(q.age * f * 0.5 + ph) > 0; q.s0 = q.s1 = s0; } }); }
    }
    // forge sparks: a burst every hammer blow
    for (const e of W.emitters) {
      if (e.type !== 'sparks' || !this.day && !(this.lampThresh > 0) ) continue;
      if (Math.hypot(e.x - V.x, e.z - V.z) > R * 1.4) continue;
      if (rnd() < dt * 1.1) for (let k = 0; k < 14; k++) { const a = rnd() * 6.28, v = 1 + rnd() * 3; this.sparks.spawn({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * v, vy: 1.5 + rnd() * 3, vz: Math.sin(a) * v, w: 0, life: 0.35 + rnd() * 0.45, s0: 0.16, s1: 0.06, col: [1.8, 0.95, 0.35], g: e.y - 0.95, step: (q, dt2) => { q.vy -= 9.8 * dt2; if (q.y < q.g) { q.vy = Math.abs(q.vy) * 0.3; q.vx *= 0.5; q.vz *= 0.5; } } }); }
    }
    // moths round the lit lamps near the view
    if (this.lampThresh > 0 && !p.rain && !p.dust && this.moths.p.length < 12 * 6) {
      const lamps = W.lights.filter((l) => (l.kind === 'street' || l.kind === 'lamp') && l.r < this.lampThresh && Math.hypot(l.x - V.x, l.z - V.z) < R).slice(0, 12);
      for (const l of lamps) if (!this.moths.p.some((q) => q.l === l)) for (let k = 0; k < 5; k++) { const ph = rnd() * 6.28, rr = 0.25 + rnd() * 0.5, sp = 3 + rnd() * 4;
        this.moths.spawn({ l, x: l.x, y: l.y, z: l.z, vx: 0, vy: 0, vz: 0, w: 0, life: 1e9, s0: 0.12, s1: 0.12, col: [1.4, 1.3, 1.0], step: (q) => { const t = q.age * sp + ph; q.x = l.x + Math.cos(t) * rr + Math.sin(t * 2.7) * 0.12; q.z = l.z + Math.sin(t * 1.3) * rr; q.y = l.y - 0.15 + Math.sin(t * 1.9) * 0.25; } }); }
    }
  }
  setPersp(on) { this.persp = on; }
  update(dt, pxPerM) {
    if (!this.world || !this.preset) return;
    this.t += dt;
    const p = this.preset;
    const wind = [0.45, 0.18];
    for (const pool of this.pools) { pool.mat.uniforms.uPx.value = pxPerM; pool.mat.uniforms.uPersp.value = this.persp ? 1 : 0; }
    this.ambient(dt);
    this.updateSearch(dt);
    const cookTime = { morning: 0.6, noon: 0.12, afternoon: 0.15, sunset: 0.5, twilight: 0.6, night: 0.45, dead: 0.04 }[p.id] ?? 0.3;
    for (const e of this.world.emitters) {
      const key = e;
      let rate = 0, kind = e.type;
      if (kind === 'smoke') {
        if (e.always) rate = e.r < this.lampThresh ? 2.2 : 0.8; // smouldering fire pits
        else rate = e.r < cookTime ? 1.6 : 0;
      } else if (kind === 'fire') rate = e.r < this.lampThresh ? (e.small ? 10 : 18) : 0;
      if (!rate) continue;
      let a = (this.acc.get(key) || 0) + dt * rate;
      while (a >= 1) {
        a -= 1;
        if (kind === 'smoke') this.smoke.spawn({ x: e.x + (Math.random() - 0.5) * 0.2, y: e.y, z: e.z + (Math.random() - 0.5) * 0.2, vx: (Math.random() - 0.5) * 0.1, vy: 0.55 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.1, w: 1, life: 6 + Math.random() * 3, s0: 0.5, s1: 3.2 + Math.random(), col: this.smokeCol, base: e.always ? 0.42 : 0.3 });
        else this.flame.spawn({ x: e.x + (Math.random() - 0.5) * 0.25, y: e.y, z: e.z + (Math.random() - 0.5) * 0.25, vx: 0, vy: 0.9 + Math.random() * 0.6, vz: 0, w: 0.15, life: 0.45 + Math.random() * 0.3, s0: e.small ? 0.35 : 0.6, s1: 0.1, col: [1.6, 1.0, 0.5] });
      }
      this.acc.set(key, a);
    }
    // dust: daytime wisps over open ground
    if (['noon', 'afternoon', 'morning', 'sunset'].includes(p.id) && this.dust.p.length < 40 && Math.random() < dt * 6) {
      const T = this.world.terrain;
      const x = (Math.random() - 0.5) * T.W, z = (Math.random() - 0.5) * T.D;
      if (!(this.world.veg && Math.random() < this.world.veg.at(x, z) * 1.6)) this.dust.spawn({ x, y: T.height(x, z) + 0.4, z, vx: 0.3, vy: 0.05, vz: 0.1, w: 2.2, life: 5 + Math.random() * 3, s0: 1.5, s1: 4.5, col: this.dustCol });
    }
    this.smoke.update(dt, wind, (q, t) => q.base * Math.min(1, t * 5) * (1 - t));
    this.dust.update(dt, wind, (q, t) => 0.16 * Math.sin(Math.PI * t));
    this.flame.update(dt, wind, (q, t) => 0.9 * (1 - t));
    const tt = this.t;
    this.glow.update(dt, [0, 0], (q) => q.a * (q.flicker ? 0.75 + 0.25 * Math.sin(tt * 13 + q.ph) * Math.sin(tt * 7.3 + q.ph * 2) : 1));
    this.rain.update(dt, [0, 0], () => 0.32);
    this.sand.update(dt, [0, 0], (q, t) => 0.55 * Math.sin(Math.PI * t));
    this.devil.update(dt, wind, (q, t) => q.base * Math.sin(Math.PI * t));
    this.tumble.update(dt, [0, 0], (q, t) => Math.min(1, t * 8, (1 - t) * 8));
    this.birds.update(dt, [0, 0], (q, t) => Math.min(1, t * 25, (1 - t) * 25) * 0.9);
    this.flock.update(dt, [0, 0], (q, t) => Math.min(1, t * 12, (1 - t) * 12) * 0.9);
    this.sparks.update(dt, [0, 0], (q, t) => 1 - t);
    this.moths.update(dt, [0, 0], (q) => 0.6 + 0.4 * Math.sin(tt * 30 + q.x * 10));
  }
}

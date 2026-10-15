// Iso clouds: when the iso camera is zoomed far out, a cloud layer ~200 m up drifts over the land. It is the same
// noise field as the cloud shadows (materials.js cloudShade), shifted along the sun so each cloud sits right above its
// own shadow, moving with the same wind (U.uCloudOff). Lit on the sun side, tinted by the preset; hidden up close and
// in free cam / walk.
import * as THREE from 'three';
import { U, CLOUD_FIELD } from './materials.js';

const H = 200;

export class IsoClouds {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uCloudOff: U.uCloudOff, uShift: { value: new THREE.Vector2() }, uSunXZ: { value: new THREE.Vector2(0, 1) }, uAmt: { value: 0.35 }, uFade: { value: 0 }, uCov: { value: 0 },
        uLit: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.6, 0.62, 0.66) }, uHaze: { value: new THREE.Color(0.8, 0.8, 0.8) }, uHazeK: { value: 0.2 }, uCtr: { value: new THREE.Vector2() }, uR: { value: 1 } },
      vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
        gl_Position.z = clamp(gl_Position.z, -0.999 * gl_Position.w, 0.999 * gl_Position.w); }`, // never cut by the near / far planes
      fragmentShader: /* glsl */ `
        uniform vec2 uCloudOff, uShift, uSunXZ, uCtr; uniform float uAmt, uFade, uCov, uHazeK, uR; uniform vec3 uLit, uShade, uHaze; varying vec3 vW;
        float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(cHash(i), cHash(i + vec2(1, 0)), f.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), f.x), f.y); }
        ${CLOUD_FIELD}
        void main() {
          float mask = 1.0 - smoothstep(0.45, 1.0, length(vW.xz - uCtr) / uR);   // soft edge all round: no plane edges
          vec2 q = (vW.xz - uShift) / 60.0 + uCloudOff;                        // the ground point this cloud shades
          float n = cumulus(q);
          float d = smoothstep(CU_T - 0.07 - uCov, CU_T + 0.34 - uCov, n);    // wide, feathered edges
          d = pow(d, 1.3);
          // high wisps: thin fibrous streaks (no shadow)
          vec2 qc = (vW.xz - uShift * 1.6) / 60.0 + uCloudOff * 1.4;
          float ci = cuFbm(vec2(qc.x * 0.22 + qc.y * 0.08, qc.y * 1.9 - qc.x * 0.1) * 1.3 + 4.0);
          float wisp = smoothstep(0.5, 0.8, ci) * smoothstep(0.35, 0.75, cNoise(qc * 0.18 + 9.0)) * 0.35;
          float a = max(d * 0.85, wisp) * mask;
          if (a < 0.004) discard;
          float ns = cumulus(q + uSunXZ * 0.04);                               // denser toward the sun: that side is in its own shade
          float lit = clamp(0.6 + (n - ns) * 7.0, 0.0, 1.0) * (0.8 + 0.2 * smoothstep(CU_T, CU_T + 0.3, n));
          vec3 c = mix(uShade, uLit, mix(lit, 1.0, 0.35 * (1.0 - d)));        // thin edges catch the light
          c = mix(c, uLit * 0.95, wisp * (1.0 - d));
          c = mix(c, uHaze, uHazeK);
          gl_FragColor = vec4(c, a * uAmt * uFade);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat);
    this.mesh.renderOrder = 20; this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.userData.noShadow = true;
    this.mesh.layers.set(0);
    scene.add(this.mesh);
    this.amt = 0.35;
  }
  // preset: sun direction, colours, cover
  apply(p, sd) {
    const u = this.mat.uniforms, y = Math.max(0.22, sd[1]);
    u.uShift.value.set((sd[0] / y) * H, (sd[2] / y) * H);
    const L = Math.hypot(sd[0], sd[2]) || 1; u.uSunXZ.value.set(sd[0] / L, sd[2] / L);
    const night = !!p.moon, over = !!p.overcast || p.weather === 'rain';
    const k = night ? 0.35 : p.sunHidden ? 0.55 : 1;
    const sun = p.sun.col.map((c) => Math.min(1.25, c * Math.max(0.5, p.sun.k) * k)), amb = p.amb.map((c) => c * p.ambK * 1.4);
    u.uLit.value.setRGB(...sun.map((c, i) => Math.min(1.1, c * 0.75 + amb[i] * 0.45 + 0.12 * k)));
    u.uShade.value.setRGB(...amb.map((c, i) => Math.min(1, c * 0.7 + p.sky.hor[i] * 0.18)));
    if (over) { u.uLit.value.multiplyScalar(0.82); u.uShade.value.multiplyScalar(0.85); }
    u.uHaze.value.setRGB(...p.sky.hor); u.uHazeK.value = Math.min(0.25, 0.04 + (p.haze || 0) * 0.25);
    u.uCov.value = over ? 0.14 : 0;
    this.amt = over ? 0.75 : Math.min(0.6, 0.18 + (p.clouds ?? 0.35) * 0.9); // fair-weather cumulus stay see-through
  }
  update(stage) {
    const cam = stage.iso, viewH = (cam.top - cam.bottom) / cam.zoom;
    const fade = stage.free ? 0 : THREE.MathUtils.smoothstep(viewH, 140, 260);
    this.mesh.visible = fade > 0.01;
    if (!this.mesh.visible) return;
    const t = stage.controls.target, span = viewH * 4 + H * 3;
    this.mesh.position.set(t.x, (t.y || 0) + H, t.z); this.mesh.scale.set(span, 1, span);
    this.mat.uniforms.uFade.value = fade;
    this.mat.uniforms.uCtr.value.set(t.x, t.z); this.mat.uniforms.uR.value = span / 2;
    this.mat.uniforms.uAmt.value = this.amt;
  }
}

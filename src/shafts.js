// Searchlight light shafts: a half-resolution screen pass that walks each view ray from the eye to the first surface
// (the depth buffer) and gathers the light scattered by the haze inside the live spot cones, tested against their
// shadow maps (spots.js) — so beams stop at walls, and fences / trees / building edges cut dark shafts through them.
// Only the shadowed slots (the 4 nearest lights). Dithered steps + a small blur in the post pass: soft, streaky haze.
import * as THREE from 'three';
import { U } from './materials.js';

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Shafts {
  constructor() {
    const pick = (keys) => Object.fromEntries(keys.map((k) => [k, U[k]]));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uDens: { value: 0.03 }, uFrame: { value: 0 }, uMaxD: { value: 160 },
        ...pick(['uSpotN', 'uSpotP', 'uSpotD', 'uSpotC', 'uSpotA', 'uSpotM', 'uSpotNF', 'uSpotS0', 'uSpotS1', 'uSpotS2', 'uSpotS3']),
      },
      depthTest: false, depthWrite: false,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth; uniform mat4 uInvVP; uniform vec3 uCam; uniform float uDens; uniform float uFrame; uniform float uMaxD;
        uniform float uSpotN; uniform vec3 uSpotP[8]; uniform vec3 uSpotD[8]; uniform vec3 uSpotC[8]; uniform vec4 uSpotA[8]; uniform mat4 uSpotM[4]; uniform vec3 uSpotNF[4];
        uniform sampler2D uSpotS0; uniform sampler2D uSpotS1; uniform sampler2D uSpotS2; uniform sampler2D uSpotS3;
        varying vec2 vUv;
        vec3 wpos(vec2 p, float dz) { vec4 w = uInvVP * vec4(p * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0); return w.xyz / w.w; }
        float lin(float d, vec2 nf) { float z = d * 2.0 - 1.0; return 2.0 * nf.x * nf.y / (nf.y + nf.x - z * (nf.y - nf.x)); }
        float lit(sampler2D S, int i, vec3 p) {
          vec4 c = uSpotM[i] * vec4(p, 1.0); vec3 q = c.xyz / c.w * 0.5 + 0.5;
          if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
          vec2 nf = uSpotNF[i].xy; float st = lin(texture(S, q.xy).r, nf);
          return (st < 2.2 || st + 0.15 >= lin(q.z, nf)) ? 1.0 : 0.0;
        }
        // ray (o + t·v, t in [0, T]) against the light's bounding sphere -> [t0, t1]
        vec2 span(vec3 o, vec3 v, float T, int i) {
          float R = uSpotA[i].z * 0.5; vec3 C = uSpotP[i] + uSpotD[i] * R, oc = o - C;
          float b = dot(oc, v), c = dot(oc, oc) - R * R, h = b * b - c;
          if (h < 0.0) return vec2(1.0, 0.0);
          h = sqrt(h); return vec2(max(0.0, -b - h), min(T, -b + h));
        }
        vec3 gather(sampler2D S, int i, vec3 o, vec3 v, float T, float jit) {
          vec2 sp = span(o, v, T, i);
          if (sp.y <= sp.x) return vec3(0.0);
          vec4 A = uSpotA[i]; vec3 P = uSpotP[i], D = uSpotD[i];
          const int N = 20; float dt = (sp.y - sp.x) / float(N), acc = 0.0;
          for (int k = 0; k < N; k++) {
            vec3 p = o + v * (sp.x + (float(k) + jit) * dt);
            vec3 d = p - P; float L = length(d); if (L < 0.6 || L > A.z) continue;
            float cs = dot(d / L, D); if (cs < A.x) continue;
            float cone = smoothstep(A.x, A.y, cs), att = 1.0 - (L / A.z) * (L / A.z);
            // scattering toward the eye: brighter looking down the beam into the lamp, still visible side-on
            float ph = 0.35 + 1.4 * pow(max(dot(-v, D), 0.0), 6.0);
            acc += cone * att * ph * lit(S, i, p) / (1.0 + L * 0.04);
          }
          return uSpotC[i] * acc * dt;
        }
        void main() {
          float dz = texture(tDepth, vUv).r;
          vec3 e = wpos(vUv, dz < 0.99999 ? dz : 0.9999);
          vec3 o = wpos(vUv, 0.0); // this pixel's point on the near plane (works for the iso camera too)
          vec3 v = e - o; float T = min(length(v), uMaxD); v /= max(length(e - o), 1e-4);
          float jit = fract(sin(dot(gl_FragCoord.xy + uFrame * 7.13, vec2(12.9898, 78.233))) * 43758.5453);
          vec3 a = vec3(0.0);
          if (uSpotN > 0.5) a += gather(uSpotS0, 0, o, v, T, jit);
          if (uSpotN > 1.5) a += gather(uSpotS1, 1, o, v, T, jit);
          if (uSpotN > 2.5) a += gather(uSpotS2, 2, o, v, T, jit);
          if (uSpotN > 3.5) a += gather(uSpotS3, 3, o, v, T, jit);
          gl_FragColor = vec4(a * uDens, 1.0);
        }`,
    });
    this.scene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false; this.scene.add(q);
    this.cam = new THREE.Camera();
    this.rt = null; this.frame = 0;
  }
  resize(w, h) {
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), { type: THREE.HalfFloatType, depthBuffer: false });
  }
  // returns the shafts texture, or null when there's nothing to draw
  render(renderer, depthTex, cam, preset) {
    if (!(U.uSpotN.value > 0) || !this.rt) return null;
    const u = this.mat.uniforms;
    u.tDepth.value = depthTex;
    cam.updateMatrixWorld();
    u.uInvVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    u.uCam.value.copy(cam.position);
    // haze in the air carries the beam: the Haze slider, more in dust, a little more in rain
    const hz = preset?.hazeK ?? 0.3;
    u.uDens.value = 0.028 * (0.45 + hz * 1.6) * (preset?.weather === 'dust' ? 2.5 : preset?.weather === 'rain' ? 1.5 : 1);
    u.uFrame.value = (this.frame = (this.frame + 1) % 64);
    // iso: the "eye" is far away up the view axis — march only the last stretch before the ground
    u.uMaxD.value = cam.isPerspectiveCamera ? 160 : 1e5;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.cam); renderer.setRenderTarget(prev);
    return this.rt.texture;
  }
}

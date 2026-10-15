// Stage: renderer, 2.5D isometric camera, sky backdrop, HDR scene target -> post (tonemap, grade,
// LUT, dither, low-res), time-of-day presets with baked lighting, selection outline, PNG export.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { U, MATS } from './materials.js';
import { Clutter } from './groundfx.js';
import { PRESET, PRESETS, presetAtHour, presetHour, sunDir , withWeather, withHaze } from './presets.js';
import { Baker } from './bake.js';
import { Effects } from './effects.js';
import { computeHeat } from './heat.js';
import { SpotLights } from './spots.js';
import { Shafts } from './shafts.js';
import { lifeTimeOfDay } from './life.js';
import { IsoClouds } from './clouds.js';

const FS_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
function fsTri() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

export class Stage {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false }));
    this.dpr = Math.min(window.devicePixelRatio, 2);
    r.setPixelRatio(this.dpr);
    r.autoClear = false;
    container.appendChild(r.domElement);
    this.look = { lowres: false, dither: false, grade: true, ps2: false, shades: false, lut: null, glow: true, flare: true, trails: false };

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(12);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    this.controls.minZoom = 0.35;
    this.controls.maxZoom = 80; // set per map in load: ~3 m of ground fills the screen
    this.controls.enableZoom = false; // our own eased, percentage-based wheel zoom (below)
    this.controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }; // the same in Explore and Build: left selects / uses the tool, hold the wheel to rotate, right-drag pans
    this.controls.zoomToCursor = true;
    this.iso = this.camera;
    // free camera: perspective, mouse-look + WASD
    this.persp = new THREE.PerspectiveCamera(60, 1, 0.25, 4000);
    this.free = false;
    this.fly = { yaw: 0, pitch: -0.25, speed: 10 };
    this.keys = new Set();
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    window.addEventListener('keydown', (e) => { if (!typing()) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const el = r.domElement;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { if (!this.free) return; drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0 }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!this.free || !drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.b === 0) {
        this.fly.yaw -= dx * 0.0035; this.fly.pitch = THREE.MathUtils.clamp(this.fly.pitch - dy * 0.0035, -1.5, 1.5);
      } else if (!this.walk) { // right / middle drag: strafe and lift
        const c = this.persp, right = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion);
        c.position.addScaledVector(right, -dx * 0.05).y += dy * 0.05;
      }
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('contextmenu', (e) => { if (this.free) e.preventDefault(); });
    el.addEventListener('wheel', (e) => {
      if (!this.free) { // iso: each notch scales the zoom by ~16%, eased, aimed at the cursor
        e.preventDefault();
        // hold Alt + two-finger swipe (or Alt + wheel): orbit sideways, tilt up / down; otherwise the wheel / pinch zooms
        if (e.altKey && !e.ctrlKey) {
          const t = this.controls.target, off = this.camera.position.clone().sub(t), sp = new THREE.Spherical().setFromVector3(off);
          sp.theta += e.deltaX * 0.0045;
          sp.phi = THREE.MathUtils.clamp(sp.phi + e.deltaY * 0.003, this.controls.minPolarAngle, this.controls.maxPolarAngle);
          this.camera.position.copy(t).add(off.setFromSpherical(sp));
          this.controls.update();
          return;
        }
        const n = Math.max(-4, Math.min(4, e.ctrlKey ? e.deltaY / 12 : e.deltaY / 100 || Math.sign(e.deltaY)));
        const z0 = this._isoZ ?? this.iso.zoom;
        this._isoZ = THREE.MathUtils.clamp(z0 * Math.pow(1.16, -n), this.controls.minZoom, this.controls.maxZoom);
        const rc = el.getBoundingClientRect();
        this._isoAim = [((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1];
        return;
      }
      e.preventDefault();
      // logarithmic: each notch covers ~14% of the height above the ground (fast up high, fine near
      // the ground); the move is eased over a few frames
      const T = this.world?.terrain, c = this.persp.position;
      const h = Math.max(0.3, c.y - (T ? T.height(c.x, c.z) : 0));
      const n = Math.max(-3, Math.min(3, e.deltaY / 100 || Math.sign(e.deltaY)));
      this._zoomQ = (this._zoomQ || 0) - n * Math.max(0.12, h * 0.14);
    }, { passive: false });

    this.overlay = new THREE.Group();
    this.scene.add(this.overlay);
    this.effects = new Effects();
    this.clutter = new Clutter();
    this.scene.add(this.effects.group);

    // sky backdrop
    this.skyMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() }, uSunHaze: { value: 0.5 }, uSunVis: { value: 1 }, uStars: { value: 0 }, uMoon: { value: 0 },
        uCamF: { value: new THREE.Vector3() }, uCamR: { value: new THREE.Vector3() }, uCamU: { value: new THREE.Vector3() }, uAspect: { value: 1 }, uTan: { value: 0.8 }, uFogCol: { value: new THREE.Color() }, uFogAmt: { value: 0 }, uHills: { value: 1 }, uSierra: { value: new THREE.Vector2(1, 0) }, uTime: U.uTime, uCloudOff: U.uCloudOff, uCloudAmt: { value: 0.35 }, uCloudGrey: { value: 0 }, uSunCol2: { value: new THREE.Color() }, uAmb2: { value: new THREE.Color() },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform vec3 uZen, uHor, uGlow, uSunDir, uCamF, uCamR, uCamU; uniform float uSunHaze, uSunVis, uStars, uMoon, uAspect, uTime, uTan, uFogAmt, uHills; uniform vec3 uFogCol; uniform vec2 uSierra;
        uniform vec2 uCloudOff; uniform float uCloudAmt, uCloudGrey; uniform vec3 uSunCol2, uAmb2;
        float ch(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
        float cfbm(vec2 p) { return cn(p) * 0.5 + cn(p * 2.1 + 3.1) * 0.27 + cn(p * 4.3 - 1.7) * 0.15 + cn(p * 8.7 + 0.4) * 0.08; }
        varying vec2 vUv;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec2 ndc = vUv * 2.0 - 1.0;
          vec3 d = normalize(uCamF + (ndc.x * uAspect * uCamR + ndc.y * uCamU) * uTan);
          float e = d.y;
          vec3 c = mix(uHor, uZen, pow(clamp(e, 0.0, 1.0), 0.42));
          float mu = dot(d, normalize(uSunDir));
          float hz = uSunHaze;
          float wide = pow(max(mu, 0.0), mix(14.0, 3.5, hz)) * mix(0.18, 0.75, hz);
          float halo = pow(max(mu, 0.0), mix(500.0, 70.0, hz)) * mix(0.8, 1.4, hz);
          c += uGlow * (wide + halo) * uSunVis;
          c = mix(c, uGlow * 0.85, uSunVis * pow(max(mu, 0.0), 2.0) * (1.0 - smoothstep(0.0, 0.3, abs(e))) * hz * 0.55);
          float disc = smoothstep(cos(0.032), cos(0.026), mu) * step(-0.01, uSunDir.y);
          c += uGlow * 6.0 * disc * uSunVis * (1.0 - 0.55 * hz);
          if (uMoon > 0.0) {
            c += vec3(0.85, 0.9, 1.0) * smoothstep(cos(0.03), cos(0.026), mu) * 1.6 * uMoon;
            c += vec3(0.25, 0.3, 0.42) * pow(max(mu, 0.0), 40.0) * 0.35 * uMoon;
          }
          if (uStars > 0.0 && e > 0.0) {
            vec3 sd = d * 260.0; vec3 cell = floor(sd); float h = hash(cell);
            if (h > 0.994) { float s = smoothstep(0.22, 0.0, length(fract(sd) - 0.5)); c += vec3(0.9, 0.95, 1.0) * s * uStars * (0.55 + 0.45 * sin(uTime * 2.0 + h * 90.0)) * smoothstep(0.0, 0.2, e); }
          }
          // painted clouds, two layers on a flat sky plane: low puffy cumulus (lit on the sun side) and high cirrus streaks
          if (e > 0.0 && (uCloudAmt > 0.0 || uCloudGrey > 0.0)) {
            vec2 sp = d.xz / (e + 0.06);
            float fade = smoothstep(0.0, 0.12, e);
            vec2 q1 = sp * 0.55 + uCloudOff * 0.215;
            float n1 = cfbm(q1), cov = mix(0.66, 0.42, uCloudAmt);
            float m1 = smoothstep(cov, cov + 0.16, n1) * fade;
            float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4)), 0.0, 1.0);
            float thick = smoothstep(cov, cov + 0.4, cfbm(q1 + vec2(0.07, 0.05)));
            vec3 cc = uAmb2 * 0.9 + uSunCol2 * (0.32 + 0.2 * lit) * (1.0 - 0.55 * thick);
            cc = mix(cc, uHor, 0.35 * (1.0 - smoothstep(0.0, 0.35, e)));
            c = mix(c, cc, m1 * 0.92);
            vec2 q2 = vec2(sp.x * 0.18 + sp.y * 0.05, sp.y * 1.1) + uCloudOff * 0.32 + 11.0;
            float m2 = smoothstep(0.55, 0.85, cfbm(q2)) * smoothstep(0.35, 0.75, cn(sp * 0.12 + 4.0)) * fade * uCloudAmt;
            c = mix(c, uHor * 0.6 + uSunCol2 * 0.35 + uGlow * 0.15, m2 * 0.45 * (1.0 - m1));
            if (uCloudGrey > 0.0) { float g = cfbm(sp * 0.35 + uCloudOff * 0.134); c = mix(c, uHor * (0.85 + 0.25 * g), uCloudGrey * fade); }
          }
          if (e < 0.0) c = mix(c, uHor, smoothstep(0.0, -0.08, e));
          // the land round about, by bearing: the sierra in layered ridges on its side, low rolling hills
          // along the slope (north / south), and only the flat sea horizon on the coast side
          float az = atan(d.x, d.z);
          vec2 hd = normalize(d.xz + vec2(1e-5));
          float sd = dot(hd, uSierra), rel = atan(dot(hd, vec2(-uSierra.y, uSierra.x)), sd); // bearing off the sierra, -pi..pi
          float mtn = smoothstep(0.0, 0.6, sd), seaK = smoothstep(-0.2, -0.65, sd);
          // the sierra: two ranges of rounded summits with saddles between (Baja's eroded granite / old volcanic hills),
          // the near one darker, the far one paler and a little higher behind it, a cone or two standing out
          float back = 0.0, front = 0.0;
          for (int i = 0; i < 26; i++) {
            float fi = float(i), h1r = fract(sin(fi * 12.9898 + 1.3) * 43758.5), h2r = fract(sin(fi * 78.233 + 4.1) * 23421.6), h3r = fract(sin(fi * 37.719 + 2.7) * 13758.9);
            float cf = -1.75 + fi * 0.135 + (h1r - 0.5) * 0.07, wf = 0.06 + h2r * 0.05, af = 0.024 + h3r * 0.016;
            front = max(front, af * exp(-pow((rel - cf) / wf, 2.0)));
            float cb = -1.7 + fi * 0.135 + (h2r - 0.5) * 0.1 + 0.06, wb = 0.09 + h3r * 0.08, ab = 0.034 + h1r * 0.018;
            back = max(back, ab * exp(-pow((rel - cb) / wb, 2.0)));
          }
          front = max(front, 0.015 + 0.003 * sin(rel * 19.0)); back = max(back, 0.022);
          back = max(back, 0.06 * exp(-pow((rel + 0.42) / 0.075, 2.0))); // a volcanic cone
          float lo1 = 0.010 + 0.004 * sin(az * 5.0 + 1.3) + 0.0025 * sin(az * 11.0 + 0.4) + 0.001 * sin(az * 23.0 + 2.0);
          float lo2 = 0.005 + 0.003 * sin(az * 7.0 + 4.1) + 0.0015 * sin(az * 13.0 + 0.7);
          float h1 = mix(lo1, back, mtn) * (1.0 - seaK), h2 = mix(lo2, front, mtn) * (1.0 - seaK);
          vec3 fogc = uFogCol;
          // haze band on the horizon first, then the ranges over it with their own aerial perspective
          c = mix(c, fogc, exp(-abs(e - 0.005) * 26.0) * (0.45 + 0.4 * uFogAmt));
          c = mix(c, fogc, (1.0 - smoothstep(-0.02, 0.22, e)) * uFogAmt * 0.6);
          vec3 cool = vec3(dot(fogc, vec3(0.3333))) * vec3(0.9, 0.96, 1.1);
          vec3 far = mix(mix(fogc, c, 0.2) * 0.9, cool * 0.74, mtn * 0.85), mid = mix(fogc * 0.82, cool * 0.58, mtn * 0.9);
          float vis = uHills * (1.0 - 0.8 * uFogAmt);
          c = mix(c, far, smoothstep(h1 + 0.002, h1 - 0.002, e) * vis * step(0.001, h1));
          c = mix(c, mid, smoothstep(h2 + 0.0018, h2 - 0.0018, e) * vis * step(0.001, h2));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.skyScene = new THREE.Scene();
    const sky = new THREE.Mesh(fsTri(), this.skyMat); sky.frustumCulled = false;
    this.skyScene.add(sky);
    this.fsCam = new THREE.Camera();
    this.clouds = new IsoClouds(this.scene); // iso, zoomed far out: clouds over their own shadows

    // post
    this.postMat = new THREE.ShaderMaterial({
      
      uniforms: {
        tScene: { value: null }, uExposure: { value: 1 }, uGrade: { value: 1 }, uDither: { value: 0 }, uLutOn: { value: 0 }, uPS2: { value: 0 }, uShades: { value: 0 }, uBright: { value: 0 }, uContrast: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 1000) },
        uGlow: { value: 1 }, tPrev: { value: null }, uTrails: { value: 0 }, tDepth: { value: null }, uSunScr: { value: new THREE.Vector3(0, 0, 0) }, uFlare: { value: 0 }, uFlareCol: { value: new THREE.Color(1, 0.9, 0.7) }, uHeat: { value: 0 }, uTime: U.uTime, uAspect: { value: 1.6 },
        tTemp: { value: null }, uTempRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uTempOn: { value: 0 }, uHasTemp: { value: 0 }, uInvVP: { value: new THREE.Matrix4() }, uPitch: { value: 0 }, uTanHalf: { value: 0.5 }, uMirA: { value: 0.03 }, uMirK: { value: 0 }, uPersp: { value: 0 }, uAir: { value: 20 }, uCamPos: { value: new THREE.Vector3() }, uGlareN: { value: 0 }, uGlareP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uGlareK: { value: [0, 1, 2, 3].map(() => 0) }, uGlareVeil: { value: 0 }, tShafts: { value: null }, uShaftsOn: { value: 0 }, tAct: { value: null }, uActRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uActOn: { value: 0 },
        uLut: { value: null }, uLutSize: { value: 2 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        precision highp sampler3D;
        uniform sampler2D tScene; uniform float uExposure; uniform int uGrade; uniform int uDither; uniform int uLutOn; uniform sampler3D uLut; uniform float uLutSize; uniform int uPS2; uniform int uShades; uniform vec2 uTexel; uniform float uBright, uContrast;
        uniform float uGlow; uniform sampler2D tPrev; uniform float uTrails; uniform sampler2D tDepth; uniform vec3 uSunScr; uniform float uFlare; uniform vec3 uFlareCol; uniform float uHeat; uniform float uTime; uniform float uAspect;
        uniform sampler2D tTemp; uniform vec4 uTempRect; uniform float uTempOn, uHasTemp, uPitch, uTanHalf, uMirA, uMirK, uPersp, uAir; uniform mat4 uInvVP; uniform vec3 uCamPos;
        uniform float uGlareN; uniform vec4 uGlareP[4]; uniform float uGlareK[4]; uniform float uGlareVeil;
        uniform sampler2D tShafts; uniform float uShaftsOn;
        uniform sampler2D tAct; uniform vec4 uActRect; uniform float uActOn;
        vec3 wpos(vec2 p, float dz) { vec4 w = uInvVP * vec4(p * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0); return w.xyz / w.w; }
        vec4 tempAt(vec3 w) { vec2 t = (w.xz - uTempRect.xy) / (uTempRect.zw - uTempRect.xy); vec4 r = texture(tTemp, clamp(t, 0.0, 1.0)); if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) r.g = -1e4; return r; }
        float vn(float x) { float i = floor(x), f = fract(x); float a = fract(sin(i * 12.9898) * 43758.545), b = fract(sin((i + 1.0) * 12.9898) * 43758.545); return mix(a, b, f * f * (3.0 - 2.0 * f)); }
        float scrY(float th) { return tan(th - uPitch) / uTanHalf * 0.5 + 0.5; }
        vec3 ramp(float t) { t = clamp(t, 0.0, 1.0);
          vec3 c0 = vec3(0.12, 0.25, 0.85), c1 = vec3(0.1, 0.75, 0.9), c2 = vec3(1.0, 0.92, 0.25), c3 = vec3(1.0, 0.5, 0.1), c4 = vec3(0.85, 0.08, 0.08);
          return t < 0.25 ? mix(c0, c1, t / 0.25) : t < 0.5 ? mix(c1, c2, (t - 0.25) / 0.25) : t < 0.75 ? mix(c2, c3, (t - 0.5) / 0.25) : mix(c3, c4, (t - 0.75) / 0.25); }
        vec3 bright(vec2 uv, float th) { vec3 s = texture(tScene, uv).rgb; return max(s - th, 0.0); }
        varying vec2 vUv;
        vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        float bayer(ivec2 p) { int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return float(m[(p.y & 3) * 4 + (p.x & 3)]) / 16.0; }
        void main() {
          vec2 uv = vUv;
          float dz0 = texture(tDepth, vUv).r; bool solid = dz0 < 0.99999;
          float hot = 0.0, tC = uAir; vec4 TT = vec4(uAir, -1e4, 0.0, 0.0); vec3 W0 = vec3(0.0);
          if (uHasTemp > 0.0 && solid) { W0 = wpos(vUv, dz0); TT = tempAt(W0); tC = TT.r; hot = smoothstep(30.0, 58.0, tC); }
          vec3 mir = vec3(0.0); float mirK = 0.0;
          if (uMirK > 0.0 && uHasTemp > 0.0) {
            // heat haze: slow, low-frequency waves, broken into horizontal slices, scaled by the surface temperature
            float sl = vn(gl_FragCoord.y / 4.2 + uTime * 1.4);
            float wave = sin(vUv.y * 36.0 + uTime * 1.05 + sin(vUv.x * 4.5 + uTime * 0.3) * 2.2) * 0.65 + (sl - 0.5) * 0.9;
            float dist = solid ? length(W0.xz - uCamPos.xz) : 1e4, farK = smoothstep(100.0, 180.0, dist); // from 100 m out to the horizon // depth: close things stay clean
            float k = hot * uMirK * (uPersp > 0.5 ? farK : 1.0), amp;
            if (uPersp > 0.5) {
              float th = uPitch + atan((vUv.y * 2.0 - 1.0) * uTanHalf), thm = -0.45 * uMirA, q = (th - thm) / uMirA; // q: 0 mirror line, 0.45 horizon
              float nearH = solid ? smoothstep(-3.0, 0.0, q) : 0.0;
              amp = (0.8 + 6.5 * nearH) * k;
              uv.x += wave * uTexel.x * amp;
              uv.y += sin(vUv.x * 17.0 + uTime * 0.7) * uTexel.y * amp * 0.4;
              // distant things lifted and squashed just above the mirror line
              float liftK = uMirK * max(hot, 0.6);
              float lift = uMirA * 0.35 * liftK;
              if (q > -0.05 && q < 0.9 && farK > 0.5) { float th2 = th - lift * (1.0 - smoothstep(0.0, 0.9, q)); uv.y = mix(uv.y, scrY(th2), smoothstep(-0.05, 0.05, q)); }
              // inferior mirage: below the mirror line the far ground turns into a reflection of the sky and
              // whatever stands on the horizon, mirrored and torn into horizontal slices
              if (solid && farK > 0.0 && q < 0.0 && q > -1.5) {
                float thr = thm - (th - thm);
                thr -= lift * (1.0 - smoothstep(0.0, 0.9, (thr - thm) / uMirA));
                float yr = scrY(thr) + (vn(floor(gl_FragCoord.y / 2.0) * 0.71 + uTime * 2.6) - 0.5) * uTexel.y * 6.0;
                vec2 ruv = vec2(vUv.x + wave * uTexel.x * amp * 2.2, clamp(yr, 0.0, 1.0));
                mir = texture(tScene, ruv).rgb * uExposure * vec3(0.95, 0.98, 1.04);
                float rdz = texture(tDepth, ruv).r; float rFar = rdz > 0.99999 ? 1.0 : smoothstep(dist * 0.9, dist * 1.3, length(wpos(ruv, rdz).xz - uCamPos.xz)); // only reflect what's beyond the pool
                float brk = mix(0.5, 1.0, smoothstep(0.3, 0.65, vn(gl_FragCoord.y / 2.5 + uTime * 1.4 + floor(vUv.x * 7.0 + sin(uTime * 0.2)) * 3.1)));
                mirK = min(1.0, k * 1.15) * rFar * smoothstep(-1.5, -0.8, q) * smoothstep(0.0, -0.05, q) * brk;
              }
            } else {
              amp = 1.4 * k;
              uv.x += wave * uTexel.x * amp;
            }
          }
          vec3 c = texture(tScene, uv).rgb * uExposure;
          c = mix(c, mir, mirK);
          if (uGlow > 0.0) { // bloom: lamps, neon, the sun disc bleed into a wide soft halo
            vec3 g = vec3(0.0);
            for (int i = 0; i < 16; i++) { float a = float(i) * 0.3927 + 0.2, r = (i % 2 == 0) ? 7.0 : 16.0; g += bright(vUv + vec2(cos(a), sin(a)) * uTexel * r, 2.1); }
            for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; g += bright(vUv + vec2(cos(a), sin(a)) * uTexel * 30.0, 2.1) * 0.6; }
            c += g / 20.8 * uExposure * 0.55 * uGlow;
          }
          if (uTrails > 0.0) c = mix(c, texture(tPrev, vUv).rgb * uExposure, uTrails); // previous frame (half-res, already exposed)
          if (uFlare > 0.0) { // sun glare + lens-flare ghosts along the line through the screen centre
            vec2 sp = uSunScr.xy, d = vUv - sp; d.x *= uAspect;
            float occ = texture(tDepth, sp).r > 0.9999 ? 1.0 : 0.0;
            float k = uFlare * uSunScr.z * occ;
            if (k > 0.0) {
              float r = length(d);
              c += uFlareCol * (exp(-r * 9.0) * 0.6 + exp(-abs(d.y) * 90.0) * exp(-abs(d.x) * 2.5) * 0.25) * k;
              vec2 axis = vec2(0.5) - sp;
              for (int i = 0; i < 5; i++) {
                float t = float(i) * 0.38 + 0.35, rad = 0.025 + 0.03 * fract(float(i) * 0.61);
                vec2 gp = sp + axis * t * 2.0, q = vUv - gp; q.x *= uAspect;
                vec3 gc = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.6, 0.3), fract(float(i) * 0.37));
                c += gc * smoothstep(rad, rad * 0.6, length(q)) * 0.07 * k;
              }
            }
          }
          if (uShaftsOn > 0.5) { // searchlight light shafts (half-res, blurred a touch)
            vec3 sh = vec3(0.0); vec2 tx = uTexel * 2.0;
            sh += texture(tShafts, vUv).rgb * 0.4;
            sh += (texture(tShafts, vUv + vec2(tx.x, 0.0)).rgb + texture(tShafts, vUv - vec2(tx.x, 0.0)).rgb + texture(tShafts, vUv + vec2(0.0, tx.y)).rgb + texture(tShafts, vUv - vec2(0.0, tx.y)).rgb) * 0.15;
            c += sh * uExposure;
          }
          // searchlight glare: looking into a beam — a hot core, a wide bloom, streaks, and the whole view washing out
          if (uGlareN > 0.5) {
            float sK = 0.0, sV = 0.0;
            for (int i = 0; i < 4; i++) {
              if (float(i) + 0.5 > uGlareN) break;
              vec4 G = uGlareP[i]; float K = uGlareK[i];
              // occlusion: is the lens in front of whatever the depth buffer holds there (5 taps)
              float vis = 0.0;
              for (int k = 0; k < 5; k++) { vec2 o = k == 0 ? vec2(0.0) : vec2(cos(float(k) * 1.571), sin(float(k) * 1.571)) * uTexel * 3.0; vis += texture(tDepth, G.xy + o).r >= G.z - 0.00002 ? 1.0 : 0.0; }
              vis = max(vis / 5.0, G.w); // G.w: after-image floor (keeps glowing a moment after it's covered / gone)
              sK += K; sV += K * vis; K *= vis;
              if (K <= 0.0) continue;
              vec2 d = vUv - G.xy; d.x *= uAspect; float r = length(d);
              vec3 gc = vec3(1.0, 0.98, 0.94);
              c += gc * K * (exp(-r * 70.0) * 6.0 + exp(-r * 14.0) * 1.5 + exp(-r * 4.0) * 0.3);
              c += gc * K * (exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.2) * 0.9 + exp(-abs(d.x) * 160.0) * exp(-abs(d.y) * 4.0) * 0.35); // streaks
            }
            c = mix(c, vec3(1.0, 0.99, 0.97) * 1.6, clamp(uGlareVeil * sV / max(sK, 1e-3), 0.0, 0.85)); // blinded (only as much as the lenses are in sight)
          }
          if (uPS2 == 1) {
            // GTA SA-style soft glow ("trails"): wide blur of the bright parts added back
            vec3 g = vec3(0.0);
            for (int i = 0; i < 12; i++) {
              float a = float(i) * 0.5236, r = (i % 2 == 0) ? 5.0 : 9.0;
              g += texture(tScene, vUv + vec2(cos(a), sin(a)) * uTexel * r).rgb;
            }
            g = g / 12.0 * uExposure;
            c += max(g - 0.75, 0.0) * 0.14; // glow only from bright areas
          }
          if (uShades == 1) c *= 0.78; // a little darker going into the tonemap
          c = aces(c * 0.9);
          c = pow(c, vec3(1.0 / 2.2));
          if (uShades == 1) {
            // "Mexico" grade (Breaking Bad desert): near-monochrome amber — brown-black shadows, burnt-orange mids,
            // hot yellow highlights; blue sky collapses to olive / khaki; punchy contrast, dark corners
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            float t = pow(smoothstep(0.02, 0.98, l), 1.35);
            vec3 sh = vec3(0.16, 0.09, 0.02), md = vec3(0.80, 0.47, 0.07), hi = vec3(1.0, 0.80, 0.30);
            vec3 g = t < 0.5 ? mix(sh, md, t * 2.0) : mix(md, hi, t * 2.0 - 1.0);
            float blue = clamp((c.b - max(c.r, c.g * 0.9)) * 4.0 + 0.15, 0.0, 1.0); // sky / cool shade
            g = mix(g, vec3(0.56, 0.50, 0.17) * (0.55 + 0.75 * l), blue * 0.65);
            c = mix(c, g, 0.86);
            c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q, q) * 0.45;
          }
          if (uPS2 == 1) {
            // colour filter: lifted blacks, a little warmth and saturation, soft vignette
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(l), c, 1.12);
            c = c * vec3(1.03, 1.0, 0.94) * 0.96 + vec3(0.02, 0.018, 0.015);
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q, q) * 0.35;
          }
          if (uGrade == 1) {
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(l), c, 0.86);
            c *= vec3(1.02, 1.0, 0.965);
            c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
            c = clamp(((c - 0.5) * 1.05 + 0.5) * 0.96, 0.0, 1.0); // +5% contrast, 4% darker
          }
          if (uActOn > 0.0 && solid) { // Activity view: quiet (grey-blue) -> lived-in (green) -> life (yellow) -> busy (red)
            vec2 ta = (W0.xz - uActRect.xy) / (uActRect.zw - uActRect.xy);
            float av = texture(tAct, clamp(ta, 0.0, 1.0)).r;
            vec3 ac = av < 0.2 ? mix(vec3(0.25, 0.3, 0.4), vec3(0.3, 0.55, 0.35), av / 0.2) : av < 0.45 ? mix(vec3(0.3, 0.55, 0.35), vec3(0.45, 0.8, 0.3), (av - 0.2) / 0.25) : av < 0.7 ? mix(vec3(0.45, 0.8, 0.3), vec3(1.0, 0.85, 0.25), (av - 0.45) / 0.25) : mix(vec3(1.0, 0.85, 0.25), vec3(0.9, 0.2, 0.12), (av - 0.7) / 0.3);
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(c, ac * (0.45 + 0.75 * l), 0.6);
          }
          if (uTempOn > 0.0 && uHasTemp > 0.0) { // Heat view: 10..70 °C, blue -> cyan -> yellow -> orange -> red
            float t = solid ? (TT.g > -1e3 && abs(W0.y - TT.g) > 0.9 ? mix(uAir, tC, 0.45) : tC) : uAir;
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(c, ramp((t - 10.0) / 60.0) * (0.45 + 0.75 * l), solid ? 0.62 : 0.25);
          }
          if (uLutOn == 1) { vec3 uvw = clamp(c, 0.0, 1.0) * (uLutSize - 1.0) / uLutSize + 0.5 / uLutSize; c = texture(uLut, uvw).rgb; }
          c = clamp((c - 0.5) * uContrast + 0.5 + uBright, 0.0, 1.0); // Settings › Graphics
          if (uDither == 1) { float b = bayer(ivec2(gl_FragCoord.xy)); c = floor(c * 31.0 + b) / 31.0; }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.postScene = new THREE.Scene();
    this.copyMat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null }, tDepth: { value: null } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tColor, vUv).rgb, texture2D(tDepth, vUv).r); }' });
    this.copyScene = new THREE.Scene(); { const cq = new THREE.Mesh(fsTri(), this.copyMat); cq.frustumCulled = false; this.copyScene.add(cq); }
    const pq = new THREE.Mesh(fsTri(), this.postMat); pq.frustumCulled = false;
    this.postScene.add(pq);

    this.size = 240;
    this.presetId = 'afternoon';
    this.manual = /[?&]manual/.test(location.search);
    this._t = performance.now();
    this.onFrame = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - this._t) / 1000, 0.05);
      this._t = now;
      this.move(dt);
      if (!this.free) this.controls.update();
      U.uTime.value += dt;
      U.uCloudOff.value.x += dt * 0.045; U.uCloudOff.value.y += dt * 0.018; // ~3 m/s over the ground (1 unit = 60 m)
      for (const f of this.onFrame) f(dt);
      this.clouds?.update(this);
      { const t = this.free ? this.persp.position : this.controls.target, r = this.free ? 70 : ((this.iso.top - this.iso.bottom) / 2 / this.iso.zoom) * 1.5; this.effects.setView(t.x, t.z, r);
        if (this.world && this.clutterOn !== false) { const cr = this.free ? 34 : ((this.iso.top - this.iso.bottom) / 2 / this.iso.zoom) * 1.25; this.clutter.update(this.world, this.world.group, t.x, t.z, cr, this._preset); } }
      this.effects.player = this.walk ? this.persp.position : null;
      this.effects.camPos = this.free ? this.persp.position : this.camera.position;
      this.effects.update(dt, this.pxPerM());
      if (!this.manual) this.render(); // ?manual: tests render on demand (software GL is slow)
    };
    loop();
  }

  // zoomed in (iso), the sun shadow map is re-fitted to the visible ground; refreshed when the view drifts
  shadowFocus() {
    const B = this.baker; if (!B || !this._preset) return;
    let want = null;
    if (!this.free && this._isoZ == null) {
      const c = this.iso, hw = (c.right - c.left) / 2 / c.zoom, hh = (c.top - c.bottom) / 2 / c.zoom;
      const r = Math.hypot(hw, hh / Math.sin(THREE.MathUtils.degToRad(35))) * 1.15 + 3;
      if (r < this.size * 0.3) want = { x: this.controls.target.x, z: this.controls.target.z, r };
    } else if (!this.free) return; // mid zoom: keep what we have
    const cur = B.focus;
    if (!want && !cur) return;
    if (want && cur && Math.hypot(want.x - cur.x, want.z - cur.z) < cur.r * 0.3 && want.r < cur.r * 1.05 && want.r > cur.r * 0.6) return;
    if (want) want.r *= 1.25; // margin so small pans don't refit
    B.setFocus(want, this._preset);
  }

  pxPerM() {
    const h = this.renderer.domElement.height;
    if (this.free) return h / (2 * Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2)); // divided by depth in the shader
    return h / ((this.camera.top - this.camera.bottom) / this.camera.zoom);
  }

  // WASD: fly in free mode, pan the view in iso mode. Shift = faster. Free mode: E/Space up, Q/C down.
  move(dt) {
    const k = this.keys;
    if (this.walk) return this.walkStep(dt);
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const sd = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1;
    if (this.free) {
      const c = this.persp;
      const up = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0);
      const v = this.fly.speed * fast * dt;
      const fw = new THREE.Vector3(-Math.sin(this.fly.yaw), 0, -Math.cos(this.fly.yaw));
      const rt = new THREE.Vector3(Math.cos(this.fly.yaw), 0, -Math.sin(this.fly.yaw));
      c.position.addScaledVector(fw, f * v).addScaledVector(rt, sd * v);
      c.position.y += up * v;
      if (this._zoomQ) { // eased wheel zoom along the view direction
        const step = Math.abs(this._zoomQ) < 0.01 ? this._zoomQ : this._zoomQ * (1 - Math.exp(-dt * 14));
        this._zoomQ -= step;
        c.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion), step);
      }
      const T = this.world?.terrain;
      if (T) { const g = T.height(c.position.x, c.position.z); if (c.position.y < g + 0.45) { c.position.y = g + 0.45; if (this._zoomQ > 0) this._zoomQ = 0; } }
      c.rotation.set(this.fly.pitch, this.fly.yaw, 0, 'YXZ');
      c.updateMatrixWorld();
      return;
    }
    if (this._isoZ != null) this.isoZoomStep(dt);
    if (!f && !sd) return;
    const cam = this.iso, t = this.controls.target;
    const fw = t.clone().sub(cam.position); fw.y = 0; fw.normalize();
    const rt = new THREE.Vector3(-fw.z, 0, fw.x);
    const v = ((this.size * 0.45) / cam.zoom) * fast * dt;
    const d = fw.multiplyScalar(f * v).add(rt.multiplyScalar(sd * v));
    t.add(d); cam.position.add(d);
  }

  // eases the ortho zoom toward _isoZ, keeping the ground point under the cursor fixed
  isoZoomStep(dt) {
    const cam = this.iso, z0 = cam.zoom, zt = this._isoZ;
    let z1 = Math.exp(Math.log(z0) + (Math.log(zt) - Math.log(z0)) * (1 - Math.exp(-dt * 16)));
    if (Math.abs(Math.log(zt / z1)) < 0.002) { z1 = zt; this._isoZ = null; }
    const [ax, ay] = this._isoAim || [0, 0];
    const hw = (cam.right - cam.left) / 2, hh = (cam.top - cam.bottom) / 2, k = 1 / z0 - 1 / z1;
    const m = cam.matrixWorld.elements, R = new THREE.Vector3(m[0], m[1], m[2]), Up = new THREE.Vector3(m[4], m[5], m[6]), F = new THREE.Vector3(-m[8], -m[9], -m[10]);
    const s = R.multiplyScalar(ax * hw * k).addScaledVector(Up, ay * hh * k);
    if (Math.abs(F.y) > 0.05) s.addScaledVector(F, -s.y / F.y); // slide along the view ray: the pivot stays on the ground plane
    cam.position.add(s); this.controls.target.add(s);
    cam.zoom = z1; cam.updateProjectionMatrix();
  }

  setFree(on) {
    if (on === this.free) return;
    if (!on && this.walk) this.walk = false;
    const T = this.world?.terrain;
    if (on) {
      // start at street level, looking where the iso view was looking
      const t = this.controls.target.clone();
      const dir = this.iso.position.clone().sub(t); dir.y = 0; dir.normalize();
      const p = t.clone().addScaledVector(dir, 28);
      p.y = (T ? T.height(p.x, p.z) : 0) + 9;
      this.persp.position.copy(p);
      this.fly.yaw = Math.atan2(dir.x, dir.z);
      this.fly.pitch = -0.22;
      this.camera = this.persp;
      this.controls.enabled = false;
    } else {
      const c = this.persp;
      const fw = new THREE.Vector3(-Math.sin(this.fly.yaw), 0, -Math.cos(this.fly.yaw));
      const t = c.position.clone().addScaledVector(fw, 25); t.y = 0;
      const off = this.iso.position.clone().sub(this.controls.target);
      this.controls.target.copy(t);
      this.iso.position.copy(t).add(off);
      this.camera = this.iso;
      this.controls.enabled = true;
      this.controls.update();
    }
    this.free = on;
    this.effects.setPersp?.(on);
    this.setLook('ps2', this.look.ps2);
    this.resize();
  }
  setFOV(v) { this.persp.fov = v; this.persp.updateProjectionMatrix(); }

  // ---------------------------------------------------------------- first-person walk
  // Eye level 1.65 m, a jog by default (3 m/s), Shift runs (6 m/s), a light head bob; buildings, walls and
  // fences (not their gates), props and the map edge stop you, sliding along them. Drag to look.
  setWalk(on, at = null) {
    if (on === !!this.walk) return;
    this._roof = null; this.walkPrompt('');
    if (!on) { this.walk = false; this.setFree(false); return; }
    if (this.free) this.setFree(false);
    this.setFree(true);
    this.walk = true;
    this._walkCol = this.walkColliders();
    const T = this.world?.terrain, t = at ? { x: at[0], z: at[1] } : this.controls.target;
    let p = null; // nearest free spot to the picked point (or the middle of the view)
    for (let r = 0; r < 40 && !p; r += 1.5) for (let a = 0; a < 6.28 && !p; a += r ? 0.9 / r : 7) { const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r; if (!this.walkBlocked(x, z)) p = [x, z]; }
    p ||= [t.x, t.z];
    this.persp.position.set(p[0], (T ? T.height(p[0], p[1]) : 0) + 1.65, p[1]);
    this.fly.pitch = 0; this._wv = new THREE.Vector2(); this._bob = 0; this._eyeY = this.persp.position.y; this._zoomQ = 0;
  }
  walkColliders() {
    const W = this.world; if (!W) return null;
    const boxes = [], segs = [], dots = [];
    for (const s of W.structures || []) for (const m of s._masses || []) boxes.push({ cx: m.cx, cz: m.cz, w: m.w + 0.8, d: m.d + 0.8, r: m.r, c: Math.cos(m.r), s: Math.sin(m.r) });
    const fences = [...(W.walls || []), ...(W.plotWalls || []), ...(W.fenceLog || [])];
    for (const f of fences) {
      if (!f.path || f.path.length < 2 || ['powerline', 'acequia', 'stream'].includes(f.type)) continue;
      const pts = f.closed ? [...f.path, f.path[0]] : f.path; let s0 = 0; const L = []; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(l); s0 += l; }
      const gates = (f.gates || []).map((g) => { const c = g.s ?? (g.at ?? 0) * s0, w = g.width || 3; return [c - w / 2, c + w / 2]; });
      let s = 0;
      for (let i = 0; i < pts.length - 1; i++) { segs.push({ a: pts[i], b: pts[i + 1], s, L: L[i], gates, r: f.type === 'chainlink' || f.type === 'wire' || f.type === 'rail' || f.type === 'pole' ? 0.45 : 0.6 }); s += L[i]; }
    }
    for (const p of [...(W.spec?.props || []), ...(W.genProps || [])]) { if (p.in || p.type === 'custom_sign' && p.mount && p.mount !== 'ground') continue; const at = W.propAt?.(p); if (at) dots.push([at[0], at[1], 0.45]); }
    return { boxes, segs, dots, w: W };
  }
  // ---- roofs: up by a ladder / outside stair (E at its foot) or through the hatch (E at the front door)
  climbNear() {
    const W = this.world, p = this.persp.position; if (!W?.climbs?.length) return null;
    let best = null, bd = 1.8;
    for (const cl of W.climbs) {
      if (this._roof) { if (cl.sid !== this._roof.sid || Math.abs(cl.ty - this._roof.y) > 0.3) continue; const d = Math.hypot(p.x - cl.tx, p.z - cl.tz); if (d < bd) { bd = d; best = cl; } }
      else { const d = Math.hypot(p.x - cl.ex, p.z - cl.ez); if (d < bd) { bd = d; best = cl; } }
    }
    return best;
  }
  walkUse() {
    if (!this.walk) return false;
    const cl = this.climbNear(); if (!cl) return false;
    const p = this.persp.position;
    if (this._roof) { this._roof = null; p.x = cl.ex; p.z = cl.ez; }
    else { this._roof = { sid: cl.sid, y: cl.ty }; p.x = cl.tx; p.z = cl.tz; }
    this._wv.set(0, 0); this._promptT = 0;
    return true;
  }
  walkPrompt(t) { const el = this._promptEl ||= document.getElementById('walk-e'); if (el && el.textContent !== t) el.textContent = t; }
  onRoofOK(x, z) { // inside this building's flat roof at this level (a step in from the parapet)
    for (const r of this.world?.roofs || []) {
      if (r.sid !== this._roof.sid || Math.abs(r.y - this._roof.y) > 0.3) continue;
      const c = Math.cos(r.r), sn = Math.sin(r.r), dx = x - r.cx, dz = z - r.cz, u = dx * c - dz * sn, w = dx * sn + dz * c;
      if (Math.abs(u) <= r.hw - 0.3 && Math.abs(w) <= r.hd - 0.3) return true;
    }
    return false;
  }
  walkBlocked(x, z) {
    if (this._roof) return !this.onRoofOK(x, z);
    const C = this._walkCol, T = this.world?.terrain; if (!C) return false;
    if (T && T.inBounds && !T.inBounds(x, z, 1)) return true;
    for (const b of C.boxes) { const dx = x - b.cx, dz = z - b.cz, u = dx * b.c - dz * b.s, v = dx * b.s + dz * b.c; if (Math.abs(u) < b.w / 2 && Math.abs(v) < b.d / 2) return true; }
    for (const g of C.segs) {
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - g.a[0]) * dx + (z - g.a[1]) * dz) / L2));
      if (Math.hypot(x - g.a[0] - dx * t, z - g.a[1] - dz * t) > g.r) continue;
      const s = g.s + t * g.L; if (g.gates.some(([a, b]) => s > a + 0.2 && s < b - 0.2)) continue; // through the gate
      return true;
    }
    for (const [px, pz, r] of C.dots) if ((x - px) ** 2 + (z - pz) ** 2 < r * r) return true;
    return false;
  }
  walkStep(dt) {
    const k = this.keys, c = this.persp, T = this.world?.terrain;
    if (this._walkCol?.w !== this.world) this._walkCol = this.walkColliders();
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const sd = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const run = k.has('ShiftLeft') || k.has('ShiftRight'), top = run ? 6.0 : 3.0;
    const fw = new THREE.Vector2(-Math.sin(this.fly.yaw), -Math.cos(this.fly.yaw)), rt = new THREE.Vector2(Math.cos(this.fly.yaw), -Math.sin(this.fly.yaw));
    const want = fw.multiplyScalar(f).add(rt.multiplyScalar(sd)); if (want.lengthSq() > 1) want.normalize(); want.multiplyScalar(top);
    this._wv.lerp(want, 1 - Math.exp(-dt * (want.lengthSq() ? 8 : 12))); // ease into a jog, stop a little quicker
    const x0 = c.position.x, z0 = c.position.z; let x = x0 + this._wv.x * dt, z = z0 + this._wv.y * dt;
    if (this.walkBlocked(x, z)) { if (!this.walkBlocked(x, z0)) z = z0; else if (!this.walkBlocked(x0, z)) x = x0; else { x = x0; z = z0; } }
    const moved = Math.hypot(x - x0, z - z0), sp = moved / Math.max(dt, 1e-4);
    // steps: the eye follows the ground, quickly up, a touch slower down
    const g = (this._roof ? this._roof.y : T ? T.height(x, z) : 0) + 1.65;
    if ((this._promptT = (this._promptT || 0) - dt) <= 0) { this._promptT = 0.15; const cl = this.climbNear(); this.walkPrompt(!cl ? '' : this._roof ? '[E] climb down' : cl.kind === 'hatch' ? '[E] go up to the roof' : cl.kind === 'door' ? '[E] go up to the terrace' : `[E] climb the ${cl.kind}`); }
    this._eyeY += (g - this._eyeY) * (1 - Math.exp(-dt * (g > this._eyeY ? 18 : 10)));
    // head bob: one dip per stride (~1.2 m jogging, ~1.9 m running), a little sway at half the rate
    this._bob += moved * ((Math.PI * 2) / (run ? 1.9 : 1.2));
    const amp = Math.min(1, sp / 3) * (run ? 0.0385 : 0.021), bobY = -Math.abs(Math.sin(this._bob / 2)) * amp * 2 + amp, sway = Math.sin(this._bob / 2) * amp * 0.6;
    c.position.set(x + rt.x * 0, this._eyeY + bobY, z);
    c.rotation.set(this.fly.pitch + bobY * 0.15, this.fly.yaw, sway * 0.12, 'YXZ');
    c.updateMatrixWorld();
  }

  makeRT() {
    const r = this.renderer, sz = r.getDrawingBufferSize(new THREE.Vector2());
    if (this.rt) this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: this.look.lowres || this.look.ps2 ? 0 : 4, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(sz.x, sz.y); this.rt.depthTexture.type = THREE.FloatType;
    // water pass: the opaque scene copied (rgb + raw depth) so water can refract and reflect it
    if (this.rtCopy) this.rtCopy.dispose();
    this.rtCopy = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    U.tCopy.value = this.rtCopy.texture; U.uRes.value.set(sz.x, sz.y);
    this.copyMat.uniforms.tColor.value = this.rt.texture; this.copyMat.uniforms.tDepth.value = this.rt.depthTexture;
    this.postMat.uniforms.tScene.value = this.rt.texture;
    this.postMat.uniforms.uTexel.value.set(1 / sz.x, 1 / sz.y);
    this.postMat.uniforms.tDepth.value = this.rt.depthTexture;
    // trails: the last frame at half resolution (blurry smear when blended back)
    this.rtPrev?.dispose();
    this.rtPrev = new THREE.WebGLRenderTarget(Math.max(1, sz.x >> 1), Math.max(1, sz.y >> 1), { type: THREE.HalfFloatType, depthBuffer: false });
    this.postMat.uniforms.tPrev.value = this.rtPrev.texture;
    if (!this.copyPrev) {
      this.copyPrev = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null } }, depthTest: false, depthWrite: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); }' });
      this.prevScene = new THREE.Scene(); const q = new THREE.Mesh(fsTri(), this.copyPrev); q.frustumCulled = false; this.prevScene.add(q);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    // PS2: ~448 lines internal, smooth upscale. Low-res: chunky pixels.
    this.renderer.setPixelRatio(this.look.lowres ? Math.max(0.5, this.dpr * 0.5) : this.look.ps2 ? 1 : this.dpr); // low-res: half the screen's own resolution
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.imageRendering = this.look.lowres ? 'pixelated' : 'auto';
    const aspect = w / h;
    const half = this.size * 0.55;
    this.iso.left = -half * aspect; this.iso.right = half * aspect;
    this.iso.top = half; this.iso.bottom = -half;
    this.iso.updateProjectionMatrix();
    this.persp.aspect = aspect; this.persp.updateProjectionMatrix();
    this.makeRT();
  }

  render() {
    const r = this.renderer, cam = this.camera;
    // sky basis
    const m = cam.matrixWorld.elements;
    this.skyMat.uniforms.uCamR.value.set(m[0], m[1], m[2]);
    this.skyMat.uniforms.uCamU.value.set(m[4], m[5], m[6]);
    this.skyMat.uniforms.uCamF.value.set(-m[8], -m[9], -m[10]);
    this.skyMat.uniforms.uAspect.value = this.container.clientWidth / this.container.clientHeight;
    this.skyMat.uniforms.uTan.value = this.free ? Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) : 0.8;
    U.uDepth.value.set(cam.position.distanceTo(this.controls.target), this.size * 1.2);
    this.shadowFocus();
    if (this.free) { U.uHazeStart.value = 6; U.uHazeDist.value = 260; }
    else {
      // iso: haze starts at the near edge of what's on screen and grows toward the far edge
      const halfH = (this.iso.top - this.iso.bottom) / 2 / this.iso.zoom;
      // zoomed out the view spans much more depth: stretch the haze with it so the overview stays readable
      U.uHazeStart.value = cam.position.distanceTo(this.controls.target) - halfH * 1.1;
      U.uHazeDist.value = Math.max(200, halfH * 2.6);
    }
    // live searchlights: aim + shadow maps before the frame (effects decides where they point)
    { this.spots ||= new SpotLights(); this.spots.update(r, this.world, this.effects, cam, this.effects.spotGain ?? 1, this.scene); }
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.skyScene, this.fsCam);
    cam.layers.set(0);
    r.render(this.scene, cam);
    // water (layer 1): copy the opaque frame (colour + depth), then draw the water over it
    U.uProj.value.copy(cam.projectionMatrix); U.uProjInv.value.copy(cam.projectionMatrixInverse);
    if (this.waterOn !== false) {
      r.setRenderTarget(this.rtCopy); r.render(this.copyScene, this.fsCam);
      U.uWaterOn.value = 1;
      r.setRenderTarget(this.rt);
      cam.layers.set(1); r.render(this.scene, cam); cam.layers.set(0);
    }
    // sun on screen (flare): far point along the sun direction
    const pu = this.postMat.uniforms, P = this._preset;
    pu.uAspect.value = this.container.clientWidth / this.container.clientHeight;
    if (this.look.flare && P && !P.overcast && !P.sunHidden && !P.moon && U.uSunDir.value.y > 0.0) {
      const sp = new THREE.Vector3().copy(U.uSunDir.value).multiplyScalar(1500).add(cam.position).project(cam);
      const on = sp.z < 1 && Math.abs(sp.x) < 1.15 && Math.abs(sp.y) < 1.15;
      pu.uSunScr.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, on ? Math.min(1, 1.3 - Math.max(Math.abs(sp.x), Math.abs(sp.y)) * 0.5) * (P.weather === 'dust' ? 0.3 : 1 - 0.7 * Math.max(0, (P.hazeK ?? 0.3) - 0.3) / 0.7) : 0);
      pu.uFlare.value = 1; pu.uFlareCol.value.setRGB(...P.sky.glow);
    } else pu.uFlare.value = 0;
    if (this.heat) {
      cam.updateMatrixWorld();
      pu.uInvVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
      pu.uPersp.value = this.free ? 1 : 0; pu.uCamPos.value.copy(cam.position);
      const dir = cam.getWorldDirection(new THREE.Vector3());
      pu.uPitch.value = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      pu.uTanHalf.value = this.free ? Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) : 0.5;
      const T = this.world?.terrain, camH = Math.max(0.5, cam.position.y - (T ? T.height(cam.position.x, cam.position.z) : 0));
      pu.uMirA.value = Math.min(0.2, Math.max(0.004, camH / 80)); // mirror line ~180 m out at eye height
      const g = Math.max(0, Math.min(1, (this.heat.G - 0.3) / 0.5));
      pu.uMirK.value = g * (this.heatK ?? 1) * (this.free ? 1 - THREE.MathUtils.smoothstep(camH, 2, 8) : 0); // ground level only: fades out by 8 m up, none in iso
    } else pu.uMirK.value = 0;
    { // light shafts from the live searchlights
      this.shafts ||= new Shafts();
      const sz = r.getDrawingBufferSize(new THREE.Vector2());
      if (!this.shafts.rt || this.shafts._w !== sz.x || this.shafts._h !== sz.y) { this.shafts.resize(sz.x, sz.y); this.shafts._w = sz.x; this.shafts._h = sz.y; }
      const tx = this.shafts.render(r, this.rt.depthTexture, cam, this._preset);
      pu.tShafts.value = tx; pu.uShaftsOn.value = tx ? 1 : 0;
    }
    if (this._actOn && this.world?.activity && pu.tAct.value !== this.world.activity.tex) this.setActivityView(true); // rebuilt after an edit
    this.glare(cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.postScene, this.fsCam);
    if (this.look.trails && this.rtPrev) { this.copyPrev.uniforms.tColor.value = this.rt.texture; r.setRenderTarget(this.rtPrev); r.render(this.prevScene, this.fsCam); r.setRenderTarget(null); }
  }

  // searchlight glare: for each lit beam the eye is inside and looking toward, a strength at the lens on screen;
  // an after-image lingers ~1 s (eyes adjusting). Free cam / Walk only.
  glare(cam) {
    const pu = this.postMat.uniforms, now = performance.now(), dt = Math.min(0.1, (now - (this._glT || now)) / 1000); this._glT = now;
    this._glMem ||= new Map();
    const out = [];
    if (this.free) {
      const C = cam.position, F = cam.getWorldDirection(new THREE.Vector3());
      for (const s of this.effects.search || []) {
        if (!s.on || !s.tgt) continue;
        const L = new THREE.Vector3(s.l.x, s.l.y, s.l.z), D = s.tgt.clone().sub(L).normalize();
        const lens = L.clone().addScaledVector(D, (s.l.search.head || 0.26) * 0.76 + 0.12);
        const v = C.clone().sub(lens), dist = v.length(); v.divideScalar(dist || 1);
        const half = Math.atan(0.075 + 0.35 / Math.max(1, s.tgt.distanceTo(L))) * 1.15;
        const inBeam = THREE.MathUtils.smoothstep(v.dot(D), Math.cos(half * 1.9), Math.cos(half * 0.4));
        const facing = THREE.MathUtils.smoothstep(-v.dot(F), 0.55, 0.995);
        let k = 0.67 * inBeam * facing * Math.min(1.5, 30 / (dist + 10)) * (this.effects.spotGain ?? 1); // (toned down a third)
        const m = this._glMem.get(s) || 0, mem = Math.max(k, m * Math.exp(-dt / 0.9));
        this._glMem.set(s, mem);
        if (mem < 0.01) continue;
        const sp = lens.clone().project(cam);
        if (sp.z > 1 || Math.abs(sp.x) > 1.3 || Math.abs(sp.y) > 1.3) continue;
        out.push({ x: sp.x * 0.5 + 0.5, y: sp.y * 0.5 + 0.5, z: sp.z * 0.5 + 0.5, k: mem, after: k < mem ? Math.min(1, (mem - k) / (mem || 1)) : 0 });
      }
    }
    out.sort((a, b) => b.k - a.k);
    const n = Math.min(4, out.length); let veil = 0;
    for (let i = 0; i < n; i++) { const g = out[i]; pu.uGlareP.value[i].set(g.x, g.y, g.z, g.after * 0.6); pu.uGlareK.value[i] = g.k; veil += g.k * 0.55; }
    pu.uGlareN.value = n; pu.uGlareVeil.value = Math.min(0.85, veil * veil * 0.8);
  }

  // PS2 look: lighter shadows, but 15% stronger through noon and the afternoon (≈11:30–17:00)
  psShadowK() {
    if (!this.look.ps2) return 1;
    const p = this._preset, h = p ? p.hour ?? presetHour(p.id) : 12, ss = THREE.MathUtils.smoothstep;
    return 0.63 * (1 + 0.15 * ss(h, 10.5, 11.5) * (1 - ss(h, 17, 18)));
  }

  setLook(k, v) {
    this.look[k] = v;
    if (k === 'lowres' || k === 'ps2') this.resize();
    // PS2: lighter, softer shadows and thicker coloured fog
    U.uShadowK.value = this.psShadowK();
    U.uShadowSoft.value = this.look.ps2 ? 2.0 : 1;
    U.uFogK.value = this.look.ps2 ? (this.free ? 1.45 : 1.0) : 1;
    if (this._preset) this.setPresetColours(this._preset);
    this.postMat.uniforms.uPS2.value = this.look.ps2 ? 1 : 0;
    this.postMat.uniforms.uGrade.value = this.look.grade ? 1 : 0;
    this.postMat.uniforms.uShades.value = this.look.shades ? 1 : 0;
    this.postMat.uniforms.uDither.value = this.look.dither ? 1 : 0;
    this.postMat.uniforms.uGlow.value = this.look.glow ? 1 : 0;
    this.postMat.uniforms.uTrails.value = this.look.trails ? 0.42 : 0;
  }
  setPresetColours(p) {
    const fogC = this.look.ps2 && p.fog ? p.fog : p.sky.hor;
    U.uHazeCol.value.setRGB(...fogC);
    this.skyMat.uniforms.uFogCol.value.setRGB(...fogC);
    this.skyMat.uniforms.uFogAmt.value = this.look.ps2 ? 1 : 0.35;
  }
  setLUT(text) {
    if (!text) { this.postMat.uniforms.uLutOn.value = 0; return; }
    const lines = text.split(/\r?\n/);
    let N = 0;
    const vals = [];
    for (const ln of lines) {
      const t = ln.trim();
      if (!t || t.startsWith('#')) continue;
      if (t.startsWith('LUT_3D_SIZE')) { N = parseInt(t.split(/\s+/)[1]); continue; }
      if (/^[A-Z_]/.test(t)) continue;
      const p = t.split(/\s+/).map(Number);
      if (p.length >= 3 && p.every((x) => !isNaN(x))) vals.push(p[0], p[1], p[2]);
    }
    if (!N || vals.length < N * N * N * 3) throw new Error('Not a valid 3D .cube LUT');
    const data = new Uint16Array(N * N * N * 4);
    for (let i = 0; i < N * N * N; i++) {
      data[i * 4] = THREE.DataUtils.toHalfFloat(vals[i * 3]); data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(vals[i * 3 + 1]);
      data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(vals[i * 3 + 2]); data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    const tex = new THREE.Data3DTexture(data, N, N, N);
    tex.format = THREE.RGBAFormat; tex.type = THREE.HalfFloatType;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapR = tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.postMat.uniforms.uLut.value = tex;
    this.postMat.uniforms.uLutSize.value = N;
    this.postMat.uniforms.uLutOn.value = 1;
  }

  setWorld(world, keepView = false) {
    if (this.world) { this.scene.remove(this.world.group); dispose(this.world.group); this.baker?.dispose(); }
    this.world = world;
    this.clutter.mesh = null; this.clutter.key = '';
    this.scene.add(world.group);
    const T = world.terrain;
    this.size = Math.max(T.W, T.D);
    this.controls.maxZoom = (this.size * 1.1) / 3; // ~3 m of ground top to bottom
    U.uPlay.value.set(-T.W / 2, -T.D / 2, T.W / 2, T.D / 2);
    U.uEdgeFade.value = T.margin * 0.7;
    this.resize();
    if (!keepView) this.resetView();
    this.clearSelection();
    this.baker = new Baker(this.renderer, world);
    this.baker.capture();
    this.effects.setWorld(world);
    this.setPreset(this.presetId);
  }

  // surface temperature map (heat.js) -> post shader (mirage strength, Heat view)
  updateHeat(p = this._preset, sd = null, box = null) {
    if (!this.world || !p) return;
    try {
      const prev = box && this.heat && this.heat._world === this.world ? this.heat : null;
      const H = computeHeat(this.world, p, sd || [U.uSunDir.value.x, U.uSunDir.value.y, U.uSunDir.value.z], box, prev);
      H._world = this.world;
      if (this.heat && this.heat.tex !== H.tex) this.heat.tex.dispose();
      this.heat = H; this._heatH = p.hour ?? null;
      const pu = this.postMat.uniforms;
      pu.tTemp.value = H.tex; pu.uTempRect.value.set(...H.rect); U.uTempTex.value = H.tex; U.uTempRect.value.set(...H.rect); pu.uHasTemp.value = 1; pu.uAir.value = H.air;
      this.onHeat?.(H);
    } catch (e) { console.warn('[heat]', e); }
  }
  setActivityView(on) {
    const pu = this.postMat.uniforms, A = this.world?.activity;
    if (on && A) { pu.tAct.value = A.tex; pu.uActRect.value.set(...A.rect); }
    pu.uActOn.value = on && A ? 1 : 0; this._actOn = on;
  }
  setHeatView(on) { this.postMat.uniforms.uTempOn.value = on ? 1 : 0; }

  // editor: re-light a changed region and refresh light halos / particles
  refreshRegion(box) {
    if (this._preset) { const hb = this._heatBox; this._heatBox = hb ? [Math.min(hb[0], box[0]), Math.min(hb[1], box[1]), Math.max(hb[2], box[2]), Math.max(hb[3], box[3])] : box.slice(); clearTimeout(this._heatT); this._heatT = setTimeout(() => { const b = this._heatBox; this._heatBox = null; this.updateHeat(this._preset, null, b); }, 700); } // once, after a run of edits, for their area
    if (this.spots) this.spots.dirty = true;
    if (this.baker && this._preset) { try { this.baker.quickLight?.(this._preset); } catch (e) { console.warn('[quickLight]', e); } if (this.baker.updateRegionAsync && this.r?.capabilities?.isWebGL2 !== false) this.baker.updateRegionAsync(box, this._preset); else this.baker.updateRegion(box, this._preset); }
    this.effects.setWorld(this.world);
    if (this._preset) this.effects.setPreset(this._preset);
  }

  // id: a preset id, or an hour (0..24) blended from the keyframes; preview = live uniforms only (no bake)
  // which way the sierra lies (compass bearing, 90 = east): the backdrop puts the mountains there, the sea horizon opposite
  setOrient(bearing = 90) { const a = (bearing * Math.PI) / 180; this.skyMat.uniforms.uSierra.value.set(Math.sin(a), -Math.cos(a)); }
  setPreset(id, preview = false) {
    const base = typeof id === 'number' ? presetAtHour(id) : PRESET[id] || PRESETS[2];
    const p = withHaze(withWeather(base, this.weather), this.haze ?? 0.3);
    const s0 = this.skyMat.uniforms;
    this.presetId = typeof id === 'number' ? id : p.id;
    const sd = sunDir(p);
    U.uSunDir.value.set(...sd);
    U.uSunCol.value.setRGB(...p.sun.col.map((c) => c * p.sun.k * (p.sunHidden ? 0 : 1)));
    U.uAmb.value.setRGB(...p.amb.map((c) => c * p.ambK));
    this._preset = p;
    const fogC = this.look.ps2 && p.fog ? p.fog : p.sky.hor;
    U.uHazeCol.value.setRGB(...fogC);
    s0.uFogCol.value.setRGB(...fogC);
    s0.uFogAmt.value = this.look.ps2 ? 1 : 0.35;
    const bare = this.world?.veg ? Math.max(0, 0.32 - this.world.veg.mean) : 0, dayDry = !p.weather && !p.overcast && !p.moon && !p.sunHidden;
    U.uHaze.value = p.haze * (dayDry ? 1 + bare * 1.4 : 1);
    if (dayDry && bare > 0) { const warm = [1.0, 0.86, 0.66]; U.uHazeCol.value.lerp(new THREE.Color(fogC[0] * warm[0], fogC[1] * warm[1], fogC[2] * warm[2]), Math.min(0.5, bare * 1.5)); }
    U.uWinThresh.value = p.win;
    U.uLampThresh.value = p.lights.gain > 0 ? p.lights.frac : -1;
    U.uSkyRefl.value.setRGB(...p.sky.zen.map((c, i) => (c + p.sky.hor[i]) / 2));
    U.uWinGlow.value.setRGB(1.5, 0.9, 0.42);
    const s = this.skyMat.uniforms;
    s.uZen.value.setRGB(...p.sky.zen); s.uHor.value.setRGB(...p.sky.hor); s.uGlow.value.setRGB(...p.sky.glow);
    U.uSkyZen.value.setRGB(...p.sky.zen); U.uSkyHor.value.setRGB(...p.sky.hor);
    if (p.sunHidden) { const az = (p.sun.az * Math.PI) / 180, el = -0.06; s.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)); }
    else s.uSunDir.value.set(...sd);
    s.uSunHaze.value = p.sunHaze;
    s.uCloudAmt.value = p.clouds ?? 0.35; s.uCloudGrey.value = p.cloudGrey ?? (p.overcast ? 1 : 0);
    this.clouds?.apply(p, sd);
    U.uShadowK.value = this.psShadowK();
    if (this.world) lifeTimeOfDay(this.world, p.hour ?? presetHour(p.id));
    U.uFogNear.value = p.fogNear || 0; U.uWet.value = p.wet || 0;
    { // after rain: the wet look and the puddles dry off over game hours, faster on hot surfaces (heat map)
      const h = p.hour ?? presetHour(p.id);
      if (p.weather === 'rain') { this._dry = null; U.uDryH.value = -1; }
      else if (this._wasRain && h != null) this._dry = { h0: h };
      else if (this._wasRain) this._dry = { h0: 12 };
      if (this._dry && p.weather !== 'rain') {
        const el = h == null ? 0 : (h - this._dry.h0 + 24) % 24;
        if (el > 12) { this._dry = null; U.uDryH.value = -1; }
        else { U.uWet.value = 1; U.uDryH.value = el; }
      } else if (p.weather !== 'rain') U.uDryH.value = -1;
      this._wasRain = p.weather === 'rain';
    } U.uWind.value = { dust: 2.2, rain: 1.4, marine: 0.5, overcast: 1.2 }[p.weather] ?? 1;
    s.uSunCol2.value.setRGB(...p.sun.col.map((c) => Math.min(1.6, c * (p.moon || p.sunHidden ? p.sun.k * 1.2 : Math.max(p.sun.k, p.overcast ? 0 : 0.4))))); s.uAmb2.value.setRGB(...p.amb.map((c) => c * p.ambK * 1.6));
    U.uCloudSh.value = p.sunHidden || p.overcast ? 0 : Math.min(0.456, (p.clouds ?? 0.35) * (p.moon ? 0.72 : 1.32));
    s.uSunVis.value = p.moon || p.overcast ? 0 : 1;
    s.uMoon.value = p.moon ? (p.moonK ?? 1) : 0;
    s.uStars.value = p.stars;
    this.postMat.uniforms.uExposure.value = p.exposure;
    if (this.baker) { if (preview) this.baker.renderShadow(p); else this.baker.bake(p); }
    const hh = p.hour ?? presetHour(p.id);
    if (this.world && (!preview || !this.heat || hh == null || Math.abs(hh - (this._heatH ?? -9)) > 0.5)) this.updateHeat(p, sd);
    this.effects.setPreset(p);
    this.onPreset?.(p);
  }

  resetView(az) {
    if (this.free) this.setFree(false);
    az = az ?? this.world?.spec.view?.az ?? 45;
    const el = THREE.MathUtils.degToRad(35.264), a = THREE.MathUtils.degToRad(az);
    const d = this.size * 2;
    const t = this.world?.spec.view?.target || [0, 0];
    this.controls.target.set(t[0], 0, t[1]);
    this.camera.position.set(t[0] + Math.sin(a) * Math.cos(el) * d, Math.sin(el) * d, t[1] + Math.cos(a) * Math.cos(el) * d);
    this._isoZ = null;
    this.camera.zoom = Math.max(this.world?.spec.view?.zoom || 1, (this.size * 1.1) / 300); // never open wider than ~300 m of ground top to bottom
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  rotate90(dir = 1) {
    if (this.free) return;
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (dir * Math.PI) / 2);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  showSelection(item) {
    this.clearSelection();
    if (!item) return;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.38, 2.2, 0.75), transparent: true, opacity: 0.95, depthTest: false });
    const under = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: false });
    const T = this.world.terrain;
    const addLoop = (pts, y) => {
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
        const L = Math.hypot(bx - ax, bz - az);
        for (const [mt, w, ro] of [[under, 0.62, 998], [mat, 0.32, 999]]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(L + w, 0.12, w), mt);
          m.position.set((ax + bx) / 2, (y ?? T.height((ax + bx) / 2, (az + bz) / 2)) + 0.15, (az + bz) / 2);
          m.rotation.y = Math.atan2(-(bz - az), bx - ax);
          m.renderOrder = ro;
          this.overlay.add(m);
        }
      }
    };
    if (item.outline && item.type === 'structure') for (const poly of item.outline) addLoop(grow(poly, 0.9), item.y);
    else if (item.outline) addLoop(item.outline);
    else if (item.ring) {
      const pts = Array.from({ length: 20 }, (_, i) => [item.ring.x + Math.cos((i / 20) * 6.283) * (item.ring.r + 0.6), item.ring.z + Math.sin((i / 20) * 6.283) * (item.ring.r + 0.6)]);
      addLoop(pts, item.ring.y);
    }
  }
  clearSelection() { for (const c of [...this.overlay.children]) { c.geometry.dispose(); this.overlay.remove(c); } }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const objs = [...this.world.items.values()].map((i) => i.object).filter(Boolean);
    const terr = this.world.group.getObjectByName('terrain');
    if (terr) objs.push(terr);
    const hits = ray.intersectObjects(objs, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.selectId) o = o.parent;
      if (o) return o.userData.selectId;
      if (h.object.name === 'terrain') {
        // fields: point in polygon
        for (const it of this.world.items.values()) if ((it.type === 'field' || it.type === 'area') && it.outline && inPoly(h.point.x, h.point.z, it.outline)) return it.id;
        return null;
      }
    }
    return null;
  }

  project(v) {
    const p = v.clone().project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, p.z];
  }

  // F8: the shot at full detail — ground clutter over the whole view, sun shadows fitted to it — then back to normal
  exportMax(scale = 2) {
    const B = this.baker, pre = this._preset, oldF = B?.focus ? { ...B.focus } : null;
    const t = this.free ? this.persp.position : this.controls.target;
    let r = 120, want = null;
    if (!this.free) {
      const c = this.iso, hw = (c.right - c.left) / 2 / c.zoom, hh = (c.top - c.bottom) / 2 / c.zoom;
      r = Math.hypot(hw, hh / Math.sin(THREE.MathUtils.degToRad(35))) * 1.15 + 3;
      if (r < this.size * 0.55) want = { x: t.x, z: t.z, r: r * 1.05 };
    }
    if (B && pre && want) B.setFocus(want, pre);
    if (this.world && this.clutterOn !== false && pre) { this.clutter.key = ''; this.clutter.update(this.world, this.world.group, t.x, t.z, Math.min(r, 170), pre, 170); }
    const url = this.exportPNG(scale);
    if (B && pre && want) B.setFocus(oldF, pre);
    this.clutter.key = '';
    return url;
  }
  exportPNG(scale = 2) {
    const r = this.renderer;
    const oldLow = this.look.lowres;
    if (!oldLow) { r.setPixelRatio(scale); r.setSize(this.container.clientWidth, this.container.clientHeight); this.makeRT(); }
    this.render();
    const url = r.domElement.toDataURL('image/png');
    if (!oldLow) this.resize();
    return url;
  }
}

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function grow(poly, d) {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.map(([x, z]) => { const L = Math.hypot(x - cx, z - cz) || 1; return [x + ((x - cx) / L) * d, z + ((z - cz) / L) * d]; });
}
function dispose(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) { if (m.userData?.shared) continue; if (m.uniforms?.uMap?.value) m.uniforms.uMap.value.dispose(); m.dispose(); }
  });
}

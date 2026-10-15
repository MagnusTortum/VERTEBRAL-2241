// Shaders. Everything is unlit at runtime: albedo (vertex colour × detail texture ×2) × baked light,
// then haze. Shared uniforms live in U so a preset change updates every material at once.
import * as THREE from 'three';
import { textureArray, foliageAtlas, plantAtlas, waterTexture } from './textures.js';
import { LAYER } from './layers.js';

export const U = {
  uTex: { value: null },
  uAtlas: { value: null },
  uPlants: { value: null }, uWind: { value: 1 },
  uCloudSh: { value: 0 }, uCloudOff: { value: new THREE.Vector2() }, uFogNear: { value: 0 }, uWet: { value: 0 }, uTempTex: { value: null }, uTempRect: { value: new THREE.Vector4(-1, -1, 1, 1) }, uDryH: { value: -1 },
  uSpotN: { value: 0 }, uSpotP: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3()) }, uSpotD: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3(0, -1, 0)) }, uSpotC: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3()) }, uSpotA: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector4(1, 1, 1, 0)) }, uSpotM: { value: [0, 1, 2, 3].map(() => new THREE.Matrix4()) }, uSpotNF: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0.3, 50, 1 / 512)) }, uSpotS0: { value: null }, uSpotS1: { value: null }, uSpotS2: { value: null }, uSpotS3: { value: null }, uVeg: { value: null }, uVegRect: { value: new THREE.Vector4(-1, -1, 1, 1) }, uVegOn: { value: 1 }, uVegShow: { value: 0 },
  uLM: { value: null },
  uLMRect: { value: new THREE.Vector4(-100, -100, 100, 100) },
  uPlay: { value: new THREE.Vector4(-100, -100, 100, 100) },
  uFocusOn: { value: 0 }, uFocusN: { value: 0 }, uFocus: { value: Array.from({ length: 24 }, () => new THREE.Vector2()) }, // plot editing: dim the rest
  uEdgeFade: { value: 80 },
  uHazeCol: { value: new THREE.Color(0.85, 0.82, 0.76) },
  uHaze: { value: 0.12 },
  uDepth: { value: new THREE.Vector2(0, 400) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3).normalize() },
  uSunCol: { value: new THREE.Color(2.5, 2.3, 2.0) },
  uAmb: { value: new THREE.Color(0.4, 0.45, 0.55) },
  uWinThresh: { value: 0 },
  uLampThresh: { value: -1 },
  uWinGlow: { value: new THREE.Color(1.6, 0.95, 0.45) },
  uEmit: { value: 1 },
  uSkyRefl: { value: new THREE.Color(0.5, 0.6, 0.7) },
  uTime: { value: 0 },
  // per-pixel sun shadow (rendered once per time preset)
  uShadow: { value: null },
  uShadowM: { value: new THREE.Matrix4() },
  uShadowTexel: { value: 1 / 4096 },
  uShadowBias: { value: 0.0002 },
  uShadowOn: { value: 0 },
  uHazeStart: { value: 0 },
  uRockCol: { value: new THREE.Color(0x948572) },
  uFogK: { value: 1 },
  uDetail: { value: 0.68 },
  uShadowK: { value: 1 },
  uShadowSoft: { value: 1 },
  uG1: { value: null }, uG2: { value: null }, uG3: { value: null },
  uGRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  uHazeDist: { value: 220 },
  uCut: { value: null }, uCutRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uCutOn: { value: 0 },
  // per-pixel point lights (lamps, windows, neon): light list + a grid of up to 16 lights per 8 m cell
  uPLData: { value: null }, uPLGrid: { value: null }, uPLRect: { value: new THREE.Vector4(0, 0, 8, 1) }, uPLOn: { value: 0 },
  // water pass: a copy of the opaque scene (rgb + raw depth in a), projection for SSR, sky colours
  tCopy: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
  uWaterTex: { value: null }, uSkyZen: { value: new THREE.Color(0.25, 0.45, 0.78) }, uSkyHor: { value: new THREE.Color(0.8, 0.82, 0.82) }, uWaterOn: { value: 0 },
};

// anti-tiled texture sampling: two randomly offset copies switched by low-frequency noise (sel),
// blended with a 0.29x copy, then contrast scaled by uDetail (textures read soft on low-poly shapes)
const DETAIL = /* glsl */ `
uniform float uDetail;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// derivatives passed in: callers inside branches (per-pixel blend masks) must take them in uniform control flow,
// or the mip level is garbage there and the texture sparkles
vec3 texATg(float layer, vec2 uv, float sel, vec2 dx, vec2 dy) {
  float k = sel * 6.0, i = floor(k), f = fract(k);
  vec2 oa = vec2(hash21(vec2(i, layer)), hash21(vec2(layer, i + 7.0)));
  vec2 ob = vec2(hash21(vec2(i + 1.0, layer)), hash21(vec2(layer, i + 8.0)));
  vec3 a = textureGrad(uTex, vec3(uv + oa, layer), dx, dy).rgb;
  vec3 b = textureGrad(uTex, vec3(uv + ob, layer), dx, dy).rgb;
  vec3 c = mix(a, b, smoothstep(0.2, 0.8, f));
  vec3 big = textureGrad(uTex, vec3(uv * 0.29 + oa.yx, layer), dx * 0.29, dy * 0.29).rgb;
  return mix(c, big, 0.4);
}
vec3 texAT(float layer, vec2 uv, float sel) { return texATg(layer, uv, sel, dFdx(uv), dFdy(uv)); }
vec3 detailK(vec3 t) { return 1.0 + (t * 2.0 - 1.0) * uDetail; }
`;

// per-pixel point lights from the light grid (no occlusion; windows throw light outward only)
const PLIGHTS = /* glsl */ `
uniform sampler2D uPLData; uniform sampler2D uPLGrid; uniform vec4 uPLRect; uniform float uPLOn;
vec3 pointLights(vec3 p, vec3 n) {
  if (uPLOn < 0.5) return vec3(0.0);
  ivec2 cell = ivec2(floor((p.xz - uPLRect.xy) / uPLRect.z));
  ivec2 gs = textureSize(uPLGrid, 0);
  if (cell.x < 0 || cell.y < 0 || cell.x * 4 >= gs.x || cell.y >= gs.y) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec4 ids = texelFetch(uPLGrid, ivec2(cell.x * 4 + k, cell.y), 0);
    for (int j = 0; j < 4; j++) {
      float id = ids[j];
      if (id < 0.5) continue;
      int i = int(id + 0.5) - 1;
      vec4 a = texelFetch(uPLData, ivec2(i * 3, 0), 0), cl = texelFetch(uPLData, ivec2(i * 3 + 1, 0), 0), dr = texelFetch(uPLData, ivec2(i * 3 + 2, 0), 0);
      vec3 d = a.xyz - p; float L = length(d);
      if (L > a.w || L < 1e-3) continue;
      vec3 dl = d / L;
      float ndl = dot(n, dl);
      if (ndl <= 0.0) continue;
      float f = 1.0 - L / a.w, att = f * f * (0.25 + 0.75 * ndl);
      if (dr.z > 0.5) att *= smoothstep(-0.1, 0.6, dot(-dl, normalize(vec3(dr.x, 0.0, dr.y) + 1e-5))); // window: outward only
      acc += cl.rgb * att;
    }
  }
  return acc;
}`;

// fair-weather cumulus (shared by the cloud shadows and the iso cloud layer; needs cNoise): scattered puffs of many sizes,
// gathered in loose clusters with clear sky between, billowy edges. q in 60 m units.
export const CLOUD_FIELD = /* glsl */ `
#define CU_T 0.47
float cuFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * cNoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.42; } return s / 0.85; }
float cumulus(vec2 q) {
  vec2 w = vec2(cNoise(q * 0.6 + 3.1), cNoise(q * 0.6 - 7.4)) - 0.5;   // warp: puffs bunch and lean
  float cells = smoothstep(0.2, 0.75, cNoise(q * 0.3 + 2.0));         // clusters and clear patches
  return cuFbm(q + w * 0.8) * (0.55 + 0.6 * cells);
}`;
// soft PCF over a rotated Poisson disc
const SHADOW = /* glsl */ `
uniform sampler2D uShadow; uniform mat4 uShadowM; uniform float uShadowTexel; uniform float uShadowBias; uniform float uShadowOn; uniform float uShadowK; uniform float uShadowSoft;
const vec2 PD[12] = vec2[12](vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480),
  vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
uniform float uCloudSh; uniform vec2 uCloudOff;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1, 0)), f.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), f.x), f.y); }
${CLOUD_FIELD}
// cloud shadows: the cumulus field drifting over the ground with the wind (the iso cloud layer sits right above them)
float cloudShade(vec3 wp) {
  if (uCloudSh <= 0.0) return 1.0;
  float n = cumulus(wp.xz / 60.0 + uCloudOff);
  return 1.0 - smoothstep(CU_T, CU_T + 0.25, n) * uCloudSh;
}
float sunShadow0(vec3 wp, vec3 off, float soft) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowM * vec4(wp + off, 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float a = fract(sin(dot(floor(wp * 23.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831; // per-pixel-ish (y too: walls don't streak)
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float s = 0.0;
  for (int i = 0; i < 12; i++) {
    float d = texture(uShadow, p.xy + R * PD[i] * uShadowTexel * soft * uShadowSoft).r;
    s += (p.z - uShadowBias <= d) ? 1.0 : 0.0;
  }
  return mix(1.0, s / 12.0, uShadowK);
}
float sunShadow(vec3 wp, vec3 off, float soft) { return sunShadow0(wp, off, soft) * cloudShade(wp); }
// live searchlights (spots.js): up to 8 spot cones; the first 4 (nearest) with their own perspective shadow map
uniform float uSpotN; uniform vec3 uSpotP[8]; uniform vec3 uSpotD[8]; uniform vec3 uSpotC[8]; uniform vec4 uSpotA[8]; uniform mat4 uSpotM[4]; uniform vec3 uSpotNF[4];
uniform sampler2D uSpotS0; uniform sampler2D uSpotS1; uniform sampler2D uSpotS2; uniform sampler2D uSpotS3;
float spotLin(float d, vec2 nf) { float z = d * 2.0 - 1.0; return 2.0 * nf.x * nf.y / (nf.y + nf.x - z * (nf.y - nf.x)); }
float spotSh(sampler2D S, int i, vec3 p) {
  if (uSpotA[i].w < 0.5) return 1.0;
  vec4 c = uSpotM[i] * vec4(p, 1.0); vec3 q = c.xyz / c.w * 0.5 + 0.5;
  if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
  vec2 nf = uSpotNF[i].xy; float tx = uSpotNF[i].z;
  float me = spotLin(q.z, nf), bias = 0.1 + me * (0.01 + tx * 2.5), s = 0.0;
  for (int k = 0; k < 5; k++) { vec2 o = k == 0 ? vec2(0.0) : PD[k * 2] * tx * 1.6; float st = spotLin(texture(S, q.xy + o).r, nf); s += (st < 2.2 || st + bias >= me) ? 1.0 : 0.0; } // the lamp's own yoke / parapet (< 2.2 m) never blocks it
  return s / 5.0;
}
vec3 spotCone(int i, vec3 p, vec3 n, float wrap, out bool hit) {
  hit = false;
  vec3 d = uSpotP[i] - p; float L = length(d); vec4 A = uSpotA[i];
  if (L > A.z || L < 1e-3) return vec3(0.0);
  vec3 l = d / L; float cs = dot(-l, uSpotD[i]);
  if (cs < A.x) return vec3(0.0);
  float ndl = mix(max(dot(n, l), 0.0), 1.0, wrap);
  if (ndl <= 0.0) return vec3(0.0);
  hit = true;
  return uSpotC[i] * smoothstep(A.x, A.y, cs) * ndl * (1.0 - (L / A.z) * (L / A.z));
}
vec3 spotOne(int i, sampler2D S, vec3 p, vec3 n, float wrap) { bool h; vec3 c = spotCone(i, p, n, wrap, h); return h ? c * spotSh(S, i, p + n * 0.04) : c; }
vec3 spotLights(vec3 p, vec3 n, float wrap) {
  if (uSpotN < 0.5) return vec3(0.0);
  vec3 a = spotOne(0, uSpotS0, p, n, wrap);
  if (uSpotN > 1.5) a += spotOne(1, uSpotS1, p, n, wrap);
  if (uSpotN > 2.5) a += spotOne(2, uSpotS2, p, n, wrap);
  if (uSpotN > 3.5) a += spotOne(3, uSpotS3, p, n, wrap);
  bool h;
  for (int i = 4; i < 8; i++) { if (float(i) + 0.5 > uSpotN) break; a += spotCone(i, p, n, wrap, h); } // far ones: no shadow
  return a;
}`;

const HAZE = /* glsl */ `
uniform float uFocusOn; uniform int uFocusN; uniform vec2 uFocus[24];
uniform vec4 uPlay; uniform float uEdgeFade; uniform vec3 uHazeCol; uniform float uHaze; uniform vec2 uDepth; uniform float uHazeStart; uniform float uHazeDist; uniform float uFogK; uniform float uFogNear;
varying vec3 vWorld; varying float vDepth;
vec3 haze(vec3 c) {
  float dx = max(max(uPlay.x - vWorld.x, vWorld.x - uPlay.z), 0.0);
  float dz = max(max(uPlay.y - vWorld.z, vWorld.z - uPlay.w), 0.0);
  float edge = smoothstep(0.0, uEdgeFade, length(vec2(dx, dz)));
  // aerial perspective: grows with distance from the viewer, nothing up close
  float d = max(vDepth - uHazeStart, 0.0);
  float dh = min(0.95, uHaze * uFogK * 2.2 * (1.0 - exp(-d / uHazeDist)));
  if (uFogNear > 0.0) dh = max(dh, min(0.92, uFogNear * (0.62 + 0.55 * (1.0 - exp(-d / (uHazeDist * 0.35)))) * mix(1.0, 0.8, clamp(vWorld.y * 0.02, 0.0, 1.0))));
  c = mix(c, uHazeCol, max(edge, dh));
  if (uFocusOn > 0.5) { // outside the plot being edited: darker and greyer
    bool inside = false; float md = 1e9; vec2 q = vWorld.xz;
    for (int i = 0; i < 24; i++) {
      if (i >= uFocusN) break;
      vec2 a = uFocus[i], b = uFocus[i + 1 >= uFocusN ? 0 : i + 1];
      if ((a.y > q.y) != (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      vec2 ab = b - a; float t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); md = min(md, length(q - a - ab * t));
    }
    float o = inside ? 0.0 : smoothstep(0.0, 0.8, md);
    float g = dot(c, vec3(0.3, 0.55, 0.15));
    c = mix(c, mix(vec3(g), c, 0.35) * 0.42, o * uFocusOn);
  }
  return c;
}`;

const VERT_COMMON = /* glsl */ `
varying vec3 vWorld; varying float vDepth;
mat4 instM() {
#ifdef USE_INSTANCING
  return instanceMatrix;
#else
  return mat4(1.0);
#endif
}`;

// ------------------------------------------------------------------ baked meshes
function bakedMaterial(kind) {
  const defines = {};
  if (kind === 'glass') defines.GLASS = '';
  if (kind === 'water') defines.WATER = '';
  if (kind === 'lamp') defines.LAMP = '';
  if (kind === 'ground') defines.LMAP = '';
  if (kind === 'cloth') defines.CLOTH = '';
  return new THREE.ShaderMaterial({
    
    defines,
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec3 bake; attribute float layer; attribute float win;
      varying vec3 vColor; varying vec3 vBake; varying vec2 vUv; varying float vLayer; varying float vWin; varying vec3 vN;
    #ifdef CLOTH
      uniform float uTime; uniform float uWind;
    #endif
      void main() {
      #ifdef CLOTH
        // flags / banners / laundry: the prop's origin is the hinge (pole); the free end flaps with the wind
        vec3 pc = position; float k = clamp(length(pc.xz) / 1.6, 0.0, 1.0); float ph = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.21;
        pc.z += (sin(uTime * 5.5 - pc.x * 3.2 + ph) * 0.09 + sin(uTime * 9.1 - pc.x * 6.0 + ph) * 0.03) * k * uWind;
        pc.y += sin(uTime * 4.2 - pc.x * 2.5 + ph) * 0.03 * k * uWind;
        vec4 wp = modelMatrix * vec4(pc, 1.0);
      #else
        vec4 wp = modelMatrix * vec4(position, 1.0);
      #endif
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        vColor = color; vBake = bake; vUv = uv; vLayer = layer; vWin = win;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTex; uniform sampler2D uLM; uniform vec4 uLMRect; uniform float uWinThresh; uniform float uLampThresh; uniform vec3 uWinGlow; uniform float uEmit; uniform vec3 uSkyRefl;
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyZen; uniform vec3 uSkyHor; uniform float uWet;
      uniform sampler2D uTempTex; uniform vec4 uTempRect; uniform float uDryH;
      // after rain: local wetness left, from hours of drying (uDryH) and the surface temperature there (hot asphalt dries in ~45 min, shade / night much slower)
      float wetLeft(vec3 w, float slow) { if (uDryH < 0.0) return 1.0; vec2 t = clamp((w.xz - uTempRect.xy) / (uTempRect.zw - uTempRect.xy), 0.0, 1.0); float T = texture2D(uTempTex, t).r; return clamp(1.0 - uDryH / (40.0 / max(4.0, T - 8.0) * slow), 0.0, 1.0); }
      varying vec3 vColor; varying vec3 vBake; varying vec2 vUv; varying float vLayer; varying float vWin; varying vec3 vN;
      ${HAZE}
      ${SHADOW}
      ${DETAIL}
      ${PLIGHTS}
      void main() {
        // selection noise and grime follow world position, so long walls / roofs never show a grid
        vec2 wq = vec2(vWorld.x + vWorld.y * 0.61, vWorld.z - vWorld.y * 0.43);
        float sel = texture(uTex, vec3(wq / 17.0, ${LAYER.grime}.0)).r;
        float grime = texture(uTex, vec3(wq / 7.3 + 0.37, ${LAYER.grime}.0)).r;
        vec2 uvDX = dFdx(vUv), uvDY = dFdy(vUv);
        vec3 det = detailK(texATg(floor(vLayer + 0.5), vUv, sel, uvDX, uvDY)) * (0.86 + 0.28 * grime);
        vec3 alb = vColor * det;
      #if !defined(GLASS) && !defined(WATER) && !defined(LAMP)
        // worn paint: soft, streaky flaking that shows the bare wall (encoded in win: -2 - mat - wear*0.9)
        if (vWin < -1.5) {
          float lw = floor(vLayer + 0.5);
          if (lw == ${LAYER.plaster}.0 || lw == ${LAYER.limewash}.0) {
            float x = -2.0 - vWin, mat = floor(x + 0.001), wear = clamp(fract(x + 0.001) / 0.9, 0.0, 1.0);
            vec2 q = vec2((vWorld.x + vWorld.z) * 0.85, vWorld.y * 0.55);
            float nz = cNoise(q * 0.9) * 0.5 + cNoise(q * 2.3 + 4.1) * 0.3 + cNoise(q * 6.1 - 2.7) * 0.2;
            nz += cNoise(vec2((vWorld.x - vWorld.z) * 3.0, vWorld.y * 0.4)) * 0.12 - 0.06; // vertical rain streaks
            float th = 0.78 - wear * 0.5;
            float m = smoothstep(th - 0.035, th + 0.035, nz);
            float rim = smoothstep(th - 0.07, th - 0.035, nz) - m;
            if (mat < 2.5) { // worn paint: the bare plaster / wall shows through
              vec3 bare = mat < 0.5 ? vec3(0.70, 0.58, 0.45) : mat < 1.5 ? vec3(0.62, 0.60, 0.56) : vec3(0.56, 0.32, 0.24);
              alb = mix(alb, bare * det * 1.05, m) * (1.0 - 0.1 * rim);
            } else { // worn bare plaster: fallen-off patches (worst low down: rising damp) show the masonry, a dark broken edge
              float low = 1.0 - smoothstep(0.2, 1.6, fract(vWorld.y / 3.0) * 3.0);
              float m2 = smoothstep(th - 0.03 - low * 0.12 * wear, th + 0.03 - low * 0.12 * wear, nz);
              float rim2 = smoothstep(th - 0.08 - low * 0.12 * wear, th - 0.03 - low * 0.12 * wear, nz) - m2;
              float ml = mat < 3.5 ? ${LAYER.adobe}.0 : mat < 4.5 ? ${LAYER.block}.0 : ${LAYER.brick}.0;
              vec3 mc = mat < 3.5 ? vec3(0.5, 0.37, 0.26) : mat < 4.5 ? vec3(0.46, 0.45, 0.43) : vec3(0.52, 0.26, 0.18);
              vec3 mas = mc * detailK(texATg(ml, vUv * 1.3, sel, uvDX * 1.3, uvDY * 1.3)) * (0.86 + 0.28 * grime);
              alb = mix(alb, mas, m2) * (1.0 - 0.38 * rim2);
            }
          }
        }
      #endif
        vec3 L = vBake;
      #ifdef LMAP
        vec2 lmuv = (vWorld.xz - uLMRect.xy) / (uLMRect.zw - uLMRect.xy);
        if (lmuv.x > 0.0 && lmuv.y > 0.0 && lmuv.x < 1.0 && lmuv.y < 1.0) L = texture(uLM, lmuv).rgb;
      #endif
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        float ndl = dot(n, uSunDir);
        vec3 sun = vec3(0.0); float shF = 0.0;
        if (ndl > 0.0 && uSunCol.r > 0.0) { shF = sunShadow(vWorld, n * (0.12 + 0.5 * (1.0 - ndl)), 1.6); sun = uSunCol * ndl * shF; }
        L += sun;
        vec3 V = normalize(cameraPosition - vWorld);
      #ifndef LMAP
        L += pointLights(vWorld + n * 0.05, n) + spotLights(vWorld, n, 0.0);
      #endif
        vec3 c = alb * L;
        float alpha = 1.0;
      #if !defined(GLASS) && !defined(WATER) && !defined(LAMP)
        if (uWet > 0.0) { // rain: darker, glossy up-facing surfaces (drying off after the rain)
          float up = max(n.y, 0.0), wl = uWet * wetLeft(vWorld, 0.8);
          c *= mix(1.0, 0.66, wl * (0.45 + 0.55 * up));
          c += uSkyHor * 0.16 * wl * up * pow(1.0 - max(dot(n, V), 0.0), 2.0);
        }
      #endif
      #if !defined(GLASS) && !defined(WATER) && !defined(LAMP) && !defined(LMAP)
        // metal: a sun highlight and a faint sky reflection, both eaten away by rust
        float lay = floor(vLayer + 0.5);
        float metal = lay == ${LAYER.metal}.0 ? 1.0 : lay == ${LAYER.corrugated}.0 ? 0.3 : lay == ${LAYER.rust}.0 ? 0.1 : 0.0;
        if (metal > 0.0) {
          float rust = clamp((vColor.r - vColor.b) * 3.5 - 0.15, 0.0, 1.0);
          metal *= (1.0 - 0.85 * rust) * (0.6 + 0.4 * grime);
          vec3 H = normalize(V + uSunDir);
          float sp = pow(max(dot(n, H), 0.0), 48.0) * shF * step(0.0, ndl);
          vec3 R = reflect(-V, n);
          float fres = 0.25 + 0.75 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
          // fake environment (early-2000s chrome): the sky's colours with a bright horizon band and a dark ground half
          float ry = R.y;
          vec3 refl = ry > 0.0 ? mix(uSkyHor * 1.15, uSkyZen, smoothstep(0.0, 0.6, ry)) : mix(uSkyHor * 0.8, vec3(0.32, 0.27, 0.2), smoothstep(0.0, -0.3, ry));
          c = mix(c, c * 0.75 + refl * 0.45, 0.4 * metal * fres) + uSunCol * sp * 0.55 * metal;
        }
      #endif
      #ifdef GLASS
        { // a thin tinted pane: mostly see-through, sky reflection at grazing angles, sun glint
          vec3 H = normalize(V + uSunDir);
          float sp = pow(max(dot(n, H), 0.0), 160.0) * shF * step(0.0, ndl);
          float fres = pow(1.0 - abs(dot(n, V)), 4.0);
          vec3 R = reflect(-V, n);
          vec3 refl = uSkyRefl * (0.55 + 0.45 * clamp(R.y * 0.5 + 0.5, 0.0, 1.0));
          c = vColor * L * 0.35 + refl * (0.25 + 0.6 * fres) + uSunCol * sp * 0.8;
          alpha = clamp(0.1 + 0.55 * fres + sp * 0.6, 0.0, 0.9);
          if (vWin >= 0.0 && vWin < uWinThresh) {
            // lit room behind the glass: warm, dimmer toward the bottom, shapes of a room / curtains
            float k = 0.55 + 0.45 * fract(vWin * 53.17);
            float room = 0.75 + 0.25 * sin(vWorld.y * 5.0 + fract(vWin * 17.3) * 6.0) * sin((vWorld.x + vWorld.z) * 3.1);
            c = uWinGlow * k * room * (0.8 + 0.25 * fract(vWorld.y * 0.6 + vWin));
            alpha = 0.92;
          }
        }
      #endif
      #ifdef WATER
        float sheen = smoothstep(0.42, 0.5, fract((vWorld.x + vWorld.z) * 0.31 + vWorld.y * 0.45)) * smoothstep(0.62, 0.54, fract((vWorld.x + vWorld.z) * 0.31 + vWorld.y * 0.45));
        c = vColor * L * 0.55 + uSkyRefl * (0.08 + 0.14 * sheen);
        if (vWin >= 0.0 && vWin < uWinThresh) {
          // lit room behind the glass: warm, dimmer toward the bottom, shapes of a room / curtains
          float k = 0.55 + 0.45 * fract(vWin * 53.17);
          float room = 0.75 + 0.25 * sin(vWorld.y * 5.0 + fract(vWin * 17.3) * 6.0) * sin((vWorld.x + vWorld.z) * 3.1);
          c = uWinGlow * k * room * (0.8 + 0.25 * fract(vWorld.y * 0.6 + vWin));
        }
      #endif
      #ifdef LAMP
        c = (vWin < uLampThresh) ? vColor * 2.6 : vColor * vBake * 0.35 + uSkyRefl * 0.05;
      #endif
        gl_FragColor = vec4(haze(c), alpha);
      }`,
    vertexColors: true,
    ...(kind === 'glass' ? { transparent: true, depthWrite: false } : {}),
  });
}

// ------------------------------------------------------------------ asphalt (roads + junction pads)
// Everything procedural, per pixel: aggregate texture, tone drift, wheel-path wear and an oil streak,
// crumbling edges, crack network + alligator cracking, rectangular repairs, potholes, wind-blown sand,
// broken slabs on ruined roads, faded paint lines. attribute rd = (u across -1..1, s along (m), condition,
// half-width), rl = line flags (1 centre dashed, 2 centre solid, 4 edge lines, 8 a road (not a pad)).
function asphaltMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec4 rd; attribute float rl; attribute vec3 bake;
      varying vec4 vRd; varying float vRl; varying vec3 vN; varying vec3 vBake;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        vRd = rd; vRl = rl; vBake = bake;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTex; uniform sampler2D uLM; uniform vec4 uLMRect; uniform vec3 uSunDir; uniform vec3 uSunCol;
      varying vec4 vRd; varying float vRl; varying vec3 vN; varying vec3 vBake;
      ${HAZE}
      ${SHADOW}
      ${DETAIL}
      float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 h2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return vn(p) * 0.55 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 - 3.3) * 0.15; }
      // worley: (F1, F2, cell id)
      vec3 wor(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = h2(i + g); float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; id = h1(i + g); } else if (d < d2) d2 = d; }
        return vec3(d1, d2, id); }
      void main() {
        float u = vRd.x, s = vRd.y, cond = vRd.z, hw = max(vRd.w, 0.5), wear = 1.0 - cond;
        bool road = mod(floor(vRl / 8.0), 2.0) > 0.5;
        vec2 W = vWorld.xz;
        vec2 q = road ? vec2(s, u * hw) : W; // road frame (m) for rectangular features
        float au = abs(u);
        // crumbling edge
        float ragged = (fbm(vec2(s * 0.9, u > 0.0 ? 3.0 : 9.0) + W * 0.15) - 0.5) * (0.18 + 0.35 * wear) + (h1(floor(W * 6.0)) - 0.5) * 0.04;
        float e = au + ragged;
        if (e > 1.0) discard;
        // base asphalt: aged grey, aggregate texture, slow tone drift
        vec3 c = mix(vec3(0.07, 0.068, 0.065), vec3(0.15, 0.143, 0.13), 0.15 + 0.6 * wear);
        c *= detailK(textureGrad(uTex, vec3(W / 3.2, ${LAYER.asphalt}.0), dFdx(W / 3.2), dFdy(W / 3.2)).rgb);
        c *= 0.86 + 0.28 * fbm(W / 11.0);
        if (road) {
          float wp = exp(-pow((au - 0.3) / 0.09, 2.0)) + exp(-pow((au - 0.72) / 0.09, 2.0));
          c = mix(c, c * 1.22 + 0.012, wp * (0.35 + 0.4 * wear));          // polished wheel paths
          c *= 1.0 - 0.18 * exp(-pow((au - 0.5) / 0.07, 2.0)) * (0.5 + 0.5 * vn(vec2(s / 4.0, 1.0)));  // oil streak
        }
        // rectangular repairs (cut edges, darker or greyer tar)
        vec2 pc = floor(q / vec2(7.0, 3.0));
        float ph = h1(pc + 3.7);
        if (ph < 0.07 + 0.16 * wear) {
          vec2 lo = (pc + vec2(0.1, 0.12) + h2(pc) * vec2(0.35, 0.3)) * vec2(7.0, 3.0), sz = vec2(1.5, 0.9) + h2(pc + 1.3) * vec2(3.5, 1.6);
          vec2 d = abs(q - lo - sz * 0.5) - sz * 0.5;
          float inP = step(max(d.x, d.y), 0.0), seam = step(abs(max(d.x, d.y)), 0.035);
          c = mix(c, h1(pc + 9.1) < 0.6 ? c * 0.72 : c * 1.18, inP);
          c *= 1.0 - seam * 0.35;
        }
        // cracks: long network + alligator cracking in the worn wheel paths
        vec2 qw = W + (vec2(fbm(W / 3.0 + 1.3), fbm(W / 3.0 - 8.1)) - 0.5) * 2.2; // warped world coords: no flagstone grid, seamless at pads
        vec3 w1 = wor(qw / 3.4 + 11.0);
        float crack = (1.0 - smoothstep(0.0, 0.02 + 0.025 * wear, w1.y - w1.x)) * smoothstep(0.56 - wear * 0.36, 0.62 - wear * 0.36, fbm(W / 13.0 + 4.0));
        vec3 w2 = wor(qw / 0.5);
        float allig = (1.0 - smoothstep(0.0, 0.05, w2.y - w2.x)) * smoothstep(0.45, 0.85, wear) * step(0.6, fbm(W / 5.0 - 2.0)) * (road ? smoothstep(0.2, 0.0, abs(au - 0.3) - 0.12) + smoothstep(0.2, 0.0, abs(au - 0.72) - 0.12) : 0.5);
        float cr = clamp(crack + allig * 0.8, 0.0, 1.0);
        vec3 crackC = mix(vec3(0.03, 0.028, 0.025), vec3(0.11, 0.115, 0.05), smoothstep(0.45, 0.9, wear) * step(0.6, h1(floor(W * 2.0))));
        c = mix(c, crackC, cr * 0.7);
        // sand: blown in from the edges and caught in the cracks
        float sandK = smoothstep(0.62, 1.0, au + (fbm(W / 3.0 + 20.0) - 0.5) * 0.55) * (0.45 + 0.55 * wear) + cr * wear * 0.35 + smoothstep(0.72, 0.95, fbm(W / 4.5 + 40.0)) * wear * 0.5;
        vec3 sandC = vec3(0.42, 0.34, 0.24) * (0.9 + 0.2 * vn(W * 1.7));
        c = mix(c, sandC, clamp(sandK, 0.0, 0.9));
        // broken slabs on ruined roads: dirt and gravel showing through
        vec3 w3 = wor(qw / 2.4 + 5.0);
        float gone = smoothstep(0.0, 0.08, (wear - 0.55) * 1.4 - w3.z) * smoothstep(0.0, 0.12, w3.y - w3.x + (vn(W * 4.0) - 0.5) * 0.15);
        vec3 ground = mix(vec3(0.36, 0.29, 0.2), vec3(0.27, 0.23, 0.16), vn(W * 1.3)) * (0.88 + 0.24 * vn(W * 9.0));
        ground = mix(ground, vec3(0.2, 0.2, 0.11), smoothstep(0.62, 0.8, vn(W * 0.7 + 3.0)) * 0.5); // dry weeds
        c = mix(c, ground, gone);
        // potholes: sunken, a crumbled rim, dirt in the bottom
        vec2 hc = floor(W / 3.6);
        if (h1(hc + 1.9) < 0.05 + 0.25 * wear) {
          vec2 ctr = (hc + 0.2 + h2(hc + 4.4) * 0.6) * 3.6;
          float rr = 0.25 + h1(hc + 7.7) * (0.35 + 0.5 * wear);
          vec2 dv = (W - ctr) / vec2(1.0 + 0.4 * h1(hc), 1.0);
          float dd = length(dv) + (vn(W * 3.0) - 0.5) * 0.18;
          float inside = smoothstep(rr, rr - 0.05, dd), rim = smoothstep(rr + 0.12, rr, dd) * (1.0 - inside);
          float lit = 0.6 + 0.4 * dot(normalize(dv + 1e-4), normalize(uSunDir.xz)); // far wall lit, near wall in shade
          c = mix(c, vec3(0.2, 0.17, 0.13) * lit * (0.7 + 0.5 * vn(W * 6.0)), inside);
          c = mix(c, c * 1.35, rim * 0.6);
        }
        // paint lines, worn away in patches
        float fade = clamp(0.9 - wear * 1.1 + (fbm(q / vec2(14.0, 1.0) + 60.0) - 0.5) * 0.9, 0.0, 1.0) * (1.0 - cr) * (1.0 - clamp(sandK, 0.0, 1.0));
        float m = u * hw;
        if (mod(vRl, 2.0) > 0.5 && abs(m) < 0.08 && mod(s, 9.0) < 3.6) c = mix(c, vec3(0.62, 0.45, 0.12), fade * 0.85);
        if (mod(floor(vRl / 2.0), 2.0) > 0.5 && abs(abs(m) - 0.12) < 0.06) c = mix(c, vec3(0.62, 0.45, 0.12), fade * 0.85);
        if (mod(floor(vRl / 4.0), 2.0) > 0.5 && abs(abs(m) - (hw - 0.35)) < 0.07) c = mix(c, vec3(0.62, 0.6, 0.55), fade * 0.8);
        // darker crumb at the very edge
        c *= 1.0 - smoothstep(0.86, 1.0, e) * 0.25;
        // light: baked ground lightmap + sun
        vec3 L = vBake;
        vec2 lmuv = (W - uLMRect.xy) / (uLMRect.zw - uLMRect.xy);
        if (lmuv.x > 0.0 && lmuv.y > 0.0 && lmuv.x < 1.0 && lmuv.y < 1.0) L = texture(uLM, lmuv).rgb;
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        float ndl = dot(n, uSunDir);
        if (ndl > 0.0 && uSunCol.r > 0.0) L += uSunCol * ndl * sunShadow(vWorld, n * (0.12 + 0.5 * (1.0 - ndl)), 1.6);
        L += spotLights(vWorld, n, 0.0);
        gl_FragColor = vec4(haze(c * L), 1.0);
      }`,
  });
}

// textured sign / mural: map × bake
export function mapMaterial(map, lampR = null, opt = {}) {
  const defines = lampR != null ? { NEON: '' } : {};
  if (opt.linear) defines.SRGB_IN = '';
  return new THREE.ShaderMaterial({
    
    defines,
    uniforms: { ...U, uMap: { value: map }, uR: { value: lampR ?? 9 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec3 bake; varying vec3 vBake; varying vec2 vUv; varying vec3 vN;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * wp; vDepth = -mv.z; vBake = bake; vUv = uv; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uR; uniform float uLampThresh; uniform vec3 uSunDir; uniform vec3 uSunCol; varying vec3 vBake; varying vec2 vUv; varying vec3 vN;
      ${HAZE}
      ${SHADOW}
      ${PLIGHTS}
      void main() {
        vec4 t = texture(uMap, vUv); if (t.a < 0.5) discard;
      #ifdef SRGB_IN
        t.rgb = pow(t.rgb, vec3(2.2));
      #endif
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 c = t.rgb * (vBake + pointLights(vWorld + n * 0.05, n) + spotLights(vWorld, n, 0.0) + (ndl > 0.0 ? uSunCol * ndl * sunShadow(vWorld, n * (0.12 + 0.5 * (1.0 - ndl)), 1.4) : vec3(0.0)));
      #ifdef NEON
        if (uR < uLampThresh) c = t.rgb * 2.4 + t.rgb * vBake * 0.3;
      #endif
        gl_FragColor = vec4(haze(c), 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ terrain
function terrainMaterial(strip = false) {
  return new THREE.ShaderMaterial({
    defines: strip ? { STRIP: '' } : {},
    uniforms: U,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec3 bake; attribute vec4 blend;
      varying vec3 vColor; varying vec3 vBake; varying vec4 vBlend; varying vec3 vN;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * wp; vDepth = -mv.z; vColor = color; vBake = bake; vBlend = blend; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTex; uniform sampler2D uLM; uniform vec4 uLMRect; uniform vec3 uSunDir; uniform vec3 uSunCol;
      uniform sampler2D uG1; uniform sampler2D uG2; uniform sampler2D uG3; uniform vec4 uGRect; uniform vec3 uRockCol; uniform float uWet; uniform float uTime; uniform vec3 uSkyHor; uniform vec3 uSkyZen; uniform sampler2D uVeg; uniform vec4 uVegRect; uniform float uVegOn; uniform float uVegShow;
      uniform sampler2D uTempTex; uniform vec4 uTempRect; uniform float uDryH;
      // after rain: local wetness left, from hours of drying (uDryH) and the surface temperature there (hot asphalt dries in ~45 min, shade / night much slower)
      float wetLeft(vec3 w, float slow) { if (uDryH < 0.0) return 1.0; vec2 t = clamp((w.xz - uTempRect.xy) / (uTempRect.zw - uTempRect.xy), 0.0, 1.0); float T = texture2D(uTempTex, t).r; return clamp(1.0 - uDryH / (40.0 / max(4.0, T - 8.0) * slow), 0.0, 1.0); }
      uniform sampler2D uCut; uniform vec4 uCutRect; uniform float uCutOn;
      varying vec3 vColor; varying vec3 vBake; varying vec4 vBlend; varying vec3 vN;
      ${HAZE}
      ${SHADOW}
      ${DETAIL}
      float sel;
      vec2 gW, gDX, gDY;
      vec3 TK(float layer, float k) { return texATg(layer, gW / k, sel, gDX / k, gDY / k); }
      void main() {
        vec2 w = vWorld.xz; gW = w; gDX = dFdx(w); gDY = dFdy(w);
      #ifndef STRIP
        // cliff bands (retaining walls, culvert fills): the grid surface is replaced by exact strips there
        if (uCutOn > 0.5) { vec2 cuv = (w - uCutRect.xy) / uCutRect.zw; if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0 && texture(uCut, cuv).r > 0.5) discard; }
      #endif
        sel = texture(uTex, vec3(w / 41.0, ${LAYER.grime}.0)).r;
        vec4 g1 = vec4(0.0), g2 = vec4(0.0), g3 = vec4(0.0);
        vec2 guv = (w - uGRect.xy) / (uGRect.zw - uGRect.xy);
        if (guv.x > 0.0 && guv.y > 0.0 && guv.x < 1.0 && guv.y < 1.0) { g1 = texture(uG1, guv); g2 = texture(uG2, guv); g3 = texture(uG3, guv); }
        float base = 1.0 - g1.a;
        vec3 det = TK(${LAYER.sand}.0, 7.0);
        if (vBlend.w * base > 0.01) det = mix(det, TK(${LAYER.scrub}.0, 3.2), vBlend.w * base);
        float wd = max(vBlend.y * base, g2.x);
        if (wd > 0.01) det = mix(det, TK(${LAYER.dirt}.0, 4.0), wd);
        float wt = max(vBlend.z * base, g2.y);
        if (wt > 0.01) det = mix(det, TK(${LAYER.tilled}.0, 3.0), wt);
        if (g2.z > 0.01) det = mix(det, TK(${LAYER.gravel}.0, 2.5), g2.z);
        if (g2.w > 0.01) det = mix(det, TK(${LAYER.urban}.0, 3.0), g2.w);
        if (g3.x > 0.01) det = mix(det, TK(${LAYER.scrub}.0, 3.2), g3.x);
        if (g3.y > 0.01) det = mix(det, textureGrad(uTex, vec3(w / 1.6, ${LAYER.cobble}.0), gDX / 1.6, gDY / 1.6).rgb, g3.y);
        if (g3.z > 0.01) det = mix(det, TK(${LAYER.concrete}.0, 2.4), g3.z);
        if (g3.w > 0.01) det = mix(det, textureGrad(uTex, vec3(w / 1.4, ${LAYER.pavers}.0), gDX / 1.4, gDY / 1.4).rgb, g3.w);
        if (vBlend.x > 0.01) det = mix(det, TK(${LAYER.rock}.0, 4.5), vBlend.x);
        // cliffs: steep ground turns to rock, projected on the slope face (no stretching), from the live
        // normal, so sculpting a steep bank turns it to rock straight away. Painted ground resists a little.
        vec3 nn = normalize(vN);
        float cliff = smoothstep(0.88, 0.66, nn.y) * (1.0 - 0.6 * g1.a);
        vec2 tp = (abs(nn.x) > abs(nn.z) ? vec2(vWorld.z, vWorld.y * 1.6) : vec2(vWorld.x, vWorld.y * 1.6)) / 3.6, tdx = dFdx(tp), tdy = dFdy(tp);
        if (cliff > 0.01) {
          det = mix(det, texATg(${LAYER.rock}.0, tp, sel, tdx, tdy) * 1.08, cliff);
        }
        // large-scale variation so nothing reads as a tile
        float macro = texture(uTex, vec3(w / 61.0, ${LAYER.plain}.0)).r * 2.0;
        det = detailK(det) * mix(1.0, macro, 0.3) * (0.9 + 0.2 * texture(uTex, vec3(w / 23.0, ${LAYER.grime}.0)).r);
        vec3 col = mix(vColor, g1.rgb * g1.rgb, g1.a);
        col = mix(col, uRockCol, cliff * 0.85);
        vec3 alb = col * det;
        // vegetation cover: bare ground washes out sandy and dusty, well-covered ground goes darker and richer
        float cv = 0.3;
        if (uVegOn > 0.0) {
          vec2 vuv = (w - uVegRect.xy) / (uVegRect.zw - uVegRect.xy);
          if (vuv.x > 0.0 && vuv.y > 0.0 && vuv.x < 1.0 && vuv.y < 1.0) cv = texture(uVeg, vuv).r;
          float paved = clamp(g2.z * 0.5 + g2.w + g3.y + g3.z + g3.w, 0.0, 1.0) + cliff;
          float lowc = (1.0 - smoothstep(0.03, 0.32, cv)) * (1.0 - clamp(paved, 0.0, 1.0));
          float hic = smoothstep(0.3, 0.9, cv) * (1.0 - clamp(paved, 0.0, 1.0));
          float lum = dot(alb, vec3(0.3, 0.55, 0.15));
          vec3 dusty = vec3(lum) * vec3(1.12, 1.02, 0.84) * 1.02 * (0.94 + 0.12 * cNoise(w * 1.9));
          alb = mix(alb, dusty, lowc * 0.44);
          alb = mix(alb, alb * vec3(0.8, 0.86, 0.72), hic * 0.55);
        }
        if (uVegShow > 0.5) { vec2 vuv = (w - uVegRect.xy) / (uVegRect.zw - uVegRect.xy); float c2 = texture(uVeg, vuv).r; alb = mix(vec3(0.55, 0.42, 0.2), vec3(0.06, 0.4, 0.08), c2) * 0.9 + 0.05 * step(0.5, fract(c2 * 10.0)); }
        vec2 lmuv = (w - uLMRect.xy) / (uLMRect.zw - uLMRect.xy);
        vec3 L = vBake;
        if (lmuv.x > 0.0 && lmuv.y > 0.0 && lmuv.x < 1.0 && lmuv.y < 1.0) {
          vec2 e = min(lmuv, 1.0 - lmuv) * (uLMRect.z - uLMRect.x);
          L = mix(vBake, texture(uLM, lmuv).rgb, clamp(min(e.x, e.y) / 6.0, 0.0, 1.0));
        }
        vec3 n = normalize(vN);
        float ndl = dot(n, uSunDir);
        if (ndl > 0.0 && uSunCol.r > 0.0) L += uSunCol * ndl * sunShadow(vWorld, n * (0.14 + 0.5 * (1.0 - ndl)), 1.8);
        L += spotLights(vWorld, n, 0.0);
        vec3 cT = alb * L;
        if (uWet > 0.0) { // rain: wet darkening, puddles in the flat low spots (sky-coloured, rippling)
          float wl = wetLeft(vWorld, 1.0), wp = uDryH < 0.0 ? 1.0 : wetLeft(vWorld, 1.8); // the ground dries first, puddles last
          cT *= mix(1.0, 0.62, uWet * wl);
          float pn = cNoise(w / 5.5) * 0.65 + cNoise(w / 2.1 + 3.7) * 0.35;
          float pn2 = cNoise(w / 1.3 + 9.1);
          float th = 0.25 * sqrt(wp); // puddles shrink from the edges into their deepest spots
          float pud = smoothstep(th, th - 0.05, pn + (pn2 - 0.5) * 0.08) * smoothstep(0.975, 0.995, n.y) * (1.0 - cliff) * (1.0 - g3.y - g3.w) * uWet * step(0.001, wp);
          if (pud > 0.0) {
            float rip = cNoise(w * 3.0 + vec2(uTime * 0.7, -uTime * 0.5)) * 0.5 + cNoise(w * 6.0 - uTime) * 0.5;
            vec3 Vd = normalize(cameraPosition - vWorld);
            vec3 sky = mix(uSkyHor * 0.9, uSkyZen * 1.1, 0.35 + 0.3 * rip);
            cT = mix(cT, sky * (0.24 + 0.22 * pow(1.0 - max(Vd.y, 0.0), 2.0)) + cT * 0.35, pud * 0.8);
          }
        }
        gl_FragColor = vec4(haze(cT), 1.0);
      }`,
    vertexColors: true,
  });
}

// distant hills: simple lambert + heavy haze, never baked
function backdropMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      varying vec3 vColor; varying vec3 vN;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = viewMatrix * wp; vDepth = -mv.z; vColor = color; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTex; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb;
      varying vec3 vColor; varying vec3 vN;
      ${HAZE}
      void main() {
        vec3 det = texture(uTex, vec3(vWorld.xz / 60.0, ${LAYER.rock}.0)).rgb * 2.0;
        vec3 n = normalize(vN);
        vec3 L = uAmb * (0.6 + 0.4 * n.y) * 1.4 + uSunCol * max(dot(n, uSunDir), 0.0);
        vec3 c = vColor * mix(vec3(1.0), det, 0.5) * L;
        // far away: always well into the haze, more so low down
        float h = clamp(vWorld.y / 120.0, 0.0, 1.0);
        float f = clamp(0.38 + uHaze * uFogK * 3.0 - h * 0.18, 0.0, 0.9);
        gl_FragColor = vec4(mix(c, uHazeCol, f), 1.0);
      }`,
    vertexColors: true,
  });
}

// ------------------------------------------------------------------ vegetation (instanced)
function vegMaterial(cards) {
  return new THREE.ShaderMaterial({
    
    uniforms: U,
    side: THREE.DoubleSide,
    defines: cards ? { CARDS: '' } : {},
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec3 iBake; attribute float iSun; attribute float iTint;
      attribute float layer;
      varying vec3 vColor; varying vec3 vLight; varying vec2 vUv; varying float vLayer; varying vec3 vSun; varying vec3 vOff;
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uTime;
      void main() {
        mat4 im = instM();
        vec3 p = position;
      #ifdef CARDS
        // gentle sway for foliage
        float sway = sin(uTime * 1.3 + im[3].x * 0.3 + im[3].z * 0.2) * 0.04 * max(p.y - 0.5, 0.0);
        p.x += sway;
      #endif
        vec4 wp = modelMatrix * im * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec3 n = normalize(mat3(modelMatrix * im) * normal);
        float d = dot(n, uSunDir);
      #ifdef CARDS
        float lam = pow(clamp(d * 0.5 + 0.5, 0.0, 1.0), 1.5) * 1.1;
      #else
        float lam = max(d, 0.0);
      #endif
        float top = clamp(position.y / 3.0, 0.0, 1.0);
        vLight = iBake * (0.82 + 0.25 * top);
        vSun = uSunCol * lam;
      #ifdef CARDS
        vOff = uSunDir * 0.35;
      #else
        vOff = n * 0.08;
      #endif
        vColor = color * iTint;
        vUv = uv; vLayer = layer;
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp sampler2DArray;
      uniform sampler2DArray uTex; uniform sampler2D uAtlas; uniform float uDetail;
      varying vec3 vColor; varying vec3 vLight; varying vec2 vUv; varying float vLayer; varying vec3 vSun; varying vec3 vOff;
      ${HAZE}
      ${SHADOW}
      void main() {
      #ifdef CARDS
        vec4 t = texture(uAtlas, vUv);
        // sharpen alpha so mipmapped cards keep their cut-outs (alpha-to-coverage trick)
        float a = (t.a - 0.45) / max(fwidth(t.a), 1e-4) + 0.5;
        if (a < 0.5) discard;
        vec3 alb = t.rgb * vColor;
      #else
        vec3 alb = vColor * (1.0 + (texture(uTex, vec3(vUv, floor(vLayer + 0.5))).rgb * 2.0 - 1.0) * uDetail);
      #endif
        vec3 Lt = vLight;
        if (vSun.r > 0.0) Lt += vSun * sunShadow(vWorld, vOff, 1.5);
        Lt += spotLights(vWorld, vec3(0.0, 1.0, 0.0), 0.65);
        gl_FragColor = vec4(haze(alb * Lt), 1.0);
      }`,
    vertexColors: true,
  });
}

// ------------------------------------------------------------------ leaf cards on structures / props
// Small plants, flowers, vines, roof gardens: alpha-tested cards from the plant atlas (uv.x >= 1) or the
// tree atlas. Baked light per vertex + wrapped sun with the shadow map, a little wind sway at the tops.
function leafMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide, vertexColors: true,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      attribute vec3 bake;
      varying vec3 vColor; varying vec3 vBake; varying vec2 vUv; varying vec3 vN;
      uniform float uTime; uniform float uWind;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float top = fract(uv.y * 4.0 - 0.0001); // height within the atlas cell: tops sway, bases stay put
        float ph = wp.x * 0.7 + wp.z * 0.5;
        wp.x += sin(uTime * 1.7 + ph) * 0.035 * top * uWind;
        wp.z += cos(uTime * 1.3 + ph * 1.3) * 0.025 * top * uWind;
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vColor = color; vBake = bake; vUv = uv;
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas; uniform sampler2D uPlants; uniform vec3 uSunDir; uniform vec3 uSunCol;
      varying vec3 vColor; varying vec3 vBake; varying vec2 vUv; varying vec3 vN;
      ${HAZE}
      ${SHADOW}
      void main() {
        vec4 t = vUv.x >= 1.0 ? texture2D(uPlants, vUv - vec2(1.0, 0.0)) : texture2D(uAtlas, vUv);
        float a = (t.a - 0.45) / max(fwidth(t.a), 1e-4) + 0.5;
        if (a < 0.5) discard;
        vec3 n = normalize(vN);
        float lam = pow(clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 1.5) * 1.1;
        vec3 L = vBake * 0.95;
        if (uSunCol.r > 0.0) L += uSunCol * lam * sunShadow(vWorld, uSunDir * 0.3, 1.5);
        L += spotLights(vWorld, n, 0.6);
        gl_FragColor = vec4(haze(t.rgb * vColor * L), 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ height capture (for baking)
export function heightMaterial(cards, range) {
  return new THREE.ShaderMaterial({
    
    uniforms: { uAtlas: U.uAtlas, uPlants: U.uPlants, uMin: { value: range[0] }, uRange: { value: range[1] - range[0] } },
    side: THREE.DoubleSide,
    defines: cards ? { CARDS: '' } : {},
    vertexShader: /* glsl */ `
      varying float vY; varying vec2 vUv;
      void main() {
      #ifdef USE_INSTANCING
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        vec4 wp = modelMatrix * vec4(position, 1.0);
      #endif
        vY = wp.y; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMin; uniform float uRange; uniform sampler2D uAtlas; uniform sampler2D uPlants;
      varying float vY; varying vec2 vUv;
      void main() {
      #ifdef CARDS
        float al = vUv.x >= 1.0 ? textureLod(uPlants, vUv - vec2(1.0, 0.0), 0.0).a : textureLod(uAtlas, vUv, 0.0).a;
        if (al < 0.45) discard;
      #endif
        float h = clamp((vY - uMin) / uRange, 0.0, 1.0) * 16777215.0;
        float r = floor(h / 65536.0); h -= r * 65536.0;
        float g = floor(h / 256.0); float b = h - g * 256.0;
        gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ still water (early-2000s style)
// Ponds, troughs, wells, ditches, the sea. No real reflection or refraction: two scrolling water tiles,
// a fake environment (the sky's own colours with a bright horizon band, warped by the ripples), a
// texture-driven sun glitter, darker toward the middle (from the depth behind it), a soft see-through
// shore with a thin scum / foam line. Drawn in the water pass (it reads the copied depth for the shore).
function stillWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: U, vertexColors: true,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      varying vec3 vCol; varying float vNy;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vNy = normalize(mat3(modelMatrix) * normal).y;
      #ifdef USE_COLOR
        vCol = color;
      #else
        vCol = vec3(0.0);
      #endif
        vec4 mv = viewMatrix * wp; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCopy; uniform sampler2D uWaterTex; uniform vec2 uRes; uniform mat4 uProjInv; uniform float uTime; uniform float uWaterOn;
      uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uSkyZen; uniform vec3 uSkyHor;
      varying vec3 vCol; varying float vNy;
      ${HAZE}
      ${SHADOW}
      vec3 viewAt(vec2 uv, float d) { vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
      void main() {
        if (vNy < 0.5) discard;
        vec2 uv = gl_FragCoord.xy / uRes;
        vec3 V = normalize(cameraPosition - vWorld);
        // two scrolling layers of the water tile
        float t = uTime;
        vec4 a = texture2D(uWaterTex, vWorld.xz * 0.21 + vec2(t * 0.012, t * 0.007));
        vec4 b = texture2D(uWaterTex, vWorld.zx * 0.13 - vec2(t * 0.009, -t * 0.011) + 0.37);
        float h = (a.r + b.r) - 1.0;
        vec2 slope = vec2(a.r - b.g, b.r - a.g) * 0.5;
        vec3 n = normalize(vec3(slope.x * 0.35, 1.0, slope.y * 0.35));
        // body colour by kind (vertex colour), lit flat like the rest of the world
        vec3 body = dot(vCol, vec3(1.0)) < 0.02 ? vec3(0.07, 0.16, 0.16) : vCol * 0.5;
        vec3 lit = uAmb * 0.95 + uSunCol * max(uSunDir.y, 0.0) * 0.32;
        vec3 deep = body * lit * 0.75, shallow = body * lit * 1.35;
        // how much water lies behind this pixel (depth copy): shore fade + darker in the middle
        vec4 sc = texture2D(tCopy, uv);
        vec3 vp = (viewMatrix * vec4(vWorld, 1.0)).xyz;
        float thick = uWaterOn > 0.5 ? max(0.0, length(viewAt(uv, sc.a)) - length(vp)) : 1.0;
        float depthK = smoothstep(0.0, 0.35, thick);
        vec3 c = mix(shallow, deep, depthK);
        // fake environment: sky colours with a bright horizon band, warped by the ripples
        vec3 R = reflect(-V, n);
        float hz = clamp(R.y * 1.6 + h * 0.25, 0.0, 1.0);
        vec3 env = mix(uSkyHor * 1.12, uSkyZen, smoothstep(0.05, 0.7, hz)) * (0.9 + 0.2 * a.b);
        float fres = 0.14 + 0.22 * pow(1.0 - max(dot(n, V), 0.0), 3.0) + 0.07 * h;
        c = mix(c, env * 0.9, clamp(fres, 0.0, 0.45));
        // crest highlights and the sun glitter
        c += env * (a.g * 0.10 + b.g * 0.07);
        float sh = uSunCol.r > 0.0 ? sunShadow(vWorld, vec3(0.0, 0.2, 0.0), 1.0) : 0.0;
        float glint = pow(max(dot(R, uSunDir), 0.0), 60.0) * (0.4 + 1.6 * smoothstep(0.55, 0.95, a.g * b.g * 4.0 + 0.5 * sin(t * 3.0 + vWorld.x * 3.1 + vWorld.z * 2.3)));
        c += uSunCol * glint * 0.6 * sh;
        // shore: see-through where it thins, with a thin scum line just inside the edge
        float foam = smoothstep(0.05, 0.0, thick) * smoothstep(0.42, 0.6, b.b) * 0.55;
        c = mix(c, lit * vec3(0.85, 0.82, 0.74), foam);
        float alpha = uWaterOn > 0.5 ? mix(0.55, 0.96, smoothstep(0.0, 0.18, thick)) : 0.9;
        c = mix(sc.rgb, c, uWaterOn > 0.5 ? alpha : 1.0);
        gl_FragColor = vec4(haze(c), 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ registry
export const MATS = {};
export function initMaterials() {
  if (MATS.main) return MATS;
  U.uTex.value = textureArray();
  U.uAtlas.value = foliageAtlas();
  U.uPlants.value = plantAtlas();
  U.uWaterTex.value = waterTexture();
  MATS.main = bakedMaterial('main');
  MATS.glass = bakedMaterial('glass');
  MATS.water = bakedMaterial('water');
  MATS.lamp = bakedMaterial('lamp');
  MATS.cloth = bakedMaterial('cloth');
  MATS.leaf = leafMaterial();
  MATS.terrain = terrainMaterial();
  MATS.terrainStrip = terrainMaterial(true);
  MATS.backdrop = backdropMaterial();
  MATS.veg = vegMaterial(false);
  MATS.cards = vegMaterial(true);
  MATS.road = bakedMaterial('ground');
  MATS.asphalt = asphaltMaterial();
  MATS.road.polygonOffset = true; MATS.road.polygonOffsetFactor = -2; MATS.road.polygonOffsetUnits = -2;
  MATS.water = stillWaterMaterial();
  for (const m of Object.values(MATS)) m.userData.shared = true;
  return MATS;
}

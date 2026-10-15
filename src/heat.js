// Surface temperature map (2 m grid), rebuilt with the time of day / weather. Drives the Heat view overlay and
// the mirage strength in the post shader. Never saved.
//  - absorption: asphalt > tin roofs > rock / dirt > sand / gravel > concrete / plaster roofs > fields > water
//  - sun: gain peaks early afternoon (lags the sun), clouds / overcast / dust / thick haze damp it
//  - night: everything falls toward the air temperature; asphalt and rock hold their heat longest
//  - shade: buildings, side shades, ramadas / pergolas / stalls and trees cast a shadow along the sun that cools
// Texture (half float RGBA): R = °C, G = surface height (terrain or roof), B = shade 0..1
import * as THREE from 'three';
import { presetHour } from './presets.js';
import { obbContains } from './geo.js';

const RES = 2;
const LAYER_ABS = [0.75, 0.6, 0.7, 0.72, 0.55, 0.72, 0.55, 0.6]; // dirt, till, gravel, urban, scrub, cobble, concrete, pavers
const LAYER_MASS = [0.5, 0.4, 0.45, 0.55, 0.35, 0.7, 0.65, 0.6];
const ROOF = { corrugated: [0.95, 0.15], tin: [0.95, 0.15], sheet: [0.95, 0.15], slab: [0.55, 0.7], flat_adobe: [0.62, 0.65], tile: [0.6, 0.5], thatch: [0.45, 0.2], palm: [0.45, 0.2], petate: [0.45, 0.2], tar: [0.92, 0.7], open: [0.72, 0.6] };
const SHADERS = { ramada: [4.5, 4], pergola: [4, 3.5], stall: [2.6, 1.8], tarp_stall: [3, 2.6], shade_cloth: [4, 4], lean_to: [3, 2.2], alley_tarp: [3, 6], bus_shelter: [3.2, 1.6], kiosko: [3, 3], trellis: [3, 2.2], tent_wall: [3, 4], tarp_tent: [3, 3] };
const BIG = new Set(['eucalyptus', 'tamarisk', 'mesquite', 'palo_verde', 'pepper_tree', 'fan_palm', 'date_palm', 'fruit_tree', 'elephant_tree']);

export const airTemp = (h, weather) => 21 + 8 * Math.cos((2 * Math.PI * (h - 15)) / 24) + ({ dust: 2, overcast: -4, rain: -7 }[weather] ?? 0);

export function computeHeat(world, p, sd, box = null, prev = null) {
  const t0 = performance.now();
  const T = world.terrain, W = T.W, D = T.D, Nx = Math.ceil(W / RES), Nz = Math.ceil(D / RES), N = Nx * Nz, x0 = -W / 2, z0 = -D / 2;
  // regional (after an edit, same preset): a changed caster's shadow reaches ≤ 40 m, the blur one cell — recompute the cells
  // within 42 m of the box (O) from inputs gathered over a window one cell wider (I0..), keep the rest of the old map
  const reg = !!(box && prev && prev.Nx === Nx && prev.Nz === Nz && prev.key === `${p.key || p.id}:${p.hour}:${sd.map((v) => v.toFixed(3))}`);
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  const O = reg ? [cl(Math.floor((box[0] - 42 - x0) / RES), Nx), cl(Math.floor((box[1] - 42 - z0) / RES), Nz), cl(Math.ceil((box[2] + 42 - x0) / RES), Nx), cl(Math.ceil((box[3] + 42 - z0) / RES), Nz)] : [0, 0, Nx - 1, Nz - 1];
  const I0 = reg ? cl(O[0] - 1, Nx) : 0, J0 = reg ? cl(O[1] - 1, Nz) : 0, I1 = reg ? cl(O[2] + 1, Nx) : Nx - 1, J1 = reg ? cl(O[3] + 1, Nz) : Nz - 1;
  const h = p.hour ?? presetHour(p.id);
  const air = airTemp(h, p.weather);
  // solar gain, lagging the sun: peaks ~13:45
  let G = Math.max(0, Math.sin((Math.PI * (h - 6.6)) / 14.2));
  if (p.moon || p.sunHidden || sd[1] <= 0) G *= sd[1] > -0.05 && !p.moon ? 0.3 : 0;
  G *= { overcast: 0.25, rain: 0.12, dust: 0.55 }[p.weather] ?? 1;
  G *= 1 - 0.4 * Math.max(0, (p.hazeK ?? 0.3) - 0.3) / 0.7;
  G *= 1 - 0.35 * Math.min(1, p.clouds ?? 0.35) * 0.6;
  const R = Math.exp(-(((h - 15 + 24) % 24)) / 6) * (p.weather === 'rain' ? 0.3 : 1); // stored heat since mid-afternoon

  const abs = new Float32Array(N), mass = new Float32Array(N), sh = new Float32Array(N), hy = new Float32Array(N), roof = new Uint8Array(N);
  const cx = (i) => x0 + (i + 0.5) * RES, cz = (j) => z0 + (j + 0.5) * RES;
  const wl = T.water ? T.water.level ?? 0 : null;
  for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) {
    const x = cx(i), z = cz(j), k = j * Nx + i, y = T.height(x, z);
    hy[k] = y;
    if (wl != null && y < wl - 0.05) { abs[k] = 0.05; mass[k] = -1; continue; }
    const wt = T.surfaceAt(x, z); let s = 0, a = 0, m = 0;
    if (wt) for (let q = 0; q < 8; q++) { s += wt[q]; a += wt[q] * LAYER_ABS[q]; m += wt[q] * LAYER_MASS[q]; }
    const rest = Math.max(0, 1 - s), slope = T.slope(x, z), rock = Math.min(1, Math.max(0, (slope - 0.45) / 0.5));
    a += rest * (0.68 + rock * 0.17); m += rest * (0.3 + rock * 0.6); s += rest;
    a /= s || 1; m /= s || 1;
    const veg = world.veg?.at?.(x, z) ?? 0;
    abs[k] = a + (0.3 - a) * veg * 0.85; mass[k] = m * (1 - veg * 0.5);
  }
  const stampPoly = (poly, fn) => {
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9; for (const [x, z] of poly) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    for (let j = Math.max(J0, Math.floor((bz0 - z0) / RES)); j <= Math.min(J1, Math.floor((bz1 - z0) / RES)); j++)
      for (let i = Math.max(I0, Math.floor((bx0 - x0) / RES)); i <= Math.min(I1, Math.floor((bx1 - x0) / RES)); i++) if (inPoly(cx(i), cz(j), poly)) fn(j * Nx + i);
  };
  const stampObb = (b, fn, pad = 0) => {
    const r = Math.hypot(b.w, b.d) / 2 + pad;
    for (let j = Math.max(J0, Math.floor((b.cz - r - z0) / RES)); j <= Math.min(J1, Math.floor((b.cz + r - z0) / RES)); j++)
      for (let i = Math.max(I0, Math.floor((b.cx - r - x0) / RES)); i <= Math.min(I1, Math.floor((b.cx + r - x0) / RES)); i++) if (obbContains(b, cx(i), cz(j), pad)) fn(j * Nx + i);
  };
  // green fields
  for (const f of world.fields || []) if (f.poly && !f.fallow) stampPoly(f.poly, (k) => { abs[k] = Math.min(abs[k], 0.3); mass[k] = 0.25; });
  // asphalt
  for (const r of world.roads || []) if (r.paved && r.samples) for (const s of r.samples) {
    const rr = r.hw + 0.3;
    for (let j = Math.max(J0, Math.floor((s.z - rr - z0) / RES)); j <= Math.min(J1, Math.floor((s.z + rr - z0) / RES)); j++)
      for (let i = Math.max(I0, Math.floor((s.x - rr - x0) / RES)); i <= Math.min(I1, Math.floor((s.x + rr - x0) / RES)); i++)
        if (Math.hypot(cx(i) - s.x, cz(j) - s.z) < rr) { const k = j * Nx + i; abs[k] = 1.0; mass[k] = 1.0; }
  }
  // roofs + building shadows
  const el = Math.asin(Math.max(-1, Math.min(1, sd[1]))), sdx = -sd[0], sdz = -sd[2], sl = Math.hypot(sdx, sdz) || 1;
  const shadowLen = (H) => (el > 0.03 ? Math.min(40, H / Math.tan(el)) : 0);
  const castObb = (b, H, k0 = 1) => {
    const L = shadowLen(H); if (L <= 0) return;
    for (let t = 0.5; t <= L; t += RES * 0.6) stampObb({ ...b, cx: b.cx + (sdx / sl) * t, cz: b.cz + (sdz / sl) * t }, (k) => { if (!roof[k]) sh[k] = Math.max(sh[k], k0); });
  };
  for (const it of world.items?.values?.() || []) {
    if (it.type !== 'structure') continue;
    const s = it.spec, info = it.info || {}, ms = s._masses || [];
    ms.forEach((m, mi) => {
      const mr = info.massRoof?.[mi] || { mat: s.roofMat || 'slab', h: info.height || 3 };
      const lift = info.lift ?? (+s.lift || 0), H = mr.h + lift + (s._y ?? 0);
      const [a, mm] = ROOF[mr.mat] || [0.65, 0.5];
      stampObb(m, (k) => { roof[k] = 1; abs[k] = a; mass[k] = mm; hy[k] = H; sh[k] = 0; });
      castObb(m, mr.h + lift);
    });
    if (s._shade) castObb(s._shade, 2.6, 0.9), stampObb(s._shade, (k) => { if (!roof[k]) sh[k] = Math.max(sh[k], 0.9); });
  }
  // canopies (props) and trees
  for (const pr of [...(world.spec.props || []), ...(world.genProps || [])]) {
    if (!SHADERS[pr.type]) continue;
    const at = world.propAt?.(pr); if (!at) continue;
    const sz = pr.size || [pr.w || SHADERS[pr.type][0], pr.d || SHADERS[pr.type][1]], b = { cx: at[0], cz: at[1], w: sz[0], d: sz[1], r: ((pr.rot || 0) * Math.PI) / 180 };
    stampObb(b, (k) => { if (!roof[k]) sh[k] = Math.max(sh[k], 0.85); });
    castObb(b, 2.6, 0.85);
  }
  for (const { sp, e } of world.flora?.entries?.() || []) {
    if (!BIG.has(sp)) continue;
    const s = e[3] || 1, r = 2.6 * s, L = shadowLen(4.5 * s) * 0.8, ox = e[0] + (sdx / sl) * L, oz = e[2] + (sdz / sl) * L;
    for (let j = Math.max(J0, Math.floor((oz - r - z0) / RES)); j <= Math.min(J1, Math.floor((oz + r - z0) / RES)); j++)
      for (let i = Math.max(I0, Math.floor((ox - r - x0) / RES)); i <= Math.min(I1, Math.floor((ox + r - x0) / RES)); i++) {
        const k = j * Nx + i, d = Math.hypot(cx(i) - ox, cz(j) - oz); if (d < r && !roof[k]) sh[k] = Math.max(sh[k], 0.8 * (1 - (d / r) ** 3));
      }
  }
  // temperature
  const data = reg ? prev.data : new Float32Array(N * 4), tmp = new Float32Array(N);
  let tMax = -99, tMin = 99;
  for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) { const k = j * Nx + i;
    let t;
    if (mass[k] < 0) t = air * 0.35 + 19 * 0.65; // water: lags the air, mild
    else t = air + 40 * G * abs[k] * (1 - 0.8 * sh[k]) + 14 * mass[k] * abs[k] * R * (1 - 0.4 * sh[k]) - (G === 0 ? 1.5 * (1 - mass[k]) : 0);
    tmp[k] = t;
  }
  // light 3x3 blur (heat bleeds a little), roofs kept sharp
  for (let j = O[1]; j <= O[3]; j++) for (let i = O[0]; i <= O[2]; i++) {
    const k = j * Nx + i; let t = tmp[k];
    if (!roof[k]) { let s = 0, n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= Nx || jj >= Nz) continue; const q = jj * Nx + ii; if (roof[q]) continue; s += tmp[q] * (di || dj ? 1 : 4); n += di || dj ? 1 : 4; } t = s / n; }
    data[k * 4] = t; data[k * 4 + 1] = hy[k]; data[k * 4 + 2] = sh[k]; data[k * 4 + 3] = 1;
  }
  for (let k = 0; k < N; k++) { const t = data[k * 4]; if (t > tMax) tMax = t; if (t < tMin) tMin = t; }
  const H16 = THREE.DataUtils.toHalfFloat;
  let half, tex;
  if (reg) { half = prev.half; for (let j = O[1]; j <= O[3]; j++) for (let i = O[0]; i <= O[2]; i++) { const q = (j * Nx + i) * 4; for (let c = 0; c < 4; c++) half[q + c] = H16(data[q + c]); } tex = prev.tex; tex.needsUpdate = true; }
  else { half = new Uint16Array(N * 4); for (let q = 0; q < N * 4; q++) half[q] = H16(data[q]); tex = new THREE.DataTexture(half, Nx, Nz, THREE.RGBAFormat, THREE.HalfFloatType); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; }
  const at = (x, z) => { const i = Math.floor((x - x0) / RES), j = Math.floor((z - z0) / RES); return i < 0 || j < 0 || i >= Nx || j >= Nz ? air : data[(j * Nx + i) * 4]; };
  console.log(`[heat]${reg ? ' region' : ''} ${reg ? `${O[2] - O[0] + 1}x${O[3] - O[1] + 1} of ` : ''}${Nx}x${Nz} h${h.toFixed(1)} air ${air.toFixed(1)} G ${G.toFixed(2)} ${tMin.toFixed(0)}..${tMax.toFixed(0)}°C ${Math.round(performance.now() - t0)}ms`);
  return { tex, rect: [x0, z0, x0 + Nx * RES, z0 + Nz * RES], at, air, G, tMin, tMax, data, half, Nx, Nz, key: `${p.key || p.id}:${p.hour}:${sd.map((v) => v.toFixed(3))}` };
}

function inPoly(x, z, P) {
  let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; }
  return c;
}

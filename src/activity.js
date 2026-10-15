// Activity map (2 m grid, 0..1): how much human life shows at each spot. Drives life.js (what gets placed where), the
// ground wear decals and the Activity overlay. Built from:
//  - roads: frontage of busy roads (highway / main > paved street > gravel > dirt > lane > track), junctions extra
//  - attractors: busy places push life out from their front door (market, Pemex, cantina, café, shops, clinic, church…)
//  - density: lived-in buildings within ~30 m
//  - the plaza / markets; ruins and empty desert stay quiet
//  - settlement size / wealth / power, the map-wide Activity slider (spec.activity 0..2), and Busier / Quieter paint
import * as THREE from 'three';
import { pointInPoly } from './geo.js';

const RES = 2;
const ROAD_W = (r) => r.type === 'highway' || r.class === 'arterial' ? 1.0 : r.class === 'main' ? 0.95 : r.paved ? 0.75 : r.type === 'street' ? 0.55 : r.type === 'gravel' ? 0.55 : r.type === 'dirt' ? 0.45 : r.type === 'lane' || r.type === 'alley' ? 0.3 : r.type === 'track' ? 0.12 : r.type === 'path' ? 0.08 : 0.35;
export const ATTRACT = { market: 1.0, pemex: 1.0, cantina: 0.9, cafe: 0.85, stand: 0.75, shop: 0.8, store: 0.8, trade: 0.8, tortilleria: 0.85, clinic: 0.7, chapel: 0.6, church: 0.65, hall: 0.6, posada: 0.7, motel: 0.6, workshop: 0.55, garage: 0.6, school: 0.6, house: 0.22, shed: 0.05, utility: 0.08, barracks: 0.35, mission: 0.6, townhall: 0.65, comandancia: 0.5, office: 0.5, bodega: 0.5, kiosk: 0.6, warehouse: 0.3, mill: 0.45, hermandad: 0.75, factory: 0.35, canopy: 0.4 };
export const DEAD = (s) => ['ruin', 'stripped'].includes(s.origin) || s.inhabited === false;

// region (editor): only the cells within ~40 m of the edited box are recomputed (sources that can reach them), the
// rest is kept from prev; the texture is patched in place
export function computeActivity(world, region = null, prev = null) {
  const T = world.terrain, W = T.W, D = T.D, Nx = Math.ceil(W / RES), Nz = Math.ceil(D / RES), N = Nx * Nz, x0 = -W / 2, z0 = -D / 2;
  const spec = world.spec, S = spec.settlement || {};
  const part = !!(region && prev && prev.Nx === Nx && prev.Nz === Nz);
  const REACH = 40, wb = part ? [region[0] - REACH, region[1] - REACH, region[2] + REACH, region[3] + REACH] : null;
  const WI0 = part ? Math.max(0, Math.floor((wb[0] - x0) / RES)) : 0, WI1 = part ? Math.min(Nx - 1, Math.floor((wb[2] - x0) / RES)) : Nx - 1;
  const WJ0 = part ? Math.max(0, Math.floor((wb[1] - z0) / RES)) : 0, WJ1 = part ? Math.min(Nz - 1, Math.floor((wb[3] - z0) / RES)) : Nz - 1;
  const near = (x, z, R) => !part || (x + R >= x0 + WI0 * RES && x - R <= x0 + (WI1 + 1) * RES && z + R >= z0 + WJ0 * RES && z - R <= z0 + (WJ1 + 1) * RES);
  const road = new Float32Array(N), att = new Float32Array(N), dens = new Float32Array(N), plus = new Float32Array(N);
  const cx = (i) => x0 + (i + 0.5) * RES, cz = (j) => z0 + (j + 0.5) * RES;
  const stamp = (x, z, R, fn) => {
    if (!near(x, z, R)) return;
    for (let j = Math.max(WJ0, Math.floor((z - R - z0) / RES)); j <= Math.min(WJ1, Math.floor((z + R - z0) / RES)); j++)
      for (let i = Math.max(WI0, Math.floor((x - R - x0) / RES)); i <= Math.min(WI1, Math.floor((x + R - x0) / RES)); i++) { const d = Math.hypot(cx(i) - x, cz(j) - z); if (d <= R) fn(j * Nx + i, d); }
  };
  // roads: frontage, fading over ~12 m from the edge (max, not sum, so parallel samples don't stack)
  for (const r of world.roads || []) {
    if (!r.samples || r._gate) continue;
    const w = ROAD_W(r), hw = r.hw || 3;
    for (let k = 0; k < r.samples.length; k += 2) { const s = r.samples[k]; stamp(s.x, s.z, hw + 26, (q, d) => { const e = Math.max(0, d - hw); road[q] = Math.max(road[q], w * Math.exp(-e / 12)); }); }
  }
  for (const j of world.junctions || []) stamp(j.x, j.z, 22, (q, d) => { road[q] = Math.min(1.2, road[q] + 0.25 * Math.exp(-d / 9)); });
  // attractors (front doors) and density
  const live = (world.structures || []).filter((s) => s._masses?.length && !DEAD(s));
  for (const s of live) {
    const it = world.items?.get(s.id), fd = it?.info?.frontDoor, r = (s.rot || 0) * Math.PI / 180;
    let px = s.at[0], pz = s.at[1];
    if (fd) { const c = Math.cos(r), sn = Math.sin(r); px = s.at[0] + fd.x * c + fd.z * sn; pz = s.at[1] - fd.x * sn + fd.z * c; }
    const a = ATTRACT[s.kind] ?? 0.3;
    stamp(px, pz, 36, (q, d) => { att[q] += a * Math.exp(-d / (a > 0.5 ? 14 : 8)); });
    stamp(s.at[0], s.at[1], 30, (q) => { dens[q] += 1; });
  }
  if (world.plaza) stamp(world.plaza.at[0], world.plaza.at[1], world.plaza.r + 14, (q, d) => { plus[q] += 0.55 * Math.min(1, Math.exp(-(d - world.plaza.r) / 8)); });
  for (const m of world.markets || []) stamp(m.at[0], m.at[1], (m.r || 10) + 12, (q, d) => { plus[q] += 0.5 * Math.min(1, Math.exp(-(d - (m.r || 10)) / 8)); });
  for (const a of world.areas || []) if (a.type === 'market' || a.type === 'wayhouse') stamp(a.at[0], a.at[1], Math.max(...a.size) / 2 + 10, (q) => { plus[q] += a.type === 'market' ? 0.45 : 0.3; });
  // settlement factor and the slider
  const size = S.core ? 1 : 0.8, wealth = { dead_broke: 0.75, poor: 0.85, struggling: 0.9, average: 1, comfortable: 1.05, prosperous: 1.1, wealthy: 1.1, rich: 1.1 }[S.wealth] ?? 1;
  const slider = Math.max(0, Math.min(2, spec.activity ?? 1));
  const paints = (spec.paint || []).filter((p) => (p.kind === 'busier' || p.kind === 'quieter') && p.poly);
  const data = part ? prev.data : new Float32Array(N);
  for (let j = WJ0; j <= WJ1; j++) for (let i = WI0; i <= WI1; i++) {
    const q = j * Nx + i;
    let a = 0.5 * road[q] + 0.4 * Math.min(1, att[q]) + 0.22 * (1 - Math.exp(-dens[q] / 5)) + plus[q];
    a *= size * wealth * slider;
    for (const p of paints) if (pointInPoly(cx(i), cz(j), p.poly)) a += p.kind === 'busier' ? 0.35 : -0.45;
    data[q] = Math.max(0, Math.min(1, a));
  }
  // ruins nearby: quiet
  for (const s of (world.structures || []).filter((s) => s._masses?.length && DEAD(s))) stamp(s.at[0], s.at[1], 10, (q, d) => { data[q] *= 0.55 + 0.45 * (d / 10); });
  let tex;
  if (part) { tex = prev.tex; const px = tex.image.data; for (let j = WJ0; j <= WJ1; j++) for (let i = WI0; i <= WI1; i++) { const q = j * Nx + i; px[q * 4] = Math.round(data[q] * 255); } tex.needsUpdate = true; }
  else { const px = new Uint8Array(N * 4); for (let q = 0; q < N; q++) { px[q * 4] = Math.round(data[q] * 255); px[q * 4 + 3] = 255; } tex = new THREE.DataTexture(px, Nx, Nz, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; }
  const at = (x, z) => { const i = Math.floor((x - x0) / RES), j = Math.floor((z - z0) / RES); return i < 0 || j < 0 || i >= Nx || j >= Nz ? 0 : data[j * Nx + i]; };
  return { at, tex, rect: [x0, z0, x0 + Nx * RES, z0 + Nz * RES], data, Nx, Nz };
}

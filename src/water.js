// Water: springs, streams and irrigation.
// - a spring (prop) is a small pool in a stone ring with reeds; placing one traces a stream downhill from it
// - a stream (wall type 'stream') is a trickle over the ground: wet bed, water, stones, reeds; it always runs downhill
// - irrigation: water sources (props) feed acequias (wall type 'acequia', drawn downhill, a pump lifts a little);
//   an acequia whose head is at a source / stream / wet acequia carries water, and the fields it passes are
//   irrigated (green, furrows); fields with no water are dry-farmed (sparse, yellow). Sluice gates where a wet
//   ditch passes an irrigated field.
import { Builder, col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL, MISC, ROOF } from './palette.js';
import { lathe, rock } from './shapes.js';
import { PLANT } from './textures.js';
import { pointInPoly, segDist } from './geo.js';

// what can feed an acequia, and how high it lifts the water above its own ground (pumps, tanks on stands)
// WATER: springs, streams, irrigation (wet / dry ditches and fields), water paint and flora. Parked for the MVP:
// off = none of it runs or shows in the editor; the code and the props stay so saved maps still open.
export const WATER = false;
export const WATER_PROPS = ['spring', 'noria', 'motor_pump', 'tanque', 'bordo'];
export const SOURCES = { spring: 0, well: 0.4, hand_pump: 0.4, windmill: 1.6, noria: 1.2, motor_pump: 2.5, bordo: 0, tanque: 0.9, water_tank: 2.0, pond: 0, cistern: 0.3 };
export const FARM_FIELDS = ['field', 'orchard', 'vineyard'];

const reedTint = (r) => col(r.pick([0x8fa868, 0xa6b070, 0x7f9a5c, 0x9aa66a]), 0.06, r);
const mud = (r) => col(r.pick([0x6e5a46, 0x66533f, 0x74604a]), 0.04, r);

// ---------------------------------------------------------------- props
export function addWaterProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // ojo de agua: a spring pool in a ring of stones, reeds round it, the overflow lip toward +Z (the stream's head)
  P.spring = (b, r, o) => {
    const R = o.radius || r.range(1.5, 2.2);
    b.t('dirt'); lathe(b, [[R + 1.2, -0.06], [R + 0.35, 0.1], [R - 0.15, 0.05], [0, 0.0]], mud(r), 0, 0, 0, 22, null);
    b.ch('water').t('plain').cyl(0, 0.08, 0, R - 0.1, R - 0.1, 0.02, 22, MISC.water).ch('main');
    const sc = col(0x9a8f7e, 0.05, r);
    for (let k = 0; k < Math.round(R * 6); k++) { const a = (k / Math.round(R * 6)) * 6.28 + r.range(-0.15, 0.15); if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.3) continue; // the lip
      rock(b, r, Math.cos(a) * (R + 0.05), 0.08, Math.sin(a) * (R + 0.05), r.range(0.22, 0.4), r.range(0.15, 0.28), r.range(0.22, 0.4), sc.clone().offsetHSL(0, 0, r.range(-0.05, 0.04)), r.next() * 6, 1); }
    b.t('stone'); for (const sx of [-0.35, 0.35]) b.box(sx, 0.05, R + 0.25, 0.4, 0.12, 0.5, sc); // the lip stones
    for (let k = 0; k < Math.round(R * 7); k++) { const a = r.range(0, 6.28), d = R + r.range(0.1, 1.0); if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.35) continue;
      b.leafCross(Math.cos(a) * d, 0.0, Math.sin(a) * d, r.range(0.7, 1.2), r.range(1.1, 2.0), PLANT.grass, reedTint(r), 2, r.next() * 3); }
    return {};
  };
  L('spring', 'stone');

  // noria de sangre: a beast walks the ring, the gear turns the upright wheel, clay pots lift water into the trough
  P.noria = (b, r) => {
    const wc = col(WOOD.weathered, 0.05, r), dk = col(WOOD.dark, 0.05, r), sc = col(0xa49884, 0.04, r), pot = col(0xa8603c, 0.06, r);
    b.t('dirt'); lathe(b, [[5.2, -0.05], [4.9, 0.03], [3.9, 0.03], [3.6, -0.05]], col(0xa88c6a, 0.04, r), -2.6, 0, 0, 28, 'noria-ring'); // the worn path
    b.t('stone'); lathe(b, [[1.35, 0], [1.35, 0.7], [1.05, 0.7], [1.05, 0.2], [0, 0.2]], sc, 0, 0, 0, 18, 'noria-well');
    b.ch('water').t('plain').cyl(0, 0.12, 0, 1.0, 1.0, 0.02, 14, MISC.water).ch('main');
    // the upright wheel over the well (axle along X), pots on the rim
    const Rw = 1.5, yc = 1.25;
    b.t('wood');
    for (const sx of [-0.75, 0.75]) { b.box(sx, 1.3, 0, 0.16, 2.6, 0.16, dk); b.box(sx, 0.75, 0, 0.12, 0.12, 2.6, dk); }
    b.box(0, 2.55, 0, 1.7, 0.14, 0.18, dk);
    b.cyl(0, yc, 0, 0.08, 0.08, 1.7, 8, dk, 0, 0, Math.PI / 2);
    const n = 14;
    for (let i = 0; i < n; i++) { const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283;
      b.plank([0.1, yc + Math.cos(a0) * Rw, Math.sin(a0) * Rw], [0.1, yc + Math.cos(a1) * Rw, Math.sin(a1) * Rw], 0.08, 0.1, wc);
      b.plank([-0.1, yc + Math.cos(a0) * Rw, Math.sin(a0) * Rw], [-0.1, yc + Math.cos(a1) * Rw, Math.sin(a1) * Rw], 0.08, 0.1, wc);
      if (i % 2 === 0) b.plank([0, yc, 0], [0, yc + Math.cos(a0) * Rw, Math.sin(a0) * Rw], 0.06, 0.06, wc);
      b.t('brick').cyl(0, yc + Math.cos(a0) * (Rw + 0.12), Math.sin(a0) * (Rw + 0.12), 0.1, 0.07, 0.28, 7, pot, a0, 0, 0).t('wood'); }
    // the lantern gear and the sweep for the animal
    b.box(-2.6, 1.0, 0, 0.18, 2.0, 0.18, dk);
    for (let i = 0; i < 12; i++) { const a0 = (i / 12) * 6.283, a1 = ((i + 1) / 12) * 6.283; b.plank([-2.6 + Math.cos(a0) * 1.0, 1.3, Math.sin(a0) * 1.0], [-2.6 + Math.cos(a1) * 1.0, 1.3, Math.sin(a1) * 1.0], 0.1, 0.12, wc); }
    b.plank([-2.6, 1.3, 0], [-0.8, yc, 0], 0.1, 0.1, dk); // the shaft to the wheel
    b.plank([-2.6, 1.15, 0], [-2.6, 1.05, 4.4], 0.12, 0.12, dk); // the sweep
    // the trough out to +Z and a small tank
    b.plank([0, 2.05, 0.3], [0, 0.95, 2.6], 0.3, 0.12, wc);
    b.t('stone').box(0, 0.4, 3.1, 1.6, 0.8, 1.2, sc); b.ch('water').t('plain').box(0, 0.74, 3.1, 1.3, 0.02, 0.9, MISC.water).ch('main');
    return {};
  };
  L('noria', 'wood');

  // bomba de motor: a diesel engine on a pad, the pump over the well casing, the pipe pouring into a small basin
  P.motor_pump = (b, r) => {
    const conc = col(0xa8a49a, 0.04, r), eng = col(r.pick([0x4a5a48, 0x5a5048, 0x4a5058]), 0.05, r), steel = col(METAL.steel, 0.05, r), rust = col(0x7a5440, 0.06, r);
    b.t('concrete').box(0, 0.08, 0, 2.8, 0.16, 2.0, conc);
    b.t('metal').box(-0.45, 0.55, -0.1, 1.1, 0.75, 0.62, eng);
    b.cyl(-1.08, 0.55, -0.1, 0.32, 0.32, 0.1, 14, col(METAL.dark), 0, 0, Math.PI / 2); // flywheel
    b.beam([-0.2, 0.9, -0.3], [-0.2, 1.9, -0.3], 0.05, 6, rust); b.cyl(-0.2, 1.95, -0.3, 0.08, 0.06, 0.1, 6, rust);
    b.cyl(0.75, 0.45, 0, 0.22, 0.22, 0.6, 10, steel); // pump body
    b.cyl(0.75, 0.12, 0, 0.16, 0.16, 0.3, 10, rust); // well casing
    b.beam([0.75, 0.75, 0], [0.75, 1.25, 0], 0.07, 8, steel); b.beam([0.75, 1.25, 0], [0.75, 1.25, 1.7], 0.07, 8, steel); b.beam([0.75, 1.25, 1.7], [0.75, 0.95, 1.95], 0.07, 8, steel);
    b.t('concrete').box(0.75, 0.35, 2.3, 1.5, 0.7, 1.1, conc); b.ch('water').t('plain').box(0.75, 0.62, 2.3, 1.25, 0.02, 0.85, MISC.water).ch('main');
    b.t('metal').cyl(-1.15, 0.45, -0.75, 0.29, 0.29, 0.9, 12, col(r.pick([0x8a3a2a, 0x3a5a7a, 0x5a6a3a]), 0.06, r)); // fuel drum
    // a tin lean-to over the engine
    b.t('wood'); for (const [x, z] of [[-1.3, -0.9], [0.2, -0.9], [-1.3, 0.6], [0.2, 0.6]]) b.box(x, (z < 0 ? 1.9 : 1.65) / 2, z, 0.08, z < 0 ? 1.9 : 1.65, 0.08, col(WOOD.pole));
    b.t('corrugated').box(-0.55, 1.8, -0.15, 1.9, 0.04, 1.8, col(r.pick(ROOF.corrugated), 0.05, r), 0, -0.14);
    return {};
  };
  L('motor_pump', 'metal');

  // tanque: an open round masonry tank at the head of the ditches, its outlet and board gate to +Z
  P.tanque = (b, r, o) => {
    const R = o.radius || 2.4, H = 1.1, wc = col(r.pick([0xb8ad98, 0xa89c88, 0xc0b4a0]), 0.04, r);
    b.t(r.chance(0.5) ? 'stone' : 'plaster'); lathe(b, [[R + 0.25, 0], [R + 0.25, H], [R, H], [R, 0.12], [0, 0.12]], wc, 0, 0, 0, 26, `tanque${R}`);
    b.t('plaster').cyl(0, H - 0.32, 0, R + 0.005, R + 0.005, 0.05, 26, col(0x6a6e58, 0.05, r)); // the green water line inside
    b.ch('water').t('plain').cyl(0, H - 0.25, 0, R - 0.02, R - 0.02, 0.02, 26, MISC.water).ch('main');
    b.t('stone').box(0, 0.25, R + 0.55, 0.6, 0.5, 0.9, wc);
    b.t('wood').box(0, 0.55, R + 0.3, 0.5, 0.45, 0.05, col(WOOD.weathered, 0.05, r));
    return {};
  };
  L('tanque', 'stone');

  // bordo: an earth dam across a wash, rain water held behind it (−Z), a stone spillway at one end
  P.bordo = (b, r, o) => {
    const Lh = (o.length || 16) / 2, n = 12, ec = col(0x8e7458, 0.04, r), prof = [[-2.4, 0], [-0.8, 1.15], [0.8, 1.15], [2.3, 0]];
    b.t('dirt');
    const sl = []; for (let i = 0; i <= n; i++) { const x = -Lh + (2 * Lh * i) / n, bow = 1.4 * (1 - (x / Lh) ** 2); sl.push(prof.map(([z, y]) => [x, y * (1 - 0.25 * (Math.abs(x) / Lh) ** 3), z + bow])); }
    for (let i = 0; i < n; i++) for (let k = 0; k < prof.length - 1; k++) b.quad(sl[i][k], sl[i + 1][k], sl[i + 1][k + 1], sl[i][k + 1], ec.clone().offsetHSL(0, 0, k === 1 ? 0.03 : 0));
    const ell = (rx, rz, cz, y, seg = 24) => { const pts = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * 6.283; pts.push([Math.cos(a) * rx, y, cz + Math.sin(a) * rz]); } return pts; };
    b.t('dirt').poly(ell(Lh * 0.95, 4.2, -4.0, 0.42).reverse(), mud(r));
    b.ch('water').t('plain').poly(ell(Lh * 0.85, 3.6, -3.9, 0.62).reverse(), MISC.water).ch('main');
    const sc = col(0x9a8f7e, 0.05, r);
    for (let k = 0; k < 7; k++) rock(b, r, Lh - 0.8 + r.range(-0.6, 0.6), 0.4, r.range(-1.5, 1.5), r.range(0.3, 0.5), r.range(0.2, 0.35), r.range(0.3, 0.5), sc, r.next() * 6, 1);
    return {};
  };
  L('bordo', 'dirt');
}

// ---------------------------------------------------------------- streams
// trace a stream downhill from (x, z): follows the fall of the ground, a little wander; stops in an arroyo, at
// the sea, off the map, or where the ground goes flat and it soaks away into the sand
export function traceStream(T, x, z, o = {}) {
  const rng = new RNG(o.seed || `${x.toFixed(1)}:${z.toFixed(1)}`), step = 2, maxL = o.max || 260;
  const pts = [[+x.toFixed(2), +z.toFixed(2)]]; let dx = o.dir ? o.dir[0] : 0, dz = o.dir ? o.dir[1] : 1, flat = 0, Lr = 0;
  const h = (px, pz) => T.height(px, pz);
  for (let s = 0; s < maxL; s += step) {
    const e = 1.5, gx = h(x + e, z) - h(x - e, z), gz = h(x, z + e) - h(x, z - e), g = Math.hypot(gx, gz);
    let nx = dx * 0.65, nz = dz * 0.65;
    if (g > 1e-4) { nx -= (gx / g) * 0.55; nz -= (gz / g) * 0.55; }
    const a = rng.range(-0.25, 0.25); [nx, nz] = [nx * Math.cos(a) - nz * Math.sin(a), nx * Math.sin(a) + nz * Math.cos(a)];
    const l = Math.hypot(nx, nz) || 1; dx = nx / l; dz = nz / l;
    const x2 = x + dx * step, z2 = z + dz * step, drop = h(x, z) - h(x2, z2);
    if (!T.inMap(x2, z2, 4) || Math.abs(x2) > T.W / 2 + 2 || Math.abs(z2) > T.D / 2 + 2) break;
    flat = drop < 0.015 ? flat + step : 0;
    x = x2; z = z2; Lr += step;
    if (Lr >= 5) { pts.push([+x.toFixed(2), +z.toFixed(2)]); Lr = 0; }
    if (T.arroyoAt?.(x, z)?.d < 1.5) break;
    if (T.water && h(x, z) < (T.water.level ?? -999) + 0.2) break;
    if (flat > 24) break;
  }
  if (Lr > 0.5) pts.push([+x.toFixed(2), +z.toFixed(2)]);
  return pts;
}

// make a drawn path run downhill (water flows from its higher end)
export function downhill(T, path) {
  return T.height(...path[0]) + 0.05 < T.height(...path[path.length - 1]) ? path.slice().reverse() : path;
}

const dens = (path, step = 1) => { // densified, lightly smoothed
  const out = [];
  for (let i = 0; i < path.length - 1; i++) { const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
  out.push(path[path.length - 1]);
  for (let it = 0; it < 2; it++) for (let i = 1; i < out.length - 1; i++) out[i] = [(out[i - 1][0] + out[i][0] * 2 + out[i + 1][0]) / 4, (out[i - 1][1] + out[i][1] * 2 + out[i + 1][1]) / 4];
  return out;
};

export function buildStream(f, terrain, seed) {
  const b = new Builder(), r = new RNG(`${seed}:stream:${f.id || JSON.stringify(f.path[0])}`);
  const P = dens(f.path, 1), w0 = (f.width || 0.9) / 2, wet = col(0x7c6a54, 0.03, r), sc = col(0x9a8f7e, 0.05, r);
  const side = (i, k) => { const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l * k, dx / l * k]; };
  let pool = 0;
  const W = P.map((q, i) => { if (pool <= 0 && r.chance(0.025)) pool = r.int(4, 8); const k = pool > 0 ? Math.sin(Math.PI * (1 - pool / 8)) * 0.9 + 1 : 1; pool--; const taper = Math.min(1, (i + 1) / 6, (P.length - i) / 8 + 0.3); return w0 * k * (0.8 + 0.25 * Math.sin(i * 0.37)) * taper; });
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [cx, cz] = P[i + 1], sa = side(i, 1), sb = side(i + 1, 1), ya = terrain.height(ax, az), yc = terrain.height(cx, cz);
    b.ch('water').t('plain').plank([ax, ya + 0.05, az], [cx, yc + 0.05, cz], W[i] * 2, 0.02, MISC.water).ch('main');
    if (r.chance(0.18)) { const u = r.range(-1, 1) * W[i]; rock(b, r, ax + sa[0] * u, ya + 0.05, az + sa[1] * u, r.range(0.12, 0.3), r.range(0.08, 0.18), r.range(0.12, 0.3), sc.clone().offsetHSL(0, 0, r.range(-0.05, 0.04)), r.next() * 6, 1); }
    if (r.chance(0.45)) { const sg = r.chance(0.5) ? 1 : -1, u = sg * (W[i] + r.range(0.3, 1.2)); b.leafCross(ax + sa[0] * u, ya, az + sa[1] * u, r.range(0.6, 1.1), r.range(0.8, 1.7), PLANT.grass, reedTint(r), 2, r.next() * 3); }
  }
  return b.build();
}

// ground and plants that come with springs and streams (derived each build: deleting the stream takes them too)
export function waterPaint(T, item) {
  if (item.type === 'stream' && item.path?.length >= 2) {
    const S = dens(item.path, 2).map(([x, z]) => ({ x, z }));
    T.addPaint({ type: 'path', samples: withS(S), width: (item.width || 0.9) + 5, color: 0x8a8a5a, edge: 2.5, alpha: 0.5, layer: 'scrub', layerK: 0.6 });
    T.addPaint({ type: 'path', samples: withS(dens(item.path, 1).map(([x, z]) => ({ x, z }))), width: (item.width || 0.9) + 0.9, color: 0x5a4a3a, edge: 0.5, alpha: 0.85, layer: 'till', layerK: 0.4 }); // the wet bed
  } else if (item.type === 'spring' && item.at) T.addPaint({ type: 'circle', at: item.at, r: (item.radius || 1.8) + 5, color: 0x7e8a50, edge: 3, alpha: 0.55, layer: 'scrub', layerK: 0.7 });
}
const withS = (S) => { let s = 0; return S.map((q, i) => { if (i) s += Math.hypot(q.x - S[i - 1].x, q.z - S[i - 1].z); const n = S[Math.min(S.length - 1, i + 1)], p = S[Math.max(0, i - 1)], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return { ...q, s, tx: dx / l, tz: dz / l }; }); };

export function waterFlora(world, region = null) {
  const T = world.terrain, fl = world.flora, inR = (x, z) => !region || (x >= region[0] && x <= region[2] && z >= region[1] && z <= region[3]);
  const add = (sp, x, z, s, r) => { if (!inR(x, z) || !T.inMap(x, z, 1) || world.blocked?.(x, z, sp.includes('palm') || sp === 'mesquite' ? 2 : 0.8) || world.vegErased?.(x, z)) return; fl.add(sp, x, T.height(x, z) - 0.05, z, s, r.next() * 6.28, r, 'water'); };
  for (const w of world.walls || []) if (w.type === 'stream' && w.path?.length >= 2) {
    const r = new RNG(`${world.seed}:streamveg:${w.id || w.path[0]}`), P = dens(w.path, 3);
    P.forEach(([x, z], i) => {
      const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const sg of [-1, 1]) {
        if (r.chance(0.55)) { const d = sg * r.range(1.1, 2.6); add(r.weighted({ carrizo: 3, grass: 2.5, encelia: 0.6 }), x + nx * d, z + nz * d, r.range(0.8, 1.2), r); }
        if (r.chance(0.07)) { const d = sg * r.range(3, 6); add(r.weighted({ mesquite: 2, tamarisk: 1.2, fan_palm: 0.8, palo_verde: 0.6 }), x + nx * d, z + nz * d, r.range(0.85, 1.15), r); }
      }
    });
  }
  for (const p of [...(world.spec.props || [])]) if (p.type === 'spring' && p.at) {
    const r = new RNG(`${world.seed}:springveg:${p.id || p.at}`), R = (p.radius || 1.8);
    for (let k = 0; k < 7; k++) { const a = r.range(0, 6.28), d = R + r.range(0.8, 2.5); add(r.weighted({ carrizo: 3, grass: 2 }), p.at[0] + Math.cos(a) * d, p.at[1] + Math.sin(a) * d, r.range(0.85, 1.2), r); }
    for (let k = 0; k < r.int(1, 3); k++) { const a = r.range(0, 6.28), d = R + r.range(3, 6); add(r.weighted({ fan_palm: 3, date_palm: 1.5, mesquite: 1 }), p.at[0] + Math.cos(a) * d, p.at[1] + Math.sin(a) * d, r.range(0.85, 1.15), r); }
  }
}

// ---------------------------------------------------------------- irrigation
const distPath = (x, z, path) => { let m = Infinity; for (let i = 0; i < path.length - 1; i++) m = Math.min(m, segDist(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]).d); return m; };
const polyEdge = (x, z, poly) => { let m = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length]; m = Math.min(m, segDist(x, z, a[0], a[1], c[0], c[1]).d); } return m; };
const touches = (path, poly, r) => { for (const [x, z] of dens(path, 1.5)) if (pointInPoly(x, z, poly) || polyEdge(x, z, poly) <= r) return true; return false; };

// which acequias carry water, which fields are irrigated / dry-farmed, where the sluice gates go
export function irrigationNet(walls, fields, props) {
  const src = (props || []).filter((p) => p.at && SOURCES[p.type] != null).map((p) => p.at);
  const streams = (walls || []).filter((w) => w.type === 'stream' && w.path?.length >= 2), acq = (walls || []).filter((w) => w.type === 'acequia' && w.path?.length >= 2);
  const any = src.length + streams.length + acq.length > 0;
  const wetPaths = streams.map((w) => w.path), wet = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of acq) {
      if (wet.has(a.id)) continue;
      const ends = [a.path[0], a.path[a.path.length - 1]];
      if (ends.some(([x, z]) => src.some((s) => Math.hypot(x - s[0], z - s[1]) < 6) || wetPaths.some((P) => distPath(x, z, P) < 3))) { wet.add(a.id); wetPaths.push(a.path); changed = true; }
    }
  }
  const irr = new Map();
  for (const f of fields || []) {
    if (!f.id || !FARM_FIELDS.includes(f.type) || !f.poly) continue;
    const m = f.water || 'auto';
    if (m === 'irrigated' || m === 'dry') { irr.set(f.id, m === 'irrigated'); continue; }
    if (!any) continue; // no water on the map at all: fields keep their old look
    irr.set(f.id, wetPaths.some((P) => touches(P, f.poly, 2.5)));
  }
  const gates = new Map();
  const irrF = (fields || []).filter((f) => irr.get(f.id));
  for (const a of acq) {
    if (!wet.has(a.id)) continue;
    const g = [];
    for (const [x, z] of dens(a.path, 1)) if (irrF.some((f) => polyEdge(x, z, f.poly) < 2.2) && g.every((q) => Math.hypot(q[0] - x, q[1] - z) > 7)) g.push([+x.toFixed(2), +z.toFixed(2)]);
    gates.set(a.id, g);
  }
  const sig = new Map();
  for (const a of acq) sig.set(a.id, `${wet.has(a.id) ? 1 : 0}|${JSON.stringify(gates.get(a.id) || [])}`);
  for (const [id, v] of irr) sig.set(id, v ? 'i' : 'd');
  return { any, wet, irr, gates, sig, wetPaths };
}

// an acequia must run downhill: the water level drops with the ground (banks hold it up to 0.3 m above), a pump
// at the head lifts it. Returns the path oriented head-first, or null when it would have to run uphill.
export function acequiaCourse(T, path, props) {
  const tryDir = (P) => {
    const head = P[0], lift = Math.max(0, ...(props || []).filter((p) => p.at && SOURCES[p.type] != null && Math.hypot(p.at[0] - head[0], p.at[1] - head[1]) < 6).map((p) => SOURCES[p.type]));
    let lvl = T.height(...head) + lift + 0.3;
    for (const [x, z] of dens(P, 1)) { const h = T.height(x, z); if (h > lvl + 0.02) return false; lvl = Math.min(lvl, h + 0.3); }
    return true;
  };
  const P = downhill(T, path);
  if (tryDir(P)) return P;
  const Q = P.slice().reverse();
  return tryDir(Q) ? Q : null;
}

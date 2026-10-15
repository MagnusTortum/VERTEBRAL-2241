// Pre-war technical buildings (kind 'utility'): the telephone exchange, the radio / microwave relay, the water
// pumping station and the electrical substation. Each sits in its own walled or fenced compound (spec.size is
// the compound; the building is one mass inside it). Everything follows the condition slider: galvanised and
// painted when kept, rust, missing dishes / panels / insulators and sagging fence when worn; a ruin loses the
// top of its tower, a transformer lies on its side. Structure-local frame, front (street, gate) at +z.
import * as THREE from 'three';
import { col } from './builder.js';
import { RNG } from './rng.js';
import { METAL } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { rod, lathe } from './shapes.js';

export const UTILITY_LAYOUTS = { exchange: 'telephone exchange', relay: 'radio / microwave relay', pumping: 'water pumping station', substation: 'electrical substation' };
const DEG = 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// the building inside the compound
export function utilityMasses(spec, lay) {
  const [W, D] = spec.size || [20, 18], u = { util: true, lotW: W, lotD: D };
  if (lay === 'exchange') { const w = clamp(W * 0.58, 8, 14), d = clamp(D * 0.48, 7, 10); return [{ x: -W / 2 + 1.8 + w / 2, z: -D / 2 + 1.8 + d / 2, w, d, main: true, ...u }]; }
  if (lay === 'relay') { const w = 4.2, d = 3.2; return [{ x: W / 2 - 1.6 - w / 2, z: D / 2 - 2.6 - d / 2, w, d, main: true, fh: 2.8, noWin: true, ...u }]; }
  if (lay === 'pumping') { const w = clamp(W * 0.4, 7, 10), d = clamp(D * 0.36, 6, 8); return [{ x: W / 2 - 1.8 - w / 2, z: D / 2 - 4.2 - d / 2, w, d, main: true, ...u }]; }
  if (lay === 'substation') { const w = clamp(W * 0.26, 5.5, 7), d = 4.5; return [{ x: -W / 2 + 1.8 + w / 2, z: D / 2 - 3.6 - d / 2, w, d, main: true, ...u }]; }
  return null;
}
export const utilityFloors = (lay, spec) => (lay === 'exchange' ? Math.max(2, spec.floors || 2) : 1);
// the company colours, faded toward the bare material as the building wears
export function utilityColors(lay, c) {
  const { colors, L, rng } = c, k = clamp((0.8 - (c.condition ?? 0.7)) / 0.6, 0, 0.75);
  const pick = { exchange: [0xe6e0d0, 0x2f5a8a], relay: [0xd8d4c8, 0x8a3a2a], pumping: [0xd8d0bc, 0x2f6a8a], substation: [0xbcb8ae, 0x3a6a4a] }[lay];
  if (!pick) return;
  colors.old = col(pick[0], 0.02, rng).lerp(colors.base?.old || colors.old, k); L.old = k > 0.6 ? L.old : 'plaster';
  colors.trim = col(pick[1], 0.03, rng).lerp(col(0x8a8680), k * 0.8);
}

export function dressUtility(b, c, masses, info) {
  const lay = c.layout; if (!UTILITY_LAYOUTS[lay]) return;
  const m = masses.find((q) => q.main) || masses[0], [W, D] = c.spec.size || [m.lotW || 20, m.lotD || 18];
  const rng = new RNG(`${c.spec.id}:util`), cond = c.condition ?? 0.7, ruin = c.damage > 0, live = c.inhabited && !c.damage;
  const worn = clamp((0.85 - cond) / 0.6, 0, 1); // 0 kept .. 1 rusted out
  const steel = () => col(METAL.steel, 0.03, rng).lerp(col(rng.pick([0x6e4430, 0x7a4a30, 0x5e4a3e])), worn * rng.range(0.6, 1));
  const gone = (p = 1) => rng.chance(worn * 0.45 * p); // a part missing / broken
  const roofY = (c.floors0 || 1) * (m.fh || c.fh);
  const xf = W / 2 - 0.3, zf = D / 2 - 0.3; // fence line
  const ctx = { b, c, info, rng, cond, worn, ruin, live, steel, gone, W, D, m, roofY, xf, zf };
  // ground: the yard is packed / gravelled
  b.t(lay === 'substation' ? 'gravel' : 'concrete').box(0, 0.015, 0, W - 0.8, 0.03, D - 0.8, col(lay === 'substation' ? 0x9a948a : 0xa8a296, 0.03, rng));
  const gateX = { exchange: W / 2 - 4.2, relay: -W / 2 + 3.6, pumping: -W / 2 + 4.2, substation: W / 2 - 4.5 }[lay];
  compoundFence(ctx, lay, gateX);
  ({ exchange, relay, pumping, substation })[lay](ctx, gateX);
}

// ---------------------------------------------------------------- helpers
function sign(ctx, text, x, y, z, ry, w, h, opts = {}) {
  const { c, info } = ctx;
  const p = c.toLocal(x, y, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry));
  info.signs.push({ text, x: p[0], y: p[1], z: p[2], ry: Math.atan2(nx, nz), w, h, style: 'printed', rng: new RNG(`${c.spec.id}:${text}:${x.toFixed(1)}:${z.toFixed(1)}`), opts: { level: true, rust: ctx.worn > 0.5, missing: ctx.worn > 0.7 ? 0.15 : 0, ...opts } });
}
function light(ctx, x, y, z, color = LIGHT_COL.mercury, radius = 9, intensity = 1.0, kind = 'lamp', essential = false) {
  const { c, info } = ctx, p = c.toLocal(x, y, z), r = c.lightR(essential, true);
  info.lights.push({ x: p[0], y: p[1], z: p[2], color, radius, intensity, kind, r, flicker: false });
  return r;
}
function prop(ctx, type, x, z, ry = 0, o = {}) { const { c, info } = ctx, p = c.toLocal(x, 0, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry)); (info.props ||= []).push({ type, x: p[0], z: p[2], rot: Math.atan2(nx, nz) * DEG, ...o }); }

// the compound: a block wall or chain-link round the lot, a gate at the front (info.fences, added by the world)
function compoundFence(ctx, lay, gateX) {
  const { c, info, rng, cond, ruin, xf, zf, W } = ctx;
  const type = c.spec.fence || (lay === 'exchange' ? (rng.chance(0.65) ? 'block' : 'chainlink') : 'chainlink');
  if (type === 'none') return;
  const path = [[-xf, zf], [xf, zf], [xf, -zf], [-xf, -zf]];
  const gw = lay === 'relay' ? 3.2 : 4.4, gs = gateX + xf;
  const state = ruin ? 'open' : c.inhabited && rng.chance(0.4) ? 'ajar' : 'closed';
  const leaf = ruin && rng.chance(0.5) ? null : type === 'chainlink' ? 'chainlink' : 'metal';
  info.fences ||= [];
  info.fences.push({ id: `${c.spec.id}-fence`, type, path, closed: true, height: type === 'chainlink' ? 2.1 : 2.4, condition: clamp(cond + rng.range(-0.08, 0.05), 0.05, 1), barbed: lay === 'pumping' && rng.chance(0.4) ? false : true,
    ...(type !== 'chainlink' ? { paint: c.colors.old.getHex() } : {}), gates: [{ s: gs, width: gw, ...(leaf ? { leaf, state } : {}) }] });
  // the plate by the gate: who it belonged to, and what not to touch
  const txt = { exchange: 'CENTRAL TELEFÓNICA\nPROHIBIDO EL PASO', relay: 'ESTACIÓN REPETIDORA\nPROHIBIDO EL PASO', pumping: 'PLANTA DE BOMBEO\nAGUA POTABLE', substation: 'PELIGRO\nALTO VOLTAJE' }[lay];
  const sx = gateX + (gateX > 0 ? -1 : 1) * (gw / 2 + 1.2);
  sign(ctx, txt, sx, 1.45, zf + 0.06, 0, 1.4, 0.7, lay === 'substation' ? { bg: '#e8c02a', color: '#1e1e1c' } : { bg: '#ecebe4', color: lay === 'pumping' ? '#1e4a8a' : '#b0281e' });
  if (lay === 'substation') for (const [x, z, ry] of [[xf + 0.06, 0, Math.PI / 2], [-xf - 0.06, 0, -Math.PI / 2], [0, -zf - 0.06, Math.PI], [-W / 4, zf + 0.06, 0]]) if (!rng.chance(ctx.worn * 0.5)) sign(ctx, 'PELIGRO\nALTO VOLTAJE', x, 1.4, z, ry, 0.9, 0.55, { bg: '#e8c02a', color: '#1e1e1c' });
}

// a lattice structure: n legs on a circle tapering from r0 at y0 to r1 at y1, panels every `step`, X-braced faces
function lattice(b, cx, cz, y0, y1, r0, r1, n, rot, step, legR, color, opts = {}) {
  const H = y1 - y0, ns = Math.max(1, Math.round(H / step)), P = (k, i) => { const t = i / ns, r = r0 + (r1 - r0) * t, a = rot + (k / n) * Math.PI * 2; return [cx + Math.cos(a) * r, y0 + H * t, cz + Math.sin(a) * r]; };
  b.t('metal');
  for (let i = 0; i < ns; i++) for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    b.beam(P(k, i), P(k, i + 1), legR, 4, color);
    b.beam(P(k, i + 1), P(k2, i + 1), legR * 0.5, 3, color);
    if (opts.skip?.(i, k)) continue;
    b.beam(P(k, i), P(k2, i + 1), legR * 0.38, 3, color); b.beam(P(k2, i), P(k, i + 1), legR * 0.38, 3, color);
  }
  for (let k = 0; k < n; k++) b.beam(P(k, 0), P((k + 1) % n, 0), legR * 0.5, 3, color);
  return P;
}
// a stack of insulator discs from p along +y (or hanging down when h < 0)
function insulator(b, x, y, z, h, porcelain) {
  const n = Math.max(3, Math.round(Math.abs(h) / 0.16)), s = Math.sign(h) || 1, cc = porcelain ? col(0x7a3a24, 0.04) : col(0x8a9a8e, 0.04);
  b.t('plain'); b.cyl(x, y + h / 2, z, 0.035, 0.035, Math.abs(h), 6, cc);
  for (let i = 0; i < n; i++) b.cyl(x, y + s * (i + 0.5) * (Math.abs(h) / n), z, 0.11, 0.11, 0.035, 10, cc);
}
// a microwave drum with its radome, on an arm off a leg, facing yaw
function dish(b, x, y, z, yaw, r, color, radome) {
  b.pushT(x, y, z, yaw);
  b.t('metal').cyl(0, 0, 0, r, r * 0.92, 0.42, 16, color, Math.PI / 2);
  b.t(radome ? 'fabric' : 'metal').cyl(0, 0, 0.22, r * 0.97, r * 0.97, 0.05, 16, radome ? col(0xe0dcd0, 0.03) : col(0x5a5c5e), Math.PI / 2);
  b.t('metal').box(0, 0, -0.45, 0.08, 0.08, 0.6, color);
  b.pop();
}

// ---------------------------------------------------------------- telephone exchange
// A two-storey windowless-ish block with high louvred windows, the company stripe, a concrete door canopy and the
// name over the door; a roof mast with a dish and whips, condenser boxes; cable conduits into a vault; a generator
// house and a diesel tank in the yard.
function exchange(ctx, gateX) {
  const { b, c, rng, m, roofY, live, ruin, steel, gone, W, D, zf } = ctx;
  const x0 = m.x, z0 = m.z, w = m.w, d = m.d, zfr = z0 + d / 2;
  if (!ruin) {
    // canopy + name over the door
    const dx = c.info.frontDoor ? c.info.frontDoor.x : x0;
    b.t('concrete').box(dx, 2.75, zfr + 0.6, 2.4, 0.16, 1.2, col(0xb8b2a6, 0.03, rng));
    sign(ctx, 'CENTRAL TELEFÓNICA', x0, roofY - 0.9, zfr + 0.04, 0, Math.min(w - 1.5, 7), 0.75, { bg: '#ecebe4', color: '#1e4a8a', rust: false });
    // conduits down the side wall into a cable vault
    const sx = x0 + w / 2 + 0.12;
    b.t('metal'); for (let k = 0; k < 3; k++) b.box(sx, roofY / 2, z0 - d / 4 + k * 0.16, 0.1, roofY, 0.1, steel());
    b.t('concrete').box(sx + 0.9, 0.06, z0 - d / 4 + 0.16, 1.2, 0.12, 0.9, col(0x9a948a, 0.03, rng)); b.t('metal').box(sx + 0.9, 0.13, z0 - d / 4 + 0.16, 0.7, 0.02, 0.5, col(0x4a4846));
    // roof: condenser boxes, a mast with a dish and whips
    const y = roofY + 0.02;
    for (let k = 0; k < rng.int(2, 3); k++) { if (gone(0.6)) continue; const bx = x0 - w / 2 + 1.4 + k * 1.6, bz = z0 + d / 2 - 1.3; b.t('metal').box(bx, y + 0.45, bz, 1.1, 0.9, 0.8, steel()); b.t('plain').cyl(bx, y + 0.91, bz, 0.32, 0.32, 0.03, 12, col(0x2a2a28)); }
    const mx = x0 + w / 2 - 1.4, mz = z0 - d / 2 + 1.4, H = rng.range(6, 9), mc = steel();
    lattice(b, mx, mz, y, y + H, 0.55, 0.35, 3, 0.4, 1.6, 0.04, mc);
    if (!gone()) dish(b, mx + 0.5, y + H * 0.75, mz, Math.PI / 2 + rng.range(-0.5, 0.5), 0.55, mc, true);
    b.t('metal'); for (let k = 0; k < 2; k++) b.cyl(mx + (k - 0.5) * 0.3, y + H + 1.2, mz, 0.015, 0.02, 2.4, 4, col(0x8a8e8c));
    const r = light(ctx, mx, y + H + 2.4, mz, [1.0, 0.15, 0.1], 4, 0.8, 'lamp', false);
    b.ch('lamp').w(r).t('plain').box(mx, y + H + 2.45, mz, 0.12, 0.12, 0.12, 0xff3020).w(-1).ch('main');
    // a floodlight over the yard
    const lr = light(ctx, x0 + w / 2 - 0.3, roofY - 0.4, zfr + 0.5, LIGHT_COL.mercury, 10, 1.0);
    b.t('metal').box(x0 + w / 2 - 0.3, roofY - 0.3, zfr + 0.25, 0.3, 0.2, 0.4, col(0x5a5c5e));
    b.ch('lamp').w(lr).t('plain').box(x0 + w / 2 - 0.3, roofY - 0.42, zfr + 0.4, 0.24, 0.02, 0.24, 0xf0f4ff).w(-1).ch('main');
  }
  // generator house + diesel tank on saddles along the side, clear of the gate lane
  const gx = W / 2 - 2.2, gz = -D / 2 + 3.0;
  b.t('metal').box(gx, 1.0, gz, 1.8, 2.0, 3.2, steel()); b.t('plain').box(gx - 0.91, 1.1, gz, 0.02, 1.2, 2.2, col(0x3a3a38));
  b.t('metal').cyl(gx + 0.4, 2.6, gz - 1.0, 0.08, 0.08, 1.2, 6, col(0x3a3836));
  const tz = gz + 3.4; b.t('concrete'); for (const k of [-0.8, 0.8]) b.box(gx, 0.25, tz + k, 1.3, 0.5, 0.3, col(0x9a948a));
  b.t('metal').cyl(gx, 1.05, tz, 0.62, 0.62, 2.6, 14, ctx.cond > 0.6 ? col(0xc8c4b8, 0.03, rng) : steel(), Math.PI / 2);
  if (live && rng.chance(0.6)) prop(ctx, 'barrel', gx - 1.6, tz + 0.6);
  if (ctx.worn > 0.4 && rng.chance(0.6)) prop(ctx, 'car_wreck', gateX - 1.0, zf - 4.5, rng.range(-0.4, 0.4));
}

// ---------------------------------------------------------------- radio / microwave relay
function relay(ctx) {
  const { b, c, rng, m, ruin, steel, gone, W, D, worn } = ctx;
  const tx = -W * 0.08, tz = -D * 0.12, H0 = c.spec.towerH || rng.range(24, 32), mc = steel();
  // a ruin lost its top: the stump ends in a bent section, the rest lies across the yard
  const H = ruin ? H0 * rng.range(0.35, 0.6) : H0, rot = rng.range(0, 2);
  b.t('concrete'); for (let k = 0; k < 3; k++) { const a = rot + (k / 3) * Math.PI * 2; b.box(tx + Math.cos(a) * 1.9, 0.25, tz + Math.sin(a) * 1.9, 0.8, 0.5, 0.8, col(0xa8a296, 0.03, rng)); }
  const P = lattice(b, tx, tz, 0.5, H, 1.9, ruin ? 1.9 - (1.9 - 0.6) * (H / H0) : 0.6, 3, rot, 2.6, 0.07, mc);
  // a cable ladder up one leg; a rest platform near the top
  const [lx, , lz] = P(0, 0), [ux, , uz] = P(0, Math.round((H - 0.5) / 2.6));
  b.t('metal'); for (const s of [-0.18, 0.18]) b.beam([lx + s, 0.5, lz], [ux + s, H, uz], 0.015, 3, mc);
  if (!ruin) {
    const py = H * 0.86, pr = 0.6 + (1.9 - 0.6) * (1 - py / H) + 0.5;
    b.t('metal'); for (let k = 0; k < 3; k++) { const a = rot + (k / 3) * Math.PI * 2, a2 = rot + ((k + 1) / 3) * Math.PI * 2; b.beam([tx + Math.cos(a) * pr, py, tz + Math.sin(a) * pr], [tx + Math.cos(a2) * pr, py, tz + Math.sin(a2) * pr], 0.03, 3, mc); b.beam([tx + Math.cos(a) * pr, py + 1.0, tz + Math.sin(a) * pr], [tx + Math.cos(a2) * pr, py + 1.0, tz + Math.sin(a2) * pr], 0.02, 3, mc); }
    b.t('metal').cyl(tx, py - 0.02, tz, pr, pr, 0.05, 3, mc.clone().offsetHSL(0, 0, -0.08), 0, rot + Math.PI / 6);
    // dishes at two or three heights, looking out along the old links; whips and a lightning rod on top
    const nd = rng.int(2, 4);
    for (let k = 0; k < nd; k++) {
      if (gone(1.2)) continue;
      const y = H * rng.range(0.55, 0.92), yaw = rng.range(0, 6.28), r = rng.range(0.55, 0.95), rr = 0.6 + (1.9 - 0.6) * (1 - y / H) + 0.55;
      dish(b, tx + Math.sin(yaw) * rr, y, tz + Math.cos(yaw) * rr, yaw, r, mc, rng.chance(0.75));
    }
    b.t('metal'); for (let k = 0; k < 3; k++) { if (gone()) continue; const a = rot + (k / 3) * Math.PI * 2; b.cyl(tx + Math.cos(a) * 0.5, H + 2.0, tz + Math.sin(a) * 0.5, 0.018, 0.03, 4.0, 4, col(0x8a8e8c)); }
    b.cyl(tx, H + 1.0, tz, 0.02, 0.03, 2.0, 4, col(0x6a6c6c));
    const r = light(ctx, tx, H + 2.1, tz, [1.0, 0.15, 0.1], 6, 1.0, 'lamp', false);
    b.ch('lamp').w(r).t('plain').box(tx, H + 2.15, tz, 0.16, 0.16, 0.16, 0xff3020).w(-1).ch('main');
    // the ice bridge: a covered cable tray from the shelter to the tower
    const sx = m.x - m.w / 2, sz = m.z;
    b.t('metal').box((sx + tx) / 2, 2.4, (sz + tz) / 2, 0.4, 0.06, Math.hypot(sx - tx, sz - tz), mc, Math.atan2(sx - tx, sz - tz));
    for (const t of [0.25, 0.75]) { const x = tx + (sx - tx) * t, z = tz + (sz - tz) * t; b.box(x, 1.2, z, 0.08, 2.4, 0.08, mc); }
  } else { // the fallen part: a lattice lying across the yard
    const yaw = rng.range(0, 6.28), L = Math.min(H0 - H, Math.hypot(W, D) * 0.45);
    b.pushT(tx + Math.sin(yaw) * 1.5, 0, tz + Math.cos(yaw) * 1.5, yaw);
    b.push(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.08));
    lattice(b, 0, 0, 0, L, 1.0, 0.6, 3, 0.3, 2.6, 0.06, mc);
    b.pop().pop();
    if (rng.chance(0.7)) dish(b, tx + Math.sin(yaw) * (L * 0.6), 0.4, tz + Math.cos(yaw) * (L * 0.6) + 1.2, yaw + 1.2, 0.7, mc, false);
  }
  // shelter kit: an AC unit on the side wall, a propane / diesel tank, the old generator
  b.t('metal').box(m.x + m.w / 2 + 0.3, 1.4, m.z, 0.5, 0.8, 0.9, ctx.steel());
  const gx = m.x - 0.4, gz = m.z - m.d / 2 - 1.6;
  b.t('metal').cyl(gx, 0.75, gz, 0.55, 0.55, 2.2, 14, worn > 0.5 ? ctx.steel() : col(0xd8d4cc, 0.03, rng), 0, 0, Math.PI / 2);
  b.t('concrete'); for (const k of [-0.7, 0.7]) b.box(gx + k, 0.15, gz, 0.3, 0.3, 1.0, col(0x9a948a));
}

// ---------------------------------------------------------------- water pumping station
function pumping(ctx, gateX) {
  const { b, c, rng, m, ruin, live, steel, gone, W, D, zf, worn } = ctx;
  // the storage tank at the back corner: concrete or riveted steel
  const R = clamp(Math.min(W, D) * 0.2, 2.6, 4.2), TH = rng.range(4, 5.5), tx = -W / 2 + 1.6 + R, tz = -D / 2 + 1.6 + R, concrete = rng.chance(0.45);
  if (concrete) {
    const cc = col(0xb8b2a6, 0.03, rng).lerp(col(0x8a8478), worn * 0.6);
    b.t('concrete').cyl(tx, TH / 2, tz, R, R + 0.1, TH, 20, cc); lathe(b, [[R + 0.1, 0], [R + 0.1, 0.12], [R * 0.6, 0.55], [0.4, 0.7], [0, 0.72]], cc.clone().offsetHSL(0, 0, 0.03), tx, TH, tz, 20);
    if (worn > 0.3) b.t('grime').cyl(tx, TH * 0.35, tz, R + 0.012, R + 0.112, TH * 0.7, 20, col(0x6a6458));
  } else {
    const sc = col(rng.pick([0xc8c4b8, 0x8a9a8a, 0xa8b4b8]), 0.03, rng).lerp(col(METAL.rust), worn * 0.8);
    b.t(worn > 0.5 ? 'rust' : 'metal').cyl(tx, TH / 2, tz, R, R, TH, 20, sc);
    for (let k = 1; k < 4; k++) b.t('metal').cyl(tx, (TH * k) / 4, tz, R + 0.03, R + 0.03, 0.06, 20, sc.clone().offsetHSL(0, 0, -0.06));
    b.t('metal').cone(tx, TH + 0.35, tz, R + 0.1, 0.7, 20, sc.clone().offsetHSL(0, 0, -0.04));
    if (!ruin) sign(ctx, 'AGUA POTABLE', tx, TH * 0.62, tz + R + 0.04, 0, 2.4, 0.6, { bg: '#1e4a8a', color: '#f2f0ea' });
  }
  // a ladder up the side, a rail round the roof hatch
  const la = 0.6, lx = tx + Math.sin(la) * (R + 0.18), lz = tz + Math.cos(la) * (R + 0.18);
  b.t('metal'); for (const s of [-0.2, 0.2]) b.box(lx + Math.cos(la) * s, TH / 2 + 0.4, lz - Math.sin(la) * s, 0.04, TH + 0.8, 0.04, col(METAL.dark));
  for (let y = 0.4; y < TH + 0.6; y += 0.32) b.box(lx, y, lz, 0.4, 0.025, 0.025, col(METAL.dark), la);
  // the main from the tank to the pump house: flanged pipe at knee height, a gate valve with its wheel, a valve pit
  const px0 = tx + R, pz = tz + R * 0.3, px1 = m.x - m.w / 2 - 0.1, pc = steel();
  if (px1 > px0 + 1) {
    rod(b, [px0, 0.7, pz], [px1, 0.7, pz], 0.16, pc, 10);
    for (let x = px0 + 0.6; x < px1 - 0.3; x += 1.8) b.t('metal').cyl(x, 0.7, pz, 0.24, 0.24, 0.06, 12, pc.clone().offsetHSL(0, 0, -0.05), 0, 0, Math.PI / 2);
    const vx = (px0 + px1) / 2;
    b.t('metal').box(vx, 0.7, pz, 0.4, 0.5, 0.4, pc).cyl(vx, 1.15, pz, 0.04, 0.04, 0.5, 6, col(METAL.dark));
    if (!gone()) b.t('metal').cyl(vx, 1.42, pz, 0.28, 0.28, 0.04, 14, col(METAL.paint_red).lerp(col(METAL.rust), worn));
    for (let x = px0 + 1.0; x < px1 - 0.5; x += 3.0) b.t('concrete').box(x, 0.27, pz, 0.4, 0.54, 0.5, col(0x9a948a));
    b.t('concrete').box(vx, 0.04, pz + 1.2, 1.4, 0.1, 1.0, col(0x9a948a)); b.t('metal').box(vx, 0.1, pz + 1.2, 0.9, 0.02, 0.6, col(0x4a4846));
  }
  // the surge vessel and the chlorine rack by the pump house
  const vx = m.x + m.w / 2 + 1.0, vz = m.z - m.d / 2 + 0.8;
  b.t('metal').cyl(vx, 1.6, vz, 0.55, 0.55, 2.4, 14, steel()); lathe(b, [[0.55, 0], [0.45, 0.25], [0.15, 0.4], [0, 0.42]], steel(), vx, 2.8, vz, 12);
  b.t('concrete').box(vx, 0.2, vz, 1.4, 0.4, 1.4, col(0x9a948a));
  const cx = m.x + m.w / 2 + 1.0, cz = m.z + 0.6;
  if (!gone(0.8)) { b.t('metal').box(cx, 0.6, cz, 0.12, 1.2, 1.6, col(METAL.dark)); for (let k = 0; k < 2; k++) b.cyl(cx + 0.3, 0.75, cz - 0.4 + k * 0.8, 0.22, 0.22, 1.5, 10, col(0xc8b830, 0.04, rng).lerp(col(METAL.rust), worn * 0.7)); b.t('corrugated').box(cx + 0.2, 1.9, cz, 1.2, 0.05, 2.0, steel(), 0, 0, -0.15); }
  // the pole transformer feeding it, by the fence
  const tpx = W / 2 - 1.2, tpz = -D / 2 + 2.0;
  b.t('bark'); for (const k of [-0.9, 0.9]) b.cyl(tpx, 4.0, tpz + k, 0.13, 0.16, 8.0, 7, col(0x5a4a3a, 0.05, rng));
  b.t('metal').box(tpx, 3.6, tpz, 0.3, 0.12, 2.4, col(METAL.dark)).box(tpx, 7.2, tpz, 0.15, 0.15, 2.6, col(METAL.dark));
  if (!(ruin && rng.chance(0.5))) { b.t('metal').cyl(tpx, 4.2, tpz, 0.45, 0.45, 1.1, 12, col(0x8a9094, 0.03, rng).lerp(col(METAL.rust), worn * 0.6)); for (let k = -1; k <= 1; k++) insulator(b, tpx, 4.75, tpz + k * 0.25, 0.3, false); }
  for (let k = -1; k <= 1; k++) insulator(b, tpx, 7.28, tpz + k * 1.0, 0.3, true);
  // in use: the town draws water at the gate
  if (live) {
    const sx = gateX + 3.2, sz = zf + 1.3;
    b.t('metal').box(sx, 0.55, sz - 0.3, 0.08, 1.1, 0.08, col(METAL.dark)).box(sx, 1.05, sz - 0.1, 0.06, 0.06, 0.4, col(METAL.dark));
    prop(ctx, 'trough', sx + 0.1, sz + 0.5, Math.PI / 2, { length: 2.4 }); prop(ctx, 'water_jugs', sx - 1.2, sz + 0.3);
    if (rng.chance(0.6)) prop(ctx, 'barrel', sx + 1.6, sz + 0.2);
  }
  const r = light(ctx, m.x - m.w / 2 + 0.4, 3.0, m.z + m.d / 2 + 0.3, LIGHT_COL.sodium, 8, 0.9);
  b.ch('lamp').w(r).t('plain').box(m.x - m.w / 2 + 0.4, 3.0, m.z + m.d / 2 + 0.2, 0.2, 0.14, 0.2, 0xffd8a0).w(-1).ch('main');
}

// ---------------------------------------------------------------- electrical substation
function substation(ctx) {
  const { b, c, rng, m, ruin, steel, gone, W, D, worn } = ctx;
  const mc = steel(), por = rng.chance(0.6);
  // incoming gantry across the back: two square lattice columns and a lattice beam, strings hanging from it
  const gz = -D / 2 + 2.4, gx0 = -W / 2 + 4, gx1 = W / 2 - 3, GH = 8.5;
  for (const x of [gx0, gx1]) { b.t('concrete').box(x, 0.2, gz, 1.2, 0.4, 1.2, col(0xa8a296)); lattice(b, x, gz, 0.4, GH, 0.5, 0.35, 4, Math.PI / 4, 1.4, 0.05, mc); }
  b.t('metal'); for (const [dy, dz] of [[0, -0.3], [0, 0.3], [0.6, 0]]) b.beam([gx0, GH - 0.3 + dy, gz + dz], [gx1, GH - 0.3 + dy, gz + dz], 0.04, 4, mc);
  for (let x = gx0; x < gx1; x += 1.2) b.beam([x, GH - 0.3, gz - 0.3], [x + 1.2, GH + 0.3, gz], 0.02, 3, mc);
  const phases = [-1.4, 0, 1.4].map((k) => (gx0 + gx1) / 2 + k);
  for (const x of phases) if (!gone(0.6)) insulator(b, x, GH - 0.35, gz, -1.1, por);
  // the bay: per phase a disconnector on a post insulator, a breaker (three columns on a frame), busbar pipes
  const bz = gz + 3.0, tz = bz + 3.6;
  for (const x of phases) {
    b.t('metal').box(x, 1.25, bz, 0.25, 2.5, 0.25, mc);
    if (!gone(0.7)) insulator(b, x, 2.5, bz, 1.2, por);
    b.t('metal').box(x, 0.9, bz + 1.6, 0.6, 1.8, 0.4, mc); b.box(x, 2.2, bz + 1.6, 0.5, 0.8, 0.5, col(0x5a6a5a, 0.03, rng).lerp(col(METAL.rust), worn * 0.6));
    if (!gone(0.7)) insulator(b, x, 2.6, bz + 1.6, 1.0, por);
    // the conductors: gantry string → disconnector → breaker → transformer bushing, sagging a little
    b.t('plain'); const wc = col(0x3a3a38);
    if (!(ruin && rng.chance(0.5))) { b.beam([x, GH - 1.5, gz], [x, 3.7, bz], 0.012, 3, wc); b.beam([x, 3.7, bz], [x, 3.6, bz + 1.6], 0.012, 3, wc); b.beam([x, 3.6, bz + 1.6], [x * 0.55 + (phases[1]) * 0.45, 3.9, tz], 0.012, 3, wc); }
  }
  // the transformers: tank on a plinth, radiator fins, a conservator, HV / LV bushings; oil stains when worn
  const nT = W > 22 ? 2 : 1;
  for (let i = 0; i < nT; i++) {
    const x = nT === 1 ? phases[1] : phases[1] + (i - 0.5) * 5.0, z = tz, down = ruin && i === nT - 1 && rng.chance(0.6);
    const tc = col(rng.pick([0x7a8a7a, 0x6a7a84, 0x8a8a84]), 0.03, rng).lerp(col(METAL.rust), worn * 0.7);
    b.t('concrete').box(x, 0.15, z, 3.4, 0.3, 2.8, col(0xa8a296, 0.03, rng));
    if (worn > 0.3) b.t('grime').box(x + 0.4, 0.31, z + 0.3, 2.2, 0.01, 1.6, col(0x2a2622));
    b.pushT(x, 0.3, z, 0);
    if (down) b.push(new THREE.Matrix4().makeTranslation(0.9, 0.7, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + 0.08)).multiply(new THREE.Matrix4().makeTranslation(0, -0.7, 0)));
    b.t('metal').box(0, 1.1, 0, 1.9, 2.2, 1.4, tc);
    for (const sd of [-1, 1]) for (let k = 0; k < 6; k++) b.box(sd * 1.15, 1.1, -0.55 + k * 0.22, 0.4, 1.8, 0.04, tc.clone().offsetHSL(0, 0, -0.05));
    b.cyl(-0.5, 2.6, 0.3, 0.28, 0.28, 1.4, 12, tc, 0, 0, Math.PI / 2); b.box(-0.5, 2.35, 0.3, 0.12, 0.3, 0.12, tc);
    for (let k = -1; k <= 1; k++) { if (!gone(0.5)) insulator(b, k * 0.5, 2.2, -0.35, 0.9, por); insulator(b, k * 0.35, 2.2, 0.45, 0.4, por); }
    if (down) b.pop();
    b.pop();
  }
  // lightning masts at two corners, a floodlight pole by the control house
  b.t('metal'); for (const [x, z] of [[-W / 2 + 1.4, -D / 2 + 1.4], [W / 2 - 1.4, tz + 1.5]]) b.cyl(x, 6.5, z, 0.06, 0.14, 13, 6, mc);
  const fx = m.x + m.w / 2 + 1.0, fz = m.z - m.d / 2 - 0.6;
  b.t('metal').cyl(fx, 3.5, fz, 0.06, 0.08, 7, 6, mc).box(fx, 7.0, fz + 0.2, 0.4, 0.3, 0.3, col(0x5a5c5e));
  const r = light(ctx, fx, 6.9, fz + 0.5, LIGHT_COL.mercury, 12, 1.1);
  b.ch('lamp').w(r).t('plain').box(fx, 6.86, fz + 0.36, 0.34, 0.02, 0.24, 0xf0f4ff).w(-1).ch('main');
  if (!ruin) sign(ctx, 'SUBESTACIÓN ELÉCTRICA', m.x, (m.fh || c.fh) - 0.55, m.z + m.d / 2 + 0.04, 0, Math.min(m.w - 0.6, 4.6), 0.5, { bg: '#ecebe4', color: '#1e6a3a' });
  void lathe;
}

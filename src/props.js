// Prop library. Each builder draws in local coords (origin = ground point, +Z = front).
// Returns optional { parts: [Object3D], anim: [{obj, axis, speed}], signs: [...] } for things that move or carry text.
import { addLifeProps } from './props3.js';
import { addValleyProps } from './props4.js';
import { addTradeProps, addPelicano, addSignProps } from './props5.js';
import { addWealthProps } from './props6.js';
import { addTownProps } from './props7.js';
import { addLifeProps2 } from './props8.js';
import { addVehicleProps } from './props9.js';
import { addMysticProps } from './props10.js';
import { addFarmProps } from './props11.js';
import { addGapProps } from './props12.js';
import { addWaterProps } from './water.js';
import { addWastelandProps } from './props13.js';
import { addUpscaleProps } from './props14.js';
import { plantRow } from './foliage.js';
import * as THREE from 'three';
import { LAYER } from './layers.js';
import { Builder, col } from './builder.js';
import { deg } from './rng.js';
import { WOOD, METAL, MAT, ROOF, GLASS, MISC } from './palette.js';
import { makeSign, SIGN_COLORS } from './signs.js';
import { LIGHT_COL } from './presets.js';
import { addTempProps } from './props-temp.js';
import { addBetterProps } from './props2.js';
import { modelParts, MODELS } from './models.js';

const P = {};

P.well = (b, r, o) => {
  const stone = col(o.color || 0xa89c88, 0.04, r);
  const R = o.radius || 1.0;
  const segs = 9;
  for (let i = 0; i < segs; i++) { // ring of stones, open on top
    const a = (i / segs) * Math.PI * 2, L = 2 * Math.PI * R / segs + 0.12;
    b.box(Math.cos(a) * (R - 0.15), 0.45, Math.sin(a) * (R - 0.15), 0.32, 0.9, L, stone.clone().offsetHSL(0, 0, (r.next() - 0.5) * 0.05), -a);
    b.box(Math.cos(a) * (R - 0.15), 0.94, Math.sin(a) * (R - 0.15), 0.4, 0.08, L, stone.clone().offsetHSL(0, 0, -0.06), -a);
  }
  b.cyl(0, 0.3, 0, R - 0.25, R - 0.25, 0.04, segs, 0x1e2a2e);
  b.ch('water'); b.cyl(0, 0.45, 0, R - 0.28, R - 0.28, 0.02, segs, MISC.water); b.ch('main');
  const w = col(WOOD.weathered, 0.05, r);
  b.t('metal');
  if (o.pump) { // casing repaired with a pre-war hand pump
    b.box(0.3, 1.2, 0, 0.18, 0.6, 0.18, col(METAL.dark));
    b.box(0.3, 1.55, 0.15, 0.12, 0.12, 0.45, col(METAL.dark));
    b.plank([0.3, 1.55, -0.1], [0.3, 1.9, -0.7], 0.05, 0.05, col(METAL.steel));
  }
  b.t('wood');
  b.box(-R - 0.05, 1.2, 0, 0.18, 2.4, 0.18, w);
  b.box(R + 0.05, 1.2, 0, 0.18, 2.4, 0.18, w);
  b.cyl(0, 2.0, 0, 0.12, 0.12, 2 * R + 0.4, 6, w, 0, 0, Math.PI / 2);
  b.box(R + 0.3, 2.0, 0.25, 0.06, 0.06, 0.5, col(METAL.rust));
  if (o.roof !== false) {
    const rc = col(o.roofColor || r.pick(ROOF.thatch), 0.05, r);
    b.t('thatch');
    b.plank([0, 2.95, 0], [0, 2.4, 1.3], 2 * R + 0.8, 0.08, rc);
    b.plank([0, 2.95, 0], [0, 2.4, -1.3], 2 * R + 0.8, 0.08, rc);
  }
  b.t('metal');
  b.beam([0, 2.0, 0], [0, 1.2, 0], 0.01, 3, col(0x3a3020));
  b.cyl(0, 1.1, 0, 0.18, 0.14, 0.3, 7, col(METAL.steel));
  if (o.repair) { // fresh casing patch from the flood repair
    b.t('concrete').box(R - 0.05, 0.45, 0, 0.12, 0.9, 0.9, col(0xc9c2b2, 0.03, r));
  }
};

P.hand_pump = (b, r) => {
  b.box(0, 0.15, 0, 0.6, 0.3, 0.6, col(0x9c968a));
  b.box(0, 0.75, 0, 0.16, 0.9, 0.16, col(METAL.dark));
  b.box(0, 1.1, 0.18, 0.1, 0.1, 0.35, col(METAL.dark));
  b.plank([0, 1.2, -0.05], [0, 1.45, -0.6], 0.04, 0.04, col(METAL.steel));
};

P.trough = (b, r, o) => {
  const L = o.length || 3;
  const wc = col(o.stone ? 0xa59a88 : WOOD.weathered, 0.05, r);
  b.box(0, 0.08, 0, L, 0.16, 0.8, wc);
  b.box(0, 0.35, 0.36, L, 0.6, 0.08, wc); b.box(0, 0.35, -0.36, L, 0.6, 0.08, wc);
  b.box(L / 2 - 0.04, 0.35, 0, 0.08, 0.6, 0.8, wc); b.box(-L / 2 + 0.04, 0.35, 0, 0.08, 0.6, 0.8, wc);
  b.ch('water'); b.box(0, 0.45, 0, L - 0.16, 0.02, 0.64, MISC.water); b.ch('main');
};

P.cistern = (b, r, o) => {
  const R = o.radius || 2.2, h = o.height || 1.8;
  b.cyl(0, h / 2 - 0.3, 0, R, R + 0.1, h, 12, col(o.color || 0xb3ada0, 0.04, r));
  b.cyl(0, h - 0.25, 0, R + 0.05, R + 0.05, 0.12, 12, col(0x9a948a, 0.03, r));
  b.box(R * 0.4, h - 0.1, 0, 0.7, 0.12, 0.7, col(METAL.rust));
};

// smooth ring (torus, or part of one) lying flat at height y
const RINGS = new Map();
function ring(b, x, y, z, R, r, color, arc = Math.PI * 2, a0 = 0, seg = 32) {
  const key = `${R.toFixed(3)}_${r.toFixed(3)}_${arc.toFixed(3)}_${seg}`;
  let g = RINGS.get(key); if (!g) { g = new THREE.TorusGeometry(R, r, 6, seg, arc).toNonIndexed(); RINGS.set(key, g); }
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, -a0, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  return b.sm().addGeom(g, m, color).sm(false);
}

// elevated tank: riveted steel plates (or wooden staves), round legs with girts and tension rods,
// a walkway with railing round the base, ladders, a downpipe with a valve, cone roof with a finial
P.water_tower = (b, r, o) => {
  const H = o.height || 7, R = o.radius || 1.6, TH = o.tankH || 2.6, wood = !!o.wood;
  const paint = col(o.color || r.pick([0x9aa0a0, 0x8f9a94, 0xa8a49a, 0x7f8a8c]), 0.04, r);
  const steel = col(METAL.steel, 0.04, r).offsetHSL(0, 0, -0.06), dark = col(METAL.dark), rust = col(METAL.rust, 0.06, r);
  const rusty = o.rust ?? r.range(0.25, 0.8); // how far gone the paint is
  const legC = wood ? col(WOOD.weathered, 0.05, r) : steel.clone().lerp(rust, rusty * 0.6);
  const lr = R * 0.82, foot = 1.22, nL = 4;
  const legs = Array.from({ length: nL }, (_, i) => { const a = Math.PI / 4 + (i * Math.PI * 2) / nL; return [Math.cos(a), Math.sin(a)]; });
  const at = (k, y) => { const t = y / H, s2 = lr * (foot + (1 - foot) * t); return [legs[k][0] * s2, y, legs[k][1] * s2]; };
  // footings
  b.t('concrete');
  for (let k = 0; k < nL; k++) { const [x, , z] = at(k, 0); b.box(x, 0.12, z, 0.7, 0.4, 0.7, col(0xa8a398, 0.04, r)); }
  // legs, girts, tension rods
  b.t(wood ? 'bark' : 'metal').sm();
  for (let k = 0; k < nL; k++) b.beam(at(k, 0.3), at(k, H), wood ? 0.14 : 0.11, 12, legC);
  b.sm(false);
  const levels = [H * 0.36, H * 0.7];
  for (let k = 0; k < nL; k++) {
    const q = (k + 1) % nL;
    for (const y of levels) b.beam(at(k, y), at(q, y), 0.05, 6, legC);
    for (const [y0, y1] of [[0.6, levels[0]], [levels[0], levels[1]], [levels[1], H - 0.2]]) {
      b.beam(at(k, y0), at(q, y1), 0.018, 4, dark); b.beam(at(q, y0), at(k, y1), 0.018, 4, dark);
    }
    if (!wood) for (const y of levels) { const [x, , z] = at(k, y); b.box(x, y, z, 0.18, 0.18, 0.18, dark); } // gusset knots
  }
  // ring girder + walkway with railing
  const yB = H, wR = R + 0.6;
  ring(b, 0, yB - 0.12, 0, lr, 0.09, legC);
  b.t(wood ? 'wood' : 'metal');
  const nW = 28;
  for (let i = 0; i < nW; i++) { // walkway planks / grating, radial
    const a = (i / nW) * Math.PI * 2, m = (R + wR) / 2;
    b.box(Math.cos(a) * m, yB + 0.02, Math.sin(a) * m, wR - R + 0.2, 0.05, (2 * Math.PI * wR) / nW + 0.02, wood ? col(WOOD.weathered, 0.05, r) : steel, -a);
  }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.beam([Math.cos(a) * lr * 0.9, yB - 0.2, Math.sin(a) * lr * 0.9], [Math.cos(a) * wR, yB - 0.02, Math.sin(a) * wR], 0.03, 4, dark); } // brackets
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.beam([Math.cos(a) * wR, yB, Math.sin(a) * wR], [Math.cos(a) * wR, yB + 1.0, Math.sin(a) * wR], 0.022, 5, dark); }
  ring(b, 0, yB + 1.0, 0, wR, 0.03, dark); ring(b, 0, yB + 0.55, 0, wR, 0.02, dark);
  // tank
  const y0 = yB + 0.06, y1 = y0 + TH;
  b.t(wood ? 'wood' : 'metal').sm();
  b.cyl(0, (y0 + y1) / 2, 0, R, R, TH, 28, wood ? col(WOOD.fresh, 0.05, r) : paint);
  b.sm(false);
  b.cyl(0, y0 - 0.05, 0, R + 0.02, R + 0.02, 0.1, 28, dark);
  if (wood) { // iron hoops round the staves
    for (let k = 0; k < 5; k++) ring(b, 0, y0 + 0.2 + (k * (TH - 0.4)) / 4, 0, R + 0.015, 0.025, dark);
  } else {
    // plate seams with rivet rows, a few vertical seams
    const rows = 3;
    for (let k = 1; k < rows; k++) {
      const y = y0 + (k * TH) / rows;
      ring(b, 0, y, 0, R + 0.008, 0.016, paint.clone().offsetHSL(0, 0, -0.06));
      for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; b.box(Math.cos(a) * (R + 0.02), y + 0.05, Math.sin(a) * (R + 0.02), 0.035, 0.035, 0.035, dark, -a); }
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.2; b.box(Math.cos(a) * (R + 0.006), (y0 + y1) / 2, Math.sin(a) * (R + 0.006), 0.04, TH, 0.02, paint.clone().offsetHSL(0, 0, -0.05), -a + Math.PI / 2); }
    // rust: streaks running down from the seams, heavier the worse the paint
    b.t('metal');
    const nS = Math.round(6 + rusty * 18);
    for (let i = 0; i < nS; i++) {
      const a = r.range(0, Math.PI * 2), top = y0 + (r.int(1, rows) * TH) / rows - 0.02, len = r.range(0.3, 1.4) * (0.5 + rusty);
      const w = r.range(0.04, 0.16), yb = Math.max(y0 + 0.05, top - len);
      b.box(Math.cos(a) * (R + 0.012), (top + yb) / 2, Math.sin(a) * (R + 0.012), w, top - yb, 0.012, paint.clone().lerp(rust, r.range(0.35, 0.6)).offsetHSL(0, -0.1, r.range(-0.1, -0.03)), -a + Math.PI / 2);
    }
    b.t('metal');
  }
  // roof: cone with a lip, hatch, finial
  b.t(wood ? 'shingle' : 'metal').sm();
  b.cone(0, y1 + 0.45, 0, R + 0.14, 0.9, 28, wood ? col(ROOF.shingle, 0.05, r) : paint.clone().offsetHSL(0, 0, -0.04));
  b.sm(false);
  ring(b, 0, y1 + 0.01, 0, R + 0.1, 0.035, dark);
  b.box(R * 0.45, y1 + 0.3, 0, 0.5, 0.08, 0.5, dark, 0, 0, -0.5);
  b.t('metal').sm();
  b.cyl(0, y1 + 0.95, 0, 0.05, 0.08, 0.2, 10, dark);
  b.cone(0, y1 + 1.15, 0, 0.04, 0.3, 8, dark);
  b.sm(false);
  // ladders: ground to walkway on one leg face, walkway to roof up the tank
  const la = Math.PI / 2, lx = Math.cos(la), lz = Math.sin(la);
  const ladder = (p0, p1, w = 0.42) => {
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], L2 = Math.hypot(dx, dz) || 1, ux = -dz / L2, uz = dx / L2;
    const ox = lz ? 1 : -lz, oz = 0; // rails side by side across the ladder
    for (const sg of [-1, 1]) b.beam([p0[0] + sg * ox * w / 2, p0[1], p0[2] + sg * oz * w / 2], [p1[0] + sg * ox * w / 2, p1[1], p1[2] + sg * oz * w / 2], 0.02, 4, dark);
    const n = Math.floor((p1[1] - p0[1]) / 0.3);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1), x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t, z = p0[2] + (p1[2] - p0[2]) * t; b.beam([x - ox * w / 2, y, z - oz * w / 2], [x + ox * w / 2, y, z + oz * w / 2], 0.014, 4, dark); }
    return [ux, uz];
  };
  ladder([lx * (wR + 0.15), 0.05, lz * (wR + 0.15) + 0.3], [lx * (wR + 0.05), yB + 0.9, lz * (wR + 0.05)]);
  ladder([lx * (R + 0.15), yB + 0.05, lz * (R + 0.15)], [lx * (R + 0.15), y1 + 0.3, lz * (R + 0.15)], 0.36);
  // downpipe + valve + spout
  b.t('metal').sm();
  b.beam([0, y0, 0], [0, 0.9, 0], 0.11, 12, legC);
  b.beam([0, 0.9, 0], [0, 0.9, 0.9], 0.08, 12, legC);
  b.beam([0, 0.9, 0.9], [0, 0.6, 1.15], 0.07, 10, legC);
  b.cyl(0, 0.9, 0, 0.16, 0.16, 0.14, 12, dark);
  b.sm(false);
  ring(b, 0, 1.25, 0, 0.17, 0.018, col(METAL.paint_red, 0.05, r));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.beam([0, 1.25, 0], [Math.cos(a) * 0.17, 1.25, Math.sin(a) * 0.17], 0.012, 4, dark); }
  b.beam([0, 0.98, 0], [0, 1.25, 0], 0.02, 4, dark);
  if (o.text) return { signs: [{ text: o.text, x: 0, y: (y0 + y1) / 2, z: R + 0.03, ry: 0, w: R * 1.5, h: 0.7, style: 'prewar' }] };
};

P.windmill = (b, r, o) => {
  const H = o.height || 9;
  const sc = col(METAL.steel, 0.04, r).offsetHSL(0, 0, -0.05);
  const base = 1.3, top = 0.35;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  legs.forEach(([x, z]) => b.beam([x * base, 0, z * base], [x * top, H, z * top], 0.05, 4, sc));
  for (let k = 1; k < 5; k++) {
    const y = (H * k) / 5, s = base + (top - base) * (k / 5);
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = legs[i], [x2, z2] = legs[(i + 1) % 4];
      b.beam([x1 * s, y, z1 * s], [x2 * s, y, z2 * s], 0.025, 3, sc);
    }
  }
  b.box(0, H + 0.1, 0, 0.9, 0.15, 0.9, sc);
  b.box(0, H + 0.45, 0, 0.35, 0.5, 0.9, col(METAL.dark));
  b.plank([0, H + 0.5, -0.4], [0, H + 0.6, -2.4], 0.04, 0.04, sc);
  b.box(0, H + 0.7, -2.4, 0.04, 0.9, 1.3, col(o.vane || METAL.paint_cream, 0.05, r));
  // wheel as separate animated part
  const wb = new Builder();
  wb.t('metal');
  const n = 16, Rw = o.wheel || 1.6;
  const blade = col(o.blade || METAL.steel, 0.03, r);
  for (let i = 0; i < n; i++) {
    if (o.broken && r.chance(0.3)) continue;
    const a = (i / n) * Math.PI * 2;
    wb.box(Math.cos(a) * Rw * 0.62, Math.sin(a) * Rw * 0.62, 0, 0.24, Rw * 0.75, 0.03, blade, 0, 0.35, a - Math.PI / 2);
  }
  wb.cyl(0, 0, 0, 0.18, 0.18, 0.3, 8, col(METAL.dark), Math.PI / 2, 0, 0);
  const g = wb.build();
  g.main.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(g.main.attributes.position.count * 3).fill(1), 3));
  const wheel = new THREE.Mesh(g.main, null);
  wheel.position.set(0, H + 0.5, 0.6);
  wheel.userData.isPart = true;
  return { parts: [wheel], anim: [{ obj: wheel, axis: 'z', speed: o.broken ? 0 : (o.speed ?? 1.4) }] };
};

P.vending_machine = (b, r, o) => {
  const body = col(o.color || 0xb8473a, 0.04, r);
  b.box(0, 0.95, 0, 1.0, 1.9, 0.8, body);
  b.box(0, 1.75, 0.41, 0.9, 0.22, 0.02, col(0xe0d8c0));
  b.ch('lamp').w(o._r ?? 9).t('plain'); b.box(-0.12, 1.1, 0.41, 0.6, 0.9, 0.02, 0x9fd8c8); b.w(-1).ch('main').t('metal');
  b.box(0.36, 1.1, 0.42, 0.14, 0.5, 0.03, col(0x3a3a3a));
  b.box(0, 0.3, 0.42, 0.7, 0.2, 0.03, col(0x2a2a2a));
  return { lights: [{ at: [0, 1.1, 0.9], color: LIGHT_COL.cool, radius: 3.5, intensity: 0.7, kind: 'screen' }] };
};

P.solar_panel = (b, r, o) => {
  const n = o.count || 1;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.3;
    b.box(x, 1.25, 0, 1.15, 0.05, 1.8, col(o.broken && i === 0 ? 0x4a5560 : 0x2c3a4a), 0, deg(-28), 0);
    b.box(x, 0.65, 0.55, 0.07, 1.3, 0.07, col(METAL.steel));
    b.box(x, 0.85, -0.55, 0.07, 1.7, 0.07, col(METAL.steel));
  }
  b.box(0, 0.25, 0.9, 0.5, 0.5, 0.35, col(0x8a8a80)); // battery box
};

const CAR_PAINT = [0x7a9a96, 0xb8a888, 0x8a4a3a, 0x6a7a8a, 0xa89a6a, 0x5f6a5a, 0xc8b8a0];
P.car_wreck = (b, r, o) => {
  const paint = col(o.color || r.pick(CAR_PAINT), 0.05, r);
  const rust = col(r.pick([METAL.rust, METAL.rust2]), 0.06, r);
  const body = o.burned ? col(0x4a4440, 0.05, r) : paint;
  const wheels = o.wheels ?? r.chance(0.4);
  const lift = wheels ? 0.35 : 0.15;
  // lower body with rounded front/back
  b.box(0, lift + 0.4, 0, 1.9, 0.6, 4.4, body);
  b.box(0, lift + 0.35, 2.3, 1.75, 0.45, 0.4, body);
  b.box(0, lift + 0.35, -2.3, 1.75, 0.45, 0.4, body);
  b.box(0, lift + 0.12, 2.5, 1.9, 0.12, 0.12, col(METAL.chrome));
  // cabin
  b.box(0, lift + 0.95, -0.3, 1.6, 0.55, 2.0, o.burned ? body : paint.clone().offsetHSL(0, 0, 0.04));
  b.ch('glass').t('plain'); b.box(0, lift + 0.98, -0.3, 1.62, 0.36, 1.6, GLASS.broken); b.ch('main').t('metal');
  b.box(0, lift + 1.24, -0.3, 1.5, 0.06, 1.7, body);
  // fins
  for (const s of [-1, 1]) b.box(s * 0.85, lift + 0.78, -1.9, 0.08, 0.3, 0.9, body);
  // rust patches
  for (let i = 0; i < 4; i++) b.box(r.range(-0.7, 0.7), lift + 0.72, r.range(-1.8, 1.8), r.range(0.3, 0.7), 0.02, r.range(0.3, 0.8), rust);
  if (wheels) for (const [x, z] of [[-0.9, 1.4], [0.9, 1.4], [-0.9, -1.4], [0.9, -1.4]]) b.cyl(x, 0.35, z, 0.35, 0.35, 0.25, 8, col(0x2a2826), 0, 0, Math.PI / 2);
  else for (const [x, z] of [[-0.8, 1.4], [0.8, -1.4]]) b.box(x, 0.12, z, 0.3, 0.24, 0.3, col(0x5a5450));
  if (o.hoodOpen) b.box(0, lift + 1.1, 1.9, 1.6, 0.05, 0.9, body, 0, deg(-50), 0);
};

P.truck_chassis = (b, r, o) => {
  const frame = col(METAL.dark, 0.04, r), rust = col(METAL.rust, 0.06, r);
  for (const s of [-1, 1]) b.box(s * 0.5, 0.75, 0, 0.14, 0.22, 6.2, frame);
  for (const z of [-2.6, -1, 0.8, 2.6]) b.box(0, 0.75, z, 1.1, 0.12, 0.12, frame);
  for (const [x, z] of [[-0.95, 2.1], [0.95, 2.1], [-0.95, -1.6], [0.95, -1.6], [-0.95, -2.5], [0.95, -2.5]]) {
    if (o.missingWheels && z < 0 && x > 0) { b.box(x * 0.8, 0.3, z, 0.3, 0.6, 0.3, col(0x6a5a4a)); continue; }
    b.cyl(x, 0.48, z, 0.48, 0.48, 0.32, 9, col(0x2a2826), 0, 0, Math.PI / 2);
    b.cyl(x * 1.01, 0.48, z, 0.2, 0.2, 0.34, 6, col(METAL.steel), 0, 0, Math.PI / 2);
  }
  // engine + cab skeleton
  b.box(0, 1.15, 2.2, 0.8, 0.7, 1.1, col(0x5a5c5a));
  if (o.cab !== false) {
    const cab = col(o.color || 0x6a7a6a, 0.05, r);
    b.box(0, 1.6, 0.9, 1.9, 1.2, 1.6, cab);
    b.ch('glass').t('plain'); b.box(0, 1.9, 1.71, 1.6, 0.5, 0.02, GLASS.broken); b.ch('main').t('metal');
    b.box(0, 2.22, 0.9, 1.95, 0.06, 1.65, cab.clone().offsetHSL(0, 0, -0.05));
    b.box(0, 1.25, 2.85, 1.7, 0.6, 0.2, rust);
  }
};

P.engine_block = (b, r) => {
  b.box(0, 0.45, 0, 0.8, 0.7, 1.0, col(0x5c5a56, 0.05, r));
  b.box(0, 0.9, 0, 0.6, 0.2, 0.9, col(0x4c4a48));
  for (let i = 0; i < 4; i++) b.cyl(-0.42, 0.65, -0.35 + i * 0.23, 0.07, 0.07, 0.1, 6, col(METAL.rust), 0, 0, Math.PI / 2);
  b.t('wood').box(0, 0.05, 0, 1.4, 0.1, 1.4, col(WOOD.weathered)); // pallet
};

P.workbench = (b, r, o) => {
  const w = col(WOOD.fresh, 0.06, r);
  b.box(0, 0.9, 0, o.length || 2.2, 0.08, 0.8, w);
  for (const [x, z] of [[-1, -0.3], [1, -0.3], [-1, 0.3], [1, 0.3]]) b.box(x * ((o.length || 2.2) / 2 - 0.1), 0.45, z, 0.08, 0.9, 0.08, w);
  b.box(0, 0.35, 0, (o.length || 2.2) - 0.2, 0.04, 0.7, w);
  b.box(-0.5, 1.0, 0, 0.3, 0.12, 0.2, col(METAL.steel)); b.box(0.4, 0.98, 0.1, 0.5, 0.08, 0.3, col(METAL.rust));
};

P.barrel = (b, r, o) => {
  const n = o.count || 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = n > 1 ? 0.45 : 0;
    const c = col(o.color || r.pick([METAL.rust, 0x4a6a7a, 0x8a3a2a, 0x5f6a4a, 0xb8a050]), 0.06, r);
    if (o.tipped && i === 0) b.cyl(Math.cos(a) * rr, 0.3, Math.sin(a) * rr, 0.3, 0.3, 0.88, 9, c, Math.PI / 2, a, 0);
    else b.cyl(Math.cos(a) * rr, 0.44, Math.sin(a) * rr, 0.3, 0.3, 0.88, 9, c);
  }
};

P.crates = (b, r, o) => {
  const n = o.count || 3;
  for (let i = 0; i < n; i++) {
    const s = r.range(0.5, 0.8);
    const stack = i >= 2 && r.chance(0.5);
    b.box(r.range(-0.7, 0.7), stack ? 0.6 + s / 2 : s / 2, r.range(-0.6, 0.6), s, s, s, col(r.pick([WOOD.fresh, WOOD.weathered, 0x8a7a5a]), 0.06, r), r.range(0, 1));
  }
};

P.tires = (b, r, o) => {
  const n = o.count || 4;
  for (let i = 0; i < n; i++) b.cyl(r.range(-0.3, 0.3), 0.12 + i * 0.25, r.range(-0.3, 0.3), 0.42, 0.42, 0.24, 9, col(0x2a2826, 0.05, r));
};

P.scrap_pile = (b, r, o) => {
  const s = o.size || 2;
  for (let i = 0; i < 14 * s / 2; i++) {
    const c = col(r.pick([METAL.rust, METAL.rust2, METAL.steel, WOOD.weathered, 0x6a6a64]), 0.08, r);
    b.box(r.range(-s, s) * 0.6, r.range(0.1, s * 0.4), r.range(-s, s) * 0.6, r.range(0.3, 1.4), r.range(0.05, 0.5), r.range(0.3, 1.2), c, r.range(0, 3), r.range(-0.5, 0.5), r.range(-0.5, 0.5));
  }
};

P.rubble = (b, r, o) => {
  const s = o.size || 2;
  const base = o.color || 0xaaa498;
  for (let i = 0; i < 12 * s / 2; i++) {
    const k = r.range(0.25, 0.9);
    b.blob(r.range(-s, s) * 0.6, k * 0.25, r.range(-s, s) * 0.6, k * r.range(0.8, 1.5), k * 0.55, k, col(base, 0.08, r), 'dodec', r.range(0, 6));
  }
};

P.rocks = (b, r, o) => {
  const n = o.count || 4, s = o.size || 1;
  for (let i = 0; i < n; i++) {
    const k = r.range(0.3, 1) * s;
    b.blob(r.range(-1.5, 1.5) * s, k * 0.25, r.range(-1.5, 1.5) * s, k * r.range(0.9, 1.6), k * r.range(0.5, 0.9), k, col(0x9a8b78, 0.07, r), 'dodec', r.range(0, 6));
  }
};

P.bench = (b, r) => {
  const w = col(WOOD.weathered, 0.05, r);
  b.box(0, 0.45, 0, 1.8, 0.07, 0.4, w);
  b.box(-0.75, 0.22, 0, 0.1, 0.45, 0.35, w); b.box(0.75, 0.22, 0, 0.1, 0.45, 0.35, w);
};

P.table = (b, r, o) => {
  const w = col(WOOD.fresh, 0.06, r);
  b.box(0, 0.75, 0, 1.6, 0.06, 0.9, w);
  for (const [x, z] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) b.box(x, 0.37, z, 0.07, 0.74, 0.07, w);
  const n = o.chairs ?? 4;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, x = (Math.floor(i / 2) - 0.5) * 0.8;
    b.box(x, 0.45, side * 0.75, 0.42, 0.05, 0.42, w);
    b.box(x, 0.7, side * 0.95, 0.42, 0.5, 0.05, w);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(x + dx, 0.22, side * 0.75 + dz, 0.04, 0.45, 0.04, w);
  }
  if (o.umbrella) {
    b.beam([0, 0.75, 0], [0, 2.3, 0], 0.03, 4, col(WOOD.dark));
    b.cone(0, 2.35, 0, 1.4, 0.5, 8, col(r.pick(ROOF.thatch), 0.05, r));
  }
};

P.laundry_line = (b, r, o) => {
  const L = o.length || 5;
  const p = col(WOOD.pole, 0.05, r);
  // posts: true = both ends · 'far' = only the -x end (the +x end is hooked to a wall) · false = hooked at both
  const posts = o.posts ?? true, hang = o.hang ?? 1;
  if (posts === true || posts === 'far') b.beam([-L / 2, 0, 0], [-L / 2, 2.0, 0], 0.05, 4, p);
  if (posts === true) b.beam([L / 2, 0, 0], [L / 2, 2.0, 0], 0.05, 4, p);
  for (const [sx, has] of [[-1, posts === false], [1, posts !== true]]) if (has) b.t('metal').box(sx * L / 2, 1.9, 0, 0.06, 0.06, 0.06, col(0x3a3836)).t('plain');
  b.beam([-L / 2, 1.9, 0], [L / 2, 1.88, 0], 0.01, 3, col(0x3a3020));
  for (let x = -L / 2 + 0.6; x < L / 2 - 0.4; x += r.range(0.5, 0.9)) {
    if (!r.chance(hang)) continue;
    const h = r.range(0.4, 0.9), w = r.range(0.35, 0.7);
    b.box(x, 1.87 - h / 2, 0, w, h, 0.02, col(r.pick(MISC.cloth), 0.08, r));
  }
};

P.firepit = (b, r, o) => {
  b.t('stone');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.blob(Math.cos(a) * 0.65, 0.12, Math.sin(a) * 0.65, 0.22, 0.16, 0.2, col(0x8e8474, 0.08, r), 'dodec', a); }
  b.t('dirt').cyl(0, 0.02, 0, 0.5, 0.5, 0.04, 8, col(0x3a3632));
  b.t('wood').plank([-0.4, 0.15, -0.2], [0.3, 0.1, 0.2], 0.1, 0.1, col(WOOD.dark)); b.plank([0.35, 0.15, -0.3], [-0.2, 0.1, 0.3], 0.1, 0.1, col(WOOD.dark));
  b.ch('lamp').w(o._r ?? 9).t('plain'); b.cone(0, 0.25, 0, 0.22, 0.4, 5, 0xff9a40); b.w(-1).ch('main');
  return { lights: [{ at: [0, 0.6, 0], color: LIGHT_COL.fire, radius: 7, intensity: 1.5, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, 0.25, 0] }, { type: 'smoke', p: [0, 0.6, 0], always: true }] };
};

P.cart = (b, r, o) => {
  const w = col(WOOD.weathered, 0.06, r);
  b.box(0, 0.9, 0, 1.5, 0.12, 2.2, w);
  for (const s of [-1, 1]) b.box(s * 0.72, 1.15, 0, 0.06, 0.45, 2.2, w);
  b.box(0, 1.15, -1.08, 1.5, 0.45, 0.06, w);
  for (const s of [-1, 1]) {
    b.cyl(s * 0.85, 0.65, 0.1, 0.65, 0.65, 0.1, 10, col(WOOD.dark), 0, 0, Math.PI / 2);
    b.plank([s * 0.4, 0.95, 1.1], [s * 0.35, 0.5, 2.9], 0.08, 0.08, w);
  }
  if (o.load) for (let i = 0; i < 4; i++) b.box(r.range(-0.4, 0.4), 1.2, r.range(-0.7, 0.7), 0.5, 0.4, 0.5, col(r.pick([0xb8a070, WOOD.fresh, 0x9a8a6a]), 0.06, r));
};

P.brahmin = (b, r, o) => {
  const hide = col(o.color || r.pick([0x8a6a4a, 0x7a5a3e, 0xa08060, 0x6e5a48, 0xb09878]), 0.05, r);
  const dark = hide.clone().offsetHSL(0, 0, -0.12);
  b.box(0, 1.15, 0, 0.95, 0.85, 2.0, hide);
  b.box(0, 1.25, -0.2, 1.0, 0.8, 0.9, hide.clone().offsetHSL(0, 0, -0.03));
  for (const [x, z] of [[-0.32, 0.75], [0.32, 0.75], [-0.32, -0.75], [0.32, -0.75]]) b.box(x, 0.38, z, 0.18, 0.78, 0.18, dark);
  // two heads — splayed necks
  for (const s of [-1, 1]) {
    b.plank([s * 0.2, 1.4, 0.9], [s * 0.55, 1.55, 1.4], 0.32, 0.36, hide);
    b.box(s * 0.62, 1.48, 1.62, 0.34, 0.38, 0.55, hide, s * 0.35);
    b.box(s * 0.66, 1.4, 1.88, 0.26, 0.24, 0.12, col(0x4a3a30), s * 0.35);
    b.cone(s * 0.85, 1.75, 1.5, 0.05, 0.25, 4, col(0xd8ccb0), 0, 0, -s * 1.0);
  }
  b.plank([0, 1.4, -1.0], [0, 0.8, -1.25], 0.06, 0.06, dark);
};

P.sign = (b, r, o) => {
  const w = o.width || Math.max(1.6, String(o.text || '').length * 0.28);
  const h = o.height || 0.8;
  const H = o.post ?? 1.6;
  const pc = o.style === 'hermandad' ? col(0x2a2a28) : col(WOOD.pole, 0.05, r);
  if (o.posts !== false) {
    b.box(-w / 2 + 0.15, (H + h) / 2, -0.06, 0.12, H + h, 0.12, pc);
    b.box(w / 2 - 0.15, (H + h) / 2, -0.06, 0.12, H + h, 0.12, pc);
  }
  return { signs: [{ text: o.text || '', x: 0, y: H + h / 2, z: 0.02, ry: 0, w, h, style: o.style || 'painted' }] };
};

P.billboard = (b, r, o) => {
  const w = o.width || 7, h = o.height || 3, H = o.post ?? 4;
  const sc = col(METAL.rust, 0.05, r);
  for (const x of [-w / 3, w / 3]) b.box(x, (H + h) / 2, -0.2, 0.25, H + h, 0.25, sc);
  b.box(0, H + 0.3, -0.15, w, 0.06, 0.4, sc);
  if (o.text) return { signs: [{ text: o.text, x: 0, y: H + h / 2 + 0.3, z: 0.0, ry: 0, w, h, style: 'prewar' }] };
  // faded blank panels
  const n = 3;
  for (let i = 0; i < n; i++) {
    if (o.torn && r.chance(0.35)) continue;
    b.box(-w / 2 + (w * (i + 0.5)) / n, H + h / 2 + 0.3, -0.05, w / n - 0.04, h, 0.05, col(r.pick([0xd8d0b8, 0xb8c8c8, 0xc8a890, 0x98b0a0]), 0.05, r));
  }
};

P.utility_pole = (b, r, o) => {
  b.t('bark');
  const H = o.height || 8;
  const lean = o.lean ?? r.range(-0.08, 0.08);
  const pc = col(WOOD.pole, 0.06, r).offsetHSL(0, 0, -0.06);
  b.beam([0, 0, 0], [Math.sin(lean) * H, H, 0], 0.13, 6, pc);
  b.box(Math.sin(lean) * H * 0.95, H * 0.95, 0, 1.8, 0.12, 0.12, pc, 0, 0, lean);
  if (!o.bare) for (const x of [-0.7, 0, 0.7]) b.cyl(Math.sin(lean) * H * 0.95 + x, H * 0.95 + 0.12, 0, 0.05, 0.05, 0.15, 5, col(0xc8d0c8));
};

P.street_lamp = (b, r, o) => {
  const H = o.height || 7, sc = col(METAL.steel, 0.05, r).offsetHSL(0, 0, -0.1);
  b.beam([0, 0, 0], [0, H, 0], 0.08, 6, sc);
  b.plank([0, H, 0], [0, H + 0.2, 1.4], 0.08, 0.08, sc);
  b.box(0, H + 0.1, 1.5, 0.3, 0.12, 0.6, col(METAL.dark));
  b.ch('lamp').w(o._r ?? 9).t('plain'); b.box(0, H + 0.02, 1.5, 0.22, 0.04, 0.45, 0xffd8a0); b.w(-1).ch('main');
  return { lights: [{ at: [0, H - 0.1, 1.5], color: LIGHT_COL.sodium, radius: 13, intensity: 1.8, kind: 'street' }] };
};

P.gas_pump = (b, r, o) => {
  const c = col(o.color || r.pick([0xb8473a, 0xd8ccb0, 0x5f8f86]), 0.05, r);
  if (o.stripped) { b.box(0, 0.15, 0, 0.9, 0.3, 0.6, col(0x9c968a)); b.box(0.2, 0.45, 0, 0.12, 0.3, 0.12, col(METAL.rust)); return; }
  b.box(0, 0.15, 0, 0.9, 0.3, 0.6, col(0x9c968a));
  b.box(0, 1.05, 0, 0.7, 1.5, 0.45, c);
  b.box(0, 1.95, 0, 0.55, 0.35, 0.4, col(0xe0d8c0));
  b.box(0, 1.25, 0.24, 0.5, 0.4, 0.02, col(0x2a3034));
};

P.shrine = (b, r, o) => { // roadside descanso / niche shrine
  const wc = col(o.color || 0xe2d6c0, 0.05, r);
  b.box(0, 0.4, 0, 0.9, 0.8, 0.7, wc);
  b.box(0, 1.05, 0, 0.75, 0.5, 0.55, wc);
  b.tri([-0.45, 1.3, 0.3], [0.45, 1.3, 0.3], [0, 1.65, 0.3], wc); b.tri([-0.45, 1.3, -0.28], [0.45, 1.3, -0.28], [0, 1.65, -0.28], wc);
  b.plank([0, 1.65, 0.32], [-0.5, 1.28, 0.32], 0.62, 0.05, col(0xa8553a)); b.plank([0, 1.65, 0.32], [0.5, 1.28, 0.32], 0.62, 0.05, col(0xa8553a));
  b.box(0, 1.05, 0.27, 0.4, 0.35, 0.02, col(0x3a3230));
  b.box(0, 1.9, 0, 0.06, 0.5, 0.06, col(WOOD.dark)); b.box(0, 2.0, 0, 0.3, 0.06, 0.06, col(WOOD.dark));
  plantRow(b, r, -0.35, 0.45, 0.35, 0.45, 0.8, 0.3, { flowers: 2, marigold: 1.5, geranium: 1 }, 0.25);
};

P.cross = (b, r, o) => {
  const c = col(o.color || WOOD.weathered, 0.06, r);
  b.box(0, 0.6, 0, 0.08, 1.2, 0.08, c); b.box(0, 0.9, 0, 0.5, 0.07, 0.07, c);
  if (o.grave) b.box(0, 0.1, -1.0, 0.8, 0.2, 1.8, col(0x9c8a70, 0.05, r));
};

P.km_marker = (b, r, o) => {
  b.box(0, 0.45, 0, 0.35, 0.9, 0.12, col(0xd8d4c8, 0.04, r));
  b.box(0, 0.75, 0.065, 0.3, 0.18, 0.01, col(0x2a5a7a));
  if (o.text) return { signs: [{ text: o.text, x: 0, y: 0.45, z: 0.07, ry: 0, w: 0.3, h: 0.28, style: 'prewar' }] };
};

P.generator = (b, r) => {
  b.box(0, 0.35, 0, 1.4, 0.7, 0.8, col(0x6a7a5a, 0.05, r));
  b.cyl(0.45, 0.85, 0, 0.18, 0.18, 0.35, 7, col(METAL.dark));
  b.box(-0.3, 0.75, 0, 0.6, 0.12, 0.5, col(METAL.rust));
};

P.radio_mast = (b, r, o) => {
  const H = o.height || 14, sc = col(0xb8473a, 0.05, r), wc = col(0xd8d0c0, 0.05, r);
  const s = 0.35;
  for (const [x, z] of [[-s, -s], [s, -s], [0, s]]) b.beam([x, 0, z], [x * 0.5, H, z * 0.5], 0.05, 4, sc);
  for (let y = 1; y < H; y += 1.6) b.cyl(0, y, 0, s * (1 - y / H * 0.5) + 0.05, s * (1 - y / H * 0.5) + 0.05, 0.05, 3, (y | 0) % 2 ? sc : wc);
  for (const a of [0, 2.1, 4.2]) b.beam([0, H * 0.7, 0], [Math.cos(a) * H * 0.55, 0, Math.sin(a) * H * 0.55], 0.012, 3, col(METAL.dark));
};

P.haystack = (b, r) => { b.blob(0, 0.7, 0, 1.4, 1.0, 1.1, col(0xc8ac68, 0.05, r), 'dodec', r.range(0, 3)); };
P.woodpile = (b, r) => {
  for (let i = 0; i < 12; i++) b.cyl(r.range(-0.6, 0.6), 0.12 + Math.floor(i / 4) * 0.2, r.range(-0.1, 0.1), 0.09, 0.09, 1.0, 5, col(r.pick([WOOD.fresh, WOOD.dark, 0x9a7a58]), 0.06, r), Math.PI / 2, 0, 0);
};
P.tarp_tent = (b, r, o) => {
  const c = col(o.color || r.pick([0x8a9a6a, 0x9a8a6a, 0x6a7a8a, 0xb8a888]), 0.05, r);
  b.poly([[-1.2, 0, 1.2], [1.2, 0, 1.2], [1.2, 1.4, 0], [-1.2, 1.4, 0]], c);
  b.poly([[1.2, 0, -1.2], [-1.2, 0, -1.2], [-1.2, 1.4, 0], [1.2, 1.4, 0]], c.clone().offsetHSL(0, 0, -0.05));
  b.tri([-1.2, 0, -1.2], [-1.2, 0, 1.2], [-1.2, 1.4, 0], c.clone().offsetHSL(0, 0, -0.08));
};
P.bones = (b, r) => {
  b.blob(0, 0.15, 0, 0.25, 0.2, 0.3, col(0xe0d8c4), 'ico');
  for (let i = 0; i < 5; i++) b.plank([r.range(-0.8, 0.8), 0.05, r.range(-0.8, 0.8)], [r.range(-0.8, 0.8), 0.05, r.range(-0.8, 0.8)], 0.06, 0.06, col(0xd8d0bc));
};
P.ramada = (b, r, o) => { // shade structure, no walls
  const w = o.width || 4, d = o.depth || 3, H = o.height || 2.6;
  const p = col(WOOD.pole, 0.06, r);
  const nx = Math.max(1, Math.ceil((w - 0.3) / 4.2)); // long market-row shades get posts every ~4 m
  for (let i = 0; i <= nx; i++) for (const z of [-1, 1]) b.cyl(-(w / 2 - 0.15) + (i / nx) * (w - 0.3), H / 2, z * (d / 2 - 0.15), 0.09, 0.11, H, 6, p);
  b.box(0, H, -d / 2 + 0.15, w, 0.15, 0.15, p); b.box(0, H, d / 2 - 0.15, w, 0.15, 0.15, p);
  if (o.roof === 'tarp') { // a run of tarps and cloths over poles
    const n = Math.max(1, Math.round(w / 3)); b.t('fabric');
    for (let i = 0; i < n; i++) b.box(-w / 2 + (i + 0.5) * (w / n), H + 0.1 + (i % 2) * 0.04, 0, w / n + 0.12, 0.03, d + 0.4, col(r.pick([0x8a7a5a, 0x9a8c6a, 0x6a6a58, 0x7a6248, 0xa89878]), 0.06, r));
    return;
  }
  const rc = col(o.roof === 'corrugated' ? r.pick(ROOF.corrugated) : r.pick(ROOF.thatch), 0.05, r);
  if (o.roof === 'corrugated') b.t(r.chance(0.4) ? 'rust' : 'corrugated');
  b.box(0, H + 0.15, 0, w + 0.5, 0.15, d + 0.5, rc);
};
P.corral_gate = (b, r) => {
  const w = col(WOOD.weathered, 0.06, r);
  b.box(-1.6, 0.8, 0, 0.18, 1.6, 0.18, w); b.box(1.6, 0.8, 0, 0.18, 1.6, 0.18, w);
  for (const y of [0.4, 0.8, 1.2]) b.box(-0.4, y, 0.6, 2.4, 0.1, 0.06, w, 0.5);
};

P.lantern = (b, r, o) => { // lantern on a post (gates, yards, docks)
  const H = o.height || 2.4;
  b.t('wood').box(0, H / 2, 0, 0.12, H, 0.12, col(WOOD.pole, 0.05, r));
  b.box(0, H - 0.05, 0.25, 0.06, 0.06, 0.55, col(WOOD.dark));
  b.t('metal').box(0, H - 0.2, 0.48, 0.03, 0.25, 0.03, col(METAL.dark));
  b.ch('lamp').w(o._r ?? 9).t('plain'); b.box(0, H - 0.42, 0.48, 0.18, 0.26, 0.18, o.electric ? 0xfff0d0 : 0xffc070); b.w(-1).ch('main');
  return { lights: [{ at: [0, H - 0.45, 0.6], color: o.electric ? LIGHT_COL.incandescent : LIGHT_COL.oil, radius: o.radius || 7, intensity: 1.2, kind: 'lamp', flicker: !o.electric }] };
};
P.torch = (b, r, o) => {
  const H = o.height || 1.8;
  b.t('wood').cyl(0, H / 2, 0, 0.05, 0.06, H, 5, col(WOOD.dark));
  b.t('metal').cyl(0, H + 0.05, 0, 0.12, 0.08, 0.15, 6, col(METAL.dark));
  b.ch('lamp').w(o._r ?? 9).t('plain'); b.cone(0, H + 0.3, 0, 0.12, 0.35, 5, 0xffa040); b.w(-1).ch('main');
  return { lights: [{ at: [0, H + 0.35, 0], color: LIGHT_COL.fire, radius: 6, intensity: 1.3, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, H + 0.25, 0], small: true }] };
};
P.neon_sign = (b, r, o) => { // pre-war neon on a mount; lit only where there's power
  const w = o.width || Math.max(1.8, String(o.text || '').length * 0.4), h = o.height || 0.9, H = o.post ?? 2.6;
  b.t('metal');
  if (o.posts !== false) { b.box(-w / 2 + 0.2, (H + h) / 2, -0.1, 0.1, H + h, 0.1, col(METAL.dark)); b.box(w / 2 - 0.2, (H + h) / 2, -0.1, 0.1, H + h, 0.1, col(METAL.dark)); }
  const color = LIGHT_COL[o.color ? 'neon_' + o.color : 'neon_red'] || LIGHT_COL.neon_red;
  return {
    signs: [{ text: o.text || 'OPEN', x: 0, y: H + h / 2, z: 0.0, ry: 0, w, h, style: 'neon', r: o._r ?? 9, color: o.color ? { red: '#ff4060', blue: '#40a0ff', green: '#60ff80', pink: '#ff70c0', yellow: '#ffd040' }[o.color] : null }],
    lights: [{ at: [0, H + h / 2, 0.8], color, radius: o.radius || 6, intensity: 1.2, kind: 'neon', flicker: true }],
  };
};
P.spotlight_tower = (b, r, o) => { // checkpoint / guard spotlight — essential at night
  const H = o.height || 7;
  const sc = col(METAL.steel, 0.05, r).offsetHSL(0, 0, -0.08);
  b.t('metal');
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) b.beam([x * 1.3, 0, z * 1.3], [x * 0.6, H, z * 0.6], 0.07, 4, sc);
  for (let k = 1; k < 4; k++) { const y = (H * k) / 4, s2 = 1.3 - 0.7 * (k / 4); b.box(0, y, 0.8 * s2 + 0.0, 1.6 * s2, 0.05, 0.05, sc); b.box(0, y, -0.8 * s2, 1.6 * s2, 0.05, 0.05, sc); }
  b.t('wood').box(0, H, 0, 2.2, 0.12, 2.2, col(WOOD.weathered));
  b.box(0, H + 0.5, 1.05, 2.2, 1.0, 0.06, col(WOOD.weathered)); b.box(-1.05, H + 0.5, 0, 0.06, 1.0, 2.2, col(WOOD.weathered)); b.box(1.05, H + 0.5, 0, 0.06, 1.0, 2.2, col(WOOD.weathered));
  b.t('metal').cyl(0, H + 0.8, 0.6, 0.06, 0.08, 1.45, 6, col(METAL.dark)); b.box(0, H + 1.53, 0.6, 0.7, 0.06, 0.06, col(METAL.dark)); // post + yoke, the lamp clear above the parapet; the head is live
  return { lights: [{ at: [0, H + 1.75, 0.6], color: LIGHT_COL.mercury, radius: 5, intensity: 1.2, kind: 'spot', search: { reach: o.radius || 26, head: 0.32 } }] };
};

// light behaviour per prop type: electric lights need power; essential ones stay on at Dead of Night
export const PROP_LIGHT = {
  firepit: { electric: false }, street_lamp: { electric: true }, vending_machine: { electric: true, essential: true },
  lantern: { electric: false }, torch: { electric: false }, neon_sign: { electric: true }, spotlight_tower: { electric: true, essential: true },
};

// default texture layer per prop type
const DEF_LAYER = {
  well: 'stone', hand_pump: 'metal', trough: 'wood', cistern: 'concrete', water_tower: 'metal', windmill: 'metal', vending_machine: 'metal',
  solar_panel: 'metal', car_wreck: 'rust', truck_chassis: 'rust', engine_block: 'rust', workbench: 'wood', barrel: 'metal', crates: 'wood',
  tires: 'plain', scrap_pile: 'rust', rubble: 'concrete', rocks: 'rock', bench: 'wood', table: 'wood', laundry_line: 'fabric', cart: 'wood',
  brahmin: 'hide', sign: 'wood', billboard: 'metal', utility_pole: 'bark', street_lamp: 'metal', gas_pump: 'metal', shrine: 'plaster',
  cross: 'wood', km_marker: 'concrete', generator: 'metal', radio_mast: 'metal', haystack: 'thatch', woodpile: 'bark', tarp_tent: 'fabric',
  bones: 'plain', ramada: 'wood', corral_gate: 'wood',
};

addTempProps(P, DEF_LAYER, PROP_LIGHT);
addBetterProps(P, DEF_LAYER);
addLifeProps(P, DEF_LAYER);
addValleyProps(P, DEF_LAYER);
addTradeProps(P, DEF_LAYER);
addPelicano(P, DEF_LAYER, PROP_LIGHT);
addSignProps(P, DEF_LAYER, PROP_LIGHT, SIGN_COLORS);
addWealthProps(P, DEF_LAYER, PROP_LIGHT);
addTownProps(P, DEF_LAYER);
addLifeProps2(P, DEF_LAYER, PROP_LIGHT);
addVehicleProps(P, DEF_LAYER, PROP_LIGHT);
addMysticProps(P, DEF_LAYER, PROP_LIGHT);
addFarmProps(P, DEF_LAYER);
addGapProps(P, DEF_LAYER);
addWaterProps(P, DEF_LAYER);
addWastelandProps(P, DEF_LAYER, PROP_LIGHT);
addUpscaleProps(P, DEF_LAYER, PROP_LIGHT);
export const PROP_TYPES = Object.keys(P);

// props backed by GLB models: type -> [model names] (one picked per placement)
export const MODEL_PROPS = {
  jersey_barrier: ['jersey_barrier', 'jersey_barrier', 'jersey_barrier_broken'], cone: ['cone', 'cone_tall'], bollard: ['bollard', 'bollard_concrete'],
  road_barrier: ['road_barrier', 'road_barrier_low'], pot_large: ['pot_large', 'pot_large2'], 
  // (potted plants and hedges are leaf cards now — props4.js)
};

// years of sun and dust: paint and plastic fade toward a dusty grey-tan (fabrics keep more of their colour; a few
// kept-up things less). Applied to the vertex colours of every built prop.
const FABRIC_L = LAYER.fabric, KEPT = new Set(['neon_sign', 'nuka_shack', 'fountain', 'pa_pole', 'cd_siren']);
const DUST = new THREE.Color(0xa8988a);
function weather(g, type, rng, opts) {
  if (!g || opts.fresh) return;
  const C = g.attributes.color, Ly = g.attributes.layer; if (!C) return;
  const k0 = (KEPT.has(type) ? 0.3 : 0.5) + rng.range(-0.08, 0.1), A = C.array, dl = DUST.r * 0.3 + DUST.g * 0.59 + DUST.b * 0.11;
  for (let i = 0; i < C.count; i++) {
    const fab = Ly && Math.round(Ly.array[i]) === FABRIC_L, k = fab ? k0 * 0.35 : k0;
    const r = A[i * 3], gg = A[i * 3 + 1], bb = A[i * 3 + 2], l = r * 0.3 + gg * 0.59 + bb * 0.11;
    const lt = l + (dl * 0.6 - l) * 0.18 * k; // bleached a little toward the dust
    A[i * 3] = r + (DUST.r * (lt / dl) - r) * k; A[i * 3 + 1] = gg + (DUST.g * (lt / dl) - gg) * k; A[i * 3 + 2] = bb + (DUST.b * (lt / dl) - bb) * k;
  }
  C.needsUpdate = true;
}

export function buildProp(type, rng, opts = {}) {
  if (type === 'model' || MODEL_PROPS[type]) {
    const name = opts.model || rng.pick(MODEL_PROPS[type] || []);
    const parts = name && MODELS[name] ? modelParts(name, opts.scale || 1) : null;
    if (parts) return { geoms: {}, parts, model: name };
    if (type === 'model') return null;
  }
  const fn = P[type];
  if (!fn) return null;
  const b = new Builder();
  b.t(DEF_LAYER[type] || 'plain');
  b.setCenter(0, 1, 0);
  const extra = fn(b, rng, opts) || {};
  const geoms = b.build({ maxEdge: opts.maxEdge ?? 0 });
  weather(geoms.main, type, rng, opts);
  return { geoms, ...extra };
}

export function attachPropSigns(group, signs, rng) {
  for (const s of signs || []) {
    const m = makeSign(s.text, s.w, s.h, s.style, rng, { r: s.r, color: s.color, rust: s.rust, bg: s.bg, board: s.board, level: s.level, twoSided: s.twoSided });
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.ry || 0;
    group.add(m);
  }
}

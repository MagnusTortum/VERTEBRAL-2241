// Food stands: small buildings that sell from a counter. kind 'stand', layout:
//   taqueria — painted block hut, serving hatch with a counter, comal + trompo inside, tin awning, stools, a plastic table
//   bar      — plank shack, the front flap propped up over a plank bar, bottle shelves, stools, crates, a string of bulbs
//   tortas   — sheet-metal booth, glass display case on the counter, roll-up shutter, beach umbrella and a table
//   fritanga — tin kiosk, front and side flaps propped open, the oil pan on the burner, bags of chicharrones hanging
//   trailer  — pre-war concession trailer on its wheels and jacks, service window with the flap up
// Front = +z (the serving side). Everything the stand needs sits inside or in front of its footprint.
import * as THREE from 'three';
import { Builder, col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL, GLASS, ROOF } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { ellip, rod, lathe } from './shapes.js';

export const STAND_LAYOUTS = { taqueria: 'taquería', bar: 'tiny bar (barra)', tortas: 'tortas / lonchería booth', fritanga: 'fritanga kiosk', trailer: 'pre-war food trailer' };
const SIZE = { taqueria: [4.2, 3.0], bar: [3.6, 2.6], tortas: [2.6, 2.2], fritanga: [2.4, 2.4], trailer: [4.8, 2.2] };
const LIM = { taqueria: [[3.2, 6], [2.4, 4]], bar: [[2.6, 5], [2.2, 3.4]], tortas: [[2.2, 3.4], [1.8, 2.8]], fritanga: [[2.0, 3.2], [2.0, 3.2]], trailer: [[4.0, 5.6], [2.0, 2.4]] };
export function standLayout(spec) {
  if (spec.layout && SIZE[spec.layout]) return spec.layout;
  return new RNG(`${spec.id || ''}:layout`).weighted({ taqueria: 3, bar: 2, tortas: 1.5, fritanga: 1.5, trailer: (spec.origin || 'new') !== 'new' ? 4 : 0.8 });
}
// the footprint (w, d): the spec size clamped to what the layout can be
export function standSize(spec) {
  const lay = standLayout(spec), [[w0, w1], [d0, d1]] = LIM[lay], s = spec.size || SIZE[lay];
  const sq = spec.size && Math.abs(spec.size[0] - 10) < 0.01 && Math.abs(spec.size[1] - 8) < 0.01; // the editor default: use the layout's own
  return sq ? SIZE[lay] : [Math.max(w0, Math.min(w1, s[0])), Math.max(d0, Math.min(d1, s[1]))];
}

const PAINT = [0xd8a830, 0xc83a2a, 0x2f8a6a, 0x3a7ab0, 0xe07a30, 0xe8e0d0, 0xd86a8a, 0x6aa04a];
const CHAIRS = [0xc83a2a, 0xe8e4dc, 0x2a6ab0, 0xd8b030, 0x3a8a4a];
const NAMES = ['DOÑA LUPE', 'EL GÜERO', 'LOS COMPAS', 'LA GORDA', 'DON CHUY', 'EL FLACO', 'LA PALMA', 'EL CHINO', 'LA BAHÍA'];
const TEXT = {
  taqueria: ['TACOS', 'TACOS {N}', 'TAQUERÍA {N}', 'TACOS DE PESCADO', 'TACOS · TORTAS', 'TACOS AL PASTOR'],
  bar: ['CERVEZA FRÍA', 'BAR {N}', 'MEZCAL', 'LA BARRA', 'CERVEZA · MEZCAL', 'EL ÚLTIMO TRAGO'],
  tortas: ['TORTAS', 'TORTAS {N}', 'TORTAS · LICUADOS', 'LONCHERÍA {N}', 'JUGOS Y TORTAS'],
  fritanga: ['CHICHARRONES', 'FRITANGAS', 'PAPAS', 'FRITURAS'],
  trailer: ['MARISCOS', 'COCTELES', 'MARISCOS {N}', 'TACOS DE PESCADO', 'HOT DOGS'],
};
const POWER_ODDS = { none: 0, scarce: 0.3, some: 0.65, grid: 0.95 };

export function buildStand(spec, seed, opts = {}) {
  const rng = new RNG(`${seed}:${spec.id}${spec.v ? ':' + spec.v : ''}`);
  const b = new Builder();
  const lay = standLayout(spec), [w, d] = standSize(spec);
  const cond = spec.condition ?? 0.7, open = cond >= 0.3 && spec.inhabited !== false, ruin = cond < 0.3;
  const settlement = opts.settlement || {};
  const powered = spec.light?.on ?? rng.chance(POWER_ODDS[settlement.power] ?? 0.3);
  const lightR = (essential, electric) => (electric && !powered ? 9 : essential ? -0.5 : rng.next() * 0.8);
  const info = { outlines: [{ x: 0, z: 0, w, d, rot: 0 }], signs: [], height: 2.6, lights: [], emitters: [], murals: [], finish: { tier: 'painted' }, frontDoor: null, openings: [], walls: {}, roofs: [], layout: lay };
  // weathered paint: fades toward the dust colour as the condition drops
  const fade = Math.max(0, Math.min(0.75, (0.85 - cond) * 1.1));
  const paint = (hex, j = 0.04) => col(hex, j, rng).lerp(col(0xc8bca0), fade);
  const body = paint(spec.color || rng.pick(PAINT)), trim = paint(rng.pick(PAINT.filter((p) => p !== spec.color)));
  const text = (spec.signText || rng.pick(TEXT[lay])).replace('{N}', rng.pick(NAMES));
  const S = (x, y, z, ww, hh, style, ry = 0) => info.signs.push({ text, x, y, z, ry, w: ww, h: hh, style, rng });
  const light = (x, y, z, electric, radius = 5, essential = false) => {
    const r = open ? lightR(essential, electric) : 9;
    b.ch('lamp').w(r).t('plain');
    if (electric) b.cyl(x, y, z, 0.05, 0.05, 0.1, 6, 0xfff0d0); else { b.box(x, y, z, 0.14, 0.2, 0.14, 0xffc070); }
    b.w(-1).ch('main');
    info.lights.push({ x, y: y - 0.1, z, color: electric ? LIGHT_COL.incandescent : LIGHT_COL.oil, radius, intensity: 1.0, kind: 'lamp', r, flicker: !electric });
  };
  const glow = (x, y, z, sx, sy, sz, hex = 0xff7a30) => { b.ch('lamp').w(open ? -0.5 : 9).t('plain').box(x, y, z, sx, sy, sz, hex).w(-1).ch('main'); };
  const stool = (x, z) => { const c = col(rng.pick([WOOD.weathered, 0xc83a2a, 0x8a8a80]), 0.05, rng); b.t('plain').cyl(x, 0.68, z, 0.17, 0.17, 0.05, 8, c); for (const [a, e] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) b.box(x + a, 0.33, z + e, 0.03, 0.66, 0.03, col(METAL.dark)); };
  const plasticSet = (x, z, n = 4) => { // the plastic table and chairs every stand has
    const tc = col(rng.pick(CHAIRS), 0.03, rng);
    b.t('plain').box(x, 0.72, z, 0.8, 0.04, 0.8, tc); for (const [a, e] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) b.box(x + a, 0.36, z + e, 0.04, 0.72, 0.04, tc);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3), cx = x + Math.sin(a) * 0.7, cz = z + Math.cos(a) * 0.7, cc = col(rng.pick(CHAIRS), 0.03, rng);
      b.pushT(cx, 0, cz, a + Math.PI); b.box(0, 0.44, 0, 0.44, 0.04, 0.42, cc).box(0, 0.7, -0.2, 0.44, 0.5, 0.04, cc, 0, -0.12); for (const [p, q] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) b.box(p, 0.22, q, 0.04, 0.44, 0.04, cc); b.pop();
    }
    if (rng.chance(0.6)) { b.cyl(x - 0.15, 0.82, z, 0.04, 0.04, 0.16, 6, col(0xc83a2a)); b.cyl(x + 0.05, 0.82, z + 0.1, 0.04, 0.04, 0.16, 6, col(0x3a8a3a)); } // salsas
  };
  const cooler = (x, z, ry = 0) => { const c = col(rng.pick([0xc83a2a, 0x2a6ab0, 0xe8e4dc]), 0.04, rng); b.t('plain').box(x, 0.24, z, 0.7, 0.45, 0.42, c, ry).box(x, 0.48, z, 0.72, 0.06, 0.44, col(0xe8e4dc), ry); };
  const crates = (x, z, n) => { for (let k = 0; k < n; k++) { const c = col(rng.pick([0xd8b030, 0xc83a2a, 0x2a6ab0]), 0.04, rng), y = 0.15 + k * 0.3; b.t('plain').box(x, y, z, 0.5, 0.28, 0.36, c, rng.range(-0.15, 0.15)); for (let i = 0; i < 6; i++) b.cyl(x - 0.18 + (i % 3) * 0.18, y + 0.15, z - 0.08 + Math.floor(i / 3) * 0.16, 0.025, 0.025, 0.04, 5, col(0xc8a040)); } };
  const bottles = (x0, x1, y, z) => { b.t('plain'); for (let x = x0; x < x1; x += rng.range(0.07, 0.12)) { const h = rng.range(0.18, 0.3); b.cyl(x, y + h / 2, z, 0.035, 0.035, h, 6, col(rng.pick([0x5a3a1a, 0x2a5a2a, 0xc8c8b8, 0x8a5a2a, 0xa83a2a]), 0.05, rng)); } };
  const roofSheet = (x0, x1, z0, z1, y0, y1, hex) => { // corrugated sheets from (z0, y0) to (z1, y1)
    b.t('corrugated'); const n = Math.max(2, Math.round((x1 - x0) / 0.9));
    for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; b.plank([x, y0, z0], [x, y1, z1], (x1 - x0) / n + 0.02, 0.03, hex != null ? col(hex, 0.05, rng) : col(rng.pick([...ROOF.corrugated, METAL.rust]), 0.07, rng), rng.range(-0.02, 0.02)); }
  };
  const flap = (hx, hy, hz, ww, hh, ang, c, axis = 'x') => { // a panel hinged along its top edge, propped open by `ang`
    b.push(new THREE.Matrix4().makeTranslation(hx, hy, hz).multiply(axis === 'x' ? new THREE.Matrix4().makeRotationX(-ang) : new THREE.Matrix4().makeRotationZ(ang)));
    if (axis === 'x') b.box(0, -hh / 2, 0.02, ww, hh, 0.04, c); else b.box(0.02, -hh / 2, 0, 0.04, hh, ww, c);
    b.pop();
    // the prop stick
    if (axis === 'x') { const ey = hy - Math.cos(ang) * hh, ez = hz + Math.sin(ang) * hh; for (const sx of [-ww / 2 + 0.1, ww / 2 - 0.1]) rod(b, [hx + sx, hy - 0.9, hz + 0.03], [hx + sx, ey + 0.02, ez - 0.02], 0.018, col(WOOD.pole), 4); }
    else { const ey = hy - Math.cos(ang) * hh, ex = hx + Math.sin(ang) * hh; for (const sz of [-ww / 2 + 0.1, ww / 2 - 0.1]) rod(b, [hx + 0.03, hy - 0.9, hz + sz], [ex - 0.02, ey + 0.02, hz + sz], 0.018, col(WOOD.pole), 4); }
  };
  const door = (x, z, nx, nz, ww = 0.8) => { info.frontDoor = { x, y: 2.0, z, nx, nz, tx: nz, tz: -nx, w: ww, sill: 0 }; info.openings.push({ x, z, nx, nz, tx: nz, tz: -nx, w: ww, y0: 0, y1: 2.0, type: 'door', floor: 0, side: nz > 0.5 ? 'front' : 'side', main: true, wallH: 2.4, top: 2.4 }); };
  const serve = (ww) => info.openings.push({ x: 0, z: d / 2, nx: 0, nz: 1, tx: 1, tz: 0, w: ww, y0: 0, y1: 1.9, type: 'door', floor: 0, side: 'front', main: !info.frontDoor, wallH: 2.4, top: 2.4 }); // keep the counter front clear

  if (lay === 'taqueria') {
    const H = 2.5, t = 0.18, hx0 = -w / 2 + 0.35, hx1 = w / 2 - 1.0;
    b.t('block');
    b.box(0, H / 2, -d / 2 + t / 2, w, H, t, body); // back
    for (const sx of [-1, 1]) b.box(sx * (w / 2 - t / 2), H / 2, 0, t, H, d, body); // sides
    b.box(0, 0.5, d / 2 - t / 2, w, 1.0, t, body); // counter wall
    if (open) { b.box((hx1 + w / 2) / 2, H / 2, d / 2 - t / 2, w / 2 - hx1, H, t, body); b.box(0, (H + 2.05) / 2, d / 2 - t / 2, w, H - 2.05, t, body); }
    else b.box(0, (H + 1.0) / 2, d / 2 - t / 2, w, H - 1.0, t, body); // shuttered: the hatch boarded
    b.t('plaster').box(0, 0.3, d / 2 + 0.005, w + 0.01, 0.6, 0.02, trim); // painted base
    b.t('slab').box(0, H + 0.08, 0, w + 0.4, 0.16, d + 0.4, col(0x9c968a, 0.04, rng));
    if (open) {
      b.t('metal').box((hx0 + hx1) / 2, 1.02, d / 2 + 0.12, hx1 - hx0 + 0.2, 0.05, 0.42, col(METAL.steel, 0.05, rng)); // counter ledge
      b.t('plain').box(0, H / 2, -d / 2 + t + 0.01, w - 0.4, H - 0.1, 0.02, col(0x3a332c)); // dim interior
      // comal on a brick hearth, the hood over it, the stovepipe
      b.t('brick').box(hx0 + 0.6, 0.45, -d / 2 + 0.6, 0.9, 0.9, 0.7, col(0x8e5240, 0.05, rng));
      b.t('metal').cyl(hx0 + 0.6, 0.93, -d / 2 + 0.6, 0.38, 0.38, 0.03, 12, col(0x2a2826)); glow(hx0 + 0.6, 0.88, -d / 2 + 0.6, 0.6, 0.04, 0.5);
      b.box(hx0 + 0.6, 1.95, -d / 2 + 0.55, 0.9, 0.3, 0.7, col(METAL.dark), 0, 0.12);
      b.cyl(hx0 + 0.6, H + 0.55, -d / 2 + 0.5, 0.08, 0.08, 1.1, 7, col(METAL.dark)); b.box(hx0 + 0.6, H + 1.12, -d / 2 + 0.5, 0.24, 0.04, 0.24, col(METAL.rust));
      info.emitters.push({ type: 'smoke', p: [hx0 + 0.6, H + 1.15, -d / 2 + 0.5], inhabited: true });
      if (rng.chance(0.7)) { // trompo al pastor: the spit, the meat, a pineapple on top, the red element behind it
        const tx = Math.min(hx1 - 0.3, hx0 + 1.6), tz = -d / 2 + 0.7;
        b.t('metal').cyl(tx, 0.95, tz, 0.2, 0.2, 0.04, 10, col(METAL.steel)); rod(b, [tx, 0.95, tz], [tx, 1.85, tz], 0.015, col(METAL.steel), 5);
        b.t('plain'); lathe(b, [[0.12, 0], [0.2, 0.12], [0.19, 0.4], [0.12, 0.62]], col(0x9a4a2a, 0.05, rng), tx, 1.0, tz, 10);
        ellip(b, tx, 1.72, tz, 0.08, 0.1, 0.08, col(0xd8b030));
        glow(tx, 1.3, tz - 0.3, 0.3, 0.6, 0.04, 0xff4a20);
      }
      bottles(hx0 + 0.2, hx1 - 0.2, 1.045, d / 2 + 0.25); // salsas on the counter
      for (let x = hx0 + 0.4; x < hx1; x += 0.65) stool(x, d / 2 + 0.6);
      // tin awning over the counter on two poles
      roofSheet(-w / 2 - 0.2, w / 2 + 0.2, d / 2 + 0.1, d / 2 + 1.7, H - 0.05, 2.15);
      b.t('wood'); for (const sx of [-w / 2, w / 2]) b.box(sx, 1.08, d / 2 + 1.6, 0.08, 2.16, 0.08, col(WOOD.pole));
      light(0, 2.05, d / 2 + 0.9, powered && rng.chance(0.7), 6, true);
      plasticSet(w / 2 + 1.1, d / 2 + 1.1, rng.int(2, 4));
      cooler(-w / 2 - 0.5, d / 2 + 0.4, 0.2);
      b.t('wood').box(w / 2 + 0.02, 1.5, d / 2 - 0.6, 0.03, 0.7, 0.5, col(0x23302a)); // menu board on the side
    }
    info.signs.push({ text: rng.pick(['TACOS', 'TACOS', 'TAQUERÍA', 'PASTOR']), x: -w / 2 - 0.01, y: 1.45, z: 0, ry: -Math.PI / 2, w: d - 0.3, h: 1.0, style: 'wall', rng }); // painted big on the side wall
    if (!ruin) { b.t('wood'); for (const sx of [-w / 2 + 0.4, w / 2 - 0.4]) b.box(sx, H + 0.4, d / 2 - 0.3, 0.06, 0.6, 0.06, col(WOOD.pole)); }
    S(0, H + 0.55, d / 2 - 0.25, Math.min(w - 0.4, 0.6 + text.length * 0.22), 0.5, 'painted'); // the name on a board on the roof edge
    door(w / 2, -0.2, 1, 0);
    serve(hx1 - hx0);
  } else if (lay === 'bar') {
    const H = 2.4, hF = H, hB = H - 0.45;
    const boards = (x0, x1, y0, y1, z, along = 'x', c = body) => { b.t('wood'); const L = along === 'x' ? x1 - x0 : y1 - y0; const n = Math.max(2, Math.round((along === 'x' ? x1 - x0 : 1) / 0.2)); for (let k = 0; k < n; k++) { const a = x0 + ((x1 - x0) * (k + 0.5)) / n; b.box(a, (y0 + y1) / 2, z, (x1 - x0) / n - 0.015, y1 - y0, 0.04, c.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06)); } return L; };
    const raw = rng.chance(0.4), wc = raw ? col(WOOD.weathered, 0.05, rng).lerp(col(0xc8bca0), fade * 0.5) : body;
    boards(-w / 2, w / 2, 0, hB, -d / 2, 'x', wc); // back
    b.t('wood'); for (const sx of [-1, 1]) { const n = Math.round(d / 0.2); for (let k = 0; k < n; k++) { const z = -d / 2 + (d * (k + 0.5)) / n, top = hB + ((z + d / 2) / d) * (hF - hB); b.box(sx * w / 2, top / 2, z, 0.04, top, d / n - 0.015, wc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06)); } }
    boards(-w / 2, w / 2, 0, 1.05, d / 2, 'x', wc); // the bar front
    b.t('wood').box(0, 1.1, d / 2 + 0.12, w + 0.3, 0.07, 0.5, col(WOOD.dark, 0.05, rng)); // bar top
    roofSheet(-w / 2 - 0.25, w / 2 + 0.25, -d / 2 - 0.3, d / 2 + 0.05, hB + 0.05, hF + 0.08);
    if (open) {
      flap(0, hF - 0.05, d / 2 + 0.02, w - 0.1, 1.05, 1.15, wc.clone().offsetHSL(0, 0, -0.04)); // the front flap, propped up
      b.t('plain').box(0, H / 2, -d / 2 + 0.05, w - 0.1, H - 0.1, 0.02, col(0x2e2924)); // dark inside
      b.t('wood'); for (const y of [1.25, 1.7]) { b.box(0, y, -d / 2 + 0.2, w - 0.4, 0.04, 0.26, col(WOOD.dark)); bottles(-w / 2 + 0.35, w / 2 - 0.35, y + 0.02, -d / 2 + 0.2); }
      b.t('wood').cyl(w / 2 - 0.5, 0.42, -d / 2 + 0.45, 0.3, 0.3, 0.84, 10, col(WOOD.dark), 0, 0, 0); // barrel
      for (let x = -w / 2 + 0.45; x < w / 2 - 0.2; x += 0.75) stool(x, d / 2 + 0.75);
      crates(w / 2 + 0.45, d / 2 - 0.4, rng.int(2, 4)); crates(w / 2 + 0.45, d / 2 - 0.95, rng.int(1, 3));
      // a string of bulbs from the flap corners to a pole out front
      const pz = d / 2 + 2.4, px = rng.chance(0.5) ? -w / 2 - 0.3 : w / 2 + 0.3;
      b.t('wood').box(px, 1.4, pz, 0.08, 2.8, 0.08, col(WOOD.pole));
      const r = lightR(true, powered && rng.chance(0.75)), electric = r !== 9 || powered;
      const A = [-w / 2 + 0.1, hF + 0.25, d / 2 + 1.05], B = [px, 2.75, pz], C = [w / 2 - 0.1, hF + 0.25, d / 2 + 1.05];
      for (const [p0, p1] of [[A, B], [C, B]]) {
        const N = 6; for (let i = 0; i <= N; i++) { const tt = i / N, x = p0[0] + (p1[0] - p0[0]) * tt, y = p0[1] + (p1[1] - p0[1]) * tt - Math.sin(tt * Math.PI) * 0.25, z = p0[2] + (p1[2] - p0[2]) * tt; if (i < N) { const tt2 = (i + 1) / N; rod(b, [x, y, z], [p0[0] + (p1[0] - p0[0]) * tt2, p0[1] + (p1[1] - p0[1]) * tt2 - Math.sin(tt2 * Math.PI) * 0.25, p0[2] + (p1[2] - p0[2]) * tt2], 0.006, col(0x222220), 3); } if (i % 2) { b.ch('lamp').w(electric && powered ? r : 9).t('plain').cyl(x, y - 0.06, z, 0.035, 0.035, 0.07, 5, 0xffe0a0).w(-1).ch('main'); } }
      }
      if (powered) info.lights.push({ x: 0, y: 2.2, z: d / 2 + 1.6, color: LIGHT_COL.incandescent, radius: 6, intensity: 0.9, kind: 'lamp', r, flicker: false }); else light(-w / 2 + 0.3, 1.5, d / 2 + 0.3, false, 5, true);
    } else boards(-w / 2, w / 2, 1.05, hF, d / 2 + 0.02, 'x', wc.clone().offsetHSL(0, 0, -0.04)); // flap down: shut
    // the name on a board over the roof edge
    if (!ruin) { b.t('wood'); for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) b.box(sx, hF + 0.35, -d / 2 + 0.25, 0.06, 0.7, 0.06, col(WOOD.pole)); }
    S(0, hF + 0.5, -d / 2 + 0.3, w - 0.3, 0.55, 'painted');
    door(-w / 2, -0.3, -1, 0);
    serve(w);
  } else if (lay === 'tortas') {
    const H = 2.3, met = paint(rng.pick([0xe8e0d0, 0xd8a830, 0x3a7ab0, 0xc83a2a]));
    b.t('metal');
    b.box(0, H / 2, -d / 2 + 0.03, w, H, 0.06, met); for (const sx of [-1, 1]) b.box(sx * (w / 2 - 0.03), H / 2, 0, 0.06, H, d, met);
    b.box(0, 0.47, d / 2 - 0.03, w, 0.94, 0.06, met); b.box(0, H + 0.04, 0, w + 0.15, 0.08, d + 0.15, met.clone().offsetHSL(0, 0, -0.08));
    if (open) {
      b.cyl(0, H - 0.12, d / 2 + 0.02, 0.1, 0.1, w - 0.1, 10, met.clone().offsetHSL(0, 0, -0.06), 0, 0, Math.PI / 2); // roll-up shutter, rolled
      b.t('wood').box(0, 0.97, d / 2 - 0.1, w - 0.1, 0.05, 0.5, col(WOOD.fresh, 0.05, rng)); // counter
      b.ch('glass').w(-1).t('plain').box(-w / 4, 1.2, d / 2 - 0.12, w * 0.4, 0.4, 0.4, GLASS.dark).ch('main'); // display case
      b.t('plain'); for (let k = 0; k < 4; k++) ellip(b, -w / 4 + (k - 1.5) * 0.12, 1.05, d / 2 - 0.12, 0.06, 0.04, 0.05, col(0xd8b07a)); // bolillos
      b.cyl(w / 4, 1.1, d / 2 - 0.15, 0.08, 0.07, 0.24, 8, col(0xe8e4dc)); b.cyl(w / 4, 1.27, d / 2 - 0.15, 0.06, 0.08, 0.14, 8, col(0xc8d8c8)); // licuadora
      for (let k = 0; k < 6; k++) ellip(b, w / 4 + 0.25 + rng.range(-0.1, 0.1), 1.02, d / 2 - 0.12 + rng.range(-0.1, 0.1), 0.05, 0.05, 0.05, col(rng.pick([0xe08a20, 0xd8c030, 0x3a8a2a, 0xc03020]))); // fruit
      b.t('plain').box(0, H / 2, -d / 2 + 0.07, w - 0.2, H - 0.2, 0.02, col(0x3a352e));
      b.t('metal').cyl(-w / 2 - 0.25, 0.45, -d / 2 + 0.4, 0.17, 0.17, 0.9, 10, col(rng.pick([0xc8c8c0, 0x3a6ab0]))); // gas cylinder
      // beach umbrella over a plastic table
      const ux = w / 2 + 1.2, uz = d / 2 + 0.8;
      plasticSet(ux, uz, rng.int(2, 4));
      b.t('plain'); rod(b, [ux, 0, uz], [ux, 2.3, uz], 0.025, col(0xe8e4dc), 5);
      b.t('fabric'); for (let k = 0; k < 8; k++) { const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2, R = 1.25; b.tri([ux, 2.45, uz], [ux + Math.sin(a0) * R, 2.05, uz + Math.cos(a0) * R], [ux + Math.sin(a1) * R, 2.05, uz + Math.cos(a1) * R], col(k % 2 ? 0xe8e4dc : rng.pick([0xc83a2a, 0x2a6ab0, 0xd8b030]), 0.03, rng)); b.tri([ux, 2.44, uz], [ux + Math.sin(a1) * R, 2.04, uz + Math.cos(a1) * R], [ux + Math.sin(a0) * R, 2.04, uz + Math.cos(a0) * R], col(0xb8b4ac)); }
      light(0, H - 0.3, d / 2 - 0.3, powered, 5, true);
    } else b.t('metal').box(0, (H + 0.94) / 2, d / 2 - 0.02, w - 0.1, H - 0.94, 0.04, met.clone().offsetHSL(0, 0, -0.06)); // shutter down
    // printed sign on the roof
    if (!ruin) { b.t('metal'); for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) b.box(sx, H + 0.35, 0, 0.05, 0.6, 0.05, col(METAL.dark)); }
    S(0, H + 0.55, 0.05, w, 0.5, 'prewar');
    door(-w / 2, -0.3, -1, 0, 0.7);
    serve(w);
  } else if (lay === 'fritanga') {
    const H = 2.3, met = paint(rng.pick([0xd8a830, 0xc83a2a, 0x2f8a6a, 0xe07a30]));
    b.t('metal');
    b.box(0, H / 2, -d / 2 + 0.03, w, H, 0.06, met); b.box(-w / 2 + 0.03, H / 2, 0, 0.06, H, d, met);
    b.box(0, 0.48, d / 2 - 0.03, w, 0.96, 0.06, met); b.box(w / 2 - 0.03, 0.48, 0, 0.06, 0.96, d, met);
    b.box(w / 2 - 0.03, H - 0.1, 0, 0.06, 0.2, d, met); b.box(0, H - 0.1, d / 2 - 0.03, w, 0.2, 0.06, met);
    for (const [x, z] of [[w / 2 - 0.05, d / 2 - 0.05]]) b.box(x, H / 2, z, 0.08, H, 0.08, met.clone().offsetHSL(0, 0, -0.1)); // corner post
    roofSheet(-w / 2 - 0.2, w / 2 + 0.2, -d / 2 - 0.2, d / 2 + 0.2, H + 0.02, H + 0.12, 0x8a8a84);
    if (open) {
      flap(0, H - 0.2, d / 2, w - 0.1, 1.1, 1.25, met.clone().offsetHSL(0, 0, -0.04));
      flap(w / 2, H - 0.2, 0, d - 0.1, 1.1, 1.25, met.clone().offsetHSL(0, 0, -0.04), 'z');
      b.t('wood').box(0, 0.98, d / 2 - 0.15, w - 0.1, 0.05, 0.36, col(WOOD.weathered)); b.box(w / 2 - 0.15, 0.98, 0, 0.36, 0.05, d - 0.1, col(WOOD.weathered));
      // the burner and the cazo of oil
      b.t('metal').cyl(-w / 4, 0.4, -d / 4, 0.3, 0.3, 0.8, 8, col(METAL.dark)); b.cyl(-w / 4, 0.86, -d / 4, 0.45, 0.32, 0.16, 12, col(0x8a7a5a));
      b.ch('lamp').w(open ? -0.5 : 9).t('plain').cyl(-w / 4, 0.95, -d / 4, 0.4, 0.4, 0.01, 12, 0xc89030).w(-1).ch('main');
      info.emitters.push({ type: 'smoke', p: [-w / 4, 1.2, -d / 4], inhabited: true });
      // bags of chicharrones and papas hung from the flap edge
      b.t('plain'); for (let x = -w / 2 + 0.25; x < w / 2 - 0.2; x += 0.22) { const hh = rng.range(0.25, 0.35); rod(b, [x, H - 0.25, d / 2 + 0.5], [x, H - 0.45, d / 2 + 0.5], 0.004, col(0x222220), 3); b.box(x, H - 0.45 - hh / 2, d / 2 + 0.5, 0.16, hh, 0.04, col(rng.pick([0xe08a30, 0xd8b050, 0xc86a2a, 0xe8c070]), 0.05, rng)); }
      b.t('plain'); for (let k = 0; k < 3; k++) b.cyl(w / 2 - 0.15, 1.08, -d / 2 + 0.35 + k * 0.3, 0.1, 0.09, 0.16, 8, col(rng.pick([0xc83a2a, 0x3a8a3a, 0xd8b030]))); // salsa jars
      light(0, H - 0.35, 0, powered, 5, true);
      for (const [x, z] of [[-0.3, d / 2 + 0.55], [w / 2 + 0.55, 0.2]]) stool(x, z);
    } else { b.t('metal').box(0, (H - 0.2 + 0.96) / 2, d / 2 - 0.02, w - 0.1, H - 1.16, 0.04, met.clone().offsetHSL(0, 0, -0.06)); b.box(w / 2 - 0.02, (H - 0.2 + 0.96) / 2, 0, 0.04, H - 1.16, d - 0.1, met.clone().offsetHSL(0, 0, -0.06)); }
    S(-0.15, 0.55, d / 2 + 0.005, w - 0.5, 0.55, 'wall'); // lettering painted on the counter wall
    door(-w / 2, 0, -1, 0, 0.7);
    serve(w);
  } else { // trailer
    // condition, from rusted out (0) to restored (1): the paint goes from fresh with chrome trim, to faded
    // with rust spots, to rust bleeding everywhere with flat tyres, to a holed rust shell on blocks
    const rk = Math.max(0, Math.min(1, (0.92 - cond) / 0.8)), rustC = col(0x6e4430);
    const rusty = (hex) => col(hex, 0.03, rng).lerp(col(0xc8bca0), Math.min(0.5, rk * 0.6)).lerp(rustC, Math.pow(rk, 1.7) * 0.85);
    const L = w, B = d, H0 = 0.55, H1 = 2.45, R = 0.45, met = rusty(rng.pick([0xd8d4c8, 0xc8e0d8, 0xf0e2c0, 0xe8c8c0, 0xb8c0c8]));
    const stripe = rusty(rng.pick([0xc83a2a, 0x2a6ab0, 0x3a8a6a, 0xd8a830]));
    // body with rounded corners in plan and a rounded roof edge (aluminium concession trailer)
    const rc = 0.38, re = 0.18, Hb = H1 - re, ym = (H0 + Hb) / 2, hb = Hb - H0;
    b.t('metal');
    b.box(0, ym, 0, L - 2 * rc, hb, B, met); b.box(0, ym, 0, L, hb, B - 2 * rc, met);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(sx * (L / 2 - rc), ym, sz * (B / 2 - rc), rc, rc, hb, 10, met);
    b.box(0, Hb + re / 2, 0, L - 2 * rc, re, B - 2 * re, met); b.box(0, Hb + re / 2, 0, L - 2 * re, re, B - 2 * rc, met);
    for (const sz of [-1, 1]) b.cyl(0, Hb, sz * (B / 2 - re), re, re, L - 2 * rc, 8, met, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) b.cyl(sx * (L / 2 - re), Hb, 0, re, re, B - 2 * rc, 8, met, Math.PI / 2, 0, 0);
    b.box(0, H0 - 0.04, 0, L - 0.3, 0.08, B - 0.2, col(METAL.dark)); // chassis
    if (cond > 0.35) b.box(-0.9, H1 + 0.04, 0, 0.8, 0.25, 0.7, rusty(0xb8b8b0)); // roof vent
    if (cond > 0.8) { b.t('metal'); for (const sz of [-1, 1]) { b.box(0, H0 + 0.08, sz * (B / 2 + 0.006), L - 0.5, 0.05, 0.012, col(METAL.chrome)); b.box(0, H0 + 0.66, sz * (B / 2 + 0.008), L - 0.4, 0.03, 0.012, col(METAL.chrome)); } } // chrome trim, restored
    for (const sz of [-1, 1]) b.box(0, H0 + 0.55, sz * (B / 2 + 0.005), L - 0.4, 0.14, 0.01, stripe); // the stripe
    // rust: spots along the sills when kept, patches bleeding up the sides, holes through the worst of it
    b.t('rust');
    const RC = [0x7a4a30, 0x6a3e2a, 0x84553a, 0x5a3424];
    for (let k = 0; k < Math.round(rk * 70); k++) {
      const sz = rng.chance(0.5) ? 1 : -1, x = rng.range(-L / 2 + 0.5, L / 2 - 0.5), zz = sz * (B / 2 + 0.007 + (k % 3) * 0.001), c = col(rng.pick(RC), 0.06, rng);
      if (rng.chance(0.55)) { const y1 = rng.range(H0 + 0.6, Hb - 0.1), hh = rng.range(0.15, 0.25 + rk * 0.7); b.box(x, y1 - hh / 2, zz, rng.range(0.02, 0.05), hh, 0.005, c); } // streaks running down from seams
      else { const big = 0.35 + rk * 0.9, y = rng.range(H0 + 0.05, H0 + 0.2 + rk * (hb - 0.3)); b.box(x, y, zz, rng.range(0.06, 0.25) * big, rng.range(0.04, 0.14) * big, 0.005, c, 0, 0, rng.range(-0.3, 0.3)); } // blotches, low first
    }
    if (cond < 0.28) { b.t('plain'); for (let k = 0; k < Math.round((0.28 - cond) * 40); k++) { const sz = rng.chance(0.5) ? 1 : -1; b.box(rng.range(-L / 2 + 0.6, L / 2 - 0.6), rng.range(H0 + 0.1, H0 + 0.9), sz * (B / 2 + 0.009), rng.range(0.08, 0.35), rng.range(0.06, 0.25), 0.006, col(0x141210)); } } // rusted through
    // wheels (flat when neglected, gone when it's a shell on blocks), jacks, the tongue
    if (cond >= 0.2) { const flat = cond < 0.45; b.t('plain'); for (const sz of [-1, 1]) { b.cyl(0, flat ? 0.27 : 0.33, sz * (B / 2 - 0.1), flat ? 0.3 : 0.33, flat ? 0.3 : 0.33, 0.2, 12, col(0x1e1e1c), Math.PI / 2, 0, 0); b.t('metal').cyl(0, flat ? 0.27 : 0.33, sz * (B / 2 + 0.005), 0.15, 0.15, 0.02, 10, cond > 0.8 ? col(METAL.chrome) : col(METAL.rust, 0.06, rng), Math.PI / 2, 0, 0); b.t('plain'); } }
    else { b.t('block'); for (const x of [-0.6, 0.6]) b.box(x, 0.25, 0, 0.4, 0.5, B - 0.4, col(0x9a968c)); }
    b.t('metal'); for (const [x, z] of [[-L / 2 + 0.4, -B / 2 + 0.3], [-L / 2 + 0.4, B / 2 - 0.3], [L / 2 - 0.4, -B / 2 + 0.3], [L / 2 - 0.4, B / 2 - 0.3]]) b.box(x, H0 / 2, z, 0.08, H0, 0.08, col(METAL.dark));
    rod(b, [-L / 2 + 0.2, H0, -0.5], [-L / 2 - 0.9, H0 - 0.1, 0], 0.04, col(METAL.dark), 5); rod(b, [-L / 2 + 0.2, H0, 0.5], [-L / 2 - 0.9, H0 - 0.1, 0], 0.04, col(METAL.dark), 5);
    b.t('block'); b.box(-L / 2 - 0.9, 0.2, 0, 0.3, 0.4, 0.3, col(0x9a968c));
    // service window, flap up, counter
    const ww = L * 0.48, wy0 = H0 + 0.85, wy1 = H1 - 0.45;
    b.t('plain').box(0.3, (wy0 + wy1) / 2, B / 2 + 0.008, ww, wy1 - wy0, 0.01, col(open ? 0x3a332c : 0x8a8a84));
    if (!open && cond < 0.3) { b.t('wood'); for (let k = 0; k < 3; k++) b.box(0.3, wy0 + 0.15 + k * 0.3, B / 2 + 0.03, ww + 0.15, 0.24, 0.03, col(WOOD.weathered, 0.08, rng), 0, 0, rng.range(-0.06, 0.06)); } // boarded
    if (open) {
      flap(0.3, wy1 + 0.02, B / 2 + 0.01, ww + 0.1, wy1 - wy0 + 0.05, 1.3, met.clone().offsetHSL(0, 0, -0.05));
      b.t('metal').box(0.3, wy0 - 0.02, B / 2 + 0.15, ww + 0.1, 0.04, 0.3, col(METAL.steel)); bottles(0.3 - ww / 2 + 0.1, 0.3 + ww / 2 - 0.1, wy0, B / 2 + 0.15);
      glow(0.3, (wy0 + wy1) / 2, B / 2 - 0.05, ww - 0.1, 0.02, 0.02, 0xffd090);
      light(0.3, wy1 + 0.25, B / 2 + 0.6, powered, 6, true);
      plasticSet(L / 2 + 0.9, B / 2 + 1.0, rng.int(2, 4)); plasticSet(-L / 2 + 0.6, B / 2 + 1.3, rng.int(2, 3));
      cooler(L / 2 - 0.3, B / 2 + 0.5);
      b.t('wood').box(-L / 2 + 0.75, 0.45, B / 2 + 0.3, 0.5, 0.9, 0.04, col(0x23302a), 0, -0.15); // menu board
    }
    if (!ruin) { b.t('metal'); for (const sx of [-0.9, 0.9]) b.box(sx, H1 + 0.3, 0, 0.05, 0.6, 0.05, col(METAL.dark)); }
    S(0, H1 + 0.5, 0.05, L * 0.7, 0.5, 'prewar');
    door(-L / 2 + 0.6, B / 2, 0, 1, 0.6);
    serve(ww);
    info.height = H1 + 0.8;
  }
  if (ruin) info.signs.length = 0;
  return { geoms: b.build({ maxEdge: 3.2 }), info };
}

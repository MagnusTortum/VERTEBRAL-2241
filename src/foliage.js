// Leafy things on buildings and props, always as alpha cards (Builder leaf channel), never geometry:
// potted plants, flower boxes, beds, herbs, vines, climbers, crops in tubs, hanging herb bundles.
import { col } from './builder.js';
import { PLANT, LEAF } from './textures.js';
import { WOOD } from './palette.js';

const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const GLAZED = [0x3f6478, 0x4a6656, 0xb09048, 0x8a4a3e, 0x3e4c62];
// what grows in pots / boxes, with relative odds
export const POTTED = { geranium: 3, herb: 2.5, marigold: 1.5, aloe: 1.5, sansevieria: 1, chile: 1, flowers: 1.5, bougainvillea: 0.6, shrub: 0.8 };
const SHAPE = { // [width k, height k, crossed cards, flat top]
  herb: [1.0, 0.9, 3, true], geranium: [1.1, 0.9, 3, true], marigold: [1.0, 0.8, 3, true], chile: [1.0, 1.0, 3, true], aloe: [1.1, 0.9, 3, false],
  sansevieria: [0.8, 1.3, 2, false], tomato: [1.0, 1.4, 3, false], flowers: [1.1, 0.85, 3, true], shrub: [1.2, 1.0, 3, true], bougainvillea: [1.6, 1.4, 3, true],
  grass: [1.0, 0.7, 2, false], weed: [0.9, 0.9, 2, false],
};
const tintOf = (r, k = 0.08) => col(0xf0ecdc, k, r); // a little sun-bleached dust on every leaf

// a plant standing on (x, y, z), about `s` metres tall / wide
export function plant(b, kind, x, y, z, s, r) {
  if (kind === 'lettuce') { b.leafFlat(x, y + 0.02, z, s, PLANT.lettuce, tintOf(r), r.next() * 6); return b; }
  if (kind === 'vine') { b.leafCross(x, y, z, s * 1.2, s * 1.3, 16 + LEAF.vine, tintOf(r), 3, r.next() * 3, true); return b; }
  const [wk, hk, n, top] = SHAPE[kind] || SHAPE.shrub;
  b.leafCross(x, y, z, s * wk, s * hk, PLANT[kind] ?? PLANT.shrub, tintOf(r), n, r.next() * Math.PI, top);
  return b;
}
// terracotta (or glazed) pot with a plant in it; returns the pot top height
export function pottedPlant(b, r, x, y, z, big = false, opt = {}) {
  const pr = big ? r.range(0.26, 0.34) : r.range(0.15, 0.22), h = pr * r.range(1.5, 1.9);
  b.t('plain').cyl(x, y + h / 2, z, pr, pr * 0.72, h, 8, col(opt.color ?? (opt.glazed || r.chance(0.15) ? r.pick(GLAZED) : r.pick(TERRA)), 0.05, r));
  b.t('dirt').cyl(x, y + h - 0.02, z, pr * 0.92, pr * 0.92, 0.03, 8, col(0x4a3a2a));
  plant(b, opt.kind || r.weighted(POTTED), x, y + h - 0.03, z, pr * r.range(2.6, 3.4), r);
  return y + h;
}
// a row of plants along a box (flower box, raised bed): from a to b at height y
export function plantRow(b, r, ax, az, bx, bz, y, s, kinds, step = null) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / (step || s * 0.7)));
  for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; plant(b, typeof kinds === 'string' ? kinds : r.weighted(kinds), ax + (bx - ax) * t + r.range(-0.05, 0.05), y, az + (bz - az) * t + r.range(-0.05, 0.05), s * r.range(0.85, 1.15), r); }
  return b;
}
// a hanging bundle of drying herbs (upside down card) under (x, y, z)
export function herbBundle(b, r, x, y, z, s = 0.4) {
  b.t('plain').box(x, y - 0.06, z, 0.01, 0.12, 0.01, col(0x5a4a3a));
  const c = col(r.pick([0xb0a070, 0xa0a060, 0xc0a878, 0x98a068]), 0.06, r);
  for (let k = 0; k < 2; k++) { const yaw = k * Math.PI / 2 + r.next(); const cx = Math.cos(yaw) * s / 2, cz = -Math.sin(yaw) * s / 2; b.leafQuad([[x - cx, y - 0.1, z - cz], [x + cx, y - 0.1, z + cz], [x + cx, y - 0.1 - s, z + cz], [x - cx, y - 0.1 - s, z - cz]], PLANT.weed, c, [x, y - s / 2, z]); }
  return b;
}
// a climber spread flat against a wall: card centred at (x, y, z) facing (nx, nz)
export function wallClimber(b, r, x, y, z, nx, nz, w, h, kind = 'ivy') {
  const tx = nz, tz = -nx, cell = kind === 'bougainvillea' ? PLANT.bougainvillea : PLANT.ivy, o = 0.04;
  const P = (a, c2) => [x + tx * a + nx * o, y + c2, z + tz * a + nz * o];
  b.leafQuad([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], cell, tintOf(r), [x - nx, y, z - nz]);
  return b;
}
void WOOD;

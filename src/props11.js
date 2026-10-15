// Prop pass 11: farm work and selling. A roadside farm stand, produce piles (corn, squash, melons, chili, onions), a
// wooden ox plough, a spike harrow, hand tools leaning on a wall, a two-wheel sack truck, a seed / feed bin.
// Faded wood and iron; the produce keeps its colour (dusty). Front = +Z.
import * as THREE from 'three';
import { col } from './builder.js';
import { WOOD, METAL } from './palette.js';

const wood = (r) => col(r.pick([WOOD.weathered, WOOD.dark, 0x8a7a62, WOOD.fresh]), 0.06, r);
const iron = (r) => col(r.pick([METAL.rust, 0x5a4a3e, METAL.dark]), 0.06, r);
const PRODUCE = {
  corn: () => [0xc8a850, 0xb89a48, 0xd0b060, 0x9a8a50],
  squash: () => [0xc87a32, 0xb8862a, 0x8a8a4a, 0xd09a40],
  melon: () => [0x6a7a42, 0x7a8a4a, 0x8a9a5a],
  chili: () => [0x9a2a22, 0xa83a2a, 0x7a2a22, 0x6a7a32],
  onion: () => [0xc8b890, 0xb89a72, 0x9a5a5a],
  tomato: () => [0xa83a2a, 0xb84a32, 0x8a7a3a],
};
// a heap of round things on a surface at height y within w × d
function heap(b, r, kind, x, y, z, w, d, n) {
  const cs = PRODUCE[kind] ? PRODUCE[kind]() : PRODUCE.squash(), big = kind === 'melon' || kind === 'squash';
  b.t('plain');
  for (let k = 0; k < n; k++) {
    const f = Math.pow(r.next(), 0.6), u = (r.next() - 0.5) * w * (1 - f * 0.5), v = (r.next() - 0.5) * d * (1 - f * 0.5), h = f * (big ? 0.28 : 0.18);
    if (kind === 'corn') b.cyl(x + u, y + 0.04 + h, z + v, 0.035, 0.03, 0.2, 5, col(r.pick(cs), 0.06, r), Math.PI / 2, r.range(0, 3));
    else if (kind === 'chili') b.box(x + u, y + 0.02 + h * 0.5, z + v, 0.07, 0.03, 0.025, col(r.pick(cs), 0.06, r), r.range(0, 3));
    else { const s = big ? r.range(0.1, 0.16) : r.range(0.04, 0.06); b.cyl(x + u, y + s * 0.8 + h, z + v, s, s * 0.9, s * (kind === 'melon' ? 2.2 : 1.5), 7, col(r.pick(cs), 0.07, r), kind === 'melon' ? Math.PI / 2 : 0, r.range(0, 3)); }
  }
}
function basket(b, r, x, y, z, R, kind) {
  b.t('thatch').cyl(x, y + 0.11, z, R, R * 0.8, 0.22, 9, col(r.pick([0xa88a5a, 0x9a7a4a, 0xb89a62]), 0.06, r));
  if (kind) heap(b, r, kind, x, y + 0.2, z, R * 1.5, R * 1.5, Math.round(R * 40));
}
function crate(b, r, x, y, z, kind, rot = 0) {
  b.t('wood').box(x, y + 0.15, z, 0.5, 0.3, 0.36, wood(r), rot);
  if (kind) heap(b, r, kind, x, y + 0.28, z, 0.42, 0.3, 12);
}

export function addFarmProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  P.farm_stand = (b, r, o) => { // a plank table under a palm-thatch or tarp shade, baskets and crates of what's in season, a painted board
    const wc = wood(r), H = 2.0, crops = o.crops || r.pick([['corn', 'squash', 'chili'], ['melon', 'squash', 'onion'], ['tomato', 'chili', 'onion'], ['corn', 'melon', 'chili']]);
    for (const [x, z] of [[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]]) b.t('wood').box(x, H / 2, z, 0.08, H, 0.08, wc);
    if (r.chance(0.55)) { b.t('thatch'); for (let k = 0; k < 5; k++) b.box(-0.9 + k * 0.45, H + 0.06, 0, 0.5, 0.08, 2.2, col(r.pick([0xa8955f, 0x9a8650, 0xb8a46a]), 0.06, r), 0, 0.06); }
    else b.t('fabric').box(0, H + 0.03, 0, 2.4, 0.02, 2.1, col(r.pick([0x8a7a62, 0x6a705a, 0x7a6a52, 0xa89a78]), 0.06, r), 0, 0.07);
    b.t('wood').box(0, 0.8, 0.35, 2.0, 0.05, 0.8, wc); for (const [x, z] of [[-0.9, 0], [0.9, 0], [-0.9, 0.7], [0.9, 0.7]]) b.box(x, 0.4, z, 0.06, 0.8, 0.06, wc);
    crops.forEach((k, i) => basket(b, r, -0.65 + i * 0.65, 0.83, 0.35, 0.24, k));
    for (let k = 0; k < r.int(2, 4); k++) crate(b, r, r.range(-1.0, 1.0), 0, r.range(-0.8, -0.2), r.pick(crops), r.range(-0.3, 0.3));
    if (r.chance(0.6)) heap(b, r, crops[0] === 'corn' ? 'squash' : crops[0], 0.9, 0, 1.1, 0.8, 0.5, 18);
    if (r.chance(0.7)) { b.t('wood').box(-1.15, 1.45, 1.0, 0.04, 0.5, 0.9, col(r.pick([0xb8a888, 0xa89a78, 0x8a7a62]), 0.05, r), Math.PI / 2); b.t('plain').box(-1.12, 1.5, 1.0, 0.01, 0.06, 0.6, col(0x7a2a22)); }
    b.t('wood').box(0.2, 0.22, -0.55, 0.36, 0.04, 0.36, wc); for (const [x, z] of [[0.05, -0.7], [0.35, -0.7], [0.05, -0.4], [0.35, -0.4]]) b.box(x, 0.1, z, 0.03, 0.2, 0.03, wc); // stool
    return {};
  };
  L('farm_stand', 'wood');

  P.produce_pile = (b, r, o) => { // on a tarp or straw: corn, squash, melons, chili, onions
    const kind = o.kind || r.pick(['corn', 'squash', 'melon', 'chili', 'onion']), w = o.w || r.range(1.2, 2), d = o.d || r.range(0.9, 1.4);
    b.t(r.chance(0.5) ? 'fabric' : 'thatch').box(0, 0.01, 0, w + 0.3, 0.02, d + 0.3, col(r.pick([0x8a7a62, 0xb8a46a, 0x6a705a]), 0.06, r));
    heap(b, r, kind, 0, 0.02, 0, w, d, Math.round(w * d * (kind === 'melon' || kind === 'squash' ? 22 : 60)));
    return {};
  };
  L('produce_pile', 'plain');

  P.plough = (b, r, o) => { // arado: a wooden beam, a curved stilt with a handle, an iron-tipped share, lying or propped
    const wc = wood(r);
    b.t('wood').plank([0, 0.12, -0.9], [0, 0.55, 1.6], 0.08, 0.08, wc); // beam up to where the yoke was
    b.plank([0, 0.05, -0.85], [0, 0.85, -1.35], 0.06, 0.06, wc); b.box(0, 0.88, -1.38, 0.4, 0.05, 0.05, wc); // stilt + handle
    b.plank([0, 0.04, -0.95], [0, 0.04, -0.2], 0.12, 0.06, wc); // sole
    b.t('metal').plank([0, 0.05, -0.2], [0, 0.03, 0.1], 0.1, 0.04, iron(r)); // share
    return {};
  };
  L('plough', 'wood');

  P.harrow = (b, r, o) => { // rastra: a square timber frame with iron spikes, a chain to pull it, lying flat or leaning
    const wc = wood(r), s = r.range(1.2, 1.6), lean = o.lean ?? r.chance(0.35);
    b.push(lean ? new THREE.Matrix4().makeTranslation(0, s / 2 * Math.sin(1.15), -0.25).multiply(new THREE.Matrix4().makeRotationX(-1.15)) : new THREE.Matrix4());
    b.t('wood'); for (const t of [-0.5, -0.17, 0.17, 0.5]) b.box(t * s, 0.06, 0, 0.08, 0.08, s, wc); for (const t of [-0.5, 0.5]) b.box(0, 0.08, t * s, s, 0.06, 0.08, wc);
    b.t('metal'); for (const t of [-0.5, -0.17, 0.17, 0.5]) for (let k = 0; k < 4; k++) b.box(t * s, 0.01, -s / 2 + (k + 0.5) * s / 4, 0.025, 0.12, 0.025, iron(r));
    b.beam([0, 0.06, s / 2], [0.1, 0.02, s / 2 + 0.6], 0.015, 3, iron(r));
    b.pop();
    return {};
  };
  L('harrow', 'wood');

  P.tool_lean = (b, r, o) => { // hoes, a shovel, a pitchfork, a pick leaning on a wall (back = -Z on the wall)
    const n = o.count || r.int(2, 4);
    for (let k = 0; k < n; k++) {
      const x = -0.4 + k * 0.28 + r.range(-0.05, 0.05), L2 = r.range(1.2, 1.5), lean = r.range(0.22, 0.32), t = r.pick(['hoe', 'shovel', 'fork', 'pick', 'machete']);
      const top = [x + r.range(-0.08, 0.08), Math.cos(lean) * L2, 0.06], foot = [x, 0.02, 0.06 + Math.sin(lean) * L2];
      b.t('wood').plank(foot, top, 0.035, 0.035, wood(r));
      b.t('metal'); const c = iron(r);
      if (t === 'hoe') b.box(foot[0], 0.1, foot[2] + 0.06, 0.18, 0.14, 0.015, c, 0, 0.5);
      else if (t === 'shovel') b.box(foot[0], 0.14, foot[2] - 0.02, 0.22, 0.28, 0.02, c, 0, lean);
      else if (t === 'fork') for (let q = -1; q <= 1; q++) b.box(foot[0] + q * 0.05, 0.12, foot[2], 0.012, 0.25, 0.012, c, 0, lean);
      else if (t === 'pick') b.box(top[0], top[1] - 0.02, top[2], 0.5, 0.05, 0.05, c, 0, 0, 0.15);
      else b.box(top[0], top[1] + 0.25, top[2], 0.04, 0.5, 0.01, col(0xa8a8a0), 0, 0, 0.1);
    }
    return {};
  };
  L('tool_lean', 'wood');

  P.sack_truck = (b, r, o) => { // diablito: a two-wheel hand truck, tilted back, sacks of grain strapped on
    const c = iron(r), tilt = 0.35;
    b.push(new THREE.Matrix4().makeRotationX(-tilt));
    b.t('metal'); for (const s of [-1, 1]) b.box(s * 0.2, 0.65, 0, 0.03, 1.3, 0.03, c); b.box(0, 1.28, 0, 0.44, 0.03, 0.03, c); b.box(0, 0.02, 0.12, 0.42, 0.02, 0.25, c);
    for (const s of [-1, 1]) b.cyl(s * 0.27, 0.13, -0.08, 0.13, 0.13, 0.06, 10, col(0x2a2622), 0, 0, Math.PI / 2);
    b.t('fabric'); const sc = col(r.pick([0xc8b896, 0xb8a882, 0xa89a78]), 0.06, r); for (let k = 0; k < r.int(1, 3); k++) b.box(0, 0.22 + k * 0.32, 0.14, 0.4, 0.3, 0.24, sc.clone().offsetHSL(0, 0, r.range(-0.04, 0.04)));
    b.pop();
    return {};
  };
  L('sack_truck', 'metal');

  P.feed_bin = (b, r, o) => { // a lidded plank bin / an old oil drum for seed and feed, a scoop on top
    if (r.chance(0.5)) { const wc = wood(r); b.t('wood').box(0, 0.4, 0, 1.0, 0.8, 0.6, wc); b.box(0, 0.83, -0.05, 1.04, 0.05, 0.66, wc, 0, -0.08); }
    else { b.t('metal').cyl(0, 0.44, 0, 0.29, 0.29, 0.88, 12, iron(r)); b.t('wood').cyl(0, 0.9, 0, 0.3, 0.3, 0.03, 12, wood(r)); }
    b.t('metal').box(0.1, 0.95, 0.05, 0.18, 0.06, 0.1, col(0x8a8a80));
    return {};
  };
  L('feed_bin', 'wood');

  P.loading_dock = (b, r, o) => { // a raised plank / block platform along a warehouse door, a ramp, bollard posts, a sack or two
    const W = o.width || r.range(4, 6), D = 1.6, H = 0.9, stone = r.chance(0.5), c = stone ? col(r.pick([0x9a8e7e, 0x8a8070]), 0.04, r) : wood(r);
    b.t(stone ? 'block' : 'wood').box(0, H / 2, D / 2, W, H, D, c);
    if (!stone) for (let k = 0; k < Math.round(W / 0.3); k++) b.t('wood').box(-W / 2 + 0.15 + k * 0.3, H + 0.01, D / 2, 0.27, 0.03, D, wood(r));
    b.t('wood').plank([W / 2 - 0.4, H, D / 2], [W / 2 + 2.0, 0.02, D / 2], 1.1, 0.06, wood(r)); // ramp for the handcarts
    b.t('wood'); for (const x of [-W / 2 + 0.2, 0, W / 2 - 0.2]) b.box(x, H + 0.35, D - 0.08, 0.14, 0.7, 0.14, col(WOOD.dark, 0.05, r));
    b.t('metal').box(0, H - 0.1, D + 0.03, W, 0.12, 0.05, col(0x2a2622)); // a tyre-strip bumper
    b.t('fabric'); for (let k = 0; k < r.int(0, 3); k++) b.box(r.range(-W / 2 + 0.5, W / 2 - 0.5), H + 0.16, r.range(0.4, 1.2), 0.5, 0.3, 0.35, col(r.pick([0xc8b896, 0xb8a882]), 0.06, r), r.range(0, 3));
    return {};
  };
  L('loading_dock', 'wood');
}

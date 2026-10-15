// Prop pass 8: signs of life (life.js). A stack of plastic chairs, produce / bottle crates, a fire
// barrel, string lights, a bicycle, a wheelbarrow, buckets, a table under a parasol, a trash heap, a wall drain spout,
// a wall lamp, a wall water tank on a bracket. Front = +Z.
import * as THREE from 'three';
import { col } from './builder.js';
import { WOOD, METAL } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { drawGoods } from './props-temp.js';

const PLASTIC = [0xd8d4c8, 0x5f7f96, 0xa8473a, 0x4f6f5a, 0xc9a65a];

export function addLifeProps2(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);


  P.chair_stack = (b, r, o) => { // stacked plastic chairs against a wall
    const n = o.count || r.int(3, 7), c = col(r.pick(PLASTIC), 0.04, r);
    b.t('plain');
    for (let i = 0; i < n; i++) { const y = i * 0.07; b.box(0, 0.45 + y, 0, 0.46, 0.04, 0.44, c); b.box(0, 0.78 + y, -0.21, 0.46, 0.5, 0.04, c, 0.12); }
    for (const [x, z] of [[-0.21, -0.19], [0.21, -0.19], [-0.21, 0.19], [0.21, 0.19]]) b.box(x, 0.22, z, 0.035, 0.45, 0.035, c);
    return {};
  };
  L('chair_stack', 'plain');

  P.produce_crates = (b, r, o) => { // crates of produce tilted toward the street
    const n = o.count || r.int(2, 4), wc = col(r.pick([WOOD.fresh, WOOD.weathered]), 0.06, r);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.52, y = i % 2 ? 0.0 : 0.0;
      b.t('wood').box(x, 0.16 + y, 0, 0.48, 0.32, 0.36, wc); b.box(x, 0.32 + y, -0.1, 0.48, 0.18, 0.06, wc, 0, 0);
      drawGoods(b, r, x, 0.3 + y, 0.02, 0.42, 0.3, r.pick(['produce', 'produce', 'sacks', 'pottery']));
    }
    if (r.chance(0.5)) { b.t('wood'); for (let i = 0; i < 2; i++) b.box((i - 0.5) * 0.52, 0.48 + 0.16, -0.25, 0.48, 0.32, 0.36, wc); }
    return {};
  };
  L('produce_crates', 'wood');

  P.bottle_crates = (b, r, o) => { // stacked soda / beer crates, a few empties on top
    const n = o.count || r.int(3, 6), cc = col(r.pick([0xa8473a, 0xc9a65a, 0x4f6f5a, 0x5f7f96]), 0.05, r);
    for (let i = 0; i < n; i++) {
      const x = (i % 2) * 0.46 - 0.23, y = Math.floor(i / 2) * 0.27;
      b.t('plain').box(x, 0.13 + y, 0, 0.44, 0.26, 0.32, cc);
      if (i >= n - 2) for (let k = 0; k < 6; k++) b.cyl(x - 0.14 + (k % 3) * 0.14, 0.33 + y, -0.07 + Math.floor(k / 3) * 0.14, 0.03, 0.03, 0.16, 5, col(r.pick([0x3a5a3a, 0x6a4a2a, 0xd8d4c8]), 0.05, r));
    }
    return {};
  };
  L('bottle_crates', 'plain');

  P.fire_barrel = (b, r, o) => { // a drum with holes punched round it, a fire in it at night
    const c = col(r.pick([METAL.rust, METAL.rust2, 0x3a3a38]), 0.06, r);
    b.t('rust').cyl(0, 0.45, 0, 0.29, 0.29, 0.9, 10, c);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; b.t('plain').box(Math.sin(a) * 0.292, 0.3, Math.cos(a) * 0.292, 0.06, 0.06, 0.01, col(0x1a1612), a); }
    b.t('plain').cyl(0, 0.86, 0, 0.26, 0.26, 0.04, 10, col(0x2a2420));
    return { lights: [{ at: [0, 1.0, 0], color: LIGHT_COL.fire, radius: 6, intensity: 1.3, kind: 'fire', flicker: true }], emitters: [{ type: 'fire', p: [0, 0.9, 0], small: true }, { type: 'smoke', p: [0, 1.2, 0] }] };
  };
  L('fire_barrel', 'rust');
  PROP_LIGHT.fire_barrel = { electric: false };

  P.string_lights = (b, r, o) => { // bare bulbs on a wire between two poles (or a wall and a pole), along local x
    const Lx = o.length || 6, H = o.height || 2.8, pc = col(WOOD.pole, 0.05, r);
    if (o.poles !== false) for (const s of [-1, 1]) b.t('bark').cyl(s * Lx / 2, H / 2, 0, 0.05, 0.06, H, 5, pc);
    b.t('metal');
    const n = Math.max(4, Math.round(Lx / 0.8)), sag = 0.35; let prev = null;
    for (let i = 0; i <= n; i++) { const t = i / n, p = [-Lx / 2 + Lx * t, H - 0.05 - sag * 4 * t * (1 - t), 0]; if (prev) b.beam(prev, p, 0.008, 3, col(0x1a1a18)); prev = p; }
    b.ch('lamp').w(o._r ?? 9).t('plain');
    for (let i = 1; i < n; i++) { const t = i / n; b.box(-Lx / 2 + Lx * t, H - 0.13 - sag * 4 * t * (1 - t), 0, 0.06, 0.08, 0.06, 0xffe6b0); }
    b.w(-1).ch('main');
    return { lights: [{ at: [-Lx / 4, H - 0.4, 0], color: LIGHT_COL.incandescent, radius: 5, intensity: 0.7, kind: 'lamp', flicker: false }, { at: [Lx / 4, H - 0.4, 0], color: LIGHT_COL.incandescent, radius: 5, intensity: 0.7, kind: 'lamp', flicker: false }] };
  };
  L('string_lights', 'metal');
  PROP_LIGHT.string_lights = { electric: true };

  P.bicycle = (b, r, o) => { // an old bicycle leaning on a wall behind it (-Z): local x along the bike, open spoked wheels
    const c = col(r.pick([0x5f7f96, 0xa8473a, 0x3a3a38, 0x4f6f5a, METAL.rust]), 0.05, r), tc = col(0x1c1c1a), sc = col(0x8a8c8e);
    b.push(new THREE.Matrix4().makeRotationX(-(o.lean ?? 0.3))); // leaning back against the wall
    b.t('metal');
    for (const x of [-0.52, 0.52]) {
      const R = 0.31, n = 14;
      for (let k = 0; k < n; k++) { const am = ((k + 0.5) / n) * Math.PI * 2, seg = 2 * R * Math.sin(Math.PI / n) + 0.01; b.box(x + Math.cos(am) * R, 0.33 + Math.sin(am) * R, 0, seg, 0.04, 0.04, tc, 0, 0, am + Math.PI / 2); } // tyre: a ring of short boxes
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI; b.beam([x + Math.cos(a) * R * 0.95, 0.33 + Math.sin(a) * R * 0.95, 0], [x - Math.cos(a) * R * 0.95, 0.33 - Math.sin(a) * R * 0.95, 0], 0.005, 3, sc); } // spokes
      b.cyl(x, 0.33, 0, 0.035, 0.035, 0.08, 6, sc, Math.PI / 2, 0, 0); // hub
    }
    b.beam([-0.52, 0.33, 0], [-0.08, 0.36, 0], 0.02, 4, c); b.beam([-0.08, 0.36, 0], [0.38, 0.72, 0], 0.022, 4, c); b.beam([-0.52, 0.33, 0], [-0.18, 0.78, 0], 0.02, 4, c);
    b.beam([-0.18, 0.78, 0], [0.38, 0.74, 0], 0.022, 4, c); b.beam([-0.08, 0.36, 0], [-0.18, 0.78, 0], 0.02, 4, c); b.beam([0.38, 0.74, 0], [0.52, 0.33, 0], 0.02, 4, c);
    b.box(-0.2, 0.84, 0, 0.22, 0.05, 0.1, col(0x2a2622)); b.beam([0.38, 0.74, 0], [0.34, 0.98, 0], 0.016, 4, c); b.box(0.34, 0.99, 0, 0.04, 0.03, 0.5, col(0x3a3a38));
    if (r.chance(0.4)) b.t('plain').box(0.6, 0.74, 0, 0.26, 0.18, 0.24, col(r.pick([WOOD.weathered, 0x8a7a5a]), 0.05, r)); // a basket
    b.pop();
    return {};
  };
  L('bicycle', 'metal');

  P.wheelbarrow = (b, r, o) => {
    const c = col(r.pick([0x6a7a6a, METAL.rust, 0x8a8c8e, 0x5f7f96]), 0.06, r);
    b.t(r.chance(0.5) ? 'rust' : 'metal');
    b.box(0, 0.48, 0.05, 0.62, 0.05, 0.75, c); b.box(0, 0.6, 0.42, 0.62, 0.28, 0.04, c, 0.3); b.box(0, 0.6, -0.32, 0.62, 0.24, 0.04, c); for (const s of [-1, 1]) b.box(s * 0.31, 0.6, 0.05, 0.04, 0.26, 0.75, c);
    b.t('plain').cyl(0, 0.2, 0.62, 0.2, 0.2, 0.08, 12, col(0x1c1c1a), 0, 0, Math.PI / 2);
    b.t('wood'); for (const s of [-1, 1]) b.plank([s * 0.24, 0.42, 0.55], [s * 0.3, 0.55, -0.85], 0.04, 0.04, col(WOOD.weathered));
    b.box(0, 0.22, -0.3, 0.5, 0.04, 0.04, col(WOOD.weathered)); for (const s of [-1, 1]) b.box(s * 0.22, 0.2, -0.3, 0.04, 0.4, 0.04, col(WOOD.weathered));
    if (o.load ?? r.chance(0.6)) drawGoods(b, r, 0, 0.55, 0.05, 0.5, 0.6, r.pick(['sacks', 'scrap', 'produce']));
    return {};
  };
  L('wheelbarrow', 'metal');

  P.buckets = (b, r, o) => {
    const n = o.count || r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const c = col(r.pick([...PLASTIC, 0x8a8c8e]), 0.06, r), x = (i - (n - 1) / 2) * 0.36;
      b.t('plain').cyl(x, 0.17, r.range(-0.05, 0.05), 0.15, 0.12, 0.34, 9, c);
      b.cyl(x, 0.335, 0, 0.125, 0.125, 0.01, 9, col(r.chance(0.5) ? 0x4a6a6a : 0x2a2420));
    }
    return {};
  };
  L('buckets', 'plain');

  P.umbrella_table = (b, r, o) => { // a plastic table under a beer-brand style parasol (plain colours), two chairs
    const tc = col(r.pick(PLASTIC), 0.04, r), uc = col(r.pick([0xa8473a, 0xc9a65a, 0x5f7f96, 0x4f6f5a, 0xd8ccb0]), 0.05, r);
    b.t('plain'); b.box(0, 0.72, 0, 0.8, 0.04, 0.8, tc); for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) b.box(x, 0.36, z, 0.04, 0.72, 0.04, tc);
    b.t('metal').cyl(0, 1.2, 0, 0.02, 0.02, 2.0, 5, col(0x8a8c8e));
    b.t('fabric'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box(Math.sin(a) * 0.55, 2.05, Math.cos(a) * 0.55, 0.85, 0.02, 0.62, k % 2 ? uc : uc.clone().offsetHSL(0, 0, 0.12), a, 0.28); }
    for (const a of [0.6, 3.5]) { b.pushT(Math.sin(a) * 0.72, 0, Math.cos(a) * 0.72, a + Math.PI); P.chair(b, r, { color: r.pick(PLASTIC) }); b.pop(); }
    return {};
  };
  L('umbrella_table', 'plain');

  P.trash_heap = (b, r, o) => { // swept-up rubbish in a corner: bags, cans, a broken crate, paper
    const n = o.count || r.int(4, 9);
    for (let i = 0; i < n; i++) {
      const x = r.range(-0.5, 0.5), z = r.range(-0.4, 0.4), k = r.next();
      if (k < 0.35) b.t('plain').cyl(x, 0.14, z, 0.2, 0.17, 0.28, 6, col(r.pick([0x1e1e1c, 0x2a3a2a, 0x5a5a52]), 0.08, r)); // sacks
      else if (k < 0.6) b.t('plain').cyl(x, 0.05, z, 0.04, 0.04, 0.11, 5, col(r.pick([0xa8473a, 0x8a8c8e, 0xc9a65a]), 0.1, r), Math.PI / 2, r.next() * 3, 0);
      else if (k < 0.8) b.t('plain').box(x, 0.012, z, r.range(0.15, 0.3), 0.01, r.range(0.12, 0.25), col(r.pick([0xd8d4c8, 0xc8b896, 0xa89a78]), 0.06, r), r.next() * 3);
      else b.t('wood').box(x, 0.08, z, 0.4, 0.04, 0.3, col(WOOD.weathered, 0.06, r), r.next() * 3, 0.4);
    }
    return {};
  };
  L('trash_heap', 'plain');

  P.drain_spout = (b, r, o) => { // a roof drain pipe down a wall with a spout at the foot (back = -Z on the wall)
    const H = o.height || 3, c = col(r.pick([0x8a8c8e, METAL.rust, 0x6a7a6a]), 0.05, r);
    b.t('metal').box(0, H / 2, 0.06, 0.09, H, 0.09, c); b.box(0, 0.16, 0.2, 0.09, 0.07, 0.3, c);
    for (let y = 0.6; y < H; y += 1.1) b.box(0, y, 0.02, 0.14, 0.03, 0.05, col(METAL.dark));
    return {};
  };
  L('drain_spout', 'metal');

  P.wall_lamp = (b, r, o) => { // a bare bulb on a bent bracket over a side door
    const H = o.height || 2.5, c = col(METAL.dark);
    b.t('metal').box(0, H, 0.04, 0.08, 0.12, 0.03, c); b.beam([0, H, 0.04], [0, H + 0.05, 0.3], 0.012, 3, c);
    b.ch('lamp').w(o._r ?? 9).t('plain').box(0, H - 0.04, 0.3, 0.06, 0.09, 0.06, 0xfff0d0).w(-1).ch('main');
    return { lights: [{ at: [0, H - 0.1, 0.35], color: LIGHT_COL.incandescent, radius: 5, intensity: 0.8, kind: 'lamp', flicker: false }] };
  };
  L('wall_lamp', 'metal');
  PROP_LIGHT.wall_lamp = { electric: true };

  P.wall_tank = (b, r, o) => { // a black tinaco on an angle-iron wall bracket, a hose down
    const H = o.height || 2.2, c = col(METAL.dark);
    b.t('metal'); for (const s of [-1, 1]) { b.box(s * 0.35, H - 0.02, 0.35, 0.04, 0.04, 0.7, c); b.beam([s * 0.35, H - 0.6, 0.02], [s * 0.35, H - 0.02, 0.66], 0.02, 3, c); }
    b.t('plain').cyl(0, H + 0.42, 0.38, 0.38, 0.4, 0.82, 12, col(0x1a1a1a)); b.cyl(0, H + 0.86, 0.38, 0.14, 0.14, 0.06, 8, col(0x222222));
    b.beam([0.2, H, 0.6], [0.24, 0.05, 0.75], 0.018, 3, col(0x2a3a2a));
    return {};
  };
  L('wall_tank', 'plain');
}

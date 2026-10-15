// Prop pass 7: the town PA. A wooden pole with trumpet horns, a wall bracket with one or two horns (snaps to the
// nearest building wall), and a pre-war civil-defense siren on a steel post. Front = +Z.
import * as THREE from 'three';
import { col } from './builder.js';
import { WOOD, METAL } from './palette.js';
import { lathe } from './shapes.js';

const HORN_COL = [0x8c9294, 0x9a9a8a, 0x7a8a7a, 0xb8b4a0, 0x6f7a6a];
// trumpet horn: driver can at the back, flare opening along +Z, tilted down by `tilt`
function horn(b, r, x, y, z, ry, tilt, s, c) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + tilt, ry, 0, 'YXZ')), new THREE.Vector3(s, s, s));
  b.push(m);
  b.t('metal');
  lathe(b, [[0, 0], [0.085, 0.0], [0.09, 0.03], [0.09, 0.15], [0.05, 0.19], [0.055, 0.28], [0.09, 0.4], [0.15, 0.5], [0.22, 0.56], [0.24, 0.58]], c, 0, 0, 0, 12);
  b.cyl(0, 0.53, 0, 0.19, 0.19, 0.01, 10, col(0x1c1c1a)); // the dark throat seen from the front
  b.cyl(0, 0.08, 0, 0.1, 0.1, 0.05, 8, c.clone().offsetHSL(0, 0, -0.12)); // clamp ring
  b.pop();
}

export function addTownProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // pole speaker: utility pole, a crossarm, 2–4 horns facing different ways, junction box and conduit, a cable
  P.pa_pole = (b, r, o) => {
    const H = o.height || 7.2, n = o.horns || r.int(2, 4), pc = col(WOOD.pole, 0.06, r).offsetHSL(0, 0, -0.06);
    const hc = col(r.pick(HORN_COL), 0.05, r), rusty = r.chance(0.5);
    b.t('bark').beam([0, 0, 0], [0, H, 0], 0.13, 6, pc);
    b.box(0, H - 0.45, 0, 1.4, 0.12, 0.12, pc);
    b.t('metal').box(0, H - 0.45, 0, 0.16, 0.16, 0.16, col(METAL.dark));
    const yaw0 = r.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = yaw0 + (k / n) * Math.PI * 2 + r.range(-0.2, 0.2), hy = H - 0.25 + (k % 2) * 0.22;
      b.t('metal').box(Math.sin(a) * 0.12, hy, Math.cos(a) * 0.12, 0.05, 0.05, 0.28, col(METAL.dark), a);
      horn(b, r, Math.sin(a) * 0.2, hy, Math.cos(a) * 0.2, a, r.range(0.12, 0.3), r.range(0.95, 1.15), rusty && k % 2 ? hc.clone().lerp(col(METAL.rust), 0.4) : hc);
    }
    // junction box with a conduit up the pole
    b.t(rusty ? 'rust' : 'metal').box(0, 2.3, 0.17, 0.32, 0.42, 0.14, col(rusty ? METAL.rust : 0x6f7a6a, 0.05, r));
    b.t('metal').box(0, (2.5 + H - 0.5) / 2, 0.15, 0.04, H - 3.0, 0.04, col(METAL.dark));
    // cable off the top: a drooping run toward the back
    if (o.cable) {
      const L2 = o.cableLen || 6, sag = 0.8, N = 6, cc = col(0x1a1a18);
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, y0 = H - 0.4 - sag * 4 * t0 * (1 - t0), y1 = H - 0.4 - sag * 4 * t1 * (1 - t1);
        b.beam([0, y0, -0.1 - t0 * L2], [0, y1, -0.1 - t1 * L2], 0.012, 3, cc);
      }
    }
    return {};
  };
  L('pa_pole', 'bark');

  // wall speaker: a bracket plate on the wall (back = -Z), an arm out, one or two horns under the eaves
  P.pa_wall = (b, r, o) => {
    const Y = o.height || 3.6, n = o.horns || (r.chance(0.5) ? 2 : 1), hc = col(r.pick(HORN_COL), 0.05, r), mc = col(METAL.dark, 0.05, r);
    b.t('metal').box(0, Y, 0.02, 0.36, 0.5, 0.04, mc);
    b.box(0, Y + 0.05, 0.25, 0.06, 0.06, 0.46, mc);
    b.beam([0, Y - 0.22, 0.04], [0, Y + 0.02, 0.44], 0.02, 4, mc);
    if (n === 1) horn(b, r, 0, Y - 0.1, 0.42, 0, 0.3, 1, hc);
    else { horn(b, r, -0.18, Y - 0.08, 0.42, -0.5, 0.28, 0.95, hc); horn(b, r, 0.18, Y - 0.08, 0.42, 0.5, 0.28, 0.95, hc); }
    b.t('metal').box(0.14, Y / 2 + 0.1, 0.03, 0.03, Y - 0.6, 0.03, col(0x1a1a18)); // cable down the wall
    b.t(r.chance(0.5) ? 'rust' : 'metal').box(0.14, 1.5, 0.07, 0.24, 0.3, 0.1, col(r.pick([METAL.rust, 0x6f7a6a]), 0.05, r));
    return {};
  };
  L('pa_wall', 'metal');

  // pre-war civil-defense siren: steel post, a slotted rotor drum under a mushroom cap; rusted unless kept up
  P.cd_siren = (b, r, o) => {
    const H = o.height || 9, kept = o.kept ?? (o._set?.power === 'grid' && r.chance(0.6));
    const paint = kept ? col(r.pick([0xc8b048, 0x8c9294, 0x6f7f5a]), 0.05, r) : col(r.pick([METAL.rust, METAL.rust2]), 0.06, r);
    const post = col(kept ? METAL.steel : METAL.rust, 0.05, r).offsetHSL(0, 0, -0.08);
    b.t(kept ? 'metal' : 'rust').cyl(0, H / 2, 0, 0.12, 0.16, H, 8, post);
    b.cyl(0, 0.15, 0, 0.32, 0.36, 0.3, 8, col(0x8a8478)); // concrete foot
    // rotor drum with slots
    b.t(kept ? 'metal' : 'rust').cyl(0, H + 0.32, 0, 0.42, 0.42, 0.5, 14, paint);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.box(Math.sin(a) * 0.425, H + 0.32, Math.cos(a) * 0.425, 0.1, 0.32, 0.02, col(0x141412), a); }
    b.cyl(0, H + 0.05, 0, 0.3, 0.2, 0.12, 10, paint.clone().offsetHSL(0, 0, -0.08));
    // the mushroom cap
    b.t(kept ? 'metal' : 'rust');
    lathe(b, [[0.8, 0], [0.78, 0.06], [0.62, 0.2], [0.35, 0.32], [0.08, 0.38], [0, 0.39]], paint, 0, H + 0.6, 0, 14);
    b.cyl(0, H + 0.6, 0, 0.8, 0.8, 0.03, 14, paint.clone().offsetHSL(0, 0, -0.1));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; b.beam([Math.sin(a) * 0.35, H + 0.57, Math.cos(a) * 0.35], [Math.sin(a) * 0.7, H + 0.6, Math.cos(a) * 0.7], 0.015, 3, col(METAL.dark)); }
    // control box and conduit at the foot; ladder rungs part way up
    b.t('metal').box(0, 1.6, 0.2, 0.4, 0.55, 0.18, col(kept ? 0x6f7a6a : METAL.rust, 0.05, r));
    b.box(0, (2 + H) / 2, 0.13, 0.04, H - 2, 0.04, col(METAL.dark));
    for (let y = 2.6; y < H - 0.6; y += 0.4) b.box(-0.17, y, 0, 0.18, 0.03, 0.03, post);
    return {};
  };
  L('cd_siren', 'metal');
}

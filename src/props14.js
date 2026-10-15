// Prop pass 14: the good side of town. Shopfront dressing for the upscale businesses of a wealthy zone: a barber's
// pole, a tailor's dress forms, clipped topiary in glazed pots, a brass plaque on a post. Front = +Z.
import { col } from './builder.js';
import { METAL } from './palette.js';
import { LIGHT_COL } from './presets.js';

export function addUpscaleProps(P, DEF_LAYER, PROP_LIGHT) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // a barber's pole on a wall bracket: red, white and blue spiral under a glass cap
  P.barber_pole = (b, r) => {
    b.t('metal').box(0, 1.9, -0.12, 0.06, 0.06, 0.24, col(METAL.chrome)).cyl(0, 2.42, 0, 0.1, 0.1, 0.06, 10, col(METAL.chrome)).cyl(0, 1.38, 0, 0.1, 0.1, 0.06, 10, col(METAL.chrome));
    const C = [0xc83a32, 0xf0ece4, 0x2f4a8a];
    b.t('plain'); for (let i = 0; i < 9; i++) b.cyl(0, 1.45 + i * 0.105, 0, 0.075, 0.075, 0.105, 10, col(C[i % 3], 0.02, r), (i * Math.PI) / 4.5);
    return {};
  };
  L('barber_pole', 'plain');

  // a tailor's dress form on a tripod stand, a half-made jacket pinned on
  P.dress_form = (b, r) => {
    const cc = col(r.pick([0x2a2a30, 0x5a4a3a, 0x8a7a62, 0x3a4a5a, 0xa83a32]), 0.04, r);
    b.t('wood'); for (const a of [0, 2.1, 4.2]) b.box(Math.cos(a) * 0.14, 0.12, Math.sin(a) * 0.14, 0.04, 0.04, 0.3, col(0x4a3a2a), -a);
    b.t('metal').cyl(0, 0.6, 0, 0.02, 0.02, 1.0, 5, col(METAL.dark));
    b.t('fabric').cyl(0, 1.25, 0, 0.17, 0.14, 0.32, 10, cc).cyl(0, 1.5, 0, 0.2, 0.17, 0.2, 10, cc).cyl(0, 1.64, 0, 0.06, 0.12, 0.08, 8, col(0xd8ccb4));
    return {};
  };
  L('dress_form', 'fabric');

  // clipped topiary: a ball (or a cone) of box on a stem, in a glazed pot
  P.topiary = (b, r, o) => {
    const pc = col(o.color ?? r.pick([0x3f6478, 0xe8e0d0, 0x8a4a3e, 0x4a6656, 0xb09048]), 0.04, r), lc = col(r.pick([0x3e5a2c, 0x4a6a32, 0x355226]), 0.05, r);
    b.t('plain').cyl(0, 0.25, 0, 0.26, 0.2, 0.5, 12, pc).cyl(0, 0.51, 0, 0.28, 0.28, 0.04, 12, pc.clone().offsetHSL(0, 0, -0.06));
    b.t('wood').cyl(0, 0.75, 0, 0.025, 0.03, 0.5, 5, col(0x5a4632));
    b.t('plain'); if (r.chance(0.6)) b.blob(0, 1.18, 0, 0.36, 0.36, 0.36, lc, 'ico'); else b.cyl(0, 1.2, 0, 0.02, 0.32, 0.9, 8, lc);
    return {};
  };
  L('topiary', 'plain');

  // a cast-iron tree grate in a concrete surround, flush with the walk (+0.12): radial slots round the trunk, gravel in the middle
  P.tree_grate = (b, r) => {
    const y = 0.14, ic = col(r.pick([0x4a3a30, 0x3a3430, 0x5a4232]), 0.04, r), cc = col(0xa8a296, 0.03, r);
    b.t('concrete'); for (const [x, z, w, d] of [[0, 0.72, 1.6, 0.16], [0, -0.72, 1.6, 0.16], [0.72, 0, 0.16, 1.28], [-0.72, 0, 0.16, 1.28]]) b.box(x, y - 0.03, z, w, 0.08, d, cc);
    b.t('rust').box(0, y - 0.02, 0, 1.28, 0.03, 1.28, ic);
    b.t('plain'); for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; for (const rr of [0.33, 0.5]) b.box(Math.cos(a) * rr, y, Math.sin(a) * rr, 0.12, 0.012, 0.025, col(0x141210), -a); } // slots
    b.t('gravel').cyl(0, y - 0.005, 0, 0.22, 0.22, 0.02, 10, col(0x6a6560, 0.05, r));
    return {};
  };
  L('tree_grate', 'rust');

  // fairy lights: a string of small bulbs slung between two points (local x from -L/2 to L/2, at height h, sagging);
  // warm white over a garden, every colour over a café or a casino; a thin pole at each end unless it hangs off something
  P.fairy_lights = (b, r, o) => {
    const L = o.length || 6, h = o.height || 2.4, sag = o.sag ?? 0.35, n = Math.max(4, Math.round(L / 0.45)), poles = o.poles !== false;
    if (poles) { b.t('metal'); for (const x of [-L / 2, L / 2]) b.box(x, h / 2, 0, 0.05, h, 0.05, col(METAL.dark)); }
    b.t('plain'); for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, y0 = h - Math.sin(Math.PI * t0) * sag, y1 = h - Math.sin(Math.PI * t1) * sag; b.beam([-L / 2 + L * t0, y0, 0], [-L / 2 + L * t1, y1, 0], 0.006, 3, col(0x2a2a2a)); }
    const C = o.colored ? [0xff6a5a, 0xffd25a, 0x6ad06a, 0x5ab0ff, 0xd06aff, 0xffa040] : [0xfff0c0];
    b.ch('lamp').w(o._r ?? 9); for (let i = 1; i < n; i++) { const t = i / n; b.box(-L / 2 + L * t, h - Math.sin(Math.PI * t) * sag - 0.05, 0, 0.055, 0.075, 0.055, C[i % C.length]); } b.w(-1).ch('main');
    return { lights: [{ at: [0, h - sag, 0], color: o.colored ? 0xffc8a0 : LIGHT_COL.incandescent, radius: Math.min(9, 3 + L * 0.6), intensity: 0.7, kind: 'lamp', flicker: false }] };
  };
  L('fairy_lights', 'plain');
  PROP_LIGHT.fairy_lights = { electric: true };

  // a brass plaque on a short post (notary, lawyer, doctor's rooms)
  P.brass_plaque = (b, r) => {
    b.t('metal').box(0, 0.6, 0, 0.06, 1.2, 0.06, col(METAL.dark)).box(0, 1.2, 0.04, 0.42, 0.3, 0.02, col(0xb8963a, 0.04, r));
    return {};
  };
  L('brass_plaque', 'metal');
}

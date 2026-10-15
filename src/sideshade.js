// Side shade: a tarp or a ramada along a blank side wall, with tables / benches under it. Replaces the
// old cloth awnings over shop fronts (they fought the vigas, the hanging signs and the price boards).
// The wall must be blank (doors allowed, nothing else), not shared, not used by stairs / tanks / murals /
// kind dressing, and the ground beside it free (opts.free, from the world: roads, fields, props, plots).
import { col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL } from './palette.js';
import { TIER_RANK } from './finishes.js';
import { obb, obbOverlap } from './geo.js';

// kind or layout -> [odds, sides allowed, furniture]
const ELIGIBLE = {
  shop: [0.55, ['left', 'right'], 'goods'], tienda: [0.55, ['left', 'right'], 'goods'], trading: [0.4, ['left', 'right'], 'goods'],
  cantina: [0.7, ['left', 'right'], 'tables'], fonda: [0.6, ['left'], 'tables'], kiosk: [0.4, ['left', 'right'], 'bench'],
  courtyard: [0.4, ['left', 'right'], 'tables'], gallery: [0.4, ['left'], 'tables'], house: [0.16, ['left', 'right'], 'family'],
};
const TARP = [0xa8473a, 0x5f7f96, 0xc9a65a, 0x6f8a6a, 0xb8b0a0, 0x3e6a8a, 0xd8d0c0];

// decided before the walls are built, so the chosen wall is laid out blank (doors only)
export function pickShadeSide(spec, layout, finish, origin, damage, muralSide) {
  const key = layout || spec.kind || 'house', E = ELIGIBLE[key];
  if (!E || damage || spec.inhabited === false || ['ruin', 'stripped'].includes(origin) || spec.sideShade === false) return null;
  const rng = new RNG(`${spec.id}:sideshade`), rank = TIER_RANK[finish.tier] ?? 0;
  const want = spec.sideShade || spec.awning || (spec.extras || []).includes('awning') || rng.chance(E[0] + (key === 'house' ? rank * 0.06 : 0));
  if (!want) return null;
  const sides = E[1].filter((n) => !spec.party?.includes(n) && n !== muralSide);
  if (!sides.length) return null;
  return typeof spec.sideShade === 'string' && sides.includes(spec.sideShade) ? spec.sideShade : sides[rng.int(0, sides.length - 1)];
}

export function sideShade(b, c, masses, info, free) {
  const name = c.shadeSide; if (!name) return;
  const E = ELIGIBLE[c.layout || c.spec.kind || 'house'], rng = new RNG(`${c.spec.id}:sideshade:b`);
  const front = info.walls.front, used = info.sideUse || {};
  const others = (info.outlines || []).slice(1).map((o) => obb(o.x, o.z, o.w + 0.3, o.d + 0.3, o.rot));
  {
    const w = info.walls[name];
    if (!w || w.party || used[name] || w.L < 3.2) return;
    const ops = info.openings.filter((o) => o.side === name && o.main);
    if (ops.some((o) => o.type !== 'door' && o.type !== 'bigdoor')) return; // the wall carries doors only
    const vig = info.vigas?.faces.includes(name);
    const yA = Math.min(2.9, w.wallH - (vig ? 0.7 : 0.25));
    if (yA < 2.25) return;
    const len = Math.min(w.L - 0.8, 5.6), fs = front ? Math.sign(w.tx * front.nx + w.tz * front.nz) || 1 : 0;
    const uc = fs * (w.L / 2 - 0.35 - len / 2);
    const P = (u, out) => [w.x + w.tx * u + w.nx * out, w.z + w.tz * u + w.nz * out];
    const fits = (dep) => {
      const [cx, cz] = P(uc, dep / 2 + 0.2), fp = obb(cx, cz, len + 0.4, dep + 0.4, Math.atan2(w.nx, w.nz));
      if (others.some((o) => obbOverlap(fp, o, 0))) return false;
      if (!free) return true;
      for (let u = uc - len / 2; u <= uc + len / 2 + 0.01; u += 0.5) for (let o = 1.2; o <= dep + 0.45; o += 0.5) if (!free(...P(u, o))) return false;
      return true;
    };
    const dep = fits(3.0) ? 3.0 : fits(2.4) ? 2.4 : 0;
    if (!dep) return;
    build(b, c, rng, w, P, uc, len, dep, yA, ops, dep >= 2.8 ? E[2] : E[2] === 'tables' || E[2] === 'family' ? 'bench' : E[2]);
    info.shade = { ...(() => { const [x, z] = P(uc, dep / 2); return { x, z }; })(), w: len + 0.3, d: dep + 0.2, ry: Math.atan2(w.nx, w.nz), side: name };
    (info.sideUse ||= {})[name] = 1;
  }
}

function build(b, c, rng, w, P, uc, len, dep, yA, ops, furn) {
  const ry = Math.atan2(w.nx, w.nz), vern = !!c.vern || ['adobe', 'stone', 'timber'].includes(c.newMat);
  const ramada = vern && rng.chance(0.45), yP = yA - (ramada ? 0.12 : 0.4);
  const wood = col(WOOD.pole, 0.05, rng);
  // patio pad (hides the ground on slopes), ledger board on the wall
  const padC = ramada || rng.chance(0.5) ? col(0xa08a6a, 0.04, rng) : col(rng.pick([0xa8a49a, 0xb06a48]), 0.04, rng);
  { const [x, z] = P(uc, dep / 2 + 0.05); b.t(padC.r > 0.6 ? 'saltillo' : 'dirt').box(x, -0.3, z, len + 0.4, 0.68, dep + 0.2, padC, ry); }
  { const [x, z] = P(uc, 0.06); b.t('wood').box(x, yA + 0.02, z, len + 0.2, 0.14, 0.1, col(WOOD.dark, 0.05, rng), ry); }
  // posts at the outer edge (and a beam on them)
  const n = Math.max(2, Math.round(len / 2.6) + 1);
  b.t('bark');
  for (let i = 0; i < n; i++) { const u = uc - len / 2 + 0.1 + ((len - 0.2) * i) / (n - 1), [x, z] = P(u, dep); b.cyl(x, yP / 2, z, 0.06, 0.075, yP, 7, wood); }
  { const [ax, az] = P(uc - len / 2 - 0.1, dep), [bx, bz] = P(uc + len / 2 + 0.1, dep); b.t('wood').plank([ax, yP + 0.02, az], [bx, yP + 0.02, bz], 0.1, 0.12, wood); }
  const [tx, tz] = P(uc, 0.02), [ox, oz] = P(uc, dep + 0.25);
  if (ramada) { // latilla poles across, a carrizo mat on top
    const nl = Math.round(len / 0.75);
    b.t('wood'); for (let k = 0; k <= nl; k++) { const u = uc - len / 2 + (len * k) / nl, [ax, az] = P(u, 0.05), [bx, bz] = P(u, dep + 0.3); b.plank([ax, yA + 0.1, az], [bx, yP + 0.1, bz], 0.07, 0.07, col(WOOD.weathered, 0.06, rng)); }
    b.t('thatch').plank([tx, yA + 0.16, tz], [ox, yP + 0.16, oz], len + 0.1, 0.05, col(0xb09a6a, 0.05, rng));
  } else { // tarp with a hanging valance, two guy ropes
    const cloth = col(rng.pick(TARP), 0.05, rng).lerp(col(0xd8cfb8), rng.range(0.1, 0.35));
    b.t('fabric').plank([tx, yA + 0.08, tz], [ox, yP + 0.06, oz], len + 0.2, 0.04, cloth);
    const [vx, vz] = P(uc, dep + 0.27); b.box(vx, yP - 0.1, vz, len + 0.2, 0.3, 0.03, cloth.clone().offsetHSL(0, 0, -0.06), ry);
    b.t('plain'); for (const sd of [-1, 1]) { const [ax, az] = P(uc + sd * (len / 2 + 0.1), dep), [gx, gz] = P(uc + sd * (len / 2 + 0.9), dep + 0.9); b.beam([ax, yP, az], [gx, 0.02, gz], 0.008, 3, col(0x8a8070)); }
  }
  // keep doorways under it clear
  const doorU = ops.map((o) => { const u = (o.x - w.x) * w.tx + (o.z - w.z) * w.tz; return [u - o.w / 2 - 0.5, u + o.w / 2 + 0.5]; });
  const clear = (u0, u1) => doorU.every(([a, z]) => u1 <= a || u0 >= z);
  const u0 = uc - len / 2 + 0.3, u1 = uc + len / 2 - 0.3;
  if (furn === 'tables' || furn === 'family') {
    const nt = furn === 'family' ? 1 : Math.max(1, Math.floor((len - 0.4) / 2.1)), tin = rng.chance(0.5);
    for (let k = 0; k < nt; k++) {
      const u = furn === 'family' ? uc : u0 + 0.75 + ((u1 - u0 - 1.5) * (k + 0.5)) / nt;
      if (!clear(u - 0.9, u + 0.9)) continue;
      const [x, z] = P(u, dep * 0.55); table(b, x, z, rng, tin ? 'tin' : 'wood', furn === 'family' ? 4 : rng.int(2, 3));
    }
    if (furn === 'family' && rng.chance(0.6)) { const u = uc + (rng.chance(0.5) ? -1 : 1) * (len / 2 - 0.5); if (clear(u - 0.3, u + 0.3)) { const [x, z] = P(u, 0.55); b.t('metal').cyl(x, 0.2, z, 0.32, 0.26, 0.4, 10, col(rng.pick([0x9a9a92, 0x5f7f96]), 0.05, rng)); } }
    else if (rng.chance(0.6)) { const u = rng.chance(0.5) ? u0 : u1; if (clear(u - 0.3, u + 0.3)) { const [x, z] = P(u, 0.5); b.t('wood').cyl(x, 0.45, z, 0.28, 0.3, 0.9, 10, col(WOOD.dark, 0.05, rng)); } } // barrel
  } else { // bench along the wall, crates / sacks, a chair
    const bl = Math.min(1.6, len * 0.4);
    for (const u of [u0 + bl / 2, u1 - bl / 2]) {
      if (!clear(u - bl / 2, u + bl / 2)) continue;
      const [x, z] = P(u, 0.55); bench(b, x, z, ry + Math.PI / 2, rng, bl);
      if (furn === 'goods') { const [gx, gz] = P(u, 1.5); goods(b, gx, gz, ry, rng); }
      if (furn !== 'goods' || rng.chance(0.5)) break;
    }
    if (rng.chance(0.6)) { const u = uc + rng.range(-0.5, 0.5); if (clear(u - 0.3, u + 0.3)) { const [x, z] = P(u, dep * 0.6); chair(b, x, z, ry + rng.range(-0.6, 0.6) + Math.PI, col(rng.pick([WOOD.weathered, 0xa83a32, 0x2f6a8a]), 0.05, rng)); } }
  }
}

function chair(b, x, z, ry, tc) {
  b.t('wood').box(x, 0.44, z, 0.42, 0.05, 0.42, tc, ry);
  b.box(x - Math.sin(ry) * 0.2, 0.7, z - Math.cos(ry) * 0.2, 0.42, 0.5, 0.04, tc, ry);
  b.box(x, 0.22, z, 0.36, 0.44, 0.36, tc.clone().offsetHSL(0, 0, -0.12), ry);
}
function table(b, x, z, rng, kind, n) {
  const tc = kind === 'tin' ? col(rng.pick([0xc8a040, 0xa83a32, 0x2f6a8a, 0xd8d0c0]), 0.04, rng) : col(WOOD.weathered, 0.05, rng);
  b.t(kind === 'tin' ? 'metal' : 'wood').cyl(x, 0.74, z, 0.45, 0.45, 0.04, 14, tc).cyl(x, 0.37, z, 0.04, 0.05, 0.72, 6, col(METAL.dark));
  const a0 = rng.next() * Math.PI;
  for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2, cx = x + Math.cos(a) * 0.72, cz = z + Math.sin(a) * 0.72; chair(b, cx, cz, Math.atan2(x - cx, z - cz), tc); }
}
function bench(b, x, z, ry, rng, L) {
  const wc = col(rng.pick([WOOD.weathered, WOOD.dark, 0x3a5a6a]), 0.05, rng);
  b.t('wood').box(x, 0.45, z, L, 0.06, 0.4, wc, ry);
  for (const sd of [-1, 1]) b.box(x + Math.cos(ry) * sd * (L / 2 - 0.15), 0.22, z - Math.sin(ry) * sd * (L / 2 - 0.15), 0.06, 0.44, 0.36, wc, ry);
}
function goods(b, x, z, ry, rng) {
  if (rng.chance(0.5)) { // sacks
    b.t('fabric'); for (let k = 0; k < 3; k++) b.blob(x + Math.cos(ry) * (k - 1) * 0.5, 0.3, z - Math.sin(ry) * (k - 1) * 0.5, 0.48, 0.6, 0.38, col(rng.pick([0xc8b890, 0xb8a878, 0xd0c4a0]), 0.04, rng), 'ico', ry);
  } else { // crates of produce
    const wc = col(WOOD.fresh, 0.08, rng);
    for (const sd of [-0.33, 0.33]) { const cx = x + Math.cos(ry) * sd, cz = z - Math.sin(ry) * sd; b.t('wood').box(cx, 0.25, cz, 0.58, 0.5, 0.44, wc, ry); b.t('plain'); const pc = col(rng.pick([0xc83a2a, 0xe0a030, 0x6a8a3a, 0xd8c070]), 0.06, rng); for (let k = 0; k < 6; k++) b.blob(cx + rng.range(-0.2, 0.2), 0.52, cz + rng.range(-0.14, 0.14), 0.13, 0.12, 0.13, pc, 'ico'); }
  }
}

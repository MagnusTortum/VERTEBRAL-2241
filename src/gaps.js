// Gaps between buildings. Two buildings put up side by side rarely meet clean: their walls stand a hand's width to a
// metre or so apart, often not quite parallel. What people do with the slot, by its width (measured along the wall,
// so a wedge-shaped slot changes treatment along its length):
//  - under 0.5 m: filled solid — rubble / block / adobe packed in and plastered, capped against the rain
//  - 0.5 m to ~1.2 m (1.6 m when the walls aren't parallel): a covered slot — a tin roof laid across from wall to wall,
//    the open end(s) closed with a short wall or a tin sheet, a door on the end toward the street (storage, gas
//    bottles, a water drum: a "callejón tapado")
//  - wider: left open (an alley; life.js dresses those)
// Each pair of facing walls is its own owner key `gap:<a>:<b>:…`, so an edit only redoes the pairs in its box.
import { RNG } from './rng.js';

const SOLID = 0.5, MIN = 0.06;

export function placeGaps(world, region = null) {
  const S = world.spec.settlement || {};
  const inR = (x, z) => !region || (x >= region[0] && x <= region[2] && z >= region[1] && z <= region[3]);
  const ids = new Set((world.structures || []).map((s) => s.id));
  if (!region || !world.gaps) world.gaps = world.gaps && region ? world.gaps : new Map();
  for (const [k, p] of [...world.gaps]) { const f = k.split(':'); if (!region || inR(p[0], p[1]) || !ids.has(f[1]) || !ids.has(f[2])) { world.removeOwned(k); world.gaps.delete(k); } }
  if (S.gapFill === false) return;
  const T = world.terrain;
  // the walls: each mass's four sides, with the wall top (world y)
  const sides = [], grid = new Map(), CELL = 16, gk = (i, j) => i * 73856093 ^ j * 19349663;
  for (const s of world.structures || []) {
    if (!s._masses?.length || ['ruin', 'stripped'].includes(s.origin) || s._y == null) continue;
    const info = world.items?.get(s.id)?.info; if (!info) continue;
    s._masses.forEach((m, mi) => {
      const h = info.massRoof?.[mi]?.h ?? (info.height ? Math.max(info.height - 2, Math.min(info.height - 0.3, 2.3)) : 3); // shacks: low, no mass roof record if (!(h > 1.5)) return;
      const c = Math.cos(m.r), sn = Math.sin(m.r), W = (u, v) => [m.cx + u * c + v * sn, m.cz - u * sn + v * c];
      [[m.w / 2, 0, m.d], [-m.w / 2, 0, m.d], [0, m.d / 2, m.w], [0, -m.d / 2, m.w]].forEach(([ou, ov, L], si) => {
        const n0 = [ou ? Math.sign(ou) : 0, ov ? Math.sign(ov) : 0], n = [n0[0] * c + n0[1] * sn, -n0[0] * sn + n0[1] * c], mid = W(ou, ov);
        const e = { s, mi, si, mid, n, t: [n[1], -n[0]], L, top: s._y + h, base: s._y, mat: s.material || 'block' };
        sides.push(e);
        const i0 = Math.floor((mid[0] - L / 2) / CELL), i1 = Math.floor((mid[0] + L / 2) / CELL), j0 = Math.floor((mid[1] - L / 2) / CELL), j1 = Math.floor((mid[1] + L / 2) / CELL);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = gk(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }
      });
    });
  }
  // a poor street: shacks, or bare / faded self-built houses — there the wider gaps get built into too (a scrap lean-to)
  const poor = (st) => st.kind === 'shack' || ['tin_shack', 'stilt', 'cabin'].includes(st.vstyle) || st.material === 'metal' || (['none', 'faded'].includes(st._finish?.tier) && st.origin !== 'prewar' && ['house', 'shack', undefined].includes(st.kind));
  const LEAN = 4.2;
  const masses = (world.structures || []).flatMap((s) => (s._masses || []).map((m) => ({ s, m })));
  const inOtherMass = (x, z, a, b) => masses.some(({ s, m }) => { if (s === a || s === b) return false; const dx = x - m.cx, dz = z - m.cz, c = Math.cos(m.r), sn = Math.sin(m.r); return Math.abs(dx * c - dz * sn) < m.w / 2 && Math.abs(dx * sn + dz * c) < m.d / 2; });
  const done = new Set();
  for (const F of sides) {
    const near = new Set(); const i0 = Math.floor((F.mid[0] - F.L / 2 - 2) / CELL), i1 = Math.floor((F.mid[0] + F.L / 2 + 2) / CELL), j0 = Math.floor((F.mid[1] - F.L / 2 - 2) / CELL), j1 = Math.floor((F.mid[1] + F.L / 2 + 2) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const e of grid.get(gk(i, j)) || []) near.add(e);
    for (const O of near) {
      if (O.s === F.s || F.s.id > O.s.id) continue; // each pair once, F from the building with the lower id
      const cosN = F.n[0] * O.n[0] + F.n[1] * O.n[1]; if (cosN > -0.9) continue; // facing each other (within ~25°)
      const pr = (p) => [(p[0] - F.mid[0]) * F.t[0] + (p[1] - F.mid[1]) * F.t[1], (p[0] - F.mid[0]) * F.n[0] + (p[1] - F.mid[1]) * F.n[1]];
      const [ua, va] = pr([O.mid[0] - O.t[0] * O.L / 2, O.mid[1] - O.t[1] * O.L / 2]), [ub, vb] = pr([O.mid[0] + O.t[0] * O.L / 2, O.mid[1] + O.t[1] * O.L / 2]);
      if (Math.abs(ub - ua) < 0.3) continue;
      const lo = Math.max(-F.L / 2, Math.min(ua, ub)), hi = Math.min(F.L / 2, Math.max(ua, ub)); if (hi - lo < 0.8) continue;
      const g = (u) => va + ((vb - va) * (u - ua)) / (ub - ua), gl = g(lo), gh = g(hi);
      const shanty = (poor(F.s) || poor(O.s)) && (poor(F.s) && poor(O.s) || F.s.kind === 'shack' || O.s.kind === 'shack');
      if (Math.max(gl, gh) < MIN || Math.min(gl, gh) > (shanty ? LEAN : 1.6) || Math.min(gl, gh) < -0.2) continue; // touching, too wide, or overlapping
      const parallel = cosN < -0.985, WIDE = parallel ? 1.2 : 1.6;
      if (Math.min(gl, gh) >= WIDE && !shanty) continue;
      const P = (u, v) => [F.mid[0] + F.t[0] * u + F.n[0] * v, F.mid[1] + F.t[1] * u + F.n[1] * v];
      const key = `gap:${F.s.id}:${O.s.id}:${F.mi}.${F.si}:${O.mi}.${O.si}`; if (done.has(key)) continue; done.add(key);
      const um = (lo + hi) / 2, M = P(um, g(um) / 2);
      if (!inR(M[0], M[1])) continue;
      if (world.gaps.has(key)) { world.removeOwned(key); world.gaps.delete(key); }
      if (inOtherMass(M[0], M[1], F.s, O.s) || world.roadNear(M[0], M[1], 0)) continue;
      // cut the slot where its width crosses the thresholds; classify each stretch
      const cuts = [lo, hi];
      for (const t of [MIN, SOLID, WIDE]) { const u = ua + ((t - va) * (ub - ua)) / (vb - va || 1e-9); if (u > lo + 0.05 && u < hi - 0.05) cuts.push(u); }
      cuts.sort((a, b) => a - b);
      let parts = [];
      for (let i = 0; i < cuts.length - 1; i++) { const a = cuts[i], b = cuts[i + 1], w = g((a + b) / 2), k = w < MIN ? 'none' : w < SOLID ? 'solid' : w < WIDE ? 'cover' : 'open'; if (parts.length && parts[parts.length - 1].k === k) parts[parts.length - 1].b = b; else parts.push({ a, b, k }); }
      for (const p of parts) if (p.k === 'cover' && p.b - p.a < 0.8) p.k = g((p.a + p.b) / 2) < 0.8 ? 'solid' : 'open';
      if (shanty) { const rl = new RNG(`${world.seed}:${key}:lean`); for (const p of parts) if (p.k === 'open' && p.b - p.a >= 1.6 && Math.max(g(p.a), g(p.b)) <= LEAN && rl.chance(0.8)) p.k = 'lean'; }
      parts = parts.filter((p) => p.k === 'solid' || p.k === 'cover' || p.k === 'lean');
      if (!parts.length) continue;
      const lowS = F.top <= O.top ? F : O, top = Math.min(F.top, O.top), base = Math.min(F.base, O.base) - 0.4, ground = Math.max(F.base, O.base);
      const rng = new RNG(`${world.seed}:${key}`);
      world.gaps.set(key, M);
      for (const p of parts) {
        const at = P((p.a + p.b) / 2, g((p.a + p.b) / 2) / 2), y0 = T.height(at[0], at[1]);
        const loc = (q) => [+(q[0] - at[0]).toFixed(3), +(q[1] - at[1]).toFixed(3)];
        const ga = g(p.a), gb = g(p.b);
        if (p.k === 'solid') {
          const poly = [P(p.a, -0.04), P(p.b, -0.04), P(p.b, gb + 0.04), P(p.a, ga + 0.04)].map(loc);
          world.own(key, () => world.addProp({ type: 'gap_fill', at, poly, y0: base - y0, y1: top + 0.08 - y0, mat: lowS.mat, keep: true, seat: false, ground: true }, true));
        } else if (p.k === 'lean') { // a scrap lean-to built into the gap: tin from the taller wall down to the lower one,
          // the street end closed with odd panels and a curtain or plank door (or left open, junk inside), the back walled
          const hiF = F.top >= O.top, yHi = Math.min(Math.max(F.top, O.top) - 0.3, ground + rng.range(2.5, 2.9)) - y0, yLo = Math.max(ground + 1.9, Math.min(Math.min(F.top, O.top) - 0.2, yHi + y0 - 0.5)) - y0;
          const vHi = (u) => (hiF ? -0.02 : g(u) + 0.02), vLo = (u) => (hiF ? g(u) + 0.02 : -0.02);
          const road = (u) => { const q = P(u, g(u) / 2); for (const r of [2, 5, 9, 14, 25]) if (world.roadNear(q[0], q[1], r)) return r; return 99; };
          const fu = road(p.a) <= road(p.b) ? p.a : p.b, bu = fu === p.a ? p.b : p.a, out = fu === p.a ? -0.25 : 0.25; // the street end, a little overhang there
          const roof = [[P(fu + out, vHi(fu)), yHi], [P(bu, vHi(bu)), yHi], [P(bu, vLo(bu)), yLo], [P(fu + out, vLo(fu)), yLo]].map(([q, yy]) => [...loc(q), yy]);
          const front = { a: loc(P(fu, -0.02)), b: loc(P(fu, g(fu) + 0.02)), open: rng.chance(0.3), door: rng.pick(['curtain', 'curtain', 'planks', 'tin']) };
          const back = { a: loc(P(bu, -0.02)), b: loc(P(bu, g(bu) + 0.02)) }, inside = loc(P((fu + bu) / 2, g((fu + bu) / 2) / 2));
          world.own(key, () => world.addProp({ type: 'gap_shack', at, roof, y0: base - y0, front, back, inside, keep: true, seat: false, ground: true }, true));
          for (let u = p.a + 0.3; u <= p.b - 0.3; u += 0.6) { const q = P(u, g(u) / 2), rr = g(u) / 2; world.raster?.circle(q[0], q[1], rr); world.hard?.circle(q[0], q[1], rr); } // nothing else grows or gets set down in it
        } else {
          const yR = Math.min(top - 0.25, ground + rng.range(2.6, 3.0)) - y0;
          const roof = [P(p.a - 0.1, -0.02), P(p.b + 0.1, -0.02), P(p.b + 0.1, gb + 0.02), P(p.a - 0.1, ga + 0.02)].map(loc);
          // the ends that open onto something: the slot's mouths, or where it widens into an alley
          const ends = [];
          const idx = parts.indexOf(p), prev = parts[idx - 1], next = parts[idx + 1];
          if (!(prev && prev.b >= p.a - 0.01 && prev.k === 'solid')) ends.push([p.a, ga]);
          if (!(next && next.a <= p.b + 0.01 && next.k === 'solid')) ends.push([p.b, gb]);
          const road = (u, w) => { const q = P(u, w / 2); let best = 1e9; for (const r of [2, 5, 9, 14]) if (world.roadNear(q[0], q[1], r)) { best = r; break; } return best; };
          const doorEnd = ends.length ? ends.reduce((a, b) => (road(...a) <= road(...b) ? a : b)) : null;
          const closes = ends.map(([u, w]) => ({ a: loc(P(u, -0.02)), b: loc(P(u, w + 0.02)), door: doorEnd && u === doorEnd[0] && w >= 0.7 && rng.chance(0.85), tin: rng.chance(0.45) }));
          world.own(key, () => world.addProp({ type: 'gap_roof', at, roof, y: yR, y0: base - y0, closes, mat: lowS.mat, keep: true, seat: false, ground: true }, true));
        }
      }
    }
  }
}

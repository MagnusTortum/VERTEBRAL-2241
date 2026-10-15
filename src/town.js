// Town-scale passes that run after buildings exist: lived-in alleys between close buildings, and
// security (checkpoints on the entry roads, watchtowers on the edge).
import { RNG, deg } from './rng.js';
import { toWorld, toLocal, sampleAt, pathLength, nearestWithin } from './geo.js';
import { classOf, densityField } from './layout.js';

// ------------------------------------------------------------------ alleys
// Two buildings side by side with a 1.2–4.5 m gap (parallel walls, overlapping for ≥3 m) get the
// alley treatment: washing strung wall to wall, a tarp, cables where there's power, and stoop life
// (chairs, a small table, pots, water jugs, crates). Doorways stay clear (props push out of them).
export function planAlleys(world) {
  const S = world.spec.settlement || {};
  if (S.alleys === false) return;
  const rng = new RNG(`${world.seed}:alleys`);
  const list = world.structures.filter((s) => s.auto && !['ruin', 'stripped'].includes(s.origin) && !s._sub && (s._density ?? 0) > 0.2 && s._masses?.length === 1);
  const done = new Set();
  const powered = ['some', 'grid'].includes(S.power) ? 0.6 : S.power === 'scarce' ? 0.2 : 0;
  let count = 0;
  for (const A of list) {
    const ma = A._masses[0], ra = deg(A.rot);
    for (const B of list) {
      if (A === B || done.has(B.id + '|' + A.id)) continue;
      const mb = B._masses[0];
      if (Math.hypot(ma.cx - mb.cx, ma.cz - mb.cz) > (ma.w + mb.w) / 2 + 6) continue;
      let dr = (((B.rot - A.rot) % 90) + 90) % 90; if (dr > 45) dr -= 90;
      if (Math.abs(dr) > 8) continue;
      const turned = Math.abs((((B.rot - A.rot) % 180) + 180) % 180 - 90) < 10;
      const bwHalf = (turned ? mb.d : mb.w) / 2, bdHalf = (turned ? mb.w : mb.d) / 2;
      const [lx, lz] = toLocal(mb.cx - ma.cx, mb.cz - ma.cz, ra);
      const gap = Math.abs(lx) - ma.w / 2 - bwHalf;
      if (gap < 1.2 || gap > 4.5) continue;
      const z0 = Math.max(-ma.d / 2, lz - bdHalf), z1 = Math.min(ma.d / 2, lz + bdHalf);
      if (z1 - z0 < 3) continue;
      done.add(A.id + '|' + B.id);
      const sx = Math.sign(lx), ax = sx * (ma.w / 2 + gap / 2);
      const W = (x, z) => { const [wx, wz] = toWorld(x, z, ra); return [ma.cx + wx, ma.cz + wz]; };
      const rotAcross = A.rot + 90, rotAlong = A.rot;
      const hTop = 3.0 * Math.min(A.floors || 1, B.floors || 1) - 0.3;
      const P = (type, x, z, opts = {}) => world.addProp({ type, at: W(x, z), rot: opts.rot ?? rotAlong, keep: 'doors', seat: opts.seat, ...opts }, true);
      const lines = Math.max(1, Math.floor((z1 - z0) / 3.5));
      for (let i = 0; i < lines; i++) {
        const z = z0 + ((i + 0.5) * (z1 - z0)) / lines + rng.range(-0.6, 0.6);
        if (rng.chance(0.65)) P('alley_line', ax, z, { length: gap + 0.2, height: Math.min(hTop, rng.range(2.5, 3.2)), rot: rotAcross, seat: false });
        else if (rng.chance(0.4)) P('alley_tarp', ax, z, { length: gap + 0.1, depth: rng.range(2, 3), height: Math.min(hTop, 2.9), rot: rotAcross, seat: false });
      }
      if (rng.chance(powered)) P('cables', ax, (z0 + z1) / 2 + rng.range(-1, 1), { length: gap + 0.3, height: hTop + 0.2, rot: rotAcross, seat: false });
      // stoop life along one wall
      const wallX = sx * (ma.w / 2 + 0.45);
      const farX = sx * (ma.w / 2 + gap - 0.45);
      const stuff = rng.int(2, 5);
      for (let k = 0; k < stuff; k++) {
        const x = rng.chance(0.5) ? wallX : farX, z = rng.range(z0 + 0.5, z1 - 0.5);
        const t = rng.weighted({ pot_plant: 4, chair: 2.5, water_jugs: 1.5, crates: 1, barrel: 1, cafe_table: gap > 2.4 ? 1.2 : 0 });
        P(t, x, z, { rot: rotAlong + (x === wallX ? -90 : 90) * sx + rng.range(-20, 20), count: t === 'crates' ? 2 : undefined });
      }
      if (++count > (S.maxAlleys ?? 60)) return;
    }
  }
}

// ------------------------------------------------------------------ security
// settlement.security: 'none' | 'low' | 'mid' | 'high'
//  low:  checkpoint (shack, pole barrier, sandbags, lantern) where each through-road enters town
//  mid:  + jersey-barrier chicane, a watchtower at each checkpoint, 2 more towers on the edge
//  high: + spotlight towers, tank traps and wire off the road shoulders, 4 edge towers
export function planSecurity(world) {
  const S = world.spec.settlement || {};
  const lvl = { none: 0, low: 1, mid: 2, high: 3 }[S.security || 'none'];
  if (!lvl || !S.core) return;
  const rng = new RNG(`${world.seed}:security`);
  const field = densityField(world.spec, world.seed);
  const T = world.terrain;
  const placeP = (p) => world.addProp({ keep: 'doors', ...p }, true);
  const entries = [];
  for (const road of world.roads) {
    const cls = classOf(road);
    if (!['arterial', 'main'].includes(cls) || road._gate) continue;
    const L = pathLength(road.samples);
    // walk from the densest point outward both ways; checkpoint where the town thins out
    let best = 0, bs = 0;
    for (let s = 0; s < L; s += 4) { const p = sampleAt(road.samples, s); const d = field(p.x, p.z); if (d > best) { best = d; bs = s; } }
    if (best < 0.2) continue;
    for (const dir of [1, -1]) {
      for (let s = bs; s > 0 && s < L; s += 4 * dir) {
        const p = sampleAt(road.samples, s);
        if (field(p.x, p.z) < (S.checkpointAt ?? 0.1)) {
          if (!T.inBounds(p.x, p.z, 12)) break;
          entries.push({ road, s, p, dir });
          break;
        }
      }
    }
  }
  if (S.checkpoints) for (const c of S.checkpoints) { const road = world.roads.find((r) => r.id === c.road); if (road) entries.push({ road, s: c.s ?? pathLength(road.samples) * c.at, p: sampleAt(road.samples, c.s ?? pathLength(road.samples) * c.at), dir: c.dir || 1 }); }
  entries.forEach((e, i) => {
    const { road, p, dir } = e, hw = road.hw;
    const nx = -p.tz, nz = p.tx; // left of travel
    const along = (Math.atan2(p.tx, p.tz) * 180) / Math.PI;
    const W = (u, v) => [p.x + nx * u + p.tx * v * dir, p.z + nz * u + p.tz * v * dir];
    const side = rng.chance(0.5) ? 1 : -1;
    const id = `checkpoint-${i + 1}`;
    placeP({ id, name: 'Checkpoint', type: 'guard_shack', at: W(side * (hw + 3.2), 0), rot: along + (side > 0 ? 90 : -90), stats: { owner: S.guard || 'Town guard', occupants: ['1–2 guards on duty'], condition: 'Manned day and night', gm_notes: ['Travellers are asked their business and pointed to the visitors\' area'] } });
    placeP({ type: 'barrier', at: W(side * (hw + 0.3), 1.5), rot: along + (side > 0 ? 180 : 0), length: hw * 1.05, open: rng.chance(0.6) });
    placeP({ type: 'sandbags', at: W(side * (hw + 3.0), -2.6), rot: along + (dir > 0 ? 180 : 0), length: 3.4, rows: 3 });
    placeP({ type: 'sandbags', at: W(-side * (hw + 1.8), -1.5), rot: along + (dir > 0 ? 180 : 0), length: 2.6, rows: 2 });
    placeP({ type: 'lantern', at: W(side * (hw + 1.2), -0.5), essential: true });
    if (lvl >= 2) {
      placeP({ type: 'jersey_barrier', at: W(-hw * 0.45, -9), rot: along + 90 });
      placeP({ type: 'jersey_barrier', at: W(hw * 0.45, -15), rot: along + 90 });
      placeP({ type: 'watchtower', at: W(side * (hw + 7.5), 4), rot: along + (dir > 0 ? 180 : 0), name: 'Watchtower', height: 6.5 });
    }
    if (lvl >= 3) {
      placeP({ type: 'spotlight_tower', at: W(-side * (hw + 4), 3), rot: along + (dir > 0 ? 180 : 0) });
      for (let k = 0; k < 4; k++) placeP({ type: rng.chance(0.5) ? 'tank_trap' : 'wire_coil', at: W((k % 2 ? 1 : -1) * (hw + rng.range(5, 12)), -rng.range(6, 20)), rot: along + rng.range(-30, 30), length: 6 });
    }
  });
  // towers on the edge, facing out
  const towers = lvl >= 3 ? 4 : lvl >= 2 ? 2 : 0;
  const core = S.core;
  for (let k = 0, tries = 0; k < towers && tries < 80; tries++) {
    const a = rng.next() * Math.PI * 2;
    let x = core[0], z = core[1];
    for (let r = 10; r < 400; r += 4) { x = core[0] + Math.sin(a) * r; z = core[1] + Math.cos(a) * r; if (field(x, z) < 0.14) break; }
    if (!T.inBounds(x, z, 10) || world.blocked(x, z, 3) || world.roadNear(x, z, 3)) continue;
    placeP({ type: 'watchtower', name: 'Watchtower', at: [x, z], rot: (a * 180) / Math.PI, height: rng.range(5.5, 8) });
    world.raster.circle(x, z, 3);
    k++;
  }
}

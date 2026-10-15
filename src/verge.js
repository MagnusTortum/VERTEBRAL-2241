// Verge fill: the leftover ground between plots (fence-to-fence slivers, strips between a plot and the road, odd
// corners) gets what grows and collects there — weeds and dry grass along the fences, tumbleweed caught against them,
// big overgrowth mounds, brambles, tree tobacco and castor bean, nopal and maguey, now and then a tree (pirul,
// tamarisk, mesquite, fan palm, eucalyptus by fields), pockets of trash, an old tyre, a burned patch; wider
// strips a palm clump or a dumped hulk, and a worn shortcut path when the strip links two streets.
// Greener near fields, more trash in poor towns / busy places, dustier along roads. Stable per 8 m tile (own key
// `verge:<i>,<j>`), so an edit only redoes the tiles in its box.
import { RNG } from './rng.js';
import { pointInPoly } from './geo.js';

const RES = 1, TILE = 8, MAXW = 8;
// occupancy codes
const FREE = 0, PLOT = 1, ROAD = 2, SOLID = 3;

export function placeVerges(world, region0 = null) {
  // an edit redoes whole tiles: grow the box to the tile grid
  const region = region0 && [Math.floor(region0[0] / TILE) * TILE, Math.floor(region0[1] / TILE) * TILE, Math.ceil(region0[2] / TILE) * TILE - 0.001, Math.ceil(region0[3] / TILE) * TILE - 0.001];
  const spec = world.spec, plots = (spec.plots || []).filter((p) => p.poly?.length >= 3);
  world.verges = region ? (world.verges || []).filter((v) => !inBox(v.x, v.z, region, 0)) : [];
  if (plots.length < 2 && !(world.roads || []).length) return;
  if (spec.settlement?.verges === false) return;
  const T = world.terrain, W = T.W, D = T.D, x0 = -W / 2, z0 = -D / 2, nx = Math.ceil(W / RES), nz = Math.ceil(D / RES);
  // the plotted area only (plus a margin): nothing to fill out in the open desert
  let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const p of plots) for (const [x, z] of p.poly) { bx0 = Math.min(bx0, x); bz0 = Math.min(bz0, z); bx1 = Math.max(bx1, x); bz1 = Math.max(bz1, z); }
  if (!isFinite(bx0)) return;
  bx0 -= 10; bz0 -= 10; bx1 += 10; bz1 += 10;
  if (region) { bx0 = Math.max(bx0, region[0] - 12); bz0 = Math.max(bz0, region[1] - 12); bx1 = Math.min(bx1, region[2] + 12); bz1 = Math.min(bz1, region[3] + 12); if (bx1 < bx0 || bz1 < bz0) return; }
  const i0 = Math.max(0, Math.floor((bx0 - x0) / RES)), j0 = Math.max(0, Math.floor((bz0 - z0) / RES)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / RES)), j1 = Math.min(nz - 1, Math.ceil((bz1 - z0) / RES));
  const gw = i1 - i0 + 1, gd = j1 - j0 + 1, G = new Uint8Array(gw * gd);
  const cx = (i) => x0 + (i + i0 + 0.5) * RES, cz = (j) => z0 + (j + j0 + 0.5) * RES;
  const set = (x, z, v) => { const i = Math.floor((x - x0) / RES) - i0, j = Math.floor((z - z0) / RES) - j0; if (i >= 0 && j >= 0 && i < gw && j < gd && G[j * gw + i] < v) G[j * gw + i] = v; };
  // plots (and the fields / areas drawn on the map) count as taken
  const polys = [...plots.map((p) => p.poly), ...(spec.fields || []).filter((f) => f.poly && !f._plot).map((f) => f.poly), ...(world.areas || []).filter((a) => a.poly).map((a) => a.poly)];
  for (const P of polys) {
    let a0 = Infinity, c0 = Infinity, a1 = -Infinity, c1 = -Infinity; for (const [x, z] of P) { a0 = Math.min(a0, x); c0 = Math.min(c0, z); a1 = Math.max(a1, x); c1 = Math.max(c1, z); }
    for (let z = Math.max(c0, bz0); z <= Math.min(c1, bz1); z += RES) for (let x = Math.max(a0, bx0); x <= Math.min(a1, bx1); x += RES) if (pointInPoly(x, z, P)) set(x, z, PLOT);
  }
  for (const r of world.roads || []) { if (!r.samples) continue; const hw = (r.hw || 3) + (r.frontage || 0) + 0.4; for (const s of r.samples) for (let dz = -hw; dz <= hw; dz += RES) for (let dx = -hw; dx <= hw; dx += RES) if (dx * dx + dz * dz <= hw * hw) set(s.x + dx, s.z + dz, ROAD); }
  // buildings: those standing on their own (not in a plot) keep a yard round them — ruins most of all
  const inPlotAt = (x, z) => plots.some((p) => pointInPoly(x, z, p.poly));
  for (const s of world.structures || []) { const own = !(s._masses || []).some((m) => inPlotAt(m.cx, m.cz)), ruin = ['ruin', 'stripped'].includes(s.origin), pad = own ? (ruin ? 4 : 2.5) : 0.5;
    for (const m of s._masses || []) { const c = Math.cos(m.r), sn = Math.sin(m.r), R = Math.hypot(m.w, m.d) / 2 + pad;
      for (let z = m.cz - R; z <= m.cz + R; z += RES) for (let x = m.cx - R; x <= m.cx + R; x += RES) { const dx = x - m.cx, dz = z - m.cz; if (Math.abs(dx * c - dz * sn) <= m.w / 2 + pad && Math.abs(dx * sn + dz * c) <= m.d / 2 + pad) set(x, z, SOLID); } } }
  for (const l of world.lots || []) if (l.poly && l.use === 'ruin') { let a0 = Infinity, c0 = Infinity, a1 = -Infinity, c1 = -Infinity; for (const [x, z] of l.poly) { a0 = Math.min(a0, x); c0 = Math.min(c0, z); a1 = Math.max(a1, x); c1 = Math.max(c1, z); }
    for (let z = Math.max(c0, bz0); z <= Math.min(c1, bz1); z += RES) for (let x = Math.max(a0, bx0); x <= Math.min(a1, bx1); x += RES) if (pointInPoly(x, z, l.poly)) set(x, z, SOLID); }
  // alleys (life.js, placed first) win: their slot between the two buildings stays a lane, no verge in it
  for (const al of world.alleys || []) { const [ax, az] = al.a, [bx, bz] = al.b, L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L, hw = (al.g || 2) / 2 + 0.6;
    for (let u = -1.5; u <= L + 1.5; u += RES * 0.5) for (let v = -hw; v <= hw; v += RES * 0.5) set(ax + tx * u - tz * v, az + tz * u + tx * v, SOLID); }
  // ground painted by hand (and the Clear brush): the verge stays off it
  for (const p of spec.paint || []) {
    if (p.kind === 'busier' || p.kind === 'quieter') continue;
    if (p.poly) { let a0 = Infinity, c0 = Infinity, a1 = -Infinity, c1 = -Infinity; for (const [x, z] of p.poly) { a0 = Math.min(a0, x); c0 = Math.min(c0, z); a1 = Math.max(a1, x); c1 = Math.max(c1, z); }
      for (let z = Math.max(c0, bz0); z <= Math.min(c1, bz1); z += RES) for (let x = Math.max(a0, bx0); x <= Math.min(a1, bx1); x += RES) if (pointInPoly(x, z, p.poly)) set(x, z, SOLID); }
    else if (p.path) { const hw = (p.width || 2) / 2 + 0.3; for (let k = 0; k < p.path.length - 1; k++) { const [ax, az] = p.path[k], [qx, qz] = p.path[k + 1], L = Math.hypot(qx - ax, qz - az) || 1;
      for (let u = 0; u <= L; u += RES * 0.5) for (let v = -hw; v <= hw; v += RES * 0.5) set(ax + ((qx - ax) * u) / L - ((qz - az) * v) / L, az + ((qz - az) * u) / L + ((qx - ax) * v) / L, SOLID); } }
    else if (p.at) { const r = (p.r || 3) + 0.3; for (let z = p.at[1] - r; z <= p.at[1] + r; z += RES * 0.5) for (let x = p.at[0] - r; x <= p.at[0] + r; x += RES * 0.5) if ((x - p.at[0]) ** 2 + (z - p.at[1]) ** 2 <= r * r) set(x, z, SOLID); }
  }
  for (const e of spec.vegetation?.erase || []) { const r = e.r; for (let z = e.at[1] - r; z <= e.at[1] + r; z += RES * 0.5) for (let x = e.at[0] - r; x <= e.at[0] + r; x += RES * 0.5) if ((x - e.at[0]) ** 2 + (z - e.at[1]) ** 2 <= r * r) set(x, z, SOLID); }
  const at = (i, j) => (i < 0 || j < 0 || i >= gw || j >= gd ? -1 : G[j * gw + i]);
  // each free cell: the narrowest span across it (4 directions) and what bounds it
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const cells = [];
  for (let j = 0; j < gd; j++) for (let i = 0; i < gw; i++) {
    if (G[j * gw + i] !== FREE) continue;
    const x = cx(i), z = cz(j);
    if (region && !inBox(x, z, region, 0)) continue;
    let best = null;
    for (const [di, dj] of DIRS) {
      const step = Math.hypot(di, dj) * RES; let a = 0, b = 0, ha = -1, hb = -1;
      for (let k = 1; k <= MAXW / step + 1; k++) { const v = at(i + di * k, j + dj * k); if (v !== FREE) { ha = v; break; } a++; }
      for (let k = 1; k <= MAXW / step + 1; k++) { const v = at(i - di * k, j - dj * k); if (v !== FREE) { hb = v; break; } b++; }
      if (ha <= 0 || hb <= 0) continue; // open on a side
      const w = (a + b + 1) * step;
      if (w > MAXW) continue;
      if (ha !== PLOT && hb !== PLOT) continue; // a verge touches at least one plot
      if (!best || w < best.w) best = { w, road: ha === ROAD || hb === ROAD, t: [di, dj], edge: Math.min(a, b) * step };
    }
    if (best) cells.push({ x, z, ...best });
  }
  if (!cells.length) return;
  // context
  const S = spec.settlement || {}, poor = ['dead_broke', 'poor', 'struggling'].includes(S.wealth), rich = ['comfortable', 'prosperous', 'wealthy', 'rich'].includes(S.wealth);
  const life = Math.max(0, Math.min(2, spec.activity ?? 1));
  const fieldsNear = (spec.fields || []).filter((f) => f.poly && ['field', 'orchard', 'garden', 'vineyard'].includes(f.type));
  const green = (x, z) => fieldsNear.some((f) => { const c = f.poly.reduce((a, q) => [a[0] + q[0] / f.poly.length, a[1] + q[1] / f.poly.length], [0, 0]), r = Math.max(...f.poly.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))); return Math.hypot(x - c[0], z - c[1]) < r + 10; });
  const TREES = new Set(['mesquite', 'pepper_tree', 'eucalyptus', 'tamarisk', 'fruit_tree', 'fan_palm', 'date_palm', 'palo_verde', 'elephant_tree', 'cardon']);
  const trees = [];
  for (const q of world.flora.entries()) if (TREES.has(q.sp) && !String(q.e[6]).startsWith('verge')) trees.push([q.e[0], q.e[2]]);
  for (const p of [...(spec.vegetation?.plants || []), ...(world.genPlants || [])]) if (p.at && TREES.has(p.species)) trees.push(p.at);
  for (const g of spec.vegetation?.groves || []) if (g.at) trees.push(g.at);
  const treeNear = (x, z, r) => trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < r);
  // which trees come up on their own: coastal / valley towns — pirul, tamarisk, some mesquite and fan palm, eucalyptus
  // from old windbreaks by the fields; desert maps — mesquite and palo verde, palms nearly gone
  const dry = ['desert', 'coastal_desert', 'scrubland'].includes(spec.biome);
  const MIX = (wet) => dry
    ? { mesquite: 40, palo_verde: 25, tamarisk: wet ? 20 : 12, pepper_tree: 10, fan_palm: wet ? 6 : 3, eucalyptus: wet ? 4 : 1 }
    : { pepper_tree: 30, tamarisk: wet ? 37 : 25, mesquite: wet ? 10 : 15, fan_palm: wet ? 21 : 15, eucalyptus: wet ? 16 : 2, palo_verde: wet ? 2 : 5, date_palm: 1 };
  const taken = []; // big things placed this pass
  const richP = (world.spec.plots || []).filter((q) => q.zcat === 'wealthy' && q.poly), richNear = (x, z) => richP.some((q) => q.poly.some(([px, pz], i) => { const [qx, qz] = q.poly[(i + 1) % q.poly.length], dx = qx - px, dz = qz - pz, t = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - px - dx * t, z - pz - dz * t) < 6; }));
  const tiles = new Map();
  for (const c of cells) { const k = `${Math.floor(c.x / TILE)},${Math.floor(c.z / TILE)}`; if (!tiles.has(k)) tiles.set(k, []); tiles.get(k).push(c); }
  for (const [k, list] of tiles) {
    const key = `verge:${k}`;
    if (region) world.removeOwned(key);
    const rng = new RNG(`${world.seed}:${key}`), trod = rng.chance(0.4); // a worn shortcut along this stretch
    world.own(key, () => {
      for (const c of list) {
        const r = new RNG(`${world.seed}:vc:${c.x},${c.z}`), wet = green(c.x, c.z), y = T.height(c.x, c.z) - 0.03;
        const jx = c.x + r.range(-0.45, 0.45), jz = c.z + r.range(-0.45, 0.45);
        if (world.onWalk?.(c.x, c.z)) continue; // the sidewalk is swept
        if (world.raster.test(jx, jz, 0) && r.chance(0.7)) continue; // fence posts, props, walls
        const dust = c.road ? 0.55 : 1, nearFence = c.edge <= 1;
        world.verges.push({ x: c.x, z: c.z, w: c.w, road: c.road, path: trod && c.w >= 2.5 && Math.abs(c.edge - (c.w - 1) / 2) <= 0.6, ang: Math.atan2(-c.t[1], c.t[0]) });
        // ground cover: dry grass / weeds everywhere, thicker against the fences
        if (r.chance((nearFence ? 0.92 : 0.6) * dust)) world.flora.add('grass', jx, y, jz, r.range(1.2, nearFence ? 2.1 : 1.7) * (wet ? 1.15 : 1), r.next() * 6.28, r);
        if (nearFence && r.chance(0.16 * dust)) world.flora.add('tumbleweed', jx, y + 0.05, jz, r.range(0.6, 1.0), r.next() * 6.28, r);
        // brush by width
        const brush = c.w < 1.5 ? 0.14 : c.w < 4 ? 0.24 : 0.2;
        if (r.chance(brush * dust * (wet ? 1.3 : 1))) { // mostly big wild overgrowth mounds and brambles, not trees
          const big = c.w >= 1.8 && !taken.some(([qx, qz, qr]) => Math.hypot(qx - c.x, qz - c.z) < qr + 1.6);
          const sp = r.weighted(wet ? { overgrowth: big ? 3 : 0, bramble: 2, castor_bean: big ? 1.6 : 0, tree_tobacco: 1, grass: 1, sage: 1, nopal: 0.8, maguey: 0.8 } : { overgrowth: big ? 2.5 : 0, bramble: 1.6, tree_tobacco: 1.3, castor_bean: big ? 0.8 : 0, creosote: 1.6, sage: 1.4, encelia: 1, nopal: 1.2, agave: 0.6, cholla: 0.5, maguey: 0.5 });
          world.flora.add(sp, jx, y, jz, sp === 'overgrowth' ? r.range(0.8, 1.15) : r.range(0.7, 1.05), r.next() * 6.28, r);
          if (sp === 'overgrowth' || sp === 'castor_bean') taken.push([c.x, c.z, 1.4]);
        }
        // a tree / palm now and then where there's room
        if (c.w >= 2.2 && c.edge >= 0.8 && r.chance((c.w >= 4 ? 0.011 : 0.007) * dust * (wet ? 1.5 : 1)) && !treeNear(c.x, c.z, 9) && !taken.some(([qx, qz, qr]) => Math.hypot(qx - c.x, qz - c.z) < qr + 3.5)) {
          const sp = r.weighted(MIX(wet));
          world.flora.add(sp, c.x, y, c.z, r.range(0.75, 1.05), r.next() * 6.28, r); taken.push([c.x, c.z, 2]); trees.push([c.x, c.z]);
          if (sp === 'fan_palm' && c.w >= 4 && r.chance(0.2)) for (let q = 0; q < r.int(1, 2); q++) world.flora.add('fan_palm', c.x + r.range(-1.6, 1.6), y, c.z + r.range(-1.6, 1.6), r.range(0.55, 0.85), r.next() * 6.28, r);
        }
      }
      // junk: a few pockets per tile, more in poor / busy places, fewer along the road
      const n = list.length, junkK = (poor ? 1.5 : rich ? 0.45 : 1) * (0.6 + life * 0.4);
      const tries = Math.round(n / 18 * junkK + (rng.chance(0.4 * junkK) ? 1 : 0));
      for (let q = 0; q < tries; q++) {
        const c = list[rng.int(0, n - 1)]; if (c.road && rng.chance(0.75)) continue;
        if (world.onWalk?.(c.x, c.z) || richNear(c.x, c.z)) continue; // swept walks, kept fronts on the good side of town
        const t = rng.weighted({ trash_heap: c.w >= 1.6 ? 2 : 0, tires: 0.7, barrel: 0.5, bones: 0.5, rubble: 0.6, scrap_pile: c.w >= 2.5 ? 0.6 : 0, burn_pit: c.w >= 3 && !c.road ? 0.4 : 0, car_wreck: c.w >= 5 && !c.road ? 0.25 : 0 });
        const rad = t === 'car_wreck' ? 2.4 : t === 'trash_heap' || t === 'scrap_pile' ? 0.9 : 0.6;
        if (rad > c.w / 2 + 0.3 || taken.some(([qx, qz, qr]) => Math.hypot(qx - c.x, qz - c.z) < qr + rad)) continue;
        if (world.hard.test(c.x, c.z, rad * 0.5) || (world.propFoot || []).some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.r + rad * 0.8)) continue;
        taken.push([c.x, c.z, rad]);
        world.addProp({ type: t, at: [+c.x.toFixed(2), +c.z.toFixed(2)], rot: rng.int(0, 359), keep: true, seat: false, ...(t === 'tires' ? { count: rng.int(1, 3) } : t === 'burn_pit' ? { kind: 'ring' } : t === 'scrap_pile' ? { small: true } : {}) }, true);
      }
    });
  }
}
const inBox = (x, z, b, m) => x >= b[0] - m && x <= b[2] + m && z >= b[1] - m && z <= b[3] + m;

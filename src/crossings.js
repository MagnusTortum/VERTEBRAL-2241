// Arroyo crossings (built where a road's bed crosses an arroyo; the bed already keeps its level):
//   culvert — asphalt: embankment with concrete headwalls, box culverts, wing walls and guard rails
//   pipe    — gravel / dirt over a deep arroyo: masonry headwalls round a pipe or two
//   ford    — gravel / dirt over a shallow one: a concrete slab laid through the channel, depth posts
//   bridge  — tracks and paths: a timber plank bridge on pile bents, the channel open underneath
// And retaining walls / raised platforms (spec.retains).
import { Builder, col } from './builder.js';
import { RNG } from './rng.js';
import { MAT, WOOD, METAL } from './palette.js';
import { sampleAt } from './geo.js';
import * as THREE from 'three';

const CONC = 0xa8a398, CONC_D = 0x8f8a80, DARK = 0x1c1c1e;

export function buildCrossings(r, terrain, seed) {
  if (!r.cross?.length) return null;
  const b = new Builder();
  const rng = new RNG(`${seed}:cross:${r.id}`);
  for (const c of r.cross) {
    const S = r.samples[c.im], h = S.h, tx = S.tx, tz = S.tz, nx = -tz, nz = tx;
    const ry = Math.atan2(tx, tz); // local +z along the road
    const floor = terrain.base(S.x, S.z); // channel bottom (arroyo carved, no road fill)
    const W = c.hw * 2, rw = r.width + (r.shoulder || 0);
    const at = (u, v) => [S.x + nx * u + tx * v, S.z + nz * u + tz * v]; // u across the road, v along it
    if (c.mode === 'culvert' || c.mode === 'pipe') {
      const big = c.mode === 'culvert';
      const wallH = Math.max(1.2, h - floor + (big ? 0.12 : 0.06));
      const span = c.span || W + (big ? 2.5 : 1.2);
      const nOpen = big ? Math.max(1, Math.round(W / 3.4)) : (W > 7 ? 2 : 1);
      // the fill each side is held by walls (cliffs.js roadCliffs); here just the channel aprons
      b.t('concrete');
      for (const sg of [-1, 1]) { const [ax, az] = at(sg * (rw / 2 + 1.4), 0); b.box(ax, floor + 0.02, az, 2.0, 0.12, W * 0.9, col(CONC_D, 0.03, rng), ry); }
      if (big) { // guard rails along both road edges over the crossing
        const L = W + 8, rc = col(METAL.steel, 0.03, rng);
        b.t('metal');
        for (const sg of [-1, 1]) {
          const u = sg * (rw / 2 + 0.2);
          for (let v = -L / 2; v <= L / 2 + 0.01; v += 2) { const [px, pz] = at(u, v); b.box(px, h + 0.4, pz, 0.12, 0.9, 0.12, col(METAL.dark), ry); }
          const [mx, mz] = at(u - sg * 0.06, 0);
          b.box(mx, h + 0.72, mz, 0.06, 0.32, L, rc, ry);
        }
      }
    } else if (c.mode === 'ford') {
      // vado: the road dips through the wash. Dirt / gravel / paved: a concrete slab laid in the channel with a lip on
      // each edge, sand drifted over its low side; tracks and paths just run through the sand. Depth posts and VADO signs.
      const slab = !['track', 'path'].includes(r.type), L = W + 4, n = Math.ceil(L / 1.2), sw = rw + 0.6;
      if (slab) {
        b.t('concrete');
        for (let k = 0; k < n; k++) {
          const v0 = -L / 2 + (k * L) / n, v1 = -L / 2 + ((k + 1) * L) / n, [ax, az] = at(0, v0), [bx, bz] = at(0, v1);
          const ya = terrain.height(ax, az) + 0.05, yb = terrain.height(bx, bz) + 0.05, cc = col(CONC, 0.04, rng).offsetHSL(0, 0, (rng.next() - 0.5) * 0.04);
          b.plank([ax, ya, az], [bx, yb, bz], sw, 0.16, cc);
          for (const sg of [-1, 1]) { const [px, pz] = at(sg * (sw / 2 + 0.1), v0), [qx, qz] = at(sg * (sw / 2 + 0.1), v1); b.plank([px, terrain.height(px, pz) + 0.1, pz], [qx, terrain.height(qx, qz) + 0.1, qz], 0.22, 0.26, col(CONC_D, 0.04, rng)); } // the lips
        }
        b.t('plain'); // sand drifted onto the slab, a few flood cobbles
        for (let k = 0; k < Math.round(W / 1.5); k++) { const u = rng.range(-sw / 2, sw / 2), v = rng.range(-W / 2, W / 2), [x, z] = at(u, v); b.box(x, terrain.height(x, z) + 0.15, z, rng.range(0.6, 1.6), 0.05, rng.range(0.3, 0.8), col(0xb8a27e, 0.05, rng), ry + rng.range(-0.4, 0.4)); }
        b.t('rock'); for (let k = 0; k < Math.round(W / 2); k++) { const sg = rng.chance(0.5) ? 1 : -1, u = sg * rng.range(sw / 2 + 0.3, sw / 2 + 2), v = rng.range(-W / 2, W / 2), [x, z] = at(u, v); const s2 = rng.range(0.15, 0.35); b.box(x, terrain.height(x, z) + s2 * 0.3, z, s2, s2 * 0.7, s2 * 0.9, col(rng.pick([0x8a8072, 0x9a8e7c, 0x7a7266]), 0.05, rng), rng.range(0, 3)); }
      }
      // (no depth posts or warning signs: nobody's maintained those since the war)
    } else if (c.mode === 'bridge') {
      // the deck runs bank top to bank top, sitting on the ground at both ends (sloped if the banks differ)
      const gAt = (v) => { const [x, z] = at(0, v); return terrain.height(x, z); };
      const end = (sg) => {
        let gMax = -Infinity;
        for (let v = c.hw * 0.8; v <= c.hw * 2.4; v += 0.25) gMax = Math.max(gMax, gAt(sg * v));
        for (let v = c.hw * 0.8; v <= c.hw * 2.4; v += 0.25) if (gAt(sg * v) >= gMax - 0.12) return sg * (v + 0.5);
        return sg * c.hw * 2.4;
      };
      const v0 = end(-1), v1 = end(1), y0 = gAt(v0) + 0.1, y1 = gAt(v1) + 0.1, L = v1 - v0;
      const yAt = (v) => y0 + ((v - v0) / L) * (y1 - y0);
      const bw = Math.max(1.4, r.width + 0.4), wc = col(WOOD.weathered, 0.05, rng);
      const P3 = (u, v, dy = 0) => { const [x, z] = at(u, v); return [x, yAt(v) + dy, z]; };
      b.t('wood');
      // stringers, then planks across, sitting on them
      for (const u of [-bw / 2 + 0.2, 0, bw / 2 - 0.2]) b.plank(P3(u, v0 + 0.1, -0.16), P3(u, v1 - 0.1, -0.16), 0.18, 0.22, col(WOOD.dark, 0.05, rng));
      const pitch = Math.atan2(y1 - y0, L);
      for (let v = v0; v <= v1 + 0.01; v += 0.26) { const [px, py, pz] = P3(0, v); b.box(px, py, pz, bw, 0.07, 0.23, wc.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.08), ry, -pitch); }
      // pile bents down to the channel bed
      for (let v = v0 + 1.2; v <= v1 - 1.1; v += 2.8) for (const u of [-bw / 2 + 0.15, bw / 2 - 0.15]) {
        const [px, py, pz] = P3(u, v), g = terrain.height(px, pz);
        if (py - g > 0.35) b.beam([px, g - 0.3, pz], [px, py - 0.18, pz], 0.1, 6, col(WOOD.pole));
      }
      // handrails: posts + top rail
      for (const sg of [-1, 1]) {
        const u = sg * (bw / 2 - 0.05), n = Math.max(2, Math.round(L / 2));
        for (let k = 0; k <= n; k++) { const [px, py, pz] = P3(u, v0 + (k * L) / n); b.box(px, py + 0.5, pz, 0.1, 1.0, 0.1, col(WOOD.pole), ry); }
        b.plank(P3(u, v0, 0.95), P3(u, v1, 0.95), 0.1, 0.08, wc);
      }
    }
  }
  return b.build({ maxEdge: 3.2 });
}

export { RETAIN_TYPES } from './cliffs.js';

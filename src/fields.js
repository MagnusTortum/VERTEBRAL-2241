// Cultivated / worked ground: gardens, fields, orchards, vineyards, corrals, yards, plazas, graveyards.
import { RNG } from './rng.js';
import { pointInPoly, polyBounds, toLocal, toWorld } from './geo.js';
import { PAINT } from './palette.js';

const PAINTS = { garden: PAINT.tilled, field: PAINT.tilled, orchard: PAINT.packed, vineyard: PAINT.packed, corral: PAINT.packed, yard: PAINT.yard, plaza: PAINT.yard, graveyard: PAINT.packed, irrigated: PAINT.irrigated };

// f._irr (irrigation.js / water.js): true = watered from a ditch (dark damp soil, water in the furrows, full crops),
// false = dry-farmed (temporal: pale dusty soil, sparse stunted crops), undefined = the old look (no water on the map)
export function prepareField(f, terrain) {
  const dryK = f._irr === false;
  const color = f.paint ? (PAINT[f.paint] ?? f.paint) : f.fallow ? 0x9c805c : dryK && f.type === 'field' ? 0xa08463 : PAINTS[f.type] ?? PAINT.yard;
  terrain.addPaint({ type: 'poly', poly: f.poly, color, edge: f.type === 'yard' || f.type === 'plaza' ? 1.6 : 0.7, alpha: f.alpha ?? 0.95, ...(f.fallow ? { layer: 'till', layerK: 0.7 } : {}) });
  if ((f.type === 'garden' || f.type === 'field') && !dryK) {
    // irrigation ditch around the edge reads as darker damp soil
    terrain.addPaint({ type: 'poly', poly: shrink(f.poly, 0.6), color: f.type === 'garden' ? PAINT.wet : PAINT.tilled, edge: 0.4, alpha: 0.35 });
  }
  if (f._irr === true && !f.fallow && (f.type === 'field' || f.type === 'orchard')) { // water standing in the furrows
    const r = f.rows_dir != null ? (f.rows_dir * Math.PI) / 180 : longestEdgeAngle(f.poly), gap = f.type === 'orchard' ? (f.spacing || 3.8) : 1.4 * (f.rowK || 1);
    const loc = f.poly.map(([x, z]) => toLocal(x, z, r)), bb = polyBounds(loc);
    for (let lz = bb.z0 + gap * 0.5; lz < bb.z1; lz += gap) {
      const pts = []; for (let lx = bb.x0; lx <= bb.x1; lx += 1) { const [x, z] = toWorld(lx, lz, r); if (pointInPoly(x, z, shrink(f.poly, 0.8))) pts.push({ x, z }); }
      if (pts.length < 3) continue;
      const [ox, oz] = toWorld(0, 0, r), [ux, uz] = toWorld(1, 0, r), tx = ux - ox, tz = uz - oz;
      terrain.addPaint({ type: 'path', samples: pts.map((q, i) => ({ ...q, s: i, tx, tz })), width: f.type === 'orchard' ? 0.9 : 0.35, color: PAINT.wet, edge: 0.2, alpha: 0.6, layer: 'till', layerK: 0.5 });
    }
  }
}

function shrink(poly, d) {
  const [cx, cz] = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  return poly.map(([x, z]) => { const L = Math.hypot(x - cx, z - cz) || 1; return [x - ((x - cx) / L) * d, z - ((z - cz) / L) * d]; });
}

function longestEdgeAngle(poly) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L > best) { best = L; ang = Math.atan2(-(bz - az), bx - ax); }
  }
  return ang;
}

// grid of points inside polygon, rows along angle r
function rowPoints(poly, r, rowGap, step, margin, rng, jitter = 0.1) {
  const loc = poly.map(([x, z]) => toLocal(x, z, r));
  const bb = polyBounds(loc);
  const out = [];
  for (let lz = bb.z0 + margin; lz <= bb.z1 - margin; lz += rowGap) {
    for (let lx = bb.x0 + margin; lx <= bb.x1 - margin; lx += step) {
      const jx = lx + (rng.next() - 0.5) * jitter * step, jz = lz + (rng.next() - 0.5) * jitter * rowGap;
      const [x, z] = toWorld(jx, jz, r);
      if (!pointInPoly(x, z, poly)) continue;
      // keep margin from edges
      const inner = [[margin, 0], [-margin, 0], [0, margin], [0, -margin]].every(([dx, dz]) => { const [wx, wz] = toWorld(jx + dx, jz + dz, r); return pointInPoly(wx, wz, poly); });
      if (inner) out.push([x, z]);
    }
  }
  return out;
}

const CROPS = { mixed: { corn: 3, beans: 2, squash: 1.5, chili: 1.5 }, corn: { corn: 1 }, beans: { beans: 1 }, chili: { chili: 1 }, squash: { squash: 1 }, maguey: { maguey: 1 }, nopal: { nopal: 1 } };

export function buildField(f, world) {
  const rng = new RNG(`${world.seed}:field:${f.id || f.poly[0].join(',')}`);
  const T = world.terrain, flora = world.flora;
  const r = f.rows_dir != null ? (f.rows_dir * Math.PI) / 180 : longestEdgeAngle(f.poly);
  const plant = (sp, x, z, s = 1) => flora.add(sp, x, T.height(x, z) - 0.03, z, s * rng.range(0.85, 1.15), rng.next() * 6.28, rng);
  switch (f.type) {
    case 'garden': case 'field': {
      if (f.fallow) break;
      const dry = f._irr === false, wet = f._irr === true;
      const mix = CROPS[f.crop || (f.type === 'garden' ? 'mixed' : 'corn')] || CROPS.mixed;
      const gap = (f.type === 'garden' ? 1.1 : 1.4) * (f.rowK || 1), step = (f.type === 'garden' ? 0.75 : 0.9) * (f.stepK || 1);
      const rowCrop = {};
      for (const [x, z] of rowPoints(f.poly, r, gap, step, 0.7, rng)) {
        if (rng.chance(f.sparse ?? (dry ? 0.5 : wet ? 0.04 : 0.12))) continue;
        // keep each row one crop in gardens
        const [, lz] = toLocal(x, z, r);
        const row = Math.round(lz / gap);
        rowCrop[row] ||= rng.weighted(mix);
        plant(rowCrop[row], x, z, dry ? rng.range(0.55, 0.85) : wet ? 1.08 : 1);
      }
      break;
    }
    case 'orchard': {
      const sp = f.tree || 'fruit_tree';
      for (const [x, z] of rowPoints(f.poly, r, f.spacing || 3.8, f.spacing || 3.6, 1.6, rng, 0.12)) if (!rng.chance(f._irr === false ? 0.3 : 0.04)) plant(sp, x, z, f._irr === false ? rng.range(0.6, 0.85) : 1);
      break;
    }
    case 'vineyard': {
      const rows = {};
      for (const [x, z] of rowPoints(f.poly, r, 2.2, 1.2, 1, rng, 0.05)) {
        plant('vine', x, z);
        const [lx, lz] = toLocal(x, z, r), k = Math.round(lz / 2.2);
        const R = (rows[k] ||= { a: lx, b: lx, lz }); R.a = Math.min(R.a, lx); R.b = Math.max(R.b, lx);
      }
      // posts and wires down each row
      for (const R of Object.values(rows)) {
        const len = R.b - R.a + 1.0; if (len < 2) continue;
        const [x, z] = toWorld((R.a + R.b) / 2, R.lz, r);
        world.addProp({ type: 'trellis', at: [x, z], rot: (r * 180) / Math.PI, length: +len.toFixed(1), keep: true }, true);
      }
      break;
    }
    case 'graveyard': {
      const pts = rowPoints(f.poly, r, 2.6, 1.6, 1, rng, 0.25);
      for (const [x, z] of pts) if (!rng.chance(0.25)) world.addProp({ type: 'cross', at: [x, z], rot: (r * 180) / Math.PI + rng.range(-8, 8), grave: true }, true);
      break;
    }
    case 'corral': {
      for (const [sp, n] of Object.entries(f.animals || {})) {
        for (let i = 0; i < n; i++) {
          for (let tries = 0; tries < 20; tries++) {
            const bb = polyBounds(f.poly);
            const x = rng.range(bb.x0 + 2, bb.x1 - 2), z = rng.range(bb.z0 + 2, bb.z1 - 2);
            if (!pointInPoly(x, z, f.poly)) continue;
            world.addProp({ type: sp, at: [x, z], rot: rng.range(0, 360) }, true);
            break;
          }
        }
      }
      break;
    }
  }
  if (f.fence && !f.gates) f._gates ||= [{ at: +rng.next().toFixed(3), width: 3 }]; // runtime only (_: not an edit); the Gate tool copies it into the spec when it edits it
  if (f.fence) world.addFence({ id: `${f.id || 'field'}-fence`, type: f.fence, path: f.poly, closed: true, gates: f.gates || f._gates, height: f.fenceHeight, condition: f.condition });
}

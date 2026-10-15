// Roof uses on flat roofs: spec.roofGarden 'none' | 'herbs' | 'beds' | 'full' | 'security' | 'drying' (unset: auto,
// by kind and wealth). Security = sandbag nests, a wire fence on the edge, a lookout; drying = lines of washing,
// mats of chiles / corn / fish / fruit, a rack of ristras. Roof power (spec.roofPower solar | wind) is separate. Herbs = a row of pots along the parapet; beds = raised beds; full = beds under a shade
// cloth, a trellis, a water drum, a chair. Poor households grow in scrap: cut drums, tyres, tins, buckets.
import { col, Builder } from './builder.js';
import { plant as fplant, plantRow, wallClimber } from './foliage.js';
import { RNG } from './rng.js';
import * as THREE from 'three';
import { rod } from './shapes.js';
import { WOOD, METAL } from './palette.js';
import { TIER_RANK } from './finishes.js';
import { LIGHT_COL } from './presets.js';

export const ROOF_GARDENS = ['none', 'herbs', 'beds', 'full', 'security', 'drying', 'mixed', 'storage', 'room', 'catch', 'terrace', 'radio', 'smoke'];
const MAIN_ONLY = ['security', 'drying', 'mixed', 'storage', 'room', 'catch', 'terrace', 'radio', 'smoke'];
const TERRA = [0xa8643c, 0x9a5a36, 0xb87048, 0x8e4e30];
const GLAZED = [0x3f6478, 0x4a6656, 0xb09048, 0x8a4a3e, 0x3e4c62];
const LEAF = [0x4a6a32, 0x5a7a3a, 0x3e5a2c, 0x6a8a4a, 0x5a6a2a];
const FLOWER = [0xc0306a, 0xe0b030, 0xd85030, 0xf0e0d0];
const SCRAP = [0x8a3a2a, 0x2f5a8a, 0x3a6a3a, 0xc8a040, 0x6a6a68];

export function roofLevel(c, m) {
  const sp = c.spec;
  if (sp.roofGarden && ROOF_GARDENS.includes(sp.roofGarden)) return m.main || sp.roofGarden === 'none' ? sp.roofGarden : MAIN_ONLY.includes(sp.roofGarden) ? 'none' : 'herbs';
  const kind = sp.kind || 'house', rank = TIER_RANK[c.finish.tier] ?? 0, r = new RNG(`${sp.id}:roofgarden:${m.x}:${m.z}`);
  const gardenK = ['house', 'posada', 'cafe', 'shop', 'store', 'cantina', 'clinic'].includes(kind);
  if (gardenK && r.chance(0.1 + rank * 0.05)) return r.weighted({ herbs: 3, beds: 1.4 + rank * 0.3, full: 0.3 + rank * 0.35 });
  if (!m.main) return 'none';
  const sec = { comandancia: 0.6, townhall: 0.25, store: 0.14, shop: 0.1, cantina: 0.12, posada: 0.12, trade: 0.08, workshop: 0.1, garage: 0.1, house: 0.05 }[kind] || 0;
  if (r.chance(sec)) return 'security';
  const dry = { house: rank <= 1 ? 0.16 : 0.08, trade: 0.3, posada: 0.12, cafe: 0.1, store: 0.08 }[kind] || 0;
  if (r.chance(dry)) return 'drying';
  const mix = { house: 0.14, posada: 0.1, cafe: 0.08, store: 0.08, shop: 0.06, trade: 0.1 }[kind] || 0;
  if (r.chance(mix)) return 'mixed';
  // the newer uses, by kind and wealth
  const terr = { cantina: 0.3, posada: 0.22, cafe: 0.25, hall: 0.1 }[kind] || 0;
  if (r.chance(terr)) return 'terrace';
  const radio = { comandancia: 0.35, townhall: 0.25, trade: 0.15, office: 0.2, house: rank >= 3 ? 0.06 : 0.015, workshop: 0.06 }[kind] || 0;
  if (r.chance(radio)) return 'radio';
  const store = { house: rank <= 1 ? 0.14 : 0.06, workshop: 0.2, garage: 0.2, store: 0.12, shop: 0.08, trade: 0.15 }[kind] || 0;
  if (r.chance(store)) return 'storage';
  if (kind === 'house' && r.chance(rank <= 1 ? 0.08 : 0.05)) return 'room';
  if (['house', 'posada', 'clinic', 'mission'].includes(kind) && r.chance(0.07)) return 'catch';
  if (['house', 'cantina', 'posada'].includes(kind) && r.chance(0.05)) return 'smoke';
  return 'none';
}

// b is in the mass frame; iw/id = inner roof size, y = roof surface
export function roofGarden(b, c, iw, id, y, m) {
  const lvl = roofLevel(c, m);
  if (lvl === 'none' || iw < 2.4 || id < 2.4) return;
  if (lvl === 'security') return roofSecurity(b, c, iw, id, y, m);
  if (lvl === 'drying') return roofDrying(b, c, iw, id, y, m);
  if (lvl === 'mixed') return roofMixed(b, c, iw, id, y, m);
  if (lvl === 'storage') return roofStorage(b, c, iw, id, y, m);
  if (lvl === 'room') return roofRoom(b, c, iw, id, y, m);
  if (lvl === 'catch') return roofCatch(b, c, iw, id, y, m);
  if (lvl === 'terrace') return roofTerrace(b, c, iw, id, y, m);
  if (lvl === 'radio') return roofRadio(b, c, iw, id, y, m);
  if (lvl === 'smoke') return roofSmoke(b, c, iw, id, y, m);
  const rng = new RNG(`${c.spec.id}:rg:${m.x}:${m.z}`), poor = (TIER_RANK[c.finish.tier] ?? 0) <= 0;
  const x0 = -iw / 2 + 0.35, x1 = iw / 2 - 0.35, z0 = -id / 2 + 0.35, z1 = id / 2 - 0.35;
  // herb row along the front parapet and down one side
  const side = rng.chance(0.5) ? 1 : -1;
  for (let x = x0 + 0.1; x <= x1 - 0.1; x += rng.range(0.45, 0.7)) if (rng.chance(0.85)) container(b, rng, x, y, z1 - 0.05, poor, true);
  for (let z = z1 - 0.7; z >= z0 + (lvl === 'herbs' ? 0.1 : id * 0.45); z -= rng.range(0.5, 0.75)) if (rng.chance(0.75)) container(b, rng, side * (x1 - 0.05), y, z, poor, true);
  if (lvl === 'herbs') return;
  // raised beds across the back part of the roof, an aisle between
  const bl = Math.min(2.6, x1 - x0 - 1.0), nb = Math.max(1, Math.min(lvl === 'full' ? 4 : 2, Math.floor((id * 0.6) / 1.5)));
  const bx = -side * ((x1 - x0) / 2 - bl / 2 - 0.4) * (lvl === 'full' ? 0 : 1);
  const beds = [];
  for (let i = 0; i < nb; i++) {
    const z = z0 + 0.55 + i * 1.5; if (z > z1 - 1.3) break;
    beds.push(z);
    if (poor) { for (let x = bx - bl / 2 + 0.35; x <= bx + bl / 2 - 0.3; x += 0.68) scrapPlanter(b, rng, x, y, z); }
    else {
      const wc = col(rng.pick([WOOD.weathered, WOOD.fresh, 0x9a948a]), 0.05, rng), block = rng.chance(0.35);
      b.t(block ? 'block' : 'wood').box(bx, y + 0.2, z, bl, 0.4, 0.9, block ? col(0xb8b0a0, 0.03, rng) : wc);
      b.t('dirt').box(bx, y + 0.41, z, bl - 0.1, 0.02, 0.8, col(0x5a4632, 0.05, rng));
      crops(b, rng, bx - bl / 2 + 0.2, bx + bl / 2 - 0.2, y + 0.42, z, 0.8);
    }
  }
  if (lvl !== 'full' || !beds.length) return;
  // shade cloth over the beds, a trellis on the other side, a water drum and a chair
  const za = beds[0] - 0.7, zb = beds[beds.length - 1] + 0.7, xa = bx - bl / 2 - 0.25, xb = bx + bl / 2 + 0.25, H = 2.0;
  b.t('bark'); for (const [px, pz] of [[xa, za], [xb, za], [xa, zb], [xb, zb]]) b.cyl(px, y + H / 2, pz, 0.04, 0.05, H, 6, col(WOOD.pole));
  b.t('fabric').box((xa + xb) / 2, y + H, (za + zb) / 2, xb - xa + 0.2, 0.02, zb - za + 0.2, col(rng.pick([0x4a6a4a, 0x8a8a7a, 0xb8a888]), 0.04, rng), 0, 0.04);
  const tx = side * (x1 - 0.1);
  b.t('wood'); for (const pz of [z0 + 0.3, z0 + 1.9]) b.box(tx, y + 0.9, pz, 0.06, 1.8, 0.06, col(WOOD.pole));
  for (let k = 0; k < 4; k++) b.box(tx, y + 0.4 + k * 0.42, z0 + 1.1, 0.03, 0.03, 1.6, col(WOOD.pole));
  wallClimber(b, rng, tx + side * 0.03, y + 1.0, z0 + 1.1, -side, 0, 1.7, 1.8, rng.chance(0.5) ? 'bougainvillea' : 'ivy');
  b.t('plain').cyl(-side * (x1 - 0.4), y + 0.45, z1 - 0.9, 0.3, 0.3, 0.9, 12, col(poor ? 0x2f5a8a : rng.pick([0x2f5a8a, 0x2a2a28]), 0.04, rng));
  b.t('wood').box(-side * (x1 - 1.2), y + 0.42, z1 - 1.0, 0.45, 0.05, 0.45, col(WOOD.weathered)).box(-side * (x1 - 1.2), y + 0.21, z1 - 1.0, 0.4, 0.42, 0.4, col(WOOD.dark));
}

function container(b, rng, x, y, z, poor, herb) {
  if (poor) {
    const k = rng.weighted({ tin: 3, bucket: 2, drum: 0.6, tyre: 1 });
    if (k === 'tyre') { b.t('plain').cyl(x, y + 0.11, z, 0.3, 0.3, 0.22, 12, col(0x222220)); b.t('dirt').cyl(x, y + 0.2, z, 0.2, 0.2, 0.04, 10, col(0x5a4632)); plant(b, rng, x, y + 0.24, z, 0.22, herb); return; }
    const r = k === 'tin' ? 0.1 : k === 'bucket' ? 0.15 : 0.26, h = k === 'tin' ? 0.16 : k === 'bucket' ? 0.28 : 0.4;
    b.t(k === 'bucket' ? 'plain' : 'rust').cyl(x, y + h / 2, z, r, r * (k === 'bucket' ? 0.82 : 1), h, 10, col(k === 'bucket' ? rng.pick(SCRAP) : 0x8a5a3a, 0.06, rng));
    plant(b, rng, x, y + h, z, r * 1.2, herb);
    return;
  }
  const r = rng.range(0.13, 0.2), h = r * 1.7;
  b.t('plain').cyl(x, y + h / 2, z, r, r * 0.74, h, 9, col(rng.chance(0.25) ? rng.pick(GLAZED) : rng.pick(TERRA), 0.05, rng));
  plant(b, rng, x, y + h, z, r * 1.2, herb);
}
function plant(b, rng, x, y, z, r, herb) {
  fplant(b, herb ? rng.weighted({ herb: 3, chile: 1, aloe: 0.8 }) : rng.weighted({ geranium: 2, flowers: 2, marigold: 1, herb: 1, sansevieria: 0.6 }), x, y, z, r * 2.6, rng);
}
function scrapPlanter(b, rng, x, y, z) {
  if (rng.chance(0.5)) { // half drum on its side
    b.t('rust').box(x, y + 0.18, z, 0.6, 0.36, 0.85, col(rng.pick([0x8a5a3a, 0x6a4a3a, 0x2f5a8a]), 0.06, rng));
  } else { // two tyres stacked
    b.t('plain').cyl(x, y + 0.11, z, 0.32, 0.32, 0.22, 12, col(0x222220)).cyl(x, y + 0.33, z, 0.32, 0.32, 0.22, 12, col(0x262624));
  }
  b.t('dirt').box(x, y + 0.42, z, 0.5, 0.02, 0.6, col(0x5a4632));
  crops(b, rng, x - 0.2, x + 0.2, y + 0.43, z, 0.5);
}
function crops(b, rng, xa, xb, y, z, dz) {
  const kind = rng.weighted({ lettuce: 1.5, chile: 1.5, tomato: 1.2, herb: 1.2, marigold: 0.5 });
  for (const o of [-dz / 4, dz / 4]) plantRow(b, rng, xa, z + o, xb, z + o, y, kind === 'lettuce' ? 0.32 : kind === 'tomato' ? 0.55 : 0.38, kind, 0.28);
  void METAL; void LEAF; void FLOWER;
}

// ---------------------------------------------------------------- security roof
// sandbag nests at the street corners (a third at a back corner on a big roof), a rifle on the bags, an ammo box,
// a stool; a wire fence on angle posts along the street edge; a tarp over one nest; a spotlight where there's power
const SAND = [0xb8a47a, 0xa8946a, 0xc2ae84, 0x9a8a62, 0x8a8a5a];
function bags(b, rng, ax, az, bx, bz, y, courses = 3) { // a wall of bags from a to b, staggered courses
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 0.5)), ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
  b.t('fabric');
  for (let k = 0; k < courses; k++) for (let i = 0; i < n - (k % 2); i++) {
    const t = (i + 0.5 + (k % 2) * 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    b.box(x, y + 0.08 + k * 0.15, z, 0.52, 0.16, 0.32, col(rng.pick(SAND), 0.06, rng), ry + rng.range(-0.08, 0.08));
  }
}
function roofSecurity(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofsec`), tS = c._tankSide || 1, x1 = iw / 2 - 0.25, z1 = id / 2 - 0.25, leg = Math.min(2.0, iw / 2 - 0.6, id / 2 - 0.6);
  const nests = [[-1, 1], [1, 1]]; if (iw * id > 70) nests.push([-tS, -1]);
  nests.forEach(([sx, sz], k) => {
    const cx = sx * x1, cz = sz * z1;
    bags(b, rng, cx, cz, cx - sx * leg, cz, y, 4); bags(b, rng, cx, cz - sz * 0.32, cx, cz - sz * leg, y, 4);
    if (k === 0 || rng.chance(0.5)) { // the rifle on the bags, the ammo box, a stool
      b.t('metal'); const gx = cx - sx * leg * 0.5, gz = cz - sz * 0.05, gy = y + 0.66;
      b.box(gx, gy, gz, 0.05, 0.05, 1.0, col(0x2a2826), rng.range(-0.3, 0.3)); b.t('wood').box(gx, gy - 0.04, gz - sz * 0.42, 0.06, 0.1, 0.28, col(0x5a3a24), rng.range(-0.3, 0.3));
      b.t('metal').box(cx - sx * 0.9, y + 0.14, cz - sz * 0.9, 0.42, 0.28, 0.26, col(0x4a5a3a, 0.04, rng));
      b.t('wood').box(cx - sx * leg * 0.55, y + 0.25, cz - sz * 0.75, 0.32, 0.5, 0.32, col(WOOD.weathered, 0.05, rng));
    }
    if (k === 0 && rng.chance(0.65)) { // a tarp over the first nest
      const H = 1.9, tx = cx - sx * leg / 2, tz = cz - sz * leg / 2;
      b.t('wood'); for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(tx + a * leg / 2, y + H / 2, tz + e * leg / 2, 0.05, H, 0.05, col(WOOD.pole));
      b.t('fabric').box(tx, y + H, tz, leg + 0.3, 0.02, leg + 0.3, col(rng.pick([0x5a6a4a, 0x7a6a4a, 0x4a5a6a]), 0.05, rng), 0, 0.05);
    }
  });
  // wire on angle posts along the street edge
  const wc = col(0x3a3836);
  b.t('metal'); for (let x = -x1; x <= x1 + 0.01; x += (2 * x1) / Math.max(1, Math.round((2 * x1) / 1.3))) b.box(x, y + 0.75, z1 + 0.12, 0.04, 1.5, 0.04, wc, 0, 0.12);
  for (const h of [0.6, 1.0, 1.4]) b.box(0, y + h, z1 + 0.12 + h * 0.06, 2 * x1, 0.012, 0.012, wc);
  // a spotlight on a pole at the back where there's power
  if (c.powered && rng.chance(0.6)) {
    const px = -tS * (x1 - 0.3), pz = -z1 + 0.3, H = 2.4, r = c.lightR(true, true);
    b.t('metal').box(px, y + H / 2, pz, 0.07, H, 0.07, wc).box(px, y + H - 0.02, pz, 0.36, 0.04, 0.04, wc); // pole + yoke; the head is live
    const p = c.toLocal(px, y + H + 0.12, pz); c.info.lights.push({ x: p[0], y: p[1], z: p[2], color: [0.65, 0.85, 1.0], radius: 3, intensity: 1.0, kind: 'spot', r, flicker: false, search: { reach: 16, head: 0.17 } });
  }
}

// ---------------------------------------------------------------- drying roof
// lines of washing across the roof, mats of chiles / corn / beans / fish / fruit, a rack of ristras and jerky
function roofDrying(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofdry`), x1 = iw / 2 - 0.3, z1 = id / 2 - 0.3, tS = c._tankSide || 1, pw = powerSpot(c, m, iw, id);
  // washing lines across the back half
  const nl = Math.max(1, Math.min(3, Math.floor(id / 2.6)));
  for (let k = 0; k < nl; k++) {
    const z = -z1 + 0.9 + k * 1.0; if (z > 0.2) break;
    const xa = -x1 + 0.1, xb = x1 - 0.1 - (z < -z1 + 1.4 ? 1.3 : 0); // clear of the tinaco
    const xA = tS > 0 ? xa : -xb, xB = tS > 0 ? xb : -xa;
    b.t('wood'); for (const x of [xA, xB]) b.box(x, y + 0.95, z, 0.05, 1.9, 0.05, col(WOOD.pole));
    b.t('plain').box((xA + xB) / 2, y + 1.85, z, xB - xA, 0.01, 0.01, col(0x3a3020));
    b.t('fabric'); for (let x = xA + 0.4; x < xB - 0.3; x += rng.range(0.45, 0.8)) { const h = rng.range(0.35, 0.8); b.box(x, y + 1.85 - h / 2, z, rng.range(0.3, 0.6), h, 0.02, col(rng.pick([0xa8473a, 0x5f7f96, 0xc9a65a, 0x8a9a6a, 0xd8ccb0, 0xe8e4dc]), 0.08, rng)); }
  }
  // mats (petates) of produce on the front half
  const nm = Math.max(1, Math.min(4, Math.floor(iw / 1.7)));
  for (let k = 0; k < nm; k++) {
    const x = nm > 1 ? -x1 + 0.8 + k * ((2 * x1 - 1.6) / (nm - 1)) : 0, z = z1 - 1.3 - (k % 2) * 0.2;
    if (c.roofPowerKind && Math.abs(x - pw[0]) < 1.4) continue;
    if (Math.abs(x) < 1.15) continue; // the roof hatch / way up stays clear
    petate(b, rng, x, y, z, rng.weighted({ chile: 3, corn: 2, beans: 1, fish: 1, fruit: 1 }));
  }
  // a rack of chile ristras / jerky by the side parapet
  if (rng.chance(0.7)) {
    const x = -tS * x1, z0 = -0.8, L = Math.min(2.4, id * 0.45);
    b.t('wood'); for (const z of [z0, z0 + L]) b.box(x, y + 0.9, z, 0.05, 1.8, 0.05, col(WOOD.pole)); b.box(x, y + 1.78, z0 + L / 2, 0.05, 0.05, L, col(WOOD.pole));
    const jerky = rng.chance(0.35);
    b.t('plain'); for (let z = z0 + 0.25; z < z0 + L - 0.15; z += 0.28) { const h = rng.range(0.5, 0.9); if (jerky) b.box(x, y + 1.76 - h / 2, z, 0.05, h, 0.08, col(0x6a2e24, 0.06, rng)); else for (let k = 0; k < Math.round(h / 0.07); k++) b.box(x + rng.range(-0.03, 0.03), y + 1.74 - k * 0.07, z, 0.08, 0.07, 0.08, col(rng.pick(DRY.chile), 0.06, rng), rng.next()); }
  }
}

// ---------------------------------------------------------------- roof power: a salvaged solar panel or a small wind charger
// Enough for a bulb or two, never the whole house: the building gets one bare bulb by the unit and its door lamp
// (buildings.js) runs off the battery. On a pitched roof the unit stands on a pole / mast against the back wall.
export function powerSpot(c, m, iw, id) {
  const tS = c._tankSide || 1, lvl = roofLevel(c, m);
  if (lvl === 'security') return [0, -(id / 2 - 0.9)];
  if (lvl === 'beds' || lvl === 'full' || lvl === 'drying') return [tS * (iw / 2 - 0.9), id / 2 - 1.5];
  return [-tS * (iw / 2 - 0.9), -(id / 2 - 1.0)];
}
export function roofPower(b, c, iw, id, y, m, kind, pitched = null) {
  const rng = new RNG(`${c.spec.id}:roofpower`);
  let px, pz, base = y, mastH, front = false;
  if (pitched) { // against the back wall, at the corner away from the door side
    const { w, d, wallH } = pitched, sx = (c._tankSide || 1);
    px = sx * (w / 2 - 0.5); pz = -d / 2 - (kind === 'solar' ? 0.9 : 0.2); base = 0;
    mastH = kind === 'solar' ? 2.3 : wallH + Math.max(w, d) * 0.32 + 1.6;
    if (kind !== 'solar') { b.t('metal'); for (const yy of [wallH * 0.4, wallH * 0.85]) b.box(px, yy, pz + 0.1, 0.05, 0.05, 0.2, col(METAL.dark)); } // wall brackets
  } else {
    [px, pz] = powerSpot(c, m, iw, id); front = pz > 0;
    mastH = kind === 'solar' ? 0 : rng.range(2.6, 3.4);
  }
  const dark = col(METAL.dark), wire = col(0x222220);
  let bulb;
  if (kind === 'solar') { // one or two panels tilted on an angle frame
    const n = !pitched && iw > 5 && rng.chance(0.5) ? 2 : 1, tilt = 0.5, pw = 1.0, pl = 1.5, py = base + (pitched ? mastH : 0.6);
    for (let k = 0; k < n; k++) {
      const x = px - Math.sign(px || 1) * k * 1.15;
      b.t('metal');
      if (pitched) b.box(x, base + mastH / 2, pz, 0.08, mastH, 0.08, dark);
      else { const hs = front ? -1 : 1; for (const sx of [-0.4, 0.4]) { b.box(x + sx, base + 0.43, pz + hs * 0.55, 0.04, 0.86, 0.04, dark); b.box(x + sx, base + 0.17, pz - hs * 0.55, 0.04, 0.34, 0.04, dark); } }
      b.pushT(x, py, pz).push(new THREE.Matrix4().makeRotationX(front ? tilt : -tilt)); // faces up and outward
      b.t('metal').box(0, -0.03, 0, pw + 0.06, 0.04, pl + 0.06, col(0x8a8c8e));
      b.t('plain').box(0, 0, 0, pw, 0.02, pl, col(rng.pick([0x1e2a44, 0x22304a, 0x2a2e3a]), 0.04, rng));
      for (let j = -2; j <= 2; j++) b.box(0, 0.012, j * 0.3, pw - 0.02, 0.004, 0.012, col(0x6a7080));
      b.box(0, 0.012, 0, 0.012, 0.004, pl - 0.02, col(0x6a7080));
      b.pop().pop();
    }
    b.t('plain').box(px, base + 0.15, pz, 0.3, 0.3, 0.2, col(0x4a5a3a, 0.05, rng)); // battery box
    bulb = [px + (px > 0 ? -0.25 : 0.25), base + (pitched ? 2.0 : 1.1), pz + (pitched ? 0.5 : 0)];
    b.t('metal').box(bulb[0], (base + bulb[1]) / 2 + 0.05, bulb[2], 0.04, bulb[1] - base + 0.1, 0.04, dark);
  } else { // wind charger: a pipe mast with guy wires, a three-blade rotor off a car alternator, a tail fin
    const mc = col(rng.pick([0x8a8c8e, METAL.rust, 0x5a5c5e]), 0.05, rng), ry = rng.range(0, 6.28);
    b.t('metal').cyl(px, base + mastH / 2, pz, 0.04, 0.05, mastH, 6, mc);
    if (!pitched) for (const a of [0.3, 2.4, 4.5]) rod(b, [px, base + mastH * 0.72, pz], [px + Math.cos(a) * 1.1, base + 0.02, pz + Math.sin(a) * 1.1], 0.006, col(0x3a3836), 3);
    b.pushT(px, base + mastH, pz, ry);
    b.box(0, 0, 0, 0.14, 0.14, 0.36, col(0x3a3a38)); b.box(0, 0.05, -0.55, 0.02, 0.32, 0.45, mc); b.box(0, 0, -0.3, 0.03, 0.03, 0.3, mc); // body, tail
    b.cyl(0, 0, 0.22, 0.07, 0.07, 0.08, 8, col(0x5a5c5e), Math.PI / 2, 0, 0);
    const bc = col(rng.pick([0xd8d4c8, 0xa8473a, 0x5f7f96, 0x8a8c8e]), 0.05, rng), a0 = rng.next() * 6.28;
    // the rotor is a live part (world.js spins it): hub + three blades about its own z axis
    const hubL = (() => { const v = new THREE.Vector3(0, 0, 0.26).applyMatrix4(b.M); return [v.x, v.y, v.z]; })();
    const fwdL = (() => { const v = new THREE.Vector3(0, 0, 1.26).applyMatrix4(b.M); return [v.x, v.y, v.z]; })();
    b.pop();
    const P0 = hubL, P1 = fwdL, yaw = Math.atan2(P1[0] - P0[0], P1[2] - P0[2]);
    const rb = new Builder(); rb.t('metal');
    for (let k = 0; k < 3; k++) { const a = a0 + (k / 3) * Math.PI * 2; rb.box(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, 0.72, 0.1, 0.012, bc, 0, 0, a); }
    rb.cyl(0, 0, 0, 0.06, 0.06, 0.06, 8, col(0x5a5c5e), Math.PI / 2, 0, 0);
    (c.info.rotors ||= []).push({ at: P0, yaw, geoms: rb.build(), speed: c.damage > 0.3 || c.origin === 'ruin' ? 0 : rng.range(4.5, 7.5) * (rng.chance(0.5) ? 1 : -1) });
    b.t('plain').box(px + 0.18, base + 0.15, pz, 0.3, 0.3, 0.2, col(0x4a5a3a, 0.05, rng)); // battery box
    bulb = [px, base + (pitched ? Math.min(mastH - 0.6, pitched.wallH + 0.3) : 1.9), pz + (pitched ? 0.12 : 0)];
    b.t('metal').box(bulb[0] + 0.12, bulb[1] + 0.06, bulb[2], 0.24, 0.03, 0.03, dark);
    bulb[0] += 0.24;
  }
  // the bulb: a bare one on a bracket, lit off the battery
  const r = c.lightR(false, true, true);
  b.ch('lamp').w(r).t('plain').box(bulb[0], bulb[1] - 0.06, bulb[2], 0.07, 0.1, 0.07, 0xfff0d0).w(-1).ch('main');
  const p = c.toLocal(bulb[0], bulb[1] - 0.06, bulb[2]); c.info.lights.push({ x: p[0], y: p[1], z: p[2], color: [1.0, 0.85, 0.6], radius: 5, intensity: 0.9, kind: 'lamp', r, flicker: false });
  if (!pitched) b.t('plain').box(px, base + 0.02, pz + (pz > 0 ? -0.6 : 0.6), 0.03, 0.03, 1.2, wire); // cable across the roof
  c.info.roofPower = kind;
}

const DRY = { chile: [0xb02a1a, 0xc83a22, 0x8a1a12], corn: [0xd8b030, 0xe0c040, 0xc89a28], beans: [0x6a3a2a, 0xd8ccb0, 0x3a2a22], fish: [0xd8c8a8, 0xc8b898], fruit: [0xe08a30, 0xd86a2a, 0xe8a040] };
// a petate (palm mat) with produce spread to dry
function petate(b, rng, x, y, z, kd) {
  b.t('thatch').box(x, y + 0.015, z, 1.3, 0.03, 0.9, col(0xc8b088, 0.05, rng), rng.range(-0.1, 0.1));
  const P = DRY[kd];
  b.t('plain'); for (let i = 0; i < 26; i++) { const px = x + rng.range(-0.55, 0.55), pz = z + rng.range(-0.36, 0.36), cc = col(rng.pick(P), 0.06, rng);
    if (kd === 'corn') b.cyl(px, y + 0.06, pz, 0.035, 0.035, 0.16, 6, cc, 0, rng.next() * 3, Math.PI / 2); else if (kd === 'fish') b.box(px, y + 0.04, pz, 0.08, 0.02, 0.24, cc, rng.next() * 3); else b.box(px, y + 0.04, pz, 0.07, 0.03, kd === 'chile' ? 0.1 : 0.06, cc, rng.next() * 3); }
}

// ---------------------------------------------------------------- mixed roof
// a bit of everything, the way most roofs are actually used: herb pots along half the front, one washing line
// across the back, a mat of chiles or corn drying, and a sitting corner (two chairs, a spool for a table) or,
// now and then, a small sandbag lookout in the back corner
function roofMixed(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofmix`), x1 = iw / 2 - 0.3, z1 = id / 2 - 0.3, tS = c._tankSide || 1, poor = (TIER_RANK[c.finish.tier] ?? 0) <= 0;
  const pw = c.roofPowerKind ? powerSpot(c, m, iw, id) : null, near = (x, z, r = 1.3) => pw && Math.hypot(x - pw[0], z - pw[1]) < r;
  // pots along the front, on the side away from the tank
  for (let x = -tS * (x1 - 0.1); Math.abs(x) > 0.9 && Math.sign(x) === -tS; x += tS * rng.range(0.45, 0.7)) if (rng.chance(0.85) && !near(x, z1)) container(b, rng, x, y, z1 - 0.05, poor, true);
  // one washing line across the back half, clear of the tank
  const zl = -z1 + 0.9, xa = -tS * (x1 - 0.1), xb = tS * (x1 - 1.5);
  if (Math.abs(xb - xa) > 2) {
    b.t('wood'); for (const x of [xa, xb]) b.box(x, y + 0.95, zl, 0.05, 1.9, 0.05, col(WOOD.pole));
    b.t('plain').box((xa + xb) / 2, y + 1.85, zl, Math.abs(xb - xa), 0.01, 0.01, col(0x3a3020));
    b.t('fabric'); const lo = Math.min(xa, xb), hi = Math.max(xa, xb); for (let x = lo + 0.4; x < hi - 0.3; x += rng.range(0.5, 0.9)) { const h = rng.range(0.35, 0.8); b.box(x, y + 1.85 - h / 2, zl, rng.range(0.3, 0.6), h, 0.02, col(rng.pick([0xa8473a, 0x5f7f96, 0xc9a65a, 0x8a9a6a, 0xd8ccb0, 0xe8e4dc]), 0.08, rng)); }
  }
  // a mat drying on the tank side of the front
  const mx = tS * (x1 - 0.9), mz = z1 - 1.0;
  if (!near(mx, mz)) petate(b, rng, mx, y, mz, rng.weighted({ chile: 3, corn: 2, beans: 1 }));
  // the sitting corner, or a lookout
  const sx = -tS * (x1 - 1.1), sz = -0.3;
  if (rng.chance(0.3) && iw > 4.5 && id > 4.5) { const cx = -tS * x1, cz = -z1 + 1.6; bags(b, rng, cx, cz, cx + tS * 1.6, cz, y, 3); bags(b, rng, cx + tS * 0.05, cz + 0.32, cx + tS * 0.05, cz + 1.5, y, 3); }
  else if (!near(sx, sz)) {
    b.t('wood').cyl(sx, y + 0.3, sz, 0.35, 0.35, 0.6, 10, col(0x8a6a4a, 0.05, rng)); // a cable spool for a table
    for (const a of [0.6, 2.4]) { const cx = sx + Math.cos(a) * 0.7, cz = sz + Math.sin(a) * 0.7, ry = Math.atan2(sx - cx, sz - cz), cc = col(rng.pick([0xa83a32, 0x2f6a8a, 0xd8d0c0, WOOD.weathered]), 0.05, rng);
      b.t('plain').box(cx, y + 0.44, cz, 0.42, 0.05, 0.42, cc, ry).box(cx - Math.sin(ry) * 0.2, y + 0.7, cz - Math.cos(ry) * 0.2, 0.42, 0.5, 0.04, cc, ry).box(cx, y + 0.22, cz, 0.36, 0.44, 0.36, cc.clone().offsetHSL(0, 0, -0.12), ry); }
  }
}

// ---------------------------------------------------------------- the newer roof uses
const wd = (rng) => col(rng.pick([WOOD.weathered, WOOD.dark, 0x8a7a62]), 0.06, rng);
const rust = (rng) => col(rng.pick([METAL.rust, 0x7a4a30, 0x6a5a4a]), 0.06, rng);
const tin = (rng) => col(rng.pick([0x8a8780, 0x7c7a74, 0x76624e, 0x6f6c66]), 0.04, rng);
const tarpC = (rng) => col(rng.pick([0x5e646a, 0x7e6a56, 0x66685a, 0x8a7a62, 0x4a5a6a]), 0.05, rng);
const hasTank = (c, m) => m.main && ['house', 'posada'].includes(c.spec.kind || 'house') && c.spec.tinaco !== false;
const spotOK = (c, m, iw, id, x, z, r = 1.3) => { // clear of the hatch, the power kit and the tinaco corner
  if (Math.abs(x) < 1.0 && z > id / 2 - 1.8) return false;
  const pw = c.roofPowerKind ? powerSpot(c, m, iw, id) : null; if (pw && Math.hypot(x - pw[0], z - pw[1]) < r) return false;
  return !(hasTank(c, m) && Math.hypot(x - (c._tankSide || 1) * (iw / 2 - 0.6), z + id / 2 - 0.6) < r + 0.2);
};

// storage (bodega de azotea): spare tin, tyres, rebar, a broken chair, sacks, all under a tarp weighed down with bricks
function roofStorage(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofstore`), x1 = iw / 2 - 0.4, z1 = id / 2 - 0.4, tS = c._tankSide || 1;
  const piles = Math.max(2, Math.min(6, Math.round((iw * id) / 7)));
  for (let k = 0; k < piles; k++) {
    const x = rng.range(-x1 + 0.6, x1 - 0.6), z = rng.range(-z1 + 0.6, z1 - 1.2); if (!spotOK(c, m, iw, id, x, z)) continue;
    const t = rng.weighted({ tin: 3, tyres: 2, rebar: 1.5, sacks: 1.5, junk: 2, tarp: 2.5 });
    if (t === 'tin') { b.t('corrugated'); for (let i = 0; i < rng.int(3, 8); i++) b.box(x + rng.range(-0.1, 0.1), y + 0.02 + i * 0.035, z + rng.range(-0.1, 0.1), 1.8, 0.03, 0.8, tin(rng), rng.range(-0.2, 0.2)); }
    else if (t === 'tyres') { b.t('plain'); for (let i = 0; i < rng.int(2, 5); i++) b.cyl(x + rng.range(-0.05, 0.05), y + 0.11 + i * 0.2, z, 0.36, 0.36, 0.2, 10, col(0x2a2826, 0.04, rng)); }
    else if (t === 'rebar') { b.t('metal'); for (let i = 0; i < 9; i++) b.beam([x - 1.2, y + 0.05 + (i % 3) * 0.03, z + i * 0.05], [x + 1.2, y + 0.05 + (i % 3) * 0.03, z + i * 0.05 + rng.range(-0.1, 0.1)], 0.012, 3, rust(rng)); }
    else if (t === 'sacks') { b.t('fabric'); for (let i = 0; i < rng.int(2, 5); i++) b.box(x + rng.range(-0.4, 0.4), y + 0.15 + (i > 2 ? 0.28 : 0), z + rng.range(-0.3, 0.3), 0.6, 0.28, 0.4, col(rng.pick([0xc8b896, 0xb8a882, 0xa89a78]), 0.06, rng), rng.range(0, 3)); }
    else if (t === 'junk') { b.t('wood').box(x, y + 0.3, z, 0.5, 0.06, 0.5, wd(rng), rng.range(0, 3), 0.4); b.t('metal').cyl(x + 0.5, y + 0.4, z + 0.2, 0.28, 0.28, 0.8, 10, rust(rng)); b.t('plain').box(x - 0.4, y + 0.25, z - 0.3, 0.6, 0.5, 0.5, col(rng.pick([0xd8d4c8, 0x8a8a80, 0x5a6a7a]), 0.06, rng)); }
    else { // a heap under a tarp, bricks on the corners
      b.t('plain').box(x, y + 0.3, z, 1.6, 0.6, 1.1, col(0x5a5048)); b.t('fabric').box(x, y + 0.62, z, 1.8, 0.04, 1.3, tarpC(rng), rng.range(-0.1, 0.1), 0.05);
      b.t('brick'); for (const [sx, sz] of [[-0.8, -0.55], [0.8, -0.55], [-0.8, 0.55], [0.8, 0.55]]) b.box(x + sx, y + 0.68, z + sz, 0.22, 0.07, 0.11, col(0x9e735d, 0.05, rng));
    }
  }
  if (rng.chance(0.6) && !c.roofPowerKind) { b.t('wood'); const x = -tS * (x1 - 0.2); for (let i = 0; i < 6; i++) b.plank([x, y + 0.02, -z1 + 0.3 + i * 0.05], [x + tS * 0.2, y + 1.6, -z1 + 0.25 + i * 0.05], 0.12, 0.025, wd(rng)); } // planks leaning on the parapet
}

// roof room (cuarto de azotea): a small block or scrap room on top, its door, a window, a ladder up, a line beside
function roofRoom(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofroom`), tS = c._tankSide || 1, w = Math.min(iw - 1.2, rng.range(2.8, 3.6)), d = Math.min(id - 1.6, rng.range(2.4, 3.2)), H = 2.3;
  if (w < 2 || d < 2) return roofMixed(b, c, iw, id, y, m);
  const zr = c.roofPowerKind ? 1 : -1, x = -tS * (iw / 2 - w / 2 - 0.25), z = zr * (id / 2 - d / 2 - 0.25), scrap = rng.chance(0.45), fz = z - zr * d / 2; // fz: the face toward the roof
  const wc = scrap ? tin(rng) : col(rng.pick([0xb8b0a0, 0xa8a090, 0xc0b8a8]), 0.04, rng);
  b.t(scrap ? 'corrugated' : 'block').box(x, y + H / 2, z, w, H, d, wc);
  b.t('corrugated').box(x, y + H + 0.05, z - zr * 0.1, w + 0.3, 0.05, d + 0.4, tin(rng), 0, -zr * 0.1);
  b.t('wood').box(x + tS * (w / 2 - 0.6), y + 1.0, fz - zr * 0.02, 0.8, 1.95, 0.04, wd(rng)); // door
  b.t('plain').box(x - tS * (w / 2 - 0.8), y + 1.35, fz - zr * 0.02, 0.6, 0.5, 0.03, col(0x2a3034)); // window
  if (rng.chance(0.6)) { b.t('plain').box(x - tS * (w / 2 - 0.8), y + 1.35, fz - zr * 0.04, 0.66, 0.03, 0.01, col(0x5a4a3a)); }
  const lz = fz - zr * 1.2, xa = x - tS * 0.3, xb = tS * (iw / 2 - 0.5);
  b.t('wood'); for (const xx of [xa, xb]) b.box(xx, y + 0.95, lz, 0.05, 1.9, 0.05, col(WOOD.pole));
  b.t('plain').box((xa + xb) / 2, y + 1.85, lz, Math.abs(xb - xa), 0.01, 0.01, col(0x3a3020));
  b.t('fabric'); for (let xx = Math.min(xa, xb) + 0.4; xx < Math.max(xa, xb) - 0.3; xx += rng.range(0.45, 0.8)) { const h = rng.range(0.35, 0.8); b.box(xx, y + 1.85 - h / 2, lz, rng.range(0.3, 0.6), h, 0.02, col(rng.pick([0xa8473a, 0x5f7f96, 0xc9a65a, 0xd8d0c0, 0x4f6f5a]), 0.06, rng)); }
  if (rng.chance(0.6)) { b.t('wood').box(x + tS * 0.3, y + 0.42, fz - zr * 0.6, 0.45, 0.05, 0.45, wd(rng)); } // a stool by the door
}

// water catchment: tarps / tin funnels to gutters, down into drums; a cistern tank; sometimes a glass solar still
function roofCatch(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofcatch`), x1 = iw / 2 - 0.4, z1 = id / 2 - 0.4, tS = c._tankSide || 1;
  const n = Math.max(1, Math.min(3, Math.floor(iw / 2.4)));
  for (let k = 0; k < n; k++) { // a sloped catchment sheet on a frame, a gutter along its low edge into a drum
    const x = n > 1 ? -x1 + 1.2 + k * ((2 * x1 - 2.4) / (n - 1)) : 0, z = Math.min(-z1 + 2.1, z1 - 2.6); if (!spotOK(c, m, iw, id, x, z)) continue;
    b.t('wood'); for (const [sx, h] of [[-0.9, 1.2], [0.9, 1.2]]) { b.box(x + sx, y + h / 2, z - 0.7, 0.05, h, 0.05, col(WOOD.pole)); b.box(x + sx, y + 0.3, z + 0.7, 0.05, 0.6, 0.05, col(WOOD.pole)); }
    const sheet = rng.chance(0.5); b.t(sheet ? 'corrugated' : 'fabric').box(x, y + 0.9, z, 1.9, 0.03, 1.6, sheet ? tin(rng) : tarpC(rng), 0, 0.4);
    b.t('metal').box(x, y + 0.55, z + 0.78, 1.9, 0.08, 0.1, col(0x8a8a80)); // gutter
    b.t('plain').cyl(x + 1.05, y + 0.45, z + 0.8, 0.3, 0.3, 0.9, 12, col(rng.pick([0x2f5a8a, 0x3a6a4a, 0x2a2a28, 0x8a3a2a]), 0.05, rng));
  }
  if (rng.chance(0.65)) { const x = tS * (x1 - 0.7), z = z1 - 0.9; if (spotOK(c, m, iw, id, x, z)) { b.t('plain').cyl(x, y + 0.7, z, 0.6, 0.6, 1.4, 14, col(rng.pick([0x1a1a1a, 0x8a8a80]), 0.04, rng)); b.t('metal').beam([x, y + 1.4, z], [x - tS * 0.8, y + 0.5, z - 1.5], 0.04, 5, col(0x6a6a68)); } }
  if (rng.chance(0.35) && iw > 4) { // solar still: a shallow box with a glass lid, a jug at the low end
    const x = -tS * (x1 - 1.0), z = z1 - 1.0; if (spotOK(c, m, iw, id, x, z)) { b.t('wood').box(x, y + 0.15, z, 1.2, 0.3, 0.8, wd(rng)); b.t('plain').box(x, y + 0.36, z, 1.2, 0.02, 0.82, col(0x9ab0b8), 0, 0.12); b.t('plain').cyl(x + 0.7, y + 0.15, z + 0.3, 0.12, 0.12, 0.3, 8, col(0xc8c8c0)); }
  }
}

// terrace (cantinas, posadas): tables and chairs under a shade cloth, string lights, a brazier, a rail at the edge
// roof terrace: tucked into a front corner by the hatch, sized to the roof, dressed to match the house —
// bare walls get crates, a tarp and a bulb; plain paint gets cloth shade, wooden tables, a string of lights and
// clay pots; decorated houses get a tiled floor, a pergola with bougainvillea, painted rail, lanterns and a bar
function roofTerrace(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofterr`), kind = c.spec.kind || 'house';
  let rank = TIER_RANK[c.finish.tier] ?? 0; if (c.finish.fade === 'gone') rank -= 2; else if (c.finish.fade === 'faded') rank -= 1; if (c.damage) rank -= 1;
  const q = rank <= 0 ? 0 : rank <= 2 ? 1 : 2; // spartan / modest / nice
  const X1 = iw / 2 - 0.3, Z1 = id / 2 - 0.3, area = iw * id, sx = rng.chance(0.5) ? 1 : -1;
  const rich = c.spec.zcat === 'wealthy';
  const tw = Math.max(2.4, rich ? 2 * X1 - 0.3 : Math.min(iw * (area < 35 ? 0.7 : 0.62), 7.5, 2 * X1 - 0.3)), td = Math.max(2.4, rich ? Math.min(2 * Z1 - 0.6, id * 0.8) : Math.min(id * (area < 35 ? 0.66 : 0.6), 6, 2 * Z1 - 0.6));
  const xo = sx * X1, xi = sx * (X1 - tw), zf = Z1, zb = Z1 - td, cx = (xo + xi) / 2, cz = (zf + zb) / 2;
  const trim = c.colors.trim ? c.colors.trim.clone() : col(rng.pick([0x3a5a6a, 0x7a3a2a, 0x2a2a28]), 0.04, rng);
  const ok = (x, z, r) => spotOK(c, m, iw, id, x, z, r) && !taken.some(([a2, b2, r2]) => Math.hypot(a2 - x, b2 - z) < r2 + r);
  const taken = [];
  const lr = c.lightR(false, true, !!c.roofPowerKind);
  // floor: tiles on a good house, a reed mat on a plain one
  if (q === 2) b.t('plain').box(cx, y + 0.012, cz, tw - 0.1, 0.02, td - 0.1, col(rng.pick([0xa85a3a, 0x9a5236, 0xb86a48]), 0.04, rng));
  else if (q === 1 && rng.chance(0.5)) b.t('thatch').box(cx, y + 0.012, cz, Math.min(tw - 0.4, 2.6), 0.02, Math.min(td - 0.4, 2.0), col(0xc8b088, 0.05, rng), rng.range(-0.08, 0.08));
  // rail on the two open edges (front, outer side); none on a bare roof
  if (q >= 1) {
    const rc = q === 2 ? trim : col(rng.pick([METAL.dark, 0x5a4a3a]), 0.05, rng), step = q === 2 ? 0.6 : 1.2;
    b.t(q === 2 ? 'plain' : 'metal');
    b.box(cx, y + 1.0, zf, tw, 0.05, 0.05, rc); for (let k = 0; k <= Math.round(tw / step); k++) b.box(xi + (xo - xi) * k / Math.round(tw / step), y + 0.5, zf, 0.04, 1.0, 0.04, rc);
    b.box(xo, y + 1.0, cz, 0.05, 0.05, td, rc); for (let k = 0; k < Math.round(td / step); k++) b.box(xo, y + 0.5, zb + (zf - zb) * k / Math.round(td / step), 0.04, 1.0, 0.04, rc);
  }
  // shade
  const H = 2.2, px0 = Math.abs(xi) < 1.05 ? sx * 1.05 : xi;
  let shade = q === 0 ? (rng.chance(0.85) ? 'tarp' : null) : q === 1 ? 'cloth' : rng.chance(0.7) ? 'pergola' : 'cloth';
  // a cloth or a tarp covers only the sitting corner at the back (the rest of the terrace stays open to the sky); a pergola can span it all
  // a cloth or a tarp shades only the sitting corner against the outer parapet (the rest of the terrace stays open);
  // a pergola can span it all
  const full = shade === 'pergola', sw = full ? Math.abs(xo - px0) - 0.3 : Math.min(Math.abs(xo - px0) - 0.3, 3.6), sd = full ? td - 0.4 : Math.min(td - 0.4, 3.4);
  const seatZ = Math.max(zb + sd / 2 + 0.2, Math.min(zf - sd / 2 - 0.3, zb + td * 0.4)); // the couch, under the shade
  const scx = full ? (xo + px0) / 2 : xo - sx * (sw / 2 + 0.05), scz = full ? cz : seatZ;
  const poles = [[scx - sw / 2, scz - sd / 2], [scx + sw / 2, scz - sd / 2], [scx - sw / 2, scz + sd / 2], [scx + sw / 2, scz + sd / 2]];
  if (sw < 1.6) shade = null;
  const pc = col(q === 2 ? WOOD.dark : WOOD.pole, 0.05, rng);
  if (shade === 'tarp') { // tied to the parapet (or two short sticks on it), held up on two sticks on the open side
    const tie = (c._parapetH ?? 0) >= 0.6 ? c._parapetH + 0.05 : 1.4, xin = xo - sx * sw, xt = xo + sx * 0.05;
    b.t('wood'); for (const z of [scz - sd / 2, scz + sd / 2]) { b.cyl(xin, y + 1.0, z, 0.04, 0.05, 2.0, 5, pc); taken.push([xin, z, 0.2]); if (tie > 1) b.cyl(xo - sx * 0.1, y + tie / 2, z, 0.04, 0.05, tie, 5, pc); }
    b.t('fabric').plank([xt, y + tie, scz], [xin, y + 2.02, scz], sd + 0.2, 0.02, tarpC(rng));
    b.t('plain'); for (const z of [scz - sd / 2, scz + sd / 2]) b.beam([xin, y + 2.0, z], [xin - sx * 0.6, y, z], 0.006, 3, col(0x3a3a38)); // guy ropes
  } else if (shade) {
    b.t('wood'); for (const [x, z] of poles) { b.cyl(x, y + H / 2, z, 0.05, 0.06, H, 6, pc); taken.push([x, z, 0.2]); }
    if (shade === 'cloth') b.t('fabric').box(scx, y + H, scz, sw + 0.2, 0.02, sd + 0.2, col(rng.pick([0x8a7a62, 0xb8a888, 0x6a705a, 0x9a5a3a, 0xc8b898]), 0.05, rng), 0, 0.03);
    else { // pergola: two beams, slats across, a bougainvillea up one post and over the top
      b.t('wood'); for (const z of [scz - sd / 2, scz + sd / 2]) b.box(scx, y + H + 0.06, z, sw + 0.4, 0.12, 0.1, pc);
      const ns = Math.max(4, Math.round(sw / 0.4)); for (let k = 0; k <= ns; k++) b.box(scx - sw / 2 + (sw * k) / ns, y + H + 0.16, scz, 0.06, 0.06, sd + 0.4, pc);
      const [bx, bz] = poles[3 - (sx > 0 ? 0 : 1)]; fplant(b, 'bougainvillea', bx, y, bz, 1.4, rng); container(b, rng, bx, y, bz, false, false);
      for (let k = 0; k < Math.round(sw * sd / 1.6); k++) fplant(b, 'vine', scx + rng.range(-sw / 2, sw / 2) * (0.4 + 0.6 * (k % 2)), y + H + 0.2, scz + rng.range(-sd / 2, sd / 2), 0.5, rng);
    }
  }
  // the bar: a plank counter on drums along the back of the terrace, stools on the terrace side
  const barP = (q === 0 ? 0.1 : q === 1 ? 0.3 : 0.5) + (['cantina', 'cafe', 'posada'].includes(kind) ? 0.2 : 0);
  let barZ = null;
  if (tw >= 3 && td >= 3 && rng.chance(barP)) {
    const L = Math.min(tw - 1.2, 2.4), bx = xi + sx * (L / 2 + 0.5), bz = zb + 0.35;
    if (ok(bx, bz, 0.5)) {
      barZ = bz; taken.push([bx, bz, L / 2 + 0.3]);
      const top = col(q === 2 ? WOOD.dark : WOOD.weathered, 0.05, rng);
      if (q === 0) { b.t('rust'); for (const d of [-1, 1]) b.cyl(bx + d * (L / 2 - 0.3), y + 0.45, bz, 0.28, 0.28, 0.9, 10, rust(rng)); }
      else { b.t('wood').box(bx, y + 0.5, bz, L, 1.0, 0.45, q === 2 ? trim.clone().lerp(col(0xe8dcc4), 0.3) : wd(rng)); }
      b.t('wood').box(bx, y + 1.03, bz + 0.05, L + 0.15, 0.06, 0.6, top);
      b.t('plain'); for (let k = 0; k < Math.round(L / 0.22); k++) if (rng.chance(0.7)) b.cyl(bx - L / 2 + 0.15 + k * 0.22, y + 1.16, bz - 0.1, 0.035, 0.04, 0.2, 6, col(rng.pick([0x3a5a2a, 0x6a3a1a, 0xc8c0a0, 0x2a3a4a]), 0.06, rng)); // bottles
      if (q >= 1) b.t('metal').box(bx + sx * (L / 2 - 0.35), y + 1.2, bz + 0.05, 0.5, 0.3, 0.35, col(rng.pick([0x9a3a2a, 0x3a6a8a, 0xc8c0b0]), 0.05, rng)); // a cooler on the bar
      const ns = Math.max(2, Math.floor(L / 0.7)); b.t('wood'); for (let k = 0; k < ns; k++) { const x = bx - L / 2 + (L * (k + 0.5)) / ns; b.cyl(x, y + 0.36, bz + 0.6, 0.17, 0.15, 0.06, 8, top).cyl(x, y + 0.18, bz + 0.6, 0.03, 0.04, 0.36, 5, col(METAL.dark)); taken.push([x, bz + 0.6, 0.25]); }
      if (q >= 1 && rng.chance(0.7)) { // a painted board over the bar
        b.t('wood'); for (const d of [-1, 1]) b.cyl(bx + d * L / 2, y + 1.1, bz - 0.2, 0.03, 0.03, 2.2, 5, pc);
        b.t('plain').box(bx, y + 2.05, bz - 0.2, L * 0.8, 0.35, 0.03, col(rng.pick([0x9a3a2a, 0x2f5a6a, 0xd8a838, 0x3a6a3a]), 0.05, rng));
      }
    }
  }
  // the sitting corner: a couch (or a car seat, or a plank bench) against the outer parapet facing in, a low table
  const SEATC = [0x6a3a2a, 0x3a4a5a, 0x5a5a3a, 0x7a5a3a, 0x8a2a2a, 0x4a5a4a];
  const couch = (x, z, ry) => {
    const L = q === 0 ? rng.pick([1.2, 1.6]) : 1.8, cc = q === 2 ? col(rng.pick([0xe8dcc4, 0x3a5a6a, 0x8a3a2a, 0xc8a050]), 0.04, rng) : col(rng.pick(SEATC), 0.06, rng).offsetHSL(0, -0.1 * (q === 0), -0.05 * (q === 0));
    b.push(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry)));
    if (q === 0 && rng.chance(0.4)) { b.t('wood').box(0, 0.42, 0, L, 0.06, 0.4, wd(rng)); for (const d of [-1, 1]) b.t('block').box(d * (L / 2 - 0.2), 0.2, 0, 0.2, 0.4, 0.4, col(0x9a968c, 0.04, rng)); } // plank on blocks
    else {
      b.t('fabric').box(0, 0.22, 0, L, 0.44, 0.8, cc).box(0, 0.6, -0.32, L, 0.5, 0.18, cc.clone().offsetHSL(0, 0, -0.03));
      for (const d of [-1, 1]) b.box(d * (L / 2 - 0.1), 0.38, 0, 0.2, 0.32, 0.8, cc.clone().offsetHSL(0, 0, -0.05));
      if (q >= 1) for (let k = 0; k < (q === 2 ? 3 : 1); k++) b.box(-L / 2 + 0.45 + k * 0.5, 0.58, -0.18, 0.38, 0.32, 0.12, col(rng.pick([0xd8a838, 0xc84a3a, 0x3a6a8a, 0xe8dcc4, 0x5a8a5a]), 0.05, rng), rng.range(-0.15, 0.15)); // cushions
      if (q === 0) b.t('plain').box(rng.range(-L / 3, L / 3), 0.45, 0.05, 0.3, 0.01, 0.25, col(0x2a2622), rng.range(0, 3)); // a burn / a tear
    }
    b.pop();
  };
  const lowTable = (x, z) => { if (q === 0) { b.t('wood'); for (const yy of [0.06, 0.2]) b.box(x, y + yy, z, 1.0, 0.12, 0.8, wd(rng)); b.t('plain').cyl(x + 0.2, y + 0.33, z, 0.04, 0.04, 0.2, 6, col(0x3a5a2a)).cyl(x - 0.2, y + 0.31, z + 0.1, 0.05, 0.05, 0.03, 8, col(0x6a6a68)); } // a pallet, a bottle, an ashtray
    else { b.t('wood').box(x, y + 0.38, z, 0.9, 0.05, 0.55, q === 2 ? trim : wd(rng)); for (const [a, e] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x + a * 0.38, y + 0.18, z + e * 0.22, 0.05, 0.36, 0.05, wd(rng)); b.t('plain').cyl(x + 0.15, y + 0.5, z, 0.035, 0.04, 0.2, 6, col(rng.pick([0x3a5a2a, 0x6a3a1a, 0xc8c0a0]), 0.05, rng)); if (q === 2) { b.ch('lamp').w(lr).box(x - 0.2, y + 0.47, z, 0.1, 0.14, 0.1, 0xffe0a0).w(-1).ch('main'); } } };
  if (td >= 2.8) { const ux = xo - sx * 0.55, uz = seatZ; if (ok(ux, uz, 0.9)) { couch(ux, uz, sx > 0 ? -Math.PI / 2 : Math.PI / 2); taken.push([ux, uz, 1.0]); if (rng.chance([0.35, 0.65, 0.75][q])) { const fx = ux - sx * 0.3, fz = uz + sd / 2 - 0.3, fy = fz - uz; if (ok(fx, fz, 0.3)) { const fa = Math.atan2(-sx, -0.6), fc = col(rng.pick([0xd8d4c8, 0x5a8aa0, 0x8a8a84, 0x6a9a6a]), 0.04, rng); // a standing fan aimed at the couch (on a crate when it's a desk fan)
        const h = q === 0 ? 0.62 : 1.15; if (q === 0) b.t('wood').box(fx, y + 0.2, fz, 0.45, 0.4, 0.35, wd(rng)); else b.t('plain').cyl(fx, y + 0.03, fz, 0.2, 0.22, 0.05, 10, fc).cyl(fx, y + h / 2, fz, 0.02, 0.02, h, 4, fc);
        b.t('plain').cyl(fx, y + h, fz, 0.07, 0.07, 0.16, 8, fc, fa, Math.PI / 2).cyl(fx - Math.sin(fa) * 0.1, y + h, fz - Math.cos(fa) * 0.1, 0.2, 0.2, 0.04, 12, fc.clone().offsetHSL(0, 0, -0.08), fa, Math.PI / 2); taken.push([fx, fz, 0.3]); } } const lx = ux - sx * 1.05; if (ok(lx, uz, 0.5)) { lowTable(lx, uz); taken.push([lx, uz, 0.6]); } if (q >= 1 || rng.chance(0.6)) { const ax = lx - sx * 0.2, az = uz + 1.0; if (ok(ax, az, 0.4)) { seat(ax, az, Math.atan2(lx - ax, uz - az)); taken.push([ax, az, 0.4]); } } } }
  function seat(x, z, ry) { // one chair: a crate or a bucket on a bare roof, a wooden chair, or a painted one
    if (q === 0) { if (rng.chance(0.5)) b.t('wood').box(x, y + 0.2, z, 0.45, 0.4, 0.35, wd(rng), ry); else b.t('plain').cyl(x, y + 0.18, z, 0.15, 0.12, 0.36, 8, col(rng.pick(SCRAP), 0.06, rng)); return; }
    const cc = q === 2 ? trim : col(rng.pick([0x8a6a4a, 0xb8b2a4, 0x7a4a3a, 0x5a6a72, 0xc84a3a]), 0.05, rng);
    b.t('plain').box(x, y + 0.44, z, 0.4, 0.05, 0.4, cc, ry).box(x - Math.sin(ry) * 0.18, y + 0.7, z - Math.cos(ry) * 0.18, 0.4, 0.5, 0.04, cc, ry).box(x, y + 0.22, z, 0.34, 0.44, 0.34, cc.clone().offsetHSL(0, 0, -0.08), ry);
  }
  // tables and seats, as many as the terrace holds
  const zLo = (barZ != null ? barZ + 1.0 : zb + 1.3), zHi = zf - 1.35, xLo = Math.min(xi, xo) + 1.35, xHi = Math.max(xi, xo) - 1.35; // a table and its chairs stay inside the rail
  const ncol = Math.max(1, Math.floor((xHi - xLo) / 1.8) + 1), nrow = Math.max(1, Math.floor((zHi - zLo) / 1.8) + 1), nt = Math.min([2, 4, 5][q], ncol * nrow);
  const tc0 = col(rng.pick([0x8a6a4a, 0xb8b2a4, 0x5a6a72, 0x7a4a3a, 0x8a8478]), 0.05, rng), cloth = q === 2 && rng.chance(0.7) ? col(rng.pick([0xe8dcc4, 0xc84a3a, 0x3a6a8a, 0xd8a838]), 0.04, rng) : null;
  let placed = 0;
  for (let k = 0; k < ncol * nrow && placed < nt; k++) {
    const i = k % ncol, j = Math.floor(k / ncol);
    const x = ncol > 1 ? xLo + (i * (xHi - xLo)) / (ncol - 1) : (xLo + xHi) / 2, z = nrow > 1 ? zHi - (j * (zHi - zLo)) / (nrow - 1) : (zLo + zHi) / 2;
    if (!ok(x, z, 0.9)) continue; taken.push([x, z, 1.1]); placed++;
    if (q === 0) { // a spool or a plank on a drum
      if (rng.chance(0.5)) b.t('wood').cyl(x, y + 0.35, z, 0.45, 0.45, 0.06, 10, wd(rng)).cyl(x, y + 0.17, z, 0.2, 0.2, 0.34, 8, wd(rng)).cyl(x, y + 0.02, z, 0.42, 0.42, 0.04, 10, wd(rng));
      else { b.t('rust').cyl(x, y + 0.36, z, 0.28, 0.28, 0.72, 10, rust(rng)); b.t('wood').box(x, y + 0.74, z, 0.9, 0.04, 0.6, wd(rng), rng.range(0, 3)); }
      b.t('plain'); for (let n = 0; n < rng.int(1, 3); n++) b.cyl(x + rng.range(-0.25, 0.25), y + (rng.chance(0.5) ? 0.48 : 0.86), z + rng.range(-0.2, 0.2), 0.035, 0.04, 0.2, 6, col(rng.pick([0x3a5a2a, 0x6a3a1a, 0x8a8a80]), 0.06, rng)); // empties
    } else {
      const tc = q === 2 ? tc0 : col(rng.pick([0x8a6a4a, 0xb8b2a4, 0x5a6a72, 0x7a4a3a, 0x8a8478]), 0.05, rng);
      b.t('plain').cyl(x, y + 0.72, z, 0.45, 0.45, 0.04, 10, tc).cyl(x, y + 0.36, z, 0.04, 0.06, 0.72, 6, col(METAL.dark));
      if (cloth) b.t('fabric').cyl(x, y + 0.66, z, 0.5, 0.52, 0.14, 10, cloth);
      b.t('plain'); for (let n = 0; n < rng.int(1, 3); n++) b.cyl(x + rng.range(-0.25, 0.25), y + 0.84, z + rng.range(-0.25, 0.25), 0.035, 0.04, 0.2, 6, col(rng.pick([0x3a5a2a, 0x6a3a1a, 0xc8c0a0, 0x2a3a4a]), 0.06, rng));
      if (q === 2) { b.ch('lamp').w(lr); b.t('plain').box(x, y + 0.82, z, 0.1, 0.14, 0.1, 0xffe0a0); b.w(-1).ch('main'); } // a jar lantern on the table
    }
    const nch = q === 2 ? 4 : q === 1 ? rng.int(2, 4) : rng.int(2, 3);
    const inT = (px, pz) => px > Math.min(xi, xo) + 0.3 && px < Math.max(xi, xo) - 0.3 && pz > zb + 0.3 && pz < zf - 0.3;
    for (let n = 0; n < nch; n++) { const a = (n / nch) * Math.PI * 2 + rng.range(-0.3, 0.3) + k, ccx = x + Math.cos(a) * 0.75, ccz = z + Math.sin(a) * 0.75; if (!inT(ccx, ccz)) continue; seat(ccx, ccz, Math.atan2(x - ccx, z - ccz)); }
    // the sun: every table out in the open gets a parasol (a beer-brand one, a beach one, a patched one; tilted on a bare roof)
    const shaded = shade && Math.abs(x - scx) < sw / 2 + 0.2 && Math.abs(z - scz) < sd / 2 + 0.2;
    if (!shaded && rng.chance([0.75, 0.9, 0.95][q])) {
      const uc = col(rng.pick(q === 2 ? [0xe8dcc4, 0xc84a3a, 0x3a6a8a, 0x5a8a5a, 0xd8a838] : [0xb83a2a, 0x2f5a8a, 0xd8b030, 0x3a7a4a, 0xe8e0d0, 0x8a3a6a]), 0.05, rng).lerp(col(0xc8c0b0), q === 0 ? 0.35 : 0.1);
      const tilt = q === 0 ? rng.range(0.1, 0.25) : 0, ta = rng.range(0, 6.28), hx = x + Math.cos(ta) * Math.sin(tilt) * 2.2, hz = z + Math.sin(ta) * Math.sin(tilt) * 2.2;
      b.t('metal').beam([x, y, z], [hx, y + 2.25, hz], 0.025, 5, col(q === 2 ? WOOD.dark : 0x8a8a84, 0.04, rng));
      b.t('fabric'); const R = q === 0 ? 1.0 : 1.2, n = 8;
      for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, rim = (aa) => [hx + Math.cos(aa) * R, y + 1.95, hz + Math.sin(aa) * R];
        const tc2 = i % 2 && q >= 1 ? uc.clone().offsetHSL(0, 0, 0.12) : uc; b.tri([hx, y + 2.35, hz], rim(a0), rim(a1), tc2).tri([hx, y + 2.35, hz], rim(a1), rim(a0), tc2); }
    }
    if (q >= 1 && rng.chance(0.25)) { b.t('plain').cyl(x + 0.25, y + 0.76, z - 0.2, 0.09, 0.1, 0.03, 8, col(0xd8d4c8)).cyl(x + 0.25, y + 0.9, z - 0.2, 0.015, 0.015, 0.26, 4, col(0xd8d4c8)); b.cyl(x + 0.25, y + 1.06, z - 0.2, 0.13, 0.13, 0.05, 10, col(rng.pick([0x5a8aa0, 0xd8d4c8, 0x6a9a6a]), 0.04, rng), 0, Math.PI / 2); } // a desk fan
  }
  // the clutter of a used roof: a cooler, a crate of empties, a grill, a stack of chairs, a big plant in a drum
  const STUFF = q === 0 ? { crates: 2, drum: 1.5, empties: 2, grill: 1, chairs: 0.5, cooler: 0.6 } : q === 1 ? { cooler: 1.5, empties: 1.2, grill: 1.2, chairs: 1, bigplant: 1.2, radio: 0.8 } : { cooler: 1.2, bigplant: 2.5, grill: 0.8, chairs: 0.6, radio: 0.6 };
  const nS = Math.min(6, 2 + Math.floor(tw * td / 6)), edge = [];
  for (let x = Math.min(xi, xo) + 0.45; x <= Math.max(xi, xo) - 0.45; x += 0.9) edge.push([x, zb + 0.4]);
  for (let z = zb + 0.4; z <= zf - 0.5; z += 0.9) edge.push([xo - sx * 0.45, z]);
  const pickE = () => { for (let tr = 0; tr < 8; tr++) { const [x, z] = rng.pick(edge); if (ok(x, z, 0.45)) return [x, z]; } return null; };
  for (let k = 0; k < nS; k++) {
    const what = rng.weighted(STUFF), P = pickE(); if (!P) break; const [x, z] = P; taken.push([x, z, 0.5]);
    if (what === 'crates') { b.t('wood'); const n = rng.int(1, 3); for (let i = 0; i < n; i++) b.box(x, y + 0.17 + i * 0.34, z, 0.5, 0.32, 0.38, wd(rng), rng.range(-0.2, 0.2)); }
    else if (what === 'drum') b.t('rust').cyl(x, y + 0.45, z, 0.29, 0.29, 0.9, 10, rust(rng));
    else if (what === 'empties') { b.t('wood').box(x, y + 0.13, z, 0.5, 0.26, 0.36, col(rng.pick([0xc8a040, 0x8a3a2a, 0x3a5a3a]), 0.06, rng), rng.range(0, 3)); b.t('plain'); for (let i = 0; i < 6; i++) b.cyl(x - 0.15 + (i % 3) * 0.15, y + 0.33, z - 0.08 + Math.floor(i / 3) * 0.16, 0.03, 0.035, 0.16, 6, col(rng.pick([0x3a5a2a, 0x6a3a1a]), 0.05, rng)); }
    else if (what === 'cooler') b.t('plain').box(x, y + 0.22, z, 0.6, 0.42, 0.4, col(rng.pick([0x9a3a2a, 0x3a6a8a, 0xc8c0b0, 0x4a7a5a]), 0.05, rng), rng.range(-0.3, 0.3)).box(x, y + 0.45, z, 0.62, 0.05, 0.42, col(0xe8e4dc, 0.03, rng), rng.range(-0.3, 0.3));
    else if (what === 'grill') { b.t('rust').cyl(x, y + 0.6, z, 0.32, 0.26, 0.22, 10, rust(rng)); for (const a of [0, 2.1, 4.2]) b.beam([x, y + 0.5, z], [x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3], 0.015, 3, rust(rng)); b.t('metal').box(x, y + 0.72, z, 0.55, 0.01, 0.55, col(0x2a2a28)); }
    else if (what === 'chairs') { const cc = col(rng.pick([0xe8e4dc, 0x3a6a8a, 0xc84a3a]), 0.05, rng); b.t('plain'); for (let i = 0; i < rng.int(3, 5); i++) b.box(x, y + 0.45 + i * 0.07, z, 0.42, 0.05, 0.42, cc).box(x, y + 0.7 + i * 0.07, z - 0.19, 0.42, 0.45, 0.04, cc); b.box(x, y + 0.22, z, 0.36, 0.44, 0.36, cc.clone().offsetHSL(0, 0, -0.08)); }
    else if (what === 'bigplant') { b.t('plain').cyl(x, y + 0.28, z, 0.3, 0.24, 0.56, 10, q === 2 ? col(rng.pick(GLAZED), 0.04, rng) : col(rng.pick(TERRA), 0.05, rng)); fplant(b, rng.pick(['shrub', 'sansevieria', 'aloe', 'bougainvillea']), x, y + 0.56, z, 1.0, rng); }
    else if (what === 'radio') { b.t('wood').box(x, y + 0.2, z, 0.45, 0.4, 0.35, wd(rng)); b.t('metal').box(x, y + 0.52, z, 0.36, 0.22, 0.14, col(rng.pick([0x5a4a3a, 0x8a3a2a, 0x3a4a5a]), 0.05, rng)); }
  }
  // papel picado across a good terrace
  if (q === 2 || (q === 1 && rng.chance(0.4))) { const a0 = [xi, zb + 0.3], a1 = [xo, zf - 0.3], L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), n = Math.round(L / 0.32), hy = y + 2.0;
    b.t('plain').beam([a0[0], hy, a0[1]], [a1[0], hy, a1[1]], 0.005, 3, col(0x3a3a3a));
    b.t('fabric'); const ry = Math.atan2(a1[0] - a0[0], a1[1] - a0[1]) + Math.PI / 2; for (let i = 1; i < n; i++) { const t = i / n; b.box(a0[0] + (a1[0] - a0[0]) * t, hy - 0.14 - Math.sin(Math.PI * t) * 0.25, a0[1] + (a1[1] - a0[1]) * t, 0.24, 0.26, 0.005, col(rng.pick([0xe0306a, 0xe8c030, 0x30a0d0, 0x40b060, 0xe86a30, 0xa040c0]), 0.05, rng), ry); } }
  // pots: a tin or two on a bare roof; clay pots along the rail on a plain one; crowded and glazed on a good one
  const potStep = q === 0 ? 1.0 : q === 1 ? 0.7 : 0.5, potP = q === 0 ? 0.6 : q === 1 ? 0.8 : 0.9;
  for (let x = Math.min(xi, xo) + 0.3; x <= Math.max(xi, xo) - 0.3; x += potStep) if (rng.chance(potP) && ok(x, zf - 0.15, 0.2)) container(b, rng, x, y, zf - 0.15, q === 0, false);
  for (let z = zf - 0.6; z >= zb + 0.3; z -= potStep) if (rng.chance(potP) && ok(xo - sx * 0.15, z, 0.2)) container(b, rng, xo - sx * 0.15, y, z, q === 0, false);
  if (q >= 1) { const ax = xi + sx * 0.4, az = zf - 0.4; if (ok(ax, az, 0.35)) { b.t('rust').cyl(ax, y + 0.3, az, 0.3, 0.28, 0.6, 10, q === 2 ? col(rng.pick(GLAZED), 0.04, rng) : rust(rng)); fplant(b, q === 2 ? 'bougainvillea' : rng.pick(['aloe', 'sansevieria', 'shrub']), ax, y + 0.6, az, 0.9, rng); } }
  // lights: a bare bulb; a string along the rail; strings across the shade
  b.t('plain');
  const strand = (a0, a1, h0, sag) => { const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), n = Math.max(2, Math.round(L / 0.55));
    b.beam([a0[0], y + h0, a0[1]], [a1[0], y + h0, a1[1]], 0.006, 3, col(0x2a2a2a));
    if (h0 < H - 0.2) { b.t('wood'); for (const e of [a0, a1]) if (!taken.some(([tx, tz, tr]) => tr < 0.3 && Math.hypot(tx - e[0], tz - e[1]) < 0.4)) b.cyl(e[0], y + h0 / 2 + 0.05, e[1], 0.025, 0.03, h0 + 0.1, 5, pc); b.t('plain'); } // a stick at each end
    b.ch('lamp').w(lr); for (let i = 1; i < n; i++) { const t = i / n; b.box(a0[0] + (a1[0] - a0[0]) * t, y + h0 - 0.04 - Math.sin(Math.PI * t) * sag, a0[1] + (a1[1] - a0[1]) * t, 0.06, 0.08, 0.06, q === 2 && i % 3 === 1 ? rng.pick([0xffb0a0, 0xa0d0ff, 0xfff0c0]) : 0xfff0c0); } b.w(-1).ch('main'); };
  if (q === 0) { if (shade === 'tarp' || rng.chance(0.5)) strand([xi, zf - 0.2], [xo, zf - 0.2], 1.7, 0.25); else { b.beam([cx, y + 2.0, cz], [cx, y + 1.7, cz], 0.006, 3, col(0x2a2a2a)); b.ch('lamp').w(lr).box(cx, y + 1.66, cz, 0.07, 0.1, 0.07, 0xfff0c0).w(-1).ch('main'); } }
  else if (q === 1) strand([xi, zf], [xo, zf], shade ? H - 0.1 : 1.6, 0.18);
  else if (shade) { strand([poles[0][0], poles[0][1]], [poles[3][0], poles[3][1]], H - 0.08, 0.22); strand([poles[1][0], poles[1][1]], [poles[2][0], poles[2][1]], H - 0.08, 0.22); strand([xi, zf], [xo, zf], 1.25, 0.12); }
  else { strand([xi, zf], [xo, zf], 1.25, 0.12); strand([xo, zf], [xo, zb], 1.25, 0.12); }
  const p = c.toLocal(cx, y + 1.9, cz); c.info.lights.push({ x: p[0], y: p[1], z: p[2], color: LIGHT_COL.incandescent, radius: [3.5, 6, 8][q], intensity: [0.5, 0.8, 1.0][q], kind: 'lamp', r: lr, flicker: false });
  // extras: a brazier, a radio on a crate, and on a big roof a second sitting corner across the way
  if (rng.chance(q === 0 ? 0.6 : 0.35)) { const bx = xo - sx * 0.6, bz = zb + 0.6; if (ok(bx, bz, 0.4)) { b.t('metal').cyl(bx, y + 0.35, bz, 0.3, 0.22, 0.4, 10, rust(rng)); b.cyl(bx, y + 0.1, bz, 0.04, 0.04, 0.2, 4, rust(rng)); const qq = c.toLocal(bx, y + 0.7, bz); c.info.lights.push({ x: qq[0], y: qq[1], z: qq[2], color: LIGHT_COL.fire, radius: 4, intensity: 0.7, kind: 'fire', r: c.lightR(true, false), flicker: true }); taken.push([bx, bz, 0.4]); } }
  if (area >= 70 && q >= 1) { // a bench under the far parapet with pots either side
    const bx = -sx * (X1 - 0.3), z0 = -Z1 * 0.2;
    if (ok(bx, z0, 0.9)) { b.t('wood').box(bx, y + 0.42, z0, 0.4, 0.06, 1.6, wd(rng)).box(bx, y + 0.2, z0 - 0.6, 0.35, 0.4, 0.08, wd(rng)).box(bx, y + 0.2, z0 + 0.6, 0.35, 0.4, 0.08, wd(rng)); for (const d of [-1.1, 1.1]) if (ok(bx, z0 + d, 0.2)) container(b, rng, bx, y, z0 + d, false, false); }
  }
  if (rich) { // the good side of town: the whole roof is lived on — planters along the parapet, slatted screens with
    // greenery, a string of lights the length of the roof, a pair of speakers on poles, loungers in the open part
    const planter = (x, z, w, ry) => { const pcl = col(rng.pick([0xe8e0d0, 0xa8643c, 0x6a6a68, 0x3f6478]), 0.04, rng);
      b.push(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry))); b.t('plain').box(0, 0.22, 0, w, 0.44, 0.4, pcl); b.t('dirt').box(0, 0.445, 0, w - 0.08, 0.02, 0.32, col(0x5a4632)); b.pop();
      for (let t = -w / 2 + 0.25; t <= w / 2 - 0.2; t += 0.45) { const px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t; fplant(b, rng.weighted({ shrub: 2, flowers: 1.5, geranium: 1, sansevieria: 0.8, herb: 0.6 }), px, y + 0.45, pz, 0.6, rng); } };
    for (const [ax, az, bx2, bz2, ry] of [[-X1 + 0.3, Z1 - 0.1, X1 - 0.3, Z1 - 0.1, 0], [-X1 + 0.3, -Z1 + 0.1, X1 - 0.3, -Z1 + 0.1, 0], [-X1 + 0.1, -Z1 + 0.6, -X1 + 0.1, Z1 - 0.6, Math.PI / 2], [X1 - 0.1, -Z1 + 0.6, X1 - 0.1, Z1 - 0.6, Math.PI / 2]]) {
      const L = Math.hypot(bx2 - ax, bz2 - az), n = Math.floor(L / 1.6);
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = ax + (bx2 - ax) * t, z = az + (bz2 - az) * t, x2 = x + (ry ? Math.sign(-x) * 0.12 : 0), z2 = z + (ry ? 0 : Math.sign(-z) * 0.12);
        if (rng.chance(0.7) && ok(x2, z2, 0.55)) { planter(x2, z2, 1.1, ry); taken.push([x2, z2, 0.6]); } }
    }
    for (let k = 0; k < 2; k++) { const x = k ? xi + sx * 0.2 : (xi + xo) / 2, z = k ? cz : zb - 0.25, ry = k ? Math.PI / 2 : 0;
      if (!ok(x, z, 0.9)) continue; taken.push([x, z, 1.0]); planter(x, z, 1.8, ry);
      b.push(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry))); b.t('wood'); const sc = col(rng.pick([WOOD.dark, 0x8a6a4a, 0x5a4a3a]), 0.05, rng);
      for (let t = -0.85; t <= 0.86; t += 0.17) b.box(t, 1.15, -0.1, 0.06, 1.4, 0.04, sc); b.box(0, 1.85, -0.1, 1.8, 0.05, 0.06, sc); b.pop(); }
    const colored = ['cafe', 'cantina'].includes(c.spec.kind) || c.spec.biz === 'restaurante';
    { const pz2 = zb - 0.6 > -Z1 + 1 ? (zb - Z1) / 2 : -Z1 + 0.8, A = [-X1 + 0.4, pz2], B = [X1 - 0.4, pz2 + rng.range(-0.6, 0.6)], L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.round(L / 0.5);
      b.t('wood'); for (const e of [A, B]) b.cyl(e[0], y + 1.2, e[1], 0.03, 0.035, 2.4, 5, pc);
      b.t('plain').beam([A[0], y + 2.3, A[1]], [B[0], y + 2.3, B[1]], 0.006, 3, col(0x2a2a2a));
      const CC = colored ? [0xff6a5a, 0xffd25a, 0x6ad06a, 0x5ab0ff, 0xd06aff] : [0xfff0c0];
      b.ch('lamp').w(lr); for (let i = 1; i < n; i++) { const t = i / n; b.box(A[0] + (B[0] - A[0]) * t, y + 2.25 - Math.sin(Math.PI * t) * 0.35, A[1] + (B[1] - A[1]) * t, 0.06, 0.08, 0.06, CC[i % CC.length]); } b.w(-1).ch('main');
      const pq = c.toLocal(0, y + 2, pz2); c.info.lights.push({ x: pq[0], y: pq[1], z: pq[2], color: colored ? 0xffc8a0 : LIGHT_COL.incandescent, radius: 7, intensity: 0.7, kind: 'lamp', r: lr, flicker: false }); }
    for (const [x, z] of [[xo - sx * 0.35, zf - 0.35], [xi + sx * 0.35, zf - 0.35]]) { if (!ok(x, z, 0.25)) continue; taken.push([x, z, 0.3]); const ra = Math.atan2(cx - x, cz - z);
      b.t('metal').cyl(x, y + 0.9, z, 0.025, 0.03, 1.8, 5, col(METAL.dark)); b.t('plain').box(x, y + 1.95, z, 0.26, 0.4, 0.22, col(0x1a1a1a), ra).box(x + Math.sin(ra) * 0.01, y + 1.98, z + Math.cos(ra) * 0.01, 0.18, 0.18, 0.225, col(0x3a3a3a), ra); }
    for (let k = 0; k < 3; k++) { const x = rng.range(-X1 + 1, X1 - 1), z = rng.range(-Z1 + 1, Z1 - 1); if (Math.abs(x - cx) < tw / 2 && Math.abs(z - cz) < td / 2) continue; if (!ok(x, z, 1.0)) continue; taken.push([x, z, 1.0]);
      const lc = col(rng.pick([0xe8e0d0, 0x3a6a8a, 0xc84a3a, 0xd8a838]), 0.04, rng), ry = rng.pick([0, Math.PI]);
      b.push(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry))); b.t('wood').box(0, 0.2, 0.15, 0.62, 0.08, 1.4, wd(rng)).box(0, 0.42, -0.72, 0.62, 0.08, 0.7, wd(rng), 0, -0.9);
      b.t('fabric').box(0, 0.27, 0.15, 0.56, 0.06, 1.3, lc); b.pop(); }
  }
}

// radio roof: a lattice mast and a tangle of antennas, a salvaged dish, a whip or two, the cables down the wall
function roofRadio(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofradio`), x1 = iw / 2 - 0.5, z1 = id / 2 - 0.5, tS = c._tankSide || 1, mc = col(rng.pick([0x8a8c8e, 0x9a6a4a, 0x6a6c6e]), 0.05, rng);
  const mx = hasTank(c, m) || c.roofPowerKind ? 0 : -tS * (x1 - 0.4), mz = -z1 + 0.4, H = rng.range(6, 9);
  b.t('metal'); for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) b.beam([mx + sx * 0.25, y, mz + sz * 0.22], [mx + sx * 0.06, y + H, mz + sz * 0.05], 0.025, 3, mc);
  for (let h = 0.6; h < H; h += 0.7) { const s2 = 0.25 * (1 - h / H) + 0.06; b.beam([mx - s2, y + h, mz - s2], [mx + s2, y + h + 0.35, mz - s2], 0.012, 3, mc); }
  for (const [h, L] of [[H - 0.3, 1.6], [H - 1.4, 1.1], [H * 0.6, 0.8]]) b.box(mx, y + h, mz, L, 0.03, 0.03, mc, rng.range(0, 3)); // yagi / dipole arms
  for (let k = 0; k < 3; k++) b.beam([mx, y + H * (0.4 + k * 0.2), mz], [mx + rng.range(-2.5, 2.5), y, mz + rng.range(1, 3)], 0.008, 3, col(0x3a3a3a)); // guy wires
  if (rng.chance(0.8)) { const dx = tS * (x1 - 0.8), dz = z1 - 1.4; if (spotOK(c, m, iw, id, dx, dz, 1.0)) { b.t('metal').cyl(dx, y + 0.5, dz, 0.05, 0.05, 1.0, 6, mc); b.cyl(dx, y + 1.1, dz + 0.15, 0.7, 0.55, 0.12, 14, col(rng.pick([0xc8c8c0, 0x9a9a92])), -1.0); } }
  b.t('metal'); for (let k = 0; k < rng.int(2, 4); k++) { const wx = rng.range(-x1, x1), wz = rng.range(-z1, z1 - 1.5); if (spotOK(c, m, iw, id, wx, wz, 0.6)) b.beam([wx, y, wz], [wx + rng.range(-0.2, 0.2), y + rng.range(2, 3.5), wz], 0.012, 3, mc); }
  b.t('plain').box(mx + 0.3, y - 1.2, -(z1 + 0.85), 0.03, 2.4, 0.03, col(0x2a2a2a)); // the cable down the back wall
  if (rng.chance(0.7)) { b.t('metal').box(-tS * (x1 - 0.5), y + 0.3, z1 - 0.8, 0.6, 0.6, 0.4, col(0x5a6a5a, 0.05, rng)); } // a battery / set box under a tin hood
}

// smoke and cook roof: a drum stove or a small horno, firewood, jerky racks of brahmin meat, a pot on a grill
function roofSmoke(b, c, iw, id, y, m) {
  const rng = new RNG(`${c.spec.id}:roofsmoke`), x1 = iw / 2 - 0.5, z1 = id / 2 - 0.5, tS = c._tankSide || 1;
  const sx = tS * (x1 - 0.6), sz = z1 - 0.7;
  if (rng.chance(0.5)) { b.t('metal').cyl(sx, y + 0.45, sz, 0.3, 0.3, 0.9, 12, rust(rng), 0, 0, Math.PI / 2); b.cyl(sx + 0.3, y + 1.2, sz, 0.06, 0.06, 1.2, 6, rust(rng)); }
  else { b.t('adobe').cyl(sx, y + 0.35, sz, 0.55, 0.65, 0.7, 10, col(0xb08a62, 0.05, rng)); b.cyl(sx, y + 0.8, sz, 0.2, 0.5, 0.35, 10, col(0xb08a62, 0.05, rng)); }
  const e = c.toLocal(sx, y + 1.8, sz); c.info.emitters.push({ type: 'smoke', p: e, inhabited: c.inhabited });
  const fl = c.toLocal(sx, y + 0.5, sz); c.info.lights.push({ x: fl[0], y: fl[1], z: fl[2], color: LIGHT_COL.fire, radius: 3, intensity: 0.5, kind: 'fire', r: c.lightR(false, false), flicker: true });
  b.t('bark'); for (let i = 0; i < 14; i++) b.cyl(sx - tS * 1.0, y + 0.07 + Math.floor(i / 5) * 0.12, sz - 0.2 - (i % 5) * 0.12, 0.05, 0.06, 0.8, 5, wd(rng), Math.PI / 2, Math.PI / 2);
  // jerky racks across the roof
  for (let k = 0; k < Math.max(1, Math.min(3, Math.floor(id / 2.2))); k++) {
    const z = -z1 + 1.8 + k * 1.2; if (z > z1 - 1.8) break; const xa = -x1 + 0.3, xb = x1 - 1.6;
    b.t('wood'); for (const x of [xa, xb]) b.box(x, y + 0.9, z, 0.05, 1.8, 0.05, col(WOOD.pole)); b.box((xa + xb) / 2, y + 1.75, z, xb - xa, 0.04, 0.04, col(WOOD.pole));
    b.t('plain'); for (let x = xa + 0.3; x < xb - 0.2; x += 0.22) { const h = rng.range(0.35, 0.7); b.box(x, y + 1.72 - h / 2, z, 0.08, h, 0.04, col(rng.pick([0x6a2e24, 0x5a2a20, 0x7a3a2a]), 0.06, rng)); }
  }
  if (rng.chance(0.6)) { const gx = -tS * (x1 - 0.8), gz = z1 - 1.0; if (spotOK(c, m, iw, id, gx, gz)) { b.t('metal').box(gx, y + 0.6, gz, 0.8, 0.04, 0.5, col(METAL.dark)); for (const [a, bb] of [[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]]) b.box(gx + a, y + 0.3, gz + bb, 0.04, 0.6, 0.04, col(METAL.dark)); b.cyl(gx, y + 0.78, gz, 0.22, 0.2, 0.3, 10, col(0x3a3230)); } }
}

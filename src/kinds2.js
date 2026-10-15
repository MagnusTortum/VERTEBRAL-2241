// Batch 7 dressing for the rest of the valley town: mission complex, troje, tahona mill, bodega, town
// hall, comandancia (post-war / re-used pre-war station), trade workshops, and the Pemex station.
// Geometry goes into the structure's builder; loose items (pumps, sacks, ovens, flags...) go out as
// info.props, which the world adds as generated props round the structure.
import { LEAF } from './textures.js';
import { col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL, ROOF } from './palette.js';
import { LIGHT_COL } from './presets.js';

const DEG = 180 / Math.PI;

export function dressValley(b, c, masses, info, S) {
  const lay = c.layout; if (!lay) return;
  const { rng } = c, m = masses.find((q) => q.main) || masses[0], mr = ((m.rot || 0) * Math.PI) / 180;
  const front = info.walls.front, fd = info.openings.find((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && o.side === 'front' && o.main);
  b.pushT(m.x, 0, m.z, mr);
  const w = m.w, d = m.d, zf = d / 2, fh = c.fh, F = c.floors0 || 1, roofY = F * fh;
  const toM = (x, z) => { const dx = x - m.x, dz = z - m.z; return [dx * Math.cos(mr) - dz * Math.sin(mr), dx * Math.sin(mr) + dz * Math.cos(mr)]; };
  const doorX = fd ? toM(fd.x, fd.z)[0] : 0;
  const prop = (type, x, z, ry = 0, o = {}) => { const p = c.toLocal(x, 0, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry)); (info.props ||= []).push({ type, x: p[0], z: p[2], rot: Math.atan2(nx, nz) * DEG, ...o }); };
  const sign = (text, x, y, z, ry, sw, sh, style, opts = {}) => { const p = c.toLocal(x, y, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry)); info.signs.push({ text, x: p[0], y: p[1], z: p[2], ry: Math.atan2(nx, nz), w: sw, h: sh, style, rng: new RNG(`${c.spec.id}:${text}:${x.toFixed(1)}`), opts }); };
  const smoke = (x, y, z) => { const p = c.toLocal(x, y, z); info.emitters.push({ type: 'smoke', p, inhabited: c.inhabited, small: true }); };
  const light = (x, y, z, radius = 7, intensity = 1, essential = false) => { const p = c.toLocal(x, y, z); info.lights.push({ x: p[0], y: p[1], z: p[2], color: LIGHT_COL.incandescent, radius, intensity, kind: 'lamp', r: c.lightR(essential, true), flicker: false }); };
  const rel = (q) => [q.x - m.x, q.z - m.z]; // other masses (all unrotated in these plans) in the main frame
  const wallC = c.colors.old, trim = c.colors.trim;
  const live = c.inhabited && !c.damage;

  switch (lay) {
    case 'mission': {
      const a = m.atrium || 6, ax0 = -w / 2 - 0.2, ax1 = w / 2 + Math.min(2.5, (c.spec.size?.[0] || w) - w), az0 = zf, az1 = zf + a - 0.3, wh = 1.5, wc = wallC.clone().offsetHSL(0, 0, -0.03);
      // atrium: low wall with a capping, an arched gate in the middle of the front, the atrial cross, paving
      b.t('laja').box((ax0 + ax1) / 2, 0.04, (az0 + az1) / 2, ax1 - ax0, 0.08, az1 - az0, col(0xb8ac98, 0.03, rng));
      const seg = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(z1 - z0, x1 - x0); b.t(c.L.old).box((x0 + x1) / 2, wh / 2, (z0 + z1) / 2, L, wh, 0.4, wc, -ry); b.t('stone').box((x0 + x1) / 2, wh + 0.06, (z0 + z1) / 2, L + 0.1, 0.12, 0.5, col(0xd8ccb4, 0.03, rng), -ry); };
      const gx = (ax0 + ax1) / 2, gw = 1.6;
      seg(ax0, az0, ax0, az1); seg(ax1, az0, ax1, az1); seg(ax0, az1, gx - gw, az1); seg(gx + gw, az1, ax1, az1);
      b.t(c.L.old); for (const sd of [-1, 1]) b.box(gx + sd * gw, 1.5, az1, 0.6, 3.0, 0.6, wc);
      b.box(gx, 3.25, az1, gw * 2 + 0.6, 0.5, 0.6, wc); b.t('stone').box(gx, 3.75, az1, 0.12, 0.6, 0.12, col(0xd8ccb4)).box(gx, 3.85, az1, 0.42, 0.1, 0.1, col(0xd8ccb4));
      const cz = (az0 + az1) / 2 + 0.6;
      b.t('stone').box(gx, 0.5, cz, 1.2, 1.0, 1.2, col(0xd8ccb4, 0.03, rng)).box(gx, 1.9, cz, 0.18, 1.9, 0.18, col(0xd0c4ac)).box(gx, 2.4, cz, 0.9, 0.16, 0.16, col(0xd0c4ac));
      for (const sd of [-1, 1]) prop('pot_plant', gx + sd * 1.2, cz + 1.0);
      for (const sd of [-1, 1]) prop('banner', doorX + sd * 2.6, zf + 1.1); // Red Misionera banners by the church door
      sign(c.spec.signText || 'MISIÓN', gx, 2.75, az1 + 0.31, 0, 2.4, 0.5, 'painted', { bg: '#' + wc.getHexString() });
      // the school sign and the cloister well
      const sch = masses.find((q) => q.school); if (sch) { const [sx, sz] = rel(sch); sign(rng.pick(['ESCUELA', 'ESCUELA MISIONAL', 'LA PRÁCTICA']), sx, 2.55, sz + sch.d / 2 + 0.03, 0, 2.6, 0.45, 'painted'); }
      const cv = masses.find((q) => q.portal); if (cv) { const [vx, vz] = rel(cv); prop('well', vx, vz + cv.d / 2 + 4.0, 0, { variant: 'town' }); prop('bench_park', vx - 3, vz + cv.d / 2 + 2.6); }
      break;
    }
    case 'troje': {
      b.t('plain'); for (const [x, z, ry] of [[-w / 4, zf + 0.01, 0], [w / 4, zf + 0.01, 0], [w / 2 + 0.01, 0, Math.PI / 2], [-w / 2 - 0.01, 0, Math.PI / 2]]) b.box(x, fh - 0.45, z, 0.4, 0.16, 0.03, col(0x1a1614), ry);
      prop('sacks', doorX + 1.8, zf + 0.9); if (rng.chance(0.6)) prop('cuexcomate', w / 2 + 2.2, rng.range(-d / 4, d / 4));
      break;
    }
    case 'tahona': {
      prop('tahona', w / 2 + 4.2, zf - d / 2 + 0.5, rng.range(0, 6.28)); prop('sacks', doorX - 1.6, zf + 0.9); if (live && rng.chance(0.6)) prop(rng.chance(0.5) ? 'burro' : 'brahmin', w / 2 + 6.4, zf - d / 2 + 2);
      break;
    }
    case 'bodega': {
      // vine pergola over the door, barrels on cradles, the press
      const px = doorX, pc = col(WOOD.pole, 0.05, rng), vine = [0x4a6a32, 0x5a7a3a, 0x3e5a2c];
      b.t('bark'); for (const sx of [-1.6, 1.6]) for (const pz of [zf + 0.4, zf + 3.0]) b.cyl(px + sx, 1.35, pz, 0.08, 0.09, 2.7, 6, pc);
      b.t('wood'); for (const sx of [-1.6, 1.6]) b.box(px + sx, 2.75, zf + 1.7, 0.12, 0.12, 3.2, pc); for (let z = zf + 0.4; z <= zf + 3.0; z += 0.45) b.box(px, 2.85, z, 3.6, 0.07, 0.07, pc);
      for (let k = 0; k < 14; k++) b.leafFlat(px + rng.range(-1.7, 1.7), 2.93 + rng.range(-0.04, 0.06), zf + rng.range(0.4, 3.0), rng.range(0.9, 1.4), 16 + LEAF.vine, col(0xffffff, 0.08, rng), rng.next() * 6); void vine;
      for (const sx of [-1.6, 1.6]) b.leafCard(px + sx, 0, zf + 0.4, 0.7, 2.8, rng.next() * 3, 16 + LEAF.vine, col(0xffffff, 0.08, rng));
      prop('barrel_rack', doorX - 3.8, zf + 1.4, 0, { count: 3 }); prop('wine_press', w / 2 + 1.8, zf - 1.2); prop('crates', doorX + 3.4, zf + 1.0);
      break;
    }
    case 'presidencia': {
      // clock pediment over the front, a flag, a notice board, benches
      const py = roofY + 0.55, pc = wallC;
      b.t(c.L.old).box(0, py + 0.5, zf - 0.2, 2.8, 1.6, 0.4, pc); b.t('stone').box(0, py + 1.36, zf - 0.2, 3.0, 0.12, 0.5, trim);
      b.t('plain').cyl(0, py + 0.55, zf + 0.02, 0.5, 0.5, 0.05, 20, col(0xf0ece2), Math.PI / 2, 0, 0);
      b.box(0, py + 0.67, zf + 0.06, 0.04, 0.26, 0.02, col(0x1a1a1a)).box(0.12, py + 0.55, zf + 0.06, 0.25, 0.035, 0.02, col(0x1a1a1a));
      sign(c.spec.signText || ((c.spec.name || c.spec._name || '').includes(' de ') ? (c.spec.name || c.spec._name).toUpperCase().replace(' DE ', '\nDE ') : null) || rng.pick(['PRESIDENCIA MUNICIPAL', 'DELEGACIÓN MUNICIPAL', 'AYUNTAMIENTO']), 0, roofY - 0.45, zf + 0.04, 0, Math.min(w * 0.7, 6), 0.55, 'painted', { bg: '#' + pc.getHexString() });
      prop('flagpole', -w / 2 + 1.2, zf + 5.0); prop('notice_board', doorX + 3.0, zf + 3.6); for (const sd of [-1, 1]) prop('bench_park', doorX + sd * 5.2, zf + 4.4);
      break;
    }
    case 'post': case 'station': {
      const station = lay === 'station';
      prop('notice_board', doorX + 2.2, zf + (station ? 1.4 : 3.0), 0, { text: 'SE BUSCA' });
      prop('bench', doorX - 2.2, zf + (station ? 1.0 : 1.2));
      prop('flagpole', -w / 2 + 0.8, zf + 4.2);
      if (!station) prop('hitching_rail', doorX + 0.5, zf + 5.0);
      if (station) {
        for (const sd of [-1, 1]) prop('sandbags', doorX + sd * 1.9, zf + 1.6, 0);
        // roof lookout: a sandbag ring, four posts and a tin roof at the front corner
        const lx = -w / 2 + 1.6, lz = zf - 1.6, y = roofY + 0.05;
        b.t('fabric'); for (let k = 0; k < 14; k++) { const a2 = (k / 14) * Math.PI * 2; b.blob(lx + Math.cos(a2) * 1.25, y + 0.18 + (k % 2) * 0.28, lz + Math.sin(a2) * 1.25, 0.6, 0.28, 0.4, col(0x8a7a5a, 0.05, rng), 'ico'); }
        b.t('metal'); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(lx + sx * 1.1, y + 1.1, lz + sz * 1.1, 0.08, 2.2, 0.08, col(METAL.dark));
        b.t('corrugated').box(lx, y + 2.25, lz, 2.8, 0.06, 2.8, col(0x8a8f8c), 0, 0.06);
        // chain-link yard down one side
        const yx0 = w / 2 + 0.2, yx1 = w / 2 + 6, z0 = zf - 0.5, z1 = -d / 2 - 2;
        b.t('metal'); for (const [x0, za, x1, zb] of [[yx0, z0, yx1, z0], [yx1, z0, yx1, z1], [yx1, z1, yx0, z1]]) {
          const L = Math.hypot(x1 - x0, zb - za), n = Math.max(1, Math.round(L / 2.5));
          for (let k = 0; k <= n; k++) b.cyl(x0 + ((x1 - x0) * k) / n, 1.1, za + ((zb - za) * k) / n, 0.04, 0.04, 2.2, 6, col(0x8a8f8c));
          b.ch('glass').w(0.15).t('plain').box((x0 + x1) / 2, 1.05, (za + zb) / 2, x0 === x1 ? 0.02 : L, 2.0, x0 === x1 ? L : 0.02, col(0x6a6e70)).w(-1).ch('main').t('metal');
        }
      }
      break;
    }
    case 'tortilleria': {
      prop('sacks', doorX + 1.9, zf + 0.9, 0, { count: 6 }); prop('bench', doorX - 2.2, zf + 1.1);
      if (rng.chance(0.6)) prop('drum_stove', w / 2 + 1.2, zf - 1.0);
      b.t('metal').cyl(w / 2 - 1.0, roofY + 0.9, -d / 4, 0.12, 0.12, 1.8, 8, col(0x3a3836)); if (live) smoke(w / 2 - 1.0, roofY + 1.9, -d / 4);
      break;
    }
    case 'panaderia': {
      prop('horno', w / 2 + 1.6, zf - 1.8, -Math.PI / 2); prop('woodpile', w / 2 + 1.6, zf - 4.0); prop('table', doorX + 2.0, zf + 1.2);
      break;
    }
    case 'carniceria': {
      prop('meat_rack', doorX + 2.4, zf + 1.4); if (rng.chance(0.5)) prop('dog', doorX - 2.0, zf + 1.5);
      // a brahmin skull over the door
      const y = Math.min(roofY - 0.4, 2.75), bone = col(0xe8e0cc);
      b.t('plain'); for (const sd of [-0.18, 0.18]) b.blob(doorX + sd, y, zf + 0.12, 0.26, 0.3, 0.2, bone, 'ico');
      for (const sd of [-1, 1]) b.beam([doorX + sd * 0.3, y + 0.1, zf + 0.12], [doorX + sd * 0.75, y + 0.35, zf + 0.12], 0.04, 5, bone);
      break;
    }
    case 'herreria': {
      // a tin lean-to on the side over the forge and anvil, stock rack
      const lx = w / 2 + 1.9, pc = col(WOOD.pole, 0.05, rng);
      b.t('bark'); for (const z of [zf - 0.5, zf - 4.5]) b.cyl(lx + 1.5, 1.1, z, 0.08, 0.09, 2.2, 6, pc);
      b.t('corrugated').plank([w / 2, 2.8, zf - 2.5], [w / 2 + 3.6, 2.2, zf - 2.5], 4.8, 0.06, col(ROOF.corrugated[0], 0.06, rng));
      prop('forge', lx, zf - 3.4, -Math.PI / 2); prop('anvil', lx - 0.2, zf - 1.4); prop('barrel', lx + 1.2, zf - 0.4);
      if (live) { const p = c.toLocal(lx - 0.2, 0.95, zf - 1.4); info.emitters.push({ type: 'sparks', p, inhabited: true }); } // hammer sparks at the anvil
      b.t('metal'); for (let k = 0; k < 7; k++) b.box(lx + 1.6, 0.4 + k * 0.05, zf - 2.5 + rng.range(-0.1, 0.1), 0.06, 0.04, 3.6, col(0x4a4a48), 0, 0, 0.6);
      break;
    }
    case 'alfareria': {
      prop('kiln', w / 2 + 2.2, zf - 2.0); prop('pottery_rack', doorX + 3.0, zf + 1.4); prop('pottery_rack', doorX - 3.2, zf + 1.4);
      b.t('dirt'); b.blob(w / 2 + 1.8, 0.25, -d / 2 + 1.2, 1.6, 0.5, 1.2, col(0x9a6a48, 0.05, rng), 'ico');
      break;
    }
    case 'working': case 'stripped': case 'ruined': case 'lapemex': {
      dressPemex(b, c, m, info, { lay, prop, sign, light, rng, live });
      break;
    }
  }
  b.pop();
}

// Pemex: the canopy on square columns with the green-and-red fascia, pump islands, the tall pole
// sign, tank hatches. Stripped: pumps gone, a sagging corner. Ruined: half the canopy down.
// La Pemex (gazetteer, 24 mi north of El Largo): stripped, sagging, travellers' leftovers in the shade.
function dressPemex(b, c, m, info, { lay, prop, sign, light, rng, live }) {
  const W = m.pemexW || 16, D = m.pemexD || 18;
  // structure frame → main-mass frame offset (the office sits back right)
  const ox = -m.x, oz = -m.z;
  const cx = ox, cz = oz + (-D / 2 + m.d + 1.5 + D / 2 - 0.5) / 2, cw = Math.min(W - 1.5, 14), cd = Math.max(5, D / 2 - 0.5 - (-D / 2 + m.d + 1.5)), H = 4.6;
  const sag = lay === 'stripped' || lay === 'lapemex', ruined = lay === 'ruined', working = lay === 'working';
  const white = col(working ? 0xf2f0ea : 0xd8d4c8, 0.02, rng), green = col(0x2a7a4a, 0.03, rng), red = col(0xb82a22, 0.03, rng), conc = col(0xb0a898, 0.03, rng);
  // forecourt slab
  b.t('concrete').box(cx, 0.02, cz, cw + 3, 0.06, cd + 3, col(0xa8a296, 0.03, rng));
  // columns (a sagging corner loses its column)
  const cols = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [cx + sx * (cw / 2 - 1.2), cz + sz * (cd / 2 - 1.0)]);
  const lost = sag ? 2 : ruined ? [2, 3] : -1;
  b.t('concrete'); cols.forEach(([x, z], i) => { if (i === lost || (Array.isArray(lost) && lost.includes(i))) { if (sag || ruined) b.box(x + 0.8, 0.25, z + 0.4, 0.5, 0.5, 2.4, conc, 0.5, 0, Math.PI / 2 - 0.1); return; } b.box(x, H / 2, z, 0.5, H, 0.5, white); });
  // canopy slab + fascia (tilted toward the lost corner when sagging; ruined: the front half hangs to the ground)
  const tiltX = sag ? 0.035 : 0, tiltZ = sag ? -0.03 : 0;
  const canopy = (x, y, z, w2, d2, rx, rz) => {
    b.t('concrete').box(x, y, z, w2, 0.35, d2, white, 0, rx, rz);
    b.t('plain').box(x, y - 0.05, z + d2 / 2 + 0.02, w2 + 0.02, 0.18, 0.03, green, 0, rx, rz).box(x, y + 0.12, z + d2 / 2 + 0.03, w2 + 0.02, 0.05, 0.03, red, 0, rx, rz);
    b.box(x, y - 0.05, z - d2 / 2 - 0.02, w2 + 0.02, 0.18, 0.03, green, 0, rx, rz);
    for (const sd of [-1, 1]) b.box(x + sd * (w2 / 2 + 0.02), y - 0.05, z, 0.03, 0.18, d2, green, 0, rx, rz);
  };
  if (ruined) {
    canopy(cx, H + 0.2, cz - cd / 4, cw, cd / 2, 0, 0);
    canopy(cx, H / 2 + 0.3, cz + cd / 4 + 0.6, cw, cd / 2 + 0.4, 0.7, 0);
  } else canopy(cx, H + 0.2 - (sag ? 0.35 : 0), cz, cw, cd, tiltX, tiltZ);
  if (!ruined && !sag) sign('DAMEX', cx, H + 0.15, cz + cd / 2 + 0.06, 0, 2.6, 0.3, 'painted', { bg: '#f2f0ea', rust: !working });
  if (sag) b.t('plain').box(cx, H - 0.2, cz + cd / 2 + 0.04, 1.6, 0.12, 0.03, red, 0, tiltX, tiltZ); // the old lettering is gone, a red stripe left
  // pump islands
  for (const ix of [-cw / 4, cw / 4]) {
    b.t('concrete').box(cx + ix, 0.15, cz, 1.2, 0.25, Math.min(4.2, cd - 1.5), conc);
    if (ruined) continue;
    for (const sz of [-1, 1]) prop('gas_pump', cx + ix, cz + sz * 1.1, Math.PI / 2, { stripped: !working, color: working ? 0x2a7a4a : undefined });
  }
  // the pole sign at the front corner, tank hatches
  const sx = cx - cw / 2 - 1.2, sz2 = oz + D / 2 + 0.8, PH = 7.5; // at the street, clear of the canopy
  b.t('metal').box(sx, PH / 2, sz2, 0.3, PH, 0.3, col(0x8a8f8c));
  b.t('plain').box(sx, PH + 0.2, sz2, 2.6, 1.6, 0.35, ruined ? col(0x9a948a) : white).box(sx, PH - 0.35, sz2, 2.62, 0.2, 0.37, green);
  if (!ruined || rng.chance(0.5)) sign(working ? 'DAMEX\nGASOLINA' : 'DAMEX', sx, PH + 0.3, sz2 + 0.19, 0, 2.3, 1.2, working ? 'painted' : 'prewar', { bg: '#f2f0ea', rust: !working, missing: working ? 0 : 0.2 });
  b.t('metal'); for (let k = 0; k < 3; k++) b.cyl(cx + cw / 2 + 0.8, 0.04, cz - 1.5 + k * 1.3, 0.35, 0.35, 0.05, 14, col(0x3a3836));
  if (lay === 'lapemex') b.box(cx + cw / 2 + 0.8 + 0.45, 0.12, cz + 1.1, 0.7, 0.04, 0.7, col(0x3a3836), 0.4, 0, 0.6); // one lid off its ring
  if (working && live) { light(cx - cw / 4, H - 0.3, cz, 9, 1.1); light(cx + cw / 4, H - 0.3, cz, 9, 1.1); }
  // La Pemex: people use the shade
  if (lay === 'lapemex') {
    prop('firepit', cx - 1.0, cz + 0.8, 0, { lit: rng.chance(0.4) }); prop('crates', cx + 2.4, cz - 1.6); prop('water_jugs', cx - 2.6, cz - 1.4);
    prop('bedroll', cx - 3.2, cz + 1.6, 0.4); prop('wagon', cx + cw / 2 + 3.5, cz + 2.0, 1.2); if (rng.chance(0.6)) prop('brahmin', cx + cw / 2 + 4.5, cz - 1.5, 2.0);
  }
}

// The wasteland buildings (kind 'den'): slave pen, brothel, gambling den, chop-shop doctor, gun runner's bunker,
// bounty office, water merchant, bus / fuselage homes (their bodies are styles.js customs), junk gatehouse.
// Geometry into the structure's builder; loose things go out as info.props (the world places them round it).
import { col } from './builder.js';
import { RNG } from './rng.js';
import { WOOD, METAL } from './palette.js';
import { LIGHT_COL } from './presets.js';
import { cageGeo } from './props13.js';

const DEG = 180 / Math.PI;
const RUST = [0x6e4a34, 0x5a4232, 0x7a5440, 0x5a6a7a, 0x8a4a3a, 0x7a6a58];

export function dressDen(b, c, masses, info, S) {
  if (c.spec.kind !== 'den') return;
  const lay = c.layout; if (!lay) return;
  const { rng } = c, m = masses.find((q) => q.main) || masses[0], mr = ((m.rot || 0) * Math.PI) / 180;
  const fd = info.openings.find((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && o.side === 'front' && o.main);
  b.pushT(m.x, 0, m.z, mr);
  const w = m.w, d = m.d, zf = d / 2, fh = c.fh, F = c.floors0 || 1, roofY = F * fh;
  const toM = (x, z) => { const dx = x - m.x, dz = z - m.z; return [dx * Math.cos(mr) - dz * Math.sin(mr), dx * Math.sin(mr) + dz * Math.cos(mr)]; };
  const doorX = fd ? toM(fd.x, fd.z)[0] : 0;
  const prop = (type, x, z, ry = 0, o = {}) => { const p = c.toLocal(x, 0, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry)); (info.props ||= []).push({ type, x: p[0], z: p[2], rot: Math.atan2(nx, nz) * DEG, ...o }); };
  const sign = (text, x, y, z, ry, sw, sh, style, opts = {}) => { const p = c.toLocal(x, y, z), [nx, nz] = c.dirLocal(Math.sin(ry), Math.cos(ry)); info.signs.push({ text, x: p[0], y: p[1], z: p[2], ry: Math.atan2(nx, nz), w: sw, h: sh, style, rng: new RNG(`${c.spec.id}:${text}:${x.toFixed(1)}`), opts }); };
  const light = (x, y, z, color = LIGHT_COL.incandescent, radius = 6, intensity = 0.9, electric = true) => { const p = c.toLocal(x, y, z); info.lights.push({ x: p[0], y: p[1], z: p[2], color, radius, intensity, kind: 'lamp', r: c.lightR(false, electric), flicker: !electric }); };
  const T = (c.spec.signText || '').toUpperCase(), pick = (a) => T || rng.pick(a);
  const signY = Math.min(roofY - 0.45, 2.9);

  switch (lay) {
    case 'cages': { // the guards' hut at the back corner; a row of barred cages along the front and down the side
      const W = m.denW || w, D = m.denD || d, bx = -W / 2 - (m.x || 0), bz = -D / 2 - (m.z || 0); // the whole footprint, in the hut's frame
      const n = Math.max(1, Math.floor((W - 0.3) / 2.5));
      for (let i = 0; i < n; i++) cageGeo(b, rng, bx + 1.3 + i * 2.5, bz + D - 1.25, 2.2, 2.2, 2.1, { inside: rng.chance(0.7) });
      if (D - d > 5.5) for (let z = bz + d + 1.3; z < bz + D - 3.8; z += 2.5) cageGeo(b, rng, bx + W - 1.25, z, 2.2, 2.2, 2.1, { inside: rng.chance(0.6) });
      prop('chain_post', bx + W / 2, bz + D - 3.6); prop('firepit', bx + W * 0.65, bz + d + 1.2);
      prop('table', w / 2 + 1.4, zf - 1.2, 0, { chairs: 2 });
      sign(pick(['CORRAL', 'MERCANCÍA', 'SE VENDE']), doorX, signY, zf + 0.05, 0, 2.0, 0.5, 'painted', { rust: true });
      light(doorX + 0.9, 2.4, zf + 0.25, LIGHT_COL.fire, 5, 0.8, false);
      break;
    }
    case 'brothel': { // red lanterns either side of the door, a bench, a balcony lamp upstairs
      for (const sd of [-1, 1]) { b.t('fabric').cyl(doorX + sd * 1.0, 2.35, zf + 0.35, 0.16, 0.16, 0.36, 8, col(0xc02a2a)); light(doorX + sd * 1.0, 2.35, zf + 0.35, LIGHT_COL.neon_red, 6, 1.1); }
      sign(pick(['CASA ROJA', 'LA LUNA', 'EL PARAÍSO', 'LAS MARIPOSAS', 'CASA DE CITAS']), doorX, signY + (F > 1 ? 0 : 0), zf + 0.05, 0, 2.8, 0.6, rng.chance(0.5) ? 'neon' : 'painted', rng.chance(0.5) ? { r: c.lightR(false, true), color: 'pink' } : {});
      prop('bench', doorX - 2.4, zf + 1.2); prop('pot_plant', doorX + 1.9, zf + 0.6, 0, { count: 2 });
      if (F > 1) light(0, fh + 2.2, zf + 0.4, LIGHT_COL.neon_pink, 5, 0.7);
      break;
    }
    case 'gambling': { // a neon sign, card tables out front, a fire barrel, the doorman's stool
      sign(pick(['CASINO', 'LA SUERTE', 'CARTAS · DADOS', 'EL AS', 'LA BARAJA']), doorX, signY, zf + 0.06, 0, 3.0, 0.7, 'neon', { r: c.lightR(false, true) });
      light(doorX, signY, zf + 0.6, LIGHT_COL.neon_yellow, 7, 1.0);
      prop('cafe_table', doorX + 3.0, zf + 1.8); prop('domino_table', doorX - 3.2, zf + 1.8); prop('fire_barrel', w / 2 + 0.8, zf + 0.6); prop('chair', doorX + 1.0, zf + 0.7);
      break;
    }
    case 'chopshop': { // a red cross daubed on the wall, a tarp off the side over the steel table, drums, a hook on a chain
      const pc = col(0xa82a2a), y0 = Math.min(roofY - 1.1, 2.1), x0 = doorX + (doorX > 0 ? -1.8 : 1.8);
      b.t('plain').box(x0, y0, zf + 0.03, 0.9, 0.28, 0.02, pc).box(x0, y0, zf + 0.035, 0.28, 0.9, 0.02, pc);
      sign(pick(['DOCTOR', 'MÉDICO · SE OPERA', 'CIRUGÍAS', 'DR. ' + rng.pick(['CUCHILLO', 'SIERRA', 'GANCHO', 'MARTILLO'])]), doorX, signY, zf + 0.05, 0, 2.4, 0.5, 'painted', { rust: true });
      const lx = w / 2 + 1.6;
      b.t('bark'); for (const z of [zf - 0.4, zf - 3.6]) b.cyl(lx + 1.2, 1.1, z, 0.06, 0.07, 2.2, 6, col(WOOD.pole));
      b.t('fabric').plank([w / 2, 2.6, zf - 2.0], [w / 2 + 2.8, 2.2, zf - 2.0], 3.8, 0.04, col(rng.pick([0x5a6a4a, 0x7a6a58, 0x4a5a6a]), 0.05, rng));
      b.t('metal').box(lx, 0.9, zf - 2.0, 0.8, 0.06, 1.9, col(METAL.steel)); for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(lx + sx * 0.35, 0.45, zf - 2.0 + sz * 0.85, 0.05, 0.9, 0.05, col(METAL.dark));
      b.box(lx, 2.1, zf - 2.0, 0.04, 0.6, 0.04, col(0x3a3836));
      prop('barrel', lx + 1.3, zf - 3.8); prop('chem_table', lx + 0.2, zf - 4.6, 0); light(lx, 2.0, zf - 2.0, LIGHT_COL.incandescent, 5, 0.8);
      break;
    }
    case 'gunshop': { // a low concrete box: sandbags either side of the steel door, slits, ammo crates, wire
      sign(pick(['ARMAS', 'ARMAS Y PARQUE', 'CALIBRES', 'EL ARSENAL', 'PLOMO']), doorX, signY, zf + 0.05, 0, 2.4, 0.5, rng.chance(0.5) ? 'painted' : 'prewar', { rust: true });
      for (const sd of [-1, 1]) prop('sandbags', doorX + sd * 2.6, zf + 1.0, 0);
      prop('crates', w / 2 + 0.9, zf - 0.8, 0, { count: 3 }); prop('wire_coil', -w / 2 - 1.2, zf + 0.5, 0);
      b.t('metal').box(doorX, 2.45, zf + 0.12, 1.4, 0.12, 0.3, col(METAL.dark));
      light(doorX, 2.5, zf + 0.3, LIGHT_COL.mercury, 6, 0.9);
      break;
    }
    case 'bounty': { // the wanted board by the door, a hitching rail, a bench
      sign(pick(['RECOMPENSAS', 'SE BUSCA', 'CAZARRECOMPENSAS', 'VIVO O MUERTO']), doorX, signY, zf + 0.05, 0, 2.8, 0.55, 'painted');
      prop('notice_board', doorX + (doorX > 0 ? -2.2 : 2.2), zf + 0.5, 0); prop('hitching_rail', doorX, zf + 3.0, 0); prop('bench', doorX + (doorX > 0 ? 2.0 : -2.0), zf + 0.6);
      light(doorX, 2.4, zf + 0.3, LIGHT_COL.oil, 5, 0.8, false);
      break;
    }
    case 'water': { // the shop in front, the tank tower behind it, a pipe to the tap, the trough and jugs by the door
      const D = m.denD || d, bz = -d / 2 - (D - d) / 2;
      prop('water_tower', 0, Math.min(-d / 2 - 2.0, bz), 0);
      sign(pick(['AGUA', 'AGUA PURA', 'AGUA LIMPIA', 'SE VENDE AGUA', 'EL POZO']), doorX, signY, zf + 0.05, 0, 2.6, 0.55, 'painted', { bg: '#d8e4e0' });
      b.t('metal'); b.beam([w / 2 - 0.4, 0.9, -d / 2 - 0.5], [w / 2 - 0.4, 0.9, zf + 0.3], 0.05, 6, col(METAL.rust)); b.beam([w / 2 - 0.4, 0.9, zf + 0.3], [w / 2 - 0.4, 0.55, zf + 0.6], 0.05, 6, col(METAL.rust));
      prop('trough', w / 2 + 0.6, zf + 1.0, Math.PI / 2); prop('water_jugs', doorX - 1.6, zf + 0.6); prop('water_jugs', doorX + 1.6, zf + 0.6);
      break;
    }
    case 'bus': case 'fuselage': { // someone's home: a shade off the side, chairs, a firepit, tires
      prop('shade_cloth', 0, zf + 2.4, 0, { width: Math.min(6, w * 0.5), depth: 3 }); prop('table', 0.3, zf + 2.4, 0, { chairs: 2 });
      prop('firepit', -w / 2 + 1.5, zf + 3.6); prop('tires', w / 2 - 0.6, zf + 1.4); if (rng.chance(0.5)) prop('laundry_line', -w / 4, -zf - 1.4, 0, { length: 4 });
      break;
    }
    case 'gatehouse': { // two towers in junk armour, the gate between them, a catwalk over it, stakes out front
      const gw = m.gateW || 4, xr = w / 2 + gw + w / 2, H = roofY, sc = () => col(rng.pick(RUST), 0.08, rng);
      for (const tx of [0, xr]) for (const fz of [zf + 0.06, -zf - 0.06]) for (let k = 0; k < 6; k++) b.t('rust').box(tx + rng.range(-w / 2 + 0.5, w / 2 - 0.5), rng.range(0.6, H - 0.4), fz, rng.range(0.7, 1.4), rng.range(0.6, 1.2), 0.04, sc());
      b.t('rust'); for (let x = w / 2 + 0.1; x < w / 2 + gw - 0.1; x += 0.55) b.box(x + 0.25, 1.35, 0, 0.52, 2.7, 0.08, sc()); // the gate, sheet on sheet
      b.t('metal').box(w / 2 + gw / 2, 2.7, 0, gw, 0.1, 0.12, col(METAL.dark));
      b.t('wood').box(w / 2 + gw / 2, H + 0.05, 0, gw + 0.6, 0.12, 1.4, col(WOOD.weathered, 0.05, rng)); // the catwalk
      b.t('metal'); for (const sz of [-0.65, 0.65]) b.box(w / 2 + gw / 2, H + 0.6, sz, gw + 0.6, 0.06, 0.06, col(METAL.dark));
      for (const tx of [0, xr]) for (let k = 0; k < 8; k++) b.t('bark').cone(tx - w / 2 + 0.2 + (k * (w - 0.4)) / 7, H + 0.5, zf - 0.1, 0.05, 0.9, 5, col(WOOD.dark));
      prop('spikes', w / 2 + gw / 2 - 3.2, zf + 2.2, 0, { length: 3 }); prop('spikes', w / 2 + gw / 2 + 3.2, zf + 2.2, 0, { length: 3 });
      sign(pick(['ALTO', 'PEAJE', 'ALTO · PAGUE', 'NO PASE']), w / 2 + gw / 2, 3.15, zf - d / 2 + 0.1, 0, 1.8, 0.45, 'painted', { rust: true });
      light(w / 2 + gw / 2, H + 1.0, 0.7, LIGHT_COL.fire, 7, 1.0, false);
      break;
    }
  }
  b.pop();
}

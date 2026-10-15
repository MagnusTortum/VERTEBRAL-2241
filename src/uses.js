// Plot uses for the valley town (batch 7): plaza, cemetery, vineyard, threshing floor, brickyard,
// salvage yard, cock-fight ring (palenque), charreada ring (lienzo charro). Each lays its contents out
// in the plot's frame and bakes them as editable items tagged { inPlot, bake: 'use' } (so a use change
// clears them, a re-roll keeps what was edited by hand).
import { RNG } from './rng.js';
import { plotFrame, polySigned } from './plots.js';
import { toWorld, toLocal, pointInPoly } from './geo.js';

export const NEW_USES = ['vacant', 'slavers', 'caravan', 'chemden', 'fightpit', 'scavmarket', 'cult', 'plaza', 'cemetery', 'vineyard', 'era', 'brickyard', 'salvage', 'acopio', 'palenque', 'lienzo', 'outskirts', 'outgrounds', 'farmstead', 'mystic', 'farmers_market', 'trader', 'multifamily'];
export const USE_LABELS = { vacant: 'vacant lot (baldío)', slavers: 'slaver camp', caravan: 'caravan staging yard', chemden: 'chem den (still)', fightpit: 'fighting pit', scavmarket: 'scavenger market', cult: 'cult compound', plaza: 'plaza', cemetery: 'cemetery (panteón)', vineyard: 'vineyard', era: 'threshing floor (era)', brickyard: 'brickyard (adobera)', salvage: 'junkyard (car hulks)', acopio: 'recycling yard (centro de acopio)', outskirts: 'outskirts (homestead)', outgrounds: 'outskirt grounds (no building)', farmstead: 'farmstead (rancho)', mystic: 'mystic (curandera / bruja / seer)', farmers_market: "farmers' market (tianguis)", trader: "trader's compound (casa comercial)", multifamily: 'multi-family (vecindad / cuartería / block / compound)', palenque: 'cock-fight ring (palenque)', lienzo: 'charreada ring (lienzo charro)' };

export function planUse(spec, pl, use, opts = {}) {
  const rng = new RNG(`${opts.seed}:use:${use}:${pl.id}:${opts.v || 0}`);
  const F = plotFrame(pl), A = Math.abs(polySigned(pl.poly));
  const L = (q) => toLocal(q[0] - F.front[0], q[1] - F.front[1], F.rot), W = (u, v) => { const [x, z] = toWorld(u, v, F.rot); return [+(F.front[0] + x).toFixed(2), +(F.front[1] + z).toFixed(2)]; };
  const LP = pl.poly.map(L), us = LP.map((q) => q[0]), vs = LP.map((q) => q[1]);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, PW = u1 - u0, PD = v1 - v0;
  const edgeDist = (u, v) => { let m = 1e9; for (let i = 0; i < LP.length; i++) { const a = LP[i], b = LP[(i + 1) % LP.length], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dz) / (dx * dx + dz * dz || 1))); m = Math.min(m, Math.hypot(u - a[0] - dx * t, v - a[1] - dz * t)); } return m; };
  const ok = (u, v, r = 1) => pointInPoly(u, v, LP) && edgeDist(u, v) >= r;
  const out = { props: [], plants: [], structures: [], walls: [], fields: [], paint: [] };
  const tag = (e) => ({ ...e, inPlot: pl.id, bake: 'use' });
  const taken = [];
  const free = (u, v, r) => taken.every((t) => Math.hypot(u - t[0], v - t[1]) >= r + t[2]);
  const prop = (type, u, v, rotL = 0, o = {}, r = 1) => { if (!ok(u, v, o.edge ?? Math.min(r, 1.2)) || !free(u, v, r)) return false; taken.push([u, v, r]); out.props.push(tag({ type, at: W(u, v), rot: Math.round(F.deg + rotL), ...o })); return true; };
  const tryProp = (type, pts, rotL, o, r) => { for (const [u, v] of pts) if (prop(type, u, v, typeof rotL === 'function' ? rotL(u, v) : rotL, o, r)) return [u, v]; return null; };
  const plant = (species, u, v, r = 1.2, scale) => { if (!ok(u, v, 0.8) || !free(u, v, r)) return false; taken.push([u, v, r]); out.plants.push(tag({ species, at: W(u, v), rot: rng.int(0, 359), ...(scale ? { scale } : {}) })); return true; };
  const wall = (type, path, extra = {}) => out.walls.push(tag({ type, path: path.map(([u, v]) => W(u, v)), ...extra }));
  const ring = (n, R, a0 = 0) => Array.from({ length: n }, (_, k) => { const a = a0 + (k / n) * Math.PI * 2; return [cu + Math.cos(a) * R, cv + Math.sin(a) * R, a]; });
  const scatter = (n) => Array.from({ length: n }, () => [rng.range(u0 + 1, u1 - 1), rng.range(v0 + 1, v1 - 1)]);
  const rich = ['comfortable', 'prosperous', 'wealthy', 'rich'].includes(spec.settlement?.wealth);
  // the first of a few candidate spots (fractions of the plot box) that is inside, clear of the edge and free
  const site = (cands, r) => { for (const [fu, fv] of cands) { const u = u0 + PW * fu, v = v0 + PD * fv; if (ok(u, v, r) && free(u, v, r)) return [u, v]; } return null; };

  switch (use) {
    case 'vacant': { // a baldío: nobody's built on it (or what was built fell down). No wall, or what's left of one;
      // weeds and scrub, a path worn across, and whatever the street throws over: rubble, rubbish, tyres, a hulk
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.chance(0.75) ? 'none' : 'stone_ruin';
      const kindV = rng.weighted({ weeds: 3, ruin: PW >= 8 && PD >= 10 ? 2 : 0, dump: 1.5, goats: 1 });
      if (kindV === 'ruin') { // the shell of a house that stood here
        const w = Math.min(PW - 3, rng.range(6, 9)), d = Math.min(PD - 4, rng.range(5, 8)), at = site([[0.5, 0.3], [0.4, 0.35], [0.6, 0.35]], Math.max(w, d) / 2);
        if (at && w >= 4 && d >= 4) { taken.push([at[0], at[1], Math.max(w, d) / 2 + 0.5]); out.structures.push(tag({ id: `${pl.id}-ruin-${opts.v || 0}`, kind: 'house', origin: 'ruin', size: [Math.round(w * 4) / 4, Math.round(d * 4) / 4], at: W(at[0], at[1]), rot: Math.round(F.deg + rng.range(-4, 4)), snap: false, material: rng.pick(['adobe', 'adobe', 'block', 'brick']), floors: 1, label: false, signs: false })); }
        for (let k = 0; k < rng.int(2, 4); k++) tryProp('rubble', scatter(10), () => rng.range(0, 360), {}, 1.0);
      }
      if (kindV === 'dump') {
        tryProp(rng.pick(['car_wreck', 'truck_chassis']), scatter(10), () => rng.range(0, 360), {}, 2.4);
        for (let k = 0; k < rng.int(2, 4); k++) tryProp('trash_heap', scatter(10), () => rng.range(0, 360), { count: rng.int(5, 12) }, 0.9);
        tryProp('scrap_pile', scatter(10), () => rng.range(0, 360), {}, 1.4); tryProp('tires', scatter(10), () => rng.range(0, 360), { count: rng.int(3, 6) }, 0.9);
      }
      if (kindV === 'goats') { for (let k = 0; k < rng.int(2, 4); k++) tryProp('goat', scatter(10), () => rng.range(0, 360), {}, 0.8); }
      // every baldío: some rubbish by the street, a tyre or a cart, a few rocks, bones now and then
      for (let k = 0; k < rng.int(1, 3); k++) tryProp('trash_heap', Array.from({ length: 8 }, () => [rng.range(u0 + 1, u1 - 1), rng.range(v1 - 4, v1 - 1)]), () => rng.range(0, 360), { count: rng.int(3, 8) }, 0.8);
      if (rng.chance(0.5)) tryProp(rng.pick(['tires', 'shopping_cart', 'tires']), scatter(10), () => rng.range(0, 360), { count: rng.int(1, 3) }, 0.8);
      for (let k = 0; k < rng.int(1, 3); k++) tryProp('boulder', scatter(10), () => rng.range(0, 360), {}, 0.8);
      if (rng.chance(0.3)) tryProp('bones', scatter(10), () => rng.range(0, 360), {}, 0.6);
      if (rng.chance(0.35)) tryProp('firepit', scatter(10), 0, {}, 1.2); // somebody sleeps rough here
      const nP = Math.round(A / 40 * (kindV === 'weeds' ? 1.4 : 0.8));
      for (let k = 0; k < nP; k++) plant(rng.pick(['creosote', 'creosote', 'sage', 'cholla', 'nopal', 'mesquite', 'ocotillo']), rng.range(u0 + 1, u1 - 1), rng.range(v0 + 1, v1 - 1), 1.0, rng.range(0.7, 1.15));
      out.ground = { surface: 'natural', cover: 'all' };
      break;
    }
    case 'plaza': {
      if ((pl.fence || 'auto') === 'auto') out.fence = 'none';
      out.ground = { surface: rich ? 'laja' : rng.pick(['caliche', 'packed', 'laja']), cover: 'all' };
      const R = Math.min(PW, PD) / 2;
      // centre: the kiosko on a big plaza, a fountain-well on a small one
      if (R >= 9) prop('kiosko', cu, cv, 0, { radius: Math.min(4, R * 0.28) }, Math.min(4, R * 0.28) + 1.5);
      else prop('well', cu, cv, 0, { variant: rich ? 'town' : 'rural' }, 2);
      // a ring of shade trees, benches facing in, lamps on the corners, planters, a flag
      for (const [u, v, a] of ring(Math.max(6, Math.round(R * 0.9)), R * 0.72, 0.3)) plant(rng.weighted({ pepper_tree: 3, fan_palm: 1.5, eucalyptus: 0.6, fruit_tree: 0.6 }), u, v, 1.4);
      for (const [u, v, a] of ring(Math.max(4, Math.round(R * 0.6)), R * 0.5, 0.1)) prop('bench_park', u, v, (Math.atan2(cu - u, cv - v) * 180) / Math.PI, {}, 1.1);
      for (const [u, v] of [[u0 + 1.5, v0 + 1.5], [u1 - 1.5, v0 + 1.5], [u1 - 1.5, v1 - 1.5], [u0 + 1.5, v1 - 1.5]]) prop('street_lamp', u, v, 0, {}, 0.6);
      tryProp('flagpole', [[cu - R * 0.3, v1 - 2], [cu + R * 0.3, v1 - 2]], 0, {}, 0.8);
      for (const [u, v] of ring(4, R * 0.32, Math.PI / 4)) prop('planter', u, v, 0, {}, 0.8);
      if (rng.chance(0.7)) tryProp('notice_board', [[cu + R * 0.45, v1 - 1.5], [cu - R * 0.45, v1 - 1.5]], 0, {}, 1);
      if (rng.chance(0.6)) tryProp('food_cart', scatter(8), () => rng.range(0, 360), {}, 1.5);
      if (rng.chance(0.5)) tryProp('agua_fresca', scatter(8), () => rng.range(0, 360), {}, 1.3);
      break;
    }
    case 'cemetery': {
      out.fence = pl.fence && pl.fence !== 'auto' ? undefined : rng.pick(['adobe', 'stone', 'adobe']);
      out.ground = { surface: 'packed', cover: 'all' };
      // the main walk from the gate to a big cross / chapel at the back; graves in rows either side
      const aisle = 1.6;
      out.paint.push({ path: [W(cu, v1 - 0.5), W(cu, v0 + 3)], width: aisle, color: 0xc8b898, edge: 0.4, alpha: 0.7, layer: 'urban', layerK: 1, bake: 'use' });
      tryProp(rich ? 'tomb' : 'nicho', [[cu, v0 + 2.6]], 0, rich ? { variant: 'capilla' } : {}, 1.8);
      for (let v = v1 - 2.2; v > v0 + 4.5; v -= 2.6) for (let u = u0 + 1.4; u < u1 - 1; u += 1.35) {
        if (Math.abs(u - cu) < aisle / 2 + 0.7) continue;
        if (rng.chance(0.18)) continue;
        prop('tomb', u + rng.range(-0.1, 0.1), v, 180 + rng.range(-4, 4), { variant: rng.weighted({ cross: 3, painted: 3.5, headstone: 1, child: 0.7, capilla: 0.25 }) }, 0.55);
      }
      for (let k = 0; k < Math.round(A / 120); k++) { const [u, v] = [rng.chance(0.5) ? u0 + 1.2 : u1 - 1.2, rng.range(v0 + 2, v1 - 2)]; plant(rng.weighted({ eucalyptus: 2, pepper_tree: 1.5, fan_palm: 1 }), u, v, 1.0); }
      break;
    }
    case 'vineyard': {
      const shrink = 1.2, c = [cu, cv];
      const poly = LP.map(([u, v]) => { const dx = u - c[0], dz = v - c[1], l = Math.hypot(dx, dz) || 1; return W(u - (dx / l) * shrink, v - (dz / l) * shrink); });
      out.fields.push(tag({ type: 'vineyard', poly }));
      if (A > 500) { prop('ramada', u1 - 3, v1 - 3, 0, {}, 2.4); prop('barrel_rack', u1 - 3, v1 - 6.2, 0, { count: 3 }, 1.6); }
      break;
    }
    case 'era': {
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.pick(['none', 'stone_low', 'pole']);
      out.ground = { surface: 'packed', cover: 'all' };
      const R = Math.max(3.5, Math.min(7, Math.min(PW, PD) / 2 - 3));
      prop('era', cu, cv, 0, { radius: +R.toFixed(1), edge: 0 }, R + 1.2);
      for (const [u, v] of scatter(16)) { if (prop('haystack', u, v, rng.range(0, 360), {}, 1.6) && out.props.filter((p) => p.type === 'haystack').length >= 3) break; }
      tryProp('sacks', scatter(12), () => rng.range(0, 360), { count: 8 }, 1);
      tryProp(rng.chance(0.5) ? 'cart' : 'wagon', scatter(12), () => rng.range(0, 360), {}, 2);
      if (rng.chance(0.7)) tryProp('brahmin', scatter(12), () => rng.range(0, 360), {}, 1.6);
      if (A > 500) tryProp('cuexcomate', scatter(12), 0, {}, 1.6);
      if (A > 400 && rng.chance(0.6)) tryProp('pond', [[u0 + 5, v0 + 5], [u1 - 5, v0 + 5]], 0, { radius: 3.5, edge: 0 }, 5);
      break;
    }
    case 'brickyard': {
      out.ground = { surface: 'dirt', cover: 'all' };
      // drying rows across the front two-thirds, the pit and the kiln at the back, stacks, a shade
      const rowsV = []; for (let v = v1 - 2.5; v > v0 + PD * 0.38; v -= 2.0) rowsV.push(v);
      for (const v of rowsV) { const len = Math.min(10, PW - 4); prop('brick_rows', cu + rng.range(-0.5, 0.5), v, 0, { length: +len.toFixed(1), rows: 3 }, 0.1); }
      tryProp('mud_pit', [[cu - PW * 0.2, v0 + 3.5], [cu, v0 + 3.5]], 0, {}, 2.8);
      tryProp('lime_kiln', [[u1 - 3, v0 + 3], [u0 + 3, v0 + 3]], 0, {}, 2.4);
      for (let k = 0; k < 3; k++) tryProp('brick_stack', scatter(10), () => rng.range(0, 90), {}, 1.0);
      tryProp('ramada', [[u0 + 3, v0 + PD * 0.3], [u1 - 3, v0 + PD * 0.3]], 0, {}, 2.4);
      tryProp('haystack', scatter(10), 0, {}, 1.6); tryProp('barrel', scatter(10), 0, {}, 0.6); tryProp('cart', scatter(10), () => rng.range(0, 360), {}, 1.6);
      break;
    }
    case 'salvage': {
      out.fence = (pl.fence || 'auto') === 'auto' ? 'scrap' : undefined;
      out.ground = { surface: 'dirt', cover: 'all' };
      for (let u = u0 + 3; u < u1 - 2; u += 3.0) prop('car_stack', u, v0 + 3, rng.range(-10, 10) + 90, { count: rng.int(2, 4) }, 1.5);
      for (const v of [v0 + PD * 0.4, v0 + PD * 0.65]) for (const u of [u0 + 2.5, u1 - 2.5]) prop('car_stack', u, v, rng.range(-10, 10), { count: rng.int(1, 3) }, 1.6);
      for (const k of ['metal', 'tires', 'appliances', 'pipes']) tryProp('scrap_heap', scatter(14), () => rng.range(0, 360), { kind: k }, 1.8);
      tryProp('crane', [[cu, cv - 2], [cu + 3, cv], [cu - 3, cv]], () => rng.range(0, 360), {}, 3);
      tryProp('workbench', scatter(10), 0, {}, 1.2); tryProp('generator', scatter(10), 0, {}, 1);
      if (rng.chance(0.7)) tryProp('dog', scatter(10), () => rng.range(0, 360), {}, 0.6);
      const sx = u1 - 3, sz = v1 - 3;
      if (ok(sx, sz, 2)) { taken.push([sx, sz, 2.6]); out.structures.push(tag({ id: `${pl.id}-shack-${opts.v || 0}`, kind: 'shack', size: [3.6, 3], at: W(sx, sz), rot: Math.round(F.deg), snap: false, origin: 'new' })); }
      break;
    }
    case 'acopio': { // the recycling yard: nothing wasted — sorted, pressed, re-melted, composted or burned for heat
      const poor = ['dead_broke', 'poor', 'struggling'].includes(spec.settlement?.wealth);
      out.fence = (pl.fence || 'auto') === 'auto' ? rng.pick(['scrap', 'scrap', 'chainlink', 'wood_old']) : undefined;
      out.ground = { surface: 'packed', cover: 'all' };
      // 1. sorting under a ramada at the back, a scale and a bench beside it
      const rw = Math.min(8, PW - 4), rv = v0 + 3.2;
      if (prop('ramada', cu, rv, 0, { width: rw, depth: 4, roof: 'corrugated' }, 0.5)) { taken.pop(); taken.push([cu, rv, 0.5]); }
      tryProp('sort_bins', [[cu - 0.5, rv + 2.8], [cu + 2, rv + 3]], 0, {}, 1.6);
      tryProp('scale', [[cu + rw / 2 - 1, rv + 0.5]], 0, {}, 0.9);
      tryProp('workbench', [[cu - rw / 2 + 1.2, rv + 0.6], [cu + rw / 2 - 1.2, rv + 1.5]], 180, {}, 1.0);
      // 2. metal: the press (or bare heaps when poor), stripped hulks, sheet stacks, the wire reel
      if (!poor || rng.chance(0.4)) tryProp('scrap_press', [[u0 + 2.5, cv], [u1 - 2.5, cv]], 0, {}, 1.8);
      tryProp('scrap_heap', [[u0 + 2.5, cv + 4], [u0 + 3, cv - 3]], () => rng.range(0, 360), { kind: 'metal' }, 1.8);
      tryProp('car_stack', [[u1 - 2.5, cv + 3], [u1 - 3, cv - 3]], () => rng.range(0, 360), { count: rng.int(1, 2) }, 1.6);
      for (const k of ['tires', 'appliances', 'pipes']) if (PW * PD > 400 || rng.chance(0.5)) tryProp('scrap_heap', scatter(12), () => rng.range(0, 360), { kind: k }, 1.8);
      if (PW * PD > 500) tryProp('car_stack', scatter(10), () => rng.range(0, 360), { count: rng.int(1, 3) }, 1.6);
      tryProp('sheet_stack', scatter(10), () => rng.range(0, 360), {}, 1.4);
      tryProp('wire_reel', scatter(10), () => rng.range(0, 360), {}, 1.0);
      // 3. glass, 4. the burn pit (smoking by day), 5. compost and the animals that eat the scraps
      tryProp('glass_sort', scatter(12), () => rng.range(-20, 20), {}, 1.8);
      tryProp('burn_pit', [[u1 - 2.5, v0 + 2.5], [u0 + 2.5, v0 + 2.5], ...scatter(6)], 0, {}, 2.0);
      tryProp('compost_bins', [[u0 + 2.5, v0 + 2.2], ...scatter(6)], 0, {}, 1.8);
      if (rng.chance(0.65)) { const pen = tryProp(rng.chance(0.5) ? 'pig' : 'chickens', scatter(8), () => rng.range(0, 360), {}, 1.0); if (pen && rng.chance(0.5)) tryProp('trough', [[pen[0] + 1.2, pen[1]]], 90, { length: 1.6 }, 0.8); }
      tryProp('tires', scatter(8), () => rng.range(0, 360), { count: rng.int(3, 6) }, 0.9);
      tryProp('bottle_crates', scatter(8), () => rng.range(0, 360), {}, 0.8);
      if (!poor) tryProp('generator', scatter(8), () => rng.range(0, 360), {}, 1.0);
      if (rng.chance(0.6)) tryProp('dog', scatter(8), () => rng.range(0, 360), {}, 0.6);
      // 6. the gate side: carts waiting to be unloaded, the sign
      for (let k = 0; k < rng.int(1, 2); k++) tryProp(rng.pick(['handcart', 'farm_cart', 'shopping_cart', 'pack_burro']), [[cu + (k ? -1 : 1) * rng.range(2.5, 4.5), v1 - 3], ...scatter(4)], () => rng.range(0, 360), {}, 1.4);
      tryProp('painted_sign', [[cu + 3.2, v1 - 1.2], [cu - 3.2, v1 - 1.2]], 0, { text: rng.pick(['COMPRO FIERRO\nVIDRIO · COBRE', 'CENTRO DE ACOPIO', 'CHATARRA\nCOMPRO Y VENDO', 'SE COMPRA\nFIERRO VIEJO']) }, 1);
      break;
    }
    case 'outskirts': case 'outgrounds': { // the scrappy edge between the street grid and open desert: loose, sprawling, scrub left standing
      const W8 = spec.settlement?.wealth, poor = ['dead_broke', 'poor', 'struggling'].includes(W8), life = pl.life ?? 0.5;
      const anyRot = () => rng.range(0, 360), scrub = { creosote: 3, sage: 2.5, cholla: 1.2, agave: 1, encelia: 1.5, nopal: 0.6, grass: 2, ocotillo: 0.4, mesquite: 0.5 };
      out.ground = { surface: 'natural', cover: 'all' };
      for (let k = 0; k < Math.round((PW * PD) / 30); k++) { const [u, v] = scatter(1)[0]; plant(rng.weighted(scrub), u, v, 1.1); } // native scrub stays
      const front = [cu + rng.range(-PW * 0.2, PW * 0.2), v1 - 0.3];
      if (use === 'outgrounds') {
        out.fence = (pl.fence || 'auto') === 'auto' ? (rng.chance(0.55) ? 'none' : rng.pick(['wire', 'pole'])) : undefined;
        if (out.fence && out.fence !== 'none') out.noFence = [0, 1, 2, 3].filter(() => rng.chance(0.55)); // only remains of it
        // worn paths across toward the road and the neighbours
        for (let k = 0; k < rng.int(1, 2); k++) out.paint.push({ path: [W(rng.range(u0 + 1, u1 - 1), v1 - 0.2), W(rng.range(u0 + 1, u1 - 1), rng.range(v0 + 1, cv)), W(rng.chance(0.5) ? u0 + 0.2 : u1 - 0.2, rng.range(v0 + 1, v1 - 1))], width: 0.9, color: 0xc8b898, edge: 0.5, alpha: 0.55, layer: 'urban', layerK: 0.7, bake: 'use' });
        const n = Math.max(2, Math.round((PW * PD) / 90 * (poor ? 1.4 : 1)));
        const pool = { tires: 2, barrel: 1.5, bones: 1.2, trash_heap: poor ? 2 : 1, woodpile: 1, rocks: 1.5, rubble: 1, scrap_heap: 0.6, burn_pit: 0.5, car_wreck: 0.35, cross: 0.25, nicho: 0.15 };
        for (let k = 0; k < n; k++) { const t = rng.weighted(pool); tryProp(t, scatter(6), anyRot, t === 'tires' ? { count: rng.int(1, 3) } : t === 'scrap_heap' ? { kind: rng.pick(['metal', 'tires']) } : t === 'burn_pit' ? { kind: 'ring' } : {}, t === 'car_wreck' ? 2.4 : 1.1); }
        if (rng.chance(0.25 + life * 0.5)) for (let k = 0; k < rng.int(1, 3); k++) tryProp('goat', scatter(6), anyRot, {}, 0.6);
        if (rng.chance(0.3)) tryProp('utility_pole', scatter(4), 0, { bare: true }, 0.6);
        break;
      }
      // a household: herder | smallholding | scrapper | squatter | abandoned (rare)
      const hh = pl.outskirt || rng.weighted(poor ? { herder: 2, smallholding: 1.5, scrapper: 2, squatter: 2, abandoned: 0.5 } : { herder: 2.5, smallholding: 3, scrapper: 1.2, squatter: 0.8, abandoned: 0.35 });
      out.fence = (pl.fence || 'auto') === 'auto' ? rng.weighted({ ocotillo: 2, wire: 2, pole: 1.5, scrap: hh === 'scrapper' ? 3 : 0.8, none: 1 }) : undefined;
      if (out.fence && out.fence !== 'none' && rng.chance(0.6)) out.noFence = [rng.int(1, 3)]; // fenced only partly
      // the dwelling, off-centre toward the back
      const hu = cu + rng.range(-PW * 0.2, PW * 0.2), hv = v0 + Math.min(PD * 0.38, rng.range(5, 9));
      const mat = rng.weighted({ adobe: 4, stone: 0.15, timber: 1.6, metal: 0.8 });
      // the edge of town is poor and patched: bare or faded walls, cheap rebuilds, worn, no solar (a wind charger at most)
      const rough = () => { const o = rng.weighted({ new: 3, rebuilt: 2, built_on_ruin: 1.2 });
        return { origin: o, ...(o === 'new' ? { material: mat } : { newMaterial: rng.weighted({ adobe: 3, timber: 2, metal: 1.5 }) }), finish: rng.weighted({ none: 6, faded: 2.5, wash: 1 }), condition: +(poor ? rng.range(0.46, 0.58) : rng.range(0.48, 0.66)).toFixed(2), roofPower: rng.chance(0.08) ? 'wind' : 'none', ...(rng.chance(0.5) ? { roof: 'shed', roofMat: 'corrugated' } : {}) }; };
      if (hh === 'squatter') {
        if (rng.chance(0.6) && ok(hu, hv - 1, 3)) { taken.push([hu, hv - 1, 3.2]); out.structures.push(tag({ kind: 'house', size: [6, 5], at: W(hu, hv - 1), rot: Math.round(F.deg + rng.range(-8, 8)), snap: false, origin: 'ruin', material: mat })); }
        tryProp(rng.pick(['lean_to', 'tarp_tent']), [[hu, hv + 3.2], [hu + 2.5, hv + 2.5]], () => rng.range(-20, 20), {}, 1.8);
        tryProp('firepit', [[hu - 2.5, hv + 4], ...scatter(4)], 0, {}, 1);
        for (const t of ['bedroll', 'water_jugs', 'crates', 'handcart']) if (rng.chance(0.6)) tryProp(t, scatter(5), anyRot, {}, t === 'handcart' ? 1.3 : 0.7);
      } else {
        const ruin = hh === 'abandoned', kind = hh === 'scrapper' || (poor && rng.chance(0.5)) ? 'shack' : 'house';
        const sz = kind === 'shack' ? [rng.range(3.5, 5), rng.range(3, 4)] : [rng.range(6, 8.5), rng.range(5, 7)];
        if (ok(hu, hv, 3)) { taken.push([hu, hv, Math.max(...sz) * 0.6 + 1]); out.structures.push(tag({ kind, size: sz.map((x) => Math.round(x * 4) / 4), at: W(hu, hv), rot: Math.round(F.deg + rng.range(-10, 10)), snap: false, ...(ruin ? { origin: 'ruin', material: mat } : kind === 'shack' ? { origin: 'new', material: mat, roofPower: 'none', condition: +rng.range(0.46, 0.6).toFixed(2) } : rough()) })); }
      }
      // path from the road to the door
      out.paint.push({ path: [W(front[0], front[1]), W((front[0] + hu) / 2 + rng.range(-1.5, 1.5), (v1 + hv) / 2), W(hu, hv + 3.5)], width: hh === 'herder' || hh === 'scrapper' ? 2.2 : 1.1, color: 0xc8b898, edge: 0.6, alpha: 0.6, layer: 'urban', layerK: 0.8, bake: 'use' });
      const pen = (animal, n, cw, cd) => { // a brush / pole corral with animals and a trough, where it fits
        const pu = rng.chance(0.5) ? u0 + cw / 2 + 1.2 : u1 - cw / 2 - 1.2, pv = rng.range(v0 + cd / 2 + 1.2, Math.max(v0 + cd / 2 + 1.3, v1 - cd / 2 - 4));
        if (!ok(pu, pv, Math.min(cw, cd) / 2) || !free(pu, pv, Math.max(cw, cd) / 2)) return;
        taken.push([pu, pv, Math.max(cw, cd) / 2]);
        wall(rng.chance(0.5) ? 'pole' : 'ocotillo', [[pu - cw / 2, pv - cd / 2], [pu + cw / 2, pv - cd / 2], [pu + cw / 2, pv + cd / 2], [pu - cw / 2, pv + cd / 2]], { closed: true, gates: [{ at: 0.6, width: 2.4 }] });
        for (let k = 0; k < n; k++) out.props.push(tag({ type: animal, at: W(pu + rng.range(-cw / 3, cw / 3), pv + rng.range(-cd / 3, cd / 3)), rot: rng.int(0, 359) }));
        out.props.push(tag({ type: 'trough', at: W(pu, pv + cd / 2 - 0.9), rot: Math.round(F.deg), length: 2 }));
      };
      if (hh === 'herder') { pen(rng.chance(0.6) ? 'goat' : 'brahmin', rng.int(2, 5), rng.range(8, 12), rng.range(7, 10)); tryProp('haystack', scatter(6), anyRot, {}, 1.4); tryProp('water_tank', scatter(6), 0, {}, 1.4); }
      if (hh === 'smallholding') {
        const gw = Math.min(PW - 4, rng.range(7, 12)), gd = Math.min(PD * 0.35, rng.range(5, 8)), gu = cu + rng.range(-1, 1), gv = v1 - gd / 2 - 3;
        if (ok(gu, gv, 1)) { taken.push([gu, gv, Math.max(gw, gd) / 2]); out.fields.push(tag({ type: 'garden', poly: [[gu - gw / 2, gv - gd / 2], [gu + gw / 2, gv - gd / 2], [gu + gw / 2, gv + gd / 2], [gu - gw / 2, gv + gd / 2]].map(([u, v]) => W(u, v)), crop: rng.pick(['corn', 'beans', 'mixed', 'squash', 'chili']) })); }
        tryProp(rng.chance(0.5) ? 'hand_pump' : 'well', scatter(6), 0, {}, 1.3); tryProp(rng.chance(0.5) ? 'cuexcomate' : 'drying_rack', scatter(6), anyRot, {}, 1.4); tryProp('chickens', scatter(6), anyRot, {}, 1.0);
      }
      if (hh === 'scrapper') { for (let k = 0; k < rng.int(1, 3); k++) tryProp(rng.chance(0.5) ? 'car_wreck' : 'truck_chassis', scatter(8), anyRot, {}, 2.4); tryProp('scrap_heap', scatter(6), anyRot, { kind: rng.pick(['metal', 'appliances', 'tires']) }, 1.8); tryProp('burn_pit', scatter(6), 0, {}, 1.8); tryProp('handcart', scatter(6), anyRot, {}, 1.3); tryProp('workbench', scatter(6), anyRot, {}, 1.0); }
      if (hh === 'abandoned') { tryProp('rubble', scatter(6), anyRot, {}, 1.2); tryProp('bones', scatter(6), anyRot, {}, 0.8); if (rng.chance(0.5)) pen('none', 0, 7, 6); }
      // shared extras
      const ex = { outhouse: hh === 'abandoned' ? 0 : 0.5, rain_barrel: 0.5, laundry_line: hh === 'abandoned' ? 0 : 0.45, dog: 0.4 + life * 0.3, car_wreck: 0.15, trash_heap: poor ? 0.7 : 0.45, nicho: 0.12, utility_pole: 0.2, woodpile: 0.5, tires: 0.3 };
      for (const [t, pch] of Object.entries(ex)) if (rng.chance(pch)) {
        if (t === 'outhouse') { const ou = hu + (rng.chance(0.5) ? 1 : -1) * rng.range(5, 8), ov = Math.max(v0 + 2, hv - rng.range(1, 3)); if (ok(ou, ov, 1.2) && free(ou, ov, 1.4)) { taken.push([ou, ov, 1.4]); out.structures.push(tag({ kind: 'outhouse', size: [1.4, 1.4], at: W(ou, ov), rot: Math.round(F.deg + rng.range(-15, 15)), snap: false, origin: 'new', material: 'timber' })); } continue; }
        tryProp(t, t === 'laundry_line' || t === 'rain_barrel' || t === 'woodpile' ? [[hu + rng.range(-4, 4), hv + rng.range(3, 5)], ...scatter(4)] : scatter(6), t === 'utility_pole' ? 0 : anyRot, t === 'utility_pole' ? { bare: true } : t === 'tires' ? { count: rng.int(2, 4) } : {}, t === 'car_wreck' ? 2.4 : 1.0);
      }
      break;
    }
    case 'farmstead': { // a rancho: house + work yard by the road, barn and corral behind, fields beyond, tracks and ditches between
      const SW = spec.settlement?.wealth, tier = pl.farmWealth || (['dead_broke', 'poor', 'struggling'].includes(SW) ? 'poor' : ['prosperous', 'wealthy', 'rich'].includes(SW) ? 'rich' : 'average');
      const poorF = tier === 'poor', richF = tier === 'rich', stock = pl.livestock !== false, anyRot = () => rng.range(0, 360);
      out.ground = { surface: 'natural', cover: 'all' };
      if ((pl.fence || 'auto') === 'auto') out.fence = richF ? rng.pick(['stone_low', 'wire']) : poorF ? rng.pick(['none', 'wire', 'ocotillo']) : rng.pick(['wire', 'pole', 'wire']);
      if (out.fence && out.fence !== 'none' && poorF) out.noFence = [rng.int(1, 3)];
      const inside = (ua, va, ub, vb) => [[ua, va], [ub, va], [ub, vb], [ua, vb]].every(([u, v]) => pointInPoly(u, v, LP));
      const rectW = (ua, va, ub, vb) => [[ua, va], [ub, va], [ub, vb], [ua, vb]].map(([u, v]) => W(u, v));
      const fitRect = (ua, va, ub, vb) => { for (let k = 0; k < 6; k++) { if (inside(ua, va, ub, vb)) return [ua, va, ub, vb]; const cu2 = (ua + ub) / 2, cv2 = (va + vb) / 2, sh = 0.85; ua = cu2 + (ua - cu2) * sh; ub = cu2 + (ub - cu2) * sh; va = cv2 + (va - cv2) * sh; vb = cv2 + (vb - cv2) * sh; } return null; };
      // 1. the house yard (casco) on the road, one side
      const YW = Math.max(18, Math.min(richF ? 40 : 32, PW * 0.45)), YD = Math.max(18, Math.min(richF ? 34 : 28, PD * 0.38));
      const left = rng.chance(0.5), ya = left ? u0 : u1 - YW, yb = ya + YW, yv0 = v1 - YD, yv1 = v1, ycu = (ya + yb) / 2; // flush in the plot's front corner
      out.paint.push({ poly: rectW(ya + 0.5, yv0 + 0.5, yb - 0.5, yv1 - 0.5), color: 0xcbb894, edge: 2.2, alpha: 0.7, layer: 'urban', layerK: 0.6, bake: 'use' }); // swept, packed yard
      if (!poorF || rng.chance(0.4)) { // the yard wall: only its two inner sides when the plot is fenced (the plot fence is the rest)
        const wt = richF ? 'adobe' : poorF ? 'ocotillo' : rng.pick(['pole', 'ocotillo', 'stone_low']), xi = left ? yb : ya, xo = left ? ya : yb;
        if ((out.fence || pl.fence || 'auto') === 'none') wall(wt, [[ya, yv0], [yb, yv0], [yb, yv1], [ya, yv1]], { closed: true, gates: [{ at: 0.375, width: 3.2 }, { at: 0.625, width: 3.6 }] });
        else wall(wt, [[xi, v1 - 0.15], [xi, yv0], [xo + (left ? 0.15 : -0.15), yv0]], { gates: [{ at: (YD * 0.5) / (YD + YW), width: 2.6 }, { at: (YD + YW * 0.5) / (YD + YW), width: 3.2 }] });
      }
      // the house, near the road, porch to the street
      const hs = richF ? [rng.range(11, 14), rng.range(8, 10)] : poorF ? [rng.range(6, 8), rng.range(5, 6)] : [rng.range(8.5, 11), rng.range(6.5, 8)];
      const hu = ycu + rng.range(-YW * 0.12, YW * 0.12), hv = yv1 - 3 - hs[1] / 2;
      taken.push([hu, hv, Math.max(...hs) * 0.62 + 1]);
      out.structures.push(tag({ kind: 'house', size: hs.map((x) => Math.round(x * 4) / 4), at: W(hu, hv), rot: Math.round(F.deg), snap: false, floors: 1,
        origin: rng.weighted(poorF ? { new: 3, rebuilt: 1 } : richF ? { new: 3, maintained: 1 } : { new: 4, rebuilt: 1 }), material: richF ? rng.pick(['adobe', 'stone', 'adobe']) : poorF ? rng.pick(['adobe', 'timber']) : rng.pick(['adobe', 'adobe', 'stone']),
        finish: poorF ? rng.weighted({ none: 3, faded: 1 }) : richF ? rng.weighted({ wash: 2, painted: 2 }) : rng.weighted({ none: 1.5, wash: 2, faded: 1 }), condition: +(poorF ? rng.range(0.5, 0.65) : richF ? rng.range(0.7, 0.85) : rng.range(0.6, 0.75)).toFixed(2),
        porch: { roof: poorF ? 'latilla' : rng.pick(['latilla', 'corrugated', 'tile']), depth: 2.4 }, roofPower: poorF ? 'none' : rng.chance(0.25) ? 'wind' : 'none' }));
      // 2. barn (shed for the poor) at the back of the yard, corral behind it
      const bs = richF ? [rng.range(13, 16), rng.range(9, 11)] : poorF ? [5, 4] : [rng.range(9, 11), rng.range(7, 8.5)];
      const bu = left ? ya + bs[0] / 2 + 2 : yb - bs[0] / 2 - 2, bv = yv0 + bs[1] / 2 + 2;
      if (ok(bu, bv, 1) && free(bu, bv, Math.max(...bs) * 0.5)) { taken.push([bu, bv, Math.max(...bs) * 0.6 + 0.8]); out.structures.push(tag({ kind: poorF ? 'shed' : 'barn', size: bs.map((x) => Math.round(x * 4) / 4), at: W(bu, bv), rot: Math.round(F.deg + (left ? -90 : 90)), snap: false, origin: 'new', material: poorF ? 'timber' : rng.pick(['timber', 'timber', 'adobe', 'stone']), condition: +rng.range(0.55, 0.75).toFixed(2), roofPower: 'none', finish: 'none' })); }
      // 3. work yard: water, oven, coop, wood, crib, washing, outhouse
      const wy = () => [rng.range(ya + 2, yb - 2), rng.range(yv0 + 2, yv1 - 2)], wys = (n) => Array.from({ length: n }, wy);
      const wv = [left ? yb - 4 : ya + 4, yv0 + 4];
      if (!poorF || rng.chance(0.5)) { tryProp('windmill', [wv, ...wys(6)], 0, { height: richF ? 10 : 8 }, 2.2); tryProp(rng.chance(0.6) ? 'water_tank' : 'cistern', [[wv[0] + (left ? -3 : 3), wv[1] + 1.5], ...wys(6)], 0, {}, 1.6); }
      else tryProp(rng.chance(0.5) ? 'well' : 'hand_pump', wys(8), 0, {}, 1.3);
      tryProp('horno', [[hu + hs[0] / 2 + 2.5, hv - 1], [hu - hs[0] / 2 - 2.5, hv - 1], ...wys(6)], () => rng.range(-30, 30), {}, 1.4);
      tryProp('chicken_coop', wys(10), anyRot, {}, 1.6); tryProp('chickens', wys(8), anyRot, {}, 0.8);
      tryProp('woodpile', [[hu + (left ? 1 : -1) * (hs[0] / 2 + 1.4), hv - hs[1] / 2 - 1.2], ...wys(6)], () => rng.range(-10, 10), {}, 1.2);
      tryProp('cuexcomate', wys(8), 0, {}, 1.6); if (!poorF) tryProp('drying_rack', wys(8), anyRot, {}, 1.4);
      tryProp('laundry_line', [[hu + rng.range(-3, 3), hv - hs[1] / 2 - 3], ...wys(4)], () => rng.range(-15, 15), {}, 1.2);
      { const ou = left ? ya + 2.5 : yb - 2.5, ov = rng.range(yv0 + bs[1] + 5, yv1 - 6); if (ok(ou, ov, 1) && free(ou, ov, 1.4)) { taken.push([ou, ov, 1.4]); out.structures.push(tag({ kind: 'outhouse', size: [1.4, 1.4], at: W(ou, ov), rot: Math.round(F.deg + (left ? -90 : 90)), snap: false, origin: 'new', material: 'timber' })); } }
      tryProp(rng.chance(0.5) ? 'brahmin_wagon' : 'farm_cart', wys(10), anyRot, rng.chance(0.4) ? { load: 'produce', cover: 'none' } : {}, 2.2);
      // tools and work: hand tools against the house's back wall, plough / harrow by the barn, a sack truck, feed bins, a harvest pile
      out.props.push(tag({ type: 'tool_lean', at: W(hu + rng.range(-hs[0] / 3, hs[0] / 3), hv - hs[1] / 2 - 0.08), rot: Math.round(F.deg + 180), count: rng.int(2, 4) }));
      if (!poorF || rng.chance(0.6)) tryProp('plough', [[bu + rng.range(-2, 2), bv + bs[1] / 2 + 1.6], ...wys(6)], () => rng.range(-30, 30), {}, 1.4);
      if (!poorF && rng.chance(0.7)) tryProp('harrow', [[bu + rng.range(-3, 3), bv + bs[1] / 2 + 2.4], ...wys(6)], () => rng.range(-20, 20), {}, 1.2);
      tryProp('sack_truck', wys(8), anyRot, {}, 0.6); tryProp('feed_bin', wys(8), anyRot, {}, 0.8);
      if (rng.chance(0.45)) tryProp('produce_pile', wys(8), anyRot, { kind: rng.pick(['corn', 'squash', 'melon', 'chili', 'onion']) }, 1.3);
      if (rng.chance(0.5)) tryProp('buckets', wys(6), anyRot, {}, 0.5);
      for (let k = 0; k < (richF ? 3 : 2); k++) tryProp('haystack', wys(8), anyRot, {}, 1.5);
      if (rng.chance(0.6)) tryProp('dog', wys(6), anyRot, {}, 0.6); if (rng.chance(0.5)) tryProp('rain_barrel', [[hu + hs[0] / 2 + 0.6, hv + hs[1] / 2 - 0.6], ...wys(4)], 0, {}, 0.6);
      if (richF && rng.chance(0.6)) tryProp('ramada', wys(8), 0, {}, 2.4);
      // 4. corral (+ a small pen) behind the barn
      let cBack = yv0 - 1.5;
      if (stock) {
        const cw = Math.min(YW - 2, richF ? rng.range(18, 24) : rng.range(12, 18)), cd = richF ? rng.range(14, 18) : rng.range(10, 14);
        const cu0 = left ? ya + 1 : yb - 1 - cw, R = fitRect(cu0, yv0 - 1.5 - cd, cu0 + cw, yv0 - 1.5);
        if (R) { const n = Math.max(1, Math.min(richF ? 8 : 5, Math.round(((R[2] - R[0]) * (R[3] - R[1])) / 50))); out.fields.push(tag({ type: 'corral', poly: rectW(...R), animals: { brahmin: n }, fence: richF ? 'rail' : 'pole' })); out.props.push(tag({ type: 'trough', at: W((R[0] + R[2]) / 2, R[3] - 1.2), rot: Math.round(F.deg), length: 2.4 })); cBack = R[1] - 2; }
        const pw = rng.range(6, 8), pd2 = rng.range(5, 6.5), pu = left ? ya + 1 + cw + 2 + pw / 2 : yb - 1 - cw - 2 - pw / 2, pv = yv0 - 1.5 - pd2 / 2;
        if (inside(pu - pw / 2, pv - pd2 / 2, pu + pw / 2, pv + pd2 / 2) && free(pu, pv, Math.max(pw, pd2) / 2)) { taken.push([pu, pv, Math.max(pw, pd2) / 2]); const an = rng.pick(['pig', 'goat', 'goat']); wall(rng.pick(['pole', 'ocotillo']), [[pu - pw / 2, pv - pd2 / 2], [pu + pw / 2, pv - pd2 / 2], [pu + pw / 2, pv + pd2 / 2], [pu - pw / 2, pv + pd2 / 2]], { closed: true, gates: [{ at: 0.6, width: 1.6 }] }); for (let k = 0; k < rng.int(2, 4); k++) out.props.push(tag({ type: an, at: W(pu + rng.range(-pw / 3, pw / 3), pv + rng.range(-pd2 / 3, pd2 / 3)), rot: rng.int(0, 359) })); }
      }
      // 5. the land: a block beside the yard and strips across the back, a track between
      const crop0 = pl.crop || rng.pick(['corn', 'corn', 'beans', 'mixed', 'squash', 'chili']);
      const fenceF = pl.fieldFence === 'none' ? null : pl.fieldFence && pl.fieldFence !== 'auto' ? pl.fieldFence : richF && rng.chance(0.5) ? 'stone_low' : !poorF && rng.chance(0.3) ? 'pole' : null;
      const blocks = [], gap = richF ? 3 : 2.4;
      { const sa = left ? yb + gap : u0 + 1.5, sb = left ? u1 - 1.5 : ya - gap; if (sb - sa > 8) blocks.push([sa, yv0, sb, v1 - 2.5]); }
      const backTop = Math.min(cBack, yv0 - (stock ? 1.5 : 0)) - gap;
      if (backTop - (v0 + 1.5) > 8) { const n = Math.max(1, Math.min(5, Math.round((PW - 3) / rng.range(18, 28)))), w = (PW - 3 - gap * (n - 1)) / n; for (let k = 0; k < n; k++) { const a = u0 + 1.5 + k * (w + gap); blocks.push([a, v0 + 1.5, a + w, backTop]); } }
      let orchard = 0, scare = 0, mag = 0;
      blocks.forEach((B, k) => {
        const R = fitRect(...B); if (!R || (R[2] - R[0]) < 5 || (R[3] - R[1]) < 5) return;
        const kind = rng.weighted({ crop: 6, fallow: poorF ? 2 : 1.2, orchard: orchard ? 0 : richF ? 2 : 1, maguey: mag ? 0 : 0.4 }); if (kind === 'maguey') mag++;
        const poly = rectW(...R), fe = fenceF ? { fence: fenceF } : {};
        if (kind === 'orchard') { orchard++; out.fields.push(tag({ type: 'orchard', poly, tree: rng.pick(['fruit_tree', 'fruit_tree', 'date_palm']), spacing: 6, ...fe })); }
        else if (kind === 'fallow') out.fields.push(tag({ type: 'field', poly, fallow: true, crop: crop0 }));
        else { const crop = kind === 'maguey' ? 'maguey' : k === 0 ? crop0 : rng.chance(0.55) ? crop0 : rng.pick(['corn', 'beans', 'squash', 'chili', 'mixed']); out.fields.push(tag({ type: 'field', poly, crop, ...fe }));
          if (scare < 2 && kind === 'crop' && rng.chance(0.55)) { scare++; out.props.push(tag({ type: 'scarecrow', at: W(rng.range(R[0] + 2, R[2] - 2), rng.range(R[1] + 2, R[3] - 2)), rot: Math.round(F.deg + rng.range(-40, 40)), clear: 0.3 })); } }
      });
      // tracks: gate → barn, and along the back of the yard to the fields
      out.paint.push({ path: [W(ycu, v1 + 0.5), W(ycu + rng.range(-1, 1), (yv1 + yv0) / 2), W(bu, bv + bs[1] / 2 + 1.5)], width: 3, color: 0xbfae8c, edge: 0.8, alpha: 0.65, layer: 'urban', layerK: 0.8, bake: 'use' });
      if (backTop - (v0 + 1.5) > 8) out.paint.push({ path: [W(u0 + 2, backTop + gap / 2), W(u1 - 2, backTop + gap / 2)], width: 2.6, color: 0xbfae8c, edge: 0.8, alpha: 0.55, layer: 'urban', layerK: 0.8, bake: 'use' });
      out.gate = { at: W(ycu, v1), width: 3.6, leaf: 'wood' };
      break;
    }
    case 'mystic': { // a curandera's healing yard, a bruja's place people cross the road to avoid, or a wasteland seer's camp
      const kind = pl.mystic || rng.weighted({ curandera: 3, bruja: 2, wasteland: 2 }), anyRot = () => rng.range(0, 360);
      out.ground = { surface: kind === 'curandera' ? 'packed' : 'natural', cover: kind === 'curandera' ? 'yard' : 'all' };
      if ((pl.fence || 'auto') === 'auto') out.fence = kind === 'curandera' ? rng.pick(['adobe', 'ocotillo', 'pole']) : kind === 'bruja' ? rng.pick(['ocotillo', 'ocotillo', 'wood_old']) : rng.pick(['scrap', 'wire', 'none']);
      const hu = cu + rng.range(-PW * 0.15, PW * 0.15), hv = v0 + Math.min(PD * 0.35, rng.range(4.5, 7.5));
      const sz = kind === 'wasteland' ? [rng.range(3.5, 4.5), rng.range(3, 3.8)] : [rng.range(6, 8), rng.range(5, 6.5)];
      const sign = (txt) => tryProp('painted_sign', [[cu + rng.range(-2, 2), v1 - 1.6], [cu + 3, v1 - 1.6], [cu - 3, v1 - 1.6]], 0, { text: txt }, 1);
      if (kind === 'wasteland' && rng.chance(0.45)) tryProp(rng.pick(['tent_bell', 'tent_wall']), [[hu, hv]], () => rng.range(-10, 10), {}, 2.4);
      else if (ok(hu, hv, 2)) { taken.push([hu, hv, Math.max(...sz) * 0.6 + 0.8]); out.structures.push(tag({ kind: kind === 'wasteland' ? 'shack' : 'house', size: sz.map((x) => Math.round(x * 4) / 4), at: W(hu, hv), rot: Math.round(F.deg + rng.range(-6, 6)), snap: false,
        origin: kind === 'bruja' ? rng.pick(['new', 'rebuilt']) : 'new', material: kind === 'curandera' ? 'adobe' : kind === 'bruja' ? rng.pick(['adobe', 'stone', 'timber']) : rng.pick(['metal', 'timber']),
        finish: kind === 'curandera' ? rng.weighted({ wash: 3, painted: 1, faded: 1 }) : rng.weighted({ none: 3, faded: 1 }), condition: +(kind === 'curandera' ? rng.range(0.6, 0.75) : rng.range(0.47, 0.6)).toFixed(2), roofPower: 'none',
        porch: kind === 'curandera' ? { roof: 'latilla', depth: 2.2 } : false })); }
      const yd = () => scatter(8), near = (r1, r2) => Array.from({ length: 8 }, () => { const a = rng.range(0, 6.28), d = rng.range(r1, r2); return [hu + Math.cos(a) * d, hv + Math.abs(Math.sin(a)) * d]; });
      if (kind === 'curandera') {
        for (let k = 0; k < rng.int(2, 3); k++) tryProp('herb_bed', yd(), () => rng.range(-10, 10), {}, 1.4);
        tryProp('altar', [[hu + rng.range(-2, 2), hv + sz[1] / 2 + 3.4], ...near(4, 6), ...yd()], 0, {}, 1.2);
        tryProp('drying_rack', near(3, 6), anyRot, {}, 1.3);
        tryProp('ramada', [[cu + (hu > cu ? -1 : 1) * PW * 0.22, cv + PD * 0.1], ...yd()], 0, {}, 2.4);
        for (let k = 0; k < 2; k++) tryProp('bench', yd(), anyRot, {}, 0.9);
        if (A > 260 && rng.chance(0.6)) tryProp('temazcal', yd(), anyRot, {}, 2);
        for (let k = 0; k < rng.int(3, 6); k++) tryProp(rng.pick(['pot_plant', 'pot_large', 'potted_plant']), near(sz[0] / 2 + 0.8, sz[0] / 2 + 2.2), anyRot, {}, 0.5);
        tryProp('chickens', yd(), anyRot, {}, 0.8); tryProp('nicho', [[cu + 2.5, v1 - 0.9], [cu - 2.5, v1 - 0.9]], 0, {}, 0.8);
        if (rng.chance(0.7)) sign(rng.pick(['CURANDERA', 'HIERBAS\nLIMPIAS', 'CURANDERA\nSOBADORA', 'LIMPIAS\nY REMEDIOS']));
        for (let k = 0; k < 3; k++) plant(rng.pick(['nopal', 'agave', 'sage']), ...yd()[0], 1);
      } else if (kind === 'bruja') {
        tryProp('bottle_tree', [[cu + rng.range(-3, 3), v1 - 3.5], ...yd()], anyRot, {}, 1.4);
        for (let k = 0; k < 2; k++) tryProp('bone_chimes', [[rng.chance(0.5) ? u0 + 1.2 : u1 - 1.2, rng.range(cv, v1 - 2)], ...yd()], () => rng.range(-30, 30), {}, 0.9);
        tryProp('offering_pile', near(sz[1] / 2 + 1.5, 4), 0, {}, 0.9);
        tryProp('bones', yd(), anyRot, {}, 0.8); tryProp('firepit', yd(), 0, {}, 1); tryProp('chickens', yd(), anyRot, {}, 0.8);
        if (rng.chance(0.5)) tryProp('dog', yd(), anyRot, {}, 0.6); if (rng.chance(0.5)) tryProp('drying_rack', yd(), anyRot, {}, 1.2);
        for (let k = 0; k < Math.round(A / 40); k++) plant(rng.pick(['cholla', 'nopal', 'creosote', 'ocotillo', 'mesquite']), ...yd()[0], 1.1); // left to grow wild
        if (rng.chance(0.25)) sign(rng.pick(['NO PASAR', 'SE HACEN\nTRABAJOS']));
      } else {
        for (let k = 0; k < rng.int(2, 3); k++) tryProp('totem', [...yd()], () => rng.range(-20, 20), {}, 0.9);
        tryProp('radio_mast', near(3, 6), 0, {}, 1.2); tryProp('bone_chimes', yd(), anyRot, {}, 0.9);
        tryProp('mystic_stall', [[cu + rng.range(-2, 2), v1 - 3], ...yd()], 180, { kind: rng.pick(['crystals', 'medium']) }, 1.6);
        tryProp('firepit', yd(), 0, {}, 1); tryProp('scrap_heap', yd(), anyRot, { kind: rng.pick(['metal', 'appliances']) }, 1.6); tryProp('offering_pile', yd(), 0, {}, 0.9);
        if (rng.chance(0.4)) tryProp('car_wreck', yd(), anyRot, {}, 2.4); tryProp('water_jugs', near(2, 4), anyRot, {}, 0.6);
        if (rng.chance(0.6)) sign(rng.pick(['VIDENTE', 'SE LEE\nLA SUERTE', 'EL ORÁCULO', 'LA QUE VE']));
        for (let k = 0; k < Math.round(A / 60); k++) plant(rng.pick(['creosote', 'cholla', 'sage']), ...yd()[0], 1.1);
      }
      break;
    }
    case 'farmers_market': { // tianguis: growers sell off tables, blankets and their carts; a service lane behind for carts and animals
      const anyRot = () => rng.range(0, 360), dens = pl.density ?? 0.65;
      out.ground = { surface: 'packed', cover: 'all' };
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.pick(['none', 'none', 'pole', 'wire']);
      // service lane along the back: carts unloading, a hitching rail with brahmin and burros, sacks, a scale
      const sv = v0 + 3;
      let u = u0 + 3;
      while (u < u1 - 3) {
        const t = rng.weighted({ farm_cart: 3, brahmin_wagon: 1.5, pack_burro: 1.5, handcart: 1, cargo_trike: 0.6 }), rad = t === 'brahmin_wagon' ? 2.6 : t === 'farm_cart' ? 1.6 : 1.1;
        if (rng.chance(0.75)) prop(t, u + rad, sv, 90 + (rng.chance(0.5) ? 180 : 0) + rng.range(-8, 8), t === 'farm_cart' || t === 'brahmin_wagon' ? { load: rng.pick(['produce', 'produce', 'sacks', 'hay']), cover: 'none' } : {}, rad);
        u += rad * 2 + rng.range(1, 3);
      }
      tryProp('hitching_rail', [[u0 + 4, sv + 3.2], [u1 - 4, sv + 3.2]], 0, {}, 1.4);
      for (let k = 0; k < rng.int(2, 4); k++) tryProp(rng.chance(0.6) ? 'brahmin' : 'burro', [[u0 + rng.range(2, 6), sv + rng.range(3.5, 5)], [u1 - rng.range(2, 6), sv + rng.range(3.5, 5)]], anyRot, {}, 1.0);
      tryProp('scale', [[cu + rng.range(-3, 3), sv + 3]], 0, {}, 0.8);
      for (let k = 0; k < rng.int(2, 4); k++) tryProp('sacks', [[rng.range(u0 + 3, u1 - 3), sv + rng.range(2.4, 3.6)]], anyRot, {}, 0.9);
      // rows of sellers facing aisles (pairs back to back, aisles 3.5 m), the street side open
      const top = v1 - 2.5, bot = sv + 6.5, rowGap = 7;
      const seller = () => rng.weighted({ farm_stand: 3, produce_pile: 2.2, tarp_stall: 1.5, basket_table: 1.2, stall: 1, produce_crates: 1.2 });
      let row = 0;
      for (let v = top - 1.6; v > bot; v -= row % 2 ? rowGap - 2.6 : 2.6, row++) {
        const face = row % 2 ? 180 : 0;
        for (let uu = u0 + 2.4; uu < u1 - 2.4; uu += rng.range(2.9, 3.6)) {
          if (!rng.chance(0.45 + dens * 0.5)) continue;
          const t = seller(), rad = t === 'farm_stand' ? 1.5 : t === 'produce_pile' ? 1.1 : 1.2;
          prop(t, uu, v, face + rng.range(-5, 5), t === 'tarp_stall' || t === 'stall' ? { goods: 'produce' } : t === 'produce_pile' ? { kind: rng.pick(['corn', 'squash', 'melon', 'chili', 'onion']) } : {}, rad);
        }
      }
      // around the edges: crates, a water seller at the gate, shade with benches, a trash corner
      tryProp('water_seller', [[cu + rng.range(4, 7), v1 - 1.4], [cu - rng.range(4, 7), v1 - 1.4]], 180, {}, 1.0);
      if (A > 500) tryProp('ramada', [[u0 + 3.5, cv], [u1 - 3.5, cv]], 0, {}, 2.4);
      for (let k = 0; k < 2; k++) tryProp('bench', [[u0 + 2, rng.range(cv - 4, cv + 4)], [u1 - 2, rng.range(cv - 4, cv + 4)]], 90, {}, 0.9);
      tryProp('trash_heap', [[u0 + 1.6, v0 + 1.6], [u1 - 1.6, v0 + 1.6]], anyRot, {}, 0.9);
      for (let k = 0; k < 5; k++) tryProp(rng.pick(['crates', 'produce_crates', 'buckets', 'sacks']), scatter(6), anyRot, {}, 0.6);
      if (rng.chance(0.15)) tryProp('mystic_stall', scatter(8), anyRot, {}, 1.4);
      break;
    }
    case 'trader': { // casa comercial: a big trader / lender — the office on the street, warehouses and the caravan yard behind
      // a high wall with one gate, the owner's house at the back, a lookout. Options: size, security, trade focus, name
      const size = pl.traderSize || (A > 1800 ? 'big' : A > 900 ? 'regional' : 'small'), sec = pl.traderSec || (size === 'big' ? 'fortified' : 'armed');
      const focus = pl.traderFocus || rng.pick(['grain', 'salt', 'water', 'scrap', 'general']), anyRot = () => rng.range(0, 360);
      const big = size === 'big', small = size === 'small';
      out.ground = { surface: 'packed', cover: 'all' };
      if ((pl.fence || 'auto') === 'auto') out.fence = sec === 'low' ? rng.pick(['adobe', 'stone']) : rng.pick(['adobe', 'block', 'block']);
      out.fenceH = sec === 'low' ? 2.2 : 2.8; out.fenceBarbed = sec === 'fortified' ? 'both' : sec === 'armed' ? (rng.chance(0.5) ? true : null) : null; out.fenceGlass = sec !== 'low' && !out.fenceBarbed;
      const SURN = ['IBARRA', 'MONTAÑO', 'ESPINOZA', 'VILLEGAS', 'ARCE', 'MEZA', 'CASTRO', 'LUNA', 'OCHOA', 'SALDAÑA'];
      const name = pl.traderName || rng.pick(['CASA {S}', 'COMERCIAL {S}', 'BODEGAS {S}', '{S} E HIJOS', 'ALMACÉN {S}']).replace('{S}', rng.pick(SURN));
      // 1. the office / store on the street, one side of the gate
      const gateU = cu + (rng.chance(0.5) ? 1 : -1) * Math.min(PW * 0.22, 7), oside = gateU > cu ? -1 : 1;
      const ow = Math.min(PW * 0.42, big ? 13 : small ? 8 : 11), od = big ? 9 : 7.5, ou = cu + oside * Math.max(ow / 2 + 2.4, Math.abs(gateU - cu) + ow / 2 + 2.6) * 0.9, ov = v1 - od / 2 - 0.2;
      if (ok(ou, ov, 0.5)) { taken.push([ou, ov, Math.max(ow, od) * 0.6]); out.structures.push(tag({ kind: 'store', size: [Math.round(ow * 4) / 4, od], at: W(ou, ov), rot: Math.round(F.deg), snap: false, origin: rng.pick(['new', 'prewar']), material: rng.pick(['block', 'plaster', 'adobe']), finish: big ? 'painted' : rng.pick(['wash', 'painted']), condition: 0.8, floors: big && rng.chance(0.5) ? 2 : 1, sign: { text: name, style: rng.pick(['painted', 'wall']) }, roofPower: 'none' })); }
      out.gate = { at: W(gateU, v1), width: 4.2, leaf: 'metal' };
      tryProp('guard_shack', [[gateU + oside * -3.2, v1 - 2.2], [gateU - oside * -3.2, v1 - 2.2]], 180, {}, 1.4);
      // 2. warehouses down one side / across the back, docks and a scale
      const nW = big ? 2 : 1, ww = Math.min(PW * (big ? 0.38 : 0.5), big ? 16 : 13), wd = big ? 11 : 9;
      for (let k = 0; k < nW; k++) {
        const wu = oside > 0 ? u0 + ww / 2 + 1.5 : u1 - ww / 2 - 1.5, wv = v0 + wd / 2 + (big ? 3 : 3) + k * (wd + 4); // both down the same side; the owner's house keeps the other back corner
        if (!ok(wu, wv, 0.5) || !free(wu, wv, wd * 0.5)) continue;
        taken.push([wu, wv, Math.max(ww, wd) * 0.55]);
        out.structures.push(tag({ kind: 'warehouse', size: [Math.round(ww * 4) / 4, wd], at: W(wu, wv), rot: Math.round(F.deg), snap: false, origin: rng.pick(['new', 'prewar', 'prewar']), material: rng.pick(['block', 'metal', 'concrete']), condition: +rng.range(0.65, 0.8).toFixed(2), roofPower: 'none' }));
        out.props.push(tag({ type: 'loading_dock', at: W(wu, wv + wd / 2 + 0.02), rot: Math.round(F.deg), width: Math.min(ww * 0.6, 7) }));
      }
      tryProp('scale', [[cu, cv], ...scatter(6)], 0, {}, 0.9);
      // 4. the owner's house at the back, the best on the block; workers' / guards' quarters
      const hw = big ? 12 : small ? 8 : 10, hd = big ? 9 : 7, hu = oside > 0 ? u1 - hw / 2 - 2 : u0 + hw / 2 + 2, hv = v0 + hd / 2 + 2;
      if (!small || A > 600) { if (ok(hu, hv, 0.5) && free(hu, hv, Math.max(hw, hd) * 0.45)) { taken.push([hu, hv, Math.max(hw, hd) * 0.6]); out.structures.push(tag({ kind: 'house', size: [hw, hd], at: W(hu, hv), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['adobe', 'plaster', 'stone']), finish: rng.pick(['painted', 'decorated']), roof: rng.pick(['hip', 'gable', 'flat']), roofMat: 'tile', condition: 0.88, porch: { roof: 'tile', depth: 2.4 }, roofPower: rng.chance(0.4) ? 'solar' : 'none', extras: ['tinaco'] })); tryProp('garden_bed', [[hu, hv + hd / 2 + 3.2]], 0, {}, 1.2); tryProp('citrus_pot', [[hu + 2, hv + hd / 2 + 1.6]], 0, {}, 0.5); } }
      if (!small) { const qu = oside > 0 ? u0 + 5 : u1 - 5, qv = v0 + 4; if (ok(qu, qv, 0.5) && free(qu, qv, 4)) { taken.push([qu, qv, 4.5]); out.structures.push(tag({ kind: 'barracks', size: [8, 5.5], at: W(qu, qv), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['adobe', 'block']), condition: 0.7, roofPower: 'none' })); } }
      // 3. the caravan yard: wagons loaded by trade, brahmin, a trough, the water tank, stacks under ramadas
      const LOAD = { grain: ['sacks', 'hay'], salt: ['sacks', 'crates'], water: ['barrels', 'jugs'], scrap: ['scrap', 'barrels'], general: ['crates', 'sacks', 'barrels'] }[focus];
      const STACK = { grain: ['sacks', 'sacks', 'haystack'], salt: ['sacks', 'crates'], water: ['barrel', 'water_jugs', 'cistern'], scrap: ['scrap_heap', 'tires', 'engine_block'], general: ['crates', 'sacks', 'barrel'] }[focus];
      for (let k = 0; k < (big ? 4 : small ? 1 : 2); k++) tryProp(rng.pick(['brahmin_wagon', 'brahmin_wagon', 'farm_cart', 'caravan_trailer']), scatter(10), anyRot, { load: rng.pick(LOAD), cover: rng.chance(0.5) ? 'none' : undefined }, 2.6);
      tryProp('hitching_rail', scatter(8), anyRot, {}, 1.4); tryProp('trough', scatter(8), anyRot, { length: 2.4 }, 1.4);
      for (let k = 0; k < (big ? 5 : 3); k++) tryProp('brahmin', scatter(8), anyRot, {}, 1.2);
      if (rng.chance(0.6)) tryProp('pack_burro', scatter(8), anyRot, {}, 1.1);
      tryProp(rng.chance(0.6) ? 'water_tank' : 'cistern', scatter(8), 0, {}, 1.6);
      for (let k = 0; k < (big ? 2 : 1); k++) tryProp('ramada', scatter(8), 0, {}, 2.4);
      for (let k = 0; k < (big ? 9 : 5); k++) { const t = rng.pick(STACK); tryProp(t, scatter(8), anyRot, t === 'sacks' ? { count: rng.int(6, 14) } : t === 'tires' ? { count: rng.int(3, 6) } : t === 'scrap_heap' ? { kind: 'metal' } : {}, t === 'cistern' ? 1.6 : 1.0); }
      tryProp('handcart', scatter(6), anyRot, {}, 1.2); tryProp('sack_truck', scatter(6), anyRot, {}, 0.6);
      // 5. security
      if (sec !== 'low') {
        const corner = [oside > 0 ? u1 - 2.5 : u0 + 2.5, v1 - 3];
        tryProp(sec === 'fortified' ? 'watchtower' : rng.pick(['watchtower', 'sandbags']), [corner, [u0 + 2.5, v0 + 2.5], [u1 - 2.5, v0 + 2.5]], 0, {}, 2);
        if (sec === 'fortified') { tryProp('sandbags', [[gateU + 2.6, v1 - 3.2], [gateU - 2.6, v1 - 3.2]], 0, {}, 1.2); if (['some', 'grid'].includes(spec.settlement?.power)) tryProp('spotlight_tower', [[cu, cv + PD * 0.15], ...scatter(6)], 0, {}, 1.6); }
      }
      if (rng.chance(0.5)) tryProp('dog', scatter(6), anyRot, {}, 0.6);
      break;
    }
    case 'multifamily': { // where several households share one lot: vecindad, cuartería, pre-war block, family compound
      const SW = spec.settlement?.wealth, poorT = ['dead_broke', 'poor', 'struggling'].includes(SW), life = pl.life ?? 0.5, dens = pl.density ?? 0.5;
      const kind = pl.mfKind || (PW >= 13 && PD >= 13 && rng.chance(0.45) ? 'vecindad' : PW < 13 ? 'cuarteria' : rng.weighted({ vecindad: 1, cuarteria: 1, block: 0.8, compound: 1.2, locales: PW >= 12 ? 1.2 : 0 }));
      const anyRot = () => rng.range(0, 360), fin = () => (poorT ? rng.weighted({ none: 3, faded: 2, wash: 1 }) : rng.weighted({ none: 1, faded: 1.5, wash: 2, painted: 1 }));
      out.ground = { surface: 'packed', cover: 'all' };
      const washing = (pts, n) => { for (let k = 0; k < n; k++) if (rng.chance(0.4 + life * 0.6)) tryProp('laundry_line', pts(), () => rng.range(-20, 20), {}, 1.0); };
      if (kind === 'locales') { // a row of locales / cuartos on the street line, one long low tin roof, each unit its own colour; shops and homes
        const ud = rng.range(5, 6.5), n = Math.max(2, Math.round((PW - 1) / rng.range(3.8, 5))), uw = (PW - 1) / n, vv = v1 - 0.4 - ud / 2, fh = +rng.range(2.5, 2.75).toFixed(2);
        const COLS = [0xd8caa8, 0x5a9a7a, 0xd09a9a, 0xc89a4a, 0x8ab8a0, 0x8aa8c0, 0xc8b890, 0x9a4a40, 0xe0d8c0];
        const NAMES = ['ABARROTES', 'BARBERÍA', 'ESTÉTICA', 'TIENDITA', 'REFACCIONES', 'TORTILLERÍA', 'COCINA ECONÓMICA', 'MARISCOS', 'LLANTERA', 'PAPELERÍA', 'MISCELÁNEA', 'SE RENTA'];
        const units = [];
        let last = -1; const flip0 = rng.chance(0.5); // which way the row's tin falls (front or back); now and then a unit's the other way
        for (let k = 0; k < n; k++) {
          const two = k < n - 1 && rng.chance(0.2), span = two ? 2 : 1; // now and then a wider unit (two bays)
          const uu = u0 + 0.5 + uw * (k + span / 2); if (two) k++; if (!ok(uu, vv, 0.2)) continue; taken.push([uu, vv, uw * span * 0.5]); units.push([uu, uw * span]);
          let ci = rng.int(0, COLS.length - 1); if (ci === last) ci = (ci + 1) % COLS.length; last = ci;
          const shop = rng.chance(0.5), sign = shop && rng.chance(0.7) ? { text: rng.pick(NAMES), style: rng.chance(0.65) ? 'wall' : 'painted' } : null;
          out.structures.push(tag({ kind: shop ? 'shop' : 'house', size: [Math.round(uw * span * 4) / 4 + 0.02, Math.round(ud * 4) / 4], ridge: 'x', ...((rng.chance(0.2) ? !flip0 : flip0) ? { shedFlip: true } : {}), at: W(uu, vv), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['block', 'plaster', 'block']), finish: 'painted', color: COLS[ci], roof: 'shed', roofMat: 'corrugated', roofLow: true, floorH: fh, row: true, level: `loc:${pl.id}`, roofPower: 'none', porch: false, sideShade: false, tinaco: false, ...(sign ? { sign } : shop ? {} : { signs: false }), condition: +rng.range(0.55, 0.8).toFixed(2) }));
          if (shop && rng.chance(0.4)) out.props.push(tag({ type: 'lona', at: W(uu + rng.range(-uw * span / 4, uw * span / 4), v1 - 0.25), rot: Math.round(F.deg), keep: true }));
          if (rng.chance(0.3 + life * 0.4)) out.props.push(tag({ type: rng.pick(['chair', 'buckets', 'pot_plant', 'cooler', 'crates']), at: W(uu + rng.range(-uw / 3, uw / 3), v1 + 0.6), rot: Math.round(F.deg + rng.range(-30, 30)) }));
        }
        // behind the row every household has its own strip of yard, often walled off from the next: the pila and the
        // washing by its back door, a tinaco, a store room or an extra cuarto at the far end, chickens, a tree, a car,
        // the outdoor kitchen, junk — the shared bits (outhouse, a big tree) at the back
        const vb = vv - ud / 2 - 0.2, depth = vb - v0;
        if (depth > 3.5) {
          const div = rng.weighted({ none: 1.6, stone_low: 1.4, block: 1.2, wire: 1, ocotillo: 0.6 });
          if (div !== 'none') for (let k = 1; k < units.length; k++) { const ub = (units[k - 1][0] + units[k - 1][1] / 2 + units[k][0] - units[k][1] / 2) / 2; if (ok(ub, vb - 0.5, 0.05)) wall(div, [[ub, vb], [ub, v0 + 0.3]], div === 'block' ? { height: 1.3 } : {}); }
          for (const [uu, ww] of units) {
            const S2 = (fu, fv) => [uu + ww * fu, vb - depth * fv], hw = ww / 2 - 0.6; // strip-local: fu across (-0.5..0.5), fv back (0..1)
            const B = (n) => Array.from({ length: n }, () => S2(rng.range(-0.35, 0.35), rng.range(0.15, 0.85)));
            tryProp(rng.chance(0.6) ? 'pila' : 'rain_barrel', [S2(-0.25, 0.08), S2(0.25, 0.08)], 0, {}, 0.7);
            if (rng.chance(0.45 + life * 0.5)) tryProp('laundry_line', [S2(0, 0.35), S2(0, 0.5)], 90 + rng.range(-8, 8), { length: Math.min(5, depth * 0.6) }, 0.4);
            if (rng.chance(0.5)) tryProp('water_tank', [S2(0.3, 0.1), S2(-0.3, 0.1)], 0, {}, 0.9);
            if (depth > 8 && hw > 1.2 && rng.chance(0.4 + dens * 0.4)) { // a cuarto / store room against the back wall
              const sw = Math.min(ww - 1.2, rng.range(2.6, 3.8)), sd = rng.range(2.4, 3.2), [su, sv] = S2(rng.range(-0.15, 0.15), 0);
              const sv2 = v0 + 0.5 + sd / 2;
              if (ok(su, sv2, 0.2) && free(su, sv2, sw * 0.5)) { taken.push([su, sv2, Math.max(sw, sd) * 0.55]); out.structures.push(tag({ kind: rng.chance(0.6) ? 'shed' : 'shack', size: [Math.round(sw * 4) / 4, Math.round(sd * 4) / 4], at: W(su, sv2), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['block', 'timber', 'metal', 'adobe']), roof: 'shed' })); }
            }
            const extras = rng.int(1, 2 + Math.round(dens * 2));
            for (let e = 0; e < extras; e++) {
              const t = rng.weighted({ chicken_coop: 1, woodpile: 1, crates: 1, tires: 0.8, drum_stove: 0.8, bicycle: 0.6, buckets: 0.8, chair: 0.8, toys: 0.6, scrap_pile: 0.4, garden_bed: 0.5, pot_large: 0.5 });
              tryProp(t, B(6), anyRot, t === 'garden_bed' ? { width: Math.max(1.5, hw), depth: 1.2 } : {}, t === 'chicken_coop' || t === 'garden_bed' ? 1.2 : 0.7);
            }
            if (rng.chance(0.35)) { const [pu, pv] = B(1)[0]; plant(rng.weighted({ pepper_tree: 2, fruit_tree: 2, mesquite: 1, fan_palm: 0.6 }), pu, pv, 1.4); }
            if (rng.chance(0.15 + dens * 0.2) && ww >= 3.6 && depth > 7) tryProp(rng.pick(['pickup', 'car_wreck', 'cart']), [S2(0, 0.55)], 90, {}, 1.6);
          }
          if (rng.chance(0.6)) { const ou = rng.chance(0.5) ? u0 + 1.2 : u1 - 1.2, ov = v0 + 1.2; if (ok(ou, ov, 0.6) && free(ou, ov, 1.1)) { taken.push([ou, ov, 1.2]); out.structures.push(tag({ kind: 'outhouse', size: [1.4, 1.4], at: W(ou, ov), rot: Math.round(F.deg), snap: false, origin: 'new', material: 'timber' })); } }
        } else { washing(() => scatter(4), 1 + Math.round(life * 2)); tryProp('pila', scatter(6), anyRot, {}, 1); }
      } else if (kind === 'vecindad') { // rooms round a shared patio, one street door (the zaguán); pila, washing, a shared toilet
        const w = Math.max(12, PW - 1.6), d = Math.max(11, Math.min(PD - 1.6, w * 1.4)), cv2 = v1 - 0.8 - d / 2;
        taken.push([cu, cv2, 0.1]);
        out.structures.push(tag({ kind: 'posada', layout: 'courtyard', size: [Math.round(w * 4) / 4, Math.round(d * 4) / 4], at: W(cu, cv2), rot: Math.round(F.deg), snap: false, origin: rng.weighted({ new: 3, rebuilt: 1, prewar: 0.6 }), material: rng.pick(['adobe', 'adobe', 'block', 'plaster']), finish: fin(), condition: +(poorT ? rng.range(0.5, 0.65) : rng.range(0.58, 0.75)).toFixed(2), signs: false, roofPower: 'none', name: 'vecindad', roofGarden: rng.pick(['drying', 'mixed', 'herbs']) }));
        const t = Math.max(3.4, Math.min(5, Math.min(w, d) * 0.28)), cw = w - 2 * t, cd = d - 2 * t; // the patio, as kinds.js lays it out
        const PP = (fu, fv) => W(cu + fu * (cw / 2 - 1.2), cv2 + fv * (cd / 2 - 1.2));
        for (const [fu, fv, t2] of [[-1, 0.6, 'pila'], [1, -0.6, 'water_jugs'], [-0.7, -0.7, 'chair'], [0.8, 0.8, 'buckets'], [0.2, -0.85, 'toys'], [-0.85, 0, 'pot_large']]) if (rng.chance(t2 === 'pila' ? 1 : 0.4 + life * 0.5)) out.props.push(tag({ type: t2, at: PP(fu, fv), rot: Math.round(F.deg + rng.range(-20, 20)) }));
        for (let k = 0; k < 2 + Math.round(life * 2); k++) out.props.push(tag({ type: 'laundry_line', at: W(cu + rng.range(-cw / 4, cw / 4), cv2 + rng.range(-cd / 4, cd / 4)), rot: Math.round(F.deg + rng.pick([0, 90]) + rng.range(-10, 10)), length: Math.min(cw, cd) * 0.8 }));
      } else if (kind === 'cuarteria') { // a row of one-room homes down one side, each with its own door onto a long corridor yard
        const side = rng.chance(0.5) ? -1 : 1, ud = rng.range(3.4, 4.2), uw = rng.range(3.0, 3.6), uv0 = v0 + 1, uv1 = v1 - 2.5, n = Math.max(2, Math.floor((uv1 - uv0) / uw));
        const ux = side < 0 ? u0 + 0.6 + ud / 2 : u1 - 0.6 - ud / 2;
        for (let k = 0; k < n; k++) { const vv = uv1 - uw / 2 - k * uw; if (!ok(ux, vv, 0.3)) continue; taken.push([ux, vv, uw * 0.45]);
          out.structures.push(tag({ kind: 'house', size: [Math.round(uw * 4) / 4 - 0.05, Math.round(ud * 4) / 4], at: W(ux, vv), rot: Math.round(F.deg + (side < 0 ? -90 : 90)), snap: false, origin: 'new', material: rng.pick(['block', 'adobe', 'block']), finish: rng.chance(0.25) ? fin() : 'none', condition: +rng.range(0.5, 0.7).toFixed(2), roof: 'shed', roofMat: rng.pick(['corrugated', 'corrugated', 'slab']), roofPower: 'none', porch: false, row: true, entrances: { front: 'door' } }));
          const du = ux - side * (ud / 2 + 0.8); // the stoop in front of each door
          if (rng.chance(0.35 + life * 0.5)) out.props.push(tag({ type: rng.pick(['chair', 'buckets', 'pot_plant', 'water_jugs']), at: W(du, vv + rng.range(-0.6, 0.6)), rot: Math.round(F.deg + rng.range(0, 360)) }));
        }
        const cu2 = side < 0 ? u0 + 0.6 + ud + (u1 - u0 - ud) / 2 : u0 + (u1 - u0 - ud) / 2; // the corridor
        tryProp('pila', [[cu2, v0 + 2], [cu2 + 1.5, v0 + 2.5]], 0, {}, 1);
        { const ou = side < 0 ? u1 - 1.4 : u0 + 1.4, ov = v0 + 1.4; if (ok(ou, ov, 0.8) && free(ou, ov, 1.2)) { taken.push([ou, ov, 1.3]); out.structures.push(tag({ kind: 'outhouse', size: [1.4, 1.4], at: W(ou, ov), rot: Math.round(F.deg), snap: false, origin: 'new', material: 'timber' })); } }
        washing(() => [[cu2 + rng.range(-1, 1), rng.range(v0 + 4, v1 - 4)]], 2 + Math.round(dens * 2));
        tryProp('water_tank', [[cu2, v0 + 4.5]], 0, {}, 1.2);
      } else if (kind === 'block') { // a pre-war apartment block, half ruined and squatted: rooms on every floor, a walkway, laundry, roof shacks
        const w = Math.min(PW - 2.5, Math.max(10, PW * 0.8)), d = Math.min(PD - 6, Math.max(8, Math.min(12, PD * 0.45))), bv = v1 - 3.5 - d / 2;
        taken.push([cu, bv, Math.max(w, d) * 0.55]);
        out.structures.push(tag({ kind: 'posada', layout: 'gallery', size: [Math.round(w * 4) / 4, Math.round(d * 4) / 4], at: W(cu, bv), rot: Math.round(F.deg), snap: false, origin: 'prewar', material: rng.pick(['concrete', 'block']), roof: 'flat', roofMat: 'slab', floors: +rng.weighted({ 2: 2, 3: 3, 4: 1 }), finish: rng.pick(['faded', 'none', 'faded']), condition: +rng.range(0.47, 0.62).toFixed(2), signs: false, roofPower: rng.chance(0.3) ? 'wind' : 'none', name: 'apartments', adapt: ['bricked', ...(rng.chance(0.6) ? ['leanto'] : [])], roofGarden: rng.pick(['drying', 'mixed']), extras: ['water_drums', ...(rng.chance(0.5) ? ['antenna'] : [])] }));
        // the ground floor yard behind: junk, washing, a pila, a fire barrel, car hulk
        washing(() => scatter(6), 2 + Math.round(life * 2));
        tryProp('pila', scatter(6), anyRot, {}, 1); tryProp('fire_barrel', scatter(6), 0, {}, 0.6);
        for (let k = 0; k < 2 + Math.round(dens * 3); k++) tryProp(rng.pick(['trash_heap', 'tires', 'crates', 'bicycle', 'barrel', 'scrap_heap']), scatter(6), anyRot, {}, 0.9);
        if (rng.chance(0.4)) tryProp('car_wreck', scatter(6), anyRot, {}, 2.4);
      } else { // family compound: 2-4 houses of different ages round one yard, a shared kitchen ramada, horno, a long table
        const n = Math.max(2, Math.min(4, Math.round(A / 160) + (dens > 0.6 ? 1 : 0))), spots = [[u0 + 0.4, v1 - 0.4, 0], [u1 - 0.4, v1 - 0.4, 0], [u0 + 0.4, v0 + 0.4, 1], [u1 - 0.4, v0 + 0.4, 1]];
        for (let k = 0; k < n; k++) {
          const [cu0, cv0, back] = spots[k], hw = rng.range(6, 8.5), hd = rng.range(5, 6.5), hu = cu0 + (cu0 < cu ? hw / 2 : -hw / 2), hv = cv0 + (back ? hd / 2 : -hd / 2);
          if (!ok(hu, hv, 0.2) || !free(hu, hv, Math.max(hw, hd) * 0.45)) continue; taken.push([hu, hv, Math.max(hw, hd) * 0.55]);
          out.structures.push(tag({ kind: 'house', size: [Math.round(hw * 4) / 4, Math.round(hd * 4) / 4], at: W(hu, hv), rot: Math.round(F.deg + (back ? 0 : 180)), snap: false, origin: k === 0 ? rng.pick(['new', 'rebuilt']) : rng.pick(['new', 'new', 'built_on_ruin']), material: rng.pick(['adobe', 'block', 'adobe', 'timber']), finish: fin(), condition: +rng.range(0.55, 0.78).toFixed(2), roofPower: 'none' }));
        }
        tryProp('ramada', [[cu, cv], ...scatter(4)], 0, {}, 2.4); tryProp('dining_table', [[cu + 0.3, cv + 0.2], ...scatter(4)], () => rng.range(-10, 10), {}, 1.2);
        tryProp('horno', scatter(6), anyRot, {}, 1.2); tryProp('pila', scatter(6), anyRot, {}, 1); tryProp('chickens', scatter(6), anyRot, {}, 0.8);
        washing(() => scatter(4), 2 + Math.round(life * 2)); for (let k = 0; k < 2; k++) tryProp(rng.pick(['chair', 'toys', 'buckets', 'woodpile', 'water_jugs', 'bicycle']), scatter(6), anyRot, {}, 0.7);
        if (rng.chance(0.4)) tryProp('dog', scatter(6), anyRot, {}, 0.6);
      }
      break;
    }
    case 'palenque': {
      out.ground = { surface: 'packed', cover: 'all' };
      const R = Math.max(4.5, Math.min(7, Math.min(PW, PD) / 2 - 2));
      prop('palenque', cu, cv, 0, { radius: +R.toFixed(1), edge: 0 }, R + 1.2);
      for (const [u, v] of scatter(14)) if (prop(rng.pick(['crates', 'barrel', 'chair', 'cafe_table']), u, v, rng.range(0, 360), {}, 0.8) && out.props.length > 7) break;
      tryProp('food_cart', scatter(10), () => rng.range(0, 360), {}, 1.6);
      tryProp('painted_sign', [[cu + 3, v1 - 1.5], [cu - 3, v1 - 1.5]], 0, { text: rng.pick(['PALENQUE', 'PELEA DE GALLOS', 'PALENQUE\nSÁBADO']) }, 1);
      break;
    }
    case 'lienzo': {
      out.ground = { surface: 'packed', cover: 'all' };
      // the round ring (ruedo) at the back, the long lane (callejón) toward the street, stands on the sides
      const R = Math.max(7, Math.min(18, Math.min(PW / 2 - 4, PD * 0.32)));
      const rc = [cu, v0 + R + 2.5], n = 28;
      const gateA = Math.PI / 2; // the lane joins the ring on the street side (+v)
      const pts = [];
      for (let k = 0; k <= n; k++) { const a = gateA + 0.18 + (k / n) * (Math.PI * 2 - 0.36); pts.push([rc[0] + Math.cos(a) * R, rc[1] + Math.sin(a) * R]); }
      wall('rail', pts);
      const lw = 3.4, lane0 = rc[1] + R - 0.3, lane1 = Math.min(v1 - 2, lane0 + Math.max(8, PD - 2 * R - 6));
      for (const sd of [-1, 1]) wall('rail', [[rc[0] + sd * lw / 2, lane0], [rc[0] + sd * lw / 2, lane1]]);
      for (const sd of [-1, 1]) { const u = rc[0] + sd * (R + 3.2); prop('bleachers', u, rc[1], sd > 0 ? -90 : 90, { length: Math.min(14, R * 1.2) }, 2.5); }
      tryProp('bleachers', [[rc[0], rc[1] - R - 3.2]], 0, { length: Math.min(12, R) }, 2.5);
      tryProp('flagpole', [[rc[0] + lw / 2 + 2.5, lane1 - 1]], 0, {}, 0.8);
      for (let k = 0; k < rng.int(2, 4); k++) tryProp('brahmin', scatter(12), () => rng.range(0, 360), {}, 1.6);
      tryProp('painted_sign', [[rc[0] - lw / 2 - 2.5, lane1 - 1]], 0, { text: rng.pick(['LIENZO CHARRO', 'CHARREADA\nDOMINGO', 'LIENZO {N}'.replace('{N}', rng.pick(['EL GALLO', 'LA PERLA', 'SAN JUDAS']))]) }, 1);
      break;
    }
    // ---- the wasteland ------------------------------------------------------------------------------------
    case 'slavers': { // a walled camp: cages down one side, the auction block facing the gate, chain posts, the boss's hut,
      // a watchtower over the gate, the guards' shade with the branding fire
      if ((pl.fence || 'auto') === 'auto') { out.fence = rng.pick(['scrap', 'scrap', 'wood_old']); out.fenceH = 2.6; out.fenceBarbed = true; }
      out.ground = { surface: 'dirt', cover: 'all' };
      const side = rng.chance(0.5) ? 1 : -1, cu2 = side > 0 ? u1 - 2.2 : u0 + 2.2;
      for (let v = v0 + 2.6; v < v1 - 4; v += 2.9) prop('cage', cu2, v, side > 0 ? -90 : 90, { width: 2.3, depth: 2.3 }, 1.4);
      const ab = [cu - side * PW * 0.1, v1 - Math.max(5, PD * 0.38)];
      prop('auction_block', ab[0], ab[1], 0, {}, 2.4);
      for (const du of [-2.6, 2.6]) prop('chain_post', ab[0] + du, ab[1] - 1.2, 0, {}, 0.5);
      const hs = site(side > 0 ? [[0.15, 0.15], [0.25, 0.2], [0.3, 0.3], [0.4, 0.25]] : [[0.85, 0.15], [0.75, 0.2], [0.7, 0.3], [0.6, 0.25]], 3.5);
      if (hs) { const [hx, hv] = hs; taken.push([hx, hv, 3.4]); out.structures.push(tag({ id: `${pl.id}-boss-${opts.v || 0}`, kind: 'den', layout: 'gunshop', size: [6, 5], at: W(hx, hv), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['block', 'adobe']) })); }
      tryProp('watchtower', [[u0 + 2.6, v1 - 2.6], [u1 - 2.6, v1 - 2.6]], (u, v) => (Math.atan2(cu - u, cv - v) * 180) / Math.PI, {}, 2); // the ladder (+Z) toward the inside
      tryProp('ramada', [[cu + side * PW * 0.2, v0 + PD * 0.45], [cu, cv]], 0, {}, 2.4);
      tryProp('firepit', scatter(10), 0, {}, 1.2); tryProp('fire_barrel', scatter(10), 0, {}, 0.6);
      for (let k = 0; k < 3; k++) tryProp(rng.pick(['crates', 'barrel', 'sacks']), scatter(10), () => rng.range(0, 360), {}, 0.8);
      tryProp('table', scatter(10), () => rng.range(0, 360), { chairs: 2 }, 1.2);
      if (rng.chance(0.7)) tryProp('dog', scatter(10), () => rng.range(0, 360), {}, 0.6);
      tryProp('bones', scatter(10), () => rng.range(0, 360), {}, 0.8);
      break;
    }
    case 'caravan': { // the staging yard, kept in order and kept guarded: a high wall with wire on top, one gate with a guard
      // shack and sandbags, a watchtower at the front corner (ladder inside), a searchlight at the back; the wagons parked
      // side by side down one wall, the brahmin pen across the back, the farrier and the water stop on the other side,
      // the strongroom with its stock stacked in a row beside it
      if ((pl.fence || 'auto') === 'auto') { out.fence = rng.pick(['block', 'adobe', 'scrap']); out.fenceH = 2.5; out.fenceBarbed = true; }
      out.ground = { surface: 'packed', cover: 'all' };
      const side = rng.chance(0.5) ? 1 : -1, uw = side > 0 ? u0 + 2.6 : u1 - 2.6, uo = side > 0 ? u1 - 2.8 : u0 + 2.8; // wagon wall, other wall
      const pd = Math.min(PD * 0.3, 8), pw = Math.min(PW - 6, 16), pv = v0 + 1.2 + pd / 2;
      if (pd >= 4 && pw >= 6) { // the pen across the back
        const a = [cu - pw / 2, pv - pd / 2], b2 = [cu + pw / 2, pv + pd / 2];
        wall('rail', [[a[0], a[1]], [b2[0], a[1]], [b2[0], b2[1]], [cu + 1.5, b2[1]]]); wall('rail', [[cu - 1.5, b2[1]], [a[0], b2[1]], [a[0], a[1]]]);
        for (let k = 0; k < rng.int(3, 6); k++) tryProp('brahmin', Array.from({ length: 8 }, () => [rng.range(a[0] + 1.5, b2[0] - 1.5), rng.range(a[1] + 1, b2[1] - 1)]), () => rng.pick([0, 180]) + rng.range(-15, 15), {}, 1.4);
        tryProp('trough', [[cu, a[1] + 0.9]], 0, {}, 0.5); tryProp('haystack', [[a[0] + 1.6, a[1] + 1.6], [b2[0] - 1.6, a[1] + 1.6]], 0, {}, 1.4);
      }
      // the wagons: one type per yard (now and then a second), noses out to the yard, evenly spaced
      const wt = rng.weighted({ brahmin_wagon: 3, wagon: 2, caravan_trailer: 1 }), wt2 = rng.chance(0.3) ? rng.pick(['farm_cart', 'wagon', 'brahmin_wagon']) : wt;
      let k = 0; for (let v = v1 - 4; v > (pd >= 4 ? v0 + pd + 3.5 : v0 + 3); v -= 3.4, k++) prop(k % 3 === 2 ? wt2 : wt, uw, v, side > 0 ? 90 : -90, {}, 1.5);
      // the other wall: farrier, water stop, strongroom with its stock in a tidy row
      tryProp('ramada', [[uo, v1 - PD * 0.3]], 0, {}, 2.4);
      tryProp('forge', [[uo + side * 0.0, v1 - PD * 0.3 - 0.8]], side > 0 ? 90 : -90, {}, 1.0); tryProp('anvil', [[uo - side * 1.4, v1 - PD * 0.3 + 0.6]], 0, {}, 0.5);
      tryProp('water_tank', [[uo, v1 - 3.2]], 0, {}, 1.4); tryProp('trough', [[uo - side * 2.2, v1 - 3.2]], 0, {}, 0.6);
      const sv = v1 - PD * 0.55;
      if (ok(uo, sv, 1.2) && free(uo, sv, 2.6)) {
        taken.push([uo, sv, 2.8]); out.structures.push(tag({ id: `${pl.id}-strong-${opts.v || 0}`, kind: 'bunker', size: [4.2, 4], at: W(uo, sv), rot: Math.round(F.deg + (side > 0 ? -90 : 90)), snap: false }));
        prop('sandbags', uo - side * 3.0, sv, side > 0 ? -90 : 90, {}, 0.8);
        for (let j = 0; j < 4; j++) prop(j % 2 ? 'sacks' : 'crates', uo, sv - 3.2 - j * 1.4, 0, {}, 0.5);
      }
      // security at the gate and on the walls
      tryProp('guard_shack', [[cu + 3.6, v1 - 2.2], [cu - 3.6, v1 - 2.2]], 0, {}, 1.4);
      for (const sd of [-1, 1]) prop('sandbags', cu + sd * 2.6, v1 - 1.0, 0, {}, 0.5);
      tryProp('fire_barrel', [[cu + 2.2, v1 - 3.2], [cu - 2.2, v1 - 3.2]], 0, {}, 0.5);
      const tu = side > 0 ? u1 - 2.6 : u0 + 2.6; tryProp('watchtower', [[tu, v1 - 2.6]], (Math.atan2(cu - tu, cv - (v1 - 2.6)) * 180) / Math.PI, {}, 2);
      tryProp('spotlight_tower', [[uw, v0 + 2], [uo, v0 + 2]], (u, v) => (Math.atan2(cu - u, cv - v) * 180) / Math.PI, {}, 1.2);
      tryProp('hitching_rail', [[cu, v1 - 4.5]], 0, {}, 1.2);
      tryProp('painted_sign', [[cu - 3.6, v1 - 0.9], [cu + 3.6, v1 - 0.9]], 0, { text: rng.pick(['CARAVANAS', 'PATIO DE CARGA', 'ALTO · REVISIÓN', 'SÓLO CARAVANAS']) }, 0.8);
      break;
    }
    case 'chemden': { // a cook shack out of the way: the still and the cook's table under a tarp, drums, drying racks,
      // a burn pit, stained ground; nobody tidies
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.pick(['scrap', 'none', 'wire']);
      out.ground = { surface: 'dirt', cover: 'all' };
      const hs = site([[0.5, 0.15], [0.35, 0.2], [0.65, 0.2], [0.5, 0.3]], 2.6);
      if (hs) { const [hx, hv] = hs; taken.push([hx, hv, 2.6]); out.structures.push(tag({ id: `${pl.id}-cook-${opts.v || 0}`, kind: 'shack', size: [4.2, 3.4], at: W(hx, hv), rot: Math.round(F.deg), snap: false, origin: 'new', material: 'metal' })); }
      tryProp('still', [[cu - 3, cv], [cu + 3, cv], [cu, cv + 2]], 0, {}, 2);
      tryProp('tarp_tent', [[cu + 2.5, cv - 1], [cu - 2.5, cv - 1]], 0, {}, 2);
      tryProp('chem_table', [[cu + 2.5, cv - 1], [cu - 2.5, cv - 1], [cu, cv + 3]], 0, {}, 1.3);
      for (let k = 0; k < 2; k++) tryProp('drying_rack', scatter(10), () => rng.range(0, 360), {}, 1.4);
      for (let k = 0; k < 4; k++) tryProp('barrel', scatter(12), () => rng.range(0, 360), {}, 0.6);
      tryProp('burn_pit', [[u1 - 3, v0 + 3], [u0 + 3, v0 + 3]], 0, {}, 1.6);
      tryProp('scrap_pile', scatter(10), () => rng.range(0, 360), {}, 1.4);
      for (let k = 0; k < 4; k++) { const [u, v] = [rng.range(u0 + 2, u1 - 2), rng.range(v0 + 2, v1 - 2)]; out.paint.push({ type: 'circle', at: W(u, v), r: +rng.range(0.8, 2.2).toFixed(1), color: rng.pick([0x4a5a3a, 0x5a4a5a, 0x3a3a30]), edge: 0.8, alpha: 0.45, bake: 'use' }); }
      if (rng.chance(0.6)) tryProp('dog', scatter(10), () => rng.range(0, 360), {}, 0.6);
      break;
    }
    case 'fightpit': { // the pit in the middle, bleachers round three sides, the bookie by the gate, fire barrels, lamps
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.pick(['scrap', 'wood_old', 'none']);
      out.ground = { surface: 'packed', cover: 'all' };
      const R = Math.max(3, Math.min(6, Math.min(PW, PD) / 2 - 5)), pc = [cu, cv - 0.5];
      prop('fight_pit', pc[0], pc[1], 0, { radius: +R.toFixed(1) }, R + 1);
      for (const [du, dv, ry] of [[-(R + 3.8), 0, -90], [R + 3.8, 0, 90], [0, -(R + 3.8), 180]]) tryProp('bleachers', [[pc[0] + du, pc[1] + dv]], ry, { length: Math.min(12, R * 2) }, 2.2);
      tryProp('bookie_booth', [[cu + R + 2, v1 - 2.2], [cu - R - 2, v1 - 2.2]], 0, {}, 1.4);
      for (let k = 0; k < 4; k++) tryProp('fire_barrel', ring(4, R + 5, 0.8).map(([u, v]) => [u, v - 0.5]), 0, {}, 0.6);
      tryProp('string_lights', [[cu, v1 - 1.5]], 0, { length: Math.min(8, PW - 4) }, 1);
      for (let k = 0; k < 3; k++) tryProp(rng.pick(['crates', 'barrel', 'bottle_crates']), scatter(10), () => rng.range(0, 360), {}, 0.8);
      tryProp('painted_sign', [[cu - R - 2, v1 - 1.2], [cu + R + 2, v1 - 1.2]], 0, { text: rng.pick(['PELEAS\nHOY', 'EL FOSO', 'LA ARENA\nSÁBADO', 'APUESTAS']) }, 1);
      break;
    }
    case 'scavmarket': { // stalls made of pre-war junk in rows, the scale, sorted bins, carts, a fire barrel
      if ((pl.fence || 'auto') === 'auto') out.fence = 'none';
      out.ground = { surface: 'packed', cover: 'all' };
      const lane = 3.2;
      for (let v = v1 - 2.4; v > v0 + 2; v -= lane + 2.2) for (let u = u0 + 2.2; u < u1 - 1.8; u += 3.6) {
        if (rng.chance(0.15)) continue;
        prop(rng.weighted({ scrap_blanket: 3, tarp_stall: 2, stall: 1.2, basket_table: 1, cart_shop: 0.8, shopping_cart: 0.4 }), u + rng.range(-0.3, 0.3), v, rng.chance(0.5) ? 0 : 180, {}, 1.4);
      }
      tryProp('scale', scatter(10), 0, {}, 1); tryProp('sort_bins', scatter(10), 0, {}, 1.6);
      tryProp('fire_barrel', scatter(10), 0, {}, 0.6); tryProp('handcart', scatter(10), () => rng.range(0, 360), {}, 1.2);
      for (let k = 0; k < 3; k++) tryProp(rng.pick(['scrap_pile', 'tires', 'crates']), scatter(12), () => rng.range(0, 360), {}, 1.2);
      tryProp('painted_sign', [[cu, v1 - 0.8]], 0, { text: rng.pick(['MERCADO\nDE CHATARRA', 'COMPRO · VENDO', 'TIANGUIS\nDEL FIERRO', 'SE CAMBIA\nTODO']) }, 1);
      break;
    }
    case 'cult': { // an odd little chapel at the back, the bonfire in a ring of painted stones, totems, bottle trees, offerings
      if ((pl.fence || 'auto') === 'auto') out.fence = rng.pick(['ocotillo', 'wood_old', 'stone_low']);
      out.ground = { surface: 'packed', cover: 'all' };
      const hs = site([[0.5, 0.18], [0.5, 0.25], [0.4, 0.25], [0.6, 0.25], [0.5, 0.35]], 5), hv = hs ? hs[1] : v0 + 5.5;
      if (hs) { taken.push([hs[0], hv, 5]); const round = rng.chance(0.35);
        out.structures.push(tag(round ? { id: `${pl.id}-temple-${opts.v || 0}`, kind: 'den', layout: 'rotunda', size: [8, 8], at: W(hs[0], hv), rot: Math.round(F.deg), snap: false, origin: 'new', material: rng.pick(['adobe', 'plaster', 'block']), signText: rng.pick(['LA LUZ ÚNICA', 'TEMPLO DEL OJO', 'LOS DEL ÁTOMO', 'EL SOL NEGRO', 'IGLESIA DEL FIN'])  }
          : { id: `${pl.id}-temple-${opts.v || 0}`, kind: 'chapel', cult: true, size: [6, 8], at: W(hs[0], hv), rot: Math.round(F.deg), snap: false, origin: rng.chance(0.4) ? 'prewar' : 'new', material: rng.pick(['adobe', 'block', 'plaster']), signText: rng.pick(['LA LUZ ÚNICA', 'TEMPLO DEL OJO', 'LOS DEL ÁTOMO', 'EL SOL NEGRO', 'IGLESIA DEL FIN'])  }));
        // rooms added on as the sect grew: lean-tos on the sides and behind, each in whatever was at hand
        for (const [du, dv, aw, ad] of [[-(round ? 4 : 3) - 1.6, rng.range(-1.5, 1.5), 3.2, rng.range(3.4, 5)], [(round ? 4 : 3) + 1.6, rng.range(-1.5, 1.5), 3.2, rng.range(3.4, 5)], [rng.range(-1, 1), -(4 + 1.8), rng.range(4, 6), 3.6]]) {
          if (round || !rng.chance(0.75)) continue; const au = hs[0] + du, av = hv + dv; if (!ok(au, av, 0.3)) continue; // the round temple stands alone
          out.structures.push(tag({ id: `${pl.id}-annex${out.structures.length}-${opts.v || 0}`, kind: 'house', size: [Math.round(Math.max(3.6, aw) * 4) / 4, Math.round(Math.max(3.4, ad) * 4) / 4], at: W(au, av), rot: Math.round(F.deg + (du < -1 ? 90 : du > 1 ? -90 : 0)), snap: false, origin: 'new', material: rng.pick(['adobe', 'block', 'plaster']), finish: 'ornate', color: rng.pick([0xc8503a, 0x3a6a9a, 0xd8a838, 0x5a8a5a, 0x8a4a8a, 0xe0d8c0]), roof: 'shed', roofMat: 'corrugated', floors: 1, signs: false, label: false })); // the sect's rooms: small, painted all over
        }
      }
      const R = Math.max(3, Math.min(6, Math.min(PW, PD) / 2 - 4)), bc = [cu, cv + PD * 0.1];
      prop('bonfire', bc[0], bc[1], 0, { radius: 1.3 }, 2);
      for (const [u, v, a] of ring(rng.int(6, 8), R, 0.2)) prop('cult_symbol', u - cu + bc[0], v - cv + bc[1], (Math.atan2(bc[0] - (u - cu + bc[0]), bc[1] - (v - cv + bc[1])) * 180) / Math.PI, {}, 0.8);
      // what the sect worships: one or two pieces of the old world, at the head of the ring and off to the side
      const IDOLS = { goalpost: 1, wing_idol: 1, fiberglass_giant: 1, scrap_statue: 1.2, dish_shrine: 0.8, rocket_idol: 0.8 }, id1 = rng.weighted(IDOLS);
      tryProp(id1, [[bc[0], bc[1] - R - 3], [bc[0], bc[1] + R + 3]], (u, v) => (Math.atan2(bc[0] - u, bc[1] - v) * 180) / Math.PI, {}, id1 === 'goalpost' ? 3.2 : 2);
      if (rng.chance(0.5)) { const id2 = rng.weighted({ ...IDOLS, [id1]: 0 }); tryProp(id2, scatter(12), () => rng.range(0, 360), {}, 2); }
      for (const t of ['totem', 'bottle_tree', 'bone_chimes', 'offering_pile', 'totem']) tryProp(t, scatter(12), () => rng.range(0, 360), {}, 1.2);
      tryProp('altar', [[cu, hv + 5.2]], 0, {}, 1.2);
      for (let k = 0; k < 3; k++) tryProp('torch', ring(3, R + 2, 1).map(([u, v]) => [u - cu + bc[0], v - cv + bc[1]]), 0, {}, 0.5);
      break;
    }
  }
  // a street gate in the middle of the front when the plot is walled
  if (use !== 'farmstead' && use !== 'trader' && use !== 'vacant' && (out.fence || pl.fence || 'auto') !== 'none' && !(pl.noFence || []).includes(0)) out.gate = { at: [+F.front[0].toFixed(2), +F.front[1].toFixed(2)], width: use === 'lienzo' || use === 'caravan' || use === 'slavers' || use === 'salvage' || use === 'acopio' || use === 'era' || use === 'farmers_market' ? 4 : 2.6, leaf: use === 'cemetery' || use === 'salvage' || use === 'acopio' ? 'metal' : 'wood' };
  return out;
}

export function applyUse(spec, pl, use, plan, uid) {
  if (!plan) return false;
  (spec.props ||= []).push(...plan.props.map((q) => ({ ...q, id: q.id || uid('prop') }))); // ids: generated props can be picked and moved
  (spec.structures ||= []).push(...plan.structures.map((s) => ({ ...s, id: uid('bld') })));
  (spec.walls ||= []).push(...plan.walls.map((w) => ({ ...w, id: uid('wall') })));
  (spec.fields ||= []).push(...plan.fields.map((f) => ({ ...f, id: uid('field') })));
  (spec.paint ||= []).push(...plan.paint.map((p) => ({ ...p, inPlot: pl.id })));
  spec.vegetation ||= {}; (spec.vegetation.plants ||= []).push(...plan.plants);
  if (plan.fence) pl.fence = plan.fence;
  if (plan.noFence && !pl.noFence) pl.noFence = plan.noFence;
  if (plan.gate && !pl.gates?.length && !pl.bakedFence && !pl.gatesEdited) pl.gates = [plan.gate];
  if (plan.ground && !pl.ground) pl.ground = plan.ground;
  if (plan.fenceH != null && pl.fenceH == null) pl.fenceH = plan.fenceH;
  if (plan.fenceBarbed) pl.fenceBarbed = plan.fenceBarbed;
  if (plan.fenceGlass) pl.fenceGlass = true;
  pl.bakedUse = use;
  return true;
}

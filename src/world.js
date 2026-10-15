// Orchestrates a place spec -> three.js scene graph (+ lights and particle emitters for baking/effects).
import { nameFor, surnameFor, placeName } from './names.js';
import { irrigationNet, waterPaint, waterFlora, WATER } from './water.js';
import * as THREE from 'three';
import { RNG, deg, makeNoise } from './rng.js';
import { Terrain, decodeDelta } from './terrain.js';
import { prepareRoad, buildRoad, buildRunout, findJunctions, buildJunction, junctionShape, LAID, laidAt, walkOf } from './roads.js';
import { buildStructure, attachSigns, massesFor } from './buildings.js';
import { buildFence } from './fences.js';
import { prepareField, buildField } from './fields.js';
import { buildProp, attachPropSigns, PROP_LIGHT } from './props.js';
import { Flora, scatter } from './vegetation.js';
import { runAuto, classOf, densityField } from './layout.js';
import { planSurrounds, planWall } from './surrounds.js';
import { planPlaza, placeCamp, placeMarket, placeArea } from './temps.js';
import { lotPoly } from './lots.js';
import { planParcelFences } from './parcels.js';
import { planAlleys, planSecurity } from './town.js';
import { plotFences, plotDerived, plotFrame } from './plots.js';
import { placeVerges } from './verge.js';
import { polePositions } from './power.js';
import { rollGround, groundRegions, groundPaints, groundMesh } from './grounds.js';
import { Raster, obb, obbOverlap, toWorld, toLocal, nearestOnSamples, nearestWithin, facingAngle, pointInPoly, polyBounds, sampleAt, pathLength } from './geo.js';
import { Builder } from './builder.js';
import { buildCrossings } from './crossings.js';
import { retainZone, roadCliffs, cliffStrips, cliffWall, cliffBand } from './cliffs.js';
import { PAINT } from './palette.js';
import { MATS, U, initMaterials } from './materials.js';
import { settlementOf } from './finishes.js';
import { setFlagSource } from './flags.js';
import { vegField, buildDecals } from './groundfx.js';
import { computeActivity } from './activity.js';
import { placeLife } from './life.js';
import { placeGaps } from './gaps.js';
import { kindLayout } from './kinds.js';

const POWER_ODDS = { none: 0, scarce: 0.3, some: 0.65, grid: 0.95 };
// props that lie on the ground and follow its slope; everything else stays upright and is sunk to the
// lowest ground under its footprint so no leg or post floats
const TILT = new Set(['jersey_barrier', 'road_barrier', 'hedge', 'hedge_dead', 'pot_large', 'car_wreck', 'truck_chassis', 'engine_block', 'cart', 'wagon', 'cart_shop', 'crates', 'barrel', 'tires', 'scrap_pile', 'rubble',
  'rocks', 'bench', 'table', 'trough', 'bones', 'bedroll', 'tent_aframe', 'tent_wall', 'tent_bell', 'lean_to', 'tarp_tent', 'stall', 'tarp_stall',
  'goods', 'woodpile', 'haystack', 'lumber', 'tan_pit', 'planter', 'chickens', 'workbench', 'generator', 'solar_panel', 'brahmin', 'gas_pump', 'firepit']);

function withBake(g) {
  if (!g.attributes.bake) g.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}
function meshes(geoms) {
  const out = [];
  for (const [ch, g] of Object.entries(geoms)) { const m = new THREE.Mesh(withBake(g), MATS[ch] || MATS.main); if (ch === 'water') m.layers.set(1); if (ch === 'leaf') { m.userData.cards = true; m.userData.veg = true; } out.push(m); }
  return out;
}

// ---------------------------------------------------------------- frames (shared grain)
// spec.frames: { name: { origin: [x,z], angle?: deg, road?: id, offset?: deg } }
// any item with `frame: name` has its coordinates (at / path / poly) given in that frame.
function resolveFrames(spec) {
  const frames = {};
  for (const [name, f] of Object.entries(spec.frames || {})) {
    let ang = f.angle ?? 0;
    if (f.road) {
      const road = (spec.roads || []).find((r) => r.id === f.road);
      if (road) {
        // tangent of the road polyline nearest the origin
        let best = Infinity, t = [0, 1];
        for (let i = 0; i < road.path.length - 1; i++) {
          const [ax, az] = road.path[i], [bx, bz] = road.path[i + 1];
          const L = Math.hypot(bx - ax, bz - az) || 1;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          const d = Math.hypot(mx - f.origin[0], mz - f.origin[1]);
          if (d < best) { best = d; t = [(bx - ax) / L, (bz - az) / L]; }
        }
        let r = Math.atan2(t[0], t[1]);
        if (r > Math.PI / 2) r -= Math.PI; if (r < -Math.PI / 2) r += Math.PI;
        ang = (r * 180) / Math.PI;
      }
    }
    frames[name] = { o: f.origin || [0, 0], r: deg(ang + (f.offset || 0)), deg: ang + (f.offset || 0) };
  }
  const P = (F, p) => { const [x, z] = toWorld(p[0], p[1], F.r); return [F.o[0] + x, F.o[1] + z]; };
  const map = (it) => {
    const F = it && it.frame && frames[it.frame];
    if (!F) return it;
    const o = { ...it };
    if (o.at) o.at = P(F, o.at);
    if (o.path) o.path = o.path.map((p) => P(F, p));
    if (o.poly) o.poly = o.poly.map((p) => P(F, p));
    if (o.area) o.area = o.area.map((p) => P(F, p));
    if (o.near) o.near = P(F, o.near);
    if (Array.isArray(o.face)) o.face = P(F, o.face);
    if (o.rot != null) o.rot += F.deg;
    else if (o.face == null) o.rot = F.deg;
    o._frame = F.deg;
    delete o.frame;
    return o;
  };
  const s = { ...spec };
  for (const k of ['structures', 'props', 'fields', 'walls', 'roads', 'clearings', 'paint', 'scatter', 'camps', 'markets', 'areas']) if (s[k]) s[k] = s[k].map(map);
  if (s.auto) s.auto = s.auto.map((a) => { const m = map(a); if (a.frame && frames[a.frame] && a.axis != null) m.axis = a.axis + frames[a.frame].deg; return m; });
  if (s.vegetation) s.vegetation = { ...s.vegetation, plants: (s.vegetation.plants || []).map(map), groves: (s.vegetation.groves || []).map(map) };
  s._frames = frames;
  return s;
}

const ROCKY = new Set(['rocks', 'outcrop', 'boulder', 'stones']);
const THROUGH = new Set(['patio_slab', 'tree_ring', 'pergola', 'ramada', 'shade_cloth', 'laundry_line', 'alley_line', 'alley_tarp', 'cables', 'fairy_lights', 'tree_grate', 'lean_to', 'garden_bed_low', 'petate']);
export class World {
  constructor(spec) {
    this.src = spec;
    this.spec = resolveFrames(spec);
    this.seed = String(spec.seed ?? spec.name ?? 'place');
    this.settlement = settlementOf(spec);
    setFlagSource(spec.settlement?.flag, `${this.seed}:${spec.name || ''}`);
  }

  blocked(x, z, r = 0) { return this.raster.test(x, z, r); }
  roadNear(x, z, r) {
    for (const rd of this.roads) {
      const bb = rd._bb, m = r + rd.hw; // the box is the centreline's: pad it by the half-width too
      if (x < bb[0] - m || x > bb[2] + m || z < bb[1] - m || z > bb[3] + m) continue;
      if (nearestWithin(rd.samples, x, z, rd.hw + r)) return true;
    }
    return false;
  }

  generate() {
    initMaterials();
    const spec = this.spec;
    this._shadeR = null;
    for (const [i, p] of (spec.props || []).entries()) if (p.inPlot && !p.id) p.id = `${p.inPlot}-y${i}`; // older baked plots: give generated props ids so they can be selected
    const T = (this.terrain = new Terrain(spec, this.seed));
    this.group = new THREE.Group();
    this.items = new Map();
    this.anim = [];
    this.lights = [];
    this.roofs = [];
    this.climbs = [];
    this.emitters = [];
    this.raster = new Raster(T.W, T.D);
    this.hard = new Raster(T.W, T.D); // solid things only (no fields / clearings): for camps and markets
    this.propFoot = [];
    this.solids = [];   // building footprints (+ porches): no prop may sit inside
    this.keepOut = [];  // doorways and gates: kept clear, props are pushed aside
    this.flora = new Flora(this.seed);
    this.lrng = new RNG(`${this.seed}:lights`);

    // 1. roads (+ hierarchy class, condition better near the core)
    const S = spec.settlement || {};
    const core = S.core || [0, 0], R = Array.isArray(S.radius) ? (S.radius[0] + S.radius[1]) / 2 : S.radius || 50;
    this.roads = [...(spec.roads || []), ...gridRoads(spec, this.seed), ...gateTracks(spec)].map((r, i) => { const rr = eraShape({ id: r.id || `road${i}`, ...r }, this.seed); return this.own(rr.id, () => prepareRoad(rr, T)); });
    for (const r of this.roads) {
      r.cls = classOf(r);
      if (S.core || S.radius) {
        const c0 = r.condition ?? 0.6;
        r.condAt = (x, z) => { const d = Math.hypot(x - core[0], z - core[1]) / R; return Math.min(0.95, c0 + (1 - c0) * 0.55 * Math.exp(-d * d)); };
      }
      this.raster.path(r.samples, r.hw + (r.shoulder || 0) * 0.5 + 1.1); this.walkRaster(r, this.raster);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const sm of r.samples) { x0 = Math.min(x0, sm.x); z0 = Math.min(z0, sm.z); x1 = Math.max(x1, sm.x); z1 = Math.max(z1, sm.z); }
      r._bb = [x0, z0, x1, z1];
    }
    const DV = plotDerived(spec);
    this.fields = [...(spec.fields || []), ...DV.fields];
    this.own('@juncpaint', () => this.junctionPaint(findJunctions(this.roads)));
    const rng0 = new RNG(`${this.seed}:lotsuse`);
    this.walls = [...(spec.walls || [])];
    this.genProps = [];
    this.genPlants = [];
    const plazaProps = planPlaza(this) || [];

    // retaining walls shape the ground (terraces / platforms)
    this.retainCliffs = [];
    for (const rt of spec.retains || []) if (rt.id && rt.path?.length >= 2) this.own(rt.id, () => this.retainCliffs.push(retainZone(rt, T, this.roads)));
    for (const r of this.roads) r.cliffs = roadCliffs(r, T);
    this.updateCliffs();
    // 2. structures: authored + auto-layout (town / frontage / cluster), then angle snapping
    this.areas = [...(spec.areas || []), ...DV.areas].map((a) => this.resolveArea(a));
    const authored = (spec.structures || []).map((s) => this.resolveStructure(s));
    const autos = runAuto(spec, this.roads, this.seed, { taken: [...(this.plaza ? [this.plaza.obb] : []), ...this.areas.map((a) => obb(a.at[0], a.at[1], a.size[0] + 2, a.size[1] + 2, deg(a.rot)))], authored, areas: this.areas, plaza: this.plaza });
    this.lots = autos.lots || [];
    this.parcels = autos.parcels || null;
    this.parcelEdges = autos.parcelEdges || null;
    this.labelAt = autos.labelAt || null;
    this._raster = autos._raster;
    if (autos.parcelFields) this.fields.push(...autos.parcelFields);
    if (this.parcels) for (const s of authored) if (s._parcel != null) s._lot = this.parcels[s._parcel];
    if (S.core) { const df = densityField(spec, this.seed); this.townDensity = (x, z) => Math.min(1, df(x, z) * 1.3); }
    this.camps = [...(spec.camps || []), ...autos.camps];
    this.markets = [...(spec.markets || [])];
    if (S.market && this.plaza) this.markets.push({ id: 'market', at: this.plaza.at, r: this.plaza.r - 1, ...(typeof S.market === 'object' ? S.market : {}) });
    this.structures = [...authored, ...autos.map((s) => this.resolveStructure(s))];
    this.snap();
    // yards / gardens / compounds around buildings, then the town wall
    const gen = planSurrounds(this);
    for (const st of gen.structures) this.structures.push(this.resolveStructure(st));
    this.fields.push(...gen.fields);
    this.walls.push(...gen.walls);
    this.walls.push(...planParcelFences(this));
    this.genProps.push(...plazaProps, ...gen.props);
    this.genPlants.push(...gen.plants);
    // (town wall disabled for now)
    for (const s of this.structures) this.own(s.id, () => this.seatStructure(s));

    // 3. ground paint, blockers
    this.irr = WATER ? irrigationNet(this.walls, this.fields, spec.props) : null;
    for (const f of this.fields) { f._irr = this.irr?.irr.get(f.id); this.own(f.id, () => { prepareField(f, T); this.raster.poly(f.poly); }); }
    if (WATER) for (const w of this.walls) if (w.type === 'stream' && w.id) this.own(w.id, () => waterPaint(T, w));
    if (WATER) for (const p of spec.props || []) if (p.type === 'spring' && p.id) this.own(p.id, () => waterPaint(T, p));
    for (const c of spec.clearings || []) { this.raster.circle(c.at[0], c.at[1], c.r); if (c.paint !== false) T.addPaint({ type: 'circle', at: c.at, r: c.r, color: PAINT[c.paint] ?? c.paint ?? PAINT.yard, edge: 2, alpha: 0.6 }); }
    for (const l of this.lots) {
      const poly = l.poly || lotPoly(l);
      if (l.use === 'garden') { const f = { type: 'garden', poly: shrinkPoly(poly, 1.2), crop: 'mixed', ...(l.poly ? {} : { fence: rng0.pick(['ocotillo', 'pole', 'stone_low', 'wood']) }), _lot: true }; this.fields.push(f); prepareField(f, T); this.raster.poly(f.poly); }
      if (l.D > 0.3 || l.use) T.addPaint({ type: 'poly', poly, color: l.use === 'ruin' ? 0xb5ab9a : PAINT.packed, edge: 1.2, alpha: Math.min(0.85, 0.35 + l.D * 0.6), layer: 'urban', layerK: 0.4 + l.D * 0.6 });
    }
    for (const a of this.areas) this.own(a.id, () => this.areaPaint(a));
    if (false) T.addPaint({ type: 'obb', obb: obb(a.at[0], a.at[1], a.size[0], a.size[1], deg(a.rot)), color: PAINT.packed, edge: 1.5, alpha: 0.8, layer: a.type === 'market' ? 'pavers' : 'urban', layerK: a.type === 'market' ? 0.5 : 0.9 });
    for (const c of [...this.camps, ...this.markets]) T.addPaint({ type: 'circle', at: c.at, r: (c.radius || c.r || 8) * 0.8, color: PAINT.packed, edge: 3, alpha: 0.55 });
    this.own('@paint', () => { for (const p of spec.paint || []) this.addSpecPaint(p); });
    for (const pl of spec.plots || []) if (pl.id) this.own(`ground:${pl.id}`, () => this.plotGroundPaint(pl, spec));
    for (const f of this.walls) { if (f.type === 'powerline') { this.polePads(f); continue; } const sp = samplePathSimple(f.closed ? [...f.path, f.path[0]] : f.path); this.raster.path(sp, 0.8); this.hard.path(sp, 0.6); }
    for (const p of [...(spec.props || []), ...this.genProps]) { const at = this.propAt(p); if (at && !p.in) this.raster.circle(at[0], at[1], p.clear ?? 1.2); }

    // 4. terrain (+ per-pixel ground map)
    this.group.add(T.build());
    for (const k of ['g1', 'g2', 'g3']) { U['uG' + k[1]].value?.dispose?.(); U['uG' + k[1]].value = T.ground[k]; }
    U.uGRect.value.set(...T.ground.rect);
    U.uRockCol.value.set(T.biome.rock);

    // 5. roads (+ junction pads where roads meet)
    this.junctions = findJunctions(this.roads);
    for (const r of this.roads) r._junc = this.junctions.filter((j) => j.roads.includes(r));
    this.own('@junc', () => this.addJunctions());
    for (const r of this.roads) {
      this.roadMeshes(r);
      if (r.name) this.register({ id: r.id, name: r.name, type: 'road', spec: r, object: null, anchor: () => { const p = sampleAt(r.samples, pathLength(r.samples) * 0.5); return new THREE.Vector3(p.x, T.height(p.x, p.z) + 1, p.z); } });
    }

    // 6-9
    for (const c of this.retainCliffs) this.own(c.owner, () => this.addCliff(c));
    for (const s of this.structures) this.own(s.id, () => this.addStructure(s));
    // builder plots: fences along the plot lines (after buildings, so they stop at walls)
    this.plots = spec.plots || [];
    this.plotWalls = plotFences(this.plots, this.structures, this.seed, this.solids);
    for (const f of this.walls) this.own(f.id, () => this.addFence(f));
    for (const f of this.plotWalls) this.own(f.id, () => this.addFence(f));
    this.registerBuilderItems();
    for (const f of this.fields) {
      this.own(f.id, () => buildField(f, this));
      if (f.id && (f.name || f.stats)) {
        const c = f.poly.reduce((a, p) => [a[0] + p[0] / f.poly.length, a[1] + p[1] / f.poly.length], [0, 0]);
        const fo = this.src.overrides?.[f.id];
        this.register({ id: f.id, name: f.name, type: 'field', spec: fo ? { ...f, ...fo, stats: { ...(f.stats || {}), ...(fo.stats || {}) } } : f, object: null, outline: f.poly, anchor: () => new THREE.Vector3(c[0], T.height(c[0], c[1]) + 2, c[1]) });
      }
    }
    for (const pl of spec.plots || []) if (pl.id) this.own(`ground:${pl.id}`, () => this.plotGroundMesh(pl));
    { const E = spec.vegetation?.erase || []; this.vegErased = E.length ? (x, z) => E.some((e) => (x - e.at[0]) ** 2 + (z - e.at[1]) ** 2 < e.r * e.r) : null; } // (scatter replaces it with a hashed one later)
    // generated dressing never sits on a road (a road drawn through a plot later, a track across outskirts)
    const onRoad = (p) => { const at = !p.in && Array.isArray(p.at) ? p.at : null; return at && this.roadNear(at[0], at[1], 0.35); };
    for (const p of spec.props || []) { if (p.inPlot && p.bake && !p.touched && onRoad(p)) continue; this.own(p.id, () => this.addProp(p)); }
    for (const p of this.genProps) if (!onRoad(p)) this.addProp(p);
    for (const l of this.lots) if (l.use === 'ruin' && !l.poly) this.addRuinLot(l);
    for (const a of this.areas) this.own(a.id, () => this.placeAreaRec(a));
    planSecurity(this);
    for (const c of this.camps) placeCamp(this, c);
    for (const m of this.markets) placeMarket(this, m);
    // signs of human life by the activity map (life.js; replaces the old alley pass)
    this.lifeItems = []; this.lifePaths = []; this.alleys = [];
    this.own('@activity', () => { this.activity = computeActivity(this); });
    try { placeGaps(this); } catch (e) { console.warn('[gaps]', e); }
    try { placeLife(this, this.activity); } catch (e) { console.warn('[life]', e); }
    try { placeVerges(this); } catch (e) { console.warn('[verge]', e); }
    for (const pl of this.genPlants) {
      const rng = new RNG(`${this.seed}:yardplant:${pl.at.join(',')}`);
      this.flora.add(pl.species, pl.at[0], T.height(pl.at[0], pl.at[1]) - 0.03, pl.at[1], rng.range(0.8, 1.1), rng.next() * 6.28, rng);
    }
    try { this.placeGrates(); } catch (e) { console.warn('[grates]', e); }
    for (const rule of spec.scatter || []) this.runScatter(rule);

    // 10. vegetation
    scatter(this.flora, this, spec);
    if (WATER) waterFlora(this);
    this.group.add(this.flora.build());
    this.groundFx();
    return this.group;
  }

  // the Activity slider / Busier-Quieter paint changed: redo all the life items
  redoLife() {
    const gone = this.group.children.filter((c) => typeof c.userData.owner === 'string' && c.userData.owner.startsWith('life:'));
    for (const c of gone) { this.group.remove(c); c.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); }); }
    this.lights = this.lights.filter((l) => !(typeof l._o === 'string' && l._o.startsWith('life:')));
    this.propFoot = (this.propFoot || []).filter((q) => !(typeof q.o === 'string' && q.o.startsWith('life:')));
    this.emitters = this.emitters.filter((e) => !(typeof e._o === 'string' && e._o.startsWith('life:')));
    this.rebuildRaster();
    this.lifeItems = []; this.lifePaths = []; this.alleys = [];
    this.activity = computeActivity(this);
    try { placeLife(this, this.activity); } catch (e) { console.warn('[life]', e); }
    this.groundFx();
  }

  // vegetation cover field + ground decals (rebuilt whole after every change: cheap, deterministic)
  groundFx(box = null) {
    try {
      const pv = box && this.veg ? this.veg : null; if (!pv) this.veg?.tex.dispose();
      this.veg = vegField(this, box, pv);
      U.uVeg.value = this.veg.tex; U.uVegRect.value.set(...this.veg.rect);
      const old = this.group.getObjectByName('decals'); if (old) { this.group.remove(old); old.geometry.dispose(); } // the material is shared
      const d = buildDecals(this, box && this._decalQ ? [box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4] : null, this._decalQ); if (d) this.group.add(d);
      this._gen = (this._gen || 0) + 1;
    } catch (e) { console.warn('[groundfx]', e); }
  }

  resolveStructure(s0) {
    if (this._rec) this._rec.structures.push(structuredClone(s0));
    const ov = this.src.overrides?.[s0.id];
    const s = { ...s0, ...(ov || {}) };
    if (ov?.stats) s.stats = { ...(s0.stats || {}), ...ov.stats };
    s._rotSrc = s.auto ? 'auto' : s.face != null && s.rot == null ? 'face' : 'explicit';
    if (s.face != null && s.rot == null) {
      let tx, tz;
      if (typeof s.face === 'string') {
        const r = this.roads.find((rr) => rr.id === s.face);
        if (r) { const q = nearestOnSamples(r.samples, s.at[0], s.at[1]); tx = q.qx; tz = q.qz; }
        else { const o = (this.spec.structures || []).find((x) => x.id === s.face) || (this.spec.props || []).find((x) => x.id === s.face); if (o) [tx, tz] = o.at; }
      } else [tx, tz] = s.face;
      if (tx != null) s.rot = (facingAngle(tx - s.at[0], tz - s.at[1]) * 180) / Math.PI + (s.rotOffset || 0);
    }
    s.rot = s.rot || 0;
    this.massesOf(s);
    return s;
  }
  massesOf(s) {
    const R = deg(s.rot);
    s._masses = massesFor(s, null).map((m) => {
      const [wx, wz] = toWorld(m.x || 0, m.z || 0, R);
      return obb(s.at[0] + wx, s.at[1] + wz, m.w, m.d, R + deg(m.rot || 0));
    });
  }

  // Snap non-explicit rotations to neighbours' grain (parallel / perpendicular) when they're close
  snap() {
    const spec = this.spec;
    if (spec.snap === false) return;
    const fixed = this.structures.filter((s) => s._rotSrc === 'explicit');
    const loose = this.structures.filter((s) => s._rotSrc !== 'explicit' && s.snap !== false);
    const size = (s) => Math.max(...(s.size || [10, 8]));
    const dist = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
    loose.sort((a, b) => Math.min(...fixed.map((f) => dist(a, f)), 1e9) - Math.min(...fixed.map((f) => dist(b, f)), 1e9));
    const done = [...fixed];
    for (const s of loose) {
      const thr = s._rotSrc === 'auto' ? spec.snapAuto ?? 7 : spec.snapAngle ?? 16;
      let best = null;
      for (const o of done) {
        const d = dist(s, o);
        if (d > (size(s) + size(o)) / 2 + (spec.snapRange ?? 16)) continue;
        let a = ((s.rot - o.rot) % 90 + 90) % 90; if (a > 45) a -= 90;
        if (Math.abs(a) <= thr && (!best || d < best.d)) best = { d, a };
      }
      if (best) { s.rot -= best.a; this.massesOf(s); }
      done.push(s);
    }
  }

  register(item) { if (this._owner && this._owner !== item.id) item._o = this._owner; this.items.set(item.id, item); }

  // areas: { id, type: market|visitors|lot, at, size:[w,d], rot | face: roadId, name, stats } — front (+z) faces the road
  resolveArea(a0) {
    const a = { ...a0, size: a0.size || [30, 24] };
    if (a.rot == null && a.face) {
      const r = this.roads.find((rr) => rr.id === a.face);
      if (r) { const q = nearestOnSamples(r.samples, a.at[0], a.at[1]); a.rot = (facingAngle(q.qx - a.at[0], q.qz - a.at[1]) * 180) / Math.PI; }
    }
    a.rot = a.rot || 0;
    return a;
  }

  addRuinLot(l) {
    const rng = new RNG(`${this.seed}:ruinlot:${l.cx | 0},${l.cz | 0}`);
    const st = this.resolveStructure({ id: `ruinlot-${l.cx | 0}-${l.cz | 0}`, kind: 'ruin', origin: rng.chance(0.5) ? 'stripped' : 'ruin', material: rng.pick(['concrete', 'block', 'brick']), size: [Math.max(5, l.w - rng.range(1, 3)), Math.min(l.d - 4, rng.range(7, 11))], at: [l.cx, l.cz], rot: l.deg, snap: false, surround: false });
    const [ox, oz] = toWorld(0, l.d / 2 - st.size[1] / 2 - rng.range(0.5, 3), deg(l.deg));
    st.at = [l.cx + ox, l.cz + oz]; this.massesOf(st);
    let sum = 0; for (const m of st._masses) sum += this.terrain.height(m.cx, m.cz);
    st._y = sum / st._masses.length;
    this.structures.push(st);
    this.addStructure(st);
  }

  // ---------------------------------------------------------------- editor: ownership + incremental updates
  // plot ground surface: paint now (before the ground map), mesh once the ground is final
  plotGroundPaint(pl, spec = this.spec) {
    const st = (spec.structures || []).find((x) => x.id === pl.building || (x.plot === pl.id && !x.inPlot));
    const g = { ...rollGround(pl, st, this.seed), ...(pl.ground || {}) };
    const regions = groundRegions(pl, st, g.cover || 'all');
    // a row house set back from the street: its tiled / paved front runs on out to the road edge (outside the plot)
    const HARDS = new Set(['saltillo', 'laja', 'encaustic', 'brick', 'slab', 'cobble', 'pavers', 'herringbone', 'concrete']);
    if (HARDS.has(g.surface) && (pl.row || st?.row) && pl.poly?.length >= 2) {
      const rd = (this.roads || []).find((q) => q.id === pl.road) || (this.roads || []).filter((q) => q.samples && !q._gate && q.type !== 'path').map((q) => [q, nearestOnSamples(q.samples, (pl.poly[0][0] + pl.poly[1][0]) / 2, (pl.poly[0][1] + pl.poly[1][1]) / 2).d - q.hw]).filter(([, d]) => d < 12).sort((a, b) => a[1] - b[1])[0]?.[0];
      if (rd?.samples) {
        const edgePt = (p) => { const q = nearestOnSamples(rd.samples, p[0], p[1]); if (q.d - rd.hw < 0.3 || q.d - rd.hw > 12) return null; const k = (rd.hw + (rd.laid?.length ? 0.22 : 0.05)) / q.d; return [q.qx + (p[0] - q.qx) * k, q.qz + (p[1] - q.qz) * k]; };
        const [a, b] = pl.poly, ea = edgePt(a), eb = edgePt(b);
        const rich = pl.zcat === 'wealthy' || st?.zcat === 'wealthy', laidHere = (p) => { const q = nearestOnSamples(rd.samples, p[0], p[1]), A = rd.samples[q.i], B = rd.samples[Math.min(q.i + 1, rd.samples.length - 1)]; return laidAt(rd, A.s + (B.s - A.s) * q.t); };
        if (ea && eb && (!rich || (laidHere(a) && laidHere(b)))) { // the good side of town only runs its floor out to a stone street // overlap the yard's own (inset) floor a little, so the two read as one
          const c = pl.poly.reduce((m, q) => [m[0] + q[0] / pl.poly.length, m[1] + q[1] / pl.poly.length], [0, 0]), ab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          let nx = -(b[1] - a[1]) / ab, nz = (b[0] - a[0]) / ab; if ((c[0] - a[0]) * nx + (c[1] - a[1]) * nz < 0) { nx = -nx; nz = -nz; }
          const ai = [a[0] + nx * 0.5 + (b[0] - a[0]) / ab * 0.35, a[1] + nz * 0.5 + (b[1] - a[1]) / ab * 0.35], bi = [b[0] + nx * 0.5 - (b[0] - a[0]) / ab * 0.35, b[1] + nz * 0.5 - (b[1] - a[1]) / ab * 0.35];
          regions.push([ai, bi, eb, ea]);
        }
      }
    }
    (this._ground ||= {})[pl.id] = { g, regions, poly: pl.poly };
    const items = [];
    for (const p of [...(spec.props || []), ...(this.genProps || [])]) if (p.inPlot === pl.id && Array.isArray(p.at) && !p.in) items.push([p.at[0], p.at[1], p.type === 'car_wreck' || p.type === 'truck_chassis' ? 2.2 : 1]);
    for (const x of spec.structures || []) if ((x.inPlot === pl.id || x.id === pl.building) && x.at) items.push([x.at[0], x.at[1], Math.max(...(x.size || [4, 4])) * 0.5]);
    const F = plotFrame(pl), c = pl.poly.reduce((a, q) => [a[0] + q[0] / pl.poly.length, a[1] + q[1] / pl.poly.length], [0, 0]);
    const gate = [F.front[0] + (c[0] - F.front[0]) * 0.06, F.front[1] + (c[1] - F.front[1]) * 0.06];
    const vehicles = ['acopio', 'salvage', 'wayhouse', 'farmstead', 'brickyard', 'market', 'visitors'].includes(pl.use) || ['garage', 'workshop', 'warehouse'].includes(st?.kind);
    for (const p of groundPaints(pl, g, regions, { items, gate, vehicles })) this.terrain.addPaint(p.type === 'path' && p.path ? { ...p, samples: samplePathSimple(p.path) } : p);
    if (g.surface && g.surface !== 'natural') for (const R of regions) this.raster.poly(R);
  }
  plotGroundMesh(pl) {
    const G = this._ground?.[pl.id]; if (!G) return;
    const geo = groundMesh(pl, G.g, G.regions, this.terrain);
    if (!geo) return;
    const m = new THREE.Mesh(withBake(geo), MATS.main); m.name = `ground:${pl.id}`; m.userData.owner = this._owner; m.userData.noShadow = true;
    this.group.add(m);
  }
  // places an area's contents, recording what it added (plot editing turns these into real spec items)
  placeAreaRec(a) {
    const rec = (this._rec = { props: [], walls: [], structures: [] });
    try { placeArea(this, a); } finally { this._rec = null; }
    (this.areaRec ||= {})[a.id] = rec;
  }
  own(id, fn) {
    const a = this._owner; this._owner = id ?? null; this.terrain._owner = id ?? null; if (this.flora) this.flora._src = id ?? undefined;
    try { return fn(); } finally { this._owner = a; this.terrain._owner = a; if (this.flora) this.flora._src = a ?? undefined; }
  }
  seatStructure(s) {
    const T = this.terrain;
    for (const m of s._masses) { this.raster.obb(m, 1.0); this.hard.obb(m, 0.6); }
    let sum = 0, n = 0;
    for (const m of s._masses) for (const [x, z] of [[m.cx, m.cz], ...cornersOf(m)]) { sum += T.raw(x, z); n++; }
    s._y = s.elevation ?? sum / n + (s.raise || 0);
    if (s.level && s.elevation == null) { // a row built as one (locales): every unit on one floor level, so the roofs run on level
      let best = -Infinity;
      for (const q of this.spec?.structures || []) if (q.level === s.level && q.at) { let a = 0, k = 0; const [w2, d2] = [(q.size?.[0] || 6) / 2, (q.size?.[1] || 6) / 2]; for (const [dx, dz] of [[0, 0], [-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]]) { a += T.raw(q.at[0] + dx, q.at[1] + dz); k++; } best = Math.max(best, a / k); }
      if (isFinite(best)) s._y = best + (s.raise || 0);
    }
    for (const m of s._masses) {
      // flat apron around the walls (incl. a porch along the front), then an earth ramp back to grade
      const porchD = s.porch || (s.kind === 'cantina' || s.kind === 'shelter') ? (s.porch?.depth || 2.6) : 0;
      const [fx, fz] = toWorld(0, porchD / 2, m.r);
      T.addPad({ ...m, cx: m.cx + fx, cz: m.cz + fz, w: m.w + 1.2, d: m.d + 1.2 + porchD }, s._y, 3.5);
    }
    const ruin = ['ruin', 'stripped'].includes(s.origin);
    for (const m of s._masses) T.addPaint({ type: 'obb', obb: m, pad: s.yard ?? (ruin ? 1.5 : s._mode === 'attached' ? 0.8 : 2.2), color: ruin ? 0xb5ab9a : PAINT.yard, edge: 1.6, alpha: 0.7 });
    // motor court: a painted asphalt parking apron with bay lines in front of the main block
    if (s.kind === 'posada' && kindLayout(s) === 'motel') {
      const mi = Math.max(0, massesFor(s, null).findIndex((q) => q.main)), m = s._masses[mi];
      if (m) {
        const at = (lx, lz) => { const [ox, oz] = toWorld(lx, lz, m.r); return [m.cx + ox, m.cz + oz]; };
        const [ax, az] = at(0, m.d / 2 + 5.7);
        T.addPad({ cx: ax, cz: az, w: m.w + 3, d: 7, r: m.r }, s._y, 3);
        T.addPaint({ type: 'obb', obb: { cx: ax, cz: az, w: m.w + 1, d: 5, r: m.r }, pad: 1, color: ruin ? 0x7a766e : 0x5e5c58, edge: 0.35, alpha: ruin ? 0.75 : 0.96, layer: 'concrete', layerK: 1 }); // obb paint: full weight only inside the pad
        if (!ruin) for (let x = -m.w / 2 + 1; x <= m.w / 2 + 0.1; x += 3) { const [lx, lz] = at(x, m.d / 2 + 6.3); T.addPaint({ type: 'obb', obb: { cx: lx, cz: lz, w: 0.02, d: 4.4, r: m.r }, pad: 0.1, color: 0xd8d4c8, edge: 0.06, alpha: 0.85, layer: 'concrete', layerK: 1 }); }
      }
    }
  }
  // names / stats edited in the builder: update live objects without rebuilding anything
  patchMeta(rs) {
    const set = (it, e) => { if (!it || !e) return;
      if (it.type === 'structure' && (e.nameV || 0) !== (it.spec.nameV || 0)) { it.spec.nameV = e.nameV; const g = nameFor(it.spec, it.spec._nameCtx); it.spec._name = g.name; it.spec._oldName = it.oldName = g.old; } // reroll
      it.name = e.name || (it.type === 'structure' ? it.spec?._name : null) || it.name; it.autoName = !e.name; if (it.spec && it.spec !== e) { it.spec.name = e.name; it.spec.stats = e.stats; } };
    for (const e of rs.structures || []) if (e.id) { const st = this.structures.find((x) => x.id === e.id); if (st) { st.name = e.name; st.stats = e.stats; } set(this.items.get(e.id), e); }
    for (const e of rs.props || []) if (e.id) set(this.items.get(e.id), e);
    for (const e of rs.roads || []) if (e.id) { const r = this.roads.find((x) => x.id === e.id); if (r) { r.name = e.name; r.stats = e.stats; } }
    for (const e of rs.fields || []) if (e.id) { const f = this.fields.find((x) => x.id === e.id); if (f) { f.name = e.name; f.stats = e.stats; } }
    for (const e of rs.walls || []) if (e.id) { const w = this.walls.find((x) => x.id === e.id); if (w) { w.name = e.name; w.stats = e.stats; } }
  }
  areaPaint(a) {
    // visitors' grounds / market: ground levelled ~90% (a slight fall left), earth ramp at the edge
    if (a._plot || a.flatten) this.terrain.addFlat(a.poly || (() => { const r = deg(a.rot), P = (u, v) => { const [x, z] = toWorld(u, v, r); return [a.at[0] + x, a.at[1] + z]; }; return [P(-a.size[0] / 2, -a.size[1] / 2), P(a.size[0] / 2, -a.size[1] / 2), P(a.size[0] / 2, a.size[1] / 2), P(-a.size[0] / 2, a.size[1] / 2)]; })(), a.flatten ?? 0.9, 4);
    if (a.poly) {
      this.terrain.addPaint({ type: 'poly', poly: a.poly, color: PAINT.packed, edge: 1.5, alpha: 0.8, layer: a.type === 'market' ? 'pavers' : 'urban', layerK: a.type === 'market' ? 0.5 : 0.9 });
      // worn path from the gate (middle of the street edge) into the yard
      const g = [(a.poly[0][0] + a.poly[1][0]) / 2, (a.poly[0][1] + a.poly[1][1]) / 2], c = a.poly.reduce((m, q) => [m[0] + q[0] / a.poly.length, m[1] + q[1] / a.poly.length], [0, 0]);
      const y = [g[0] + (c[0] - g[0]) * 0.75, g[1] + (c[1] - g[1]) * 0.75];
      this.terrain.addPaint({ type: 'path', samples: samplePathSimple([[g[0] + (g[0] - c[0]) * 0.08, g[1] + (g[1] - c[1]) * 0.08], y]), width: 4, color: PAINT.dirt ?? PAINT.packed, edge: 1.4, alpha: 0.55, layer: 'dirt', layerK: 0.7 });
      return;
    }
    this.terrain.addPaint({ type: 'obb', obb: obb(a.at[0], a.at[1], a.size[0], a.size[1], deg(a.rot)), color: PAINT.packed, edge: 1.5, alpha: 0.8, layer: a.type === 'market' ? 'pavers' : 'urban', layerK: a.type === 'market' ? 0.5 : 0.9 }); }
  // unpaved junctions: blend the two surfaces into a rounded patch of the dominant one
  junctionPaint(J) {
    for (const j of J) {
      const sh0 = junctionShape(j); if (sh0) this.raster.poly(sh0.poly); // nothing grows in a junction
      if (j.kind === 'aa') continue; // asphalt × asphalt: fillet pieces (addJunctions)
      // unpaved × unpaved, or the unpaved road meeting an asphalt one (the asphalt runs through on top)
      const top = [...j.roads].filter((r) => !r.paved).sort((a, b) => b.width - a.width)[0];
      const C = { gravel: [0x8e8474, 'gravel'], dirt: [PAINT.dirt, 'dirt'], street: [PAINT.dirt, 'dirt'], track: [PAINT.packed, 'urban'], lane: [PAINT.packed, 'urban'] }[top.type] || [PAINT.dirt, 'dirt'];
      const sh = junctionShape(j);
      if (!sh) { this.terrain.addPaint({ type: 'circle', at: [j.x, j.z], r: j.r * 0.95, color: C[0], edge: 0.8, alpha: 0.9, layer: C[1], layerK: 1 }); continue; }
      // the junction surface covers verges / ruts that ran through it; rounded corners get their own verge.
      // Meeting asphalt: only the rounded corners on the unpaved side (the asphalt runs through on top)
      if (j.kind === 'au') { for (const c of sh.corners) if (!c.A.paved || !c.B.paved) this.terrain.addPaint({ type: 'poly', poly: [c.X, c.TA, ...c.pts.slice(1, -1), c.TB], color: C[0], edge: 0.5, alpha: 0.96, layer: C[1], layerK: 1 }); }
      else this.terrain.addPaint({ type: 'poly', poly: sh.poly, color: C[0], edge: 0.7, alpha: 0.96, layer: C[1], layerK: 1 });
      if (top.type === 'gravel') for (const arc of sh.arcs) {
        const pts = arc.pts.map(([x, z]) => { const dx = x - arc.O[0], dz = z - arc.O[1], l = Math.hypot(dx, dz) || 1; return [arc.O[0] + (dx / l) * (arc.r - 0.75), arc.O[1] + (dz / l) * (arc.r - 0.75)]; });
        this.terrain.addPaint({ type: 'path', samples: samplePathSimple(pts), width: 1.4, color: 0x7f7a50, edge: 0.7, alpha: 0.5, layer: 'scrub', layerK: 0.8 });
      }
    }
  }
  addJunctions() {
    for (const j of this.junctions) {
      if (j.kind !== 'aa') continue;
      const g = buildJunction(j, this.terrain, this.seed);
      if (!g) continue;
      const m = new THREE.Mesh(g, MATS.asphalt); m.name = 'junction'; m.userData.owner = this._owner; this.group.add(m);
    }
  }
  addSpecPaint(p) {
    if (p.kind === 'busier' || p.kind === 'quieter') return; // activity paint: read by activity.js, not ground
    const T = this.terrain, L = p.layer !== undefined ? { layer: p.layer, layerK: p.layerK ?? 1 } : {};
    if (p.poly) T.addPaint({ type: 'poly', poly: p.poly, color: PAINT[p.color] ?? p.color, edge: p.edge ?? 1.5, alpha: p.alpha ?? 0.8, ...L });
    else if (p.path) T.addPaint({ type: 'path', samples: samplePathSimple(p.path), width: p.width || 2, color: PAINT[p.color] ?? p.color, edge: p.edge ?? 1, alpha: p.alpha ?? 0.8, ...L });
    else if (p.at) T.addPaint({ type: 'circle', at: p.at, r: p.r || 3, color: PAINT[p.color] ?? p.color, edge: p.edge ?? 1.5, alpha: p.alpha ?? 0.8, ...L });
  }
  // remove everything an id put into the world (meshes, lights, emitters, blockers, pads, paint)
  removeOwned(id) {
    const gone = [];
    for (const c of [...this.group.children]) if (c.userData.owner === id) { this.group.remove(c); gone.push(c); }
    for (const c of gone) c.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    const inGone = (o) => { while (o) { if (gone.includes(o)) return true; o = o.parent; } return false; };
    this.anim = this.anim.filter((a) => !inGone(a.obj));
    this.lights = this.lights.filter((l) => l._o !== id);
    this.emitters = this.emitters.filter((e) => e._o !== id);
    this.solids = this.solids.filter((e) => e._o !== id);
    if (this.propFoot) this.propFoot = this.propFoot.filter((e) => e.o !== id);
    if (this.fenceLog) this.fenceLog = this.fenceLog.filter((f) => f._o !== id && f.id !== id);
    this.keepOut = this.keepOut.filter((e) => e._o !== id);
    this.structures = this.structures.filter((s) => s.id !== id && s._o !== id);
    if (this.roofs) this.roofs = this.roofs.filter((r) => r._o !== id && r.sid !== id);
    if (this.climbs) this.climbs = this.climbs.filter((r) => r._o !== id && r.sid !== id);
    this.items.delete(id);
    for (const [k, it] of [...this.items]) if (it._o === id) this.items.delete(k);
    this.flora.removeWhere((e) => e[6] === id);
    this.terrain.removeOwned(id);
  }
  // selectable plots, builder roads and hand-drawn walls (outlines for the selection ring)
  zoneMain(pl) { // the plot's main building: a temple if it has one, else the biggest; none when it's many equal units
    const S = (this.spec.structures || []).filter((q) => q.inPlot === pl.id && !['outhouse', 'shed'].includes(q.kind) && (q.size?.[0] || 0) * (q.size?.[1] || 0) > 14);
    if (!S.length) return null;
    const t = S.find((q) => /-(temple|boss|strong|cook)-/.test(q.id)); if (t) return t.id;
    if (pl.use === 'multifamily' && S.length > 1) return null;
    return S.sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0].id;
  }
  registerBuilderItems() {
    const ribbon = (pts, hw) => {
      if (pts.length < 2) return null;
      const L = [], R = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        L.push([pts[i][0] + nx * hw, pts[i][1] + nz * hw]); R.push([pts[i][0] - nx * hw, pts[i][1] - nz * hw]);
      }
      return [...L, ...R.reverse()];
    };
    for (const [id, it] of [...this.items]) if (it.type === 'plot' || it.type === 'paint' || it.type === 'wall' || it.type === 'retain' || it.type === 'plant' || (it.type === 'field' && !it.object) || (it.type === 'road' && this.src.builder)) this.items.delete(id);
    for (const f of this.src.fields || []) if (f.id && f.poly) { const c = f.poly.reduce((a, q) => [a[0] + q[0] / f.poly.length, a[1] + q[1] / f.poly.length], [0, 0]); this.items.set(f.id, { id: f.id, name: f.name || placeName('field', f), autoName: !f.name, type: 'field', spec: f, object: null, outline: f.poly, anchor: () => new THREE.Vector3(c[0], this.terrain.height(c[0], c[1]) + 2, c[1]) }); }
    for (const p of this.src.paint || []) if (p.id && p.poly) { const c = p.poly.reduce((a, q) => [a[0] + q[0] / p.poly.length, a[1] + q[1] / p.poly.length], [0, 0]); this.items.set(p.id, { id: p.id, name: p.name || null, type: 'paint', spec: p, object: null, outline: p.poly, anchor: () => new THREE.Vector3(c[0], this.terrain.height(c[0], c[1]) + 1, c[1]) }); }
    for (const pl of this.plots || []) if (pl.id) { const bn = (pl.building && this.items.get(pl.building)?.name) || this.structures.find((q) => q.plot === pl.id && !q.inPlot)?._name; this.items.set(pl.id, { id: pl.id, name: pl.name || bn || placeName('plot', pl), autoName: !pl.name, type: 'plot', spec: pl, object: null, outline: pl.poly, anchor: () => { const c = pl.poly.reduce((a, q) => [a[0] + q[0] / pl.poly.length, a[1] + q[1] / pl.poly.length], [0, 0]); return new THREE.Vector3(c[0], this.terrain.height(c[0], c[1]) + 1.5, c[1]); } }); }
    for (const r of this.roads) if (this.src.builder && r.id && !r._gate) {
      const pts = r.samples.filter((_, i) => i % 3 === 0).map((q) => [q.x, q.z]);
      this.items.set(r.id, { id: r.id, name: r.name || placeName('road', r), autoName: !r.name, type: 'road', spec: r, object: null, outline: ribbon(pts, r.hw + 0.4), anchor: () => { const p = sampleAt(r.samples, pathLength(r.samples) * 0.5); return new THREE.Vector3(p.x, this.terrain.height(p.x, p.z) + 1, p.z); } });
    }
    for (const rt of this.src.retains || []) if (rt.id && rt.path?.length >= 2) {
      const g = this.group.children.find((c) => c.userData.owner === rt.id && c.name.startsWith('retain:'));
      if (g) g.traverse((o) => { if (o.isMesh) o.userData.selectId = rt.id; });
      this.items.set(rt.id, { id: rt.id, name: rt.name || null, type: 'retain', spec: rt, object: g || null, outline: ribbon(rt.closed ? [...rt.path, rt.path[0]] : rt.path, 0.6), anchor: () => new THREE.Vector3(rt.path[0][0], this.terrain.height(rt.path[0][0], rt.path[0][1]) + 2, rt.path[0][1]) });
    }
    for (const w of this.src.walls || []) if (w.id) {
      const g = this.group.children.find((c) => c.userData.owner === w.id);
      if (g) g.traverse((o) => { if (o.isMesh) o.userData.selectId = w.id; });
      this.items.set(w.id, { id: w.id, name: null, type: 'wall', spec: w, object: g || null, outline: ribbon(w.closed ? [...w.path, w.path[0]] : w.path, 0.5), anchor: () => new THREE.Vector3(w.path[0][0], this.terrain.height(w.path[0][0], w.path[0][1]) + 2, w.path[0][1]) });
    }
  }

  rebuildRaster(box = null) {
    const T = this.terrain;
    if (box) { for (const r of [this.raster, this.hard]) { r.clearBox(box); r.clip = box; } }
    else { this.raster = new Raster(T.W, T.D); this.hard = new Raster(T.W, T.D); }
    try { this._stampRaster(); } finally { this.raster.clip = null; this.hard.clip = null; }
  }
  _stampRaster() {
    this._shadeR = null;
    for (const r of this.roads) { this.raster.path(r.samples, r.hw + (r.shoulder || 0) * 0.5 + (r.frontage || 0) * 0.9 + 1.1); this.walkRaster(r, this.raster); } // (the dirt apron stays clear too)
    for (const c of this.terrain.cliffs || []) { const sp = samplePathSimple(c.closed ? [...c.P, c.P[0]] : c.P); this.raster.path(sp, cliffBand(this.terrain)); this.hard.path(sp, 0.7); }
    for (const s of this.structures) for (const m of s._masses) { this.raster.obb(m, 1.0); this.hard.obb(m, 0.6); }
    for (const s of this.structures) if (s._shade) { this.raster.obb(s._shade, 0.3); this.hard.obb(s._shade, 0.1); }
    for (const z of this.keepOut) if (z.side) this.raster.obb(z, 0);
    for (const f of this.fields) this.raster.poly(f.poly);
    for (const G of Object.values(this._ground || {})) if (G.g.surface && G.g.surface !== 'natural') for (const R of G.regions) this.raster.poly(R);
    for (const j of this.junctions || []) { const sh = junctionShape(j); if (sh) this.raster.poly(sh.poly); }
    for (const c of this.spec.clearings || []) this.raster.circle(c.at[0], c.at[1], c.r);
    for (const f of [...this.walls, ...(this.plotWalls || [])]) { if (f.type === 'powerline') { this.polePads(f); continue; } const sp = samplePathSimple(f.closed ? [...f.path, f.path[0]] : f.path); this.raster.path(sp, 0.8); this.hard.path(sp, 0.6); }
    for (const p of [...(this.spec.props || []), ...this.genProps]) { const at = this.propAt(p); if (at && !p.in) { this.raster.circle(at[0], at[1], p.clear ?? 1.2); this.hard.circle(at[0], at[1], 0.6); } }
  }

  // Apply a new version of the place spec in place, touching only what changed. Returns { box } (the
  // world-space region to re-light, or null if nothing visible changed), or null when the change is
  // too broad for an in-place update (the caller then rebuilds everything).
  applyDiff(next) {
    const t00 = performance.now();
    const prev = this.src, J = (v) => JSON.stringify(v ?? null);
    const SOFT = new Set(['props', 'structures', 'paint', 'vegetation', 'terrain', 'roads', 'walls', 'plots', 'fields', 'retains', 'view', 'description', 'name', 'context', 'region']);
    for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (!SOFT.has(k) && J(prev[k]) !== J(next[k])) return null;
    const tp = { ...(prev.terrain || {}), delta: 0 }, tn = { ...(next.terrain || {}), delta: 0 };
    if (J(tp) !== J(tn)) return null;
    const vp = { ...(prev.vegetation || {}), plants: 0, erase: 0 }, vn = { ...(next.vegetation || {}), plants: 0, erase: 0 };
    if (J(vp) !== J(vn)) return null;
    const rs = resolveFrames(next), rp = this.spec;
    const T = this.terrain;
    const byId = (arr) => new Map((arr || []).filter((e) => e.id).map((e) => [e.id, e]));
    // names and stats don't change geometry: compare without them (patched onto live objects below)
    const META = new Set(['name', 'stats', 'label', 'notes', 'nameV']);
    const K = (e) => (e ? JSON.stringify(e, (k, v) => (META.has(k) || (k && k[0] === '_') ? undefined : v)) : 'null'); // _keys: runtime write-backs (owner, seat…), not edits
    const changed = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((id) => K(a.get(id)) !== K(b.get(id)));
    // id-less entries can't be tracked one by one
    for (const k of ['props', 'structures', 'roads', 'walls', 'plots', 'fields', 'retains']) if (J((prev[k] || []).filter((e) => !e.id)) !== J((next[k] || []).filter((e) => !e.id))) return null;
    const auto = (next.auto || []).length > 0;
    const sp0 = byId(rp.structures), sp1 = byId(rs.structures), sChanged = changed(sp0, sp1);
    const rr0 = byId(rp.roads), rr1 = byId(rs.roads), rChanged = changed(rr0, rr1);
    const ww0 = byId(rp.walls), ww1 = byId(rs.walls), wChanged = changed(ww0, ww1);
    const pl0 = byId(rp.plots), pl1 = byId(rs.plots), plChanged = changed(pl0, pl1);
    const pp0 = byId(rp.props), pp1 = byId(rs.props), pChanged = changed(pp0, pp1);
    if (window.__diffWhy) for (const [nm, A, B, ch] of [['plot', pl0, pl1, plChanged], ['wall', ww0, ww1, wChanged], ['struct', sp0, sp1, sChanged]]) for (const id of ch.slice(0, 6)) { const a = A.get(id), b = B.get(id); const ks = a && b ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !META.has(k) && k[0] !== '_' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) : ['added/removed']; console.debug('[diff] why', nm, id, ks.map((k) => k + '=' + JSON.stringify(a?.[k])?.slice(0, 70) + ' -> ' + JSON.stringify(b?.[k])?.slice(0, 70)).join(' | ')); }
    // fields and plot-derived fields / areas (field, orchard, corral, visitors' grounds, market)
    const D0 = plotDerived(rp), D1 = plotDerived(rs);
    const tq = [['resolve+compare0', performance.now()]], mk = (n) => tq.push([n, performance.now()]);
    const ff0 = byId([...(rp.fields || []), ...D0.fields]), ff1 = byId([...(rs.fields || []), ...D1.fields]), fChanged = changed(ff0, ff1);
    if (window.__diffWhy) for (const id of fChanged.slice(0, 6)) { const a = ff0.get(id), b = ff1.get(id); const ks = a && b ? [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !META.has(k) && k[0] !== '_' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) : ['added/removed']; console.debug('[diff] why field', id, ks.map((k) => k + '=' + JSON.stringify(a?.[k])?.slice(0, 90) + ' -> ' + JSON.stringify(b?.[k])?.slice(0, 90)).join(' | ')); }
    const aa0 = byId(D0.areas), aa1 = byId(D1.areas), aChanged = changed(aa0, aa1);
    if (WATER) { // irrigation: a new source, ditch or field can wet / dry others — those are redone too
      const irr1 = irrigationNet(rs.walls || [], [...(rs.fields || []), ...D1.fields], rs.props), old = this.irr?.sig || new Map();
      for (const [id, v] of irr1.sig) if (old.get(id) !== v) { if (ww1.has(id) && !wChanged.includes(id)) wChanged.push(id); else if (ff1.has(id) && !fChanged.includes(id)) fChanged.push(id); }
      this.irr = irr1;
    }
    // auto-planned towns and buildings with grounds re-plan around any change: rebuild everything
    if (auto && (sChanged.length || rChanged.length || plChanged.length)) return null;
    const rt0 = byId(rp.retains), rt1 = byId(rs.retains), rtChanged = changed(rt0, rt1);
    if (sChanged.some((id) => sp0.get(id)?.surround || sp1.get(id)?.surround)) return null;
    if (rChanged.length && next.grid) return null;

    const boxes = [];
    const addBox = (b, pad = 0) => { if (b && isFinite(b[0])) { boxes.push([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]); if (window.__diffWhy) console.debug('[diff] box', new Error().stack.split('\n')[2].trim().slice(0, 80), b.map(Math.round)); } };
    const objBox = (o) => { if (!o) return null; const bb = new THREE.Box3().setFromObject(o); return isFinite(bb.min.x) ? [bb.min.x, bb.min.z, bb.max.x, bb.max.z] : null; };
    const ptsBox = (pts) => [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
    const massBox = (st) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const m of st._masses) { const r = Math.hypot(m.w, m.d) / 2; x0 = Math.min(x0, m.cx - r); z0 = Math.min(z0, m.cz - r); x1 = Math.max(x1, m.cx + r); z1 = Math.max(z1, m.cz + r); } return [x0, z0, x1, z1]; };
    let geo = false; // terrain heights change (pads, road beds, sculpt)

    mk('compare');
    // ---- 1. take out what changed
    for (const id of sChanged) { const st = this.structures.find((x) => x.id === id); if (st) { addBox(massBox(st), 6); geo = true; } this.removeOwned(id); }
    for (const id of rChanged) { const r = this.roads.find((x) => x.id === id); if (r) { addBox(r._bb, r.hw + 6); geo = true; } this.removeOwned(id); this.roads = this.roads.filter((x) => x.id !== id); }
    for (const id of wChanged) { const w = ww0.get(id); if (w) addBox(ptsBox(w.path), w.type === 'stream' ? 9 : 2); this.removeOwned(id); this.walls = this.walls.filter((x) => x.id !== id); }
    for (const id of plChanged) { const pl = pl0.get(id); if (pl) addBox(ptsBox(pl.poly), 2); const pl2 = pl1.get(id); if (pl2) addBox(ptsBox(pl2.poly), 2); }
    const groundRedo = new Set(plChanged);
    for (const id of sChanged) for (const e of [sp0.get(id), sp1.get(id)]) if (e?.plot) groundRedo.add(e.plot);
    for (const pl of rs.plots || []) if (pl.id && sChanged.includes(pl.building)) groundRedo.add(pl.id);
    for (const id of groundRedo) { this.removeOwned(`ground:${id}`); const pl = pl1.get(id); if (pl) addBox(ptsBox(pl.poly), 2); else if (this._ground) delete this._ground[id]; }
    for (const id of fChanged) { for (const f of [ff0.get(id), ff1.get(id)]) if (f) addBox(ptsBox(f.poly), 3); this.removeOwned(id); this.fields = this.fields.filter((f) => f.id !== id); }
    for (const id of aChanged) { for (const a of [aa0.get(id), aa1.get(id)]) if (a) { const r = Math.hypot(a.size[0], a.size[1]) / 2 + 6; addBox([a.at[0] - r, a.at[1] - r, a.at[0] + r, a.at[1] + r]); geo = true; } this.removeOwned(id); this.areas = this.areas.filter((a) => a.id !== id); this.structures = this.structures.filter((st) => st._area !== id); }
    for (const id of rtChanged) { for (const rt of [rt0.get(id), rt1.get(id)]) if (rt?.path?.length) addBox(ptsBox(rt.path), (rt.depth || 10) + 8); geo = true; this.removeOwned(id); }
    for (const id of pChanged) {
      const g = this.group.children.find((c) => c.userData.owner === id), p0 = pp0.get(id), at = p0 && this.propAt(p0);
      if (at) { let r = 3; if (g) { const b = objBox(g); r = Math.max(3, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 1); } addBox([at[0] - r, at[1] - r, at[0] + r, at[1] + r]); }
      this.removeOwned(id);
    }
    // terrain sculpt
    if (J(prev.terrain?.delta) !== J(next.terrain?.delta)) {
      const old = prev.terrain?.delta ? decodeDelta(prev.terrain.delta) : null, nd = next.terrain?.delta ? (next.terrain.delta.data ? next.terrain.delta : decodeDelta(next.terrain.delta)) : null;
      const D = nd || old;
      let i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1;
      for (let k = 0; k < D.data.length; k++) {
        const a = old ? old.data[k] : 0, b = nd ? nd.data[k] : 0;
        if (Math.abs(a - b) > 1e-3) { const i = k % D.nx, j = (k / D.nx) | 0; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
      }
      T.delta = nd;
      if (i1 >= 0) { addBox([-T.W / 2 + i0 * D.res, -T.D / 2 + j0 * D.res, -T.W / 2 + i1 * D.res, -T.D / 2 + j1 * D.res], 4); geo = true; }
    }
    const sculpted = geo && J(prev.terrain?.delta) !== J(next.terrain?.delta);
    // paint (re-add all spec paints in order; repaint where they changed)
    const P0 = prev.paint || [], P1 = next.paint || [];
    const paintBox = (p) => { if (p.path) { const m = (p.width || 2) / 2 + (p.edge ?? 1) * 2, b = ptsBox(p.path); return [b[0] - m, b[1] - m, b[2] + m, b[3] + m]; } if (p.poly) { const b = ptsBox(p.poly); return [b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3]; } if (p.at) { const m = (p.r || 3) + 3; return [p.at[0] - m, p.at[1] - m, p.at[0] + m, p.at[1] + m]; } return null; };
    for (let i = 0; i < Math.max(P0.length, P1.length); i++) if (J(P0[i]) !== J(P1[i])) { if (P0[i]) addBox(paintBox(P0[i])); if (P1[i]) addBox(paintBox(P1[i])); }
    T.paints = T.paints.filter((p) => p.o !== '@paint' && !p._live);
    this.own('@paint', () => { for (const p of P1) this.addSpecPaint(p); });
    // vegetation edits
    const V0 = prev.vegetation || {}, V1 = next.vegetation || {};
    const s0 = new Set((V0.plants || []).map(J)), s1 = new Set((V1.plants || []).map(J));
    for (const q of V0.plants || []) if (!s1.has(J(q))) addBox([q.at[0] - 4, q.at[1] - 4, q.at[0] + 4, q.at[1] + 4]);
    for (const q of V1.plants || []) if (!s0.has(J(q))) addBox([q.at[0] - 4, q.at[1] - 4, q.at[0] + 4, q.at[1] + 4]);
    const e0 = new Set((V0.erase || []).map(J)), e1 = new Set((V1.erase || []).map(J));
    for (const q of [...(V0.erase || []).filter((e) => !e1.has(J(e))), ...(V1.erase || []).filter((e) => !e0.has(J(e)))]) addBox([q.at[0] - q.r - 3, q.at[1] - q.r - 3, q.at[0] + q.r + 3, q.at[1] + q.r + 3]);

    mk('remove');
    this.src = next; this.spec = rs;
    this.plots = rs.plots || [];
    for (const id of fChanged) { const f = ff1.get(id); if (!f) continue; f._irr = this.irr?.irr.get(f.id); this.fields.push(f); this.own(id, () => prepareField(f, T)); }
    if (WATER) for (const id of wChanged) { const w = ww1.get(id); if (w?.type === 'stream') this.own(id, () => waterPaint(T, w)); }
    if (WATER) for (const id of pChanged) { const p = pp1.get(id); if (p?.type === 'spring') { this.own(id, () => waterPaint(T, p)); const R = 14; addBox([p.at[0] - R, p.at[1] - R, p.at[0] + R, p.at[1] + R]); } }
    for (const id of aChanged) { const a0 = aa1.get(id); if (!a0) continue; const a = this.resolveArea(a0); this.areas.push(a); this.own(id, () => this.areaPaint(a)); }
    // ---- 2. put back the new versions (things that shape the ground first)
    T._pinDirty = null;
    const newRoads = [];
    for (const id of rChanged) {
      const e = rr1.get(id); if (!e) continue;
      const r = this.own(id, () => prepareRoad(eraShape({ ...e }, this.seed), T));
      r.cls = classOf(r);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const sm of r.samples) { x0 = Math.min(x0, sm.x); z0 = Math.min(z0, sm.z); x1 = Math.max(x1, sm.x); z1 = Math.max(z1, sm.z); }
      r._bb = [x0, z0, x1, z1];
      this.roads.push(r); newRoads.push(r);
      addBox(r._bb, r.hw + 6); geo = true;
    }
    // lower roads that ramp up to meet a new raised one: their stretch is redone too
    for (const d of T._pinDirty || []) { addBox(d.box, 1); const r = this.roads.find((q) => q.id === d.o); if (r) r._rebuild = true; }
    T._pinDirty = null;
    const rtNew = [];
    this.retainCliffs = (this.retainCliffs || []).filter((c) => !rtChanged.includes(c.owner));
    for (const id of rtChanged) { const rt = rt1.get(id); if (!rt || !(rt.path?.length >= 2)) continue; const c = this.own(id, () => retainZone(rt, T, this.roads)); this.retainCliffs.push(c); rtNew.push(c); }
    for (const r of newRoads) r.cliffs = roadCliffs(r, T);
    if (rtChanged.length || rChanged.length || sculpted) this.updateCliffs(); // (a deleted road's cut mask must go too)
    for (const id of sChanged) {
      const e = sp1.get(id); if (!e) continue;
      const st = this.resolveStructure(e);
      this.own(id, () => this.seatStructure(st));
      this.structures.push(st);
      this.own(id, () => this.addStructure(st));
      addBox(massBox(st), 6); geo = true;
    }
    for (const id of pChanged) { const p1 = pp1.get(id), at = p1 && this.propAt(p1); if (at) addBox([at[0] - 3, at[1] - 3, at[0] + 3, at[1] + 3]); const p0 = pp0.get(id); if (p0?.type === 'spring' && p0.at) addBox([p0.at[0] - 14, p0.at[1] - 14, p0.at[0] + 14, p0.at[1] + 14]); }
    for (const id of wChanged) { const w = ww1.get(id); if (w) addBox(ptsBox(w.path), w.type === 'stream' ? 9 : 2); }
    if (rChanged.length) {
      const oldJ = this.junctions || [];
      this.junctions = findJunctions(this.roads);
      const sig = (J) => J.map((j) => `${j.ids}@${Math.round(j.x)},${Math.round(j.z)}`).sort().join('|');
      const touched = new Set(rChanged);
      for (const j of [...oldJ, ...this.junctions]) { addBox([j.x - j.r - 3, j.z - j.r - 3, j.x + j.r + 3, j.z + j.r + 3]); for (const id of j.ids) touched.add(id); }
      for (const r of this.roads) { const nj = this.junctions.filter((j) => j.roads.includes(r)); if (sig(nj) !== sig(r._junc || []) || rChanged.includes(r.id)) { r._junc = nj; r._rebuild = true; } }
      this.removeOwned('@juncpaint'); this.own('@juncpaint', () => this.junctionPaint(this.junctions));
      this.removeOwned('@junc');
      geo = true;
    }
    mk('structures');
    this.patchMeta(rs);
    if (!boxes.length) { this.registerBuilderItems(); return { box: null }; }
    const U = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    const inU = (x, z, m = 0) => x >= U[0] - m && x <= U[2] + m && z >= U[1] - m && z <= U[3] + m;
    const terr = this.group.getObjectByName('terrain');
    // ---- 3. ground heights, then everything that sits on the ground in the region
    if (geo) {
      if (sculpted) T.rebed(...U);
      T.liveUpdate(U[0], U[1], U[2], U[3], terr);
      if (sculpted) for (const st of [...this.structures]) {
        if (!st.id || sChanged.includes(st.id) || !st._masses.some((m) => inU(m.cx, m.cz, Math.hypot(m.w, m.d) / 2))) continue;
        const e = sp1.get(st.id); if (!e || e.surround || auto) continue;
        this.removeOwned(st.id);
        const s2 = this.resolveStructure(e);
        this.own(st.id, () => this.seatStructure(s2)); this.structures.push(s2); this.own(st.id, () => this.addStructure(s2));
      }
      if (sculpted) T.liveUpdate(U[0], U[1], U[2], U[3], terr);
      // road meshes: new ones, and any draped over changed ground
      for (const r of this.roads) {
        const b = r._bb, isNew = newRoads.includes(r) || r._rebuild;
        r._rebuild = false;
        if (!isNew && (!sculpted || b[2] < U[0] || b[0] > U[2] || b[3] < U[1] || b[1] > U[3])) continue;
        this.roadMeshes(r);
      }
    }
    mk('terrain');
    if (rChanged.length) this.own('@junc', () => this.addJunctions());
    for (const c of rtNew) this.own(c.owner, () => this.addCliff(c));
    // fields and areas on the (now final) ground
    for (const id of fChanged) { const f = this.fields.find((x) => x.id === id); if (f) this.own(id, () => buildField(f, this)); }
    for (const id of groundRedo) { const pl = pl1.get(id); if (pl) { this.own(`ground:${id}`, () => this.plotGroundPaint(pl, rs)); this.own(`ground:${id}`, () => this.plotGroundMesh(pl)); } }
    for (const id of aChanged) { const a = this.areas.find((x) => x.id === id); if (a) this.own(id, () => this.placeAreaRec(a)); }
    // walls drawn by hand
    for (const id of wChanged) { const w = ww1.get(id); if (!w) continue; this.walls.push(w); this.own(id, () => this.addFence(w)); }
    mk('fields+ground');
    // plot fences: recompute all, rebuild only the ones that differ (or sit on changed ground)
    const nw = plotFences(this.plots, this.structures, this.seed, this.solids); mk('plotFences calc');
    const ow = new Map((this.plotWalls || []).map((w) => [w.id, w])), nm = new Map(nw.map((w) => [w.id, w]));
    let nRe = 0;
    for (const id of new Set([...ow.keys(), ...nm.keys()])) {
      const a = ow.get(id), b = nm.get(id);
      const onGround = geo && b && b.path.some((q) => inU(q[0], q[1]));
      if (K(a) === K(b) && !onGround) continue; // (K: _keys are runtime write-backs, e.g. the fence's own _o)
      if (window.__diffWhy && nRe < 3 && a && b) console.debug('[diff] fence why', id, Object.keys({ ...a, ...b }).filter((k) => J(a[k]) !== J(b[k])).map((k) => k + '=' + J(a[k]).slice(0, 80) + ' -> ' + J(b[k]).slice(0, 80)).join(' | '), onGround);
      this.removeOwned(id); nRe++;
      if (b) this.own(id, () => this.addFence(b));
    }
    if (window.__diffWhy) console.debug('[diff] plot fences rebuilt', nRe, 'of', nm.size);
    this.plotWalls = nw; mk('plotFences');
    // props: changed ones, plus any sitting on changed ground
    const reseat = new Set(pChanged.filter((id) => pp1.has(id)));
    if (geo) { const gOf = new Map(); for (const c of this.group.children) if (c.userData.gy != null && typeof c.userData.owner === 'string') gOf.set(c.userData.owner, c);
      for (const [id, p] of pp1) { const at = this.propAt(p); if (!at || !inU(at[0], at[1])) continue; const g0 = gOf.get(id); if (g0 && !p.in && Math.abs(g0.position.x - at[0]) < 0.01 && Math.abs(g0.position.z - at[1]) < 0.01 && Math.abs(T.height(at[0], at[1]) - g0.userData.gy) < 0.01) continue; reseat.add(id); } }
    mk(`props scan ${pp1.size} reseat ${reseat.size}`);
    for (const id of reseat) { if (!pChanged.includes(id)) this.removeOwned(id); const p = pp1.get(id); if (p && !(p.inPlot && p.bake && !p.touched && !p.in && Array.isArray(p.at) && this.roadNear(p.at[0], p.at[1], 0.35))) this.own(id, () => this.addProp(p)); }
    for (const id of pChanged) { const g = this.group.children.find((c) => c.userData.owner === id); if (g) { const b = objBox(g); if (b) { U[0] = Math.min(U[0], b[0] - 2); U[1] = Math.min(U[1], b[1] - 2); U[2] = Math.max(U[2], b[2] + 2); U[3] = Math.max(U[3], b[3] + 2); } } }
    // ---- 4. blockers, ground map, vegetation
    const tR0 = performance.now(); mk('props');
    if (window.__diffWhy) console.debug('[diff] pre: ' + tq.map(([n, t], i) => i ? `${n} ${Math.round(t - tq[i - 1][1])}` : `${n} ${Math.round(t - t00)}`).join(' · '));
    this.rebuildRaster([U[0] - 3, U[1] - 3, U[2] + 3, U[3] + 3]);
    const tA = performance.now();
    T.repaintGround(U[0] - 2, U[1] - 2, U[2] + 2, U[3] + 2);
    const tB = performance.now();
    try { this.activity = computeActivity(this, [U[0] - 3, U[1] - 3, U[2] + 3, U[3] + 3], this.activity); } catch (e) { console.warn('[activity]', e); }
    const tC = performance.now();
    try { placeGaps(this, [U[0] - 3, U[1] - 3, U[2] + 3, U[3] + 3]); } catch (e) { console.warn('[gaps]', e); }
    try { placeLife(this, this.activity, [U[0] - 3, U[1] - 3, U[2] + 3, U[3] + 3]); } catch (e) { console.warn('[life]', e); }
    const tD = performance.now();
    try { placeVerges(this, [U[0] - 3, U[1] - 3, U[2] + 3, U[3] + 3]); } catch (e) { console.warn('[verge]', e); }
    console.debug(`[diff] pre ${Math.round(tR0 - t00)} raster ${Math.round(tA - tR0)} ground ${Math.round(tB - tA)} activity ${Math.round(tC - tB)} life ${Math.round(tD - tC)} verge ${Math.round(performance.now() - tD)} box ${U.map(Math.round)}`);
    const tR2 = performance.now();
    const fl = this.flora;
    fl.removeWhere((e) => inU(e[0], e[2]) && (e[6] === 'scatter' || e[6] === 'plant' || e[6] === 'water'));
    scatter(fl, this, this.spec, U);
    if (WATER) waterFlora(this, U);
    const solidAt = (x, z) => this.solids.some((b) => Math.abs((x - b.cx) * Math.cos(b.r) - (z - b.cz) * Math.sin(b.r)) < b.w / 2 && Math.abs((x - b.cx) * Math.sin(b.r) + (z - b.cz) * Math.cos(b.r)) < b.d / 2);
    fl.removeWhere((e) => inU(e[0], e[2]) && e[6] !== 'scatter' && e[6] !== 'plant' && e[6] !== 'water' && ((this.vegErased && this.vegErased(e[0], e[2])) || solidAt(e[0], e[2])));
    if (geo) fl.forEach((e) => { if (inU(e[0], e[2])) { e[1] = T.height(e[0], e[2]) - 0.05; return true; } });
    const tR3 = performance.now();
    const og = this.group.getObjectByName('flora');
    const ng = fl.build(og); // unchanged species keep their meshes
    if (og) this.group.remove(og);
    this.group.add(ng);
    try { this.placeGrates(U); } catch (e) { console.warn('[grates]', e); }
    this.groundFx(U);
    this.registerBuilderItems();
    console.debug(`[diff] total ${Math.round(performance.now() - t00)} · raster+ground ${Math.round(tR2 - tR0)} veg ${Math.round(tR3 - tR2)} flora ${Math.round(performance.now() - tR3)}`);
    return { box: U };
  }

  addLight(l, toWorldFn) {
    const p = toWorldFn ? toWorldFn(l) : [l.x, l.y, l.z];
    this.lights.push({ x: p[0], y: p[1], z: p[2], color: l.color, radius: l.radius, intensity: l.intensity, kind: l.kind, r: l.r, flicker: !!l.flicker, halo: l.halo !== false, dir: l.wdir || null, search: l.search || null, _o: this._owner });
  }

  addStructure(s) {
    if (this._rec) { const r = this._rec; this._rec = null; try { return this.addStructure(s); } finally { this._rec = r; } } // only top-level adds are recorded
    { // its generated name (spec.name, typed by hand, wins): the plot's family surname, the town's wealth
      const pl = (this.plots || []).find((q) => q.id === s.plot || q.building === s.id || q.id === s.inPlot);
      const W0 = { dead_broke: 0, poor: 0, struggling: 0, average: 1, modest: 1, comfortable: 2, prosperous: 2, wealthy: 3, rich: 3 }[this.settlement?.wealth] ?? 1;
      const tn = this.spec?.name, ctx = (s._nameCtx = { town: tn && !/^new (map|place)$/i.test(tn) ? tn : null, surname: surnameFor(pl?.id || s.id), wealth: W0 + (pl?.household === 'wealthy' ? 1 : 0), farm: ['farmstead', 'outskirts', 'farmer', 'rancher'].includes(pl?.use || pl?.household), outskirts: pl?.use === 'outskirts' || pl?.use === 'outgrounds', prewarUse: s.origin === 'rebuilt' || s.origin === 'built_on_ruin' });
      const g = nameFor(s, ctx); s._name = g.name; s._oldName = g.old;
      // a zone's main building carries the zone's name (the temple of the cult, the boss's house in the slaver camp…)
      if (pl && s.inPlot === pl.id && pl.use && pl.use !== 'building' && this.zoneMain(pl) === s.id) { const z = placeName('plot', pl); if (z) s._name = z; }
    }
    const { geoms, info } = buildStructure(s, this.seed, { settlement: this.settlement, free: this.sideFree(s), porchRoom: this.porchRoom(s) });
    const g = new THREE.Group();
    g.position.set(s.at[0], s._y + (info.lift ?? (+s.lift || 0)), s.at[1]);
    g.rotation.y = deg(s.rot);
    for (const m of meshes(geoms)) g.add(m);
    attachSigns(g, info);
    for (const rt of info.rotors || []) { // live parts: wind-charger rotors
      const pv = new THREE.Group(); pv.position.set(...rt.at); pv.rotation.y = rt.yaw; g.add(pv);
      for (const m of meshes(rt.geoms)) { m.userData.isPart = true; pv.add(m); if (rt.speed) this.anim.push({ obj: m, axis: 'z', speed: rt.speed }); }
    }
    g.updateMatrixWorld(true);
    g.traverse((o) => { if (o.isMesh) o.userData.selectId = s.id; });
    g.name = `structure:${s.id}`;
    g.userData.owner = this._owner;
    this.group.add(g);
    const v = new THREE.Vector3();
    for (const l of info.lights) {
      if (l.dir) { const d = new THREE.Vector3(l.dir[0], 0, l.dir[1]).transformDirection(g.matrixWorld); l.wdir = [d.x, d.z]; }
      this.addLight(l, (q) => { v.set(q.x, q.y, q.z).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; });
    }
    for (const e of info.emitters) { v.set(...e.p).applyMatrix4(g.matrixWorld); this.emitters.push({ type: e.type, x: v.x, y: v.y, z: v.z, r: e.inhabited ? this.lrng.next() : 9, _o: this._owner }); }
    s._finish = info.finish;
    for (const p of info.props || []) { // dressing that is a real prop (pumps, ovens, sacks, flags...)
      v.set(p.x, 0, p.z).applyMatrix4(g.matrixWorld);
      const { x, z, ...rest } = p;
      this.addProp({ ...rest, at: [v.x, v.z], rot: (s.rot || 0) + (p.rot || 0), keep: true, ground: true }, true);
    }
    for (const f of info.fences || []) { // a compound fence the structure brings (utilities): structure-local path → world
      const path = f.path.map(([x, z]) => { v.set(x, 0, z).applyMatrix4(g.matrixWorld); return [v.x, v.z]; });
      this.addFence({ ...f, path });
    }
    s._shade = null;
    if (info.patio) { // courtyard house: the walled patio is part of the house, nothing generated goes in it
      const pz = info.patio, [ox, oz] = toWorld(pz.x, pz.z, deg(s.rot || 0)), z = { cx: s.at[0] + ox, cz: s.at[1] + oz, w: pz.w, d: pz.d, r: deg(s.rot || 0), _o: this._owner };
      this.raster.obb(z, 0.2); this.hard.obb(z, 0.1); this.solids.push(z);
    }
    if (info.shade) { // side shade: keep plants and props out from under it
      const sh = info.shade, [ox, oz] = toWorld(sh.x, sh.z, deg(s.rot || 0)), z = { cx: s.at[0] + ox, cz: s.at[1] + oz, w: sh.w, d: sh.d, r: deg(s.rot || 0) + sh.ry, _o: this._owner };
      this.raster.obb(z, 0.3); this.hard.obb(z, 0.1); this.solids.push(z); s._shade = z;
    }
    for (const r of info.roofs || []) { // flat roofs: hand-placed props and plants over them sit on the roof
      v.set(r.x, r.y, r.z).applyMatrix4(g.matrixWorld);
      (this.roofs ||= []).push({ cx: v.x, cz: v.z, y: v.y, hw: r.w / 2, hd: r.d / 2, r: deg(s.rot) + r.rot, _o: this._owner, sid: s.id });
    }
    for (const cl of info.climbs || []) { // ways up for the walker: ground entry → spot on the roof (world)
      const fd = info.frontDoor, e = cl.e || (fd ? [fd.x + fd.nx * 1.1, fd.z + fd.nz * 1.1] : null); if (!e) continue;
      v.set(e[0], 0, e[1]).applyMatrix4(g.matrixWorld); const ex = v.x, ez = v.z;
      v.set(cl.t[0], cl.t[1], cl.t[2]).applyMatrix4(g.matrixWorld);
      (this.climbs ||= []).push({ kind: cl.kind, ex, ez, tx: v.x, ty: v.y, tz: v.z, sid: s.id, _o: this._owner });
    }
    if (this._owner && this._owner !== s.id) s._o = this._owner;
    // solids and doorway keep-outs
    const porchD = s.porch ? (s.porch.depth || 2.4) + 0.4 : 0;
    s._masses.forEach((m, i) => {
      const [fx, fz] = toWorld(0, i === 0 ? porchD / 2 : 0, m.r);
      this.solids.push({ cx: m.cx + fx, cz: m.cz + fz, w: m.w + 0.3, d: m.d + 0.3 + (i === 0 ? porchD : 0), r: m.r, _o: this._owner });
    });
    const sideDoors = (info.openings || []).filter((o) => (o.type === 'door' || o.type === 'bigdoor') && o.floor === 0 && (o.y0 ?? 0) < 0.6 && o.side !== 'front' && !(info.backDoor && Math.hypot(o.x - info.backDoor.x, o.z - info.backDoor.z) < 0.3));
    for (const [door, out] of [[info.frontDoor, 3.2 + porchD], [info.backDoor, 2.6], ...sideDoors.map((o) => [o, 2.2])]) {
      if (!door || ['ruin', 'stripped'].includes(s.origin)) continue;
      v.set(door.x, 0, door.z).applyMatrix4(g.matrixWorld);
      const n = new THREE.Vector3(door.nx, 0, door.nz).transformDirection(g.matrixWorld);
      const z = { cx: v.x + n.x * out / 2, cz: v.z + n.z * out / 2, w: door.w + 1.4, d: out, r: Math.atan2(n.x, n.z), side: true, _o: this._owner };
      this.keepOut.push(z);
      this.raster.obb(z, 0);
    }
    this.register({
      id: s.id, name: s.name || s._name, autoName: !s.name, oldName: s._oldName, type: 'structure', spec: s, object: g, info,
      outline: s._masses.map((m) => cornersOf(m)), y: s._y,
      anchor: () => new THREE.Vector3(s.at[0], s._y + (info.lift ?? (+s.lift || 0)) + info.height + 0.5, s.at[1]),
    });
  }

  // structure-local (x, z) -> is the ground there free for a side shade? (not road, field, prop, plant,
  // another building / wall, and inside the structure's own plot when it has one)
  // room in front of a plot building's main block before the plot line (a porch must not reach into the street)
  porchRoom(s) {
    if (!s.at || !s._masses?.length) return null;
    const plot = (this.spec.plots || []).find((pl) => pl.poly && (pl.id === s.plot || pl.building === s.id)) || (this.spec.plots || []).find((pl) => pl.poly && pointInPoly(s.at[0], s.at[1], pl.poly));
    if (!plot) return null;
    const mi = Math.max(0, massesFor(s, null).findIndex((m) => m.main)), m = s._masses[mi] || s._masses[0];
    const [dx, dz] = toWorld(0, 1, m.r), fx = m.cx + dx * m.d / 2, fz = m.cz + dz * m.d / 2, P = plot.poly;
    let t = Infinity;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const tt = ((a[0] - fx) * ez - (a[1] - fz) * ex) / den, u = ((a[0] - fx) * dz - (a[1] - fz) * dx) / den; if (tt > -0.01 && u >= 0 && u <= 1) t = Math.min(t, tt); }
    return isFinite(t) ? t : null;
  }
  sideFree(s) {
    if (!this.hard || !s.at) return null;
    if (!this._shadeR) {
      const R = (this._shadeR = new Raster(this.terrain.W, this.terrain.D));
      for (const r of this.roads || []) if (r.samples) { R.path(r.samples, r.hw + (r.shoulder || 0) * 0.5 + 0.4); this.walkRaster(r, R); }
      for (const j of this.junctions || []) { const sh = junctionShape(j); if (sh) R.poly(sh.poly); }
      for (const f of this.fields || []) if (f.poly) R.poly(f.poly);
      for (const p of [...(this.spec.props || []), ...(this.genProps || [])]) { const at = this.propAt(p); if (at && !p.in) R.circle(at[0], at[1], 0.5); }
      for (const p of this.spec.vegetation?.plants || []) R.circle(p.at[0], p.at[1], 0.7);
    }
    const R = this._shadeR, H = this.hard, rot = deg(s.rot || 0);
    const plot = (this.spec.plots || []).find((pl) => pl.poly && pointInPoly(s.at[0], s.at[1], pl.poly));
    return (x, z) => {
      const [ox, oz] = toWorld(x, z, rot), wx = s.at[0] + ox, wz = s.at[1] + oz;
      if (Math.abs(wx) > this.terrain.W / 2 - 1 || Math.abs(wz) > this.terrain.D / 2 - 1) return false;
      if (plot && !pointInPoly(wx, wz, plot.poly)) return false;
      return !R.test(wx, wz) && !H.test(wx, wz);
    };
  }

  // a tree standing in a sidewalk (laid-stone walks, pre-war sidewalks) gets a cast-iron tree grate round its trunk
  onWalk(x, z) {
    for (const rd of this.roads || []) {
      if (!(LAID(rd) || rd.sidewalk) || !rd.samples) continue;
      const bb = rd._bb, m = rd.hw + 14; if (bb && (x < bb[0] - m || x > bb[2] + m || z < bb[1] - m || z > bb[3] + m)) continue;
      const q = nearestOnSamples(rd.samples, x, z), sp = rd.samples[q.i], off = q.d - rd.hw; if (off < 0.25) continue;
      if (LAID(rd) && !laidAt(rd, sp.s) && !rd.sidewalk) continue;
      const sd = (x - sp.x) * -sp.tz + (z - sp.z) * sp.tx >= 0 ? 1 : -1, gap = LAID(rd) && laidAt(rd, sp.s) ? walkOf(rd, sd, sp.s).gap : (rd.sidewalk || 0) + 0.1;
      if (off < gap + 0.1) return true;
    }
    return false;
  }
  // the laid-stone walk is kept clear: nothing grows or gets set down on it (the raster scatter / verges / props check)
  walkRaster(r, R) {
    if (!r.laid?.length || !r.samples) return;
    const g = Math.max(...(r.walk || [1.2]), ...(r.walkSeg || []).map((q) => q[3]));
    for (const [s0, s1] of r.laid) { const sub = r.samples.filter((q) => q.s >= s0 - 1 && q.s <= s1 + 1); if (sub.length > 1) R.path(sub, r.hw + Math.min(10, g) + 0.2); }
  }
  // hard yard floors (tile, flagstone, brick, slab…) and laid-stone walks inside a box: nothing grows through them
  hardGround(x0, z0, x1, z1) {
    const HARD = new Set(['saltillo', 'laja', 'encaustic', 'brick', 'slab', 'cobble', 'pavers', 'herringbone', 'concrete', 'lot']), out = [];
    const inBox = (P) => P.some(([x, z]) => x >= x0 - 30 && x <= x1 + 30 && z >= z0 - 30 && z <= z1 + 30);
    for (const v of Object.values(this._ground || {})) {
      if (HARD.has(v.g.fill) && v.poly && inBox(v.poly)) out.push(v.poly);
      if (HARD.has(v.g.surface)) for (const R of v.regions || []) if (inBox(R)) out.push(R);
    }
    return out;
  }
  placeGrates(U = null) {
    for (const [k, at] of [...(this._grates ||= new Map())]) if (!U || (at[0] >= U[0] && at[0] <= U[2] && at[1] >= U[1] && at[1] <= U[3])) { this.removeOwned(k); this._grates.delete(k); } // the tree may be gone
    const BIG = new Set(['eucalyptus', 'tamarisk', 'mesquite', 'palo_verde', 'pepper_tree', 'fan_palm', 'date_palm', 'fruit_tree', 'elephant_tree', 'ironwood', 'olive', 'citrus']);
    const inU = (x, z) => !U || (x >= U[0] && x <= U[2] && z >= U[1] && z <= U[3]);
    for (const pl of [...(this.spec.vegetation?.plants || []), ...(this.genPlants || [])]) {
      if (!pl.at || !inU(pl.at[0], pl.at[1])) continue;
      const key = `grate:${pl.at[0].toFixed(2)},${pl.at[1].toFixed(2)}`; if (U) this.removeOwned(key);
      if (BIG.has(pl.species) && this.onWalk(pl.at[0], pl.at[1])) { this.own(key, () => this.addProp({ type: 'tree_grate', at: pl.at, keep: true, ground: true, seat: false }, true)); this._grates.set(key, pl.at); }
    }
  }

  // world Y of the flat roof under (x, z), or null
  roofAt(x, z) {
    let best = null;
    for (const r of this.roofs || []) {
      const c = Math.cos(r.r), sn = Math.sin(r.r), dx = x - r.cx, dz = z - r.cz, u = dx * c - dz * sn, w = dx * sn + dz * c;
      if (Math.abs(u) <= r.hw && Math.abs(w) <= r.hd && (best == null || r.y > best)) best = r.y;
    }
    return best;
  }

  propAt(p) {
    if (p.at) return p.at;
    if (p.in) {
      const S = this.structures || [];
      if (this._sIdxA !== S || this._sIdxN !== S.length) { this._sIdx = new Map(S.map((x) => [x.id, x])); this._sIdxA = S; this._sIdxN = S.length; } // id index (the array is replaced or grown on every change)
      const s = this._sIdx.get(p.in);
      if (!s) return null;
      const [wx, wz] = toWorld(p.local?.[0] || 0, p.local?.[1] || 0, deg(s.rot || 0));
      return [s.at[0] + wx, s.at[1] + wz];
    }
    return null;
  }

  // nearest building wall face to (x, z) within maxD: the point on it (just proud of it) and a rotation facing out
  nearestWall(x, z, maxD = 2.5) {
    let best = null;
    for (const s of this.structures || []) for (const m of s._masses || []) {
      const [lx, lz] = toLocal(x - m.cx, z - m.cz, m.r), hw = m.w / 2, hd = m.d / 2;
      for (const [nx, nz, off, along, half] of [[0, 1, hd, lx, hw], [0, -1, hd, lx, hw], [1, 0, hw, lz, hd], [-1, 0, hw, lz, hd]]) {
        const dist = Math.abs((nx ? lx * nx : lz * nz) - off); if (dist > maxD || Math.abs(along) > half - 0.3) continue;
        if (best && dist >= best.d) continue;
        const px = nx ? nx * (off + 0.04) : along, pz = nz ? nz * (off + 0.04) : along, [wx, wz] = toWorld(px, pz, m.r);
        const [ox, oz] = toWorld(nx, nz, m.r);
        best = { d: dist, at: [m.cx + wx, m.cz + wz], rot: (Math.atan2(ox, oz) * 180) / Math.PI };
      }
    }
    return best;
  }

  addProp(p, generated = false) {
    if (this._rec) { const r = this._rec; if (generated) r.props.push(structuredClone(p)); this._rec = null; try { return this.addProp(p, generated); } finally { this._rec = r; } }
    const T = this.terrain;
    if (p.id && this.src.overrides?.[p.id]) p = { ...p, ...this.src.overrides[p.id] };
    const rng = new RNG(`${this.seed}:prop:${p.id || p.type}:${(p.at || p.local || [0, 0]).join(',')}`);
    let at = this.propAt(p);
    if (!at) return;
    // light state decided before building, so lamp glass and baked light agree
    const PL = PROP_LIGHT[p.type];
    let lightR = 9;
    if (PL && p.light !== false) {
      const lt = typeof p.light === 'object' ? p.light : {};
      const essential = lt.essential ?? p.essential ?? PL.essential ?? false;
      const powered = PL.electric ? lt.on ?? p.powered ?? rng.chance(POWER_ODDS[this.settlement.power] ?? 0.3) : true;
      const fuelled = PL.electric ? true : lt.on ?? p.lit ?? true;
      lightR = !powered || !fuelled ? 9 : essential ? -0.5 : rng.next();
    }
    if (ROCKY.has(p.type) && this.vegErased && this.vegErased(at[0], at[1])) return; // the Clear brush takes boulders / rocks too
    const built = buildProp(p.type, rng, { ...p, _r: lightR, _set: this.settlement });
    if (!built) { console.warn('unknown prop', p.type); return; }
    // yard / plot dressing never stands inside something already there: the later one gives way (overhead and flat
    // things — pergolas, slabs, lines of lights or washing — don't count)
    if (p.inPlot && p.bake && !p.touched && !p.in && !THROUGH.has(p.type) && this.propFoot?.length) {
      let hx = 0.2, hz = 0.2; for (const gm of Object.values(built.geoms)) { gm.computeBoundingBox(); const bb = gm.boundingBox; if (isFinite(bb.min.x)) { hx = Math.max(hx, Math.abs(bb.min.x), Math.abs(bb.max.x)); hz = Math.max(hz, Math.abs(bb.min.z), Math.abs(bb.max.z)); } }
      const rr = Math.min(3.5, Math.max(hx, hz) * 0.85);
      if (this.propFoot.some((q) => !THROUGH.has(q.type) && Math.hypot(q.x - at[0], q.z - at[1]) < (q.r + rr) * 0.55)) { for (const gm of Object.values(built.geoms)) gm.dispose?.(); return; }
    }
    let wallSnap = false;
    if (p.type === 'pa_wall' && !p.in) { const w = this.nearestWall(at[0], at[1], 2.5); if (w) { at = w.at; p = { ...p, rot: w.rot }; wallSnap = true; } }
    if (!wallSnap && !p.in && p.keep !== true && (generated || !this.src.builder) && (generated || this.roofAt(at[0], at[1]) == null)) { // props placed by hand stay where they were put (and roof props stay on the roof)
      // never inside a building / under a porch; never in a doorway or gate
      let rad = 0.4;
      for (const gm of Object.values(built.geoms)) { gm.computeBoundingBox(); const bb = gm.boundingBox; rad = Math.max(rad, Math.min(3, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 * 0.8)); }
      const zones = p.keep === 'doors' ? this.keepOut : NO_KEEPOUT.has(p.type) ? this.solids : [...this.solids, ...this.keepOut];
      const moved = pushOut(at, rad, zones);
      if (moved) at = moved;
    }
    let y = T.height(at[0], at[1]);
    let rot = p.rot ?? 0;
    if (p.in) {
      const s = this.structures.find((x) => x.id === p.in);
      y = s._y + (p.y ?? 0.42); rot = (s.rot || 0) + (p.rot || 0);
    }
    if (p.face != null) {
      let tx, tz;
      if (typeof p.face === 'string') {
        const r = this.roads.find((rr) => rr.id === p.face);
        if (r) { const q = nearestOnSamples(r.samples, at[0], at[1]); tx = q.qx; tz = q.qz; }
        else { const o = this.structures.find((x) => x.id === p.face); if (o) [tx, tz] = o.at; }
      } else [tx, tz] = p.face;
      if (tx != null) rot = (facingAngle(tx - at[0], tz - at[1]) * 180) / Math.PI + (p.rotOffset || 0);
    }
    const g = new THREE.Group();
    for (const m of meshes(built.geoms)) g.add(m);
    for (const part of built.parts || []) { if (!part.material) part.material = MATS.main; withBake(part.geometry); g.add(part); }
    // seat on the ground
    if (!p.in && !p.tilt && p.seat !== false) {
      const box = new THREE.Box3();
      for (const m of g.children) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
      const hx = Math.max(0.2, Math.min(4, (box.max.x - box.min.x) / 2 * 0.85)), hz = Math.max(0.2, Math.min(4, (box.max.z - box.min.z) / 2 * 0.85));
      const cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
      const r0 = deg(rot);
      const H = (lx, lz) => { const [wx, wz] = toWorld(cx + lx, cz + lz, r0); return T.height(at[0] + wx, at[1] + wz); };
      const hF = H(0, hz), hB = H(0, -hz), hR = H(hx, 0), hL = H(-hx, 0), hC = H(0, 0);
      if (TILT.has(p.type)) {
        const k = p.type === 'brahmin' ? 0.5 : 1;
        g.rotation.set(Math.atan2(hB - hF, 2 * hz) * k, r0, Math.atan2(hR - hL, 2 * hx) * k, 'YXZ');
        y = Math.min((hF + hB + hR + hL) / 4, hC) - 0.02;
      } else {
        g.rotation.y = r0;
        y = Math.min(hF, hB, hR, hL, hC) - 0.03;
      }
    } else {
      g.rotation.y = deg(rot);
      if (p.tilt) g.rotation.z = deg(p.tilt);
    }
    const ry = p.ground ? null : this.roofAt(at[0], at[1]);
    if (ry != null) y = ry;
    g.position.set(at[0], y + (p.lift || 0), at[1]); g.userData.gy = T.height(at[0], at[1]); // the ground it was seated on (an edit only reseats it if that moved)
    { // footprint of every placed prop (life.js checks against these, so nothing piles on what's already there)
      let hx = 0.3, hz = 0.3; for (const gm of Object.values(built.geoms)) { gm.computeBoundingBox(); const bb = gm.boundingBox; if (isFinite(bb.min.x)) { hx = Math.max(hx, Math.abs(bb.min.x), Math.abs(bb.max.x)); hz = Math.max(hz, Math.abs(bb.min.z), Math.abs(bb.max.z)); } }
      if (!['alley_line', 'alley_tarp', 'cables'].includes(p.type)) (this.propFoot ||= []).push({ x: at[0], z: at[1], r: Math.min(3.5, Math.max(hx, hz) * 0.85), type: p.type, o: this._owner });
    }
    attachPropSigns(g, built.signs, rng);
    for (const a of built.anim || []) this.anim.push(a);
    g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const l of built.lights || []) this.addLight({ r: lightR, ...l }, (q) => { v.set(...q.at).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; });
    for (const e of built.emitters || []) { v.set(...e.p).applyMatrix4(g.matrixWorld); this.emitters.push({ type: e.type, x: v.x, y: v.y, z: v.z, r: e.always ? Math.min(lightR, -0.5) : lightR, small: e.small, always: e.always, _o: this._owner }); }
    const id = p.id || (p.name || p.stats ? `${p.type}-${this.items.size}` : null);
    if (id) {
      g.traverse((o) => { if (o.isMesh) o.userData.selectId = id; });
      const box = new THREE.Box3().setFromObject(g);
      const r = Math.max(1, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2);
      this.register({ id, name: p.name, type: 'prop', spec: p, object: g, ring: { x: at[0], z: at[1], r, y }, anchor: () => new THREE.Vector3(at[0], box.max.y + 0.6, at[1]) });
    }
    g.name = `prop:${p.type}`;
    g.userData.owner = this._owner;
    g.traverse((o) => { if (o.isMesh) o.userData.prop = true; });
    this.group.add(g);
    if (generated) this.raster.circle(at[0], at[1], 1.2);
    if (!p.in) this.hard.circle(at[0], at[1], 0.6);
    return g;
  }

  // road mesh (paved) + arroyo crossing structures, replacing earlier ones
  roadMeshes(r) {
    for (const nm of [`road:${r.id}`, `cross:${r.id}`, `run:${r.id}`]) { const old = this.group.getObjectByName(nm); if (old) { this.group.remove(old); old.traverse((o) => o.geometry?.dispose()); } }
    const T = this.terrain;
    const g = buildRoad(r, T, this.seed);
    if (g) {
      const grp = new THREE.Group(); grp.name = `road:${r.id}`; grp.userData.owner = r.id;
      if (g.surface) { const m = new THREE.Mesh(g.surface, MATS.asphalt); m.userData.owner = r.id; grp.add(m); }
      if (g.curbs) for (const cm of meshes(g.curbs)) { cm.userData.owner = r.id; grp.add(cm); }
      this.group.add(grp);
    }
    const ro = buildRunout(r, T);
    if (ro) { const grp = new THREE.Group(); for (const m of meshes(ro)) { m.userData.owner = r.id; grp.add(m); } grp.name = `run:${r.id}`; grp.userData.owner = r.id; this.group.add(grp); }
    const cg = buildCrossings(r, T, this.seed);
    for (const c of r.cliffs || []) { const old = this.group.getObjectByName(`cliff:${c.id}`); if (old) { this.group.remove(old); old.traverse((o) => o.geometry?.dispose()); } this.addCliff(c, r.id); }
    if (cg) { const grp = new THREE.Group(); for (const m of meshes(cg)) grp.add(m); grp.name = `cross:${r.id}`; grp.userData.owner = r.id; this.group.add(grp); for (const c of r.cross) { const q = r.samples[c.im]; this.hard.circle(q.x, q.z, r.hw + 2); } }
  }
  // all cliffs (retaining walls + culvert fills): terrain discard mask
  updateCliffs() {
    const T = this.terrain, all = [...(this.retainCliffs || []), ...this.roads.flatMap((r) => r.cliffs || [])];
    T.setCliffs(all);
    U.uCut.value = T.cutTex; U.uCutOn.value = T.cut ? 1 : 0;
    if (T.cut) U.uCutRect.value.set(T.cut.x0, T.cut.z0, T.cut.nx * T.cut.res, T.cut.nz * T.cut.res);
  }
  addCliff(c, owner = null) {
    const T = this.terrain, g = new THREE.Group();
    const strip = new THREE.Mesh(cliffStrips(c, T), MATS.terrainStrip); strip.userData.terrain = true; strip.name = 'cliffGround'; g.add(strip);
    for (const m of meshes(cliffWall(c, T, this.seed))) g.add(m);
    g.name = owner ? `cliff:${c.id}` : `retain:${c.id}`; g.userData.owner = owner || this._owner;
    this.group.add(g);
    const sp = samplePathSimple(c.closed ? [...c.P, c.P[0]] : c.P);
    this.raster.path(sp, cliffBand(T)); this.hard.path(sp, 0.7);
  }
  addFence(f) {
    if (this._rec) { const r = this._rec; r.walls.push(structuredClone(f)); this._rec = null; try { return this.addFence(f); } finally { this._rec = r; } }
    // gate keep-outs (both sides of the opening)
    if (f.gates?.length) {
      const pts = f.closed ? [...f.path, f.path[0]] : f.path;
      let total = 0; const segs = [];
      for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], total, L]); total += L; }
      for (const gt of f.gates) {
        const sg = gt.s ?? (gt.at ?? 0) * total;
        const seg = segs.find(([, , s0, L]) => sg >= s0 && sg <= s0 + L) || segs[segs.length - 1];
        if (!seg) continue;
        const [a, b, s0, L] = seg, t = (sg - s0) / (L || 1);
        const dx = (b[0] - a[0]) / (L || 1), dz = (b[1] - a[1]) / (L || 1);
        const z = { cx: a[0] + (b[0] - a[0]) * t, cz: a[1] + (b[1] - a[1]) * t, w: (gt.width || 3) + 0.8, d: f._yard ? 3.2 : 7, r: Math.atan2(-dz, dx), side: true, _o: this._owner };
        this.keepOut.push(z);
        this.raster.obb(z, 0);
      }
    }
    if (f.type === 'acequia' && this.irr) { f._wet = this.irr.wet.has(f.id); f._gates = this.irr.gates.get(f.id) || []; }
    (this.fenceLog ||= []).push(Object.assign(f, { _o: this._owner })); // every fence built (walk-mode collisions)
    const geoms = buildFence(f, this.terrain, this.seed);
    const g = new THREE.Group();
    for (const m of meshes(geoms)) g.add(m);
    g.name = `fence:${f.id || f.type}`;
    g.userData.owner = this._owner;
    this.group.add(g);
    if (f.type === 'powerline') this.polePads(f); else this.raster.path(samplePathSimple(f.closed ? [...f.path, f.path[0]] : f.path), 0.8);
  }
  // power lines keep only a small clearing round each pole
  polePads(f) { for (const p of polePositions(f.closed ? [...f.path, f.path[0]] : f.path, f.spacing || 32)) { this.raster.circle(p.x, p.z, 0.9); this.hard.circle(p.x, p.z, 0.5); } }

  runScatter(rule) {
    const rng = new RNG(`${this.seed}:scatter:${rule.id || rule.type}:${rule.along || ''}`);
    const T = this.terrain;
    const opts = rule.opts || {};
    if (rule.along) {
      const road = this.roads.find((r) => r.id === rule.along);
      if (!road) return;
      const L = pathLength(road.samples);
      const [r0, r1] = rule.range || [0, 1];
      if (rule.every) {
        const tops = [];
        for (let s = r0 * L + (rule.start || 0); s <= r1 * L; s += rule.every * rng.range(0.92, 1.08)) {
          const p = sampleAt(road.samples, s);
          const side = rule.side ?? 1;
          const off = road.hw + (rule.offset ?? 6);
          const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
          if (!T.inMap(x, z, 4) || T.outside(x, z) > 0.75) { tops.push(null); continue; }
          const fallen = rng.chance(rule.fallen ?? 0.12);
          const rot = (Math.atan2(p.tx, p.tz) * 180) / Math.PI + 90;
          if (fallen) {
            this.addProp({ type: rule.type, at: [x, z], rot: rot + rng.range(-30, 30), tilt: 84, lift: 0.15, bare: true }, true);
            tops.push(null);
          } else {
            const lean = rng.range(-0.06, 0.06);
            this.addProp({ type: rule.type, at: [x, z], rot, lean, ...opts }, true);
            const H = opts.height || 8;
            const y = T.height(x, z);
            const [wx, wz] = toWorld(Math.sin(lean) * H * 0.95, 0, deg(rot));
            tops.push({ x: x + wx, z: z + wz, y: y + H * 0.95 + 0.15, rot: deg(rot) });
          }
        }
        if (rule.wires) {
          const b = new Builder();
          b.t('metal');
          for (let i = 0; i < tops.length - 1; i++) {
            const a = tops[i], c = tops[i + 1];
            if (!a || !c) continue;
            for (const off of [-0.7, 0, 0.7]) {
              if (rng.chance(rule.wireLoss ?? 0.25)) continue;
              const [ax, az] = toWorld(off, 0, a.rot), [cx, cz] = toWorld(off, 0, c.rot);
              const A = [a.x + ax, a.y, a.z + az], C = [c.x + cx, c.y, c.z + cz];
              const M = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2 - 0.9, (A[2] + C[2]) / 2];
              const q1 = [(A[0] + M[0]) / 2, (A[1] + M[1]) / 2 - 0.25, (A[2] + M[2]) / 2], q2 = [(M[0] + C[0]) / 2, (M[1] + C[1]) / 2 - 0.25, (M[2] + C[2]) / 2];
              b.beam(A, q1, 0.035, 3, 0x2a2a2a); b.beam(q1, M, 0.035, 3, 0x2a2a2a); b.beam(M, q2, 0.035, 3, 0x2a2a2a); b.beam(q2, C, 0.035, 3, 0x2a2a2a);
            }
          }
          for (const m of meshes(b.build())) { m.userData.noShadow = true; this.group.add(m); }
        }
        return;
      }
      const n = rule.count || 3;
      let placed = 0, tries = 0;
      while (placed < n && tries++ < n * 30) {
        const s = rng.range(r0, r1) * L;
        const p = sampleAt(road.samples, s);
        const side = rule.side ?? (rng.chance(0.5) ? 1 : -1);
        const [o0, o1] = rule.offset || [2, 10];
        const off = road.hw + rng.range(o0, o1);
        const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
        if (!T.inBounds(x, z, 3) || this.blocked(x, z, rule.clear ?? 1.5)) continue;
        const along = (Math.atan2(p.tx, p.tz) * 180) / Math.PI;
        const rot = rule.rot === 'random' ? rng.range(0, 360) : along + rng.range(-25, 25) + (rng.chance(0.5) ? 180 : 0);
        this.addProp({ type: rule.type, at: [x, z], rot, ...opts, ...(rule.vary ? Object.fromEntries(Object.entries(rule.vary).map(([k, v]) => [k, rng.chance(v)])) : {}) }, true);
        placed++;
      }
      return;
    }
    const n = rule.count || 4;
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 40) {
      let x, z;
      if (rule.area) { const bb = polyBounds(rule.area); x = rng.range(bb.x0, bb.x1); z = rng.range(bb.z0, bb.z1); if (!pointInPoly(x, z, rule.area)) continue; }
      else { const a = rng.next() * 6.28, d = Math.sqrt(rng.next()) * (rule.radius || 10); x = (rule.near?.[0] || 0) + Math.cos(a) * d; z = (rule.near?.[1] || 0) + Math.sin(a) * d; }
      if (!T.inBounds(x, z, 2) || this.blocked(x, z, rule.clear ?? 1.2)) continue;
      this.addProp({ type: rule.type, at: [x, z], rot: rng.range(0, 360), ...opts, ...(rule.vary ? Object.fromEntries(Object.entries(rule.vary).map(([k, v]) => [k, rng.chance(v)])) : {}) }, true);
      placed++;
    }
  }

  update(dt) {
    for (const a of this.anim) a.obj.rotation[a.axis] += a.speed * dt;
  }
}

const NO_KEEPOUT = new Set(['lantern', 'torch', 'sign', 'street_lamp', 'utility_pole', 'neon_sign', 'spotlight_tower', 'km_marker', 'billboard', 'corral_gate']);

// push a point (with radius) out of a list of boxes; door/gate zones push sideways only
function pushOut(at, rad, zones) {
  let [x, z] = at, moved = false;
  for (let it = 0; it < 6; it++) {
    let hit = false;
    for (const b of zones) {
      const dx = x - b.cx, dz = z - b.cz, c = Math.cos(b.r), s = Math.sin(b.r);
      let lx = dx * c - dz * s, lz = dx * s + dz * c;
      const px = b.w / 2 + rad - Math.abs(lx), pz = b.d / 2 + rad - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      hit = moved = true;
      if (b.side || px < pz) lx = (lx >= 0 ? 1 : -1) * (b.w / 2 + rad + 0.15);
      else lz = (lz >= 0 ? 1 : -1) * (b.d / 2 + rad + 0.15);
      x = b.cx + lx * c + lz * s; z = b.cz - lx * s + lz * c;
    }
    if (!hit) break;
  }
  return moved ? [x, z] : null;
}

// an access track from each authored wall gate to the nearest road (when no road reaches it)
function gateTracks(spec) {
  const out = [];
  const roads = (spec.roads || []).filter((r) => r.type !== 'path');
  (spec.walls || []).forEach((f, wi) => {
    if (!f.gates?.length || f.track === false) return;
    const pts = f.closed ? [...f.path, f.path[0]] : f.path;
    let total = 0; const segs = [];
    for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], total, L]); total += L; }
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    f.gates.forEach((gt, gi) => {
      if (gt.track === false) return;
      const sg = gt.s ?? (gt.at ?? 0) * total;
      const seg = segs.find(([, , s0, L]) => sg >= s0 && sg <= s0 + L);
      if (!seg) return;
      const [a, b, s0, L] = seg, t = (sg - s0) / L;
      const gx = a[0] + (b[0] - a[0]) * t, gz = a[1] + (b[1] - a[1]) * t;
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      if (f.closed && nx * (gx - cx) + nz * (gz - cz) < 0) { nx = -nx; nz = -nz; } // outward
      let best = null;
      for (const r of roads) for (let i = 0; i < r.path.length - 1; i++) {
        const [px, pz] = r.path[i], [qx, qz] = r.path[i + 1];
        const vx = qx - px, vz = qz - pz, l2 = vx * vx + vz * vz || 1;
        const tt = Math.max(0, Math.min(1, ((gx - px) * vx + (gz - pz) * vz) / l2));
        const x = px + vx * tt, z = pz + vz * tt, d = Math.hypot(x - gx, z - gz);
        if (!best || d < best.d) best = { d, x, z };
      }
      if (!best || best.d < 3 || best.d > 70) return;
      out.push({ id: `${f.id || 'wall' + wi}-gate${gi}-track`, type: 'track', _gate: true, path: [[gx - nx * 5, gz - nz * 5], [gx, gz], [gx + nx * Math.min(6, best.d / 2), gz + nz * Math.min(6, best.d / 2)], [best.x, best.z]] });
    });
  });
  return out;
}

// pre-war street grid: spec.grid = [{ id, origin, angle, spacing: [along, across], count: [n, m], type, width, missing, condition }]
function gridRoads(spec, seed) {
  const out = [];
  (spec.grid || []).forEach((g0, gi) => {
    const F = g0.frame && spec._frames?.[g0.frame];
    const g = F ? { ...g0, origin: (() => { const [x, z] = toWorld(g0.origin[0], g0.origin[1], F.r); return [F.o[0] + x, F.o[1] + z]; })(), angle: (g0.angle || 0) + F.deg } : g0;
    const rng = new RNG(`${seed}:grid:${g.id || gi}`);
    const a = deg(g.angle || 0), [sx, sz] = g.spacing || [60, 45], [nx, nz] = g.count || [3, 4];
    const o = g.origin || [0, 0];
    const P = (u, v) => { const [x, z] = toWorld(u, v, a); return [o[0] + x, o[1] + z]; };
    const U0 = (-nx * sx) / 2, U1 = (nx * sx) / 2, V0 = (-nz * sz) / 2, V1 = (nz * sz) / 2;
    const line = (fixed, isU, idx) => {
      // split into block-length pieces; drop some (buried / built over) and merge the survivors
      const n = isU ? nz : nx, step = isU ? sz : sx, start = isU ? V0 : U0;
      let run = null, k = 0;
      for (let i = 0; i <= n; i++) {
        const keep = i < n && !rng.chance(g.missing ?? 0.12) && !(g.skip || []).includes(`${isU ? 'u' : 'v'}${idx}:${i}`);
        if (keep) { if (!run) run = [start + i * step]; run[1] = start + (i + 1) * step; }
        else if (run) {
          const nm = (isU ? g.namesU : g.namesV)?.[idx], kk = k++;
          out.push({ id: `${g.id || 'grid'}-${isU ? 'u' : 'v'}${idx}-${kk}`, ...(nm && kk === 0 ? { name: nm } : {}), type: g.type || 'paved', era: 'prewar', ...(g.class ? { class: g.class } : {}), ...(g.priority ? { priority: g.priority[isU ? 0 : 1] } : {}), ...(g.width ? { width: g.width } : {}), condition: g.condition ?? 0.35, smooth: false,
            path: isU ? [P(fixed, run[0]), P(fixed, run[1])] : [P(run[0], fixed), P(run[1], fixed)] });
          run = null;
        }
      }
    };
    for (let i = 0; i <= nx; i++) if (!(g.skipU || []).includes(i)) line(U0 + i * sx, true, i);
    for (let j = 0; j <= nz; j++) if (!(g.skipV || []).includes(j)) line(V0 + j * sz, false, j);
  });
  return out;
}

// pre-war roads stay straight; post-war ones wander a little (spec: era, wiggle in metres)
function eraShape(r, seed) {
  if (r.era === 'prewar') return { ...r, smooth: false };
  if (!r.wiggle) return r;
  const n = makeNoise(`${seed}:wig:${r.id}`), out = [r.path[0]];
  for (let i = 0; i < r.path.length - 1; i++) {
    const [ax, az] = r.path[i], [bx, bz] = r.path[i + 1], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L / 22));
    for (let j = 1; j <= k; j++) {
      const t = j / k, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (j === k) { out.push([bx, bz]); break; }
      const o = n.noise2(x / 60, z / 60) * r.wiggle;
      out.push([x - ((bz - az) / L) * o, z + ((bx - ax) / L) * o]);
    }
  }
  return { ...r, path: out };
}

function shrinkPoly(poly, d) {
  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  return poly.map(([x, z]) => { const L = Math.hypot(x - c[0], z - c[1]) || 1; return [x - ((x - c[0]) / L) * d, z - ((z - c[1]) / L) * d]; });
}

function cornersOf(b) {
  const hw = b.w / 2, hd = b.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => { const [wx, wz] = toWorld(x, z, b.r); return [b.cx + wx, b.cz + wz]; });
}
function samplePathSimple(path) {
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1));
    for (let k = 0; k <= n; k++) out.push({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, tx: (bx - ax) / L, tz: (bz - az) / L, s: 0 });
  }
  return out;
}

// Generator catalog — every origin × a spread of materials and kinds, for checking the look.
const ORIGINS = ['new', 'maintained', 'repurposed', 'rebuilt', 'built_on_ruin', 'ruin', 'stripped'];
const structures = [];
const X = (i) => -66 + i * 22;
// row 1: two-storey pre-war concrete office through every origin
ORIGINS.forEach((o, i) => structures.push({ id: `office-${o}`, name: o.replace(/_/g, ' '), kind: 'office', material: 'concrete', origin: o, floors: 2, size: [12, 9], at: [X(i), -60], rot: 0 }));
// row 2: block workshop through every origin
ORIGINS.forEach((o, i) => structures.push({ id: `shop-${o}`, kind: i % 2 ? 'workshop' : 'shop', material: 'block', origin: o, size: [11, 9], at: [X(i), -36], rot: 0, sign: i === 2 ? 'LLANTERA' : undefined }));
// row 3: new builds by material
[['adobe', 'house', 'rect'], ['adobe', 'house', 'L'], ['stone', 'house', 'rect'], ['plaster', 'cantina', 'rect'], ['brick', 'hall', 'rect'], ['timber', 'barn', 'rect'], ['metal', 'shed', 'rect']]
  .forEach(([m, k, sh], i) => structures.push({ id: `new-${m}-${k}`, name: `${m} ${k}`, kind: k, material: m, shape: sh, origin: 'new', size: k === 'shed' ? [5, 4] : [12, 9], at: [X(i), -10], rot: 0, porch: k === 'cantina' }));
// row 4: shapes, roofs, chapel, canopy
structures.push({ id: 'courtyard', name: 'adobe courtyard', kind: 'house', shape: 'courtyard', material: 'adobe', size: [18, 16], at: [X(0), 20], rot: 0, extras: ['tinaco'] });
structures.push({ id: 'u-plaster', name: 'U · tile gable', kind: 'house', shape: 'U', material: 'plaster', roof: 'gable', roofMat: 'tile', size: [16, 12], at: [X(1), 20], rot: 0 });
structures.push({ id: 'hip', name: 'hip · tile', kind: 'house', material: 'stone', roof: 'hip', roofMat: 'tile', size: [12, 9], at: [X(2), 20], rot: 0 });
structures.push({ id: 'palapa', name: 'palapa', kind: 'house', material: 'adobe', roof: 'palapa', roofMat: 'thatch', size: [8, 7], at: [X(3), 20], rot: 0 });
structures.push({ id: 'chapel', name: 'chapel', kind: 'chapel', material: 'adobe', origin: 'maintained', size: [9, 18], at: [X(4), 20], rot: 0 });
structures.push({ id: 'warehouse', name: 'warehouse', kind: 'warehouse', material: 'block', origin: 'repurposed', size: [20, 13], at: [X(5) + 2, 20], rot: 0 });
structures.push({ id: 'canopy', name: 'canopy (sagging)', kind: 'canopy', size: [15, 9], at: [X(6), 20], rot: 0, sag: { corner: 2, drop: 1.6 } });
// row 6: finishes
[['none', 'adobe'], ['wash', 'adobe'], ['painted', 'plaster'], ['decorated', 'plaster'], ['showpiece', 'adobe'], ['showpiece', 'plaster'], ['decorated', 'stone']]
  .forEach(([f, m], i) => structures.push({ id: `fin-${i}`, name: f, kind: i > 3 ? 'cantina' : 'house', material: m, origin: 'new', size: [13, 9], at: [X(i), 78], rot: 0, finish: f }));
// row 5: rotations — gridless check
for (let i = 0; i < 7; i++) structures.push({ id: `rot-${i}`, kind: 'house', material: i % 2 ? 'adobe' : 'plaster', origin: i % 3 === 0 ? 'rebuilt' : 'new', size: [9, 7], at: [X(i), 50], rot: i * 13 - 30, extras: i % 2 ? ['tinaco'] : [] });

// row 7: light props (look at Night / Dead of Night)
const props = [
  { type: 'street_lamp', at: [X(0), 100], light: { on: true } },
  { type: 'neon_sign', at: [X(1), 100], text: 'CANTINA', color: 'pink', light: { on: true } },
  { type: 'spotlight_tower', at: [X(2), 100], light: { on: true } },
  { type: 'lantern', at: [X(3), 100], essential: true },
  { type: 'torch', at: [X(4) - 2, 100] }, { type: 'torch', at: [X(4) + 2, 100] },
  { type: 'firepit', at: [X(5), 100] },
  { type: 'vending_machine', at: [X(6), 100], light: { on: true } },
];
// row 8: temporary structures + yard / trade props
['tent_aframe', 'tent_wall', 'tent_bell', 'lean_to', 'wagon', 'stall', 'tarp_stall', 'cart_shop', 'shade_cloth', 'hitching_rail',
  'meat_rack', 'hide_frame', 'forge', 'tan_pit', 'kiln', 'chicken_coop', 'planter', 'lumber']
  .forEach((type, i) => props.push({ type, at: [-76 + i * 9, 124], rot: 0, name: type.replace(/_/g, ' ') }));
// row 9: GLB model props
['jersey_barrier', 'road_barrier', 'cone', 'bollard', 'pot_large', 'potted_plant', 'hedge', 'hedge_dead', 'watchtower', 'guard_shack', 'barrier', 'sandbags', 'tank_trap', 'wire_coil']
  .forEach((type, i) => props.push({ type, at: [-76 + i * 10, 136], rot: 0, name: type.replace(/_/g, ' ') }));
export default {
  props,
  camps: [{ id: 'cat-caravan', type: 'caravan', at: [-50, 150], rot: 90, radius: 13 }, { id: 'cat-trav', type: 'travellers', at: [0, 150], radius: 7 }],
  markets: [{ id: 'cat-market', at: [50, 150], r: 12 }],
  settlement: { tl: 5, wealth: 'average', appearance: 0, power: 'some' },
  name: 'Generator catalog',
  region: 'test sheet',
  seed: 7,
  size: [190, 330],
  biome: 'desert',
  mode: 'test',
  description: 'Rows: concrete office / block shop through every origin · new builds by material · shapes & roofs · free rotations · finishes · light props · temporary structures & trade props · caravan camp, travellers\' camp, market.',
  terrain: { relief: 0.4 },
  structures,
  vegetation: { density: 0.12 },
  view: { target: [0, 0], zoom: 1.3, az: -30 },
};

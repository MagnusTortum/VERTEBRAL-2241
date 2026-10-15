// Texture layer registry: name -> index in the texture array, and metres per texture tile.
export const LAYER_DEFS = [
  ['plain', 2.0], ['adobe', 2.2], ['plaster', 2.5], ['stone', 1.6], ['brick', 1.2], ['concrete', 2.4],
  ['block', 1.6], ['wood', 1.4], ['corrugated', 1.3], ['roof_tile', 1.2], ['thatch', 1.4], ['slab', 3.0],
  ['sand', 5.0], ['dirt', 4.0], ['rock', 4.0], ['asphalt', 4.0], ['bark', 0.9], ['cactus', 0.8],
  ['azulejo', 0.8], ['limewash', 2.2], ['metal', 1.6], ['fabric', 1.2], ['gravel', 2.5], ['hide', 1.0],
  ['mud_roof', 2.5], ['door', 1.0], ['tilled', 3.0], ['shingle', 1.4],
  ['scrub', 3.2], ['urban', 3.0], ['cobble', 1.6], ['pavers', 1.4], ['grime', 3.0],
  ['rust', 1.4], ['drystone', 1.8], ['fence_wood', 1.4], ['palm_bark', 1.6], ['date_bark', 1.4],
  ['saltillo', 1.2], ['encaustic', 0.8], ['laja', 3.0], ['herringbone', 0.8], ['lot', 4.0], ['ladrillo', 1.5],
];
export const LAYER = Object.fromEntries(LAYER_DEFS.map(([n], i) => [n, i]));
export const LAYER_SCALE = LAYER_DEFS.map(([, s]) => s);
export const layerOf = (name) => LAYER[name] ?? 0;

// material name -> wall layer
export const MAT_LAYER = { adobe: 'adobe', plaster: 'plaster', stone: 'stone', brick: 'brick', concrete: 'concrete', block: 'block', timber: 'wood', metal: 'corrugated' };
export const ROOF_LAYER = { flat_adobe: 'mud_roof', slab: 'slab', corrugated: 'corrugated', tile: 'roof_tile', shingle: 'shingle', thatch: 'thatch', tar: 'slab' };

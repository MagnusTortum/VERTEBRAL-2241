// Build menu: an RTS-style bar along the bottom (Cities: Skylines feel). Category tabs, sub-tabs for
// props, a strip of tiles with thumbnails rendered from the real models, search across everything,
// and a Recent tab. Picking a tile picks the tool and its options in the editor.
import { thumb } from './thumbs.js';
import { PROP_TYPES, MODEL_PROPS } from './props.js';
import { SPECIES } from './vegetation.js';
import { GROUND_PAINTS, SCATTER_SETS } from './editor.js';
import { ROAD_TYPES, CROPS } from './editor-build.js';
import { WATER, WATER_PROPS } from './water.js';
import { roadIcon, modeIcon, zoneIcon, gateIcon, retainIcon, terrIcon, texIcon, activityIcon, buildingIcon, buildingClass } from './icons.js';

const PROP_NAMES = { nuka_vending: 'Papi Cola vending', robco_vending: 'Anthropic vending', nuka_crates: 'Papi Cola crates', nuka_shack: 'Papi Cola shack' };
const L = (k) => PROP_NAMES[k] || k.replace(/_/g, ' ');
const PROP_GROUPS = {
  'Containers': ['barrel', 'crates', 'water_jugs', 'goods', 'tires', 'cistern', 'water_tower'],
  'Vehicles & wrecks': ['car_wreck', 'truck_chassis', 'engine_block', 'wagon', 'cart', 'cart_shop'],
  'Furniture': ['bench', 'table', 'chair', 'cafe_table', 'workbench', 'laundry_line', 'alley_line', 'alley_tarp', 'shade_cloth', 'ramada', 'firepit', 'pot_plant', 'planter'],
  'Market & trades': ['stall', 'tarp_stall', 'cart_shop', 'goods', 'hitching_rail', 'meat_rack', 'hide_frame', 'drying_rack', 'forge', 'kiln', 'tan_pit', 'lumber', 'vending_machine', 'gas_pump'],
  'Farm & animals': ['brahmin', 'chickens', 'chicken_coop', 'haystack', 'woodpile', 'trough', 'corral_gate', 'well', 'hand_pump', 'windmill', 'scarecrow', 'plough', 'harrow', 'tool_lean', 'sack_truck', 'feed_bin', 'produce_pile', 'farm_stand'],
  'Camp': ['tent_aframe', 'tent_wall', 'tent_bell', 'lean_to', 'tarp_tent', 'bedroll', 'firepit'],
  'Security': ['barrier', 'guard_shack', 'sandbags', 'tank_trap', 'wire_coil', 'watchtower', 'spotlight_tower', 'jersey_barrier', 'cone', 'bollard', 'road_barrier'],
  'Lights & signs': ['lantern', 'torch', 'street_lamp', 'neon_sign', 'sign', 'billboard', 'utility_pole', 'km_marker', 'cables', 'radio_mast', 'generator', 'solar_panel', 'shrine', 'cross'],
  'Junk & ruins': ['scrap_pile', 'rubble', 'rocks', 'bones', 'outcrop', 'tires', 'engine_block'],
  'Street life': ['food_cart', 'agua_fresca', 'pila', 'ollas', 'drum_stove', 'laundry_line', 'tire_swing', 'toys', 'domino_table', 'hammock', 'nicho', 'chair'],
  'Animals': ['chickens', 'goat', 'pig', 'dog', 'burro', 'brahmin'],
  'Street furniture': ['bench_park', 'kiosko', 'planter', 'notice_board', 'painted_sign', 'street_lamp', 'bus_shelter', 'phone_booth', 'mailbox', 'hydrant', 'road_sign'],
  'Water & power': ['well', 'water_tank', 'rain_barrel', 'pipes', 'car_fan_turbine', 'solar_panel', 'cables', 'cistern', 'hand_pump'],
  'Defences': ['cheval', 'sandbags', 'barrier', 'wire_coil', 'watchtower', 'tank_trap'],
  'Town & faith': ['pa_pole', 'pa_wall', 'cd_siren', 'tomb', 'flagpole', 'banner', 'pennant', 'nicho', 'bleachers', 'kiosko', 'notice_board'],
  'Farm & trades': ['era', 'pond', 'tahona', 'cuexcomate', 'sacks', 'horno', 'anvil', 'pottery_rack', 'wine_press', 'barrel_rack', 'temazcal', 'trellis'],
  'Brickyard & salvage': ['brick_rows', 'brick_stack', 'mud_pit', 'lime_kiln', 'car_stack', 'scrap_heap', 'crane', 'sort_bins', 'scale', 'scrap_press', 'burn_pit', 'compost_bins', 'sheet_stack', 'wire_reel', 'glass_sort', 'loading_dock'],
  'Crafts': ['sawhorse', 'lumber', 'workbench', 'potters_wheel', 'kiln', 'pottery_rack', 'loom', 'yarn_line', 'saddle_rack', 'hide_frame', 'tan_pit'],
  'Landmarks': ['el_pelicano'],
  'Fishing': ['panga', 'net_rack', 'fish_rack', 'crab_traps'],
  'Water & healing': ['water_cart', 'cistern', 'trough', 'herb_bed', 'drying_rack', 'altar', 'temazcal'],
  'Pre-war': ['checkpoint_ruin', 'substation', 'nuka_vending', 'robco_vending', 'nuka_crates', 'billboard', 'gas_pump', 'bus_shelter', 'phone_booth'],
  'Wealthy yard': ['fountain', 'pergola', 'patio_slab', 'garden_bed', 'tree_ring', 'dining_table', 'grill', 'iron_bench', 'swing_chair', 'citrus_pot', 'pier_lamp', 'generator_shed', 'stable', 'pickup'],
  'Vehicles & carts': ['brahmin_wagon', 'farm_cart', 'hulk_wagon', 'wagon', 'cart', 'pack_burro', 'handcart', 'shopping_cart', 'cargo_trike', 'wheelbarrow', 'bicycle', 'motorcycle', 'rebuilt_truck', 'pickup', 'caravan_trailer'],
  'Street vendors': ['food_cart', 'agua_fresca', 'elote_cart', 'raspados_cart', 'skewer_grill', 'water_seller', 'scrap_blanket', 'basket_table', 'bread_trike', 'nuka_shack', 'tarp_stall', 'cart_shop', 'farm_stand', 'produce_pile'],
  'Wasteland': ['cage', 'auction_block', 'chain_post', 'still', 'chem_table', 'fight_pit', 'bookie_booth', 'bonfire', 'spikes'],
  'Idols & worship': ['goalpost', 'wing_idol', 'fiberglass_giant', 'scrap_statue', 'dish_shrine', 'rocket_idol', 'cult_symbol', 'totem', 'bottle_tree'],
  'Mystics': ['mystic_stall', 'bottle_tree', 'totem', 'bone_chimes', 'offering_pile', 'altar', 'herb_bed', 'drying_rack', 'temazcal', 'nicho'],
  'Plants in pots': ['pot_plant', 'pot_large', 'potted_plant', 'hedge', 'hedge_dead', 'planter'],
};
const BUILD_SAMPLES = {
  shack: { size: [3.8, 3] },
  guardpost: { size: [5, 4.5], label: 'Guard post' }, bunker: { size: [6.5, 5] }, barracks: { size: [16, 8] }, armory: { size: [11, 9] },
  auto: { type: 'house', shape: 'L', size: [11, 9], label: 'Auto (any)' }, house: { shape: 'L', size: [11, 9] }, shop: { size: [8, 9], floors: 2, porch: true }, cantina: { size: [12, 10], shape: 'T', porch: { roof: 'latilla' } },
  workshop: { size: [12, 10] }, garage: { size: [10, 10] }, warehouse: { size: [18, 12] }, barn: { size: [14, 10] }, chapel: { size: [9, 18], shape: 'T' }, hall: { size: [16, 14], shape: 'H' },
  office: { size: [14, 12], shape: 'courtyard' }, shelter: { size: [16, 10], shape: 'U' },
  posada_courtyard: { kind: 'posada', type: 'posada', layout: 'courtyard', size: [16, 15], label: 'Posada (courtyard)' }, posada_gallery: { kind: 'posada', type: 'posada', layout: 'gallery', size: [12, 8], floors: 2, label: 'Posada (gallery)' },
  posada_motel: { kind: 'posada', type: 'posada', layout: 'motel', origin: 'prewar', material: 'plaster', size: [20, 8], label: 'Motel (pre-war)' },
  store_tienda: { kind: 'store', type: 'store', layout: 'tienda', size: [9, 8], label: 'Tienda de abarrotes' }, store_trading: { kind: 'store', type: 'store', layout: 'trading', size: [11, 9], label: 'Trading post' },
  clinic_clinic: { kind: 'clinic', type: 'clinic', layout: 'clinic', size: [11, 8], label: 'Clinic' }, clinic_curandero: { kind: 'clinic', type: 'clinic', layout: 'curandero', size: [6, 5], label: 'Curandero' }, clinic_field: { kind: 'clinic', type: 'clinic', layout: 'field', origin: 'prewar', material: 'concrete', size: [12, 9], label: 'Field hospital' },
  mission: { kind: 'mission', type: 'mission', size: [26, 24], material: 'adobe', label: 'Mission complex' }, granary: { kind: 'granary', type: 'granary', size: [6, 5], label: 'Troje (granary)' }, mill: { kind: 'mill', type: 'mill', size: [7, 6], label: 'Mill (tahona)' },
  bodega: { kind: 'bodega', type: 'bodega', size: [14, 8], material: 'stone', label: 'Bodega (winery)' }, townhall: { kind: 'townhall', type: 'townhall', size: [16, 10], floors: 2, material: 'plaster', label: 'Town hall' },
  comandancia_post: { kind: 'comandancia', type: 'comandancia', layout: 'post', size: [10, 10], material: 'adobe', label: 'Comandancia' }, comandancia_station: { kind: 'comandancia', type: 'comandancia', layout: 'station', origin: 'prewar', material: 'block', size: [11, 11], label: 'Police station (pre-war)' },
  trade_tortilleria: { kind: 'trade', type: 'trade', layout: 'tortilleria', size: [7, 7], label: 'Tortillería' }, trade_panaderia: { kind: 'trade', type: 'trade', layout: 'panaderia', size: [7, 7], label: 'Panadería' }, trade_carniceria: { kind: 'trade', type: 'trade', layout: 'carniceria', size: [7, 7], label: 'Carnicería' },
  trade_herreria: { kind: 'trade', type: 'trade', layout: 'herreria', size: [8, 7], label: 'Herrería' }, trade_alfareria: { kind: 'trade', type: 'trade', layout: 'alfareria', size: [7, 7], label: 'Alfarería' },
  pemex: { kind: 'pemex', type: 'pemex', layout: 'stripped', origin: 'prewar', material: 'concrete', size: [18, 20], label: 'Damex station' }, la_pemex: { kind: 'pemex', type: 'pemex', layout: 'lapemex', origin: 'prewar', material: 'concrete', size: [18, 20], label: 'La Damex (gazetteer)' },
  util_exchange: { kind: 'utility', type: 'utility', layout: 'exchange', origin: 'prewar', material: 'block', size: [20, 18], label: 'Telephone exchange', sub: 'Pre-war technical' }, util_relay: { kind: 'utility', type: 'utility', layout: 'relay', origin: 'prewar', material: 'block', size: [14, 14], label: 'Radio / microwave relay', sub: 'Pre-war technical' },
  util_pumping: { kind: 'utility', type: 'utility', layout: 'pumping', origin: 'prewar', material: 'concrete', size: [20, 18], label: 'Water pumping station', sub: 'Pre-war technical' }, util_substation: { kind: 'utility', type: 'utility', layout: 'substation', origin: 'prewar', material: 'concrete', size: [24, 20], label: 'Electrical substation', sub: 'Pre-war technical' },
  stand_taqueria: { kind: 'stand', type: 'stand', layout: 'taqueria', size: [4.2, 3], label: 'Taquería', sub: 'Food stands' }, stand_bar: { kind: 'stand', type: 'stand', layout: 'bar', size: [3.6, 2.6], label: 'Tiny bar', sub: 'Food stands' },
  stand_tortas: { kind: 'stand', type: 'stand', layout: 'tortas', size: [2.6, 2.2], label: 'Tortas booth', sub: 'Food stands' }, stand_fritanga: { kind: 'stand', type: 'stand', layout: 'fritanga', size: [2.4, 2.4], label: 'Fritanga kiosk', sub: 'Food stands' },
  stand_trailer: { kind: 'stand', type: 'stand', layout: 'trailer', origin: 'prewar', size: [4.8, 2.2], label: 'Food trailer (pre-war)', sub: 'Food stands' },
  den_cages: { kind: 'den', type: 'den', layout: 'cages', origin: 'new', material: 'block', size: [12, 9], label: "Slave pen (cages)", sub: 'Wasteland' },
  den_brothel: { kind: 'den', type: 'den', layout: 'brothel', origin: 'new', material: 'plaster', size: [10, 9], label: "Brothel (casa de citas)", sub: 'Wasteland' },
  den_gambling: { kind: 'den', type: 'den', layout: 'gambling', origin: 'new', material: 'plaster', size: [11, 9], label: "Gambling den", sub: 'Wasteland' },
  den_chopshop: { kind: 'den', type: 'den', layout: 'chopshop', origin: 'new', material: 'block', size: [8, 7], label: "Chop-shop doctor", sub: 'Wasteland' },
  den_gunshop: { kind: 'den', type: 'den', layout: 'gunshop', origin: 'prewar', material: 'concrete', size: [8, 7], label: "Gun runner's bunker", sub: 'Wasteland' },
  den_bounty: { kind: 'den', type: 'den', layout: 'bounty', origin: 'new', material: 'adobe', size: [8, 7], label: "Bounty office", sub: 'Wasteland' },
  den_water: { kind: 'den', type: 'den', layout: 'water', origin: 'new', material: 'block', size: [8, 11], label: "Water merchant", sub: 'Wasteland' },
  den_bus: { kind: 'den', type: 'den', layout: 'bus', origin: 'new', material: 'metal', size: [11, 2.6], label: "Bus home", sub: 'Wasteland' },
  den_fuselage: { kind: 'den', type: 'den', layout: 'fuselage', origin: 'new', material: 'metal', size: [16, 3.6], label: "Fuselage home", sub: 'Wasteland' },
  den_gatehouse: { kind: 'den', type: 'den', layout: 'gatehouse', origin: 'new', material: 'block', size: [11, 4], label: "Junk gatehouse", sub: 'Wasteland' },
  cafe_fonda: { kind: 'cafe', type: 'cafe', layout: 'fonda', size: [9, 8], label: 'Fonda' }, cafe_diner: { kind: 'cafe', type: 'cafe', layout: 'diner', origin: 'prewar', material: 'plaster', size: [12, 7], label: 'Diner (pre-war)' }, cafe_rooftop: { kind: 'cafe', type: 'cafe', layout: 'rooftop', size: [9, 8], floors: 2, label: 'Rooftop café' },
};
const WALLS = ['adobe', 'compound', 'block', 'brick', 'stone', 'stone_low', 'stone_ruin', 'herreria', 'ocotillo', 'wood', 'wood_old', 'pole', 'rail', 'wire', 'chainlink', 'chain', 'bollard', 'scrap', 'powerline', 'acequia'];
const WALL_LABEL = { bollard: 'bollards', herreria: 'ironwork fence (herrería)', wood: 'plank wall', wood_old: 'decayed plank wall', stone: 'stone wall', stone_low: 'dry-stone wall (low)', stone_ruin: 'ruined stone wall', brick: 'brick wall', powerline: 'power line', chainlink: 'chain-link fence', chain: 'post-and-chain barrier', acequia: 'acequia (irrigation ditch)' };
const TEX_FOR_PAINT = { busier: 'urban', quieter: 'sand', shrubland: 'scrub', dirt: 'dirt', packed: 'urban', gravel: 'gravel', sand: 'sand', tilled: 'tilled', cobble: 'cobble', concrete: 'concrete', rock: 'rock' };

// every tile: { key, label, tab, sub?, thumb? (render spec) | icon? (draw fn), act: { tool, ed?, opts? } }
function catalog() {
  const T = [];
  const add = (t) => T.push(t);
  // Roads
  for (const [k, v] of Object.entries(ROAD_TYPES)) add({ key: `road:${k}`, label: v.label, tab: 'Roads', icon: roadIcon(v), act: { tool: 'road', opts: { rtype: k, rwidth: v.width } } });
  for (const m of ['straight', 'curved', 'free']) add({ key: `rmode:${m}`, label: { straight: 'Straight mode', curved: 'Curved mode', free: 'Freeform mode' }[m], tab: 'Roads', icon: modeIcon(m), act: { tool: 'road', opts: { rmode: m } } });
  // Zones, grouped: plots first, then what a town is made of, then the land around it
  add({ key: 'zone:strip-built', label: 'Multiple Plots', tab: 'Zones', sub: 'Plots', icon: zoneIcon('multi'), act: { tool: 'zone', opts: { pfill: true } } });
  add({ key: 'zone:free', label: 'Singular Plot', tab: 'Zones', sub: 'Plots', icon: zoneIcon('single'), act: { tool: 'plotfree', opts: { zu: 'building', pfill: false } } });
  const Z = (k, l, c2, sub, shape = 'free') => add({ key: `zone:${k}`, label: l, tab: 'Zones', sub, icon: zoneIcon(k), act: { tool: 'plotfree', opts: { zu: k } } });
  Z('multifamily', 'Multi-Family', '#b49a7a', 'Plots');
  for (const [k, l, c2, sh] of [['plaza', 'Plaza', '#d8c8a8'], ['market', 'Market', '#c8a060', 'market'], ['trader', "Trader's compound (casa comercial)", '#9a8466'], ['visitors', "Visitors' grounds", '#b9a37a', 'visitors'], ['wayhouse', 'Hermandad wayhouse (Casa de Paso)', '#a8794a', 'visitors']]) Z(k, l, c2, 'Centre & trade', sh);
  for (const [k, l, c2] of [['cemetery', 'Cemetery (panteón)', '#b8a890'], ['lienzo', 'Charreada ring (lienzo charro)', '#c8a070'], ['mystic', 'Mystic (curandera / bruja / seer)', '#8a6a8a']]) Z(k, l, c2, 'Community');
  for (const [k, l, c2] of [['brickyard', 'Brickyard (adobera)', '#a88460'], ['salvage', 'Junkyard (car hulks)', '#8a7a6a'], ['acopio', 'Recycling yard (acopio)', '#7a8a6a']]) Z(k, l, c2, 'Work yards');
  for (const [k, l, c2] of [['outskirts', 'Outskirts (homestead)', '#b0a078'], ['outgrounds', 'Outskirt grounds', '#c0b48a']]) Z(k, l, c2, 'Outskirts');
  for (const [k, l] of [['slavers', 'Slaver camp'], ['caravan', 'Caravan staging yard'], ['chemden', 'Chem den (still)'], ['fightpit', 'Fighting pit'], ['scavmarket', 'Scavenger market'], ['cult', 'Cult compound']]) Z(k, l, '', 'Wasteland');
  add({ key: 'field:crop', label: 'Crop field (pick the crop in the options)', tab: 'Zones', sub: 'Farms', icon: zoneIcon('field'), act: { tool: 'field', opts: { fk: 'field' } } });
  add({ key: 'field:fallow', label: 'Fallow field', tab: 'Zones', sub: 'Farms', icon: zoneIcon('fallow'), act: { tool: 'field', opts: { fk: 'fallow' } } });
  add({ key: 'field:orchard', label: 'Orchard', tab: 'Zones', sub: 'Farms', icon: zoneIcon('orchard'), act: { tool: 'field', opts: { fk: 'orchard' } } });
  Z('vineyard', 'Vineyard', '#8a9a5a', 'Farms'); Z('farmers_market', "Farmers' market (tianguis)", '#b0985a', 'Farms'); Z('era', 'Threshing floor (era)', '#d0b878', 'Farms');
  add({ key: 'zone:farmstead', label: 'Farmstead (rancho)', tab: 'Zones', sub: 'Farms', icon: zoneIcon('farmstead'), act: { tool: 'plotfree', opts: { zu: 'farmstead' } } });
  add({ key: 'field:corral', label: 'Corral', tab: 'Zones', sub: 'Farms', icon: zoneIcon('corral'), act: { tool: 'field', opts: { fk: 'corral', ff: 'rail' } } });
  // Buildings, by what they're for
  const BSUB = (k, v) => v.sub || (/^(shack|auto|house)$/.test(k) ? 'Homes' : /^(guardpost|bunker|barracks|armory)$/.test(k) ? 'Military'
    : /^(shop|cantina|store_|trade_|cafe_|posada_)/.test(k) ? 'Trade & food' : /^(workshop|garage|warehouse|barn|granary|mill|bodega)$/.test(k) ? 'Work & farm'
    : /^(pemex|la_pemex)$/.test(k) ? 'Pre-war technical' : 'Civic & faith');
  for (const [k, v] of Object.entries(BUILD_SAMPLES)) add({ key: `bld:${k}`, label: v.label || L(k), tab: 'Buildings', sub: BSUB(k, v), icon: buildingIcon(buildingClass(k, v)), act: { tool: 'building', opts: { bk: v.kind || k, bl: v.layout || '', bc: '', bo: v.origin || '' } } });
  for (const [k, l, c, rt] of [['ruin', 'Ruin (collapsed)', 0.3, 'collapsed'], ['stripped', 'Stripped shell', 0.3, 'stripped'], ['ruin_rubble', 'Rubble ruin', 0.14, 'collapsed'], ['foundation', 'Foundations', 0.02, 'collapsed'], ['derelict', 'Derelict', 0.44, 'collapsed']]) add({ key: `ruin:${k}`, label: l, tab: 'Buildings', sub: 'Ruins', icon: buildingIcon({ ruin: 'ruin', stripped: 'shell', ruin_rubble: 'rubble', foundation: 'found', derelict: 'derelict' }[k]), act: { tool: 'building', opts: { bk: 'auto', bc: String(c), bo: 'prewar', brt: rt } } });
  // Signs (the sign tool)
  for (const [k, l] of [['painted', 'Sign · hand-painted'], ['printed', 'Sign · printed'], ['neon', 'Sign · neon']]) add({ key: `sign:${k}`, label: l, tab: 'Props', sub: 'Signs', thumb: { kind: 'prop', type: 'custom_sign', opts: { text: k === 'neon' ? 'BAR' : 'TACOS', kind: k, size: 'M' } }, act: { tool: 'sign', opts: { skind: k } } });
  // Walls
  for (const [k, l] of [['wood', 'Gate (wood)'], ['metal', 'Gate (metal)'], ['chainlink', 'Gate (chain-link)'], ['scrap', 'Gate (scrap)'], ['none', 'Gap in wall']]) add({ key: `gate:${k}`, label: l, tab: 'Walls', sub: 'Gates', icon: gateIcon(k), act: { tool: 'gate', opts: { gl: k } } });
  for (const w of WALLS) add({ key: `wall:${w}`, label: WALL_LABEL[w] || L(w), tab: 'Walls', thumb: { kind: 'wall', type: w }, act: { tool: 'wall', opts: { wt: w } } });
  // Props
  const known = new Set([...PROP_TYPES, ...Object.keys(MODEL_PROPS)].filter((t) => WATER || !WATER_PROPS.includes(t)));
  const seen = new Set();
  for (const [g, list] of Object.entries(PROP_GROUPS)) for (const t of list) if (known.has(t)) { seen.add(t); add({ key: `prop:${g}:${t}`, id: `prop:${t}`, label: L(t), tab: 'Props', sub: g, thumb: { kind: 'prop', type: t }, act: { tool: 'prop', ed: { prop: t } } }); }
  seen.add('custom_sign');
  for (const t of known) if (!seen.has(t)) add({ key: `prop:Other:${t}`, id: `prop:${t}`, label: L(t), tab: 'Props', sub: 'Other', thumb: { kind: 'prop', type: t }, act: { tool: 'prop', ed: { prop: t } } });
  for (const [k, v] of Object.entries(SCATTER_SETS)) add({ key: `scatter:${k}`, label: `Scatter · ${v.label}`, tab: 'Props', sub: 'Scatter brush', thumb: { kind: 'prop', type: Object.keys(v.mix)[0] }, act: { tool: 'scatter', ed: { scatter: k } } });
  // Water: springs and streams, the sources, the ditches (parked for now: see water.js WATER)
  if (WATER) {
  add({ key: 'water:spring', id: 'prop:spring', label: 'Spring (ojo de agua) + stream', tab: 'Water', sub: 'Springs & streams', thumb: { kind: 'prop', type: 'spring' }, act: { tool: 'prop', ed: { prop: 'spring' } } });
  add({ key: 'water:stream', label: 'Stream (draw, flows downhill)', tab: 'Water', sub: 'Springs & streams', thumb: { kind: 'wall', type: 'stream' }, act: { tool: 'wall', opts: { wt: 'stream' } } });
  add({ key: 'water:acequia', label: 'Acequia (draw from the source, downhill)', tab: 'Water', sub: 'Irrigation', thumb: { kind: 'wall', type: 'acequia' }, act: { tool: 'wall', opts: { wt: 'acequia' } } });
  for (const [t, l] of [['windmill', 'Windmill pump (papalote)'], ['well', 'Well'], ['noria', 'Noria (animal wheel)'], ['hand_pump', 'Hand pump'], ['motor_pump', 'Motor pump'], ['bordo', 'Bordo (earth dam)'], ['tanque', 'Tanque (head tank)'], ['water_tank', 'Water tank'], ['pond', 'Stock pond (jagüey)'], ['cistern', 'Cistern'], ['pila', 'Pila'], ['trough', 'Trough']])
    if (known.has(t)) add({ key: `water:${t}`, id: `prop:${t}`, label: l, tab: 'Water', sub: ['pila', 'trough', 'cistern'].includes(t) ? 'Storage' : 'Sources', thumb: { kind: 'prop', type: t }, act: { tool: 'prop', ed: { prop: t } } });
  }
  // Plants
  for (const [k, l] of [['mix', 'Biome mix'], ['shrubs', 'Shrubs'], ['trees', 'Trees'], ['palms', 'Palms'], ['cactus', 'Cactus'], ['grass', 'Grass']]) add({ key: `plants:${k}`, label: `Brush · ${l}`, tab: 'Plants', sub: 'Brushes', thumb: { kind: 'plant', type: { mix: 'sage', shrubs: 'encelia', trees: 'pepper_tree', palms: 'fan_palm', cactus: 'nopal', grass: 'grass' }[k] }, act: { tool: 'plant', ed: { plants: k } } });
  const species = SPECIES.filter((x) => !['corn', 'beans', 'squash', 'chili', 'maguey', 'vine'].includes(x));
  for (const sp of species) add({ key: `plant:${sp}`, label: L(sp), tab: 'Plants', sub: 'Single plants', thumb: { kind: 'plant', type: sp }, act: { tool: 'plant', ed: { plants: `sp:${sp}` }, opts: { ts: sp } } });
  for (const sp of ['eucalyptus', 'tamarisk', 'fan_palm', 'date_palm', 'pepper_tree', 'fruit_tree']) add({ key: `row:${sp}`, label: `Tree row · ${L(sp)}`, tab: 'Plants', sub: 'Tree rows', thumb: { kind: 'plant', type: sp }, act: { tool: 'row', opts: { ts: sp } } });
  add({ key: 'erase', label: 'Clear plants', tab: 'Plants', sub: 'Brushes', icon: terrIcon('erase'), act: { tool: 'erase' } });
  // Terrain
  for (const [k, l] of [['drystone', 'Retaining wall · dry stone'], ['concrete', 'Retaining wall · concrete'], ['adobe', 'Retaining wall · adobe'], ['block', 'Retaining wall · cinder block'], ['gabion', 'Retaining wall · gabion']]) add({ key: `retain:${k}`, label: l, tab: 'Terrain', sub: 'Retaining walls', icon: retainIcon(k), act: { tool: 'retain', opts: { rt: k } } });
  for (const [k, l, ch] of [['raise', 'Raise', '▲'], ['lower', 'Lower', '▼'], ['flatten', 'Flatten', '▬'], ['smooth', 'Smooth', '∿']]) add({ key: `terr:${k}`, label: l, tab: 'Terrain', sub: 'Shape', icon: terrIcon(k), act: { tool: k } });
  for (const [k, v] of Object.entries(GROUND_PAINTS)) add({ key: `paint:${k}`, label: v.label, tab: 'Terrain', sub: 'Ground paint', icon: v.activity ? activityIcon(k === 'busier') : texIcon(window.MAPGEN_TEXTURES?.[TEX_FOR_PAINT[k]]), act: { tool: 'paint', ed: { paint: k } } });
  return T;
}

// ---------------------------------------------------------------- UI
const TAB_ICON = {
  Recent: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2"/>',
  Roads: '<path d="M4 15 L7 1 M12 15 L9 1"/>',
  Zones: '<rect x="2" y="3" width="12" height="10"/><path d="M6 3v10M10 3v10"/>',
  Buildings: '<path d="M2 8 L8 3 L14 8 V14 H2 Z"/>',
  Walls: '<path d="M2 5v9M8 5v9M14 5v9M2 8h12M2 12h12"/>',
  Props: '<rect x="4" y="3" width="8" height="11" rx="2"/><path d="M4 7h8M4 10h8"/>',
  Water: '<path d="M8 2 C4 8 4 10 4 11 a4 4 0 0 0 8 0 c0-1 0-3-4-9z"/>',
  Plants: '<circle cx="8" cy="6" r="4"/><path d="M8 10v5"/>',
  Terrain: '<path d="M1 14 L6 6 L9 10 L11 7 L15 14 Z"/>',
};
export function initBuildMenu({ stage, ed, $ }) {
  const items = catalog();
  const TABS = ['Recent', 'Roads', 'Zones', 'Buildings', 'Walls', 'Props', ...(WATER ? ['Water'] : []), 'Plants', 'Terrain'];
  let tab = 'Roads', query = '', current = null;
  const SUBTABS = new Set(['Buildings', 'Props', 'Zones']), subOf = {}; // long tabs: one group at a time, picked from a sub-tab row
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('baja-mapgen:recent') || '[]'); } catch {}
  const bar = document.createElement('div');
  bar.id = 'bm';
  bar.innerHTML = `<div class="bm-in"><div class="bm-subs"></div><div class="bm-strip"></div><div class="bm-top"><div class="bm-tabs">${TABS.map((t, i) => `<button data-t="${t}" title="${t}${i ? ` (${i})` : ' (0)'}"><svg viewBox="0 0 16 16">${TAB_ICON[t] || ''}</svg>${t}<i class="kn">${i}</i></button>`).join('')}</div>
    <input id="bm-q" placeholder="> search  ( / )"></div></div>`;
  document.body.appendChild(bar);
  const strip = bar.querySelector('.bm-strip'), subs = bar.querySelector('.bm-subs');
  const tile = (it) => {
    const b = document.createElement('button');
    b.className = 'bm-tile' + (current === it.key ? ' on' : '');
    b.title = it.label;
    b.innerHTML = `<span class="im"></span><span class="lb">${it.label}</span>`;
    const im = b.firstChild;
    const set = (url) => { if (url) im.style.backgroundImage = `url(${url})`; else im.classList.add('none'); };
    if (it.thumb) thumb(stage.renderer, { key: [it.thumb.kind, it.thumb.type, it.thumb.shape, it.thumb.layout, it.thumb.origin, it.thumb.ruinType, it.thumb.condition].filter((x) => x != null).join(':'), ...it.thumb }, set);
    else if (it.icon?.lazy) { if (it._url) set(it._url); else it.icon.lazy((u) => { it._url = u; set(u); }); }
    else set(it.icon);
    b.onclick = () => {
      current = it.key;
      ed.choose(it);
      recent = [it.key, ...recent.filter((k) => k !== it.key)].slice(0, 24);
      try { localStorage.setItem('baja-mapgen:recent', JSON.stringify(recent)); } catch {}
      strip.querySelectorAll('.bm-tile').forEach((x) => x.classList.toggle('on', x === b));
    };
    return b;
  };
  // the strip: one row of groups, each with a small header over its tiles
  function render() {
    bar.querySelectorAll('.bm-tabs button').forEach((b) => b.classList.toggle('on', !query && b.dataset.t === tab));
    let groups = [];
    const seen = new Set();
    const push = (name, it) => { const id = it.id || it.key; if (seen.has(id)) return; seen.add(id); let g = groups.find((q) => q.name === name); if (!g) groups.push((g = { name, list: [] })); g.list.push(it); };
    if (query) { const q = query.toLowerCase(); for (const it of items) if (it.label.toLowerCase().includes(q) || it.key.includes(q)) push(it.tab, it); }
    else if (tab === 'Recent') for (const k of recent) { const it = items.find((x) => x.key === k); if (it) push('Recent', it); }
    else for (const it of items) if (it.tab === tab) push(it.sub || tab, it);
    subs.innerHTML = '';
    if (!query && SUBTABS.has(tab) && groups.length > 1) {
      const names = groups.map((g) => g.name), cur = names.includes(subOf[tab]) ? subOf[tab] : names[0];
      subs.innerHTML = names.map((n) => `<button data-s="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`).join('');
      subs.querySelectorAll('button').forEach((b) => (b.onclick = () => { subOf[tab] = b.dataset.s; render(); }));
      groups = groups.filter((g) => g.name === cur);
    }
    strip.innerHTML = '';
    if (!groups.length) { strip.innerHTML = `<span class="bm-empty">${query ? 'nothing matches' : 'nothing yet — tiles you use land here'}</span>`; return; }
    for (const g of groups) {
      const el = document.createElement('div'); el.className = 'ig';
      el.innerHTML = `<div class="h">${g.name}</div><div class="tiles"></div>`;
      const ts = el.lastChild; for (const it of g.list) ts.appendChild(tile(it));
      strip.appendChild(el);
    }
    strip.scrollLeft = 0;
  }
  bar.querySelectorAll('.bm-tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; query = ''; $('#bm-q').value = ''; render(); }));
  $('#bm-q').oninput = (e) => { query = e.target.value.trim(); render(); };
  $('#bm-q').onkeydown = (e) => { if (e.key === 'Escape') { e.target.value = ''; query = ''; e.target.blur(); render(); } e.stopPropagation(); };
  strip.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  window.addEventListener('keydown', (e) => { if (e.key === '/' && ed.on && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#bm-q').focus(); } });
  render();
  return {
    show(on) { bar.classList.toggle('open', on); document.body.classList.toggle('building', on); if (on) render(); },
    // number keys: 1… the tabs in order (0 = Recent); the tab's last-used tile (else its first) becomes the tool
    pickTab(n) {
      const t = TABS[n]; if (!t) return false;
      tab = t; query = ''; $('#bm-q').value = ''; render();
      const last = recent.map((k) => items.find((it) => it.key === k)).find((it) => it && (t === 'Recent' || it.tab === t));
      const b = last ? [...strip.querySelectorAll('.bm-tile')].find((x) => x.title === last.label) : strip.querySelector('.bm-tile');
      b?.click(); return true;
    },
    toolChanged(t) { if (t === 'select') { current = null; strip.querySelectorAll('.bm-tile.on').forEach((x) => x.classList.remove('on')); } },
  };
}

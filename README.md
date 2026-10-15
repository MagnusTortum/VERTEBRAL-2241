# VERTEBRAL

A procedural city painter set in post-post-apocalyptic Baja California, Mexico (2241). It has textured low-poly geometry, baked lighting, and time-of-day presets. You can open `index.html` straight from disk; it doesn't need a server.

## Use

- Mouse: drag to orbit, right-drag to pan, wheel to zoom. Click anything to select it.
- Keys: Q / E rotate the view 90°, R resets the view, L toggles labels, Esc deselects. **WASD** (or arrows) pans the view; Shift makes it faster.
- **Free cam** (F): a perspective street-level camera with an **FOV** slider.
  - Drag to look, WASD to move, E/Space up, Q/C down, Shift for speed.
  - The wheel moves forward/back and right-drag strafes. Reset or F returns to the iso view.
- **Time of day**: Morning, Noon, Afternoon, Sunset, Twilight, Night or Dead of Night. Ambient light, AO and lamps are baked once per preset and cached, so the first switch to each one takes a moment. Sun shadows are per-pixel (a shadow map rendered on each switch).
  - Night lights come from lamps, fires, neon and inhabited windows. Electric lights only work where there's power (`settlement.power`, or `light: {on: true}`).
  - Dead of Night keeps only essential lights on (gate lanterns, spotlights, powered vending machines), plus a few insomniac windows.
- **Look**: separate toggles for Low-res (pixel upscale), Dither and Grade (slight desaturated warm grade). **LUT** loads a `.cube` file; it's remembered, and ✕ removes it.
- **Seed**: rerolls the procedural detail (vegetation, damage, finishes rolls, auto-placement, window and door layout).
- **Stat block**: select a building, prop or field. It shows Owner, Occupants, Condition, GM notes, Finish and Grounds (the yard / roof garden it rolled), plus an expandable **What's in stock** for anyone selling.
  - **Reroll stats** or **Rewrite as…** builds a request. Copy it, send it to Claude in chat, then paste the reply back with **Paste result**.
  - The browser autosaves only the map you're working on. Every other map is a file in `saves/`.
- **Load / Paste**: paste a whole place spec (JSON) or a patch (`{"id": ..., ...}`, an array of patches, or `{"patches": [...]}`). You can also drag a `.json` file onto the window.
- **Export spec**: downloads the current spec as JSON. **PNG** saves the current view.

## Maps are files

There is no place list. Maps live as `.json` files in `saves/`: open one with **Open** (builder panel) or **Load / Paste**, and save with **Save** (Ctrl+S) or **Export spec**. The browser autosaves only the map you're working on.

Maps kept in the browser from older versions are moved aside on start. **Load / Paste** offers to download them as files.

## Your own textures

1. Put `<layer>.png` or `.jpg` files in `textures/`. Layer names are listed in `textures/_pack.js`.
2. Run `node pack-textures.mjs`, or ask Claude to pack them.

Each image replaces that procedural layer. Brightness is normalised and the vertex colour still tints it. Tileable images of about 256–512 px work best.

## Rebuild the engine (only after editing `src/`)

`npm install && node build.mjs` writes `app.js` and `index.html` next to `build.mjs`, and writes the authored places in `src/places/` as `saves/<key>.json`.

---

## Spec reference

Units are metres. The map is centred on 0,0. **North = −Z**, **east = +X**. `rot` is in degrees about the vertical axis, and an object's front is its local +Z. Anywhere `rot` is accepted, you can use `face` instead: a road id, a structure id, or `[x, z]`.

```js
{
  name, region, description, context,   // context is included in stat requests to Claude
  seed, size: [W, D], biome,            // biome: coastal_desert | desert | scrubland | valley | sierra
  mode,                                 // label only: hybrid | ruins | ground_up ...
  settlement: { tl: 5, wealth: 'struggling', appearance: 0, power: 'scarce',
                core: [x, z], radius: 60, density: 0.8,          // density field: dense core, falling off with distance
                spine: 'bypass' | 'main',                        // arterial skirts the town, or doubles as its main street
                plaza: true | { at, r, well, name }, market: true | { count, fill },
                wall: false | 'adobe' | 'stone' | 'block' | 'scrap', wallHeight, wallMargin },
                                        // City Stats. wealth: dead_broke|poor|struggling|average|comfortable|wealthy|very_wealthy|filthy_rich
                                        // appearance: reaction modifier (B21 scale); power: none|scarce|some|grid (odds electric lights work)
  frames: { compound: { origin: [x, z], road: 'spine' | angle: deg, offset } },
                                        // shared grain: any item with frame: 'compound' gives at/path/poly/rot in that frame
  snap, snapAngle: 16, snapAuto: 7, snapRange: 16,   // neighbour angle snapping for face/auto-placed buildings
  view: { target: [x, z], zoom, az },
  terrain: { relief, scale, cell, features: [
    { type: 'hill', at, radius, height } | { type: 'mesa', at, radius, height }
    | { type: 'ridge', path, width, height } | { type: 'arroyo', path, width, depth }
    | { type: 'tilt', dir /*compass deg*/, amount /*m per 100 m*/ } ] },
  water: { level },                     // optional sea/lake plane
  roads: [{ id, name, type, class, path, width, condition /*0-1*/, lines }],
                                        // type: highway | paved | street | dirt | lane | alley | track | path
                                        // class (hierarchy): arterial | main | street | lane | track — defaults from type
                                        // (highway→arterial, paved→main, street/dirt→street, lane/alley/path→lane, track→track)
  structures: [ STRUCTURE ],
  auto: [ AUTO ],                       // procedural placement
  walls: [{ id, type, path, closed, height, condition, gates: [{ at /*0-1 of length*/ | s /*m*/, width, leaf, track }] }],
                                        // a gate with no road near it gets an access track to the nearest road (track: false to skip)
                                        // type: stone_low | stone | adobe | block | concrete | pole | rail | wire | ocotillo | picket | scrap
  fields: [{ id, name, type, poly, crop, rows_dir, fence, gates, animals: { brahmin: 4 }, stats }],
                                        // type: garden | field | orchard | vineyard | corral | yard | plaza | graveyard
                                        // crop: mixed | corn | beans | chili | squash | maguey | nopal
  props: [ PROP ],
  camps: [{ id, type: 'caravan' | 'travellers', at, rot, radius, name, stats, wagons, brahmin, tents }],
  markets: [{ id, at, r, count, fill, axis /*rows along this bearing*/, length, aisle }],
  scatter: [ SCATTER ],
  clearings: [{ at, r, paint }],        // keep vegetation out
  paint: [{ poly | path | at, r, width, color }],   // colour: dirt | yard | packed | tilled | irrigated | wet | ash | sand | gravel | oil | 0xRRGGBB
  vegetation: { density, scale, mix: { species: weight }, groves: [{ at, radius, count, species }], plants: [{ species, at, scale }] },
  overrides: { id: { ...patch } }       // patches for auto-placed things (written by the tool)
}
```

**STRUCTURE**
```js
{ id, name, kind, at: [x, z], rot | face, size: [w, d], shape, floors, floorH,
  material, oldMaterial, newMaterial, origin, condition,
  roof, roofMat, ridge: 'x'|'z', pitch, porch: true | { side, depth, roof, length }, awning,
  extras: [...], sign: 'TEXT' | { text, style, offset, y }, masses: [{ x, z, w, d, rot, floors, roof }], stats,
  finish: 'none'|'wash'|'painted'|'decorated'|'showpiece' | { tier, body, trim, band, border, wainscot, mural: { kind, side } },
  importance: 0-1, lantern: true|false, light: 'forge' | { at: [x,y,z], color, radius, intensity, essential, electric }, inhabited }
```
- kind: house, shop, cantina, workshop, garage, warehouse, barn, shelter, chapel, shed, outhouse, office, hall, tower, kiosk, ruin, canopy (gas station: `sag: { corner, drop }`, `fascia`, `stripe`)
- shape: rect, L, T, U, courtyard (`flip` mirrors L; `wing` sets wing width)
- material: adobe, plaster, stone, brick, concrete, block, timber, metal
- origin (Roman-provinces model):
  - `new`
  - `maintained`: pre-war, kept up
  - `repurposed`: pre-war with bricked or boarded openings and additions
  - `rebuilt`: ragged pre-war lower courses with new material above
  - `built_on_ruin`: pre-war ground floor with a new storey on top
  - `ruin`: partly collapsed
  - `stripped`: shell or foundation only
- roof: flat, shed, gable, hip, palapa, collapsed, skeleton, none
- roofMat: flat_adobe, slab, corrugated, tile, shingle, thatch
- porch roof: thatch, latilla, corrugated
- extras: tinaco, solar `{type: 'solar', count}`, chimney, antenna, stairs, ac, dish, awning, porch, water_drums, scaffold, lean_to
- stats: `{ owner, occupants: [], condition, gm_notes: [], stock: [{ item, price, qty, ref, notes }] }`
- surround: the ground around the building. Auto-placed buildings roll one; an authored building opts in with `surround: true` or a recipe name, and `false` turns it off.
  - Recipes: garden, homework, workyard, storage, pen, patio, bare, waystation, graveyard, field, butcher, smith, tanner, farmer, healer, potter, carpenter, brewer, trader.
  - Keyed buildings follow the owner's trade, read from `trade`, `stats.owner`, `name` or GM notes (e.g. a butcher gets a slaughter yard).
  - Yards take free ground behind the building, or beside it. Fences skip edges a neighbour already fenced.
  - With no room, a flat-roofed building gets a roof garden, rooftop storage or a roof terrace.
- party: `['left', 'right']` marks shared walls in a row (no openings). The town planner sets it.
- stairs (extra): a solid masonry flight on whichever outer wall fits. It avoids other wings and party walls, and falls back to a ladder.
- finish: rolled per building from settlement Wealth/TL/Appearance and building importance unless set. Tiers are wash (limewash), painted (colour + trim + base band), decorated (adds border, window surrounds, sometimes azulejo wainscot), showpiece (adds a mural: landscape | geometric | sea | saint).

**AUTO**
```js
{ id, type: 'town', roads /*ids, default all*/, density /*multiplier*/, placement: 'auto'|'attached'|'separate', kinds: { main: {...}, street: {...} },
  origins, materials, outskirts /*0-1*/, camps: false, spread }
  // walks every road by class (main first). Density = settlement field × class weight:
  //   > 0.62 attached rows (touching, fronts aligned, party walls, flat roofs) · > 0.38 tight lots · > 0.16 separate lots · else sparse
  // main: shops, cantinas, 2–3 floors · street: houses + some shops · lane: small houses, sheds · arterial: services only near the
  // junction (bypass) · track: farms. Caravan yard + travellers' camp placed by the arterial automatically.
{ id, type: 'frontage', road, from, to, side: 'both'|'left'|'right', setback: [a, b], gap: [a, b], jitter, count,
  kinds: { house: 5, shop: 1 }, materials: {...}, origins: {...}, floors: { "1": 4, "2": 1 }, shapes: {...},
  porch: 0.3, extras: { tinaco: 0.5 }, size: { house: { w: [7, 12], d: [6, 9] } } }
{ id, type: 'cluster', at, radius, count, axis /*deg: old street grid*/ | (omit = face centre), jitter, pad, ...same pickers }
```

**PROP**: `{ id?, name?, type, at | in: structureId + local: [x, z] + y, rot | face, frame?, label: false, stats?, light?: false | { on, essential }, essential?, ...options }`
- light props: street_lamp, neon_sign (text, color: red|blue|green|pink|yellow), spotlight_tower, lantern (electric), torch, firepit, vending_machine
- temporary: tent_aframe, tent_wall, tent_bell, lean_to, bedroll, wagon (cover, sign), hitching_rail, stall (goods), tarp_stall, cart_shop, shade_cloth, goods
  - goods: produce | pottery | cloth | scrap | water | meat | ammo | tools | sacks | mixed
- trade / yard: meat_rack, hide_frame, drying_rack, forge (lit), tan_pit, kiln, lumber, planter, chickens, chicken_coop
- Ground: props that lie on the ground (vehicles, carts, crates, tents...) tilt to the slope; upright ones are sunk to the lowest ground under them (`seat: false` to skip).
  - Props are pushed out of building footprints/porches and out of doorways and gates (`keep: true` to pin one).
- types: well (pump, repair, roof), hand_pump, trough (length), cistern, water_tower (text), windmill (broken), vending_machine (color, lit), solar_panel (count), car_wreck (burned, wheels, hoodOpen, color), truck_chassis (cab, missingWheels), engine_block, workbench, barrel (count, tipped), crates, tires, scrap_pile, rubble, rocks, bench, table (chairs, umbrella), laundry_line, firepit, cart (load), brahmin, sign (text, width, height, post, style: painted|prewar|metal), billboard (text, torn), utility_pole, street_lamp, gas_pump (stripped), shrine, cross (grave), km_marker (text), generator, radio_mast, haystack, woodpile, tarp_tent, bones, ramada, corral_gate

**SCATTER**
```js
{ type, along: roadId, count, offset: [a, b], range: [0, 1], side, vary: { burned: 0.3 }, opts: {...} }
{ type: 'utility_pole', along, every, offset, side, wires: true, fallen: 0.15 }
{ type, count, area: poly | near: [x, z], radius }
```

**Species**: creosote, sage, encelia, agave, agave_bloom, cholla, cardon, datilillo, elephant_tree, palo_verde, mesquite, pepper_tree, fan_palm, date_palm, fruit_tree, nopal, ocotillo, grass, tumbleweed, rock, boulder, plus the crops corn, beans, squash, chili, maguey, vine

## Parcels (polygon lots + farmland)
`auto: [{ type: 'town' }]` now lays the town out as ONE tiling of polygons (src/parcels.js) — no dead space:
- every cell (1 m raster) belongs to its nearest road edge (road half-width + sidewalk / `frontage` apron),
  minus a class bonus (`main` 22, `arterial` 14, `street` 0, `lane` −3, `track` −6; per road `priority`,
  grid `priority: [u, v]`) so main-street lots run full depth and side-street corner lots start behind them;
- each road side is cut into lot frontages by density (attached / tight / separate / sparse); cuts stop at
  cross streets (slivers join the previous lot); lots behind a block meet back-to-back;
- enclosed leftovers → lots grow into them, the rest become interior parcels (garden, orchard, corral, yard);
- open ground reaching the map edge → `farmland: { frame, cell: [[w0,w1],[d0,d1]], mix, crops }` fields;
- authored buildings take over (merge) the lots under them; `areas` are reserved rects;
- boundaries are traced once and shared: every lot line gets ONE fence/wall (planParcelFences), chosen by the
  stronger claim of the two sides (compound > row-house wall > yard fence > interior > farm), cut where it
  meets a building, and never across the face of a house close to the street (gates at doors / yard gaps).
`lots: 'rect'` keeps the old rectangle planner. Road `frontage: m` = packed-dirt apron (MEX-1 through SQ).

## Build mode (map builder, phase 1)
Press **B** (or the Build button). Left mouse = tools · middle-drag orbit · right-drag pan · wheel zoom.
- **New map**: size, biome, hilliness, hills / mesas / arroyos / coast, vegetation density, seed → a fresh plot of land.
- **Select (V)**: click to select, drag the selected item to move it, R / Shift+R rotate 15°, Del delete.
  Items written in a local frame or facing a road become plain world coordinates once edited.
- **Raise / Lower / Flatten / Smooth (1–4)**: sculpt; stored in `terrain.delta` (1 m grid, Int16 cm, base64).
- **Paint (5)**: ground brush (shrubland, dirt, packed, gravel, sand, tilled, cobble, concrete, rock) → `paint[]`.
- **Plant (6)** / **Clear (7)**: add plants (biome mix, sets or one species) → `vegetation.plants[]`; clear → `vegetation.erase[]`.
  Generated vegetation uses one random stream per 2.4 m cell, so edits never reshuffle plants elsewhere;
  anything solid (buildings, roads, fields) clears what grows under it, and moving it brings it back.
- **Prop (8)**: click to place the chosen prop (R turns the next one).
- **Undo / redo**: Ctrl+Z / Ctrl+Shift+Z (60 steps). Every edit saves to the browser and rebuilds when you pause.
- `[` `]` brush size. Buildings also take `shape: 'H'` and `'stepped'` now (plus rect, L, T, U, courtyard).

## Build mode, phase 2
- **Edits apply in place.** Only what changed is rebuilt (object, ground under it, blockers, ground paint,
  vegetation patch) and only that region is re-lit; other times of day re-bake when picked. Full rebuild
  only on load, time-of-day change, or changes the builder can't localise (auto-planned towns, grids).
- **Road (N)**: Straight (click points), Curved (start, bend, end), Freeform (drag). Shift snaps to 15°;
  points snap to road ends / centrelines and a road that reaches another one finishes there.
  Enter / double-click / right-click finishes, Esc cancels. Types: asphalt highway, asphalt street,
  gravel street (new), dirt road, track, footpath; width editable.
- **Plots (P)**: drag along a road → a row of straight-sided plots on that side (width, depth, fence style;
  "build on them" fills them). Plots stop short of other roads and plots. Fences follow plot lines:
  one per shared line (stronger style wins), street gate, cut at buildings. Moving a plot moves its building.
- **Building (H)**: click a plot → a generated building (kind, shape rect/L/T/U/H/stepped/courtyard, floors,
  material, origin, roof, porch) at the street front. Front: row (touching, party walls) / tight / set back.
  Selected building: Reroll look, New building, kind / shape / floors.
- **Wall (K)**: click points; click the first point to close. **Tree row (T)**: start, end, spacing, species.
- Select also picks roads, walls and plots (click on them) — move, rotate, delete, change type.

## Build mode, phase 2.5
- **Build menu** (bottom bar, RTS style): tabs Recent · Roads · Zones · Buildings · Walls · Props · Plants · Terrain,
  sub-tabs (props: containers, vehicles & wrecks, furniture, market & trades, farm & animals, camp, security,
  lights & signs, junk & ruins, plants in pots, scatter brush), thumbnails rendered from the real models,
  search ( / ), Recent. A tile picks the tool and its options; the left panel shows the options.
- **Editing shapes** (Select a road / wall / plot / field): drag the yellow handles; double-click the path to
  add a point; right-click a handle to remove it; Shift-click a road's middle point to split the road.
  Dragging a road (or its points) slides the plots laid along it, buildings included. Dragged plot
  corners make the plot freehand (`custom`).
- **Junctions**: where roads cross or meet, paved roads get an asphalt pad (no line paint across),
  unpaved ones blend into a rounded patch.
- **Plots**: Split / Merge (neighbour along the road), Use: building · empty · field · fallow · orchard ·
  corral · visitors (walled grounds: corral, well, ramada, wagons, tents, storage, gate hut) · market
  (stall rows, water, makeshift workshops). Freehand plot (Y): click 4 corners, first two = street front.
- **Fields** (G): click points, close on the first; crop / fallow / orchard / corral, optional fence.
- **Scatter brush** (9): junk, rubble, barrels & crates, camp litter, farm yard, bones & wreckage.
- **Names & stats**: select anything you built → name, owner, occupants, condition, GM notes, label on/off.
  Applies instantly (no rebuild). Parts of bigger things (market stalls…) stay unlabelled.
- **Files**: Save (Ctrl+S) downloads the map as JSON; Open loads one; automatic backup every 2 min
  (Backup… restores it). Warns when browser storage is full.

## Build mode, batch 3
- **Buildings:** the panel has Material, Finish, Origin, a **Condition** slider (bare foundations → rubble ruin → ruin → derelict → worn → kept → pristine), Roof (flat with parapet, latilla / mud, shed, gable tile / tin / shingle, hip tile / tin, none) and Heights (uniform / mixed). With mixed heights, the lower wings become roof terraces with a parapet or railing, sometimes a shade (latilla, tin or cloth) and outside stairs. Doors can be plank, panel or metal. Windows get sills, mullions, iron grilles, shutters (open or closed), curtains and tinted glass. **Ruins** are under Buildings ▸ Ruins.
- **Building tool (H):** shows a ghost of the building under the cursor. On a plot it previews the plot's building. On open ground it snaps its front to a road edge (offset slider, or the **wheel** while snapped) or backs onto a plot line. **Alt** turns snapping off.
- **Rotation:** tap R (Shift+R) to turn by 15°. Hold **R + mouse wheel** to turn freely (Shift for 1° steps), for the selection or the next prop / building.
- **Plot block (U)** ("Plots + buildings" / "Plot block" tiles): draw any polygon (corners snap to road edges, plot corners and plot edges; corners on the same road edge follow the curve). It is cut into plots along every road it touches, with corners going to the longer frontage. Double-click or Enter finishes.
- **Plot (free) (Y):** any number of corners; double-click, Enter or clicking the first point finishes. The edge along a road (else the first edge) is the street front. Visitors' grounds and markets drawn this way stay polygonal: the wall follows the polygon, the gate sits mid-street-edge and the contents are clipped to it.
- **Gates (J):** click any hand-drawn wall, field fence or plot fence to add a gate (width; wood, metal or open gap). Click an existing gate to remove it.
- **Retaining walls (X):** click along the wall. Choose the type (dry stone, concrete, adobe, cinder block, gabion), the high side (left or right of the drawing direction), the rise in metres or *match ground*, the terrace depth, cap and railing. The ground on the high side becomes a flat terrace. Closing the outline makes a raised platform with steps on its longest side. All of these can be edited from the panel ("Flip high side", etc.).
- **Roads:**
  - A new road takes the bed height of the road it joins (or crosses) and eases back to its own grade over about 20 m.
  - Arroyo crossings are picked automatically:
    - asphalt / highway: the road keeps its level on an embankment with concrete headwalls, box culverts, wing walls and guard rails;
    - gravel / dirt: a pipe culvert if the arroyo is deeper than 1.6 m, otherwise a concrete ford through the channel;
    - track / path: a timber bridge with the channel left open beneath it.
- **Flat zones:** visitors' grounds and markets level the ground about 90% toward their mean height, with a 4 m earth ramp.
- **Orchards** are planted denser (about 3.7 m).
- **Look:** a **Shades** button (sunglasses for the noon glare: about half a stop darker, with a warm amber filter). Sun shadows no longer streak on lit walls. Surface textures are slightly stronger.

## Build mode, batch 4
- **Architecture:**
  - Origin is now *New build (Baja vernacular)*, *Pre-war*, or *Pre-war base + new build* (with a new-build share slider). Old origin values still load.
  - Pre-war buildings can have adaptations: bricked/boarded openings, scrap lean-tos, a new tin roof.
  - Ruins come in two types: **collapsed** (fallen roofs, rubble) and **stripped** (walls standing, blocks taken course by course, nothing left inside, little rubble).
  - Vernacular **Style**:
    - *adobe*: buttresses, battered base, vigas, vent slots, sometimes a raised shade roof;
    - *rounded stucco*: rounded corners, porthole windows, bullnose parapet;
    - *casona*: two-storey stucco with a stone base course, arched ground floor, louvred shutters, a wooden balcony and a tile hip roof with rafter tails.
  - Pre-war buildings are retro-futurist: streamline rounded corners, speed lines, a cantilevered roof slab, ribbon windows, glass block, metal frames, sign fins and faded pastel paint.
- **Finish tiers:** bare, whitewashed, painted, decorated (simple), decorated (maximalist), showpiece.
  - Decorated adds potted plants, a tiled door surround, lanterns and panel doors.
  - Maximalist adds colourful openings, flower boxes, bougainvillea, papel picado, string lights, a bench and often a mural.
  - Showpiece adds an arched stone door surround, balconies, a cornice, lantern posts, glazed pots and a flag.
- **Signs** on businesses: painted on the wall, a board, a salvaged pre-war sign (letters missing), a roof board, neon (on the fin when there is one), ABIERTO plaques and chalkboard menus. Text is placeholder Spanish; set `signText` / `signType` on a structure to override it.
- **New building kinds:**
  - **shack** (salvaged hut);
  - **security**: guard post, bunker, barracks, armory, with thick concrete, gun slits with steel shutters, a crenellated sandbagged parapet with wire, a door hood, sandbag blast walls, a roof lookout and a searchlight.
- **Building size:** with a building selected, drag one of its four side handles to move that side (the opposite side stays put). W × D can also be typed in the panel.
- **Raised (m):** lifts the building; the wall continues down to the ground and steps (or a raised porch with steps) are added at the doors.
- **Plot use: Hermandad wayhouse (Casa de Paso)**, a walled compound with:
  - a reception house (stats include San Mecánico, the exchange fee and the Code of the Road, from the gazetteer);
  - a dormitory, a repair bay, a well and trough, a shaded patio, wagons, a small corral;
  - the San Mecánico shrine at the gate, plus a sign.
- **Compound wall:** stucco with piers, caps and finials. **Wooden wall** replaces the picket fence (old pickets load as wooden walls).
- **Visitors' grounds:** a footprint-based layout (gate lane, corral in the back corner away from the gate, parking along a side wall, a spread-out camp, sheds at the back), no scrub inside the walls, and a worn path from the gate.
- **Roads:**
  - Asphalt is shaded per pixel: crumbling edges, wheel-path wear, oil streak, cracks and alligator cracking, cut repairs, round potholes, wind-blown sand, broken slabs on ruined roads and faded lines.
  - Each road has a **Condition** slider (ruined → maintained).
  - Junctions have rounded corners built from their arms, and verges and ruts no longer run through them.
- **Bridges** sit on the bank tops. **Retaining walls** have a clean edge, with high-side ground flush to the top of the wall. **Interiors** show through open big doors (bench, shelves, barrels).
- **Night:** lamp, window and neon light on buildings and props is now per pixel (no streaks), and windows only throw light outward.
- **Free cam:** the wheel zoom is logarithmic (fast up high, fine near the ground) and eased.

## Build mode, batch 5
- **Plot editing.** Double-click a plot in Select mode (or "Edit contents" in its panel). The rest of the map dims, the plot gets a yellow outline and an "Editing plot" tag.
  - Its generated contents become real items you can select, move, turn (R, R + wheel) and delete: fences and walls, the visitors' / market / wayhouse props, sheds and corral, and the field.
  - Spec tags: `inPlot`, `bake: 'fence' | 'use'`; hand-edited items get `touched`. Plot flags: `bakedFence`, `bakedUse`.
  - Hand edits survive Reroll and use changes. "Regenerate plot" (with a confirm) throws them away.
  - Esc, or a double-click outside the plot, exits.
- **Iso zoom.** Percentage steps, eased, aimed at the cursor. It goes down to ~3 m of ground on screen; close up, the sun shadow map refits to the view.
- **Retaining walls** are cliffs (`src/cliffs.js`): a clean cut between two surfaces, raise or cut, tapered ends, closed outlines as platforms. Culvert fills use the same system.
- **Esc.** The first press closes the panels and deselects. After that, Esc toggles the map card (hidden by default).
- **Gates.** Two leaves above 1.4 m. State: closed / ajar / open. Wood, metal or ranch styles. The Gate tool selects a gate to edit or delete it. New plots get no gates.
- **Props.**
  - They go down exactly where you click. Only gate, barrier and wall-type props snap.
  - Redone with smooth shading: two-headed brahmin (stand / graze / lie), drums, cistern, well, hay bales, firewood, fire pit, rocks.
  - New water tower.
  - Metal surfaces get a sun highlight and sky sheen, less where rusty.
- **Glass** is a thin tinted pane, ~90% see-through, that reflects at grazing angles. Lit windows still glow. Water has its own channel.
- **Cacti:** cardón, nopal, cholla, agave (`src/veg2.js`).
- **Roads.**
  - Road points within 8 m of the map edge snap onto it. The road then runs ~150 m into the haze, narrowing; unpaved run-outs get a dusty ribbon.
  - Nothing can be built past the edge.
- **Junctions.**
  - Asphalt × asphalt: the main road runs through, and a pad with edge-distance `u` gives rounded corners with no seam.
  - Asphalt × gravel / dirt: the asphalt runs through; the unpaved road gets rounded corners only.
  - Plants stay ~1 m clear of shoulders and junctions.
- **Plot ground** (`pl.ground = { surface, cover, fill }`, `src/grounds.js`).
  - Surfaces: the soft paints, plus caliche, concrete slab, asphalt lot (bay lines), Saltillo, cement tiles (pasta, with a border row), laja flagstone and adobe-brick herringbone.
  - Cover: whole plot, yard ring, or front patio with a path to the gate. `fill` sets the rest of the plot.
  - Hard surfaces are meshes with plot-aligned texture and a crisp kerb.
  - If not set, the surface is rolled per plot.
- **Polygon paint.** The Paint tool has Brush / Polygon modes. Click corners, which snap to plot corners and sides and to road edges (Alt: free); double-click or Enter finishes. Soft or crisp edge. The polygon is a selectable item: drag its corners, change its type, delete it.
- **Power lines.** Wall type `powerline`: draw it like a wall.
  - Poles go every ~32 m and at each corner, with crossarms, insulators, guy wires at corners and ends, and sagging cables.
  - Poor condition: leaning poles, missing arms, cables down.
- **Buildings.**
  - Shed roofs on joined parts slope away from each other and meet in a peak.
  - Rounded corners stay square where they meet another part, and are smooth.
  - Pre-war roofs stay inside the wall line (flush coping, stair bulkhead, vents).
  - New adobe style `plain` (plain walls).
  - Buttressed adobe has a smooth battered base and rounded buttresses.
  - Sandbag walls are gone. Signs and decoration only go on free wall space.
- Tests: `edtest8.mjs` (plot editing), plus the `z*.mjs` render checks.

## Build mode, batch 6
- **Styles belong to materials** (`src/styles.js`). The building panel only lists styles that fit the material; picking a style fixes a wrong material.
  - Post-war, per material:
    - adobe: buttressed, plain, Sonoran (arched zaguán), pill, casona
    - plaster: painted, pill, casona, Sonoran
    - stone: dry-stone ranch, fieldstone, casa fuerte
    - brick: obra negra (castillos, rebar), bóveda catalana (brick vaults), brick false front
    - block: block box, stacked block, block shop
    - timber: board-and-batten cabin, palapa, fishing shack on stilts
    - metal: tin shack, container, salvaged Quonset
  - Pre-war regular: Spanish revival (arcade, arched openings), downtown storefront (stepped false front, name band, shutters), mid-century house (thin roof slab, stone veneer, celosía, carport on houses).
  - Pre-war industrial: sawtooth factory, steel warehouse (barrel or gable roof), cannery (chimney), pump house / substation, silos. New kinds: `factory`, `pumphouse`, `silos`.
  - Retro-futurist is parked; only an explicit `vstyle: 'retro'` gets it.
  - Raw-material styles get no paint and no dado band.
- **Eaves** on pitched roofs sit at the wall top; the wall carries up by the eave drop, so eaves no longer hang over the windows. Casona rafter tails follow the slope under the roof and stop short of the hip corners.
- **Porches** on two-storey fronts stay under the upper floor, so balconies don't clip.
- **New kinds with layouts** (`src/kinds.js`; `spec.layout`, a Layout select in the panel, auto by origin and size):
  - `posada`:
    - courtyard: ranges of rooms round a patio, inner portal, fountain or well, zaguán
    - gallery: two storeys with an upper walkway and an outside stair
    - motel: pre-war motor court with a slab canopy, parking bays and a pole sign
  - `store`:
    - tienda de abarrotes: steel shutters, produce crates, price boards
    - trading post: loading dock, platform scale, hitching rail, trough
  - `clinic`:
    - clinic: whitewashed, red crosses on the wall and roof, bench, generator, sheets on the line
    - curandero: herb bundles, drying rack, ollas, candle niche
    - field hospital: ward tents
  - `cafe`:
    - fonda: portal with tables, string lights, chalkboard, drum stove
    - diner: pre-war, ribbon windows, chrome bands, roof sign
    - rooftop café: tables, umbrellas and lights on the roof, two-run outside stair
  - Rooms are a door plus a window per room on every floor (`mass.rooms`).
  - All kinds are in the build menu and in plot auto-building.
- **Roof gardens** (`spec.roofGarden`: none / herbs / beds / full; auto by kind and wealth; `src/roofgarden.js`):
  - herbs: pots along the parapet
  - beds: raised beds
  - full: beds under shade cloth, trellis, water drum and chair
  - Poor houses grow in cut drums, tyres, tins and buckets.
- **Roof placement.** Props and plants placed by hand over a flat roof sit on the roof (`world.roofAt`). `p.ground: true` keeps a prop on the ground.
- **Weather** select next to the time of day: Sunny / Overcast.
  - Overcast has no direct sun and so no cast shadows. The grey sky lights everything, AO is stronger, and there is more haze.
  - The light bake is cached per time × weather.
- **Props** (`src/props3.js`):
  - The well has three looks: town (whitewash, Talavera band, iron arch, pulley), rural (fieldstone or adobe curb, forked mesquite posts) and pre-war (slab, cast-iron pump). By default it picks by settlement wealth; `variant` forces one.
  - Street life: food cart, agua fresca stand, pila, ollas, drum stove, goat, pig, dog, burro, tyre swing, toys, domino table, hammock, nicho.
  - Street furniture: park bench, kiosko bandstand, bus shelter, phone booth, mailbox, hydrant, road sign, notice board, painted sign.
  - Infrastructure: water tank, rain barrel, pipes, car-fan turbine.
  - Defence: cheval-de-frise.
  - Life sets by building kind are in `LIFE_SETS`.
- **Yard planner** (`src/yards.js`). Plot panel:
  - Household: auto / family / farmer / trader / mechanic / military.
  - Liveliness slider.
  - Buttons: **Populate plot** (an empty plot gets a building, set into the back half, plus a yard), **Re-roll yard** (hand-touched items stay), **Clear yard**.
  - Plot tool: "+ yards" auto-populates new plots.
  - It uses rules, not saved yards, and is size-aware: a plot occupancy grid keeps the gate-to-door path clear, and anything that doesn't fit is skipped.
  - What it places, by household:
    - family / farmer: garden (15–35%, fenced on its open sides), shade set, pila and washing line, outdoor kitchen, outhouse, coop, pens, trees in corners and by the house, palm pairs, cactus corner, scrub, well (wealth), junk corner, nicho, pots, cart by the gate, worn footpaths, swept patio
    - mechanic: wrecks, tyres, drums, work shade, generator
    - trader: stalls, goods, hitching rail, pack animals
    - military: watchtowers, sandbags, barrier, water tower, tents
  - On `auto` fences the household decides the wall: none, light stick / wire, low stone, an open street side, or the usual wall.
  - Items are tagged `inPlot` + `bake: 'yard'`.
- **San Quintín** is reset to its road layout, terrain and natural vegetation, with security off and builder mode on. The old generated town is `san-quintin-old`. If the browser still shows the old town, press Revert: local edits override the built-in place.
- Tests: `edtest9.mjs` (populate / re-roll), `zstyles.mjs` (`SET`, `GAP`, `ZOOM`, `PROPS`), `zp3.mjs` (props), `zyard.mjs` + `zyardr.mjs` (yards), `zwx.mjs` (weather).

## Build mode, batch 7 (coastal valley complete)
- **New buildings** (dressing in `src/kinds2.js`). Loose dressing items come out as `info.props`, which the world adds as props.
  - `mission`: church with bell gable, walled atrium with arched gate and atrial cross, convent range with arcade and cloister well, school. Wings can have their own storey height (`mass.fh`).
  - `granary`: a troje on a raised base, with vents, sacks and sometimes a cuexcomate.
  - `mill`: building plus tahona.
  - `bodega`: vine pergola, barrel racks, wine press.
  - `townhall`: two storeys, tiled portal, clock pediment, sign, flag, notice board, benches.
  - `comandancia`:
    - post (post-war): adobe office, cell block behind with barred windows, SE BUSCA board, bench, hitching rail, flag
    - station (re-used pre-war police station): POLICÍA sign, sandbags, roof lookout, chain-link yard
  - `trade`, in five layouts:
    - tortillería: sacks and a stack pipe
    - panadería: bread oven
    - carnicería: meat rack, brahmin skull
    - herrería: forge and anvil under a lean-to
    - alfarería: kiln and pottery racks
  - `pemex`, in four layouts:
    - working: pumps, lights
    - stripped: pumps gone, a sagging corner
    - ruined: half the canopy down
    - **La Pemex** (gazetteer): stripped and sagging, with travellers' leftovers in the shade and one tank lid off
    - All four share a 1970s-style canopy with a green-and-red fascia, pump islands, a pole sign at the street and tank hatches.
- **New plot uses** (`src/uses.js`): plaza, cemetery, vineyard, threshing floor (era), brickyard, salvage yard, palenque, lienzo charro.
  - Set them in the plot's Use menu, or draw them from the Zones → Town tiles.
  - Contents are baked as editable items (`bake: 'use'`). **Re-roll contents** keeps hand-edited items.
  - Walled ones get a street gate. Plaza and era are left open.
  - What each one contains:
    - plaza: kiosko or well, ring of trees, benches facing in, lamps, planters, flag, food carts
    - cemetery: painted tombs, crosses, headstones, child tombs and capillas in rows off a central walk, a chapel or nicho at the back
    - vineyard: vine rows on posts and wires (trellis rows are built with the field)
    - era: threshing floor, haystacks, sacks, cart, brahmin, sometimes a pond
    - brickyard: drying rows, mud pit, lime kiln, stacks, ramada
    - salvage yard: car stacks, sorted heaps, crane, shack, dog
    - palenque: the ring under a tin cone roof
    - lienzo charro: rail ring, lane and stands
- **Acequia**: a wall type that draws an irrigation ditch: earth or stone banks, water following the ground, the odd board sluice.
- **Props** (`src/props4.js`):
  - tomb (cross / painted / headstone / child / capilla), era, pond (jagüey), tahona, cuexcomate, sacks
  - horno, anvil, pottery rack, wine press, barrel rack, temazcal
  - brick rows, brick stack, mud pit, lime kiln
  - car stack, scrap heap (metal / tires / appliances / pipes), crane
  - palenque, bleachers, trellis, flagpole
  - checkpoint ruin, Poseidon substation, Nuka-Cola and RobCo vending, Nuka crates
- **Still water shader.**
  - Water meshes (render layer 1) are drawn in their own pass after the opaque scene, which is copied (colour + depth) first.
  - Refraction with ripple offset and depth absorption toward the body colour, and screen-space reflections that fall back to the sky colours.
  - Also fresnel, a shadowed sun glint, and a soft shoreline.
  - Slow wind ripples with gusts. Ponds read deeper than their mesh.
  - Moving water (rivers, sea swell) is still to come.
- Tests: `edtest10.mjs` (plot uses), `zuses.mjs` + `zyardr.mjs` (use layouts), and `zp3.mjs`, which now also takes `WALLS`.

## Batch 8 — early-2000s look, atmosphere, ground

Visual rule: early-2000s tricks, nothing physically based; models may be ~30% richer than 00s models.

**Water / metal.** Still water: two scrolling procedural textures, a fake sky environment, a sun glint, depth darkening and shore fade with foam (no real reflection or refraction). Metal shines with the same fake environment.

**Polygons.** Segment caps on cylinders, ellipsoids, rods, lathes, rings and tubes.

**Vegetation = alpha cards.** All leafy things are cards (the plant atlas): pots, roof gardens, flower boxes, herb bundles, vines, crops, hedges and potted plants. Models are used only for trunks. Palms have one continuous curved trunk: fan palms with a swollen foot, rings and a dead-frond skirt; date palms thicker, with stubs and suckers. Agave and cacti stay geometry (succulent bodies).

**Flags.** No national flags.
- A settlement flies `settlement.flag = { colors: ['#hex', …], layout: 'h'|'v'|'canton'|'diag'|'plain', emblem: 'none'|'star'|'sun'|'ring'|'cross'|'chevron', emblemColor }`. Without one it flies a seeded homemade rag banner: faded, frayed, patched.
- Faction designs are invented (the gazetteer gives no colours):
  - Red Misionera: a cream gonfalon with a madder-red cross and a green hem (`banner` prop, at mission doors).
  - Hermandad del Camino: an asphalt-black pennant with a yellow dashed centre line (`pennant` prop, at wayhouse gates).
- Flags flap in the wind (the `cloth` channel).

**Time of day and weather.**
- The toolbar slider blends the presets smoothly by hour: live while dragging, light re-bakes on release.
- Weather: `sunny` · `overcast` · `marine` (marine layer) · `dust` (dust storm) · `rain` (streaks, wet darkening, puddles).
- `fogNear` gives iso views real fog. Wind strength follows the weather.

**Sky and light.**
- Painted two-layer clouds (cumulus and cirrus) drift; cloud shadows scroll over the ground.
- Look toggles: **Glow** (bloom on lamps, neon and the sun), **Flare** (sun glare and lens ghosts, occluded by geometry) and **Trails** (SA-style frame smear).
- Heat shimmer at clear noon.
- At night: coronas, additive light cones under street lamps, and moths round lit lamps.

**Particles.** Rain, blowing sand, dust devils (clear afternoons), tumbleweeds, circling vultures (clear days) and hammer sparks at the herrería anvil.

**Ground.** Everything here is generated from context, deterministic, and never saved.
- *Vegetation cover field:* trees, shrubs, crops, acequias and ponds, blurred.
  - Bare ground washes out sandy and dusty, with more dust particles and warmer, thicker haze.
  - Covered ground goes darker and richer.
  - The **Cover** toolbar button shows the field.
- *Decals* (modulate-2x, so they work in any light): oil under wrecks, generators and pumps; cart ruts 1.6 m apart on dirt and gravel roads (fainter at junctions); wet stains and trampled rings at wells and troughs; soot at fires, stoves, ovens and forges; dung at hitching rails, corrals and livestock; trash at markets, cantinas, the Pemex and busy roads (less in rich places, none in fields); cracks on concrete; dry mud by ponds and acequias; sand drifts on bare ground.
  - Density follows `spec.wear` (the **Wear** slider, 0–2) and plot liveliness.
- *Ground clutter:* grass, weeds, pebbles and leaf litter cards, only round the view.
  - By ground type, denser at wall and building feet, greener with cover, none on fields or roads, sparse on shoulders.
  - The **Clutter** button toggles it.

**Buildings and plots.**
- Shop-front awnings are replaced by a **side shade** (a tarp or ramada with tables, benches or goods) on a blank side wall chosen before the walls are built. It is only built where the ground beside it is free. `sideShade: true | false | 'left' | 'right'`.
- **Paint wear** `paintFade: 'fresh' | 'faded' | 'gone'` (rolled by wealth and condition when unset).
- **Populate plot** never builds: it uses the building already on the plot, or makes an open yard. Generated props have ids and can be moved, and moved props survive re-rolls.
- Nothing spawns in front of any ground-floor door.
- The gate tool picks gates on shared plot lines and the auto gates on fields. Deleted gates stay deleted (`gatesEdited`).

**Walls.**
- Proper `stone` (mortared, with a coping), `stone_low` (dry-stone with cap stones) and `wood` (plank) walls.
- New `brick` wall.
- The old looks are kept as `stone_ruin` and `wood_old`.

**Gates.** A `scrap` leaf, which metal gates on scrap fences use automatically. Gate leaves now sit level.

## Batch 9 (Oct 2026): trades, stands, signs, liveries, yard rules

- **Households** (plot panel → Household): family, farmer, rancher, trader, craftsman (Craft: carpenter / potter /
  saddler-tanner / weaver), mechanic, salvager (pepenador), fisher, innkeeper, food seller, aguador, curandero, military.
- **Yard rules** (`yards.js`): zones (front = public / trade, side = service, back = private / work); everything comes
  in pre-arranged vignettes set against a house wall, the plot wall or a corner (kitchen corner, pila + line strung
  house → wall, patio shade, coop, pen, stacks, junk corner, tie-up, work shade…). **Density** (plot panel) sets the
  budget: 0 → mostly swept ground, 1 → full. **Liveliness** only adds signs of people (washing out, chairs, fire lit,
  animals out, dog, toys) from its own random stream, so it never moves the layout. Wealth = quality, not quantity.
- **Food stands**: building kind `stand`, layouts taqueria / bar / tortas / fritanga / trailer (`stands.js`). Condition
  slider: shut and boarded below derelict; the pre-war trailer goes restored → faded + rust streaks → flat tyres,
  boarded → holed rust shell on blocks.
- **Sign tool** (Build → Sign, or Props → Signs; no hotkey): text (Enter = new line), hand-painted / printed / neon,
  size S/M/L, colour presets; the board fits the text. Point at the ground (posts), a wall (hangs where you point,
  above any door / window it would cover) or a roof (frame). Prop `custom_sign` { text, kind, size, color, mount,
  height, post }. Neon needs power, stays lit all night.
- **Liveries** (`LIVERIES` in buildings.js; Livery select on buildings and compound walls): `hermandad` — lime white,
  asphalt-grey base band with the yellow dashed road line, yellow trim / border, black doors and shutters, San Mecánico
  gear over the main door; compound wall with hazard-striped gate posts; sign style `hermandad`. Casa de Paso
  compounds use it by default (one material, flat roofs, numbered signs); `a.livery: 'none'` turns it off.
- New props (`props5.js`): sawhorse, potters_wheel, loom, yarn_line, saddle_rack, panga, net_rack, fish_rack,
  crab_traps, sort_bins, scale, water_cart, herb_bed, altar, cooler, el_pelicano (Cantina El Pelícano landmark).
- Tests: `edtest12` (sign tool), `zstand` (stands, env LAYS), `zway` (Casa de Paso), `zpel`, `zp5`, `zyard`+`zyardr`.

## License

The code is MIT (see `LICENSE`). The license covers the code only, not the sounds, textures or models.

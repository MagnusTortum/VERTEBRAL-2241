// San Quintín (SeQu) — town core. Source: baja_gazetteer_v3 (San Quintín, ~2,200; the Spine runs straight
// through as the main street; the bay is visible from it; Cantina El Pelícano central and visible from the
// road; Casa de Paso (La Tía); Doctora Vásquez; El Profeta del Asfalto). Street plan after the real town:
// the highway runs NNW–SSE; the town is a grid on its east side — ten long numbered streets (Primera …
// Décima) square to the highway and a few cross streets parallel to it (out to Calle D) — with a thin strip
// and Calle Valladolid on the west side, and the bay road leaving WSW. Game-scaled (~1,000 people in the core).
// Everything not named in the gazetteer (filler buildings, market and visitors' lot) is generated, not canon
// until approved. The coastal quarter (Consejo del Mar) is off this map.
// REBUILT (Oct 2026): street layout redone from scratch at Danyil's request — the old auto-grid (paved, rotated
// 12.7° off the Spine) and the overlapping hand roads are gone. Only MEX-1 is asphalt; every other street is
// gravel or dirt. Buildings, plots and fields are placed by hand in the builder.
// Coordinates: x east, z south (north = -Z). The Spine runs N–S along x = 0.
export default {
  name: 'San Quintín (core)',
  region: 'Last coastal valley, 115 mi south of Ensenada',
  seed: 'sequ-2241',
  size: [400, 500],
  biome: 'coastal_valley',
  mode: 'hybrid',
  builder: true,
  description: 'Grain town on the Spine; the Spine is the main street and the bay shows to the west. Gravel grid square to the highway (Calles Primera–Tercera across it, Valladolid / B / Poniente / Oriente along it), dirt callejones, the bay road west, farm tracks east. Valley farmers (La Junta) vs the coast (Consejo del Mar). The bay is off this map to the west.',
  context: 'Fallout Baja California, 2241. Classic Fallout lore only (Fallout 1, 2, New Vegas). San Quintín (SeQu): ~2,200 people, grain surplus, last coastal valley before the desert. The Spine (pre-war MEX-1) is the main street; the bay is visible from it. Politics: valley farmers (La Junta) vs coastal fishing community (Consejo del Mar) — three generations of dispute over water rights, trade levies and bay jurisdiction. Key NPCs: La Tía (Casa de Paso keeper, trades information), Próspero (Cantina El Pelícano owner), Doctora Vásquez (mission-trained healer, most respected person in town), Señora Ibarra (Gordillo grudge), El Profeta del Asfalto (reads road crack patterns; one water bottle per reading). GURPS 4e.',
  settlement: {
    tl: 5, wealth: 'average', appearance: 0, power: 'scarce', security: 'none',
    core: [0, 0], radius: [145, 150], axis: 0, density: 0.95, spine: 'main', alleys: true,
  },
  view: { target: [0, 0], zoom: 1.0, az: -32 },
  terrain: {
    relief: 0.8, scale: 140,
    features: [
      { type: 'tilt', dir: 90, amount: 1.0 },
      { type: 'hill', at: [190, -230], radius: 70, height: 5 },
    ],
  },

  // The Spine is the main street (asphalt, wide, a dirt apron each side); a gravel grid square to it: three
  // numbered cross streets (90 m apart) and two back streets each side (60 m and 130 m out); dirt callejones
  // mid-block; dirt beyond the grid; the bay road west; farm tracks east into the valley.
  roads: [
    { id: 'spine', name: 'The Spine (MEX-1) — Calle Principal', type: 'highway', class: 'main', era: 'prewar', width: 14, frontage: 10, condition: 0.55, path: [[0, -262], [0, 0], [0, 262]] },
    // cross streets, right across the highway
    { id: 'c-primera', name: 'Calle Primera', type: 'gravel', class: 'street', era: 'postwar', width: 7, path: [[-130, -90], [0, -90], [130, -90]] },
    { id: 'c-segunda', name: 'Calle Segunda', type: 'gravel', class: 'street', era: 'postwar', width: 7, path: [[-130, 0], [0, 0], [130, 0]] },
    { id: 'c-tercera', name: 'Calle Tercera', type: 'gravel', class: 'street', era: 'postwar', width: 7, path: [[-130, 90], [0, 90], [130, 90]] },
    // back streets, parallel to the Spine
    { id: 'valladolid', name: 'Calle Valladolid', type: 'gravel', class: 'street', era: 'postwar', width: 7, path: [[-60, -135], [-60, 135]] },
    { id: 'c-poniente', name: 'Calle Poniente', type: 'gravel', class: 'street', era: 'postwar', width: 6, path: [[-130, -135], [-130, 135]] },
    { id: 'c-b', name: 'Calle B', type: 'gravel', class: 'street', era: 'postwar', width: 7, path: [[60, -135], [60, 135]] },
    { id: 'c-oriente', name: 'Calle Oriente', type: 'gravel', class: 'street', era: 'postwar', width: 6, path: [[130, -135], [130, 135]] },
    // the grid's north and south edges: dirt
    { id: 'orilla-n', type: 'dirt', era: 'postwar', wiggle: 2, width: 5, path: [[-130, -135], [-60, -135], [0, -135], [60, -135], [130, -135]] },
    { id: 'orilla-s', type: 'dirt', era: 'postwar', wiggle: 2, width: 5, path: [[-130, 135], [-60, 135], [0, 135], [60, 135], [130, 135]] },
    // dirt callejones mid-block, between the Spine and the first back street
    { id: 'callejon-1', type: 'lane', era: 'postwar', wiggle: 1.5, path: [[-7, -45], [-60, -45]] },
    { id: 'callejon-2', type: 'lane', era: 'postwar', wiggle: 1.5, path: [[7, -45], [60, -45]] },
    { id: 'callejon-3', type: 'lane', era: 'postwar', wiggle: 1.5, path: [[-7, 45], [-60, 45]] },
    { id: 'callejon-4', type: 'lane', era: 'postwar', wiggle: 1.5, path: [[7, 45], [60, 45]] },
    // out of town: the bay road west, farm tracks east into the valley
    { id: 'camino-bahia', name: 'Camino a la Bahía', type: 'dirt', era: 'postwar', wiggle: 5, width: 6, path: [[-130, 0], [-165, 8], [-205, 30]] },
    { id: 'track-ne', type: 'track', era: 'postwar', wiggle: 8, path: [[130, -90], [160, -120], [185, -175], [205, -230]] },
    { id: 'track-e', type: 'track', era: 'postwar', wiggle: 8, path: [[130, 0], [170, 6], [205, 14]] },
    { id: 'track-se', type: 'track', era: 'postwar', wiggle: 8, path: [[130, 90], [160, 125], [182, 180], [205, 235]] },
  ],

  vegetation: { density: 0.4, groves: [{ at: [-150, 60], radius: 14, count: 8, species: { pepper_tree: 2, fan_palm: 1 } }] },
};

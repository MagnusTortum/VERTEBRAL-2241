// BUILD MODE, phase 2 tools: roads (straight / curved / freeform, snapping), Manor Lords plots along
// roads (with auto fences), buildings that generate themselves on a plot, hand-drawn walls & fences,
// and tree rows. Each tool edits the place spec; the editor core applies it in place.
import { acequiaCourse, downhill, FARM_FIELDS, WATER } from './water.js';
import * as THREE from 'three';
import { RNG } from './rng.js';
import { SIZES, DEN_FIXED } from './layout.js';
import { nearestOnSamples, pathLength, pointInPoly, toWorld, toLocal, obbDist as obbD } from './geo.js';
import { plotDerived, subdivideZone, frontFirst, plotStrip, autoBuilding, plotFrame, nearestRoadPos, rowParty, frontAt, refitPlots, splitPlot, mergeablePair, unionPlots, FENCE_STYLES, BUILD_KINDS, SETBACKS, PLOT_USES, ZONE_CATS, zonePick } from './plots.js';
import { roadSamples, ROAD_DEFAULTS } from './roads.js';
import { ORIGIN_CHOICES, ADAPTATIONS, resolveOrigin, ROOF_STYLES, massesFor, LIVERIES, MIX_KINDS, vigaFace, vigaReach } from './buildings.js';
import { KIND_LAYOUTS } from './kinds.js';
import { planYard, applyYard, clearYard, HOUSEHOLDS, CRAFTS } from './yards.js';
import { planUse, applyUse, NEW_USES, USE_LABELS } from './uses.js';
import { STYLES, stylesFor } from './styles.js';
import { RETAIN_TYPES } from './crossings.js';
import { MAT } from './palette.js';
import { U } from './materials.js';
import { SURFACES, COVERS } from './grounds.js';
import { SIGN_COLORS } from './signs.js';
import { lineStyle, fatLine, HI } from './hilite.js';
import { signDims } from './props5.js';

export const ROAD_TYPES = {
  highway: { label: 'The Spine', type: 'highway', width: 14 },
  asphalt: { label: 'Asphalt street', type: 'paved', width: 8 },
  gravel: { label: 'Gravel street', type: 'gravel', width: 6 },
  dirt: { label: 'Dirt road', type: 'dirt', width: 4.5 },
  track: { label: 'Track', type: 'track', width: 2.6 },
  path: { label: 'Footpath', type: 'path', width: 1.2 },
};
const WALL_TYPES = ['adobe', 'compound', 'block', 'brick', 'stone', 'stone_low', 'stone_ruin', 'herreria', 'ocotillo', 'wood', 'wood_old', 'pole', 'rail', 'wire', 'chainlink', 'chain', 'bollard', 'scrap', 'powerline', 'acequia', 'stream'].filter((t) => WATER || t !== 'stream');
const ROW_SPECIES = ['eucalyptus', 'tamarisk', 'fan_palm', 'date_palm', 'pepper_tree', 'mesquite', 'fruit_tree'];
export const CROPS = ['corn', 'beans', 'chili', 'squash', 'mixed', 'maguey', 'nopal'];
export const FIELD_KINDS = { field: 'Crop field', fallow: 'Fallow field', orchard: 'Orchard', corral: 'Corral' };
export const BUILD_TOOLS = [
  ['road', 'Road', 'N', 'Click to lay a road (Straight: click points · Curved: click points, the road bends smoothly through all of them · Freeform: drag). Enter / double-click finishes · right-click takes back a point · Esc cancels. Shift snaps angles.'],
  ['plot', 'Plots', 'P', 'Drag along a road to lay a row of plots on that side'],
  ['building', 'Building', 'H', 'Click a plot to build on it, or place it on open ground: snaps to road edges (Shift + wheel = offset) and plot lines · Alt: no snap · R / hold R + wheel turns it'],
  ['wall', 'Wall', 'K', 'Click points to draw a wall or fence · click the first point to close · Enter / double-click finishes · right-click takes back a point · Esc cancels'],
  ['row', 'Tree row', 'T', 'Click start, click end: a row of trees'],
  ['plotfree', 'Singular plot', 'Y', 'Click the corners (snaps to road edges, plot corners and edges) · double-click, Enter or click the first point to finish · the first side you draw is the street front'],
  ['zone', 'Multiple plots', 'U', 'Draw a polygon (snaps to road edges and other plots) · double-click / Enter finishes · it is divided into plots along the roads it touches'],
  ['retain', 'Retaining wall', 'X', 'Click points along the wall (snaps to road edges at the offset) · click the first point to close it into a raised platform (steps on the longest side) · Enter / double-click finishes · the high side gets a flat terrace'],
  ['gate', 'Gate', 'J', 'Click a wall or fence to put a gate there · click an existing gate to edit it (leaf, width, state) or delete it'],
  ['field', 'Field', 'G', 'Click points around the field · click the first point (or Enter) to close'],
  ['sign', 'Sign', '', 'Type the text, pick type, size and colour, then click: on open ground it stands on posts, on a building wall it hangs flat above the doors and windows, inside a roof it sits on a frame · Mount forces one · R turns a ground sign'],
];

export function buildToolOptions() {
  const opt = (arr, lab = (x) => x.replace(/_/g, ' ')) => arr.map((k) => `<option value="${k}">${lab(k)}</option>`).join('');
  return `
    <div class="ed-row ed-opt" data-for="road wall row prop retain scatter building plotfree zone field"><label class="chk"><input id="ed-snap" type="checkbox" checked> snap <span class="dim">(hold Alt: off)</span></label>
      <span class="ed-off-w" title="Distance from the road edge · Shift + mouse wheel changes it while snapped"><span class="lbl2">Offset</span><input id="ed-off" type="range" min="0" max="15" step="0.5" value="0.5"><span id="ed-off-v">0.5 m</span></span></div>
    <div class="ed-row ed-opt" data-for="select road"><label class="chk" title="Lock the roads: they can't be selected, dragged, reshaped, turned or deleted (new roads can still be drawn)"><input id="ed-lockroads" type="checkbox"> lock roads</label></div>
    <div class="ed-row ed-opt" data-for="road"><span class="lbl2">Mode</span>
      <span class="seg" id="ed-rmode"><button data-m="straight">Straight</button><button data-m="curved" class="on">Curved</button><button data-m="free">Freeform</button></span></div>
    <div class="ed-row ed-opt" data-for="road"><span class="lbl2">Type</span><select id="ed-rtype">${Object.entries(ROAD_TYPES).map(([k, v]) => `<option value="${k}" ${k === 'gravel' ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <span class="lbl2">W</span><input id="ed-rwidth" type="number" min="1" max="24" step="0.5" value="6" style="width:52px">
      <label class="chk" title="Highways and paved roads sit a little proud of the ground on their own bed (about 80 cm), with earth shoulders sloping down"><input id="ed-rraise" type="checkbox" checked> raised bed</label>
      <label class="chk" title="Highways: a wide packed-dirt apron each side between the road and the first buildings (parking, stalls, pull-offs), as in most towns on MEX-1"><input id="ed-rapron" type="checkbox" checked> dirt apron</label><input id="ed-rapronw" type="number" min="2" max="25" step="1" value="10" style="width:46px" title="Apron width each side (m)"></div>
    <div class="ed-row ed-opt" data-for="plot zone"><span class="lbl2" title="How big each plot is: small = narrow street-front lots, large = wide deep lots">Plot size</span><span class="seg" id="ed-psize"><button data-z="0" title="Tiny">XS</button><button data-z="0.25" title="Small">S</button><button data-z="0.5" class="on" title="Medium">M</button><button data-z="0.75" title="Big">L</button><button data-z="1" title="Huge">XL</button><button data-z="mix" title="Mix: every plot its own size">Mix</button></span><span id="ed-psize-v" style="margin-left:6px"></span></div>
    <div class="ed-row ed-opt" data-for="plot zone"><span class="lbl2" title="Plot shape: narrow = a slim street front, running deep; wide = a broad front, shallower">Shape</span><select id="ed-pshape" style="flex:1"><option value="narrow">narrow</option><option value="normal" selected>normal</option><option value="wide">wide</option><option value="mix">mix</option></select></div>
    <div class="ed-row ed-opt" data-for="plot zone plotfree"><span class="lbl2" title="How built-up each plot is: low = set back with room around, one storey; high = up to the street, filling the plot, more storeys">Density</span><input id="ed-dens" type="range" min="0" max="1" step="0.05" value="0.5" style="flex:1"><span id="ed-dens-v">50%</span>
      <label class="chk" title="Buildings attached to each other along the street (shared side walls)"><input id="ed-brow" type="checkbox"> row</label></div>
    <div class="ed-row ed-opt" data-for="plot zone plotfree"><span class="lbl2">Fence</span><select id="ed-pf">${opt(FENCE_STYLES)}</select>
      <label class="chk"><input id="ed-pfill" type="checkbox"> build on them</label>
      <label class="chk" title="Also lay out the yard (garden, trees, pila, shade, outhouse...) on each new plot"><input id="ed-pyard" type="checkbox"> + yards</label></div>
    <div class="ed-row ed-opt" data-for="zone plotfree"><span class="lbl2" title="What gets built: a mix of buildings and plot uses, new / pre-war shares and plot defaults. On a single plot, Kind (when not auto) overrides it">Category</span><select id="ed-zc" style="flex:1"><option value="">none</option>${Object.entries(ZONE_CATS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div>
    <div class="ed-row ed-opt" data-for="building plot plotfree"><span class="lbl2" title="Building kind (on a single plot: overrides the category)">Kind</span><select id="ed-bk">${opt(BUILD_KINDS, (x) => (x === 'pemex' ? 'damex' : x.replace(/_/g, ' ')))}</select>
      <span class="lbl2">Origin</span><select id="ed-bo"><option value="">auto</option><option value="new">new (Baja)</option><option value="prewar">pre-war</option><option value="mixed">pre-war + new</option></select>
      <span class="lbl2">State</span><select id="ed-bc"><option value="">auto</option>${COND_STEPS.map(([t, n]) => `<option value="${Math.min(1, t - 0.01).toFixed(2)}">${n}</option>`).join('')}</select></div>
    <div class="ed-row ed-opt" data-for="wall"><span class="lbl2">Type</span><select id="ed-wt">${opt(WALL_TYPES)}</select>
      <span class="lbl2">H</span><input id="ed-wh" type="number" min="0.6" max="4" step="0.1" value="" placeholder="auto" style="width:58px">
      <span class="lbl2">Paint</span><select id="ed-wp">${Object.entries(WALL_PAINTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="ed-row ed-opt" data-for="field"><span class="lbl2">Kind</span><select id="ed-fk">${Object.entries(FIELD_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="lbl2">Crop</span><select id="ed-fc">${opt(['auto', ...CROPS])}</select></div>
    <div class="ed-row ed-opt" data-for="field"><span class="lbl2">Fence</span><select id="ed-ff">${opt(['auto', 'none', 'pole', 'rail', 'wire', 'stone_low', 'ocotillo'])}</select>
      ${WATER ? `<label class="chk" title="Dig a short ditch from the nearest acequia or stream (within 30 m) if the water can run there; otherwise the field is dry-farmed"><input id="ed-firr" type="checkbox" checked> dig ditch to water</label>` : ''}</div>
    <div class="ed-row ed-opt" data-for="plotfree"><span class="lbl2">Use</span><select id="ed-zu">${opt(PLOT_USES)}</select>
      <span id="ed-mf-w" style="display:none"><span class="lbl2" title="Vecindad: rooms round a shared patio. Cuartería: a row of one-room homes. Pre-war block: an apartment block, squatted. Family compound: an extended family's houses round one yard">Type</span><select id="ed-mf"><option value="">auto</option><option value="vecindad">vecindad</option><option value="cuarteria">cuartería</option><option value="block">pre-war block</option><option value="compound">family compound</option><option value="locales">row of locales</option></select></span></div>
    <div class="ed-row ed-opt" data-for="retain"><span class="lbl2">Type</span><select id="ed-rt">${Object.entries(RETAIN_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="lbl2">High</span><span class="seg" id="ed-rside"><button data-s="1" class="on">Left</button><button data-s="-1">Right</button></span></div>
    <div class="ed-row ed-opt" data-for="retain"><span class="lbl2">Rise</span><input id="ed-rrise" type="number" min="0.3" max="6" step="0.1" value="1.2" style="width:58px"><span class="seg" id="ed-rcut"><button data-c="fill" class="on">Raise</button><button data-c="cut">Cut</button></span>
      <span class="lbl2">Depth</span><input id="ed-rdepth" type="number" min="2" max="40" step="1" value="10" style="width:52px"></div>
    <div class="ed-row ed-opt" data-for="retain"><label class="chk"><input id="ed-rcap" type="checkbox" checked> cap</label><label class="chk"><input id="ed-rrail" type="checkbox"> railing</label></div>
    <div class="ed-row ed-opt" data-for="gate"><span class="lbl2">Width</span><input id="ed-gw" type="range" min="1" max="7" step="0.5" value="3"><span id="ed-gw-v">3 m</span>
      <span class="lbl2">Leaf</span><select id="ed-gl"><option value="none">open gap</option><option value="wood">wood</option><option value="metal">metal</option><option value="chainlink">chain-link</option><option value="scrap">scrap</option></select></div>
    <div class="ed-row ed-opt" data-for="gate"><span class="lbl2">State</span><select id="ed-gs"><option value="closed">closed</option><option value="ajar">ajar</option><option value="open">open</option></select>
      <button id="ed-gdel" disabled>Delete gate</button> <span class="dim" id="ed-gsel">click a gate to edit it</span></div>
    <div class="ed-row ed-opt" data-for="sign"><textarea id="ed-stext" rows="2" style="flex:1;font:inherit;text-transform:uppercase" placeholder="Text (Enter = new line)">TACOS</textarea></div>
    <div class="ed-row ed-opt" data-for="sign"><span class="seg" id="ed-skind"><button data-k="painted" class="on">Hand-painted</button><button data-k="printed">Printed</button><button data-k="neon">Neon</button></span></div>
    <div class="ed-row ed-opt" data-for="sign"><span class="lbl2">Size</span><span class="seg" id="ed-ssize"><button data-s="S">S</button><button data-s="M" class="on">M</button><button data-s="L">L</button></span>
      <span class="lbl2">Colour</span><select id="ed-scolor"></select></div>
    <div class="ed-row ed-opt" data-for="sign"><span class="lbl2">Mount</span><select id="ed-smount"><option value="auto">auto (where you click)</option><option value="ground">ground (posts)</option><option value="wall">building wall</option><option value="roof">roof (frame)</option></select><span class="dim" id="ed-sdim"></span></div>
    <div class="ed-row ed-opt" data-for="row"><span class="lbl2">Tree</span><select id="ed-ts">${opt(ROW_SPECIES)}</select>
      <span class="lbl2">Every</span><input id="ed-tsp" type="range" min="2.5" max="14" step="0.5" value="5"><span id="ed-tsp-v">5 m</span></div>`;
}

// wall paint presets (the walls' own colour when 'natural')
export const WALL_PAINTS = { '': 'natural', 0xe8e2d4: 'whitewash', 0xe0cfa8: 'cream', 0xd2a05a: 'ochre', 0xb8643e: 'terracotta', 0xa8402c: 'oxide red', 0xd89a9a: 'pink', 0x8ab4cc: 'sky blue', 0x3f6a96: 'blue', 0x6f9a6a: 'green', 0x2f6a5a: 'teal', 0xd8c050: 'yellow', 0x9a978f: 'grey' };
const hex6 = (v) => '#' + Number(v).toString(16).padStart(6, '0');
export const COND_STEPS = [[0.02, 'bare foundations'], [0.15, 'rubble ruin'], [0.3, 'ruin'], [0.45, 'derelict'], [0.6, 'worn'], [0.8, 'kept'], [1.01, 'pristine']];
export const condName = (v) => (v == null ? 'auto' : COND_STEPS.find(([t]) => v <= t)[1]);

export function initBuildTools(api) {
  const { state, stage, ed, $, groundAt, pushUndo, commit } = api;
  const T = () => state.world.terrain;
  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`;
  const o = (ed.opts = { snap: true, off: 0.5, rmode: 'curved', rtype: 'gravel', rwidth: 6, pw: 11, pd: 22, pf: 'auto', pfill: false, bk: 'auto', bc: '', bo: '', brt: 'collapsed', bs: 'tight', wt: 'adobe', wh: null, ts: 'eucalyptus', tsp: 5, fk: 'field', fc: 'auto', ff: 'auto', zu: 'building', gw: 3, gl: 'wood', gs: 'closed', rt: 'drystone', rside: 1, rrise: 1.2, rcut: false, rdepth: 10, rcap: true, rrail: false, dens: 0.5, psize: 0.5, brow: false, stext: 'TACOS', skind: 'painted', ssize: 'M', scolor: '', smount: 'auto' });
  // ---- sign tool options
  const signColors = () => { const P = SIGN_COLORS[o.skind]; if (!P[o.scolor]) o.scolor = Object.keys(P)[0]; $('#ed-scolor').innerHTML = Object.entries(P).map(([k, v]) => `<option value="${k}" ${k === o.scolor ? 'selected' : ''}>${v[2]}</option>`).join(''); };
  const signDimText = () => { const D = signDims({ text: o.stext, size: o.ssize, kind: o.skind }); $('#ed-sdim').textContent = ` ${D.w.toFixed(1)} × ${D.h.toFixed(1)} m`; };
  signColors(); signDimText();
  $('#ed-stext').oninput = (e) => { o.stext = e.target.value.toUpperCase(); o.stextUser = true; signDimText(); };
  document.querySelectorAll('#ed-skind button').forEach((b) => (b.onclick = () => { o.skind = b.dataset.k; document.querySelectorAll('#ed-skind button').forEach((x) => x.classList.toggle('on', x === b)); signColors(); signDimText(); }));
  document.querySelectorAll('#ed-ssize button').forEach((b) => (b.onclick = () => { o.ssize = b.dataset.s; document.querySelectorAll('#ed-ssize button').forEach((x) => x.classList.toggle('on', x === b)); signDimText(); }));
  $('#ed-scolor').onchange = (e) => { o.scolor = e.target.value; };
  $('#ed-smount').onchange = (e) => { o.smount = e.target.value; };
  $('#ed-rt').onchange = (e) => { o.rt = e.target.value; };
  document.querySelectorAll('#ed-rside button').forEach((b) => (b.onclick = () => { o.rside = +b.dataset.s; document.querySelectorAll('#ed-rside button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#ed-rrise').onchange = (e) => { o.rrise = +e.target.value || 1.2; };
  document.querySelectorAll('#ed-rcut button').forEach((b) => (b.onclick = () => { o.rcut = b.dataset.c === 'cut'; document.querySelectorAll('#ed-rcut button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#ed-rdepth').onchange = (e) => { o.rdepth = +e.target.value || 10; };
  $('#ed-rcap').onchange = (e) => { o.rcap = e.target.checked; };
  $('#ed-rrail').onchange = (e) => { o.rrail = e.target.checked; };
  $('#ed-gw').oninput = (e) => { o.gw = +e.target.value; $('#ed-gw-v').textContent = `${o.gw} m`; };
  // gate options edit the selected gate (if one is picked) or set up the next new one
  const gateEdit = (fn) => { const G = api.gateSel; if (!G) return; pushUndo(); fn(G.g); commit(40); };
  $('#ed-gl').onchange = (e) => { o.gl = e.target.value; gateEdit((g) => { if (o.gl === 'none') { delete g.leaf; g.posts = false; } else { g.leaf = o.gl; delete g.posts; } }); };
  $('#ed-gs').onchange = (e) => { o.gs = e.target.value; gateEdit((g) => { g.state = o.gs; }); };
  $('#ed-gw').onchange = () => gateEdit((g) => { g.width = o.gw; });
  $('#ed-gdel').onclick = () => { const G = api.gateSel; if (!G) return; pushUndo(); G.list.splice(G.list.indexOf(G.g), 1); if (G.owner?.poly && (state.spec.plots || []).includes(G.owner)) G.owner.gatesEdited = true; /* re-rolls will not put it back */ api.gateSel = null; syncGateUI(); commit(40); };
  function syncGateUI() {
    const G = api.gateSel;
    $('#ed-gdel').disabled = !G; $('#ed-gsel').textContent = G ? 'editing the selected gate · Esc: done' : 'click a gate to edit it';
    if (G) { const g = G.g; o.gw = g.width || 3; o.gl = g.leaf || 'none'; o.gs = g.state || 'closed'; $('#ed-gw').value = o.gw; $('#ed-gw-v').textContent = `${o.gw} m`; $('#ed-gl').value = o.gl; $('#ed-gs').value = o.gs; }
  }
  api.clearGate = () => { if (api.gateSel) { api.gateSel = null; syncGateUI(); } };
  $('#ed-fk').onchange = (e) => { o.fk = e.target.value; };
  $('#ed-snap').onchange = (e) => { o.snap = e.target.checked; };
  { const lk = $('#ed-lockroads'); try { state.lockRoads = localStorage.getItem('mapgen:lockRoads') === '1'; } catch { /* no storage */ } lk.checked = !!state.lockRoads;
    lk.onchange = (e) => { state.lockRoads = e.target.checked; try { localStorage.setItem('mapgen:lockRoads', state.lockRoads ? '1' : '0'); } catch { /* no storage */ } if (state.lockRoads && api.findSrc(state.selected)?.k === 'roads') api.select?.(null); api.drawHandles?.(); }; }
  $('#ed-off').oninput = (e) => { o.off = +e.target.value; $('#ed-off-v').textContent = `${o.off} m`; };
  // Shift + wheel = offset from the road edge while a placement tool is snapped to one (zooms otherwise)
  const OFF_TOOLS = new Set(['wall', 'row', 'prop', 'retain', 'scatter', 'building']), PLOT_OFF = new Set(['plot', 'zone', 'plotfree']); // plot rows / zones: the setback from the road
  window.addEventListener('wheel', (e) => {
    if (!ed.on || !e.shiftKey || ed.rHeld || e.altKey || !((OFF_TOOLS.has(ed.tool) && api.edgeSnapped && o.snap) || PLOT_OFF.has(ed.tool))) return; // Shift + wheel: offset; the wheel alone zooms
    if (e.target?.closest?.('#panel, #bm, #ed, .modal')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    o.off = Math.max(0, Math.min(15, Math.round((o.off - Math.sign(e.deltaY || e.deltaX) * 0.5) * 2) / 2)); // (Shift turns the wheel sideways on some systems)
    $('#ed-off').value = o.off; $('#ed-off-v').textContent = `${o.off} m`;
    api.flash?.(`Offset ${o.off} m`);
    const lp = api.lastP; if (lp) { api.ext[ed.tool]?.move?.(lp, {}); if (ed.tool === 'prop') api.previewSnap?.(lp); }
  }, { capture: true, passive: false });
  window.addEventListener('keydown', (e) => { if (e.key === 'Alt') api.alt = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') api.alt = false; });
  window.addEventListener('blur', () => { api.alt = false; });
  $('#ed-fc').onchange = (e) => { o.fc = e.target.value; };
  $('#ed-ff').onchange = (e) => { o.ff = e.target.value; };
  const mfRow = () => { const r = $('#ed-mf-w'); if (r) r.style.display = o.zu === 'multifamily' ? '' : 'none'; };
  $('#ed-zu').onchange = (e) => { o.zu = e.target.value; mfRow(); };
  $('#ed-mf').onchange = (e) => { o.mfKind = e.target.value; };
  if ($('#ed-pf2')) $('#ed-pf2').onchange = (e) => { o.pf = e.target.value; $('#ed-pf').value = o.pf; };
  // keep the option widgets in step when a menu tile changes them
  api.syncOpts = () => {
    for (const [id, k] of [['#ed-rtype', 'rtype'], ['#ed-pf', 'pf'], ['#ed-pf2', 'pf'], ['#ed-bk', 'bk'], ['#ed-bc', 'bc'], ['#ed-bo', 'bo'], ['#ed-wt', 'wt'], ['#ed-ts', 'ts'], ['#ed-fk', 'fk'], ['#ed-fc', 'fc'], ['#ed-ff', 'ff'], ['#ed-zu', 'zu'], ['#ed-gl', 'gl'], ['#ed-zc', 'zc']]) { const el = $(id); if (el && el.value !== String(o[k])) el.value = o[k]; }
    $('#ed-rwidth').value = o.rwidth; mfRow(); $('#ed-mf').value = o.mfKind || '';
    $('#ed-pfill').checked = !!o.pfill; $('#ed-brow').checked = !!o.brow; $('#ed-dens').value = o.dens ?? 0.5; $('#ed-dens-v').textContent = `${Math.round((o.dens ?? 0.5) * 100)}%`; syncPsize(); $('#ed-pshape').value = o.pshape || 'normal'; $('#ed-psize-v').textContent = psizeLabel();
    $('#ed-pyard').checked = !!o.pyard;
    document.querySelectorAll('#ed-rmode button').forEach((x) => x.classList.toggle('on', x.dataset.m === o.rmode));
    document.querySelectorAll('#ed-skind button').forEach((x) => x.classList.toggle('on', x.dataset.k === o.skind));
    if ($('#ed-scolor') && SIGN_COLORS[o.skind] && !$('#ed-scolor').querySelector(`option[value="${o.scolor}"]`)) { o.scolor = ''; $('#ed-skind button.on')?.click(); }
  };
  // plot size (its own slider): small = narrow street-front lots, large = wide deep plots (row: a little narrower)
  // plot size 0..1 (tiny..huge), 1.25 = mix; shape narrow / normal / wide / mix: a mix gives every plot its own
  function plotDims(o) { const mS = (o.psize ?? 0.5) > 1, mH = o.pshape === 'mix', z = mS ? 0.5 : o.psize ?? 0.5, [kw, kd] = { narrow: [0.65, 1.2], wide: [1.6, 0.75] }[o.pshape] || [1, 1];
    return { width: +((o.brow ? 8 + 12 * z : 8 + 14 * z) * kw).toFixed(1), depth: +((18 + 16 * z) * kd).toFixed(1), ...(mS || mH ? { mix: { size: mS, shape: mH }, seed: o.mixSeed ??= Math.floor(Math.random() * 1e6) } : {}) }; }
  const psizeLabel = () => { const D = plotDims(o), mS = (o.psize ?? 0.5) > 1; return mS ? 'varied' : `${o.pshape === 'mix' ? '~' : ''}${Math.round(D.width)}×${Math.round(D.depth)} m`; };
  // ---------------------------------------------------------------- option wiring
  document.querySelectorAll('#ed-rmode button').forEach((b) => (b.onclick = () => { o.rmode = b.dataset.m; document.querySelectorAll('#ed-rmode button').forEach((x) => x.classList.toggle('on', x === b)); cancel(); }));
  $('#ed-rtype').onchange = (e) => { o.rtype = e.target.value; o.rwidth = ROAD_TYPES[o.rtype].width; $('#ed-rwidth').value = o.rwidth; };
  $('#ed-rwidth').onchange = (e) => { o.rwidth = +e.target.value || ROAD_TYPES[o.rtype].width; };
  $('#ed-rraise').onchange = (e) => { o.rraise = e.target.checked; };
  $('#ed-rapron').onchange = (e) => { o.rapron = e.target.checked; };
  $('#ed-rapronw').onchange = (e) => { o.rapronW = Math.max(2, Math.min(25, +e.target.value || 10)); };
  $('#ed-dens').oninput = (e) => { o.dens = +e.target.value; $('#ed-dens-v').textContent = `${Math.round(o.dens * 100)}%`; };
  $('#ed-brow').onchange = (e) => { o.brow = e.target.checked; $('#ed-psize-v').textContent = psizeLabel(); };
  $('#ed-pshape').onchange = (e) => { o.pshape = e.target.value; $('#ed-psize-v').textContent = psizeLabel(); };
  function syncPsize() { const z = (o.psize ?? 0.5) > 1 ? 'mix' : String(o.psize ?? 0.5); $('#ed-psize').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.z === z)); }
  $('#ed-psize').querySelectorAll('button').forEach((b) => (b.onclick = () => { o.psize = b.dataset.z === 'mix' ? 1.25 : +b.dataset.z; syncPsize(); $('#ed-psize-v').textContent = psizeLabel(); }));
  $('#ed-pf').onchange = (e) => { o.pf = e.target.value; };
  $('#ed-pfill').onchange = (e) => { o.pfill = e.target.checked; };
  if ($('#ed-firr')) $('#ed-firr').onchange = (e) => { o.firr = e.target.checked; };
  o.zc ??= '';
  o.pyard ??= true; // yards on by default
  $('#ed-zc').onchange = (e) => { o.zc = e.target.value; const C = ZONE_CATS[o.zc]; if (C) { const { psize: _ps, pshape: _sh, ...ui } = C.ui || {}; Object.assign(o, ui, { brow: !['residential', 'wealthy'].includes(o.zc), pyard: true }); /* plot size and shape stay as the user set them */ api.syncOpts?.(); } }; // row on for every category but residential; yards always on
  $('#ed-pyard').onchange = (e) => { o.pyard = e.target.checked; };
  $('#ed-bk').onchange = (e) => { o.bk = e.target.value; pend = null; };
  $('#ed-bc').onchange = (e) => { o.bc = e.target.value; pend = null; };
  $('#ed-bo').onchange = (e) => { o.bo = e.target.value; pend = null; };
  $('#ed-wt').onchange = (e) => { o.wt = e.target.value; };
  $('#ed-wh').onchange = (e) => { o.wh = e.target.value ? +e.target.value : null; };
  $('#ed-wp').onchange = (e) => { o.wp = e.target.value ? +e.target.value : null; };
  $('#ed-ts').onchange = (e) => { o.ts = e.target.value; };
  $('#ed-tsp').oninput = (e) => { o.tsp = +e.target.value; $('#ed-tsp-v').textContent = `${o.tsp} m`; };

  // ---------------------------------------------------------------- preview drawing
  const overlay = new THREE.Group();
  overlay.renderOrder = 998;
  stage.scene.add(overlay);
  const lineMat = lineStyle(HI.green, 3);
  const dimMat = lineStyle(HI.green, 1.6, 0.6), thinMat = lineStyle(HI.green, 1, 0.4);
  const snapMat = lineStyle(HI.bright, 2.5);
  const clearOverlay = () => { for (const c of [...overlay.children]) { c.geometry.dispose(); overlay.remove(c); } };
  const drape = (pts, lift = 0.2) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)); for (let k = 0; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; out.push(x, T().height(x, z) + lift, z); } } const l = pts[pts.length - 1]; if (l) out.push(l[0], T().height(l[0], l[1]) + lift, l[1]); return out; };
  const addLine = (pts, mat = lineMat, closed = false) => {
    if (pts.length < 2) return;
    const P = closed ? [...pts, pts[0]] : pts;
    fatLine(overlay, drape(P), mat, 998);
  };
  const offsetLine = (pts, d) => pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] - (dz / l) * d, p[1] + (dx / l) * d]; });
  const ringAt = (p, r, mat = snapMat) => addLine(Array.from({ length: 17 }, (_, i) => [p[0] + Math.cos((i / 16) * 6.283) * r, p[1] + Math.sin((i / 16) * 6.283) * r]), mat);
  // plots are always outlined in build mode
  const plotLines = new THREE.Group(); stage.scene.add(plotLines);
  // the plot you're on (selected, or its building selected, or being edited) gets the bold outline; the rest a thin one
  const activePlot = () => {
    if (api.plotEdit) return api.plotEdit;
    const id = state.selected; if (!id) return null;
    const P = state.spec.plots || [];
    if (P.some((p) => p.id === id)) return id;
    const st = (state.spec.structures || []).find((q) => q.id === id);
    return st?.plot || st?.inPlot || P.find((p) => p.building === id)?.id || null;
  };
  function drawPlots() {
    for (const c of [...plotLines.children]) { c.geometry.dispose(); plotLines.remove(c); }
    if (!ed.on) return;
    const act = activePlot();
    for (const pl of state.spec.plots || []) {
      const on = pl.id === act;
      fatLine(plotLines, drape([...pl.poly, pl.poly[0]], 0.12), on ? boldMat : thinMat, on ? 996 : 995);
      // the street front (edge 0) a little brighter, so it's clear which way the plot faces
      fatLine(plotLines, drape([pl.poly[0], pl.poly[1]], 0.16), on ? boldFront : frontMat, on ? 998 : 997);
    }
  }
  const frontMat = lineStyle(HI.green, 1.3, 0.6), boldMat = lineStyle(HI.green, 2.6, 0.95), boldFront = lineStyle(HI.green, 3.4, 1);
  api.onWorld.push(drawPlots);

  // ---------------------------------------------------------------- plot editing (double-click a plot)
  // Generated contents (fences, area props / sheds / corral, the field) become real spec items tagged
  // { inPlot, bake: 'fence' | 'use' }; the building already is one. Hand edits mark items `touched`.
  const LISTS_IN = ['props', 'walls', 'structures', 'fields'];
  const plotOf = (id) => (state.spec.plots || []).find((q) => q.id === id);
  // fence-side names as seen from the street looking into the plot: street · left · right · back (more sides numbered)
  function sideNames(P) {
    const n = P.length, c = P.reduce((a, q) => [a[0] + q[0] / n, a[1] + q[1] / n], [0, 0]), f = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
    let ox = f[0] - c[0], oz = f[1] - c[1]; const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L; // out toward the street
    const rx = oz, rz = -ox; // the viewer's right, looking in (-out)
    const names = P.map((_, i) => { if (!i) return 'street'; const a = P[i], b = P[(i + 1) % n], vx = (a[0] + b[0]) / 2 - c[0], vz = (a[1] + b[1]) / 2 - c[1], fr = vx * ox + vz * oz, rr = vx * rx + vz * rz;
      return Math.abs(rr) > Math.abs(fr) ? (rr > 0 ? 'right' : 'left') : fr < 0 ? 'back' : 'front'; });
    const cnt = {}; names.forEach((k) => (cnt[k] = (cnt[k] || 0) + 1)); const seen = {};
    return names.map((k) => (cnt[k] > 1 ? `${k} ${(seen[k] = (seen[k] || 0) + 1)}` : k));
  }
  const pathAtS = (P, sAt) => { let acc = 0; for (let i = 0; i < P.length - 1; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (sAt <= acc + L || i === P.length - 2) { const t = L ? Math.min(1, Math.max(0, (sAt - acc) / L)) : 0; return [+(P[i][0] + (P[i + 1][0] - P[i][0]) * t).toFixed(2), +(P[i][1] + (P[i + 1][1] - P[i][1]) * t).toFixed(2)]; } acc += L; } return P[0]; };
  const pathLen = (P) => { let L = 0; for (let i = 0; i < P.length - 1; i++) L += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); return L; };
  function bakePlot(pl) {
    const W = state.world; let ch = false;
    const tag = (e, b) => { e.inPlot = pl.id; e.bake = b; return e; };
    if (!pl.bakedFence) {
      const walls = (state.spec.walls ||= []);
      for (const w of W.plotWalls || []) if (w._plot === pl.id) { const e = structuredClone(w); delete e._plot; if (e.height == null) delete e.height; walls.push(tag(e, 'fence')); }
      pl.bakedFence = true; delete pl.gates; ch = true;
    }
    const use = pl.use || 'building';
    if (use !== 'building' && use !== 'empty' && pl.bakedUse !== use) {
      const ren = (id) => id && id.replace(':use', '-use');
      if (['visitors', 'market', 'wayhouse'].includes(use)) {
        const rec = W.areaRec?.[`${pl.id}:use`];
        if (!rec) return ch;
        let n = 0;
        for (const p of rec.props) { const e = structuredClone(p); e.id = ren(e.id) || `${pl.id}-p${++n}`; if (!e.name) e.label = false; e.at = e.at.map((v) => +v.toFixed(2)); if (e.rot != null) e.rot = Math.round(e.rot * 10) / 10; (state.spec.props ||= []).push(tag(e, 'use')); }
        for (const f of rec.walls) {
          const e = structuredClone(f); e.id = ren(e.id) || `${pl.id}-w${++n}`; if (e.height == null) delete e.height;
          const L = pathLen(e.closed ? [...e.path, e.path[0]] : e.path);
          if (e.gates) e.gates = e.gates.map((g) => { const { at, ...r } = g; return { ...r, s: +(g.s ?? (at ?? 0) * L).toFixed(2) }; });
          (state.spec.walls ||= []).push(tag(e, 'use'));
        }
        for (const st of rec.structures) { const e = structuredClone(st); delete e._area; e.id = ren(e.id) || `${pl.id}-s${++n}`; (state.spec.structures ||= []).push(tag(e, 'use')); }
      } else {
        const f = plotDerived({ plots: [{ ...pl, bakedUse: null }] }).fields[0];
        if (f) { const e = { ...structuredClone(f), id: `${pl.id}-field` }; delete e._plot; (state.spec.fields ||= []).push(tag(e, 'use')); }
      }
      pl.bakedUse = use; ch = true;
    }
    return ch;
  }
  // fences back to generated ones (gates kept as plot gates)
  function unbakeFences(pl) {
    if (!pl.bakedFence) return;
    const walls = state.spec.walls || [], mine = walls.filter((w) => w.inPlot === pl.id && w.bake === 'fence');
    const gates = mine.flatMap((w) => (w.gates || []).filter((g) => g.s != null).map((g) => { const { s: sAt, ...r } = g; return { ...r, at: pathAtS(w.path, sAt) }; }));
    if (gates.length) pl.gates = gates; else delete pl.gates;
    state.spec.walls = walls.filter((w) => !mine.includes(w));
    delete pl.bakedFence;
  }
  function unbakeUse(pl, keepTouched) {
    const drop = (e) => e.inPlot === pl.id && e.bake === 'use' && !(keepTouched && e.touched);
    for (const k of [...LISTS_IN, 'paint']) if (state.spec[k]) state.spec[k] = state.spec[k].filter((e) => !drop(e));
    if (state.spec.vegetation?.plants) state.spec.vegetation.plants = state.spec.vegetation.plants.filter((e) => !drop(e));
    delete pl.bakedUse;
  }
  // everything the plot made (and any hand edits to it) goes; the plot generates afresh
  function clearPlot(pl) {
    for (const k of LISTS_IN) if (state.spec[k]) state.spec[k] = state.spec[k].filter((e) => e.inPlot !== pl.id);
    delete pl.bakedFence; delete pl.bakedUse; delete pl.gates; delete pl.gatesEdited;
  }
  api.plotBake = { bakePlot, unbakeFences, unbakeUse, clearPlot };

  // ---------------------------------------------------------------- shift-click multi-select of plots (for Merge)
  const multi = new Set(); api.multi = multi;
  const multiLines = new THREE.Group(); stage.scene.add(multiLines);
  const multiMat = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  function drawMulti() {
    for (const c of [...multiLines.children]) { c.geometry.dispose(); multiLines.remove(c); }
    for (const id of [...multi]) if (!plotOf(id)) multi.delete(id);
    if (!ed.on || multi.size < 1) return;
    const pos = [], w = 0.16;
    for (const id of multi) {
      const C = [...plotOf(id).poly, plotOf(id).poly[0]];
      for (let i = 0; i < C.length - 1; i++) {
        const a = C[i], b = C[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * w, nz = (b[0] - a[0]) / L * w, n = Math.max(1, Math.ceil(L / 1.5));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n, P0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], P1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          const y0 = T().height(P0[0], P0[1]) + 0.22, y1 = T().height(P1[0], P1[1]) + 0.22;
          pos.push(P0[0] - nx, y0, P0[1] - nz, P0[0] + nx, y0, P0[1] + nz, P1[0] + nx, y1, P1[1] + nz, P0[0] - nx, y0, P0[1] - nz, P1[0] + nx, y1, P1[1] + nz, P1[0] - nx, y1, P1[1] - nz);
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, multiMat); m.renderOrder = 999; m.frustumCulled = false; multiLines.add(m);
  }
  api.plotAt = (p) => (state.spec.plots || []).find((q) => pointInPoly(p.x, p.z, q.poly)) || null;
  api.multiToggle = (id) => {
    if (!multi.size && state.selected && state.selected !== id && plotOf(state.selected)) multi.add(state.selected);
    if (multi.has(id)) multi.delete(id); else multi.add(id);
    const cur = multi.has(id) ? id : [...multi].pop() || null;
    api._multiKeep = true; api.select(cur); api._multiKeep = false;
    drawMulti();
  };
  api.multiClear = () => { if (multi.size) { multi.clear(); drawMulti(); } };
  api.onWorld.push(() => drawMulti());
  function mergeMulti() {
    const list = [...multi].map(plotOf).filter(Boolean), U = unionPlots(list);
    if (!U.ok) return;
    const keep = list[0];
    for (const q of list) {
      if (q.bakedUse) unbakeUse(q, true);
      clearPlot(q);
      if (q.yard) { clearYard(state.spec, q, true); delete q.yard; }
      if (q.building) { const k = (state.spec.structures || []).findIndex((x) => x.id === q.building); if (k >= 0) state.spec.structures.splice(k, 1); delete q.building; }
    }
    keep.poly = U.poly;
    const same = list.filter((q) => q.road === keep.road && q.s0 != null && q.s1 != null);
    if (same.length === list.length) { keep.s0 = Math.min(...same.map((q) => Math.min(q.s0, q.s1))); keep.s1 = Math.max(...same.map((q) => Math.max(q.s0, q.s1))); }
    for (const q of list.slice(1)) { const i = state.spec.plots.indexOf(q); if (i >= 0) state.spec.plots.splice(i, 1); }
    if (!keep.use) buildOn(keep); else if (NEW_USES.includes(keep.use)) populate(keep);
    multi.clear(); state.selected = keep.id;
  }

  const focusLines = new THREE.Group(); stage.scene.add(focusLines);
  const focusMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const tagEl = document.createElement('div');
  tagEl.id = 'plot-tag'; tagEl.innerHTML = '<b>Editing plot</b> · Esc to exit';
  document.body.appendChild(tagEl);
  function drawFocus() {
    for (const c of [...focusLines.children]) { c.geometry.dispose(); focusLines.remove(c); }
    const pl = api.plotEdit && plotOf(api.plotEdit);
    if (!pl || !ed.on) { U.uFocusOn.value = 0; tagEl.classList.remove('on'); return; }
    // dim everything outside the polygon (shader), bright ribbon round it
    const P = pl.poly.length > 24 ? pl.poly.filter((_, i) => i % Math.ceil(pl.poly.length / 24) === 0) : pl.poly;
    P.forEach((q, i) => U.uFocus.value[i].set(q[0], q[1]));
    U.uFocusN.value = P.length; U.uFocusOn.value = 1;
    const pos = [], w = 0.14, C = [...pl.poly, pl.poly[0]];
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * w, nz = (b[0] - a[0]) / L * w, n = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, P0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], P1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const y0 = T().height(P0[0], P0[1]) + 0.18, y1 = T().height(P1[0], P1[1]) + 0.18;
        pos.push(P0[0] - nx, y0, P0[1] - nz, P0[0] + nx, y0, P0[1] + nz, P1[0] + nx, y1, P1[1] + nz, P0[0] - nx, y0, P0[1] - nz, P1[0] + nx, y1, P1[1] + nz, P1[0] - nx, y1, P1[1] - nz);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, focusMat); m.renderOrder = 999; m.frustumCulled = false; focusLines.add(m);
    tagEl.classList.add('on');
  }
  api.enterPlot = (id) => {
    const pl = plotOf(id); if (!pl) return;
    api.plotEdit = id; api.select?.(null);
    if (bakePlot(pl)) commit(0); // no undo step: nothing visible changes
    drawFocus(); drawPlots();
    api.flash?.('Editing the plot · double-click outside or Esc to exit');
  };
  api.exitPlot = () => { if (!api.plotEdit) return false; api.plotEdit = null; drawFocus(); drawPlots(); return true; };
  api.inPlotEdit = (p, m = 0.4) => { const pl = api.plotEdit && plotOf(api.plotEdit); if (!pl) return true; if (pointInPoly(p.x, p.z, pl.poly)) return true; const C = [...pl.poly, pl.poly[0]]; for (let i = 0; i < C.length - 1; i++) if (segD(p, C[i], C[i + 1]) < m) return true; return false; };
  api.onWorld.push(() => {
    if (!api.plotEdit) return;
    const pl = plotOf(api.plotEdit);
    if (!pl) { api.exitPlot(); return; }
    if (bakePlot(pl)) commit(0); // undo back past the bake, use changed, regenerated: bake again
    drawFocus();
  });

  // ---------------------------------------------------------------- snapping
  const roads = () => state.world.roads.filter((r) => !r._gate);
  // roads snap to road ends / centrelines; everything else (walls, rows, props, retaining walls) to a
  // road's EDGE, at the chosen offset, on the side the cursor is — and to the ends of other walls
  const EDGE_TOOLS = new Set(['wall', 'row', 'prop', 'retain', 'scatter']);
  api.snapEdge = (p, opts = {}) => {
    const r = snapEdge0(p, opts);
    api.edgeSnapped = !!(r && r.kind === 'edge');
    return r;
  };
  const snapEdge0 = (p, opts) => {
    if (!o.snap || api.alt) return null;
    let best = null;
    if (opts.walls !== false) for (const w of state.spec.walls || []) for (const e of [w.path[0], w.path[w.path.length - 1]]) { const d = Math.hypot(e[0] - p.x, e[1] - p.z); if (d < 1.5 && (!best || d < best.dd)) best = { x: e[0], z: e[1], dd: d, kind: 'end' }; }
    if (best) return best;
    for (const r of roads()) {
      const q = nearestOnSamples(r.samples, p.x, p.z);
      const edge = r.hw + (r.frontage || 0) + (r.shoulder ? r.shoulder * 0.5 : 0) + (o.off || 0) + (opts.extra || 0);
      if (q.d > edge + 3) continue;
      const a = r.samples[q.i], b = r.samples[Math.min(q.i + 1, r.samples.length - 1)];
      const side = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= 0 ? 1 : -1;
      const tx = a.tx, tz = a.tz, nx = -tz * side, nz = tx * side;
      const c = { x: q.qx + nx * edge, z: q.qz + nz * edge, dd: Math.abs(q.d - edge), kind: 'edge', rot: (Math.atan2(nx, nz) * 180) / Math.PI + 180, road: r.id };
      if (!best || c.dd < best.dd) best = c;
    }
    return best;
  };
  function snap(p, from) {
    if (EDGE_TOOLS.has(ed.tool)) {
      const e = api.snapEdge(p);
      let out = e ? { x: e.x, z: e.z, snapped: e.kind, road: e.road } : { x: p.x, z: p.z };
      if (from && api.shift && !e) { const dx = out.x - from[0], dz = out.z - from[1], L = Math.hypot(dx, dz), a = Math.round(Math.atan2(dz, dx) / (Math.PI / 12)) * (Math.PI / 12); out = { x: from[0] + Math.cos(a) * L, z: from[1] + Math.sin(a) * L, snapped: 'angle' }; }
      return out;
    }
    if (!o.snap || api.alt) return { x: p.x, z: p.z };
    let best = null;
    // road ends, then road centrelines
    for (const r of roads()) for (const e of [r.path[0], r.path[r.path.length - 1]].map((q) => ({ x: q[0], z: q[1] }))) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < 4 && (!best || d < best.d)) best = { x: e.x, z: e.z, d, kind: 'end' };
    }
    if (!best) for (const r of roads()) {
      const q = nearestOnSamples(r.samples, p.x, p.z);
      if (q.d < r.hw + 2 && (!best || q.d < best.d)) best = { x: q.qx, z: q.qz, d: q.d, kind: 'road' };
    }
    let out = best ? { x: best.x, z: best.z, snapped: best.kind } : { x: p.x, z: p.z };
    if (from && api.shift && !best) {
      const dx = out.x - from[0], dz = out.z - from[1], L = Math.hypot(dx, dz), a = Math.round(Math.atan2(dz, dx) / (Math.PI / 12)) * (Math.PI / 12);
      out = { x: from[0] + Math.cos(a) * L, z: from[1] + Math.sin(a) * L, snapped: 'angle' };
    }
    if (ed.tool === 'road' && !best) out = edgeClamp(out);
    return out;
  }

  // ---------------------------------------------------------------- tools
  let chain = null; // road / wall / row in progress: { pts, ctrl?, free? }
  function cancel() { chain = null; clearOverlay(); }
  // curved roads: a smooth spline through every clicked point (centripetal Catmull-Rom), sampled about every 2 m
  const spline = (K, step = 2) => {
    const P = K.filter((q, i) => !i || Math.hypot(q[0] - K[i - 1][0], q[1] - K[i - 1][1]) > 0.5);
    if (P.length < 3) return P.map((q) => [...q]);
    const out = [[...P[0]]], X = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]];
    for (let i = 1; i < X.length - 2; i++) {
      const [p0, p1, p2, p3] = [X[i - 1], X[i], X[i + 1], X[i + 2]];
      const dt = (a, b) => Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5), t1 = dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3);
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 1; k <= n; k++) {
        const t = t1 + ((t2 - t1) * k) / n, L = (a, b, ta, tb) => [0, 1].map((j) => ((tb - t) * a[j] + (t - ta) * b[j]) / (tb - ta));
        const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
        out.push(L(B1, B2, t1, t2));
      }
    }
    return out;
  };
  const quad = (a, c, b, step = 3) => { const L = Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]), n = Math.max(3, Math.ceil(L / step)), out = []; for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return out; };
  const r2 = (v) => Math.round(v * 100) / 100;
  // everything a new road would run over: buildings, plots (with their buildings), fields, props,
  // hand-placed plants and the wall pieces in its way
  function dense(pts, step = 1) { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); } out.push(pts[pts.length - 1]); return out; }
  function victims(pts, hw) {
    const D = dense(pts), near = (x, z, r) => D.some((q) => (q[0] - x) ** 2 + (q[1] - z) ** 2 < r * r);
    const box = [Math.min(...D.map((q) => q[0])) - hw - 30, Math.min(...D.map((q) => q[1])) - hw - 30, Math.max(...D.map((q) => q[0])) + hw + 30, Math.max(...D.map((q) => q[1])) + hw + 30];
    const inBox = (x, z) => x > box[0] && x < box[2] && z > box[1] && z < box[3];
    const inOBB = (m, x, z, pad) => { const dx = x - m.cx, dz = z - m.cz, c = Math.cos(m.r), sn = Math.sin(m.r); return Math.abs(dx * c - dz * sn) <= m.w / 2 + pad && Math.abs(dx * sn + dz * c) <= m.d / 2 + pad; };
    const polyHit = (P) => D.some((q) => pointInPoly(q[0], q[1], P) || P.some((a, i) => segD({ x: q[0], z: q[1] }, a, P[(i + 1) % P.length]) < hw));
    const out = { structures: [], plots: [], fields: [], props: [], plants: [], walls: [] };
    if (['path', 'track'].includes(ROAD_TYPES[o.rtype]?.type) && ed.tool === 'road') { // footpaths and tracks wind round what's there: only loose props and plants move
      for (const p of state.spec.props || []) if (p.id && p.at && inBox(p.at[0], p.at[1]) && near(p.at[0], p.at[1], hw + 0.3) && !p.inPlot) out.props.push(p.id);
      (state.spec.vegetation?.plants || []).forEach((p, i) => { if (inBox(p.at[0], p.at[1]) && near(p.at[0], p.at[1], hw + 0.3)) out.plants.push(i); });
      return out;
    }
    const ids = new Set((state.spec.structures || []).map((st) => st.id));
    for (const st of state.world.structures) if (ids.has(st.id) && st._masses.some((m) => inBox(m.cx, m.cz) && D.some((q) => inOBB(m, q[0], q[1], hw)))) out.structures.push(st.id);
    for (const pl of state.spec.plots || []) if (pl.poly.some((q) => inBox(q[0], q[1])) && polyHit(pl.poly)) { out.plots.push(pl.id); if (pl.building && !out.structures.includes(pl.building)) out.structures.push(pl.building); }
    for (const f of state.spec.fields || []) if (f.id && f.poly.some((q) => inBox(q[0], q[1])) && polyHit(f.poly)) out.fields.push(f.id);
    for (const p of state.spec.props || []) if (p.id && p.at && inBox(p.at[0], p.at[1]) && near(p.at[0], p.at[1], hw + 0.8)) out.props.push(p.id);
    (state.spec.vegetation?.plants || []).forEach((p, i) => { if (inBox(p.at[0], p.at[1]) && near(p.at[0], p.at[1], hw + 1)) out.plants.push(i); });
    for (const w of state.spec.walls || []) if (w.id && w.path.some((q) => inBox(q[0], q[1])) && dense(w.closed ? [...w.path, w.path[0]] : w.path, 0.5).some((q) => near(q[0], q[1], hw + 0.4))) out.walls.push(w.id);
    return out;
  }
  function clearPath(pts, hw) {
    const v = victims(pts, hw), S = state.spec;
    const drop = (k, list) => { if (list.length && S[k]) S[k] = S[k].filter((e) => !list.includes(e.id)); };
    drop('structures', v.structures); drop('plots', v.plots); drop('fields', v.fields); drop('props', v.props);
    if (v.plants.length) S.vegetation.plants = S.vegetation.plants.filter((_, i) => !v.plants.includes(i));
    // walls: cut out the pieces under the road, keep the rest
    const D = dense(pts), under = (x, z) => D.some((q) => (q[0] - x) ** 2 + (q[1] - z) ** 2 < (hw + 0.4) ** 2);
    for (const id of v.walls) {
      const i = S.walls.findIndex((w) => w.id === id), w = S.walls[i], P = dense(w.closed ? [...w.path, w.path[0]] : w.path, 0.5);
      const runs = []; let cur = null;
      for (const q of P) { if (under(q[0], q[1])) { cur = null; continue; } if (!cur) { cur = []; runs.push(cur); } cur.push(q); }
      const parts = runs.filter((r) => r.length > 3).map((r, k) => ({ ...w, id: k ? uid('wall') : w.id, closed: false, path: simplify(r, 0.05).map((q) => q.map(r2)), gates: [] }));
      S.walls.splice(i, 1, ...parts);
    }
    for (const pl of S.plots || []) if (pl.building && v.structures.includes(pl.building)) delete pl.building;
    rowParty(S);
    const n = v.structures.length + v.plots.length + v.fields.length;
    if (n) api.flash(`Road cleared ${[v.structures.length && `${v.structures.length} building(s)`, v.plots.length && `${v.plots.length} plot(s)`, v.fields.length && `${v.fields.length} field(s)`].filter(Boolean).join(', ')}`);
  }
  const redMat = lineStyle(HI.red, 3);
  function showVictims(pts, hw) {
    if (pts.length < 2) return;
    const v = victims(pts, hw);
    for (const id of v.structures) { const st = state.world.structures.find((x) => x.id === id); if (st) for (const m of st._masses) { const c = Math.cos(m.r), sn = Math.sin(m.r), P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const lx = (a * m.w) / 2 + a * 0.4, lz = (b * m.d) / 2 + b * 0.4; return [m.cx + lx * c + lz * sn, m.cz - lx * sn + lz * c]; }); addLine(P, redMat, true); } }
    for (const id of [...v.plots, ...v.fields]) { const e = (state.spec.plots || []).find((x) => x.id === id) || (state.spec.fields || []).find((x) => x.id === id); if (e) addLine(e.poly, redMat, true); }
  }
  function finishRoad() {
    if (!chain || chain.pts.length < 2) { cancel(); return; }
    const R = ROAD_TYPES[o.rtype];
    const pts = simplify(chain.pts, 0.25).map((q) => q.map(r2));
    pushUndo();
    clearPath(pts, (o.rwidth || R.width) / 2 + 0.5);
    (state.spec.roads ||= []).push({ id: uid('road'), type: R.type, width: o.rwidth || R.width, path: pts, smooth: o.rmode !== 'straight', era: o.rmode === 'straight' ? 'prewar' : 'postwar', condition: R.type === 'highway' ? 0.35 : R.type === 'paved' ? 0.5 : 0.65, ...(R.type === 'highway' ? { lines: true } : {}), ...(['highway', 'paved'].includes(R.type) ? { raised: o.rraise !== false ? 0.8 : 0 } : {}), ...(R.type === 'highway' && o.rapron !== false ? { frontage: o.rapronW || 10 } : {}) });
    cancel(); commit(80);
  }
  function finishField() {
    if (!chain || chain.pts.length < 3) { cancel(); return; }
    const poly = chain.pts; cancel();
    pushUndo();
    // auto: a crop and a fence picked per field, the way a farmer would (most are open or a light fence)
    const ar = new RNG(`${state.world.seed}:field:${Date.now()}`);
    const crop = o.fc === 'auto' || !o.fc ? ar.weighted({ corn: 4, beans: 2, chili: 1.5, squash: 1.5, mixed: 2, maguey: 0.6, nopal: 0.6 }) : o.fc;
    const fence = o.ff === 'auto' ? ar.weighted(o.fk === 'corral' ? { rail: 3, pole: 2, wire: 1, stone_low: 0.6 } : { none: 2.5, wire: 1.5, pole: 1.2, ocotillo: 1.4, stone_low: 1, rail: 0.4 }) : o.ff;
    const f = { id: uid('field'), type: o.fk === 'fallow' ? 'field' : o.fk, poly, ...(o.fk === 'fallow' ? { fallow: true } : {}), ...(o.fk === 'field' ? { crop } : {}), ...(fence !== 'none' ? { fence, gates: [{ at: 0.1, width: 3 }] } : {}) };
    if (o.fk === 'corral') { let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; } f.animals = { brahmin: Math.max(1, Math.min(10, Math.round(Math.abs(A / 2) / 90))) }; if (!f.fence) { f.fence = 'rail'; f.gates = [{ at: 0.1, width: 3 }]; } }
    if (o.fk === 'orchard') f.tree = 'fruit_tree';
    if (FARM_FIELDS.includes(f.type)) f.water = 'auto';
    (state.spec.fields ||= []).push(f);
    if (WATER && FARM_FIELDS.includes(f.type) && !f.fallow && o.firr !== false) digBranch(poly);
    commit(80);
  }
  // a short ditch from the nearest wet acequia / stream (within 30 m) to a new field, if the water can run there
  function digBranch(poly) {
    const W = state.world, paths = W?.irr?.wetPaths || []; if (!paths.length) { api.flash?.('No water near — dry-farmed (place a source and an acequia)'); return; }
    let best = null;
    const edgePts = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], c = poly[(i + 1) % poly.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); for (let t = 0; t <= L; t += 1) edgePts.push([a[0] + ((c[0] - a[0]) * t) / L, a[1] + ((c[1] - a[1]) * t) / L]); }
    for (const P of paths) for (let i = 0; i < P.length - 1; i++) { const [ax, az] = P[i], [bx, bz] = P[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
      for (let t = 0; t <= L; t += 1) { const q = [ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L]; for (const e of edgePts) { const d = Math.hypot(q[0] - e[0], q[1] - e[1]); if (d < 30 && (!best || d < best.d)) best = { d, q, e }; } } }
    if (!best) { api.flash?.('No water within 30 m — dry-farmed'); return; }
    if (best.d < 2.5) return; // already on the ditch
    const path = [best.q.map(r2), best.e.map(r2)], c = acequiaCourse(T(), path, state.spec.props);
    if (!c || c[0] !== path[0]) { api.flash?.('The water can\'t run uphill to this field — dry-farmed'); return; }
    (state.spec.walls ||= []).push({ id: uid('wall'), type: 'acequia', path: c, condition: 0.8, gates: [] });
  }
  function finishRetain() {
    if (!chain || chain.pts.length < 2) { cancel(); return; }
    pushUndo();
    const rt = { id: uid('retain'), type: o.rt, path: chain.pts.map((q) => q.map(r2)), side: o.rside, mode: o.rcut ? 'cut' : 'fill', rise: o.rrise, depth: o.rdepth, cap: o.rcap, rail: o.rrail, ...(chain.road ? { road: chain.road } : {}) };
    if (chain.closed) { rt.closed = true; delete rt.side; }
    (state.spec.retains ||= []).push(rt);
    cancel(); commit(80);
  }
  function finishWall() {
    if (!chain || chain.pts.length < 2) { cancel(); return; }
    pushUndo();
    const w = { id: uid('wall'), type: o.wt, path: chain.pts.map((q) => q.map(r2)), condition: 0.8, gates: [] };
    // water runs downhill: a stream is turned to flow from its high end; an acequia must fall all the way (a pump
    // at its head lifts a little) or it is refused
    if (w.type === 'stream') { w.path = downhill(T(), w.path); w.width = 1.1; }
    if (WATER && w.type === 'acequia') { const c = acequiaCourse(T(), w.path, state.spec.props); if (!c) { api.flash?.('An acequia can\'t run uphill — draw it falling from the source (a pump at its head lifts a little)'); cancel(); return; } w.path = c; }
    if (chain.closed) w.closed = true;
    if (o.wh) w.height = o.wh;
    if (o.wp != null) w.paint = o.wp;
    (state.spec.walls ||= []).push(w);
    cancel(); commit(80);
  }
  function previewChain(p) {
    clearOverlay();
    if (!chain) { if (p && (ed.tool === 'road' || ed.tool === 'wall' || ed.tool === 'row' || ed.tool === 'retain')) { const s = snap(p); if (s.snapped) ringAt([s.x, s.z], 1.2); } return; }
    const last = chain.pts[chain.pts.length - 1];
    let pts = [...chain.pts];
    if (p && !chain.free) {
      const s = ed.tool === 'paint' ? paintSnap(p) : snap(p, last);
      if (chain.knots) pts = spline([...chain.knots, [s.x, s.z]]);
      else pts = [...pts, [s.x, s.z]];
      if (s.snapped && s.snapped !== 'angle') ringAt([s.x, s.z], 1.2);
    }
    if (ed.tool === 'road') { const hw = (o.rwidth || 6) / 2; addLine(pts); addLine(offsetLine(pts, hw), dimMat); addLine(offsetLine(pts, -hw), dimMat); showVictims(pts, hw + 0.5); }
    else if (ed.tool === 'row') { addLine(pts); for (const q of rowPoints(pts[0], pts[pts.length - 1])) ringAt(q, 0.6, dimMat); }
    else if (ed.tool === 'retain') { addLine(pts); if (pts.length >= 2) { addLine(offsetLine(pts, o.rside * 1.2), dimMat); addLine(offsetLine(pts, o.rside * 2.4), dimMat); } } // the high side
    else if (ed.tool === 'paint') { addLine(pts, lineMat, pts.length >= 3); }
    else addLine(pts);
    if (chain.ctrl) ringAt(chain.ctrl, 0.8, dimMat);
  }
  function rowPoints(a, b) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.floor(L / o.tsp));
    return Array.from({ length: n + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  // plots in progress
  let strip = null;
  function plotPreview(p) {
    clearOverlay();
    if (!strip) { const q = p && nearestRoadPos(roads(), p.x, p.z, 30); if (q) { const s = q.road.samples, j = nearestOnSamples(s, p.x, p.z); ringAt([j.qx, j.qz], 1.2); } return; }
    const q = p && nearestOnSamples(strip.road.samples, p.x, p.z);
    if (!q) return;
    const a = strip.road.samples[q.i], b = strip.road.samples[Math.min(q.i + 1, strip.road.samples.length - 1)];
    strip.s1 = a.s + (b.s - a.s) * q.t;
    strip.preview = plotStrip(strip.road, strip.s0, strip.s1, strip.side, { ...plotDims(o), fence: o.pf, verge: 0.5 + (o.off ?? 0.5) }, isFree); // Offset moves the whole plot row back from the road
    for (const pl of strip.preview) addLine(pl.poly, lineMat, true);
  }
  const isFree = (x, z) => {
    const t = T();
    if (!t.inBounds(x, z, 1)) return false;
    if (state.world.roadNear(x, z, 0.6)) return false;
    for (const pl of state.spec.plots || []) if (pointInPoly(x, z, pl.poly)) return false;
    return true;
  };
  function applyState(st) {
    if (o.bl) st.layout = o.bl;
    if (o.bo) { st.origin = o.bo; if (o.bo === 'new' && !['adobe', 'stone', 'plaster', 'timber'].includes(st.material)) st.material = 'adobe'; if (o.bo === 'prewar' && ['adobe', 'stone', 'timber'].includes(st.material)) st.material = 'block'; if (o.bo === 'mixed') st.newShare ??= 0.5; }
    if (o.bc !== '' && o.bc != null) { st.condition = +o.bc; if (st.condition < 0.45) { delete st.roof; st.ruinType = o.brt || 'collapsed'; } }
  }
  function buildOn(pl, v = 0, ex = {}) {
    const st = autoBuilding(pl, { kind: ex.kind || o.bk, origins: ex.origins, layout: o.bl, setback: o.brow ? 'row' : 'tight', density: o.dens ?? 0.5, v }, state.world.seed);
    if (!st) return null;
    if (ex.mats && st.origin === 'new') st.material = new RNG(`${state.world.seed}:zmat:${pl.id}`).weighted(ex.mats);
    if (ex.cat) { st.zcat = ex.cat; pl.zcat = ex.cat; } // the category it came from (names lean on it)
    let W8 = null;
    if (ex.cat === 'wealthy' && st.origin !== 'ruin') { // the good side of town: kept, painted, decorated; varied good styles; walled
      const wr = (W8 = new RNG(`${state.world.seed}:wealthy:${pl.id}`));
      const tier = typeof st.finish === 'string' ? st.finish : wr.weighted({ painted: 1.5, decorated: 2.5, ornate: 1.5, showpiece: 0.4 });
      const body = wr.pick([0xeee6d6, 0xe8dcc4, 0xe6dcc4, 0xd9c39c, 0xd2a65e, 0xcf9f92, 0xb87458, 0x8aa4b4, 0xa9c2ae, 0xa6b08a, 0xe0c8b0, 0xc9b48e]);
      st.finish = { tier, body }; // one colour, so the garden wall can match it
      st.condition = Math.max(st.condition ?? 0, +wr.range(0.85, 0.97).toFixed(2));
      st.tileRoof = true; // a pitched roof here is tile, never tin
      if (st.origin === 'mixed') { st.origin = 'prewar'; delete st.newShare; } // kept whole: no half-rebuilt shells, no bare concrete frames
      delete st.adapt; // no bricked-up openings, no scrap lean-tos, no tin re-roofs
      if (wr.chance(0.65)) { st.grille = wr.weighted({ scroll: 2.5, sunburst: 2, diamond: 1, plain: 1 }); st.grilleDoor = wr.chance(0.5); } // good ironwork on the windows
      if (ex.biz) { st.kind = 'shop'; st.biz = wr.weighted({ estetica: 2, sastreria: 1.2, joyeria: 1, boutique: 1.5, fotografo: 0.8, notaria: 1 }); st.shape = 'rect'; delete st.heights; st.floors = wr.chance(0.35) ? 2 : 1; }
      if (ex.resto) { st.kind = 'cafe'; st.biz = 'restaurante'; delete st.layout; st.finish.tier = wr.weighted({ decorated: 1, ornate: 2, showpiece: 0.6 }); }
      if (st.kind !== 'house') { // shops and restaurants get a proper front too (never raw block, obra negra or tin)
        st.vstyle = wr.weighted(st.origin !== 'new' ? { storefront: 2, midcentury: 0.6, spanish: 0.35 } : { casona: 1.5, painted: 1.5, nortena: 1 });
        const S2 = STYLES[st.vstyle]; if (S2 && !S2.mats.includes(st.material)) st.material = S2.mats.includes('plaster') ? 'plaster' : S2.mats[0];
      }
      if (st.kind === 'house') {
        const pre = st.origin !== 'new';
        st.vstyle = wr.weighted(pre ? { spanish: 0.55, midcentury: 1.2, two_storey: 1.4, low_gable: 0.6, box_house: 0.8, nortena: 0.7 } : { casona: 2.2, nortena: 1.5, painted: 1, sonoran: 1.2 });
        const S = STYLES[st.vstyle]; if (S && !S.mats.includes(st.material)) st.material = S.mats.includes('plaster') ? 'plaster' : S.mats[0];
        delete st.roof; delete st.roofMat; // the style's own roof
        if (st.vstyle === 'spanish') [st.roof, st.roofMat] = wr.chance(0.5) ? ['gable', 'tile'] : ['hip', 'tile'];
        if (S?.floorsMin) st.floors = Math.max(st.floors || 1, S.floorsMin);
        const [w, d] = st.size, r = wr.next();
        // terraced most of all: a two-storey main block, lower wings whose roofs are the terraces; now and then a villa
        // round a courtyard; a plain box only rarely
        const multi = (st.floors || 1) >= 2 || (S?.floorsMin || 1) >= 2;
        if (!st.row && r < 0.1 && w >= 11 && d >= 9) { st.shape = 'courtyard'; delete st.heights; }
        else if ((multi ? r < 0.97 : r < 0.55) && w >= 6.5) { st.shape = st.row ? (wr.chance(0.4) ? 'L' : 'rect') : wr.pick(['L', 'L', 'T', 'stepped', 'rect']); st.heights = 'mixed'; st.floors = Math.max(st.floors || 1, 2); if (st.shape === 'rect') st.wing = +wr.range(0.35, 0.5).toFixed(2); }
        else if (!multi) { st.floors = 1; delete st.heights; } // a plain one-storey house
      }
      // any storey above the ground: stepped back as terraces, almost always (a plain box stays a one-storey thing)
      if ((st.floors || 1) >= 2 && st.shape !== 'courtyard' && !st.heights && wr.chance(0.95)) { st.heights = 'mixed'; if (st.shape === 'rect' || !st.shape) st.wing = +wr.range(0.35, 0.5).toFixed(2); }
      if (st.vstyle === 'nortena') st.color = body; // its one strong colour is the one picked here
      if (!pl.ground) pl.ground = wr.weighted([[{ surface: 'saltillo', cover: 'all' }, 2], [{ surface: 'laja', cover: 'all' }, 2], [{ surface: 'gravel', cover: 'all' }, 1.5], [{ surface: 'brick', cover: 'all' }, 1], [{ surface: 'encaustic', cover: 'patio', fill: 'gravel' }, 0.8]].map(([g, w2]) => [g, w2])); // never bare dirt
      // security: a good wall (stucco compound, painted plaster, ironwork or brick, never bare block), tall, wire or glass on top
      if ((pl.fence || 'auto') === 'auto') {
        pl.fence = wr.weighted({ compound: 3, adobe: 1.6, herreria: 1.0, brick: 0.3 });
        if (pl.fence !== 'brick') { const sh = wr.chance(0.6) ? 0 : wr.range(-0.06, 0.08), ch = (v) => Math.max(0, Math.min(255, Math.round(v + (sh > 0 ? (255 - v) * sh : v * sh)))); // the house colour, or a shade off it
          pl.fencePaint = (ch(body >> 16) << 16) | (ch((body >> 8) & 255) << 8) | ch(body & 255); }
        pl.fenceH = pl.fence === 'herreria' ? 2.1 : +wr.range(2.4, 2.8).toFixed(2);
        if (pl.fence !== 'herreria') { if (wr.chance(ex.resto ? 0.4 : 0.5)) pl.fenceBarbed = true; else if (wr.chance(0.4)) pl.fenceGlass = true; }
      }
    }
    st.id = uid('bld');
    applyState(st);
    (state.spec.structures ||= []).push(st);
    pl.building = st.id;
    rowParty(state.spec);
    if (W8) wealthyDress(pl, st, W8);
    if (o.pyard) populate(pl); // row houses get their back yards too
    return st;
  }
  // a wealthy plot's extras: the shopfront dressing of an upscale trade, a restaurant's dining garden, the guard's booth
  // inside the wall, now and then a garage for the family car (cars live indoors here)
  function wealthyDress(pl, st, wr) {
    if (!pl.gates?.length && !pl.bakedFence && !pl.row) { // the street gate, in line with the front door
      const F0 = plotFrame(pl), [u0] = toLocal(st.at[0] - F0.front[0], st.at[1] - F0.front[1], F0.rot), u = Math.max(-F0.w / 2 + 1.6, Math.min(F0.w / 2 - 1.6, u0)), [gx, gz] = toWorld(u, 0, F0.rot);
      pl.gates = [{ at: [+(F0.front[0] + gx).toFixed(2), +(F0.front[1] + gz).toFixed(2)], width: st.biz === 'restaurante' ? 3.2 : 2.4, leaf: 'metal' }];
    }
    const R = ((st.rot || 0) * Math.PI) / 180, [w, d] = st.size;
    const add = (type, lx, lz, rot = 0, extra = {}) => { const [x, z] = toWorld(lx, lz, R), at = [+(st.at[0] + x).toFixed(2), +(st.at[1] + z).toFixed(2)]; if (!pointInPoly(at[0], at[1], pl.poly)) return false; (state.spec.props ||= []).push({ id: uid('prop'), type, at, rot: Math.round((st.rot || 0) + rot), inPlot: pl.id, bake: 'yard', ...extra }); return true; };
    const F = plotFrame(pl), inBld = (x, z, m) => { const [u, v] = toLocal(x - st.at[0], z - st.at[1], R); return Math.abs(u) < w / 2 + m && Math.abs(v) < d / 2 + m; };
    const fz = d / 2 + (st.porch?.depth || 0);
    switch (st.biz) {
      case 'estetica': add('barber_pole', 1.0, d / 2 + 0.15); add('topiary', -(w / 2 - 0.5), fz + 0.6); add('topiary', w / 2 - 0.5, fz + 0.6); break;
      case 'sastreria': add('dress_form', -(w / 2 - 0.9), fz + 0.8, 10); if (w > 7) add('dress_form', -(w / 2 - 1.7), fz + 0.8, -15); add('topiary', w / 2 - 0.5, fz + 0.6); break;
      case 'joyeria': case 'boutique': add('topiary', -(w / 2 - 0.5), fz + 0.6); add('topiary', w / 2 - 0.5, fz + 0.6); if (st.biz === 'boutique') add('iron_bench', w / 2 - 1.8, fz + 0.9); break;
      case 'fotografo': add('topiary', w / 2 - 0.5, fz + 0.6); add('painted_sign', -(w / 2 - 1.0), fz + 1.4, 0, { text: 'RETRATOS' }); break;
      case 'notaria': add('brass_plaque', 1.2, fz + 0.5); add('citrus_pot', -(w / 2 - 0.5), fz + 0.6); add('citrus_pot', w / 2 - 0.5, fz + 0.6); break;
    }
    // free cells of the plot (plot frame: u across, v back from the street), clear of the building
    const cells = [];
    for (let u = -F.w / 2 + 1.5; u <= F.w / 2 - 1.5; u += 2.3) for (let v = -1.6; v >= -(F.d - 1.5); v -= 2.3) {
      const [x, z] = toWorld(u, v, F.rot), X = F.front[0] + x, Z = F.front[1] + z;
      if (pointInPoly(X, Z, pl.poly) && !inBld(X, Z, 1.2)) cells.push([X, Z, v]);
    }
    const put = (type, X, Z, rot = 0, extra = {}) => (state.spec.props ||= []).push({ id: uid('prop'), type, at: [+X.toFixed(2), +Z.toFixed(2)], rot: Math.round(rot), inPlot: pl.id, bake: 'yard', ...extra });
    if (st.biz === 'restaurante' && cells.length >= 2) { // the dining garden: tables under umbrellas, a fountain, lanterns, palms in pots
      cells.sort((a, b) => b[2] - a[2]); const n = Math.min(cells.length, 7);
      cells.slice(0, n).forEach(([X, Z], k) => { if (k === 0 && n >= 7 && wr.chance(0.3)) put('fountain', X, Z, 0, { radius: 1.0 }); else put(k % 3 === 2 ? 'cafe_table' : 'umbrella_table', X, Z, wr.range(0, 360)); });
      for (const sd of [-1, 1]) { const [x, z] = toWorld(sd * (F.w / 2 - 0.7), -0.7, F.rot); put('pier_lamp', F.front[0] + x, F.front[1] + z, F.deg); }
      for (let k = 0; k < Math.min(4, cells.length - n + 2); k++) { const c = cells[(n + k) % cells.length]; put(wr.chance(0.5) ? 'citrus_pot' : 'topiary', c[0] + wr.range(-0.6, 0.6), c[1] + wr.range(-0.6, 0.6)); }
    }
    // fairy lights: a string or two over the garden (warm white); a café or restaurant strings coloured ones over the tables
    { const colored = st.biz === 'restaurante' || st.kind === 'cafe' || st.kind === 'cantina', nS = colored ? Math.min(3, Math.max(1, Math.floor(cells.length / 2))) : wr.chance(0.6) ? 1 + (wr.chance(0.3) ? 1 : 0) : 0;
      const free = cells.slice().sort((a, b) => b[2] - a[2]);
      for (let k = 0; k < nS && free.length >= 2; k++) { const A = free[k % free.length], B = free[(k + 2) % free.length] || free[free.length - 1]; const L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 2.5 || L > 12) continue;
        put('fairy_lights', (A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (Math.atan2(B[0] - A[0], B[1] - A[1]) * 180) / Math.PI - 90, { length: +L.toFixed(2), height: 2.5, colored, powered: true }); } }
    // the guard's booth just inside the street wall
    if (wr.chance(st.biz === 'restaurante' ? 0.5 : st.biz ? 0.2 : 0.12)) for (const sd of wr.chance(0.5) ? [1, -1] : [-1, 1]) {
      const [x, z] = toWorld(sd * (F.w / 2 - 1.6), -1.7, F.rot), X = F.front[0] + x, Z = F.front[1] + z;
      if (pointInPoly(X, Z, pl.poly) && !inBld(X, Z, 1.6)) { put('guard_shack', X, Z, F.deg + 180, { width: 1.8, depth: 1.8 }); break; }
    }
    // now and then a garage for the family car, built on the street line in a front corner, its door onto the street (the
    // plot wall runs into it); the car lives inside
    if (st.kind === 'house' && wr.chance(0.08)) {
      const gw = 3.6, gd = 6, F2 = plotFrame(pl), hb = (x, z) => inBld(x, z, 0.6);
      for (const sd of wr.chance(0.5) ? [1, -1] : [-1, 1]) {
        const u = sd * (F2.w / 2 - gw / 2 - 0.25), v = -(gd / 2) - 0.05, [x, z] = toWorld(u, v, F2.rot), X = F2.front[0] + x, Z = F2.front[1] + z;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b2]) => { const [cx, cz] = toWorld(u + a * gw / 2, v + b2 * gd / 2, F2.rot); return [F2.front[0] + cx, F2.front[1] + cz]; });
        if (!corners.every(([cx, cz]) => pointInPoly(cx, cz, pl.poly)) || corners.some(([cx, cz]) => hb(cx, cz)) || hb(X, Z)) continue;
        const g = { id: uid('bld'), kind: 'garage', size: [gw, gd], at: [+X.toFixed(2), +Z.toFixed(2)], rot: Math.round(F2.deg * 10) / 10, floors: 1, origin: st.origin === 'prewar' ? 'prewar' : 'new', material: 'plaster', finish: st.finish, condition: st.condition, roof: 'flat', roofMat: 'slab', tileRoof: true, zcat: 'wealthy', label: false, signs: false, snap: false, _sub: true, inPlot: pl.id, bake: 'yard' };
        applyState(g); state.spec.structures.push(g); break;
      }
    }
  }
  // yard planner (yards.js): populate a plot round the building on it (an open yard when there is none; never builds)
  function populate(pl, reroll = false) {
    if (NEW_USES.includes(pl.use)) { // town plot uses: plaza, cemetery, vineyard, era, brickyard, salvage, palenque, lienzo
      if (reroll || pl.bakedUse) { unbakeUse(pl, true); pl.uv = (pl.uv || 0) + (reroll ? 1 : 0); }
      return applyUse(state.spec, pl, pl.use, planUse(state.spec, pl, pl.use, { seed: state.world.seed, v: pl.uv || 0 }), uid);
    }
    if (reroll) { clearYard(state.spec, pl, true); pl.yv = (pl.yv || 0) + 1; }
    const plan = planYard(state.spec, pl, { seed: state.world.seed, v: pl.yv || 0, household: pl.household, life: pl.life, density: pl.density, world: state.world, kind: o.bk, origins: o.bo ? { [o.bo]: 1 } : null });
    if (!plan) { api.flash?.('Nothing fits on this plot'); return false; }
    applyYard(state.spec, pl, plan, uid);
    if (plan.structure) { applyState(plan.structure); rowParty(state.spec); }
    return true;
  }
  api.populate = populate; api.fillPlot = (pl, k, cat) => fillPlot(pl, k, ZONE_CATS[cat], cat); // (tests)

  // where a sign goes: on a building's wall (flat, above the openings), on its roof (on a frame), or on the ground
  const sRay = new THREE.Raycaster();
  function buildingUnder(e) { // the building face under the cursor (walls and roofs), from a real ray cast
    if (e?.clientX == null) return null;
    const el = stage.renderer.domElement, rc = el.getBoundingClientRect();
    sRay.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), stage.camera);
    const objs = [], owner = new Map();
    for (const [id, it] of state.world.items || []) if (it.type === 'structure' && it.object) { objs.push(it.object); owner.set(it.object, id); }
    const hit = sRay.intersectObjects(objs, true).find((h) => h.face && !h.object.userData?.mural);
    if (!hit) return null;
    let ob = hit.object; while (ob && !owner.has(ob)) ob = ob.parent;
    const s = ob && (state.world.structures || []).find((x) => x.id === owner.get(ob));
    if (!s) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return { s, point: hit.point, n };
  }
  // until the text is typed by hand, a sign on a building reads the building's name (on open ground: the default)
  function signAutoText(e) {
    if (o.stextUser || !e || e.clientX == null) return;
    const bu = buildingUnder(e), nm = bu?.s && (state.world.items.get(bu.s.id)?.name || bu.s.name);
    const t = (nm || 'TACOS').toUpperCase();
    if (t !== o.stext) { o.stext = t; $('#ed-stext').value = t; signDimText(); }
  }
  function signHit(p, e) {
    const want = o.smount, D = signDims({ text: o.stext, size: o.ssize, kind: o.skind }), W = state.world, Tg = T();
    const ground = { mount: 'ground', x: p.x, z: p.z, rot: ed.propRot || 0 };
    if (want === 'ground') return ground;
    const bu = buildingUnder(e);
    if (bu && bu.s._masses?.length) { // pointing at a building: its wall or its roof, where the cursor is
      const { s, point, n } = bu, up = n.y > 0.55;
      let mm = s._masses[0], md = 1e9; for (const m of s._masses) { const dd = obbD(m, point.x, point.z); if (dd < md) { md = dd; mm = m; } }
      if ((up && want !== 'wall') || want === 'roof') {
        const rot = (mm.r * 180) / Math.PI + (ed.propRot || 0), flat = W.roofAt(point.x, point.z);
        if (flat != null && Math.abs(flat - point.y) < 0.4) return { mount: 'roof', x: point.x, z: point.z, rot };
        return { mount: 'roof', x: point.x, z: point.z, rot, extra: { ground: true, keep: true, seat: false, lift: +(point.y - 0.15 - Tg.height(point.x, point.z)).toFixed(2) } };
      }
      const [lx, lz] = toLocal(point.x - mm.cx, point.z - mm.cz, mm.r), hw = mm.w / 2, hd = mm.d / 2;
      const side = [['front', Math.abs(lz - hd)], ['back', Math.abs(lz + hd)], ['right', Math.abs(lx - hw)], ['left', Math.abs(lx + hw)]].sort((a, b) => a[1] - b[1])[0][0];
      const cl = (v, L) => (D.w >= 2 * L ? 0 : Math.max(-L + D.w / 2, Math.min(L - D.w / 2, v)));
      const loc = { front: [cl(lx, hw), hd + 0.02], back: [cl(lx, hw), -hd - 0.02], right: [hw + 0.02, cl(lz, hd)], left: [-hw - 0.02, cl(lz, hd)] }[side];
      const [wx, wz] = toWorld(loc[0], loc[1], mm.r), x = mm.cx + wx, z = mm.cz + wz, ground0 = Tg.height(x, z), base = s._y ?? ground0;
      // never over a door or window: if it would cover one, it goes just above it
      let yc = Math.max(0.5 + D.h / 2, point.y - base);
      const info2 = W.items?.get?.(s.id)?.info, sr = ((s.rot || 0) * Math.PI) / 180;
      for (let pass = 0; pass < 3; pass++) for (const op of info2?.openings || []) {
        const [ox, oz] = toWorld(op.x, op.z, sr), dd = Math.hypot(s.at[0] + ox - x, s.at[1] + oz - z);
        if (dd < D.w / 2 + (op.w || 1) / 2 + 0.1 && dd < 8 && yc - D.h / 2 < (op.y1 ?? 2.1) + 0.1 && yc + D.h / 2 > (op.y0 ?? 0)) yc = (op.y1 ?? 2.1) + 0.15 + D.h / 2;
      }
      // under the protruding vigas: hang it on the beam ends instead, on a plank fascia
      let vig = null;
      const VV = info2?.vigas;
      if (VV?.beams?.length) {
        const [slx, slz] = toLocal(x - s.at[0], z - s.at[1], sr), [mlx, mlz] = toLocal(slx - VV.mx, slz - VV.mz, (VV.mrot * Math.PI) / 180), FF = vigaFace(VV, mlx, mlz);
        if (FF && yc - D.h / 2 < VV.y1 + 0.04 && yc + D.h / 2 > VV.y0 - 0.04) { const reach = vigaReach(VV, FF.u, D.w); if (reach) { vig = { out: +(reach + 0.01).toFixed(2), fascia: true }; yc = VV.yc; } }
      }
      return { mount: 'wall', x, z, rot: (mm.r * 180) / Math.PI + { front: 0, back: 180, right: 90, left: -90 }[side], extra: { ...(vig || {}), height: +yc.toFixed(2), lift: +(base - ground0).toFixed(2), seat: false, ground: true, keep: true } };
    }
    // compound / yard walls: flat on the face you point at, like a building wall
    { const WT = { adobe: 0.44, block: 0.2, concrete: 0.2, brick: 0.24, compound: 0.34, stone: 0.45, stone_low: 0.55, stone_ruin: 0.45, wood: 0.12, wood_old: 0.12, scrap: 0.12, chainlink: 0.06, chain: 0.06, ocotillo: 0.2, pole: 0.12, rail: 0.12 };
      const WH = { compound: 2.3, adobe: 1.9, block: 2.0, concrete: 2.0, brick: 1.9, stone: 1.8, stone_low: 1.1, stone_ruin: 1.2, wood: 1.8, wood_old: 1.7, scrap: 2.0, chainlink: 2.1, ocotillo: 1.8 };
      let bw = null;
      // the cursor at wall height (the ray, 1 m above the ground point) — what the eye is on — and the camera's direction
      const cam = stage.free ? stage.persp : stage.camera, dv = new THREE.Vector3(); cam.getWorldDirection(dv);
      const k1 = dv.y < -0.05 ? 1.0 / -dv.y : 0, q = { x: p.x - dv.x * k1, z: p.z - dv.z * k1 };
      for (const f of [...(W.walls || []), ...(W.plotWalls || [])]) {
        if (!f.path || !WT[f.type]) continue;
        const P = f.closed ? [...f.path, f.path[0]] : f.path;
        for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, t = Math.max(0, Math.min(1, ((q.x - a[0]) * dx + (q.z - a[1]) * dz) / (L * L))), cx = a[0] + dx * t, cz = a[1] + dz * t, d = Math.hypot(q.x - cx, q.z - cz);
          if (d < (want === 'wall' ? 2.5 : 1.1) && (!bw || d < bw.d)) bw = { d, f, cx, cz, tx: dx / L, tz: dz / L, t, L }; }
      }
      if (bw) {
        const { f, tx, tz } = bw; let nx = -tz, nz = tx; if (nx * dv.x + nz * dv.z > 0) { nx = -nx; nz = -nz; } // the face you're looking at
        const half = Math.min(bw.L / 2, D.w / 2), u = Math.max(half, Math.min(bw.L - half, bw.t * bw.L)) - bw.t * bw.L; // keep it on the run
        const off = WT[f.type] / 2 + 0.03, x = bw.cx + tx * u + nx * off, z = bw.cz + tz * u + nz * off, H = f.height ?? WH[f.type] ?? 1.9;
        const yc = Math.max(D.h / 2 + 0.15, Math.min(H - D.h / 2 - 0.08, H * 0.62));
        return { mount: 'wall', x, z, rot: (Math.atan2(nx, nz) * 180) / Math.PI, extra: { height: +yc.toFixed(2), lift: 0, seat: false, ground: true, keep: true, onWall: f.id || true } };
      }
    }
    if (want === 'auto') return ground;
    let best = null;
    for (const s of W.structures || []) for (const m of s._masses || []) {
      const [lx, lz] = toLocal(p.x - m.cx, p.z - m.cz, m.r), hw = m.w / 2, hd = m.d / 2;
      if (Math.abs(lx) > hw + 1.2 || Math.abs(lz) > hd + 1.2) continue;
      const inner = Math.abs(lx) < hw - 0.8 && Math.abs(lz) < hd - 0.8;
      const sides = [['front', Math.abs(lz - hd)], ['back', Math.abs(lz + hd)], ['right', Math.abs(lx - hw)], ['left', Math.abs(lx + hw)]].sort((a, b) => a[1] - b[1]);
      const score = inner ? -1 : sides[0][1];
      if (!best || score < best.score) best = { s, m, lx, lz, inner, side: sides[0][0], score };
    }
    if (!best) return ground;
    const { s, m, lx, lz } = best, hw = m.w / 2, hd = m.d / 2, R = (m.r * 180) / Math.PI;
    const info = W.items?.get?.(s.id)?.info;
    if (want === 'roof' || (want === 'auto' && best.inner)) {
      const rot = R + (ed.propRot || 0), flat = W.roofAt(p.x, p.z);
      if (flat != null) return { mount: 'roof', x: p.x, z: p.z, rot };
      const top = (s._y || 0) + (info?.height || 3) - 0.35;
      return { mount: 'roof', x: p.x, z: p.z, rot, extra: { ground: true, keep: true, seat: false, lift: +(top - Tg.height(p.x, p.z)).toFixed(2) } };
    }
    // wall: slide along the nearest side, flat against it, facing out
    const side = want === 'wall' && best.inner ? 'front' : best.side, cl = (v, L) => (D.w >= 2 * L ? 0 : Math.max(-L + D.w / 2, Math.min(L - D.w / 2, v)));
    const loc = { front: [cl(lx, hw), hd + 0.02], back: [cl(lx, hw), -hd - 0.02], right: [hw + 0.02, cl(lz, hd)], left: [-hw - 0.02, cl(lz, hd)] }[side];
    const rot = R + { front: 0, back: 180, right: 90, left: -90 }[side];
    const [wx, wz] = toWorld(loc[0], loc[1], m.r), x = m.cx + wx, z = m.cz + wz;
    // above the doors and windows it covers (ground floor), clear of the eaves
    let top = 0;
    const sr = ((s.rot || 0) * Math.PI) / 180;
    for (const op of info?.openings || []) {
      if ((op.floor ?? 0) !== 0) continue;
      const [ox, oz] = toWorld(op.x, op.z, sr), d = Math.hypot(s.at[0] + ox - x, s.at[1] + oz - z);
      if (d < D.w / 2 + (op.w || 1) / 2 + 0.2 && d < 6) top = Math.max(top, op.y1 ?? 2.1);
    }
    const yC = Math.max(top + 0.15 + D.h / 2, 1.2 + D.h / 2), ground0 = Tg.height(x, z);
    return { mount: 'wall', x, z, rot, extra: { height: +yC.toFixed(2), lift: +((s._y || ground0) - ground0).toFixed(2), seat: false, ground: true, keep: true } };
  }
  api.ext = {
    road: {
      down(p, e) {
        const s = snap(p, chain && chain.pts[chain.pts.length - 1]);
        if (o.rmode === 'free') { chain = { pts: [[s.x, s.z]], free: true }; return; }
        if (!chain) { chain = { pts: [[s.x, s.z]], ...(o.rmode === 'curved' ? { knots: [[s.x, s.z]] } : {}) }; previewChain(p); return; }
        if (chain.knots) { chain.knots.push([s.x, s.z]); chain.pts = spline(chain.knots); }
        else chain.pts.push([s.x, s.z]);
        if (s.snapped === 'end' || s.snapped === 'road') { finishRoad(); return; } // joined another road
        previewChain(p);
      },
      move(p, e) {
        if (chain?.free && e.buttons & 1) { const l = chain.pts[chain.pts.length - 1]; if (Math.hypot(p.x - l[0], p.z - l[1]) > 2.5) chain.pts.push([p.x, p.z]); }
        previewChain(p);
      },
      up(p) { if (chain?.free) { if (p) { const s = snap(p); chain.pts.push([s.x, s.z]); } finishRoad(); } },
      finish: finishRoad,
    },
    ppaint: { // polygon ground paint: click corners (snap to road edges, plot corners / sides; Alt: free), close on the first point, double-click or Enter
      down(p) {
        const s = paintSnap(p);
        if (!chain) { chain = { pts: [[s.x, s.z]] }; previewChain(p); return; }
        const f = chain.pts[0];
        if (chain.pts.length >= 3 && Math.hypot(s.x - f[0], s.z - f[1]) < 1.2) { finishPaint(); return; }
        chain.pts.push([s.x, s.z]); previewChain(p);
      },
      move(p) { previewChain(p); const s = paintSnap(p); if (s.snapped) ringAt([s.x, s.z], 0.5); },
      finish: () => finishPaint(),
    },
    wall: {
      down(p, e) {
        const s = snap(p, chain && chain.pts[chain.pts.length - 1]);
        if (!chain) { chain = { pts: [[s.x, s.z]] }; previewChain(p); return; }
        const f = chain.pts[0];
        if (chain.pts.length >= 3 && Math.hypot(s.x - f[0], s.z - f[1]) < 1.5) { chain.closed = true; finishWall(); return; }
        chain.pts.push([s.x, s.z]); previewChain(p);
      },
      move(p) { previewChain(p); },
      finish: finishWall,
    },
    row: {
      down(p) {
        const s = snap(p, chain && chain.pts[0]);
        if (!chain) { chain = { pts: [[s.x, s.z]] }; previewChain(p); return; }
        const a = chain.pts[0], b = [s.x, s.z];
        pushUndo();
        const veg = (state.spec.vegetation ||= {}), plants = (veg.plants ||= []), rng = new RNG(`${Date.now()}`);
        for (const q of rowPoints(a, b)) plants.push({ species: o.ts, at: [r2(q[0] + rng.range(-0.4, 0.4)), r2(q[1] + rng.range(-0.4, 0.4))], scale: r2(rng.range(0.85, 1.15)), rot: Math.round(rng.next() * 360) });
        cancel(); commit(80);
      },
      move(p) { previewChain(p); },
    },
    plot: {
      down(p) {
        const q = nearestRoadPos(roads(), p.x, p.z, 30);
        if (!q) { api.flash('Start a row of plots next to a road'); return; }
        strip = { road: q.road, s0: q.s, s1: q.s, side: q.side, preview: [] };
      },
      move(p) { plotPreview(p); },
      up() {
        if (!strip) return;
        const made = strip.preview.filter((pl) => pl.poly);
        strip = null; clearOverlay();
        if (!made.length) return;
        pushUndo();
        const plots = (state.spec.plots ||= []);
        { const zr = new RNG(`${state.world.seed}:strip:${Date.now()}`), taken = new Set(); for (const pl of made) { pl.id = uid('plot'); if (o.brow) pl.row = true; plots.push(pl); if (o.pfill) { if (ZONE_CATS[o.zc]) fillPlot(pl, zonePick(o.zc, zr, taken), ZONE_CATS[o.zc], o.zc); else buildOn(pl); } } } delete o.mixSeed;
        commit(80);
      },
    },
    plotfree: polyTool(),
    zone: polyTool(),
    field: polyTool(),
    building: {
      down(p) {
        const g = ghostFor(p);
        if (!g) { api.flash('Plot too small for a building'); return; }
        pushUndo();
        if (g.plot) {
          const pl = g.plot;
          if (pl.building) { const i = (state.spec.structures || []).findIndex((x) => x.id === pl.building); if (i >= 0) state.spec.structures.splice(i, 1); }
          if (!buildOn(pl)) { api.flash('Plot too small for a building'); return; }
        } else {
          (state.spec.structures ||= []).push({ ...g.spec, id: uid('bld') });
          pend = null;
        }
        clearOverlay();
        commit(80);
      },
      move(p) { clearOverlay(); const g = ghostFor(p); if (g) drawGhost(g); },
    },
    retain: {
      down(p) {
        const s0 = snap(p, chain && chain.pts[chain.pts.length - 1]);
        const q = [r2(s0.x), r2(s0.z)];
        if (!chain) { chain = { pts: [q], road: s0.road || null }; previewChain(p); return; }
        const f = chain.pts[0], l = chain.pts[chain.pts.length - 1];
        if (Math.hypot(q[0] - l[0], q[1] - l[1]) < 0.4) return;
        if (chain.pts.length >= 3 && Math.hypot(q[0] - f[0], q[1] - f[1]) < 1.5) { chain.closed = true; finishRetain(); return; }
        chain.pts.push(q); previewChain(p);
      },
      move(p) { previewChain(p); },
      finish: () => finishRetain(),
    },
    sign: {
      down(p, e) {
        signAutoText(e);
        const h = signHit(p, e);
        if (!o.stext.trim()) { api.flash('Type the sign text first'); return; }
        pushUndo();
        const first = o.stext.trim().split('\n')[0];
        (state.spec.props ||= []).push({ id: uid('sign'), type: 'custom_sign', text: o.stext.trim(), kind: o.skind, size: o.ssize, color: o.scolor, mount: h.mount, at: [r2(h.x), r2(h.z)], rot: Math.round(h.rot), ...(h.extra || {}), name: `Sign · ${first}`, label: false });
        clearOverlay(); commit(80);
      },
      move(p, e) {
        clearOverlay(); signAutoText(e);
        const h = signHit(p, e), D = signDims({ text: o.stext, size: o.ssize, kind: o.skind }), a = (h.rot * Math.PI) / 180, [tx, tz] = toWorld(1, 0, a);
        addLine([[h.x - tx * D.w / 2, h.z - tz * D.w / 2], [h.x + tx * D.w / 2, h.z + tz * D.w / 2]], snapMat);
        ringAt([h.x, h.z], 0.3, h.mount === 'ground' ? lineMat : snapMat);
      },
    },
    gate: {
      down(p) {
        const h = gateHit(p);
        if (!h) { api.flash('Click on a wall or fence'); return; }
        if (h.old) { api.gateSel = { g: h.old, list: h.e.gates, owner: h.e }; syncGateUI(); clearOverlay(); const w = h.old.width || 3; addLine([[h.pt[0] - h.tx * w / 2, h.pt[1] - h.tz * w / 2], [h.pt[0] + h.tx * w / 2, h.pt[1] + h.tz * w / 2]], lineMat); return; }
        api.clearGate();
        pushUndo();
        const g = { width: o.gw, state: o.gs, ...(o.gl !== 'none' ? { leaf: o.gl } : { posts: false }) };
        if (h.kind === 'wall') (h.e.gates ||= []).push({ s: r2(h.s), ...g });
        else if (h.kind === 'field') (h.e.gates ||= []).push({ s: r2(h.s), ...g });
        else if (h.kind === 'plot') { (h.e.gates ||= []).push({ at: [r2(h.pt[0]), r2(h.pt[1])], ...g }); h.e.gatesEdited = true; }
        clearOverlay();
        commit(60);
      },
      move(p) {
        clearOverlay();
        const h = gateHit(p);
        if (!h) return;
        const w = h.old ? h.old.width || 3 : o.gw;
        addLine([[h.pt[0] - h.tx * w / 2, h.pt[1] - h.tz * w / 2], [h.pt[0] + h.tx * w / 2, h.pt[1] + h.tz * w / 2]], h.old ? lineMat : snapMat);
        ringAt(h.pt, 0.5, h.old ? lineMat : snapMat);
      },
    },
  };

  // ---------------------------------------------------------------- polygon tools: plot (free), plot block, field
  // corners snap to plot / field corners, then to road edges (following the road between two snapped
  // corners) and plot edges
  function snapPoly(p) {
    if (!o.snap || api.alt) return { x: p.x, z: p.z };
    let best = null;
    const cand = (x, z, d, kind, meta) => { if (!best || d < best.d) best = { x, z, d, kind, meta }; };
    for (const e of [...(state.spec.plots || []), ...(state.spec.fields || [])]) for (const q of e.poly || []) { const d = Math.hypot(q[0] - p.x, q[1] - p.z); if (d < 1.8) cand(q[0], q[1], d - 100, 'corner'); }
    if (chain?.pts.length >= 3) { const f = chain.pts[0], d = Math.hypot(f[0] - p.x, f[1] - p.z); if (d < 1.8) cand(f[0], f[1], d - 200, 'close'); }
    if (!best) {
      for (const r of roads()) {
        if (r.type === 'path') continue;
        const vg = 0.5 + (o.off ?? 0.5), q = nearestOnSamples(r.samples, p.x, p.z), edge = r.hw + (r.frontage || 0) + vg; // the offset sets how far back from the road edge the plot line sits
        if (q.d < r.hw - 1 || q.d > edge + 2.5) continue;
        const a = r.samples[q.i], b = r.samples[Math.min(q.i + 1, r.samples.length - 1)], s0 = a.s + (b.s - a.s) * q.t;
        const side = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x) >= 0 ? 1 : -1, F = frontAt(r, s0, side, vg);
        cand(F.x, F.z, Math.abs(q.d - edge), 'road', { road: r, s: s0, side }); api.edgeSnapped = true;
      }
      for (const e of [...(state.spec.plots || []), ...(state.spec.fields || [])]) {
        const P = e.poly || [];
        for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)), x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z); if (d < 1.4) cand(x, z, d - 0.5, 'edge'); }
      }
    }
    return best ? { x: best.x, z: best.z, snapped: best.kind, meta: best.meta } : { x: p.x, z: p.z };
  }
  function polyTool() {
    return {
      down(p) {
        const sp = snapPoly(p), q = [r2(sp.x), r2(sp.z)];
        if (!chain) { chain = { pts: [q], meta: [sp.meta || null] }; return; }
        const f = chain.pts[0], l = chain.pts[chain.pts.length - 1];
        if (Math.hypot(q[0] - l[0], q[1] - l[1]) < 0.4) return; // second click of a double-click
        if (chain.pts.length >= 3 && Math.hypot(q[0] - f[0], q[1] - f[1]) < 0.5) { finishPoly(); return; }
        const m = sp.meta, pm = chain.meta[chain.meta.length - 1];
        if (m && pm && m.road === pm.road && m.side === pm.side && Math.abs(m.s - pm.s) > 5) { // follow the road edge
          const n = Math.ceil(Math.abs(m.s - pm.s) / 3);
          for (let k = 1; k < n; k++) { const ss = pm.s + ((m.s - pm.s) * k) / n, F = frontAt(m.road, ss, m.side, 1); chain.pts.push([r2(F.x), r2(F.z)]); chain.meta.push({ ...m, s: ss }); }
        }
        chain.pts.push(q); chain.meta.push(m || null);
      },
      move(p) {
        clearOverlay();
        const sp = snapPoly(p);
        if (sp.snapped) ringAt([sp.x, sp.z], 0.9);
        if (!chain) return;
        const pts = [...chain.pts, [sp.x, sp.z]];
        addLine(pts, lineMat);
        if (pts.length >= 3) { addLine([pts[pts.length - 1], pts[0]], dimMat); ringAt(chain.pts[0], 1.2, dimMat); }
        if (ed.tool === 'zone' && pts.length >= 3) for (const pl of subdivideZone(pts, roads(), { ...plotDims(o), verge: 0.5 + (o.off ?? 0.5) })) addLine(pl.poly, dimMat, true);
      },
      finish: () => finishPoly(),
    };
  }
  function finishPoly() {
    if (!chain || chain.pts.length < 3) { cancel(); return; }
    // drop near-collinear corners (a road edge followed in short steps becomes one long street front)
    let pts = chain.pts;
    const fm = [(chain.pts[0][0] + chain.pts[1][0]) / 2, (chain.pts[0][1] + chain.pts[1][1]) / 2]; // a point on the first side drawn
    for (let k = 0; k < 4; k++) pts = pts.filter((p, i) => { if (pts.length <= 3) return true; const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) > 0.3; });
    const meta = pts.map((q) => chain.meta[chain.pts.indexOf(q)]);
    chain.pts = pts; chain.meta = meta;
    if (ed.tool === 'field') { finishField(); return; }
    cancel();
    pushUndo();
    const plots = (state.spec.plots ||= []);
    if (ed.tool === 'zone') {
      const made = subdivideZone(pts, roads(), { ...plotDims(o), fence: o.pf, frontPt: fm, verge: 0.5 + (o.off ?? 0.5) });
      if (!made.length) { api.flash('Zone too small for plots'); return; }
      // plots + buildings: every plot gets a pick from the category's mix (residential when none is set)
      const cat = ZONE_CATS[o.zc] ? o.zc : 'residential', zr = new RNG(`${state.world.seed}:zone:${Date.now()}`), taken = new Set();
      for (const pl of made) { pl.id = uid('plot'); if (o.brow) pl.row = true; plots.push(pl); fillPlot(pl, zonePick(cat, zr, taken), ZONE_CATS[cat], cat); } delete o.mixSeed;
      api.flash(`${made.length} plot(s)`);
    } else {
      // street front: always the first side drawn (rule from Danyil), whatever roads it touches
      const roadOf = new Map(); pts.forEach((q, i) => meta[i] && roadOf.set(q, meta[i]));
      const segD = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((fm[0] - a[0]) * dx + (fm[1] - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(fm[0] - a[0] - dx * t, fm[1] - a[1] - dz * t); };
      const P = frontFirst(pts, segD);
      const m = roadOf.get(P[0]) && roadOf.get(P[1]) ? roadOf.get(P[0]) : null;
      const pl = { id: uid('plot'), poly: P, fence: o.pf, custom: true, ...(m ? { road: m.road.id, side: m.side } : {}), ...(o.zu && o.zu !== 'building' ? { use: o.zu } : {}), ...(o.zu === 'multifamily' && o.mfKind ? { mfKind: o.mfKind } : {}) };
      if (o.brow) pl.row = true;
      plots.push(pl);
      if (!o.zu || o.zu === 'building') { // a single plot: Kind wins, else a pick from the category, else empty (or auto with "build on it")
        const C = ZONE_CATS[o.zc];
        if (o.bk && o.bk !== 'auto') buildOn(pl, 0, C ? { origins: o.bo ? null : C.origins, mats: C.mats, cat: o.zc } : {});
        else if (C) fillPlot(pl, zonePick(o.zc, new RNG(`${state.world.seed}:plot:${pl.id}`), new Set()), C, o.zc);
        else if (o.pfill) buildOn(pl);
      } else if (NEW_USES.includes(o.zu)) populate(pl);
    }
    commit(80);
  }

  // one category pick on a plot: a building kind, a plot use ('use:…') or a multifamily layout ('mf:…')
  // a road with the good side of town on both sides gets paved (keeping its width), with sidewalks
  // the good side of town lays its street in stone: on each road, the stretch where wealthy plots face each other across
  // it. Worked out from the plots' fronts (not their stored road), so it holds after edits, merges and old saves
  function paveWealthy() {
    const S = state.spec, W = state.world; if (!W?.roads) return;
    const bById = new Map((S.structures || []).map((q) => [q.id, q]));
    const rich = (S.plots || []).filter((q) => q.poly?.length >= 3 && (q.zcat === 'wealthy' || bById.get(q.building)?.zcat === 'wealthy'));
    for (const r of S.roads || []) {
      if (r.type === 'highway' || r._gate || r.noLaid) continue;
      if ((r.surface === 'pavers' || r.surface === 'cobble') && r.walk) delete r.surface; // the old whole-road paving
      const R = W.roads.find((q) => q.id === r.id); if (!R?.samples?.length) continue;
      const hw = R.hw, segs = [], gaps = [Infinity, Infinity];
      const sOf = (p) => { const k = nearestOnSamples(R.samples, p[0], p[1]), A = R.samples[k.i], B = R.samples[Math.min(k.i + 1, R.samples.length - 1)]; return [A.s + (B.s - A.s) * k.t, k.d, A]; };
      for (const q of rich) {
        // the plot's edge facing this road: the edge whose middle comes nearest it
        let best = null; for (let e = 0; e < q.poly.length; e++) { const a = q.poly[e], b = q.poly[(e + 1) % q.poly.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [sm, d, A] = sOf(m); if (!best || d < best.d) best = { a, b, m, d, sm, A }; }
        const g = best.d - hw; if (!(g > -0.5 && g < 14)) continue;
        const sd = (best.m[0] - best.A.x) * -best.A.tz + (best.m[1] - best.A.z) * best.A.tx >= 0 ? 1 : -1, s0 = sOf(best.a)[0], s1 = sOf(best.b)[0];
        if (Math.abs(s1 - s0) < 2) continue; // a side edge, not a front
        gaps[sd > 0 ? 1 : 0] = Math.min(gaps[sd > 0 ? 1 : 0], Math.max(0.8, g));
        segs.push([sd, +Math.min(s0, s1).toFixed(2), +Math.max(s0, s1).toFixed(2), +Math.max(0.8, g).toFixed(2)]);
      }
      const side = (sd) => { const I = segs.filter((g) => g[0] === sd).map((g) => [g[1] - 1, g[2] + 1]).sort((a, b) => a[0] - b[0]), out = []; for (const iv of I) { const l = out[out.length - 1]; if (l && iv[0] <= l[1] + 6) l[1] = Math.max(l[1], iv[1]); else out.push([...iv]); } return out; };
      const A = side(1), B = side(-1), laid = [];
      for (const a of A) for (const b of B) { const s0 = Math.max(a[0], b[0]), s1 = Math.min(a[1], b[1]); if (s1 - s0 > 4) laid.push([+s0.toFixed(2), +s1.toFixed(2)]); }
      // a crossing street splits the plots, not the paving: stretches either side of a junction join up, and a stretch
      // that ends at a junction runs on across it
      const js = (R._junc || []).map((j) => { const k = nearestOnSamples(R.samples, j.x, j.z), A2 = R.samples[k.i], B2 = R.samples[Math.min(k.i + 1, R.samples.length - 1)]; return [A2.s + (B2.s - A2.s) * k.t, j.r]; });
      laid.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < laid.length; k++) {
        for (const [sj, jr] of js) { const run = jr + 8; if (sj > laid[k][1] - run && sj - laid[k][1] < jr + 14) laid[k][1] = +Math.max(laid[k][1], sj + run).toFixed(2); if (sj < laid[k][0] + run && laid[k][0] - sj < jr + 14) laid[k][0] = +Math.min(laid[k][0], sj - run).toFixed(2); } // on across the crossing, past the walks of the cross street
        if (k > 0 && laid[k][0] <= laid[k - 1][1] + 0.5) { laid[k - 1][1] = Math.max(laid[k - 1][1], laid[k][1]); laid.splice(k, 1); k--; }
      }
      if (!laid.length) { if (r.laid) { delete r.laid; delete r.walkSeg; delete r.walk; } continue; }
      r.laid = laid; r.laidSurface ||= new RNG(`${state.world.seed}:pave:${r.id}`).chance(0.6) ? 'pavers' : 'cobble';
      r.walk = gaps.map((g) => +(Number.isFinite(g) ? g : 1.2).toFixed(2)); r.walkSeg = segs;
      // a path from each gate (or a row house's door) across the parkway to the walk
      const links = [];
      const gp = []; // every gate on a wealthy plot: set on the plot, on its generated fence, or on a baked (edited) fence
      for (const q of rich) for (const g of q.gates || []) if (g.at) gp.push([g.at, g.width]);
      const richIds = new Set(rich.map((q) => q.id));
      for (const w2 of [...(W.plotWalls || []).filter((w) => richIds.has(w._plot)), ...(S.walls || []).filter((w) => richIds.has(w.inPlot))]) {
        if (!w2.gates?.length || !w2.path?.length) continue;
        const P = w2.closed ? [...w2.path, w2.path[0]] : w2.path, segL = []; let tot = 0; for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segL.push(l); tot += l; }
        for (const g of w2.gates) { let sl = g.s ?? (g.at != null && !Array.isArray(g.at) ? g.at * tot : null); if (sl == null) { if (Array.isArray(g.at)) gp.push([g.at, g.width]); continue; }
          let i = 0; while (i < segL.length - 1 && sl > segL[i]) { sl -= segL[i]; i++; } const t = segL[i] ? sl / segL[i] : 0; gp.push([[P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t], g.width]); }
      }
      for (const [at, gw] of gp) {
        const [sg, dg, A] = sOf(at); if (dg - hw > 15 || dg - hw < 0.5) continue;
        const sd = (at[0] - A.x) * -A.tz + (at[1] - A.z) * A.tx >= 0 ? 1 : -1;
        if (!links.some((l) => l[0] === sd && Math.abs(l[1] - sg) < 1)) links.push([sd, +sg.toFixed(2), Math.max(1.2, Math.min(3.2, (gw || 1.6) * 0.9))]);
      }
      r.walkLinks = links;
    }
  }
  api.paveWealthy = paveWealthy;
  function fillPlot(pl, k, C, cat) {
    if (cat) pl.zcat = cat;
    if (cat === 'wealthy' && (k.startsWith('mf:') || k === 'shack' || k === 'use:vacant')) k = 'house'; // no vecindades, cuarterías or squats on the good side of town
    if (o.brow && k === 'house' && new RNG(`${state.world.seed}:rowbiz:${pl.id}`).chance(cat === 'wealthy' ? 0.3 : cat === 'residential' ? 0.12 : 0)) k = cat === 'wealthy' ? 'biz' : 'shop'; // a row street: shops on the ground floor // no flats on a villa street unless it's a row
    if (cat === 'residential' && k.startsWith('mf:') && !((o.dens ?? 0.5) > 0.75 && (o.psize ?? 0.5) >= 0.75 && o.brow)) k = 'house'; // flats only on a dense, big-plot row street
    if (cat === 'wealthy') paveWealthy();
    if (k === 'biz' || k === 'resto') return buildOn(pl, 0, { kind: k === 'biz' ? 'shop' : 'cafe', origins: o.bo ? null : C.origins, mats: C.mats, cat, biz: k === 'biz', resto: k === 'resto' });
    if (k.startsWith('use:')) { pl.use = k.slice(4); if (NEW_USES.includes(pl.use)) populate(pl); }
    else if (k.startsWith('mf:')) { pl.use = 'multifamily'; const mk = k.slice(3) || o.mfKind; if (mk) pl.mfKind = mk; populate(pl); }
    else buildOn(pl, 0, { kind: k, origins: o.bo ? null : C.origins, mats: C.mats, cat });
  }

  // ---------------------------------------------------------------- building placement ghost
  let pend = null; // the next free-standing building (size, kind, shape) so the ghost matches the click
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.28, depthWrite: false });
  function pendingBuilding() {
    if (pend) return pend;
    const rng = new RNG(`${Date.now()}`), kind = o.bk === 'auto' ? rng.weighted({ house: 8, shop: 2, workshop: 1.2, cantina: 0.5 }) : o.bk, ks = SIZES[kind] || SIZES.house;
    const w = r2(rng.range(ks.w[0], ks.w[1])), d = r2(rng.range(ks.d[0], ks.d[1]));
    const fx = kind === 'den' && DEN_FIXED[o.bl];
    pend = { kind, size: fx ? [...fx] : [w, d], shape: !fx && w >= 8 && d >= 7 && rng.chance(0.35) ? 'L' : 'rect', origin: 'new', material: rng.weighted({ adobe: 5, stone: 0.25, plaster: 1.5, block: 0.6 }), floors: 1, snap: false };
    applyState(pend);
    return pend;
  }
  function ghostFor(p) {
    if (!p) return null;
    const pl = !api.alt && (state.spec.plots || []).find((q) => pointInPoly(p.x, p.z, q.poly) && !q.use);
    if (pl) { const st = autoBuilding(pl, { kind: o.bk, layout: o.bl, setback: o.brow ? 'row' : 'tight', density: o.dens ?? 0.5, v: 0 }, state.world.seed); if (!st) return null; applyState(st); return { plot: pl, spec: st }; }
    const b = pendingBuilding();
    let at = [p.x, p.z], rot = ed.propRot;
    const e = api.snapEdge(p, { walls: false, extra: b.size[1] / 2 });
    if (e && e.kind === 'edge') { at = [e.x, e.z]; rot = e.rot; }
    else if (o.snap && !api.alt) { // back against the nearest plot line, facing away from it
      let best = null;
      for (const q of state.spec.plots || []) for (let i = 0; i < q.poly.length; i++) {
        const a = q.poly[i], c = q.poly[(i + 1) % q.poly.length], dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz) || 1, t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (L * L);
        if (t < 0 || t > 1) continue;
        const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
        if (d < b.size[1] / 2 + 3 && (!best || d < best.d)) best = { x, z, d, nx: (p.x - x) / (d || 1), nz: (p.z - z) / (d || 1), tx: dx / L, tz: dz / L };
      }
      if (best) {
        let nx = -best.tz, nz = best.tx; if (nx * best.nx + nz * best.nz < 0) { nx = -nx; nz = -nz; }
        at = [best.x + nx * (b.size[1] / 2 + 0.3), best.z + nz * (b.size[1] / 2 + 0.3)];
        rot = (Math.atan2(nx, nz) * 180) / Math.PI;
      }
    }
    return { spec: { ...b, at: [r2(at[0]), r2(at[1])], rot: Math.round(((rot % 360) + 360) % 360 * 10) / 10 } };
  }
  function drawGhost(g) {
    const st = g.spec, r = (st.rot * Math.PI) / 180, fh = 3.1;
    for (const m of massesFor(st, new RNG('ghost'))) {
      const [x, z] = toWorld(m.x, m.z, r), cx = st.at[0] + x, cz = st.at[1] + z, h = (m.floors || st.floors || 1) * fh + 0.6;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(m.w, h, m.d), ghostMat);
      mesh.position.set(cx, T().height(cx, cz) + h / 2 - 0.2, cz); mesh.rotation.y = r + ((m.rot || 0) * Math.PI) / 180; mesh.renderOrder = 997;
      overlay.add(mesh);
    }
    // front marker
    const [fx, fz] = toWorld(0, st.size[1] / 2 + 1.2, r);
    ringAt([st.at[0] + fx, st.at[1] + fz], 0.4, lineMat);
    if (g.plot) addLine(g.plot.poly, lineMat, true);
  }

  // ---------------------------------------------------------------- gates: on a hand-drawn wall, a field fence or a plot fence
  function nearOnPath(P, closed, p) {
    const pts = closed ? [...P, P[0]] : P;
    let best = null, s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (L * L)));
      const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { d, s: s + t * L, pt: [x, z], tx: dx / L, tz: dz / L };
      s += L;
    }
    return best;
  }
  function gateHit(p) {
    let best = null;
    const consider = (h, kind, e, gates) => { if (h && h.d < 1.2 && (!best || h.d < best.d)) best = { ...h, kind, e, list: gates }; };
    for (const w of state.spec.walls || []) if (w.id && !['powerline', 'acequia', 'stream'].includes(w.type)) consider(nearOnPath(w.path, w.closed, p), 'wall', w, w.gates);
    for (const f of state.spec.fields || []) if (f.id && f.fence) {
      if (!f.gates) { const wf = state.world.fields?.find((x) => x.id === f.id); const wg = wf?.gates || wf?._gates; if (wg) f.gates = structuredClone(wg); } // the generated gate becomes editable
      consider(nearOnPath(f.poly, true, p), 'field', f, f.gates);
    }
    for (const w of state.world.plotWalls || []) { const pl = (state.spec.plots || []).find((q) => q.id === w._plot); if (pl) consider(nearOnPath(w.path, false, p), 'plot', pl, pl.gates); }
    if (!best) return null;
    // clicking on a gate that's already there removes it
    if (best.kind === 'plot') { // a gate on a shared plot line can be stored on either plot
      for (const pl of state.spec.plots || []) {
        const g = (pl.gates || []).find((q) => q.at && Math.hypot(q.at[0] - best.pt[0], q.at[1] - best.pt[1]) < (q.width || 3) / 2 + 0.3);
        if (g) { best.old = g; best.e = pl; best.list = pl.gates; break; }
      }
    } else { // gates by distance along the line (s) or as a fraction of its length (at)
      const P = best.kind === 'field' ? [...best.e.poly, best.e.poly[0]] : best.e.closed ? [...best.e.path, best.e.path[0]] : best.e.path;
      let total = 0; for (let i = 0; i < P.length - 1; i++) total += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      best.old = (best.e.gates || []).find((g) => { const sg = g.s ?? (typeof g.at === 'number' ? g.at * total : null); return sg != null && Math.abs(sg - best.s) < (g.width || 3) / 2 + 0.3; });
    }
    return best;
  }
  api.cancelTool = () => { cancel(); strip = null; pend = null; api.clearGate?.(); };
  // props go down exactly where clicked; only wall / gate / barrier kinds snap (to roads, walls, plot lines)
  const SNAP_PROPS = new Set(['corral_gate', 'barrier', 'jersey_barrier', 'road_barrier', 'sandbags', 'wire_coil', 'hitching_rail', 'neon_sign', 'alley_line', 'alley_tarp', 'cables', 'hedge', 'hedge_dead']);
  api.propSnaps = (type) => SNAP_PROPS.has(type);
  api.previewSnap = (p) => { clearOverlay(); if (!api.propSnaps(ed.prop)) { api.edgeSnapped = false; return; } const e = api.snapEdge(p); if (e) ringAt([e.x, e.z], 0.8); };
  api.rowParty = () => rowParty(state.spec);
  api.hasChain = () => !!chain;
  // right-click while drawing: take back the last point (a curve's bend first, a whole curved stretch at once); none left = cancel
  api.popPoint = () => {
    if (!chain) return;
    if (chain.knots) { chain.knots.pop(); chain.pts = spline(chain.knots); }
    else if (chain.ctrl) chain.ctrl = null;
    else {
      const n = chain.hist?.length && chain.hist[chain.hist.length - 1] < chain.pts.length ? chain.hist.pop() : chain.pts.length - 1;
      chain.pts.length = Math.max(0, n); if (chain.meta) chain.meta.length = Math.min(chain.meta.length, chain.pts.length);
    }
    if (!chain.pts.length || (chain.pts.length === 1 && !chain.ctrl && chain.free)) { api.cancelTool(); return; }
    previewChain(api.lastP || null);
  };

  // ---------------------------------------------------------------- selection helpers for the core
  // find a road / wall / plot under the cursor (they have no clickable mesh of their own)
  api.pickExtra = (p) => {
    let best = null;
    for (const w of state.spec.walls || []) {
      if (!w.id) continue;
      const P = w.closed ? [...w.path, w.path[0]] : w.path;
      for (let i = 0; i < P.length - 1; i++) { const d = segD(p, P[i], P[i + 1]); if (d < 0.9 && (!best || d < best.d)) best = { id: w.id, d }; }
    }
    if (best) return best.id;
    for (const w of state.spec.retains || []) {
      if (!w.id) continue;
      const P = w.closed ? [...w.path, w.path[0]] : w.path;
      for (let i = 0; i < P.length - 1; i++) { const d = segD(p, P[i], P[i + 1]); if (d < 1.2 && (!best || d < best.d)) best = { id: w.id, d }; }
    }
    if (best) return best.id;
    if (!state.lockRoads) for (const r of roads()) { if (!state.spec.roads?.some((x) => x.id === r.id)) continue; const q = nearestOnSamples(r.samples, p.x, p.z); if (q.d < r.hw + 0.6 && (!best || q.d < best.d)) best = { id: r.id, d: q.d }; }
    if (best) return best.id;
    const pp = [...(state.spec.paint || [])].reverse().find((q) => q.id && q.poly && pointInPoly(p.x, p.z, q.poly));
    if (pp && ed.tool === 'select' && !api.plotEdit) return pp.id;
    const pl = (state.spec.plots || []).find((q) => pointInPoly(p.x, p.z, q.poly));
    if (pl) return pl.id;
    const f = (state.spec.fields || []).find((q) => q.id && pointInPoly(p.x, p.z, q.poly));
    return f ? f.id : null;
  };
  const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)); return Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t); };

  // ---------------------------------------------------------------- handles: drag the points of the selected road / wall / plot / field
  const hGroup = new THREE.Group(); stage.scene.add(hGroup);
  const handleMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a, depthTest: false });
  const handleGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.25, 12);
  api.handleTarget = () => {
    if (!ed.on || ed.tool !== 'select' || !state.selected) return null;
    const src = api.findSrc(state.selected);
    if (!src) return null;
    if (src.k === 'roads' && state.lockRoads) return null;
    if ((src.k === 'roads' || src.k === 'walls' || src.k === 'retains') && src.e.path) return { src, key: 'path', min: 2 };
    if ((src.k === 'plots' || src.k === 'fields' || src.k === 'paint') && src.e.poly) return { src, key: 'poly', min: 3 };
    if (src.k === 'structures' && src.e.at && src.e.size && src.e.kind !== 'canopy') return { src, key: 'sides', min: 4, virtual: true };
    return null;
  };
  // building side handles: midpoints of the four sides (right, front, left, back in the building frame)
  const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const sidePts = (e) => { const r = ((e.rot || 0) * Math.PI) / 180, [w, d] = e.size; return SIDES.map(([sx, sz]) => { const [x, z] = toWorld((sx * w) / 2, (sz * d) / 2, r); return [e.at[0] + x, e.at[1] + z]; }); };
  const footprint = (at, size, rot) => { const r = (rot * Math.PI) / 180; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b2]) => { const [x, z] = toWorld((a * size[0]) / 2, (b2 * size[1]) / 2, r); return [at[0] + x, at[1] + z]; }); };
  const hPts = (H) => (H.virtual ? sidePts(H.src.e) : H.src.e[H.key]);
  function drawHandles(override) {
    for (const c of [...hGroup.children]) hGroup.remove(c);
    const H = api.handleTarget();
    if (!H) return;
    const pts = override?.pts || override || hPts(H);
    for (const q of pts) { const m = new THREE.Mesh(handleGeo, handleMat); m.position.set(q[0], T().height(q[0], q[1]) + 0.3, q[1]); m.renderOrder = 999; hGroup.add(m); }
    if (override?.foot) { clearOverlay(); addLine(override.foot, lineMat, true); }
    else if (override) { clearOverlay(); addLine(override, lineMat, H.key === 'poly' || H.src.e.closed); }
  }
  api.drawHandles = drawHandles;
  api.onWorld.push(() => drawHandles());
  api.hitHandle = (cx, cy) => {
    const H = api.handleTarget(); if (!H) return -1;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    let best = -1, bd = 13;
    hPts(H).forEach((q, i) => { const v = stage.project(new THREE.Vector3(q[0], T().height(q[0], q[1]) + 0.3, q[1])); const d = Math.hypot(v[0] + rect.left - cx, v[1] + rect.top - cy); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  // road shape changed in the spec: plots along it slide with it
  api.refitRoad = (e) => {
    const t = T(), w = e.width || ROAD_DEFAULTS[e.type]?.width || 6;
    const rd = { id: e.id, samples: roadSamples(e, t), hw: w / 2, frontage: e.frontage || 0 };
    refitPlots(state.spec, rd, (s, side, verge) => frontAt(rd, s, side, verge), (x, z) => { const q = nearestOnSamples(rd.samples, x, z); const a = rd.samples[q.i], b = rd.samples[Math.min(q.i + 1, rd.samples.length - 1)]; return a.s + (b.s - a.s) * q.t; });
    rowParty(state.spec);
  };
  api.handleEdit = {
    move(i, p) {
      const H = api.handleTarget(); if (!H) return;
      if (H.virtual) { // drag a side out / in: the opposite side stays put
        const e = H.src.e, r = ((e.rot || 0) * Math.PI) / 180, [sx, sz] = SIDES[i];
        const [lx, lz] = toLocal(p.x - e.at[0], p.z - e.at[1], r);
        let [w, d] = e.size, cx = 0, cz = 0;
        if (sx) { const nw = Math.max(2, Math.round((sx * lx + w / 2) * 4) / 4); cx = (sx * (nw - w)) / 2; w = nw; }
        else { const nd = Math.max(2, Math.round((sz * lz + d / 2) * 4) / 4); cz = (sz * (nd - d)) / 2; d = nd; }
        const [ox, oz] = toWorld(cx, cz, r), at = [r2(e.at[0] + ox), r2(e.at[1] + oz)];
        api._hsize = { at, size: [w, d] };
        drawHandles({ pts: sidePts({ ...e, at, size: [w, d] }), foot: footprint(at, [w, d], e.rot || 0) });
        api.flash?.(`${w} × ${d} m`);
        return;
      } const pts = H.src.e[H.key].map((q) => q.slice()); const s2 = H.src.k === 'roads' ? snapEnd(p, H.src.e.id) : { x: p.x, z: p.z }; pts[i] = [r2(s2.x), r2(s2.z)]; api._hpts = pts; drawHandles(pts); },
    commit(i) {
      const H = api.handleTarget();
      if (H?.virtual) { if (!api._hsize) return; pushUndo(); Object.assign(H.src.e, api._hsize); api._hsize = null; clearOverlay(); commit(40); return; }
      if (!H || !api._hpts) return;
      pushUndo();
      H.src.e[H.key] = api._hpts; api._hpts = null;
      afterShapeEdit(H.src);
      commit(40);
    },
    remove(i) {
      const H = api.handleTarget(); if (!H || H.virtual) return false;
      const pts = H.src.e[H.key]; if (pts.length <= H.min) { api.flash('Too few points to remove one'); return true; }
      pushUndo(); pts.splice(i, 1); afterShapeEdit(H.src); commit(40); return true;
    },
    insert(p) { // double-click on the selected path: add a point on the nearest segment
      const H = api.handleTarget(); if (!H || H.virtual) return false;
      const pts = H.src.e[H.key], closed = H.key === 'poly' || !!H.src.e.closed;
      let bi = -1, bd = 3;
      for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const d = segD(p, pts[i], pts[(i + 1) % pts.length]); if (d < bd) { bd = d; bi = i; } }
      if (bi < 0 || H.src.k === 'plots') return false;
      pushUndo(); pts.splice(bi + 1, 0, [r2(p.x), r2(p.z)]); afterShapeEdit(H.src); commit(40); return true;
    },
    split(i) { // shift-click a road point: two roads meeting there
      const H = api.handleTarget(); if (!H || H.src.k !== 'roads') return false;
      const e = H.src.e, pts = e.path; if (i <= 0 || i >= pts.length - 1) { api.flash('Split at a middle point'); return true; }
      pushUndo();
      const b = { ...structuredClone(e), id: uid('road'), path: pts.slice(i) }; delete b.name;
      e.path = pts.slice(0, i + 1);
      state.spec.roads.push(b);
      for (const pl of state.spec.plots || []) if (pl.road === e.id) { const F = plotFrame(pl), dA = nearestOnSamples(roadSamples(e, T()), F.front[0], F.front[1]).d, dB = nearestOnSamples(roadSamples(b, T()), F.front[0], F.front[1]).d; if (dB < dA) pl.road = b.id; }
      api.refitRoad(e); api.refitRoad(b);
      commit(40); return true;
    },
  };
  // paint corners: plot corners, then road edges / plot sides
  function paintSnap(p) {
    if (api.alt || !o.snap) return { x: p.x, z: p.z };
    let best = null;
    for (const pl of state.spec.plots || []) for (const q of pl.poly) { const d = Math.hypot(q[0] - p.x, q[1] - p.z); if (d < 1.3 && (!best || d < best.d)) best = { x: q[0], z: q[1], d, snapped: 'corner' }; }
    for (const q of state.spec.paint || []) if (q.poly) for (const v of q.poly) { const d = Math.hypot(v[0] - p.x, v[1] - p.z); if (d < 1.0 && (!best || d < best.d)) best = { x: v[0], z: v[1], d, snapped: 'corner' }; }
    if (best) return best;
    const e = api.snapEdge(p); if (e) return { x: e.x, z: e.z, snapped: 'edge' };
    for (const pl of state.spec.plots || []) { const n = pl.poly.length; for (let i = 0; i < n; i++) { const a = pl.poly[i], b = pl.poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)), x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z); if (d < 0.9 && (!best || d < best.d)) best = { x, z, d, snapped: 'side' }; } }
    return best || { x: p.x, z: p.z };
  }
  function finishPaint() {
    if (!chain || chain.pts.length < 3) { cancel(); return; }
    const G = api.GROUND_PAINTS[ed.paint];
    pushUndo();
    (state.spec.paint ||= []).push({ id: uid('paint'), kind: ed.paint, poly: chain.pts.map(([x, z]) => [r2(x), r2(z)]), color: G.color, edge: ed.paintEdge === 'crisp' ? 0.15 : 1.2, alpha: G.alpha, ...(G.layer !== undefined ? { layer: G.layer, layerK: 1 } : {}) });
    cancel(); commit(80);
  }
  // within ~8 m of the map edge a road point goes onto the edge (the road then runs on into the haze)
  function edgeClamp(p) {
    if (api.alt) return p;
    const W = T().W / 2, D = T().D / 2, q = { ...p };
    if (W - Math.abs(q.x) < 8) { q.x = Math.sign(q.x) * W; q.snapped = 'edge'; }
    if (D - Math.abs(q.z) < 8) { q.z = Math.sign(q.z) * D; q.snapped = 'edge'; }
    return q;
  }
  function snapEnd(p, selfId) {
    for (const r of roads()) { if (r.id === selfId) continue; const q = nearestOnSamples(r.samples, p.x, p.z); if (q.d < r.hw + 1.5) return { x: q.qx, z: q.qz }; }
    return edgeClamp({ x: p.x, z: p.z });
  }
  function afterShapeEdit(src) {
    if (src.k === 'roads') api.refitRoad(src.e);
    if (src.k === 'plots') { src.e.custom = true; delete src.e.s0; delete src.e.s1; unbakeFences(src.e); }
  }

  // ---------------------------------------------------------------- side panel actions for builder items
  const box = document.createElement('div');
  box.id = 'ed-item';
  box.className = 'actions';
  $('#panel').appendChild(box);
  const form = document.createElement('div');
  form.id = 'ed-form';
  $('#panel').appendChild(form);
  // wall height slider + paint (presets and any colour) for a wall or a plot's walls
  const wallLook = (add, change, get, set, defH) => {
    const h = get('h');
    add(`<label class="mini">Wall height<input type="range" min="0.6" max="3.6" step="0.1" value="${h ?? defH}" style="flex:1"><b class="cv">${h == null ? 'auto' : (+h).toFixed(1) + ' m'}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = (+r.value).toFixed(1) + ' m'); r.onchange = () => change(() => set('h', +r.value)); });
    const p = get('paint'), known = p == null || Object.keys(WALL_PAINTS).includes(String(p));
    add(`<label class="mini">Wall paint<select>${Object.entries(WALL_PAINTS).map(([k, v]) => `<option value="${k}" ${String(k) === String(p ?? '') ? 'selected' : ''}>${v}</option>`).join('')}${known ? '' : '<option value="custom" selected>custom</option>'}</select><input type="color" value="${p != null ? hex6(p) : '#d8cbb0'}" title="Any colour" style="width:34px;height:22px;padding:0;border:0;background:none"></label>`, (w) => {
      w.querySelector('select').onchange = (ev) => { if (ev.target.value === 'custom') return; change(() => set('paint', ev.target.value === '' ? null : +ev.target.value)); };
      w.querySelector('input').onchange = (ev) => change(() => set('paint', parseInt(ev.target.value.slice(1), 16)));
    });
  };
  api.onSelect = (it) => {
    drawPlots();
    if (!api._multiKeep && multi.size && !(state.selected && multi.has(state.selected))) api.multiClear();
    box.innerHTML = ''; form.innerHTML = '';
    drawHandles();
    $('#panel').classList.toggle('editing', !!(ed.on && it));
    if (!ed.on || !it) return;
    if (it.type === 'plant') {
      for (const [l, f] of [['Turn ⟳', () => ed.rotateSel(30)], ['Delete', () => ed.deleteSel()]]) { const b = document.createElement('button'); b.textContent = l; b.onclick = f; box.appendChild(b); }
      return;
    }
    const src = api.findSrc(it.id);
    if (!src) return;
    const e = src.e;
    const add = (html, fn) => { const w = document.createElement('span'); w.innerHTML = html; box.appendChild(w); fn?.(w); return w; };
    const change = (fn) => { pushUndo(); fn(); if (e.inPlot || e.plot) e.touched = true; commit(60); };
    statsForm(form, e, src.k);
    if (src.k === 'structures') {
      // ---- the building panel: quick actions, then tabs (Shape · Fabric · Roof · Add-ons · Notes); only what applies
      // to this building shows; auto values are dimmed, values set by hand carry a dot; each tab can reset to auto
      const TABS = {
        Shape: ['shape', 'floors', 'floorH', 'heights', 'lift', 'layout'],
        Fabric: ['material', 'brick', 'finish', 'origin', 'mix', 'newShare', 'adapt', 'vstyle', 'condition', 'ruinType', 'livery'],
        Roof: ['roof', 'roofMat', 'roofGarden', 'roofPower', 'tinaco'],
        'Add-ons': ['porch', 'sideShade', 'sign', 'signs', 'entrances', 'fence'],
        Notes: [],
      };
      const tab = TABS[state._bTab] ? state._bTab : 'Shape';
      const set = (k) => e[k] != null && !(k === 'origin' && e[k] === 'new');
      add(`<div class="bt-quick"><button data-a="reroll" title="A new random look (same settings)">Re-roll</button>${e.plot && (state.spec.plots || []).some((q) => q.id === e.plot) ? '<button data-a="new" title="Replace it with a new random building">New building</button>' : ''}<button data-a="turn">Turn ⟳</button><button data-a="del">Delete</button></div>`, (w) => w.querySelectorAll('button').forEach((bt) => (bt.onclick = () => {
        const a = bt.dataset.a;
        if (a === 'turn') return ed.rotateSel(30);
        if (a === 'del') return ed.deleteSel();
        if (a === 'reroll') return change(() => { // a new look: new material and style too (the kind, size, floors and finish stay)
          e.v = (e.v || 0) + 1; const rr = new RNG(`${state.world.seed}:reroll:${e.id}:${e.v}:${Date.now()}`), pre = e.origin && e.origin !== 'new';
          if (e.zcat === 'wealthy') {
            if (e.kind === 'house') e.vstyle = rr.weighted(pre ? { spanish: 0.55, midcentury: 1.2, two_storey: 1.4, low_gable: 0.6, box_house: 0.8, nortena: 0.7 } : { casona: 2.2, nortena: 1.5, painted: 1, sonoran: 1.2 });
            else e.vstyle = rr.weighted(pre ? { storefront: 2, midcentury: 0.6, spanish: 0.35 } : { casona: 1.5, painted: 1.5, nortena: 1 });
            const S = STYLES[e.vstyle]; e.material = S?.mats.includes('plaster') ? rr.weighted({ plaster: 3, ...Object.fromEntries(S.mats.filter((m) => m !== 'plaster').map((m) => [m, 0.7])) }) : S?.mats[0] || 'plaster';
            if (e.vstyle === 'nortena' && typeof e.finish === 'object') e.color = e.finish.body; else delete e.color;
          } else {
            delete e.vstyle; delete e.color;
            e.material = rr.weighted(pre ? { plaster: 2, concrete: 1.5, block: 1.5, brick: 0.8 } : { adobe: 3, plaster: 2, block: 1.5, brick: 0.8, timber: 0.5, stone: 0.25 });
          }
          delete e.roof; delete e.roofMat; if (e.vstyle === 'spanish') [e.roof, e.roofMat] = rr.chance(0.5) ? ['gable', 'tile'] : ['hip', 'tile'];
        });
        const pl = (state.spec.plots || []).find((q) => q.id === e.plot);
        change(() => { const i = state.spec.structures.indexOf(e); const st = autoBuilding(pl, { kind: o.bk, layout: o.bl, setback: o.brow ? 'row' : 'tight', density: o.dens ?? 0.5, v: (e.v || 0) + 1 + Math.floor(Math.random() * 1000) }, state.world.seed); if (st) { st.id = e.id; st.v = 0; state.spec.structures[i] = st; } });
      })));
      add(`<div class="bt-kind"><select title="Kind">${BUILD_KINDS.filter((k) => k !== 'auto').map((k) => `<option ${k === e.kind ? 'selected' : ''}>${k}</option>`).join('')}</select>${KIND_LAYOUTS[e.kind] ? `<select title="Layout"><option value="">layout: auto</option>${Object.entries(KIND_LAYOUTS[e.kind]).map(([k, l]) => `<option value="${k}" ${k === e.layout ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}</div>`, (w) => {
        const [ks, ls] = w.querySelectorAll('select');
        ks.onchange = (ev) => change(() => { e.kind = ev.target.value; delete e.layout; });
        if (ls) ls.onchange = (ev) => change(() => { if (ev.target.value) e.layout = ev.target.value; else delete e.layout; });
      });
      add(`<div class="bt-tabs">${Object.keys(TABS).map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t}${TABS[t].some(set) ? '<i>•</i>' : ''}</button>`).join('')}</div>`, (w) => w.querySelectorAll('button').forEach((bt) => (bt.onclick = () => { state._bTab = bt.dataset.t; api.onSelect(it); })));
      form.style.display = tab === 'Notes' ? '' : 'none';
      const pane = add('<div class="bt-pane"></div>').firstChild;
      const addP = (html, fn) => { const w = document.createElement('span'); w.innerHTML = html; pane.appendChild(w); fn?.(w); return w; };
      const cls = (on) => (on ? 'mini set' : 'mini auto');
      const sel = (lab, opts, cur, fn, key) => addP(`<label data-k="${lab}" class="${cls(cur !== '' && cur != null && (!key || set(key)))}">${lab}<select>${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => fn(ev.target.value))));
      const slider = (lab, min, max, step, val, show, fn, isSet) => addP(`<label data-k="${lab}" class="${cls(isSet)}">${lab}<input type="range" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1"><b class="cv">${show(val)}</b></label>`, (w) => { const r = w.querySelector('input'), lb = w.querySelector('.cv'); r.oninput = () => (lb.textContent = show(+r.value)); r.onchange = () => change(() => fn(+r.value)); });
      const A = [['', 'auto']];
      if (tab === 'Shape') {
        addP(`<label class="mini set">Size W × D (m)<input type="number" min="2" max="60" step="0.5" value="${e.size?.[0] ?? 10}" style="width:62px;margin-left:auto"><input type="number" min="2" max="60" step="0.5" value="${e.size?.[1] ?? 8}" style="width:62px"></label>`, (w) => w.querySelectorAll('input').forEach((inp, k) => (inp.onchange = () => change(() => { e.size = [...(e.size || [10, 8])]; e.size[k] = Math.max(2, +inp.value || e.size[k]); }))));
        sel('Shape', [['', 'rect'], ...['L', 'T', 'U', 'H', 'stepped', 'courtyard'].map((k) => [k, k])], e.shape && e.shape !== 'rect' ? e.shape : '', (v) => { if (v) e.shape = v; else delete e.shape; }, 'shape');
        sel('Floors', [['', 'auto'], ...[1, 2, 3].map((k) => [k, k])], e.floors ?? '', (v) => { if (v) e.floors = +v; else delete e.floors; }, 'floors');
        sel('Heights', [['', 'uniform'], ['mixed', 'mixed (terraces)']], e.heights === 'mixed' ? 'mixed' : '', (v) => { if (v === 'mixed') e.heights = 'mixed'; else delete e.heights; }, 'heights');
        slider('Wall height (m)', 2.2, 4.5, 0.05, e.floorH || 2.7, (v) => `${v.toFixed(2)}`, (v) => { e.floorH = v; }, !!e.floorH);
        slider('Raised (m)', 0, 4, 0.1, +e.lift || 0, (v) => (v ? v.toFixed(1) : 'no'), (v) => { if (v > 0) e.lift = v; else delete e.lift; }, !!e.lift);
      } else if (tab === 'Fabric') {
        const OR = resolveOrigin(e);
        addP(`<div class="bt-seg">${Object.entries(ORIGIN_CHOICES).map(([k, t]) => `<button data-o="${k}" class="${k === OR.choice ? 'on' : ''}" title="${t}">${{ new: 'New', prewar: 'Pre-war', mixed: 'Pre-war + new' }[k]}</button>`).join('')}</div>`, (w) => w.querySelectorAll('button').forEach((bt) => (bt.onclick = () => change(() => { const v = bt.dataset.o; e.origin = v; if (v !== 'mixed') { delete e.newShare; delete e.mix; } if (v === 'new') delete e.adapt; }))));
        if (OR.choice === 'mixed') {
          sel('Rebuild', [['', 'auto (by share / shape)'], ...Object.entries(MIX_KINDS)], e.mix || '', (v) => { if (v) e.mix = v; else delete e.mix; }, 'mix');
          slider('New build share', 0.2, 0.95, 0.05, OR.share, (v) => `${Math.round(v * 100)}%`, (v) => { e.newShare = v; }, e.newShare != null);
        }
        if (e.kind !== 'shack' && !['guardpost', 'barracks', 'bunker', 'armory'].includes(e.kind)) {
          const era = OR.choice === 'new' ? 'new' : 'prewar', SL = stylesFor(era, e.material || null);
          sel('Style', [['', 'auto'], ...SL.map((k) => [k, STYLES[k].label])], SL.includes(e.vstyle) ? e.vstyle : '', (v) => { if (v) { e.vstyle = v; if (e.material && !STYLES[v].mats.includes(e.material)) e.material = STYLES[v].mats[0]; } else delete e.vstyle; }, 'vstyle');
        }
        sel('Material', [...A, ...Object.keys(MAT).map((k) => [k, k === 'block' ? 'cinder block' : k])], e.material || '', (v) => { if (v) e.material = v; else delete e.material; delete e.color; if (e.vstyle && STYLES[e.vstyle] && v && !STYLES[e.vstyle].mats.includes(v)) delete e.vstyle; }, 'material');
        if (e.material === 'brick') sel('Brick', [...A, ['handmade', 'handmade (ladrillo)'], ['factory', 'factory red']], e.brick || '', (v) => { if (v) e.brick = v; else delete e.brick; }, 'brick');
        sel('Finish', [...A, ['none', 'bare'], ['wash', 'whitewashed'], ['painted', 'painted'], ['decorated', 'decorated (simple)'], ['ornate', 'decorated (maximalist)'], ['showpiece', 'showpiece'], ['faded', 'faded']], typeof e.finish === 'string' ? e.finish : e.finish?.tier || '', (v) => { if (v) e.finish = v; else delete e.finish; }, 'finish');
        sel('Livery', [['', 'none'], ...Object.entries(LIVERIES).map(([k, v]) => [k, v.label])], e.livery || '', (v) => { if (v) e.livery = v; else delete e.livery; }, 'livery');
        slider('Condition', 0, 1, 0.02, e.condition ?? 0.75, (v) => condName(v), (v) => { e.condition = v; if (v >= 0.45 && ['ruin', 'stripped'].includes(e.origin)) e.origin = 'prewar'; }, e.condition != null);
        if ((e.condition ?? 1) < 0.45) sel('Ruin type', [['collapsed', 'collapsed (time, the war)'], ['stripped', 'stripped (scavenged)']], OR.ruinType, (v) => { e.ruinType = v; }, 'ruinType');
        if (OR.choice !== 'new') addP(`<div class="bt-chips">${Object.entries(ADAPTATIONS).map(([k, t]) => `<button data-a="${k}" class="${OR.adapt.has(k) ? 'on' : ''}">${t}</button>`).join('')}</div>`, (w) => w.querySelectorAll('button').forEach((bt) => (bt.onclick = () => change(() => { const S2 = new Set(resolveOrigin(e).adapt); if (S2.has(bt.dataset.a)) S2.delete(bt.dataset.a); else S2.add(bt.dataset.a); e.origin = resolveOrigin(e).choice; if (S2.size) e.adapt = [...S2]; else delete e.adapt; }))));
      } else if (tab === 'Roof') {
        sel('Roof', [...A, ['flat', 'flat, parapet'], ['mud', 'latilla / mud'], ['shed', 'shed / lean-to'], ['flat_tin', 'flat tin on joists'], ['gable_tile', 'gable, tile'], ['gable_tin', 'gable, corrugated'], ['gable_shingle', 'gable, shingle'], ['hip_tile', 'hip, tile'], ['hip_tin', 'hip, corrugated'], ['none', 'none (open)']],
          e.roofLow && e.roof === 'shed' ? 'flat_tin' : Object.entries(ROOF_STYLES).find(([, [t, m]]) => t === e.roof && m === e.roofMat)?.[0] || (e.roof === 'flat' ? 'flat' : ''), (v) => { if (v === 'flat_tin') { e.roof = 'shed'; e.roofMat = 'corrugated'; e.roofLow = true; } else { delete e.roofLow; if (v) [e.roof, e.roofMat] = ROOF_STYLES[v]; else { delete e.roof; delete e.roofMat; } } }, 'roof');
        sel('Roof use', [['', 'auto (by kind / wealth)'], ['none', 'none'], ['herbs', 'herb pots'], ['beds', 'raised beds'], ['full', 'full garden'], ['security', 'security (sandbags)'], ['drying', 'drying roof'], ['mixed', 'mixed use'], ['storage', 'storage (junk under tarps)'], ['room', 'roof room'], ['catch', 'water catchment'], ['terrace', 'terrace (tables, lights)'], ['radio', 'radio (mast, antennas)'], ['smoke', 'smoke & cook']], e.roofGarden || '', (v) => { if (v) e.roofGarden = v; else delete e.roofGarden; }, 'roofGarden');
        sel('Roof power', [['', 'auto (small chance)'], ['none', 'none'], ['solar', 'solar panel'], ['wind', 'wind charger']], e.roofPower || '', (v) => { if (v) e.roofPower = v; else delete e.roofPower; }, 'roofPower');
        sel('Water tank', [['', 'auto'], ['none', 'none']], e.tinaco === false ? 'none' : '', (v) => { if (v === 'none') e.tinaco = false; else delete e.tinaco; }, 'tinaco');
      } else if (tab === 'Add-ons') {
        const pc = e.porch === false ? 'none' : e.porch ? (e.porch.roof || 'latilla') : '';
        sel('Porch', [['', 'auto'], ['none', 'none'], ['latilla', 'latilla'], ['corrugated', 'tin'], ['tile', 'tile'], ['thatch', 'thatch']], pc, (v) => { if (v === 'none') e.porch = false; else if (v) e.porch = { ...(typeof e.porch === 'object' && e.porch ? e.porch : {}), roof: v }; else delete e.porch; }, 'porch');
        if (e.porch && typeof e.porch === 'object') slider('Porch depth (m)', 1.4, 4, 0.1, e.porch.depth || 2.4, (v) => v.toFixed(1), (v) => { e.porch = { ...e.porch, depth: v }; }, true);
        sel('Side shade', [['', 'auto'], ['none', 'none'], ['left', 'left side'], ['right', 'right side'], ['yes', 'yes (either side)']], e.sideShade === false ? 'none' : e.sideShade === true ? 'yes' : e.sideShade || '', (v) => { if (v === 'none') e.sideShade = false; else if (v === 'yes') e.sideShade = true; else if (v) e.sideShade = v; else delete e.sideShade; }, 'sideShade');
        const sc = e.signs === false && !e.sign ? 'none' : e.sign ? 'custom' : '';
        sel('Sign', [['', 'auto (by kind)'], ['none', 'none'], ['custom', 'custom text']], sc, (v) => { if (v === 'none') { e.signs = false; delete e.sign; } else if (v === 'custom') { delete e.signs; e.sign = { text: (typeof e.sign === 'object' ? e.sign?.text : e.sign) || (e.name || state.world.items.get(e.id)?.name || state.world.structures?.find((q) => q.id === e.id)?._name || 'TIENDA').toUpperCase() }; } else { delete e.signs; delete e.sign; } }, 'sign');
        if (e.sign) {
          const txt = typeof e.sign === 'string' ? e.sign : e.sign.text || '', st = (typeof e.sign === 'object' && e.sign.style) || 'painted';
          addP(`<label class="mini set">Sign text<input type="text" value="${txt.replace(/"/g, '&quot;')}" style="flex:1;text-transform:uppercase"></label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.sign = { ...(typeof e.sign === 'object' ? e.sign : {}), text: ev.target.value.toUpperCase() }; })));
          sel('Sign style', [['painted', 'hand-painted'], ['wall', 'painted on the wall'], ['prewar', 'pre-war enamel'], ['printed', 'printed'], ['neon', 'neon']], st, (v) => { e.sign = { ...(typeof e.sign === 'object' ? e.sign : { text: txt }), style: v }; }, 'sign');
          { // where it hangs and how big: height above the ground (auto = over the door), size
            const so = () => (typeof e.sign === 'object' ? e.sign : { text: txt }), y = so().y, k = so().scale ?? 1;
            addP(`<label class="mini ${y == null ? 'auto' : 'set'}">Sign height<input type="range" min="0.8" max="8" step="0.1" value="${y ?? 2.6}" style="flex:1"><b class="cv">${y == null ? 'auto' : (+y).toFixed(1) + ' m'}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = (+r.value).toFixed(1) + ' m'); r.onchange = () => change(() => { e.sign = { ...so(), y: +(+r.value).toFixed(2) }; }); w.querySelector('.cv').ondblclick = () => change(() => { const o2 = { ...so() }; delete o2.y; e.sign = o2; }); w.title = 'Double-click the value: back to auto (over the door)'; });
            addP(`<label class="mini ${k === 1 ? 'auto' : 'set'}">Sign size<input type="range" min="0.5" max="2.5" step="0.05" value="${k}" style="flex:1"><b class="cv">×${(+k).toFixed(2)}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = '×' + (+r.value).toFixed(2)); r.onchange = () => change(() => { e.sign = { ...so(), scale: +(+r.value).toFixed(2) }; }); });
          }
        }
        { // entrances: which sides get doors (main block), with a little plan of where the doors are now
          const info = it.info || {}, cur = e.entrances || {}, miss = info.entranceMiss || [];
          const ops = (info.openings || []).filter((o) => (o.floor ?? 0) === 0 && (o.type === 'door' || o.type === 'bigdoor') && o.main);
          const [W0, D0] = e.size || [10, 8], k = Math.min(110 / W0, 64 / D0), rw = W0 * k, rd = D0 * k, ox = 70 - rw / 2, oz = 40 - rd / 2;
          const mark = ops.map((o) => { const x = ox + (o.x + W0 / 2) * k, z = oz + (o.z + D0 / 2) * k, w = Math.max(5, (o.w || 1) * k), hor = Math.abs(o.nz) > Math.abs(o.nx);
            return `<rect x="${(hor ? x - w / 2 : x - 3).toFixed(1)}" y="${(hor ? z - 3 : z - w / 2).toFixed(1)}" width="${(hor ? w : 6).toFixed(1)}" height="${(hor ? 6 : w).toFixed(1)}" fill="${o.type === 'bigdoor' ? '#e8c27a' : '#f3d89c'}"/>`; }).join('');
          const lab = (t, x, y, sd) => `<text x="${x}" y="${y}" font-size="8" text-anchor="middle" fill="${cur[sd] ? '#a9c46e' : '#9c8a68'}">${t}${miss.includes(sd) ? ' ✕' : ''}</text>`;
          addP(`<div class="bt-note">Entrances (doors go on the main block; ✕ = no room on that wall)</div><svg viewBox="0 0 140 80" style="width:100%;height:80px;display:block"><rect x="${ox}" y="${oz}" width="${rw}" height="${rd}" fill="rgba(232,194,122,.12)" stroke="#9c8a68" stroke-width="1"/>${mark}${lab('FRONT', 70, Math.min(78, oz + rd + 9), 'front')}${lab('BACK', 70, Math.max(7, oz - 3), 'back')}${lab('L', Math.max(6, ox - 6), 43, 'left')}${lab('R', Math.min(134, ox + rw + 6), 43, 'right')}</svg>`);
          const EN = [['', 'auto'], ['none', 'none'], ['door', 'door'], ['two', '2 doors'], ['double', 'double door'], ['big', 'big door']];
          for (const sd of ['front', 'back', 'left', 'right']) sel(`${sd[0].toUpperCase() + sd.slice(1)}${miss.includes(sd) ? ' ✕' : ''}`, EN, cur[sd] ?? '', (v) => { const o = { ...(e.entrances || {}) }; if (v) o[sd] = v; else delete o[sd]; if (Object.keys(o).length) e.entrances = o; else delete e.entrances; });
        }
        if (e.kind === 'utility') sel('Compound', [['', 'auto'], ['chainlink', 'chain-link + barbed wire'], ['block', 'block wall + barbed wire'], ['none', 'none']], e.fence || '', (v) => { if (v) e.fence = v; else delete e.fence; }, 'fence');
      } else addP('<div class="bt-note">Owner, occupants and GM notes for this building:</div>');
      if (TABS[tab].length) addP(`<a class="bt-reset" href="#">reset ${tab.toLowerCase()} to auto</a>`, (w) => (w.firstChild.onclick = (ev) => { ev.preventDefault(); change(() => { for (const k of TABS[tab]) if (k !== 'origin') delete e[k]; }); }));
    } else if (src.k === 'plots') {
      if (multi.size >= 2 && multi.has(e.id)) {
        const U = unionPlots([...multi].map(plotOf).filter(Boolean));
        add(`<button ${U.ok ? '' : 'disabled'} title="${U.ok ? 'Join the selected plots into one (the first one picked keeps its use and street front)' : U.why}">Merge (${multi.size})</button>`, (w) => (w.firstChild.onclick = () => change(() => mergeMulti())));
      }
      add(`<select title="Use">${PLOT_USES.map((k) => `<option value="${k}" ${k === (e.use || 'building') ? 'selected' : ''}>${USE_LABELS[k] || k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => {
        const u = ev.target.value;
        if (e.bakedUse) unbakeUse(e, true); // hand-edited items stay
        if (u === 'building') { delete e.use; if (!e.building || !(state.spec.structures || []).some((s) => s.id === e.building)) buildOn(e); }
        else { e.use = u; if (e.building) { const i = (state.spec.structures || []).findIndex((s) => s.id === e.building); if (i >= 0) state.spec.structures.splice(i, 1); delete e.building; } if (NEW_USES.includes(u)) { if (e.yard) { clearYard(state.spec, e, true); delete e.yard; } populate(e); } }
      })));
      if (WATER && ['field', 'orchard', 'vineyard'].includes(e.use)) add(`<select title="Water: auto = irrigated when an acequia or stream runs by it, else dry-farmed">${[['auto', 'water: auto'], ['irrigated', 'irrigated'], ['dry', 'dry-farmed']].map(([k, t]) => `<option value="${k}" ${k === (e.water || 'auto') ? 'selected' : ''}>${t}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.water = ev.target.value; })));
      if (e.use === 'field') add(`<select title="Crop">${CROPS.map((k) => `<option ${k === (e.crop || 'corn') ? 'selected' : ''}>${k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.crop = ev.target.value; })));
      if (e.poly.length === 4) add('<button title="Split into two plots">Split</button>', (w) => (w.firstChild.onclick = () => change(() => {
        clearPlot(e);
        const i = state.spec.plots.indexOf(e), [a, b] = splitPlot(e);
        a.id = e.id; b.id = uid('plot');
        if (e.building) { const k = state.spec.structures.findIndex((x) => x.id === e.building); if (k >= 0) state.spec.structures.splice(k, 1); }
        delete a.gates; delete b.gates;
        state.spec.plots.splice(i, 1, a, b);
        if (!e.use) { buildOn(a); buildOn(b); }
      })));
      const mp = mergeablePair(state.spec.plots, e);
      if (mp) add('<button title="Merge with the neighbouring plot">Merge</button>', (w) => (w.firstChild.onclick = () => change(() => {
        for (const q of [mp.left, mp.right]) clearPlot(q);
        for (const q of [mp.left, mp.right]) if (q.building) { const k = state.spec.structures.findIndex((x) => x.id === q.building); if (k >= 0) state.spec.structures.splice(k, 1); }
        const keep = mp.left, drop = mp.right;
        keep.poly = mp.poly; delete keep.building; if (keep.s0 != null && drop.s1 != null) keep.s1 = drop.s1;
        state.spec.plots.splice(state.spec.plots.indexOf(drop), 1);
        if (!keep.use) buildOn(keep);
        if (state.selected === drop.id) state.selected = keep.id;
      })));
      add(`<select title="Wall / fence type">${FENCE_STYLES.map((k) => `<option ${k === (e.fence || 'auto') ? 'selected' : ''}>${k === 'none' ? 'no fence' : k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { unbakeFences(e); e.fence = ev.target.value === 'no fence' ? 'none' : ev.target.value; })));
      wallLook(add, change, (k) => (k === 'h' ? e.fenceH : e.fencePaint), (k, v) => {
        const key = k === 'h' ? 'fenceH' : 'fencePaint'; if (v == null) delete e[key]; else e[key] = v;
        for (const w of state.spec.walls || []) if (w._plot === e.id) { const wk = k === 'h' ? 'height' : 'paint'; if (v == null) delete w[wk]; else w[wk] = v; } // baked / hand-edited walls of this plot too
      }, 1.9);
      add('<button title="New random fence and a new building">Reroll</button>', (w) => (w.firstChild.onclick = () => change(() => {
        e.v = (e.v || 0) + 1;
        if (!e.use && e.building) { const i = (state.spec.structures || []).findIndex((x) => x.id === e.building); if (i >= 0 && !state.spec.structures[i].touched) { const st = autoBuilding(e, { kind: o.bk, layout: o.bl, setback: o.brow ? 'row' : 'tight', density: o.dens ?? 0.5, v: e.v * 7 + 1 }, state.world.seed); if (st) { st.id = e.building; state.spec.structures[i] = st; } } }
        rowParty(state.spec);
      })));
      add(`<span class="sides" title="Which sides get a fence">${sideNames(e.poly).map((n, i) => `<label class="chk"><input type="checkbox" data-e="${i}" ${(e.noFence || []).includes(i) ? '' : 'checked'}>${n}</label>`).join('')}</span>`, (w) => w.querySelectorAll('input').forEach((c) => (c.onchange = () => change(() => {
        unbakeFences(e);
        const i = +c.dataset.e, s0 = new Set(e.noFence || []);
        if (c.checked) s0.delete(i); else s0.add(i);
        if (s0.size) e.noFence = [...s0].sort(); else delete e.noFence;
      }))));
      { // ground surface: what the plot is paved / floored with, how much of it, and what fills the rest
        const G = state.world._ground?.[e.id]?.g || {}, cur = e.ground || {};
        const gsel = (lab, key, opts, val) => add(`<label class="mini">${lab}<select>${[['', `auto (${(opts.find(([k]) => k === G[key]) || ['', G[key] || '—'])[1]})`], ...opts].map(([k, t]) => `<option value="${k}" ${k === (val ?? '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { const g = { ...(e.ground || {}) }; if (ev.target.value) g[key] = ev.target.value; else delete g[key]; if (Object.keys(g).length) e.ground = g; else delete e.ground; })));
        const SO = Object.entries(SURFACES).map(([k, v]) => [k, v.label]);
        gsel('Ground', 'surface', SO, cur.surface);
        gsel('Covers', 'cover', Object.entries(COVERS), cur.cover);
        gsel('Rest of the plot', 'fill', SO.filter(([k]) => !SURFACES[k].hard), cur.fill);
      }
      if (!e.building || !(state.spec.structures || []).some((s) => s.id === e.building)) add('<button>Build here</button>', (w) => (w.firstChild.onclick = () => change(() => buildOn(e))));
      if (e.use === 'market') { // market rules: Density = rows / stalls, Liveliness = signs of people, Wealth = quality
        const sl = (lab, key, tip) => add(`<label class="mini" title="${tip}">${lab}<input type="range" min="0" max="1" step="0.1" value="${e[key] ?? (key === 'density' ? 0.7 : 0.5)}" style="flex:1"><b class="cv">${Math.round((e[key] ?? (key === 'density' ? 0.7 : 0.5)) * 100)}%</b></label>`, (w) => { const r = w.querySelector('input'), lb = w.querySelector('.cv'); r.oninput = () => (lb.textContent = `${Math.round(+r.value * 100)}%`); r.onchange = () => change(() => { e[key] = +r.value; }); });
        sl('Density', 'density', 'How many rows and stalls; the grid, aisles and zones stay');
        sl('Liveliness', 'life', 'Signs of people only: chairs out, stock stacked at the row ends, carts and animals on the service edge');
        add(`<label class="mini">Wealth<select>${[['', 'auto (town)'], ['poor', 'poor: blankets, tarps'], ['average', 'average: stalls, mixed shade'], ['wealthy', 'wealthy: stalls under tin']].map(([k, t]) => `<option value="${k}" ${k === (e.wealth || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { if (ev.target.value) e.wealth = ev.target.value; else delete e.wealth; })));
      }
      if (e.use === 'mystic') add(`<label class="mini" title="Curandera: herbs, altar, waiting bench. Bruja: bottle tree, bone chimes, offerings, wild cactus. Seer: totems, a mast, a reading stall">Kind<select>${[['', 'auto'], ['curandera', 'curandera'], ['bruja', 'bruja'], ['wasteland', 'wasteland seer']].map(([k, t]) => `<option value="${k}" ${k === (e.mystic || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { if (ev.target.value) e.mystic = ev.target.value; else delete e.mystic; populate(e); })));
      if (e.use === 'multifamily') {
        add(`<label class="mini" title="Vecindad: rooms round a shared patio. Cuartería: a row of one-room homes. Block: a pre-war apartment block, squatted. Compound: an extended family's houses round one yard">Kind<select>${[['', 'auto'], ['vecindad', 'vecindad'], ['cuarteria', 'cuartería'], ['block', 'pre-war block'], ['compound', 'family compound'], ['locales', 'row of locales']].map(([k, t]) => `<option value="${k}" ${k === (e.mfKind || '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { if (ev.target.value) e.mfKind = ev.target.value; else delete e.mfKind; populate(e); })));
        for (const [lab, key, tip] of [['Density', 'density', 'How full: more homes / junk / things out'], ['Liveliness', 'life', 'Signs of people: washing, chairs out, toys, animals']]) add(`<label class="mini" title="${tip}">${lab}<input type="range" min="0" max="1" step="0.1" value="${e[key] ?? 0.5}" style="flex:1"><b class="cv">${Math.round((e[key] ?? 0.5) * 100)}%</b></label>`, (w) => { const r = w.querySelector('input'), lb = w.querySelector('.cv'); r.oninput = () => (lb.textContent = `${Math.round(+r.value * 100)}%`); r.onchange = () => change(() => { e[key] = +r.value; populate(e); }); });
      }
      if (e.use === 'trader') { // casa comercial options: re-lay with the same seed
        const fs = (lab, key, opts, tip) => add(`<label class="mini" title="${tip}">${lab}<select>${opts.map(([k, t]) => `<option value="${k}" ${k === String(e[key] ?? '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { const v = ev.target.value; if (v === '') delete e[key]; else e[key] = v; populate(e); })));
        fs('Size', 'traderSize', [['', 'auto (by plot)'], ['small', 'small dealer'], ['regional', 'regional house'], ['big', 'big house']], 'Warehouses, wagons, quarters and the owner\'s house grow with it');
        fs('Security', 'traderSec', [['', 'auto'], ['low', 'low (plain wall)'], ['armed', 'armed (glass / wire, lookout)'], ['fortified', 'fortified (wire, tower, sandbags, searchlight)']], 'Wall top, lookout, guard posts');
        fs('Trade', 'traderFocus', [['', 'auto'], ['grain', 'grain'], ['salt', 'salt'], ['water', 'water'], ['scrap', 'scrap'], ['general', 'general goods']], 'What fills the yard and the wagons');
        add(`<label class="mini set">House name<input type="text" value="${(e.traderName || '').replace(/"/g, '&quot;')}" placeholder="auto (CASA …)" style="flex:1;text-transform:uppercase"></label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { const v = ev.target.value.trim().toUpperCase(); if (v) e.traderName = v; else delete e.traderName; populate(e); })));
      }
      if (e.use === 'farmstead') { // rancho options: re-lay with the same seed
        const fs = (lab, key, opts, tip) => add(`<label class="mini" title="${tip}">${lab}<select>${opts.map(([k, t]) => `<option value="${k}" ${k === String(e[key] ?? '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { const v = ev.target.value; if (v === '') delete e[key]; else e[key] = v === 'false' ? false : v; populate(e); })));
        fs('Wealth', 'farmWealth', [['', 'auto (town)'], ['poor', 'poor ranchito'], ['average', 'average'], ['rich', 'big rancho']], 'Poor: shed, brush fences, a well. Rich: barn, adobe yard wall, windmill, ditches, fenced fields');
        fs('Main crop', 'crop', [['', 'auto'], ...CROPS.map((c) => [c, c])], 'The crop most fields grow');
        fs('Livestock', 'livestock', [['', 'yes (corral + pen)'], ['false', 'none']], 'Brahmin corral behind the barn and a small pig / goat pen');
        fs('Field fences', 'fieldFence', [['', 'auto'], ['none', 'none'], ['pole', 'pole'], ['wire', 'wire'], ['stone_low', 'low stone']], 'Fences round each field');
      }
      if (NEW_USES.includes(e.use)) add(`<button title="Lay the ${USE_LABELS[e.use]} out afresh; anything you moved or edited by hand stays">Re-roll contents</button>`, (w) => (w.firstChild.onclick = () => change(() => populate(e, true))));
      if (!e.use || e.use === 'building' || e.use === 'empty') {
        add(`<label class="mini">Household<select>${Object.entries(HOUSEHOLDS).map(([k, l]) => `<option value="${k}" ${k === (e.household || 'auto') ? 'selected' : ''}>${k === 'auto' && e.yardHousehold ? `auto (${HOUSEHOLDS[e.yardHousehold]})` : l}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { if (ev.target.value === 'auto') delete e.household; else e.household = ev.target.value; })));
        if ((e.household || e.yardHousehold) === 'craftsman') add(`<label class="mini">Craft<select>${Object.entries(CRAFTS).map(([k, l]) => `<option value="${k}" ${k === (e.craft || 'auto') ? 'selected' : ''}>${k === 'auto' && e.yardCraft ? `auto (${CRAFTS[e.yardCraft]})` : l}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { delete e.yardCraft; if (ev.target.value === 'auto') delete e.craft; else e.craft = ev.target.value; })));
        add(`<label class="mini" title="How full the yard is: how many groups of things (kitchen corner, pens, stacks, sheds) and trees; the rest stays swept ground">Density<input type="range" min="0" max="1" step="0.1" value="${e.density ?? 0.5}" style="flex:1"><b class="cv">${Math.round((e.density ?? 0.5) * 100)}%</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = `${Math.round(+r.value * 100)}%`); r.onchange = () => change(() => { e.density = +r.value; if (e.yard) { clearYard(state.spec, e, true); populate(e); } }); }); // same layout, more / less life
        add(`<label class="mini" title="Signs of people only: washing on the line, chairs pulled out, fires lit, animals out, things left lying. It never moves anything">Liveliness<input type="range" min="0" max="1" step="0.1" value="${e.life ?? 0.5}" style="flex:1"><b class="cv">${Math.round((e.life ?? 0.5) * 100)}%</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = `${Math.round(+r.value * 100)}%`); r.onchange = () => change(() => { e.life = +r.value; if (e.yard) { clearYard(state.spec, e, true); populate(e); } }); }); // same layout, more / less life
        add(`<button title="Lay out the yard round the building already on the plot (an open yard when there is none)">Populate plot</button>`, (w) => (w.firstChild.onclick = () => change(() => { if (e.use === 'empty') delete e.use; if (e.yard) clearYard(state.spec, e, true); populate(e); })));
        if (e.yard) add('<button title="A new yard; anything you moved or edited by hand stays">Re-roll yard</button>', (w) => (w.firstChild.onclick = () => change(() => populate(e, true))));
        if (e.yard) add('<button title="Remove the generated yard (hand-edited items stay)">Clear yard</button>', (w) => (w.firstChild.onclick = () => change(() => { clearYard(state.spec, e, true); delete e.yard; })));
      }
      if (api.plotEdit !== e.id) add('<button title="Move, turn or delete what\'s in the plot (or double-click the plot)">Edit contents</button>', (w) => (w.firstChild.onclick = () => api.enterPlot(e.id)));
      if (e.bakedFence || e.bakedUse) add('<button title="Throw away the hand edits and generate the plot afresh">Regenerate plot</button>', (w) => (w.firstChild.onclick = () => {
        if (!confirm('Regenerate this plot? Hand edits to its fences, building and contents are lost (Ctrl+Z undoes).')) return;
        change(() => {
          clearPlot(e); e.v = (e.v || 0) + 1;
          if (!e.use && e.building) { const i = (state.spec.structures || []).findIndex((x) => x.id === e.building); if (i >= 0) { const st = autoBuilding(e, { kind: o.bk, layout: o.bl, setback: o.brow ? 'row' : 'tight', density: o.dens ?? 0.5, v: e.v * 7 + 1 }, state.world.seed); if (st) { st.id = e.building; state.spec.structures[i] = st; } } }
          rowParty(state.spec);
        });
      }));
    } else if (src.k === 'props' && e.type === 'custom_sign') { // the sign tool's signs: text, type, size, colour, height
      add(`<textarea rows="2" style="width:100%;font:inherit;text-transform:uppercase">${(e.text || '').replace(/</g, '&lt;')}</textarea>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.text = ev.target.value.toUpperCase().trim() || 'SIGN'; e.name = `Sign · ${e.text.split('\n')[0]}`; })));
      const sel2 = (lab, opts, cur, fn) => add(`<label class="mini">${lab}<select>${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => fn(ev.target.value))));
      sel2('Type', [['painted', 'hand-painted'], ['printed', 'printed'], ['neon', 'neon']], e.kind || 'painted', (v) => { e.kind = v; if (!SIGN_COLORS[v][e.color]) e.color = Object.keys(SIGN_COLORS[v])[0]; });
      sel2('Size', [['S', 'S'], ['M', 'M'], ['L', 'L']], e.size || 'M', (v) => { e.size = v; });
      sel2('Colour', Object.entries(SIGN_COLORS[e.kind || 'painted']).map(([k, v]) => [k, v[2]]), e.color || '', (v) => { e.color = v; });
      if (e.mount === 'wall') add(`<label class="mini">Height (m)<input type="range" min="0.8" max="8" step="0.1" value="${e.height ?? 2.6}" style="flex:1"><b class="cv">${(+(e.height ?? 2.6)).toFixed(1)}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = (+r.value).toFixed(1)); r.onchange = () => change(() => { e.height = +r.value; }); });
      else add(`<label class="mini">${e.mount === 'roof' ? 'Frame' : 'Posts'} (m)<input type="range" min="${e.mount === 'roof' ? 0.2 : 0.4}" max="${e.mount === 'roof' ? 3 : 5}" step="0.1" value="${e.post ?? (e.mount === 'roof' ? 0.7 : 1.7)}" style="flex:1"><b class="cv">${(+(e.post ?? (e.mount === 'roof' ? 0.7 : 1.7))).toFixed(1)}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = (+r.value).toFixed(1)); r.onchange = () => change(() => { e.post = +r.value; }); });
    } else if (src.k === 'paint') {
      const GP = api.GROUND_PAINTS;
      add(`<select title="Ground">${Object.entries(GP).map(([k, v]) => `<option value="${k}" ${k === e.kind ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { const G = GP[ev.target.value]; e.kind = ev.target.value; e.color = G.color; e.alpha = G.alpha; if (G.layer !== undefined) { e.layer = G.layer; e.layerK = 1; } else { delete e.layer; delete e.layerK; } })));
      add(`<select title="Edge"><option value="soft" ${e.edge > 0.5 ? 'selected' : ''}>soft edge</option><option value="crisp" ${e.edge <= 0.5 ? 'selected' : ''}>crisp edge</option></select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.edge = ev.target.value === 'crisp' ? 0.15 : 1.2; })));
      add('<button>Delete</button>', (w) => (w.firstChild.onclick = () => ed.deleteSel()));
    } else if (src.k === 'roads') {
      add(`<select title="Road type">${Object.entries(ROAD_TYPES).map(([k, v]) => `<option value="${v.type}" ${v.type === e.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.type = ev.target.value; e.width = Object.values(ROAD_TYPES).find((v) => v.type === e.type).width; })));
      add(`<input type="number" min="1" max="24" step="0.5" value="${e.width || ''}" style="width:60px" title="Width (m)">`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.width = +ev.target.value; })));
      add(`<label class="chk" title="A wide packed-dirt apron each side between the road and the first buildings"><input type="checkbox" ${e.frontage ? 'checked' : ''}> dirt apron</label><input type="number" min="2" max="25" step="1" value="${e.frontage || 10}" style="width:46px" title="Apron width each side (m)">`, (w) => { const [cb, nb] = w.querySelectorAll('input'); cb.onchange = () => change(() => { if (cb.checked) e.frontage = Math.max(2, +nb.value || 10); else delete e.frontage; }); nb.onchange = () => { if (cb.checked) change(() => { e.frontage = Math.max(2, Math.min(25, +nb.value || 10)); }); }; });
      add(`<label class="chk" title="The road sits on its own raised bed (about 80 cm), earth shoulders sloping down"><input type="checkbox" ${(e.raised ?? (e.type === 'highway' ? 0.8 : 0)) > 0 ? 'checked' : ''}> raised bed</label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.raised = ev.target.checked ? 0.8 : 0; })));
      add(`<select title="Laid stone along the wealthy stretch (auto), or none"><option value="auto" ${!e.noLaid ? 'selected' : ''}>stone stretch: ${e.laid?.length ? (e.laidSurface === 'cobble' ? 'cobble' : 'pavers') : 'auto'}</option><option value="pavers" ${!e.noLaid && e.laidSurface === 'pavers' && e.laid?.length ? '' : ''}>pavers (adoquín)</option><option value="cobble">cobble (empedrado)</option><option value="off" ${e.noLaid ? 'selected' : ''}>no stone paving</option></select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { const v = ev.target.value; if (v === 'off') { e.noLaid = true; delete e.laid; delete e.walkSeg; delete e.walk; } else { delete e.noLaid; if (v !== 'auto') e.laidSurface = v; } })));
      const RC = [[0.12, 'ruined'], [0.3, 'broken'], [0.5, 'worn'], [0.7, 'patched'], [0.88, 'kept'], [1.01, 'maintained']], rcn = (v) => RC.find(([t]) => v <= t)[1];
      add(`<label class="mini">Condition<input type="range" min="0" max="1" step="0.02" value="${e.condition ?? 0.6}" style="flex:1"><b class="cv">${rcn(e.condition ?? 0.6)}</b></label>`, (w) => { const r = w.querySelector('input'), lab = w.querySelector('.cv'); r.oninput = () => (lab.textContent = rcn(+r.value)); r.onchange = () => change(() => { e.condition = +r.value; }); });
    } else if (src.k === 'fields') {
      add(`<select title="Kind">${Object.entries(FIELD_KINDS).map(([k, v]) => `<option value="${k}" ${k === (e.fallow ? 'fallow' : e.type) ? 'selected' : ''}>${v}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { const k = ev.target.value; e.type = k === 'fallow' ? 'field' : k; if (k === 'fallow') e.fallow = true; else delete e.fallow; if (k === 'corral' && !e.animals) e.animals = { brahmin: 3 }; })));
      add(`<select title="Fence">${['none', 'pole', 'rail', 'wire', 'stone_low', 'ocotillo', 'adobe', 'wood'].map((k) => `<option value="${k}" ${k === (e.fence || 'none') ? 'selected' : ''}>${k === 'none' ? 'no fence' : k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { const v = ev.target.value; if (v === 'none') { delete e.fence; delete e.gates; } else { e.fence = v; e.gates ||= [{ at: 0.1, width: 3 }]; } })));
      if (e.fence) add('<button>Remove fence</button>', (w) => (w.firstChild.onclick = () => change(() => { delete e.fence; delete e.gates; })));
      if (WATER && FARM_FIELDS.includes(e.type) && !e.fallow) add(`<select title="Water: auto = irrigated when an acequia or stream runs by it, else dry-farmed">${[['auto', 'water: auto'], ['irrigated', 'irrigated'], ['dry', 'dry-farmed']].map(([k, t]) => `<option value="${k}" ${k === (e.water || 'auto') ? 'selected' : ''}>${t}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.water = ev.target.value; })));
      if (e.type === 'field' && !e.fallow) add(`<select title="Crop">${CROPS.map((k) => `<option ${k === (e.crop || 'corn') ? 'selected' : ''}>${k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.crop = ev.target.value; })));
    } else if (src.k === 'retains') {
      const sel = (lab, opts, cur, fn) => add(`<label class="mini">${lab}<select>${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => fn(ev.target.value))));
      sel('Type', Object.entries(RETAIN_TYPES), e.type || 'drystone', (v) => { e.type = v; });
      if (!e.closed) add('<button title="Raise the other side instead">Flip high side</button>', (w) => (w.firstChild.onclick = () => change(() => { e.side = -(e.side || 1); })));
      if (!e.road) sel('Mode', [['fill', 'raise the high side'], ['cut', 'cut the low side']], e.mode || 'fill', (v) => { e.mode = v; });
      if (e.road) add('<span class="dim" style="font-size:11px">level follows the road</span>');
      else add(`<label class="mini">Height (m)<input type="number" min="0.3" max="8" step="0.1" value="${e.rise === 'match' ? 1.2 : e.rise ?? 1.2}" style="width:70px;margin-left:auto"></label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.rise = +ev.target.value || 1.2; })));
      if (!e.closed) add(`<label class="mini">Terrace depth<input type="number" min="2" max="40" step="1" value="${e.depth || 10}" style="width:70px;margin-left:auto"></label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.depth = +ev.target.value || 10; })));
      add(`<label class="chk"><input type="checkbox" ${e.cap ? 'checked' : ''}> cap</label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.cap = ev.target.checked; })));
      add(`<label class="chk"><input type="checkbox" ${e.rail ? 'checked' : ''}> railing</label>`, (w) => (w.querySelector('input').onchange = (ev) => change(() => { e.rail = ev.target.checked; })));
    } else if (src.k === 'walls') {
      add(`<select title="Wall type">${WALL_TYPES.map((k) => `<option ${k === e.type ? 'selected' : ''}>${k}</option>`).join('')}</select>`, (w) => (w.firstChild.onchange = (ev) => change(() => { e.type = ev.target.value; })));
      wallLook(add, change, (k) => (k === 'h' ? e.height : e.paint), (k, v) => { const key = k === 'h' ? 'height' : 'paint'; if (v == null) delete e[key]; else e[key] = v; }, 1.9);
      if (['chainlink', 'block', 'concrete', 'adobe'].includes(e.type)) add(`<label class="mini">Barbed wire<select><option value="">none</option><option value="true" ${e.barbed === true ? 'selected' : ''}>leaning out</option><option value="in" ${e.barbed === 'in' ? 'selected' : ''}>leaning in</option><option value="both" ${e.barbed === 'both' ? 'selected' : ''}>V (both ways)</option></select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { const v = ev.target.value; if (!v) delete e.barbed; else e.barbed = v === 'true' ? true : v; })));
      if (e.type === 'compound') add(`<label class="mini">Livery<select><option value="">none</option>${Object.entries(LIVERIES).map(([k, v]) => `<option value="${k}" ${k === e.livery ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>`, (w) => (w.querySelector('select').onchange = (ev) => change(() => { if (ev.target.value) e.livery = ev.target.value; else delete e.livery; })));
    }
  };
}

// name + stat block, edited in place (no rebuild: names and stats don't change geometry)
const NAMEABLE = new Set(['structures', 'props', 'plots', 'roads', 'walls', 'fields', 'retains']);
function statsForm(el, e, k) {
  return; // stats panel removed for now (names live in the selection card)
  // eslint-disable-next-line no-unreachable
  if (!NAMEABLE.has(k)) return;
  const st = e.stats || {};
  const list = (v) => (Array.isArray(v) ? v.join('\n') : v || '');
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  el.innerHTML = `
    <label>Name<input data-f="name" value="${esc(e.name)}" placeholder="${k === 'roads' ? 'Calle …' : 'Name'}"></label>
    ${k === 'roads' || k === 'walls' || k === 'retains' ? '' : `<label>Owner<input data-f="owner" value="${esc(st.owner)}"></label>
    <label>Occupants <span class="dim">one per line</span><textarea data-f="occupants" rows="2">${esc(list(st.occupants))}</textarea></label>`}
    <label>Condition<input data-f="condition" value="${esc(st.condition)}"></label>
    <label>GM notes <span class="dim">one per line</span><textarea data-f="gm_notes" rows="3">${esc(list(st.gm_notes))}</textarea></label>
    <label class="chk"><input type="checkbox" data-f="label" ${e.label === false ? '' : 'checked'}> show label</label>`;
  el.querySelectorAll('[data-f]').forEach((inp) => {
    inp.onchange = () => {
      const api = window.mapgenEditor?.api; if (!api) return;
      api.pushUndo();
      const f = inp.dataset.f, v = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
      if (f === 'name') { if (v) e.name = v; else delete e.name; }
      else if (f === 'label') { if (v) delete e.label; else e.label = false; }
      else {
        e.stats ||= {};
        const val = f === 'occupants' || f === 'gm_notes' ? v.split('\n').map((x) => x.trim()).filter(Boolean) : v;
        if ((Array.isArray(val) && !val.length) || val === '') delete e.stats[f]; else e.stats[f] = val;
        if (!Object.keys(e.stats).length) delete e.stats;
      }
      api.commit(30);
    };
  });
}

function simplify(P, tol) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); if (b - a < 2) continue;
    const [ax, az] = P[a], [bx, bz] = P[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    let m = -1, md = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / L; if (d > md) { md = d; m = i; } }
    if (md > tol) { keep[m] = 1; st.push([a, m], [m, b]); }
  }
  return P.filter((_, i) => keep[i]);
}

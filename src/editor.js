// BUILD MODE — map builder, phase 1: terrain generator, sculpt + ground-paint + plant brushes,
// select / move / rotate / delete, prop placement, undo/redo. The place spec stays the single source
// of truth: every edit changes the spec, previews live where it's cheap (terrain mesh, ground map,
// moved objects), then the world is rebuilt from the spec when you pause ("settle").
import * as THREE from 'three';
import { RNG, smooth } from './rng.js';
import { encodeDelta } from './terrain.js';
import { GROUND, PAINT } from './palette.js';
import { PROP_TYPES, MODEL_PROPS } from './props.js';
import { SPECIES } from './vegetation.js';
import { toWorld, pointInPoly } from './geo.js';
import { initBuildTools, BUILD_TOOLS, buildToolOptions } from './editor-build.js';
import { townName } from './names.js';
import { initBuildMenu } from './buildmenu.js';
import { traceStream, WATER, WATER_PROPS } from './water.js';
import { lineStyle, liveLoop, HI } from './hilite.js';
import { isKey } from './keys.js';

const TOOLS = [
  ['select', 'Select', 'V', 'Click to select · drag the selected item to move · R / Shift+R turn (hold R + wheel: free) · Del delete'],
  ['raise', 'Raise', '1', 'Drag to raise ground'],
  ['lower', 'Lower', '2', 'Drag to lower ground'],
  ['flatten', 'Flatten', '3', 'Drag to level ground to the height where you start'],
  ['smooth', 'Smooth', '4', 'Drag to soften bumps and edges'],
  ['paint', 'Paint', '5', 'Drag to paint the ground'],
  ['plant', 'Plant', '6', 'Click / drag to add plants'],
  ['erase', 'Clear', '7', 'Drag to clear plants'],
  ['prop', 'Prop', '8', 'Click to place the chosen prop where you click (gates, barriers and the like snap to roads / walls; Shift + wheel = offset) · R / hold R + wheel turns it'],
  ['scatter', 'Scatter', '9', 'Click / drag to scatter the chosen set'],
  ...BUILD_TOOLS,
];
const SCULPT = new Set(['raise', 'lower', 'flatten', 'smooth']);
const BRUSH = new Set([...SCULPT, 'paint', 'plant', 'erase', 'scatter']);
export const SCATTER_SETS = {
  junk: { label: 'Junk', mix: { scrap_pile: 3, tires: 3, engine_block: 1.5, barrel: 1.5, crates: 1, rubble: 1 } },
  rubble: { label: 'Rubble', mix: { rubble: 4, rocks: 2, scrap_pile: 1 } },
  barrels: { label: 'Barrels & crates', mix: { barrel: 3, crates: 3, water_jugs: 1.5, goods: 0.5 } },
  camp: { label: 'Camp litter', mix: { bedroll: 2, firepit: 0.6, crates: 1.5, woodpile: 1, barrel: 1, water_jugs: 1 } },
  farm: { label: 'Farm yard', mix: { haystack: 2, woodpile: 2, chickens: 1.5, cart: 0.6, barrel: 1, trough: 0.8 } },
  bones: { label: 'Bones & wreckage', mix: { bones: 3, car_wreck: 0.6, tires: 2, rocks: 1 } },
};
export const GROUND_PAINTS = {
  shrubland: { label: 'Shrubland', color: 0x8a8556, layer: 'scrub', alpha: 0.85 },
  dirt: { label: 'Dirt', color: PAINT.dirt, layer: 'dirt', alpha: 0.9 },
  packed: { label: 'Packed earth', color: PAINT.packed, layer: 'urban', alpha: 0.9 },
  gravel: { label: 'Gravel', color: 0x9e9384, layer: 'gravel', alpha: 0.95 },
  sand: { label: 'Sand', color: PAINT.sand, layer: null, alpha: 0.9 },
  tilled: { label: 'Tilled', color: PAINT.tilled, layer: 'till', alpha: 0.9 },
  cobble: { label: 'Cobble', color: 0x9e958a, layer: 'cobble', alpha: 0.95 },
  concrete: { label: 'Concrete', color: 0xb0aca2, layer: 'concrete', alpha: 0.95 },
  rock: { label: 'Bare rock', color: 0x948572, layer: 'gravel', alpha: 0.8 },
  busier: { label: 'Busier (more life)', color: 0xd89a40, layer: null, alpha: 0, activity: true },
  quieter: { label: 'Quieter (less life)', color: 0x6a86a8, layer: null, alpha: 0, activity: true },
};
const PLANT_SETS = { mix: 'Biome mix', shrubs: 'Shrubs', trees: 'Trees', palms: 'Palms', cactus: 'Cactus', grass: 'Grass' };
const SETS = {
  shrubs: { sage: 3, encelia: 2, creosote: 2 }, trees: { pepper_tree: 2, mesquite: 2, tamarisk: 2, eucalyptus: 1.5 },
  palms: { fan_palm: 2, date_palm: 1 }, cactus: { nopal: 2, cholla: 1, agave: 1.5, cardon: 0.3 }, grass: { grass: 1 },
};
const BIOME_MIX = {
  coastal_valley: { grass: 8, sage: 3.5, encelia: 2.5, nopal: 0.8, agave: 0.6, pepper_tree: 0.15, mesquite: 0.25, tamarisk: 0.12, creosote: 1 },
  desert: { creosote: 6, cholla: 2.5, ocotillo: 1, agave: 1, grass: 1.5 }, scrubland: { sage: 4, creosote: 3, grass: 5, nopal: 1 },
};

export function initEditor(ctx) {
  const { state, stage, $ } = ctx;
  let api = null;
  // the paint tool in polygon mode hands its clicks to the build tools' 'ppaint' (corners, snapping, finish)
  const X = () => api?.ext[ed.tool === 'paint' && ed.paintMode === 'poly' ? 'ppaint' : ed.tool];
  const brushOn = () => BRUSH.has(ed.tool) && !(ed.tool === 'paint' && ed.paintMode === 'poly');
  const ed = (window.mapgenEditor = {
    on: false, tool: 'select', size: 8, strength: 0.5, paint: 'shrubland', paintMode: 'brush', paintEdge: 'soft', plants: 'mix', prop: 'barrel', propRot: 0, scatter: 'junk',
    undo: [], redo: [], settleT: 0, stroke: null, drag: null,
  });

  // ---------------------------------------------------------------- UI
  const panel = document.createElement('div');
  panel.id = 'ed';
  panel.className = 'box';
  const propList = [...new Set([...PROP_TYPES, ...Object.keys(MODEL_PROPS || {})])].filter((p) => WATER || !WATER_PROPS.includes(p)).sort();
  panel.innerHTML = `
    <div class="ed-hd"><span class="brand">BUILD</span>
      <span><button id="ed-undo" title="Undo (Ctrl+Z)">↶</button><button id="ed-redo" title="Redo (Ctrl+Shift+Z)">↷</button></span></div>
    <div class="ed-row ed-file"><button id="ed-new" title="Generate a new plot of land">New map</button><button id="ed-save" title="Save this map to a file (Ctrl+S)">Save</button><label class="filebtn" title="Open a map file">Open<input id="ed-open" type="file" accept=".json,application/json"></label><button id="ed-restore" title="Restore the last automatic backup of this map">Backup…</button></div>
    <div id="ed-saved" class="dim"></div>
    <div class="ed-row" id="ed-selrow" style="display:none"><button id="ed-sel" data-tool="select" title="Select / move / edit (V)">Select <span class="key">V</span></button><span id="ed-tool" class="ed-toolname"></span></div>
    <div class="ed-row" id="ed-brush"><span class="lbl2">Size</span><input id="ed-size" type="range" min="1" max="40" step="0.5"><span id="ed-size-v"></span>
      <span class="lbl2">Strength</span><input id="ed-str" type="range" min="0.05" max="1" step="0.05"></div>
    <div class="ed-row" id="ed-paint-w"><span class="lbl2">Ground</span><select id="ed-paint">${Object.entries(GROUND_PAINTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div>
    <div class="ed-row" id="ed-pmode-w"><span class="seg" id="ed-pmode"><button data-m="brush" class="on">Brush</button><button data-m="poly">Polygon</button></span><span class="seg" id="ed-pedge"><button data-e="soft" class="on">Soft edge</button><button data-e="crisp">Crisp</button></span></div>
    <div class="ed-row" id="ed-plant-w"><span class="lbl2">Plants</span><select id="ed-plants">${Object.entries(PLANT_SETS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}<optgroup label="Single species">${SPECIES.filter((s) => !['corn', 'beans', 'squash', 'chili', 'maguey', 'vine'].includes(s)).map((s) => `<option value="sp:${s}">${s.replace(/_/g, ' ')}</option>`).join('')}</optgroup></select></div>
    <div class="ed-row" id="ed-prop-w"><span class="lbl2">Prop</span><select id="ed-prop">${propList.map((p) => `<option value="${p}">${p.replace(/_/g, ' ')}</option>`).join('')}</select></div>
    <div class="ed-row" id="ed-scat-w"><span class="lbl2">Set</span><select id="ed-scat">${Object.entries(SCATTER_SETS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div>
    ${buildToolOptions()}
    <div id="ed-hint"></div>`;
  (document.querySelector('#rcol') || document.body).appendChild(panel);
  const newDlg = document.createElement('div');
  newDlg.id = 'ed-newdlg';
  newDlg.innerHTML = `<div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="ttl">New map</div><button id="nm-x">×</button></div>
    <div class="nm-grid">
      <label>Name<span style="display:flex;gap:4px"><input id="nm-name" value="New place" style="flex:1"><button id="nm-rename" title="Another town name">⟳</button></span></label>
      <label>Width (m)<input id="nm-w" type="number" value="600" min="60" max="1000" step="10"></label>
      <label>Depth (m)<input id="nm-d" type="number" value="500" min="60" max="1000" step="10"></label>
      <label>Biome<select id="nm-biome">${Object.keys(GROUND).map((b) => `<option ${b === 'coastal_valley' ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
      <label>Hilliness<input id="nm-relief" type="range" min="0" max="3" step="0.1" value="1"></label>
      <label>Hills<input id="nm-hills" type="number" value="2" min="0" max="8"></label>
      <label>Mesas<input id="nm-mesas" type="number" value="0" min="0" max="4"></label>
      <label title="Dry washes, always running from the sierra (east) down to the coast (west); more on a longer map">Arroyos<select id="nm-arroyo"><option value="0">none</option><option value="0.3">few</option><option value="0.6" selected>normal</option><option value="0.95">many</option></select></label>
      <label title="The sierra is always east, the Pacific west">Sea<select id="nm-coast"><option value="">off the map</option><option value="on">on the map (west)</option></select></label>
      <label>Vegetation<input id="nm-veg" type="range" min="0" max="1" step="0.05" value="0.35"></label>
      <label>Seed<span style="display:flex;gap:4px"><input id="nm-seed" style="flex:1"><button id="nm-reseed" title="New seed">⟳</button></span></label>
    </div>
    <div class="actions"><button id="nm-go" class="primary">Generate</button></div></div>`;
  document.body.appendChild(newDlg);
  const toolbar = $('#toolbar');
  const btn = document.createElement('button');
  btn.id = 'build-t'; btn.textContent = 'Build'; btn.title = 'Build mode (B)';
  toolbar.insertBefore(btn, toolbar.firstChild);
  btn.onclick = () => setOn(!ed.on);

  $('#ed-size').value = ed.size; $('#ed-str').value = ed.strength;
  const syncUI = () => {
    panel.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === ed.tool));
    $('#ed-brush').style.display = BRUSH.has(ed.tool) ? '' : 'none';
    $('#ed-paint-w').style.display = ed.tool === 'paint' ? '' : 'none';
    $('#ed-pmode-w').style.display = ed.tool === 'paint' ? '' : 'none';
    if (ed.tool === 'paint' && ed.paintMode === 'poly') $('#ed-brush').style.display = 'none';
    $('#ed-plant-w').style.display = ed.tool === 'plant' ? '' : 'none';
    $('#ed-prop-w').style.display = ed.tool === 'prop' ? '' : 'none';
    $('#ed-scat-w').style.display = ed.tool === 'scatter' ? '' : 'none';
    const tl = TOOLS.find((t) => t[0] === ed.tool);
    $('#ed-tool').textContent = ed.tool === 'select' ? '' : `${tl[1]}${ed.tool === 'prop' ? ' · ' + ed.prop.replace(/_/g, ' ') : ed.tool === 'paint' ? ' · ' + GROUND_PAINTS[ed.paint].label : ''}`;
    api?.syncOpts?.();
    for (const [id, v] of [['#ed-paint', ed.paint], ['#ed-plants', ed.plants], ['#ed-prop', ed.prop], ['#ed-scat', ed.scatter]]) { const x = $(id); if (x && x.value !== v) x.value = v; }
    ctx.onTool?.(ed.tool);
    panel.querySelectorAll('.ed-opt').forEach((r) => (r.style.display = r.dataset.for.split(' ').includes(ed.tool) ? '' : 'none'));
    $('#ed-size-v').textContent = `${ed.size} m`;
    $('#ed-hint').textContent = TOOLS.find((t) => t[0] === ed.tool)[3];
    $('#ed-undo').disabled = !ed.undo.length; $('#ed-redo').disabled = !ed.redo.length;
    // hide the panel when nothing in it applies to this tool
    const rows = [...panel.querySelectorAll('.ed-row')].filter((r) => !r.classList.contains('ed-file') && r.id !== 'ed-selrow' && r.style.display !== 'none' && r.children.length);
    panel.classList.toggle('empty', !rows.length);
  };
  panel.querySelectorAll('[data-tool]').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  $('#ed-size').oninput = (e) => { ed.size = +e.target.value; syncUI(); };
  $('#ed-str').oninput = (e) => { ed.strength = +e.target.value; };
  $('#ed-paint').onchange = (e) => { ed.paint = e.target.value; };
  document.querySelectorAll('#ed-pmode button').forEach((b) => (b.onclick = () => { api?.cancelTool?.(); ed.paintMode = b.dataset.m; document.querySelectorAll('#ed-pmode button').forEach((x) => x.classList.toggle('on', x === b)); ring.visible = ed.on && brushOn(); syncUI(); }));
  document.querySelectorAll('#ed-pedge button').forEach((b) => (b.onclick = () => { ed.paintEdge = b.dataset.e; document.querySelectorAll('#ed-pedge button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#ed-plants').onchange = (e) => { ed.plants = e.target.value; };
  $('#ed-prop').onchange = (e) => { ed.prop = e.target.value; syncUI(); };
  $('#ed-scat').onchange = (e) => { ed.scatter = e.target.value; };
  $('#ed-undo').onclick = () => undo();
  $('#ed-redo').onclick = () => redo();
  const suggest = () => { $('#nm-name').value = townName(Math.random().toString(36).slice(2, 9)); };
  $('#ed-new').onclick = () => { $('#nm-seed').value = Math.random().toString(36).slice(2, 8); suggest(); newDlg.classList.add('open'); };
  $('#nm-rename').onclick = suggest;
  $('#nm-x').onclick = () => newDlg.classList.remove('open');
  $('#nm-reseed').onclick = () => { $('#nm-seed').value = Math.random().toString(36).slice(2, 8); };
  $('#nm-go').onclick = () => {
    const spec = newMapSpec({
      name: $('#nm-name').value.trim() || 'New place', w: +$('#nm-w').value, d: +$('#nm-d').value, biome: $('#nm-biome').value,
      relief: +$('#nm-relief').value, hills: +$('#nm-hills').value, mesas: +$('#nm-mesas').value, arroyo: +$('#nm-arroyo').value,
      coast: $('#nm-coast').value, veg: +$('#nm-veg').value, seed: $('#nm-seed').value || 'map',
    });
    newDlg.classList.remove('open');
    ed.undo = []; ed.redo = [];
    ctx.addPlace(spec);
    setOn(true);
  };

  function setTool(t) { if (t !== 'select' && state.selected) ctx.select(null); ed.tool = t; ed.stroke = null; api?.cancelTool?.(); syncUI(); ring.visible = ed.on && brushOn(); } // a new tool closes the inspector
  function setOn(on) {
    if (on) window.mapgenWalkOff?.(); // no walking in Build mode
    ed.on = on;
    if (!on) api?.exitPlot?.();
    state.building = on;
    btn.classList.toggle('on', on);
    panel.classList.toggle('open', on);
    if (ed.top) ed.top.style.display = on ? '' : 'none';
    // left button belongs to the tools; orbit with the middle button, pan with the right
    stage.controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    ring.visible = on && brushOn();
    ed.menu?.show(on);
    if (!on) api?.cancelTool?.();
    ed.worldChanged?.();
    const help = $('#help');
    if (help) { help.dataset.view ||= help.textContent; help.textContent = on ? 'B build mode · middle-drag orbit · right-drag pan · wheel zoom · [ ] brush size · Ctrl+Z / Ctrl+Shift+Z undo / redo · F free cam' : help.dataset.view; }
    syncUI();
  }

  // ---------------------------------------------------------------- brush ring
  const ring = liveLoop(stage.scene, 64, lineStyle(HI.green, 2.5), 999), ringPos = new Float32Array(65 * 3);
  const T = () => state.world.terrain;
  function placeRing(p) {
    const a = ringPos;
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2, x = p.x + Math.cos(t) * ed.size, z = p.z + Math.sin(t) * ed.size;
      a[i * 3] = x; a[i * 3 + 1] = T().height(x, z) + 0.12; a[i * 3 + 2] = z;
    }
    ring.set(a);
  }

  // ---------------------------------------------------------------- ground picking (ray march the height field)
  const ray = new THREE.Raycaster();
  function groundAt(cx, cy) {
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), stage.camera);
    const { origin: o, direction: d } = ray.ray, t = T();
    if (d.y > -1e-4) return null;
    const top = t.maxH + 30;
    let s = (o.y - top) / -d.y;
    if (s < 0) s = 0;
    const step = 0.6;
    let prev = s;
    for (let k = 0; k < 4000; k++, s += step) {
      const x = o.x + d.x * s, z = o.z + d.z * s, y = o.y + d.y * s;
      if (y < t.minH - 40) return null;
      if (y <= t.height(x, z)) {
        let a = prev, b = s;
        for (let q = 0; q < 12; q++) { const m = (a + b) / 2; if (o.y + d.y * m <= t.height(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        return { x: o.x + d.x * b, z: o.z + d.z * b };
      }
      prev = s;
    }
    return null;
  }

  // ---------------------------------------------------------------- history + settle
  function pushUndo() { ed.undo.push(structuredClone(state.spec)); if (ed.undo.length > 60) ed.undo.shift(); ed.redo = []; syncUI(); }
  ed.pushUndo = pushUndo;
  function undo() { if (!ed.undo.length) return; ed.redo.push(structuredClone(state.spec)); state.spec = ed.undo.pop(); commit(0); }
  function redo() { if (!ed.redo.length) return; ed.undo.push(structuredClone(state.spec)); state.spec = ed.redo.pop(); commit(0); }
  function commit(delay = 350) {
    ctx.persist();
    syncUI();
    clearTimeout(ed.settleT);
    const s = $('#status'); s.textContent = 'Updating…'; s.classList.add('flash');
    ed.settleT = setTimeout(() => { s.classList.remove('flash'); try { api?.paveWealthy?.(); } catch (e) { console.warn('[pave]', e); } ctx.applyEdit(); }, delay);
  }
  ed.commit = commit;

  // ---------------------------------------------------------------- sculpt
  function deltaObj() {
    const t = T();
    if (!t.delta) {
      const res = 1, nx = Math.ceil(t.W / res) + 1, nz = Math.ceil(t.D / res) + 1;
      t.delta = { res, nx, nz, data: new Float32Array(nx * nz) };
    }
    return t.delta;
  }
  function sculpt(p, dt) {
    const t = T(), D = deltaObj(), R = ed.size, k = ed.strength;
    const gi0 = Math.max(0, Math.floor((p.x - R + t.W / 2) / D.res)), gi1 = Math.min(D.nx - 1, Math.ceil((p.x + R + t.W / 2) / D.res));
    const gj0 = Math.max(0, Math.floor((p.z - R + t.D / 2) / D.res)), gj1 = Math.min(D.nz - 1, Math.ceil((p.z + R + t.D / 2) / D.res));
    if (gi1 < gi0 || gj1 < gj0) return;
    const X = (i) => -t.W / 2 + i * D.res, Z = (j) => -t.D / 2 + j * D.res;
    const bw = gi1 - gi0 + 1, bh = gj1 - gj0 + 1;
    let cur = null;
    if (ed.tool === 'smooth' || ed.tool === 'flatten') {
      cur = new Float32Array(bw * bh);
      for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) cur[(j - gj0) * bw + (i - gi0)] = t.base(X(i), Z(j));
    }
    for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) {
      const dd = Math.hypot(X(i) - p.x, Z(j) - p.z);
      if (dd > R) continue;
      const f = smooth(1 - dd / R), idx = j * D.nx + i;
      if (ed.tool === 'raise') D.data[idx] += f * k * 3 * dt;
      else if (ed.tool === 'lower') D.data[idx] -= f * k * 3 * dt;
      else if (ed.tool === 'flatten') D.data[idx] += (ed.stroke.h0 - cur[(j - gj0) * bw + (i - gi0)]) * f * Math.min(1, k * 8 * dt);
      else if (ed.tool === 'smooth') {
        let a = 0, n = 0;
        for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
          const ii = i - gi0 + r, jj = j - gj0 + q;
          if (ii < 0 || jj < 0 || ii >= bw || jj >= bh) continue;
          a += cur[jj * bw + ii]; n++;
        }
        D.data[idx] += (a / n - cur[(j - gj0) * bw + (i - gi0)]) * f * Math.min(1, k * 6 * dt);
      }
    }
    t.liveUpdate(p.x - R - 1, p.z - R - 1, p.x + R + 1, p.z + R + 1, state.world.group.getObjectByName('terrain'));
  }

  // ---------------------------------------------------------------- paint / plants
  function paintStamp(a, b) {
    const G = GROUND_PAINTS[ed.paint];
    const p = { type: 'path', samples: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], width: ed.size * 1.4, color: G.color, edge: Math.max(0.6, ed.size * 0.3), alpha: G.alpha * (0.4 + 0.6 * ed.strength), ...(G.layer !== undefined ? { layer: G.layer, layerK: 1 } : {}) };
    T().livePaint(p);
  }
  function plantAt(p, n) {
    const veg = (state.spec.vegetation ||= {});
    const plants = (veg.plants ||= []);
    const mix = ed.plants.startsWith('sp:') ? { [ed.plants.slice(3)]: 1 } : ed.plants === 'mix' ? BIOME_MIX[state.spec.biome] || BIOME_MIX.coastal_valley : SETS[ed.plants];
    const rng = new RNG(`${Date.now()}:${p.x}`);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * 6.283, d = Math.sqrt(rng.next()) * ed.size;
      plants.push({ species: rng.weighted(mix), at: [+(p.x + Math.cos(a) * d).toFixed(2), +(p.z + Math.sin(a) * d).toFixed(2)], scale: +rng.range(0.8, 1.2).toFixed(2), rot: Math.round(rng.next() * 360) });
    }
  }
  function scatterAt(p, n) {
    const props = (state.spec.props ||= []), mix = SCATTER_SETS[ed.scatter].mix, rng = new RNG(`${Date.now()}:${p.x}:${p.z}`);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * 6.283, d = Math.sqrt(rng.next()) * ed.size;
      const type = rng.weighted(mix);
      props.push({ id: `prop-${Date.now().toString(36)}${i}${Math.floor(rng.next() * 1296).toString(36)}`, type, at: [+(p.x + Math.cos(a) * d).toFixed(2), +(p.z + Math.sin(a) * d).toFixed(2)], rot: Math.round(rng.next() * 360), ...(type === 'crates' || type === 'barrel' || type === 'tires' ? { count: rng.int(1, 4) } : {}), label: false });
    }
  }
  function eraseAt(p) {
    const veg = (state.spec.vegetation ||= {});
    const R = ed.size;
    (veg.erase ||= []).push({ at: [+p.x.toFixed(1), +p.z.toFixed(1)], r: R });
    if (veg.plants) veg.plants = veg.plants.filter((q) => (q.at[0] - p.x) ** 2 + (q.at[1] - p.z) ** 2 > R * R);
    // boulders / rock piles go too: placed ones leave the spec, generated ones are hidden now and skipped on the next build
    const ROCKY = ['rocks', 'outcrop', 'boulder', 'stones'], inR = (x, z) => (x - p.x) ** 2 + (z - p.z) ** 2 <= R * R;
    if (state.spec.props) state.spec.props = state.spec.props.filter((q) => !(ROCKY.includes(q.type) && q.at && inR(q.at[0], q.at[1])));
    for (const g of state.world.group.children) if (g.name && ROCKY.includes(g.name.slice(5)) && g.name.startsWith('prop:') && inR(g.position.x, g.position.z)) g.visible = false;
    // live: hide instances in the circle
    const fl = state.world.group.getObjectByName('flora');
    if (!fl) return;
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of fl.children) {
      let ch = false;
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); v.setFromMatrixPosition(m); if ((v.x - p.x) ** 2 + (v.z - p.z) ** 2 < R * R) { im.setMatrixAt(i, zero); ch = true; } }
      if (ch) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- select / move / rotate / delete
  const LISTS = ['structures', 'props', 'plots', 'areas', 'camps', 'markets', 'fields', 'walls', 'roads', 'retains', 'paint'];
  function findSrc(id) {
    for (const k of LISTS) { const arr = state.spec[k]; if (!arr) continue; const i = arr.findIndex((e) => e.id === id); if (i >= 0) return { k, arr, i, e: arr[i] }; }
    return null;
  }
  // entries written in a local frame (or facing a road) become plain world coordinates once edited
  function toWorldEntry(src) {
    const e = src.e;
    if (e.inPlot || e.plot) e.touched = true; // hand edit: survives rerolls / use changes
    const res = (state.world.spec[src.k] || []).find((x) => x.id === e.id);
    if (e.frame && res) { for (const key of ['at', 'poly', 'path']) if (res[key]) e[key] = structuredClone(res[key]); if (res.rot != null) e.rot = res.rot; delete e.frame; }
    if (e.face != null) {
      const live = (src.k === 'structures' ? state.world.structures : []).find((s) => s.id === e.id);
      e.rot = Math.round((live?.rot ?? res?.rot ?? e.rot ?? 0) * 10) / 10; delete e.face;
    }
    return e;
  }
  function translate(e, dx, dz) {
    if (e.at) e.at = [+(e.at[0] + dx).toFixed(2), +(e.at[1] + dz).toFixed(2)];
    for (const key of ['poly', 'path']) if (e[key]) e[key] = e[key].map(([x, z]) => [+(x + dx).toFixed(2), +(z + dz).toFixed(2)]);
  }
  function centerOf(e) {
    if (e.at) return e.at;
    const P = e.poly || e.path; if (!P) return [0, 0];
    return P.reduce((a, q) => [a[0] + q[0] / P.length, a[1] + q[1] / P.length], [0, 0]);
  }
  // ---------------------------------------------------------------- single plants (placed or natural)
  // A natural plant becomes a placed one when moved or turned (an erase dot hides the original).
  function pickPlant(cx, cy) {
    const fl = state.world.flora; if (!fl) return null;
    const rect = el.getBoundingClientRect(), v = new THREE.Vector3();
    let best = null, bd = 22;
    for (const { sp, e, def } of fl.entries()) {
      if (e[6] !== 'scatter' && e[6] !== 'plant' && e[6] !== 'grove') continue;
      const h = (def?.h || 1) * e[3];
      for (const t of [0.15, 0.55]) {
        v.set(e[0], e[1] + h * t, e[2]);
        const q = stage.project(v); if (q[2] > 1) continue;
        const d = Math.hypot(q[0] + rect.left - cx, q[1] + rect.top - cy);
        if (d < bd) { bd = d; best = { sp, e, h, r: (def?.r || 0.5) * e[3] }; }
      }
    }
    if (!best) return null;
    const { sp, e } = best, plants = state.spec.vegetation?.plants || [];
    const idx = e[6] === 'plant' ? plants.findIndex((q) => Math.abs(q.at[0] - e[0]) < 0.02 && Math.abs(q.at[1] - e[2]) < 0.02) : -1;
    const id = idx >= 0 ? `plant:p${idx}` : `plant:v${e[0].toFixed(2)},${e[2].toFixed(2)}`;
    state.world.items.set(id, { id, name: sp.replace(/_/g, ' '), type: 'plant', spec: { type: sp, label: false, species: sp, at: [e[0], e[2]], scale: e[3], rot: Math.round((e[4] * 180) / Math.PI), _idx: idx }, object: null, ring: { x: e[0], z: e[2], r: Math.max(0.6, best.r), y: e[1] }, anchor: () => new THREE.Vector3(e[0], e[1] + best.h + 0.4, e[2]) });
    return id;
  }
  function plantEdit(id, op, arg) {
    const it = state.world.items.get(id); if (!it) return false;
    const P = it.spec, veg = (state.spec.vegetation ||= {}), plants = (veg.plants ||= []);
    pushUndo();
    let i = P._idx >= 0 && plants[P._idx] && Math.abs(plants[P._idx].at[0] - P.at[0]) < 0.02 ? P._idx : -1;
    if (i < 0) { // natural plant: hide it, then (unless deleting) re-add it as a placed one
      (veg.erase ||= []).push({ at: [+P.at[0].toFixed(2), +P.at[1].toFixed(2)], r: 0.35 });
      if (op !== 'delete') { plants.push({ species: P.species, at: [+P.at[0].toFixed(2), +P.at[1].toFixed(2)], scale: +P.scale.toFixed(2), rot: P.rot }); i = plants.length - 1; }
    }
    if (op === 'delete') { if (i >= 0) plants.splice(i, 1); ctx.select(null); }
    else if (op === 'move') { plants[i].at = [+(plants[i].at[0] + arg[0]).toFixed(2), +(plants[i].at[1] + arg[1]).toFixed(2)]; ctx.select(null); }
    else if (op === 'rotate') { plants[i].rot = ((plants[i].rot || 0) + arg + 360) % 360; }
    commit(40);
    return true;
  }
  const roadLocked = (id) => state.lockRoads && id && findSrc(id)?.k === 'roads';
  function rotateSel(deg, noUndo) {
    if (roadLocked(state.selected)) return;
    if (state.selected?.startsWith('plant:')) return plantEdit(state.selected, 'rotate', deg);
    const src = state.selected && findSrc(state.selected);
    if (!src) return false;
    if (!noUndo) pushUndo();
    const e = toWorldEntry(src);
    if (e.at) e.rot = (((e.rot || 0) + deg) % 360 + 360) % 360;
    else {
      const [cx, cz] = centerOf(e), r = (deg * Math.PI) / 180;
      for (const key of ['poly', 'path']) if (e[key]) e[key] = e[key].map(([x, z]) => { const [a, b] = toWorld(x - cx, z - cz, r); return [+(cx + a).toFixed(2), +(cz + b).toFixed(2)]; });
    }
    // live preview: spin the object about its centre
    const it = state.world.items.get(state.selected);
    if (it?.object) {
      const [cx, cz] = centerOf(e), o = it.object, a = (deg * Math.PI) / 180;
      const px = o.position.x - cx, pz = o.position.z - cz;
      const [rx, rz] = toWorld(px, pz, a);
      o.position.x = cx + rx; o.position.z = cz + rz; o.rotation.y += a;
    }
    commit();
    return true;
  }
  function deleteSel() {
    if (roadLocked(state.selected)) return true;
    if (api?.gateSel) { document.querySelector('#ed-gdel')?.click(); return true; }
    if (state.selected?.startsWith('plant:')) return plantEdit(state.selected, 'delete');
    const src = state.selected && findSrc(state.selected);
    if (!src) return false;
    pushUndo();
    src.arr.splice(src.i, 1);
    if (src.k === 'plots' && src.e.building) { const i = (state.spec.structures || []).findIndex((s) => s.id === src.e.building); if (i >= 0) state.spec.structures.splice(i, 1); }
    if (src.k === 'plots') { api.plotBake?.clearPlot(src.e); if (api.plotEdit === src.e.id) api.exitPlot(); }
    if (src.k === 'structures' || src.k === 'plots') api.rowParty?.();
    const it = state.world.items.get(state.selected);
    if (it?.object) it.object.visible = false;
    ctx.select(null);
    commit();
    return true;
  }

  // ---------------------------------------------------------------- pointer
  const el = stage.renderer.domElement;
  let last = null, lastT = 0;
  el.addEventListener('pointerdown', (e) => {
    if (!ed.on || e.button !== 0 || stage.free) return;
    const p = groundAt(e.clientX, e.clientY);
    if (ed.tool === 'select') {
      const hi = api.hitHandle(e.clientX, e.clientY);
      if (hi >= 0) {
        if (e.shiftKey && api.handleEdit.split(hi)) return;
        ed.hdrag = { i: hi, moved: false }; el.setPointerCapture(e.pointerId); return;
      }
      if (api.plotEdit && p && !api.inPlotEdit(p)) return; // editing a plot: outside is off limits
      if (e.shiftKey && p && !api.plotEdit && api.plotAt) { const pl = api.plotAt(p); if (pl) { api.multiToggle(pl.id); return; } }
      else if (!e.shiftKey) api.multiClear?.();
      let id = stage.pick(e.clientX, e.clientY);
      if (!id) id = pickPlant(e.clientX, e.clientY);
      if (!id && p) id = api.pickExtra(p);
      if (id && /:use$/.test(id)) id = id.replace(/:use$/, '');
      if (roadLocked(id)) id = null; // locked roads: clicks go through them
      if (api.plotEdit && id && !id.startsWith('plant:')) { // only what's in the plot
        const s0 = findSrc(id), c = s0 && centerOf(s0.e);
        if (!s0 || s0.k === 'plots' || (s0.e.inPlot !== api.plotEdit && s0.e.plot !== api.plotEdit && !(c && api.inPlotEdit({ x: c[0], z: c[1] }, 0.5)))) id = null;
      }
      if (id !== state.selected) ctx.select(id);
      const it = id && state.world.items.get(id);
      if (id && id.startsWith('plant:') && p) { ed.drag = { id, start: p, obj: null, moved: false, plant: true }; el.setPointerCapture(e.pointerId); return; }
      if (id && findSrc(id) && p) { ed.drag = { id, start: p, obj: it?.object || null, pos0: it?.object?.position.clone(), moved: false }; el.setPointerCapture(e.pointerId); }
      return;
    }
    if (p && ed.tool !== 'road' && T().outside(p.x, p.z) > 0) { ctx.flash('That\'s past the map edge — nothing is built out there'); return; }
    if (X()) { if (p) { if (ed.tool === 'plot' || ed.tool === 'road') el.setPointerCapture(e.pointerId); X().down(p, e); } return; }
    if (!p) return;
    el.setPointerCapture(e.pointerId);
    if (ed.tool === 'prop') {
      pushUndo();
      const sn = api.propSnaps?.(ed.prop) ? api.snapEdge(p) : null, at = sn ? [sn.x, sn.z] : [p.x, p.z];
      const np = { id: `prop-${Date.now().toString(36)}`, type: ed.prop, at: [+at[0].toFixed(2), +at[1].toFixed(2)], rot: sn ? Math.round(sn.rot + ed.propRot) % 360 : ed.propRot, name: ed.prop.replace(/_/g, ' '), label: false };
      (state.spec.props ||= []).push(np);
      if (WATER && ed.prop === 'spring') { // the spring's overflow runs off downhill as a stream
        const path = traceStream(T(), at[0], at[1], { seed: np.id });
        if (path.length >= 3) {
          const d = [path[1][0] - path[0][0], path[1][1] - path[0][1]];
          np.rot = Math.round(((Math.atan2(d[0], d[1]) * 180) / Math.PI + 360) % 360);
          (state.spec.walls ||= []).push({ id: `wall-${Date.now().toString(36)}s`, type: 'stream', path, width: 1.1, condition: 0.8, gates: [], src: np.id });
        }
      }
      commit(150);
      return;
    }
    pushUndo();
    ed.stroke = { last: p, h0: T().base(p.x, p.z), acc: 0, n: 0 };
    if (ed.tool === 'paint') { ed.stroke.path = [[+p.x.toFixed(2), +p.z.toFixed(2)]]; paintStamp(p, { x: p.x + 0.01, z: p.z }); }
    if (ed.tool === 'plant') plantAt(p, Math.max(1, Math.round(ed.size * ed.size * 0.04 * ed.strength)));
    if (ed.tool === 'erase') eraseAt(p);
    if (ed.tool === 'scatter') scatterAt(p, Math.max(2, Math.round(ed.size * ed.size * 0.1 * ed.strength)));
    lastT = performance.now();
  });
  el.addEventListener('pointermove', (e) => {
    if (!ed.on || stage.free) return;
    const p = groundAt(e.clientX, e.clientY);
    last = p; if (p) api.lastP = p;
    if (p && brushOn()) placeRing(p);
    if (p && ed.tool === 'prop') api.previewSnap?.(p);
    api.shift = e.shiftKey;
    if (ed.hdrag && p) { ed.hdrag.moved = true; api.handleEdit.move(ed.hdrag.i, p); return; }
    if (X()?.move && p) { X().move(p, e); return; }
    if (ed.drag && p) {
      const dx = p.x - ed.drag.start.x, dz = p.z - ed.drag.start.z;
      if (Math.hypot(dx, dz) > 0.3) ed.drag.moved = true;
      if (ed.drag.obj) ed.drag.obj.position.set(ed.drag.pos0.x + dx, ed.drag.pos0.y + (T().height(p.x, p.z) - T().height(ed.drag.start.x, ed.drag.start.z)), ed.drag.pos0.z + dz);
      ed.drag.d = [dx, dz];
      if (ed.drag.moved && !ed.drag.hid) { stage.clearSelection(); ed.drag.hid = true; }
      return;
    }
    if (!ed.stroke || !p) return;
    const s = ed.stroke, step = Math.hypot(p.x - s.last.x, p.z - s.last.z);
    if (ed.tool === 'paint' && step > Math.max(0.5, ed.size * 0.25)) { paintStamp(s.last, p); s.path.push([+p.x.toFixed(2), +p.z.toFixed(2)]); s.last = p; }
    if (ed.tool === 'plant' && step > ed.size * 0.8) { plantAt(p, Math.max(1, Math.round(ed.size * ed.size * 0.04 * ed.strength))); s.last = p; }
    if (ed.tool === 'erase' && step > ed.size * 0.4) { eraseAt(p); s.last = p; }
    if (ed.tool === 'scatter' && step > ed.size * 1.2) { scatterAt(p, Math.max(2, Math.round(ed.size * ed.size * 0.1 * ed.strength))); s.last = p; }
  });
  const end = () => {
    if (ed.hdrag) { const h = ed.hdrag; ed.hdrag = null; if (h.moved) api.handleEdit.commit(h.i); return; }
    if (ed.drag?.plant) {
      const d = ed.drag; ed.drag = null;
      if (d.moved && d.d) plantEdit(d.id, 'move', d.d);
      return;
    }
    if (ed.drag) {
      const d = ed.drag; ed.drag = null;
      if (d.moved && d.d) {
        pushUndo();
        const src = findSrc(d.id);
        if (src) {
          translate(toWorldEntry(src), d.d[0], d.d[1]);
          // a plot carries its building along
          if (src.k === 'plots') for (const k of ['structures', 'props', 'walls', 'fields']) for (const x of state.spec[k] || []) if (x.plot === d.id || x.inPlot === d.id) translate(x, d.d[0], d.d[1]);
          if (src.k === 'roads') api.refitRoad(src.e);
          commit();
        }
      }
      return;
    }
    if (X()?.up) { X().up(last); return; }
    if (!ed.stroke) return;
    const s = ed.stroke; ed.stroke = null;
    if (SCULPT.has(ed.tool)) { const t = (state.spec.terrain ||= {}); t.delta = encodeDelta(deltaObj()); commit(); }
    else if (ed.tool === 'paint') {
      const G = GROUND_PAINTS[ed.paint];
      if (s.path.length === 1) s.path.push([s.path[0][0] + 0.01, s.path[0][1]]);
      (state.spec.paint ||= []).push({ path: s.path, width: +(ed.size * 1.4).toFixed(2), color: G.color, edge: +Math.max(0.6, ed.size * 0.3).toFixed(2), alpha: +(G.alpha * (0.4 + 0.6 * ed.strength)).toFixed(2), ...(G.layer !== undefined ? { layer: G.layer, layerK: 1 } : {}) });
      commit(200);
    } else commit();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // sculpt runs every frame while the button is held
  stage.onFrame.push((dt) => {
    if (!ed.on || !ed.stroke || !SCULPT.has(ed.tool) || !last) return;
    const now = performance.now(), d = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    sculpt(last, d);
    placeRing(last);
  });

  // ---------------------------------------------------------------- keys (before the viewer's own)
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (document.body.classList.contains('hud') || document.body.classList.contains('setopen')) return; // menus open: keys go to them
    if (isKey(e, 'build')) { setOn(!ed.on); e.preventDefault(); e.stopPropagation(); return; }
    if (!ed.on && /^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { setOn(true); ed.menu?.pickTab(+e.key); e.preventDefault(); e.stopPropagation(); return; } // a number in Explore: straight into Build
    if (!ed.on) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    let used = true;
    if (mod && (k === 'z' || k === 'Z')) e.shiftKey ? redo() : undo();
    else if (mod && (k === 'y' || k === 'Y')) redo();
    else if (k === 'Delete' || k === 'Backspace') { const hi = ed.lastClient ? api.hitHandle(...ed.lastClient) : -1; if (hi >= 0) api.handleEdit.remove(hi); else deleteSel(); } // over a point of the selected road / wall / field: that point
    else if (k === 'r' || k === 'R') { if (!e.repeat) { ed.rHeld = { wheeled: false, shift: e.shiftKey }; } }
    else if (k === '[') { ed.size = Math.max(1, ed.size - 1); syncUI(); if (last) placeRing(last); }
    else if (k === ']') { ed.size = Math.min(40, ed.size + 1); syncUI(); if (last) placeRing(last); }
    else if (k === 'v' || k === 'V') setTool('select');
    else if (/^[0-9]$/.test(k) && !mod) ed.menu?.pickTab(+k); // number keys: the dock's tabs (1 roads, 2 zones, 3 buildings…, 0 recent)
    else if (mod && (k === 's' || k === 'S')) saveFile();
    else if (k === 'Enter' && X()?.finish) X().finish();
    else if (k === 'Escape' && api.hasChain()) api.cancelTool();
    else if (!mod && TOOLS.some((t) => isNaN(+t[2]) && t[2] !== 'V' && t[2] === k.toUpperCase())) setTool(TOOLS.find((t) => t[2] === k.toUpperCase())[0]);
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // R: tap = turn 15° (Shift: back); hold R + mouse wheel = turn freely (Shift: fine)
  const ROT_TOOLS = new Set(['prop', 'building']);
  const turn = (deg, noUndo) => {
    if (ROT_TOOLS.has(ed.tool)) { ed.propRot = ((ed.propRot + deg) % 360 + 360) % 360; if (last) { X()?.move?.(last, {}); if (ed.tool === 'prop') api.previewSnap?.(last); } return true; }
    return rotateSel(deg, noUndo);
  };
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'r' || e.key === 'R') && ed.rHeld) { const h = ed.rHeld; ed.rHeld = null; if (ed.on && !h.wheeled && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) turn(h.shift ? -15 : 15); }
  });
  window.addEventListener('blur', () => { ed.rHeld = null; });
  window.addEventListener('wheel', (e) => {
    if (!ed.on || !ed.rHeld) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const first = !ed.rHeld.wheeled;
    if (first && !ROT_TOOLS.has(ed.tool) && state.selected) pushUndo();
    ed.rHeld.wheeled = true;
    const raw = Math.max(-12, Math.min(12, (e.deltaY || e.deltaX) * 0.12));
    const deg = e.shiftKey ? Math.sign(raw) : Math.round(raw) || Math.sign(raw) * 2;
    if (deg) turn(deg, true);
  }, { capture: true, passive: false });

  ed.setOn = setOn; ed.setTool = setTool; ed.groundAt = groundAt; ed.deleteSel = deleteSel; ed.rotateSel = rotateSel;
  api = { state, stage, ed, $, groundAt, pushUndo, commit, findSrc, GROUND_PAINTS, flash: ctx.flash, select: (id) => ctx.select(id), onWorld: [], shift: false };
  ed.api = api;
  initBuildTools(api);
  // the file / undo controls and road lock live in the top bar (Build mode only); the side panel only shows up when the
  // current tool has options
  {
    const top = document.createElement('span'); top.id = 'ed-top'; top.style.display = 'none';
    const lk = $('#ed-lockroads')?.closest('label');
    for (const el of [$('#ed-undo'), $('#ed-redo'), $('#ed-new'), $('#ed-save'), $('#ed-open')?.closest('label'), $('#ed-restore'), lk, $('#ed-saved')]) if (el) top.appendChild(el);
    btn.after(top);
    ed.top = top;
  }
  const menu = initBuildMenu({ stage, ed, $ });
  ctx.onTool = (t) => menu.toolChanged(t);
  ed.menu = menu;
  // a build-menu tile picks a tool and its options
  ed.choose = (item) => {
    const a = item.act || {};
    if (a.ed) Object.assign(ed, a.ed);
    if (a.tool === 'building') Object.assign(ed.opts, { bl: '', brt: '', bc: '', bo: '' }); // a building tile is a clean pick
    if (a.opts) Object.assign(ed.opts, a.opts);
    setTool(a.tool || 'select');
    if (!ed.on) setOn(true);
  };
  // ---------------------------------------------------------------- files + backups
  const BK = () => `baja-mapgen:backup:${state.key}`;
  const stamp = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const showSaved = () => {
    let b = null; try { b = JSON.parse(localStorage.getItem(BK()) || 'null'); } catch {}
    $('#ed-saved').textContent = [ed.savedAt ? `saved to file ${stamp(ed.savedAt)}` : 'not saved to a file yet', b ? `backup ${stamp(b.t)}` : null].filter(Boolean).join(' · ');
  };
  function saveFile() {
    const blob = new Blob([JSON.stringify(state.spec, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${String(state.spec.name || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ed.savedAt = Date.now(); showSaved(); ctx.flash('Saved ' + a.download);
  }
  $('#ed-save').onclick = saveFile;
  $('#ed-open').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const spec = JSON.parse(await f.text());
      if (!spec || !spec.size) throw new Error('not a map file');
      ctx.addPlace(spec); ed.savedAt = Date.now(); showSaved(); ctx.flash('Opened ' + f.name);
    } catch (err) { ctx.flash('Open failed: ' + err.message); }
  };
  $('#ed-restore').onclick = () => {
    let b = null; try { b = JSON.parse(localStorage.getItem(BK()) || 'null'); } catch {}
    if (!b) { ctx.flash('No backup for this map yet'); return; }
    if (!confirm(`Restore the backup from ${stamp(b.t)}? Current changes can be undone.`)) return;
    pushUndo(); state.spec = b.spec; commit(0);
  };
  let lastBackup = '';
  setInterval(() => {
    if (!ed.on || !state.spec) return;
    const j = JSON.stringify(state.spec);
    if (j === lastBackup) return;
    // only this map keeps a backup: other maps' old ones go (they'd crowd out the autosave)
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('baja-mapgen:backup:') && k !== BK()) localStorage.removeItem(k); }
    try { localStorage.setItem(BK(), JSON.stringify({ t: Date.now(), spec: state.spec })); lastBackup = j; showSaved(); }
    catch { ctx.flash('Backup failed: browser storage is full — use Save'); }
  }, 120000);
  api.onWorld.push(showSaved);
  ed.onSelect = (it) => api.onSelect?.(it);
  ed.worldChanged = () => api.onWorld.forEach((f) => f());
  // double-click: add a point to the selected road / wall / field, or finish a road / wall / field in progress
  el.addEventListener('dblclick', (e) => {
    if (!ed.on || stage.free) return;
    if (api.hasChain()) { X()?.finish?.(); return; }
    const p = groundAt(e.clientX, e.clientY);
    if (ed.tool !== 'select' || !p) return;
    if (api.plotEdit && !api.inPlotEdit(p)) { api.exitPlot(); return; }
    if (api.handleEdit.insert(p) || api.plotEdit) return;
    const pl = (state.spec.plots || []).find((q) => pointInPoly(p.x, p.z, q.poly));
    if (pl) api.enterPlot(pl.id);
  });
  // right click is always safe: while drawing it takes back the last point (the first one: cancels); it never builds or deletes (a right-drag pans)
  let rDown = null;
  el.addEventListener('pointerdown', (e) => { if (e.button === 2) rDown = [e.clientX, e.clientY]; }, true);
  el.addEventListener('pointermove', (e) => { ed.lastClient = [e.clientX, e.clientY]; });
  el.addEventListener('contextmenu', (e) => {
    if (!ed.on) return;
    e.preventDefault();
    const moved = rDown && Math.hypot(e.clientX - rDown[0], e.clientY - rDown[1]) > 5; rDown = null;
    if (!moved && api.hasChain()) (api.popPoint || api.cancelTool)();
  });
  window.addEventListener('keyup', (e) => { if (api) api.shift = e.shiftKey; });
  syncUI();
  return ed;
}

// ---------------------------------------------------------------- terrain generator
// which way the sierra lies (compass bearing) per biome; the coast is opposite. All Pacific slope for now.
export const ORIENT = { coastal_valley: { sierra: 90 }, coastal_desert: { sierra: 90 }, valley: { sierra: 90 }, scrubland: { sierra: 90 }, desert: { sierra: 90 }, sierra: { sierra: 90 } };
export function newMapSpec(o) {
  const rng = new RNG(`newmap:${o.seed}`);
  const W = Math.max(60, Math.min(1000, o.w || 600)), D = Math.max(60, Math.min(1000, o.d || 500));
  const features = [];
  const inside = (m = 0.4) => [rng.range(-W * m, W * m), rng.range(-D * m, D * m)];
  for (let i = 0; i < (o.hills || 0); i++) features.push({ type: 'hill', at: inside(0.45), radius: rng.range(25, 80) * Math.min(1.5, Math.max(W, D) / 300), height: rng.range(2, 9) * Math.max(0.4, o.relief) });
  for (let i = 0; i < (o.mesas || 0); i++) features.push({ type: 'mesa', at: inside(0.42), radius: rng.range(18, 40), height: rng.range(7, 15) });
  // orientation (Pacific slope): the sierra east, the coast west. The ground falls toward the coast and every
  // arroyo runs from the sierra side to the coast side.
  const sierra = ORIENT[o.biome]?.sierra ?? 90, sa = (sierra * Math.PI) / 180;
  const S = [Math.sin(sa), -Math.cos(sa)], C = [Math.cos(sa), Math.sin(sa)]; // toward the sierra; across the slope
  const along = Math.abs(S[0]) > 0.5 ? W : D, across = Math.abs(S[0]) > 0.5 ? D : W;
  const P = (t, c) => [+(S[0] * t + C[0] * c).toFixed(1), +(S[1] * t + C[1] * c).toFixed(1)];
  const per = +o.arroyo || 0;
  if (per > 0) {
    let n = 0; for (let k = 0; k < Math.max(1, Math.round(across / 100)); k++) if (rng.chance(per)) n++;
    const lanes = []; // starting offsets across the map, spread out
    if (o.arroyoN) n = Math.min(Math.max(n, 1), o.arroyoN);
    for (let i = 0; i < n; i++) { const c = -across / 2 + ((i + rng.range(0.2, 0.8)) * across) / n; if (lanes.every((q) => Math.abs(q - c) > 25)) lanes.push(c); }
    const course = (c0, t0, t1, wander) => { // a wandering line from t0 (sierra side) down to t1
      const pts = []; let c = c0, v = 0;
      const step = Math.max(14, along / 14);
      for (let t = t0; t > t1 - 1e-6; t -= step) { pts.push([t, c]); v = v * 0.6 + rng.range(-1, 1) * step * wander; c = Math.max(-across / 2 + 6, Math.min(across / 2 - 6, c + v)); }
      if (pts[pts.length - 1][0] > t1) pts.push([t1, c]);
      return pts;
    };
    for (const c0 of lanes) {
      const size = o.arroyoSize || rng.weighted(across >= 160 ? { small: 5, medium: 3, big: 1.2 } : { small: 5, medium: 3 });
      const dims = { small: [rng.range(3, 5), rng.range(0.5, 1.0)], medium: [rng.range(7, 12), rng.range(1.3, 2.4)], big: [rng.range(20, 34), rng.range(1.5, 2.3)] }[size];
      const main = course(c0, along / 2, -along / 2, size === 'big' ? 0.18 : 0.3);
      features.push({ type: 'arroyo', path: main.map(([t, c]) => P(t, c)), width: +dims[0].toFixed(1), depth: +dims[1].toFixed(2), ...(size === 'big' ? { braided: true } : {}) });
      // a side wash from the sierra joining it on the way down
      if (size !== 'small' && !o.arroyoN && rng.chance(0.45)) {
        const j = main[Math.min(main.length - 2, Math.max(1, Math.floor(main.length * rng.range(0.3, 0.6))))];
        const off = (rng.chance(0.5) ? 1 : -1) * rng.range(30, 70), c1 = Math.max(-across / 2 + 8, Math.min(across / 2 - 8, c0 + off));
        const trib = course(c1, along / 2, j[0] + 6, 0.2).map(([t, c], i, a) => [t, c + (j[1] - c1) * (i / Math.max(1, a.length - 1)) ** 1.5]);
        trib.push(j);
        const sm = size === 'big' && rng.chance(0.5);
        features.push({ type: 'arroyo', path: trib.map(([t, c]) => P(t, c)), width: +(sm ? rng.range(7, 10) : rng.range(3, 5)).toFixed(1), depth: +(sm ? rng.range(1.2, 1.8) : rng.range(0.5, 0.9)).toFixed(2) });
      }
    }
  }
  features.push({ type: 'tilt', dir: sierra, amount: +rng.range(0.4, 1.1).toFixed(2) });
  let water = null;
  if (o.coast === 'on') {
    const dir = (sierra + 180) % 360, half = along / 2;
    features.push({ type: 'coast', dir, at: Math.round(half * 0.55), depth: 8, fall: 30, wiggle: 18 });
    water = { level: -4.5 };
  }
  return {
    name: o.name, seed: o.seed, size: [W, D], biome: o.biome || 'coastal_valley', builder: true, orient: { sierra },
    description: 'Built with the map builder.',
    terrain: { relief: +(1.2 * o.relief).toFixed(2), scale: Math.round(rng.range(90, 160)), cell: +Math.max(1.4, Math.max(W, D) / 300).toFixed(2), features },
    ...(water ? { water } : {}),
    vegetation: { density: o.veg ?? 0.35 },
    structures: [], props: [], roads: [], walls: [], fields: [], paint: [],
    view: { target: [0, 0], zoom: 1, az: -32 },
  };
}

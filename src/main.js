// BAJA MAPGEN — app shell: place library, stat block panel, chat handoff, controls.
import * as THREE from 'three';
import { initAudio } from './audio.js';
import { Stage } from './scene.js';
import { World } from './world.js';
import { ORIGINS } from './buildings.js';
import { describeFinish } from './finishes.js';
import { loadModels } from './models.js';
import { PRESETS, WEATHER, TOD_KEYS, presetHour } from './presets.js';
import { initEditor, newMapSpec } from './editor.js';
import { TERRAIN_LOOK } from './terrain.js';
import { U } from './materials.js';
import { isKey } from './keys.js';
import { initUI } from './ui.js';
import { initTutorial } from './tutorial.js';
import { USE_LABELS } from './uses.js';
const BUILTIN = {}; // no bundled places: maps live as files in saves/ and are opened with Open / Load

const $ = (s) => document.querySelector(s);
const LS_KEY = 'baja-mapgen:v1';
const store = {
  load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } },
  // the map being worked on always wins: when the browser's storage is full, older maps kept aside (archive) are
  // dropped, oldest first, until it fits
  save(d) {
    const put = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); return true; } catch { return false; } };
    if (put()) return true;
    // 1) other maps' 2-minute backups, 2) older kept maps, 3) this map's own backup (the autosave is newer anyway)
    const cur = `baja-mapgen:backup:${d.last || ''}`;
    const bks = () => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('baja-mapgen:backup:')) o.push(k); } return o; };
    for (const k of bks().filter((k) => k !== cur)) { localStorage.removeItem(k); if (put()) return true; }
    const A = d.archive || {};
    for (const k of Object.keys(A)) { delete A[k]; if (put()) { setTimeout(() => flash('Browser storage was full: dropped older kept maps'), 0); return true; } }
    localStorage.removeItem(cur); if (put()) return true;
    setTimeout(() => flash('Browser storage is full — use Save to keep this map'), 0); return false;
  },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const slug = (s) => String(s || 'place').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const state = { key: null, spec: null, world: null, selected: null, labels: false, saved: store.load() };
const stage = new Stage($('#view'));

// ---------------------------------------------------------------- library
function library() {
  const lib = {};
  for (const [k, s] of Object.entries(BUILTIN)) lib[k] = { spec: s, builtin: true };
  for (const [k, s] of Object.entries(state.saved.places || {})) lib[k] = { spec: s, builtin: !!BUILTIN[k], modified: !!BUILTIN[k] };
  return lib;
}
function refreshPlaceList() {
  const sel = $('#place'); if (!sel) return;
  sel.innerHTML = '';
  for (const [k, v] of Object.entries(library())) {
    const o = document.createElement('option');
    o.value = k; o.textContent = (v.spec.name || k) + (v.modified ? ' *' : '');
    sel.appendChild(o);
  }
  sel.value = state.key;
}
function persist() {
  state.saved.places ||= {};
  state.saved.places[state.key] = state.spec;
  state.saved.last = state.key;
  store.save(state.saved);
  refreshPlaceList();
}

// ---------------------------------------------------------------- world
// generated plot props from older saves have no id: give them one so they can be picked and moved
function ensureIds(sp) { (sp.props || []).forEach((p, i) => { if (p.inPlot && !p.id) p.id = `${p.inPlot}-y${i}`; }); }
function generate(keepView = false) {
  const t0 = performance.now();
  ensureIds(state.spec);
  const world = new World(clone(state.spec));
  world.generate();
  state.world = world;
  const t1 = performance.now();
  console.log('[gen]', Math.round(t1 - t0), 'ms', 'terrain nodes', world.terrain.xs.length * world.terrain.zs.length);
  stage.setOrient(state.spec.orient?.sierra ?? 90);
  stage.setWorld(world, keepView);
  $('#title').textContent = state.spec.name || 'Unnamed place';
  $('#subtitle').textContent = [state.spec.region, state.spec.biome?.replace(/_/g, ' '), `${state.spec.size?.[0] || 240}×${state.spec.size?.[1] || 240} m`, state.spec.mode && `mode: ${state.spec.mode.replace(/_/g, ' ')}`].filter(Boolean).join(' · ');
  $('#desc').textContent = state.spec.description || '';
  $('#seed').value = state.spec.seed ?? '';
  $('#wear').value = state.spec.wear ?? 1; $('#wear-v').textContent = String(state.spec.wear ?? 1);
  $('#life').value = state.spec.activity ?? 1; $('#life-v').textContent = String(state.spec.activity ?? 1);
  buildLabels();
  select(state.selected && world.items.has(state.selected) ? state.selected : null);
  window.mapgenEditor?.worldChanged?.();
  $('#status').textContent = `generated ${Math.round(t1 - t0)} ms · baked ${Math.round(performance.now() - t1)} ms · ${world.items.size} selectable`;
}
stage.onFrame.push((dt) => state.world?.update(dt));
// editor: apply the spec to the live world in place where possible (else rebuild everything)
function applyEdit() {
  const t0 = performance.now();
  ensureIds(state.spec);
  const r = state.world.applyDiff(clone(state.spec));
  if (!r) { generate(true); return 'full'; }
  const t1 = performance.now();
  if (r.box) stage.refreshRegion(r.box);
  buildLabels();
  select(state.selected && state.world.items.has(state.selected) ? state.selected : null);
  window.mapgenEditor?.worldChanged?.();
  $('#status').textContent = `updated in place · ${Math.round(t1 - t0)} ms + light ${Math.round(performance.now() - t1)} ms · ${state.world.items.size} selectable`;
  return 'region';
}

function loadPlace(key) {
  const lib = library();
  if (!lib[key]) key = Object.keys(lib)[0];
  state.key = key;
  state.spec = clone(lib[key].spec);
  state.selected = null;
  refreshPlaceList();
  if (editor) { editor.undo = []; editor.redo = []; }
  generate(false);
  if (editor) editor.setOn(!!editor.on); // Build mode is off until you press Build (B); loading a map keeps the current mode
}
// the browser keeps only the map being worked on (autosave); everything else is a file in saves/
function addPlace(spec) {
  const key = slug(spec.name);
  archiveOld(key);
  state.saved.places = { [key]: spec };
  state.saved.last = key; // a reload comes back to this map
  store.save(state.saved);
  loadPlace(key);
}
// maps kept in the browser from before (when there was a place list): moved aside, downloadable from Load
function archiveOld(keep) {
  const P = state.saved.places || {};
  for (const [k, sp] of Object.entries(P)) if (k !== keep) { (state.saved.archive ||= {})[k] = sp; delete P[k]; }
}
function blankMap() {
  return { name: 'New map', seed: Math.random().toString(36).slice(2, 8), size: [600, 500], biome: 'coastal_valley', builder: true, terrain: { relief: 0.3, scale: 80, cell: 2.0, features: [] }, vegetation: { density: 0.2 }, structures: [], props: [], roads: [], walls: [], fields: [], paint: [], view: { target: [0, 0], zoom: 1.4, az: -32 } };
}

// ---------------------------------------------------------------- labels
let labelEls = [];
function buildLabels() {
  for (const e of labelEls) e.el.remove();
  labelEls = [];
  const taken = new Set([...state.world.items.values()].filter((q) => q.type !== 'plot' && q.name).map((q) => q.name)); // a plot named after its building: only the building is labelled
  for (const it of state.world.items.values()) {
    if (!it.name || it.spec.label === false || it._o) continue; // parts of a bigger thing (stalls in a market…) stay unlabelled
    if (it.type === 'plot' && taken.has(it.name)) continue;
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = it.name;
    el.onclick = () => select(it.id);
    $('#labels').appendChild(el);
    labelEls.push({ el, it, p: it.anchor() });
  }
}
stage.onFrame.push(() => {
  $('#labels').style.display = state.labels ? '' : 'none';
  if (!state.labels) return;
  for (const l of labelEls) {
    const [x, y, z] = stage.project(l.p);
    l.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    l.el.style.display = z > 1 ? 'none' : '';
    l.el.classList.toggle('sel', l.it.id === state.selected);
  }
});

// ---------------------------------------------------------------- selection + stat block
function select(id) {
  state.selected = id;
  const it = id ? state.world.items.get(id) : null;
  stage.showSelection(it);
  renderPanel(it);
  window.mapgenEditor?.onSelect?.(it);
}

const FIELDS = [['owner', 'Owner'], ['occupants', 'Occupants'], ['condition', 'Condition'], ['gm_notes', 'GM notes']];
const condWord = (c) => (c == null ? null : c >= 0.85 ? 'Good' : c >= 0.7 ? 'Fair — well kept' : c >= 0.5 ? 'Worn' : c >= 0.3 ? 'Poor' : 'Ruinous');
function stockHTML(stock) {
  if (!stock || !stock.length) return '';
  const rows = stock.map((x) => {
    if (typeof x === 'string') return `<tr><td colspan="3">${esc(x)}</td></tr>`;
    return `<tr><td>${esc(String(x.item ?? ''))}${x.qty != null ? ` <span class="dim">×${esc(String(x.qty))}</span>` : ''}${x.notes ? `<div class="dim">${esc(String(x.notes))}</div>` : ''}</td><td class="num">${esc(String(x.price ?? ''))}</td><td class="ref">${esc(String(x.ref ?? ''))}</td></tr>`;
  }).join('');
  return `<details class="stock"><summary>What's in stock <span class="dim">(${stock.length})</span></summary><table>${rows}</table></details>`;
}
function fmt(v) {
  if (v == null || v === '') return '<span class="dim">—</span>';
  if (Array.isArray(v)) return '<ul>' + v.map((x) => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('') + '</ul>';
  if (typeof v === 'object') return '<ul>' + Object.entries(v).map(([k, x]) => `<li><b>${esc(k)}:</b> ${esc(String(x))}</li>`).join('') + '</ul>';
  return esc(String(v));
}
function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function describe(it) {
  const s = it.spec;
  const bits = [];
  if (it.type === 'structure') {
    bits.push(s.kind || 'building');
    bits.push(ORIGINS[s.origin || 'new']);
    if (s.material) bits.push(s.material);
    if (s.floors > 1) bits.push(`${s.floors} floors`);
    if (s.auto) bits.push('auto-placed');
  } else bits.push(String(s.type || (s.use && s.use !== 'building' ? USE_LABELS[s.use] || s.use : '') || it.type || '').replace(/_/g, ' '));
  return bits.join(' · ');
}

function renderPanel(it) {
  const p = $('#panel');
  if (!it) { p.classList.remove('open'); return; }
  p.classList.add('open');
  const n = $('#p-name');
  if (document.activeElement !== n) n.value = it.name || it.spec.name || '';
  n.placeholder = `${(it.spec.kind || it.spec.type || it.type || '').replace(/_/g, ' ')} — name`;
  $('#p-old').textContent = it.oldName ? `once: ${it.oldName}` : '';
  $('#p-meta').textContent = describe(it); $('#p-kind').textContent = describe(it);
  $('#p-renew').style.display = it.type === 'structure' || (it.autoName && it.name) ? '' : 'none';
}
// the spec entry behind a selected item (by id, in any list)
function specOf(id) { for (const k of ['structures', 'props', 'roads', 'fields', 'walls', 'plots', 'retains', 'paint']) { const e = (state.spec[k] || []).find((q) => q.id === id); if (e) return e; } return null; }
function renameSel(fn) {
  const it = state.world.items.get(state.selected), e = it && specOf(it.id); if (!e) return;
  window.mapgenEditor?.pushUndo?.();
  fn(e); applyEdit(); renderPanel(state.world.items.get(state.selected));
}

// ---------------------------------------------------------------- chat handoff
function requestText(it, mode, prompt) {
  const s = it.spec;
  const subject = {
    id: it.id,
    name: it.name || s.name || null,
    type: it.type === 'structure' ? s.kind || 'building' : s.type,
    origin: it.type === 'structure' ? ORIGINS[s.origin || 'new'] : undefined,
    material: s.material, floors: s.floors, size_m: s.size, sign: s.sign,
  };
  const nearby = [...state.world.items.values()].filter((o) => o.id !== it.id && o.name).map((o) => o.name).slice(0, 12);
  const task = mode === 'reroll'
    ? 'REROLL the stats for this subject (keep what it is; new owner/occupants/inventory/price level).'
    : `REWRITE this subject as: "${prompt}". Update name/kind/sign if it should change, and generate fitting stats.`;
  return [
    '[BAJA MAPGEN · STAT REQUEST]',
    `Place: ${state.spec.name}${state.spec.region ? ' — ' + state.spec.region : ''}`,
    state.spec.context ? `Context: ${state.spec.context}` : null,
    `Subject: ${JSON.stringify(Object.fromEntries(Object.entries(subject).filter(([, v]) => v != null)))}`,
    `Current stats: ${JSON.stringify(s.stats || {})}`,
    nearby.length ? `Nearby: ${nearby.join(', ')}` : null,
    `Task: ${task}`,
    'Stats: owner, occupants, condition (short phrase), gm_notes (brief; specialists get GURPS skills + levels; anything else the GM needs), stock (only if it sells things).',
    'Stock items come from GURPS books (Basic Set, High-Tech...) with page refs; price = book price × TL multiplier (TL5 ×1, TL6 ×2, TL7 ×4, TL8 ×8, TL9 ×16, TL10 ×32) with a small per-item drift.',
    `Reply with ONE JSON object: {"id":"${it.id}", "name"?: "...", "kind"?: "...", "sign"?: "...", "condition"?: 0-1, "finish"?: "none|wash|painted|decorated|showpiece", "stats": {"owner": "...", "occupants": ["..."], "condition": "...", "gm_notes": ["..."], "stock"?: [{"item": "...", "price": "$..", "qty"?: n, "ref": "B288"}]}}`,
  ].filter(Boolean).join('\n');
}

function openModal(title, text, mode) {
  $('#m-title').textContent = title;
  $('#m-out').value = text || '';
  $('#m-out-wrap').style.display = text ? '' : 'none';
  $('#m-in').value = '';
  $('#m-in-label').textContent = mode === 'spec' ? 'Paste a place spec (JSON) or a patch from Claude:' : 'Paste Claude\'s reply here:';
  const na = Object.keys(state.saved.archive || {}).length; $('#m-archive').style.display = mode === 'spec' && na ? '' : 'none'; $('#m-archive').textContent = `Download ${na} older map${na > 1 ? 's' : ''} kept in this browser`;
  $('#modal').classList.add('open');
  setTimeout(() => (text ? $('#m-copy') : $('#m-in')).focus(), 30);
}
function closeModal() { $('#modal').classList.remove('open'); }

function extractJSON(txt) {
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fence ? fence[1] : txt;
  const a = src.search(/[\[{]/);
  if (a < 0) throw new Error('No JSON found');
  const open = src[a], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc2 = false;
  for (let i = a; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc2) esc2 = false; else if (c === '\\') esc2 = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(src.slice(a, i + 1));
  }
  throw new Error('Unbalanced JSON');
}

function isSpec(o) { return o && !Array.isArray(o) && !o.id && (o.structures || o.roads || o.terrain || o.size) && o.name; }

function applyPatch(p) {
  if (!p.id) throw new Error('Patch needs an "id"');
  const lists = ['structures', 'props', 'fields', 'roads', 'walls'];
  for (const l of lists) {
    const arr = state.spec[l] || [];
    const i = arr.findIndex((x) => x.id === p.id);
    if (i >= 0) { arr[i] = mergeItem(arr[i], p); return; }
  }
  // auto-placed / generated: keep as override
  state.spec.overrides ||= {};
  state.spec.overrides[p.id] = mergeItem(state.spec.overrides[p.id] || {}, p);
}
function mergeItem(a, p) {
  const out = { ...a, ...p };
  if (p.stats) out.stats = { ...(a.stats || {}), ...p.stats };
  return out;
}

function applyInput(txt) {
  const o = extractJSON(txt);
  if (isSpec(o)) {
    addPlace(o);
    return `Loaded place "${o.name}"`;
  }
  const patches = Array.isArray(o) ? o : o.patches || [o];
  for (const p of patches) applyPatch(p);
  persist();
  generate(true);
  if (patches.length === 1 && state.world.items.has(patches[0].id)) select(patches[0].id);
  return `Applied ${patches.length} patch${patches.length > 1 ? 'es' : ''}`;
}

// ---------------------------------------------------------------- wiring
// old browser-kept maps: download each as a JSON file (then drop them into saves/)
$('#m-archive').onclick = () => {
  const A = state.saved.archive || {};
  Object.entries(A).forEach(([k, sp], i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(sp, null, 1)], { type: 'application/json' })); a.download = `${k}.json`; a.click(); }, i * 400));
};
$('#reroll-seed').onclick = () => { state.spec.seed = Math.floor(Math.random() * 99999); persist(); generate(true); };
$('#seed').onchange = (e) => { state.spec.seed = isNaN(+e.target.value) ? e.target.value : +e.target.value; persist(); generate(true); };
// time of day presets
const tsel = $('#tod');
for (const p of PRESETS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; tsel.appendChild(o); }
const hsl = $('#tod-h'), hlab = $('#tod-hv');
const hourOf = (id) => (typeof id === 'number' ? id : presetHour(id));
const fmtH = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const syncHour = (id) => { const h = hourOf(id); hsl.value = h; hlab.textContent = fmtH(h); if (typeof id !== 'number') tsel.value = id; };
hsl.oninput = () => { const h = +hsl.value; hlab.textContent = fmtH(h); stage.setPreset(h, true); };
hsl.onchange = () => { const h = +hsl.value, k = TOD_KEYS.find((q) => Math.abs((q[0] % 24) - h) < 0.01); setPreset(k ? k[1] : h); };
// running clock: a quarter hour every 15 s (the light re-bakes each step)
let clockT = null;
const clockBtn = $('#tod-play');
const setClock = (on) => {
  clearInterval(clockT); clockT = null; clockBtn.classList.toggle('on', on); clockBtn.textContent = on ? '❚❚' : '▶';
  if (on) clockT = setInterval(() => { if (document.hidden) return; const h = (Math.round(hourOf(stage.presetId) * 4) / 4 + 0.25) % 24; setPreset(h); }, 15000);
  try { localStorage.setItem(LS_KEY + ':clock', on ? '1' : '0'); } catch {}
};
clockBtn.onclick = () => setClock(!clockT);
try { if (localStorage.getItem(LS_KEY + ':clock') === '1') setTimeout(() => setClock(true), 2000); } catch {}
function setPreset(id) {
  syncHour(id);
  const prev = $('#status').textContent;
  $('#status').textContent = 'Baking light…';
  $('#status').classList.add('flash');
  setTimeout(() => {
    const t0 = performance.now();
    stage.setPreset(id);
    $('#status').classList.remove('flash');
    $('#status').textContent = `${typeof id === 'number' ? fmtH(id) : PRESETS.find((p) => p.id === id).label} · baked ${Math.round(performance.now() - t0)} ms`;
    try { localStorage.setItem(LS_KEY + ':tod', String(id)); } catch {}
  }, 30);
}
tsel.onchange = (e) => setPreset(e.target.value);
// weather on top of the time of day
const wsel = $('#weather');
for (const [k, l] of Object.entries(WEATHER)) { const o = document.createElement('option'); o.value = k; o.textContent = l; wsel.appendChild(o); }
try { stage.weather = localStorage.getItem(LS_KEY + ':weather') || 'sunny'; } catch { stage.weather = 'sunny'; }
try { stage.haze = +(localStorage.getItem(LS_KEY + ':haze') ?? 0.3); if (isNaN(stage.haze)) stage.haze = 0.3; } catch { stage.haze = 0.3; }
if (stage.weather === 'marine') { stage.weather = 'sunny'; stage.haze = 0.8; } // marine fog became the haze slider
$('#haze').value = stage.haze;
$('#haze').oninput = (e) => { stage.haze = +e.target.value; stage.setPreset(stage.presetId, true); };
$('#haze').onchange = (e) => { stage.haze = +e.target.value; try { localStorage.setItem(LS_KEY + ':haze', String(stage.haze)); } catch {} setPreset(stage.presetId); };
wsel.value = stage.weather;
wsel.onchange = (e) => { stage.weather = e.target.value; try { localStorage.setItem(LS_KEY + ':weather', stage.weather); } catch {} setPreset(stage.presetId); };
// look switches
for (const k of ['ps2', 'lowres', 'dither', 'grade', 'glow', 'flare', 'trails']) {
  const btn = $('#look-' + k);
  btn.classList.toggle('on', !!stage.look[k]);
  btn.onclick = () => { stage.setLook(k, !stage.look[k]); btn.classList.toggle('on', !!stage.look[k]); saveLook(); };
}
// faceted terrain (old low-poly ground): needs a rebuild of the terrain mesh
{
  const b = document.createElement('button'); b.id = 'look-facet'; b.textContent = 'Facets'; b.title = 'Faceted low-poly terrain (one shade per triangle)';
  TERRAIN_LOOK.faceted = false; // facets: removed from the menu (button kept off-screen)
  b.classList.toggle('on', TERRAIN_LOOK.faceted);
  b.onclick = () => { TERRAIN_LOOK.faceted = !TERRAIN_LOOK.faceted; b.classList.toggle('on', TERRAIN_LOOK.faceted); try { localStorage.setItem(LS_KEY + ':facet', TERRAIN_LOOK.faceted ? '1' : '0'); } catch {} generate(true); };
}
// sunglasses: tones down the glare (noon) with a warm amber tint
{
  const b = document.createElement('button'); b.id = 'look-shades'; b.textContent = 'Shades'; b.title = 'Mexico grade: near-monochrome amber, olive skies, punchy contrast';
  $('#look-grade').after(b);
  b.onclick = () => { stage.setLook('shades', !stage.look.shades); b.classList.toggle('on', !!stage.look.shades); saveLook(); };
}
function saveLook() { try { localStorage.setItem(LS_KEY + ':look', JSON.stringify({ ps2: stage.look.ps2, lowres: stage.look.lowres, dither: stage.look.dither, grade: stage.look.grade, shades: stage.look.shades, glow: stage.look.glow, flare: stage.look.flare, trails: stage.look.trails })); } catch {} }
$('#lut-file').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const t = await f.text(); stage.setLUT(t); $('#lut-clear').style.display = ''; try { localStorage.setItem(LS_KEY + ':lut', t); } catch {} flash('LUT loaded: ' + f.name); }
  catch (err) { flash('LUT failed: ' + err.message); }
};
$('#lut-clear').onclick = () => { stage.setLUT(null); $('#lut-clear').style.display = 'none'; try { localStorage.removeItem(LS_KEY + ':lut'); } catch {} };
$('#labels-t').onclick = () => { state.labels = !state.labels; $('#labels-t').classList.toggle('on', state.labels); };
// vegetation cover overlay, wear & litter (decal density; saved with the map), ground clutter on / off
$('#cover-t').onclick = () => { U.uVegShow.value = U.uVegShow.value ? 0 : 1; $('#cover-t').classList.toggle('on', !!U.uVegShow.value); };
$('#act-t').onclick = () => { const on = !$('#act-t').classList.contains('on'); $('#act-t').classList.toggle('on', on); stage.setActivityView(on); };
$('#life').oninput = (e) => { $('#life-v').textContent = (+e.target.value).toFixed(2).replace(/0$/, ''); };
$('#life').onchange = (e) => { state.spec.activity = +e.target.value; persist(); state.world.spec.activity = state.spec.activity; state.world.redoLife(); stage.effects.setWorld(state.world); stage.setPreset(stage.presetId); };
$('#heat-t').onclick = () => { const on = !$('#heat-t').classList.contains('on'); $('#heat-t').classList.toggle('on', on); $('#heat-leg').style.display = on ? 'inline-flex' : 'none'; stage.setHeatView(on); };
stage.onHeat = (H) => { const el = $('#heat-air'); if (el) el.textContent = `air ${Math.round(H.air)}° · ${Math.round(H.tMin)}–${Math.round(H.tMax)}°`; };
const snd = initAudio(stage, state); window.mapgenSound = snd;
{ const v = $('#snd-vol'), lab = $('#snd-vol-v'), m = $('#snd-mute');
  v.value = snd.vol; lab.textContent = Math.round(snd.vol * 100); m.classList.toggle('on', snd.mute);
  v.oninput = () => { snd.setVol(+v.value); lab.textContent = Math.round(+v.value * 100); };
  m.onclick = () => { snd.setMute(!snd.mute); m.classList.toggle('on', snd.mute); }; }
$('#clutter-t').onclick = () => { stage.clutterOn = stage.clutterOn === false; $('#clutter-t').classList.toggle('on', stage.clutterOn !== false); if (stage.clutterOn === false) stage.clutter.dispose(state.world.group); };
$('#wear').oninput = (e) => { $('#wear-v').textContent = (+e.target.value).toFixed(2).replace(/0$/, ''); };
$('#wear').onchange = (e) => { state.spec.wear = +e.target.value; persist(); state.world.spec.wear = state.spec.wear; state.world.groundFx(); };
$('#rot-l').onclick = () => stage.rotate90(-1);
$('#rot-r').onclick = () => stage.rotate90(1);
$('#reset').onclick = () => { if (stage.walk) stage.setWalk(false); $('#walk-t')?.classList.remove('on'); stage.resetView(); $('#free-t').classList.remove('on'); $('#fov-w').style.display = 'none'; };
$('#free-t').onclick = () => { if (stage.walk) stage.setWalk(false); else stage.setFree(!stage.free); $('#free-t').classList.toggle('on', stage.free); $('#walk-t').classList.remove('on'); $('#fov-w').style.display = stage.free ? '' : 'none'; };
const walkUI = () => { $('#walk-t').classList.toggle('on', !!stage.walk); $('#free-t').classList.toggle('on', stage.free && !stage.walk); $('#fov-w').style.display = stage.free ? '' : 'none'; };
// Walk: first pick where to drop in (a marker follows the cursor, red where you can't stand), click to land there
const drop = { on: false, mk: null, at: null };
function dropMarker() {
  if (drop.mk) return drop.mk;
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.85, depthTest: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.35, 10), mat); body.position.y = 0.68;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mat); head.position.y = 1.55;
  g.add(ring, body, head); g.renderOrder = 999; g.traverse((o) => (o.renderOrder = 999)); g.userData.mat = mat; g.visible = false;
  return (drop.mk = g);
}
function dropStart() {
  if (drop.on) return;
  drop.on = true; drop.at = null; stage._walkCol = stage.walkColliders();
  stage.scene.add(dropMarker()); document.body.classList.add('droppick');
  $('#drop-tip').classList.add('open');
}
function dropEnd() {
  if (!drop.on) return false;
  drop.on = false; if (drop.mk) { drop.mk.visible = false; stage.scene.remove(drop.mk); }
  document.body.classList.remove('droppick'); $('#drop-tip').classList.remove('open');
  return true;
}
function walkToggle() {
  if (stage.walk) { stage.setWalk(false); walkUI(); return; }
  if (drop.on) { dropEnd(); return; }
  const E = window.mapgenEditor; if (E?.on) E.setOn(false);
  if (stage.free) { stage.setFree(false); walkUI(); }
  dropStart();
}
window.mapgenWalkPick = walkToggle;
$('#walk-t').onclick = walkToggle;
{
  const cv = stage.renderer.domElement; let d0 = null;
  cv.addEventListener('pointermove', (e) => {
    if (!drop.on) return;
    const p = window.mapgenEditor?.groundAt?.(e.clientX, e.clientY), mk = drop.mk;
    if (!p) { mk.visible = false; drop.at = null; return; }
    const T = state.world.terrain, bad = stage.walkBlocked(p.x, p.z);
    mk.visible = true; mk.position.set(p.x, T.height(p.x, p.z), p.z); mk.userData.mat.color.set(bad ? 0xff5a4a : 0x5dff8a);
    drop.at = bad ? null : [p.x, p.z];
  }, true);
  cv.addEventListener('pointerdown', (e) => { if (drop.on) d0 = [e.clientX, e.clientY]; }, true);
  cv.addEventListener('pointerup', (e) => {
    if (!drop.on || e.button !== 0 || !d0 || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) return;
    e.stopImmediatePropagation(); // no selecting on the drop click
    if (!drop.at) { flash('Can’t stand there'); return; }
    const at = drop.at; dropEnd(); stage.setWalk(true, at); walkUI();
  }, true);
}
window.mapgenWalkOff = () => { if (stage.walk) { stage.setWalk(false); walkUI(); } };
$('#fov').oninput = (e) => { stage.setFOV(+e.target.value); $('#fov-v').textContent = e.target.value + '°'; };
// screenshot (F8): everything at full detail for the shot
function shot() {
  flash('Screenshot…');
  setTimeout(() => {
    const url = stage.exportMax(2);
    const a = document.createElement('a');
    const t = new Date(), p2 = (n) => String(n).padStart(2, '0');
    a.href = url; a.download = `${slug(state.spec.name)}-${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}${p2(t.getSeconds())}.png`; a.click();
    flash('Saved ' + a.download);
  }, 30);
}
$('#png').onclick = shot;
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify(state.spec, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${slug(state.spec.name)}.json`; a.click();
};
$('#load').onclick = () => openModal('Load spec / apply patch', '', 'spec');
// the Esc card is the file menu too: these drive the Build bar's own buttons
$('#hud-new').onclick = () => { document.body.classList.remove('hud'); $('#ed-new')?.click(); };
$('#hud-open').onclick = () => { document.body.classList.remove('hud'); $('#ed-open')?.click(); };
$('#hud-save').onclick = () => { document.body.classList.remove('hud'); $('#ed-save')?.click(); };
$('#hud-resume').onclick = () => document.body.classList.remove('hud');
$('#p-close').onclick = () => select(null);
$('#p-name').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = state.world.items.get(state.selected)?.name || ''; e.target.blur(); } e.stopPropagation(); };
$('#p-name').onchange = (e) => { const v = e.target.value.trim(); renameSel((sp) => { if (v) sp.name = v; else delete sp.name; }); };
$('#p-renew').onclick = () => renameSel((sp) => { delete sp.name; sp.nameV = (sp.nameV || 0) + 1; });
$('#m-copy').onclick = async () => {
  const t = $('#m-out').value;
  try { await navigator.clipboard.writeText(t); } catch { $('#m-out').select(); document.execCommand('copy'); }
  $('#m-copy').textContent = 'Copied ✓';
  setTimeout(() => ($('#m-copy').textContent = 'Copy request'), 1400);
};
$('#m-apply').onclick = () => {
  try { const msg = applyInput($('#m-in').value); closeModal(); flash(msg); }
  catch (err) { $('#m-err').textContent = err.message; }
};
$('#m-close').onclick = closeModal;
$('#m-file').onchange = async (e) => { const f = e.target.files[0]; if (f) $('#m-in').value = await f.text(); };
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };

function flash(msg) { const s = $('#status'); s.textContent = msg; s.classList.add('flash'); setTimeout(() => s.classList.remove('flash'), 1200); }

// pointer: click selects, drag orbits
const canvas = stage.renderer.domElement;
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (state.building) return;
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || e.button !== 0) return;
  let id = stage.pick(e.clientX, e.clientY);
  if (!id) { const E = window.mapgenEditor, p = E?.groundAt?.(e.clientX, e.clientY); if (p) id = E.api?.pickExtra?.(p) || null; } // plots, zones, roads, walls: no mesh of their own
  if (id && /:use$/.test(id)) id = id.replace(/:use$/, '');
  select(id && state.world.items.has(id) ? id : null);
});
let hoverT = 0;
canvas.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverT < 60 || e.buttons) return;
  hoverT = now;
  const id = stage.pick(e.clientX, e.clientY);
  const tip = $('#tip');
  if (id) {
    const it = state.world.items.get(id);
    tip.textContent = it.name || `${it.spec.kind || it.spec.type}`;
    tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
    tip.style.display = 'block';
    canvas.style.cursor = 'pointer';
  } else { tip.style.display = 'none'; canvas.style.cursor = ''; }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f) return;
  try { flash(applyInput(await f.text())); } catch (err) { flash('Drop failed: ' + err.message); }
});
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { if (e.key === 'Escape') { closeModal(); document.activeElement.blur(); } return; }
  if (e.key === 'Escape') { escape(); return; }
  if (isKey(e, 'shot')) { e.preventDefault(); shot(); return; }
  if (document.body.classList.contains('hud') || document.body.classList.contains('setopen')) return;
  if (stage.walk && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); stage.walkUse(); return; } // climb up / down
  if (stage.free && /^[qQeEcC ]$/.test(e.key)) { e.preventDefault(); return; }
  if (isKey(e, 'rotL')) stage.rotate90(-1);
  else if (isKey(e, 'rotR')) stage.rotate90(1);
  else if (isKey(e, 'free')) $('#free-t').click();
  else if (isKey(e, 'walk')) { e.preventDefault(); walkToggle(); }
  else if (isKey(e, 'reset')) $('#reset').click();
  else if (isKey(e, 'labels')) $('#labels-t').click();
});
// Esc, one step at a time: popovers › settings › menu › dialogs › (a drawing in progress: the editor) › tool › plot editing ›
// selection › walk / free camera › Build mode › the menu
function escape() {
  const B = document.body, E = window.mapgenEditor;
  if (ui?.closePops()) return;
  if (ui?.closeSettings()) return;
  if (dropEnd()) return;
  if (B.classList.contains('hud')) { B.classList.remove('hud'); return; }
  if ($('#modal').classList.contains('open')) { closeModal(); return; }
  if ($('#ed-newdlg')?.classList.contains('open')) { $('#ed-newdlg').classList.remove('open'); return; }
  if (E?.on && E.tool !== 'select') { E.setTool('select'); return; }
  if (E?.api?.exitPlot?.()) { select(null); return; }
  if (state.selected || E?.api?.gateSel) { select(null); E?.api?.clearGate?.(); return; }
  if (stage.walk) { stage.setWalk(false); walkUI(); return; }
  if (stage.free) { $('#free-t').click(); return; }
  if (E?.on) { E.setOn(false); return; }
  B.classList.add('hud');
}

// ---------------------------------------------------------------- build mode
const editor = initEditor({ state, stage, $, generate: (k) => generate(k), applyEdit: () => applyEdit(), persist: () => persist(), select: (id) => select(id), addPlace: (s) => addPlace(s), flash: (m) => flash(m) });
const ui = initUI({ state, stage, $, flash });
const tutorial = initTutorial({ state, $ });
$('#hud-tut').onclick = () => tutorial.start(true);

// ---------------------------------------------------------------- boot
try {
  const lk = JSON.parse(localStorage.getItem(LS_KEY + ':look') || 'null');
  if (lk) for (const k of ['ps2', 'lowres', 'dither', 'grade', 'shades', 'glow', 'flare']) { if (lk[k] === undefined) continue; stage.setLook(k, !!lk[k]); $('#look-' + k).classList.toggle('on', !!lk[k]); }
  const lut = localStorage.getItem(LS_KEY + ':lut');
  if (lut) try { localStorage.removeItem(LS_KEY + ':lut'); } catch {} // LUT loading removed from the menu
  const tod = localStorage.getItem(LS_KEY + ':tod');
  if (tod) stage.presetId = isNaN(+tod) ? tod : +tod;
} catch {}
syncHour(stage.presetId);
const hashPlace = decodeURIComponent((location.hash || '').slice(1));
loadModels().finally(() => {
  // boot into the map being worked on; older browser-kept maps are moved aside (Load › download them)
  const P = state.saved.places || {}, cur = P[state.saved.last] ? state.saved.last : Object.keys(P)[0];
  if (cur) { archiveOld(cur); store.save(state.saved); loadPlace(cur); } else addPlace(newMapSpec({ name: 'Tutorial', seed: `tut-${Math.random().toString(36).slice(2, 7)}`, w: 600, d: 500, biome: 'coastal_desert', relief: 0.35, hills: 1, mesas: 0, arroyo: 1, arroyoN: 1, arroyoSize: 'medium', coast: 'off', veg: 0.35 }));
  // first time here (no map of your own yet): the tutorial; anyone with a map already just gets it in the Esc menu
  if (!tutorial.seen()) { if (!cur) setTimeout(() => tutorial.start(false), 900); else tutorial.markSeen(); }
  void hashPlace;
});
// the tutorial runs on a map of its own; the one you were on is put back when it ends (unless you keep the tutorial's)
function tutorialBegin() {
  try { persist(); } catch { /* nothing to keep */ }
  const prev = state.key, sp = newMapSpec({ name: 'Tutorial', seed: `tut-${Math.random().toString(36).slice(2, 7)}`, w: 600, d: 500, biome: 'coastal_desert', relief: 0.35, hills: 1, mesas: 0, arroyo: 1, arroyoN: 1, arroyoSize: 'medium', coast: 'off', veg: 0.35 }); // the vibe: coastal desert, one arroyo
  addPlace(sp); return prev && prev !== state.key ? prev : null;
}
function tutorialEnd(prev, keep) {
  if (keep || !prev) return;
  const A = state.saved.archive || {}; if (!A[prev]) return;
  state.saved.places = { [prev]: A[prev] }; delete A[prev]; store.save(state.saved); loadPlace(prev);
}
window.mapgen = { state, stage, select, applyInput, THREE, loadPlace, generate, addPlace, applyEdit, U, tutorialBegin, tutorialEnd };

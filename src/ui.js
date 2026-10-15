// Shell UI: the small floating clusters (mode switch, clock + weather, camera, view, menu), popovers,
// the Esc menu, settings (graphics / world / controls) and the build hint. The old controls keep their ids,
// so their handlers in main.js / editor.js still drive everything; this file only places and labels them.
import { WEATHER } from './presets.js';
import { ACTIONS, FIXED, keyOf, setKey, keyLabel } from './keys.js';

const WX_ICON = { sunny: '☀', overcast: '☁', dust: '≋', rain: '⁂' };

export function initUI({ state, stage, $, flash }) {
  const ed = () => window.mapgenEditor;
  const B = document.body;
  // ---- mode switch
  $('#t-exp').onclick = () => ed()?.setOn(false);
  $('#t-bld').onclick = () => ed()?.setOn(true);
  const syncMode = () => { const on = B.classList.contains('building'); $('#t-exp').classList.toggle('on', !on); $('#t-bld').classList.toggle('on', on); if (on) closePops(); };
  new MutationObserver(syncMode).observe(B, { attributes: true, attributeFilter: ['class'] });
  syncMode();

  // ---- popovers
  const pops = { wx: $('#wxp'), view: $('#viewp') };
  function closePops() { let any = false; for (const p of Object.values(pops)) { if (p.classList.contains('open')) any = true; p.classList.remove('open'); } return any; }
  const toggle = (k) => { const was = pops[k].classList.contains('open'); closePops(); pops[k].classList.toggle('open', !was); };
  $('#t-wx').onclick = () => toggle('wx');
  $('#t-clk').onclick = () => toggle('wx');
  $('#t-view').onclick = () => toggle('view');
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pop, #t-wx, #t-clk, #t-view')) closePops(); }, true);

  // weather as buttons (the hidden select keeps the old handler)
  const wsel = $('#weather'), wbox = $('#wx-opts');
  for (const [k, l] of Object.entries(WEATHER)) {
    const b = document.createElement('button'); b.dataset.w = k; b.textContent = l;
    b.onclick = () => { wsel.value = k; wsel.onchange?.({ target: wsel }); syncLabels(); };
    wbox.appendChild(b);
  }
  $('#haze').addEventListener('input', () => syncLabels());

  // ---- live labels: map name, clock, weather
  function syncLabels() {
    $('#t-name').textContent = state.spec?.name || '—';
    $('#t-name').title = state.spec?.name || '';
    const playing = $('#tod-play').classList.contains('on');
    $('#t-clk').textContent = $('#tod-hv').textContent + (playing ? ' ▸' : '');
    $('#t-clk').classList.toggle('on', false);
    const w = stage.weather || 'sunny';
    $('#t-wx').textContent = `${WX_ICON[w] || ''} ${WEATHER[w] || w} ▾`;
    wbox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.w === w));
    $('#haze-v').textContent = `${Math.round(+$('#haze').value * 100)}%`;
  }
  setInterval(syncLabels, 500); syncLabels();

  // ---- build hint (mirrors the editor's hint for the current tool)
  const hintSrc = $('#ed-hint'), hint = $('#hint');
  const SNAPS = new Set((document.querySelector('#ed-snap')?.closest('.ed-opt')?.dataset.for || '').split(' '));
  const syncHint = () => { const t = (hintSrc?.textContent || '').replace(/^\s*>\s*/, ''); hint.textContent = t && SNAPS.has(ed()?.tool) ? `${t} · hold Alt: no snapping` : t; };
  if (hintSrc) new MutationObserver(syncHint).observe(hintSrc, { childList: true, characterData: true, subtree: true });
  syncHint();

  // ---- bottom-right: snap, lock roads, undo / redo, saved
  const br = $('#br');
  const snap = $('#ed-snap')?.closest('label'), lock = $('#ed-lockroads')?.closest('label');
  if (snap) { snap.title = 'Snap to roads, walls and plots (hold Alt: off)'; br.appendChild(snap); }
  if (lock) br.appendChild(lock);
  const ur = document.createElement('span'); ur.className = 'grp';
  for (const id of ['#ed-undo', '#ed-redo']) { const b = $(id); if (b) ur.appendChild(b); }
  br.appendChild(ur);
  if ($('#ed-saved')) br.appendChild($('#ed-saved'));
  // the dock's height keeps the right-hand cards above it
  const bm = $('#bm .bm-in');
  if (bm && window.ResizeObserver) new ResizeObserver(() => B.style.setProperty('--dock-h', `${Math.round(bm.getBoundingClientRect().height) + 14}px`)).observe(bm);

  // ---- Esc menu + settings
  $('#t-menu').onclick = () => { closePops(); B.classList.toggle('hud'); };
  $('#veil').onclick = () => { B.classList.remove('hud'); closeSettings(); };
  const openSettings = () => { B.classList.remove('hud'); B.classList.add('setopen'); renderKeys(); };
  function closeSettings() { if (!B.classList.contains('setopen')) return false; B.classList.remove('setopen'); listening = null; return true; }
  $('#hud-settings').onclick = openSettings;
  $('#st-x').onclick = closeSettings;
  $('#st-backup').onclick = () => $('#ed-restore')?.click();
  document.querySelectorAll('#settings .st-tabs button[data-p]').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('#settings .st-tabs button[data-p]').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('#settings .st-pane').forEach((x) => x.classList.toggle('on', x.dataset.p === b.dataset.p));
  }));
  // the look buttons the app adds later (facets, shades) join the Look row
  setTimeout(() => { const row = $('#look-row'); for (const id of ['#look-facet', '#look-shades']) { const b = $(id); if (b && row && b.parentElement !== row) row.appendChild(b); } }, 0);

  // ---- picture: brightness / contrast (kept in the browser)
  const PU = stage.postMat.uniforms, PK = 'baja-mapgen:picture';
  let pic = { b: 0, c: 1 }; try { pic = { ...pic, ...JSON.parse(localStorage.getItem(PK) || '{}') }; } catch { /* no storage */ }
  const syncPic = () => {
    PU.uBright.value = pic.b; PU.uContrast.value = pic.c;
    $('#g-bright').value = pic.b; $('#g-contrast').value = pic.c;
    $('#g-bright-v').textContent = (pic.b > 0 ? '+' : '') + Math.round(pic.b * 100); $('#g-contrast-v').textContent = pic.c.toFixed(2);
    try { localStorage.setItem(PK, JSON.stringify(pic)); } catch { /* no storage */ }
  };
  $('#g-bright').oninput = (e) => { pic.b = +e.target.value; syncPic(); };
  $('#g-contrast').oninput = (e) => { pic.c = +e.target.value; syncPic(); };
  for (const id of ['#g-bright', '#g-contrast']) $(id).ondblclick = () => { pic = { b: 0, c: 1 }; syncPic(); };
  syncPic();

  // ---- controls: click an action, press a key
  let listening = null;
  function renderKeys() {
    const box = $('#keymap');
    box.innerHTML = ACTIONS.map(([a, l]) => `<div class="kb${listening === a ? ' on' : ''}" data-a="${a}"><span>${l}</span><span class="d"></span><span class="kk">${listening === a ? 'press a key…' : keyLabel(keyOf(a))}</span></div>`).join('')
      + FIXED.map(([l, ks]) => `<div class="kb fixed"><span>${l}</span><span class="d"></span>${ks.map((k) => `<span class="kk">${k}</span>`).join('')}</div>`).join('');
    box.querySelectorAll('.kb[data-a]').forEach((r) => (r.onclick = () => { listening = listening === r.dataset.a ? null : r.dataset.a; renderKeys(); }));
  }
  window.addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    if (e.key === 'Escape') { listening = null; renderKeys(); return; }
    setKey(listening, e.key === 'Backspace' ? null : e.key);
    flash(`${ACTIONS.find((x) => x[0] === listening)[1]}: ${keyLabel(keyOf(listening))}`);
    listening = null; renderKeys();
  }, true);

  return { closePops, closeSettings, settingsOpen: () => B.classList.contains('setopen') };
}

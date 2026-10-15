// First-run tutorial: a few cards on the basics, then a hands-on run — lay the highway, put down a plot, inspect and
// change its building, fill a block with plots. One card (bottom-left); the thing a step talks about is highlighted;
// hands-on steps tick themselves off as you do them. Runs once on a fresh install; Esc menu › Tutorial runs it again
// (on its own map: the map you were on comes back when you finish).
const LS = 'baja-mapgen:tutorial';

export function initTutorial({ state, $ }) {
  const ed = () => window.mapgenEditor;
  const card = document.createElement('div');
  card.id = 'tut'; card.className = 'box';
  document.body.appendChild(card);
  let steps = [], i = 0, timer = null, prevKey = null, base = {};

  const S = () => state.spec || {};
  const roads = () => (S().roads || []).filter((r) => r.type === 'highway').length;
  const plots = () => (S().plots || []).length;
  const sel = () => (S().structures || []).find((q) => q.id === state.selected && !q._sub);
  const look = (q) => JSON.stringify([q?.material, q?.vstyle, q?.roof, q?.roofMat]);
  const building = () => document.body.classList.contains('building');
  const tool = () => ed()?.tool, opt = (k) => ed()?.opts?.[k];
  const T = (t) => `#bm .bm-tabs button[data-t="${t}"]`, tile = (l) => `#bm .bm-tile[title="${l}"]`, sub = (s) => `#bm .bm-subs button[data-s="${s}"]`;
  const stg = () => window.mapgen?.stage;
  const got = (k, f) => () => (base.got ||= {})[k] || (base.got[k] = !!f()); // once ticked, stays ticked (style and material can reset each other)
  const tab = (t) => `#panel .bt-tabs button[data-t="${t}"]`;
  const field = (t, k, c = 'select') => () => (document.querySelector(`${tab(t)}.on`) ? [`#panel label[data-k="${k}"] ${c}`] : [tab(t)]); // the tab, then the field on it

  // ---- the steps. info: text only (Next). task: a checklist of { t, done(), hl } — each line ticks itself off
  const BASICS = [
    { h: 'Welcome to Baja California, year 2241', p: 'This is a town builder set in post-post-apocalyptic Northern Mexico. A couple of minutes of basics, then you build a little town yourself.' },
    { h: 'The camera', p: 'Wheel: zoom · right-drag: pan · middle-drag: orbit · <b>Q</b> / <b>E</b>: turn 90° · <b>F</b>: free camera.', hl: ['#free-t'] },
    { h: 'Explore and Build modes', p: '<b>EXPLORE mode</b> is for looking around and inspecting what you did. <b>BUILD mode</b> (<b>B</b>) is for making things.', hl: ['#t-exp', '#t-bld'] },
    { h: 'The dock', p: 'In Build every tool lives in the dock: <b>1</b> Roads · <b>2</b> Zones · <b>3</b> Buildings · <b>4</b> Walls · <b>5</b> Props · <b>6</b> Plants · <b>7</b> Terrain · <b>0</b> Recent. <b>/</b> searches it.', hl: ['#bm .bm-tabs'], enter: () => ed()?.setOn(true) },
    { h: 'Selecting', p: 'Click anything to select it. In <b>BUILD mode</b> it opens an editing panel. <b>Re-roll</b> gives it a new look, <b>R</b> turns it, <b>Del</b> deletes it.' },
    { h: 'Plots', p: 'A plot is a piece of land with one job: a house and its yard, a field, a market, a cemetery, a camp. Draw one anywhere, or draw a zone and it splits into many. The first side you draw is always the front: that is the way the plot faces. The category, size, shape, row placement switch and the offset from the road (<b>Shift + wheel</b>) decide what goes up on them.' },
    { h: 'Undo and saving', p: '<b>Ctrl+Z</b> / <b>Ctrl+Shift+Z</b> undo and redo. The map keeps itself in your browser as you go; <b>Esc › Save</b> writes it to a file. <b>F8</b> takes a full-quality screenshot.', hl: ['#br'] },
    { h: 'Your turn', p: 'Now build a little roadside town: the Spine, a plot, a look at a building, then a whole block.', next: 'Start' },
  ];
  const HANDS = [
    { h: '1 · The Spine', p: 'Down here there is one real road: MEX-1, the Transpeninsular — some 1,700 km of two-lane blacktop from Tijuana to Cabo San Lucas. It is called <b>the Spine</b>, because it connects everything. Towns string out along it and face it; everything else is dirt. Place a Spine.',
      enter: () => (base.hw = roads()),
      task: [
        { t: 'Build mode (<b>B</b>)', done: building, hl: ['#t-bld'] },
        { t: 'Roads (<b>1</b>) › <b>The Spine</b>', done: () => tool() === 'road' && opt('rtype') === 'highway', hl: () => (tool() === 'road' ? [tile('The Spine')] : [T('Roads')]) },
        { t: 'Click a few points across the map · <b>Enter</b> or double-click finishes', done: () => roads() > base.hw, hl: ['#hint'] },
      ] },
    { h: '2 · A plot', p: 'Put one plot beside the Spine. The category picks what kind of place it becomes. Its corners <b>snap</b> to the road edge (set back by the <b>Offset</b>, <b>Shift + wheel</b>) and to other plots; hold <b>Alt</b> to place them freely.',
      enter: () => (base.pl = plots()),
      task: [
        { t: 'Zones (<b>2</b>) › Plots › <b>Singular Plot</b>', done: () => tool() === 'plotfree', hl: () => (tool() === 'plotfree' ? [] : document.querySelector(tile('Singular Plot')) ? [tile('Singular Plot')] : document.querySelector(sub('Plots')) ? [sub('Plots')] : [T('Zones')]) },
        { t: 'Pick a <b>Category</b> in the tool card', done: () => !!opt('zc'), hl: ['#ed-zc'] },
        { t: 'Draw it next to the Spine: click its corners, the first side along the road', done: () => plots() > base.pl, hl: ['#hint'] },
      ] },
    { h: '3 · Inspect it', p: 'Every building can be changed by hand. Select yours and give it a new look.',
      enter: () => { base.sel = null; base.got = {}; const pl = (S().plots || []).slice(-1)[0]; base.bld = (S().structures || []).find((q) => q.id === pl?.building || (q.plot === pl?.id && !q._sub))?.id || null; },
      tick: () => { const q = sel(); if (q && base.sel?.id !== q.id) base.sel = { id: q.id, m: q.material, f: JSON.stringify(q.finish ?? null), c: q.condition, r: JSON.stringify([q.roof, q.roofMat]) }; },
      task: [
        { t: 'The Select tool: <b>V</b> (or <b>Esc</b>)', done: () => tool() === 'select' || !!sel(), hl: ['#hint'] },
        { t: 'Click your building', done: () => !!sel(), mark: () => base.bld },
        { t: 'Fabric tab › change its <b>material</b>', done: got('m', () => !!sel() && base.sel && sel().material !== base.sel.m), hl: field('Fabric', 'Material') },
        { t: 'Fabric tab › change its <b>finish</b>', done: got('f', () => !!sel() && base.sel && JSON.stringify(sel().finish ?? null) !== base.sel.f), hl: field('Fabric', 'Finish') },
        { t: 'Fabric tab › change its <b>condition</b>', done: got('c', () => !!sel() && base.sel && sel().condition !== base.sel.c), hl: field('Fabric', 'Condition', 'input') },
        { t: 'Roof tab › change its <b>roof</b>', done: got('r', () => !!sel() && base.sel && JSON.stringify([sel().roof, sel().roofMat]) !== base.sel.r), hl: field('Roof', 'Roof') },
      ] },
    { h: '4 · Build a neighborhood', p: 'Now a whole neighborhood at once: draw an area and it splits into plots, each with its own building and yard.',
      enter: () => (base.pl = plots()),
      task: [
        { t: 'Zones (<b>2</b>) › Plots › <b>Multiple Plots</b>', done: () => tool() === 'zone', hl: () => (tool() === 'zone' ? [] : document.querySelector(tile('Multiple Plots')) ? [tile('Multiple Plots')] : document.querySelector(sub('Plots')) ? [sub('Plots')] : [T('Zones')]) },
        { t: 'Pick the <b>Fallout mix</b> category', done: () => opt('zc') === 'fallout', hl: ['#ed-zc'] },
        { t: 'Draw an area along the Spine: click its corners, the first side along the road', done: () => plots() >= base.pl + 3, hl: ['#hint'] },
      ] },
    { h: '5 · Walk around', p: 'Now get down on the ground and have a closer look. Press <b>-</b> for <b>WALK mode</b> (or Walk, top right, in Explore) and click where to drop in. Then drag to look, <b>WASD</b> to move, <b>Shift</b> to run, <b>E</b> to climb onto roofs at a ladder, stairs or terrace door. <b>Esc</b> takes you back up.',
      enter: () => { base.walk0 = null; base.walked = false; },
      task: [
        { t: 'Enter <b>WALK mode</b> (<b>-</b>)', done: () => !!stg()?.walk || !!base.walk0, hl: ['#walk-t'] },
        { t: 'Walk around your neighborhood', done: () => { const c = stg()?.camera?.position; if (!stg()?.walk || !c) return base.walked; if (!base.walk0) base.walk0 = c.clone(); return (base.walked ||= c.distanceTo(base.walk0) > 15); } },
      ] },
    { h: 'That’s it', p: 'Rome wasn’t built in a day. You, however, can build something in a day in Baja California.<br><span style="opacity:.7">Everything else is in the dock: walls, props, plants, terrain, wasteland camps. You can run the tutorial again from the main menu (<b>Esc</b>).</span>', last: true },
  ];

  // ---- a marker over a thing in the world (the building to click)
  const mark = document.createElement('div'); mark.id = 'tut-mark'; mark.innerHTML = '<span>click</span>'; document.body.appendChild(mark);
  let markId = null, raf = 0;
  const placeMark = () => {
    raf = 0; if (!markId) { mark.style.display = 'none'; return; }
    const M = window.mapgen, it = M?.state?.world?.items?.get(markId), st = (S().structures || []).find((q) => q.id === markId);
    if (!st || !M?.stage) { mark.style.display = 'none'; return; }
    const cam = M.stage.free ? M.stage.persp : M.stage.camera, v = new M.THREE.Vector3(st.at[0], (it?.info?.height || 4) + (st._y || 0) + 0.5, st.at[1]).project(cam);
    if (v.z > 1) { mark.style.display = 'none'; } else { mark.style.display = ''; mark.style.left = `${((v.x + 1) / 2) * innerWidth}px`; mark.style.top = `${((1 - v.y) / 2) * innerHeight}px`; }
    raf = requestAnimationFrame(placeMark);
  };
  const setMark = (id) => { markId = id || null; if (markId && !raf) raf = requestAnimationFrame(placeMark); if (!markId) mark.style.display = 'none'; };

  // ---- drawing
  const lit = new Set();
  const highlight = (sels) => {
    const now = new Set(); for (const s of sels || []) document.querySelectorAll(s).forEach((el) => now.add(el));
    for (const el of lit) if (!now.has(el)) el.classList.remove('tut-hl');
    for (const el of now) el.classList.add('tut-hl');
    lit.clear(); for (const el of now) lit.add(el);
  };
  function render() {
    const st = steps[i]; if (!st) return;
    const task = st.task, first = task ? task.findIndex((x) => !x.done()) : -1;
    const lines = task ? `<ul>${task.map((x, k) => `<li class="${x.done() ? 'ok' : k === first ? 'now' : ''}">${x.t}</li>`).join('')}</ul>` : '';
    const btns = st.last
      ? (prevKey ? '<button data-a="back">Back to my map</button><button data-a="keep" class="pri">Keep this map</button>' : '<button data-a="keep" class="pri">Finish</button>')
      : `<button data-a="skip">Skip tutorial</button>${i > 0 && !task ? '<button data-a="prev">Back</button>' : ''}${task ? '<button data-a="next" title="If a step doesn’t tick off, move on anyway">Skip step</button>' : `<button data-a="next" class="pri">${st.next || 'Next'}</button>`}`;
    card.classList.toggle('mid', i < BASICS.length); // the basics in the middle of the screen; the hands-on part off to the side
    card.innerHTML = `<div class="tut-n">${i + 1} / ${steps.length}</div><div class="tut-h">${st.h}</div><div class="tut-p">${st.p}</div>${lines}<div class="tut-b">${btns}</div>`;
    card.querySelectorAll('button').forEach((b) => (b.onclick = () => act(b.dataset.a)));
    const now = first >= 0 ? task[first] : null, hl = now ? now.hl : st.hl;
    highlight(typeof hl === 'function' ? hl() : hl);
    setMark(now?.mark?.());
  }
  let sig = '';
  function tick() {
    const st = steps[i]; if (!st) return;
    st.tick?.();
    if (st.task && st.task.every((x) => x.done())) { go(i + 1); return; }
    const s2 = st.task ? st.task.map((x) => (x.done() ? 1 : 0)).join('') + (typeof (st.task.find((x) => !x.done())?.hl) === 'function' ? JSON.stringify(st.task.find((x) => !x.done()).hl()) : '') : '';
    if (s2 !== sig) { sig = s2; render(); }
  }
  function go(n) {
    if (n < 0 || n >= steps.length) return;
    i = n; sig = ''; steps[i].enter?.(); render();
  }
  function act(a) {
    if (a === 'next') go(i + 1);
    else if (a === 'prev') go(i - 1);
    else if (a === 'skip' || a === 'keep') end(true);
    else if (a === 'back') end(false);
  }
  function start(fromMenu = false) {
    if (fromMenu) prevKey = window.mapgen?.tutorialBegin?.() || null; // a fresh map of its own; yours comes back after
    steps = [...BASICS, ...HANDS]; base = {};
    document.body.classList.add('tut-on'); document.body.classList.remove('hud');
    clearInterval(timer); timer = setInterval(tick, 300);
    go(0);
  }
  function end(keep) {
    clearInterval(timer); timer = null; highlight([]); setMark(null);
    document.body.classList.remove('tut-on'); card.innerHTML = '';
    try { localStorage.setItem(LS, 'done'); } catch { /* no storage */ }
    if (prevKey) window.mapgen?.tutorialEnd?.(prevKey, keep);
    prevKey = null;
  }
  // ---- one-time tip: the first time a spot of the town gets really busy (red in the Activity view) while building
  const TIP = 'baja-mapgen:tip-activity';
  const tip = document.createElement('div'); tip.id = 'tut-tip'; tip.className = 'box';
  tip.innerHTML = `<img src="img/activity.jpg" alt=""><div class="tut-h">Activity</div><div class="tut-p">How busy each spot is. The Spine, junctions, shops and cafés draw people; red is the busiest. The busier a spot, the more life shows up there: vendors, carts, chairs pulled out, litter, worn ground. See it any time in <b>VIEW › Activity</b>.</div><div class="tut-b"><button class="pri">Got it</button></div>`;
  document.body.appendChild(tip);
  tip.querySelector('button').onclick = () => { tip.classList.remove('open'); try { localStorage.setItem(TIP, '1'); } catch { /* no storage */ } };
  const tipSeen = () => { try { return !!localStorage.getItem(TIP); } catch { return true; } };
  const tipTimer = setInterval(() => {
    if (tipSeen()) { clearInterval(tipTimer); return; }
    if (!building() || tip.classList.contains('open')) return;
    const A = window.mapgen?.state?.world?.activity?.data; if (!A) return;
    let mx = 0; for (let k = 0; k < A.length; k++) if (A[k] > mx) mx = A[k];
    if (mx >= 0.85 && (S().structures || []).length >= 3) tip.classList.add('open');
  }, 1500);
  const seen = () => { try { return !!localStorage.getItem(LS); } catch { return true; } };
  const markSeen = () => { try { localStorage.setItem(LS, 'done'); } catch { /* no storage */ } };
  const api = { start, end, seen, markSeen, go, running: () => !!timer }; window.__tut = api; return api;
}

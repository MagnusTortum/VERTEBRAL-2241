// Soundscape: long ambience beds that crossfade between random tracks, mixed by where the listener is.
//  - general: the desert bed (night: crickets), always on, quieter in busy spots and storms
//  - ground: high-activity walla near the ground in busy spots; heard from further away (or from up high) it
//    shifts to a muffled copy (pre-rendered by pack-audio.mjs: a page opened from disk can't filter live)
//  - shouts: one-shot vendor calls placed at markets (sometimes in any very busy spot), muffled with distance
//  - strong wind: dust storms, flying fast in free cam, very high up · fly: the rush of flying fast
//  - rain: ground-level rain crossfades into sky rain going up; walking close to a building adds the drip
// Plain <audio> elements (work from file://); starts on the first click / key (browsers block autoplay).
import { AUDIO, FAR } from './audio-list.js';
import { nearestWithin, pointInPoly } from './geo.js';
import { LAID, laidAt } from './roads.js';

const LS = 'baja-mapgen:sound';
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pick = (a, not) => { const b = a.length > 1 ? a.filter((x) => x !== not) : a; return b[Math.floor(Math.random() * b.length)]; };
const url = (p) => encodeURI(p).replace(/#/g, '%23');
const OPEN = /mountainside|pampa|perdiz/i, DESOLATE = /desolation|iron wire/i; // general-folder tracks kept for open / desolate ground
const MARKETS = new Set(['market', 'farmers_market', 'scavmarket', 'trader']);

// one playing track (+ its muffled twin, started at the same spot so the two stay in step)
class Voice {
  constructor(src, far) {
    this.els = [src, far].filter(Boolean).map((s) => { const a = new Audio(url(s)); a.preload = 'auto'; a.volume = 0; return a; });
    this.src = src; this.fade = 0; this.dead = false;
  }
  start(rand = true, at = 0) {
    const [a] = this.els;
    const go = () => { const t = rand && isFinite(a.duration) ? Math.random() * Math.max(0, a.duration - 20) : Math.min(at, isFinite(a.duration) ? a.duration * 0.5 : at); for (const e of this.els) { try { e.currentTime = t; } catch { /* not seekable yet */ } e.play().catch(() => {}); } };
    if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
  }
  left() { const a = this.els[0]; return isFinite(a.duration) && a.duration > 0 ? a.duration - a.currentTime : Infinity; }
  ended() { return this.els[0].ended; }
  set(v, farW = 0) {
    const [d, f] = this.els, cl = (x) => Math.min(1, Math.max(0, x));
    if (f) { d.volume = cl(v * (1 - farW)); f.volume = cl(v * farW); } else d.volume = cl(v);
  }
  stop() { for (const e of this.els) { e.pause(); e.removeAttribute('src'); e.load(); } this.dead = true; }
}

// a looping bed over a pool of tracks: crossfades to another track before the current one runs out
class Bed {
  // attack / release: how fast the level follows its target (per second); fadeIn: a cold start's fade (s);
  // keep: hold on to the files while silent (instant restarts)
  constructor(pool, { far = false, xf = 6, attack = 1.2, release = 1.2, fadeIn = null, keep = false } = {}) {
    Object.assign(this, { pool, far, xf, attack, release, fadeIn: fadeIn ?? xf, keep, v: [], g: 0, farW: 0, idle: 0, xfNow: xf });
  }
  update(dt, target, farW, master, on) {
    this.g += (target - this.g) * Math.min(1, dt * (target > this.g ? this.attack : this.release));
    this.farW += (farW - this.farW) * Math.min(1, dt * 1.2);
    const audible = on && this.g > 0.004 && this.pool.length;
    this.idle = audible ? 0 : this.idle + dt;
    if (!audible && this.idle > 8 && !(this.keep && on)) { for (const v of this.v) v.stop(); this.v = []; return; } // silent a while: let go of the files
    if ((audible || (this.keep && on)) && !this.v.length) { this.add(true); this.xfNow = this.fadeIn; }
    const cur = this.v[this.v.length - 1];
    if (cur && (cur.left() < this.xf || cur.ended()) && this.v.length < 2 && audible) { this.add(false); this.xfNow = this.xf; }
    for (const v of this.v) {
      const newest = v === this.v[this.v.length - 1];
      v.fade = Math.min(1, Math.max(0, v.fade + (newest ? dt : -dt) / Math.max(0.05, this.xfNow)));
      v.set(master * this.g * v.fade, this.farW);
    }
    for (const v of this.v) if (!v.dead && (v.fade <= 0 || v.ended()) && v !== this.v[this.v.length - 1]) v.stop();
    this.v = this.v.filter((v) => !v.dead);
  }
  // move on to another track now (time of day jumped): a quicker crossfade than the usual one
  next(xf = 3) { if (!this.v.length || this.pool.length < 2) return; for (const v of this.v.slice(0, -1)) v.stop(); this.v = this.v.filter((v) => !v.dead); this.add(true); this.xfNow = xf; }
  add(rand) {
    const s = pick(this.pool, this.v[this.v.length - 1]?.src); if (!s) return;
    const v = new Voice(s, this.far ? FAR[s] : null); v.start(rand); this.v.push(v);
  }
}

// footsteps: one-shot steps (cut by cut-steps.py) picked by what's underfoot, a few voices round-robin
const STEP = AUDIO.steps || {};
function surfaceAt(stage, W, x, z, hard) {
  if (stage._roof) { const st = (W.structures || []).find((q) => q.id === stage._roof.sid); return /corrugated|tin/.test(st?.roofMat || st?._roofMat || '') ? 'metal' : 'paved'; }
  for (const rd of W.roads || []) {
    const bb = rd._bb; if (!bb || x < bb[0] - rd.hw - 1 || x > bb[2] + rd.hw + 1 || z < bb[1] - rd.hw - 1 || z > bb[3] + rd.hw + 1) continue;
    const q = nearestWithin(rd.samples, x, z, rd.hw); if (!q) continue;
    if (LAID(rd) && laidAt(rd, q.s)) return 'paved';
    if (rd.type === 'highway' || rd.type === 'paved') return 'asphalt';
    return 'dirt';
  }
  if (W.onWalk?.(x, z)) return 'paved';
  for (const P of hard) if (pointInPoly(x, z, P)) return 'paved';
  for (const f of W.fields || []) if (f.poly && /field|orchard|vineyard|fallow/.test(f.kind || f.type || 'field') && pointInPoly(x, z, f.poly)) return 'grass';
  const T = W.terrain; if (T) { const g = Math.hypot(T.height(x + 1, z) - T.height(x - 1, z), T.height(x, z + 1) - T.height(x, z - 1)) / 2; if (g > 0.45) return 'rock'; }
  return 'dirt';
}

export function initAudio(stage, state) {
  let cfg = { vol: 0.7, mute: false };
  try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { /* defaults */ }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch { /* no storage */ } };
  let unlocked = false, hidden = false;
  const unlock = () => { unlocked = true; };
  window.addEventListener('pointerdown', unlock, { capture: true, once: true });
  window.addEventListener('keydown', unlock, { capture: true, once: true });
  window.addEventListener('pointerdown', (e) => { if (e.button === 1) orbiting = true; }, true);
  window.addEventListener('pointerup', (e) => { if (e.button === 1) orbiting = false; }, true);
  window.addEventListener('blur', () => { orbiting = false; });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // camera whooshes: one preloaded element per file, reused (a fresh <audio> per spin often wasn't loaded in time)
  const hitEls = (AUDIO.rotHit || []).map((f) => { const a = new Audio(url(f)); a.preload = 'auto'; a.volume = 0; a.load(); return a; });
  let hitLast = null;
  const hits = [];
  const stepPool = Array.from({ length: 4 }, () => { const a = new Audio(); a.preload = 'auto'; return a; });
  function step(kind, vol) {
    const surf = STEP[kindSurf] ? kindSurf : 'dirt', S = STEP[surf] || {};
    const list = (kind === 'run' && S.run) || (kind === 'land' && S.land) || S.walk || S.run; if (!list?.length) return;
    const a = stepPool[stepI++ % stepPool.length]; const f = pick(list, lastStep); lastStep = f; a.src = url(f); a.volume = Math.min(1, vol * (0.8 + Math.random() * 0.25)); a.playbackRate = (kind === 'run' && !S.run ? 1.12 : 1) * (0.94 + Math.random() * 0.12); a.play().catch(() => {});
  }
  let kindSurf = 'dirt', lastStep = null;
  const beds = {
    general: new Bed(AUDIO.general.filter((f) => !OPEN.test(f) && !DESOLATE.test(f)), { xf: 8 }),
    open: new Bed(AUDIO.general.filter((f) => OPEN.test(f)), { xf: 8 }), // out of town in the open (and a little along the Spine)
    desolate: new Bed(AUDIO.general.filter((f) => DESOLATE.test(f)), { xf: 8 }), /* only far out, off the roads */ night: new Bed(AUDIO.night, { xf: 8 }),
    ground: new Bed(AUDIO.ground, { far: true, xf: 6 }),
    wind: new Bed(AUDIO.wind, { xf: 5 }), fly: new Bed(AUDIO.fly, { xf: 4, attack: 7, release: 9, fadeIn: 0.15, keep: true }),
    birds: new Bed(AUDIO.birds || [], { xf: 8 }), // dawn chorus, a little through the morning
    rot: new Bed(AUDIO.rotBed || [], { xf: 4, attack: 18, release: 5, fadeIn: 0.05, keep: true }), // spinning the iso view fast
    gust: new Bed(AUDIO.wind, { xf: 5, attack: 6, release: 8, fadeIn: 0.2, keep: true }), // the wind of flying fast: in and out quickly
    rainG: new Bed(AUDIO.rainGround, { xf: 5 }), rainS: new Bed(AUDIO.rainSky, { xf: 5 }), rainC: new Bed(AUDIO.rainClose, { xf: 4 }),
  };
  const shouts = []; let nextShout = 4, lastPos = null, lastMode = '', lastHour = null, hourMove = 0, hourCool = 0, stepD = 0, stepLast = null, roofWas = null, hardW = null, hard = [], stepI = 0, lastAz = null, spin = 0, orbiting = false, spinArmed = true, hitCool = 0, speed = 0, act = { near: 0, far: 0, at: null };
  let actT = 0;

  // where the listener is and how high: walk / free cam = the eye; the iso view = the middle of the screen,
  // "height" from how much ground the view shows
  function listener() {
    const T = state.world?.terrain;
    if (stage.free) {
      const p = stage.persp.position, h = Math.max(0, p.y - (T ? T.height(p.x, p.z) : 0));
      return { x: p.x, z: p.z, h, ground: stage.walk ? 1 : 1 - sm(4, 60, h), sky: stage.walk ? 0 : sm(120, 320, h) };
    }
    const t = stage.controls.target, iso = stage.iso, span = iso ? (iso.top - iso.bottom) / 2 / iso.zoom : 100;
    return { x: t.x, z: t.z, h: span * 0.8, ground: 1 - sm(22, 150, span), sky: sm(260, 650, span) };
  }
  // activity: right here (avg over ~12 m) and the strongest within earshot (weighted by distance)
  function sampleActivity(L) {
    const A = state.world?.activity; if (!A?.at) return { near: 0, far: 0, at: null };
    let n = 0, c = 0; for (let dx = -10; dx <= 10; dx += 5) for (let dz = -10; dz <= 10; dz += 5) { n += A.at(L.x + dx, L.z + dz); c++; }
    let far = 0, at = null;
    for (let r = 8; r <= 90; r += 8) for (let a = 0; a < 6.28; a += 16 / r) {
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r, v = A.at(x, z) * (1 - sm(10, 110, Math.hypot(r, L.h * 0.6)));
      if (v > far) { far = v; at = [x, z]; }
    }
    return { near: n / c, far, at };
  }
  function markets() {
    const out = [];
    for (const pl of state.world?.plots || state.spec?.plots || []) if (MARKETS.has(pl.use) && pl.poly?.length) {
      let x = 0, z = 0; for (const q of pl.poly) { x += q[0]; z += q[1]; } out.push([x / pl.poly.length, z / pl.poly.length]);
    }
    return out;
  }
  function shout(pos) {
    const s = pick(AUDIO.shouts); if (!s) return;
    const v = new Voice(s, FAR[s]); v.pos = pos; v.start(false); shouts.push(v);
  }

  // dogs: who keeps them — poor and run-down places, shacks, farms and outskirts (rich houses hardly)
  let openT = 0, openness = 0, desolation = 0, spine = 0, dogW = null, dogSrc = [], nextDog = 20, nextAnimal = 35;
  const FARMY = new Set(['farmstead', 'outskirts', 'outgrounds', 'corral', 'field', 'fallow', 'orchard', 'vineyard', 'era', 'caravan', 'trader']);
  function dogSources(W) {
    if (dogW === W) return dogSrc;
    dogW = W; dogSrc = [];
    const plot = new Map((W.plots || []).map((p) => [p.id, p]));
    for (const st of W.structures || []) {
      const m = st._masses?.[0]; if (!m) continue;
      const pl = plot.get(st.plot || st.inPlot);
      let w = 0.35;
      if (/shack|hut|lean|jacal/.test(st.kind || '') || (st.condition ?? 0.6) < 0.45 || ['rebuilt', 'built_on_ruin'].includes(st.origin)) w = 1;
      if (pl && (FARMY.has(pl.use) || ['farmer', 'rancher'].includes(pl.household))) w = 1.3;
      if (pl?.household === 'wealthy' || pl?.zcat === 'wealthy' || st.zcat === 'wealthy') w = 0.08;
      dogSrc.push([m.cx, m.cz, w]);
    }
    for (const pl of W.plots || []) if (FARMY.has(pl.use) && pl.poly?.length) { let x = 0, z = 0; for (const q of pl.poly) { x += q[0]; z += q[1]; } dogSrc.push([x / pl.poly.length, z / pl.poly.length, 1.3]); }
    return dogSrc;
  }
  function dog(pos) {
    const s = pick(AUDIO.dogs); if (!s) return;
    const v = new Voice(s, FAR[s]); v.pos = pos; v.dog = { t: 0, len: 7 + Math.random() * 12 }; v.start(true); shouts.push(v);
  }

  stage.onFrame.push((dt) => {
    dt = Math.min(dt, 0.1);
    const on = unlocked && !hidden && !cfg.mute, master = cfg.vol;
    const L = listener(), P = stage._preset || {};
    const mode = stage.walk ? 'w' : stage.free ? 'f' : 'i'; if (mode !== lastMode) { lastPos = null; speed = 0; lastMode = mode; }
    if (lastPos && stage.free && !stage.walk) speed += (Math.hypot(L.x - lastPos[0], L.z - lastPos[1], (stage.persp.position.y - lastPos[2])) / Math.max(dt, 1e-3) - speed) * Math.min(1, dt * 12);
    else speed = 0;
    lastPos = [L.x, L.z, stage.persp.position.y];
    if ((actT -= dt) <= 0) { actT = 0.4; act = sampleActivity(L); }
    // time of day moved by hand (over half an hour within a couple of seconds): a new bed, to show time passing
    if (lastHour != null && P.hour != null) hourMove = hourMove * Math.exp(-dt / 1.5) + Math.min(Math.abs(P.hour - lastHour), Math.abs(24 - Math.abs(P.hour - lastHour)));
    lastHour = P.hour ?? lastHour; hourCool -= dt;
    if (hourMove > 0.5 && hourCool <= 0) { hourMove = 0; hourCool = 4; beds.general.next(); beds.night.next(); beds.ground.next(2.5); }
    // footsteps: a step every stride while walking; a landing after climbing up or down
    if (stage.walk && on && state.world) {
      const W = state.world, p = stage.persp.position;
      if (hardW !== W) { hardW = W; const T = W.terrain; hard = W.hardGround ? W.hardGround(-T.W / 2, -T.D / 2, T.W / 2, T.D / 2) : []; }
      const roofNow = stage._roof ? stage._roof.sid + ':' + stage._roof.y : '';
      if (stepLast) {
        const d = Math.hypot(p.x - stepLast[0], p.z - stepLast[1]), v = d / Math.max(dt, 1e-3);
        if (roofNow !== roofWas) { kindSurf = surfaceAt(stage, W, p.x, p.z, hard); step('land', master * 0.092); stepD = 0; }
        else if (d < 3) {
          stepD += d;
          const run = v > 4.2, stride = run ? 2.0 : 1.25;
          if (stepD >= stride) { stepD = 0; kindSurf = surfaceAt(stage, W, p.x, p.z, hard); step(run ? 'run' : 'walk', master * (run ? 0.086 : 0.063)); }
          if (v < 0.3) stepD = Math.min(stepD, 0.9); // stopping: the next step comes soon after moving off
        }
      }
      stepLast = [p.x, p.z]; roofWas = roofNow;
    } else { stepLast = null; roofWas = null; stepD = 0.9; }
    // spinning the iso camera by hand (middle-drag), only when it's whipped round fast: the gust is on only
    // while it turns (no tail), the whoosh starts past its slow fade-in and is cut the moment the turn stops
    let raw = 0;
    if (!stage.free) {
      const c = stage.camera.position, t = stage.controls.target, az = Math.atan2(c.x - t.x, c.z - t.z);
      if (lastAz != null) { let d = az - lastAz; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < 1) raw = Math.abs(d) * 57.3 / Math.max(dt, 1e-3); } // a 90° snap (Q / E) isn't a spin
      lastAz = az;
    } else lastAz = null;
    if (!orbiting) raw = 0; // the damping glide after letting go makes no sound
    spin += (raw - spin) * Math.min(1, dt * 25);
    const turn = sm(260, 620, spin); hitCool -= dt;
    if (turn > 0.35 && spinArmed && hitCool <= 0 && on && AUDIO.rotHit?.length) { spinArmed = false; hitCool = 0.8; const a = pick(hitEls, hitLast); hitLast = a; try { a.currentTime = 0.5; } catch { /* not ready */ } a.volume = 0; a.play().catch(() => {}); if (!hits.some((h) => h.a === a)) hits.push({ a, g: 0 }); }
    if (turn < 0.05) spinArmed = true;
    beds.rot.update(dt, turn * 0.096, 0, master, on);
    const hour = P.hour ?? 12, night = hour >= 20.5 || hour < 5.3, wx = P.weather;
    const rain = wx === 'rain' ? 1 : 0, dust = wx === 'dust' ? 1 : 0;
    const busy = sm(0.5, 0.9, act.near), busyFar = sm(0.5, 0.9, act.far);
    const fly = sm(12, 32, speed);
    const windG = Math.max(dust * 0.9, L.sky * 0.75);
    // the beds
    const calm = 1 - 0.45 * busy * L.ground - 0.5 * Math.max(dust, rain * 0.6) - 0.4 * L.sky;
    // where you are: in town, out in the open (outside town), desolate (far out and off the roads), on the Spine
    if ((openT -= dt) <= 0 && state.world) {
      openT = 1; const W = state.world; let dn = Infinity, dr = Infinity; spine = 0;
      for (const q of dogSources(W)) { const dd = Math.hypot(q[0] - L.x, q[1] - L.z); if (dd < dn) dn = dd; }
      for (const rd of W.roads || []) { const q = nearestWithin(rd.samples || [], L.x, L.z, 80); if (!q) continue; dr = Math.min(dr, q.d - rd.hw); if (rd.type === 'highway' && q.d < rd.hw + 12) spine = 1; }
      openness = sm(50, 110, dn) * (1 - busy); desolation = sm(220, 350, dn) * sm(25, 70, dr) * (1 - busy);
    }
    const spineK = spine * L.ground; // ducking only down on the road, not from the sky
    const dayBase = night ? 0.25 : 0.55;
    beds.desolate.update(dt, 0.55 * desolation * calm, 0, master, on);
    beds.open.update(dt, Math.max(0.5 * openness * (1 - desolation), 0.33 * 0.55 * spineK) * calm, 0, master, on);
    beds.general.update(dt, dayBase * calm * (1 - 0.8 * openness) * (1 - 0.7 * spineK), 0, master, on);
    beds.night.update(dt, night ? 0.6 * calm : 0, 0, master, on);
    const dawn = Math.max(0, 1 - Math.abs(hour - 6.6) / 1.8), morning = hour > 6 && hour < 11 ? 0.18 : 0;
    beds.birds.update(dt, Math.max(dawn * 0.5, morning) * calm * (0.4 + 0.6 * L.ground) * (1 - rain), 0, master, on);
    const dry = busy * L.ground, farMix = busyFar * (L.ground * (1 - busy) * 0.75 + (1 - L.ground) * 0.45) * (1 - L.sky);
    // the town quiets down: evening fades to a fifth of the bustle, after 1 am nothing (dawn brings it back)
    const h24 = ((hour % 24) + 24) % 24, townK = h24 >= 1 && h24 < 5.3 ? 0 : h24 >= 20.5 || h24 < 1 ? 0.2 : h24 >= 19.5 ? 1 - 0.8 * (h24 - 19.5) : h24 < 6.3 ? 0.2 + 0.8 * (h24 - 5.3) : 1;
    const gG = Math.max(dry, farMix) * 0.85 * townK;
    beds.ground.update(dt, gG, gG > 0 ? farMix / (dry + farMix + 1e-6) : 0, master, on);
    beds.wind.update(dt, windG, 0, master, on);
    beds.fly.update(dt, fly * 0.7, 0, master, on);
    beds.gust.update(dt, fly * 0.6 * (1 - windG), 0, master, on);
    let close = 0;
    if (rain && stage.walk) { for (let a = 0; a < 6.28 && !close; a += 0.785) if (stage.walkBlocked(L.x + Math.cos(a) * 2.6, L.z + Math.sin(a) * 2.6)) close = 1; }
    beds.rainG.update(dt, rain * 0.7 * L.ground, 0, master, on);
    beds.rainS.update(dt, rain * 0.6 * (1 - L.ground * 0.85), 0, master, on);
    beds.rainC.update(dt, rain * (0.16 * L.ground + close * 0.4), 0, master, on); // always a little under the rain, more beside walls
    // shouts: placed in the world, quieter and more muffled with distance
    if (on && (nextShout -= dt) <= 0) {
      nextShout = 5 + Math.random() * 11;
      if (shouts.filter((v) => !v.hit && !v.dog).length < 2 && L.ground > 0.15 && Math.random() < townK) {
        const ms = markets().map((m) => [m, Math.hypot(m[0] - L.x, m[1] - L.z, L.h * 0.6)]).filter(([, d]) => d < 90);
        if (ms.length) { const [m] = ms[Math.floor(Math.random() * ms.length)]; shout([m[0] + (Math.random() - 0.5) * 16, m[1] + (Math.random() - 0.5) * 16]); }
        else if (act.far > 0.85 && act.at && Math.random() < 0.18) shout([act.at[0] + (Math.random() - 0.5) * 10, act.at[1] + (Math.random() - 0.5) * 10]);
      }
    }
    // a dog now and then: more at night, more around poor places and farms
    if (on && AUDIO.dogs?.length && state.world && (nextDog -= dt) <= 0) {
      const src = dogSources(state.world), near = src.filter((q) => Math.hypot(q[0] - L.x, q[1] - L.z) < 170);
      const score = Math.min(1, near.reduce((a, q) => a + q[2], 0) / 6);
      const nightK = night ? 2.5 : 1, mean = 70 / (nightK * (0.12 + score));
      nextDog = mean * (0.5 + Math.random());
      if (shouts.filter((v) => v.dog && !v.animal).length < (night ? 2 : 1)) {
        let q = null, tot = near.reduce((a, r) => a + r[2], 0), r = Math.random() * tot;
        for (const c of near) if ((r -= c[2]) <= 0) { q = c; break; }
        if (!q) { const a = Math.random() * 6.28, d = 90 + Math.random() * 60; q = [L.x + Math.cos(a) * d, L.z + Math.sin(a) * d]; } // somewhere out there
        dog([q[0] + (Math.random() - 0.5) * 12, q[1] + (Math.random() - 0.5) * 12]);
      }
    }
    // farm animals now and then (chickens; roosters mostly around dawn), only where they'd be kept, never at night
    if (on && AUDIO.animals?.length && state.world && !night && (nextAnimal -= dt) <= 0) {
      const near = dogSources(state.world).filter((q) => q[2] >= 1 && Math.hypot(q[0] - L.x, q[1] - L.z) < 140);
      const dawnK = 1 + 3 * Math.max(0, 1 - Math.abs(hour - 6.6) / 1.5);
      nextAnimal = (150 / (dawnK * Math.min(1, 0.15 + near.length / 5))) * (0.5 + Math.random());
      if (near.length && !shouts.some((v) => v.animal)) {
        const q = near[Math.floor(Math.random() * near.length)], rooster = AUDIO.animals.filter((f) => /rooster|crow/i.test(f)), hens = AUDIO.animals.filter((f) => !/rooster|crow/i.test(f));
        const s = pick(Math.random() < (dawnK > 1.5 ? 0.7 : 0.25) && rooster.length ? rooster : hens.length ? hens : AUDIO.animals);
        const v = new Voice(s, FAR[s]); v.pos = [q[0] + (Math.random() - 0.5) * 10, q[1] + (Math.random() - 0.5) * 10]; v.animal = true; v.dog = { t: 0, len: 25 }; v.start(false); shouts.push(v);
      }
    }
    for (let i = hits.length - 1; i >= 0; i--) { // whooshes: follow the turn, cut when it stops
      const h = hits[i], tg = turn > 0.05 ? turn : 0;
      h.g += (tg - h.g) * Math.min(1, dt * (tg > h.g ? 30 : 5));
      h.a.volume = Math.min(1, on ? master * 0.12 * h.g : 0);
      if (h.a.ended || !on || (turn < 0.05 && h.g < 0.02)) { h.a.pause(); hits.splice(i, 1); }
    }
    for (const v of shouts) {
      const d = Math.hypot(v.pos[0] - L.x, v.pos[1] - L.z, L.h * 0.6);
      if (v.dog) { // a stretch of barking: fades in, out, then stops; carries further than voices
        v.dog.t += dt; const e = v.animal ? 0.8 : Math.min(1, v.dog.t / 1.5, Math.max(0, (v.dog.len - v.dog.t) / 2)); // animals: whole short clips
        v.set(on ? master * 0.55 * e * (0.3 + 0.7 * L.ground) / (1 + Math.pow(d / 30, 1.4)) : 0, sm(15, 80, d));
        if (v.dog.t >= v.dog.len || v.ended() || !on) v.stop();
        continue;
      }
      v.set(on ? master * 0.9 / (1 + Math.pow(d / 16, 1.4)) : 0, sm(8, 45, d));
      if (v.ended() || !on) v.stop();
    }
    for (let i = shouts.length - 1; i >= 0; i--) if (shouts[i].dead) shouts.splice(i, 1);
  });

  return {
    debug: () => ({ beds: Object.fromEntries(Object.entries(beds).map(([k, b]) => [k, +b.g.toFixed(2)])), shouts: shouts.length, nextDog: +nextDog.toFixed(1), dogSrc: dogSrc.length, act, speed: +speed.toFixed(1) }),
    get vol() { return cfg.vol; }, get mute() { return cfg.mute; },
    setVol(v) { cfg.vol = Math.min(1, Math.max(0, v)); save(); },
    setMute(m) { cfg.mute = !!m; save(); },
  };
}

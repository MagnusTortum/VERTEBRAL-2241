// Build-menu icons: minimal green line schematics (terminal look). Drawn on a 112 px transparent canvas;
// the tile supplies the dark backing. One small vocabulary of strokes for every family of tool.
const G = '#3dff7a', GD = 'rgba(61,255,122,.38)', GF = 'rgba(61,255,122,.12)';
const S = 112;
const cache = new Map();
function draw(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = G; g.fillStyle = G; g.lineWidth = 4; g.lineJoin = 'round'; g.lineCap = 'round';
  const P = {
    line: (...pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); },
    poly: (pts, fill = GF) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); g.fillStyle = G; } g.stroke(); },
    rect: (x, y, w, h, fill = GF) => { if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); g.fillStyle = G; } g.strokeRect(x, y, w, h); },
    circ: (x, y, r, fill = null) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); g.fillStyle = G; } g.stroke(); },
    dot: (x, y, r = 3) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); },
    thin: (f) => { g.save(); g.lineWidth = 2.5; g.strokeStyle = GD; f(); g.restore(); },
    dash: (f, d = [7, 6]) => { g.save(); g.setLineDash(d); f(); g.restore(); },
    text: (t, size = 52) => { g.font = `${size}px 'Share Tech Mono', monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 56, 58); },
  };
  fn(g, P);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// ---------------------------------------------------------------- buildings: one icon per class
const house = (P) => { P.poly([24, 88, 24, 52, 56, 26, 88, 52, 88, 88]); P.rect(48, 64, 16, 24, null); };
export const BUILDING_ICONS = {
  house: (g, P) => house(P),
  shop: (g, P) => { P.rect(20, 46, 72, 44); P.poly([16, 46, 22, 30, 90, 30, 96, 46], null); for (let x = 30; x < 92; x += 14) P.line(x, 30, x - 3, 46); P.rect(30, 58, 22, 32, null); P.rect(60, 58, 22, 16, null); },
  food: (g, P) => { P.poly([24, 56, 88, 56, 80, 82, 32, 82]); P.line(20, 90, 92, 90); for (const x of [42, 56, 70]) P.thin(() => P.line(x, 46, x + 4, 36, x, 26)); },
  craft: (g, P) => { P.rect(22, 34, 34, 18); P.line(39, 52, 39, 90); P.poly([60, 74, 92, 74, 86, 90, 66, 90]); P.line(56, 74, 96, 74); },
  posada: (g, P) => { P.rect(18, 40, 76, 50); P.rect(30, 56, 52, 18, null); P.line(30, 56, 30, 48, 44, 48, 44, 56); P.line(18, 90, 18, 98); P.line(94, 90, 94, 98); },
  clinic: (g, P) => { P.rect(20, 24, 72, 66); P.poly([48, 36, 64, 36, 64, 50, 78, 50, 78, 64, 64, 64, 64, 78, 48, 78, 48, 64, 34, 64, 34, 50, 48, 50], 'rgba(61,255,122,.3)'); },
  civic: (g, P) => { P.poly([16, 40, 56, 18, 96, 40], GF); P.line(16, 40, 96, 40); for (const x of [28, 46, 66, 84]) P.line(x, 46, x, 82); P.line(14, 88, 98, 88); },
  faith: (g, P) => { P.poly([30, 92, 30, 50, 56, 32, 82, 50, 82, 92]); P.line(56, 32, 56, 10); P.line(48, 18, 64, 18); P.circ(56, 58, 7); P.rect(48, 72, 16, 20, null); },
  police: (g, P) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 16 : 36; pts.push(56 + Math.cos(a) * r, 58 + Math.sin(a) * r); } P.poly(pts); },
  military: (g, P) => { P.poly([16, 90, 22, 54, 90, 54, 96, 90]); P.line(30, 54, 30, 40, 82, 40, 82, 54); P.thin(() => P.line(40, 68, 72, 68)); P.rect(48, 24, 16, 16, null); },
  work: (g, P) => { P.poly([16, 90, 16, 42, 56, 24, 96, 42, 96, 90]); P.rect(32, 54, 48, 36, null); for (let y = 62; y < 90; y += 8) P.thin(() => P.line(34, y, 78, y)); },
  farm: (g, P) => { P.poly([20, 90, 20, 50, 34, 30, 78, 30, 92, 50, 92, 90]); P.line(20, 50, 92, 50); P.rect(42, 62, 28, 28, null); P.line(42, 62, 70, 90); P.line(70, 62, 42, 90); },
  tech: (g, P) => { P.line(56, 14, 34, 94); P.line(56, 14, 78, 94); P.line(44, 56, 68, 56); P.line(39, 76, 73, 76); P.line(46, 50, 70, 64); P.line(66, 50, 42, 64); P.thin(() => { g.beginPath(); g.arc(56, 14, 14, -2.4, -0.7); g.stroke(); g.beginPath(); g.arc(56, 14, 24, -2.4, -0.7); g.stroke(); }); },
  fuel: (g, P) => { P.rect(30, 26, 36, 64); P.rect(37, 34, 22, 16, null); P.line(66, 44, 80, 44, 84, 50, 84, 78, 76, 84); P.line(20, 90, 76, 90); },
  stand: (g, P) => { P.poly([18, 40, 56, 22, 94, 40]); P.line(18, 40, 94, 40); P.line(28, 40, 28, 88); P.line(84, 40, 84, 88); P.rect(24, 62, 64, 14); },
  ruin: (g, P) => { P.poly([22, 90, 22, 44, 36, 36, 44, 52, 54, 40, 62, 58, 74, 46, 90, 54, 90, 90]); P.thin(() => { P.line(40, 64, 48, 76); P.line(66, 66, 60, 80); }); },
  shell: (g, P) => { P.rect(22, 34, 68, 56); for (const x of [32, 52, 72]) P.rect(x, 46, 10, 14, null); P.rect(46, 70, 16, 20, null); P.thin(() => P.line(22, 34, 90, 34)); },
  rubble: (g, P) => { P.poly([14, 90, 28, 72, 40, 76, 52, 60, 66, 66, 78, 56, 98, 90], GF); P.thin(() => { P.rect(36, 82, 10, 6, null); P.rect(60, 78, 12, 6, null); }); },
  found: (g, P) => { P.dash(() => P.poly([20, 82, 20, 40, 56, 40, 56, 58, 92, 58, 92, 82], null)); P.thin(() => P.line(14, 90, 98, 90)); },
  cages: (g, P) => { P.rect(18, 36, 34, 52, null); P.rect(60, 36, 34, 52, null); for (const x of [26, 34, 42, 68, 76, 84]) P.thin(() => P.line(x, 38, x, 86)); P.line(14, 32, 98, 32); },
  brothel: (g, P) => { house(P); P.circ(56, 20, 7, 'rgba(255,90,77,.5)'); P.line(56, 27, 56, 34); },
  gambling: (g, P) => { P.poly([30, 40, 62, 30, 72, 62, 40, 72]); P.poly([56, 58, 84, 50, 92, 80, 64, 88]); for (const [x, y] of [[44, 46], [56, 54], [70, 66], [80, 74]]) P.dot(x, y, 3.5); },
  chop: (g, P) => { P.rect(20, 24, 72, 66); P.poly([48, 36, 64, 36, 64, 50, 78, 50, 78, 64, 64, 64, 64, 78, 48, 78, 48, 64, 34, 64, 34, 50, 48, 50], null); P.thin(() => P.line(30, 84, 84, 30)); },
  gun: (g, P) => { P.poly([14, 48, 82, 48, 82, 40, 98, 40, 98, 56, 50, 56, 44, 76, 30, 76, 34, 56, 14, 56]); P.line(52, 56, 58, 66, 66, 56); },
  bounty: (g, P) => { P.rect(26, 14, 60, 80); P.circ(56, 44, 12); P.line(40, 72, 72, 72); P.thin(() => P.line(40, 82, 72, 82)); P.text('$', 22); },
  watertw: (g, P) => { P.rect(30, 16, 52, 30); P.line(34, 46, 26, 96); P.line(78, 46, 86, 96); P.line(30, 70, 82, 70); P.thin(() => { P.line(30, 70, 82, 96); P.line(82, 70, 30, 96); }); },
  bus: (g, P) => { P.rect(10, 34, 92, 42); for (let x = 18; x < 84; x += 14) P.rect(x, 42, 10, 12, null); P.rect(88, 42, 10, 26, null); P.circ(28, 80, 7, '#031007'); P.circ(82, 80, 7, '#031007'); },
  plane: (g, P) => { g.beginPath(); g.ellipse(52, 60, 42, 13, 0, 0, Math.PI * 2); g.stroke(); P.poly([40, 62, 60, 62, 46, 92, 34, 92]); P.poly([12, 56, 18, 30, 28, 30, 28, 52]); for (let x = 46; x < 88; x += 9) P.dot(x, 56, 2.5); },
  gate: (g, P) => { P.rect(12, 30, 22, 62); P.rect(78, 30, 22, 62); P.rect(34, 50, 44, 42); P.line(34, 34, 78, 34); for (let x = 14; x <= 98; x += 8) P.line(x, 30, x + 2, 22); P.thin(() => { P.line(34, 50, 78, 92); P.line(78, 50, 34, 92); }); },
  derelict: (g, P) => { house(P); P.thin(() => P.line(62, 34, 54, 46, 62, 54, 56, 64)); P.line(68, 64, 80, 64); },
};
export const buildingIcon = (cls) => draw(`b:${cls}`, BUILDING_ICONS[cls] || BUILDING_ICONS.house);
// the icon class for a building catalog entry
export function buildingClass(k, v = {}) {
  const kind = v.kind || k;
  if (/^(shack|auto|house)$/.test(kind)) return 'house';
  if (/^(guardpost|bunker|barracks|armory)$/.test(kind)) return 'military';
  if (kind === 'clinic') return 'clinic';
  if (kind === 'posada') return 'posada';
  if (/^(shop|store)$/.test(kind)) return 'shop';
  if (/^(cantina|cafe)$/.test(kind)) return 'food';
  if (kind === 'stand') return 'stand';
  if (kind === 'trade') return v.layout === 'herreria' || v.layout === 'alfareria' ? 'craft' : 'food';
  if (/^(workshop|garage|warehouse)$/.test(kind)) return 'work';
  if (/^(barn|granary|mill|bodega)$/.test(kind)) return 'farm';
  if (/^(chapel|mission)$/.test(kind)) return 'faith';
  if (kind === 'den') return { cages: 'cages', brothel: 'brothel', gambling: 'gambling', chopshop: 'chop', gunshop: 'gun', bounty: 'bounty', water: 'watertw', bus: 'bus', fuselage: 'plane', gatehouse: 'gate' }[v.layout] || 'shell';
  if (kind === 'comandancia') return 'police';
  if (kind === 'pemex') return 'fuel';
  if (kind === 'utility') return 'tech';
  return 'civic';
}

// ---------------------------------------------------------------- roads, modes
export function roadIcon(v) {
  return draw(`road:${v.type}:${v.width}`, (g, P) => {
    const w = Math.max(10, Math.min(46, v.width * 4));
    g.save(); g.translate(56, 56); g.rotate(-0.7);
    g.fillStyle = v.type === 'path' || v.type === 'track' ? 'transparent' : GF; g.fillRect(-80, -w / 2, 160, w);
    if (v.type === 'path' || v.type === 'track') { P.dash(() => { P.line(-80, -w / 2, 80, -w / 2); P.line(-80, w / 2, 80, w / 2); }); }
    else { P.line(-80, -w / 2, 80, -w / 2); P.line(-80, w / 2, 80, w / 2); }
    if (v.type === 'highway' || v.type === 'paved') P.thin(() => P.dash(() => P.line(-80, 0, 80, 0), [10, 8]));
    if (v.type === 'gravel' || v.type === 'dirt') { g.fillStyle = GD; for (let i = 0; i < 26; i++) { const x = -60 + ((i * 37) % 120), y = -w / 2 + 4 + ((i * 13) % Math.max(1, w - 8)); g.fillRect(x, y, 3, 3); } }
    g.restore();
  });
}
export function modeIcon(m) {
  return draw(`mode:${m}`, (g, P) => {
    g.beginPath();
    if (m === 'straight') { g.moveTo(16, 90); g.lineTo(56, 40); g.lineTo(96, 30); }
    else if (m === 'curved') { g.moveTo(16, 92); g.quadraticCurveTo(30, 20, 96, 26); }
    else { g.moveTo(14, 80); g.bezierCurveTo(30, 20, 60, 100, 98, 30); }
    g.stroke();
    for (const [x, y] of m === 'straight' ? [[16, 90], [56, 40], [96, 30]] : [[16, 92], [96, 26]]) { g.fillStyle = '#031007'; g.fillRect(x - 5, y - 5, 10, 10); g.strokeRect(x - 5, y - 5, 10, 10); }
  });
}

// ---------------------------------------------------------------- zones: a plot outline + what's in it
const plot = (P, fill = GF) => P.poly([16, 86, 96, 78, 88, 22, 24, 30], fill);
const ZONES = {
  single: (g, P) => plot(P),
  multi: (g, P) => { plot(P); P.thin(() => { P.line(42, 27, 44, 84); P.line(64, 25, 70, 81); }); },
  multifamily: (g, P) => { plot(P); P.rect(38, 40, 36, 30, null); P.thin(() => P.line(56, 40, 56, 70)); },
  plaza: (g, P) => { P.rect(16, 16, 80, 80); P.circ(56, 56, 14); P.thin(() => { P.line(16, 56, 42, 56); P.line(70, 56, 96, 56); P.line(56, 16, 56, 42); P.line(56, 70, 56, 96); }); },
  market: (g, P) => { P.rect(14, 18, 84, 76); for (let i = 0; i < 6; i++) P.rect(24 + (i % 3) * 24, 30 + Math.floor(i / 3) * 30, 16, 16, null); },
  trader: (g, P) => { P.rect(16, 20, 80, 72); P.rect(36, 40, 40, 32, null); P.thin(() => P.line(16, 40, 36, 40)); },
  visitors: (g, P) => { P.dash(() => P.rect(12, 18, 88, 76, null)); P.poly([30, 80, 46, 50, 62, 80]); P.poly([58, 66, 70, 44, 84, 66]); },
  wayhouse: (g, P) => { P.rect(14, 20, 84, 72); P.poly([34, 82, 34, 56, 56, 40, 78, 56, 78, 82]); P.line(56, 40, 56, 26, 68, 30, 56, 34); },
  cemetery: (g, P) => { P.rect(14, 20, 84, 72); for (const [x, y] of [[36, 46], [56, 46], [76, 46], [46, 72], [66, 72]]) { P.line(x, y - 9, x, y + 9); P.line(x - 6, y - 3, x + 6, y - 3); } },
  lienzo: (g, P) => { g.beginPath(); g.ellipse(56, 56, 40, 28, 0, 0, Math.PI * 2); g.fillStyle = GF; g.fill(); g.stroke(); P.thin(() => P.line(16, 56, 30, 56)); },
  mystic: (g, P) => { P.rect(14, 18, 84, 76); g.beginPath(); g.moveTo(26, 56); g.quadraticCurveTo(56, 28, 86, 56); g.quadraticCurveTo(56, 84, 26, 56); g.stroke(); P.circ(56, 56, 8, G); },
  brickyard: (g, P) => { P.rect(14, 18, 84, 76); for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) P.thin(() => P.rect(22 + i * 18 + (r % 2) * 6, 28 + r * 16, 12, 8, null)); },
  salvage: (g, P) => { P.rect(14, 18, 84, 76); P.poly([24, 64, 30, 52, 48, 50, 56, 42, 76, 42, 86, 54, 88, 64], null); P.circ(36, 68, 6); P.circ(76, 68, 6); },
  acopio: (g, P) => { P.rect(14, 18, 84, 76); for (const x of [24, 46, 68]) P.poly([x, 44, x + 20, 44, x + 17, 76, x + 3, 76], null); },
  outskirts: (g, P) => { plot(P); P.poly([42, 70, 42, 52, 56, 42, 70, 52, 70, 70], null); },
  outgrounds: (g, P) => { P.dash(() => plot(P, null)); P.thin(() => { P.circ(38, 58, 6); P.circ(70, 50, 8); }); },
  field: (g, P) => { P.rect(14, 14, 84, 84); P.thin(() => { for (let y = 26; y < 98; y += 12) P.line(18, y, 94, y); }); },
  fallow: (g, P) => { P.rect(14, 14, 84, 84, null); P.thin(() => P.dash(() => { for (let y = 26; y < 98; y += 14) P.line(18, y, 94, y); })); },
  orchard: (g, P) => { P.rect(14, 14, 84, 84, null); for (let i = 0; i < 9; i++) P.circ(32 + (i % 3) * 24, 32 + Math.floor(i / 3) * 24, 7); },
  vineyard: (g, P) => { P.rect(14, 14, 84, 84, null); for (let x = 28; x < 96; x += 14) P.thin(() => P.line(x, 22, x, 90)); for (let x = 28; x < 96; x += 14) for (let y = 30; y < 90; y += 14) P.dot(x, y, 3); },
  farmers_market: (g, P) => { P.rect(14, 18, 84, 76, null); for (let i = 0; i < 3; i++) { P.poly([22 + i * 26, 50, 32 + i * 26, 38, 42 + i * 26, 50], null); P.rect(24 + i * 26, 50, 16, 14, null); } P.thin(() => P.line(18, 78, 94, 78)); },
  era: (g, P) => { P.circ(56, 56, 38, GF); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; P.thin(() => P.line(56, 56, 56 + Math.cos(a) * 38, 56 + Math.sin(a) * 38)); } P.circ(56, 56, 5, G); },
  farmstead: (g, P) => { P.rect(14, 14, 84, 84, null); P.thin(() => { for (let y = 64; y < 98; y += 10) P.line(18, y, 94, y); }); P.poly([30, 52, 30, 34, 44, 24, 58, 34, 58, 52]); },
  slavers: (g, P) => { P.rect(14, 18, 84, 76); for (let i = 0; i < 3; i++) { P.rect(76, 24 + i * 22, 16, 16, null); P.thin(() => { P.line(80, 26 + i * 22, 80, 38 + i * 22); P.line(86, 26 + i * 22, 86, 38 + i * 22); }); } P.rect(30, 62, 26, 14); P.line(43, 62, 43, 48); },
  caravan: (g, P) => { P.dash(() => P.rect(12, 16, 88, 80, null)); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; P.rect(52 + Math.cos(a) * 26, 52 + Math.sin(a) * 22, 10, 8, null); } P.circ(56, 56, 5, '#3dff7a'); },
  chemden: (g, P) => { P.circ(44, 62, 16); P.line(44, 46, 44, 34, 76, 34, 76, 54); P.rect(68, 54, 16, 26, null); P.thin(() => { P.line(36, 86, 40, 80); P.line(52, 86, 48, 80); }); },
  fightpit: (g, P) => { P.circ(56, 56, 24, GF); P.thin(() => P.circ(56, 56, 34)); P.line(48, 48, 64, 64); P.line(64, 48, 48, 64); },
  scavmarket: (g, P) => { P.rect(14, 18, 84, 76, null); for (let i = 0; i < 6; i++) { const x = 22 + (i % 3) * 26, y = 28 + Math.floor(i / 3) * 34; P.poly([x, y + 8, x + 8, y, x + 16, y + 8], null); P.rect(x, y + 8, 16, 12, null); } },
  cult: (g, P) => { P.circ(56, 56, 36, null); g.beginPath(); g.moveTo(30, 56); g.quadraticCurveTo(56, 34, 82, 56); g.quadraticCurveTo(56, 78, 30, 56); g.stroke(); P.circ(56, 56, 7, '#3dff7a'); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.dot(56 + Math.cos(a) * 36, 56 + Math.sin(a) * 36, 4); } },
  corral: (g, P) => { P.rect(16, 30, 80, 56, null); for (const x of [16, 36, 56, 76, 96]) P.line(x, 26, x, 90); P.thin(() => P.line(16, 46, 96, 46)); },
};
export const zoneIcon = (k) => draw(`zone:${k}`, ZONES[k] || ZONES.single);

// ---------------------------------------------------------------- walls / terrain bits
export function gateIcon(k) {
  return draw(`gate:${k}`, (g, P) => {
    P.rect(6, 52, 30, 22); P.rect(76, 52, 30, 22);
    P.line(38, 40, 38, 80); P.line(74, 40, 74, 80);
    if (k === 'none') P.thin(() => P.dash(() => P.line(40, 74, 72, 74)));
    else { P.poly([40, 46, 64, 60, 64, 92, 40, 78], k === 'chainlink' ? null : GF); if (k === 'chainlink') P.thin(() => { P.line(42, 54, 62, 86); P.line(62, 66, 44, 74); }); if (k === 'scrap') P.thin(() => P.line(44, 62, 60, 70)); }
  });
}
export function retainIcon(k) {
  return draw(`ret:${k}`, (g, P) => {
    P.line(8, 34, 52, 34, 52, 80, 104, 80);
    P.thin(() => { for (let y = 44; y < 80; y += 9) P.line(52, y, k === 'gabion' ? 70 : 64, y); if (k === 'gabion') { P.line(70, 34, 70, 80); P.line(52, 34, 70, 34); } });
    P.thin(() => P.dash(() => P.line(8, 92, 104, 92)));
  });
}
export const textIcon = (ch) => draw(`txt:${ch}`, (g, P) => P.text(ch));
const TERR = {
  raise: (g, P) => { P.line(10, 86, 40, 86); g.beginPath(); g.moveTo(40, 86); g.quadraticCurveTo(56, 30, 72, 86); g.stroke(); P.line(72, 86, 102, 86); P.line(56, 28, 56, 10); P.line(48, 18, 56, 10, 64, 18); },
  lower: (g, P) => { P.line(10, 50, 40, 50); g.beginPath(); g.moveTo(40, 50); g.quadraticCurveTo(56, 104, 72, 50); g.stroke(); P.line(72, 50, 102, 50); P.line(56, 14, 56, 36); P.line(48, 28, 56, 36, 64, 28); },
  flatten: (g, P) => { P.thin(() => { g.beginPath(); g.moveTo(10, 70); g.quadraticCurveTo(30, 40, 56, 66); g.quadraticCurveTo(80, 90, 102, 60); g.stroke(); }); P.line(10, 62, 102, 62); },
  smooth: (g, P) => { P.thin(() => P.line(10, 70, 26, 44, 40, 80, 56, 40, 70, 78, 86, 46, 102, 66)); g.beginPath(); g.moveTo(10, 64); g.bezierCurveTo(40, 50, 70, 74, 102, 60); g.stroke(); },
  erase: (g, P) => { P.circ(56, 56, 34); P.line(36, 36, 76, 76); P.line(76, 36, 36, 76); },
};
export const terrIcon = (k) => draw(`terr:${k}`, TERR[k] || TERR.raise);
// ground paint: the real texture, in the terminal green (luminance only)
export function texIcon(src) {
  const key = `tex:${src?.slice(-40)}`;
  if (cache.has(key)) return cache.get(key);
  if (!src) return draw('tex:none', (g, P) => P.rect(14, 14, 84, 84));
  return { lazy: (done) => {
    const img = new Image();
    img.onload = () => {
      const url = draw(key, (g, P) => {
        g.save(); g.beginPath(); g.rect(14, 14, 84, 84); g.clip(); g.drawImage(img, 14, 14, 84, 84); g.restore();
        const d = g.getImageData(14, 14, 84, 84), a = d.data;
        let lo = 255, hi = 0; for (let i = 0; i < a.length; i += 4) { const l = a[i] * 0.3 + a[i + 1] * 0.55 + a[i + 2] * 0.15; lo = Math.min(lo, l); hi = Math.max(hi, l); }
        for (let i = 0; i < a.length; i += 4) { const l = ((a[i] * 0.3 + a[i + 1] * 0.55 + a[i + 2] * 0.15) - lo) / Math.max(1, hi - lo), k = 0.1 + 0.75 * l; a[i] = 61 * k; a[i + 1] = 255 * k; a[i + 2] = 122 * k; a[i + 3] = 255; }
        g.putImageData(d, 14, 14); P.rect(14, 14, 84, 84, null);
      });
      done(url);
    };
    img.src = src;
  } };
}
// activity paints have no texture: arrows
export const activityIcon = (more) => draw(`act:${more}`, (g, P) => { P.rect(14, 14, 84, 84, null); for (const x of [36, 56, 76]) { if (more) { P.line(x, 80, x, 34); P.line(x - 8, 42, x, 34, x + 8, 42); } else { P.line(x, 34, x, 80); P.line(x - 8, 72, x, 80, x + 8, 72); } } });

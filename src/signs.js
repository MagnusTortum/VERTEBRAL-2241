// Hand-painted / pre-war / neon signs: canvas texture on a board. Baked like everything else.
import * as THREE from 'three';
import { RNG } from './rng.js';
import { Builder } from './builder.js';
import { MATS, mapMaterial } from './materials.js';

// the sign tool's colour presets per kind: [background, letters, label]
export const SIGN_COLORS = {
  painted: { cream_red: ['#d8cbb0', '#7a2a1e', 'cream / red'], cream_blue: ['#d8cbb0', '#2c3a4a', 'cream / navy'], white_black: ['#e4ded0', '#2a2622', 'white / black'], yellow_red: ['#d8b040', '#8a2a1a', 'yellow / red'], blue_white: ['#2f5a8a', '#e8e2d0', 'blue / white'], green_white: ['#3a6a4a', '#e8e2d0', 'green / white'], red_white: ['#a8402c', '#efe8d8', 'red / white'] },
  printed: { white_blue: ['#ecebe4', '#1e4a8a', 'white / blue'], white_red: ['#ecebe4', '#b0281e', 'white / red'], yellow_black: ['#e8c02a', '#1e1e1c', 'yellow / black'], red_white: ['#b0281e', '#f2f0ea', 'red / white'], green_white: ['#1e6a3a', '#f2f0ea', 'green / white'], blue_white: ['#1e4a8a', '#f2f0ea', 'blue / white'], black_yellow: ['#2a2a28', '#e0b030', 'black / yellow'] },
  neon: { pink: ['#1a1c20', '#ff70c0', 'pink'], red: ['#1a1c20', '#ff4060', 'red'], blue: ['#1a1c20', '#40a0ff', 'blue'], green: ['#1a1c20', '#60ff80', 'green'], yellow: ['#1a1c20', '#ffd040', 'yellow'], white: ['#1a1c20', '#f0f0ff', 'white'] },
};
const STYLES = {
  painted: { bg: ['#d8cbb0', '#cfc2a2', '#bfb59a', '#c9b48a'], fg: ['#7a2a1e', '#2c3a4a', '#3a2a1e', '#8a3a1a'], board: 0x7a6248, layer: 'wood' },
  prewar:  { bg: ['#e8e2d4', '#d9d2c0'], fg: ['#2a5f7a', '#a83a2a', '#2f6a3a'], board: 0x8c9294, layer: 'metal' },
  metal:   { bg: ['#8e959a', '#7d878c'], fg: ['#e8e2d0', '#1e2224'], board: 0x5a5c5e, layer: 'metal' },
  neon:    { bg: ['#1a1c20'], fg: ['#ff4060', '#40a0ff', '#60ff80', '#ff70c0', '#ffd040'], board: 0x2a2c30, layer: 'metal' },
  wall:    { bg: [null], fg: ['#7a2a1e', '#2c3a4a', '#1e3a2a', '#8a3a1a', '#2a2a2a', '#1a4a6a'], board: null, layer: 'plaster' }, // painted straight on the wall
  hermandad: { bg: ['#2a2a28', '#2e2d2a'], fg: ['#e0b030'], board: 0x2a2a28, layer: 'metal' }, // Hermandad del Camino: black board, yellow stencil
  printed: { bg: ['#ecebe4'], fg: ['#1e4a8a'], board: 0xb8bcbc, layer: 'metal' }, // pre-war printed plastic / enamel: flat colours, no brush
  chalk:   { bg: ['#23302a', '#2a2a28'], fg: ['#e8e4d8'], board: 0x5e4a38, layer: 'wood' },
};

export function makeSign(text, w, h, style = 'painted', rng = new RNG(text), opts = {}) {
  const st = STYLES[style] || STYLES.painted;
  const pxPerM = 160;
  const cw = Math.max(64, Math.round(w * pxPerM)), ch = Math.max(32, Math.round(h * pxPerM));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  const bg0 = opts.bg || rng.pick(st.bg);
  if (bg0) { g.fillStyle = bg0; g.fillRect(0, 0, cw, ch); }
  if (style !== 'neon' && style !== 'wall') for (let i = 0; i < (opts.rust ? 90 : style === 'printed' ? 8 : 40); i++) {
    g.fillStyle = `rgba(${rng.int(60, 120)},${rng.int(50, 90)},${rng.int(30, 60)},${rng.range(0.03, 0.12)})`;
    g.fillRect(rng.range(0, cw), rng.range(0, ch), rng.range(4, cw * 0.3), rng.range(2, ch * 0.2));
  }
  const fg = opts.color || rng.pick(st.fg);
  let lines = String(text).split('\n');
  if (opts.missing) lines = lines.map((l) => l.split('').map((ch2) => (ch2 !== ' ' && rng.chance(opts.missing) ? ' ' : ch2)).join(''));
  let size = ch / (lines.length * 1.35);
  const font = (sz) => `bold ${sz}px ${style === 'neon' || style === 'chalk' ? '"Brush Script MT", "Segoe Script", cursive' : '"Arial Black", Impact, "Helvetica Neue", sans-serif'}`;
  g.font = font(size);
  const maxW = Math.max(...lines.map((l) => g.measureText(l).width));
  if (maxW > cw * 0.9) { size *= (cw * 0.9) / maxW; g.font = font(size); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.save();
    const jit = style === 'printed' ? 0 : 1;
    g.translate(cw / 2 + rng.range(-3, 3) * jit, (ch * (i + 0.5)) / lines.length + rng.range(-2, 2) * jit);
    g.rotate(rng.range(-0.015, 0.015) * jit);
    if (style === 'neon') {
      g.shadowColor = fg; g.shadowBlur = 18;
      g.strokeStyle = fg; g.lineWidth = Math.max(3, size * 0.09);
      g.strokeText(l, 0, 0);
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(l, 0, 0);
    } else { g.fillStyle = fg; if (style === 'wall' || style === 'chalk') g.globalAlpha = style === 'chalk' ? 0.85 : 0.92; g.fillText(l, 0, 0); g.globalAlpha = 1; }
    g.restore();
  });
  if (style === 'wall') { // sun-faded, flaking letters: knock holes into the paint
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.3, 0.9)})`; g.beginPath(); g.arc(rng.range(0, cw), rng.range(0, ch), rng.range(1, 6), 0, Math.PI * 2); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  }
  if (style !== 'neon' && style !== 'wall') for (let i = 0; i < (opts.rust ? 60 : style === 'printed' ? 6 : 25); i++) {
    g.fillStyle = `rgba(150,130,100,${rng.range(0.2, 0.5)})`;
    g.beginPath(); g.arc(rng.range(0, cw), rng.range(0, ch), rng.range(1, 5), 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const grp = new THREE.Group();
  const fg2 = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w)), 1);
  fg2.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(fg2.attributes.position.count * 3).fill(1), 3));
  const face = new THREE.Mesh(fg2, mapMaterial(tex, style === 'neon' ? opts.r ?? -0.5 : null));
  face.position.z = st.board == null ? 0.004 : 0.03;
  grp.add(face);
  if (opts.twoSided) { const back = new THREE.Mesh(fg2, face.material); back.position.z = -face.position.z; back.rotation.y = Math.PI; grp.add(back); } // a blade sign reads from both ways
  if (st.board != null) {
    const b = new Builder();
    b.t(st.layer).box(0, 0, 0, w + 0.08, h + 0.08, 0.05, opts.board ?? st.board);
    const bg = b.build({ maxEdge: 3 }).main;
    bg.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(bg.attributes.position.count * 3).fill(1), 3));
    grp.add(new THREE.Mesh(bg, MATS.main));
  }
  grp.rotation.z = style === 'wall' || style === 'printed' || opts.level ? 0 : rng.range(-0.02, 0.02) + (opts.missing ? rng.range(-0.05, 0.05) : 0);
  grp.userData.neonColor = style === 'neon' ? fg : null;
  return grp;
}

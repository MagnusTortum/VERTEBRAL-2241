// Map highlights for the editor: thick terminal-green lines with a dark underlay (readable on any ground).
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';

export const HI = { green: 0x3dff7a, bright: 0xb8ffd0, red: 0xff5a4d, amber: 0xffb347 };
// a line style: px width, colour, opacity; `under` is the dark outline drawn first
export function lineStyle(color, width = 2.5, opacity = 1) {
  const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthTest: false, depthWrite: false });
  m.under = new LineMaterial({ color: 0x000000, linewidth: width + 3, transparent: true, opacity: 0.5 * opacity, depthTest: false, depthWrite: false });
  return m;
}
// flat [x,y,z,...] positions -> two Line2 objects (outline + line) added to `parent`
export function fatLine(parent, pos, mat, order = 998) {
  if (pos.length < 6) return null;
  const g = new LineGeometry(); g.setPositions(pos);
  const out = [];
  for (const [m, ro] of [[mat.under, order - 1], [mat, order]]) {
    if (!m) continue;
    const l = new Line2(g, m); l.renderOrder = ro; l.frustumCulled = false; parent.add(l); out.push(l);
  }
  return out;
}
// a fixed-size loop updated in place (the brush ring): set(posFlat) rewrites the segment buffer
export function liveLoop(parent, n, mat, order = 999) {
  const pos = new Float32Array((n + 1) * 3);
  const g = new LineGeometry(); g.setPositions(pos);
  const objs = [[mat.under, order - 1], [mat, order]].map(([m, ro]) => { const l = new Line2(g, m); l.renderOrder = ro; l.frustumCulled = false; l.visible = false; parent.add(l); return l; });
  const ib = g.attributes.instanceStart.data;
  return {
    get visible() { return objs[1].visible; },
    set visible(v) { for (const o of objs) o.visible = v; },
    set(p) { // p: (n+1)*3 floats
      const a = ib.array;
      for (let i = 0; i < n; i++) { a.set(p.subarray(i * 3, i * 3 + 3), i * 6); a.set(p.subarray(i * 3 + 3, i * 3 + 6), i * 6 + 3); }
      ib.needsUpdate = true;
    },
  };
}

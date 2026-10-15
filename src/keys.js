// Key bindings: defaults + the player's own (Settings › Controls), kept in the browser.
const LS = 'baja-mapgen:keys';
export const ACTIONS = [
  ['build', 'Build / Explore', 'b'],
  ['shot', 'Screenshot (max quality)', 'F8'],
  ['rotL', 'Rotate view left', 'q'],
  ['rotR', 'Rotate view right', 'e'],
  ['reset', 'Reset view', ''], // unbound: R turns the selection
  ['free', 'Free camera', 'f'],
  ['walk', 'Walk mode (leaves Build)', '-'],
  ['labels', 'Labels', 'l'],
];
// shown in the list, not rebindable
export const FIXED = [['Undo / Redo', ['Ctrl Z', 'Ctrl ⇧ Z']], ['Delete', ['Del']], ['Turn selected / placing', ['R']], ['Dock tabs (Roads, Zones, Buildings…)', ['1–9']], ['Recent', ['0']], ['Brush size', ['[', ']']], ['Snap off (hold)', ['Alt']], ['Snap offset', ['⇧ Wheel']], ['Search build menu', ['/']], ['Back / menu', ['Esc']]];
const norm = (k) => (k && k.length === 1 ? k.toLowerCase() : k);
let map = {};
try { map = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { map = {}; }
export const keyOf = (a) => map[a] || ACTIONS.find((x) => x[0] === a)?.[2];
export const isKey = (e, a) => !e.ctrlKey && !e.metaKey && !e.altKey && norm(e.key) === norm(keyOf(a));
export function setKey(a, k) {
  if (k == null) delete map[a];
  else { for (const [o] of ACTIONS) if (o !== a && norm(keyOf(o)) === norm(k)) map[o] = keyOf(a); map[a] = k; } // a clash swaps the two
  try { localStorage.setItem(LS, JSON.stringify(map)); } catch { /* no storage */ }
}
export const keyLabel = (k) => (k === ' ' ? 'Space' : k && k.length === 1 ? k.toUpperCase() : k || '—');

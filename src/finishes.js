// Finishes: whether a building got a coat of wash, paint, decoration or a showpiece facade.
// Rolled per building from the settlement's Wealth / TL / Appearance (City Stats) and the
// building's importance; canon or landmark buildings set `finish` explicitly.
import { clamp } from './rng.js';

// soft chance multipliers (not the B25 wealth multipliers themselves — those scale money, not paint)
const WEALTH = { dead_broke: 0.15, poor: 0.4, struggling: 0.65, average: 1, comfortable: 1.3, wealthy: 1.65, very_wealthy: 1.9, filthy_rich: 2.2 };
export const IMPORTANCE = {
  chapel: 1.0, hall: 0.9, tower: 0.55, cantina: 0.7, office: 0.6, shop: 0.55, kiosk: 0.4, house: 0.4, shelter: 0.35,
  workshop: 0.28, garage: 0.25, shack: 0.02, guardpost: 0.05, bunker: 0.02, barracks: 0.1, armory: 0.08, warehouse: 0.18, barn: 0.12, shed: 0.05, outhouse: 0.02, ruin: 0, canopy: 0,
};
export const TIERS = ['none', 'wash', 'painted', 'decorated', 'ornate', 'showpiece'];
// decorated = simple decoration; ornate = maximalist (plants everywhere, murals, papel picado); showpiece = the best of it, in the best materials
export const TIER_RANK = { none: 0, faded: 0, wash: 1, painted: 2, decorated: 3, ornate: 4, showpiece: 5 };

const BODY = [0xe6dcc4, 0xd2a65e, 0xb87458, 0x8aa4b4, 0xa6b08a, 0xcf9f92, 0xd9c39c, 0xa9c2ae, 0xc9b48e];
const TRIM = [0x3f5f6a, 0x7a3f3f, 0x5f7f5a, 0x6e5a44, 0xa07a3a, 0x2f4a6a, 0xe6dcc4, 0x8a4a3a];
const BAND = [0x7a3f3f, 0x3f5f6a, 0x6e5a44, 0x5f7f5a, 0xa8553a, 0x4a4a52];
const WASH = [0xd9d0bc, 0xd4cab4, 0xdcd4c2];
const MURALS = ['landscape', 'geometric', 'sea', 'saint'];

export function settlementOf(spec) {
  const s = spec.settlement || {};
  return {
    tl: s.tl ?? 5,
    wealth: s.wealth || 'average',
    appearance: s.appearance ?? 0, // reaction modifier from City Stats Appearance (B21 scale)
    power: s.power || 'scarce', // none | scarce | some | grid
  };
}

export function finishChance(s, st) {
  const imp = s.importance ?? IMPORTANCE[s.kind] ?? 0.3;
  const W = WEALTH[st.wealth] ?? 1;
  const A = 1 + 0.12 * st.appearance;
  const T = clamp(0.75 + 0.12 * (st.tl - 4), 0.5, 1.4);
  return { imp, k: W * A * T, p: clamp((0.18 + 0.7 * imp) * W * A * T, 0, 0.97) };
}

export function rollFinish(s, st, rng) {
  const r = rng.fork('finish');
  const origin = s.origin || 'new';
  let tier;
  if (s.finish) tier = typeof s.finish === 'string' ? s.finish : s.finish.tier;
  else if (origin === 'ruin' || origin === 'stripped') tier = r.chance(0.45) ? 'faded' : 'none';
  else {
    const { imp, k, p } = finishChance(s, st);
    if (!r.chance(p)) tier = 'none';
    else {
      const score = imp * k * (0.55 + 0.9 * r.next());
      tier = score < 0.28 ? 'wash' : score < 0.62 ? 'painted' : score < 0.88 ? 'decorated' : score < 1.12 ? 'ornate' : 'showpiece';
    }
  }
  const o = typeof s.finish === 'object' ? s.finish : {};
  const f = { tier };
  if (tier === 'none') return f;
  if (tier === 'faded') { f.body = o.body ?? r.pick(BODY); f.patches = 0.35 + r.next() * 0.3; return f; }
  if (tier === 'wash') { f.body = o.body ?? r.pick(WASH); f.flake = 0.15 + r.next() * 0.25; f.trim = o.trim ?? (r.chance(0.5) ? r.pick(TRIM) : null); return f; }
  f.body = o.body ?? r.pick(BODY);
  f.trim = o.trim ?? r.pick(TRIM.filter((t) => t !== f.body));
  f.band = o.band !== undefined ? o.band : r.chance(0.75) ? { hex: r.pick(BAND), h: r.range(0.7, 1.1) } : null;
  if (['decorated', 'ornate', 'showpiece'].includes(tier)) {
    f.border = o.border !== undefined ? o.border : { hex: f.band?.hex ?? r.pick(BAND), h: 0.28 };
    f.surround = o.surround ?? true;
    if (o.wainscot !== undefined ? o.wainscot : tier === 'showpiece' || r.chance(tier === 'ornate' ? 0.35 : 0.15)) { f.wainscot = 'azulejo'; f.band = { hex: 0x808080, h: r.range(0.9, 1.2) }; }
    f.accents = pick4(r); // ornate: every opening its own colour
  }
  if (tier === 'ornate' && (o.mural !== undefined ? o.mural : r.chance(0.6))) f.mural = o.mural || { kind: r.pick(MURALS), palette: [r.pick([0xe6dcc4, 0xd8c8a0, 0x2f4a6a, 0x8aa4b4]), ...pick4(r)] };
  if (tier === 'showpiece') {
    f.mural = o.mural !== undefined ? o.mural : { kind: r.pick(MURALS), palette: [r.pick([0xe6dcc4, 0xd8c8a0, 0x2f4a6a, 0x8aa4b4]), ...pick4(r)] };
  }
  return f;
}
function pick4(r) {
  const pool = [0x2f4a6a, 0xd2a65e, 0xa8553a, 0x5f7f5a, 0xe6dcc4, 0x7a3f3f, 0x8aa4b4, 0xd8b84a];
  return Array.from({ length: 4 }, () => r.pick(pool));
}

export function describeFinish(f) {
  if (!f || f.tier === 'none') return 'Bare';
  const hx = (h) => '#' + h.toString(16).padStart(6, '0');
  if (f.tier === 'faded') return 'Faded remnants of old paint';
  if (f.tier === 'wash') return 'Limewashed';
  if (f.livery === 'hermandad') return `Hermandad del Camino livery (lime white, asphalt-grey base with the yellow road line, yellow trim, black doors)${f.fade ? ', paint ' + { light: 'losing colour', faded: 'faded', gone: 'almost gone' }[f.fade] : ''}`;
  const bits = [{ painted: 'Painted', decorated: 'Painted & decorated', ornate: 'Painted & richly decorated', showpiece: 'Showpiece' }[f.tier]];
  if (f.fade === 'light') bits.push('paint losing colour in places'); else if (f.fade === 'faded') bits.push('paint faded and flaking'); else if (f.fade === 'gone') bits.push('paint almost gone');
  if (f.wainscot) bits.push('tiled wainscot');
  else if (f.band) bits.push('painted base band');
  if (f.border) bits.push('border under the roofline');
  if (f.mural) bits.push(`${f.mural.kind} mural`);
  return bits.join(', ');
}

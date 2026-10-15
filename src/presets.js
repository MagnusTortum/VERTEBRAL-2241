// Time-of-day presets (linear colours). sun.az is a compass bearing (0 = north, 90 = east).
// lights.frac: share of non-essential lights that are on; win: share of inhabited windows lit.
export const PRESETS = [
  {
    id: 'morning', fog: [0.95, 0.70, 0.56], label: 'Morning',
    sun: { az: 100, el: 15, col: [1.0, 0.76, 0.55], k: 2.0 },
    amb: [0.40, 0.46, 0.58], ambK: 0.6, bounce: 0.22,
    sky: { zen: [0.32, 0.47, 0.70], hor: [0.86, 0.80, 0.72], glow: [1.0, 0.70, 0.45] },
    haze: 0.12, sunHaze: 0.75, stars: 0,
    lights: { frac: 0.04, gain: 0.4 }, win: 0.06, exposure: 1.0,
  },
  {
    id: 'noon', fog: [0.86, 0.82, 0.68], label: 'Noon',
    sun: { az: 180, el: 66, col: [1.0, 0.95, 0.86], k: 2.3 },
    amb: [0.46, 0.55, 0.70], ambK: 0.6, bounce: 0.28,
    sky: { zen: [0.25, 0.45, 0.78], hor: [0.80, 0.82, 0.82], glow: [1.0, 0.95, 0.85] },
    haze: 0.05, sunHaze: 0.25, stars: 0,
    lights: { frac: 0, gain: 0 }, win: 0, exposure: 0.95,
  },
  {
    id: 'afternoon', fog: [0.93, 0.78, 0.58], label: 'Afternoon',
    sun: { az: 245, el: 36, col: [1.0, 0.88, 0.72], k: 2.2 },
    amb: [0.44, 0.52, 0.66], ambK: 0.6, bounce: 0.26,
    sky: { zen: [0.27, 0.45, 0.75], hor: [0.84, 0.81, 0.76], glow: [1.0, 0.85, 0.65] },
    haze: 0.07, sunHaze: 0.4, stars: 0,
    lights: { frac: 0, gain: 0 }, win: 0, exposure: 0.95,
  },
  {
    id: 'sunset', fog: [1.0, 0.58, 0.34], label: 'Sunset',
    sun: { az: 288, el: 5, col: [1.0, 0.55, 0.3], k: 2.6 },
    amb: [0.40, 0.38, 0.52], ambK: 0.55, bounce: 0.2,
    sky: { zen: [0.22, 0.28, 0.50], hor: [0.88, 0.66, 0.52], glow: [1.0, 0.55, 0.25] },
    haze: 0.11, sunHaze: 0.95, stars: 0,
    lights: { frac: 0.3, gain: 0.55 }, win: 0.22, exposure: 1.0,
  },
  {
    id: 'twilight', fog: [0.52, 0.40, 0.56], label: 'Twilight',
    sun: { az: 292, el: 9, col: [0.55, 0.48, 0.70], k: 0.35 },
    amb: [0.24, 0.27, 0.45], ambK: 0.62, bounce: 0.08,
    sky: { zen: [0.08, 0.10, 0.25], hor: [0.48, 0.40, 0.50], glow: [0.95, 0.50, 0.35] },
    haze: 0.11, sunHaze: 1.0, stars: 0.35, sunHidden: true,
    lights: { frac: 0.75, gain: 0.85 }, win: 0.6, exposure: 1.45,
  },
  {
    id: 'night', fog: [0.036, 0.062, 0.088], label: 'Night',
    sun: { az: 140, el: 48, col: [0.55, 0.66, 0.95], k: 0.128 },
    amb: [0.040, 0.050, 0.104], ambK: 0.5, bounce: 0.015,
    sky: { zen: [0.006, 0.009, 0.024], hor: [0.036, 0.044, 0.070], glow: [0.5, 0.55, 0.7] },
    haze: 0.18, sunHaze: 0.2, stars: 1, moon: true,
    lights: { frac: 1, gain: 1 }, win: 0.55, exposure: 1.1,
  },
  {
    id: 'dead', fog: [0.022, 0.034, 0.056], label: 'Dead of Night',
    sun: { az: 215, el: 30, col: [0.50, 0.60, 0.92], k: 0.104 },
    amb: [0.034, 0.044, 0.092], ambK: 0.45, bounce: 0.008,
    sky: { zen: [0.004, 0.006, 0.017], hor: [0.026, 0.031, 0.052], glow: [0.45, 0.5, 0.65] },
    haze: 0.2, sunHaze: 0.2, stars: 1, moon: true,
    lights: { frac: 0.04, gain: 1 }, win: 0.03, exposure: 1.15,
  },
];
export const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

// smooth time of day: keyframe hours for the presets; presetAtHour blends the two around h (0..24)
export const TOD_KEYS = [[3, 'dead'], [6.75, 'morning'], [12.5, 'noon'], [16, 'afternoon'], [19, 'sunset'], [19.75, 'twilight'], [22, 'night'], [27, 'dead']];
export const presetHour = (id) => (TOD_KEYS.find((k) => k[1] === id) || [16])[0] % 24;
const lerpAny = (a, b, t, key) => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (key === 'az') { let d = ((b - a + 540) % 360) - 180; return a + d * t; }
    return a + (b - a) * t;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerpAny(x, b[i], t));
  if (a && b && typeof a === 'object' && typeof b === 'object') { const o = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = k in a && k in b ? lerpAny(a[k], b[k], t, k) : (t < 0.5 ? a[k] : b[k]) ?? a[k] ?? b[k]; return o; }
  return t < 0.5 ? a : b;
};
const SUN_RISE = 6.0, SUN_SET = 19.45, MOON_COL = [0.55, 0.66, 0.95];
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerpKeys = (keys, h, f) => { if (h <= keys[0][0]) return f(keys[0][1], keys[0][1], 0); for (let i = 0; i < keys.length - 1; i++) if (h <= keys[i + 1][0]) return f(keys[i][1], keys[i + 1][1], smooth01((h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))); const L = keys[keys.length - 1][1]; return f(L, L, 0); };
// the sun's path from the day keyframes, pinned to the horizon at sunrise / sunset; null when it is down
function sunPath(h) {
  if (h < SUN_RISE || h > SUN_SET) return null;
  const K = [[SUN_RISE, { az: 95, el: 0 }], [6.75, PRESET.morning.sun], [12.5, PRESET.noon.sun], [16, PRESET.afternoon.sun], [19, PRESET.sunset.sun], [SUN_SET, { az: 292, el: 0 }]];
  return lerpKeys(K, h, (a, b, t) => ({ az: a.az + (b.az - a.az) * t, el: a.el + (b.el - a.el) * t }));
}
// daylight colour and strength from the day keyframes only (night presets carry moonlight)
function dayLight(h) {
  const K = [[6.75, PRESET.morning.sun], [12.5, PRESET.noon.sun], [16, PRESET.afternoon.sun], [19, PRESET.sunset.sun]];
  return lerpKeys(K, h, (a, b, t) => ({ k: a.k + (b.k - a.k) * t, col: a.col.map((c, i) => c + (b.col[i] - c) * t) }));
}
// moonlight: fades in after twilight (19:55 -> 21:00), full through the night, fades out before dawn (4:30 -> 5:40)
function moonK(h) { const hh = h < 12 ? h + 24 : h; return smooth01((hh - 19.9) / 1.1) * (1 - smooth01((hh - 28.5) / 1.15)); }
function moonPath(h) {
  const hh = h < 12 ? h + 24 : h;
  return lerpKeys([[19.9, { az: 115, el: 22 }], [22, PRESET.night.sun], [27, PRESET.dead.sun], [29.7, { az: 245, el: 18 }]], hh, (a, b, t) => ({ az: a.az + (b.az - a.az) * t, el: a.el + (b.el - a.el) * t }));
}
export function presetAtHour(h) {
  h = ((h % 24) + 24) % 24; const hh = h < TOD_KEYS[0][0] ? h + 24 : h;
  let i = 0; while (i < TOD_KEYS.length - 2 && hh >= TOD_KEYS[i + 1][0]) i++;
  const [h0, a] = TOD_KEYS[i], [h1, b] = TOD_KEYS[i + 1], t = Math.min(1, Math.max(0, (hh - h0) / (h1 - h0)));
  const ts = t * t * (3 - 2 * t), A = PRESET[a], B = PRESET[b];
  const p = lerpAny(A, B, ts);
  // sun and moon run on their own clocks: the sun rises / sets at SUN_RISE / SUN_SET and fades its light (and
  // shadows) out as it nears the horizon; after dusk there is a gap with no direct light, then the moon fades in
  // (twilight -> night) and fades out again before dawn. The one directional light is whichever is up.
  const sun = sunPath(h);
  if (sun) {
    const day = dayLight(h), k = day.k * smooth01(sun.el / 7);
    p.sun = { ...p.sun, az: sun.az, el: Math.max(0.5, sun.el), col: day.col, k };
    p.moon = false; p.sunHidden = sun.el < 0.4;
  } else {
    const mk = moonK(h), m = moonPath(h);
    if (mk > 0.01) { p.sun = { ...p.sun, az: m.az, el: m.el, col: MOON_COL, k: 0.08 * mk }; p.moon = true; p.sunHidden = false; p.moonK = mk; }
    else { p.sun = { ...p.sun, az: h > 12 ? 292 : 95, el: -3, k: 0 }; p.moon = false; p.sunHidden = true; }
  }
  const hm = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
  return { ...p, id: ts < 0.5 ? a : b, key: `h${h.toFixed(2)}`, label: hm, hour: h };
}

// weather over a time-of-day preset: 'sunny' (as is) | 'overcast' — the sun goes behind a grey deck:
// direct light drops to a faint diffuse share, the sky fills the shadows, sky and fog turn grey, more haze
// weather over a time-of-day preset:
//   sunny    — as is (fair-weather cumulus, cloud shadows)
//   overcast — the sun behind a grey deck: no direct light, the sky fills the shadows
//   marine   — Pacific-slope marine layer: low grey-white fog, a pale disc of sun, soft shadows, short sight lines
//   dust     — desert dust storm: brown-orange fog, a dim copper sun, blowing sand
//   rain     — overcast with rain streaks, wet darkened surfaces and puddles
// fogNear = fog that starts right at the viewer (iso views have no depth to build haze over); wet = 0..1
export const WEATHER = { sunny: 'Sunny', overcast: 'Overcast', dust: 'Dust storm', rain: 'Rain' }; // (marine fog is now the Haze slider)
// haze 0..1 over any weather: aerial haze that grows with distance (nothing extra up close), greying toward a
// pale marine-layer white as it thickens; the sun dims and spreads, the sky fills the shadows. Light halos and
// lamp cones scale with it (hazeK).
export function withHaze(p, h) {
  h = Math.max(0, Math.min(1, h ?? 0.3));
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t), lum = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  const night = !!p.moon || p.sun.el < 0 || p.sunHidden, L = Math.max(0.05, lum(p.sky.hor)), white = [0.97, 0.99, 1.02].map((t) => t * L);
  const k = Math.max(0, h - 0.3) / 0.7; // above the default: thicker, whiter, dimmer sun
  const fog = p.fog ? mix(p.fog, white, k * 0.7) : p.fog;
  return {
    ...p, key: `${p.key || p.id}:hz${h.toFixed(2)}`, hazeK: h,
    haze: p.haze * (0.35 + h * 2.2) + k * 0.25, sunHaze: Math.max(p.sunHaze ?? 0, k),
    sun: { ...p.sun, k: p.sun.k * (1 - 0.6 * k) }, ambK: p.ambK * (1 + (night ? 0.15 : 1.1) * k),
    sky: { ...p.sky, hor: mix(p.sky.hor, white, k * 0.75), zen: mix(p.sky.zen, white.map((c) => c * 0.92), k * 0.55) },
    fog, clouds: (p.clouds ?? 0.35) * (1 - 0.8 * k),
  };
}
export function withWeather(p, w) {
  if (!w || w === 'sunny' || !WEATHER[w]) return p;
  const lum = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15, mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const L = Math.max(0.05, lum(p.sky.hor)), night = !!p.moon || p.sun.el < 0 || p.sunHidden;
  const grey = (k, tint = [1, 1, 1.03]) => tint.map((t) => L * k * t);
  const key = `${p.key || p.id}:${w}`;
  const lightsUp = { lights: { frac: Math.min(1, p.lights.frac + (night ? 0 : 0.03)), gain: p.lights.gain }, win: Math.min(1, p.win + (night ? 0 : 0.04)) };
  if (w === 'marine') return p; // old saves: marine fog is the Haze slider now
  if (w === 'marine_old') {
    const fogC = grey(1.0, [0.97, 0.99, 1.02]);
    return {
      ...p, weather: w, key, aoPow: 1.7, clouds: 0,
      sun: { ...p.sun, col: mix(p.sun.col, [1, 0.97, 0.92], 0.6), k: p.sun.k * 0.32 },
      amb: mix(p.amb, grey(0.85), 0.6), ambK: p.ambK * (night ? 1.15 : 2.3), bounce: p.bounce * 0.5,
      sky: { zen: mix(p.sky.zen, grey(0.9), 0.85), hor: mix(p.sky.hor, fogC, 0.9), glow: mix(p.sky.glow, grey(1.1), 0.7) },
      fog: fogC, haze: p.haze * 2.5 + 0.2, sunHaze: 1, fogNear: 0.42, cloudGrey: 0.85, ...lightsUp,
    };
  }
  if (w === 'dust') {
    const dustC = night ? grey(0.9, [1.1, 0.95, 0.8]) : [0.72, 0.52, 0.34].map((c) => c * Math.min(1.1, L * 1.25 + 0.15));
    return {
      ...p, weather: w, key, aoPow: 1.8, clouds: 0,
      sun: { ...p.sun, col: [1.0, 0.62, 0.36], k: p.sun.k * 0.45 },
      amb: mix(p.amb, dustC, 0.55), ambK: p.ambK * (night ? 1.1 : 1.9), bounce: p.bounce * 0.6,
      sky: { zen: mix(p.sky.zen, dustC.map((c) => c * 0.85), 0.85), hor: mix(p.sky.hor, dustC, 0.92), glow: mix(p.sky.glow, [1.0, 0.6, 0.3], 0.6) },
      fog: dustC, haze: p.haze * 2.5 + 0.22, sunHaze: 1, fogNear: 0.36, cloudGrey: 0.6, dust: 1, ...lightsUp,
    };
  }
  // overcast and rain: the sun is behind the cloud deck, no direct light, no cast shadows
  const rain = w === 'rain', k = rain ? 0.82 : 1;
  return {
    ...p, overcast: true, weather: w, key, aoPow: 2.2, clouds: 0,
    sun: { ...p.sun, col: [0.92, 0.93, 0.95], k: 0 },
    amb: mix(p.amb, grey(0.8 * k), 0.75), ambK: p.ambK * (night ? 1.25 : 3.4) * k, bounce: 0,
    sky: { zen: mix(p.sky.zen, grey(0.78 * k), 0.85), hor: mix(p.sky.hor, grey(0.92 * k), 0.85), glow: mix(p.sky.glow, grey(0.9 * k), 0.9) },
    fog: p.fog ? mix(p.fog, grey(0.95 * k), 0.75) : p.fog,
    haze: p.haze * (rain ? 2.2 : 1.6) + (rain ? 0.12 : 0.07), sunHaze: 0, fogNear: rain ? 0.14 : 0, wet: rain ? 1 : 0, rain: rain ? 1 : 0,
    ...lightsUp, exposure: p.exposure,
  };
}

// light colours (linear)
export const LIGHT_COL = {
  fire: [1.0, 0.52, 0.2], oil: [1.0, 0.66, 0.32], incandescent: [1.0, 0.75, 0.45], sodium: [1.0, 0.6, 0.25],
  mercury: [0.65, 0.85, 1.0], cool: [0.7, 0.9, 1.0], window: [1.0, 0.62, 0.3],
  neon_red: [1.0, 0.2, 0.25], neon_blue: [0.3, 0.6, 1.0], neon_green: [0.35, 1.0, 0.45], neon_pink: [1.0, 0.35, 0.75], neon_yellow: [1.0, 0.85, 0.3],
};

export function sunDir(p) {
  const az = (p.sun.az * Math.PI) / 180, el = (p.sun.el * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

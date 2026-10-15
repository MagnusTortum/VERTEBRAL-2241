// Prop pass 12: what fills the gaps between buildings (gaps.js). Coordinates come in prop-local (rot 0); heights are
// relative to the ground at the prop's anchor.
import { col } from './builder.js';
import { WOOD, METAL, ROOF } from './palette.js';

const MAT = { adobe: ['adobe', [0xa88a68, 0x9e8262, 0xb0916e]], brick: ['brick', [0x9e735d, 0x946a56]], stone: ['stone', [0x9a9080, 0x8e8676]], fieldstone: ['stone', [0x9a9080, 0x8e8676]] };
const fillOf = (m, r) => { const [t, cs] = MAT[m] || (r.chance(0.5) ? ['block', [0xa8a49a, 0x9c988e, 0xb0aaa0]] : ['plaster', [0xb8ae9c, 0xaaa290, 0xc0b6a4]]); return [t, col(r.pick(cs), 0.04, r)]; };
const ccw = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], w = p[(i + 1) % p.length]; a += q[0] * w[1] - w[0] * q[1]; } return a < 0 ? p.slice().reverse() : p; };

export function addGapProps(P, DEF_LAYER) {
  const L = (k, v) => (DEF_LAYER[k] = v);

  // a solid wedge between two walls: packed and plastered, a darker cap on top
  P.gap_fill = (b, r, o) => {
    const poly = ccw(o.poly || []), y0 = o.y0 ?? -0.4, y1 = o.y1 ?? 3; if (poly.length < 3) return {};
    const [t, c] = fillOf(o.mat, r);
    b.t(t).extrude(poly, y0, y1 - 0.08, c, c);
    b.t('concrete').extrude(poly, y1 - 0.08, y1, col(0x8a857a, 0.04, r), col(0x8a857a, 0.04, r)); // the cap
    return {};
  };
  L('gap_fill', 'block');

  // a covered slot: a tin roof wall to wall, the open ends closed with a short wall or a tin sheet, a door on one
  P.gap_roof = (b, r, o) => {
    const roof = o.roof || [], y = o.y ?? 2.7, y0 = o.y0 ?? -0.3; if (roof.length < 4) return {};
    const tc = col(r.pick(ROOF.corrugated), 0.06, r);
    b.t('corrugated'); const R = roof.map(([x, z]) => [x, y, z]), Rb = roof.map(([x, z]) => [x, y - 0.03, z]);
    b.quad(R[0], R[1], R[2], R[3], tc).quad(Rb[3], Rb[2], Rb[1], Rb[0], tc.clone().offsetHSL(0, 0, -0.06));
    // weights on the tin: a few bricks, a tyre
    b.t('brick'); for (let k = 0; k < r.int(1, 3); k++) { const f = r.range(0.2, 0.8), g = r.range(0.3, 0.7), x = (R[0][0] + (R[1][0] - R[0][0]) * f) * (1 - g) + (R[3][0] + (R[2][0] - R[3][0]) * f) * g, z = (R[0][2] + (R[1][2] - R[0][2]) * f) * (1 - g) + (R[3][2] + (R[2][2] - R[3][2]) * f) * g; b.box(x, y + 0.04, z, 0.22, 0.07, 0.11, col(0x9e735d, 0.05, r), r.range(0, 3)); }
    const [ft, fc] = fillOf(o.mat, r);
    for (const e of o.closes || []) {
      const [ax, az] = e.a, [bx, bz] = e.b, dx = bx - ax, dz = bz - az, Ln = Math.hypot(dx, dz); if (Ln < 0.2) continue;
      const ry = Math.atan2(dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2, H = y - y0;
      if (e.tin) b.t('corrugated').box(mx, y0 + H / 2, mz, 0.04, H, Ln, col(r.pick([0x8a8780, 0x7c7a74, 0x76624e]), 0.05, r), ry);
      else b.t(ft).box(mx, y0 + H / 2, mz, 0.15, H, Ln, fc, ry);
      if (e.door) { const dw = Math.min(0.85, Ln - 0.15), wood = r.chance(0.5); b.t(wood ? 'wood' : 'corrugated').box(mx, 0.98, mz, e.tin ? 0.07 : 0.19, 1.95, dw, wood ? col(r.pick([WOOD.weathered, WOOD.dark]), 0.06, r) : col(r.pick([METAL.rust, 0x6a6c6e, 0x5a6a5a]), 0.06, r), ry); }
    }
    return {};
  };
  L('gap_roof', 'corrugated');

  // a scrap lean-to in a wider gap (gaps.js, poor streets): one sloping sheet of tin weighted with rocks and tyres,
  // the street end made of odd panels (tin, pallet, plywood, a bedsheet) round a curtain or plank door — or left open
  // with junk in it — the back end walled in tin
  P.gap_shack = (b, r, o) => {
    const R = o.roof || [], y0 = o.y0 ?? -0.3; if (R.length < 4) return {};
    const tc = () => col(r.pick([...ROOF.corrugated, METAL.rust, 0x76624e, 0x6a6c6e]), 0.06, r);
    // the roof in two or three sheets that don't quite match
    const ns = r.int(2, 3); b.t('corrugated');
    for (let k = 0; k < ns; k++) { const f0 = k / ns - (k ? 0.04 : 0), f1 = (k + 1) / ns, L = (A, B, f) => A.map((v, i) => v + (B[i] - v) * f);
      const q = [L(R[0], R[1], f0), L(R[0], R[1], f1), L(R[3], R[2], f1), L(R[3], R[2], f0)].map((v, i) => [v[0], v[2] + 0.015 * k, v[1]]), c = tc();
      b.quad(q[0], q[1], q[2], q[3], c).quad([q[3][0], q[3][1] - 0.03, q[3][2]], [q[2][0], q[2][1] - 0.03, q[2][2]], [q[1][0], q[1][1] - 0.03, q[1][2]], [q[0][0], q[0][1] - 0.03, q[0][2]], c.clone().offsetHSL(0, 0, -0.06)); }
    for (let k = 0; k < r.int(2, 4); k++) { const f = r.range(0.15, 0.85), g2 = r.range(0.2, 0.8), P0 = R[0].map((v, i) => v + (R[1][i] - v) * f), P1 = R[3].map((v, i) => v + (R[2][i] - v) * f), x = P0[0] + (P1[0] - P0[0]) * g2, z = P0[1] + (P1[1] - P0[1]) * g2, yy = P0[2] + (P1[2] - P0[2]) * g2;
      if (r.chance(0.35)) b.t('plain').cyl(x, yy + 0.1, z, 0.3, 0.3, 0.18, 10, col(0x262626)); else b.t('rock').blob(x, yy + 0.1, z, 0.22, 0.15, 0.2, col(0x8a8070, 0.08, r), 'dodec'); }
    const PANEL = () => r.weighted({ tin: 3, pallet: 2, ply: 1.5, sheet: 0.7, door: 0.4 });
    const panels = (e, yTop, gapAt) => { // fill a cross-wall a→b with panels of odd width, leaving [g0,g1] (along it, 0..1) open
      const [ax, az] = e.a, [bx, bz] = e.b, dx = bx - ax, dz = bz - az, Ln = Math.hypot(dx, dz); if (Ln < 0.3) return; const ry = Math.atan2(dx, dz);
      let t = 0; while (t < Ln - 0.05) { const w = Math.min(Ln - t, r.range(0.5, 1.0)), m = t + w / 2; t += w;
        if (gapAt && m / Ln > gapAt[0] && m / Ln < gapAt[1]) continue;
        const x = ax + dx * (m / Ln), z = az + dz * (m / Ln), H = yTop - y0 - r.range(0, 0.25), k = PANEL();
        if (k === 'tin') b.t('corrugated').box(x, y0 + H / 2, z, 0.03, H, w, tc(), ry, r.range(-0.03, 0.03));
        else if (k === 'pallet') { b.t('wood'); for (let s2 = 0; s2 < 5; s2++) b.box(x, y0 + 0.4 + s2 * (H - 0.5) / 4, z, 0.04, 0.1, w, col(r.pick([WOOD.weathered, 0x9a7a52]), 0.06, r), ry); b.box(x, y0 + H / 2, z, 0.05, H, 0.08, col(WOOD.weathered, 0.05, r), ry); }
        else if (k === 'ply') b.t('wood').box(x, y0 + H / 2, z, 0.025, H, w, col(r.pick([0xa88a5a, 0x8a7a5a, 0x6a6a5a]), 0.06, r), ry);
        else if (k === 'sheet') b.t('fabric').box(x, y0 + H / 2 + 0.1, z, 0.01, H - 0.2, w, col(r.pick([0x7a8aa0, 0xc8b898, 0x9a5a4a, 0x6a7a5a]), 0.05, r), ry);
        else b.t('wood').box(x, y0 + Math.min(H, 2.3) / 2, z, 0.05, Math.min(H, 2.3), w, col(r.pick([0x5a7a8a, 0x8a3a2a, 0xc8b898]), 0.06, r), ry); // an old door laid in as a panel
      }
      return { ry, Ln, ax, az, dx, dz };
    };
    const yF = Math.min(R[0][2], R[3][2]) - 0.05, yB = Math.min(R[1][2], R[2][2]) - 0.05;
    panels(o.back, yB);
    const f = o.front;
    if (f.open) { // open front: a post at the corner, junk under the roof
      const [x, z] = o.inside; b.t('wood').cyl(f.b[0], y0 + (yF - y0) / 2, f.b[1], 0.05, 0.06, yF - y0, 5, col(WOOD.pole, 0.05, r));
      b.t('rust').cyl(x, 0.45, z, 0.29, 0.29, 0.9, 10, col(r.pick([METAL.rust, 0x2f5a8a, 0x6a6a68]), 0.06, r));
      b.t('plain'); for (let k = 0; k < r.int(1, 3); k++) b.cyl(x + r.range(-0.6, 0.6), 0.11, z + r.range(-0.6, 0.6), 0.3, 0.3, 0.22, 10, col(0x262626));
      b.t('wood').box(x + r.range(-0.4, 0.4), 0.2, z + r.range(-0.4, 0.4), 0.5, 0.4, 0.38, col(WOOD.weathered, 0.06, r), r.range(0, 3));
    } else {
      const E = panels(f, yF, [0.3, 0.7]);
      if (E) { const x = E.ax + E.dx / 2, z = E.az + E.dz / 2, w = Math.min(0.85, E.Ln * 0.4);
        if (f.door === 'curtain') b.t('fabric').box(x, y0 + (2.0 - y0) / 2 + 0.05, z, 0.01, 2.0 - y0 - 0.1, w, col(r.pick([0xb83a2a, 0x3a6a8a, 0xd8b030, 0x8a5a9a, 0x5a8a5a]), 0.06, r), E.ry);
        else if (f.door === 'planks') { b.t('wood'); for (let k = 0; k < 4; k++) b.box(x, 1.0, z, 0.04, 2.0, w / 4 - 0.01, col(r.pick([WOOD.weathered, WOOD.dark, 0x9a7a52]), 0.06, r), E.ry); }
        else b.t('corrugated').box(x, 1.0, z, 0.04, 2.0, w, tc(), E.ry);
        b.t('wood').box(x, 2.05, z, 0.08, 0.08, w + 0.2, col(WOOD.weathered, 0.05, r), E.ry); // the lintel
      }
    }
    return {};
  };
  L('gap_shack', 'corrugated');

  // a printed vinyl banner (lona) tied flat to a wall or a rail: rope at the corners, a sag, faded print
  P.lona = (b, r, o) => {
    const w = o.width || r.range(1.4, 2.4), h = o.h || w * r.range(0.55, 0.8), y = o.height || r.range(1.0, 1.5), bg = r.pick(['#e0c84a', '#ecebe4', '#d8d4c8', '#c8402a', '#2a5a9a']);
    const bgc = { '#e0c84a': 0xc8b44a, '#ecebe4': 0xd8d4c8, '#d8d4c8': 0xc8c4b8, '#c8402a': 0xa84a3a, '#2a5a9a': 0x3a5a8a }[bg];
    b.t('fabric').box(0, y + h / 2, 0.03, w, h, 0.012, col(bgc, 0.03, r), 0, r.range(-0.03, 0.03));
    b.t('plain'); for (const [x, yy] of [[-w / 2, y + h], [w / 2, y + h], [-w / 2, y], [w / 2, y]]) b.box(x, yy, 0.02, 0.03, 0.03, 0.03, col(0x8a7a5a));
    const text = o.text || r.pick(['SERVICIOS', 'SE VENDE', 'PROMOCIÓN', 'DAMA Y\nCABALLERO', 'CORTES · TINTES', 'HAY\nHIELO', 'SE RENTA', 'COMIDA\nCORRIDA']);
    return { signs: [{ text, x: 0, y: y + h / 2, z: 0.045, ry: 0, w: w * 0.9, h: h * 0.8, style: 'printed', opts: { bg, color: bg === '#e0c84a' || bg === '#ecebe4' || bg === '#d8d4c8' ? '#2a2a28' : '#f2f0ea' } }] };
  };
  L('lona', 'fabric');
}

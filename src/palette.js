// Colour kits (sRGB hex). Sun-bleached, ochre-leaning — closer to Fallout 1/2 than to a lush palette.
export const GROUND = {
  coastal_desert: { base: [0xd2bc92, 0xc7ab7c, 0xbfa57e, 0xcab48c], dry: 0xd9c7a0, rock: 0x9a8b78, bed: 0xe0cfaa, scrub: 0xa99a6c },
  desert:         { base: [0xdcc196, 0xd3b283, 0xc9a576, 0xe0c89e], dry: 0xe6d2a8, rock: 0xa08a70, bed: 0xead8b0, scrub: 0xb09a68 },
  scrubland:      { base: [0xbfa67a, 0xb39a6e, 0xa99a70, 0xc4ac80], dry: 0xcdb68a, rock: 0x8e8070, bed: 0xd6c39c, scrub: 0x8f8c5c },
  valley:         { base: [0xa99f6e, 0x9f9866, 0xb4a576, 0x968f60], dry: 0xc2ad80, rock: 0x8a7e6c, bed: 0xcdb990, scrub: 0x7d8752 },
  sierra:         { base: [0x9c9478, 0x8f8a70, 0xa69a7a, 0x878268], dry: 0xb0a284, rock: 0x7f7a70, bed: 0xbcae90, scrub: 0x6f7a50, green: 0.35, green_c: 0x7a8256 },
  // Pacific slope valley (San Quintín): fog-fed, browner and greener than the desert, farmland
  coastal_valley: { base: [0x9a8c6c, 0x928766, 0x8c8460, 0xa09070], dry: 0xa89a78, rock: 0x948572, bed: 0xbcaa86, scrub: 0x77744c, green: 0.9, green_c: 0x6f6c48, scrubMin: 0.7, scrubK: 0.6, beach: 0xddcfa8 },
};
for (const [k, g] of Object.entries(GROUND)) { g.green ??= { coastal_desert: 0.25, desert: 0.08, scrubland: 0.4, valley: 0.55 }[k] ?? 0.25; g.green_c ??= g.scrub; }

export const PAINT = {
  dirt: 0xcbb084, yard: 0xc8ae86, packed: 0xbea27a, tilled: 0x7c5d40, irrigated: 0x7e8a50,
  wet: 0x9c8466, ash: 0x6e6862, sand: 0xe3d2aa, gravel: 0xb0a596, oil: 0x5e5850,
};

export const MAT = {
  adobe:     { wall: [0xc9a37b, 0xc29a72, 0xd0ac86, 0xbd9470], trim: 0xa8835e, plinth: 0x9a7a5a },
  plaster:   { wall: [0xe2d6c0, 0xd9a95b, 0xc9785a, 0x8fa6b2, 0xd6a090, 0xa9b38f, 0xe0cfa8], trim: 0xa08c70, plinth: 0x8f7d66 },
  stone:     { wall: [0xa89c88, 0x9c917e, 0xb0a490, 0x948a7a], trim: 0x857b6c, plinth: 0x7e7466 },
  brick:     { wall: [0xa67b64, 0x9e735d, 0xab8169], trim: 0xb8ad9a, plinth: 0x7f6f60 },
  concrete:  { wall: [0xb8b3a8, 0xaca69a, 0xc2bcaf, 0xa29d92], trim: 0x8f8a80, plinth: 0x8a857c },
  block:     { wall: [0xb3ada0, 0xa8a294, 0xbab3a4], trim: 0x8a857a, plinth: 0x858076 }, // cinder block
  timber:    { wall: [0x8f6f4f, 0x9a7a58, 0x86684a, 0xa09282], trim: 0x6e5238, plinth: 0x7a6a58 },
  metal:     { wall: [0x6e5a4a, 0x7c7a74, 0x6f716c, 0x76624e, 0x86847e], trim: 0x6a5040, plinth: 0x7a6a58 }, // corrugated / scrap
};

export const ROOF = {
  flat_adobe: 0xb89670, slab: 0xa8a398, corrugated: [0x7e6c60, 0x8c918e, 0x86705e, 0x7f8780, 0x9a9890, 0x8a8a84],
  tile: [0x965b45, 0x8c5340, 0x9e624a], shingle: 0x6f5a46, thatch: [0xb59c66, 0xa88f5c, 0xbfa874], tar: 0x5a5650,
};

export const WOOD = { fresh: 0x9a7650, weathered: 0x8e8272, dark: 0x5e4a38, pole: 0x7a6248 };
export const METAL = { rust: 0x8e4f32, rust2: 0xa5623c, steel: 0x8c9294, dark: 0x4a4c4e, paint_red: 0xa8473a, paint_teal: 0x5f8f86, paint_cream: 0xd8ccb0, chrome: 0xc8ccc8 };
export const ASPHALT = { base: 0x5a5753, worn: 0x6e6a64, patch: 0x47454a, line_y: 0xc9a94a, line_w: 0xd0ccc0 };
export const GLASS = { dark: 0x2c3438, broken: 0x1e2224, lit: 0xffc477 };
export const MISC = { cloth: [0xa8473a, 0x5f7f96, 0xc9a65a, 0x8a9a6a, 0xd8ccb0], water: 0x3e6a62 };

// handmade fired brick (ladrillo recocido): buff to faded pink — a variant of brick, not a material of its own
export const LADRILLO = { wall: [0xc4a48e, 0xbc9c88, 0xc8aa92, 0xb89884] };

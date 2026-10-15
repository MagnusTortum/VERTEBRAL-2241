// Build: bundles the engine into app.js and writes the authored places (src/places) as map files in saves/
// (the tool opens straight from disk via file://; maps are opened with Open / Load). Run: npm install && node build.mjs
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'fs';
const out = process.argv[2] || '.';
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, outfile: `${out}/app.js`, target: 'es2020', logLevel: 'warning' });
copyFileSync('src/index.html', `${out}/index.html`);
// places authored as JS modules in src/places -> map files in saves/ (opened with Open / Load; no bundled list)
mkdirSync(`${out}/saves`, { recursive: true });
const names = [];
for (const f of readdirSync('src/places').filter((f) => f.endsWith('.js') && f !== 'index.js')) {
  const key = f.replace(/\.js$/, '');
  const mod = await import(`./src/places/${f}`);
  writeFileSync(`${out}/saves/${key}.json`, JSON.stringify(mod.default, null, 1));
  names.push(key);
}
console.log('built', out, names);

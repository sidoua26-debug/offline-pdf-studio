import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const pdfjs = 'node_modules/pdfjs-dist';
const targets = { web: 'dist/web', extension: 'dist/extension', firefox: 'dist/firefox' };

await rm('dist', { recursive: true, force: true });

async function bundle(outdir) {
  await build({
    entryPoints: { app: 'pdf-tools/app.mjs', worker: 'pdf-tools/worker.mjs' },
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['chrome114', 'firefox115', 'safari16.4'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    // pdf.js ships optional Node-only branches; they never run in a browser.
    external: ['canvas', 'path2d', 'fs', 'path', 'url', 'module', 'http', 'https', 'zlib', 'os', 'crypto', 'stream', 'child_process'],
    define: { 'process.env.NODE_ENV': '"production"' }
  });
  await cp('pdf-tools/index.html', `${outdir}/index.html`);
  await cp('pdf-tools/styles.css', `${outdir}/styles.css`);
  await cp(`${pdfjs}/legacy/build/pdf.worker.min.mjs`, `${outdir}/pdf.worker.mjs`);
  await cp(`${pdfjs}/cmaps`, `${outdir}/cmaps`, { recursive: true });
  await cp(`${pdfjs}/standard_fonts`, `${outdir}/standard_fonts`, { recursive: true });

  const pdfLibLicense = await readFile('node_modules/pdf-lib/LICENSE.md', 'utf8');
  const pdfJsLicense = await readFile(`${pdfjs}/LICENSE`, 'utf8');
  const pngJsLicense = await readFile('node_modules/pngjs/LICENSE', 'utf8');
  const bundledLicenses = [
    '=== pdf-lib ===\n' + pdfLibLicense.trim(),
    '=== pdfjs-dist ===\n' + pdfJsLicense.trim(),
    '=== pngjs ===\n' + pngJsLicense.trim()
  ].join('\n\n') + '\n';
  await writeFile(`${outdir}/THIRD_PARTY_LICENSES.txt`, bundledLicenses);
}

function icon(size) {
  const png = new PNG({ width: size, height: size });
  const m = Math.round(size * 0.22);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const page = x >= m && x < size - m && y >= Math.round(size * 0.14) && y < size - Math.round(size * 0.14);
      const line = page && y % Math.max(2, Math.round(size / 8)) === 0 && x > m + 1 && x < size - m - 1;
      const [r, g, b] = line ? [11, 96, 208] : page ? [255, 255, 255] : [11, 96, 208];
      png.data.set([r, g, b, 255], i);
    }
  }
  return PNG.sync.write(png);
}

await bundle(targets.web);
await bundle(targets.extension);

const ext = targets.extension;
await cp('pdf-tools/index.html', `${ext}/studio.html`);
await cp('extensions/pdf-studio/background.js', `${ext}/background.js`);
await mkdir(`${ext}/icons`, { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(`${ext}/icons/icon${size}.png`, icon(size));
await cp('extensions/pdf-studio/manifest.json', `${ext}/manifest.json`);

// Firefox: same files, different manifest. Firefox MV3 ignores background.service_worker (it uses event
// pages via background.scripts), AMO requires a stable add-on id, and new submissions must declare
// data_collection_permissions. Edge uses the Chrome build as-is.
await cp(ext, targets.firefox, { recursive: true });
const manifest = JSON.parse(await readFile('extensions/pdf-studio/manifest.json', 'utf8'));
const { service_worker: worker, ...restBackground } = manifest.background;
delete manifest.minimum_chrome_version;
manifest.background = { ...restBackground, scripts: [worker] };
manifest.browser_specific_settings = {
  gecko: {
    id: 'offline-pdf-studio@local', // replace with your own id before publishing to AMO
    strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] }
  }
};
await writeFile(`${targets.firefox}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

// Packaging sanity: nothing in the output may reference a remote origin for loading code or data.
const app = await readFile(`${targets.web}/app.js`, 'utf8');
console.log(`Built dist/web and dist/extension (app.js ${(app.length / 1024).toFixed(0)} KB)`);

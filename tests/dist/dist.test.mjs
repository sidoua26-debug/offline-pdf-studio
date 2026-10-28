import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const targets = ['dist/web', 'dist/extension', 'dist/firefox'];

test('both targets contain every runtime file the app needs', async () => {
  for (const dir of targets) {
    const page = dir.endsWith('web') ? 'index.html' : 'studio.html';
    for (const file of [page, 'app.js', 'worker.js', 'styles.css', 'pdf.worker.mjs', 'cmaps', 'standard_fonts', 'THIRD_PARTY_LICENSES.txt']) {
      await access(`${dir}/${file}`);
    }
    assert.ok((await readdir(`${dir}/standard_fonts`)).length > 0);
  }
});

test('dist THIRD_PARTY_LICENSES only lists shipped code (pdf-lib, pdfjs-dist) and excludes build-time tools', async () => {
  for (const dir of targets) {
    const text = await readFile(`${dir}/THIRD_PARTY_LICENSES.txt`, 'utf8');
    assert.ok(text.includes('=== pdf-lib ==='), 'must include pdf-lib license');
    assert.ok(text.includes('=== pdfjs-dist ==='), 'must include pdfjs-dist license');
    assert.ok(!text.includes('=== pngjs ==='), 'pngjs is build-only and must not be included');
  }
});

test('html is wired: every id used by app.mjs exists, CSP is present, no remote assets', async () => {
  const html = await readFile('dist/web/index.html', 'utf8');
  const src = await readFile('pdf-tools/app.mjs', 'utf8');
  const ids = new Set([...src.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  ['merge', 'redact', 'compress', 'metadata'].forEach((k) => { ids.add(`tab-${k}`); ids.add(`panel-${k}`); });
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `missing #${id} in index.html`);
  assert.match(html, /Content-Security-Policy/);
  assert.ok(!/(src|href)=["']https?:/i.test(html));
});

test('extension manifest is valid, minimal and points at real files', async () => {
  const m = JSON.parse(await readFile('dist/extension/manifest.json', 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, []);
  assert.deepEqual(m.host_permissions, []);
  assert.equal(m.web_accessible_resources, undefined);
  assert.match(m.content_security_policy.extension_pages, /script-src 'self'/);
  assert.ok(!/unsafe-(eval|inline)|https?:/.test(m.content_security_policy.extension_pages));
  await access(`dist/extension/${m.background.service_worker}`);
  for (const icon of Object.values(m.icons)) await access(`dist/extension/${icon}`);
});

test('built JS has no remote URLs that load code or data', async () => {
  for (const dir of targets) {
    for (const file of ['app.js', 'worker.js']) {
      const code = await readFile(`${dir}/${file}`, 'utf8');
      assert.ok(!/(?:import|from)\s*\(?\s*["']https?:/.test(code), `${dir}/${file} imports a remote module`);
      assert.ok(!/importScripts\(\s*["']https?:/.test(code));
    }
  }
});

test('built worker bundle runs the real protocol: merge, split, rotate, inspect, sanitize', async () => {
  const messages = [];
  globalThis.self = { postMessage: (msg) => messages.push(msg), onmessage: null };
  await import(pathToFileURL(resolve('dist/web/worker.js')).href);
  const call = async (id, action, payload) => {
    await globalThis.self.onmessage({ data: { type: 'request', id, action, payload } });
    return messages.find((m) => m.id === id && m.type !== 'progress');
  };

  const make = async (pages, title) => {
    const pdf = await PDFDocument.create();
    pdf.setTitle(title);
    for (let i = 0; i < pages; i += 1) pdf.addPage([200, 200]);
    return (await pdf.save()).buffer;
  };

  const merged = await call('m', 'merge', { files: [await make(2, 'A'), await make(3, 'B')] });
  assert.equal(merged.type, 'result');
  assert.equal((await PDFDocument.load(merged.result.bytes)).getPageCount(), 5);

  const split = await call('s', 'split', { file: merged.result.bytes.slice().buffer, selection: '1-2, 5' });
  assert.equal((await PDFDocument.load(split.result.bytes)).getPageCount(), 3);

  const rotated = await call('r', 'rotate', { file: merged.result.bytes.slice().buffer, requests: [{ pages: '*', degrees: '90' }] });
  assert.equal((await PDFDocument.load(rotated.result.bytes)).getPage(0).getRotation().angle, 90);

  const info = await call('i', 'inspect', { file: await make(1, 'Secret') });
  assert.equal(info.result.metadata.title, 'Secret');

  const clean = await call('c', 'sanitize', { file: await make(1, 'Secret') });
  assert.ok(!Buffer.from(clean.result.bytes).toString('latin1').includes('Secret'));

  const bad = await call('b', 'merge', { files: [new Uint8Array([1, 2, 3]).buffer] });
  assert.equal(bad.type, 'error');
  assert.equal(bad.error.code, 'INVALID_PDF');
  const nope = await call('n', 'nope', {});
  assert.equal(nope.error.code, 'UNKNOWN_ACTION');
});

test('chrome manifest uses a service worker; firefox manifest uses an event page and AMO fields', async () => {
  const chrome = JSON.parse(await readFile('dist/extension/manifest.json', 'utf8'));
  assert.equal(chrome.background.service_worker, 'background.js');
  assert.equal(chrome.background.type, undefined);
  assert.equal(chrome.browser_specific_settings, undefined);

  const ff = JSON.parse(await readFile('dist/firefox/manifest.json', 'utf8'));
  assert.deepEqual(ff.background, { scripts: ['background.js'] });
  assert.equal(ff.minimum_chrome_version, undefined);
  assert.match(ff.browser_specific_settings.gecko.id, /@/);
  assert.deepEqual(ff.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
  assert.deepEqual(ff.permissions, []);
  assert.deepEqual(ff.host_permissions, []);
  await access('dist/firefox/background.js');
});

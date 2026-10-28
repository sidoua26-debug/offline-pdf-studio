import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/home/sid/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const fixturePath = resolve('tests/fixtures/sample.pdf');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf'
};

function startStaticServer(dir) {
  const server = createServer(async (req, res) => {
    const rawPath = req.url?.split('?')[0] ?? '/';
    const filePath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\//, '');
    const ext = extname(filePath);
    const fullPath = resolve(dir, filePath);
    try {
      const data = await readFile(fullPath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      res({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

test('UI Smoke: drag and drop PDF loading on panel', async () => {
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    const fixtureBuffer = await readFile(fixturePath);

    const dropTarget = page.locator('#panel-merge fieldset').first();
    const dataTransfer = await page.evaluateHandle((bufferBase64) => {
      const dt = new DataTransfer();
      const binary = atob(bufferBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'sample.pdf', { type: 'application/pdf' });
      dt.items.add(file);
      return dt;
    }, fixtureBuffer.toString('base64'));

    await dropTarget.dispatchEvent('dragover', { dataTransfer });
    await dropTarget.dispatchEvent('drop', { dataTransfer });

    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      const list = document.getElementById('merge-list')?.children.length ?? 0;
      return list > 0 || status.includes('ready');
    });

    const mergeListCount = await page.locator('#merge-list li').count();
    assert.ok(mergeListCount >= 1, 'File should appear in merge list after drop');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: redaction draw box and undo via Ctrl+Z', async () => {
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    await page.click('#tab-redact');
    assert.equal(await page.locator('#panel-redact').isVisible(), true);

    const redactInput = page.locator('#redact-file');
    await redactInput.setInputFiles(fixturePath);

    await page.waitForFunction(() => {
      const text = document.getElementById('redact-page')?.textContent ?? '';
      return text.includes('Page 1 of');
    });

    await page.fill('#box-x', '50');
    await page.fill('#box-y', '50');
    await page.fill('#box-w', '150');
    await page.fill('#box-h', '50');
    await page.click('#redact-add-box');

    await page.waitForSelector('#redact-boxes li');
    let boxCount = await page.locator('#redact-boxes li').count();
    assert.equal(boxCount, 1, 'One redaction box should exist');

    await page.keyboard.press('Control+z');

    await page.waitForFunction(() => document.querySelectorAll('#redact-boxes li').length === 0);
    boxCount = await page.locator('#redact-boxes li').count();
    assert.equal(boxCount, 0, 'Redaction box should be removed after undo');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: split tool cancel-then-repick same file', async () => {
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    const splitInput = page.locator('#split-file');

    await splitInput.setInputFiles(fixturePath);
    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      return status.includes('page(s)');
    });
    assert.equal(await page.locator('#split-run').isEnabled(), true);

    await splitInput.setInputFiles(fixturePath);
    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      return status.includes('page(s)');
    });
    assert.equal(await page.locator('#split-run').isEnabled(), true);
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: toolbar focus-existing-tab behavior in extension build', async () => {
  const extPath = resolve('dist/extension');
  const context = await chromium.launchPersistentContext('', {
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`]
  });

  try {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');

    const initialPages = context.pages().length;

    // 1st click
    await background.evaluate(() => {
      chrome.action.onClicked.dispatch({ id: 1 });
    });
    await new Promise((r) => setTimeout(r, 800));
    const openedPages = context.pages().length;
    assert.equal(openedPages, initialPages + 1, 'Toolbar click should open one studio tab');

    // 2nd click: should re-focus existing tab rather than opening another
    await background.evaluate(() => {
      chrome.action.onClicked.dispatch({ id: 1 });
    });
    await new Promise((r) => setTimeout(r, 800));
    const postPages = context.pages().length;
    assert.equal(postPages, openedPages, 'Repeat toolbar click must not open duplicate tabs');
  } finally {
    await context.close();
  }
});

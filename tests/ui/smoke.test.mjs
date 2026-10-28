import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { extractPagesText } from '../../src/pdf-core/verify.mjs';
import { createNodeRenderer } from '../helpers/nodeRenderer.mjs';

function getChromiumPath() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  try {
    const defaultPath = chromium.executablePath();
    if (existsSync(defaultPath)) return defaultPath;
  } catch {}
  const fallback = '/home/sid/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
  if (existsSync(fallback)) return fallback;
  return null;
}

const CHROMIUM_PATH = getChromiumPath();
const fixturePath = resolve('tests/fixtures/sample.pdf');
const secretFixturePath = resolve('tests/fixtures/secret.pdf');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.ttf': 'font/ttf'
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

function checkBrowser(t) {
  if (!CHROMIUM_PATH) {
    t.skip('Skipping browser smoke test: No Chromium executable found. Install via "npx playwright install chromium" or set CHROMIUM_PATH.');
    return false;
  }
  return true;
}

test('UI Smoke: high-risk flow - mouse drag redaction over secret, verify download, text destroyed & box black', async (t) => {
  if (!checkBrowser(t)) return;
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    await page.click('#tab-redact');
    await page.locator('#redact-file').setInputFiles(secretFixturePath);

    await page.waitForFunction(() => {
      const text = document.getElementById('redact-page')?.textContent ?? '';
      return text.includes('Page 1 of');
    });

    const overlay = page.locator('#redact-overlay');
    const box = await overlay.boundingBox();

    // Drag pointer over the top area where the secret is located
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 350, box.y + 120);
    await page.mouse.up();

    const boxCount = await page.locator('#redact-boxes li').count();
    assert.equal(boxCount, 1, 'One box should be drawn on page 1');

    // Trigger download
    const downloadPromise = page.waitForEvent('download');
    await page.click('#redact-run');
    const download = await downloadPromise;
    const downloadStream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of downloadStream) chunks.push(chunk);
    const downloadedBytes = Buffer.concat(chunks);

    // Verify extracted text with pdf.js: secret MUST NOT exist on page 1
    const extracted = await extractPagesText(downloadedBytes, [1, 2]);
    assert.ok(!extracted[1].includes('CONFIDENTIAL_SECRET_TOKEN'), 'Secret token must not be extractable from redacted page');
    assert.ok(extracted[2].includes('Second page safe text'), 'Unredacted page text must survive');

    // Verify box region is black in output PDF
    const renderer = createNodeRenderer();
    await renderer.verifyBlackRects({
      pdfBytes: downloadedBytes,
      pageNumber: 1,
      rects: [{ x: 25, y: 35, width: 190, height: 40 }]
    });
    await renderer.close();
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: rapid Next/Previous clicks produce no console errors and right-click does not create box', async (t) => {
  if (!checkBrowser(t)) return;
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  try {
    await page.goto(url);
    await page.click('#tab-redact');
    await page.locator('#redact-file').setInputFiles(fixturePath);

    await page.waitForFunction(() => {
      const text = document.getElementById('redact-page')?.textContent ?? '';
      return text.includes('Page 1 of');
    });

    // Rapid Next/Previous clicks
    for (let i = 0; i < 5; i += 1) {
      await page.click('#redact-next').catch(() => {});
      await page.click('#redact-prev').catch(() => {});
    }

    // Verify right-click drag does NOT create a box
    const overlay = page.locator('#redact-overlay');
    const box = await overlay.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.up({ button: 'right' });

    const boxCount = await page.locator('#redact-boxes li').count();
    assert.equal(boxCount, 0, 'Right-click must not create a redaction box');

    // Filter out expected missing favicon.ico from static server
    const appErrors = consoleErrors.filter((e) => !e.includes('favicon.ico') && !e.includes('404'));
    assert.deepEqual(appErrors, [], 'No console errors expected during rapid navigation');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: drag and drop works BEFORE any redaction file is chosen', async (t) => {
  if (!checkBrowser(t)) return;
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    await page.click('#tab-redact');

    // Drag-and-drop onto #panel-redact immediately without selecting any file first
    const fixtureBuffer = await readFile(fixturePath);
    const dropTarget = page.locator('#panel-redact');
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
      const text = document.getElementById('redact-page')?.textContent ?? '';
      return text.includes('Page 1 of');
    });

    const pageIndicator = await page.textContent('#redact-page');
    assert.ok(pageIndicator.includes('Page 1 of 3'), 'Direct drop on panel-redact should load the PDF');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: redaction draw box and undo via Ctrl+Z', async (t) => {
  if (!checkBrowser(t)) return;
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

test('UI Smoke: split tool cancel-then-repick same file', async (t) => {
  if (!checkBrowser(t)) return;
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    const splitInput = page.locator('#split-file');

    // 1. Pick file
    await splitInput.setInputFiles(fixturePath);
    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      return status.includes('page(s)');
    });
    assert.equal(await page.locator('#split-run').isEnabled(), true);

    // 2. Cancel file dialog (clears input file list)
    await splitInput.setInputFiles([]);
    assert.equal(await page.locator('#split-run').isEnabled(), false, 'Button should disable when input is cleared');

    // 3. Pick the exact same file again
    await splitInput.setInputFiles(fixturePath);
    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      return status.includes('page(s)');
    });
    assert.equal(await page.locator('#split-run').isEnabled(), true, 'Button should re-enable on repicking');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: worker crash displays WORKER_CRASHED message and re-enables buttons', async (t) => {
  if (!checkBrowser(t)) return;
  const { server, url } = await startStaticServer('dist/web');
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url);
    await page.locator('#split-file').setInputFiles(fixturePath);
    await page.waitForFunction(() => document.getElementById('split-run').disabled === false);

    // Terminate worker from page context
    await page.evaluate(() => {
      window.__pdfStudio.worker.terminate();
      window.__pdfStudio.worker.onerror(new ErrorEvent('error', { message: 'Worker terminated' }));
    });

    await page.click('#split-run');

    await page.waitForFunction(() => {
      const status = document.getElementById('status')?.textContent ?? '';
      const btnEnabled = document.getElementById('split-run')?.disabled === false;
      return status.includes('worker stopped unexpectedly') && btnEnabled;
    });

    const statusMsg = await page.textContent('#status');
    const btnDisabled = await page.locator('#split-run').isDisabled();
    assert.ok(statusMsg.includes('worker stopped unexpectedly'), 'Error message must reflect worker crash');
    assert.equal(btnDisabled, false, 'Action button must re-enable after failure');
  } finally {
    await browser.close();
    server.close();
  }
});

test('UI Smoke: toolbar focus-existing-tab behavior in extension build', async (t) => {
  if (!checkBrowser(t)) return;
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

    // 1st click: dispatches action.onClicked
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

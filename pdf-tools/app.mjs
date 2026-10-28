import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  WorkerController,
  redactByRasterizedRebuild,
  compressPdfByRasterization,
  OPERATIONAL_LIMITS,
  METADATA_FEATURE_MATRIX
} from '../src/pdf-core/index.mjs';
import { createBrowserRenderer } from './browserRenderer.mjs';
import { RedactViewer } from './redactViewer.mjs';

const assetBase = new URL('./', import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const say = (message, kind = '') => {
  statusEl.textContent = message;
  statusEl.className = kind;
};

const ERROR_TEXT = {
  ENCRYPTED_PDF: 'This PDF is encrypted. Remove the password first; encrypted files are not supported.',
  INVALID_PDF: 'That file could not be read as a PDF.',
  LIMIT_INPUT_SIZE: `File is too large (limit ${OPERATIONAL_LIMITS.maxInputBytes / 1048576} MB).`,
  LIMIT_PAGE_COUNT: `Too many pages (limit ${OPERATIONAL_LIMITS.maxPageCount}).`,
  LIMIT_OUTPUT_SIZE: `The result is too large (limit ${OPERATIONAL_LIMITS.maxOutputBytes / 1048576} MB).`,
  INVALID_PAGE_RANGE: 'Page selection is not valid for this document. Use forms like 1-3, 5, 8-',
  INVALID_PAGE_SELECTION: 'Page selection is not valid for this document.',
  REDACTION_FAIL_CLOSED: 'Verification failed, so no file was produced. Nothing was downloaded.',
  NOTHING_TO_REDACT: 'Draw at least one box first.',
  CANCELLED: 'Cancelled.',
  WORKER_CRASHED: 'The background worker stopped unexpectedly. Reload the page and try again.',
  LIMIT_MERGE_TOTAL: 'The files together are too large to merge in the browser.',
  INVALID_COMPRESSION_QUALITY: 'Invalid compression quality value.',
  INVALID_COMPRESSION_SCALE: 'Invalid compression resolution scale.'
};
const fail = (error) => {
  console.error(error);
  const base = ERROR_TEXT[error.code] ?? `Something went wrong: ${error.message}`;
  const detail = error.code === 'REDACTION_FAIL_CLOSED' && error.details?.cause ? ` (${error.details.cause})` : '';
  say(base + detail, 'error');
};

async function readPdf(file) {
  if (file.size > OPERATIONAL_LIMITS.maxInputBytes) {
    const error = new Error('too large');
    error.code = 'LIMIT_INPUT_SIZE';
    throw error;
  }
  return new Uint8Array(await file.arrayBuffer());
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const baseName = (file) => file.name.replace(/\.pdf$/i, '') || 'document';

// ---- Tabs (roving tabindex + arrow keys) ----
const tabs = ['merge', 'redact', 'compress', 'metadata'].map((key) => ({ tab: $(`tab-${key}`), panel: $(`panel-${key}`) }));
function selectTab(index) {
  tabs.forEach((item, i) => {
    item.tab.setAttribute('aria-selected', String(i === index));
    item.tab.tabIndex = i === index ? 0 : -1;
    item.panel.hidden = i !== index;
  });
  tabs[index].tab.focus();
  if (tabs[index].tab.id === 'tab-redact') viewer.show(viewer.pageNumber).catch(fail);
}
tabs.forEach((item, i) => {
  item.tab.addEventListener('click', () => selectTab(i));
  item.tab.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') selectTab((i + 1) % tabs.length);
    if (event.key === 'ArrowLeft') selectTab((i - 1 + tabs.length) % tabs.length);
    if (event.key === 'Home') { event.preventDefault(); selectTab(0); }
    if (event.key === 'End') { event.preventDefault(); selectTab(tabs.length - 1); }
  });
});

// ---- Worker ----
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
const controller = new WorkerController(worker);
if (typeof window !== 'undefined') {
  window.__pdfStudio = { worker, controller };
}

// Runs a worker task while keeping buttons from being double-clicked.
async function busy(button, label, task) {
  button.disabled = true;
  say(label);
  try {
    await task();
  } catch (error) {
    fail(error);
  } finally {
    button.disabled = false;
  }
}
const sendBuffers = (arrays) => arrays.map((a) => a.slice().buffer);

// ---- Merge ----
let mergeFiles = [];
function renderMergeList() {
  const list = $('merge-list');
  list.replaceChildren();
  mergeFiles.forEach((item, i) => {
    const li = document.createElement('li');
    li.append(`${item.name} `);
    for (const [text, delta] of [['Up', -1], ['Down', 1]]) {
      const b = document.createElement('button');
      b.textContent = text;
      b.disabled = i + delta < 0 || i + delta >= mergeFiles.length;
      b.addEventListener('click', () => {
        [mergeFiles[i], mergeFiles[i + delta]] = [mergeFiles[i + delta], mergeFiles[i]];
        renderMergeList();
      });
      li.append(b);
    }
    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => { mergeFiles.splice(i, 1); renderMergeList(); });
    li.append(remove);
    list.append(li);
  });
  $('merge-run').disabled = mergeFiles.length < 2;
}
$('merge-files').addEventListener('change', async (event) => {
  try {
    const added = [];
    for (const file of event.target.files) added.push({ name: file.name, bytes: await readPdf(file) });
    mergeFiles = [...mergeFiles, ...added];
    event.target.value = '';
    renderMergeList();
    say(`${mergeFiles.length} file(s) ready.`);
  } catch (error) { fail(error); }
});
$('merge-run').addEventListener('click', () =>
  busy($('merge-run'), 'Merging…', async () => {
    const buffers = sendBuffers(mergeFiles.map((f) => f.bytes));
    const { bytes } = await controller.request('merge', { files: buffers }, { transfer: buffers });
    download(bytes, 'merged.pdf');
    say('Merged PDF downloaded.', 'ok');
  }));

// ---- Single-file tools (split, rotate, metadata) ----
function bindSingle({ input, button, onLoaded }) {
  const state = { file: null, bytes: null };
  $(input).addEventListener('change', async (event) => {
    state.file = event.target.files[0] ?? null;
    event.target.value = ''; // lets the same file be picked again after an error or edit
    state.bytes = null;
    $(button).disabled = true;
    if (!state.file) return;
    try {
      state.bytes = await readPdf(state.file);
      const buf = state.bytes.slice().buffer;
      const info = await controller.request('inspect', { file: buf }, { transfer: [buf] });
      say(`${state.file.name}: ${info.metadata.pageCount} page(s).`);
      $(button).disabled = false;
      onLoaded?.(info);
    } catch (error) { state.bytes = null; fail(error); }
  });
  return state;
}

const split = bindSingle({ input: 'split-file', button: 'split-run' });
$('split-run').addEventListener('click', () =>
  busy($('split-run'), 'Extracting…', async () => {
    const buf = split.bytes.slice().buffer;
    const { bytes } = await controller.request('split', { file: buf, selection: $('split-pages').value }, { transfer: [buf] });
    download(bytes, `${baseName(split.file)}-extract.pdf`);
    say('Extracted pages downloaded.', 'ok');
  }));

const rotate = bindSingle({ input: 'rotate-file', button: 'rotate-run' });
$('rotate-run').addEventListener('click', () =>
  busy($('rotate-run'), 'Rotating…', async () => {
    const buf = rotate.bytes.slice().buffer;
    const degrees = $('rotate-degrees').value;
    // "Reset" sets an absolute 0°; every other choice turns the page from where it is now.
    const requests = [{ pages: $('rotate-pages').value, degrees: degrees === 'reset' ? 0 : degrees, relative: degrees !== 'reset' }];
    const { bytes } = await controller.request('rotate', { file: buf, requests }, { transfer: [buf] });
    download(bytes, `${baseName(rotate.file)}-rotated.pdf`);
    say('Rotated PDF downloaded.', 'ok');
  }));

// ---- Metadata ----
const fillList = (id, items) => $(id).replaceChildren(...items.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
fillList('meta-supported', METADATA_FEATURE_MATRIX.supported);
fillList('meta-unsupported', METADATA_FEATURE_MATRIX.unsupported);
const meta = bindSingle({
  input: 'meta-file',
  button: 'meta-run',
  onLoaded: ({ metadata }) => {
    const body = $('meta-table').tBodies[0];
    body.replaceChildren();
    for (const [key, value] of Object.entries(metadata)) {
      const tr = body.insertRow();
      tr.insertCell().textContent = key;
      tr.insertCell().textContent = value === null || value === '' ? '(empty)' : String(value);
    }
    $('meta-table').hidden = false;
  }
});
$('meta-run').addEventListener('click', () =>
  busy($('meta-run'), 'Clearing metadata…', async () => {
    const buf = meta.bytes.slice().buffer;
    const { bytes } = await controller.request('sanitize', { file: buf }, { transfer: [buf] });
    download(bytes, `${baseName(meta.file)}-clean.pdf`);
    say('Cleaned PDF downloaded. Only the Info dictionary was cleared; see "What is and isn\'t cleaned".', 'ok');
  }));

// ---- Compress ----
const compress = bindSingle({
  input: 'compress-file',
  button: 'compress-run',
  onLoaded: ({ metadata }) => {
    const kb = (compress.bytes.byteLength / 1024).toFixed(0);
    $('compress-summary').textContent = `${compress.file.name}: ${metadata.pageCount} page(s), ${kb} KB. Ready to compress.`;
  }
});
$('compress-run').addEventListener('click', () =>
  busy($('compress-run'), 'Compressing…', async () => {
    const quality = Number($('compress-quality').value);
    const scale = Number($('compress-scale').value);
    const renderer = createBrowserRenderer(assetBase);
    try {
      const result = await compressPdfByRasterization({
        pdfBuffer: compress.bytes,
        renderPageToJpeg: renderer.renderPageToJpeg,
        quality,
        scale,
        onProgress: ({ pageNumber, totalPages }) => say(`Compressing… page ${pageNumber}/${totalPages}`)
      });
      const origKb = (result.originalBytes / 1024).toFixed(0);
      const compKb = (result.compressedBytes / 1024).toFixed(0);
      const pct = ((1 - result.ratio) * 100).toFixed(0);
      download(result.bytes, `${baseName(compress.file)}-compressed.pdf`);
      say(`Compressed PDF downloaded: ${origKb} KB → ${compKb} KB (${pct}% reduction).`, 'ok');
    } finally {
      await renderer.close();
    }
  }));

// ---- Redaction ----
let redactSource = null;
const viewer = new RedactViewer({
  stage: $('redact-stage'),
  canvas: $('redact-canvas'),
  overlay: $('redact-overlay'),
  assetBase,
  onChange: refreshRedactUi
});

function refreshRedactUi() {
  const has = viewer.pageCount > 0;
  $('redact-page').textContent = has ? `Page ${viewer.pageNumber} of ${viewer.pageCount}` : 'No file';
  $('redact-prev').disabled = !has || viewer.pageNumber <= 1;
  $('redact-next').disabled = !has || viewer.pageNumber >= viewer.pageCount;
  $('redact-whole').disabled = !has;
  $('redact-undo').disabled = !viewer.canUndo;
  $('redact-add-box').disabled = !has;
  const list = $('redact-boxes');
  list.replaceChildren();
  viewer.boxesFor(viewer.pageNumber).forEach((box, index) => {
    const li = document.createElement('li');
    li.append(`Box ${index + 1}: ${Math.round(box.width)} × ${Math.round(box.height)} pt `);
    const b = document.createElement('button');
    b.textContent = 'Remove';
    b.addEventListener('click', () => viewer.removeBox(viewer.pageNumber, index));
    li.append(b);
    for (const type of ['mouseenter', 'focusin']) li.addEventListener(type, () => viewer.highlight(index));
    for (const type of ['mouseleave', 'focusout']) li.addEventListener(type, () => viewer.highlight(null));
    list.append(li);
  });
  const all = viewer.redactions();
  const total = all.reduce((n, r) => n + r.rects.length, 0);
  $('redact-summary').textContent = total ? `${total} box(es) on ${all.length} page(s) will be flattened and redacted.` : 'No regions selected.';
  $('redact-run').disabled = total === 0;
}

$('redact-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  redactSource = null;
  if (!file) return;
  try {
    const bytes = await readPdf(file);
    await viewer.load(bytes);
    if (viewer.pageCount > OPERATIONAL_LIMITS.maxPageCount) {
      await viewer.close();
      const error = new Error('pages');
      error.code = 'LIMIT_PAGE_COUNT';
      throw error;
    }
    redactSource = { file, bytes };
    refreshRedactUi();
    say(`${file.name}: ${viewer.pageCount} page(s). Drag on the page to draw boxes.`);
  } catch (error) {
    fail(error.name === 'PasswordException' ? Object.assign(error, { code: 'ENCRYPTED_PDF' }) : error.name === 'InvalidPDFException' ? Object.assign(error, { code: 'INVALID_PDF' }) : error);
    refreshRedactUi();
  }
});
$('redact-prev').addEventListener('click', () => viewer.show(viewer.pageNumber - 1).then(refreshRedactUi).catch(fail));
$('redact-next').addEventListener('click', () => viewer.show(viewer.pageNumber + 1).then(refreshRedactUi).catch(fail));
$('redact-whole').addEventListener('click', () => viewer.coverWholePage());
$('redact-undo').addEventListener('click', () => { if (viewer.undo()) say('Last change undone.'); });
window.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '');
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !typing && !$('panel-redact').hidden) {
    if (viewer.undo()) { event.preventDefault(); say('Last change undone.'); }
  }
});
// Keyboard-friendly alternative to dragging: type a box in points from the page's top-left corner.
$('redact-add-box').addEventListener('click', () => {
  const [x, y, width, height] = ['x', 'y', 'w', 'h'].map((k) => Number($(`box-${k}`).value));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0) {
    return say('Enter x, y (0 or more) and width, height (above 0) in points.', 'error');
  }
  const { width: pw, height: ph } = viewer.pageSize;
  viewer.addBox({ x: Math.min(x, pw), y: Math.min(y, ph), width: Math.min(width, pw - Math.min(x, pw)), height: Math.min(height, ph - Math.min(y, ph)) });
  say('Box added.');
});

$('redact-run').addEventListener('click', () =>
  busy($('redact-run'), 'Redacting…', async () => {
    const renderer = createBrowserRenderer(assetBase);
    try {
      const result = await redactByRasterizedRebuild({
        pdfBuffer: redactSource.bytes,
        redactions: viewer.redactions(),
        renderPageToPng: renderer.renderPageToPng,
        verifyRects: renderer.verifyBlackRects,
        onProgress: ({ stage, pageNumber, totalPages }) => say(`Redacting… ${stage} page ${pageNumber}/${totalPages}`)
      });
      download(result.bytes, `${baseName(redactSource.file)}-redacted.pdf`);
      say(`${result.terminology}: ${result.redactedPages.length} page(s) flattened. Checked: ${result.verification.surfacesChecked.join(', ')}.`, 'ok');
    } finally {
      await renderer.close();
    }
  }));

refreshRedactUi();

// ---- Drag and drop: drop PDFs onto any panel that has a file input ----
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault()); // never navigate away to a dropped file
for (const zone of document.querySelectorAll('fieldset, #panel-redact, #panel-compress, #panel-metadata')) {
  const input = zone.querySelector('input[type="file"]');
  if (!input) continue;
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('drop'); });
  zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove('drop'); });
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('drop');
    const pdfs = [...event.dataTransfer.files].filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdfs.length === 0) return say('Drop PDF files only.', 'error');
    const transfer = new DataTransfer();
    (input.multiple ? pdfs : pdfs.slice(0, 1)).forEach((f) => transfer.items.add(f));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
  });
}

// ---- Extension single-tab messaging: reply to studio-ping ----
if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'studio-ping') {
      if (globalThis.chrome?.tabs?.getCurrent) {
        chrome.tabs.getCurrent().then((tab) => {
          sendResponse({ tabId: tab?.id, windowId: tab?.windowId });
        }).catch(() => {
          sendResponse({});
        });
      } else {
        sendResponse({});
      }
      return true; // Keep message channel open for async sendResponse
    }
    return false;
  });
}

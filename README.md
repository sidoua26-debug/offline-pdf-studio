# Offline PDF Studio

Local-only PDF tools that run entirely in the browser: merge, split/extract, rotate, metadata clearing and
region-based **Verified Destructive Redaction**. Nothing is uploaded; the app makes no network requests of its own and
ships with a strict Content-Security-Policy.

## Requirements

- **Node.js**: Requires Node 22+ (specifically Node 22.2.0+ or Node 24+ LTS) for native `node:fs/promises` glob support.
- **Deployment**: Used by `extensionguy.me/pdf-tools/`.

## Build and run

```bash
npm ci
npm test              # fixtures, unit, integration, static scan, build, dist checks, Playwright UI smoke
npm run build         # outputs dist/web and dist/extension
npx http-server dist/web   # or any static file server; do not open index.html via file://
```

- `dist/web/` is a static site. Host it on any static host over HTTPS (needs correct `.mjs`/`.js` MIME types). Deployed at `extensionguy.me/pdf-tools/`.
- `dist/extension/` is the Chrome and Edge build: an unpacked Manifest V3 extension (zero permissions, zero host
  permissions, background service worker). Load it via `chrome://extensions` → Developer mode → Load unpacked, or zip
  the folder for the Chrome Web Store / Edge Add-ons.
- `dist/firefox/` is the same code with a Firefox manifest (`background.scripts` event page, `browser_specific_settings.gecko`
  with `data_collection_permissions: none`, Firefox 140+). **Replace the placeholder add-on id in `scripts/build.mjs`
  with your own before submitting to AMO**, and run `npx web-ext lint -s dist/firefox` first. Test with
  `about:debugging` → Load Temporary Add-on.
- Clicking the toolbar icon focuses the existing studio tab instead of opening another.
- `npm run package` builds and writes store-ready zips (`dist/offline-pdf-studio-chrome-edge.zip`, `dist/offline-pdf-studio-firefox.zip`; needs the `zip` command).
- `npm run report:predeploy` regenerates `PRE_DEPLOYMENT_REPORT.md`.

No script here pushes or deploys anything.

## Structure

- `src/pdf-core/`: shared logic (merge/split/rotate, metadata, rendering, redaction, verification, worker protocol, limits).
- `pdf-tools/`: the UI (`index.html`, `app.mjs`, redaction viewer, worker entry).
- `extensions/pdf-studio/`: MV3 manifest and background script.
- `scripts/build.mjs`: esbuild bundling plus asset copy (pdf.js worker, CMaps, standard fonts, licenses).
- `tests/`: unit, integration, static scan, dist checks.

## Redaction: what is guaranteed

1. You draw boxes on pages. Each page with a box is rendered with pdf.js, boxes are painted solid black, and the page is
   rebuilt from that flattened image. Original text, vector data and fonts on those pages are not in the output.
2. Unredacted pages are copied as-is. Metadata is cleared and the output is re-opened and checked: no extractable text
   on redacted pages, no annotations on redacted pages, no forbidden catalog entries (forms, XMP, named files,
   outlines, JavaScript actions), cleared Info dictionary, and the output is re-rendered to confirm each box is black.
3. If any check fails, no file is produced.

Limits to be aware of:

- Redacted pages lose all selectable text (the whole page becomes an image) and the file grows.
- Unredacted pages keep their text, annotations and links.
- Encrypted PDFs are rejected.
- Metadata cleanup covers the Info dictionary only. Embedded files, custom XMP in unredacted pages and incremental-update
  history on the *source* are not rewritten (pages are copied into a fresh document, which drops most of these, but this is
  not forensic sanitization).
- Rendering fidelity depends on pdf.js. Always eyeball the downloaded result before sharing it.

## Operational limits

Input 25 MB, 200 pages, 40 MP rendered area per redacted page (scale is reduced automatically), output 50 MB.
Work runs on the main thread for redaction (pdf.js needs a DOM canvas) and in a Web Worker for everything else.

## Architecture

1. **Background (`background.js`)**: stateless. The toolbar action focuses the existing studio tab or opens `studio.html`.
   Runs as a service worker in Chrome/Edge and an event page in Firefox.
2. **Main thread (`app.mjs`, `redactViewer.mjs`, `browserRenderer.mjs`)**: UI, page preview, and redaction (pdf.js needs a
   DOM canvas). Redaction renders pages, rebuilds them as images and verifies the result.
3. **Worker (`worker.mjs` + `src/pdf-core/`)**: merge, split, rotate and metadata work off the main thread. If the worker dies,
   all pending requests reject with `WORKER_CRASHED` and the UI asks for a reload.

## Privacy and permissions

No permissions, no host permissions, no network requests, no telemetry. Files stay in browser memory and are discarded when
the tab closes. Store listing text: "Requests no permissions. All PDF processing happens locally in your browser."

## Manual QA before each release

| Where | Do this | Expect |
| --- | --- | --- |
| Chrome / Edge / Firefox | Click the toolbar icon repeatedly | One studio tab, re-focused each time |
| Firefox 140+ | Load `dist/firefox` via `about:debugging` | Loads with no manifest errors |
| Redaction | Open a 10-page PDF, click Next 5 times quickly | Lands on page 6, no console errors |
| Redaction | Draw a box, press Ctrl/Cmd+Z | Box and list entry disappear, count drops |
| Redaction | Redact a sample, open the output | Boxes black, no selectable text on those pages, other pages intact |
| Redaction | Add a box using the X/Y/Width/Height fields only (keyboard) | Box appears with a number badge |
| Split | Load a file, cancel, pick the same file again | Page count shows again |
| Rotate | Rotate an already-rotated page 90° clockwise twice | Page turns each time |
| Any panel | Drag a PDF onto the panel | Same as using the file picker |
| Worker | (dev tools) terminate the worker mid-merge | Error message, buttons re-enable |

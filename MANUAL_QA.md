# Manual QA Plan (Chrome / Edge)

This document specifies the release-gate manual QA checklist for Offline PDF Studio on desktop Chromium browsers (Google Chrome and Microsoft Edge).

---

## QA Execution Matrix

| # | Feature / Area | Action / Test Procedure | Expected Result |
| :--- | :--- | :--- | :--- |
| 1 | **Toolbar Icon (Stateless Focus)** | In Chrome/Edge with extension loaded, click toolbar action icon 3 times sequentially. | Focuses the existing `studio.html` tab each time without opening duplicate tabs. |
| 2 | **Service Worker Idle / Kill & Recover** | Open `chrome://serviceworker-internals` or DevTools Service Workers pane. Stop/terminate the background service worker while `studio.html` is open. Click the extension toolbar icon again. | Background service worker restarts, broadcasts `studio-ping`, receives reply from existing tab, and focuses the existing studio tab instead of creating a second tab. |
| 3 | **Worker Crash Recovery** | Open `studio.html` in browser. In DevTools Console, terminate the Web Worker via `window.__pdfStudio.worker.terminate()`. Attempt to perform any worker action (e.g. Split or Rotate). | UI immediately displays error: `"The background worker stopped unexpectedly. Reload the page and try again."` Action buttons are re-enabled. |
| 4 | **Redaction: Secret Token Destruction** | Open `tests/fixtures/secret.pdf`. Draw a black redaction box over `CONFIDENTIAL_SECRET_TOKEN_xyz123`. Click "Redact, verify and download". | Downloaded PDF has a solid black box over token. Text search for `CONFIDENTIAL_SECRET_TOKEN_xyz123` returns zero matches. Page 2 safe text remains searchable and intact. |
| 5 | **Redaction: Rapid Page Navigation** | Load a 10+ page PDF in the Redaction tool. Click "Next" rapidly 5 times in quick succession. | Viewer navigates to page 6 with zero console errors, zero race conditions, and zero stuck loading states. |
| 6 | **Redaction: Undo Stack** | Draw a box on a page. Press `Ctrl+Z` (or `Cmd+Z` on macOS). | Box disappears from canvas overlay and from sidebar list. Redaction count updates. |
| 7 | **Redaction: Precision Keyboard Box** | Enter X: 50, Y: 50, Width: 100, Height: 30 pt and click "Add box to this page". | Box is precisely placed with badge number without needing mouse dragging. |
| 8 | **Compression: Uncompressible PDF Refusal** | In Compress tab, select text-only / vector PDF (`tests/fixtures/sample.pdf`). Click "Compress and download". | Operation rejects with `NOT_COMPRESSIBLE` notification. Displays original vs rasterized size. Refuses download so user does not get an inflated file. |
| 9 | **Compression: Scanned PDF Reduction** | In Compress tab, select `tests/fixtures/scanned.pdf` (or 50-page scanned stress PDF). Click "Compress and download". | Output downloads cleanly with 50–80% size reduction. Info dictionary metadata is sanitized (no leaked Producer or dates). |
| 10 | **Stress Test: 120-Page Office Scan (~46MB)** | In Compress or Redact tab, attempt to load `tests/fixtures/stress-office-scan.pdf` (generated via `node scripts/makeStressFixture.mjs`, ~46MB, 120 pages). | Immediately trips `LIMIT_INPUT_SIZE` with clear message: `"File is too large (limit 25 MB)."` Protects browser tab from out-of-memory crash. |
| 11 | **Stress Test: 3-Page 6000x4000 Hi-Res PDF (~15MB)** | Load `tests/fixtures/stress-hi-res.pdf` (14.88MB, 3 pages, 6000x4000) in Compress and Redaction tabs. | - **Compress**: Downsamples and compresses pages to ~8.8MB in ~6.5s with peak RSS ~104MB.<br>- **Redact**: Successfully rasterizes and flattens redacted page in ~26s with peak RSS ~527MB; does not trip input size limits on intermediate output. |
| 12 | **Split / Extract: Cancel & Repick** | Select a PDF file in the Split tool. Cancel or select empty file. Pick the exact same file again. | Page count and input re-initialize properly. Action button enables. |
| 13 | **Rotate: Relative vs Absolute** | Rotate an already-rotated page 90° clockwise twice. | Page turns each time (relative rotation). Choosing "Reset to original (0°)" returns page to 0°. |
| 14 | **Universal Drag & Drop** | Drag a PDF file from file manager and drop onto any tab's fieldset or panel (Merge, Split, Rotate, Redact, Compress, Metadata). | Drops file into appropriate file picker without navigating browser away. |
| 15 | **Metadata Cleaning** | Select a PDF with title/author metadata in the Metadata tab. Click "Clear metadata and download". | Displays supported/unsupported matrix. Downloaded PDF has all Info dictionary entries cleared. |

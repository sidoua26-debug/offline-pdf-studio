# PRE_DEPLOYMENT_REPORT

## Commands and results
- `npm run generate:fixtures`: PASS
- `npm run test:unit`: PASS
- `npm run test:integration`: PASS
- `npm run test:static`: PASS
- `npm run build`: PASS
- `npm run test:dist`: PASS

## Fixture and output sizes
- Fixture file: tests/fixtures/sample.pdf (1386 bytes)
- Redacted sample output: 7795 bytes

## Verification results
- Mode: rasterized-rebuild-v1
- Terminology: Verified Destructive Redaction
- Surfaces checked: extractable-text, metadata, annotations, catalog
- Heuristic checks: raw-byte-search /AcroForm

## Metadata summary
- Fixture title: Fixture PDF
- Supported metadata features: 3
- Unsupported metadata structures: 3

## Bundle sizes
- dist/web/app.js: 790 KB
- dist/web/worker.js: 427 KB
- dist/web/pdf.worker.mjs: 1371 KB

## Known limitations
- The browser UI (drag-to-box viewer, file pickers, downloads) has no automated browser test; it is covered only by build, wiring checks and a run of the built worker bundle. Smoke-test it manually in Chrome, Firefox and Safari before release.
- Rendering is tested with node-canvas; browser canvases may antialias slightly differently (boxes are expanded to whole pixels and re-verified in the browser at run time).
- Metadata sanitization currently targets known Info dictionary fields; unsupported structures are documented.

## Git status
```
(not a git repository)
```

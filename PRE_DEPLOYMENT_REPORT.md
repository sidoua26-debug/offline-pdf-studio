# PRE_DEPLOYMENT_REPORT

## Commands and results
- `npm run generate:fixtures`: PASS
- `npm run test:unit`: PASS
- `npm run test:integration`: PASS
- `npm run test:static`: PASS
- `npm run build`: PASS
- `npm run test:dist`: PASS
- `npm run test:ui`: PASS

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
- dist/web/app.js: 794 KB
- dist/web/worker.js: 427 KB
- dist/web/pdf.worker.mjs: 1371 KB

## Known limitations
- The browser UI is covered by automated Playwright smoke tests (tests/ui/smoke.test.mjs) under Chromium. Multi-browser parity (Firefox and Safari/WebKit engines) and real desktop extension runtimes should be smoke-tested manually before release.
- Rendering is tested with node-canvas; browser canvases may antialias slightly differently (boxes are expanded to whole pixels and re-verified in the browser at run time).
- Compression uses pure client-side rasterized JPEG encoding; it is highly effective (50-80% reduction) for scanned/image-heavy documents, but text-only/vector PDFs are refused with NOT_COMPRESSIBLE since client-side tools cannot re-compress vector streams.
- Metadata sanitization currently targets known Info dictionary fields; unsupported structures are documented.

## Git status
```
M PRE_DEPLOYMENT_REPORT.md
 M README.md
 M scripts/generate-predeployment-report.mjs
 M tests/fixtures/scanned.pdf
 M tests/fixtures/secret.pdf
```

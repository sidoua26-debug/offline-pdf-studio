import { stat, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectMetadata } from '../src/pdf-core/metadata.mjs';
import { verifyRedactionOutput } from '../src/pdf-core/verify.mjs';
import { redactByRasterizedRebuild } from '../src/pdf-core/redaction.mjs';
import { createNodeRenderer } from '../tests/helpers/nodeRenderer.mjs';

const execFileAsync = promisify(execFile);

async function run(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { encoding: 'utf8' });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.trim() ?? '',
      stderr: error.stderr?.trim() ?? error.message
    };
  }
}

const commands = [
  ['npm', ['run', 'generate:fixtures']],
  ['npm', ['run', 'test:unit']],
  ['npm', ['run', 'test:integration']],
  ['npm', ['run', 'test:static']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'test:dist']],
  ['npm', ['run', 'test:ui']]
];

const commandResults = [];
for (const [cmd, args] of commands) {
  const result = await run(cmd, args);
  commandResults.push({ cmd: `${cmd} ${args.join(' ')}`, ...result });
}

const fixturePath = 'tests/fixtures/sample.pdf';
const fixtureBuffer = await readFile(fixturePath);
const fixtureMeta = await inspectMetadata(fixtureBuffer);
const renderer = createNodeRenderer();
const box = { x: 60, y: 60, width: 200, height: 60 };
const redacted = await redactByRasterizedRebuild({
  pdfBuffer: fixtureBuffer,
  redactions: [{ page: 1, rects: [box] }],
  renderPageToPng: renderer.renderPageToPng,
  verifyRects: renderer.verifyBlackRects
});
await renderer.close();
const verification = await verifyRedactionOutput({ pdfBytes: redacted.bytes, redactedPages: [1] });
const fixtureSize = (await stat(fixturePath)).size;
const redactedSize = redacted.bytes.byteLength;

const sizeOf = async (f) => ((await stat(f)).size / 1024).toFixed(0);
const bundleSizes = (await Promise.all(['app.js', 'worker.js', 'pdf.worker.mjs'].map(async (f) => `- dist/web/${f}: ${await sizeOf(`dist/web/${f}`)} KB`))).join('\n');

const gitStatus = await run('git', ['status', '--short']);

const report = `# PRE_DEPLOYMENT_REPORT

## Commands and results
${commandResults.map((r) => `- \`${r.cmd}\`: ${r.ok ? 'PASS' : 'FAIL'}`).join('\n')}

## Fixture and output sizes
- Fixture file: ${fixturePath} (${fixtureSize} bytes)
- Redacted sample output: ${redactedSize} bytes

## Verification results
- Mode: ${redacted.mode}
- Terminology: ${redacted.terminology}
- Surfaces checked: ${verification.surfacesChecked.join(', ')}
- Heuristic checks: ${verification.heuristicChecks.join(', ')}

## Metadata summary
- Fixture title: ${fixtureMeta.metadata.title}
- Supported metadata features: ${fixtureMeta.featureMatrix.supported.length}
- Unsupported metadata structures: ${fixtureMeta.featureMatrix.unsupported.length}

## Bundle sizes
${bundleSizes}

## Known limitations
- The browser UI (drag-to-box viewer, file pickers, downloads) has no automated browser test; it is covered only by build, wiring checks and a run of the built worker bundle. Smoke-test it manually in Chrome, Firefox and Safari before release.
- Rendering is tested with node-canvas; browser canvases may antialias slightly differently (boxes are expanded to whole pixels and re-verified in the browser at run time).
- Metadata sanitization currently targets known Info dictionary fields; unsupported structures are documented.

## Git status
\`\`\`
${gitStatus.ok ? gitStatus.stdout || '(clean)' : '(not a git repository)'}
\`\`\`
`;

await writeFile('PRE_DEPLOYMENT_REPORT.md', report, 'utf8');

if (commandResults.some((r) => !r.ok)) {
  console.error('One or more checks failed. PRE_DEPLOYMENT_REPORT.md was still generated.');
  process.exit(1);
}

console.log('Generated PRE_DEPLOYMENT_REPORT.md');

import { createWorkerMessageHandler } from '../src/pdf-core/workerProtocol.mjs';
import { mergePdfBuffers, splitPdfBySelection, rotatePdfPages } from '../src/pdf-core/mergeSplitRotate.mjs';
import { inspectMetadata, sanitizeMetadata } from '../src/pdf-core/metadata.mjs';

const toBytes = (data) => new Uint8Array(data);
const out = (bytes) => ({ value: { bytes }, transferables: [bytes.buffer] });

const handlers = {
  async ping(payload, ctx) {
    ctx.progress({ stage: 'start' });
    return { value: { ok: true, echo: payload } };
  },
  async merge({ files }) {
    return out(await mergePdfBuffers(files.map(toBytes)));
  },
  async split({ file, selection }) {
    return out(await splitPdfBySelection(toBytes(file), selection));
  },
  async rotate({ file, requests }) {
    return out(await rotatePdfPages(toBytes(file), requests));
  },
  async inspect({ file }) {
    return { value: await inspectMetadata(toBytes(file)) };
  },
  async sanitize({ file }) {
    return out(await sanitizeMetadata(toBytes(file)));
  }
};

const handler = createWorkerMessageHandler(handlers);
self.onmessage = (event) => handler(event, self.postMessage.bind(self));

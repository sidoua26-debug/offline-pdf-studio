import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerController, createWorkerMessageHandler } from '../../src/pdf-core/workerProtocol.mjs';

class FakeWorker {
  constructor(serverHandler) {
    this.serverHandler = serverHandler;
    this.onmessage = null;
  }

  postMessage(message) {
    this.serverHandler({ data: message }, (response) => {
      this.onmessage?.({ data: response });
    });
  }
}

test('worker protocol supports request IDs and progress events', async () => {
  const server = createWorkerMessageHandler({
    async ping(payload, ctx) {
      ctx.progress({ phase: 'half' });
      return { value: { ok: true, payload } };
    }
  });

  const fakeWorker = new FakeWorker(server);
  const controller = new WorkerController(fakeWorker);

  const progresses = [];
  const result = await controller.request('ping', { x: 1 }, { onProgress: (p) => progresses.push(p.phase) });

  assert.deepEqual(progresses, ['half']);
  assert.equal(result.ok, true);
  assert.equal(result.payload.x, 1);
});

test('a crashed worker rejects pending and future requests instead of hanging', async () => {
  const silent = { onmessage: null, onerror: null, postMessage() {} };
  const controller = new WorkerController(silent);
  const pending = controller.request('merge', {});
  silent.onerror({ message: 'out of memory' });
  await assert.rejects(pending, (e) => e.code === 'WORKER_CRASHED');
  await assert.rejects(controller.request('merge', {}), (e) => e.code === 'WORKER_CRASHED');
});

test('cancelling removes the pending entry so a late reply is ignored', async () => {
  const silent = { onmessage: null, onerror: null, postMessage() {} };
  const controller = new WorkerController(silent);
  const ac = new AbortController();
  const p = controller.request('merge', {}, { signal: ac.signal });
  ac.abort();
  await assert.rejects(p, (e) => e.code === 'CANCELLED');
  assert.equal(controller.pending.size, 0);
  silent.onmessage({ data: { type: 'result', id: 'req-1', result: 1 } }); // must not throw
});

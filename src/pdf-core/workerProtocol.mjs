import { createError } from './errors.mjs';

export class WorkerController {
  constructor(workerLike) {
    this.worker = workerLike;
    this.seq = 0;
    this.pending = new Map();
    this.abortControllers = new Map();
    this.crashed = null;

    // A worker that dies (out of memory, uncaught exception, unreadable script) never replies,
    // so every pending request must be rejected or the UI waits forever.
    const crash = (event) => {
      this.crashed = createError('WORKER_CRASHED', 'The background worker stopped unexpectedly. Reload the page and try again.', {
        message: event?.message ?? 'Worker failure'
      });
      for (const entry of this.pending.values()) entry.reject(this.crashed);
      this.pending.clear();
      this.abortControllers.clear();
    };
    this.worker.onerror = crash;
    this.worker.onmessageerror = crash;

    this.worker.onmessage = (event) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;

      if (msg.type === 'progress') {
        entry.onProgress?.(msg.progress);
        return;
      }

      if (msg.type === 'result') {
        this.pending.delete(msg.id);
        this.abortControllers.delete(msg.id);
        entry.resolve(msg.result);
        return;
      }

      if (msg.type === 'error') {
        this.pending.delete(msg.id);
        this.abortControllers.delete(msg.id);
        const err = createError(msg.error.code ?? 'WORKER_ERROR', msg.error.message ?? 'Worker error', msg.error.details ?? {});
        entry.reject(err);
      }
    };
  }

  request(action, payload, { onProgress, signal, transfer = [] } = {}) {
    const id = `req-${++this.seq}`;
    if (this.crashed) return Promise.reject(this.crashed);
    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      const onAbort = () => {
        this.pending.delete(id);
        this.abortControllers.delete(id);
        this.worker.postMessage({ type: 'cancel', id, action: 'cancel' });
        reject(createError('CANCELLED', 'Operation cancelled'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      abortController.signal.addEventListener('abort', onAbort, { once: true });

      this.pending.set(id, { resolve, reject, onProgress });
      this.abortControllers.set(id, abortController);
      this.worker.postMessage({ type: 'request', id, action, payload }, transfer);
    });
  }

  cancel(id) {
    const controller = this.abortControllers.get(id);
    if (controller) controller.abort();
  }
}

export function createWorkerMessageHandler(handlers) {
  const cancellations = new Set();

  return async function onMessage(event, postMessage) {
    const msg = event.data;
    if (msg.type === 'cancel') {
      cancellations.add(msg.id);
      return;
    }

    if (msg.type !== 'request') return;
    const handler = handlers[msg.action];
    if (!handler) {
      postMessage({ type: 'error', id: msg.id, error: { code: 'UNKNOWN_ACTION', message: `No handler for action: ${msg.action}` } });
      return;
    }

    try {
      const result = await handler(msg.payload, {
        isCancelled: () => cancellations.has(msg.id),
        progress: (progress) => postMessage({ type: 'progress', id: msg.id, progress })
      });

      if (cancellations.has(msg.id)) {
        throw createError('CANCELLED', 'Operation cancelled');
      }

      const transfer = result?.transferables ?? [];
      postMessage({ type: 'result', id: msg.id, result: result?.value ?? result }, transfer);
    } catch (error) {
      postMessage({
        type: 'error',
        id: msg.id,
        error: {
          code: error.code ?? 'WORKER_EXECUTION_ERROR',
          message: error.message ?? 'Worker execution failed',
          details: error.details ?? {}
        }
      });
    } finally {
      cancellations.delete(msg.id);
    }
  };
}

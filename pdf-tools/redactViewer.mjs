import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfjsAssetOptions } from './browserRenderer.mjs';

/**
 * Page viewer where the user drags boxes. Boxes are stored in PDF points with the displayed
 * page's top-left origin (pdf.js viewport at scale 1), which is what the redaction core expects.
 */
export class RedactViewer {
  constructor({ stage, canvas, overlay, assetBase, onChange }) {
    this.stage = stage;
    this.canvas = canvas;
    this.overlay = overlay;
    this.assetBase = assetBase;
    this.onChange = onChange;
    this.pdf = null;
    this.pageNumber = 1;
    this.scale = 1;
    this.pageSize = { width: 0, height: 0 };
    this.boxes = new Map(); // pageNumber -> [{x,y,width,height}]
    this.renderToken = 0;
    this.currentRenderTask = null;
    this.undoStack = [];
    this.#bindPointer();
  }

  get pageCount() { return this.pdf?.numPages ?? 0; }

  async load(bytes) {
    await this.close();
    this.boxes.clear();
    this.undoStack = [];
    const task = getDocument({ data: bytes.slice(), isEvalSupported: false, ...pdfjsAssetOptions(this.assetBase) });
    this.task = task;
    this.pdf = await task.promise;
    this.pageNumber = 1;
    await this.show(1);
  }

  async close() {
    this.renderToken += 1;
    this.currentRenderTask?.cancel();
    this.currentRenderTask = null;
    if (this.task) await this.task.destroy();
    this.task = null;
    this.pdf = null;
  }

  async show(pageNumber) {
    if (!this.pdf) return;
    this.pageNumber = Math.min(Math.max(1, pageNumber), this.pdf.numPages);
    const token = ++this.renderToken;
    // A newer request supersedes any render still in flight on the shared canvas.
    this.currentRenderTask?.cancel();
    const page = await this.pdf.getPage(this.pageNumber);
    if (token !== this.renderToken) { page.cleanup(); return; }

    const base = page.getViewport({ scale: 1 });
    const available = Math.max(240, this.stage.clientWidth || 800);
    this.scale = Math.min(1.5, available / base.width);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: this.scale * dpr });
    this.pageSize = { width: base.width, height: base.height };
    this.canvas.width = Math.ceil(viewport.width);
    this.canvas.height = Math.ceil(viewport.height);
    this.canvas.style.width = `${base.width * this.scale}px`;
    this.canvas.style.height = `${base.height * this.scale}px`;
    this.overlay.style.width = this.canvas.style.width;
    this.overlay.style.height = this.canvas.style.height;
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.#drawBoxes();

    const task = page.render({ canvasContext: ctx, viewport, canvas: this.canvas });
    this.currentRenderTask = task;
    try {
      await task.promise;
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') throw error;
    } finally {
      if (this.currentRenderTask === task) this.currentRenderTask = null; // never clobber a newer task
      page.cleanup();
    }
  }

  boxesFor(pageNumber) { return this.boxes.get(pageNumber) ?? []; }

  get canUndo() { return this.undoStack.length > 0; }

  addBox(box, pageNumber = this.pageNumber) {
    this.undoStack.push({ type: 'add', pageNumber });
    this.boxes.set(pageNumber, [...this.boxesFor(pageNumber), box]);
    this.#changed();
  }

  removeBox(pageNumber, index) {
    const box = this.boxesFor(pageNumber)[index];
    if (box) this.undoStack.push({ type: 'remove', pageNumber, index, box });
    this.boxes.set(pageNumber, this.boxesFor(pageNumber).filter((_, i) => i !== index));
    this.#changed();
  }

  undo() {
    const step = this.undoStack.pop();
    if (!step) return false;
    const list = [...this.boxesFor(step.pageNumber)];
    if (step.type === 'add') list.pop();
    else list.splice(step.index, 0, step.box);
    this.boxes.set(step.pageNumber, list);
    if (step.pageNumber !== this.pageNumber) this.show(step.pageNumber).then(() => this.onChange?.());
    else this.#changed();
    return true;
  }

  coverWholePage() {
    this.addBox({ x: 0, y: 0, width: this.pageSize.width, height: this.pageSize.height });
  }

  redactions() {
    return [...this.boxes.entries()]
      .filter(([, rects]) => rects.length > 0)
      .map(([page, rects]) => ({ page, rects }));
  }

  /** Emphasises one box on the page (used when its list entry is hovered or focused). */
  highlight(index) {
    this.overlay.querySelectorAll('.box').forEach((el) => {
      el.classList?.toggle('active', index !== null && el.dataset?.index === String(index));
    });
  }

  #changed() {
    this.#drawBoxes();
    this.onChange?.();
  }

  #drawBoxes() {
    this.overlay.querySelectorAll('.box').forEach((el) => el.remove());
    this.boxesFor(this.pageNumber).forEach((box, index) => {
      const el = document.createElement('div');
      el.className = 'box';
      el.style.left = `${box.x * this.scale}px`;
      el.style.top = `${box.y * this.scale}px`;
      el.style.width = `${box.width * this.scale}px`;
      el.style.height = `${box.height * this.scale}px`;
      el.dataset.index = String(index);
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(index + 1);
      el.append(badge);
      this.overlay.append(el);
    });
  }

  #bindPointer() {
    let start = null;
    let preview = null;
    const point = (event) => {
      const rect = this.overlay.getBoundingClientRect();
      return {
        x: Math.min(Math.max(0, event.clientX - rect.left), rect.width),
        y: Math.min(Math.max(0, event.clientY - rect.top), rect.height)
      };
    };
    this.overlay.addEventListener('pointerdown', (event) => {
      if (!this.pdf || event.button !== 0) return; // ignore right/middle clicks
      this.overlay.setPointerCapture(event.pointerId);
      start = point(event);
      preview = document.createElement('div');
      preview.className = 'box preview';
      this.overlay.append(preview);
    });
    this.overlay.addEventListener('pointermove', (event) => {
      if (!start || !preview) return;
      const p = point(event);
      preview.style.left = `${Math.min(start.x, p.x)}px`;
      preview.style.top = `${Math.min(start.y, p.y)}px`;
      preview.style.width = `${Math.abs(p.x - start.x)}px`;
      preview.style.height = `${Math.abs(p.y - start.y)}px`;
    });
    const finish = (event) => {
      if (!start) return;
      const p = point(event);
      try { this.overlay.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      preview?.remove();
      const width = Math.abs(p.x - start.x) / this.scale;
      const height = Math.abs(p.y - start.y) / this.scale;
      if (width >= 4 && height >= 4) {
        this.addBox({ x: Math.min(start.x, p.x) / this.scale, y: Math.min(start.y, p.y) / this.scale, width, height });
      }
      start = null;
      preview = null;
    };
    this.overlay.addEventListener('pointerup', finish);
    this.overlay.addEventListener('pointercancel', () => { preview?.remove(); start = null; preview = null; });
  }
}

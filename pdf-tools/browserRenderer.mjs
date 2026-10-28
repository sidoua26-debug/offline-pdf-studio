import { createPageRenderer } from '../src/pdf-core/index.mjs';

export function createBrowserRenderer(assetBase) {
  return createPageRenderer({
    createCanvas: (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    canvasToPng: (canvas) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('Canvas could not be encoded as PNG (page may be too large for this browser)'));
          resolve(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/png');
      }),
    canvasToJpeg: (canvas, quality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('Canvas could not be encoded as JPEG (page may be too large for this browser)'));
          resolve(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/jpeg', quality);
      }),
    documentOptions: pdfjsAssetOptions(assetBase)
  });
}

export function pdfjsAssetOptions(assetBase) {
  return {
    cMapUrl: new URL('cmaps/', assetBase).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assetBase).href
  };
}

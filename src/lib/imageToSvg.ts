import ImageTracer from 'imagetracerjs';

export interface TraceParams {
  threshold: number;
  despeckle: number;
  smoothing: number;
  invert: boolean;
}

const TRACE_MAX_DIM = 1024;

export async function traceImage(file: File | Blob, params: TraceParams): Promise<string> {
  const imageData = await loadAsImageData(file, TRACE_MAX_DIM);
  const binary = binarize(imageData, params.threshold, params.invert);
  const rawSvg = ImageTracer.imagedataToSVG(binary, {
    numberofcolors: 2,
    pathomit: Math.max(0, Math.round(params.despeckle)),
    ltres: 1.0,
    qtres: Math.max(0.01, params.smoothing),
    blurradius: 0,
    strokewidth: 0,
    colorquantcycles: 1,
    mincolorratio: 0,
  });
  return keepForegroundPaths(rawSvg);
}

async function loadAsImageData(file: File | Blob, maxDim: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width;
  let h = bitmap.height;
  const longest = Math.max(w, h);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    w = Math.max(2, Math.round(w * scale));
    h = Math.max(2, Math.round(h * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

function binarize(src: ImageData, threshold01: number, invert: boolean): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data.length), src.width, src.height);
  const t = threshold01 * 255;
  for (let i = 0; i < src.data.length; i += 4) {
    const r = src.data[i];
    const g = src.data[i + 1];
    const b = src.data[i + 2];
    const a = src.data[i + 3];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    let on = lum < t;
    if (invert) on = !on;
    if (a < 128) on = false;
    const v = on ? 0 : 255;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

function keepForegroundPaths(svg: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const paths = doc.querySelectorAll('path');
  paths.forEach((p) => {
    const fill = (p.getAttribute('fill') || '').trim().toLowerCase();
    if (!fill || fill === 'none') {
      p.remove();
      return;
    }
    const rgb = parseFill(fill);
    if (!rgb) return;
    const brightness = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    if (brightness > 128) p.remove();
  });
  return new XMLSerializer().serializeToString(doc);
}

function parseFill(input: string): { r: number; g: number; b: number } | null {
  if (input.startsWith('#')) {
    const hex = input.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const m = input.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

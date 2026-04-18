import ImageTracer from 'imagetracerjs';
import {
  polygonToPathD,
  smoothMultiPolygon,
  svgToMultiPolygon,
  type MultiPolygon,
} from './polygonHelpers';

export type SilhouetteSource = 'auto' | 'alpha' | 'luminance';

export interface TraceParams {
  source: SilhouetteSource;
  threshold: number | null;
  despeckle: number;
  smoothing: number;
  curveSmoothing: number;
  invert: boolean;
  includeDetails: boolean;
  detailThreshold: number | null;
}

const TRACE_MAX_DIM = 1600;

export type PathRole = 'silhouette' | 'detail';

export interface TracedPath {
  id: string;
  d: string;
  role: PathRole;
  area: number;
}

export interface TraceResult {
  paths: TracedPath[];
  silhouettePathIds: string[];
  detailPathIds: string[];
  empty: boolean;
  resolvedSource: 'alpha' | 'luminance';
  alphaDetected: boolean;
  otsuThreshold: number;
  usedThreshold: number;
  detailOtsu: number;
  width: number;
  height: number;
}

export async function traceImage(file: File | Blob, params: TraceParams): Promise<TraceResult> {
  const imageData = await loadAsImageData(file, TRACE_MAX_DIM);
  const otsu = otsuThreshold(imageData) / 255;
  const alphaDetected = hasAlphaCoverage(imageData);

  const resolvedSource: 'alpha' | 'luminance' =
    params.source === 'auto' ? (alphaDetected ? 'alpha' : 'luminance') : params.source;

  const usedThreshold = params.threshold ?? otsu;

  let silhouetteBinary =
    resolvedSource === 'alpha'
      ? binarizeByAlpha(imageData, params.invert)
      : binarizeByLuminance(imageData, usedThreshold, params.invert);
  silhouetteBinary = majorityFilter3x3(silhouetteBinary);

  const silhouetteMp = traceAndSmooth(silhouetteBinary, params);

  const detailOtsu = otsuInsideMask(imageData, silhouetteBinary) / 255;
  const detailThreshold = params.detailThreshold ?? detailOtsu;

  let detailMp: MultiPolygon = [];
  if (params.includeDetails) {
    const detailBinary = buildDetailBinary(imageData, silhouetteBinary, 0, detailThreshold);
    const smoothed = majorityFilter3x3(detailBinary);
    detailMp = traceAndSmooth(smoothed, params);
  }

  const paths: TracedPath[] = [];
  silhouetteMp.forEach((poly, i) => {
    paths.push({
      id: `silhouette_${i}`,
      d: polygonToPathD(poly, true),
      role: 'silhouette',
      area: absPolyArea(poly),
    });
  });
  detailMp.forEach((poly, i) => {
    paths.push({
      id: `detail_${i}`,
      d: polygonToPathD(poly, true),
      role: 'detail',
      area: absPolyArea(poly),
    });
  });

  return {
    paths,
    silhouettePathIds: paths.filter((p) => p.role === 'silhouette').map((p) => p.id),
    detailPathIds: paths.filter((p) => p.role === 'detail').map((p) => p.id),
    empty: silhouetteMp.length === 0,
    resolvedSource,
    alphaDetected,
    otsuThreshold: otsu,
    usedThreshold,
    detailOtsu,
    width: imageData.width,
    height: imageData.height,
  };
}

function absPolyArea(poly: MultiPolygon[number]): number {
  if (poly.length === 0) return 0;
  const ring = poly[0];
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function traceAndSmooth(binary: ImageData, params: TraceParams): MultiPolygon {
  const rawSvg = ImageTracer.imagedataToSVG(binary, {
    numberofcolors: 2,
    pathomit: Math.max(0, Math.round(params.despeckle)),
    ltres: Math.max(0.01, params.smoothing * 0.5),
    qtres: Math.max(0.01, params.smoothing),
    blurradius: 0,
    strokewidth: 0,
    colorquantcycles: 1,
    mincolorratio: 0,
    roundcoords: 1,
  });
  const cleaned = cleanTraceSvg(rawSvg, binary.width, binary.height);
  const mp = svgToMultiPolygon(cleaned);
  return smoothMultiPolygon(mp, Math.max(0, Math.round(params.curveSmoothing)));
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

function hasAlphaCoverage(src: ImageData): boolean {
  const d = src.data;
  const total = d.length / 4;
  let transparent = 0;
  const step = Math.max(1, Math.floor(total / 20000));
  let sampled = 0;
  for (let i = 3; i < d.length; i += 4 * step) {
    if (d[i] < 128) transparent++;
    sampled++;
  }
  if (sampled === 0) return false;
  return transparent / sampled > 0.03;
}

function otsuThreshold(src: ImageData): number {
  const hist = new Uint32Array(256);
  let total = 0;
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const lum = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[lum]++;
    total++;
  }
  if (total === 0) return 128;
  return computeOtsu(hist, total);
}

function otsuInsideMask(src: ImageData, mask: ImageData): number {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    if (mask.data[i] >= 128) continue;
    const lum = Math.round(
      0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2],
    );
    hist[lum]++;
    total++;
  }
  if (total === 0) return 128;
  return computeOtsu(hist, total);
}

function computeOtsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let best = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const vb = wB * wF * (mB - mF) * (mB - mF);
    if (vb > maxVar) {
      maxVar = vb;
      best = t;
    }
  }
  return best;
}

function binarizeByAlpha(src: ImageData, invert: boolean): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data.length), src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    let on = src.data[i + 3] >= 128;
    if (invert) on = !on;
    const v = on ? 0 : 255;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

function binarizeByLuminance(src: ImageData, threshold01: number, invert: boolean): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data.length), src.width, src.height);
  const t = threshold01 * 255;
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    let on = lum < t;
    if (invert) on = !on;
    if (src.data[i + 3] < 128) on = false;
    const v = on ? 0 : 255;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

function buildDetailBinary(
  source: ImageData,
  silhouette: ImageData,
  lowLum01: number,
  highLum01: number,
): ImageData {
  const out = new ImageData(new Uint8ClampedArray(source.data.length), source.width, source.height);
  const low = lowLum01 * 255;
  const high = highLum01 * 255;
  for (let i = 0; i < source.data.length; i += 4) {
    const inSil = silhouette.data[i] < 128;
    if (!inSil) {
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = 255;
      continue;
    }
    const lum = 0.299 * source.data[i] + 0.587 * source.data[i + 1] + 0.114 * source.data[i + 2];
    const on = lum >= low && lum < high;
    const v = on ? 0 : 255;
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

function majorityFilter3x3(src: ImageData): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new ImageData(new Uint8ClampedArray(src.data.length), w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let count = 0;
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          total++;
          if (src.data[(yy * w + xx) * 4] < 128) count++;
        }
      }
      const on = count * 2 > total;
      const i = (y * w + x) * 4;
      const v = on ? 0 : 255;
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

function cleanTraceSvg(svg: string, w: number, h: number): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;

  root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  root.removeAttribute('width');
  root.removeAttribute('height');

  const imageArea = w * h;
  const paths = Array.from(doc.querySelectorAll('path'));
  for (const p of paths) {
    const fill = (p.getAttribute('fill') || '').trim().toLowerCase();
    if (!fill || fill === 'none') {
      p.remove();
      continue;
    }
    const rgb = parseFill(fill);
    if (rgb) {
      const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
      if (lum > 128) {
        p.remove();
        continue;
      }
    }
    const d = p.getAttribute('d') || '';
    const segments = (d.match(/[MLHVCSQTA]/gi) || []).length;
    if (segments < 4) {
      p.remove();
      continue;
    }
    if (looksLikeImageBounds(d, w, h, imageArea)) {
      p.remove();
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

function looksLikeImageBounds(d: string, w: number, h: number, imageArea: number): boolean {
  const pts = extractMoveLinePoints(d);
  if (pts.length < 4 || pts.length > 10) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bbArea = (maxX - minX) * (maxY - minY);
  const coversImage = minX <= 2 && minY <= 2 && maxX >= w - 2 && maxY >= h - 2;
  return coversImage && bbArea > imageArea * 0.9;
}

function extractMoveLinePoints(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /([MLCQ])\s*([-0-9.,\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const nums = m[2]
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter((n) => !isNaN(n));
    for (let i = 0; i + 1 < nums.length; i += 2) {
      out.push([nums[i], nums[i + 1]]);
    }
  }
  return out;
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

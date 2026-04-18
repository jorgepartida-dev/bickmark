import * as THREE from 'three';

export interface PngMeshOptions {
  maxDimension: number;
  baseThickness: number;
  reliefHeight: number;
  resolution: number;
  invert: boolean;
}

export async function pngToGeometry(
  file: File | Blob,
  opts: PngMeshOptions,
): Promise<THREE.BufferGeometry> {
  const bitmap = await createImageBitmap(file);
  const aspect = bitmap.width / bitmap.height;

  let w: number;
  let h: number;
  if (aspect >= 1) {
    w = opts.resolution;
    h = Math.max(2, Math.round(opts.resolution / aspect));
  } else {
    h = opts.resolution;
    w = Math.max(2, Math.round(opts.resolution * aspect));
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);

  const heights = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const a = data[i * 4 + 3] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const h01 = opts.invert ? lum : 1 - lum;
    heights[i] = h01 * a;
  }

  const physWidth = aspect >= 1 ? opts.maxDimension : opts.maxDimension * aspect;
  const physHeight = aspect >= 1 ? opts.maxDimension / aspect : opts.maxDimension;

  return buildHeightmapSolid(
    heights,
    w,
    h,
    physWidth,
    physHeight,
    opts.baseThickness,
    opts.reliefHeight,
  );
}

function buildHeightmapSolid(
  heights: Float32Array,
  w: number,
  h: number,
  physWidth: number,
  physHeight: number,
  baseThickness: number,
  reliefHeight: number,
): THREE.BufferGeometry {
  const cellX = physWidth / (w - 1);
  const cellY = physHeight / (h - 1);
  const originX = -physWidth / 2;
  const originY = -physHeight / 2;

  const positions: number[] = [];
  const indices: number[] = [];

  // Top surface: flip image Y so row 0 (top of image) sits at max world Y.
  for (let y = 0; y < h; y++) {
    const worldY = originY + (h - 1 - y) * cellY;
    for (let x = 0; x < w; x++) {
      positions.push(
        originX + x * cellX,
        worldY,
        baseThickness + heights[y * w + x] * reliefHeight,
      );
    }
  }
  const TOP = 0;
  const BOT = w * h;
  for (let y = 0; y < h; y++) {
    const worldY = originY + (h - 1 - y) * cellY;
    for (let x = 0; x < w; x++) {
      positions.push(originX + x * cellX, worldY, 0);
    }
  }

  // Top faces (normal +Z). Row y+1 has smaller world Y.
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = TOP + y * w + x;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }

  // Bottom faces (normal -Z → reversed).
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = BOT + y * w + x;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const topIdx = (y: number, x: number) => TOP + y * w + x;
  const botIdx = (y: number, x: number) => BOT + y * w + x;

  // Bottom edge of image (y = h-1): outside is -Y world.
  for (let x = 0; x < w - 1; x++) {
    const t1 = topIdx(h - 1, x);
    const t2 = topIdx(h - 1, x + 1);
    const b1 = botIdx(h - 1, x);
    const b2 = botIdx(h - 1, x + 1);
    indices.push(t1, b1, b2, t1, b2, t2);
  }

  // Top edge of image (y = 0): outside is +Y world, so reverse.
  for (let x = 0; x < w - 1; x++) {
    const t1 = topIdx(0, x);
    const t2 = topIdx(0, x + 1);
    const b1 = botIdx(0, x);
    const b2 = botIdx(0, x + 1);
    indices.push(t1, t2, b2, t1, b2, b1);
  }

  // Left edge (x = 0): outside is -X world.
  for (let y = 0; y < h - 1; y++) {
    const t1 = topIdx(y, 0);
    const t2 = topIdx(y + 1, 0);
    const b1 = botIdx(y, 0);
    const b2 = botIdx(y + 1, 0);
    indices.push(t1, b1, b2, t1, b2, t2);
  }

  // Right edge (x = w-1): outside is +X world, so reverse.
  for (let y = 0; y < h - 1; y++) {
    const t1 = topIdx(y, w - 1);
    const t2 = topIdx(y + 1, w - 1);
    const b1 = botIdx(y, w - 1);
    const b2 = botIdx(y + 1, w - 1);
    indices.push(t1, t2, b2, t1, b2, b1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

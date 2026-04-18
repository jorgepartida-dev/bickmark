import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
import {
  bbox,
  circle,
  multiPolygonToShapes,
  polygonArea,
  svgToMultiPolygon,
  translateScale,
  type MultiPolygon,
} from './polygonHelpers';
import { offsetMultiPolygon } from './polygonOffset';

export interface SilhouetteParams {
  outlineWidth: number;
  thickness: number;
  targetLongSide: number;
  tassel: boolean;
  tasselDiameter: number;
  tasselMargin: number;
}

export interface DetailLayerInput {
  svg: string;
  color: string;
}

export interface SilhouetteMeshSet {
  outline: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  details: THREE.BufferGeometry[];
}

export function buildSilhouette(
  silhouetteSvg: string,
  detailInputs: DetailLayerInput[],
  p: SilhouetteParams,
): SilhouetteMeshSet {
  const rawSil = svgToMultiPolygon(silhouetteSvg);
  if (rawSil.length === 0) throw new Error('Traced silhouette has no fillable paths.');
  const filteredSil = dropLargestIfDominant(rawSil);

  const box = bbox(filteredSil);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const longest = Math.max(w, h);
  if (longest <= 0) throw new Error('Trace has zero extent.');
  const scale = p.targetLongSide / longest;
  const cx = box.minX + w / 2;
  const cy = box.minY + h / 2;

  const silhouette = translateScale(filteredSil, -cx, -cy, scale);

  const rawDetailMps: MultiPolygon[] = detailInputs.map((d) => {
    const raw = svgToMultiPolygon(d.svg);
    return translateScale(raw, -cx, -cy, scale);
  });

  // Clamp each detail to the silhouette so majority-filter / Chaikin
  // drift can't push detail geometry outside the body.
  const detailsFinal: MultiPolygon[] = rawDetailMps.map((mp) => {
    if (mp.length === 0 || silhouette.length === 0) return mp;
    try {
      return polygonClipping.intersection(mp, silhouette) as MultiPolygon;
    } catch {
      return mp;
    }
  });

  const dilated = offsetMultiPolygon(silhouette, p.outlineWidth);
  if (dilated.length === 0) {
    throw new Error('Outline dilation produced no geometry.');
  }

  let outline = polygonClipping.difference(dilated, silhouette) as MultiPolygon;

  // Combine all detail layers into one MP, then subtract in a single pass.
  let combinedDetails: MultiPolygon = [];
  for (const d of detailsFinal) {
    if (d.length === 0) continue;
    combinedDetails =
      combinedDetails.length === 0
        ? d
        : (polygonClipping.union(combinedDetails, d) as MultiPolygon);
  }

  let body = silhouette;
  if (combinedDetails.length > 0) {
    try {
      body = polygonClipping.difference(body, combinedDetails) as MultiPolygon;
    } catch {
      // fall back to iterative subtraction if union/diff fails
      for (const d of detailsFinal) {
        if (d.length === 0) continue;
        try {
          body = polygonClipping.difference(body, d) as MultiPolygon;
        } catch {
          /* keep body */
        }
      }
    }
  }

  if (p.tassel && p.tasselDiameter > 0) {
    const db = bbox(dilated);
    const topY = db.maxY;
    const holeY = topY - p.tasselMargin - p.tasselDiameter / 2;
    const holeCx = (db.minX + db.maxX) / 2;
    const holeRing = circle(p.tasselDiameter / 2, 48, holeCx, holeY);
    const holeMp: MultiPolygon = [[holeRing]];
    outline = polygonClipping.difference(outline, holeMp) as MultiPolygon;
    body = polygonClipping.difference(body, holeMp) as MultiPolygon;
    for (let i = 0; i < detailsFinal.length; i++) {
      if (detailsFinal[i].length === 0) continue;
      detailsFinal[i] = polygonClipping.difference(detailsFinal[i], holeMp) as MultiPolygon;
    }
  }

  return {
    outline: extrudeMultiPolygon(outline, p.thickness),
    body: extrudeMultiPolygon(body, p.thickness),
    details: detailsFinal.map((d) => extrudeMultiPolygon(d, p.thickness)),
  };
}

function dropLargestIfDominant(mp: MultiPolygon): MultiPolygon {
  if (mp.length < 2) return mp;
  let largestIdx = -1;
  let largestArea = 0;
  let totalArea = 0;
  for (let i = 0; i < mp.length; i++) {
    const a = polygonArea(mp[i]);
    totalArea += a;
    if (a > largestArea) {
      largestArea = a;
      largestIdx = i;
    }
  }
  if (largestIdx < 0 || totalArea === 0) return mp;
  const b = bbox([mp[largestIdx]]);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const full = bbox(mp);
  const fw = full.maxX - full.minX;
  const fh = full.maxY - full.minY;
  const coversFull = w > fw * 0.98 && h > fh * 0.98;
  const dominant = largestArea / totalArea > 0.85;
  if (coversFull && dominant) {
    return mp.filter((_, i) => i !== largestIdx);
  }
  return mp;
}

function extrudeMultiPolygon(mp: MultiPolygon, thickness: number): THREE.BufferGeometry {
  if (mp.length === 0) return new THREE.BufferGeometry();
  const shapes = multiPolygonToShapes(mp);
  const geometries = shapes.map(
    (s) =>
      new THREE.ExtrudeGeometry(s, {
        depth: thickness,
        bevelEnabled: false,
        curveSegments: 24,
      }),
  );
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!merged) throw new Error('Failed to merge extruded geometry.');
  merged.computeVertexNormals();
  return merged;
}

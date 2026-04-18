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

export interface SilhouetteMeshSet {
  outline: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  outerFootprint: MultiPolygon;
}

export function buildSilhouette(svgText: string, p: SilhouetteParams): SilhouetteMeshSet {
  const raw = svgToMultiPolygon(svgText);
  if (raw.length === 0) throw new Error('Traced SVG has no fillable paths.');

  const filtered = dropLargestIfDominant(raw);

  const box = bbox(filtered);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const longest = Math.max(w, h);
  if (longest <= 0) throw new Error('Trace has zero extent.');

  const scale = p.targetLongSide / longest;
  const cx = box.minX + w / 2;
  const cy = box.minY + h / 2;
  const body = translateScale(filtered, -cx, -cy, scale);

  const dilated = offsetMultiPolygon(body, p.outlineWidth);
  if (dilated.length === 0) {
    throw new Error('Outline dilation produced no geometry. Check trace quality.');
  }

  let outline = polygonClipping.difference(
    dilated,
    body,
  ) as MultiPolygon;

  let bodyFinal = body;

  if (p.tassel && p.tasselDiameter > 0) {
    const dilatedBox = bbox(dilated);
    const topY = dilatedBox.maxY;
    const holeY = topY - p.tasselMargin - p.tasselDiameter / 2;
    const holeCx = (dilatedBox.minX + dilatedBox.maxX) / 2;
    const holeRing = circle(p.tasselDiameter / 2, 48, holeCx, holeY);
    const holeMp: MultiPolygon = [[holeRing]];
    outline = polygonClipping.difference(
      outline,
      holeMp,
    ) as MultiPolygon;
    bodyFinal = polygonClipping.difference(
      bodyFinal,
      holeMp,
    ) as MultiPolygon;
  }

  return {
    outline: extrudeMultiPolygon(outline, p.thickness),
    body: extrudeMultiPolygon(bodyFinal, p.thickness),
    outerFootprint: dilated,
  };
}

function dropLargestIfDominant(mp: MultiPolygon): MultiPolygon {
  if (mp.length < 2) return mp;
  let largestIdx = -1;
  let largestArea = 0;
  let totalArea = 0;
  const areas: number[] = [];
  for (let i = 0; i < mp.length; i++) {
    const a = polygonArea(mp[i]);
    areas.push(a);
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
    (s) => new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 24 }),
  );
  const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (!merged) throw new Error('Failed to merge extruded geometry.');
  merged.computeVertexNormals();
  return merged;
}

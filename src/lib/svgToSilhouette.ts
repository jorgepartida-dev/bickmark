import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
import {
  bbox,
  circle,
  multiPolygonToShapes,
  pathDToMultiPolygon,
  translateScale,
  type MultiPolygon,
} from './polygonHelpers';
import { offsetMultiPolygon } from './polygonOffset';
import type { TracedPath } from './imageToSvg';

export interface SilhouetteParams {
  outlineWidth: number;
  thickness: number;
  targetLongSide: number;
  tassel: boolean;
  tasselDiameter: number;
  tasselMargin: number;
}

export interface SlotMesh {
  slotId: number;
  geometry: THREE.BufferGeometry;
}

export interface SilhouetteMeshSet {
  outline: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  slots: SlotMesh[];
}

export interface BuildInput {
  paths: TracedPath[];
  silhouettePathIds: string[];
  assignments: Record<string, number>;
  userSlotIds: number[];
  width: number;
  height: number;
}

export function buildSilhouette(input: BuildInput, p: SilhouetteParams): SilhouetteMeshSet {
  const { paths, silhouettePathIds, assignments, userSlotIds, width, height } = input;

  const mpByPathId = new Map<string, MultiPolygon>();
  for (const path of paths) {
    mpByPathId.set(path.id, pathDToMultiPolygon(path.d, width, height));
  }

  let silhouette: MultiPolygon = [];
  for (const id of silhouettePathIds) {
    const mp = mpByPathId.get(id);
    if (!mp || mp.length === 0) continue;
    silhouette =
      silhouette.length === 0
        ? mp
        : (polygonClipping.union(silhouette, mp) as MultiPolygon);
  }
  if (silhouette.length === 0) throw new Error('Silhouette is empty.');

  const box = bbox(silhouette);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const longest = Math.max(w, h);
  if (longest <= 0) throw new Error('Silhouette has zero extent.');
  const scale = p.targetLongSide / longest;
  const cx = box.minX + w / 2;
  const cy = box.minY + h / 2;

  silhouette = translateScale(silhouette, -cx, -cy, scale);
  for (const [id, mp] of mpByPathId) {
    mpByPathId.set(id, translateScale(mp, -cx, -cy, scale));
  }

  const dilated = offsetMultiPolygon(silhouette, p.outlineWidth);
  if (dilated.length === 0) throw new Error('Outline dilation produced no geometry.');

  const slotRegions: Array<{ slotId: number; mp: MultiPolygon }> = [];
  let subtractedFromBody: MultiPolygon = [];

  for (const slotId of userSlotIds) {
    const pathIds = paths
      .filter((p) => (assignments[p.id] ?? 1) === slotId)
      .map((p) => p.id);

    let slotMp: MultiPolygon = [];
    for (const pid of pathIds) {
      const mp = mpByPathId.get(pid);
      if (!mp || mp.length === 0) continue;
      slotMp = slotMp.length === 0 ? mp : (polygonClipping.union(slotMp, mp) as MultiPolygon);
    }

    if (slotMp.length > 0) {
      try {
        slotMp = polygonClipping.intersection(slotMp, silhouette) as MultiPolygon;
      } catch {
        /* keep as-is */
      }
      if (subtractedFromBody.length > 0) {
        try {
          slotMp = polygonClipping.difference(slotMp, subtractedFromBody) as MultiPolygon;
        } catch {
          /* keep as-is */
        }
      }
    }

    slotRegions.push({ slotId, mp: slotMp });
    if (slotMp.length > 0) {
      subtractedFromBody =
        subtractedFromBody.length === 0
          ? slotMp
          : (polygonClipping.union(subtractedFromBody, slotMp) as MultiPolygon);
    }
  }

  let outline = polygonClipping.difference(dilated, silhouette) as MultiPolygon;
  let body =
    subtractedFromBody.length > 0
      ? (polygonClipping.difference(silhouette, subtractedFromBody) as MultiPolygon)
      : silhouette;

  if (p.tassel && p.tasselDiameter > 0) {
    const db = bbox(dilated);
    const topY = db.maxY;
    const holeY = topY - p.tasselMargin - p.tasselDiameter / 2;
    const holeCx = (db.minX + db.maxX) / 2;
    const holeRing = circle(p.tasselDiameter / 2, 48, holeCx, holeY);
    const holeMp: MultiPolygon = [[holeRing]];
    try {
      outline = polygonClipping.difference(outline, holeMp) as MultiPolygon;
    } catch {
      /* keep */
    }
    try {
      body = polygonClipping.difference(body, holeMp) as MultiPolygon;
    } catch {
      /* keep */
    }
    for (const sr of slotRegions) {
      if (sr.mp.length === 0) continue;
      try {
        sr.mp = polygonClipping.difference(sr.mp, holeMp) as MultiPolygon;
      } catch {
        /* keep */
      }
    }
  }

  return {
    outline: extrudeMultiPolygon(outline, p.thickness),
    body: extrudeMultiPolygon(body, p.thickness),
    slots: slotRegions.map((sr) => ({
      slotId: sr.slotId,
      geometry: extrudeMultiPolygon(sr.mp, p.thickness),
    })),
  };
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import polygonClipping from 'polygon-clipping';
import {
  bbox,
  circle,
  multiPolygonToShapes,
  roundedRect,
  svgToMultiPolygon,
  translateScale,
  type MultiPolygon,
  type Ring,
} from './polygonHelpers';

export interface FrameParams {
  shape: 'rect' | 'circle';
  outerWidth: number;
  outerHeight: number;
  cornerRadius: number;
  borderWidth: number;
  padding: number;
  thickness: number;
  tassel: boolean;
  tasselDiameter: number;
  tasselMargin: number;
}

export interface MeshSet {
  logo: THREE.BufferGeometry;
  frame: THREE.BufferGeometry;
  background: THREE.BufferGeometry;
}

export function buildMeshes(svgText: string, p: FrameParams): MeshSet {
  const rawLogo = svgToMultiPolygon(svgText);
  if (rawLogo.length === 0) throw new Error('Traced SVG has no fillable paths.');

  const outerRing = p.shape === 'circle'
    ? circle(Math.min(p.outerWidth, p.outerHeight) / 2)
    : roundedRect(p.outerWidth, p.outerHeight, p.cornerRadius);

  const innerW = p.outerWidth - 2 * p.borderWidth;
  const innerH = p.outerHeight - 2 * p.borderWidth;
  if (innerW <= 0 || innerH <= 0) {
    throw new Error('Border width too large for outer dimensions.');
  }
  const innerR = Math.max(0, p.cornerRadius - p.borderWidth);
  const innerRing = p.shape === 'circle'
    ? circle(Math.min(innerW, innerH) / 2)
    : roundedRect(innerW, innerH, innerR);

  const logoBox = bbox(rawLogo);
  const logoW = logoBox.maxX - logoBox.minX;
  const logoH = logoBox.maxY - logoBox.minY;
  const availW = innerW - 2 * p.padding;
  const availH = innerH - 2 * p.padding;
  if (availW <= 0 || availH <= 0) {
    throw new Error('Padding too large for inner window.');
  }
  const logoScale = Math.min(availW / logoW, availH / logoH);
  const cx = logoBox.minX + logoW / 2;
  const cy = logoBox.minY + logoH / 2;
  const logoMulti = translateScale(rawLogo, -cx, -cy, logoScale);

  const clips: MultiPolygon[] = [];
  if (p.tassel && p.tasselDiameter > 0) {
    const holeY = p.outerHeight / 2 - p.tasselMargin - p.tasselDiameter / 2;
    const tasselRing = circle(p.tasselDiameter / 2, 48, 0, holeY);
    clips.push([[tasselRing]]);
  }

  const frameMulti = polygonClipping.difference(
    [[outerRing]],
    [[innerRing]],
    ...clips,
  ) as MultiPolygon;

  const backgroundMulti = polygonClipping.difference(
    [[innerRing]],
    logoMulti as unknown as Ring[][],
    ...clips,
  ) as MultiPolygon;

  const logoGeom = extrudeMultiPolygon(logoMulti, p.thickness);
  const frameGeom = extrudeMultiPolygon(frameMulti, p.thickness);
  const backgroundGeom = extrudeMultiPolygon(backgroundMulti, p.thickness);

  return { logo: logoGeom, frame: frameGeom, background: backgroundGeom };
}

function extrudeMultiPolygon(mp: MultiPolygon, thickness: number): THREE.BufferGeometry {
  if (mp.length === 0) {
    return new THREE.BufferGeometry();
  }
  const shapes = multiPolygonToShapes(mp);
  const geometries = shapes.map((s) =>
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

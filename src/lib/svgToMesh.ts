import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface SvgMeshOptions {
  thickness: number;
  maxDimension: number;
}

export function svgToGeometry(svgText: string, opts: SvgMeshOptions): THREE.BufferGeometry {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);
  const geometries: THREE.BufferGeometry[] = [];

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: opts.thickness,
        bevelEnabled: false,
        curveSegments: 24,
      });
      geometries.push(geom);
    }
  }

  if (geometries.length === 0) {
    throw new Error('SVG has no fillable paths.');
  }

  const merged = mergeGeometries(geometries, false);
  if (!merged) throw new Error('Failed to merge SVG geometry.');

  merged.scale(1, -1, 1);
  reverseWinding(merged);

  merged.computeBoundingBox();
  const size = new THREE.Vector3();
  merged.boundingBox!.getSize(size);
  const longest = Math.max(size.x, size.y);
  if (longest > 0) {
    const s = opts.maxDimension / longest;
    merged.scale(s, s, 1);
  }

  merged.computeBoundingBox();
  const center = new THREE.Vector3();
  merged.boundingBox!.getCenter(center);
  merged.translate(-center.x, -center.y, -merged.boundingBox!.min.z);
  merged.computeVertexNormals();
  return merged;
}

function reverseWinding(g: THREE.BufferGeometry): void {
  const idx = g.index;
  if (!idx) return;
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = t;
  }
  idx.needsUpdate = true;
}

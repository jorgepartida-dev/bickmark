import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

export type Pair = [number, number];
export type Ring = Pair[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

const CURVE_SEGMENTS = 48;

export function roundedRect(
  w: number,
  h: number,
  r: number,
  segmentsPerCorner = 12,
): Ring {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const ring: Ring = [];
  const corners: Array<{ cx: number; cy: number; start: number }> = [
    { cx: w / 2 - rr, cy: -h / 2 + rr, start: -Math.PI / 2 },
    { cx: w / 2 - rr, cy: h / 2 - rr, start: 0 },
    { cx: -w / 2 + rr, cy: h / 2 - rr, start: Math.PI / 2 },
    { cx: -w / 2 + rr, cy: -h / 2 + rr, start: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const t = i / segmentsPerCorner;
      const a = c.start + t * (Math.PI / 2);
      ring.push([c.cx + rr * Math.cos(a), c.cy + rr * Math.sin(a)]);
    }
  }
  return ring;
}

export function circle(radius: number, segments = 64, cx = 0, cy = 0): Ring {
  const ring: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return ring;
}

export function svgToMultiPolygon(svgText: string): MultiPolygon {
  const loader = new SVGLoader();
  const data = loader.parse(svgText);
  const polys: MultiPolygon = [];
  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const outer = shapeToRing(shape, CURVE_SEGMENTS);
      if (outer.length < 3) continue;
      const holes = shape.holes.map((h) => pathToRing(h, CURVE_SEGMENTS)).filter((r) => r.length >= 3);
      polys.push([outer, ...holes]);
    }
  }
  return polys;
}

function shapeToRing(shape: THREE.Shape, segments: number): Ring {
  const pts = shape.getPoints(segments);
  return pts.map((p) => [p.x, -p.y] as Pair);
}

function pathToRing(path: THREE.Path, segments: number): Ring {
  const pts = path.getPoints(segments);
  return pts.map((p) => [p.x, -p.y] as Pair);
}

export function bbox(mp: MultiPolygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of mp) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

export function translateScale(
  mp: MultiPolygon,
  tx: number,
  ty: number,
  s: number,
): MultiPolygon {
  return mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => [(x + tx) * s, (y + ty) * s] as Pair)));
}

export function multiPolygonToShapes(mp: MultiPolygon): THREE.Shape[] {
  return mp.map(polygonToShape);
}

function polygonToShape(polygon: Polygon): THREE.Shape {
  const [outer, ...holes] = polygon;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) {
    shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return shape;
}


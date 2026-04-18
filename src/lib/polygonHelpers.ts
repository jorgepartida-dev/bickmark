import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import polygonClipping from 'polygon-clipping';

export type Pair = [number, number];
export type Ring = Pair[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

const CURVE_SEGMENTS = 96;

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
  if (polys.length <= 1) return polys;
  // Union all parsed polygons so disjoint same-fill shapes (e.g. body + fins)
  // all survive, and nested same-fill paths that should union do so cleanly.
  let result: MultiPolygon = [polys[0]];
  for (let i = 1; i < polys.length; i++) {
    try {
      result = polygonClipping.union(result, [polys[i]]) as MultiPolygon;
    } catch {
      result.push(polys[i]);
    }
  }
  return result;
}

function shapeToRing(shape: THREE.Shape, segments: number): Ring {
  const pts = shape.getPoints(segments);
  return pts.map((p) => [p.x, -p.y] as Pair);
}

function pathToRing(path: THREE.Path, segments: number): Ring {
  const pts = path.getPoints(segments);
  return pts.map((p) => [p.x, -p.y] as Pair);
}

export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function polygonArea(poly: Polygon): number {
  if (poly.length === 0) return 0;
  let a = Math.abs(ringArea(poly[0]));
  for (let i = 1; i < poly.length; i++) a -= Math.abs(ringArea(poly[i]));
  return Math.max(0, a);
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

export function chaikinSmooth(ring: Ring, iterations: number): Ring {
  if (iterations <= 0 || ring.length < 3) return ring;
  let current = ring;
  for (let i = 0; i < iterations; i++) {
    const next: Ring = [];
    for (let j = 0; j < current.length; j++) {
      const [x1, y1] = current[j];
      const [x2, y2] = current[(j + 1) % current.length];
      next.push([0.75 * x1 + 0.25 * x2, 0.75 * y1 + 0.25 * y2]);
      next.push([0.25 * x1 + 0.75 * x2, 0.25 * y1 + 0.75 * y2]);
    }
    current = next;
  }
  return current;
}

export function smoothMultiPolygon(mp: MultiPolygon, iterations: number): MultiPolygon {
  if (iterations <= 0) return mp;
  return mp.map((poly) => poly.map((ring) => chaikinSmooth(ring, iterations)));
}

export function pathDToMultiPolygon(d: string, width: number, height: number): MultiPolygon {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
  return svgToMultiPolygon(svg);
}

export function polygonToPathD(poly: Polygon, unflipY: boolean): string {
  const parts: string[] = [];
  for (const ring of poly) {
    if (ring.length < 3) continue;
    const [first, ...rest] = ring;
    const sy0 = unflipY ? -first[1] : first[1];
    let seg = `M${num(first[0])},${num(sy0)}`;
    for (const [x, y] of rest) {
      const sy = unflipY ? -y : y;
      seg += `L${num(x)},${num(sy)}`;
    }
    seg += 'Z';
    parts.push(seg);
  }
  return parts.join(' ');
}

export function multiPolygonToSvg(
  mp: MultiPolygon,
  width: number,
  height: number,
  unflipY: boolean,
  fill: string,
): string {
  const parts: string[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const [first, ...rest] = ring;
      const sy0 = unflipY ? -first[1] : first[1];
      let d = `M${num(first[0])},${num(sy0)}`;
      for (const [x, y] of rest) {
        const sy = unflipY ? -y : y;
        d += `L${num(x)},${num(sy)}`;
      }
      d += 'Z';
      parts.push(`<path fill="${fill}" d="${d}"/>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`
  );
}

function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function compositeMultiPolygonsToSvg(
  layers: Array<{ mp: MultiPolygon; fill: string }>,
  width: number,
  height: number,
  unflipY: boolean,
): string {
  const parts: string[] = [];
  for (const layer of layers) {
    for (const poly of layer.mp) {
      for (const ring of poly) {
        if (ring.length < 3) continue;
        const [first, ...rest] = ring;
        const sy0 = unflipY ? -first[1] : first[1];
        let d = `M${num(first[0])},${num(sy0)}`;
        for (const [x, y] of rest) {
          const sy = unflipY ? -y : y;
          d += `L${num(x)},${num(sy)}`;
        }
        d += 'Z';
        parts.push(`<path fill="${layer.fill}" d="${d}"/>`);
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`
  );
}

export function multiPolygonToShapes(mp: MultiPolygon): THREE.Shape[] {
  return mp.map(polygonToShape);
}

function polygonToShape(polygon: Polygon): THREE.Shape {
  const [outer, ...holes] = polygon;
  const outerCCW = ringArea(outer) < 0 ? outer.slice().reverse() : outer;
  const shape = new THREE.Shape(outerCCW.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) {
    const holeCW = ringArea(hole) > 0 ? hole.slice().reverse() : hole;
    shape.holes.push(new THREE.Path(holeCW.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return shape;
}


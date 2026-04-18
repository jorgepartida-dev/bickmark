import * as ClipperLib from 'clipper-lib';
import { ringArea, type MultiPolygon, type Pair, type Polygon, type Ring } from './polygonHelpers';

const SCALE = 1000;
const ARC_TOLERANCE = 0.25;

export function offsetMultiPolygon(mp: MultiPolygon, deltaMm: number): MultiPolygon {
  if (mp.length === 0 || deltaMm === 0) return mp;
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE);
  for (const poly of mp) {
    for (const ring of poly) {
      const path = ringToClipper(ring);
      if (path.length < 3) continue;
      co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    }
  }
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, deltaMm * SCALE);
  return polyTreeToMultiPolygon(tree);
}

function ringToClipper(ring: Ring): ClipperLib.Path {
  return ring.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
}

function pointsToRing(path: ClipperLib.Path): Ring {
  return path.map((pt) => [pt.X / SCALE, pt.Y / SCALE] as Pair);
}

function ensureCCW(ring: Ring): Ring {
  return ringArea(ring) < 0 ? ring.slice().reverse() : ring;
}

function ensureCW(ring: Ring): Ring {
  return ringArea(ring) > 0 ? ring.slice().reverse() : ring;
}

function polyTreeToMultiPolygon(tree: ClipperLib.PolyTree): MultiPolygon {
  const result: MultiPolygon = [];
  const walk = (node: ClipperLib.PolyNode) => {
    const contour = node.Contour();
    const childs = node.Childs();
    if (!node.IsHole() && contour.length >= 3) {
      const poly: Polygon = [ensureCCW(pointsToRing(contour))];
      for (const child of childs) {
        if (child.IsHole() && child.Contour().length >= 3) {
          poly.push(ensureCW(pointsToRing(child.Contour())));
        }
      }
      result.push(poly);
      for (const child of childs) {
        for (const grand of child.Childs()) walk(grand);
      }
    }
  };
  for (const child of tree.Childs()) walk(child);
  return result;
}

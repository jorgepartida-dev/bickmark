declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }

  export type Path = IntPoint[];
  export type Paths = Path[];

  export enum JoinType {
    jtSquare = 0,
    jtRound = 1,
    jtMiter = 2,
  }

  export enum EndType {
    etOpenSquare = 0,
    etOpenRound = 1,
    etOpenButt = 2,
    etClosedLine = 3,
    etClosedPolygon = 4,
  }

  export class PolyNode {
    Contour: Path;
    Childs: PolyNode[];
    Parent: PolyNode;
    IsHole: boolean;
  }

  export class PolyTree extends PolyNode {
    Total: number;
  }

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: JoinType, endType: EndType): void;
    AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
    Clear(): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
  }

  const JS: {
    ScaleUpPath(p: Path, scale: number): void;
    ScaleUpPaths(p: Paths, scale: number): void;
    ScaleDownPath(p: Path, scale: number): void;
    ScaleDownPaths(p: Paths, scale: number): void;
  };

  export { JS };
}

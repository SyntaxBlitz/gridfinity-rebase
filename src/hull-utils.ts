// @ts-ignore TODO i guess we could add a declaration
import hull from 'hull.js';
import {
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshNormalMaterial,
  Shape,
  Vector2,
  Vector3,
} from 'three';
// @ts-expect-error
import UnionFind from 'union-find';

export const getShapeHullsForGeometry = (
  meshGeometry: BufferGeometry
): Shape[] => {
  const material = new MeshNormalMaterial();
  const mesh = new Mesh(meshGeometry, material);

  // Assuming you have a mesh named 'mesh'
  const geometry = mesh.geometry;
  geometry.computeBoundingBox(); // Ensure bounding box is up-to-date

  if (!geometry.boundingBox) {
    return [];
  }

  // Find the minimum z value (bottom layer)
  const boundingBox = geometry.boundingBox;
  const minZ = boundingBox.min.z;

  // Extract vertices at the bottom layer
  const positionAttribute = geometry.attributes.position;
  const bottomFaces: [[number, number], [number, number], [number, number]][] =
    [];

  for (let i = 0; i < positionAttribute.count; i += 3) {
    const vertexA = new Vector3();
    vertexA.fromBufferAttribute(positionAttribute, i);
    const vertexB = new Vector3();
    vertexB.fromBufferAttribute(positionAttribute, i + 1);
    const vertexC = new Vector3();
    vertexC.fromBufferAttribute(positionAttribute, i + 2);

    if (
      Math.abs(vertexA.z - minZ) < 0.001 &&
      Math.abs(vertexB.z - minZ) < 0.001 &&
      Math.abs(vertexC.z - minZ) < 0.001
    ) {
      // Allow for some floating-point tolerance
      bottomFaces.push([
        [vertexA.x, vertexA.y],
        [vertexB.x, vertexB.y],
        [vertexC.x, vertexC.y],
      ]);
    }
  }

  const CLOSENESS_THRESHOLD = 0.001;

  // the metaphors are all wonky here
  const forest = new UnionFind(bottomFaces.length);

  const getIslandsByRoot = () => {
    const islands = new Map<number, number[]>();

    for (let i = 0; i < bottomFaces.length; i++) {
      const root = forest.find(i);
      if (!islands.has(root)) {
        islands.set(root, []);
      }
      islands.get(root)!.push(i);
    }

    return islands;
  };

  const pointsClose = (a: [number, number], b: [number, number]) => {
    return (
      Math.abs(a[0] - b[0]) < CLOSENESS_THRESHOLD &&
      Math.abs(a[1] - b[1]) < CLOSENESS_THRESHOLD
    );
  };

  for (let i = 0; i < bottomFaces.length; i++) {
    const faceVertexA = bottomFaces[i][0];
    const faceVertexB = bottomFaces[i][1];
    const faceVertexC = bottomFaces[i][2];

    for (let j = 0; j < i; j++) {
      const [otherFaceA, otherFaceB, otherFaceC] = bottomFaces[j];
      if (
        pointsClose(otherFaceA, faceVertexA) ||
        pointsClose(otherFaceA, faceVertexB) ||
        pointsClose(otherFaceA, faceVertexC) ||
        pointsClose(otherFaceB, faceVertexA) ||
        pointsClose(otherFaceB, faceVertexB) ||
        pointsClose(otherFaceB, faceVertexC) ||
        pointsClose(otherFaceC, faceVertexA) ||
        pointsClose(otherFaceC, faceVertexB) ||
        pointsClose(otherFaceC, faceVertexC)
      ) {
        forest.link(i, j);
      }
    }
  }

  const islands = getIslandsByRoot();

  const islandGeometries: Shape[] = [];

  for (const island of islands.values()) {
    const points = island
      .map((faceIndex) => {
        const [vertexA, vertexB, vertexC] = bottomFaces[faceIndex];
        return [vertexA, vertexB, vertexC];
      })
      .flat(1);
    const cvxHull = hull(points, Infinity) as [number, number][];

    // Create a 2D shape from the convex hull vertices
    const shape = new Shape(cvxHull.map((v) => new Vector2(v[0], v[1])));
    islandGeometries.push(shape);
  }

  return islandGeometries;
};

// Standard Gridfinity: 42mm pitch, 35.6mm hull (42 - 2*3.2mm margin)
// Half-pitch Gridfinity: 21mm pitch, 14.6mm hull (21 - 2*3.2mm margin)
const EXPECTED_STANDARD = 35.6;
const EXPECTED_HALF = 14.6;
const badnessThreshold = 1;

export type BaseSize = 'standard' | 'half';

const getHullAvgSize = (island: Shape) => {
  const points = island.extractPoints(1).shape;
  const minX = Math.min(...points.map((v) => v.x));
  const maxX = Math.max(...points.map((v) => v.x));
  const minY = Math.min(...points.map((v) => v.y));
  const maxY = Math.max(...points.map((v) => v.y));
  return ((maxX - minX) + (maxY - minY)) / 2;
};

const isHullBad = (island: Shape) => {
  const avg = getHullAvgSize(island);
  return (
    Math.abs(avg - EXPECTED_STANDARD) > badnessThreshold &&
    Math.abs(avg - EXPECTED_HALF) > badnessThreshold
  );
};

export const detectBaseSize = (shapes: Shape[]): BaseSize => {
  if (shapes.length === 0) return 'standard';
  const avg = shapes.reduce((sum, s) => sum + getHullAvgSize(s), 0) / shapes.length;
  return Math.abs(avg - EXPECTED_HALF) < Math.abs(avg - EXPECTED_STANDARD) ? 'half' : 'standard';
};

// Cluster a list of 1D values: nearby values (within `threshold`) are averaged into one.
const clusterValues = (values: number[], threshold = 10): number[] => {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[] = [];
  let group: number[] = [];

  for (const v of sorted) {
    if (group.length === 0 || v - group[group.length - 1] < threshold) {
      group.push(v);
    } else {
      clusters.push(group.reduce((a, b) => a + b) / group.length);
      group = [v];
    }
  }
  if (group.length > 0) clusters.push(group.reduce((a, b) => a + b) / group.length);

  return clusters;
};

// Pairs up consecutive values and returns their midpoints: [a, b, c, d] → [(a+b)/2, (c+d)/2]
const midpointsOfPairs = (values: number[]): number[] => {
  const result: number[] = [];
  for (let i = 0; i < values.length; i += 2) {
    if (i + 1 < values.length) {
      result.push((values[i] + values[i + 1]) / 2);
    } else {
      result.push(values[i]); // odd column/row — leave as-is
    }
  }
  return result;
};

/**
 * Groups half-pitch shape centroids into 2×2 clusters and returns the center
 * of each cluster. Each cluster maps to one full-pitch Gridfinity base.
 */
export const groupHalfSizeShapesIntoFullPitchCenters = (
  shapes: Shape[]
): [number, number][] => {
  const centroids = shapes.map(getShapeBoundingBoxCentroid);

  const uniqueX = clusterValues(centroids.map((c) => c[0])).sort((a, b) => a - b);
  const uniqueY = clusterValues(centroids.map((c) => c[1])).sort((a, b) => a - b);

  const groupCentersX = midpointsOfPairs(uniqueX);
  const groupCentersY = midpointsOfPairs(uniqueY);

  const centers: [number, number][] = [];
  for (const cx of groupCentersX) {
    for (const cy of groupCentersY) {
      centers.push([cx, cy]);
    }
  }
  return centers;
};

export type RotationType = 'original' | 'x+' | 'x-' | 'y+' | 'y-' | '180';

export const getBestShapeHullsForGeometry = (
  meshGeometry: BufferGeometry,
  bypassRotationCheck: boolean = false
): {
  badness: number;
  shapes: Shape[];
  rotation: {
    type: RotationType;
    geometry: BufferGeometry;
    rotationMatrix: Matrix4;
  };
} => {
  let rotations = [
    {
      type: 'original',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4(),
    },
    {
      type: 'x+',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationX(Math.PI / 2),
    },
    {
      type: 'x-',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationX(-Math.PI / 2),
    },
    {
      type: 'y+',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(Math.PI / 2),
    },
    {
      type: 'y-',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(-Math.PI / 2),
    },
    {
      type: '180',
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(Math.PI),
    },
  ];

  for (const rotation of rotations) {
    rotation.geometry = meshGeometry.clone();
    rotation.geometry.applyMatrix4(rotation.rotationMatrix);
  }

  if (bypassRotationCheck) {
    rotations = [rotations[0]];
  }

  let best: ReturnType<typeof getBestShapeHullsForGeometry> | null = null;

  for (const rotation of rotations) {
    const shapes = getShapeHullsForGeometry(rotation.geometry);
    // console.log({ rotation, shapes });
    const badness = shapes.reduce((acc, shape) => {
      if (isHullBad(shape)) {
        return acc + 1;
      }
      return acc;
    }, 0);

    // console.log({ badness });

    if (best === null || badness < best.badness) {
      best = {
        badness,
        shapes,
        rotation: {
          type: rotation.type as any,
          geometry: rotation.geometry,
          rotationMatrix: rotation.rotationMatrix,
        },
      };
    }
  }

  // console.log({ best });

  if (!best) {
    throw new Error('No best found');
  }

  return best;
};

export const getZMinForGeometry = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox?.min.z ?? 0;
};

export const getShapeBoundingBoxCentroid = (shape: Shape) => {
  const { shape: points } = shape.extractPoints(40);
  const minX = Math.min(...points.map((v) => v.x));
  const maxX = Math.max(...points.map((v) => v.x));
  const minY = Math.min(...points.map((v) => v.y));
  const maxY = Math.max(...points.map((v) => v.y));

  return [(minX + maxX) / 2, (minY + maxY) / 2];
};

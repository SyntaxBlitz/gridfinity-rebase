import hull from "hull.js";
import {
  BufferGeometry,
  Matrix4,
  Mesh,
  MeshNormalMaterial,
  Shape,
  Vector2,
  Vector3,
} from "three";
// @ts-expect-error
import UnionFind from "union-find";

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

const expected = 35.6;
const badnessThreshold = 1;

const isHullBad = (island: Shape) => {
  const points = island.extractPoints(1).shape;

  const minX = Math.min(...points.map((v) => v.x));
  const maxX = Math.max(...points.map((v) => v.x));
  const minY = Math.min(...points.map((v) => v.y));
  const maxY = Math.max(...points.map((v) => v.y));

  const width = maxX - minX;
  const height = maxY - minY;

  console.log({ width, height });

  return (
    Math.abs(width - expected) > badnessThreshold ||
    Math.abs(height - expected) > badnessThreshold
  );
};

export type RotationType = "original" | "x+" | "x-" | "y+" | "y-" | "180";

export const getBestShapeHullsForGeometry = (
  meshGeometry: BufferGeometry
): {
  badness: number;
  shapes: Shape[];
  rotation: {
    type: RotationType;
    geometry: BufferGeometry;
    rotationMatrix: Matrix4;
  };
} => {
  const rotations = [
    {
      type: "original",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4(),
    },
    {
      type: "x+",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationX(Math.PI / 2),
    },
    {
      type: "x-",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationX(-Math.PI / 2),
    },
    {
      type: "y+",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(Math.PI / 2),
    },
    {
      type: "y-",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(-Math.PI / 2),
    },
    {
      type: "180",
      geometry: meshGeometry,
      rotationMatrix: new Matrix4().makeRotationY(Math.PI),
    },
  ];

  for (const rotation of rotations) {
    rotation.geometry = meshGeometry.clone();
    rotation.geometry.applyMatrix4(rotation.rotationMatrix);
  }

  let best: ReturnType<typeof getBestShapeHullsForGeometry> | null = null;

  for (const rotation of rotations) {
    const shapes = getShapeHullsForGeometry(rotation.geometry);
    console.log({ rotation, shapes });
    const badness = shapes.reduce((acc, shape) => {
      if (isHullBad(shape)) {
        return acc + 1;
      }
      return acc;
    }, 0);

    console.log({ badness });

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

  console.log({ best });

  if (!best) {
    throw new Error("No best found");
  }

  return best;
};

export const getZMinForGeometry = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox?.min.z ?? 0;
};

export const getShapeBoundingBoxCentroid = (shape: Shape) => {
  const { shape: points } = shape.extractPoints(1);
  const minX = Math.min(...points.map((v) => v.x));
  const maxX = Math.max(...points.map((v) => v.x));
  const minY = Math.min(...points.map((v) => v.y));
  const maxY = Math.max(...points.map((v) => v.y));

  return [(minX + maxX) / 2, (minY + maxY) / 2];
};

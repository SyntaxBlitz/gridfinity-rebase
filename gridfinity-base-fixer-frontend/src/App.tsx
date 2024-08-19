import { useEffect, useRef } from "react";
import "./App.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

// import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import hull from "hull.js";
// @ts-ignore
import UnionFind from "union-find";
UnionFind;

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;

const getEdges = (geo: THREE.BufferGeometry) => {
  // Create a set to store unique edges
  let geometry;
  const edges = new Set<string>();

  if (geo.index) {
    geometry = geo.toNonIndexed();
  } else {
    geometry = geo;
  }

  // Non-indexed geometry
  const positions = geometry.attributes.position.array;

  for (let i = 0; i < positions.length / 3; i += 3) {
    // Get the indices of the vertices of the face
    const a = i;
    const b = i + 1;
    const c = i + 2;

    // Add edges to the set
    addEdge(edges, a, b);
    addEdge(edges, b, c);
    addEdge(edges, c, a);
  }

  // Function to add an edge to the set
  function addEdge(edges: Set<string>, a: number, b: number) {
    // Ensure the smaller index comes first to avoid duplicates
    const edge = a < b ? `${a}-${b}` : `${b}-${a}`;
    edges.add(edge);
  }

  // Convert the set of edges to an array of edge pairs
  const edgeArray = Array.from(edges).map((edge: any) =>
    edge.split("-").map(Number)
  ) as [number, number][];

  console.log(edgeArray);
  return edgeArray;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -100,
      100,
      100 / RATIO,
      -100 / RATIO,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ canvas });

    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);

    const loader = new STLLoader();
    loader.load("gf-deburring.stl", (meshGeometry) => {
      const material = new THREE.MeshNormalMaterial();
      const mesh = new THREE.Mesh(meshGeometry, material);
      // scene.add(mesh);

      // Assuming you have a mesh named 'mesh'
      const geometry = mesh.geometry;
      geometry.computeBoundingBox(); // Ensure bounding box is up-to-date

      if (!geometry.boundingBox) {
        return;
      }

      // Find the minimum z value (bottom layer)
      const boundingBox = geometry.boundingBox;
      const minZ = boundingBox.min.z;

      // Extract vertices at the bottom layer
      const positionAttribute = geometry.attributes.position;
      // const bottomFaces: [[number, number], [number, number]][] = [];
      const bottomFaces: [
        [number, number],
        [number, number],
        [number, number]
      ][] = [];

      // const edges = getEdges(geometry);

      for (let i = 0; i < positionAttribute.count; i += 3) {
        const vertexA = new THREE.Vector3();
        vertexA.fromBufferAttribute(positionAttribute, i);
        const vertexB = new THREE.Vector3();
        vertexB.fromBufferAttribute(positionAttribute, i + 1);
        const vertexC = new THREE.Vector3();
        vertexC.fromBufferAttribute(positionAttribute, i + 2);

        if (
          Math.abs(vertexA.z - minZ) < 0.001 &&
          Math.abs(vertexB.z - minZ) < 0.001 &&
          Math.abs(vertexC.z - minZ) < 0.001
        ) {
          // Allow for some floating-point tolerance
          // bottomVertices.push(new THREE.Vector2(vertex.x, vertex.y)); // Project to 2D (x, y)
          bottomFaces.push([
            [vertexA.x, vertexA.y],
            [vertexB.x, vertexB.y],
            [vertexC.x, vertexC.y],
          ]);
        }
      }

      // for (const edge of edges) {
      //   const vertexA = new THREE.Vector3();
      //   const vertexB = new THREE.Vector3();
      //   vertexA.fromBufferAttribute(geometry.attributes.position, edge[0]);
      //   vertexB.fromBufferAttribute(geometry.attributes.position, edge[1]);

      //   if (
      //     Math.abs(vertexA.z - minZ) < 0.001 &&
      //     Math.abs(vertexB.z - minZ) < 0.001
      //   ) {
      //     bottomEdges.push([
      //       [vertexA.x, vertexA.y],
      //       [vertexB.x, vertexB.y],
      //     ]);
      //   }
      // }

      // const islands: {
      //   // [key: string]: [number, number][];
      //   [key: number]: number[];
      // } = {};

      const CLOSENESS_THRESHOLD = 0.001;

      // the metaphors are all wonky here
      const forest = new UnionFind(bottomFaces.length);

      // const getDistinctIslands = () => {
      //   const islands = new Set<number>();

      //   for (let i = 0; i < bottomFaces.length; i++) {
      //     islands.add(forest.find(i));
      //   }

      //   return Array.from(islands);
      // };

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
        let found = false;
        const faceVertexA = bottomFaces[i][0];
        const faceVertexB = bottomFaces[i][1];
        const faceVertexC = bottomFaces[i][2];

        // const distinctIslands = getDistinctIslands();

        // for (const island of Object.values(islands)) {

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

            found = true;
            // break;
          }

          // if (!found) {
          //   const nextIslandIndex = Object.keys(islands).length;
          //   islands[nextIslandIndex] = [faceVertexA, faceVertexB];
          // }
        }
      }

      // Optionally, sort the vertices to form a continuous path
      // bottomVertices.sort((a, b) => a.x - b.x || a.y - b.y);

      // console.log(islands);

      // Compute the convex hull
      // const points = [...islands[0]!.map((v) => [v.x, v.y])];]
      const islands = getIslandsByRoot();
      console.log(islands);

      for (const island of islands.values()) {
        const points = island
          .map((faceIndex) => {
            const [vertexA, vertexB, vertexC] = bottomFaces[faceIndex];
            return [vertexA, vertexB, vertexC];
          })
          .flat(1);
        const cvxHull = hull(points, Infinity) as [number, number][];

        // Create a 2D shape from the convex hull vertices
        const shape = new THREE.Shape(
          cvxHull.map((v) => new THREE.Vector2(v[0], v[1]))
        );

        // Optionally, visualize the shape
        const shapeGeometry = new THREE.ShapeGeometry(shape);
        // const randomColor = Math.random() * 0xffffff;
        const shapeMaterial = new THREE.MeshBasicMaterial({
          color: 0x3d1a96,
          side: THREE.DoubleSide,
        });
        const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
        scene.add(shapeMesh);
      }

      // // Or create a line to visualize the path
      // const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
      // const lineGeometry = new THREE.BufferGeometry().setFromPoints(
      //   bottomVertices
      // );
      // const line = new THREE.Line(lineGeometry, lineMaterial);
      // scene.add(line);
    });

    camera.position.z = 5;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
  }, [canvasRef.current]);

  return <canvas ref={canvasRef}></canvas>;
}

export default App;

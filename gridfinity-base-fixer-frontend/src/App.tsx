import { useEffect, useRef, useState } from "react";
import "./App.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import {
  getBestShapeHullsForGeometry,
  getZMinForGeometry,
} from "./hull-utils.ts";
import { loadSTLGeometry } from "./mesh-utils.ts";
import { generateScadForShapes, runOpenSCAD } from "./scad-utils.ts";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;

const loadFileAsBlob = async (filename: string): Promise<Blob> => {
  const response = await fetch(filename);
  const blob = await response.blob();
  return blob;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scad, setScad] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const scadRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);
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

  const run = async () => {
    if (!fileInputRef.current) {
      return;
    }

    const file = fileInputRef.current.files?.[0];
    if (!file) {
      return;
    }

    const toFix = await file.arrayBuffer();
    const toFixBlob = new Blob([toFix], { type: "application/octet-stream" });
    const toFixBlobUrl = URL.createObjectURL(toFixBlob);

    await (async () => {
      // const meshGeometry = await loadSTLGeometry("gf-zack-1.stl");
      const meshGeometry = await loadSTLGeometry(toFixBlobUrl);

      const { shapes, rotation } = getBestShapeHullsForGeometry(meshGeometry);
      const zMin = getZMinForGeometry(rotation.geometry!);
      // const shapes = getShapeHullsForGeometry(meshGeometry);

      console.log(shapes[0]);

      shapes.forEach((shape) => {
        const shapeGeometry = new THREE.ShapeGeometry(shape);
        const shapeMaterial = new THREE.MeshBasicMaterial({
          color: 0x3d1a96,
          side: THREE.DoubleSide,
        });
        const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
        sceneRef.current?.add(shapeMesh);
      });

      const scadSrc = generateScadForShapes(shapes, zMin);
      setScad(scadSrc);
      scadRef.current = scadSrc;
    })();

    const goldBlob = await loadFileAsBlob("gold.stl");
    const gold = await goldBlob.arrayBuffer();

    await runOpenSCAD(scadRef.current!, toFix, gold);
    // await runOpenSCAD(scad!, cube, cube);
  };

  return (
    <div>
      <canvas ref={canvasRef}></canvas>
      <pre>{scad}</pre>
      <input type="file" ref={fileInputRef} />
      <button onClick={run}>Run</button>
    </div>
  );
}

export default App;

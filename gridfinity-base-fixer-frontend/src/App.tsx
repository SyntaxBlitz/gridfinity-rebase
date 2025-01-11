import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

import { Alert, Box, Button, LinearProgress, Stack } from "@mui/material";

import * as idb from "idb";
import * as THREE from "three";

import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { Font, FontLoader } from "three/addons/loaders/FontLoader.js";

// import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { useOrbitCanvas, useRenderInputFile } from "./canvas.ts";
import { useLoadInputFileBlob } from "./file-utils.ts";
import {
  getBestShapeHullsForGeometry,
  getZMinForGeometry,
  RotationType,
} from "./hull-utils.ts";
import { loadSTLGeometry } from "./mesh-utils.ts";
import { generateScadForShapes, runOpenSCAD } from "./scad-utils.ts";

// todo nice to make this dynamic
const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 420;

const loadFileAsBlob = async (filename: string): Promise<Blob> => {
  const response = await fetch(filename);
  const blob = await response.blob();
  return blob;
};

const openDb = async () => {
  return await idb.openDB("gridfinity-rebase", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files");
      }
    },
  });
};

let loadedGold = false;
let abortGoldLoad = false;

function App() {
  const [scad, setScad] = useState<string | null>(null);

  const toFixInputRef = useRef<HTMLInputElement>(null);
  const goldInputRef = useRef<HTMLInputElement>(null);

  const [toFixInputFile, setToFixInputFile] = useState<File | null>(null);
  const [toFixInputBlob, setToFixInputBlob] = useState<Blob | null>(null);
  const [goldInputFile, setGoldInputFile] = useState<File | null>(null);
  const [goldInputBlob, setGoldInputBlob] = useState<Blob | null>(null);

  const [scadLoading, setScadLoading] = useState<boolean>(false);
  const [scadError, setScadError] = useState<string[] | null>(null);

  const [detections, setDetections] = useState<null | {
    shapeCount: number;
    rotation: RotationType;
  }>(null);

  const scadRef = useRef<string | null>(null);

  const { canvasRef: toFixCanvasRef, sceneRef: toFixSceneRef } = useOrbitCanvas(
    CANVAS_WIDTH,
    CANVAS_HEIGHT
  );
  const { canvasRef: goldCanvasRef, sceneRef: goldSceneRef } = useOrbitCanvas(
    CANVAS_WIDTH,
    CANVAS_HEIGHT
  );

  useRenderInputFile(toFixInputFile, toFixSceneRef);
  useLoadInputFileBlob(toFixInputFile, setToFixInputBlob);
  useRenderInputFile(goldInputFile, goldSceneRef);
  useLoadInputFileBlob(goldInputFile, setGoldInputBlob);

  useEffect(() => {
    if (goldInputFile !== null) {
      abortGoldLoad = true;
    }
  }, [goldInputFile]);

  useEffect(() => {
    (async () => {
      if (!goldInputFile) {
        return;
      }

      const goldBuffer = await goldInputFile.arrayBuffer();
      const goldBlob = new Blob([goldBuffer], {
        type: "application/octet-stream",
      });

      // store in indexeddb
      const db = await openDb();

      const tx = db.transaction("files", "readwrite");

      tx.store.put(goldBlob, "gold.stl");

      await tx.done;

      // console.log("stored gold.stl in indexeddb");
    })();
  }, [goldInputFile]);

  useEffect(() => {
    if (loadedGold) {
      return;
    }

    (async () => {
      const db = await openDb();

      // just to test aborting. though ig should go below the db.get
      // await new Promise((resolve) => setTimeout(resolve, 10000));

      const blob = await db.get("files", "gold.stl");

      if (!blob) {
        return;
      }

      if (abortGoldLoad) {
        return;
      }

      setGoldInputFile(new File([blob], "gold.stl"));

      loadedGold = true;
    })();
  }, [setGoldInputFile]);

  const run = useCallback(async () => {
    if (!toFixInputFile || !toFixInputBlob || !goldInputBlob) {
      console.log({ toFixInputFile, toFixInputBlob, goldInputBlob });
      return;
    }

    const toFixName = toFixInputFile.name;
    const toFixBlobUrl = URL.createObjectURL(toFixInputBlob);

    await (async () => {
      // const meshGeometry = await loadSTLGeometry("gf-zack-1.stl");
      const meshGeometry = await loadSTLGeometry(toFixBlobUrl);

      const { shapes, rotation } = getBestShapeHullsForGeometry(meshGeometry);

      const openSans = await new Promise<Font>((resolve) => {
        new FontLoader().load("open-sans.json", resolve);
      });

      shapes.forEach((shape, i) => {
        const shapeGeometry = new THREE.ShapeGeometry(shape);
        const zMin = getZMinForGeometry(rotation.geometry!);

        shapeGeometry.translate(0, 0, zMin);

        shapeGeometry.applyMatrix4(rotation.rotationMatrix.clone().invert());
        const shapeMaterial = new THREE.MeshBasicMaterial({
          color: 0x3d1a96,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
          depthTest: false,
          depthWrite: false,
        });
        const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
        shapeMesh.renderOrder = 999;
        // shapeMesh.material.transparent = true;
        toFixSceneRef.current?.add(shapeMesh);

        // todo we've massively over-imported open sans characters
        // https://gero3.github.io/facetype.js/

        // add a floating number for each one
        const textGeo = new TextGeometry(`${i + 1}`, {
          font: openSans,
          size: 16,
          height: 0.1,
        });
        const textMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        });
        const textMesh = new THREE.Mesh(textGeo, textMaterial);
        textMesh.renderOrder = 1000;

        const pointToCamera = () => {
          const camera = toFixSceneRef?.current?.userData.camera;
          if (!camera) {
            return;
          }
          textMesh.quaternion.copy(camera.quaternion);
          // textMesh.lookAt(camera.position); // this is pretty cute -- if you're near it, they'll point inward to you like crossed eyes
          // but that's probably more distracting than anything else
        };

        pointToCamera();
        textMesh.onBeforeRender = pointToCamera;

        // center the text geometry on its x axis
        const textCenter = new THREE.Vector3();
        textGeo.computeBoundingBox();
        textGeo.boundingBox!.getCenter(textCenter);
        textGeo.translate(-textCenter.x, 0, 0);

        shapeGeometry.computeBoundingBox();
        textGeo.computeBoundingBox();
        const shapeCenter = new THREE.Vector3();
        shapeGeometry.boundingBox!.getCenter(shapeCenter);
        textMesh.position.set(
          shapeCenter.x, //- textGeo.boundingBox!.max.x / 2,
          shapeCenter.y, //- textGeo.boundingBox!.max.y / 2,
          shapeCenter.z + 6
        );
        toFixSceneRef.current?.add(textMesh);
      });

      setDetections({
        shapeCount: shapes.length,
        rotation: rotation.type,
      });

      const zMin = getZMinForGeometry(rotation.geometry!);

      const scadSrc = generateScadForShapes(shapes, zMin, rotation);
      setScad(scadSrc);
      scadRef.current = scadSrc;
    })();

    setScadLoading(true);
    setScadError(null);

    const toFixBuffer = await toFixInputBlob.arrayBuffer();
    const goldBuffer = await goldInputBlob.arrayBuffer();

    try {
      const blobUrl = await runOpenSCAD(
        scadRef.current!,
        toFixBuffer,
        goldBuffer
      );

      const link = document.createElement("a");
      link.href = blobUrl;

      const fixedName = toFixName.replace(/\.stl$/, "-rebase.stl");
      link.download = fixedName;

      document.body.append(link);
      link.click();
      link.remove();
    } catch (e: any) {
      setScadError(e);
    } finally {
      setScadLoading(false);
    }
    // await runOpenSCAD(scad!, cube, cube);
  }, [
    toFixInputFile,
    toFixInputBlob,
    goldInputBlob,
    setScadLoading,
    setScadError,
    setScad,
  ]);

  return (
    <Stack width={960} margin="auto" spacing={2} alignItems="center" py={6}>
      <Stack direction="row" alignItems={"center"} spacing={2}>
        <Box
          position="relative"
          sx={{
            border: "1px solid #ddd",
          }}
        >
          <Stack
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
            }}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            width="100%"
            px={2}
            // py={1}
            boxSizing="border-box"
          >
            <h2>File to print</h2>

            <Button
              sx={{ backgroundColor: "white" }}
              variant="outlined"
              onClick={() => toFixInputRef.current?.click()}
            >
              Choose File
            </Button>
          </Stack>
          <input
            className="sr-only"
            type="file"
            ref={toFixInputRef}
            onChange={(e) => setToFixInputFile(e.target.files?.[0] ?? null)}
          />
          <canvas ref={toFixCanvasRef}></canvas>
        </Box>
        <Box>
          <h2>+</h2>
        </Box>
        <Stack>
          <Box
            position="relative"
            sx={{
              border: "1px solid #ddd",
            }}
          >
            <Stack
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
              }}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              width="100%"
              px={2}
              // py={1}
              boxSizing="border-box"
            >
              <h2>Replacement base</h2>
              <Button
                sx={{ backgroundColor: "white" }}
                variant="outlined"
                onClick={() => goldInputRef.current?.click()}
              >
                Choose File
              </Button>
            </Stack>
            <input
              className="sr-only"
              type="file"
              ref={goldInputRef}
              onChange={(e) => setGoldInputFile(e.target.files?.[0] ?? null)}
            />
            <canvas ref={goldCanvasRef}></canvas>
          </Box>
          <Box>
            Or upload <strong>any</strong> Gridfinity module with a base you
            like
          </Box>
        </Stack>
      </Stack>
      {/* <pre>{scad}</pre> */}
      <Button onClick={run}>Run</Button>
      <Stack spacing={2} width={640}>
        {detections === null ? null : (
          <>
            {detections.rotation !== "original" ? (
              <Alert severity="info">
                Decided to rotate the model first (
                <strong>{detections.rotation}</strong>) so that bases are flat
                on the XY plane.
              </Alert>
            ) : null}
            <Alert severity="info">
              Detected {detections.shapeCount} base
              {detections.shapeCount === 1 ? "" : "s"} to rebase.
            </Alert>
          </>
        )}
      </Stack>
      {scadLoading ? (
        <Stack spacing={1}>
          <Box>Running rebase operation. This can take some time!</Box>
          <LinearProgress />
        </Stack>
      ) : null}
      {scadError ? (
        <Box>
          OpenSCAD failed to run :/<pre>{scadError.join("\n")}</pre>
        </Box>
      ) : null}
    </Stack>
  );
}

export default App;

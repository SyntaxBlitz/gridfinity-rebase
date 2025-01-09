import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

import { Box, Button, LinearProgress, Stack } from "@mui/material";

import * as idb from "idb";

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
const RATIO = CANVAS_WIDTH / CANVAS_HEIGHT;

const loadFileAsBlob = async (filename: string): Promise<Blob> => {
  const response = await fetch(filename);
  const blob = await response.blob();
  return blob;
};

const openDb = async () => {
  return await idb.openDB("gridfinity-remag", 5, {
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

      const fixedName = toFixName.replace(/\.stl$/, "-remag.stl");
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
        <Stack spacing={2} alignItems="center">
          <h2>File to print</h2>
          <canvas ref={toFixCanvasRef}></canvas>
          <input
            type="file"
            ref={toFixInputRef}
            onChange={(e) => setToFixInputFile(e.target.files?.[0] ?? null)}
          />
        </Stack>
        <Box>
          <h2>+</h2>
        </Box>
        <Stack spacing={2} alignItems="center">
          <h2>STL with example base</h2>
          <canvas ref={goldCanvasRef}></canvas>
          <input
            type="file"
            ref={goldInputRef}
            onChange={(e) => setGoldInputFile(e.target.files?.[0] ?? null)}
          />
        </Stack>
      </Stack>
      {/* <pre>{scad}</pre> */}
      <Button onClick={run}>Run</Button>
      <Box>
        {detections === null ? null : (
          <>
            {detections.rotation !== "original" ? (
              <p>
                Decided to rotate the model first (
                <strong>{detections.rotation}</strong>) so that bases are flat
                on the XY plane.
              </p>
            ) : null}
            <p>
              Detected {detections.shapeCount} base
              {detections.shapeCount === 1 ? "" : "s"} to remag.
            </p>
          </>
        )}
      </Box>
      {scadLoading ? (
        <Stack spacing={1}>
          <Box>Running remag operation. This can take some time!</Box>
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

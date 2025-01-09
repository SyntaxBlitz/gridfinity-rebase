import { useCallback, useRef, useState } from "react";
import "./App.css";

import { Box, Button, LinearProgress, Stack } from "@mui/material";

// import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { useOrbitCanvas, useRenderInputFile } from "./canvas.ts";
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

function App() {
  const [scad, setScad] = useState<string | null>(null);

  const toFixInputRef = useRef<HTMLInputElement>(null);
  const goldInputRef = useRef<HTMLInputElement>(null);

  const [toFixInputFile, setToFixInputFile] = useState<File | null>(null);
  const [goldInputFile, setGoldInputFile] = useState<File | null>(null);

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
  useRenderInputFile(goldInputFile, goldSceneRef);

  const run = useCallback(async () => {
    if (!toFixInputFile || !goldInputFile) {
      return;
    }

    const toFix = await toFixInputFile.arrayBuffer();
    const toFixName = toFixInputFile.name;
    const toFixBlob = new Blob([toFix], { type: "application/octet-stream" });
    const toFixBlobUrl = URL.createObjectURL(toFixBlob);

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

    const goldBuffer = await goldInputFile.arrayBuffer();

    try {
      const blobUrl = await runOpenSCAD(scadRef.current!, toFix, goldBuffer);

      const link = document.createElement("a");
      link.href = blobUrl;

      const fixedName = toFixName.replace(/\.stl$/, "-remag.stl");
      link.download = fixedName;

      document.body.append(link);
      link.click();
      link.remove();
    } catch (e) {
      setScadError(e);
    } finally {
      setScadLoading(false);
    }
    // await runOpenSCAD(scad!, cube, cube);
  }, [toFixInputFile, goldInputFile, setScadLoading, setScadError, setScad]);

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

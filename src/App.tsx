import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  createTheme,
  Stack,
  ThemeProvider,
} from '@mui/material';

import * as idb from 'idb';
import * as THREE from 'three';

import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Font, FontLoader } from 'three/addons/loaders/FontLoader.js';

// import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { useOrbitCanvas, useRenderBlob } from './canvas.ts';
import { useLoadInputFileBlob } from './file-utils.ts';
import {
  getBestShapeHullsForGeometry,
  getZMinForGeometry,
  RotationType,
} from './hull-utils.ts';
import { Intro } from './Intro.tsx';
import { loadSTLGeometry } from './mesh-utils.ts';
import { generateScadForShapes, runOpenSCAD } from './scad-utils.ts';

// todo nice to make this dynamic
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;

const loadFileAsBlob = async (filename: string): Promise<Blob> => {
  const response = await fetch(filename);
  const blob = await response.blob();
  return blob;
};

const theme = createTheme({
  palette: {
    primary: {
      main: '#3d1a96',
    },
  },
  typography: {
    fontFamily: '"Exo 2", sans-serif',
    h1: {
      fontWeight: 600,
      fontSize: '2rem',
      color: '#111',
    },
    h2: {
      fontWeight: 600,
      fontSize: '1.5rem',
      color: '#333',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.3rem',
      color: '#333',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.1rem',
      color: '#333',
    },
  },
});

const openDb = async () => {
  return await idb.openDB('gridfinity-rebase', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    },
  });
};

function Symbol({ symbol }: { symbol: string }) {
  return (
    <Box
      sx={{
        // this feels like one of those things there's a better flexboxy way to do
        width: 'auto',
        height: CANVAS_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'row',

        // padding kinda random
        [`@container (max-width: ${CANVAS_WIDTH * 3 + 100}px)`]: {
          width: CANVAS_WIDTH,
          height: 'auto',
          flexDirection: 'column',
        },

        ' & h2': {
          margin: 0,
          padding: 0,
        },
      }}
    >
      <h2>{symbol}</h2>
    </Box>
  );
}

function Dropzone({ text, shown }: { text: string; shown: boolean }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1,
        width: '100%',
        height: '100%',

        backgroundColor: 'rgba(255, 255, 255, 0.9)',

        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',

        boxSizing: 'border-box',
        border: '12px dashed #ddd',
        borderRadius: 12,
        padding: 6,

        textAlign: 'center',
        fontWeight: 600,
        fontSize: '1.8em',

        pointerEvents: 'none',

        opacity: shown ? 1 : 0,
        transition: 'opacity 0.2s',
      }}
    >
      {text}
    </Box>
  );
}

let loadedGold = false;
let abortGoldLoad = false;

let lastAbortRun: null | { aborted: boolean } = null;

function App() {
  const toFixInputRef = useRef<HTMLInputElement>(null);
  const goldInputRef = useRef<HTMLInputElement>(null);

  const [toFixInputFile, setToFixInputFile] = useState<File | null>(null);
  const [toFixInputBlob, setToFixInputBlob] = useState<Blob | null>(null);
  const [goldInputFile, setGoldInputFile] = useState<File | null>(null);
  const [goldInputBlob, setGoldInputBlob] = useState<Blob | null>(null);

  const [fixedBlob, setFixedBlob] = useState<Blob | null>(null);

  const [draggingToFix, setDraggingToFix] = useState<boolean>(false);
  const [draggingGold, setDraggingGold] = useState<boolean>(false);

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
  const { canvasRef: fixedCanvasRef, sceneRef: fixedSceneRef } = useOrbitCanvas(
    CANVAS_WIDTH,
    CANVAS_HEIGHT
  );

  useRenderBlob(toFixInputBlob, toFixSceneRef);
  useLoadInputFileBlob(toFixInputFile, setToFixInputBlob);
  useRenderBlob(goldInputBlob, goldSceneRef);
  useLoadInputFileBlob(goldInputFile, setGoldInputBlob);
  useRenderBlob(fixedBlob, fixedSceneRef);

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
        type: 'application/octet-stream',
      });

      // store in indexeddb
      const db = await openDb();

      const tx = db.transaction('files', 'readwrite');

      tx.store.put(goldBlob, 'gold.stl');

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

      const blob = await db.get('files', 'gold.stl');

      if (!blob) {
        return;
      }

      if (abortGoldLoad) {
        return;
      }

      setGoldInputFile(new File([blob], 'gold.stl'));

      loadedGold = true;
    })();
  }, [setGoldInputFile]);

  useEffect(() => {
    run();
  }, [toFixInputBlob, goldInputBlob]);

  const run = useCallback(async () => {
    if (!toFixInputBlob || !goldInputBlob) {
      console.log({ toFixInputBlob, goldInputBlob });
      return;
    }

    // TODO actually abort running workers so they're not spinning
    if (lastAbortRun) {
      lastAbortRun.aborted = true;
    }

    let thisAbortRun = { aborted: false };
    lastAbortRun = thisAbortRun;

    setScadLoading(true);
    setScadError(null);
    setFixedBlob(null);

    const toFixBlobUrl = URL.createObjectURL(toFixInputBlob);

    // todo this is silly, a remnant from hacking -- should not load the font every time
    const [meshGeometry, openSans] = await Promise.all([
      loadSTLGeometry(toFixBlobUrl),

      new Promise<Font>((resolve) => {
        // todo we've massively over-imported open sans characters
        // https://gero3.github.io/facetype.js/
        new FontLoader().load('open-sans.json', resolve);
      }),
    ]);

    // his seems fast enough. we could do it in a worker if it were causing problems
    const { shapes, rotation } = getBestShapeHullsForGeometry(meshGeometry);

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
      toFixSceneRef.current?.add(shapeMesh);

      // add a floating number for each one
      const textGeo = new TextGeometry(`${i + 1}`, {
        font: openSans,
        size: 16,
        depth: 0.1,
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

    if (thisAbortRun.aborted) {
      return;
    }

    setDetections({
      shapeCount: shapes.length,
      rotation: rotation.type,
    });

    const zMin = getZMinForGeometry(rotation.geometry!);

    const scadSrc = generateScadForShapes(shapes, zMin, rotation);
    scadRef.current = scadSrc;

    const toFixBuffer = await toFixInputBlob.arrayBuffer();
    const goldBuffer = await goldInputBlob.arrayBuffer();

    const { blob, errors } = await runOpenSCAD(
      scadRef.current!,
      toFixBuffer,
      goldBuffer
    );

    if (thisAbortRun.aborted) {
      return;
    }

    setFixedBlob(blob);
    setScadError(errors);
    setScadLoading(false);
  }, [toFixInputBlob, goldInputBlob, setScadLoading, setScadError]);

  const showScadError =
    // we attempted a run, got output, but a null blob
    (scadError && fixedBlob === null) ||
    // even if we got a blob, there's an error in the output
    // e.g. non-manifold mesh
    (scadError?.some((e) => e.includes('ERROR:')) ?? false);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ containerType: 'size' }}>
        <Stack width="100%" spacing={6} alignItems="center" py={6} mb={10}>
          <Intro />

          <Stack
            alignItems={'center'}
            sx={{
              gap: 2,
              flexDirection: 'row',
              alignItems: 'flex-start',
              [`@container (max-width: ${CANVAS_WIDTH * 3 + 100}px)`]: {
                flexDirection: 'column',
                alignItems: 'center',
              },
            }}
          >
            <Stack alignItems="center" spacing={2}>
              <Box
                position="relative"
                sx={{
                  border: '1px solid #ddd',
                  display: 'flex',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggingToFix(true);
                }}
                onDragLeave={() => setDraggingToFix(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingToFix(false);
                  const file = e.dataTransfer.files[0];
                  setToFixInputFile(file);
                }}
              >
                <Dropzone text="Drop a file to fix" shown={draggingToFix} />
                <Stack
                  sx={{
                    position: 'absolute',
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
                  <h2>File to fix</h2>

                  <Button
                    sx={{ backgroundColor: 'white' }}
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
                  onChange={(e) =>
                    setToFixInputFile(e.target.files?.[0] ?? null)
                  }
                />
                <canvas
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  ref={toFixCanvasRef}
                ></canvas>
              </Box>
              <Stack spacing={2} maxWidth={CANVAS_WIDTH} aria-live="polite">
                {detections === null ? null : (
                  <>
                    {detections.rotation !== 'original' ? (
                      <Alert severity="info">
                        Decided to rotate the model first (
                        <strong>{detections.rotation}</strong>) so that bases
                        are flat on the XY plane.
                      </Alert>
                    ) : null}
                    <Alert severity="info">
                      Detected {detections.shapeCount} base
                      {detections.shapeCount === 1 ? '' : 's'} to replace.
                    </Alert>
                  </>
                )}
              </Stack>
            </Stack>
            <Symbol symbol="+" />
            <Stack alignItems="center" spacing={1}>
              <Box
                position="relative"
                sx={{
                  border: '1px solid #ddd',
                  display: 'flex',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDraggingGold(true);
                }}
                onDragLeave={() => setDraggingGold(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingGold(false);
                  const file = e.dataTransfer.files[0];
                  setGoldInputFile(file);
                }}
              >
                <Dropzone
                  text="Drop a file with a replacement base"
                  shown={draggingGold}
                />
                <Stack
                  sx={{
                    position: 'absolute',
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
                    sx={{ backgroundColor: 'white' }}
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
                  onChange={(e) =>
                    setGoldInputFile(e.target.files?.[0] ?? null)
                  }
                />
                <canvas
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  ref={goldCanvasRef}
                ></canvas>
              </Box>
              <Stack spacing={0} alignItems="center">
                <Box>Choose any Gridfinity module with a base you like.</Box>
                <Box
                  sx={{
                    fontSize: 14,
                    color: '#666',
                  }}
                >
                  (I'll remember this choice for later.)
                </Box>
              </Stack>
            </Stack>
            <Symbol symbol="=" />
            <Stack alignItems="stretch" spacing={2}>
              <Box
                position="relative"
                sx={{
                  border: '1px solid #ddd',
                  display: 'flex',
                }}
              >
                {scadLoading ? (
                  <Stack
                    spacing={4}
                    aria-live="polite"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      boxSizing: 'border-box',
                      padding: 2,
                      zIndex: 1,
                    }}
                  >
                    <Box>Calculating rebased STL. This can take some time!</Box>
                    {/* <LinearProgress /> */}
                    <CircularProgress />
                  </Stack>
                ) : null}
                <Stack
                  sx={{
                    position: 'absolute',
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
                  <h2>Rebased</h2>
                  {fixedBlob && (
                    <Button
                      // sx={{ backgroundColor: 'white' }}
                      variant="contained"
                      component="a"
                      // maybe should cache this
                      href={URL.createObjectURL(fixedBlob)}
                      download={
                        toFixInputFile
                          ? toFixInputFile.name.replace(
                              /\.stl$/,
                              '-rebased.stl'
                            )
                          : 'rebased.stl'
                      }
                    >
                      Save
                    </Button>
                  )}
                </Stack>
                <canvas
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  ref={fixedCanvasRef}
                ></canvas>
              </Box>
              {fixedBlob && !showScadError && (
                <Alert severity="success">Ready to save!</Alert>
              )}
            </Stack>
          </Stack>

          {showScadError ? (
            <Box sx={{ maxWidth: 'calc(min(960px, 80%))' }} aria-live="polite">
              <Alert severity="error">OpenSCAD encountered an error :/</Alert>
              <pre>{scadError?.join('\n')}</pre>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

export default App;

import { Shape } from 'three';
import { getShapeBoundingBoxCentroid, RotationType } from './hull-utils.ts';

import { v4 as uuidv4 } from 'uuid';

let scadWorker: Worker | null = null;

export const initSCADWorker = () => {
  scadWorker = new Worker(new URL('workers/scad-worker.ts', import.meta.url), {
    type: 'module',
  });
};

export const generateScadForShapes = (
  shapes: Shape[],
  zMin: number,
  rotation: {
    type: RotationType;
  },
  goldShape: Shape,
  goldZMin: number,
  goldRotation: {
    type: RotationType;
  }
) => {
  const centers = shapes.map((shape) => {
    return getShapeBoundingBoxCentroid(shape);
  });

  const goldCenter = getShapeBoundingBoxCentroid(goldShape);
  console.log({ goldCenter });

  return `
module simple_cut() {
    translate([-42 / 2, -42 / 2, 0]) cube([42, 42, 2.6]);
    translate([-34 / 2, -34 / 2, 0]) cube([34, 34, 5.5]);
}

module preferred_bottom() {
    intersection() {
        translate([-1 * ${goldCenter[0]},
                   -1 * ${goldCenter[1]},
                   -1 * ${goldZMin}]) {
          ${rotateSCADCodeForRotation(goldRotation.type)} {
            import("/gold.stl");
          }
        }
        simple_cut();
    }
}

union() {
    difference() {
        ${rotateSCADCodeForRotation(rotation.type)} import("/toFix.stl");

${centers
  .map(
    (center, i) =>
      `        translate([${center[0]}, ${center[1]}, ${zMin}]) simple_cut();`
  )
  .join('\n')}
    }

${centers
  .map(
    (center, i) =>
      `    translate([${center[0]}, ${center[1]}, ${zMin}]) preferred_bottom();`
  )
  .join('\n')}
}

`;
};

// i thought about 'undoing' the rotation, but frankly i think it's unlikely you'll
// have magnet hole preferences and _not_ want to have a consistent rotation when printing
// (e.g. because you're dropping magnets in the print or have specific slicer settings)
const rotateSCADCodeForRotation = (type: RotationType): string => {
  switch (type) {
    case 'x+':
      return 'rotate([90, 0, 0])';
    case 'x-':
      return 'rotate([-90, 0, 0])';
    case 'y+':
      return 'rotate([0, 90, 0])';
    case 'y-':
      return 'rotate([0, -90, 0])';
    case '180':
      return 'rotate([0, 0, 180])';
    default:
      return '';
  }
};

export const runOpenSCAD = (
  scadSrc: string,
  toFixStl: ArrayBuffer,
  goldStl: ArrayBuffer
): Promise<{
  blob: Blob | null;
  errors: string[];
}> => {
  return new Promise<{
    blob: Blob | null;
    errors: string[];
  }>((resolve, reject) => {
    try {
      if (!scadWorker) {
        throw new Error('SCAD worker not initialized');
      }

      const requestId = uuidv4();

      scadWorker.postMessage({
        scadSrc,
        toFixStl,
        goldStl,
        requestId,
      });

      // i guess this is a memory leak if aborting for another
      scadWorker.onmessage = (e) => {
        if (e.data.requestId !== requestId) {
          return;
        }

        resolve({
          blob: e.data.blob as Blob | null,
          errors: e.data.errors as string[],
        });
      };
    } catch (e) {
      resolve({
        blob: null,
        errors: [(e as Error).message],
      });
    }
  });
};

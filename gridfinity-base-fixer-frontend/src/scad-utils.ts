import { Shape } from "three";
import { getShapeBoundingBoxCentroid, RotationType } from "./hull-utils.ts";

// todo: get the positioning for the gold stl as well
export const generateScadForShapes = (
  shapes: Shape[],
  zMin: number,
  rotation: {
    type: RotationType;
  }
) => {
  const centers = shapes.map((shape) => {
    return getShapeBoundingBoxCentroid(shape);
  });

  return `
module simple_cut() {
    translate([-42 / 2, -42 / 2, 0]) cube([42, 42, 2.6]);
    translate([-34 / 2, -34 / 2, 0]) cube([34, 34, 5.5]);
}

module preferred_bottom() {
    intersection() {
        import("/gold.stl");
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
  .join("\n")}
    }
    
${centers
  .map(
    (center, i) =>
      `    translate([${center[0]}, ${center[1]}, ${zMin}]) preferred_bottom();`
  )
  .join("\n")}
}
`;
};

// i thought about 'undoing' the rotation, but frankly i think it's unlikely you'll
// have magnet hole preferences and _not_ want to have a consistent rotation
const rotateSCADCodeForRotation = (type: RotationType): string => {
  switch (type) {
    case "x+":
      return "rotate([90, 0, 0])";
    case "x-":
      return "rotate([-90, 0, 0])";
    case "y+":
      return "rotate([0, 90, 0])";
    case "y-":
      return "rotate([0, -90, 0])";
    case "180":
      return "rotate([0, 0, 180])";
    default:
      return "";
  }
};

export const runOpenSCAD = async (
  scadSrc: string,
  toFixName: string,
  toFixStl: ArrayBuffer,
  goldStl: ArrayBuffer
) => {
  const worker = new Worker(
    new URL("workers/scad-worker.js", import.meta.url),
    {
      type: "module",
    }
  );
  worker.postMessage({
    scadSrc,
    toFixStl,
    goldStl,
  });

  worker.onmessage = (e) => {
    // Generate a link to output 3D-model and download the output STL file
    const link = document.createElement("a");
    link.href = URL.createObjectURL(e.data);

    const fixedName = toFixName.replace(/\.stl$/, "-remag.stl");
    link.download = fixedName;

    document.body.append(link);
    link.click();
    link.remove();
  };
};

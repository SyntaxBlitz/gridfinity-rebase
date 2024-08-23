import { Shape } from "three";
import { getShapeBoundingBoxCentroid, RotationType } from "./hull-utils.ts";

// @ts-expect-error
import OpenSCAD from "./openscad.js";

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
  toFixStl: ArrayBuffer,
  goldStl: ArrayBuffer
) => {
  const filename = "fixed.stl";

  // Instantiate the application
  const instance = await OpenSCAD({ noInitialRun: true });

  let toWrite = scadSrc;
  // toWrite = 'import("/toFix.stl");';

  // Write a file to the filesystem
  instance.FS.writeFile("/input.scad", toWrite);
  instance.FS.writeFile("/gold.stl", new Uint8Array(goldStl), {}, "wb");
  instance.FS.writeFile("/toFix.stl", new Uint8Array(toFixStl), {}, "wb");

  // Run like a command-line program with arguments
  // instance.callMain(["/input.scad", "--enable=manifold", "-o", filename]); // manifold is faster at rendering
  console.log(1);
  instance.callMain([
    "/input.scad",
    "--enable=manifold",
    // "--enable=assimp",
    "-o",
    filename,
  ]); // manifold is faster at rendering
  console.log(2);

  // Read the output 3D-model into a JS byte-array
  const output = instance.FS.readFile("/" + filename);

  // Generate a link to output 3D-model and download the output STL file
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([output], { type: "application/octet-stream" })
  );
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
};

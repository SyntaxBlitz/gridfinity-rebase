// @ts-expect-error
import OpenSCAD from '../openscad.js';

onmessage = async (e) => {
  const { scadSrc, toFixStl, goldStl } = e.data;

  const printStatements: string[] = [];
  const errorStatements: string[] = [];

  try {
    await (async () => {
      const filename = 'fixed.stl';

      // Instantiate the application
      const instance = await OpenSCAD({
        noInitialRun: true,
        print: (x: string) => {
          printStatements.push(x);
          console.log(x);
        },
        printErr: (x: string) => errorStatements.push(x),
      });

      let toWrite = scadSrc;
      // toWrite = 'import("/toFix.stl");';

      // Write a file to the filesystem
      instance.FS.writeFile('/input.scad', toWrite);
      instance.FS.writeFile('/gold.stl', new Uint8Array(goldStl), {}, 'wb');
      instance.FS.writeFile('/toFix.stl', new Uint8Array(toFixStl), {}, 'wb');

      // Run like a command-line program with arguments
      // instance.callMain(["/input.scad", "--enable=manifold", "-o", filename]); // manifold is faster at rendering
      console.log(1);

      instance.callMain([
        '/input.scad',
        '--enable=manifold',
        // "--enable=assimp",
        '-o',
        filename,
      ]); // manifold is faster at rendering
      console.log(2);

      // Read the output 3D-model into a JS byte-array
      const output = instance.FS.readFile('/' + filename);

      postMessage({
        type: 'success',
        blob: new Blob([output], { type: 'application/octet-stream' }),
      });
    })();
  } catch (e) {
    const error = {
      type: 'error',
      messages: errorStatements,
    };
    postMessage(error);
  }
};

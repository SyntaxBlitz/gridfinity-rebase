// @ts-expect-error
import OpenSCAD from '../openscad.js';

onmessage = async (e) => {
  const { scadSrc, toFixStl, goldStl } = e.data;

  const printStatements: string[] = [];
  const errorStatements: string[] = [];

  try {
    await (async () => {
      // Instantiate the application
      const instance = await OpenSCAD({
        noInitialRun: true,
        print: (x: string) => printStatements.push(x),
        printErr: (x: string) => errorStatements.push(x),
      });

      instance.FS.writeFile('/input.scad', scadSrc);
      instance.FS.writeFile('/gold.stl', new Uint8Array(goldStl), {}, 'wb');
      instance.FS.writeFile('/toFix.stl', new Uint8Array(toFixStl), {}, 'wb');

      instance.callMain([
        '/input.scad',
        // manifold is faster at rendering.
        // one cost i see is sometimes weird face wrapping in the final model, but i don't think it matters for printing.
        // it's WAY faster -- like one or two orders of magnitude -- so it's worth it
        '--enable=manifold',
        // "--enable=assimp",
        '-o',
        `/fixed.stl`,
      ]);

      const output = instance.FS.readFile(`/fixed.stl`);

      postMessage({
        type: 'finished',
        errors: errorStatements,
        blob: new Blob([output], { type: 'application/octet-stream' }),
      });
    })();
  } catch (e) {
    postMessage({
      type: 'finished',
      errors: errorStatements,
      blob: null,
    });
  }
};

// @ts-expect-error
import OpenSCAD from '../openscad.js';

let print = (_s: string) => {};
let printErr = (_s: string) => {};

let instancePromise: Promise<OpenSCAD> | null = null;
let instanceUsed = false;

const initializeInstance = () => {
  instancePromise = OpenSCAD({
    noInitialRun: true,
    print: (s: string) => print(s),
    printErr: (s: string) => printErr(s),

    locateFile: function (_path: string, _scriptDirectory: string) {
      if (self.location.origin === 'https://gridfinity.tools') {
        // if you're hosting this app elsewhere, please host the
        // wasm file yourself - it's a big file! -tim
        return 'https://tja-project-files.rgdata.net/openscad-2025.01.12.wasm';
      } else {
        const importMetaUrl = import.meta.env.BASE_URL;
        return `${importMetaUrl}/src/openscad.wasm`;
      }
    },
  }).then((instance: OpenSCAD) => {
    // note i think this is superfluous because of some code in openscad-wasm
    return instance.ready;
  });
};

// this is just to preload. we do use it for the first run, but afterwards it gets replaced.
// hopefully it gets GC'd?
// it was going to be a pita to actually share one instance
//   (need custom filenames based on reqid probably)

// there isn't a great way to detect metered connections
//   (see https://mozilla.github.io/standards-positions/#netinfo)
// but it seems rude to load a 60MB wasm file on pageload.
// I do think it's worth preloading, in general, but if a user finds this site on mobile,
// they're probably not actually using the tool anyway. If they are, their first (pre-cache)
// use can wait until interaction.
// (oh it's only 17MB zstd but still)
// update 2025-01-12 -- I just did my own build and it's tiny! 9.4MB uncompressed. has all the features I need.
// this version is dramatically faster, too. not sure what changed! (about 7s to 1.5s runtime on a test file)
const isOnMobile = navigator.userAgent.toLowerCase().includes('mobi');
if (!isOnMobile) {
  initializeInstance();
}

onmessage = async (e) => {
  return await rebase(e.data);
};

const rebase = async (data: {
  scadSrc: string;
  toFixStl: ArrayBuffer;
  goldStl: ArrayBuffer;
  requestId: string;
}) => {
  // check this before anything async to avoid race cond
  if (instanceUsed || instancePromise === null) {
    initializeInstance();
  } else {
    // we're allowed to use the preload instance the first time
    instanceUsed = true;
  }
  const instance = await instancePromise;

  const { scadSrc, toFixStl, goldStl } = data;

  const printStatements: string[] = [];
  const errorStatements: string[] = [];

  print = (s: string) => {
    printStatements.push(s);
  };

  printErr = (s: string) => {
    errorStatements.push(s);
  };

  try {
    await (async () => {
      // Instantiate the application

      instance.FS.writeFile('/input.scad', scadSrc);
      instance.FS.writeFile('/gold.stl', new Uint8Array(goldStl), {}, 'wb');
      instance.FS.writeFile('/toFix.stl', new Uint8Array(toFixStl), {}, 'wb');

      instance.callMain([
        '/input.scad',
        // manifold is faster at rendering.
        // one cost i see is sometimes weird vertex orders in the final model, but i don't think it matters for printing.
        // it's WAY faster -- like one or two orders of magnitude -- so it's worth it
        '--backend=manifold',
        '-o',
        `/fixed.stl`,
      ]);

      const output = instance.FS.readFile(`/fixed.stl`);

      postMessage({
        type: 'finished',
        errors: errorStatements,
        blob: new Blob([output], { type: 'application/octet-stream' }),
        requestId: data.requestId,
      });
    })();
  } catch (e) {
    console.error(e);

    postMessage({
      type: 'finished',
      errors: errorStatements,
      blob: null,
      requestId: data.requestId,
    });
  }
};

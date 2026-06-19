import { useEffect } from 'react';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

export const useLoadInputFileBlob = (
  inputFile: File | null,
  setInputBlob: React.Dispatch<React.SetStateAction<Blob | null>>
) => {
  useEffect(() => {
    if (!inputFile) {
      return;
    }

    let aborted = false;


    const loader = new ThreeMFLoader();
    const exporter = new STLExporter();

    (async () => {
      const inputFileBuffer = await inputFile.arrayBuffer();

      let inputFileBlob = new Blob([inputFileBuffer], {
        type: 'application/octet-stream',
      });

      // we have a .3mf. grab the first model from it
      if (inputFile.name.endsWith(".3mf")) {
        let g = loader.parse(await inputFileBlob.arrayBuffer());
        let exported = exporter.parse(g.children[0]);
        // overwrite the blob we have with the model we just extracted
        inputFileBlob = new Blob([exported], {
          type: 'application/octet-stream',
        });
      }

      if (aborted) {
        return;
      }

      setInputBlob(inputFileBlob);
    })();

    return () => {
      aborted = true;
    };
  }, [inputFile]);
};

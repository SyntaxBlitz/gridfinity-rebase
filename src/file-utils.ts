import { useEffect } from 'react';

export const useLoadInputFileBlob = (
  inputFile: File | null,
  setInputBlob: React.Dispatch<React.SetStateAction<Blob | null>>
) => {
  useEffect(() => {
    if (!inputFile) {
      return;
    }

    let aborted = false;

    (async () => {
      const inputFileBuffer = await inputFile.arrayBuffer();

      const inputFileBlob = new Blob([inputFileBuffer], {
        type: 'application/octet-stream',
      });

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

import { BufferGeometry } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export const loadSTLGeometry = async (url: string) => {
  return new Promise<BufferGeometry>((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(url, resolve, undefined, reject);
  });
};

import { useEffect, useRef } from "react";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadSTLGeometry } from "./mesh-utils.ts";

export const useOrbitCanvas = (canvasWidth: number, canvasHeight: number) => {
  const ratio = canvasWidth / canvasHeight;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);
    // const camera = new THREE.OrthographicCamera(
    //   -100,
    //   100,
    //   100 / ratio,
    //   -100 / ratio,
    //   0.1,
    //   1000
    // );
    const camera = new THREE.PerspectiveCamera(75, ratio, 0.1, 1000);
    camera.name = "camera";
    console.log({ camera }, 1);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    renderer.setSize(canvasWidth, canvasHeight);

    camera.position.z = 5;

    scene.add(camera);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 3;

    scene.background = new THREE.Color(0xffffff);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
  }, [canvasRef.current]);

  return { canvasRef, sceneRef };
};

const clearScene = (scene: THREE.Scene) => {
  // remove all but the camera
  const nonCameraObjects = scene.children.filter(
    (child) => child.name !== "camera"
  );

  nonCameraObjects.forEach((object) => {
    scene.remove(object);
  });
};

export const useRenderInputFile = (
  inputBlob: Blob | null,
  sceneRef: React.RefObject<THREE.Scene | null>,
  gridOffset: boolean = false
) => {
  useEffect(() => {
    if (!inputBlob) {
      sceneRef.current && clearScene(sceneRef.current);
      return;
    }

    let aborted = false;

    (async () => {
      const inputFileBlobUrl = URL.createObjectURL(inputBlob);
      const meshGeometry = await loadSTLGeometry(inputFileBlobUrl);

      if (aborted) return;
      sceneRef.current && clearScene(sceneRef.current);

      // be super cool to do a view-space peek through circle on the cursor

      const wireframe = true;

      if (wireframe) {
        const mesh = new THREE.Mesh(
          meshGeometry,
          new THREE.MeshStandardMaterial({
            // color: 0x9575cd,
            color: 0xd1c4e9,
            metalness: 0.2,
            roughness: 0.5,
            transparent: true,
            opacity: 0.8,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          })
        );

        sceneRef.current?.add(mesh);
        sceneRef.current?.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(meshGeometry),
            new THREE.LineBasicMaterial({
              color: 0x000000,
              // transparent: true,
              // opacity: 0.9,
            })
          )
        );
      } else {
        const mesh = new THREE.Mesh(
          meshGeometry,
          new THREE.MeshStandardMaterial({
            color: 0x9575cd,
            metalness: 0.2,
            roughness: 0.5,
          })
        );

        sceneRef.current?.add(mesh);
      }

      meshGeometry.computeBoundingBox();

      const meshHeight = meshGeometry.boundingBox?.max.z ?? 5;
      const camera = sceneRef.current?.getObjectByName(
        "camera"
      ) as THREE.PerspectiveCamera;
      camera.position.z = meshHeight * 2;
      camera.position.y = (meshGeometry.boundingBox?.max.y ?? 0) * 4;
      camera.position.x = (meshGeometry.boundingBox?.max.x ?? 0) * 4;

      camera.lookAt(0, 0, meshHeight);

      camera.zoom = 1;

      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(50, 50, meshHeight + 50);
      light.lookAt(0, 0, 0);
      sceneRef.current?.add(light);

      // realized it's pretty useful to be able to see the bottom lol
      const light2 = new THREE.DirectionalLight(0xffffff, 1);
      light2.position.set(30, -30, -50);
      light2.lookAt(0, 0, 0);
      sceneRef.current?.add(light2);

      const ambientLight = new THREE.AmbientLight(0xffffff);
      ambientLight.intensity = 0.8;
      sceneRef.current?.add(ambientLight);

      const maxX = Math.max(
        Math.abs(meshGeometry.boundingBox?.min.x ?? 0),
        Math.abs(meshGeometry.boundingBox?.max.x ?? 0)
      );
      const maxY = Math.max(
        Math.abs(meshGeometry.boundingBox?.min.y ?? 0),
        Math.abs(meshGeometry.boundingBox?.max.y ?? 0)
      );
      // technically if X is pos and Y is neg this is off but w/e
      const maxRadius = Math.sqrt(maxX ** 2 + maxY ** 2);

      // add a cute grid at the ground plane
      const SPACING = 42;
      const UNDER_PLANE_SIZE =
        Math.ceil((maxRadius * 2 * 3) / SPACING) * SPACING;
      const grid = new THREE.GridHelper(
        UNDER_PLANE_SIZE,
        UNDER_PLANE_SIZE / SPACING
        // 0x000000,
        // 0xff0000
      );
      grid.material.opacity = 0.2;
      grid.material.transparent = true;
      grid.position.z = -0.5;
      grid.rotation.x = Math.PI / 2;
      if (gridOffset) {
        grid.position.x = SPACING / 2;
        grid.position.y = SPACING / 2;
      }

      sceneRef.current?.add(grid);

      const gridOverlay = new THREE.PlaneGeometry(
        UNDER_PLANE_SIZE * 1.01,
        UNDER_PLANE_SIZE * 1.01
      );
      // the better way to do this would be to write a shader to draw the grid but i don't wanna
      const gridOverlayMaterial = new THREE.ShaderMaterial({
        // here, we create a material that's solid white, except in a circle (r=100) in the center
        // that's transparent
        uniforms: {
          color: { value: new THREE.Color(0xffffff) },
          center: { value: new THREE.Vector2(0.5, 0.5) },
          radius: { value: 0.25 },
          radius2: { value: 0.5 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          uniform vec2 center;
          uniform float radius;
          uniform float radius2;
          varying vec2 vUv;
          void main() {
            float dist = distance(center, vUv);
            if (dist > radius2) {
              gl_FragColor = vec4(color, 1.0);
            } else if (dist > radius) {
              gl_FragColor = vec4(color, 1.0 - smoothstep(radius2, radius, dist));  
            } else {
              discard;
            }
          }
        `,
        transparent: true,
      });
      const gridOverlayMesh = new THREE.Mesh(gridOverlay, gridOverlayMaterial);
      gridOverlayMesh.position.z = 0;
      sceneRef.current?.add(gridOverlayMesh);

      const gridUnderlayMesh = new THREE.Mesh(gridOverlay, gridOverlayMaterial);
      gridUnderlayMesh.position.z = -1;
      gridUnderlayMesh.rotation.x = Math.PI;
      sceneRef.current?.add(gridUnderlayMesh);

      // fog
      if (sceneRef.current) {
        // sceneRef.current.fog = new THREE.Fog(0xffffff, 1, 1000);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [inputBlob]);
};

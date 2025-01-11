import { useEffect, useRef, useState } from 'react';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadSTLGeometry } from './mesh-utils.ts';

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
    const camera = new THREE.PerspectiveCamera(75, ratio, 0.1, 10000);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

    renderer.setSize(canvasWidth, canvasHeight);

    camera.position.z = 5;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2;

    scene.userData = {
      camera,
      controls,
    };

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
  scene.clear();
};

const addIdleIndicators = (scene: THREE.Scene) => {
  // const idleIndicator = new THREE.Mesh(
  //   new THREE.BoxGeometry(1, 1, 1),
  //   new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  // );
  // scene.add(idleIndicator);

  scene.userData.controls.autoRotate = false;
};

export const useRenderBlob = (
  inputBlob: Blob | null,
  sceneRef: React.RefObject<THREE.Scene | null>
) => {
  const [renderReady, setRenderReady] = useState(false);

  useEffect(() => {
    if (!inputBlob) {
      if (sceneRef.current) {
        clearScene(sceneRef.current);
        addIdleIndicators(sceneRef.current);
      }
      return;
    }

    let aborted = false;
    setRenderReady(false); // otherwise the scene clear races against the shape render

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

      const maxX = meshGeometry.boundingBox?.max.x ?? 5;
      const maxY = meshGeometry.boundingBox?.max.y ?? 5;
      const maxZ = meshGeometry.boundingBox?.max.z ?? 5;

      const minX = meshGeometry.boundingBox?.min.x ?? -5;
      const minY = meshGeometry.boundingBox?.min.y ?? -5;
      const minZ = meshGeometry.boundingBox?.min.z ?? -5;

      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const sizeZ = maxZ - minZ;

      const midpointX = (maxX + minX) / 2;
      const midpointY = (maxY + minY) / 2;

      if (sceneRef.current) {
        sceneRef.current.userData.controls.reset();
        sceneRef.current.userData.controls.autoRotate = true;
      }

      const camera = sceneRef.current?.userData.camera;
      // camera.position.z = maxZ * 2;

      camera.position.x = sizeX * 1.6 + maxX;
      camera.position.y = sizeY * 1.6 + maxY;
      const MIN_ADDITIONAL_HEIGHT = 35; // otherwise hard to see flat bois
      const additionalHeight = Math.max(sizeZ * 1.4, MIN_ADDITIONAL_HEIGHT);
      camera.position.z = maxZ + additionalHeight;

      // camera.lookAt(midpointX, midpointY, maxZ);

      sceneRef.current?.userData.controls.target.set(
        midpointX,
        midpointY,
        maxZ
      );

      camera.zoom = 1;

      const light = new THREE.DirectionalLight(0xffffff, 2);
      // light.position.set(50, 50, maxZ + 50);
      light.position.set(maxX + 50, maxY + 50, maxZ + 50);
      light.lookAt(midpointX, midpointY, 0);
      sceneRef.current?.add(light);

      // realized it's pretty useful to be able to see the bottom lol
      // well, matters less now that we have transparent and wireframes but /shrug
      const light2 = new THREE.DirectionalLight(0xffffff, 1);
      light2.position.set(maxX + 30, minY - 30, minZ - 50);
      light2.lookAt(midpointX, midpointY, 0);
      sceneRef.current?.add(light2);

      const ambientLight = new THREE.AmbientLight(0xffffff);
      ambientLight.intensity = 0.8;
      sceneRef.current?.add(ambientLight);

      const maxRadius = Math.sqrt((sizeX / 2) ** 2 + (sizeY / 2) ** 2);

      // add a cute grid at the ground plane
      const SPACING = 42;
      const PLANE_SIZE_MULTIPLIER = 5;
      const underPlaneSize =
        Math.ceil((maxRadius * 2 * PLANE_SIZE_MULTIPLIER) / SPACING) * SPACING;
      const grid = new THREE.GridHelper(
        underPlaneSize,
        underPlaneSize / SPACING,
        0x666666,
        0x666666
      );
      grid.material.opacity = 0.2;
      grid.material.transparent = true;
      grid.rotation.x = Math.PI / 2;

      grid.position.x = midpointX;
      grid.position.y = midpointY;
      grid.position.z = minZ - 0.5;

      sceneRef.current?.add(grid);

      const gridOverlay = new THREE.PlaneGeometry(
        underPlaneSize * 1.01,
        underPlaneSize * 1.01
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
      gridOverlayMesh.position.x = grid.position.x;
      gridOverlayMesh.position.y = grid.position.y;
      gridOverlayMesh.position.z = grid.position.z + 0.5;
      sceneRef.current?.add(gridOverlayMesh);

      const gridUnderlayMesh = new THREE.Mesh(gridOverlay, gridOverlayMaterial);
      gridUnderlayMesh.position.x = grid.position.x;
      gridUnderlayMesh.position.y = grid.position.y;
      gridUnderlayMesh.position.z = grid.position.z - 0.5;
      gridUnderlayMesh.rotation.x = Math.PI;
      sceneRef.current?.add(gridUnderlayMesh);

      // fog
      if (sceneRef.current) {
        // sceneRef.current.fog = new THREE.Fog(0xffffff, 1, 1000);
      }

      setRenderReady(true);
    })();

    return () => {
      aborted = true;
    };
  }, [inputBlob, sceneRef.current]);

  return renderReady;
};

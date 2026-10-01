import * as THREE from 'three';
import { CAMERA } from '/sim/camera.js';
import { skyTexture } from './textures.js';

export function createScene(canvas, quality = 'high') {
  const debug = new URLSearchParams(location.search).has('debug');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: debug });
  const maxDpr = quality === 'low' ? 1 : 2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const shadows = quality !== 'low';
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xcfeaff, 190, 820);

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b8a4a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
  sun.position.set(-50, 90, 35);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 260;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
  }
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 1400);
  const size = { w: 1, h: 1, aspect: 16 / 9 };
  const shakeV = { x: 0, y: 0, z: 0 };

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!(w > 0 && h > 0)) return size.aspect;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    size.w = w; size.h = h; size.aspect = w / h;
    camera.aspect = size.aspect;
    camera.updateProjectionMatrix();
    return size.aspect;
  }
  resize();
  window.addEventListener('resize', resize);

  /** Posiciona a camera Three a partir da ChaseCamera da simulacao. */
  function frame(cam) {
    camera.fov = CAMERA.fov;
    camera.aspect = size.aspect;
    camera.updateProjectionMatrix();
    const sk = cam.shakeOffset(shakeV);
    camera.position.set(cam.x + sk.x, cam.y + sk.y, cam.z + sk.z);
    const cp = Math.cos(CAMERA.pitch), sp = Math.sin(CAMERA.pitch);
    const fx = Math.cos(cam.yaw) * cp, fz = Math.sin(cam.yaw) * cp;
    camera.lookAt(camera.position.x + fx * 50, camera.position.y - sp * 50, camera.position.z + fz * 50);
    camera.updateMatrixWorld();
    // sombra e luz seguem o pelotao
    sun.target.position.set(cam.ax, cam.ay, cam.az);
    sun.position.set(cam.ax - 45, cam.ay + 90, cam.az + 30);
    sun.target.updateMatrixWorld();
  }

  const v = new THREE.Vector3();
  /** Projeta um ponto do mundo para pixels da tela (behind = atras da camera). */
  function toScreen(x, y, z, out = { x: 0, y: 0, behind: false }) {
    v.set(x, y, z).project(camera);
    out.x = (v.x * 0.5 + 0.5) * size.w;
    out.y = (-v.y * 0.5 + 0.5) * size.h;
    out.behind = v.z > 1;
    return out;
  }

  return { THREE, renderer, scene, camera, sun, size, resize, frame, toScreen, render: () => renderer.render(scene, camera), quality, shadows };
}

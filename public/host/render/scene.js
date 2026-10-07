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

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b8a4a, 1.15);
  scene.add(hemi);
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

  const sunOff = { x: -45, y: 90, z: 30 };
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
    camera.position.set((cam.vx ?? cam.x) + sk.x, (cam.vy ?? cam.y) + sk.y, (cam.vz ?? cam.z) + sk.z); // vx..vz: posicao desviando de paredes/tetos
    const cp = Math.cos(CAMERA.pitch), sp = Math.sin(CAMERA.pitch);
    const fx = Math.cos(cam.yaw) * cp, fz = Math.sin(cam.yaw) * cp;
    camera.lookAt(camera.position.x + fx * 50, camera.position.y - sp * 50, camera.position.z + fz * 50);
    camera.updateMatrixWorld();
    // sombra e luz seguem o pelotao
    sun.target.position.set(cam.ax, cam.ay, cam.az);
    sun.position.set(cam.ax + sunOff.x, cam.ay + sunOff.y, cam.az + sunOff.z);
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

  /** Ceu, nevoa e luzes da pista (theme.sky/fog/hemi/sun/exposure); sem tema volta ao dia padrao. */
  function applyTheme(theme = {}) {
    const sk = theme.sky;
    scene.background = sk ? skyTexture(sk[0], sk[1], sk[2]) : skyTexture();
    const f = theme.fog || [0xcfeaff, 190, 820];
    if (scene.fog) { scene.fog.color.set(f[0]); scene.fog.near = f[1]; scene.fog.far = f[2]; }
    const h = theme.hemi || [0xcfe8ff, 0x6b8a4a, 1.15];
    hemi.color.set(h[0]); hemi.groundColor.set(h[1]); hemi.intensity = h[2];
    const s = theme.sun || [0xfff1d0, 2.6, -45, 90, 30];
    sun.color.set(s[0]); sun.intensity = s[1]; sunOff.x = s[2]; sunOff.y = s[3]; sunOff.z = s[4];
    renderer.toneMappingExposure = theme.exposure ?? 1.05;
  }

  /**
   * Ceu de pista do SRB2Kart: o panorama SKYn (256 px) repetido 4x em volta, do zenite ao horizonte; abaixo do horizonte, a cor da
   * ultima linha. Vira o fundo equiretangular da cena; se a imagem falhar, fica o degrade do tema.
   */
  function setSkyImage(url) {
    const gen = (setSkyImage.gen = (setSkyImage.gen || 0) + 1);
    const img = new Image();
    img.onload = () => {
      if (gen !== setSkyImage.gen) return; // outra pista ja foi carregada
      const W = 1024, H = 512, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const t = document.createElement('canvas'); t.width = img.width; t.height = img.height;
      const tg = t.getContext('2d'); tg.drawImage(img, 0, 0);
      const px = tg.getImageData(0, img.height - 1, 1, 1).data;
      g.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
      g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += img.width * 1.0) g.drawImage(img, x, 0, img.width, H / 2); // zenite (topo) ao horizonte (meio)
      const tex = new THREE.CanvasTexture(cv);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    };
    img.src = url;
  }

  // ---- tela dividida: uma camera Three por celula, desenhada com viewport + scissor
  const viewCams = [];
  const sunTarget = new THREE.Vector3();
  const sunShadowOn = sun.castShadow;
  const vq = new THREE.Vector3();

  /** Liga/desliga a sombra do sol (com muitas celulas ela e re-renderizada em cada uma). */
  function setSunShadow(on) { if (shadows) sun.castShadow = on && sunShadowOn; }

  /**
   * views: [{ rect:{x,y,w,h} (px CSS, origem no topo), fov (vertical), x,y,z (posicao), fx,fy,fz (frente),
   *           sunAt:{x,y,z} (para onde a luz/sombra aponta) }]. Preenche view.cam com a camera Three usada.
   */
  function renderViews(views) {
    const W = size.w, H = size.h;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(0x05070c, 1);
    renderer.clear(); // divisorias e celulas livres
    renderer.setScissorTest(true);
    views.forEach((v, i) => {
      const c = viewCams[i] || (viewCams[i] = new THREE.PerspectiveCamera(60, 1, 0.5, 1400));
      const r = v.rect;
      c.fov = v.fov; c.aspect = r.w / r.h; c.updateProjectionMatrix();
      c.position.set(v.x, v.y, v.z);
      c.lookAt(v.x + v.fx * 50, v.y + v.fy * 50, v.z + v.fz * 50);
      c.updateMatrixWorld();
      v.cam = c;
      if (v.sunAt) {
        sunTarget.set(v.sunAt.x, v.sunAt.y, v.sunAt.z);
        sun.target.position.copy(sunTarget);
        sun.position.set(sunTarget.x + sunOff.x, sunTarget.y + sunOff.y, sunTarget.z + sunOff.z);
        sun.target.updateMatrixWorld();
      }
      const gy = H - r.y - r.h;
      renderer.setViewport(r.x, gy, r.w, r.h);
      renderer.setScissor(r.x, gy, r.w, r.h);
      renderer.render(scene, c);
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }

  /** Projeta um ponto do mundo para pixels da tela inteira usando a camera/celula de uma view ja desenhada. */
  function toScreenView(view, x, y, z, out = { x: 0, y: 0, behind: false }) {
    vq.set(x, y, z).project(view.cam);
    out.x = view.rect.x + (vq.x * 0.5 + 0.5) * view.rect.w;
    out.y = view.rect.y + (-vq.y * 0.5 + 0.5) * view.rect.h;
    out.behind = vq.z > 1;
    return out;
  }

  return { THREE, renderer, scene, camera, sun, size, resize, frame, applyTheme, setSkyImage, toScreen, render: () => renderer.render(scene, camera), renderViews, toScreenView, setSunShadow, quality, shadows };
}

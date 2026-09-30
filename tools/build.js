// Script de build para empacotar a versão estática compatível com GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// 1. Limpa dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 2. Copia pastas do projeto
copyDirSync(path.join(ROOT, 'public', 'host'), path.join(DIST, 'host'));
copyDirSync(path.join(ROOT, 'public', 'pad'), path.join(DIST, 'pad'));
copyDirSync(path.join(ROOT, 'shared'), path.join(DIST, 'shared'));
copyDirSync(path.join(ROOT, 'sim'), path.join(DIST, 'sim'));

// 3. Copia dependencias vendor (three, addons, qrcode)
const vendorDir = path.join(DIST, 'vendor');
fs.mkdirSync(path.join(vendorDir, 'three'), { recursive: true });
fs.mkdirSync(path.join(vendorDir, 'three-addons', 'geometries'), { recursive: true });
fs.mkdirSync(path.join(vendorDir, 'three-addons', 'utils'), { recursive: true });

fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js'),
  path.join(vendorDir, 'three', 'three.module.js')
);
fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'geometries', 'RoundedBoxGeometry.js'),
  path.join(vendorDir, 'three-addons', 'geometries', 'RoundedBoxGeometry.js')
);
fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'),
  path.join(vendorDir, 'three-addons', 'utils', 'BufferGeometryUtils.js')
);
fs.copyFileSync(
  path.join(ROOT, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.mjs'),
  path.join(vendorDir, 'qrcode.mjs')
);

// 4. Cria dist/index.html (tela principal na raiz para acesso direto no GitHub Pages)
const indexHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Racing Wars</title>
<link rel="stylesheet" href="./host/host.css">
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three/three.module.js",
    "three/addons/": "./vendor/three-addons/",
    "qrcode": "./vendor/qrcode.mjs",
    "/shared/": "./shared/",
    "/sim/": "./sim/",
    "/host/": "./host/",
    "/vendor/": "./vendor/"
  }
}
</script>
</head>
<body>
<canvas id="gl"></canvas>
<div id="labels"></div>
<div id="hud"></div>
<div id="screen"></div>
<div id="banner"></div>
<div id="debug" hidden></div>
<script type="module" src="./host/main.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml);

// 5. Atualiza dist/host/index.html com caminhos relativos
const hostHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Racing Wars</title>
<link rel="stylesheet" href="./host.css">
<script type="importmap">
{
  "imports": {
    "three": "../vendor/three/three.module.js",
    "three/addons/": "../vendor/three-addons/",
    "qrcode": "../vendor/qrcode.mjs",
    "/shared/": "../shared/",
    "/sim/": "../sim/",
    "/host/": "./",
    "/vendor/": "../vendor/"
  }
}
</script>
</head>
<body>
<canvas id="gl"></canvas>
<div id="labels"></div>
<div id="hud"></div>
<div id="screen"></div>
<div id="banner"></div>
<div id="debug" hidden></div>
<script type="module" src="./main.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'host', 'index.html'), hostHtml);

// 6. Atualiza dist/pad/index.html com caminhos relativos e importmap
const padHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0b0e16">
<title>Racing Wars — Controle</title>
<link rel="stylesheet" href="./pad.css">
<script type="importmap">
{
  "imports": {
    "/shared/": "../shared/"
  }
}
</script>
</head>
<body>
<div id="join" class="view">
  <div class="logo">RACING<br>WARS</div>
  <p>Digite o código que aparece na tela</p>
  <input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD">
  <input id="name" maxlength="14" autocomplete="off" placeholder="Seu nome (opcional)">
  <button id="go">ENTRAR</button>
  <div id="err"></div>
</div>

<div id="pad" class="view" hidden>
  <div id="hdr"><span id="who"></span><span id="pts"></span><span id="ping">●</span><button id="fs" aria-label="Tela cheia">⛶</button></div>
  <div id="drive" hidden>
    <div class="half left"><div class="hint">DIREÇÃO<br><small>deslize aqui</small></div><div id="anchor"></div></div>
    <div class="half right"><div id="item"><div id="ico"></div><div id="itl"></div></div><div class="hint" id="firehint">TOQUE PARA USAR</div></div>
  </div>
  <div id="menu" hidden>
    <div id="mtitle"></div>
    <div class="mrow">
      <button data-k="left">◀</button>
      <button data-k="ok" class="ok">OK</button>
      <button data-k="right">▶</button>
    </div>
    <button data-k="back" class="back">VOLTAR</button>
  </div>
  <div id="msg" hidden></div>
</div>
<div id="rotate"><div class="ph">📱</div>Gire o celular<br>para o modo paisagem</div>
<script src="./pad.js" type="module"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'pad', 'index.html'), padHtml);

// 7. Adiciona .nojekyll
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log('Build estático gerado com sucesso em dist/!');

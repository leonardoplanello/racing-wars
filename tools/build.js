// Build estatico para GitHub Pages: gera dist/ a partir de public/, sim/, shared/ e das dependencias.
// As paginas sao derivadas dos HTML reais em public/ (nunca ficam defasadas).
// RELAY_URL (opcional, ex.: wss://meu-relay.example.com/ws) habilita os celulares como controle no Pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RELAY = (process.env.RELAY_URL || '').trim();
if (RELAY && !/^wss?:\/\//.test(RELAY)) throw new Error('RELAY_URL deve começar com ws:// ou wss://');

const copyDir = (src, dest) => fs.cpSync(src, dest, { recursive: true });
const need = (p) => {
  if (!fs.existsSync(p)) throw new Error(`arquivo ausente: ${path.relative(ROOT, p)} (rode npm ci)`);
  return p;
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

copyDir(path.join(ROOT, 'public', 'host'), path.join(DIST, 'host'));
copyDir(path.join(ROOT, 'public', 'pad'), path.join(DIST, 'pad'));
copyDir(path.join(ROOT, 'shared'), path.join(DIST, 'shared'));
copyDir(path.join(ROOT, 'sim'), path.join(DIST, 'sim'));

const nm = (...p) => need(path.join(ROOT, 'node_modules', ...p));
const vendor = path.join(DIST, 'vendor');
const put = (from, to) => {
  fs.mkdirSync(path.dirname(path.join(vendor, to)), { recursive: true });
  fs.copyFileSync(from, path.join(vendor, to));
};
put(nm('three', 'build', 'three.module.js'), 'three/three.module.js');
put(nm('three', 'build', 'three.core.js'), 'three/three.core.js'); // three.module.js importa este arquivo
put(nm('three', 'examples', 'jsm', 'geometries', 'RoundedBoxGeometry.js'), 'three-addons/geometries/RoundedBoxGeometry.js');
put(nm('three', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), 'three-addons/utils/BufferGeometryUtils.js');
put(nm('qrcode-generator', 'dist', 'qrcode.mjs'), 'qrcode.mjs');

const config = `<script>window.RW=${JSON.stringify({ static: true, relay: RELAY })};</script>`;

// Reescreve um HTML de public/: caminhos absolutos -> relativos (funciona em qualquer subcaminho) + importmap + config.
function page(srcFile, prefix) {
  let html = fs.readFileSync(srcFile, 'utf8');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  html = html.replace(/(href|src)="\/(host|pad)\//g, (_, a, d) => `${a}="${prefix}${d}/`);
  const map = {
    imports: {
      three: `${prefix}vendor/three/three.module.js`,
      'three/addons/': `${prefix}vendor/three-addons/`,
      qrcode: `${prefix}vendor/qrcode.mjs`,
      '/shared/': `${prefix}shared/`,
      '/sim/': `${prefix}sim/`,
      '/host/': `${prefix}host/`,
    },
  };
  const head = `${config}\n<script type="importmap">${JSON.stringify(map)}</script>\n`;
  if (!html.includes('</head>')) throw new Error(`${srcFile}: sem </head>`);
  return html.replace('</head>', head + '</head>');
}

const hostSrc = path.join(ROOT, 'public', 'host', 'index.html');
const padSrc = path.join(ROOT, 'public', 'pad', 'index.html');
fs.writeFileSync(path.join(DIST, 'index.html'), page(hostSrc, './'));
fs.writeFileSync(path.join(DIST, 'host', 'index.html'), page(hostSrc, '../'));
fs.writeFileSync(path.join(DIST, 'pad', 'index.html'), page(padSrc, '../'));
fs.writeFileSync(path.join(DIST, '404.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./"><a href="./">Racing Wars</a>');
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`Build estatico gerado em dist/ (relay: ${RELAY || 'nenhum, so teclado'})`);

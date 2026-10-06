// Extrai do instalador do SRB2Kart (autoextraivel do WinRAR) so os arquivos de dados que o importador usa.
// Nunca executa o instalador: usa o UnRAR (vem com o WinRAR).
//   node tools/srb2kart/extract.js [caminho-do-instalador] [pasta-de-saida]
// Variaveis: UNRAR = caminho do UnRAR.exe/unrar.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_INSTALLER = path.join(root, 'other-games/Kart-Public-1.6/srb2kart-v16-Installer.exe');
export const DEFAULT_OUT = path.join(root, 'local-assets/srb2kart');
// maps.kart (60 corridas + batalhas + SOC_MAIN), textures.kart/gfx.kart/srb2.srb (flats, texturas, PLAYPAL, ceus)
export const FILES = ['maps.kart', 'textures.kart', 'gfx.kart', 'srb2.srb'];

function findUnrar() {
  if (process.env.UNRAR) return process.env.UNRAR;
  for (const p of ['C:/Program Files/WinRAR/UnRAR.exe', 'C:/Program Files (x86)/WinRAR/UnRAR.exe', '/usr/bin/unrar', '/usr/local/bin/unrar']) if (fs.existsSync(p)) return p;
  return 'unrar';
}

export function extract(installer = DEFAULT_INSTALLER, out = DEFAULT_OUT, files = FILES) {
  if (!fs.existsSync(installer)) throw new Error(`instalador nao encontrado: ${installer}`);
  fs.mkdirSync(out, { recursive: true });
  const todo = files.filter((f) => !fs.existsSync(path.join(out, f)));
  if (!todo.length) return out;
  const r = spawnSync(findUnrar(), ['x', '-o-', '-y', installer, ...todo, out + path.sep], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`UnRAR falhou (codigo ${r.status})`);
  return out;
}

if (process.argv[1]?.endsWith('extract.js')) {
  const [inst, out] = process.argv.slice(2);
  const dir = extract(inst || DEFAULT_INSTALLER, out || DEFAULT_OUT);
  for (const f of FILES) console.log(f, fs.existsSync(path.join(dir, f)) ? fs.statSync(path.join(dir, f)).size + ' bytes' : 'FALTANDO');
}

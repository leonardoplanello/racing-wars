// Enche uma sala com celulares simulados: node tools/fake-phones.js CODIGO [quantidade] [porta]
// Eles mandam direcao senoidal e tocam no botao de item de vez em quando (nao seguem a pista).
import WebSocket from 'ws';
import { encodeInput } from '../shared/protocol.js';

const [code, count = '3', port = '3000'] = process.argv.slice(2);
if (!code) {
  console.error('uso: node tools/fake-phones.js CODIGO [quantidade] [porta]');
  process.exit(1);
}

for (let i = 0; i < Number(count); i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const buf = new Uint8Array(4);
  let seq = 0, joined = false, t = Math.random() * 10;
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: code.toUpperCase(), clientId: 'fake-' + i, name: 'Fake ' + (i + 1) })));
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'joined') joined = true;
    if (m.t === 'err') { console.error('erro:', m.reason); process.exit(1); }
  });
  setInterval(() => {
    if (!joined) return;
    t += 1 / 30;
    const fire = Math.sin(t * 0.7 + i) > 0.97 ? 1 : 0;
    ws.send(encodeInput(Math.sin(t * 1.3 + i) * 0.7, fire, seq++, buf), { binary: true });
  }, 33);
  setInterval(() => joined && ws.send(JSON.stringify({ t: 'menu', k: 'ok' })), 1e9);
}
console.log(`${count} celulares simulados entrando na sala ${code}. Ctrl+C para sair.`);

import { start, lanAddresses } from './app.js';

const port = Number(process.env.PORT) || 3000;
const app = await start(port).catch((e) => {
  console.error(e.code === 'EADDRINUSE' ? `Porta ${port} em uso. Use: PORT=4000 npm start` : e);
  process.exit(1);
});

console.log('\n  RACING WARS\n');
console.log(`  Tela principal (abra no PC/TV):  http://localhost:${app.port}`);
for (const ip of lanAddresses()) console.log(`  Celulares (mesma rede Wi-Fi):    http://${ip}:${app.port}/pad`);
console.log('\n  Ctrl+C para encerrar.\n');

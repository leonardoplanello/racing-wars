# Arquitetura

```
celulares (/pad) --WebSocket--> servidor Node <--WebSocket-- host (/ , tela principal)
                                  (só relay)                    (simulação + render)
```

- **Host autoritativo**: a simulação roda no navegador da tela principal. O servidor só cria salas, atribui `deviceId` e repassa mensagens.
- **Stack**: Node ESM, `ws`, `three`, `qrcode-generator`. Sem bundler: módulos ES + importmap; libs servidas de `node_modules` (funciona offline na LAN).
- **`sim/` e `shared/`** são JS puro (sem DOM/Three) e rodam no navegador e no Node, por isso são testados com `node --test`.
- **Física 2D realista** (`sim/car.js`: bicicleta dinâmica + corpo rígido de 3 círculos) renderizada em 3D com câmera de perseguição (`sim/camera.js`: enquadramento, zoom e regra de corte são matemática pura e testável). Limites da pista via distância assinada até a linha central (sem malhas de colisão, sem tunelamento). Passo fixo de 1/120 s.

## Pastas
```
server/index.js        http estático + WebSocket relay + /api/lan
shared/protocol.js     mensagens, codec binário de input, cores
sim/                   rng, track, car, items, game (rodadas/pontos), ai, camera, scenery (colisores do cenário)
sim/tracks/            definição das pistas
public/host/           tela principal (main, net, ui, audio, kbd)
public/host/render/    Three.js: scene, world (pista/cenário), models (picape, semáforo), cars, fx, textures (canvas)
public/pad/            controle do celular
tools/                 smoke.js, fake-phones.js
test/                  testes node --test
```

## Protocolo
Sala de 4 letras. Host: `{t:'host'}` → `{t:'room', code}`. Celular: `{t:'join', room, clientId, name}` → `{t:'joined', deviceId, master}`.
O servidor avisa o host com `connect`, `disconnect` e `master`. Host para celulares: `{t:'to', id, data}` e `{t:'all', data}`. Do celular ao host, o servidor embrulha JSON como `{t:'from', id, data}`.

**Input binário** (4 bytes, ~30 Hz + envio imediato em toque): o celular envia `[0x01, steer:int8, botões:u8, seq:u8]`; o servidor entrega ao host `[0x81, deviceId, steer, botões, seq]`. Bit0 = usar item, bit1 = "away" (aba em segundo plano), bit2 = ré (as duas setas juntas).
Menu (Master): `{t:'menu', k:'left'|'right'|'up'|'down'|'ok'|'back'}`.

**Reconexão**: o celular guarda `clientId` em `localStorage`; ao voltar reassume o mesmo `deviceId` (carro, cor, pontos). Se o Master sair, o próximo vira Master.

## Estados do jogo (`sim/game.js`)
`LOBBY → COUNTDOWN → RACING → LAST_STAND (zoom 0,5 s) → COUNTDOWN → … → MATCH_END`.
O fim de rodada só é avaliado em `RACING`, o que evita o falso vencedor no respawn do original.

## GitHub Pages (CI/CD)
- `.github/workflows/deploy.yml`: em PR roda `npm ci`, `npm test`, build e `check:dist`; em push na `main` também publica no Pages.
- `tools/build.js` gera `dist/` a partir dos HTML reais de `public/` (caminhos relativos + importmap, funciona em qualquer subcaminho). `tools/check-dist.js` valida que todo import/href existe.
- Pages é estático (sem WebSocket): o host roda com bots e teclado. Para celulares como controle, hospede o relay (`server/`) em outro lugar e defina a variável do repositório `RELAY_URL` (ex.: `wss://meu-relay/ws`); o build injeta em `window.RW.relay`.
- Requer em Settings > Pages: Source = "GitHub Actions".

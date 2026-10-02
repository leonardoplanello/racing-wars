# Racing Wars

Jogo web: host (tela principal) + celulares como controle. UI em português (pt-BR). Regras em `docs/REGRAS.md`, arquitetura em `docs/ARQUITETURA.md`.

## Comandos
- `npm start`: servidor em http://localhost:3000
- `npm test`: testes da simulação (`node --test test/`)
- `npm run smoke`: teste de rede com host e 8 celulares falsos

## Convenções
- `sim/` e `shared/` não podem importar DOM, Three nem APIs só do Node: rodam nos dois ambientes.
- Simulação determinística por passo fixo (`DT = 1/120`); o render só lê o estado.
- Nada de assets binários: modelos, áudio e QR são gerados em código.
- Ao mudar regras, atualize `docs/REGRAS.md` e os testes em `test/`.
- Editor de mapa dedicado em `/editor/` (`public/editor/`); salva em localStorage e o jogo usa com `?debug`.
- Debug: `?debug` ou F3; F4 abre o editor (valores ao vivo, pista, seleção de área para pedir edições); V congela.
- `node tools/dyn.js` inspeciona a dinâmica do carro; `node tools/balance.js [bots] [copa]` simula partidas só com bots.

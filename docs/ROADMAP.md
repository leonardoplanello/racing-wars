# Roadmap

## Versão 0.1: base jogável com pista de teste
- Servidor: salas, relay, QR, reconexão, Master
- Controle de celular (direção cega + item)
- Física do carro, colisões, parede, queda
- Câmera com centroide, zoom limitado e eliminação por enquadramento
- Rodadas, pontuação, zoom no sobrevivente, respawn coletivo com 3-2-1
- Itens: nitro, mina, míssil, whomp (sorteio uniforme)
- Bots, jogador no teclado
- Áudio procedural, partículas, HUD
- Pista simples de teste (Ponte do Rio)

## Versão 0.2: visual do original
- Câmera de perseguição em perspectiva, sempre atrás do pelotão; corte só por ficar para trás
- Picapes 4x4 de brinquedo, ponte de madeira com vigas de aço, rio, cercas, casinhas, grama e palmeiras (tudo procedural)
- Sombras reais, céu, névoa e tone mapping
- HUD com cartões de jogador, placa LAP e semáforo de largada

## Versão 0.3: carros realistas
- Física de tração traseira / direção dianteira com atrito por superfície e controle de tração
- Colisão de corpo rígido (empurrar, girar, raspar no muro) e ré automática
- Carros ~30% menores, pista mais larga, estrada de terra com sulcos, cerca de ferro, paralelepípedo
- Caixotes com brilho azul (5 por grupo na War Cup), árvores e montanhas maiores, explosão com clarão e raios
- Bots desviam de outros carros

## Versão 0.4: poderes visíveis, carcaças e câmera centralizada
- Controle com setas ◀ ▶ e botão de ação; as duas setas juntas dão ré
- Carros mais rápidos, míssil muito mais rápido
- Poderes montados no carro (míssil, turbina + aerofólio, cubo magnético, bomba)
- Magnético com força exponencial na distância e efeito visual (domo, anéis, raios)
- Mina e míssil explodem o carro; carcaças ficam na pista até o próximo spawn
- Terra aberta: dá para sair da estrada, cenário sólido, cercas quebram, longe demais explode
- Câmera mais perto, com o pelotão no meio da tela

## Versão 0.5: física 3D, relevo e carcaças
- Altitude real do carro: rampas de salto, estado no ar, queda de área alta sem guardrails; o carro nunca entra no chão
- Corpo rígido 3D (`sim/body.js`) para capotamento, carcaças pesadas que mantêm a velocidade e **pneus soltos** que rolam e colidem
- Magnético sem rodopio, rastro do nitro curto, turbina/aerofólio até o fim do nitro
- Câmera mais horizontal, que acompanha as curvas e não treme
- Pista de teste maior: rampas, curvas fechadas e plateau sem cercas

## Versão 0.6: gelo, bots e editor
- Canhão de gelo (morteiro que congela carros em cubos de gelo que deslizam reto)
- Hitbox cobrindo as rodas (6 círculos), pneus soltos sólidos
- Controle mais rápido e fácil; câmera mais alta e mais calma
- Precipício fatal na pista de teste; montanhas só fora do circuito
- Bots em 3 dificuldades (o líder do Fácil erra) e IA melhor na largada/spawn
- Debug: freeze com passo, editor de valores/pista ao vivo e seleção de área

## Próximos passos
- Gerador de pistas com ~5 min por volta
- Downtown, Water Hill, Death Mountain, Farm Jump (cenário rico por bioma)
- Farm Jump (rampas e estado aéreo já existem na base)
- Seleção de copa e circuito polida
- Ajuste fino de física e IA de bots por dificuldade
- Testes em celulares reais (iOS Safari / Android Chrome)

## Fora do escopo
Modelo comercial da AirConsole (Hero, anúncios, limite de jogadores), Unity/IL2CPP, WebRTC P2P, Android Automotive real, Ice Circuit e Volcano (removidos do jogo original).

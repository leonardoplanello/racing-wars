# Regras do jogo

## Objetivo
Ser o último carro vivo em cada rodada e chegar a **10 pontos**, ou ter mais pontos quando o líder completar **3 voltas**.

## Câmera e eliminação
- Câmera de **perseguição**, sempre **atrás** do pelotão e olhando ao longo da pista. A câmera é alta e afastada; os carros ficam **no meio da tela** e o líder nunca passa da faixa da placa de voltas: a câmera mira o ponto médio entre o líder e o último e dá zoom out para caber todo mundo, até um **limite fixo**.
- Passando do limite, a câmera favorece o líder. **Ninguém é eliminado por estar na frente**; só explode quem fica para trás (sai pela borda de baixo).
- Carros que **saem muito da estrada** (em terra aberta, mais de ~28 unidades da borda) **explodem**. Dá para sair e explorar o cenário, mas árvores, pedras e casas são sólidas e as cercas quebram. Na ponte as vigas são sólidas; cair no rio afunda o carro.
- **Carros explodidos viram carcaças** que ficam na pista (escuras, soltando fumaça) e continuam batendo nos outros até o próximo spawn.
- **Retardatário acelera**: quem está perto de sair do quadro (por trás) ganha até **+20%** de velocidade até voltar para perto do centro da tela. O líder não recebe o bônus.
- Um marcador pulsante avisa que um carro está perto de ser cortado ou de se perder no mato.

## Rodadas
1. Contagem regressiva **3-2-1-GO**; carros travados até o GO.
2. Rodada em andamento: mortos ficam de fora (sem respawn individual).
3. Quando sobra **1 carro vivo** (ou 0), o jogo congela, a câmera dá um zoom rápido no sobrevivente por **0,5 s**, e os pontos são aplicados.
4. Nova contagem 3-2-1: **todos renascem ao mesmo tempo**, na pista, um pouco **antes** de onde o sobrevivente estava.

## Pontuação
Todos começam com **5** pontos (mínimo 0, máximo 10).

| Situação na rodada | Pontos |
| :--- | :---: |
| Sobrevivente | +2 |
| Penúltimo a morrer | +1 |
| Primeiro a morrer | −2 |
| Demais mortos | −1 |

Com 2 jogadores: sobrevivente +2, outro −2. Se os últimos caírem juntos, o último a morrer conta como sobrevivente.
**Fim da partida**: alguém chega a 10 (vitória imediata) ou o líder completa 3 voltas (vence quem tem mais pontos; desempate pela ordem de chegada). A volta de todos passa a ser a do sobrevivente a cada nova rodada.

## Carros e física
- Picapes 4x4 de brinquedo, ~30% menores que na v0.2, em pistas largas.
- **Tração traseira, direção dianteira**: modelo de bicicleta dinâmico com pneus que saturam. O motor empurra pelo eixo de trás e consome atrito lateral, então acelerar forte em piso escorregadio faz a traseira escapar. Há um controle de tração que tira o pé quando o carro derrapa.
- Direção **rápida e sensível** (volante vira com facilidade; no celular a seta leva o volante ao máximo em ~0,1 s).
- Quem é atingido (whomp, batidas) **gira de verdade** e fica virado para onde parou: **não há auto-correção** do rumo.
- **Roda traseira**: bater na traseira de um carro faz ele perder aderência atrás por ~0,5–1 s e rodopiar com facilidade.
- O ângulo do volante é limitado pela aderência (auxílio de direção): só esterçar não faz o carro rodar.
- **Colisões de corpo rígido**: cada carro tem massa e inércia. Bater por trás empurra o da frente, bater de lado o faz girar, raspar no muro gira o carro. Carro em nitro é mais pesado.
- Se o carro fica de frente para o muro, engata ré por um instante e sai.
- Superfícies: asfalto (aderência 1,0), pedra (0,95), terra e madeira (0,85).

## Copas
| Copa | Caixas de item | Foco |
| :--- | :--- | :--- |
| Fast Cup | nenhuma | condução limpa |
| Super Cup | moderadas | corrida + itens |
| War Cup | muitas | combate |

## Itens
Caixotes de madeira com símbolo azul brilhante (grupos de 5 na War Cup e de 3 na Super Cup) dão um item **sorteado de forma uniforme**, um por vez. O poder guardado **fica montado no carro** (visível para todos) até ser usado. No celular, toque no botão de ação.
- **Míssil** (míssil armado no teto): muito rápido e **sempre em linha reta** (não persegue). O carro atingido **explode**. Quem está na linha de tiro ouve um alarme e o celular vibra.
- **Nitro** (turbina atrás + aerofólio grande): ~2 s de velocidade muito alta. Não dá invulnerabilidade. Deixa um **rastro de fogo** (~3 s): qualquer outro carro que cruzar o rastro **explode** (o dono é imune).
- **Magnético** (cubo azul em cima do carro): onda de choque de **curto alcance** com força **exponencial** na distância (`F = P·e^(−d/λ)`). Quem está colado é arremessado longe e **sai do chão**; a ~12 u quase não sente. Ganha domo de energia, anéis e raios elétricos.
- **Mina** (mina no teto): solta atrás do carro. **Quem passar por cima explode.**

## Pistas
Por enquanto só a pista de teste **Ponte do Rio** (curta): ponte de madeira com vigas de aço sobre o rio, estrada de terra com sulcos entre cercas de ferro e uma praça de paralelepípedo. Planejadas: Downtown, Water Hill, Death Mountain, Farm Jump (~5 min por volta).

## Efeitos
- Cercas (brancas e de ferro) **se estilhaçam** com física: tábuas e postes voam na direção do carro, quicam e somem; árvores soltam folhas e pedras soltam lascas.
- Carros explodidos capotam em 3D, soltam destroços (portas, rodas, para-choques), bola de fogo, coluna de fumaça, marca queimada e luz. O whomp arremessa com arcos elétricos.
- Controle do celular de quem morreu mostra só uma **caveira** até o próximo spawn.

## Modo debug
`?debug` na URL ou tecla **F3** abre o painel em qualquer fase: corrida infinita (mortos renascem junto do pelotão), sem corte, imortal, freecam (IJKL/U/O + arrastar o mouse), dar itens (1–4), slow-mo (T), hitboxes (H), renascer (R) e explodir bots (X). Nada disso afeta a partida com o painel fechado.

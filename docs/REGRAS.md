# Regras do jogo

## Objetivo
Ser o último carro vivo em cada rodada e chegar a **10 pontos**, ou ter mais pontos quando o líder completar **3 voltas**.

## Câmera e eliminação
- Câmera de **perseguição** alta, mas ainda inclinada (44°; ajustável no debug), sempre **atrás** do pelotão. A câmera segue a **média de todos os carros** (posição, velocidade e rumo da pista no ponto médio), com a âncora baixa na tela para mostrar **bastante pista à frente**; o zoom afasta para caber o primeiro e o último carro. A câmera dá zoom out para caber o último carro, até um **limite fixo**; ela sobe e desce com o terreno (rampas, plateau) e não treme com as batidas: a âncora segue o líder devagar na lateral, o rumo e o zoom têm zona morta, e o tremor de explosões é suave e tem teto.
- Passando do limite, a câmera favorece o líder. **Ninguém é eliminado por estar na frente**; só explode quem fica para trás (sai pela borda de baixo).
- Carros que **saem muito da estrada** (em terra aberta, mais de ~28 unidades da borda) **explodem**. Dá para sair e explorar o cenário, mas árvores, pedras e casas são sólidas e as cercas quebram. Na ponte as vigas são sólidas; cair no rio afunda o carro.
- **Carros explodidos viram carcaças** que ficam no mapa (escuras, soltando fumaça) e **continuam sólidas**: batem nos outros, no cenário e nos muros até o próximo spawn. A carcaça **mantém a velocidade** do carro (o motor "preso" ainda empurra ~1 s), é **~2,5× mais pesada** e capota e rola pela física, sem animação fixa. Os 4 **pneus saem do carro** como corpos físicos (veja Efeitos).
- **Retardatário acelera**: quem está perto de sair do quadro (por trás) ganha até **+20%** de velocidade até voltar para perto do centro da tela. O líder não recebe o bônus.
- Um marcador pulsante avisa que um carro está perto de ser cortado ou de se perder no mato.
- **Câmera: estilo atual ou tela dividida (kart).** No lobby há a opção "Câmera" e a tecla **C** alterna (também durante a partida); a escolha fica salva no navegador (`rw-camera-mode`). Na **tela dividida** cada jogador humano (celular ou teclado) ganha uma célula com a **câmera tradicional de jogos de kart**, atrás do próprio carro (`KartCamera` em `sim/camera.js`, com os valores do SRB2Kart: 160 atrás, 82 acima, mira 64 à frente, filtros de rumo/altura/inclinação, deslocamento lateral na derrapagem, aproximação com nitro, recuo em alta velocidade). Layout: 2 jogadores = uma célula em cima da outra; 3-4 = 2×2; 5-6 = 3×2; 7-8 = 3×3 (a célula livre mostra a classificação). Bots não ganham célula; sem humanos, volta ao estilo atual. Quem morre passa a acompanhar o líder. **É só visual**: as regras (corte de quem fica para trás, pontos) continuam na câmera compartilhada, e cada célula mostra "VOLTE PARA O PELOTÃO!" quando o carro está perto de ser cortado. Com 5 ou mais células a sombra do sol é desligada (ela seria renderizada uma vez por célula). A freecam do debug sempre usa tela cheia.

## Rodadas
1. Contagem regressiva **3-2-1-GO**; carros travados até o GO.
2. Rodada em andamento: mortos ficam de fora (sem respawn individual).
3. Quando sobra **1 carro vivo** (ou 0), o jogo congela, a câmera dá um zoom rápido no sobrevivente por **0,5 s**, e os pontos são aplicados.
4. Nova contagem 3-2-1: **todos renascem ao mesmo tempo**, na pista, um pouco **antes** de onde o sobrevivente estava.

## Bots
Três dificuldades, escolhidas no lobby (**G** ou ▲▼; no celular Master, ▲▼):
- **Fácil**: lento, mais ruído, reflexo mais lento e **o bot que está na frente comete erros** de vez em quando (sai da linha ou "dorme" numa curva). Além disso, se um bot fica **mais de 5 s na frente** do grupo (só quando não há jogador real), ele **alivia o ritmo** até o grupo chegar perto (`DIFFICULTY.easy.rubber`).
- **Fácil e Médio — bot à frente dos jogadores reais**: o bot que abre vantagem sobre o jogador humano mais adiantado (Fácil > 0,8 s, Médio > 1,3 s) **reduz a velocidade** (60% / 75% do cruzeiro) até o humano chegar perto (`rubber.humanGap`, `rubber.humanThrottle`). No Difícil não há essa ajuda.
- **Todos os bots** desviam de carros (inclusive na mesma velocidade, e lado a lado) e têm **controle alto na largada** (reflexo rápido e desvio reforçado nos primeiros segundos).
- **Médio**: o padrão.
- **Difícil**: preciso, antecipa mais, usa itens cedo e quase não erra.
Os bots seguem a linha de corrida (por dentro das curvas), desviam de carros, carcaças, pneus soltos, minas e árvores, evitam a borda do plateau e do precipício, **seguram a faixa da vaga na largada e no spawn** (largada organizada) e escolhem faixas menos cheias.

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
- **Hitbox**: o casco de colisão é de 6 círculos (~3,6 × 2,56 u) e cobre o corpo **e as 4 rodas**: carros lado a lado, ou batendo roda com roda, não se atravessam. Pneus soltos também são sólidos (têm hitbox).
- **Tração traseira, direção dianteira**: modelo de bicicleta dinâmico com pneus que saturam. O motor empurra pelo eixo de trás e consome atrito lateral, então acelerar forte em piso escorregadio faz a traseira escapar. Há um controle de tração que tira o pé quando o carro derrapa.
- Direção **rápida e sensível** (o volante vira com facilidade e o carro tem mais aderência e controle; no celular a seta leva o volante ao máximo em ~0,05 s e a curva do volante é mais sensível perto do centro).
- Quem é atingido (whomp, batidas) **gira de verdade** e fica virado para onde parou: **não há auto-correção** do rumo.
- **Roda traseira**: bater na traseira de um carro faz ele perder aderência atrás por ~0,5–1 s e rodopiar com facilidade.
- O ângulo do volante é limitado pela aderência (auxílio de direção): só esterçar não faz o carro rodar.
- **Colisões de corpo rígido**: cada carro tem massa e inércia. Bater por trás empurra o da frente, bater de lado o faz girar, raspar no muro gira o carro. Carro em nitro é bem mais pesado (`CAR.boostMass`): empurra quem está na frente para trás do enquadramento, eliminando-o. **Carros encostados não se prendem** (só encosto de frente aciona a ré de desengate; de lado, o carro desliza e se solta). **Bater na roda de trás de um carro o faz girar** (`CAR.rearSpin`, F4): a separação usa a normal média de todos os círculos em contato, o atrito entre carros é baixo, o contato aciona a ré de desengate e carcaça empurrada acorda.
- **Nitro = alto controle**: com nitro a aderência (`CAR.boostGrip`) e o esterço em alta velocidade (`CAR.boostSteer`) aumentam e a tração toma menos do círculo de atrito: o carro não escorrega.
- Se o carro fica de frente para o muro, engata ré por um instante e sai.
- **Altura de verdade**: o carro tem altitude, gravidade e estado **no ar** (sem tração nem esterço, só inércia). Em rampas ele decola com a velocidade vertical da subida; **o carro nunca entra no chão**. Pouso muito forte (queda do plateau) capota. Carros em alturas diferentes não se tocam, e quem está no chão **bate** na lateral de uma área alta em vez de subir nela.
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
- **Nitro** (turbina atrás + aerofólio grande): ~2 s de velocidade muito alta. Não dá invulnerabilidade. Deixa um **rastro de fogo curto e colado no carro** (~0,3 s, uns 15 u): qualquer outro carro que cruzar o rastro **explode** (o dono é imune). A **turbina e o aerofólio ficam montados até o nitro acabar**.
- **Magnético** (cubo azul em cima do carro): onda de choque de **curto alcance** com força **exponencial** na distância (`F = P·e^(−d/λ)`). Quem está colado é empurrado e dá um **pulinho** (sai do chão); **alcance grande (~30 u)** e força bem maior (`WHOMP`); só na borda do alcance quase não sente. O carro **mantém o rumo**: não entra em atordoamento nem rodopia (giro limitado); só carcaças e pneus soltos recebem o impulso físico completo. Ganha domo de energia, anéis e raios elétricos.
- **Poderes afetam o cenário**: míssil, bomba e Whomp (até `WHOMP.sceneryRadius`) **derrubam árvores e pedras** (o colisor some; voltam na rodada seguinte) e **quebram cercas** no raio; o míssil explode ao bater em árvore/pedra/casa; o gelo deixa o cenário azulado. Casas resistem. Whomp: `push` 160, `maxSpin` 1.7.
- **Velocidade dos poderes**: `POWER.speedScale` (F4 › Itens) multiplica a velocidade de míssil, onda do Whomp e morteiro.
- **Canhão de gelo** (canhão sobre o teto do carro enquanto equipado): lança uma bola de gelo como **morteiro, em arco bem alto** (`ICE.lob` = altura do arco; `ICE.flight` = tempo mínimo de voo) que cai **35 u à frente** (`ICE.range`). No impacto, todos os carros num raio de `ICE.radius` (13 u, menos o dono) ficam **congelados `ICE.time` s** (4 s) dentro de um **cubo de gelo** (soltando água ao deslizar — só visual): sem esterço, sem tração e sem item, **rumo travado**. O carro congelado **mantém a velocidade que tinha e vai desacelerando até 85% da velocidade normal** (`CAR.iceKeep`, `CAR.iceDecel`) — nunca abaixo disso. O cubo se estilhaça ao fim; mina, míssil e rastro ainda explodem o carro congelado. Árvores e pedras no raio ficam azuladas.
- **Mina** (mina no teto): solta atrás do carro. **Quem a tocar com qualquer parte do casco explode.** Se ao ativar houver um carro **encostado na TRASEIRA** do carro com a bomba (atrás dele, tocando as hitboxes traseiras; `POWER.mineTouch`), ele explode na hora e a mina não é largada. Carro ao lado ou à frente não conta.

## Pistas
Itens: nitro, mina, míssil, magnético e gelo (sorteio uniforme entre os cinco).

Pistas disponíveis: **Ponte do Rio** (teste) e **Downtown**. Planejadas: Water Hill, Death Mountain, Farm Jump.

### Ponte do Rio (teste)
~1,5 min por volta: ponte de madeira com vigas de aço sobre o rio, estrada de terra com sulcos entre cercas de ferro, um zigue-zague de **curvas fechadas** na praça de paralelepípedo, **2 rampas de salto** uma **área alta (plateau) sem guardrails** de onde é possível cair e um **precipício** ao lado da pista (fosso fundo, sem cerca, na parte externa da curva grande do leste): sem cercas na beira. Quem cai **não morre na hora**: despenca (visível) e é eliminado ao **sair do enquadramento** da câmera (ou após `RULES.chasmFallMax` = 3 s).

### Downtown (~4 min por volta, ~7,6 mil u)
Metrópole ao entardecer: fachadas dos dois lados são o **muro sólido** da pista (nada de terra aberta), postes acesos, semáforos que trocam de cor, placas de pare, hidrantes, pontos de ônibus e placas de neon. Sete trechos, nesta ordem:
1. **Avenida Central** (largada): reta larga de 4 faixas.
2. **Quarteirões**: curvas de 90° em zigue-zague, chicane de cones na obra.
3. **Posto de gasolina** (esquina larga, lado de dentro aberto): ilha de bombas sob uma cobertura, com um **canal estreito** (~4 u) no meio e **uma caixa** dentro. Atalho opcional que corta a esquina.
4. **Bairro antigo**: paralelepípedo, largura 10, curvas fechadas.
5. **Pátio das cegonhas**: a **primeira carreta é a rampa** de salto e a segunda é o pouso; **uma caixa flutua** entre elas (só pega quem está no ar). Quem prefere seguro sai pelo **lote ao lado** (lado aberto, com caixotes).
6. **Viaduto**: sobe ~300 u até 7 u de altura (deck de concreto com muros tipo jersey) e termina em **lábio abrupto**: o salto é obrigatório e o carro cai na rodovia (a continuação da pista, no chão). Perto do lábio o guard-rail está **quebrado** do lado esquerdo, com cones afunilando; quem é empurrado ali cai ao lado da pista. Pouso com queda vertical > `CAR.crashSpeed` capota.
7. **Rodovia e retorno**: reta rápida de 3 faixas com pórtico de sinalização, saída curva e volta à avenida.

**Atalhos opcionais** (lado de dentro de uma esquina sem muro, `openZones`): **A** praça com fonte e caixotes; **B** beco de ~8 u entre dois prédios (com caixa); **C** canteiro de obras ao lado do trecho dos cones (com caixa). Cortam caminho, mas têm obstáculos sólidos; longe demais da pista (`CAR.offroadMax`) o carro explode.

**Props**: **poste** e **semáforo** são sólidos (poderes derrubam); **cone, placa de pare, hidrante e ponto de ônibus** não seguram o carro: quebram ao toque e tiram um pouco da velocidade (`PROPS.<tipo>.soft`), voltando na rodada seguinte (o hidrante solta um jato de água). **Bomba de combustível**: bater (acima de `PUMP.minSpeed` = 4 u/s), ou um míssil/mina/Whomp perto, a **explode** (`sim/scenery.js › PUMP`): **só quem está no raio de `PUMP.radius` (9 u) morre**, as bombas vizinhas (`PUMP.chain`, 7 u) explodem em cadeia com `PUMP.fuse` (0,16 s) de atraso, e o **fogo e a fumaça ficam até o fim da partida** (as bombas queimadas não voltam entre rodadas; se a rodada acaba no meio da cadeia, as bombas acesas queimam de vez).

A **volta de Downtown pode ser de 3 voltas (~12 min)**; a pista aceita `laps` próprio (`def.laps`) para encurtar.

## Efeitos
- Cercas (brancas e de ferro) **se estilhaçam** com física: tábuas e postes voam na direção do carro, quicam e somem; árvores soltam folhas e pedras soltam lascas.
- Carros explodidos recebem um impulso do epicentro fora do centro de massa e **capotam em 3D pela física** (corpo rígido com contato dos cantos da caixa com o chão). Soltam destroços (portas, para-choques), bola de fogo, coluna de fumaça, marca queimada e luz. Os **pneus viram corpos físicos** (cilindros): herdam velocidade e giro, quicam, **rolam** pelo mapa, **colidem** com carros, carcaças, cenário e muros e ficam até o próximo spawn. O whomp arremessa com arcos elétricos.
- Controle do celular de quem morreu mostra só uma **caveira** até o próximo spawn.

## Modo debug
`?debug` na URL ou tecla **F3** abre o painel em qualquer fase: corrida infinita (mortos renascem junto do pelotão), sem corte, imortal, freecam (WASD move, Z/Q sobe/desce, arrastar o mouse; enquanto ligada o carro humano dirige como bot; velocidade em F4 › Freecam: `FREECAM.speed`/`fast`), dar itens (1–5), slow-mo (T), **freeze** (V congela a simulação; `.` avança 1 quadro), hitboxes (H, inclui as rodas), renascer (R) e explodir bots (X). Nada disso afeta a partida com o painel fechado.

**Editor (F4)**: painel com todos os valores numéricos ao vivo (cada valor tem um **↺** para voltar ao original e um texto de ajuda ao passar o mouse; botões **Itens** dão o item ao jogador, inclusive o gelo) (câmera com ajuste fino, carro, itens, regras, IA e dificuldades), salvos no navegador, com "Copiar mudanças" (JSON) e "Resetar tudo". A seção **Pista** edita tamanho, largura, colinas, precipícios, superfícies, pontes, pontos de controle, caixas e a quantidade de cenário, e **Aplicar pista** reconstrói tudo. **Seleção de área (E)**: arraste um retângulo no chão; o painel mostra coordenadas, trecho da pista (fração da volta e metros), definições e objetos dentro, com "Copiar descrição" e um campo de nota para colar na conversa e pedir a edição.


## Largada e destroços
- Ninguém nasce dentro de outro carro: a grade tem espaçamento maior, o respawn do debug usa vagas distintas e a contagem regressiva separa qualquer sobreposição antes do GO.
- Pneus, carcaças e detritos que saem da pista sobre um **precipício ou rio** caem e somem (não flutuam).

## Editor de mapa
Página dedicada em **`/editor/`** (no Pages: `editor/`). Mostra a pista real em 3D (mesmo render do jogo). Botão esquerdo usa a ferramenta; direito gira; Shift/botão do meio/arrastar o fundo move; roda dá zoom; WASD move; **F** enquadra; **Delete** remove a seleção.
**Ferramentas visuais**: Rampa (9), Ponte (0), Precipício (C) e Piso (P) — clique no início e no fim sobre a pista; o trecho criado já vem selecionado com alças arrastáveis (verde início, vermelha fim, amarela **altura** da rampa, laranja subida/descida). Pontos, caixas, alças e campos numéricos atualizam a pista, as cercas e o semáforo **em tempo real** (reconstrução rápida que reaproveita o cenário decorativo; ao soltar, o mundo completo é refeito). Clicar num trecho da pista seleciona a rampa/ponte/precipício/piso daquele lugar.
- **Pontos da pista**: arraste para mover, ＋ insere no trecho clicado, － remove (mín. 4). Aviso se a curva for fechada demais.
- **Rampas/colinas, precipícios, pontes e materiais do piso** (asfalto, madeira, terra, paralelepípedo): listas com início/fim (sliders, destacados na pista), altura, subida, descida (0 = lábio), grades, lado e largura.
- **Objetos à mão** (`def.objects`: árvore, pedra, casa) e **grupos de caixas de item** (`def.boxGroups`), além da quantidade de cenário aleatório.
- Abra uma pista específica com **`/editor/?track=downtown`**.
- **Salvar** grava em `localStorage` (`rw-debug-track:<id>`, a mesma chave do F4); **Testar no jogo** abre o jogo com `?debug`, que usa a pista salva. Exportar/Importar JSON.

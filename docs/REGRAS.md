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

## Rodadas
1. Contagem regressiva **3-2-1-GO**; carros travados até o GO.
2. Rodada em andamento: mortos ficam de fora (sem respawn individual).
3. Quando sobra **1 carro vivo** (ou 0), o jogo congela, a câmera dá um zoom rápido no sobrevivente por **0,5 s**, e os pontos são aplicados.
4. Nova contagem 3-2-1: **todos renascem ao mesmo tempo**, na pista, um pouco **antes** de onde o sobrevivente estava.

## Bots
Três dificuldades, escolhidas no lobby (**G** ou ▲▼; no celular Master, ▲▼):
- **Fácil**: lento, mais ruído, reflexo mais lento e **o bot que está na frente comete erros** de vez em quando (sai da linha ou "dorme" numa curva). Além disso, se um bot fica **mais de 5 s na frente** do grupo, ele **alivia o ritmo** (70% da velocidade) até o grupo chegar perto (`DIFFICULTY.easy.rubber`).
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
- **Colisões de corpo rígido**: cada carro tem massa e inércia. Bater por trás empurra o da frente, bater de lado o faz girar, raspar no muro gira o carro. Carro em nitro é mais pesado.
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
- **Magnético** (cubo azul em cima do carro): onda de choque de **curto alcance** com força **exponencial** na distância (`F = P·e^(−d/λ)`). Quem está colado é empurrado e dá um **pulinho** (sai do chão); a ~12 u quase não sente. O carro **mantém o rumo**: não entra em atordoamento nem rodopia (giro limitado); só carcaças e pneus soltos recebem o impulso físico completo. Ganha domo de energia, anéis e raios elétricos.
- **Canhão de gelo** (morteiro no teto): lança uma bola de gelo em **arco alto** que cai **~45 u à frente** (nenhuma marca no chão antes da queda; a geada aparece só no impacto). No impacto, todos os carros num raio de ~9 u (menos o dono) ficam **congelados ~3 s** dentro de um **cubo de gelo** (facetado e translúcido, soltando água ao deslizar — só visual): sem esterço, sem tração e sem item, **deslizando em linha reta** (rumo travado, atrito de gelo baixo). O cubo se estilhaça ao fim; mina, míssil e rastro ainda explodem o carro congelado.
- **Mina** (mina no teto): solta atrás do carro. **Quem passar por cima explode.**

## Pistas
Itens: nitro, mina, míssil, magnético e gelo (sorteio uniforme entre os cinco).

Por enquanto só a pista de teste **Ponte do Rio** (~1,5 min por volta): ponte de madeira com vigas de aço sobre o rio, estrada de terra com sulcos entre cercas de ferro, um zigue-zague de **curvas fechadas** na praça de paralelepípedo, **2 rampas de salto** uma **área alta (plateau) sem guardrails** de onde é possível cair e um **precipício** ao lado da pista (fosso fundo, sem cerca, na parte externa da curva grande do leste): quem cai nele é **eliminado** ("caiu no precipício"). Planejadas: Downtown, Water Hill, Death Mountain, Farm Jump (~5 min por volta).

## Efeitos
- Cercas (brancas e de ferro) **se estilhaçam** com física: tábuas e postes voam na direção do carro, quicam e somem; árvores soltam folhas e pedras soltam lascas.
- Carros explodidos recebem um impulso do epicentro fora do centro de massa e **capotam em 3D pela física** (corpo rígido com contato dos cantos da caixa com o chão). Soltam destroços (portas, para-choques), bola de fogo, coluna de fumaça, marca queimada e luz. Os **pneus viram corpos físicos** (cilindros): herdam velocidade e giro, quicam, **rolam** pelo mapa, **colidem** com carros, carcaças, cenário e muros e ficam até o próximo spawn. O whomp arremessa com arcos elétricos.
- Controle do celular de quem morreu mostra só uma **caveira** até o próximo spawn.

## Modo debug
`?debug` na URL ou tecla **F3** abre o painel em qualquer fase: corrida infinita (mortos renascem junto do pelotão), sem corte, imortal, freecam (IJKL/U/O + arrastar o mouse), dar itens (1–5), slow-mo (T), **freeze** (V congela a simulação; `.` avança 1 quadro), hitboxes (H, inclui as rodas), renascer (R) e explodir bots (X). Nada disso afeta a partida com o painel fechado.

**Editor (F4)**: painel com todos os valores numéricos ao vivo (cada valor tem um **↺** para voltar ao original e um texto de ajuda ao passar o mouse; botões **Itens** dão o item ao jogador, inclusive o gelo) (câmera com ajuste fino, carro, itens, regras, IA e dificuldades), salvos no navegador, com "Copiar mudanças" (JSON) e "Resetar tudo". A seção **Pista** edita tamanho, largura, colinas, precipícios, superfícies, pontes, pontos de controle, caixas e a quantidade de cenário, e **Aplicar pista** reconstrói tudo. **Seleção de área (E)**: arraste um retângulo no chão; o painel mostra coordenadas, trecho da pista (fração da volta e metros), definições e objetos dentro, com "Copiar descrição" e um campo de nota para colar na conversa e pedir a edição.


## Largada e destroços
- Ninguém nasce dentro de outro carro: a grade tem espaçamento maior, o respawn do debug usa vagas distintas e a contagem regressiva separa qualquer sobreposição antes do GO.
- Pneus, carcaças e detritos que saem da pista sobre um **precipício ou rio** caem e somem (não flutuam).

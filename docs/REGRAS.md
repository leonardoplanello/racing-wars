# Regras do jogo

## Objetivo
Ser o último carro vivo em cada rodada e chegar a **10 pontos**, ou ter mais pontos quando o líder completar **3 voltas**.

## Câmera e eliminação
- Câmera de **perseguição**: perspectiva, sempre **atrás** do pelotão, olhando ao longo da pista (gira suavemente nas curvas).
- O **líder fica ancorado** no terço superior da tela. Quando o pelotão se espalha, a câmera dá **zoom out** e acompanha, até um **limite fixo** de altura.
- **Ninguém é eliminado por estar na frente.** Só é destruído quem fica para **trás** além do limite (sai pela borda de baixo) ou foge muito pelos lados.
- Carros também morrem ao cair na água/abismo ou pousar fora da pista após um salto.
- Um marcador pulsante na borda de baixo da tela avisa que um carro está perto de ser cortado.

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

## Copas
| Copa | Caixas de item | Foco |
| :--- | :--- | :--- |
| Fast Cup | nenhuma | condução limpa |
| Super Cup | moderadas | corrida + itens |
| War Cup | muitas | combate |

## Itens
Caixas "?" dão um item **sorteado de forma uniforme**, um por vez. Toque na metade direita do celular para usar.
- **Nitro**: ~2 s de velocidade alta. Não dá invulnerabilidade.
- **Mina**: cai atrás do carro; quem passa por cima é lançado girando.
- **Míssil**: teleguiado no carro imediatamente à frente no ranking. O alvo ouve um alarme e o celular vibra.
- **Whomp**: onda de choque 360° que empurra todos ao redor.

## Pistas
Por enquanto só a pista de teste **Ponte do Rio** (curta: ponte de madeira com vigas de aço sobre o rio, estrada de asfalto e um trecho de terra). Planejadas: Downtown, Water Hill, Death Mountain, Farm Jump (~5 min por volta).

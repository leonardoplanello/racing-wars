# 03. Gameplay, Mecânicas Centrais e Power-Ups

## Dinâmica de Câmara e Regra de Eliminação

A perspetiva de **Racing Wars** adota uma câmara isométrica superior (*top-down* com inclinação focal tridimensional), desenhada para enquadrar dinamicamente todo o pelotão. Ao contrário dos jogos de corrida convencionais que priorizam exclusivamente o cronômetro, a regra primordial de Racing Wars baseia-se na **preservação posicional dentro do campo de visão do ecrã partilhado**.

### 1. Cálculo Vetorial da Câmara
A posição da câmara $\vec{P}_{\text{cam}}$ em cada instante $t$ é calculada matematicamente pelo centroide (média posicional) dos veículos que continuam ativos na ronda:

$$\vec{P}_{\text{cam}}(t) = \frac{1}{N} \sum_{i=1}^{N} \vec{P}_i(t)$$

*Onde $N$ representa o número de participantes sobreviventes na ronda e $\vec{P}_i(t)$ é o vetor tridimensional da posição de cada veículo.*

### 2. Escalonamento Dinâmico de Zoom
À medida que os líderes se distanciam dos retardatários, a câmara eleva dinamicamente a sua distância focal (*orthographic / FOV scaling*) para manter todos os carros em cena. Contudo, essa expansão possui um **limite prefixado**. 

### 3. Mecânica de Frustum Culling (Eliminação Sumária)
Quando um carro colide contra um obstáculo, roda em falso após sofrer um ataque ou comete um erro de viragem, perde velocidade linear e é empurrado em direção à borda do ecrã. No instante exato em que a sua geometria ultrapassa o limite de corte (*frustum*) da câmara visível:
- O veículo é instantaneamente destruído;
- O jogador é desqualificado da ronda em andamento;
- O valor de $N$ decresce, fazendo a câmara recentrar imediatamente nos sobreviventes restantes.

---

## Sistema de Pontuação e Economia da Partida

A disputa estrutura-se em rondas rápidas integradas numa economia dinâmica de pontos:

```
[Início de Partida: 5 Pontos para cada Jogador]
       |
       +---> [Ronda Eliminatória em Andamento]
                   |
                   |---> 1º Lugar (Sobrevivente final / Líder): +2 Pontos
                   |---> 2º Lugar: +1 Ponto
                   |---> 1º Eliminado da Rodada: Perde Pontos de Saldo
```

- **Condição de Vitória Global**:
  1. O primeiro piloto a acumular **10 pontos** encerra a partida e é proclamado campeão; **ou**
  2. O piloto com a maior pontuação acumulada após **3 voltas completas** pelo traçado do circuito.
- **Mecanismo Anti-Runaway (Penalidade ao 1º Eliminado)**: A perda de pontos imposta ao primeiro participante destruído penaliza a pilotagem descuidada e previne o surgimento de um líder inalcançável, mantendo a tensão competitiva até a última curva.

---

## Modos de Competição (Copas / Cups)

O jogo divide-se em três taças (*Cups*), cada uma estabelecendo uma curva distinta de risco, velocidade e necessidade de confronto:

| Modo de Jogo | Foco Central da Jogabilidade | Densidade de Power-Ups | Condição Principal de Vitória |
| :--- | :--- | :--- | :--- |
| **Fast Cup** | Condução limpa, tangência e precisão em alta velocidade. | Praticamente nula (sem armamento bélico). | Cruzar a meta em 1º lugar mantendo o carro no traçado sem raspar nas bermas. |
| **Super Cup** | Equilíbrio híbrido clássico de corrida arcade com itens táticos. | Moderada e estrategicamente espaçada na pista. | Aliar condução eficiente à utilização pontual de itens em momentos críticos. |
| **War Cup** | Combate veicular destrutivo, atrito agressivo e sobrevivência. | Altíssima densidade de armas ao longo de todo o circuito. | Aniquilar os oponentes ou forçá-los para fora da tela, sendo o último sobrevivente. |

---

## Arsenal de Power-Ups e Dinâmica Física

As pistas possuem caixas de interrogação flutuantes que concedem itens aleatórios com comportamentos físicos específicos:

### 🚀 Speed Boost (Nitro)
- **Efeito**: Aplica um impulso vetorial frontal instantâneo no corpo rígido (*Rigidbody*) do carro.
- **Duração**: Aproximadamente 2 segundos de velocidade terminal elevada.
- **Uso Tático**: Crucial para recuperar terreno após uma colisão, ultrapassar líderes em retas ou abalroar adversários laterais em curvas fechadas para atirá-los fora da pista.

### 💣 Minas Terrestres (Landmines)
- **Efeito**: Ejetada diretamente pela traseira do carro, permanecendo estacionária sobre o asfalto ou terra batida.
- **Detonação**: Quando um oponente cruza a sua área de colisão (*trigger collider*), a mina detona com impulso vetorial ascendente.
- **Impacto**: O carro atingido é projetado verticalmente girando no ar, perdendo toda a inércia direcional e tornando-se presa fácil para o corte da câmara.

### 🎯 Míssil Teleguiado (Rocket)
- **Efeito**: Projétil com algoritmo de autoguiamento que calcula o vetor de interceção mais curto em relação ao veículo imediatamente à frente na classificação da corrida.
- **Impacto**: Causa a desestabilização violenta ou destruição do alvo ao colidir, exigindo dos condutores atenção aos avisos sonoros de aproximação.

### 🧲 Magnetic Whomp
- **Efeito**: Libera uma onda de choque eletromagnética radial expansiva de 360 graus a partir do centro do carro do jogador.
- **Impacto**: Repulsa com intensidade instantânea todos os veículos adjacentes em direção às bordas da pista, sendo especialmente devastador em pontes sem parapeito ou desfiladeiros rochosos.

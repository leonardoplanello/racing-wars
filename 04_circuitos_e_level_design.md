# 04. Circuitos e Level Design

## Panorama Geral dos Circuitos

Os circuitos de **Racing Wars** foram estruturados com traçados de geometria fechada, combinando secções propositadamente estreitas, curvas cegas, bermas desprotegidas e perigos ambientais específicos. Essas características forçam os competidores a disputar agressivamente a linha de trajetória ideal, amplificando as colisões corporais e as oportunidades para o uso de armamento.

| Pista | Bioma / Cenário | Perigo Central | Estado no Jogo |
| :--- | :--- | :--- | :--- |
| **Downtown** | Metrópole Urbana | Paredes em Ângulo Reto e Prédios | **Ativo** |
| **Water Hill** | Orla Costeira | Queda em Água / Pontes Estreitas | **Ativo** |
| **Death Mountain** | Cordilheira Rochosa | Ravinas Abertas e Sobreviragem | **Ativo** |
| **Farm Jump** | Zona Rural e Campos | Rampas Aéreas / Trajetória Balística | **Ativo** |
| **Ice Circuit** | Glaciar Ártico | Atrito Nulo e *Mesh Tunneling* | *Descontinuado* |
| **Volcano / Lava** | Encosta Vulcânica | Poços de Magma e *Spawns* Quebrados | *Descontinuado* |

---

## Análise dos Circuitos Ativos

### 1. Downtown
- **Ambientação e Estética**: Cenário cosmopolita com asfalto escuro de alto contraste, passeios de betão cinzento, arranha-céus estilizados, faixas de rodagem pintadas e iluminação pública refletida nas calçadas.
- **Topologia de Pista**: Circuito técnico marcado por sequências sucessivas de curvas de 90 graus, chicanes estreitas e corredores urbanos confinados entre fachadas prediais e postes.
- **Desafios Técnicos**: A rigidez dos limites arquitetónicos penaliza severamente derrapagens mal calculadas. Bater de frente ou de raspão contra a fachada de um edifício dissipa a inércia linear do veículo, fazendo com que seja rapidamente engolido pelo enquadramento da câmara. Em modos armados, esquinas cegas são ideais para o depósito surpresa de minas terrestres.

### 2. Water Hill
- **Ambientação e Estética**: Percurso costeiro à beira-mar, integrando orlas arenosas, pontões de madeira e estradas elevadas à margem de um oceano azul saturado.
- **Topologia de Pista**: Alternância entre curvas abertas e pontes de madeira extremamente estreitas, desprovidas de guarda-corpos (*rails*) ou barreiras de proteção lateral.
- **Desafios Técnicos**: O risco primordial é a eliminação sumária por queda na água. O atrito físico torna-se crítico nas pontes: a ativação do *Magnetic Whomp* nestes estrangulamentos é capaz de varrer múltiplos veículos em direção ao mar em uma fração de segundo. Além disso, a transição entre o asfalto e a madeira provoca alterações repentinas no coeficiente de aderência dos pneus.

### 3. Death Mountain
- **Ambientação e Estética**: Desfiladeiro árido esculpido em rochas avermelhadas e alaranjadas, marcado por pistas de gravilha, terra batida, cactos e penhascos vertiginosos.
- **Topologia de Pista**: Traçado sinuoso com elevações acentuadas, descidas rápidas, curvas em gancho (*hairpins*) e bermas abertas para o abismo.
- **Desafios Técnicos**: O baixo atrito do solo de terra batida e cascalho gera sobreviragem constante (*oversteer*), exigindo contraesterçamento antecipado. Qualquer saída lateral resulta em queda livre fatal. O uso do *Speed Boost* em secções montanhosas requer precisão cirúrgica, pois o aumento de aceleração pode catapultar o carro direto para o precipício.

### 4. Farm Jump
- **Ambientação e Estética**: Paisagem rural serena ladeada por plantações densas de milho, celeiros de madeira rústica, silos e cercas de ripas brancas.
- **Topologia de Pista**: Retas longas de terra batida intercaladas por curvas de raio alargado e rampas de salto balístico (naturais e artificiais).
- **Desafios Técnicos**: A física dos saltos em alta velocidade é o elemento diferenciador. Enquanto os carros estão suspensos no ar, **a capacidade de esterçamento direcional é completamente anulada**, preservando-se o vetor adquirido no momento exato da descolagem. Se um jogador receber um empurrão lateral imediatamente antes da rampa, voará num ângulo divergente e colidirá fatalmente contra as cercas e milheirais externos.

---

## Diagnóstico Técnico das Pistas Descontinuadas

Originalmente, Racing Wars incluía dois circuitos adicionais que exploravam biomas elementares extremos, mas que foram formalmente retirados do catálogo:

### ❄️ Ice Circuit (Glaciar Ártico)
- **Proposta Original**: Pista em superfície congelada com coeficiente de atrito lateral próximo de zero, exigindo derrapagens contínuas de alta habilidade (*powersliding*).
- **Causa da Descontinuação**: O algoritmo de resolução de colisões da Unity sob WebGL apresentava vulnerabilidades graves de **tunelamento de malha (*mesh tunneling*)**. Em velocidades elevadas, a física discreta não conseguia registrar a colisão contra os paredões de gelo entre fotogramas adjacentes, fazendo com que as viaturas atravessassem a geometria do cenário e caíssem infinitamente para fora do mapa.

### 🌋 Volcano / Lava (Cenário Vulcânico)
- **Proposta Original**: Pista desenhada sobre encostas de rocha vulcânica com fendas e poços de magma ardente, onde o contato com a lava causava destruição instantânea.
- **Causa da Descontinuação**: Apresentava falhas críticas nas coordenadas dos pontos de renascimento (*spawn points*) entre rodadas consecutivas. Veículos eliminados eram frequentemente posicionados de volta à corrida exatamente sobre fendas ativas de lava ou em pleno ar acima de abismos, causando eliminações em cascata sem qualquer janela de controle para os jogadores.

### Motivação da Retirada pela AirConsole
Diante da escassez de recursos e tempo da desenvolvedora independente Big Hut Games para reconstruir integralmente as malhas de colisão, recalibrar o modelo de atrito do gelo e reimplementar a lógica dos pontos de renascimento, a curadoria da AirConsole optou por **remover permanentemente ambos os circuitos**, garantindo a estabilidade e a reputação competitiva do catálogo.

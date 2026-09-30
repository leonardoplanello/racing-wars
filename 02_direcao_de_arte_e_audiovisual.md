# 02. Direção de Arte, Renderização e Audiovisual

## Estilo Visual e Filosofia Estética

Visualmente, **Racing Wars** adota uma linguagem tridimensional estilizada (*low-to-mid poly*) de traço cartunesco, caracterizada por:
- **Cores Vivas e Saturadas**: Paleta de alta intensidade cromática que cria uma atmosfera descontraída e acessível a públicos de todas as faixas etárias.
- **Contraste Acentuado**: Separação visual nítida entre a pista, as bermas transitáveis e os abismos ou elementos mortais do cenário.

Esta estética não foi definida exclusivamente por critérios de arte, mas principalmente para responder a requisitos funcionais estritos de **legibilidade visual e desempenho computacional** no ambiente WebGL.

---

## Desafios de Legibilidade no Ecrã Partilhado (Até 8 Jogadores)

Num cenário com até 8 viaturas disputando curvas apertadas e disparando armas em simultâneo, o risco de confusão visual (*visual clutter*) é crítico. A Big Hut Games aplicou soluções de design específicas:

| Desafio | Solução de Engenharia e Arte |
| :--- | :--- |
| **Sobreposição Caótica de Carros** | Silhuetas geométricas limpas e simplificadas, sem adereços desnecessários que gerem ruído gráfico. |
| **Identificação do Próprio Veículo** | Atribuição de cores sólidas e contrastantes a cada piloto, sincronizadas com a tonalidade do smartphone. |
| **Rastreamento Periférico** | As cores dos veículos utilizam tons primários e secundários puros, permitindo ao olho humano rastrear o carro sem focar diretamente nele. |

---

## Pipeline Gráfico e Otimização para WebGL

Para garantir compatibilidade com dispositivos de hardware modesto (placas gráficas integradas e chips de Smart TVs), o motor de renderização da Unity foi configurado sob parâmetros rigorosos:

### 1. Shading e Iluminação Otimizados
- **Forward Rendering Pipeline**: Empregado para manter o consumo de memória de vídeo (*VRAM*) sob limites previsíveis, restringindo severamente a contagem de luzes dinâmicas por objeto.
- **Lightmaps Pré-Cozidos (*Baked Lightmaps*)**: Toda a iluminação ambiental, sombras de prédios e relevos de pista são pré-calculados em texturas estáticas, eliminando o cálculo de sombras em tempo real durante a corrida e economizando a taxa de preenchimento de pixels (*fillrate*).

### 2. Efeitos Visuais (VFX) e Feedback Instantâneo
- **Sistemas de Partículas Compactos**: Partículas leves com tempo de vida curto e contagem restrita para simular:
  - Fumo denso de escape nas acelerações e derrapagens;
  - Chamas incandescentes de combustão no escape durante o uso do *Speed Boost*;
  - Rastos balísticos de fumo branco deixados pelos mísseis teleguiados;
  - Detonações explosivas de minas terrestres com faíscas radiais;
  - Ondas de choque circulares e translúcidas emitidas pelo *Magnetic Whomp*.
- **Vibração Dinâmica da Câmara (*Camera Shake*)**: Aplicação de tremores focais com decaimento exponencial sempre que ocorre uma explosão de grandes proporções. A intensidade é calibrada para transmitir o impacto físico sem desestabilizar a percepção do traçado para os condutores sobreviventes.

---

## Sonoplastia e Trilha Sonora

A atmosfera de adrenalina de Racing Wars é reforçada por uma sonoplastia enérgica e direta:
- **Trilha Musical**: Faixas instrumentais de ritmo acelerado baseadas em *riffs* marcantes de guitarra elétrica (*rock 'n' roll* enérgico), conferindo dinamismo contínuo à competição.
- **Efeitos Sonoros Diegéticos (SFX)**:
  - Guinchos característicos de pneus ao derrapar no asfalto ou na madeira;
  - Modulação do som do motor de acordo com a aceleração vetorial;
  - Sons distintos para a recolha e ativação de cada tipo de item;
  - **Alarme Sonoro de Proximidade**: Emite um aviso acústico agudo quando um míssil teleguiado se aproxima da retaguarda de um veículo, oferecendo ao condutor uma fração de segundo para desviar ou tentar uma manobra evasiva.

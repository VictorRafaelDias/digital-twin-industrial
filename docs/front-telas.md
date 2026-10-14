# Front-end: telas e funcionalidades (protótipo v4)

Foco atual (pedido do professor): **montar o front-end**, mesmo sem backend ligado.
As telas abaixo estão implementadas em `app/` (código React + TypeScript) e prontas para abrir em `ABRIR_AQUI/index.html`.
Dados e cálculos de exemplo rodam no navegador.

Referências: **Cisco Packet Tracer** (barra de menus, ferramentas, abas, paleta
embaixo) e o **painel de operador de uma fábrica real** (foto do Enzo, Alemanha:
fluxo do processo no topo, valores e botões grandes).

## Decisões desta versão
- **Sem perfis, 2 fatores ou auditoria.** É uma simulação. Só **login simples (usuário e senha)**.
- **Começa tudo limpo**, com guia rápido e exemplos prontos opcionais.
- **Linguagem simples**: palavras difíceis aparecem **sublinhadas** (passe o mouse ou clique: abre o glossário).
- **Tudo que é manual fica no menu Ajuda**: Guia da plataforma, Manual das máquinas e Glossário (uma barra de abas no topo da Ajuda alterna entre os três).
- **Histórico de baixo removido**; no lugar, uma linha "ao vivo" no mapa.
- **Fonte real = link clicável. Hipótese = nota "em que se baseia".** Preços são sempre "estimado".
- **Painéis recolhíveis**: a lista de máquinas (só aparece em *Montar*) e o painel lateral têm uma aba pequena para esconder/mostrar.

## Estrutura da tela

| Região | O que tem |
|---|---|
| Menus | Arquivo, Visualizar, Exemplos, Opções, **Ajuda**; nome da fábrica; usuário (Sair); botão Guia. (O menu Editar foi removido: desfazer/refazer já estão na barra) |
| Barra em **caixas** | **Ferramentas** (Selecionar, Conectar, Excluir · Desfazer/Refazer · **Limpar tudo**) · **Zoom** · **Simulação** (Iniciar/Pausar, Parar, velocidade ×1/5/20/60, duração 30 min/1 h/8 h, relógio) · **Ambiente** (temperatura em °C, situação frio/ideal/quente e botão **Efeitos**) |
| Abas | **Montar** · **Fábrica vista de cima** · **Painel da máquina** · **Resultados** · (**Ajuda**, quando aberta). Indicadores sempre visíveis: produção, **gargalo (clicável → Resultados)**, risco máximo (clicável), energia |
| Painel lateral | 4 abas: **Objetivo** · **Máquina** · **Conversa** · **Registro**. Recolhe pela setinha na borda (ou F9). Some sozinho na Ajuda |
| Embaixo | Lista de máquinas para arrastar, **só na aba Montar**. Recolhe pelo botão "Esconder máquinas" (aba pequena no canto esquerdo) |

## O que cada tela faz

| Tela | Função | O que acontece |
|---|---|---|
| **Montar** | Desenhar a fábrica | Arrastar do catálogo, mover, conectar, excluir. Máquina com problema pinta a conexão (cascata). No play, o produto "corre" pelas conexões |
| **Fábrica vista de cima** | Planta baixa | Cada máquina na sua área. Camadas: por onde o produto passa e quem gasta mais energia |
| **Painel da máquina** | Configurar como o operador faz | Faixa do processo, ritmo com ▲▼ grandes, receitas, ligar/desligar, unidades em paralelo, parada de emergência |
| **Resultados** | Entender o que acontece | Produção, eficiência, risco, energia (kW e R$); **Avisos: por que existe o gargalo, como melhorar e quanto custa** (com "Explorar no chat" e "Aplicar"); capacidade × saída (fila); antes × depois; quem gasta mais |
| **Ajuda › Guia da plataforma** | Ensinar a usar | 13 passos com imagens reais (`ABRIR_AQUI/guia/`) |
| **Ajuda › Manual das máquinas** | Explorar o catálogo | Tipo → máquinas → detalhe (o que faz, limites, risco, ambiente, **preço estimado**, fontes, imagem da tela de configuração, adicionar à fábrica) |
| **Ajuda › Glossário** | Explicar palavras | ~38 termos em grupos (produção, risco e física, energia e dinheiro, processo, sistema), com busca |

## Gargalo explicado (Resultados › Avisos)
- **Por que isso acontece:** ela entrega menos que as outras (e quanto), ritmo abaixo/no/acima do ótimo, efeito do ambiente, se é uma só unidade, fila de excesso.
- **Como melhorar:** opções com produção antes → depois, risco e **custo estimado**: voltar ao ótimo (R$ 0), subir à zona de atenção (R$ 0, risco 10%), **colocar mais 1 máquina em paralelo** (faixa de preço), ligar a máquina. Cada opção diz qual passa a ser o próximo gargalo e tem botão **Aplicar**.
- **Explorar no chat:** abre a aba Conversa já com a pergunta e a resposta orientada. Na Conversa também dá para perguntar "quanto custa melhorar o gargalo?" ou "quanto custa o pasteurizador?".
- O **Objetivo** também mostra o **investimento estimado** quando o plano pede máquinas a mais. Preços: [precos-maquinas.md](precos-maquinas.md).

## Simular uma melhoria (Resultados › Avisos)
- **"E se eu colocar N máquinas a mais na [gargalo]?"** (N de 1 a 5, botões − e +) → **Simular**: mostra produção antes → depois, risco e custo estimado.
- Se **outra máquina passar a ser o gargalo** (ex.: a Rotuladora passaria a entregar 34.200/h, mas a Enchedora segura em 12.000/h), o sistema **recalcula em cascata** e mostra o **plano completo**: tudo o que precisa mudar, passo a passo, com o investimento total. **Aplicar só esta mudança** ou **Aplicar o plano**.
- **"Quero produzir X% a mais e saber tudo o que precisa mudar"** (com opção de aceitar a zona de atenção) → **Calcular o plano completo**.
- O motor é o mesmo do Objetivo (`planGoal`), que agora aceita um ponto de partida diferente.

## Registro (4ª aba do painel lateral)
Substitui a linha "ao vivo" que ficava no topo do mapa. Lista, do mais novo para o mais antigo, o que o usuário faz e o que acontece no play (máquinas começando a trabalhar e, a cada 10 min simulados em simulações curtas ou a cada hora nas longas, "garrafas produzidas · gargalo · risco"). Tem botão **Limpar registro**. As dicas de ferramenta (ex.: "Conectar: clique na origem…") viraram mensagem rápida.

## Ambiente (temperatura)
- Caixa **Ambiente** na barra + botão **Efeitos** (abre a janela de detalhes): campo e controle de temperatura, atalhos (Inverno 10, Ideal 22, Verão 32, Calor extremo 40), produção a 25 °C × agora, tabela do efeito em cada máquina, **dilatação da água** (litros a mais num tanque de 1.000 L) e "em que se baseia".
- **Real:** dilatação da água ([EngineeringToolbox](https://engineeringtoolbox.com/cubical-expansion-coefficients-d_1262.html)). **Hipótese didática:** quanto cada máquina perde por °C (tanque 0,4%, motor 0,5%, frio 1,5%, xarope no frio 0,5%). **A validar com o professor de física.**

## Regras de conexão
Cada máquina tem uma **etapa** (insumos → preparo → térmico → gás → envase → pós-envase → frio). O sistema bloqueia ciclo, repetição, voltar etapas, mesma etapa, origem que recebe, final que envia, suco natural com xarope/mistura/gás. Uma saída para várias máquinas só se forem do **mesmo tipo** (fluxo dividido igualmente); várias entradas só do mesmo tipo ou no **misturador**. Avisos: pasteurizar suco natural; pular 4+ etapas. Linha cheia = direta; tracejada = divisão/junção.

## Simulação com tempo (Play)
1 s real em ×1 = 1 min simulado; 3 min de atraso por etapa; acumula garrafas, kWh e fila; resultado final ao terminar.

## Risco
Chance estimada de parar: ~2% (ótimo) → ~10% (atenção) → ~40% (crítico) → 100% (falha). Termos físicos no botão "?". Degraus são simplificação didática.

## Painel lateral

| Aba | Função |
|---|---|
| **Objetivo** | "Eu quero" (+X%, meta em garrafas/h ou menos risco) → "Dá para chegar lá?" → "O que fazer" com o porquê de cada passo, antes/depois, investimento estimado e **Aplicar** |
| **Máquina** | Ritmo, paralelo, ligar/desligar, testar falha, voltar ao ótimo; risco com "?"; efeito da temperatura; detalhes com fontes e **preço estimado** |
| **Conversa** | Assistente com base de manuais (exemplo): gargalo (com custo), "e se falhar", energia, "como funciona", preços, planos aplicáveis |

## Configurações (Opções)
- **Geral**: idioma, unidades, preço da energia.
- **Tipos de máquina**: ligar/desligar tipos (somem da lista e do manual), renomear, descrever, **criar tipo novo**, remover tipo vazio.
- **Limites das máquinas**: ótimo/atenção/falha editáveis e **tipo** de cada máquina.
- **Preços das máquinas**: faixa de preço editável com a fonte de cada uma.
- **Catálogo e fontes**; **Dados reais (futuro)**.

## Pontos que dependem do backend (não existem lá ainda)
- Unidades em paralelo (`qty`), máquina desligada (`off`), divisão de fluxo, temperatura ambiente, fila/tempo de chegada, plano de objetivo, **preços e custo de melhoria**, tipos configuráveis, RAG com manuais, água + xarope juntos no misturador.

## Em aberto
- Visão de cima editável ou só ilustrativa?
- Quais manuais entram na base do assistente?
- Objetivos de custo (R$ por garrafa) e campos como horas por dia?
- Ambiente variando ao longo do dia durante o play?
- Validar com o professor de física: coeficientes de temperatura e conservação da massa (Lavoisier).

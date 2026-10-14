# Front-end codificado (React + TypeScript)

O professor pediu o **front-end codificado**, e não apenas o protótipo. A partir do protótipo inicial (HTML/CSS/JS puros) foi criado o projeto `app/`, em **React 18 + TypeScript + Vite**, com **zustand** para o estado e **vitest** para os testes. Como rodar e a estrutura de pastas estão em [app/README.md](../app/README.md).

## Por que essa stack
- É a stack definida no planejamento do projeto (React + TypeScript), e é o padrão de mercado para esse tipo de interface.
- TypeScript dá tipos para o domínio (máquina, fábrica, plano, resultado), o que evita erros e documenta o código.
- zustand é pequeno e deixa o estado (fábrica, seleção, play, registro, configurações) em um só lugar, sem muito código repetido.
- O quadro de máquinas foi feito à mão (HTML + SVG) em vez de React Flow, para aplicar as regras de conexão e o efeito cascata do jeito do projeto. React Flow e Recharts ficam como opção futura.

## Do protótipo ao código
| Protótipo inicial (JS puro) | Código (`app/src`) |
|---|---|
| `data.js`, `data2.js` (catálogo, textos, preços, guia) | `data/` (gerado a partir do protótipo e mantido à mão) |
| `app.js`: funções `cap`, `risk`, `simulate`, `troubleMaps` | `engine/simulate.ts` (funções puras) |
| `app.js`: `canConnect`, `reach`, `edgeKind` | `engine/connect.ts` |
| `app.js`: `planGoal`; `features.js`: gargalo e "e se..." | `engine/goal.ts`, `engine/bottleneck.ts` |
| `app.js`: variável global `S` e ações | `store/useStore.ts` |
| `app.js`: funções `render...` com texto HTML | componentes em `components/`, `views/`, `modals/` |
| `features.js`: dinheiro, glossário, ambiente | `engine/cost.ts`, `data/glossary.ts`, `engine/water.ts`, `modals/Modals.tsx` |

Mesmas telas, mesmas regras, mesmo visual (o CSS foi reaproveitado). Pequenas melhorias no caminho: setas nas conexões, relógio do play sem reiniciar a tela de ajuda a cada tick, "aplicar só esta mudança" como ação do estado e opções de melhoria que carregam a própria mudança (sem tabela global).

## Testes
`npm test` (18 testes) cobre o motor de simulação, as regras de conexão, o planejador, o gargalo com recálculo em cascata e o estado. Os números de referência são os mesmos do protótipo (ex.: exemplo de bebidas = 11.400 garrafas/h, gargalo na rotuladora).

## Próximos passos
1. Integrar com o backend FastAPI (camada de serviço no lugar de chamar o motor local) depois que o backend ganhar paralelo, desligada, divisão de fluxo, temperatura, fila, plano e preços.
2. Salvar fábricas por usuário no banco.
3. Assistente com leitura real de manuais (RAG).
4. Avaliar React Flow e Recharts se o quadro e os gráficos crescerem.

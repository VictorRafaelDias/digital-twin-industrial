# Digital Twin Industrial: front-end (código)

Front-end do simulador de fábrica de bebidas (estilo Cisco Packet Tracer). É a versão **codificada** do protótipo inicial (HTML, CSS e JS puros): mesmas telas e regras, agora em **React + TypeScript + Vite**, com estado global, motor de simulação separado e testes automatizados.

## Como rodar

Precisa do Node.js 20 ou mais novo.

```bash
cd digital_twin_industrial/frontend/app
npm install
npm run dev        # abre em http://localhost:5175
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (porta 5175) |
| `npm run typecheck` | confere os tipos do TypeScript |
| `npm test` | roda os testes (motor de simulação e estado) |
| `npm run build` | confere os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | serve a pasta `dist/` |

Login: qualquer usuário e senha (nenhuma senha é verificada).

## Abrir sem instalar nada (para entregar ao professor)

```bash
npm run build:single
```

Gera a pasta `../ABRIR_AQUI/` com um único `index.html` (o programa inteiro) e a pasta `guia/` (imagens do guia). Basta **dar duplo clique em `ABRIR_AQUI/index.html`**: abre no navegador, sem Node, sem servidor e sem Docker. Essa pasta fica no repositório, então quem baixar o projeto também consegue abrir. Para enviar pelo Teams, compacte a pasta `ABRIR_AQUI` em um .zip (cerca de 3 MB). **Não abra o `app/index.html`**: ele é só o ponto de partida do código (mostra uma mensagem explicando isso).

## Estrutura

```
src/
  main.tsx, App.tsx          entrada e esqueleto da tela (menus, abas, painéis, atalhos, relógio do play)
  types.ts                   tipos do domínio (máquina, fábrica, simulação, plano...)
  styles/app.css             estilos (mesmo visual do protótipo)
  data/                      dados: catálogo de máquinas, preços, fontes, textos, glossário, guia
  engine/                    MOTOR DE SIMULAÇÃO (funções puras, sem React)
    simulate.ts              capacidade, risco, estado, gargalo, cascata em grafo, fila e energia
    connect.ts               regras de conexão (o que pode ligar em quê)
    goal.ts                  planejador de objetivo (+X%, meta, menos risco)
    bottleneck.ts            por que há gargalo, como melhorar, "e se eu colocar mais máquinas?"
    run.ts, cost.ts, water.ts, factory.ts, format.ts
  store/useStore.ts          estado global (zustand) e todas as ações do usuário
  components/                menu, barra de ferramentas, abas, lista de máquinas, painel lateral, textos
  views/                     telas: Montar, Fábrica vista de cima, Painel da máquina, Resultados, Ajuda
  modals/                    janelas: ambiente, risco, resultado final, configurações, sobre
public/guia/                 imagens do Guia da plataforma
```

## Decisões de projeto

- **Motor separado da interface.** `src/engine` não importa React nem lê estado global: recebe o desenho da fábrica e um contexto (catálogo, temperatura, emergência, relógio do play) e devolve números. Isso permite testar sem navegador e trocar por chamadas à API do backend depois.
- **Estado em um só lugar.** `useStore` guarda a fábrica, a seleção, o desfazer/refazer, o play, o registro e as configurações. Os componentes só leem o que precisam.
- **Catálogo é dado.** `data/catalog.ts` tem as 14 máquinas, limites, riscos, preços estimados e fontes. As Configurações editam uma cópia em memória (limites, tipos e preços).
- **Quadro feito à mão (SVG + HTML).** O desenho das máquinas e conexões é próprio, para aplicar as regras de conexão e o efeito cascata. O React Flow, previsto no começo do projeto, fica como opção futura.
- **Textos com marcação simples.** O componente `Rich` entende `<b>`, `<i>` e `<br>` e sublinha termos do glossário, sem usar `dangerouslySetInnerHTML` nos textos.

## Testes

`npm test` roda 18 testes: simulação (gargalo, risco, falha em cascata, paralelo e fila, temperatura, play), regras de conexão, planejador de objetivo, relatório de gargalo, "e se..." com recálculo em cascata e o estado (carregar exemplo, desfazer/refazer, conectar, aplicar plano, play, emergência).

## O que ainda não está integrado ao backend

O front calcula tudo no navegador. A API do backend (outro repositório do projeto) ainda não tem: unidades em paralelo, máquina desligada, divisão de fluxo, temperatura ambiente, fila, plano de objetivo, preços, tipos configuráveis e o assistente com leitura de manuais (RAG). Quando o backend tiver essas partes, basta trocar as chamadas a `engine/` por uma camada de serviço.

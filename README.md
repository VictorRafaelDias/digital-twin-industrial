# Digital Twin Industrial: front-end, base de dados e back-end

Simulador de fábrica de bebidas no estilo **Cisco Packet Tracer**: você monta o mapa da fábrica arrastando máquinas, liga uma na outra, ajusta o ritmo de cada uma e vê, em números e em palavras simples, a produção, o **gargalo**, o risco de falha, o consumo de energia e como melhorar o desempenho (e quanto custaria).

Este repositório tem o **front-end** (React + TypeScript, Sprint 0) e a **base de dados** (21 tabelas, DER e CRUD, Sprint 1). A simulação do front roda no próprio navegador, então não precisa de servidor.

---

## Professor, para ver o sistema funcionando

1. Baixe o repositório: botão verde **Code › Download ZIP**, e **descompacte** o arquivo.
2. Abra a pasta **`ABRIR_AQUI`**.
3. Dê **duplo clique em `index.html`**. O sistema abre no navegador (Chrome, Edge ou Firefox).
4. Na tela de login, entre com qualquer usuário e senha (nenhuma senha é verificada).

Não precisa instalar nada (sem Node, sem Docker, sem servidor).

> Se preferir, o mesmo sistema está publicado online em **https://victorrafaeldias.github.io/digital-twin-industrial/** (basta clicar).
> Atenção: não abra o `app/index.html`. Ele é só o ponto de partida do código-fonte.

Dica para começar: no menu **Exemplos**, carregue "Bebidas em geral", clique em **Iniciar** (caixa Simulação) e depois abra a aba **Resultados**. O menu **Ajuda › Guia da plataforma** explica cada tela, com imagens.

## Professor, para ver a base de dados (Sprint 1)

Tudo está na pasta **[`banco-de-dados/`](banco-de-dados/)**. O [README dela](banco-de-dados/README.md) tem o passo a passo; em resumo:

| O que | Onde |
|---|---|
| **DER** (diagrama entidade-relacionamento) | [`banco-de-dados/der/`](banco-de-dados/der/): comece por `DER-visao-geral.png` |
| **Banco pronto, com as 21 tabelas criadas e populadas** | [`banco-de-dados/digital_twin.db`](banco-de-dados/digital_twin.db) (abre no [DB Browser for SQLite](https://sqlitebrowser.org/)) e scripts em [`banco-de-dados/sql/`](banco-de-dados/sql/) |
| **CRUD** (Create, Read, Update, Delete) | `python banco-de-dados/scripts/crud_demo.py` mostra os comandos e os resultados em todas as tabelas |
| Dicionário de dados e decisões de modelagem | [`banco-de-dados/docs/`](banco-de-dados/docs/) |

![DER: visão geral da base de dados](banco-de-dados/der/DER-visao-geral.png)

## Professor, para ver o back-end (API)

Tudo está na pasta **[`backend/`](backend/)**. O [README dela](backend/README.md) tem o passo a passo; em resumo, com o Python instalado:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app
```

Abra **http://127.0.0.1:8000/docs** (documentação interativa): clique em **Authorize**, entre com `victor.dias` / `senha1234` e teste qualquer rota. O servidor cria sozinho o banco com as 21 tabelas e os dados iniciais.

| O que | Onde |
|---|---|
| **API (FastAPI)**: login, catálogo, fábricas, simulação, planos, cenários, Play ao vivo (WebSocket), registro e conversa | [`backend/app/`](backend/app/): 69 rotas e um WebSocket, descritas em [`backend/README.md`](backend/README.md#todas-as-rotas-69--o-websocket) |
| **Motor de simulação** (o mesmo do front-end, em Python) | [`backend/app/engine/`](backend/app/engine/) |
| **Testes automáticos** (430), incluindo a prova de que o motor em Python dá os mesmos resultados do front-end | [`backend/tests/`](backend/tests/): `pip install -r requirements-dev.txt` e `python -m pytest` |

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Base de dados](#professor-para-ver-a-base-de-dados-sprint-1)
- [Back-end (API)](#professor-para-ver-o-back-end-api)
- [Telas](#telas)
- [Rodar o código (desenvolvimento)](#rodar-o-código-desenvolvimento)
- [Scripts](#scripts)
- [Estrutura do repositório](#estrutura-do-repositório)
- [Tecnologias](#tecnologias)
- [Arquitetura e decisões](#arquitetura-e-decisões)
- [Testes](#testes)
- [Limitações e próximos passos](#limitações-e-próximos-passos)
- [Equipe e contexto](#equipe-e-contexto)

## Sobre o projeto

O objetivo é **mostrar como melhorar a performance de uma fábrica**: mudar um parâmetro (por exemplo, o ritmo de uma máquina ou a temperatura do ambiente) e ver o impacto (por exemplo, +8% de produção e mais risco de falha), com uma explicação em linguagem simples do que acontece e por quê. O sistema também mostra o equilíbrio entre ganho e desgaste.

O setor inicial é o de **bebidas**, com dois fluxos prontos:

- **Bebidas em geral:** tanques, misturador, pasteurizador, carbonatador, enchedora, esteira e rotuladora.
- **Suco de laranja natural:** recepção, lavadora, extratora, filtro, envasadora e câmara fria (sem pasteurização).

O catálogo de 14 máquinas é **dado** (não código fixo), para permitir outros setores depois. Todo número real tem **link da fonte**; o que é hipótese traz uma nota dizendo em que se baseia.

## Funcionalidades

- **Montar a fábrica:** arrastar máquinas, mover, conectar e excluir; desfazer e refazer; salvar e abrir a fábrica em arquivo `.json`.
- **Regras de conexão:** o sistema impede ligações sem sentido (ciclos, voltar etapas, misturar fluxos) e explica o motivo.
- **Efeito cascata:** uma máquina com problema pinta as conexões seguintes e mostra quem fica sem produto.
- **Simulação com tempo (Play):** velocidades ×1 a ×60, filas entre máquinas, energia e resultado final.
- **Gargalo explicado:** por que existe, como melhorar e **quanto custa** (preços estimados com fontes).
- **Simular uma melhoria:** "e se eu colocar mais 2 máquinas?", com recálculo em cascata quando outra máquina passa a limitar.
- **Objetivo:** "quero +10% de produção" gera um plano passo a passo, com o porquê de cada passo.
- **Temperatura ambiente:** efeito do calor e do frio nas máquinas e a dilatação da água.
- **Painel da máquina** (como o painel de um operador), **fábrica vista de cima**, **assistente de conversa** e **registro** de tudo o que acontece.
- **Ajuda completa:** guia da plataforma, manual das máquinas e glossário, com termos explicados nas próprias telas.
- **Dash:** aba na lateral com gráficos que acompanham a simulação ao vivo (medidor da fábrica, linha do tempo, capacidade × saída, filas, energia, risco, temperatura estimada das máquinas e desgaste) e mini-gráficos ao clicar numa máquina.
- **Idade e manutenção das máquinas:** você informa a idade e a última manutenção de cada máquina (painel **Estado das máquinas** no quadro, ou no painel da máquina); máquina velha rende menos, arrisca mais e esquenta mais (hipótese didática). Por padrão todas são novas. Funciona também sem servidor.
- **Dados reais:** anexar a ficha técnica (PDF) de uma máquina; o sistema lê por regras (sem IA e sem custo), você confere e edita, ele avisa se já existe uma máquina parecida (lado a lado) e você escolhe atualizar, salvar como nova versão ou criar.
- **Modo servidor:** login de verdade, fábricas guardadas por usuário, resultados do Play e desgaste guardados no banco; sem servidor o sistema continua funcionando sozinho no navegador.
- **Configurações:** tipos de máquina, limites (ótimo, atenção, falha) e preços editáveis.

## Telas

| Montar a fábrica | Simulação em andamento |
|---|---|
| ![Montar a fábrica](docs/imagens/F-montar-bebidas.png) | ![Simulação em andamento](docs/imagens/N-play.png) |

![Resultados: gargalo e como melhorar](docs/imagens/AC-resultados.png)

O mapa completo de telas está em [docs/front-telas.md](docs/front-telas.md).

## Rodar o código (desenvolvimento)

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
cd app
npm install
npm run dev
```

O sistema abre em `http://localhost:5175`.

## Scripts

Execute dentro da pasta `app/`:

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (porta 5175) |
| `npm run typecheck` | confere os tipos do TypeScript |
| `npm test` | roda os testes automatizados |
| `npm run build` | confere os tipos e gera a versão de produção em `app/dist/` |
| `npm run build:single` | gera um único `index.html` na pasta `ABRIR_AQUI/` (abre com duplo clique) |

## Estrutura do repositório

```
.
├── ABRIR_AQUI/        sistema pronto: index.html (duplo clique) + imagens do guia
├── app/               código-fonte (React + TypeScript + Vite)
│   └── src/
│       ├── engine/    motor de simulação (funções puras, sem React)
│       ├── store/     estado global (zustand) e ações do usuário
│       ├── data/      catálogo de máquinas, preços, fontes, glossário, textos
│       ├── components/, views/, modals/    interface
│       └── styles/
├── banco-de-dados/    base de dados: DER, banco SQLite pronto, scripts SQL, CRUD e testes (Sprint 1)
├── backend/           API (FastAPI): login, catálogo, fábricas, simulação, planos, Play ao vivo, dashboard, desgaste, importação de ficha técnica; motor em Python e 430 testes
├── docs/              mapa de telas, decisões do código e preços estimados
└── index.html         redireciona para ABRIR_AQUI (usado na página publicada)
```

## Tecnologias

React 18 · TypeScript · Vite · zustand (estado) · Vitest (testes). Sem bibliotecas de interface de terceiros: o quadro de máquinas é feito em HTML e SVG.

## Arquitetura e decisões

- **O motor de simulação é separado da interface** (`app/src/engine`): são funções puras que recebem o desenho da fábrica e devolvem números. Dá para testar sem navegador e trocar depois por chamadas a uma API.
- **Estado em um só lugar** (`app/src/store/useStore.ts`): fábrica, seleção, desfazer/refazer, play, registro e configurações.
- **O catálogo é dado** (`app/src/data/catalog.ts`): limites, riscos, preços estimados e fontes de cada máquina.

Mais detalhes em [docs/front-codigo.md](docs/front-codigo.md) e em [app/README.md](app/README.md).

## Testes

```bash
cd app
npm test
```

São 82 testes: motor de simulação (gargalo, risco, falha em cascata, paralelo e fila, temperatura, **desgaste**, play), temperatura estimada das máquinas, regras de conexão, planejador de objetivo, relatório de gargalo, "e se..." com cascata, o estado da aplicação, as **versões do relatório (V1, V2) e o uso das máquinas** e o **modo servidor** (login, catálogo do servidor, guardar e abrir fábricas, desgaste, Play guardado), com um servidor de mentira.

O back-end tem os próprios testes (430), em [`backend/`](backend/README.md#testes).

## Limitações e próximos passos

- A simulação é **didática**: os degraus de risco e os percentuais de temperatura são hipóteses (estão marcados assim no sistema). Os **preços são estimativas** de anúncios de fornecedores, não cotações ([docs/precos-maquinas.md](docs/precos-maquinas.md)).
- O assistente de conversa responde com base na fábrica atual; a leitura de manuais em PDF ainda é de demonstração.
- O front-end **fala com a API** quando você marca "Usar o servidor" no login (fábricas guardadas, desgaste, importação de fichas). Sem servidor, ele calcula tudo no navegador (por isso funciona na versão online do GitHub Pages). A API e o banco foram validados no **PostgreSQL 16** (Docker): os 430 testes da API passam nele e `docker compose up --build` na pasta `backend/` sobe tudo.
- O desgaste, a depreciação e a temperatura das máquinas são **hipóteses didáticas** (a validar). A leitura de ficha técnica funciona com PDF de texto (não faz OCR de imagem).
- Próximos passos: acompanhar o Play ao vivo pelo WebSocket na tela e leitura real de manuais (RAG). Ver [docs/novas-funcionalidades.md](docs/novas-funcionalidades.md).

## Equipe e contexto

Trabalho da disciplina de PLN (FATEC Cotia), em dupla: **Victor Rafael de Oliveira Dias** e **Enzo Fernandes**. Professor: Braz Izaias da Silva Junior.

Projeto acadêmico. Nenhuma licença de uso foi definida até o momento.

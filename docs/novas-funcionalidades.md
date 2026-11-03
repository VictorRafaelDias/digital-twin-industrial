# Novas funcionalidades sugeridas (Enzo + conversa com o Victor, 28/10/2026)

Três pedidos novos. Este documento registra o que foi pedido, o que cada um muda no sistema e a decisão de ordem. As três foram implementadas (ver a tabela de situação logo abaixo).

## Situação (03/11/2026): as três foram implementadas

| Funcionalidade | O que ficou pronto | O que NÃO tem (honestidade) |
|---|---|---|
| **1. Dashboard** | Aba **Dash** na lateral com 9 gráficos em SVG (medidor da fábrica, linha do tempo do Play, capacidade × saída, filas, energia, risco, temperatura das máquinas, desgaste, simulações guardadas) que acompanham o Play ao vivo; mini-gráficos e temperatura ao clicar numa máquina; o servidor guarda a linha do tempo (até 120 pontos) e tem a rota `/dashboard`. | A **temperatura da máquina é hipótese didática** (ambiente + calor pela carga), não medição. Os gráficos não têm tela cheia nem exportação. |
| **2. Ficha técnica** | Anexar PDF ou .txt; leitura **por regras** (sem IA, sem custo) de fabricante, modelo, ano, capacidade, potência e tipo, cada campo com o trecho e a página de origem; tela de conferência e edição; **comparação lado a lado** com máquinas parecidas; decisões: atualizar (sobrepõe), **nova versão** (v1 continua), criar nova; bloqueio do mesmo arquivo duas vezes e de nomes repetidos; excluir máquina importada (bloqueado se uma fábrica usa); painel em Configurações. Testado com uma ficha real da Tetra Pak (Pasteurizer D Base). | PDF escaneado (só imagem) não é lido (sem OCR). Os **limites de ritmo, o consumo parado/variável e a vida útil** da máquina importada são valores padrão (hipótese didática) que você pode ajustar. A conversão de litros/h para garrafas/h supõe garrafa de 0,5 L (editável). Sem preço (a ficha não traz). |
| **3. Desgaste** | Horas de uso e de desgaste por máquina (mais rápido acima do ótimo), vida útil gasta, **depreciação**, previsão de manutenção e de fim de vida, perda de rendimento e aumento do risco **dentro do motor** (produção, gargalo e planos já consideram máquinas gastas), manutenção preventiva e corretiva com histórico, alertas no dashboard. | Tudo é **hipótese didática** (valores em `backend/app/engine/wear.py`). Só funciona com servidor (precisa guardar o estado). Não prevê quebra por sensores (só por horas e ritmo). |

Banco: **25 tabelas** (4 novas e colunas novas, migração que só acrescenta; um banco da versão 1 é atualizado sozinho ao subir o servidor). Os DER em imagem continuam os da versão 1 (21 tabelas); as tabelas novas estão no dicionário de dados.

## 1. Dashboard de produção (por máquina e da fábrica inteira)

**Pedido.** Gráficos simples que deem uma visão geral rápida, além dos números: ao clicar numa máquina, ver quanto ela produz e o quanto está esquentando; e, na barra lateral, uma **aba "Dash"** que acompanha a fábrica inteira **enquanto a simulação roda**. O professor quer ver isso.

**Visualizações propostas** (para contar a história: "como está, o que limita, para onde vai"):

| Gráfico | O que mostra | Onde |
|---|---|---|
| Medidor da fábrica | Produção agora × máximo possível (%), com a cor do risco | Aba Dash |
| Linha do tempo do Play | Garrafas acumuladas × ideal, ao vivo | Aba Dash |
| Barras capacidade × saída por máquina | Onde o produto "trava" (o gargalo aparece sozinho) | Aba Dash |
| Mapa de filas | Quanto está parado esperando em cada máquina | Aba Dash |
| Rosca de energia | Quem gasta mais (kW e R$/h) | Aba Dash |
| Termômetro de risco | Risco de cada máquina (2% a 100%) | Aba Dash e painel da máquina |
| Mini-painel da máquina | Produção, risco, energia e **temperatura estimada** ao longo do play | Ao clicar na máquina |

**Atenção, hipótese:** hoje o modelo **não tem temperatura da máquina**, só a temperatura do ambiente. Para mostrar "o quanto está esquentando" é preciso um modelo novo: temperatura da máquina = ambiente + aquecimento proporcional à carga (cada tipo com o seu coeficiente). Será **hipótese didática**, com nota de em que se baseia.

**O que muda:** front (aba Dash, gráficos em SVG); back (série temporal do play: um ponto por passo, guardada por simulação); banco (tabela de pontos do play).

## 2. Dados reais: anexar a ficha técnica e o sistema aprende a máquina

**Pedido.** Em Configurações > "Dados reais (futuro)", a empresa anexa a ficha técnica/manual de uma máquina; o sistema **extrai os dados sozinho** (RAG sobre o documento), mostra o que entendeu para o usuário **conferir e editar**, cria a máquina no catálogo e a **classifica** em um dos tipos. Depois, um painel em Configurações permite **excluir**.

**Fluxo desenhado:**
1. Anexar o arquivo (PDF, texto).
2. O sistema extrai o texto e os campos (nome, fabricante, modelo, capacidade, potência, faixas de ritmo, etc.) e sugere o tipo da máquina.
3. Mostra a tela de conferência: campo a campo, com o trecho do documento de onde veio cada dado (**fonte e confiança**, como no resto do sistema), editável.
4. **Antes de salvar, verifica duplicidade:**
   - mesmo arquivo (mesma impressão digital do documento) → avisa "este documento já foi anexado";
   - mesmo fabricante e modelo, ou nome muito parecido → mostra a **máquina existente e a nova lado a lado** (comparação campo a campo, diferenças em destaque).
5. O usuário escolhe: **atualizar** a existente (sobrepõe: serve quando a ficha só traz mais dados), **salvar como nova versão** (v2, ano 2, etc., quando é uma máquina diferente) ou **cancelar**.
6. As versões antigas **continuam no sistema** (numa fábrica real, trocar de máquina leva tempo e custo; uma linha pode ter a versão antiga e a nova ao mesmo tempo). Só o cadastro é que sobrepõe ou versiona.
7. Painel de gestão em Configurações: lista de máquinas com origem (embutida ou importada), versão e documento; **excluir** (só importadas; se estiver em uso numa fábrica, o sistema avisa e bloqueia).

**Decisões do Victor (28/10/2026):**
- **Extração só por regras** (palavras-chave, tabelas e padrões de texto no PDF), **sem modelo de linguagem e sem nenhum custo**: é um projeto acadêmico. Simples e offline; o que as regras não entenderem fica em branco para o usuário preencher na tela de conferência.
- Os "4 tipos" falados na conversa eram só um exemplo: valem os **6 tipos do catálogo** (Insumos, Preparo, Térmico e gás, Envase, Pós-envase, Refrigeração), e a sugestão de tipo vem por palavras-chave.

**O que muda:** banco (documentos anexados, versões da máquina, origem); back (upload, extração, verificação de duplicidade, comparação, versionamento, exclusão); front (assistente em 3 passos e painel em Configurações).

## 3. Mundo real: desgaste, depreciação e previsão de quebra

**Pedido.** O professor pediu **degradação**. Incluir o **tempo de uso da máquina** e outros termos do chão de fábrica que o modelo ideal não prevê (depreciação, desgaste), para o sistema **prever quando a máquina pode quebrar** e quando precisa de manutenção. Pode usar a análise de desempenho ou, no futuro, sensores, e entrar no histórico/log.

**Proposta (tudo hipótese didática, a validar):**

| Campo novo por máquina | Para quê |
|---|---|
| Data de instalação e horas de operação | Idade da máquina |
| Vida útil de referência (horas) | Base do desgaste e da depreciação |
| Última manutenção e intervalo recomendado | Calcular "manutenção atrasada" |

Efeitos no modelo:
- **Desgaste:** a capacidade cai com a idade (ex.: perda gradual de até X% perto do fim da vida útil) e o **risco base sobe** (hoje 2% no ótimo).
- **Depreciação:** valor residual da máquina ao longo da vida útil (linha reta), para o custo de trocar versus manter.
- **Previsão:** "tempo até chegar ao risco crítico" no ritmo atual, e "manutenção em N horas".
- **Manutenção:** registrar uma manutenção zera parte do desgaste e entra no histórico/log.
- Operar acima do ótimo **acelera** o desgaste (liga com o risco já existente).

**O que muda:** banco (campos na máquina da fábrica e tabela de manutenções); motor (fator de desgaste na capacidade e no risco, previsão); front (idade, vida útil restante e alerta de manutenção no painel da máquina e no Dash); histórico/log.

## Ordem de execução (decisão)

1. **Back-end completo** (pedido do professor): **feito**, com o banco do Sprint 1 como está (21 tabelas). As três funcionalidades abaixo precisam de tabelas e colunas novas (versões de máquina, documentos, pontos do play, desgaste e manutenção); elas entram como uma **migração que só acrescenta**, sem mudar nada do que já foi entregue.
2. **Dashboard** (aba Dash + mini-painel): é o que o professor quer ver e depende só do que já existe.
3. **Desgaste e previsão**.
4. **Importar ficha técnica** (o maior: precisa decidir a extração).

Quando o banco ganhar as tabelas novas, o DER, o dicionário de dados e o documento (Word e PDF) são atualizados; o Sprint 1 já entregue continua válido como versão 1.

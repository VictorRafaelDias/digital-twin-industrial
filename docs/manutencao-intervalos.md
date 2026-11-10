# Intervalos de manutenção ("estar em dia")

Cada máquina tem a **data da última manutenção** (campo no painel Estado das máquinas e no painel da máquina). O sistema compara essa data com o
**intervalo recomendado** do tipo de máquina:

- até 80% do intervalo: **em dia**;
- de 80% a 100%: **atenção** (perto da hora);
- passou do intervalo: **manutenção atrasada** (rende menos e arrisca mais, até −5% de rendimento, +4 pontos de risco e +4 °C);
- **sem data informada**: a máquina conta como em dia.

A data não pode estar no futuro nem antes de 1950, e a máquina não pode ter ficado sem manutenção por mais tempo do que a idade dela.

## Intervalos usados (hipótese didática)

| Categoria | Máquinas | Intervalo |
|---|---|---|
| Envase | enchedoras | 3 meses |
| Tratamento térmico e gás | pasteurizador, carbonatador | 3 meses |
| Pós-envase e transporte | rotuladora, esteira | 3 meses |
| Insumos | tanques de água, recepção de laranjas | 6 meses |
| Preparo | tanque de xarope, misturador, lavadora, extratora, filtro | 6 meses |
| Refrigeração | câmara fria | 6 meses |

Por dentro o intervalo é guardado em horas de uso (1.000 h = 3 meses e 2.000 h = 6 meses, com 4.000 h de uso por ano).

## O que a pesquisa encontrou (e o que não)

**Não existe um intervalo único de norma**: guias de fornecedores e consultorias dizem que o ponto de partida é o **manual do fabricante**, ajustado pela criticidade
e pelo histórico de falhas de cada equipamento. Em calendário, a manutenção preventiva costuma ser mensal, trimestral, semestral ou anual, e o intervalo muda
principalmente o **escopo** (a mensal tem menos itens; a trimestral soma itens; a semestral é a mais completa).

O que os guias de bebidas e alimentos citam:
- pasteurizadores e trocadores de calor: inspeção semanal e serviço mensal (incrustação nas placas e falha de gaxetas são os problemas típicos);
- envasadoras: calibração semanal de sensores e inspeção mensal de componentes de carbonatação;
- transportadores: lubrificação e alinhamento mensais, troca de vedações e inspeção completa anual pelo fabricante.

Adotamos **3 meses** para as máquinas que mais gastam (envase, térmico, pós-envase), como o ciclo de manutenção **completa** (os serviços mensais e semanais
ficam dentro dele), e **6 meses** para as de menor desgaste (tanques, preparo, frio). **Isto é uma hipótese didática**: para uma máquina real vale o manual do fabricante.

Fontes: [Oxmaint, manutenção de equipamentos de bebidas](https://oxmaint.com/industries/food-manufacturing/beverage-production-equipment-maintenance-fillers-carbonators-pasteurizers) ·
[iFactory, checklist para fábricas de alimentos e bebidas](https://ifactoryapp.com/article/food-plant-preventive-maintenance-checklist) ·
[iFactory, linhas FMCG](https://ifactoryapp.com/industries/fmcg/fmcg-production-line-preventive-Analytics-complete) ·
[Food Engineering, manutenção preventiva em transportadores](https://www.foodengineeringmag.com/articles/101956-how-preventative-maintenance-can-avoid-conveyor-downtime) ·
[Alfa Laval, manutenção preventiva](https://www.alfalaval.in/service-and-support/service-overview/maintenance-services/preventive-maintenance) ·
[Tractian, cronograma de manutenção preventiva](https://tractian.com/glossario/preventive-maintenance-schedule)

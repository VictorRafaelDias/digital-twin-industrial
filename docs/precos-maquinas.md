# Preços estimados das máquinas (para estimar o custo de uma melhoria)

Usados pelo front-end quando o sistema sugere **colocar mais uma máquina** (aba *Objetivo*, *Resultados › Avisos* e *Conversa*).
Aparecem no sistema em *Manual › detalhe da máquina*, na aba *Máquina › Mais detalhes* e em *Opções › Configurações › Preços das máquinas* (editáveis).

## Regras
- São **estimativas** (confiança `estimado`), nunca cotação. Para decidir uma compra, pedir cotação ao fabricante.
- Valores de **1 unidade**, em reais. Câmbio de referência: **R$ 5,50 por US$** (hipótese; atualizar).
- Quase todos os anúncios achados são de máquinas **menores** que as da simulação (ex.: enchedora de 800 garrafas/h contra 12.000 na simulação). A faixa foi **escalada** a partir deles e isso está dito em cada nota. Onde não achei preço confiável, a faixa é por analogia e o sistema avisa.
- Pesquisa feita em 12/10/2026. Preços de anúncio mudam e costumam não incluir frete, impostos nem instalação.

## Tabela

| Máquina | Faixa (R$) | Base | Fontes |
|---|---|---|---|
| Tanque de água | 20 mil a 80 mil | Tanque inox de 1.000 L: US$ 1,7 mil (usado) a 5–7 mil (novo). Escalado para 12 m³/h | [GW Kent](https://www.gwkent.com/mixing-blending-tank-1000-l-265-gal.html) |
| Tanque de xarope | 20 mil a 80 mil | Mesma base do tanque de água | [GW Kent](https://www.gwkent.com/mixing-blending-tank-1000-l-265-gal.html) |
| Misturador | 30 mil a 150 mil | Tanque misturador de 1.000 L com agitador: US$ 2,5 a 7 mil. Misturador contínuo com dosagem custa mais | [GW Kent](https://www.gwkent.com/mixing-blending-tank-1000-l-265-gal.html) |
| Pasteurizador | 150 mil a 600 mil | Só anúncios pequenos: 35 L por US$ 4 mil; 1.000 L/h por ~US$ 3,5 mil. Escalado para 13 mil L/h | [TradeIndia](https://www.tradeindia.com/products/small-juice-flash-pasteurizer-3735975.html), [IndiaMART](https://m.indiamart.com/proddetail/juice-pasteurizer-machine-pasteurizer-machine-for-juice-22062476288.html) |
| Carbonatador | 60 mil a 200 mil | Em linha: US$ 29,95 mil novo (Padovan); £ 4,5 mil usado (Carbotech 500, £ 9 mil novo) | [BrewBids](https://brewbids.com/?p=58539), [SIBA](https://siba.co.uk/awpcp/show-ad/?id=49149) |
| Enchedora | 1,5 mi a 4 mi | 4 bicos: US$ 7 mil (240–400/h) a US$ 52 mil (800/h com tampadora). 12 mil/h é outra escala; a de 6.000/h usada é "sob consulta". **Faixa muito incerta** | [Zonesun CF4](https://zonesunautopack.com/products/zs-cf4-carbonated-drinks-liquid-filling-machine), [Zonesun CFC4](https://www.zonesuntech.com/products/automatic-4-heads-beer-soda-carbonated-drinks-glass-bottle-crown-caps-bottling-isobaric-filling-capping-machine), [Exapro ICS](https://www.exapro.com/ics-multifill-960-24-240-6kk-6sv-p251028072/) |
| Esteira | 20 mil a 80 mil | Só a correia modular: US$ 144 a 270 por metro. Com motor, estrutura e instalação, faixa estimada | [MROSupply](https://www.mrosupply.com/products/2778890/as-markdown/) |
| Rotuladora | 40 mil a 140 mil | Rotuladoras de luva: US$ 7 mil a 25 mil (100–150 garrafas/min) | [Zonesun STB150](https://zonesunautopack.com/products/zs-stb150-bottle-sleeving-and-shrinking-labeling-machine) |
| Recepção de laranjas | 20 mil a 80 mil | **Sem preço encontrado**: analogia com esteiras e moegas | — |
| Lavadora de frutas | 25 mil a 60 mil | Lavadoras de bolhas: US$ 4,5 a 6 mil em sites de revenda. **Fonte fraca, sem link confiável** | — |
| Extratora | 150 mil a 600 mil | Comerciais pequenas: US$ 0,5 a 2 mil (20–25 laranjas/min). Industrial de 1,3 t/h é outra escala | [Zanduco (Omcan)](https://www.zanduco.com/us/omcan-citrus-max-orange-juice-extractor-20-oranges-per-minute-stainless-steel.html) |
| Filtro/despolpadeira | 20 mil a 80 mil | Despolpadeiras de 0,5 a 2,5 t/h: ~US$ 1 mil a 11 mil | [Zonesun ZJ02](https://www.zonesunautopack.com/ja/products/zonesun-zs-zj02-double-stage-fruit-vegetable-pulping-machine) |
| Envasadora de suco | 200 mil a 500 mil | Enchedora de 4 bicos com tampadora, ~800 garrafas/h: US$ 52 mil (≈ R$ 286 mil) | [Zonesun CFC4](https://www.zonesuntech.com/products/automatic-4-heads-beer-soda-carbonated-drinks-glass-bottle-crown-caps-bottling-isobaric-filling-capping-machine) |
| Câmara fria | 120 mil a 250 mil | Câmaras de 10 a 40 m³: US$ 14 mil a 31 mil (≈ US$ 580 a 1.400/m³); compras de vacinas, tendem a ser mais caras que as comerciais | [UNICEF](https://supply.unicef.org/all-materials/cold-chain-equipment/cold-freezer-rooms.html?p=3) |

## Onde está no código
`app/src/data/catalog.ts` (objetos `COST` e `PR`). O backend ainda não tem preços.

## Pendências
- Achar preço de **linhas industriais de verdade** (enchedora de 12 mil garrafas/h, pasteurizador de 13 m³/h): só por cotação com fabricantes (Krones, Tetra Pak, JBT).
- Decidir se o custo entra também no objetivo "reduzir custo por garrafa" (precisa de horas por dia e vida útil).

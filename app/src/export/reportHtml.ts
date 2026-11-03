/* Exportar o relatório e/ou a comparação em PDF.
   Sem biblioteca e sem custo: montamos uma página HTML própria para impressão e abrimos a janela de impressão do navegador
   (nela, escolha "Salvar como PDF"). Funciona também na versão offline (ABRIR_AQUI). */
import { moneyRange } from '../engine/cost';
import { fmt, fv } from '../engine/format';
import type { BarRow } from '../components/Charts';
import type { ChartData } from '../store/reportData';
import { moneyDelta, valueCompare } from '../store/value';
import { diffVersions, utilization, UTIL_TEXT, utilLevel, type ReportVersion } from '../store/versions';
import type { BnReport, Catalog, FNode } from '../types';

export type ExportKind = 'relatorio' | 'comparacao' | 'ambos';

export interface ExportInput {
  kind: ExportKind; factory: string; ambient: number; tariff: number; generatedAt: string; server: boolean;
  cd: ChartData; nodes: FNode[]; catalog: Catalog; bn: BnReport | null;
  versions: ReportVersion[]; a?: ReportVersion; b?: ReportVersion;
}

export const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s: string): string => esc(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));

const CSS = `
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Segoe UI, Arial, sans-serif; color: #17232E; font-size: 11.5px; line-height: 1.4; margin: 0; }
h1 { font-size: 21px; margin: 0 0 2px; } h2 { font-size: 15px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #1C7293; color: #17232E; }
h3 { font-size: 12.5px; margin: 12px 0 4px; } .sub { color: #66757F; font-size: 10.5px; margin: 2px 0 6px; }
.head { border-bottom: 3px solid #17232E; padding-bottom: 6px; margin-bottom: 8px; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
.kpi { border: 1px solid #DCE3E8; border-radius: 8px; padding: 8px 10px; } .kpi small { color: #66757F; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; display: block; }
.kpi b { font-size: 19px; display: block; } .kpi em { font-style: normal; color: #66757F; font-size: 10px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; } th, td { border-bottom: 1px solid #E5EBEF; padding: 4px 6px; text-align: left; vertical-align: top; }
th { font-size: 9.5px; text-transform: uppercase; color: #66757F; letter-spacing: .03em; background: #F5F8FA; } td.n, th.n { text-align: right; white-space: nowrap; }
.ok { color: #2E8B57; font-weight: 700; } .bad { color: #C0392B; font-weight: 700; } .warn { color: #E8871E; font-weight: 700; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .box { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px; }
.bar { display: grid; grid-template-columns: 112px 1fr 96px; gap: 6px; align-items: center; margin: 2px 0; font-size: 10.5px; }
.trk { height: 9px; background: #EEF2F4; border-radius: 5px; position: relative; overflow: hidden; } .trk i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
.leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 10px; margin: 4px 0; } .leg i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; }
ul { margin: 3px 0 6px; padding-left: 18px; } li { margin: 1px 0; }
.note { background: #FBF6EA; border: 1px solid #F0DDB0; border-radius: 6px; padding: 6px 9px; font-size: 10.5px; margin: 6px 0; }
.foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #DCE3E8; color: #66757F; font-size: 9.5px; }
.pb { break-before: page; page-break-before: always; }
`;

/** Barras horizontais em HTML (com `b`, a clara é a capacidade e a escura é o que sai). */
function bars(rows: BarRow[], o: { max?: number; unit?: string; dec?: number } = {}): string {
  const max = o.max ?? Math.max(1, ...rows.map((r) => r.a));
  return rows.map((r) => {
    const light = r.b !== undefined;
    const txt = light ? `${fmt(r.b, o.dec ?? 0)} / ${fmt(r.a, o.dec ?? 0)}` : `${fmt(r.a, o.dec ?? 0)}${o.unit ?? ''}`;
    return `<div class="bar"><span>${esc(r.label)}</span><div class="trk">${light ? `<i style="width:${Math.min(100, (r.a / max) * 100)}%;background:#cfe3ea"></i><i style="width:${Math.min(100, ((r.b ?? 0) / max) * 100)}%;background:${r.color}"></i>` : `<i style="width:${Math.min(100, (r.a / max) * 100)}%;background:${r.color}"></i>`}</div><span>${txt}${r.note ? ` <small>${esc(r.note)}</small>` : ''}</span></div>`;
  }).join('');
}

/** Rosca em SVG (fatias proporcionais ao valor). */
function donut(slices: { label: string; value: number; color: string }[], center: string): string {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1, R = 38, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = slices.map((s) => { const len = (s.value / total) * C; const el = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`; off += len; return el; }).join('');
  const legend = slices.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} ${fmt((s.value / total) * 100)}%</span>`).join('');
  return `<div style="display:flex;gap:10px;align-items:center"><svg width="120" height="120" viewBox="0 0 120 120">${arcs}<text x="60" y="64" text-anchor="middle" font-size="11" font-weight="700">${esc(center)}</text></svg><div class="leg" style="flex-direction:column;gap:2px">${legend}</div></div>`;
}

const box = (title: string, what: string, body: string): string => `<div class="box"><h3>${esc(title)}</h3><div class="sub">${esc(what)}</div>${body}</div>`;

function reportSection(i: ExportInput): string {
  const { cd, nodes, bn } = i, sim = cd.sim;
  const oee = cd.best ? Math.min(130, (sim.production / cd.best) * 100) : 0;
  const perK = sim.production ? ((sim.energy * i.tariff) / sim.production) * 1000 : 0;
  const stateCls = (s: string) => (s === 'falha' ? 'bad' : s === 'normal' ? 'ok' : 'warn');
  const rows = nodes.map((n) => {
    const r = sim.res[n.id], u = utilization(r.cap, cd.flow[n.id]), w = cd.wearRows.find((x) => x.label === cd.names[n.id]);
    return `<tr><td><b>${esc(cd.names[n.id])}</b></td><td class="n">${n.qty}</td><td class="${stateCls(r.state)}">${esc(r.state)}</td><td class="n">${fmt(r.cap)}</td><td class="n">${fmt(cd.flow[n.id])}</td><td class="n">${r.cap > 0 ? fmt(u * 100) + '%' : '—'}</td><td class="n">${fmt(r.queue)}</td><td class="n">${fmt(r.risk * 100, 1)}%</td><td class="n">${fmt(r.energy, 1)}</td><td class="n">${fmt(cd.temps[n.id])}</td>${cd.hasWear ? `<td class="n">${w ? fmt(w.a) + '%' : '—'}</td>` : ''}</tr>`;
  }).join('');
  const util: BarRow[] = nodes.map((n) => ({ label: cd.names[n.id], a: utilization(sim.res[n.id].cap, cd.flow[n.id]) * 100, color: ({ ociosa: '#E8871E', folga: '#1C7293', bem: '#2E8B57', limite: '#C0392B' })[utilLevel(utilization(sim.res[n.id].cap, cd.flow[n.id]))], note: sim.res[n.id].cap > 0 ? UTIL_TEXT[utilLevel(utilization(sim.res[n.id].cap, cd.flow[n.id]))] : 'desligada' }));
  const opts = bn?.options.length
    ? `<table><thead><tr><th>Opção</th><th class="n">Produção/h</th><th class="n">Risco</th><th>Custo estimado</th></tr></thead><tbody>${bn.options.map((o) => `<tr><td><b>${esc(o.title)}</b><br/><span class="sub">${plain(o.detail)}${o.next ? ` Depois, o gargalo passa a ser: ${esc(o.next)}.` : ''}</span></td><td class="n">${fmt(bn.prod)} → <b>${fmt(o.prod)}</b> (+${fmt(o.gain, o.gain < 10 ? 1 : 0)}%)</td><td class="n">${fmt(o.risk * 100, 1)}%</td><td>${o.cost ? esc(moneyRange(o.cost)) : 'R$ 0'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="sub">Não há ajuste simples que aumente a produção: a máquina já está no limite. O caminho é um modelo de maior capacidade (consulte o fabricante) ou uma segunda linha.</div>';
  return `
<h2>1. Relatório da fábrica</h2>
<div class="kpis">
  <div class="kpi"><small>Produção</small><b>${fmt(sim.production)}</b><em>garrafas por hora</em></div>
  <div class="kpi"><small>Eficiência</small><b>${fmt(oee)}%</b><em>produção ÷ máximo no ótimo (${fmt(cd.best)}/h)</em></div>
  <div class="kpi"><small>Risco de quebra</small><b class="${sim.maxRisk > 0.1 ? 'bad' : 'ok'}">${fmt(sim.maxRisk * 100, 1)}%</b><em>na pior máquina</em></div>
  <div class="kpi"><small>Energia</small><b>${fmt(sim.energy, 1)} kW</b><em>≈ R$ ${fmt(sim.energy * i.tariff, 2)}/h · R$ ${fmt(perK, 2)} por mil garrafas</em></div>
</div>
${bn ? `<h3>Gargalo: ${esc(bn.name)} (limita a fábrica a ${fmt(bn.prod)} garrafas/h)</h3><div class="sub">Por que isso acontece</div><ul>${bn.why.map((w) => `<li>${plain(w)}</li>`).join('')}</ul><div class="sub">Como melhorar</div>${opts}` : ''}
<h3>Máquina por máquina</h3>
<table><thead><tr><th>Máquina</th><th class="n">Unid.</th><th>Situação</th><th class="n">Capacidade/h</th><th class="n">Passa/h</th><th class="n">Uso</th><th class="n">Fila/h</th><th class="n">Risco</th><th class="n">kW</th><th class="n">°C</th>${cd.hasWear ? '<th class="n">Desgaste</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
<div class="sub">Capacidade = o que a máquina consegue entregar; Passa = o que realmente passa por ela com a fábrica no ritmo do gargalo; Uso = Passa ÷ Capacidade. Temperatura e desgaste são hipóteses didáticas, não medições.</div>
<div class="grid2">
  ${box('Capacidade × o que sai', 'Garrafas por hora. Barra clara: o que consegue entregar; escura: o que sai.', bars(cd.capRows))}
  ${box('Uso das máquinas', 'Quanto da capacidade está sendo usado. Perto de 100% é o limite.', bars(util, { unit: '%' }))}
  ${box('Quem gasta energia', 'Parte do consumo de cada máquina.', donut(cd.slices, fmt(sim.energy, 1) + ' kW'))}
  ${box('Risco de falha', 'Chance estimada de cada máquina parar no ritmo atual (2% no ótimo).', bars(cd.riskRows, { max: 50, unit: '%', dec: 1 }))}
  ${box('Temperatura das máquinas', `Ambiente (${i.ambient} °C) mais o calor do trabalho. Hipótese didática.`, bars(cd.tempRows, { max: Math.max(100, ...cd.tempRows.map((r) => r.a)), unit: ' °C' }))}
  ${cd.queueRows.some((r) => r.a >= 1) ? box('Filas', 'Excesso que uma máquina entrega e a seguinte não aguenta (nada se perde).', bars(cd.queueRows, { unit: '/h' })) : ''}
  ${cd.hasWear ? box('Idade e desgaste', 'Quanto da vida útil cada máquina já gastou, pela idade informada (Estado das máquinas).', bars(cd.wearRows, { max: 100, unit: '%' })) : ''}
</div>`;
}

function compareSection(i: ExportInput, n: number): string {
  const { a, b, catalog, versions } = i;
  if (!a || !b) return `<h2>${n}. Comparação de versões</h2><div class="note">Ainda não há duas versões para comparar. Aplique uma melhoria e rode a simulação (ou use “Salvar versão agora”).</div>`;
  const d = (x: number, y: number, dec = 0, low = false) => { const z = y - x; return z === 0 ? '—' : `<span class="${(z < 0) === low ? 'ok' : 'bad'}">${z > 0 ? '+' : '−'}${fmt(Math.abs(z), dec)}</span>`; };
  const changes = diffVersions(a, b, catalog);
  const ids = [...new Set([...a.machines.map((m) => m.id), ...b.machines.map((m) => m.id)])];
  const ma = (id: string) => a.machines.find((m) => m.id === id), mb = (id: string) => b.machines.find((m) => m.id === id);
  const ut = (m?: ReportVersion['machines'][number]) => (m ? (m.off || m.cap <= 0 ? '—' : fmt(utilization(m.cap, m.eff) * 100) + '%') : '—');
  const names = (id: string) => (mb(id) ?? ma(id))!.name;
  const cmp = valueCompare(a, b, catalog);
  const uvRows = ids.map((id) => `<div class="box"><div class="bar" style="grid-template-columns:112px 1fr 0"><b>${esc(names(id))}</b><span></span><span></span></div>${[a, b].map((v, k) => { const m = v.machines.find((x) => x.id === id); const u = m && !m.off && m.cap > 0 ? utilization(m.cap, m.eff) * 100 : 0; return `<div class="bar"><span>V${v.n}</span><div class="trk"><i style="width:${u}%;background:${k ? '#E8871E' : '#1C7293'}"></i></div><span>${m ? (m.off || m.cap <= 0 ? 'desligada' : fmt(u) + '%') : '—'}</span></div>`; }).join('')}</div>`).join('');
  return `
<h2>${n}. Comparação de versões: V${a.n} × V${b.n}</h2>
<h3>Versões guardadas</h3>
<table><thead><tr><th>Versão</th><th>O que é</th><th class="n">Produção/h</th><th class="n">Risco</th><th class="n">Energia (kW)</th><th>Gargalo</th></tr></thead><tbody>${versions.map((v) => `<tr><td><b>V${v.n}</b></td><td>${esc(v.label)}<br/><span class="sub">${esc(v.at)}${v.played ? ` · Play: ${fmt(v.played.produced)} garrafas em ${v.played.durMin >= 60 ? v.played.durMin / 60 + ' h' : v.played.durMin + ' min'}` : ''}</span></td><td class="n">${fmt(v.prod)}</td><td class="n">${fmt(v.risk * 100, 1)}%</td><td class="n">${fmt(v.energy, 1)}</td><td>${esc(v.bottleneck ?? '—')}</td></tr>`).join('')}</tbody></table>
<h3>V${a.n} (${esc(a.label)}) comparada com V${b.n} (${esc(b.label)})</h3>
<table><thead><tr><th></th><th class="n">V${a.n}</th><th class="n">V${b.n}</th><th class="n">Mudou</th></tr></thead><tbody>
<tr><td>Produção (garrafas/h)</td><td class="n">${fmt(a.prod)}</td><td class="n"><b>${fmt(b.prod)}</b></td><td class="n">${d(a.prod, b.prod)}</td></tr>
<tr><td>Risco máximo (%)</td><td class="n">${fmt(a.risk * 100, 1)}</td><td class="n"><b>${fmt(b.risk * 100, 1)}</b></td><td class="n">${d(a.risk * 100, b.risk * 100, 1, true)}</td></tr>
<tr><td>Energia (kW)</td><td class="n">${fmt(a.energy, 1)}</td><td class="n"><b>${fmt(b.energy, 1)}</b></td><td class="n">${d(a.energy, b.energy, 1, true)}</td></tr>
${a.costPerBottle != null && b.costPerBottle != null ? `<tr><td>Energia por garrafa (R$)</td><td class="n">${fmt(a.costPerBottle, 4)}</td><td class="n"><b>${fmt(b.costPerBottle, 4)}</b></td><td class="n">${d(a.costPerBottle, b.costPerBottle, 4, true)}</td></tr>` : ''}
<tr><td>Gargalo</td><td class="n">${esc(a.bottleneck ?? '—')}</td><td class="n"><b>${esc(b.bottleneck ?? '—')}</b></td><td class="n">${a.bottleneck === b.bottleneck ? '—' : 'mudou'}</td></tr>
</tbody></table>
<h3>O que foi mudado de V${a.n} para V${b.n}</h3>
${changes.length ? `<ul>${changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<div class="sub">Nenhuma máquina foi mudada (a diferença vem de outras condições, como temperatura ou desgaste).</div>'}
<h3>Máquina por máquina</h3>
<table><thead><tr><th>Máquina</th><th class="n">Unidades</th><th class="n">Ritmo</th><th class="n">Uso da capacidade</th></tr></thead><tbody>${ids.map((id) => { const x = ma(id), y = mb(id); return `<tr><td>${esc(names(id))}</td><td class="n">${x ? x.qty : '—'} → <b>${y ? y.qty : '—'}</b></td><td class="n">${x ? fv(x.value) : '—'} → <b>${y ? fv(y.value) : '—'}</b></td><td class="n">${ut(x)} → <b>${ut(y)}</b></td></tr>`; }).join('')}</tbody></table>
<div class="grid2">${box(`Uso das máquinas: V${a.n} (azul) × V${b.n} (laranja)`, 'Quanto da capacidade de cada máquina é usado em cada versão.', uvRows)}
<div>
${box('Valor estimado dos equipamentos', 'Soma das unidades × preço estimado. Faixas de anúncios de fornecedores, nunca cotação.',
    `<table><thead><tr><th>Máquina</th><th class="n">Unid.</th><th>Valor V${a.n}</th><th>Valor V${b.n}</th><th>Diferença</th></tr></thead><tbody>${cmp.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${r.qtyA ?? '—'} → ${r.qtyB ?? '—'}</td><td>${r.priced ? esc(moneyRange(r.a)) : 'consultar fabricante'}</td><td>${r.priced ? esc(moneyRange(r.b)) : 'consultar fabricante'}</td><td>${r.priced ? esc(moneyDelta(r.delta)) : '—'}</td></tr>`).join('')}<tr><td><b>Total</b></td><td></td><td><b>${esc(moneyRange(cmp.totalA))}</b></td><td><b>${esc(moneyRange(cmp.totalB))}</b></td><td><b>${esc(moneyDelta(cmp.delta))}</b></td></tr></tbody></table>
     ${cmp.perThousand != null ? `<div class="note">Investimento adicional ≈ <b>R$ ${fmt(Math.round(cmp.perThousand / 1000))} mil por cada 1.000 garrafas/h</b> a mais de produção (ponto médio da faixa).</div>` : ''}
     ${cmp.unpriced.length ? `<div class="sub">Sem preço no catálogo (não entram na soma): ${esc(cmp.unpriced.join(', '))}.</div>` : ''}`)}
</div></div>`;
}

/** A página inteira, pronta para imprimir. */
export function buildReportHtml(i: ExportInput): string {
  const titulo = i.kind === 'relatorio' ? 'Relatório da fábrica' : i.kind === 'comparacao' ? 'Comparação de versões' : 'Relatório e comparação';
  let body = '';
  if (i.kind !== 'comparacao') body += reportSection(i);
  if (i.kind !== 'relatorio') body += `<div class="${i.kind === 'ambos' ? 'pb' : ''}">${compareSection(i, i.kind === 'ambos' ? 2 : 1)}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} - ${esc(i.factory)}</title><style>${CSS}</style></head><body>
<div class="head"><h1>${esc(titulo)}</h1><div class="sub"><b>${esc(i.factory)}</b> · gerado em ${esc(i.generatedAt)} · temperatura ambiente ${i.ambient} °C · energia R$ ${fmt(i.tariff, 2)}/kWh · Digital Twin Industrial</div></div>
${body}
<div class="foot">Números calculados pelo simulador do Digital Twin Industrial (projeto acadêmico, FATEC Cotia). Temperatura, desgaste e valores de equipamentos são hipóteses didáticas e estimativas, não medições nem cotações.</div>
</body></html>`;
}

/** Abre a janela de impressão do navegador com a página pronta (nela, escolha “Salvar como PDF”). */
export function printHtml(html: string): void {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60_000); }, 300);
}

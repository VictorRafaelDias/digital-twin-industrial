/* Aba "Dash": gráficos simples da fábrica inteira (e de cada máquina), que acompanham a simulação enquanto ela roda.
   Os números vêm do mesmo motor das outras telas; a temperatura da máquina e o desgaste são hipóteses didáticas. */
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import { ChartBox, COLORS, Donut, Gauge, HBars, Legend, LineChart } from './Charts';
import { useChartData } from './hooks';
import { UtilBars, VersionsPanel } from './Versions';

export function DashTab() {
  const nodes = useStore((s) => s.nodes);
  const tariff = useStore((s) => s.tariff);
  const ambient = useStore((s) => s.ambient);
  const run = useStore((s) => s.run);
  const server = useStore((s) => s.server);
  const sims = useStore((s) => s.serverSims);
  const dashFull = useStore((s) => s.dashFull);
  const setDashFull = useStore((s) => s.setDashFull);
  const cd = useChartData(true);
  const { sim, best } = cd;

  if (!nodes.length) {
    return (
      <div className="sbody">
        <h3>Dash</h3>
        <p className="lead">Gráficos da fábrica inteira. Monte uma fábrica (ou carregue um exemplo) e aperte <b>Iniciar</b>: os gráficos acompanham a simulação.</p>
      </div>
    );
  }

  const { names, capRows, queueRows, riskRows, tempRows, slices, wearRows, hasWear } = cd;

  const pct = best ? (sim.production / best) * 100 : 0;
  const gaugeColor = sim.maxRisk > 0.4 ? COLORS.bad : pct >= 90 ? COLORS.ok : pct >= 60 ? COLORS.warn : COLORS.bad;
  const cost = sim.energy * tariff;
  const bn = nodes.find((n) => n.id === sim.bn);

  const series = run.series;
  const produced = series.map((p) => [p.t, p.produced] as [number, number]);
  const ideal = series.map((p) => [p.t, (best / 60) * p.t] as [number, number]);
  const rate = series.map((p) => [p.t, p.rate] as [number, number]);

  return (
    <div className={'sbody dashtab' + (dashFull ? ' full' : '')}>
      <div className="dhead">
        <h3>Dash</h3>
        <button className="btn sec" style={{ padding: '5px 12px' }} title={dashFull ? 'Voltar ao tamanho normal (Esc)' : 'Ocupar a tela toda para ver todos os gráficos de uma vez'} onClick={() => setDashFull(!dashFull)}>{dashFull ? '⤡ Reduzir' : '⤢ Ampliar'}</button>
      </div>
      <p className="lead">A fábrica inteira em gráficos. {run.active ? <b>Acompanhando a simulação ao vivo.</b> : 'Aperte Iniciar para ver a linha do tempo.'}</p>

      <ChartBox title="Como está a fábrica" what="Produção agora comparada com o máximo possível (tudo no ritmo ótimo).">
        <Gauge value={pct} color={gaugeColor} label="do máximo possível" />
        <div className="dkpis">
          <div><small>Produção</small><b>{fmt(sim.production)}/h</b></div>
          <div><small>Máximo</small><b>{fmt(best)}/h</b></div>
          <div><small>Energia</small><b>{fmt(sim.energy, 1)} kW</b><em>R$ {fmt(cost, 2)}/h</em></div>
          <div><small>Gargalo</small><b>{bn ? names[bn.id] : '—'}</b></div>
        </div>
      </ChartBox>

      <ChartBox title="Linha do tempo" what="Garrafas produzidas até agora (azul) e quanto seria o ideal (tracejado). A distância entre as duas é o que se perdeu.">
        <LineChart yLabel="garrafas" lines={[{ label: 'Produzidas', color: COLORS.teal, points: produced }, { label: 'Ideal', color: COLORS.muted, points: ideal, dashed: true }]} />
        <Legend items={[[COLORS.teal, 'Produzidas'], [COLORS.muted, 'Ideal (tracejado)']]} />
        {series.length > 1 && <><div className="what" style={{ marginTop: 8 }}>Produção por hora ao longo do tempo (sobe quando o produto chega a todas as máquinas).</div>
          <LineChart yLabel="garrafas por hora" height={110} lines={[{ label: 'Por hora', color: COLORS.ok, points: rate }]} /></>}
      </ChartBox>

      <ChartBox title="Capacidade × o que sai" what="Em garrafas por hora. Barra clara: o que a máquina conseguiria entregar. Barra colorida: o que realmente sai. Onde a colorida é bem menor, o produto trava.">
        <HBars rows={capRows} unit="/h" />
        <Legend items={[[COLORS.ok, 'normal'], [COLORS.warn, 'atenção'], [COLORS.bad, 'falha']]} />
      </ChartBox>

      <ChartBox title="Uso das máquinas" what="Quanto da capacidade de cada máquina está sendo usado. Perto de 100% é o limite; bem abaixo, está sobrando.">
        <UtilBars />
      </ChartBox>

      <ChartBox title="Versões do relatório" what="V1, V2... Compare a fábrica antes e depois de uma melhoria.">
        <VersionsPanel compact />
      </ChartBox>

      <ChartBox title="Filas" what="Excesso que uma máquina entrega e a seguinte não aguenta. Fica parado esperando (nada se perde).">
        {queueRows.some((r) => r.a >= 1) ? <HBars rows={queueRows} unit="/h" /> : <div className="nodata">Sem fila agora.</div>}
      </ChartBox>

      <ChartBox title="Quem gasta energia" what="Parte do consumo de cada máquina.">
        <Donut slices={slices} center={`${fmt(sim.energy, 1)} kW`} />
      </ChartBox>

      <ChartBox title="Risco de falha" what="Chance estimada de cada máquina parar no ritmo atual (2% no ótimo, até 100% na falha).">
        <HBars rows={riskRows} max={50} unit="%" />
      </ChartBox>

      <ChartBox title="Temperatura das máquinas" what={`Quanto cada máquina esquenta: ambiente (${ambient} °C) mais o calor do trabalho. Hipótese didática, não é medição.`}>
        <HBars rows={tempRows} max={Math.max(100, ...tempRows.map((r) => r.a))} unit=" °C" />
      </ChartBox>

      <ChartBox title="Desgaste" what="Quanto da vida útil cada máquina já gastou. Passando do intervalo de manutenção, ela rende menos e arrisca mais.">
        {hasWear ? <HBars rows={wearRows} max={100} unit="%" /> : <div className="nodata">{server ? 'Guarde a fábrica no servidor (Arquivo) para acompanhar o desgaste das máquinas.' : 'O desgaste fica guardado no servidor: entre com o servidor para usar.'}</div>}
      </ChartBox>

      {server && sims.length > 0 && (
        <ChartBox title="Simulações guardadas" what="Resultados finais de cada vez que você rodou o Play nesta fábrica.">
          <table className="t"><thead><tr><th>Quando</th><th>Duração</th><th>Produzidas</th><th>% do máx.</th></tr></thead><tbody>
            {sims.slice(0, 6).map((x) => <tr key={x.id}><td>{new Date(x.started_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>{x.duration_min >= 60 ? x.duration_min / 60 + ' h' : x.duration_min + ' min'}{x.finished ? '' : ' (parada)'}</td><td>{fmt(x.produced)}</td><td>{fmt(x.pct_of_best)}%</td></tr>)}
          </tbody></table>
        </ChartBox>
      )}
    </div>
  );
}

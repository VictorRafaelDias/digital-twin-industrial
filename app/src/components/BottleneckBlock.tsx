import { moneyRange } from '../engine/cost';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { Rich } from './Rich';
import { PlanResult, gainTxt } from './Shared';
import { useBottleneck } from './hooks';

/** Resultados › Avisos: só o diagnóstico. Qual máquina limita a fábrica e por quê. (As ações ficam logo abaixo, no 2º bloco do relatório: ver ImproveBlock.) */
export function BottleneckBlock() {
  const rep = useBottleneck();
  const s = useStore();
  if (!rep) return null;
  return (
    <>
      <div className="bnhead"><Icon name="alert" size={20} />
        <div style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Gargalo: {rep.name}</b><div className="sub" style={{ margin: 0 }}>Ela limita a fábrica a {fmt(rep.prod)} garrafas/h.</div></div>
        <button className="btn" onClick={s.exploreBottleneck}>Explorar no chat ›</button>
      </div>
      <div><h5>Por que isso acontece</h5><ul className="why">{rep.why.map((x, i) => <li key={i}><Rich text={x} terms /></li>)}</ul></div>
      <div className="sub" style={{ marginTop: 8 }}>O que fazer a respeito está logo abaixo, em <a onClick={() => document.getElementById('como-melhorar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><b>Como melhorar</b></a>.</div>
    </>
  );
}

/** 2º bloco do relatório, logo depois de Avisos: as melhorias sugeridas, cada uma com "Aplicar no quadro". Aplicar leva ao quadro, onde a mudança fica em destaque até rodar a simulação. */
export function ImproveBlock() {
  const rep = useBottleneck();
  const s = useStore();
  if (!rep) return null;
  return (
    <div className="card c12 improve" id="como-melhorar">
      <h4>Como melhorar</h4>
      <div className="sub" style={{ marginTop: 0 }}>
        Escolha uma opção e clique em <b>Aplicar no quadro</b>. A mudança aparece <b>em destaque</b> no quadro; depois é só rodar a simulação para gerar a V2 e comparar com a V1 em <b>Comparações</b>.
      </div>
      {rep.options.length ? (
        <>
          <table className="t"><thead><tr><th>Opção</th><th>Produção</th><th>Risco</th><th>Custo estimado</th><th /></tr></thead><tbody>
            {rep.options.map((o) => (
              <tr key={o.key}>
                <td><b>{o.title}</b><div className="sub" style={{ margin: 0 }}><Rich text={o.detail} terms />{o.next && ` Depois, o gargalo passa a ser: ${o.next}.`}</div></td>
                <td>{fmt(rep.prod)} → <b>{fmt(o.prod)}</b><br /><b>{gainTxt(o.gain)}</b></td>
                <td>{fmt(o.risk * 100, 1)}%</td>
                <td>{o.cost ? <b>{moneyRange(o.cost)}</b> : <span style={{ color: 'var(--muted)' }}>R$ 0</span>}</td>
                <td><button className="btn" style={{ padding: '7px 12px' }} onClick={() => s.applyChange(o.change)}>Aplicar no quadro</button></td>
              </tr>
            ))}
          </tbody></table>
          {rep.hasCost && <div className="sub">Preços: estimativas tiradas de anúncios de fornecedores (<a onClick={() => s.openSettings('precos')}>ver de onde vêm</a>). Para comprar, peça cotação.</div>}
        </>
      ) : <p>Não há ajuste simples que aumente a produção: a máquina já está no limite. O caminho é um <b>modelo de maior capacidade</b> (consulte o fabricante) ou uma segunda linha.</p>}
      <PlanCalculator />
    </div>
  );
}

/** Opcional, recolhido no fim do cartão: "quero produzir X% a mais" calcula todas as mudanças em cascata. Fica recolhido para não competir com as melhorias acima. */
function PlanCalculator() {
  const s = useStore();
  const w = s.whatIf;
  return (
    <details className="planbox" open={!!w.plan}>
      <summary>Avançado: calcular um plano completo (todas as máquinas de uma vez)</summary>
      <div className="sub">Use só se quiser uma meta de produção: o sistema calcula tudo o que precisa mudar, máquina por máquina, em cascata. Depois você escolhe se aplica.</div>
      <div className="wfrow">
        <span>Quero produzir</span>
        <input type="number" value={w.pct} style={{ width: 80 }} onChange={(e) => s.setWhatIf({ pct: Math.max(1, parseFloat(e.target.value) || 10), plan: null })} />
        <span>% a mais</span>
        <label className="chk" style={{ padding: 0 }}><input type="checkbox" checked={w.over} onChange={(e) => s.setWhatIf({ over: e.target.checked, plan: null })} /><span>aceitar a zona de atenção</span></label>
        <button className="btn sec" onClick={s.planWhatIf}>Calcular o plano completo</button>
      </div>
      {w.plan && <PlanResult plan={w.plan} onApply={() => s.applyPlan(w.plan!)} onDrop={() => s.setWhatIf({ plan: null })} />}
    </details>
  );
}

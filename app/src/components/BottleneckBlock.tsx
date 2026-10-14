import { moneyRange } from '../engine/cost';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { Rich } from './Rich';
import { PlanResult, gainTxt } from './Shared';
import { useBottleneck } from './hooks';

/** Dentro de Resultados › Avisos: por que existe o gargalo, como melhorar (com custo) e "simular uma melhoria". */
export function BottleneckBlock() {
  const rep = useBottleneck();
  const s = useStore();
  if (!rep) return null;
  const w = s.whatIf, res = w.res;

  return (
    <>
      <div className="bnhead"><Icon name="alert" size={20} />
        <div style={{ flex: 1 }}><b style={{ fontSize: 15 }}>Gargalo: {rep.name}</b><div className="sub" style={{ margin: 0 }}>Ela limita a fábrica a {fmt(rep.prod)} garrafas/h.</div></div>
        <button className="btn" onClick={s.exploreBottleneck}>Explorar no chat ›</button>
      </div>
      <div className="bncols">
        <div><h5>Por que isso acontece</h5><ul className="why">{rep.why.map((x, i) => <li key={i}><Rich text={x} terms /></li>)}</ul></div>
        <div>
          <h5>Como melhorar</h5>
          {rep.options.length ? (
            <>
              <table className="t"><thead><tr><th>Opção</th><th>Produção</th><th>Risco</th><th>Custo estimado</th><th /></tr></thead><tbody>
                {rep.options.map((o) => (
                  <tr key={o.key}>
                    <td><b>{o.title}</b><div className="sub" style={{ margin: 0 }}><Rich text={o.detail} terms />{o.next && ` Depois, o gargalo passa a ser: ${o.next}.`}</div></td>
                    <td>{fmt(rep.prod)} → <b>{fmt(o.prod)}</b><br /><b>{gainTxt(o.gain)}</b></td>
                    <td>{fmt(o.risk * 100, 1)}%</td>
                    <td>{o.cost ? <b>{moneyRange(o.cost)}</b> : <span style={{ color: 'var(--muted)' }}>R$ 0</span>}</td>
                    <td><button className="btn sec" style={{ padding: '5px 10px' }} onClick={() => s.applyChange(o.change)}>Aplicar</button></td>
                  </tr>
                ))}
              </tbody></table>
              {rep.hasCost && <div className="sub">Preços: estimativas tiradas de anúncios de fornecedores (<a onClick={() => s.openSettings('precos')}>ver de onde vêm</a>). Para comprar, peça cotação.</div>}
            </>
          ) : <p>Não há ajuste simples que aumente a produção: a máquina já está no limite. O caminho é um <b>modelo de maior capacidade</b> (consulte o fabricante) ou uma segunda linha.</p>}
        </div>
      </div>

      <div className="whatif">
        <h5>Simular uma melhoria</h5>
        <div className="wfrow">
          <span>E se eu colocar</span>
          <div className="stepper">
            <button onClick={() => s.setWhatIf({ n: Math.max(1, w.n - 1), res: null })}>−</button>
            <input type="number" min={1} max={5} value={w.n} onChange={(e) => s.setWhatIf({ n: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)), res: null })} />
            <button onClick={() => s.setWhatIf({ n: Math.min(5, w.n + 1), res: null })}>+</button>
          </div>
          <span>máquina(s) a mais na <b>{rep.name}</b>?</span>
          <button className="btn" onClick={s.simulateWhatIf}>Simular</button>
        </div>
        {res && (
          <div className={'gres ' + (res.enough ? 'ok' : 'warn')}>
            <div className="gh2">Com {res.n} máquina(s) a mais na {res.name}: {fmt(res.before)} → {fmt(res.after)} garrafas/h ({(res.after - res.before) >= 0 ? '+' : ''}{fmt(((res.after - res.before) / Math.max(1, res.before)) * 100, 1)}%)</div>
            <div>Risco máximo <b>{fmt(res.risk * 100, 1)}%</b> · custo estimado <b>{moneyRange(res.cost)}</b></div>
            {res.enough
              ? <div className="gnote" style={{ color: 'var(--ok)' }}>Resolveu: nenhuma outra máquina passou a limitar a fábrica.</div>
              : <div className="gnote">Só isso <b>não basta</b>: a {res.name} passaria a entregar <b>{fmt(res.capNew)}</b>/h, mas a fábrica fica em <b>{fmt(res.after)}</b>/h porque agora o gargalo é a <b>{res.next}</b>. Para aproveitar de verdade, este é o plano completo, em cascata:</div>}
            {res.plan && <PlanResult plan={res.plan} onApply={() => s.applyPlan(res.plan!)} onDrop={() => s.setWhatIf({ res: null })} />}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn sec" onClick={s.applyWhatIfOnly}>Aplicar só esta mudança</button>
            </div>
          </div>
        )}
        <div className="wfrow" style={{ marginTop: 14 }}>
          <span>Ou: quero produzir</span>
          <input type="number" value={w.pct} style={{ width: 80 }} onChange={(e) => s.setWhatIf({ pct: Math.max(1, parseFloat(e.target.value) || 10), plan: null })} />
          <span>% a mais e saber <b>tudo</b> o que precisa mudar</span>
          <label className="chk" style={{ padding: 0 }}><input type="checkbox" checked={w.over} onChange={(e) => s.setWhatIf({ over: e.target.checked, plan: null })} /><span>aceitar a zona de atenção</span></label>
          <button className="btn" onClick={s.planWhatIf}>Calcular o plano completo</button>
        </div>
        {w.plan && <PlanResult plan={w.plan} onApply={() => s.applyPlan(w.plan!)} onDrop={() => s.setWhatIf({ plan: null })} />}
      </div>
    </>
  );
}

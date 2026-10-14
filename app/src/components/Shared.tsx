/* Pedaços de tela usados em mais de um lugar. */
import type { ReactNode } from 'react';
import { moneyRange } from '../engine/cost';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';
import type { BnReport, MachineType, Plan, Ref, WhatIfResult } from '../types';
import { Rich } from './Rich';

export const Chip = ({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) => <span className={'chip ' + kind}>{children}</span>;

export function Cites({ refs }: { refs?: Ref[] }) {
  if (!refs?.length) return null;
  return <div>{refs.map((r) => <a key={r.u} className="cite" href={r.u} target="_blank" rel="noopener noreferrer">{r.t}</a>)}</div>;
}

/** "De onde vêm os números": hipótese didática com a nota de base + fontes reais com link. */
export function Refs({ t, id }: { t: MachineType; id: string }) {
  const energyReal = ['enchedora', 'rotuladora'].includes(id);
  return (
    <>
      <div><Chip kind="warn">hipótese didática</Chip>{energyReal && <> <Chip kind="ok">energia a partir de dado real</Chip></>}</div>
      <div style={{ margin: '6px 0', color: 'var(--muted)' }}>{t.basis}</div>
      {t.refs.length > 0 && <div>{t.refs.map((r) => (
        <div key={r.u} style={{ padding: '2px 0' }}><a href={r.u} target="_blank" rel="noopener noreferrer">{r.t}</a> <Chip kind={r.k === 'real' ? 'ok' : 'info'}>{r.k}</Chip></div>
      ))}</div>}
    </>
  );
}

/** Preço estimado de 1 unidade, com a nota e os links de onde veio. */
export function CostInfo({ t }: { t: MachineType }) {
  const c = t.cost;
  if (!c) return <Chip kind="warn">sem estimativa</Chip>;
  return (
    <>
      <div><b>{moneyRange(c)}</b> por unidade <Chip kind={c.edited ? 'ok' : 'info'}>{c.edited ? 'ajustado por você' : 'estimado'}</Chip></div>
      <div style={{ margin: '6px 0', color: 'var(--muted)' }}>{c.note}</div>
      {c.refs.length ? c.refs.map((r) => <div key={r.u} style={{ padding: '2px 0' }}><a href={r.u} target="_blank" rel="noopener noreferrer">{r.t}</a></div>)
        : <div style={{ color: 'var(--muted)' }}>Não achei preço confiável na internet: é uma estimativa por analogia com máquinas parecidas.</div>}
    </>
  );
}

/** Resultado de um plano (objetivo, "e se..." ou cascata): antes/depois, investimento e passos com o porquê. */
export function PlanResult({ plan, onApply, onDrop }: { plan: Plan; onApply: () => void; onDrop: () => void }) {
  const openGlossary = useStore((s) => s.openGlossary);
  const openSettings = useStore((s) => s.openSettings);
  const r = plan;
  const head = r.g.type === 'risk' ? 'Para reduzir o risco' : r.ok ? 'Dá para chegar lá' : 'Não dá só com isso';
  return (
    <>
      <div className={'gres ' + (r.ok ? 'ok' : 'warn')}>
        <div className="gh2">{r.ok ? '✔' : '!'} {head}</div>
        {r.g.type !== 'risk' && <div>Meta: de <b>{fmt(r.before.prod)}</b> para <b>{fmt(r.target)}</b> garrafas/h</div>}
        <div className="gba">
          <div><small>Produção</small><b>{fmt(r.before.prod)} → {fmt(r.after.prod)}</b></div>
          <div><small>Risco máximo</small><b>{fmt(r.before.risk * 100, 1)}% → {fmt(r.after.risk * 100, 1)}%</b></div>
          {r.invest.max > 0 && (
            <div style={{ gridColumn: 'span 2' }}><small>Investimento estimado (máquinas a mais)</small><b>{moneyRange(r.invest)}</b>{' '}
              <a className="qm" title="De onde vêm os preços" onClick={() => openSettings('precos')}>?</a></div>
          )}
        </div>
        {r.note && <div className="gnote"><Rich text={r.note} /></div>}
      </div>
      {r.steps.length > 0 && <h4 className="gsub">O que fazer</h4>}
      <ol className="steps">
        {r.steps.map((s, i) => (
          <li key={i}><div className="b">{i + 1}</div>
            <div>
              <div className="what"><Rich text={s.what} terms />
                {s.cost && <> <Chip kind="info">+ {moneyRange(s.cost)}</Chip></>}
                {s.risk !== undefined && <> <Chip kind={s.opt ? 'ok' : 'warn'}>{s.opt ? 'dentro do ótimo' : 'risco ' + fmt(s.risk * 100, 1) + '%'}</Chip></>}
              </div>
              <div className="why"><b>Por quê:</b> <Rich text={s.why} terms /></div>
            </div></li>
        ))}
      </ol>
      <div className="gloss-hint">Palavras sublinhadas têm explicação: passe o mouse ou clique. Mais no <a onClick={() => openGlossary()}>Glossário</a>.</div>
      <div className="row"><button className="btn amber" style={{ flex: 1, padding: 11 }} onClick={onApply}>Aplicar na fábrica</button><button className="btn sec" onClick={onDrop}>Descartar</button></div>
    </>
  );
}

const gainTxt = (g: number) => `+${fmt(g, g < 10 ? 1 : 0)}%`;

/** Por que existe o gargalo e como melhorar (versão compacta usada na Conversa). */
export function BottleneckChat({ rep }: { rep: BnReport | null }) {
  const applyChange = useStore((s) => s.applyChange);
  if (!rep) return <>Monte uma fábrica primeiro para eu apontar o gargalo.</>;
  return (
    <>
      O gargalo é a <b>{rep.name}</b>: limita a fábrica a <b>{fmt(rep.prod)}</b> garrafas/h.
      <ul className="why">{rep.why.map((w, i) => <li key={i}><Rich text={w} terms /></li>)}</ul>
      {rep.options.length ? (
        <>
          <div><b>O que eu faria:</b></div>
          <ol className="steps">{rep.options.map((o, i) => (
            <li key={o.key}><div className="b">{i + 1}</div>
              <div><b>{o.title}</b>: produção {fmt(rep.prod)} → <b>{fmt(o.prod)}</b> (<b>{gainTxt(o.gain)}</b>), risco {fmt(o.risk * 100, 1)}%, custo estimado <b>{o.cost ? moneyRange(o.cost) : 'R$ 0'}</b>.
                {o.next && ` Depois, o gargalo passa a ser: ${o.next}.`}
                <div><button className="btn sec" style={{ padding: '3px 10px', marginTop: 4 }} onClick={() => applyChange(o.change)}>Aplicar</button></div></div></li>
          ))}</ol>
          {rep.hasCost && <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>Preços: estimativas de anúncios de fornecedores, não cotação. Veja em Configurações › Preços.</div>}
        </>
      ) : <div>Não há ajuste simples: a máquina já está no limite. O caminho é um modelo de maior capacidade (consulte o fabricante) ou uma segunda linha.</div>}
    </>
  );
}

export { gainTxt };
export type { WhatIfResult };

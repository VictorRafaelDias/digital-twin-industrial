import { useStore } from '../store/useStore';
import { Rich } from './Rich';

/** Guia rápido: 5 passos que se marcam sozinhos conforme o usuário avança. */
export function GuideChecklist() {
  const nodes = useStore((s) => s.nodes.length);
  const edges = useStore((s) => s.edges.length);
  const guide = useStore((s) => s.guide);
  const setGuide = useStore((s) => s.setGuide);
  const loadTemplate = useStore((s) => s.loadTemplate);
  if (!guide.open) return null;

  const steps: [string, boolean][] = [
    ['Arraste máquinas da lista (embaixo) para o quadro.', nodes >= 2],
    ['Ligue uma máquina na outra com a ferramenta <b>Conectar</b>.', edges >= 1],
    ['Clique numa máquina e mude o <b>ritmo</b> dela. Veja o que acontece.', guide.changed],
    ['Na aba <b>Objetivo</b>, diga o que você quer (ex.: +10% de produção).', guide.goal],
    ['Na aba <b>Conversa</b>, pergunte ao assistente onde está o gargalo.', guide.chat],
  ];
  const done = steps.filter((x) => x[1]).length;

  return (
    <div className="guide">
      <div className="gh" style={{ cursor: 'pointer' }} onClick={() => setGuide({ min: !guide.min })}>
        <span style={{ flex: 1 }}>Guia rápido · {done}/5</span>
        <button title={guide.min ? 'Abrir' : 'Minimizar'}>{guide.min ? '▴' : '▾'}</button>
        <button title="Fechar" onClick={(e) => { e.stopPropagation(); setGuide({ open: false }); }}>×</button>
      </div>
      {!guide.min && (
        <>
          <ol>{steps.map(([t, d], i) => (
            <li key={i} className={d ? 'done' : ''}><div className="n">{d ? '✓' : i + 1}</div><span><Rich text={t} /></span></li>
          ))}</ol>
          <div className="gf">{done === 5 ? <><b>Pronto!</b> Você já usou tudo o que o protótipo tem.</> : <>Sem tempo? <a onClick={() => loadTemplate('bebidas')}>Carregue um exemplo pronto</a>.</>}</div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Rich } from './Rich';

interface Step { text: string; done: boolean; go?: [string, () => void] }

/** Guia rápido: passos que se marcam sozinhos conforme o usuário avança. Conectado ao servidor, ganha uma segunda aba só com o passo a passo do servidor. */
export function GuideChecklist() {
  const nodes = useStore((s) => s.nodes.length);
  const edges = useStore((s) => s.edges.length);
  const guide = useStore((s) => s.guide);
  const setGuide = useStore((s) => s.setGuide);
  const loadTemplate = useStore((s) => s.loadTemplate);
  const server = useStore((s) => s.server);
  const factoryId = useStore((s) => s.serverFactoryId);
  const sims = useStore((s) => s.serverSims.length);
  const wearUsed = useStore((s) => Object.values(s.wear).some((w) => w.operating_hours > 0));
  const imported = useStore((s) => Object.values(s.catalog).some((t) => t.origin === 'importada'));
  const [aba, setAba] = useState<'montar' | 'servidor'>('montar');
  const [visited, setVisited] = useState<string[]>([]);
  if (!guide.open) return null;

  const visit = (k: string, run: () => void) => () => { setVisited((v) => (v.includes(k) ? v : [...v, k])); run(); };
  const { setView, openModal, openSettings } = useStore.getState();

  const montar: Step[] = [
    { text: 'Arraste máquinas da lista (embaixo) para o quadro.', done: nodes >= 2 },
    { text: 'Ligue uma máquina na outra com a ferramenta <b>Conectar</b>.', done: edges >= 1 },
    { text: 'Clique numa máquina e mude o <b>ritmo</b> dela. Veja o que acontece.', done: guide.changed },
    { text: 'Na aba <b>Objetivo</b>, diga o que você quer (ex.: +10% de produção).', done: guide.goal },
    { text: 'Na aba <b>Conversa</b>, pergunte ao assistente onde está o gargalo.', done: guide.chat },
  ];
  const servidor: Step[] = [
    { text: 'Você está <b>conectado ao servidor</b>: o que você faz fica guardado no banco de dados, não só neste navegador.', done: !!server },
    { text: 'Guarde a fábrica: <b>Arquivo › Guardar no servidor</b>. Ela fica na sua conta e abre em qualquer computador.', done: factoryId != null, go: ['Minhas fábricas', visit('fab', () => openModal('factories'))] },
    { text: 'Aperte <b>▶ Play</b>. Ao terminar, o resultado é guardado no servidor (e o Play gasta as máquinas).', done: sims > 0 },
    { text: 'Abra <b>Resultados</b> (F4): gráficos da simulação, temperatura das máquinas e histórico.', done: visited.includes('res'), go: ['Abrir Resultados', visit('res', () => setView('dashboard'))] },
    { text: 'Veja o <b>desgaste</b>: clique numa máquina, use <b>+ horas de uso</b> e depois <b>Manutenção</b> para recuperar.', done: wearUsed },
    { text: 'Importe uma <b>ficha técnica</b> (PDF) de uma máquina real: o servidor lê o documento e cria a máquina no catálogo.', done: imported, go: ['Dados reais', visit('dados', () => openSettings('dados'))] },
    { text: 'Cadastre quem mais vai usar o servidor em <b>Configurações › Usuários</b>.', done: visited.includes('usu'), go: ['Usuários', visit('usu', () => openSettings('usuarios'))] },
  ];

  const steps = aba === 'servidor' && server ? servidor : montar;
  const done = steps.filter((x) => x.done).length;

  return (
    <div className="guide">
      <div className="gh" style={{ cursor: 'pointer' }} onClick={() => setGuide({ min: !guide.min })}>
        <span style={{ flex: 1 }}>Guia rápido · {done}/{steps.length}</span>
        <button title={guide.min ? 'Abrir' : 'Minimizar'}>{guide.min ? '▴' : '▾'}</button>
        <button title="Fechar" onClick={(e) => { e.stopPropagation(); setGuide({ open: false }); }}>×</button>
      </div>
      {!guide.min && (
        <>
          {server && (
            <div className="gtabs">
              <button className={aba === 'montar' ? 'active' : ''} onClick={() => setAba('montar')}>Montar a fábrica</button>
              <button className={aba === 'servidor' ? 'active' : ''} onClick={() => setAba('servidor')}>No servidor</button>
            </div>
          )}
          <ol>{steps.map((s, i) => (
            <li key={i} className={s.done ? 'done' : ''}>
              <div className="n">{s.done ? '✓' : i + 1}</div>
              <span><Rich text={s.text} />{s.go && <> <a className="golink" onClick={s.go[1]}>{s.go[0]} ›</a></>}</span>
            </li>
          ))}</ol>
          <div className="gf">{done === steps.length ? <><b>Pronto!</b> Você já passou por todos os passos desta aba.</> : aba === 'montar' || !server ? <>Sem tempo? <a onClick={() => loadTemplate('bebidas')}>Carregue um exemplo pronto</a>.</> : <>Os passos se marcam sozinhos conforme você usa o servidor.</>}</div>
        </>
      )}
    </div>
  );
}

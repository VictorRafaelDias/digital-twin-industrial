import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Modal } from './Modal';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "Minhas fábricas": as fábricas guardadas no servidor (abrir, apagar, guardar a atual como nova). */
export function FactoriesModal({ onClose }: { onClose: () => void }) {
  const list = useStore((s) => s.serverFactories);
  const busy = useStore((s) => s.serverBusy);
  const current = useStore((s) => s.serverFactoryId);
  const name = useStore((s) => s.plantName);
  const { listServerFactories, openServerFactory, deleteServerFactory, saveServerFactory } = useStore.getState();
  useEffect(() => { listServerFactories().catch(() => useStore.getState().showToast('Não consegui listar as fábricas do servidor')); }, [listServerFactories]);

  return (
    <Modal title="Minhas fábricas (servidor)" wide onClose={onClose}>
      <div className="mb">
        <p className="d">Fábricas guardadas no servidor com a sua conta. Cada máquina guarda o próprio <b>desgaste</b> e o histórico de manutenção.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" disabled={busy} onClick={() => saveServerFactory().then(() => listServerFactories())}>
            {current == null ? `Guardar “${name}” no servidor` : `Guardar as mudanças de “${name}”`}
          </button>
          {current != null && <button className="btn sec" disabled={busy} onClick={() => saveServerFactory({ asNew: true }).then(() => listServerFactories())}>Guardar como uma cópia nova</button>}
        </div>
        <table className="t"><thead><tr><th>Fábrica</th><th>Máquinas</th><th>Atualizada</th><th /></tr></thead><tbody>
          {list.map((f) => (
            <tr key={f.id}>
              <td><b>{f.name}</b>{f.id === current ? <span className="chip ok" style={{ marginLeft: 6 }}>aberta</span> : null}{f.example ? <small style={{ color: 'var(--muted)' }}> (exemplo: {f.example})</small> : null}</td>
              <td style={{ textAlign: 'center' }}>{f.machine_count}</td>
              <td>{when(f.updated_at)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn sec" disabled={busy} onClick={() => openServerFactory(f.id)}>Abrir</button>{' '}
                <button className="btn danger" disabled={busy} onClick={() => { if (window.confirm(`Apagar a fábrica “${f.name}” do servidor? Isso apaga também as simulações, os planos e os cenários dela.`)) deleteServerFactory(f.id); }}>Apagar</button>
              </td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>Nenhuma fábrica guardada ainda.</td></tr>}
        </tbody></table>
      </div>
    </Modal>
  );
}

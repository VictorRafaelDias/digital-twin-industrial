/* Configurações › Dados reais: anexar a ficha técnica de uma máquina. O servidor lê o documento POR REGRAS (sem IA e sem custo),
   o usuário confere e edita, o sistema compara com as máquinas que já existem (lado a lado) e o usuário decide:
   atualizar a existente, salvar como nova versão ou criar uma máquina nova. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Chip } from '../components/Shared';
import { fmt } from '../engine/format';
import { useStore } from '../store/useStore';

interface Field { value: unknown; confidence: 'extraido' | 'sugerido' | 'padrao'; source_text: string | null; page: number | null; note: string | null }
interface Compare { field: string; label: string; existing: unknown; new: unknown; different: boolean }
interface Match { code: string; name: string; version: number; origin: string; reason: string; score: number; comparison: Compare[]; differences: number }
interface Draft {
  name: string | null; maker: string | null; model: string | null; year: number | null; category: string | null; capacity_nominal_per_hour: number | null;
  power_kw: number | null; limits: { min: number; optimal: number; warning: number; failure: number; max: number }; standby_kw: number; variable_kw: number;
  description: string; basis: string; stage: string | null; problems: string[];
}
interface Doc {
  id: number; file_name: string; pages: number | null; status: string; fields: Record<string, Field>; warnings: string[]; draft: Draft;
  matches: Match[]; can_create_new: boolean; text_preview: string;
}
interface DocRow { id: number; file_name: string; status: string; uploaded_at: string; machine_id: number | null }

const CATS: [string, string][] = [['insumos', 'Insumos'], ['preparo', 'Preparo'], ['termico', 'Térmico e gás'], ['envase', 'Envase'], ['pos', 'Pós-envase'], ['frio', 'Refrigeração']];
const conf = (c: Field['confidence']) => (c === 'extraido' ? <Chip kind="ok">lido do documento</Chip> : c === 'sugerido' ? <Chip kind="info">sugerido</Chip> : <Chip kind="warn">não achei</Chip>);
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? fmt(v, v % 1 ? 1 : 0) : String(v));

export function RealData() {
  const server = useStore((s) => s.server);
  const catalog = useStore((s) => s.catalog);
  const { syncCatalog, showToast } = useStore.getState();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [ed, setEd] = useState<Record<string, string>>({});
  const [bottle, setBottle] = useState('0.5');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [docs, setDocs] = useState<DocRow[]>([]);
  const imported = Object.entries(catalog).filter(([, t]) => t.origin === 'importada');

  const call = <T,>(path: string, init: RequestInit & { json?: unknown } = {}) => api<T>(server!, path, init);
  const loadDocs = () => { if (server) call<DocRow[]>('/catalog/imports').then(setDocs).catch(() => undefined); };
  useEffect(loadDocs, [server]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!server) {
    return (
      <>
        <h3>Dados reais</h3>
        <p className="d">Anexe a <b>ficha técnica</b> (PDF) de uma máquina e o sistema aprende sobre ela: lê o documento, preenche as características e cria a máquina no catálogo, sem você digitar o texto.</p>
        <div className="say warn">Isto usa o servidor (back-end). Saia e entre de novo marcando <b>“Usar o servidor”</b> na tela de login.</div>
        <h4 className="gsub">Fontes de dados ao vivo (futuro)</h4>
        {['Simulador interno (ativo)', 'Máquina moderna — leitura direta (OPC UA)', 'Máquina antiga — sensores externos (MQTT)', 'Arquivo CSV com histórico'].map((l, i) => (
          <label key={l} className="chk"><input type="radio" name="fonte" defaultChecked={i === 0} readOnly /><span>{l}</span></label>
        ))}
      </>
    );
  }

  const initEd = (d: Doc) => setEd({
    name: d.draft.name ?? '', maker: d.draft.maker ?? '', model: d.draft.model ?? '', year: d.draft.year ? String(d.draft.year) : '', category: d.draft.category ?? '',
    capacity: d.draft.capacity_nominal_per_hour ? String(d.draft.capacity_nominal_per_hour) : '', power: d.draft.power_kw ? String(d.draft.power_kw) : '', description: d.draft.description ?? '',
  });
  const fieldsBody = () => {
    const f: Record<string, unknown> = {};
    if (ed.name) f.name = ed.name;
    if (ed.maker) f.maker = ed.maker;
    if (ed.model) f.model = ed.model;
    if (ed.year) f.year = parseInt(ed.year);
    if (ed.category) f.category = ed.category;
    if (ed.capacity) f.capacity_nominal_per_hour = parseFloat(ed.capacity.replace(',', '.'));
    if (ed.power) f.power_kw = parseFloat(ed.power.replace(',', '.'));
    if (ed.description) f.description = ed.description;
    return f;
  };
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr(''); setDoc(null);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('bottle_volume_l', bottle.replace(',', '.'));
      const d = await call<Doc>('/catalog/imports', { method: 'POST', body: fd });
      setDoc(d); initEd(d); loadDocs();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.detail as { document_id?: number })?.document_id) {
        const id = (e.detail as { document_id: number }).document_id;
        setErr(`${e.message} Abrindo a análise que já existe…`);
        try { const d = await call<Doc>(`/catalog/imports/${id}`); setDoc(d); initEd(d); } catch (e2) { fail(e2); }
      } else fail(e);
    } finally { setBusy(false); }
  };
  const refresh = async () => {
    if (!doc) return;
    setBusy(true); setErr('');
    try { setDoc(await call<Doc>(`/catalog/imports/${doc.id}/preview`, { method: 'POST', json: { fields: fieldsBody() } })); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const confirm = async (decision: 'create' | 'update' | 'new_version', target?: string, different = false) => {
    if (!doc) return;
    setBusy(true); setErr('');
    try {
      const r = await call<{ action: string; machine_code: string }>(`/catalog/imports/${doc.id}/confirm`, { method: 'POST', json: { decision, target_code: target ?? null, fields: fieldsBody(), confirm_different: different } });
      await syncCatalog();
      showToast(`Máquina ${r.action}: ${r.machine_code}`);
      setDoc(null); loadDocs();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const discard = async () => { if (!doc) return; try { await call(`/catalog/imports/${doc.id}`, { method: 'DELETE' }); } catch { /* ok */ } setDoc(null); loadDocs(); };
  const remove = async (code: string, name: string) => {
    if (!window.confirm(`Apagar a máquina “${name}” do catálogo? (só é possível se nenhuma fábrica usar)`)) return;
    try { await call(`/catalog/machines/${code}`, { method: 'DELETE' }); await syncCatalog(); loadDocs(); showToast('Máquina apagada'); } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  };
  const set = (k: string, v: string) => setEd((o) => ({ ...o, [k]: v }));
  const F = doc?.fields;
  const src = (k: string) => (F?.[k]?.source_text ? <details className="srcline"><summary>de onde veio{F[k].page ? ` (página ${F[k].page})` : ''}</summary><q>{F[k].source_text}</q>{F[k].note ? <div className="note">{F[k].note}</div> : null}</details> : F?.[k]?.note ? <div className="note">{F[k].note}</div> : null);

  return (
    <>
      <h3>Dados reais: anexar a ficha técnica</h3>
      <p className="d">Anexe a ficha técnica (PDF com texto, ou .txt) de uma máquina. O servidor <b>lê o documento por regras</b> (palavras-chave e padrões; sem IA e sem custo), mostra o que entendeu para você <b>conferir e editar</b>, e avisa se já existe uma máquina parecida.</p>

      {!doc && (
        <div className="importbox">
          <label className="filebtn">
            <input type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            {busy ? 'Lendo o documento…' : '📎 Escolher a ficha técnica'}
          </label>
          <label className="inl">Garrafa de referência (L) <input type="number" step="0.1" min="0.05" max="5" value={bottle} style={{ width: 70 }} onChange={(e) => setBottle(e.target.value)} />
            <small>(para converter litros/h em garrafas/h)</small></label>
        </div>
      )}
      {err && <div className="say bad" role="alert">{err}</div>}

      {doc && F && (
        <div className="importdoc">
          <div className="say"><b>{doc.file_name}</b> · {doc.pages ?? 1} página(s). Confira os campos abaixo: o que o sistema não achou fica em branco para você preencher.</div>
          {doc.warnings.map((w) => <div key={w} className="say warn">{w}</div>)}

          <table className="t fields"><thead><tr><th>Campo</th><th>Valor (editável)</th><th>Origem</th></tr></thead><tbody>
            <tr><td>Nome da máquina</td><td><input type="text" value={ed.name} onChange={(e) => set('name', e.target.value)} /></td><td>{conf(F.model.confidence)}{src('model')}</td></tr>
            <tr><td>Fabricante</td><td><input type="text" value={ed.maker} onChange={(e) => set('maker', e.target.value)} /></td><td>{conf(F.maker.confidence)}{src('maker')}</td></tr>
            <tr><td>Modelo</td><td><input type="text" value={ed.model} onChange={(e) => set('model', e.target.value)} /></td><td>{conf(F.model.confidence)}</td></tr>
            <tr><td>Ano</td><td><input type="number" value={ed.year} style={{ width: 90 }} onChange={(e) => set('year', e.target.value)} /></td><td>{conf(F.year.confidence)}{src('year')}</td></tr>
            <tr><td>Tipo de máquina</td><td><select className="in" value={ed.category} onChange={(e) => set('category', e.target.value)}><option value="">— escolha —</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td>{conf(F.category.confidence)}{F.category.note ? <div className="note">{F.category.note}</div> : null}</td></tr>
            <tr><td>Capacidade nominal (garrafas/h)</td><td><input type="number" value={ed.capacity} style={{ width: 120 }} onChange={(e) => set('capacity', e.target.value)} />{F.capacity_original.value ? <small> no documento: {String(F.capacity_original.value)}</small> : null}</td>
              <td>{conf(F.capacity_nominal_per_hour.confidence)}{src('capacity_nominal_per_hour')}</td></tr>
            <tr><td>Potência (kW)</td><td><input type="number" value={ed.power} style={{ width: 90 }} onChange={(e) => set('power', e.target.value)} /></td><td>{conf(F.power_kw.confidence)}{src('power_kw')}</td></tr>
            <tr><td>Descrição</td><td><textarea rows={3} value={ed.description} onChange={(e) => set('description', e.target.value)} /></td><td>{conf(F.description.confidence)}</td></tr>
          </tbody></table>
          <div className="say hyp"><Chip kind="warn">hipótese didática</Chip> Os <b>limites</b> (ótimo 100%, atenção {doc.draft.limits.warning}%, falha {doc.draft.limits.failure}% da capacidade nominal), o consumo parado/variável (15% / 85% da potência) e a vida útil são valores padrão, não vêm da ficha. Dá para ajustar depois em “Limites das máquinas”.</div>
          <div className="row" style={{ margin: '8px 0 12px' }}><button className="btn sec" disabled={busy} onClick={refresh}>Atualizar a comparação com as minhas correções</button><button className="btn sec" onClick={discard}>Descartar</button></div>

          {doc.draft.problems.length > 0 && <div className="say warn">Falta: {doc.draft.problems.join(' ')}</div>}

          {doc.matches.length > 0 && (
            <div className="matches">
              <h4 className="gsub">⚠ Já existe uma máquina parecida no catálogo</h4>
              <p className="d">Compare lado a lado. Se a ficha só traz <b>mais dados</b> da mesma máquina, <b>atualize</b> (sobrepõe). Se é <b>outro modelo ou outro ano</b>, salve como <b>nova versão</b>: a antiga continua no sistema (trocar uma máquina na fábrica leva tempo e custo).</p>
              {doc.matches.map((m) => (
                <div key={m.code} className="matchcard">
                  <div className="mh2"><b>{m.name}</b> {m.version > 1 ? `(v${m.version})` : ''} <Chip kind="info">{m.reason}</Chip> <Chip kind={m.differences ? 'warn' : 'ok'}>{m.differences} diferença(s)</Chip></div>
                  <table className="t cmp"><thead><tr><th>Campo</th><th>Já cadastrada</th><th>Da ficha</th></tr></thead><tbody>
                    {m.comparison.map((c) => <tr key={c.field} className={c.different ? 'diff' : ''}><td>{c.label}</td><td>{show(c.existing)}</td><td>{show(c.new)}</td></tr>)}
                  </tbody></table>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn amber" disabled={busy || doc.draft.problems.length > 0} onClick={() => confirm('update', m.code)}>Atualizar esta máquina (sobrepõe)</button>
                    <button className="btn" disabled={busy || doc.draft.problems.length > 0} onClick={() => confirm('new_version', m.code)}>Salvar como nova versão</button>
                  </div>
                </div>
              ))}
              <button className="btn sec" disabled={busy || doc.draft.problems.length > 0} onClick={() => confirm('create', undefined, true)}>É uma máquina diferente: criar como nova</button>
            </div>
          )}
          {doc.matches.length === 0 && <button className="btn" style={{ padding: '10px 18px' }} disabled={busy || doc.draft.problems.length > 0} onClick={() => confirm('create')}>Criar a máquina no catálogo</button>}
        </div>
      )}

      <h4 className="gsub">Máquinas importadas</h4>
      <table className="t"><thead><tr><th>Máquina</th><th>Fabricante / modelo</th><th>Versão</th><th>Capacidade</th><th /></tr></thead><tbody>
        {imported.map(([code, t]) => (
          <tr key={code}><td><b>{t.name}</b></td><td>{[t.maker, t.model].filter(Boolean).join(' ') || '—'}{t.year ? ` (${t.year})` : ''}</td><td style={{ textAlign: 'center' }}>v{t.version ?? 1}</td><td>{fmt(t.cap)} gf/h</td>
            <td><a className="lnk" onClick={() => remove(code, t.name)}>excluir</a></td></tr>
        ))}
        {!imported.length && <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Nenhuma máquina importada ainda. As máquinas que vieram com o sistema não podem ser excluídas (só desativadas).</td></tr>}
      </tbody></table>

      {docs.length > 0 && (<>
        <h4 className="gsub">Documentos anexados</h4>
        <table className="t"><thead><tr><th>Arquivo</th><th>Situação</th></tr></thead><tbody>
          {docs.map((d) => <tr key={d.id}><td>{d.file_name}</td><td><Chip kind={d.status === 'importado' ? 'ok' : d.status === 'descartado' ? 'info' : 'warn'}>{d.status}</Chip></td></tr>)}
        </tbody></table>
      </>)}
    </>
  );
}

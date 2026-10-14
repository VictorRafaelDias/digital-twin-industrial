import { useState } from 'react';
import { CostInfo, Refs } from '../components/Shared';
import { useStore, type SettingsSection } from '../store/useStore';
import { Modal } from './Modal';

const SECTIONS: [SettingsSection, string][] = [
  ['geral', 'Geral'], ['tipos', 'Tipos de máquina'], ['limites', 'Limites das máquinas'], ['precos', 'Preços das máquinas'], ['catalogo', 'Catálogo e fontes'], ['dados', 'Dados reais (futuro)'],
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const sec = useStore((s) => s.setSec);
  const setSec = useStore((s) => s.setSetSec);
  return (
    <Modal title="Configurações" wide onClose={onClose}>
      <div className="set-layout">
        <div className="set-nav">{SECTIONS.map(([k, l]) => <button key={k} className={sec === k ? 'active' : ''} onClick={() => setSec(k)}>{l}</button>)}</div>
        <div className="set-body">
          {sec === 'geral' && <General />}
          {sec === 'tipos' && <Types />}
          {sec === 'limites' && <Limits />}
          {sec === 'precos' && <Prices />}
          {sec === 'catalogo' && <CatalogSources />}
          {sec === 'dados' && <RealData />}
        </div>
      </div>
    </Modal>
  );
}

function General() {
  const tariff = useStore((s) => s.tariff);
  const setTariff = useStore((s) => s.setTariff);
  return (
    <>
      <h3>Geral</h3><p className="d">Idioma, unidades e preço da energia.</p>
      <div className="field"><label>Idioma</label><select className="in"><option>Português (Brasil)</option><option>English</option><option>Deutsch</option></select></div>
      <div className="field"><label>Unidades</label><select className="in"><option>Métrico (m³/h, °C, kW)</option><option>Imperial</option></select></div>
      <div className="field"><label>Preço da energia (R$ por kWh)</label><input type="number" value={tariff} step="0.01" style={{ width: 140 }} onChange={(e) => setTariff(parseFloat(e.target.value) || 0)} /></div>
    </>
  );
}

function Types() {
  const typeInfo = useStore((s) => s.typeInfo);
  const catalog = useStore((s) => s.catalog);
  const { updateType, addType, removeType } = useStore.getState();
  const [name, setName] = useState('');
  return (
    <>
      <h3>Tipos de máquina</h3>
      <p className="d">Escolha quais tipos aparecem na lista de máquinas e no manual, renomeie ou crie um tipo novo. O tipo de cada máquina muda em “Limites das máquinas”.</p>
      <table className="t"><thead><tr><th>Usar</th><th>Nome</th><th>Descrição</th><th>Máquinas</th><th /></tr></thead><tbody>
        {Object.entries(typeInfo).map(([k, ti]) => {
          const n = Object.values(catalog).filter((c) => c.cat === k).length;
          return (
            <tr key={k}>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={ti.on !== false} onChange={(e) => updateType(k, { on: e.target.checked })} /></td>
              <td><input type="text" value={ti.name} onChange={(e) => updateType(k, { name: e.target.value })} /></td>
              <td><input type="text" value={ti.desc} onChange={(e) => updateType(k, { desc: e.target.value })} /></td>
              <td style={{ textAlign: 'center' }}>{n}</td>
              <td>{!n && <a className="lnk" onClick={() => removeType(k)}>remover</a>}</td>
            </tr>
          );
        })}
      </tbody></table>
      <div className="row" style={{ marginTop: 12 }}>
        <input type="text" placeholder="Nome do novo tipo (ex.: Embalagem)" style={{ maxWidth: 300 }} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sec" onClick={() => { if (!name.trim()) return useStore.getState().showToast('Digite o nome do tipo'); addType(name.trim()); setName(''); }}>+ Criar tipo</button>
      </div>
    </>
  );
}

function Limits() {
  const catalog = useStore((s) => s.catalog);
  const typeInfo = useStore((s) => s.typeInfo);
  const { updateMachineLimit, setMachineCat } = useStore.getState();
  return (
    <>
      <h3>Limites das máquinas</h3>
      <p className="d">Até onde cada máquina trabalha bem (ótimo), quando entra em atenção e quando falha. Mudou aqui, muda a simulação. O tipo define em que grupo a máquina aparece.</p>
      <table className="t"><thead><tr><th>Máquina</th><th>Tipo</th><th>Ótimo</th><th>Atenção</th><th>Falha</th><th /></tr></thead><tbody>
        {Object.entries(catalog).map(([k, t]) => (
          <tr key={k}>
            <td>{t.name}</td>
            <td><select className="in" style={{ width: 130 }} value={t.cat} onChange={(e) => setMachineCat(k, e.target.value)}>{Object.entries(typeInfo).map(([id, ti]) => <option key={id} value={id}>{ti.name}</option>)}</select></td>
            {(['opt', 'warn', 'crit'] as const).map((f) => (
              <td key={f}><input type="number" step="any" style={{ width: 84 }} value={t[f]} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) updateMachineLimit(k, f, v); }} /></td>
            ))}
            <td>{t.unit}</td>
          </tr>
        ))}
      </tbody></table>
    </>
  );
}

function Prices() {
  const catalog = useStore((s) => s.catalog);
  const setMachinePrice = useStore((s) => s.setMachinePrice);
  return (
    <>
      <h3>Preços das máquinas</h3>
      <p className="d">Faixa de preço de <b>1 unidade</b>, usada para estimar o custo de uma melhoria. São <b>estimativas</b> a partir de anúncios de fornecedores (câmbio de referência: R$ 5,50 por US$), quase sempre de máquinas menores que as da simulação. Para decidir uma compra, peça cotação. Você pode ajustar os valores.</p>
      <table className="t"><thead><tr><th>Máquina</th><th>Mínimo (R$ mil)</th><th>Máximo (R$ mil)</th><th>De onde vem</th></tr></thead><tbody>
        {Object.entries(catalog).map(([k, t]) => (
          <tr key={k}>
            <td style={{ verticalAlign: 'top' }}>{t.name}</td>
            {(['min', 'max'] as const).map((f) => (
              <td key={f}><input type="number" style={{ width: 90 }} value={Math.round(t.cost[f] / 1000)} onChange={(e) => setMachinePrice(k, f, parseFloat(e.target.value) || 0)} /></td>
            ))}
            <td><details><summary>ver fonte</summary><CostInfo t={t} /></details></td>
          </tr>
        ))}
      </tbody></table>
    </>
  );
}

function CatalogSources() {
  const catalog = useStore((s) => s.catalog);
  return (
    <>
      <h3>Catálogo e fontes</h3>
      <p className="d">De onde vem cada número. Fonte real tem link; hipótese diz em que se baseia.</p>
      <table className="t"><thead><tr><th>Máquina</th><th>Origem dos números</th></tr></thead><tbody>
        {Object.entries(catalog).map(([k, t]) => <tr key={k}><td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>{t.name}</td><td><Refs t={t} id={k} /></td></tr>)}
      </tbody></table>
    </>
  );
}

function RealData() {
  return (
    <>
      <h3>Dados reais (futuro)</h3>
      <p className="d">Hoje tudo é simulado. No futuro, o sistema poderá ler as máquinas de verdade.</p>
      {['Simulador interno (ativo)', 'Máquina moderna — leitura direta (OPC UA)', 'Máquina antiga — sensores externos (MQTT)', 'Arquivo CSV com histórico'].map((l, i) => (
        <label key={l} className="chk"><input type="radio" name="fonte" defaultChecked={i === 0} /><span>{l}</span></label>
      ))}
    </>
  );
}

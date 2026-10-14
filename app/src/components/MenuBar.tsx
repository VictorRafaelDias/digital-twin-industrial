import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import type { FEdge, FNode } from '../types';
import { Icon } from './Icon';

type Item = '-' | { label: string; key?: string; run: () => void };

export function MenuBar() {
  const s = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = () => setOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const saveFile = () => {
    const blob = new Blob([JSON.stringify({ name: s.plantName, nodes: s.nodes, edges: s.edges, seq: s.seq }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (s.plantName || 'fabrica') + '.json'; a.click();
    URL.revokeObjectURL(a.href);
    s.showToast('Fábrica salva como arquivo');
  };
  const openFile = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { const o = JSON.parse(String(r.result)) as { name?: string; nodes: FNode[]; edges: FEdge[]; seq?: number }; s.openFactory(o); }
      catch { s.showToast('Arquivo inválido'); }
    };
    r.readAsText(f);
  };

  const menus: Record<string, Item[]> = {
    Arquivo: [
      { label: 'Nova fábrica em branco', run: s.newFactory },
      { label: 'Abrir…', run: () => fileRef.current?.click() },
      { label: 'Salvar…', run: saveFile },
      { label: 'Exportar relatório (PDF)', run: () => s.showToast('Relatório em PDF — ainda não implementado') },
    ],
    Visualizar: [
      { label: 'Montar', key: 'F1', run: () => s.setView('logic') },
      { label: 'Fábrica vista de cima', key: 'F2', run: () => s.setView('physical') },
      { label: 'Painel da máquina', key: 'F3', run: () => s.setView('hmi') },
      { label: 'Resultados', key: 'F4', run: () => s.setView('dashboard') },
      '-',
      { label: 'Mostrar/ocultar painel lateral', key: 'F9', run: s.toggleSide },
      { label: 'Mostrar/ocultar lista de máquinas', run: s.togglePal },
    ],
    Exemplos: [
      { label: 'Bebidas em geral (8 máquinas)', run: () => s.loadTemplate('bebidas') },
      { label: 'Suco de laranja natural (6 máquinas)', run: () => s.loadTemplate('suco') },
    ],
    Opções: [{ label: 'Configurações…', run: () => s.openSettings() }],
    Ajuda: [
      { label: 'Guia rápido (checklist)', run: () => s.setGuide({ open: true, min: false }) },
      { label: 'Guia da plataforma (com imagens)', run: () => s.setView('guide') },
      { label: 'Manual das máquinas', run: () => s.setView('manual') },
      { label: 'Glossário (o que é gargalo, ritmo…)', run: () => s.openGlossary() },
      '-',
      { label: 'Sobre este protótipo', run: () => s.openModal('about') },
    ],
  };

  return (
    <header className="menubar">
      <div className="brand"><Icon name="factory" size={20} /><span>Digital Twin <b>Industrial</b></span></div>
      {Object.entries(menus).map(([name, items]) => (
        <div key={name} className={'menu' + (open === name ? ' open' : '')}>
          <button onClick={(e) => { e.stopPropagation(); setOpen(open === name ? null : name); }}>{name}</button>
          <div className="dropdown">
            {items.map((it, i) => it === '-' ? <hr key={i} /> : (
              <div key={i} className="item" onClick={(e) => { e.stopPropagation(); setOpen(null); it.run(); }}>
                <span>{it.label}</span><small>{it.key || ''}</small>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="spacer" />
      <input className="plantname" value={s.plantName} onChange={(e) => s.setPlantName(e.target.value)} title="Nome da fábrica (clique para editar)" />
      <div className="userchip"><Icon name="user" size={16} /><b>{s.user}</b><a onClick={s.logout}>Sair</a></div>
      <button className="guidebtn" onClick={() => { s.setGuide({ open: true, min: false }); s.setView('logic'); }}>? Guia</button>
      <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
    </header>
  );
}

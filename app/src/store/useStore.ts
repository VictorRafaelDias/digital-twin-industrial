/* Estado global do front-end (zustand). Aqui ficam o desenho da fábrica, as configurações e as ações do usuário.
   O cálculo da simulação NÃO fica aqui: está em src/engine (funções puras). */
import { create } from 'zustand';
import { buildCatalog } from '../data/catalog';
import { TYPE_INFO_INITIAL } from '../data/content';
import { bottleneckReport, runWhatIf } from '../engine/bottleneck';
import { canConnect } from '../engine/connect';
import { buildFromTemplate, mkNode } from '../engine/factory';
import { clock, fmt, pad } from '../engine/format';
import { planGoal } from '../engine/goal';
import { computeArrivals, newRun } from '../engine/run';
import { bnName, simulate } from '../engine/simulate';
import type {
  Catalog, ChatMsg, FEdge, FNode, GoalInput, LogEvent, NodeChange, Plan, Ref, RunState, SideTab, SimContext, ToolId,
  TypeInfo, ViewId, WhatIfResult,
} from '../types';

export type ModalId = null | 'risk' | 'ambient' | 'runresult' | 'about' | 'settings';
export type SettingsSection = 'geral' | 'tipos' | 'limites' | 'precos' | 'catalogo' | 'dados';

interface Snapshot { nodes: FNode[]; edges: FEdge[]; seq: number }

export interface AppState {
  user: string | null;
  view: ViewId; tool: ToolId; tab: SideTab; sideHidden: boolean; palMin: boolean; modal: ModalId; toast: string | null;
  plantName: string;
  catalog: Catalog; typeInfo: Record<string, TypeInfo>;
  nodes: FNode[]; edges: FEdge[]; seq: number;
  selected: string | null; selEdge: string | null; connectFrom: string | null; hmiSel: string | null; zoom: number;
  undoStack: Snapshot[]; redoStack: Snapshot[];
  ambient: number; tariff: number; estop: boolean;
  baseline: { prod: number; risk: number; energy: number } | null;
  layers: { pipes: boolean; energy: boolean };
  events: LogEvent[]; run: RunState;
  goal: GoalInput; goalPlan: Plan | null;
  whatIf: { n: number; pct: number; over: boolean; res: WhatIfResult | null; plan: Plan | null };
  chat: ChatMsg[];
  guide: { open: boolean; min: boolean; changed: boolean; goal: boolean; chat: boolean };
  cat: string; q: string;
  manual: { type: string | null; machine: string | null };
  guideSel: number; glossTerm: string | null; glossQ: string; setSec: SettingsSection;
}

export interface Actions {
  login: (name: string) => void; logout: () => void;
  setView: (v: ViewId) => void; setTool: (t: ToolId) => void; setTab: (t: SideTab) => void;
  toggleSide: () => void; togglePal: () => void; openModal: (m: ModalId) => void; showToast: (msg: string) => void;
  setPlantName: (n: string) => void;
  simCtx: () => SimContext;
  addEvent: (text: string, kind?: LogEvent['kind']) => void; clearEvents: () => void;
  pushUndo: () => void; undo: () => void; redo: () => void;
  newFactory: () => void; loadTemplate: (key: string) => void; openFactory: (data: { name?: string; nodes: FNode[]; edges: FEdge[]; seq?: number }) => void;
  addNode: (type: string, x: number, y: number) => void; moveNode: (id: string, x: number, y: number) => void; dragStart: () => void;
  removeNode: (id: string) => void; removeEdge: (id: string) => void;
  select: (id: string | null) => void; setSelEdge: (id: string | null) => void; setHmiSel: (id: string) => void;
  nodeClick: (id: string) => void;
  commitValue: (id: string, v: number) => void; setQty: (id: string, q: number) => void; toggleOff: (id: string) => void;
  setZoom: (z: number) => void;
  setAmbient: (T: number) => void; setTariff: (v: number) => void; toggleEstop: () => void; setBaseline: () => void;
  toggleLayer: (k: 'pipes' | 'energy') => void;
  applyChange: (c: NodeChange & { label?: string }) => void; applyPlan: (p: Plan) => void;
  setGoal: (g: Partial<GoalInput>) => void; planGoalNow: () => void; clearGoalPlan: () => void;
  setWhatIf: (w: Partial<AppState['whatIf']>) => void; simulateWhatIf: () => void; planWhatIf: () => void; applyWhatIfOnly: () => void;
  ask: (q: string) => void; exploreBottleneck: () => void;
  setGuide: (g: Partial<AppState['guide']>) => void;
  setCat: (c: string) => void; setQ: (q: string) => void;
  setManual: (m: { type: string | null; machine: string | null }) => void;
  setGuideSel: (i: number) => void; openGlossary: (term?: string | null) => void; setGlossQ: (q: string) => void;
  openSettings: (s?: SettingsSection) => void; setSetSec: (s: SettingsSection) => void;
  updateMachineLimit: (type: string, field: 'opt' | 'warn' | 'crit', v: number) => void;
  setMachineCat: (type: string, cat: string) => void; setMachinePrice: (type: string, f: 'min' | 'max', v: number) => void;
  updateType: (id: string, patch: Partial<TypeInfo>) => void; addType: (name: string) => void; removeType: (id: string) => void;
  startOrToggleRun: () => void; stopRun: () => void; setRunSpeed: (s: number) => void; setRunDur: (d: number) => void; tickRun: () => void;
  clearAll: () => void;
}

const snapshot = (s: AppState): Snapshot => ({ nodes: s.nodes.map((n) => ({ ...n })), edges: s.edges.map((e) => ({ ...e })), seq: s.seq });
const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState & Actions>((set, get) => {
  const typeInfo: Record<string, TypeInfo> = {};
  Object.entries(TYPE_INFO_INITIAL).forEach(([k, t]) => { typeInfo[k] = { ...t, on: true }; });
  let saved: string | null = null;
  try { saved = sessionStorage.getItem('dtw_user'); } catch { /* sem armazenamento: segue sem lembrar o usuário */ }

  const ctx = (): SimContext => { const s = get(); return { catalog: s.catalog, ambient: s.ambient, estop: s.estop, run: s.run.active ? { active: true, t: s.run.t, arrivals: s.run.arrivals } : undefined }; };
  const log = (text: string, kind: LogEvent['kind'] = '') => set((s) => ({ events: [{ time: now(), text, kind }, ...s.events].slice(0, 80) }));

  return {
    user: saved, view: 'logic', tool: 'select', tab: 'goal', sideHidden: false, palMin: false, modal: null, toast: null,
    plantName: 'Minha fábrica', catalog: buildCatalog(), typeInfo,
    nodes: [], edges: [], seq: 1, selected: null, selEdge: null, connectFrom: null, hmiSel: null, zoom: 1,
    undoStack: [], redoStack: [], ambient: 25, tariff: 0.85, estop: false, baseline: null,
    layers: { pipes: true, energy: false }, events: [], run: newRun(),
    goal: { type: 'pct', value: 10, more: true, over: true }, goalPlan: null,
    whatIf: { n: 2, pct: 20, over: false, res: null, plan: null }, chat: [],
    guide: { open: true, min: false, changed: false, goal: false, chat: false },
    cat: 'all', q: '', manual: { type: null, machine: null }, guideSel: 0, glossTerm: null, glossQ: '', setSec: 'geral',

    login: (name) => { const user = name.trim() || 'usuário'; try { sessionStorage.setItem('dtw_user', user); } catch { /* ok */ } set({ user }); },
    logout: () => { try { sessionStorage.removeItem('dtw_user'); } catch { /* ok */ } set({ user: null }); },

    setView: (view) => set({ view }),
    setTool: (tool) => {
      set({ tool, connectFrom: null });
      if (tool === 'link') get().showToast('Conectar: clique na máquina de origem e depois na de destino');
      if (tool === 'trash') get().showToast('Excluir: clique numa máquina ou conexão');
    },
    setTab: (tab) => set({ tab }),
    toggleSide: () => set((s) => ({ sideHidden: !s.sideHidden })),
    togglePal: () => set((s) => ({ palMin: !s.palMin })),
    openModal: (modal) => set({ modal }),
    showToast: (msg) => { set({ toast: msg }); clearTimeout(toastTimer); toastTimer = setTimeout(() => set({ toast: null }), 2600); },
    setPlantName: (plantName) => set({ plantName }),
    simCtx: ctx,

    addEvent: log, clearEvents: () => set({ events: [] }),

    pushUndo: () => set((s) => ({ undoStack: [...s.undoStack, snapshot(s)].slice(-60), redoStack: [] })),
    undo: () => {
      const s = get(); if (!s.undoStack.length) return get().showToast('Nada para desfazer');
      const prev = s.undoStack[s.undoStack.length - 1];
      set({ redoStack: [...s.redoStack, snapshot(s)], undoStack: s.undoStack.slice(0, -1), nodes: prev.nodes, edges: prev.edges, seq: prev.seq, selected: null });
    },
    redo: () => {
      const s = get(); if (!s.redoStack.length) return get().showToast('Nada para refazer');
      const next = s.redoStack[s.redoStack.length - 1];
      set({ undoStack: [...s.undoStack, snapshot(s)], redoStack: s.redoStack.slice(0, -1), nodes: next.nodes, edges: next.edges, seq: next.seq, selected: null });
    },

    newFactory: () => {
      get().pushUndo();
      set({ nodes: [], edges: [], selected: null, estop: false, baseline: null, goalPlan: null, hmiSel: null });
      log('Fábrica nova, em branco');
    },
    loadTemplate: (key) => {
      const s = get(); s.pushUndo();
      const f = buildFromTemplate(key, s.catalog, s.seq);
      set((st) => ({ nodes: f.nodes, edges: f.edges, seq: f.seq, selected: null, estop: false, baseline: null, goalPlan: null, hmiSel: f.nodes[0].id, plantName: f.name, guide: { ...st.guide, min: true }, view: 'logic' }));
      log(`Exemplo carregado: ${f.name}`, 'ok');
    },
    openFactory: (d) => {
      get().pushUndo();
      set((s) => ({ nodes: d.nodes.map((n) => ({ ...n, qty: n.qty ?? 1, off: n.off ?? false })), edges: d.edges, seq: d.seq || 100, plantName: d.name || 'Fábrica aberta', selected: null, goalPlan: s.goalPlan }));
      get().showToast('Fábrica aberta');
    },
    clearAll: () => { get().stopRun(); get().newFactory(); get().showToast('Fábrica limpa. Para voltar, use Desfazer (Ctrl+Z).'); },

    addNode: (type, x, y) => {
      const s = get(); if (!s.catalog[type]) return; s.pushUndo();
      const n = mkNode('n' + s.seq, type, Math.max(0, x), Math.max(0, y), s.catalog);
      set((st) => ({ nodes: [...st.nodes, n], seq: st.seq + 1, selected: n.id, hmiSel: n.id, tab: 'machine', guide: st.nodes.length >= 1 ? { ...st.guide, min: true } : st.guide }));
      log(`Adicionou: ${s.catalog[type].name}`);
    },
    dragStart: () => get().pushUndo(),
    moveNode: (id, x, y) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n)) })),
    removeNode: (id) => {
      const s = get(); const n = s.nodes.find((x) => x.id === id); if (!n) return; s.pushUndo();
      set((st) => ({ nodes: st.nodes.filter((x) => x.id !== id), edges: st.edges.filter((e) => e.from !== id && e.to !== id), selected: st.selected === id ? null : st.selected }));
      log(`Removeu: ${s.catalog[n.type].name}`);
    },
    removeEdge: (id) => { get().pushUndo(); set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })); log('Conexão removida'); },

    select: (id) => set((s) => ({ selected: id, selEdge: null, ...(id ? { hmiSel: id, tab: 'machine' as SideTab } : {}), connectFrom: id ? s.connectFrom : null })),
    setSelEdge: (id) => set({ selEdge: id }),
    setHmiSel: (id) => set({ hmiSel: id, selected: id }),

    /** Clique numa máquina, conforme a ferramenta ativa (selecionar, conectar ou excluir). */
    nodeClick: (id) => {
      const s = get(); const n = s.nodes.find((x) => x.id === id); if (!n) return;
      const name = (x: FNode) => s.catalog[x.type].name;
      if (s.tool === 'link') {
        if (!s.connectFrom) { set({ connectFrom: id }); return get().showToast(`Origem: ${name(n)}. Agora clique na máquina de destino (as que podem receber ficam destacadas).`); }
        if (s.connectFrom === id) { set({ connectFrom: null }); return; }
        const c = canConnect(s.connectFrom, id, s.nodes, s.edges, s.catalog);
        if (!c.ok) return get().showToast('Não pode ligar: ' + c.msg);
        s.pushUndo();
        const from = s.nodes.find((x) => x.id === s.connectFrom) as FNode;
        set((st) => ({ edges: [...st.edges, { id: 'e' + st.seq, from: s.connectFrom as string, to: id }], seq: st.seq + 1, connectFrom: null }));
        log(`Conectou ${name(from)} → ${name(n)}`);
        if (c.level === 'warn') get().showToast(c.msg);
        return;
      }
      if (s.tool === 'trash') return get().removeNode(id);
      get().select(id);
    },

    commitValue: (id, v) => {
      const s = get(); const n = s.nodes.find((x) => x.id === id); if (!n) return;
      const t = s.catalog[n.type]; v = Math.min(t.max, Math.max(t.min, v)); if (Number.isNaN(v)) return;
      const before = simulate(s.nodes, s.edges, { ...ctx(), run: undefined }).production;
      s.pushUndo();
      const nodes = s.nodes.map((x) => (x.id === id ? { ...x, value: v } : x));
      const a = simulate(nodes, s.edges, { ...ctx(), run: undefined });
      const dp = before ? ((a.production - before) / before) * 100 : 0;
      set((st) => ({ nodes, guide: { ...st.guide, changed: true } }));
      const st = a.res[id].state;
      log(`${t.name}: ${t.param.toLowerCase()} ${fmt(n.value, 2)} → ${fmt(v, 2)} ${t.unit} · produção ${dp >= 0 ? '+' : ''}${fmt(dp, 1)}%`, st === 'normal' ? 'ok' : st === 'falha' ? 'bad' : 'warn');
      if (v > t.warn && v < t.crit) get().showToast(`Atenção: ${t.name} está perto do limite de falha`);
    },
    setQty: (id, q) => {
      const s = get(); const n = s.nodes.find((x) => x.id === id); if (!n) return; q = Math.min(6, Math.max(1, q)); s.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? { ...x, qty: q } : x)), guide: { ...st.guide, changed: true } }));
      log(`${s.catalog[n.type].name}: ${q} unidade(s) em paralelo`);
    },
    toggleOff: (id) => {
      const s = get(); const n = s.nodes.find((x) => x.id === id); if (!n) return; s.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? { ...x, off: !x.off } : x)) }));
      log(`${s.catalog[n.type].name}: ${n.off ? 'ligada' : 'desligada'}`, n.off ? 'ok' : 'warn');
    },
    setZoom: (zoom) => set({ zoom: Math.min(1.5, Math.max(0.5, zoom)) }),

    setAmbient: (T) => { const v = Math.min(45, Math.max(0, Number.isNaN(T) ? 25 : Math.round(T))); set({ ambient: v }); log(`Temperatura ambiente: ${v} °C`); },
    setTariff: (tariff) => set({ tariff }),
    toggleEstop: () => { const on = !get().estop; set({ estop: on }); log(on ? 'PARADA DE EMERGÊNCIA acionada' : 'Emergência liberada — fábrica religada', on ? 'bad' : 'ok'); },
    setBaseline: () => { const sim = simulate(get().nodes, get().edges, { ...ctx(), run: undefined }); set({ baseline: { prod: sim.production, risk: sim.maxRisk, energy: sim.energy } }); get().showToast('Ponto de partida marcado'); },
    toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),

    applyChange: (c) => {
      get().pushUndo();
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === c.id ? { ...n, value: c.value, qty: c.qty, off: c.off } : n)), guide: { ...s.guide, changed: true } }));
      log('Aplicou: ' + (c.label || 'melhoria'), 'ok'); get().showToast('Aplicado. Para voltar, use Desfazer (Ctrl+Z).');
    },
    applyPlan: (p) => {
      const s = get(); s.pushUndo();
      set((st) => ({ nodes: st.nodes.map((n) => { const c = p.changes[n.id]; return c ? { ...n, value: c.value, qty: c.qty, off: c.off } : n; }), goalPlan: null, whatIf: { ...st.whatIf, res: null, plan: null }, guide: { ...st.guide, changed: true } }));
      log(`Aplicou o plano: produção ${fmt(p.before.prod)} → ${fmt(p.after.prod)} garrafas/h`, 'ok');
    },

    setGoal: (g) => set((s) => ({ goal: { ...s.goal, ...g }, goalPlan: g.type ? null : s.goalPlan })),
    planGoalNow: () => { const s = get(); set({ goalPlan: planGoal(s.goal, s.nodes, s.edges, ctx()), guide: { ...s.guide, goal: true } }); },
    clearGoalPlan: () => set({ goalPlan: null }),

    setWhatIf: (w) => set((s) => ({ whatIf: { ...s.whatIf, ...w } })),
    simulateWhatIf: () => { const s = get(); set({ whatIf: { ...s.whatIf, res: runWhatIf(s.whatIf.n, s.nodes, s.edges, ctx()) } }); },
    planWhatIf: () => { const s = get(); set({ whatIf: { ...s.whatIf, plan: planGoal({ type: 'pct', value: s.whatIf.pct, more: true, over: s.whatIf.over }, s.nodes, s.edges, ctx()) } }); },

    /** Aplica só a mudança simulada (as máquinas a mais), sem o plano em cascata. */
    applyWhatIfOnly: () => {
      const s = get(); const r = s.whatIf.res; const n = r && s.nodes.find((x) => x.id === r.id); if (!r || !n) return;
      s.applyChange({ id: n.id, value: s.catalog[n.type].opt, qty: (n.qty || 1) + r.n, off: false, label: `${r.name} com ${(n.qty || 1) + r.n} unidades em paralelo` });
      set((st) => ({ whatIf: { ...st.whatIf, res: null } }));
    },
    ask: (q) => {
      const s = get(); q = q.trim(); if (!q) return;
      set({ chat: [...s.chat, { who: 'me', text: q }], guide: { ...s.guide, chat: true } });
      const reply = answerQuestion(q, get(), ctx());
      set((st) => ({ chat: [...st.chat, reply] }));
    },
    exploreBottleneck: () => {
      const s = get(); const rep = bottleneckReport(s.nodes, s.edges, ctx()); if (!rep) return;
      set({ sideHidden: false, tab: 'chat', guide: { ...s.guide, chat: true }, chat: [...s.chat, { who: 'me', text: `Por que o gargalo é a ${rep.name} e como resolver?` }, { who: 'ai', kind: 'bottleneck', report: rep }] });
    },

    setGuide: (g) => set((s) => ({ guide: { ...s.guide, ...g } })),
    setCat: (cat) => set({ cat }), setQ: (q) => set({ q }),
    setManual: (manual) => set({ manual }),
    setGuideSel: (guideSel) => set({ guideSel }),
    openGlossary: (term = null) => set({ glossTerm: term, glossQ: '', view: 'glossary', modal: null }),
    setGlossQ: (glossQ) => set({ glossQ }),
    openSettings: (sec) => set((s) => ({ modal: 'settings', setSec: sec || s.setSec })),
    setSetSec: (setSec) => set({ setSec }),
    updateMachineLimit: (type, field, v) => set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], [field]: v } } })),
    setMachineCat: (type, cat) => set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], cat } } })),
    setMachinePrice: (type, f, v) => set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], cost: { ...s.catalog[type].cost, [f]: Math.max(0, v) * 1000, edited: true } } } })),
    updateType: (id, patch) => set((s) => ({ typeInfo: { ...s.typeInfo, [id]: { ...s.typeInfo[id], ...patch } } })),
    addType: (name) => set((s) => ({ typeInfo: { ...s.typeInfo, ['t' + Date.now()]: { name, icon: 'factory', desc: 'Tipo criado por você.', on: true } } })),
    removeType: (id) => set((s) => { const t = { ...s.typeInfo }; delete t[id]; return { typeInfo: t }; }),

    startOrToggleRun: () => {
      const s = get(); const r = s.run;
      if (!s.nodes.length) return get().showToast('Monte a fábrica antes de iniciar a simulação');
      if (r.on) { set({ run: { ...r, on: false } }); return log('Simulação pausada'); }
      if (!r.active || r.finished) {
        set({ run: { ...newRun(r.speed, r.dur), active: true, arrivals: computeArrivals(s.nodes, s.edges), on: true }, view: 'logic' });
        return log(`Simulação iniciada (${r.dur >= 60 ? r.dur / 60 + ' h' : r.dur + ' min'} simulados)`, 'ok');
      }
      set({ run: { ...r, on: true } });
    },
    stopRun: () => { const r = get().run; set({ run: newRun(r.speed, r.dur) }); log('Simulação parada e zerada'); },
    setRunSpeed: (speed) => set((s) => ({ run: { ...s.run, speed } })),
    setRunDur: (dur) => set((s) => ({ run: { ...s.run, dur } })),

    /** Um passo do relógio do play (chamado a cada 250 ms pelo App). */
    tickRun: () => {
      const s = get(); const r = s.run; if (!r.on) return;
      const dt = 0.25 * r.speed;
      const t = Math.min(r.dur, r.t + dt);
      const sim = simulate(s.nodes, s.edges, ctx());
      const produced = r.produced + (sim.production / 60) * dt, kwh = r.kwh + (sim.energy * dt) / 60;
      const queue = { ...r.queue }, announced = { ...r.announced };
      const events: LogEvent[] = [];
      s.nodes.forEach((n) => {
        const q = sim.res[n.id].queue || 0; if (q > 0) queue[n.id] = (queue[n.id] || 0) + (q / 60) * dt;
        if (!announced[n.id] && t >= (r.arrivals[n.id] || 0)) { announced[n.id] = true; events.push({ time: now(), text: `${s.catalog[n.type].name} começou a trabalhar`, kind: '' }); }
      });
      const stepMin = r.dur <= 60 ? 10 : 60, k = Math.floor(t / stepMin);
      let lastK = r.lastK;
      if (k > lastK && t < r.dur) { lastK = k; events.push({ time: now(), text: `${clock(t)} — ${fmt(produced)} garrafas produzidas · gargalo: ${bnName(sim, s.nodes, s.catalog)} · risco máx. ${fmt(sim.maxRisk * 100, 1)}%`, kind: '' }); }
      const finished = t >= r.dur;
      if (finished) events.push({ time: now(), text: 'Simulação terminada', kind: 'ok' });
      set((st) => ({ run: { ...r, t, produced, kwh, queue, announced, lastK, on: !finished, finished: finished || r.finished }, events: [...events.reverse(), ...st.events].slice(0, 80), ...(finished ? { modal: 'runresult' as ModalId } : {}) }));
    },
  };
});

/** Respostas do assistente (exemplo): analisam a fábrica atual; a leitura de manuais ainda é de demonstração. */
function answerQuestion(q: string, s: AppState & Actions, ctx: SimContext): ChatMsg {
  const ql = q.toLowerCase();
  const text = (t: string, cites?: Ref[]): ChatMsg => ({ who: 'ai', kind: 'text', text: t, cites });
  if (!s.nodes.length) return text('Sua fábrica ainda está vazia. Monte uma (ou carregue um exemplo) e eu analiso.');
  const calc = { ...ctx, run: undefined };
  const sim = simulate(s.nodes, s.edges, calc);
  const name = (n: FNode) => s.catalog[n.type].name;
  const mention = s.nodes.find((n) => ql.includes(name(n).toLowerCase())) || s.nodes.find((n) => { const w = name(n).toLowerCase().split(' ')[0]; return w.length > 5 && ql.includes(w); });
  const pct = ql.match(/(\d+[.,]?\d*)\s*%/);
  if (pct && /(aument|subir|mais|produ|cresc)/.test(ql)) {
    const v = parseFloat(pct[1].replace(',', '.'));
    const plan = planGoal({ type: 'pct', value: v, more: true, over: true }, s.nodes, s.edges, ctx);
    return { who: 'ai', kind: 'plan', text: plan.ok ? `Dá para chegar a <b>+${pct[1]}%</b>.` : `Não dá para chegar a +${pct[1]}% só com isso.`, plan };
  }
  if (/custa|custo|pre[çc]o|invest|quanto sai/.test(ql) && !/energia|kw/.test(ql)) {
    if (mention) { const t = s.catalog[mention.type]; return text(`Uma unidade de <b>${t.name}</b> custa por volta de <b>${t.cost.min ? `R$ ${fmt(t.cost.min / 1000)} mil a R$ ${fmt(t.cost.max / 1000)} mil` : 'consultar o fabricante'}</b> (estimativa).<br>${t.cost.note}`, t.cost.refs); }
    return { who: 'ai', kind: 'bottleneck', report: bottleneckReport(s.nodes, s.edges, ctx) };
  }
  if (/gargalo|limita|mais lent/.test(ql)) return { who: 'ai', kind: 'bottleneck', report: bottleneckReport(s.nodes, s.edges, ctx) };
  if (/falh|quebr|parar|desligar/.test(ql)) {
    const m = mention || (s.nodes.find((n) => n.id === sim.bn) as FNode);
    const s2 = simulate(s.nodes.map((n) => (n.id === m.id ? { ...n, off: true } : n)), s.edges, calc);
    return text(`Se a <b>${name(m)}</b> parar, a produção vai de <b>${fmt(sim.production)}</b> para <b>${fmt(s2.production)}</b> garrafas/h e a energia cai de ${fmt(sim.energy, 1)} para ${fmt(s2.energy, 1)} kW (as máquinas ficam paradas, mas ligadas).`);
  }
  if (/como funciona|o que é|para que serve|manual/.test(ql) && mention) {
    const t = s.catalog[mention.type];
    return text(`<b>${name(mention)}</b>: ${t.desc}`, t.refs);
  }
  if (/energia|consumo|kw/.test(ql)) {
    const top = s.nodes.reduce((a, b) => (sim.res[b.id].energy > sim.res[a.id].energy ? b : a));
    return text(`A fábrica gasta <b>${fmt(sim.energy, 1)} kW</b> (≈ R$ ${fmt(sim.energy * s.tariff, 2)}/h). Quem mais gasta é a <b>${name(top)}</b> (${fmt(sim.res[top.id].energy, 1)} kW).`, s.catalog.enchedora.refs.filter((r) => r.u.includes('doi.org')));
  }
  if (/por que|caiu|parou|menos/.test(ql)) {
    const badN = s.nodes.filter((n) => sim.res[n.id].state === 'falha' || n.off);
    return text(badN.length ? `Porque <b>${badN.map(name).join(', ')}</b> ${badN.length > 1 ? 'estão' : 'está'} parada(s). Tudo que vem depois fica sem produto (efeito cascata).` : `Não vejo nenhuma máquina parada. A produção está limitada pelo gargalo, <b>${bnName(sim, s.nodes, s.catalog)}</b>.`);
  }
  return text('Ainda não sei responder isso no protótipo. Tente: <i>onde está o gargalo</i>, <i>aumentar a produção em 10%</i>, <i>o que acontece se a enchedora falhar</i> ou <i>como funciona o pasteurizador</i>.');
}

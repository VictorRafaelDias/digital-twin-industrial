/* Estado global do front-end (zustand). Aqui ficam o desenho da fábrica, as configurações e as ações do usuário.
   O cálculo da simulação NÃO fica aqui: está em src/engine (funções puras). */
import { create } from 'zustand';
import { api, apiLogin, ApiError, type ApiSession } from '../api/client';
import { buildCatalog } from '../data/catalog';
import { TYPE_INFO_INITIAL } from '../data/content';
import { bottleneckReport, runWhatIf } from '../engine/bottleneck';
import { canConnect } from '../engine/connect';
import { buildFromTemplate, mkNode } from '../engine/factory';
import { fmt, pad } from '../engine/format';
import { planGoal } from '../engine/goal';
import { advanceRun, computeArrivals, newRun } from '../engine/run';
import { bnName, simulate } from '../engine/simulate';
import { machineTemp } from '../engine/thermal';
import { lifeYears, withWear } from '../engine/wear';
import { cfgOf, makeVersion, realFlow, sameConfig, type Cfg, type ReportVersion } from './versions';
import type {
  Catalog, ChatMsg, FEdge, FNode, GoalInput, LogEvent, MachineType, NodeChange, Plan, Ref, RunState, SideTab, SimContext, ToolId,
  TypeInfo, ViewId, WhatIfResult,
} from '../types';

export type ModalId = null | 'risk' | 'ambient' | 'runresult' | 'about' | 'settings' | 'factories';

/** O que o servidor devolve (só os campos que o front usa). */
export interface ApiMachine {
  code: string; name: string; category: string; stage: string; icon: string; flow: string; parameter: string; unit: string;
  limits: { min: number; optimal: number; warning: number; failure: number; max: number };
  capacity_at_optimal: number; standby_kw: number; variable_kw: number; process_order: number | null; thermal_sensitivity: string;
  accepts_multiple_inputs: boolean; is_final_stage: boolean; maker?: string | null; model?: string | null; year?: number | null; version?: number;
  family?: string; origin?: 'embutida' | 'importada'; active?: boolean; life_hours?: number; maintenance_interval_hours?: number;
  price?: { min: number; max: number; note?: string; edited_by_user: boolean; sources?: { title: string; url: string; confidence: string }[] } | null;
  description?: string; physical_risk?: string; basis_of_numbers?: string; sources?: { title: string; url: string; confidence: string }[];
}
export interface ApiCategory { code: string; name: string; description: string; icon: string | null; active: boolean }
export interface ServerFactory { id: number; name: string; example: string | null; machine_count: number; updated_at: string }
export interface ServerSim { id: number; started_at: string; speed: number; duration_min: number; produced: number; pct_of_best: number; energy_kwh: number; finished: boolean }
interface ApiFactoryFull {
  id: number; name: string; ambient: number; tariff: number; emergency_stop: boolean;
  machines: { id: number; type: string; x: number; y: number; value: number; units_in_parallel: number; off: boolean; age_years?: number; months_since_maintenance?: number }[];
  connections: { id: number; from: number; to: number }[];
}
export type SettingsSection = 'geral' | 'tipos' | 'limites' | 'precos' | 'catalogo' | 'dados' | 'usuarios';

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
  /** versões do relatório (V1, V2...) e, depois de aplicar uma melhoria, como a fábrica estava antes dela (para listar o que mudou) */
  versions: ReportVersion[]; versionSeq: number; pendingBase: Cfg[] | null;
  /** sub-aba de Resultados e Dash ampliado (ocupa a tela toda) */
  resTab: 'relatorio' | 'comparacoes'; dashFull: boolean;
  /** versões escolhidas na comparação (null = as duas mais recentes) */
  cmp: { a: number | null; b: number | null };
  whatIf: { n: number; pct: number; over: boolean; res: WhatIfResult | null; plan: Plan | null };
  chat: ChatMsg[];
  guide: { open: boolean; min: boolean; changed: boolean; goal: boolean; chat: boolean };
  cat: string; q: string;
  manual: { type: string | null; machine: string | null };
  guideSel: number; glossTerm: string | null; glossQ: string; setSec: SettingsSection;
  /** modo servidor: null = o sistema roda sozinho no navegador */
  server: ApiSession | null; serverFactoryId: number | null; serverBusy: boolean;
  serverFactories: ServerFactory[]; serverSims: ServerSim[];
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
  /* modo servidor */
  loginServer: (url: string, username: string, password: string) => Promise<void>;
  syncCatalog: () => Promise<void>;
  listServerFactories: () => Promise<void>;
  openServerFactory: (id: number) => Promise<void>;
  saveServerFactory: (opts?: { silent?: boolean; asNew?: boolean }) => Promise<void>;
  deleteServerFactory: (id: number) => Promise<void>;
  saveVersion: () => void; discardPending: () => void; loadVersions: () => Promise<void>;
  setResTab: (t: 'relatorio' | 'comparacoes') => void; setDashFull: (v: boolean) => void;
  setCmp: (c: Partial<{ a: number | null; b: number | null }>) => void; restoreVersion: (n: number) => void;
  loadSims: () => Promise<void>;
  /** idade e manutenção das máquinas (dados de entrada da fábrica) */
  setAge: (id: string, years: number) => void;
  setMaintMonths: (id: string, months: number) => void;
  agePreset: (ids: string[], fractionOfLife: number) => void;
  doMaintenance: (id: string) => void;
}

const snapshot = (s: AppState): Snapshot => ({ nodes: s.nodes.map((n) => ({ ...n })), edges: s.edges.map((e) => ({ ...e })), seq: s.seq });
const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState & Actions>((set, get) => {
  const typeInfo: Record<string, TypeInfo> = {};
  Object.entries(TYPE_INFO_INITIAL).forEach(([k, t]) => { typeInfo[k] = { ...t, on: true }; });
  let saved: string | null = null;
  let savedServer: ApiSession | null = null;
  try {
    saved = sessionStorage.getItem('dtw_user');
    const raw = sessionStorage.getItem('dtw_api');
    if (raw) { const o = JSON.parse(raw) as ApiSession & { user?: string }; savedServer = { url: o.url, token: o.token }; saved = saved || o.user || null; }
  } catch { /* sem armazenamento: segue sem lembrar o usuário */ }

  /** Chamada ao servidor. Se o login venceu (401), sai do modo servidor e avisa. */
  const call = async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
    const sv = get().server;
    if (!sv) throw new ApiError(0, 'Você não está conectado ao servidor.');
    try { return await api<T>(sv, path, init); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { get().logout(); get().showToast('O login no servidor venceu. Entre de novo.'); }
      throw e;
    }
  };
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /** Guarda uma versão do relatório (e, se a fábrica está no servidor, também lá, como "cenário"). */
  const addVersion = (label: string, kind: ReportVersion['kind'], played?: ReportVersion['played']): ReportVersion => {
    const s = get();
    const v = { ...makeVersion(s.versionSeq + 1, label, kind, s.nodes, s.edges, ctx(), s.tariff), ...(played ? { played } : {}) };
    set({ versions: [...s.versions, v], versionSeq: v.n });
    if (s.server) {
      // a "foto" do servidor lê o desenho guardado: guarda o desenho de agora (silencioso, cria a fábrica se ainda não existe) e então tira a foto.
      // O saveServerFactory lê o desenho no mesmo instante da chamada, por isso a V1 sai com o desenho de ANTES da mudança.
      s.saveServerFactory({ silent: true })
        .then(() => call(`/factories/${get().serverFactoryId}/scenarios`, { method: 'POST', json: { name: `V${v.n} · ${v.label}`.slice(0, 100) } }))
        .catch(() => undefined);
    }
    return v;
  };
  /** Antes da primeira mudança de uma melhoria: guarda a versão "antes" (se ainda não existe) e lembra como estava. */
  const beginPending = () => {
    const s = get();
    if (s.pendingBase) return;
    const last = s.versions[s.versions.length - 1];
    if (!sameConfig(last, s.nodes)) addVersion('Antes das mudanças', 'auto');
    set({ pendingBase: cfgOf(get().nodes, get().catalog) });
  };
  /** Terminou um Play: a configuração de agora vira uma versão (ou anota o Play na versão igual que já existe). */
  const recordPlayVersion = (produced: number, durMin: number) => {
    const s = get(); const last = s.versions[s.versions.length - 1];
    const played = { produced, durMin };
    if (last && sameConfig(last, s.nodes)) set({ versions: s.versions.map((v, i) => (i === s.versions.length - 1 ? { ...v, played } : v)), pendingBase: null });
    else { addVersion(`Resultado do Play (${durMin >= 60 ? durMin / 60 + ' h' : durMin + ' min'})`, 'play', played); set({ pendingBase: null }); if (get().versions.length >= 2) set({ resTab: 'comparacoes' }); }
  };
  const fromApi = (m: ApiMachine, prev?: MachineType): MachineType => {
    const cost = m.price ? { min: m.price.min, max: m.price.max, note: m.price.note || prev?.cost.note || '', refs: (m.price.sources || []).map((r) => ({ t: r.title, u: r.url, k: r.confidence as 'real' | 'estimado' })), edited: m.price.edited_by_user }
      : (prev?.cost || { min: 0, max: 0, note: 'Sem preço estimado para esta máquina (a ficha técnica não traz preço): consulte o fabricante.', refs: [] });
    return {
      name: m.name, stage: m.stage, cat: m.category, icon: prev?.icon || m.icon, param: m.parameter, unit: m.unit,
      min: m.limits.min, max: m.limits.max, opt: m.limits.optimal, warn: m.limits.warning, crit: m.limits.failure,
      cap: m.capacity_at_optimal, sb: m.standby_kw, vr: m.variable_kw, desc: m.description ?? prev?.desc ?? '', src: null,
      flow: m.flow === 'suco' ? 'suco' : undefined, rank: m.process_order, heat: m.thermal_sensitivity as MachineType['heat'],
      multiIn: m.accepts_multiple_inputs || undefined, end: m.is_final_stage || undefined,
      basis: m.basis_of_numbers ?? prev?.basis ?? '', refs: m.sources ? m.sources.filter((r) => r.url).map((r) => ({ t: r.title, u: r.url, k: r.confidence as 'real' | 'estimado' })) : (prev?.refs || []),
      risk: m.physical_risk ?? prev?.risk ?? '', cost,
      origin: m.origin, version: m.version, maker: m.maker, model: m.model, year: m.year, family: m.family, inactive: m.active === false || undefined,
      lifeH: m.life_hours, maintH: m.maintenance_interval_hours,
    };
  };

  const ctx = (): SimContext => { const s = get(); return { catalog: s.catalog, ambient: s.ambient, estop: s.estop, run: s.run.active ? { active: true, t: s.run.t, arrivals: s.run.arrivals } : undefined }; };
  const log = (text: string, kind: LogEvent['kind'] = '') => set((s) => ({ events: [{ time: now(), text, kind }, ...s.events].slice(0, 80) }));

  return {
    user: saved, server: savedServer, serverFactoryId: null, serverBusy: false, serverFactories: [], serverSims: [], versions: [], versionSeq: 0, pendingBase: null, resTab: 'relatorio', dashFull: false, cmp: { a: null, b: null }, view: 'logic', tool: 'select', tab: 'goal', sideHidden: false, palMin: false, modal: null, toast: null,
    plantName: 'Minha fábrica', catalog: buildCatalog(), typeInfo,
    nodes: [], edges: [], seq: 1, selected: null, selEdge: null, connectFrom: null, hmiSel: null, zoom: 1,
    undoStack: [], redoStack: [], ambient: 25, tariff: 0.85, estop: false, baseline: null,
    layers: { pipes: true, energy: false }, events: [], run: newRun(),
    goal: { type: 'pct', value: 10, more: true, over: true }, goalPlan: null,
    whatIf: { n: 2, pct: 20, over: false, res: null, plan: null }, chat: [],
    guide: { open: true, min: false, changed: false, goal: false, chat: false },
    cat: 'all', q: '', manual: { type: null, machine: null }, guideSel: 0, glossTerm: null, glossQ: '', setSec: 'geral',

    login: (name) => { const user = name.trim() || 'usuário'; try { sessionStorage.setItem('dtw_user', user); } catch { /* ok */ } set({ user }); },
    logout: () => {
      try { sessionStorage.removeItem('dtw_user'); sessionStorage.removeItem('dtw_api'); } catch { /* ok */ }
      set({ user: null, server: null, serverFactoryId: null, serverFactories: [], serverSims: [], versions: [], versionSeq: 0, pendingBase: null });
    },

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
      set({ nodes: [], edges: [], selected: null, estop: false, baseline: null, goalPlan: null, hmiSel: null, serverFactoryId: null, versions: [], versionSeq: 0, pendingBase: null });
      log('Fábrica nova, em branco');
    },
    loadTemplate: (key) => {
      const s = get(); s.pushUndo();
      const f = buildFromTemplate(key, s.catalog, s.seq);
      set((st) => ({ nodes: f.nodes, edges: f.edges, seq: f.seq, selected: null, estop: false, baseline: null, goalPlan: null, hmiSel: f.nodes[0].id, serverFactoryId: null, versions: [], versionSeq: 0, pendingBase: null, plantName: f.name, guide: { ...st.guide, min: true }, view: 'logic' }));
      log(`Exemplo carregado: ${f.name}`, 'ok');
    },
    openFactory: (d) => {
      get().pushUndo();
      set((s) => ({ nodes: d.nodes.map((n) => withWear({ ...n, qty: n.qty ?? 1, off: n.off ?? false }, s.catalog[n.type])), edges: d.edges, seq: d.seq || 100, plantName: d.name || 'Fábrica aberta', selected: null, goalPlan: s.goalPlan, serverFactoryId: null, versions: [], versionSeq: 0, pendingBase: null }));
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
      beginPending();
      get().pushUndo();
      set((s) => ({ nodes: s.nodes.map((n) => (n.id === c.id ? { ...n, value: c.value, qty: c.qty, off: c.off } : n)), guide: { ...s.guide, changed: true }, view: 'logic' }));
      log('Aplicou: ' + (c.label || 'melhoria'), 'ok'); get().showToast(`Mudança aplicada no quadro. Rode a simulação para gerar a V${get().versionSeq + 1}.`);
    },
    applyPlan: (p) => {
      beginPending();
      const s = get(); s.pushUndo();
      set((st) => ({ nodes: st.nodes.map((n) => { const c = p.changes[n.id]; return c ? { ...n, value: c.value, qty: c.qty, off: c.off } : n; }), goalPlan: null, whatIf: { ...st.whatIf, res: null, plan: null }, guide: { ...st.guide, changed: true }, view: 'logic' }));
      log(`Aplicou o plano: produção ${fmt(p.before.prod)} → ${fmt(p.after.prod)} garrafas/h`, 'ok');
      get().showToast(`Plano aplicado no quadro. Rode a simulação para gerar a V${get().versionSeq + 1}.`);
    },
    setResTab: (resTab) => set({ resTab }),
    setDashFull: (dashFull) => set({ dashFull }),
    setCmp: (c) => set((s) => ({ cmp: { ...s.cmp, ...c } })),
    /** Volta o quadro para a configuração de uma versão (ritmo, unidades e liga/desliga). Antes, guarda a situação de agora para não perder nada. */
    restoreVersion: (n) => {
      const s = get(); const v = s.versions.find((x) => x.n === n);
      if (!v) return;
      if (s.run.active) s.stopRun();
      beginPending();                                    // guarda a situação de agora como versão (se ainda não existe) e lembra como estava
      get().pushUndo();
      const ids = new Set(get().nodes.map((x) => x.id));
      const sumidas = v.machines.filter((m) => !ids.has(m.id)).length;
      set((st) => ({ nodes: st.nodes.map((x) => { const m = v.machines.find((y) => y.id === x.id); return m ? withWear({ ...x, value: m.value, qty: m.qty, off: m.off, ...(m.ageYears !== undefined ? { ageYears: m.ageYears || undefined, maintMonths: m.maintMonths || undefined } : {}) }, st.catalog[x.type]) : x; }), view: 'logic' }));
      log(`Voltou para a configuração da V${n}`, 'ok');
      get().showToast(`Voltou para a configuração da V${n}.${sumidas ? ` ${sumidas} máquina(s) dela não existem mais na fábrica e não foram recriadas.` : ''} Se quiser voltar atrás, use Desfazer (Ctrl+Z).`);
    },
    /** Botão manual "Salvar versão agora". */
    saveVersion: () => {
      const s = get();
      if (!s.nodes.length) return s.showToast('Monte a fábrica antes de salvar uma versão.');
      const last = s.versions[s.versions.length - 1];
      if (sameConfig(last, s.nodes)) return s.showToast(`A V${last.n} já guarda esta mesma configuração.`);
      const v = addVersion('Salva manualmente', 'manual');
      get().showToast(`V${v.n} guardada.`);
    },
    /** Desfaz as mudanças aplicadas e ainda não simuladas (volta ritmo, quantidade e liga/desliga). */
    discardPending: () => {
      const s = get(); const base = s.pendingBase; if (!base) return;
      s.pushUndo();
      set((st) => ({ nodes: st.nodes.map((n) => { const b = base.find((x) => x.id === n.id); return b ? withWear({ ...n, value: b.value, qty: b.qty, off: b.off, ...(b.ageYears !== undefined ? { ageYears: b.ageYears || undefined, maintMonths: b.maintMonths || undefined } : {}) }, st.catalog[n.type]) : n; }), pendingBase: null }));
      log('Desfez as mudanças aplicadas', 'ok'); get().showToast('As mudanças foram desfeitas.');
    },
    /** Traz do servidor as versões guardadas (as últimas 12) para comparar também em outra sessão. */
    loadVersions: async () => {
      const fid = get().serverFactoryId; if (!get().server || fid == null) return;
      interface Sc {
        id: number; name: string; created_at: string; production_per_hour: number; max_risk: number; energy_kw: number; bottleneck_machine_id: number | null;
        machines: { machine_id: number; type: string; name: string; value: number; units_in_parallel: number; off: boolean; capacity: number; output: number }[];
      }
      const list = (await call<{ id: number }[]>(`/factories/${fid}/scenarios`)).sort((a, b) => a.id - b.id).slice(-12);
      const full = await Promise.all(list.map((x) => call<Sc>(`/factories/${fid}/scenarios/${x.id}`)));
      if (get().serverFactoryId !== fid) return;
      const tariff = get().tariff;
      const versions: ReportVersion[] = full.map((sc, i) => {
        const m = /^V(\d+) · (.*)$/.exec(sc.name);
        return {
          n: m ? Number(m[1]) : i + 1, label: m ? m[2] : sc.name, kind: 'servidor' as const,
          at: new Date(sc.created_at.endsWith('Z') ? sc.created_at : sc.created_at + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
          prod: sc.production_per_hour, risk: sc.max_risk, energy: sc.energy_kw, costPerBottle: sc.production_per_hour > 0 ? (sc.energy_kw * tariff) / sc.production_per_hour : null,
          bottleneck: sc.machines.find((x) => x.machine_id === sc.bottleneck_machine_id)?.name ?? null,
          machines: sc.machines.map((x) => ({ id: 's' + x.machine_id, type: x.type, name: x.name, value: x.value, qty: x.units_in_parallel, off: x.off, cap: x.capacity, eff: x.output })),
        };
      });
      // o servidor guarda o que cada máquina processa; o "fluxo real" (limitado pelas máquinas à frente) se calcula com as ligações de agora
      const edges = get().edges;
      versions.forEach((v) => { const f = realFlow(v.machines.map((m) => m.id), Object.fromEntries(v.machines.map((m) => [m.id, m.eff])), edges); v.machines.forEach((m) => { m.eff = f[m.id]; }); });
      set({ versions, versionSeq: Math.max(0, ...versions.map((v) => v.n)) });
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
    updateMachineLimit: (type, field, v) => {
      set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], [field]: v } } }));
      if (get().server) {
        const name = { opt: 'optimal', warn: 'warning', crit: 'failure' }[field];
        call(`/catalog/machines/${type}/limits`, { method: 'PATCH', json: { [name]: v } })
          .catch((e) => { get().showToast('O servidor recusou: ' + errText(e)); get().syncCatalog(); });
      }
    },
    setMachineCat: (type, cat) => set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], cat } } })),
    setMachinePrice: (type, f, v) => {
      set((s) => ({ catalog: { ...s.catalog, [type]: { ...s.catalog[type], cost: { ...s.catalog[type].cost, [f]: Math.max(0, v) * 1000, edited: true } } } }));
      if (get().server) {
        const c = get().catalog[type].cost;
        if (c.max >= c.min) call(`/catalog/machines/${type}/price`, { method: 'PUT', json: { min: c.min, max: c.max } }).catch((e) => get().showToast('O servidor recusou: ' + errText(e)));
      }
    },
    updateType: (id, patch) => set((s) => ({ typeInfo: { ...s.typeInfo, [id]: { ...s.typeInfo[id], ...patch } } })),
    addType: (name) => set((s) => ({ typeInfo: { ...s.typeInfo, ['t' + Date.now()]: { name, icon: 'factory', desc: 'Tipo criado por você.', on: true } } })),
    removeType: (id) => set((s) => { const t = { ...s.typeInfo }; delete t[id]; return { typeInfo: t }; }),

    loginServer: async (url, username, password) => {
      const { session, displayName } = await apiLogin(url, username, password);
      try { sessionStorage.setItem('dtw_api', JSON.stringify({ ...session, user: displayName })); localStorage.setItem('dtw_api_url', session.url); } catch { /* ok */ }
      set({ server: session, user: displayName });
      await get().syncCatalog();
      get().showToast('Conectado ao servidor. As suas fábricas ficam guardadas lá.');
    },

    /** Traz o catálogo do servidor: números ajustados, máquinas importadas de fichas técnicas e tipos novos. */
    syncCatalog: async () => {
      const [list, cats] = await Promise.all([call<ApiMachine[]>('/catalog/machines?include_inactive=true'), call<ApiCategory[]>('/catalog/categories')]);
      const novos = list.filter((m) => !get().catalog[m.code]);
      const detalhes = await Promise.all(novos.map((m) => call<ApiMachine>(`/catalog/machines/${m.code}`)));
      set((st) => {
        const catalog = { ...st.catalog };
        list.forEach((m) => { const full = detalhes.find((d) => d.code === m.code); catalog[m.code] = fromApi(full || m, catalog[m.code]); });
        // máquinas importadas que o servidor apagou ou desativou saem da lista local
        Object.keys(catalog).forEach((k) => { if (catalog[k].origin === 'importada' && !list.some((m) => m.code === k)) delete catalog[k]; });
        const typeInfo = { ...st.typeInfo };
        cats.forEach((c) => { if (!typeInfo[c.code]) typeInfo[c.code] = { name: c.name, icon: c.icon || 'factory', desc: c.description, on: c.active }; });
        return { catalog, typeInfo };
      });
    },

    listServerFactories: async () => { set({ serverFactories: await call<ServerFactory[]>('/factories') }); },

    openServerFactory: async (id) => {
      set({ serverBusy: true });
      try {
        const f = await call<ApiFactoryFull>(`/factories/${id}`);
        // máquina de um tipo que o catálogo local não conhece (ex.: criado por outro usuário): traz o tipo antes de montar o desenho
        const faltam = [...new Set(f.machines.map((m) => m.type))].filter((t) => !get().catalog[t]);
        if (faltam.length) {
          const tipos = await Promise.all(faltam.map((t) => call<ApiMachine>(`/catalog/machines/${t}`)));
          set((st) => { const catalog = { ...st.catalog }; tipos.forEach((m) => { catalog[m.code] = fromApi(m); }); return { catalog }; });
        }
        const nodes: FNode[] = f.machines.map((m) => withWear({ id: 's' + m.id, sid: m.id, type: m.type, x: m.x, y: m.y, value: m.value, qty: m.units_in_parallel, off: m.off,
          ageYears: m.age_years || undefined, maintMonths: m.months_since_maintenance || undefined }, get().catalog[m.type]));
        const edges: FEdge[] = f.connections.map((c) => ({ id: 'e' + c.id, from: 's' + c.from, to: 's' + c.to }));
        get().stopRun();
        set({ nodes, edges, plantName: f.name, ambient: f.ambient, tariff: f.tariff, estop: f.emergency_stop, serverFactoryId: f.id, selected: null, hmiSel: nodes[0]?.id ?? null,
          goalPlan: null, baseline: null, undoStack: [], redoStack: [], modal: null, view: 'logic', versions: [], versionSeq: 0, pendingBase: null });
        await get().loadSims();
        get().loadVersions().catch(() => undefined);
        log(`Fábrica aberta do servidor: ${f.name}`, 'ok');
      } catch (e) { get().showToast('Não consegui abrir: ' + errText(e)); }
      finally { set({ serverBusy: false }); }
    },

    /** Guarda a fábrica no servidor (cria na primeira vez). As máquinas que já existiam lá são atualizadas no lugar, sem perder o desgaste. */
    saveServerFactory: async (opts = {}) => {
      const s = get();
      set({ serverBusy: true });
      try {
        let fid = opts.asNew ? null : s.serverFactoryId;
        let nome = s.plantName.trim() || 'Minha fábrica';
        const nomeOriginal = nome;
        /** Nome já usado por outra fábrica sua (409): em vez de travar, guarda como uma nova versão do nome: "nome V2", "nome V3"... */
        const comNomeLivre = async <T,>(pedido: (n: string) => Promise<T>): Promise<T> => {
          for (let k = 2; ; k++) {
            try { return await pedido(nome); }
            catch (e) { if (!(e instanceof ApiError && e.status === 409) || k > 50) throw e; nome = `${nomeOriginal} V${k}`; }
          }
        };
        if (fid == null) {
          const f = await comNomeLivre((n) => call<{ id: number }>('/factories', { method: 'POST', json: { name: n, ambient: s.ambient, tariff: s.tariff } }));
          fid = f.id;
          if (s.estop) await call(`/factories/${fid}`, { method: 'PATCH', json: { emergency_stop: true } });
        } else {
          const id = fid;
          await comNomeLivre((n) => call(`/factories/${id}`, { method: 'PATCH', json: { name: n, ambient: s.ambient, tariff: s.tariff, emergency_stop: s.estop } }));
        }
        if (nome !== nomeOriginal) { set({ plantName: nome }); get().showToast(`Já existia uma fábrica chamada “${nomeOriginal}”. Esta foi guardada como a versão “${nome}”.`); }
        const keepIds = opts.asNew ? false : true;
        const res = await call<{ ids_by_ref: Record<string, number> }>(`/factories/${fid}/layout`, {
          method: 'PUT',
          json: {
            machines: s.nodes.map((n) => ({ ref: n.id, id: keepIds ? n.sid ?? null : null, type: n.type, x: Math.max(0, Math.round(n.x)), y: Math.max(0, Math.round(n.y)), value: n.value, units_in_parallel: n.qty, off: n.off,
              age_years: n.ageYears ?? 0, months_since_maintenance: n.maintMonths ?? 0 })),
            connections: s.edges.map((e) => ({ from_ref: e.from, to_ref: e.to })),
          },
        });
        set((st) => ({ serverFactoryId: fid, nodes: st.nodes.map((n) => ({ ...n, sid: res.ids_by_ref[n.id] ?? n.sid })) }));
        if (!opts.silent && nome === nomeOriginal) get().showToast('Fábrica guardada no servidor');
      } catch (e) {
        get().showToast('Não consegui guardar: ' + errText(e));
        throw e;
      } finally { set({ serverBusy: false }); }
    },

    deleteServerFactory: async (id) => {
      try {
        await call(`/factories/${id}`, { method: 'DELETE' });
        if (get().serverFactoryId === id) set({ serverFactoryId: null });
        await get().listServerFactories();
        get().showToast('Fábrica apagada do servidor');
      } catch (e) { get().showToast('Não consegui apagar: ' + errText(e)); }
    },

    loadSims: async () => {
      const fid = get().serverFactoryId;
      if (!get().server || fid == null) return set({ serverSims: [] });
      set({ serverSims: await call<ServerSim[]>(`/factories/${fid}/simulations`) });
    },

    /** Idade (anos de uso) de uma máquina. Os meses desde a manutenção não passam da idade. */
    setAge: (id, years) => {
      const s0 = get(); const n = s0.nodes.find((x) => x.id === id); if (!n || !Number.isFinite(years)) return;
      const age = Math.min(60, Math.max(0, Math.round(years * 100) / 100));
      s0.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? withWear({ ...x, ageYears: age || undefined, maintMonths: Math.min(x.maintMonths ?? 0, age * 12) || undefined }, st.catalog[x.type]) : x)) }));
      log(`${s0.catalog[n.type].name}: idade ${fmt(age, 1)} ano(s)`);
    },
    setMaintMonths: (id, months) => {
      const s0 = get(); const n = s0.nodes.find((x) => x.id === id); if (!n || !Number.isFinite(months)) return;
      const m = Math.min((n.ageYears ?? 0) * 12, Math.max(0, Math.round(months * 10) / 10));
      s0.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? withWear({ ...x, maintMonths: m || undefined }, st.catalog[x.type]) : x)) }));
      log(`${s0.catalog[n.type].name}: ${fmt(m, 1)} mês(es) desde a última manutenção`);
    },
    /** "Nova", "Meia-vida", "Velha", "Fim de vida": a idade vira essa fração da vida útil de cada máquina. */
    agePreset: (ids, fraction) => {
      const s0 = get(); s0.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => {
        if (!ids.includes(x.id)) return x;
        const age = Math.round(lifeYears(st.catalog[x.type]) * fraction * 10) / 10;
        return withWear({ ...x, ageYears: age || undefined, maintMonths: Math.min(x.maintMonths ?? 0, age * 12) || undefined }, st.catalog[x.type]);
      }) }));
      get().showToast(fraction === 0 ? 'Máquinas marcadas como novas.' : `Idade ajustada para ${fraction * 100}% da vida útil.`);
    },
    /** "Fiz a manutenção": zera os meses desde a última manutenção (a idade continua). No servidor, também registra no histórico. */
    doMaintenance: (id) => {
      const s0 = get(); const n = s0.nodes.find((x) => x.id === id); if (!n) return;
      s0.pushUndo();
      set((st) => ({ nodes: st.nodes.map((x) => (x.id === id ? withWear({ ...x, maintMonths: undefined }, st.catalog[x.type]) : x)) }));
      log(`${s0.catalog[n.type].name}: manutenção feita`, 'ok');
      get().showToast('Manutenção registrada: o tempo desde a última volta a zero.');
      if (s0.server && s0.serverFactoryId != null && n.sid) call(`/factories/${s0.serverFactoryId}/machines/${n.sid}/maintenance`, { method: 'POST', json: { kind: 'preventiva' } }).catch(() => undefined);
    },

    startOrToggleRun: () => {
      const s = get(); const r = s.run;
      if (!s.nodes.length) return get().showToast('Monte a fábrica antes de iniciar a simulação');
      if (r.on) { set({ run: { ...r, on: false } }); return log('Simulação pausada'); }
      if (!r.active || r.finished) {
        const begin = () => {
          const st = get();
          set({ run: { ...newRun(r.speed, r.dur), active: true, arrivals: computeArrivals(st.nodes, st.edges), on: true }, view: 'logic' });
          log(`Simulação iniciada (${r.dur >= 60 ? r.dur / 60 + ' h' : r.dur + ' min'} simulados)`, 'ok');
        };
        if (s.server) { s.saveServerFactory({ silent: true }).then(begin).catch((e) => get().showToast('Não deu para salvar no servidor: ' + errText(e))); return; }
        return begin();
      }
      set({ run: { ...r, on: true } });
    },
    stopRun: () => { const r = get().run; set({ run: newRun(r.speed, r.dur) }); log('Simulação parada e zerada'); },
    setRunSpeed: (speed) => set((s) => ({ run: { ...s.run, speed } })),
    setRunDur: (dur) => set((s) => ({ run: { ...s.run, dur } })),

    /** Um passo do relógio do play (chamado a cada 250 ms pelo App). */
    tickRun: () => {
      const s = get(); const r = s.run; if (!r.on) return;
      const step = advanceRun(r, s.nodes, s.edges, { catalog: s.catalog, ambient: s.ambient, estop: s.estop });
      const { t, produced, kwh, queue, announced, lastK, finished, sim } = step;
      const events: LogEvent[] = step.events.map((e) => ({ time: now(), ...e }));
      // linha do tempo para o dashboard (a conta é a mesma do play, só guardada ponto a ponto)
      const series = [...r.series, { t, produced, rate: sim.production, kwh, risk: sim.maxRisk, queue: Object.values(queue).reduce((a, b) => a + b, 0) }].slice(-400);
      const mseries = { ...r.mseries };
      s.nodes.forEach((n) => {
        const res = sim.res[n.id];
        mseries[n.id] = [...(mseries[n.id] || []), { t, out: res.eff, temp: machineTemp(s.catalog[n.type], n, res, s.ambient), risk: res.risk }].slice(-400);
      });
      if (finished) recordPlayVersion(produced, r.dur);
      if (finished && s.server && s.serverFactoryId != null) {   // guarda o resultado no servidor e envelhece as máquinas que trabalharam
        call(`/factories/${s.serverFactoryId}/play`, { method: 'POST', json: { speed: r.speed, duration_min: r.dur, save: true } })
          .then(() => get().loadSims()).catch((e) => get().showToast('Não consegui guardar a simulação no servidor: ' + errText(e)));
      }
      set((st) => ({ run: { ...r, t, produced, kwh, queue, announced, lastK, on: !finished, finished: finished || r.finished, series, mseries }, events: [...events.reverse(), ...st.events].slice(0, 80), ...(finished ? { modal: 'runresult' as ModalId } : {}) }));
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

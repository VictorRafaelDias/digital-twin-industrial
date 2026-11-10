/* Modo servidor: login, catálogo do servidor, abrir e guardar fábricas, desgaste. O servidor é simulado (fetch falso). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiLogin } from '../api/client';
import { todayISO } from '../engine/wear';
import { useStore } from './useStore';

const st = () => useStore.getState();
type Handler = (url: string, init: RequestInit) => unknown;
let calls: { url: string; method: string; body: unknown }[] = [];

function fakeServer(routes: Record<string, Handler | unknown>) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace('http://srv', '');
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url: path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${path}`;
    const hit = routes[key];
    if (hit === undefined) return new Response(JSON.stringify({ detail: `sem rota ${key}` }), { status: 404 });
    const out = typeof hit === 'function' ? (hit as Handler)(path, init) : hit;
    if (out instanceof Response) return out;
    return new Response(out === null ? null : JSON.stringify(out), { status: out === null ? 204 : 200 });
  }));
}

const apiMachine = (code: string, over: Record<string, unknown> = {}) => ({
  code, name: 'Pasteurizer D Base', category: 'termico', stage: 'Tratamento térmico', icon: 'pasteur', flow: 'geral', parameter: 'Carga (% da capacidade nominal)', unit: '%',
  limits: { min: 30, optimal: 100, warning: 110, failure: 120, max: 125 }, capacity_at_optimal: 20000, standby_kw: 2.25, variable_kw: 12.75, process_order: 4,
  thermal_sensitivity: 'none', accepts_multiple_inputs: false, is_final_stage: false, maker: 'Tetra Pak', model: 'Pasteurizer D Base', year: 2018, version: 1, family: code,
  origin: 'importada', price: null, description: 'Pasteurizador de leite.', physical_risk: 'Desgaste.', basis_of_numbers: 'Importada da ficha técnica.', sources: [], ...over,
});

beforeEach(() => {
  useStore.setState({ server: null, user: null, serverFactoryId: null, nodes: [], edges: [], undoStack: [], redoStack: [], events: [], ambient: 25, estop: false });
  st().loadTemplate('bebidas');
});
afterEach(() => { vi.unstubAllGlobals(); try { sessionStorage.clear(); } catch { /* ok */ } });

describe('modo servidor', () => {
  it('o login devolve o token e mostra o erro do servidor quando a senha está errada', async () => {
    fakeServer({ 'POST /auth/login': (_u: string, init: RequestInit) => (JSON.parse(String(init.body)).password === 'certa' ? { access_token: 'tok', user: { username: 'v', display_name: 'Victor' } } : new Response(JSON.stringify({ detail: 'Usuário ou senha incorretos.' }), { status: 401 })) });
    expect((await apiLogin('http://srv/', 'v', 'certa')).session).toEqual({ url: 'http://srv', token: 'tok' });
    await expect(apiLogin('http://srv', 'v', 'errada')).rejects.toThrow('Usuário ou senha incorretos.');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('rede'); }));
    await expect(apiLogin('http://srv', 'v', 'x')).rejects.toThrow('Não consegui falar com o servidor');
  });

  it('entrar no servidor traz as máquinas importadas e os números ajustados', async () => {
    const enchedora = { ...apiMachine('enchedora', { name: 'Enchedora', origin: 'embutida', category: 'envase' }), limits: { min: 100, optimal: 190, warning: 225, failure: 245, max: 260 }, capacity_at_optimal: 12000, standby_kw: 2.02, variable_kw: 0.53 };
    fakeServer({
      'POST /auth/login': { access_token: 'tok', user: { username: 'v', display_name: 'Victor' } },
      'GET /catalog/machines?include_inactive=true': [enchedora, apiMachine('tetra_pak_pasteurizer_d_base', { description: undefined })],
      'GET /catalog/categories': [{ code: 'termico', name: 'Térmico e gás', description: '', icon: 'pasteur', active: true }, { code: 'embalagem', name: 'Embalagem', description: 'Nova', icon: 'factory', active: true }],
      'GET /catalog/machines/tetra_pak_pasteurizer_d_base': apiMachine('tetra_pak_pasteurizer_d_base'),
    });
    await st().loginServer('http://srv', 'v', 'x');
    expect(st().server).toEqual({ url: 'http://srv', token: 'tok' });
    expect(st().user).toBe('Victor');
    expect(st().catalog.enchedora.opt).toBe(190);                         // número ajustado no servidor vale
    const nova = st().catalog.tetra_pak_pasteurizer_d_base;
    expect(nova.origin).toBe('importada');
    expect(nova.cap).toBe(20000);
    expect(nova.cost.max).toBe(0);                                        // sem preço: "consultar o fabricante"
    expect(nova.desc).toBe('Pasteurizador de leite.');
    expect(st().typeInfo.embalagem.name).toBe('Embalagem');               // tipo novo do servidor entra na lista
  });

  it('guardar cria a fábrica e manda o desenho; guardar de novo atualiza as mesmas máquinas', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    fakeServer({
      'POST /factories': { id: 7 },
      'PUT /factories/7/layout': { ids_by_ref: ids },
      'PATCH /factories/7': { id: 7 },
    });
    st().setPlantName('Minha linha');
    await st().saveServerFactory();
    expect(st().serverFactoryId).toBe(7);
    const put = calls.find((c) => c.method === 'PUT')!.body as { machines: { ref: string; id: number | null; type: string }[]; connections: unknown[] };
    expect(put.machines).toHaveLength(8);
    expect(put.machines.every((m) => m.id === null)).toBe(true);        // a primeira vez: tudo novo
    expect(put.connections).toHaveLength(7);
    expect(st().nodes.every((n) => typeof n.sid === 'number')).toBe(true);   // o servidor devolveu os ids
    await st().saveServerFactory({ silent: true });                     // segunda vez: PATCH da fábrica e as mesmas máquinas
    const put2 = calls.filter((c) => c.method === 'PUT')[1].body as { machines: { id: number | null }[] };
    expect(put2.machines.map((m) => m.id)).toEqual(Object.values(ids));
    expect(calls.some((c) => c.method === 'PATCH' && c.url === '/factories/7')).toBe(true);
  });

  it('nome já usado por outra fábrica sua não trava: guarda como "nome V2" e avisa', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    const tentativas: string[] = [];
    fakeServer({
      'POST /factories': (_u: string, init: RequestInit) => {
        const nome = JSON.parse(String(init.body)).name as string; tentativas.push(nome);
        return nome.endsWith('V3') ? { id: 8 } : new Response(JSON.stringify({ detail: { message: 'Você já tem uma fábrica com esse nome.' } }), { status: 409 });
      },
      'PUT /factories/8/layout': { ids_by_ref: ids },
    });
    st().setPlantName('Exemplo: bebidas');
    await st().saveServerFactory();
    expect(tentativas).toEqual(['Exemplo: bebidas', 'Exemplo: bebidas V2', 'Exemplo: bebidas V3']);
    expect(st().serverFactoryId).toBe(8);
    expect(st().plantName).toBe('Exemplo: bebidas V3');
    expect(st().toast).toContain('Já existia');
  });

  it('abrir uma fábrica do servidor monta o desenho, a temperatura e o desgaste', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    fakeServer({
      'GET /factories/9': {
        id: 9, name: 'Do servidor', ambient: 32, tariff: 1.1, emergency_stop: false,
        machines: [{ id: 41, type: 'tanque_agua', x: 10, y: 20, value: 8, units_in_parallel: 1, off: false }, { id: 42, type: 'enchedora', x: 200, y: 20, value: 200, units_in_parallel: 2, off: true, age_years: 3.75, last_maintenance_date: '2025-11-03' }],
        connections: [{ id: 5, from: 41, to: 42 }],
      },
      'GET /factories/9/simulations': [],
    });
    await st().openServerFactory(9);
    const s = st();
    expect(s.plantName).toBe('Do servidor');
    expect([s.ambient, s.tariff, s.serverFactoryId]).toEqual([32, 1.1, 9]);
    expect(s.nodes.map((n) => [n.id, n.sid, n.qty, n.off])).toEqual([['s41', 41, 1, false], ['s42', 42, 2, true]]);
    expect(s.edges).toEqual([{ id: 'e5', from: 's41', to: 's42' }]);
    // idade e manutenção vêm do servidor: enchedora (vida de 25.000 h) com 3,75 anos (60%) e última manutenção há mais de 1 ano (atrasada)
    expect([s.nodes[1].ageYears, s.nodes[1].maintDate]).toEqual([3.75, '2025-11-03']);
    expect(s.nodes[1].wearCap).toBeCloseTo(1 - 0.2 * 0.6 - 0.05);       // vira capacidade menor, risco maior e temperatura maior na simulação
    expect(s.nodes[1].wearRisk).toBeCloseTo(0.08 * 0.36 + 0.04);
    expect(s.nodes[1].wearTemp).toBeCloseTo(8 * 0.36 + 4);
    expect(s.nodes[0].ageYears).toBeUndefined();                        // máquina nova: sem campos de desgaste
    expect(s.nodes[0].wearCap).toBeUndefined();
  });

  it('abrir fábrica com máquina de um tipo que o catálogo local não conhece busca o tipo antes de montar', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    expect(st().catalog.tipo_de_outro_usuario).toBeUndefined();
    fakeServer({
      'GET /factories/3': { id: 3, name: 'Com tipo novo', ambient: 25, tariff: 0.85, emergency_stop: false, machines: [{ id: 1, type: 'tipo_de_outro_usuario', x: 0, y: 0, value: 50, units_in_parallel: 1, off: false }], connections: [] },
      'GET /catalog/machines/tipo_de_outro_usuario': apiMachine('tipo_de_outro_usuario', { name: 'Tipo de outro usuário' }),
      'GET /factories/3/simulations': [],
    });
    await st().openServerFactory(3);
    expect(st().catalog.tipo_de_outro_usuario.name).toBe('Tipo de outro usuário');
    expect(st().nodes).toHaveLength(1);
    expect(st().nodes[0].type).toBe('tipo_de_outro_usuario');
  });

  it('tipo desativado no servidor continua no catálogo local (para as fábricas antigas), marcado como inativo', async () => {
    fakeServer({
      'POST /auth/login': { access_token: 'tok', user: { username: 'v', display_name: 'Victor' } },
      'GET /catalog/machines?include_inactive=true': [apiMachine('velha', { active: false, name: 'Velha' }), apiMachine('nova', { name: 'Nova' })],
      'GET /catalog/categories': [],
      'GET /catalog/machines/velha': apiMachine('velha', { active: false, name: 'Velha' }),
      'GET /catalog/machines/nova': apiMachine('nova', { name: 'Nova' }),
    });
    await st().loginServer('http://srv', 'v', 'x');
    expect(st().catalog.velha.inactive).toBe(true);
    expect(st().catalog.nova.inactive).toBeUndefined();
  });

  it('no servidor, aplicar uma melhoria guarda a fábrica e a V1 (com o desenho de antes da mudança)', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    const layouts: { machines: { type: string; units_in_parallel: number }[] }[] = [];
    fakeServer({
      'POST /factories': { id: 5 },
      'PUT /factories/5/layout': (_u: string, init: RequestInit) => { layouts.push(JSON.parse(String(init.body))); return { ids_by_ref: ids }; },
      'POST /factories/5/scenarios': {},
    });
    const e = st().nodes.find((n) => n.type === 'enchedora')!;
    st().applyChange({ id: e.id, value: e.value, qty: 3, off: false });
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/factories/5/scenarios')).toBe(true));
    expect(calls.find((c) => c.url === '/factories/5/scenarios')!.body).toEqual({ name: 'V1 · Antes das mudanças' });
    expect(layouts[0].machines.find((m) => m.type === 'enchedora')!.units_in_parallel).toBe(1);   // o desenho guardado é o de antes
    expect(st().nodes.find((n) => n.type === 'enchedora')!.qty).toBe(3);
  });

  it('abrir uma fábrica do servidor traz as versões guardadas (V1, V2) com o fluxo real', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' } });
    const sc = (id: number, name: string, prod: number, qty: number) => ({
      id, name, created_at: '2026-11-03T10:00:00', production_per_hour: prod, max_risk: 0.02, energy_kw: 20, bottleneck_machine_id: 42, ambient: 25,
      machines: [{ machine_id: 41, type: 'tanque_agua', name: 'Tanque de água', value: 8, units_in_parallel: 1, off: false, capacity: 16000, output: 16000 },
        { machine_id: 42, type: 'enchedora', name: 'Enchedora', value: 200, units_in_parallel: qty, off: false, capacity: 12000 * qty, output: prod }],
    });
    fakeServer({
      'GET /factories/9': { id: 9, name: 'F', ambient: 25, tariff: 1, emergency_stop: false, machines: [{ id: 41, type: 'tanque_agua', x: 0, y: 0, value: 8, units_in_parallel: 1, off: false }, { id: 42, type: 'enchedora', x: 200, y: 0, value: 200, units_in_parallel: 2, off: false }], connections: [{ id: 1, from: 41, to: 42 }] },
      'GET /factories/9/simulations': [],
      'GET /factories/9/scenarios': [{ id: 2 }, { id: 1 }],
      'GET /factories/9/scenarios/1': sc(1, 'V1 · Antes das mudanças', 12000, 1),
      'GET /factories/9/scenarios/2': sc(2, 'V2 · Resultado do Play (30 min)', 20000, 2),
    });
    await st().openServerFactory(9);
    await vi.waitFor(() => expect(st().versions).toHaveLength(2));
    const [v1, v2] = st().versions;
    expect([v1.n, v1.label, v2.n, v2.label]).toEqual([1, 'Antes das mudanças', 2, 'Resultado do Play (30 min)']);
    expect(v2.bottleneck).toBe('Enchedora');
    expect(v1.machines[0].eff).toBe(12000);               // o tanque passa só o que a enchedora absorve (antes dizia 16.000)
    expect(st().versionSeq).toBe(2);
  });

  it('idade e data da manutenção vão para o servidor ao guardar, e "Fiz a manutenção" põe a data de hoje e registra no histórico', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' }, serverFactoryId: 9 });
    useStore.setState((s) => ({ nodes: s.nodes.map((n, i) => ({ ...n, sid: 100 + i })) }));
    const alvo = st().nodes.find((n) => n.type === 'enchedora')!;
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    fakeServer({
      'PATCH /factories/9': {}, 'PUT /factories/9/layout': { ids_by_ref: ids },
      [`POST /factories/9/machines/${alvo.sid}/maintenance`]: {},
    });
    st().setAge(alvo.id, 3.75);
    st().setMaintDate(alvo.id, '2025-11-03');
    expect(st().nodes.find((n) => n.id === alvo.id)!.wearCap).toBeLessThan(1);
    await st().saveServerFactory({ silent: true });
    const put = calls.find((c) => c.method === 'PUT')!.body as { machines: { ref: string; age_years: number; last_maintenance_date: string | null }[] };
    expect(put.machines.find((m) => m.ref === alvo.id)).toMatchObject({ age_years: 3.75, last_maintenance_date: '2025-11-03' });
    expect(put.machines.filter((m) => m.age_years === 0 && m.last_maintenance_date === null)).toHaveLength(7);       // as outras continuam novas
    st().doMaintenance(alvo.id);
    expect(st().nodes.find((n) => n.id === alvo.id)!.maintDate).toBe(todayISO());
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/maintenance') && (c.body as { kind: string }).kind === 'preventiva')).toBe(true));
  });

  it('o Play não manda mais envelhecer as máquinas', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' }, serverFactoryId: 9 });
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    fakeServer({ 'PATCH /factories/9': {}, 'PUT /factories/9/layout': { ids_by_ref: ids }, 'POST /factories/9/play': { id: 1 }, 'GET /factories/9/simulations': [] });
    st().setRunSpeed(60); st().setRunDur(30);
    st().startOrToggleRun();
    await vi.waitFor(() => expect(st().run.active).toBe(true));
    for (let i = 0; i < 4; i++) st().tickRun();
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/factories/9/play')).toBe(true));
    expect(calls.find((c) => c.url === '/factories/9/play')!.body).not.toHaveProperty('apply_wear');
    st().stopRun();                                                     // não deixa o Play ligado para o próximo teste
  });

  it('login vencido (401) sai do modo servidor', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 'velho' }, user: 'v' });
    fakeServer({ 'GET /factories': new Response(JSON.stringify({ detail: 'Entre com seu usuário e senha' }), { status: 401 }) });
    await expect(st().listServerFactories()).rejects.toThrow();
    expect(st().server).toBeNull();
    expect(st().user).toBeNull();
  });

  it('o play guarda o resultado no servidor quando termina e, antes de começar, guarda a fábrica', async () => {
    useStore.setState({ server: { url: 'http://srv', token: 't' }, serverFactoryId: 9 });
    const ids = Object.fromEntries(st().nodes.map((n, i) => [n.id, 100 + i]));
    fakeServer({
      'PATCH /factories/9': {}, 'PUT /factories/9/layout': { ids_by_ref: ids },
      'POST /factories/9/play': { id: 1 }, 'GET /factories/9/simulations': [{ id: 1, started_at: '2026-11-03T10:00:00', speed: 60, duration_min: 30, produced: 100, pct_of_best: 50, energy_kwh: 1, finished: true }],
    });
    st().setRunSpeed(60); st().setRunDur(30);
    st().startOrToggleRun();
    await vi.waitFor(() => expect(st().run.active).toBe(true));
    expect(calls[0].method).toBe('PATCH');                               // guardou antes de começar
    for (let i = 0; i < 4; i++) st().tickRun();                          // 4 passos de 15 min cobrem os 30 min
    expect(st().run.finished).toBe(true);
    expect(st().run.series.length).toBeGreaterThan(1);                   // e a linha do tempo do dashboard ficou guardada
    expect(Object.keys(st().run.mseries)).toHaveLength(8);
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/factories/9/play')).toBe(true));
    expect(calls.find((c) => c.url === '/factories/9/play')!.body).toEqual({ speed: 60, duration_min: 30, save: true });
    await vi.waitFor(() => expect(st().serverSims).toHaveLength(1));
  });
});

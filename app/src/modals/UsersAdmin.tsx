/* Configurações › Usuários: quem está cadastrado no servidor. Sem perfis (decisão do projeto): quem está dentro pode cadastrar gente nova
   e ativar/desativar contas. Ninguém é apagado: desativar só impede de entrar. */
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Chip } from '../components/Shared';
import { useStore } from '../store/useStore';

interface UserRow { id: number; username: string; display_name: string; active: boolean; created_at: string; last_login_at: string | null; factories: number; is_me: boolean }

const quando = (iso: string | null) => (iso ? new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca entrou');

export function UsersAdmin() {
  const server = useStore((s) => s.server);
  const { showToast } = useStore.getState();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [form, setForm] = useState({ username: '', display_name: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (server) api<UserRow[]>(server, '/users').then(setRows).catch((e) => setErr(e instanceof Error ? e.message : String(e))); };
  useEffect(load, [server]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!server) {
    return (
      <>
        <h3>Usuários</h3>
        <p className="d">Aqui você vê quem está cadastrado no servidor e cadastra gente nova.</p>
        <div className="say warn">Isto usa o servidor (back-end). Saia e entre de novo marcando <b>“Usar o servidor”</b> na tela de login.</div>
      </>
    );
  }

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const u = await api<UserRow>(server, '/users', { method: 'POST', json: { username: form.username.trim(), display_name: form.display_name.trim() || undefined, password: form.password } });
      setForm({ username: '', display_name: '', password: '' });
      showToast(`Usuário “${u.username}” cadastrado. Ele já pode entrar com a senha que você definiu.`);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const toggle = async (u: UserRow) => {
    setBusy(true); setErr('');
    try { await api(server, `/users/${u.id}`, { method: 'PATCH', json: { active: !u.active } }); showToast(u.active ? `“${u.username}” foi desativado e não consegue mais entrar.` : `“${u.username}” foi reativado.`); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const pronto = form.username.trim().length >= 3 && form.password.length >= 6;

  return (
    <>
      <h3>Usuários</h3>
      <p className="d">Quem tem conta neste servidor. <b>Por enquanto não há perfis</b>: qualquer pessoa que esteja dentro pode cadastrar gente nova e ativar ou desativar contas. Cada pessoa só enxerga as próprias fábricas.</p>
      {err && <div className="say warn">{err}</div>}
      <table className="t"><thead><tr><th>Nome</th><th>Login</th><th>Fábricas</th><th>Último acesso</th><th>Situação</th><th /></tr></thead><tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>{u.display_name}{u.is_me && <> <Chip kind="info">você</Chip></>}</td>
            <td><code>{u.username}</code></td>
            <td>{u.factories}</td>
            <td>{quando(u.last_login_at)}</td>
            <td>{u.active ? <Chip kind="ok">ativo</Chip> : <Chip kind="warn">desativado</Chip>}</td>
            <td>{!u.is_me && <button className="btn sec" style={{ padding: '5px 12px', fontSize: 12 }} disabled={busy} onClick={() => toggle(u)}>{u.active ? 'Desativar' : 'Reativar'}</button>}</td>
          </tr>
        ))}
      </tbody></table>
      <h4 className="gsub">Cadastrar um usuário novo</h4>
      <div className="field"><label>Login (letras, números, ponto, hífen; mínimo 3)</label><input className="in" style={{ width: 280 }} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ex.: maria.souza" /></div>
      <div className="field"><label>Nome mostrado (opcional)</label><input className="in" style={{ width: 280 }} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="ex.: Maria Souza" /></div>
      <div className="field"><label>Senha inicial (mínimo 6 caracteres)</label><input className="in" style={{ width: 280 }} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
      <button className="btn" disabled={busy || !pronto} onClick={create}>Cadastrar usuário</button>
      <p className="d" style={{ marginTop: 10 }}>Passe o login e a senha para a pessoa por um canal seguro. O servidor nunca guarda a senha em texto: só uma versão embaralhada (PBKDF2-SHA256).</p>
    </>
  );
}

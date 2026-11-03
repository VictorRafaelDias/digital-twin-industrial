import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

const stored = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Login. Sem servidor, nenhuma senha é verificada (demonstração). Com servidor, o usuário e a senha são conferidos no back-end. */
export function LoginScreen() {
  const login = useStore((s) => s.login);
  const loginServer = useStore((s) => s.loginServer);
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined) || '';
  const [useServer, setUseServer] = useState(() => stored('dtw_use_server') === '1' || !!envUrl);
  const [url, setUrl] = useState(() => stored('dtw_api_url') || envUrl || 'http://127.0.0.1:8000');
  const [user, setUser] = useState('victor.dias');
  const [pass, setPass] = useState('senha1234');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    if (!useServer) return login(user);
    setBusy(true); setErr('');
    try { await loginServer(url, user, pass); try { localStorage.setItem('dtw_use_server', '1'); } catch { /* ok */ } }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const toggle = (on: boolean) => { setUseServer(on); setErr(''); try { localStorage.setItem('dtw_use_server', on ? '1' : '0'); } catch { /* ok */ } };

  return (
    <div className="login open">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Icon name="factory" size={24} /><h2 style={{ margin: 0 }}>Digital Twin <span style={{ color: '#1C7293' }}>Industrial</span></h2></div>
        <p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>Entre para montar e simular a sua fábrica.</p>
        <label className="chk" style={{ marginBottom: 10 }}>
          <input type="checkbox" checked={useServer} onChange={(e) => toggle(e.target.checked)} />
          <span><b>Usar o servidor</b> (back-end): fábricas guardadas, desgaste das máquinas e importação de fichas técnicas</span>
        </label>
        {useServer && <div className="field"><label>Endereço do servidor</label><input type="text" value={url} autoComplete="off" onChange={(e) => setUrl(e.target.value)} /></div>}
        <div className="field"><label>Usuário</label><input type="text" value={user} autoComplete="off" onChange={(e) => setUser(e.target.value)} /></div>
        <div className="field"><label>Senha</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enter(); }} /></div>
        {err && <div className="say bad" role="alert" style={{ marginBottom: 10 }}>{err}</div>}
        <button className="btn block" style={{ padding: 11 }} disabled={busy} onClick={enter}>{busy ? 'Entrando…' : useServer ? 'Entrar no servidor' : 'Entrar'}</button>
        {useServer && <button className="btn sec block" style={{ padding: 9, marginTop: 8 }} onClick={() => login(user)}>Entrar sem servidor (demonstração)</button>}
        <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          {useServer ? <>Para ligar o servidor: <code>cd backend</code> e <code>python -m uvicorn app.main:app</code>. Usuário de demonstração: victor.dias / senha1234.</> : 'Sem servidor: nenhuma senha é verificada de verdade e nada fica guardado.'}
        </p>
      </div>
    </div>
  );
}

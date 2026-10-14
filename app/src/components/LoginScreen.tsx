import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

/** Login simples (usuário e senha). Sem perfis, 2 fatores ou auditoria: é uma simulação. */
export function LoginScreen() {
  const login = useStore((s) => s.login);
  const [user, setUser] = useState('victor.dias');
  const [pass, setPass] = useState('senha1234');
  return (
    <div className="login open">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><Icon name="factory" size={24} /><h2 style={{ margin: 0 }}>Digital Twin <span style={{ color: '#1C7293' }}>Industrial</span></h2></div>
        <p style={{ color: 'var(--muted)', margin: '0 0 18px' }}>Entre para montar e simular a sua fábrica.</p>
        <div className="field"><label>Usuário</label><input type="text" value={user} autoComplete="off" onChange={(e) => setUser(e.target.value)} /></div>
        <div className="field"><label>Senha</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') login(user); }} /></div>
        <button className="btn block" style={{ padding: 11 }} onClick={() => login(user)}>Entrar</button>
        <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>Protótipo: nenhuma senha é verificada de verdade.</p>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

/** Janela por cima da tela: fecha no ×, no clique fora ou na tecla Esc (tratada no App). */
export function Modal({ title, wide = false, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay open" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="mh"><span>{title}</span><button onClick={onClose}>&times;</button></div>
        {children}
      </div>
    </div>
  );
}

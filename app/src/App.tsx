import { useEffect } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { MenuBar } from './components/MenuBar';
import { Palette } from './components/Palette';
import { SidePanel } from './components/SidePanel';
import { Toolbar } from './components/Toolbar';
import { HELP_VIEWS, ViewBar } from './components/ViewBar';
import { TICK_MS } from './engine/run';
import { Modals } from './modals/Modals';
import { useStore } from './store/useStore';
import { HmiView } from './views/HmiView';
import { GlossaryView, GuideView, ManualView } from './views/HelpViews';
import { MontarView } from './views/MontarView';
import { PhysicalView } from './views/PhysicalView';
import { ResultsView } from './views/ResultsView';

export default function App() {
  const user = useStore((s) => s.user);
  const view = useStore((s) => s.view);
  const sideHidden = useStore((s) => s.sideHidden);
  const palMin = useStore((s) => s.palMin);
  const toast = useStore((s) => s.toast);
  const toggleSide = useStore((s) => s.toggleSide);
  const togglePal = useStore((s) => s.togglePal);

  // relógio do play
  useEffect(() => {
    const id = setInterval(() => useStore.getState().tickRun(), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const views = { F1: 'logic', F2: 'physical', F3: 'hmi', F4: 'dashboard' } as const;
      if (e.key in views) { e.preventDefault(); st.setView(views[e.key as keyof typeof views]); }
      else if (e.key === 'F9') { e.preventDefault(); st.toggleSide(); }
      else if (e.key === 'z' && e.ctrlKey && !typing) { e.preventDefault(); st.undo(); }
      else if (e.key === 'y' && e.ctrlKey && !typing) { e.preventDefault(); st.redo(); }
      else if (e.key === 'Delete' && st.selected && !typing) st.removeNode(st.selected);
      else if (e.key === 'Escape') { st.openModal(null); st.select(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const help = HELP_VIEWS.includes(view);
  const noSide = sideHidden || help;
  const noPal = view !== 'logic' || palMin;

  return (
    <>
      <div id="app" className={noPal ? 'nopal' : ''}>
        <MenuBar />
        <Toolbar />
        <ViewBar />
        <main className={'workspace' + (noSide ? ' noside' : '')}>
          <div className="stage">
            {view === 'logic' && <MontarView />}
            {view === 'physical' && <PhysicalView />}
            {view === 'hmi' && <HmiView />}
            {view === 'dashboard' && <ResultsView />}
            {view === 'guide' && <GuideView />}
            {view === 'manual' && <ManualView />}
            {view === 'glossary' && <GlossaryView />}
          </div>
          {!noSide && <aside className="side"><SidePanel /></aside>}
        </main>
        {view === 'logic' && !palMin && <footer className="bottom"><Palette /></footer>}
      </div>
      {!help && <button className={'sidehandle' + (sideHidden ? ' min' : '')} style={{ display: 'flex' }} title={sideHidden ? 'Mostrar o painel lateral' : 'Esconder o painel lateral'} onClick={toggleSide}>{sideHidden ? '◂' : '▸'}</button>}
      {view === 'logic' && <button className={'palhandle' + (palMin ? ' min' : '')} onClick={togglePal}>{palMin ? '▴ Máquinas' : '▾ Esconder máquinas'}</button>}
      <Modals />
      {!user && <LoginScreen />}
      <div className={'toast' + (toast ? ' show' : '')}>{toast}</div>
    </>
  );
}

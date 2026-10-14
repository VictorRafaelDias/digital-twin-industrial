import { Fragment, type ReactNode } from 'react';
import { GLOSS, type GlossEntry } from '../data/glossary';
import { useStore } from '../store/useStore';

/* Texto com marcação simples (<b>, <i>, <br>) e, opcionalmente, palavras difíceis sublinhadas
   (passe o mouse: explicação; clique: abre o Glossário). Evita dangerouslySetInnerHTML nos textos. */

const ITEMS: [string, GlossEntry][] = GLOSS.flatMap((g) => g.k.map((k) => [k, g] as [string, GlossEntry])).sort((a, b) => b[0].length - a[0].length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERM_RE = new RegExp('(?<![\\p{L}\\p{N}])(' + ITEMS.map((x) => escapeRe(x[0])).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
const findEntry = (w: string): GlossEntry => ITEMS.find((x) => x[0].toLowerCase() === w.toLowerCase())![1];

function Term({ entry, children }: { entry: GlossEntry; children: ReactNode }) {
  const openGlossary = useStore((s) => s.openGlossary);
  return <span className="term" title={entry.d + ' (clique para abrir o glossário)'} onClick={() => openGlossary(entry.t)}>{children}</span>;
}

/** Sublinha a 1ª ocorrência de cada termo do glossário dentro de um trecho de texto. */
function withTerms(text: string, seen: Set<string>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null;
  TERM_RE.lastIndex = 0;
  while ((m = TERM_RE.exec(text))) {
    const entry = findEntry(m[1]);
    if (seen.has(entry.t)) continue;
    seen.add(entry.t);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Term key={m.index} entry={entry}>{m[1]}</Term>);
    last = m.index + m[1].length;
  }
  out.push(text.slice(last));
  return out;
}

export function Rich({ text, terms = false }: { text: string; terms?: boolean }) {
  const seen = new Set<string>();
  const root: ReactNode[] = [];
  const stack: { tag: 'b' | 'i'; kids: ReactNode[] }[] = [];
  const push = (n: ReactNode) => (stack.length ? stack[stack.length - 1].kids : root).push(n);
  let key = 0;
  text.split(/(<\/?b>|<\/?i>|<br\s*\/?>)/).forEach((tok) => {
    if (!tok) return;
    if (tok === '<b>' || tok === '<i>') stack.push({ tag: tok.slice(1, 2) as 'b' | 'i', kids: [] });
    else if (tok === '</b>' || tok === '</i>') {
      const top = stack.pop();
      if (top) push(top.tag === 'b' ? <b key={key++}>{top.kids}</b> : <i key={key++}>{top.kids}</i>);
    } else if (/^<br/.test(tok)) push(<br key={key++} />);
    else push(<Fragment key={key++}>{terms ? withTerms(tok, seen) : tok}</Fragment>);
  });
  while (stack.length) { const top = stack.pop()!; push(top.tag === 'b' ? <b key={key++}>{top.kids}</b> : <i key={key++}>{top.kids}</i>); }
  return <>{root}</>;
}

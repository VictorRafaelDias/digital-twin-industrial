import { ICONS } from '../data/icons';

/** Ícone SVG de linha. Os desenhos vêm de constantes do projeto (src/data/icons.ts), nunca de entrada do usuário. */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg className="i" viewBox="0 0 24 24" width={size} height={size} dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />;
}

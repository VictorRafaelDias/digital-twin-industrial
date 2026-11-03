/* Cliente do back-end (FastAPI). Só é usado no "modo servidor": sem ele o sistema roda sozinho no navegador. */

export interface ApiSession { url: string; token: string }

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) { super(message); this.status = status; this.detail = detail; }
}

const clean = (url: string) => url.trim().replace(/\/+$/, '');

/** Tira uma mensagem legível do erro que a API devolve (ela usa {detail: {message}} ou {detail: "texto"} ou a lista do pydantic). */
function messageOf(status: number, body: unknown): string {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && !Array.isArray(d) && typeof (d as { message?: unknown }).message === 'string') return (d as { message: string }).message;
  if (Array.isArray(d) && d.length) {
    const e = d[0] as { loc?: unknown[]; msg?: string };
    return `${(e.loc || []).slice(1).join('.') || 'valor'}: ${e.msg ?? 'inválido'}`;
  }
  return `Erro ${status}`;
}

export async function api<T = unknown>(s: ApiSession, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${s.token}`, ...(init.headers as Record<string, string> | undefined) };
  let body = init.body;
  if (init.json !== undefined) { body = JSON.stringify(init.json); headers['Content-Type'] = 'application/json'; }
  let res: Response;
  try { res = await fetch(clean(s.url) + path, { ...init, headers, body }); }
  catch { throw new ApiError(0, 'Não consegui falar com o servidor. Ele está ligado?'); }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageOf(res.status, data), (data as { detail?: unknown } | null)?.detail);
  return data as T;
}

/** Entra no servidor: devolve o token e o usuário. */
export async function apiLogin(url: string, username: string, password: string): Promise<{ session: ApiSession; displayName: string }> {
  let res: Response;
  try {
    res = await fetch(clean(url) + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  } catch { throw new ApiError(0, 'Não consegui falar com o servidor. Ele está ligado? Confira o endereço.'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageOf(res.status, data));
  return { session: { url: clean(url), token: data.access_token }, displayName: data.user.display_name || data.user.username };
}

export const apiHealth = async (url: string): Promise<boolean> => {
  try { return (await fetch(clean(url) + '/health')).ok; } catch { return false; }
};

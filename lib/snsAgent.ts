// 직원 PC 의 SNS_Manager(localhost:5555) 호출 — 브라우저에서만. 메일 발송·회신 확인·계정 확인은 전부 본인 PC 에서 본인 네이버 계정으로
export const AGENT = 'http://localhost:5555';
export type AgentHealth = { up: boolean; mailWh: boolean; autoPull: boolean; mailHtml: boolean; build?: string };

export async function agentHealth(): Promise<AgentHealth> {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 2500);
    const r = await fetch(`${AGENT}/health`, { signal: c.signal, cache: 'no-store' }); clearTimeout(t);
    const j = await r.json(); return { up: !!j?.ok, mailWh: !!j?.mail_wh, autoPull: !!j?.wh_auto, mailHtml: !!j?.mail_html, build: j?.build };
  } catch { return { up: false, mailWh: false, autoPull: false, mailHtml: false }; }
}

export async function agentPost<T = any>(path: string, body: any, timeoutMs = 30_000): Promise<T> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(`${AGENT}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: c.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}

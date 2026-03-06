import { emitProgress } from '../config/progress';

export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/+$/, '');
}

export async function fetchViaJina(
  url: string,
  options?: { withLinks?: boolean }
): Promise<string | null> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers: Record<string, string> = { Accept: 'text/plain' };
  if (process.env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
  }
  if (options?.withLinks) {
    headers['X-With-Links-Summary'] = 'all';
  }

  try {
    const response = await fetch(jinaUrl, { headers });
    if (!response.ok) {
      emitProgress(`[jina] FAILED ${url} — status ${response.status}`);
      return null;
    }
    const text = await response.text();
    emitProgress(`[jina] Fetched ${url} — ${text.length.toLocaleString()} chars`);
    return text;
  } catch (err) {
    emitProgress(`[jina] ERROR ${url} — ${err}`);
    return null;
  }
}

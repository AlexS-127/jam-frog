import { app, ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The jam report's one network call: Gemini, from the main process so the API key never reaches the page.
// The key comes from GEMINI_API_KEY (environment) or app/.env.local (git-ignored). Without a key the app
// makes no network calls and the report is written locally.
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const TIMEOUT_MS = 15000;

function readEnvFile(): Record<string, string> {
  try {
    const text = readFileSync(path.join(app.getAppPath(), '.env.local'), 'utf8');
    return Object.fromEntries(
      text.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter((m) => m !== null).map((m) => [m![1], m![2]]),
    );
  } catch {
    return {};
  }
}

function config(): { key: string | null; model: string } {
  const env = readEnvFile();
  return {
    key: process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || null,
    model: process.env.GEMINI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL,
  };
}

export function startGemini(): void {
  ipcMain.handle('gemini:available', () => config().key !== null);
  ipcMain.handle('gemini:generate', async (_e, body: unknown) => {
    const { key, model } = config();
    if (!key) return { error: 'No Gemini API key (set GEMINI_API_KEY in app/.env.local)' };
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) return { error: json.error?.message ?? `Gemini HTTP ${res.status}` };
      return { response: json };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

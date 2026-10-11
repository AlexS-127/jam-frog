import { contextBridge, ipcRenderer } from 'electron';

// Exposed to the renderer as window.jamFrog (typed in src/renderer/env.d.ts).
contextBridge.exposeInMainWorld('jamFrog', {
  platform: process.platform,
  osc: {
    send: (address: string, ...args: number[]) => ipcRenderer.send('osc:send', address, args),
    onMessage: (cb: (msg: unknown[]) => void) => {
      ipcRenderer.on('osc:message', (_e, msg: unknown[]) => cb(msg));
    },
    onError: (cb: (text: string) => void) => {
      ipcRenderer.on('osc:error', (_e, text: string) => cb(text));
    },
  },
  gemini: {
    available: (): Promise<boolean> => ipcRenderer.invoke('gemini:available'),
    generate: (body: unknown): Promise<{ response?: unknown; error?: string }> => ipcRenderer.invoke('gemini:generate', body),
  },
});

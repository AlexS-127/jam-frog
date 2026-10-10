import { contextBridge, ipcRenderer } from 'electron';

// Exposed to the renderer as window.jamFrog (typed in src/renderer/env.d.ts).
contextBridge.exposeInMainWorld('jamFrog', {
  platform: process.platform,
  /** Keep: asks where to save and writes the .mid; resolves to the path, or null if cancelled */
  saveMidi: (bytes: Uint8Array, fileName: string): Promise<string | null> =>
    ipcRenderer.invoke('keep:save', bytes, fileName),
  osc: {
    send: (address: string, ...args: number[]) => ipcRenderer.send('osc:send', address, args),
    onMessage: (cb: (msg: unknown[]) => void) => {
      ipcRenderer.on('osc:message', (_e, msg: unknown[]) => cb(msg));
    },
    onError: (cb: (text: string) => void) => {
      ipcRenderer.on('osc:error', (_e, text: string) => cb(text));
    },
  },
});

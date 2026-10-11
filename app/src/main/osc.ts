import { ipcMain, type WebContents } from 'electron';
import { Client, Server } from 'node-osc';

// OSC bridge to the Max for Live devices. Localhost only.
// Frog Ear / Frog Voice -> app on 9001 (/note, /tempo, /bar); app -> Frog Voice on 9002 (/note, /genre).
export const OSC_IN_PORT = 9001;
export const OSC_OUT_PORT = 9002;
const HOST = '127.0.0.1';

export function startOsc(web: WebContents): void {
  const server = new Server(OSC_IN_PORT, HOST);
  const client = new Client(HOST, OSC_OUT_PORT);

  server.on('message', (msg: unknown[]) => {
    if (!web.isDestroyed()) web.send('osc:message', msg);
  });
  server.on('error', (err: Error) => {
    console.error(`[osc] server error: ${err.message}`);
    if (!web.isDestroyed()) web.send('osc:error', `Port ${OSC_IN_PORT}: ${err.message}`);
  });
  client.on('error', (err: Error) => console.error(`[osc] client error: ${err.message}`));

  ipcMain.on('osc:send', (_e, address: string, args: number[]) => {
    client.send(address, ...args)?.catch((err: Error) => console.error(`[osc] send failed: ${err.message}`));
  });

  web.once('destroyed', () => {
    ipcMain.removeAllListeners('osc:send');
    server.close();
    client.close();
  });
}

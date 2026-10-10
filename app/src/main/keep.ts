import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep: the only file Jam Frog ever writes, and only where the user picks in the save dialog.
export function handleKeep(win: BrowserWindow): void {
  ipcMain.handle('keep:save', async (_e, bytes: Uint8Array, fileName: string) => {
    const res = await dialog.showSaveDialog(win, {
      title: 'Keep this phrase',
      defaultPath: path.join(app.getPath('music'), path.basename(fileName)),
      filters: [{ name: 'MIDI file', extensions: ['mid'] }],
    });
    if (res.canceled || !res.filePath) return null;
    await writeFile(res.filePath, Buffer.from(bytes));
    return res.filePath;
  });
  win.once('closed', () => ipcMain.removeHandler('keep:save'));
}

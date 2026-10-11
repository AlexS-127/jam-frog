import { app, BrowserWindow, Menu, session } from 'electron';
import path from 'node:path';
import { startGemini } from './gemini';
import { startOsc } from './osc';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 440,
    height: 700,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Stay above Ableton, including when Live is full-screen.
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  startOsc(win.webContents);

  loadPage(win, 'index.html');
}

function loadPage(win: BrowserWindow, page: string): void {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(new URL(page, devUrl).href);
  else win.loadFile(path.join(__dirname, '../dist', page));
}

// Feature 8: the listening test opens in its own ordinary window (Jam Frog menu, Cmd+Shift+L).
let listening: BrowserWindow | null = null;
function openListeningTest(): void {
  if (listening && !listening.isDestroyed()) return listening.focus();
  listening = new BrowserWindow({
    width: 900,
    height: 640,
    title: 'Jam Frog listening test',
    backgroundColor: '#142019',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  loadPage(listening, 'listening.html');
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { label: 'Listening test…', accelerator: 'CmdOrCtrl+Shift+L', click: openListeningTest },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' }, // copy/paste in inputs
      { role: 'windowMenu' },
    ]),
  );
}

app.whenReady().then(() => {
  // Jam Frog needs no browser permissions (the bridge is OSC in the main process). Refuse them all,
  // quietly: Chromium asks about things like background-sync on every page load, which is not an error.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  startGemini();
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());

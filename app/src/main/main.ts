import { app, BrowserWindow, Menu, session } from 'electron';
import path from 'node:path';
import { handleKeep } from './keep';
import { startOsc } from './osc';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
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
  handleKeep(win);

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
  // Web MIDI (the IAC "ports" bridge) is the only permission granted. Recent Chromium asks for
  // Web MIDI as "midiSysex" even when sysex is off, so both names are allowed.
  const allowed = new Set(['midi', 'midiSysex']);
  const check = (permission: string): boolean => {
    const ok = allowed.has(permission);
    if (!ok) console.log(`[permission] denied ${permission}`);
    return ok;
  };
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(check(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => check(permission));
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());

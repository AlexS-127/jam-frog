import { contextBridge } from 'electron';

// The OSC bridge (Max for Live) will be exposed here in feature 5.
contextBridge.exposeInMainWorld('jamFrog', {
  platform: process.platform,
});

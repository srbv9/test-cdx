import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('secureTerminal', {
  version: '0.1.0'
});

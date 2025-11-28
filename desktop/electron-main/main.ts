import { app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== 'production';
const preloadPath = path.join(__dirname, 'preload.js');

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'icons', 'logo.svg');
  const icon = nativeImage.createFromPath(iconPath);
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#0b0d10',
    title: 'Secure Terminal',
    icon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const startUrl = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '..', 'renderer', 'index.html')}`;
  window.loadURL(startUrl);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

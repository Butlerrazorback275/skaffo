const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { startEngine, stopEngine, getPort } = require('./engine.cjs');

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5273';
const ROOT = path.join(__dirname, '..');

/** @type {BrowserWindow | null} */
let win = null;
let enginePort = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0F172A',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--skaffo-port=${enginePort ?? 8731}`],
    },
  });

  win.once('ready-to-show', () => win && win.show());

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

// ── window controls ──
ipcMain.handle('win:minimize', () => win && win.minimize());
ipcMain.handle('win:maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('win:close', () => win && win.close());
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);
ipcMain.handle('engine:port', () => getPort());

app.whenReady().then(async () => {
  try {
    const info = await startEngine({
      isDev,
      rootDir: ROOT,
      resourcesPath: process.resourcesPath,
      onLog: (line) => console.log(line),
    });
    enginePort = info.port;
    console.log(`[main] engine ${info.mode} on port ${info.port}`);
  } catch (err) {
    console.error('[main] engine failed to start:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', stopEngine);
app.on('will-quit', stopEngine);
process.on('exit', stopEngine);

app.on('window-all-closed', () => {
  stopEngine();
  if (process.platform !== 'darwin') app.quit();
});

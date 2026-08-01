const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { startEngine, stopEngine, getPort } = require('./engine.cjs');
const secrets = require('./secrets.cjs');
const github = require('./github.cjs');

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

// ── GitHub publishing ──
// The token never crosses into the renderer. The UI can save it, ask whether
// one is saved, and trigger a publish — but `getSecret` is only ever called
// here, in the main process.
const TOKEN_KEY = 'github.token';

ipcMain.handle('gh:status', async () => ({
  ...secrets.describe(TOKEN_KEY),
  gitInstalled: await github.gitAvailable(),
}));

ipcMain.handle('gh:save-token', async (_e, token) => {
  const clean = String(token || '').trim();
  if (!clean) return { ok: false, error: 'Token is empty.' };
  try {
    // Verify before storing, so a typo is caught immediately rather than
    // at push time with a confusing git error.
    const user = await github.verifyToken(clean);
    const stored = secrets.setSecret(TOKEN_KEY, clean);
    return {
      ok: true,
      user,
      persisted: stored,
      warning: stored ? null
        : 'Your OS keychain is unavailable, so the token was not saved to disk. It will be kept for this session only.',
    };
  } catch (err) {
    // Keep it in memory for this session even if we cannot persist it.
    return { ok: false, error: err.message, hint: err.hint || null };
  }
});

ipcMain.handle('gh:forget-token', () => {
  sessionToken = null;
  return secrets.deleteSecret(TOKEN_KEY);
});

// Fallback when the OS keystore is missing (some Linux desktops).
let sessionToken = null;
ipcMain.handle('gh:use-session-token', async (_e, token) => {
  const clean = String(token || '').trim();
  try {
    const user = await github.verifyToken(clean);
    sessionToken = clean;
    return { ok: true, user, persisted: false };
  } catch (err) {
    return { ok: false, error: err.message, hint: err.hint || null };
  }
});

ipcMain.handle('gh:publish', async (event, options) => {
  const token = secrets.getSecret(TOKEN_KEY) || sessionToken;
  if (!token) {
    return { ok: false, error: 'No GitHub token saved.',
             hint: 'Add a personal access token first.' };
  }
  try {
    const result = await github.publish({
      token,
      dir: options.dir,
      name: options.name,
      description: options.description,
      isPrivate: options.isPrivate,
      onStep: (step) => {
        if (!event.sender.isDestroyed()) event.sender.send('gh:progress', step);
      },
    });
    return { ok: true, ...result };
  } catch (err) {
    return {
      ok: false,
      // Defence in depth: redact again on the way out, in case an error
      // message from git or the API echoed the token back.
      error: github.redact(err.message, token),
      hint: err.hint ? github.redact(err.hint, token) : null,
    };
  }
});

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

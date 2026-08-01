/**
 * Python sidecar supervisor.
 *
 * Dev  : runs engine/.venv/bin/python -m app.main
 * Prod : runs the PyInstaller binary shipped in resources/engine/
 */
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

let child = null;
let chosenPort = null;

function findFreePort(start = 8731, tries = 40) {
  return new Promise((resolve, reject) => {
    let port = start;
    const attempt = () => {
      if (port > start + tries) return reject(new Error('no free port'));
      const srv = net.createServer();
      srv.once('error', () => { port += 1; attempt(); });
      srv.once('listening', () => srv.close(() => resolve(port)));
      srv.listen(port, '127.0.0.1');
    };
    attempt();
  });
}

function resolveInterpreter(rootDir) {
  const win = process.platform === 'win32';
  const venv = win
    ? path.join(rootDir, 'engine', '.venv', 'Scripts', 'python.exe')
    : path.join(rootDir, 'engine', '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return { cmd: venv, args: ['-m', 'app.main'], bundled: false };

  // No venv — fall back to whatever python is on PATH.
  return { cmd: win ? 'python' : 'python3', args: ['-m', 'app.main'], bundled: false };
}

function resolveBundled(resourcesPath) {
  const exe = process.platform === 'win32' ? 'skaffo-engine.exe' : 'skaffo-engine';
  const p = path.join(resourcesPath, 'engine', exe);
  return fs.existsSync(p) ? { cmd: p, args: [], bundled: true } : null;
}

/**
 * Kill engine processes left behind by a previous run.
 *
 * A hard crash (or closing the terminal instead of the window) can strand the
 * Python sidecar. It keeps the SQLite file locked, so the next launch fails
 * with "database is locked".
 */
function killOrphans(onLog) {
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      // Match only our sidecar: python running app.main from an engine venv.
      const script =
        "Get-CimInstance Win32_Process | " +
        "Where-Object { $_.CommandLine -like '*app.main*' -and $_.Name -like 'python*' } | " +
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
      spawnSync('powershell', ['-NoProfile', '-Command', script], {
        windowsHide: true, timeout: 5000,
      });
    } else {
      spawnSync('pkill', ['-f', 'app.main --port'], { timeout: 5000 });
    }
    onLog?.('[engine] cleared stale engine processes');
  } catch {
    /* best effort — never block startup */
  }
}

/**
 * @returns {Promise<{port:number, mode:string}>}
 */
async function startEngine({ isDev, rootDir, resourcesPath, onLog }) {
  killOrphans(onLog);
  chosenPort = await findFreePort();

  const target = (!isDev && resolveBundled(resourcesPath)) || resolveInterpreter(rootDir);
  const cwd = target.bundled ? path.dirname(target.cmd) : path.join(rootDir, 'engine');

  onLog?.(`[engine] ${target.cmd} (port ${chosenPort})`);

  child = spawn(target.cmd, [...target.args, '--port', String(chosenPort)], {
    cwd,
    env: { ...process.env, PYTHONUNBUFFERED: '1', SKAFFO_PORT: String(chosenPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (d) => onLog?.(`[engine] ${String(d).trim()}`));
  child.stderr.on('data', (d) => onLog?.(`[engine!] ${String(d).trim()}`));
  child.on('exit', (code) => onLog?.(`[engine] exited with code ${code}`));
  child.on('error', (err) => onLog?.(`[engine!] spawn failed: ${err.message}`));

  return { port: chosenPort, mode: target.bundled ? 'bundled' : 'venv' };
}

function stopEngine() {
  if (!child) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch { /* already gone */ }
  child = null;
}

const getPort = () => chosenPort;

module.exports = { startEngine, stopEngine, getPort };

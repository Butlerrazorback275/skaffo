/** Cross-platform engine launcher used by `npm run engine`. */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const engineDir = path.join(root, 'engine');
const win = process.platform === 'win32';
const venv = win
  ? path.join(engineDir, '.venv', 'Scripts', 'python.exe')
  : path.join(engineDir, '.venv', 'bin', 'python');

if (!fs.existsSync(venv)) {
  console.error('\n  Engine virtualenv missing.');
  console.error(win ? '  Run: setup-engine.bat\n' : '  Run: ./setup-engine.sh\n');
  process.exit(1);
}

const child = spawn(venv, ['-m', 'app.main'], {
  cwd: engineDir,
  stdio: 'inherit',
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
});
child.on('exit', (c) => process.exit(c ?? 0));

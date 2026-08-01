/**
 * Screenshot harness — drives the real built app and captures the README shots.
 *
 * Run:  xvfb-run -a node_modules/.bin/electron scripts/shoot.cjs
 *
 * Deliberately drives the *production* bundle (dist/) against a real engine,
 * so what lands in the README is what a user actually sees.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startEngine, stopEngine, getPort } = require('../electron/engine.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const W = 1500, H = 940;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let win;
let errors = [];

async function settle(extra = 0) {
  // Two rAFs: capturePage() can otherwise grab a stale compositor frame.
  await win.webContents.executeJavaScript(
    `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`
  );
  if (extra) await sleep(extra);
}

async function shoot(name, wait = 700) {
  await sleep(wait);
  await settle(160);
  const img = await win.webContents.capturePage();
  const file = path.join(OUT, name);
  fs.writeFileSync(file, img.toPNG());
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ✓ ${name}  (${kb} KB)`);
}

/** Click by visible text, retrying until the predicate says we arrived. */
async function go(label, settledSelector, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const ok = await win.webContents.executeJavaScript(`(() => {
      const hit = [...document.querySelectorAll('button, a, [role="button"]')]
        .find(e => (e.textContent || '').trim().startsWith(${JSON.stringify(label)}));
      if (hit) hit.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      return !!document.querySelector(${JSON.stringify(settledSelector)});
    })()`);
    if (ok) { await settle(220); return true; }
    await sleep(190);
  }
  console.log(`  ! could not reach "${label}"`);
  return false;
}

async function js(code) {
  return win.webContents.executeJavaScript(code);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const started = await startEngine({
    isDev: true,
    rootDir: ROOT,
    resourcesPath: process.resourcesPath,
    onLog: (m) => { if (/error|traceback|exited/i.test(m)) console.log(m); },
  });
  const port = started.port ?? getPort();
  console.log(`engine on ${port}`);

  win = new BrowserWindow({
    width: W, height: H, show: true, backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--skaffo-port=${port}`],
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/DevTools|Autofill|GPU stall/i.test(message)) {
      errors.push(message);
    }
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await sleep(2600); // BootGate + engine handshake

  console.log('\ncapturing…');

  // 1 — Dashboard (the README hero)
  await shoot('01-dashboard.png', 900);

  // Database/API/Export are gated on having a project open. Open the sample
  // one first, otherwise every later shot is just a disabled nav item.
  const opened = await js(`(() => {
    const card = [...document.querySelectorAll('*')]
      .find(e => (e.textContent||'').trim() === 'My Shop' &&
                 e.closest('[class*="cursor-pointer"], button, a'));
    const t = card && card.closest('[class*="cursor-pointer"], button, a');
    if (t) { t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); return true; }
    return false;
  })()`);
  console.log(`  project opened: ${opened}`);
  await sleep(1400);
  await shoot('02-dashboard-project.png', 700);

  // 2 — Database Designer + inspector
  if (await go('Database', '.react-flow')) {
    await sleep(1800);
    await shoot('05-database.png', 500);
    await js(`(() => {
      const n = document.querySelector('.react-flow__node');
      if (n) n.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
      return 1;
    })()`);
    await shoot('06-database-inspector.png', 1100);
  }

  // 3 — API Designer
  if (await go('API', 'main')) await shoot('07-api.png', 1400);

  // 4 — Export
  if (await go('Export', 'main')) await shoot('08-export.png', 1400);

  // 5 — Support (new in v0.9)
  if (await go('Support', 'main')) await shoot('30-support.png', 1300);

  // 6 — Settings (dark)
  if (await go('Settings', 'main')) await shoot('09-settings.png', 1000);

  // 7 — Light theme, on Settings so the theme picker is visible
  await js(`(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')]
      .find(e => (e.textContent||'').trim().startsWith('Light'));
    if (t) t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    return !!t;
  })()`);
  await shoot('24-theme-light.png', 1200);

  // 8 — Nord
  await js(`(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')]
      .find(e => (e.textContent||'').trim().startsWith('Nord'));
    if (t) t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    return !!t;
  })()`);
  await shoot('25-theme-nord.png', 1200);

  // back to Dark for the RTL shot
  await js(`(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')]
      .find(e => (e.textContent||'').trim().startsWith('Dark'));
    if (t) t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    return !!t;
  })()`);
  await sleep(600);

  // 9 — Persian RTL
  await js(`(() => {
    const t = [...document.querySelectorAll('button,[role="button"]')]
      .find(e => (e.textContent||'').trim().startsWith('فارسی'));
    if (t) t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
    return !!t;
  })()`);
  await shoot('26-rtl-persian.png', 1400);

  // 10 — RTL on the Database canvas (canvas must stay LTR)
  if (await go('پایگاه داده', '.react-flow')) {
    await sleep(1600);
    await shoot('27-rtl-database.png', 700);
  }

  // back to English
  if (await go('تنظیمات', 'main')) {
    await js(`(() => {
      const t = [...document.querySelectorAll('button,[role="button"]')]
        .find(e => (e.textContent||'').trim().startsWith('English'));
      if (t) t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
      return !!t;
    })()`);
    await sleep(800);
  }

  console.log('\nerrors:', errors.length ? errors : 'none');
  fs.writeFileSync(path.join(OUT, '_errors.json'), JSON.stringify(errors, null, 2));

  stopEngine();
  app.quit();
}

app.whenReady().then(main).catch((e) => {
  console.error('FATAL', e);
  stopEngine();
  app.exit(1);
});

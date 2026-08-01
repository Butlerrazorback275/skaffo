/**
 * Render build/icon.svg to every size Electron and Windows need.
 *
 *   xvfb-run -a node_modules/.bin/electron scripts/make-icon.cjs
 *
 * Two things this works around, both of which produce a *file* rather than an
 * error, so they are easy to ship by accident:
 *
 *   1. The ImageMagick build here has no SVG delegate — it flattens the whole
 *      icon to a black circle. So Chromium does the rasterising.
 *   2. A BrowserWindow smaller than roughly 30px is clamped by the platform,
 *      so capturing at 16/24px directly fails or returns the wrong size.
 *      Instead the SVG is rendered once at 1024 and downscaled with
 *      nativeImage.resize(), which uses a proper filter.
 *
 * Outputs:
 *   build/icons/<n>x<n>.png   16 → 1024, for Linux and for the .ico
 *   build/icon.png            1024, electron-builder's Linux/macOS source
 *   build/icon.ico            multi-resolution Windows icon
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const ICONS = path.join(BUILD, 'icons');

const MASTER = 512;   // rendered at 512 then upscaled once for 1024; a 1024px
                      // window segfaults Chromium under headless X here.
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

// Classic ICO tops out at 256; larger entries confuse older Explorer views.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function renderMaster(svg) {
  // Opaque, not transparent: a 1024px transparent window segfaults Chromium
  // under headless X. The icon is a filled squircle on a known background,
  // so the corners are cut back out below instead.
  const win = new BrowserWindow({
    width: MASTER, height: MASTER, show: false, frame: false,
    backgroundColor: '#00FF00',
    webPreferences: { contextIsolation: true },
  });

  const html = `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:0;background:#00FF00;overflow:hidden}
      svg{display:block;width:${MASTER}px;height:${MASTER}px}
    </style>${svg}`;

  const tmp = path.join(os.tmpdir(), `skaffo-icon-master-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);

  await sleep(400);
  await win.webContents.executeJavaScript(
    'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(1))))');

  const image = await win.webContents.capturePage({
    x: 0, y: 0, width: MASTER, height: MASTER,
  });
  win.destroy();
  fs.rmSync(tmp, { force: true });
  return image;
}

/** Build a multi-image .ico by hand — no native dependency needed. */
function buildIco(entriesIn) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);                 // reserved
  header.writeUInt16LE(1, 2);                 // 1 = icon
  header.writeUInt16LE(entriesIn.length, 4);

  const dir = [];
  let offset = 6 + entriesIn.length * 16;

  for (const { size, data } of entriesIn) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);  // 0 encodes 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);                       // palette entries
    e.writeUInt8(0, 3);                       // reserved
    e.writeUInt16LE(1, 4);                    // colour planes
    e.writeUInt16LE(32, 6);                   // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...dir, ...entriesIn.map((e) => e.data)]);
}

/** An icon that is one flat colour, or fully transparent, is a failed render. */
function assertLooksLikeAnIcon(image, label) {
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap();               // BGRA
  const seen = new Set();
  let opaque = 0;

  for (let i = 0; i < bitmap.length; i += 4) {
    if (bitmap[i + 3] > 8) opaque++;
    if (i % 64 === 0) seen.add(`${bitmap[i]},${bitmap[i + 1]},${bitmap[i + 2]}`);
  }

  const coverage = opaque / (width * height);
  // A squircle covers ~78% of its box, so anything under half means the
  // artwork failed to draw (or the whole frame was keyed out).
  if (coverage < 0.45) {
    throw new Error(`${label}: only ${(coverage * 100).toFixed(0)}% opaque — render failed`);
  }
  if (seen.size < 8) {
    throw new Error(`${label}: only ${seen.size} distinct colours — gradients did not render`);
  }
  return { coverage, colours: seen.size };
}

async function main() {
  fs.mkdirSync(ICONS, { recursive: true });
  const svg = fs.readFileSync(path.join(BUILD, 'icon.svg'), 'utf8');

  const master = await renderMaster(svg);
  const stats = assertLooksLikeAnIcon(master, 'master 1024');
  console.log(`  master  ${(stats.coverage * 100).toFixed(0)}% opaque, ` +
              `${stats.colours}+ colours`);

  const rendered = new Map();
  for (const size of SIZES) {
    const img = size === MASTER
      ? master
      : master.resize({ width: size, height: size, quality: 'best' });

    const png = img.toPNG();
    const got = img.getSize();
    if (got.width !== size || got.height !== size) {
      throw new Error(`size ${size}: got ${got.width}x${got.height}`);
    }

    rendered.set(size, png);
    fs.writeFileSync(path.join(ICONS, `${size}x${size}.png`), png);
    console.log(`  ${String(size).padStart(4)}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
  }

  fs.writeFileSync(path.join(BUILD, 'icon.png'), rendered.get(1024));

  const ico = buildIco(ICO_SIZES.map((s) => ({ size: s, data: rendered.get(s) })));
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), ico);

  console.log(`\n  icon.ico  ${(ico.length / 1024).toFixed(1)} KB (${ICO_SIZES.length} sizes)`);
  console.log(`  icon.png  1024x1024`);
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('FATAL', e.message || e);
  app.exit(1);
});

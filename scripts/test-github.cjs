/**
 * Behavioural test for electron/github.cjs against a fake GitHub API.
 *
 * Runs under plain node (no Electron needed) by pointing the module at a
 * local HTTP server and pushing into a real bare git repository on disk. That
 * exercises the parts that actually break: askpass wiring, the "repo exists"
 * branch, and whether a token can leak into an error message or .git/config.
 *
 *     node scripts/test-github.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert');

const TOKEN = 'ghp_' + 'x'.repeat(36);
let pass = 0;
let fail = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  ✓ ${name}`); })
    .catch((e) => { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); });
}

// ── fake GitHub ──────────────────────────────────────────
function startFakeApi(state) {
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    if (auth !== `Bearer ${TOKEN}`) {
      return send(401, { message: 'Bad credentials' });
    }
    if (req.url === '/user') {
      return send(200, { login: 'tester', name: 'Test User',
                         avatar_url: '', html_url: 'https://github.com/tester' });
    }
    if (req.url === '/user/repos' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      return req.on('end', () => {
        const parsed = JSON.parse(body || '{}');
        if (state.existing.has(parsed.name)) {
          return send(422, { message: 'Repository creation failed.',
                             errors: [{ message: 'name already exists on this account' }] });
        }
        state.created.push(parsed);
        send(201, {
          full_name: `tester/${parsed.name}`,
          html_url: `https://github.com/tester/${parsed.name}`,
          clone_url: state.cloneUrl,
          private: Boolean(parsed.private),
          size: 0,
        });
      });
    }
    const m = req.url.match(/^\/repos\/tester\/(.+)$/);
    if (m) {
      const info = state.existing.get(m[1]);
      if (!info) return send(404, { message: 'Not Found' });
      return send(200, {
        full_name: `tester/${m[1]}`,
        html_url: `https://github.com/tester/${m[1]}`,
        clone_url: state.cloneUrl,
        private: false,
        size: info.size,
      });
    }
    send(404, { message: 'Not Found' });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffo-proj-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# demo\n');
  fs.mkdirSync(path.join(dir, 'backend'));
  fs.writeFileSync(path.join(dir, 'backend', 'main.py'), 'print("hi")\n');
  return dir;
}

function makeBareRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffo-bare-'));
  execFileSync('git', ['init', '--bare', '-b', 'main', dir], { stdio: 'ignore' });
  return dir;
}

(async () => {
  console.log('github.cjs behaviour\n');

  const state = { created: [], existing: new Map(), cloneUrl: '' };
  const server = await startFakeApi(state);
  const base = `http://127.0.0.1:${server.address().port}`;

  // Point the module at the fake API.
  const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'github.cjs'), 'utf8');
  const patched = source.replace("const API = 'https://api.github.com';",
                                 `const API = '${base}';`);
  const tmpModule = path.join(os.tmpdir(), `gh-${Date.now()}.cjs`);
  fs.writeFileSync(tmpModule, patched);
  const github = require(tmpModule);

  await check('verifyToken returns the account', async () => {
    const user = await github.verifyToken(TOKEN);
    assert.strictEqual(user.login, 'tester');
  });

  await check('a bad token is rejected with a useful hint', async () => {
    try {
      await github.verifyToken('ghp_wrong');
      throw new Error('should have thrown');
    } catch (e) {
      assert.match(e.message, /Bad credentials/);
      assert.ok(e.hint && /expired|revoked|incompletely/i.test(e.hint));
    }
  });

  await check('publish creates the repo and pushes a real commit', async () => {
    const bare = makeBareRepo();
    state.cloneUrl = `file://${bare}`;
    const dir = makeProject();
    const steps = [];

    const result = await github.publish({
      token: TOKEN, dir, name: 'demo-app', description: 'test',
      isPrivate: false, onStep: (s) => steps.push(`${s.id}:${s.status}`),
    });

    assert.strictEqual(result.fullName, 'tester/demo-app');
    assert.ok(steps.includes('push:done'), `steps were ${steps.join(', ')}`);

    // The commit really landed in the bare repo.
    const files = execFileSync('git',
      ['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main'],
      { encoding: 'utf8' });
    assert.match(files, /README\.md/);
    assert.match(files, /backend\/main\.py/);
  });

  await check('the token never reaches .git/config', async () => {
    const bare = makeBareRepo();
    state.cloneUrl = `file://${bare}`;
    const dir = makeProject();
    await github.publish({ token: TOKEN, dir, name: 'clean-config', isPrivate: false });
    const config = fs.readFileSync(path.join(dir, '.git', 'config'), 'utf8');
    assert.ok(!config.includes(TOKEN), 'token was written into .git/config');
    assert.ok(!config.includes('ghp_'), 'a token-shaped string is in .git/config');
  });

  await check('an existing but empty repo is adopted', async () => {
    const bare = makeBareRepo();
    state.cloneUrl = `file://${bare}`;
    state.existing.set('adopt-me', { size: 0 });
    const dir = makeProject();
    const result = await github.publish({
      token: TOKEN, dir, name: 'adopt-me', isPrivate: false });
    assert.strictEqual(result.fullName, 'tester/adopt-me');
  });

  await check('an existing NON-empty repo is refused', async () => {
    state.existing.set('has-stuff', { size: 4096 });
    const dir = makeProject();
    try {
      await github.publish({ token: TOKEN, dir, name: 'has-stuff', isPrivate: false });
      throw new Error('should have refused');
    } catch (e) {
      assert.match(e.message, /already exists and is not empty/);
    }
  });

  await check('a push failure does not leak the token', async () => {
    state.cloneUrl = 'file:///nonexistent/definitely-not-a-repo';
    const dir = makeProject();
    try {
      await github.publish({ token: TOKEN, dir, name: 'will-fail', isPrivate: false });
      throw new Error('should have failed');
    } catch (e) {
      assert.match(e.message, /push failed/);
      const combined = `${e.message} ${e.hint || ''}`;
      assert.ok(!combined.includes(TOKEN), 'token leaked in the error');
      assert.ok(!/ghp_[A-Za-z0-9]{16,}/.test(combined), 'token shape leaked');
    }
  });

  await check('publishing twice is safe (re-run after a fix)', async () => {
    const bare = makeBareRepo();
    state.cloneUrl = `file://${bare}`;
    state.existing.set('twice', { size: 0 });
    const dir = makeProject();
    await github.publish({ token: TOKEN, dir, name: 'twice', isPrivate: false });
    fs.writeFileSync(path.join(dir, 'NEW.md'), 'added\n');
    const again = await github.publish({ token: TOKEN, dir, name: 'twice', isPrivate: false });
    assert.strictEqual(again.fullName, 'tester/twice');
    const files = execFileSync('git',
      ['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' });
    assert.match(files, /NEW\.md/);
  });

  await check('a missing folder gives a clear error', async () => {
    try {
      await github.publish({ token: TOKEN, dir: '/no/such/folder', name: 'x' });
      throw new Error('should have thrown');
    } catch (e) {
      assert.match(e.message, /Folder not found/);
    }
  });

  await check('redact handles every token format', () => {
    for (const t of ['ghp_' + 'a'.repeat(36), 'github_pat_' + 'b'.repeat(30)]) {
      assert.ok(!github.redact(`error ${t} here`).includes(t));
    }
    assert.ok(!github.redact('https://u:secret@github.com/x').includes('secret'));
  });

  server.close();
  fs.unlinkSync(tmpModule);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

/**
 * GitHub publishing: create a repository and push the generated project.
 *
 * Trust boundary
 * --------------
 * The token lives in the **main** process only. The renderer can ask to
 * "publish", but it never receives the token back — `describe()` returns a
 * masked hint and nothing else. That way an XSS in the UI (or a rogue
 * dependency in the renderer bundle) cannot exfiltrate it.
 *
 * The token is also kept out of:
 *   - argv          (`git remote add` uses a plain URL; auth goes through an
 *                    askpass helper, because process arguments are readable
 *                    by other processes on both Windows and Linux)
 *   - the git remote (a token embedded in `origin` would be written to
 *                    .git/config in plaintext and survive on disk forever)
 *   - logs          (`redact()` scrubs every line before it is forwarded)
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const API = 'https://api.github.com';
const UA = 'Skaffo';

// ── helpers ──────────────────────────────────────────────
/** Remove anything token-shaped from text before it is logged or returned. */
function redact(text, token) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('***');
  return out
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, '***')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, '***')
    .replace(/(https?:\/\/)[^@\s/]+@/g, '$1***@');
}

class GitHubError extends Error {
  constructor(message, status, hint) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

async function api(token, method, endpoint, body) {
  let res;
  try {
    res = await fetch(API + endpoint, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': UA,
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new GitHubError(
      'Could not reach github.com.',
      0,
      'Check your internet connection. If you are behind a filter or VPN, GitHub API access may be blocked.',
    );
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }

  if (res.ok) return data;

  const message = (data && data.message) || `HTTP ${res.status}`;
  throw new GitHubError(message, res.status, hintFor(res, data));
}

function hintFor(res, data) {
  const scopes = res.headers.get('x-oauth-scopes');
  switch (res.status) {
    case 401:
      return 'The token was rejected. It may be expired, revoked, or copied incompletely.';
    case 403:
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        return 'GitHub rate limit reached. Try again in a few minutes.';
      }
      return `The token is valid but lacks permission.${scopes ? ` It currently has: ${scopes || 'no scopes'}.` : ''} A classic token needs the "repo" scope.`;
    case 404:
      return 'Not found — for a classic token this usually means the "repo" scope is missing.';
    case 422:
      if (data && Array.isArray(data.errors) &&
          data.errors.some((e) => /already exists/i.test(e.message || ''))) {
        return 'A repository with that name already exists on your account.';
      }
      return 'GitHub rejected the request. The repository name may be invalid or taken.';
    default:
      return null;
  }
}

// ── git ──────────────────────────────────────────────────
/**
 * Run git with the token supplied out-of-band.
 *
 * GIT_ASKPASS points at a tiny script that echoes the token; the token is
 * passed to that script through an environment variable rather than argv.
 * This keeps it out of the process table and out of .git/config.
 */
function runGit(args, cwd, { token, username } = {}) {
  return new Promise((resolve) => {
    let askpassDir = null;
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',        // never hang waiting for a TTY prompt
      GIT_CONFIG_NOSYSTEM: '1',
      LC_ALL: 'C',
    };

    if (token) {
      askpassDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skaffo-git-'));
      const isWin = process.platform === 'win32';
      const script = isWin
        ? path.join(askpassDir, 'askpass.bat')
        : path.join(askpassDir, 'askpass.sh');

      if (isWin) {
        // %~1 is the prompt git passes; we answer username or password.
        fs.writeFileSync(script,
          '@echo off\r\n' +
          'echo %SKAFFO_GIT_USER%| findstr /r "^" >nul\r\n' +
          'if not "%~1"=="" (echo %~1 | findstr /i "username" >nul && (echo %SKAFFO_GIT_USER%) || (echo %SKAFFO_GIT_TOKEN%)) else (echo %SKAFFO_GIT_TOKEN%)\r\n',
          { mode: 0o700 });
      } else {
        fs.writeFileSync(script,
          '#!/bin/sh\ncase "$1" in\n  *[Uu]sername*) printf "%s" "$SKAFFO_GIT_USER" ;;\n  *) printf "%s" "$SKAFFO_GIT_TOKEN" ;;\nesac\n',
          { mode: 0o700 });
      }

      env.GIT_ASKPASS = script;
      env.SKAFFO_GIT_TOKEN = token;
      env.SKAFFO_GIT_USER = username || 'x-access-token';
    }

    const child = spawn('git', args, { cwd, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const cleanup = () => {
      if (askpassDir) fs.rmSync(askpassDir, { recursive: true, force: true });
    };

    child.on('error', (err) => {
      cleanup();
      resolve({ code: -1, stdout: '', stderr: err.message, failedToStart: true });
    });
    child.on('close', (code) => {
      cleanup();
      resolve({
        code,
        stdout: redact(stdout, token),
        stderr: redact(stderr, token),
      });
    });
  });
}

async function gitAvailable() {
  const r = await runGit(['--version'], os.tmpdir());
  return r.code === 0;
}

// ── public API ───────────────────────────────────────────
async function verifyToken(token) {
  const user = await api(token, 'GET', '/user');
  return {
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    profile: user.html_url,
  };
}

/**
 * Create the repository and push. Progress is reported through `onStep`
 * so the UI can show what is happening instead of one long spinner.
 */
async function publish({ token, dir, name, description, isPrivate, onStep }) {
  const step = (id, status, detail) => onStep?.({ id, status, detail });

  // 0 — sanity checks that produce a good error instead of a git failure
  if (!fs.existsSync(dir)) {
    throw new GitHubError(`Folder not found: ${dir}`, 0,
      'Generate the project first, then publish.');
  }
  if (!(await gitAvailable())) {
    throw new GitHubError('Git is not installed, or not on PATH.', 0,
      'Install Git from git-scm.com, then restart Skaffo.');
  }

  // 1 — who are we?
  step('verify', 'active');
  const user = await verifyToken(token);
  step('verify', 'done', user.login);

  // 2 — create the repo
  step('create', 'active');
  let repo;
  try {
    repo = await api(token, 'POST', '/user/repos', {
      name,
      description: description || undefined,
      private: Boolean(isPrivate),
      auto_init: false,          // we push the first commit ourselves
    });
  } catch (e) {
    // Already exists → adopt it, but only if it is empty. Pushing into
    // someone's populated repository without asking would be destructive.
    if (e.status === 422) {
      const existing = await api(token, 'GET', `/repos/${user.login}/${name}`)
        .catch(() => null);
      if (!existing) throw e;
      if (existing.size > 0) {
        throw new GitHubError(
          `The repository "${name}" already exists and is not empty.`,
          422,
          'Pick a different name, or delete the existing repository first. Skaffo will not push into a repository that already has content.',
        );
      }
      repo = existing;
    } else {
      throw e;
    }
  }
  step('create', 'done', repo.full_name);

  // 3 — local repository
  step('commit', 'active');
  const isRepo = await runGit(['rev-parse', '--is-inside-work-tree'], dir);
  if (isRepo.code !== 0) {
    const init = await runGit(['init', '-b', 'main'], dir);
    if (init.code !== 0) {
      // Older git has no `-b`; fall back.
      await runGit(['init'], dir);
      await runGit(['checkout', '-B', 'main'], dir);
    }
  } else {
    await runGit(['checkout', '-B', 'main'], dir);
  }

  await runGit(['add', '-A'], dir);

  // Identity: use the repo-local config so we never touch global settings.
  const head = await runGit(['rev-parse', '--verify', 'HEAD'], dir);
  const hasCommits = head.code === 0;

  const status = await runGit(['status', '--porcelain'], dir);
  if (status.stdout.trim() || !hasCommits) {
    await runGit(['config', 'user.name', user.name], dir);
    await runGit(['config', 'user.email',
      `${user.login}@users.noreply.github.com`], dir);

    const commit = await runGit(
      ['commit', '-m', 'Initial commit - generated by Skaffo'], dir);
    if (commit.code !== 0 && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
      throw new GitHubError('git commit failed.', 0,
        redact(commit.stderr || commit.stdout, token).slice(0, 400));
    }
  }
  step('commit', 'done');

  // 4 — remote + push
  step('push', 'active');
  // Plain HTTPS URL: no credentials embedded, so .git/config stays clean.
  const url = repo.clone_url;
  const hasOrigin = await runGit(['remote', 'get-url', 'origin'], dir);
  await runGit(
    hasOrigin.code === 0 ? ['remote', 'set-url', 'origin', url]
                         : ['remote', 'add', 'origin', url], dir);

  const push = await runGit(['push', '-u', 'origin', 'main'], dir,
    { token, username: user.login });

  if (push.code !== 0) {
    const detail = redact(push.stderr || push.stdout, token);
    throw new GitHubError('git push failed.', 0, detail.slice(0, 500));
  }
  step('push', 'done');

  return {
    url: repo.html_url,
    fullName: repo.full_name,
    private: repo.private,
    owner: user.login,
    defaultBranch: 'main',
  };
}

module.exports = { verifyToken, publish, gitAvailable, redact, GitHubError };

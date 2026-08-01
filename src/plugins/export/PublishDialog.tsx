import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Check, ExternalLink, Eye, EyeOff, Github, KeyRound,
  Loader2, Lock, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { Badge, Button, Input, Toggle } from '@ui/primitives';
import { useStore } from '@core/store';

const w = (globalThis as any).skaffo;

type StepId = 'verify' | 'create' | 'commit' | 'push';
type StepState = 'idle' | 'active' | 'done' | 'error';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'verify', label: 'Verifying token' },
  { id: 'create', label: 'Creating repository' },
  { id: 'commit', label: 'Committing files' },
  { id: 'push',   label: 'Pushing to GitHub' },
];

/** GitHub's own rule: letters, digits, hyphen, underscore and dot. */
function toRepoName(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 100) || 'my-project';
}

export default function PublishDialog({
  open, onClose, projectName, description, targetDir,
}: {
  open: boolean;
  onClose: () => void;
  projectName: string;
  description?: string;
  targetDir: string;
}) {
  const notify = useStore((s) => s.notify);

  const [status, setStatus] = useState<{
    available: boolean; saved: boolean; hint: string | null; gitInstalled: boolean;
  } | null>(null);

  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [user, setUser] = useState<{ login: string; name: string; profile: string } | null>(null);

  const [repoName, setRepoName] = useState(() => toRepoName(projectName));
  const [isPrivate, setIsPrivate] = useState(false);

  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    verify: 'idle', create: 'idle', commit: 'idle', push: 'idle',
  });
  const [error, setError] = useState<{ message: string; hint?: string | null } | null>(null);
  const [result, setResult] = useState<{ url: string; fullName: string; private: boolean } | null>(null);

  const firstField = useRef<HTMLInputElement>(null);

  // Refresh state every time the dialog opens: the user may have added or
  // revoked a token since last time.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setSteps({ verify: 'idle', create: 'idle', commit: 'idle', push: 'idle' });
    setRepoName(toRepoName(projectName));

    // An older desktop build may expose `window.skaffo` without the github
    // bridge. Treat that like "not available" instead of throwing an
    // unhandled rejection into the console.
    Promise.resolve(w?.github?.status?.())
      .then((s) => setStatus(s ?? null))
      .catch(() => setStatus(null));

    setTimeout(() => firstField.current?.focus(), 80);
  }, [open, projectName]);

  // Live progress from the main process.
  useEffect(() => {
    if (!open || !w?.github?.onProgress) return;
    return w.github.onProgress((step: { id: StepId; status: string; detail?: string }) => {
      setSteps((prev) => ({ ...prev, [step.id]: step.status as StepState }));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const nameIssue = useMemo(() => {
    if (!repoName) return 'Enter a repository name.';
    if (repoName.length > 100) return 'Too long — GitHub allows 100 characters.';
    if (!/^[A-Za-z0-9._-]+$/.test(repoName)) return 'Only letters, digits, ., - and _ are allowed.';
    return null;
  }, [repoName]);

  const saveToken = async () => {
    setChecking(true);
    setError(null);
    try {
      const api = status?.available ? w.github.saveToken : w.github.useSessionToken;
      const res = await api(token);
      if (!res?.ok) {
        setError({ message: res?.error || 'Could not verify the token.', hint: res?.hint });
        return;
      }
      setUser(res.user);
      setToken('');
      setStatus(await w.github.status());
      if (res.warning) notify(res.warning, 'err');
      else notify(`Signed in as ${res.user.login}`, 'ok');
    } finally {
      setChecking(false);
    }
  };

  const forget = async () => {
    await w.github.forgetToken();
    setUser(null);
    setStatus(await w.github.status());
    notify('Token removed from this computer', 'ok');
  };

  const publish = async () => {
    if (nameIssue) return;
    setBusy(true);
    setError(null);
    setSteps({ verify: 'idle', create: 'idle', commit: 'idle', push: 'idle' });
    try {
      const res = await w.github.publish({
        dir: targetDir, name: repoName, description, isPrivate,
      });
      if (!res?.ok) {
        setSteps((prev) => {
          const next = { ...prev };
          const failed = STEPS.find((s) => next[s.id] === 'active');
          if (failed) next[failed.id] = 'error';
          return next;
        });
        setError({ message: res?.error || 'Publishing failed.', hint: res?.hint });
        return;
      }
      setResult(res);
      notify(`Published to ${res.fullName}`, 'ok');
    } catch (e: any) {
      setError({ message: e?.message || 'Publishing failed.' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const signedIn = Boolean(user) || Boolean(status?.saved);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      >
        <motion.div
          role="dialog" aria-modal="true" aria-label="Publish to GitHub"
          className="card-sheen w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
        >
          {/* header */}
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-raise">
              <Github size={17} className="text-txt" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-txt">Publish to GitHub</h2>
              <p className="truncate text-[12px] text-muted">
                Creates a repository and pushes this project
              </p>
            </div>
            <button
              onClick={onClose} disabled={busy} aria-label="Close"
              className="rounded-lg p-1.5 text-muted transition hover:bg-raise hover:text-txt disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
            {/* success */}
            {result ? (
              <div className="py-2 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/15">
                  <Check size={22} className="text-success" />
                </div>
                <p className="text-[15px] font-semibold text-txt">Repository published</p>
                <p className="mt-1 text-[13px] text-muted">
                  {result.fullName} {result.private && '· private'}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button onClick={() => window.open(result.url, '_blank')}>
                    <ExternalLink size={15} /> Open on GitHub
                  </Button>
                  <Button variant="ghost" onClick={onClose}>Done</Button>
                </div>
              </div>
            ) : !w?.github ? (
              <p className="py-6 text-center text-[13px] text-muted">
                Publishing is only available in the desktop app.
              </p>
            ) : status && !status.gitInstalled ? (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4">
                <p className="text-[13px] font-medium text-txt">Git is not installed</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  Skaffo uses your local Git to push. Install it from{' '}
                  <button className="text-primary underline"
                    onClick={() => window.open('https://git-scm.com/downloads', '_blank')}>
                    git-scm.com
                  </button>, then restart Skaffo.
                </p>
              </div>
            ) : (
              <>
                {/* ── token ── */}
                {!signedIn ? (
                  <section className="mb-4">
                    <div className="mb-2 flex items-center gap-2">
                      <KeyRound size={14} className="text-muted" />
                      <h3 className="text-[13px] font-medium text-txt">Personal access token</h3>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          ref={firstField}
                          type={showToken ? 'text' : 'password'}
                          dir="ltr"
                          spellCheck={false}
                          autoComplete="off"
                          placeholder="ghp_… or github_pat_…"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && token) saveToken(); }}
                          className="pe-9 font-mono text-[12.5px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken((v) => !v)}
                          aria-label={showToken ? 'Hide token' : 'Show token'}
                          className="absolute end-2 top-1/2 -translate-y-1/2 text-muted hover:text-txt"
                        >
                          {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <Button onClick={saveToken} disabled={!token || checking}>
                        {checking ? <Loader2 size={15} className="animate-spin" /> : 'Connect'}
                      </Button>
                    </div>

                    <div className="mt-3 rounded-xl border border-line bg-raise/50 p-3">
                      <div className="flex items-start gap-2">
                        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                        <div className="text-[12px] leading-relaxed text-muted">
                          {status?.available ? (
                            <>Stored with your operating system's keychain
                            {' '}({navigator.platform.startsWith('Win') ? 'Windows DPAPI'
                              : navigator.platform.startsWith('Mac') ? 'macOS Keychain' : 'system keyring'}),
                            never in Skaffo's database and never sent anywhere except github.com.</>
                          ) : (
                            <>Your system keyring is unavailable, so the token will be kept
                            in memory for this session only and never written to disk.</>
                          )}
                        </div>
                      </div>
                      <button
                        className="mt-2 text-[12px] text-primary underline"
                        onClick={() => window.open(
                          'https://github.com/settings/tokens/new?scopes=repo&description=Skaffo', '_blank')}
                      >
                        Create a token with the “repo” scope →
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-raise/50 p-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-success/15">
                      <Check size={15} className="text-success" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-txt">
                        {user ? `Connected as ${user.login}` : 'Token saved'}
                      </p>
                      <p className="truncate text-[12px] text-muted">
                        {status?.hint ? `Token ${status.hint}` : 'Stored in your system keychain'}
                      </p>
                    </div>
                    <button
                      onClick={forget} disabled={busy}
                      className="rounded-lg p-1.5 text-muted transition hover:bg-card hover:text-danger disabled:opacity-40"
                      aria-label="Remove token"
                    >
                      <Trash2 size={15} />
                    </button>
                  </section>
                )}

                {/* ── repository ── */}
                <section className={signedIn ? '' : 'pointer-events-none opacity-40'}>
                  <label className="mb-1.5 block text-[12px] font-medium text-muted">
                    Repository name
                  </label>
                  <Input
                    dir="ltr" spellCheck={false} value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="font-mono text-[13px]"
                  />
                  {nameIssue && (
                    <p className="mt-1 text-[12px] text-danger">{nameIssue}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-raise/50 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Lock size={14} className="text-muted" />
                      <div>
                        <p className="text-[13px] text-txt">Private repository</p>
                        <p className="text-[11.5px] text-muted">Only you can see it</p>
                      </div>
                    </div>
                    <Toggle on={isPrivate} onChange={setIsPrivate} />
                  </div>

                  <p className="mt-3 truncate text-[11.5px] text-muted" dir="ltr" title={targetDir}>
                    Pushing from {targetDir}
                  </p>
                </section>

                {/* ── progress ── */}
                {(busy || Object.values(steps).some((s) => s !== 'idle')) && (
                  <section className="mt-4 space-y-1.5 rounded-xl border border-line bg-raise/40 p-3">
                    {STEPS.map((s) => {
                      const state = steps[s.id];
                      return (
                        <div key={s.id} className="flex items-center gap-2.5 text-[12.5px]">
                          <span className="grid h-4 w-4 place-items-center">
                            {state === 'done'   && <Check size={13} className="text-success" />}
                            {state === 'active' && <Loader2 size={13} className="animate-spin text-primary" />}
                            {state === 'error'  && <X size={13} className="text-danger" />}
                            {state === 'idle'   && <span className="h-1.5 w-1.5 rounded-full bg-line" />}
                          </span>
                          <span className={
                            state === 'idle' ? 'text-muted'
                            : state === 'error' ? 'text-danger' : 'text-txt'
                          }>
                            {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                )}

                {/* ── error ── */}
                {error && (
                  <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-txt">{error.message}</p>
                        {error.hint && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-muted">
                            {error.hint}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* footer */}
          {!result && w?.github && status?.gitInstalled !== false && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={publish} disabled={!signedIn || busy || Boolean(nameIssue)}>
                {busy ? <><Loader2 size={15} className="animate-spin" /> Publishing…</>
                      : <><Github size={15} /> Create &amp; push</>}
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

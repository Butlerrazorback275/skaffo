import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Download, Upload, Copy, Check, FileCode, Database, AlertTriangle,
} from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import { api, type SqlDialect, type ImportPreview } from '@core/api';
import { Button, Input, Select, Badge, scaleIn } from '@ui/primitives';

/* ── SQL export ───────────────────────────────────────── */
export function DdlDialog({ onClose }: { onClose: () => void }) {
  const project = useActiveProject();
  const notify = useStore((s) => s.notify);
  const [dialect, setDialect] = useState<SqlDialect>('sqlite');
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = async (d: SqlDialect) => {
    if (!project) return;
    setLoading(true);
    try { setSql((await api.ddl(project.id, d)).sql); }
    catch (e) { notify(e instanceof Error ? e.message : 'Failed', 'err'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load('sqlite'); /* eslint-disable-next-line */ }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Shell title="Export SQL" icon={FileCode} onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[12px] text-muted">Dialect</span>
        <Select
          value={dialect}
          onChange={(e) => { const d = e.target.value as SqlDialect; setDialect(d); load(d); }}
          className="h-8 w-40 text-[12px]"
        >
          <option value="sqlite">SQLite</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL</option>
        </Select>
        <Button size="sm" variant="outline" className="ms-auto" onClick={copy} disabled={!sql}>
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </Button>
      </div>
      <pre className="flex-1 overflow-auto bg-code p-4 font-mono text-[11.5px] leading-relaxed text-txt/80">
        {loading ? 'Generating…' : sql}
      </pre>
    </Shell>
  );
}

/* ── import ───────────────────────────────────────────── */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const project = useActiveProject();
  const notify = useStore((s) => s.notify);
  const refresh = useStore((s) => s.refresh);
  const runValidation = useStore((s) => s.runValidation);
  const snapshot = useStore((s) => s.snapshot);

  const [tab, setTab] = useState<'sql' | 'file'>('sql');
  const [sql, setSql] = useState('');
  const [dbPath, setDbPath] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = () => (tab === 'sql' ? { sql } : { dbPath });
  const ready = tab === 'sql' ? sql.trim().length > 10 : dbPath.trim().length > 0;

  const doPreview = async () => {
    if (!project || !ready) return;
    setBusy(true);
    setPreview(null);
    try { setPreview(await api.previewImport(project.id, payload())); }
    catch (e) { notify(e instanceof Error ? e.message : 'Parse failed', 'err'); }
    finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!project || !ready) return;
    setBusy(true);
    snapshot('Import schema');
    try {
      const res = await api.importSchema(project.id, { ...payload(), mode });
      notify(`Imported ${res.added} table(s) from ${res.source}`, 'ok');
      await refresh();
      await runValidation();
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import failed', 'err');
    } finally { setBusy(false); }
  };

  return (
    <Shell title="Import Schema" icon={Upload} onClose={onClose}>
      <div className="flex gap-1 border-b border-line px-4 py-2.5">
        {(['sql', 'file'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPreview(null); }}
            className={clsx('rounded-md px-3 py-1.5 text-[12px] font-medium transition',
              tab === t ? 'bg-primary/20 text-indigo-200' : 'text-muted hover:bg-raise')}
          >
            {t === 'sql' ? 'Paste SQL' : 'SQLite file'}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {tab === 'sql' ? (
          <>
            <p className="text-[12px] text-muted">
              Paste <code className="rounded bg-well px-1 font-mono text-[11px] text-indigo-300">CREATE TABLE</code> statements
              from any SQL dump.
            </p>
            <textarea
              value={sql}
              onChange={(e) => { setSql(e.target.value); setPreview(null); }}
              dir="ltr"
              placeholder={'CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);'}
              spellCheck={false}
              className="h-52 w-full resize-none rounded-lg border border-line bg-well p-3 font-mono text-[11.5px] text-txt outline-none focus:border-primary"
            />
          </>
        ) : (
          <>
            <p className="text-[12px] text-muted">
              Absolute path to an existing <b className="text-txt">.db</b> / <b className="text-txt">.sqlite</b> file.
              It is opened read-only.
            </p>
            <Input
              value={dbPath}
              onChange={(e) => { setDbPath(e.target.value); setPreview(null); }}
              placeholder="C:\\Users\\you\\Documents\\app.db"
              className="font-mono text-[12px]"
            />
          </>
        )}

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={doPreview} disabled={!ready || busy}>
            Preview
          </Button>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted">Mode</span>
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'merge')}
              className="h-8 w-36 text-[12px]">
              <option value="replace">Replace all</option>
              <option value="merge">Merge (keep existing)</option>
            </Select>
          </div>
        </div>

        {mode === 'replace' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
            <p className="text-[11.5px] text-muted">
              Replace deletes the current schema first. It is undoable with <b className="text-txt">Ctrl+Z</b>.
            </p>
          </div>
        )}

        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-lg border border-line bg-raise p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <Database size={13} className="text-indigo-300" />
                <span className="text-[12.5px] font-medium text-txt">
                  {preview.tables.length} table{preview.tables.length === 1 ? '' : 's'}
                </span>
                <Badge tone="primary">{preview.relationCount} relations</Badge>
              </div>
              <div className="space-y-1">
                {preview.tables.map((t) => (
                  <div key={t.name} className="flex items-center gap-2 text-[11.5px]">
                    <span className="font-mono text-txt">{t.name}</span>
                    <span className="text-muted">({t.columns})</span>
                    <span className="truncate font-mono text-[10.5px] text-muted/70">
                      {t.fields.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={doImport} disabled={!ready || busy}>
          {busy ? 'Importing…' : <><Download size={15} /> Import</>}
        </Button>
      </div>
    </Shell>
  );
}

/* ── shared modal shell ───────────────────────────────── */
function Shell({ title, icon: Icon, onClose, children }: {
  title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        {...scaleIn}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[72vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Icon size={15} className="text-indigo-300" />
          <span className="flex-1 text-[14px] font-semibold text-txt">{title}</span>
          <button onClick={onClose} className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-danger">
            <X size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

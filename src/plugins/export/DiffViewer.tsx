import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { X, GitCompare, ShieldCheck, AlertTriangle, FileCode } from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import { api, type FileDiff, type GenAction } from '@core/api';
import { Badge, scaleIn } from '@ui/primitives';

const ACTION_TONE: Record<string, string> = {
  create: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  update: 'text-indigo-300 bg-primary/15 border-primary/30',
  merge: 'text-violet-300 bg-violet-500/15 border-violet-500/30',
  conflict: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  skip: 'text-muted bg-raise border-line',
};

const LINE_STYLE: Record<string, string> = {
  add: 'bg-emerald-500/10 text-emerald-200',
  remove: 'bg-red-500/10 text-red-200',
  hunk: 'bg-primary/10 text-indigo-300',
  meta: 'text-muted/60',
  context: 'text-muted',
};

export default function DiffViewer({ path, onClose }: { path: string; onClose: () => void }) {
  const project = useActiveProject();
  const notify = useStore((s) => s.notify);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!project) return;
    setLoading(true);
    api.diff(project.id, path)
      .then(setDiff)
      .catch((e) => notify(e instanceof Error ? e.message : 'Diff failed', 'err'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, path]);

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
        className="flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <GitCompare size={15} className="text-indigo-300" />
          <span className="flex-1 truncate font-mono text-[13px] text-txt">{path}</span>

          {diff && !diff.error && (
            <>
              {diff.action && (
                <span className={clsx('rounded border px-2 py-0.5 text-[10.5px] font-semibold uppercase',
                  ACTION_TONE[diff.action])}>
                  {diff.action}
                </span>
              )}
              {diff.keptRegions > 0 && (
                <Badge tone="primary"><ShieldCheck size={9} /> {diff.keptRegions} kept</Badge>
              )}
              <span className="font-mono text-[11.5px] text-emerald-300">+{diff.added}</span>
              <span className="font-mono text-[11.5px] text-red-300">−{diff.removed}</span>
            </>
          )}

          <button onClick={onClose} className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-danger">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="flex-1 py-10 text-center text-[13px] text-muted">Computing diff…</p>
        ) : diff?.error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle size={22} className="text-amber-300" />
            <p className="text-[13px] text-txt">{diff.error}</p>
          </div>
        ) : diff && diff.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <FileCode size={22} className="text-muted" />
            <p className="text-[13px] text-muted">No changes — this file is already up to date.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-code">
            <table className="w-full border-collapse font-mono text-[11.5px] leading-relaxed">
              <tbody>
                {diff?.lines.map((line, i) => (
                  <tr key={i} className={LINE_STYLE[line.kind]}>
                    <td className="w-10 select-none border-e border-line/40 px-2 text-end text-[10px] text-muted/40">
                      {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : i + 1}
                    </td>
                    <td className="whitespace-pre-wrap break-all px-3 py-[1px]">
                      {line.text || '\u00a0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diff?.truncated && (
              <p className="border-t border-line px-4 py-2 text-center text-[11.5px] text-muted">
                Diff truncated — open the file to see the rest.
              </p>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

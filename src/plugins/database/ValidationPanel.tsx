import { useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2, Wand2, ChevronDown, RefreshCw,
} from 'lucide-react';
import { useStore } from '@core/store';
import type { SchemaIssue, IssueSeverity } from '@core/api';
import { Button, Badge } from '@ui/primitives';

const ICON: Record<IssueSeverity, React.ElementType> = {
  error: AlertCircle, warning: AlertTriangle, info: Info,
};
const TONE: Record<IssueSeverity, string> = {
  error: 'text-red-300', warning: 'text-amber-300', info: 'text-muted',
};

export default function ValidationPanel({ onFocus }: { onFocus?: (tableId: string) => void }) {
  const report = useStore((s) => s.validation);
  const validating = useStore((s) => s.validating);
  const runValidation = useStore((s) => s.runValidation);
  const autoFix = useStore((s) => s.autoFix);
  const [open, setOpen] = useState(true);
  const [fixing, setFixing] = useState(false);

  if (!report) return null;

  const fixable = report.issues.filter((i) => i.fixable);
  const shown = report.issues.filter((i) => i.severity !== 'info' || report.issues.length < 12);

  const doFix = async () => {
    setFixing(true);
    await autoFix();
    setFixing(false);
  };

  return (
    <div className="border-t border-line bg-well">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-start transition hover:bg-raise"
      >
        {report.ok ? (
          <CheckCircle2 size={14} className="shrink-0 text-emerald-300" />
        ) : (
          <AlertCircle size={14} className="shrink-0 text-red-300" />
        )}
        <span className="flex-1 text-[12.5px] font-medium text-txt">
          {report.ok ? 'Schema is valid' : 'Schema issues'}
        </span>
        {report.errors > 0 && <Badge tone="danger">{report.errors}</Badge>}
        {report.warnings > 0 && <Badge tone="warn">{report.warnings}</Badge>}
        {report.ok && report.infos > 0 && <Badge>{report.infos}</Badge>}
        <ChevronDown size={13} className={clsx('shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="max-h-[220px] space-y-1 overflow-y-auto px-2 pb-2">
              {shown.length === 0 && (
                <p className="px-2 py-3 text-center text-[11.5px] text-muted">
                  No problems found.
                </p>
              )}
              {shown.map((issue, i) => {
                const Icon = ICON[issue.severity];
                return (
                  <button
                    key={`${issue.code}-${i}`}
                    onClick={() => issue.tableId && onFocus?.(issue.tableId)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start transition hover:bg-raise"
                  >
                    <Icon size={12} className={clsx('mt-0.5 shrink-0', TONE[issue.severity])} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] leading-snug text-txt">{issue.message}</span>
                      {issue.hint && (
                        <span className="block text-[10.5px] leading-snug text-muted">{issue.hint}</span>
                      )}
                    </span>
                    {issue.fixable && <Wand2 size={10} className="mt-0.5 shrink-0 text-violet-300" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1.5 border-t border-line px-2 py-2">
              <Button size="sm" variant="ghost" onClick={runValidation} disabled={validating}>
                <RefreshCw size={12} className={validating ? 'animate-spin' : ''} /> Recheck
              </Button>
              {fixable.length > 0 && (
                <Button size="sm" variant="outline" className="flex-1" onClick={doFix} disabled={fixing}>
                  <Wand2 size={12} /> {fixing ? 'Fixing…' : `Fix ${fixable.length}`}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

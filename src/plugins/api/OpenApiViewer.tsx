import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  X, Copy, Check, FileJson, ChevronRight, ChevronDown, Lock, ShieldAlert,
} from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import { api } from '@core/api';
import { Button, Badge, scaleIn } from '@ui/primitives';

const METHOD_TONE: Record<string, string> = {
  get: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  post: 'bg-primary/15 text-indigo-300 border-primary/30',
  put: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  patch: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  delete: 'bg-danger/15 text-red-300 border-danger/30',
};

interface Operation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: { name: string; in: string; required?: boolean; schema?: Record<string, unknown>; description?: string }[];
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
  responses?: Record<string, { description?: string }>;
  security?: unknown[];
}

export default function OpenApiViewer({ onClose }: { onClose: () => void }) {
  const project = useActiveProject();
  const notify = useStore((s) => s.notify);
  const [spec, setSpec] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ui' | 'json'>('ui');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!project) return;
    api.openapi(project.id)
      .then(setSpec)
      .catch((e) => notify(e instanceof Error ? e.message : 'Failed', 'err'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const copy = async () => {
    if (!spec) return;
    await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const paths: Record<string, Record<string, Operation>> = spec?.paths ?? {};
  const grouped = new Map<string, { path: string; method: string; op: Operation }[]>();
  Object.entries(paths).forEach(([path, methods]) => {
    Object.entries(methods).forEach(([method, op]) => {
      const tag = op.tags?.[0] ?? 'default';
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag)!.push({ path, method, op });
    });
  });
  const tags = [...grouped.keys()].sort();
  const total = Object.values(paths).reduce((a, m) => a + Object.keys(m).length, 0);

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
        className="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <FileJson size={15} className="text-indigo-300" />
          <span className="text-[14px] font-semibold text-txt">OpenAPI 3.1</span>
          {spec && <Badge tone="primary">{total} operations</Badge>}
          <div className="ml-3 flex gap-1">
            {(['ui', 'json'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={clsx('rounded-md px-2.5 py-1 text-[11.5px] font-medium transition',
                  tab === t ? 'bg-primary/20 text-indigo-200' : 'text-muted hover:bg-raise')}>
                {t === 'ui' ? 'Explorer' : 'JSON'}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="ms-auto" onClick={copy} disabled={!spec}>
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </Button>
          <button onClick={onClose} className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-danger">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <p className="flex-1 py-10 text-center text-[13px] text-muted">Building spec…</p>
        ) : tab === 'json' ? (
          <pre className="flex-1 overflow-auto bg-code p-4 font-mono text-[11px] leading-relaxed text-txt/80">
            {JSON.stringify(spec, null, 2)}
          </pre>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 rounded-lg border border-line bg-raise p-3">
              <p className="text-[15px] font-semibold text-txt">{spec?.info?.title}</p>
              <p className="text-[12px] text-muted">{spec?.info?.description}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                {spec?.servers?.[0]?.url} · v{spec?.info?.version}
              </p>
            </div>

            {tags.map((tag) => (
              <div key={tag} className="mb-4">
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-indigo-300">{tag}</p>
                <div className="space-y-1">
                  {grouped.get(tag)!.map(({ path, method, op }) => {
                    const key = `${method}-${path}`;
                    const isOpen = open[key];
                    return (
                      <div key={key} className="overflow-hidden rounded-lg border border-line bg-raise">
                        <button
                          onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-start transition hover:bg-raise"
                        >
                          {isOpen ? <ChevronDown size={12} className="shrink-0 text-muted" />
                                  : <ChevronRight size={12} className="shrink-0 text-muted" />}
                          <span className={clsx('w-[62px] shrink-0 rounded border py-0.5 text-center font-mono text-[10px] font-bold uppercase',
                            METHOD_TONE[method])}>{method}</span>
                          <span className="truncate font-mono text-[12.5px] text-txt">{path}</span>
                          {op.security && <Lock size={11} className="shrink-0 text-amber-300" />}
                          <span className="ms-auto hidden shrink-0 text-[11.5px] text-muted sm:block">{op.summary}</span>
                        </button>

                        {isOpen && (
                          <div className="space-y-2.5 border-t border-line px-3 py-2.5">
                            {op.description && <p className="text-[12px] text-muted">{op.description}</p>}

                            {op.parameters && op.parameters.length > 0 && (
                              <div>
                                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Parameters</p>
                                <div className="space-y-1">
                                  {op.parameters.map((p) => (
                                    <div key={p.name + p.in} className="flex items-center gap-2 text-[11.5px]">
                                      <span className="font-mono text-txt">{p.name}</span>
                                      <Badge>{p.in}</Badge>
                                      <span className="font-mono text-muted">
                                        {String((p.schema as any)?.type ?? 'string')}
                                      </span>
                                      {p.required && <span className="text-[10px] text-red-300">required</span>}
                                      {(p.schema as any)?.default !== undefined && (
                                        <span className="font-mono text-[10.5px] text-muted">
                                          = {JSON.stringify((p.schema as any).default)}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {op.requestBody && (
                              <div>
                                <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Request body</p>
                                <pre className="overflow-x-auto rounded bg-well p-2 font-mono text-[10.5px] text-txt/80">
                                  {JSON.stringify(op.requestBody.content['application/json']?.schema, null, 2)}
                                </pre>
                              </div>
                            )}

                            <div>
                              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">Responses</p>
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(op.responses ?? {}).map(([code, r]) => (
                                  <span key={code}
                                    className={clsx('rounded border px-2 py-0.5 text-[11px]',
                                      code.startsWith('2')
                                        ? 'border-success/30 bg-success/15 text-emerald-300'
                                        : 'border-line bg-raise text-muted')}>
                                    {code} · {r.description}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {total === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <ShieldAlert size={24} className="text-muted" />
                <p className="text-[13px] text-muted">No endpoints yet.</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

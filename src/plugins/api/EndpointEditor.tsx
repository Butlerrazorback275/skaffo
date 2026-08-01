import { useState } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Route, ShieldCheck } from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import type {
  Endpoint, EndpointParam, RequestField, HttpMethod, ColumnType, ResponseKind, ParamLocation,
} from '@core/types';
import { Button, Input, Select, Toggle, Badge, scaleIn } from '@ui/primitives';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TYPES: ColumnType[] = [
  'integer', 'bigint', 'string', 'text', 'boolean',
  'float', 'decimal', 'datetime', 'date', 'uuid', 'json',
];
const METHOD_TONE: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  POST: 'bg-primary/15 text-indigo-300 border-primary/30',
  PUT: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PATCH: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  DELETE: 'bg-danger/15 text-red-300 border-danger/30',
};

const defaultStatus = (m: HttpMethod) => (m === 'POST' ? 201 : m === 'DELETE' ? 204 : 200);

/** Path segments like {order_id} become path params automatically. */
function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

export default function EndpointEditor({
  existing, onClose,
}: { existing?: Endpoint | null; onClose: () => void }) {
  const project = useActiveProject();
  const createEndpoint = useStore((s) => s.createEndpoint);
  const patchEndpoint = useStore((s) => s.patchEndpoint);

  const [method, setMethod] = useState<HttpMethod>(existing?.method ?? 'GET');
  const [path, setPath] = useState(existing?.path ?? '/api/');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [entity, setEntity] = useState(existing?.entity ?? '');
  const [tag, setTag] = useState(existing?.tag ?? '');
  const [params, setParams] = useState<EndpointParam[]>(existing?.params ?? []);
  const [fields, setFields] = useState<RequestField[]>(existing?.requestFields ?? []);
  const [responseKind, setResponseKind] = useState<ResponseKind>(existing?.responseKind ?? 'entity');
  const [statusCode, setStatusCode] = useState(existing?.statusCode ?? 200);
  const [authRequired, setAuthRequired] = useState(existing?.authRequired ?? false);
  const [busy, setBusy] = useState(false);

  const tables = project?.schema.tables ?? [];
  const declaredPathParams = new Set(params.filter((p) => p.in === 'path').map((p) => p.name));
  const missingPathParams = pathParamNames(path).filter((n) => !declaredPathParams.has(n));
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const valid = path.trim().length > 1 && path.startsWith('/');

  const changeMethod = (m: HttpMethod) => {
    setMethod(m);
    // keep the status sensible unless the user picked a custom one
    if (statusCode === defaultStatus(method)) setStatusCode(defaultStatus(m));
  };

  const addParam = (loc: ParamLocation = 'query', name = '') =>
    setParams((p) => [...p, { name, in: loc, type: 'string', required: false, default: '', description: '' }]);

  const updateParam = (i: number, patch: Partial<EndpointParam>) =>
    setParams((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true);
    const payload = {
      method, path: path.trim(), summary: summary.trim(), description: description.trim(),
      entity, tag: tag.trim(), params, requestFields: hasBody ? fields : [],
      responseKind, statusCode, authRequired,
    };
    const ok = existing
      ? await patchEndpoint(existing.id, payload)
      : await createEndpoint(payload);
    setBusy(false);
    if (ok) onClose();
  };

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
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Route size={15} className="text-indigo-300" />
          <span className="flex-1 text-[14px] font-semibold text-txt">
            {existing ? 'Edit Endpoint' : 'New Endpoint'}
          </span>
          <button onClick={onClose} className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-danger">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* method + path */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">Route</label>
            <div className="flex gap-2">
              {/* Select/Input carry w-full, so size them via the wrapper. */}
              <div className="w-32 shrink-0">
                <Select
                  value={method}
                  onChange={(e) => changeMethod(e.target.value as HttpMethod)}
                  className={clsx('border font-mono text-[12px] font-bold', METHOD_TONE[method])}
                >
                  {METHODS.map((m) => <option key={m} value={m} className="bg-card text-txt">{m}</option>)}
                </Select>
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/api/orders/{order_id}/refund"
                  className="font-mono text-[13px]"
                />
              </div>
            </div>
            {missingPathParams.length > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                <span className="text-[11.5px] text-amber-200">
                  Undeclared path parameter{missingPathParams.length > 1 ? 's' : ''}:{' '}
                  <b className="font-mono">{missingPathParams.join(', ')}</b>
                </span>
                <button
                  onClick={() => missingPathParams.forEach((n) => addParam('path', n))}
                  className="ms-auto shrink-0 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-100 hover:bg-amber-500/30"
                >
                  Add {missingPathParams.length > 1 ? 'them' : 'it'}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted">Summary</label>
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Refund an order" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted">Entity</label>
              <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="">— none —</option>
                {tables.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">
              Description <span className="text-muted/60">(becomes the docstring)</span>
            </label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Issues a full refund and marks the order refunded." />
          </div>

          {/* parameters */}
          <Section
            title="Parameters"
            count={params.length}
            action={<Button size="sm" variant="ghost" onClick={() => addParam('query')}><Plus size={12} /> Add</Button>}
          >
            {params.length === 0 && <Empty>No parameters.</Empty>}
            {params.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-well p-2">
                <div className="min-w-0 flex-1"><Input value={p.name} onChange={(e) => updateParam(i, { name: e.target.value })}
                  placeholder="name" className="h-8 font-mono text-[12px]" /></div>
                <div className="w-[86px] shrink-0"><Select value={p.in} onChange={(e) => updateParam(i, { in: e.target.value as ParamLocation })}
                  className="h-8 text-[11.5px]">
                  <option value="query">query</option>
                  <option value="path">path</option>
                  <option value="header">header</option>
                </Select></div>
                <div className="w-[100px] shrink-0"><Select value={p.type} onChange={(e) => updateParam(i, { type: e.target.value as ColumnType })}
                  className="h-8 font-mono text-[11.5px]">
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select></div>
                <div className="w-24 shrink-0"><Input value={p.default ?? ''} onChange={(e) => updateParam(i, { default: e.target.value })}
                  placeholder="default" className="h-8 font-mono text-[11.5px]"
                  disabled={p.in === 'path'} /></div>
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                  <input type="checkbox" checked={p.in === 'path' ? true : p.required}
                    disabled={p.in === 'path'}
                    onChange={(e) => updateParam(i, { required: e.target.checked })}
                    className="h-3.5 w-3.5 accent-indigo-500" />
                  req
                </label>
                <button onClick={() => setParams((x) => x.filter((_, j) => j !== i))}
                  className="rounded p-1.5 text-muted hover:bg-danger/15 hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </Section>

          {/* request body */}
          {hasBody && (
            <Section
              title="Request body"
              count={fields.length}
              action={
                <Button size="sm" variant="ghost"
                  onClick={() => setFields((f) => [...f, { name: '', type: 'string', required: true }])}>
                  <Plus size={12} /> Add
                </Button>
              }
            >
              {fields.length === 0 && <Empty>No body — the entity schema will be used.</Empty>}
              {fields.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-well p-2">
                  <div className="min-w-0 flex-1"><Input value={f.name}
                    onChange={(e) => setFields((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                    placeholder="field" className="h-8 font-mono text-[12px]" /></div>
                  <div className="w-[110px] shrink-0"><Select value={f.type}
                    onChange={(e) => setFields((x) => x.map((y, j) => (j === i ? { ...y, type: e.target.value as ColumnType } : y)))}
                    className="h-8 font-mono text-[11.5px]">
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select></div>
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                    <input type="checkbox" checked={f.required}
                      onChange={(e) => setFields((x) => x.map((y, j) => (j === i ? { ...y, required: e.target.checked } : y)))}
                      className="h-3.5 w-3.5 accent-indigo-500" />
                    req
                  </label>
                  <button onClick={() => setFields((x) => x.filter((_, j) => j !== i))}
                    className="rounded p-1.5 text-muted hover:bg-danger/15 hover:text-danger">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </Section>
          )}

          {/* response */}
          <Section title="Response">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-muted">Kind</label>
                <Select value={responseKind} onChange={(e) => setResponseKind(e.target.value as ResponseKind)}
                  className="h-9 text-[12px]">
                  <option value="entity">Single entity</option>
                  <option value="list">Paged list</option>
                  <option value="custom">Custom object</option>
                  <option value="none">No content</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Status code</label>
                <Input type="number" value={statusCode}
                  onChange={(e) => setStatusCode(Number(e.target.value) || 200)}
                  className="h-9 font-mono text-[12px]" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted">Tag</label>
                <Input value={tag} onChange={(e) => setTag(e.target.value)}
                  placeholder={entity || 'custom'} className="h-9 text-[12px]" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-well px-3 py-2">
              <span className="flex items-center gap-2 text-[12.5px] text-txt">
                <ShieldCheck size={13} className="text-indigo-300" /> Require authentication
              </span>
              <Toggle on={authRequired} onChange={setAuthRequired} />
            </div>
          </Section>

          {/* preview */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Preview</p>
            <div className="rounded-lg border border-line bg-well p-3">
              <div className="flex items-center gap-2">
                <span className={clsx('rounded border px-2 py-0.5 font-mono text-[10.5px] font-bold', METHOD_TONE[method])}>
                  {method}
                </span>
                <span className="font-mono text-[12.5px] text-txt">{path}</span>
                <Badge className="ms-auto">{statusCode}</Badge>
              </div>
              <pre className="mt-2 overflow-x-auto font-mono text-[10.5px] leading-relaxed text-muted">
{`def ${method.toLowerCase()}_${(path.replace(/^\/api\//, '').replace(/[^a-z0-9]+/gi, '_') || 'root').replace(/_+$/, '')}(`}
{pathParamNames(path).map((n) => `\n    ${n},`).join('')}
{hasBody && fields.length > 0 ? '\n    payload: Body,' : ''}
{params.filter((p) => p.in === 'query' && p.name).map((p) => `\n    ${p.name}${p.required ? '' : ' = ' + (p.default || 'None')},`).join('')}
{`\n    db: Session = Depends(get_db),\n):`}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Create endpoint'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, count, action, children }: {
  title: string; count?: number; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</span>
        {count !== undefined && count > 0 && <Badge>{count}</Badge>}
        <span className="ms-auto">{action}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-[11.5px] text-muted">{children}</p>
);

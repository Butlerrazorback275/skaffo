import { useState } from 'react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Trash2, Box, FileCode2, Layers3, Cog, Globe, Table2,
  Plus, Pencil, FileJson, Lock, Route,
} from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import { Card, Button, Badge, Toggle, Empty, SectionTitle } from '@ui/primitives';
import EndpointEditor from './EndpointEditor';
import OpenApiViewer from './OpenApiViewer';
import type { Endpoint } from '@core/types';

const METHOD_TONE: Record<string, string> = {
  GET:    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  POST:   'bg-primary/15 text-indigo-300 border-primary/30',
  PUT:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
  PATCH:  'bg-violet-500/15 text-violet-300 border-violet-500/30',
  DELETE: 'bg-danger/15 text-red-300 border-danger/30',
};

const ALL = '__all__';

const ARTIFACTS = [
  { key: 'Router',  icon: Globe,     path: (e: string) => `backend/app/routers/${e}.py` },
  { key: 'Schema',  icon: FileCode2, path: (e: string) => `backend/app/schemas/${e}.py` },
  { key: 'Service', icon: Cog,       path: (e: string) => `backend/app/services/${e}.py` },
  { key: 'Model',   icon: Layers3,   path: (e: string) => `backend/app/models/${e}.py` },
];

export default function ApiDesigner() {
  const project = useActiveProject();
  const generateCrud = useStore((s) => s.generateCrud);
  const setCrudOption = useStore((s) => s.setCrudOption);
  const deleteEndpoint = useStore((s) => s.deleteEndpoint);
  const go = useStore((s) => s.go);
  const [entity, setEntity] = useState<string | null>(null);
  const [editing, setEditing] = useState<Endpoint | null | undefined>(undefined);
  const [showSpec, setShowSpec] = useState(false);

  if (!project) return null;
  const tables = project.schema.tables;
  const allEndpoints = project.api.endpoints;
  const customCount = allEndpoints.filter((e) => !e.generated).length;

  // Default to a table that actually has endpoints, otherwise the first one.
  const firstWithEndpoints = tables.find((t) => allEndpoints.some((e) => e.entity === t.name));
  const sel = entity ?? firstWithEndpoints?.name ?? tables[0]?.name ?? null;
  const isAll = sel === ALL;

  const eps = isAll
    ? [...allEndpoints].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    : allEndpoints.filter((e) => e.entity === sel);

  const opts = (!isAll && sel && project.api.crudOptions[sel])
    || { search: false, pagination: false, sorting: false, filtering: false };

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT — entities */}
      <div className="flex w-[220px] shrink-0 flex-col border-e border-line bg-sidebar/50">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold text-txt">Entities</span>
          <Badge>{tables.length}</Badge>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          <button
            onClick={() => setEntity(ALL)}
            className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start transition duration-200',
              isAll ? 'border border-primary/40 bg-primary/15' : 'border border-transparent hover:bg-raise')}
          >
            <Globe size={12} className="text-indigo-300" />
            <span className="flex-1 truncate text-[12.5px] text-txt">All endpoints</span>
            {allEndpoints.length > 0 && (
              <span className="rounded bg-line px-1.5 text-[10px] text-muted">{allEndpoints.length}</span>
            )}
          </button>
          {customCount > 0 && (
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-muted/70">
              {customCount} custom
            </p>
          )}

          {tables.length === 0 && <p className="px-2 py-4 text-center text-[12px] text-muted">No tables yet.</p>}
          {tables.map((t) => {
            const n = project.api.endpoints.filter((e) => e.entity === t.name).length;
            return (
              <button key={t.id} onClick={() => setEntity(t.name)}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start transition duration-200',
                  sel === t.name ? 'border border-primary/40 bg-primary/15' : 'border border-transparent hover:bg-raise')}
              >
                <Table2 size={12} style={{ color: t.color }} />
                <span className="flex-1 truncate font-mono text-[12.5px] text-txt">{t.name}</span>
                {n > 0 && <span className="rounded bg-success/20 px-1.5 text-[10px] text-emerald-300">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* CENTER */}
      <div className="flex-1 overflow-y-auto p-5">
        {!sel ? (
          <div className="grid h-full place-items-center">
            <Empty icon={<Box size={26} />} title="No entities" hint="Design tables in the Database tab first — entities come from your schema."
              action={<Button onClick={() => go('database')}>Go to Database</Button>} />
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-3">
              <div>
                <h1 className="font-mono text-[20px] font-semibold tracking-tight text-txt">
                  {isAll ? 'All endpoints' : `/api/${sel}`}
                </h1>
                <p className="text-[13px] text-muted">
                  {eps.length} endpoint{eps.length === 1 ? '' : 's'}
                  {!isAll && ' generated'}
                </p>
              </div>
              <div className="ms-auto flex gap-2">
                <Button variant="outline" onClick={() => setShowSpec(true)}>
                  <FileJson size={15} /> OpenAPI
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  <Plus size={15} /> Endpoint
                </Button>
                {!isAll && <Button onClick={() => generateCrud(sel)}><Zap size={16} /> Generate CRUD</Button>}
              </div>
            </div>

            <div className={clsx('grid grid-cols-1 gap-5', !isAll && 'xl:grid-cols-[1fr_280px]')}>
              <div>
                <SectionTitle>Endpoints</SectionTitle>
                {eps.length === 0 ? (
                  <Card className="border-dashed p-8 text-center">
                    <p className="text-[13px] text-muted">
                      {isAll
                        ? <>No endpoints yet — pick an entity and hit <b className="text-txt">Generate CRUD</b>.</>
                        : <>No endpoints yet — hit <b className="text-txt">Generate CRUD</b>.</>}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {eps.map((e) => (
                        <motion.div key={e.id} layout
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                          transition={{ duration: 0.2 }}>
                          <Card hover className="group flex items-center gap-3 p-3">
                            <span className={clsx('w-[62px] shrink-0 rounded-md border py-1 text-center font-mono text-[10.5px] font-bold', METHOD_TONE[e.method])}>
                              {e.method}
                            </span>
                            <span className="flex-1 truncate font-mono text-[13px] text-txt">{e.path}</span>
                            {isAll && e.entity && <Badge>{e.entity}</Badge>}
                            {!e.generated && <Badge tone="warn"><Route size={9} /> custom</Badge>}
                            {e.authRequired && <Lock size={11} className="shrink-0 text-amber-300" />}
                            <span className="hidden shrink-0 text-[12px] text-muted lg:block">{e.summary}</span>
                            <button onClick={() => setEditing(e)}
                              className="shrink-0 rounded p-1.5 text-muted opacity-0 transition hover:bg-raise hover:text-txt group-hover:opacity-100">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteEndpoint(e.id)}
                              className="shrink-0 rounded p-1.5 text-muted opacity-0 transition hover:bg-danger/15 hover:text-danger group-hover:opacity-100">
                              <Trash2 size={13} />
                            </button>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {!isAll && <div className="mt-5">
                  <SectionTitle>Generated Artifacts</SectionTitle>
                  <div className="grid grid-cols-2 gap-2.5">
                    {ARTIFACTS.map((a) => {
                      const Icon = a.icon;
                      return (
                        <Card key={a.key} hover className="flex items-center gap-3 p-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-indigo-300"><Icon size={16} /></div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-txt">{a.key}</p>
                            <p className="truncate font-mono text-[10.5px] text-muted">{a.path(sel)}</p>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>}
              </div>

              {!isAll && <div>
                <SectionTitle>Query Features</SectionTitle>
                <Card className="space-y-3.5 p-4">
                  {([
                    ['search', 'Search', '?q=term across text columns'],
                    ['pagination', 'Pagination', '?page=1&size=20'],
                    ['sorting', 'Sorting', '?sort=-created_at'],
                    ['filtering', 'Filtering', '?status=active'],
                  ] as const).map(([k, label, hint]) => (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-txt">{label}</p>
                        <p className="truncate font-mono text-[10.5px] text-muted">{hint}</p>
                      </div>
                      <Toggle on={opts[k]} onChange={(v) => setCrudOption(sel, { [k]: v })} />
                    </div>
                  ))}
                </Card>

                <div className="mt-4">
                  <SectionTitle>Preview</SectionTitle>
                  <Card className="overflow-hidden p-0">
                    <pre className="overflow-x-auto p-3.5 font-mono text-[10.5px] leading-relaxed text-muted">
{`@router.get("/${sel}")
async def list_${sel}(
    db: Session = Depends(get_db),${opts.pagination ? `
    page: int = 1,
    size: int = 20,` : ''}${opts.search ? `
    q: str | None = None,` : ''}${opts.sorting ? `
    sort: str = "-id",` : ''}
):
    return service.list(db)`}
                    </pre>
                  </Card>
                </div>
              </div>}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {editing !== undefined && (
          <EndpointEditor existing={editing} onClose={() => setEditing(undefined)} />
        )}
        {showSpec && <OpenApiViewer onClose={() => setShowSpec(false)} />}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pin, Search, Trash2, FolderOpen, Copy, Package, FolderSearch } from 'lucide-react';
import { useStore } from '@core/store';
import { Card, Button, Badge, Input, Empty, timeAgo } from '@ui/primitives';

export default function Projects() {
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const togglePin = useStore((s) => s.togglePin);
  const deleteProject = useStore((s) => s.deleteProject);
  const setWizard = useStore((s) => s.setWizard);
  const notify = useStore((s) => s.notify);
  const [q, setQ] = useState('');
  const t = useStore((s) => s.t);

  const list = projects
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt));

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-txt">{t('projects.title')}</h1>
          <p className="text-[13px] text-muted">{projects.length} {t('projects.count')}</p>
        </div>
        <div className="relative ms-auto w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="pl-9" />
        </div>
        <Button onClick={() => setWizard(true)}><Plus size={16} /> {t('projects.new')}</Button>
      </div>

      {list.length === 0 ? (
        <Empty
          icon={<FolderSearch size={26} />}
          title={q ? t('projects.noMatch') : t('projects.empty')}
          hint={q ? undefined : t('projects.emptyHint')}
          action={!q && <Button onClick={() => setWizard(true)}><Plus size={16} /> {t('dash.createProject')}</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, delay: i * 0.03 }}>
              <Card hover className="group flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-gradient-to-br from-primary/25 to-hover/15 text-[14px] font-bold text-indigo-200">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[15px] font-medium text-txt">{p.name}</p>
                      {p.isSample && <Badge tone="warn">{t('projects.sample')}</Badge>}
                    </div>
                    <p className="truncate text-[12px] text-muted">{p.description || 'No description'}</p>
                  </div>
                  <button onClick={() => togglePin(p.id)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-raise hover:text-amber-300">
                    <Pin size={14} className={p.pinned ? 'fill-amber-300 text-amber-300' : ''} />
                  </button>
                </div>

                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <Badge tone="primary">FastAPI</Badge>
                  <Badge tone="primary">React</Badge>
                  <Badge>SQLite</Badge>
                  {p.stack.auth !== 'none' && <Badge tone="success">{p.stack.auth.toUpperCase()}</Badge>}
                  {p.stack.docker && <Badge tone="warn">Docker</Badge>}
                </div>

                <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  {[['Files', p.fileCount], ['Tables', p.schema.tables.length], ['API', p.api.endpoints.length]].map(([k, v]) => (
                    <div key={k as string}>
                      <p className="tabular text-[15px] font-semibold text-txt">{v as number}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted">{k}</p>
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-[11px] text-muted">{t('projects.updated')} {timeAgo(p.updatedAt)} · {t('projects.built')} {timeAgo(p.lastBuildAt)}</p>

                <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                  <Button size="sm" className="flex-1" onClick={() => openProject(p.id)}><FolderOpen size={13} /> {t('common.open')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => notify('Duplicate lands in v1.0', 'info')}><Copy size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => notify('Export from the Export tab', 'info')}><Package size={13} /></Button>
                  <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => deleteProject(p.id)}><Trash2 size={13} /></Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

import { motion } from 'framer-motion';
import {
  Plus, FolderOpen, Pin, Clock, Package, Hammer, FileCode, Database,
  Globe, Activity, TrendingUp, Layers, Code2, CheckCircle2, Upload, Pencil, Trash2, Rocket,
} from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import { Card, Button, Badge, SectionTitle, timeAgo } from '@ui/primitives';

const ACT_ICON = {
  create: Rocket, generate: Code2, export: Upload, build: CheckCircle2, edit: Pencil, delete: Trash2,
} as const;
const ACT_TONE = {
  create: 'text-indigo-300', generate: 'text-indigo-300', export: 'text-amber-300',
  build: 'text-emerald-300', edit: 'text-txt/80', delete: 'text-red-300',
} as const;

function Stat({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; tone: string;
}) {
  return (
    <Card hover className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
          <p className="tabular mt-1.5 text-2xl font-semibold tracking-tight text-txt">{value}</p>
          {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
        </div>
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon size={17} /></div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const projects = useStore((s) => s.projects);
  const activity = useStore((s) => s.activity);
  const setWizard = useStore((s) => s.setWizard);
  const openProject = useStore((s) => s.openProject);
  const go = useStore((s) => s.go);
  const markBuild = useStore((s) => s.markBuild);
  const active = useActiveProject();
  const t = useStore((s) => s.t);

  const pinned = projects.filter((p) => p.pinned);
  const recent = [...projects].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 5);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const buildsThisWeek = activity.filter(
    (a) => a.kind === 'build' && +new Date(a.at) >= weekAgo,
  ).length;
  const totalFiles = projects.reduce((a, p) => a + p.fileCount, 0);
  const totalLoc = projects.reduce((a, p) => a + p.linesOfCode, 0);
  const lastExport = [...projects].filter((p) => p.lastExportAt)
    .sort((a, b) => +new Date(b.lastExportAt!) - +new Date(a.lastExportAt!))[0];
  const lastBuild = [...projects].filter((p) => p.lastBuildAt)
    .sort((a, b) => +new Date(b.lastBuildAt!) - +new Date(a.lastBuildAt!))[0];

  return (
    <div className="flex h-full gap-5 overflow-hidden p-5">
      {/* ── CENTER ── */}
      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        <Card className="relative overflow-hidden p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-hover/20 blur-3xl" />
          <div className="relative">
            <p className="text-[13px] text-muted">{t('dash.welcome')} 👋</p>
            <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-tight text-txt">
              {active ? active.name : t('dash.welcome')}
            </h1>
            <p className="mt-1.5 max-w-md text-[13px] text-muted">
              {active
                ? active.description || 'Design your schema, generate the API, then export.'
                : t('dash.tagline')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button size="lg" onClick={() => setWizard(true)}><Plus size={17} /> {t('dash.createProject')}</Button>
              <Button size="lg" variant="outline" onClick={() => go('projects')}><FolderOpen size={17} /> {t('dash.openProject')}</Button>
              {active && (
                <Button size="lg" variant="success" onClick={() => markBuild(active.id)}>
                  <Hammer size={17} /> {t('dash.build')}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {active ? (
          <div className="grid grid-cols-4 gap-3">
            <Stat icon={FileCode} label={t("common.files")}    value={active.fileCount}  sub={`${active.linesOfCode.toLocaleString()} LOC`} tone="bg-primary/15 text-indigo-300" />
            <Stat icon={Database} label={t("common.tables")}   value={active.schema.tables.length} sub={`${active.schema.relations.length} relations`} tone="bg-emerald-500/15 text-emerald-300" />
            <Stat icon={Globe}    label={t("dash.endpoints")} value={active.api.endpoints.length} sub="REST" tone="bg-violet-500/15 text-violet-300" />
            <Stat icon={Hammer}   label={t("dash.lastBuild")} value={timeAgo(active.lastBuildAt)} sub={active.stack.docker ? 'Docker ready' : 'Local'} tone="bg-amber-500/15 text-amber-300" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <Stat icon={Layers}     label={t("nav.projects")} value={projects.length} sub={`${pinned.length} pinned`} tone="bg-primary/15 text-indigo-300" />
            <Stat icon={FileCode}   label={t("common.files")}    value={totalFiles} sub="generated" tone="bg-emerald-500/15 text-emerald-300" />
            <Stat icon={Code2}      label="Lines"    value={`${(totalLoc / 1000).toFixed(1)}k`} sub="of code" tone="bg-violet-500/15 text-violet-300" />
            {/* Was hardcoded to "3" — a made-up number that is obvious the
                moment the workspace is empty. Count real build activity. */}
            <Stat icon={TrendingUp} label="This week" value={buildsThisWeek} sub="builds" tone="bg-amber-500/15 text-amber-300" />
          </div>
        )}

        <div>
          <SectionTitle right={projects.length > 0 && <button onClick={() => go('projects')} className="text-[12px] text-indigo-300 transition hover:text-hover">{t('dash.viewAll')}</button>}>
            {t('dash.recentProjects')}
          </SectionTitle>
          {projects.length === 0 ? (
            /* Skaffo ships with no sample project, so this is the very first
               thing a new user sees. It has to say what to do next. */
            <Card className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-raise text-muted">
                <Layers size={22} />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-txt">{t('dash.firstProject')}</p>
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{t('dash.firstProjectHint')}</p>
              </div>
              <Button onClick={() => setWizard(true)}><Plus size={16} /> {t('dash.createProject')}</Button>
            </Card>
          ) : (
          <div className="space-y-2">
            {recent.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.04 }}>
                <Card hover className="group flex cursor-pointer items-center gap-4 p-3.5" onClick={() => openProject(p.id)}>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-gradient-to-br from-primary/25 to-hover/15 text-[13px] font-bold text-indigo-200">
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-medium text-txt">{p.name}</p>
                      {p.pinned && <Pin size={11} className="shrink-0 fill-amber-300 text-amber-300" />}
                    </div>
                    <p className="truncate text-[12px] text-muted">{p.path}</p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
                    <Badge>FastAPI</Badge><Badge>React</Badge><Badge>SQLite</Badge>
                  </div>
                  <div className="w-20 shrink-0 text-end">
                    <p className="text-[12px] text-muted">{timeAgo(p.updatedAt)}</p>
                    <p className="text-[11px] text-muted/60">{p.fileCount} files</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </div>

      {/* ── RIGHT RAIL ── */}
      <div className="hidden w-[300px] shrink-0 space-y-4 overflow-y-auto xl:block">
        <Card className="p-4">
          <SectionTitle>{t('dash.statistics')}</SectionTitle>
          <div className="space-y-3">
            {[
              { label: 'Total projects', value: projects.length, max: 10, color: 'bg-primary' },
              { label: 'Files generated', value: totalFiles, max: 600, color: 'bg-success' },
              { label: 'Endpoints',       value: projects.reduce((a, p) => a + p.api.endpoints.length, 0), max: 40, color: 'bg-violet-400' },
              { label: 'Tables designed', value: projects.reduce((a, p) => a + p.schema.tables.length, 0), max: 20, color: 'bg-amber-400' },
            ].map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="text-muted">{s.label}</span>
                  <span className="font-medium text-txt">{s.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${Math.min(100, (s.value / s.max) * 100)}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${s.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('dash.activity')}</SectionTitle>
          <div className="space-y-3">
            {activity.slice(0, 6).map((a) => {
              const Icon = ACT_ICON[a.kind];
              return (
                <div key={a.id} className="flex gap-2.5">
                  <Icon size={14} className={`mt-0.5 shrink-0 ${ACT_TONE[a.kind]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-txt">{a.message}</p>
                    <p className="text-[11px] text-muted">{a.projectName} · {timeAgo(a.at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>{t('dash.pinned')}</SectionTitle>
          {pinned.length === 0
            ? <p className="py-2 text-[12px] text-muted">{t('dash.nothingPinned')}</p>
            : (
              <div className="space-y-1.5">
                {pinned.map((p) => (
                  <button key={p.id} onClick={() => openProject(p.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition duration-200 hover:bg-raise">
                    <Pin size={12} className="shrink-0 fill-amber-300 text-amber-300" />
                    <span className="flex-1 truncate text-[13px] text-txt">{p.name}</span>
                    <span className="text-[11px] text-muted">{p.fileCount}</span>
                  </button>
                ))}
              </div>
            )}
        </Card>

        <div className="grid grid-cols-1 gap-3">
          <Card className="p-4">
            <SectionTitle>{t('dash.latestExport')}</SectionTitle>
            {lastExport ? (
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/15 text-amber-300"><Package size={16} /></div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-txt">{lastExport.name}</p>
                  <p className="text-[11px] text-muted">ZIP · {timeAgo(lastExport.lastExportAt)}</p>
                </div>
              </div>
            ) : <p className="text-[12px] text-muted">{t('dash.noExports')}</p>}
          </Card>

          <Card className="p-4">
            <SectionTitle>{t('dash.latestBuild')}</SectionTitle>
            {lastBuild ? (
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={16} /></div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-txt">{lastBuild.name}</p>
                  <p className="text-[11px] text-muted">Success · {timeAgo(lastBuild.lastBuildAt)}</p>
                </div>
              </div>
            ) : <p className="text-[12px] text-muted">{t('dash.noBuilds')}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

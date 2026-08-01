import { useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, ChevronLeft, ChevronRight, Check, Sparkles,
  FileCode, Server, Layout, Database, ShieldCheck, Container, ClipboardList, Rocket,
} from 'lucide-react';
import { useStore } from '@core/store';
import type { TemplateId, BackendId, FrontendId, DatabaseId, AuthId } from '@core/types';
import { Button, Input, scaleIn } from '@ui/primitives';

const STEPS = [
  { n: 1, label: 'Name',     icon: FileCode },
  { n: 2, label: 'Type',     icon: Layout },
  { n: 3, label: 'Backend',  icon: Server },
  { n: 4, label: 'Frontend', icon: Layout },
  { n: 5, label: 'Database', icon: Database },
  { n: 6, label: 'Auth',     icon: ShieldCheck },
  { n: 7, label: 'Docker',   icon: Container },
  { n: 8, label: 'Summary',  icon: ClipboardList },
];

const TYPES: { id: TemplateId; label: string; desc: string; emoji: string }[] = [
  { id: 'blank',     label: 'Blank',      desc: 'Bare structure, nothing else',      emoji: '📄' },
  { id: 'rest-api',  label: 'REST API',   desc: 'Backend-only service',              emoji: '🔌' },
  { id: 'blog',      label: 'Blog',       desc: 'Posts, tags, comments',             emoji: '✍️' },
  { id: 'dashboard', label: 'Dashboard',  desc: 'Charts, tables, KPI cards',         emoji: '📊' },
  { id: 'crm',       label: 'CRM',        desc: 'Contacts, deals, pipeline',         emoji: '🤝' },
  { id: 'ecommerce', label: 'E-Commerce', desc: 'Products, cart, orders',            emoji: '🛒' },
];

const BACKENDS: { id: BackendId; label: string; soon: boolean }[] = [
  { id: 'fastapi', label: 'FastAPI', soon: false },
  { id: 'node',    label: 'Node',    soon: true },
  { id: 'laravel', label: 'Laravel', soon: true },
  { id: 'spring',  label: 'Spring',  soon: true },
  { id: 'django',  label: 'Django',  soon: true },
];
const FRONTENDS: { id: FrontendId; label: string; soon: boolean }[] = [
  { id: 'react',   label: 'React',   soon: false },
  { id: 'vue',     label: 'Vue',     soon: true },
  { id: 'angular', label: 'Angular', soon: true },
  { id: 'flutter', label: 'Flutter', soon: true },
];
const DATABASES: { id: DatabaseId; label: string; soon: boolean }[] = [
  { id: 'sqlite',     label: 'SQLite',     soon: false },
  { id: 'postgresql', label: 'PostgreSQL', soon: true },
  { id: 'mysql',      label: 'MySQL',      soon: true },
];
const AUTHS: { id: AuthId; label: string; desc: string }[] = [
  { id: 'none',  label: 'None',  desc: 'Public endpoints only' },
  { id: 'jwt',   label: 'JWT',   desc: 'Access + refresh tokens' },
  { id: 'oauth', label: 'OAuth', desc: 'Google / GitHub providers' },
];

/** Neutral marker for stacks whose generator is not written yet. */
function SoonChip() {
  return (
    <span className="mt-0.5 shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
      Soon
    </span>
  );
}

function Pick({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'relative flex w-full items-start gap-3 rounded-xl border p-4 text-start transition-all duration-200',
        disabled
          ? 'cursor-not-allowed border-line bg-raise opacity-45'
          : active
            ? 'border-primary bg-primary/15 shadow-glow'
            : 'border-line bg-raise hover:border-primary/50 hover:bg-raise',
      )}
    >
      {children}
      {active && !disabled && (
        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary">
          <Check size={12} className="text-white" />
        </span>
      )}
    </button>
  );
}

export default function Wizard() {
  const close = () => useStore.getState().setWizard(false);
  const createProject = useStore((s) => s.createProject);
  const defaults = useStore((s) => s.settings);

  const [step, setStep] = useState(1);
  const [name, setName] = useState('My Shop');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<TemplateId>('blank');
  const [backend] = useState<BackendId>(defaults.defaultBackend);
  const [frontend] = useState<FrontendId>(defaults.defaultFrontend);
  const [database] = useState<DatabaseId>(defaults.defaultDatabase);
  const [auth, setAuth] = useState<AuthId>('jwt');
  const [docker, setDocker] = useState(true);
  const [generating, setGenerating] = useState(false);

  const canNext = step === 1 ? name.trim().length > 1 : true;
  const next = () => setStep((s) => Math.min(8, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const generate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 1400));
    createProject({ name: name.trim(), description, template, stack: { backend, frontend, database, auth, docker } });
    useStore.getState().go('dashboard');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-6 backdrop-blur-sm"
      onClick={close}
    >
      <motion.div
        {...scaleIn}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[640px] w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-card/95 shadow-2xl backdrop-blur-2xl"
      >
        {/* stepper rail */}
        <div className="w-56 shrink-0 border-e border-line bg-well p-5">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted">Create Project</p>
          <div className="space-y-1">
            {STEPS.map((s) => {
              const done = step > s.n, cur = step === s.n;
              const Icon = s.icon;
              return (
                <button
                  key={s.n}
                  onClick={() => s.n < step && setStep(s.n)}
                  className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition duration-200',
                    cur ? 'bg-primary/15 font-medium text-txt' : done ? 'text-muted hover:bg-raise' : 'text-muted/40')}
                >
                  <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold',
                    cur ? 'bg-primary text-white' : done ? 'bg-success/20 text-success' : 'bg-raise text-muted/50')}>
                    {done ? <Check size={12} /> : s.n}
                  </span>
                  <Icon size={14} /> {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-6">
            <div>
              <p className="text-[15px] font-semibold text-txt">Step {step} — {STEPS[step - 1].label}</p>
              <p className="text-[11px] text-muted">{step} of 8</p>
            </div>
            <button onClick={close} className="rounded-lg p-2 text-muted transition hover:bg-raise hover:text-danger"><X size={17} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-txt">Project Name</label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Shop" autoFocus />
                      <p className="mt-1.5 text-[11px] text-muted">
                        Folder: <span className="font-mono text-indigo-300">{defaults.workspace}/{name.toLowerCase().replace(/\s+/g, '-') || '...'}</span>
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-txt">Description <span className="text-muted">(optional)</span></label>
                      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this project do?" />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid grid-cols-2 gap-3">
                    {TYPES.map((t) => (
                      <Pick key={t.id} active={template === t.id} onClick={() => setTemplate(t.id)}>
                        <span className="text-xl">{t.emoji}</span>
                        <span>
                          <span className="block text-[14px] font-medium text-txt">{t.label}</span>
                          <span className="block text-[12px] text-muted">{t.desc}</span>
                        </span>
                      </Pick>
                    ))}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-muted">FastAPI is the generator that exists today. The rest are on the roadmap.</p>
                    {BACKENDS.map((b) => (
                      <Pick key={b.id} active={backend === b.id} disabled={b.soon} onClick={() => {}}>
                        <Server size={18} className="mt-0.5 text-indigo-300" />
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium text-txt">{b.label}</span>
                          <span className="block text-[12px] text-muted">{b.soon ? 'Not built yet' : 'Python · async · OpenAPI'}</span>
                        </span>
                        {b.soon && <SoonChip />}
                      </Pick>
                    ))}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-muted">React is the generator that exists today. The rest are on the roadmap.</p>
                    {FRONTENDS.map((f) => (
                      <Pick key={f.id} active={frontend === f.id} disabled={f.soon} onClick={() => {}}>
                        <Layout size={18} className="mt-0.5 text-indigo-300" />
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium text-txt">{f.label}</span>
                          <span className="block text-[12px] text-muted">{f.soon ? 'Not built yet' : 'TypeScript · Vite · Tailwind'}</span>
                        </span>
                        {f.soon && <SoonChip />}
                      </Pick>
                    ))}
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-muted">SQLite is what the generator emits today. The rest are on the roadmap.</p>
                    {DATABASES.map((d) => (
                      <Pick key={d.id} active={database === d.id} disabled={d.soon} onClick={() => {}}>
                        <Database size={18} className="mt-0.5 text-indigo-300" />
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium text-txt">{d.label}</span>
                          <span className="block text-[12px] text-muted">{d.soon ? 'Not built yet' : 'Zero-config file database'}</span>
                        </span>
                        {d.soon && <SoonChip />}
                      </Pick>
                    ))}
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-3">
                    {AUTHS.map((a) => (
                      <Pick key={a.id} active={auth === a.id} onClick={() => setAuth(a.id)}>
                        <ShieldCheck size={18} className="mt-0.5 text-indigo-300" />
                        <span>
                          <span className="block text-[14px] font-medium text-txt">{a.label}</span>
                          <span className="block text-[12px] text-muted">{a.desc}</span>
                        </span>
                      </Pick>
                    ))}
                  </div>
                )}

                {step === 7 && (
                  <div className="grid grid-cols-2 gap-3">
                    <Pick active={docker} onClick={() => setDocker(true)}>
                      <Container size={18} className="mt-0.5 text-indigo-300" />
                      <span>
                        <span className="block text-[14px] font-medium text-txt">Yes</span>
                        <span className="block text-[12px] text-muted">Dockerfile + compose + nginx</span>
                      </span>
                    </Pick>
                    <Pick active={!docker} onClick={() => setDocker(false)}>
                      <X size={18} className="mt-0.5 text-muted" />
                      <span>
                        <span className="block text-[14px] font-medium text-txt">No</span>
                        <span className="block text-[12px] text-muted">Run locally only</span>
                      </span>
                    </Pick>
                  </div>
                )}

                {step === 8 && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-line bg-well p-5">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-hover text-lg">
                          {TYPES.find((t) => t.id === template)?.emoji}
                        </div>
                        <div>
                          <p className="text-[16px] font-semibold text-txt">{name}</p>
                          <p className="text-[12px] text-muted">{description || TYPES.find((t) => t.id === template)?.desc}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-line pt-4 text-[13px]">
                        {[
                          ['Type', TYPES.find((t) => t.id === template)?.label],
                          ['Backend', 'FastAPI'],
                          ['Frontend', 'React + TypeScript'],
                          ['Database', 'SQLite'],
                          ['Authentication', AUTHS.find((a) => a.id === auth)?.label],
                          ['Docker', docker ? 'Yes' : 'No'],
                        ].map(([k, v]) => (
                          <div key={k as string} className="flex justify-between">
                            <span className="text-muted">{k}</span>
                            <span className="font-medium text-txt">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/10 p-3.5">
                      <Sparkles size={15} className="mt-0.5 shrink-0 text-indigo-300" />
                      <p className="text-[12px] leading-relaxed text-muted">
                        Skaffo will scaffold <b className="text-txt">~120 files</b> — routers, models, schemas, services,
                        Alembic migrations, React pages, hooks, store{docker ? ', Docker + nginx' : ''}, tests and docs.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex h-16 shrink-0 items-center justify-between border-t border-line px-6">
            <Button variant="ghost" onClick={back} disabled={step === 1}><ChevronLeft size={16} /> Back</Button>
            <div className="flex gap-1.5">
              {STEPS.map((s) => (
                <span key={s.n} className={clsx('h-1.5 rounded-full transition-all duration-200',
                  step === s.n ? 'w-5 bg-primary' : step > s.n ? 'w-1.5 bg-success' : 'w-1.5 bg-line')} />
              ))}
            </div>
            {step < 8 ? (
              <Button onClick={next} disabled={!canNext}>Next <ChevronRight size={16} /></Button>
            ) : (
              <Button onClick={generate} disabled={generating} className="min-w-[130px]">
                {generating
                  ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating…</>
                  : <><Rocket size={16} /> Generate</>}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

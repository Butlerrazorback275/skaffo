import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Check, Database, Download, FolderOpen, Github, Hammer,
  Languages, Palette, ShieldCheck, Sparkles,
} from 'lucide-react';
import { useStore } from '@core/store';
import { THEMES, type ThemeId } from '@core/theme';
import { LOCALES } from '@core/i18n';
import { Button } from './primitives';

/**
 * First-run welcome.
 *
 * Shown once, then never again — the flag lives in the same settings record
 * as theme and language, so it survives restarts but is wiped by a clean
 * install (which is the behaviour you want when testing).
 *
 * Deliberately three steps, not a tour. A new user needs to know: what this
 * thing makes, that it will not phone home, and where the button is. Anything
 * longer gets skipped, and a skipped tour is worse than no tour because it
 * trains people to dismiss your UI.
 */
export default function Welcome({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const setWizard = useStore((s) => s.setWizard);

  const last = 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'Enter') setStep((s) => (s >= last ? (onDone(), s) : s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const finish = (thenCreate = false) => {
    onDone();
    if (thenCreate) setTimeout(() => setWizard(true), 260);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-bg p-6">
      {/* ambient glow, same language as the app shell */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[460px] w-[460px] rounded-full bg-primary/[0.12] blur-[130px]" />
        <div className="absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-hover/[0.10] blur-[130px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28 }}
        className="card-sheen relative w-full max-w-[680px] overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="px-9 pb-7 pt-9">
          <AnimatePresence mode="wait">
            {/* ── 1. what it is ── */}
            {step === 0 && (
              <motion.div key="s0" {...fade}>
                <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-hover shadow-lg shadow-primary/30 ring-1 ring-inset ring-white/15">
                  <Hammer size={26} className="text-white" />
                </div>
                <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-txt">
                  Welcome to Skaffo
                </h1>
                <p className="mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
                  Draw your database, describe your API, and Skaffo writes a
                  real project you can run — FastAPI, React, SQLite, migrations
                  and tests included.
                </p>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { icon: Database, title: 'Design', body: 'Tables and relations on a canvas' },
                    { icon: Sparkles, title: 'Generate', body: 'Real source files, not a mockup' },
                    { icon: FolderOpen, title: 'Run', body: 'One script starts the whole stack' },
                  ].map((c) => (
                    <div key={c.title} className="rounded-xl border border-line bg-raise/50 p-3.5">
                      <c.icon size={16} className="mb-2 text-indigo-300" />
                      <p className="text-[13px] font-medium text-txt">{c.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted">{c.body}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── 2. make it yours ── */}
            {step === 1 && (
              <motion.div key="s1" {...fade}>
                <h1 className="text-[24px] font-semibold tracking-tight text-txt">
                  Make it yours
                </h1>
                <p className="mt-1.5 text-[13.5px] text-muted">
                  You can change all of this later in Settings.
                </p>

                <div className="mt-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Palette size={14} className="text-muted" />
                    <span className="text-[12px] font-medium text-muted">Theme</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                      <button
                        key={id}
                        onClick={() => setSetting('theme', id)}
                        className={`rounded-xl border p-2.5 text-start transition ${
                          settings.theme === id
                            ? 'border-primary bg-primary/10'
                            : 'border-line bg-raise/40 hover:border-muted/40'
                        }`}
                      >
                        <span className="mb-1.5 flex h-6 overflow-hidden rounded-md ring-1 ring-inset ring-white/10">
                          <span className="w-1/4" style={{ background: THEMES[id].tokens.sidebar }} />
                          <span className="flex-1" style={{ background: THEMES[id].tokens.bg }} />
                          <span className="w-1/4" style={{ background: THEMES[id].tokens.card }} />
                        </span>
                        <span className="text-[12px] text-txt">{THEMES[id].label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Languages size={14} className="text-muted" />
                    <span className="text-[12px] font-medium text-muted">Language</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {LOCALES.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setSetting('language', l.id)}
                        className={`rounded-lg border px-2.5 py-2 text-[12.5px] transition ${
                          settings.language === l.id
                            ? 'border-primary bg-primary/10 text-txt'
                            : 'border-line bg-raise/40 text-muted hover:border-muted/40'
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── 3. the promise ── */}
            {step === 2 && (
              <motion.div key="s2" {...fade}>
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-success/15">
                  <ShieldCheck size={22} className="text-success" />
                </div>
                <h1 className="text-[24px] font-semibold tracking-tight text-txt">
                  Yours, and only yours
                </h1>

                <ul className="mt-5 space-y-3">
                  {[
                    ['Nothing leaves this machine', 'No account, no telemetry, no analytics. The engine runs locally on 127.0.0.1.'],
                    ['Everything is unlocked', 'There is no paid tier and never will be. Nothing here is a trial.'],
                    ['Your workspace starts empty', 'No sample projects cluttering it up — the first project you see is one you made.'],
                  ].map(([title, body]) => (
                    <li key={title} className="flex gap-3">
                      <Check size={15} className="mt-0.5 shrink-0 text-success" />
                      <div>
                        <p className="text-[13.5px] font-medium text-txt">{title}</p>
                        <p className="text-[12.5px] leading-snug text-muted">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-raise/50 px-3.5 py-3">
                  <Github size={15} className="shrink-0 text-muted" />
                  <p className="flex-1 text-[12.5px] text-muted">
                    Open source under MIT. Bug reports and ideas are welcome.
                  </p>
                  <button
                    onClick={() => window.open('https://github.com/ilia-dev-cmyk/skaffo', '_blank')}
                    className="shrink-0 text-[12.5px] text-primary underline"
                  >
                    View on GitHub
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 border-t border-line px-9 py-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>

          <div className="ms-auto flex items-center gap-2">
            {step < last ? (
              <>
                <button
                  onClick={() => finish(false)}
                  className="rounded-lg px-3 py-2 text-[13px] text-muted transition hover:text-txt"
                >
                  Skip
                </button>
                <Button onClick={() => setStep(step + 1)}>
                  Next <ArrowRight size={15} />
                </Button>
              </>
            ) : (
              <>
                <button
                  onClick={() => finish(false)}
                  className="rounded-lg px-3 py-2 text-[13px] text-muted transition hover:text-txt"
                >
                  Explore on my own
                </button>
                <Button onClick={() => finish(true)}>
                  <Sparkles size={15} /> Create my first project
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.2 },
};

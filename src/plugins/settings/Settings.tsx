import clsx from 'clsx';
import {
  Palette, Languages, Save, Server, Layout, Database, FolderCog,
  RefreshCw, Upload, Download, Check, Puzzle, Zap, Moon, Sun,
} from 'lucide-react';
import { useStore } from '@core/store';
import { registry } from '@core/registry';
import { THEMES, ACCENTS, type ThemeId } from '@core/theme';
import { LOCALES, type LocaleId } from '@core/i18n';
import { Card, Button, Input, Select, Badge, Toggle, SectionTitle } from '@ui/primitives';

function Row({ icon: Icon, label, hint, children, wide }: {
  icon: React.ElementType; label: string; hint?: string;
  children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className={clsx('gap-3 border-b border-line/50 py-3.5 last:border-0',
      wide ? 'block' : 'flex items-center')}>
      <div className={clsx('flex items-center gap-3', wide && 'mb-3')}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raise text-muted">
          <Icon size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-txt">{label}</p>
          {hint && <p className="text-[11.5px] text-muted">{hint}</p>}
        </div>
      </div>
      <div className={wide ? '' : 'w-[190px] shrink-0'}>{children}</div>
    </div>
  );
}

export default function Settings() {
  const st = useStore((s) => s.settings);
  const set = useStore((s) => s.setSetting);
  const notify = useStore((s) => s.notify);
  const t = useStore((s) => s.t);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-txt">{t('settings.title')}</h1>
        <p className="text-[13px] text-muted">{t('settings.subtitle')}</p>
      </div>

      <div className="mx-auto max-w-3xl space-y-5">
        {/* ── appearance ── */}
        <div>
          <SectionTitle>{t('settings.appearance')}</SectionTitle>
          <Card className="px-4">
            <Row icon={Palette} label={t('settings.theme')} hint={t('settings.themeHint')} wide>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                  const theme = THEMES[id];
                  const active = st.theme === id;
                  return (
                    <button
                      key={id}
                      onClick={() => set('theme', id)}
                      className={clsx(
                        'group relative overflow-hidden rounded-xl border p-2.5 text-start transition-all duration-200',
                        active ? 'border-primary shadow-glow' : 'border-line hover:border-primary/50',
                      )}
                    >
                      {/* miniature of the actual theme */}
                      <div
                        className="mb-2 flex h-12 gap-1 overflow-hidden rounded-lg p-1"
                        style={{ background: theme.tokens.bg }}
                      >
                        <div className="w-1/4 rounded" style={{ background: theme.tokens.sidebar }} />
                        <div className="flex-1 rounded" style={{ background: theme.tokens.card }} />
                        <div className="w-1.5 rounded" style={{ background: st.accent }} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {theme.dark ? <Moon size={11} className="text-muted" /> : <Sun size={11} className="text-muted" />}
                        <span className="text-[12px] font-medium text-txt">{theme.label}</span>
                        {active && <Check size={12} className="ms-auto text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Row>

            <Row icon={Languages} label={t('settings.language')} hint={t('settings.languageHint')} wide>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {LOCALES.map((l) => {
                  const active = st.language === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => set('language', l.id as LocaleId)}
                      className={clsx(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all duration-200',
                        active ? 'border-primary bg-primary/15' : 'border-line hover:border-primary/50 hover:bg-raise',
                      )}
                    >
                      <span
                        className="flex-1 truncate text-start text-[12.5px] font-medium text-txt"
                        style={{ fontFamily: l.font, direction: l.dir }}
                      >
                        {l.label}
                      </span>
                      {l.dir === 'rtl' && <Badge className="shrink-0">RTL</Badge>}
                      {active && <Check size={12} className="shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </Row>

            <Row icon={Palette} label={t('settings.accent')} wide>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => set('accent', c)}
                    aria-label={c}
                    className="grid h-8 w-8 place-items-center rounded-lg transition hover:scale-110"
                    style={{
                      background: c,
                      outline: st.accent === c ? '2px solid var(--cf-txt)' : 'none',
                      outlineOffset: 2,
                    }}
                  >
                    {st.accent === c && <Check size={14} className="text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </Row>

            <Row icon={Zap} label={t('settings.reduceMotion')} hint={t('settings.reduceMotionHint')}>
              <div className="flex justify-end">
                <Toggle on={st.reduceMotion} onChange={(v) => set('reduceMotion', v)} />
              </div>
            </Row>

            <Row icon={Save} label={t('settings.autoSave')} hint={t('settings.autoSaveHint')}>
              <div className="flex justify-end">
                <Toggle on={st.autoSave} onChange={(v) => set('autoSave', v)} />
              </div>
            </Row>
          </Card>
        </div>

        {/* ── defaults ── */}
        <div>
          <SectionTitle>{t('settings.defaults')}</SectionTitle>
          <Card className="px-4">
            <Row icon={Server} label={t('settings.defaultBackend')}>
              <Select value={st.defaultBackend} onChange={(e) => set('defaultBackend', e.target.value as never)}>
                <option value="fastapi">FastAPI</option>
                <option value="node" disabled>Node — soon</option>
                <option value="laravel" disabled>Laravel — soon</option>
                <option value="spring" disabled>Spring — soon</option>
                <option value="django" disabled>Django — soon</option>
              </Select>
            </Row>
            <Row icon={Layout} label={t('settings.defaultFrontend')}>
              <Select value={st.defaultFrontend} onChange={(e) => set('defaultFrontend', e.target.value as never)}>
                <option value="react">React</option>
                <option value="vue" disabled>Vue — soon</option>
                <option value="angular" disabled>Angular — soon</option>
                <option value="flutter" disabled>Flutter — soon</option>
              </Select>
            </Row>
            <Row icon={Database} label={t('settings.defaultDatabase')}>
              <Select value={st.defaultDatabase} onChange={(e) => set('defaultDatabase', e.target.value as never)}>
                <option value="sqlite">SQLite</option>
                <option value="postgresql" disabled>PostgreSQL — soon</option>
                <option value="mysql" disabled>MySQL — soon</option>
              </Select>
            </Row>
            <Row icon={FolderCog} label={t('settings.workspace')}>
              <Input value={st.workspace} onChange={(e) => set('workspace', e.target.value)}
                className="font-mono text-[12px]" />
            </Row>
          </Card>
        </div>

        {/* ── maintenance ── */}
        <div>
          <SectionTitle>{t('settings.maintenance')}</SectionTitle>
          <Card className="px-4">
            <Row icon={RefreshCw} label={t('settings.checkUpdates')} hint="You're on v0.7.0">
              <div className="flex justify-end">
                <Toggle on={st.checkUpdates} onChange={(v) => set('checkUpdates', v)} />
              </div>
            </Row>
            <Row icon={Upload} label={t('settings.backup')} hint={t('settings.backupHint')}>
              <Button size="sm" variant="outline" className="w-full" onClick={() => notify('Backup written (mock)', 'ok')}>
                <Upload size={13} /> {t('settings.backup')}
              </Button>
            </Row>
            <Row icon={Download} label={t('settings.restore')} hint={t('settings.restoreHint')}>
              <Button size="sm" variant="outline" className="w-full" onClick={() => notify('Nothing to restore', 'err')}>
                <Download size={13} /> {t('settings.restore')}
              </Button>
            </Row>
          </Card>
        </div>

        {/* ── modules ── */}
        <div>
          <SectionTitle right={<Badge tone="success">plugin-based</Badge>}>{t('settings.modules')}</SectionTitle>
          <Card className="p-4">
            <p className="mb-3 text-[12px] text-muted">{t('settings.modulesHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {registry.all().map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-raise p-2.5">
                  <Puzzle size={14} className="shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-txt">{p.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted">{p.id}@{p.version}</p>
                  </div>
                  <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', p.enabled ? 'bg-success' : 'bg-muted/40')} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

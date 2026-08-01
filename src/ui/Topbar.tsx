import { Settings as Cog, Moon, Sun, User, Hammer, X, ChevronDown, Minus, Square, Database } from 'lucide-react';
import { THEMES, type ThemeId } from '@core/theme';
import { useStore, useActiveProject } from '@core/store';
import { Badge } from './primitives';

const w = (globalThis as any).skaffo;

function ConnectionBadge() {
  const connection = useStore((s) => s.connection);
  if (connection === 'online') {
    return <Badge tone="success"><Database size={10} /> SQLite</Badge>;
  }
  if (connection === 'connecting') {
    return <Badge tone="warn">Connecting…</Badge>;
  }
  return <Badge tone="danger">Offline</Badge>;
}

export default function Topbar() {
  const go = useStore((s) => s.go);
  const notify = useStore((s) => s.notify);
  const closeProject = useStore((s) => s.closeProject);
  const project = useActiveProject();
  const theme = useStore((s) => s.settings.theme);
  const setSetting = useStore((s) => s.setSetting);

  /** Cheap way to flip themes without opening Settings. */
  const cycleTheme = () => {
    const order = Object.keys(THEMES) as ThemeId[];
    setSetting('theme', order[(order.indexOf(theme) + 1) % order.length]);
  };

  return (
    <header
      dir="ltr"
      className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-sidebar/70 px-4 backdrop-blur-xl"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-primary to-hover shadow-md shadow-primary/30 ring-1 ring-inset ring-white/15">
          <Hammer size={16} className="text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[14.5px] font-semibold tracking-[-0.02em] text-txt">Skaffo</p>
          <p className="text-[10px] text-muted">v0.1.0 · Preview</p>
        </div>
      </div>

      {project && (
        <div
          className="ms-4 flex items-center gap-2 rounded-lg border border-line bg-raise py-1.5 pl-3 pr-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span dir="auto" className="text-[13px] font-medium text-txt">{project.name}</span>
          <ChevronDown size={13} className="text-muted" />
          <button onClick={closeProject} className="ms-1 rounded p-1 text-muted transition hover:bg-raise hover:text-danger">
            <X size={13} />
          </button>
        </div>
      )}

      <div className="ms-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <ConnectionBadge />
        <button onClick={() => go('settings')} className="rounded-lg p-2 text-muted transition hover:bg-raise hover:text-txt"><Cog size={17} /></button>
        <button
          onClick={cycleTheme}
          title={`Theme: ${THEMES[theme].label}`}
          className="rounded-lg p-2 text-muted transition hover:bg-raise hover:text-txt"
        >
          {THEMES[theme].dark ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <button onClick={() => notify('Accounts are not needed — everything runs locally', 'info')} className="rounded-lg p-2 text-muted transition hover:bg-raise hover:text-txt"><User size={17} /></button>

        {w?.isDesktop && (
          <div className="ms-2 flex items-center gap-0.5 border-s border-line ps-2">
            <button onClick={() => w.win.minimize()} className="rounded p-2 text-muted transition hover:bg-raise hover:text-txt"><Minus size={14} /></button>
            <button onClick={() => w.win.maximize()} className="rounded p-2 text-muted transition hover:bg-raise hover:text-txt"><Square size={12} /></button>
            <button onClick={() => w.win.close()} className="rounded p-2 text-muted transition hover:bg-danger hover:text-white"><X size={14} /></button>
          </div>
        )}
      </div>
    </header>
  );
}

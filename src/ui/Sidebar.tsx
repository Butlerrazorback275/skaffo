import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  Home, FolderOpen, Puzzle, Database, Globe, Package, Settings as Cog, Heart,
} from 'lucide-react';
import { useStore, type Route } from '@core/store';

const items: { id: Route; key: string; icon: React.ElementType; needsProject?: boolean }[] = [
  { id: 'dashboard', key: 'nav.dashboard', icon: Home },
  { id: 'projects',  key: 'nav.projects',  icon: FolderOpen },
  { id: 'templates', key: 'nav.templates', icon: Puzzle },
  { id: 'database',  key: 'nav.database',  icon: Database, needsProject: true },
  { id: 'api',       key: 'nav.api',       icon: Globe,    needsProject: true },
  { id: 'export',    key: 'nav.export',    icon: Package,  needsProject: true },
  { id: 'settings',  key: 'nav.settings',  icon: Cog },
];

export default function Sidebar() {
  const route = useStore((s) => s.route);
  const go = useStore((s) => s.go);
  const active = useStore((s) => s.activeProjectId);
  const notify = useStore((s) => s.notify);
  const t = useStore((s) => s.t);

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-e border-line bg-sidebar/80 backdrop-blur-xl">
      <nav className="flex-1 space-y-1 p-3">
        {items.map((it) => {
          const locked = !!it.needsProject && !active;
          const isActive = route === it.id;
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={() => (locked ? notify(t('nav.openFirst'), 'err') : go(it.id))}
              className={clsx(
                'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200',
                isActive ? 'text-txt' : locked ? 'text-muted/40' : 'text-muted hover:bg-raise hover:text-txt',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  className="absolute inset-0 rounded-lg border border-primary/35 bg-primary/12"
                >
                  <span className="absolute inset-y-1.5 start-0 w-[2.5px] rounded-full bg-primary" />
                </motion.span>
              )}
              <Icon size={17} className={clsx('relative z-10', isActive && 'text-indigo-300')} />
              <span className="relative z-10 flex-1 text-start font-medium">{t(it.key)}</span>
              {locked && (
                <span
                  title={t('nav.openFirst')}
                  className="relative z-10 shrink-0 rounded border border-line px-1.5 text-[9px] font-medium uppercase tracking-wide text-muted/70"
                >
                  {t('nav.needsProject')}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-raise p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t('nav.openSource')}
          </p>
          <p className="mt-1 text-sm font-semibold text-txt">{t('nav.freeForever')}</p>
          <p className="mt-0.5 text-[11px] text-muted">FastAPI · React · SQLite</p>
          <button
            onClick={() => go('support')}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-1.5 text-[11px] font-semibold text-txt transition hover:border-primary/60 hover:bg-primary/10"
          >
            <Heart size={11} className="text-rose-400" />
            {t('nav.support')}
          </button>
        </div>
      </div>

    </aside>
  );
}

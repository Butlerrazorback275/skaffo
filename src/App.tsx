import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import '@plugins/index';
import { useStore } from '@core/store';
import Sidebar from '@ui/Sidebar';
import Topbar from '@ui/Topbar';
import BootGate from '@ui/BootGate';
import Dashboard from '@plugins/dashboard/Dashboard';
import Projects from '@plugins/projects/Projects';

// Heavy routes load on demand. React Flow alone is ~150 KB, and most
// sessions never open the Database designer, so shipping it up front just
// slows the first paint.
const Templates        = lazy(() => import('@plugins/templates/Templates'));
const DatabaseDesigner = lazy(() => import('@plugins/database/DatabaseDesigner'));
const ApiDesigner      = lazy(() => import('@plugins/api/ApiDesigner'));
const ExportPage       = lazy(() => import('@plugins/export/Export'));
const Settings         = lazy(() => import('@plugins/settings/Settings'));
const Support          = lazy(() => import('@plugins/support/Support'));
const Wizard           = lazy(() => import('@plugins/wizard/Wizard'));

const PAGES = {
  dashboard: Dashboard,
  projects: Projects,
  templates: Templates,
  database: DatabaseDesigner,
  api: ApiDesigner,
  export: ExportPage,
  settings: Settings,
  support: Support,
} as const;

/** Shown for the few hundred ms a lazy route takes to arrive. */
function RouteFallback() {
  return (
    <div className="grid h-full place-items-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted/30 border-t-primary" />
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const Icon = toast?.kind === 'ok' ? CheckCircle2 : toast?.kind === 'err' ? AlertCircle : Info;
  const tone = toast?.kind === 'ok' ? 'border-success/40 text-emerald-300'
    : toast?.kind === 'err' ? 'border-danger/40 text-red-300'
    : 'border-primary/40 text-indigo-300';
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className={`fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-xl border bg-card/95 px-4 py-3 shadow-glass backdrop-blur-xl ${tone}`}
        >
          <Icon size={16} />
          <span className="text-[13px] font-medium text-txt">{toast.msg}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const route = useStore((s) => s.route);
  const wizardOpen = useStore((s) => s.wizardOpen);
  const Page = PAGES[route];

  return (
    <BootGate>
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-txt antialiased">
      {/* ambient glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-primary/[0.09] blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-hover/[0.07] blur-[120px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <Topbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              <Suspense fallback={<RouteFallback />}>
                <Page />
              </Suspense>
            </motion.div>
          </main>
        </div>
      </div>

      <AnimatePresence>
        {wizardOpen && (
          <Suspense fallback={null}>
            <Wizard />
          </Suspense>
        )}
      </AnimatePresence>
      <Toast />
    </div>
    </BootGate>
  );
}

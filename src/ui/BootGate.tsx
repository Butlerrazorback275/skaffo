import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Hammer, AlertTriangle, RefreshCw, Terminal } from 'lucide-react';
import { useStore } from '@core/store';
import { API_BASE } from '@core/api';
import { Button } from './primitives';

export default function BootGate({ children }: { children: React.ReactNode }) {
  const booted = useStore((s) => s.booted);
  const connection = useStore((s) => s.connection);
  const bootstrap = useStore((s) => s.bootstrap);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  if (!booted) {
    return (
      <div className="grid h-screen place-items-center bg-bg">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-hover shadow-glow">
            <Hammer size={28} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-[17px] font-semibold text-txt">Skaffo</p>
            <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/30 border-t-primary" />
              Starting engine…
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (connection === 'offline') {
    return (
      <div className="grid h-screen place-items-center bg-bg p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-lg rounded-2xl border border-danger/30 bg-card/70 p-7 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-danger/15 text-danger">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-txt">Engine not reachable</p>
              <p className="text-[12px] text-muted">Tried {API_BASE}</p>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-muted">
            The Python backend didn&apos;t answer. If you launched with{' '}
            <code className="rounded bg-well px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">npm run dev:web</code>{' '}
            you need to start it yourself:
          </p>

          <div className="mt-3 rounded-lg border border-line bg-well p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              <Terminal size={11} /> Windows
            </p>
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-emerald-300">{`cd engine
.venv\\Scripts\\python -m app.main`}</pre>
          </div>

          <p className="mt-3 text-[12px] text-muted">
            First time? Run <code className="rounded bg-well px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">setup-engine.bat</code> once
            to create the virtualenv.
          </p>

          <Button className="mt-5 w-full" onClick={() => useStore.getState().bootstrap()}>
            <RefreshCw size={15} /> Retry
          </Button>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}

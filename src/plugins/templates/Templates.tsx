import { motion } from 'framer-motion';
import { HardDrive, Store, Lock, ArrowRight } from 'lucide-react';
import { useStore } from '@core/store';
import type { TemplateId } from '@core/types';
import { Card, Button, Badge, SectionTitle } from '@ui/primitives';

const LOCAL: { id: TemplateId; label: string; emoji: string; desc: string; files: number; tables: string[] }[] = [
  { id: 'blank',     label: 'Blank',      emoji: '📄', desc: 'Bare project skeleton, nothing pre-built.',      files: 42,  tables: [] },
  { id: 'rest-api',  label: 'REST API',   emoji: '🔌', desc: 'Backend-only service with health & docs.',       files: 68,  tables: ['items'] },
  { id: 'blog',      label: 'Blog',       emoji: '✍️', desc: 'Posts, tags, comments and an editor page.',      files: 94,  tables: ['posts', 'tags', 'comments'] },
  { id: 'dashboard', label: 'Dashboard',  emoji: '📊', desc: 'KPI cards, charts and a data table.',            files: 106, tables: ['metrics', 'users'] },
  { id: 'crm',       label: 'CRM',        emoji: '🤝', desc: 'Contacts, companies, deals and a pipeline.',     files: 128, tables: ['contacts', 'companies', 'deals'] },
  { id: 'ecommerce', label: 'E-Commerce', emoji: '🛒', desc: 'Products, cart, orders and checkout flow.',      files: 152, tables: ['users', 'products', 'orders'] },
];

export default function Templates() {
  const setWizard = useStore((s) => s.setWizard);
  const notify = useStore((s) => s.notify);

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-txt">Templates</h1>
        <p className="text-[13px] text-muted">Start from a ready-made blueprint instead of an empty folder.</p>
      </div>

      <SectionTitle right={<Badge tone="success"><HardDrive size={10} /> Offline</Badge>}>Local Templates</SectionTitle>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {LOCAL.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2, delay: i * 0.04 }}>
            <Card hover className="group flex h-full flex-col p-5">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-line bg-raise text-2xl">{t.emoji}</div>
              <p className="text-[15px] font-semibold text-txt">{t.label}</p>
              <p className="mt-1 flex-1 text-[12px] leading-relaxed text-muted">{t.desc}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.tables.length === 0
                  ? <Badge>no tables</Badge>
                  : t.tables.map((x) => <Badge key={x} tone="primary">{x}</Badge>)}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[11px] text-muted">~{t.files} files</span>
                <Button size="sm" variant="outline" onClick={() => setWizard(true)}>Use <ArrowRight size={13} /></Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-8">
        <SectionTitle>Marketplace</SectionTitle>
        <Card className="flex items-center gap-4 border-dashed p-6">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-raise text-muted"><Store size={20} /></div>
          <div className="flex-1">
            <p className="flex items-center gap-2 text-[14px] font-medium text-txt">
              Template Marketplace <Lock size={12} className="text-muted" />
            </p>
            <p className="text-[12px] text-muted">Community templates arrive with the Plugin System.</p>
          </div>
          <Button variant="ghost" onClick={() => notify('You will be notified at release', 'ok')}>Notify me</Button>
        </Card>
      </div>
    </div>
  );
}

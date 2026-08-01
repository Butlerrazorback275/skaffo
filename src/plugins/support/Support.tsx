import { useState } from 'react';
import clsx from 'clsx';
import {
  Heart, Copy, Check, Github, MessageCircle, Star, Bug, Share2, Coffee,
} from 'lucide-react';
import { useStore } from '@core/store';
import { Card, Button, Badge, SectionTitle } from '@ui/primitives';

/**
 * Donation wallets.
 *
 * Paste your real addresses here. Anything still starting with `PASTE_`
 * is treated as unset and hidden from the UI, so a half-finished build can
 * never show an address that would swallow someone's coins.
 */
const WALLETS = [
  { id: 'polygon', label: 'USDT / USDC', network: 'Polygon',
    address: '0x74203660a1EF78B686EC61D4A17B56498e83F636',
    note: 'lowest fees' },
  { id: 'btc', label: 'Bitcoin', network: 'Bitcoin',
    address: 'bc1qvuj0334ynmzzg8ptcds29sc0d2t2kuwx7huz35' },
  { id: 'eth', label: 'Ethereum', network: 'ERC20 · Ethereum',
    address: '0x74203660a1EF78B686EC61D4A17B56498e83F636' },
].filter((w) => !w.address.startsWith('PASTE_'));

const REPO = 'https://github.com/ilia-dev-cmyk/skaffo';
const DISCUSSIONS = `${REPO}/discussions`;
const ISSUES = `${REPO}/issues`;

export default function Support() {
  const t = useStore((s) => s.t);
  const notify = useStore((s) => s.notify);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      notify('Could not copy', 'err');
    }
  };

  const open = (url: string) => window.open(url, '_blank', 'noopener');

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl">
        {/* hero */}
        <Card className="relative mb-5 overflow-hidden p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-raise px-3 py-1">
              <Heart size={12} className="text-rose-400" />
              <span className="text-[11.5px] font-medium text-txt">{t('support.badge')}</span>
            </div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-txt">
              {t('support.title')}
            </h1>
            <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-muted">
              {t('support.intro')}
            </p>
          </div>
        </Card>

        {/* free ways to help — deliberately first */}
        <SectionTitle>{t('support.freeWays')}</SectionTitle>
        <div className="mb-5 grid gap-2.5 sm:grid-cols-2">
          {[
            { icon: Star, key: 'star', action: () => open(REPO) },
            { icon: Bug, key: 'report', action: () => open(ISSUES) },
            { icon: Share2, key: 'share', action: () => open(REPO) },
            { icon: MessageCircle, key: 'feedback', action: () => open(DISCUSSIONS) },
          ].map(({ icon: Icon, key, action }) => (
            <button
              key={key}
              onClick={action}
              className="flex items-start gap-3 rounded-xl border border-line bg-raise p-4 text-start transition hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-txt">{t(`support.${key}`)}</p>
                <p className="text-[11.5px] text-muted">{t(`support.${key}Hint`)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* crypto — only rendered once at least one wallet is filled in */}
        {WALLETS.length > 0 && (<>
        <SectionTitle right={<Badge tone="primary">{t('support.optional')}</Badge>}>
          {t('support.donate')}
        </SectionTitle>
        <Card className="mb-5 p-4">
          <p className="mb-3.5 text-[12.5px] leading-relaxed text-muted">
            {t('support.donateHint')}
          </p>
          <div className="space-y-2">
            {WALLETS.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-well p-3"
              >
                <div className="w-32 shrink-0">
                  <p className="text-[12.5px] font-semibold text-txt">{w.label}</p>
                  <p className="text-[10.5px] text-muted">
                    {w.network}
                    {'note' in w && (
                      <span className="ms-1 text-emerald-400">· {(w as { note: string }).note}</span>
                    )}
                  </p>
                </div>
                <code
                  dir="ltr"
                  className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted"
                >
                  {w.address}
                </code>
                <Button
                  size="sm"
                  variant={copied === w.id ? 'success' : 'outline'}
                  onClick={() => copy(w.id, w.address)}
                  className="shrink-0"
                >
                  {copied === w.id ? <><Check size={12} /> {t('support.copied')}</>
                                   : <><Copy size={12} /> {t('common.copy')}</>}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-line bg-raise p-3">
            <Coffee size={14} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              {t('support.contactHint')}{' '}
              <button
                onClick={() => open(DISCUSSIONS)}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {t('support.discussions')}
              </button>
            </p>
          </div>
        </Card>
        </>)}

        {/* promise */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Github size={16} className="mt-0.5 shrink-0 text-muted" />
            <div>
              <p className="text-[13px] font-medium text-txt">{t('support.promise')}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {t('support.promiseHint')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

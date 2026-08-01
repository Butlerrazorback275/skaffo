import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { AlertCircle, KeyRound, Link2, Table2 } from 'lucide-react';
import type { Table } from '@core/types';

const TYPE_SHORT: Record<string, string> = {
  integer: 'int', bigint: 'bigint', string: 'str', text: 'text', boolean: 'bool',
  float: 'float', decimal: 'dec', datetime: 'datetime', date: 'date', uuid: 'uuid', json: 'json',
};

function TableNodeInner({ data, selected }: NodeProps<{
  table: Table; fkColumnIds: Set<string>; hasError?: boolean;
}>) {
  const { table, fkColumnIds, hasError } = data;
  const accent = table.color ?? '#6366F1';

  return (
    <div
      className={`w-[236px] overflow-hidden rounded-xl border bg-card/95 shadow-glass backdrop-blur-xl transition-all duration-200 ${
        selected
          ? 'border-primary shadow-glow'
          : hasError
            ? 'border-danger/60 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]'
            : 'border-line'
      }`}
    >
      <Handle type="target" position={Position.Left}  className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-card !bg-primary" />

      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: `linear-gradient(90deg, ${accent}33, transparent)` }}>
        <Table2 size={14} style={{ color: accent }} />
        <span className="flex-1 truncate font-mono text-[13px] font-semibold text-txt">{table.name}</span>
        {hasError && <AlertCircle size={12} className="shrink-0 text-red-300" />}
        <span className="rounded bg-well px-1.5 py-0.5 text-[10px] text-muted">{table.columns.length}</span>
      </div>

      <div className="divide-y divide-line/60 border-t border-line">
        {table.columns.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 transition hover:bg-raise">
            {c.primaryKey
              ? <KeyRound size={11} className="shrink-0 text-amber-300" />
              : fkColumnIds.has(c.id)
                ? <Link2 size={11} className="shrink-0 text-violet-300" />
                : <span className="w-[11px] shrink-0" />}
            <span className="flex-1 truncate font-mono text-[11.5px] text-txt">{c.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted">{TYPE_SHORT[c.type] ?? c.type}</span>
            {c.nullable && <span className="shrink-0 text-[10px] text-muted/50">?</span>}
          </div>
        ))}
        {table.columns.length === 0 && (
          <p className="px-3 py-3 text-center text-[11px] text-muted">no columns</p>
        )}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeInner);

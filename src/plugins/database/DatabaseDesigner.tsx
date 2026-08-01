import { useMemo, useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, BackgroundVariant,
  type Node, type Edge, type Connection, type NodeChange, MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, Table2, Trash2, Copy, Pencil, KeyRound, Link2, ChevronRight, X, Database,
  Undo2, Redo2, FileCode, Upload,
} from 'lucide-react';
import { useStore, useActiveProject } from '@core/store';
import type { ColumnType } from '@core/types';
import { Button, Input, Select, Badge, Toggle, Empty } from '@ui/primitives';
import { TableNode } from './TableNode';
import ValidationPanel from './ValidationPanel';
import { DdlDialog, ImportDialog } from './SchemaTools';

const nodeTypes = { table: TableNode };
const COLUMN_TYPES: ColumnType[] = ['integer', 'bigint', 'string', 'text', 'boolean', 'float', 'decimal', 'datetime', 'date', 'uuid', 'json'];

export default function DatabaseDesigner() {
  const project = useActiveProject();
  const s = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'ddl' | 'import' | null>(null);

  const canUndo = useStore((st) => st.canUndo);
  const canRedo = useStore((st) => st.canRedo);
  const undo = useStore((st) => st.undo);
  const redo = useStore((st) => st.redo);
  const validation = useStore((st) => st.validation);
  const runValidation = useStore((st) => st.runValidation);

  useEffect(() => {
    if (!validation) runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault(); redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // tables flagged by the validator get a red ring
  const problemTables = useMemo(() => {
    const ids = new Set<string>();
    validation?.issues.forEach((i) => {
      if (i.severity === 'error' && i.tableId) ids.add(i.tableId);
    });
    return ids;
  }, [validation]);

  const schema = project?.schema ?? { tables: [], relations: [] };
  const selTable = schema.tables.find((t) => t.id === selected) ?? null;

  const fkIds = useMemo(() => new Set(schema.relations.map((r) => r.toColumnId)), [schema.relations]);

  // nodes/edges are DERIVED from schema — single source of truth (REVIEW.md T3)
  const nodes: Node[] = useMemo(() => schema.tables.map((t) => ({
    id: t.id, type: 'table', position: t.position,
    data: { table: t, fkColumnIds: fkIds, hasError: problemTables.has(t.id) },
    selected: t.id === selected,
  })), [schema.tables, fkIds, selected, problemTables]);

  const edges: Edge[] = useMemo(() => schema.relations.map((r) => ({
    id: r.id, source: r.fromTableId, target: r.toTableId,
    animated: true, style: { stroke: '#6366F1', strokeWidth: 1.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366F1' },
    label: r.kind === 'one-to-many' ? '1 : N' : '1 : 1',
    labelStyle: { fill: '#94A3B8', fontSize: 10, fontFamily: 'Inter' },
    labelBgStyle: { fill: '#111827', fillOpacity: 0.9 },
    labelBgPadding: [5, 2] as [number, number], labelBgBorderRadius: 4,
  })), [schema.relations]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach((c) => {
      if (c.type === 'position' && c.position) s.moveTable(c.id, c.position);
      if (c.type === 'select' && c.selected) setSelected(c.id);
    });
  }, [s]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const from = schema.tables.find((t) => t.id === c.source);
    const to = schema.tables.find((t) => t.id === c.target);
    if (!from || !to) return;
    const pk = from.columns.find((x) => x.primaryKey) ?? from.columns[0];
    const fk = to.columns.find((x) => x.name === `${from.name.replace(/s$/, '')}_id`) ?? to.columns[0];
    if (!pk || !fk) return;
    s.addRelation({ kind: 'one-to-many', fromTableId: from.id, fromColumnId: pk.id,
      toTableId: to.id, toColumnId: fk.id, onDelete: 'cascade' });
  }, [schema.tables, s]);

  if (!project) return null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT — tables list */}
      <div className="flex w-[240px] shrink-0 flex-col border-e border-line bg-sidebar/50">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-[13px] font-semibold text-txt">Tables</span>
          <Badge>{schema.tables.length}</Badge>
        </div>

        <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
          <button
            onClick={() => undo()} disabled={!canUndo} title="Undo (Ctrl+Z)"
            className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-txt disabled:opacity-30 disabled:hover:bg-transparent"
          ><Undo2 size={14} /></button>
          <button
            onClick={() => redo()} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
            className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-txt disabled:opacity-30 disabled:hover:bg-transparent"
          ><Redo2 size={14} /></button>
          <span className="mx-1 h-4 w-px bg-line" />
          <button
            onClick={() => setDialog('import')} title="Import schema"
            className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-txt"
          ><Upload size={14} /></button>
          <button
            onClick={() => setDialog('ddl')} title="Export SQL"
            className="rounded p-1.5 text-muted transition hover:bg-raise hover:text-txt"
          ><FileCode size={14} /></button>
        </div>

        <div className="p-3">
          <Button size="sm" className="w-full" onClick={() => s.addTable()}><Plus size={14} /> New Table</Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {schema.tables.map((t) => (
            <div key={t.id}
              onClick={() => setSelected(t.id)}
              className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition duration-200 ${
                selected === t.id ? 'border border-primary/40 bg-primary/15' : 'border border-transparent hover:bg-raise'}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
              {renaming === t.id ? (
                <input
                  autoFocus defaultValue={t.name}
                  onBlur={(e) => { s.renameTable(t.id, e.target.value.trim() || t.name); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="flex-1 rounded border border-primary bg-well px-1 font-mono text-[12px] text-txt outline-none"
                />
              ) : (
                <span className="flex-1 truncate font-mono text-[12.5px] text-txt">{t.name}</span>
              )}
              <span className="text-[10px] text-muted">{t.columns.length}</span>
              <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button onClick={(e) => { e.stopPropagation(); setRenaming(t.id); }} className="rounded p-1 text-muted hover:text-txt"><Pencil size={11} /></button>
                <button onClick={(e) => { e.stopPropagation(); s.duplicateTable(t.id); }} className="rounded p-1 text-muted hover:text-txt"><Copy size={11} /></button>
                <button onClick={(e) => { e.stopPropagation(); s.deleteTable(t.id); setSelected(null); }} className="rounded p-1 text-muted hover:text-danger"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>

        <ValidationPanel onFocus={(tid) => setSelected(tid)} />

        {schema.relations.length > 0 && (
          <div className="border-t border-line p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Relations</p>
            <div className="space-y-1.5">
              {schema.relations.map((r) => {
                const f = schema.tables.find((t) => t.id === r.fromTableId);
                const t2 = schema.tables.find((t) => t.id === r.toTableId);
                return (
                  <div key={r.id} className="group flex items-center gap-1 text-[11px]">
                    <Link2 size={10} className="shrink-0 text-violet-300" />
                    <span className="truncate font-mono text-muted">{f?.name}</span>
                    <ChevronRight size={10} className="rtl-flip shrink-0 text-muted/50" />
                    <span className="flex-1 truncate font-mono text-muted">{t2?.name}</span>
                    <button onClick={() => s.deleteRelation(r.id)} className="opacity-0 transition group-hover:opacity-100"><X size={10} className="text-danger" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CENTER — canvas.
          Pinned to LTR: a schema diagram reads parent → child by convention,
          and React Flow positions handles physically. */}
      <div dir="ltr" className="relative flex-1">
        {schema.tables.length === 0 ? (
          <div className="grid h-full place-items-center">
            <Empty icon={<Database size={26} />} title="Empty schema"
              hint="Add your first table, then drag from one node's right edge to another to create a relation."
              action={<Button onClick={() => s.addTable('users')}><Plus size={16} /> New Table</Button>} />
          </div>
        ) : (
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onConnect={onConnect}
            onPaneClick={() => setSelected(null)}
            fitView proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#334155" />
            <Controls className="!rounded-lg !border !border-line !bg-card/90 !shadow-glass [&_button]:!border-line [&_button]:!bg-transparent [&_button]:!fill-slate-400 [&_button:hover]:!bg-line" />
            <MiniMap
              pannable zoomable
              className="!rounded-lg !border !border-line !bg-card/90"
              maskColor="rgba(15,23,42,0.75)"
              nodeColor={(n) => (n.data?.table?.color ?? '#6366F1')}
            />
          </ReactFlow>
        )}
      </div>

      <AnimatePresence>
        {dialog === 'ddl' && <DdlDialog onClose={() => setDialog(null)} />}
        {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      </AnimatePresence>

      {/* RIGHT — column inspector */}
      {selTable && (
        <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2 }}
          className="flex w-[320px] shrink-0 flex-col border-s border-line bg-sidebar/50">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Table2 size={14} style={{ color: selTable.color }} />
            <span className="flex-1 truncate font-mono text-[13px] font-semibold text-txt">{selTable.name}</span>
            <button onClick={() => setSelected(null)} className="rounded p-1 text-muted hover:text-txt"><X size={14} /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {selTable.columns.map((c) => (
              <div key={c.id} className="rounded-lg border border-line bg-well p-3">
                <div className="flex items-center gap-1.5">
                  <Input value={c.name} onChange={(e) => s.updateColumn(selTable.id, c.id, { name: e.target.value })}
                    className="h-8 flex-1 font-mono text-[12px]" />
                  <button onClick={() => s.deleteColumn(selTable.id, c.id)}
                    className="rounded p-1.5 text-muted transition hover:bg-danger/15 hover:text-danger"><Trash2 size={12} /></button>
                </div>
                <Select value={c.type} onChange={(e) => s.updateColumn(selTable.id, c.id, { type: e.target.value as ColumnType })}
                  className="mt-2 h-8 font-mono text-[12px]">
                  {COLUMN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input value={c.defaultValue ?? ''} placeholder="default value"
                  onChange={(e) => s.updateColumn(selTable.id, c.id, { defaultValue: e.target.value })}
                  className="mt-2 h-8 font-mono text-[12px]" />
                <div className="mt-2.5 space-y-2">
                  {([['primaryKey', 'Primary Key', KeyRound], ['nullable', 'Nullable', null], ['unique', 'Unique', null]] as const).map(([k, label, Icon]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] text-muted">
                        {Icon && <Icon size={11} className="text-amber-300" />}{label}
                      </span>
                      <Toggle on={c[k]} onChange={(v) => s.updateColumn(selTable.id, c.id, { [k]: v })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-3">
            <Button size="sm" variant="outline" className="w-full" onClick={() => s.addColumn(selTable.id)}>
              <Plus size={13} /> Add Column
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

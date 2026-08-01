import { create } from 'zustand';
import type {
  Project, ActivityItem, Column, Relation, Schema, Endpoint,
  ProjectStack, TemplateId, CrudOptions,
} from './types';
import { api, waitForEngine, type ValidationReport } from './api';
import { applyTheme, type ThemeId } from './theme';
import { applyLocale, makeT, type LocaleId } from './i18n';

export type Route =
  | 'dashboard' | 'projects' | 'templates'
  | 'database' | 'api' | 'export' | 'settings' | 'support';

export type Connection = 'connecting' | 'online' | 'offline';

export interface Settings {
  theme: ThemeId;
  language: LocaleId;
  accent: string;
  autoSave: boolean;
  reduceMotion: boolean;
  defaultBackend: ProjectStack['backend'];
  defaultFrontend: ProjectStack['frontend'];
  defaultDatabase: ProjectStack['database'];
  workspace: string;
  checkUpdates: boolean;
  /** First-run welcome has been dismissed. Persisted so it shows once. */
  welcomeSeen: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark', language: 'en', accent: '#6366F1', autoSave: true, reduceMotion: false,
  defaultBackend: 'fastapi', defaultFrontend: 'react', defaultDatabase: 'sqlite',
  workspace: '~/Projects', checkUpdates: true, welcomeSeen: false,
};

interface State {
  route: Route;
  projects: Project[];
  activity: ActivityItem[];
  activeProjectId: string | null;
  wizardOpen: boolean;
  toast: { id: string; msg: string; kind: 'ok' | 'err' | 'info' } | null;
  settings: Settings;
  connection: Connection;
  booted: boolean;

  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;

  go: (r: Route) => void;
  openProject: (id: string) => void;
  closeProject: () => void;

  setWizard: (open: boolean) => void;
  createProject: (p: {
    name: string; description: string; template: TemplateId; stack: ProjectStack;
  }) => Promise<string | null>;

  togglePin: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  markBuild: (id: string) => Promise<void>;
  markExport: (id: string) => Promise<void>;

  addTable: (name?: string) => Promise<void>;
  renameTable: (tid: string, name: string) => Promise<void>;
  deleteTable: (tid: string) => Promise<void>;
  duplicateTable: (tid: string) => Promise<void>;
  moveTable: (tid: string, pos: { x: number; y: number }) => void;
  addColumn: (tid: string) => Promise<void>;
  updateColumn: (tid: string, cid: string, patch: Partial<Column>) => Promise<void>;
  deleteColumn: (tid: string, cid: string) => Promise<void>;
  addRelation: (r: Omit<Relation, 'id'>) => Promise<void>;
  deleteRelation: (rid: string) => Promise<void>;

  generateCrud: (entity: string) => Promise<void>;
  createEndpoint: (body: Partial<Endpoint> & { path: string }) => Promise<boolean>;
  patchEndpoint: (eid: string, body: Partial<Endpoint>) => Promise<boolean>;
  setCrudOption: (entity: string, patch: Partial<CrudOptions>) => Promise<void>;
  deleteEndpoint: (eid: string) => Promise<void>;

  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  t: (key: string, fallback?: string) => string;
  dir: 'ltr' | 'rtl';
  notify: (msg: string, kind?: 'ok' | 'err' | 'info') => void;

  // ── Phase 4 ──
  validation: ValidationReport | null;
  validating: boolean;
  runValidation: () => Promise<void>;
  autoFix: (codes?: string[]) => Promise<void>;

  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  snapshot: (label: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Push theme, accent and motion preference to the document. */
function applyAppearance(s: Settings): void {
  applyTheme(s.theme, s.accent);
  document.documentElement.dataset.motion = s.reduceMotion ? 'reduced' : 'full';
  // Cached so main.tsx can paint the right theme before React mounts.
  try {
    localStorage.setItem('cf.appearance', JSON.stringify({
      theme: s.theme, accent: s.accent, language: s.language, reduceMotion: s.reduceMotion,
    }));
  } catch { /* private mode — non-fatal */ }
}

function localeDir(id: LocaleId): 'ltr' | 'rtl' {
  return id === 'fa' || id === 'ar' ? 'rtl' : 'ltr';
}


export const useStore = create<State>((set, get) => {
  /** Replace one project in the list, preserving order. */
  const put = (p: Project) =>
    set((s) => ({ projects: s.projects.map((x) => (x.id === p.id ? p : x)) }));

  /** Re-fetch the active project (schema/api mutations return partial data). */
  const reloadActive = async () => {
    const id = get().activeProjectId;
    if (!id) return;
    try {
      const [projects, activity] = await Promise.all([api.listProjects(), api.activity()]);
      set({ projects, activity });
      get().runValidation();          // fire and forget; UI shows a spinner
    } catch (e) { fail(e); }
  };

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Request failed';
    get().notify(msg, 'err');
    console.error('[skaffo]', e);
  };

  // Table dragging fires continuously — persist only the final position.
  const moveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── undo / redo ─────────────────────────────────────────
  // We snapshot the whole schema before each structural edit and replay it
  // through the API on undo. Simpler and far more robust than inverting
  // every individual operation.
  interface Snap { projectId: string; label: string; schema: Schema }
  const past: Snap[] = [];
  const future: Snap[] = [];
  const HISTORY_LIMIT = 50;

  const syncHistoryFlags = () =>
    set({ canUndo: past.length > 0, canRedo: future.length > 0 });

  const currentSchema = (): Schema | null => {
    const st = get();
    const p = st.projects.find((x) => x.id === st.activeProjectId);
    return p ? structuredClone(p.schema) : null;
  };

  const pushHistory = (label: string) => {
    const pid = get().activeProjectId;
    const schema = currentSchema();
    if (!pid || !schema) return;
    past.push({ projectId: pid, label, schema });
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    syncHistoryFlags();
  };

  /** Replay a snapshot in ONE atomic request.
   *
   *  The first version issued a delete/add per table and per column, which
   *  produced dozens of rapid SQLite writes and could trip "database is
   *  locked". The engine now swaps the schema inside a single transaction.
   */
  const restore = async (snap: Snap) => {
    const pid = snap.projectId;

    // Relations reference columns by id; ids are regenerated server-side, so
    // send positional indexes instead and let the engine remap them.
    const colIndex = new Map<string, number>();
    snap.schema.tables.forEach((t) => {
      t.columns.forEach((c, i) => colIndex.set(c.id, i));
    });

    await api.replaceSchema(pid, {
      tables: snap.schema.tables.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? '#6366F1',
        position: t.position,
        columns: t.columns.map((c) => ({
          name: c.name, type: c.type, primaryKey: c.primaryKey,
          nullable: c.nullable, unique: c.unique,
          defaultValue: c.defaultValue ?? null,
        })),
      })),
      relations: snap.schema.relations
        .map((r) => ({
          kind: r.kind,
          fromTableId: r.fromTableId,
          fromColumnIndex: colIndex.get(r.fromColumnId) ?? -1,
          toTableId: r.toTableId,
          toColumnIndex: colIndex.get(r.toColumnId) ?? -1,
          onDelete: r.onDelete,
        }))
        .filter((r) => r.fromColumnIndex >= 0 && r.toColumnIndex >= 0),
    });

    await get().refresh();
  };

  return {
    route: 'dashboard',
    projects: [],
    activity: [],
    activeProjectId: null,
    wizardOpen: false,
    toast: null,
    settings: DEFAULT_SETTINGS,
    connection: 'connecting',
    booted: false,
    validation: null,
    validating: false,
    canUndo: false,
    canRedo: false,
    t: makeT('en'),
    dir: 'ltr',

    async bootstrap() {
      set({ connection: 'connecting' });
      const up = await waitForEngine();
      if (!up) {
        set({ connection: 'offline', booted: true });
        return;
      }
      try {
        const [projects, activity, settings] = await Promise.all([
          api.listProjects(), api.activity(), api.getSettings(),
        ]);
        const merged = { ...DEFAULT_SETTINGS, ...settings };
        applyAppearance(merged);
        set({
          projects, activity,
          settings: merged,
          t: makeT(merged.language),
          dir: localeDir(merged.language),
          connection: 'online', booted: true,
        });
      } catch (e) {
        set({ connection: 'offline', booted: true });
        fail(e);
      }
    },

    async refresh() {
      try {
        const [projects, activity] = await Promise.all([api.listProjects(), api.activity()]);
        set({ projects, activity });
      } catch (e) { fail(e); }
    },

    go: (route) => set({ route }),
    openProject: (id) => {
      past.length = 0; future.length = 0;
      set({ activeProjectId: id, route: 'dashboard', canUndo: false, canRedo: false, validation: null });
      get().notify('Project opened', 'ok');
      get().runValidation();
    },
    closeProject: () => {
      past.length = 0; future.length = 0;
      set({ activeProjectId: null, canUndo: false, canRedo: false, validation: null });
    },
    setWizard: (wizardOpen) => set({ wizardOpen }),

    async createProject({ name, description, template, stack }) {
      try {
        const p = await api.createProject({ name, description, template, stack });
        set((s) => ({ projects: [p, ...s.projects], activeProjectId: p.id, wizardOpen: false }));
        get().notify(`"${p.name}" created`, 'ok');
        api.activity().then((activity) => set({ activity })).catch(() => {});
        return p.id;
      } catch (e) { fail(e); return null; }
    },

    async togglePin(id) {
      const cur = get().projects.find((p) => p.id === id);
      if (!cur) return;
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)) }));
      try { put(await api.patchProject(id, { pinned: !cur.pinned })); }
      catch (e) { fail(e); get().refresh(); }
    },

    async deleteProject(id) {
      const p = get().projects.find((x) => x.id === id);
      set((s) => ({
        projects: s.projects.filter((x) => x.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      }));
      try {
        await api.deleteProject(id);
        if (p) get().notify(`"${p.name}" deleted`, 'err');
      } catch (e) { fail(e); get().refresh(); }
    },

    async markBuild(id) {
      try { put(await api.markBuild(id)); get().notify('Build succeeded', 'ok'); api.activity().then((activity) => set({ activity })); }
      catch (e) { fail(e); }
    },

    async markExport(id) {
      try { put(await api.markExport(id)); api.activity().then((activity) => set({ activity })); }
      catch (e) { fail(e); }
    },

    // ── schema ──────────────────────────────────────────
    async addTable(name) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Add table');
      const p = get().projects.find((x) => x.id === pid)!;
      const finalName = name || `table_${p.schema.tables.length + 1}`;
      const color = ['#6366F1', '#10B981', '#7C3AED', '#F59E0B'][Math.floor(Math.random() * 4)];
      try {
        await api.addTable(pid, {
          name: finalName, color,
          position: { x: 80 + Math.random() * 320, y: 80 + Math.random() * 200 },
        });
        await reloadActive();
      } catch (e) { fail(e); }
    },

    async renameTable(tid, name) {
      const pid = get().activeProjectId; if (!pid) return;
      set((s) => ({ projects: s.projects.map((p) => p.id === pid ? { ...p, schema: { ...p.schema,
        tables: p.schema.tables.map((t) => (t.id === tid ? { ...t, name } : t)) } } : p) }));
      try { await api.patchTable(pid, tid, { name }); }
      catch (e) { fail(e); get().refresh(); }
    },

    async deleteTable(tid) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Delete table');
      try { await api.deleteTable(pid, tid); await reloadActive(); }
      catch (e) { fail(e); }
    },

    async duplicateTable(tid) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Duplicate table');
      try { await api.duplicateTable(pid, tid); await reloadActive(); }
      catch (e) { fail(e); }
    },

    moveTable(tid, position) {
      const pid = get().activeProjectId; if (!pid) return;
      // optimistic — canvas must stay smooth
      set((s) => ({ projects: s.projects.map((p) => p.id === pid ? { ...p, schema: { ...p.schema,
        tables: p.schema.tables.map((t) => (t.id === tid ? { ...t, position } : t)) } } : p) }));

      clearTimeout(moveTimers.get(tid));
      moveTimers.set(tid, setTimeout(() => {
        api.patchTable(pid, tid, { position }).catch(() => {});
        moveTimers.delete(tid);
      }, 500));
    },

    async addColumn(tid) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Add column');
      try {
        await api.addColumn(pid, tid, { name: 'new_field', type: 'string', nullable: true });
        await reloadActive();
      } catch (e) { fail(e); }
    },

    async updateColumn(tid, cid, patch) {
      const pid = get().activeProjectId; if (!pid) return;
      set((s) => ({ projects: s.projects.map((p) => p.id === pid ? { ...p, schema: { ...p.schema,
        tables: p.schema.tables.map((t) => t.id === tid
          ? { ...t, columns: t.columns.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : t) } } : p) }));
      try { await api.patchColumn(pid, tid, cid, patch); }
      catch (e) { fail(e); get().refresh(); }
    },

    async deleteColumn(tid, cid) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Delete column');
      try { await api.deleteColumn(pid, tid, cid); await reloadActive(); }
      catch (e) { fail(e); }
    },

    async addRelation(r) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Add relation');
      try {
        await api.addRelation(pid, r);
        await reloadActive();
        get().notify('Relation created', 'ok');
      } catch (e) { fail(e); }
    },

    async deleteRelation(rid) {
      const pid = get().activeProjectId; if (!pid) return;
      pushHistory('Delete relation');
      try { await api.deleteRelation(pid, rid); await reloadActive(); }
      catch (e) { fail(e); }
    },

    // ── api designer ────────────────────────────────────
    async generateCrud(entity) {
      const pid = get().activeProjectId; if (!pid) return;
      try {
        const apiPayload = await api.generateCrud(pid, entity);
        set((s) => ({ projects: s.projects.map((p) => (p.id === pid ? { ...p, api: apiPayload } : p)) }));
        get().notify(`CRUD generated for "${entity}"`, 'ok');
        api.activity().then((activity) => set({ activity })).catch(() => {});
      } catch (e) { fail(e); }
    },

    async createEndpoint(body) {
      const pid = get().activeProjectId;
      if (!pid) return false;
      try {
        const api2 = await api.createEndpoint(pid, body);
        set((st) => ({ projects: st.projects.map((p) => (p.id === pid ? { ...p, api: api2 } : p)) }));
        get().notify(`${body.method ?? 'GET'} ${body.path} added`, 'ok');
        return true;
      } catch (e) { fail(e); return false; }
    },

    async patchEndpoint(eid, body) {
      const pid = get().activeProjectId;
      if (!pid) return false;
      try {
        const api2 = await api.patchEndpoint(pid, eid, body);
        set((st) => ({ projects: st.projects.map((p) => (p.id === pid ? { ...p, api: api2 } : p)) }));
        get().notify('Endpoint updated', 'ok');
        return true;
      } catch (e) { fail(e); return false; }
    },

    async setCrudOption(entity, patch) {
      const pid = get().activeProjectId; if (!pid) return;
      set((s) => ({ projects: s.projects.map((p) => p.id === pid ? { ...p, api: { ...p.api,
        crudOptions: { ...p.api.crudOptions, [entity]: {
          ...(p.api.crudOptions[entity] ?? { search: false, pagination: false, sorting: false, filtering: false }),
          ...patch } } } } : p) }));
      try { await api.patchCrudOptions(pid, entity, patch); }
      catch (e) { fail(e); get().refresh(); }
    },

    async deleteEndpoint(eid) {
      const pid = get().activeProjectId; if (!pid) return;
      set((s) => ({ projects: s.projects.map((p) => p.id === pid
        ? { ...p, api: { ...p.api, endpoints: p.api.endpoints.filter((e) => e.id !== eid) } } : p) }));
      try { await api.deleteEndpoint(pid, eid); }
      catch (e) { fail(e); get().refresh(); }
    },

    setSetting(k, v) {
      const next = { ...get().settings, [k]: v } as Settings;

      // Appearance is applied to the DOM immediately — no reload, no flash.
      if (k === 'theme' || k === 'accent' || k === 'reduceMotion') applyAppearance(next);
      if (k === 'language') {
        applyAppearance(next);        // refresh the cache too
        applyLocale(next.language);
        set({ t: makeT(next.language), dir: localeDir(next.language) });
      }

      set({ settings: next });
      api.putSettings({ [k]: v } as Partial<Settings>).catch(() => {});
    },

    notify(msg, kind = 'info') {
      const id = uid();
      set({ toast: { id, msg, kind } });
      setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 2600);
    },

    // ── Phase 4: validation ─────────────────────────────
    async runValidation() {
      const pid = get().activeProjectId;
      if (!pid) { set({ validation: null }); return; }
      set({ validating: true });
      try { set({ validation: await api.validateSchema(pid) }); }
      catch (e) { fail(e); }
      finally { set({ validating: false }); }
    },

    async autoFix(codes) {
      const pid = get().activeProjectId;
      if (!pid) return;
      pushHistory('Auto-fix');
      try {
        const res = await api.fixSchema(pid, codes);
        set({ validation: res.report });
        await get().refresh();
        get().notify(
          res.applied.length ? `Fixed ${res.applied.length} issue(s)` : 'Nothing to fix',
          res.applied.length ? 'ok' : 'info',
        );
      } catch (e) { fail(e); }
    },

    // ── Phase 4: undo / redo ────────────────────────────
    snapshot(label) { pushHistory(label); },

    async undo() {
      const snap = past.pop();
      if (!snap) return;
      const now = currentSchema();
      const pid = get().activeProjectId;
      if (now && pid) future.push({ projectId: pid, label: snap.label, schema: now });
      syncHistoryFlags();
      get().notify(`Undo: ${snap.label}`, 'info');
      await restore(snap);
      await get().runValidation();
    },

    async redo() {
      const snap = future.pop();
      if (!snap) return;
      const now = currentSchema();
      const pid = get().activeProjectId;
      if (now && pid) past.push({ projectId: pid, label: snap.label, schema: now });
      syncHistoryFlags();
      get().notify(`Redo: ${snap.label}`, 'info');
      await restore(snap);
      await get().runValidation();
    },
  };
});

export const useActiveProject = () =>
  useStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null);

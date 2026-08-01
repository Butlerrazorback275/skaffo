import type { SkaffoPlugin, ProjectContext, GeneratedFile } from './types';

/**
 * Plugin registry — the "main rule" of Skaffo.
 * Modules register here; nothing imports another module directly.
 */
class PluginRegistry {
  private plugins = new Map<string, SkaffoPlugin>();

  register(plugin: SkaffoPlugin) {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[skaffo] plugin "${plugin.id}" already registered — overwriting`);
    }
    this.plugins.set(plugin.id, plugin);
    return this;
  }

  get(id: string) { return this.plugins.get(id); }
  all() { return [...this.plugins.values()]; }
  byCapability(cap: SkaffoPlugin['capabilities'][number]) {
    return this.all().filter((p) => p.enabled && p.capabilities.includes(cap));
  }

  /** Run every enabled generator and merge output. Dry-run friendly. */
  async runGenerators(ctx: ProjectContext): Promise<GeneratedFile[]> {
    const out: GeneratedFile[] = [];
    for (const p of this.byCapability('generator')) {
      if (!p.generate) continue;
      const files = await p.generate(ctx);
      out.push(...files);
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
}

export const registry = new PluginRegistry();

// ── tiny event bus so modules stay decoupled ──
type Handler = (payload: unknown) => void;
const bus = new Map<string, Set<Handler>>();

export const events = {
  on(evt: string, fn: Handler) {
    if (!bus.has(evt)) bus.set(evt, new Set());
    bus.get(evt)!.add(fn);
    return () => bus.get(evt)!.delete(fn);
  },
  emit(evt: string, payload?: unknown) {
    bus.get(evt)?.forEach((fn) => fn(payload));
  },
};

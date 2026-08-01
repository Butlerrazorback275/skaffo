import { registry } from '@core/registry';

/**
 * Phase 1: modules register themselves as plugins but carry no generator yet.
 * Phase 3+ attaches real `generate()` implementations — no UI change required.
 */
registry
  .register({ id: 'core.dashboard', name: 'Dashboard',         version: '0.1.0', enabled: true, capabilities: ['designer'] })
  .register({ id: 'core.wizard',    name: 'Project Wizard',    version: '0.1.0', enabled: true, capabilities: ['designer'] })
  .register({ id: 'designer.db',    name: 'Database Designer', version: '0.1.0', enabled: true, capabilities: ['designer'] })
  .register({ id: 'designer.api',   name: 'API Designer',      version: '0.1.0', enabled: true, capabilities: ['designer'] })
  .register({ id: 'template.local', name: 'Local Templates',   version: '0.1.0', enabled: true, capabilities: ['template'] })
  .register({ id: 'export.zip',     name: 'ZIP Exporter',      version: '0.1.0', enabled: true, capabilities: ['exporter'] })
  .register({ id: 'gen.fastapi',    name: 'FastAPI Generator', version: '0.0.0', enabled: false, capabilities: ['generator'] })
  .register({ id: 'gen.react',      name: 'React Generator',   version: '0.0.0', enabled: false, capabilities: ['generator'] });

export { registry };

// ─────────────────────────────────────────────────────────────
// Skaffo Core — Single source of truth for all data shapes.
// Every plugin speaks ONLY these types.
// ─────────────────────────────────────────────────────────────

export type BackendId = 'fastapi' | 'node' | 'laravel' | 'spring' | 'django';
export type FrontendId = 'react' | 'vue' | 'angular' | 'flutter';
export type DatabaseId = 'sqlite' | 'postgresql' | 'mysql';
export type AuthId = 'none' | 'jwt' | 'oauth';
export type TemplateId = 'blank' | 'rest-api' | 'blog' | 'dashboard' | 'crm' | 'ecommerce';

export type ColumnType =
  | 'integer' | 'bigint' | 'string' | 'text' | 'boolean'
  | 'float' | 'decimal' | 'datetime' | 'date' | 'uuid' | 'json';

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  defaultValue?: string;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  position: { x: number; y: number };
  color?: string;
}

/** Only 1-1 and 1-N in v1 (M-N deferred — see REVIEW.md T4) */
export type RelationKind = 'one-to-one' | 'one-to-many';

export interface Relation {
  id: string;
  kind: RelationKind;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  onDelete: 'cascade' | 'restrict' | 'set null';
}

export interface Schema {
  tables: Table[];
  relations: Relation[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ParamLocation = 'query' | 'path' | 'header';

export interface EndpointParam {
  name: string;
  in: ParamLocation;
  type: ColumnType;
  required: boolean;
  default?: string | null;
  description?: string;
}

export interface RequestField {
  name: string;
  type: ColumnType;
  required: boolean;
}

export type ResponseKind = 'entity' | 'list' | 'custom' | 'none';

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  entity: string;
  generated: boolean;
  description: string;
  params: EndpointParam[];
  requestFields: RequestField[];
  responseKind: ResponseKind;
  responseEntity: string;
  statusCode: number;
  authRequired: boolean;
  tag: string;
  sortOrder: number;
}

export interface CrudOptions {
  search: boolean;
  pagination: boolean;
  sorting: boolean;
  filtering: boolean;
}

export interface ApiDesign {
  endpoints: Endpoint[];
  crudOptions: Record<string, CrudOptions>;
}

export interface ProjectStack {
  backend: BackendId;
  frontend: FrontendId;
  database: DatabaseId;
  auth: AuthId;
  docker: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  template: TemplateId;
  stack: ProjectStack;
  schema: Schema;
  api: ApiDesign;
  path: string;
  pinned: boolean;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  lastBuildAt: string | null;
  lastExportAt: string | null;
  fileCount: number;
  linesOfCode: number;
}

export interface ActivityItem {
  id: string;
  kind: 'create' | 'generate' | 'export' | 'build' | 'edit' | 'delete';
  projectId: string;
  projectName: string;
  message: string;
  at: string;
}

// ── Plugin SDK contract ──────────────────────────────────────
export interface GeneratedFile {
  path: string;
  content: string;
  binary?: boolean;
}

export interface ProjectContext {
  project: Project;
  schema: Schema;
  api: ApiDesign;
}

export type PluginCapability = 'generator' | 'designer' | 'exporter' | 'template';

export interface SkaffoPlugin {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
  enabled: boolean;
  /** Pure function: context in, files out. NEVER touches disk. */
  generate?(ctx: ProjectContext): Promise<GeneratedFile[]> | GeneratedFile[];
}

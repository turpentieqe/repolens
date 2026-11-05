export interface ModuleNode {
  id: string;
  name: string;
  directory: string;
  extension: string;
  lines: number;
  size: number;
  exports: string[];
  external: string[];
  unresolved: string[];
  importedBy: number;
  imports: number;
  cycleId: number | null;
}

export interface ModuleEdge {
  source: string;
  target: string;
  typeOnly: boolean;
}

export interface ProjectGraph {
  project: { name: string; analyzedAt: string; durationMs: number; demo: boolean };
  nodes: ModuleNode[];
  edges: ModuleEdge[];
  cycles: string[][];
  warnings: string[];
}

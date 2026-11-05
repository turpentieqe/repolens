import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Download,
  FileCode2,
  Folder,
  GitBranch,
  Layers3,
  List,
  Loader2,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { ModuleNode, ProjectGraph } from '../shared/graph';
import { categories, category, Graph, nodeColor } from './Graph';

type Filter = 'all' | 'cycles' | 'entry' | 'hubs';

export function App() {
  const [graph, setGraph] = useState<ProjectGraph | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [directory, setDirectory] = useState('all');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(refresh ? '/api/refresh' : '/api/graph', {
        method: refresh ? 'POST' : 'GET',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the project.');
      setGraph(data);
      setSelected((old) => (data.nodes.some((node: ModuleNode) => node.id === old) ? old : null));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the project.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const input =
        event.target instanceof HTMLElement &&
        (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) ||
          event.target.isContentEditable);
      if (event.key === '/' && !input && !help) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        if (help) {
          setHelp(false);
          helpButton.current?.focus();
        } else {
          setSelected(null);
          setSearch('');
          searchRef.current?.blur();
        }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [help]);
  const groups = useMemo(() => (graph ? categories(graph) : []), [graph]);
  const visible = useMemo(
    () =>
      graph?.nodes.filter((node) => {
        if (search && !node.id.toLowerCase().includes(search.toLowerCase())) return false;
        if (directory !== 'all' && category(node.id) !== directory) return false;
        if (filter === 'cycles' && node.cycleId === null) return false;
        if (filter === 'entry' && node.importedBy !== 0) return false;
        if (filter === 'hubs' && node.importedBy < 3) return false;
        return true;
      }) ?? [],
    [graph, search, directory, filter],
  );
  const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);
  useEffect(() => {
    if (selected && !visibleIds.has(selected)) setSelected(null);
  }, [visibleIds, selected]);
  const current = graph?.nodes.find((node) => node.id === selected);
  const hubs = useMemo(
    () =>
      [...(graph?.nodes ?? [])]
        .sort((a, b) => b.importedBy - a.importedBy || a.id.localeCompare(b.id))
        .filter((node) => node.importedBy > 0)
        .slice(0, 5),
    [graph],
  );
  const unresolved = graph?.nodes.reduce((count, node) => count + node.unresolved.length, 0) ?? 0;
  const choose = (id: string | null) => {
    setSelected(id);
  };
  const reveal = (id: string) => {
    setSelected(id);
    setFilter('all');
    setDirectory('all');
    setSearch('');
  };
  const resetFilters = () => {
    setSearch('');
    setFilter('all');
    setDirectory('all');
  };
  const navigate = (next: Filter) => {
    resetFilters();
    setFilter(next);
    setSelected(null);
  };
  function download() {
    if (!graph) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${graph.project.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-repolens.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="RepoLens home">
          <span className="brand-mark">
            <Network size={22} strokeWidth={1.7} />
          </span>
          <span>
            repo<span className="brand-light">lens</span>
            <sup> / </sup>
          </span>
        </a>
        <div className="workspace-card">
          <span className="project-icon">
            <Box size={18} />
          </span>
          <div>
            <strong title={graph?.project.name}>{graph?.project.name ?? 'Your project'}</strong>
            <span>
              <i className="live-dot" /> Local workspace
            </span>
          </div>
          <span className="version-tag">TS</span>
        </div>
        <div className="section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Workspace views">
          <button
            className={filter === 'all' || filter === 'entry' ? 'active' : ''}
            onClick={() => navigate('all')}
          >
            <Network size={17} />
            <span>Graph explorer</span>
            <span className="nav-dot" />
          </button>
          <button
            className={filter === 'cycles' ? 'active' : ''}
            onClick={() => navigate('cycles')}
          >
            <RefreshCw size={16} />
            <span>Circular dependencies</span>
            {!!graph?.cycles.length && (
              <span className="count-badge amber">{graph.cycles.length}</span>
            )}
          </button>
          <button className={filter === 'hubs' ? 'active' : ''} onClick={() => navigate('hubs')}>
            <Activity size={17} />
            <span>Highly connected</span>
          </button>
        </nav>
        <div className="section-label files-heading">
          PROJECT FILES <span>{graph?.nodes.length ?? '—'}</span>
        </div>
        <div className="file-tree">
          {groups.map((group) => {
            const children = visible.filter((node) => category(node.id) === group);
            if (!children.length) return null;
            const closed = collapsed.has(group);
            return (
              <div className="tree-group" key={group}>
                <button
                  className="folder-row"
                  aria-expanded={!closed}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    })
                  }
                >
                  {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <Folder size={14} style={{ color: nodeColor(children[0].id, groups) }} />
                  <span>{group}</span>
                  <small>{children.length}</small>
                </button>
                {!closed &&
                  children.map((node) => (
                    <button
                      key={node.id}
                      title={node.id}
                      onClick={() => choose(node.id)}
                      className={`file-row ${selected === node.id ? 'selected' : ''}`}
                    >
                      <span className={`file-type ${node.extension.includes('t') ? 'ts' : 'js'}`}>
                        {node.extension.endsWith('x')
                          ? '≋'
                          : node.extension.includes('t')
                            ? 'TS'
                            : 'JS'}
                      </span>
                      <span>{node.name}</span>
                      {node.cycleId !== null && <i className="cycle-dot" />}
                    </button>
                  ))}
              </div>
            );
          })}
          {graph && !visible.length && <p className="tree-empty">No matching modules</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <div>
              <strong>Your code stays yours.</strong>
              <span>Analyzed on your machine.</span>
            </div>
          </div>
          <button
            className="help-button"
            onClick={(event) => {
              helpButton.current = event.currentTarget;
              setHelp(true);
            }}
          >
            <CircleHelp size={16} />
            About & shortcuts<span>?</span>
          </button>
          <div className="sidebar-footer">
            <span>
              RepoLens <b>v0.1.0</b>
            </span>
            <span className="mvp-badge">MVP</span>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>Dependency explorer</strong>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <i className="live-dot" />
              Running locally
            </span>
            <button
              className="icon-button"
              aria-label="About RepoLens"
              onClick={(event) => {
                helpButton.current = event.currentTarget;
                setHelp(true);
              }}
            >
              <CircleHelp size={15} />
            </button>
            <span className="topbar-divider" />
            <span className="avatar">RL</span>
          </div>
        </header>
        <div className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> A FRESH PERSPECTIVE ON YOUR CODE
            </div>
            <h1>
              See how it all connects<span>.</span>
            </h1>
            <p>A map of your codebase. Less digging, more understanding.</p>
          </div>
          <button
            className="button rescan-button"
            disabled={loading}
            onClick={() => void load(true)}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            {loading ? 'Scanning…' : 'Rescan project'}
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <TriangleAlert size={17} />
            <span>{error}</span>
            <button onClick={() => void load()}>Retry</button>
          </div>
        )}
        <section className="stats-grid" aria-label="Project statistics">
          <Stat
            icon={<Layers3 size={17} />}
            label="Total modules"
            value={graph?.nodes.length}
            detail="The building blocks"
          />
          <Stat
            icon={<GitBranch size={17} />}
            label="Connections"
            value={graph?.edges.length}
            detail="Internal import relationships"
          />
          <Stat
            icon={<RefreshCw size={16} />}
            label="Cycle groups"
            value={graph?.cycles.length}
            detail={graph?.cycles.length ? 'Worth a closer look' : 'No circular dependencies'}
            warning={!!graph?.cycles.length}
            action={() => navigate('cycles')}
          />
          <Stat
            icon={<ArrowUpRight size={18} />}
            label="Entry candidates"
            value={graph?.nodes.filter((node) => node.importedBy === 0).length}
            detail="Modules with no importers"
            action={() => navigate('entry')}
          />
        </section>
        <section className="explorer">
          <div className="explorer-toolbar">
            <div className="view-tabs" role="group" aria-label="Display mode">
              <button
                className={view === 'graph' ? 'active' : ''}
                aria-pressed={view === 'graph'}
                onClick={() => setView('graph')}
              >
                <Network size={15} />
                Graph
              </button>
              <button
                className={view === 'list' ? 'active' : ''}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={16} />
                Modules
              </button>
            </div>
            <div className="toolbar-actions">
              <label className="search-field">
                <Search size={15} />
                <input
                  ref={searchRef}
                  aria-label="Search modules"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a module…"
                />
                {search ? (
                  <button onClick={() => setSearch('')} aria-label="Clear search">
                    <X size={13} />
                  </button>
                ) : (
                  <kbd>/</kbd>
                )}
              </label>
              <button
                className="button export-button"
                onClick={download}
                disabled={!graph}
                title="Download the dependency graph"
              >
                <Download size={14} />
                <span>Export JSON</span>
              </button>
            </div>
          </div>
          <div className="filter-bar">
            <div className="filter-chips">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                All modules
              </button>
              <button
                className={filter === 'cycles' ? 'active' : ''}
                onClick={() => setFilter('cycles')}
              >
                <i className="cycle-dot" />
                In a cycle
              </button>
              <button
                className={filter === 'entry' ? 'active' : ''}
                onClick={() => setFilter('entry')}
              >
                Entry candidates
              </button>
              {filter === 'hubs' && (
                <button className="active" onClick={() => setFilter('all')}>
                  3+ importers <X size={11} />
                </button>
              )}
            </div>
            <div className="folder-filter">
              <Folder size={13} />
              <select
                aria-label="Filter by folder"
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
              >
                <option value="all">All folders</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="explorer-body">
            <div className="visual-area">
              {!graph ? (
                <div className="loading-state">
                  {loading ? (
                    <>
                      <Loader2 size={28} className="spin" />
                      <h3>Connecting the dots…</h3>
                      <p>Reading imports. Never executing your code.</p>
                    </>
                  ) : (
                    <>
                      <TriangleAlert size={28} />
                      <h3>Couldn't load your project</h3>
                      <button className="button" onClick={() => void load()}>
                        Try again
                      </button>
                    </>
                  )}
                </div>
              ) : graph.nodes.length === 0 ? (
                <div className="loading-state">
                  <Folder size={32} />
                  <h3>A blank canvas</h3>
                  <p>No JavaScript or TypeScript files found in this project.</p>
                  <span className="muted">Add a module, then rescan to see it here.</span>
                </div>
              ) : view === 'graph' ? (
                <Graph
                  graph={graph}
                  visibleIds={visibleIds}
                  selected={selected}
                  onSelect={choose}
                />
              ) : (
                <ModuleTable
                  nodes={visible}
                  selected={selected}
                  groups={groups}
                  onSelect={choose}
                />
              )}
              {graph && (search || filter !== 'all' || directory !== 'all') && (
                <div className="filter-summary">
                  <span>
                    Showing {visible.length} of {graph.nodes.length} modules
                  </span>
                  <button onClick={resetFilters}>
                    Clear filters <X size={11} />
                  </button>
                </div>
              )}
            </div>
            <aside
              className="inspector"
              aria-label={current ? 'Module details' : 'Project insights'}
            >
              {graph && current ? (
                <ModuleDetails
                  key={current.id}
                  node={current}
                  graph={graph}
                  groups={groups}
                  onSelect={reveal}
                  onClose={() => setSelected(null)}
                />
              ) : graph ? (
                <>
                  <div className="inspector-heading">
                    <span>
                      <Sparkles size={15} />
                      Project pulse
                    </span>
                    <span className="tiny-tag">OVERVIEW</span>
                  </div>
                  <div className="pulse-hero">
                    <div className="orbit-illustration">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="orbit-core">
                        <Network size={25} />
                      </div>
                      <i className="planet p1" />
                      <i className="planet p2" />
                      <i className="planet p3" />
                    </div>
                    <h2>The shape of your project.</h2>
                    <p>
                      Every dot is a module.
                      <br />
                      Every connection tells a story.
                    </p>
                  </div>
                  <div className={`cycle-notice ${graph.cycles.length ? '' : 'healthy'}`}>
                    <div>
                      {graph.cycles.length ? <TriangleAlert size={17} /> : <Check size={17} />}
                      <strong>
                        {graph.cycles.length
                          ? `${graph.cycles.length} circular dependency groups`
                          : 'No cycles. Nice and clear.'}
                      </strong>
                    </div>
                    <p>
                      {graph.cycles.length
                        ? 'Some modules depend on each other. Explore these groups to untangle them.'
                        : 'Your module graph has no circular import relationships.'}
                    </p>
                    {!!graph.cycles.length && (
                      <button onClick={() => navigate('cycles')}>
                        Explore cycles <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                  <div className="inspector-section">
                    <div className="section-heading">
                      MOST CONNECTED <span>IMPORTERS</span>
                    </div>
                    {hubs.length ? (
                      hubs.map((node, index) => (
                        <button className="hub-row" key={node.id} onClick={() => reveal(node.id)}>
                          <span className="hub-rank">0{index + 1}</span>
                          <div>
                            <strong>{node.name}</strong>
                            <small>{node.directory}</small>
                          </div>
                          <span className="hub-value">{node.importedBy}</span>
                          <ChevronRight size={13} />
                        </button>
                      ))
                    ) : (
                      <p className="muted">No internal imports yet.</p>
                    )}
                  </div>
                  {!!graph.cycles.length && (
                    <div className="inspector-section cycle-groups">
                      <div className="section-heading">
                        CYCLE GROUPS <span>{graph.cycles.length}</span>
                      </div>
                      {graph.cycles.map((group, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            navigate('cycles');
                            setSelected(group[0]);
                          }}
                        >
                          <RefreshCw size={13} />
                          <span>Group {index + 1}</span>
                          <small>{group.length} modules</small>
                          <ChevronRight size={12} />
                        </button>
                      ))}
                      <p className="micro-note">Includes type-only import relationships.</p>
                    </div>
                  )}
                  {(!!unresolved || !!graph.warnings.length) && (
                    <div className="scan-warnings">
                      <TriangleAlert size={14} />
                      <span>
                        {unresolved} unresolved local imports · {graph.warnings.length} scan
                        warnings
                      </span>
                      {graph.warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                    </div>
                  )}
                  <div className="inspector-tip">
                    <Command size={14} />
                    <p>Select a module to follow its imports and discover what depends on it.</p>
                  </div>
                </>
              ) : null}
            </aside>
          </div>
          <footer className="explorer-footer">
            <span>
              <i className={error ? 'cycle-dot' : 'live-dot'} />
              {loading ? 'Analyzing project…' : error ? 'Scan failed' : 'Analysis complete'}
              {graph && !error && (
                <span className="footer-timing">in {graph.project.durationMs} ms</span>
              )}
            </span>
            <span className="footer-legend">
              <span className="solid-line" /> import <span className="dashed-line" /> type-only
            </span>
            <span>
              {graph?.project.demo ? 'DEMO PROJECT' : 'LOCAL PROJECT'}
              <span className="footer-separator">/</span>JS + TS
            </span>
          </footer>
        </section>
        <footer className="page-footer">
          <span>Built for curious developers.</span>
          <span>
            <ShieldCheck size={12} />
            No uploads. No API keys. Just your code.
          </span>
        </footer>
      </main>
      {help && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setHelp(false);
              helpButton.current?.focus();
            }
          }}
        >
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onKeyDown={(event) => {
              if (event.key === 'Tab') {
                event.preventDefault();
              }
            }}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close help"
              onClick={() => {
                setHelp(false);
                helpButton.current?.focus();
              }}
            >
              <X size={19} />
            </button>
            <span className="brand-mark">
              <Network size={23} />
            </span>
            <h2 id="help-title">A little clarity for your code.</h2>
            <p>
              RepoLens maps JS/TS imports using the TypeScript parser. Everything stays on your
              machine, and project code is never executed.
            </p>
            <div className="help-shortcuts">
              <span>
                Find a module <kbd>/</kbd>
              </span>
              <span>
                Clear search & selection <kbd>Esc</kbd>
              </span>
              <span>
                Inspect a focused node <kbd>Enter</kbd>
              </span>
            </div>
            <h3>What this MVP understands</h3>
            <p>
              Static imports, re-exports, literal dynamic imports and require(), and
              tsconfig/jsconfig aliases. Dashed lines are type-only imports. Cycles include
              type-only edges; entry candidates simply have no importers.
            </p>
            <p className="muted">
              Only the root .gitignore is honored. Computed imports and bundler-only aliases aren't
              resolved. Dependencies, build folders and symlinks are skipped. Rescan manually after
              changing files.
            </p>
            <div className="help-command">
              <span>Scan your own project</span>
              <code>npm start -- /path/to/project</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  warning,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  detail: string;
  warning?: boolean;
  action?: () => void;
}) {
  const content = (
    <>
      <div className="stat-label">
        <span>{label}</span>
        <span className={warning ? 'stat-icon warning' : 'stat-icon'}>{icon}</span>
      </div>
      <div className={`stat-value ${warning ? 'warning' : ''}`}>
        {value?.toString().padStart(2, '0') ?? '—'}
        {warning && (
          <span className="attention-tag">
            Take a look <ArrowUpRight size={11} />
          </span>
        )}
      </div>
      <div className="stat-detail">
        {warning && <i className="cycle-dot" />}
        {detail}
        {action && !warning && <ArrowUpRight size={12} />}
      </div>
    </>
  );
  return action ? (
    <button className={`stat-card ${warning ? 'warning-card' : ''}`} onClick={action}>
      {content}
    </button>
  ) : (
    <div className="stat-card">{content}</div>
  );
}

function ModuleTable({
  nodes,
  selected,
  groups,
  onSelect,
}: {
  nodes: ModuleNode[];
  selected: string | null;
  groups: string[];
  onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState<'id' | 'importedBy' | 'imports' | 'lines'>('importedBy');
  const sorted = [...nodes].sort((a, b) =>
    sort === 'id' ? a.id.localeCompare(b.id) : b[sort] - a[sort] || a.id.localeCompare(b.id),
  );
  return (
    <div className="module-table-container">
      <table className="module-table">
        <thead>
          <tr>
            <th>
              <button onClick={() => setSort('id')}>
                Module {sort === 'id' && <ChevronDown size={12} />}
              </button>
            </th>
            <th>
              <button onClick={() => setSort('importedBy')}>
                In {sort === 'importedBy' && <ChevronDown size={12} />}
              </button>
            </th>
            <th>
              <button onClick={() => setSort('imports')}>
                Out {sort === 'imports' && <ChevronDown size={12} />}
              </button>
            </th>
            <th>
              <button onClick={() => setSort('lines')}>
                Lines {sort === 'lines' && <ChevronDown size={12} />}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((node) => (
            <tr key={node.id} className={selected === node.id ? 'selected' : ''}>
              <td>
                <button onClick={() => onSelect(node.id)}>
                  <FileCode2 size={17} style={{ color: nodeColor(node.id, groups) }} />
                  <span>
                    <strong>{node.name}</strong>
                    <small>{node.directory}</small>
                  </span>
                  {node.cycleId !== null && <TriangleAlert size={13} className="warning" />}
                </button>
              </td>
              <td>{node.importedBy}</td>
              <td>{node.imports}</td>
              <td>{node.lines}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!nodes.length && (
        <div className="table-empty">
          <Search size={25} />
          <h3>No matching modules</h3>
          <p>Try another search or clear your filters.</p>
        </div>
      )}
    </div>
  );
}

function ModuleDetails({
  node,
  graph,
  groups,
  onSelect,
  onClose,
}: {
  node: ModuleNode;
  graph: ProjectGraph;
  groups: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'imports' | 'importers'>('imports');
  const links = graph.edges.filter((edge) =>
    tab === 'imports' ? edge.source === node.id : edge.target === node.id,
  );
  const cycle = node.cycleId === null ? null : graph.cycles[node.cycleId];
  return (
    <>
      <div className="inspector-heading">
        <span>
          <FileCode2 size={15} />
          Module details
        </span>
        <button className="icon-button" aria-label="Close module details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="module-profile">
        <span
          className="module-type-icon"
          style={{
            color: nodeColor(node.id, groups),
            borderColor: `${nodeColor(node.id, groups)}33`,
          }}
        >
          <Braces size={24} />
        </span>
        <h2>{node.name}</h2>
        <p>{node.id}</p>
        <div className="module-meta">
          <span>{node.extension.toUpperCase()}</span>
          <span>{node.lines} lines</span>
          <span>{node.size < 1024 ? `${node.size} B` : `${(node.size / 1024).toFixed(1)} KB`}</span>
        </div>
      </div>
      <div className="connection-counts">
        <div>
          <ArrowDownLeft size={15} />
          <strong>{node.importedBy}</strong>
          <span>Imported by</span>
        </div>
        <div>
          <ArrowUpRight size={15} />
          <strong>{node.imports}</strong>
          <span>Imports</span>
        </div>
      </div>
      {cycle && (
        <div className="module-cycle">
          <span>
            <RefreshCw size={14} />
            Part of cycle group {node.cycleId! + 1}
          </span>
          <div>
            {cycle.map((id) => (
              <button
                key={id}
                className={id === node.id ? 'current' : ''}
                onClick={() => onSelect(id)}
              >
                {id.split('/').pop()}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="detail-tabs">
        <button className={tab === 'imports' ? 'active' : ''} onClick={() => setTab('imports')}>
          Imports <span>{node.imports}</span>
        </button>
        <button className={tab === 'importers' ? 'active' : ''} onClick={() => setTab('importers')}>
          Imported by <span>{node.importedBy}</span>
        </button>
      </div>
      <div className="dependency-list">
        {links.length ? (
          links.map((edge) => {
            const id = tab === 'imports' ? edge.target : edge.source;
            return (
              <button key={id} onClick={() => onSelect(id)}>
                <FileCode2 size={15} style={{ color: nodeColor(id, groups) }} />
                <div>
                  <strong>{id.split('/').pop()}</strong>
                  <small>{id.split('/').slice(0, -1).join('/') || '.'}</small>
                </div>
                {edge.typeOnly && <span className="tiny-tag">TYPE</span>}
                <ChevronRight size={12} />
              </button>
            );
          })
        ) : (
          <p className="empty-detail">
            {tab === 'imports'
              ? 'No internal imports. A self-contained module.'
              : 'No other modules import this file.'}
          </p>
        )}
      </div>
      <div className="inspector-section">
        <div className="section-heading">
          EXPORTS <span>{node.exports.length}</span>
        </div>
        <div className="export-tags">
          {node.exports.length ? (
            node.exports.map((name) => <span key={name}>{name}</span>)
          ) : (
            <p className="muted">No ES module exports.</p>
          )}
        </div>
      </div>
      {!!node.external.length && (
        <div className="inspector-section">
          <div className="section-heading">
            EXTERNAL PACKAGES <span>{node.external.length}</span>
          </div>
          {node.external.map((name) => (
            <div className="external-package" key={name}>
              <Box size={14} />
              <code>{name}</code>
              <ArrowUpRight size={12} />
            </div>
          ))}
        </div>
      )}
      {!!node.unresolved.length && (
        <div className="inspector-section">
          <div className="section-heading warning">UNRESOLVED IMPORTS</div>
          {node.unresolved.map((name) => (
            <p className="unresolved-import" key={name}>
              {name}
            </p>
          ))}
        </div>
      )}
      <div className="inspector-tip">
        <Network size={14} />
        <p>Follow a connection to explore the next module. Bigger dots have more connections.</p>
      </div>
    </>
  );
}

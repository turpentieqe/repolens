import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { Focus, Minus, Plus, RotateCcw } from 'lucide-react';
import type { ProjectGraph } from '../shared/graph';

export const palette = [
  '#b8e986',
  '#af9cf3',
  '#78b7e5',
  '#e6bd75',
  '#e39599',
  '#77c8b5',
  '#b2b9c1',
];
export function category(id: string) {
  const parts = id.split('/');
  if (parts[0] === 'src') parts.shift();
  return parts.length > 1 ? parts[0] : 'root';
}
export function categories(graph: ProjectGraph) {
  return [...new Set(graph.nodes.map((node) => category(node.id)))].sort();
}
export function nodeColor(id: string, groups: string[]) {
  return palette[groups.indexOf(category(id)) % palette.length] ?? palette[0];
}

interface Point extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
  radius: number;
}
interface Props {
  graph: ProjectGraph;
  visibleIds: Set<string>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function Graph({ graph, visibleIds, selected, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 980, height: 640 });
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{
    id?: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const groups = useMemo(() => categories(graph), [graph]);
  const points = useMemo(() => {
    const nodes: Point[] = graph.nodes.map((node, index) => {
      const group = groups.indexOf(category(node.id));
      const angle = (group / Math.max(groups.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        id: node.id,
        x: 490 + Math.cos(angle) * 220 + Math.sin(index * 5) * 45,
        y: 310 + Math.sin(angle) * 190 + Math.cos(index * 3) * 45,
        radius: Math.min(21, 7 + Math.sqrt(node.importedBy + node.imports) * 2.1),
      };
    });
    const links = graph.edges.map((edge) => ({ source: edge.source, target: edge.target }));
    const simulation = forceSimulation(nodes)
      .force(
        'link',
        forceLink<Point, { source: string; target: string }>(links)
          .id((node) => node.id)
          .distance(115)
          .strength(0.25),
      )
      .force('charge', forceManyBody().strength(-520))
      .force(
        'collision',
        forceCollide<Point>().radius((node) => node.radius + 39),
      )
      .force('center', forceCenter(490, 310))
      .force(
        'x',
        forceX<Point>(
          (node) =>
            490 +
            Math.cos(
              (groups.indexOf(category(node.id)) / Math.max(groups.length, 1)) * Math.PI * 2 -
                Math.PI / 2,
            ) *
              260,
        ).strength(0.09),
      )
      .force(
        'y',
        forceY<Point>(
          (node) =>
            310 +
            Math.sin(
              (groups.indexOf(category(node.id)) / Math.max(groups.length, 1)) * Math.PI * 2 -
                Math.PI / 2,
            ) *
              210,
        ).strength(0.09),
      )
      .stop();
    for (let i = 0; i < 230; i++) simulation.tick();
    if (nodes.length) {
      const minX = Math.min(...nodes.map((node) => node.x));
      const maxX = Math.max(...nodes.map((node) => node.x));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxY = Math.max(...nodes.map((node) => node.y));
      const scaleX = Math.max(120, size.width - 160) / Math.max(maxX - minX, 1);
      const scaleY = Math.max(120, size.height - 110) / Math.max(maxY - minY, 1);
      nodes.forEach((node) => {
        node.x = (node.x - (maxX + minX) / 2) * scaleX + size.width / 2;
        node.y = (node.y - (maxY + minY) / 2) * scaleY + size.height / 2;
      });
    }
    return nodes;
  }, [graph, groups, size]);
  useEffect(() => {
    setOverrides({});
    setView({ x: 0, y: 0, scale: 1 });
  }, [graph, size]);
  const positioned = points.map((point) => ({ ...point, ...overrides[point.id] }));
  const byId = new Map(positioned.map((point) => [point.id, point]));
  const metadata = new Map(graph.nodes.map((node) => [node.id, node]));
  const active = hovered ?? selected;
  const neighbors = new Set<string>(active ? [active] : []);
  graph.edges.forEach((edge) => {
    if (edge.source === active) neighbors.add(edge.target);
    if (edge.target === active) neighbors.add(edge.source);
  });
  const zoom = (factor: number) =>
    setView((current) => {
      const scale = Math.max(0.4, Math.min(3, current.scale * factor));
      const ratio = scale / current.scale;
      return {
        x: size.width / 2 - (size.width / 2 - current.x) * ratio,
        y: size.height / 2 - (size.height / 2 - current.y) * ratio,
        scale,
      };
    });
  function coordinates(clientX: number, clientY: number) {
    const matrix = svg.current?.getScreenCTM();
    return matrix
      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      : { x: clientX, y: clientY };
  }
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const cursor = coordinates(event.clientX, event.clientY);
      setView((current) => {
        const scale = Math.max(0.4, Math.min(3, current.scale * (event.deltaY < 0 ? 1.1 : 0.9)));
        const ratio = scale / current.scale;
        return {
          x: cursor.x - (cursor.x - current.x) * ratio,
          y: cursor.y - (cursor.y - current.y) * ratio,
          scale,
        };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  function focusSelected() {
    const point = selected ? byId.get(selected) : undefined;
    if (point)
      setView({
        x: size.width / 2 - point.x * 1.6,
        y: size.height / 2 - point.y * 1.6,
        scale: 1.6,
      });
    else setView({ x: 0, y: 0, scale: 1 });
  }
  return (
    <div className="graph-canvas">
      <div className="canvas-caption">
        <span className="live-dot" /> DEPENDENCY MAP <span className="caption-divider">/</span>{' '}
        {visibleIds.size} MODULES
      </div>
      <svg
        ref={svg}
        className="dependency-svg"
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-label="Interactive dependency graph. Select a module to inspect its connections."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = (event.target as Element).closest('[data-node]');
          const id = target?.getAttribute('data-node') ?? undefined;
          const point = coordinates(event.clientX, event.clientY);
          const node = id ? byId.get(id) : undefined;
          drag.current = {
            id,
            startX: point.x,
            startY: point.y,
            x: node?.x ?? view.x,
            y: node?.y ?? view.y,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const point = coordinates(event.clientX, event.clientY);
          const dx = point.x - current.startX;
          const dy = point.y - current.startY;
          if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
          if (!current.moved) return;
          if (current.id)
            setOverrides((old) => ({
              ...old,
              [current.id!]: { x: current.x + dx / view.scale, y: current.y + dy / view.scale },
            }));
          else setView((old) => ({ ...old, x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          if (drag.current && !drag.current.moved) onSelect(drag.current.id ?? null);
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L7,3.5 L0,7" fill="#89977d" />
          </marker>
          <marker
            id="arrow-active"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L8,4 L0,8" fill="#b8e986" />
          </marker>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
          {graph.edges
            .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
            .map((edge) => {
              const source = byId.get(edge.source)!;
              const target = byId.get(edge.target)!;
              const highlighted = edge.source === active || edge.target === active;
              const cycle =
                metadata.get(edge.source)?.cycleId != null &&
                metadata.get(edge.source)?.cycleId === metadata.get(edge.target)?.cycleId;
              const dx = target.x - source.x,
                dy = target.y - source.y;
              const length = Math.hypot(dx, dy) || 1;
              const endX = target.x - (dx / length) * (target.radius + 6);
              const endY = target.y - (dy / length) * (target.radius + 6);
              return (
                <path
                  key={`${edge.source}:${edge.target}`}
                  d={
                    source === target
                      ? `M${source.x - 6},${source.y - source.radius} C${source.x - 55},${source.y - 65} ${source.x + 55},${source.y - 65} ${source.x + 6},${source.y - source.radius}`
                      : `M${source.x},${source.y} Q${(source.x + endX) / 2 - dy * 0.08},${(source.y + endY) / 2 + dx * 0.08} ${endX},${endY}`
                  }
                  fill="none"
                  stroke={highlighted ? '#b8e986' : cycle ? '#b88760' : '#69745f'}
                  strokeWidth={highlighted ? 1.7 : 1.05}
                  opacity={active ? (highlighted ? 0.85 : 0.09) : cycle ? 0.55 : 0.38}
                  strokeDasharray={edge.typeOnly ? '4 5' : undefined}
                  markerEnd={highlighted ? 'url(#arrow-active)' : 'url(#arrow)'}
                />
              );
            })}
          {positioned
            .filter((node) => visibleIds.has(node.id))
            .map((point) => {
              const node = metadata.get(point.id)!;
              const color = nodeColor(point.id, groups);
              const isActive = point.id === active;
              return (
                <g
                  key={point.id}
                  data-node={point.id}
                  className="graph-node"
                  transform={`translate(${point.x},${point.y})`}
                  opacity={active && !neighbors.has(point.id) ? 0.22 : 1}
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect ${point.id}`}
                  aria-pressed={selected === point.id}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(point.id);
                    }
                  }}
                  onMouseEnter={() => setHovered(point.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>
                    {point.id} · {node.importedBy} incoming · {node.imports} outgoing
                  </title>
                  <circle r={point.radius + 12} fill="transparent" />
                  {isActive && (
                    <circle
                      r={point.radius + 8}
                      fill={`${color}0b`}
                      stroke={color}
                      strokeWidth="1"
                      opacity="0.6"
                    />
                  )}
                  <circle
                    className="node-ring"
                    r={point.radius + 4}
                    fill="none"
                    stroke={color}
                    strokeOpacity="0.13"
                  />
                  <circle
                    r={point.radius}
                    fill={`${color}1c`}
                    stroke={color}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                  <circle r={3.2} fill={color} />
                  {node.cycleId !== null && (
                    <circle
                      cx={point.radius - 1}
                      cy={-point.radius + 1}
                      r="3.5"
                      fill="#e6bd75"
                      stroke="#161915"
                      strokeWidth="1.5"
                    />
                  )}
                  {((graph.nodes.length < 120 && size.width >= 600) ||
                    graph.nodes.length <= 12 ||
                    isActive ||
                    view.scale > 1.5) && (
                    <text
                      y={point.radius + 20}
                      textAnchor="middle"
                      fill={isActive ? '#ecf2e7' : '#aeb5a9'}
                      fontSize="11"
                      fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      </svg>
      {visibleIds.size === 0 && (
        <div className="graph-empty">
          <SearchEmpty />
          <h3>No modules in this view</h3>
          <p>Try another search or clear your filters.</p>
        </div>
      )}
      <div className="graph-legend">
        {groups
          .filter((group) =>
            graph.nodes.some((node) => category(node.id) === group && visibleIds.has(node.id)),
          )
          .map((group) => (
            <span key={group}>
              <i style={{ background: palette[groups.indexOf(group) % palette.length] }} />
              {group}
            </span>
          ))}
      </div>
      <div className="graph-controls">
        <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
          <Minus size={15} />
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={15} />
        </button>
        <i />
        <button aria-label="Focus selected module" onClick={focusSelected}>
          <Focus size={16} />
        </button>
        <button
          aria-label="Reset graph view"
          onClick={() => {
            setView({ x: 0, y: 0, scale: 1 });
            setOverrides({});
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="canvas-hint">
        Scroll to zoom <b>·</b> Drag to explore <b>·</b> Click to inspect
      </div>
    </div>
  );
}
function SearchEmpty() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  );
}

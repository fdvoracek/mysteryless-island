import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, Position, useNodesState, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { GraphList } from "./graph";
import type { Graph, GraphNode } from "./story";
import { arrange, NODE_HEIGHT, NODE_WIDTH, type StoryOptions } from "./story-layout";
import type { Viewport } from "./story-prefs";
import type { Pins, Pin } from "./layout-file";
import "@xyflow/react/dist/style.css";

function AreaBox({ data }: NodeProps) { return <div className="story-group-label">{String((data as { label: string }).label)}</div>; }
const nodeTypes = { area: AreaBox };

export interface StoryGraphProps {
  graph: Graph; options: Pick<StoryOptions, "direction" | "spacing" | "group">; pins: Pins;
  /** Nodes outside this set are dimmed and inert. */
  focus?: ReadonlySet<string>; selected?: string;
  select: (n: GraphNode) => void; open: (n: GraphNode) => void; inspect: (n: GraphNode) => void;
  pin: (id: string, pos: Pin) => void; unpin: (id: string) => void;
  viewport?: Viewport; moved: (v: Viewport) => void;
  /** Bumped by Re-arrange: recompute and fit. */
  arranged: number;
  /** Bumped by search: centre this node. */
  centre?: { id: string; seq: number };
  areaLabel: (area: string) => string;
  /** Rendered next to the view switch (counts, layout status). */
  toolbar?: ReactNode;
}

export function StoryGraphView(props: StoryGraphProps) {
  const [list, setList] = useState(false);
  const { graph } = props;
  return <section className="graph-view" aria-label="Story graph"><div className="row-actions"><button type="button" aria-pressed={!list} onClick={() => setList(false)}>Graph view</button><button type="button" aria-pressed={list} onClick={() => setList(true)}>Accessible list view</button><span>{graph.nodes.length} nodes · {graph.edges.length} edges</span>{props.toolbar}</div>
    {list
      ? <GraphList graph={graph} node={props.select} inspect={props.inspect} focus={props.focus} selected={props.selected}
          extra={n => <>{n.file && <button type="button" disabled={!!props.focus && !props.focus.has(n.id)} aria-label={`Open ${n.id}`} onClick={() => props.open(n)}>Open</button>}{props.pins[n.id] && <button type="button" aria-label={`Unpin ${n.id}`} onClick={() => props.unpin(n.id)}>Unpin</button>}</>} />
      : <div className="flow-canvas"><ReactFlowProvider><Canvas {...props} /></ReactFlowProvider></div>}
  </section>;
}

function Canvas({ graph, options, pins, focus, selected, select, open, inspect, pin, unpin, viewport, moved, arranged, centre, areaLabel }: StoryGraphProps) {
  const arrangement = useMemo(() => arrange(graph, options, pins, areaLabel), [graph, options, pins, areaLabel, arranged]);
  const computed = useMemo<Node[]>(() => {
    const dim = (id: string) => !!focus && !focus.has(id);
    const boxes: Node[] = arrangement.groups.map(g => ({ id: g.id, type: "area", position: { x: g.x, y: g.y }, data: { label: g.label }, className: "story-group", draggable: false, selectable: false, focusable: false, connectable: false, zIndex: -1, style: { width: g.width, height: g.height, pointerEvents: "none" as const } }));
    const nodes: Node[] = graph.nodes.map(n => {
      const out = dim(n.id), pinned = !!pins[n.id];
      return {
        id: n.id, position: arrangement.positions.get(n.id)!, sourcePosition: options.direction === "LR" ? Position.Right : Position.Bottom, targetPosition: options.direction === "LR" ? Position.Left : Position.Top,
        className: `story-node kind-${n.kind}${n.id === selected ? " is-selected" : ""}${out ? " is-dimmed" : ""}${pinned ? " is-pinned" : ""}`,
        ariaLabel: `${n.kind}: ${n.label}`, draggable: !out, selectable: !out, focusable: !out, style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT, ...(out ? { pointerEvents: "none" as const } : {}) },
        data: { label: <div>{`${n.kind}: ${n.label}${n.note ? ` · ${n.note}` : ""}`}{pinned && <span className="pin-mark"> · pinned</span>}
          <div className="node-actions nodrag nopan">
            {n.file && <button className="node-open" type="button" aria-label={`Open ${n.id}`} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); open(n); }}>Open</button>}
            {["discovery", "quest"].includes(n.kind) && <button className="node-continue" type="button" aria-label={`Continue the story from ${n.id}`} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); inspect(n); }}>Continue the story</button>}
            {pinned && <button className="node-unpin" type="button" aria-label={`Unpin ${n.id}`} onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); unpin(n.id); }}>Unpin</button>}
          </div></div> },
      };
    });
    return [...boxes, ...nodes];
  }, [arrangement, graph, options.direction, pins, focus, selected, open, inspect, unpin]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(computed);
  useEffect(() => setNodes(computed), [computed, setNodes]);
  const edges = useMemo(() => {
    const parallel = new Map<string, number>(), ids = new Set(graph.nodes.map(n => n.id));
    return graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => {
      const key = `${e.source}:${e.target}`, index = parallel.get(key) ?? 0;
      parallel.set(key, index + 1);
      const out = !!focus && (!focus.has(e.source) || !focus.has(e.target));
      return { ...e, type: "default", pathOptions: { curvature: 0.2 + index * 0.25 }, markerEnd: { type: MarkerType.ArrowClosed }, className: out ? "is-dimmed" : undefined, style: e.label === "completes" ? { strokeDasharray: "5 5" } : undefined, ariaLabel: `${e.source} → ${e.target}: ${e.label}` };
    });
  }, [graph, focus]);
  const rf = useReactFlow();
  // Centre on a search hit, and refit after Re-arrange or when the focused set changes.
  const seen = useRef({ centre: centre?.seq, arranged });
  useEffect(() => {
    if (centre && centre.seq !== seen.current.centre) {
      seen.current.centre = centre.seq;
      const p = arrangement.positions.get(centre.id);
      if (p) void rf.setCenter(p.x + NODE_WIDTH / 2, p.y + NODE_HEIGHT / 2, { zoom: Math.max(rf.getZoom(), 0.8), duration: 150 });
    }
  }, [centre, arrangement, rf]);
  useEffect(() => {
    if (arranged !== seen.current.arranged) { seen.current.arranged = arranged; void rf.fitView({ duration: 150 }); }
  }, [arranged, rf]);
  const focused = useRef<ReadonlySet<string> | undefined>(undefined);
  useEffect(() => {
    if (focus && focus !== focused.current) void rf.fitView({ nodes: [...focus].map(id => ({ id })), duration: 150, padding: 0.3 });
    focused.current = focus;
  }, [focus, rf]);
  // A fresh view fits unless a viewport was remembered; later structure changes refit via the key below.
  const first = useRef(true);
  const defaultViewport = first.current ? viewport : undefined;
  first.current = false;
  return <ReactFlow
    key={JSON.stringify([graph.nodes.map(n => n.id), graph.edges.map(e => [e.source, e.target]), options])}
    nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
    {...(defaultViewport ? { defaultViewport } : { fitView: true })}
    minZoom={0.1} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
    onMoveEnd={(event, v) => { if (event) moved({ x: v.x, y: v.y, zoom: v.zoom }); }}
    onNodeClick={(_, n) => { const found = graph.nodes.find(v => v.id === n.id); if (found) select(found); }}
    onNodeDoubleClick={(_, n) => { const found = graph.nodes.find(v => v.id === n.id); if (found?.file) open(found); }}
    onNodeDragStop={(_, n) => { if (graph.nodes.some(v => v.id === n.id)) pin(n.id, n.position); }}>
    <Background /><Controls showInteractive={false} />
  </ReactFlow>;
}

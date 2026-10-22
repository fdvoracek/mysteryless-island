import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MarkerType, Position, type Node, type Edge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { Graph, GraphEdge, GraphNode } from "./story";
import "@xyflow/react/dist/style.css";

export function layoutGraph(graph: Graph): { nodes: Node[]; edges: Edge[] } {
  const layout = new dagre.graphlib.Graph().setGraph({ rankdir: "LR", ranksep: 170, nodesep: 45 }).setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) layout.setNode(node.id, { width: 240, height: 92 });
  const ids = new Set(graph.nodes.map(n => n.id));
  for (const edge of graph.edges) if (ids.has(edge.source) && ids.has(edge.target)) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);
  const parallel = new Map<string, number>();
  return {
    nodes: graph.nodes.map(n => { const p = layout.node(n.id); return { id: n.id, position: { x: p.x - 120, y: p.y - 46 }, data: { label: `${n.kind}: ${n.label}${n.note ? ` · ${n.note}` : ""}` }, className: `story-node kind-${n.kind}${n.note === "start scene" ? " is-start" : ""}`, sourcePosition: Position.Right, targetPosition: Position.Left, ariaLabel: `${n.kind}: ${n.label}`, style: { width: 240, minHeight: 92 } }; }),
    edges: graph.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => {
      const key = `${e.source}:${e.target}`, index = parallel.get(key) ?? 0;
      parallel.set(key, index + 1);
      return { ...e, type: "default", pathOptions: { curvature: 0.2 + index * 0.25 }, markerEnd: { type: MarkerType.ArrowClosed }, style: e.label === "completes" ? { strokeDasharray: "5 5" } : undefined, ariaLabel: `${e.source} → ${e.target}: ${e.label}` }; }),
  };
}
export function GraphList({ graph, node, edge, inspect }: { graph: Graph; node: (n: GraphNode) => void; edge?: (e: GraphEdge) => void; inspect?: (n: GraphNode) => void }) {
  return <section aria-label="Graph list"><h3>Nodes ({graph.nodes.length})</h3><ul>{graph.nodes.map(n => <li key={n.id} data-node={n.id}><button type="button" onClick={() => node(n)}>{n.kind}: {n.label}</button>{n.note && <span> · {n.note}</span>}{inspect && ["discovery", "quest"].includes(n.kind) && <button type="button" aria-label={`Continue the story from ${n.id}`} onClick={() => inspect(n)}>Continue the story</button>}</li>)}</ul><h3>Edges ({graph.edges.length})</h3><ul>{graph.edges.map(e => <li key={e.id} data-edge={e.id}>{edge ? <button type="button" onClick={() => edge(e)}>{e.source} → {e.target}: {e.label}</button> : <span>{e.source} → {e.target}: {e.label}</span>}<small> {e.file} › {e.path}</small></li>)}</ul></section>;
}
export function GraphView({ graph, node, edge, title, inspect }: { graph: Graph; node: (n: GraphNode) => void; edge?: (e: GraphEdge) => void; title: string; inspect?: (n: GraphNode) => void }) {
  const [list, setList] = useState(false);
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const nodes = layout.nodes.map(n => {
    const source = graph.nodes.find(v => v.id === n.id)!;
    return inspect && ["discovery", "quest"].includes(source.kind) ? { ...n, data: { ...n.data, label: <div>{String(n.data.label)}<button className="node-continue nodrag nopan" type="button" aria-label={`Continue the story from ${source.id}`} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); inspect(source); }}>Continue the story</button></div> } } : n;
  });
  return <section className="graph-view" aria-label={title}><div className="row-actions"><button type="button" aria-pressed={!list} onClick={() => setList(false)}>Graph view</button><button type="button" aria-pressed={list} onClick={() => setList(true)}>Accessible list view</button><span>{graph.nodes.length} nodes · {graph.edges.length} edges</span></div>
    {list ? <GraphList graph={graph} node={node} edge={edge} inspect={inspect} /> : <div className="flow-canvas"><ReactFlow key={JSON.stringify([graph.nodes.map(n => n.id), graph.edges.map(e => [e.source, e.target])])} nodes={nodes} edges={layout.edges} fitView minZoom={0.1} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} onNodeClick={(_, n) => node(graph.nodes.find(v => v.id === n.id)!)} onEdgeClick={(_, e) => edge?.(graph.edges.find(v => v.id === e.id)!)}><Background /><Controls showInteractive={false} /></ReactFlow></div>}
  </section>;
}

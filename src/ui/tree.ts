import type { ButtonView, TreeView } from "../core/selectors";
import type { RequirementEntry } from "../core/action-rules";

function describe(entry: RequirementEntry): string {
  if (entry.children) {
    const parts = entry.children.map(describe);
    return entry.operator === "not" ? `not (${parts.join("")})` : `(${parts.join(entry.operator === "any" ? " or " : " and ")})`;
  }
  return entry.kind === "material" ? `${entry.label}: ${entry.required} required, ${entry.available} available`
    : entry.kind === "limit" ? `${entry.label}: ${entry.available} of ${entry.required}` : entry.label;
}

/** Keyed native controls keep keyboard focus and progress bars through clock updates. */
export function renderTree(container: HTMLElement, tree: TreeView, buttons: (container: HTMLElement, buttons: ButtonView[]) => void): void {
  container.classList.add("creation-tree");
  container.style.setProperty("--branches", String(tree.branches.length));
  tree.branches.forEach((branch, index) => {
    let heading = container.querySelector<HTMLElement>(`[data-branch="${branch.id}"]`);
    if (!heading) { heading = document.createElement("h3"); heading.dataset.branch = branch.id; container.append(heading); }
    heading.textContent = branch.name;
    heading.style.gridColumn = String(index + 1); heading.style.gridRow = "1";
  });
  const ids = new Set(tree.nodes.map((node) => node.target));
  container.querySelectorAll<HTMLElement>(".tree-node").forEach((el) => { if (!ids.has(el.dataset.target!)) el.remove(); });
  for (const node of tree.nodes) {
    let el = container.querySelector<HTMLElement>(`.tree-node[data-target="${node.target}"]`);
    if (!el) {
      el = document.createElement("article"); el.className = "tree-node"; el.dataset.target = node.target;
      el.innerHTML = '<div class="node-state"></div><div class="node-parents"></div><div class="node-control"></div><details><summary>details and requirements</summary><div class="node-hints"></div><ul></ul></details>';
      container.append(el);
    }
    const key = `${node.branch}-${node.depth}`;
    let cell = container.querySelector<HTMLElement>(`[data-cell="${key}"]`);
    if (!cell) {
      cell = document.createElement("div"); cell.className = "tree-cell"; cell.dataset.cell = key;
      cell.style.gridColumn = String(tree.branches.findIndex((b) => b.id === node.branch) + 1);
      cell.style.gridRow = String(node.depth + 2); container.append(cell);
    }
    if (el.parentElement !== cell) cell.append(el);
    el.dataset.after = JSON.stringify(node.after);
    el.classList.toggle("completed", node.completed); el.classList.toggle("locked", !node.unlocked);
    el.querySelector(".node-state")!.textContent = node.completed ? "completed" : node.unlocked ? "unlocked" : "locked";
    el.querySelector(".node-parents")!.textContent = node.after.length ? `after ${node.after.map((id) => tree.nodes.find((n) => n.target === id)!.label).join(" + ")}` : "root";
    const control = el.querySelector<HTMLElement>(".node-control")!;
    buttons(control, [{ ...node, label: node.work?.status === "paused" ? `resume ${node.label}` : node.label }]);
    const details = el.querySelector("details")!;
    const detailsId = `${tree.kind}-${node.target}-details`;
    details.id = detailsId;
    control.querySelector("button")!.setAttribute("aria-describedby", detailsId);
    el.querySelector(".node-hints")!.textContent = [...node.hints, ...(node.reason ? [node.reason] : []), ...(node.work ? [`${node.work.status}: ${Math.round(100 * node.work.completed / node.work.required)}%`] : [])].join(" · ");
    el.querySelector("ul")!.replaceChildren(...node.requirements.map((entry) => {
      const li = document.createElement("li"); li.textContent = `${entry.met ? "✓" : "○"} ${describe(entry)}`; return li;
    }));
  }
  if (!observed.has(container)) {
    new ResizeObserver(() => drawConnections(container)).observe(container);
    container.addEventListener("toggle", () => drawConnections(container), true);
    observed.add(container);
  }
  requestAnimationFrame(() => drawConnections(container));
}

const observed = new WeakSet<HTMLElement>();
function drawConnections(container: HTMLElement) {
  const ns = "http://www.w3.org/2000/svg";
  let svg = container.querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) { svg = document.createElementNS(ns, "svg"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("tree-edges"); container.prepend(svg); }
  const box = container.getBoundingClientRect();
  if (!box.width) return;
  const cards = [...container.querySelectorAll<HTMLElement>(".tree-node")];
  const width = Math.max(box.width, ...cards.map((node) => node.getBoundingClientRect().right - box.left));
  svg.setAttribute("width", String(width)); svg.setAttribute("height", String(box.height));
  const paths: SVGPathElement[] = [];
  for (const node of container.querySelectorAll<HTMLElement>(".tree-node")) {
    const to = node.getBoundingClientRect();
    for (const parent of JSON.parse(node.dataset.after ?? "[]") as string[]) {
      const source = container.querySelector<HTMLElement>(`.tree-node[data-target="${parent}"]`);
      if (!source) continue;
      const from = source.getBoundingClientRect();
      const x1 = from.left + from.width / 2 - box.left, y1 = from.bottom - box.top;
      const x2 = to.left + to.width / 2 - box.left, y2 = to.top - box.top;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`);
      paths.push(path);
    }
  }
  svg.replaceChildren(...paths);
}

import type { ButtonView, TreeNodeView, TreeView } from "../core/selectors";
import type { RequirementEntry } from "../core/action-rules";
import { compactTreeLayout, routeTreeEdges, CHIP_HEIGHT } from "./tree-layout";

function describe(entry: RequirementEntry): string {
  if (entry.children) {
    const parts = entry.children.map(describe);
    return entry.operator === "not" ? `not (${parts.join("")})` : `(${parts.join(entry.operator === "any" ? " or " : " and ")})`;
  }
  return entry.kind === "material" ? `${entry.label}: ${entry.required} required, ${entry.available} available`
    : entry.kind === "limit" ? `${entry.label}: ${entry.available} of ${entry.required}` : entry.label;
}
const text = (tag: string, value: string, className?: string) => {
  const element = document.createElement(tag); element.textContent = value;
  if (className) element.className = className;
  return element;
};
const stateLabel = (node: TreeNodeView) => node.work?.status ?? (node.completed ? "completed" : node.unlocked ? node.enabled ? "ready" : "unlocked" : "locked");

/** One floating inspection surface for both trees, outside their scroll containers. */
export class TreeTooltip {
  private element: HTMLElement;
  private anchor?: HTMLElement;
  private target?: string;
  private kind?: string;
  private pinned = false;
  private restoringFocus = false;
  constructor(private root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.id = "treeTooltip"; this.element.className = "tree-tooltip";
    this.element.setAttribute("role", "tooltip"); this.element.hidden = true;
    root.append(this.element);
    document.addEventListener("pointerdown", (event) => {
      if (this.pinned && this.element.contains(event.target as Node)) return;
      if (!this.anchor?.contains(event.target as Node)) this.hide();
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") this.hide(true); });
    window.addEventListener("resize", () => this.hide());
    // Includes page scrolling and either tree's own bounded scroll area.
    document.addEventListener("scroll", (event) => {
      if (this.pinned && this.element.contains(event.target as Node)) return;
      this.hide();
    }, true);
    this.element.addEventListener("blur", (event) => {
      if (this.pinned && !this.anchor?.contains(event.relatedTarget as Node | null)) this.hide();
    });
  }
  hide(restoreFocus = false) {
    const returnTo = this.pinned && this.element === document.activeElement
      ? this.anchor?.querySelector<HTMLButtonElement>(".tree-info") : undefined;
    this.element.hidden = true; this.element.classList.remove("pinned"); this.element.tabIndex = -1;
    this.anchor = undefined; this.target = undefined; this.kind = undefined; this.pinned = false;
    if (restoreFocus && returnTo) {
      this.restoringFocus = true; returnTo.focus({ preventScroll: true }); this.restoringFocus = false;
    }
  }
  private allowed(anchor: HTMLElement) {
    return !anchor.closest("[hidden]") && this.root.querySelector<HTMLElement>("#event")?.hidden !== false
      && !this.root.classList.contains("ended") && !this.root.classList.contains("prologue");
  }
  show(anchor: HTMLElement, node: TreeNodeView, tree: TreeView, pin = false) {
    if (this.restoringFocus || !this.allowed(anchor)) return;
    if (this.pinned && this.anchor === anchor && !pin) return;
    this.anchor = anchor; this.target = node.target; this.kind = tree.kind; this.pinned = pin;
    this.element.classList.toggle("pinned", pin); this.element.tabIndex = pin ? 0 : -1;
    this.update(node, tree); this.element.hidden = false; this.position();
  }
  toggle(anchor: HTMLElement, node: TreeNodeView, tree: TreeView) {
    if (this.anchor === anchor && this.pinned && !this.element.hidden) this.hide();
    else {
      this.show(anchor, node, tree, true);
      if (!this.element.hidden) this.element.focus({ preventScroll: true });
    }
  }
  leave(anchor: HTMLElement) {
    if (this.anchor === anchor && !this.pinned && !anchor.contains(document.activeElement)) this.hide();
  }
  blur(anchor: HTMLElement, next: EventTarget | null) {
    if (this.pinned && this.element.contains(next as Node | null)) return;
    if (this.anchor === anchor && !anchor.contains(next as Node | null)) this.hide();
  }
  refresh(tree: TreeView) {
    if (this.kind !== tree.kind || !this.anchor) return;
    const node = tree.nodes.find((node) => node.target === this.target);
    if (!node || !this.allowed(this.anchor)) { this.hide(); return; }
    this.update(node, tree); this.position();
  }
  private update(node: TreeNodeView, tree: TreeView) {
    const scrollTop = this.element.scrollTop;
    const parents = node.after.map((id) => tree.nodes.find((other) => other.target === id)?.label ?? id);
    const requirements = document.createElement("ul");
    requirements.replaceChildren(...node.requirements.map((entry) => text("li", `${entry.met ? "✓" : "○"} ${describe(entry)}`)));
    this.element.replaceChildren(text("div", node.label, "tree-tooltip-title"), text("span", node.category, "tree-category"),
      text("div", stateLabel(node), "tree-tooltip-state"), ...(parents.length ? [text("div", `after ${parents.join(" + ")}`)] : []),
      ...node.hints.map((hint) => text("div", hint)), ...(node.reason ? [text("div", node.reason, "reason")] : []),
      ...(node.work ? [text("div", `${Math.round(100 * node.work.completed / node.work.required)}% complete`)] : []), requirements);
    this.element.scrollTop = scrollTop;
  }
  private position() {
    if (!this.anchor || this.element.hidden) return;
    const margin = 8, gap = 8;
    const anchor = this.anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    this.element.style.maxWidth = `${Math.max(0, Math.min(300, width - 2 * margin))}px`;
    this.element.style.maxHeight = `${Math.max(0, height - 2 * margin)}px`;
    const box = this.element.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(anchor.left, left + width - box.width - margin));
    const below = anchor.bottom + gap;
    const y = below + box.height <= top + height - margin ? below : Math.max(top + margin, anchor.top - gap - box.height);
    this.element.style.left = `${x}px`; this.element.style.top = `${y}px`;
  }
}

interface TreeMount { tree: TreeView; tooltip: TreeTooltip; observer: ResizeObserver }
const mounts = new WeakMap<HTMLElement, TreeMount>();
/** Keyed native chips keep keyboard focus and progress bars through clock updates. */
export function renderTree(container: HTMLElement, tree: TreeView, buttons: (container: HTMLElement, buttons: ButtonView[]) => void, tooltip: TreeTooltip): void {
  container.classList.add("creation-tree");
  const scroller = container.parentElement!; scroller.classList.add("tree-scroll");
  const ids = new Set(tree.nodes.map((node) => node.target));
  container.querySelectorAll<HTMLElement>(".tree-node").forEach((el) => { if (!ids.has(el.dataset.target!)) el.remove(); });
  for (const node of tree.nodes) {
    let chip = container.querySelector<HTMLElement>(`.tree-node[data-target="${node.target}"]`);
    if (!chip) {
      chip = document.createElement("div"); chip.className = "tree-node"; chip.dataset.target = node.target;
      chip.innerHTML = '<button class="tree-info" type="button"></button><div class="node-control"></div>';
      container.append(chip);
    }
    chip.style.height = `${CHIP_HEIGHT}px`;
    chip.classList.toggle("completed", node.completed); chip.classList.toggle("locked", !node.unlocked);
    chip.dataset.state = stateLabel(node);
    const control = chip.querySelector<HTMLElement>(".node-control")!;
    buttons(control, [{ ...node, label: node.label }]);
    const button = control.querySelector<HTMLButtonElement>("button")!;
    button.classList.remove("appear");
    // The shared button tooltip is superseded by this tree's single floating surface.
    button.querySelector<HTMLElement>(".tip")!.hidden = true;
    button.setAttribute("aria-describedby", "treeTooltip");
    button.setAttribute("aria-label", `${node.work?.status === "paused" ? "resume " : ""}${node.label}, ${stateLabel(node)}`);
    const activate = button.onclick;
    button.onclick = (event) => { if (button.getAttribute("aria-disabled") !== "true") tooltip.hide(); activate?.call(button, event); };
    const info = chip.querySelector<HTMLButtonElement>(".tree-info")!;
    info.textContent = node.work ? node.work.status === "running" ? "◐" : "Ⅱ" : node.completed ? "✓" : node.unlocked ? "○" : "·";
    info.setAttribute("aria-label", `details for ${node.label}`); info.setAttribute("aria-describedby", "treeTooltip");
    const anchor = chip;
    info.onclick = () => tooltip.toggle(anchor, node, tree);
    chip.onpointerenter = (event) => { if (event.pointerType !== "touch") tooltip.show(anchor, node, tree); };
    chip.onpointerleave = () => tooltip.leave(anchor);
    for (const focusable of [button, info]) {
      focusable.onfocus = () => tooltip.show(anchor, node, tree);
      focusable.onblur = (event) => tooltip.blur(anchor, event.relatedTarget);
    }
  }
  let mount = mounts.get(container);
  if (!mount) {
    const observer = new ResizeObserver(() => layoutTree(container));
    observer.observe(scroller);
    mount = { tree, tooltip, observer }; mounts.set(container, mount);
  }
  mount.tree = tree; tooltip.refresh(tree);
  layoutTree(container);
}
function layoutTree(container: HTMLElement) {
  const mount = mounts.get(container);
  if (!mount || !container.getBoundingClientRect().width) return;
  const layout = compactTreeLayout(mount.tree.nodes, container.clientWidth);
  container.style.height = `${layout.height}px`; container.dataset.columns = String(layout.columns);
  for (const placement of layout.nodes) {
    const chip = container.querySelector<HTMLElement>(`.tree-node[data-target="${placement.target}"]`)!;
    chip.style.left = `${placement.x}px`; chip.style.top = `${placement.y}px`; chip.style.width = `${placement.width}px`;
  }
  drawConnections(container, mount.tree, layout.nodes, layout.height);
}
function drawConnections(container: HTMLElement, tree: TreeView, nodes: ReturnType<typeof compactTreeLayout>["nodes"], height: number) {
  const ns = "http://www.w3.org/2000/svg";
  let svg = container.querySelector<SVGSVGElement>(":scope > svg");
  if (!svg) { svg = document.createElementNS(ns, "svg"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("tree-edges"); container.prepend(svg); }
  svg.setAttribute("width", String(container.clientWidth)); svg.setAttribute("height", String(height));
  const paths = routeTreeEdges(tree.nodes, nodes, container.clientWidth).map((route) => {
    const path = document.createElementNS(ns, "path");
    path.dataset.parent = route.parent; path.dataset.target = route.target;
    path.setAttribute("d", route.path);
    return path;
  });
  svg.replaceChildren(...paths);
}

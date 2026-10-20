import type { Artwork } from "../content/schema";

/** Keep relative Vite bases relative so Pages deployments work below any repository path. */
export function illustrationUrl(src: string, base = import.meta.env.BASE_URL): string {
  return `${base ? base.endsWith("/") ? base : `${base}/` : "./"}${src}`;
}
interface ImageState { source?: string; image?: HTMLImageElement; failed: Set<string> }
const images = new WeakMap<HTMLElement, ImageState>();
export interface IllustrationOptions {
  /** Only for a picture paired with the same visible item/building label. */
  decorative?: boolean;
  eager?: boolean;
  baseUrl?: string;
}

/** Update one persistent image slot. Text and controls live outside it and survive failure. */
export function updateIllustration(slot: HTMLElement, artwork: Artwork | undefined, options: IllustrationOptions = {}): void {
  slot.classList.add("illustration");
  const state = images.get(slot) ?? { failed: new Set<string>() };
  images.set(slot, state);
  if (!artwork) {
    state.image = undefined; state.source = undefined;
    slot.replaceChildren(); slot.hidden = true; slot.removeAttribute("aria-hidden"); delete slot.dataset.imageState;
    return;
  }
  const source = illustrationUrl(artwork.src, options.baseUrl);
  if (state.failed.has(source)) {
    state.image = undefined; state.source = source; slot.replaceChildren();
    slot.hidden = true; slot.dataset.imageState = "missing"; return;
  }
  if (options.decorative) slot.setAttribute("aria-hidden", "true");
  else slot.removeAttribute("aria-hidden");
  let image = state.image;
  if (!image || state.source !== source) {
    image = document.createElement("img");
    state.image = image; state.source = source;
    const current = image;
    image.onload = () => {
      if (state.image !== current || state.source !== source) return;
      slot.hidden = false; slot.dataset.imageState = "ready";
    };
    image.onerror = () => {
      if (state.image !== current || state.source !== source) return;
      state.failed.add(source); slot.hidden = true; slot.dataset.imageState = "missing";
    };
    slot.replaceChildren(image);
    slot.dataset.imageState = "loading";
  }
  image.width = artwork.width; image.height = artwork.height;
  image.alt = options.decorative ? "" : artwork.alt;
  image.decoding = "async"; image.loading = options.eager ? "eager" : "lazy";
  slot.hidden = false;
  // Reassigning src can restart a request, so unchanged renders never touch it.
  if (image.getAttribute("src") !== source) image.src = source;
}

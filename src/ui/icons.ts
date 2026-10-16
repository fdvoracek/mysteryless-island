import type { Icon } from "../content/schema";

/**
 * Map icons (see Activity.icon): 16×16 line drawings in the text colour, so they suit every layout
 * and the dark theme. Each is the inside of an <svg viewBox="0 0 16 16">.
 */
const PATHS: Record<Icon, string> = {
  fire: `<path d="M8 14.5c-2.9 0-4.6-1.9-4.6-4.3 0-2.7 2.4-4 2.7-7 1.8 1.2 2.5 2.9 2.3 4.4.8-.5 1.3-1.5 1.4-2.5 1.7 1.4 2.8 3.1 2.8 5.1 0 2.4-1.7 4.3-4.6 4.3z"/>`,
  water: `<path d="M8 1.8C6 4.8 3.8 7.2 3.8 9.9a4.2 4.2 0 0 0 8.4 0C12.2 7.2 10 4.8 8 1.8z"/>`,
  wood: `<ellipse cx="4" cy="8" rx="2" ry="3.2"/><path d="M4 4.8h8.2c1.1 0 2 1.4 2 3.2s-.9 3.2-2 3.2H4"/><ellipse cx="4" cy="8" rx=".7" ry="1.1"/>`,
  fish: `<path d="M1.8 8c2.2-3.2 6.2-4 9.2-1.3l3.2-2.2v7l-3.2-2.2C8 12 4 11.2 1.8 8z"/><circle cx="5" cy="7.4" r=".6"/>`,
  berries: `<circle cx="5.2" cy="10.4" r="2.4"/><circle cx="10.6" cy="10.8" r="2.4"/><circle cx="8" cy="6.6" r="2.2"/><path d="M8 4.4V1.8M8 2.6c1.4-.8 2.8-.8 3.8 0"/>`,
  shells: `<path d="M8 14 2.4 6.6a6.6 4.6 0 0 1 11.2 0z"/><path d="M8 14V3.4M8 14 5 4.3M8 14l3-9.7"/>`,
  sleep: `<path d="M12.4 10.6A5.6 5.6 0 0 1 6.2 2.4a5.6 5.6 0 1 0 6.2 8.2z"/>`,
};

export function iconSvg(icon: Icon): string {
  return `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">${PATHS[icon]}</svg>`;
}

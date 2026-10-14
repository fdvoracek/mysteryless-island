/**
 * Fonts the player can choose in the bottom menu (font: ...). One choice for the whole game:
 * it sets --font (and its style and size adjustment) on <html>, and every layout uses --font
 * for all of its text. The first font is the default. To add one, add a line here; a web font
 * also needs its Google Fonts stylesheet, which loads only when the font is chosen.
 */
export interface Font {
  /** used in storage and in the URL (?font=fell) */
  id: string;
  /** shown in the menu */
  name: string;
  /** CSS font-family with fallbacks */
  family: string;
  style?: "normal" | "italic";
  weight?: number;
  /** web font stylesheet (fonts.googleapis.com) */
  stylesheet?: string;
}

const GF = "https://fonts.googleapis.com/css2?display=swap&family=";

export const FONTS: readonly Font[] = [
  { id: "times", name: "times", family: '"Times New Roman", Times, serif' },
  { id: "old_standard", name: "old standard", family: '"Old Standard TT", Georgia, serif', stylesheet: `${GF}Old+Standard+TT:ital,wght@0,400;0,700;1,400` },
  { id: "fell", name: "fell", family: '"IM Fell English", "Iowan Old Style", Georgia, serif', stylesheet: `${GF}IM+Fell+English:ital@0;1` },
  { id: "garamond_italic", name: "garamond italic", family: '"Cormorant Garamond", Garamond, Georgia, serif', style: "italic", weight: 500, stylesheet: `${GF}Cormorant+Garamond:ital,wght@1,500;1,700` },
];

const KEY = "textisland.font";

export function getFont(id: string | null | undefined): Font {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** ?font=<id> in the URL wins over the saved choice. */
export function loadFontId(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("font");
  if (fromUrl) return fromUrl;
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function saveFontId(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

/**
 * Apply a font to the whole page. Fonts other than the default get the same x-height as Times
 * (font-size-adjust), so every layout keeps its sizes whichever font is chosen.
 */
export function applyFont(f: Font) {
  const s = document.documentElement.style;
  s.setProperty("--font", f.family);
  s.setProperty("--font-style", f.style ?? "normal");
  s.setProperty("--font-weight", String(f.weight ?? 400));
  s.setProperty("--font-adjust", f === FONTS[0] ? "none" : "0.45");
  if (f.stylesheet && !document.head.querySelector(`link[href="${f.stylesheet}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = f.stylesheet;
    document.head.append(link);
  }
}

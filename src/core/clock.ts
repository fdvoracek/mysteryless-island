import type { Registry } from "../content/registry";

export const day = (minutes: number) => Math.floor(minutes / 1440) + 1;
export const hourOfDay = (minutes: number) => (minutes % 1440) / 60;

export function phaseAt(reg: Registry, minutes: number) {
  const h = hourOfDay(minutes);
  return reg.climate.phases.find((p) => h >= p.from && h < p.to) ?? reg.climate.phases[0];
}

export function clockText(minutes: number): string {
  const m = minutes % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

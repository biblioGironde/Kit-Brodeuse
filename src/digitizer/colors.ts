/** Couleurs CSS → hexadécimal « #rrggbb ». */

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  teal: "#008080",
  navy: "#000080",
  purple: "#800080",
  orange: "#ffa500",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  gold: "#ffd700",
  beige: "#f5f5dc",
  violet: "#ee82ee",
  indigo: "#4b0082",
  turquoise: "#40e0d0",
  coral: "#ff7f50",
  salmon: "#fa8072",
  khaki: "#f0e68c",
  crimson: "#dc143c",
  tomato: "#ff6347",
  orchid: "#da70d6",
  plum: "#dda0dd",
  tan: "#d2b48c",
  chocolate: "#d2691e",
  darkgreen: "#006400",
  darkblue: "#00008b",
  darkred: "#8b0000",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  skyblue: "#87ceeb",
  steelblue: "#4682b4",
  royalblue: "#4169e1",
  forestgreen: "#228b22",
  seagreen: "#2e8b57",
  limegreen: "#32cd32",
  hotpink: "#ff69b4",
  deeppink: "#ff1493",
  firebrick: "#b22222",
  sienna: "#a0522d",
  peru: "#cd853f",
  wheat: "#f5deb3",
  ivory: "#fffff0",
  lavender: "#e6e6fa",
  mintcream: "#f5fffa",
  darkorange: "#ff8c00",
  orangered: "#ff4500",
  goldenrod: "#daa520",
  yellowgreen: "#9acd32",
  slategray: "#708090",
  dimgray: "#696969",
  midnightblue: "#191970",
  darkviolet: "#9400d3",
};

export function parseColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent") return null;
  if (v === "currentcolor") return "#000000";
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f]{3,4})$/.exec(v);
  if (m) {
    const h = m[1];
    return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) return "#" + m[1];
  m = /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)/.exec(v);
  if (m) {
    const c = [m[1], m[2], m[3]].map((s) =>
      Math.max(
        0,
        Math.min(
          255,
          Math.round(
            s.endsWith("%") ? (parseFloat(s) * 255) / 100 : parseFloat(s),
          ),
        ),
      ),
    );
    return "#" + c.map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const MONO =
  "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,monospace";

/** The shapes a node type can take. Older data without a shape reads as a circle. */
export const SHAPES = ["circle", "diamond", "hexagon", "square"];

/** Starting palette. Users can rename, recolour, resize, reshape, and add to these. */
export const DEFAULT_TYPES = [
  { id: "t_issue", name: "issue", color: "#ff2e6d", size: 34, shape: "diamond" },
  { id: "t_solution", name: "solution", color: "#00f0ff", size: 26, shape: "circle" },
  { id: "t_sub", name: "sub-solution", color: "#b967ff", size: 20, shape: "hexagon" },
  { id: "t_note", name: "note", color: "#39ff88", size: 16, shape: "square" },
];

export const SWATCHES = [
  "#ff2e6d", "#00f0ff", "#b967ff", "#39ff88",
  "#ffd166", "#ff7b4d", "#4d9dff", "#ff4df0",
];

export const uid = (p = "n") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now = () => Date.now();

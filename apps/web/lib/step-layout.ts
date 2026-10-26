// Where the steps of the Dominus go on the screen, so that no label covers another and the work
// fills the sky in proportion instead of piling up beside the Dominus. The classic greedy way
// of placing map labels: vertices spread over the whole screen (a grid with a fixed jitter, so a
// new render never moves what is already there); each new step takes the free vertex nearest to
// whoever does it, with its label on the right or the left, wherever it touches nothing: not
// another label, not a neuron, the Dominus, the menu, the box or the plan.

export type Rect = { x: number; y: number; w: number; h: number };
/** The part of the screen the steps may use (visible, below the menu, left of an open plan). */
export type Area = { left: number; top: number; bottom: number; right: number };
export type Placed = { x: number; y: number; left: boolean; label: Rect };

/** Geist Mono at 12px: about 7.25px a character; a label is one line, 18px high. */
export const CHAR_W = 7.25;
const LABEL_H = 18;
const GAP = 12; // from the point to its label
const PAD = 6; // around every label
const MIN_FROM_ORIGIN = 80;
const MIN_BETWEEN_POINTS = 44;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;

/** A deterministic number in [0, 1) for a grid cell (the jitter, the same on every render). */
function jitter(i: number, j: number, k: number) {
  let h = (i * 374_761_393 + j * 668_265_263 + k * 2_147_483_647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/** Vertices over the area: one per cell of a grid sized to it, jittered inside the cell. */
export function vertices(area: Area): { x: number; y: number }[] {
  const { left, right, top, bottom } = area;
  const cols = Math.max(4, Math.round((right - left) / 150));
  const rows = Math.max(4, Math.round((bottom - top) / 64));
  const cw = (right - left) / cols;
  const ch = (bottom - top) / rows;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      out.push({
        x: left + (i + 0.2 + 0.6 * jitter(i, j, 1)) * cw,
        y: top + (j + 0.2 + 0.6 * jitter(i, j, 2)) * ch,
      });
  return out;
}

/**
 * Places the steps in order (a new step never moves the earlier ones). `origins` is where each
 * step's synapse starts (the Dominus or a craft neuron); `obstacles` what no label may cover.
 * A step with no room left is placed nowhere (null): it still shows in the caption.
 */
export function layout(input: {
  labels: string[];
  origins: { x: number; y: number }[];
  obstacles: Rect[];
  area: Area;
}): (Placed | null)[] {
  const { area } = input;
  const all = vertices(area);
  const taken: Rect[] = [...input.obstacles];
  const points: { x: number; y: number }[] = [];
  return input.labels.map((text, n) => {
    const o = input.origins[n] ?? input.origins[0]!;
    const width = Math.ceil(text.length * CHAR_W);
    const free = all
      .filter(
        (v) =>
          Math.hypot(v.x - o.x, v.y - o.y) >= MIN_FROM_ORIGIN &&
          points.every((p) => Math.hypot(v.x - p.x, v.y - p.y) >= MIN_BETWEEN_POINTS),
      )
      .sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y));
    for (const v of free) {
      // The side away from the origin first: the label reads outward.
      const sides = v.x >= o.x ? [false, true] : [true, false];
      for (const left of sides) {
        const label: Rect = {
          x: left ? v.x - GAP - width : v.x + GAP,
          y: v.y - LABEL_H / 2,
          w: width,
          h: LABEL_H,
        };
        const dot: Rect = { x: v.x - 4, y: v.y - 4, w: 8, h: 8 };
        const inside = label.x >= area.left + 8 && label.x + label.w <= area.right - 8;
        if (!inside || taken.some((t) => overlaps(t, label) || overlaps(t, dot))) continue;
        taken.push(label, dot);
        points.push(v);
        return { x: v.x, y: v.y, left, label };
      }
    }
    return null;
  });
}

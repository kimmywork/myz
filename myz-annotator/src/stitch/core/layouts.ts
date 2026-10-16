export interface Cell {
  /** Normalized [0,1] geometry inside the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Layout = Cell[];

export interface LayoutOption {
  id: string;
  label: string;
  cells: Layout;
}

/** Rows of `cols` cells; the final row is split evenly among the leftover images. */
function flowGrid(count: number, cols: number): Layout {
  const rows = Math.ceil(count / cols);
  const cells: Layout = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const c = i - r * cols;
    const w = 1 / inRow;
    cells.push({ x: c * w, y: r / rows, w, h: 1 / rows });
  }
  return cells;
}

/** One large feature cell (top-left 2x2 of a 3-column flow) plus the remaining cells. */
function featureLeft(count: number): Layout {
  const cells: Layout = [{ x: 0, y: 0, w: 0.5, h: 1 }];
  const rest = count - 1;
  const cols = 2;
  const rows = Math.ceil(rest / cols);
  for (let i = 0; i < rest; i += 1) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, rest - r * cols);
    const c = i - r * cols;
    cells.push({
      x: 0.5 + c * (0.5 / inRow),
      y: r / rows,
      w: 0.5 / inRow,
      h: 1 / rows,
    });
  }
  return cells;
}

function featureTop(count: number): Layout {
  const cells: Layout = [{ x: 0, y: 0, w: 1, h: 0.55 }];
  const rest = count - 1;
  const y = 0.55;
  for (let i = 0; i < rest; i += 1) {
    cells.push({ x: i / rest, y, w: 1 / rest, h: 1 - y });
  }
  return cells;
}

const CUSTOM: Record<number, Layout[]> = {
  3: [
    [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
    [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  ],
  5: [
    featureTop(5),
    featureLeft(5),
    [
      { x: 0, y: 0, w: 1 / 3, h: 0.5 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  ],
  7: [flowGrid(7, 2), flowGrid(7, 3)],
};

const cache = new Map<number, LayoutOption[]>();

export function getLayouts(count: number): LayoutOption[] {
  const n = Math.max(1, Math.min(16, count));
  if (cache.has(n)) return cache.get(n)!;

  const options: LayoutOption[] = [];
  const push = (id: string, label: string, cells: Layout) =>
    options.push({ id, label, cells });

  if (n === 1) {
    push("full", "单张", [{ x: 0, y: 0, w: 1, h: 1 }]);
  } else {
    const colSets = new Set<number>();
    for (const cols of [1, 2, 3, 4]) {
      if (cols > n) continue;
      if (cols > 1 && colSets.has(cols)) continue;
      colSets.add(cols);
      const cells = flowGrid(n, cols);
      push(`flow-${cols}`, cols === 1 ? "纵向" : `${cols} 列`, cells);
    }
    // A couple of square-ish grids look much better for larger counts.
    if (n >= 4) push("grid-sq", "田字", flowGrid(n, Math.min(2, n)));
    if (n >= 6) push("grid-3", "九宫格", flowGrid(n, 3));
  }

  for (const cells of CUSTOM[n] ?? []) {
    push(`custom-${options.length}`, "特色", cells);
  }

  // De-duplicate identical geometries.
  const seen = new Set<string>();
  const unique = options.filter((o) => {
    const key = o.cells
      .map(
        (c) =>
          `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}`,
      )
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  cache.set(n, unique);
  return unique;
}

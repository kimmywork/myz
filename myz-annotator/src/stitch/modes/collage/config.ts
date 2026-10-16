export interface CellTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface CollageConfig {
  ratio: "1:1" | "4:5" | "3:4" | "9:16" | "16:9" | "4:3" | "3:2" | "original";
  baseSize: number;
  spacing: number;
  margin: number;
  radius: number;
  background: string;
  layoutId: string;
  cells: CellTransform[];
}

export const DEFAULT_CONFIG: CollageConfig = {
  ratio: "1:1",
  baseSize: 1440,
  spacing: 16,
  margin: 24,
  radius: 24,
  background: "#0e0f13",
  layoutId: "",
  cells: [],
};

export const RATIOS: Record<string, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
};

export const DEFAULT_CELL: CellTransform = {
  offsetX: 0.5,
  offsetY: 0.5,
  zoom: 1,
};

import { SerializedRange } from "./serializer";

export interface MyZRecord {
  id: string;
  kind: RECORD_KINDS;
  text: string;
  html?: string;
  note?: string;
  tags?: string[];
  color?: string;
  style?: HIGHLIGHT_STYLES;
  createdAt: string;
  updatedAt: string;
  sourceUrl?: string;
  title?: string;
  hostname?: string;
  range?: SerializedRange;

  logseqBlockUuid?: string;
  logseqSyncedAt?: string;
  [key: string]: any;
}

export enum RECORD_KINDS {
  HIGHLIGHT = "highlight",
  CLIP = "clip",
  AI_GENERATED = "ai-generated",
}

export const DEFAULT_COLOR = "#b58900";

export const DEFAULT_COLORS = [
  // amber / warm highlight
  "#b58900",
  // pink / coral
  "#ef476f",
  // muted purple
  "#9f7aea",
  // sky blue
  "#38bdf8",
  // teal / mint
  "#34d399",
];

export enum HIGHLIGHT_STYLES {
  PAINT = "paint",
  UNDERLINE = "underline",
  WAVY = "wavy",
}

export interface HighlightStyleOption {
  icon: HIGHLIGHT_STYLES[keyof HIGHLIGHT_STYLES];
  label: string;
}

export const DEFAULT_HIGHLIGHT_STYLE: HIGHLIGHT_STYLES = HIGHLIGHT_STYLES.PAINT;
export const HIGHLIGHT_STYLE_OPTIONS: Record<
  HIGHLIGHT_STYLES,
  HighlightStyleOption
> = {
  [HIGHLIGHT_STYLES.PAINT]: { icon: "paint", label: "高亮" },
  [HIGHLIGHT_STYLES.UNDERLINE]: { icon: "underline", label: "下划线" },
  [HIGHLIGHT_STYLES.WAVY]: { icon: "wavy", label: "波浪线" },
};

export function getRecordKind(record?: Partial<MyZRecord>): RECORD_KINDS {
  if (record && record.kind === RECORD_KINDS.AI_GENERATED) {
    return RECORD_KINDS.AI_GENERATED;
  }
  if (record && record.kind === RECORD_KINDS.CLIP) {
    return RECORD_KINDS.CLIP;
  }
  return RECORD_KINDS.HIGHLIGHT;
}

import {
  DEFAULT_COLOR,
  HIGHLIGHT_STYLES,
  type MyZRecord,
} from "@myz/shared/types";
import { ref, type Ref } from "vue";
import type { PdfSelection } from "../annotations.js";
import type { PdfOutlineEntry } from "../pdf-document.js";
import type { PdfProgress } from "../storage.js";

export type ReaderStatus = "landing" | "loading" | "ready" | "error";
export type SidebarTab = "outline" | "highlights";
export type OutlineStatus = "idle" | "loading" | "ready" | "error";
export type HighlightFilter = "all" | "highlight" | "clip";

export const DEFAULT_SCALE = 1.5;
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
export const SIDEBAR_STORAGE_KEY = "myz-pdf-sidebar";

/**
 * Reactive state slice of the reader. Composables receive this shared object so
 * the store can stay a thin composition root over pure state.
 */
export interface ReaderState {
  status: Ref<ReaderStatus>;
  error: Ref<string>;
  page: Ref<number>;
  pages: Ref<number>;
  label: Ref<string>;
  recents: Ref<PdfProgress[]>;
  persistedPage: Ref<number>;
  scale: Ref<number>;
  annotations: Ref<MyZRecord[]>;
  activeId: Ref<string | null>;
  selection: Ref<PdfSelection | null>;
  selectionPos: Ref<{ top: number; left: number }>;
  noteDraft: Ref<string>;
  tagsDraft: Ref<string[]>;
  dirty: Ref<boolean>;
  savedAt: Ref<number | null>;
  lastStyle: Ref<HIGHLIGHT_STYLES>;
  lastColor: Ref<string>;
  sidebarOpen: Ref<boolean>;
  sidebarTab: Ref<SidebarTab>;
  outline: Ref<PdfOutlineEntry[]>;
  outlineStatus: Ref<OutlineStatus>;
  expandedOutline: Ref<Set<string>>;
  highlightFilter: Ref<HighlightFilter>;
  highlightQuery: Ref<string>;
}

export function createReaderState(): ReaderState {
  return {
    status: ref<ReaderStatus>("landing"),
    error: ref(""),
    page: ref(1),
    pages: ref(0),
    label: ref(""),
    recents: ref<PdfProgress[]>([]),
    persistedPage: ref(0),
    scale: ref(DEFAULT_SCALE),
    annotations: ref<MyZRecord[]>([]),
    activeId: ref<string | null>(null),
    selection: ref<PdfSelection | null>(null),
    selectionPos: ref({ top: 0, left: 0 }),
    noteDraft: ref(""),
    tagsDraft: ref<string[]>([]),
    dirty: ref(false),
    savedAt: ref<number | null>(null),
    lastStyle: ref<HIGHLIGHT_STYLES>(HIGHLIGHT_STYLES.PAINT),
    lastColor: ref<string>(DEFAULT_COLOR),
    sidebarOpen: ref(false),
    sidebarTab: ref<SidebarTab>("outline"),
    outline: ref<PdfOutlineEntry[]>([]),
    outlineStatus: ref<OutlineStatus>("idle"),
    expandedOutline: ref<Set<string>>(new Set()),
    highlightFilter: ref<HighlightFilter>("all"),
    highlightQuery: ref(""),
  };
}

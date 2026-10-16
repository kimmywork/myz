import { Crop, Layers, SquareStack, Wand2 } from "@lucide/vue";
import type { VNode } from "vue";
import type { PerImageStitch, Strategy, StitchParams } from "../../types";

export const BASE_PARAMS: StitchParams = {
  axis: "y",
  strategy: "crop",
  diffMode: true,
  transition: 64,
  fixedTop: 0,
  fixedBottom: 0,
  gap: 0,
  background: "",
  offsets: [],
  subtitleHeight: 0,
  perImage: [],
};

export const STRATEGY_OPTIONS: {
  value: Strategy;
  label: string;
  hint: string;
}[] = [
  {
    value: "crop",
    label: "无缝裁剪",
    hint: "计算交叉部分并裁掉，拼成长截图（推荐）",
  },
  {
    value: "blend",
    label: "过渡混合",
    hint: "保留少量重叠并做渐变过渡，掩盖色差",
  },
  {
    value: "subtitle",
    label: "字幕堆叠",
    hint: "首张完整，后续只保留底部字幕条，堆叠成字幕长图",
  },
  { value: "concat", label: "简单串联", hint: "不做分析，直接依次排列" },
];

export const STRATEGY_ICON: Record<Strategy, VNode> = {
  crop: <Crop size={16} />,
  blend: <Wand2 size={16} />,
  subtitle: <Layers size={16} />,
  concat: <SquareStack size={16} />,
};

export function defaultPerImage(index: number): PerImageStitch {
  return {
    mode: index === 0 ? "full" : "strip",
    height: 0,
    trimTop: 0,
    trimBottom: 0,
  };
}

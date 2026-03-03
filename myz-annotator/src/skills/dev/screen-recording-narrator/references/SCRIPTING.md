# Script Generation (Outline + OCR + Timecode)

目标：基于 **大纲意图**、**OCR 时间码上下文** 与 **Vision 语义识别** 生成更贴合画面的 TTS 文稿。

## 输入

- Outline 分段（标题 + bullets）
- OCR 结构化时间线（见 OCR_PROCESSING.md）
- Vision 语义识别结果（每帧 JSON 或原始文本，含 UI 元素/操作/文本片段）
- 可选场景切分时间线（scenedetect）

## 核心逻辑（必须）

1) **时间线对齐**
   - 以 `source.mp4` 为唯一时间基准（见 `OCR_PROCESSING.md` 的 `frames.tsv`）。
   - **单一事实来源**：所有时间码必须来自 `frames.tsv`（`source.mp4` 时间轴），不要用 TTS 时长推导。
   - 将 OCR 关键词按时间窗聚合。
   - 将 outline 的每条 bullet 通过关键词匹配到时间窗：
     - 先提取 bullet 的关键名词/动作词。
     - 用 token overlap / fuzzy match 在 OCR 标签中找最匹配窗口。
   - 若没有匹配，回退到“最近时间窗”或“全局总结”。

2) **文本生成（基于 OCR + outline）**
   - 每条 bullet 生成 1–2 句讲解，必须引用 OCR 中出现的 UI 关键词。
   - 若 Vision 结果提供更明确的 UI 动作/元素，用其补充/替换笼统描述。
   - 若 Vision 输出为非 JSON，先由 Agent 抽取 UI 元素/动作/文本片段再使用。
   - 语气：简洁、指令式、可直接配音。
   - 若 OCR 可信度低，减少引用，使用 outline 作为主导。

3) **输出结构**
   - 为每条 bullet 记录：
     - `timeRange`（startSec/endSec）
     - `ocrLabels`
     - `ttsLines[]`

建议结构：

```json
{
  "sectionId": "section-01",
  "items": [
    {
      "outline": "右键点击 - MyZ网页标注智能助理",
      "timeRange": [12, 18],
      "ocrLabels": ["MyZ网页标注智能助理", "发现关键要点"],
      "ttsLines": [
        "在页面上右键打开菜单，选择“ MyZ网页标注智能助理 ”。",
        "接着点击“发现关键要点”，开始自动标注。"
      ]
    }
  ]
}
```

## 推荐模板（可供生成时套用）

- 开场：`本节演示：{section_title}。`
- 操作：`在{ui_label}中点击{action}，触发{feature}。`
- 等待：`等待系统完成处理。`
- 结果：`右上角出现{result_hint}，标注已完成。`

## 时间码与 TTS 对齐

- `timeRange` 必须来自 `source.mp4` 时间轴（**不能**由 TTS 时长反推）。
- TTS 输出为句子级，SRT 由逐句音频时长累积生成。
- 若视频时长 < TTS 时长，需在视频末尾补帧（tpad）。
- 若 TTS 时长 < 视频时长，渲染时对音频 `apad` 补齐。

## 字幕文本规范（SRT 生成前检查）

- 句尾去掉逗号、句号等标点（冒号、顿号保留）。
- 句中出现非配对标点时，用 spacing 分隔句子（冒号、顿号除外）；竖版视频可改为分行。

## 失败回退

- OCR 可信度过低 → 使用 outline 直接生成脚本。
- OCR 与 outline 矛盾 → 优先 outline，但注明不确定。

## Voice 模式（口播转写重排）

输入为 STT 转写文本（可附带时间码），目标是生成可直接 TTS 的讲解脚本：

1) **清理与改写**
   - 去除口头语、停顿词、重复与自我修正。
   - 保留关键步骤与结论，但重排语序使逻辑顺畅。

2) **结构对齐**
   - 若提供 outline，按章节结构归类语句，补足缺失步骤。
   - 输出 `ttsLines[]`，确保每句可独立配音。

3) **结果要求**
   - 语气：清晰、指令式、适合教程配音。
   - 不保留原声，最终以 TTS 音轨为准。

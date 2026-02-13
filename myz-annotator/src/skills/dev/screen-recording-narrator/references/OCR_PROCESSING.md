# OCR Processing & Cleanup

目标：从 OCR 时间码文本中提取“稳定、可读、可用于叙述”的 UI 关键词与操作线索。
并结合本地 Ollama 视觉模型做语义化识别，用于定位关键操作与时间码。

## 输入

`ocr.json` 示例结构：

```json
[
  { "timestampSec": 0, "text": "...raw OCR..." },
  { "timestampSec": 2, "text": "...raw OCR..." }
]
```

## 语义化 OCR（Ollama Vision）

对每张关键帧执行一次视觉语义识别，输入为：
- 该帧 tesseract OCR 文本
- 当前段的 outline/口播文本（已去噪/提炼）
- “这是计算机屏幕截图”的上下文

提示词规则：
- 由 Agent 阅读以上输入，**总结成 50 字以内**的关键信息，再提交给 vision 模型。
- 不要原文堆砌；优先保留 UI 名称与动作动词。

输出为 **JSON 或非 JSON 文本**（每帧一个）：

```json
{
  "screen_summary": "...",
  "ui_elements": ["..."],
  "actions": ["..."],
  "text_snippets": ["..."],
  "warnings": ["..."],
  "confidence": 0.0
}
```

建议路径：
- `ocr/vision/prompts/<frame>.txt`
- `ocr/vision/raw/<frame>.txt`（模型输出非 JSON 时）
- `ocr/vision/<frame>.json`（模型输出为 JSON 时）

非 JSON 输出处理：
- 直接存为 `raw/<frame>.txt`。
- 由 Agent 读取原文，抽取 UI 元素、操作动词与关键文本，再用于脚本/时间码。

CLI 调用注意事项（Ollama Vision）：
- 使用 **交互式终端** 执行，并传入 **绝对路径** 的图片文件。
- 成功时控制台会显示：`Added image '/abs/path/to/frame.png'`。
- 若未出现该提示，说明图片未被识别为输入（需改用 curl API 或调整调用方式）。

## 关键帧选择与时间码映射（必须）

**唯一时间基准：`source.mp4`。**  
OCR 与 Vision 必须共享同一批帧，并且每帧都有对应的 `pts_time`（秒）。

推荐的关键帧来源（组合使用）：
1) **scene detect 帧**：捕捉跳转/弹窗出现
2) **固定间隔帧**：覆盖滚动与细微变化（如每 2 秒 1 帧）
3) **OCR 变化帧**：相邻 OCR 文本变化显著时升权

**帧 → 时间码映射文件（必须产出）：**
- `ocr/frames/frames.tsv`
- 格式：`<frame_path>\t<timestampSec>`

示例：
```
ocr/frames/0014.png    12.34
ocr/frames/0015.png    14.02
```

说明：
- OCR、Vision 均使用 `frames.tsv` 中的帧文件。
- `ocr.json` 的每条记录必须带 `timestampSec`，且来自 `frames.tsv`。
- 仅允许在 `source.mp4` 时间轴上对齐 `timeRange`。

## 清洗规则（启发式）

1) **去噪**
   - 过滤超长行（> 40 字符）与异常符号行。
   - 丢弃纯英文/纯数字噪声（若目标是中文 UI）。
   - 去除重复高频词（如大量重复的“Back/Forward”）。

2) **分词与聚合**
   - 按行拆分；对相邻时间码文本做去重合并。
   - 同一时间窗（如 2–4 秒）内重复出现的 UI 词仅保留一次。

3) **UI 关键词筛选**
   - 保留短词（2–10 字）与按钮/菜单项风格字符串。
   - 过滤“正文段落式”文本。

4) **语言与置信度判断**
   - 统计中文/英文字符比例。
   - 若中文比例 < 20%，标记该时间窗为低可信。

## 结构化输出（建议）

将清洗结果转成结构化时间码列表：

```json
[
  {
    "startSec": 10,
    "endSec": 14,
    "labels": ["MyZ网页标注智能助理", "发现关键要点"],
    "confidence": 0.72
  }
]
```

## 合并策略（OCR + Vision）

- 用 tesseract 提取“硬文字”作为 labels 基础。
- 用 vision 的 `ui_elements/actions/text_snippets` 补充 UI 语义与操作动作。
- 若二者冲突：以 tesseract 的文字为准，vision 仅用于辅助判断。
- 产出用于脚本/时间码的 `labels + actions + summary`。

## 建议的 LLM 参与点

- 输入：`timestampSec + raw OCR` 列表
- 输出：`labels + confidence + short_summary`

要求：
- 只输出 UI 组件/菜单/按钮名称
- 删除不确定或低质量词
- 每个时间窗最多 5–8 个关键词

## 失败回退

若 OCR 质量过低：
- 禁用 OCR 参与脚本生成
- 仅使用 outline 生成脚本

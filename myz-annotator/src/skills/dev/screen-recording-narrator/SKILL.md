---
name: screen-recording-narrator
description: 编排离线教程视频制作流程（录屏 + 大纲，TTS/口播），涵盖工具选择、脚本扩写、OCR 处理、字幕、渲染与故障排查。
---

# 视频流程编排器

## 何时使用

当你要用录屏视频和手写大纲产出教程视频，并且需要 Agent 主动控制流程（工具选择、文本扩写、错误恢复），而不是依赖单一 CLI 命令时，使用此技能。

## 必需参考（按需阅读）

- **配置结构**：`references/PIPELINE_CONFIG.md`
- **目录结构**：`references/DIRECTORY_STRUCTURE.md`
- **命令模板**：`references/COMMANDS.md`
- **OCR 清洗**：`references/OCR_PROCESSING.md`
- **脚本生成**：`references/SCRIPTING.md`
- **环境与检查**：`references/ENV_SETUP.md`
- **流程概览**：`references/WORKFLOW.md`
- **示例配置**：`references/pipeline.config.example.json`、`references/pipeline.config.qwen.example.json`

## 输入

- 带视频引用（HTML 注释）与分步说明的大纲文件
- 录屏视频文件夹（mov/mp4）
- 输出目标（横屏/竖屏 profile）
- 模式选择：
  - `outline-tts`：无原始口播，基于大纲生成讲解 + SRT
  - `voice`：使用原始口播为草稿（STT → 重写），再 TTS + SRT

## 目录结构（摘要）

输入：
- `resources/screen-recording/`（录屏原始文件）
- `resources/scripts/`（大纲文件）

输出（按 `projectName`）：
- `output/<project>/manifest.json`
- `output/<project>/script.json` + `script.md`
- `output/<project>/sections/section-XX/`
  - `source.mp4`、`audio.wav`（如有）
  - `ocr/ocr.json`、`tts/*.wav`、`subtitles/*.srt`
  - `renders/<profile>.mp4`
- `output/<project>/final/<project>-<profile>.mp4`

完整布局：`references/DIRECTORY_STRUCTURE.md`。

## pipeline.config.json（摘要）

- `projectName`、`outlinePath`、`videoRoot`、`outputDir`
- `mode`：`outline-tts` | `voice`
- `profiles[]`：`id`、`width`、`height`、`fps`、`aspectStrategy`
- `render`：`profiles`、`burnSubtitles`
- `script`：`includeOcrKeywords`
- `tts`：`engine`、`model/voiceModel`、`speaker`、`language`、`device`、`dtype`、`python`
- `stt`：`command`
- `ocr`：`engine`、`lang`、`intervalSec`
- `sceneDetect`：`enable`、`threshold`

完整字段说明：`references/PIPELINE_CONFIG.md`。

## 编排流程（主控）

1) **预检**
   - 确认每个引用视频存在。
   - 用 `ffprobe` 检查音频流；若无音频：
     - `voice` 模式 → 无法 STT，回退 `outline-tts`（或询问用户）。
     - `outline-tts` 模式 → 继续 TTS。
   - 执行环境检查（见 `references/ENV_SETUP.md`）。
   - 确认配置结构与输出目录（见 `references/PIPELINE_CONFIG.md`）。
   - 若缺失 `pipeline.config.json`，按规则生成。

2) **转码**
   - 统一转为 `mp4`（固定 codec/bitrate）。
   - 若无音频流，加 `-an` 避免 ffmpeg 报错。
   - `voice` 模式：抽取 `audio.wav`，检测静音并可裁剪（如 auto-editor / ffmpeg silencedetect）。
   - 命令模板见 `references/COMMANDS.md`。

3) **分析（可选）**
   - OCR 关键帧提取 UI 文本。
   - 做 OCR 清洗与结构化（见 `references/OCR_PROCESSING.md`）。
   - 关键步骤可使用 Ollama vision 语义 OCR：
     - Agent 将大纲/口播 + tesseract 文本 **提炼为 <=50 字** 再提示。
     - Vision 输出可能非 JSON，先存 raw 再人工抽取 UI/动作。

4) **脚本扩写（outline + OCR + timecode）**
   - **不要**直接使用大纲 bullets 作为最终旁白。
   - 用 OCR 时间窗 + 大纲意图生成 TTS 脚本：
     - 按关键词重合把 bullet 匹配到 OCR 时间窗。
     - 生成引用 OCR 标签的讲解句。
     - 输出每条的 `timeRange`、`ocrLabels`、`ttsLines`。
   - **优先使用 Agent 原生文本理解** 来合成脚本。
     - 仅在需要 IO/批处理时用脚本工具。
   - 详细逻辑见 `references/SCRIPTING.md`。
   - 若有 Vision 结果，用于补充 UI 动作与时间码。
   - `voice` 模式：先 STT，再 **重写**：
     - 去口头语/重复/自我修正。
     - 保留原意但整理逻辑顺序。

5) **TTS / STT**
   - `outline-tts`：
     - 按句生成配音。
     - 用句长生成 SRT。
     - 语气：**友好、平稳、温和**，默认 speaker 为 **Serena**。
   - `voice`：
     - STT 转写；无音频则跳过。
     - Agent 重写为可配音脚本。
     - TTS + SRT。
   - 命令模板见 `references/COMMANDS.md`。

6) **渲染**
   - 画幅策略：
     - `pad`（黑边）或 `blur`（背景模糊 + 前景）。
   - 需要则烧录字幕，否则保留 SRT sidecar。
   - 无音频时插入静音轨，避免 mux 报错。
   - 最终拼接默认用 **filter concat + 重新编码**，避免 AAC 时间戳问题。
   - 命令模板见 `references/COMMANDS.md`。

7) **质检与修复**
   - 确认分段顺序与大纲一致。
   - 抽查字幕同步与语速。
   - 出错只重跑对应步骤。
   - 若拼接异常，改用 filter concat 重建（不要 stream-copy）。

## 决策逻辑与检查（必须遵守）

- **音频检测**：用 `ffprobe` 检查音频流。
  - 无音频 + `voice` → 不能 STT，回退 `outline-tts`（或询问用户）。
  - 无音频 + `outline-tts` → 继续 TTS。
- **OCR 语言**：缺 `chi_sim` → OCR 低可信，禁用 OCR 驱动脚本。
- **字幕烧录**：ffmpeg 无 `subtitles` filter → 用 mpv 烧录；否则保留 SRT sidecar。
- **字幕文本规范**：
  - 字幕烧录时去掉句尾标点（逗号、句号等；冒号、顿号保留）。
  - 句中出现非配对标点时，用 spacing 分隔句子（冒号、顿号除外）；竖版视频可用分行处理。
- **时长不匹配**：TTS 音频 > 视频 → `tpad` 冻结末帧。
- **静音轨**：无音频源 → 注入静音轨避免 mux 报错。
- **缺失配置**：按规则生成最小 `pipeline.config.json`。

## 工具使用模式（离线）

完整命令模板见 `references/COMMANDS.md`。

## 故障恢复清单

- **OCR 乱码** → 检查 tesseract 语言包（`chi_sim`），必要时禁用 OCR。
- **TTS 失败** → 检查 Python 环境、`torch`、`qwen-tts`、`soundfile`。
- **字幕烧录失败** → 尝试 mpv；仍失败则保留 SRT sidecar。
- **无音频报错** → 插入静音轨。

## 预期产出

- `script.md` + `script.json`
- `subtitles/*.srt`
- `sections/*/renders/<profile>.mp4`
- `final/<project>-<profile>.mp4`

## 环境安装政策

- 仅在用户明确许可后执行安装命令（见 `references/ENV_SETUP.md`）。

## 配置生成规则（当 pipeline.config.json 缺失时）

支持的输入：
- **仅视频**：生成默认 profile 的最小配置。
- **视频 + 大纲**：设置 `outlinePath` 并保持 `mode=outline-tts`。

默认假设（可被用户或 AGENTS 覆盖）：
- `mode`：`outline-tts`
- `profiles`：`[landscape1080]`，`blur` 策略
- `render.profiles`：`[landscape1080]`
- `render.burnSubtitles`：`false`（仅当 ffmpeg 有 subtitles filter 或 mpv 可用时启用）
- `ocr`：默认关闭，除非用户要求或 AGENTS 规定
- `sceneDetect`：默认关闭
- `tts`：仅在用户确认引擎后加入

缺失时需要用户确认：
- 输出 profile（是否需要竖屏）
- TTS 引擎与语言/音色
- 字幕烧录还是 SRT sidecar

默认依据：
- 仓库 `AGENTS.md` 与本地指引

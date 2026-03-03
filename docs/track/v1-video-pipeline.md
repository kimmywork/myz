# v1-video-pipeline

## Vision / 背景动机

为录屏视频与手写大纲提供离线可执行的自动化流水线，支持两种模式（无口播 + TTS；有口播 + STT），并输出可发布的横屏/竖屏成片与同步字幕。

## Scope / Non-Goals

### Scope
- 支持 `.mov` 等原生录屏格式转码为统一的 `mp4`
- 支持两种生成模式：
  - `outline-tts`：大纲生成讲解脚本 + TTS 配音 + SRT
  - `voice`：抽取原声 + STT 转写 + 清洗重排 + TTS 配音 + SRT
- 输出横屏 1920x1080 与竖屏 1080x1920（可配置）
- 字幕与语音同步（TTS 逐句时长对齐，STT 输出 SRT）
- 产物结构化输出：manifest、script、subtitles、renders
- OCR + Vision 语义识别（Ollama）辅助脚本与时间码定位（可选）

### Non-Goals
- 不做在线模型推理调用
- 不做自动商业发布与平台上传
- 不对视频内容做主观剪辑优化（除画幅适配与必要的时长补齐）

## Data Model（schema-first）

- `PipelineConfig`
  - `projectName`, `outlinePath`, `videoRoot`, `outputDir`, `mode`
  - `profiles[]`：`width/height/fps/aspectStrategy`
  - `tts/stt/ocr/render` 可选
- `Manifest`
  - `sections[]`: `id`, `videoFile`, `title`, `bullets`
- `Script`
  - `sections[]`: `id`, `lines[]`
- `Render Output`
  - `sections/<id>/renders/<profile>.mp4`
  - `final/<project>-<profile>.mp4`

## UX / 流程

1) `init` 解析大纲生成 `manifest.json`
2) `convert` 统一转码 + 抽取音频
3) `analyze`（可选）OCR 输出 `ocr.json` + 关键帧 `frames.tsv`（source 时间轴）
4) `vision`（可选）Ollama 语义识别补充 UI/动作
5) `script` 生成 `script.json` 与 `script.md`（timeRange 来自 `frames.tsv`）
6) `tts` 或 `transcribe` 生成音频与 SRT
7) `render` 合成视频并输出最终成片

## 依赖与边界

- 依赖本地 CLI 工具：`ffmpeg/ffprobe`（必需），`whisper.cpp`、`tesseract`、`mpv`、`ollama` 等（按模式选择）
- TTS：Qwen3‑TTS（主）/ Kokoro（快速回退）
- 依赖大纲文件按注释标注视频文件名
- 依赖输出目录可写

## 验收标准（可二元判定）

- 当 `mode=outline-tts` 且配置 `tts` 时，执行 `all` 后在 `outputDir/final/` 下生成 `*-landscape1080.mp4`
- 当 `mode=voice` 且配置 `stt.command` 时，执行 `transcribe` 后每个 section 生成 `subtitles/transcript.srt`
- 当 `render.burnSubtitles=true` 时，产出的视频包含字幕层（ffmpeg libass 或 mpv）
- 当输出 profile 包含 `portrait1080` 时，最终产出存在 `*-portrait1080.mp4`
- 当原视频为 `.mov` 时，`convert` 生成 `source.mp4`

## 风险与回退方案

- 风险：外部 CLI 未安装或版本不兼容
  - 回退：`check` 输出缺失清单，跳过相关步骤
- 风险：字幕烧录依赖 `libass`
  - 回退：使用 mpv 烧录；仍不可用则关闭 `burnSubtitles`，仅输出 SRT
- 风险：时间码不一致（source/voiceover/render）
  - 回退：以 `source.mp4` 为唯一时间基准，timeRange 来自 `frames.tsv`

## 用例与边界条件

- 主路径：大纲 + 录屏 → `all` 生成横屏成片
- 边界 1：大纲引用缺失视频文件 → manifest 生成但 `convert` 跳过
- 边界 2：音频时长超过视频 → render 使用 tpad 补齐最后一帧
- 边界 3：只输出竖屏 → `render.profiles` 仅配置 `portrait1080`

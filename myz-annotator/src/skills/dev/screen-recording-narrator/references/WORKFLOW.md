# Video Pipeline Workflow

目标：将录屏视频与手写大纲自动整理成教程视频（横屏 1080p 默认），支持
- 方式 A：无原始口播 → 由大纲 + 视频内容生成讲解脚本 → TTS 配音 → 合成
- 方式 B：有原始口播 → 抽取原声 → STT 识别 → 口播转写与重排 → TTS 配音 → 合成

输出支持多档配置：横屏 1920x1080、竖屏 1080x1920（抖音/Shorts）等。

## 离线工具链（推荐组合）

必需：
- FFmpeg + FFprobe：转码、裁切、拼接、烧录字幕

可选（按能力启用）：
- STT（离线转写）：whisper.cpp 或 faster-whisper
- TTS（离线配音）：Qwen3-TTS（主，GPU 优先，CPU/MPS 需实测）、Kokoro（快速回退，尤其英文）或 sherpa-onnx TTS
- OCR（界面文字提取）：Tesseract 或 PaddleOCR
- Vision 语义识别（本地）：Ollama vision 模型（ministral-3:8b）
- 场景切分：PySceneDetect
- 自动剪静音：auto-editor（或 ffmpeg silencedetect 手动裁切）

> 注：Kokoro 模型（快速回退）  
> 英文：https://huggingface.co/hexgrad/Kokoro-82M  
> 中文：https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh  
> Mimic 3 官方仓库标注为不再维护，建议仅作为备选。  
> Qwen3-TTS 官方示例以 CUDA + FlashAttention2 为主，在 Apple Silicon 上建议先用 0.6B 模型验证稳定性与速度。

## 流程图（文本版）

录屏视频 + 大纲
  → convert（ffmpeg 转码 + 抽音频）
  → analyze（可选：scenedetect + OCR）
  → script（大纲 + OCR 线索生成讲解脚本）
  → tts（按句合成语音 + SRT 同步）
  → render（匹配画幅 + 合成 + 输出）

方式 B（有口播）：
  convert（抽取原声 + 可选剪静音）→ transcribe（STT）→ rewrite（清理口语/理顺逻辑）→ tts（TTS + SRT）→ render

## 时间码一致性（必须遵守）

**唯一时间基准：`source.mp4` 的时间码。**

- `script.json` 的 `timeRange` 必须来自 `source.mp4`（画面真实时间）。
- `voiceover.wav` 的时长只用于 **字幕时长** 和 **补音/补帧**，**不能**反向决定 `timeRange`。
- `render` 输出的时长必须与 **source 或 tpad 后的新时长**一致。

常见不一致的处理：
- **voiceover < source**：render 时对音频做 `apad` 补齐（画面不变）。
- **voiceover > source**：render 时对视频做 `tpad` 冻结末帧（或对 voiceover 做轻微 `atempo`）。

## 关键帧与 OCR/Vision 的统一策略

关键帧不要只依赖单一方法，推荐组合：

1) **scene detect 帧**：捕捉跳转/弹窗出现（画面突变）
2) **固定间隔帧**：覆盖滚动与小变化（如每 2 秒 1 帧）
3) **OCR 变化帧**：相邻 OCR 文本变化显著时升权（关键词出现/消失）

所有 OCR/Vision 识别必须基于 **同一批帧**，并且每帧有明确时间码映射（见 `references/OCR_PROCESSING.md`）。

## 目录结构

```
workflow/video-pipeline/
  output/
    <project>/
      manifest.json
      sections/
        section-01/
          source.mp4
          audio.wav
          ocr/
          tts/
          subtitles/
          renders/
      final/
```

## 使用方式

CLI 已移除，当前流程由 **skill** 主控执行：

- `.agents/skills/screen-recording-narrator/SKILL.md`

该 skill 覆盖完整流程、检查项、脚本模板与命令清单，并在 reference 中提供配置结构与环境设置说明。

## 画幅适配策略

- pad（默认）：保持原画面比例，黑边补齐
- blur：用放大模糊背景填满画幅，再叠加原画面

在 `profiles[].aspectStrategy` 中配置。

## 配置要点

- `mode`: `outline-tts` 或 `voice`
- `profiles[]`: 输出画幅与分辨率
- `render.profiles`: 选择输出的 profile（默认全量）
- `sceneDetect.enable`: 开启 `scenedetect` 场景切分（可选）
- `ocr`: 开启 OCR 识别（可选）
- `tts` / `stt`: 选择离线语音能力
- `script.includeOcrKeywords`: 是否把 OCR 关键词写入脚本（默认 `false`）

### Qwen3-TTS 配置要点

- `tts.engine`: `qwen-tts`
- `tts.model`: 模型名称或本地路径（建议先下载到本地）
- `tts.device`: `cpu` / `mps` / `cuda:0`（Mac 默认用 `cpu` 或 `mps`）
- `tts.dtype`: `float32`（CPU 推荐），GPU 可选 `float16/bfloat16`
- `tts.speaker` / `tts.language` / `tts.instruct`: 可选风格控制

## 字幕同步策略

- 方式 A（TTS）：按“句子级”分段合成音频；每句时长由 `ffprobe` 精确读取，自动生成 SRT
- 方式 B（口播）：STT 输出文本后由 Agent 重写脚本，再按 TTS 句子时长生成 SRT
- SRT 生成阶段必须做字幕文本规范化：句尾去掉逗号/句号等标点（冒号、顿号保留）；句中非配对标点用 spacing 分隔句子（冒号、顿号除外；竖版可分行）
> 若需要烧录字幕，请确认本机 ffmpeg 含 `libass` 支持；否则使用 mpv 进行烧录。

## 无音频录屏的处理

- 若源视频没有音频流，`convert` 会跳过 `audio.wav` 的提取并给出提示
- `voice` 模式下无音频 → 无法 STT，需回退 `outline-tts`（或用户指定处理方式）
- `render` 在没有原声且无 TTS 音轨时会自动加入静音音轨，避免 ffmpeg 报错

## 需要你手动安装的工具

必装：
- ffmpeg（含 ffprobe）

按需安装：
- whisper.cpp 或 faster-whisper（口播转写）
- Qwen3-TTS / Kokoro / sherpa-onnx TTS（离线配音）
- tesseract 或 paddleocr（界面文字识别）
- scenedetect（场景切分）
- auto-editor（自动剪静音）

> 环境检查与安装请参考 `references/ENV_SETUP.md`。
> Qwen3-TTS 需 Python 环境（建议 Python 3.12）与 `qwen-tts`、`torch`、`soundfile` 等依赖。

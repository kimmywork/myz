# Pipeline Config Schema (pipeline.config.json)

配置文件用于描述输入资源、输出目标、渲染策略与 TTS/STT/OCR 选项。
路径均以该配置文件所在目录为基准解析（相对路径）。

示例配置：
- `references/pipeline.config.example.json`
- `references/pipeline.config.qwen.example.json`

## Missing config auto-generation

如果用户未提供 `pipeline.config.json`，按下列规则生成最小可用配置：

### 1) 仅提供视频文件

- `outlinePath` 留空或跳过（仅 render + 直接 TTS 由用户确认）
- `mode`: `outline-tts`
- `profiles`: 单一 `landscape1080`（1920x1080, fps=30, blur）
- `render.burnSubtitles`: `false`（直到确认 ffmpeg subtitles filter）
- `ocr` / `sceneDetect`: 默认关闭

### 2) 视频 + 大纲

- 使用大纲路径与大纲内注释的视频文件名
- `mode`: `outline-tts`
- OCR 默认关闭，除非用户要求或 AGENTS 指示启用

### 3) 必须用户确认的项

- 输出 profile（是否需要竖屏）
- TTS 引擎与语言/声音
- 是否烧录字幕（ffmpeg/libass）

### 4) 可由 AGENTS 推断的项

- 默认输出分辨率与画幅策略
- 默认 OCR / sceneDetect 策略（通常关闭）

## 顶层结构

```json
{
  "projectName": "auto-highlight",
  "outlinePath": "../../resources/scripts/auto-highlight.md",
  "videoRoot": "../../resources/screen-recording",
  "outputDir": "./output/auto-highlight",
  "mode": "outline-tts",
  "profiles": [
    {
      "id": "landscape1080",
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "aspectStrategy": "blur"
    }
  ],
  "render": {
    "profiles": ["landscape1080"],
    "burnSubtitles": true
  },
  "script": {
    "includeOcrKeywords": false
  },
  "tts": {
    "engine": "qwen-tts",
    "model": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    "speaker": "Vivian",
    "language": "Chinese",
    "device": "cpu",
    "dtype": "float32",
    "python": "/ABS/PATH/python3"
  },
  "stt": {
    "command": "whisper-cli -m /ABS/PATH/ggml-large-v3.bin -f {input} -osrt -of {outputBase}"
  },
  "ocr": {
    "engine": "tesseract",
    "lang": "chi_sim+eng",
    "intervalSec": 2
  },
  "sceneDetect": {
    "enable": false,
    "threshold": 30
  }
}
```

## 字段说明

- `projectName` (string, required)
  - 项目输出命名与 final 文件前缀。

- `outlinePath` (string, required)
  - 大纲文件路径，包含注释式视频文件名与分段内容。

- `videoRoot` (string, required)
  - 录屏视频根目录。

- `outputDir` (string, required)
  - 输出目录。

- `mode` ("outline-tts" | "voice", required)
  - `outline-tts`: 无口播，基于大纲+OCR生成脚本并 TTS。
  - `voice`: 基于口播做 STT，再由 Agent 转写与重排，最后 TTS 配音并生成字幕。

- `profiles` (array, required)
  - 输出画幅配置。
  - `id`: profile 标识（用于 renders 文件名）。
  - `width/height`: 输出分辨率。
  - `fps`: 输出帧率。
  - `aspectStrategy`: `pad` | `blur`。

- `render` (object, optional)
  - `profiles`: 选择输出哪些 profile（缺省为全部）。
  - `burnSubtitles`: 是否烧录字幕（依赖 ffmpeg subtitles filter/libass）。

- `script` (object, optional)
  - `includeOcrKeywords`: 是否把 OCR 关键词写入脚本。默认 false。

- `tts` (object, optional)
  - `engine`: `qwen-tts` | `kokoro` | `custom`。
  - `model`: Qwen3‑TTS 或 Kokoro 模型名/本地路径。
    - Kokoro English: https://huggingface.co/hexgrad/Kokoro-82M
    - Kokoro Chinese: https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh
  - `speaker/language/instruct`: 语音风格控制（教程类默认建议 `speaker=Serena`，`instruct=Friendly, calm, and warm guiding tutorial narration.`）。
  - `device`: `cpu` | `mps` | `cuda:0`。
  - `dtype`: `float32` / `float16` / `bfloat16`。
  - `python`: TTS 使用的 python 解释器。
  - `command`: custom 引擎命令模板。

- `stt` (object, optional)
  - `command`: STT 命令模板，支持占位符：
    - `{input}` 绝对音频路径
    - `{outputBase}` 输出基路径（不含后缀）
    - `{outputDir}` 输出目录

- `ocr` (object, optional)
  - `engine`: `tesseract`。
  - `lang`: OCR 语言包组合（如 `chi_sim+eng`）。
  - `intervalSec`: 抽帧间隔秒数。

- `sceneDetect` (object, optional)
  - `enable`: 是否启用场景切分。
  - `threshold`: content detection 阈值。

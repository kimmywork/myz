# Environment Setup (Offline)

> 仅在用户明确许可后执行安装命令。

## 预检清单（推荐先跑）

```bash
ffmpeg -version
ffprobe -version
ffmpeg -filters | rg -n "subtitles"   # 验证是否有字幕 filter
command -v mpv                         # ffmpeg 无 libass 时的字幕烧录备用

tesseract --list-langs                # 验证 chi_sim/chi_tra

python3 - <<PY
import torch, soundfile, qwen_tts
print(torch.__version__)
print(qwen_tts.__version__)
PY
```

## macOS (Homebrew)

```bash
brew install ffmpeg
brew install tesseract
brew install tesseract-lang
brew install sox
```

- `ffmpeg` 若不含 `subtitles` filter，需要确认是否启用了 `libass`；否则使用 `mpv` 进行字幕烧录。
- `tesseract-lang` 提供 `chi_sim` 等语言包。
- `sox` 仅用于部分 TTS 工具的音频后处理，缺失会有警告。

## Python 依赖

```bash
# 示例：pyenv 环境
pyenv install 3.13.0
pyenv local 3.13.0

python -m pip install --upgrade pip
python -m pip install torch soundfile qwen-tts
```

## 模型缓存（离线）

```bash
# 预下载模型（示例）
huggingface-cli download Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice
```

## 常见问题

- `ModuleNotFoundError: torch`
  - 确认 `python` 与已安装 torch 的解释器一致。

- `ffmpeg subtitles filter not found`
  - 安装支持 libass 的 ffmpeg，或改用 `mpv` 进行字幕烧录。

- OCR 乱码
  - 确认 tesseract 语言包包含 `chi_sim`。

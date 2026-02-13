# Command Templates (offline)

> 仅作为参考模板，具体参数按项目调整。
> 这些命令已拆分到 `scripts/` 目录，默认从 `screen-recording-narrator/` 目录执行。

## 预检

```bash
# 检查字幕烧录能力（ffmpeg libass 或 mpv）
bash scripts/preflight_check_ffmpeg_subtitles.sh

# 检查 tesseract 语言包
bash scripts/preflight_check_tesseract_langs.sh

# 检查音频流
bash scripts/preflight_check_audio_stream.sh "<video>"
```

## 转码 / 抽音

```bash
# 转 mp4（带音频）
bash scripts/convert_mp4_with_audio.sh "<source>" "<dest>/source.mp4"

# 转 mp4（无音频，避免报错）
bash scripts/convert_mp4_no_audio.sh "<source>" "<dest>/source.mp4"

# 抽取单声道 16k 音频
bash scripts/extract_audio_wav.sh "<dest>/source.mp4" "<dest>/audio.wav"
```

## OCR 抽帧 + 识别

```bash
# 抽帧 + 生成 frames.tsv（可选缩放：WxH）
bash scripts/ocr_extract_frames.sh "<dest>/source.mp4" <intervalSec> "<dest>/ocr/frames" 640x480

# 输出：
# <dest>/ocr/frames/showinfo.log
# <dest>/ocr/frames/frames.tsv

# OCR（tesseract）
bash scripts/ocr_tesseract.sh "<frame>.png" "chi_sim+eng"
```

## OCR 语义识别（Ollama Vision）

> 使用本地 Ollama vision 模型（`ministral-3:8b`）。
> 提示词需包含：大纲/口播、tesseract OCR 结果、屏幕录制上下文，并先做关键信息提炼。
> 由 Agent 阅读这些输入，**总结成 50 字以内**的关键信息，再提交给 vision 模型。

## 关键帧抽取 + 时间码映射（source 时间轴）

> `ocr_extract_frames.sh` 已默认生成 `frames.tsv`。以下是 **scene detect** 的替代方案。
> 关键帧需要记录 `pts_time`，生成 `ocr/frames/frames.tsv`（`frame_path<TAB>timestampSec`）。
> OCR 与 Vision 必须使用同一批帧。

### 固定间隔帧（例：每 2 秒 1 帧）

```bash
mkdir -p "<dest>/ocr/frames"
ffmpeg -y -i "<dest>/source.mp4" \
  -vf "fps=1/2,scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,showinfo" \
  -vsync vfr "<dest>/ocr/frames/%04d.png" 2> "<dest>/ocr/frames/showinfo.log"

# 提取 pts_time 列表
rg "pts_time" "<dest>/ocr/frames/showinfo.log" \
  | awk -F'pts_time:' '{print $2}' \
  | awk '{print $1}' > "<dest>/ocr/frames/pts.txt"

# 生成 frames.tsv（按文件顺序对齐）
ls "<dest>/ocr/frames/"*.png | sort \
  | paste -d $'\\t' - "<dest>/ocr/frames/pts.txt" \
  > "<dest>/ocr/frames/frames.tsv"
```

### scene detect 帧（捕捉跳转）

```bash
mkdir -p "<dest>/ocr/frames"
ffmpeg -y -i "<dest>/source.mp4" \
  -vf "select=gt(scene\\,0.3),scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2,showinfo" \
  -vsync vfr "<dest>/ocr/frames/%04d.png" 2> "<dest>/ocr/frames/showinfo.log"

# 生成 frames.tsv（同上）
```

### OCR 变化帧（策略提示）

- 对固定间隔 OCR 文本做 diff（token 变化率/编辑距离），变化显著的时间点升权。
- 在 `frames.tsv` 中标记高优先级帧（可额外维护 `frames.priority.tsv`）。

```bash
# 先由 Agent 生成 <=50 字提示词（例）
cat <<'EOF' > "<dest>/ocr/vision/prompts/<frame>.txt"
这是计算机屏幕截图。基于大纲与口播，本帧涉及点击“设置”菜单并进入偏好选项。OCR显示“Settings/Preferences”。
EOF

# 语义识别（输出可能为非 JSON，默认保存 raw）
# 注意：CLI 方式需要 **交互式终端** + **绝对路径**，否则可能不触发图片输入。
# 成功时会出现：Added image '/abs/path/to/frame.png'
bash scripts/ocr_ollama_vision.sh "ministral-3:8b" "/abs/path/to/<frame>.png" \
  "<dest>/ocr/vision/prompts/<frame>.txt" \
  "<dest>/ocr/vision/raw/<frame>.txt"

# 若模型确实返回 JSON，可改为保存为 .json
# bash scripts/ocr_ollama_vision.sh "ministral-3:8b" "<frame>.png" \
#   "<dest>/ocr/vision/prompts/<frame>.txt" \
#   "<dest>/ocr/vision/<frame>.json"
```

## 场景切分（可选）

```bash
bash scripts/scenedetect.sh "<dest>/source.mp4" <threshold> "<dest>/scenedetect"
```

## TTS（Qwen3-TTS，主）

```bash
python scripts/tts_qwen.py \
  --model "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice" \
  --text "..." \
  --language "Chinese" \
  --speaker "Serena" \
  --device "cpu" \
  --dtype "float32" \
  --out "/path/to/line-01.wav"
```

## TTS（Kokoro，快速回退）

> 模型：
> 英文：https://huggingface.co/hexgrad/Kokoro-82M  
> 中文：https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh
```bash
# 英文（默认）
python scripts/tts_kokoro.py \
  --model "hexgrad/Kokoro-82M" \
  --language "English" \
  --voice "af_heart" \
  --text "..." \
  --out "/path/to/line-01.wav"

# 中文（v1.1）
python scripts/tts_kokoro.py \
  --model "hexgrad/Kokoro-82M-v1.1-zh" \
  --language "Chinese" \
  --voice "zf_001" \
  --text "..." \
  --out "/path/to/line-01.wav"
```

## TTS 合并 + SRT

```bash
# concat.txt 例：
# file /abs/line-01.wav
# file /abs/line-02.wav

bash scripts/concat_wav.sh concat.txt voiceover.wav
```

```bash
# 生成 SRT（不修改 timeRange）
python scripts/update_time_ranges.py \
  --script "<dest>/script.json" \
  --output-dir "<dest>"

# 若确实需要用 TTS 时长更新时间码（仅在已对齐时使用）
python scripts/update_time_ranges.py \
  --script "<dest>/script.json" \
  --output-dir "<dest>" \
  --update-time-range
```

## STT（示例占位）

```bash
# 使用 whisper.cpp 或其他离线 STT
bash scripts/stt_whisper.sh "/ABS/PATH/ggml-large-v3.bin" "<audio.wav>" "<outputBase>"
```

## 渲染（画幅适配）

### pad 策略

```bash
bash scripts/render_pad.sh "source.mp4" "voiceover.wav" "renders/profile.mp4" WIDTH HEIGHT 30
```

### blur 策略

```bash
bash scripts/render_blur.sh "source.mp4" "voiceover.wav" "renders/profile.mp4" WIDTH HEIGHT 30
```

### 音频长于视频时补帧（tpad）

```bash
-vf "tpad=stop_mode=clone:stop_duration=<extraSec>"
```

### 无音频时插入静音轨

```bash
bash scripts/render_silent_audio.sh "source.mp4" "renders/profile.mp4"
```

### 字幕烧录（mpv，ffmpeg 无 libass 时使用）

> mpv 自带 libass，可用于烧录 SRT。建议在**每个 section 渲染完成后**烧录，再做 concat。

```bash
mpv "renders/profile.mp4" \
  --sub-file="subtitles/voiceover.srt" \
  --sub-font="Heiti SC" \
  --sub-font-size=36 \
  --sub-border-size=2 \
  --sub-shadow-offset=0 \
  --vf=sub \
  --o="renders/profile.sub.mp4" \
  --ovc=libx264 --oac=aac
```

> 字体可用 `fc-list | rg -i 'heiti|pingfang|hiragino'` 查看并替换。

### 字幕烧录（需 ffmpeg subtitles filter）

```bash
-vf "subtitles=/abs/path/voiceover.srt"
```

## 最终拼接（默认推荐）

```bash
# 使用 filter concat，避免 AAC 时间戳/拼接问题
bash scripts/concat_filter.sh final.mp4 \
  section-01/renders/landscape1080.mp4 \
  section-02/renders/landscape1080.mp4
```

## 备选（仅在无音频或验证无问题时）

```bash
# concat list
# file /abs/section-01/renders/landscape1080.mp4
# file /abs/section-02/renders/landscape1080.mp4

bash scripts/concat_list.sh concat-landscape1080.txt final.mp4
```

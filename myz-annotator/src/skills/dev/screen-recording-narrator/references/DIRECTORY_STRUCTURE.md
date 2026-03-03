# Directory Structure

## Inputs

```
resources/
  screen-recording/
    <recording>.mov
  scripts/
    <outline>.md
```

- 大纲文件通过 HTML 注释引用视频文件名：

```
<!-- Screen Recording 2026-02-03 at 12.58.02.mov -->
标题
- 步骤...
```

## Outputs (default)

```
workflow/video-pipeline/output/<project>/
  manifest.json
  script.json
  script.md
  sections/
    section-01/
      source.mp4
      audio.wav             # 若源视频含音频
      ocr/
        frames/
          frames.tsv          # 帧->时间码映射（source 时间轴）
          showinfo.log         # 可选：ffmpeg showinfo 输出
        ocr.json
        tesseract/
        vision/
          raw/
      tts/
        line-01.wav
        ...
        voiceover.wav
        concat.txt
      subtitles/
        voiceover.srt       # outline-tts
        transcript.srt      # voice
      renders/
        landscape1080.mp4
        portrait1080.mp4
    section-02/...
  final/
    <project>-landscape1080.mp4
    <project>-portrait1080.mp4
    concat-landscape1080.txt
```

## Sidecar / Intermediate Files

- `manifest.json`: 从 outline 解析出的分段结构。
- `ocr.json`: OCR 时间码与文本。
- `script.json`: 生成的 TTS 脚本（带段落与句子）。
- `voiceover.srt`: 由 TTS 句长生成的字幕。

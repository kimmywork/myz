#!/usr/bin/env python3
import argparse
import json
import wave
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate SRT from line wavs; optionally update timeRange."
    )
    parser.add_argument("--script", required=True, help="Path to script.json")
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Project output dir containing sections/<sectionId>/tts",
    )
    parser.add_argument(
        "--update-time-range",
        action="store_true",
        help="Update timeRange based on TTS durations (use only if aligned).",
    )
    return parser.parse_args()


def wav_duration(path: Path) -> float:
    with wave.open(path.as_posix(), "rb") as wav:
        frames = wav.getnframes()
        rate = wav.getframerate()
    return frames / float(rate)


def format_srt_time(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def generate_srt(lines: list[str], durations: list[float]) -> str:
    parts = []
    current = 0.0
    for idx, (line, duration) in enumerate(zip(lines, durations), start=1):
        start = current
        end = current + duration
        current = end
        parts.append(str(idx))
        parts.append(f"{format_srt_time(start)} --> {format_srt_time(end)}")
        parts.append(line)
        parts.append("")
    return "\n".join(parts).strip() + "\n"


def main() -> int:
    args = parse_args()
    script_path = Path(args.script)
    output_dir = Path(args.output_dir)
    data = json.loads(script_path.read_text(encoding="utf-8"))

    for section in data.get("sections", []):
        section_id = section.get("sectionId")
        if not section_id:
            continue
        tts_dir = output_dir / "sections" / section_id / "tts"
        subtitles_dir = output_dir / "sections" / section_id / "subtitles"
        subtitles_dir.mkdir(parents=True, exist_ok=True)

        items = section.get("items", [])
        tts_lines = []
        line_counts = []
        for item in items:
            lines = item.get("ttsLines", [])
            line_counts.append(len(lines))
            tts_lines.extend(lines)

        durations = []
        for idx in range(1, len(tts_lines) + 1):
            wav_path = tts_dir / f"line-{idx:02d}.wav"
            if not wav_path.exists():
                raise SystemExit(f"Missing wav: {wav_path}")
            durations.append(wav_duration(wav_path))

        if args.update_time_range:
            cursor = 0
            current = 0.0
            for item, count in zip(items, line_counts):
                item_duration = sum(durations[cursor : cursor + count])
                start = current
                end = current + item_duration
                current = end
                item["timeRange"] = [round(start, 2), round(end, 2)]
                cursor += count

        srt_content = generate_srt(tts_lines, durations)
        (subtitles_dir / "voiceover.srt").write_text(
            srt_content, encoding="utf-8"
        )

    if args.update_time_range:
        script_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

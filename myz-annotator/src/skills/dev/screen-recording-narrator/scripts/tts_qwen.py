#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Qwen3-TTS single-line synthesis")
    parser.add_argument("--model", required=True, help="Qwen3-TTS model id or local path")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--text-file", help="Path to a text file to synthesize")
    parser.add_argument("--language", default="Chinese")
    parser.add_argument("--speaker", default="Serena")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--device", default="cpu", help="cpu | mps | cuda:0")
    parser.add_argument("--dtype", default="float32", help="float32 | float16 | bfloat16")
    parser.add_argument("--out", required=True, help="Output wav path")
    return parser.parse_args()


def resolve_text(args: argparse.Namespace) -> str:
    if args.text and args.text_file:
        raise SystemExit("Provide either --text or --text-file, not both.")
    if args.text:
        return args.text
    if args.text_file:
        return Path(args.text_file).read_text(encoding="utf-8")
    raise SystemExit("Missing text input. Use --text or --text-file.")


def main() -> int:
    args = parse_args()
    text = resolve_text(args)

    try:
        import torch
        import soundfile as sf
        from qwen_tts import Qwen3TTSModel
    except Exception as exc:
        raise SystemExit(f"Missing dependencies for Qwen3-TTS: {exc}")

    dtype_map = {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }
    if args.dtype not in dtype_map:
        raise SystemExit(f"Unsupported dtype: {args.dtype}")

    model = Qwen3TTSModel.from_pretrained(
        args.model,
        device_map=args.device,
        dtype=dtype_map[args.dtype],
    )

    wav_list, sr = model.generate_custom_voice(
        text=text,
        language=args.language,
        speaker=args.speaker,
        instruct=args.instruct,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path.as_posix(), wav_list[0], sr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

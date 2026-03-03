#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

DEFAULT_REPO_EN = "hexgrad/Kokoro-82M"
DEFAULT_REPO_ZH = "hexgrad/Kokoro-82M-v1.1-zh"

LANGUAGE_TO_CODE = {
    "en": "a",
    "english": "a",
    "en-us": "a",
    "american": "a",
    "en-gb": "b",
    "british": "b",
    "es": "e",
    "spanish": "e",
    "fr": "f",
    "french": "f",
    "hi": "h",
    "hindi": "h",
    "it": "i",
    "italian": "i",
    "ja": "j",
    "japanese": "j",
    "pt-br": "p",
    "portuguese": "p",
    "zh": "z",
    "zh-cn": "z",
    "chinese": "z",
    "mandarin": "z",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Kokoro TTS (fast fallback) wrapper")
    parser.add_argument("--model", help="Kokoro repo id or local model path")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--text-file", help="Path to a text file to synthesize")
    parser.add_argument("--out", required=True, help="Output wav path")
    parser.add_argument("--device", default="cpu", help="cpu | mps | cuda:0")
    parser.add_argument("--language", default="English")
    parser.add_argument("--lang-code", help="Override language code (e.g. a/b/e/f/h/i/j/p/z)")
    parser.add_argument("--voice", default="")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--split-pattern", default=r"\n+")
    parser.add_argument("--silence-ms", type=int, default=0)
    return parser.parse_args()


def resolve_text(args: argparse.Namespace) -> str:
    if args.text and args.text_file:
        raise SystemExit("Provide either --text or --text-file, not both.")
    if args.text:
        return args.text
    if args.text_file:
        return Path(args.text_file).read_text(encoding="utf-8")
    raise SystemExit("Missing text input. Use --text or --text-file.")

def resolve_lang_code(args: argparse.Namespace) -> str:
    if args.lang_code:
        return args.lang_code
    key = args.language.strip().lower()
    if key in LANGUAGE_TO_CODE:
        return LANGUAGE_TO_CODE[key]
    raise SystemExit(f"Unsupported language: {args.language}. Provide --lang-code.")


def resolve_default_repo(lang_code: str) -> str:
    if lang_code == "z":
        return DEFAULT_REPO_ZH
    return DEFAULT_REPO_EN


def resolve_default_voice(lang_code: str, repo_id: str | None) -> str:
    if lang_code == "a":
        return "af_heart"
    if lang_code == "b":
        return "bf_emma"
    if lang_code == "z":
        if repo_id and "v1.1-zh" in repo_id:
            return "zf_001"
        return "zf_xiaobei"
    raise SystemExit("Missing --voice for this language.")


def load_voice_tensor(voice: str, torch_module):
    if not voice:
        return None
    if voice.endswith(".pt"):
        try:
            return torch_module.load(voice, weights_only=True)
        except TypeError:
            return torch_module.load(voice)
    return voice


def build_pipeline(lang_code: str, repo_id: str | None, device: str):
    from kokoro import KPipeline, KModel

    model = None
    if repo_id and lang_code == "z":
        try:
            model = KModel(repo_id=repo_id).to(device).eval()
        except Exception:
            model = None

    kwargs = {"lang_code": lang_code}
    if repo_id:
        kwargs["repo_id"] = repo_id
    if model is not None:
        kwargs["model"] = model

    try:
        return KPipeline(**kwargs)
    except TypeError:
        kwargs.pop("model", None)
        try:
            return KPipeline(**kwargs)
        except TypeError:
            return KPipeline(lang_code=lang_code)


def to_numpy(audio, np_module):
    if hasattr(audio, "detach"):
        return audio.detach().cpu().numpy()
    return np_module.asarray(audio)


def main() -> int:
    args = parse_args()
    text = resolve_text(args)

    try:
        import numpy as np
        import soundfile as sf
        import torch
    except Exception as exc:
        raise SystemExit(f"Missing dependencies for Kokoro: {exc}")

    lang_code = resolve_lang_code(args)
    repo_id = args.model or resolve_default_repo(lang_code)
    voice = args.voice or resolve_default_voice(lang_code, repo_id)
    voice_value = load_voice_tensor(voice, torch)

    pipeline = build_pipeline(lang_code, repo_id, args.device)
    generator = pipeline(
        text,
        voice=voice_value,
        speed=args.speed,
        split_pattern=args.split_pattern,
    )

    sample_rate = 24000
    silence_samples = int(sample_rate * args.silence_ms / 1000)
    chunks = []

    for index, item in enumerate(generator):
        if isinstance(item, tuple) and len(item) >= 3:
            audio = item[2]
        else:
            audio = getattr(item, "audio", None)
        if audio is None:
            continue
        audio_np = to_numpy(audio, np)
        if index > 0 and silence_samples > 0:
            chunks.append(np.zeros(silence_samples, dtype=audio_np.dtype))
        chunks.append(audio_np)

    if not chunks:
        raise SystemExit("No audio generated from Kokoro pipeline.")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path.as_posix(), np.concatenate(chunks), sample_rate)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Protocolo Newborn — Gerador Automático de Narração Imersiva PT-BR (Google Colab)
Usa Chatterbox Multilingual (resemble-ai/chatterbox) para clonar um clipe de
referência de ~5s em português ofegante e gerar todos os áudios .ogg/.mp3
definidos em narration_manifest.json já nas pastas corretas:
  - Base APK: public/audio/narration/base/
  - Capítulos modulares: assets-chapters/fase_01..07/audio/narration/
  - Eventos compartilhados: assets-chapters/shared/audio/narration/

Uso no Google Colab:
  !pip install -q chatterbox-tts torchaudio soundfile pydub
  !apt-get -qq install -y ffmpeg
  !python scripts/generate_narration_colab.py --ref reference_breathless_ptbr.wav --format ogg
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "narration_manifest.json"
PUBLIC_MANIFEST_PATH = ROOT / "public" / "narration_manifest.json"
PUBLIC_DATA_MANIFEST_PATH = ROOT / "public" / "data" / "narration_manifest.json"
PUBLIC_AUDIO_DIR = ROOT / "public"
CHAPTERS_DIR = ROOT / "assets-chapters"

EMOTION_EXAGGERATION_MAP = {
    "calmo": 0.42,
    "tenso": 0.68,
    "medo": 0.78,
    "ofegante": 0.86,
    "panico": 0.96,
}


def maybe_prompt_colab_upload(default_ref: Path) -> Path:
    if default_ref.exists():
        return default_ref
    try:
        from google.colab import files  # type: ignore

        print(f"[Colab] Envie um clipe WAV/OGG/MP3 de ~5s em PT-BR ofegante para clonar a voz:")
        uploaded = files.upload()
        if uploaded:
            first_name = next(iter(uploaded.keys()))
            target = ROOT / first_name
            target.write_bytes(uploaded[first_name])
            return target
    except ImportError:
        pass
    raise FileNotFoundError(
        f"Arquivo de referência não encontrado: {default_ref}. "
        "Passe --ref caminho/do/seu_audio_5s.wav"
    )


def convert_wav_to_target(wav_path: Path, target_path: Path, fmt: str) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "wav":
        target_path.write_bytes(wav_path.read_bytes())
        return

    codec_args = (
        ["-c:a", "libvorbis", "-q:a", "4"]
        if fmt == "ogg"
        else ["-c:a", "libmp3lame", "-b:a", "128k"]
    )
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), *codec_args, str(target_path)]
    subprocess.run(cmd, check=True)


def destination_for_cue(cue: dict, fmt: str) -> Path:
    rel = Path(cue["audioPath"])
    if fmt != "ogg":
        rel = rel.with_suffix(f".{fmt}")

    scope = cue.get("scope", "shared")
    if scope == "base":
        return PUBLIC_AUDIO_DIR / rel
    if scope == "chapter" and cue.get("chapterId"):
        ch_id = int(cue["chapterId"])
        return CHAPTERS_DIR / f"fase_0{ch_id}" / rel
    return CHAPTERS_DIR / "shared" / rel


def update_available_base_audio(manifest_paths: list[Path], base_rel_paths: list[str]) -> None:
    unique_sorted = sorted(set(base_rel_paths))
    for path in manifest_paths:
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data["availableBaseAudio"] = unique_sorted
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gerar narração PT-BR com Chatterbox Multilingual")
    parser.add_argument("--ref", default="reference_breathless_ptbr.wav", help="Clipe de voz PT-BR (~5s)")
    parser.add_argument("--format", choices=["ogg", "mp3"], default="ogg", help="Formato final de saída")
    parser.add_argument("--device", default="cuda", help="Dispositivo PyTorch (cuda ou cpu)")
    parser.add_argument("--dry-run", action="store_true", help="Apenas valida o roteiro e caminhos sem rodar GPU")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    cues = manifest.get("cues", [])
    print(f"[Narration] Carregadas {len(cues)} falas PT-BR para {manifest.get('personagem', 'Arthur Vance')}.")

    if args.dry_run:
        for cue in cues:
            dest = destination_for_cue(cue, args.format)
            exag = cue.get("exaggeration", EMOTION_EXAGGERATION_MAP.get(cue.get("emotion", "tenso"), 0.7))
            print(f"  - {cue['id']} ({cue['emotion']}, exag={exag:.2f}) -> {dest.relative_to(ROOT)}")
        return

    ref_path = maybe_prompt_colab_upload(Path(args.ref))

    try:
        import torch
        import torchaudio as ta
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # type: ignore
    except ImportError as exc:
        print(
            "Dependências não encontradas. No Colab execute:\n"
            "  !pip install -q chatterbox-tts torchaudio\n"
            f"Detalhe: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)

    device = args.device if (args.device == "cpu" or torch.cuda.is_available()) else "cpu"
    print(f"[Chatterbox] Carregando ChatterboxMultilingualTTS no dispositivo '{device}'...")
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)

    tmp_wav = ROOT / ".tmp_narration_synth.wav"
    generated_base_rel: list[str] = []

    for idx, cue in enumerate(cues, start=1):
        emotion = cue.get("emotion", "tenso")
        exaggeration = float(cue.get("exaggeration", EMOTION_EXAGGERATION_MAP.get(emotion, 0.7)))
        cfg_weight = float(cue.get("cfgWeight", 0.45))
        dest = destination_for_cue(cue, args.format)

        print(f"[{idx}/{len(cues)}] {cue['id']} | emoção={emotion} | exaggeration={exaggeration:.2f}")
        wav = model.generate(
            cue["text"],
            language_id="pt",
            audio_prompt_path=str(ref_path),
            exaggeration=exaggeration,
            cfg_weight=cfg_weight,
        )
        ta.save(str(tmp_wav), wav, model.sr)
        convert_wav_to_target(tmp_wav, dest, args.format)

        if cue.get("scope") == "base":
            generated_base_rel.append(str(dest.relative_to(PUBLIC_AUDIO_DIR)).replace("\\", "/"))

    if tmp_wav.exists():
        tmp_wav.unlink()

    if generated_base_rel:
        update_available_base_audio(
            [MANIFEST_PATH, PUBLIC_MANIFEST_PATH, PUBLIC_DATA_MANIFEST_PATH],
            generated_base_rel,
        )
        print(f"[Manifesto] availableBaseAudio atualizado com {len(generated_base_rel)} faixas base.")

    print("[Concluído] Agora execute `npm run package:levels` ou envie ao GitHub para publicar nas fases!")


if __name__ == "__main__":
    main()

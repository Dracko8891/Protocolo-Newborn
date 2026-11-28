#!/usr/bin/env python3
"""
Protocolo Newborn — Gerador CPU Leve de Narração PT-BR (edge-tts + ffmpeg)
Lê public/data/narration_manifest.json (ou narration_manifest.json) e sintetiza
todas as 34 falas em Português (BR) com voz masculina expressiva (pt-BR-AntonioNeural),
ajustando ritmo/tom conforme a emoção (calmo, tenso, medo, ofegante, panico),
convertendo para .ogg compacto nos diretórios modulares do APK base e das fases.
"""

import argparse
import asyncio
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_MANIFEST_PATH = ROOT / "public" / "data" / "narration_manifest.json"
MANIFEST_PATH = ROOT / "narration_manifest.json"
PUBLIC_MANIFEST_PATH = ROOT / "public" / "narration_manifest.json"
PUBLIC_DIR = ROOT / "public"
CHAPTERS_DIR = ROOT / "assets-chapters"

EMOTION_PROSODY = {
    "calmo": {"rate": "-6%", "pitch": "-4Hz"},
    "tenso": {"rate": "-2%", "pitch": "-2Hz"},
    "medo": {"rate": "+3%", "pitch": "+2Hz"},
    "ofegante": {"rate": "+12%", "pitch": "+4Hz"},
    "panico": {"rate": "+22%", "pitch": "+8Hz"},
}


def destination_for_cue(cue: dict, fmt: str) -> Path:
    rel = Path(cue["audioPath"])
    if fmt != "ogg":
        rel = rel.with_suffix(f".{fmt}")

    scope = cue.get("scope", "shared")
    if scope == "base":
        return PUBLIC_DIR / rel
    if scope == "chapter" and cue.get("chapterId"):
        ch_id = int(cue["chapterId"])
        return CHAPTERS_DIR / f"fase_0{ch_id}" / rel
    return CHAPTERS_DIR / "shared" / rel


def convert_mp3_to_ogg(mp3_path: Path, ogg_path: Path) -> None:
    ogg_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(mp3_path),
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "libvorbis",
        "-q:a",
        "3",
        str(ogg_path),
    ]
    subprocess.run(cmd, check=True)


def update_available_base_audio(manifest_paths: list[Path], base_rel_paths: list[str]) -> None:
    unique_sorted = sorted(set(base_rel_paths))
    for path in manifest_paths:
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data["availableBaseAudio"] = unique_sorted
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def synthesize_all(voice: str, fmt: str, concurrency: int) -> None:
    import edge_tts

    src_manifest = DATA_MANIFEST_PATH if DATA_MANIFEST_PATH.exists() else MANIFEST_PATH
    manifest = json.loads(src_manifest.read_text(encoding="utf-8"))
    cues = manifest.get("cues", [])
    print(f"[edge-tts] Sintetizando {len(cues)} falas PT-BR ({voice}) -> .{fmt}")

    sem = asyncio.Semaphore(concurrency)
    generated_base_rel: list[str] = []
    tmp_dir = ROOT / ".tmp_edge_tts"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    async def process_cue(idx: int, cue: dict) -> None:
        async with sem:
            cue_id = cue["id"]
            emotion = cue.get("emotion", "tenso")
            prosody = EMOTION_PROSODY.get(emotion, EMOTION_PROSODY["tenso"])
            dest = destination_for_cue(cue, fmt)
            dest.parent.mkdir(parents=True, exist_ok=True)

            tmp_mp3 = tmp_dir / f"{cue_id}.mp3"
            comm = edge_tts.Communicate(
                text=cue["text"],
                voice=voice,
                rate=prosody["rate"],
                pitch=prosody["pitch"],
            )
            await comm.save(str(tmp_mp3))

            if fmt == "ogg":
                convert_mp3_to_ogg(tmp_mp3, dest)
                tmp_mp3.unlink(missing_ok=True)
            else:
                dest.write_bytes(tmp_mp3.read_bytes())
                tmp_mp3.unlink(missing_ok=True)

            if cue.get("scope") == "base":
                generated_base_rel.append(str(dest.relative_to(PUBLIC_DIR)).replace("\\", "/"))

            size_kb = dest.stat().st_size / 1024.0
            print(f"  [{idx}/{len(cues)}] {cue_id} ({emotion}) -> {dest.relative_to(ROOT)} ({size_kb:.1f} KB)")

    await asyncio.gather(*(process_cue(i, c) for i, c in enumerate(cues, start=1)))

    if tmp_dir.exists():
        try:
            tmp_dir.rmdir()
        except OSError:
            pass

    if generated_base_rel:
        update_available_base_audio(
            [MANIFEST_PATH, PUBLIC_MANIFEST_PATH, DATA_MANIFEST_PATH],
            generated_base_rel,
        )
        print(f"[Manifesto] availableBaseAudio atualizado com {len(generated_base_rel)} faixas base.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Gerar narração PT-BR via edge-tts + ffmpeg (CPU)")
    parser.add_argument("--voice", default="pt-BR-AntonioNeural", help="Voz PT-BR do Edge TTS")
    parser.add_argument("--format", choices=["ogg", "mp3"], default="ogg", help="Formato de saída")
    parser.add_argument("--concurrency", type=int, default=4, help="Tarefas paralelas")
    args = parser.parse_args()

    asyncio.run(synthesize_all(args.voice, args.format, args.concurrency))


if __name__ == "__main__":
    main()

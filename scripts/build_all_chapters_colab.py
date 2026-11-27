"""
Orquestrador batch para rodar todos os 7 capítulos no Google Colab em modo headless
e exportar `assets-chapters/fase_01..07/chapter_props.glb` com compressão Draco.

Uso no Colab / Linux:
    blender -b --factory-startup --python-exit-code 1 -P scripts/build_all_chapters_colab.py
"""

import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.dirname(__file__), "chapters", "blender_chapter_builder.py")
BLENDER_BIN = os.environ.get("BLENDER_BIN", "blender")


def main():
    for chapter in range(1, 8):
        out_dir = os.path.join("assets-chapters", f"fase_0{chapter}")
        cmd = [
            BLENDER_BIN,
            "-b",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "-P",
            SCRIPT,
            "--",
            "--chapter",
            str(chapter),
            "--out",
            out_dir,
        ]
        print(f"=== Gerando Cap. 0{chapter} -> {out_dir} ===")
        subprocess.run(cmd, check=True)
    print("Todos os 7 pacotes de capítulo foram exportados! Agora rode: node scripts/package_chapters.mjs")


if __name__ == "__main__":
    main()

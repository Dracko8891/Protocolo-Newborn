# Pipeline Blender Headless no Google Colab (Sem GPU Local)

Este projeto mantém o **APK Base leve (< 100 MB)** e separa os assets pesados (`.glb` com compressão **Draco** e texturas **KTX2/WebP**) por capítulo.

## 1. Gerar os `.glb` dos 7 capítulos no Google Colab

No Google Colab (com GPU T4 gratuita selecionada em *Ambiente de execução > Alterar tipo*):

```bash
!apt-get update -qq && apt-get install -y -qq blender
!git clone https://github.com/Dracko8891/Protocolo-Newborn.git
%cd Protocolo-Newborn

# Gera todos os 7 capítulos em assets-chapters/fase_01..07/chapter_props.glb (Draco nível 6)
!python3 scripts/build_all_chapters_colab.py
```

Para gerar e renderizar um preview de um capítulo específico (ex: Capítulo 4 — Bio-Tanques):
```bash
!blender -b --factory-startup --python-exit-code 1 \
  -P scripts/chapters/blender_chapter_builder.py -- \
  --chapter 4 --out assets-chapters/fase_04 --preview
```

## 2. Otimizar texturas com KTX2 (opcional, recomendado para celular)

```bash
!npm install -g @gltf-transform/cli
!npx @gltf-transform/cli optimize assets-chapters/fase_01/chapter_props.glb assets-chapters/fase_01/chapter_props.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

## 3. Empacotar fases para o GitHub Releases (`fase_01.zip` .. `fase_07.zip`)

No terminal do projeto (com Node.js):
```bash
node scripts/package_chapters.mjs
```

Isso cria `dist-levels/fase_01.zip` ... `dist-levels/fase_07.zip` e atualiza automaticamente `manifest.json` e `public/manifest.json` com `tamanho_mb` e `sha256_hash` reais. Basta subir os `.zip` na Release `levels-v1.0.0` de `Dracko8891/Protocolo-Newborn`.

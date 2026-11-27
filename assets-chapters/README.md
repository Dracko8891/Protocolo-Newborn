# Assets Pesados por Capítulo (Fora do APK Base)

Coloque aqui os arquivos `.glb` (com compressão Draco e texturas KTX2/WebP) gerados no Google Colab pelo Blender antes de empacotar para o GitHub Releases:

```
assets-chapters/
  fase_01/chapter_props.glb
  fase_02/chapter_props.glb
  fase_03/chapter_props.glb
  fase_04/chapter_props.glb
  fase_05/chapter_props.glb
  fase_06/chapter_props.glb
  fase_07/chapter_props.glb
```

Em seguida execute:
```bash
node scripts/package_chapters.mjs
```
Os arquivos `fase_01.zip` .. `fase_07.zip` serão gerados em `dist-levels/` e o `manifest.json` será atualizado automaticamente com o tamanho real e o hash SHA-256.

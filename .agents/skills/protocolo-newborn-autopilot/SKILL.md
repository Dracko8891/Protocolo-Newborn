---
name: protocolo-newborn-autopilot
description: >-
  Skill autônoma oficial do projeto Protocolo Newborn (Vanguard-7). Documenta a
  arquitetura modular (APK casca leve + fases no GitHub Releases), sistema de
  narração imersiva PT-BR + áudio fisiológico, padrão de controles touch
  mobile/tablet, pipelines em nuvem (Google Colab + GitHub Actions), capacidades
  do ambiente e rotina obrigatória de testes Playwright.
---

# Protocolo Newborn — Project Autopilot Skill

## 1. Capacidades do Ambiente & Diretrizes de Desenvolvimento
- **Stack Principal**: React 19 + TypeScript + Vite 8 + Three.js (`0.187.0`) + Tailwind CSS 4 (`@import "tailwindcss";` em `src/index.css`).
- **Idioma & Identidade**: 100% **Português (BR)** em toda a interface, HUD, legendas e mensagens ao jogador.
- **Empacotamento Android**: Wrapper WebView/Capacitor em `app/src/main/java/com/example/MainActivity.kt` (`com.dracko.protocolo_newborn`) servido em `https://appassets.androidplatform.net/` com ponte nativa `window.AndroidLevelBridge`.
- **Ferramentas do Container**:
  - `node` (`v22+`), `npx`, `git`, `python3`, `tsx` para testes unitários (`node:test`), `vite build`, `tsc --noEmit`.
  - Browser headless Chromium via `playwright-cli` (`/ms-playwright`), sem GPU dedicada (renderização WebGL via SwiftShader em ambiente headless).
  - Para cargas pesadas de GPU (render/bake 3D no Blender ou geração neural de voz PT-BR), utilizar os scripts em nuvem preparados para **Google Colab (GPU T4)**.
- **Diretrizes Obrigatórias**:
  - **Proibido `backdrop-filter` / `backdrop-blur`** sobre o `<canvas>` WebGL (previne perda de FPS e falhas de composição em GPU mobile/Adreno/Mali).
  - **Segurança**: Nunca hardcodar ou versionar tokens do GitHub (`github_pat_*`), chaves de API ou segredos em código, workflows ou testes. Workflows de CI usam exclusivamente `${{ secrets.GITHUB_TOKEN }}`.
  - **Isolamento de Estado Puro**: Toda lógica de física, percepção da IA (`Newborn`), colisão, inventário, manifestos e fila de narração fica desacoplada do DOM/Three.js em `src/game/` e coberta por testes unitários.

---

## 2. Arquitetura Modular (APK Casca Leve + Fases no GitHub Público)
- **APK Casca Leve (`< 100 MB`)**:
  - O bundle `dist/` embutido no APK contém apenas o motor 3D procedural/Three.js, UI (Tela Inicial, Seletor de Fases, Configurações/Dados, PADD, Modais), `manifest.json`, `data/narration_manifest.json` e áudios base (`public/audio/narration/base/`).
  - **Nunca embutir** modelos `.glb` pesados de capítulos ou pacotes de áudio de fases em `public/` ou `app/src/main/assets/`.
- **Repositório & Release Pública**:
  - Repositório: `https://github.com/Dracko8891/Protocolo-Newborn`.
  - Release de pacotes: tag `levels-v1.0.0` com `fase_01.zip` até `fase_07.zip`.
  - Manifesto (`manifest.json` e `public/manifest.json`): lista `id`, `capitulo`, `nome`, `versão`, `tamanho_mb`, `url_download` e `sha256_hash`.
- **Persistência Offline & Gerenciador de Dados (`src/game/levelStorage.ts` & `DataManagerModal.tsx`)**:
  - Download com progresso em streaming, verificação de integridade via `crypto.subtle.digest("SHA-256")` e extração via `fflate.unzipSync`.
  - Salvamento persistente (fora do cache temporário) no `filesDir/levels` do Android via `AndroidLevelBridge` + `IndexedDB` (`vanguard7-persistent-levels`) com `navigator.storage.persist()`.
  - Em **Configurações > Gerenciar Dados**, o jogador vê espaço ocupado, status (`Baixada (Offline)` / `Não baixada`), barra de progresso, botão **Baixar** e botão **Excluir dados**.

---

## 3. Sistema Completo de Narração Imersiva PT-BR & Camada Fisiológica
- **Direção Artística & Roteiro (`public/data/narration_manifest.json` & `narration_manifest.json`)**:
  - Narração em **1ª pessoa** por **Arthur Vance** em situação real de sobrevivência: pausas tensas (`...`), hesitação, cortes de respiração (`—`) e urgência crescente.
  - Cobre todas as 34 falas obrigatórias: `title_prologue`, `intro_flashback_base`, `chapter_01..07_intro`, `chapter_01..07_victory`, interações (`pickup_kit`, `pickup_badge`, `inspect_badge_pin`, `door_locked_no_power`, `relay_short_circuit`, `relay_solved`, `door_unlocked`) e perigo/sobrevivência (`newborn_vent_drop`, `ambient_distress`, `newborn_investigate`, `newborn_hunt`, `locker_enter`, `breath_low`, `battery_low`, `battery_empty`, `player_hurt_red`, `player_healed`, `gameover_defeat`).
- **Controlador Central (`src/game/narrationManager.ts`)**:
  - Fila com preempção por prioridade: `panico` (5) e `ofegante` (4) interrompem imediatamente falas `calmo` (1) ou `tenso` (2); cooldown por `cueId` evita repetição excessiva.
  - Ordem de resolução sem erros 404 no console:
    1. Áudio extraído do pacote da fase em `IndexedDB` (`getChapterAssetBlobUrl`) para cues `chapter`/`shared`.
    2. Faixa declarada em `availableBaseAudio` no manifesto (para cues `base`).
    3. Fallback opcional via `window.speechSynthesis` (`pt-BR`) se habilitado pelo usuário + exibição garantida da legenda sincronizada.
- **Legendas Reativas à Emoção (`src/components/NarrationSubtitle.tsx`)**:
  - Estilos visuais por emoção (`calmo`, `tenso`, `medo`, `ofegante` com revelação entrecortada e `panico` com destaque vermelho + animação `.subtitle-panic-tremor`).
  - Posicionamento adaptativo sem sobreposição: inline/canto inferior na Tela Inicial, abaixo da barra superior (`top-14 sm:top-16`) durante gameplay com HUD touch ativo (portrait e landscape), e barra inferior limpa em modo teclado.
  - Configurável em **Configurações > Áudio & Acessibilidade**: Volume da Narração, Ligar/Desligar Legendas, Tamanho (`pequeno` / `medio` / `grande`) e Voz Sintética Fallback.
- **Respiração, Batimento Cardíaco & Audio Ducking (`src/game/soundEngine.ts`)**:
  - `updatePhysiology()` sintetiza ciclos de inspiração/exalação e batimentos cardíacos proporcionais a perigo (`Investigate`/`Hunt`), corrida, fôlego baixo no armário (`<= 2.5s`) e estado ferido (`vermelho`), com *audio ducking* automático (`setNarrationDucking`) durante falas e desbloqueio de `AudioContext` atrelado a gesto do usuário.

---

## 4. Padrão de Controles Touch Mobile & Tablet
- **Detecção Unificada (`src/game/gameLogic.ts`)**:
  - `resolveTouchControlsActive(controlMode, signals)` respeita `auto`, `touch`, `keyboard`, host `appassets.androidplatform.net`, User-Agent Android/iOS, iPadOS (`Macintosh` com `maxTouchPoints > 1`) e parâmetro `?touch=1`.
- **Arquitetura de Camadas Touch (`src/App.tsx` + `src/components/VanguardCanvas.tsx`)**:
  - Wrapper da HUD touch sempre com `pointer-events-none`; apenas o **Joystick Virtual** (esquerda + botão `Correr`) e os **Botões Táticos** (direita: `Agachar`, `Lanterna`, `Tricorder`, `Dínamo`, giro `↺`/`↻`, `Interagir` e slider `touchSensitivity` de `0.5x` a `1.8x`) usam `pointer-events-auto`.
  - Metade direita livre do `<canvas>` (`clientX >= window.innerWidth * 0.45`) captura `touchstart`/`touchmove` diretamente para câmera 360° suave e sem bloqueios.

---

## 5. Pipelines em Nuvem & CI/CD
- **Blender Headless / Colab**: `scripts/chapters/blender_chapter_builder.py` e `scripts/build_all_chapters_colab.py` (gera GLBs otimizados por capítulo em `assets-chapters/fase_0X/`).
- **Chatterbox Multilingual PT-BR (Colab)**: `scripts/generate_narration_colab.py` lê o manifesto, clona referência PT-BR ofegante (~5s), ajusta `exaggeration` por emoção, exporta `.ogg`/`.mp3` para `public/audio/narration/base/` ou `assets-chapters/...` e atualiza `availableBaseAudio` em todos os manifestos.
- **Empacotamento & Releases**: `npm run package:levels` (`scripts/package_chapters.mjs`) gera `fase_01.zip`..`fase_07.zip` (mesclando `assets-chapters/shared/`) e atualiza os hashes SHA-256 em `manifest.json`. Workflows `.github/workflows/release-levels.yml` e `.github/workflows/android-apk.yml` automatizam releases (`levels-v1.0.0`) e builds de APK no GitHub.

---

## 6. Rotina Obrigatória de Testes & Verificação Playwright
Sempre executar esta sequência após alterações de código antes de finalizar:
1. **Testes Unitários**: `npx --yes tsx --test src/game/gameLogic.test.ts` (100% aprovação obrigatória).
2. **Dry-run Colab (quando alterar roteiro/script)**: `python3 scripts/generate_narration_colab.py --dry-run`.
3. **Build & Typecheck**: `compile_applet` (`vite build`) + `lint_applet` (`tsc --noEmit`).
4. **Reiniciar Servidor**: `restart_dev_server` (`DISABLE_HMR=true`).
5. **Verificação E2E com `playwright-cli` (Chromium Headless)**:
   - Usar binário global `playwright-cli` com `trap 'playwright-cli close' EXIT` (nunca `npx playwright-cli` nem scripts Node importando `playwright`).
   - **Mobile Retrato (`390x844`)**: verificar Tela Inicial, legenda `title_prologue` sem sobrepor botões, abrir Configurações (`Áudio & Acessibilidade` + `Gerenciar Dados`), simular download de `fase_01.zip` via `page.route`, validar persistência (`Baixada (Offline)`) e remoção (`Excluir dados`).
   - **Tablet (`1024x768`)**: validar transição Flashback (`intro_flashback_base`) -> Gameplay (`chapter_01_intro`) + HUD touch sem sobreposição.
   - **Mobile Paisagem (`844x390`, `?autostart=1&touch=1`)**: verificar posição da legenda no topo livre, joystick/botões touch (`Lanterna`), abertura/fechamento do PADD e Pausa/Retomada.
   - **Inspeção Obrigatória**: revisar screenshots capturados em `.playwright-cli/`, confirmar **0 erros e 0 avisos** em `playwright-cli console`, e encerrar removendo `.playwright-cli` (`rm -rf .playwright-cli`).

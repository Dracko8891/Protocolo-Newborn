import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAPTER_CONFIGS,
  ChapterId,
  MEDICAL_WING_WALLS,
  PHYSICS_PARAMS,
  addItemToInventory,
  computeDollyZoomFov,
  computeExponentialHeartbeatPulse,
  computeHeartbeatIntervalMs,
  computePanicMetrics,
  computeResponsiveFov,
  evaluateNewbornPerception,
  findNextNavWaypoint,
  hasWallLineOfSight,
  resolveCircleWallCollision,
  resolveTouchControlsActive,
  shouldEnableTouchControlsByDefault,
  validateKeypadCode,
  validateRelayPuzzle,
} from "./gameLogic";
import { parseLevelsManifest } from "./manifestTypes";
import { NarrationManager } from "./narrationManager";
import { parseNarrationManifest, shouldPreemptCue } from "./narrationManifest";
import { panicLogger } from "./panicLogger";
import { SoundEngine } from "./soundEngine";
import { readViewportOrientationState } from "../hooks/useOrientation";

test("Jogador spawna em caminho aberto na Sala de Segurança sem colidir com o balcão", () => {
  const spawn = resolveCircleWallCollision(
    0,
    -4.3,
    PHYSICS_PARAMS.playerRadius,
    MEDICAL_WING_WALLS
  );
  assert.equal(spawn.x, 0);
  assert.equal(spawn.z, -4.3);
});

test("Inventário empilha consumíveis até 2 e respeita limite de 6 slots", () => {
  let slots = [] as ReturnType<typeof addItemToInventory>["slots"];
  for (let i = 0; i < 6; i++) {
    const res = addItemToInventory(slots, {
      id: `chave_${i}`,
      name: `Chave ${i}`,
      description: "Item chave",
      category: "chave",
      quantity: 1,
    });
    assert.equal(res.added, true);
    slots = res.slots;
  }
  const overflow = addItemToInventory(slots, {
    id: "chave_extra",
    name: "Chave Extra",
    description: "Não cabe",
    category: "chave",
    quantity: 1,
  });
  assert.equal(overflow.added, false);

  const stackable = addItemToInventory(
    [
      {
        id: "kit_estanca",
        name: "Kit de Estanca",
        description: "Estanca sangramento",
        category: "consumivel",
        quantity: 1,
      },
    ],
    {
      id: "kit_estanca",
      name: "Kit de Estanca",
      description: "Estanca sangramento",
      category: "consumivel",
      quantity: 1,
    }
  );
  assert.equal(stackable.added, true);
  assert.equal(stackable.slots.length, 1);
  assert.equal(stackable.slots[0].quantity, 2);
});

test("Puzzle de relés aceita apenas Ciano no Pino 2 e Âmbar no Pino 4 e acusa curto no Vermelho", () => {
  assert.equal(
    validateRelayPuzzle({ pin2Color: "vermelho", pin4Color: "ambar", solved: false })
      .shortCircuit,
    true
  );
  assert.equal(
    validateRelayPuzzle({ pin2Color: "ciano", pin4Color: "ambar", solved: false }).solved,
    true
  );
});

test("Teclado da comporta exige PIN 0719 lido na inspeção 3D do crachá", () => {
  assert.equal(validateKeypadCode("0719"), true);
  assert.equal(validateKeypadCode("1234"), false);
});

test("Percepção do Newborn: cego no breu à distância, caça com lanterna acesa e respeita armário com respiração presa", () => {
  const darkStealth = evaluateNewbornPerception({
    distanceM: 5.0,
    hasLineOfSight: true,
    flashlightOn: false,
    roomLit: false,
    playerNoiseM: PHYSICS_PARAMS.noiseCrouchM,
    playerHidingInLocker: false,
    breathHeld: false,
    playerBleeding: false,
    stunTimerSec: 0,
    currentState: "Patrol",
  });
  assert.equal(darkStealth.nextState, "Patrol");

  const litSight = evaluateNewbornPerception({
    distanceM: 12.0,
    hasLineOfSight: true,
    flashlightOn: true,
    roomLit: false,
    playerNoiseM: PHYSICS_PARAMS.noiseCrouchM,
    playerHidingInLocker: false,
    breathHeld: false,
    playerBleeding: false,
    stunTimerSec: 0,
    currentState: "Patrol",
  });
  assert.equal(litSight.nextState, "Hunt");
  assert.equal(litSight.veinsColor, "crimson");

  const lockerHidden = evaluateNewbornPerception({
    distanceM: 1.5,
    hasLineOfSight: true,
    flashlightOn: false,
    roomLit: false,
    playerNoiseM: 0,
    playerHidingInLocker: true,
    breathHeld: true,
    playerBleeding: false,
    stunTimerSec: 0,
    currentState: "Investigate",
  });
  assert.equal(lockerHidden.nextState, "Investigate");
});

test("Linha de visão real bloqueia paredes opacas e permite visão através de vidro", () => {
  assert.equal(
    hasWallLineOfSight(-7.0, 7.2, 0, 7.2, MEDICAL_WING_WALLS),
    false
  );
  assert.equal(
    hasWallLineOfSight(-2.0, -2.5, -2.0, 0.5, MEDICAL_WING_WALLS),
    true
  );
});

test("NavMesh BFS encontra desvio pela porta da Triagem em vez de atravessar parede sólida", () => {
  const ch1 = CHAPTER_CONFIGS[1];
  const waypoint = findNextNavWaypoint(
    -7.0,
    7.2,
    0,
    7.2,
    ch1.walls,
    ch1.navNodes
  );
  assert.ok(waypoint.x <= -3.7);
});

test("Todos os 7 capítulos possuem spawn, pickups, armários e saídas livres de bloqueio", () => {
  const pins = new Set<string>();
  for (const id of [1, 2, 3, 4, 5, 6, 7] as ChapterId[]) {
    const ch = CHAPTER_CONFIGS[id];
    const checkPoints = [
      ch.spawn,
      ch.kitPos,
      ch.badgePos,
      { x: ch.lockerPos.hideX, z: ch.lockerPos.hideZ },
      { x: ch.relayPos.x, z: ch.relayPos.z - 0.5 },
      { x: ch.exitPos.x, z: ch.exitPos.z - 0.5 },
      ...ch.navNodes,
    ];
    for (const pt of checkPoints) {
      const resolved = resolveCircleWallCollision(
        pt.x,
        pt.z,
        PHYSICS_PARAMS.playerRadius,
        ch.walls
      );
      assert.ok(
        Math.hypot(resolved.x - pt.x, resolved.z - pt.z) < 0.05,
        `Ponto (${pt.x}, ${pt.z}) colidiu no Cap. ${id}`
      );
    }
    assert.equal(validateKeypadCode(ch.expectedPin, ch.expectedPin), true);
    assert.equal(validateKeypadCode("0000", ch.expectedPin), false);
    assert.ok(ch.navNodes.length >= 8);
    assert.ok(!pins.has(ch.expectedPin));
    pins.add(ch.expectedPin);
  }
});

test("Batimento cardíaco começa lento, acelera bruscamente no pico, Dolly Zoom comprime e desfoque radial aumenta", () => {
  assert.ok(computeHeartbeatIntervalMs(2.0) < computeHeartbeatIntervalMs(15.0));
  const slowStart = computeExponentialHeartbeatPulse(24, 600, 0.9);
  const accelMid = computeExponentialHeartbeatPulse(75, 600, 0.9);
  const sharpPeak = computeExponentialHeartbeatPulse(105, 600, 0.9);
  const decayLate = computeExponentialHeartbeatPulse(520, 600, 0.9);
  assert.ok(slowStart < accelMid && accelMid < sharpPeak);
  assert.ok(sharpPeak > decayLate);
  assert.ok(
    computeExponentialHeartbeatPulse(280, 600, 1.0) >
      computeExponentialHeartbeatPulse(280, 600, 0.1)
  );
  assert.equal(computeDollyZoomFov(12, false, "Patrol", "verde"), 64);
  assert.equal(computeDollyZoomFov(8, true, "Hunt", "verde"), 54);
  assert.equal(computeDollyZoomFov(8, true, "Hunt", "vermelho"), 50);
  assert.ok(computeDollyZoomFov(4, true, "Observe", "verde") < 64);

  const calm = computePanicMetrics({
    health: "verde",
    newbornDist: 14,
    newbornVisible: false,
    newbornState: "Patrol",
    batteryPct: 90,
    flashlightOn: false,
    hidingInLocker: false,
    holdingBreath: false,
  });
  const huntedInjured = computePanicMetrics({
    health: "vermelho",
    newbornDist: 3.5,
    newbornVisible: true,
    newbornState: "Hunt",
    batteryPct: 10,
    flashlightOn: true,
    hidingInLocker: false,
    holdingBreath: false,
  });

  assert.ok(huntedInjured.estimatedBpm > calm.estimatedBpm);
  assert.ok(huntedInjured.radialBlurStrength > calm.radialBlurStrength);
  assert.ok(huntedInjured.lensDistortion > calm.lensDistortion);

  assert.equal(computeResponsiveFov(64, 844 / 390), 64);
  const portraitFov = computeResponsiveFov(64, 390 / 844);
  assert.ok(portraitFov > 80 && portraitFov <= 98, `portraitFov=${portraitFov}`);
  const tabletPortraitFov = computeResponsiveFov(64, 768 / 1024);
  assert.ok(tabletPortraitFov > 64 && tabletPortraitFov < portraitFov);

  const entry = panicLogger.log(
    {
      event: "detection_trigger",
      detail: "Teste unitário",
      panicPct: Math.round(huntedInjured.panicLevel * 100),
      heartRateBpm: huntedInjured.estimatedBpm,
      newbornDistM: 3.5,
      newbornState: "Hunt",
      health: "vermelho",
      resources: {
        batteryPct: 10,
        flashlightOn: true,
        tricorderOn: false,
        hidingInLocker: false,
        kitsRemaining: 1,
      },
    },
    true
  );
  assert.ok(entry !== null);
  assert.ok(panicLogger.getRecentEntries().length >= 1);
});

test("Pré-carregamento assíncrono de recursos conclui com status ready em ambiente headless", async () => {
  const { preloadEssentialResources, getResourceCacheSnapshot } = await import(
    "./resourceCache"
  );
  const snap = await preloadEssentialResources();
  assert.equal(snap.status, "ready");
  assert.equal(snap.progressPct, 100);
  assert.equal(getResourceCacheSnapshot().status, "ready");
});


test("Detecção de controles touch ativa automaticamente em Android APK, celulares e tablets/iPadOS", () => {
  assert.equal(
    shouldEnableTouchControlsByDefault({
      savedPreference: null,
      hostname: "appassets.androidplatform.net",
      pointerCoarse: false,
      maxTouchPoints: 0,
    }),
    true
  );
  assert.equal(
    shouldEnableTouchControlsByDefault({
      savedPreference: "0",
      hostname: "appassets.androidplatform.net",
      userAgent: "Mozilla/5.0 (Linux; Android 14; Moto G35)",
    }),
    true
  );
  assert.equal(
    shouldEnableTouchControlsByDefault({
      savedPreference: null,
      userAgent: "Mozilla/5.0 (Linux; Android 14; Moto G35)",
      anyPointerCoarse: false,
      pointerCoarse: false,
    }),
    true
  );
  // iPadOS reportando User-Agent Macintosh com maxTouchPoints > 1
  assert.equal(
    resolveTouchControlsActive("auto", {
      hostname: "localhost",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    }),
    true
  );
  // Sobrescrita manual em Configurações > Controles
  assert.equal(
    resolveTouchControlsActive("keyboard", {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet)",
      maxTouchPoints: 5,
    }),
    false
  );
  assert.equal(
    resolveTouchControlsActive("touch", {
      hostname: "localhost",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: 0,
    }),
    true
  );
  assert.equal(
    shouldEnableTouchControlsByDefault({
      savedPreference: null,
      hostname: "localhost",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      pointerCoarse: false,
      anyPointerCoarse: false,
      maxTouchPoints: 0,
      hasOnTouchStart: false,
    }),
    false
  );
});

test("Parser de manifest.json valida id, nome, versão, tamanho_mb, url_download e sha256_hash", async () => {
  const fs = await import("node:fs");
  const raw = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const parsed = parseLevelsManifest(raw);
  assert.equal(parsed.repositorio, "Dracko8891/Protocolo-Newborn");
  assert.equal(parsed.niveis.length, 7);
  for (const nivel of parsed.niveis) {
    assert.ok(nivel.id.startsWith("fase_0"));
    assert.ok(nivel.nome.length > 0);
    assert.ok(nivel["versão"].length > 0);
    assert.ok(nivel.tamanho_mb > 0);
    assert.ok(nivel.url_download.includes("Dracko8891/Protocolo-Newborn"));
    assert.equal(nivel.sha256_hash.length, 64);
  }
});

test("narration_manifest.json e public/data/narration_manifest.json contêm todas as cenas, 7 capítulos e gatilhos em PT-BR", async () => {
  const fs = await import("node:fs");
  const raw = JSON.parse(fs.readFileSync("narration_manifest.json", "utf8"));
  const rawData = JSON.parse(fs.readFileSync("public/data/narration_manifest.json", "utf8"));
  assert.deepEqual(rawData, raw, "public/data/narration_manifest.json deve estar sincronizado com narration_manifest.json");
  assert.ok(fs.existsSync(".agents/skills/protocolo-newborn-autopilot/SKILL.md"));

  const manifest = parseNarrationManifest(rawData);
  assert.equal(manifest.idioma, "pt-BR");
  assert.equal(manifest.personagem, "Arthur Vance");
  const ids = new Set(manifest.cues.map((c) => c.id));

  const requiredIds = [
    "title_prologue",
    "intro_flashback_base",
    "chapter_01_intro",
    "chapter_01_victory",
    "chapter_02_intro",
    "chapter_02_victory",
    "chapter_03_intro",
    "chapter_03_victory",
    "chapter_04_intro",
    "chapter_04_victory",
    "chapter_05_intro",
    "chapter_05_victory",
    "chapter_06_intro",
    "chapter_06_victory",
    "chapter_07_intro",
    "chapter_07_victory",
    "pickup_kit",
    "pickup_badge",
    "inspect_badge_pin",
    "door_locked_no_power",
    "relay_short_circuit",
    "relay_solved",
    "door_unlocked",
    "newborn_vent_drop",
    "ambient_distress",
    "newborn_investigate",
    "newborn_hunt",
    "locker_enter",
    "breath_low",
    "battery_low",
    "battery_empty",
    "player_hurt_red",
    "player_healed",
    "gameover_defeat",
  ];
  for (const id of requiredIds) {
    assert.ok(ids.has(id), `Falta fala obrigatória no manifesto: ${id}`);
  }
  assert.equal(
    manifest.cues.filter((c) => c.scope === "base").length,
    2,
    "Apenas title_prologue e intro_flashback_base ficam no APK base"
  );
});

test("NarrationManager interrompe fala calma com pânico e usa fallback seguro sem áudio", async () => {
  const fs = await import("node:fs");
  const raw = JSON.parse(fs.readFileSync("narration_manifest.json", "utf8"));
  const sound = new SoundEngine();
  const mgr = new NarrationManager(sound);
  mgr.loadManifestObject(raw);

  assert.equal(
    shouldPreemptCue(
      { cueId: "pickup_kit", priority: 1 },
      { id: "newborn_hunt", priority: 5 }
    ),
    true
  );
  assert.equal(
    shouldPreemptCue(
      { cueId: "newborn_hunt", priority: 5 },
      { id: "pickup_kit", priority: 1 }
    ),
    false
  );

  const triggeredCalm = await mgr.trigger("pickup_kit", { chapterId: 1 });
  assert.equal(triggeredCalm, true);
  assert.equal(mgr.getActiveSubtitle()?.cueId, "pickup_kit");
  assert.equal(mgr.getActiveSubtitle()?.usedAudio, false);

  const triggeredPanic = await mgr.trigger("newborn_hunt", { chapterId: 1 });
  assert.equal(triggeredPanic, true);
  assert.equal(mgr.getActiveSubtitle()?.cueId, "newborn_hunt");
  assert.equal(mgr.getActiveSubtitle()?.emotion, "panico");

  sound.updatePhysiology({
    active: true,
    dangerLevel: 0.9,
    breathRatio: 0.2,
    holdingBreath: false,
    sprinting: true,
    injured: true,
    externalHeartbeatActive: false,
  });
  sound.setNarrationDucking(true);
  sound.setNarrationDucking(false);
  mgr.clear();
  assert.equal(mgr.getActiveSubtitle(), null);
});

test("computeResponsiveFov compensa modo vertical (aspect < 1) e readViewportOrientationState retorna estado válido", () => {
  const landscapeFov = computeResponsiveFov(64, 16 / 9);
  const portraitPhoneFov = computeResponsiveFov(64, 390 / 844);
  const portraitTabletFov = computeResponsiveFov(64, 768 / 1024);

  assert.equal(landscapeFov, 64);
  assert.ok(portraitTabletFov > 64 && portraitTabletFov <= 98);
  assert.ok(portraitPhoneFov > portraitTabletFov && portraitPhoneFov <= 98);

  const fallbackOri = readViewportOrientationState();
  assert.ok(fallbackOri.width > 0 && fallbackOri.height > 0);
  assert.equal(fallbackOri.isLandscape, !fallbackOri.isPortrait);
});


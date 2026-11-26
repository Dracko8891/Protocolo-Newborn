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
  evaluateNewbornPerception,
  findNextNavWaypoint,
  hasWallLineOfSight,
  resolveCircleWallCollision,
  validateKeypadCode,
  validateRelayPuzzle,
} from "./gameLogic";
import { panicLogger } from "./panicLogger";

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

test("Todos os 7 capítulos possuem spawn livre de colisão, PIN único e nós de navegação", () => {
  const pins = new Set<string>();
  for (const id of [1, 2, 3, 4, 5, 6, 7] as ChapterId[]) {
    const ch = CHAPTER_CONFIGS[id];
    const resolved = resolveCircleWallCollision(
      ch.spawn.x,
      ch.spawn.z,
      PHYSICS_PARAMS.playerRadius,
      ch.walls
    );
    assert.equal(resolved.x, ch.spawn.x);
    assert.equal(resolved.z, ch.spawn.z);
    assert.equal(validateKeypadCode(ch.expectedPin, ch.expectedPin), true);
    assert.equal(validateKeypadCode("0000", ch.expectedPin), false);
    assert.ok(ch.navNodes.length >= 8);
    assert.ok(!pins.has(ch.expectedPin));
    pins.add(ch.expectedPin);
  }
});

test("Batimento cardíaco acelera, Dolly Zoom comprime e desfoque radial aumenta quando detectado ou ferido", () => {
  assert.ok(computeHeartbeatIntervalMs(2.0) < computeHeartbeatIntervalMs(15.0));
  const peakEarly = computeExponentialHeartbeatPulse(50, 600, 0.9);
  const decayMid = computeExponentialHeartbeatPulse(300, 600, 0.9);
  const decayLate = computeExponentialHeartbeatPulse(560, 600, 0.9);
  assert.ok(peakEarly > decayMid && decayMid > decayLate);
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




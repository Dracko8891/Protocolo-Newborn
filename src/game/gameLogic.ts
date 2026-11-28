export type GamePhase = "title" | "intro" | "playing" | "paused" | "victory" | "gameover";

export type HealthState = "verde" | "vermelho";

export type NewbornAIState = "Observe" | "Patrol" | "Investigate" | "Hunt" | "Stunned";

export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type DifficultyMode = "historia" | "sobrevivencia" | "extremo";

export type GraphicsPreset = "auto" | "desempenho" | "equilibrado" | "qualidade";

export type IncidentRank = "S" | "A" | "B" | "C";

export type DirectorWavePhase = "patrol" | "pressure" | "vent_retreat";

export interface DifficultyConfig {
  id: DifficultyMode;
  label: string;
  desc: string;
  newbornSpeedMult: number;
  sightRangeMult: number;
  batteryDrainMult: number;
  ventRetreatSec: number;
  pressureSec: number;
  extraHitBuffer: boolean;
}

export const DIFFICULTY_PARAMS: Record<DifficultyMode, DifficultyConfig> = {
  historia: {
    id: "historia",
    label: "História",
    desc: "Bateria dura mais, Newborn menos letal e pausas maiores entre rondas.",
    newbornSpeedMult: 0.82,
    sightRangeMult: 0.8,
    batteryDrainMult: 0.65,
    ventRetreatSec: 12,
    pressureSec: 22,
    extraHitBuffer: true,
  },
  sobrevivencia: {
    id: "sobrevivencia",
    label: "Sobrevivência",
    desc: "Experiência original balanceada de tensão, furtividade e recursos.",
    newbornSpeedMult: 1.0,
    sightRangeMult: 1.0,
    batteryDrainMult: 1.0,
    ventRetreatSec: 8,
    pressureSec: 28,
    extraHitBuffer: false,
  },
  extremo: {
    id: "extremo",
    label: "Protocolo Extremo",
    desc: "Perseguição implacável, percepção aguçada e drenagem intensa da lanterna.",
    newbornSpeedMult: 1.16,
    sightRangeMult: 1.2,
    batteryDrainMult: 1.28,
    ventRetreatSec: 5,
    pressureSec: 36,
    extraHitBuffer: false,
  },
};

export interface EffectiveGraphicsConfig {
  preset: GraphicsPreset;
  maxDpr: number;
  shadowsEnabled: boolean;
  usePostProcessing: boolean;
  particleDensity: number;
  textureSize: 256 | 512;
  envIntensity: number;
}

export function resolveEffectiveGraphics(
  preset: GraphicsPreset,
  isMobileOrTablet: boolean,
  isSoftwareGl: boolean,
  autoDowngraded = false
): EffectiveGraphicsConfig {
  if (isSoftwareGl) {
    return {
      preset,
      maxDpr: 1.0,
      shadowsEnabled: false,
      usePostProcessing: false,
      particleDensity: 0.5,
      textureSize: 256,
      envIntensity: 0.24,
    };
  }
  if (preset === "desempenho" || (preset === "auto" && autoDowngraded)) {
    return {
      preset,
      maxDpr: isMobileOrTablet ? 0.85 : 1.0,
      shadowsEnabled: false,
      usePostProcessing: false,
      particleDensity: 0.45,
      textureSize: 256,
      envIntensity: 0.24,
    };
  }
  if (preset === "auto") {
    return {
      preset,
      maxDpr: isMobileOrTablet ? 1.0 : 1.5,
      shadowsEnabled: !isMobileOrTablet,
      usePostProcessing: false,
      particleDensity: isMobileOrTablet ? 0.65 : 0.9,
      textureSize: isMobileOrTablet ? 256 : 512,
      envIntensity: 0.26,
    };
  }
  if (preset === "equilibrado") {
    return {
      preset,
      maxDpr: isMobileOrTablet ? 1.0 : 1.5,
      shadowsEnabled: !isMobileOrTablet,
      usePostProcessing: false,
      particleDensity: 0.8,
      textureSize: 512,
      envIntensity: 0.28,
    };
  }
  // qualidade
  return {
    preset,
    maxDpr: isMobileOrTablet ? 1.25 : 2.0,
    shadowsEnabled: true,
    usePostProcessing: !isMobileOrTablet,
    particleDensity: 1.0,
    textureSize: 512,
    envIntensity: 0.3,
  };
}

export interface IncidentReportInput {
  elapsedSec: number;
  alertsCount: number;
  damageHits: number;
  logsFound: number;
  difficulty: DifficultyMode;
}

export interface IncidentReportData extends IncidentReportInput {
  chapterId: ChapterId;
  rank: IncidentRank;
}

export interface ChapterRecord {
  completed: boolean;
  bestTimeSec: number;
  bestRank: IncidentRank;
  difficulty: DifficultyMode;
}

export function computeIncidentReportRank(input: IncidentReportInput): IncidentRank {
  let score = 100;
  score -= Math.max(0, input.elapsedSec - 135) * 0.14;
  score -= input.alertsCount * 8;
  score -= input.damageHits * 20;
  score += input.logsFound * 7;
  if (input.difficulty === "extremo") score += 8;
  else if (input.difficulty === "historia") score -= 6;

  if (score >= 90 && input.damageHits === 0) return "S";
  if (score >= 74) return "A";
  if (score >= 54) return "B";
  return "C";
}

export type ChapterTheme =
  | "medical"
  | "atrium"
  | "quarters"
  | "biolab"
  | "engineering"
  | "omega"
  | "hangar";

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  category: "consumivel" | "chave" | "tatico";
  quantity: number;
  inspectable?: boolean;
  inspected?: boolean;
  codeReveal?: string;
}

export interface AABBWall {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height?: number;
  kind?: "wall" | "glass" | "desk" | "door" | "tank" | "bunk" | "core";
}

export interface RelayState {
  pin2Color: "none" | "ciano" | "ambar" | "vermelho";
  pin4Color: "none" | "ciano" | "ambar" | "vermelho";
  solved: boolean;
}

export interface NavNode {
  x: number;
  z: number;
}

export interface CorpseProp {
  x: number;
  z: number;
  rotY: number;
}

export interface ContainmentDoorSpec {
  id: string;
  label: string;
  wall: AABBWall;
  panelX: number;
  panelZ: number;
  durationSec: number;
}

export interface SoundTrapSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: "glass" | "puddle";
}

export interface SurvivorLogSpec {
  id: string;
  cueId: string;
  title: string;
  author: string;
  text: string;
  x: number;
  z: number;
}

export interface ChapterConfig {
  id: ChapterId;
  shortLabel: string;
  title: string;
  subtitle: string;
  introQuote: string;
  introDesc: string;
  victoryTitle: string;
  victoryDesc: string;
  spawn: { x: number; z: number; yaw: number };
  walls: AABBWall[];
  navNodes: NavNode[];
  patrolPoints: NavNode[];
  kitPos: { x: number; z: number };
  badgePos: { x: number; z: number };
  badgeName: string;
  badgeOwner: string;
  expectedPin: string;
  lockerPos: { x: number; z: number; hideX: number; hideZ: number; rotY: number };
  relayPos: { x: number; z: number };
  exitPos: { x: number; z: number };
  wallMapPos: { x: number; z: number; rotY: number };
  decoyPos: { x: number; z: number };
  containmentDoor: ContainmentDoorSpec;
  soundTraps: SoundTrapSpec[];
  survivorLogs: [SurvivorLogSpec, SurvivorLogSpec];
  corpses: CorpseProp[];
  puddles: Array<{ x: number; z: number; r: number; isBlood?: boolean }>;
  logTitle: string;
  logText: string;
  palette: ChapterTheme;
  newbornActiveFromStart: boolean;
  crtPosition: { x: number; y: number; z: number; rotY: number };
}

export const PHYSICS_PARAMS = {
  walkSpeed: 3.1,
  crouchSpeed: 1.65,
  sprintSpeed: 5.5,
  injuredSpeed: 2.25,
  adrenalineSpeed: 6.2,
  eyeStanding: 1.62,
  eyeCrouching: 0.94,
  ceilingHeight: 2.85,
  defaultFov: 64,
  dollyZoomFov: 54,
  playerRadius: 0.36,
  maxBatterySec: 240,
  dynamoPumpDuration: 3.0,
  dynamoRechargeSec: 60,
  maxBreathSec: 10,
  interactRangeM: 2.35,
  noiseCrouchM: 2.4,
  noiseWalkM: 6.8,
  noiseSprintM: 15.5,
  noiseTricorderM: 8.8,
  noiseDynamoM: 10.5,
  sightFlashlightOnM: 20.0,
  sightFlashlightOffLitM: 11.0,
  sightFlashlightOffDarkM: 2.1,
  newbornPatrolSpeed: 2.2,
  newbornInvestigateSpeed: 3.5,
  newbornHuntSpeed: 4.8,
} as const;

export function computeHeartbeatIntervalMs(newbornDist: number): number {
  const clamped = Math.max(1.2, Math.min(18, newbornDist));
  return Math.round(380 + ((clamped - 1.2) / 16.8) * 580);
}

/**
 * Curva de suavização (easing) exponencial para o pulso da vinheta de dano durante o heartbeat.
 * Inicia devagar, acelera bruscamente via Math.exp() até o pico sistólico ("lub") e decai
 * exponencialmente com um eco diastólico ("dub"), intensificando a urgência perto do Newborn.
 */
export function computeExponentialHeartbeatPulse(
  elapsedSinceBeatMs: number,
  intervalMs: number,
  urgency = 0.5
): number {
  if (elapsedSinceBeatMs < 0 || intervalMs <= 0) return 0;
  const clampedUrgency = Math.max(0, Math.min(1, urgency));
  const tNorm = Math.min(1, elapsedSinceBeatMs / intervalMs);

  // Pico principal (lub): subida lenta que acelera bruscamente até peakAt
  const peakAt = 0.22 - clampedUrgency * 0.05;
  const riseSharpness = 4.4 + clampedUrgency * 2.4;
  const releaseDecay = 6.6 - clampedUrgency * 2.2;

  let primary = 0;
  if (tNorm <= peakAt) {
    const u = Math.max(0, tNorm / peakAt);
    primary = (Math.exp(riseSharpness * u) - 1) / (Math.exp(riseSharpness) - 1);
  } else {
    primary = Math.exp(-releaseDecay * (tNorm - peakAt));
  }

  // Segundo pulso cardíaco (dub) com subida exponencial e decaimento rápido
  const dubStart = peakAt + 0.12;
  const dubPeak = dubStart + 0.09;
  let dub = 0;
  if (tNorm >= dubStart) {
    if (tNorm <= dubPeak) {
      const u2 = (tNorm - dubStart) / (dubPeak - dubStart);
      dub = 0.58 * ((Math.exp(3.8 * u2) - 1) / (Math.exp(3.8) - 1));
    } else {
      dub = 0.58 * Math.exp(-(releaseDecay + 1.5) * (tNorm - dubPeak));
    }
  }

  const amplitude = 0.65 + clampedUrgency * 0.35;
  return Math.max(0, Math.min(1, Math.max(primary, dub) * amplitude));
}

export function computeDollyZoomFov(
  newbornDist: number,
  newbornVisible: boolean,
  state: NewbornAIState,
  health: HealthState = "verde"
): number {
  if (!newbornVisible) {
    return health === "vermelho" ? PHYSICS_PARAMS.defaultFov - 2 : PHYSICS_PARAMS.defaultFov;
  }
  const injuryBonus = health === "vermelho" ? 4 : 0;
  if (state === "Hunt") return PHYSICS_PARAMS.dollyZoomFov - injuryBonus;
  if (state === "Observe" || state === "Investigate") {
    const t = Math.max(0, Math.min(1, (12 - newbornDist) / 9));
    return (
      PHYSICS_PARAMS.defaultFov -
      t * (PHYSICS_PARAMS.defaultFov - (55 - injuryBonus * 0.75))
    );
  }
  return PHYSICS_PARAMS.defaultFov - (health === "vermelho" ? 2 : 0);
}

/**
 * Compensa o campo de visão vertical quando a tela está em modo Vertical (aspect < 1),
 * mantendo corredores laterais, portas, itens e o Newborn visíveis sem efeito "visão de túnel".
 */
export function computeResponsiveFov(baseFov: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect >= 1) {
    return baseFov;
  }
  const safeAspect = Math.max(0.42, aspect);
  // Alvo horizontal equivalente ao modo 4:3/16:10 mantendo percepção periférica em retrato
  const baseHalfRad = ((baseFov * Math.PI) / 180) * 0.5;
  const targetHorizTan = Math.tan(baseHalfRad) * 1.18;
  const compensatedVerticalDeg =
    (2 * Math.atan(targetHorizTan / safeAspect) * 180) / Math.PI;
  return Math.max(baseFov, Math.min(98, compensatedVerticalDeg));
}

export interface PanicMetricsInput {
  health: HealthState;
  newbornDist: number;
  newbornVisible: boolean;
  newbornState: NewbornAIState;
  batteryPct: number;
  flashlightOn: boolean;
  hidingInLocker: boolean;
  holdingBreath: boolean;
}

export interface PanicMetricsResult {
  panicLevel: number;
  estimatedBpm: number;
  radialBlurStrength: number;
  lensDistortion: number;
}

export function computePanicMetrics(
  input: PanicMetricsInput
): PanicMetricsResult {
  const proxFactor = input.newbornVisible
    ? Math.max(0, Math.min(1, (14 - input.newbornDist) / 11.5))
    : Math.max(0, Math.min(0.35, (10 - input.newbornDist) / 14));

  const stateBoost =
    input.newbornState === "Hunt"
      ? 0.42
      : input.newbornState === "Investigate"
        ? 0.24
        : input.newbornState === "Observe" && input.newbornVisible
          ? 0.14
          : 0;

  const injuryBoost = input.health === "vermelho" ? 0.36 : 0;
  const lowBatteryBoost =
    input.flashlightOn && input.batteryPct <= 15 ? 0.12 : 0;
  const lockerRelief = input.hidingInLocker && input.holdingBreath ? -0.1 : 0;

  const panicLevel = Math.max(
    0.05,
    Math.min(
      1.0,
      proxFactor * 0.55 + stateBoost + injuryBoost + lowBatteryBoost + lockerRelief
    )
  );

  const estimatedBpm = Math.round(68 + panicLevel * 116);

  const detected =
    input.newbornVisible &&
    (input.newbornState === "Hunt" || input.newbornState === "Investigate");

  const radialBlurStrength = Math.max(
    0,
    Math.min(
      1.0,
      (detected ? 0.45 + proxFactor * 0.35 : proxFactor * 0.18) +
        (input.health === "vermelho" ? 0.28 : 0)
    )
  );

  const lensDistortion = Math.max(
    0,
    Math.min(
      1.0,
      (detected ? 0.35 + proxFactor * 0.3 : proxFactor * 0.12) +
        (input.health === "vermelho" ? 0.35 : 0)
    )
  );

  return {
    panicLevel,
    estimatedBpm,
    radialBlurStrength,
    lensDistortion,
  };
}

// Perímetro claustrofóbico padrão: largura interna ~18.4m (-9.2..9.2), corredores centrais de 2.8m a 3.2m
function outerPerimeter(): AABBWall[] {
  return [
    { id: "outer-south", minX: -9.8, maxX: 9.8, minZ: -6.0, maxZ: -5.4, kind: "wall" },
    { id: "outer-north", minX: -9.8, maxX: 9.8, minZ: 13.6, maxZ: 14.2, kind: "wall" },
    { id: "outer-west", minX: -9.8, maxX: -9.2, minZ: -6.0, maxZ: 14.2, kind: "wall" },
    { id: "outer-east", minX: 9.2, maxX: 9.8, minZ: -6.0, maxZ: 14.2, kind: "wall" },
  ];
}

// Cap. 1 · Ala Médica (corredor central X: -1.5..1.5 = 3.0m)
export const MEDICAL_WING_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  // Sala de Segurança (Sul: X -2.5..2.5, Z -5.4..-1.0) — porta central 2.0m (-1.0..1.0)
  { id: "sec-west", minX: -2.8, maxX: -2.4, minZ: -5.4, maxZ: -1.0, kind: "wall" },
  { id: "sec-east", minX: 2.4, maxX: 2.8, minZ: -5.4, maxZ: -1.0, kind: "wall" },
  { id: "sec-fl", minX: -2.8, maxX: -1.0, minZ: -1.2, maxZ: -0.9, kind: "glass" },
  { id: "sec-fr", minX: 1.0, maxX: 2.8, minZ: -1.2, maxZ: -0.9, kind: "glass" },
  { id: "sec-counter", minX: -1.1, maxX: 1.1, minZ: -3.2, maxZ: -2.55, height: 0.52, kind: "desk" },

  // Sala de Triagem (Oeste: X -9.2..-1.5) — entrada leste em X=-1.5 Z=3.2..5.5 + saída norte em X=-7.8..-5.8 (loop!)
  { id: "tri-south", minX: -9.2, maxX: -1.5, minZ: 1.2, maxZ: 1.6, kind: "wall" },
  { id: "tri-north-w", minX: -9.2, maxX: -7.8, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "tri-north-e", minX: -5.8, maxX: -1.5, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "tri-es", minX: -1.8, maxX: -1.45, minZ: 1.2, maxZ: 3.1, kind: "wall" },
  { id: "tri-en", minX: -1.8, maxX: -1.45, minZ: 5.6, maxZ: 9.4, kind: "wall" },
  { id: "tri-bed", minX: -7.8, maxX: -5.6, minZ: 5.8, maxZ: 7.4, height: 0.72, kind: "desk" },

  // Sala de Raio-X (Leste: X 1.5..9.2) — entrada oeste em X=1.5 Z=3.2..5.5 + saída norte em X=5.8..7.8 (loop!)
  { id: "xray-south", minX: 1.5, maxX: 9.2, minZ: 1.2, maxZ: 1.6, kind: "wall" },
  { id: "xray-north-w", minX: 1.5, maxX: 5.8, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "xray-north-e", minX: 7.8, maxX: 9.2, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "xray-ws", minX: 1.45, maxX: 1.8, minZ: 1.2, maxZ: 3.1, kind: "wall" },
  { id: "xray-wn", minX: 1.45, maxX: 1.8, minZ: 5.6, maxZ: 9.4, kind: "wall" },
  { id: "xray-table", minX: 5.0, maxX: 7.2, minZ: 2.5, maxZ: 3.9, height: 0.72, kind: "desk" },
];

// Cap. 2 · Átrio Azul Frio (corredores estreitos entre galerias e guarita central)
export const COLD_ATRIUM_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "atr-desk", minX: -1.2, maxX: 1.2, minZ: -3.2, maxZ: -2.55, height: 0.65, kind: "desk" },
  // Dois corredores laterais de 3.0m formados por blocos centrais de vidro/concreto
  { id: "atr-mid-s", minX: -2.6, maxX: 2.6, minZ: 1.6, maxZ: 3.6, kind: "wall" },
  { id: "atr-mid-n", minX: -2.6, maxX: 2.6, minZ: 7.2, maxZ: 9.2, kind: "wall" },
  // Baias laterais estreitas (3.0m do bloco central até a parede interna da baia)
  { id: "atr-west-bay", minX: -9.2, maxX: -5.6, minZ: 4.0, maxZ: 6.8, kind: "glass" },
  { id: "atr-east-bay", minX: 5.6, maxX: 9.2, minZ: 4.0, maxZ: 6.8, kind: "glass" },
];

// Cap. 3 · Alojamentos Âmbar Piscando (corredor central de 2.9m entre dormitórios)
export const QUARTERS_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "q-entry-desk", minX: -1.1, maxX: 1.1, minZ: -3.1, maxZ: -2.55, height: 0.65, kind: "desk" },
  // Corredor central de 2.9m (-1.45..1.45) com entradas para os alojamentos oeste e leste
  { id: "q-w-wall-s", minX: -1.75, maxX: -1.45, minZ: 0.8, maxZ: 3.0, kind: "wall" },
  { id: "q-w-wall-m", minX: -1.75, maxX: -1.45, minZ: 5.3, maxZ: 7.5, kind: "wall" },
  { id: "q-w-wall-n", minX: -1.75, maxX: -1.45, minZ: 9.8, maxZ: 11.2, kind: "wall" },
  { id: "q-e-wall-s", minX: 1.45, maxX: 1.75, minZ: 0.8, maxZ: 3.0, kind: "wall" },
  { id: "q-e-wall-m", minX: 1.45, maxX: 1.75, minZ: 5.3, maxZ: 7.5, kind: "wall" },
  { id: "q-e-wall-n", minX: 1.45, maxX: 1.75, minZ: 9.8, maxZ: 11.2, kind: "wall" },
  // Beliches / armários dentro dos dormitórios
  { id: "q-bunk-w1", minX: -8.6, maxX: -6.4, minZ: 2.2, maxZ: 3.4, height: 1.65, kind: "bunk" },
  { id: "q-bunk-w2", minX: -8.6, maxX: -6.4, minZ: 7.8, maxZ: 9.0, height: 1.65, kind: "bunk" },
  { id: "q-bunk-e1", minX: 6.4, maxX: 8.6, minZ: 2.2, maxZ: 3.4, height: 1.65, kind: "bunk" },
  { id: "q-bunk-e2", minX: 6.4, maxX: 8.6, minZ: 7.8, maxZ: 9.0, height: 1.65, kind: "bunk" },
];

// Cap. 4 · Bio-Tanques Verde Tóxico (Câmara 00 com 4 bio-tanques criando corredores de ~3.0m)
export const BIOLAB_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "bio-decon-w", minX: -2.8, maxX: -2.4, minZ: -5.4, maxZ: -1.0, kind: "wall" },
  { id: "bio-decon-e", minX: 2.4, maxX: 2.8, minZ: -5.4, maxZ: -1.0, kind: "wall" },
  { id: "bio-fl", minX: -2.8, maxX: -1.0, minZ: -1.2, maxZ: -0.9, kind: "glass" },
  { id: "bio-fr", minX: 1.0, maxX: 2.8, minZ: -1.2, maxZ: -0.9, kind: "glass" },
  { id: "bio-desk", minX: -1.0, maxX: 1.0, minZ: -3.1, maxZ: -2.55, height: 0.65, kind: "desk" },

  // 4 Bio-tanques centrais (corredor central = -1.5..1.5 = 3.0m)
  { id: "bio-tank-sw", minX: -3.2, maxX: -1.5, minZ: 2.6, maxZ: 4.3, height: 2.75, kind: "tank" },
  { id: "bio-tank-se", minX: 1.5, maxX: 3.2, minZ: 2.6, maxZ: 4.3, height: 2.75, kind: "tank" },
  { id: "bio-tank-nw", minX: -3.2, maxX: -1.5, minZ: 6.8, maxZ: 8.5, height: 2.75, kind: "tank" },
  { id: "bio-tank-ne", minX: 1.5, maxX: 3.2, minZ: 6.8, maxZ: 8.5, height: 2.75, kind: "tank" },

  // Paredes laterais de contenção (corredores externos 3.0m de largura)
  { id: "bio-w-s", minX: -9.2, maxX: -6.0, minZ: 1.6, maxZ: 2.0, kind: "wall" },
  { id: "bio-w-n", minX: -9.2, maxX: -6.0, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "bio-e-s", minX: 6.0, maxX: 9.2, minZ: 1.6, maxZ: 2.0, kind: "wall" },
  { id: "bio-e-n", minX: 6.0, maxX: 9.2, minZ: 9.0, maxZ: 9.4, kind: "wall" },
];

// Cap. 5 · Engenharia Breu + Núcleo Azul (reator central rodeado por anel de 3.0m)
export const ENGINEERING_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "eng-desk", minX: -1.1, maxX: 1.1, minZ: -3.2, maxZ: -2.55, height: 0.65, kind: "desk" },
  // Núcleo central de fusão azul (X: -2.2..2.2, Z: 3.5..7.5)
  { id: "eng-core-center", minX: -2.2, maxX: 2.2, minZ: 3.5, maxZ: 7.5, height: 2.85, kind: "core" },
  // Dutos/turbinas nas bordas criando corredores de ~3.1m ao redor do núcleo
  { id: "eng-turb-w", minX: -9.2, maxX: -5.4, minZ: 1.4, maxZ: 9.4, kind: "wall" },
  { id: "eng-turb-e", minX: 5.4, maxX: 9.2, minZ: 1.4, maxZ: 9.4, kind: "wall" },
];

// Cap. 6 · Ômega Titânio Negro (chicanas blindadas com rotas circulares laterais de fuga)
export const OMEGA_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "omg-desk", minX: -1.1, maxX: 1.1, minZ: -3.2, maxZ: -2.55, height: 0.65, kind: "desk" },
  // Divisórias blindadas em chicana com passagens laterais para nunca travar o jogador em beco sem saída
  { id: "omg-baffle-1", minX: -7.2, maxX: 2.2, minZ: 1.2, maxZ: 1.7, kind: "wall" },
  { id: "omg-baffle-2", minX: -2.2, maxX: 7.2, minZ: 4.8, maxZ: 5.3, kind: "wall" },
  { id: "omg-baffle-3", minX: -7.2, maxX: 2.2, minZ: 8.4, maxZ: 8.9, kind: "wall" },
];

// Cap. 7 · Hangar Fumaça + Exterior Nevado (contêineres criando corredores 3.0m até o portão de carga aberto)
export const HANGAR_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "hng-desk", minX: -1.1, maxX: 1.1, minZ: -3.2, maxZ: -2.55, height: 0.65, kind: "desk" },
  { id: "hng-crate-sw", minX: -5.8, maxX: -1.6, minZ: 1.4, maxZ: 3.8, kind: "wall" },
  { id: "hng-crate-se", minX: 1.6, maxX: 5.8, minZ: 1.4, maxZ: 3.8, kind: "wall" },
  { id: "hng-crate-nw", minX: -5.8, maxX: -1.6, minZ: 7.0, maxZ: 9.4, kind: "wall" },
  { id: "hng-crate-ne", minX: 1.6, maxX: 5.8, minZ: 7.0, maxZ: 9.4, kind: "wall" },
];

const SHARED_CORRIDOR_NAVS: NavNode[] = [
  { x: 0, z: -4.2 },
  { x: 0, z: -1.2 },
  { x: 0, z: 0.8 },
  { x: 0, z: 4.4 },
  { x: 0, z: 8.2 },
  { x: 0, z: 11.4 },
  { x: 2.8, z: 12.0 },
];

export const CHAPTER_CONFIGS: Record<ChapterId, ChapterConfig> = {
  1: {
    id: 1,
    shortLabel: "Médica",
    title: "Cap. 1 · Ala Médica (Quarentena)",
    subtitle: "Setor 01 · Corredor Médico Vermelho",
    introQuote: "“Eles não deviam ter deixado aquela coisa despertar...”",
    introDesc:
      "Alarmes vermelhos banham a Ala Médica. Arthur Vance rasteja atrás da recepção enquanto algo arranha o metal além do vidro rachado.",
    victoryTitle: "ALA MÉDICA SUPERADA",
    victoryDesc:
      "A comporta norte cede. Arthur avança para o Átrio Frio sem saber que a energia restaurada acaba de abrir os dutos para o setor seguinte.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: MEDICAL_WING_WALLS,
    navNodes: [
      ...SHARED_CORRIDOR_NAVS,
      { x: -1.6, z: 4.4 },
      { x: -4.8, z: 4.4 },
      { x: -7.5, z: 3.2 },
      { x: -6.8, z: 9.2 },
      { x: 1.6, z: 4.4 },
      { x: 4.8, z: 4.4 },
      { x: 6.8, z: 9.2 },
      { x: 7.2, z: 6.5 },
    ],
    patrolPoints: [
      { x: 0, z: 8.2 },
      { x: -4.8, z: 4.4 },
      { x: -6.8, z: 9.2 },
      { x: 0, z: 0.8 },
      { x: 4.8, z: 4.4 },
      { x: 2.8, z: 12.0 },
    ],
    kitPos: { x: -6.2, z: 7.8 },
    badgePos: { x: -7.5, z: 3.2 },
    badgeName: "Crachá do Supervisor",
    badgeOwner: "Dr. Henrique Mercer · Dir. Médico",
    expectedPin: "0719",
    lockerPos: { x: 8.1, z: 7.2, hideX: 7.6, hideZ: 7.2, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: -1.4, z: 2.2, rotY: Math.PI / 2 },
    decoyPos: { x: 5.4, z: 6.2 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Central",
      wall: { id: "cdoor-1", minX: -1.42, maxX: 1.42, minZ: 1.25, maxZ: 1.55, kind: "door" },
      panelX: -1.0,
      panelZ: 0.7,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-1a", x: 0, z: 6.5, radius: 0.95, kind: "glass" },
      { id: "trap-1b", x: -4.6, z: 4.4, radius: 0.9, kind: "puddle" },
    ],
    survivorLogs: [
      {
        id: "log_1_1",
        cueId: "chapter_01_log_1",
        title: "Áudio da Enfermeira Clara · Triagem",
        author: "Enf. Clara Nogueira",
        text: "“Se alguém ainda estiver vivo... os cacos no corredor norte denunciam quem corre. Caminhe agachado sobre o vidro.”",
        x: -3.2,
        z: 2.6,
      },
      {
        id: "log_1_2",
        cueId: "chapter_01_log_2",
        title: "Nota do Paramédico Braga · Raio-X",
        author: "Téc. Braga",
        text: "“Deixei uma isca sonora perto da sala de Raio-X. Se a trava central falhar, jogue o alarme pro outro lado e corra.”",
        x: 3.4,
        z: 7.4,
      },
    ],
    corpses: [
      { x: -3.2, z: 7.8, rotY: 0.5 },
      { x: 0.9, z: 10.6, rotY: -1.1 },
    ],
    puddles: [
      { x: -0.3, z: 2.8, r: 0.95, isBlood: true },
      { x: -4.6, z: 4.5, r: 0.8, isBlood: true },
      { x: 2.2, z: 11.4, r: 1.1, isBlood: false },
    ],
    logTitle: "LOG MÉDICO #01 · Dr. Henrique Mercer",
    logText:
      "“O espécime rompeu a contenção e massacrou a triagem. Cortei os relés do corredor norte. O PIN está riscado atrás do meu crachá.”",
    palette: "medical",
    newbornActiveFromStart: false,
    crtPosition: { x: -1.8, y: 2.25, z: 1.1, rotY: Math.PI * 0.82 },
  },
  2: {
    id: 2,
    shortLabel: "Átrio Frio",
    title: "Cap. 2 · Átrio Azul Frio",
    subtitle: "Setor 02 · Galeria Criogênica Subzero",
    introQuote: "“O frio não conteve o metabolismo dele...”",
    introDesc:
      "Vapor gélido e luz azul estilhaçada cobrem o Átrio Frio. Contorne os blocos centrais sem acender a lanterna à toa.",
    victoryTitle: "ÁTRIO FRIO ATRAVESSADO",
    victoryDesc:
      "Você destrava o acesso aos Alojamentos. Pelo rádio estático, passos pesados já descem a escadaria principal atrás de você.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: COLD_ATRIUM_WALLS,
    navNodes: [
      { x: 0, z: -4.2 },
      { x: 0, z: 0.2 },
      { x: -4.2, z: 0.2 },
      { x: -4.2, z: 5.4 },
      { x: -4.2, z: 11.2 },
      { x: 4.2, z: 0.2 },
      { x: 4.2, z: 5.4 },
      { x: 4.2, z: 11.2 },
      { x: 0, z: 5.4 },
      { x: 0, z: 11.2 },
      { x: 2.8, z: 12.0 },
    ],
    patrolPoints: [
      { x: -4.2, z: 5.4 },
      { x: 0, z: 5.4 },
      { x: 4.2, z: 5.4 },
      { x: 4.2, z: 11.2 },
      { x: -4.2, z: 11.2 },
    ],
    kitPos: { x: 7.4, z: 1.8 },
    badgePos: { x: -7.4, z: 8.6 },
    badgeName: "Cartão Térmico Nv. 2",
    badgeOwner: "Sup. Lucas Kael · Manutenção",
    expectedPin: "4820",
    lockerPos: { x: 8.2, z: 9.2, hideX: 7.7, hideZ: 9.2, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: -1.4, z: 1.56, rotY: Math.PI },
    decoyPos: { x: 4.0, z: 2.4 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Oeste",
      wall: { id: "cdoor-2", minX: -5.6, maxX: -2.6, minZ: 4.9, maxZ: 5.2, kind: "door" },
      panelX: -3.1,
      panelZ: 4.3,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-2a", x: 0, z: 5.4, radius: 1.0, kind: "puddle" },
      { id: "trap-2b", x: 4.2, z: 5.4, radius: 0.9, kind: "glass" },
    ],
    survivorLogs: [
      {
        id: "log_2_1",
        cueId: "chapter_02_log_1",
        title: "Gravação Criogênica · Turno B",
        author: "Operador Kael",
        text: "“Baixamos o nitrogênio do átrio para menos vinte, mas ele continuou caçando pelo som da água congelada.”",
        x: -4.2,
        z: 1.8,
      },
      {
        id: "log_2_2",
        cueId: "chapter_02_log_2",
        title: "Rádio Congelado · Passarela Leste",
        author: "Segurança Júlia",
        text: "“Se precisar ganhar tempo no átrio, puxe a comporta oeste no painel amarelo e dê a volta pelos fundos.”",
        x: 6.6,
        z: 10.6,
      },
    ],
    corpses: [
      { x: -4.1, z: 2.4, rotY: 2.1 },
      { x: 4.2, z: 8.2, rotY: -0.4 },
    ],
    puddles: [
      { x: 0, z: 5.4, r: 1.15, isBlood: false },
      { x: -4.0, z: 8.8, r: 0.85, isBlood: true },
    ],
    logTitle: "REGISTRO CRIO #02 · Segurança do Átrio",
    logText:
      "“As tubulações congelaram o pavimento. Use o armário da galeria leste se ouvir cliques de mandíbula próximos.”",
    palette: "atrium",
    newbornActiveFromStart: true,
    crtPosition: { x: 1.8, y: 2.25, z: 1.1, rotY: -Math.PI * 0.82 },
  },
  3: {
    id: 3,
    shortLabel: "Alojamentos",
    title: "Cap. 3 · Alojamentos da Equipe",
    subtitle: "Setor 03 · Corredor Âmbar Intermitente",
    introQuote: "“Ninguém conseguiu sair dos dormitórios a tempo.”",
    introDesc:
      "Luzes âmbar falham no corredor estreito de 2.9m entre os beliches abandonados. Cada passo ecoa nas cabines vazias.",
    victoryTitle: "ALOJAMENTOS DEIXADOS PARA TRÁS",
    victoryDesc:
      "O bloco residencial fica para trás, mas os dutos desbloqueados agora dão acesso direto ao setor de Bio-Tanques.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: QUARTERS_WALLS,
    navNodes: [
      ...SHARED_CORRIDOR_NAVS,
      { x: -4.2, z: 4.2 },
      { x: -4.2, z: 8.8 },
      { x: 4.2, z: 4.2 },
      { x: 4.2, z: 8.8 },
    ],
    patrolPoints: [
      { x: 0, z: 4.4 },
      { x: -4.2, z: 4.2 },
      { x: 0, z: 8.2 },
      { x: 4.2, z: 8.8 },
      { x: 0, z: 11.4 },
    ],
    kitPos: { x: 4.4, z: 4.2 },
    badgePos: { x: -4.6, z: 6.2 },
    badgeName: "Chave-Mestra Residencial",
    badgeOwner: "Oficial Marta Solis · Logística",
    expectedPin: "6392",
    lockerPos: { x: 8.1, z: 5.8, hideX: 7.6, hideZ: 5.8, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: -1.4, z: 1.9, rotY: Math.PI / 2 },
    decoyPos: { x: -7.2, z: 4.6 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Alojamentos",
      wall: { id: "cdoor-3", minX: -1.42, maxX: 1.42, minZ: 5.1, maxZ: 5.4, kind: "door" },
      panelX: 1.0,
      panelZ: 4.5,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-3a", x: 0, z: 3.4, radius: 0.9, kind: "glass" },
      { id: "trap-3b", x: -4.2, z: 8.2, radius: 0.85, kind: "puddle" },
    ],
    survivorLogs: [
      {
        id: "log_3_1",
        cueId: "chapter_03_log_1",
        title: "Diário Dormitório A · Marta",
        author: "Oficial Marta Solis",
        text: "“Escutamos ele arrastar algo pesado pelos beliches. Desligamos o aquecedor, mas o cheiro de sangue sempre o traz de volta.”",
        x: -4.8,
        z: 1.8,
      },
      {
        id: "log_3_2",
        cueId: "chapter_03_log_2",
        title: "Mensagem no PADD · Ala Leste",
        author: "Técnico Renan",
        text: "“Se ficar encurralado entre os dormitórios, use as passagens laterais e feche a comporta central atrás de você.”",
        x: 5.4,
        z: 1.8,
      },
    ],
    corpses: [
      { x: -0.6, z: 6.2, rotY: 1.3 },
      { x: 4.6, z: 10.6, rotY: -2.2 },
    ],
    puddles: [
      { x: -0.4, z: 6.4, r: 0.9, isBlood: true },
      { x: 4.4, z: 9.8, r: 0.75, isBlood: true },
    ],
    logTitle: "DIÁRIO #03 · Alojamento B-4",
    logText:
      "“Ele imitou a voz do supervisor pelo interfone para nos fazer abrir a porta. Não acredite em nada que venha do corredor.”",
    palette: "quarters",
    newbornActiveFromStart: true,
    crtPosition: { x: -1.6, y: 2.25, z: 0.4, rotY: Math.PI * 0.85 },
  },
  4: {
    id: 4,
    shortLabel: "Bio-Tanques",
    title: "Cap. 4 · Bio-Tanques (Câmara 00)",
    subtitle: "Setor 04 · Incubação Verde Tóxica",
    introQuote: "“Foi aqui que criaram a nova raça superior...”",
    introDesc:
      "Névoa esverdeada escapa dos tanques biológicos estilhaçados. O Newborn nasceu neste laboratório — e conhece cada canto.",
    victoryTitle: "CÂMARA 00 SUPERADA",
    victoryDesc:
      "Você escapa dos tanques de gestação rumo à Engenharia. As válvulas de pressão liberadas ecoam pelo subsolo inteiro.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: BIOLAB_WALLS,
    navNodes: [
      { x: 0, z: -4.2 },
      { x: 0, z: -1.2 },
      { x: 0, z: 0.6 },
      { x: 0, z: 5.5 },
      { x: 0, z: 10.8 },
      { x: -4.6, z: 0.6 },
      { x: -4.6, z: 5.5 },
      { x: -4.6, z: 10.8 },
      { x: 4.6, z: 0.6 },
      { x: 4.6, z: 5.5 },
      { x: 4.6, z: 10.8 },
      { x: 2.8, z: 12.0 },
    ],
    patrolPoints: [
      { x: 0, z: 5.5 },
      { x: -4.6, z: 5.5 },
      { x: -4.6, z: 10.8 },
      { x: 4.6, z: 10.8 },
      { x: 4.6, z: 0.6 },
    ],
    kitPos: { x: 7.4, z: 3.4 },
    badgePos: { x: -7.4, z: 5.5 },
    badgeName: "Cartão Bio-Ômega 00",
    badgeOwner: "Dra. Elena Vance · Geneticista",
    expectedPin: "5174",
    lockerPos: { x: 8.2, z: 6.4, hideX: 7.7, hideZ: 6.4, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: -2.35, z: -2.4, rotY: Math.PI / 2 },
    decoyPos: { x: -4.6, z: 10.8 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Bio-00",
      wall: { id: "cdoor-4", minX: -1.48, maxX: 1.48, minZ: 5.35, maxZ: 5.65, kind: "door" },
      panelX: -1.0,
      panelZ: 4.8,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-4a", x: -4.6, z: 5.5, radius: 0.95, kind: "puddle" },
      { id: "trap-4b", x: 0, z: 7.8, radius: 0.9, kind: "glass" },
    ],
    survivorLogs: [
      {
        id: "log_4_1",
        cueId: "chapter_04_log_1",
        title: "Nota de Campo · Dra. Elena Vance",
        author: "Dra. Elena Vance",
        text: "“O vidro do tanque sudoeste rompeu por dentro. Os cacos espalhados são o pior perigo para quem tenta fugir correndo.”",
        x: -4.6,
        z: 0.6,
      },
      {
        id: "log_4_2",
        cueId: "chapter_04_log_2",
        title: "Relatório Câmara 00 · Biologista Sato",
        author: "Dr. Kenji Sato",
        text: "“Quando os relés caem, ele sobe pelos dutos por alguns segundos antes de retornar. Aproveite essas janelas para avançar.”",
        x: 4.6,
        z: 10.8,
      },
    ],
    corpses: [
      { x: -2.2, z: 5.5, rotY: 0.2 },
      { x: 5.2, z: 7.8, rotY: 2.8 },
    ],
    puddles: [
      { x: -2.3, z: 4.7, r: 1.05, isBlood: false },
      { x: 2.1, z: 5.8, r: 0.9, isBlood: true },
    ],
    logTitle: "DOSSIÊ GENÉTICO #00 · Projeto Gênesis",
    logText:
      "“Sem pálpebras, audição hipersensível e pele úmida capaz de absorver impactos. Apagar a lanterna é sua única defesa real.”",
    palette: "biolab",
    newbornActiveFromStart: true,
    crtPosition: { x: 1.7, y: 2.25, z: 1.2, rotY: -Math.PI * 0.85 },
  },
  5: {
    id: 5,
    shortLabel: "Engenharia",
    title: "Cap. 5 · Engenharia & Núcleo Azul",
    subtitle: "Setor 05 · Reator no Breu Absoluto",
    introQuote: "“Se o núcleo cair, ficaremos presos para sempre no escuro.”",
    introDesc:
      "Trevas quase absolutas interrompidas apenas pelo pulso azul do Reator Central. Circule o núcleo evitando a linha de visão direta.",
    victoryTitle: "REATOR ENERGIZADO",
    victoryDesc:
      "A energia principal volta a pulsar pelos cabos pesados, destravando o elevador para o Laboratório Ômega.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: ENGINEERING_WALLS,
    navNodes: [
      { x: 0, z: -4.2 },
      { x: 0, z: 1.2 },
      { x: -3.8, z: 1.2 },
      { x: -3.8, z: 5.5 },
      { x: -3.8, z: 10.6 },
      { x: 3.8, z: 1.2 },
      { x: 3.8, z: 5.5 },
      { x: 3.8, z: 10.6 },
      { x: 0, z: 10.6 },
      { x: 2.8, z: 12.0 },
    ],
    patrolPoints: [
      { x: -3.8, z: 5.5 },
      { x: 0, z: 10.6 },
      { x: 3.8, z: 5.5 },
      { x: 0, z: 1.2 },
    ],
    kitPos: { x: -3.8, z: 2.4 },
    badgePos: { x: 3.8, z: 8.6 },
    badgeName: "Cartão do Núcleo",
    badgeOwner: "Eng. Chefe Raul Torres",
    expectedPin: "8403",
    lockerPos: { x: 8.1, z: 11.4, hideX: 7.6, hideZ: 11.4, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: -5.35, z: 2.8, rotY: Math.PI / 2 },
    decoyPos: { x: -3.8, z: 10.6 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Anel Leste",
      wall: { id: "cdoor-5", minX: 2.2, maxX: 5.4, minZ: 5.35, maxZ: 5.65, kind: "door" },
      panelX: 2.7,
      panelZ: 4.8,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-5a", x: -3.8, z: 5.5, radius: 0.95, kind: "puddle" },
      { id: "trap-5b", x: 0, z: 10.6, radius: 0.95, kind: "glass" },
    ],
    survivorLogs: [
      {
        id: "log_5_1",
        cueId: "chapter_05_log_1",
        title: "Caixa Preta · Eng. Raul Torres",
        author: "Eng. Chefe Raul Torres",
        text: "“Se a lanterna começar a piscar forte do nada, não é bateria — ele está prestes a descer pelo duto acima de você.”",
        x: 3.8,
        z: 1.2,
      },
      {
        id: "log_5_2",
        cueId: "chapter_05_log_2",
        title: "Nota de Manutenção · Anel Oeste",
        author: "Téc. Fábio Lima",
        text: "“O reator cria um anel completo. Use o pilar central para cortar a linha de visão e nunca fique sem fôlego.”",
        x: -3.8,
        z: 8.8,
      },
    ],
    corpses: [
      { x: -3.6, z: 8.2, rotY: 1.5 },
      { x: 3.6, z: 2.8, rotY: -0.9 },
    ],
    puddles: [
      { x: -3.7, z: 5.5, r: 0.95, isBlood: true },
      { x: 0, z: 10.2, r: 1.1, isBlood: false },
    ],
    logTitle: "MANUTENÇÃO #05 · Subestação Central",
    logText:
      "“O zumbido do reator mascara passos leves se você se mover agachado pelas bordas do anel.”",
    palette: "engineering",
    newbornActiveFromStart: true,
    crtPosition: { x: -1.8, y: 2.25, z: -0.2, rotY: Math.PI * 0.85 },
  },
  6: {
    id: 6,
    shortLabel: "Ômega",
    title: "Cap. 6 · Bloco Ômega (Titânio Negro)",
    subtitle: "Setor 06 · Chicanas de Segurança Máxima",
    introQuote: "“Os diretores selaram este andar antes mesmo do alarme tocar.”",
    introDesc:
      "Paredes de titânio negro estreitas em zigue-zague forçam curvas cegas a cada passo. Escute antes de virar cada esquina.",
    victoryTitle: "BLOCO ÔMEGA ROMPIDO",
    victoryDesc:
      "As comportas de titânio se abrem para o Hangar Final. Falta apenas uma porta entre você e o céu aberto.",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: OMEGA_WALLS,
    navNodes: [
      { x: 0, z: -4.2 },
      { x: -8.2, z: -0.2 },
      { x: -8.2, z: 3.0 },
      { x: 5.6, z: -0.6 },
      { x: 5.6, z: 3.0 },
      { x: 8.2, z: 5.0 },
      { x: 8.2, z: 7.2 },
      { x: -5.6, z: 3.0 },
      { x: -5.6, z: 6.6 },
      { x: -8.2, z: 10.4 },
      { x: 5.6, z: 6.6 },
      { x: 5.6, z: 11.0 },
      { x: 0, z: 11.2 },
      { x: 2.8, z: 12.0 },
    ],
    patrolPoints: [
      { x: 5.6, z: 3.0 },
      { x: -5.6, z: 3.0 },
      { x: -5.6, z: 6.6 },
      { x: 5.6, z: 6.6 },
      { x: 0, z: 11.2 },
    ],
    kitPos: { x: -6.8, z: 3.0 },
    badgePos: { x: -6.8, z: 6.8 },
    badgeName: "Chave Diretoria Ômega",
    badgeOwner: "Dir. Geral · Vanguard-7",
    expectedPin: "2965",
    lockerPos: { x: 8.1, z: 10.6, hideX: 7.6, hideZ: 10.6, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: 0.8, z: 1.16, rotY: Math.PI },
    decoyPos: { x: 6.4, z: 3.0 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Titânio",
      wall: { id: "cdoor-6", minX: 2.2, maxX: 9.2, minZ: 1.25, maxZ: 1.55, kind: "door" },
      panelX: 2.9,
      panelZ: 0.7,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-6a", x: 5.2, z: 2.8, radius: 0.9, kind: "puddle" },
      { id: "trap-6b", x: -5.2, z: 6.4, radius: 0.9, kind: "glass" },
    ],
    survivorLogs: [
      {
        id: "log_6_1",
        cueId: "chapter_06_log_1",
        title: "Registro Diretoria Ômega · Fuga",
        author: "Seg. Chefe Almeida",
        text: "“Abrimos passagens nas pontas das chicanas para manutenção. Nunca fique preso num único corredor.”",
        x: -3.2,
        z: 3.0,
      },
      {
        id: "log_6_2",
        cueId: "chapter_06_log_2",
        title: "Último Desabafo · Bloco Ômega",
        author: "Pesq. Camila Rocha",
        text: "“Quando você sangra, cada gota no chão vira um rastro até você. Use o Kit de Estanca antes de tentar hackear a porta.”",
        x: 3.6,
        z: 6.6,
      },
    ],
    corpses: [
      { x: 5.2, z: 0.4, rotY: -1.6 },
      { x: -4.8, z: 6.6, rotY: 0.4 },
    ],
    puddles: [
      { x: 5.2, z: 2.8, r: 0.85, isBlood: true },
      { x: -5.2, z: 6.4, r: 1.0, isBlood: true },
    ],
    logTitle: "ORDEM EXECUTIVA #06 · Acesso Negado",
    logText:
      "“Sacrifiquem a ala inferior se necessário. O Espécime Newborn jamais pode alcançar o Hangar de Carga.”",
    palette: "omega",
    newbornActiveFromStart: true,
    crtPosition: { x: 1.8, y: 2.25, z: -0.2, rotY: -Math.PI * 0.85 },
  },
  7: {
    id: 7,
    shortLabel: "Hangar",
    title: "Cap. 7 · Hangar de Carga & Exterior",
    subtitle: "Setor 07 · Fumaça Densa e Nevasca Lá Fora",
    introQuote: "“A saída está logo ali... mas a que custo?”",
    introDesc:
      "Fumaça pesada encobre os contêineres do hangar final. Energize a comporta de evacuação para alcançar a nevasca do mundo exterior.",
    victoryTitle: "FUGA CONCLUÍDA · AS PORTAS FICARAM ABERTAS",
    victoryDesc:
      "Arthur cambaleia para fora sob a nevasca fria, vivo e ensanguentado. Mas ao religar os relés finais do hangar e erguer o portão principal, você acabou de abrir caminho para que o Newborn alcance o mundo exterior...",
    spawn: { x: 0, z: -4.2, yaw: 0 },
    walls: HANGAR_WALLS,
    navNodes: [
      ...SHARED_CORRIDOR_NAVS,
      { x: -7.4, z: 2.6 },
      { x: -7.4, z: 8.2 },
      { x: 7.4, z: 2.6 },
      { x: 7.4, z: 8.2 },
      { x: 0, z: 5.4 },
    ],
    patrolPoints: [
      { x: 0, z: 11.4 },
      { x: -7.4, z: 8.2 },
      { x: -7.4, z: 2.6 },
      { x: 0, z: 5.4 },
      { x: 7.4, z: 2.6 },
      { x: 7.4, z: 8.2 },
    ],
    kitPos: { x: -7.4, z: 2.4 },
    badgePos: { x: -7.4, z: 8.2 },
    badgeName: "Cartão de Evacuação Final",
    badgeOwner: "Comandante Carga · Hangar Norte",
    expectedPin: "9104",
    lockerPos: { x: 8.1, z: 8.2, hideX: 7.6, hideZ: 8.2, rotY: -Math.PI / 2 },
    relayPos: { x: 2.8, z: 13.35 },
    exitPos: { x: 0, z: 13.4 },
    wallMapPos: { x: 2.8, z: 1.36, rotY: Math.PI },
    decoyPos: { x: 7.2, z: 2.6 },
    containmentDoor: {
      id: "containment_door",
      label: "Travar Comporta Carga",
      wall: { id: "cdoor-7", minX: -1.55, maxX: 1.55, minZ: 5.25, maxZ: 5.55, kind: "door" },
      panelX: -1.1,
      panelZ: 4.7,
      durationSec: 6.0,
    },
    soundTraps: [
      { id: "trap-7a", x: -0.7, z: 5.4, radius: 1.0, kind: "puddle" },
      { id: "trap-7b", x: 0.4, z: 10.6, radius: 0.95, kind: "glass" },
    ],
    survivorLogs: [
      {
        id: "log_7_1",
        cueId: "chapter_07_log_1",
        title: "Transmissão Piloto · Hangar Sul",
        author: "Piloto Sara Mendes",
        text: "“A tempestade lá fora já tomou a pista. Se abrir o portão de carga, nada mais vai segurar o que está atrás de você.”",
        x: 3.4,
        z: 5.4,
      },
      {
        id: "log_7_2",
        cueId: "chapter_07_log_2",
        title: "Caixa Preta · Última Ordem",
        author: "Comandante Carga",
        text: "“Todo o complexo colapsou. Esta é sua última chance de sair vivo do Vanguard-7. Não olhe para trás.”",
        x: -3.2,
        z: 11.4,
      },
    ],
    corpses: [
      { x: -0.9, z: 5.4, rotY: 2.3 },
      { x: 7.1, z: 3.1, rotY: -0.8 },
    ],
    puddles: [
      { x: -0.7, z: 5.4, r: 1.2, isBlood: true },
      { x: 0.4, z: 11.2, r: 1.0, isBlood: false },
    ],
    logTitle: "DIRETIVA FINAL · Portão de Superfície",
    logText:
      "“Aviso crítico: energizar o painel de evacuação do Hangar libera automaticamente as travas externas e o sistema de ventilação.”",
    palette: "hangar",
    newbornActiveFromStart: true,
    crtPosition: { x: -1.8, y: 2.25, z: 0.2, rotY: Math.PI * 0.85 },
  },
};

export function resolveCircleWallCollision(
  x: number,
  z: number,
  radius: number,
  walls: AABBWall[]
): { x: number; z: number } {
  let outX = x;
  let outZ = z;

  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls) {
      const closestX = Math.max(w.minX, Math.min(outX, w.maxX));
      const closestZ = Math.max(w.minZ, Math.min(outZ, w.maxZ));
      const dx = outX - closestX;
      const dz = outZ - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          outX += (dx / dist) * overlap;
          outZ += (dz / dist) * overlap;
        } else {
          const leftPen = Math.abs(outX - w.minX);
          const rightPen = Math.abs(w.maxX - outX);
          const topPen = Math.abs(outZ - w.minZ);
          const bottomPen = Math.abs(w.maxZ - outZ);
          const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
          if (minPen === leftPen) outX = w.minX - radius;
          else if (minPen === rightPen) outX = w.maxX + radius;
          else if (minPen === topPen) outZ = w.minZ - radius;
          else outZ = w.maxZ + radius;
        }
      }
    }
  }

  return { x: outX, z: outZ };
}

function segmentIntersectsAABB(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  w: AABBWall
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;

  const checks: Array<[number, number]> = [
    [-dx, x1 - w.minX],
    [dx, w.maxX - x1],
    [-dz, z1 - w.minZ],
    [dz, w.maxZ - z1],
  ];

  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }

  return t0 <= t1;
}

/**
 * Linha de visão real por raycast 2D contra paredes opacas (vidro e mesas baixas não bloqueiam visão).
 */
export function hasWallLineOfSight(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  walls: AABBWall[]
): boolean {
  for (const w of walls) {
    if (w.kind === "glass" || w.kind === "desk" || w.kind === "tank") continue;
    if (segmentIntersectsAABB(x1, z1, x2, z2, w)) {
      return false;
    }
  }
  return true;
}

/**
 * Diretor de NavMesh via BFS no grafo de navegação do capítulo.
 */
export function findNextNavWaypoint(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  walls: AABBWall[],
  navNodes: NavNode[]
): NavNode {
  const solidWalls = walls.filter((w) => w.kind !== "desk");
  const isClear = (ax: number, az: number, bx: number, bz: number) => {
    for (const w of solidWalls) {
      if (segmentIntersectsAABB(ax, az, bx, bz, w)) return false;
    }
    return true;
  };

  if (isClear(fromX, fromZ, toX, toZ) || navNodes.length === 0) {
    return { x: toX, z: toZ };
  }

  const startIdx = navNodes.reduce(
    (best, n, i) => {
      const d = Math.hypot(n.x - fromX, n.z - fromZ);
      const canSee = isClear(fromX, fromZ, n.x, n.z);
      const score = canSee ? d : d + 50;
      return score < best.score ? { idx: i, score } : best;
    },
    { idx: 0, score: Infinity }
  ).idx;

  const endIdx = navNodes.reduce(
    (best, n, i) => {
      const d = Math.hypot(n.x - toX, n.z - toZ);
      const canSee = isClear(n.x, n.z, toX, toZ);
      const score = canSee ? d : d + 50;
      return score < best.score ? { idx: i, score } : best;
    },
    { idx: 0, score: Infinity }
  ).idx;

  if (startIdx === endIdx) {
    return navNodes[startIdx];
  }

  const visited = new Set<number>([startIdx]);
  const parent = new Map<number, number>();
  const queue: number[] = [startIdx];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === endIdx) break;
    const cn = navNodes[cur];
    for (let i = 0; i < navNodes.length; i++) {
      if (visited.has(i)) continue;
      const nn = navNodes[i];
      if (Math.hypot(nn.x - cn.x, nn.z - cn.z) <= 9.0 && isClear(cn.x, cn.z, nn.x, nn.z)) {
        visited.add(i);
        parent.set(i, cur);
        queue.push(i);
      }
    }
  }

  if (!parent.has(endIdx)) {
    return navNodes[startIdx];
  }

  let step = endIdx;
  while (parent.get(step) !== undefined && parent.get(step) !== startIdx) {
    step = parent.get(step)!;
  }

  const firstHop = navNodes[startIdx];
  if (Math.hypot(firstHop.x - fromX, firstHop.z - fromZ) > 0.75) {
    return firstHop;
  }
  return navNodes[step] ?? firstHop;
}

export function addItemToInventory(
  slots: InventoryItem[],
  newItem: InventoryItem,
  maxSlots = 6
): { slots: InventoryItem[]; added: boolean; reason?: string } {
  if (newItem.category === "consumivel") {
    const existingIdx = slots.findIndex(
      (item) => item.id === newItem.id && item.quantity < 2
    );
    if (existingIdx !== -1) {
      const updated = slots.map((it, idx) =>
        idx === existingIdx
          ? { ...it, quantity: Math.min(2, it.quantity + newItem.quantity) }
          : it
      );
      return { slots: updated, added: true };
    }
  }

  if (slots.length >= maxSlots) {
    return {
      slots,
      added: false,
      reason: "Inventário cheio (6/6 slots). Guarde ou use um item.",
    };
  }

  return { slots: [...slots, { ...newItem }], added: true };
}

export function validateRelayPuzzle(state: RelayState): {
  solved: boolean;
  shortCircuit: boolean;
  message: string;
} {
  if (state.pin2Color === "vermelho" || state.pin4Color === "vermelho") {
    return {
      solved: false,
      shortCircuit: true,
      message: "Curto-circuito na linha carbonizada! Evite o canal vermelho.",
    };
  }
  if (state.pin2Color === "ciano" && state.pin4Color === "ambar") {
    return {
      solved: true,
      shortCircuit: false,
      message: "Energia auxiliar restaurada! Comporta energizada.",
    };
  }
  return {
    solved: false,
    shortCircuit: false,
    message: "Conecte o canal Ciano ao Pino 2 e o canal Âmbar ao Pino 4.",
  };
}

export function validateKeypadCode(input: string, expected = "0719"): boolean {
  return input.trim() === expected;
}

export interface PerceptionInput {
  distanceM: number;
  hasLineOfSight: boolean;
  flashlightOn: boolean;
  roomLit: boolean;
  playerNoiseM: number;
  playerHidingInLocker: boolean;
  breathHeld: boolean;
  playerBleeding: boolean;
  stunTimerSec: number;
  spawnGraceSec?: number;
  currentState: NewbornAIState;
  sightRangeMult?: number;
}

export function evaluateNewbornPerception(input: PerceptionInput): {
  nextState: NewbornAIState;
  detectedBy: "none" | "sight" | "sound" | "scent" | "stun";
  veinsColor: "off" | "cyan" | "crimson";
} {
  if (input.stunTimerSec > 0) {
    return { nextState: "Stunned", detectedBy: "stun", veinsColor: "crimson" };
  }

  // Janela de graça após spawn/queda do duto: nunca entra em Hunt nem causa morte imediata
  if ((input.spawnGraceSec ?? 0) > 0) {
    return {
      nextState: input.currentState === "Patrol" ? "Patrol" : "Investigate",
      detectedBy: "none",
      veinsColor: "cyan",
    };
  }

  if (input.playerHidingInLocker) {
    if (!input.breathHeld && input.distanceM < 2.2) {
      return { nextState: "Investigate", detectedBy: "sound", veinsColor: "cyan" };
    }
    if (input.currentState === "Hunt" && !input.hasLineOfSight) {
      return { nextState: "Investigate", detectedBy: "none", veinsColor: "cyan" };
    }
    return {
      nextState: input.currentState === "Hunt" ? "Investigate" : input.currentState,
      detectedBy: "none",
      veinsColor: input.currentState === "Investigate" ? "cyan" : "off",
    };
  }

  const mult = input.sightRangeMult ?? 1.0;
  const sightRange =
    (input.flashlightOn
      ? PHYSICS_PARAMS.sightFlashlightOnM
      : input.roomLit
        ? PHYSICS_PARAMS.sightFlashlightOffLitM
        : PHYSICS_PARAMS.sightFlashlightOffDarkM) * mult;

  if (input.hasLineOfSight && input.distanceM <= sightRange) {
    return { nextState: "Hunt", detectedBy: "sight", veinsColor: "crimson" };
  }

  if (input.playerNoiseM > 0 && input.distanceM <= input.playerNoiseM) {
    return { nextState: "Investigate", detectedBy: "sound", veinsColor: "cyan" };
  }

  if (input.playerBleeding && input.distanceM <= 10.0 * mult) {
    return { nextState: "Investigate", detectedBy: "scent", veinsColor: "cyan" };
  }

  if (input.currentState === "Hunt") {
    return { nextState: "Investigate", detectedBy: "none", veinsColor: "cyan" };
  }

  return {
    nextState: input.currentState === "Observe" ? "Observe" : "Patrol",
    detectedBy: "none",
    veinsColor: "off",
  };
}

export interface SafeNewbornSpawnInput {
  playerX: number;
  playerZ: number;
  playerYaw: number;
  exitPos: { x: number; z: number };
  walls: AABBWall[];
  candidates: NavNode[];
  minDistanceM?: number;
}

function isPointClearOfSolidWalls(
  x: number,
  z: number,
  radius: number,
  walls: AABBWall[]
): boolean {
  for (const w of walls) {
    const cx = Math.max(w.minX, Math.min(x, w.maxX));
    const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
    if (Math.hypot(x - cx, z - cz) < radius) {
      return false;
    }
  }
  return true;
}

/**
 * Seleciona um ponto de spawn/queda do duto justo para o Newborn:
 * - Garante distância mínima segura (>= 14m sempre que houver candidato válido, ou o mais distante possível);
 * - Evita o campo de visão imediato do jogador e nunca bloqueia a saída imediata da sala do painel.
 */
export function selectSafeNewbornSpawn(input: SafeNewbornSpawnInput): NavNode {
  const minDistance = input.minDistanceM ?? 14.0;
  const fallbackPool: NavNode[] = [
    ...input.candidates,
    { x: -6.8, z: -3.6 },
    { x: 6.8, z: -3.6 },
    { x: 0, z: -4.2 },
    { x: -7.4, z: 3.2 },
    { x: 7.4, z: 3.2 },
  ];

  const valid = fallbackPool.filter((c) =>
    isPointClearOfSolidWalls(c.x, c.z, 0.45, input.walls)
  );
  const pool = valid.length > 0 ? valid : fallbackPool;

  const fwdX = Math.sin(input.playerYaw);
  const fwdZ = Math.cos(input.playerYaw);

  let bestNode = pool[0];
  let bestScore = -Infinity;

  for (const c of pool) {
    const dx = c.x - input.playerX;
    const dz = c.z - input.playerZ;
    const dist = Math.hypot(dx, dz);
    const exitDist = Math.hypot(c.x - input.exitPos.x, c.z - input.exitPos.z);

    // Dot product para penalizar spawn bem na frente do jogador
    const inv = dist > 0.01 ? 1 / dist : 1;
    const forwardDot = dx * inv * fwdX + dz * inv * fwdZ;
    const outOfView = forwardDot < 0.45;
    const clearOfExit = exitDist >= 4.2;

    let score = dist;
    if (dist >= minDistance) {
      score += 100;
      // Faixa ideal 14..18m sem punir distâncias maiores se necessário
      if (dist <= 18.5) score += 12;
    }
    if (outOfView) score += 25;
    if (clearOfExit) score += 35;

    if (score > bestScore) {
      bestScore = score;
      bestNode = c;
    }
  }

  return bestNode;
}

export function computeStealthExposurePct(input: {
  flashlightOn: boolean;
  noiseM: number;
  hidingInLocker: boolean;
  holdingBreath: boolean;
  newbornState: NewbornAIState;
}): number {
  if (input.hidingInLocker) {
    return input.holdingBreath ? 5 : 22;
  }
  let pct = 14;
  if (input.flashlightOn) pct += 40;
  pct += Math.min(36, (input.noiseM / PHYSICS_PARAMS.noiseSprintM) * 36);
  if (input.newbornState === "Hunt") pct = Math.max(pct, 95);
  else if (input.newbornState === "Investigate") pct = Math.max(pct, 65);
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function advanceDirectorWave(input: {
  wavePhase: DirectorWavePhase;
  timerSec: number;
  dt: number;
  newbornState: NewbornAIState;
  difficulty: DifficultyMode;
}): {
  wavePhase: DirectorWavePhase;
  timerSec: number;
  ambushFlickerWarning: boolean;
  event?: "retreat_to_vent" | "drop_from_vent";
} {
  const diff = DIFFICULTY_PARAMS[input.difficulty];
  let wavePhase = input.wavePhase;
  let timerSec = input.timerSec + input.dt;
  let event: "retreat_to_vent" | "drop_from_vent" | undefined;

  if (wavePhase === "pressure") {
    if (
      timerSec >= diff.pressureSec &&
      input.newbornState === "Patrol"
    ) {
      wavePhase = "vent_retreat";
      timerSec = 0;
      event = "retreat_to_vent";
    }
  } else if (wavePhase === "vent_retreat") {
    if (timerSec >= diff.ventRetreatSec) {
      wavePhase = "pressure";
      timerSec = 0;
      event = "drop_from_vent";
    }
  } else {
    wavePhase = "pressure";
  }

  const ambushFlickerWarning =
    wavePhase === "vent_retreat" &&
    timerSec >= Math.max(0, diff.ventRetreatSec - 1.8);

  return { wavePhase, timerSec, ambushFlickerWarning, event };
}

export type ControlMode = "auto" | "touch" | "keyboard";

export interface TouchDeviceSignals {
  savedPreference: string | null;
  forceQueryParam?: boolean;
  hostname?: string;
  userAgent?: string;
  pointerCoarse?: boolean;
  anyPointerCoarse?: boolean;
  maxTouchPoints?: number;
  hasOnTouchStart?: boolean;
}

/**
 * Detecta smartphones e tablets (incluindo iPadOS / tablets que reportam User-Agent "Macintosh"
 * mas possuem maxTouchPoints > 1) e WebView do APK Android.
 */
export function isMobileOrTabletDevice(
  signals: Omit<TouchDeviceSignals, "savedPreference">
): boolean {
  const isAndroidApkHost =
    signals.hostname === "appassets.androidplatform.net";
  const ua = signals.userAgent ?? "";
  const isMobileOrTabletUa =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Tablet|PlayBook|Silk/i.test(
      ua
    );
  const isIpadDesktopUa =
    /Macintosh/i.test(ua) && (signals.maxTouchPoints ?? 0) > 1;

  return Boolean(
    isAndroidApkHost ||
      isMobileOrTabletUa ||
      isIpadDesktopUa ||
      signals.pointerCoarse ||
      signals.anyPointerCoarse ||
      (signals.maxTouchPoints ?? 0) > 0 ||
      signals.hasOnTouchStart
  );
}

/**
 * Resolve o modo de controles efetivo ("touch" ativo ou "teclado e mouse").
 */
export function resolveTouchControlsActive(
  mode: ControlMode,
  signals: Omit<TouchDeviceSignals, "savedPreference">
): boolean {
  if (signals.forceQueryParam) return true;
  if (mode === "touch") return true;
  if (mode === "keyboard") return false;
  return isMobileOrTabletDevice(signals);
}

/**
 * Determina se os controles Touch devem iniciar ativos.
 * No APK Android (WebView em appassets.androidplatform.net ou Android UA) e em dispositivos
 * móveis/tablets/touchscreen, ativa automaticamente a camada touch mesmo que matchMedia(pointer: coarse)
 * retorne falso na WebView.
 */
export function shouldEnableTouchControlsByDefault(
  signals: TouchDeviceSignals
): boolean {
  if (signals.forceQueryParam) return true;

  const isAndroidApkHost =
    signals.hostname === "appassets.androidplatform.net";

  if (signals.savedPreference === "touch" || signals.savedPreference === "1") {
    return true;
  }
  if (signals.savedPreference === "keyboard" || signals.savedPreference === "0") {
    return isAndroidApkHost;
  }

  return isMobileOrTabletDevice(signals);
}

export type GamePhase = "title" | "intro" | "playing" | "paused" | "victory" | "gameover";

export type HealthState = "verde" | "vermelho";

export type NewbornAIState = "Observe" | "Patrol" | "Investigate" | "Hunt" | "Stunned";

export type ChapterId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
  category: "consumivel" | "chave";
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

export function computeDollyZoomFov(
  newbornDist: number,
  newbornVisible: boolean,
  state: NewbornAIState
): number {
  if (!newbornVisible) return PHYSICS_PARAMS.defaultFov;
  if (state === "Hunt") return PHYSICS_PARAMS.dollyZoomFov;
  if (state === "Observe" || state === "Investigate") {
    const t = Math.max(0, Math.min(1, (11 - newbornDist) / 8));
    return PHYSICS_PARAMS.defaultFov - t * (PHYSICS_PARAMS.defaultFov - 56);
  }
  return PHYSICS_PARAMS.defaultFov;
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

  // Sala de Triagem (Oeste: X -9.2..-1.5) — entrada em X = -1.5, Z = 3.2..5.5 (corredor central fica 3.0m de largura!)
  { id: "tri-south", minX: -9.2, maxX: -1.5, minZ: 1.2, maxZ: 1.6, kind: "wall" },
  { id: "tri-north", minX: -9.2, maxX: -1.5, minZ: 9.0, maxZ: 9.4, kind: "wall" },
  { id: "tri-es", minX: -1.8, maxX: -1.45, minZ: 1.2, maxZ: 3.1, kind: "wall" },
  { id: "tri-en", minX: -1.8, maxX: -1.45, minZ: 5.6, maxZ: 9.4, kind: "wall" },
  { id: "tri-bed", minX: -7.8, maxX: -5.6, minZ: 5.8, maxZ: 7.4, height: 0.72, kind: "desk" },

  // Sala de Raio-X (Leste: X 1.5..9.2) — entrada em X = 1.5, Z = 3.2..5.5
  { id: "xray-south", minX: 1.5, maxX: 9.2, minZ: 1.2, maxZ: 1.6, kind: "wall" },
  { id: "xray-north", minX: 1.5, maxX: 9.2, minZ: 9.0, maxZ: 9.4, kind: "wall" },
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

// Cap. 6 · Ômega Titânio Negro (labirinto blindado estreito 2.9m)
export const OMEGA_WALLS: AABBWall[] = [
  ...outerPerimeter(),
  { id: "omg-desk", minX: -1.1, maxX: 1.1, minZ: -3.2, maxZ: -2.55, height: 0.65, kind: "desk" },
  // Divisórias blindadas em chicana para linhas de visão curtas
  { id: "omg-baffle-1", minX: -9.2, maxX: 2.2, minZ: 1.2, maxZ: 1.7, kind: "wall" },
  { id: "omg-baffle-2", minX: -2.2, maxX: 9.2, minZ: 4.8, maxZ: 5.3, kind: "wall" },
  { id: "omg-baffle-3", minX: -9.2, maxX: 2.2, minZ: 8.4, maxZ: 8.9, kind: "wall" },
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
      { x: 1.6, z: 4.4 },
      { x: 4.8, z: 4.4 },
      { x: 7.2, z: 6.5 },
    ],
    patrolPoints: [
      { x: 0, z: 8.2 },
      { x: -4.8, z: 4.4 },
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
      { x: 5.6, z: -0.6 },
      { x: 5.6, z: 3.0 },
      { x: -5.6, z: 3.0 },
      { x: -5.6, z: 6.6 },
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
  currentState: NewbornAIState;
}

export function evaluateNewbornPerception(input: PerceptionInput): {
  nextState: NewbornAIState;
  detectedBy: "none" | "sight" | "sound" | "scent" | "stun";
  veinsColor: "off" | "cyan" | "crimson";
} {
  if (input.stunTimerSec > 0) {
    return { nextState: "Stunned", detectedBy: "stun", veinsColor: "crimson" };
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

  const sightRange = input.flashlightOn
    ? PHYSICS_PARAMS.sightFlashlightOnM
    : input.roomLit
      ? PHYSICS_PARAMS.sightFlashlightOffLitM
      : PHYSICS_PARAMS.sightFlashlightOffDarkM;

  if (input.hasLineOfSight && input.distanceM <= sightRange) {
    return { nextState: "Hunt", detectedBy: "sight", veinsColor: "crimson" };
  }

  if (input.playerNoiseM > 0 && input.distanceM <= input.playerNoiseM) {
    return { nextState: "Investigate", detectedBy: "sound", veinsColor: "cyan" };
  }

  if (input.playerBleeding && input.distanceM <= 10.0) {
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

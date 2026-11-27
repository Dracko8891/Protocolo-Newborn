import * as THREE from "three";
import { DRACOLoader, DRACO_GLTF_CONFIG } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { ChapterId, ChapterTheme } from "./gameLogic";
import type { ChapterDownloadProgress } from "./manifestTypes";

export interface CachedPbrMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface ResourceCacheSnapshot {
  status: "idle" | "preloading" | "ready";
  progressPct: number;
  cachedKeys: string[];
  chapterDownloads: Partial<Record<ChapterId, ChapterDownloadProgress>>;
}

interface ThemeVisualSpec {
  baseHex: string;
  accentHex: string;
  rustHex: string;
  grimeAlpha: number;
}

const THEME_SPECS: Record<ChapterTheme, ThemeVisualSpec> = {
  medical: {
    baseHex: "#252c34",
    accentHex: "#7f1d1d",
    rustHex: "#3c2118",
    grimeAlpha: 0.48,
  },
  atrium: {
    baseHex: "#1c2836",
    accentHex: "#0369a1",
    rustHex: "#1e293b",
    grimeAlpha: 0.4,
  },
  quarters: {
    baseHex: "#2d2822",
    accentHex: "#b45309",
    rustHex: "#472312",
    grimeAlpha: 0.5,
  },
  biolab: {
    baseHex: "#1a2a23",
    accentHex: "#15803d",
    rustHex: "#24321c",
    grimeAlpha: 0.54,
  },
  engineering: {
    baseHex: "#161b24",
    accentHex: "#0284c7",
    rustHex: "#2e1f17",
    grimeAlpha: 0.56,
  },
  omega: {
    baseHex: "#13141a",
    accentHex: "#52525b",
    rustHex: "#281818",
    grimeAlpha: 0.44,
  },
  hangar: {
    baseHex: "#1f252d",
    accentHex: "#92400e",
    rustHex: "#3d2417",
    grimeAlpha: 0.52,
  },
};

const textureCache: {
  floor?: CachedPbrMaps;
  ceiling?: CachedPbrMaps;
  newbornSkin?: CachedPbrMaps;
  walls: Partial<Record<ChapterTheme, CachedPbrMaps>>;
  flashlightCookie?: THREE.CanvasTexture;
  beamCone?: THREE.CanvasTexture;
  tricorderScreen?: THREE.CanvasTexture;
  grimyGlass?: THREE.CanvasTexture;
  cctvNormal?: THREE.CanvasTexture;
  cctvSubliminal?: THREE.CanvasTexture;
  models: Map<string, GLTF>;
  status: "idle" | "preloading" | "ready";
  progressPct: number;
  chapterDownloads: Partial<Record<ChapterId, ChapterDownloadProgress>>;
} = {
  walls: {},
  models: new Map(),
  status: "idle",
  progressPct: 0,
  chapterDownloads: {},
};

let sharedGltfLoader: GLTFLoader | null = null;
let sharedDracoLoader: DRACOLoader | null = null;
let sharedKtx2Loader: KTX2Loader | null = null;
const cacheSubscribers = new Set<(snap: ResourceCacheSnapshot) => void>();

export function configureAssetLoaders(renderer?: THREE.WebGLRenderer): GLTFLoader {
  if (!sharedGltfLoader) {
    sharedGltfLoader = new GLTFLoader();
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_GLTF_CONFIG as unknown as string);
    sharedGltfLoader.setDRACOLoader(sharedDracoLoader);
    sharedGltfLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  if (renderer && !sharedKtx2Loader) {
    try {
      sharedKtx2Loader = new KTX2Loader().detectSupport(renderer);
      sharedGltfLoader.setKTX2Loader(sharedKtx2Loader);
    } catch {
      // KTX2 opcional se WebGL/worker não suportar no ambiente headless
    }
  }
  return sharedGltfLoader;
}

export function subscribeResourceCache(
  listener: (snap: ResourceCacheSnapshot) => void
): () => void {
  cacheSubscribers.add(listener);
  listener(getResourceCacheSnapshot());
  return () => {
    cacheSubscribers.delete(listener);
  };
}

function notifyCacheSubscribers(): void {
  const snap = getResourceCacheSnapshot();
  cacheSubscribers.forEach((fn) => fn(snap));
}

export function setAllChapterDownloadsSnapshot(
  map: Partial<Record<ChapterId, ChapterDownloadProgress>>
): void {
  textureCache.chapterDownloads = { ...map };
  notifyCacheSubscribers();
}

export function updateChapterDownloadSnapshot(
  chapterId: ChapterId,
  progress: ChapterDownloadProgress
): void {
  textureCache.chapterDownloads = {
    ...textureCache.chapterDownloads,
    [chapterId]: progress,
  };
  notifyCacheSubscribers();
}

function hash2d(x: number, y: number, seed = 17): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
        }
      ).requestIdleCallback(() => resolve(), { timeout: 40 });
    } else {
      setTimeout(resolve, 10);
    }
  });
}

function buildNormalFromHeightCanvas(
  heightCanvas: HTMLCanvasElement,
  strength = 3.0
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext("2d")!;
  const src = srcCtx.getImageData(0, 0, w, h).data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext("2d")!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number) => {
    const cx = (x + w) % w;
    const cy = (y + h) % h;
    return src[(cy * w + cx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx * invLen;
      const ny = -dy * invLen;
      const nz = invLen;
      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);

  const tex = new THREE.CanvasTexture(outCanvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function addWeatheredGrain(
  ctx: CanvasRenderingContext2D,
  hctx: CanvasRenderingContext2D,
  rctx: CanvasRenderingContext2D,
  size: number,
  seed: number
) {
  for (let i = 0; i < 650; i++) {
    const x = Math.floor(hash2d(i, 1, seed) * size);
    const y = Math.floor(hash2d(i, 2, seed) * size);
    const rad = 2 + hash2d(i, 3, seed) * 14;
    const dark = hash2d(i, 4, seed) > 0.45;
    ctx.fillStyle = dark ? "rgba(3, 5, 8, 0.14)" : "rgba(180, 195, 210, 0.045)";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    hctx.fillStyle = dark ? "rgba(92,92,92,0.28)" : "rgba(162,162,162,0.22)";
    hctx.beginPath();
    hctx.arc(x, y, rad * 0.75, 0, Math.PI * 2);
    hctx.fill();

    rctx.fillStyle = dark ? "rgba(232,232,232,0.25)" : "rgba(140,140,140,0.2)";
    rctx.beginPath();
    rctx.arc(x, y, rad, 0, Math.PI * 2);
    rctx.fill();
  }
}

export function buildFloorTileTexture(maxAnisotropy: number): CachedPbrMaps {
  if (textureCache.floor) {
    textureCache.floor.map.anisotropy = maxAnisotropy;
    textureCache.floor.normalMap.anisotropy = maxAnisotropy;
    textureCache.floor.roughnessMap.anisotropy = maxAnisotropy;
    return textureCache.floor;
  }

  const size = 512;
  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext("2d")!;
  ctx.fillStyle = "#11161d";
  ctx.fillRect(0, 0, size, size);

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext("2d")!;
  hctx.fillStyle = "#888888";
  hctx.fillRect(0, 0, size, size);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d")!;
  rctx.fillStyle = "#c2c2c2"; // ~0.76 roughness base
  rctx.fillRect(0, 0, size, size);

  addWeatheredGrain(ctx, hctx, rctx, size, 11);

  // Placas industriais 128x128 com variação de tonalidade metálica e oxidação
  for (let ty = 0; ty < size; ty += 128) {
    for (let tx = 0; tx < size; tx += 128) {
      const tint = Math.round((hash2d(tx, ty, 3) - 0.5) * 10);
      ctx.fillStyle = `rgba(${20 + tint}, ${24 + tint}, ${31 + tint}, 0.32)`;
      ctx.fillRect(tx + 3, ty + 3, 122, 122);
    }
  }

  // Juntas fundas entre placas metálicas
  ctx.strokeStyle = "#030508";
  ctx.lineWidth = 6;
  hctx.strokeStyle = "#1a1a1a";
  hctx.lineWidth = 6;
  rctx.strokeStyle = "#f2f2f2";
  rctx.lineWidth = 6;
  for (let i = 0; i <= size; i += 128) {
    [ctx, hctx, rctx].forEach((c) => {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, size);
      c.stroke();
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(size, i);
      c.stroke();
    });
  }

  // Rebites + ranhuras antiderrapantes em relevo
  for (let y = 16; y < size; y += 32) {
    for (let x = 16; x < size; x += 32) {
      const dark = (x * 7 + y * 13) % 5 === 0;
      ctx.fillStyle = dark ? "rgba(0,0,0,0.34)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(x, y, 5, 4);
      hctx.fillStyle = dark ? "#686868" : "#bbbbbb";
      hctx.fillRect(x, y, 5, 4);
    }
  }

  // Manchas de ferrugem úmida + respingos escuros de sangue com rugosidade baixa (reflexo realista na lanterna)
  ctx.fillStyle = "rgba(62, 24, 14, 0.45)";
  ctx.beginPath();
  ctx.ellipse(355, 165, 68, 42, -0.35, 0, Math.PI * 2);
  ctx.fill();
  rctx.fillStyle = "#dedede"; // ferrugem mais áspera
  rctx.beginPath();
  rctx.ellipse(355, 165, 68, 42, -0.35, 0, Math.PI * 2);
  rctx.fill();

  ctx.fillStyle = "rgba(66, 7, 11, 0.68)";
  ctx.beginPath();
  ctx.ellipse(244, 296, 62, 28, 0.35, 0, Math.PI * 2);
  ctx.fill();
  rctx.fillStyle = "#323232"; // líquido úmido ~0.20 roughness
  rctx.beginPath();
  rctx.ellipse(244, 296, 62, 28, 0.35, 0, Math.PI * 2);
  rctx.fill();

  // Marcas de garras arrastando no aço
  ctx.strokeStyle = "rgba(185, 200, 215, 0.16)";
  ctx.lineWidth = 2.2;
  hctx.strokeStyle = "#2b2b2b";
  hctx.lineWidth = 2.4;
  for (let k = 0; k < 4; k++) {
    [ctx, hctx].forEach((c) => {
      c.beginPath();
      c.moveTo(84 + k * 10, 96);
      c.lineTo(164 + k * 12, 184);
      c.stroke();
    });
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 2.8);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(8, 8);
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(8, 8);
  roughnessMap.anisotropy = maxAnisotropy;

  textureCache.floor = { map, normalMap, roughnessMap };
  return textureCache.floor;
}

export function buildCeilingGrateTexture(maxAnisotropy: number): CachedPbrMaps {
  if (textureCache.ceiling) {
    textureCache.ceiling.map.anisotropy = maxAnisotropy;
    textureCache.ceiling.normalMap.anisotropy = maxAnisotropy;
    textureCache.ceiling.roughnessMap.anisotropy = maxAnisotropy;
    return textureCache.ceiling;
  }

  const size = 512;
  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext("2d")!;
  ctx.fillStyle = "#080b10";
  ctx.fillRect(0, 0, size, size);

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext("2d")!;
  hctx.fillStyle = "#555555";
  hctx.fillRect(0, 0, size, size);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d")!;
  rctx.fillStyle = "#cfcfcf";
  rctx.fillRect(0, 0, size, size);

  // Grades de ventilação e dutos no teto
  for (let i = 0; i < size; i += 32) {
    ctx.fillStyle = "#121821";
    ctx.fillRect(i, 0, 6, size);
    ctx.fillRect(0, i, size, 6);
    hctx.fillStyle = "#c4c4c4";
    hctx.fillRect(i, 0, 6, size);
    hctx.fillRect(0, i, size, 6);
    rctx.fillStyle = "#888888";
    rctx.fillRect(i, 0, 6, size);
  }

  addWeatheredGrain(ctx, hctx, rctx, size, 39);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 2.6);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 6);
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(6, 6);
  roughnessMap.anisotropy = maxAnisotropy;

  textureCache.ceiling = { map, normalMap, roughnessMap };
  return textureCache.ceiling;
}

export function buildWallPanelTexture(
  maxAnisotropy: number,
  palette: ChapterTheme = "medical"
): CachedPbrMaps {
  const existing = textureCache.walls[palette];
  if (existing) {
    existing.map.anisotropy = maxAnisotropy;
    existing.normalMap.anisotropy = maxAnisotropy;
    existing.roughnessMap.anisotropy = maxAnisotropy;
    return existing;
  }

  const spec = THEME_SPECS[palette];
  const size = 512;

  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext("2d")!;

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext("2d")!;

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d")!;

  ctx.fillStyle = spec.baseHex;
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = "#888888";
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = "#b8b8b8";
  rctx.fillRect(0, 0, size, size);

  addWeatheredGrain(ctx, hctx, rctx, size, palette.length * 13);

  // Fuligem pesada no teto e umidade escorrendo junto ao rodapé
  const soot = ctx.createLinearGradient(0, 0, 0, size);
  soot.addColorStop(0, "rgba(2, 4, 7, 0.78)");
  soot.addColorStop(0.28, "rgba(2, 4, 7, 0.16)");
  soot.addColorStop(0.74, "rgba(2, 4, 7, 0.28)");
  soot.addColorStop(1, "rgba(2, 4, 7, 0.88)");
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, size, size);

  // Rodapé metálico enferrujado
  ctx.fillStyle = spec.rustHex;
  ctx.fillRect(0, 416, size, 96);
  hctx.fillStyle = "#b8b8b8";
  hctx.fillRect(0, 416, size, 96);
  rctx.fillStyle = "#e8e8e8";
  rctx.fillRect(0, 416, size, 96);

  // Faixa de contenção do capítulo + listras industriais de advertência desgastadas
  ctx.fillStyle = spec.accentHex;
  ctx.fillRect(0, 396, size, 14);
  rctx.fillStyle = "#525252";
  rctx.fillRect(0, 396, size, 14);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 386, size, 10);
  ctx.clip();
  for (let hx = -32; hx < size + 32; hx += 24) {
    ctx.fillStyle = "rgba(245, 158, 11, 0.34)";
    ctx.beginPath();
    ctx.moveTo(hx, 386);
    ctx.lineTo(hx + 12, 386);
    ctx.lineTo(hx + 4, 396);
    ctx.lineTo(hx - 8, 396);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Painéis modulares rebaixados + calhas + rebites de aço
  ctx.strokeStyle = "#080c12";
  ctx.lineWidth = 5;
  hctx.strokeStyle = "#282828";
  hctx.lineWidth = 6;
  for (const px of [16, 268]) {
    ctx.strokeRect(px, 20, 228, 360);
    hctx.strokeRect(px, 20, 228, 360);
    // Veneziana de ventilação sutil no topo de um painel
    for (let vy = 42; vy < 90; vy += 9) {
      ctx.fillStyle = "#05070a";
      ctx.fillRect(px + 28, vy, 172, 4);
      hctx.fillStyle = "#222222";
      hctx.fillRect(px + 28, vy, 172, 4);
    }
    [px + 16, px + 206].forEach((rx) => {
      [34, 354].forEach((ry) => {
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fillRect(rx, ry, 5, 5);
        hctx.fillStyle = "#e2e2e2";
        hctx.fillRect(rx, ry, 5, 5);
      });
    });
  }

  // Escorrimentos orgânicos e sangue seco/úmido
  ctx.fillStyle = `rgba(60, 6, 9, ${spec.grimeAlpha})`;
  ctx.fillRect(370, 228, 13, 152);
  ctx.fillRect(392, 274, 8, 108);
  ctx.fillRect(114, 290, 6, 94);
  rctx.fillStyle = "#363636";
  rctx.fillRect(370, 228, 13, 152);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.repeat.set(2, 1);
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 3.2);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.repeat.set(2, 1);
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.repeat.set(2, 1);
  roughnessMap.anisotropy = maxAnisotropy;

  const bundle = { map, normalMap, roughnessMap };
  textureCache.walls[palette] = bundle;
  return bundle;
}

export function buildNewbornSkinMaps(maxAnisotropy: number): CachedPbrMaps {
  if (textureCache.newbornSkin) {
    textureCache.newbornSkin.map.anisotropy = maxAnisotropy;
    textureCache.newbornSkin.normalMap.anisotropy = maxAnisotropy;
    textureCache.newbornSkin.roughnessMap.anisotropy = maxAnisotropy;
    return textureCache.newbornSkin;
  }

  const size = 256;
  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext("2d")!;
  ctx.fillStyle = "#7a6663";
  ctx.fillRect(0, 0, size, size);

  const heightCanvas = document.createElement("canvas");
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hctx = heightCanvas.getContext("2d")!;
  hctx.fillStyle = "#808080";
  hctx.fillRect(0, 0, size, size);

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext("2d")!;
  rctx.fillStyle = "#484848"; // pele úmida e viscosa (~0.28 roughness)
  rctx.fillRect(0, 0, size, size);

  // Manchas necróticas e hematomas subcutâneos
  for (let i = 0; i < 90; i++) {
    const x = hash2d(i, 7, 99) * size;
    const y = hash2d(i, 9, 99) * size;
    const rad = 6 + hash2d(i, 11, 99) * 18;
    ctx.fillStyle = i % 3 === 0 ? "rgba(58, 14, 18, 0.34)" : "rgba(42, 34, 38, 0.25)";
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    rctx.fillStyle = i % 2 === 0 ? "#242424" : "#626262";
    rctx.beginPath();
    rctx.arc(x, y, rad * 0.8, 0, Math.PI * 2);
    rctx.fill();
  }

  // Rede de veias salientes e cicatrizes
  ctx.strokeStyle = "rgba(48, 8, 14, 0.65)";
  ctx.lineWidth = 2;
  hctx.strokeStyle = "#d0d0d0";
  hctx.lineWidth = 2.5;
  for (let v = 0; v < 18; v++) {
    const sx = hash2d(v, 1, 51) * size;
    const sy = hash2d(v, 2, 51) * size;
    const ex = sx + (hash2d(v, 3, 51) - 0.5) * 90;
    const ey = sy + (hash2d(v, 4, 51) - 0.5) * 90;
    [ctx, hctx].forEach((c) => {
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo((sx + ex) * 0.5 + 12, (sy + ey) * 0.5 - 8, ex, ey);
      c.stroke();
    });
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 2.5);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  textureCache.newbornSkin = { map, normalMap, roughnessMap };
  return textureCache.newbornSkin;
}

export function buildTricorderScreenTexture(): THREE.CanvasTexture {
  if (textureCache.tricorderScreen) {
    return textureCache.tricorderScreen;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#03131b";
  ctx.fillRect(0, 0, size, size);

  // Grade radar concêntrica
  ctx.strokeStyle = "rgba(34, 211, 238, 0.28)";
  ctx.lineWidth = 1.5;
  for (const r of [28, 56, 84]) {
    ctx.beginPath();
    ctx.arc(128, 122, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(40, 122);
  ctx.lineTo(216, 122);
  ctx.moveTo(128, 34);
  ctx.lineTo(128, 210);
  ctx.stroke();

  // Varredura sonar e ponto de eco
  ctx.fillStyle = "rgba(6, 182, 212, 0.22)";
  ctx.beginPath();
  ctx.moveTo(128, 122);
  ctx.arc(128, 122, 84, -1.1, -0.4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f43f5e";
  ctx.beginPath();
  ctx.arc(154, 72, 5, 0, Math.PI * 2);
  ctx.fill();

  // Cabeçalho + ECG
  ctx.fillStyle = "#67e8f9";
  ctx.font = "bold 14px monospace";
  ctx.fillText("BIO-SCAN V7", 14, 24);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(14, 232);
  ctx.lineTo(74, 232);
  ctx.lineTo(88, 216);
  ctx.lineTo(100, 244);
  ctx.lineTo(116, 206);
  ctx.lineTo(132, 236);
  ctx.lineTo(242, 236);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.tricorderScreen = tex;
  return tex;
}

export function buildBeamConeTexture(): THREE.CanvasTexture {
  if (textureCache.beamCone) {
    return textureCache.beamCone;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255, 244, 214, 0.35)");
  grad.addColorStop(0.35, "rgba(255, 240, 205, 0.14)");
  grad.addColorStop(1, "rgba(255, 240, 205, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.beamCone = tex;
  return tex;
}

export function buildFlashlightCookieTexture(): THREE.CanvasTexture {
  if (textureCache.flashlightCookie) {
    return textureCache.flashlightCookie;
  }

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  grad.addColorStop(0, "rgba(255, 252, 240, 1.0)");
  grad.addColorStop(0.28, "rgba(248, 240, 215, 0.92)");
  grad.addColorStop(0.56, "rgba(210, 215, 218, 0.45)");
  grad.addColorStop(0.72, "rgba(235, 232, 215, 0.62)");
  grad.addColorStop(0.86, "rgba(140, 150, 165, 0.16)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(76, 92);
  ctx.lineTo(132, 118);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.flashlightCookie = tex;
  return tex;
}

export function buildGrimyGlassTexture(): THREE.CanvasTexture {
  if (textureCache.grimyGlass) {
    return textureCache.grimyGlass;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "rgba(180, 200, 215, 0.22)";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(12, 16, 20, ${0.14 + (i % 4) * 0.08})`;
    ctx.beginPath();
    ctx.arc((i * 53) % 256, (i * 97) % 256, 8 + (i % 14), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(226, 232, 240, 0.55)";
  ctx.lineWidth = 1.4;
  const cx = 148;
  const cy = 112;
  for (let a = 0; a < 7; a++) {
    const ang = a * 0.9 + 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * 78, cy + Math.sin(ang) * 64);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.grimyGlass = tex;
  return tex;
}

export function buildCrtFaceTexture(subliminal = false): THREE.CanvasTexture {
  if (!subliminal && textureCache.cctvNormal) {
    return textureCache.cctvNormal;
  }
  if (subliminal && textureCache.cctvSubliminal) {
    return textureCache.cctvSubliminal;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = subliminal ? "#100205" : "#030508";
  ctx.fillRect(0, 0, 256, 192);

  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 192;
    const lum = (i * 31) % 60;
    ctx.fillStyle = `rgb(${lum},${lum + 4},${lum + 8})`;
    ctx.fillRect(x, y, 2, 2);
  }

  if (subliminal) {
    ctx.fillStyle = "#cbd5e1";
    ctx.beginPath();
    ctx.ellipse(128, 94, 52, 74, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#040406";
    ctx.beginPath();
    ctx.ellipse(104, 78, 17, 22, -0.1, 0, Math.PI * 2);
    ctx.ellipse(152, 78, 17, 22, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(104, 78, 4, 0, Math.PI * 2);
    ctx.arc(152, 78, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#080203";
    ctx.fillRect(102, 118, 52, 34);
    ctx.fillStyle = "#e2e8f0";
    for (let tx = 106; tx <= 148; tx += 7) {
      ctx.fillRect(tx, 118, 3, 9);
      ctx.fillRect(tx + 2, 143, 3, 9);
    }
  } else {
    ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
    ctx.beginPath();
    ctx.ellipse(128, 108, 22, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(226, 232, 240, 0.35)";
    ctx.fillRect(119, 98, 4, 4);
    ctx.fillRect(133, 98, 4, 4);
  }

  ctx.fillStyle = subliminal
    ? "rgba(239, 68, 68, 0.25)"
    : "rgba(148, 163, 184, 0.12)";
  ctx.fillRect(0, subliminal ? 52 : 84, 256, 7);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  for (let y = 0; y < 192; y += 3) {
    ctx.fillRect(0, y, 256, 1.5);
  }

  ctx.fillStyle = "#ef4444";
  ctx.fillRect(14, 14, 7, 7);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "bold 11px monospace";
  ctx.fillText("CAM-00 // REC", 26, 21);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (subliminal) {
    textureCache.cctvSubliminal = tex;
  } else {
    textureCache.cctvNormal = tex;
  }
  return tex;
}

export async function loadGlbModelOrFallback(
  key: string,
  glbUrl?: string | null,
  renderer?: THREE.WebGLRenderer
): Promise<THREE.Group | null> {
  const cached = textureCache.models.get(key);
  if (cached) {
    return cached.scene.clone(true);
  }
  if (!glbUrl) {
    return null;
  }
  try {
    const loader = configureAssetLoaders(renderer);
    const gltf = await loader.loadAsync(glbUrl);
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    textureCache.models.set(key, gltf);
    return gltf.scene.clone(true);
  } catch {
    return null;
  }
}

export function getResourceCacheSnapshot(): ResourceCacheSnapshot {
  const cachedKeys: string[] = [];
  if (textureCache.floor) {
    cachedKeys.push("floor_map", "floor_normal", "floor_roughness");
  }
  if (textureCache.ceiling) {
    cachedKeys.push("ceiling_grate_pbr");
  }
  if (textureCache.newbornSkin) {
    cachedKeys.push("newborn_skin_pbr");
  }
  (Object.keys(textureCache.walls) as ChapterTheme[]).forEach((k) => {
    cachedKeys.push(`wall_${k}_pbr`);
  });
  if (textureCache.flashlightCookie) cachedKeys.push("flashlight_fresnel");
  if (textureCache.beamCone) cachedKeys.push("beam_cone");
  if (textureCache.tricorderScreen) cachedKeys.push("tricorder_oled");
  if (textureCache.grimyGlass) cachedKeys.push("grimy_glass");
  if (textureCache.cctvNormal) cachedKeys.push("cctv_feed");
  if (textureCache.cctvSubliminal) cachedKeys.push("cctv_subliminal");
  if (sharedDracoLoader) cachedKeys.push("draco_decoder_wasm");
  if (sharedKtx2Loader) cachedKeys.push("ktx2_basis_transcoder");
  return {
    status: textureCache.status,
    progressPct: textureCache.progressPct,
    cachedKeys,
    chapterDownloads: { ...textureCache.chapterDownloads },
  };
}

let activePreloadPromise: Promise<ResourceCacheSnapshot> | null = null;

export async function preloadEssentialResources(
  onProgress?: (snap: ResourceCacheSnapshot) => void,
  maxAnisotropy = 4
): Promise<ResourceCacheSnapshot> {
  if (textureCache.status === "ready") {
    const snap = getResourceCacheSnapshot();
    onProgress?.(snap);
    return snap;
  }
  if (activePreloadPromise) {
    return activePreloadPromise;
  }

  activePreloadPromise = (async () => {
    if (typeof document === "undefined") {
      textureCache.status = "ready";
      textureCache.progressPct = 100;
      return getResourceCacheSnapshot();
    }

    textureCache.status = "preloading";
    textureCache.progressPct = 10;
    onProgress?.(getResourceCacheSnapshot());

    await yieldToMain();
    buildFloorTileTexture(maxAnisotropy);
    buildCeilingGrateTexture(maxAnisotropy);
    buildNewbornSkinMaps(maxAnisotropy);
    buildFlashlightCookieTexture();
    buildBeamConeTexture();
    buildTricorderScreenTexture();
    buildGrimyGlassTexture();
    textureCache.progressPct = 40;
    onProgress?.(getResourceCacheSnapshot());

    const themes: ChapterTheme[] = [
      "medical",
      "atrium",
      "quarters",
      "biolab",
      "engineering",
      "omega",
      "hangar",
    ];
    for (let i = 0; i < themes.length; i++) {
      await yieldToMain();
      buildWallPanelTexture(maxAnisotropy, themes[i]);
      textureCache.progressPct = 45 + Math.round(((i + 1) / themes.length) * 40);
      onProgress?.(getResourceCacheSnapshot());
    }

    await yieldToMain();
    buildCrtFaceTexture(false);
    buildCrtFaceTexture(true);
    textureCache.status = "ready";
    textureCache.progressPct = 100;
    const finalSnap = getResourceCacheSnapshot();
    onProgress?.(finalSnap);
    return finalSnap;
  })();

  try {
    return await activePreloadPromise;
  } finally {
    activePreloadPromise = null;
  }
}

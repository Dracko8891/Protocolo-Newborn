import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ChapterTheme } from "./gameLogic";

export interface CachedPbrMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface ResourceCacheSnapshot {
  status: "idle" | "preloading" | "ready";
  progressPct: number;
  cachedKeys: string[];
}

interface ThemeVisualSpec {
  baseHex: string;
  accentHex: string;
  rustHex: string;
  grimeAlpha: number;
}

const THEME_SPECS: Record<ChapterTheme, ThemeVisualSpec> = {
  medical: {
    baseHex: "#242b33",
    accentHex: "#7f1d1d",
    rustHex: "#3a2119",
    grimeAlpha: 0.42,
  },
  atrium: {
    baseHex: "#1c2836",
    accentHex: "#0369a1",
    rustHex: "#1e293b",
    grimeAlpha: 0.36,
  },
  quarters: {
    baseHex: "#2b2722",
    accentHex: "#b45309",
    rustHex: "#452312",
    grimeAlpha: 0.45,
  },
  biolab: {
    baseHex: "#1a2923",
    accentHex: "#15803d",
    rustHex: "#22301b",
    grimeAlpha: 0.5,
  },
  engineering: {
    baseHex: "#151a23",
    accentHex: "#0284c7",
    rustHex: "#2d1e17",
    grimeAlpha: 0.52,
  },
  omega: {
    baseHex: "#121318",
    accentHex: "#52525b",
    rustHex: "#271717",
    grimeAlpha: 0.38,
  },
  hangar: {
    baseHex: "#1e242b",
    accentHex: "#92400e",
    rustHex: "#3b2317",
    grimeAlpha: 0.48,
  },
};

const textureCache: {
  floor?: CachedPbrMaps;
  walls: Partial<Record<ChapterTheme, CachedPbrMaps>>;
  flashlightCookie?: THREE.CanvasTexture;
  grimyGlass?: THREE.CanvasTexture;
  cctvNormal?: THREE.CanvasTexture;
  cctvSubliminal?: THREE.CanvasTexture;
  models: Map<string, GLTF>;
  status: "idle" | "preloading" | "ready";
  progressPct: number;
} = {
  walls: {},
  models: new Map(),
  status: "idle",
  progressPct: 0,
};

let sharedGltfLoader: GLTFLoader | null = null;

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
  strength = 2.4
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

export function buildFloorTileTexture(maxAnisotropy: number): CachedPbrMaps {
  if (textureCache.floor) {
    textureCache.floor.map.anisotropy = maxAnisotropy;
    textureCache.floor.normalMap.anisotropy = maxAnisotropy;
    textureCache.floor.roughnessMap.anisotropy = maxAnisotropy;
    return textureCache.floor;
  }

  const size = 256;
  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const ctx = albedo.getContext("2d")!;
  ctx.fillStyle = "#10141a";
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
  rctx.fillStyle = "#c8c8c8"; // ~0.78 roughness padrão
  rctx.fillRect(0, 0, size, size);

  // Juntas de placas de piso metálicas enferrujadas
  ctx.strokeStyle = "#040609";
  ctx.lineWidth = 4;
  hctx.strokeStyle = "#222222";
  hctx.lineWidth = 4;
  rctx.strokeStyle = "#f0f0f0";
  rctx.lineWidth = 4;
  for (let i = 0; i <= size; i += 64) {
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

  // Rebites + textura antiderrapante nos cantos
  for (let y = 8; y < size; y += 16) {
    for (let x = 8; x < size; x += 16) {
      const dark = (x * 7 + y * 13) % 5 === 0;
      ctx.fillStyle = dark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.03)";
      ctx.fillRect(x, y, 3, 3);
      hctx.fillStyle = dark ? "#767676" : "#a8a8a8";
      hctx.fillRect(x, y, 3, 3);
    }
  }

  // Mancha escura de fluido/sangue úmido (rugosidade bem baixa para reflexo assustador)
  ctx.fillStyle = "rgba(68, 7, 11, 0.65)";
  ctx.beginPath();
  ctx.ellipse(122, 148, 34, 16, 0.4, 0, Math.PI * 2);
  ctx.fill();
  rctx.fillStyle = "#262626"; // ~0.15 roughness na poça
  rctx.beginPath();
  rctx.ellipse(122, 148, 34, 16, 0.4, 0, Math.PI * 2);
  rctx.fill();

  // Arranhões metálicos no piso
  ctx.strokeStyle = "rgba(180, 192, 208, 0.14)";
  ctx.lineWidth = 1.5;
  hctx.strokeStyle = "#363636";
  hctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    [ctx, hctx].forEach((c) => {
      c.beginPath();
      c.moveTo(42 + k * 5, 48);
      c.lineTo(80 + k * 6, 92);
      c.stroke();
    });
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 2.2);
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
  const size = 256;

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
  rctx.fillStyle = "#b8b8b8"; // metal pintado fosco ~0.72
  rctx.fillRect(0, 0, size, size);

  // Fuligem pesada no teto e rodapé úmido
  const soot = ctx.createLinearGradient(0, 0, 0, size);
  soot.addColorStop(0, "rgba(2, 4, 7, 0.72)");
  soot.addColorStop(0.28, "rgba(2, 4, 7, 0.14)");
  soot.addColorStop(0.75, "rgba(2, 4, 7, 0.25)");
  soot.addColorStop(1, "rgba(2, 4, 7, 0.86)");
  ctx.fillStyle = soot;
  ctx.fillRect(0, 0, size, size);

  // Rodapé metálico enferrujado
  ctx.fillStyle = spec.rustHex;
  ctx.fillRect(0, 208, size, 48);
  hctx.fillStyle = "#b0b0b0";
  hctx.fillRect(0, 208, size, 48);
  rctx.fillStyle = "#e6e6e6"; // ferrugem áspera ~0.9
  rctx.fillRect(0, 208, size, 48);

  // Faixa de contenção do capítulo
  ctx.fillStyle = spec.accentHex;
  ctx.fillRect(0, 198, size, 7);
  rctx.fillStyle = "#686868"; // faixa refletiva ~0.4
  rctx.fillRect(0, 198, size, 7);

  // Painéis modulares rebaixados + rebites
  ctx.strokeStyle = "#0a0e14";
  ctx.lineWidth = 3;
  hctx.strokeStyle = "#303030";
  hctx.lineWidth = 4;
  for (const px of [8, 134]) {
    ctx.strokeRect(px, 10, 114, 180);
    hctx.strokeRect(px, 10, 114, 180);
    // Rebites nos cantos
    [px + 8, px + 104].forEach((rx) => {
      [20, 178].forEach((ry) => {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(rx, ry, 3, 3);
        hctx.fillStyle = "#dcdcdc";
        hctx.fillRect(rx, ry, 3, 3);
      });
    });
  }

  // Escorrimentos de sangue / sujeira orgânica
  ctx.fillStyle = `rgba(60, 6, 9, ${spec.grimeAlpha})`;
  ctx.fillRect(185, 115, 7, 74);
  ctx.fillRect(196, 138, 4, 52);
  rctx.fillStyle = "#383838";
  rctx.fillRect(185, 115, 7, 74);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.repeat.set(2, 1);
  map.anisotropy = maxAnisotropy;

  const normalMap = buildNormalFromHeightCanvas(heightCanvas, 2.8);
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

  // Feixe Fresnel realista com núcleo quente, anel óptico e queda suave nas bordas
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  grad.addColorStop(0, "rgba(255, 252, 240, 1.0)");
  grad.addColorStop(0.28, "rgba(248, 240, 215, 0.92)");
  grad.addColorStop(0.56, "rgba(210, 215, 218, 0.45)");
  grad.addColorStop(0.72, "rgba(235, 232, 215, 0.62)"); // Anel Fresnel da lente
  grad.addColorStop(0.86, "rgba(140, 150, 165, 0.16)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Micro-arranhões e poeira na lente da lanterna
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

  // Sujeira e marcas de mão / arranhões
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(12, 16, 20, ${0.14 + (i % 4) * 0.08})`;
    ctx.beginPath();
    ctx.arc((i * 53) % 256, (i * 97) % 256, 8 + (i % 14), 0, Math.PI * 2);
    ctx.fill();
  }

  // Trincado radial no vidro blindado
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

  // Granulação pesada de CCTV
  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 192;
    const lum = (i * 31) % 60;
    ctx.fillStyle = `rgb(${lum},${lum + 4},${lum + 8})`;
    ctx.fillRect(x, y, 2, 2);
  }

  if (subliminal) {
    // Flash subliminar de rosto deformado / crânio em close-up
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
    // Feed escuro de câmera de segurança com silhueta distante
    ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
    ctx.beginPath();
    ctx.ellipse(128, 108, 22, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(226, 232, 240, 0.35)";
    ctx.fillRect(119, 98, 4, 4);
    ctx.fillRect(133, 98, 4, 4);
  }

  // Faixas de estática + carimbo CCTV REC
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

/**
 * Carregador assíncrono real de modelos `.glb` com cache em memória e fallback imediato.
 * Quando uma URL `.glb` válida é fornecida, usa `GLTFLoader`; se indisponível, retorna null para
 * acionar o modelo procedural orgânico de alta fidelidade sem gerar erros 404.
 */
export async function loadGlbModelOrFallback(
  key: string,
  glbUrl?: string | null
): Promise<THREE.Group | null> {
  const cached = textureCache.models.get(key);
  if (cached) {
    return cached.scene.clone(true);
  }
  if (!glbUrl) {
    return null;
  }
  try {
    if (!sharedGltfLoader) {
      sharedGltfLoader = new GLTFLoader();
    }
    const gltf = await sharedGltfLoader.loadAsync(glbUrl);
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
  (Object.keys(textureCache.walls) as ChapterTheme[]).forEach((k) => {
    cachedKeys.push(`wall_${k}_pbr`);
  });
  if (textureCache.flashlightCookie) cachedKeys.push("flashlight_fresnel");
  if (textureCache.grimyGlass) cachedKeys.push("grimy_glass");
  if (textureCache.cctvNormal) cachedKeys.push("cctv_feed");
  if (textureCache.cctvSubliminal) cachedKeys.push("cctv_subliminal");
  return {
    status: textureCache.status,
    progressPct: textureCache.progressPct,
    cachedKeys,
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
    buildFlashlightCookieTexture();
    buildGrimyGlassTexture();
    textureCache.progressPct = 35;
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
      textureCache.progressPct = 40 + Math.round(((i + 1) / themes.length) * 45);
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

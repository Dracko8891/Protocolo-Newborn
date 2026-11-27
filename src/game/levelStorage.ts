import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import type { ChapterId } from "./gameLogic";
import {
  ChapterDownloadProgress,
  DEFAULT_LEVELS_MANIFEST,
  GITHUB_RAW_MANIFEST_URL,
  GameLevelsManifest,
  NivelManifestEntry,
  StoredLevelRecord,
  chapterIdToLevelId,
  getEntryVersion,
  levelIdToChapterId,
  parseLevelsManifest,
} from "./manifestTypes";

interface AndroidLevelBridge {
  isPersistentStorageReady?: () => boolean;
  saveLevelZipBase64?: (levelId: string, base64Zip: string, metadataJson: string) => boolean;
  deleteLevelData?: (levelId: string) => boolean;
  getStoredLevelBytes?: (levelId: string) => number;
}

declare global {
  interface Window {
    AndroidLevelBridge?: AndroidLevelBridge;
  }
}

const DB_NAME = "vanguard7-persistent-levels";
const DB_VERSION = 1;
const STORE_NAME = "levels";
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const memoryFallbackStore = new Map<string, StoredLevelRecord>();

function getAndroidBridge(): AndroidLevelBridge | null {
  if (typeof window === "undefined") return null;
  return window.AndroidLevelBridge ?? null;
}

export function getStorageBackendLabel(): string {
  const bridge = getAndroidBridge();
  if (bridge?.isPersistentStorageReady?.()) {
    return "Diretório Persistente Android (filesDir)";
  }
  if (typeof indexedDB !== "undefined") {
    return "Armazenamento Persistente Local (IndexedDB)";
  }
  return "Memória Temporária (Sessão)";
}

export async function requestBrowserPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return Boolean(getAndroidBridge()?.isPersistentStorageReady?.());
  }
  try {
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openLevelDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function listStoredLevels(): Promise<StoredLevelRecord[]> {
  const db = await openLevelDb();
  if (!db) {
    return Array.from(memoryFallbackStore.values());
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve((req.result as StoredLevelRecord[]) ?? []);
        db.close();
      };
      req.onerror = () => {
        resolve(Array.from(memoryFallbackStore.values()));
        db.close();
      };
    } catch {
      resolve(Array.from(memoryFallbackStore.values()));
    }
  });
}

export async function getStoredLevel(
  chapterId: ChapterId
): Promise<StoredLevelRecord | null> {
  const id = chapterIdToLevelId(chapterId);
  const db = await openLevelDb();
  if (!db) {
    return memoryFallbackStore.get(id) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        resolve((req.result as StoredLevelRecord | undefined) ?? null);
        db.close();
      };
      req.onerror = () => {
        resolve(memoryFallbackStore.get(id) ?? null);
        db.close();
      };
    } catch {
      resolve(memoryFallbackStore.get(id) ?? null);
    }
  });
}

async function saveStoredLevel(
  record: StoredLevelRecord,
  rawZipBytes: Uint8Array
): Promise<void> {
  await requestBrowserPersistentStorage();
  memoryFallbackStore.set(record.id, record);

  const bridge = getAndroidBridge();
  if (bridge?.saveLevelZipBase64) {
    try {
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < rawZipBytes.length; i += chunk) {
        bin += String.fromCharCode(...rawZipBytes.subarray(i, i + chunk));
      }
      const b64 = btoa(bin);
      bridge.saveLevelZipBase64(
        record.id,
        b64,
        JSON.stringify({
          id: record.id,
          version: record.version,
          sizeBytes: record.sizeBytes,
          sha256: record.sha256,
          downloadedAt: record.downloadedAt,
        })
      );
    } catch {
      // Fallback continua salvo no IndexedDB persistente
    }
  }

  const db = await openLevelDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function deleteStoredLevel(chapterId: ChapterId): Promise<void> {
  const id = chapterIdToLevelId(chapterId);
  memoryFallbackStore.delete(id);

  const bridge = getAndroidBridge();
  if (bridge?.deleteLevelData) {
    try {
      bridge.deleteLevelData(id);
    } catch {
      // ignora erro de ponte nativa
    }
  }

  const db = await openLevelDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "";
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fetchLevelsManifest(
  preferRemote = true
): Promise<GameLevelsManifest> {
  const candidates = preferRemote
    ? ["./manifest.json", GITHUB_RAW_MANIFEST_URL]
    : ["./manifest.json"];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      return parseLevelsManifest(json);
    } catch {
      // tenta próximo candidato
    }
  }

  return DEFAULT_LEVELS_MANIFEST;
}

export async function getInitialChapterDownloadsMap(
  manifest: GameLevelsManifest
): Promise<Record<ChapterId, ChapterDownloadProgress>> {
  const stored = await listStoredLevels();
  const byId = new Map(stored.map((rec) => [rec.id, rec]));
  const bridge = getAndroidBridge();
  const map = {} as Record<ChapterId, ChapterDownloadProgress>;

  for (const entry of manifest.niveis) {
    const chId = entry.capitulo ?? levelIdToChapterId(entry.id);
    const rec = byId.get(entry.id);
    const nativeBytes = bridge?.getStoredLevelBytes?.(entry.id) ?? 0;
    const isSaved = Boolean(rec || nativeBytes > 0);
    const totalMb = Number(entry.tamanho_mb || 0);
    const savedMb = rec
      ? Number((rec.sizeBytes / (1024 * 1024)).toFixed(2))
      : nativeBytes > 0
        ? Number((nativeBytes / (1024 * 1024)).toFixed(2))
        : 0;

    map[chId] = {
      id: entry.id,
      chapterId: chId,
      nome: entry.nome,
      status: isSaved ? "downloaded" : "not_downloaded",
      progressPct: isSaved ? 100 : 0,
      downloadedMb: savedMb,
      totalMb,
      versionInstalled: rec?.version,
    };
  }

  return map;
}

async function fetchBinaryWithProgress(
  url: string,
  expectedTotalBytes: number,
  onProgress: (loadedBytes: number, totalBytes: number) => void
): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao baixar pacote (${url})`);
  }
  const headerLen = Number(res.headers.get("content-length") ?? 0);
  const totalBytes = headerLen > 0 ? headerLen : expectedTotalBytes;

  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, Math.max(totalBytes, loaded));
    }
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function downloadAndPersistChapter(
  entry: NivelManifestEntry,
  onUpdate: (progress: ChapterDownloadProgress) => void
): Promise<StoredLevelRecord> {
  const chapterId = entry.capitulo ?? levelIdToChapterId(entry.id);
  const expectedBytes = Math.max(1024, Math.round(entry.tamanho_mb * 1024 * 1024));

  onUpdate({
    id: entry.id,
    chapterId,
    nome: entry.nome,
    status: "downloading",
    progressPct: 4,
    downloadedMb: 0,
    totalMb: entry.tamanho_mb,
  });

  // Tenta URL pública do GitHub Releases; se o release ainda não estiver publicado, verifica pacote local ./levels/fase_0X.zip
  const urlsToTry = [entry.url_download, `./levels/${entry.id}.zip`].filter(Boolean);
  let zipBytes: Uint8Array | null = null;
  let lastError: Error | null = null;

  for (const candidateUrl of urlsToTry) {
    try {
      zipBytes = await fetchBinaryWithProgress(
        candidateUrl,
        expectedBytes,
        (loaded, total) => {
          const pct = Math.min(90, Math.max(5, Math.round((loaded / total) * 90)));
          onUpdate({
            id: entry.id,
            chapterId,
            nome: entry.nome,
            status: "downloading",
            progressPct: pct,
            downloadedMb: Number((loaded / (1024 * 1024)).toFixed(2)),
            totalMb: Number((total / (1024 * 1024)).toFixed(2)),
          });
        }
      );
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (!zipBytes) {
    const errMsg =
      lastError?.message ??
      "Pacote ainda não publicado no GitHub Releases (Dracko8891/Protocolo-Newborn).";
    onUpdate({
      id: entry.id,
      chapterId,
      nome: entry.nome,
      status: "error",
      progressPct: 0,
      downloadedMb: 0,
      totalMb: entry.tamanho_mb,
      error: errMsg,
    });
    throw new Error(errMsg);
  }

  onUpdate({
    id: entry.id,
    chapterId,
    nome: entry.nome,
    status: "verifying",
    progressPct: 93,
    downloadedMb: Number((zipBytes.byteLength / (1024 * 1024)).toFixed(2)),
    totalMb: Number((zipBytes.byteLength / (1024 * 1024)).toFixed(2)),
  });

  const computedHash = await computeSha256Hex(zipBytes);
  const expectedHash = entry.sha256_hash.trim().toLowerCase();
  if (
    expectedHash &&
    expectedHash !== EMPTY_SHA256 &&
    computedHash &&
    computedHash !== expectedHash
  ) {
    const hashErr = `Hash SHA-256 divergente para ${entry.id}.`;
    onUpdate({
      id: entry.id,
      chapterId,
      nome: entry.nome,
      status: "error",
      progressPct: 0,
      downloadedMb: 0,
      totalMb: entry.tamanho_mb,
      error: hashErr,
    });
    throw new Error(hashErr);
  }

  const extractedFiles = unzipSync(zipBytes);
  const record: StoredLevelRecord = {
    id: entry.id,
    chapterId,
    version: getEntryVersion(entry),
    sizeBytes: zipBytes.byteLength,
    sha256: computedHash || expectedHash,
    downloadedAt: new Date().toISOString(),
    files: extractedFiles,
  };

  await saveStoredLevel(record, zipBytes);

  const finalMb = Number((zipBytes.byteLength / (1024 * 1024)).toFixed(2));
  onUpdate({
    id: entry.id,
    chapterId,
    nome: entry.nome,
    status: "downloaded",
    progressPct: 100,
    downloadedMb: finalMb,
    totalMb: finalMb,
    versionInstalled: record.version,
  });

  return record;
}

function inferAssetMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".json")) return "application/json";
  return "model/gltf-binary";
}

export async function getChapterAssetBlobUrl(
  chapterId: ChapterId,
  fileSuffix: string
): Promise<string | null> {
  const stored = await getStoredLevel(chapterId);
  if (!stored) return null;
  const normalized = fileSuffix.replace(/^\.?\//, "").toLowerCase();
  const entry = Object.entries(stored.files).find(([name]) =>
    name.replace(/^\.?\//, "").toLowerCase().endsWith(normalized)
  );
  if (!entry) return null;
  const copy = new Uint8Array(entry[1].byteLength);
  copy.set(entry[1]);
  const blob = new Blob([copy.buffer], { type: inferAssetMimeType(entry[0]) });
  return URL.createObjectURL(blob);
}

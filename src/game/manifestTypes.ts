import type { ChapterId } from "./gameLogic";

export interface NivelManifestEntry {
  id: string;
  capitulo?: ChapterId;
  nome: string;
  "versão": string;
  versao?: string;
  tamanho_mb: number;
  url_download: string;
  sha256_hash: string;
}

export interface GameLevelsManifest {
  jogo: string;
  repositorio: string;
  versao_manifesto: string;
  atualizado_em: string;
  niveis: NivelManifestEntry[];
}

export type ChapterDownloadStatus =
  | "not_downloaded"
  | "downloading"
  | "verifying"
  | "downloaded"
  | "error";

export interface ChapterDownloadProgress {
  id: string;
  chapterId: ChapterId;
  nome: string;
  status: ChapterDownloadStatus;
  progressPct: number;
  downloadedMb: number;
  totalMb: number;
  versionInstalled?: string;
  error?: string;
}

export interface StoredLevelRecord {
  id: string;
  chapterId: ChapterId;
  version: string;
  sizeBytes: number;
  sha256: string;
  downloadedAt: string;
  files: Record<string, Uint8Array>;
}

export const GITHUB_REPO_SLUG = "Dracko8891/Protocolo-Newborn";
export const GITHUB_RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${GITHUB_REPO_SLUG}/main/manifest.json`;

export const DEFAULT_LEVELS_MANIFEST: GameLevelsManifest = {
  jogo: "Protocolo Newborn",
  repositorio: GITHUB_REPO_SLUG,
  versao_manifesto: "1.0.0",
  atualizado_em: "2026-11-27T00:00:00Z",
  niveis: [
    {
      id: "fase_01",
      capitulo: 1,
      nome: "Cap. 1 · Ala Médica (Quarentena)",
      "versão": "1.0.0",
      tamanho_mb: 8.4,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_01.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_02",
      capitulo: 2,
      nome: "Cap. 2 · Átrio Azul Frio",
      "versão": "1.0.0",
      tamanho_mb: 11.2,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_02.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_03",
      capitulo: 3,
      nome: "Cap. 3 · Alojamentos da Equipe",
      "versão": "1.0.0",
      tamanho_mb: 10.6,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_03.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_04",
      capitulo: 4,
      nome: "Cap. 4 · Bio-Tanques (Câmara 00)",
      "versão": "1.0.0",
      tamanho_mb: 14.8,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_04.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_05",
      capitulo: 5,
      nome: "Cap. 5 · Engenharia & Núcleo Azul",
      "versão": "1.0.0",
      tamanho_mb: 15.3,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_05.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_06",
      capitulo: 6,
      nome: "Cap. 6 · Bloco Ômega (Titânio Negro)",
      "versão": "1.0.0",
      tamanho_mb: 13.7,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_06.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
      id: "fase_07",
      capitulo: 7,
      nome: "Cap. 7 · Hangar de Carga & Exterior",
      "versão": "1.0.0",
      tamanho_mb: 18.5,
      url_download: `https://github.com/${GITHUB_REPO_SLUG}/releases/download/levels-v1.0.0/fase_07.zip`,
      sha256_hash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  ],
};

export function getEntryVersion(entry: NivelManifestEntry): string {
  return entry["versão"] ?? entry.versao ?? "1.0.0";
}

export function chapterIdToLevelId(chapterId: ChapterId): string {
  return `fase_0${chapterId}`;
}

export function levelIdToChapterId(id: string): ChapterId {
  const match = /(\d+)/.exec(id);
  const num = match ? Number(match[1]) : 1;
  return (num >= 1 && num <= 7 ? num : 1) as ChapterId;
}

export function parseLevelsManifest(raw: unknown): GameLevelsManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Manifesto inválido: objeto JSON esperado.");
  }
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.niveis) ? obj.niveis : [];
  if (list.length === 0) {
    throw new Error("Manifesto sem lista de níveis.");
  }

  const niveis: NivelManifestEntry[] = list.map((item, idx) => {
    const rec = (item ?? {}) as Record<string, unknown>;
    const id = String(rec.id ?? `fase_0${idx + 1}`);
    const versaoStr = String(rec["versão"] ?? rec.versao ?? "1.0.0");
    return {
      id,
      capitulo: levelIdToChapterId(id),
      nome: String(rec.nome ?? `Capítulo ${idx + 1}`),
      "versão": versaoStr,
      tamanho_mb: Number(rec.tamanho_mb ?? 0),
      url_download: String(rec.url_download ?? ""),
      sha256_hash: String(rec.sha256_hash ?? ""),
    };
  });

  return {
    jogo: String(obj.jogo ?? "Protocolo Newborn"),
    repositorio: String(obj.repositorio ?? GITHUB_REPO_SLUG),
    versao_manifesto: String(obj.versao_manifesto ?? "1.0.0"),
    atualizado_em: String(obj.atualizado_em ?? new Date().toISOString()),
    niveis,
  };
}

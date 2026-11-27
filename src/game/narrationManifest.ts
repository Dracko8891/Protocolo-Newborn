export type NarrationEmotion = "calmo" | "tenso" | "medo" | "ofegante" | "panico";

export type NarrationScope = "base" | "chapter" | "shared";

export type SubtitleSize = "pequeno" | "medio" | "grande";

export interface NarrationSettings {
  narrationVolume: number; // 0..1
  subtitlesEnabled: boolean;
  subtitleSize: SubtitleSize;
  ttsFallbackEnabled: boolean;
}

export interface NarrationCue {
  id: string;
  scope: NarrationScope;
  chapterId?: number;
  emotion: NarrationEmotion;
  priority: number; // 1 (calmo) .. 5 (panico)
  exaggeration: number; // Chatterbox Multilingual intensity (0.25 .. 1.0)
  cfgWeight: number; // Chatterbox CFG weight (0.2 .. 0.8)
  cooldownMs: number;
  durationHintMs: number;
  audioPath: string;
  text: string;
}

export interface NarrationManifest {
  versao: string;
  idioma: "pt-BR";
  personagem: string;
  availableBaseAudio: string[];
  cues: NarrationCue[];
}

export interface ActiveSubtitle {
  cueId: string;
  text: string;
  emotion: NarrationEmotion;
  priority: number;
  startedAt: number;
  durationMs: number;
  usedAudio: boolean;
}

export const DEFAULT_NARRATION_SETTINGS: NarrationSettings = {
  narrationVolume: 0.9,
  subtitlesEnabled: true,
  subtitleSize: "medio",
  ttsFallbackEnabled: false,
};

export function computeSubtitleDurationMs(
  text: string,
  durationHintMs?: number
): number {
  if (durationHintMs && durationHintMs >= 1600) {
    return durationHintMs;
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2400, Math.min(8500, 1400 + words * 280));
}

export function shouldPreemptCue(
  active: Pick<ActiveSubtitle, "priority" | "cueId"> | null,
  incoming: Pick<NarrationCue, "priority" | "id">
): boolean {
  if (!active) return true;
  if (incoming.priority > active.priority) return true;
  if (incoming.priority === active.priority && incoming.id !== active.cueId) {
    return incoming.priority >= 4;
  }
  return false;
}

export function resolveCueAudioCandidates(cue: NarrationCue): string[] {
  const base = cue.audioPath.replace(/^\.?\//, "");
  const mp3Variant = base.replace(/\.ogg$/i, ".mp3");
  return base === mp3Variant ? [base] : [base, mp3Variant];
}

export function parseNarrationManifest(raw: unknown): NarrationManifest {
  if (!raw || typeof raw !== "object") {
    return {
      versao: "1.0.0",
      idioma: "pt-BR",
      personagem: "Arthur Vance",
      availableBaseAudio: [],
      cues: [],
    };
  }
  const obj = raw as Record<string, unknown>;
  const rawCues = Array.isArray(obj.cues) ? obj.cues : [];
  const availableBaseAudio = Array.isArray(obj.availableBaseAudio)
    ? obj.availableBaseAudio.map((s) => String(s))
    : [];
  const cues: NarrationCue[] = rawCues
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item): NarrationCue => {
      const scope: NarrationScope =
        item.scope === "base" || item.scope === "chapter" || item.scope === "shared"
          ? item.scope
          : "shared";
      const emotion: NarrationEmotion =
        item.emotion === "calmo" ||
        item.emotion === "tenso" ||
        item.emotion === "medo" ||
        item.emotion === "ofegante" ||
        item.emotion === "panico"
          ? item.emotion
          : "tenso";
      return {
        id: String(item.id ?? ""),
        scope,
        chapterId: typeof item.chapterId === "number" ? item.chapterId : undefined,
        emotion,
        priority: typeof item.priority === "number" ? item.priority : 2,
        exaggeration: typeof item.exaggeration === "number" ? item.exaggeration : 0.65,
        cfgWeight: typeof item.cfgWeight === "number" ? item.cfgWeight : 0.45,
        cooldownMs: typeof item.cooldownMs === "number" ? item.cooldownMs : 8000,
        durationHintMs:
          typeof item.durationHintMs === "number" ? item.durationHintMs : 3600,
        audioPath: String(item.audioPath ?? ""),
        text: String(item.text ?? ""),
      };
    })
    .filter((c) => c.id.length > 0 && c.text.length > 0);

  return {
    versao: String(obj.versao ?? "1.0.0"),
    idioma: "pt-BR",
    personagem: String(obj.personagem ?? "Arthur Vance"),
    availableBaseAudio,
    cues,
  };
}

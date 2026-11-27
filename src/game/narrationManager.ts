import type { ChapterId } from "./gameLogic";
import { getChapterAssetBlobUrl } from "./levelStorage";
import {
  ActiveSubtitle,
  DEFAULT_NARRATION_SETTINGS,
  NarrationCue,
  NarrationManifest,
  NarrationSettings,
  computeSubtitleDurationMs,
  parseNarrationManifest,
  resolveCueAudioCandidates,
  shouldPreemptCue,
} from "./narrationManifest";
import type { SoundEngine } from "./soundEngine";

export interface TriggerNarrationOptions {
  chapterId?: ChapterId;
  force?: boolean;
  customText?: string;
}

type SubtitleListener = (subtitle: ActiveSubtitle | null) => void;

export class NarrationManager {
  private manifest: NarrationManifest = {
    versao: "1.0.0",
    idioma: "pt-BR",
    personagem: "Arthur Vance",
    availableBaseAudio: [],
    cues: [],
  };
  private cueMap = new Map<string, NarrationCue>();
  private settings: NarrationSettings = { ...DEFAULT_NARRATION_SETTINGS };
  private activeSubtitle: ActiveSubtitle | null = null;
  private queue: Array<{ cue: NarrationCue; opts?: TriggerNarrationOptions }> = [];
  private lastPlayedAt = new Map<string, number>();
  private listeners = new Set<SubtitleListener>();
  private soundEngine: SoundEngine | null = null;
  private muted = false;

  private activeAudio: HTMLAudioElement | null = null;
  private activeBlobUrl: string | null = null;
  private activeTimerId: number | null = null;
  private manifestLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  constructor(soundEngine?: SoundEngine) {
    this.soundEngine = soundEngine ?? null;
  }

  public attachSoundEngine(soundEngine: SoundEngine) {
    this.soundEngine = soundEngine;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.activeAudio) {
      this.activeAudio.volume = muted ? 0 : this.settings.narrationVolume;
    }
    if (muted && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignora
      }
    }
  }

  public getSettings(): NarrationSettings {
    return { ...this.settings };
  }

  public setSettings(next: Partial<NarrationSettings>) {
    this.settings = { ...this.settings, ...next };
    if (this.activeAudio) {
      this.activeAudio.volume = this.muted ? 0 : this.settings.narrationVolume;
    }
    if (!this.settings.subtitlesEnabled) {
      this.emit();
    }
  }

  public loadManifestObject(raw: unknown) {
    this.manifest = parseNarrationManifest(raw);
    this.cueMap.clear();
    for (const cue of this.manifest.cues) {
      this.cueMap.set(cue.id, cue);
    }
    this.manifestLoaded = true;
  }

  public async ensureManifestLoaded(): Promise<void> {
    if (this.manifestLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;
    if (typeof fetch !== "function") return;

    this.loadingPromise = (async () => {
      try {
        for (const url of ["./data/narration_manifest.json", "./narration_manifest.json"]) {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            this.loadManifestObject(data);
            break;
          }
        }
      } catch {
        // Fallback silencioso sem manifest remoto
      } finally {
        this.loadingPromise = null;
      }
    })();

    return this.loadingPromise;
  }

  public subscribe(listener: SubtitleListener): () => void {
    this.listeners.add(listener);
    listener(this.activeSubtitle);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getActiveSubtitle(): ActiveSubtitle | null {
    return this.activeSubtitle;
  }

  public getCue(cueId: string): NarrationCue | undefined {
    return this.cueMap.get(cueId);
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.activeSubtitle);
    }
  }

  private stopPlaybackOnly() {
    if (this.activeTimerId !== null && typeof window !== "undefined") {
      window.clearTimeout(this.activeTimerId);
      this.activeTimerId = null;
    }
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.src = "";
      } catch {
        // Ignora
      }
      this.activeAudio = null;
    }
    if (this.activeBlobUrl) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch {
        // Ignora
      }
      this.activeBlobUrl = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignora
      }
    }
    this.soundEngine?.setNarrationDucking(false);
  }

  public clear() {
    this.queue = [];
    this.stopPlaybackOnly();
    this.activeSubtitle = null;
    this.emit();
  }

  public async trigger(
    cueId: string,
    opts?: TriggerNarrationOptions
  ): Promise<boolean> {
    await this.ensureManifestLoaded();
    const baseCue = this.cueMap.get(cueId);
    if (!baseCue) return false;

    const cue: NarrationCue = opts?.customText
      ? { ...baseCue, text: opts.customText }
      : baseCue;

    const now = Date.now();
    const lastAt = this.lastPlayedAt.get(cue.id) ?? 0;
    if (!opts?.force && now - lastAt < cue.cooldownMs) {
      return false;
    }

    if (this.activeSubtitle) {
      if (shouldPreemptCue(this.activeSubtitle, cue)) {
        this.stopPlaybackOnly();
        this.activeSubtitle = null;
      } else {
        // Enfileira se ainda não estiver na fila e prioridade >= 2
        if (
          cue.priority >= 2 &&
          !this.queue.some((q) => q.cue.id === cue.id) &&
          this.queue.length < 3
        ) {
          this.queue.push({ cue, opts });
        }
        return true;
      }
    }

    await this.playCueNow(cue, opts);
    return true;
  }

  private async resolvePlayableUrl(
    cue: NarrationCue,
    chapterId?: ChapterId
  ): Promise<{ url: string; isBlob: boolean } | null> {
    const candidates = resolveCueAudioCandidates(cue);

    // 1) Se capítulo foi baixado localmente, procura no pacote offline (IndexedDB) sem rede
    if (chapterId && cue.scope !== "base") {
      for (const candidate of candidates) {
        const blobUrl = await getChapterAssetBlobUrl(chapterId, candidate);
        if (blobUrl) {
          return { url: blobUrl, isBlob: true };
        }
      }
    }

    // 2) Se o manifesto declara arquivos base já incluídos no APK/public, toca sem risco de 404
    const availableSet = new Set(
      this.manifest.availableBaseAudio.map((p) => p.replace(/^\.?\//, "").toLowerCase())
    );
    for (const candidate of candidates) {
      if (availableSet.has(candidate.toLowerCase())) {
        return { url: `./${candidate}`, isBlob: false };
      }
    }

    return null;
  }

  private finishActiveCue(expectedCueId: string) {
    if (this.activeSubtitle?.cueId !== expectedCueId) return;
    this.stopPlaybackOnly();
    this.activeSubtitle = null;
    this.emit();

    const next = this.queue.shift();
    if (next) {
      void this.playCueNow(next.cue, next.opts);
    }
  }

  private async playCueNow(cue: NarrationCue, opts?: TriggerNarrationOptions) {
    this.lastPlayedAt.set(cue.id, Date.now());
    const durationMs = computeSubtitleDurationMs(cue.text, cue.durationHintMs);
    let usedAudio = false;

    const resolved = await this.resolvePlayableUrl(cue, opts?.chapterId);

    if (
      resolved &&
      typeof Audio !== "undefined" &&
      !this.muted &&
      this.settings.narrationVolume > 0.01
    ) {
      try {
        const audio = new Audio(resolved.url);
        audio.volume = Math.max(0, Math.min(1, this.settings.narrationVolume));
        this.activeAudio = audio;
        this.activeBlobUrl = resolved.isBlob ? resolved.url : null;
        audio.onended = () => this.finishActiveCue(cue.id);
        audio.onerror = () => {
          // fallback silencioso se arquivo falhar ao decodificar
        };
        await audio.play();
        usedAudio = true;
      } catch {
        usedAudio = false;
      }
    } else if (
      !resolved &&
      this.settings.ttsFallbackEnabled &&
      !this.muted &&
      this.settings.narrationVolume > 0.01 &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    ) {
      try {
        const utter = new SpeechSynthesisUtterance(cue.text);
        utter.lang = "pt-BR";
        utter.volume = Math.max(0, Math.min(1, this.settings.narrationVolume));
        utter.rate = cue.emotion === "panico" || cue.emotion === "ofegante" ? 1.14 : 0.94;
        utter.pitch = cue.emotion === "panico" ? 1.08 : 0.9;
        utter.onend = () => this.finishActiveCue(cue.id);
        window.speechSynthesis.speak(utter);
        usedAudio = true;
      } catch {
        usedAudio = false;
      }
    }

    this.soundEngine?.setNarrationDucking(true);

    this.activeSubtitle = {
      cueId: cue.id,
      text: cue.text,
      emotion: cue.emotion,
      priority: cue.priority,
      startedAt: Date.now(),
      durationMs,
      usedAudio,
    };
    this.emit();

    if (typeof window !== "undefined") {
      this.activeTimerId = window.setTimeout(() => {
        this.finishActiveCue(cue.id);
      }, durationMs);
    }
  }
}

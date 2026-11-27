import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cpu,
  CloudDownload,
  Film,
  Flashlight,
  Footprints,
  Hand,
  HardDrive,
  HeartPulse,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  Tablet,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from "lucide-react";
import { AiStudioModal } from "./components/AiStudioModal";
import { BadgeInspectModal } from "./components/BadgeInspectModal";
import { CreditsModal } from "./components/CreditsModal";
import { DataManagerModal } from "./components/DataManagerModal";
import { KeypadModal } from "./components/KeypadModal";
import { NarrationSubtitle } from "./components/NarrationSubtitle";
import { PaddModal, PaddTab } from "./components/PaddModal";
import { RelayPuzzleModal } from "./components/RelayPuzzleModal";
import {
  GameActionEvent,
  LiveTelemetry,
  VanguardCanvas,
} from "./components/VanguardCanvas";
import {
  CHAPTER_CONFIGS,
  ChapterId,
  ControlMode,
  GamePhase,
  HealthState,
  InventoryItem,
  PHYSICS_PARAMS,
  RelayState,
  addItemToInventory,
  computeExponentialHeartbeatPulse,
  computeHeartbeatIntervalMs,
  resolveTouchControlsActive,
} from "./game/gameLogic";
import {
  deleteStoredLevel,
  downloadAndPersistChapter,
  fetchLevelsManifest,
  getInitialChapterDownloadsMap,
  getStorageBackendLabel,
} from "./game/levelStorage";
import {
  DEFAULT_LEVELS_MANIFEST,
  GameLevelsManifest,
  chapterIdToLevelId,
  levelIdToChapterId,
} from "./game/manifestTypes";
import { NarrationManager } from "./game/narrationManager";
import {
  ActiveSubtitle,
  DEFAULT_NARRATION_SETTINGS,
  NarrationSettings,
} from "./game/narrationManifest";
import { panicLogger } from "./game/panicLogger";
import {
  ResourceCacheSnapshot,
  preloadEssentialResources,
  setAllChapterDownloadsSnapshot,
  subscribeResourceCache,
  updateChapterDownloadSnapshot,
} from "./game/resourceCache";
import { SoundEngine } from "./game/soundEngine";

const INITIAL_TELEMETRY: LiveTelemetry = {
  batterySec: PHYSICS_PARAMS.maxBatterySec,
  breathSec: PHYSICS_PARAMS.maxBreathSec,
  noiseM: 0,
  playerX: 0,
  playerZ: -4.2,
  playerYaw: 0,
  newbornX: -1.6,
  newbornZ: 2.4,
  newbornState: "Observe",
  newbornDist: 6.8,
  flashlightOn: true,
  tricorderOn: false,
  crouching: true,
  sprinting: false,
  hidingInLocker: false,
  holdingBreath: false,
  pumpingDynamo: false,
  nearbyId: null,
  nearbyLabel: null,
  proximityGlitch: 0,
  panicPct: 8,
  heartRateBpm: 72,
  radialBlurStrength: 0,
};

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export default function App() {
  const autostart = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("autostart") === "1";
  }, []);

  const initialChapterId = useMemo<ChapterId>(() => {
    if (typeof window === "undefined") return 1;
    const raw = Number(new URLSearchParams(window.location.search).get("chapter"));
    return raw >= 1 && raw <= 7 && Number.isInteger(raw) ? (raw as ChapterId) : 1;
  }, []);

  const soundEngine = useMemo(() => new SoundEngine(), []);
  const narrationManager = useMemo(
    () => new NarrationManager(soundEngine),
    [soundEngine]
  );
  const mobileInputRef = useRef({
    moveX: 0,
    moveY: 0,
    lookX: 0,
    lookY: 0,
    holdBreath: false,
    sprint: false,
    dynamo: false,
    touchSensitivity: 1.0,
  });
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const newbornDistRef = useRef<number>(6.8);

  const [chapterId, setChapterId] = useState<ChapterId>(initialChapterId);
  const chapterIdRef = useRef<ChapterId>(initialChapterId);
  const activeChapter = CHAPTER_CONFIGS[chapterId];

  const [phase, setPhase] = useState<GamePhase>(autostart ? "playing" : "title");
  const [health, setHealth] = useState<HealthState>("verde");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [hasKitPickup, setHasKitPickup] = useState(false);
  const [hasBadgePickup, setHasBadgePickup] = useState(false);
  const [pinDiscovered, setPinDiscovered] = useState(false);
  const [relayState, setRelayState] = useState<RelayState>({
    pin2Color: "none",
    pin4Color: "none",
    solved: false,
  });
  const [doorUnlocked, setDoorUnlocked] = useState(false);

  const [telemetry, setTelemetry] = useState<LiveTelemetry>(INITIAL_TELEMETRY);
  const [muted, setMuted] = useState(false);
  const [photosensitiveMode, setPhotosensitiveMode] = useState(false);
  const [controlMode, setControlMode] = useState<ControlMode>(() => {
    if (typeof window === "undefined") return "auto";
    try {
      const savedMode = localStorage.getItem("vanguard7.controlMode");
      if (savedMode === "auto" || savedMode === "touch" || savedMode === "keyboard") {
        return savedMode;
      }
      const legacy = localStorage.getItem("vanguard7.touchEnabled");
      if (legacy === "1") return "touch";
      if (legacy === "0") return "keyboard";
    } catch {
      // ignora restrições de armazenamento
    }
    return "auto";
  });
  const touchControlsEnabled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return resolveTouchControlsActive(controlMode, {
      forceQueryParam:
        new URLSearchParams(window.location.search).get("touch") === "1",
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
      pointerCoarse:
        window.matchMedia?.("(pointer: coarse)").matches ?? false,
      anyPointerCoarse:
        window.matchMedia?.("(any-pointer: coarse)").matches ?? false,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      hasOnTouchStart: "ontouchstart" in window,
    });
  }, [controlMode]);
  const [touchSensitivity, setTouchSensitivity] = useState(() => {
    if (typeof window === "undefined") return 1.0;
    const saved = Number(localStorage.getItem("vanguard7.touchSensitivity"));
    return Number.isFinite(saved) && saved >= 0.5 && saved <= 1.8 ? saved : 1.0;
  });
  const [activeTouchBtn, setActiveTouchBtn] = useState<string | null>(null);
  const [cacheSnapshot, setCacheSnapshot] = useState<ResourceCacheSnapshot>({
    status: "idle",
    progressPct: 0,
    cachedKeys: [],
    chapterDownloads: {},
  });
  const [levelsManifest, setLevelsManifest] = useState<GameLevelsManifest>(
    DEFAULT_LEVELS_MANIFEST
  );

  const [paddOpen, setPaddOpen] = useState(false);
  const [paddTab, setPaddTab] = useState<PaddTab>("inventario");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<ActiveSubtitle | null>(null);
  const [narrationSettings, setNarrationSettings] = useState<NarrationSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_NARRATION_SETTINGS;
    try {
      const raw = localStorage.getItem("vanguard7.narrationSettings");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NarrationSettings>;
        return { ...DEFAULT_NARRATION_SETTINGS, ...parsed };
      }
    } catch {
      // ignora
    }
    return DEFAULT_NARRATION_SETTINGS;
  });

  const [toast, setToast] = useState<string | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const [runSeconds, setRunSeconds] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  const telemetryRef = useRef<LiveTelemetry>(INITIAL_TELEMETRY);
  const kitsCount = useMemo(
    () => inventory.find((it) => it.id === "kit_estanca")?.quantity ?? 0,
    [inventory]
  );

  const pausedByModal =
    paddOpen ||
    inspectOpen ||
    relayOpen ||
    keypadOpen ||
    studioOpen ||
    creditsOpen ||
    dataManagerOpen;

  const handleTelemetry = useCallback((t: LiveTelemetry) => {
    newbornDistRef.current = t.newbornDist;
    telemetryRef.current = t;
    setTelemetry(t);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Pré-carregamento assíncrono de texturas + sincronização do manifesto, narração e pacotes persistentes
  useEffect(() => {
    const unsub = subscribeResourceCache(setCacheSnapshot);
    const unsubNarration = narrationManager.subscribe(setActiveSubtitle);
    void narrationManager.ensureManifestLoaded();
    void preloadEssentialResources(setCacheSnapshot);
    void fetchLevelsManifest(false).then(async (manifest) => {
      setLevelsManifest(manifest);
      const initialMap = await getInitialChapterDownloadsMap(manifest);
      setAllChapterDownloadsSnapshot(initialMap);
    });
    return () => {
      unsub();
      unsubNarration();
    };
  }, [narrationManager]);

  // Sincroniza configurações de narração e mudo
  useEffect(() => {
    narrationManager.setMuted(muted);
    narrationManager.setSettings(narrationSettings);
    try {
      localStorage.setItem(
        "vanguard7.narrationSettings",
        JSON.stringify(narrationSettings)
      );
    } catch {
      // ignora restrições de armazenamento
    }
  }, [muted, narrationSettings, narrationManager]);

  // Salva preferências dos controles em localStorage e atualiza ref de sensibilidade
  useEffect(() => {
    mobileInputRef.current.touchSensitivity = touchSensitivity;
    try {
      localStorage.setItem("vanguard7.controlMode", controlMode);
      localStorage.setItem(
        "vanguard7.touchEnabled",
        touchControlsEnabled ? "1" : "0"
      );
      localStorage.setItem(
        "vanguard7.touchSensitivity",
        String(touchSensitivity)
      );
    } catch {
      // ignora restrições de armazenamento
    }
  }, [controlMode, touchControlsEnabled, touchSensitivity]);

  // Sincroniza dataset.state para verificação automática e acessibilidade
  useEffect(() => {
    const mapped =
      phase === "victory" || phase === "gameover"
        ? "gameover"
        : phase === "paused"
          ? "paused"
          : phase === "playing"
            ? "playing"
            : "title";
    document.body.dataset.state = mapped;
  }, [phase]);

  // Cronômetro de partida
  useEffect(() => {
    if (phase !== "playing" || pausedByModal) return;
    const id = window.setInterval(() => {
      setRunSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, pausedByModal]);

  // Zera controles touch ao sair do gameplay ou abrir modais
  useEffect(() => {
    if (phase !== "playing" || pausedByModal) {
      mobileInputRef.current.moveX = 0;
      mobileInputRef.current.moveY = 0;
      mobileInputRef.current.lookX = 0;
      mobileInputRef.current.lookY = 0;
      mobileInputRef.current.holdBreath = false;
      mobileInputRef.current.sprint = false;
      mobileInputRef.current.dynamo = false;
      joystickPointerId.current = null;
      setJoystickKnob({ x: 0, y: 0 });
    }
  }, [phase, pausedByModal]);

  // Pulso exponencial contínuo da vinheta de dano sincronizado com batimento cardíaco em "vermelho"
  useEffect(() => {
    if (phase !== "playing" || pausedByModal || health !== "vermelho") {
      if (vignetteRef.current) {
        vignetteRef.current.style.boxShadow = "";
      }
      return;
    }
    let cancelled = false;
    let rafId = 0;
    let lastBeatAt = performance.now();
    let beatIntervalMs = computeHeartbeatIntervalMs(newbornDistRef.current);

    const triggerBeat = (now: number) => {
      const dist = newbornDistRef.current;
      const intensity = Math.max(0.35, Math.min(1.0, (14 - dist) / 12));
      soundEngine.playHeartbeat(intensity);
      beatIntervalMs = computeHeartbeatIntervalMs(dist);
      lastBeatAt = now;

      const cur = telemetryRef.current;
      panicLogger.log(
        {
          event: "heartbeat_spike",
          detail: `Pulso cardíaco exponencial (intervalo ${beatIntervalMs}ms)`,
          panicPct: cur.panicPct,
          heartRateBpm: cur.heartRateBpm,
          newbornDistM: dist,
          newbornState: cur.newbornState,
          health: "vermelho",
          resources: {
            batteryPct: Math.round((cur.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100),
            flashlightOn: cur.flashlightOn,
            tricorderOn: cur.tricorderOn,
            hidingInLocker: cur.hidingInLocker,
            kitsRemaining: kitsCount,
          },
        },
        false
      );
    };

    triggerBeat(lastBeatAt);

    const stepVignette = (now: number) => {
      if (cancelled) return;
      const elapsed = now - lastBeatAt;
      if (elapsed >= beatIntervalMs) {
        triggerBeat(now);
      }

      const el = vignetteRef.current;
      if (el) {
        if (photosensitiveMode) {
          el.style.boxShadow = "inset 0 0 110px rgba(185, 28, 28, 0.55)";
        } else {
          const dist = newbornDistRef.current;
          const panicNorm = Math.max(0, Math.min(1, telemetryRef.current.panicPct / 100));
          const proxExp = 1 - Math.exp(-Math.max(0, 14 - dist) * 0.24);
          const urgency = Math.max(0.25, Math.min(1, proxExp * 0.58 + panicNorm * 0.42));
          const ease = computeExponentialHeartbeatPulse(
            now - lastBeatAt,
            beatIntervalMs,
            urgency
          );
          const spread = Math.round(90 + ease * (82 + urgency * 34));
          const outerAlpha = (0.3 + ease * (0.44 + urgency * 0.16)).toFixed(3);
          const innerSpread = Math.round(22 + ease * 38);
          const innerAlpha = (0.2 + ease * 0.44).toFixed(3);
          el.style.boxShadow = `inset 0 0 ${spread}px rgba(220, 38, 38, ${outerAlpha}), inset 0 0 ${innerSpread}px rgba(127, 29, 29, ${innerAlpha})`;
        }
      }
      rafId = window.requestAnimationFrame(stepVignette);
    };

    rafId = window.requestAnimationFrame(stepVignette);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      if (vignetteRef.current) {
        vignetteRef.current.style.boxShadow = "";
      }
    };
  }, [phase, pausedByModal, health, photosensitiveMode, soundEngine, kitsCount]);

  // Sons ambientais aleatórios de "distress" em baixa frequência durante gameplay
  useEffect(() => {
    if (phase !== "playing" || pausedByModal) return;
    let cancelled = false;
    let timerId = 0;

    const scheduleDistress = () => {
      if (cancelled) return;
      const delayMs = 7000 + Math.random() * 8000;
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        soundEngine.playDistressAmbient();
        void narrationManager.trigger("ambient_distress", {
          chapterId: chapterIdRef.current,
        });
        scheduleDistress();
      }, delayMs);
    };

    scheduleDistress();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [phase, pausedByModal, soundEngine, narrationManager]);

  // Narração do Prólogo na Tela Título
  useEffect(() => {
    if (phase !== "title" || pausedByModal) return;
    const id = window.setTimeout(() => {
      void narrationManager.trigger("title_prologue", {
        chapterId: chapterIdRef.current,
      });
    }, 450);
    return () => window.clearTimeout(id);
  }, [phase, pausedByModal, narrationManager]);

  // Transição automática da cena inicial de flashback para gameplay + narração de entrada da fase
  useEffect(() => {
    if (phase !== "intro") return;
    void narrationManager.trigger("intro_flashback_base", {
      chapterId: chapterIdRef.current,
      force: true,
    });
    const id = window.setTimeout(() => {
      setPhase("playing");
      showToast(`${activeChapter.subtitle} · Fique agachado e evite fazer ruído.`);
      void narrationManager.trigger(`chapter_0${chapterIdRef.current}_intro`, {
        chapterId: chapterIdRef.current,
        force: true,
      });
    }, 2400);
    return () => window.clearTimeout(id);
  }, [phase, activeChapter.subtitle, showToast, narrationManager]);

  // Dispara narração de introdução ao iniciar direto no playing (ex.: ?autostart=1)
  const initialChapterIntroFiredRef = useRef(false);
  useEffect(() => {
    if (phase === "playing" && !initialChapterIntroFiredRef.current) {
      initialChapterIntroFiredRef.current = true;
      void narrationManager.trigger(`chapter_0${chapterIdRef.current}_intro`, {
        chapterId: chapterIdRef.current,
      });
    }
  }, [phase, narrationManager]);

  // Detectar travessia da comporta aberta para vitória
  useEffect(() => {
    if (
      phase === "playing" &&
      doorUnlocked &&
      telemetry.playerZ >= 12.5 &&
      Math.abs(telemetry.playerX) < 1.8
    ) {
      soundEngine.playVictoryChord();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setPhase("victory");
      void narrationManager.trigger(`chapter_0${chapterIdRef.current}_victory`, {
        chapterId: chapterIdRef.current,
        force: true,
      });
    }
  }, [phase, doorUnlocked, telemetry.playerX, telemetry.playerZ, soundEngine, narrationManager]);

  const startFreshRun = useCallback(
    (skipIntro = false, nextChapterId?: ChapterId) => {
      const targetId = nextChapterId ?? chapterIdRef.current;
      const targetChapter = CHAPTER_CONFIGS[targetId];
      soundEngine.startAmbientHum();
      soundEngine.playClick(640);
      chapterIdRef.current = targetId;
      setChapterId(targetId);
      setHealth("verde");
      setInventory([]);
      setHasKitPickup(false);
      setHasBadgePickup(false);
      setPinDiscovered(false);
      setRelayState({ pin2Color: "none", pin4Color: "none", solved: false });
      setDoorUnlocked(false);
      setPaddOpen(false);
      setInspectOpen(false);
      setRelayOpen(false);
      setKeypadOpen(false);
      setStudioOpen(false);
      setCreditsOpen(false);
      setRunSeconds(0);
      setTelemetry({
        ...INITIAL_TELEMETRY,
        playerX: targetChapter.spawn.x,
        playerZ: targetChapter.spawn.z,
        playerYaw: targetChapter.spawn.yaw,
      });
      setResetSignal((n) => n + 1);
      setPhase(skipIntro ? "playing" : "intro");
      if (skipIntro) {
        initialChapterIntroFiredRef.current = true;
        void narrationManager.trigger(`chapter_0${targetId}_intro`, {
          chapterId: targetId,
          force: true,
        });
      }
    },
    [soundEngine, narrationManager]
  );

  const handleRefreshManifest = useCallback(async () => {
    const manifest = await fetchLevelsManifest(true);
    setLevelsManifest(manifest);
    const map = await getInitialChapterDownloadsMap(manifest);
    setAllChapterDownloadsSnapshot(map);
    showToast("Manifesto de fases atualizado.");
  }, [showToast]);

  const handleDownloadChapter = useCallback(
    async (targetChapterId: ChapterId) => {
      const entry =
        levelsManifest.niveis.find(
          (n) => (n.capitulo ?? levelIdToChapterId(n.id)) === targetChapterId
        ) ??
        DEFAULT_LEVELS_MANIFEST.niveis.find(
          (n) => (n.capitulo ?? levelIdToChapterId(n.id)) === targetChapterId
        );
      if (!entry) return;
      try {
        await downloadAndPersistChapter(entry, (prog) => {
          updateChapterDownloadSnapshot(targetChapterId, prog);
        });
        showToast(`${entry.nome} salva para jogar offline!`);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : `Não foi possível baixar ${entry.id}.`
        );
      }
    },
    [levelsManifest.niveis, showToast]
  );

  const handleDeleteChapter = useCallback(
    async (targetChapterId: ChapterId) => {
      await deleteStoredLevel(targetChapterId);
      const entry = levelsManifest.niveis.find(
        (n) => (n.capitulo ?? levelIdToChapterId(n.id)) === targetChapterId
      );
      updateChapterDownloadSnapshot(targetChapterId, {
        id: chapterIdToLevelId(targetChapterId),
        chapterId: targetChapterId,
        nome: entry?.nome ?? CHAPTER_CONFIGS[targetChapterId].title,
        status: "not_downloaded",
        progressPct: 0,
        downloadedMb: 0,
        totalMb: entry?.tamanho_mb ?? 10,
      });
      showToast(`Dados do Cap. 0${targetChapterId} removidos do dispositivo.`);
    },
    [levelsManifest.niveis, showToast]
  );

  // Atalho de teclado Enter / Espaço na tela título
  useEffect(() => {
    if (phase !== "title" || studioOpen || creditsOpen || dataManagerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        startFreshRun(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, studioOpen, creditsOpen, dataManagerOpen, startFreshRun]);

  // ESC fecha modais ou retoma pausa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (inspectOpen) setInspectOpen(false);
        else if (relayOpen) setRelayOpen(false);
        else if (keypadOpen) setKeypadOpen(false);
        else if (paddOpen) setPaddOpen(false);
        else if (dataManagerOpen) setDataManagerOpen(false);
        else if (studioOpen) setStudioOpen(false);
        else if (creditsOpen) setCreditsOpen(false);
        else if (phase === "paused") setPhase("playing");
      } else if (e.code === "Tab" && paddOpen) {
        e.preventDefault();
        setPaddOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    inspectOpen,
    relayOpen,
    keypadOpen,
    paddOpen,
    dataManagerOpen,
    studioOpen,
    creditsOpen,
    phase,
  ]);

  const handleUseKit = useCallback(() => {
    const idx = inventory.findIndex((it) => it.id === "kit_estanca");
    if (idx === -1) {
      showToast("Nenhum Kit de Estanca no inventário.");
      return;
    }
    if (health === "verde") {
      showToast("Estado vital estável. Guarde o Kit para emergências.");
      return;
    }
    setHealth("verde");
    soundEngine.playTricorderChirp();
    setInventory((prev) =>
      prev
        .map((it, i) =>
          i === idx ? { ...it, quantity: it.quantity - 1 } : it
        )
        .filter((it) => it.quantity > 0)
    );
    const cur = telemetryRef.current;
    panicLogger.log(
      {
        event: "heal",
        detail: "Kit de Estanca aplicado",
        panicPct: Math.max(10, cur.panicPct - 35),
        heartRateBpm: Math.max(76, cur.heartRateBpm - 38),
        newbornDistM: cur.newbornDist,
        newbornState: cur.newbornState,
        health: "verde",
        resources: {
          batteryPct: Math.round((cur.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100),
          flashlightOn: cur.flashlightOn,
          tricorderOn: cur.tricorderOn,
          hidingInLocker: cur.hidingInLocker,
          kitsRemaining: Math.max(0, kitsCount - 1),
        },
      },
      true
    );
    showToast("Hemorragia estancada. Estado vital restaurado (VERDE).");
    void narrationManager.trigger("player_healed", {
      chapterId: chapterIdRef.current,
      force: true,
    });
  }, [inventory, health, kitsCount, soundEngine, showToast, narrationManager]);

  const handleAction = useCallback(
    (action: GameActionEvent) => {
      if (action.type === "toggle_pause") {
        if (document.pointerLockElement) document.exitPointerLock?.();
        setPhase((prev) => (prev === "playing" ? "paused" : "playing"));
        return;
      }
      if (action.type === "toggle_mute") {
        setMuted((m) => {
          const next = !m;
          soundEngine.setMuted(next);
          return next;
        });
        return;
      }
      if (action.type === "toggle_padd") {
        if (document.pointerLockElement) document.exitPointerLock?.();
        setPaddTab("inventario");
        setPaddOpen((o) => !o);
        soundEngine.playClick(720);
        return;
      }
      if (action.type === "toggle_map") {
        if (document.pointerLockElement) document.exitPointerLock?.();
        setPaddTab("mapa");
        setPaddOpen(true);
        soundEngine.playClick(720);
        return;
      }
      if (action.type === "use_heal") {
        handleUseKit();
        return;
      }
      if (action.type === "interact") {
        const id = action.targetId;
        if (id === "pickup_kit" && !hasKitPickup) {
          const res = addItemToInventory(inventory, {
            id: "kit_estanca",
            name: "Kit de Estanca",
            description: "Sutura hemostática de combate. Cura trauma severo (H).",
            category: "consumivel",
            quantity: 1,
          });
          if (!res.added) {
            showToast(res.reason || "Inventário cheio.");
            return;
          }
          setInventory(res.slots);
          setHasKitPickup(true);
          soundEngine.playTricorderChirp();
          showToast("Kit de Estanca coletado.");
          void narrationManager.trigger("pickup_kit", {
            chapterId: chapterIdRef.current,
          });
        } else if (id === "pickup_badge" && !hasBadgePickup) {
          const res = addItemToInventory(inventory, {
            id: "cracha_supervisor",
            name: activeChapter.badgeName,
            description: `Cartão de ${activeChapter.badgeOwner}. Gire no PADD.`,
            category: "chave",
            quantity: 1,
            inspectable: true,
          });
          if (!res.added) {
            showToast(res.reason || "Inventário cheio.");
            return;
          }
          setInventory(res.slots);
          setHasBadgePickup(true);
          soundEngine.playTricorderChirp();
          showToast(`${activeChapter.badgeName} coletado! Inspecione-o no PADD [TAB].`);
          void narrationManager.trigger("pickup_badge", {
            chapterId: chapterIdRef.current,
          });
        } else if (id === "relay_panel") {
          if (document.pointerLockElement) document.exitPointerLock?.();
          setRelayOpen(true);
          soundEngine.playClick(680);
        } else if (id === "exit_door") {
          if (doorUnlocked) {
            soundEngine.playVictoryChord();
            if (document.pointerLockElement) document.exitPointerLock?.();
            setPhase("victory");
            void narrationManager.trigger(
              `chapter_0${chapterIdRef.current}_victory`,
              { chapterId: chapterIdRef.current, force: true }
            );
          } else {
            if (document.pointerLockElement) document.exitPointerLock?.();
            setKeypadOpen(true);
            soundEngine.playClick(680);
            if (!relayState.solved) {
              void narrationManager.trigger("door_locked_no_power", {
                chapterId: chapterIdRef.current,
              });
            }
          }
        }
      }
    },
    [
      activeChapter.badgeName,
      activeChapter.badgeOwner,
      doorUnlocked,
      handleUseKit,
      hasBadgePickup,
      hasKitPickup,
      inventory,
      narrationManager,
      relayState.solved,
      showToast,
      soundEngine,
    ]
  );

  const handlePlayerHurt = useCallback(() => {
    setHealth((prev) => {
      const cur = telemetryRef.current;
      panicLogger.log(
        {
          event: "injury",
          detail: prev === "verde" ? "Primeiro golpe sofrido (VERMELHO)" : "Golpe fatal (Game Over)",
          panicPct: 98,
          heartRateBpm: 182,
          newbornDistM: cur.newbornDist,
          newbornState: cur.newbornState,
          health: "vermelho",
          resources: {
            batteryPct: Math.round((cur.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100),
            flashlightOn: cur.flashlightOn,
            tricorderOn: cur.tricorderOn,
            hidingInLocker: cur.hidingInLocker,
            kitsRemaining: kitsCount,
          },
        },
        true
      );
      if (prev === "verde") {
        showToast("FERIDO! Use um Kit de Estanca [H] ou fuja pela escuridão!");
        void narrationManager.trigger("player_hurt_red", {
          chapterId: chapterIdRef.current,
          force: true,
        });
        return "vermelho";
      }
      if (document.pointerLockElement) document.exitPointerLock?.();
      setPhase("gameover");
      void narrationManager.trigger("gameover_defeat", {
        chapterId: chapterIdRef.current,
        force: true,
      });
      return "vermelho";
    });
  }, [kitsCount, showToast, narrationManager]);

  const handleNewbornVentTriggered = useCallback(() => {
    showToast("ALERTA: O Newborn caiu do duto de ventilação!");
    void narrationManager.trigger("newborn_vent_drop", {
      chapterId: chapterIdRef.current,
      force: true,
    });
  }, [showToast, narrationManager]);

  const handleGameplayCue = useCallback(
    (cueId: string) => {
      void narrationManager.trigger(cueId, {
        chapterId: chapterIdRef.current,
      });
    },
    [narrationManager]
  );

  const currentObjective = useMemo(() => {
    if (doorUnlocked)
      return chapterId < 7
        ? "Atravessar a Comporta Norte para o próximo setor"
        : "Cruzar o Portão Externo do Hangar para a superfície";
    if (relayState.solved && pinDiscovered)
      return `Digitar PIN ${activeChapter.expectedPin} na Comporta Norte`;
    if (relayState.solved)
      return `Encontrar ${activeChapter.badgeName} e abrir a Comporta`;
    if (hasBadgePickup && !pinDiscovered)
      return "Inspecionar o Cartão de Acesso em 3D no PADD [TAB]";
    if (pinDiscovered) return "Ligar a energia no Painel de Relés de Emergência";
    return `Explorar ${activeChapter.title.split("·")[1]?.trim() ?? "o setor"} e buscar a saída`;
  }, [
    activeChapter.badgeName,
    activeChapter.expectedPin,
    activeChapter.title,
    chapterId,
    doorUnlocked,
    hasBadgePickup,
    pinDiscovered,
    relayState.solved,
  ]);

  const batteryPct = Math.round(
    (telemetry.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100
  );

  // Helpers para controles touch opcionais com pulsação visual + feedback háptico simulado
  const triggerTouchPulse = (id: string, cb?: () => void) => {
    setActiveTouchBtn(id);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
    window.setTimeout(() => {
      setActiveTouchBtn((cur) => (cur === id ? null : cur));
    }, 160);
    cb?.();
  };

  const dispatchGameKey = (code: string, eventType: "keydown" | "keyup") => {
    window.dispatchEvent(new KeyboardEvent(eventType, { code, bubbles: true }));
  };

  const touchPulseClass = (id: string, accent = "cyan") =>
    activeTouchBtn === id
      ? accent === "amber"
        ? "scale-90 ring-2 ring-amber-400/90 brightness-125"
        : "scale-90 ring-2 ring-cyan-400/90 brightness-125"
      : "scale-100";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070c] text-slate-100 select-none">
      {/* Cena 3D sempre viva em camada isolada */}
      <VanguardCanvas
        chapter={activeChapter}
        phase={phase}
        pausedByModal={pausedByModal}
        health={health}
        photosensitiveMode={photosensitiveMode}
        kitsCount={kitsCount}
        hasKitPickup={hasKitPickup}
        hasBadgePickup={hasBadgePickup}
        relaySolved={relayState.solved}
        doorUnlocked={doorUnlocked}
        soundEngine={soundEngine}
        onTelemetry={handleTelemetry}
        onAction={handleAction}
        onPlayerHurt={handlePlayerHurt}
        onNewbornVentTriggered={handleNewbornVentTriggered}
        onGameplayCue={handleGameplayCue}
        resetSignal={resetSignal}
        mobileInputRef={mobileInputRef}
      />

      {/* Vinheta de dano com curva exponencial sincronizada ao batimento cardíaco + interferência */}
      {phase === "playing" && (
        <div
          ref={vignetteRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            boxShadow:
              health === "vermelho"
                ? "inset 0 0 110px rgba(185, 28, 28, 0.52)"
                : telemetry.proximityGlitch > 0.1 && !photosensitiveMode
                  ? `inset 0 0 85px rgba(6, 182, 212, ${telemetry.proximityGlitch * 0.34})`
                  : "inset 0 0 70px rgba(0, 0, 0, 0.45)",
          }}
        />
      )}

      {/* TELA TÍTULO */}
      {phase === "title" && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between overflow-y-auto p-3.5 sm:p-10">
          {/* Topo mínimo à direita com som */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                const next = !muted;
                setMuted(next);
                soundEngine.setMuted(next);
              }}
              aria-label={muted ? "Ativar áudio" : "Silenciar áudio"}
              className="flex h-10 w-10 items-center justify-center border border-slate-700/80 bg-[#0b1018]/85 text-slate-300 hover:border-amber-400 hover:text-white"
            >
              {muted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Lockup Principal compacto deixando o corredor escuro e a silhueta visíveis */}
          <div className="my-2 max-w-xl border-l-2 border-amber-500/80 bg-[#05070c]/65 p-4 sm:p-7 shadow-2xl">
            <div className="flex items-center gap-3">
              <svg
                viewBox="0 0 40 40"
                className="h-8 w-8 shrink-0"
                aria-hidden="true"
              >
                <polygon
                  points="20,2 37,11 37,29 20,38 3,29 3,11"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
                <circle cx="20" cy="20" r="6" fill="none" stroke="#06b6d4" strokeWidth="2" />
                <line x1="20" y1="6" x2="20" y2="14" stroke="#f59e0b" strokeWidth="1.5" />
                <line x1="20" y1="26" x2="20" y2="34" stroke="#f59e0b" strokeWidth="1.5" />
              </svg>
              <span className="font-mono-tabular text-xs uppercase tracking-[0.2em] text-amber-400">
                Vanguard-7 · Cap. 0{chapterId} / 07
              </span>
            </div>

            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-5xl">
              PROTOCOLO <span className="text-amber-400">NEWBORN</span>
            </h1>

            <p className="mt-2 max-w-md text-xs sm:text-sm leading-relaxed text-slate-300">
              {activeChapter.introDesc}
            </p>

            {/* Seletor dos 7 capítulos com status de download modular */}
            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {([1, 2, 3, 4, 5, 6, 7] as ChapterId[]).map((id) => {
                const cfg = CHAPTER_CONFIGS[id];
                const selected = chapterId === id;
                const dl = cacheSnapshot.chapterDownloads[id];
                const manifestItem = levelsManifest.niveis.find(
                  (n) => (n.capitulo ?? levelIdToChapterId(n.id)) === id
                );
                const isSaved = dl?.status === "downloaded";
                const isBusy =
                  dl?.status === "downloading" || dl?.status === "verifying";
                return (
                  <button
                    key={id}
                    type="button"
                    data-chapter={id}
                    title={cfg.title}
                    onClick={() => {
                      soundEngine.playClick(560 + id * 35);
                      chapterIdRef.current = id;
                      setChapterId(id);
                    }}
                    className={`border px-2 py-1.5 text-left transition-colors ${
                      selected
                        ? "border-amber-400/90 bg-amber-500/20 text-amber-200"
                        : "border-slate-700/70 bg-[#080c14]/75 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono-tabular text-[10px] uppercase tracking-wider">
                      <span>Cap. 0{id}</span>
                      <span
                        className={
                          isSaved
                            ? "text-emerald-400"
                            : isBusy
                              ? "text-cyan-300"
                              : "text-slate-500"
                        }
                      >
                        {isSaved
                          ? "Offline"
                          : isBusy
                            ? `${dl?.progressPct ?? 0}%`
                            : `${(manifestItem?.tamanho_mb ?? 10).toFixed(0)}MB`}
                      </span>
                    </div>
                    <div className="truncate text-[11px] font-semibold">
                      {cfg.shortLabel}
                    </div>
                    {isBusy && (
                      <div className="mt-1 h-1 w-full bg-slate-900">
                        <div
                          className="h-full bg-cyan-400 transition-[width]"
                          style={{ width: `${dl?.progressPct ?? 0}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Banner compacto quando a fase selecionada possui pacote modular para baixar */}
            {(() => {
              const dl = cacheSnapshot.chapterDownloads[chapterId];
              const entry = levelsManifest.niveis.find(
                (n) => (n.capitulo ?? levelIdToChapterId(n.id)) === chapterId
              );
              const isBusy =
                dl?.status === "downloading" || dl?.status === "verifying";
              if (dl?.status === "downloaded" || !entry) return null;
              return (
                <div className="mt-3 border border-cyan-500/35 bg-[#07101b]/90 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-300">
                      Pacote HD de <strong className="text-cyan-200">{activeChapter.shortLabel}</strong> ({entry.tamanho_mb.toFixed(1)} MB) no GitHub Releases
                    </span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDownloadChapter(chapterId)}
                      className="flex items-center gap-1.5 border border-cyan-400/70 bg-cyan-950/75 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-50"
                    >
                      <CloudDownload className="h-3.5 w-3.5" />
                      {isBusy
                        ? `Baixando ${dl?.progressPct ?? 0}%`
                        : `Baixar Fase (${entry.tamanho_mb.toFixed(1)} MB)`}
                    </button>
                  </div>
                  {isBusy && (
                    <div className="mt-1.5 h-1.5 w-full bg-slate-900">
                      <div
                        className="h-full bg-cyan-400 transition-[width]"
                        style={{ width: `${dl?.progressPct ?? 0}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={() => startFreshRun(false)}
                className="flex items-center gap-2 border border-amber-400 bg-amber-500 px-5 py-2.5 font-display text-sm font-bold tracking-wide text-slate-950 hover:bg-amber-400"
              >
                <Play className="h-4 w-4 fill-current" />
                Iniciar Sobrevivência
              </button>

              <button
                type="button"
                data-settings="true"
                onClick={() => setDataManagerOpen(true)}
                className="flex items-center gap-2 border border-slate-600/90 bg-[#0b121c]/85 px-3.5 py-2.5 text-xs font-semibold text-slate-100 hover:border-amber-400"
              >
                <Settings className="h-4 w-4 text-amber-300" />
                Configurações · Dados
              </button>

              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="flex items-center gap-2 border border-cyan-500/50 bg-[#0a121e]/80 px-3.5 py-2.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-950"
              >
                <Radio className="h-4 w-4" />
                Estúdio IA
              </button>

              <button
                type="button"
                data-credits="true"
                onClick={() => setCreditsOpen(true)}
                className="flex items-center gap-1.5 border border-slate-600/80 bg-[#0a0f18]/80 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:border-amber-400 hover:text-amber-200"
              >
                <Film className="h-3.5 w-3.5" />
                Créditos
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-[11px] text-slate-300">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-400">Controles:</span>
                {(
                  [
                    { id: "auto" as ControlMode, label: "Auto" },
                    { id: "touch" as ControlMode, label: "Touch" },
                    { id: "keyboard" as ControlMode, label: "Teclado" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-quick-control={m.id}
                    onClick={() => setControlMode(m.id)}
                    className={`border px-2 py-1 text-[11px] font-semibold ${
                      controlMode === m.id
                        ? "border-cyan-400 bg-cyan-950/70 text-cyan-200"
                        : "border-slate-700 bg-slate-900/70 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={photosensitiveMode}
                  onChange={(e) => setPhotosensitiveMode(e.target.checked)}
                  className="accent-amber-500"
                />
                Modo Fotossensível
              </label>
            </div>
          </div>

          {!pausedByModal && (
            <NarrationSubtitle
              subtitle={activeSubtitle}
              enabled={narrationSettings.subtitlesEnabled}
              size={narrationSettings.subtitleSize}
              touchControlsActive={touchControlsEnabled}
              inGameplay={false}
              inlineTitle
            />
          )}

          {/* Linha única de controles no rodapé */}
          <div className="mt-2 font-mono-tabular text-[11px] text-slate-300/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            {touchControlsEnabled ? (
              <span>Joystick Esq. Mover · Arraste Metade Dir. Câmera · Botões Táticos à Direita</span>
            ) : (
              <>
                <span className="hidden md:inline">
                  WASD Mover · Mouse Olhar · C Agachar · Shift Correr · L Lanterna · R Dínamo · T Tricorder · F Interagir · TAB PADD · Esc Pausar
                </span>
                <span className="md:hidden">
                  Dica: Selecione Touch acima para controles na tela
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* CENA DE ABERTURA / FLASHBACK */}
      {phase === "intro" && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#04060b]/95 p-6 text-center">
          <div className="max-w-lg border border-rose-500/40 bg-[#090d16] p-8 shadow-2xl">
            <div className="font-mono-tabular text-xs uppercase tracking-[0.25em] text-rose-400">
              Flashback · {activeChapter.title}
            </div>
            <p className="mt-4 font-display text-2xl font-bold text-slate-100">
              {activeChapter.introQuote}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              {activeChapter.introDesc}
            </p>
            <div className="mt-4 space-y-2 text-left">
              <div className="font-mono-tabular text-[11px] text-cyan-400/90">
                Cache de texturas e malhas: {cacheSnapshot.progressPct}%
              </div>
              {Object.values(cacheSnapshot.chapterDownloads)
                .filter((d) => d && (d.status === "downloading" || d.status === "verifying"))
                .map((dl) =>
                  dl ? (
                    <div key={dl.id} className="space-y-1">
                      <div className="flex justify-between font-mono-tabular text-[10px] text-slate-300">
                        <span>{dl.nome}</span>
                        <span>{dl.progressPct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-900">
                        <div
                          className="h-full bg-cyan-400 transition-[width]"
                          style={{ width: `${dl.progressPct}%` }}
                        />
                      </div>
                    </div>
                  ) : null
                )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPhase("playing");
                void narrationManager.trigger(
                  `chapter_0${chapterIdRef.current}_intro`,
                  { chapterId: chapterIdRef.current, force: true }
                );
              }}
              className="mt-5 border border-slate-600 bg-slate-900 px-4 py-2 text-xs text-slate-200 hover:border-amber-400"
            >
              Pular Flashback
            </button>
          </div>
        </div>
      )}

      {/* HUD MINIMALISTA E SEMI-TRANSPARENTE (>= 90% cena escura livre) */}
      {phase === "playing" && !pausedByModal && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3.5 sm:p-5">
          {/* Topo: Telemetria nua no canto esquerdo + ícones translúcidos no canto direito */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 opacity-85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
              <div className="flex flex-wrap items-center gap-3.5 font-mono-tabular text-[11px]">
                <span
                  className={`flex items-center gap-1 font-bold ${
                    health === "verde" ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  <HeartPulse className="h-3.5 w-3.5" />
                  {health === "verde" ? "ESTÁVEL" : "FERIDO [H]"}
                </span>

                <span
                  className={`flex items-center gap-1.5 ${
                    telemetry.flashlightOn ? "text-amber-300" : "text-slate-400"
                  }`}
                >
                  <Flashlight className="h-3.5 w-3.5" />
                  <span className="inline-block h-1 w-10 bg-white/15 overflow-hidden">
                    <span
                      className="block h-full bg-amber-400 transition-[width]"
                      style={{ width: `${batteryPct}%` }}
                    />
                  </span>
                  <span>{batteryPct}%</span>
                  {telemetry.pumpingDynamo && (
                    <span className="text-cyan-300">(DÍNAMO)</span>
                  )}
                </span>

                <span className="text-slate-300/80">
                  {telemetry.noiseM.toFixed(0)}m
                </span>

                {telemetry.hidingInLocker && (
                  <span className="text-cyan-300">
                    Fôlego {telemetry.breathSec.toFixed(1)}s
                  </span>
                )}
              </div>

              <div className="text-[11px] font-medium text-amber-200/80">
                {currentObjective}
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
              <button
                type="button"
                tabIndex={-1}
                data-touch-indicator={touchControlsEnabled ? "active" : "inactive"}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setControlMode((prev) =>
                    prev === "touch"
                      ? "keyboard"
                      : prev === "keyboard"
                        ? "auto"
                        : touchControlsEnabled
                          ? "keyboard"
                          : "touch"
                  );
                }}
                aria-label={
                  touchControlsEnabled
                    ? "Controles touch ativos (toque para alternar modo)"
                    : "Controles touch ocultos (toque para ativar)"
                }
                title={`Modo de controle: ${controlMode}`}
                className={`flex h-8 items-center gap-1 border px-2 font-mono-tabular text-[10px] font-semibold transition-colors ${
                  touchControlsEnabled
                    ? "border-cyan-400/60 bg-cyan-950/65 text-cyan-200"
                    : "border-white/10 bg-black/30 text-slate-400 hover:text-slate-200"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    touchControlsEnabled ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                />
                <span className="hidden sm:inline">TOUCH</span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleAction({ type: "toggle_mute" });
                }}
                aria-label={muted ? "Ativar som" : "Silenciar"}
                className="flex h-8 w-8 items-center justify-center bg-black/30 text-slate-300 hover:bg-black/60 hover:text-white"
              >
                {muted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleAction({ type: "toggle_padd" });
                }}
                aria-label="Abrir PADD"
                className="flex h-8 items-center gap-1 bg-black/30 px-2.5 text-[11px] font-semibold text-amber-300/90 hover:bg-black/60"
              >
                <Tablet className="h-3.5 w-3.5" />
                PADD
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  handleAction({ type: "toggle_pause" });
                }}
                aria-label="Pausar jogo"
                className="flex h-8 w-8 items-center justify-center bg-black/30 text-slate-300 hover:bg-black/60 hover:text-white"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Alerta discreto sem caixa sólida */}
          {toast && (
            <div className="mx-auto bg-black/45 px-3 py-1 text-xs font-medium text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
              {toast}
            </div>
          )}

          {/* Mira mínima + Prompt contextual */}
          <div className="flex flex-col items-center justify-center gap-2.5">
            <div className="h-1 w-1 rounded-full bg-white/60" />
            {(telemetry.nearbyLabel || telemetry.hidingInLocker) && (
              <div className="bg-black/40 px-2.5 py-1 font-mono-tabular text-[11px] text-cyan-200/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                {telemetry.hidingInLocker
                  ? "[F] Sair · [Botão Direito] Prender Respiração"
                  : `[F] ${telemetry.nearbyLabel}`}
              </div>
            )}
          </div>

          {/* Rodapé mínimo translúcido */}
          <div className="flex items-end justify-between font-mono-tabular text-[10px] text-slate-300/65 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
            <div>
              {telemetry.crouching ? "AGACHADO" : telemetry.sprinting ? "CORRENDO" : "EM PÉ"}
              {telemetry.tricorderOn ? " · TRICORDER" : ""}
              {batteryPct <= 15 ? " · [R] DÍNAMO" : ""}
            </div>
            <div>{formatDuration(runSeconds)}</div>
          </div>
        </div>
      )}

      {/* CONTROLES TOUCH MULTI-TOUCH NOS CANTOS COM SAFE-AREA (CENTRO/DIREITA LIVRES PARA OLHAR) */}
      {phase === "playing" && !pausedByModal && touchControlsEnabled && (
        <div
          data-testid="touch-controls-layer"
          style={{
            zIndex: 25,
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
          className="pointer-events-none fixed inset-x-0 bottom-4 z-25 flex touch-none items-end justify-between sm:bottom-6"
        >
          {/* Esquerda: Correr + Joystick Analógico Virtual responsivo (celular/tablet) */}
          <div className="pointer-events-auto flex flex-col items-start gap-2 opacity-85">
            <button
              type="button"
              aria-label="Correr"
              onPointerDown={() => {
                triggerTouchPulse("sprint");
                mobileInputRef.current.sprint = true;
              }}
              onPointerUp={() => {
                mobileInputRef.current.sprint = false;
              }}
              onPointerLeave={() => {
                mobileInputRef.current.sprint = false;
              }}
              onPointerCancel={() => {
                mobileInputRef.current.sprint = false;
              }}
              className={`flex h-9 items-center gap-1.5 border border-white/20 bg-black/45 px-3 text-[11px] font-semibold text-slate-200 transition-transform duration-150 ${touchPulseClass("sprint")}`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              Correr
            </button>

            <div
              ref={joystickRef}
              role="application"
              aria-label="Joystick virtual de movimento"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                joystickPointerId.current = e.pointerId;
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const maxR = rect.width * 0.36;
                let dx = e.clientX - cx;
                let dy = e.clientY - cy;
                const dist = Math.hypot(dx, dy);
                if (dist > maxR && dist > 0) {
                  dx = (dx / dist) * maxR;
                  dy = (dy / dist) * maxR;
                }
                setJoystickKnob({ x: dx, y: dy });
                mobileInputRef.current.moveX = (dx / maxR) * touchSensitivity;
                mobileInputRef.current.moveY = (-dy / maxR) * touchSensitivity;
                triggerTouchPulse("joystick");
              }}
              onPointerMove={(e) => {
                if (joystickPointerId.current !== e.pointerId) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const maxR = rect.width * 0.36;
                let dx = e.clientX - cx;
                let dy = e.clientY - cy;
                const dist = Math.hypot(dx, dy);
                if (dist > maxR && dist > 0) {
                  dx = (dx / dist) * maxR;
                  dy = (dy / dist) * maxR;
                }
                setJoystickKnob({ x: dx, y: dy });
                mobileInputRef.current.moveX = (dx / maxR) * touchSensitivity;
                mobileInputRef.current.moveY = (-dy / maxR) * touchSensitivity;
              }}
              onPointerUp={(e) => {
                if (joystickPointerId.current === e.pointerId) {
                  joystickPointerId.current = null;
                  setJoystickKnob({ x: 0, y: 0 });
                  mobileInputRef.current.moveX = 0;
                  mobileInputRef.current.moveY = 0;
                }
              }}
              onPointerCancel={() => {
                joystickPointerId.current = null;
                setJoystickKnob({ x: 0, y: 0 });
                mobileInputRef.current.moveX = 0;
                mobileInputRef.current.moveY = 0;
              }}
              className={`relative flex h-24 w-24 touch-none items-center justify-center rounded-full border border-white/25 bg-black/40 shadow-lg transition-transform duration-150 sm:h-28 sm:w-28 md:h-32 md:w-32 ${touchPulseClass("joystick")}`}
            >
              <span className="pointer-events-none absolute top-1.5 text-[9px] font-bold text-slate-300/75">
                ▲
              </span>
              <span className="pointer-events-none absolute bottom-1.5 text-[9px] font-bold text-slate-300/75">
                ▼
              </span>
              <span className="pointer-events-none absolute left-2 text-[9px] font-bold text-slate-300/75">
                ◀
              </span>
              <span className="pointer-events-none absolute right-2 text-[9px] font-bold text-slate-300/75">
                ▶
              </span>
              <div
                style={{
                  transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`,
                }}
                className="pointer-events-none h-10 w-10 rounded-full border border-cyan-300/75 bg-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.35)] sm:h-11 sm:w-11"
              />
            </div>
          </div>

          {/* Direita: Ações táticas com ícones + Controle de Câmera translúcidos */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5 opacity-85">
            <div className="flex items-center gap-1.5 border border-white/15 bg-black/45 px-2 py-0.5 text-[10px] text-slate-300">
              <Smartphone className="h-3 w-3 text-cyan-400" />
              <span>{touchSensitivity.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                aria-label="Sensibilidade touch"
                value={touchSensitivity}
                onChange={(e) => setTouchSensitivity(Number(e.target.value))}
                className="w-14 accent-cyan-400"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-1">
              {telemetry.hidingInLocker && (
                <button
                  type="button"
                  aria-label="Prender fôlego"
                  onPointerDown={() => {
                    triggerTouchPulse("breath");
                    mobileInputRef.current.holdBreath = true;
                  }}
                  onPointerUp={() => {
                    mobileInputRef.current.holdBreath = false;
                  }}
                  onPointerLeave={() => {
                    mobileInputRef.current.holdBreath = false;
                  }}
                  onPointerCancel={() => {
                    mobileInputRef.current.holdBreath = false;
                  }}
                  className={`flex h-9 items-center gap-1 border border-cyan-400/60 bg-cyan-950/70 px-2.5 text-[10px] font-semibold text-cyan-100 transition-transform duration-150 ${touchPulseClass("breath")}`}
                >
                  <Wind className="h-3.5 w-3.5" />
                  Fôlego
                </button>
              )}
              <button
                type="button"
                aria-label="Agachar"
                onClick={() =>
                  triggerTouchPulse("crouch", () => dispatchGameKey("KeyC", "keydown"))
                }
                className={`flex h-9 items-center gap-1 border border-white/20 bg-black/45 px-2 text-[10px] font-semibold text-slate-200 transition-transform duration-150 ${touchPulseClass("crouch")}`}
              >
                <Footprints className="h-3.5 w-3.5 text-slate-300" />
                Agachar
              </button>
              <button
                type="button"
                aria-label="Lanterna"
                onClick={() =>
                  triggerTouchPulse("flashlight", () => dispatchGameKey("KeyL", "keydown"))
                }
                className={`flex h-9 items-center gap-1 border border-amber-400/40 bg-black/45 px-2 text-[10px] font-semibold text-amber-200 transition-transform duration-150 ${touchPulseClass("flashlight", "amber")}`}
              >
                <Flashlight className="h-3.5 w-3.5" />
                Lanterna
              </button>
              <button
                type="button"
                aria-label="Tricorder"
                onClick={() =>
                  triggerTouchPulse("tricorder", () => dispatchGameKey("KeyT", "keydown"))
                }
                className={`flex h-9 items-center gap-1 border border-cyan-400/40 bg-black/45 px-2 text-[10px] font-semibold text-cyan-200 transition-transform duration-150 ${touchPulseClass("tricorder")}`}
              >
                <Cpu className="h-3.5 w-3.5" />
                Tricorder
              </button>
              <button
                type="button"
                aria-label="Recarregar dínamo"
                onPointerDown={() => {
                  triggerTouchPulse("dynamo");
                  mobileInputRef.current.dynamo = true;
                }}
                onPointerUp={() => {
                  mobileInputRef.current.dynamo = false;
                }}
                onPointerLeave={() => {
                  mobileInputRef.current.dynamo = false;
                }}
                onPointerCancel={() => {
                  mobileInputRef.current.dynamo = false;
                }}
                className={`flex h-9 items-center gap-1 border border-emerald-400/40 bg-black/45 px-2 text-[10px] font-semibold text-emerald-200 transition-transform duration-150 ${touchPulseClass("dynamo")}`}
              >
                <Zap className="h-3.5 w-3.5" />
                Dínamo
              </button>
            </div>

            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Girar câmera para esquerda"
                onPointerDown={() => {
                  triggerTouchPulse("look-left");
                  mobileInputRef.current.lookX = -1.1 * touchSensitivity;
                }}
                onPointerUp={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                onPointerLeave={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                onPointerCancel={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                className={`h-10 w-10 border border-white/20 bg-black/45 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("look-left")}`}
              >
                ↺
              </button>
              <button
                type="button"
                aria-label="Girar câmera para direita"
                onPointerDown={() => {
                  triggerTouchPulse("look-right");
                  mobileInputRef.current.lookX = 1.1 * touchSensitivity;
                }}
                onPointerUp={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                onPointerLeave={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                onPointerCancel={() => {
                  mobileInputRef.current.lookX = 0;
                }}
                className={`h-10 w-10 border border-white/20 bg-black/45 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("look-right")}`}
              >
                ↻
              </button>
              <button
                type="button"
                aria-label={telemetry.hidingInLocker ? "Sair do armário" : "Interagir"}
                onClick={() =>
                  triggerTouchPulse("interagir", () => {
                    if (telemetry.hidingInLocker || telemetry.nearbyId === "locker_xray") {
                      dispatchGameKey("KeyF", "keydown");
                    } else if (telemetry.nearbyId) {
                      handleAction({
                        type: "interact",
                        targetId: telemetry.nearbyId,
                      });
                    } else {
                      dispatchGameKey("KeyF", "keydown");
                    }
                  })
                }
                className={`flex h-10 items-center gap-1.5 border border-amber-400/55 bg-black/55 px-3 text-[11px] font-bold text-amber-200 transition-transform duration-150 ${touchPulseClass("interagir", "amber")}`}
              >
                <Hand className="h-3.5 w-3.5" />
                {telemetry.hidingInLocker ? "Sair" : "Interagir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAUSA */}
      {phase === "paused" && !studioOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Jogo Pausado"
          className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#06080d]/85 p-4"
        >
          <div className="w-full max-w-md border border-amber-500/45 bg-[#0b1018] p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-amber-400">
              PAUSADO
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {activeChapter.title} · Tempo: {formatDuration(runSeconds)}
            </p>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => setPhase("playing")}
                className="flex w-full items-center justify-center gap-2 border border-amber-400 bg-amber-500 py-2.5 font-display text-sm font-bold text-slate-950 hover:bg-amber-400"
              >
                <Play className="h-4 w-4 fill-current" />
                Retomar Sobrevivência
              </button>

              <div className="border border-slate-800 bg-[#080d15] p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200">
                  <Smartphone className="h-3.5 w-3.5" />
                  Controles ({controlMode === "auto" ? "Automático" : controlMode === "touch" ? "Touch na Tela" : "Teclado e Mouse"})
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "auto" as ControlMode, label: "Automático" },
                      { id: "touch" as ControlMode, label: "Touch" },
                      { id: "keyboard" as ControlMode, label: "Teclado" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setControlMode(m.id)}
                      className={`border py-1.5 text-[11px] font-semibold ${
                        controlMode === m.id
                          ? "border-cyan-400 bg-cyan-950/70 text-cyan-100"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDataManagerOpen(true)}
                className="flex w-full items-center justify-center gap-2 border border-amber-500/45 bg-[#12161f] py-2.5 text-xs font-semibold text-amber-200 hover:border-amber-400"
              >
                <HardDrive className="h-4 w-4" />
                Configurações &amp; Gerenciar Dados
              </button>

              <button
                type="button"
                onClick={() => setStudioOpen(true)}
                className="flex w-full items-center justify-center gap-2 border border-cyan-500/50 bg-cyan-950/60 py-2.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70"
              >
                <Radio className="h-4 w-4" />
                Abrir Estúdio Tático IA (Voz / Mídia)
              </button>

              <button
                type="button"
                onClick={() => startFreshRun(true)}
                className="flex w-full items-center justify-center gap-2 border border-slate-700 bg-slate-900 py-2.5 text-xs font-medium text-slate-200 hover:border-amber-400"
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar Capítulo {chapterId}
              </button>

              <button
                type="button"
                onClick={() => setCreditsOpen(true)}
                className="flex w-full items-center justify-center gap-2 border border-slate-700 bg-slate-900 py-2 text-xs font-medium text-amber-200 hover:border-amber-400"
              >
                <Film className="h-3.5 w-3.5" />
                Créditos dos Criadores
              </button>

              <button
                type="button"
                onClick={() => setPhase("title")}
                className="w-full border border-slate-800 bg-[#080b12] py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Voltar ao Menu Principal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DERROTA (GAME OVER) */}
      {phase === "gameover" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fim de Jogo"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#090406]/90 p-4"
        >
          <div className="w-full max-w-md border border-rose-500/60 bg-[#0f090d] p-7 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <ShieldAlert className="h-5 w-5" />
              <span className="font-mono-tabular text-xs uppercase tracking-widest">
                Sinal Vital Perdido
              </span>
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-100">
              ARTHUR FOI ENCONTRADO
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              O Newborn localizou você na escuridão de {activeChapter.shortLabel}. Use a
              caminhada agachada (C), apague a lanterna (L) e esconda-se no
              Armário de Aço do setor.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 border border-rose-900/50 bg-[#080507] p-3 font-mono-tabular text-xs text-slate-300">
              <div>Sobrevivência: {formatDuration(runSeconds)}</div>
              <div>Itens no PADD: {inventory.length}/6</div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => startFreshRun(true)}
                className="flex flex-1 items-center justify-center gap-2 border border-rose-400 bg-rose-600 py-3 font-display text-sm font-bold text-white hover:bg-rose-500"
              >
                <RotateCcw className="h-4 w-4" />
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={() => setPhase("title")}
                className="border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-300 hover:text-white"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VITÓRIA (GANCHO TRÁGICO E PROGRESSÃO ENTRE CAPÍTULOS) */}
      {phase === "victory" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Capítulo ${chapterId} Concluído`}
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#06080d]/90 p-4"
        >
          <div className="w-full max-w-lg border border-emerald-500/60 bg-[#0b1218] p-7 shadow-2xl">
            <div className="font-mono-tabular text-xs uppercase tracking-widest text-emerald-400">
              Capítulo {chapterId} Concluído · Comporta Aberta
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold text-slate-50">
              {activeChapter.victoryTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {activeChapter.victoryDesc}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 border border-slate-800 bg-[#070b10] p-3 font-mono-tabular text-xs text-slate-300">
              <div>Tempo: {formatDuration(runSeconds)}</div>
              <div>Saúde: {health === "verde" ? "Estável" : "Ferido"}</div>
              <div>Bateria: {batteryPct}%</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {chapterId < 7 ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startFreshRun(false, (chapterId + 1) as ChapterId)}
                  className="flex flex-1 items-center justify-center gap-2 border border-emerald-400 bg-emerald-500 py-3 font-display text-sm font-bold text-slate-950 hover:bg-emerald-400"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Avançar para Cap. {chapterId + 1}
                </button>
              ) : (
                <button
                  type="button"
                  data-start="true"
                  onClick={() => startFreshRun(false, 1)}
                  className="flex flex-1 items-center justify-center gap-2 border border-emerald-400 bg-emerald-500 py-3 font-display text-sm font-bold text-slate-950 hover:bg-emerald-400"
                >
                  <RotateCcw className="h-4 w-4" />
                  Recomeçar Campanha
                </button>
              )}
              <button
                type="button"
                onClick={() => startFreshRun(true)}
                className="flex items-center gap-2 border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-semibold text-slate-200 hover:border-amber-400"
              >
                <RotateCcw className="h-4 w-4" />
                Repetir Setor
              </button>
              <button
                type="button"
                onClick={() => setCreditsOpen(true)}
                className="flex items-center gap-2 border border-amber-500/50 bg-amber-950/40 px-4 py-3 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
              >
                <Film className="h-4 w-4" />
                Créditos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAIS DO PADD, INSPEÇÃO 3D, RELÉS, TECLADO, ESTÚDIO IA E CRÉDITOS */}
      {paddOpen && (
        <PaddModal
          chapter={activeChapter}
          activeTab={paddTab}
          onTabChange={setPaddTab}
          inventory={inventory}
          health={health}
          telemetry={telemetry}
          relaySolved={relayState.solved}
          doorUnlocked={doorUnlocked}
          hasKitPickup={hasKitPickup}
          hasBadgePickup={hasBadgePickup}
          pinDiscovered={pinDiscovered}
          onUseItem={(id) => {
            if (id === "kit_estanca") handleUseKit();
          }}
          onInspectItem={(id) => {
            if (id === "cracha_supervisor") {
              setPaddOpen(false);
              setInspectOpen(true);
            }
          }}
          onDiscardItem={(id) => {
            setInventory((prev) => prev.filter((it) => it.id !== id));
            showToast("Item descartado do PADD.");
          }}
          onOpenStudio={() => {
            setPaddOpen(false);
            setStudioOpen(true);
          }}
          onClose={() => setPaddOpen(false)}
        />
      )}

      {inspectOpen && (
        <BadgeInspectModal
          badgeName={activeChapter.badgeName}
          badgeOwner={activeChapter.badgeOwner}
          expectedPin={activeChapter.expectedPin}
          onClose={() => setInspectOpen(false)}
          onPinDiscovered={() => {
            if (!pinDiscovered) {
              setPinDiscovered(true);
              soundEngine.playTricorderChirp();
              showToast(`PIN descoberto no verso do cartão: ${activeChapter.expectedPin}!`);
              void narrationManager.trigger("inspect_badge_pin", {
                chapterId: chapterIdRef.current,
              });
            }
          }}
        />
      )}

      {relayOpen && (
        <RelayPuzzleModal
          sectorName={activeChapter.shortLabel}
          tricorderUsed={telemetry.tricorderOn}
          relayState={relayState}
          onScanWithTricorder={() => soundEngine.playTricorderChirp()}
          onSolve={(next) => {
            setRelayState(next);
            setRelayOpen(false);
            soundEngine.playDoorPneumatic();
            showToast("Energia auxiliar ligada! Cuidado com os dutos!");
            void narrationManager.trigger("relay_solved", {
              chapterId: chapterIdRef.current,
            });
          }}
          onShortCircuit={() => {
            soundEngine.playHurt();
            showToast("Curto-circuito nos relés! Evite o canal vermelho!");
            void narrationManager.trigger("relay_short_circuit", {
              chapterId: chapterIdRef.current,
              force: true,
            });
          }}
          onClose={() => setRelayOpen(false)}
        />
      )}

      {keypadOpen && (
        <KeypadModal
          relaySolved={relayState.solved}
          expectedPin={activeChapter.expectedPin}
          sectorLabel={activeChapter.subtitle}
          onUnlock={() => {
            setDoorUnlocked(true);
            setKeypadOpen(false);
            soundEngine.playDoorPneumatic();
            showToast("Comporta destrancada! Atravesse para escapar!");
            void narrationManager.trigger("door_unlocked", {
              chapterId: chapterIdRef.current,
              force: true,
            });
          }}
          onClose={() => setKeypadOpen(false)}
        />
      )}

      {dataManagerOpen && (
        <DataManagerModal
          manifest={levelsManifest}
          chapterDownloads={cacheSnapshot.chapterDownloads}
          storageBackendLabel={getStorageBackendLabel()}
          controlMode={controlMode}
          onChangeControlMode={setControlMode}
          touchSensitivity={touchSensitivity}
          onChangeTouchSensitivity={setTouchSensitivity}
          photosensitiveMode={photosensitiveMode}
          onTogglePhotosensitive={setPhotosensitiveMode}
          narrationSettings={narrationSettings}
          onChangeNarrationSettings={(patch) =>
            setNarrationSettings((prev) => ({ ...prev, ...patch }))
          }
          onDownloadChapter={(id) => void handleDownloadChapter(id)}
          onDeleteChapter={(id) => void handleDeleteChapter(id)}
          onRefreshManifest={() => void handleRefreshManifest()}
          onClose={() => setDataManagerOpen(false)}
        />
      )}

      {phase !== "title" && (
        <NarrationSubtitle
          subtitle={activeSubtitle}
          enabled={narrationSettings.subtitlesEnabled}
          size={narrationSettings.subtitleSize}
          touchControlsActive={touchControlsEnabled}
          inGameplay={phase === "playing" && !pausedByModal}
        />
      )}

      {studioOpen && <AiStudioModal onClose={() => setStudioOpen(false)} />}
      {creditsOpen && <CreditsModal onClose={() => setCreditsOpen(false)} />}
    </div>
  );
}

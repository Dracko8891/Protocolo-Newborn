import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Flashlight,
  HeartPulse,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Tablet,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AiStudioModal } from "./components/AiStudioModal";
import { BadgeInspectModal } from "./components/BadgeInspectModal";
import { CreditsModal } from "./components/CreditsModal";
import { KeypadModal } from "./components/KeypadModal";
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
  GamePhase,
  HealthState,
  InventoryItem,
  PHYSICS_PARAMS,
  RelayState,
  addItemToInventory,
  computeExponentialHeartbeatPulse,
  computeHeartbeatIntervalMs,
} from "./game/gameLogic";
import { panicLogger } from "./game/panicLogger";
import {
  ResourceCacheSnapshot,
  preloadEssentialResources,
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
  const mobileInputRef = useRef({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
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
  const [touchControlsEnabled, setTouchControlsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vanguard7.touchEnabled") === "1";
  });
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
  });

  const [paddOpen, setPaddOpen] = useState(false);
  const [paddTab, setPaddTab] = useState<PaddTab>("inventario");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [relayOpen, setRelayOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);

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
    paddOpen || inspectOpen || relayOpen || keypadOpen || studioOpen || creditsOpen;

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

  // Pré-carregamento assíncrono e cache de texturas durante telas de transição
  useEffect(() => {
    void preloadEssentialResources(setCacheSnapshot);
  }, []);

  // Salva preferências dos controles touch em localStorage
  useEffect(() => {
    try {
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
  }, [touchControlsEnabled, touchSensitivity]);

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

  // Pulso exponencial contínuo da vinheta de dano sincronizado com batimento cardíaco em "vermelho"
  useEffect(() => {
    if (phase !== "playing" || pausedByModal || health !== "vermelho") {
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
          const proxNorm = Math.max(0, Math.min(1, (14 - dist) / 11));
          const urgency = Math.max(0.25, Math.min(1, proxNorm * 0.55 + panicNorm * 0.45));
          const ease = computeExponentialHeartbeatPulse(
            now - lastBeatAt,
            beatIntervalMs,
            urgency
          );
          const spread = Math.round(92 + ease * (78 + urgency * 30));
          const outerAlpha = (0.34 + ease * (0.42 + urgency * 0.14)).toFixed(3);
          const innerSpread = Math.round(24 + ease * 36);
          const innerAlpha = (0.22 + ease * 0.42).toFixed(3);
          el.style.boxShadow = `inset 0 0 ${spread}px rgba(220, 38, 38, ${outerAlpha}), inset 0 0 ${innerSpread}px rgba(127, 29, 29, ${innerAlpha})`;
        }
      }
      rafId = window.requestAnimationFrame(stepVignette);
    };

    rafId = window.requestAnimationFrame(stepVignette);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
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
        scheduleDistress();
      }, delayMs);
    };

    scheduleDistress();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [phase, pausedByModal, soundEngine]);

  // Transição automática da cena inicial de flashback para gameplay
  useEffect(() => {
    if (phase !== "intro") return;
    const id = window.setTimeout(() => {
      setPhase("playing");
      showToast(`${activeChapter.subtitle} · Fique agachado e evite fazer ruído.`);
    }, 2200);
    return () => window.clearTimeout(id);
  }, [phase, activeChapter.subtitle, showToast]);

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
    }
  }, [phase, doorUnlocked, telemetry.playerX, telemetry.playerZ, soundEngine]);

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
      setRunSeconds(0);
      setTelemetry({
        ...INITIAL_TELEMETRY,
        playerX: targetChapter.spawn.x,
        playerZ: targetChapter.spawn.z,
        playerYaw: targetChapter.spawn.yaw,
      });
      setResetSignal((n) => n + 1);
      setPhase(skipIntro ? "playing" : "intro");
    },
    [soundEngine]
  );

  // Atalho de teclado Enter / Espaço na tela título
  useEffect(() => {
    if (phase !== "title" || studioOpen || creditsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        startFreshRun(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, studioOpen, creditsOpen, startFreshRun]);

  // ESC fecha modais ou retoma pausa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (inspectOpen) setInspectOpen(false);
        else if (relayOpen) setRelayOpen(false);
        else if (keypadOpen) setKeypadOpen(false);
        else if (paddOpen) setPaddOpen(false);
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
  }, [inspectOpen, relayOpen, keypadOpen, paddOpen, studioOpen, creditsOpen, phase]);

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
  }, [inventory, health, kitsCount, soundEngine, showToast]);

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
        } else if (id === "relay_panel") {
          if (document.pointerLockElement) document.exitPointerLock?.();
          setRelayOpen(true);
          soundEngine.playClick(680);
        } else if (id === "exit_door") {
          if (doorUnlocked) {
            soundEngine.playVictoryChord();
            if (document.pointerLockElement) document.exitPointerLock?.();
            setPhase("victory");
          } else {
            if (document.pointerLockElement) document.exitPointerLock?.();
            setKeypadOpen(true);
            soundEngine.playClick(680);
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
        return "vermelho";
      }
      if (document.pointerLockElement) document.exitPointerLock?.();
      setPhase("gameover");
      return "vermelho";
    });
  }, [kitsCount, showToast]);

  const handleNewbornVentTriggered = useCallback(() => {
    showToast("ALERTA: O Newborn caiu do duto de ventilação!");
  }, [showToast]);

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
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 sm:p-12">
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
          <div className="max-w-xl border-l-2 border-amber-500/80 bg-[#05070c]/65 p-5 sm:p-7 shadow-2xl">
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

            <h1 className="mt-2.5 font-display text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
              PROTOCOLO <span className="text-amber-400">NEWBORN</span>
            </h1>

            <p className="mt-2.5 max-w-md text-xs sm:text-sm leading-relaxed text-slate-300">
              {activeChapter.introDesc}
            </p>

            {/* Seletor dos 7 capítulos */}
            <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {([1, 2, 3, 4, 5, 6, 7] as ChapterId[]).map((id) => {
                const cfg = CHAPTER_CONFIGS[id];
                const selected = chapterId === id;
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
                    <div className="font-mono-tabular text-[10px] uppercase tracking-wider">
                      Cap. 0{id}
                    </div>
                    <div className="truncate text-[11px] font-semibold">
                      {cfg.shortLabel}
                    </div>
                  </button>
                );
              })}
            </div>

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

            <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-800/80 pt-3 text-[11px] text-slate-300">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={photosensitiveMode}
                  onChange={(e) => setPhotosensitiveMode(e.target.checked)}
                  className="accent-amber-500"
                />
                Modo Fotossensível (sem flashes)
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={touchControlsEnabled}
                  onChange={(e) => setTouchControlsEnabled(e.target.checked)}
                  className="accent-cyan-500"
                />
                Controles Touch na Tela
              </label>
            </div>
          </div>

          {/* Linha única de controles no rodapé */}
          <div className="font-mono-tabular text-[11px] text-slate-300/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
            WASD Mover · Mouse Olhar · C Agachar · Shift Correr · L Lanterna · R
            Dínamo · T Tricorder · F Interagir · TAB PADD · Esc Pausar
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
            <div className="mt-4 font-mono-tabular text-[11px] text-cyan-400/90">
              Cache de texturas e malhas: {cacheSnapshot.progressPct}%
            </div>
            <button
              type="button"
              onClick={() => setPhase("playing")}
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

            <div className="pointer-events-auto flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
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

      {/* CONTROLES TOUCH MINIMALISTAS SEMI-TRANSPARENTES NOS CANTOS */}
      {phase === "playing" && !pausedByModal && touchControlsEnabled && (
        <div className="fixed inset-x-0 bottom-8 z-25 flex items-end justify-between px-3.5 pointer-events-none">
          {/* D-Pad translúcido */}
          <div className="pointer-events-auto grid grid-cols-3 gap-1 opacity-65">
            <div />
            <button
              type="button"
              onPointerDown={() => {
                triggerTouchPulse("move-up");
                mobileInputRef.current.moveY = 1 * touchSensitivity;
              }}
              onPointerUp={() => {
                mobileInputRef.current.moveY = 0;
              }}
              onPointerLeave={() => {
                mobileInputRef.current.moveY = 0;
              }}
              className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("move-up")}`}
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              onPointerDown={() => {
                triggerTouchPulse("move-left");
                mobileInputRef.current.moveX = -1 * touchSensitivity;
              }}
              onPointerUp={() => {
                mobileInputRef.current.moveX = 0;
              }}
              onPointerLeave={() => {
                mobileInputRef.current.moveX = 0;
              }}
              className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("move-left")}`}
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => {
                triggerTouchPulse("move-down");
                mobileInputRef.current.moveY = -1 * touchSensitivity;
              }}
              onPointerUp={() => {
                mobileInputRef.current.moveY = 0;
              }}
              onPointerLeave={() => {
                mobileInputRef.current.moveY = 0;
              }}
              className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("move-down")}`}
            >
              ▼
            </button>
            <button
              type="button"
              onPointerDown={() => {
                triggerTouchPulse("move-right");
                mobileInputRef.current.moveX = 1 * touchSensitivity;
              }}
              onPointerUp={() => {
                mobileInputRef.current.moveX = 0;
              }}
              onPointerLeave={() => {
                mobileInputRef.current.moveX = 0;
              }}
              className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("move-right")}`}
            >
              ▶
            </button>
          </div>

          {/* Ações táticas + Controle de Câmera translúcidos */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5 opacity-65">
            <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 text-[10px] text-slate-300">
              <Smartphone className="h-3 w-3 text-cyan-400" />
              <span>{touchSensitivity.toFixed(1)}x</span>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                value={touchSensitivity}
                onChange={(e) => setTouchSensitivity(Number(e.target.value))}
                className="w-14 accent-cyan-400"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                onClick={() =>
                  triggerTouchPulse("crouch", () => dispatchGameKey("KeyC", "keydown"))
                }
                className={`h-9 border border-white/15 bg-black/30 px-2 text-[10px] font-semibold text-slate-200 transition-transform duration-150 ${touchPulseClass("crouch")}`}
              >
                Agachar
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerTouchPulse("flashlight", () => dispatchGameKey("KeyL", "keydown"))
                }
                className={`h-9 border border-amber-400/35 bg-black/30 px-2 text-[10px] font-semibold text-amber-200 transition-transform duration-150 ${touchPulseClass("flashlight", "amber")}`}
              >
                Lanterna
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerTouchPulse("tricorder", () => dispatchGameKey("KeyT", "keydown"))
                }
                className={`h-9 border border-cyan-400/35 bg-black/30 px-2 text-[10px] font-semibold text-cyan-200 transition-transform duration-150 ${touchPulseClass("tricorder")}`}
              >
                Tricorder
              </button>
              <button
                type="button"
                onPointerDown={() => {
                  triggerTouchPulse("dynamo", () => dispatchGameKey("KeyR", "keydown"));
                }}
                onPointerUp={() => dispatchGameKey("KeyR", "keyup")}
                onPointerLeave={() => dispatchGameKey("KeyR", "keyup")}
                className={`h-9 border border-emerald-400/35 bg-black/30 px-2 text-[10px] font-semibold text-emerald-200 transition-transform duration-150 ${touchPulseClass("dynamo")}`}
              >
                Dínamo
              </button>
            </div>

            <div className="flex gap-1">
              <button
                type="button"
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
                className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("look-left")}`}
              >
                ↺
              </button>
              <button
                type="button"
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
                className={`h-10 w-10 border border-white/15 bg-black/30 text-xs font-bold text-slate-200 transition-transform duration-150 ${touchPulseClass("look-right")}`}
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerTouchPulse(
                    "interagir",
                    () => {
                      if (telemetry.nearbyId) {
                        handleAction({
                          type: "interact",
                          targetId: telemetry.nearbyId,
                        });
                      } else {
                        dispatchGameKey("KeyF", "keydown");
                      }
                    }
                  )
                }
                className={`h-10 border border-amber-400/50 bg-black/40 px-3 text-[11px] font-bold text-amber-200 transition-transform duration-150 ${touchPulseClass("interagir", "amber")}`}
              >
                Interagir
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
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#06080d]/85 p-4"
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
              O Newborn localizou você na escuridão da Ala Médica. Use a
              caminhada agachada (C), apague a lanterna (L) e esconda-se no
              Armário de Aço da Sala de Raio-X.
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
            }
          }}
        />
      )}

      {relayOpen && (
        <RelayPuzzleModal
          tricorderUsed={telemetry.tricorderOn}
          relayState={relayState}
          onScanWithTricorder={() => soundEngine.playTricorderChirp()}
          onSolve={(next) => {
            setRelayState(next);
            setRelayOpen(false);
            soundEngine.playDoorPneumatic();
            showToast("Energia auxiliar ligada! Cuidado com os dutos!");
          }}
          onShortCircuit={() => {
            soundEngine.playHurt();
            showToast("Curto-circuito nos relés! Evite o canal vermelho!");
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
          }}
          onClose={() => setKeypadOpen(false)}
        />
      )}

      {studioOpen && <AiStudioModal onClose={() => setStudioOpen(false)} />}
      {creditsOpen && <CreditsModal onClose={() => setCreditsOpen(false)} />}
    </div>
  );
}

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import {
  ChapterConfig,
  DIFFICULTY_PARAMS,
  DifficultyMode,
  DirectorWavePhase,
  GamePhase,
  GraphicsPreset,
  HealthState,
  NewbornAIState,
  PHYSICS_PARAMS,
  advanceDirectorWave,
  computeDollyZoomFov,
  computePanicMetrics,
  computeResponsiveFov,
  computeStealthExposurePct,
  evaluateNewbornPerception,
  findNextNavWaypoint,
  hasWallLineOfSight,
  isMobileOrTabletDevice,
  resolveCircleWallCollision,
  resolveEffectiveGraphics,
} from "../game/gameLogic";
import { panicLogger } from "../game/panicLogger";
import { buildFlashlightCookieTexture } from "../game/resourceCache";
import { SoundEngine } from "../game/soundEngine";
import {
  MedicalWingHandles,
  buildChapterScene,
} from "../game/threeSceneBuilder";
import { useOrientation } from "../hooks/useOrientation";

export interface LiveTelemetry {
  batterySec: number;
  breathSec: number;
  noiseM: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  newbornX: number;
  newbornZ: number;
  newbornState: NewbornAIState;
  newbornDist: number;
  flashlightOn: boolean;
  tricorderOn: boolean;
  crouching: boolean;
  sprinting: boolean;
  hidingInLocker: boolean;
  holdingBreath: boolean;
  pumpingDynamo: boolean;
  nearbyId: string | null;
  nearbyLabel: string | null;
  proximityGlitch: number;
  panicPct: number;
  heartRateBpm: number;
  radialBlurStrength: number;
  stealthExposurePct: number;
  containmentActiveSec: number;
  containmentCooldownSec: number;
  directorWarning: boolean;
  decoyActiveSec: number;
}

export interface GameActionEvent {
  type:
    | "interact"
    | "use_heal"
    | "use_decoy"
    | "toggle_padd"
    | "toggle_map"
    | "toggle_pause"
    | "toggle_mute";
  targetId?: string;
}

interface VanguardCanvasProps {
  chapter: ChapterConfig;
  phase: GamePhase;
  pausedByModal: boolean;
  health: HealthState;
  photosensitiveMode: boolean;
  difficulty?: DifficultyMode;
  graphicsPreset?: GraphicsPreset;
  brightness?: number;
  kitsCount?: number;
  hasKitPickup: boolean;
  hasBadgePickup: boolean;
  hasDecoyPickup?: boolean;
  wallMapDiscovered?: boolean;
  collectedLogIds?: string[];
  relaySolved: boolean;
  doorUnlocked: boolean;
  soundEngine: SoundEngine;
  onTelemetry: (t: LiveTelemetry) => void;
  onAction: (action: GameActionEvent) => void;
  onPlayerHurt: () => void;
  onNewbornVentTriggered: () => void;
  onGameplayCue?: (cueId: string) => void;
  onAlertTriggered?: () => void;
  onSoundTrapTriggered?: (kind: "glass" | "puddle") => void;
  onAmbushWarning?: () => void;
  resetSignal: number;
  quickTurnSignal?: number;
  deployDecoySignal?: number;
  containmentTriggerSignal?: number;
  mobileInputRef: React.MutableRefObject<{
    moveX: number;
    moveY: number;
    lookX: number;
    lookY: number;
    holdBreath?: boolean;
    sprint?: boolean;
    dynamo?: boolean;
    stealthMove?: boolean;
    touchSensitivity?: number;
  }>;
}

const HorrorPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFear: { value: 0 },
    uRadialBlur: { value: 0 },
    uLensDistortion: { value: 0 },
    uChromatic: { value: 0.0012 },
    uVignette: { value: 0.62 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFear;
    uniform float uRadialBlur;
    uniform float uLensDistortion;
    uniform float uChromatic;
    uniform float uVignette;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float dist2 = dot(center, center);
      float dist = sqrt(dist2);

      // Distorção de lente (Dolly Zoom warp) escalada pelo medo e nível de saúde
      vec2 warpedUv = 0.5 + center * (1.0 - uLensDistortion * 0.24 * dist2);
      warpedUv = clamp(warpedUv, 0.002, 0.998);

      // Desfoque radial em 5 amostras quando o Newborn detecta ou saúde cai
      vec3 col = texture2D(tDiffuse, warpedUv).rgb;
      if (uRadialBlur > 0.02) {
        vec2 blurDir = center * (0.028 * uRadialBlur * dist);
        vec3 accum = col;
        accum += texture2D(tDiffuse, clamp(warpedUv - blurDir * 0.5, 0.002, 0.998)).rgb;
        accum += texture2D(tDiffuse, clamp(warpedUv - blurDir * 1.0, 0.002, 0.998)).rgb;
        accum += texture2D(tDiffuse, clamp(warpedUv - blurDir * 1.5, 0.002, 0.998)).rgb;
        accum += texture2D(tDiffuse, clamp(warpedUv - blurDir * 2.0, 0.002, 0.998)).rgb;
        col = accum * 0.2;
      }

      // Aberração cromática acentuada nas bordas
      float ca = uChromatic * (1.0 + uFear * 4.2 + uLensDistortion * 2.4) * dist;
      float r = texture2D(tDiffuse, clamp(warpedUv + vec2(ca, 0.0), 0.002, 0.998)).r;
      float b = texture2D(tDiffuse, clamp(warpedUv - vec2(ca, 0.0), 0.002, 0.998)).b;
      col.r = mix(col.r, r, 0.72);
      col.b = mix(col.b, b, 0.72);

      float grain = (rand(vUv * vec2(640.0, 360.0) + fract(uTime) * 37.0) - 0.5) * (0.045 + uFear * 0.06);
      col += grain;

      // Gradação cinematográfica de terror (sombras frias profundas + realces levemente quentes)
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.92, 0.98, 1.06);
      vec3 highlightTint = vec3(1.06, 1.01, 0.94);
      col *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.72, luma));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.24);

      float vig = smoothstep(0.30, 0.92, dist) * (uVignette + uFear * 0.14);
      col *= (1.0 - vig);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _bloodDummy = new THREE.Object3D();

export const VanguardCanvas: React.FC<VanguardCanvasProps> = ({
  chapter,
  phase,
  pausedByModal,
  health,
  photosensitiveMode,
  difficulty = "sobrevivencia",
  graphicsPreset = "auto",
  brightness = 1.05,
  kitsCount = 0,
  hasKitPickup,
  hasBadgePickup,
  hasDecoyPickup = false,
  wallMapDiscovered = false,
  collectedLogIds = [],
  relaySolved,
  doorUnlocked,
  soundEngine,
  onTelemetry,
  onAction,
  onPlayerHurt,
  onNewbornVentTriggered,
  onGameplayCue,
  onAlertTriggered,
  onSoundTrapTriggered,
  onAmbushWarning,
  resetSignal,
  quickTurnSignal = 0,
  deployDecoySignal = 0,
  containmentTriggerSignal = 0,
  mobileInputRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const orientation = useOrientation();
  const syncViewportRef = useRef<(() => void) | null>(null);
  const applyGraphicsRef = useRef<(() => void) | null>(null);

  const stateRef = useRef({
    chapter,
    phase,
    pausedByModal,
    health,
    photosensitiveMode,
    difficulty,
    graphicsPreset,
    brightness,
    kitsCount,
    hasKitPickup,
    hasBadgePickup,
    hasDecoyPickup,
    wallMapDiscovered,
    collectedLogIds,
    relaySolved,
    doorUnlocked,
    onTelemetry,
    onAction,
    onPlayerHurt,
    onNewbornVentTriggered,
    onGameplayCue,
    onAlertTriggered,
    onSoundTrapTriggered,
    onAmbushWarning,
  });

  stateRef.current = {
    chapter,
    phase,
    pausedByModal,
    health,
    photosensitiveMode,
    difficulty,
    graphicsPreset,
    brightness,
    kitsCount,
    hasKitPickup,
    hasBadgePickup,
    hasDecoyPickup,
    wallMapDiscovered,
    collectedLogIds,
    relaySolved,
    doorUnlocked,
    onTelemetry,
    onAction,
    onPlayerHurt,
    onNewbornVentTriggered,
    onGameplayCue,
    onAlertTriggered,
    onSoundTrapTriggered,
    onAmbushWarning,
  };

  const simRef = useRef({
    px: 0,
    pz: -4.2,
    yaw: 0,
    pitch: 0.02,
    crouching: true,
    flashlightOn: true,
    tricorderOn: false,
    batterySec: PHYSICS_PARAMS.maxBatterySec as number,
    breathSec: PHYSICS_PARAMS.maxBreathSec as number,
    hidingInLocker: false,
    holdingBreath: false,
    pumpingDynamo: false,
    adrenalineTimer: 0,
    hitCooldown: 0,
    hitstopTimer: 0,
    lungeTimer: 0,
    shakeTrauma: 0,
    walkDistAccum: 0,
    introScriptTimer: 0,
    ventDropped: false,
    newbornState: "Observe" as NewbornAIState,
    nx: -1.0,
    ny: 0,
    nz: 3.2,
    patrolIdx: 0,
    investigateX: 0,
    investigateZ: 6.5,
    huntMemoryTimer: 0,
    stunTimer: 0,
    jawClickTimer: 0,
    sparkTimer: 0,
    lowBatteryCued: false,
    emptyBatteryCued: false,
    lowBreathCued: false,
    quickTurnRemaining: 0,
    containmentActiveSec: 0,
    containmentCooldownSec: 0,
    activeDecoyTimer: 0,
    activeDecoyX: 0,
    activeDecoyZ: 0,
    activeDecoyBeepTimer: 0,
    directorWavePhase: "pressure" as DirectorWavePhase,
    directorWaveTimer: 0,
    ambushWarningFired: false,
    ambushFlickerWarning: false,
    trapCooldowns: {} as Record<string, number>,
    bloodDropCount: 0,
    lastBloodDropX: 0,
    lastBloodDropZ: -4.2,
    resetBloodDrops: false,
  });

  useEffect(() => {
    const s = simRef.current;
    s.px = chapter.spawn.x;
    s.pz = chapter.spawn.z;
    s.yaw = chapter.spawn.yaw;
    s.pitch = 0.02;
    s.crouching = true;
    s.flashlightOn = true;
    s.tricorderOn = false;
    s.batterySec = PHYSICS_PARAMS.maxBatterySec;
    s.breathSec = PHYSICS_PARAMS.maxBreathSec;
    s.hidingInLocker = false;
    s.holdingBreath = false;
    s.pumpingDynamo = false;
    s.adrenalineTimer = 0;
    s.hitCooldown = 0;
    s.hitstopTimer = 0;
    s.lungeTimer = 0;
    s.shakeTrauma = 0;
    s.introScriptTimer = 0;
    s.ventDropped = chapter.newbornActiveFromStart;
    s.newbornState = chapter.newbornActiveFromStart ? "Patrol" : "Observe";
    s.nx = chapter.newbornActiveFromStart ? 0 : -1.0;
    s.ny = 0;
    s.nz = chapter.newbornActiveFromStart ? 9.8 : 2.5;
    s.patrolIdx = 0;
    s.huntMemoryTimer = 0;
    s.stunTimer = 0;
    s.sparkTimer = 0;
    s.lowBatteryCued = false;
    s.emptyBatteryCued = false;
    s.lowBreathCued = false;
    s.quickTurnRemaining = 0;
    s.containmentActiveSec = 0;
    s.containmentCooldownSec = 0;
    s.activeDecoyTimer = 0;
    s.activeDecoyX = 0;
    s.activeDecoyZ = 0;
    s.activeDecoyBeepTimer = 0;
    s.directorWavePhase = "pressure";
    s.directorWaveTimer = 0;
    s.ambushWarningFired = false;
    s.ambushFlickerWarning = false;
    s.trapCooldowns = {};
    s.bloodDropCount = 0;
    s.lastBloodDropX = chapter.spawn.x;
    s.lastBloodDropZ = chapter.spawn.z;
    s.resetBloodDrops = true;
  }, [resetSignal, chapter]);

  const clearInputsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (phase !== "playing" || pausedByModal) {
      clearInputsRef.current?.();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }, [phase, pausedByModal]);

  useEffect(() => {
    if (quickTurnSignal <= 0) return;
    const s = simRef.current;
    if (stateRef.current.phase !== "playing" || s.hidingInLocker) return;
    s.quickTurnRemaining = Math.PI;
    soundEngine.playClick(540);
  }, [quickTurnSignal, soundEngine]);

  useEffect(() => {
    if (deployDecoySignal <= 0) return;
    const s = simRef.current;
    const ch = stateRef.current.chapter;
    const tx = s.px + Math.sin(s.yaw) * 0.9;
    const tz = s.pz + Math.cos(s.yaw) * 0.9;
    const resolved = resolveCircleWallCollision(tx, tz, 0.22, ch.walls);
    s.activeDecoyX = resolved.x;
    s.activeDecoyZ = resolved.z;
    s.activeDecoyTimer = 7.0;
    s.activeDecoyBeepTimer = 0.25;
  }, [deployDecoySignal]);

  useEffect(() => {
    if (containmentTriggerSignal <= 0) return;
    const s = simRef.current;
    if (s.containmentActiveSec <= 0 && s.containmentCooldownSec <= 0) {
      s.containmentActiveSec = stateRef.current.chapter.containmentDoor.durationSec;
    }
  }, [containmentTriggerSignal]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const isMobileOrTablet = isMobileOrTabletDevice({
      hostname: window.location.hostname,
      userAgent: navigator.userAgent,
      pointerCoarse: window.matchMedia?.("(pointer: coarse)").matches ?? false,
      anyPointerCoarse:
        window.matchMedia?.("(any-pointer: coarse)").matches ?? false,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      hasOnTouchStart: "ontouchstart" in window,
    });

    let autoDowngraded = false;
    const getEffGraphics = () =>
      resolveEffectiveGraphics(
        stateRef.current.graphicsPreset,
        isMobileOrTablet,
        isSoftwareGl,
        autoDowngraded
      );

    const initEff = getEffGraphics();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl && !isMobileOrTablet,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = stateRef.current.brightness;
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, initEff.maxDpr)
    );
    renderer.shadowMap.enabled = initEff.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const getViewportSize = () => {
      const vv = window.visualViewport;
      const w = Math.max(
        1,
        Math.round(container.clientWidth || vv?.width || window.innerWidth)
      );
      const h = Math.max(
        1,
        Math.round(container.clientHeight || vv?.height || window.innerHeight)
      );
      return { w, h };
    };

    const { w: initW, h: initH } = getViewportSize();
    renderer.setSize(initW, initH);

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = initEff.envIntensity;
    pmremGenerator.dispose();

    const initAspect = initW / initH;
    const camera = new THREE.PerspectiveCamera(
      computeResponsiveFov(PHYSICS_PARAMS.defaultFov, initAspect),
      initAspect,
      0.08,
      55
    );
    camera.position.set(
      stateRef.current.chapter.spawn.x,
      PHYSICS_PARAMS.eyeCrouching,
      stateRef.current.chapter.spawn.z
    );

    // Lanterna Tática segura (z = +0.08 atrás do plano frontal p/ nunca entrar na parede em ARM Mali)
    const flashlight = new THREE.SpotLight(
      0xfff2dc,
      3.8,
      22,
      Math.PI / 4.8,
      0.55,
      1.35
    );
    flashlight.map = buildFlashlightCookieTexture();
    flashlight.position.set(0.14, -0.09, 0.08);
    flashlight.target.position.set(0.02, -0.08, -6.5);
    camera.add(flashlight);
    camera.add(flashlight.target);

    // Luz de preenchimento próxima do jogador para evitar breu absoluto ao encostar em paredes
    const playerFillLight = new THREE.PointLight(0xdbeafe, 0.42, 4.4, 1.6);
    playerFillLight.position.set(0, 0.05, 0.06);
    camera.add(playerFillLight);

    const tricorderLight = new THREE.PointLight(0x06b6d4, 0, 6.5, 1.8);
    tricorderLight.position.set(-0.24, -0.15, -0.45);
    camera.add(tricorderLight);
    scene.add(camera);

    const world: MedicalWingHandles = buildChapterScene(
      scene,
      camera,
      renderer,
      isSoftwareGl,
      stateRef.current.chapter,
      {
        texSize: initEff.textureSize,
        particleDensity: initEff.particleDensity,
        shadowsEnabled: initEff.shadowsEnabled,
      }
    );

    let composer: EffectComposer | null = null;
    let horrorPass: ShaderPass | null = null;
    if (initEff.usePostProcessing) {
      composer = new EffectComposer(renderer);
      composer.setSize(initW, initH);
      composer.addPass(new RenderPass(scene, camera));
      horrorPass = new ShaderPass(HorrorPostShader);
      composer.addPass(horrorPass);

      if (typeof renderer.compileAsync === "function") {
        renderer.compileAsync(scene, camera).catch(() => {});
      } else {
        renderer.compile(scene, camera);
      }
    }

    const applyGraphicsConfig = () => {
      const eff = getEffGraphics();
      renderer.toneMappingExposure = stateRef.current.brightness;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, eff.maxDpr)
      );
      renderer.shadowMap.enabled = eff.shadowsEnabled;
      scene.environmentIntensity = eff.envIntensity;
      if (eff.usePostProcessing && !composer && !isSoftwareGl) {
        const { w, h } = getViewportSize();
        composer = new EffectComposer(renderer);
        composer.setSize(w, h);
        composer.addPass(new RenderPass(scene, camera));
        horrorPass = new ShaderPass(HorrorPostShader);
        composer.addPass(horrorPass);
      }
    };
    applyGraphicsRef.current = applyGraphicsConfig;

    const keysHeld = new Set<string>();
    let rmbHeld = false;
    let draggingLook = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lookTouchId: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    const prevPadPressed: boolean[] = [];
    let lastFrameTime = performance.now();
    let telemetryTimer = 0;
    let frameId = 0;
    let contextLost = false;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const handleContextRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      handleContextRestored
    );

    const clearInputs = () => {
      keysHeld.clear();
      rmbHeld = false;
      draggingLook = false;
      lookTouchId = null;
    };
    clearInputsRef.current = clearInputs;

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const st = stateRef.current;

      if (code === "Escape" || code === "KeyP") {
        if (st.phase === "playing" && !st.pausedByModal) {
          e.preventDefault();
          st.onAction({ type: "toggle_pause" });
          return;
        }
      }

      if (st.phase !== "playing" || st.pausedByModal) return;

      if (code === "Tab") {
        e.preventDefault();
        st.onAction({ type: "toggle_padd" });
        return;
      }
      if (code === "KeyM") {
        st.onAction({ type: "toggle_map" });
        return;
      }

      const logResourceEvent = (label: string) => {
        const s = simRef.current;
        const dist = Math.hypot(s.nx - s.px, s.nz - s.pz);
        const batteryPct = Math.round((s.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100);
        const metrics = computePanicMetrics({
          health: st.health,
          newbornDist: dist,
          newbornVisible: world.newborn.root.visible,
          newbornState: s.newbornState,
          batteryPct,
          flashlightOn: s.flashlightOn,
          hidingInLocker: s.hidingInLocker,
          holdingBreath: s.holdingBreath,
        });
        panicLogger.log(
          {
            event: "resource_use",
            detail: label,
            panicPct: Math.round(metrics.panicLevel * 100),
            heartRateBpm: metrics.estimatedBpm,
            newbornDistM: dist,
            newbornState: s.newbornState,
            health: st.health,
            resources: {
              batteryPct,
              flashlightOn: s.flashlightOn,
              tricorderOn: s.tricorderOn,
              hidingInLocker: s.hidingInLocker,
              kitsRemaining: st.kitsCount,
            },
          },
          true
        );
      };

      if (!e.repeat) {
        if (code === "KeyC" || code === "ControlLeft") {
          simRef.current.crouching = !simRef.current.crouching;
          soundEngine.playClick(520);
        } else if (code === "KeyL") {
          simRef.current.flashlightOn = !simRef.current.flashlightOn;
          soundEngine.playClick(760);
          logResourceEvent(
            simRef.current.flashlightOn ? "Lanterna Tática ligada" : "Lanterna Tática apagada"
          );
        } else if (code === "KeyT") {
          simRef.current.tricorderOn = !simRef.current.tricorderOn;
          if (simRef.current.tricorderOn) soundEngine.playTricorderChirp();
          else soundEngine.playClick(600);
          logResourceEvent(
            simRef.current.tricorderOn ? "Tricorder ativado" : "Tricorder recolhido"
          );
        } else if (code === "KeyH") {
          st.onAction({ type: "use_heal" });
        } else if (code === "KeyG") {
          st.onAction({ type: "use_decoy" });
        } else if (code === "KeyX") {
          if (!simRef.current.hidingInLocker) {
            simRef.current.quickTurnRemaining = Math.PI;
            soundEngine.playClick(540);
          }
        } else if (code === "KeyF") {
          const near = findNearestInteractable();
          if (near?.id === "locker_xray") {
            const nextHide = !simRef.current.hidingInLocker;
            simRef.current.hidingInLocker = nextHide;
            soundEngine.playDoorPneumatic();
            if (nextHide) {
              const lp = st.chapter.lockerPos;
              simRef.current.yaw = Math.atan2(lp.hideX - lp.x, lp.hideZ - lp.z);
              simRef.current.pitch = 0.0;
              st.onGameplayCue?.("locker_enter");
            }
            logResourceEvent(
              nextHide ? "Escondeu-se no Armário" : "Saiu do Armário"
            );
          } else if (near) {
            st.onAction({ type: "interact", targetId: near.id });
          }
        }
      }

      keysHeld.add(code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const onMouseDown = (e: MouseEvent) => {
      const st = stateRef.current;
      if (st.phase !== "playing" || st.pausedByModal) return;
      if (e.button === 2) {
        rmbHeld = true;
        return;
      }
      if (e.button === 0 && e.target === renderer.domElement) {
        draggingLook = true;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        if (document.pointerLockElement !== renderer.domElement) {
          renderer.domElement.requestPointerLock?.();
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rmbHeld = false;
      if (e.button === 0) draggingLook = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      const st = stateRef.current;
      if (st.phase !== "playing" || st.pausedByModal) return;
      const sens = 0.0022;
      if (document.pointerLockElement === renderer.domElement) {
        simRef.current.yaw -= e.movementX * sens;
        simRef.current.pitch = THREE.MathUtils.clamp(
          simRef.current.pitch - e.movementY * sens,
          -1.25,
          1.25
        );
      } else if (draggingLook) {
        const dx = e.clientX - lastPointerX;
        const dy = e.clientY - lastPointerY;
        lastPointerX = e.clientX;
        lastPointerY = e.clientY;
        simRef.current.yaw -= dx * sens * 1.4;
        simRef.current.pitch = THREE.MathUtils.clamp(
          simRef.current.pitch - dy * sens * 1.4,
          -1.25,
          1.25
        );
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (stateRef.current.phase === "playing") e.preventDefault();
    };

    const onTouchStart = (e: TouchEvent) => {
      const st = stateRef.current;
      if (st.phase !== "playing" || st.pausedByModal) return;
      if (e.target !== renderer.domElement) return;
      if (lookTouchId !== null) return;
      const rightStartX = window.innerWidth * 0.45;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t && t.clientX >= rightStartX) {
          lookTouchId = t.identifier;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
          break;
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = stateRef.current;
      if (st.phase !== "playing" || st.pausedByModal || lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === lookTouchId) {
          const dx = t.clientX - lastTouchX;
          const dy = t.clientY - lastTouchY;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
          const sensScale = mobileInputRef.current.touchSensitivity ?? 1.0;
          const touchSens = 0.0042 * sensScale;
          simRef.current.yaw -= dx * touchSens;
          simRef.current.pitch = THREE.MathUtils.clamp(
            simRef.current.pitch - dy * touchSens,
            -1.25,
            1.25
          );
          break;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = null;
          break;
        }
      }
    };

    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd, { passive: true });
    renderer.domElement.addEventListener("touchcancel", onTouchEnd, { passive: true });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", clearInputs);
    document.addEventListener("visibilitychange", clearInputs);

    const syncViewportSize = () => {
      const { w, h } = getViewportSize();
      const nextAspect = w / h;
      const eff = getEffGraphics();
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, eff.maxDpr)
      );
      camera.aspect = nextAspect;
      camera.fov = computeResponsiveFov(PHYSICS_PARAMS.defaultFov, nextAspect);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer?.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(syncViewportSize);
    resizeObserver.observe(container);
    syncViewportRef.current = syncViewportSize;
    const screenOri = (
      window.screen as Screen & {
        orientation?: EventTarget;
      }
    )?.orientation;
    window.addEventListener("resize", syncViewportSize);
    window.addEventListener("orientationchange", syncViewportSize);
    window.visualViewport?.addEventListener("resize", syncViewportSize);
    screenOri?.addEventListener?.("change", syncViewportSize);

    function findNearestInteractable(): { id: string; label: string } | null {
      const s = simRef.current;
      const st = stateRef.current;
      let best: { id: string; label: string; dist: number } | null = null;
      const logsCollected = st.collectedLogIds ?? [];

      for (const item of world.interactables) {
        if (item.id === "pickup_kit" && st.hasKitPickup) continue;
        if (item.id === "pickup_badge" && st.hasBadgePickup) continue;
        if (item.id === "pickup_decoy" && st.hasDecoyPickup) continue;
        if (item.id === "wall_map" && st.wallMapDiscovered) continue;
        if (
          item.id === "pickup_log_0" &&
          logsCollected.includes(st.chapter.survivorLogs[0].id)
        ) {
          continue;
        }
        if (
          item.id === "pickup_log_1" &&
          logsCollected.includes(st.chapter.survivorLogs[1].id)
        ) {
          continue;
        }
        if (
          item.id === "containment_door" &&
          (s.containmentActiveSec > 0 || s.containmentCooldownSec > 0)
        ) {
          continue;
        }
        const dist = Math.hypot(item.x - s.px, item.z - s.pz);
        if (dist <= PHYSICS_PARAMS.interactRangeM) {
          if (!best || dist < best.dist) {
            best = { id: item.id, label: item.label, dist };
          }
        }
      }
      return best ? { id: best.id, label: best.label } : null;
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== "function") {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function applyNewbornPose(
      state: NewbornAIState,
      elapsed: number,
      aggressive = false
    ) {
      const nb = world.newborn;
      if (state === "Hunt" || aggressive) {
        nb.veinsMat.emissive.setHex(0xef4444);
        nb.veinsMat.emissiveIntensity = aggressive ? 3.2 : 2.3;
        nb.eyeGlowMat.emissive.setHex(0xfca5a5);
        nb.torsoGroup.rotation.x = 0.28 + Math.sin(elapsed * 14) * 0.06;
        nb.jaw.position.y = -0.17;
        nb.jaw.rotation.x = aggressive
          ? 0.62
          : 0.44 + Math.sin(elapsed * 18) * 0.14;
        nb.head.rotation.z = Math.sin(elapsed * 10) * 0.18;
        nb.leftArm.rotation.x = -0.92 + Math.sin(elapsed * 12) * 0.3;
        nb.leftForearm.rotation.x = -0.55;
        nb.rightArm.rotation.x = -0.92 - Math.sin(elapsed * 12) * 0.3;
        nb.rightForearm.rotation.x = -0.55;
      } else if (state === "Investigate") {
        nb.veinsMat.emissive.setHex(0x06b6d4);
        nb.veinsMat.emissiveIntensity = 1.35;
        nb.eyeGlowMat.emissive.setHex(0xcbd5e1);
        nb.torsoGroup.rotation.x = 0.16;
        nb.jaw.position.y = -0.13;
        nb.jaw.rotation.x = 0.2;
        nb.head.rotation.z = 0.38;
        nb.leftArm.rotation.x = -0.25;
        nb.leftForearm.rotation.x = -0.4;
        nb.rightArm.rotation.x = -0.25;
        nb.rightForearm.rotation.x = -0.4;
      } else {
        nb.veinsMat.emissive.setHex(0x000000);
        nb.veinsMat.emissiveIntensity = 0;
        nb.eyeGlowMat.emissive.setHex(0xcbd5e1);
        nb.torsoGroup.rotation.x = 0.08 + Math.sin(elapsed * 2.2) * 0.03;
        nb.jaw.position.y = -0.11;
        nb.jaw.rotation.x = 0.06 + Math.abs(Math.sin(elapsed * 1.8)) * 0.08;
        nb.head.rotation.z = Math.sin(elapsed * 1.4) * 0.24;
        nb.leftArm.rotation.x = Math.sin(elapsed * 3.2) * 0.18;
        nb.leftForearm.rotation.x = -0.35;
        nb.rightArm.rotation.x = -Math.sin(elapsed * 3.2) * 0.18;
        nb.rightForearm.rotation.x = -0.35;
      }
    }

    function updateEnvironmentAnimations(dt: number, elapsed: number) {
      const s = simRef.current;
      const st = stateRef.current;

      const logsCollected = st.collectedLogIds ?? [];
      world.kitPickup.visible = !st.hasKitPickup;
      world.badgePickup.visible = !st.hasBadgePickup;
      world.decoyPickup.visible = !st.hasDecoyPickup;
      world.logPickups[0].visible = !logsCollected.includes(st.chapter.survivorLogs[0].id);
      world.logPickups[1].visible = !logsCollected.includes(st.chapter.survivorLogs[1].id);
      world.kitPickup.rotation.y = elapsed * 1.4;
      world.badgePickup.rotation.y = -elapsed * 1.2;
      world.decoyPickup.rotation.y = elapsed * 1.1;

      if (s.resetBloodDrops) {
        s.resetBloodDrops = false;
        world.bloodDropsInst.count = 0;
        world.bloodDropsInst.instanceMatrix.needsUpdate = true;
      }

      // Mapa de Parede & Porta de Contenção & Isca Ativa
      const wmHex = st.wallMapDiscovered ? 0x10b981 : 0xf59e0b;
      world.wallMapStatusMat.color.setHex(wmHex);
      world.wallMapStatusMat.emissive.setHex(wmHex);

      const cdHex =
        s.containmentActiveSec > 0
          ? 0x10b981
          : s.containmentCooldownSec > 0
            ? 0xef4444
            : 0x06b6d4;
      world.containmentPanelMat.color.setHex(cdHex);
      world.containmentPanelMat.emissive.setHex(cdHex);
      const targetContainY = s.containmentActiveSec > 0 ? 1.275 : 3.65;
      world.containmentDoorMesh.position.y = THREE.MathUtils.damp(
        world.containmentDoorMesh.position.y,
        targetContainY,
        6.5,
        dt
      );

      if (s.activeDecoyTimer > 0) {
        world.activeDecoyGroup.visible = true;
        world.activeDecoyGroup.position.set(s.activeDecoyX, 0.14, s.activeDecoyZ);
        world.activeDecoyGroup.rotation.y = elapsed * 5.2;
        world.activeDecoyLedMat.emissiveIntensity =
          1.2 + Math.abs(Math.sin(elapsed * 12)) * 2.2;
      } else {
        world.activeDecoyGroup.visible = false;
      }

      // Luz de giroflex, fluorescente falhando, núcleo Cap. 5 e faíscas elétricas
      world.beaconLight.intensity = st.photosensitiveMode
        ? 1.6
        : 1.8 + Math.sin(elapsed * 5.2) * 1.6;
      world.beaconMesh.rotation.y = elapsed * 4.5;
      world.flickerLight.intensity = st.photosensitiveMode
        ? 0.9
        : Math.sin(elapsed * 23.0) + Math.cos(elapsed * 7.3) > 0.35
          ? 1.35
          : 0.12;

      if (world.coreLight) {
        world.coreLight.intensity = 2.6 + Math.sin(elapsed * 2.8) * 0.9;
      }

      // Cabo soltando faísca periódica
      s.sparkTimer -= dt;
      if (s.sparkTimer <= 0 && !st.photosensitiveMode) {
        s.sparkTimer = 2.6 + Math.random() * 4.2;
        world.sparkLight.intensity = 3.5;
        world.sparkMesh.visible = true;
        if (st.phase === "playing" && !st.pausedByModal && Math.hypot(s.px - -1.3, s.pz - 6.2) < 10) {
          soundEngine.playSparkZap();
        }
      } else {
        world.sparkLight.intensity = Math.max(0, world.sparkLight.intensity - dt * 24);
        world.sparkMesh.visible = world.sparkLight.intensity > 0.5;
      }

      // Poeira atmosférica & nevasca no Cap. 7
      world.spores.rotation.y = elapsed * 0.02;
      if (world.snowPoints) {
        const attr = world.snowPoints.geometry.getAttribute(
          "position"
        ) as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] -= dt * 1.4;
          arr[i] += Math.sin(elapsed + i) * dt * 0.25;
          if (arr[i + 1] < 0.05) arr[i + 1] = 4.4;
        }
        attr.needsUpdate = true;
      }

      // CCTV granulado com flash subliminar breve
      const subliminalWindow = !st.photosensitiveMode && elapsed % 7.5 < 0.14;
      const targetTex = subliminalWindow
        ? world.cctvSubliminalTex
        : world.cctvNormalTex;
      if (world.crtScreenMat.map !== targetTex) {
        world.crtScreenMat.map = targetTex;
        world.crtScreenMat.emissiveMap = targetTex;
        world.crtScreenMat.needsUpdate = true;
      }
      world.crtScreenMat.emissiveIntensity = st.photosensitiveMode
        ? 0.75
        : subliminalWindow
          ? 1.5
          : Math.sin(elapsed * 19.0) > -0.7
            ? 0.9
            : 0.18;

      // Porta e relés
      world.relayStatusMat.color.setHex(st.relaySolved ? 0x10b981 : 0xf59e0b);
      world.relayStatusMat.emissive.setHex(st.relaySolved ? 0x10b981 : 0xf59e0b);
      world.exitDoorLightMat.color.setHex(st.doorUnlocked ? 0x10b981 : 0xef4444);
      world.exitDoorLightMat.emissive.setHex(
        st.doorUnlocked ? 0x10b981 : 0xef4444
      );
      const targetDoorY = st.doorUnlocked ? 3.8 : 1.25;
      world.exitDoorMesh.position.y = THREE.MathUtils.damp(
        world.exitDoorMesh.position.y,
        targetDoorY,
        4.5,
        dt
      );
    }

    function stepSimulation(dt: number, elapsed: number) {
      const s = simRef.current;
      const st = stateRef.current;

      updateEnvironmentAnimations(dt, elapsed);

      // Tour da Tela Título (camera pan suave pelo corredor)
      if (st.phase === "title") {
        world.viewmodel.root.visible = false;
        flashlight.intensity = 0;
        tricorderLight.intensity = 0;
        camera.fov = PHYSICS_PARAMS.defaultFov;
        camera.updateProjectionMatrix();
        if (horrorPass) {
          horrorPass.uniforms.uTime.value = elapsed;
          horrorPass.uniforms.uFear.value = 0.2;
          horrorPass.uniforms.uRadialBlur.value = 0;
          horrorPass.uniforms.uLensDistortion.value = 0;
        }
        const tourX = Math.sin(elapsed * 0.25) * 0.9;
        const tourZ = 0.8 + Math.cos(elapsed * 0.2) * 2.0;
        camera.position.set(tourX, 1.5, tourZ);
        _lookTarget.set(0, 1.55, 9.2);
        camera.lookAt(_lookTarget);
        world.newborn.root.visible = true;
        world.newborn.root.position.set(
          Math.sin(elapsed * 0.35) * 0.45,
          0,
          6.8
        );
        world.newborn.root.rotation.y = Math.PI + Math.sin(elapsed * 0.45) * 0.22;
        applyNewbornPose("Observe", elapsed);
        world.newborn.veinsMat.emissive.setHex(0x06b6d4);
        world.newborn.veinsMat.emissiveIntensity = 0.9 + Math.sin(elapsed * 3) * 0.4;
        return;
      }

      if (st.phase === "intro") {
        world.viewmodel.root.visible = false;
        if (horrorPass) {
          horrorPass.uniforms.uRadialBlur.value = 0;
          horrorPass.uniforms.uLensDistortion.value = 0;
        }
        camera.position.set(
          s.px,
          s.crouching ? PHYSICS_PARAMS.eyeCrouching : PHYSICS_PARAMS.eyeStanding,
          s.pz
        );
        _lookTarget.set(
          s.px + Math.sin(s.yaw) * Math.cos(s.pitch) * 5,
          camera.position.y + Math.sin(s.pitch) * 5,
          s.pz + Math.cos(s.yaw) * Math.cos(s.pitch) * 5
        );
        camera.lookAt(_lookTarget);
        return;
      }

      if (st.phase !== "playing" || st.pausedByModal) return;

      world.viewmodel.root.visible = !s.hidingInLocker;

      // Sequência visceral de captura antes do Game Over
      if (s.lungeTimer > 0) {
        s.lungeTimer = Math.max(0, s.lungeTimer - dt);
        const dirX = Math.sin(s.yaw);
        const dirZ = Math.cos(s.yaw);
        world.newborn.root.visible = true;
        world.newborn.root.position.set(
          s.px + dirX * 0.88,
          0.12,
          s.pz + dirZ * 0.88
        );
        world.newborn.root.rotation.y = s.yaw + Math.PI;
        applyNewbornPose("Hunt", elapsed, true);

        const jx = (Math.random() - 0.5) * 0.08;
        const jy = (Math.random() - 0.5) * 0.08;
        camera.position.set(s.px + jx, 1.48 + jy, s.pz);
        camera.fov = THREE.MathUtils.damp(camera.fov, 50, 12, dt);
        camera.updateProjectionMatrix();
        _lookTarget.set(
          world.newborn.root.position.x,
          1.72,
          world.newborn.root.position.z
        );
        camera.lookAt(_lookTarget);
        if (horrorPass) {
          horrorPass.uniforms.uTime.value = elapsed;
          horrorPass.uniforms.uFear.value = 1.0;
        }
        if (s.lungeTimer <= 0) {
          st.onPlayerHurt();
        }
        return;
      }

      if (s.hitstopTimer > 0) {
        s.hitstopTimer = Math.max(0, s.hitstopTimer - dt);
        return;
      }

      s.adrenalineTimer = Math.max(0, s.adrenalineTimer - dt);
      s.hitCooldown = Math.max(0, s.hitCooldown - dt);
      s.stunTimer = Math.max(0, s.stunTimer - dt);

      // Leitura de Gamepad (analógicos + botões completos com detecção de borda)
      let gpMoveX = 0;
      let gpMoveY = 0;
      let gpLookX = 0;
      let gpLookY = 0;
      let gpSprint = false;
      let gpBreath = false;
      let gpDynamo = false;
      let gpPeekDir = 0;
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((p) => p && p.connected);
      if (pad) {
        if (Math.abs(pad.axes[0] ?? 0) > 0.18) gpMoveX = pad.axes[0];
        if (Math.abs(pad.axes[1] ?? 0) > 0.18) gpMoveY = -pad.axes[1];
        if (Math.abs(pad.axes[2] ?? 0) > 0.18) gpLookX = pad.axes[2];
        if (Math.abs(pad.axes[3] ?? 0) > 0.18) gpLookY = pad.axes[3];
        gpSprint = Boolean(pad.buttons[10]?.pressed) || (pad.buttons[7]?.value ?? 0) > 0.4;
        gpBreath = (pad.buttons[6]?.value ?? 0) > 0.4;
        gpDynamo = Boolean(pad.buttons[2]?.pressed);
        gpPeekDir = (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);

        const justPressed = (idx: number) => {
          const pressed = Boolean(pad.buttons[idx]?.pressed);
          const wasPressed = Boolean(prevPadPressed[idx]);
          prevPadPressed[idx] = pressed;
          return pressed && !wasPressed;
        };

        if (justPressed(0)) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF", bubbles: true }));
        }
        if (justPressed(1)) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", bubbles: true }));
        }
        if (justPressed(3)) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyT", bubbles: true }));
        }
        if (justPressed(12)) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", bubbles: true }));
        }
        if (justPressed(13)) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyH", bubbles: true }));
        }
        if (justPressed(9)) {
          st.onAction({ type: "toggle_pause" });
        }
        // Atualiza botões contínuos no array de estado anterior
        justPressed(2);
      }

      const diffCfg = DIFFICULTY_PARAMS[st.difficulty ?? "sobrevivencia"];

      // Giro Rápido 180° suave
      if (s.quickTurnRemaining > 0 && !s.hidingInLocker) {
        const turnStep = Math.min(s.quickTurnRemaining, (Math.PI / 0.22) * dt);
        s.yaw += turnStep;
        s.quickTurnRemaining -= turnStep;
      }

      const mob = mobileInputRef.current;
      s.yaw -= (gpLookX + mob.lookX) * dt * 2.1;
      s.pitch = THREE.MathUtils.clamp(
        s.pitch - (gpLookY + mob.lookY) * dt * 1.7,
        -1.25,
        1.25
      );
      if (keysHeld.has("ArrowLeft")) s.yaw += dt * 1.9;
      if (keysHeld.has("ArrowRight")) s.yaw -= dt * 1.9;

      // Modo Espiar pelas frestas dentro do Armário (limita yaw ao redor da saída do armário)
      if (s.hidingInLocker) {
        const lp = st.chapter.lockerPos;
        const lockerOutYaw = Math.atan2(lp.hideX - lp.x, lp.hideZ - lp.z);
        const peekYawOffset =
          ((keysHeld.has("KeyQ") ? 1 : 0) - (keysHeld.has("KeyE") ? 1 : 0)) *
          dt *
          1.6;
        s.yaw += peekYawOffset;
        const delta = Math.atan2(
          Math.sin(s.yaw - lockerOutYaw),
          Math.cos(s.yaw - lockerOutYaw)
        );
        const clampedDelta = THREE.MathUtils.clamp(delta, -0.48, 0.48);
        s.yaw = lockerOutYaw + clampedDelta;
        s.pitch = THREE.MathUtils.clamp(s.pitch, -0.38, 0.38);
      }

      // Contenção Temporária + Cooldown + Parede Efetiva
      if (s.containmentActiveSec > 0) {
        s.containmentActiveSec = Math.max(0, s.containmentActiveSec - dt);
        if (s.containmentActiveSec === 0) {
          s.containmentCooldownSec = 10.0;
          soundEngine.playDoorPneumatic();
        }
      } else if (s.containmentCooldownSec > 0) {
        s.containmentCooldownSec = Math.max(0, s.containmentCooldownSec - dt);
      }
      const effectiveWalls =
        s.containmentActiveSec > 0
          ? [...st.chapter.walls, st.chapter.containmentDoor.wall]
          : st.chapter.walls;

      // Dínamo da lanterna
      s.pumpingDynamo =
        (keysHeld.has("KeyR") || gpDynamo || Boolean(mob.dynamo)) &&
        s.batterySec < PHYSICS_PARAMS.maxBatterySec;
      if (s.pumpingDynamo) {
        s.batterySec = Math.min(
          PHYSICS_PARAMS.maxBatterySec,
          s.batterySec +
            (PHYSICS_PARAMS.dynamoRechargeSec /
              PHYSICS_PARAMS.dynamoPumpDuration) *
              dt
        );
        if (Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
          soundEngine.playDynamoCrank();
        }
      }

      if (s.flashlightOn && s.batterySec > 0) {
        s.batterySec = Math.max(0, s.batterySec - dt * diffCfg.batteryDrainMult);
        if (s.batterySec <= 0) {
          s.flashlightOn = false;
          if (!s.emptyBatteryCued) {
            s.emptyBatteryCued = true;
            st.onGameplayCue?.("battery_empty");
          }
        } else if (s.batterySec <= 36 && !s.lowBatteryCued) {
          s.lowBatteryCued = true;
          st.onGameplayCue?.("battery_low");
        }
      }
      if (s.batterySec > 60) {
        s.lowBatteryCued = false;
        s.emptyBatteryCued = false;
      }

      // Movimento
      let inX = gpMoveX + mob.moveX;
      let inZ = gpMoveY + mob.moveY;
      if (keysHeld.has("KeyW") || keysHeld.has("ArrowUp")) inZ += 1;
      if (keysHeld.has("KeyS") || keysHeld.has("ArrowDown")) inZ -= 1;
      if (keysHeld.has("KeyA")) inX -= 1;
      if (keysHeld.has("KeyD")) inX += 1;

      const mag = Math.hypot(inX, inZ);
      if (mag > 1) {
        inX /= mag;
        inZ /= mag;
      }

      const sprinting =
        (keysHeld.has("ShiftLeft") ||
          keysHeld.has("ShiftRight") ||
          gpSprint ||
          Boolean(mob.sprint)) &&
        mag > 0.2 &&
        !s.crouching &&
        !s.hidingInLocker;

      const isStealthSlow = Boolean(mob.stealthMove) && !sprinting;

      const baseSpeed =
        s.adrenalineTimer > 0
          ? PHYSICS_PARAMS.adrenalineSpeed
          : st.health === "vermelho"
            ? PHYSICS_PARAMS.injuredSpeed
            : isStealthSlow
              ? PHYSICS_PARAMS.crouchSpeed * 0.72
              : s.crouching
                ? PHYSICS_PARAMS.crouchSpeed
                : sprinting
                  ? PHYSICS_PARAMS.sprintSpeed
                  : PHYSICS_PARAMS.walkSpeed;

      if (!s.hidingInLocker && mag > 0.05) {
        _forward.set(Math.sin(s.yaw), 0, Math.cos(s.yaw)).normalize();
        _right.set(-Math.cos(s.yaw), 0, Math.sin(s.yaw)).normalize();

        const nextX = s.px + (_forward.x * inZ + _right.x * inX) * baseSpeed * dt;
        const nextZ = s.pz + (_forward.z * inZ + _right.z * inX) * baseSpeed * dt;
        const resolved = resolveCircleWallCollision(
          nextX,
          nextZ,
          PHYSICS_PARAMS.playerRadius,
          effectiveWalls
        );
        const moved = Math.hypot(resolved.x - s.px, resolved.z - s.pz);
        s.px = resolved.x;
        s.pz = resolved.z;

        s.walkDistAccum += moved;
        const stepLen = isStealthSlow || s.crouching ? 0.95 : sprinting ? 1.55 : 1.2;
        if (s.walkDistAccum >= stepLen) {
          s.walkDistAccum = 0;
          soundEngine.playFootstep(isStealthSlow || s.crouching, sprinting);
        }

        // Rastro de sangue quando ferido (vermelho)
        if (
          st.health === "vermelho" &&
          Math.hypot(s.px - s.lastBloodDropX, s.pz - s.lastBloodDropZ) >= 0.85
        ) {
          s.lastBloodDropX = s.px;
          s.lastBloodDropZ = s.pz;
          const idx = s.bloodDropCount % 48;
          _bloodDummy.position.set(s.px, 0.015, s.pz);
          _bloodDummy.rotation.set(0, elapsed * 1.7 + idx, 0);
          const sc = 0.7 + (idx % 4) * 0.18;
          _bloodDummy.scale.set(sc, 1, sc);
          _bloodDummy.updateMatrix();
          world.bloodDropsInst.setMatrixAt(idx, _bloodDummy.matrix);
          s.bloodDropCount += 1;
          world.bloodDropsInst.count = Math.min(48, s.bloodDropCount);
          world.bloodDropsInst.instanceMatrix.needsUpdate = true;
        }
      }

      // Respiração no armário
      s.holdingBreath =
        s.hidingInLocker &&
        (rmbHeld || gpBreath || Boolean(mob.holdBreath)) &&
        s.breathSec > 0;
      if (s.holdingBreath) {
        s.breathSec = Math.max(0, s.breathSec - dt);
        if (s.breathSec <= 2.5 && !s.lowBreathCued) {
          s.lowBreathCued = true;
          st.onGameplayCue?.("breath_low");
        }
      } else {
        s.breathSec = Math.min(
          PHYSICS_PARAMS.maxBreathSec,
          s.breathSec + dt * 1.4
        );
        if (s.breathSec >= 6.0) {
          s.lowBreathCued = false;
        }
      }

      // Espiar (Peek Q/E fora do armário)
      const peekDir = s.hidingInLocker
        ? 0
        : (keysHeld.has("KeyE") ? 1 : 0) - (keysHeld.has("KeyQ") ? 1 : 0) + gpPeekDir;
      const targetHeight = s.hidingInLocker
        ? 1.32
        : s.crouching
          ? PHYSICS_PARAMS.eyeCrouching
          : PHYSICS_PARAMS.eyeStanding;

      const shakeX =
        s.shakeTrauma > 0
          ? (Math.random() * 2 - 1) * s.shakeTrauma * s.shakeTrauma * 0.08
          : 0;
      const shakeY =
        s.shakeTrauma > 0
          ? (Math.random() * 2 - 1) * s.shakeTrauma * s.shakeTrauma * 0.08
          : 0;
      s.shakeTrauma = Math.max(0, s.shakeTrauma - dt * 1.8);

      const camX = s.hidingInLocker
        ? st.chapter.lockerPos.hideX
        : s.px - Math.cos(s.yaw) * peekDir * 0.42;
      const camZ = s.hidingInLocker
        ? st.chapter.lockerPos.hideZ
        : s.pz + Math.sin(s.yaw) * peekDir * 0.42;

      camera.position.x =
        THREE.MathUtils.damp(camera.position.x, camX, 12, dt) + shakeX;
      camera.position.y =
        THREE.MathUtils.damp(camera.position.y, targetHeight, 10, dt) + shakeY;
      camera.position.z = THREE.MathUtils.damp(camera.position.z, camZ, 12, dt);

      _lookTarget.set(
        camera.position.x + Math.sin(s.yaw) * Math.cos(s.pitch) * 5,
        camera.position.y + Math.sin(s.pitch) * 5,
        camera.position.z + Math.cos(s.yaw) * Math.cos(s.pitch) * 5
      );
      camera.lookAt(_lookTarget);
      camera.rotation.z += -peekDir * 0.16;

      // Lanterna segura para ARM Mali + aviso visual sutil de emboscada do Diretor
      const flickerDip =
        s.ambushFlickerWarning &&
        !st.photosensitiveMode &&
        Math.sin(elapsed * 32) > 0.25
          ? 1.15
          : 3.8;
      flashlight.intensity = s.flashlightOn && s.batterySec > 0 ? flickerDip : 0;
      flashlight.target.position.set(0.02, -0.08, -6.5);
      tricorderLight.intensity = s.tricorderOn ? 1.85 : 0;

      // Cálculo de ruído atual (metros) + Armadilhas Sonoras + Isca Sonora
      let noiseM = 0;
      if (s.pumpingDynamo) noiseM = Math.max(noiseM, PHYSICS_PARAMS.noiseDynamoM);
      if (s.tricorderOn)
        noiseM = Math.max(noiseM, PHYSICS_PARAMS.noiseTricorderM);
      if (!s.hidingInLocker && mag > 0.1) {
        noiseM = Math.max(
          noiseM,
          sprinting
            ? PHYSICS_PARAMS.noiseSprintM
            : isStealthSlow
              ? PHYSICS_PARAMS.noiseCrouchM * 0.55
              : s.crouching
                ? PHYSICS_PARAMS.noiseCrouchM
                : PHYSICS_PARAMS.noiseWalkM
        );
      }

      for (const tid of Object.keys(s.trapCooldowns)) {
        if (s.trapCooldowns[tid] > 0) {
          s.trapCooldowns[tid] = Math.max(0, s.trapCooldowns[tid] - dt);
        }
      }
      if (!s.hidingInLocker && mag > 0.25 && !s.crouching && !isStealthSlow) {
        for (const trap of st.chapter.soundTraps) {
          if (
            (s.trapCooldowns[trap.id] ?? 0) <= 0 &&
            Math.hypot(s.px - trap.x, s.pz - trap.z) <= trap.radius
          ) {
            s.trapCooldowns[trap.id] = 4.0;
            noiseM = Math.max(noiseM, 14.0);
            if (trap.kind === "glass") soundEngine.playGlassCrunch();
            else soundEngine.playPuddleSplash();
            s.investigateX = trap.x;
            s.investigateZ = trap.z;
            if (s.ventDropped && s.directorWavePhase !== "vent_retreat" && s.newbornState === "Patrol") {
              s.newbornState = "Investigate";
            }
            st.onSoundTrapTriggered?.(trap.kind);
            st.onAlertTriggered?.();
          }
        }
      }

      if (s.activeDecoyTimer > 0) {
        s.activeDecoyTimer = Math.max(0, s.activeDecoyTimer - dt);
        s.activeDecoyBeepTimer -= dt;
        if (s.activeDecoyBeepTimer <= 0) {
          s.activeDecoyBeepTimer = 0.85;
          soundEngine.playDecoyBeep();
        }
      }

      // Script inicial Cap. 1 + IA com NavMesh & Raycast de paredes
      s.introScriptTimer += dt;
      const ch = st.chapter;
      if (
        !ch.newbornActiveFromStart &&
        !st.relaySolved &&
        s.introScriptTimer < 6.0
      ) {
        s.newbornState = "Observe";
        if (s.introScriptTimer < 2.5) {
          s.nx = -1.0;
          s.nz = 2.5;
          s.ny = 0;
          world.newborn.root.rotation.y = Math.PI + 0.18;
        } else {
          const t = Math.min(1, (s.introScriptTimer - 2.5) / 3.2);
          s.nx = THREE.MathUtils.lerp(-1.0, 0.2, t);
          s.nz = THREE.MathUtils.lerp(2.5, 8.2, t);
          s.ny = t > 0.65 ? Math.min(2.6, (t - 0.65) * 8) : 0;
          world.newborn.root.rotation.y = 0.2;
        }
        world.newborn.root.visible = s.introScriptTimer < 5.7;
      } else if (!ch.newbornActiveFromStart && !st.relaySolved) {
        world.newborn.root.visible = false;
        s.newbornState = "Observe";
      } else {
        if (!s.ventDropped) {
          s.ventDropped = true;
          s.nx = 0;
          s.ny = 0;
          s.nz = 8.2;
          s.newbornState = "Investigate";
          s.investigateX = 3.2;
          s.investigateZ = 11.4;
          s.directorWavePhase = "pressure";
          s.directorWaveTimer = 0;
          soundEngine.playHurt();
          st.onNewbornVentTriggered();
        }

        // Diretor de Ondas IA (Pressão <-> Recuo pelos dutos com aviso pré-emboscada)
        const dirRes = advanceDirectorWave({
          wavePhase: s.directorWavePhase,
          timerSec: s.directorWaveTimer,
          dt,
          newbornState: s.newbornState,
          difficulty: st.difficulty ?? "sobrevivencia",
        });
        s.directorWavePhase = dirRes.wavePhase;
        s.directorWaveTimer = dirRes.timerSec;
        s.ambushFlickerWarning = dirRes.ambushFlickerWarning;

        if (dirRes.event === "retreat_to_vent") {
          s.ambushWarningFired = false;
          soundEngine.playVentCreak();
        } else if (dirRes.event === "drop_from_vent") {
          s.nx = 0;
          s.nz = 8.2;
          s.ny = 0;
          s.newbornState = "Investigate";
          s.investigateX = s.px;
          s.investigateZ = s.pz;
          s.ambushFlickerWarning = false;
          soundEngine.playHurt();
          st.onAlertTriggered?.();
        }

        if (dirRes.ambushFlickerWarning && !s.ambushWarningFired) {
          s.ambushWarningFired = true;
          soundEngine.playVentCreak();
          st.onAmbushWarning?.();
        }

        if (s.directorWavePhase === "vent_retreat") {
          s.ny = THREE.MathUtils.damp(s.ny, 2.75, 5, dt);
          world.newborn.root.visible = s.ny < 2.45;
        } else {
          s.ny = THREE.MathUtils.damp(s.ny, 0, 8, dt);
          world.newborn.root.visible = true;

          const dist = Math.hypot(s.nx - s.px, s.nz - s.pz);
          const lineClear = hasWallLineOfSight(
            s.nx,
            s.nz,
            s.px,
            s.pz,
            effectiveWalls
          );

          const perc = evaluateNewbornPerception({
            distanceM: dist,
            hasLineOfSight: lineClear,
            flashlightOn: s.flashlightOn,
            roomLit: false,
            playerNoiseM: noiseM,
            playerHidingInLocker: s.hidingInLocker,
            breathHeld: s.holdingBreath,
            playerBleeding: st.health === "vermelho",
            stunTimerSec: s.stunTimer,
            currentState: s.newbornState,
            sightRangeMult: diffCfg.sightRangeMult,
          });

          const prevState = s.newbornState;
          s.newbornState = perc.nextState;

          // Isca Sonora atrai Newborn caso não esteja em caçada direta
          if (
            s.activeDecoyTimer > 0 &&
            s.newbornState !== "Hunt" &&
            s.stunTimer <= 0
          ) {
            s.newbornState = "Investigate";
            s.investigateX = s.activeDecoyX;
            s.investigateZ = s.activeDecoyZ;
          } else if (perc.detectedBy === "sound" || perc.detectedBy === "scent") {
            s.investigateX = s.px;
            s.investigateZ = s.pz;
          }

          if (s.newbornState !== prevState) {
            if (s.newbornState === "Hunt") {
              st.onGameplayCue?.("newborn_hunt");
              st.onAlertTriggered?.();
            } else if (s.newbornState === "Investigate" && prevState !== "Hunt") {
              st.onGameplayCue?.("newborn_investigate");
              st.onAlertTriggered?.();
            }
            const batteryPct = Math.round(
              (s.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100
            );
            const metrics = computePanicMetrics({
              health: st.health,
              newbornDist: dist,
              newbornVisible: true,
              newbornState: s.newbornState,
              batteryPct,
              flashlightOn: s.flashlightOn,
              hidingInLocker: s.hidingInLocker,
              holdingBreath: s.holdingBreath,
            });
            panicLogger.log(
              {
                event:
                  s.newbornState === "Hunt" || s.newbornState === "Investigate"
                    ? "detection_trigger"
                    : "state_transition",
                detail: `Newborn ${prevState} -> ${s.newbornState} (via ${perc.detectedBy})`,
                panicPct: Math.round(metrics.panicLevel * 100),
                heartRateBpm: metrics.estimatedBpm,
                newbornDistM: dist,
                newbornState: s.newbornState,
                health: st.health,
                resources: {
                  batteryPct,
                  flashlightOn: s.flashlightOn,
                  tricorderOn: s.tricorderOn,
                  hidingInLocker: s.hidingInLocker,
                  kitsRemaining: st.kitsCount,
                },
              },
              true
            );
          }

          if (s.newbornState === "Hunt") {
            s.huntMemoryTimer = 6.0;
          } else if (s.huntMemoryTimer > 0) {
            s.huntMemoryTimer -= dt;
          }

          let targetX = s.nx;
          let targetZ = s.nz;
          let speed = 0;

          if (s.newbornState === "Hunt") {
            targetX = s.px;
            targetZ = s.pz;
            speed = PHYSICS_PARAMS.newbornHuntSpeed * diffCfg.newbornSpeedMult;
          } else if (s.newbornState === "Investigate") {
            targetX = s.investigateX;
            targetZ = s.investigateZ;
            speed =
              PHYSICS_PARAMS.newbornInvestigateSpeed * diffCfg.newbornSpeedMult;
            if (Math.hypot(targetX - s.nx, targetZ - s.nz) < 0.7) {
              s.newbornState = "Patrol";
            }
          } else if (s.newbornState === "Patrol") {
            const wp = ch.patrolPoints[s.patrolIdx % ch.patrolPoints.length];
            targetX = wp.x;
            targetZ = wp.z;
            speed = PHYSICS_PARAMS.newbornPatrolSpeed * diffCfg.newbornSpeedMult;
            if (Math.hypot(targetX - s.nx, targetZ - s.nz) < 0.85) {
              s.patrolIdx = (s.patrolIdx + 1) % ch.patrolPoints.length;
            }
          }

          if (speed > 0) {
            const navHop = findNextNavWaypoint(
              s.nx,
              s.nz,
              targetX,
              targetZ,
              effectiveWalls,
              ch.navNodes
            );
            const dx = navHop.x - s.nx;
            const dz = navHop.z - s.nz;
            const d = Math.hypot(dx, dz) || 1;
            const nextNx = s.nx + (dx / d) * speed * dt;
            const nextNz = s.nz + (dz / d) * speed * dt;
            const resolvedN = resolveCircleWallCollision(
              nextNx,
              nextNz,
              0.4,
              effectiveWalls
            );
            s.nx = resolvedN.x;
            s.nz = resolvedN.z;
            world.newborn.root.rotation.y = Math.atan2(dx, dz);
          }

          if (
            !s.hidingInLocker &&
            s.stunTimer <= 0 &&
            s.hitCooldown <= 0 &&
            Math.hypot(s.nx - s.px, s.nz - s.pz) < 1.15
          ) {
            s.hitCooldown = 3.2;
            s.shakeTrauma = 1.0;
            soundEngine.playHurt();
            if (st.health === "vermelho") {
              s.lungeTimer = 0.55;
              soundEngine.playNewbornClick();
              return;
            }
            s.adrenalineTimer = 3.0;
            s.hitstopTimer = 0.06;
            st.onPlayerHurt();
          }
        }
      }

      // Pose orgânica articulada do Newborn
      world.newborn.root.position.set(s.nx, s.ny, s.nz);
      applyNewbornPose(s.newbornState, elapsed);

      const distPlayer = Math.hypot(s.nx - s.px, s.nz - s.pz);
      const batteryPct = Math.round((s.batterySec / PHYSICS_PARAMS.maxBatterySec) * 100);
      const panicMetrics = computePanicMetrics({
        health: st.health,
        newbornDist: distPlayer,
        newbornVisible: world.newborn.root.visible,
        newbornState: s.newbornState,
        batteryPct,
        flashlightOn: s.flashlightOn,
        hidingInLocker: s.hidingInLocker,
        holdingBreath: s.holdingBreath,
      });

      soundEngine.updatePhysiology({
        active: true,
        dangerLevel: panicMetrics.panicLevel,
        breathRatio: s.breathSec / PHYSICS_PARAMS.maxBreathSec,
        holdingBreath: s.holdingBreath,
        sprinting,
        injured: st.health === "vermelho",
        externalHeartbeatActive: st.health === "vermelho",
      });

      // Dolly Zoom dinâmico + compensação automática para modo Vertical (aspect < 1)
      const dollyBaseFov = computeDollyZoomFov(
        distPlayer,
        world.newborn.root.visible,
        s.newbornState,
        st.health
      );
      const targetFov = computeResponsiveFov(dollyBaseFov, camera.aspect);
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5.2, dt);
        camera.updateProjectionMatrix();
      }

      // Balanço de respiração + tremor de pânico no Viewmodel 1ª Pessoa
      const fearLevel = panicMetrics.panicLevel;
      const walkBob =
        mag > 0.05 && !s.hidingInLocker
          ? Math.sin(elapsed * (sprinting ? 14 : 8.5)) * 0.012
          : 0;
      const breathBob = Math.sin(elapsed * (2.1 + fearLevel * 1.4)) * 0.005;
      const panicTremor =
        fearLevel > 0.25 && !st.photosensitiveMode
          ? Math.sin(elapsed * 33.0) * fearLevel * 0.0075
          : 0;

      world.viewmodel.rightHand.position.set(
        0.24 + panicTremor,
        -0.22 + breathBob + walkBob,
        -0.38
      );
      world.viewmodel.flashlightLensMat.emissiveIntensity =
        s.flashlightOn && s.batterySec > 0 ? 1.8 : 0.05;
      world.viewmodel.beamConeMesh.visible = s.flashlightOn && s.batterySec > 0;

      const targetTriY = s.tricorderOn ? -0.145 : -0.46;
      world.viewmodel.leftHand.position.x = -0.26 - panicTremor * 0.7;
      world.viewmodel.leftHand.position.y = THREE.MathUtils.damp(
        world.viewmodel.leftHand.position.y,
        targetTriY + breathBob * 0.6,
        9,
        dt
      );
      world.viewmodel.tricorderScreenMat.emissiveIntensity = s.tricorderOn
        ? 1.4
        : 0;

      // Atualiza shader de pós-processamento (Radial Blur + Distorção Dolly Zoom + Grão + Aberração Cromática)
      if (horrorPass) {
        horrorPass.uniforms.uTime.value = elapsed;
        horrorPass.uniforms.uFear.value = st.photosensitiveMode
          ? Math.min(0.25, fearLevel)
          : fearLevel;
        const targetRadial = st.photosensitiveMode
          ? panicMetrics.radialBlurStrength * 0.35
          : panicMetrics.radialBlurStrength;
        const targetDistort = st.photosensitiveMode
          ? panicMetrics.lensDistortion * 0.35
          : panicMetrics.lensDistortion;
        horrorPass.uniforms.uRadialBlur.value = THREE.MathUtils.damp(
          horrorPass.uniforms.uRadialBlur.value,
          targetRadial,
          6.0,
          dt
        );
        horrorPass.uniforms.uLensDistortion.value = THREE.MathUtils.damp(
          horrorPass.uniforms.uLensDistortion.value,
          targetDistort,
          6.0,
          dt
        );
      }

      if (panicMetrics.panicLevel >= 0.38 || st.health === "vermelho") {
        panicLogger.log({
          event: "panic_sample",
          detail: `Amostra contínua (${ch.shortLabel})`,
          panicPct: Math.round(panicMetrics.panicLevel * 100),
          heartRateBpm: panicMetrics.estimatedBpm,
          newbornDistM: distPlayer,
          newbornState: s.newbornState,
          health: st.health,
          resources: {
            batteryPct,
            flashlightOn: s.flashlightOn,
            tricorderOn: s.tricorderOn,
            hidingInLocker: s.hidingInLocker,
            kitsRemaining: st.kitsCount,
          },
        });
      }

      s.jawClickTimer += dt;
      if (
        world.newborn.root.visible &&
        distPlayer < 9 &&
        s.jawClickTimer > (s.newbornState === "Hunt" ? 0.8 : 2.1)
      ) {
        s.jawClickTimer = 0;
        soundEngine.playNewbornClick();
      }

      // Atualizar HUD a ~10Hz
      telemetryTimer += dt;
      if (telemetryTimer >= 0.1) {
        telemetryTimer = 0;
        const near = findNearestInteractable();
        const glitch =
          world.newborn.root.visible && distPlayer < 8
            ? Math.min(1, (8 - distPlayer) / 6)
            : 0;
        const stealthExposurePct = computeStealthExposurePct({
          flashlightOn: s.flashlightOn,
          noiseM,
          hidingInLocker: s.hidingInLocker,
          holdingBreath: s.holdingBreath,
          newbornState: s.newbornState,
        });
        st.onTelemetry({
          batterySec: s.batterySec,
          breathSec: s.breathSec,
          noiseM,
          playerX: s.px,
          playerZ: s.pz,
          playerYaw: s.yaw,
          newbornX: s.nx,
          newbornZ: s.nz,
          newbornState: s.newbornState,
          newbornDist: distPlayer,
          flashlightOn: s.flashlightOn,
          tricorderOn: s.tricorderOn,
          crouching: s.crouching,
          sprinting,
          hidingInLocker: s.hidingInLocker,
          holdingBreath: s.holdingBreath,
          pumpingDynamo: s.pumpingDynamo,
          nearbyId: near?.id ?? null,
          nearbyLabel: near?.label ?? null,
          proximityGlitch: glitch,
          panicPct: Math.round(panicMetrics.panicLevel * 100),
          heartRateBpm: panicMetrics.estimatedBpm,
          radialBlurStrength: panicMetrics.radialBlurStrength,
          stealthExposurePct,
          containmentActiveSec: s.containmentActiveSec,
          containmentCooldownSec: s.containmentCooldownSec,
          directorWarning: s.ambushFlickerWarning,
          decoyActiveSec: s.activeDecoyTimer,
        });
      }
    }

    let fpsSampleFrames = 0;
    let fpsSampleElapsed = 0;

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      const dt = Math.min(rawDt, 0.05);
      const elapsed = now / 1000;

      if (
        !autoDowngraded &&
        !isSoftwareGl &&
        stateRef.current.graphicsPreset === "auto" &&
        stateRef.current.phase === "playing" &&
        !stateRef.current.pausedByModal
      ) {
        fpsSampleFrames += 1;
        fpsSampleElapsed += rawDt;
        if (fpsSampleElapsed >= 1.8) {
          const avgFps = fpsSampleFrames / fpsSampleElapsed;
          fpsSampleFrames = 0;
          fpsSampleElapsed = 0;
          if (avgFps < 26) {
            autoDowngraded = true;
            applyGraphicsConfig();
          }
        }
      }

      if (!contextLost) {
        stepSimulation(dt, elapsed);
        if (composer && getEffGraphics().usePostProcessing) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      syncViewportRef.current = null;
      applyGraphicsRef.current = null;
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncViewportSize);
      window.removeEventListener("orientationchange", syncViewportSize);
      window.visualViewport?.removeEventListener("resize", syncViewportSize);
      screenOri?.removeEventListener?.("change", syncViewportSize);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove", onTouchMove);
      renderer.domElement.removeEventListener("touchend", onTouchEnd);
      renderer.domElement.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", clearInputs);
      document.removeEventListener("visibilitychange", clearInputs);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored
      );
      composer?.dispose();
      envTex.dispose();
      for (const d of world.disposables) {
        d.dispose();
      }
      renderer.dispose();
    };
  }, [soundEngine, mobileInputRef, chapter.id]);

  useEffect(() => {
    applyGraphicsRef.current?.();
  }, [graphicsPreset, brightness]);

  // Atualiza aspecto e FOV instantaneamente sempre que useOrientation detectar mudança de tela/rotação
  useEffect(() => {
    syncViewportRef.current?.();
  }, [
    orientation.width,
    orientation.height,
    orientation.aspect,
    orientation.angle,
    orientation.orientationType,
  ]);

  return (
    <div
      ref={mountRef}
      data-testid="vanguard-3d-viewport"
      data-orientation={orientation.isPortrait ? "portrait" : "landscape"}
      className="fixed inset-0 z-0 h-[100dvh] w-[100vw] touch-none bg-[#030509]"
    />
  );
};

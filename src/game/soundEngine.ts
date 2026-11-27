export interface PhysiologyAudioState {
  active: boolean;
  dangerLevel: number; // 0..1
  breathRatio: number; // 0..1 (1 = full, 0 = exhausted)
  holdingBreath: boolean;
  sprinting: boolean;
  injured: boolean;
  externalHeartbeatActive: boolean;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private ambientMasterGain: GainNode | null = null;
  private breathNoiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private ducked = false;
  private lastBreathAtMs = 0;
  private lastPhysBeatAtMs = 0;
  private wasHoldingBreath = false;
  private gestureListenerAttached = false;
  private userGestureUnlocked = false;

  private attachGestureUnlock() {
    if (this.gestureListenerAttached || typeof window === "undefined") return;
    this.gestureListenerAttached = true;
    const unlock = () => {
      this.userGestureUnlocked = true;
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    };
    window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
    window.addEventListener("keydown", unlock, { capture: true, passive: true });
    window.addEventListener("touchstart", unlock, { capture: true, passive: true });
  }

  private getAmbientTargetGain(): number {
    if (this.muted) return 0;
    return this.ducked ? 0.32 : 1.0;
  }

  private getOrCreateAmbientBus(ctx: AudioContext): GainNode {
    if (!this.ambientMasterGain) {
      const bus = ctx.createGain();
      bus.gain.value = this.getAmbientTargetGain();
      bus.connect(ctx.destination);
      this.ambientMasterGain = bus;
    }
    return this.ambientMasterGain;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === "undefined") return null;
    this.attachGestureUnlock();
    const userActivation =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
            .userActivation
        : undefined;
    if (!this.userGestureUnlocked && userActivation && !userActivation.hasBeenActive) {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.ctx) {
      if (this.humGain) {
        this.humGain.gain.setTargetAtTime(mute ? 0 : 0.025, this.ctx.currentTime, 0.05);
      }
      if (this.ambientMasterGain) {
        this.ambientMasterGain.gain.setTargetAtTime(
          this.getAmbientTargetGain(),
          this.ctx.currentTime,
          0.06
        );
      }
    }
  }

  public setNarrationDucking(active: boolean) {
    this.ducked = active;
    if (this.ctx && this.ambientMasterGain) {
      this.ambientMasterGain.gain.setTargetAtTime(
        this.getAmbientTargetGain(),
        this.ctx.currentTime,
        0.12
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startAmbientHum() {
    const ctx = this.ensureContext();
    if (!ctx || this.humOsc) return;
    const bus = this.getOrCreateAmbientBus(ctx);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 58;
    gain.gain.value = this.muted ? 0 : 0.025;
    osc.connect(gain);
    gain.connect(bus);
    osc.start();
    this.humOsc = osc;
    this.humGain = gain;
  }

  public stopAmbientHum() {
    if (this.humOsc) {
      try {
        this.humOsc.stop();
        this.humOsc.disconnect();
      } catch {
        // Ignora
      }
      this.humOsc = null;
      this.humGain = null;
    }
  }

  public playClick(freq = 880) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.045);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playTricorderChirp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1320, 1760, 1540].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.06, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.055);
    });
  }

  public playFootstep(crouching: boolean, sprinting: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const jitter = 0.92 + Math.random() * 0.16;
    osc.type = "triangle";
    osc.frequency.setValueAtTime((crouching ? 95 : 135) * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.07);
    const vol = crouching ? 0.025 : sprinting ? 0.1 : 0.055;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playDynamoCrank() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(410, now + 0.14);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playDoorPneumatic() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playNewbornClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.035);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playHurt() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.28);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  public playHeartbeat(intensity = 0.7) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.28, 0.1 + intensity * 0.16);
    // Dois batimentos ("lub-dub") com sub-grave realista
    [
      { offset: 0, startFreq: 74, endFreq: 34, gainMul: 1.0 },
      { offset: 0.14, startFreq: 62, endFreq: 30, gainMul: 0.72 },
    ].forEach((b) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(b.startFreq, now + b.offset);
      osc.frequency.exponentialRampToValueAtTime(b.endFreq, now + b.offset + 0.11);
      gain.gain.setValueAtTime(0.001, now + b.offset);
      gain.gain.linearRampToValueAtTime(vol * b.gainMul, now + b.offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, now + b.offset + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + b.offset);
      osc.stop(now + b.offset + 0.15);
    });
  }

  public playDistressAmbient() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const variant = Math.floor(Math.random() * 3);

    if (variant === 0) {
      // Pancada rítmica distante nos dutos / tubulação
      const hits = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < hits; i++) {
        const t = now + i * (0.24 + Math.random() * 0.08);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(92 - i * 8, t);
        osc.frequency.exponentialRampToValueAtTime(32, t + 0.22);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      }
    } else if (variant === 1) {
      // Gemido metálico grave da estrutura subterrânea
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(52 + Math.random() * 14, now);
      osc.frequency.linearRampToValueAtTime(39, now + 1.3);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(85, now + 1.3);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.4);
    } else {
      // Sopro / sussurro distante pelos dutos de ventilação
      const bufferSize = Math.floor(ctx.sampleRate * 0.9);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const env = Math.sin((i / bufferSize) * Math.PI);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(340, now);
      filter.Q.value = 3.5;
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.getOrCreateAmbientBus(ctx));
      src.start(now);
    }
  }

  public playSparkZap() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.07);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playVictoryChord() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [220, 277.18, 329.63, 440].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.06 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + 1.45);
    });
  }

  private getBreathBuffer(ctx: AudioContext): AudioBuffer {
    if (this.breathNoiseBuffer && this.breathNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.breathNoiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 1.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 2.8;
    }
    this.breathNoiseBuffer = buf;
    return buf;
  }

  public playBreathCycle(intensity: number, isGasp = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clamped = Math.max(0.1, Math.min(1, intensity));
    const dur = isGasp ? 0.55 : 0.42 + (1 - clamped) * 0.42;
    const src = ctx.createBufferSource();
    src.buffer = this.getBreathBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(isGasp ? 980 : 620 + clamped * 340, now);
    filter.frequency.linearRampToValueAtTime(isGasp ? 520 : 420 + clamped * 220, now + dur);
    filter.Q.value = isGasp ? 1.8 : 2.6;

    const gain = ctx.createGain();
    const peak = (isGasp ? 0.14 : 0.022 + clamped * 0.075) * (this.ducked ? 0.55 : 1);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peak, now + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  public updatePhysiology(state: PhysiologyAudioState) {
    if (!state.active || this.muted) {
      this.wasHoldingBreath = state.holdingBreath;
      return;
    }
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (this.wasHoldingBreath && !state.holdingBreath && state.breathRatio < 0.55) {
      this.playBreathCycle(1.0, true);
      this.lastBreathAtMs = nowMs;
    }
    this.wasHoldingBreath = state.holdingBreath;

    const stress = Math.max(
      state.dangerLevel,
      state.injured ? 0.72 : 0,
      state.sprinting ? 0.55 : 0,
      1 - state.breathRatio
    );

    if (!state.holdingBreath) {
      const breathPeriodMs = Math.round(2150 - stress * 1380);
      if (nowMs - this.lastBreathAtMs >= breathPeriodMs) {
        this.lastBreathAtMs = nowMs;
        this.playBreathCycle(0.18 + stress * 0.82, false);
      }
    }

    if (!state.externalHeartbeatActive && (stress >= 0.42 || state.holdingBreath)) {
      const beatPeriodMs = Math.round(1020 - stress * 560);
      if (nowMs - this.lastPhysBeatAtMs >= beatPeriodMs) {
        this.lastPhysBeatAtMs = nowMs;
        this.playHeartbeat(0.25 + stress * 0.65);
      }
    }
  }

  public dispose() {
    this.stopAmbientHum();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.ambientMasterGain = null;
    this.breathNoiseBuffer = null;
  }
}

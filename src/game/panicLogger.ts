import { HealthState, NewbornAIState } from "./gameLogic";

export type PanicEventKind =
  | "detection_trigger"
  | "state_transition"
  | "heartbeat_spike"
  | "resource_use"
  | "injury"
  | "heal"
  | "panic_sample";

export interface PanicLogEntry {
  timestampIso: string;
  event: PanicEventKind;
  detail: string;
  panicPct: number;
  heartRateBpm: number;
  newbornDistM: number;
  newbornState: NewbornAIState;
  health: HealthState;
  resources: {
    batteryPct: number;
    flashlightOn: boolean;
    tricorderOn: boolean;
    hidingInLocker: boolean;
    kitsRemaining: number;
  };
}

class PanicTelemetryLogger {
  private lastSampleAt = 0;
  private readonly history: PanicLogEntry[] = [];

  log(
    entry: Omit<PanicLogEntry, "timestampIso">,
    force = false
  ): PanicLogEntry | null {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!force && entry.event === "panic_sample" && now - this.lastSampleAt < 2500) {
      return null;
    }
    if (entry.event === "panic_sample") {
      this.lastSampleAt = now;
    }

    const fullEntry: PanicLogEntry = {
      ...entry,
      timestampIso: new Date().toISOString(),
    };

    this.history.push(fullEntry);
    if (this.history.length > 100) {
      this.history.shift();
    }

    if (typeof console !== "undefined") {
      const badge =
        fullEntry.panicPct >= 75
          ? "color:#f43f5e;font-weight:bold"
          : fullEntry.panicPct >= 45
            ? "color:#f59e0b;font-weight:bold"
            : "color:#38bdf8;font-weight:bold";

      console.info(
        `%c[PÂNICO ${fullEntry.panicPct}% · ${fullEntry.event}]%c ${fullEntry.detail} | ♥ ${fullEntry.heartRateBpm} BPM | Newborn: ${fullEntry.newbornDistM.toFixed(1)}m (${fullEntry.newbornState}) | Saúde: ${fullEntry.health} | Bateria: ${fullEntry.resources.batteryPct}% | Lanterna: ${fullEntry.resources.flashlightOn ? "ON" : "OFF"} | Tricorder: ${fullEntry.resources.tricorderOn ? "ON" : "OFF"} | Kits: ${fullEntry.resources.kitsRemaining}`,
        badge,
        "color:inherit"
      );
    }

    return fullEntry;
  }

  getRecentEntries(): PanicLogEntry[] {
    return [...this.history];
  }
}

export const panicLogger = new PanicTelemetryLogger();

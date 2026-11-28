import React, { useEffect, useState } from "react";
import type {
  ActiveSubtitle,
  NarrationEmotion,
  SubtitleSize,
} from "../game/narrationManifest";

interface NarrationSubtitleProps {
  subtitle: ActiveSubtitle | null;
  enabled: boolean;
  size: SubtitleSize;
  touchControlsActive: boolean;
  inGameplay: boolean;
  inlineTitle?: boolean;
}

const EMOTION_META: Record<
  NarrationEmotion,
  {
    badge: string;
    borderClass: string;
    textClass: string;
    badgeClass: string;
    containerExtra: string;
  }
> = {
  calmo: {
    badge: "ARTHUR · SUSSURRO",
    borderClass: "border-cyan-500/45",
    textClass: "text-slate-100",
    badgeClass: "text-cyan-300",
    containerExtra: "",
  },
  tenso: {
    badge: "ARTHUR · TENSO",
    borderClass: "border-amber-500/55",
    textClass: "text-amber-50",
    badgeClass: "text-amber-300",
    containerExtra: "",
  },
  medo: {
    badge: "ARTHUR · MEDO",
    borderClass: "border-amber-600/65",
    textClass: "text-slate-100 italic",
    badgeClass: "text-amber-400",
    containerExtra: "",
  },
  ofegante: {
    badge: "ARTHUR · OFEGANTE",
    borderClass: "border-orange-500/75",
    textClass: "text-orange-50 italic tracking-wide",
    badgeClass: "text-orange-300",
    containerExtra: "",
  },
  panico: {
    badge: "ARTHUR · PÂNICO",
    borderClass: "border-rose-500/90",
    textClass: "text-rose-100 font-semibold",
    badgeClass: "text-rose-400",
    containerExtra: "subtitle-panic-tremor",
  },
};

const SIZE_CLASSES: Record<SubtitleSize, string> = {
  pequeno: "text-xs sm:text-sm",
  medio: "text-sm sm:text-base",
  grande: "text-base sm:text-lg",
};

export const NarrationSubtitle: React.FC<NarrationSubtitleProps> = ({
  subtitle,
  enabled,
  size,
  touchControlsActive,
  inGameplay,
  inlineTitle = false,
}) => {
  const [visibleWordCount, setVisibleWordCount] = useState(999);

  useEffect(() => {
    if (!subtitle || !enabled) return;
    const words = subtitle.text.split(" ");
    if (subtitle.emotion !== "ofegante" && subtitle.emotion !== "panico") {
      setVisibleWordCount(words.length);
      return;
    }

    // Efeito de fala entrecortada / rápida para ofegante e pânico
    setVisibleWordCount(2);
    const stepMs = Math.max(
      65,
      Math.min(180, Math.floor((subtitle.durationMs * 0.52) / Math.max(1, words.length)))
    );
    const id = window.setInterval(() => {
      setVisibleWordCount((prev) => {
        if (prev >= words.length) {
          window.clearInterval(id);
          return words.length;
        }
        return prev + 1;
      });
    }, stepMs);

    return () => window.clearInterval(id);
  }, [subtitle, enabled]);

  if (!enabled || !subtitle) return null;

  const meta = EMOTION_META[subtitle.emotion];
  const words = subtitle.text.split(" ");
  const shownText =
    visibleWordCount >= words.length
      ? subtitle.text
      : words.slice(0, visibleWordCount).join(" ");

  const placementClass = inlineTitle
    ? "pointer-events-none mt-3 w-full max-w-xl lg:fixed lg:bottom-10 lg:right-10 lg:mt-0 lg:z-35 lg:max-w-md"
    : inGameplay && touchControlsActive
      ? "pointer-events-none fixed inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] sm:top-[calc(3.95rem+env(safe-area-inset-top))] z-35 flex justify-center px-3 sm:px-6"
      : `pointer-events-none fixed inset-x-0 z-35 flex justify-center px-3 sm:px-6 ${
          inGameplay
            ? "bottom-[calc(2.75rem+env(safe-area-inset-bottom))] sm:bottom-[calc(3rem+env(safe-area-inset-bottom))]"
            : "bottom-[calc(2.5rem+env(safe-area-inset-bottom))] sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]"
        }`;

  return (
    <div
      data-testid="narration-subtitle"
      data-cue-id={subtitle.cueId}
      data-emotion={subtitle.emotion}
      aria-live={subtitle.emotion === "panico" ? "assertive" : "polite"}
      className={placementClass}
    >
      <div
        className={`max-w-xl border-l-2 bg-[#05080f]/88 px-4 py-2.5 shadow-[0_6px_28px_rgba(0,0,0,0.85)] ${meta.borderClass} ${meta.containerExtra}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={`font-mono-tabular text-[10px] font-bold uppercase tracking-[0.2em] ${meta.badgeClass}`}
          >
            {meta.badge}
          </span>
        </div>
        <p className={`mt-1 leading-snug ${SIZE_CLASSES[size]} ${meta.textClass}`}>
          “{shownText}”
        </p>
      </div>
    </div>
  );
};

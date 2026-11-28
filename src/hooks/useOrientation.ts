import { useEffect, useState } from "react";

export interface OrientationState {
  width: number;
  height: number;
  aspect: number;
  isPortrait: boolean;
  isLandscape: boolean;
  orientationType: string;
  angle: number;
}

export function readViewportOrientationState(): OrientationState {
  if (typeof window === "undefined") {
    return {
      width: 1280,
      height: 720,
      aspect: 1280 / 720,
      isPortrait: false,
      isLandscape: true,
      orientationType: "landscape-primary",
      angle: 0,
    };
  }

  const vv = window.visualViewport;
  const width = Math.max(1, Math.round(vv?.width || window.innerWidth || 1));
  const height = Math.max(1, Math.round(vv?.height || window.innerHeight || 1));
  const aspect = width / height;

  const screenOrientation = (
    window.screen as Screen & {
      orientation?: { type?: string; angle?: number };
    }
  )?.orientation;

  const rawType = screenOrientation?.type ?? "";
  const angle = typeof screenOrientation?.angle === "number" ? screenOrientation.angle : 0;
  // Aspecto real tem precedência se visualViewport girar antes da API screen.orientation em WebViews/emuladores
  const isPortrait = aspect < 1 || (aspect === 1 && rawType.startsWith("portrait"));

  return {
    width,
    height,
    aspect,
    isPortrait,
    isLandscape: !isPortrait,
    orientationType: rawType || (isPortrait ? "portrait-primary" : "landscape-primary"),
    angle,
  };
}

/**
 * Rastreia window.screen.orientation e window.visualViewport em tempo real
 * sem bloquear a rotação automática do dispositivo entre paisagem e retrato.
 */
export function useOrientation(): OrientationState {
  const [state, setState] = useState<OrientationState>(() =>
    readViewportOrientationState()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = () => {
      const next = readViewportOrientationState();
      setState((prev) =>
        prev.width === next.width &&
        prev.height === next.height &&
        prev.isPortrait === next.isPortrait &&
        prev.angle === next.angle &&
        prev.orientationType === next.orientationType
          ? prev
          : next
      );
    };

    update();

    const vv = window.visualViewport;
    const screenOri = (
      window.screen as Screen & {
        orientation?: EventTarget & { type?: string; angle?: number };
      }
    )?.orientation;

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    screenOri?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      screenOri?.removeEventListener?.("change", update);
    };
  }, []);

  return state;
}

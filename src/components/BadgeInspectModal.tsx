import React, { useState } from "react";
import { RotateCw, X } from "lucide-react";

interface BadgeInspectModalProps {
  badgeName?: string;
  badgeOwner?: string;
  expectedPin?: string;
  onClose: () => void;
  onPinDiscovered: () => void;
}

export const BadgeInspectModal: React.FC<BadgeInspectModalProps> = ({
  badgeName = "Crachá do Supervisor Médico",
  badgeOwner = "Dr. Henrique Mercer",
  expectedPin = "0719",
  onClose,
  onPinDiscovered,
}) => {
  const [rotY, setRotY] = useState(0);
  const [rotX, setRotX] = useState(8);
  const [dragging, setDragging] = useState(false);
  const [lastX, setLastX] = useState(0);
  const [lastY, setLastY] = useState(0);

  const normalizedY = ((rotY % 360) + 360) % 360;
  const isShowingBack = normalizedY > 95 && normalizedY < 265;

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    setLastX(e.clientX);
    setLastY(e.clientY);
    const nextY = rotY + dx * 0.9;
    setRotY(nextY);
    setRotX((prev) => Math.max(-35, Math.min(35, prev - dy * 0.5)));
    const norm = ((nextY % 360) + 360) % 360;
    if (norm > 95 && norm < 265) {
      onPinDiscovered();
    }
  };

  const flipToBack = () => {
    setRotY(180);
    setRotX(0);
    onPinDiscovered();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inspeção 3D do Crachá do Supervisor"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#07090d]/85 p-4"
    >
      <div className="w-full max-w-lg border border-amber-500/40 bg-[#0d121b] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
          <div>
            <p className="text-xs font-mono-tabular text-amber-400">
              Inspeção 3D · Jogo Pausado
            </p>
            <h2 className="font-display text-xl font-bold text-slate-100">
              {badgeName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar inspeção"
            className="flex h-10 w-10 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-300">
          Arraste o cartão para girá-lo em 360° ou clique em Virar Cartão para
          examinar o verso.
        </p>

        <div
          onPointerDown={(e) => {
            setDragging(true);
            setLastX(e.clientX);
            setLastY(e.clientY);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
          className="mt-4 flex h-64 cursor-grab items-center justify-center border border-slate-800 bg-[#06080d] active:cursor-grabbing"
          style={{ perspective: "900px" }}
        >
          <div
            className="relative h-44 w-72 transition-transform duration-75"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            }}
          >
            {/* Frente do crachá */}
            <div
              className="absolute inset-0 flex flex-col justify-between border-2 border-cyan-400/60 bg-[#141c2b] p-4"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="flex items-center justify-between border-b border-amber-500/40 pb-2">
                <span className="font-display text-xs font-bold tracking-wider text-amber-400">
                  AETHELGARD BIO-DYNAMICS
                </span>
                <span className="font-mono-tabular text-xs text-cyan-300">
                  NV. 1
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-12 items-center justify-center border border-slate-600 bg-slate-800 font-display text-xs text-slate-400">
                  FOTO
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-white">
                    {badgeOwner}
                  </div>
                  <div className="text-xs text-slate-400">
                    Autorização Setorial · Vanguard-7
                  </div>
                  <div className="mt-1 font-mono-tabular text-[11px] text-rose-400">
                    Chip RF danificado
                  </div>
                </div>
              </div>
              <div className="h-2 w-full bg-amber-500/80" />
            </div>

            {/* Verso com código riscado */}
            <div
              className="absolute inset-0 flex flex-col justify-between border-2 border-slate-600 bg-[#1a2230] p-4"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="h-7 w-full bg-black/80" />
              <div className="my-auto border border-dashed border-amber-400/50 bg-[#0b1018] p-3 text-center">
                <div className="text-xs text-slate-400">
                  Anotação riscada no plástico:
                </div>
                <div className="mt-1 font-mono-tabular text-2xl font-bold tracking-[0.25em] text-amber-400">
                  {expectedPin}
                </div>
              </div>
              <div className="text-right font-mono-tabular text-[11px] text-slate-500">
                VANGUARD-7 · USO INTERNO
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={flipToBack}
            className="flex items-center gap-2 border border-cyan-500/50 bg-cyan-950/50 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-900/60"
          >
            <RotateCw className="h-4 w-4" />
            Virar Cartão
          </button>
          <div className="text-xs font-mono-tabular text-slate-300">
            {isShowingBack
              ? `Código encontrado: ${expectedPin}`
              : "Frente (gire para ler o verso)"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

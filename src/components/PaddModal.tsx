import React from "react";
import { Eye, FileText, HeartPulse, Map as MapIcon, Package, Radio, Trash2, X } from "lucide-react";
import { ChapterConfig, HealthState, InventoryItem } from "../game/gameLogic";
import { LiveTelemetry } from "./VanguardCanvas";

export type PaddTab = "inventario" | "mapa" | "logs";

interface PaddModalProps {
  chapter: ChapterConfig;
  activeTab: PaddTab;
  onTabChange: (tab: PaddTab) => void;
  inventory: InventoryItem[];
  health: HealthState;
  telemetry: LiveTelemetry;
  relaySolved: boolean;
  doorUnlocked: boolean;
  hasKitPickup: boolean;
  hasBadgePickup: boolean;
  pinDiscovered: boolean;
  onUseItem: (id: string) => void;
  onInspectItem: (id: string) => void;
  onDiscardItem: (id: string) => void;
  onOpenStudio: () => void;
  onClose: () => void;
}

export const PaddModal: React.FC<PaddModalProps> = ({
  chapter,
  activeTab,
  onTabChange,
  inventory,
  health,
  telemetry,
  relaySolved,
  doorUnlocked,
  hasKitPickup,
  hasBadgePickup,
  pinDiscovered,
  onUseItem,
  onInspectItem,
  onDiscardItem,
  onOpenStudio,
  onClose,
}) => {
  // Mapeia coordenadas do mundo (-9.8..9.8 X, -6.0..14.2 Z) para SVG 220x200
  const mapX = (wx: number) => ((wx + 10.2) / 20.4) * 220;
  const mapZ = (wz: number) => 200 - ((wz + 6.4) / 21.0) * 200;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PADD de Pulso LCARS"
      className="safe-area-modal fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[#07090d]/85 p-3 sm:p-4"
    >
      <div className="my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col border border-amber-500/50 bg-[#0b1018] shadow-2xl">
        {/* Barra superior LCARS */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-[#111824] px-3.5 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center gap-3">
            <span className="h-4 w-2 bg-amber-500" />
            <div>
              <div className="font-display text-base font-bold tracking-wide text-amber-400">
                PADD DE PULSO · VANGUARD-7
              </div>
              <div className="font-mono-tabular text-xs text-slate-400">
                Arthur Vance · Engenheiro Nv. 2
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenStudio}
              className="flex items-center gap-1.5 border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70"
            >
              <Radio className="h-3.5 w-3.5" />
              Estúdio IA / Rádio
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar PADD"
              className="flex h-9 w-9 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex overflow-x-auto border-b border-slate-800 bg-[#0e1420] px-3 pt-1.5 sm:px-5 sm:pt-2">
          <button
            type="button"
            onClick={() => onTabChange("inventario")}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium ${
              activeTab === "inventario"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Inventário ({inventory.length}/6)
          </button>
          <button
            type="button"
            onClick={() => onTabChange("mapa")}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium ${
              activeTab === "mapa"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <MapIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Mapa Holográfico
          </button>
          <button
            type="button"
            onClick={() => onTabChange("logs")}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium ${
              activeTab === "logs"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Arquivos & Logs
          </button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto p-3.5 sm:p-5">
          {activeTab === "inventario" && (
            <div className="space-y-4">
              {/* Barra ECG de Saúde */}
              <div className="flex items-center justify-between border border-slate-800 bg-[#080c14] p-3">
                <div className="flex items-center gap-3">
                  <HeartPulse
                    className={`h-6 w-6 ${
                      health === "verde" ? "text-emerald-400" : "text-rose-500"
                    }`}
                  />
                  <div>
                    <div className="text-xs text-slate-400">
                      Monitor Biométrico (ECG)
                    </div>
                    <div
                      className={`font-display text-base font-bold ${
                        health === "verde" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {health === "verde"
                        ? "ESTÁVEL (VERDE)"
                        : "TRAUMA SEVERO · SANGRANDO (VERMELHO)"}
                    </div>
                  </div>
                </div>
                <div className="font-mono-tabular text-xs text-slate-400">
                  Bateria Lanterna:{" "}
                  <span className="text-amber-300">
                    {Math.round((telemetry.batterySec / 240) * 100)}%
                  </span>
                </div>
              </div>

              {/* Grade de 6 slots */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, idx) => {
                  const item = inventory[idx];
                  if (!item) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="flex h-28 items-center justify-center border border-dashed border-slate-800 bg-[#080b12] font-mono-tabular text-xs text-slate-600"
                      >
                        Slot 0{idx + 1} · Vazio
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between border border-slate-700 bg-[#101723] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-display text-sm font-bold text-slate-100">
                            {item.name}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {item.description}
                          </p>
                        </div>
                        <span className="font-mono-tabular text-xs text-amber-400">
                          x{item.quantity}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.category === "consumivel" && (
                          <button
                            type="button"
                            onClick={() => onUseItem(item.id)}
                            className="border border-emerald-500/60 bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-900"
                          >
                            Usar
                          </button>
                        )}
                        {item.inspectable && (
                          <button
                            type="button"
                            onClick={() => onInspectItem(item.id)}
                            className="flex items-center gap-1 border border-cyan-500/60 bg-cyan-950/60 px-2.5 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Inspecionar 3D
                          </button>
                        )}
                        {item.id === "cracha_supervisor" && pinDiscovered && (
                          <button
                            type="button"
                            onClick={() => onDiscardItem(item.id)}
                            className="flex items-center gap-1 border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-900/60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Descartar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "mapa" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center border border-cyan-500/30 bg-[#05080f] p-4">
                <svg
                  viewBox="0 0 220 200"
                  className="h-64 w-full max-w-[280px]"
                  aria-label="Mapa da Ala Médica"
                >
                  {/* Contorno do Setor Claustrofóbico */}
                  <rect
                    x={mapX(-9.8)}
                    y={mapZ(14.2)}
                    width={mapX(9.8) - mapX(-9.8)}
                    height={mapZ(-6.0) - mapZ(14.2)}
                    fill="#0b1524"
                    stroke="#06b6d4"
                    strokeWidth="1.5"
                  />
                  {/* Paredes e obstáculos dinâmicos do capítulo */}
                  {chapter.walls.map((w) => {
                    const rx = mapX(w.minX);
                    const ry = mapZ(w.maxZ);
                    const rw = Math.max(2, mapX(w.maxX) - mapX(w.minX));
                    const rh = Math.max(2, mapZ(w.minZ) - mapZ(w.maxZ));
                    return (
                      <rect
                        key={w.id}
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={
                          w.kind === "glass"
                            ? "#0e7490"
                            : w.kind === "tank"
                              ? "#166534"
                              : w.kind === "core"
                                ? "#0369a1"
                                : w.kind === "bunk" || w.kind === "desk"
                                  ? "#334155"
                                  : "#1e293b"
                        }
                        stroke={
                          w.kind === "glass"
                            ? "#22d3ee"
                            : w.kind === "tank"
                              ? "#4ade80"
                              : "#38bdf8"
                        }
                        strokeWidth={w.kind === "wall" ? "0.7" : "0.5"}
                        opacity={w.kind === "desk" || w.kind === "bunk" ? 0.85 : 0.92}
                      />
                    );
                  })}
                  {/* Comporta Norte */}
                  <rect
                    x={mapX(chapter.exitPos.x - 1.3)}
                    y={mapZ(chapter.exitPos.z + 0.3)}
                    width={mapX(chapter.exitPos.x + 1.3) - mapX(chapter.exitPos.x - 1.3)}
                    height="5"
                    fill={doorUnlocked ? "#10b981" : "#ef4444"}
                  />
                  {/* Painel de Relés */}
                  <circle
                    cx={mapX(chapter.relayPos.x)}
                    cy={mapZ(chapter.relayPos.z - 0.3)}
                    r="4"
                    fill={relaySolved ? "#10b981" : "#f59e0b"}
                  />
                  {/* Armário Esconderijo */}
                  <rect
                    x={mapX(chapter.lockerPos.x) - 3}
                    y={mapZ(chapter.lockerPos.z) - 3}
                    width="6"
                    height="6"
                    fill="#6366f1"
                  />
                  {/* Itens não coletados */}
                  {!hasKitPickup && (
                    <circle
                      cx={mapX(chapter.kitPos.x)}
                      cy={mapZ(chapter.kitPos.z)}
                      r="3.5"
                      fill="#10b981"
                    />
                  )}
                  {!hasBadgePickup && (
                    <circle
                      cx={mapX(chapter.badgePos.x)}
                      cy={mapZ(chapter.badgePos.z)}
                      r="3.5"
                      fill="#f59e0b"
                    />
                  )}
                  {/* Arthur */}
                  <circle
                    cx={mapX(telemetry.playerX)}
                    cy={mapZ(telemetry.playerZ)}
                    r="5"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <h3 className="font-display text-sm font-bold text-cyan-300">
                  {chapter.title}
                </h3>
                <ul className="space-y-1.5 font-mono-tabular">
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 bg-sky-400" /> Arthur Vance (Posição Atual)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 bg-rose-500" /> Comporta de Saída:{" "}
                    {doorUnlocked ? "ABERTA" : "TRANCADA (PIN 4 dígitos)"}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 bg-amber-400" /> Painel de Relés:{" "}
                    {relaySolved ? "ENERGIZADO" : "SEM ENERGIA"}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 bg-indigo-400" /> Armário Esconderijo (Proteção Total)
                  </li>
                </ul>
                <p className="border border-slate-800 bg-[#080c14] p-3 text-slate-400">
                  Dica de Sobrevivência: O Newborn não possui pálpebras. Apague a
                  lanterna (L) no breu ou esconda-se no Armário de Aço prendendo a
                  respiração (Botão Direito).
                </p>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-3">
              <div className="border border-slate-800 bg-[#080c14] p-4">
                <div className="font-mono-tabular text-xs text-amber-400">
                  {chapter.logTitle}
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  {chapter.logText}
                </p>
              </div>

              <div className="border border-slate-800 bg-[#080c14] p-4">
                <div className="font-mono-tabular text-xs text-cyan-400">
                  PROTOCOLO ÉDEN · Aviso Automático da Base
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  &ldquo;Contenção biológica ativa em todo o Complexo Vanguard-7.
                  Grades térmicas de incineração nos dutos superiores seladas até
                  autorização de nível Ômega.&rdquo;
                </p>
              </div>

              {pinDiscovered && (
                <div className="border border-emerald-500/40 bg-emerald-950/30 p-4">
                  <div className="font-mono-tabular text-xs text-emerald-400">
                    NOTA DESCOBERTA · {chapter.badgeName}
                  </div>
                  <p className="mt-1 text-sm text-emerald-100">
                    Código da comporta de saída:{" "}
                    <span className="font-mono-tabular font-bold">
                      {chapter.expectedPin}
                    </span>
                    .
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React from "react";
import {
  CheckCircle2,
  CloudDownload,
  Gamepad2,
  HardDrive,
  Keyboard,
  RefreshCw,
  Smartphone,
  Subtitles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import type { ChapterId, ControlMode } from "../game/gameLogic";
import {
  ChapterDownloadProgress,
  GameLevelsManifest,
  getEntryVersion,
  levelIdToChapterId,
} from "../game/manifestTypes";
import type { NarrationSettings, SubtitleSize } from "../game/narrationManifest";

interface DataManagerModalProps {
  manifest: GameLevelsManifest;
  chapterDownloads: Partial<Record<ChapterId, ChapterDownloadProgress>>;
  storageBackendLabel: string;
  controlMode: ControlMode;
  onChangeControlMode: (mode: ControlMode) => void;
  touchSensitivity: number;
  onChangeTouchSensitivity: (val: number) => void;
  photosensitiveMode: boolean;
  onTogglePhotosensitive: (val: boolean) => void;
  narrationSettings: NarrationSettings;
  onChangeNarrationSettings: (patch: Partial<NarrationSettings>) => void;
  onDownloadChapter: (chapterId: ChapterId) => void;
  onDeleteChapter: (chapterId: ChapterId) => void;
  onRefreshManifest: () => void;
  onClose: () => void;
}

export const DataManagerModal: React.FC<DataManagerModalProps> = ({
  manifest,
  chapterDownloads,
  storageBackendLabel,
  controlMode,
  onChangeControlMode,
  touchSensitivity,
  onChangeTouchSensitivity,
  photosensitiveMode,
  onTogglePhotosensitive,
  narrationSettings,
  onChangeNarrationSettings,
  onDownloadChapter,
  onDeleteChapter,
  onRefreshManifest,
  onClose,
}) => {
  const totalUsedMb = Object.values(chapterDownloads).reduce(
    (sum, item) => (item?.status === "downloaded" ? sum + item.downloadedMb : sum),
    0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurações e Gerenciador de Dados"
      className="safe-area-modal fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#05080d]/92 p-3 sm:p-6"
    >
      <div className="my-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto border border-amber-500/45 bg-[#0a0f17] p-4 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="font-mono-tabular text-[11px] uppercase tracking-[0.2em] text-amber-400">
              Configurações · APK Casca Leve (&lt; 100 MB)
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-100">
              Controles &amp; Gerenciar Dados
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar configurações"
            className="flex h-10 w-10 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* SEÇÃO 1: CONTROLES (MOBILE / TABLET / PC) */}
        <div className="mt-4 border border-slate-800 bg-[#070b11] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Gamepad2 className="h-4 w-4" />
            Controles (Celular, Tablet e PC)
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(
              [
                {
                  id: "auto" as ControlMode,
                  label: "Automático",
                  desc: "Detecta celular, tablet ou PC",
                  icon: Smartphone,
                },
                {
                  id: "touch" as ControlMode,
                  label: "Touch na Tela",
                  desc: "Joystick + toque na metade direita",
                  icon: Smartphone,
                },
                {
                  id: "keyboard" as ControlMode,
                  label: "Teclado e Mouse",
                  desc: "Oculta HUD touch na tela",
                  icon: Keyboard,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = controlMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-control-mode={opt.id}
                  onClick={() => onChangeControlMode(opt.id)}
                  className={`flex flex-col items-start border p-2.5 text-left transition-colors ${
                    active
                      ? "border-cyan-400 bg-cyan-950/55 text-cyan-100"
                      : "border-slate-700/80 bg-[#0b111b] text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
            <label className="flex items-center gap-2">
              <span>Sensibilidade Touch ({touchSensitivity.toFixed(1)}x)</span>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                value={touchSensitivity}
                onChange={(e) => onChangeTouchSensitivity(Number(e.target.value))}
                className="w-24 accent-cyan-400"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={photosensitiveMode}
                onChange={(e) => onTogglePhotosensitive(e.target.checked)}
                className="accent-amber-500"
              />
              Modo Fotossensível (sem flashes)
            </label>
          </div>
        </div>

        {/* SEÇÃO 1.5: ÁUDIO & ACESSIBILIDADE (NARRAÇÃO PT-BR + LEGENDAS) */}
        <div className="mt-4 border border-slate-800 bg-[#070b11] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <Volume2 className="h-4 w-4" />
            Áudio &amp; Acessibilidade (Narração PT-BR)
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span>
                Volume da Narração ({Math.round(narrationSettings.narrationVolume * 100)}%)
              </span>
              <input
                type="range"
                aria-label="Volume da Narração"
                min="0"
                max="1"
                step="0.05"
                value={narrationSettings.narrationVolume}
                onChange={(e) =>
                  onChangeNarrationSettings({
                    narrationVolume: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-400"
              />
            </label>

            <div className="flex flex-col gap-1.5 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Subtitles className="h-3.5 w-3.5 text-amber-300" />
                Tamanho das Legendas
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "pequeno" as SubtitleSize, label: "Pequeno" },
                    { id: "medio" as SubtitleSize, label: "Médio" },
                    { id: "grande" as SubtitleSize, label: "Grande" },
                  ] as const
                ).map((sz) => (
                  <button
                    key={sz.id}
                    type="button"
                    data-subtitle-size={sz.id}
                    onClick={() =>
                      onChangeNarrationSettings({ subtitleSize: sz.id })
                    }
                    className={`border py-1 text-[11px] font-semibold ${
                      narrationSettings.subtitleSize === sz.id
                        ? "border-amber-400 bg-amber-500/20 text-amber-200"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={narrationSettings.subtitlesEnabled}
                onChange={(e) =>
                  onChangeNarrationSettings({ subtitlesEnabled: e.target.checked })
                }
                className="accent-cyan-400"
              />
              Exibir Legendas Dramáticas na Tela
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={narrationSettings.ttsFallbackEnabled}
                onChange={(e) =>
                  onChangeNarrationSettings({
                    ttsFallbackEnabled: e.target.checked,
                  })
                }
                className="accent-cyan-400"
              />
              Voz sintética PT-BR se faltar áudio
            </label>
          </div>
        </div>

        {/* SEÇÃO 2: GERENCIAR DADOS DAS FASES (GITHUB RELEASES + ARMAZENAMENTO PERSISTENTE) */}
        <div className="mt-4 border border-slate-800 bg-[#070b11] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <HardDrive className="h-4 w-4" />
                Gerenciar Dados · Pacotes de Fases ({manifest.repositorio})
              </div>
              <div className="mt-0.5 font-mono-tabular text-[11px] text-slate-400">
                Destino: {storageBackendLabel} · Ocupado: {totalUsedMb.toFixed(2)} MB
              </div>
            </div>

            <button
              type="button"
              onClick={onRefreshManifest}
              className="flex items-center gap-1.5 border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-400"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar Manifesto
            </button>
          </div>

          <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
            {manifest.niveis.map((entry) => {
              const chId = entry.capitulo ?? levelIdToChapterId(entry.id);
              const dl = chapterDownloads[chId];
              const status = dl?.status ?? "not_downloaded";
              const isBusy = status === "downloading" || status === "verifying";
              const isSaved = status === "downloaded";
              const pct = dl?.progressPct ?? 0;

              return (
                <div
                  key={entry.id}
                  data-level-row={entry.id}
                  className="border border-slate-800/90 bg-[#0b111b] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          {entry.nome}
                        </span>
                        <span className="font-mono-tabular text-[10px] text-slate-400">
                          v{getEntryVersion(entry)} · {entry.tamanho_mb.toFixed(1)} MB
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono-tabular text-[11px]">
                        {isSaved && (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Baixada (Offline · {dl?.downloadedMb.toFixed(2)} MB em disco)
                          </span>
                        )}
                        {status === "not_downloaded" && (
                          <span className="text-slate-400">
                            Não baixada · Disponível no GitHub Releases
                          </span>
                        )}
                        {status === "downloading" && (
                          <span className="text-cyan-300">
                            Baixando {dl?.downloadedMb.toFixed(2)} / {dl?.totalMb.toFixed(2)} MB ({pct}%)
                          </span>
                        )}
                        {status === "verifying" && (
                          <span className="text-amber-300">
                            Verificando SHA-256 e descompactando...
                          </span>
                        )}
                        {status === "error" && (
                          <span className="text-rose-400">
                            Erro: {dl?.error ?? "Falha no download"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isSaved && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onDownloadChapter(chId)}
                          className="flex items-center gap-1.5 border border-cyan-400/70 bg-cyan-950/70 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-50"
                        >
                          <CloudDownload className="h-3.5 w-3.5" />
                          {isBusy ? `${pct}%` : `Baixar (${entry.tamanho_mb.toFixed(1)} MB)`}
                        </button>
                      )}

                      {isSaved && (
                        <button
                          type="button"
                          onClick={() => onDeleteChapter(chId)}
                          className="flex items-center gap-1.5 border border-rose-500/60 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir dados
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Barra de progresso individual por fase */}
                  {(isBusy || isSaved) && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden bg-slate-900">
                      <div
                        className={`h-full transition-[width] duration-200 ${
                          isSaved ? "bg-emerald-500" : "bg-cyan-400"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

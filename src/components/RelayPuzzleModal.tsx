import React, { useState } from "react";
import { Cpu, X, Zap } from "lucide-react";
import { RelayState, validateRelayPuzzle } from "../game/gameLogic";

interface RelayPuzzleModalProps {
  sectorName?: string;
  tricorderUsed: boolean;
  relayState: RelayState;
  onScanWithTricorder: () => void;
  onSolve: (next: RelayState) => void;
  onShortCircuit: () => void;
  onClose: () => void;
}

const COLOR_OPTIONS: Array<{
  id: RelayState["pin2Color"];
  label: string;
  hex: string;
}> = [
  { id: "ciano", label: "Canal Ciano", hex: "#06b6d4" },
  { id: "ambar", label: "Canal Âmbar", hex: "#f59e0b" },
  { id: "vermelho", label: "Canal Vermelho (Carbonizado)", hex: "#ef4444" },
];

export const RelayPuzzleModal: React.FC<RelayPuzzleModalProps> = ({
  sectorName = "Setor Atual",
  tricorderUsed,
  relayState,
  onScanWithTricorder,
  onSolve,
  onShortCircuit,
  onClose,
}) => {
  const [pin2, setPin2] = useState<RelayState["pin2Color"]>(relayState.pin2Color);
  const [pin4, setPin4] = useState<RelayState["pin4Color"]>(relayState.pin4Color);
  const [feedback, setFeedback] = useState<string>(
    "Conecte a energia auxiliar evitando a linha danificada."
  );

  const handleTest = () => {
    const candidate: RelayState = {
      pin2Color: pin2,
      pin4Color: pin4,
      solved: false,
    };
    const res = validateRelayPuzzle(candidate);
    setFeedback(res.message);
    if (res.shortCircuit) {
      onShortCircuit();
      return;
    }
    if (res.solved) {
      onSolve({ ...candidate, solved: true });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Painel de Relés de Emergência"
      className="safe-area-modal fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#07090d]/85 p-3 sm:p-4"
    >
      <div className="my-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto border border-amber-500/40 bg-[#0d121b] p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
          <div>
            <p className="font-mono-tabular text-xs text-amber-400">
              Engenharia Vanguard-7 · Painel Auxiliar
            </p>
            <h2 className="font-display text-xl font-bold text-slate-100">
              Roteamento de Relés · {sectorName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de relés"
            className="flex h-10 w-10 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 border border-slate-800 bg-[#070a10] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-200">
              Leitura de Fiação Interna
            </span>
            <button
              type="button"
              onClick={onScanWithTricorder}
              className="flex items-center gap-2 border border-cyan-500/50 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70"
            >
              <Cpu className="h-4 w-4" />
              Escanear com Tricorder
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {tricorderUsed
              ? "Diagnóstico do Tricorder: Pino 2 exige Canal Ciano · Pino 4 exige Canal Âmbar · Linha Vermelha está em curto!"
              : "Fiação oculta atrás da placa blindada. Use o Tricorder para identificar os pinos corretos ou teste as combinações."}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border border-slate-800 bg-[#0a0f17] p-4">
            <div className="font-mono-tabular text-xs text-cyan-400">PINO 02</div>
            <div className="mt-2 flex flex-col gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={`p2-${opt.id}`}
                  type="button"
                  onClick={() => setPin2(opt.id)}
                  className={`flex items-center gap-2 border px-3 py-2 text-left text-xs font-medium ${
                    pin2 === opt.id
                      ? "border-white bg-slate-800 text-white"
                      : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0"
                    style={{ backgroundColor: opt.hex }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-800 bg-[#0a0f17] p-4">
            <div className="font-mono-tabular text-xs text-amber-400">PINO 04</div>
            <div className="mt-2 flex flex-col gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={`p4-${opt.id}`}
                  type="button"
                  onClick={() => setPin4(opt.id)}
                  className={`flex items-center gap-2 border px-3 py-2 text-left text-xs font-medium ${
                    pin4 === opt.id
                      ? "border-white bg-slate-800 text-white"
                      : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0"
                    style={{ backgroundColor: opt.hex }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border border-slate-800 bg-[#080c12] px-3 py-2 text-xs text-amber-300">
          {feedback}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleTest}
            className="flex items-center gap-2 border border-amber-500 bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            <Zap className="h-4 w-4" />
            Ativar Energia Auxiliar
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from "react";
import { Delete, LockOpen, X } from "lucide-react";
import { validateKeypadCode } from "../game/gameLogic";

interface KeypadModalProps {
  relaySolved: boolean;
  expectedPin?: string;
  sectorLabel?: string;
  onUnlock: () => void;
  onClose: () => void;
}

export const KeypadModal: React.FC<KeypadModalProps> = ({
  relaySolved,
  expectedPin = "0719",
  sectorLabel = "Comporta Setor Médico → Átrio Central",
  onUnlock,
  onClose,
}) => {
  const [code, setCode] = useState("");
  const [statusMsg, setStatusMsg] = useState(
    relaySolved
      ? "Digite o código de 4 dígitos do cartão do setor."
      : "Comporta sem energia. Ligue o Painel de Relés de Emergência primeiro."
  );

  const pressDigit = (d: string) => {
    if (!relaySolved || code.length >= 4) return;
    setCode((prev) => prev + d);
  };

  const handleSubmit = () => {
    if (!relaySolved) {
      setStatusMsg("Erro: sem energia auxiliar nos relés.");
      return;
    }
    if (validateKeypadCode(code, expectedPin)) {
      onUnlock();
    } else {
      setStatusMsg("Código incorreto. Verifique o verso do Cartão de Acesso.");
      setCode("");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Teclado da Comporta do Setor"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#07090d]/85 p-4"
    >
      <div className="w-full max-w-sm border border-cyan-500/40 bg-[#0d121b] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
          <div>
            <p className="font-mono-tabular text-xs text-cyan-400">
              {sectorLabel}
            </p>
            <h2 className="font-display text-lg font-bold text-slate-100">
              Terminal de Acesso Biométrico
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar teclado"
            className="flex h-9 w-9 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 border border-slate-700 bg-[#05080f] p-3 text-center">
          <div className="font-mono-tabular text-3xl font-bold tracking-[0.4em] text-cyan-300">
            {code.padEnd(4, "_")}
          </div>
        </div>

        <p className="mt-2 min-h-[2.2rem] text-xs text-amber-300">{statusMsg}</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              disabled={!relaySolved}
              onClick={() => pressDigit(d)}
              className="h-12 border border-slate-700 bg-slate-900 font-mono-tabular text-lg font-semibold text-slate-100 hover:border-cyan-400 disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCode((prev) => prev.slice(0, -1))}
            aria-label="Apagar dígito"
            className="flex h-12 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-rose-400"
          >
            <Delete className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled={!relaySolved}
            onClick={() => pressDigit("0")}
            className="h-12 border border-slate-700 bg-slate-900 font-mono-tabular text-lg font-semibold text-slate-100 hover:border-cyan-400 disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            disabled={!relaySolved}
            onClick={handleSubmit}
            className="flex h-12 items-center justify-center gap-1 border border-emerald-500 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <LockOpen className="h-4 w-4" />
            ABRIR
          </button>
        </div>
      </div>
    </div>
  );
};

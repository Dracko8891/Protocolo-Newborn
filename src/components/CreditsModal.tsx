import React from "react";
import { Film, ShieldAlert, Smartphone, Sparkles, X } from "lucide-react";

interface CreditsModalProps {
  onClose: () => void;
}

const CREATION_TEAM_ROLES: Array<{ role: string; name: string }> = [
  { role: "Criação", name: "Damião Bruno" },
  { role: "Direção criativa", name: "Damião Bruno" },
  { role: "Roteiro", name: "Damião Bruno" },
  { role: "Narração", name: "Damião Bruno" },
  { role: "Voz", name: "Damião Bruno" },
  { role: "Vozes", name: "Damião Bruno" },
  { role: "Atuação", name: "Damião Bruno" },
  { role: "Atuação (Arthur Vance)", name: "Damião Bruno" },
  { role: "Personagens", name: "Damião Bruno" },
  { role: "Design de Personagem", name: "Damião Bruno" },
  { role: "Concepção do Newborn", name: "Damião Bruno" },
  { role: "Alien Fantasiado", name: "Damião Bruno" },
  { role: "Direção de arte", name: "Damião Bruno" },
  { role: "Direção visual", name: "Damião Bruno" },
  { role: "Design de ambientes", name: "Damião Bruno" },
  { role: "Design de fases", name: "Damião Bruno" },
  { role: "Design de gameplay", name: "Damião Bruno" },
  { role: "Design de puzzles", name: "Damião Bruno" },
  { role: "Programação e integração", name: "Damião Bruno" },
  { role: "Engenharia de Iluminação e Shaders PBR", name: "Damião Bruno" },
  { role: "Design de Som, Foley e Respiração", name: "Damião Bruno" },
  { role: "Captura de Movimento no Escuro", name: "Damião Bruno" },
  { role: "Prótese Viscosa e Sangue Sintético do Newborn", name: "Damião Bruno" },
  { role: "Operação de Câmera Dolly Zoom", name: "Damião Bruno" },
  { role: "Supervisão de Disjuntores e Tricorder", name: "Damião Bruno" },
  { role: "Produção", name: "Damião Bruno" },
  { role: "Produção Executiva", name: "Damião Bruno" },
  { role: "Testes de Terror na Madrugada", name: "Damião Bruno" },
  { role: "Sobrevivente Voluntário do Setor Ômega", name: "Damião Bruno" },
];

export const CreditsModal: React.FC<CreditsModalProps> = ({ onClose }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Créditos dos Criadores"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#04060a]/92 p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col border border-amber-500/45 bg-[#090d14] shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Film className="h-4 w-4 text-amber-400" />
            <div>
              <h2 className="font-display text-base font-bold tracking-wide text-slate-100">
                CRÉDITOS · PROTOCOLO NEWBORN
              </h2>
              <p className="font-mono-tabular text-[10px] uppercase tracking-widest text-slate-400">
                Complexo Subterrâneo Vanguard-7 · Edição Sobrevivência +18
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar créditos"
            className="flex h-8 w-8 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-amber-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rolagem individual um de cada vez */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          {/* Responsável pela Ideia Original */}
          <div className="border-l-2 border-cyan-400 bg-[#0d1420] px-4 py-3.5">
            <div className="flex items-center gap-2 font-mono-tabular text-[11px] uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" />
              Ideia Original
            </div>
            <div className="mt-1 font-display text-xl font-bold text-slate-50">
              Nycollas Gabriel
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Concepção inicial da fuga desesperada sem combate, onde ligar disjuntores para escapar acaba abrindo acesso do Newborn ao mundo exterior.
            </p>
          </div>

          {/* Seção estruturada: Equipe de Criação */}
          <section aria-labelledby="equipe-criacao-heading" className="border-t border-slate-800/80 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3
                id="equipe-criacao-heading"
                className="font-display text-sm font-bold uppercase tracking-wider text-amber-300"
              >
                Equipe de Criação
              </h3>
              <span className="font-mono-tabular text-[10px] uppercase tracking-widest text-slate-400">
                {CREATION_TEAM_ROLES.length} Funções Individuais
              </span>
            </div>

            <ul className="space-y-2">
              {CREATION_TEAM_ROLES.map((item) => (
                <li
                  key={item.role}
                  className="flex items-baseline justify-between gap-4 border-b border-slate-800/55 pb-2 font-mono-tabular text-xs"
                >
                  <span className="text-slate-300">{item.role}:</span>
                  <span className="shrink-0 text-right font-semibold text-amber-300">
                    {item.name}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Informações extras e nota de bastidores */}
          <div className="grid gap-2.5 border border-slate-800 bg-[#070b11] p-3.5 text-[11px] text-slate-300">
            <div className="flex items-center gap-2 font-mono-tabular text-amber-300/90">
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              <span>Plataformas: WebGL 3D em Tempo Real · Otimizado Touch / Mobile Android</span>
            </div>
            <div className="flex items-start gap-2 text-slate-400">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              <span>
                Nenhum cientista fictício foi poupado durante a calibração do Dolly Zoom, das faíscas elétricas nos corredores de 2,85m ou das gravações noturnas do Alien Fantasiado no Setor Ômega.
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="border border-amber-500/60 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from "react";
import {
  FileAudio,
  Film,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Radio,
  Send,
  Square,
  Upload,
  X,
} from "lucide-react";

type StudioTab = "voz" | "chat" | "transcricao" | "musica" | "imagem" | "video";

interface AiStudioModalProps {
  onClose: () => void;
}

interface TranscriptEntry {
  speaker: "Arthur" | "Dra. Clara" | "Sistema";
  text: string;
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
  model?: string;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      resolve({ base64, mimeType: file.type || "application/octet-stream" });
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export const AiStudioModal: React.FC<AiStudioModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>("voz");

  // --- ABA VOZ (gemini-3.8-live) ---
  const [liveStatus, setLiveStatus] = useState<
    "desconectado" | "conectando" | "ativo"
  >("desconectado");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLog, setLiveLog] = useState<TranscriptEntry[]>([]);
  const [liveTextInput, setLiveTextInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // --- ABA CHAT MULTI-TURN (gemini-4-*) ---
  const [chatModel, setChatModel] = useState<
    "gemini-4-hydrogen" | "gemini-3.1-flash-lite" | "gemini-4-neon" | "gemini-4-carbon"
  >("gemini-4-hydrogen");
  const [chatPersona, setChatPersona] = useState<"clara" | "mestre_gm" | "analista">(
    "clara"
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // --- ABA TRANSCRIÇÃO (gemini-3.5-transcribe) ---
  const [recording, setRecording] = useState(false);
  const [transcribeBusy, setTranscribeBusy] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcribedText, setTranscribedText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // --- ABA MÚSICA (lyria-3-*) ---
  const [musicPrompt, setMusicPrompt] = useState(
    "Trilha sombria industrial sci-fi de suspense e terror espacial, sintetizadores analógicos graves, batida metálica lenta, atmosfera opressiva."
  );
  const [musicMode, setMusicMode] = useState<"clip" | "pro">("clip");
  const [musicImage, setMusicImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicResult, setMusicResult] = useState<{
    audioDataUrl: string;
    lyrics: string;
    model: string;
  } | null>(null);

  // --- ABA IMAGEM (gemini-nano-banana-2.1) ---
  const [imagePrompt, setImagePrompt] = useState(
    "Corredor médico subterrâneo futurista abandonado sob luz vermelha de emergência, vidro estilhaçado, estética survival horror realista."
  );
  const [imageAspect, setImageAspect] = useState<
    "16:9" | "1:1" | "9:16" | "4:3" | "3:4"
  >("16:9");
  const [imageSize, setImageSize] = useState<"1K" | "2K">("1K");
  const [imageRefFile, setImageRefFile] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<{
    imageUrl: string;
    notes: string;
  } | null>(null);

  // --- ABA VÍDEO (gemini-omni-1.2-flash) ---
  const [videoPrompt, setVideoPrompt] = useState(
    "Câmera lenta avançando por corredor hospitalar escuro com giroflex vermelho piscando e fumaça saindo dos dutos no teto."
  );
  const [videoAspect, setVideoAspect] = useState<"16:9" | "9:16">("16:9");
  const [videoRefFile, setVideoRefFile] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<string | null>(null);

  const stopLiveSession = () => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignora
    }
    processorRef.current = null;

    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }

    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignora
      }
    }
    activeSourcesRef.current = [];

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignora
      }
      wsRef.current = null;
    }
    nextPlayTimeRef.current = 0;
    setLiveStatus("desconectado");
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const schedulePcmPlayback = (base64Pcm: string) => {
    const outCtx = outputCtxRef.current;
    if (!outCtx) return;
    const pcm16 = base64ToInt16(base64Pcm);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    const buffer = outCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const src = outCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now + 0.02, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(src);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
  };

  const startLiveRadio = async () => {
    setLiveError(null);
    setLiveStatus("conectando");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/live`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            error?: string;
          };
          if (msg.error) {
            setLiveError(msg.error);
            stopLiveSession();
            return;
          }
          if (msg.ready) {
            setLiveStatus("ativo");
            setLiveLog((prev) => [
              ...prev,
              {
                speaker: "Sistema",
                text: "Canal criptografado aberto com Dra. Clara Sato (Ala Leste).",
              },
            ]);
          }
          if (msg.interrupted) {
            for (const s of activeSourcesRef.current) {
              try {
                s.stop();
              } catch {
                // ignora
              }
            }
            activeSourcesRef.current = [];
            nextPlayTimeRef.current = 0;
          }
          if (msg.audio) {
            schedulePcmPlayback(msg.audio);
          }
          if (msg.inputTranscript) {
            setLiveLog((prev) => [
              ...prev,
              { speaker: "Arthur", text: msg.inputTranscript! },
            ]);
          }
          if (msg.outputTranscript) {
            setLiveLog((prev) => [
              ...prev,
              { speaker: "Dra. Clara", text: msg.outputTranscript! },
            ]);
          }
        } catch {
          // ignora
        }
      };

      ws.onerror = () => {
        setLiveError("Falha na conexão WebSocket com o servidor de áudio ao vivo.");
        stopLiveSession();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          stopLiveSession();
        }
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const targetLen =
          inputCtx.sampleRate === 16000
            ? inputData.length
            : Math.round((inputData.length * 16000) / inputCtx.sampleRate);
        const pcm16 = new Int16Array(targetLen);
        const ratio = inputData.length / targetLen;
        for (let i = 0; i < targetLen; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[Math.floor(i * ratio)] || 0));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        wsRef.current.send(JSON.stringify({ audio: int16ToBase64(pcm16) }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? `Não foi possível acessar o microfone ou conectar ao rádio: ${err.message}`
          : "Erro ao iniciar rádio ao vivo."
      );
      stopLiveSession();
    }
  };

  const sendLiveText = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = liveTextInput.trim();
    if (!txt || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: txt }));
    setLiveLog((prev) => [...prev, { speaker: "Arthur", text: txt }]);
    setLiveTextInput("");
  };

  const submitAudioToTranscribe = async (audioBase64: string, mimeType: string) => {
    setTranscribeBusy(true);
    setTranscribeError(null);
    try {
      const resp = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType }),
      });
      const data = (await resp.json()) as { text?: string; error?: string };
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Erro ${resp.status} ao transcrever áudio.`);
      }
      setTranscribedText(data.text || "(Nenhuma fala detectada no áudio)");
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : "Erro ao transcrever áudio."
      );
    } finally {
      setTranscribeBusy(false);
    }
  };

  const toggleRecording = async () => {
    setTranscribeError(null);
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      mr.onstop = async () => {
        for (const t of stream.getTracks()) t.stop();
        const blob = new Blob(recordedChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        const reader = new FileReader();
        reader.onload = () => {
          const res = String(reader.result || "");
          const idx = res.indexOf(",");
          const b64 = idx >= 0 ? res.slice(idx + 1) : res;
          void submitAudioToTranscribe(b64, blob.type || "audio/webm");
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      setTranscribeError(
        err instanceof Error
          ? `Microfone indisponível: ${err.message}`
          : "Não foi possível gravar áudio."
      );
    }
  };

  const handleMusicGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMusicBusy(true);
    setMusicError(null);
    setMusicResult(null);
    try {
      const resp = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt,
          mode: musicMode,
          imageBase64: musicImage?.base64,
          imageMimeType: musicImage?.mimeType,
        }),
      });
      const data = (await resp.json()) as {
        audioDataUrl?: string;
        lyrics?: string;
        model?: string;
        error?: string;
      };
      if (!resp.ok || data.error || !data.audioDataUrl) {
        throw new Error(data.error || `Erro ${resp.status} ao gerar trilha sonora.`);
      }
      setMusicResult({
        audioDataUrl: data.audioDataUrl,
        lyrics: data.lyrics || "",
        model: data.model || musicMode,
      });
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Erro ao gerar música.");
    } finally {
      setMusicBusy(false);
    }
  };

  const handleImageGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setImageBusy(true);
    setImageError(null);
    setImageResult(null);
    try {
      const resp = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: imageAspect,
          imageSize,
          imageBase64: imageRefFile?.base64,
          imageMimeType: imageRefFile?.mimeType,
        }),
      });
      const data = (await resp.json()) as {
        imageUrl?: string;
        notes?: string;
        error?: string;
      };
      if (!resp.ok || data.error || !data.imageUrl) {
        throw new Error(data.error || `Erro ${resp.status} ao processar imagem.`);
      }
      setImageResult({ imageUrl: data.imageUrl, notes: data.notes || "" });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Erro ao gerar imagem.");
    } finally {
      setImageBusy(false);
    }
  };

  const handleVideoGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setVideoBusy(true);
    setVideoError(null);
    setVideoResult(null);
    try {
      const resp = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: videoPrompt,
          aspectRatio: videoAspect,
          imageBase64: videoRefFile?.base64,
          imageMimeType: videoRefFile?.mimeType,
        }),
      });
      const data = (await resp.json()) as {
        videoDataUrl?: string;
        error?: string;
      };
      if (!resp.ok || data.error || !data.videoDataUrl) {
        throw new Error(data.error || `Erro ${resp.status} ao gerar vídeo.`);
      }
      setVideoResult(data.videoDataUrl);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Erro ao gerar vídeo.");
    } finally {
      setVideoBusy(false);
    }
  };

  const sendChatMessage = async (textOverride?: string) => {
    const content = (textOverride ?? chatInput).trim();
    if (!content || chatBusy) return;
    setChatError(null);
    const nextHistory = [...chatMessages];
    setChatMessages([...nextHistory, { role: "user", text: content }]);
    if (!textOverride) setChatInput("");
    setChatBusy(true);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          history: nextHistory,
          model: chatModel,
          persona: chatPersona,
        }),
      });
      const data = (await resp.json()) as {
        text?: string;
        model?: string;
        error?: string;
      };
      if (!resp.ok || data.error) {
        throw new Error(data.error || `Erro ${resp.status} no terminal IA.`);
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: data.text || "(Sem resposta do servidor.)",
          model: data.model || chatModel,
        },
      ]);
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 40);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Erro ao enviar mensagem para a IA."
      );
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estúdio Tático IA · Vanguard-7"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080d]/90 p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col border border-cyan-500/45 bg-[#0b1018] shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#111825] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="h-5 w-2 bg-cyan-400" />
            <div>
              <h2 className="font-display text-lg font-bold tracking-wide text-slate-100">
                ESTÚDIO TÁTICO IA · VANGUARD-7
              </h2>
              <p className="font-mono-tabular text-xs text-cyan-400">
                Comunicações de Emergência · Transcrição · Mídia Multimodal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopLiveSession();
              onClose();
            }}
            aria-label="Fechar Estúdio IA"
            className="flex h-9 w-9 items-center justify-center border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navegação das Abas */}
        <div className="flex flex-wrap border-b border-slate-800 bg-[#0d1420] px-4 pt-2">
          {[
            { id: "voz" as const, label: "Rádio ao Vivo", icon: Radio },
            { id: "chat" as const, label: "Terminal Chat IA", icon: MessageSquare },
            { id: "transcricao" as const, label: "Transcrição", icon: FileAudio },
            { id: "musica" as const, label: "Trilha Sonora", icon: Music },
            { id: "imagem" as const, label: "Imagens", icon: ImageIcon },
            { id: "video" as const, label: "Vídeo & Animação", icon: Film },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Corpo */}
        <div className="overflow-y-auto p-5 text-sm text-slate-200">
          {activeTab === "chat" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-[#080c14] p-4">
                <div>
                  <div className="font-display text-base font-bold text-amber-300">
                    Terminal Tático &amp; Diretor Narrativo IA
                  </div>
                  <p className="text-xs text-slate-400">
                    Conversa contínua com histórico e papéis especializados em
                    Português (BR).
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <select
                    value={chatPersona}
                    onChange={(e) => {
                      setChatPersona(
                        e.target.value as "clara" | "mestre_gm" | "analista"
                      );
                      setChatMessages([]);
                    }}
                    aria-label="Papel do Assistente"
                    className="border border-slate-700 bg-[#070a10] px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="clara">Dra. Clara Sato (Sobrevivência)</option>
                    <option value="mestre_gm">Diretor Narrativo (AI-GM)</option>
                    <option value="analista">Engenheiro de Contenção</option>
                  </select>

                  <select
                    value={chatModel}
                    onChange={(e) =>
                      setChatModel(
                        e.target.value as
                          | "gemini-4-hydrogen"
                          | "gemini-3.1-flash-lite"
                          | "gemini-4-neon"
                          | "gemini-4-carbon"
                      )
                    }
                    aria-label="Modelo Gemini"
                    className="border border-slate-700 bg-[#070a10] px-2.5 py-1.5 font-mono-tabular text-slate-200"
                  >
                    <option value="gemini-4-hydrogen">gemini-4-hydrogen (Padrão)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Rápido)</option>
                    <option value="gemini-4-neon">gemini-4-neon (Complexo · Pago)</option>
                    <option value="gemini-4-carbon">gemini-4-carbon (Raciocínio · Pago)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "Como evito o Newborn na Ala Médica?",
                  "Quais os riscos de religar os relés agora?",
                  "Gere um log de emergência perdido da Câmara 00.",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={chatBusy}
                    onClick={() => void sendChatMessage(preset)}
                    className="border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 hover:border-amber-400 hover:text-amber-200 disabled:opacity-50"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div
                ref={chatScrollRef}
                className="h-60 overflow-y-auto border border-slate-800 bg-[#070a10] p-3.5 space-y-3 text-xs"
              >
                {chatMessages.length === 0 ? (
                  <p className="text-slate-500">
                    Envie uma pergunta ou selecione um comando rápido acima para
                    iniciar a sessão com o terminal Vanguard-7.
                  </p>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`border p-2.5 ${
                        msg.role === "user"
                          ? "ml-8 border-amber-500/35 bg-amber-950/20 text-amber-100"
                          : "mr-8 border-cyan-500/35 bg-cyan-950/20 text-slate-200"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between font-mono-tabular text-[10px] uppercase tracking-wider text-slate-400">
                        <span>{msg.role === "user" ? "Arthur Vance" : "Terminal IA"}</span>
                        {msg.model && <span>{msg.model}</span>}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                  ))
                )}
              </div>

              {chatError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {chatError}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendChatMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatBusy}
                  placeholder="Digite sua pergunta tática ou comando narrativo..."
                  className="flex-1 border border-slate-700 bg-[#070a10] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={chatBusy || !chatInput.trim()}
                  className="flex items-center gap-1.5 border border-amber-500/60 bg-amber-950/70 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-900 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  {chatBusy ? "Consultando..." : "Enviar"}
                </button>
              </form>
            </div>
          )}

          {activeTab === "voz" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-[#080c14] p-4">
                <div>
                  <div className="font-display text-base font-bold text-cyan-300">
                    Frequência de Emergência · Dra. Clara Sato
                  </div>
                  <p className="text-xs text-slate-400">
                    Conversa por voz em tempo real em Português (BR) via{" "}
                    <span className="font-mono-tabular text-slate-300">
                      gemini-3.8-live
                    </span>
                    .
                  </p>
                </div>
                {liveStatus === "desconectado" ? (
                  <button
                    type="button"
                    onClick={startLiveRadio}
                    className="flex items-center gap-2 border border-emerald-500/60 bg-emerald-950/70 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900"
                  >
                    <Mic className="h-4 w-4" />
                    Abrir Canal de Voz
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLiveSession}
                    className="flex items-center gap-2 border border-rose-500/60 bg-rose-950/70 px-4 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900"
                  >
                    <MicOff className="h-4 w-4" />
                    Encerrar Transmissão (
                    {liveStatus === "conectando" ? "Conectando..." : "Ao Vivo"})
                  </button>
                )}
              </div>

              {liveError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {liveError}
                </div>
              )}

              <div className="h-56 overflow-y-auto border border-slate-800 bg-[#070a10] p-3 font-mono-tabular text-xs space-y-2">
                {liveLog.length === 0 ? (
                  <p className="text-slate-500">
                    Abra o canal de voz para falar diretamente com a Dra. Clara Sato
                    sobre a Ala Médica, o Newborn e rotas de fuga.
                  </p>
                ) : (
                  liveLog.map((entry, idx) => (
                    <div key={idx} className="leading-relaxed">
                      <span
                        className={
                          entry.speaker === "Dra. Clara"
                            ? "font-bold text-cyan-400"
                            : entry.speaker === "Arthur"
                              ? "font-bold text-amber-400"
                              : "font-bold text-emerald-400"
                        }
                      >
                        [{entry.speaker}]:{" "}
                      </span>
                      <span className="text-slate-200">{entry.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendLiveText} className="flex gap-2">
                <input
                  type="text"
                  value={liveTextInput}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  disabled={liveStatus !== "ativo"}
                  placeholder="Ou envie uma mensagem de texto pelo rádio enquanto o canal estiver ativo..."
                  className="flex-1 border border-slate-700 bg-[#070a10] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={liveStatus !== "ativo" || !liveTextInput.trim()}
                  className="flex items-center gap-1.5 border border-cyan-500/60 bg-cyan-950/70 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" />
                  Transmitir
                </button>
              </form>
            </div>
          )}

          {activeTab === "transcricao" && (
            <div className="space-y-4">
              <div className="border border-slate-800 bg-[#080c14] p-4">
                <div className="font-display text-base font-bold text-amber-300">
                  Decodificador de Caixa-Preta · Transcrição de Áudio
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Grave um relato de microfone ou envie um arquivo de áudio para
                  transcrever em PT-BR com{" "}
                  <span className="font-mono-tabular text-slate-300">
                    gemini-3.5-transcribe
                  </span>
                  .
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={transcribeBusy}
                    className={`flex items-center gap-2 border px-4 py-2 text-xs font-semibold ${
                      recording
                        ? "border-rose-500 bg-rose-950 text-rose-200"
                        : "border-amber-500/60 bg-amber-950/60 text-amber-200 hover:bg-amber-900/70"
                    }`}
                  >
                    {recording ? (
                      <>
                        <Square className="h-3.5 w-3.5" /> Parar e Transcrever
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" /> Gravar Diário de Voz
                      </>
                    )}
                  </button>

                  <label className="flex cursor-pointer items-center gap-2 border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400">
                    <Upload className="h-3.5 w-3.5" />
                    Enviar Arquivo de Áudio
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const { base64, mimeType } = await fileToBase64(file);
                        void submitAudioToTranscribe(base64, mimeType);
                      }}
                    />
                  </label>
                </div>
              </div>

              {transcribeBusy && (
                <div className="border border-cyan-500/40 bg-cyan-950/30 p-3 text-xs text-cyan-200">
                  Processando áudio na rede neural de transcrição...
                </div>
              )}

              {transcribeError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {transcribeError}
                </div>
              )}

              <div className="min-h-36 border border-slate-800 bg-[#070a10] p-4">
                <div className="font-mono-tabular text-[11px] uppercase tracking-wider text-slate-500">
                  Registro Transcrito
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">
                  {transcribedText || "Aguardando áudio para transcrição..."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "musica" && (
            <form onSubmit={handleMusicGenerate} className="space-y-4">
              <div className="border border-slate-800 bg-[#080c14] p-4 text-xs text-slate-400">
                Gera trilhas sonoras de tensão para Vanguard-7 via{" "}
                <span className="font-mono-tabular text-slate-200">
                  lyria-3-clip-preview
                </span>{" "}
                (30s) ou{" "}
                <span className="font-mono-tabular text-slate-200">
                  lyria-3-pro-preview
                </span>{" "}
                (faixa completa). Requer chave com faturamento ativo em Settings
                &gt; Secrets.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Descrição da Trilha Sonora
                </label>
                <textarea
                  rows={3}
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  className="mt-1 w-full border border-slate-700 bg-[#070a10] p-3 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Modelo:</span>
                  <button
                    type="button"
                    onClick={() => setMusicMode("clip")}
                    className={`border px-3 py-1.5 ${
                      musicMode === "clip"
                        ? "border-cyan-400 bg-cyan-950/60 text-cyan-200"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    Clipe 30s (Clip)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMusicMode("pro")}
                    className={`border px-3 py-1.5 ${
                      musicMode === "pro"
                        ? "border-amber-400 bg-amber-950/60 text-amber-200"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    Faixa Completa (Pro)
                  </button>
                </div>

                <label className="flex cursor-pointer items-center gap-2 border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400">
                  <Upload className="h-3.5 w-3.5" />
                  {musicImage ? musicImage.name : "Imagem de Referência (Opcional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const res = await fileToBase64(file);
                      setMusicImage({ ...res, name: file.name });
                    }}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={musicBusy}
                className="border border-cyan-500/60 bg-cyan-950/70 px-5 py-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-50"
              >
                {musicBusy ? "Sintetizando Trilha..." : "Gerar Trilha Sonora"}
              </button>

              {musicError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {musicError}
                </div>
              )}

              {musicResult && (
                <div className="space-y-2 border border-emerald-500/40 bg-emerald-950/20 p-4">
                  <div className="font-mono-tabular text-xs text-emerald-300">
                    Trilha gerada ({musicResult.model})
                  </div>
                  <audio controls src={musicResult.audioDataUrl} className="w-full" />
                  {musicResult.lyrics && (
                    <pre className="whitespace-pre-wrap text-xs text-slate-300">
                      {musicResult.lyrics}
                    </pre>
                  )}
                </div>
              )}
            </form>
          )}

          {activeTab === "imagem" && (
            <form onSubmit={handleImageGenerate} className="space-y-4">
              <div className="border border-slate-800 bg-[#080c14] p-4 text-xs text-slate-400">
                Cria ou edita arte conceitual, arquivos médicos e retratos do
                complexo usando{" "}
                <span className="font-mono-tabular text-slate-200">
                  gemini-nano-banana-2.1
                </span>
                . Requer chave com faturamento ativo em Settings &gt; Secrets.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Prompt de Geração ou Edição
                </label>
                <textarea
                  rows={3}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  className="mt-1 w-full border border-slate-700 bg-[#070a10] p-3 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select
                  value={imageAspect}
                  onChange={(e) =>
                    setImageAspect(
                      e.target.value as "16:9" | "1:1" | "9:16" | "4:3" | "3:4"
                    )
                  }
                  className="border border-slate-700 bg-[#070a10] px-3 py-2 text-slate-200"
                >
                  <option value="16:9">Proporção 16:9</option>
                  <option value="1:1">Proporção 1:1</option>
                  <option value="9:16">Proporção 9:16</option>
                  <option value="4:3">Proporção 4:3</option>
                  <option value="3:4">Proporção 3:4</option>
                </select>

                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value as "1K" | "2K")}
                  className="border border-slate-700 bg-[#070a10] px-3 py-2 text-slate-200"
                >
                  <option value="1K">Resolução 1K</option>
                  <option value="2K">Resolução 2K</option>
                </select>

                <label className="flex cursor-pointer items-center gap-2 border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 hover:border-cyan-400">
                  <Upload className="h-3.5 w-3.5" />
                  {imageRefFile ? imageRefFile.name : "Enviar Imagem para Editar"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const res = await fileToBase64(file);
                      setImageRefFile({ ...res, name: file.name });
                    }}
                  />
                </label>

                {imageRefFile && (
                  <button
                    type="button"
                    onClick={() => setImageRefFile(null)}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Remover anexo
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={imageBusy}
                className="border border-amber-500/60 bg-amber-950/70 px-5 py-2.5 text-xs font-semibold text-amber-100 hover:bg-amber-900 disabled:opacity-50"
              >
                {imageBusy
                  ? "Renderizando Imagem..."
                  : imageRefFile
                    ? "Editar Imagem"
                    : "Gerar Imagem"}
              </button>

              {imageError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {imageError}
                </div>
              )}

              {imageResult && (
                <div className="space-y-2 border border-slate-800 bg-[#070a10] p-4">
                  <img
                    src={imageResult.imageUrl}
                    alt="Imagem gerada pelo sistema"
                    className="max-h-80 w-auto border border-slate-700"
                  />
                  {imageResult.notes && (
                    <p className="text-xs text-slate-300">{imageResult.notes}</p>
                  )}
                </div>
              )}
            </form>
          )}

          {activeTab === "video" && (
            <form onSubmit={handleVideoGenerate} className="space-y-4">
              <div className="border border-slate-800 bg-[#080c14] p-4 text-xs text-slate-400">
                Gera sequências de vídeo ou anima imagens estáticas de vigilância com{" "}
                <span className="font-mono-tabular text-slate-200">
                  gemini-omni-1.2-flash
                </span>{" "}
                (Interactions API). Requer chave com faturamento ativo em Settings
                &gt; Secrets.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Roteiro da Cena ou Movimento da Imagem
                </label>
                <textarea
                  rows={3}
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  className="mt-1 w-full border border-slate-700 bg-[#070a10] p-3 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select
                  value={videoAspect}
                  onChange={(e) =>
                    setVideoAspect(e.target.value as "16:9" | "9:16")
                  }
                  className="border border-slate-700 bg-[#070a10] px-3 py-2 text-slate-200"
                >
                  <option value="16:9">Formato 16:9 (Widescreen)</option>
                  <option value="9:16">Formato 9:16 (Vertical)</option>
                </select>

                <label className="flex cursor-pointer items-center gap-2 border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300 hover:border-cyan-400">
                  <Upload className="h-3.5 w-3.5" />
                  {videoRefFile ? videoRefFile.name : "Animar Imagem (Opcional)"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const res = await fileToBase64(file);
                      setVideoRefFile({ ...res, name: file.name });
                    }}
                  />
                </label>

                {videoRefFile && (
                  <button
                    type="button"
                    onClick={() => setVideoRefFile(null)}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Remover imagem
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={videoBusy}
                className="border border-cyan-500/60 bg-cyan-950/70 px-5 py-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-900 disabled:opacity-50"
              >
                {videoBusy
                  ? "Renderizando Vídeo (pode levar alguns minutos)..."
                  : videoRefFile
                    ? "Animar Imagem em Vídeo"
                    : "Gerar Vídeo"}
              </button>

              {videoError && (
                <div className="border border-rose-500/50 bg-rose-950/40 p-3 text-xs text-rose-200">
                  {videoError}
                </div>
              )}

              {videoResult && (
                <div className="border border-slate-800 bg-[#070a10] p-4">
                  <video
                    controls
                    src={videoResult}
                    className="max-h-80 w-full border border-slate-700"
                  />
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

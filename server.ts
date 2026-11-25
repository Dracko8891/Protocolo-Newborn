import "dotenv/config";
import http from "http";
import path from "path";
import express from "express";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Chave GEMINI_API_KEY não encontrada no servidor. Verifique Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (/PERMISSION_DENIED|403|API_KEY_INVALID|400/i.test(raw)) {
    return {
      status: 403,
      message:
        "Permissão negada ou chave inválida. Verifique sua chave de API (ou selecione uma chave paga para modelos premium) em Settings > Secrets.",
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(raw)) {
    return {
      status: 429,
      message:
        "Cota excedida ou modelo exclusivo para chave paga. Selecione uma chave com faturamento ativo em Settings > Secrets.",
    };
  }
  if (/NOT_FOUND|404/i.test(raw)) {
    return {
      status: 404,
      message: `Modelo ou recurso não encontrado na API: ${raw}`,
    };
  }
  return { status: 500, message: raw || "Erro interno ao consultar a API Gemini." };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "35mb" }));

  const CHAT_ALLOWED_MODELS = new Set([
    "gemini-4-hydrogen",
    "gemini-3.1-flash-lite",
    "gemini-4-neon",
    "gemini-4-carbon",
  ]);

  const CHAT_SYSTEM_INSTRUCTIONS: Record<string, string> = {
    clara:
      "Você é a Dra. Clara Sato, Psicóloga-Chefe de Vanguard-7, auxiliando Arthur Vance pelo terminal tático da Ala Médica. Responda sempre em Português do Brasil (PT-BR), com clareza, concisão e tensão realista de sobrevivência (Newborn sem pálpebras, furtividade com lanterna apagada, Painel de Relés evita linha vermelha usando Ciano no Pino 2 e Âmbar no Pino 4, PIN 0719 no verso do crachá do Dr. Mercer).",
    mestre_gm:
      "Você é o Diretor Narrativo de IA (AI-GM) de Protocolo Newborn. Narre eventos emergentes, logs perdidos, pistas ambientais e decisões de roleplay no Complexo Subterrâneo Vanguard-7 em Português do Brasil (PT-BR), mantendo suspense sci-fi estilo Resident Evil + Star Trek sem quebrar a imersão.",
    analista:
      "Você é o Engenheiro-Chefe de Contenção de Vanguard-7. Explique protocolos de energia auxiliar, blindagem de dutos térmicos, calibragem de tricorder e estratégias de evasão contra espécimes bioengenheirados em Português do Brasil (PT-BR).",
  };

  // 0. Chatbot Tático Multi-turn (gemini-4-hydrogen / gemini-3.1-flash-lite / gemini-4-neon / gemini-4-carbon)
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, model, persona } = req.body as {
        message?: string;
        history?: Array<{ role: "user" | "model"; text: string }>;
        model?: string;
        persona?: string;
      };
      if (!message?.trim()) {
        return res.status(400).json({ error: "Informe uma mensagem para o terminal." });
      }
      const selectedModel =
        model && CHAT_ALLOWED_MODELS.has(model) ? model : "gemini-4-hydrogen";
      const systemInstruction =
        CHAT_SYSTEM_INSTRUCTIONS[persona || "clara"] ||
        CHAT_SYSTEM_INSTRUCTIONS.clara;

      const ai = createAiClient();
      const formattedHistory = (history ?? [])
        .filter((h) => h && (h.role === "user" || h.role === "model") && h.text?.trim())
        .map((h) => ({
          role: h.role,
          parts: [{ text: h.text }],
        }));

      const chat = ai.chats.create({
        model: selectedModel,
        history: formattedHistory,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({ message: message.trim() });
      return res.json({
        text: response.text ?? "",
        model: selectedModel,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 1. Transcrição de Áudio (gemini-3.5-transcribe)
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        return res.status(400).json({ error: "Áudio em base64 é obrigatório." });
      }
      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: audioBase64,
              },
            },
            {
              text: "Transcreva exatamente o que foi falado neste áudio em Português do Brasil.",
            },
          ],
        },
      });
      return res.json({ text: response.text ?? "" });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 2. Geração de Música (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post("/api/music", async (req, res) => {
    try {
      const { prompt, mode, imageBase64, imageMimeType } = req.body as {
        prompt?: string;
        mode?: "clip" | "pro";
        imageBase64?: string;
        imageMimeType?: string;
      };
      if (!prompt?.trim()) {
        return res.status(400).json({ error: "Descreva a trilha sonora desejada." });
      }
      const model = mode === "pro" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";
      const ai = createAiClient();
      const contents = imageBase64
        ? {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: imageMimeType || "image/jpeg",
                },
              },
            ],
          }
        : prompt;

      const stream = await ai.models.generateContentStream({
        model,
        contents,
      });

      const audioChunks: Buffer[] = [];
      let lyrics = "";
      let mimeType = "audio/mpeg";

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
          }
          if (part.text) {
            lyrics += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        return res.status(502).json({
          error: "Nenhum dado de áudio foi retornado pelo modelo Lyria.",
        });
      }

      const audioBase64 = Buffer.concat(audioChunks).toString("base64");
      return res.json({
        audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
        lyrics: lyrics.trim(),
        model,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 3. Criação & Edição de Imagens (gemini-nano-banana-2.1)
  app.post("/api/image", async (req, res) => {
    try {
      const { prompt, aspectRatio, imageSize, imageBase64, imageMimeType } =
        req.body as {
          prompt?: string;
          aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
          imageSize?: "1K" | "2K" | "4K";
          imageBase64?: string;
          imageMimeType?: string;
        };

      if (!prompt?.trim()) {
        return res.status(400).json({ error: "Informe o prompt da imagem." });
      }
      const ai = createAiClient();
      const parts: Array<{
        text?: string;
        inlineData?: { data: string; mimeType: string };
      }> = [];

      if (imageBase64) {
        parts.push({
          inlineData: {
            data: imageBase64,
            mimeType: imageMimeType || "image/png",
          },
        });
      }
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-nano-banana-2.1",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio || "16:9",
            imageSize: imageSize || "1K",
          },
        },
      });

      let imageUrl = "";
      let notes = "";
      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? "image/png";
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          notes += part.text;
        }
      }

      if (!imageUrl) {
        return res
          .status(502)
          .json({ error: "O modelo não retornou uma imagem gerada." });
      }

      return res.json({ imageUrl, notes: notes.trim() });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Geração de Vídeo & Animação de Imagem (gemini-omni-1.2-flash via Interactions API)
  app.post("/api/video", async (req, res) => {
    try {
      const { prompt, aspectRatio, imageBase64, imageMimeType } = req.body as {
        prompt?: string;
        aspectRatio?: "16:9" | "9:16";
        imageBase64?: string;
        imageMimeType?: string;
      };

      if (!prompt?.trim()) {
        return res.status(400).json({ error: "Informe o prompt do vídeo." });
      }
      const safeAspect = aspectRatio === "9:16" ? "9:16" : "16:9";
      const ai = createAiClient();

      const input = imageBase64
        ? [
            {
              type: "image" as const,
              mime_type: imageMimeType || "image/png",
              data: imageBase64,
            },
            {
              type: "text" as const,
              text: prompt,
            },
          ]
        : prompt;

      const interaction = await ai.interactions.create(
        {
          model: "gemini-omni-1.2-flash",
          input,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: "video",
            aspect_ratio: safeAspect,
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (!videoPart?.data) {
        return res
          .status(502)
          .json({ error: "O modelo não retornou dados de vídeo." });
      }

      const mime = videoPart.mime_type || "video/mp4";
      return res.json({
        videoDataUrl: `data:${mime};base64,${videoPart.data}`,
        aspectRatio: safeAspect,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const server = http.createServer(app);

  // 5. Conversas por Voz em Tempo Real (gemini-3.8-live via Live API WebSocket)
  const wss = new WebSocketServer({ server, path: "/live" });
  wss.on("connection", async (clientWs) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null =
      null;
    try {
      const ai = createAiClient();
      liveSession = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction:
            "Você é a Dra. Clara Sato, Psicóloga-Chefe presa nos Alojamentos da Ala Leste do Complexo Subterrâneo Vanguard-7, falando pelo rádio de emergência com o engenheiro Arthur Vance. Responda SEMPRE em Português do Brasil (PT-BR), com tom tenso, realista e conciso de sobrevivência, mantendo coerência com o universo de Protocolo Newborn (Protocolo Éden, criatura Newborn sem pálpebras que imita vozes, painéis de relés na Ala Médica e código 0719).",
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  inputTranscript: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  outputTranscript: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error:
                    err instanceof Error
                      ? err.message
                      : "Erro na conexão Live API.",
                })
              );
            }
          },
        },
      });
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (err) {
      const formatted = formatApiError(err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: formatted.message }));
        clientWs.close();
      }
      return;
    }

    clientWs.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as {
          audio?: string;
          text?: string;
        };
        if (!liveSession) return;
        if (parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (parsed.text) {
          liveSession.sendRealtimeInput({ text: parsed.text });
        }
      } catch {
        // Ignora pacotes malformados
      }
    });

    clientWs.on("close", () => {
      try {
        liveSession?.close();
      } catch {
        // Encerramento seguro
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Protocolo Newborn ativo na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Falha ao iniciar servidor:", err);
  process.exit(1);
});

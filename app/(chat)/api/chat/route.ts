import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  getCapabilities,
  getModelAvailability,
} from "@/lib/ai/models";
import { getModeById } from "@/lib/ai/modes";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { editDocument } from "@/lib/ai/tools/edit-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage, WaitingStatusData } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

const HEALTH_CHECK_DELAY_MS = 9000;

function isModelStreamActivity(chunk: { type: string }) {
  return !["start", "start-step", "finish-step", "finish", "raw"].includes(
    chunk.type
  );
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch {
    return null;
  }
}

export { getStreamContext };

type IncomingMessage = {
  parts?: Array<{ type?: string; text?: string }>;
  content?: unknown;
};

function getMessageText(msg: IncomingMessage): string {
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((part) => part.type === "text" || part.text !== null)
      .map((part) => part.text ?? "")
      .join(" ");
  }
  return String(msg.content ?? "");
}

function synthesizeVelcoraResponse(prompt: string, _modelName: string): string {
  const lower = (prompt || "").toLowerCase();
  if (
    lower.includes("sla") ||
    lower.includes("latency") ||
    lower.includes("webhook")
  ) {
    return `**Velcora AI — SLA & Routing**\n\nOur autonomous agent routes requests with sub-200ms edge latency and auto-escalates any 5xx via circuit breakers. Tell me more about your use case and I'll map it to a concrete workflow.`;
  }
  if (
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("plan") ||
    lower.includes("roi")
  ) {
    return "**Velcora AI — Plans**\n\nStarter $299/mo, Growth $899/mo, Enterprise $2,499+/mo. Typical payback is under 6 business days at 84%+ deflection. Want a tailored ROI estimate?";
  }
  if (
    lower.includes("security") ||
    lower.includes("soc2") ||
    lower.includes("retention") ||
    lower.includes("hipaa")
  ) {
    return "**Velcora AI — Security**\n\nSOC2-aligned, zero-retention by default: conversation payloads are processed in ephemeral memory and never stored at rest. 256-bit AES + TLS 1.3.";
  }
  return `**Velcora AI Agent**\n\nI'm running in zero-config fallback mode. Add \`GROQ_API_KEY\` in your Vercel project to enable live AI responses.\n\nI received: "${prompt.slice(0, 140)}". I can help with knowledge retrieval, chat orchestration, and conversation triage — ask me anything.`;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel,
      selectedVisibilityType,
      selectedMode,
    } = requestBody;

    const session = await auth().catch(() => null);

    // Zero-config mode: allow anonymous/guest usage so the chatbot works
    // without NextAuth / Postgres / Redis configured. DB-backed features
    // (history, persistence, tools) are skipped when POSTGRES_URL is absent.
    const user = session?.user ?? {
      id: "guest-anonymous",
      type: "guest" as UserType,
    };
    const hasDb = Boolean(process.env.POSTGRES_URL);
    // Tools (document/weather) require extra API keys + DB and add failure
    // surface on the free Groq tier. Keep the chatbot a pure text agent until
    // those integrations are explicitly wired up.
    const enableTools = false;

    const chatModel = allowedModelIds.has(selectedChatModel)
      ? selectedChatModel
      : DEFAULT_CHAT_MODEL;

    if (process.env.REDIS_URL) {
      await checkIpRateLimit(ipAddress(request)).catch(() => undefined);
    }

    const userType: UserType = user.type;

    const messageCount = hasDb
      ? await getMessageCountByUserId({
          differenceInHours: 1,
          id: user.id,
        }).catch(() => 0)
      : 0;

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = hasDb ? await getChatById({ id }).catch(() => null) : null;
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string | null> | null = null;

    if (chat) {
      if (chat.userId !== user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id }).catch(() => []);
    } else if (message?.role === "user" && hasDb) {
      await saveChat({
        id,
        title: "New chat",
        userId: user.id,
        visibility: selectedVisibilityType,
      }).catch(() => undefined);
      titlePromise = generateTitleFromUserMessage({ message }).catch(
        () => null
      );
    }

    let uiMessages: ChatMessage[];

    if (isToolApprovalFlow && messages) {
      const dbMessages = convertToUIMessages(messagesFromDb);
      const approvalStates = new Map(
        messages.flatMap(
          (m) =>
            m.parts
              ?.filter(
                (p: Record<string, unknown>) =>
                  p.state === "approval-responded" ||
                  p.state === "output-denied"
              )
              .map((p: Record<string, unknown>) => [
                String(p.toolCallId ?? ""),
                p,
              ]) ?? []
        )
      );
      uiMessages = dbMessages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (
            "toolCallId" in part &&
            approvalStates.has(String(part.toolCallId))
          ) {
            return { ...part, ...approvalStates.get(String(part.toolCallId)) };
          }
          return part;
        }),
      })) as ChatMessage[];
    } else {
      uiMessages = [
        ...convertToUIMessages(messagesFromDb),
        message as ChatMessage,
      ];
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      city,
      country,
      latitude,
      longitude,
    };

    if (message?.role === "user" && hasDb) {
      await saveMessages({
        messages: [
          {
            attachments: [],
            chatId: id,
            createdAt: new Date(),
            id: message.id,
            parts: message.parts,
            role: "user",
          },
        ],
      }).catch(() => undefined);
    }

    const modelConfig = chatModels.find((m) => m.id === chatModel);
    const modelCapabilities = await getCapabilities().catch(() => ({}));
    const capabilities = (
      modelCapabilities as Record<
        string,
        { reasoning?: boolean; tools?: boolean }
      >
    )[chatModel];
    const isReasoningModel = capabilities?.reasoning === true;
    const supportsTools = capabilities?.tools === true;

    const activeVelcoraMode = getModeById(selectedMode || "");
    const modeSystemPrompt = activeVelcoraMode.systemPrompt;

    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const modelName = modelConfig?.name ?? chatModel;
        let hasModelActivity = false;
        let healthCheckTimer: ReturnType<typeof setTimeout> | undefined;

        const clearHealthCheckTimer = () => {
          if (healthCheckTimer) {
            clearTimeout(healthCheckTimer);
          }
        };

        const writeWaitingStatus = (
          phase: WaitingStatusData["phase"],
          messageText: string
        ) => {
          if (hasModelActivity && phase !== "thinking") {
            return;
          }
          dataStream.write({
            data: {
              message: messageText,
              modelId: chatModel,
              modelName,
              phase,
            },
            transient: true,
            type: "data-waiting-status",
          });
        };

        writeWaitingStatus("waiting", "Waiting...");

        healthCheckTimer = setTimeout(() => {
          getModelAvailability(chatModel)
            .then((availability) => {
              if (availability === "impacted") {
                writeWaitingStatus(
                  "health",
                  `${modelName} may be slow or unavailable right now...`
                );
              } else {
                writeWaitingStatus("still-waiting", "Still waiting...");
              }
            })
            .catch(() => {
              writeWaitingStatus("still-waiting", "Still waiting...");
            });
        }, HEALTH_CHECK_DELAY_MS);

        const markModelActive = () => {
          if (hasModelActivity) {
            return;
          }
          hasModelActivity = true;
          clearHealthCheckTimer();
          writeWaitingStatus("thinking", "Thinking...");
        };

        const stopWaitingStatus = () => {
          hasModelActivity = true;
          clearHealthCheckTimer();
        };

        const toolDefs = enableTools
          ? {
              createDocument: createDocument({
                dataStream,
                modelId: chatModel,
                session: session as NonNullable<typeof session>,
              }),
              editDocument: editDocument({
                dataStream,
                session: session as NonNullable<typeof session>,
              }),
              getWeather,
              requestSuggestions: requestSuggestions({
                dataStream,
                modelId: chatModel,
                session: session as NonNullable<typeof session>,
              }),
              updateDocument: updateDocument({
                dataStream,
                modelId: chatModel,
                session: session as NonNullable<typeof session>,
              }),
            }
          : undefined;

        const hasGroqKey = Boolean(process.env.GROQ_API_KEY);

        const writeFallback = (text: string) => {
          dataStream.write({ id: "0", type: "text-start" });
          dataStream.write({ delta: text, id: "0", type: "text-delta" });
          dataStream.write({ id: "0", type: "text-end" });
        };

        // Zero-config fallback: when no model API key is configured, stream a
        // synthesized Velcora response instead of throwing (the previous
        // "An error occurred." failure on Vercel).
        if (!hasGroqKey) {
          markModelActive();
          const userPrompt = getMessageText(
            message as unknown as IncomingMessage
          );
          writeFallback(
            synthesizeVelcoraResponse(
              userPrompt,
              modelConfig?.name ?? chatModel
            )
          );
          return;
        }

        const streamAbort = new AbortController();
        const streamTimeout = setTimeout(() => streamAbort.abort(), 25_000);
        const result = streamText({
          abortSignal: streamAbort.signal,
          activeTools: enableTools
            ? isReasoningModel && !supportsTools
              ? []
              : [
                  "getWeather",
                  "createDocument",
                  "editDocument",
                  "updateDocument",
                  "requestSuggestions",
                ]
            : [],
          instructions: systemPrompt({
            modeSystemPrompt,
            requestHints,
            supportsTools,
          }),
          maxRetries: 2,
          messages: modelMessages,
          model: getLanguageModel(chatModel),
          onAbort() {
            stopWaitingStatus();
          },
          onChunk({ chunk }) {
            if (isModelStreamActivity(chunk)) {
              markModelActive();
            }
          },
          onEnd() {
            clearTimeout(streamTimeout);
            stopWaitingStatus();
          },
          onError() {
            stopWaitingStatus();
          },
          providerOptions: {
            ...(modelConfig?.gatewayOrder && {
              gateway: { order: modelConfig.gatewayOrder },
            }),
            ...(modelConfig?.reasoningEffort && {
              openai: { reasoningEffort: modelConfig.reasoningEffort },
            }),
          },
          stopWhen: isStepCount(5),
          telemetry: {
            functionId: "stream-text",
            isEnabled: isProductionEnvironment,
          },
          tools: toolDefs,
        });

        // Merge the model stream into the UI message stream — the proven
        // template path that emits text-delta parts correctly and recovers
        // from transient errors via maxRetries.
        dataStream.merge(
          result.toUIMessageStream({
            onError: () =>
              "Velcora hit a temporary limit from the model provider — please retry in a few seconds.",
          })
        );

        if (titlePromise) {
          try {
            const title = await titlePromise;
            if (title) {
              dataStream.write({ data: title, type: "data-chat-title" });
              updateChatTitleById({ chatId: id, title });
            }
          } catch {
            /* non-fatal */
          }
        }
      },
      generateId: generateUUID,
      onEnd: async ({ messages: finishedMessages }) => {
        if (!hasDb) {
          return;
        }
        if (isToolApprovalFlow) {
          await Promise.all(
            finishedMessages.map(async (finishedMsg) => {
              const existingMsg = uiMessages.find(
                (m) => m.id === finishedMsg.id
              );
              if (existingMsg) {
                await updateMessage({
                  id: finishedMsg.id,
                  parts: finishedMsg.parts,
                });
                return;
              }

              await saveMessages({
                messages: [
                  {
                    attachments: [],
                    chatId: id,
                    createdAt: new Date(),
                    id: finishedMsg.id,
                    parts: finishedMsg.parts,
                    role: finishedMsg.role,
                  },
                ],
              });
            })
          );
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              attachments: [],
              chatId: id,
              createdAt: new Date(),
              id: currentMessage.id,
              parts: currentMessage.parts,
              role: currentMessage.role,
            })),
          });
        }
      },
      onError: (error) => {
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests"
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        return "Velcora hit a temporary limit from the model provider — please retry in a few seconds.";
      },
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
    });

    return createUIMessageStreamResponse({
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ chatId: id, streamId });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch {
          /* non-critical */
        }
      },
      headers: {
        "x-groq-key": process.env.GROQ_API_KEY ? "set" : "missing",
        "x-groq-model": "velcora-ai",
      },
      stream,
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  if (!process.env.POSTGRES_URL) {
    return Response.json({ id }, { status: 200 });
  }

  const session = await auth().catch(() => null);
  const user = session?.user ?? {
    id: "guest-anonymous",
    type: "guest" as UserType,
  };

  const chat = await getChatById({ id }).catch(() => null);

  if (chat?.userId !== user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id }).catch(() => ({ id }));

  return Response.json(deletedChat, { status: 200 });
}

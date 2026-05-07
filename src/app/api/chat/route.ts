import { type UIMessage, convertToModelMessages } from "ai";
import {
  type Provider,
  PROVIDERS,
  buildPortkeyConfig,
} from "@/lib/portkey-config";

export async function POST(req: Request) {
  const body = await req.json();
  const {
    messages: uiMessages,
    provider: providerKey = "openai",
    guardrailsEnabled = false,
  } = body as {
    messages: UIMessage[];
    provider: Provider;
    guardrailsEnabled: boolean;
  };

  const providerConfig = PROVIDERS[providerKey];
  if (!providerConfig) {
    return new Response(JSON.stringify({ error: "Unknown provider" }), {
      status: 400,
    });
  }

  const apiKey =
    providerKey === "openai"
      ? process.env.OPENAI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `Missing API key for ${providerKey}` }),
      { status: 500 }
    );
  }

  const portkeyConfig = buildPortkeyConfig({
    guardrailsEnabled,
    airsApiKey: process.env.PRISMA_AIRS_API_KEY,
    profileName: process.env.PRISMA_AIRS_PROFILE_NAME,
  });

  const gatewayUrl =
    process.env.PORTKEY_GATEWAY_URL || "http://localhost:8787/v1";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-portkey-provider": providerConfig.provider,
    Authorization: `Bearer ${apiKey}`,
  };

  if (Object.keys(portkeyConfig).length > 0) {
    headers["x-portkey-config"] = JSON.stringify(portkeyConfig);
  }

  const modelMessages = await convertToModelMessages(uiMessages);

  const gatewayResponse = await fetch(`${gatewayUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: providerConfig.model,
      messages: modelMessages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content
                .filter(
                  (p): p is { type: "text"; text: string } => p.type === "text"
                )
                .map((p) => p.text)
                .join(""),
      })),
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!gatewayResponse.ok) {
    const errorBody = await gatewayResponse.text();
    const statusCode = gatewayResponse.status;
    return new Response(
      uiStream(
        null,
        statusCode === 446
          ? `AIRS GUARDRAIL BLOCKED: Request denied by Prisma AIRS security scan. ${errorBody}`
          : `Gateway error (${statusCode}): ${errorBody}`
      ),
      { headers: SSE_HEADERS }
    );
  }

  if (!gatewayResponse.body) {
    return new Response(uiStream(null, "No response body from gateway"), {
      headers: SSE_HEADERS,
    });
  }

  return new Response(sseToUIStream(gatewayResponse.body), {
    headers: SSE_HEADERS,
  });
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
};

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function uiStream(text: string | null, error: string | null): ReadableStream {
  const encoder = new TextEncoder();
  const id = crypto.randomUUID();

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse({ type: "start" })));
      if (error) {
        controller.enqueue(encoder.encode(sse({ type: "error", errorText: error })));
      } else if (text) {
        controller.enqueue(encoder.encode(sse({ type: "text-start", id })));
        controller.enqueue(encoder.encode(sse({ type: "text-delta", id, delta: text })));
        controller.enqueue(encoder.encode(sse({ type: "text-end", id })));
      }
      controller.enqueue(encoder.encode(sse({ type: "finish", finishReason: "stop" })));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

// Converts OpenAI-compatible SSE stream from the gateway into AI SDK v6 UI message stream
function sseToUIStream(gatewayBody: ReadableStream): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const textPartId = crypto.randomUUID();
  let started = false;
  let textStarted = false;
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = gatewayBody.getReader();

      try {
        controller.enqueue(encoder.encode(sse({ type: "start" })));
        started = true;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const chunk = JSON.parse(data);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                if (!textStarted) {
                  controller.enqueue(
                    encoder.encode(sse({ type: "text-start", id: textPartId }))
                  );
                  textStarted = true;
                }
                controller.enqueue(
                  encoder.encode(
                    sse({ type: "text-delta", id: textPartId, delta: content })
                  )
                );
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        if (textStarted) {
          controller.enqueue(
            encoder.encode(sse({ type: "text-end", id: textPartId }))
          );
        }
        controller.enqueue(
          encoder.encode(sse({ type: "finish", finishReason: "stop" }))
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        if (!started) {
          controller.enqueue(encoder.encode(sse({ type: "start" })));
        }
        controller.enqueue(
          encoder.encode(
            sse({
              type: "error",
              errorText: err instanceof Error ? err.message : "Stream error",
            })
          )
        );
      } finally {
        controller.close();
      }
    },
  });
}

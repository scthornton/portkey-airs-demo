import { PROVIDERS, buildPortkeyConfig } from "@/lib/portkey-config";

export async function POST(req: Request) {
  const body = await req.json();

  const provider = "anthropic";
  const providerConfig = PROVIDERS[provider];
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: { message: "Missing ANTHROPIC_API_KEY", type: "server_error" } },
      { status: 500 }
    );
  }

  const portkeyConfig = buildPortkeyConfig({
    guardrailsEnabled: true,
    airsApiKey: process.env.PRISMA_AIRS_API_KEY,
    profileName: process.env.PRISMA_AIRS_PROFILE_NAME,
    aiModel: body.model || providerConfig.model,
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

  const gatewayResponse = await fetch(`${gatewayUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      model: body.model || providerConfig.model,
      max_tokens: body.max_tokens || 1024,
    }),
  });

  const responseBody = await gatewayResponse.text();

  return new Response(responseBody, {
    status: gatewayResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}

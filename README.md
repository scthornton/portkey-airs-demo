# Portkey AI Gateway + Prisma AIRS Demo

Interactive demo app showcasing the [Portkey AI Gateway](https://github.com/portkey-ai/gateway) with [Palo Alto Networks Prisma AIRS](https://www.paloaltonetworks.com/prisma/airs) guardrails for real-time AI security scanning.

### Chat UI with demo prompt cards
![Landing page](docs/01-landing.png)

### AIRS guardrail blocking prompt injection in real time
![Guardrail blocked](docs/02-guardrail-blocked.png)

### Session logged in Strata Cloud Manager
![Strata Cloud Manager](docs/03-strata-cloud-manager.png)

## What This Demo Shows

- **AI Chat through Portkey Gateway** - Chat with LLMs routed through the Portkey AI Gateway proxy
- **Multi-model switching** - Switch between OpenAI and Anthropic models live
- **AIRS guardrail enforcement** - Toggle Prisma AIRS guardrails on/off to see prompt injection, DLP, and malicious content detection in action
- **Guardrail verdict display** - View detection categories, blocked topics, scan IDs, and execution times
- **Gateway observability** - Built-in Portkey console showing all request logs

## Architecture

```
Browser (:3000)        Next.js API Route        Portkey Gateway (:8787)           LLM Provider
  Chat UI  ---------->  /api/chat  ---------->  panw-prisma-airs guardrail  --->  Anthropic / OpenAI
  (streaming)           (builds config,         (scans input/output via AIRS)     (returns completion)
                         sets headers)
```

Two processes run locally:
1. **Portkey Gateway** (Docker) on port 8787 - includes built-in console + AIRS plugin
2. **Next.js** on port 3000 - chat UI + API route

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- [Node.js](https://nodejs.org/) 18+
- API key for at least one LLM provider (OpenAI or Anthropic)
- (Optional) Prisma AIRS API key + security profile for guardrail scanning

## Quick Start

1. **Clone and install:**
   ```bash
   git clone https://github.com/scthornton/portkey-airs-demo.git
   cd portkey-airs-demo
   npm install
   ```

2. **Create `.env.local`:**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your API keys
   ```

3. **Run the demo:**
   ```bash
   ./start.sh
   ```

4. **Open in browser:**
   - Chat UI: http://localhost:3000
   - Gateway Console: http://localhost:8787/public/

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key |
| `PRISMA_AIRS_API_KEY` | No | Prisma AIRS API key for guardrail scanning |
| `PRISMA_AIRS_PROFILE_NAME` | No | AIRS security profile name (default: `chatbot`) |
| `PORTKEY_GATEWAY_URL` | No | Gateway URL (default: `http://localhost:8787/v1`) |

## Demo Script

1. **Normal chat** - Send a message with guardrails OFF, show it routes through the Portkey gateway
2. **Enable AIRS** - Toggle guardrails ON
3. **Attack prompts** - Click the pre-built attack cards (prompt injection, sensitive data, malware URL) to see them blocked with detailed verdicts
4. **Safe prompt** - Show that legitimate prompts pass through AIRS without issue
5. **Toggle comparison** - Turn guardrails OFF, send the same attack, show it passes through unprotected
6. **Gateway console** - Open `:8787/public/` to show all logged requests with status codes

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [Vercel AI SDK v6](https://sdk.vercel.ai/) (`@ai-sdk/react`)
- [Tailwind CSS](https://tailwindcss.com/)
- [Portkey AI Gateway](https://github.com/portkey-ai/gateway) (OSS, Docker)
- [Prisma AIRS](https://pan.dev/airs/) guardrail plugin

## How It Works

The Next.js API route (`/api/chat`) sends requests to the local Portkey gateway with:
- `x-portkey-provider` header to select the LLM provider
- `x-portkey-config` header with inline guardrail configuration using the `panw-prisma-airs.intercept` plugin

When AIRS guardrails are enabled, the gateway scans prompts before forwarding to the LLM. If a threat is detected (prompt injection, sensitive data, malicious URLs, topic violations), the gateway returns a `446` status code with detailed scan results. The chat UI parses these results and displays them as tagged verdict cards.

## Links

- [Portkey AI Gateway](https://github.com/portkey-ai/gateway)
- [PANW Prisma AIRS Integration](https://github.com/PaloAltoNetworks/prisma-airs-integrations/tree/main/Portkey)
- [Portkey AIRS Plugin](https://portkey.ai/docs/integrations/guardrails/palo-alto-panw-prisma)
- [Prisma AIRS Documentation](https://pan.dev/airs/)

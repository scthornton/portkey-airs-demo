"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { type Provider, PROVIDERS, DEMO_PROMPTS } from "@/lib/portkey-config";

interface AirsVerdictInfo {
  action: string;
  category: string;
  profileName: string;
  detections: string[];
  blockedTopics: string[];
  executionTime: number;
  scanId: string;
}

function parseAirsError(errorText: string): AirsVerdictInfo | null {
  try {
    const jsonMatch = errorText.match(/\{[\s\S]*\}$/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const hookResults =
      parsed.hook_results || parsed.error?.hook_results || null;
    if (!hookResults?.before_request_hooks?.length) return null;

    const hook = hookResults.before_request_hooks[0];
    const check = hook.checks?.[0];
    if (!check?.data) return null;

    const d = check.data;
    const detections: string[] = [];
    if (d.prompt_detected?.injection) detections.push("Prompt Injection");
    if (d.prompt_detected?.dlp) detections.push("Data Loss Prevention");
    if (d.prompt_detected?.malicious_code) detections.push("Malicious Code");
    if (d.prompt_detected?.toxic_content) detections.push("Toxic Content");
    if (d.prompt_detected?.url_cats) detections.push("Malicious URL");
    if (d.prompt_detected?.topic_violation) detections.push("Topic Violation");
    if (d.prompt_detected?.agent) detections.push("Agent Threat");

    return {
      action: d.action || "block",
      category: d.category || "unknown",
      profileName: d.profile_name || "unknown",
      detections,
      blockedTopics:
        d.prompt_detection_details?.topic_guardrails_details?.blocked_topics ||
        [],
      executionTime: check.execution_time || 0,
      scanId: d.scan_id || "",
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [guardrailsEnabled, setGuardrailsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const providerRef = useRef(provider);
  const guardrailsRef = useRef(guardrailsEnabled);
  providerRef.current = provider;
  guardrailsRef.current = guardrailsEnabled;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          provider: providerRef.current,
          guardrailsEnabled: guardrailsRef.current,
        }),
      }),
    []
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const isStreaming = status === "streaming";

  const handleSend = (text: string) => {
    sendMessage({ text });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3 backdrop-blur">
        <button
          onClick={() => setMessages([])}
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
          title="Back to home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f04e23]">
            <span className="text-sm font-bold text-white">P</span>
          </div>
          <div className="text-left">
            <h1 className="text-sm font-semibold text-zinc-100">
              Portkey AI Gateway
            </h1>
            <p className="text-xs text-zinc-500">Prisma AIRS Security Demo</p>
          </div>
        </button>
        <div className="flex items-center gap-4">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
          >
            {Object.entries(PROVIDERS).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-xs text-zinc-400">AIRS Guardrails</span>
            <button
              type="button"
              role="switch"
              aria-checked={guardrailsEnabled}
              onClick={() => setGuardrailsEnabled(!guardrailsEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                guardrailsEnabled ? "bg-[#00c4b3]" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  guardrailsEnabled ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <a
            href="http://localhost:8787/public/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            Gateway Console
          </a>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <EmptyState
              onSend={handleSend}
              guardrailsEnabled={guardrailsEnabled}
            />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </>
          )}

          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
              Responding via {PROVIDERS[provider].label}...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <InputBar
        onSend={handleSend}
        isStreaming={isStreaming}
        onClear={() => {
          setMessages([]);
        }}
      />

      {/* Status Bar */}
      <footer className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900/60 px-6 py-1.5">
        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
          <span>
            Gateway: <span className="text-emerald-500">localhost:8787</span>
          </span>
          <span className="text-zinc-700">|</span>
          <span>Provider: {PROVIDERS[provider].label}</span>
          <span className="text-zinc-700">|</span>
          <span>Model: {PROVIDERS[provider].model}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {guardrailsEnabled ? (
            <span className="flex items-center gap-1 text-[#00c4b3]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00c4b3]" />
              AIRS Active
            </span>
          ) : (
            <span className="flex items-center gap-1 text-zinc-600">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600" />
              AIRS Off
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

function GuardrailAlert({
  errorText,
  verdict,
}: {
  errorText: string;
  verdict: AirsVerdictInfo | null;
}) {
  if (verdict) {
    return (
      <div className="animate-fade-in rounded-lg border border-red-900/50 bg-red-950/20 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded bg-red-900/70 px-2 py-0.5 text-[10px] font-bold tracking-wider text-red-200">
            BLOCKED
          </span>
          <span className="text-xs font-medium text-red-400">
            Prisma AIRS Guardrail
          </span>
          <span className="ml-auto text-[10px] text-zinc-600">
            {verdict.executionTime}ms
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {verdict.detections.map((d) => (
              <span
                key={d}
                className="inline-flex items-center rounded-full border border-red-800/40 bg-red-900/30 px-2 py-0.5 text-[11px] text-red-300"
              >
                {d}
              </span>
            ))}
          </div>

          {verdict.blockedTopics.length > 0 && (
            <div className="text-xs text-zinc-500">
              <span className="text-zinc-600">Blocked topics: </span>
              {verdict.blockedTopics.join(", ")}
            </div>
          )}

          <div className="flex gap-4 text-[10px] text-zinc-600">
            <span>Category: {verdict.category}</span>
            <span>Profile: {verdict.profileName}</span>
            {verdict.scanId && (
              <span className="font-mono">{verdict.scanId.slice(0, 8)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in rounded-lg border border-amber-900/50 bg-amber-950/20 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded bg-amber-900/70 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-200">
          ERROR
        </span>
      </div>
      <p className="mt-2 text-sm text-amber-300/80">{errorText}</p>
    </div>
  );
}

function EmptyState({
  onSend,
  guardrailsEnabled,
}: {
  onSend: (text: string) => void;
  guardrailsEnabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f04e23] to-[#ff6b3d]">
        <span className="text-2xl font-bold text-white">P</span>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-zinc-200">
        Portkey AI Gateway Demo
      </h2>
      <p className="mb-8 max-w-md text-center text-sm text-zinc-500">
        Chat with AI through the Portkey gateway. Toggle AIRS guardrails to see
        Prisma AIRS scan prompts and responses in real time.
      </p>

      <div className="grid w-full max-w-lg grid-cols-2 gap-2">
        {DEMO_PROMPTS.map((prompt) => (
          <button
            key={prompt.label}
            onClick={() => onSend(prompt.text)}
            className="group rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800/80"
          >
            <span
              className={`mb-1 inline-block text-[10px] font-medium tracking-wider ${
                prompt.label === "Safe Prompt"
                  ? "text-emerald-500"
                  : "text-amber-500"
              }`}
            >
              {prompt.label.toUpperCase()}
            </span>
            <p className="text-xs leading-relaxed text-zinc-400 group-hover:text-zinc-300">
              {prompt.text}
            </p>
          </button>
        ))}
      </div>

      {!guardrailsEnabled && (
        <p className="mt-6 text-xs text-amber-600/80">
          Enable AIRS Guardrails in the header to see security scanning in
          action
        </p>
      )}
    </div>
  );
}

interface UIMessageDisplay {
  id: string;
  role: string;
  parts: Array<{ type: string; text?: string }>;
  content?: string;
}

function MessageBubble({ message }: { message: UIMessageDisplay }) {
  const isUser = message.role === "user";

  const text =
    message.parts
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ||
    message.content ||
    "";

  if (!isUser && text.startsWith("AIRS_BLOCKED:")) {
    const verdict = parseAirsError(text.slice("AIRS_BLOCKED:".length));
    return (
      <GuardrailAlert
        errorText="Request blocked by Prisma AIRS"
        verdict={verdict}
      />
    );
  }

  return (
    <div
      className={`animate-fade-in flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-indigo-600 text-white"
            : "border border-zinc-800 bg-zinc-900 text-zinc-200"
        }`}
      >
        {!isUser && (
          <div className="mb-1 text-[10px] font-medium text-zinc-500">
            AI Assistant
          </div>
        )}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {text}
        </div>
      </div>
    </div>
  );
}

function InputBar({
  onSend,
  isStreaming,
  onClear,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onClear: () => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <button
          onClick={onClear}
          className="mb-0.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          title="Clear chat"
        >
          Clear
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isStreaming}
          className="mb-0.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600"
        >
          Send
        </button>
      </div>
    </div>
  );
}

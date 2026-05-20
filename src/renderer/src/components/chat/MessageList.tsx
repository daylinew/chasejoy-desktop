import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MessageRow } from "@shared/domain.js";

interface Props {
  messages: MessageRow[];
  streamingBubble: { id: string; content: string; streaming: boolean } | null;
}

export function MessageList({ messages, streamingBubble }: Props) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {messages.map((m) => (
        <Bubble key={m.id} role={m.role} content={m.content} />
      ))}
      {streamingBubble && streamingBubble.streaming ? (
        <Bubble role="assistant" content={streamingBubble.content || "…"} streaming />
      ) : null}
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
}: {
  role: MessageRow["role"];
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const isTool = role === "tool";

  if (isTool) return null; // Tool messages are surfaced in the right panel instead.

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed shadow-panel ${
          isUser
            ? "bg-cj-accent/20 text-slate-100"
            : "bg-cj-panel border border-cj-border text-slate-100"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-cj-dim">
          <span>{isUser ? "You" : "Agent"}</span>
          {streaming ? <span className="text-cj-accent">streaming…</span> : null}
        </div>
        <div className="cj-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

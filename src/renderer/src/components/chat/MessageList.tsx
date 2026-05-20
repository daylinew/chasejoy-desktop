import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { MessageRow, SubagentStreamInterface } from "@shared/domain.js";
import { SubagentCard, SubagentProgress } from "./SubagentCard";

interface Props {
  messages: MessageRow[];
  streamingBubble: {
    id: string;
    content: string;
    streaming: boolean;
    subagents?: SubagentStreamInterface[];
  } | null;
}

export function MessageList({ messages, streamingBubble }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {messages.map((m) => {
        const subagentsList: SubagentStreamInterface[] = m.subagents
          ? JSON.parse(m.subagents)
          : [];
        return (
          <Bubble
            key={m.id}
            role={m.role}
            content={m.content}
            subagents={subagentsList}
          />
        );
      })}
      {streamingBubble && streamingBubble.streaming ? (
        <Bubble
          role="assistant"
          content={streamingBubble.content || "…"}
          streaming
          subagents={streamingBubble.subagents || []}
        />
      ) : null}
    </div>
  );
}

function Bubble({
  role,
  content,
  streaming,
  subagents,
}: {
  role: MessageRow["role"];
  content: string;
  streaming?: boolean;
  subagents: SubagentStreamInterface[];
}) {
  const isUser = role === "user";
  const isTool = role === "tool";

  if (isTool) return null; // Tool messages are surfaced in the right panel instead.

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed shadow-panel ${
          isUser
            ? "bg-cj-accent text-white"
            : "border border-cj-border bg-white text-slate-800"
        }`}
      >
        <div className={`mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider ${isUser ? "text-blue-100" : "text-cj-dim"}`}>
          <span>{isUser ? "You" : "Agent"}</span>
          {streaming ? <span className={isUser ? "text-white" : "text-cj-accent"}>streaming...</span> : null}
        </div>
        <div className="cj-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {subagents && subagents.length > 0 && (
          <div className="mt-4 space-y-3 border-l border-cj-accent/20 pl-3">
            <SubagentProgress subagents={subagents} />
            {subagents.map((subagent) => (
              <SubagentCard key={subagent.id} subagent={subagent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

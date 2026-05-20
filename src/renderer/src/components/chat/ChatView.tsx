import { useEffect, useRef } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { SynthesisIndicator } from "./SubagentCard";

export function ChatView() {
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const messages = useAppStore((s) => s.messages);
  const streamingBubble = useAppStore((s) => s.streamingBubble);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingBubble?.content, streamingBubble?.subagents]);

  if (!activeAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-cj-dim">
        <div className="rounded-2xl border border-cj-border bg-white px-8 py-7 text-center shadow-panel">
          <div className="text-lg font-semibold text-slate-950">No agent selected</div>
          <div className="mt-1 text-sm">Create or select an agent to start building.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <MessageList messages={messages} streamingBubble={streamingBubble} />
          {streamingBubble && (
            <SynthesisIndicator
              subagents={streamingBubble.subagents || []}
              isLoading={streamingBubble.streaming}
            />
          )}
        </div>
      </div>
      <div className="border-t border-cj-border bg-white/90 px-5 py-4">
        <Composer disabled={!activeThreadId && messages.length === 0 ? false : false} />
      </div>
    </div>
  );
}

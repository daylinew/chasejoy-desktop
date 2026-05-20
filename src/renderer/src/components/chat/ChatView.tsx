import { useEffect, useRef } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

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
  }, [messages.length, streamingBubble?.content]);

  if (!activeAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-cj-dim">
        <div className="text-lg text-slate-200">No agent selected</div>
        <div className="text-sm">Create one from the sidebar to get started.</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-4">
        <MessageList messages={messages} streamingBubble={streamingBubble} />
      </div>
      <div className="border-t border-cj-border bg-cj-panel/60 px-4 py-3">
        <Composer disabled={!activeThreadId && messages.length === 0 ? false : false} />
      </div>
    </div>
  );
}

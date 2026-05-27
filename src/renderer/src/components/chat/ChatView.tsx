import { useEffect, useRef } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatView() {
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const messages = useAppStore((s) => s.messages);
  const streamingBubble = useAppStore((s) => s.streamingBubble);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const isEmpty = messages.length === 0 && !streamingBubble;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingBubble?.content, streamingBubble?.subagents]);

  if (!activeAgentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
        <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-7 text-center shadow-sm">
          <div className="text-lg font-semibold text-slate-950">No agent selected</div>
          <div className="mt-1 text-sm">配置好模型后即可开始使用。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[radial-gradient(circle_at_50%_-20%,#ffffff_0%,#fbfbfa_42%,#f6f6f4_100%)]">
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-8">
          <div className="w-full max-w-[min(760px,calc(100vw-2rem))]">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg font-medium text-zinc-500 shadow-sm">
                C
              </div>
              <h1 className="text-[26px] font-semibold tracking-normal text-slate-950">不止聊天，搞定一切</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                本地运行，自主规划，安全可控的 AI 工作搭子
              </p>
            </div>
            <Composer />
            <div className="mt-3 text-center text-xs text-zinc-400">
              直接描述任务即可。需要限定上下文时，再用 + 添加文件。
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollerRef}
            className="flex-1 overflow-y-auto px-4 pb-64 pt-8 sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-[min(860px,calc(100vw-2rem))] flex-col gap-7">
              <MessageList messages={messages} streamingBubble={streamingBubble} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#fbfbfa] via-[#fbfbfa]/95 to-transparent px-3 pb-4 pt-12 sm:px-5 sm:pb-5">
            <div className="pointer-events-auto mx-auto w-full max-w-[min(780px,calc(100vw-2rem))]">
              <Composer />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

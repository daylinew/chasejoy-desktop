import { useEffect, useMemo, useRef } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export function ChatView() {
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const agents = useAppStore((s) => s.agents);
  const providers = useAppStore((s) => s.providers);
  const threads = useAppStore((s) => s.threads);
  const messages = useAppStore((s) => s.messages);
  const streamingBubble = useAppStore((s) => s.streamingBubble);
  const composerBusy = useAppStore((s) => s.composerBusy);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const agent = useMemo(() => agents.find((a) => a.id === activeAgentId) ?? null, [agents, activeAgentId]);
  const provider = providers.find((p) => p.id === agent?.providerId) ?? null;
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
          <div className="mt-1 text-sm">Create or select an agent to start building.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[#fbfbfa]">
      {agent ? <EnvironmentCard agent={agent} providerLabel={provider?.label} threadCount={threads.length} /> : null}

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-8 pb-16">
          <div className="w-full max-w-[780px]">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl text-zinc-500 shadow-sm">
                C
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">不止聊天，搞定一切</h1>
              <p className="mt-2 text-sm text-zinc-500">
                本地运行，自主规划，安全可控的 AI 工作搭子
              </p>
            </div>
            <Composer />
            <div className="mt-3 text-center text-xs text-zinc-400">
              选择工作目录后，Agent 可以读取、编辑、测试并汇报执行过程。
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollerRef}
            className={`flex-1 overflow-y-auto px-8 pt-8 ${composerBusy ? "pb-48" : "pb-72"}`}
          >
            <div className="mx-auto flex max-w-[820px] flex-col gap-7">
              <MessageList messages={messages} streamingBubble={streamingBubble} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-5 pb-5 pt-10">
            <div className="pointer-events-auto">
              <Composer />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EnvironmentCard(props: {
  agent: {
    workspaceDir: string;
    model: string;
  };
  providerLabel?: string;
  threadCount: number;
}) {
  return (
    <div className="pointer-events-none absolute right-6 top-6 z-10 hidden w-64 rounded-2xl border border-zinc-200 bg-white/90 p-4 text-sm text-zinc-600 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:block">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium text-zinc-700">环境信息</span>
        <span className="text-zinc-400">⚙</span>
      </div>
      <div className="space-y-2">
        <InfoRow label="本地" value={shortPath(props.agent.workspaceDir)} />
        <InfoRow label="模型" value={props.agent.model || "未选择"} />
        <InfoRow label="来源" value={props.providerLabel ?? "Provider"} />
        <InfoRow label="会话" value={`${props.threadCount}`} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-right text-zinc-700" title={value}>
        {value}
      </span>
    </div>
  );
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

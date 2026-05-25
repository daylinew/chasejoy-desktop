import { useMemo } from "react";

import { useAppStore } from "@renderer/stores/appStore";

export function ProjectNavBar() {
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const threads = useAppStore((s) => s.threads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const refreshAgents = useAppStore((s) => s.refreshAgents);

  const agent = useMemo(() => agents.find((a) => a.id === activeAgentId) ?? null, [agents, activeAgentId]);
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  async function chooseWorkspace() {
    if (!agent) return;
    const selected = await window.chasejoy.api.dialogPickDirectory();
    if (!selected || selected === agent.workspaceDir) return;
    await window.chasejoy.api.agentUpdate(agent.id, { workspaceDir: selected });
    await refreshAgents();
  }

  if (!agent) {
    return (
      <div className="flex h-12 items-center border-b border-zinc-200 bg-[#fbfbfa] px-5 text-sm text-zinc-500">
        Select or create an agent to begin.
      </div>
    );
  }

  return (
    <div className="flex h-12 items-center justify-between gap-4 border-b border-zinc-200 bg-[#fbfbfa] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-950">{activeThread?.title || agent.name}</div>
          <div className="truncate text-[11px] text-zinc-400">{agent.role || "Base agent"}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void chooseWorkspace()}
        className="hidden max-w-[240px] truncate rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-white hover:text-slate-900 md:block"
        title={agent.workspaceDir}
      >
        {shortPath(agent.workspaceDir)}
      </button>
    </div>
  );
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

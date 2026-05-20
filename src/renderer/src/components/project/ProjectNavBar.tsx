import { useMemo } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import { AlignmentBadge } from "./AlignmentBadge";

export function ProjectNavBar() {
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const milestones = useAppStore((s) => s.milestones);
  const alignment = useAppStore((s) => s.alignment);
  const realign = useAppStore((s) => s.realign);
  const setGoalEditorOpen = useAppStore((s) => s.setGoalEditorOpen);

  const agent = useMemo(() => agents.find((a) => a.id === activeAgentId) ?? null, [agents, activeAgentId]);

  if (!agent) {
    return (
      <div className="flex items-center border-b border-cj-border bg-cj-panel px-4 py-2 text-xs text-cj-dim">
        Select or create an agent to begin.
      </div>
    );
  }

  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  const active = milestones.find((m) => m.status === "active");
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-4 border-b border-cj-border bg-cj-panel px-4 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{agent.name}</span>
          {agent.role ? <span className="chip">{agent.role}</span> : null}
        </div>
        <div className="truncate text-xs text-cj-dim" title={agent.goalPrompt}>
          Goal: {summarize(agent.goalPrompt, 110)}
        </div>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <div className="flex items-baseline justify-between text-xs text-cj-dim">
            <span>
              Milestones: <span className="text-slate-200">{done}/{total}</span>
              {active ? <span className="ml-2 text-cj-accent">· active: {active.title}</span> : null}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded bg-cj-panel2">
            <div
              className="h-1.5 rounded bg-cj-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <AlignmentBadge alignment={alignment} />

        <button
          onClick={() => void realign()}
          className="btn-ghost"
          title="Force the agent to pause and re-plan against the goal"
        >
          Realign
        </button>

        <button
          onClick={() => setGoalEditorOpen(true)}
          className="btn-ghost"
          title="Edit goal and milestones"
        >
          Edit goal
        </button>
      </div>
    </div>
  );
}

function summarize(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

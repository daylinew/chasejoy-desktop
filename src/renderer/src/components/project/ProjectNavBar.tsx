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
      <div className="flex items-center border-b border-cj-border bg-white px-5 py-3 text-sm text-cj-dim">
        Select or create an agent to begin.
      </div>
    );
  }

  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  const active = milestones.find((m) => m.status === "active");
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-5 border-b border-cj-border bg-white px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-slate-950">{agent.name}</span>
          {agent.role ? <span className="chip">{agent.role}</span> : null}
        </div>
        <div className="mt-0.5 truncate text-sm text-cj-dim" title={agent.goalPrompt}>
          {summarize(agent.goalPrompt, 110)}
        </div>
      </div>

      <div className="flex flex-1 items-center gap-3">
        <div className="flex-1">
          <div className="flex items-baseline justify-between text-xs text-cj-dim">
            <span>
              Milestones <span className="font-medium text-slate-800">{done}/{total}</span>
              {active ? <span className="ml-2 text-cj-accent">active: {active.title}</span> : null}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-cj-panel2">
            <div
              className="h-2 rounded-full bg-cj-accent transition-all"
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

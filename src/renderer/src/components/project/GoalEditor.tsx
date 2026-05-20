import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { MilestoneRow, MilestoneStatus } from "@shared/domain.js";

import { Field, Modal } from "../agent/NewAgentWizard";

const STATUSES: MilestoneStatus[] = ["todo", "active", "done", "cancelled"];

export function GoalEditor() {
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const setOpen = useAppStore((s) => s.setGoalEditorOpen);
  const refreshAgents = useAppStore((s) => s.refreshAgents);
  const refreshMilestones = useAppStore((s) => s.refreshMilestones);

  const agent = useMemo(() => agents.find((a) => a.id === activeAgentId) ?? null, [agents, activeAgentId]);

  const [goal, setGoal] = useState(agent?.goalPrompt ?? "");
  const [role, setRole] = useState(agent?.role ?? "");
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setGoal(agent.goalPrompt);
    setRole(agent.role ?? "");
    void window.chasejoy.api.milestoneList(agent.id).then(setMilestones);
  }, [agent]);

  if (!agent) return null;

  async function saveAgent() {
    setBusy(true);
    try {
      await window.chasejoy.api.agentUpdate(agent!.id, { goalPrompt: goal.trim(), role: role.trim() || null });
      await refreshAgents();
    } finally {
      setBusy(false);
    }
  }

  async function addMilestone() {
    if (!newTitle.trim()) return;
    const m = await window.chasejoy.api.milestoneCreate({ agentId: agent!.id, title: newTitle.trim() });
    setMilestones([...milestones, m]);
    setNewTitle("");
    await refreshMilestones();
  }

  async function updateMilestone(id: string, patch: Partial<MilestoneRow>) {
    const updated = await window.chasejoy.api.milestoneUpdate(id, patch);
    setMilestones(milestones.map((m) => (m.id === id ? updated : m)));
    await refreshMilestones();
  }

  async function deleteMilestone(id: string) {
    await window.chasejoy.api.milestoneDelete(id);
    setMilestones(milestones.filter((m) => m.id !== id));
    await refreshMilestones();
  }

  return (
    <Modal title={`Edit goal — ${agent.name}`} onClose={() => setOpen(false)} widthClass="max-w-2xl">
      <div className="space-y-4">
        <Field label="Role / persona">
          <input value={role} onChange={(e) => setRole(e.target.value)} className="input" />
        </Field>

        <Field label="Project goal">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
            className="input resize-none"
          />
        </Field>

        <div className="flex justify-end">
          <button onClick={() => void saveAgent()} disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-cj-dim">
            <span>Goal steps</span>
            <span>{milestones.filter((m) => m.status === "done").length}/{milestones.length} done</span>
          </div>

          <div className="space-y-2">
            {milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg border border-cj-border bg-white px-2 py-1.5 shadow-sm">
                <select
                  value={m.status}
                  onChange={(e) => void updateMilestone(m.id, { status: e.target.value as MilestoneStatus })}
                  className="input w-28 px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  defaultValue={m.title}
                  onBlur={(e) =>
                    e.target.value !== m.title ? void updateMilestone(m.id, { title: e.target.value }) : null
                  }
                  className="input flex-1 px-2 py-1 text-sm"
                />
                <button onClick={() => void deleteMilestone(m.id)} className="rounded px-2 py-1 text-xs text-cj-err hover:bg-cj-err/10">
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New step"
              className="input flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") void addMilestone();
              }}
            />
            <button onClick={() => void addMilestone()} className="btn-primary">
              Add
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

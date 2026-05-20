import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { NewAgentInput, ProviderProfile } from "@shared/domain.js";

const DEFAULT_GOAL_PLACEHOLDER =
  "e.g. \"Help me ship the MVP of my SaaS in 30 days. You are my CTO and project manager.\"";

export function NewAgentWizard() {
  const setNewAgentOpen = useAppStore((s) => s.setNewAgentOpen);
  const profiles = useAppStore((s) => s.profiles);
  const refreshAgents = useAppStore((s) => s.refreshAgents);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [modelProfileId, setModelProfileId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  useEffect(() => {
    if (!modelProfileId && profiles.length > 0) {
      const def = profiles.find((p) => p.isDefault) ?? profiles[0]!;
      setModelProfileId(def.id);
    }
  }, [profiles, modelProfileId]);

  async function onCreate() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!goal.trim()) return setError("Goal is required (it anchors the agent).");
    if (!modelProfileId) return setError("Choose a provider profile. Add one in Settings if none exist.");

    setBusy(true);
    try {
      const input: NewAgentInput = {
        name: name.trim(),
        role: role.trim() || undefined,
        goalPrompt: goal.trim(),
        modelProfileId,
      };
      await window.chasejoy.api.agentCreate(input);
      await refreshAgents();
      setNewAgentOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New Agent" onClose={() => setNewAgentOpen(false)}>
      <div className="space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rust Learning Coach"
            className="input"
          />
        </Field>

        <Field label="Role / persona (optional)">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="patient mentor, hands-on, no fluff"
            className="input"
          />
        </Field>

        <Field label="Goal — anchors every decision">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={DEFAULT_GOAL_PLACEHOLDER}
            rows={4}
            className="input resize-none"
          />
          <div className="mt-1 text-xs text-cj-dim">
            Be specific. The agent re-reads this every turn — clarity here directly reduces drift.
          </div>
        </Field>

        <Field label="Model profile">
          {profiles.length === 0 ? (
            <button
              onClick={() => {
                setNewAgentOpen(false);
                setSettingsOpen(true);
              }}
              className="rounded border border-cj-border bg-cj-panel2 px-3 py-2 text-sm text-cj-accent hover:border-cj-accent"
            >
              No profiles yet — open Settings to add one
            </button>
          ) : (
            <select
              value={modelProfileId}
              onChange={(e) => setModelProfileId(e.target.value)}
              className="input"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatProfile(p)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {error ? <div className="text-sm text-cj-err">{error}</div> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => setNewAgentOpen(false)}
            className="rounded border border-cj-border px-3 py-1.5 text-sm hover:bg-cj-panel2"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={() => void onCreate()}
            disabled={busy || profiles.length === 0}
            className="rounded bg-cj-accent px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-cj-accent2 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatProfile(p: ProviderProfile): string {
  return `${p.label}  ·  ${p.model}${p.baseURL ? `  ·  ${p.baseURL}` : ""}`;
}

export function Modal(props: { title: string; onClose: () => void; children: React.ReactNode; widthClass?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`max-h-[88vh] w-full overflow-y-auto rounded-xl border border-cj-border bg-cj-panel shadow-panel ${props.widthClass ?? "max-w-xl"}`}>
        <div className="flex items-center justify-between border-b border-cj-border px-4 py-3">
          <div className="text-sm font-semibold">{props.title}</div>
          <button onClick={props.onClose} className="rounded px-2 py-0.5 text-cj-dim hover:bg-cj-panel2">
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{props.children}</div>
      </div>
    </div>
  );
}

export function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-wider text-cj-dim">{props.label}</div>
      {props.children}
    </label>
  );
}

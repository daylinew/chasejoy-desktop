import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { NewAgentInput } from "@shared/domain.js";

const DEFAULT_GOAL_PLACEHOLDER =
  "e.g. \"Help me ship the MVP of my SaaS in 30 days. You are my CTO and project manager.\"";

export function NewAgentWizard() {
  const setNewAgentOpen = useAppStore((s) => s.setNewAgentOpen);
  const providers = useAppStore((s) => s.providers);
  const refreshAgents = useAppStore((s) => s.refreshAgents);
  const refreshProviders = useAppStore((s) => s.refreshProviders);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [goal, setGoal] = useState("");
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  useEffect(() => {
    if (!providerId && providers.length > 0) {
      const def = providers.find((p) => p.isDefault) ?? providers[0]!;
      setProviderId(def.id);
    }
  }, [providers, providerId]);

  /* Keep `model` valid whenever the chosen provider (or its model list) changes. */
  useEffect(() => {
    const p = providers.find((x) => x.id === providerId);
    const ms = p?.models ?? [];
    setModel((cur) => (ms.includes(cur) ? cur : ms[0] ?? ""));
  }, [providerId, providers]);

  const selectedProvider = providers.find((p) => p.id === providerId) ?? null;
  const models = selectedProvider?.models ?? [];

  function openSettings() {
    setNewAgentOpen(false);
    setSettingsOpen(true);
  }

  async function onCreate() {
    setError(null);
    if (!name.trim()) return setError("名称必填。");
    if (!goal.trim()) return setError("目标必填(它是 agent 的锚点)。");
    if (!providerId) return setError("选择一个 Provider,没有就去 Settings 新增。");
    if (!model) return setError("选择一个模型。没有可选项请在 Settings 中获取模型。");

    setBusy(true);
    try {
      const input: NewAgentInput = {
        name: name.trim(),
        role: role.trim() || undefined,
        goalPrompt: goal.trim(),
        providerId,
        model,
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

        <Field label="Provider">
          {providers.length === 0 ? (
            <button
              onClick={openSettings}
              className="rounded border border-cj-border bg-cj-panel2 px-3 py-2 text-sm text-cj-accent hover:border-cj-accent"
            >
              还没有 Provider —— 打开 Settings 新增
            </button>
          ) : (
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="input"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.kind} ({p.models.length} 模型)
                </option>
              ))}
            </select>
          )}
        </Field>

        {providers.length > 0 ? (
          <Field label="Model">
            {models.length === 0 ? (
              <button
                onClick={openSettings}
                className="rounded border border-cj-border bg-cj-panel2 px-3 py-2 text-sm text-cj-accent hover:border-cj-accent"
              >
                该 Provider 还没有模型 —— 去 Settings 测试并获取
              </button>
            ) : (
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}

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
            disabled={busy || providers.length === 0}
            className="rounded bg-cj-accent px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-cj-accent2 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </Modal>
  );
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

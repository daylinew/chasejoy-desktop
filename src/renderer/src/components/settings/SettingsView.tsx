import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { AppMeta, ProviderKind, ProviderProfile } from "@shared/domain.js";

import { Field, Modal } from "../agent/NewAgentWizard";

const TEMPLATES: { label: string; kind: ProviderKind; model: string; baseURL?: string }[] = [
  { label: "OpenAI", kind: "openai", model: "gpt-4o-mini" },
  { label: "Anthropic", kind: "anthropic", model: "claude-3-5-sonnet-latest" },
  { label: "DeepSeek", kind: "openai-compat", model: "deepseek-chat", baseURL: "https://api.deepseek.com/v1" },
  {
    label: "Qwen (DashScope)",
    kind: "openai-compat",
    model: "qwen-plus",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  { label: "Moonshot Kimi", kind: "openai-compat", model: "moonshot-v1-32k", baseURL: "https://api.moonshot.cn/v1" },
];

export function SettingsView() {
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const profiles = useAppStore((s) => s.profiles);
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);

  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [tavilyKey, setTavilyKey] = useState("");
  const [editing, setEditing] = useState<EditState | null>(null);

  useEffect(() => {
    void window.chasejoy.api.settingsGet().then(setMeta);
    void refreshProfiles();
  }, [refreshProfiles]);

  async function saveMeta(patch: Partial<AppMeta>) {
    const m = await window.chasejoy.api.settingsSetMeta(patch);
    setMeta(m);
  }

  async function saveTavily() {
    await window.chasejoy.api.settingsSetTavilyKey(tavilyKey.trim() || null);
    setTavilyKey("");
  }

  async function setDefault(id: string) {
    await window.chasejoy.api.settingsSetDefaultProfile(id);
    await refreshProfiles();
  }

  async function remove(id: string) {
    await window.chasejoy.api.settingsRemoveProfile(id);
    await refreshProfiles();
  }

  return (
    <Modal title="Settings" onClose={() => setOpen(false)} widthClass="max-w-3xl">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Project anchor defaults</h3>
          {meta ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Alignment self-check every N tool calls">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={meta.alignmentSelfCheckEveryN}
                  onChange={(e) => void saveMeta({ alignmentSelfCheckEveryN: parseInt(e.target.value || "4", 10) })}
                />
              </Field>
              <Field label="Memory extractor every N messages">
                <input
                  type="number"
                  min={2}
                  className="input"
                  value={meta.memoryExtractEveryN}
                  onChange={(e) => void saveMeta({ memoryExtractEveryN: parseInt(e.target.value || "12", 10) })}
                />
              </Field>
              <Field label="Workspace root">
                <input className="input" value={meta.workspaceRoot} readOnly />
              </Field>
            </div>
          ) : (
            <div className="text-xs text-cj-dim">Loading…</div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Provider profiles</h3>
            <button
              onClick={() => setEditing({ mode: "new", profile: blankProfile() })}
              className="btn-primary"
            >
              + Add profile
            </button>
          </div>

          {profiles.length === 0 ? (
            <div className="rounded border border-dashed border-cj-border px-3 py-4 text-xs text-cj-dim">
              No profiles yet. Add one to start chatting.
            </div>
          ) : (
            <ul className="space-y-2">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded border border-cj-border bg-cj-panel2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100">
                      {p.label} <span className="ml-2 chip">{p.kind}</span>
                      {p.isDefault ? <span className="ml-2 chip text-cj-accent">default</span> : null}
                    </div>
                    <div className="truncate text-xs text-cj-dim">
                      {p.model} {p.baseURL ? ` · ${p.baseURL}` : ""}
                    </div>
                  </div>
                  {!p.isDefault ? (
                    <button onClick={() => void setDefault(p.id)} className="btn-ghost px-2 py-1 text-xs">
                      Make default
                    </button>
                  ) : null}
                  <button
                    onClick={() => setEditing({ mode: "edit", profile: { ...p, apiKey: "" } })}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(p.id)}
                    className="rounded px-2 py-1 text-xs text-cj-err hover:bg-cj-err/10"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Tavily search API key</h3>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="tvly-..."
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
              className="input flex-1"
            />
            <button onClick={() => void saveTavily()} className="btn-primary">
              Save
            </button>
          </div>
          <div className="mt-1 text-xs text-cj-dim">
            Used by the `internet_search` tool. Get one free at{" "}
            <a href="https://tavily.com" className="text-cj-accent" target="_blank" rel="noreferrer">
              tavily.com
            </a>
            .
          </div>
        </section>

        {editing ? <ProfileEditor state={editing} onClose={() => setEditing(null)} /> : null}
      </div>
    </Modal>
  );
}

type EditState = { mode: "new" | "edit"; profile: ProviderProfile };

function blankProfile(): ProviderProfile {
  return { id: "", label: "OpenAI", kind: "openai", model: "gpt-4o-mini", apiKey: "" };
}

function ProfileEditor({ state, onClose }: { state: EditState; onClose: () => void }) {
  const refreshProfiles = useAppStore((s) => s.refreshProfiles);
  const [p, setP] = useState<ProviderProfile>(state.profile);

  function applyTemplate(label: string) {
    const t = TEMPLATES.find((x) => x.label === label);
    if (!t) return;
    setP({ ...p, label: t.label, kind: t.kind, model: t.model, baseURL: t.baseURL });
  }

  async function save() {
    await window.chasejoy.api.settingsUpsertProfile({
      id: state.mode === "edit" ? p.id : undefined,
      label: p.label,
      kind: p.kind,
      model: p.model,
      baseURL: p.baseURL,
      apiKey: p.apiKey ?? undefined,
    });
    await refreshProfiles();
    onClose();
  }

  return (
    <Modal title={state.mode === "new" ? "Add profile" : `Edit ${p.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {TEMPLATES.map((t) => (
            <button key={t.label} onClick={() => applyTemplate(t.label)} className="chip hover:bg-cj-panel">
              {t.label}
            </button>
          ))}
        </div>
        <Field label="Label">
          <input value={p.label} onChange={(e) => setP({ ...p, label: e.target.value })} className="input" />
        </Field>
        <Field label="Provider kind">
          <select
            value={p.kind}
            onChange={(e) => setP({ ...p, kind: e.target.value as ProviderKind })}
            className="input"
          >
            <option value="openai">openai</option>
            <option value="openai-compat">openai-compat (DeepSeek/Qwen/Moonshot/...)</option>
            <option value="anthropic">anthropic</option>
          </select>
        </Field>
        <Field label="Model">
          <input value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })} className="input" />
        </Field>
        {p.kind !== "anthropic" ? (
          <Field label="Base URL (required for openai-compat)">
            <input
              value={p.baseURL ?? ""}
              onChange={(e) => setP({ ...p, baseURL: e.target.value || undefined })}
              className="input"
              placeholder="https://api.deepseek.com/v1"
            />
          </Field>
        ) : null}
        <Field label="API key">
          <input
            type="password"
            value={p.apiKey ?? ""}
            onChange={(e) => setP({ ...p, apiKey: e.target.value })}
            className="input"
            placeholder={state.mode === "edit" ? "Leave empty to keep existing" : "sk-..."}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={() => void save()} className="btn-primary">
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

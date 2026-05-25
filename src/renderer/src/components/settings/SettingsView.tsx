import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { AppMeta, Provider } from "@shared/domain.js";

import { Field, Modal } from "../agent/NewAgentWizard";
import { ProviderWizard } from "./ProviderWizard";

export function SettingsView() {
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const providers = useAppStore((s) => s.providers);
  const refreshProviders = useAppStore((s) => s.refreshProviders);

  const [meta, setMeta] = useState<AppMeta | null>(null);
  const [tavilyKey, setTavilyKey] = useState("");
  const [wizard, setWizard] = useState<{ editing?: Provider } | null>(null);

  useEffect(() => {
    void window.chasejoy.api.settingsGet().then(setMeta);
    void refreshProviders();
  }, [refreshProviders]);

  async function saveMeta(patch: Partial<AppMeta>) {
    const m = await window.chasejoy.api.settingsSetMeta(patch);
    setMeta(m);
  }

  async function saveTavily() {
    await window.chasejoy.api.settingsSetTavilyKey(tavilyKey.trim() || null);
    setTavilyKey("");
  }

  async function setDefault(id: string) {
    await window.chasejoy.api.settingsSetDefaultProvider(id);
    await refreshProviders();
  }

  async function remove(id: string) {
    await window.chasejoy.api.settingsRemoveProvider(id);
    await refreshProviders();
  }

  return (
    <Modal title="设置" onClose={() => setOpen(false)} widthClass="max-w-3xl">
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">工作区默认值</h3>
          {meta ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="目标校准检查间隔">
                <input
                  type="number"
                  min={1}
                  className="input"
                  value={meta.alignmentSelfCheckEveryN}
                  onChange={(e) => void saveMeta({ alignmentSelfCheckEveryN: parseInt(e.target.value || "4", 10) })}
                />
              </Field>
              <Field label="默认工作区根目录">
                <input className="input" value={meta.workspaceRoot} readOnly />
              </Field>
            </div>
          ) : (
            <div className="text-xs text-cj-dim">Loading…</div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">模型服务</h3>
            <button onClick={() => setWizard({})} className="btn-primary">
              + 新增
            </button>
          </div>

          {providers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-4 text-sm text-cj-dim">
              还没有模型服务。新增一个并选择模型后，就可以开始使用。
            </div>
          ) : (
            <ul className="space-y-2">
              {providers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border border-cj-border bg-white px-3 py-2 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">
                      {p.label}
                      <span className="ml-2 chip">{p.kind}</span>
                      {p.isDefault ? <span className="ml-2 chip text-cj-accent">默认</span> : null}
                      {p.hasApiKey ? (
                        <span className="ml-2 chip text-cj-accent">已保存 key</span>
                      ) : (
                        <span className="ml-2 chip text-cj-err">未配置 key</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-cj-dim">
                      {p.models.length} 个模型{p.baseURL ? ` · ${p.baseURL}` : ""}
                    </div>
                  </div>
                  {!p.isDefault ? (
                    <button onClick={() => void setDefault(p.id)} className="btn-ghost px-2 py-1 text-xs">
                      设为默认
                    </button>
                  ) : null}
                  <button
                    onClick={() => setWizard({ editing: p })}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => void remove(p.id)}
                    className="rounded px-2 py-1 text-xs text-cj-err hover:bg-cj-err/10"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Tavily search API key</h3>
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
            用于 `internet_search` 工具。可以在{" "}
            <a href="https://tavily.com" className="text-cj-accent" target="_blank" rel="noreferrer">
              tavily.com
            </a>
            获取。
          </div>
        </section>

        {wizard ? (
          <ProviderWizard editing={wizard.editing} onClose={() => setWizard(null)} />
        ) : null}
      </div>
    </Modal>
  );
}

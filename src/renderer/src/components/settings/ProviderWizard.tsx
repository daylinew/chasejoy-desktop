import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { Provider, ProviderKind } from "@shared/domain.js";

import { Field, Modal } from "../agent/NewAgentWizard";
import { ModelPicker } from "./ModelPicker";

export const PROVIDER_TEMPLATES: { label: string; kind: ProviderKind; baseURL?: string }[] = [
  { label: "OpenAI", kind: "openai" },
  { label: "Anthropic", kind: "anthropic" },
  { label: "DeepSeek", kind: "openai-compat", baseURL: "https://api.deepseek.com/v1" },
  {
    label: "Qwen (DashScope)",
    kind: "openai-compat",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  { label: "Moonshot Kimi", kind: "openai-compat", baseURL: "https://api.moonshot.cn/v1" },
];

interface Draft {
  id?: string;
  label: string;
  kind: ProviderKind;
  baseURL: string;
  apiKey: string;
  models: string[];
}

/**
 * Two-step provider setup. New mode: step 1 picks a template, step 2 fills
 * credentials + fetches models. Edit mode jumps straight to step 2.
 */
export function ProviderWizard(props: { editing?: Provider; onClose: () => void }) {
  const refreshProviders = useAppStore((s) => s.refreshProviders);
  const isEdit = !!props.editing;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [draft, setDraft] = useState<Draft>(
    props.editing
      ? {
          id: props.editing.id,
          label: props.editing.label,
          kind: props.editing.kind,
          baseURL: props.editing.baseURL ?? "",
          apiKey: "",
          models: props.editing.models,
        }
      : { label: "", kind: "openai", baseURL: "", apiKey: "", models: [] },
  );

  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function pickTemplate(t: (typeof PROVIDER_TEMPLATES)[number] | "custom") {
    if (t === "custom") {
      setDraft({ ...draft, label: "", kind: "openai-compat", baseURL: "" });
    } else {
      setDraft({ ...draft, label: t.label, kind: t.kind, baseURL: t.baseURL ?? "" });
    }
    setStep(2);
  }

  const canTest = !testing && (draft.apiKey.trim().length > 0 || (isEdit && !!props.editing?.hasApiKey));

  async function testAndFetch() {
    setTesting(true);
    setError(null);
    setTested(false);
    try {
      const models = await window.chasejoy.api.settingsFetchModels({
        kind: draft.kind,
        baseURL: draft.baseURL.trim() || undefined,
        apiKey: draft.apiKey.trim() || undefined,
        providerId: draft.id,
      });
      setCandidates(models);
      setTested(true);
      setPickerOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (draft.kind === "openai-compat" && !draft.baseURL.trim()) {
      setError("OpenAI 兼容 provider 必须填写 Base URL。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await window.chasejoy.api.settingsUpsertProvider({
        id: draft.id,
        label: draft.label.trim() || draft.kind,
        kind: draft.kind,
        baseURL: draft.kind === "anthropic" ? undefined : draft.baseURL.trim() || undefined,
        apiKey: draft.apiKey.trim() || undefined,
        models: draft.models,
      });
      await refreshProviders();
      props.onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  if (step === 1) {
    return (
      <Modal title="新增 Provider · 选择类型" onClose={props.onClose}>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => pickTemplate(t)}
              className="rounded-lg border border-cj-border bg-white px-3 py-3 text-left shadow-sm hover:border-cj-accent"
            >
              <div className="text-sm font-medium text-slate-900">{t.label}</div>
              <div className="text-xs text-cj-dim">{t.kind}</div>
            </button>
          ))}
          <button
            onClick={() => pickTemplate("custom")}
            className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-3 text-left hover:border-cj-accent"
          >
            <div className="text-sm font-medium text-cj-accent">自定义</div>
            <div className="text-xs text-cj-dim">OpenAI 兼容端点</div>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal title={isEdit ? `编辑 ${props.editing!.label}` : "新增 Provider · 配置"} onClose={props.onClose}>
        <div className="space-y-3">
          <Field label="名称">
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="input"
              placeholder="DeepSeek"
            />
          </Field>

          <Field label="Provider 类型">
            <select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProviderKind })}
              className="input"
            >
              <option value="openai">openai</option>
              <option value="openai-compat">openai-compat (DeepSeek/Qwen/Moonshot/...)</option>
              <option value="anthropic">anthropic</option>
            </select>
          </Field>

          {draft.kind !== "anthropic" ? (
            <Field label={draft.kind === "openai-compat" ? "Base URL(必填)" : "Base URL(可选)"}>
              <input
                value={draft.baseURL}
                onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                className="input"
                placeholder="https://api.deepseek.com/v1"
              />
            </Field>
          ) : null}

          <Field label="API Key">
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => {
                setDraft({ ...draft, apiKey: e.target.value });
                setTested(false);
              }}
              className="input"
              placeholder={isEdit && props.editing?.hasApiKey ? "留空保留现有密钥" : "sk-..."}
            />
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void testAndFetch()}
              disabled={!canTest}
              className="btn-primary disabled:opacity-50"
            >
              {testing ? "测试中…" : "测试并获取模型"}
            </button>
            {tested ? (
              <span className="text-xs text-cj-accent">连接正常 · 获取到 {candidates.length} 个模型</span>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wider text-cj-dim">
              已选模型 ({draft.models.length})
            </div>
            {draft.models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-3 text-sm text-cj-dim">
                还没有模型。点上方「测试并获取模型」拉取并勾选。
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {draft.models.map((m) => (
                  <span key={m} className="chip flex items-center gap-1">
                    {m}
                    <button
                      onClick={() => setDraft({ ...draft, models: draft.models.filter((x) => x !== m) })}
                      className="text-cj-err hover:text-cj-err"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            {candidates.length > 0 ? (
              <button
                onClick={() => setPickerOpen(true)}
                className="btn-ghost mt-2 px-2 py-1 text-xs"
              >
                重新选择模型
              </button>
            ) : null}
          </div>

          {error ? <div className="text-sm text-cj-err">{error}</div> : null}

          <div className="flex justify-between gap-2 pt-1">
            {!isEdit ? (
              <button onClick={() => setStep(1)} className="btn-ghost">
                上一步
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button onClick={props.onClose} className="btn-ghost">
                取消
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {pickerOpen ? (
        <ModelPicker
          candidates={candidates}
          initialSelected={draft.models}
          onConfirm={(models) => {
            setDraft({ ...draft, models });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </>
  );
}

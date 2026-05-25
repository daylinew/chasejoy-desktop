import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { Provider, ProviderKind } from "@shared/domain.js";

import { Field, Modal } from "../agent/NewAgentWizard";
import { ModelPicker } from "./ModelPicker";

export const PROVIDER_TEMPLATES: { label: string; kind: ProviderKind; baseURL?: string }[] = [
  { label: "OpenAI", kind: "openai" },
  { label: "Anthropic", kind: "anthropic" },
  { label: "DeepSeek", kind: "deepseek", baseURL: "https://api.deepseek.com" },
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
 * Two-step model service setup. New mode: step 1 picks a Chatbox-like service
 * template, step 2 fills credentials + selects exposed models.
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
  const [manualModel, setManualModel] = useState("");

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
    if ((draft.kind === "openai-compat" || draft.kind === "anthropic-compat") && !draft.baseURL.trim()) {
      setError("兼容服务必须填写 Base URL。");
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

  function addManualModel() {
    const model = manualModel.trim();
    if (!model) return;
    if (!draft.models.includes(model)) {
      setDraft({ ...draft, models: [...draft.models, model] });
    }
    setManualModel("");
  }

  if (step === 1) {
    return (
      <Modal title="新增模型服务" onClose={props.onClose}>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => pickTemplate(t)}
              className="rounded-lg border border-cj-border bg-white px-3 py-3 text-left shadow-sm hover:border-cj-accent"
            >
              <div className="text-sm font-medium text-slate-900">{t.label}</div>
              <div className="text-xs text-cj-dim">{providerKindLabel(t.kind)}</div>
            </button>
          ))}
          <button
            onClick={() => pickTemplate("custom")}
            className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-3 text-left hover:border-cj-accent"
          >
            <div className="text-sm font-medium text-cj-accent">自定义</div>
            <div className="text-xs text-cj-dim">自定义 OpenAI 兼容端点</div>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal title={isEdit ? `编辑 ${props.editing!.label}` : "配置模型服务"} onClose={props.onClose}>
        <div className="space-y-3">
          <Field label="名称">
            <input
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="input"
              placeholder="DeepSeek"
            />
          </Field>

          <Field label="服务类型">
            <select
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as ProviderKind;
                setDraft({ ...draft, kind });
              }}
              className="input"
            >
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compat">OpenAI 兼容</option>
              <option value="anthropic-compat">Anthropic 兼容</option>
            </select>
          </Field>

          {draft.kind !== "anthropic" ? (
            <Field label={draft.kind === "openai" || draft.kind === "deepseek" ? "Base URL（可选）" : "Base URL（必填）"}>
              <input
                value={draft.baseURL}
                onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                className="input"
                placeholder={draft.kind === "deepseek" ? "https://api.deepseek.com" : "https://api.example.com"}
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
            <div className="mb-2 flex gap-2">
              <input
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualModel();
                  }
                }}
                className="input"
                placeholder="手动添加模型 ID，如 deepseek-v4-pro"
              />
              <button onClick={addManualModel} className="btn-ghost shrink-0">
                添加
              </button>
            </div>
            {draft.models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cj-border bg-cj-panel2 px-3 py-3 text-sm text-cj-dim">
                还没有模型。可以测试后勾选，也可以像 Chatbox 一样手动添加模型 ID。
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

function providerKindLabel(kind: ProviderKind): string {
  switch (kind) {
    case "openai":
      return "OpenAI";
    case "deepseek":
      return "DeepSeek";
    case "anthropic":
      return "Anthropic";
    case "openai-compat":
      return "OpenAI 兼容";
    case "anthropic-compat":
      return "Anthropic 兼容";
    default: {
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}

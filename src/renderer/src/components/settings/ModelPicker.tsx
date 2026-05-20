import { useState } from "react";

import { Modal } from "../agent/NewAgentWizard";

/**
 * Multi-select popup over the model ids returned by `settingsFetchModels`.
 * Used by ProviderWizard to let the user pick which models a provider exposes.
 */
export function ModelPicker(props: {
  candidates: string[];
  initialSelected: string[];
  onConfirm: (models: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(props.initialSelected));
  const [filter, setFilter] = useState("");

  const visible = props.candidates.filter((m) =>
    m.toLowerCase().includes(filter.toLowerCase()),
  );

  function toggle(m: string) {
    const next = new Set(selected);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setSelected(next);
  }

  return (
    <Modal
      title={`选择模型 · 已选 ${selected.size} / ${props.candidates.length}`}
      onClose={props.onClose}
    >
      <div className="space-y-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="筛选模型…"
          className="input"
        />
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-1 py-2 text-xs text-cj-dim">无匹配模型。</li>
          ) : (
            visible.map((m) => (
              <li key={m}>
                <label className="flex cursor-pointer items-center gap-2 rounded border border-cj-border bg-cj-panel2 px-2 py-1.5 text-sm hover:border-cj-accent">
                  <input type="checkbox" checked={selected.has(m)} onChange={() => toggle(m)} />
                  <span className="truncate">{m}</span>
                </label>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={props.onClose} className="btn-ghost">
            取消
          </button>
          <button onClick={() => props.onConfirm([...selected])} className="btn-primary">
            确认 ({selected.size})
          </button>
        </div>
      </div>
    </Modal>
  );
}

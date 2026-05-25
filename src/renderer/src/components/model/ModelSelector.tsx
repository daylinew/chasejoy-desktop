import { useEffect, useRef, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { AgentRow, Provider } from "@shared/domain.js";

export function ModelSelector() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const providers = useAppStore((s) => s.providers);
  const refreshAgents = useAppStore((s) => s.refreshAgents);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(() => readModelFavorites());

  const agent = agents.find((a) => a.id === activeAgentId) ?? null;
  const provider = providers.find((p) => p.id === agent?.providerId) ?? null;
  const currentLabel = agent?.model || provider?.models[0] || "选择模型";
  const filteredProviders = providers
    .map((p) => ({
      ...p,
      models: p.models.filter((model) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return `${p.label} ${model}`.toLowerCase().includes(q);
      }),
    }))
    .filter((p) => p.models.length > 0 || !query.trim());

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function updateAgent(patch: Partial<AgentRow>) {
    if (!agent) return;
    setSaving(true);
    try {
      await window.chasejoy.api.agentUpdate(agent.id, patch);
      await refreshAgents();
    } finally {
      setSaving(false);
    }
  }

  async function selectModel(providerId: string, model: string) {
    if (!model) return;
    await updateAgent({ providerId, model });
    setOpen(false);
  }

  function toggleProvider(providerId: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  function toggleFavorite(providerId: string, model: string) {
    const key = modelKey(providerId, model);
    setFavorites((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeModelFavorites(next);
      return next;
    });
  }

  if (!agent || providers.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
      >
        添加模型
      </button>
    );
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-60"
        title="Select model"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold text-white">
          {providerInitial(provider?.label ?? "M")}
        </span>
        <span className="min-w-0 truncate text-slate-700">{truncate(currentLabel, 24)}</span>
        <span className="text-zinc-400">⌄</span>
      </button>

      {open ? (
        <div className="absolute bottom-9 left-0 z-40 w-[350px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          <div className="border-b border-zinc-100 p-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2">
              <span className="text-zinc-400">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索模型"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-zinc-400 focus:outline-none"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="text-xs text-zinc-400 hover:text-slate-700">
                  clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-h-[430px] overflow-y-auto py-1">
            {filteredProviders.map((p) => {
              const isCollapsed = collapsed.has(p.id);
              return (
                <div key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggleProvider(p.id)}
                    className="flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50"
                  >
                    <span className="w-4 text-zinc-500">{isCollapsed ? "›" : "⌄"}</span>
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-zinc-100 text-[10px] font-semibold text-zinc-600">
                      {providerInitial(p.label)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className="text-xs text-zinc-400">{p.models.length}</span>
                  </button>

                  {!isCollapsed
                    ? p.models.map((model) => {
                        const selected = p.id === agent.providerId && model === agent.model;
                        const favorite = favorites.has(modelKey(p.id, model));
                        return (
                          <div
                            key={`${p.id}:${model}`}
                            className={`group flex items-center gap-2 px-3 py-2 text-sm ${
                              selected ? "bg-blue-50 text-slate-950" : "text-slate-700 hover:bg-zinc-50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => void selectModel(p.id, model)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white" style={{ background: providerColor(p.kind) }}>
                                {providerInitial(p.label)}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{model}</span>
                              <ModelBadges model={model} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(p.id, model)}
                              className={`shrink-0 rounded px-1 text-base ${
                                favorite ? "text-amber-400" : "text-zinc-300 opacity-0 group-hover:opacity-100"
                              } hover:text-amber-400`}
                              title={favorite ? "Remove favorite" : "Favorite"}
                            >
                              ☆
                            </button>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
            {filteredProviders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-400">没有匹配模型</div>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            <button type="button" onClick={() => setSettingsOpen(true)} className="hover:text-slate-900">
              管理模型服务
            </button>
            <span>{saving ? "保存中..." : "选择后立即生效"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelBadges({ model }: { model: string }) {
  const lower = model.toLowerCase();
  const badges = [
    lower.includes("reason") || lower.includes("think") || lower.includes("r1") ? "reason" : null,
    lower.includes("flash") || lower.includes("turbo") || lower.includes("chat") ? "fast" : null,
    lower.includes("vision") || lower.includes("vl") ? "vision" : null,
  ].filter(Boolean) as string[];

  if (badges.length === 0) return null;

  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex">
      {badges.slice(0, 2).map((badge) => (
        <span key={badge} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
          {badge}
        </span>
      ))}
    </span>
  );
}

function providerInitial(label: string): string {
  return (label.trim()[0] || "M").toUpperCase();
}

function providerColor(kind: Provider["kind"]): string {
  switch (kind) {
    case "deepseek":
      return "#4f46e5";
    case "anthropic":
      return "#6d5f4b";
    case "anthropic-compat":
      return "#0f766e";
    case "openai":
      return "#111827";
    case "openai-compat":
    default:
      return "#2563eb";
  }
}

function modelKey(providerId: string, model: string): string {
  return `${providerId}:${model}`;
}

function readModelFavorites(): Set<string> {
  try {
    const raw = window.localStorage.getItem("chasejoy.modelFavorites");
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeModelFavorites(values: Set<string>): void {
  try {
    window.localStorage.setItem("chasejoy.modelFavorites", JSON.stringify([...values]));
  } catch {
    // Favorites are a UI convenience only.
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

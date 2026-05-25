import { useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { ThreadRow } from "@shared/domain.js";
import { Modal } from "./NewAgentWizard";

export function AgentSidebar() {
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const threads = useAppStore((s) => s.threads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const selectThread = useAppStore((s) => s.selectThread);
  const createThread = useAppStore((s) => s.createThread);
  const deleteThread = useAppStore((s) => s.deleteThread);
  const setNewAgentOpen = useAppStore((s) => s.setNewAgentOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const [threadToDelete, setThreadToDelete] = useState<ThreadRow | null>(null);
  const [deletingThread, setDeletingThread] = useState(false);

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? null;

  async function confirmDeleteThread() {
    if (!threadToDelete) return;
    setDeletingThread(true);
    try {
      await deleteThread(threadToDelete.id);
      setThreadToDelete(null);
    } finally {
      setDeletingThread(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-3 py-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-xs font-semibold text-slate-900 shadow-sm">
              C
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-800">ChaseJoy</div>
              <div className="text-xs text-zinc-400">Desktop Agent</div>
            </div>
          </div>
        </div>

        <select
          value={activeAgentId ?? ""}
          onChange={(e) => void selectAgent(e.target.value || null)}
          className="mt-3 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm text-slate-700 shadow-sm focus:border-zinc-400 focus:outline-none"
        >
          {agents.length === 0 ? <option value="">No agent</option> : null}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1 px-2 py-3 text-sm text-zinc-600">
        <SidebarAction label="新任务" shortcut="+" onClick={() => void createThread()} />
        <SidebarAction label="技能" shortcut="/" />
        <SidebarAction label="定时任务" shortcut="⏱" />
      </div>

      <div className="mx-2 grid grid-cols-1 rounded-lg bg-zinc-200/70 p-1 text-xs text-zinc-600">
        <button className="rounded-md bg-white py-1.5 shadow-sm">任务</button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
        {!activeAgent ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 px-3 py-5 text-center text-sm text-zinc-500">
            创建一个 agent 开始。
          </div>
        ) : threads.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs leading-5 text-zinc-400">
            还没有任何任务，点击上方按钮开始新任务。
          </div>
        ) : (
          <div className="space-y-0.5">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              return (
                <div
                  key={thread.id}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-2 ${
                    active ? "bg-white text-slate-900 shadow-sm" : "text-zinc-700 hover:bg-white/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void selectThread(thread.id)}
                    className="min-w-0 flex-1 text-left"
                    title={thread.title || "Untitled"}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full border border-zinc-400" />
                      <span className="truncate text-sm">{thread.title || "Untitled"}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThreadToDelete(thread)}
                    className="rounded px-1.5 py-0.5 text-zinc-300 opacity-0 hover:bg-red-50 hover:text-cj-err group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 px-3 py-3">
        <button
          type="button"
          onClick={() => setNewAgentOpen(true)}
          className="mb-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-50 text-sm font-medium text-blue-600 hover:bg-blue-100"
        >
          + 新建 Agent
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-sm text-zinc-600 hover:bg-white"
        >
          <span className="w-5 text-center">⚙</span>
          设置
        </button>
      </div>

      {threadToDelete ? (
        <Modal title="Delete Conversation" onClose={() => setThreadToDelete(null)} widthClass="max-w-md">
          <div className="space-y-4">
            <div className="text-sm text-slate-700">
              Delete <span className="font-medium text-slate-950">{threadToDelete.title || "Untitled"}</span>?
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setThreadToDelete(null)}
                disabled={deletingThread}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteThread()}
                disabled={deletingThread}
                className="rounded-md bg-cj-err px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deletingThread ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SidebarAction(props: { label: string; shortcut: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-white"
    >
      <span className="w-5 text-center text-zinc-500">{props.shortcut}</span>
      <span>{props.label}</span>
    </button>
  );
}

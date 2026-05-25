import { useEffect, useMemo, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";
import type { RunContextAttachment } from "@shared/domain";
import { ModelSelector } from "../model/ModelSelector";

export function Composer({ disabled }: { disabled?: boolean }) {
  const [text, setText] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [attachments, setAttachments] = useState<RunContextAttachment[]>([]);
  const busy = useAppStore((s) => s.composerBusy);
  const agents = useAppStore((s) => s.agents);
  const activeAgentId = useAppStore((s) => s.activeAgentId);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const cancelStream = useAppStore((s) => s.cancelStream);
  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [agents, activeAgentId],
  );

  useEffect(() => {
    setWorkspaceDir(activeAgent?.workspaceDir ?? "");
    setAttachments([]);
  }, [activeAgent?.id, activeAgent?.workspaceDir]);

  async function submit() {
    if (busy || !text.trim()) return;
    const next = text;
    const context = {
      workspaceDir: workspaceDir.trim() || activeAgent?.workspaceDir,
      attachments,
    };
    setText("");
    await sendMessage(next, context);
  }

  async function chooseWorkspace() {
    const selected = await window.chasejoy.api.dialogPickDirectory();
    if (selected) setWorkspaceDir(selected);
  }

  async function attachFiles() {
    const selected = await window.chasejoy.api.dialogPickFiles();
    if (selected.length === 0) return;
    const currentWorkspace = workspaceDir || activeAgent?.workspaceDir || dirname(selected[0]!);
    const nextWorkspace = selected.every((filePath) => isInside(filePath, currentWorkspace))
      ? currentWorkspace
      : dirname(selected[0]!);
    setWorkspaceDir(nextWorkspace);
    setAttachments((current) => {
      const seen = new Set(current.map((item) => item.path));
      const additions = selected
        .filter((path) => !seen.has(path))
        .map((path) => ({ kind: "file" as const, path, name: basename(path) }));
      return [...current, ...additions].slice(0, 12);
    });
  }

  function removeAttachment(path: string) {
    setAttachments((current) => current.filter((item) => item.path !== path));
  }

  return (
    <div
      className={`mx-auto w-full rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.08)] transition-all ${
        busy ? "max-w-[620px]" : "max-w-[780px]"
      }`}
    >
      {!busy && (workspaceDir || attachments.length > 0) ? (
        <div className="mx-3 mt-3 flex flex-wrap items-center gap-2 text-xs">
          {workspaceDir ? (
            <button
              type="button"
              onClick={() => void chooseWorkspace()}
              className="max-w-full truncate rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-600 hover:bg-white hover:text-slate-900"
              title={workspaceDir}
            >
              工作目录 · {shortPath(workspaceDir)}
            </button>
          ) : null}
          {attachments.map((item) => (
            <span
              key={item.path}
              className="flex max-w-[220px] items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700"
              title={item.path}
            >
              <span className="min-w-0 truncate">{item.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(item.path)}
                className="text-blue-400 hover:text-blue-700"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={disabled ? "Select an agent first..." : "Ask ChaseJoy to do something..."}
        rows={busy ? 1 : 3}
        disabled={disabled}
        className={`w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 text-[15px] text-slate-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 ${
          busy ? "min-h-[44px] py-3" : "min-h-[86px] py-4"
        }`}
      />

      <div className="flex h-12 items-center justify-between border-t border-zinc-100 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void attachFiles()}
            disabled={disabled || busy}
            className="flex h-8 w-8 items-center justify-center rounded-md text-xl text-zinc-400 hover:bg-zinc-50 hover:text-slate-800 disabled:opacity-40"
            title="Attach files"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => void chooseWorkspace()}
            disabled={disabled || busy}
            className="max-w-[170px] truncate rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 hover:text-slate-800 disabled:opacity-40"
            title={workspaceDir || "Choose work directory"}
          >
            {workspaceDir ? shortPath(workspaceDir) : "选择工作目录"}
          </button>
          <ModelSelector />
          <span className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50">默认权限</span>
        </div>

        {busy ? (
          <button
            type="button"
            onClick={() => void cancelStream()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-white hover:bg-slate-800"
            title="Stop"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || disabled}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-base text-white hover:bg-slate-800 disabled:bg-zinc-300"
            title="Send"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  return path.slice(0, index);
}

function isInside(filePath: string, root: string): boolean {
  const file = filePath.replace(/\\/g, "/").toLowerCase();
  const base = root.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return file === base || file.startsWith(`${base}/`);
}

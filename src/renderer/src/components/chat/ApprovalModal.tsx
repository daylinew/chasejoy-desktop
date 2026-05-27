import { useMemo, useState } from "react";

import { useAppStore } from "@renderer/stores/appStore";

export function ApprovalModal() {
  const req = useAppStore((s) => s.pendingApproval);
  const respond = useAppStore((s) => s.respondApproval);
  const setApproval = useAppStore((s) => s.setApproval);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detail = useMemo(() => buildApprovalDetail(req?.tool, req?.argsJson), [req?.tool, req?.argsJson]);

  if (!req) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/10 p-3 sm:p-5">
      <section className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] ring-1 ring-white">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-sm font-semibold text-slate-700 ring-1 ring-zinc-200">
              {toolIcon(req.tool)}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-slate-950">需要确认</div>
              <div className="mt-1 text-sm text-zinc-500">确认后 Agent 才会继续执行。</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setApproval(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-slate-900"
            title="Close"
          >
            ×
          </button>
        </header>

        <div className="max-h-[min(66vh,560px)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-500">{friendlyTool(req.tool)}</div>
                <div className="mt-1 truncate text-[15px] font-medium text-slate-950" title={detail.title}>
                  {detail.title}
                </div>
              </div>
              <span className={riskClass(req.tool)}>{riskLabel(req.tool)}</span>
            </div>

            {detail.rows.length > 0 ? (
              <div className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                {detail.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[86px_1fr] gap-3 px-3 py-2 text-sm">
                    <div className="text-zinc-400">{row.label}</div>
                    <div className="min-w-0 truncate text-slate-700" title={row.value}>{row.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-lg px-1 text-sm text-zinc-500 hover:text-slate-900"
          >
            <span>{detailsOpen ? "隐藏技术详情" : "查看技术详情"}</span>
            <span className="text-lg leading-none">{detailsOpen ? "⌃" : "⌄"}</span>
          </button>

          {detailsOpen ? (
            <pre className="max-h-56 overflow-auto rounded-xl border border-zinc-200 bg-slate-950 p-4 text-[12px] leading-5 text-slate-100">
{formatJson(req.argsJson)}
            </pre>
          ) : null}
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-zinc-100 bg-white px-5 py-4 sm:flex sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => void respond("deny")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-slate-950"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => void respond("allow_once")}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-zinc-50"
          >
            允许一次
          </button>
          <button
            type="button"
            onClick={() => void respond("allow_session")}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-zinc-50"
          >
            本次会话允许
          </button>
          <button
            type="button"
            onClick={() => void respond("allow_agent")}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            始终允许
          </button>
        </footer>
      </section>
    </div>
  );
}

function toolIcon(tool: string): string {
  if (tool === "execute") return ">";
  if (tool === "write_file") return "+";
  if (tool === "edit_file") return "✎";
  return "!";
}

function friendlyTool(tool: string): string {
  if (tool === "execute") return "运行命令";
  if (tool === "write_file") return "创建文件";
  if (tool === "edit_file") return "编辑文件";
  return tool;
}

function riskLabel(tool: string): string {
  if (tool === "execute") return "命令";
  if (tool === "write_file") return "写入";
  if (tool === "edit_file") return "编辑";
  return "操作";
}

function riskClass(tool: string): string {
  const base = "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium";
  if (tool === "execute") return `${base} bg-amber-50 text-amber-700`;
  if (tool === "write_file") return `${base} bg-blue-50 text-blue-700`;
  return `${base} bg-zinc-100 text-zinc-600`;
}

function buildApprovalDetail(tool: string | undefined, argsJson: string | undefined): {
  title: string;
  rows: { label: string; value: string }[];
} {
  const args = parseArgs(argsJson);
  if (tool === "execute") {
    return {
      title: String(args.command ?? "Run command"),
      rows: [
        { label: "命令", value: String(args.command ?? "") },
        args.cwd ? { label: "目录", value: String(args.cwd) } : null,
      ].filter(Boolean) as { label: string; value: string }[],
    };
  }

  if (tool === "write_file") {
    const file = String(args.file_path ?? args.path ?? "New file");
    return {
      title: file,
      rows: [
        { label: "文件", value: file },
        { label: "内容", value: describeContent(args.content) },
      ],
    };
  }

  if (tool === "edit_file") {
    const file = String(args.file_path ?? args.path ?? "File");
    return {
      title: file,
      rows: [
        { label: "文件", value: file },
        { label: "替换", value: summarizeText(String(args.old_string ?? "")) },
        { label: "改为", value: summarizeText(String(args.new_string ?? "")) },
      ],
    };
  }

  return {
    title: "Agent action",
    rows: [],
  };
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function describeContent(content: unknown): string {
  const text = typeof content === "string" ? content : "";
  if (!text) return "Empty content";
  const lineCount = text.split(/\r?\n/).length;
  return `${lineCount} lines, ${text.length} chars`;
}

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized.length > 100 ? `${normalized.slice(0, 100)}...` : normalized;
}

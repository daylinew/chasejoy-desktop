import { createMiddleware } from "langchain";
import type { BaseMessage } from "@langchain/core/messages";
import path from "node:path";

import type { AgentRow, AgentRunContext } from "@shared/domain.js";
import { MilestoneRepository } from "../../db/repositories/milestones.js";

/**
 * Build a middleware bound to a specific agent that:
 *  - On every model call, prepends a fresh "anchor" block to the system prompt:
 *      • the agent's project goal (verbatim)
 *      • the agent's active milestones
 *
 * This keeps the agent grounded turn-after-turn (anti-drift static injection).
 * DeepAgents' native memory middleware injects /memories/AGENTS.md separately.
 */
export function createAlignmentMiddleware(opts: {
  agent: AgentRow;
  milestoneRepo?: MilestoneRepository;
}) {
  const { agent } = opts;
  const milestoneRepo = opts.milestoneRepo ?? new MilestoneRepository();

  return createMiddleware({
    name: "AlignmentMiddleware",
    wrapModelCall: async (request: any, handler: any) => {
      try {
        const latestUserText = extractLatestUserText(request.messages);
        const milestones = milestoneRepo.listByAgent(agent.id);
        const active = milestones.filter((m) => m.status === "active" || m.status === "todo");
        const done = milestones.filter((m) => m.status === "done");
        void latestUserText;
        const runContext = normalizeRunContext(request.runtime?.context);

        const anchor = renderAnchor({
          agentName: agent.name,
          role: agent.role,
          goalPrompt: agent.goalPrompt,
          workspaceDir: agent.workspaceDir,
          runContext,
          activeMilestones: active.map((m) => `- [${m.status}] ${m.title}${m.description ? ` — ${m.description}` : ""}`),
          doneMilestones: done.map((m) => `- [done] ${m.title}`),
        });

        const baseSystem = typeof request.systemPrompt === "string" ? request.systemPrompt : "";
        const augmented = `${anchor}\n\n${baseSystem}`.trim();

        return handler({ ...request, systemPrompt: augmented });
      } catch (err) {
        console.warn("[AlignmentMiddleware] anchor injection failed:", err);
        return handler(request);
      }
    },
  });
}

function extractLatestUserText(messages: BaseMessage[] | undefined): string {
  if (!messages || messages.length === 0) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const typeName = (m as { _getType?: () => string })._getType?.() ?? m.constructor.name;
    if (typeName === "human" || typeName === "HumanMessage") {
      const content = m.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
          .join(" ");
      }
    }
  }
  return "";
}

function renderAnchor(args: {
  agentName: string;
  role: string | null;
  goalPrompt: string;
  workspaceDir: string;
  runContext: AgentRunContext | null;
  activeMilestones: string[];
  doneMilestones: string[];
}): string {
  const milestonesBlock = args.activeMilestones.length === 0 && args.doneMilestones.length === 0
    ? "_(no milestones defined yet — consider adding them via the `add_milestone` tool)_"
    : [...args.activeMilestones, ...args.doneMilestones.slice(0, 3)].join("\n");

  return [
    "# Project anchor (must shape every decision below)",
    "",
    `**Agent:** ${args.agentName}${args.role ? `  ·  *${args.role}*` : ""}`,
    "",
    "## Your project goal",
    args.goalPrompt,
    "",
    "## Workspace",
    `Work inside this workspace unless the user explicitly changes it: ${args.workspaceDir}`,
    "Use relative paths from this workspace when reading, writing, editing, searching, or executing commands.",
    renderRunContext(args.runContext, args.workspaceDir),
    "",
    "## Milestones",
    milestonesBlock,
    "",
    "## Rules",
    "1. Every action must serve the project goal above. If a request seems off-goal, ask the user before pursuing it.",
    "2. Update milestone status with `update_milestone` whenever you complete a checkpoint.",
    "3. Maintain durable facts/preferences/decisions/artifacts in `/memories/AGENTS.md` with `read_file` and `edit_file`. Be selective — only what helps future you.",
    "4. Prefer concise, direct answers; expand only when the user asks or the task warrants it.",
  ].join("\n");
}

function normalizeRunContext(value: unknown): AgentRunContext | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as AgentRunContext;
  const workspaceDir = typeof raw.workspaceDir === "string" && raw.workspaceDir.trim()
    ? raw.workspaceDir.trim()
    : undefined;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
        .filter((a) => a && typeof a.path === "string" && typeof a.name === "string")
        .slice(0, 12)
        .map((a) => ({
          kind: a.kind === "folder" ? "folder" as const : "file" as const,
          path: a.path,
          name: a.name,
        }))
    : [];
  if (!workspaceDir && attachments.length === 0) return null;
  return { workspaceDir, attachments };
}

function renderRunContext(context: AgentRunContext | null, fallbackWorkspaceDir: string): string {
  if (!context) return "";
  const workspaceDir = context.workspaceDir || fallbackWorkspaceDir;
  const attachments = context.attachments ?? [];
  const lines = [
    "",
    "## Current run context",
    `Selected work directory: ${workspaceDir}`,
  ];

  if (attachments.length > 0) {
    lines.push("Attached files selected by the user:");
    for (const file of attachments) {
      const virtualPath = virtualPathFor(file.path, workspaceDir);
      lines.push(`- ${file.name}: ${virtualPath ? `read as \`${virtualPath}\`` : file.path}`);
    }
    lines.push("Use attached files as task context when relevant. Read them before editing if the request depends on their contents.");
  }

  return lines.join("\n");
}

function virtualPathFor(filePath: string, workspaceDir: string): string | null {
  const relative = path.relative(workspaceDir, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return `/${relative.replace(/\\/g, "/")}`;
}

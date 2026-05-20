import { createMiddleware } from "langchain";
import type { BaseMessage } from "@langchain/core/messages";

import type { AgentRow } from "@shared/domain.js";
import type { MemoryService } from "../memory/memory-service.js";
import { MilestoneRepository } from "../../db/repositories/milestones.js";

/**
 * Build a middleware bound to a specific agent that:
 *  - On every model call, prepends a fresh "anchor" block to the system prompt:
 *      • the agent's project goal (verbatim)
 *      • the agent's active milestones
 *      • the agent's Top-K pinned/relevant memories
 *
 * This keeps the agent grounded turn-after-turn (anti-drift static injection).
 */
export function createAlignmentMiddleware(opts: {
  agent: AgentRow;
  memoryService: MemoryService;
  milestoneRepo?: MilestoneRepository;
}) {
  const { agent, memoryService } = opts;
  const milestoneRepo = opts.milestoneRepo ?? new MilestoneRepository();

  return createMiddleware({
    name: "AlignmentMiddleware",
    wrapModelCall: async (request: any, handler: any) => {
      try {
        const latestUserText = extractLatestUserText(request.messages);
        const milestones = milestoneRepo.listByAgent(agent.id);
        const active = milestones.filter((m) => m.status === "active" || m.status === "todo");
        const done = milestones.filter((m) => m.status === "done");
        const memories = memoryService.topK(agent.id, latestUserText, 8);

        const anchor = renderAnchor({
          agentName: agent.name,
          role: agent.role,
          goalPrompt: agent.goalPrompt,
          activeMilestones: active.map((m) => `- [${m.status}] ${m.title}${m.description ? ` — ${m.description}` : ""}`),
          doneMilestones: done.map((m) => `- [done] ${m.title}`),
          memories: memories.map(
            (m) => `- (${m.kind}${m.pinned ? "+pinned" : ""}) ${m.content}`,
          ),
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
  activeMilestones: string[];
  doneMilestones: string[];
  memories: string[];
}): string {
  const milestonesBlock = args.activeMilestones.length === 0 && args.doneMilestones.length === 0
    ? "_(no milestones defined yet — consider adding them via the `add_milestone` tool)_"
    : [...args.activeMilestones, ...args.doneMilestones.slice(0, 3)].join("\n");

  const memoriesBlock = args.memories.length === 0
    ? "_(no long-term memory yet — use `save_memory` for facts worth remembering)_"
    : args.memories.join("\n");

  return [
    "# Project anchor (must shape every decision below)",
    "",
    `**Agent:** ${args.agentName}${args.role ? `  ·  *${args.role}*` : ""}`,
    "",
    "## Your project goal",
    args.goalPrompt,
    "",
    "## Milestones",
    milestonesBlock,
    "",
    "## High-priority memories",
    memoriesBlock,
    "",
    "## Rules",
    "1. Every action must serve the project goal above. If a request seems off-goal, ask the user before pursuing it.",
    "2. Update milestone status with `update_milestone` whenever you complete a checkpoint.",
    "3. Save durable facts/preferences/decisions/artifacts with `save_memory`. Be selective — only what helps future you.",
    "4. Prefer concise, direct answers; expand only when the user asks or the task warrants it.",
  ].join("\n");
}

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { AgentRow, AlignmentScore } from "@shared/domain.js";
import { MilestoneRepository } from "../../db/repositories/milestones.js";

/**
 * Asks the same LLM "are we still on goal?" out-of-band, so the result
 * (green/yellow/red + reasoning) can be surfaced on the project nav bar
 * without blocking the main streaming response.
 */
export async function runSelfCheck(opts: {
  agent: AgentRow;
  model: BaseChatModel;
  recentToolSummary: string;
  recentAssistantText: string;
  milestoneRepo?: MilestoneRepository;
}): Promise<{ score: AlignmentScore; reasoning: string }> {
  const milestoneRepo = opts.milestoneRepo ?? new MilestoneRepository();
  const milestones = milestoneRepo.listByAgent(opts.agent.id);

  const sys = new SystemMessage(
    `You evaluate whether an AI agent is staying on its project goal. ` +
      `Reply with ONE JSON object exactly: {"score":"green"|"yellow"|"red","reasoning":"<one sentence>"}. ` +
      `green = clearly serving the goal; yellow = some drift, still salvageable; red = clearly off-goal or stuck.`,
  );

  const human = new HumanMessage(
    [
      `## Agent goal`,
      opts.agent.goalPrompt,
      ``,
      `## Active milestones`,
      milestones
        .filter((m) => m.status === "active" || m.status === "todo")
        .map((m) => `- [${m.status}] ${m.title}`)
        .join("\n") || "(none)",
      ``,
      `## Recent tool activity`,
      opts.recentToolSummary || "(no tool calls)",
      ``,
      `## Latest assistant response`,
      truncate(opts.recentAssistantText, 1500) || "(empty)",
      ``,
      `Return only the JSON object.`,
    ].join("\n"),
  );

  try {
    const resp = await opts.model.invoke([sys, human]);
    const text = typeof resp.content === "string" ? resp.content : JSON.stringify(resp.content);
    return parseScore(text);
  } catch (err) {
    return { score: "yellow", reasoning: `Self-check failed: ${(err as Error).message}` };
  }
}

function parseScore(text: string): { score: AlignmentScore; reasoning: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { score: "yellow", reasoning: `Could not parse: ${truncate(text, 200)}` };
  try {
    const parsed = JSON.parse(match[0]) as { score?: string; reasoning?: string };
    const score = parsed.score === "green" || parsed.score === "yellow" || parsed.score === "red"
      ? parsed.score
      : "yellow";
    return { score, reasoning: parsed.reasoning ?? "" };
  } catch {
    return { score: "yellow", reasoning: `Malformed JSON: ${truncate(text, 200)}` };
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

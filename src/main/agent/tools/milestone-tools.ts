import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { MilestoneRepository } from "../../db/repositories/milestones.js";

const statusSchema = z.enum(["todo", "active", "done", "cancelled"]);

/**
 * Milestone tools let the agent see and edit its own project progress.
 * Bound to a specific agentId at construction time.
 */
export function makeMilestoneTools(
  agentId: string,
  emit: (kind: "milestone_update", payload: unknown) => void,
  repo = new MilestoneRepository(),
) {
  const addMilestone = tool(
    async ({ title, description, status }) => {
      const row = repo.create({ agentId, title, description, status });
      emit("milestone_update", row);
      return `Added milestone ${row.id}: "${title}" (status=${row.status}).`;
    },
    {
      name: "add_milestone",
      description:
        "Add a new milestone for this agent's project. Use this to break a high-level goal into checkpoint deliverables.",
      schema: z.object({
        title: z.string().min(2),
        description: z.string().optional(),
        status: statusSchema.default("todo").optional(),
      }),
    },
  );

  const updateMilestone = tool(
    async ({ id, status, title, description }) => {
      const row = repo.update(id, {
        ...(status ? { status } : {}),
        ...(title ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
      });
      emit("milestone_update", row);
      return `Updated milestone ${id}: status=${row.status}.`;
    },
    {
      name: "update_milestone",
      description:
        "Update a milestone's status or text. Call this whenever you finish work that completes a checkpoint, or when the active milestone shifts.",
      schema: z.object({
        id: z.string(),
        status: statusSchema.optional(),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    },
  );

  const listMilestones = tool(
    async () => {
      const rows = repo.listByAgent(agentId);
      if (rows.length === 0) return "(no milestones yet)";
      return rows
        .map(
          (m, i) =>
            `${i + 1}. [${m.status}] ${m.title}${m.description ? ` — ${m.description}` : ""} (id=${m.id})`,
        )
        .join("\n");
    },
    {
      name: "list_milestones",
      description: "List the milestones for this agent's project, in order.",
      schema: z.object({}),
    },
  );

  return { addMilestone, updateMilestone, listMilestones };
}

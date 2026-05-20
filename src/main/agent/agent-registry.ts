import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

import type {
  AgentRow,
  ApprovalRequest,
  BuiltinToolKey,
  NewAgentInput,
  ToolKey,
} from "@shared/domain.js";
import { AgentRepository } from "../db/repositories/agents.js";
import { ThreadRepository } from "../db/repositories/threads.js";
import { MemoryService } from "./memory/memory-service.js";
import { ApprovalBroker } from "./approval-hook.js";
import { buildAgent, type AgentRuntimeBundle } from "./agent-factory.js";

export const DEFAULT_ENABLED_TOOLS: ToolKey[] = [
  "internet_search",
  "clipboard_read",
  "clipboard_write",
  "take_screenshot",
  "open_app",
  "open_path",
  "save_memory",
  "search_memory",
  "list_recent_memories",
  "pin_memory",
  "forget_memory",
  "add_milestone",
  "update_milestone",
  "list_milestones",
];

export const DEFAULT_BUILTIN_TOOLS: BuiltinToolKey[] = [
  "ls",
  "read_file",
  "write_file",
  "edit_file",
  "glob",
  "grep",
  "execute",
];

export class AgentRegistry {
  private readonly cache = new Map<string, AgentRuntimeBundle>();
  private readonly memoryService: MemoryService;
  private readonly approvalBroker: ApprovalBroker;

  constructor(
    private readonly emitApproval: (req: ApprovalRequest) => void,
    private readonly emitStream: (kind: string, payload: unknown) => void,
    private readonly agentRepo = new AgentRepository(),
    private readonly threadRepo = new ThreadRepository(),
  ) {
    this.memoryService = new MemoryService();
    this.approvalBroker = new ApprovalBroker(emitApproval);
  }

  /* ---------- agent crud ---------- */
  list(): AgentRow[] {
    return this.agentRepo.list();
  }

  create(input: NewAgentInput): AgentRow {
    const workspacesRoot = path.join(app.getPath("userData"), "workspaces");
    fs.mkdirSync(workspacesRoot, { recursive: true });

    const workspaceDir = input.workspaceDir
      ? input.workspaceDir
      : path.join(workspacesRoot, sanitiseFilename(input.name));

    const row = this.agentRepo.create({
      ...input,
      workspaceDir,
      enabledTools: input.enabledTools ?? DEFAULT_ENABLED_TOOLS,
      enabledBuiltinTools: input.enabledBuiltinTools ?? DEFAULT_BUILTIN_TOOLS,
      allowedExtraPaths: input.allowedExtraPaths ?? [],
    });

    fs.mkdirSync(row.workspaceDir, { recursive: true });
    return row;
  }

  update(id: string, patch: Partial<AgentRow>): AgentRow {
    this.cache.delete(id); // force rebuild on next use
    return this.agentRepo.update(id, patch);
  }

  archive(id: string): void {
    this.cache.delete(id);
    this.agentRepo.archive(id);
  }

  delete(id: string): void {
    this.cache.delete(id);
    this.agentRepo.delete(id);
  }

  /* ---------- runtime bundle ---------- */

  /** Lazily build (or reuse cached) DeepAgent for the given agent row. */
  getRuntime(agentId: string): AgentRuntimeBundle {
    let bundle = this.cache.get(agentId);
    if (bundle) return bundle;

    const row = this.agentRepo.requireById(agentId);
    bundle = buildAgent({
      row,
      memoryService: this.memoryService,
      approvalBroker: this.approvalBroker,
      emit: this.emitStream,
    });
    this.cache.set(agentId, bundle);
    return bundle;
  }

  invalidate(agentId: string): void {
    this.cache.delete(agentId);
  }

  /* ---------- helpers ---------- */

  agentForThread(threadId: string): AgentRow {
    const t = this.threadRepo.requireById(threadId);
    return this.agentRepo.requireById(t.agentId);
  }

  get memory() {
    return this.memoryService;
  }

  get approval() {
    return this.approvalBroker;
  }
}

function sanitiseFilename(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_").slice(0, 64) || "agent";
}

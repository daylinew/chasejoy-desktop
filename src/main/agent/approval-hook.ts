import { ToolMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { nanoid } from "nanoid";
import path from "node:path";

import type { ApprovalDecision, ApprovalRequest } from "@shared/domain.js";
import { ApprovalPolicyRepository } from "../db/repositories/approvals.js";

/**
 * Bridge through which the renderer answers approval prompts.
 * The IPC layer calls `respond(requestId, decision)`; pending promises resolve here.
 */
export class ApprovalBroker {
  private readonly pending = new Map<string, (d: ApprovalDecision) => void>();
  private readonly sessionAllowed = new Set<string>();

  constructor(
    private readonly emit: (req: ApprovalRequest) => void,
    private readonly policyRepo = new ApprovalPolicyRepository(),
  ) {}

  /** Called from IPC when the renderer responds. */
  respond(requestId: string, decision: ApprovalDecision): void {
    const resolve = this.pending.get(requestId);
    if (resolve) {
      this.pending.delete(requestId);
      resolve(decision);
    }
  }

  /** Returns whether session has already trusted this fingerprint. */
  sessionTrusts(agentId: string, tool: string, fingerprint: string): boolean {
    return this.sessionAllowed.has(sessionKey(agentId, tool, fingerprint));
  }

  /** Persisted "Trust forever for this agent" lookup. */
  agentTrusts(agentId: string, tool: string, fingerprint: string): boolean {
    const p = this.policyRepo.lookup(agentId, tool, fingerprint);
    return p?.decision === "allow";
  }

  /** Persisted "deny forever". */
  agentDenies(agentId: string, tool: string, fingerprint: string): boolean {
    const p = this.policyRepo.lookup(agentId, tool, fingerprint);
    return p?.decision === "deny";
  }

  rememberSession(agentId: string, tool: string, fingerprint: string): void {
    this.sessionAllowed.add(sessionKey(agentId, tool, fingerprint));
  }

  rememberAgent(agentId: string, tool: string, fingerprint: string, decision: "allow" | "deny"): void {
    this.policyRepo.remember(agentId, tool, fingerprint, decision);
  }

  request(req: ApprovalRequest): Promise<ApprovalDecision> {
    return new Promise<ApprovalDecision>((resolve) => {
      this.pending.set(req.id, resolve);
      this.emit(req);
    });
  }
}

function sessionKey(agentId: string, tool: string, fingerprint: string) {
  return `${agentId}::${tool}::${fingerprint}`;
}

const DANGEROUS_TOOLS = new Set(["execute", "write_file", "edit_file"]);

/**
 * Middleware that pauses on dangerous tool calls and waits for user approval.
 * Decisions can be remembered for the session or for the agent forever.
 */
export function createApprovalMiddleware(opts: {
  agentId: string;
  threadIdRef: () => string | null;
  broker: ApprovalBroker;
}) {
  return createMiddleware({
    name: "ApprovalMiddleware",
    wrapToolCall: async (request: any, handler: any) => {
      const toolName = request.toolCall.name ?? request.tool?.name ?? "unknown";
      if (!DANGEROUS_TOOLS.has(toolName)) {
        return handler(request);
      }

      const fingerprint = fingerprintCall(toolName, request.toolCall.args ?? {});
      const { agentId, broker } = opts;

      if (broker.agentDenies(agentId, toolName, fingerprint)) {
        return new ToolMessage({
          content: "Operation refused by user policy.",
          tool_call_id: request.toolCall.id ?? nanoid(8),
        });
      }

      if (broker.sessionTrusts(agentId, toolName, fingerprint) || broker.agentTrusts(agentId, toolName, fingerprint)) {
        return handler(request);
      }

      const req: ApprovalRequest = {
        id: nanoid(10),
        agentId,
        threadId: opts.threadIdRef() ?? "",
        tool: toolName as ApprovalRequest["tool"],
        summary: renderSummary(toolName, request.toolCall.args ?? {}),
        argsJson: JSON.stringify(request.toolCall.args ?? {}, null, 2),
      };

      const decision = await broker.request(req);

      if (decision === "deny") {
        broker.rememberAgent(agentId, toolName, fingerprint, "deny");
        return new ToolMessage({
          content: "Operation denied by user.",
          tool_call_id: request.toolCall.id ?? nanoid(8),
        });
      }

      if (decision === "allow_session") broker.rememberSession(agentId, toolName, fingerprint);
      if (decision === "allow_agent") broker.rememberAgent(agentId, toolName, fingerprint, "allow");

      return handler(request);
    },
  });
}

function renderSummary(tool: string, args: Record<string, unknown>): string {
  if (tool === "execute") {
    const cmd = (args["command"] as string | undefined) ?? "(no command)";
    return `Run command: ${cmd}`;
  }
  if (tool === "write_file" || tool === "edit_file") {
    const fp = (args["file_path"] ?? args["path"] ?? "(unknown)") as string;
    return tool === "write_file" ? `Create file: ${fp}` : `Edit file: ${fp}`;
  }
  return `Run ${tool}`;
}

function fingerprintCall(tool: string, args: Record<string, unknown>): string {
  if (tool === "execute") {
    const cmd = ((args["command"] as string | undefined) ?? "").trim();
    const head = cmd.split(/\s+/, 2).join(" "); // command + first arg
    return `cmd:${head}`;
  }
  if (tool === "write_file" || tool === "edit_file") {
    const fp = (args["file_path"] ?? args["path"] ?? "") as string;
    return `path:${path.normalize(String(fp || "")).toLowerCase()}`;
  }
  return tool;
}

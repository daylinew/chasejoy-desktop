/**
 * Domain types shared by main and renderer.
 * Keep this file dependency-free (no Node, no Electron, no Langchain types)
 * so it can be imported from both sides safely.
 */

export type ProviderKind = "openai" | "deepseek" | "openai-compat" | "anthropic" | "anthropic-compat";

export interface Provider {
  id: string;
  /** Friendly label such as "OpenAI", "DeepSeek" */
  label: string;
  kind: ProviderKind;
  /** Optional override; required for compatibility providers. */
  baseURL?: string;
  /** Set on read only when the renderer needs it; otherwise omitted. */
  apiKey?: string;
  /** True when an API key is stored. Sent to the renderer in place of the key itself. */
  hasApiKey?: boolean;
  /** Models available under this provider, populated via fetchModels. */
  models: string[];
  /** When true, this provider is the default for new agents. */
  isDefault?: boolean;
}

export type ToolKey =
  | "internet_search"
  | "clipboard_read"
  | "clipboard_write"
  | "take_screenshot"
  | "open_app"
  | "open_path"
  | "add_milestone"
  | "update_milestone"
  | "list_milestones"
  | "realign";

/** Subset of deepagents built-in tools that we expose for whitelisting. */
export type BuiltinToolKey =
  | "ls"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "glob"
  | "grep"
  | "execute";

export interface AgentRow {
  id: string;
  name: string;
  role: string | null;
  goalPrompt: string;
  providerId: string;
  model: string;
  workspaceDir: string;
  enabledTools: ToolKey[];
  enabledBuiltinTools: BuiltinToolKey[];
  /** Extra paths the agent may read/write outside its workspace. */
  allowedExtraPaths: string[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface NewAgentInput {
  name: string;
  role?: string;
  goalPrompt: string;
  providerId: string;
  model: string;
  /** Defaults to <appUserData>/workspaces/<agentId>. */
  workspaceDir?: string;
  enabledTools?: ToolKey[];
  enabledBuiltinTools?: BuiltinToolKey[];
  allowedExtraPaths?: string[];
}

export interface ThreadRow {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  lastActiveAt: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface MessageRow {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  /** JSON-encoded array of tool call descriptors. */
  toolCalls?: string | null;
  /** JSON-encoded array of subagent state snapshots. */
  subagents?: string | null;
  /** JSON-encoded provider/runtime metadata needed to faithfully rebuild model history. */
  messageMeta?: string | null;
  createdAt: number;
}

export interface RunContextAttachment {
  kind: "file" | "folder";
  path: string;
  name: string;
}

export interface AgentRunContext {
  workspaceDir?: string;
  attachments?: RunContextAttachment[];
}

export interface RunToolEvent {
  id: string;
  toolName: string;
  argsJson: string;
  resultPreview?: string;
}

export type MilestoneStatus = "todo" | "active" | "done" | "cancelled";

export interface MilestoneRow {
  id: string;
  agentId: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  orderIndex: number;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type AlignmentScore = "green" | "yellow" | "red";

export interface AlignmentEvent {
  id: number;
  agentId: string;
  threadId: string;
  score: AlignmentScore;
  reasoning: string;
  createdAt: number;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  threadId: string;
  tool: "execute" | "write_file" | "edit_file";
  /** Human-readable summary of what is about to happen. */
  summary: string;
  /** JSON-stringified tool arguments. */
  argsJson: string;
}

export type ApprovalDecision = "allow_once" | "allow_session" | "allow_agent" | "deny";

export interface AppMeta {
  workspaceRoot: string;
  /** Globally trusted paths the agent may always read/write. */
  globalAllowedPaths: string[];
  alignmentSelfCheckEveryN: number;
}

export interface SubagentStreamInterface {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  messages: any[];
  result?: string;
  toolCall?: {
    id: string;
    name: string;
    args: {
      description?: string;
      subagent_type?: string;
      [key: string]: unknown;
    };
  };
  startedAt?: number;
  completedAt?: number;
}

export interface StreamEventBase {
  threadId: string;
  agentId: string;
}

export type StreamEvent =
  | (StreamEventBase & { type: "message_delta"; messageId: string; role: MessageRole; deltaContent: string })
  | (StreamEventBase & { type: "message_complete"; messageId: string; role: MessageRole; content: string; toolCalls?: RunToolEvent[]; subagents?: unknown })
  | (StreamEventBase & { type: "tool_call"; toolName: string; argsJson: string; toolCallId: string })
  | (StreamEventBase & { type: "tool_result"; toolCallId: string; resultPreview: string })
  | (StreamEventBase & { type: "todos"; todos: { content: string; status: "pending" | "in_progress" | "completed" }[] })
  | (StreamEventBase & { type: "files"; files: Record<string, string> })
  | (StreamEventBase & { type: "alignment"; score: AlignmentScore; reasoning: string })
  | (StreamEventBase & { type: "milestone_update"; milestone: MilestoneRow })
  | (StreamEventBase & { type: "approval_request"; request: ApprovalRequest })
  | (StreamEventBase & { type: "subagent_update"; subagent: SubagentStreamInterface })
  | (StreamEventBase & { type: "error"; message: string })
  | (StreamEventBase & { type: "done" });

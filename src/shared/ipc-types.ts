/**
 * IPC contract between renderer (preload bridge) and main.
 * Renderer accesses this through `window.chasejoy.api.*` exposed via contextBridge.
 *
 * Naming convention: <domain>.<verb>
 *
 * All methods return a Promise that resolves with the listed return type.
 * Streaming uses `webContents.send` events listed in StreamEvent (see domain.ts).
 */

import type {
  AgentRow,
  AgentRunContext,
  AlignmentEvent,
  AppMeta,
  ApprovalDecision,
  ApprovalRequest,
  MessageRow,
  MilestoneRow,
  MilestoneStatus,
  NewAgentInput,
  Provider,
  ProviderKind,
  StreamEvent,
  ThreadRow,
} from "./domain.js";

/* ---------- channels ---------- */

export const Channels = {
  agentList: "agent:list",
  agentCreate: "agent:create",
  agentUpdate: "agent:update",
  agentArchive: "agent:archive",
  agentDelete: "agent:delete",

  threadList: "thread:list",
  threadCreate: "thread:create",
  threadRename: "thread:rename",
  threadDelete: "thread:delete",
  threadMessages: "thread:messages",

  chatStream: "chat:stream",
  chatCancel: "chat:cancel",

  milestoneList: "milestone:list",
  milestoneCreate: "milestone:create",
  milestoneUpdate: "milestone:update",
  milestoneDelete: "milestone:delete",

  alignmentLatest: "alignment:latest",
  alignmentRealign: "alignment:realign",

  approvalRespond: "approval:respond",

  settingsGet: "settings:get",
  settingsSetMeta: "settings:setMeta",
  settingsListProviders: "settings:listProviders",
  settingsUpsertProvider: "settings:upsertProvider",
  settingsRemoveProvider: "settings:removeProvider",
  settingsSetDefaultProvider: "settings:setDefaultProvider",
  settingsFetchModels: "settings:fetchModels",
  settingsSetTavilyKey: "settings:setTavilyKey",

  dialogPickDirectory: "dialog:pickDirectory",
  dialogPickFile: "dialog:pickFile",
  dialogPickFiles: "dialog:pickFiles",

  /* Renderer-bound events */
  evtStream: "evt:stream",
  evtApproval: "evt:approval",
} as const;

/* ---------- request/response shapes ---------- */

export interface ApiSurface {
  /* Agents */
  agentList(): Promise<AgentRow[]>;
  agentCreate(input: NewAgentInput): Promise<AgentRow>;
  agentUpdate(id: string, patch: Partial<AgentRow>): Promise<AgentRow>;
  agentArchive(id: string): Promise<void>;
  agentDelete(id: string): Promise<void>;

  /* Threads */
  threadList(agentId: string): Promise<ThreadRow[]>;
  threadCreate(agentId: string, title?: string): Promise<ThreadRow>;
  threadRename(id: string, title: string): Promise<void>;
  threadDelete(id: string): Promise<void>;
  threadMessages(threadId: string, limit?: number): Promise<MessageRow[]>;

  /* Chat */
  chatStream(input: { threadId: string; content: string; context?: AgentRunContext }): Promise<{ requestId: string }>;
  chatCancel(threadId: string): Promise<void>;

  /* Milestones */
  milestoneList(agentId: string): Promise<MilestoneRow[]>;
  milestoneCreate(input: {
    agentId: string;
    title: string;
    description?: string;
    status?: MilestoneStatus;
  }): Promise<MilestoneRow>;
  milestoneUpdate(id: string, patch: Partial<MilestoneRow>): Promise<MilestoneRow>;
  milestoneDelete(id: string): Promise<void>;

  /* Alignment */
  alignmentLatest(input: { agentId: string; threadId?: string }): Promise<AlignmentEvent | null>;
  alignmentRealign(input: { agentId: string; threadId: string }): Promise<void>;

  /* Approval */
  approvalRespond(input: { requestId: string; decision: ApprovalDecision }): Promise<void>;

  /* Settings */
  settingsGet(): Promise<AppMeta>;
  settingsSetMeta(patch: Partial<AppMeta>): Promise<AppMeta>;
  settingsListProviders(): Promise<Provider[]>;
  settingsUpsertProvider(
    input: Omit<Provider, "id" | "isDefault" | "hasApiKey"> & { id?: string },
  ): Promise<Provider>;
  settingsRemoveProvider(id: string): Promise<void>;
  settingsSetDefaultProvider(id: string): Promise<void>;
  settingsFetchModels(draft: {
    kind: ProviderKind;
    baseURL?: string;
    /** When omitted, the stored key for providerId is used (edit flow). */
    apiKey?: string;
    providerId?: string;
  }): Promise<string[]>;
  settingsSetTavilyKey(key: string | null): Promise<void>;

  /* Native dialogs */
  dialogPickDirectory(): Promise<string | null>;
  dialogPickFile(): Promise<string | null>;
  dialogPickFiles(): Promise<string[]>;
}

export interface ListenerSurface {
  onStream(handler: (evt: StreamEvent) => void): () => void;
  onApprovalRequest(handler: (req: ApprovalRequest) => void): () => void;
}

export interface ChaseJoyBridge {
  api: ApiSurface;
  on: ListenerSurface;
  version: string;
}

declare global {
  interface Window {
    chasejoy: ChaseJoyBridge;
  }
}

export type {};

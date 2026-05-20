import { createDeepAgent, FilesystemBackend } from "deepagents";
import type { DeepAgent } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import fs from "node:fs";

import type { AgentRow } from "@shared/domain.js";
import { createChatModel } from "./model-factory.js";
import { CHASEJOY_BASE_PROMPT } from "./system-prompt.js";
import { MemoryService } from "./memory/memory-service.js";
import { createAlignmentMiddleware } from "./middleware/alignment-middleware.js";
import { ApprovalBroker, createApprovalMiddleware } from "./approval-hook.js";

import { makeInternetSearchTool } from "./tools/internet-search.js";
import { makeClipboardReadTool, makeClipboardWriteTool } from "./tools/clipboard.js";
import { makeScreenshotTool } from "./tools/screenshot.js";
import { makeOpenAppTool, makeOpenPathTool } from "./tools/app-control.js";
import { makeMilestoneTools } from "./tools/milestone-tools.js";

import { researcherSubagent } from "./subagents/researcher.js";
import { fileEditorSubagent } from "./subagents/file-editor.js";

import { getSettingsStore } from "../stores/settings-store.js";

export interface AgentRuntimeBundle {
  agent: DeepAgent;
  model: BaseChatModel;
  /** Currently active thread (mutable so tools can read it). */
  setActiveThread: (threadId: string | null) => void;
}

export function buildAgent(opts: {
  row: AgentRow;
  memoryService: MemoryService;
  approvalBroker: ApprovalBroker;
  emit: (kind: string, payload: unknown) => void;
}): AgentRuntimeBundle {
  const { row, memoryService, approvalBroker, emit } = opts;

  const settings = getSettingsStore();
  const provider = settings.getProvider(row.providerId, false);
  if (!provider) throw new Error(`Provider not found for agent ${row.id}: ${row.providerId}`);
  const apiKey = settings.getApiKey(provider.id);
  if (!apiKey) {
    throw new Error(
      `API key missing for provider "${provider.label}". Open Settings and fill it in before running this agent.`,
    );
  }
  const modelName = row.model || provider.models[0];
  if (!modelName) {
    throw new Error(
      `No model selected for agent "${row.name}". Open Settings, fetch models for "${provider.label}", then re-select.`,
    );
  }

  fs.mkdirSync(row.workspaceDir, { recursive: true });

  const model = createChatModel(provider, apiKey, modelName, { streaming: true });
  const evaluator = createChatModel(provider, apiKey, modelName, { streaming: false, temperature: 0 });

  let activeThreadId: string | null = null;
  const threadRef = () => activeThreadId;

  const internetSearch = makeInternetSearchTool();
  const clipRead = makeClipboardReadTool();
  const clipWrite = makeClipboardWriteTool();
  const screenshot = makeScreenshotTool({ workspaceDir: row.workspaceDir });
  const openApp = makeOpenAppTool();
  const openPath = makeOpenPathTool();
  const milestone = makeMilestoneTools(row.id, (kind, payload) => emit(kind, payload));

  const enabled = new Set(row.enabledTools);
  const tools = [
    enabled.has("internet_search") ? internetSearch : null,
    enabled.has("clipboard_read") ? clipRead : null,
    enabled.has("clipboard_write") ? clipWrite : null,
    enabled.has("take_screenshot") ? screenshot : null,
    enabled.has("open_app") ? openApp : null,
    enabled.has("open_path") ? openPath : null,
    enabled.has("save_memory") ? memoryService.saveMemoryToolFor(row.id, threadRef) : null,
    enabled.has("search_memory") ? memoryService.searchMemoryToolFor(row.id) : null,
    enabled.has("list_recent_memories") ? memoryService.listRecentMemoriesToolFor(row.id) : null,
    enabled.has("pin_memory") ? memoryService.pinMemoryTool() : null,
    enabled.has("forget_memory") ? memoryService.forgetMemoryTool() : null,
    enabled.has("add_milestone") ? milestone.addMilestone : null,
    enabled.has("update_milestone") ? milestone.updateMilestone : null,
    enabled.has("list_milestones") ? milestone.listMilestones : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const backend = new FilesystemBackend({ rootDir: row.workspaceDir, virtualMode: true });

  const alignment = createAlignmentMiddleware({ agent: row, memoryService });
  const approval = createApprovalMiddleware({
    agentId: row.id,
    threadIdRef: threadRef,
    broker: approvalBroker,
  });

  const subagents: import("deepagents").SubAgent[] = [];
  if (enabled.has("internet_search")) {
    subagents.push(researcherSubagent(internetSearch));
  }
  subagents.push(fileEditorSubagent());

  const agent = createDeepAgent({
    model,
    backend,
    systemPrompt: CHASEJOY_BASE_PROMPT,
    tools: tools as never,
    middleware: [alignment, approval] as never,
    subagents: subagents as never,
  });

  return {
    agent: agent as unknown as DeepAgent,
    model: evaluator,
    setActiveThread: (id) => {
      activeThreadId = id;
    },
  };
}

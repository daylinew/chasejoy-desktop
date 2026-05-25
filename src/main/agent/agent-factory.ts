import { createDeepAgent, FilesystemBackend } from "deepagents";
import type { DeepAgent } from "deepagents";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AgentRow } from "@shared/domain.js";
import { createChatModel } from "./model-factory.js";
import { CHASEJOY_BASE_PROMPT } from "./system-prompt.js";
import { createAlignmentMiddleware } from "./middleware/alignment-middleware.js";
import { ApprovalBroker, createApprovalMiddleware } from "./approval-hook.js";
import { getAgentCheckpointer } from "./checkpointer.js";

import { makeInternetSearchTool } from "./tools/internet-search.js";
import { makeClipboardReadTool, makeClipboardWriteTool } from "./tools/clipboard.js";
import { makeScreenshotTool } from "./tools/screenshot.js";
import { makeOpenAppTool, makeOpenPathTool } from "./tools/app-control.js";
import { makeMilestoneTools } from "./tools/milestone-tools.js";

import { researcherSubagent } from "./subagents/researcher.js";
import { fileEditorSubagent } from "./subagents/file-editor.js";

import { getSettingsStore } from "../stores/settings-store.js";

const NATIVE_MEMORY_PATH = "/memories/AGENTS.md";
const runContextSchema = z.object({
  workspaceDir: z.string().optional(),
  attachments: z.array(z.object({
    kind: z.enum(["file", "folder"]),
    path: z.string(),
    name: z.string(),
  })).optional(),
});

export interface AgentRuntimeBundle {
  agent: DeepAgent;
  model: BaseChatModel;
  checkpointer: import("@langchain/langgraph-checkpoint-sqlite").SqliteSaver;
  /** Currently active thread (mutable so tools can read it). */
  setActiveThread: (threadId: string | null) => void;
}

export function buildAgent(opts: {
  row: AgentRow;
  approvalBroker: ApprovalBroker;
  emit: (kind: string, payload: unknown) => void;
}): AgentRuntimeBundle {
  const { row, approvalBroker, emit } = opts;

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
  const openPath = makeOpenPathTool({ workspaceDir: row.workspaceDir });
  const milestone = makeMilestoneTools(row.id, (kind, payload) => emit(kind, payload));

  const enabled = new Set(row.enabledTools);
  const tools = [
    enabled.has("internet_search") ? internetSearch : null,
    enabled.has("clipboard_read") ? clipRead : null,
    enabled.has("clipboard_write") ? clipWrite : null,
    enabled.has("take_screenshot") ? screenshot : null,
    enabled.has("open_app") ? openApp : null,
    enabled.has("open_path") ? openPath : null,
    enabled.has("add_milestone") ? milestone.addMilestone : null,
    enabled.has("update_milestone") ? milestone.updateMilestone : null,
    enabled.has("list_milestones") ? milestone.listMilestones : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  ensureNativeMemoryFile(row.workspaceDir);
  const backend = new FilesystemBackend({ rootDir: row.workspaceDir, virtualMode: true });
  const checkpointer = getAgentCheckpointer();

  const alignment = createAlignmentMiddleware({ agent: row });
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
    memory: [NATIVE_MEMORY_PATH],
    contextSchema: runContextSchema,
    checkpointer,
  });

  return {
    agent: agent as unknown as DeepAgent,
    model: evaluator,
    checkpointer,
    setActiveThread: (id) => {
      activeThreadId = id;
    },
  };
}

function ensureNativeMemoryFile(workspaceDir: string): void {
  const memoryDir = path.join(workspaceDir, "memories");
  const memoryFile = path.join(memoryDir, "AGENTS.md");
  fs.mkdirSync(memoryDir, { recursive: true });
  if (fs.existsSync(memoryFile)) return;

  const lines = [
    "# ChaseJoy Agent Memory",
    "",
    "This file is persistent long-term memory for this agent. Keep it concise and edit it when durable preferences, decisions, facts, or artifact references should carry into future conversations.",
    "",
    "## User Preferences",
    "- (empty)",
    "",
    "## Project Facts",
    "- (empty)",
    "",
    "## Decisions",
    "- (empty)",
    "",
    "## Artifacts",
    "- (empty)",
  ];

  fs.writeFileSync(memoryFile, `${lines.join("\n")}\n`, "utf8");
}

# ChaseJoy Desktop Project Navigation

Last updated: 2026-05-20

## Current Stage

ChaseJoy Desktop is at the working architecture stage: the Electron shell, React UI, provider settings, multi-agent CRUD, DeepAgents runtime, tool streaming, approval flow, project alignment, long-term memory, and LangGraph thread checkpointing are in place.

The current engineering rule is: use DeepAgents, LangChain, and LangGraph SDK capabilities first; only build custom code for product-specific behavior that the SDK does not cover.

## Product Direction

ChaseJoy should be a desktop Base Agent platform, not a fixed bundle of vertical features and not a simple chatbot. The core purpose is to let users build their own personal Agent system through natural language, local context, reusable assets, and visible execution.

The product should provide the substrate for users to create and run:

- Agents: autonomous roles that can plan, reason, and act.
- Workflows: standardized, observable, resumable processes.
- Skills: reusable methods, standards, style guides, and domain knowledge.
- Tools, protocols, and integrations: local or remote capabilities exposed safely to Agents and Workflows.
- Runs and artifacts: execution history, intermediate state, final outputs, and approvals.

Do not hard-code product direction around specific scenarios. Scenarios such as code review, test generation, or Feishu assistance should be buildable assets on top of the platform, not the platform's boundary.

## Interaction Logic

The main interaction loop:

1. User describes a goal, task, repeated process, or desired assistant.
2. Base Agent understands whether this calls for an Agent, Workflow, Skill, Tool, or Integration.
3. Base Agent produces a draft asset or executes a one-off task.
4. User reviews and confirms persistent assets before they are saved.
5. Saved assets become cards under the relevant Project or Agent.
6. User later clicks a card to run it with parameters, approvals, timeline, and artifacts.

Important product rule:

- Agents may propose and draft persistent assets, but should not silently create or mutate them. Creation must go through user confirmation.

## Product Object Model

- Project: local work context that groups agents, workflows, skills, memory, integrations, permissions, and runs.
- Agent: long-lived autonomous role built on DeepAgents.
- Workflow: structured execution graph built on LangGraph.
- Skill: reusable knowledge or method loaded by agents or workflow nodes.
- Tool: concrete capability or side effect, such as file, Git, shell, browser, desktop, or Feishu operations.
- Protocol: standard extension surface such as MCP and ACP.
- Run: one execution instance with inputs, timeline, logs, approvals, artifacts, and final status.
- Memory: durable context that shapes future behavior.
- Integration: external system connection and permission boundary.

Boundary rule:

```text
Agent = intelligence and autonomous planning
Workflow = controlled repeatable execution
Skill = professional method or instruction
Tool = capability
Memory = accumulated durable context
Integration = external system bridge
Protocol = standard extension/runtime bridge
Run = execution record
```

## Workflow Shape

Workflow should not be only Markdown. It should have a machine-readable definition plus human-readable supporting files.

Recommended shape:

- `workflow.json` or `workflow.yaml`: executable graph definition, inputs, steps, tools, outputs, approval points.
- `README.md`: user-facing explanation.
- `prompts/*.md`: prompt text for LLM nodes.
- `schemas/*.json`: input/output contracts.
- `skills/*/SKILL.md`: optional reusable methods used by the workflow.

Workflow UX should be card-based. Clicking a workflow card opens a parameter form or quick run, then shows a run timeline with step status, approvals, intermediate artifacts, retry/resume controls, and final outputs.

## Platform Architecture Direction

Keep the architecture split cleanly:

- Renderer UI: chats, asset cards, draft review, workflow run timelines, settings, approvals.
- Application services: project, agent, workflow, skill, run, artifact, integration, and permission services.
- Runtime layer: DeepAgents for autonomous agents; LangGraph for workflow execution and checkpointing.
- Tool/integration/protocol layer: local files, Git, shell, browser, desktop, Feishu, MCP, ACP, and future connectors.
- Persistence layer: app SQLite for product data; LangGraph checkpoint DB for execution state; workspace files for memory/assets/artifacts; Electron Store for provider/model/key settings.

SDK-first rule:

- Use DeepAgents for Base Agent behavior and memory.
- Use LangGraph for Workflow execution, checkpointing, resumability, and human gates.
- Use LangChain tools/model abstractions for tools and providers.
- Custom code should focus on product objects, UI, permissions, integrations, and asset lifecycle.

## Protocol Support Direction

MCP and ACP are platform-level extension protocols and should be supported as first-class integration/runtime surfaces.

MCP direction:

- Let Agents and Workflows discover and call external tools/resources exposed by MCP servers.
- Manage MCP server configuration, permissions, lifecycle, and trust boundaries in the desktop app.
- Treat MCP tools as part of the reusable Tool layer, not as hard-coded product features.

ACP direction:

- Support agent-to-agent or app-to-agent interoperability where ACP is useful.
- Let ChaseJoy expose selected Agents/Workflows as protocol-addressable capabilities when appropriate.
- Preserve explicit permission and confirmation boundaries before external agents can trigger local side effects.

Design rule:

- Protocol support should plug into the same Tool, Integration, Permission, Run, and Artifact model as native tools.

## Implemented

### Desktop App Shell

- Electron main/preload/renderer structure is wired.
- Renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and a typed preload bridge.
- React UI has agent sidebar, chat view, project nav, context panel, settings, new-agent wizard, and approval modal.

Key files:

- `src/main/index.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/stores/appStore.ts`

### Provider And Model Settings

- Supports OpenAI, Anthropic, and OpenAI-compatible providers.
- Provider metadata, model lists, default provider, and encrypted API keys are stored through `electron-store`.
- `.env.example` is only a first-run seed template, not the main settings store.

Key files:

- `src/main/stores/settings-store.ts`
- `src/main/agent/provider-probe.ts`
- `.env.example`

### Agent Runtime

- Agents are built with `createDeepAgent`.
- Uses DeepAgents `FilesystemBackend` in `virtualMode` scoped to each agent workspace.
- Custom tools are added only for desktop/product capabilities: Tavily search, clipboard, screenshot, app/path opening, and milestones.
- Subagents currently include `researcher` and `file_editor`.

Key files:

- `src/main/agent/agent-factory.ts`
- `src/main/agent/agent-registry.ts`
- `src/main/agent/tools/`
- `src/main/agent/subagents/`

### Memory Model

Memory has been moved off the old custom SQLite memory system.

- Long-term memory: DeepAgents-native `/memories/AGENTS.md` in each agent workspace.
- Thread/session state: LangGraph `SqliteSaver` checkpoint keyed by `thread_id`.
- UI/chat log: `messages` table remains for display and audit, not as the source of agent state.
- Legacy SQLite memory tables and FTS are removed by migration `0003_drop_legacy_sqlite_memories`.

Key files:

- `src/main/agent/agent-factory.ts`
- `src/main/agent/checkpointer.ts`
- `src/main/agent/stream-bridge.ts`
- `src/main/db/migrations.ts`

### Chat Streaming

- User messages are persisted to the UI log.
- DeepAgents stream events are bridged to renderer events.
- Existing checkpointed threads resume from LangGraph state and only receive the new user message.
- Old threads without checkpoints are migrated by sending the existing message history once.

Key files:

- `src/main/agent/stream-bridge.ts`
- `src/main/db/repositories/messages.ts`
- `src/main/db/repositories/threads.ts`

### Alignment And Milestones

- Project goal and active milestones are injected through `alignmentMiddleware`.
- Periodic self-check uses the configured model as an out-of-band judge.
- Milestones are stored in SQLite and exposed both through UI and agent tools.

Key files:

- `src/main/agent/middleware/alignment-middleware.ts`
- `src/main/agent/alignment/self-check.ts`
- `src/main/agent/tools/milestone-tools.ts`
- `src/main/db/repositories/milestones.ts`

### Dangerous Action Approval

- `execute`, `write_file`, and `edit_file` are intercepted by custom middleware.
- User can allow once, allow for session, trust agent, or deny.
- Approval policies persist in SQLite.

Key files:

- `src/main/agent/approval-hook.ts`
- `src/main/db/repositories/approvals.ts`
- `src/renderer/src/components/chat/ApprovalModal.tsx`

## Removed Or Deprecated

- Custom SQLite long-term memory repository.
- Memory FTS table and triggers.
- `MemoryService`.
- `MemoryExtractor`.
- Memory panel in the right context area.
- Memory IPC routes.
- Agent tools `save_memory`, `search_memory`, `list_recent_memories`, `pin_memory`, and `forget_memory`.

## Known Gaps

- Built-in DeepAgents tool whitelist fields exist (`enabledBuiltinTools`, `allowedExtraPaths`) but need a proper SDK-first enforcement pass using DeepAgents permissions/tool filtering.
- Approval middleware works, but should be evaluated against LangGraph/DeepAgents native `interruptOn` now that checkpointing is present.
- Memory file editing is currently agent-driven through DeepAgents filesystem tools; there is no dedicated user-facing memory editor.
- MCP server management and tool/resource bridging are not implemented yet.
- ACP support is not implemented yet.
- Thread deletion removes app data and should also stay synchronized with checkpoint cleanup.
- More end-to-end runtime smoke tests are needed with real providers.

## Verification

Last verified locally:

- `npm run typecheck`
- `npm run build`

## Recommended Next Steps

1. Enforce built-in tool permissions using DeepAgents SDK primitives.
2. Decide whether to migrate approval flow from custom middleware to native interrupt support.
3. Add a lightweight memory file viewer/editor for `/memories/AGENTS.md` if users need direct control.
4. Design MCP server registry, permissioning, and tool bridge.
5. Define the ACP support scope and how ChaseJoy Agents/Workflows are exposed or consumed.
6. Add smoke tests for create agent -> send message -> checkpoint resume -> memory file read/write.
7. Revisit README after the next implementation pass so public docs and this navigation stay aligned.

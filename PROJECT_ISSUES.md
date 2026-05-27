# ChaseJoy Desktop Issue Log

Last updated: 2026-05-25

This document records product, architecture, runtime, and UX problems found during development. Use it for project retrospectives and to avoid solving the same problem twice.

## How To Use

For each issue, keep the record short and actionable:

- Status: `open`, `mitigated`, `fixed`, or `watching`.
- Area: runtime, context, UI, approval, provider, persistence, integration, docs.
- Symptom: what the user/developer saw.
- Cause: the current best explanation.
- Decision: what we changed or decided.
- Follow-up: what still needs attention.

## Current Issues

### CJ-001 DeepSeek Reason `reasoning_content` Failure

- Status: watching
- Area: provider/runtime
- Symptom: DeepSeek thinking models returned `400 The reasoning_content in the thinking mode must be passed back to the API.`
- Cause: DeepSeek V4 Pro thinking/tool-call conversations require assistant history messages to carry `reasoning_content`. If an agent layer trims or rewrites that provider state, the next request can fail.
- Decision: Use LangChain's official `@langchain/deepseek` `ChatDeepSeek` integration as the primary route. It treats DeepSeek as a first-class provider and preserves reasoning metadata through LangChain message `additional_kwargs`.
- Follow-up: Test real DeepSeek V4 Pro tool-call runs after Electron restart, and verify checkpoint replay preserves required reasoning state.

### CJ-002 GPT Does Not Hit DeepSeek Reasoning Error

- Status: fixed
- Area: provider/runtime
- Symptom: GPT runs did not reproduce the `reasoning_content` failure.
- Cause: GPT uses OpenAI native protocol and does not impose DeepSeek's provider-specific reasoning replay rule.
- Decision: Keep GPT/OpenAI on `ChatOpenAI`; route DeepSeek through `ChatDeepSeek` instead of sharing GPT's generic OpenAI-compatible adapter.
- Follow-up: Keep provider routing explicit so future providers do not inherit DeepSeek-specific behavior.

### CJ-003 Hidden Prompt Stuffing For File Context

- Status: fixed
- Area: context
- Symptom: File/workspace context was being prepended into user messages as text such as `Target file` and `Workspace root`.
- Cause: Context selection had been implemented as prompt text instead of structured runtime context.
- Decision: Composer now sends work directory and attached files as structured run context. DeepAgents `contextSchema` validates it, and middleware injects a concise run-context summary.
- Follow-up: Add folder attachments, context preview, and per-run permission scoping.

### CJ-004 Composer Covered Execution Progress

- Status: fixed
- Area: UI
- Symptom: The floating input box covered current execution cards such as file edit progress.
- Cause: Message list bottom padding did not account for composer height, and composer stayed tall while a run was active.
- Decision: During runs, composer shrinks to a compact bar and the scroll area gets a larger bottom safe zone.
- Follow-up: Verify on smaller window heights.

### CJ-005 Approval Modal Looked Like A Debug Panel

- Status: fixed
- Area: approval/UI
- Symptom: Approval dialog showed raw JSON prominently and felt too technical.
- Cause: The approval UI exposed tool call args as the primary content.
- Decision: Approval modal now shows a user-facing summary first, with raw call details behind a collapsible section. Deny is now per-operation instead of persistent deny.
- Follow-up: Add diff preview for `edit_file` and command risk hints for `execute`.

### CJ-006 Top Goal Controls And Progress Bar Were Not Useful

- Status: fixed
- Area: UI/product
- Symptom: Top-level goal progress, `Re-plan`, and `Goal` controls felt noisy and did not match Codex/opencode-style flow.
- Cause: Goal management was exposed as permanent navigation instead of contextual run behavior.
- Decision: Goal controls are no longer primary top-bar UI. Goal management remains an agent capability and future contextual run control.
- Follow-up: Design goal detail drawer only when it directly helps the current run.

### CJ-007 Technical Terms Leaked Into UI

- Status: fixed
- Area: UI/product
- Symptom: Terms like `Threads`, `Sandbox`, `Milestones`, `unknown`, and `Realign` made the UI feel internal.
- Cause: SDK/runtime concepts were shown directly to users.
- Decision: Use product-facing labels: Conversations, Files/Workspace files, Goal steps, Work directory, Runs.
- Follow-up: Continue scanning new UI for internal terms before shipping.

### CJ-008 Electron Network Panel Does Not Show IPC

- Status: documented
- Area: debugging
- Symptom: DevTools Network showed no request activity during agent execution, making the app look inactive.
- Cause: Renderer/main communication uses Electron IPC, not browser fetch/XHR.
- Decision: Project navigation documents that IPC does not appear in Network. Execution visibility should be shown in the chat timeline instead of an IPC panel.
- Follow-up: Add a developer-only log view later if runtime debugging becomes painful.

### CJ-009 Old SQLite Memory Direction Was Wrong

- Status: fixed
- Area: memory/persistence
- Symptom: Custom SQLite memory duplicated DeepAgents memory concepts and risked drifting from SDK behavior.
- Cause: Long-term memory was initially implemented outside DeepAgents' native filesystem-backed memory.
- Decision: Removed legacy custom SQLite memory tables/tools/panel. Use DeepAgents-native `/memories/AGENTS.md` and LangGraph checkpoint state.
- Follow-up: Add a user-facing memory editor later, but keep it backed by DeepAgents memory files.

### CJ-010 Sidebar And Chat UI Felt Too Dashboard-Like

- Status: watching
- Area: UI/product
- Symptom: Early UI felt card-heavy and dashboard-like, not like Codex/opencode/Qoder.
- Cause: Technical state panels and permanent controls competed with the conversation.
- Decision: Shifted toward a simple left sidebar, centered chat flow, inline execution cards, bottom composer, and model selector inside composer.
- Follow-up: Continue refining spacing, typography, empty state, and run summaries through real usage.

### CJ-011 DeepSeek Provider Protocol Routing

- Status: fixed
- Area: provider/runtime
- Symptom: DeepSeek was temporarily routed through the Anthropic-compatible endpoint to avoid OpenAI-compatible `reasoning_content` errors.
- Cause: The first mitigation fixed one symptom but moved the provider onto the wrong primary protocol for DeepSeek V4 Pro agent tool-calling.
- Decision: DeepSeek is now its own `deepseek` provider kind using official LangChain `ChatDeepSeek`, defaulting to `https://api.deepseek.com`. Existing DeepSeek configs are migrated away from old OpenAI/Anthropic compatibility routes.
- Follow-up: Keep provider adapters aligned with official LangChain integrations first; provider-specific transforms require an explicit issue and verification note.

### CJ-012 Runs Stopped After Progress Text

- Status: mitigated
- Area: runtime/context
- Symptom: Long artifact tasks could stop after text like "正在生成" or "接下来处理", with no visible file or command action.
- Cause: The model sometimes produced work-in-progress narration as a final assistant turn, and long histories could approach context limits without an explicit compression path.
- Decision: Use DeepAgents summarization defaults based on model context size where available, with fallback thresholds for unknown compatible models. Add a bounded internal continuation when a run has artifact intent, progress-like text, and no concrete tool-backed action.
- Follow-up: Verify with real long document/webpage tasks and tune continuation heuristics if it over-continues on explanatory questions.

## Open Follow-Ups

- Make run summary cards actionable: open artifact, diff viewer, per-file review, undo/revert.
- Add folder attachments, context preview, and per-run permission scope.
- Verify DeepSeek V4 Pro runtime through `ChatDeepSeek` with real tool-call runs and Electron restart.
- Compare current approval middleware with native LangGraph/DeepAgents interrupt support.
- Design MCP server registry, permissions, and tool bridge.
- Define ACP support scope.
- Add smoke tests for create agent -> send message -> checkpoint resume -> memory read/write -> artifact open.
- Add smoke tests for long artifact runs that trigger summarization and auto-continuation.

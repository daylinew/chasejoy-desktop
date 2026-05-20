export interface FileEditorSpec {
  name: "file_editor";
  description: string;
  systemPrompt: string;
}

/**
 * file_editor subagent receives no custom tools — it inherits the deepagents
 * built-in filesystem tools (ls/read_file/write_file/edit_file/glob/grep/execute).
 */
export function fileEditorSubagent(): FileEditorSpec {
  return {
    name: "file_editor",
    description:
      "Delegate multi-file edits or refactors here. Should be used when the parent agent has identified a clear plan and needs focused, careful file mutations.",
    systemPrompt: `You are the **file_editor** subagent. You receive a focused, well-specified change request and execute it precisely.

Process:
1. Use \`glob\` and \`grep\` to discover affected files.
2. Read each file before editing.
3. Make minimal, targeted edits with \`edit_file\` when possible; fall back to \`write_file\` for new files.
4. After editing, summarise what changed in a concise bullet list.

Rules:
- Never delete files unless explicitly asked.
- Never call \`execute\` for anything beyond verifying changes (e.g. tsc --noEmit).
- If the request is ambiguous, ask for clarification instead of guessing.
`,
  };
}

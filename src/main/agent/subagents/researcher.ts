import type { StructuredTool } from "@langchain/core/tools";

export interface ResearcherSpec {
  name: "researcher";
  description: string;
  systemPrompt: string;
  tools: StructuredTool[];
}

export function researcherSubagent(internetSearchTool: StructuredTool): ResearcherSpec {
  return {
    name: "researcher",
    description:
      "Delegate deep-research tasks (multi-step web search + report) here. Returns a structured Markdown report.",
    systemPrompt: `You are the **researcher** subagent. Your sole job is to gather information from the web and synthesize it into a concise, well-cited report.

Process:
1. Decompose the query into 2-5 sub-questions.
2. For each sub-question call \`internet_search\`. Iterate if results are thin.
3. Cross-check important facts across at least two sources.
4. Write the final report in Markdown with sections: TL;DR, Findings, Sources.
5. Return only the report; do not narrate your process.
`,
    tools: [internetSearchTool],
  };
}

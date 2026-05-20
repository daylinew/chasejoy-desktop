import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";

import { getSettingsStore } from "../../stores/settings-store.js";

export function makeInternetSearchTool() {
  return tool(
    async ({ query, maxResults, topic, includeRawContent }) => {
      const key = getSettingsStore().getTavilyKey();
      if (!key) {
        return "Tavily API key is not configured. Open Settings and add one before running web searches.";
      }

      const search = new TavilySearch({
        maxResults: maxResults ?? 5,
        tavilyApiKey: key,
        includeRawContent: includeRawContent ?? false,
        topic: topic ?? "general",
      });

      try {
        const result = await search.invoke({ query });
        return typeof result === "string" ? result : JSON.stringify(result, null, 2);
      } catch (err) {
        return `Search failed: ${(err as Error).message}`;
      }
    },
    {
      name: "internet_search",
      description:
        "Run an internet search via Tavily. Use for current events, documentation lookups, or factual questions you cannot answer from memory.",
      schema: z.object({
        query: z.string().describe("The search query"),
        maxResults: z.number().int().min(1).max(10).default(5).optional(),
        topic: z.enum(["general", "news", "finance"]).default("general").optional(),
        includeRawContent: z.boolean().default(false).optional(),
      }),
    },
  );
}

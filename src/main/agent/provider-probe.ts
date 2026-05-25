import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

import type { ProviderKind } from "@shared/domain.js";

export interface ProviderDraft {
  kind: ProviderKind;
  baseURL?: string;
  apiKey: string;
}

/**
 * List model ids for a provider draft using the official SDKs that LangChain
 * itself sits on top of (`openai`, `@anthropic-ai/sdk`). Doubles as a
 * connectivity test: a bad key or unreachable host throws, so the caller can
 * surface a single "test & fetch models" action.
 *
 * Going through the SDKs (instead of hand-rolling fetch) means we inherit:
 *   - correct URL composition (`baseURL` + the SDK's known route prefix like /v1)
 *   - auth header conventions (Authorization: Bearer / x-api-key)
 *   - anthropic-version + future required headers
 *   - standardized error shapes
 */
export async function fetchModels(draft: ProviderDraft): Promise<string[]> {
  if (!draft.apiKey) throw new Error("API key is required.");

  if (draft.kind === "anthropic" || draft.kind === "anthropic-compat") {
    if (draft.kind === "anthropic-compat" && !draft.baseURL) {
      throw new Error("Base URL is required for anthropic-compat providers.");
    }
    const client = new Anthropic({
      apiKey: draft.apiKey,
      ...(draft.kind === "anthropic-compat" && draft.baseURL ? { baseURL: draft.baseURL } : {}),
    });
    const page = await client.models.list({ limit: 1000 });
    return page.data
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  // openai / deepseek / openai-compat
  if (draft.kind === "openai-compat" && !draft.baseURL) {
    throw new Error("Base URL is required for openai-compat providers.");
  }
  const client = new OpenAI({
    apiKey: draft.apiKey,
    ...(draft.baseURL || draft.kind === "deepseek"
      ? { baseURL: draft.baseURL || "https://api.deepseek.com" }
      : {}),
  });
  const page = await client.models.list();
  const ids: string[] = [];
  for await (const m of page) {
    if (typeof m.id === "string" && m.id.length > 0) ids.push(m.id);
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

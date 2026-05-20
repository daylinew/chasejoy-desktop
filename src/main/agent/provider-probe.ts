import type { ProviderKind } from "@shared/domain.js";

export interface ProviderDraft {
  kind: ProviderKind;
  baseURL?: string;
  apiKey: string;
}

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

/**
 * List available model ids for a provider draft.
 * Doubles as a connectivity test: a bad key or unreachable host throws,
 * so the caller can surface a single "test & fetch models" action.
 */
export async function fetchModels(draft: ProviderDraft): Promise<string[]> {
  if (!draft.apiKey) throw new Error("API key is required.");
  if (draft.kind === "openai-compat" && !draft.baseURL) {
    throw new Error("Base URL is required for OpenAI-compatible providers.");
  }

  const { url, headers } = buildRequest(draft);

  let res;
  try {
    res = await fetch(url, { method: "GET", headers });
  } catch (err) {
    throw new Error(`Cannot reach ${url}: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Model list request failed (HTTP ${res.status}). ${truncate(body, 200)}`.trim(),
    );
  }

  const json = (await res.json()) as { data?: { id?: string }[] };
  const ids = (json.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
}

function buildRequest(draft: ProviderDraft): { url: string; headers: Record<string, string> } {
  if (draft.kind === "anthropic") {
    return {
      url: `${ANTHROPIC_BASE}/models?limit=1000`,
      headers: {
        "x-api-key": draft.apiKey,
        "anthropic-version": "2023-06-01",
      },
    };
  }
  const base = (draft.baseURL || DEFAULT_OPENAI_BASE).replace(/\/+$/, "");
  return {
    url: `${base}/models`,
    headers: { Authorization: `Bearer ${draft.apiKey}` },
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

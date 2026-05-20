import { app, safeStorage } from "electron";
import Store from "electron-store";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";

import type { AppMeta, Provider, ProviderKind } from "@shared/domain.js";

interface PersistedShape {
  meta: AppMeta;
  providers: PersistedProvider[];
  defaultProviderId: string | null;
  /** Tavily key stored encrypted (base64) when safeStorage is available. */
  tavilyApiKeyEnc: string | null;
}

interface PersistedProvider extends Omit<Provider, "apiKey" | "isDefault"> {
  /** Encrypted (base64) when safeStorage is available, else plaintext. */
  apiKeyEnc: string | null;
}

/** Pre-split profile shape, kept only to migrate legacy stores. */
interface LegacyProfile {
  id: string;
  label: string;
  kind: ProviderKind;
  model: string;
  baseURL?: string;
  apiKeyEnc: string | null;
}

const DEFAULTS: PersistedShape = {
  meta: {
    workspaceRoot: "",
    globalAllowedPaths: [],
    alignmentSelfCheckEveryN: 4,
    memoryExtractEveryN: 12,
  },
  providers: [],
  defaultProviderId: null,
  tavilyApiKeyEnc: null,
};

let _store: Store<PersistedShape> | null = null;

function store(): Store<PersistedShape> {
  if (!_store) {
    _store = new Store<PersistedShape>({
      name: "chasejoy-settings",
      defaults: DEFAULTS,
    });
    migrateLegacyProfiles(_store);
  }
  return _store;
}

function encrypt(plain: string): string | null {
  if (!plain) return null;
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString("base64");
  }
  return plain;
}

function decrypt(enc: string | null): string | null {
  if (!enc) return null;
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    } catch {
      return enc;
    }
  }
  return enc;
}

function ensureMeta(): AppMeta {
  const s = store();
  const cur = s.get("meta");
  if (!cur.workspaceRoot) {
    const root = path.join(app.getPath("userData"), "workspaces");
    fs.mkdirSync(root, { recursive: true });
    s.set("meta", { ...cur, workspaceRoot: root });
    return s.get("meta");
  }
  return cur;
}

/**
 * One-time upgrade: collapse pre-split `profiles` (1 provider + 1 model each)
 * into `providers` (1 provider + N models), grouping by kind+baseURL.
 * The first profile in each group keeps its id as the provider id, so most
 * existing `agent.provider_id` references still resolve.
 */
function migrateLegacyProfiles(s: Store<PersistedShape>): void {
  const raw = s as unknown as {
    has: (k: string) => boolean;
    get: (k: string) => unknown;
    delete: (k: string) => void;
  };
  if (!raw.has("profiles")) return;

  if (s.get("providers").length === 0) {
    const legacy = raw.get("profiles") as LegacyProfile[] | undefined;
    if (Array.isArray(legacy) && legacy.length > 0) {
      const groups = new Map<string, PersistedProvider>();
      const profileIdToGroupKey = new Map<string, string>();
      for (const p of legacy) {
        const key = `${p.kind}::${p.baseURL ?? ""}`;
        profileIdToGroupKey.set(p.id, key);
        const g = groups.get(key);
        if (g) {
          if (p.model && !g.models.includes(p.model)) g.models.push(p.model);
        } else {
          groups.set(key, {
            id: p.id,
            label: p.label,
            kind: p.kind,
            baseURL: p.baseURL,
            models: p.model ? [p.model] : [],
            apiKeyEnc: p.apiKeyEnc,
          });
        }
      }
      const providers = [...groups.values()];
      s.set("providers", providers);

      const legacyDefault = raw.get("defaultProfileId") as string | null | undefined;
      const groupKey = legacyDefault ? profileIdToGroupKey.get(legacyDefault) : undefined;
      const mapped = groupKey ? groups.get(groupKey) : undefined;
      s.set("defaultProviderId", mapped?.id ?? providers[0]?.id ?? null);
    }
  }

  raw.delete("profiles");
  raw.delete("defaultProfileId");
}

export class SettingsStore {
  /* ---------- App meta ---------- */
  getMeta(): AppMeta {
    return ensureMeta();
  }

  setMeta(patch: Partial<AppMeta>): AppMeta {
    const s = store();
    const merged = { ...s.get("meta"), ...patch };
    s.set("meta", merged);
    return merged;
  }

  /* ---------- Providers ---------- */
  private toProvider(p: PersistedProvider, defaultId: string | null, includeKey: boolean): Provider {
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      baseURL: p.baseURL,
      models: p.models ?? [],
      apiKey: includeKey ? decrypt(p.apiKeyEnc) ?? undefined : undefined,
      hasApiKey: !!p.apiKeyEnc,
      isDefault: p.id === defaultId,
    };
  }

  listProviders(includeKeys = false): Provider[] {
    const s = store();
    const defaultId = s.get("defaultProviderId");
    return s.get("providers").map((p) => this.toProvider(p, defaultId, includeKeys));
  }

  getProvider(id: string, includeKey = true): Provider | null {
    const s = store();
    const p = s.get("providers").find((x) => x.id === id);
    if (!p) return null;
    return this.toProvider(p, s.get("defaultProviderId"), includeKey);
  }

  /** Decrypted API key for the given provider, or null when missing. */
  getApiKey(providerId: string): string | null {
    const s = store();
    const p = s.get("providers").find((x) => x.id === providerId);
    if (!p) return null;
    return decrypt(p.apiKeyEnc);
  }

  upsertProvider(input: Omit<Provider, "id" | "isDefault" | "hasApiKey"> & { id?: string }): Provider {
    const s = store();
    const providers = s.get("providers").slice();
    const idx = input.id ? providers.findIndex((p) => p.id === input.id) : -1;

    const id = idx >= 0 ? providers[idx]!.id : input.id ?? nanoid(10);
    const persisted: PersistedProvider = {
      id,
      label: input.label,
      kind: input.kind,
      baseURL: input.baseURL,
      models: input.models ?? [],
      apiKeyEnc: input.apiKey
        ? encrypt(input.apiKey)
        : idx >= 0
          ? providers[idx]!.apiKeyEnc
          : null,
    };

    if (idx >= 0) providers[idx] = persisted;
    else providers.push(persisted);
    s.set("providers", providers);

    if (!s.get("defaultProviderId")) s.set("defaultProviderId", id);

    return this.getProvider(id, false)!;
  }

  removeProvider(id: string): void {
    const s = store();
    s.set("providers", s.get("providers").filter((p) => p.id !== id));
    if (s.get("defaultProviderId") === id) {
      const rest = s.get("providers");
      s.set("defaultProviderId", rest[0]?.id ?? null);
    }
  }

  setDefaultProvider(id: string): void {
    const s = store();
    if (!s.get("providers").some((p) => p.id === id)) {
      throw new Error(`Provider not found: ${id}`);
    }
    s.set("defaultProviderId", id);
  }

  getDefaultProvider(): Provider | null {
    const s = store();
    const id = s.get("defaultProviderId");
    return id ? this.getProvider(id, false) : null;
  }

  /* ---------- Tavily ---------- */
  setTavilyKey(key: string | null): void {
    store().set("tavilyApiKeyEnc", key ? encrypt(key) : null);
  }

  getTavilyKey(): string | null {
    return decrypt(store().get("tavilyApiKeyEnc"));
  }

  /* ---------- One-time bootstrap from env ---------- */
  bootstrapFromEnv(): void {
    const s = store();
    if (s.get("providers").length > 0) return;

    const openaiKey = process.env["OPENAI_API_KEY"];
    if (openaiKey) {
      this.upsertProvider({
        label: "OpenAI",
        kind: "openai",
        baseURL: process.env["OPENAI_BASE_URL"] || undefined,
        models: ["gpt-4o-mini"],
        apiKey: openaiKey,
      });
    }

    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    if (anthropicKey) {
      this.upsertProvider({
        label: "Anthropic",
        kind: "anthropic",
        models: ["claude-3-5-sonnet-latest"],
        apiKey: anthropicKey,
      });
    }

    const tavilyKey = process.env["TAVILY_API_KEY"];
    if (tavilyKey) this.setTavilyKey(tavilyKey);
  }
}

let _singleton: SettingsStore | null = null;
export function getSettingsStore(): SettingsStore {
  if (!_singleton) _singleton = new SettingsStore();
  return _singleton;
}

/** Convenience templates surfaced in the provider wizard. */
export const PROVIDER_TEMPLATES: { label: string; kind: ProviderKind; baseURL?: string }[] = [
  { label: "OpenAI", kind: "openai" },
  { label: "Anthropic", kind: "anthropic" },
  { label: "DeepSeek", kind: "openai-compat", baseURL: "https://api.deepseek.com/v1" },
  { label: "Qwen (DashScope)", kind: "openai-compat", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { label: "Moonshot Kimi", kind: "openai-compat", baseURL: "https://api.moonshot.cn/v1" },
];

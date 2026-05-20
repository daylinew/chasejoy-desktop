import { app, safeStorage } from "electron";
import Store from "electron-store";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";

import type { AppMeta, ProviderProfile, ProviderKind } from "@shared/domain.js";

interface PersistedShape {
  meta: AppMeta;
  profiles: PersistedProfile[];
  defaultProfileId: string | null;
  /** Tavily key stored encrypted (base64) when safeStorage is available. */
  tavilyApiKeyEnc: string | null;
}

interface PersistedProfile extends Omit<ProviderProfile, "apiKey" | "isDefault"> {
  /** Encrypted (base64) when safeStorage is available, else plaintext. */
  apiKeyEnc: string | null;
}

const DEFAULTS: PersistedShape = {
  meta: {
    workspaceRoot: "",
    globalAllowedPaths: [],
    alignmentSelfCheckEveryN: 4,
    memoryExtractEveryN: 12,
  },
  profiles: [],
  defaultProfileId: null,
  tavilyApiKeyEnc: null,
};

let _store: Store<PersistedShape> | null = null;

function store(): Store<PersistedShape> {
  if (!_store) {
    _store = new Store<PersistedShape>({
      name: "chasejoy-settings",
      defaults: DEFAULTS,
    });
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

  /* ---------- Provider profiles ---------- */
  listProfiles(includeKeys = false): ProviderProfile[] {
    const s = store();
    const defaultId = s.get("defaultProfileId");
    return s.get("profiles").map((p) => ({
      id: p.id,
      label: p.label,
      kind: p.kind,
      model: p.model,
      baseURL: p.baseURL,
      apiKey: includeKeys ? decrypt(p.apiKeyEnc) ?? undefined : undefined,
      isDefault: p.id === defaultId,
    }));
  }

  getProfile(id: string, includeKey = true): ProviderProfile | null {
    const s = store();
    const p = s.get("profiles").find((x) => x.id === id);
    if (!p) return null;
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      model: p.model,
      baseURL: p.baseURL,
      apiKey: includeKey ? decrypt(p.apiKeyEnc) ?? undefined : undefined,
      isDefault: p.id === s.get("defaultProfileId"),
    };
  }

  /** Decrypted API key for the given profile, or null when missing. */
  getApiKey(profileId: string): string | null {
    const s = store();
    const p = s.get("profiles").find((x) => x.id === profileId);
    if (!p) return null;
    return decrypt(p.apiKeyEnc);
  }

  upsertProfile(input: Omit<ProviderProfile, "id" | "isDefault"> & { id?: string }): ProviderProfile {
    const s = store();
    const profiles = s.get("profiles").slice();
    const idx = input.id ? profiles.findIndex((p) => p.id === input.id) : -1;

    const id = idx >= 0 ? profiles[idx]!.id : input.id ?? nanoid(10);
    const persisted: PersistedProfile = {
      id,
      label: input.label,
      kind: input.kind,
      model: input.model,
      baseURL: input.baseURL,
      apiKeyEnc: input.apiKey ? encrypt(input.apiKey) : (idx >= 0 ? profiles[idx]!.apiKeyEnc : null),
    };

    if (idx >= 0) profiles[idx] = persisted;
    else profiles.push(persisted);
    s.set("profiles", profiles);

    if (!s.get("defaultProfileId")) s.set("defaultProfileId", id);

    return this.getProfile(id, false)!;
  }

  removeProfile(id: string): void {
    const s = store();
    s.set("profiles", s.get("profiles").filter((p) => p.id !== id));
    if (s.get("defaultProfileId") === id) {
      const rest = s.get("profiles");
      s.set("defaultProfileId", rest[0]?.id ?? null);
    }
  }

  setDefaultProfile(id: string): void {
    const s = store();
    if (!s.get("profiles").some((p) => p.id === id)) {
      throw new Error(`Profile not found: ${id}`);
    }
    s.set("defaultProfileId", id);
  }

  getDefaultProfile(): ProviderProfile | null {
    const s = store();
    const id = s.get("defaultProfileId");
    return id ? this.getProfile(id, false) : null;
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
    if (s.get("profiles").length > 0) return;

    const openaiKey = process.env["OPENAI_API_KEY"];
    if (openaiKey) {
      this.upsertProfile({
        label: "OpenAI",
        kind: "openai",
        model: "gpt-4o-mini",
        baseURL: process.env["OPENAI_BASE_URL"] || undefined,
        apiKey: openaiKey,
      });
    }

    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    if (anthropicKey) {
      this.upsertProfile({
        label: "Anthropic",
        kind: "anthropic",
        model: "claude-3-5-sonnet-latest",
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

/** Convenience templates surfaced in the Settings UI. */
export const PROVIDER_TEMPLATES: { label: string; kind: ProviderKind; model: string; baseURL?: string }[] = [
  { label: "OpenAI Official", kind: "openai", model: "gpt-4o-mini" },
  { label: "Anthropic", kind: "anthropic", model: "claude-3-5-sonnet-latest" },
  { label: "DeepSeek", kind: "openai-compat", model: "deepseek-chat", baseURL: "https://api.deepseek.com/v1" },
  { label: "Qwen (DashScope)", kind: "openai-compat", model: "qwen-plus", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  { label: "Moonshot Kimi", kind: "openai-compat", model: "moonshot-v1-32k", baseURL: "https://api.moonshot.cn/v1" },
];

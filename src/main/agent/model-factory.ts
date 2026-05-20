import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { ProviderProfile } from "@shared/domain.js";

/**
 * Build a LangChain chat model from a stored provider profile.
 * The caller is responsible for fetching the decrypted API key from
 * SettingsStore before invoking; we accept it as an explicit field here
 * so the factory itself stays pure.
 */
export function createChatModel(
  profile: ProviderProfile,
  apiKey: string,
  opts: { streaming?: boolean; temperature?: number } = {},
): BaseChatModel {
  const streaming = opts.streaming ?? true;
  const temperature = opts.temperature ?? 0.3;

  switch (profile.kind) {
    case "openai":
      return new ChatOpenAI({
        model: profile.model,
        apiKey,
        temperature,
        streaming,
        ...(profile.baseURL ? { configuration: { baseURL: profile.baseURL } } : {}),
      });

    case "openai-compat":
      if (!profile.baseURL) {
        throw new Error(`Profile ${profile.label} is openai-compat but has no baseURL`);
      }
      return new ChatOpenAI({
        model: profile.model,
        apiKey,
        temperature,
        streaming,
        configuration: { baseURL: profile.baseURL },
      });

    case "anthropic":
      return new ChatAnthropic({
        model: profile.model,
        apiKey,
        temperature,
        streaming,
      });

    default: {
      const _exhaustive: never = profile.kind;
      throw new Error(`Unknown provider kind: ${String(_exhaustive)}`);
    }
  }
}

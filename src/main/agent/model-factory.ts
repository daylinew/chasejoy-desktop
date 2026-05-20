import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import type { Provider } from "@shared/domain.js";

/**
 * Build a LangChain chat model from a stored provider + a chosen model name.
 * The caller is responsible for fetching the decrypted API key from
 * SettingsStore before invoking; we accept it as an explicit field here
 * so the factory itself stays pure.
 */
export function createChatModel(
  provider: Provider,
  apiKey: string,
  model: string,
  opts: { streaming?: boolean; temperature?: number } = {},
): BaseChatModel {
  const streaming = opts.streaming ?? true;
  const temperature = opts.temperature ?? 0.3;

  switch (provider.kind) {
    case "openai":
      return new ChatOpenAI({
        model,
        apiKey,
        temperature,
        streaming,
        ...(provider.baseURL ? { configuration: { baseURL: provider.baseURL } } : {}),
      });

    case "openai-compat":
      if (!provider.baseURL) {
        throw new Error(`Provider ${provider.label} is openai-compat but has no baseURL`);
      }
      return new ChatOpenAI({
        model,
        apiKey,
        temperature,
        streaming,
        configuration: { baseURL: provider.baseURL },
      });

    case "anthropic":
      return new ChatAnthropic({
        model,
        apiKey,
        temperature,
        streaming,
      });

    default: {
      const _exhaustive: never = provider.kind;
      throw new Error(`Unknown provider kind: ${String(_exhaustive)}`);
    }
  }
}

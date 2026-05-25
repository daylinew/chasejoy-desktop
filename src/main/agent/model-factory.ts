import { ChatAnthropic } from "@langchain/anthropic";
import { ChatDeepSeek } from "@langchain/deepseek";
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

    case "deepseek":
      return new ChatDeepSeek({
        model,
        apiKey,
        temperature,
        streaming,
        maxTokens: 8192,
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

    case "anthropic-compat": {
      if (!provider.baseURL) {
        throw new Error(`Provider ${provider.label} is anthropic-compat but has no baseURL`);
      }
      const thinkingConfig = anthropicCompatThinkingConfig(model);
      return new ChatAnthropic({
        model,
        apiKey,
        maxTokens: 8192,
        ...("thinking" in thinkingConfig ? {} : { temperature }),
        streaming,
        anthropicApiUrl: provider.baseURL,
        ...thinkingConfig,
      });
    }

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

function anthropicCompatThinkingConfig(model: string): Record<string, unknown> {
  const modelName = model.toLowerCase();
  const needsThinking =
    modelName.includes("reason") ||
    modelName.includes("thinking") ||
    modelName.includes("v4-pro");

  if (!needsThinking) return {};

  // `thinking.budget_tokens` is the Anthropic-standard knob for reasoning depth.
  // Keep this scoped to Anthropic-compatible providers; first-class providers
  // such as DeepSeek should use their official LangChain integration.
  return {
    thinking: { type: "enabled", budget_tokens: 2048 },
  };
}

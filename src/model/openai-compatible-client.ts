/**
 * OpenAI-Compatible Model Client — calls chat/completions API.
 *
 * Works with any provider that follows the OpenAI API format:
 * - Zhipu/GLM (智谱AI): open.bigmodel.cn
 * - DeepSeek: api.deepseek.com
 * - Moonshot/Kimi: api.moonshot.cn
 * - OpenAI: api.openai.com
 * - Any self-hosted compatible server
 *
 * Design: Send L0 system prompt as system role + conversation as user/assistant turns.
 * Response is parsed for @mentions and ball actions.
 */

import type { ProviderConfig } from "../types/model-config.js";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ModelResponse {
	/** The model's text response */
	content: string;
	/** Model used for this call */
	model: string;
	/** Token usage stats (if available) */
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

/**
 * Call an OpenAI-compatible chat/completions API.
 *
 * Throws on network errors or non-2xx responses.
 * Returns null if API key is empty (graceful skip, not error).
 */
export async function callOpenAICompatible(
	provider: ProviderConfig,
	messages: ChatMessage[],
	overrides?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<ModelResponse> {
	// Skip if no API key — caller should fall back to demo
	if (!provider.apiKey || provider.apiKey.trim().length === 0) {
		return null as unknown as ModelResponse;
	}

	const model = overrides?.model ?? provider.defaultModel;
	const maxTokens = overrides?.maxTokens ?? provider.maxTokens;
	const temperature = overrides?.temperature ?? provider.temperature;

	const body = {
		model,
		messages,
		max_tokens: maxTokens,
		temperature,
	};

	const response = await fetch(provider.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${provider.apiKey}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Model API error (${response.status}): ${text.slice(0, 500)}`,
		);
	}

	const data = (await response.json()) as any;

	// OpenAI-compatible format: choices[0].message.content
	const content = data.choices?.[0]?.message?.content ?? "";
	const usage = data.usage
		? {
				promptTokens: data.usage.prompt_tokens ?? 0,
				completionTokens: data.usage.completion_tokens ?? 0,
				totalTokens: data.usage.total_tokens ?? 0,
			}
		: undefined;

	return { content, model, usage };
}

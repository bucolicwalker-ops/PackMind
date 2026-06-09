/**
 * Anthropic Messages API Client — calls Anthropic-compatible endpoints.
 *
 * DashScope's /apps/anthropic endpoint uses Anthropic's messages format:
 * - POST with system + messages array
 * - Response: content blocks (text + tool_use)
 * - Header: x-api-key instead of Authorization: Bearer
 *
 * This client handles the format difference from OpenAI chat/completions.
 */

import type { ProviderConfig } from "../types/model-config.js";

export interface AnthropicMessage {
	role: "user" | "assistant";
	content: string;
}

export interface AnthropicModelResponse {
	content: string;
	model: string;
	usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Call an Anthropic-compatible messages API.
 *
 * DashScope /apps/anthropic wraps Anthropic's API format.
 */
export async function callAnthropicCompatible(
	provider: ProviderConfig,
	systemPrompt: string,
	messages: AnthropicMessage[],
	overrides?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<AnthropicModelResponse> {
	if (!provider.apiKey || provider.apiKey.trim().length === 0) {
		return null as unknown as AnthropicModelResponse;
	}

	const model = overrides?.model ?? provider.defaultModel;
	const maxTokens = overrides?.maxTokens ?? provider.maxTokens;
	const temperature = overrides?.temperature ?? provider.temperature;

	const body = {
		model,
		max_tokens: maxTokens,
		temperature,
		system: systemPrompt,
		messages,
	};

	const response = await fetch(provider.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": provider.apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(
			`Anthropic API error (${response.status}): ${text.slice(0, 500)}`,
		);
	}

	const data = (await response.json()) as any;

	// Anthropic response format: content[0].text
	const contentBlocks = data.content ?? [];
	const textContent = contentBlocks
		.filter((b: any) => b.type === "text")
		.map((b: any) => b.text)
		.join("\n");

	const usage = data.usage
		? {
				inputTokens: data.usage.input_tokens ?? 0,
				outputTokens: data.usage.output_tokens ?? 0,
			}
		: undefined;

	return { content: textContent, model: data.model ?? model, usage };
}

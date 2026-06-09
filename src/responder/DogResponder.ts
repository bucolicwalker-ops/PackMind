/**
 * Dog Responder — generates a dog's response to a conversation context.
 *
 * TWO MODES:
 * - Real mode: Calls AI model API (GLM/Claude/etc) with L0 prompt + context.
 *   The model reads the conversation, decides what to say, who to @mention,
 *   and how to handle the ball — fully context-aware intelligence.
 *
 * - Demo mode (fallback): Mock responses based on personality.
 *   Activated when no API key is configured or when model call fails.
 *
 * Pattern borrowed from cat-coffee's invocation flow:
 * - Compile L0 prompt → build context → call model → parse response
 * - Response parsing extracts @mentions and ball actions
 */

import {
	type AnthropicMessage,
	callAnthropicCompatible,
} from "../model/anthropic-client.js";
import {
	getProvider,
	hasApiKey,
	loadModelConfig,
} from "../model/model-config-loader.js";
import {
	type ChatMessage,
	callOpenAICompatible,
} from "../model/openai-compatible-client.js";
import { dogRegistry } from "../registry/DogRegistry.js";
import type { DogConfig } from "../types/dog-breed.js";
import { createDogId, type DogId } from "../types/ids.js";
import type { Message } from "../types/thread.js";

export interface ResponderInput {
	dogConfig: DogConfig;
	l0Prompt: string;
	recentMessages: Message[];
	triggerContent: string;
}

export interface ResponderOutput {
	content: string;
	mentions: DogId[];
	ballAction: "pass" | "hold" | "return_to_creator";
	nextTarget?: DogId;
	holdReason?: string;
	holdNextStep?: string;
	holdWakeAfterMs?: number;
	/** Which mode produced this response */
	mode: "real" | "demo";
	/** Model used for real mode calls */
	modelUsed?: string;
}

// ─── Response Parser ───

/** Known dog IDs for @mention parsing */
const KNOWN_DOG_IDS = ["collie", "corgi", "gsd"];

/**
 * Parse a model response to extract @mentions and ball action.
 *
 * Protocol (from L0 prompt):
 * - Line-start @句柄 = ball pass to that dog
 * - "return_to_creator" / no @mention = ball returns to 铲屎官
 * - "hold_ball" keyword = hold for external conditions
 */
export function parseResponse(
	content: string,
	myDogId: string,
): {
	mentions: DogId[];
	ballAction: "pass" | "hold" | "return_to_creator";
	nextTarget?: DogId;
} {
	const mentions: DogId[] = [];
	let nextTarget: DogId | undefined;
	let ballAction: "pass" | "hold" | "return_to_creator" = "return_to_creator";

	// Extract line-start @mentions (A2A routing protocol)
	const lines = content.split("\n");
	for (const line of lines) {
		// Match @dogId patterns at line start (after optional whitespace/list prefix)
		const match = line.match(/^\s*-?\s*@(\w+)/);
		if (match && match[1]) {
			const mentionedId = match[1];
			if (KNOWN_DOG_IDS.includes(mentionedId) && mentionedId !== myDogId) {
				const dogId = createDogId(mentionedId);
				mentions.push(dogId);
				// First @mention at line start = ball pass target
				if (!nextTarget) {
					nextTarget = dogId;
				}
			}
		}
	}

	// Also scan for @mention patterns from dog config (e.g. @牧哥, @短腿, @铁铁)
	const allConfigs = dogRegistry.getAllConfigs();
	for (const [id, config] of Object.entries(allConfigs)) {
		if (id === myDogId) continue;
		for (const pattern of (config as any).mentionPatterns ?? []) {
			// Extract the handle part from pattern like "@牧哥"
			const handle = pattern.replace("@", "");
			// Check if this handle appears in content as a line-start @mention
			for (const line of lines) {
				const lineMatch = line.match(/^\s*-?\s*@/);
				if (lineMatch && line.includes(pattern)) {
					const dogId = createDogId(id);
					if (!mentions.includes(dogId)) {
						mentions.push(dogId);
						if (!nextTarget) {
							nextTarget = dogId;
						}
					}
				}
			}
		}
	}

	// Determine ball action
	if (nextTarget) {
		ballAction = "pass";
	} else if (
		content.toLowerCase().includes("hold_ball") ||
		content.includes("持球等待")
	) {
		ballAction = "hold";
	}

	return { mentions, ballAction, nextTarget };
}

// ─── Real Mode Responder ───

/**
 * Call AI model to generate a context-aware response.
 *
 * Flow:
 * 1. Build messages array: L0 prompt (system) + conversation context (user/assistant)
 * 2. Call provider API
 * 3. Parse response for @mentions + ball action
 * 4. Return structured ResponderOutput
 *
 * Falls back to demo mode if:
 * - No API key configured
 * - API call fails
 * - fallbackToDemo is true in model-config.json
 */
export async function callModelResponder(
	input: ResponderInput,
): Promise<ResponderOutput> {
	const { dogConfig, l0Prompt, recentMessages, triggerContent } = input;
	const dogId = dogConfig.id as string;
	const clientId = dogConfig.clientId;

	// Check if API key is available
	if (!hasApiKey(clientId)) {
		console.log(
			`[DogResponder] No API key for "${clientId}", falling back to demo mode`,
		);
		const demo = generateDemoResponse(input);
		return { ...demo, mode: "demo" };
	}

	const provider = getProvider(clientId)!;
	const config = loadModelConfig();

	// Detect API format: Anthropic-style endpoints vs OpenAI-style
	const isAnthropicFormat =
		provider.endpoint.includes("/anthropic") ||
		provider.endpoint.includes("anthropic-version");

	try {
		let responseContent: string;
		let responseModel: string;

		if (isAnthropicFormat) {
			// Anthropic Messages API: system prompt as separate field
			const anthropicMessages: AnthropicMessage[] = [];

			for (const msg of recentMessages) {
				if (msg.dogId) {
					anthropicMessages.push({
						role: "assistant",
						content: `[${msg.dogId}] ${msg.content}`,
					});
				} else {
					anthropicMessages.push({
						role: "user",
						content: `[铲屎官] ${msg.content}`,
					});
				}
			}
			// Add current trigger as the latest user message
			anthropicMessages.push({
				role: "user",
				content: triggerContent,
			});

			const response = await callAnthropicCompatible(
				provider,
				l0Prompt,
				anthropicMessages,
				{ model: dogConfig.defaultModel },
			);

			if (!response || !response.content) {
				console.log(
					"[DogResponder] Empty Anthropic response, falling back to demo",
				);
				const demo = generateDemoResponse(input);
				return { ...demo, mode: "demo" };
			}
			responseContent = response.content;
			responseModel = response.model;
		} else {
			// OpenAI-compatible chat/completions API
			const messages: ChatMessage[] = [{ role: "system", content: l0Prompt }];

			for (const msg of recentMessages) {
				if (msg.dogId) {
					messages.push({
						role: "assistant",
						content: `[${msg.dogId}] ${msg.content}`,
					});
				} else {
					messages.push({
						role: "user",
						content: `[铲屎官] ${msg.content}`,
					});
				}
			}
			messages.push({
				role: "user",
				content: triggerContent,
			});

			const response = await callOpenAICompatible(provider, messages, {
				model: dogConfig.defaultModel,
			});

			if (!response || !response.content) {
				console.log(
					"[DogResponder] Empty OpenAI response, falling back to demo",
				);
				const demo = generateDemoResponse(input);
				return { ...demo, mode: "demo" };
			}
			responseContent = response.content;
			responseModel = response.model;
		}

		// Parse response for @mentions and ball actions
		const parsed = parseResponse(responseContent, dogId);

		return {
			content: responseContent,
			mentions: parsed.mentions,
			ballAction: parsed.ballAction,
			nextTarget: parsed.nextTarget,
			mode: "real",
			modelUsed: responseModel,
		};
	} catch (err) {
		console.error(
			`[DogResponder] Model call failed: ${(err as Error).message}`,
		);
		if (config.fallbackToDemo) {
			const demo = generateDemoResponse(input);
			return { ...demo, mode: "demo" };
		}
		// If fallback disabled, return a minimal error response
		return {
			content: `${dogConfig.nickname} 遇到了技术问题，暂时无法回复。\n\n[${dogConfig.nickname}/${dogConfig.defaultModel}🐾]`,
			mentions: [],
			ballAction: "return_to_creator",
			mode: "demo",
		};
	}
}

// ─── Demo Mode Responder (fallback) ───

/**
 * Demo mode responder — generates personality-appropriate mock responses.
 * Each dog's response reflects its breed personality and follows
 * the A2A protocol (ends with a three-choice action).
 */
export function generateDemoResponse(input: ResponderInput): ResponderOutput {
	const { dogConfig, triggerContent } = input;
	const dogId = dogConfig.id as string;
	const nickname = dogConfig.nickname;

	const responses: Record<string, () => ResponderOutput> = {
		collie: () => ({
			content: `收到！我来分析一下这个问题。\n\n${triggerContent}——从架构角度看，我的建议是：先做最小能跑的版本，不要一开始就追求完整。\n\n做完后我会请铁铁 review 一下，确保质量没问题。\n\n[牧哥/glm-5.1🐾]`,
			mentions: [createDogId("gsd")],
			ballAction: "pass",
			nextTarget: createDogId("gsd"),
			mode: "demo",
		}),
		corgi: () => ({
			content: `嘿！短腿来啦！腿短但视野高 😄\n\n关于${triggerContent}——从设计角度看，我觉得用户体验是关键！功能再强大，如果看起来不好用，那也是白搭。\n\n我可以先画个简单的交互流程，然后让牧哥评估技术可行性。\n\n[短腿/glm-5.1🐾]`,
			mentions: [createDogId("collie")],
			ballAction: "pass",
			nextTarget: createDogId("collie"),
			mode: "demo",
		}),
		gsd: () => ({
			content: `铁铁 review 完毕。\n\n${triggerContent}——从质量角度看：\n1. 代码结构清晰 ✅\n2. 需要补充边界条件处理 ⚠️\n3. 建议加类型检查 ⚠️\n\n结论：放行，但建议牧哥补完上面两个 ⚠️ 点。\n\n[铁铁/glm-5.1🐾]`,
			mentions: [createDogId("collie")],
			ballAction: "pass",
			nextTarget: createDogId("collie"),
			mode: "demo",
		}),
	};

	const responder = responses[dogId];
	if (!responder) {
		return {
			content: `${nickname} 收到了。我来看看这个问题。\n\n[${nickname}/glm-5.1🐾]`,
			mentions: [],
			ballAction: "return_to_creator",
			mode: "demo",
		};
	}

	return responder();
}

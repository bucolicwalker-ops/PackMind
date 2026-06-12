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
	type KnownDog,
	parseSelfBoundaryHandoff,
} from "../a2a/self-boundary.js";
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
import { redactSecrets } from "../model/redact.js";
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
	/**
	 * True when the model was EXPECTED to run but failed (empty response /
	 * exception) and we fell back to demo. Distinct from intentional demo
	 * (no API key configured). Surfaces silent failures so they're visible.
	 */
	degraded?: boolean;
	/** Human-readable reason for the degrade (only set when degraded=true). */
	degradeReason?: string;
}

/**
 * Build a SAFE degraded response when the model was expected to run but failed.
 *
 * Why not reuse the demo template's ball action (铲屎官 insight — fault tolerance):
 * The demo template hard-codes a pass target (e.g. corgi → collie). On a real
 * failure, honoring that fake pass would DISTORT the collaboration chain with
 * fabricated routing. Like a catch block: on failure, stop safely (return to
 * creator) rather than fabricate forward progress. The text is still the demo
 * persona reply (so the UI isn't blank), but the ball SAFELY returns to 铲屎官.
 */
export function buildDegradedResponse(
	input: ResponderInput,
	reason: string,
): ResponderOutput {
	const demo = generateDemoResponse(input);
	return {
		...demo,
		// Override the demo template's fabricated pass — fail safe, don't fake routing.
		ballAction: "return_to_creator",
		nextTarget: undefined,
		mentions: [],
		mode: "demo",
		degraded: true,
		degradeReason: reason,
	};
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
		if (match?.[1]) {
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
		for (const pattern of config.mentionPatterns) {
			// Check if this pattern appears in content as a line-start @mention
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

	// L1 手段1.3 — structured self-boundary: if the dog didn't line-start @ anyone
	// but EXPLICITLY declared "需要谁：@X" in its self-boundary block, honor that as a
	// real handoff. Higher precision than L2's keyword guess — the dog named X itself,
	// so this is its own autonomous judgment, just wired to the actual pass mechanism.
	if (!nextTarget) {
		const knownDogs: KnownDog[] = Object.values(allConfigs).map((cfg) => ({
			id: cfg.id,
			nickname: cfg.nickname,
			mentionPatterns: cfg.mentionPatterns,
		}));
		const boundaryHandoff = parseSelfBoundaryHandoff(
			content,
			myDogId,
			knownDogs,
		);
		if (boundaryHandoff) {
			nextTarget = boundaryHandoff.to;
			if (!mentions.includes(boundaryHandoff.to)) {
				mentions.push(boundaryHandoff.to);
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

	const provider = getProvider(clientId);
	if (!provider) {
		return buildDegradedResponse(input, "provider 未配置");
	}
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
				console.warn(
					`[DogResponder] DEGRADED: empty Anthropic response for "${dogId}" — failing safe (return to creator)`,
				);
				return buildDegradedResponse(input, "模型返回空响应 (Anthropic)");
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
				console.warn(
					`[DogResponder] DEGRADED: empty OpenAI response for "${dogId}" — failing safe (return to creator)`,
				);
				return buildDegradedResponse(input, "模型返回空响应 (OpenAI)");
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
		const msg = redactSecrets((err as Error).message);
		console.error(
			`[DogResponder] DEGRADED: model call failed for "${dogId}": ${msg} — failing safe`,
		);
		if (config.fallbackToDemo) {
			return buildDegradedResponse(input, `模型调用失败: ${msg}`);
		}
		// Fallback disabled — minimal error response, also fails safe to creator.
		return {
			content: `${dogConfig.nickname} 遇到了技术问题，暂时无法回复。\n\n[${dogConfig.nickname}/${dogConfig.defaultModel}🐾]`,
			mentions: [],
			ballAction: "return_to_creator",
			mode: "demo",
			degraded: true,
			degradeReason: `模型调用失败: ${msg}`,
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

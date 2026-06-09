/**
 * A2A Routes — API endpoints for ball-passing and agent invocation.
 *
 * V2: Supports real AI model calls with graceful demo fallback.
 * When a dog's response contains @mentions, the system auto-invokes
 * the mentioned dog, forming a collaboration chain (bounded by maxDepth).
 */

import type { FastifyInstance } from "fastify";
import { ballTracker } from "../a2a/BallTracker.js";
import { loadModelConfig } from "../model/model-config-loader.js";
import { dogRegistry } from "../registry/DogRegistry.js";
import {
	callModelResponder,
	type ResponderOutput,
} from "../responder/DogResponder.js";
import { messageStore } from "../stores/MessageStore.js";
import { threadStore } from "../stores/ThreadStore.js";
import { createDogId, DogId } from "../types/ids.js";
import { createThreadId, createUserId } from "../types/thread.js";
import { holdBallSchema, invokeSchema } from "./schemas.js";

const DEFAULT_USER = createUserId("default-user");

/**
 * Internal: invoke a dog and generate response.
 * Shared between direct invoke and auto-chain invoke.
 */
async function invokeDog(
	threadIdStr: string,
	dogIdStr: string,
	triggerContent: string,
	currentDepth: number,
): Promise<{
	response: ResponderOutput;
	responseMessage: any;
	ballActionResult: any;
	chainInvokes: Array<{
		dogId: string;
		dogName: string;
		response: any;
		ballAction: any;
	}>;
}> {
	const threadId = createThreadId(threadIdStr);
	const dogId = createDogId(dogIdStr);
	const dogEntry = dogRegistry.getOrThrow(dogId);
	const config = loadModelConfig();

	// Acquire ball
	ballTracker.acquire(threadId, dogId, triggerContent);
	threadStore.addParticipant(threadId, dogId);

	// Compile L0 prompt
	const { compileL0 } = await import("../prompt/compile-l0.js");
	const l0Prompt = compileL0({ dogId: dogIdStr });

	// Get recent messages for context
	const recentMessages = messageStore.getRecent(threadId, 10);

	// Call real model (with demo fallback)
	const response = await callModelResponder({
		dogConfig: dogEntry.config,
		l0Prompt,
		recentMessages,
		triggerContent,
	});

	// Store the dog's response as a message
	const responseMessage = messageStore.append(
		threadId,
		DEFAULT_USER,
		dogId,
		response.content,
	);

	// Handle ball action
	let ballActionResult: any = null;
	const chainInvokes: Array<{
		dogId: string;
		dogName: string;
		response: any;
		ballAction: any;
	}> = [];

	if (response.ballAction === "pass" && response.nextTarget) {
		ballTracker.release(threadId);
		ballTracker.acquire(
			threadId,
			response.nextTarget,
			`${dogEntry.config.nickname} passed ball`,
		);
		ballActionResult = {
			action: "pass",
			from: dogId,
			to: response.nextTarget,
			toName: dogRegistry.getOrThrow(response.nextTarget).config.nickname,
		};

		// Auto-chain: if within depth limit, invoke the next dog automatically
		if (currentDepth < config.maxInvokeChainDepth) {
			const nextDogId = response.nextTarget as string;
			const nextDogName = dogRegistry.getOrThrow(response.nextTarget).config
				.nickname;
			const chainTrigger = `${dogEntry.config.nickname} @${nextDogName}: 请接球`;

			const chainResult = await invokeDog(
				threadIdStr,
				nextDogId,
				chainTrigger,
				currentDepth + 1,
			);

			chainInvokes.push({
				dogId: nextDogId,
				dogName: nextDogName,
				response: chainResult.responseMessage,
				ballAction: chainResult.ballActionResult,
			});

			// Append deeper chain results
			chainInvokes.push(...chainResult.chainInvokes);

			// Final ball state reflects the last dog in the chain
			ballActionResult = chainResult.ballActionResult;
		}
	} else if (response.ballAction === "hold") {
		ballTracker.hold(
			threadId,
			dogId,
			response.holdReason ?? "waiting",
			response.holdNextStep ?? "check and proceed",
			response.holdWakeAfterMs ?? 300000,
		);
		ballActionResult = { action: "hold", reason: response.holdReason };
	} else {
		ballTracker.release(threadId);
		ballActionResult = { action: "return_to_creator" };
	}

	return { response, responseMessage, ballActionResult, chainInvokes };
}

export function registerA2aRoutes(app: FastifyInstance): void {
	/** Invoke a dog to respond in a thread */
	app.post("/api/a2a/invoke", async (request, reply) => {
		const parsed = invokeSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid request", details: parsed.error.flatten() });
		}
		const {
			threadId: threadIdStr,
			dogId: dogIdStr,
			content,
			autoRespond,
		} = parsed.data;

		const threadId = createThreadId(threadIdStr);
		const thread = threadStore.tryGet(threadId);
		if (!thread) {
			return reply.status(404).send({ error: "Thread not found" });
		}

		const dogId = createDogId(dogIdStr);
		if (!dogRegistry.tryGet(dogId)) {
			return reply.status(404).send({ error: `Unknown dogId: ${dogIdStr}` });
		}

		// Store trigger message if provided
		if (content) {
			messageStore.append(threadId, DEFAULT_USER, null, content);
		}

		const shouldAutoRespond = autoRespond ?? true;

		if (!shouldAutoRespond) {
			// Just acquire ball, no response generation
			ballTracker.acquire(threadId, dogId, content ?? "invoked by user");
			threadStore.addParticipant(threadId, dogId);
			return reply.status(200).send({
				dogId: dogIdStr,
				threadId: threadIdStr,
				ballState: ballTracker.get(threadId),
				message: `🐕 ${dogRegistry.getOrThrow(dogId).config.nickname} 已被唤醒（等待手动回复）`,
			});
		}

		// Invoke with auto-response + chain
		const triggerContent = content ?? "direct invocation";
		const result = await invokeDog(threadIdStr, dogIdStr, triggerContent, 0);

		return reply.status(200).send({
			dogId: dogIdStr,
			dogName: dogRegistry.getOrThrow(createDogId(dogIdStr)).config.nickname,
			threadId: threadIdStr,
			ballState: ballTracker.get(threadId),
			response: result.responseMessage,
			ballAction: result.ballActionResult,
			mode: result.response.mode,
			modelUsed: result.response.modelUsed,
			chainInvokes: result.chainInvokes,
			message: `🐕 ${dogRegistry.getOrThrow(createDogId(dogIdStr)).config.nickname} 已被唤醒并回复 (${result.response.mode} mode)`,
		});
	});

	/** Dog holds the ball while waiting for external conditions */
	app.post("/api/a2a/hold-ball", async (request, reply) => {
		const parsed = holdBallSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid request", details: parsed.error.flatten() });
		}
		const {
			threadId: threadIdStr,
			dogId: dogIdStr,
			reason,
			nextStep,
			wakeAfterMs,
		} = parsed.data;

		const threadId = createThreadId(threadIdStr);
		const dogId = createDogId(dogIdStr);

		try {
			const state = ballTracker.hold(
				threadId,
				dogId,
				reason,
				nextStep,
				wakeAfterMs,
			);
			return reply.status(200).send({
				ballState: state,
				message: `🐕 ${dogRegistry.getOrThrow(dogId).config.nickname} 持球等待：${reason}`,
			});
		} catch (err) {
			return reply.status(409).send({ error: (err as Error).message });
		}
	});

	/** Check ball state for a thread */
	app.get<{ Params: { threadId: string } }>(
		"/api/a2a/ball-state/:threadId",
		async (request, reply) => {
			const { threadId } = request.params;
			const state = ballTracker.get(createThreadId(threadId));
			if (!state) {
				return reply.status(200).send({ holder: null, message: "球在地上" });
			}
			const holderName = state.holder
				? dogRegistry.getOrThrow(state.holder).config.nickname
				: null;
			return reply.status(200).send({
				holder: state.holder,
				holderName,
				reason: state.reason,
				acquiredAt: state.acquiredAt,
				wakeAfterMs: state.wakeAfterMs,
				nextStep: state.nextStep,
			});
		},
	);
}

/**
 * A2A Routes — API endpoints for ball-passing and agent invocation.
 *
 * V2: Supports real AI model calls with graceful demo fallback.
 * When a dog's response contains @mentions, the system auto-invokes
 * the mentioned dog, forming a collaboration chain (bounded by maxDepth).
 */

import type { FastifyInstance } from "fastify";
import { ballTracker } from "../a2a/BallTracker.js";
import {
	buildChainPath,
	computeOwnBallAction,
	computeUnvisitedMentions,
	type OwnBallAction,
} from "../a2a/ball-action.js";
import {
	detectMissedHandoff,
	selectMissedHandoffCandidate,
} from "../a2a/missed-handoff.js";
import { loadModelConfig } from "../model/model-config-loader.js";
import { dogRegistry } from "../registry/DogRegistry.js";
import {
	callModelResponder,
	type ResponderOutput,
} from "../responder/DogResponder.js";
import { messageStore } from "../stores/MessageStore.js";
import { threadStore } from "../stores/ThreadStore.js";
import { createDogId } from "../types/ids.js";
import { createThreadId, createUserId, type Message } from "../types/thread.js";
import { holdBallSchema, invokeSchema } from "./schemas.js";

/** One entry in the auto-invoke chain — a dog that received & answered the ball. */
interface ChainInvokeEntry {
	dogId: string;
	dogName: string;
	response: Message;
	ballAction: OwnBallAction;
	degraded?: boolean;
	degradeReason?: string;
}

/** Result of invoking a dog (with its auto-invoke sub-chain). */
interface InvokeResult {
	response: ResponderOutput;
	responseMessage: Message;
	/** Final ball state after the WHOLE sub-chain settles (reflects chain tail). */
	ballActionResult: OwnBallAction;
	/** This dog's OWN ball decision at this hop — never overwritten by recursion. */
	ownBallAction: OwnBallAction;
	chainInvokes: ChainInvokeEntry[];
}

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
): Promise<InvokeResult> {
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
	let ballActionResult: OwnBallAction | null = null;
	const chainInvokes: ChainInvokeEntry[] = [];

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
			const nextDogEntry = dogRegistry.getOrThrow(response.nextTarget);
			const nextDogName = nextDogEntry.config.nickname;
			const nextStrengths = nextDogEntry.config.teamStrengths.join("、");
			// Thick handoff trigger (铲屎官 found the thin "请接球" caused role-confusion +
			// no convergence): anchor the receiver's identity + task (do REAL work, don't
			// parrot the previous turn) and give a stop rule (all domains covered → 需要谁：无).
			const chainTrigger = `${dogEntry.config.nickname}把球传给你了。**你现在是${nextDogName}**，用你的专长（${nextStrengths}）做你那一部分的**实质工作**——看上面的对话历史了解需求，别复述上一棒的话、别空手把球传走，先拿出你自己的东西。做完后按【自我边界】判断：还缺别的专长就 @ 对应的狗；三方专长都覆盖到了，就写「需要谁：无」把球收回铲屎官，别为传而传。`;

			const chainResult = await invokeDog(
				threadIdStr,
				nextDogId,
				chainTrigger,
				currentDepth + 1,
			);

			// Record nextDog's OWN hop decision (ownBallAction), NOT the chain-tail
			// state (ballActionResult). The latter is overwritten by deeper recursion
			// and would mislabel every hop with the same final value.
			chainInvokes.push({
				dogId: nextDogId,
				dogName: nextDogName,
				response: chainResult.responseMessage,
				ballAction: chainResult.ownBallAction,
				degraded: chainResult.response.degraded === true,
				degradeReason: chainResult.response.degradeReason,
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

	// ownBallAction = this dog's decision at THIS hop, captured independently of
	// recursion (which overwrites ballActionResult with the chain-tail state).
	const ownBallAction = computeOwnBallAction(
		response.ballAction,
		dogId,
		response.nextTarget,
		response.nextTarget
			? dogRegistry.getOrThrow(response.nextTarget).config.nickname
			: undefined,
		response.holdReason,
	);

	return {
		response,
		responseMessage,
		ballActionResult,
		ownBallAction,
		chainInvokes,
	};
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

		const entryName = dogRegistry.getOrThrow(createDogId(dogIdStr)).config
			.nickname;

		// 显式@必达 (guaranteed delivery): the entry dog auto-chains only to its FIRST @.
		// Any dog it EXPLICITLY @'d that the chain never reached gets a turn here — so a
		// declared need (牧哥 @铁铁 for security审查) is never silently dropped just because
		// it wasn't the first @. See ball-action.computeUnvisitedMentions.
		const visitedDogIds = [
			dogIdStr,
			...result.chainInvokes.map((c) => String(c.dogId)),
		];
		const unvisited = computeUnvisitedMentions(
			result.response.mentions.map(String),
			visitedDogIds,
		);
		for (const missedDogId of unvisited) {
			const missedName = dogRegistry.getOrThrow(createDogId(missedDogId)).config
				.nickname;
			const sweepTrigger = `${entryName}点名要你（${missedName}）做你那部分专长——前面的链没走到你，现在补上、别漏。看对话历史了解需求，拿出你的实质工作。`;
			const sweepResult = await invokeDog(
				threadIdStr,
				missedDogId,
				sweepTrigger,
				1,
			);
			result.chainInvokes.push(
				{
					dogId: missedDogId,
					dogName: missedName,
					response: sweepResult.responseMessage,
					ballAction: sweepResult.ownBallAction,
					degraded: sweepResult.response.degraded === true,
					degradeReason: sweepResult.response.degradeReason,
				},
				...sweepResult.chainInvokes,
			);
		}

		// chainPath: the FULL ball-passing route (A — make passes visible at top level).
		// Each element is one hop; the whole array is the collaboration trail.
		const chainPath = buildChainPath(
			result.ownBallAction,
			entryName,
			result.chainInvokes,
		);

		// Three coherent ball views, no contradiction (砚砚 review P1):
		//  - ballAction: the ENTRY dog's own first-hop decision (not chain tail).
		//    Was ballActionResult (chain tail), which contradicted chainPath.
		//  - chainPath:  every hop the ball actually took.
		//  - ballState:  who holds the ball NOW (chain-tail resting state).
		// Surface degraded fallback so callers/UI aren't fooled by a silent demo.
		const degraded = result.response.degraded === true;

		// L2 missed-handoff detection (see docs/autonomous-collaboration-design.md §4):
		// Scan the dog that ENDED the chain — entry if it never passed, else the chain
		// TAIL — for "talked about another specialty but didn't hand off". Previously
		// gated on chainPath.length===0, so only hop 0 was covered and a multi-hop
		// chain's last dog escaped L2 entirely. A return-to-creator dog has no
		// successful outgoing @, so alreadyMentioned is empty.
		const tailHop = result.chainInvokes.at(-1);
		const missedHandoffTarget = selectMissedHandoffCandidate(
			{
				content: result.response.content,
				dogId: dogIdStr,
				action: result.ownBallAction.action,
				degraded,
			},
			tailHop
				? {
						content: tailHop.response.content,
						dogId: String(tailHop.dogId),
						action: tailHop.ballAction.action,
						degraded: tailHop.degraded === true,
					}
				: null,
		);
		const missedHandoff = missedHandoffTarget
			? detectMissedHandoff(
					missedHandoffTarget.content,
					missedHandoffTarget.dogId,
					false,
					[],
				)
			: null;

		return reply.status(200).send({
			dogId: dogIdStr,
			dogName: entryName,
			threadId: threadIdStr,
			ballState: ballTracker.get(threadId),
			response: result.responseMessage,
			ballAction: result.ownBallAction,
			chainPath,
			mode: result.response.mode,
			modelUsed: result.response.modelUsed,
			degraded,
			degradeReason: result.response.degradeReason,
			chainInvokes: result.chainInvokes,
			missedHandoff,
			message: degraded
				? `⚠️ ${entryName} 模型调用降级（${result.response.degradeReason}）— 已安全回传铲屎官`
				: missedHandoff
					? `🐕 ${entryName} 已回复。💡 提到了${missedHandoff.toName}的专长（${missedHandoff.matchedKeyword}）但没传球 — 要叫${missedHandoff.toName}吗？`
					: `🐕 ${entryName} 已被唤醒并回复 (${result.response.mode} mode)`,
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

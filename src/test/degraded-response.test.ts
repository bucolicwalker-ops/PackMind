/**
 * Degraded-response fault-tolerance tests.
 *
 * 铲屎官 directive: we can't trust the model to succeed 100% of the time, so we
 * must DEFEND against failures (empty response / exception) like a try/catch.
 *
 * The critical invariant: on a real-model failure we fall back to demo TEXT,
 * but we must NOT honor the demo template's hard-coded pass target — that would
 * fabricate routing and distort the collaboration chain. A degraded response
 * must FAIL SAFE: ball returns to creator, no fake @mention.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildDegradedResponse,
	type ResponderInput,
} from "../responder/DogResponder.js";
import type { DogConfig } from "../types/dog-breed.js";
import { createDogId } from "../types/ids.js";

function makeInput(id: string): ResponderInput {
	const config: DogConfig = {
		id: createDogId(id),
		breedName: "柯基",
		displayName: "柯基/短腿",
		nickname: "短腿",
		roleDescription: "设计师",
		personality: "活泼",
		avatar: "corgi.svg",
		color: "#F6D365",
		mentionPatterns: ["@短腿"],
		defaultModel: "qwen3.7-plus",
		clientId: "dashscope",
		teamStrengths: ["视觉"],
		caution: [],
		restrictions: [],
	};
	return {
		dogConfig: config,
		l0Prompt: "",
		recentMessages: [],
		triggerContent: "test",
	};
}

describe("buildDegradedResponse (fault tolerance)", () => {
	it("fails safe: ball returns to creator, never a fabricated pass", () => {
		// corgi's demo template hard-codes a pass to collie. A degrade MUST NOT
		// honor that — otherwise a model failure silently fabricates routing.
		const out = buildDegradedResponse(makeInput("corgi"), "模型返回空响应");
		assert.equal(out.ballAction, "return_to_creator");
		assert.equal(out.nextTarget, undefined);
		assert.deepEqual(out.mentions, []);
	});

	it("flags degraded=true with a reason (visibility)", () => {
		const out = buildDegradedResponse(
			makeInput("corgi"),
			"模型调用失败: timeout",
		);
		assert.equal(out.degraded, true);
		assert.equal(out.degradeReason, "模型调用失败: timeout");
		assert.equal(out.mode, "demo");
	});

	it("still returns demo persona TEXT so the UI is not blank", () => {
		const out = buildDegradedResponse(makeInput("corgi"), "x");
		assert.ok(out.content.length > 0);
	});

	it("fails safe even for an unknown dog (generic demo path)", () => {
		const out = buildDegradedResponse(makeInput("husky"), "y");
		assert.equal(out.ballAction, "return_to_creator");
		assert.equal(out.nextTarget, undefined);
		assert.equal(out.degraded, true);
	});
});

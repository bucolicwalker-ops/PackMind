/**
 * parseResponse integration tests — L1 手段1.3 wiring.
 *
 * Confirms the structured self-boundary declaration ("需要谁：@X") actually DRIVES
 * the ball-passing chain: parseResponse turns it into a pass + nextTarget, so the
 * auto-chain in a2a.ts proceeds to X. Precedence: an explicit line-start @ (手段1.1)
 * still wins; the boundary field only fills in when the model didn't line-start @.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { initDogRegistry } from "../config/dog-config-loader.js";
import { parseResponse } from "../responder/DogResponder.js";

describe("parseResponse — self-boundary handoff (L1 手段1.3)", () => {
	before(() => {
		// parseResponse resolves teammate handles via the registry.
		initDogRegistry();
	});

	it("turns 需要谁：@corgi into a real pass when there is no line-start @", () => {
		const content = [
			"架构我定好了，整体是分层设计。",
			"",
			"【自我边界】",
			"- 我能搞定：系统架构、技术选型",
			"- 需要谁：@corgi 视觉部分交给短腿",
		].join("\n");
		const out = parseResponse(content, "collie");
		assert.equal(out.ballAction, "pass");
		assert.equal(out.nextTarget, "corgi");
		assert.ok(out.mentions.map(String).includes("corgi"));
	});

	it("lets an explicit line-start @ win over the self-boundary field", () => {
		const content = [
			"架构定好了。",
			"",
			"@gsd",
			"铁铁，麻烦你把质量关。",
			"",
			"【自我边界】",
			"- 需要谁：@corgi", // conflicting field — line-start @gsd must still win
		].join("\n");
		const out = parseResponse(content, "collie");
		assert.equal(out.nextTarget, "gsd");
	});

	it("keeps the ball when the dog declares 需要谁：无", () => {
		const content = [
			"架构定好了，方案完整，我自己能收尾。",
			"",
			"【自我边界】",
			"- 我能搞定：全部",
			"- 需要谁：无",
		].join("\n");
		const out = parseResponse(content, "collie");
		assert.equal(out.ballAction, "return_to_creator");
		assert.equal(out.nextTarget, undefined);
	});
});

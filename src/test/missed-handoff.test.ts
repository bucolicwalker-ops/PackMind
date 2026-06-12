/**
 * Missed-handoff detector tests (L2 fallback).
 *
 * Locks in the core heuristic: detect "talked about another dog's specialty
 * but didn't @ them" — the system-side remediation for when the model fails to
 * hand off autonomously. See docs/autonomous-collaboration-design.md §4.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectMissedHandoff } from "../a2a/missed-handoff.js";

describe("detectMissedHandoff", () => {
	it("flags a missed handoff: 牧哥 talks visual but doesn't @ 短腿", () => {
		// The real-world case: 架构师 says "视觉部分需要专业设计" but doesn't @ corgi.
		const out = detectMissedHandoff(
			"架构我定好了。接下来视觉部分需要专业的设计和交互体验。",
			"collie",
			false, // didn't pass
			[],
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
		assert.equal(out.toName, "短腿");
	});

	it("returns null when the dog already passed the ball", () => {
		// Chain is moving — nothing to remediate.
		const out = detectMissedHandoff(
			"架构定好了。\n@corgi\n短腿来做视觉。",
			"collie",
			true, // already passed
			["corgi"],
		);
		assert.equal(out, null);
	});

	it("returns null when the missed dog was already @-mentioned", () => {
		const out = detectMissedHandoff(
			"视觉交给设计师。",
			"collie",
			false,
			["corgi"], // already mentioned corgi at line-start
		);
		assert.equal(out, null);
	});

	it("does not suggest handing off to yourself", () => {
		// 短腿 talking about visual (its own specialty) → no self-handoff.
		const out = detectMissedHandoff(
			"我来设计视觉风格、配色和交互。",
			"corgi",
			false,
			[],
		);
		assert.equal(out, null);
	});

	it("returns null when no other specialty is mentioned", () => {
		const out = detectMissedHandoff(
			"我已经把架构和技术选型都定好了，方案完整。",
			"collie",
			false,
			[],
		);
		// 架构/技术选型 are 牧哥's OWN specialty → not a missed handoff.
		assert.equal(out, null);
	});

	it("picks the strongest signal when multiple specialties appear", () => {
		// Mentions both 安全(gsd: 1 hit) and 视觉+设计+交互(corgi: 3 hits) → corgi wins.
		const out = detectMissedHandoff(
			"需要考虑安全性，更重要的是视觉设计和交互的用户体验。",
			"collie",
			false,
			[],
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
		assert.ok(out.hitCount >= 2);
	});

	it("flags 安全/审查 → 铁铁", () => {
		const out = detectMissedHandoff(
			"功能实现了，但需要做安全审查和质量把关。",
			"collie",
			false,
			[],
		);
		assert.ok(out);
		assert.equal(out.to, "gsd");
		assert.equal(out.toName, "铁铁");
	});
});

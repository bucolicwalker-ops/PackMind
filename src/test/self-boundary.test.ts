/**
 * Self-boundary handoff parser tests (L1 手段1.3 — structured self-boundary).
 *
 * Locks in the higher-precision counterpart to L2's keyword heuristic: when a
 * dog FILLS IN the structured "需要谁：@X" field, that is an EXPLICIT, self-
 * declared handoff — parse it and route to X. The dog's own judgment drives the
 * chain (autonomy preserved); the system just wires the declaration to a real @.
 * See docs/autonomous-collaboration-design.md §4 (L1 手段1.3).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type KnownDog,
	parseSelfBoundaryHandoff,
} from "../a2a/self-boundary.js";

const DOGS: KnownDog[] = [
	{
		id: "collie",
		nickname: "牧哥",
		mentionPatterns: ["@牧哥", "@边牧", "@collie"],
	},
	{
		id: "corgi",
		nickname: "短腿",
		mentionPatterns: ["@短腿", "@柯基", "@corgi"],
	},
	{ id: "gsd", nickname: "铁铁", mentionPatterns: ["@铁铁", "@德牧", "@gsd"] },
];

/** Wrap a 需要谁 value into a realistic reply with a 自我边界 block. */
function reply(need: string): string {
	return [
		"架构我定好了，整体方案是分层设计。",
		"",
		"【自我边界】",
		"- 我能搞定：系统架构、技术选型",
		`- 需要谁：${need}`,
	].join("\n");
}

describe("parseSelfBoundaryHandoff", () => {
	it("routes from an explicit @id in the 需要谁 field", () => {
		const out = parseSelfBoundaryHandoff(
			reply("@corgi 视觉部分交给短腿"),
			"collie",
			DOGS,
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
		assert.equal(out.toName, "短腿");
	});

	it("resolves a bare nickname in the 需要谁 field", () => {
		const out = parseSelfBoundaryHandoff(
			reply("短腿来做视觉设计"),
			"collie",
			DOGS,
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
	});

	it("resolves a mentionPattern handle (@短腿)", () => {
		const out = parseSelfBoundaryHandoff(reply("@短腿"), "collie", DOGS);
		assert.ok(out);
		assert.equal(out.to, "corgi");
	});

	it("returns null when the dog declares 需要谁：无 (goes solo)", () => {
		const out = parseSelfBoundaryHandoff(reply("无"), "collie", DOGS);
		assert.equal(out, null);
	});

	it("returns null when 需要谁 leads with a negative even if continued", () => {
		const out = parseSelfBoundaryHandoff(
			reply("无，这事我能独立完成"),
			"collie",
			DOGS,
		);
		assert.equal(out, null);
	});

	it("returns null when 需要谁 says 不需要别人", () => {
		const out = parseSelfBoundaryHandoff(
			reply("不需要别人，我自己来"),
			"collie",
			DOGS,
		);
		assert.equal(out, null);
	});

	it("returns null when there is no 自我边界 / 需要谁 field at all", () => {
		const out = parseSelfBoundaryHandoff(
			"架构定好了，方案完整，没什么要补充的。",
			"collie",
			DOGS,
		);
		assert.equal(out, null);
	});

	it("returns null on empty content", () => {
		assert.equal(parseSelfBoundaryHandoff("", "collie", DOGS), null);
	});

	it("never hands off to self", () => {
		// 短腿 writing 需要谁：@corgi (itself) is nonsensical — no self-handoff.
		const out = parseSelfBoundaryHandoff(reply("@corgi"), "corgi", DOGS);
		assert.equal(out, null);
	});

	it("only the 需要谁 field decides — ignores casual body mentions", () => {
		// Body name-drops 牧哥, but the declared need is 铁铁 → route to gsd.
		const content = [
			"刚才牧哥提的架构思路我采纳了。",
			"",
			"【自我边界】",
			"- 我能搞定：视觉风格、配色",
			"- 需要谁：@铁铁 做最后的质量把关",
		].join("\n");
		const out = parseSelfBoundaryHandoff(content, "corgi", DOGS);
		assert.ok(out);
		assert.equal(out.to, "gsd");
	});

	it("accepts a half-width colon (需要谁: @corgi)", () => {
		const content = ["【自我边界】", "- 需要谁: @corgi"].join("\n");
		const out = parseSelfBoundaryHandoff(content, "collie", DOGS);
		assert.ok(out);
		assert.equal(out.to, "corgi");
	});

	it("returns null when a need is named but no known teammate matches", () => {
		const out = parseSelfBoundaryHandoff(reply("找个产品经理"), "collie", DOGS);
		assert.equal(out, null);
	});

	// ── 砚砚 review P2: ambiguous/hedged value — locks the deliberate decision ──

	it("honors a hedged-but-named need (可能要@corgi → still routes to 短腿)", () => {
		// DELIBERATE: the dog NAMED a teammate in the structured field, even if hedged.
		// We honor it (give 短腿 a chance) — only EXPLICIT negatives (无/不需要) keep the
		// ball. Suppressing hedged-but-named needs would contradict the vision
		// ("提到需要谁就 @ 谁；给队友一个机会 > 静默跳过"). Locks this edge case.
		const out = parseSelfBoundaryHandoff(
			reply("可能要@corgi 看看视觉"),
			"collie",
			DOGS,
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
	});

	it("still routes when a soft verb leads the field (先@短腿看看 → 短腿)", () => {
		// Guards against over-broadening SOLO_LEAD: 先/考虑/可能/看看 are NOT solo signals —
		// "先@短腿看看" is a real (soft) handoff. Only 无/没有/不需要/独立/自己 mean "keep the
		// ball". This test FAILS if those hedge-words get added to SOLO_LEAD — catching that
		// false-negative regression (砚砚 review: declined the SOLO_LEAD extension for this).
		const out = parseSelfBoundaryHandoff(
			reply("先@短腿看看视觉风格"),
			"collie",
			DOGS,
		);
		assert.ok(out);
		assert.equal(out.to, "corgi");
	});
});

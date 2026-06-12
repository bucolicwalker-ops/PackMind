/**
 * Missed-Handoff Detector — L2 fallback for the autonomous collaboration chain.
 *
 * See docs/autonomous-collaboration-design.md §4 (L2: 兜底补救).
 *
 * The problem: a全能 model often MENTIONS another specialty ("视觉部分需要专业
 * 设计") but doesn't actually @ that teammate — so the ball-passing chain that
 * SHOULD happen silently doesn't. We can't FORCE the model to @ (LLM autonomy
 * is probabilistic). Instead the SYSTEM detects "talked about X's specialty but
 * didn't hand off to X" and surfaces a suggestion — detection + remediation,
 * not coercion.
 *
 * This is a PURE, model-independent heuristic: scan for specialty keywords that
 * belong to OTHER dogs and flag the strongest un-handed-off one.
 */

import type { DogId } from "../types/ids.js";
import { createDogId } from "../types/ids.js";

/** A specialty domain owned by one dog, with the keywords that signal it. */
interface SpecialtyDomain {
	dogId: string;
	dogName: string;
	/** Keywords whose presence suggests this dog's specialty is involved. */
	keywords: string[];
}

/**
 * Specialty map — which dog owns which domain, and the trigger keywords.
 * Sourced from dog-config teamStrengths but inlined here as the detection
 * vocabulary (kept explicit so the heuristic is auditable & testable).
 */
const SPECIALTY_DOMAINS: SpecialtyDomain[] = [
	{
		dogId: "collie",
		dogName: "牧哥",
		keywords: [
			"架构",
			"技术选型",
			"系统设计",
			"数据模型",
			"接口设计",
			"技术方案",
		],
	},
	{
		dogId: "corgi",
		dogName: "短腿",
		keywords: [
			"视觉",
			"设计",
			"UI",
			"交互",
			"配色",
			"用户体验",
			"界面",
			"美观",
			"排版",
		],
	},
	{
		dogId: "gsd",
		dogName: "铁铁",
		keywords: [
			"安全",
			"审查",
			"review",
			"质量",
			"测试",
			"规范",
			"漏洞",
			"把关",
		],
	},
];

/** A suggested handoff the dog mentioned but didn't actually @. */
export interface MissedHandoff {
	/** Who the ball should arguably go to. */
	to: DogId;
	toName: string;
	/** The specialty keyword that triggered the suggestion (for explainability). */
	matchedKeyword: string;
	/** How many of that dog's keywords appeared (stronger = higher confidence). */
	hitCount: number;
}

/**
 * Detect a missed handoff: the dog talked about ANOTHER dog's specialty but
 * didn't hand the ball to them.
 *
 * @param content        the dog's reply text
 * @param myDogId        the replying dog (we never suggest handing off to self)
 * @param alreadyPassed  true if the dog already passed the ball (then no suggestion)
 * @param alreadyMentioned  dogIds the reply already @-mentioned (line-start)
 * @returns the strongest missed handoff, or null if none / already handled
 */
export function detectMissedHandoff(
	content: string,
	myDogId: string,
	alreadyPassed: boolean,
	alreadyMentioned: ReadonlyArray<string> = [],
): MissedHandoff | null {
	// If the dog already passed the ball, the chain is moving — nothing to fix.
	if (alreadyPassed) return null;

	const lower = content.toLowerCase();
	const mentionedSet = new Set(alreadyMentioned.map(String));

	let best: MissedHandoff | null = null;

	for (const domain of SPECIALTY_DOMAINS) {
		// Never suggest handing off to yourself.
		if (domain.dogId === myDogId) continue;
		// Already @-mentioned this dog → not "missed".
		if (mentionedSet.has(domain.dogId)) continue;

		let hitCount = 0;
		let firstMatch: string | undefined;
		for (const kw of domain.keywords) {
			if (lower.includes(kw.toLowerCase())) {
				hitCount++;
				if (!firstMatch) firstMatch = kw;
			}
		}

		if (hitCount > 0 && firstMatch) {
			// Keep the domain with the most keyword hits (strongest signal).
			if (!best || hitCount > best.hitCount) {
				best = {
					to: createDogId(domain.dogId),
					toName: domain.dogName,
					matchedKeyword: firstMatch,
					hitCount,
				};
			}
		}
	}

	return best;
}

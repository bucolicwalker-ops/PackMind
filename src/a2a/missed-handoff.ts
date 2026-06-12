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

/**
 * Minimum specialty-keyword hits required to suggest a handoff (砚砚 review P1).
 * 1 is too noisy (ambiguous words like 设计/安全 belong to multiple roles);
 * 2+ means the reply genuinely dwells on another role's domain.
 */
const MIN_HIT_COUNT = 2;

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

		// Require >= MIN_HIT_COUNT keywords to fire (砚砚 review P1). A SINGLE
		// keyword is too ambiguous: "设计" / "安全" belong to BOTH the architect
		// (系统设计 / 架构安全) and a specialist (视觉设计 / 安全审查). Demanding
		// two+ hits suppresses those false positives while keeping real signals
		// (e.g. 视觉+设计+交互). We accept missing weak single-keyword signals —
		// a missed weak hint is better than a noisy false suggestion.
		if (hitCount >= MIN_HIT_COUNT && firstMatch) {
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

/** Minimal view of one dog's turn — enough to decide whether it ENDED the chain
 * by returning the ball to the creator (and so might have a missed handoff). */
export interface ChainHopView {
	content: string;
	dogId: string;
	action: "pass" | "hold" | "return_to_creator";
	degraded: boolean;
}

/**
 * Pick which dog's response to scan for a missed handoff: the dog that ENDED the
 * chain — the tail if a chain formed, else the entry dog. Returns null unless that
 * dog ended by returning the ball to the creator (a pass means it handed off; a
 * hold means it's waiting; a degraded reply is a demo template, not real signal).
 *
 * Why this exists: L2 used to check ONLY the entry dog (a2a.ts gated detection on
 * chainPath.length===0). In a multi-hop chain the TAIL dog could talk about another
 * specialty and silently end the chain — L2 never saw it. This selector extends L2
 * coverage to wherever the ball actually came to rest.
 */
export function selectMissedHandoffCandidate(
	entry: ChainHopView,
	tail: ChainHopView | null,
): { content: string; dogId: string } | null {
	// The ball comes to rest at the chain tail (if one formed), else the entry dog.
	const final = tail ?? entry;
	// Only a "returned to creator" ending is a missed-handoff candidate: a pass
	// already handed off, a hold is waiting, and a degraded reply is a demo template
	// (its keywords would false-fire). Anything else is not a missed handoff.
	if (final.action !== "return_to_creator" || final.degraded) return null;
	return { content: final.content, dogId: final.dogId };
}

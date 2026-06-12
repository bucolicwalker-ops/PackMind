/**
 * Self-Boundary Handoff Parser — L1 手段1.3 of the autonomous collaboration chain.
 *
 * See docs/autonomous-collaboration-design.md §4 (L1 手段1.3: 结构化自我边界).
 *
 * The idea: the L0 prompt asks every dog to end its reply with a STRUCTURED
 * self-boundary block — "我能搞定：… / 需要谁：…". When the dog fills in
 * "需要谁：@短腿", that is an EXPLICIT, self-declared handoff. This parser reads
 * that field and turns the declared need into a real ball-pass.
 *
 * Why this beats L2 (missed-handoff keyword heuristic): L2 GUESSES from domain
 * keywords ("视觉" → maybe 短腿?). This reads what the dog EXPLICITLY declared —
 * far higher precision. Autonomy is preserved: the dog itself decided to write
 * "需要谁：@短腿" (or "需要谁：无" to keep the ball). The system only wires that
 * declaration to the actual handoff mechanism.
 */

import { createDogId, type DogId } from "../types/ids.js";

/** Minimal teammate descriptor needed to resolve a declared need (DI — keeps this pure & testable). */
export interface KnownDog {
	id: string;
	nickname: string;
	mentionPatterns: string[];
}

/** A handoff the dog explicitly declared in its 需要谁 field. */
export interface SelfBoundaryHandoff {
	to: DogId;
	toName: string;
	/** The raw 需要谁 value (for explainability / surfacing). */
	declaredNeed: string;
}

/**
 * 需要谁 values that mean "I can go solo" — these must NEVER become a handoff,
 * or the structural prompt would force false passes (盲区5: 链长≠协作好). We only
 * check the LEAD of the value so "无，我能独立完成" counts as solo.
 */
const SOLO_LEAD = /^(无|没有|不需要|暂时不需要|不用|独立|自己|n\/?a|none)/i;

/**
 * Parse the dog's structured self-boundary declaration and resolve the teammate
 * it explicitly asked for. Returns null when the field is absent, declares solo
 * ("需要谁：无"), names only itself, or names no known teammate.
 */
export function parseSelfBoundaryHandoff(
	content: string,
	myDogId: string,
	knownDogs: ReadonlyArray<KnownDog>,
): SelfBoundaryHandoff | null {
	// 1. Locate the 需要谁 field value (full- or half-width colon; any line prefix).
	const match = content.match(/需要谁[：:]\s*(.+)/);
	const value = match?.[1]?.trim();
	if (!value) return null;

	// 2. Solo declaration → keep the ball. The dog's autonomy includes saying "无".
	if (SOLO_LEAD.test(value)) return null;

	// 3. Resolve the first known teammate (never self) named in the field.
	for (const dog of knownDogs) {
		if (dog.id === myDogId) continue;
		const refs = [`@${dog.id}`, dog.nickname, ...dog.mentionPatterns];
		if (refs.some((ref) => ref.length > 0 && value.includes(ref))) {
			return {
				to: createDogId(dog.id),
				toName: dog.nickname,
				declaredNeed: value,
			};
		}
	}

	// Named a need, but no teammate we can route to → null (can't fabricate a target).
	return null;
}

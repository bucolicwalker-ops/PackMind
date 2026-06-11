/**
 * Ball Action computation — per-hop ball decisions in a collaboration chain.
 *
 * Why this exists (bug fix, 烁烁 found / 宪宪 fixed):
 * In a recursive chain A→B→C, each invokeDog() returns a `ballActionResult`
 * that gets OVERWRITTEN to reflect the chain TAIL (the last dog's state).
 * Recording that overwritten value per-hop mislabels every hop with the same
 * final value — "who did THIS dog pass to" becomes lost.
 *
 * `computeOwnBallAction` captures the dog's OWN decision at its own hop,
 * independent of whatever happens deeper in the recursion. This is the
 * single source of truth for per-hop ball transfer.
 */

import type { DogId } from "../types/ids.js";

export type BallActionKind = "pass" | "hold" | "return_to_creator";

export interface OwnBallAction {
	action: BallActionKind;
	/** For 'pass': who passed (this dog) */
	from?: DogId;
	/** For 'pass': who received */
	to?: DogId;
	/** For 'pass': receiver's display name */
	toName?: string;
	/** For 'hold': why */
	reason?: string;
}

/**
 * Compute a dog's OWN ball action at its hop — never affected by recursion.
 *
 * @param ballAction  the dog's chosen action (from model response)
 * @param self        this dog's id
 * @param nextTarget  the pass target (only meaningful for 'pass')
 * @param nextTargetName  display name of the pass target
 * @param holdReason  reason text (only meaningful for 'hold')
 */
export function computeOwnBallAction(
	ballAction: BallActionKind,
	self: DogId,
	nextTarget: DogId | undefined,
	nextTargetName: string | undefined,
	holdReason: string | undefined,
): OwnBallAction {
	if (ballAction === "pass" && nextTarget) {
		return {
			action: "pass",
			from: self,
			to: nextTarget,
			toName: nextTargetName,
		};
	}
	if (ballAction === "hold") {
		return { action: "hold", reason: holdReason };
	}
	return { action: "return_to_creator" };
}

/** One hop in a collaboration chain: who passed the ball to whom. */
export interface ChainHop {
	from: DogId;
	fromName: string;
	to: DogId;
	toName: string;
}

/** A per-hop ball action record (shape of chainInvokes[].ballAction / ownBallAction). */
interface HopBallAction {
	action?: BallActionKind;
	from?: DogId;
	to?: DogId;
	toName?: string;
}

/**
 * Loose INPUT shape accepted by buildChainPath — the minimum it reads from each
 * chain entry. Deliberately permissive (optional fields) so callers can pass
 * their own richer chainInvokes entries without a type cast. Distinct from
 * a2a.ts's stricter ChainInvokeEntry (the actual invokeDog return shape).
 */
interface ChainHopInput {
	dogName?: string;
	ballAction?: HopBallAction | null;
}

/**
 * Build the full ball-passing path of a chain, as an ordered list of hops.
 *
 * Why this exists (A: make ball-passing visible at the API top level):
 * The top-level `ballAction` only shows the chain TAIL state — a chain like
 * 牧哥→corgi→return looks like "return_to_creator" and the passes vanish.
 * chainPath surfaces every actual hop so the front-end / user can SEE the route.
 *
 * @param firstOwnAction  the entry dog's OWN ball action (its first hop, if a pass)
 * @param firstFromName   the entry dog's display name
 * @param chainInvokes    the auto-invoke chain entries (each carries its own hop)
 */
export function buildChainPath(
	firstOwnAction: HopBallAction | null | undefined,
	firstFromName: string,
	chainInvokes: ReadonlyArray<ChainHopInput>,
): ChainHop[] {
	const path: ChainHop[] = [];

	// Hop 0: the entry dog's own pass (if it passed at all)
	if (
		firstOwnAction?.action === "pass" &&
		firstOwnAction.from &&
		firstOwnAction.to
	) {
		path.push({
			from: firstOwnAction.from,
			fromName: firstFromName,
			to: firstOwnAction.to,
			toName: firstOwnAction.toName ?? String(firstOwnAction.to),
		});
	}

	// Subsequent hops: each chain entry that itself passed the ball onward
	for (const entry of chainInvokes) {
		const ba = entry.ballAction;
		if (ba?.action === "pass" && ba.from && ba.to) {
			path.push({
				from: ba.from,
				fromName: entry.dogName ?? String(ba.from),
				to: ba.to,
				toName: ba.toName ?? String(ba.to),
			});
		}
	}

	return path;
}

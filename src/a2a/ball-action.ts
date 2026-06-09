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

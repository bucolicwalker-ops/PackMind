/**
 * Ball Tracker — tracks which dog holds the ball in each thread.
 *
 * Pattern borrowed from cat-coffee's ball tracking:
 * - Per-thread ball state: who holds it, why, when
 * - Only first-person declaration (you declare YOUR ball, not others')
 * - Ball transfers through @mention (line-start) or hold_ball action
 *
 * The ball metaphor: in a conversation thread, only one agent should
 * be "active" at a time — the one holding the ball. When they finish,
 * they pass the ball to the next agent via @mention or hold it via hold_ball.
 *
 * Without ball tracking: two dogs might respond simultaneously = chaos.
 * With ball tracking: clear chain of responsibility = collaboration.
 */

import type { DogId } from "../types/ids.js";
import type { ThreadId } from "../types/thread.js";

export interface BallState {
	/** Which dog currently holds the ball */
	holder: DogId | null;
	/** Why they hold it (reason for hold_ball, or "received from @xxx") */
	reason: string | null;
	/** When the ball was acquired */
	acquiredAt: number;
	/** If held via hold_ball: when to wake up and re-check */
	wakeAfterMs: number | null;
	/** What to do when re-invoked (for hold_ball) */
	nextStep: string | null;
}

class BallTracker {
	private states = new Map<string, BallState>();

	/** Get ball state for a thread. Returns null if no ball held. */
	get(threadId: ThreadId): BallState | null {
		return this.states.get(threadId as string) ?? null;
	}

	/** A dog receives the ball (via @mention from another dog or user). */
	acquire(threadId: ThreadId, dogId: DogId, reason: string): BallState {
		const state: BallState = {
			holder: dogId,
			reason,
			acquiredAt: Date.now(),
			wakeAfterMs: null,
			nextStep: null,
		};
		this.states.set(threadId as string, state);
		return state;
	}

	/** A dog holds the ball to wait for external conditions. */
	hold(
		threadId: ThreadId,
		dogId: DogId,
		reason: string,
		nextStep: string,
		wakeAfterMs: number,
	): BallState {
		// Validate: only the current holder can hold
		const current = this.get(threadId);
		if (current && current.holder !== dogId) {
			throw new Error(
				`Ball deadlock: ${current.holder} holds the ball, ${dogId} tried to hold it`,
			);
		}

		const state: BallState = {
			holder: dogId,
			reason,
			acquiredAt: Date.now(),
			wakeAfterMs,
			nextStep,
		};
		this.states.set(threadId as string, state);
		return state;
	}

	/** Release the ball (dog finished their task). Ball drops to ground. */
	release(threadId: ThreadId): void {
		this.states.delete(threadId as string);
	}

	/** Transfer ball from one dog to another (via @mention). */
	transfer(
		threadId: ThreadId,
		fromDogId: DogId,
		toDogId: DogId,
		reason: string,
	): BallState {
		const current = this.get(threadId);
		if (current && current.holder !== fromDogId) {
			throw new Error(
				`Ball transfer conflict: ${current.holder} holds the ball, ${fromDogId} tried to transfer it`,
			);
		}
		return this.acquire(threadId, toDogId, reason);
	}

	/** Check if a dog is the current ball holder for a thread. */
	isHolder(threadId: ThreadId, dogId: DogId): boolean {
		const state = this.get(threadId);
		return state?.holder === dogId;
	}

	/** List all active ball states. */
	listAll(): Array<{ threadId: string; state: BallState }> {
		return Array.from(this.states.entries()).map(([threadId, state]) => ({
			threadId,
			state,
		}));
	}
}

/** Global singleton */
export const ballTracker = new BallTracker();

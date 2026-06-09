/**
 * Thread & Message Type Definitions for Dog-Coffee.
 *
 * Simplified from cat-coffee's Thread + StoredMessage models.
 * Cat-coffee has ~15 fields per model; we keep the minimum that
 * enables actual conversation between dogs.
 */

import type { DogId } from "./ids.js";

// ─── Branded ID types ───

export type ThreadId = Brand<string, "ThreadId">;
export type MessageId = Brand<string, "MessageId">;
export type UserId = Brand<string, "UserId">;

type Brand<T, B> = T & { __brand: B };

export function createThreadId(id: string): ThreadId {
	if (!id) throw new Error("ThreadId must be non-empty");
	return id as ThreadId;
}

export function createMessageId(id: string): MessageId {
	if (!id) throw new Error("MessageId must be non-empty");
	return id as MessageId;
}

export function createUserId(id: string): UserId {
	if (!id) throw new Error("UserId must be non-empty");
	return id as UserId;
}

// ─── Thread ───

export interface Thread {
	id: ThreadId;
	title: string | null;
	createdBy: UserId;
	participants: DogId[];
	lastActiveAt: number;
	createdAt: number;
}

// ─── Message ───

export interface Message {
	id: MessageId;
	threadId: ThreadId;
	/** Who sent this — userId for human, null for human (userId always set) */
	userId: UserId;
	/** Which dog sent this — null if message is from human */
	dogId: DogId | null;
	/** Plain text content */
	content: string;
	/** Dog IDs mentioned in content (parsed from @狗名 patterns) */
	mentions: DogId[];
	/** Unix ms timestamp */
	timestamp: number;
}

// ─── API request/response types ───

export interface CreateThreadRequest {
	title?: string;
}

export interface PostMessageRequest {
	content: string;
	dogId?: string; // optional: if posting as a dog (agent-to-agent)
}

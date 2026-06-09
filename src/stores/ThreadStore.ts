/**
 * Thread Store — Map-based storage with JSON file persistence.
 *
 * Data survives server restarts via data/threads.json.
 * Pattern: load at startup → mutate in memory → save on every write.
 *
 * Simplified from cat-coffee: no LRU eviction, no Redis migration yet.
 */

import { dogRegistry } from "../registry/DogRegistry.js";
import type { DogId } from "../types/ids.js";
import {
	createThreadId,
	type Thread,
	type ThreadId,
	type UserId,
} from "../types/thread.js";
import { loadJson, saveJson } from "./persistence.js";

const PERSISTENCE_FILE = "threads.json";

class ThreadStore {
	private map = new Map<string, Thread>();

	/** Load persisted data from disk. Call once at startup. */
	init(): void {
		const data = loadJson<Thread[]>(PERSISTENCE_FILE);
		if (data) {
			for (const thread of data) {
				this.map.set(thread.id as string, thread);
			}
			console.log(
				`[ThreadStore] Loaded ${this.map.size} threads from ${PERSISTENCE_FILE}`,
			);
		} else {
			console.log("[ThreadStore] No persisted data, starting fresh");
		}
	}

	private persist(): void {
		const data = Array.from(this.map.values());
		saveJson(PERSISTENCE_FILE, data);
	}

	/** Create a new thread. Returns the created thread. */
	create(userId: UserId, title?: string): Thread {
		const id = createThreadId(
			`thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		);
		const now = Date.now();

		const thread: Thread = {
			id,
			title: title ?? null,
			createdBy: userId,
			participants: [],
			lastActiveAt: now,
			createdAt: now,
		};

		this.map.set(id as string, thread);
		this.persist();
		return thread;
	}

	/** Get a thread by ID. Throws if not found. */
	getOrThrow(id: ThreadId): Thread {
		const thread = this.map.get(id as string);
		if (!thread) throw new Error(`Thread not found: ${id}`);
		return thread;
	}

	/** Get a thread safely. Returns undefined if not found. */
	tryGet(id: ThreadId): Thread | undefined {
		return this.map.get(id as string);
	}

	/** List all threads. Optional filter by createdBy. */
	list(userId?: UserId): Thread[] {
		const threads = Array.from(this.map.values());
		if (userId) {
			return threads.filter((t) => t.createdBy === userId);
		}
		return threads.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
	}

	/** Update thread title. */
	updateTitle(id: ThreadId, title: string): Thread {
		const thread = this.getOrThrow(id);
		thread.title = title;
		thread.lastActiveAt = Date.now();
		this.persist();
		return thread;
	}

	/** Add a dog participant to the thread. */
	addParticipant(id: ThreadId, dogId: DogId): Thread {
		const thread = this.getOrThrow(id);
		const key = dogId as string;
		if (!thread.participants.includes(dogId)) {
			dogRegistry.assertKnownDogId(key);
			thread.participants = [...thread.participants, dogId];
		}
		thread.lastActiveAt = Date.now();
		this.persist();
		return thread;
	}

	/** Reset store — for testing only. */
	reset(): void {
		this.map.clear();
	}

	/** Delete a thread (hard delete for minimal version). */
	delete(id: ThreadId): boolean {
		const deleted = this.map.delete(id as string);
		if (deleted) this.persist();
		return deleted;
	}

	/** Update lastActiveAt timestamp. */
	touch(id: ThreadId): void {
		const thread = this.tryGet(id);
		if (thread) {
			thread.lastActiveAt = Date.now();
			this.persist();
		}
	}
}

/** Global singleton */
export const threadStore = new ThreadStore();

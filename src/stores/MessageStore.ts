/**
 * Message Store — Array storage with JSON file persistence.
 *
 * Data survives server restarts via data/messages.json.
 * Pattern: load at startup → append in memory → save on every write.
 *
 * Simplified from cat-coffee: plain text content only, no contentBlocks.
 */

import { dogRegistry } from "../registry/DogRegistry.js";
import { createDogId, type DogId } from "../types/ids.js";
import {
	createMessageId,
	type Message,
	type MessageId,
	type ThreadId,
	type UserId,
} from "../types/thread.js";
import { loadJson, saveJson } from "./persistence.js";

const PERSISTENCE_FILE = "messages.json";
const MAX_MESSAGES = 500;

class MessageStore {
	private messages: Message[] = [];

	/** Load persisted data from disk. Call once at startup. */
	init(): void {
		const data = loadJson<Message[]>(PERSISTENCE_FILE);
		if (data) {
			this.messages = data;
			console.log(
				`[MessageStore] Loaded ${this.messages.length} messages from ${PERSISTENCE_FILE}`,
			);
		} else {
			console.log("[MessageStore] No persisted data, starting fresh");
		}
	}

	private persist(): void {
		saveJson(PERSISTENCE_FILE, this.messages);
	}

	/** Append a message. Returns the created message. */
	append(
		threadId: ThreadId,
		userId: UserId,
		dogId: DogId | null,
		content: string,
	): Message {
		const id = createMessageId(
			`msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		);

		// Parse @mentions from content
		const mentions = this.parseMentions(content);

		const message: Message = {
			id,
			threadId,
			userId,
			dogId,
			content,
			mentions,
			timestamp: Date.now(),
		};

		this.messages.push(message);

		// Trim oldest messages if over limit
		if (this.messages.length > MAX_MESSAGES) {
			this.messages = this.messages.slice(-MAX_MESSAGES);
		}

		this.persist();
		return message;
	}

	/** Get recent messages for a thread. */
	getRecent(threadId: ThreadId, limit?: number): Message[] {
		const filtered = this.messages
			.filter((m) => m.threadId === threadId)
			.sort((a, b) => a.timestamp - b.timestamp);
		return limit ? filtered.slice(-limit) : filtered;
	}

	/** Get all messages for a thread. */
	getThreadMessages(threadId: ThreadId): Message[] {
		return this.getRecent(threadId);
	}

	/** Find messages that mention a specific dog. */
	findByMention(dogId: DogId): Message[] {
		return this.messages.filter((m) => m.mentions.includes(dogId));
	}

	/** Get all messages (for search). Returns a copy. */
	getAll(): Message[] {
		return [...this.messages];
	}

	/** Get a single message by ID. */
	get(id: MessageId): Message | undefined {
		return this.messages.find((m) => m.id === id);
	}

	/**
	 * Parse @狗名 mentions from message content.
	 * Uses longest-match-first to prevent prefix collisions.
	 */
	private parseMentions(content: string): DogId[] {
		const mentions: DogId[] = [];
		const seen = new Set<string>();

		for (const dogId of dogRegistry.getAllIds()) {
			const entry = dogRegistry.getOrThrow(dogId);
			for (const pattern of entry.config.mentionPatterns) {
				if (content.includes(pattern) && !seen.has(dogId as string)) {
					mentions.push(dogId);
					seen.add(dogId as string);
					break;
				}
			}
		}

		return mentions;
	}
}

/** Global singleton */
export const messageStore = new MessageStore();

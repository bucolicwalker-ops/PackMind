/**
 * Message Store — In-memory array storage for messages.
 *
 * Pattern borrowed from cat-coffee's MessageStore:
 * - Array-based storage (cat-coffee uses array bounded to 2000 messages)
 * - Append-only (messages are added, not edited)
 * - Timestamp-based ordering
 * - @mention parsing integrated with dog registry
 *
 * Cat-coffee also stores contentBlocks, origin, visibility.
 * We keep it simple: plain text content only.
 */

import { Message, MessageId, ThreadId, UserId, createMessageId } from '../types/thread.js';
import { DogId, createDogId } from '../types/ids.js';
import { dogRegistry } from '../registry/DogRegistry.js';

const MAX_MESSAGES = 500; // cat-coffee uses 2000; we use less for minimal

class MessageStore {
  private messages: Message[] = [];

  /** Append a message. Returns the created message. */
  append(threadId: ThreadId, userId: UserId, dogId: DogId | null, content: string): Message {
    const id = createMessageId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

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

    return message;
  }

  /** Get recent messages for a thread. */
  getRecent(threadId: ThreadId, limit?: number): Message[] {
    const filtered = this.messages
      .filter(m => m.threadId === threadId)
      .sort((a, b) => a.timestamp - b.timestamp);
    return limit ? filtered.slice(-limit) : filtered;
  }

  /** Get all messages for a thread. */
  getThreadMessages(threadId: ThreadId): Message[] {
    return this.getRecent(threadId);
  }

  /** Find messages that mention a specific dog. */
  findByMention(dogId: DogId): Message[] {
    return this.messages.filter(m => m.mentions.includes(dogId));
  }

  /** Get all messages (for search). Returns a copy to prevent mutation. */
  getAll(): Message[] {
    return [...this.messages];
  }

  /** Get a single message by ID. */
  get(id: MessageId): Message | undefined {
    return this.messages.find(m => m.id === id);
  }

  /**
   * Parse @狗名 mentions from message content.
   * Uses longest-match-first to prevent prefix collisions.
   * Pattern: cat-coffee's findBreedByMention
   */
  private parseMentions(content: string): DogId[] {
    const mentions: DogId[] = [];
    const seen = new Set<string>();

    // Check each dog's mention patterns against the content
    for (const dogId of dogRegistry.getAllIds()) {
      const entry = dogRegistry.getOrThrow(dogId);
      for (const pattern of entry.config.mentionPatterns) {
        if (content.includes(pattern) && !seen.has(dogId as string)) {
          mentions.push(dogId);
          seen.add(dogId as string);
          break; // one match per dog is enough
        }
      }
    }

    return mentions;
  }
}

/** Global singleton */
export const messageStore = new MessageStore();
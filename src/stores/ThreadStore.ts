/**
 * Thread Store — In-memory Map storage for threads.
 *
 * Pattern borrowed from cat-coffee's ThreadStore:
 * - Map-based storage (cat-coffee's default is ALSO in-memory!)
 * - CRUD operations with runtime validation
 * - No LRU eviction for minimal version (cat-coffee uses LRU with max 100)
 *
 * Redis key patterns exist in cat-coffee as a migration path.
 * We'll add Redis later when we need persistence across restarts.
 */

import { Thread, ThreadId, createThreadId, UserId } from '../types/thread.js';
import { DogId } from '../types/ids.js';
import { dogRegistry } from '../registry/DogRegistry.js';

class ThreadStore {
  private map = new Map<string, Thread>();

  /** Create a new thread. Returns the created thread. */
  create(userId: UserId, title?: string): Thread {
    const id = createThreadId(`thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const now = Date.now();

    const thread: Thread = {
      id,
      title: title ?? null,
      createdBy: userId,
      participants: [], // dogs join when they're mentioned or invoked
      lastActiveAt: now,
      createdAt: now,
    };

    this.map.set(id as string, thread);
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
      return threads.filter(t => t.createdBy === userId);
    }
    return threads.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /** Update thread title. */
  updateTitle(id: ThreadId, title: string): Thread {
    const thread = this.getOrThrow(id);
    thread.title = title;
    thread.lastActiveAt = Date.now();
    return thread;
  }

  /** Add a dog participant to the thread. */
  addParticipant(id: ThreadId, dogId: DogId): Thread {
    const thread = this.getOrThrow(id);
    const key = dogId as string;
    if (!thread.participants.includes(dogId)) {
      // Validate dogId exists in registry
      dogRegistry.assertKnownDogId(key);
      thread.participants = [...thread.participants, dogId];
    }
    thread.lastActiveAt = Date.now();
    return thread;
  }

  /** Delete a thread (hard delete for minimal version). */
  delete(id: ThreadId): boolean {
    return this.map.delete(id as string);
  }

  /** Update lastActiveAt timestamp. */
  touch(id: ThreadId): void {
    const thread = this.tryGet(id);
    if (thread) {
      thread.lastActiveAt = Date.now();
    }
  }
}

/** Global singleton */
export const threadStore = new ThreadStore();
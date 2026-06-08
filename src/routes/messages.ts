/**
 * Message REST Routes — endpoints for posting and reading messages.
 *
 * Pattern borrowed from cat-coffee's messages.ts routes:
 *   POST /api/messages        → post message (and trigger agent routing)
 *   GET  /api/messages        → get recent messages (filter by threadId)
 *
 * Simplified: no contentBlocks, no origin tracking, no visibility.
 * The POST endpoint also handles:
 *   - Parsing @mentions
 *   - Adding mentioned dogs as thread participants
 *   - Updating thread.lastActiveAt
 */

import { FastifyInstance } from 'fastify';
import { messageStore } from '../stores/MessageStore.js';
import { threadStore } from '../stores/ThreadStore.js';
import { createUserId, PostMessageRequest } from '../types/thread.js';
import { createDogId } from '../types/ids.js';

const DEFAULT_USER = createUserId('default-user');

export function registerMessageRoutes(app: FastifyInstance): void {
  // Post message
  app.post('/api/messages', async (request, reply) => {
    const body = request.body as PostMessageRequest;
    if (!body?.content) {
      return reply.status(400).send({ error: 'content is required' });
    }

    // Determine threadId — create new thread if not specified
    // (minimal version: all messages go to a thread; we create one if needed)
    const threadIdFromBody = (body as any).threadId as string | undefined;
    let threadId: any;

    if (threadIdFromBody) {
      const thread = threadStore.tryGet(threadIdFromBody as any);
      if (!thread) {
        return reply.status(404).send({ error: 'Thread not found' });
      }
      threadId = thread.id;
    } else {
      // Auto-create a thread for standalone messages
      const thread = threadStore.create(DEFAULT_USER);
      threadId = thread.id;
    }

    // Determine dogId — null for human messages
    const dogId = body.dogId ? createDogId(body.dogId) : null;

    // Post the message
    const message = messageStore.append(
      threadId,
      DEFAULT_USER,
      dogId,
      body.content,
    );

    // Add mentioned dogs as thread participants
    for (const mentionedDogId of message.mentions) {
      threadStore.addParticipant(threadId, mentionedDogId);
    }

    // Update thread activity
    threadStore.touch(threadId);

    return reply.status(201).send(message);
  });

  // Get recent messages for a thread
  app.get('/api/messages', async (request, reply) => {
    const { threadId, limit } = request.query as { threadId?: string; limit?: string };
    if (!threadId) {
      return reply.status(400).send({ error: 'threadId query param required' });
    }
    const messages = messageStore.getRecent(
      threadId as any,
      limit ? Number.parseInt(limit, 10) : undefined,
    );
    return reply.send(messages);
  });
}
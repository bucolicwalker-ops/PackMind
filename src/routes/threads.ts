/**
 * Thread REST Routes — CRUD endpoints for threads.
 *
 * Pattern borrowed from cat-coffee's threads.ts routes:
 *   POST /api/threads         → create thread
 *   GET  /api/threads         → list threads
 *   GET  /api/threads/:id     → get thread
 *   PATCH /api/threads/:id    → update thread
 *   DELETE /api/threads/:id   → delete thread
 *
 * Simplified: no soft-delete, no projectPath filter, no search.
 */

import { FastifyInstance } from 'fastify';
import { threadStore } from '../stores/ThreadStore.js';
import { createUserId, CreateThreadRequest } from '../types/thread.js';

/** Default user ID — minimal version has single-user auth */
const DEFAULT_USER = createUserId('default-user');

export function registerThreadRoutes(app: FastifyInstance): void {
  // Create thread
  app.post('/api/threads', async (request, reply) => {
    const body = request.body as CreateThreadRequest | undefined;
    const thread = threadStore.create(DEFAULT_USER, body?.title);
    return reply.status(201).send(thread);
  });

  // List threads
  app.get('/api/threads', async (_request, reply) => {
    const threads = threadStore.list();
    return reply.send(threads);
  });

  // Get thread
  app.get<{ Params: { id: string } }>('/api/threads/:id', async (request, reply) => {
    const { id } = request.params;
    const thread = threadStore.tryGet(id as any);
    if (!thread) {
      return reply.status(404).send({ error: 'Thread not found' });
    }
    return reply.send(thread);
  });

  // Update thread title
  app.patch<{ Params: { id: string }; Body: { title: string } }>('/api/threads/:id', async (request, reply) => {
    const { id } = request.params;
    const { title } = request.body;
    try {
      const thread = threadStore.updateTitle(id as any, title);
      return reply.send(thread);
    } catch {
      return reply.status(404).send({ error: 'Thread not found' });
    }
  });

  // Delete thread
  app.delete<{ Params: { id: string } }>('/api/threads/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = threadStore.delete(id as any);
    return reply.status(deleted ? 200 : 404).send({ deleted });
  });
}
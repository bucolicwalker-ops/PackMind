/**
 * Thread REST Routes — CRUD endpoints for threads.
 *
 * All request bodies validated via Zod schemas (schemas.ts).
 * No `as any` casts — validated types flow into business logic.
 */

import { FastifyInstance } from 'fastify';
import { threadStore } from '../stores/ThreadStore.js';
import { createUserId } from '../types/thread.js';
import { createThreadSchema, updateThreadSchema } from './schemas.js';

const DEFAULT_USER = createUserId('default-user');

export function registerThreadRoutes(app: FastifyInstance): void {
  // Create thread
  app.post('/api/threads', async (request, reply) => {
    const parsed = createThreadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { title } = parsed.data;
    const thread = threadStore.create(DEFAULT_USER, title);
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
  app.patch<{ Params: { id: string } }>('/api/threads/:id', async (request, reply) => {
    const { id } = request.params;
    const parsed = updateThreadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten() });
    }
    const { title } = parsed.data;
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
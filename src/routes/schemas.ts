/**
 * Zod Validation Schemas for REST API endpoints.
 *
 * All POST/PATCH request bodies must pass through these schemas
 * before reaching business logic. This replaces unsafe `as any` casts
 * with validated, typed data.
 *
 * Pattern borrowed from cat-coffee's request validation layer.
 */

import { z } from 'zod';

// ─── Thread schemas ───

export const createThreadSchema = z.object({
  title: z.string().max(200).optional(),
});

export const updateThreadSchema = z.object({
  title: z.string().min(1).max(200),
});

// ─── Message schemas ───

export const postMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  threadId: z.string().min(1).optional(),
  dogId: z.string().min(1).optional(),
});

export const getMessagesQuerySchema = z.object({
  threadId: z.string().min(1),
  limit: z.string().optional().transform(v => v ? Number.parseInt(v, 10) : undefined),
});

// ─── A2A schemas ───

export const invokeSchema = z.object({
  threadId: z.string().min(1),
  dogId: z.string().min(1),
  content: z.string().optional(),
  autoRespond: z.boolean().optional(),
});

export const holdBallSchema = z.object({
  threadId: z.string().min(1),
  dogId: z.string().min(1),
  reason: z.string().min(1).max(500),
  nextStep: z.string().min(1).max(500),
  wakeAfterMs: z.number().min(5000).max(3600000),
});

// ─── Type exports (inferred from schemas) ───

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;
export type PostMessageInput = z.infer<typeof postMessageSchema>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
export type InvokeInput = z.infer<typeof invokeSchema>;
export type HoldBallInput = z.infer<typeof holdBallSchema>;
/**
 * Collaboration MCP Tools — post_message and hold_ball.
 *
 * These are the two core A2A tools that make dogs autonomous:
 * - dog_cafe_post_message: Dog posts a message to a thread (replaces curl POST /api/messages)
 * - dog_cafe_hold_ball: Dog holds the ball while waiting (replaces curl POST /api/a2a/hold-ball)
 *
 * Pattern borrowed from cat-coffee's callback-tools.ts:
 * - Input schemas use Zod (SDK converts to JSON Schema automatically)
 * - Handlers call in-memory stores directly (minimal version — no HTTP callback)
 * - @ mentions parsed automatically, participants added, ball actions handled
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { messageStore } from '../stores/MessageStore.js';
import { threadStore } from '../stores/ThreadStore.js';
import { ballTracker } from '../a2a/BallTracker.js';
import { dogRegistry } from '../registry/DogRegistry.js';
import { createThreadId, createUserId } from '../types/thread.js';
import { createDogId } from '../types/ids.js';
import { successResult, errorResult, ToolResult } from './tool-result.js';

// ─── dog_cafe_post_message ───

const postMessageSchema = {
  threadId: z.string().min(1).describe('Thread ID to post the message into'),
  dogId: z.string().min(1).describe('Dog ID of the sender (e.g. "collie", "corgi", "gsd")'),
  content: z.string().min(1).describe('Message content. @mentions are parsed automatically (e.g. "@铁铁 review this")'),
};

async function handlePostMessage(args: Record<string, unknown>): Promise<ToolResult> {
  const threadIdStr = args.threadId as string;
  const dogIdStr = args.dogId as string;
  const content = args.content as string;

  // Validate thread exists
  const threadId = createThreadId(threadIdStr);
  const thread = threadStore.tryGet(threadId);
  if (!thread) {
    return errorResult(`Thread not found: ${threadIdStr}`);
  }

  // Validate dog exists
  const dogId = createDogId(dogIdStr);
  const dogEntry = dogRegistry.tryGet(dogId);
  if (!dogEntry) {
    return errorResult(`Unknown dogId: ${dogIdStr}`);
  }

  // Post message — MessageStore.parseMentions handles @ detection
  const DEFAULT_USER = createUserId('default-user');
  const message = messageStore.append(threadId, DEFAULT_USER, dogId, content);

  // Touch thread activity
  threadStore.touch(threadId);

  // Check if message mentions another dog → auto ball pass
  const resolvedMention = dogRegistry.resolveMention(content);
  if (resolvedMention) {
    ballTracker.release(threadId);
    ballTracker.acquire(threadId, resolvedMention, `${dogEntry.config.nickname} passed ball via @mention`);
    const targetEntry = dogRegistry.getOrThrow(resolvedMention);
    return successResult(
      `Message posted by ${dogEntry.config.nickname} in thread ${threadIdStr}.\n` +
      `Ball passed to ${targetEntry.config.nickname} (${resolvedMention as string}) via @mention.\n` +
      `Message ID: ${message.id as string}`
    );
  }

  // No @mention → dog keeps ball (or releases)
  return successResult(
    `Message posted by ${dogEntry.config.nickname} in thread ${threadIdStr}.\n` +
    `No @mention detected — ball remains with ${dogEntry.config.nickname}.\n` +
    `Message ID: ${message.id as string}`
  );
}

// ─── dog_cafe_hold_ball ───

const holdBallSchema = {
  threadId: z.string().min(1).describe('Thread ID where the ball is held'),
  dogId: z.string().min(1).describe('Dog ID of the holder (must be current ball holder)'),
  reason: z.string().min(1).describe('Why the dog holds the ball (e.g. "waiting for CI to finish")'),
  nextStep: z.string().min(1).describe('What the dog will do when re-invoked (e.g. "check CI result, then proceed")'),
  wakeAfterMs: z.number().min(5000).max(3600000).describe('Delay in ms before system re-invokes (5000-3600000)'),
};

async function handleHoldBall(args: Record<string, unknown>): Promise<ToolResult> {
  const threadIdStr = args.threadId as string;
  const dogIdStr = args.dogId as string;
  const reason = args.reason as string;
  const nextStep = args.nextStep as string;
  const wakeAfterMs = args.wakeAfterMs as number;

  const threadId = createThreadId(threadIdStr);
  const dogId = createDogId(dogIdStr);

  // Validate dog exists
  const dogEntry = dogRegistry.tryGet(dogId);
  if (!dogEntry) {
    return errorResult(`Unknown dogId: ${dogIdStr}`);
  }

  try {
    const state = ballTracker.hold(threadId, dogId, reason, nextStep, wakeAfterMs);
    return successResult(
      `${dogEntry.config.nickname} holds the ball in thread ${threadIdStr}.\n` +
      `Reason: ${reason}\n` +
      `Next step: ${nextStep}\n` +
      `Wake after: ${wakeAfterMs}ms (${Math.round(wakeAfterMs / 1000)}s)\n` +
      `Ball holder: ${state.holder as string}`
    );
  } catch (err) {
    return errorResult((err as Error).message);
  }
}

// ─── Registration ───

export function registerCollabTools(server: McpServer): void {
  server.tool(
    'dog_cafe_post_message',
    'Post a message to a thread as a dog. @mentions are parsed automatically — if you mention another dog (e.g. "@铁铁 review"), the ball gets passed to them. This is the primary way dogs communicate and collaborate.',
    postMessageSchema,
    async (args) => handlePostMessage(args),
  );

  server.tool(
    'dog_cafe_hold_ball',
    'Hold the ball while waiting for external conditions (CI, review, external webhook). Only the current ball holder can hold. The system will re-invoke you after wakeAfterMs. Max 3 holds per (thread, dog) in ~1h.',
    holdBallSchema,
    async (args) => handleHoldBall(args),
  );
}
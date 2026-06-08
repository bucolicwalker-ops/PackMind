/**
 * A2A Routes — API endpoints for ball-passing and agent invocation.
 *
 * UPDATED: invoke now actually generates a response via DogResponder
 * and stores it as a message. The collaboration loop is CLOSED.
 *
 * Three endpoints:
 * 1. POST /api/a2a/invoke — Invoke a dog, get its response, store it
 * 2. POST /api/a2a/hold-ball — Dog holds ball while waiting
 * 3. GET /api/a2a/ball-state — Check who holds the ball
 */

import { FastifyInstance } from 'fastify';
import { ballTracker } from '../a2a/BallTracker.js';
import { messageStore } from '../stores/MessageStore.js';
import { threadStore } from '../stores/ThreadStore.js';
import { createThreadId, createUserId } from '../types/thread.js';
import { createDogId } from '../types/ids.js';
import { dogRegistry } from '../registry/DogRegistry.js';
import { generateDemoResponse } from '../responder/DogResponder.js';

const DEFAULT_USER = createUserId('default-user');

interface InvokeRequest {
  threadId: string;
  dogId: string;
  content?: string;
  autoRespond?: boolean;  // if true, automatically generate and store response
}

interface HoldBallRequest {
  threadId: string;
  dogId: string;
  reason: string;
  nextStep: string;
  wakeAfterMs: number;
}

export function registerA2aRoutes(app: FastifyInstance): void {

  /** Invoke a dog to respond in a thread — NOW ACTUALLY RESPONDS */
  app.post('/api/a2a/invoke', async (request, reply) => {
    const body = request.body as InvokeRequest;
    if (!body?.threadId || !body?.dogId) {
      return reply.status(400).send({ error: 'threadId and dogId required' });
    }

    const threadId = createThreadId(body.threadId);
    const thread = threadStore.tryGet(threadId);
    if (!thread) {
      return reply.status(404).send({ error: 'Thread not found' });
    }

    const dogId = createDogId(body.dogId);
    const dogEntry = dogRegistry.tryGet(dogId);
    if (!dogEntry) {
      return reply.status(404).send({ error: `Unknown dogId: ${body.dogId}` });
    }

    // Acquire ball
    ballTracker.acquire(threadId, dogId, body.content ?? 'invoked by user');
    threadStore.addParticipant(threadId, dogId);

    // Store trigger message if provided
    if (body.content) {
      messageStore.append(threadId, DEFAULT_USER, null, body.content);
    }

    // Compile L0 prompt
    const { compileL0 } = await import('../prompt/compile-l0.js');
    const l0Prompt = compileL0({ dogId: body.dogId });

    // Get recent messages for context
    const recentMessages = messageStore.getRecent(threadId, 5);

    // Generate response (demo mode)
    const autoRespond = body.autoRespond ?? true;  // default to auto
    let responseMessage = null;
    let ballActionResult = null;

    if (autoRespond) {
      const response = generateDemoResponse({
        dogConfig: dogEntry.config,
        l0Prompt,
        recentMessages,
        triggerContent: body.content ?? 'direct invocation',
      });

      // Store the dog's response as a message
      responseMessage = messageStore.append(threadId, DEFAULT_USER, dogId, response.content);

      // Handle ball action
      if (response.ballAction === 'pass' && response.nextTarget) {
        // Ball gets passed — release current, acquire for next
        ballTracker.release(threadId);
        ballTracker.acquire(threadId, response.nextTarget, `${dogEntry.config.nickname} passed ball`);
        ballActionResult = {
          action: 'pass',
          from: dogId,
          to: response.nextTarget,
          toName: dogRegistry.getOrThrow(response.nextTarget).config.nickname,
        };
      } else if (response.ballAction === 'hold') {
        ballTracker.hold(threadId, dogId, response.holdReason ?? 'waiting',
          response.holdNextStep ?? 'check and proceed', response.holdWakeAfterMs ?? 300000);
        ballActionResult = { action: 'hold', reason: response.holdReason };
      } else {
        // Return to creator — release ball
        ballTracker.release(threadId);
        ballActionResult = { action: 'return_to_creator' };
      }
    }

    return reply.status(200).send({
      dogId: body.dogId,
      dogName: dogEntry.config.nickname,
      threadId: body.threadId,
      ballState: ballTracker.get(threadId),
      response: responseMessage,
      ballAction: ballActionResult,
      l0PromptPreview: l0Prompt.slice(0, 200),
      message: `🐕 ${dogEntry.config.nickname} 已被唤醒并回复`,
    });
  });

  /** Dog holds the ball while waiting for external conditions */
  app.post('/api/a2a/hold-ball', async (request, reply) => {
    const body = request.body as HoldBallRequest;
    if (!body?.threadId || !body?.dogId || !body?.reason || !body?.nextStep) {
      return reply.status(400).send({ error: 'threadId, dogId, reason, nextStep required' });
    }
    if (body.wakeAfterMs < 5000 || body.wakeAfterMs > 3600000) {
      return reply.status(400).send({ error: 'wakeAfterMs must be 5000-3600000' });
    }

    const threadId = createThreadId(body.threadId);
    const dogId = createDogId(body.dogId);

    try {
      const state = ballTracker.hold(threadId, dogId, body.reason, body.nextStep, body.wakeAfterMs);
      return reply.status(200).send({
        ballState: state,
        message: `🐕 ${dogRegistry.getOrThrow(dogId).config.nickname} 持球等待：${body.reason}`,
      });
    } catch (err) {
      return reply.status(409).send({ error: (err as Error).message });
    }
  });

  /** Check ball state for a thread */
  app.get<{ Params: { threadId: string } }>('/api/a2a/ball-state/:threadId', async (request, reply) => {
    const { threadId } = request.params;
    const state = ballTracker.get(createThreadId(threadId));
    if (!state) {
      return reply.status(200).send({ holder: null, message: '球在地上' });
    }
    const holderName = state.holder ? dogRegistry.getOrThrow(state.holder).config.nickname : null;
    return reply.status(200).send({
      holder: state.holder, holderName,
      reason: state.reason, acquiredAt: state.acquiredAt,
      wakeAfterMs: state.wakeAfterMs, nextStep: state.nextStep,
    });
  });
}
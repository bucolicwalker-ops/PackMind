/**
 * Message REST Routes — endpoints for posting and reading messages.
 *
 * All request bodies validated via Zod schemas (schemas.ts).
 * @mention parsing + participant addition + ball pass integrated.
 */

import type { FastifyInstance } from "fastify";
import { messageStore } from "../stores/MessageStore.js";
import { threadStore } from "../stores/ThreadStore.js";
import { createDogId } from "../types/ids.js";
import { createUserId } from "../types/thread.js";
import { getMessagesQuerySchema, postMessageSchema } from "./schemas.js";

const DEFAULT_USER = createUserId("default-user");

export function registerMessageRoutes(app: FastifyInstance): void {
	// Post message
	app.post("/api/messages", async (request, reply) => {
		const parsed = postMessageSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid request", details: parsed.error.flatten() });
		}
		const { content, threadId: threadIdStr, dogId: dogIdStr } = parsed.data;

		// Determine threadId — create new thread if not specified
		let threadId: any;
		if (threadIdStr) {
			const thread = threadStore.tryGet(threadIdStr as any);
			if (!thread) {
				return reply.status(404).send({ error: "Thread not found" });
			}
			threadId = thread.id;
		} else {
			const thread = threadStore.create(DEFAULT_USER);
			threadId = thread.id;
		}

		// Determine dogId — null for human messages
		const dogId = dogIdStr ? createDogId(dogIdStr) : null;

		// Post the message
		const message = messageStore.append(threadId, DEFAULT_USER, dogId, content);

		// Add mentioned dogs as thread participants
		for (const mentionedDogId of message.mentions) {
			threadStore.addParticipant(threadId, mentionedDogId);
		}

		// Update thread activity
		threadStore.touch(threadId);

		return reply.status(201).send(message);
	});

	// Get recent messages for a thread
	app.get("/api/messages", async (request, reply) => {
		const parsed = getMessagesQuerySchema.safeParse(request.query);
		if (!parsed.success) {
			return reply
				.status(400)
				.send({ error: "Invalid request", details: parsed.error.flatten() });
		}
		const { threadId, limit } = parsed.data;
		const messages = messageStore.getRecent(threadId as any, limit);
		return reply.send(messages);
	});
}

/**
 * Validation schemas unit tests.
 *
 * Tests Zod schema validation for all REST endpoint inputs:
 * - createThreadSchema (optional title)
 * - updateThreadSchema (required title, max 200)
 * - postMessageSchema (required content, max 10000)
 * - getMessagesQuerySchema (required threadId, optional limit transform)
 * - invokeSchema (required threadId + dogId)
 * - holdBallSchema (required fields + wakeAfterMs bounds)
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createThreadSchema,
	getMessagesQuerySchema,
	holdBallSchema,
	invokeSchema,
	postMessageSchema,
	updateThreadSchema,
} from "../routes/schemas.js";

describe("createThreadSchema", () => {
	it("should accept valid input with title", () => {
		const result = createThreadSchema.safeParse({ title: "测试线程" });
		assert.equal(result.success, true);
	});

	it("should accept empty body (title optional)", () => {
		const result = createThreadSchema.safeParse({});
		assert.equal(result.success, true);
	});

	it("should reject title over 200 chars", () => {
		const result = createThreadSchema.safeParse({ title: "x".repeat(201) });
		assert.equal(result.success, false);
	});
});

describe("updateThreadSchema", () => {
	it("should accept valid title", () => {
		const result = updateThreadSchema.safeParse({ title: "新标题" });
		assert.equal(result.success, true);
	});

	it("should reject empty title", () => {
		const result = updateThreadSchema.safeParse({ title: "" });
		assert.equal(result.success, false);
	});
});

describe("postMessageSchema", () => {
	it("should accept valid message", () => {
		const result = postMessageSchema.safeParse({ content: "@牧哥 你好" });
		assert.equal(result.success, true);
	});

	it("should reject empty content", () => {
		const result = postMessageSchema.safeParse({ content: "" });
		assert.equal(result.success, false);
	});

	it("should reject content over 10000 chars", () => {
		const result = postMessageSchema.safeParse({ content: "x".repeat(10001) });
		assert.equal(result.success, false);
	});
});

describe("getMessagesQuerySchema", () => {
	it("should parse threadId and optional limit", () => {
		const result = getMessagesQuerySchema.safeParse({
			threadId: "thread_123",
			limit: "10",
		});
		assert.equal(result.success, true);
		if (result.success) {
			assert.equal(result.data.limit, 10);
		}
	});

	it("should default limit to undefined when omitted", () => {
		const result = getMessagesQuerySchema.safeParse({ threadId: "thread_123" });
		assert.equal(result.success, true);
		if (result.success) {
			assert.equal(result.data.limit, undefined);
		}
	});
});

describe("invokeSchema", () => {
	it("should accept valid invoke request", () => {
		const result = invokeSchema.safeParse({
			threadId: "thread_123",
			dogId: "collie",
			content: "帮我做个小工具",
		});
		assert.equal(result.success, true);
	});

	it("should reject missing threadId", () => {
		const result = invokeSchema.safeParse({ dogId: "collie" });
		assert.equal(result.success, false);
	});
});

describe("holdBallSchema", () => {
	it("should accept valid hold request", () => {
		const result = holdBallSchema.safeParse({
			threadId: "thread_123",
			dogId: "collie",
			reason: "waiting for CI",
			nextStep: "check CI result",
			wakeAfterMs: 60000,
		});
		assert.equal(result.success, true);
	});

	it("should reject wakeAfterMs below 5000", () => {
		const result = holdBallSchema.safeParse({
			threadId: "thread_123",
			dogId: "collie",
			reason: "test",
			nextStep: "test",
			wakeAfterMs: 4000,
		});
		assert.equal(result.success, false);
	});

	it("should reject wakeAfterMs above 3600000", () => {
		const result = holdBallSchema.safeParse({
			threadId: "thread_123",
			dogId: "collie",
			reason: "test",
			nextStep: "test",
			wakeAfterMs: 4000000,
		});
		assert.equal(result.success, false);
	});
});

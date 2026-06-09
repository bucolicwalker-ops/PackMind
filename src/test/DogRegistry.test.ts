/**
 * DogRegistry unit tests.
 *
 * Tests core registry operations:
 * - register + getOrThrow + tryGet
 * - duplicate registration rejection
 * - unknown dogId rejection
 * - resolveMention (longest-match-first)
 * - getAllConfigs + getAllIds
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { dogRegistry } from "../registry/DogRegistry.js";
import type { DogConfig } from "../types/dog-breed.js";
import { createDogId } from "../types/ids.js";

function makeCollie(): DogConfig {
	return {
		id: createDogId("collie"),
		breedName: "边牧",
		displayName: "边牧/牧哥",
		nickname: "牧哥",
		roleDescription: "主架构师",
		personality: "温暖可靠",
		avatar: "collie.svg",
		color: "#E8A87C",
		mentionPatterns: ["@牧哥", "@边牧", "@collie"],
		defaultModel: "glm-5.1",
		clientId: "glm",
		teamStrengths: ["系统设计"],
		caution: ["过度思考"],
		restrictions: [],
	};
}

function makeCorgi(): DogConfig {
	return {
		id: createDogId("corgi"),
		breedName: "柯基",
		displayName: "柯基/短腿",
		nickname: "短腿",
		roleDescription: "设计师",
		personality: "活泼灵动",
		avatar: "corgi.svg",
		color: "#F6D365",
		mentionPatterns: ["@短腿", "@柯基", "@corgi"],
		defaultModel: "glm-5.1",
		clientId: "glm",
		teamStrengths: ["视觉设计"],
		caution: ["追求完美"],
		restrictions: [],
	};
}

describe("DogRegistry", () => {
	beforeEach(() => {
		dogRegistry.reset();
	});

	it("should register and retrieve a dog", () => {
		const collie = makeCollie();
		dogRegistry.register(collie.id, collie);
		const entry = dogRegistry.getOrThrow("collie");
		assert.equal(entry.config.nickname, "牧哥");
	});

	it("should reject duplicate registration", () => {
		const collie = makeCollie();
		dogRegistry.register(collie.id, collie);
		assert.throws(
			() => dogRegistry.register(collie.id, collie),
			/Duplicate dogId/,
		);
	});

	it("should return undefined for unknown dog via tryGet", () => {
		assert.equal(dogRegistry.tryGet("unknown"), undefined);
	});

	it("should throw for unknown dog via getOrThrow", () => {
		assert.throws(() => dogRegistry.getOrThrow("unknown"), /Unknown dogId/);
	});

	it("should resolve mentions with longest-match-first", () => {
		dogRegistry.register(makeCollie().id, makeCollie());
		dogRegistry.register(makeCorgi().id, makeCorgi());

		// "@牧哥" → collie
		const result1 = dogRegistry.resolveMention("你好 @牧哥 来看看");
		assert.equal(result1 as string, "collie");

		// "@短腿" → corgi
		const result2 = dogRegistry.resolveMention("@短腿 来设计一下");
		assert.equal(result2 as string, "corgi");

		// No mention → undefined
		const result3 = dogRegistry.resolveMention("你好世界");
		assert.equal(result3, undefined);
	});

	it("should list all registered IDs", () => {
		dogRegistry.register(makeCollie().id, makeCollie());
		dogRegistry.register(makeCorgi().id, makeCorgi());
		const ids = dogRegistry.getAllIds();
		assert.equal(ids.length, 2);
		assert.ok(ids.some((id) => (id as string) === "collie"));
		assert.ok(ids.some((id) => (id as string) === "corgi"));
	});

	it("should return all configs as a flat Record", () => {
		dogRegistry.register(makeCollie().id, makeCollie());
		const configs = dogRegistry.getAllConfigs();
		assert.ok("collie" in configs);
		assert.equal(configs.collie.nickname, "牧哥");
	});

	it("should assert known dogId and reject unknown", () => {
		dogRegistry.register(makeCollie().id, makeCollie());
		const validated = dogRegistry.assertKnownDogId("collie");
		assert.equal(validated as string, "collie");
		assert.throws(
			() => dogRegistry.assertKnownDogId("unknown"),
			/Unknown dogId/,
		);
	});
});

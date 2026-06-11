/**
 * Ball action (per-hop) unit tests.
 *
 * Locks in the fix for the chain-tail-overwrite bug (烁烁 found / 宪宪 fixed):
 * each hop's OWN ball decision must be captured independently of what happens
 * deeper in the recursion. computeOwnBallAction is that source of truth.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChainPath, computeOwnBallAction } from "../a2a/ball-action.js";
import { createDogId } from "../types/ids.js";

const collie = createDogId("collie");
const gsd = createDogId("gsd");
const corgi = createDogId("corgi");

describe("computeOwnBallAction", () => {
	it("records a pass with from/to/toName", () => {
		const action = computeOwnBallAction("pass", collie, gsd, "铁铁", undefined);
		assert.equal(action.action, "pass");
		assert.equal(action.from, collie);
		assert.equal(action.to, gsd);
		assert.equal(action.toName, "铁铁");
	});

	it("records a hold with reason", () => {
		const action = computeOwnBallAction(
			"hold",
			collie,
			undefined,
			undefined,
			"waiting for CI",
		);
		assert.equal(action.action, "hold");
		assert.equal(action.reason, "waiting for CI");
	});

	it("records return_to_creator", () => {
		const action = computeOwnBallAction(
			"return_to_creator",
			collie,
			undefined,
			undefined,
			undefined,
		);
		assert.equal(action.action, "return_to_creator");
		assert.equal(action.to, undefined);
	});

	it("treats 'pass' without a target as non-pass (no phantom transfer)", () => {
		// Defensive: a 'pass' kind but missing nextTarget must NOT fabricate a pass.
		const action = computeOwnBallAction(
			"pass",
			collie,
			undefined,
			undefined,
			undefined,
		);
		assert.notEqual(action.action, "pass");
		assert.equal(action.action, "return_to_creator");
	});

	it("each hop is independent — two different hops yield distinct truths", () => {
		// The bug was: every hop got stamped with the SAME chain-tail value.
		// Here we prove two hops compute their OWN distinct actions.
		const hop1 = computeOwnBallAction("pass", collie, gsd, "铁铁", undefined);
		const hop2 = computeOwnBallAction(
			"return_to_creator",
			gsd,
			undefined,
			undefined,
			undefined,
		);
		assert.equal(hop1.action, "pass");
		assert.equal(hop1.to, gsd);
		assert.equal(hop2.action, "return_to_creator");
		// They must NOT be the same object/value (the old bug symptom).
		assert.notDeepEqual(hop1, hop2);
	});
});

describe("buildChainPath", () => {
	it("returns empty path when entry dog does not pass", () => {
		const path = buildChainPath({ action: "return_to_creator" }, "牧哥", []);
		assert.deepEqual(path, []);
	});

	it("records a single hop when entry dog passes (no further chain)", () => {
		const path = buildChainPath(
			{ action: "pass", from: collie, to: corgi, toName: "短腿" },
			"牧哥",
			[],
		);
		assert.equal(path.length, 1);
		assert.equal(path[0]?.from, collie);
		assert.equal(path[0]?.fromName, "牧哥");
		assert.equal(path[0]?.to, corgi);
		assert.equal(path[0]?.toName, "短腿");
	});

	it("builds a multi-hop path: 牧哥→铁铁→短腿", () => {
		// This is exactly the case the top-level ballAction USED to hide.
		const path = buildChainPath(
			{ action: "pass", from: collie, to: gsd, toName: "铁铁" },
			"牧哥",
			[
				{
					dogName: "铁铁",
					ballAction: { action: "pass", from: gsd, to: corgi, toName: "短腿" },
				},
				{
					dogName: "短腿",
					ballAction: { action: "return_to_creator" },
				},
			],
		);
		assert.equal(path.length, 2);
		assert.equal(path[0]?.fromName, "牧哥");
		assert.equal(path[0]?.toName, "铁铁");
		assert.equal(path[1]?.fromName, "铁铁");
		assert.equal(path[1]?.toName, "短腿");
	});

	it("skips chain entries that did not pass (return_to_creator / hold)", () => {
		const path = buildChainPath(
			{ action: "pass", from: collie, to: gsd, toName: "铁铁" },
			"牧哥",
			[{ dogName: "铁铁", ballAction: { action: "return_to_creator" } }],
		);
		// Only 牧哥's hop counts; 铁铁 returned to creator (no onward pass).
		assert.equal(path.length, 1);
		assert.equal(path[0]?.toName, "铁铁");
	});

	it("tolerates null/missing ballAction in chain entries", () => {
		const path = buildChainPath(null, "牧哥", [
			{ dogName: "铁铁", ballAction: null },
			{ dogName: "短腿" },
		]);
		assert.deepEqual(path, []);
	});
});

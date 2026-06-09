/**
 * Secret redaction unit tests.
 *
 * redactSecrets() is security-critical: it strips API key patterns from
 * error bodies before they get thrown/logged (砚砚 review P1).
 * These tests lock in that the sk- pattern is caught in realistic shapes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSecrets } from "../model/redact.js";

describe("redactSecrets", () => {
	it("redacts a bare sk- key", () => {
		const out = redactSecrets("sk-FAKE0000testkeydonotuse0000000000");
		assert.equal(out, "sk-***REDACTED***");
		assert.ok(!out.includes("d113f138"));
	});

	it("redacts a key embedded in an error message", () => {
		const out = redactSecrets(
			'{"error":"invalid key sk-FAKE0000testkeydonotuse0000000000 provided"}',
		);
		assert.ok(!out.includes("d113f138"));
		assert.ok(out.includes("sk-***REDACTED***"));
		// Surrounding diagnostic text is preserved
		assert.ok(out.includes("invalid key"));
	});

	it("redacts multiple keys in one string", () => {
		const out = redactSecrets("first sk-aaaaaaaa11 then sk-bbbbbbbb22");
		assert.equal(out, "first sk-***REDACTED*** then sk-***REDACTED***");
	});

	it("leaves text without keys unchanged", () => {
		const clean = "Model access denied. type=Model.AccessDenied";
		assert.equal(redactSecrets(clean), clean);
	});

	it("does not over-match short sk- fragments", () => {
		// "sk-" followed by <8 chars should not be redacted (avoid eating normal words)
		const out = redactSecrets("the task-sk-1 done");
		assert.ok(out.includes("task-sk-1"));
	});
});

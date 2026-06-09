/**
 * Secret Redaction — strip API key patterns from text before logging/throwing.
 *
 * Why redact instead of dropping the whole error body (砚砚 review P1):
 * - API error bodies carry real diagnostic value — we relied on DashScope's
 *   "model_access_denied" body to debug the qwen model-name issue (W6: 教训追到根因).
 * - Dropping all body content blinds future debugging.
 * - Redacting only the sk- key pattern removes the secret AND keeps diagnostics.
 *   This is the precise-removal answer, not the blunt cut.
 */

/** Redact API key patterns (sk-xxx) from a string before logging/throwing. */
export function redactSecrets(text: string): string {
	return text.replace(/sk-[a-zA-Z0-9_-]{8,}/g, "sk-***REDACTED***");
}

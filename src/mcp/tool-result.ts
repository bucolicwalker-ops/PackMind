/**
 * MCP Tool Result helpers — standardized output format for all MCP tools.
 *
 * Pattern borrowed from cat-coffee's ToolResult type:
 * - content: array of { type: 'text', text } objects
 * - isError: optional boolean flag
 * - All handlers use successResult/errorResult helpers
 */

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Create a successful tool result. */
export function successResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Create an error tool result. */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
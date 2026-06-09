/**
 * Dog-Coffee MCP Server — Model Context Protocol tool interface.
 *
 * Makes dogs autonomous: instead of being remote-controlled via REST API,
 * dogs (running as AI models) can directly call MCP tools to:
 * - Post messages (dog_cafe_post_message)
 * - Hold the ball while waiting (dog_cafe_hold_ball)
 * - Search for context/evidence (dog_cafe_search_evidence)
 *
 * Pattern borrowed from cat-coffee's MCP server:
 * - McpServer high-level API + StdioServerTransport
 * - Tool definitions as { name, description, inputSchema, handler } arrays
 * - Handlers return { content: [{ type: 'text', text }], isError? }
 * - MCP server is a thin shell — business logic lives in the REST API server
 *   and in-memory stores; MCP tools call those stores directly
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { messageStore } from "../stores/MessageStore.js";
import { threadStore } from "../stores/ThreadStore.js";
import { registerCollabTools } from "./collab-tools.js";
import { registerMemoryTools } from "./memory-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the MCP server.
 * Registers all tool groups and returns the McpServer instance.
 */
export function createMcpServer(): McpServer {
	const server = new McpServer({
		name: "dog-cafe-mcp",
		version: "0.1.0",
	});

	// Register tool groups
	registerCollabTools(server);
	registerMemoryTools(server);

	return server;
}

/**
 * Start the MCP server on stdio transport.
 * Called when this file is executed as an entry point.
 */
async function main(): Promise<void> {
	console.error("[dog-cafe] MCP Server starting on stdio...");

	// Initialize dog registry (needed by tools)
	const { initDogRegistry } = await import("../config/dog-config-loader.js");
	initDogRegistry();

	// Initialize stores — load persisted data from disk
	threadStore.init();
	messageStore.init();

	const server = createMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error("[dog-cafe] MCP Server running on stdio");

	// Graceful shutdown
	const shutdown = (signal: string) => {
		console.error(`[dog-cafe] MCP Server shutting down (${signal})`);
		process.exit(128 + (signal === "SIGINT" ? 2 : 15));
	};
	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Only run main() when executed as entry point (not when imported)
const isEntryPoint =
	process.argv[1] &&
	resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isEntryPoint) {
	main().catch((err) => {
		console.error("[dog-cafe] MCP Server failed:", err);
		process.exit(1);
	});
}

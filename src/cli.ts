/**
 * Dog-Coffee CLI entry point — REST API server mode.
 * Run: node dist/cli.js
 *
 * MCP server has its own entry point: node dist/mcp/index.js
 * See package.json scripts: "start:mcp"
 */

import { startServer } from './server/index.js';

startServer().catch(err => {
  console.error('Failed to start Dog-Coffee:', err);
  process.exit(1);
});
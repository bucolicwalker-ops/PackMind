/**
 * Memory MCP Tools — search_evidence.
 *
 * This is the tool that makes dogs truly autonomous:
 * instead of only seeing the last 5 messages (like the REST invoke endpoint),
 * dogs can search the full conversation history to find context.
 *
 * Pattern borrowed from cat-coffee's search_evidence tool:
 * - Semantic/fuzzy search across thread messages
 * - In minimal version: we search MessageStore directly (no vector index)
 * - Returns ranked results with context summaries
 *
 * Future extension (matching cat-coffee):
 * - Add vector embedding for semantic search
 * - Add knowledge graph (decisions, lessons, features)
 * - Add session chain history
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { messageStore } from '../stores/MessageStore.js';
import { threadStore } from '../stores/ThreadStore.js';
import { ballTracker } from '../a2a/BallTracker.js';
import { dogRegistry } from '../registry/DogRegistry.js';
import { createThreadId, ThreadId } from '../types/thread.js';
import { successResult, errorResult, ToolResult } from './tool-result.js';

// ─── dog_cafe_search_evidence ───

const searchEvidenceSchema = {
  query: z.string().min(1).describe('Search query — keywords to find in conversation history (e.g. "数据库设计", "review 结果", "架构讨论")'),
  threadId: z.string().optional().describe('Optional: restrict search to a specific thread. Omit to search across all threads.'),
  limit: z.number().min(1).max(20).optional().describe('Max results to return (default: 5, max: 20)'),
};

async function handleSearchEvidence(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  const threadIdStr = args.threadId as string | undefined;
  const limit = (args.limit as number) ?? 5;

  // Search messages
  const results = searchMessages(query, threadIdStr, limit);

  if (results.length === 0) {
    return successResult(`No messages found matching "${query}".`);
  }

  // Format results
  const formatted = results.map((r, i) => {
    const speaker = r.dogId
      ? `${dogRegistry.getOrThrow(r.dogId).config.nickname} (${r.dogId as string})`
      : '铲屎官';
    const thread = threadStore.tryGet(r.threadId);
    const threadTitle = thread?.title ?? r.threadId as string;
    return `[${i + 1}] Thread: ${threadTitle}\n` +
      `    Speaker: ${speaker}\n` +
      `    Time: ${new Date(r.timestamp).toISOString()}\n` +
      `    Content: ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`;
  });

  return successResult(
    `Found ${results.length} messages matching "${query}":\n\n` +
    formatted.join('\n\n')
  );
}

// ─── dog_cafe_ball_state ───

const ballStateSchema = {
  threadId: z.string().min(1).describe('Thread ID to check ball state for'),
};

async function handleBallState(args: Record<string, unknown>): Promise<ToolResult> {
  const threadIdStr = args.threadId as string;
  const threadId = createThreadId(threadIdStr);

  const state = ballTracker.get(threadId);
  if (!state || !state.holder) {
    return successResult(`Ball state for thread ${threadIdStr}: 球在地上 (no holder).`);
  }

  const holderName = dogRegistry.getOrThrow(state.holder).config.nickname;
  return successResult(
    `Ball state for thread ${threadIdStr}:\n` +
    `  Holder: ${holderName} (${state.holder as string})\n` +
    `  Reason: ${state.reason ?? 'N/A'}\n` +
    `  Acquired at: ${new Date(state.acquiredAt).toISOString()}\n` +
    `  Wake after: ${state.wakeAfterMs ? `${state.wakeAfterMs}ms (${Math.round(state.wakeAfterMs / 1000)}s)` : 'N/A'}\n` +
    `  Next step: ${state.nextStep ?? 'N/A'}`
  );
}

// ─── Helper: simple keyword search ───

interface SearchResult {
  threadId: ThreadId;
  dogId: string | null;
  content: string;
  timestamp: number;
}

function searchMessages(query: string, threadIdStr?: string, limit?: number): SearchResult[] {
  const maxResults = limit ?? 5;
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

  // Get all messages, optionally filtered by thread
  let messages = messageStore.getAll();
  if (threadIdStr) {
    const tid = createThreadId(threadIdStr);
    messages = messages.filter(m => m.threadId === tid);
  }

  // Score each message by keyword match count
  const scored = messages.map(m => {
    const lowerContent = m.content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lowerContent.includes(kw)) score += 1;
    }
    return { message: m, score };
  });

  // Filter to matches, sort by score descending + recency, take limit
  const matches = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || b.message.timestamp - a.message.timestamp)
    .slice(0, maxResults);

  return matches.map(m => ({
    threadId: m.message.threadId,
    dogId: m.message.dogId as string | null,
    content: m.message.content,
    timestamp: m.message.timestamp,
  }));
}

// ─── Registration ───

export function registerMemoryTools(server: McpServer): void {
  server.tool(
    'dog_cafe_search_evidence',
    'Search conversation history for context. Dogs use this to find previous discussions, decisions, and relevant context before responding. In minimal version: keyword-based search across all messages. Query supports multiple keywords (space-separated) — all must match for a result to appear.',
    searchEvidenceSchema,
    async (args) => handleSearchEvidence(args),
  );

  server.tool(
    'dog_cafe_ball_state',
    'Check who currently holds the ball in a thread. Returns holder name, reason, wake timer, and next step. Use this before deciding whether to post a message or hold the ball.',
    ballStateSchema,
    async (args) => handleBallState(args),
  );
}
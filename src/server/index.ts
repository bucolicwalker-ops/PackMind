/**
 * Dog-Coffee API Server — the main entry point.
 *
 * Starts the Fastify server, initializes the dog registry,
 * registers routes, and makes the system ready to receive requests.
 *
 * Pattern borrowed from cat-coffee's server setup:
 * - Fastify app with JSON body parser
 * - Register route modules
 * - Initialize config at startup
 * - Graceful shutdown
 */

import Fastify from 'fastify';
import { initDogRegistry } from '../config/dog-config-loader.js';
import { threadStore } from '../stores/ThreadStore.js';
import { messageStore } from '../stores/MessageStore.js';
import { registerThreadRoutes } from '../routes/threads.js';
import { registerMessageRoutes } from '../routes/messages.js';
import { registerA2aRoutes } from '../routes/a2a.js';

const PORT = Number.parseInt(process.env.PORT ?? '3100', 10);
const HOST = process.env.HOST ?? 'localhost';
const DATA_DIR = process.env.DOG_COFFEE_DATA_DIR ?? 'data';

export async function createServer(configPath?: string) {
  const app = Fastify({ logger: true });

  // Initialize dog registry from config
  initDogRegistry(configPath);

  // Initialize stores — load persisted data from disk
  threadStore.init();
  messageStore.init();

  // Register routes
  registerThreadRoutes(app);
  registerMessageRoutes(app);
  registerA2aRoutes(app);

  // Health check endpoint
  app.get('/api/health', async () => {
    return { status: 'ok', service: 'dog-coffee', version: '0.1.0' };
  });

  return app;
}

export async function startServer(configPath?: string) {
  const app = await createServer(configPath);

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🐕 Dog-Coffee server running at http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🐕 Shutting down Dog-Coffee...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
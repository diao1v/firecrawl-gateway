import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

const server = serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    logger.info(
      { port: info.port },
      `Firecrawl Gateway started on port ${info.port}`
    );
  }
);

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

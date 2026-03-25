import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loggerMiddleware } from './middleware/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { health } from './routes/health.js';
import { scrape } from './routes/scrape.js';
import { crawl } from './routes/crawl.js';
import { extract } from './routes/extract.js';
import { batchScrape } from './routes/batch-scrape.js';
import { AppError, InternalError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import type { AppVariables } from './types/index.js';

const app = new Hono<{ Variables: AppVariables }>();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);

// Health check (no auth required)
app.route('/health', health);

// Protected routes (auth required)
app.use('/scrape/*', authMiddleware);
app.use('/scrape', authMiddleware);
app.route('/scrape', scrape);

app.use('/crawl/*', authMiddleware);
app.use('/crawl', authMiddleware);
app.route('/crawl', crawl);

app.use('/extract/*', authMiddleware);
app.use('/extract', authMiddleware);
app.route('/extract', extract);

app.use('/batch/scrape/*', authMiddleware);
app.use('/batch/scrape', authMiddleware);
app.route('/batch/scrape', batchScrape);

// Error handler
app.onError((err, c) => {
  const requestId = c.get('requestId');

  if (err instanceof AppError) {
    logger.warn(
      { requestId, code: err.code, message: err.message },
      'Request error'
    );
    return c.json(err.toJSON(), err.statusCode as ContentfulStatusCode);
  }

  logger.error({ requestId, error: err }, 'Unhandled error');

  const internalError = new InternalError();
  return c.json(internalError.toJSON(), internalError.statusCode as ContentfulStatusCode);
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    },
    404
  );
});

export { app };

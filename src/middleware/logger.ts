import type { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';
import type { AppVariables } from '../types/index.js';

export async function loggerMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next
) {
  const start = Date.now();
  const requestId = c.get('requestId');
  const method = c.req.method;
  const path = c.req.path;

  logger.info({ requestId, method, path }, 'Incoming request');

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const clientId = c.get('clientId');

  logger.info(
    { requestId, clientId, method, path, status, duration },
    'Request completed'
  );
}

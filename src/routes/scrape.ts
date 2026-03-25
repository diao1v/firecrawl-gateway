import { Hono } from 'hono';
import { scrapeRequestSchema } from '../schemas/scrape.js';
import { firecrawlService } from '../services/firecrawl.js';
import { ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/index.js';

const scrape = new Hono<{ Variables: AppVariables }>();

scrape.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = scrapeRequestSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid request body', {
      issues: parseResult.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  const request = parseResult.data;
  const requestId = c.get('requestId');

  const result = await firecrawlService.scrape(
    {
      url: request.url,
      formats: request.formats,
      includeTags: request.includeTags,
      excludeTags: request.excludeTags,
      waitFor: request.waitFor,
      timeout: request.timeout,
      changeTracking: request.changeTracking,
      changeTrackingOptions: request.changeTrackingOptions,
    },
    requestId
  );

  return c.json({
    success: true,
    data: result,
  });
});

export { scrape };

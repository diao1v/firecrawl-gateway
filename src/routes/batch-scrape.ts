import { Hono } from 'hono';
import { batchScrapeRequestSchema } from '../schemas/batch-scrape.js';
import { firecrawlService } from '../services/firecrawl.js';
import { ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/index.js';

const batchScrape = new Hono<{ Variables: AppVariables }>();

// POST /batch/scrape - Start a batch scrape job
batchScrape.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = batchScrapeRequestSchema.safeParse(body);

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

  const jobId = await firecrawlService.startBatchScrape(
    {
      urls: request.urls,
      formats: request.formats,
      includeTags: request.includeTags,
      excludeTags: request.excludeTags,
      changeTracking: request.changeTracking,
      changeTrackingOptions: request.changeTrackingOptions,
      webhookUrl: request.webhookUrl,
      webhookEvents: request.webhookEvents,
    },
    requestId
  );

  return c.json({
    success: true,
    data: {
      jobId,
      status: 'pending',
    },
  });
});

// GET /batch/scrape/:jobId - Get batch scrape job status
batchScrape.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const requestId = c.get('requestId');

  const result = await firecrawlService.getBatchScrapeStatus(jobId, requestId);

  return c.json({
    success: true,
    data: result,
  });
});

export { batchScrape };

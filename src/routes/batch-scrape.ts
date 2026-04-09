import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { batchScrapeRequestSchema } from '../schemas/batch-scrape.js';
import { firecrawlService } from '../services/firecrawl.js';
import { jobStore } from '../services/job-store.js';
import { ValidationError } from '../lib/errors.js';
import { validateWebhookUrl } from '../lib/url-validator.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import type { AppVariables } from '../types/index.js';

// Temporary store to map our internal webhook key to the actual Firecrawl jobId
const webhookKeyToJobId = new Map<string, string>();

export function registerJobIdForWebhookKey(key: string, jobId: string) {
  webhookKeyToJobId.set(key, jobId);
}

export function getJobIdFromWebhookKey(key: string): string | undefined {
  return webhookKeyToJobId.get(key);
}

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

  const childLogger = logger.child({ requestId, service: 'batch-scrape' });

  // Validate webhook URL for SSRF protection
  if (request.webhookUrl) {
    childLogger.debug({ webhookUrl: request.webhookUrl }, 'Validating webhook URL');
    const webhookValidation = validateWebhookUrl(request.webhookUrl);
    if (!webhookValidation.valid) {
      childLogger.warn({ error: webhookValidation.error }, 'Webhook URL validation failed');
      throw new ValidationError(webhookValidation.error || 'Invalid webhook URL');
    }
  }

  // Generate a unique key for webhook routing before we know the jobId
  const webhookKey = randomUUID();
  childLogger.debug({ webhookKey, baseUrl: config.FIRECRAWL_GATEWAY_BASE_URL }, 'Generated webhook key');

  // Determine webhook URL to pass to Firecrawl
  let firecrawlWebhookUrl: string | undefined;
  if (request.webhookUrl && config.FIRECRAWL_GATEWAY_BASE_URL) {
    // Use gateway's internal webhook endpoint with our key
    firecrawlWebhookUrl = `${config.FIRECRAWL_GATEWAY_BASE_URL}/internal/webhooks/batch/${webhookKey}`;
  } else {
    // No gateway base URL configured, pass through directly (no signing)
    firecrawlWebhookUrl = request.webhookUrl;
  }

  const jobId = await firecrawlService.startBatchScrape(
    {
      urls: request.urls,
      formats: request.formats,
      includeTags: request.includeTags,
      excludeTags: request.excludeTags,
      waitFor: request.waitFor,
      changeTracking: request.changeTracking,
      changeTrackingOptions: request.changeTrackingOptions,
      webhookUrl: firecrawlWebhookUrl,
      webhookEvents: request.webhookEvents,
    },
    requestId
  );

  // Store job metadata for webhook forwarding
  if (request.webhookUrl) {
    jobStore.set(jobId, {
      webhookUrl: request.webhookUrl,
      webhookEvents: request.webhookEvents,
      jobType: 'batch-scrape',
    });
    // Map our webhook key to the actual jobId
    registerJobIdForWebhookKey(webhookKey, jobId);
  }

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

import { Hono } from 'hono';
import { crawlRequestSchema } from '../schemas/crawl.js';
import { firecrawlService } from '../services/firecrawl.js';
import { webhookService } from '../services/webhook.js';
import { jobStore } from '../services/job-store.js';
import { ValidationError } from '../lib/errors.js';
import { validateWebhookUrl } from '../lib/url-validator.js';
import { logger } from '../lib/logger.js';
import type { AppVariables } from '../types/index.js';
import type { CrawlPageData } from '../types/index.js';
import type { WebhookPayload, CrawlStatus, CrawlPage } from '../schemas/crawl.js';

const crawl = new Hono<{ Variables: AppVariables }>();

// Helper to map Firecrawl page data to our response format
function mapPageData(page: CrawlPageData): CrawlPage {
  return {
    url: page.metadata.sourceURL,
    markdown: page.markdown,
    html: page.html,
    rawHtml: page.rawHtml,
    links: page.links,
    metadata: page.metadata,
  };
}

// POST /crawl - Start a new crawl job
crawl.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = crawlRequestSchema.safeParse(body);

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

  // Validate webhook URL for SSRF protection
  if (request.webhookUrl) {
    const webhookValidation = validateWebhookUrl(request.webhookUrl);
    if (!webhookValidation.valid) {
      throw new ValidationError(webhookValidation.error || 'Invalid webhook URL');
    }
  }

  const jobId = await firecrawlService.startCrawl(
    {
      url: request.url,
      maxDepth: request.maxDepth,
      limit: request.limit,
      formats: request.formats,
      includePaths: request.includePaths,
      excludePaths: request.excludePaths,
    },
    requestId
  );

  // Store job metadata for webhook delivery
  jobStore.set(jobId, {
    webhookUrl: request.webhookUrl,
  });

  return c.json({
    success: true,
    data: {
      jobId,
      status: 'pending' as const,
    },
  });
});

// GET /crawl/:jobId - Get crawl job status
crawl.get('/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const requestId = c.get('requestId');

  const result = await firecrawlService.getCrawlStatus(jobId, requestId);

  // Map Firecrawl status to our status
  let status: CrawlStatus;
  if (result.status === 'completed') {
    status = 'completed';
  } else if (result.status === 'failed') {
    status = 'failed';
  } else {
    status = 'running';
  }

  const isCompleted = status === 'completed' || status === 'failed';
  const pages = result.data ?? [];

  // Deliver webhook if job is complete and webhook URL exists
  // Use atomic claim to prevent race condition with concurrent requests
  if (isCompleted) {
    const webhookUrl = jobStore.claimWebhookForDelivery(jobId);
    if (webhookUrl) {
      const payload: WebhookPayload = {
        jobId,
        status,
        pages: pages.map(mapPageData),
        totalPages: result.total,
        completedAt: new Date().toISOString(),
      };

      // Deliver webhook asynchronously (don't block response)
      webhookService
        .deliver(webhookUrl, payload, requestId)
        .then((success) => {
          if (!success) {
            logger.warn({ jobId, webhookUrl, requestId }, 'Webhook delivery failed');
          }
        })
        .catch((error) => {
          logger.error(
            { jobId, webhookUrl, requestId, error: error instanceof Error ? error.message : String(error) },
            'Webhook delivery error'
          );
        });
    }
  }

  return c.json({
    success: true,
    data: {
      jobId,
      status,
      pages: pages.map(mapPageData),
      totalPages: result.total,
      completedPages: result.completed,
      ...(isCompleted && { completedAt: new Date().toISOString() }),
    },
  });
});

export { crawl };

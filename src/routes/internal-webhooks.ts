import { Hono } from 'hono';
import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { jobStore } from '../services/job-store.js';
import { getJobIdFromWebhookKey } from './batch-scrape.js';
import { logger } from '../lib/logger.js';
import type { AppVariables } from '../types/index.js';

const internalWebhooks = new Hono<{ Variables: AppVariables }>();

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

interface FirecrawlPageData {
  url?: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
  changeTracking?: {
    changeStatus: 'new' | 'same' | 'changed' | 'removed';
    previousScrapeAt: string | null;
  };
}

interface FirecrawlBatchWebhookPayload {
  type: string;
  id?: string;
  // Firecrawl sends data as an array for batch scrape webhooks
  data?: FirecrawlPageData[];
  error?: string;
}

// POST /internal/webhooks/batch/:webhookKey - Receive webhook from Firecrawl for batch scrape
internalWebhooks.post('/batch/:webhookKey', async (c) => {
  const webhookKey = c.req.param('webhookKey');
  const requestId = c.get('requestId');
  const childLogger = logger.child({ requestId, service: 'internal-webhook', webhookKey });

  // Look up the actual jobId from the webhook key
  const jobId = getJobIdFromWebhookKey(webhookKey);
  if (!jobId) {
    childLogger.warn('Unknown webhook key');
    return c.json({ success: false, error: 'Unknown webhook key' }, 404);
  }

  childLogger.child({ jobId });

  const body = await c.req.text();
  let payload: FirecrawlBatchWebhookPayload;

  try {
    payload = JSON.parse(body);
  } catch {
    childLogger.warn('Invalid JSON payload from Firecrawl');
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  childLogger.info({ type: payload.type, jobId, dataKeys: payload.data ? Object.keys(payload.data) : null, hasData: !!payload.data }, 'Received webhook from Firecrawl');
  childLogger.debug({ rawPayload: body.substring(0, 2000) }, 'Raw Firecrawl webhook payload');

  const job = jobStore.get(jobId);
  if (!job?.webhookUrl) {
    childLogger.info({ jobId, jobExists: !!job, webhookUrl: job?.webhookUrl }, 'No webhook URL configured for job, skipping forward');
    return c.json({ success: true });
  }

  // Check if this event type should be delivered
  // Firecrawl sends types like "batch_scrape.page", normalize to "page"
  const rawType = payload.type;
  const eventType = (rawType.includes('.') ? rawType.split('.').pop()! : rawType) as 'started' | 'page' | 'completed';
  if (!jobStore.shouldDeliverEvent(jobId, eventType)) {
    childLogger.info({ eventType, rawType, webhookEvents: job.webhookEvents }, 'Event type not in webhook events list, skipping forward');
    return c.json({ success: true });
  }

  childLogger.info({ webhookUrl: job.webhookUrl }, 'Forwarding webhook to crawlbrief');

  // Transform payload for crawlbrief format
  // Firecrawl sends data as array — unwrap first element for page events
  const pageData = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const forwardPayload = {
    type: eventType,
    jobId,
    data: eventType === 'page' ? pageData : undefined,
    error: payload.error,
  };

  const forwardBody = JSON.stringify(forwardPayload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': `batch.${payload.type}`,
    'X-Job-Id': jobId,
  };

  // Add HMAC signature if webhook secret is configured
  if (config.FIRECRAWL_GATEWAY_WEBHOOK_SECRET) {
    const signature = signPayload(forwardBody, config.FIRECRAWL_GATEWAY_WEBHOOK_SECRET);
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
    headers['X-Webhook-Timestamp'] = Date.now().toString();
  }

  // Forward webhook to crawlbrief asynchronously (fire-and-forget)
  // Don't await — respond to Firecrawl immediately to avoid its webhook timeout
  fetch(job.webhookUrl, {
    method: 'POST',
    headers,
    body: forwardBody,
  })
    .then((response) => {
      if (!response.ok) {
        childLogger.warn(
          { status: response.status, webhookUrl: job.webhookUrl },
          'Webhook forward failed'
        );
      } else {
        childLogger.info({ webhookUrl: job.webhookUrl }, 'Webhook forwarded successfully');
      }

      // Mark as delivered if completed
      if (eventType === 'completed') {
        jobStore.markWebhookDelivered(jobId);
      }
    })
    .catch((error) => {
      childLogger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to forward webhook'
      );
    });

  return c.json({ success: true });
});

export { internalWebhooks };

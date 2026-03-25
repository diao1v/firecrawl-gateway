import { createHmac } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { withRetry } from '../lib/retry.js';
import type { WebhookPayload } from '../schemas/crawl.js';

const WEBHOOK_TIMEOUT = 10000;

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class WebhookService {
  async deliver(
    webhookUrl: string,
    payload: WebhookPayload,
    requestId?: string
  ): Promise<boolean> {
    const childLogger = logger.child({
      requestId,
      service: 'webhook',
      jobId: payload.jobId,
      webhookUrl,
    });

    childLogger.info('Delivering webhook');

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'crawl.completed',
      'X-Job-Id': payload.jobId,
    };

    // Add HMAC signature if webhook secret is configured
    if (config.FIRECRAWL_GATEWAY_WEBHOOK_SECRET) {
      const signature = signPayload(body, config.FIRECRAWL_GATEWAY_WEBHOOK_SECRET);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
      headers['X-Webhook-Timestamp'] = Date.now().toString();
    }

    try {
      await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT);

          try {
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers,
              body,
              signal: controller.signal,
            });

            if (!response.ok) {
              throw new Error(`Webhook returned ${response.status}`);
            }

            return response;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          requestId,
          maxAttempts: 3,
          baseDelayMs: 2000,
          maxDelayMs: 30000,
          shouldRetry: (error) => {
            // Retry on network errors and 5xx responses
            if (error instanceof Error) {
              const message = error.message;
              return (
                message.includes('fetch') ||
                message.includes('network') ||
                message.includes('AbortError') ||
                message.includes('500') ||
                message.includes('502') ||
                message.includes('503') ||
                message.includes('504')
              );
            }
            return false;
          },
        }
      );

      childLogger.info('Webhook delivered successfully');
      return true;
    } catch (error) {
      childLogger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to deliver webhook after retries'
      );
      return false;
    }
  }
}

export const webhookService = new WebhookService();

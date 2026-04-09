import { config } from '../config.js';
import { UpstreamError, TimeoutError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { withRetry } from '../lib/retry.js';
import type {
  FirecrawlScrapeRequest,
  FirecrawlScrapeResponse,
  ScrapeResult,
  FirecrawlCrawlRequest,
  FirecrawlCrawlStartResponse,
  FirecrawlCrawlStatusResponse,
  CrawlJobResult,
  FirecrawlExtractRequest,
  FirecrawlExtractResponse,
  ExtractResultData,
  FirecrawlBatchScrapeRequest,
  FirecrawlBatchScrapeStartResponse,
  FirecrawlBatchScrapeStatusResponse,
  BatchScrapeJobResult,
} from '../types/index.js';

const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 60000;
const API_TIMEOUT = 30000; // Timeout for API calls like startCrawl, getCrawlStatus

function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof UpstreamError) {
    const status = error.details?.status;
    return status === 502 || status === 503 || status === 504;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('econnrefused')
    );
  }
  return false;
}

export class FirecrawlService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || config.FIRECRAWL_URL;
  }

  async scrape(
    request: FirecrawlScrapeRequest,
    requestId?: string
  ): Promise<ScrapeResult> {
    const timeout = Math.min(request.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);
    const startTime = Date.now();

    const childLogger = logger.child({ requestId, service: 'firecrawl' });

    childLogger.info({ url: request.url, timeout }, 'Starting scrape request');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestBody: Record<string, unknown> = {
        url: request.url,
        formats: request.formats || ['markdown'],
        includeTags: request.includeTags,
        excludeTags: request.excludeTags,
        waitFor: request.waitFor,
        timeout: timeout,
      };

      // Add change tracking if enabled
      if (request.changeTracking) {
        requestBody.changeTracking = true;
        if (request.changeTrackingOptions) {
          requestBody.changeTrackingOptions = request.changeTrackingOptions;
        }
      }

      const response = await fetch(`${this.baseUrl}/v1/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        childLogger.error(
          { status: response.status, error: errorText, duration },
          'Firecrawl request failed'
        );
        throw new UpstreamError(`Firecrawl error: ${response.status}`, {
          status: response.status,
          body: errorText,
        });
      }

      const data = (await response.json()) as FirecrawlScrapeResponse;

      childLogger.info({ duration, success: data.success }, 'Scrape completed');

      if (!data.success || !data.data) {
        throw new UpstreamError(data.error || 'Firecrawl returned unsuccessful response');
      }

      return data.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        childLogger.error({ timeout }, 'Scrape request timed out');
        throw new TimeoutError(`Request timed out after ${timeout}ms`);
      }

      if (error instanceof UpstreamError || error instanceof TimeoutError) {
        throw error;
      }

      childLogger.error({ error }, 'Unexpected error during scrape');
      throw new UpstreamError('Failed to connect to Firecrawl', {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async startCrawl(
    request: FirecrawlCrawlRequest,
    requestId?: string
  ): Promise<string> {
    const childLogger = logger.child({ requestId, service: 'firecrawl' });

    childLogger.info({ url: request.url, limit: request.limit }, 'Starting crawl job');

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(`${this.baseUrl}/v1/crawl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: request.url,
              maxDepth: request.maxDepth,
              limit: request.limit,
              scrapeOptions: {
                formats: request.formats || ['markdown'],
              },
              includePaths: request.includePaths,
              excludePaths: request.excludePaths,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Firecrawl crawl start failed'
            );
            throw new UpstreamError(`Firecrawl error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as FirecrawlCrawlStartResponse;

          if (!data.success || !data.id) {
            throw new UpstreamError(data.error || 'Firecrawl failed to start crawl');
          }

          childLogger.info({ jobId: data.id }, 'Crawl job started');
          return data.id;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Crawl start request timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }

  async getCrawlStatus(
    jobId: string,
    requestId?: string
  ): Promise<CrawlJobResult> {
    const childLogger = logger.child({ requestId, service: 'firecrawl', jobId });

    childLogger.debug('Checking crawl status');

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(`${this.baseUrl}/v1/crawl/${jobId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          if (response.status === 404) {
            throw new NotFoundError(`Crawl job ${jobId} not found`);
          }

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Firecrawl crawl status check failed'
            );
            throw new UpstreamError(`Firecrawl error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as FirecrawlCrawlStatusResponse;

          childLogger.debug({ status: data.status }, 'Crawl status retrieved');

          return {
            status: data.status,
            total: data.total,
            completed: data.completed,
            creditsUsed: data.creditsUsed,
            expiresAt: data.expiresAt,
            data: data.data,
          };
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Crawl status request timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }

  async extract(
    request: FirecrawlExtractRequest,
    requestId?: string
  ): Promise<ExtractResultData> {
    const timeout = Math.min(request.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);
    const startTime = Date.now();

    const childLogger = logger.child({ requestId, service: 'firecrawl' });

    childLogger.info({ url: request.url, timeout }, 'Starting extract request');

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(`${this.baseUrl}/v1/scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: request.url,
              formats: ['extract'],
              extract: {
                schema: request.schema,
                prompt: request.prompt,
                systemPrompt: request.systemPrompt,
              },
              timeout: timeout,
            }),
            signal: controller.signal,
          });

          const duration = Date.now() - startTime;

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText, duration },
              'Firecrawl extract failed'
            );
            throw new UpstreamError(`Firecrawl error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as FirecrawlExtractResponse;

          childLogger.info({ duration, success: data.success }, 'Extract completed');

          if (!data.success || !data.data) {
            throw new UpstreamError(data.error || 'Firecrawl returned unsuccessful response');
          }

          return data.data;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout }, 'Extract request timed out');
            throw new TimeoutError(`Request timed out after ${timeout}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }

  async startBatchScrape(
    request: FirecrawlBatchScrapeRequest,
    requestId?: string
  ): Promise<string> {
    const childLogger = logger.child({ requestId, service: 'firecrawl' });

    childLogger.info(
      { urlCount: request.urls.length, webhookUrl: request.webhookUrl },
      'Starting batch scrape job'
    );

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          // Build request body with only parameters supported by self-hosted Firecrawl
          const requestBody: Record<string, unknown> = {
            urls: request.urls,
            formats: request.formats || ['markdown'],
            includeTags: request.includeTags,
            excludeTags: request.excludeTags,
            waitFor: request.waitFor,
          };

          // Note: changeTracking is not supported by self-hosted Firecrawl

          if (request.webhookUrl) {
            requestBody.webhook = request.webhookUrl;
            // Note: webhookEvents is handled by the gateway, not sent to Firecrawl
          }

          const response = await fetch(`${this.baseUrl}/v1/batch/scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Firecrawl batch scrape start failed'
            );
            throw new UpstreamError(`Firecrawl error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as FirecrawlBatchScrapeStartResponse;

          if (!data.success || !data.id) {
            throw new UpstreamError(data.error || 'Firecrawl failed to start batch scrape');
          }

          childLogger.info({ jobId: data.id }, 'Batch scrape job started');
          return data.id;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Batch scrape start request timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }

  async getBatchScrapeStatus(
    jobId: string,
    requestId?: string
  ): Promise<BatchScrapeJobResult> {
    const childLogger = logger.child({ requestId, service: 'firecrawl', jobId });

    childLogger.debug('Checking batch scrape status');

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(`${this.baseUrl}/v1/batch/scrape/${jobId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });

          if (response.status === 404) {
            throw new NotFoundError(`Batch scrape job ${jobId} not found`);
          }

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Firecrawl batch scrape status check failed'
            );
            throw new UpstreamError(`Firecrawl error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as FirecrawlBatchScrapeStatusResponse;

          childLogger.debug({ status: data.status }, 'Batch scrape status retrieved');

          return {
            jobId,
            status: data.status,
            total: data.total,
            completed: data.completed,
            pages: data.data,
          };
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Batch scrape status request timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }
}

export const firecrawlService = new FirecrawlService();

import type { Context } from 'hono';

export interface AppVariables {
  requestId: string;
  clientId?: string;
}

export type AppContext = Context<{ Variables: AppVariables }>;

export interface ScrapeMetadata {
  title?: string;
  description?: string;
  language?: string;
  sourceURL: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface ScrapeResult {
  url: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata: ScrapeMetadata;
  changeTracking?: ChangeTrackingResult;
}

// Change Tracking types
export type ChangeStatus = 'new' | 'same' | 'changed' | 'removed';

export interface ChangeTrackingOptions {
  modes?: ('git-diff' | 'json')[];
  tag?: string;
}

export interface ChangeTrackingResult {
  changeStatus: ChangeStatus;
  previousScrapeAt: string | null;
  diff?: string;
}

export interface FirecrawlScrapeRequest {
  url: string;
  formats?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  timeout?: number;
  changeTracking?: boolean;
  changeTrackingOptions?: ChangeTrackingOptions;
}

export interface FirecrawlScrapeResponse {
  success: boolean;
  data?: ScrapeResult;
  error?: string;
}

// Crawl types
export interface FirecrawlCrawlRequest {
  url: string;
  maxDepth?: number;
  limit?: number;
  formats?: string[];
  includePaths?: string[];
  excludePaths?: string[];
}

export interface FirecrawlCrawlStartResponse {
  success: boolean;
  id?: string;
  error?: string;
}

export type CrawlStatus = 'scraping' | 'completed' | 'failed';

export interface CrawlPageData {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata: ScrapeMetadata;
}

export interface FirecrawlCrawlStatusResponse {
  status: CrawlStatus;
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: string;
  data: CrawlPageData[];
}

export interface CrawlJobResult {
  status: CrawlStatus;
  total: number;
  completed: number;
  creditsUsed: number;
  expiresAt: string;
  data: CrawlPageData[];
}

// Extract types
export interface ExtractionSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface FirecrawlExtractRequest {
  url: string;
  schema: ExtractionSchema;
  prompt?: string;
  systemPrompt?: string;
  timeout?: number;
}

export interface ExtractResultData {
  url: string;
  data: Record<string, unknown>;
  metadata?: ScrapeMetadata;
}

export interface FirecrawlExtractResponse {
  success: boolean;
  data?: ExtractResultData;
  error?: string;
}

// Batch Scrape types
export interface FirecrawlBatchScrapeRequest {
  urls: string[];
  formats?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  changeTracking?: boolean;
  changeTrackingOptions?: ChangeTrackingOptions;
  webhookUrl?: string;
  webhookEvents?: ('started' | 'page' | 'completed')[];
}

export interface FirecrawlBatchScrapeStartResponse {
  success: boolean;
  id?: string;
  error?: string;
}

export interface BatchScrapePageData {
  url: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata: ScrapeMetadata;
  changeTracking?: ChangeTrackingResult;
}

export type BatchScrapeStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface FirecrawlBatchScrapeStatusResponse {
  status: BatchScrapeStatus;
  total: number;
  completed: number;
  data?: BatchScrapePageData[];
  error?: string;
}

export interface BatchScrapeJobResult {
  jobId: string;
  status: BatchScrapeStatus;
  total: number;
  completed: number;
  pages?: BatchScrapePageData[];
}

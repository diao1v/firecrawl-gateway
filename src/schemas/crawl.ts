import { z } from 'zod';
import { urlSchema, formatSchema, metadataSchema } from './common.js';

export const crawlRequestSchema = z.object({
  url: urlSchema,
  maxDepth: z.number().int().min(0).max(10).optional().default(2),
  limit: z.number().int().min(1).max(1000).optional().default(10),
  formats: z.array(formatSchema).optional().default(['markdown']),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  webhookUrl: z.string().url().optional(),
});

export type CrawlRequest = z.infer<typeof crawlRequestSchema>;

export const crawlStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
]);

export type CrawlStatus = z.infer<typeof crawlStatusSchema>;

export const crawlPageSchema = z.object({
  url: z.string(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  rawHtml: z.string().optional(),
  links: z.array(z.string()).optional(),
  metadata: metadataSchema,
});

export type CrawlPage = z.infer<typeof crawlPageSchema>;

export const crawlJobSchema = z.object({
  jobId: z.string(),
  status: crawlStatusSchema,
  pages: z.array(crawlPageSchema).optional(),
  totalPages: z.number().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export type CrawlJob = z.infer<typeof crawlJobSchema>;

export const crawlStartResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string(),
    status: z.literal('pending'),
  }),
});

export type CrawlStartResponse = z.infer<typeof crawlStartResponseSchema>;

export const crawlStatusResponseSchema = z.object({
  success: z.literal(true),
  data: crawlJobSchema,
});

export type CrawlStatusResponse = z.infer<typeof crawlStatusResponseSchema>;

export const webhookPayloadSchema = z.object({
  jobId: z.string(),
  status: crawlStatusSchema,
  pages: z.array(crawlPageSchema).optional(),
  totalPages: z.number().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

import { z } from 'zod';
import { urlSchema, formatSchema, changeTrackingOptionsSchema, changeTrackingResultSchema, metadataSchema } from './common.js';

export const batchScrapeRequestSchema = z.object({
  urls: z.array(urlSchema).min(1).max(100),
  formats: z.array(formatSchema).optional().default(['markdown']),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  waitFor: z.number().int().positive().max(30000).optional(),
  changeTracking: z.boolean().optional(),
  changeTrackingOptions: changeTrackingOptionsSchema.optional(),
  webhookUrl: urlSchema.optional(),
  webhookEvents: z.array(z.enum(['started', 'page', 'completed'])).optional(),
});

export type BatchScrapeRequest = z.infer<typeof batchScrapeRequestSchema>;

export const batchScrapeStartResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string(),
    status: z.enum(['pending', 'processing']),
  }),
});

export type BatchScrapeStartResponse = z.infer<typeof batchScrapeStartResponseSchema>;

export const batchScrapePageResultSchema = z.object({
  url: z.string(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  rawHtml: z.string().optional(),
  links: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  metadata: metadataSchema,
  changeTracking: changeTrackingResultSchema.optional(),
});

export type BatchScrapePageResult = z.infer<typeof batchScrapePageResultSchema>;

export const batchScrapeStatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    total: z.number(),
    completed: z.number(),
    pages: z.array(batchScrapePageResultSchema).optional(),
  }),
});

export type BatchScrapeStatusResponse = z.infer<typeof batchScrapeStatusResponseSchema>;

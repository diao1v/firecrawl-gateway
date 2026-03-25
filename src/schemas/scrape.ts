import { z } from 'zod';
import { urlSchema, formatSchema, metadataSchema, changeTrackingOptionsSchema, changeTrackingResultSchema } from './common.js';

export const scrapeRequestSchema = z.object({
  url: urlSchema,
  formats: z.array(formatSchema).optional().default(['markdown']),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  waitFor: z.number().int().positive().max(30000).optional(),
  timeout: z.number().int().positive().min(1000).max(60000).optional(),
  changeTracking: z.boolean().optional(),
  changeTrackingOptions: changeTrackingOptionsSchema.optional(),
});

export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

export const scrapeResultSchema = z.object({
  url: z.string(),
  markdown: z.string().optional(),
  html: z.string().optional(),
  rawHtml: z.string().optional(),
  links: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  metadata: metadataSchema,
  changeTracking: changeTrackingResultSchema.optional(),
});

export type ScrapeResultSchema = z.infer<typeof scrapeResultSchema>;

export const scrapeResponseSchema = z.object({
  success: z.literal(true),
  data: scrapeResultSchema,
});

export type ScrapeResponse = z.infer<typeof scrapeResponseSchema>;

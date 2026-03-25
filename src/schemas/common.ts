import { z } from 'zod';

export const urlSchema = z.string().url('Invalid URL format');

export const formatSchema = z.enum([
  'markdown',
  'html',
  'rawHtml',
  'links',
  'screenshot',
]);

export const metadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  sourceURL: z.string(),
  statusCode: z.number().optional(),
}).passthrough();

// Change Tracking schemas
export const changeStatusSchema = z.enum(['new', 'same', 'changed', 'removed']);

export const changeTrackingOptionsSchema = z.object({
  modes: z.array(z.enum(['git-diff', 'json'])).optional(),
  tag: z.string().optional(),
});

export const changeTrackingResultSchema = z.object({
  changeStatus: changeStatusSchema,
  previousScrapeAt: z.string().nullable(),
  diff: z.string().optional(),
});

export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});

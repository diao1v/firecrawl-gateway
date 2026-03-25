import { z } from 'zod';
import { urlSchema } from './common.js';

// JSON Schema type for extraction schema definition
const jsonSchemaPropertySchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.record(z.unknown())
);

export const extractionSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(jsonSchemaPropertySchema),
  required: z.array(z.string()).optional(),
});

export type ExtractionSchema = z.infer<typeof extractionSchemaSchema>;

export const extractRequestSchema = z.object({
  url: urlSchema,
  schema: extractionSchemaSchema,
  prompt: z.string().optional(),
  systemPrompt: z.string().optional(),
  timeout: z.number().int().positive().min(1000).max(60000).optional(),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export const extractResultSchema = z.object({
  url: z.string(),
  data: z.record(z.unknown()),
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    sourceURL: z.string(),
  }).passthrough().optional(),
});

export type ExtractResult = z.infer<typeof extractResultSchema>;

export const extractResponseSchema = z.object({
  success: z.literal(true),
  data: extractResultSchema,
});

export type ExtractResponse = z.infer<typeof extractResponseSchema>;

import { Hono } from 'hono';
import { extractRequestSchema } from '../schemas/extract.js';
import { firecrawlService } from '../services/firecrawl.js';
import { ValidationError } from '../lib/errors.js';
import type { AppVariables } from '../types/index.js';

const extract = new Hono<{ Variables: AppVariables }>();

extract.post('/', async (c) => {
  const body = await c.req.json();
  const parseResult = extractRequestSchema.safeParse(body);

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

  const result = await firecrawlService.extract(
    {
      url: request.url,
      schema: request.schema,
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      timeout: request.timeout,
    },
    requestId
  );

  return c.json({
    success: true,
    data: result,
  });
});

export { extract };

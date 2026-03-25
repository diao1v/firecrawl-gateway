import { z } from 'zod';

// Client tokens format: JSON object mapping clientId -> token
// Example: {"crawlbrief": "token1", "monitor-app": "token2"}
const clientTokensSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return new Map<string, string>();
    try {
      const parsed = JSON.parse(val) as Record<string, string>;
      return new Map(Object.entries(parsed));
    } catch {
      return new Map<string, string>();
    }
  });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  // Anonymous API tokens (comma-separated)
  FIRECRAWL_GATEWAY_API_TOKENS: z
    .string()
    .optional()
    .default('')
    .transform((val) => val.split(',').map((t) => t.trim()).filter(Boolean)),
  // Per-client tokens with client identification (JSON format)
  FIRECRAWL_GATEWAY_CLIENT_TOKENS: clientTokensSchema,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FIRECRAWL_URL: z.string().url().default('http://localhost:3002'),
});

// Validate that at least one auth method is configured
function validateAuth(config: z.infer<typeof envSchema>) {
  const hasApiTokens = config.FIRECRAWL_GATEWAY_API_TOKENS.length > 0;
  const hasClientTokens = config.FIRECRAWL_GATEWAY_CLIENT_TOKENS.size > 0;

  if (!hasApiTokens && !hasClientTokens) {
    console.error('Invalid environment configuration:');
    console.error('  - At least one of FIRECRAWL_GATEWAY_API_TOKENS or FIRECRAWL_GATEWAY_CLIENT_TOKENS must be configured');
    process.exit(1);
  }
}

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  validateAuth(result.data);

  return result.data;
}

export const config = loadConfig();

export type Config = z.infer<typeof envSchema>;

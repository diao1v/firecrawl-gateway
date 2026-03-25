import { timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { config } from '../config.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AppVariables } from '../types/index.js';

interface AuthResult {
  valid: boolean;
  clientId?: string;
}

// Timing-safe string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function validateToken(token: string): AuthResult {
  // Check per-client tokens first (has priority and provides client identification)
  for (const [clientId, clientToken] of config.FIRECRAWL_GATEWAY_CLIENT_TOKENS.entries()) {
    if (safeCompare(clientToken, token)) {
      return { valid: true, clientId };
    }
  }

  // Fall back to anonymous API tokens
  for (const apiToken of config.FIRECRAWL_GATEWAY_API_TOKENS) {
    if (safeCompare(apiToken, token)) {
      return { valid: true, clientId: undefined };
    }
  }

  return { valid: false };
}

export async function authMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new UnauthorizedError('Missing Authorization header');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Invalid Authorization header format');
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new UnauthorizedError('Missing token');
  }

  const result = validateToken(token);

  if (!result.valid) {
    throw new UnauthorizedError('Invalid token');
  }

  // Set client ID in context for logging and tracking
  if (result.clientId) {
    c.set('clientId', result.clientId);
  }

  await next();
}

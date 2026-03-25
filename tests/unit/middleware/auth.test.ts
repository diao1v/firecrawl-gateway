import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../../../src/middleware/auth.js';
import { AppError } from '../../../src/lib/errors.js';
import type { AppVariables } from '../../../src/types/index.js';

describe('authMiddleware', () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeAll(() => {
    app = new Hono<{ Variables: AppVariables }>();
    app.use('*', authMiddleware);
    app.get('/test', (c) => {
      const clientId = c.get('clientId');
      return c.json({ success: true, clientId: clientId || null });
    });

    // Add error handler for tests
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json(err.toJSON(), err.statusCode);
      }
      return c.json({ success: false, error: { message: err.message } }, 500);
    });
  });

  it('should reject requests without Authorization header', async () => {
    const res = await app.request('/test');
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Missing Authorization header');
  });

  it('should reject requests with invalid Authorization header format', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic invalid' },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid Authorization header format');
  });

  it('should reject requests with empty token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer ' },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    // "Bearer " without a token is treated as invalid format
    expect(body.error.message).toBe('Invalid Authorization header format');
  });

  it('should reject requests with invalid token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Invalid token');
  });

  it('should allow requests with valid token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer test-token-1' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should allow requests with any valid token from the list', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer test-token-2' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // Client token tests
  it('should allow requests with valid client token', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer client-token-1' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('should set clientId for client tokens', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer client-token-1' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.clientId).toBe('test-client');
  });

  it('should set different clientId for different client tokens', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer client-token-2' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.clientId).toBe('another-client');
  });

  it('should not set clientId for anonymous API tokens', async () => {
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer test-token-1' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.clientId).toBe(null);
  });
});

import { describe, it, expect } from 'vitest';
import { crawlRequestSchema } from '../../../src/schemas/crawl.js';

describe('crawlRequestSchema', () => {
  it('should validate a minimal valid request', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe('https://example.com');
      expect(result.data.maxDepth).toBe(2); // default
      expect(result.data.limit).toBe(10); // default
      expect(result.data.formats).toEqual(['markdown']); // default
    }
  });

  it('should validate a full request', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
      maxDepth: 3,
      limit: 50,
      formats: ['markdown', 'html'],
      includePaths: ['/blog/*'],
      excludePaths: ['/admin/*'],
      webhookUrl: 'https://webhook.example.com/callback',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDepth).toBe(3);
      expect(result.data.limit).toBe(50);
      expect(result.data.formats).toEqual(['markdown', 'html']);
      expect(result.data.includePaths).toEqual(['/blog/*']);
      expect(result.data.excludePaths).toEqual(['/admin/*']);
      expect(result.data.webhookUrl).toBe('https://webhook.example.com/callback');
    }
  });

  it('should reject invalid URL', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid webhookUrl', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
      webhookUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('should reject maxDepth exceeding limit', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
      maxDepth: 15, // max is 10
    });

    expect(result.success).toBe(false);
  });

  it('should reject limit exceeding maximum', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
      limit: 2000, // max is 1000
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid formats', () => {
    const result = crawlRequestSchema.safeParse({
      url: 'https://example.com',
      formats: ['invalid-format'],
    });

    expect(result.success).toBe(false);
  });
});

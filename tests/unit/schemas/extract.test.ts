import { describe, it, expect } from 'vitest';
import { extractRequestSchema } from '../../../src/schemas/extract.js';

describe('extractRequestSchema', () => {
  it('should validate a minimal valid request', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('should validate a full request with prompt', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          price: { type: 'number' },
          available: { type: 'boolean' },
        },
        required: ['title', 'price'],
      },
      prompt: 'Extract product information',
      systemPrompt: 'You are a product data extractor',
      timeout: 45000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('Extract product information');
      expect(result.data.systemPrompt).toBe('You are a product data extractor');
      expect(result.data.timeout).toBe(45000);
    }
  });

  it('should reject invalid URL', () => {
    const result = extractRequestSchema.safeParse({
      url: 'not-a-url',
      schema: {
        type: 'object',
        properties: {},
      },
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing schema', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid schema type', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
      schema: {
        type: 'array', // must be 'object'
        properties: {},
      },
    });

    expect(result.success).toBe(false);
  });

  it('should reject timeout exceeding maximum', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
      schema: {
        type: 'object',
        properties: {},
      },
      timeout: 120000, // max is 60000
    });

    expect(result.success).toBe(false);
  });

  it('should accept nested schema properties', () => {
    const result = extractRequestSchema.safeParse({
      url: 'https://example.com',
      schema: {
        type: 'object',
        properties: {
          product: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              specs: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});

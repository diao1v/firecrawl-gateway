import { describe, it, expect } from 'vitest';
import { isPrivateUrl, validateWebhookUrl } from '../../../src/lib/url-validator.js';

describe('isPrivateUrl', () => {
  it('should block localhost', () => {
    expect(isPrivateUrl('http://localhost/webhook')).toBe(true);
    expect(isPrivateUrl('https://localhost:8080/webhook')).toBe(true);
  });

  it('should block 127.0.0.1', () => {
    expect(isPrivateUrl('http://127.0.0.1/webhook')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.255/webhook')).toBe(true);
  });

  it('should block private Class A (10.x.x.x)', () => {
    expect(isPrivateUrl('http://10.0.0.1/webhook')).toBe(true);
    expect(isPrivateUrl('http://10.255.255.255/webhook')).toBe(true);
  });

  it('should block private Class B (172.16-31.x.x)', () => {
    expect(isPrivateUrl('http://172.16.0.1/webhook')).toBe(true);
    expect(isPrivateUrl('http://172.31.255.255/webhook')).toBe(true);
  });

  it('should block private Class C (192.168.x.x)', () => {
    expect(isPrivateUrl('http://192.168.0.1/webhook')).toBe(true);
    expect(isPrivateUrl('http://192.168.255.255/webhook')).toBe(true);
  });

  it('should block link-local (169.254.x.x)', () => {
    expect(isPrivateUrl('http://169.254.0.1/webhook')).toBe(true);
  });

  it('should allow public IPs', () => {
    expect(isPrivateUrl('https://8.8.8.8/webhook')).toBe(false);
    expect(isPrivateUrl('https://1.1.1.1/webhook')).toBe(false);
  });

  it('should allow public domains', () => {
    expect(isPrivateUrl('https://example.com/webhook')).toBe(false);
    expect(isPrivateUrl('https://api.myapp.com/webhook')).toBe(false);
  });

  it('should block non-HTTP protocols', () => {
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
    expect(isPrivateUrl('ftp://example.com/file')).toBe(true);
  });

  it('should handle invalid URLs', () => {
    expect(isPrivateUrl('not-a-url')).toBe(true);
    expect(isPrivateUrl('')).toBe(true);
  });
});

describe('validateWebhookUrl', () => {
  it('should accept valid public HTTPS URLs', () => {
    const result = validateWebhookUrl('https://webhook.example.com/callback');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept valid public HTTP URLs', () => {
    const result = validateWebhookUrl('http://webhook.example.com/callback');
    expect(result.valid).toBe(true);
  });

  it('should reject localhost URLs', () => {
    const result = validateWebhookUrl('http://localhost:3000/webhook');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private');
  });

  it('should reject private IP URLs', () => {
    const result = validateWebhookUrl('http://192.168.1.1/webhook');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('private');
  });

  it('should reject non-HTTP protocols', () => {
    const result = validateWebhookUrl('ftp://example.com/file');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTP');
  });

  it('should reject invalid URLs', () => {
    const result = validateWebhookUrl('not-a-url');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });
});

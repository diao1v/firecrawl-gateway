import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../src/lib/retry.js';

describe('withRetry', () => {
  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      shouldRetry: () => true,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent error'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        shouldRetry: () => true,
      })
    ).rejects.toThrow('persistent error');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry if shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable error'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('non-retryable error');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use exponential backoff', async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      delays.push(delay as number);
      return originalSetTimeout(fn, 1); // Execute immediately in tests
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockResolvedValue('success');

    await withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 10000,
      shouldRetry: () => true,
    });

    // Should have 2 delays (after 1st and 2nd failures)
    expect(delays.length).toBe(2);
    // First delay should be around 100ms (with jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThanOrEqual(130); // 100 + 30% jitter
    // Second delay should be around 200ms (with jitter)
    expect(delays[1]).toBeGreaterThanOrEqual(200);
    expect(delays[1]).toBeLessThanOrEqual(260); // 200 + 30% jitter

    vi.restoreAllMocks();
  });
});

import { URL } from 'node:url';

// Private IP ranges that should be blocked for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./,                          // Loopback
  /^10\./,                           // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Private Class B
  /^192\.168\./,                     // Private Class C
  /^169\.254\./,                     // Link-local
  /^0\./,                            // Current network
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
];

export function isPrivateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Block localhost variants
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return true;
    }

    // Block private IP patterns
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    // Block non-HTTP(S) protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return true;
    }

    return false;
  } catch {
    // Invalid URL
    return true;
  }
}

export function validateWebhookUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return { valid: false, error: 'Webhook URL must use HTTP or HTTPS protocol' };
    }

    if (isPrivateUrl(urlString)) {
      return { valid: false, error: 'Webhook URL cannot point to private or local addresses' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid webhook URL format' };
  }
}

// Set test environment variables before any imports
process.env.FIRECRAWL_GATEWAY_API_TOKENS = 'test-token-1,test-token-2';
process.env.FIRECRAWL_GATEWAY_CLIENT_TOKENS = JSON.stringify({
  'test-client': 'client-token-1',
  'another-client': 'client-token-2',
});
process.env.FIRECRAWL_URL = 'http://localhost:3002';
process.env.LOG_LEVEL = 'error';

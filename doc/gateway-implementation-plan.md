# Firecrawl Gateway - Implementation Plan

## Overview
Build a Hono-based TypeScript gateway that authenticates requests and proxies them to a self-hosted Firecrawl instance.

## Technology Decisions

| Aspect | Choice |
|--------|--------|
| Runtime | Node.js |
| Package Manager | pnpm |
| Framework | Hono |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Deployment | Docker + Docker Compose |

## Project Structure

```
firecrawl-gateway/
├── src/
│   ├── index.ts                 # App entry point
│   ├── app.ts                   # Hono app setup
│   ├── config.ts                # Environment config with validation
│   ├── routes/
│   │   ├── health.ts            # GET /health
│   │   ├── scrape.ts            # POST /scrape
│   │   ├── crawl.ts             # POST /crawl (Phase 2)
│   │   └── extract.ts           # POST /extract (Phase 3)
│   ├── middleware/
│   │   ├── auth.ts              # Bearer token validation
│   │   ├── request-id.ts        # Request ID generation
│   │   └── logger.ts            # Request logging middleware
│   ├── services/
│   │   └── firecrawl.ts         # Firecrawl HTTP client
│   ├── schemas/
│   │   ├── scrape.ts            # Scrape request/response schemas
│   │   ├── crawl.ts             # Crawl request/response schemas
│   │   └── common.ts            # Shared schemas
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── lib/
│       ├── errors.ts            # Custom error classes
│       └── logger.ts            # Pino logger setup
├── tests/
│   ├── unit/
│   │   └── middleware/
│   │       └── auth.test.ts
│   └── integration/
│       └── routes/
│           └── scrape.test.ts
├── docker/
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Environment Variables

```bash
# Gateway
PORT=3000
API_TOKENS=token1,token2,token3    # Comma-separated valid tokens
LOG_LEVEL=info

# Firecrawl
FIRECRAWL_URL=http://firecrawl-api:3002
```

## API Design

### Authentication
- All endpoints except `/health` require `Authorization: Bearer <token>` header
- Tokens are validated against `API_TOKENS` env var (comma-separated list)
- Invalid/missing token returns `401 Unauthorized`

### Endpoints

#### GET /health
- No auth required
- Returns: `{ status: "ok", timestamp: "ISO8601" }`

#### POST /scrape
Request:
```json
{
  "url": "https://example.com",
  "formats": ["markdown", "html"],      // optional, default: ["markdown"]
  "includeTags": ["article", "main"],   // optional
  "excludeTags": ["nav", "footer"],     // optional
  "waitFor": 1000,                      // optional, ms to wait
  "timeout": 30000                      // optional, default 30s, max 60s
}
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "markdown": "...",
    "html": "...",                      // if requested
    "metadata": {
      "title": "...",
      "description": "...",
      "language": "en",
      "sourceURL": "https://example.com"
    },
    "links": ["..."]                    // if requested via formats
  }
}
```

#### POST /crawl (Phase 2)
Request:
```json
{
  "url": "https://example.com",
  "maxDepth": 2,                        // optional
  "limit": 10,                          // optional, max pages
  "formats": ["markdown"],
  "includePaths": ["/blog/*"],          // optional
  "excludePaths": ["/admin/*"],         // optional
  "webhookUrl": "https://app.com/hook"  // optional, called on completion
}
```

Response (immediate):
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "pending"
  }
}
```

#### GET /crawl/:jobId (Phase 2)
Poll for crawl job status.

Response:
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "completed",              // pending | running | completed | failed
    "pages": [
      { "url": "...", "markdown": "...", "metadata": {...} }
    ],
    "totalPages": 5,
    "completedAt": "ISO8601"
  }
}
```

#### Webhook Callback (Phase 2)
When `webhookUrl` is provided, gateway POSTs to that URL on completion:
```json
{
  "jobId": "uuid",
  "status": "completed",
  "pages": [...],
  "totalPages": 5,
  "completedAt": "ISO8601"
}
```

### Error Response Format
All errors follow a consistent shape:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {}                       // optional, validation details
  }
}
```

Error codes:
- `UNAUTHORIZED` - Missing or invalid token
- `VALIDATION_ERROR` - Request validation failed
- `UPSTREAM_ERROR` - Firecrawl returned an error
- `TIMEOUT` - Request timed out
- `INTERNAL_ERROR` - Unexpected server error

## Implementation Phases

### Phase 1: Core Foundation
1. **Project setup**
   - Initialize pnpm project
   - Configure TypeScript (strict mode, ES modules)
   - Set up Vitest
   - Create folder structure

2. **Configuration**
   - Create `config.ts` with Zod validation for env vars
   - Create `.env.example`

3. **Logging**
   - Set up Pino logger with request ID support
   - Create logging middleware

4. **Authentication middleware**
   - Implement Bearer token validation
   - Return standardized 401 errors

5. **Health endpoint**
   - Simple GET /health route

6. **Firecrawl service**
   - HTTP client wrapper for Firecrawl API
   - Error handling and timeout support

7. **Scrape endpoint**
   - Zod schemas for request/response
   - Route handler with validation
   - Forward to Firecrawl, normalize response

8. **Docker setup**
   - Dockerfile for gateway
   - docker-compose.yml with Firecrawl stack

9. **Tests**
   - Unit tests for auth middleware
   - Integration tests for scrape endpoint

### Phase 2: Crawl & Reliability
1. **Crawl endpoints**
   - POST /crawl - Start async crawl job
   - GET /crawl/:jobId - Poll job status
   - Webhook callback when job completes (if webhookUrl provided)
   - Zod schemas for request/response

2. **Webhook service**
   - POST to client-provided webhookUrl on completion
   - Include job results in payload
   - Retry failed webhook deliveries

3. **Retry logic**
   - Retry transient upstream failures
   - Exponential backoff

4. **Structured logging**
   - Log upstream latency
   - Log error codes
   - Caller identity in logs

### Phase 3: Extract & Extras
1. **Extract endpoint** (if needed)
   - LLM-based structured extraction
   - Custom schema support

2. **Per-client tokens** (if needed)
   - Client identification
   - Usage tracking

## Docker Compose Services

```yaml
services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - API_TOKENS=${API_TOKENS}
      - FIRECRAWL_URL=http://firecrawl-api:3002
    depends_on:
      - firecrawl-api

  firecrawl-api:
    image: mendableai/firecrawl:latest
    # internal only, no port exposure
    environment:
      - REDIS_URL=redis://redis:6379
      - USE_DB_AUTHENTICATION=false
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    # internal only
```

## Resolved Decisions
- **Crawl mode**: Async with polling + webhook callback option
- **Rate limiting**: Skip for Phase 1
- **Timeouts**: 30s default, 60s max for scrape requests

## Files to Create (Phase 1)

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config |
| `vitest.config.ts` | Test config |
| `.env.example` | Environment template |
| `src/index.ts` | Entry point |
| `src/app.ts` | Hono app setup |
| `src/config.ts` | Env config with Zod |
| `src/lib/logger.ts` | Pino setup |
| `src/lib/errors.ts` | Error classes |
| `src/middleware/auth.ts` | Auth middleware |
| `src/middleware/request-id.ts` | Request ID middleware |
| `src/middleware/logger.ts` | Logging middleware |
| `src/services/firecrawl.ts` | Firecrawl client |
| `src/schemas/scrape.ts` | Scrape schemas |
| `src/schemas/common.ts` | Shared schemas |
| `src/routes/health.ts` | Health route |
| `src/routes/scrape.ts` | Scrape route |
| `docker/Dockerfile` | Gateway image |
| `docker-compose.yml` | Full stack |
| `tests/unit/middleware/auth.test.ts` | Auth tests |

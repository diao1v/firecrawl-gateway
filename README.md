# Firecrawl Gateway

An authenticated proxy for self-hosted Firecrawl that provides a stable API for multiple downstream applications.

## Overview

Firecrawl Gateway sits between your applications and a self-hosted Firecrawl instance, providing:
- **Authentication** - Bearer token validation (anonymous or per-client)
- **Logging** - Request tracking with client identification
- **Normalization** - Consistent API responses and error handling
- **Security** - SSRF protection, timing-safe token comparison

## Architecture

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│  CrawlBrief │      │    Firecrawl    │      │  Firecrawl  │
│  (Client)   │ ───► │  Gateway (:3000)│ ───► │  API (:3002)│
└─────────────┘      └─────────────────┘      └─────────────┘
                            │
                     Authentication
                     + Logging
                     + SSRF Protection
```

## Features

- **POST /scrape** - Scrape a single URL
- **POST /crawl** - Start async crawl job
- **GET /crawl/:jobId** - Poll crawl status
- **POST /batch/scrape** - Batch scrape with webhooks
- **POST /extract** - LLM-powered structured extraction
- **GET /health** - Health check (no auth required)

## Quick Start

### Prerequisites

- Node.js 20+
- Self-hosted Firecrawl running (default port 3002)

### Installation

```bash
# Clone and install
git clone <repo-url>
cd firecrawl-gateway
pnpm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Run development server
pnpm dev
```

### Docker Deployment

```bash
# Configure
cp .env.example .env
# Edit .env

# Build and run
docker compose up -d --build
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Gateway port |
| `FIRECRAWL_URL` | Yes | `http://localhost:3002` | Firecrawl API URL |
| `FIRECRAWL_GATEWAY_API_TOKENS` | One of these | - | Comma-separated anonymous tokens |
| `FIRECRAWL_GATEWAY_CLIENT_TOKENS` | required | - | JSON: `{"clientId":"token"}` |
| `LOG_LEVEL` | No | `info` | Log level (fatal/error/warn/info/debug/trace) |

### Authentication Options

**Option 1: Anonymous tokens** (simple)
```bash
FIRECRAWL_GATEWAY_API_TOKENS=token1,token2
```

**Option 2: Per-client tokens** (recommended - enables tracking)
```bash
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"secret-token","other-app":"other-token"}
```

Generate strong tokens:
```bash
openssl rand -hex 32
```

## API Usage

### Scrape

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "formats": ["markdown"]}'
```

### Start Crawl

```bash
curl -X POST http://localhost:3000/crawl \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "limit": 10,
    "webhookUrl": "https://your-app.com/webhook"
  }'
```

### Poll Crawl Status

```bash
curl http://localhost:3000/crawl/{jobId} \
  -H "Authorization: Bearer your-token"
```

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UPSTREAM_ERROR` | 502 | Firecrawl returned an error |
| `TIMEOUT` | 504 | Request timed out |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Documentation

- [Deployment Guide](doc/deployment-guide.md) - VPS deployment with Docker
- [Usage Guide](doc/gateway-usage-guide.md) - Full API reference
- [Engineering Doc](doc/gateway-engineering-doc.md) - Architecture and decisions

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

## License

MIT

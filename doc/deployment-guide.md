# Firecrawl Gateway - Deployment Guide

This guide covers deploying Firecrawl Gateway on a VPS alongside self-hosted Firecrawl.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture](#architecture)
3. [Firecrawl Setup](#firecrawl-setup)
4. [Gateway Deployment](#gateway-deployment)
5. [Caddy Reverse Proxy](#caddy-reverse-proxy)
6. [Firewall Configuration](#firewall-configuration)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### VPS Requirements

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **RAM**: Minimum 4GB (Firecrawl needs resources for Playwright)
- **CPU**: 2+ vCPUs recommended
- **Storage**: 20GB+ SSD

### External Services

- Domain name (optional - can use IP with nip.io)

---

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                          VPS                                 │
│                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Caddy   │───►│   Gateway    │───►│    Firecrawl     │   │
│  │  :443    │    │    :3000     │    │     :3002        │   │
│  └──────────┘    └──────────────┘    └──────────────────┘   │
│       │                                      │               │
│       │              ┌───────────────────────┘               │
│       │              ▼                                       │
│       │         ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│       │         │ Redis   │  │ Postgres│  │Playwright│       │
│       │         │ :6379   │  │  :5432  │  │  :9222  │       │
│       │         └─────────┘  └─────────┘  └─────────┘       │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐                                           │
│  │  CrawlBrief  │  (connects via localhost:3000)            │
│  │    :3001     │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

**Port Summary:**
| Service | Port | Exposed |
|---------|------|---------|
| Caddy | 443 | Public (HTTPS) |
| Gateway | 3000 | Internal only |
| Firecrawl | 3002 | Internal only |
| CrawlBrief | 3001 | Internal only |

---

## Firecrawl Setup

Firecrawl is deployed from the official repository.

### 1. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

### 2. Clone Firecrawl

```bash
# Create directory
sudo mkdir -p /opt/firecrawl
sudo chown $USER:$USER /opt/firecrawl

# Clone official repo
git clone https://github.com/mendableai/firecrawl.git /opt/firecrawl
cd /opt/firecrawl
```

### 3. Configure Firecrawl

```bash
# Copy example env
cp .env.example .env
nano .env
```

**Key settings:**
```env
# Required
FIRECRAWL_API_KEY=fc-your-api-key  # Internal use, not exposed

# Optional: For /extract endpoint (LLM-powered)
OPENAI_API_KEY=sk-your-openai-key
```

### 4. Start Firecrawl

```bash
cd /opt/firecrawl
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f api
```

### 5. Verify Firecrawl

```bash
# Test health endpoint
curl http://localhost:3002/health

# Test scrape (internal API key)
curl -X POST http://localhost:3002/v1/scrape \
  -H "Authorization: Bearer fc-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## Gateway Deployment

### 1. Clone Gateway

```bash
# Create directory
mkdir -p /home/$USER/firecrawl-gateway
cd /home/$USER

# Clone your gateway repo
git clone <your-gateway-repo> firecrawl-gateway
cd firecrawl-gateway
```

### 2. Configure Gateway

```bash
cp .env.example .env
nano .env
```

**Configuration:**
```env
# Gateway settings
PORT=3000
LOG_LEVEL=info

# Authentication - generate strong token
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"$(openssl rand -hex 32)"}

# Firecrawl URL (use host.docker.internal since Gateway runs in Docker)
FIRECRAWL_URL=http://host.docker.internal:3002
```

> **Important:** Save the token you generate - you'll need it for CrawlBrief's `CRAWLBRIEF_GATEWAY_TOKEN`.

### 3. Build and Start

```bash
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### 4. Verify Gateway

```bash
# Health check (no auth)
curl http://localhost:3000/health

# Test scrape (with your token)
curl -X POST http://localhost:3000/scrape \
  -H "Authorization: Bearer your-generated-token" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "formats": ["markdown"]}'
```

---

## Caddy Reverse Proxy

Use Caddy for automatic HTTPS. Gateway only needs external access if you want to call it from outside the VPS.

### 1. Create Caddy Directory

```bash
sudo mkdir -p /opt/caddy/data /opt/caddy/config
```

### 2. Create Caddyfile

```bash
sudo nano /opt/caddy/Caddyfile
```

**Option A: With Domain**
```caddyfile
# Gateway API (if external access needed)
gateway.yourdomain.com {
    reverse_proxy localhost:3000

    # Increase timeout for long scrapes
    request_body {
        max_size 50MB
    }
}

# CrawlBrief (if external access needed)
crawlbrief.yourdomain.com {
    reverse_proxy localhost:3001
}
```

**Option B: With nip.io (IP only)**
```caddyfile
# Replace 123.45.67.89 with your VPS IP
gateway.123.45.67.89.nip.io {
    reverse_proxy localhost:3000
}

crawlbrief.123.45.67.89.nip.io {
    reverse_proxy localhost:3001
}
```

**Option C: Internal only (no Caddy needed for Gateway)**

If all services are on the same VPS and CrawlBrief connects via `localhost:3000`, you don't need Caddy for the Gateway.

### 3. Run Caddy

```bash
docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network host \
  -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /opt/caddy/data:/data \
  -v /opt/caddy/config:/config \
  caddy:2-alpine
```

### 4. Verify

```bash
# Check Caddy
docker logs caddy

# Test HTTPS
curl https://gateway.yourdomain.com/health
```

---

## Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTPS (Caddy)
sudo ufw allow 443/tcp

# Block direct access to internal services
# (They're on 127.0.0.1 so already blocked, but be explicit)
sudo ufw deny 3000/tcp
sudo ufw deny 3001/tcp
sudo ufw deny 3002/tcp

# Check status
sudo ufw status
```

---

## Monitoring & Maintenance

### View Logs

```bash
# Gateway logs
cd /home/$USER/firecrawl-gateway
docker compose logs -f

# Firecrawl logs
cd /opt/firecrawl
docker compose logs -f api

# Caddy logs
docker logs -f caddy
```

### Restart Services

```bash
# Restart Gateway
cd /home/$USER/firecrawl-gateway
docker compose restart

# Restart Firecrawl
cd /opt/firecrawl
docker compose restart

# Restart Caddy
docker restart caddy
```

### Update Gateway

```bash
cd /home/$USER/firecrawl-gateway
git pull
docker compose up -d --build
```

### Update Firecrawl

```bash
cd /opt/firecrawl
git pull
docker compose down
docker compose up -d --build
```

### Health Checks

```bash
# Gateway
curl -s http://localhost:3000/health | jq

# Firecrawl
curl -s http://localhost:3002/health

# CrawlBrief (if running)
curl -s http://localhost:3001/health | jq
```

---

## Troubleshooting

### Gateway Can't Connect to Firecrawl

```bash
# Check Firecrawl is running
cd /opt/firecrawl && docker compose ps

# Check Firecrawl health
curl http://localhost:3002/health

# Check Gateway logs for errors
cd /home/$USER/firecrawl-gateway
docker compose logs --tail 50
```

**Common fixes:**
- Ensure `FIRECRAWL_URL=http://host.docker.internal:3002` in Gateway .env
- Restart Gateway: `docker compose restart`

### Authentication Errors

```bash
# Check token is set correctly
docker compose exec gateway printenv | grep FIRECRAWL_GATEWAY

# Verify token format (should be valid JSON for client tokens)
echo '{"crawlbrief":"token"}' | jq
```

### Scrape Timeout

```bash
# Check Firecrawl resources
cd /opt/firecrawl
docker stats

# Playwright might need more memory
# Edit Firecrawl docker-compose.yml to increase memory limits
```

### Port Conflicts

```bash
# Check what's using ports
sudo lsof -i :3000
sudo lsof -i :3002

# Stop conflicting services
docker ps -a  # Find and stop conflicting containers
```

---

## Quick Reference

### Service Commands

```bash
# Gateway
cd /home/$USER/firecrawl-gateway
docker compose up -d --build    # Start/rebuild
docker compose logs -f          # View logs
docker compose restart          # Restart
docker compose down             # Stop

# Firecrawl
cd /opt/firecrawl
docker compose up -d            # Start
docker compose logs -f api      # View API logs
docker compose restart          # Restart
docker compose down             # Stop

# Caddy
docker restart caddy
docker logs caddy
```

### Important Paths

| Path | Description |
|------|-------------|
| `/home/$USER/firecrawl-gateway` | Gateway code and config |
| `/opt/firecrawl` | Firecrawl installation |
| `/opt/caddy/Caddyfile` | Caddy reverse proxy config |

### Token for CrawlBrief

After setting up Gateway, configure CrawlBrief to use it:

```env
# In CrawlBrief .env
CRAWLBRIEF_GATEWAY_URL=http://localhost:3000
CRAWLBRIEF_GATEWAY_TOKEN=<token from FIRECRAWL_GATEWAY_CLIENT_TOKENS>
```

---

## Security Checklist

- [ ] Strong tokens generated with `openssl rand -hex 32`
- [ ] Firewall configured (only 22, 443 open)
- [ ] Gateway/Firecrawl ports (3000, 3002) not exposed
- [ ] Caddy handling HTTPS with auto-renewal
- [ ] Per-client tokens for tracking (not anonymous)
- [ ] Fail2ban installed (optional)

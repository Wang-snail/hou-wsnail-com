# 🔒 安全配置说明 / Security Configuration Guide

本文档说明本项目的安全配置和部署前的必要设置。  
This document describes the security configuration and necessary setup before deployment.

## 📋 部署前必须配置 / Required Configuration Before Deployment

### 1. 🔐 管理后台认证 / Admin Authentication

所有 `/api/nodes` 相关接口（包括读取和写入）现已要求认证。  
All `/api/nodes` endpoints (including read and write operations) now require authentication.

**必须在 EdgeOne Pages 环境变量中设置：**  
**Must be set in EdgeOne Pages environment variables:**

```
ADMIN_TOKEN=<一个强随机令牌 / a strong random token>
```

**生成安全令牌示例 / Generate secure token example:**

```bash
# 使用 OpenSSL 生成 32 字节随机令牌
# Generate 32-byte random token using OpenSSL
openssl rand -base64 32

# 或使用 Node.js
# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**API 调用示例 / API call example:**

```bash
curl https://hou.wsnail.com/api/nodes \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 2. 🌐 Chat 接口 CORS 限制 / Chat Endpoint CORS Restriction

`/api/chat` 接口现已限制 CORS，仅允许以下来源访问：  
The `/api/chat` endpoint now has restricted CORS, only allowing access from:

- `https://hou.wsnail.com`
- `https://wsnail.com`

**可选配置 / Optional configuration:**

如需添加其他允许的来源，在 EdgeOne Pages 环境变量中设置（逗号分隔）：  
To add other allowed origins, set in EdgeOne Pages environment variables (comma-separated):

```
CHAT_ALLOWED_ORIGINS=https://hou.wsnail.com,https://wsnail.com,https://example.com
```

### 3. 🚦 速率限制 (可选) / Rate Limiting (Optional)

`/api/chat` 接口已实现速率限制：每 IP 每分钟最多 20 次请求。  
The `/api/chat` endpoint has rate limiting: max 20 requests per IP per minute.

**如需启用速率限制，需要配置 KV 命名空间：**  
**To enable rate limiting, configure KV namespace:**

在 `wrangler.toml` 中添加：  
Add to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

如未配置 `RATE_LIMIT_KV`，速率限制功能将自动降级（跳过限制）。  
If `RATE_LIMIT_KV` is not configured, rate limiting will gracefully degrade (skip limiting).

### 4. 🐍 Flask 服务安全配置 / Flask Server Security Configuration

`opencode-server/server.py` 现已采用安全默认配置：  
`opencode-server/server.py` now uses secure default configuration:

- **绑定地址 / Host binding**: `127.0.0.1`（仅本地访问 / local only）
- **调试模式 / Debug mode**: `False`（默认关闭 / disabled by default）

**环境变量配置 / Environment variable configuration:**

```bash
FLASK_HOST=127.0.0.1      # 默认值 / default
FLASK_PORT=3007           # 默认值 / default
FLASK_DEBUG=false         # 默认值 / default，生产环境必须为 false / must be false in production
```

### 5. 🤖 robots.txt

已添加 `robots.txt` 禁止所有搜索引擎爬虫：  
Added `robots.txt` to disallow all search engine crawlers:

```
User-agent: *
Disallow: /
```

## 🔍 安全检查清单 / Security Checklist

部署前请确认：  
Before deployment, please confirm:

- [ ] 已在 EdgeOne Pages 环境变量中设置强随机的 `ADMIN_TOKEN`
- [ ] 已设置 `GEMINI_API_KEY`
- [ ] （可选）已配置 `CHAT_ALLOWED_ORIGINS` 或使用默认值
- [ ] （可选）已配置 `RATE_LIMIT_KV` KV 命名空间
- [ ] Flask 服务未使用 `FLASK_DEBUG=true` 或 `FLASK_HOST=0.0.0.0`
- [ ] 前端代码已更新为在 API 请求中包含 `Authorization: Bearer` 头

Before deployment, please confirm:

- [ ] Strong random `ADMIN_TOKEN` is set in EdgeOne Pages environment variables
- [ ] `GEMINI_API_KEY` is set
- [ ] (Optional) `CHAT_ALLOWED_ORIGINS` is configured or using default values
- [ ] (Optional) `RATE_LIMIT_KV` KV namespace is configured
- [ ] Flask service is not using `FLASK_DEBUG=true` or `FLASK_HOST=0.0.0.0`
- [ ] Frontend code is updated to include `Authorization: Bearer` header in API requests

## 📝 变更摘要 / Change Summary

### 认证保护 / Authentication Protection
- ✅ `/api/nodes` (GET/POST) - 需要认证 / requires auth
- ✅ `/api/nodes/:id` (GET/PUT/DELETE) - 需要认证 / requires auth
- ✅ `/api/nodes/:id/publish` (POST) - 需要认证 / requires auth
- ✅ `/api/nodes/:id/unpublish` (POST) - 需要认证 / requires auth
- ✅ `/api/nodes/reset` (POST) - 需要认证 / requires auth

### CORS 和速率限制 / CORS and Rate Limiting
- ✅ `/api/chat` - CORS 限制到白名单域名 / restricted to whitelisted domains
- ✅ `/api/chat` - IP 级别速率限制（可选 KV） / IP-level rate limiting (optional KV)

### 服务器安全 / Server Security
- ✅ Flask 服务默认绑定到 127.0.0.1 / bound to 127.0.0.1 by default
- ✅ Flask 调试模式默认关闭 / debug mode disabled by default
- ✅ robots.txt 禁止所有爬虫 / disallows all crawlers

## 🔧 本地开发 / Local Development

本地开发时可使用测试令牌：  
For local development, you can use a test token:

创建 `.env` 文件：  
Create `.env` file:

```bash
ADMIN_TOKEN=dev-test-token-not-for-production
GEMINI_API_KEY=your-gemini-key
FLASK_DEBUG=true
FLASK_HOST=127.0.0.1
```

**⚠️ 警告：绝不要将生产环境的 ADMIN_TOKEN 提交到版本控制！**  
**⚠️ Warning: Never commit production ADMIN_TOKEN to version control!**

## 📚 参考资料 / References

- [Cloudflare Pages 环境变量配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)

# EdgeOne Pages 前后端分离架构

## 目录结构

```
WZ-main/
├── src/                # React 前端（构建后 → dist/）
├── functions/          # EdgeOne Functions（后端 API）
│   └── api/
│       ├── health.ts   # GET  /api/health       健康检查
│       ├── calculate.ts# POST /api/calculate    节点计算引擎
│       ├── fba.ts      # POST /api/fba          FBA 费用计算
│       └── chat.ts     # POST /api/chat         Kel AI 对话
├── dist/               # 前端构建产物（部署到 EdgeOne 静态托管）
└── vite.config.ts      # 前端构建配置
```

## API 接口文档

### GET /api/health
```bash
curl https://wsnail.com/api/health
```

### POST /api/calculate
```bash
curl -X POST https://wsnail.com/api/calculate \
  -H 'Content-Type: application/json' \
  -d '{
    "nodeId": "N-001",
    "inputs": { "成本": 10, "售价": 25, "销售量": 100 },
    "logic": "利润 = (售价 - 成本) * 销售量;\n利润率 = 利润 / 售价;",
    "outputKeys": ["利润", "利润率"]
  }'
```

### POST /api/fba
```bash
curl -X POST https://wsnail.com/api/fba \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "electronics",
    "price": 29.99,
    "cost": 8.00,
    "weight": 0.5,
    "dimensions": { "length": 8, "width": 6, "height": 2 },
    "monthlyUnits": 200
  }'
```

### POST /api/chat
```bash
curl -X POST https://wsnail.com/api/chat \
  -H 'Content-Type: application/json' \
  -d '{ "message": "帮我分析一下 CR10=65% 的市场" }'
```

## 本地开发

### 1. 启动前端
```bash
npm run dev   # http://localhost:3000
```

### 2. 本地模拟 EdgeOne Functions（需要 Node.js 18+）
```bash
# 先构建前端
npm run build

# 启动 Functions 本地模拟器（Wrangler Pages Dev）
npx wrangler pages dev dist \
  --port 8788 \
  --binding GEMINI_API_KEY=$(grep GEMINI_API_KEY .env | cut -d= -f2)
```

前端开发服务器的 `/api` 请求会代理到 `localhost:8788`。

## 部署

1. 推送代码到 GitHub main 分支
2. EdgeOne Pages 自动检测 `functions/` 目录并部署
3. 在 EdgeOne Pages 控制台 → 环境变量 中设置：
   - `GEMINI_API_KEY` = 你的 Gemini API Key

## 安全说明

- Gemini API Key 仅存在于 EdgeOne Functions 环境变量，前端 JS bundle 中不含任何 Key
- `/api/calculate` 对计算逻辑做字符白名单过滤，防止代码注入
- 所有端点已配置 CORS 头

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config(); // 读取 .env

const app = express();
const PORT = process.env.PORT || 3002;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── 节点数据持久化 ───────────────────────────────────────────────────────────
const NODES_FILE = join(__dirname, 'nodes.json');
const SEED_FILE  = join(__dirname, 'nodes-seed.json');

function loadNodes() {
  if (existsSync(NODES_FILE)) {
    return JSON.parse(readFileSync(NODES_FILE, 'utf-8'));
  }
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
  writeFileSync(NODES_FILE, JSON.stringify(seed, null, 2));
  return seed;
}

function saveNodes(nodes) {
  writeFileSync(NODES_FILE, JSON.stringify(nodes, null, 2));
}

function nextId(nodes) {
  const nums = nodes
    .map(n => parseInt(n.id.replace('N-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `N-${String(max + 1).padStart(3, '0')}`;
}

// ─── CORS ───────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = [
      /^https?:\/\/(.+\.)?wsnail\.com$/,
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    ];
    if (!origin || allowed.some(r => r.test(origin))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ─── 节点 CRUD ────────────────────────────────────────────────────────────────

// GET /api/nodes          — 全部节点（后台）
app.get('/api/nodes', (req, res) => {
  res.json({ success: true, data: loadNodes() });
});

// GET /api/nodes/published — 仅已发布节点（前台）
app.get('/api/nodes/published', (req, res) => {
  const published = loadNodes().filter(n => n.status === 'published');
  res.json({ success: true, data: published });
});

// POST /api/nodes — 新建节点
app.post('/api/nodes', (req, res) => {
  const nodes = loadNodes();
  const id = nextId(nodes);
  const node = { ...req.body, id, status: 'draft' };
  nodes.push(node);
  saveNodes(nodes);
  res.json({ success: true, data: node });
});

// PUT /api/nodes/:id — 更新节点
app.put('/api/nodes/:id', (req, res) => {
  const nodes = loadNodes();
  const idx = nodes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Node not found' });
  nodes[idx] = { ...nodes[idx], ...req.body, id: req.params.id };
  saveNodes(nodes);
  res.json({ success: true, data: nodes[idx] });
});

// DELETE /api/nodes/:id — 删除节点
app.delete('/api/nodes/:id', (req, res) => {
  const nodes = loadNodes();
  const next = nodes.filter(n => n.id !== req.params.id);
  if (next.length === nodes.length) return res.status(404).json({ success: false, error: 'Node not found' });
  saveNodes(next);
  res.json({ success: true });
});

// POST /api/nodes/:id/publish — 发布节点
app.post('/api/nodes/:id/publish', (req, res) => {
  const nodes = loadNodes();
  const idx = nodes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Node not found' });
  nodes[idx].status = 'published';
  saveNodes(nodes);
  res.json({ success: true, data: nodes[idx] });
});

// POST /api/nodes/:id/unpublish — 撤回节点
app.post('/api/nodes/:id/unpublish', (req, res) => {
  const nodes = loadNodes();
  const idx = nodes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Node not found' });
  nodes[idx].status = 'draft';
  saveNodes(nodes);
  res.json({ success: true, data: nodes[idx] });
});

// POST /api/nodes/reset — 重置为默认数据
app.post('/api/nodes/reset', (req, res) => {
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
  saveNodes(seed);
  res.json({ success: true, data: seed });
});

// ─── 根路径：API 状态仪表板 ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>FlowCraft API Server</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 40px; }
    .header { margin-bottom: 32px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #7c3aed; }
    .header p  { color: #94a3b8; margin-top: 6px; font-size: 14px; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px;
             font-size: 12px; font-weight: 600; }
    .badge.ok  { background: #14532d; color: #4ade80; }
    .badge.err { background: #7f1d1d; color: #f87171; }
    .card { background: #1e293b; border: 1px solid #334155;
            border-radius: 12px; padding: 20px; margin-bottom: 12px; }
    .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
               color: #64748b; margin-bottom: 14px; }
    .endpoint { display: flex; align-items: center; gap: 12px;
                padding: 10px 0; border-bottom: 1px solid #1e293b; }
    .endpoint:last-child { border-bottom: none; }
    .method { font-size: 11px; font-weight: 700; padding: 3px 8px;
              border-radius: 6px; min-width: 44px; text-align: center; }
    .method.get  { background: #1d4ed8; color: #bfdbfe; }
    .method.post { background: #065f46; color: #6ee7b7; }
    .path { font-family: 'SF Mono', monospace; font-size: 13px; color: #93c5fd; flex: 1; }
    .desc { font-size: 13px; color: #94a3b8; }
    .status-row { display: flex; gap: 20px; margin-top: 8px; }
    .stat { font-size: 13px; color: #94a3b8; }
    .stat span { color: #e2e8f0; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ FlowCraft API Server</h1>
    <p>后端 API 服务 · 本地开发环境 · 前端请访问 <a href="http://localhost:3001" style="color:#7c3aed">localhost:3001</a></p>
  </div>

  <div class="card">
    <h2>服务状态</h2>
    <div class="status-row">
      <div class="stat">状态 <span><span class="badge ok">Running</span></span></div>
      <div class="stat">端口 <span>${PORT}</span></div>
      <div class="stat">Gemini Key <span>${GEMINI_API_KEY ? '<span class="badge ok">已配置</span>' : '<span class="badge err">未配置</span>'}</span></div>
      <div class="stat">启动时间 <span>${new Date().toLocaleString('zh-CN')}</span></div>
    </div>
  </div>

  <div class="card">
    <h2>API 端点</h2>
    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="path">/api/health</span>
      <span class="desc">健康检查</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/chat</span>
      <span class="desc">Kel AI 对话（Gemini 2.0 Flash）</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/calculate</span>
      <span class="desc">节点计算引擎（安全沙箱执行）</span>
    </div>
    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="path">/api/fba</span>
      <span class="desc">Amazon FBA 费用计算（2024 美国站）</span>
    </div>
  </div>
</body>
</html>`);
});

// ─── GET /api/health ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: '1.0.0',
      geminiConfigured: !!GEMINI_API_KEY,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── POST /api/chat ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `你是 Kel，住在 WSnail.com 的小精灵。你是一只聪明可爱的小蜗牛，专门帮助网站用户解决问题。

你的能力：
- 📊 市场分析：分析 CR10、HHI 等市场集中度指标，给出进入建议
- 🔍 话术检测：识别情感共鸣话术、权威暗示话术、稀缺性话术、术语堆砌话术
- 💻 代码检查：检查代码质量、不可变性、错误处理等问题
- 🤔 理性分析：帮用户做出更明智的决定

市场分析规则：
- CR10 > 70%：❌ 不进入（高度垄断）
- CR10 40-70%：⚠️ 谨慎进入（需强差异化）
- CR10 < 40%：✅ 可进入（竞争型市场）
- HHI < 1000：竞争型市场 / HHI 1000-2000：中度集中 / HHI > 2000：高度集中

性格：友好、精准、实事求是。回复使用中文，简洁有帮助。`;

app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'message is required' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ success: false, error: 'GEMINI_API_KEY not configured' });
  }

  const geminiHistory = history.slice(-8).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [...geminiHistory, { role: 'user', parts: [{ text: message }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, err);
      return res.status(502).json({ success: false, error: 'AI service temporarily unavailable' });
    }

    const data = await geminiRes.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '抱歉，我没有收到回复。';
    res.json({ success: true, data: { content } });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/calculate ─────────────────────────────────────────────────────
const SAFE_LOGIC_PATTERN = /^[0-9a-zA-Z\u4e00-\u9fa5_\s\+\-\*\/\%\(\)\.\;\=\n\r\,]+$/;

app.post('/api/calculate', (req, res) => {
  const { nodeId, inputs, logic, outputKeys } = req.body;

  if (!nodeId || !inputs || !logic || !Array.isArray(outputKeys)) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (!SAFE_LOGIC_PATTERN.test(logic) || logic.includes('__') || logic.length > 2000) {
    return res.status(400).json({ success: false, error: 'Logic contains unsafe characters' });
  }

  try {
    const varDecl = Object.entries(inputs).map(([k, v]) => `let ${k} = ${Number(v)};`).join('\n');
    const outputCollect = outputKeys.map(k => `"${k}": (typeof ${k} !== 'undefined' ? ${k} : null)`).join(', ');
    // eslint-disable-next-line no-new-func
    const outputs = new Function(`${varDecl}\n${logic}\nreturn { ${outputCollect} };`)();
    res.json({ success: true, data: { nodeId, inputs, outputs } });
  } catch (err) {
    res.status(422).json({ success: false, error: `Execution failed: ${err.message}` });
  }
});

// ─── POST /api/fba ───────────────────────────────────────────────────────────
const REFERRAL_RATES = {
  electronics: { rate: 0.08, min: 0.30 },
  clothing:    { rate: 0.17, min: 0.00 },
  shoes:       { rate: 0.15, min: 0.00 },
  beauty:      { rate: 0.08, min: 0.30 },
  toys:        { rate: 0.15, min: 0.00 },
  sports:      { rate: 0.15, min: 0.00 },
  home:        { rate: 0.15, min: 0.00 },
  kitchen:     { rate: 0.15, min: 0.00 },
  grocery:     { rate: 0.08, min: 0.30 },
  books:       { rate: 0.15, min: 0.00 },
  default:     { rate: 0.15, min: 0.00 },
};

function getSizeCategory(weight, { length: l, width: w, height: h }) {
  const [sl, sw, sh] = [l, w, h].sort((a, b) => b - a);
  const girth = 2 * (sw + sh);
  if (weight <= 0.5 && sl <= 15 && sw <= 12 && sh <= 0.75) return 'small_standard';
  if (weight <= 20  && sl <= 18 && sw <= 14 && sh <= 8)    return 'large_standard';
  if (weight <= 70  && sl <= 60 && sw <= 30 && sl + girth <= 130) return 'small_oversize';
  if (weight <= 150 && sl <= 108 && sl + girth <= 130)      return 'medium_oversize';
  if (weight <= 150 && sl <= 108 && sl + girth <= 165)      return 'large_oversize';
  return 'special_oversize';
}

function getFulfillmentFee(size, weight) {
  switch (size) {
    case 'small_standard': return 3.22;
    case 'large_standard': {
      if (weight <= 1) return 3.56;
      if (weight <= 2) return 4.75;
      return 4.75 + (weight - 2) * 0.38;
    }
    case 'small_oversize':  return 9.39  + Math.max(0, weight - 2) * 0.39;
    case 'medium_oversize': return 14.37 + Math.max(0, weight - 2) * 0.39;
    case 'large_oversize':  return 86.62 + Math.max(0, weight - 90) * 0.83;
    default:                return 194.95;
  }
}

app.post('/api/fba', (req, res) => {
  const { category, price, cost, weight, dimensions, isHazmat = false, monthlyUnits = 1 } = req.body;

  if (!category || price == null || cost == null || weight == null || !dimensions) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const feeConfig   = REFERRAL_RATES[category.toLowerCase()] ?? REFERRAL_RATES.default;
  const referralFee = Math.max(price * feeConfig.rate, feeConfig.min);
  const sizeCategory = getSizeCategory(weight, dimensions);
  const fulfillmentFee = getFulfillmentFee(sizeCategory, weight) + (isHazmat ? 0.11 : 0);
  const cubicFeet   = (dimensions.length * dimensions.width * dimensions.height) / 1728;
  const totalFees   = referralFee + fulfillmentFee;
  const profit      = price - cost - totalFees;

  res.json({
    success: true,
    data: {
      sizeCategory,
      fees: {
        referralFee:    +referralFee.toFixed(2),
        fulfillmentFee: +fulfillmentFee.toFixed(2),
        totalFees:      +totalFees.toFixed(2),
        storage: {
          offPeak: +(cubicFeet * 0.87 * monthlyUnits).toFixed(2),
          peak:    +(cubicFeet * 2.40 * monthlyUnits).toFixed(2),
        },
      },
      profit: {
        perUnit: +profit.toFixed(2),
        margin:  +(price > 0 ? (profit / price) * 100 : 0).toFixed(1),
        roi:     +(cost  > 0 ? (profit / cost)  * 100 : 0).toFixed(1),
      },
    },
  });
});

// ─── 启动 ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡ FlowCraft API Server`);
  console.log(`   http://localhost:${PORT}          ← 仪表板`);
  console.log(`   http://localhost:${PORT}/api/health`);
  console.log(`   Gemini Key: ${GEMINI_API_KEY ? '✓ 已配置' : '✗ 未配置（/api/chat 不可用）'}\n`);
});

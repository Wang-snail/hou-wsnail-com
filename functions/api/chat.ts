/**
 * POST /api/chat
 * Kel AI 对话端点（Gemini 在后端调用，Key 不暴露给前端）
 *
 * Request body:
 *   { message: string, history?: Array<{ role: 'user'|'assistant', content: string }> }
 *
 * Env vars (在 EdgeOne Pages 环境变量中配置):
 *   GEMINI_API_KEY                        — Gemini API Key
 *   CHAT_ALLOWED_ORIGINS (可选)           — 逗号分隔的允许域名，默认为 https://hou.wsnail.com,https://wsnail.com
 */

// 默认允许的来源（生产环境）
const DEFAULT_ALLOWED_ORIGINS = ['https://hou.wsnail.com', 'https://wsnail.com'];

/**
 * 生成 CORS 响应头（基于 Origin 检查）
 */
function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowedOriginsStr = env.CHAT_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(',');
  const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim());

  const isAllowed = allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const SYSTEM_PROMPT = `你是 Kel，住在 WSnail.com 的小精灵。你是一只聪明可爱的小蜗牛，专门帮助网站用户解决问题。

你的能力：
- 📊 市场分析：分析 CR10、HHI 等市场集中度指标，给出进入建议
- 🔍 话术检测：识别情感共鸣话术、权威暗示话术、稀缺性话术、术语堆砌话术
- 💻 代码检查：检查代码质量、不可变性、错误处理等问题
- 👥 团队协作：解答七人团队协作模式问题
- 🤔 理性分析：帮用户做出更明智的决定

市场分析规则：
- CR10 > 70%：❌ 不进入（高度垄断）
- CR10 40-70%：⚠️ 谨慎进入（需强差异化）
- CR10 < 40%：✅ 可进入（竞争型市场）
- HHI < 1000：竞争型市场
- HHI 1000-2000：中度集中
- HHI > 2000：高度集中

你的性格：友好、精准、实事求是，虽然是蜗牛但思考很深入。回复使用中文，保持简洁有帮助。`;

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface Env {
  GEMINI_API_KEY: string;
  CHAT_ALLOWED_ORIGINS?: string;
  RATE_LIMIT_KV?: KVNamespace;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW = 60; // 60 秒
const RATE_LIMIT_MAX_REQUESTS = 20; // 每分钟最多 20 次请求

/**
 * 检查速率限制（基于 IP 地址）
 * 返回 null 表示通过，返回 Response 表示被限制
 */
async function checkRateLimit(request: Request, env: Env): Promise<Response | null> {
  // 如果没有配置 KV，跳过速率限制（降级模式）
  if (!env.RATE_LIMIT_KV) {
    return null;
  }

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const key = `rate_limit:chat:${ip}`;

  try {
    const current = await env.RATE_LIMIT_KV.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= RATE_LIMIT_MAX_REQUESTS) {
      const corsHeaders = getCorsHeaders(request, env);
      return Response.json(
        { success: false, error: 'Rate limit exceeded. Please try again later.' },
        { status: 429, headers: corsHeaders }
      );
    }

    // 增加计数
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
    return null;
  } catch (e) {
    // 速率限制失败时不阻止请求（降级模式）
    console.error('Rate limit check failed:', e);
    return null;
  }
}

export async function onRequest(context: EventContext<Env, string, {}>) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: corsHeaders }
    );
  }

  // 速率限制检查
  const rateLimitError = await checkRateLimit(request, env);
  if (rateLimitError) return rateLimitError;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { success: false, error: 'AI service not configured' },
      { status: 503, headers: corsHeaders }
    );
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    );
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== 'string' || message.length > 4000) {
    return Response.json(
      { success: false, error: 'message is required and must be under 4000 characters' },
      { status: 400, headers: corsHeaders }
    );
  }

  // 构建 Gemini 对话历史
  const geminiHistory: ChatMessage[] = history
    .slice(-8) // 保留最近 8 条
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

  const geminiBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      ...geminiHistory,
      { role: 'user', parts: [{ text: message }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  };

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errText);
      return Response.json(
        { success: false, error: 'AI service temporarily unavailable' },
        { status: 502, headers: corsHeaders }
      );
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const replyText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '抱歉，我没有收到回复。';

    return Response.json(
      { success: true, data: { content: replyText } },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('Chat function error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

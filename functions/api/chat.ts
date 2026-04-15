/**
 * POST /api/chat
 * Kel AI 对话端点（Gemini 在后端调用，Key 不暴露给前端）
 *
 * Request body:
 *   { message: string, history?: Array<{ role: 'user'|'assistant', content: string }> }
 *
 * Env vars (在 EdgeOne Pages 环境变量中配置):
 *   GEMINI_API_KEY
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
}

export async function onRequest(context: EventContext<Env, string, {}>) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { success: false, error: 'AI service not configured' },
      { status: 503, headers: CORS_HEADERS }
    );
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { message, history = [] } = body;

  if (!message || typeof message !== 'string' || message.length > 4000) {
    return Response.json(
      { success: false, error: 'message is required and must be under 4000 characters' },
      { status: 400, headers: CORS_HEADERS }
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
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const replyText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '抱歉，我没有收到回复。';

    return Response.json(
      { success: true, data: { content: replyText } },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error('Chat function error:', err);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

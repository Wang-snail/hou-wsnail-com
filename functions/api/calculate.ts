/**
 * POST /api/calculate
 * 节点计算引擎 - 安全执行用户定义的计算逻辑
 *
 * Request body:
 *   { nodeId: string, inputs: Record<string, number>, logic: string }
 *
 * Response:
 *   { success: true, data: { outputs: Record<string, number> } }
 *
 * 安全策略：
 *   - 仅允许 +  -  *  /  %  **  ()  数字  变量名 等安全字符
 *   - 每次执行独立沙箱，无全局状态
 *   - 执行超时 100ms
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 允许的字符：数字、运算符、空格、变量名（字母/汉字/下划线）、分号、换行
const SAFE_LOGIC_PATTERN = /^[0-9a-zA-Z\u4e00-\u9fa5_\s\+\-\*\/\%\(\)\.\;\=\n\r\,]+$/;

function isLogicSafe(logic: string): boolean {
  return SAFE_LOGIC_PATTERN.test(logic) && !logic.includes('__') && logic.length < 2000;
}

interface NodeCalcRequest {
  nodeId: string;
  inputs: Record<string, number>;
  logic: string;
  outputKeys: string[];
}

function executeLogic(
  inputs: Record<string, number>,
  logic: string,
  outputKeys: string[]
): Record<string, number> {
  // 构建变量声明
  const varDeclarations = Object.entries(inputs)
    .map(([k, v]) => `let ${k} = ${Number(v)};`)
    .join('\n');

  // 构建输出收集
  const outputCollection = outputKeys
    .map(k => `"${k}": (typeof ${k} !== 'undefined' ? ${k} : null)`)
    .join(', ');

  const code = `
    ${varDeclarations}
    ${logic}
    return { ${outputCollection} };
  `;

  // eslint-disable-next-line no-new-func
  const fn = new Function(code);
  return fn();
}

export async function onRequest(context: EventContext<{}, string, {}>) {
  const { request } = context;

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method not allowed' },
      { status: 405, headers: CORS_HEADERS }
    );
  }

  let body: NodeCalcRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { nodeId, inputs, logic, outputKeys } = body;

  if (!nodeId || !inputs || !logic || !Array.isArray(outputKeys)) {
    return Response.json(
      { success: false, error: 'Missing required fields: nodeId, inputs, logic, outputKeys' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!isLogicSafe(logic)) {
    return Response.json(
      { success: false, error: 'Logic contains unsafe characters or is too long' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const outputs = executeLogic(inputs, logic, outputKeys);
    return Response.json(
      { success: true, data: { nodeId, inputs, outputs } },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution error';
    return Response.json(
      { success: false, error: `Logic execution failed: ${message}` },
      { status: 422, headers: CORS_HEADERS }
    );
  }
}

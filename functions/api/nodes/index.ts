/**
 * GET  /api/nodes        — 全量节点列表（后台管理用）
 * POST /api/nodes        — 新增节点
 */
import { ok, err, preflight, kvGetNodes, kvSaveNodes, SEED_NODES, type AppNode, type Env } from './_shared';

export async function onRequest(context: EventContext<Env, string, {}>) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();

  const kv = env.NODES_KV;

  // ── GET all nodes ─────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const nodes = kv ? await kvGetNodes(kv) : SEED_NODES;
      return ok(nodes);
    } catch (e) {
      return err(`Failed to load nodes: ${e instanceof Error ? e.message : String(e)}`, 500);
    }
  }

  // ── POST create node ──────────────────────────────────────────────────────
  if (request.method === 'POST') {
    if (!kv) return err('KV storage not configured — cannot create nodes in read-only mode', 503);
    let body: Partial<AppNode>;
    try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

    const { name, category, description, inputs, outputs, logic } = body;
    if (!name || !category || !inputs || !outputs || !logic) {
      return err('Missing required fields: name, category, description, inputs, outputs, logic', 400);
    }

    const nodes = await kvGetNodes(kv);
    const maxNum = nodes
      .map(n => parseInt(n.id.replace('N-', ''), 10))
      .filter(n => !isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    const newNode: AppNode = {
      id: `N-${String(maxNum + 1).padStart(3, '0')}`,
      name: name!,
      category: category!,
      description: description ?? '',
      inputs: inputs!,
      outputs: outputs!,
      logic: logic!,
      status: 'draft',
    };
    await kvSaveNodes(kv, [...nodes, newNode]);
    return ok(newNode, 201);
  }

  return err('Method not allowed', 405);
}

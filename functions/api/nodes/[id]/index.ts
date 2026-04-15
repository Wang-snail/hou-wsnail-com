/**
 * GET    /api/nodes/:id  — 查询单个节点
 * PUT    /api/nodes/:id  — 更新节点
 * DELETE /api/nodes/:id  — 删除节点
 */
import { ok, err, preflight, kvGetNodes, kvSaveNodes, type AppNode, type Env } from '../_shared';

export async function onRequest(context: EventContext<Env, string, { id: string }>) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return preflight();

  const id = params.id;
  const kv = env.NODES_KV;
  if (!kv) return err('KV storage not configured', 503);

  const nodes = await kvGetNodes(kv);

  // ── GET single ────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const node = nodes.find(n => n.id === id);
    if (!node) return err('Node not found', 404);
    return ok(node);
  }

  // ── PUT update ────────────────────────────────────────────────────────────
  if (request.method === 'PUT') {
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return err('Node not found', 404);
    let changes: Partial<AppNode>;
    try { changes = await request.json(); } catch { return err('Invalid JSON', 400); }
    const updated = { ...nodes[idx], ...changes, id }; // id 不可被覆盖
    const next = [...nodes];
    next[idx] = updated;
    await kvSaveNodes(kv, next);
    return ok(updated);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return err('Node not found', 404);
    const next = nodes.filter(n => n.id !== id);
    await kvSaveNodes(kv, next);
    return ok({ id });
  }

  return err('Method not allowed', 405);
}

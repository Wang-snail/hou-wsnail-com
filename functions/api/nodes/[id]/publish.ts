/**
 * POST /api/nodes/:id/publish — 发布节点
 */
import { ok, err, preflight, kvGetNodes, kvSaveNodes, type Env } from '../_shared';

export async function onRequest(context: EventContext<Env, string, { id: string }>) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const kv = env.NODES_KV;
  if (!kv) return err('KV storage not configured', 503);

  const nodes = await kvGetNodes(kv);
  const idx = nodes.findIndex(n => n.id === params.id);
  if (idx === -1) return err('Node not found', 404);

  const next = [...nodes];
  next[idx] = { ...next[idx], status: 'published' };
  await kvSaveNodes(kv, next);
  return ok(next[idx]);
}

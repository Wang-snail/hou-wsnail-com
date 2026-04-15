/**
 * POST /api/nodes/reset — 重置为 Seed 初始数据
 */
import { ok, err, preflight, kvSaveNodes, SEED_NODES, type Env } from './_shared';

export async function onRequest(context: EventContext<Env, string, {}>) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return err('Method not allowed', 405);

  const kv = env.NODES_KV;
  if (!kv) return err('KV storage not configured', 503);

  await kvSaveNodes(kv, SEED_NODES);
  return ok(SEED_NODES);
}

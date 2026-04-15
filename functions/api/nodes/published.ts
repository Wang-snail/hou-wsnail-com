/**
 * GET /api/nodes/published
 * 前台只读接口：返回 status === 'published' 的节点
 * 优先从 KV 读取（支持管理员动态修改），KV 未配置时回退到 Seed
 */
import { ok, err, preflight, kvGetNodes, SEED_NODES, type Env } from './_shared';

export async function onRequest(context: EventContext<Env, string, {}>) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return err('Method not allowed', 405);

  try {
    const nodes = env.NODES_KV
      ? await kvGetNodes(env.NODES_KV)
      : SEED_NODES;
    return ok(nodes.filter(n => n.status === 'published'));
  } catch (e) {
    return err(`Failed to load nodes: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

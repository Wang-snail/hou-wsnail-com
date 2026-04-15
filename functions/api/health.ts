/**
 * GET /api/health
 * 健康检查端点
 */
export async function onRequest(context: EventContext<{}, string, {}>) {
  return Response.json({
    success: true,
    data: {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      region: context.request.cf?.region ?? 'unknown',
    },
  });
}

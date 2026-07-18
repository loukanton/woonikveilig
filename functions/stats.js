// Cloudflare Pages Function: GET /stats
// Share-funnel dashboard JSON: total and count per channel. Protected in
// production by the STATS_KEY env var (call /stats?key=...); without
// STATS_KEY set (e.g. local dev) it is open.
export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return Response.json({ error: 'geen DB-binding' });

  const url = new URL(request.url);
  if (env.STATS_KEY && url.searchParams.get('key') !== env.STATS_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const byChannel = await env.DB.prepare(
      'SELECT channel, COUNT(*) AS n FROM shares GROUP BY channel ORDER BY n DESC'
    ).all();
    const rows = byChannel.results || [];
    const total = rows.reduce((sum, r) => sum + r.n, 0);
    return Response.json({ total, byChannel: rows });
  } catch (err) {
    return Response.json({ total: 0, byChannel: [], note: 'nog geen data' });
  }
};

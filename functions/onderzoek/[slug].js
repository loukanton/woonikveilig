// Cloudflare Pages dynamic route: /onderzoek/:slug
// Op dit moment: veiligste-buurten-<jaar>. Onbekend -> 302 naar home.
import { loadData, renderOnderzoekBuurten } from '../_pages.js';

export const onRequest = async ({ params, env }) => {
  const m = /^veiligste-buurten-(\d{4})$/.exec(params.slug || '');
  if (!m) return new Response(null, { status: 302, headers: { location: '/' } });
  const year = m[1];
  const [data, nl] = await Promise.all([
    loadData(env, '/data/onderzoek-buurten.json'),
    loadData(env, '/data/nl.json'),
  ]);
  if (!data) return new Response(null, { status: 302, headers: { location: '/' } });
  return new Response(renderOnderzoekBuurten(data, nl || {}, year), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400' },
  });
};

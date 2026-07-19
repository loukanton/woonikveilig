// Cloudflare Pages dynamic route: /provincie/:slug
// Data-driven province page from the static /data snapshot. Unknown slug -> home.
import { loadData, renderProvinciePage } from '../_pages.js';

export const onRequest = async ({ params, env }) => {
  const [p, nl, all, geo] = await Promise.all([
    loadData(env, `/data/provincie/${params.slug}.json`),
    loadData(env, '/data/nl.json'),
    loadData(env, '/data/provincies.json'),
    loadData(env, '/data/geo-provincies.json'),
  ]);
  if (!p) return new Response(null, { status: 302, headers: { location: '/' } });

  return new Response(renderProvinciePage(p, nl || {}, all?.provincies || [], geo), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

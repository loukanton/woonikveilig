// Cloudflare Pages dynamic route: /gemeente/:slug
// Data-driven gemeente page from the static /data snapshot. Unknown slug -> home.
import { loadData, renderGemeentePage } from '../_pages.js';

export const onRequest = async ({ params, env }) => {
  const lookup = await loadData(env, '/data/gemeenten.json');
  const entry = lookup?.gemeenten.find((g) => g.slug === params.slug);
  if (!entry) return new Response(null, { status: 302, headers: { location: '/' } });

  const [g, nl, prov] = await Promise.all([
    loadData(env, `/data/gemeente/${entry.code}.json`),
    loadData(env, '/data/nl.json'),
    loadData(env, `/data/provincie/${entry.provincie}.json`),
  ]);
  if (!g) return new Response(null, { status: 302, headers: { location: '/' } });

  return new Response(renderGemeentePage(g, nl || {}, prov), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

// Cloudflare Pages route: /gezondste-gemeenten
import { loadData, renderRankingGemeenten } from './_pages.js';

export const onRequest = async ({ env }) => {
  const [gj, nl, geo] = await Promise.all([
    loadData(env, '/data/gemeenten.json'),
    loadData(env, '/data/nl.json'),
    loadData(env, '/data/geo-gemeenten.json'),
  ]);
  const gemeenten = (gj?.gemeenten || []).map((g) => ({ ...g, peildatum: gj.peildatum }));
  return new Response(renderRankingGemeenten(gemeenten, nl || {}, 'gezondste', geo), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400' },
  });
};

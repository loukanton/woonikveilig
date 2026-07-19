// Cloudflare Pages dynamic route: /gemeente/:slug/:buurt
// Data-driven buurt page. Buurten below the quality threshold (or unknown
// slugs) redirect to the gemeente page: no thin pages, no soft-404s.
import { loadData, renderBuurtPage } from '../../_pages.js';

const MIN_RESIDENTS = 200;

export const onRequest = async ({ params, env }) => {
  const lookup = await loadData(env, '/data/gemeenten.json');
  const entry = lookup?.gemeenten.find((x) => x.slug === params.slug);
  if (!entry) return new Response(null, { status: 302, headers: { location: '/' } });

  const gemeenteHref = `/gemeente/${entry.slug}`;
  const [g, nl] = await Promise.all([
    loadData(env, `/data/gemeente/${entry.code}.json`),
    loadData(env, '/data/nl.json'),
  ]);
  if (!g) return new Response(null, { status: 302, headers: { location: '/' } });

  const b = (g.buurten || []).find((x) => x.slug === params.buurt);
  // Onbekend of onder de drempel: terug naar de gemeentepagina (relevante inhoud).
  const meetsThreshold = b && (b.demografie?.inwoners || 0) >= MIN_RESIDENTS && b.veiligheid?.per1000 != null;
  if (!meetsThreshold) return new Response(null, { status: 302, headers: { location: gemeenteHref } });

  return new Response(renderBuurtPage(b, g, nl || {}), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

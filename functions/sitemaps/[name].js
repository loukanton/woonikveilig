// Cloudflare Pages dynamic route: /sitemaps/:name.xml
// Child sitemaps referenced by the sitemap index.
//   paginas   -> homepage, info pages, datasets, city pages, provinces
//   gemeenten -> all gemeente pages (from the compact lookup)
import { CITIES, CANONICAL_ORIGIN } from '../_cities.js';
import { DATASETS } from '../_datasets.js';
import { loadData } from '../_pages.js';

const INFO_PAGES = ['/methode', '/bronnen', '/over', '/pers',
  '/veiligste-gemeenten', '/gezondste-gemeenten', '/onderzoek/veiligste-buurten-2026'];

function xml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
}

export const onRequest = async ({ params, env }) => {
  const name = params.name.replace(/\.xml$/, '');
  let urls = [];

  if (name === 'paginas') {
    const provincies = (await loadData(env, '/data/provincies.json'))?.provincies || [];
    urls = [
      `${CANONICAL_ORIGIN}/`,
      ...INFO_PAGES.map((p) => `${CANONICAL_ORIGIN}${p}`),
      ...DATASETS.map((d) => `${CANONICAL_ORIGIN}/dataset/${d.slug}`),
      ...CITIES.map((c) => `${CANONICAL_ORIGIN}/in/${c.slug}`),
      ...provincies.map((p) => `${CANONICAL_ORIGIN}/provincie/${p.slug}`),
    ];
  } else if (name === 'gemeenten') {
    const gemeenten = (await loadData(env, '/data/gemeenten.json'))?.gemeenten || [];
    urls = gemeenten.map((g) => `${CANONICAL_ORIGIN}/gemeente/${g.slug}`);
  } else if (name === 'buurten') {
    // Alleen buurten die de kwaliteitsdrempel halen (uit data/buurten.json).
    const buurten = (await loadData(env, '/data/buurten.json'))?.buurten || [];
    urls = buurten.map((b) => `${CANONICAL_ORIGIN}/gemeente/${b.g}/${b.s}`);
  } else {
    return new Response('Not found', { status: 404 });
  }

  return new Response(xml(urls), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

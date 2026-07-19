// Cloudflare Pages route: /sitemap.xml
// Lists the homepage, the info pages, all city pages and all dataset pages.
// Always uses the production domain so preview deployments never advertise
// pages.dev URLs.
import { CITIES, CANONICAL_ORIGIN } from './_cities.js';
import { DATASETS } from './_datasets.js';

const INFO_PAGES = ['/methode', '/bronnen', '/over', '/pers'];

export const onRequest = () => {
  const urls = [
    `${CANONICAL_ORIGIN}/`,
    ...INFO_PAGES.map((p) => `${CANONICAL_ORIGIN}${p}`),
    ...CITIES.map((c) => `${CANONICAL_ORIGIN}/in/${c.slug}`),
    ...DATASETS.map((d) => `${CANONICAL_ORIGIN}/dataset/${d.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

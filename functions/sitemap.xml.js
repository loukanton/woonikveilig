// Cloudflare Pages route: /sitemap.xml — a sitemap INDEX.
// Points to child sitemaps (/sitemaps/*). Always the production domain so
// preview deployments never advertise pages.dev URLs.
import { CANONICAL_ORIGIN } from './_cities.js';

export const onRequest = () => {
  const children = ['paginas', 'gemeenten'];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children.map((c) => `  <sitemap><loc>${CANONICAL_ORIGIN}/sitemaps/${c}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

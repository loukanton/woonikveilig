// Cloudflare Pages route: /sitemap.xml
// Lists the homepage and all city pages for search engines. Always uses the
// production domain so preview deployments never advertise pages.dev URLs.
import { CITIES, CANONICAL_ORIGIN } from './_cities.js';

export const onRequest = () => {
  const urls = [
    `${CANONICAL_ORIGIN}/`,
    ...CITIES.map((c) => `${CANONICAL_ORIGIN}/in/${c.slug}`),
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

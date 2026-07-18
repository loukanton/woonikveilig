// Cloudflare Pages dynamic route: /in/:city
// Renders an SEO landing page per city; unknown slugs redirect home.
import { cityBySlug, renderCityPage } from '../_cities.js';

export const onRequest = ({ params }) => {
  const city = cityBySlug(params.city);
  if (!city) {
    return new Response(null, { status: 302, headers: { location: '/' } });
  }
  return new Response(renderCityPage(city), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // s-maxage lets the Cloudflare edge cache the page too (browsers alone
      // would not help crawlers, which ignore browser caching).
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

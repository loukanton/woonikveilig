// Cloudflare Pages dynamic route: /dataset/:bron
// Renders a page per open-data source; unknown slugs redirect to /bronnen.
import { datasetBySlug, renderDatasetPage } from '../_datasets.js';

export const onRequest = ({ params }) => {
  const ds = datasetBySlug(params.bron);
  if (!ds) {
    return new Response(null, { status: 302, headers: { location: '/bronnen' } });
  }
  return new Response(renderDatasetPage(ds), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};

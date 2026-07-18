// Cloudflare Pages middleware, runs for every route listed in _routes.json.
// When a share URL carries the report values (?s=score&n=name), we rewrite the
// social meta tags so WhatsApp/LinkedIn crawlers (which run no JavaScript) see
// a per-report title and preview image (/og). The page itself ignores these
// params and recomputes the report live from ?pc=/?buurt=.
//
// The share texts here deliberately mirror shareTexts() in app.js; keep the
// wording in sync when either changes.

// Accept only a plausible score ("5" or "5,0" style, 0-10) and a short name.
// These params are attacker-controllable, so anything else is ignored rather
// than echoed into OG tags on our domain.
function sanitizeShareParams(url) {
  const rawScore = url.searchParams.get('s');
  const rawName = url.searchParams.get('n');

  let score = null;
  if (rawScore && /^\d{1,2}(,\d)?$/.test(rawScore)) {
    const num = Number(rawScore.replace(',', '.'));
    if (num >= 0 && num <= 10) score = rawScore;
  }

  let name = null;
  if (rawName) {
    const trimmed = rawName.trim().slice(0, 60);
    // No URLs or control characters in a neighbourhood name.
    if (trimmed && !/https?:|www\.|[\x00-\x1f]/i.test(trimmed)) name = trimmed;
  }

  // A score without a name can't make a sensible title ("Leefscore 8 voor null").
  if (score && !name) score = null;
  return { score, name };
}

const setContent = (value) => ({ element: (el) => el.setAttribute('content', value) });

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const { score, name } = sanitizeShareParams(url);

  const response = await next();

  // Preview deployments (*.pages.dev) must not compete with woonikveilig.nl
  // in search results; robots.txt allows crawling, so block indexing here.
  if (url.hostname.endsWith('.pages.dev')) {
    const marked = new Response(response.body, response);
    marked.headers.set('x-robots-tag', 'noindex');
    return rewriteShareTags(marked, url, score, name);
  }

  return rewriteShareTags(response, url, score, name);
}

function rewriteShareTags(response, url, score, name) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') || !name) return response;

  const ogImage = new URL('/og', url.origin);
  if (score) ogImage.searchParams.set('s', score);
  ogImage.searchParams.set('n', name);
  const image = ogImage.toString();

  const title = score ? `Leefscore ${score} voor ${name}` : `Buurtrapport voor ${name}`;
  const description =
    'Lucht, geluid, verkeer, veiligheid, gezondheid en omgeving in één leefscore. Check je eigen postcode op Woon ik veilig?';

  const tags = {
    'meta[property="og:image"]': image,
    'meta[name="twitter:image"]': image,
    'meta[property="og:title"]': title,
    'meta[name="twitter:title"]': title,
    'meta[property="og:description"]': description,
    'meta[name="twitter:description"]': description,
    'meta[property="og:url"]': url.toString(),
  };

  let rewriter = new HTMLRewriter();
  for (const [selector, value] of Object.entries(tags)) {
    rewriter = rewriter.on(selector, setContent(value));
  }
  return rewriter.transform(response);
}

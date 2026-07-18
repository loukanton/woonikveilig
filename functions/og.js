// Cloudflare Pages Function: /og
// Renders the share preview card (1200x630 PNG) for social crawlers. Values
// come from the query (?s=5,0&n=Dam, Amsterdam), which the client puts in
// every share URL, so the leefscore never has to be recomputed here.
import { ImageResponse } from 'workers-og';
import { escapeHtml } from './_cities.js';

// Brand score tiers, kept identical to scoreColor() in app.js and the tier
// colors in style.css: green 7+, amber 5 to 7, red below 5, rounded to one
// decimal so the color never contradicts the displayed number. Update all
// three places together.
function scoreColor(score) {
  const n = Math.round(score * 10) / 10;
  if (n >= 7) return '#0a8a4a';
  if (n >= 5) return '#e08a00';
  return '#d64545';
}

// Fonts must be provided explicitly: without them workers-og falls back to
// fetching "Bitter" from Google Fonts, which is slow, brittle, and produced
// empty PNGs in local dev. The brand fonts live in /fonts as TTF (satori
// reads no woff2). Cache the fetch *promise* per file so concurrent cold
// requests share one fetch, and never cache a failed response.
const fontCache = {};
function loadFont(origin, file) {
  if (!fontCache[file]) {
    fontCache[file] = fetch(new URL('/fonts/' + file, origin)).then((res) => {
      if (!res.ok) throw new Error(`font ${file}: http ${res.status}`);
      return res.arrayBuffer();
    });
    fontCache[file].catch(() => { delete fontCache[file]; });
  }
  return fontCache[file];
}

export const onRequest = async ({ request }) => {
  const url = new URL(request.url);
  const rawScore = url.searchParams.get('s');       // e.g. "5,0"
  const name = url.searchParams.get('n') || 'Elke buurt van Nederland';
  const scoreNum = rawScore ? Number(rawScore.replace(',', '.')) : NaN;
  const hasScore = !Number.isNaN(scoreNum);
  const color = hasScore ? scoreColor(scoreNum) : '#f83898';
  const scoreText = hasScore ? escapeHtml(rawScore) : '?';

  // workers-og uses satori, which requires display:flex on every div with
  // more than one child and counts whitespace between tags as children;
  // hence the compact concatenation. Brand style: cool white, navy text,
  // big score number in the tier color, pink accent bar.
  const html =
    `<div style="display:flex;flex-direction:column;width:1200px;height:630px;background:#f5f7fa;padding:72px;font-family:'Plus Jakarta Sans';">` +
      `<div style="display:flex;align-items:center;font-size:30px;font-weight:700;letter-spacing:4px;color:#08304c;">` +
        `<div style="display:flex;width:22px;height:22px;background:#f83898;margin-right:16px;"></div>` +
        `WOON IK VEILIG?` +
      `</div>` +
      `<div style="display:flex;flex-direction:column;margin-top:auto;">` +
        `<div style="display:flex;font-size:34px;font-weight:700;color:#585858;">Leefscore</div>` +
        `<div style="display:flex;align-items:flex-end;">` +
          `<div style="display:flex;font-family:'Archivo Black';font-weight:400;font-size:240px;line-height:1;color:${color};">${scoreText}</div>` +
          `<div style="display:flex;font-size:56px;font-weight:700;color:#08304c;margin:0 0 40px 40px;max-width:600px;">${escapeHtml(name)}</div>` +
        `</div>` +
      `</div>` +
      `<div style="display:flex;margin-top:44px;padding-top:28px;border-top:4px solid #f83898;font-size:28px;font-weight:600;color:#333333;">lucht · geluid · verkeer · veiligheid · gezondheid · omgeving</div>` +
    `</div>`;

  try {
    const [jakarta, archivo] = await Promise.all([
      loadFont(url.origin, 'PlusJakartaSans-Bold.ttf'),
      loadFont(url.origin, 'ArchivoBlack-Regular.ttf'),
    ]);
    const image = new ImageResponse(html, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Plus Jakarta Sans', data: jakarta, weight: 700, style: 'normal' },
        { name: 'Archivo Black', data: archivo, weight: 400, style: 'normal' },
      ],
    });
    // Materialize the stream so a render failure can't ship as an empty PNG.
    const buffer = await image.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('empty PNG from renderer');
    return new Response(buffer, {
      headers: {
        'content-type': 'image/png',
        // A given postcode+score always renders the same card.
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    // Fall back to the generic card so a share always has an image.
    return fetch(new URL('/og-image.png', url.origin));
  }
};

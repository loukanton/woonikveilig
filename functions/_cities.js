// City data + page template for the SEO landing pages (/in/:city).
// Underscore prefix: this file is not a route, only an import for functions.
// Goal: indexable pages that rank for "woon ik veilig in <stad>" and funnel
// visitors into the postcode check.

// Production domain, used for canonical/og URLs so preview deployments
// (*.pages.dev) never present themselves as the canonical copy. robots.txt
// points to the same domain for the sitemap.
export const CANONICAL_ORIGIN = 'https://woonikveilig.nl';

// NOTE: the homepage footer in index.html hand-lists these same cities as
// crawlable internal links. When adding or removing a city here, update the
// footer nav in index.html too.
export const CITIES = [
  { slug: 'amsterdam', name: 'Amsterdam', province: 'Noord-Holland' },
  { slug: 'rotterdam', name: 'Rotterdam', province: 'Zuid-Holland' },
  { slug: 'den-haag', name: 'Den Haag', province: 'Zuid-Holland' },
  { slug: 'utrecht', name: 'Utrecht', province: 'Utrecht' },
  { slug: 'eindhoven', name: 'Eindhoven', province: 'Noord-Brabant' },
  { slug: 'groningen', name: 'Groningen', province: 'Groningen' },
  { slug: 'tilburg', name: 'Tilburg', province: 'Noord-Brabant' },
  { slug: 'almere', name: 'Almere', province: 'Flevoland' },
  { slug: 'breda', name: 'Breda', province: 'Noord-Brabant' },
  { slug: 'nijmegen', name: 'Nijmegen', province: 'Gelderland' },
  { slug: 'apeldoorn', name: 'Apeldoorn', province: 'Gelderland' },
  { slug: 'arnhem', name: 'Arnhem', province: 'Gelderland' },
  { slug: 'haarlem', name: 'Haarlem', province: 'Noord-Holland' },
  { slug: 'enschede', name: 'Enschede', province: 'Overijssel' },
  { slug: 'amersfoort', name: 'Amersfoort', province: 'Utrecht' },
  { slug: 'zaanstad', name: 'Zaanstad', province: 'Noord-Holland' },
  { slug: 'den-bosch', name: "'s-Hertogenbosch", province: 'Noord-Brabant' },
  { slug: 'zwolle', name: 'Zwolle', province: 'Overijssel' },
  { slug: 'leiden', name: 'Leiden', province: 'Zuid-Holland' },
  { slug: 'maastricht', name: 'Maastricht', province: 'Limburg' },
  { slug: 'dordrecht', name: 'Dordrecht', province: 'Zuid-Holland' },
  { slug: 'delft', name: 'Delft', province: 'Zuid-Holland' },
  { slug: 'alkmaar', name: 'Alkmaar', province: 'Noord-Holland' },
  { slug: 'leeuwarden', name: 'Leeuwarden', province: 'Friesland' },
];

export function cityBySlug(slug) {
  return CITIES.find((c) => c.slug === slug) || null;
}

// Shared by the city template and og.js; keep the single copy here.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Full HTML for one city page. Reuses style.css and the brand look.
// The footer mirrors the one in index.html; keep the wording in sync.
export function renderCityPage(city) {
  const name = escapeHtml(city.name);
  const province = escapeHtml(city.province);
  const canonical = `${CANONICAL_ORIGIN}/in/${city.slug}`;
  const title = `Woon ik veilig in ${name}? Leefbaarheid per postcode`;
  const description = `Check per postcode in ${name} hoe leefbaar de buurt is: geluid, lucht, verkeer, veiligheid, gezondheid en omgevingsrisico in één leefscore, uit open data van RIVM, CBS en politie.`;

  // Internal links to the other cities (crawlable, keeps visitors around).
  const otherCities = CITIES.filter((c) => c.slug !== city.slug)
    .map((c) => `<a class="city-link" href="/in/${c.slug}">${escapeHtml(c.name)}</a>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${CANONICAL_ORIGIN}/og-image.png">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  <style>
    .city-intro { margin: 8px 0 0; font-size: 1.02rem; line-height: 1.6; color: var(--body); text-wrap: pretty; }
    .city-section { margin: 40px 0; }
    .city-section h2 { font-family: var(--font-display); font-weight: 400; font-size: 1.35rem; color: var(--ink); margin: 0 0 12px; }
    .city-pillars { margin: 0; padding-left: 20px; line-height: 1.7; color: var(--body); }
    .city-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .city-link { display: inline-block; padding: 6px 12px; border: var(--rule); border-radius: 8px; font-weight: 700; font-size: 0.85rem; color: var(--ink); text-decoration: none; }
    .city-link:hover { background: var(--pink-wash); color: var(--pink-deep); }
  </style>
</head>
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> De buurtcheck voor huizenkopers</p>
      <h1>Woon ik veilig in <span class="accent">${name}?</span></h1>
      <p class="tagline">Hoe leefbaar is een buurt in ${name} (${province})? Check per postcode het geluid, de lucht, het verkeer, de veiligheid, de gezondheid en het omgevingsrisico in één leefscore. Wat Funda je niet vertelt.</p>
    </div>
  </header>

  <main>
    <form class="search-bar" action="/" method="get" autocomplete="off">
      <input type="text" id="postcode-input" name="pc" placeholder="Postcode in ${name}, bijv. 1012JS"
             inputmode="text" spellcheck="false" required aria-label="Postcode">
      <button type="submit" id="search-button">Check de buurt</button>
    </form>

    <p class="city-intro">Een adres in ${name} zegt weinig over de leefomgeving. Deze check haalt de open data van RIVM, CBS, de politie, Luchtmeetnet en het Kadaster op en vertaalt die naar één leefscore van 1 tot 10, met alle deelscores erbij. Zo zie je in één oogopslag of een buurt in ${name} rustig en gezond is, of dat verkeer, geluid of omgevingsrisico's een rol spelen.</p>

    <section class="city-section">
      <h2>Wat de leefscore voor ${name} meet</h2>
      <ul class="city-pillars">
        <li><strong>Lucht</strong>: jaargemiddelde NO₂ en fijnstof (PM2,5) tegen de WHO-advieswaarden.</li>
        <li><strong>Geluid</strong>: geluidsbelasting van weg, spoor, vliegverkeer en industrie (Lden).</li>
        <li><strong>Verkeer</strong>: drukte en verkeersgeluid in de directe omgeving.</li>
        <li><strong>Veiligheid</strong>: geregistreerde misdrijven per 1.000 inwoners in de buurt.</li>
        <li><strong>Gezondheid</strong>: ervaren gezondheid en langdurige aandoeningen in de buurt.</li>
        <li><strong>Omgeving</strong>: overstromingskans, hoogspanning, externe veiligheid en meer.</li>
      </ul>
    </section>

    <section class="city-section">
      <h2>Andere steden</h2>
      <nav class="city-links" aria-label="Andere steden">${otherCities}</nav>
    </section>
  </main>

  <footer class="site-footer">
    <a class="masthead footer-mark" href="https://brighthouse.consulting/" target="_blank" rel="noopener" aria-label="BrightHouse Consulting">Bright<span class="mh-house">House</span><span class="mh-dot"></span></a>
    <p>Een initiatief van <strong>BrightHouse Consulting</strong>. Vragen of een fout gezien? Mail <a href="mailto:media@brighthouse.consulting">media@brighthouse.consulting</a>.</p>
    <p>Alle data komt live uit open bronnen; aan de leefscore kunnen geen rechten worden ontleend.</p>
  </footer>
</body>
</html>`;
}

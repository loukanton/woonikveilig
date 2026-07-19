// Shared rendering for the data-driven programmatic pages (gemeente, provincie).
// Underscore prefix: not a route, only imported by the route functions.
//
// Reads the static /data snapshot (built offline by tools/build-data.mjs) and
// renders unique pages from blocks: samenvatting/AI-overview, kerncijfers,
// vergelijking, FAQ, bronnen, interne links, JSON-LD. The leefscore is NEVER
// computed here; these pages present the bulk-available data (veiligheid,
// gezondheid, demografie) and funnel to the postcode check for the full,
// live-computed leefscore (lucht, geluid, omgeving).
import { CANONICAL_ORIGIN, escapeHtml } from './_cities.js';

// ---------- data access ----------
// Fetch a JSON asset via the Pages ASSETS binding (served from the same deploy).
export async function loadData(env, path) {
  const res = await env.ASSETS.fetch(new Request(`${CANONICAL_ORIGIN}${path}`));
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

// ---------- number formatting (Dutch) ----------
const nlInt = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nl1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtInt = (v) => (v == null ? 'geen data' : nlInt.format(v));
export const fmtNum = (v) => (v == null ? 'geen data' : nl1.format(v));
export const fmtEuro = (thousands) => (thousands == null ? 'geen data' : `€ ${nlInt.format(thousands * 1000)}`);
export const fmtPct = (v) => (v == null ? 'geen data' : `${nl1.format(v)}%`);

// ---------- deterministic variation ----------
// Stable hash of a string (djb2). Used to pick sentence variants per entity so
// text differs between pages but never changes between deploys (no Math.random).
export function hashCode(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
export const pick = (variants, seed) => variants[hashCode(String(seed)) % variants.length];

// Compare a value to a reference; returns qualitative word + direction.
// higherIsWorse=true for crime (more = worse), false for health (more = better).
export function compare(value, ref, { higherIsWorse = false, tol = 0.05 } = {}) {
  if (value == null || ref == null) return { word: null, dir: 0, ratio: null };
  const ratio = value / ref;
  if (Math.abs(ratio - 1) <= tol) return { word: 'vergelijkbaar met', dir: 0, ratio };
  const above = value > ref;
  const good = higherIsWorse ? !above : above;
  return {
    word: above ? 'hoger dan' : 'lager dan',
    good,
    dir: above ? 1 : -1,
    ratio,
  };
}

// ---------- emphasis helpers ----------
// Vet accent voor namen en kerncijfers, zodat ze opvallen in de lopende tekst.
export const bold = (s) => `<strong>${s}</strong>`;
// Themawoord (misdaad, veiligheid, gezondheid ...) vet in de lopende tekst,
// zodat meteen zichtbaar is waar een zin over gaat.
export const theme = (s) => `<strong class="theme">${s}</strong>`;
// Gekleurde nadruk op een vergelijkingswoord: groen als gunstig, rood als
// ongunstig, neutraal-vet bij 'vergelijkbaar'. Richting zit al in cmp.good
// (voor misdaad is minder gunstig, voor gezondheid is meer gunstig).
export function cw(cmp) {
  if (!cmp || !cmp.word) return '';
  if (cmp.dir === 0) return `<strong>${cmp.word}</strong>`;
  return `<strong class="${cmp.good ? 'pos' : 'neg'}">${cmp.word}</strong>`;
}
// Kleur een waarde-cel in een tabel t.o.v. een referentie.
export function colorCell(value, ref, opts, fmt) {
  const txt = fmt(value);
  const c = compare(value, ref, opts);
  if (!c.word || c.dir === 0) return txt;
  return `<span class="${c.good ? 'pos' : 'neg'}">${txt}</span>`;
}

// ---------- HTML shell ----------
function head({ title, description, canonical, jsonLd }) {
  const ld = (jsonLd || []).map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${CANONICAL_ORIGIN}/og-image.png">
  <meta name="theme-color" content="#f83898">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  ${ld}
</head>`;
}

function footer() {
  return `  <footer class="site-footer">
    <a class="masthead footer-mark" href="https://brighthouse.consulting/" target="_blank" rel="noopener" aria-label="BrightHouse Consulting">Bright<span class="mh-house">House</span><span class="mh-dot"></span></a>
    <p>Een initiatief van <strong>BrightHouse Consulting</strong>. Vragen of een fout gezien? Mail <a href="mailto:media@brighthouse.consulting">media@brighthouse.consulting</a>.</p>
    <p>Geen cookies. Alle data komt live uit open bronnen; aan de leefscore kunnen geen rechten worden ontleend.</p>
    <nav class="footer-cities" aria-label="Ranglijsten">
      <span>Ranglijsten:</span>
      <a href="/veiligste-gemeenten">Veiligste gemeenten</a><a href="/gezondste-gemeenten">Gezondste gemeenten</a><a href="/onderzoek/veiligste-buurten-2026">Veiligste buurten 2026</a>
    </nav>
    <nav class="footer-cities" aria-label="Over deze site">
      <span>Over deze site:</span>
      <a href="/methode">Methode</a><a href="/bronnen">Bronnen</a><a href="/over">Over</a><a href="/pers">Pers</a>
    </nav>
  </footer>`;
}

// Breadcrumb nav (visible) + matching JSON-LD BreadcrumbList.
function breadcrumb(items) {
  const links = items.map((it, i) => (it.href && i < items.length - 1
    ? `<a href="${it.href}">${escapeHtml(it.name)}</a>`
    : `<span aria-current="page">${escapeHtml(it.name)}</span>`)).join('<span class="crumb-sep">›</span>');
  return `<nav class="breadcrumb" aria-label="Kruimelpad">${links}</nav>`;
}
function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name,
      ...(it.href ? { item: `${CANONICAL_ORIGIN}${it.href}` } : {}),
    })),
  };
}

function faqLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((q) => ({
      '@type': 'Question', name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a },
    })),
  };
}

function renderFaq(faq) {
  const items = faq.map((q) => `
      <details class="faq-item">
        <summary>${escapeHtml(q.q)}</summary>
        <p>${q.aHtml || escapeHtml(q.a)}</p>
      </details>`).join('');
  return `
    <section class="doc-section" aria-labelledby="faq-h">
      <h2 id="faq-h">Veelgestelde vragen</h2>${items}
    </section>`;
}

// Small inline bar chart (SVG) for a yearly trend; server-rendered so it is
// indexable and visible without JS. values: {year: number}.
function trendChart(trend, { label, color = '#f83898' } = {}) {
  const years = Object.keys(trend || {}).sort();
  if (years.length < 2) return '';
  const vals = years.map((y) => trend[y]);
  const max = Math.max(...vals);
  const w = 320, h = 90, pad = 22, bw = (w - pad) / years.length;
  const bars = years.map((y, i) => {
    const bh = max ? Math.round(((h - pad) * trend[y]) / max) : 0;
    const x = pad + i * bw;
    return `<rect x="${Math.round(x)}" y="${h - pad - bh}" width="${Math.round(bw * 0.66)}" height="${bh}" fill="${color}" rx="2"></rect>`
      + `<text x="${Math.round(x + bw * 0.33)}" y="${h - 6}" font-size="10" text-anchor="middle" fill="#585858">${y}</text>`;
  }).join('');
  return `<figure class="trend"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(label)}">${bars}</svg></figure>`;
}

// ---------- gemeente page ----------
// provRecord: het volledige provinciebestand (voor vergelijking + zustergemeenten).
export function renderGemeentePage(g, nl, provRecord) {
  const name = g.name;
  const prov = g.provincie;
  const d = g.demografie || {};
  g._provVeiligheid = provRecord?.veiligheid?.per1000 ?? null;
  g._provGezondheid = provRecord?.gezondheid?.goedErvarenGezondheid ?? null;
  const canonical = `${CANONICAL_ORIGIN}/gemeente/${g.slug}`;
  const title = `Leefbaarheid in ${name}: veiligheid, gezondheid en cijfers per buurt`;
  const description = `Hoe leefbaar is ${name}? Bekijk veiligheid, gezondheid en kerncijfers uit open data van CBS, politie en RIVM, en check per postcode de volledige leefscore.`;

  const crime = compare(g.veiligheid?.per1000, nl.veiligheid?.per1000, { higherIsWorse: true });
  const health = compare(g.gezondheid?.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid);

  // AI-overview / samenvatting: 2-3 feitelijke zinnen, regelgebaseerd.
  const summary = buildGemeenteSummary(g, nl, crime, health);

  // FAQ
  const faq = buildGemeenteFaq(g, nl, crime, health);

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Place', name,
      address: { '@type': 'PostalAddress', addressRegion: prov.name, addressCountry: 'NL' },
      ...(d.inwoners ? { description: `${name} telt ${fmtInt(d.inwoners)} inwoners.` } : {}),
    },
    breadcrumbLd([
      { name: 'Nederland', href: '/' },
      { name: prov.name, href: `/provincie/${prov.slug}` },
      { name },
    ]),
    faqLd(faq),
  ];

  // Zustergemeenten in dezelfde provincie (interne links, houdt bezoekers rond).
  const siblings = (provRecord?.gemeenten || []).filter((x) => x.code !== g.code);
  const otherGemeenten = siblings.length ? `
    <section class="doc-section">
      <h2>Andere gemeenten in ${escapeHtml(prov.name)}</h2>
      <nav class="doc-links" aria-label="Andere gemeenten in ${escapeHtml(prov.name)}">
        ${siblings.map((x) => `<a class="doc-link" href="/gemeente/${x.slug}">${escapeHtml(x.name)}</a>`).join('')}
      </nav>
    </section>` : '';

  return `${head({ title, description, canonical, jsonLd })}
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> <a href="/provincie/${prov.slug}" style="color:inherit;text-decoration:none;">${escapeHtml(prov.name)}</a></p>
      <h1 class="hero-h1">Leefbaarheid in <span class="accent">${escapeHtml(name)}</span></h1>
      <p class="tagline">Veiligheid, gezondheid en kerncijfers van ${escapeHtml(name)} uit open data. Voor de volledige leefscore, inclusief lucht, geluid en omgevingsrisico, check je hieronder een postcode.</p>
    </div>
  </header>

  <main>
    ${breadcrumb([
      { name: 'Nederland', href: '/' },
      { name: prov.name, href: `/provincie/${prov.slug}` },
      { name },
    ])}

    <section class="ai-overview" aria-label="Samenvatting">
      <p>${summary}</p>
    </section>

    <form class="search-bar" action="/" method="get" autocomplete="off">
      <input type="text" id="postcode-input" name="pc" placeholder="Postcode in ${escapeHtml(name)}, bijv. ${escapeHtml(g.voorbeeldPostcode || '1234AB')}"
             inputmode="text" spellcheck="false" required aria-label="Postcode">
      <button type="submit" id="search-button">Check de buurt</button>
    </form>

    <section class="doc-section">
      <h2>Veiligheid in ${escapeHtml(name)}</h2>
      <p>${buildCrimeText(g, nl, crime)}</p>
      ${trendChart(g.veiligheid?.trend, { label: `Geregistreerde misdrijven in ${name} per jaar` })}
      <p class="doc-note">Geregistreerde misdrijven per 1.000 inwoners, laatste 12 maanden. Bron: politie via CBS (tabel 47022NED), ${escapeHtml(g.peildatum)}.</p>
    </section>

    <section class="doc-section">
      <h2>Gezondheid in ${escapeHtml(name)}</h2>
      <p>${buildHealthText(g, nl, health)}</p>
      ${gezondheidExtra(g)}
      <p class="doc-note">Ervaren gezondheid: aandeel inwoners (18+) dat de eigen gezondheid als goed ervaart, RIVM Gezondheidsmonitor (tabel 50150NED). Sterfte en doodsoorzaken: CBS per gemeente. Absolute sterfte telt niet mee in de leefscore, omdat die vooral de leeftijdsopbouw weerspiegelt.</p>
    </section>

    <section class="doc-section">
      <h2>Kerncijfers van ${escapeHtml(name)}</h2>
      ${kerncijferTable(d)}
      <p class="doc-note">Bron: CBS Kerncijfers wijken en buurten 2024 (tabel 85984NED).</p>
    </section>

    <section class="doc-section">
      <h2>${escapeHtml(name)} vergeleken</h2>
      ${vergelijkTable(g, nl)}
    </section>

    ${g.buurten?.length ? `
    <section class="doc-section">
      <h2>Buurten in ${escapeHtml(name)}</h2>
      <p>${escapeHtml(name)} telt ${fmtInt(g.buurten.length)} buurten. Check per postcode de leefscore van een specifieke buurt.</p>
      ${buurtHighlights(g)}
    </section>` : ''}

    ${renderFaq(faq)}

    ${otherGemeenten}

    <section class="doc-section">
      <h2>Bronnen en actualiteit</h2>
      <p>De cijfers op deze pagina komen uit open data van CBS, de politie en het RIVM, samengesteld op ${escapeHtml(g.peildatum)}. Elke afzonderlijke buurtcheck haalt de gegevens live bij de bron op. Zie <a href="/bronnen">alle databronnen</a> en de <a href="/methode">methode</a> achter de leefscore.</p>
    </section>
  </main>

${footer()}

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

function buildGemeenteSummary(g, nl, crime, health) {
  const name = bold(escapeHtml(g.name));
  const d = g.demografie || {};
  const parts = [];
  // Zin 1: omvang + karakter
  const size = d.inwoners
    ? pick([
        `${name} telt ${bold(fmtInt(d.inwoners))} inwoners`,
        `Met ${bold(fmtInt(d.inwoners))} inwoners`,
        `${name} heeft ${bold(fmtInt(d.inwoners))} inwoners`,
      ], g.code + 'a')
    : name;
  const character = d.stedelijkheidLabel
    ? ` en is ${bold(d.stedelijkheidLabel)}`
    : '';
  parts.push(`${size}${character}.`);
  // Zin 2: veiligheid
  if (g.veiligheid?.per1000 != null && crime.word) {
    parts.push(pick([
      `Er worden jaarlijks ${bold(fmtNum(g.veiligheid.per1000))} ${theme('misdrijven')} per 1.000 inwoners geregistreerd, ${cw(crime)} het landelijk gemiddelde van ${bold(fmtNum(nl.veiligheid.per1000))}.`,
      `Met ${bold(fmtNum(g.veiligheid.per1000))} geregistreerde ${theme('misdrijven')} per 1.000 inwoners ligt ${name} ${cw(crime)} het landelijk gemiddelde (${bold(fmtNum(nl.veiligheid.per1000))}).`,
    ], g.code + 'b'));
  }
  // Zin 3: gezondheid
  if (g.gezondheid?.goedErvarenGezondheid != null && health.word) {
    parts.push(pick([
      `Het aandeel inwoners dat zich ${theme('gezond')} voelt (${bold(fmtPct(g.gezondheid.goedErvarenGezondheid))}) is ${cw(health)} het landelijk gemiddelde.`,
      `${bold(fmtPct(g.gezondheid.goedErvarenGezondheid))} van de inwoners ervaart de eigen ${theme('gezondheid')} als goed, ${cw(health)} het landelijk beeld.`,
    ], g.code + 'c'));
  }
  return parts.join(' ');
}

function buildCrimeText(g, nl, crime) {
  const name = bold(escapeHtml(g.name));
  if (g.veiligheid?.per1000 == null) return `Voor ${name} zijn geen misdaadcijfers per buurt beschikbaar.`;
  const trend = g.veiligheid.trend || {};
  const years = Object.keys(trend).sort();
  let trendText = '';
  if (years.length >= 2) {
    const first = trend[years[0]], last = trend[years.at(-1)];
    const up = last > first * 1.05, down = last < first * 0.95;
    const dir = up ? `<strong class="neg">gestegen</strong>` : (down ? `<strong class="pos">gedaald</strong>` : bold('ongeveer gelijk gebleven'));
    trendText = ` Tussen ${years[0]} en ${years.at(-1)} is het aantal geregistreerde misdrijven ${dir}.`;
  }
  const cmp = crime.word
    ? `Dat is ${cw(crime)} het landelijk gemiddelde van ${bold(fmtNum(nl.veiligheid.per1000))} per 1.000 inwoners.`
    : '';
  return `In ${name} worden per jaar ongeveer ${bold(fmtNum(g.veiligheid.per1000))} ${theme('misdrijven')} per 1.000 inwoners geregistreerd. ${cmp}${trendText}`;
}

function buildHealthText(g, nl, health) {
  const name = bold(escapeHtml(g.name));
  if (g.gezondheid?.goedErvarenGezondheid == null) return `Voor ${name} zijn geen gezondheidscijfers per buurt beschikbaar.`;
  const cmp = health.word
    ? `, ${cw(health)} het landelijk gemiddelde van ${bold(fmtPct(nl.gezondheid.goedErvarenGezondheid))}`
    : '';
  return `In ${name} ervaart ${bold(fmtPct(g.gezondheid.goedErvarenGezondheid))} van de inwoners van 18 jaar en ouder de eigen ${theme('gezondheid')} als goed${cmp}.`;
}

// Aanvullende gezondheidscijfers die we al verzamelen: sterfte en het aandeel
// kanker/ademhalingsziekten in de sterfgevallen, met Nederland als referentie.
function gezondheidExtra(g) {
  const rows = [];
  if (g.sterfte?.perMille != null) {
    rows.push(['Sterfte per 1.000 inwoners', fmtNum(g.sterfte.perMille), g.sterfte.jaar]);
  }
  const c = g.doodsoorzaken;
  if (c?.kanker != null) {
    rows.push(['Aandeel kanker in sterfgevallen', fmtPct(c.kanker * 100), `NL: ${fmtPct((c.kankerNl ?? 0) * 100)}`]);
  }
  if (c?.ademhaling != null) {
    rows.push(['Aandeel ademhalingsziekten', fmtPct(c.ademhaling * 100), `NL: ${fmtPct((c.ademhalingNl ?? 0) * 100)}`]);
  }
  if (!rows.length) return '';
  return `<table class="doc-table"><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num doc-ref">${escapeHtml(r[2] || '')}</td></tr>`).join('')}</tbody></table>`;
}

function kerncijferTable(d) {
  const pctOf = (part) => (part != null && d.inwoners ? fmtPct((part / d.inwoners) * 100) : 'geen data');
  const rows = [
    ['Inwoners', fmtInt(d.inwoners)],
    ['Bevolkingsdichtheid', d.dichtheid != null ? `${fmtInt(d.dichtheid)} per km²` : 'geen data'],
    ['Stedelijkheid', d.stedelijkheidLabel || 'geen data'],
    ['Inwoners tot 15 jaar', pctOf(d.inwoners0tot15)],
    ['Inwoners 65 jaar en ouder', pctOf(d.inwoners65plus)],
    ['Gemiddelde huishoudensgrootte', d.huishoudensgrootte != null ? fmtNum(d.huishoudensgrootte) : 'geen data'],
    ['Gemiddelde WOZ-waarde', fmtEuro(d.wozWaarde)],
    ['Koopwoningen', fmtPct(d.koopwoningen)],
    ['Eengezinswoningen', fmtPct(d.eengezinswoning)],
    ['Gemiddeld inkomen per inwoner', fmtEuro(d.inkomenPerInwoner)],
    ['Oppervlakte land', d.oppervlakteLandKm2 != null ? `${fmtNum(d.oppervlakteLandKm2)} km²` : 'geen data'],
    ['Afstand tot supermarkt', d.afstandSupermarkt != null ? `${fmtNum(d.afstandSupermarkt)} km` : 'geen data'],
    ['Afstand tot huisarts', d.afstandHuisarts != null ? `${fmtNum(d.afstandHuisarts)} km` : 'geen data'],
    ['Afstand tot basisschool', d.afstandSchool != null ? `${fmtNum(d.afstandSchool)} km` : 'geen data'],
    ['Scholen binnen 3 km', d.scholenBinnen3km != null ? fmtNum(d.scholenBinnen3km) : 'geen data'],
  ].filter((r) => r[1] !== 'geen data');
  return `<table class="doc-table"><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td></tr>`).join('')}</tbody></table>`;
}

function vergelijkTable(g, nl) {
  const prov = g.provincie;
  // De eigen waarde van de gemeente kleuren t.o.v. Nederland (groen = gunstig).
  const row = (label, gv, pv, nlv, fmt, higherIsWorse) => {
    return `<tr><td>${label}</td><td class="num">${colorCell(gv, nlv, { higherIsWorse }, fmt)}</td><td class="num">${fmt(pv)}</td><td class="num">${fmt(nlv)}</td></tr>`;
  };
  return `<table class="doc-table">
    <thead><tr><th></th><th class="num">${escapeHtml(g.name)}</th><th class="num">Provincie ${escapeHtml(prov.name)}</th><th class="num">Nederland</th></tr></thead>
    <tbody>
      ${row('Misdrijven per 1.000 inw.', g.veiligheid?.per1000, g._provVeiligheid, nl.veiligheid?.per1000, fmtNum, true)}
      ${row('Voelt zich gezond', g.gezondheid?.goedErvarenGezondheid, g._provGezondheid, nl.gezondheid?.goedErvarenGezondheid, fmtPct, false)}
    </tbody>
  </table>
  <p class="doc-note">Provinciecijfers zijn naar inwonertal gewogen gemiddelden.</p>`;
}

function buurtHighlights(g) {
  // Toon de veiligste buurten (laagste per1000) met minstens 200 inwoners;
  // elke buurt linkt naar haar eigen pagina.
  const scored = (g.buurten || [])
    .filter((b) => b.veiligheid?.per1000 != null && (b.demografie?.inwoners || 0) >= 200)
    .sort((a, b) => a.veiligheid.per1000 - b.veiligheid.per1000)
    .slice(0, 8);
  if (!scored.length) return '';
  const items = scored.map((b) => `<li><a href="/gemeente/${g.slug}/${b.slug}">${escapeHtml(b.name)}</a>: ${fmtNum(b.veiligheid.per1000)} misdrijven per 1.000 inwoners</li>`).join('');
  return `<p>Buurten met de minste geregistreerde misdrijven per 1.000 inwoners:</p><ul class="doc-list">${items}</ul>`;
}

function buildGemeenteFaq(g, nl, crime, health) {
  const name = escapeHtml(g.name);
  const faq = [];
  if (g.veiligheid?.per1000 != null) {
    faq.push({
      q: `Hoe veilig is ${g.name}?`,
      a: `In ${g.name} worden per jaar ongeveer ${fmtNum(g.veiligheid.per1000)} misdrijven per 1.000 inwoners geregistreerd${crime.word ? `, ${crime.word} het landelijk gemiddelde van ${fmtNum(nl.veiligheid.per1000)}` : ''}. Dit zijn registraties op pleeglocatie; check per postcode de veiligheid van een specifieke buurt.`,
    });
  }
  if (g.gezondheid?.goedErvarenGezondheid != null) {
    faq.push({
      q: `Hoe gezond wonen mensen in ${g.name}?`,
      a: `${fmtPct(g.gezondheid.goedErvarenGezondheid)} van de inwoners van ${g.name} (18 jaar en ouder) ervaart de eigen gezondheid als goed${health.word ? `, ${health.word} het landelijk gemiddelde` : ''}.`,
    });
  }
  faq.push({
    q: `Hoe wordt de leefscore van ${g.name} bepaald?`,
    a: 'De leefscore is een gewogen gemiddelde van lucht, geluid, verkeer, veiligheid, gezondheid en omgevingsrisico, berekend per postcode. Deze pagina toont de cijfers die per gemeente in bulk beschikbaar zijn; de volledige leefscore reken je uit door hierboven een postcode te checken.',
  });
  return faq;
}

// ---------- buurt page ----------
// b: de buurt uit het gemeentebestand; g: gemeenterecord; nl: landelijk.
// De route bepaalt of de buurt de drempel haalt; deze functie rendert.
export function renderBuurtPage(b, g, nl) {
  const name = b.name;
  const prov = g.provincie;
  const d = b.demografie || {};
  const canonical = `${CANONICAL_ORIGIN}/gemeente/${g.slug}/${b.slug}`;
  const title = `Leefbaarheid in ${name} (${g.name}): veiligheid en cijfers`;
  const description = `Hoe leefbaar is de buurt ${name} in ${g.name}? Bekijk veiligheid, gezondheid en kerncijfers uit open data, en check de leefscore per postcode.`;

  const crimeVsGem = compare(b.veiligheid?.per1000, g.veiligheid?.per1000, { higherIsWorse: true });
  const crimeVsNl = compare(b.veiligheid?.per1000, nl.veiligheid?.per1000, { higherIsWorse: true });
  const healthVsNl = compare(b.gezondheid?.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid);

  const summary = buildBuurtSummary(b, g, nl, crimeVsGem, healthVsNl);
  const faq = buildBuurtFaq(b, g, nl, crimeVsGem);

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Place', name,
      containedInPlace: { '@type': 'AdministrativeArea', name: g.name },
      address: { '@type': 'PostalAddress', addressLocality: g.name, addressRegion: prov.name, addressCountry: 'NL' },
    },
    breadcrumbLd([
      { name: 'Nederland', href: '/' },
      { name: prov.name, href: `/provincie/${prov.slug}` },
      { name: g.name, href: `/gemeente/${g.slug}` },
      { name },
    ]),
    faqLd(faq),
  ];

  const siblings = (g.buurten || [])
    .filter((x) => x.slug !== b.slug && (x.demografie?.inwoners || 0) >= 200)
    .sort((a, c) => a.name.localeCompare(c.name));

  return `${head({ title, description, canonical, jsonLd })}
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> <a href="/gemeente/${g.slug}" style="color:inherit;text-decoration:none;">${escapeHtml(g.name)}</a></p>
      <h1 class="hero-h1">Leefbaarheid in <span class="accent">${escapeHtml(name)}</span></h1>
      <p class="tagline">De buurt ${escapeHtml(name)} in ${escapeHtml(g.name)}: veiligheid, gezondheid en kerncijfers uit open data. Check de volledige leefscore per postcode.</p>
    </div>
  </header>

  <main>
    ${breadcrumb([
      { name: 'Nederland', href: '/' },
      { name: prov.name, href: `/provincie/${prov.slug}` },
      { name: g.name, href: `/gemeente/${g.slug}` },
      { name },
    ])}

    <section class="ai-overview" aria-label="Samenvatting">
      <p>${summary}</p>
    </section>

    <form class="search-bar" action="/" method="get" autocomplete="off">
      <input type="text" id="postcode-input" name="pc" placeholder="Postcode in ${escapeHtml(name)}, bijv. ${escapeHtml(d.postcode || g.voorbeeldPostcode || '1234AB')}"
             inputmode="text" spellcheck="false" required aria-label="Postcode">
      <button type="submit" id="search-button">Check de buurt</button>
    </form>

    <section class="doc-section">
      <h2>Veiligheid in ${escapeHtml(name)}</h2>
      <p>${buildBuurtCrimeText(b, g, nl, crimeVsGem, crimeVsNl)}</p>
      ${trendChart(b.veiligheid?.trend, { label: `Geregistreerde misdrijven in ${name} per jaar` })}
      <p class="doc-note">Geregistreerde misdrijven per 1.000 inwoners, laatste 12 maanden. Bron: politie via CBS (tabel 47022NED), ${escapeHtml(g.peildatum)}. In kleine buurten schommelen deze cijfers sterk.</p>
    </section>

    ${b.gezondheid?.goedErvarenGezondheid != null ? `
    <section class="doc-section">
      <h2>Gezondheid in ${escapeHtml(name)}</h2>
      <p>In ${bold(escapeHtml(name))} ervaart ${bold(fmtPct(b.gezondheid.goedErvarenGezondheid))} van de inwoners (18+) de eigen ${theme('gezondheid')} als goed${healthVsNl.word ? `, ${cw(healthVsNl)} het landelijk gemiddelde van ${bold(fmtPct(nl.gezondheid.goedErvarenGezondheid))}` : ''}.</p>
      <p class="doc-note">Modelschatting per buurt. Bron: RIVM Gezondheidsmonitor (tabel 50150NED).</p>
    </section>` : ''}

    <section class="doc-section">
      <h2>Kerncijfers van ${escapeHtml(name)}</h2>
      ${kerncijferTable(d)}
      <p class="doc-note">Bron: CBS Kerncijfers wijken en buurten 2024 (tabel 85984NED).</p>
    </section>

    <section class="doc-section">
      <h2>${escapeHtml(name)} vergeleken</h2>
      <table class="doc-table">
        <thead><tr><th></th><th class="num">${escapeHtml(name)}</th><th class="num">${escapeHtml(g.name)}</th><th class="num">Nederland</th></tr></thead>
        <tbody>
          <tr><td>Misdrijven per 1.000 inw.</td><td class="num">${colorCell(b.veiligheid?.per1000, nl.veiligheid?.per1000, { higherIsWorse: true }, fmtNum)}</td><td class="num">${fmtNum(g.veiligheid?.per1000)}</td><td class="num">${fmtNum(nl.veiligheid?.per1000)}</td></tr>
          <tr><td>Voelt zich gezond</td><td class="num">${colorCell(b.gezondheid?.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid, { higherIsWorse: false }, fmtPct)}</td><td class="num">${fmtPct(g.gezondheid?.goedErvarenGezondheid)}</td><td class="num">${fmtPct(nl.gezondheid?.goedErvarenGezondheid)}</td></tr>
        </tbody>
      </table>
    </section>

    ${renderFaq(faq)}

    ${siblings.length ? `
    <section class="doc-section">
      <h2>Andere buurten in ${escapeHtml(g.name)}</h2>
      <nav class="doc-links" aria-label="Andere buurten in ${escapeHtml(g.name)}">
        ${siblings.slice(0, 40).map((x) => `<a class="doc-link" href="/gemeente/${g.slug}/${x.slug}">${escapeHtml(x.name)}</a>`).join('')}
      </nav>
      <p style="margin-top:14px;"><a href="/gemeente/${g.slug}">Alle cijfers van ${escapeHtml(g.name)} &rarr;</a></p>
    </section>` : ''}

    <section class="doc-section">
      <h2>Bronnen en actualiteit</h2>
      <p>De cijfers komen uit open data van CBS, de politie en het RIVM, samengesteld op ${escapeHtml(g.peildatum)}. Elke buurtcheck haalt de gegevens live bij de bron op. Zie <a href="/bronnen">alle databronnen</a> en de <a href="/methode">methode</a> achter de leefscore.</p>
    </section>
  </main>

${footer()}

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

function buildBuurtSummary(b, g, nl, crimeVsGem, healthVsNl) {
  const name = bold(escapeHtml(b.name));
  const d = b.demografie || {};
  const parts = [];
  const size = d.inwoners ? `${name} is een buurt in ${bold(escapeHtml(g.name))} met ${bold(fmtInt(d.inwoners))} inwoners` : `${name} is een buurt in ${bold(escapeHtml(g.name))}`;
  parts.push(`${size}.`);
  if (b.veiligheid?.per1000 != null && crimeVsGem.word) {
    parts.push(pick([
      `Er worden ${bold(fmtNum(b.veiligheid.per1000))} ${theme('misdrijven')} per 1.000 inwoners per jaar geregistreerd, ${cw(crimeVsGem)} het gemeentegemiddelde van ${bold(fmtNum(g.veiligheid.per1000))}.`,
      `Met ${bold(fmtNum(b.veiligheid.per1000))} geregistreerde ${theme('misdrijven')} per 1.000 inwoners ligt de buurt ${cw(crimeVsGem)} het gemiddelde van ${bold(escapeHtml(g.name))} (${bold(fmtNum(g.veiligheid.per1000))}).`,
    ], b.code));
  }
  if (b.gezondheid?.goedErvarenGezondheid != null && healthVsNl.word) {
    parts.push(`${bold(fmtPct(b.gezondheid.goedErvarenGezondheid))} van de inwoners voelt zich ${theme('gezond')}, ${cw(healthVsNl)} het landelijk beeld.`);
  }
  return parts.join(' ');
}

function buildBuurtCrimeText(b, g, nl, crimeVsGem, crimeVsNl) {
  const name = bold(escapeHtml(b.name));
  if (b.veiligheid?.per1000 == null) return `Voor ${name} zijn geen misdaadcijfers beschikbaar.`;
  const trend = b.veiligheid.trend || {};
  const years = Object.keys(trend).sort();
  let trendText = '';
  if (years.length >= 2) {
    const first = trend[years[0]], last = trend[years.at(-1)];
    const up = last > first * 1.05, down = last < first * 0.95;
    const dir = up ? `<strong class="neg">gestegen</strong>` : (down ? `<strong class="pos">gedaald</strong>` : bold('ongeveer gelijk gebleven'));
    trendText = ` Tussen ${years[0]} en ${years.at(-1)} is het aantal geregistreerde misdrijven ${dir}.`;
  }
  const parts = [`In ${name} worden per jaar ongeveer ${bold(fmtNum(b.veiligheid.per1000))} ${theme('misdrijven')} per 1.000 inwoners geregistreerd.`];
  if (crimeVsGem.word) parts.push(`Dat is ${cw(crimeVsGem)} het gemeentegemiddelde van ${bold(escapeHtml(g.name))} (${bold(fmtNum(g.veiligheid.per1000))})`);
  if (crimeVsNl.word) parts.push(`en ${cw(crimeVsNl)} het landelijk gemiddelde van ${bold(fmtNum(nl.veiligheid.per1000))}`);
  return parts.join(' ').replace(/\)\s+en /, ') en ') + '.' + trendText;
}

function buildBuurtFaq(b, g, nl, crimeVsGem) {
  const faq = [];
  if (b.veiligheid?.per1000 != null) {
    faq.push({
      q: `Hoe veilig is ${b.name}?`,
      a: `In ${b.name} (${g.name}) worden per jaar ongeveer ${fmtNum(b.veiligheid.per1000)} misdrijven per 1.000 inwoners geregistreerd${crimeVsGem.word ? `, ${crimeVsGem.word} het gemeentegemiddelde` : ''}. Het gaat om registraties op pleeglocatie; in kleine buurten schommelen de cijfers sterk.`,
    });
  }
  faq.push({
    q: `Wat is de leefscore van ${b.name}?`,
    a: `De volledige leefscore combineert lucht, geluid, verkeer, veiligheid, gezondheid en omgevingsrisico en wordt per postcode berekend. Check hierboven een postcode in ${b.name} voor het complete rapport.`,
  });
  return faq;
}

// ---------- provincie page ----------
// allProvincies: compacte lijst uit provincies.json (voor de interne nav).
export function renderProvinciePage(p, nl, allProvincies = []) {
  const name = p.name;
  const provNav = allProvincies.filter((x) => x.slug !== p.slug)
    .map((x) => `<a class="doc-link" href="/provincie/${x.slug}">${escapeHtml(x.name)}</a>`).join('');
  const canonical = `${CANONICAL_ORIGIN}/provincie/${p.slug}`;
  const title = `Leefbaarheid in provincie ${name}: veiligheid en gezondheid per gemeente`;
  const description = `Hoe leefbaar is ${name}? Vergelijk veiligheid en gezondheid van alle ${p.aantalGemeenten} gemeenten uit open data van CBS, politie en RIVM.`;

  const crime = compare(p.veiligheid?.per1000, nl.veiligheid?.per1000, { higherIsWorse: true });
  const health = compare(p.gezondheid?.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid);

  const summaryParts = [`De provincie ${bold(escapeHtml(name))} telt ${bold(fmtInt(p.aantalGemeenten))} gemeenten en ${bold(fmtInt(p.demografie?.inwoners))} inwoners.`];
  if (crime.word) summaryParts.push(`Gemiddeld worden er ${bold(fmtNum(p.veiligheid.per1000))} ${theme('misdrijven')} per 1.000 inwoners geregistreerd, ${cw(crime)} het landelijk gemiddelde.`);
  if (health.word) summaryParts.push(`${bold(fmtPct(p.gezondheid.goedErvarenGezondheid))} van de inwoners voelt zich ${theme('gezond')}, ${cw(health)} het landelijk beeld.`);

  const faq = [
    {
      q: `Hoeveel gemeenten heeft ${name}?`,
      a: `De provincie ${name} telt ${fmtInt(p.aantalGemeenten)} gemeenten met samen ${fmtInt(p.demografie?.inwoners)} inwoners.`,
    },
    {
      q: `Welke gemeente in ${name} is het veiligst?`,
      a: safestGemeenteAnswer(p),
    },
    {
      q: `Hoe wordt de leefbaarheid gemeten?`,
      a: 'Uit open data van CBS, de politie en het RIVM: geregistreerde misdrijven per 1.000 inwoners en het aandeel inwoners dat zich gezond voelt. De volledige leefscore, inclusief lucht, geluid en omgevingsrisico, reken je per postcode uit.',
    },
  ];

  const jsonLd = [
    {
      '@context': 'https://schema.org', '@type': 'Place', name: `Provincie ${name}`,
      address: { '@type': 'PostalAddress', addressRegion: name, addressCountry: 'NL' },
    },
    breadcrumbLd([{ name: 'Nederland', href: '/' }, { name }]),
    faqLd(faq),
  ];

  return `${head({ title, description, canonical, jsonLd })}
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> Provincie</p>
      <h1 class="hero-h1">Leefbaarheid in <span class="accent">${escapeHtml(name)}</span></h1>
      <p class="tagline">Vergelijk de veiligheid en gezondheid van alle ${fmtInt(p.aantalGemeenten)} gemeenten in ${escapeHtml(name)}, uit open data. Check per postcode de volledige leefscore.</p>
    </div>
  </header>

  <main>
    ${breadcrumb([{ name: 'Nederland', href: '/' }, { name }])}

    <section class="ai-overview" aria-label="Samenvatting">
      <p>${summaryParts.join(' ')}</p>
    </section>

    <form class="search-bar" action="/" method="get" autocomplete="off">
      <input type="text" id="postcode-input" name="pc" placeholder="Postcode, bijv. 1234AB"
             inputmode="text" spellcheck="false" required aria-label="Postcode">
      <button type="submit" id="search-button">Check de buurt</button>
    </form>

    <section class="doc-section">
      <h2>${escapeHtml(name)} vergeleken met Nederland</h2>
      <table class="doc-table">
        <thead><tr><th></th><th class="num">${escapeHtml(name)}</th><th class="num">Nederland</th></tr></thead>
        <tbody>
          <tr><td>Misdrijven per 1.000 inw.</td><td class="num">${colorCell(p.veiligheid?.per1000, nl.veiligheid?.per1000, { higherIsWorse: true }, fmtNum)}</td><td class="num">${fmtNum(nl.veiligheid?.per1000)}</td></tr>
          <tr><td>Voelt zich gezond</td><td class="num">${colorCell(p.gezondheid?.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid, { higherIsWorse: false }, fmtPct)}</td><td class="num">${fmtPct(nl.gezondheid?.goedErvarenGezondheid)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="doc-section">
      <h2>Alle gemeenten in ${escapeHtml(name)}</h2>
      <table class="doc-table">
        <thead><tr><th>Gemeente</th><th class="num">Inwoners</th><th class="num">Misdrijven /1.000</th><th class="num">Voelt zich gezond</th></tr></thead>
        <tbody>
          ${(p.gemeenten || []).map((gm) => `<tr>
            <td><a href="/gemeente/${gm.slug}">${escapeHtml(gm.name)}</a></td>
            <td class="num">${fmtInt(gm.inwoners)}</td>
            <td class="num">${colorCell(gm.veiligheidPer1000, nl.veiligheid?.per1000, { higherIsWorse: true }, fmtNum)}</td>
            <td class="num">${colorCell(gm.goedErvarenGezondheid, nl.gezondheid?.goedErvarenGezondheid, { higherIsWorse: false }, fmtPct)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>

    ${renderFaq(faq)}

    <section class="doc-section">
      <h2>Andere provincies</h2>
      <nav class="doc-links" aria-label="Andere provincies">${provNav}</nav>
    </section>

    <section class="doc-section">
      <h2>Bronnen en actualiteit</h2>
      <p>De cijfers komen uit open data van CBS, de politie en het RIVM, samengesteld op ${escapeHtml(p.peildatum)}. Zie <a href="/bronnen">alle databronnen</a> en de <a href="/methode">methode</a>.</p>
    </section>
  </main>

${footer()}

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

function safestGemeenteAnswer(p) {
  const g = (p.gemeenten || [])
    .filter((x) => x.veiligheidPer1000 != null)
    .sort((a, b) => a.veiligheidPer1000 - b.veiligheidPer1000)[0];
  if (!g) return `Voor ${p.name} zijn geen vergelijkbare veiligheidscijfers beschikbaar.`;
  return `Van de gemeenten in ${p.name} registreert ${g.name} de minste misdrijven per 1.000 inwoners (${fmtNum(g.veiligheidPer1000)}). Cijfers zijn registraties op pleeglocatie; kleine gemeenten schommelen sterker.`;
}

// ---------- ranglijsten (nationaal, per gemeente) ----------
// kind: 'veiligste' (minste misdrijven) of 'gezondste' (meeste ervaren gezondheid).
const RANKING_MIN_INWONERS = 2500; // kleine gemeenten schommelen te sterk

export function renderRankingGemeenten(gemeenten, nl, kind) {
  const cfg = kind === 'gezondste'
    ? {
        h1a: 'Gezondste', h1b: 'gemeenten', thema: 'gezondheid',
        metric: 'goedErvarenGezondheid', asc: false, higherIsWorse: false,
        colLabel: 'Voelt zich gezond', fmt: fmtPct,
        nlVal: nl.gezondheid?.goedErvarenGezondheid,
        intro: 'gemeten aan het aandeel inwoners dat de eigen gezondheid als goed ervaart',
        slug: 'gezondste-gemeenten', other: { slug: 'veiligste-gemeenten', label: 'Veiligste gemeenten' },
      }
    : {
        h1a: 'Veiligste', h1b: 'gemeenten', thema: 'veiligheid',
        metric: 'veiligheidPer1000', asc: true, higherIsWorse: true,
        colLabel: 'Misdrijven per 1.000 inw.', fmt: fmtNum,
        nlVal: nl.veiligheid?.per1000,
        intro: 'gemeten aan het aantal geregistreerde misdrijven per 1.000 inwoners',
        slug: 'veiligste-gemeenten', other: { slug: 'gezondste-gemeenten', label: 'Gezondste gemeenten' },
      };

  const ranked = gemeenten
    .filter((g) => g[cfg.metric] != null && (g.inwoners || 0) >= RANKING_MIN_INWONERS)
    .sort((a, b) => cfg.asc ? a[cfg.metric] - b[cfg.metric] : b[cfg.metric] - a[cfg.metric]);

  const canonical = `${CANONICAL_ORIGIN}/${cfg.slug}`;
  const title = `${cfg.h1a} gemeenten van Nederland (${gemeenten[0]?.peildatum || ''})`.replace(' ()', '');
  const description = `De ${cfg.h1a.toLowerCase()} gemeenten van Nederland, ${cfg.intro}, uit open data van CBS, politie en RIVM. Ranglijst van ${ranked.length} gemeenten.`;
  const top = ranked[0];

  const summary = top
    ? `${bold(escapeHtml(top.name))} is volgens deze cijfers de ${theme(cfg.h1a.toLowerCase())} gemeente van Nederland, met ${bold(cfg.fmt(top[cfg.metric]))} (${cfg.colLabel.toLowerCase()}). De ranglijst vergelijkt ${bold(String(ranked.length))} gemeenten met minstens ${fmtInt(RANKING_MIN_INWONERS)} inwoners, ${cfg.intro}.`
    : 'Geen data beschikbaar.';

  const faq = [
    { q: `Wat is de ${cfg.h1a.toLowerCase()} gemeente van Nederland?`, a: top ? `${top.name}, met ${cfg.fmt(top[cfg.metric])} (${cfg.colLabel.toLowerCase()}).` : 'Geen data.' },
    { q: 'Hoe is deze ranglijst gemaakt?', a: `Op basis van open data van CBS, de politie en het RIVM, ${cfg.intro}. Alleen gemeenten met minstens ${RANKING_MIN_INWONERS} inwoners doen mee, omdat cijfers in kleine gemeenten sterk schommelen.` },
  ];

  const jsonLd = [
    breadcrumbLd([{ name: 'Nederland', href: '/' }, { name: `${cfg.h1a} gemeenten` }]),
    faqLd(faq),
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: title,
      itemListElement: ranked.slice(0, 20).map((g, i) => ({
        '@type': 'ListItem', position: i + 1, name: g.name, url: `${CANONICAL_ORIGIN}/gemeente/${g.slug}`,
      })),
    },
  ];

  const rows = ranked.map((g, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td><a href="/gemeente/${g.slug}">${escapeHtml(g.name)}</a></td>
    <td>${g.provincie ? `<a href="/provincie/${g.provincie}">${escapeHtml(g.provincieNaam || '')}</a>` : ''}</td>
    <td class="num">${fmtInt(g.inwoners)}</td>
    <td class="num">${colorCell(g[cfg.metric], cfg.nlVal, { higherIsWorse: cfg.higherIsWorse }, cfg.fmt)}</td>
  </tr>`).join('');

  return `${head({ title, description, canonical, jsonLd })}
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> Ranglijst</p>
      <h1 class="hero-h1">${cfg.h1a} <span class="accent">${cfg.h1b}</span> van Nederland</h1>
      <p class="tagline">De ${cfg.h1a.toLowerCase()} gemeenten van Nederland, ${cfg.intro}. Uit open data van CBS, politie en RIVM.</p>
    </div>
  </header>

  <main>
    ${breadcrumb([{ name: 'Nederland', href: '/' }, { name: `${cfg.h1a} gemeenten` }])}

    <section class="ai-overview" aria-label="Samenvatting"><p>${summary}</p></section>

    <section class="doc-section">
      <h2>Ranglijst</h2>
      <div class="table-scroll"><table class="doc-table ranking-table">
        <thead><tr><th class="rank">#</th><th>Gemeente</th><th>Provincie</th><th class="num">Inwoners</th><th class="num">${cfg.colLabel}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="doc-note">Nederland: ${cfg.fmt(cfg.nlVal)}. Alleen gemeenten met minstens ${fmtInt(RANKING_MIN_INWONERS)} inwoners. Bron: CBS, politie, RIVM, ${escapeHtml(gemeenten[0]?.peildatum || '')}.</p>
    </section>

    ${renderFaq(faq)}

    <section class="doc-section">
      <h2>Meer ranglijsten</h2>
      <nav class="doc-links">
        <a class="doc-link" href="/${cfg.other.slug}">${cfg.other.label}</a>
        <a class="doc-link" href="/onderzoek/veiligste-buurten-2026">Veiligste buurten 2026</a>
      </nav>
    </section>

    <section class="doc-section">
      <h2>Bronnen</h2>
      <p>Zie <a href="/bronnen">alle databronnen</a> en de <a href="/methode">methode</a>. De volledige leefscore per postcode reken je op de <a href="/">homepage</a> uit.</p>
    </section>
  </main>

${footer()}

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

// ---------- onderzoek: veiligste buurten van Nederland ----------
export function renderOnderzoekBuurten(data, nl, year) {
  const lijst = data.veiligste || [];
  const canonical = `${CANONICAL_ORIGIN}/onderzoek/veiligste-buurten-${year}`;
  const title = `De veiligste buurten van Nederland ${year}`;
  const description = `Onderzoek ${year}: de ${lijst.length} veiligste buurten van Nederland op basis van geregistreerde misdrijven per 1.000 inwoners (CBS, politie).`;
  const top = lijst[0];

  const summary = top
    ? `In dit onderzoek van ${year} is ${bold(escapeHtml(top.buurt))} in ${bold(escapeHtml(top.gemeente))} de ${theme('veiligste')} buurt van Nederland, met ${bold(fmtNum(top.per1000))} geregistreerde ${theme('misdrijven')} per 1.000 inwoners. De lijst vergelijkt ${bold(fmtInt(data.aantalMeegenomen))} buurten met minstens ${fmtInt(data.minInwoners)} inwoners.`
    : 'Geen data beschikbaar.';

  const faq = [
    { q: `Wat is de veiligste buurt van Nederland in ${year}?`, a: top ? `${top.buurt} in ${top.gemeente}, met ${fmtNum(top.per1000)} geregistreerde misdrijven per 1.000 inwoners.` : 'Geen data.' },
    { q: 'Hoe is dit onderzoek uitgevoerd?', a: `Voor elke buurt in Nederland met minstens ${data.minInwoners} inwoners is het aantal geregistreerde misdrijven per 1.000 inwoners over de laatste twaalf maanden berekend (politie via CBS). De buurten zijn daarop gerangschikt. In totaal zijn ${data.aantalMeegenomen} buurten meegenomen.` },
    { q: 'Betekent een lage score dat een buurt echt veilig is?', a: 'Het gaat om geregistreerde misdrijven op pleeglocatie; niet elk misdrijf wordt aangegeven, en woonwijken scoren van nature lager dan winkel- of uitgaansgebieden. De cijfers zijn een indicatie, geen absoluut oordeel.' },
  ];

  const jsonLd = [
    breadcrumbLd([{ name: 'Nederland', href: '/' }, { name: 'Onderzoek', href: '/onderzoek/veiligste-buurten-2026' }, { name: `Veiligste buurten ${year}` }]),
    faqLd(faq),
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: title,
      itemListElement: lijst.slice(0, 20).map((b, i) => ({
        '@type': 'ListItem', position: i + 1, name: `${b.buurt} (${b.gemeente})`,
        url: `${CANONICAL_ORIGIN}/gemeente/${b.gemeenteSlug}/${b.buurtSlug}`,
      })),
    },
  ];

  const rows = lijst.map((b, i) => `<tr>
    <td class="rank">${i + 1}</td>
    <td><a href="/gemeente/${b.gemeenteSlug}/${b.buurtSlug}">${escapeHtml(b.buurt)}</a></td>
    <td><a href="/gemeente/${b.gemeenteSlug}">${escapeHtml(b.gemeente)}</a></td>
    <td>${b.provincieSlug ? `<a href="/provincie/${b.provincieSlug}">${escapeHtml(b.provincie || '')}</a>` : escapeHtml(b.provincie || '')}</td>
    <td class="num">${fmtInt(b.inwoners)}</td>
    <td class="num">${colorCell(b.per1000, nl.veiligheid?.per1000, { higherIsWorse: true }, fmtNum)}</td>
  </tr>`).join('');

  return `${head({ title, description, canonical, jsonLd })}
<body>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> Onderzoek ${year}</p>
      <h1 class="hero-h1">De veiligste <span class="accent">buurten</span> van Nederland</h1>
      <p class="tagline">Welke buurten registreren de minste misdrijven per inwoner? Een ranglijst uit open data van politie en CBS, editie ${year}.</p>
    </div>
  </header>

  <main>
    ${breadcrumb([{ name: 'Nederland', href: '/' }, { name: `Veiligste buurten ${year}` }])}

    <section class="ai-overview" aria-label="Samenvatting"><p>${summary}</p></section>

    <section class="doc-section">
      <h2>Top ${lijst.length} veiligste buurten van Nederland</h2>
      <div class="table-scroll"><table class="doc-table ranking-table">
        <thead><tr><th class="rank">#</th><th>Buurt</th><th>Gemeente</th><th>Provincie</th><th class="num">Inwoners</th><th class="num">Misdrijven /1.000</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="doc-note">Landelijk gemiddelde: ${fmtNum(nl.veiligheid?.per1000)} misdrijven per 1.000 inwoners. ${fmtInt(data.aantalMeegenomen)} buurten met minstens ${fmtInt(data.minInwoners)} inwoners meegewogen. Bron: politie via CBS (tabel 47022NED), ${escapeHtml(data.peildatum)}.</p>
    </section>

    ${renderFaq(faq)}

    <section class="doc-section">
      <h2>Verder</h2>
      <nav class="doc-links">
        <a class="doc-link" href="/veiligste-gemeenten">Veiligste gemeenten</a>
        <a class="doc-link" href="/gezondste-gemeenten">Gezondste gemeenten</a>
        <a class="doc-link" href="/methode">Methode</a>
      </nav>
    </section>
  </main>

${footer()}

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

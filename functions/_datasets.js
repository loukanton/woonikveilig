// Dataset registry + page template for /dataset/:slug.
// Underscore prefix: not a route, only an import for functions.
// One page per open-data source: what it contains, refresh cadence, how we
// use it, limitations and where to get it. Feeds EEAT and makes every number
// on the site traceable to its source.
import { CANONICAL_ORIGIN, escapeHtml } from './_cities.js';

// Keep wording in sync with the drempels in app.js and /methode.
export const DATASETS = [
  {
    slug: 'rivm-nsl-lucht',
    name: 'RIVM/NSL luchtkwaliteitskaart',
    owner: 'RIVM',
    contains: 'Jaargemiddelde concentraties stikstofdioxide (NO₂) en fijnstof (PM2,5) voor heel Nederland, als landsdekkende kaart. Huidige kaart: verslagjaar 2024.',
    refresh: 'Jaarlijks verschijnt een nieuwe kaart over het voorgaande jaar.',
    usage: 'De basis van de luchtscore. De jaargemiddelden op het middelpunt van de postcode worden afgemeten aan de WHO-advieswaarden van 2021 (10 µg/m³ NO₂, 5 µg/m³ PM2,5).',
    limits: 'Een modelkaart, geen meting op het adres zelf. Lokale stoffen zoals ultrafijnstof en neergedaald stof zitten er niet in; rond zware industrie kan de werkelijke belasting hoger zijn.',
    access: 'Open geodata van het RIVM (WMS), laag rivm_nsl_20260401_gm_NO22024 en _PM252024.',
    url: 'https://data.rivm.nl/geo/',
  },
  {
    slug: 'rivm-geluid',
    name: 'RIVM geluidskaarten (Lden)',
    owner: 'RIVM',
    contains: 'Jaargemiddelde geluidsbelasting (Lden) per bron: wegverkeer, treinverkeer en vliegverkeer (2020), industrie (actueel) en windturbines (2021).',
    refresh: 'Om de paar jaar, in de cyclus van de Europese geluidskartering.',
    usage: 'De bronnen worden energetisch opgeteld tot de geluidscore; de luidste verkeersbron vormt daarnaast de verkeersscore. De RIVM-totaalkaart wordt bewust niet gebruikt, omdat daar verouderd industriegeluid uit 2008 in meetelt.',
    limits: 'Modelberekeningen op jaargemiddelde basis: incidentele pieken (een nachtvlucht, een evenement) zijn niet zichtbaar.',
    access: 'Open geodata van het RIVM (WMS), lagen per geluidbron.',
    url: 'https://data.rivm.nl/geo/',
  },
  {
    slug: 'cbs-criminaliteit',
    name: 'Geregistreerde misdrijven per buurt (politie)',
    owner: 'Politie, via CBS',
    contains: 'Het aantal geregistreerde misdrijven per buurt per maand, naar soort misdrijf (tabel 47022NED).',
    refresh: 'Maandelijks.',
    usage: 'De veiligheidsscore: het totaal van de laatste 12 maanden, omgerekend naar misdrijven per 1.000 inwoners van de buurt.',
    limits: 'Registraties, geen werkelijkheid: niet elk misdrijf wordt aangegeven. Cijfers gelden voor de pleeglocatie, waardoor winkel- en uitgaansgebieden hoog scoren. In kleine buurten schommelen de cijfers sterk.',
    access: 'Open data via de CBS OData-API (dataderden), tabel 47022NED.',
    url: 'https://dataderden.cbs.nl/ODataApi/odata/47022NED',
  },
  {
    slug: 'rivm-gezondheidsmonitor',
    name: 'RIVM Gezondheidsmonitor per buurt',
    owner: 'RIVM, GGD’en en CBS',
    contains: 'Ervaren gezondheid en langdurige aandoeningen per buurt, als modelschatting voor inwoners van 18 jaar en ouder (tabel 50150NED, editie 2024).',
    refresh: 'Vierjaarlijks.',
    usage: 'De gezondheidscore: het aandeel inwoners dat de eigen gezondheid als goed ervaart (55% is een 1, 85% een 10).',
    limits: 'Modelschattingen op basis van een grote steekproef plus buurtkenmerken, geen enquête per buurt.',
    access: 'Open data via de CBS OData-API (dataderden), tabel 50150NED.',
    url: 'https://dataderden.cbs.nl/ODataApi/odata/50150NED',
  },
  {
    slug: 'cbs-wijken-buurten',
    name: 'CBS Wijken en Buurten',
    owner: 'CBS, via PDOK',
    contains: 'De officiële buurt- en wijkindeling van Nederland met namen, codes en inwoneraantallen (editie 2024).',
    refresh: 'Jaarlijks een nieuwe indeling.',
    usage: 'Bepaalt in welke buurt een postcode ligt en levert het inwonertal waarmee misdrijven per 1.000 inwoners worden berekend.',
    limits: 'De indeling wijzigt jaarlijks; cijfers uit verschillende jaren kunnen daardoor over net verschillende buurtgrenzen gaan.',
    access: 'Open geodata via PDOK (WFS), CBS Wijken en Buurten 2024.',
    url: 'https://service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0',
  },
  {
    slug: 'cbs-sterfte',
    name: 'CBS kerncijfers: sterfte per gemeente',
    owner: 'CBS',
    contains: 'Sterfte per 1.000 inwoners per gemeente (tabel 70072ned).',
    refresh: 'Jaarlijks.',
    usage: 'Wordt ter informatie getoond bij het onderdeel gezondheid, maar telt niet mee in de score: absolute sterfte hangt vooral samen met de leeftijdsopbouw van een gemeente.',
    limits: 'Gemeenteniveau, niet buurtniveau.',
    access: 'Open data via de CBS OData-API, tabel 70072ned.',
    url: 'https://opendata.cbs.nl/ODataApi/odata/70072ned',
  },
  {
    slug: 'cbs-doodsoorzaken',
    name: 'CBS doodsoorzaken per gemeente',
    owner: 'CBS',
    contains: 'Het aandeel kanker en ademhalingsziekten in de sterfgevallen per gemeente (tabel 80142ned), met heel Nederland als referentie.',
    refresh: 'Jaarlijks.',
    usage: 'Correctie op de gezondheidscore: ligt het aandeel kanker of ademhalingsziekten meer dan 3 procentpunt boven het landelijke aandeel, dan gaat er per signaal één punt af.',
    limits: 'Gemeenteniveau; zegt niets over een individuele straat of oorzaak.',
    access: 'Open data via de CBS OData-API, tabel 80142ned.',
    url: 'https://opendata.cbs.nl/ODataApi/odata/80142ned',
  },
  {
    slug: 'rivm-overstroming',
    name: 'Overstromingskans (RIVM/LIWO)',
    owner: 'RIVM',
    contains: 'De kans op overstroming per locatie, in vijf klassen: van "overstroomt niet" tot eens per 10 jaar (kaart december 2023).',
    refresh: 'Periodiek, bij nieuwe landelijke doorrekeningen.',
    usage: 'Onderdeel van de omgevingsscore: klasse 1 is een 10, klasse 5 een 1,5.',
    limits: 'Kansen, geen voorspelling; lokale maatregelen na de peildatum zitten er niet in.',
    access: 'Open geodata van het RIVM (WMS), laag 20231201_kans_overstroming.',
    url: 'https://data.rivm.nl/geo/',
  },
  {
    slug: 'rivm-externe-veiligheid',
    name: 'Risicokaart: gevaarlijke stoffen',
    owner: 'RIVM / Risicokaart',
    contains: 'De plaatsgebonden risicocontouren 10⁻⁶ rond bedrijven en transportroutes met gevaarlijke stoffen (stand mei 2022).',
    refresh: 'Periodiek.',
    usage: 'Onderdeel van de omgevingsscore: binnen een contour een 2, binnen 250 meter een 6,5, ruim erbuiten een 9, geen contour binnen 1,2 km een 10.',
    limits: 'De contour beschrijft de kans op overlijden door een ongeval (1 op de miljoen per jaar), niet dagelijkse hinder of gezondheidseffecten.',
    access: 'Open geodata van het RIVM (WFS), lagen rev_10_6_inrichting en rev_10_6_transport.',
    url: 'https://data.rivm.nl/geo/alo/wfs',
  },
  {
    slug: 'rivm-hoogspanning',
    name: 'RIVM-netkaart: hoogspanningslijnen',
    owner: 'RIVM',
    contains: 'Alle bovengrondse hoogspanningslijnen met hun indicatieve magneetveldzone (de actuele versie van de netkaart).',
    refresh: 'Doorlopend actueel gehouden.',
    usage: 'Onderdeel van de omgevingsscore: binnen de magneetveldzone een 3,5, vlak daarbuiten een 6,5, ruim erbuiten een 8,5, geen lijn binnen 600 meter een 10.',
    limits: 'De magneetveldzone is een indicatieve rekenafstand, geen gemeten veldsterkte per woning.',
    access: 'Open geodata van het RIVM (WFS), laag netkaart_actuele_versie_atlas_rivm.',
    url: 'https://data.rivm.nl/geo/nl/wfs',
  },
  {
    slug: 'rivm-nucleair',
    name: 'Nucleaire installaties',
    owner: 'RIVM',
    contains: 'De locaties van nucleaire installaties in Nederland en net over de grens (peiling 2021).',
    refresh: 'Bij wijzigingen.',
    usage: 'Onderdeel van de omgevingsscore: binnen 50 km telt de afstand mee, met een ondergrens van 4.',
    limits: 'Alleen de locatie en afstand; zegt niets over het type installatie of het actuele risico.',
    access: 'Open geodata van het RIVM (WFS), laag nucleaire_installaties.',
    url: 'https://data.rivm.nl/geo/alo/wfs',
  },
  {
    slug: 'luchtmeetnet',
    name: 'Luchtmeetnet (actuele metingen)',
    owner: 'RIVM en GGD’en',
    contains: 'De actuele, gemeten luchtkwaliteit per meetstation: de luchtkwaliteitsindex (LKI), NO₂ en PM2,5, per uur.',
    refresh: 'Elk uur.',
    usage: 'Wordt als actuele waarde bij het rapport getoond, maar telt niet mee in de leefscore: die zou anders met het weer veranderen. Alleen als er geen jaargemiddelde beschikbaar is, valt de luchtscore hierop terug.',
    limits: 'Het dichtstbijzijnde meetstation kan kilometers verderop staan; de waarde is dan een benadering.',
    access: 'Open API van Luchtmeetnet.',
    url: 'https://api.luchtmeetnet.nl/open_api/',
  },
  {
    slug: 'pdok-locatieserver',
    name: 'PDOK Locatieserver',
    owner: 'Kadaster',
    contains: 'Adressen, postcodes en woonplaatsen van heel Nederland (uit de Basisregistratie Adressen en Gebouwen), met coördinaten.',
    refresh: 'Doorlopend actueel.',
    usage: 'Vertaalt de ingevoerde postcode of het adres naar een punt op de kaart; alle andere bronnen worden op dat punt bevraagd.',
    limits: 'Het rapport rekent op het middelpunt van de postcode; een paar straten verderop kan het beeld anders zijn.',
    access: 'Open API van PDOK.',
    url: 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free',
  },
  {
    slug: 'militaire-complexen',
    name: 'Militaire complexen (eigen lijst)',
    owner: 'Eigen redactie',
    contains: 'Een vaste lijst van publiek bekende militaire locaties: vliegbases, marinehavens, hoofdkwartieren en radarposten.',
    refresh: 'Bij gelegenheid, als de publieke informatie wijzigt.',
    usage: 'Onderdeel van de omgevingsscore: binnen 25 km telt de afstand licht mee, met een ondergrens van 5.',
    limits: 'Geen officiële bron: er bestaat geen open risicokaart voor militaire objecten. De lijst is indicatief en bevat alleen publiek bekende locaties.',
    access: 'Onderhouden in de broncode van deze site.',
    url: null,
  },
];

export function datasetBySlug(slug) {
  return DATASETS.find((d) => d.slug === slug) || null;
}

// Full HTML for one dataset page. Same look as the rest of the site.
export function renderDatasetPage(ds) {
  const name = escapeHtml(ds.name);
  const canonical = `${CANONICAL_ORIGIN}/dataset/${ds.slug}`;
  const title = `Dataset: ${name}`;
  const description = `Hoe Woon ik veilig? de bron "${ds.name}" gebruikt: wat de data bevat, hoe vaak die ververst wordt en wat de beperkingen zijn.`;

  const others = DATASETS.filter((d) => d.slug !== ds.slug)
    .map((d) => `<a class="doc-link" href="/dataset/${d.slug}">${escapeHtml(d.name)}</a>`)
    .join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: ds.name,
    description: ds.contains,
    creator: { '@type': 'Organization', name: ds.owner },
    ...(ds.url ? { url: ds.url } : {}),
    isAccessibleForFree: true,
    inLanguage: 'nl',
  };

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Woon ik veilig?</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="nl_NL">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${CANONICAL_ORIGIN}/og-image.png">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <div class="site-topbar">
    <a class="site-logo" href="/" aria-label="Woon ik veilig? — naar de homepage">Woon ik <span class="logo-block">veilig?</span></a>
  </div>
  <header>
    <div class="hero">
      <p class="eyebrow"><span class="brand-sq" aria-hidden="true"></span> <a href="/bronnen" style="color:inherit;text-decoration:none;">Databronnen</a></p>
      <h1 class="doc-h1">${name}</h1>
      <p class="tagline">Beheerd door ${escapeHtml(ds.owner)}. Een van de open databronnen achter de leefscore van Woon ik veilig?</p>
    </div>
  </header>

  <main>
    <section class="doc-section">
      <h2>Wat deze bron bevat</h2>
      <p>${escapeHtml(ds.contains)}</p>
    </section>

    <section class="doc-section">
      <h2>Hoe vaak de data ververst</h2>
      <p>${escapeHtml(ds.refresh)} De cijfers worden bij elke buurtcheck live bij de bron opgehaald; deze site slaat niets op.</p>
    </section>

    <section class="doc-section">
      <h2>Hoe wij deze data gebruiken</h2>
      <p>${escapeHtml(ds.usage)} De volledige berekening staat op de <a href="/methode">methodepagina</a>.</p>
    </section>

    <section class="doc-section">
      <h2>Beperkingen</h2>
      <p>${escapeHtml(ds.limits)}</p>
    </section>

    <section class="doc-section">
      <h2>Bron en toegang</h2>
      <p>${escapeHtml(ds.access)}${ds.url ? ` Endpoint: <a href="${escapeHtml(ds.url)}" target="_blank" rel="noopener">${escapeHtml(ds.url)}</a>` : ''}</p>
    </section>

    <section class="doc-section">
      <h2>Andere databronnen</h2>
      <nav class="doc-links" aria-label="Andere databronnen">${others}</nav>
    </section>
  </main>

  <footer class="site-footer">
    <a class="masthead footer-mark" href="https://brighthouse.consulting/" target="_blank" rel="noopener" aria-label="BrightHouse Consulting">Bright<span class="mh-house">House</span><span class="mh-dot"></span></a>
    <p>Een initiatief van <strong>BrightHouse Consulting</strong>. Vragen of een fout gezien? Mail <a href="mailto:media@brighthouse.consulting">media@brighthouse.consulting</a>.</p>
    <p>Geen cookies. Alle data komt live uit open bronnen; aan de leefscore kunnen geen rechten worden ontleend.</p>
    <nav class="footer-cities" aria-label="Over deze site">
      <span>Over deze site:</span>
      <a href="/methode">Methode</a><a href="/bronnen">Bronnen</a><a href="/over">Over</a><a href="/pers">Pers</a>
    </nav>
  </footer>

  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "fa781ea439e94009bce291b6c446d2cf"}'></script>
</body>
</html>`;
}

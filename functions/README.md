# Cloudflare Pages Functions

De statische site blijft build-vrij. Deze map voegt edge-functies toe die
alléén draaien op **Cloudflare Pages** (niet op GitHub Pages / kale hosting).
Config staat in `../wrangler.toml` (compat-flags + D1-binding).

## Dynamische deel-afbeelding (#1)

- `og.js` — route `/og`: rendert een 1200×630 PNG-kaartje met de leefscore en
  buurtnaam uit de query (`/og?s=5,0&n=Dam, Amsterdam`). Gebruikt `workers-og`,
  met de merk-fonts als TTF (satori leest geen woff2): Plus Jakarta Sans voor
  tekst, Archivo Black voor het scorecijfer. Faalt het renderen, dan valt hij
  terug op `/og-image.png`.
- `_middleware.js` — herschrijft op elke HTML-request de social-metatags
  (`og:image`, `og:title`, …) als de URL `?s=&n=` meedraagt, en wijst
  `og:image` naar `/og`. Zo ziet de crawler van WhatsApp/LinkedIn het juiste
  kaartje, terwijl de pagina zelf de score gewoon live doorrekent.

De client (`app.js`, functie `shareUrl()`) zet die `?s=&n=` in elke deel-URL.

## SEO-stadspagina's (#3)

- `_cities.js` — stadslijst + paginatemplate (geen route, alleen import).
- `in/[city].js` — route `/in/:stad`: indexeerbare landingspagina per stad,
  onbekende slug → redirect naar `/`.
- `sitemap.xml.js` — route `/sitemap.xml`: homepage + alle stadspagina's.
- `../robots.txt` verwijst naar de sitemap. De homepage-footer linkt naar de
  steden zodat Google ze ontdekt.

## Deel-funnel meten (#4)

- `track.js` — `POST /track`: legt een deel-event vast in D1 (kanaal, score,
  buurt). Tabel wordt bij de eerste write aangemaakt, geen aparte migratie.
- `stats.js` — `GET /stats`: JSON met totaal en aantal per kanaal. Bescherm in
  productie met env-var `STATS_KEY` en roep `/stats?key=...` aan.
- De client (`app.js`, functie `track()`) stuurt bij elk deelkanaal een
  `sendBeacon` naar `/track`.

**Vereist een D1-database.** Maak 'm eenmalig aan en zet het id in
`../wrangler.toml`:

```sh
npx wrangler d1 create woonikveilig   # plak het database_id in wrangler.toml
```

Lokaal maakt `wrangler pages dev` vanzelf een sqlite-bestand aan. Na het
toevoegen van de binding moet je `wrangler pages dev` opnieuw starten.

## Lokaal testen

```sh
npm install
npx wrangler pages dev .   # leest wrangler.toml (compat-flags + D1)
```

- Kaartje direct: open `http://localhost:8788/og?s=5,0&n=Dam, Amsterdam`
- Metatags: `curl "http://localhost:8788/?pc=1012JS&s=5,0&n=Dam,%20Amsterdam" | grep og:image`
- Stadspagina: open `http://localhost:8788/in/amsterdam`; sitemap: `/sitemap.xml`
- Tracking: `curl -X POST localhost:8788/track -d '{"channel":"whatsapp"}'`
  daarna `curl localhost:8788/stats`
- Echte preview: deploy en plak de deel-URL in <https://www.opengraph.xyz> of
  stuur hem naar jezelf op WhatsApp.

## Deployen — twee valkuilen

1. **De npm-dependency moet gebundeld worden.** Dat gebeurt automatisch bij
   `wrangler pages deploy .` of via de Git-integratie van Cloudflare Pages.
   Sleep je de map handmatig in het dashboard, dan wordt `workers-og` níét
   meegenomen en werkt `/og` niet.
2. **Fonts.** Het kaartje gebruikt de merk-fonts als TTF in `/fonts`
   (`PlusJakartaSans-Bold.ttf`, `ArchivoBlack-Regular.ttf`). satori leest geen
   woff2, dus de site-woff2's kunnen hier niet hergebruikt worden.

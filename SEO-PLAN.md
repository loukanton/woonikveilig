# Programmatic SEO-architectuur

Ontwerp voor het opschalen van de 24 stadspagina's naar een volledig, data-gedreven
paginanetwerk (provincies, gemeenten, plaatsen, buurten), plus de bijbehorende
EEAT-, dataset- en onderzoekspagina's. Dit document is het plan; implementatie
gebeurt in fases. Niet meedeployen (staat in `.assetsignore`).

## Uitgangspunten (volgen uit CLAUDE.md)

1. **Geen build-stap voor de site.** HTML wordt at request time gerenderd door
   Pages Functions, zoals `/in/:stad` nu al doet.
2. **Geen backend voor data, leefscore nooit server-side per request.** De
   functies rekenen niets uit; ze lezen een vooraf gemaakte snapshot.
3. **Eén canonieke URL per entiteit.** Nooit twee levende URL's voor hetzelfde
   ding; aliassen zijn 301's. Dit is de kern van duplicate-content-preventie.
4. **Geen dunne pagina's.** Een pagina zonder voldoende echte datapunten wordt
   niet gegenereerd (of krijgt `noindex`). Liever 400 goede pagina's dan 15.000
   doorway-pages; Google's "scaled content abuse"-beleid straft het tweede af.

## Architectuur in één alinea

Een offline **snapshot-script** (`tools/build-data.mjs`, draait lokaal, niet op
de server, geen onderdeel van de site) haalt de bulk-beschikbare open data op en
schrijft die als statische JSON naar `/data/`. Die JSON deployt mee als statisch
asset en is meteen de publieke API v0. **Pages Functions** per route lezen de
JSON via `env.ASSETS.fetch()`, vullen een template met blokken (samenvatting,
kerncijfers, vergelijking, trend, FAQ, bronnen) en genereren daaruit unieke
teksten met deterministische zinsvariatie. Edge-cache met `s-maxage` zoals nu.

## Entiteiten en URL-schema

| Entiteit | Aantal | URL (canoniek) | Fase |
|---|---|---|---|
| Provincie | 12 | `/provincie/noord-brabant` | 2 |
| Gemeente | ~342 | `/gemeente/vught` | 2 |
| Buurtenindex | ~342 | `/gemeente/vught/buurten` | 3 |
| Plaats (woonplaats) | ~2.475 | `/in/vught` (bestaand patroon) | 2 |
| Buurt | ~14.500 | `/in/vught/centrum` | 3 |
| Postcode | 470k (PC6) | géén eigen pagina; de check blijft `/?pc=…` | n.v.t. |

- Kale slugs (`/vught`) worden 301 naar `/in/vught`. Voorkomt duplicaten en
  houdt de root vrij voor toekomstige routes.
- Postcodepagina's bewust niet: 470.000 vrijwel identieke pagina's is precies
  het thin-content-patroon dat een domein de das omdoet. De buurtpagina is de
  landingspagina voor "criminaliteit 5263AB"-achtige zoekopdrachten; eventueel
  later PC4-pagina's (~4.070) met canonical naar de buurt.
- Slugs komen uit het snapshot-script en liggen daarna vast (nooit hernoemen;
  bij CBS-herindeling een redirect). Niet-unieke plaatsnamen (Hengelo, Bergen)
  krijgen een suffix: `/in/bergen-nh`, `/in/bergen-l`.
- CBS-codes (GM/WK/BU) zijn de stabiele interne sleutels; slugs zijn presentatie.

## Data-laag: de snapshot

`tools/build-data.mjs` (Node, alleen lokaal draaien, uitgesloten van deploy):

**Fase 1, bulk via OData/WFS (uren werk, geen kaart-prikjes):**
- CBS wijken/buurten WFS: alle codes, namen, inwoners, oppervlakte, dichtheid.
- Politie 47022NED: misdrijven per buurt, laatste 5 jaar (voor trends).
- RIVM 50150NED: ervaren gezondheid en langdurige aandoeningen per buurt.
- CBS 70072ned / 80142ned: sterfte en doodsoorzaken per gemeente.
- Aggregaties: per gemeente, provincie en NL als referentiewaarden.

**Fase 4, beslispunt:** milieu-deelscores (lucht, geluid, risico) per
buurtmiddelpunt via dezelfde WMS-prikjes als de ranglijst, maar dan offline in
het script, gespreid over dagen. Let op: dit is de leefscore vooraf berekenen.
Dat gebeurt níet per request en de live check blijft client-side, maar het is
een afwijking van de geest van de regel; expliciet met Louk beslissen.

**Bestandsindeling** (Pages heeft een limiet van 20.000 bestanden per deploy,
dus géén bestand per buurt):
- `/data/index.json` — alle entiteiten: code, slug, naam, type, ouder (voor
  routing, sitemaps en interne links)
- `/data/nl.json`, `/data/provincie/<code>.json` — referentiewaarden
- `/data/gemeente/GM0865.json` — de gemeente mét al haar wijken en buurten
  (één bestand per gemeente, ~342 stuks; een buurtpagina leest het
  gemeentebestand en pakt haar buurt eruit)
- Elk bestand: `schemaVersion`, `peildatum`, per veld de bron en het
  verslagjaar. Ontbrekende data is `null` en wordt "geen data" op de pagina,
  nooit een neutrale invulling.

Verversing: handmatig per kwartaal draaien (misdaadcijfers zijn maandelijks,
de rest jaarlijks), diff committen, deployen. `lastmod` in de sitemap volgt de
peildatum.

**Dit is meteen de open API (idee 31).** `/data/gemeente/GM0865.json` is
publiek, gecachet, geversioneerd en gedocumenteerd op de datasetpagina's. Geen
aparte API-infrastructuur bouwen; als er ooit makelaars aankloppen is dit v0.

## Paginatemplate: blokken

Elke programmatic pagina bestaat uit dezelfde blokken, gevuld per entiteit.
Nieuwe modules (idee 36: WOZ, energielabels, scholen, …) zijn later een nieuw
veld in de snapshot plus een nieuw blok in de registry; bestaande pagina's
hoeven daar niet voor op de schop.

1. **AI-overview / samenvatting** (idee 33, 22): 2 à 3 feitelijke zinnen
   bovenaan, regelgebaseerd uit de data. "Vught telt 38 misdrijven per 1.000
   inwoners per jaar, minder dan het landelijk gemiddelde van 44. De ervaren
   gezondheid ligt boven het gemiddelde van Noord-Brabant." Kort, citeerbaar,
   geen mening.
2. **Kerncijfers**: tabel met `tabular-nums`, elk cijfer met verslagjaar.
3. **Vergelijking** (idee 28): als blok op élke pagina (buurt vs gemeente vs
   provincie vs NL), niet als aparte vs-pagina's. 342 gemeenten paarsgewijs is
   58.000 dunne pagina's; niet doen. Hooguit later een curated setje
   (Amsterdam vs Rotterdam-achtige paren met echt zoekvolume).
4. **Trend** (idee 29): misdrijven laatste 5 jaar als inline SVG-grafiekje,
   server-side gerenderd, dus indexeerbaar en zonder JS zichtbaar.
5. **FAQ** (idee 21): 4 à 6 vragen, antwoorden uit de data van déze entiteit
   ("Hoe veilig is Vught?", "Hoe wordt de leefscore berekend?"), met
   FAQPage-schema.
6. **Begrippen/definities** (idee 22): korte uitleg van Lden, PM2,5, LKI e.d.
   met links naar de datasetpagina's.
7. **Bronnen en peildatum** (idee 22): welke bronnen, welk verslagjaar,
   wanneer laatst ververst.
8. **Interne links**: broodkruimel (provincie → gemeente → plaats → buurt),
   kinderen (buurten van de gemeente), buren (aangrenzende/naburige buurten
   uit de index), en een top-5-lijstje op ouderpagina's ("veiligste buurten
   in Vught"). Plus altijd de postcode-check als CTA.

**Unieke teksten zonder duplicate content:**
- De cijfers, namen en vergelijkingen zelf zijn per pagina uniek; dat is 80%
  van het werk.
- Voor lopende zinnen: per tekstslot 4 à 6 zinspatronen, gekozen op een hash
  van de entiteitscode. Deterministisch, dus stabiel tussen deploys (geen
  `Math.random`), en patroonkeuze bovendien gestuurd door de data zelf
  (boven/onder gemiddelde kiest een ander patroon).
- Kwaliteitsdrempel: minder dan 3 gevulde pijlers → pagina niet in de sitemap
  en `noindex`. Buurten onder ~200 inwoners (CBS onderdrukt daar toch veel
  cijfers) sowieso overslaan.

**Structured data:** `Place` (met `geo` en `containedInPlace`),
`BreadcrumbList`, `FAQPage`, `Organization` (site-breed), `Dataset` op de
datasetpagina's. Alles als JSON-LD in de template.

## Statische vertrouwens-pagina's (ideeën 22, 23, 26, 30)

Gewone statische HTML, geen functies nodig, hoogste prioriteit omdat al het
andere erop leunt:

- `/methode` — hoe de leefscore werkt: weging, drempels, WHO-advieswaarden,
  wat bewust níet meetelt (live LKI), beperkingen. Grotendeels vertalen uit
  wat al in `app.js` en de UI staat.
- `/over` — wie (Louk / BrightHouse Consulting), missie, contact.
- `/bronnen` — overzicht, linkt naar de datasetpagina's.
- `/dataset/<bron>` — per bron (rivm-geluid, cbs-criminaliteit, luchtmeetnet,
  …, ~14 stuks): wat erin zit, verversingsfrequentie, hoe wij het gebruiken,
  beperkingen, bronvermelding, link naar de ruwe bron én naar onze JSON.
- `/pers` — logo, schermafbeeldingen, uitleg, contact; later de onderzoeken.
- `/changelog` — bestaat feitelijk al als git-historie; als pagina bijhouden
  zodra er iets te melden valt (per kwartaal-verversing een regel).
- Footer van élke pagina: afzender + contact (staat er al) + links naar
  methode en bronnen.

## Ranglijsten en onderzoeken (ideeën 25, 34, 27)

Géén vrije data-explorer met indexeerbare filtercombinaties: dat exploderen
naar duizenden near-duplicates. In plaats daarvan een beperkte, waardevolle
set ranglijstpagina's uit de snapshot:

- `/veiligste-gemeenten`, `/veiligste-buurten/vught` (per gemeente),
  per thema dat bulk beschikbaar is (veiligheid, gezondheid; later meer).
- Jaarlijkse onderzoekspagina's zijn dezelfde machinerie met een jaartal:
  `/onderzoek/veiligste-buurten-2026`. Blijven staan als archief, nieuwe
  editie linkt naar de vorige. Dit is het linkbait-kanaal voor de perspagina.
- Zoekclusters (idee 27): de programmatic pagina's dekken de longtail
  ("criminaliteit vught", "luchtkwaliteit 5263"); de clusterhoofden
  ("hoe veilig is mijn buurt", "geluidsoverlast woning") worden een handvol
  handgeschreven uitlegpagina's (`/uitleg/<onderwerp>`) die naar de
  programmatic lagen linken. Handwerk, gaandeweg schrijven.

## Sitemaps en routing

- `/sitemap.xml` wordt een sitemap-index → `/sitemaps/gemeenten.xml`,
  `/sitemaps/plaatsen.xml`, `/sitemaps/buurten-<n>.xml` (max 50k per bestand,
  buurten passen in één, maar sharden per provincie houdt ze klein).
  `lastmod` = peildatum van de snapshot. Gegenereerd door een functie die
  `/data/index.json` leest.
- `_routes.json` uitbreiden met `/provincie/*`, `/gemeente/*`, `/sitemaps/*`,
  `/veiligste-*`, `/onderzoek/*`. `/data/*` en de statische pagina's blijven
  op het gratis asset-pad.
- Bestaande 24 `/in/:stad`-pagina's worden fase 2 dezelfde template met echte
  data; URL's blijven identiek, dus geen redirects nodig. `_cities.js`
  verdwijnt in de snapshot-index.

## Wat bewust niet (of anders)

- **PDF-rapporten (32):** geen server-side PDF-generatie. Print-CSS op het
  rapport plus een "Bewaar als PDF"-knop (`window.print()`). Nul infra,
  zelfde resultaat. De share-URL met QR kan in de printvoet.
- **Indexeerbare kaarten (24):** de kaart is een canvas en dat blijft zo. De
  programmatic pagina ís de indexeerbare weergave van de kaartdata; de kaart
  krijgt een `figcaption` met samenvatting en alt-tekst. Geen aparte
  kaart-permalinks.
- **Monitoring-dashboard (35):** niet zelf bouwen. Google Search Console +
  Bing Webmaster Tools doen indexatie, CWV en structured-data-fouten al.
  Eventueel later `tools/check-site.mjs`: steekproef uit de sitemap fetchen
  en status/canonical/JSON-LD valideren, uitkomst in de terminal.
- **Open API (31):** geen apart API-platform; `/data/*.json` is de API.
- **Vergelijkingspagina's als eigen URL's (28):** blok op elke pagina, geen
  combinatorische paginaset.

## Fasering

| Fase | Wat | Omvang |
|---|---|---|
| 0 | EEAT: `/methode`, `/over`, `/bronnen`, `/dataset/*`, `/pers`; footerlinks; sitemap erbij | dagen, statische HTML |
| 1 | Snapshot-script + `/data/` (bulk: buurten, misdrijven, gezondheid, referenties) | het echte fundament |
| 2 | Gemeente- (342) en provinciepagina's (12); bestaande 24 stadspagina's op echte data; sitemap-index | eerste schaalstap |
| 3 | Plaats- (~2.5k) en buurtpagina's (waar data de drempel haalt); FAQ; trends | de longtail |
| 4 | Ranglijsten + eerste jaarlijkse onderzoek; beslispunt milieu-prikjes offline | linkbait |

Elke fase is apart deploybaar en waardevol; na fase 2 staat de architectuur en
is de rest vooral data en templates.

## Risico's

- **Kwaliteitsdrempel is heilig.** 14.500 buurtpagina's met alleen een
  misdaadcijfer oogt als spam; daarom gemeenten eerst en buurten pas wanneer
  ze genoeg gevulde blokken hebben.
- **CBS-herindelingen:** buurtcodes wijzigen jaarlijks. Snapshot pint één
  CBS-jaar; bij de jaarupgrade redirects voor gewijzigde slugs.
- **Deploy-limieten:** max 20.000 bestanden per Pages-deploy; daarom één JSON
  per gemeente in plaats van per buurt. Wrangler uploadt alleen gewijzigde
  bestanden, dus kwartaalverversing blijft snel.
- **Functions-verbruik:** gratis tier is 100k requests/dag; met
  `s-maxage=86400` op alle programmatic pagina's raakt vrijwel alles de
  edge-cache en blijft dit ruim binnen de marge.

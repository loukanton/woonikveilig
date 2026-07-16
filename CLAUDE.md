# Woon ik veilig?

(voorheen "Buurtgeluid" en "Woonikveilig"; de map heet nog `Buurt`)

## Wat is dit project

Open data van RIVM, CBS en gemeentes over geluid, luchtkwaliteit en verkeer per postcode, vertaald naar één simpele **"leefscore"** voor huizenkopers. Funda toont dit niet — dit vult dat gat. Pure datavisualisatie, geen backend.

Doelgroep: huizenkopers die een postcode intypen en in één oogopslag willen zien hoe leefbaar de omgeving is.

## Wie werkt eraan

- **Louk** (loukanton@gmail.com) — solo project. Communicatie in het Nederlands.
- Afzender op de site: **BrightHouse Consulting** (Louks eigen merk), contact via `media@brighthouse.consulting`.

## Technische keuzes

- **Vanilla HTML/JS/CSS, geen build-stap.** Eén statische site, direct te hosten (GitHub Pages/Netlify). Bewuste keuze: geen framework, geen npm, geen bundler.
- **Geen backend.** Alle data komt client-side uit open API's. Als een databron geen CORS ondersteunt, zoeken we een alternatieve bron — we bouwen géén proxy-server.
- Moderne browser-features (fetch, ES modules) zijn prima; geen ondersteuning voor oude browsers nodig.

## Databronnen

| Bron | Wat | Endpoint |
|---|---|---|
| PDOK Locatieserver | postcode → coördinaten/buurt | `api.pdok.nl/bzk/locatieserver/search/v3_1/free` |
| Luchtmeetnet | live luchtkwaliteit (LKI, NO₂, PM2.5) | `api.luchtmeetnet.nl/open_api/` |
| RIVM geodata | geluidskaarten (Lden wegverkeer e.a.) | `data.rivm.nl/geo/` (WMS) |
| RIVM NSL | jaargemiddelde NO₂ en PM2,5 (lagen `rivm_nsl_20260401_gm_NO22024`/`_PM252024`) | zelfde WMS als geluid |
| PDOK BRT | achtergrondkaart-tegels (grijs) voor het kaartje | `service.pdok.nl/brt/achtergrondkaart/wmts/` |
| CBS wijken/buurten | buurtcode, buurtnaam, inwoners op een punt (RD, via bbox; `cql_filter` werkt daar niet) | `service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0` |
| Politie via CBS | geregistreerde misdrijven per buurt per maand (tabel 47022NED, SoortMisdrijf `'0.0.0 '` = totaal) | `dataderden.cbs.nl/ODataApi/odata/47022NED` |
| RIVM overstroming | overstromingskans in klassen 1 t/m 5 (laag `20231201_kans_overstroming`) | zelfde WMS als geluid |
| RIVM nucleair | nucleaire installaties (ook buitenland) als WFS-punten in RD | `data.rivm.nl/geo/alo/wfs` |
| RIVM hoogspanning | bovengrondse hoogspanningslijnen + magneetveldzone (rekenafstand), als WFS-lijnen in RD (laag `nl:netkaart_actuele_versie_atlas_rivm`; ander geo-pad dan alo) | `data.rivm.nl/geo/nl/wfs` |
| RIVM externe veiligheid | plaatsgebonden risicocontour 10⁻⁶ rond gevaarlijke stoffen (Risicokaart), WFS-polygonen in RD; punt-in-polygoon test. Lagen `alo:rev_10_6_inrichting_30052022` en `alo:rev_10_6_transport_30052022`; server weigert meerdere typeNames tegelijk, dus per laag apart | `data.rivm.nl/geo/alo/wfs` |
| RIVM Gezondheidsmonitor | ervaren gezondheid, langdurige aandoening per buurt (tabel 50150NED, Leeftijd `'20300'`, Marges `'MW00000'`) | `dataderden.cbs.nl/ODataApi/odata/50150NED` |
| CBS kerncijfers | sterfte per 1.000 inwoners per gemeente (tabel 70072ned) | `opendata.cbs.nl/ODataApi/odata/70072ned` |
| CBS doodsoorzaken | kanker/ademhaling in sterfgevallen per gemeente, NL-referentie is RegioS `'NL01  '` (tabel 80142ned; let op: 80202ned heeft maar 25 gemeenten) | `opendata.cbs.nl/ODataApi/odata/80142ned` |
| Militaire complexen | vaste lijst publiek bekende locaties (vliegbases, marine, NAVO, radar) hardcoded in `app.js` | geen API |

Check bij nieuwe bronnen altijd eerst of CORS werkt (`Access-Control-Allow-Origin`) voordat je erop bouwt.

## De leefscore

Eén score van 1–10, opgebouwd uit deelscores (lucht, geluid, verkeer, veiligheid, gezondheid, omgevingsrisico). Regels:

- Deelscores altijd tonen naast de totaalscore — transparantie boven een magisch getal.
- Ontbrekende data eerlijk tonen ("geen data") en niet meewegen, nooit stilzwijgend een neutrale waarde invullen.
- Weging en drempels staan op één plek in de code, met bronvermelding (bijv. WHO-advieswaarden).
- De score is stabiel: actuele metingen (zoals de LKI van dit uur) tellen niet mee, alleen jaargemiddelden en periodieke cijfers. Live waardes tonen mag, maar als info naast de score.
- De buurtenranglijst toont echte leefscores: voorselectie van ~24 kandidaten op veiligheid en gezondheid (de enige bulk-beschikbare onderdelen), daarna elke kandidaat volledig doorgerekend op het buurtmiddelpunt (batches van 3, ~200 kaart-prikjes). Methode staat in de UI en bronvermelding.

## Structuur

- `index.html` — de pagina
- `app.js` — datalogica en rendering (ES module)
- `style.css` — styling
- `fonts/` — lokale woff2-bestanden (Archivo Black, Plus Jakarta Sans)
- Geen mappenstructuur tot het project daar echt om vraagt.

## Design

- Stijl: **BrightHouse-look** — koel wit (#f5f7fa), diep navy als tekstkleur (#16243d), helder blauw accent (#1a56db), witte panelen met koele lijnen (#dde3ec), bescheiden afronding (10px). Licht, strak, vertrouwenwekkend. Geen gradients, schaduwzweem, glow of ander generiek "AI-app"-design. (Eerdere iteraties: licht "AI-design" → papieren rapport met serif → sans → donker met signaalgeel → groene veldkaart; Louk vond ze achtereenvolgens te generiek, de serif niks, saai, het zwarte niet mooi, en koos daarna voor branding op zijn eigen BrightHouse Consulting.)
- Typografie zoals brighthouse.consulting: **Archivo Black** voor koppen en grote getallen (uppercase, weight 400) en **Plus Jakarta Sans** voor al het andere; labels in Plus Jakarta 800 uppercase met brede letter-spacing, géén monospace (de brandsite gebruikt die nergens). Lokale woff2-bestanden in `fonts/`, favicon `favicon.svg` overgenomen van de brandsite; geen CDN, werkt op `file://`.
- Scorekleuren zijn de drie merk-tiers uit de AI-scan: groen `#0a8a4a` (7+), amber `#e08a00` (5 tot 7), rood `#d64545` (onder 5). `scoreColor` rondt af op één decimaal zodat de kleur nooit een getoond getal tegenspreekt.
- Getallen in Nederlandse notatie (komma als decimaalteken), leefscore als rapportcijfer.
- Geen gedachtestreepjes (—) in UI-teksten; Louk wil die er niet in.
- Geen ES modules in de HTML: de site moet ook direct vanaf schijf (`file://`) werken.
- **Baseline UI-regels** (vertaald naar vanilla, de Tailwind/React-stackregels gelden hier niet): geen animatie tenzij gevraagd en dan alleen `transform`/`opacity` met `ease-out`; respecteer `prefers-reduced-motion`; skeletons voor laadtoestanden; `text-wrap: balance` op koppen, `text-wrap: pretty` op lopende tekst; `tabular-nums` voor datawaardes; zichtbare `:focus-visible`; fouten tonen naast de actie; één accentkleur per view; geen gradients of glow.

## Werkafspraken

- UI-teksten in het Nederlands, code (variabelen, functies, comments) in het Engels.
- Klein houden: geen dependencies toevoegen zonder overleg.
- Bij het afronden van een feature: even in de browser checken dat het echt werkt, niet alleen dat de code compileert.

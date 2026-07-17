// Woon ik veilig? — leefscore per postcode uit open data (PDOK, Luchtmeetnet, RIVM, CBS).
// Alles client-side; alle drie de bronnen sturen Access-Control-Allow-Origin: *.

const PDOK_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const PDOK_SUGGEST_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest';
const AIR_URL = 'https://api.luchtmeetnet.nl/open_api/concentrations';
const WMS_URL = 'https://data.rivm.nl/geo/alo/wms';
const WFS_URL = 'https://data.rivm.nl/geo/alo/wfs';
const BUURT_WFS = 'https://service.pdok.nl/cbs/wijkenbuurten/2024/wfs/v1_0';
const POLICE_URL = 'https://dataderden.cbs.nl/ODataApi/odata/47022NED';
const HEALTH_URL = 'https://dataderden.cbs.nl/ODataApi/odata/50150NED'; // RIVM Gezondheidsmonitor per buurt
const KERNCIJFERS_URL = 'https://opendata.cbs.nl/ODataApi/odata/70072ned'; // regionale kerncijfers (sterfte)
const CAUSES_URL = 'https://opendata.cbs.nl/ODataApi/odata/80142ned'; // doodsoorzaken per gemeente
const KERN_BUURT_URL = 'https://opendata.cbs.nl/ODataApi/odata/85984NED'; // kerncijfers wijken en buurten 2024

// RIVM/NSL-kaarten met jaargemiddelde concentraties (µg/m³)
const ANNUAL_NO2_LAYER = 'rivm_nsl_20260401_gm_NO22024';
const ANNUAL_PM25_LAYER = 'rivm_nsl_20260401_gm_PM252024';
const ANNUAL_AIR_YEAR = 2024;

const TILE_URL = 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857';
const MAP_ZOOM = 15;
const TILE_SIZE = 256;

// Let op: de RIVM-totaalkaart "allebronnen_2020" telt een industriekaart uit
// 2008 mee en kan daardoor fors afwijken van de actuele bronkaarten (gezien in
// Hilversum: 67 dB totaal door verdwenen industrie, terwijl actueel 0 zegt).
// Daarom rekenen we het totaal zelf energetisch op uit de bronkaarten; de
// totaalkaart gebruiken we alleen nog als visuele kaartlaag.
const NOISE_LAYERS = {
  total: 'rivm_20220601_Geluid_lden_allebronnen_2020', // alleen voor de kaartweergave
  road: 'rivm_20220601_Geluid_lden_wegverkeer_2020',
  rail: 'rivm_20220601_Geluid_lden_treinverkeer_2020',
  air: 'rivm_20220601_Geluid_lden_vliegverkeer_2020',
  industry: 'rivm_Geluid_lden_industrie_actueel',
  wind: 'rivm_20220601_Geluid_lden_windturbines_2021',
};

const FLOOD_LAYER = '20231201_kans_overstroming';
const NUCLEAR_LAYER = 'rivm_01092021_nucleaire_installaties';
const POWERLINE_WFS = 'https://data.rivm.nl/geo/nl/wfs'; // RIVM-netkaart hoogspanningslijnen
const POWERLINE_LAYER = 'nl:netkaart_actuele_versie_atlas_rivm';
// Plaatsgebonden risico 10^-6 contouren rond gevaarlijke stoffen (Risicokaart);
// inrichtingen (bedrijven, LPG, Brzo) en transportroutes
const RISK_LAYERS = ['alo:rev_10_6_inrichting_30052022', 'alo:rev_10_6_transport_30052022'];

// Klassen uit de legenda van de RIVM/LIWO-overstromingslaag
const FLOOD_CLASSES = {
  1: { label: 'overstroomt niet', score: 10 },
  2: { label: 'eens per 100.000 jaar', score: 9 },
  3: { label: 'eens per 1.000 jaar', score: 7 },
  4: { label: 'eens per 100 jaar', score: 4 },
  5: { label: 'eens per 10 jaar', score: 1.5 },
};

// Alle weging en drempels op één plek (zie CLAUDE.md).
const SCORING = {
  // Gewichten van de deelscores in de totaalscore. Verkeer weegt licht
  // omdat verkeersgeluid ook al in de geluidscore zit.
  weights: { lucht: 0.2, geluid: 0.2, verkeer: 0.1, veiligheid: 0.2, gezondheid: 0.15, omgeving: 0.15 },
  // Misdrijven per 1.000 inwoners per jaar; landelijk gemiddelde is ruwweg 45.
  crimeDivisor: 12,
  // WHO-advieswaarden (2021) voor jaargemiddelde concentraties, in µg/m³
  whoNo2: 10,
  whoPm25: 5,
  // Lden onder de kaartondergrens (GRAY_INDEX 0) behandelen we als "< 45 dB".
  // WHO-advies wegverkeer is 53 dB Lden; 45 dB geldt als stil, 70 dB als zeer
  // luid. We mappen 45→10 en 70→1, lineair.
  ldenQuiet: 45,
  ldenLoud: 70,
};

const $ = (sel, root = document) => root.querySelector(sel);
let lastResult = null; // { name, score } van het laatst getoonde rapport, voor de deelknop

// Affiliate-blok onder het rapport. Zet enabled op true en vul de url zodra
// er een affiliateprogramma is (bijv. bouwkundige keuring via Daisycon of
// TradeTracker). Zonder url blijft het blok verborgen. De reclame-melding
// eronder is wettelijk verplicht en blijft altijd staan.
const AFFILIATE = {
  enabled: true,
  url: 'https://rkn3.net/c/?si=14571&li=1723607&wi=423205&ws=rapport',
  title: 'Ongedierte in of rond het huis?',
  text: 'Ratten, muizen of ander ongedierte in de buurt? Een professionele bestrijder pakt het snel en gericht aan.',
  button: 'Ongediertebestrijding aanvragen',
};

// Privacyregel eerlijk houden: zonder affiliate plaatst de site niets. Zodra
// affiliate aanstaat gaat een klik op de advertentielink via Daisycon, dat
// een cookie zet om de klik toe te rekenen. Dat moeten we bezoekers melden.
if (AFFILIATE.enabled && AFFILIATE.url) {
  $('#privacy-note').textContent = 'De site plaatst zelf geen cookies en meet alleen anoniem bezoek via Cloudflare. '
    + 'Klik je op een advertentielink, dan gebruikt de adverteerder via Daisycon een cookie '
    + 'om die klik te registreren.';
}
const statusEl = $('#status');
const resultEl = $('#result');
const form = $('#search-form');
const input = $('#postcode-input');
const button = $('#search-button');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  lookup(input.value.trim());
});

// Adressuggesties tijdens het typen, via de native datalist (de browser
// regelt toetsenbord en filtering). Alleen postcode en adres, want alleen
// die kan de zoekfunctie daarna ook echt opzoeken.
let suggestTimer = null;
input.addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const q = input.value.trim();
  if (q.length < 3) return;
  suggestTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        q,
        rows: '7',
        fq: 'type:(postcode OR adres)',
        fl: 'weergavenaam',
      });
      const json = await fetchJson(`${PDOK_SUGGEST_URL}?${params}`);
      const list = $('#postcode-suggestions');
      list.innerHTML = '';
      for (const doc of json.response?.docs ?? []) {
        const option = document.createElement('option');
        option.value = doc.weergavenaam;
        list.append(option);
      }
    } catch (err) {
      console.warn('Suggesties mislukt:', err); // nice to have, geen blocker
    }
  }, 250);
});

for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.q;
    lookup(chip.dataset.q);
  });
}

initMapControls();

// ---------- Delen ----------
// De opgezochte postcode komt in de URL (?pc=1012JS), zodat een rapport
// deelbaar en herlaadbaar is. Op file:// mag de browser dat weigeren.

function updateShareUrl(place) {
  const param = place.postcode ? `pc=${encodeURIComponent(place.postcode)}`
    : place.buurtcode ? `buurt=${encodeURIComponent(place.buurtcode)}` : null;
  if (!param) return;
  try {
    history.replaceState(null, '', `${location.pathname}?${param}`);
  } catch (err) {
    console.warn('URL bijwerken lukt niet:', err);
  }
}

$('#share-button').addEventListener('click', async () => {
  if (!lastResult) return;
  const text = lastResult.score != null
    ? `Leefscore ${fmtNum(lastResult.score)} voor ${lastResult.name}`
    : `Het buurtrapport voor ${lastResult.name}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Woon ik veilig?', text, url: location.href });
    } else {
      await navigator.clipboard.writeText(`${text} ${location.href}`);
      flashButton($('#share-button'), 'Link gekopieerd');
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // delen geannuleerd
    // Zonder clipboard-toegang (bijv. file://) tonen we de tekst als prompt
    window.prompt('Kopieer deze link:', `${text} ${location.href}`);
  }
});

function flashButton(button, message) {
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = original; }, 2000);
}

// Gedeelde link geopend? Dan direct het rapport laden.
const initialParams = new URLSearchParams(location.search);
const sharedPostcode = initialParams.get('pc');
const sharedBuurt = initialParams.get('buurt');
if (sharedPostcode) {
  input.value = sharedPostcode;
  lookup(sharedPostcode);
} else if (sharedBuurt) {
  lookupBuurt(sharedBuurt);
}

async function lookup(query) {
  if (!query) return;
  await performLookup(() => geocode(query));
}

// Rapport voor een CBS-buurt, bijvoorbeeld aangeklikt in de ranglijst
async function lookupBuurt(code) {
  await performLookup(() => geocodeBuurt(code));
}

async function performLookup(geocodeFn) {
  button.disabled = true;
  resultEl.hidden = true;
  showStatus('Buurt opzoeken…');

  try {
    const place = await geocodeFn();
    showStatus(`Data ophalen voor ${place.name}…`);

    const [lki, annual, ldenWind, ldenRoad, ldenRail, ldenAir, flood, industry, nuclear, powerline, external, safety] =
      await Promise.all([
        fetchAirLatest('LKI', place.lon, place.lat),
        fetchAnnualAir(place.lon, place.lat),
        fetchLden(NOISE_LAYERS.wind, place.lon, place.lat),
        fetchLden(NOISE_LAYERS.road, place.lon, place.lat),
        fetchLden(NOISE_LAYERS.rail, place.lon, place.lat),
        fetchLden(NOISE_LAYERS.air, place.lon, place.lat),
        fetchFlood(place.lon, place.lat),
        fetchLden(NOISE_LAYERS.industry, place.lon, place.lat),
        fetchNearestNuclear(place.rd),
        fetchNearestPowerline(place.rd),
        fetchExternalSafety(place.rd),
        fetchBuurt(place.rd).then((buurt) => Promise.all([
          fetchCrime(buurt).then((crime) => ({ buurt, crime })),
          fetchGezondheid(buurt),
        ])),
      ]);
    const [safetyData, gezondheid] = safety;
    // Zelf opgeteld uit de actuele bronkaarten; zie de noot bij NOISE_LAYERS
    const ldenTotal = combineLden([ldenRoad, ldenRail, ldenAir, industry, ldenWind]);

    render(place, {
      lucht: { lki, annual },
      geluid: { lden: ldenTotal, industry, wind: ldenWind },
      verkeer: { road: ldenRoad, rail: ldenRail, air: ldenAir },
      veiligheid: safetyData,
      gezondheid,
      omgeving: { flood, nuclear, industry, military: nearestMilitary(place.lon, place.lat), powerline, external },
    });
    hideStatus();
  } catch (err) {
    console.error(err);
    showStatus(err.userMessage ?? 'Er ging iets mis bij het ophalen van de data. Probeer het later opnieuw.', true);
  } finally {
    button.disabled = false;
  }
}

// ---------- Databronnen ----------

async function geocode(query) {
  // Ziet de invoer eruit als een postcode? Dan alleen exact matchen, zodat
  // PDOK niet fuzzy een nét andere postcode teruggeeft.
  const compact = query.replace(/\s+/g, '').toUpperCase();
  const isPostcode = /^[1-9][0-9]{3}[A-Z]{2}$/.test(compact);
  const params = new URLSearchParams({
    q: isPostcode ? compact : query,
    fq: 'type:(postcode OR adres)',
    rows: '1',
    fl: 'weergavenaam,centroide_ll,centroide_rd,postcode,type',
  });
  if (isPostcode) params.append('fq', `postcode:${compact}`);
  const json = await fetchJson(`${PDOK_URL}?${params}`);
  const doc = json.response?.docs?.[0];
  if (!doc) {
    const err = new Error(`Geen resultaat voor "${query}"`);
    err.userMessage = isPostcode
      ? `Postcode ${compact} is niet gevonden. Controleer de cijfers en letters.`
      : `Geen postcode of adres gevonden voor "${query}". Controleer de invoer (bijv. 1012JS).`;
    throw err;
  }
  const ll = doc.centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
  const rd = doc.centroide_rd.match(/POINT\(([\d.]+) ([\d.]+)\)/);
  return {
    name: doc.weergavenaam,
    postcode: doc.postcode ?? null,
    lon: Number(ll[1]),
    lat: Number(ll[2]),
    rd: { x: Number(rd[1]), y: Number(rd[2]) },
  };
}

// Zoekt een CBS-buurt op buurtcode, met het geometrisch midden als rapportpunt
async function geocodeBuurt(code) {
  const params = new URLSearchParams({
    q: code,
    fq: 'type:buurt',
    rows: '1',
    fl: 'weergavenaam,centroide_ll,centroide_rd,buurtcode',
  });
  const json = await fetchJson(`${PDOK_URL}?${params}`);
  const doc = json.response?.docs?.[0];
  if (!doc || doc.buurtcode !== code) {
    const err = new Error(`Buurt ${code} niet gevonden`);
    err.userMessage = 'Deze buurt is niet gevonden.';
    throw err;
  }
  const ll = doc.centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
  const rd = doc.centroide_rd.match(/POINT\(([\d.]+) ([\d.]+)\)/);
  return {
    name: `Buurt ${doc.weergavenaam}`,
    postcode: null,
    buurtcode: code,
    lon: Number(ll[1]),
    lat: Number(ll[2]),
    rd: { x: Number(rd[1]), y: Number(rd[2]) },
  };
}

// Luchtmeetnet interpoleert per uur naar de opgegeven coördinaten; de reeks
// bevat ook verwachtingen, dus we pakken de laatste meting tot nu.
async function fetchAirLatest(formula, lon, lat) {
  try {
    const json = await fetchJson(`${AIR_URL}?formula=${formula}&longitude=${lon}&latitude=${lat}`);
    const measured = (json.data ?? []).filter((d) => new Date(d.timestamp_measured) <= new Date());
    if (!measured.length) return null;
    const latest = measured.reduce((a, b) =>
      new Date(a.timestamp_measured) > new Date(b.timestamp_measured) ? a : b);
    return { value: latest.value, time: new Date(latest.timestamp_measured) };
  } catch (err) {
    console.warn(`Luchtmeetnet ${formula} mislukt:`, err);
    return null;
  }
}

// Prikt één punt in een RIVM-rasterlaag via WMS GetFeatureInfo.
async function fetchGridValue(layer, lon, lat) {
  const d = 0.001;
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetFeatureInfo',
    layers: layer, query_layers: layer,
    crs: 'CRS:84',
    bbox: `${lon - d},${lat - d},${lon + d},${lat + d}`,
    width: '101', height: '101', i: '50', j: '50',
    info_format: 'application/json',
  });
  try {
    const json = await fetchJson(`${WMS_URL}?${params}`);
    const value = json.features?.[0]?.properties?.GRAY_INDEX;
    return typeof value === 'number' ? value : null;
  } catch (err) {
    console.warn(`RIVM raster (${layer}) mislukt:`, err);
    return null;
  }
}

// Jaargemiddelde NO₂- en PM2,5-concentratie uit de RIVM/NSL-kaarten
async function fetchAnnualAir(lon, lat) {
  const [no2, pm25] = await Promise.all([
    fetchGridValue(ANNUAL_NO2_LAYER, lon, lat),
    fetchGridValue(ANNUAL_PM25_LAYER, lon, lat),
  ]);
  const valid = (v) => (v != null && v > 0 && v < 150 ? v : null);
  const result = { no2: valid(no2), pm25: valid(pm25), year: ANNUAL_AIR_YEAR };
  return result.no2 == null && result.pm25 == null ? null : result;
}

// GRAY_INDEX is Lden in dB; 0 betekent "onder de kaartondergrens" (stil).
async function fetchLden(layer, lon, lat) {
  const value = await fetchGridValue(layer, lon, lat);
  if (value == null || value < 0 || value > 120) return null;
  return { db: value, belowFloor: value === 0 };
}

// Energetische optelling van geluidsbronnen (decibellen tellen logaritmisch
// op). Bronnen onder de kaartondergrens (< 45 dB) dragen nauwelijks bij en
// blijven buiten de som.
function combineLden(sources) {
  const present = sources.filter(Boolean);
  if (!present.length) return null;
  const audible = present.filter((s) => !s.belowFloor && s.db > 0);
  if (!audible.length) return { db: 0, belowFloor: true };
  const sum = audible.reduce((acc, s) => acc + 10 ** (s.db / 10), 0);
  const db = 10 * Math.log10(sum);
  return { db, belowFloor: db < 45 };
}

async function fetchFlood(lon, lat) {
  const value = await fetchGridValue(FLOOD_LAYER, lon, lat);
  return FLOOD_CLASSES[value] ? { class: value, ...FLOOD_CLASSES[value] } : null;
}

// CBS-buurt (code, naam, inwoners) op RD-coördinaten, via de PDOK-buurten-WFS
async function fetchBuurt(rd) {
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'wijkenbuurten:buurten',
    count: '1',
    outputFormat: 'application/json',
    bbox: `${rd.x - 1},${rd.y - 1},${rd.x + 1},${rd.y + 1},urn:ogc:def:crs:EPSG::28992`,
    propertyName: 'buurtcode,buurtnaam,gemeentenaam,gemeentecode,aantalInwoners',
  });
  try {
    const json = await fetchJson(`${BUURT_WFS}?${params}`);
    const props = json.features?.[0]?.properties;
    if (!props?.buurtcode) return null;
    return {
      code: props.buurtcode,
      name: props.buurtnaam,
      gemeente: { code: props.gemeentecode, name: props.gemeentenaam },
      // negatief betekent bij het CBS: geheim of onbekend
      residents: props.aantalInwoners > 0 ? props.aantalInwoners : null,
    };
  } catch (err) {
    console.warn('CBS buurten mislukt:', err);
    return null;
  }
}

// Geregistreerde misdrijven in de buurt, som van de laatste 12 maanden
async function fetchCrime(buurt) {
  if (!buurt) return null;
  const filter = `WijkenEnBuurten eq '${buurt.code}' and SoortMisdrijf eq '0.0.0 '`;
  const url = `${POLICE_URL}/TypedDataSet?$filter=${encodeURIComponent(filter)}&$format=json`;
  try {
    const json = await fetchJson(url);
    const rows = (json.value ?? [])
      .sort((a, b) => a.Perioden.localeCompare(b.Perioden))
      .slice(-12);
    if (!rows.length) return null;
    const total = rows.reduce((sum, r) => sum + (r.GeregistreerdeMisdrijven_1 ?? 0), 0);
    return {
      total,
      per1000: buurt.residents ? (total / buurt.residents) * 1000 : null,
      months: rows.length,
      periods: rows.map((r) => r.Perioden),
    };
  } catch (err) {
    console.warn('Politiedata mislukt:', err);
    return null;
  }
}

// RIVM Gezondheidsmonitor 2024: modelschattingen per buurt, 18 jaar en ouder
async function fetchHealthMonitor(buurtCode) {
  const filter = `WijkenEnBuurten eq '${buurtCode}' and Leeftijd eq '20300' and Marges eq 'MW00000' and Perioden eq '2024JJ00'`;
  const url = `${HEALTH_URL}/TypedDataSet?$filter=${encodeURIComponent(filter)}`
    + '&$select=GoedErvarenGezondheid_4,EenOfMeerLangdurigeAandoeningen_5&$format=json';
  try {
    const row = (await fetchJson(url)).value?.[0];
    if (row?.GoedErvarenGezondheid_4 == null) return null;
    return {
      goodHealth: row.GoedErvarenGezondheid_4,
      chronic: row.EenOfMeerLangdurigeAandoeningen_5,
    };
  } catch (err) {
    console.warn('Gezondheidsmonitor mislukt:', err);
    return null;
  }
}

// Sterfte per 1.000 inwoners van de gemeente, meest recente jaar
async function fetchMortality(gmCode) {
  const url = `${KERNCIJFERS_URL}/TypedDataSet?$filter=${encodeURIComponent(`RegioS eq '${gmCode}'`)}`
    + '&$select=Perioden,OverledenenRelatief_61&$format=json';
  try {
    const rows = ((await fetchJson(url)).value ?? [])
      .filter((r) => r.OverledenenRelatief_61 != null)
      .sort((a, b) => a.Perioden.localeCompare(b.Perioden));
    const last = rows.at(-1);
    return last ? { perMille: last.OverledenenRelatief_61, year: last.Perioden.slice(0, 4) } : null;
  } catch (err) {
    console.warn('Sterftecijfers mislukt:', err);
    return null;
  }
}

// Aandeel kanker en ademhalingsziekten in de sterfgevallen van de gemeente,
// met Nederland als referentie (zelfde jaar)
async function fetchDeathCauses(gmCode) {
  const filter = `RegioS eq '${gmCode}' or RegioS eq 'NL01  '`;
  const url = `${CAUSES_URL}/TypedDataSet?$filter=${encodeURIComponent(filter)}&$format=json`;
  try {
    const rows = (await fetchJson(url)).value ?? [];
    const share = (r, field) => (r && r.TotaalAlleOnderliggendeDoodsoorzaken_1 > 0
      ? r[field] / r.TotaalAlleOnderliggendeDoodsoorzaken_1 : null);
    const local = rows
      .filter((r) => r.RegioS.startsWith('GM') && r.TotaalAlleOnderliggendeDoodsoorzaken_1 != null)
      .sort((a, b) => a.Perioden.localeCompare(b.Perioden))
      .at(-1);
    if (!local) return null;
    const nl = rows.find((r) => r.RegioS.startsWith('NL') && r.Perioden === local.Perioden);
    return {
      year: local.Perioden.slice(0, 4),
      cancer: share(local, 'Nieuwvormingen_2'),
      cancerNl: share(nl, 'Nieuwvormingen_2'),
      respiratory: share(local, 'ZiektenVanAdemhalingsstelsel_4'),
      respiratoryNl: share(nl, 'ZiektenVanAdemhalingsstelsel_4'),
    };
  } catch (err) {
    console.warn('Doodsoorzaken mislukt:', err);
    return null;
  }
}

async function fetchGezondheid(buurt) {
  if (!buurt) return null;
  const [monitor, mortality, causes] = await Promise.all([
    fetchHealthMonitor(buurt.code),
    fetchMortality(buurt.gemeente.code),
    fetchDeathCauses(buurt.gemeente.code),
  ]);
  return { monitor, mortality, causes, gemeente: buurt.gemeente };
}

// Publiek bekende militaire complexen die in een conflict voor de hand
// liggende doelen zijn: vliegbases, marine, hoofdkwartieren, radar.
// Vaste lijst; deze locaties zijn openbaar en veranderen zelden.
const MILITARY_SITES = [
  { name: 'Vliegbasis Volkel', note: 'kernwapentaak', lon: 5.701, lat: 51.657 },
  { name: 'Vliegbasis Leeuwarden', lon: 5.760, lat: 53.228 },
  { name: 'Vliegbasis Eindhoven', lon: 5.375, lat: 51.450 },
  { name: 'Vliegbasis Gilze-Rijen', lon: 4.932, lat: 51.567 },
  { name: 'Vliegbasis Woensdrecht', lon: 4.342, lat: 51.449 },
  { name: 'Vliegbasis Deelen', lon: 5.873, lat: 52.061 },
  { name: 'Marinebasis Den Helder', lon: 4.765, lat: 52.965 },
  { name: 'NAVO-hoofdkwartier Brunssum', lon: 5.973, lat: 50.948 },
  { name: 'AWACS-basis Geilenkirchen (D)', lon: 6.043, lat: 50.961 },
  { name: 'Legerplaats Oirschot', lon: 5.302, lat: 51.512 },
  { name: 'Legerplaats Havelte', lon: 6.229, lat: 52.779 },
  { name: 'Legerplaats t Harde', lon: 5.878, lat: 52.418 },
  { name: 'Radarstation Wier', lon: 5.634, lat: 53.267 },
  { name: 'Radarstation Herwijnen', lon: 5.128, lat: 51.828 },
];

function distanceKm(lon1, lat1, lon2, lat2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestMilitary(lon, lat) {
  let nearest = null;
  for (const site of MILITARY_SITES) {
    const km = distanceKm(lon, lat, site.lon, site.lat);
    if (!nearest || km < nearest.km) nearest = { ...site, km };
  }
  return nearest;
}

// Nucleaire installaties (RIVM-lijst, ook net over de grens); eenmalig
// opgehaald en daarna gecachet, de ranglijst gebruikt hem per buurt
let nuclearSitesPromise = null;

function fetchNuclearSites() {
  if (!nuclearSitesPromise) {
    const params = new URLSearchParams({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: NUCLEAR_LAYER,
      outputFormat: 'application/json',
      count: '100',
    });
    nuclearSitesPromise = fetchJson(`${WFS_URL}?${params}`)
      .then((json) => json.features ?? [])
      .catch((err) => {
        console.warn('Nucleaire installaties mislukt:', err);
        nuclearSitesPromise = null;
        return [];
      });
  }
  return nuclearSitesPromise;
}

async function fetchNearestNuclear(rd) {
  let nearest = null;
  for (const f of await fetchNuclearSites()) {
    const [x, y] = f.geometry?.coordinates ?? [];
    if (typeof x !== 'number') continue;
    const km = Math.hypot(x - rd.x, y - rd.y) / 1000;
    if (!nearest || km < nearest.km) {
      nearest = { km, name: f.properties?.naam, type: f.properties?.type };
    }
  }
  return nearest;
}

// Dichtstbijzijnde bovengrondse hoogspanningslijn en of het adres binnen de
// indicatieve magneetveldzone (RIVM-rekenafstand) valt. Straling waar mensen
// zich bij een woning zorgen over maken. Bbox van 600 m houdt de query klein.
async function fetchNearestPowerline(rd) {
  const d = 600;
  const params = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: POWERLINE_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:28992',
    bbox: `${rd.x - d},${rd.y - d},${rd.x + d},${rd.y + d},urn:ogc:def:crs:EPSG::28992`,
  });
  try {
    const json = await fetchJson(`${POWERLINE_WFS}?${params}`);
    const feats = json.features ?? [];
    if (!feats.length) return { found: false };
    let best = null;
    for (const f of feats) {
      const g = f.geometry;
      if (!g) continue;
      const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
      for (const line of lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const dist = pointToSegment(rd.x, rd.y, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
          if (!best || dist < best.dist) best = { dist, props: f.properties };
        }
      }
    }
    if (!best) return { found: false };
    // rekenafstand staat als "2 x 115 meter"; pak het aantal meters
    const zoneMatch = String(best.props.rekenafs_1 ?? '').match(/(\d+)\s*meter/);
    const zone = zoneMatch ? Number(zoneMatch[1]) : 0;
    return {
      found: true,
      meters: best.dist,
      voltage: best.props.spanning__ ?? null,
      name: best.props.naam_fe ?? null,
      zone,
      inZone: best.dist <= zone,
    };
  } catch (err) {
    console.warn('Hoogspanningslijnen mislukt:', err);
    return null;
  }
}

// Kortste afstand van een punt tot een lijnstuk (RD-meters)
function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Ligt (px,py) binnen een ring? (ray casting)
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1];
    const xj = ring[j][0]; const yj = ring[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Binnen een polygoon (buitenring minus gaten)?
function pointInPolygon(px, py, poly) {
  if (!pointInRing(px, py, poly[0])) return false;
  return !poly.slice(1).some((hole) => pointInRing(px, py, hole));
}

// Kortste afstand van een punt tot de rand van een polygoon (RD-meters)
function distanceToPolygon(px, py, poly) {
  let min = Infinity;
  for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = pointToSegment(px, py, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      if (d < min) min = d;
    }
  }
  return min;
}

// Externe veiligheid: valt het adres binnen een plaatsgebonden risicocontour
// (10^-6) van gevaarlijke stoffen, of hoe ver is de dichtstbijzijnde? Bbox van
// 1200 m; per laag een aparte query (de server weigert meerdere tegelijk).
async function fetchExternalSafety(rd) {
  const d = 1200;
  const bbox = `${rd.x - d},${rd.y - d},${rd.x + d},${rd.y + d},urn:ogc:def:crs:EPSG::28992`;
  try {
    const results = await Promise.all(RISK_LAYERS.map((layer) => {
      const params = new URLSearchParams({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: layer, count: '200',
        outputFormat: 'application/json', srsName: 'EPSG:28992', bbox,
      });
      return fetchJson(`${WFS_URL}?${params}`).catch(() => null);
    }));
    const feats = results.filter(Boolean).flatMap((j) => j.features ?? []);
    if (!feats.length) return { found: false };
    let inside = null;
    let nearest = Infinity;
    for (const f of feats) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
      const label = f.properties?.naam_inric ?? f.properties?.naam ?? 'gevaarlijke stoffen';
      for (const poly of polys) {
        if (pointInPolygon(rd.x, rd.y, poly)) { inside = label; }
        const dist = distanceToPolygon(rd.x, rd.y, poly);
        if (dist < nearest) nearest = dist;
      }
      if (inside) break;
    }
    // Een uitgestrekt multipolygoon kan met zijn omhullende in de bbox vallen
    // terwijl de echte contour ver weg ligt; alleen echt binnen ~d tellen.
    if (inside) return { found: true, inside, name: inside, meters: nearest };
    if (nearest <= d) return { found: true, inside: null, name: null, meters: nearest };
    return { found: false };
  } catch (err) {
    console.warn('Externe veiligheid mislukt:', err);
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} bij ${url}`);
  return res.json();
}

// ---------- Scores ----------

function scoreFromLden(lden) {
  if (lden == null) return null;
  const db = lden.belowFloor ? SCORING.ldenQuiet : lden.db;
  const { ldenQuiet, ldenLoud } = SCORING;
  const score = 10 - ((db - ldenQuiet) * 9) / (ldenLoud - ldenQuiet);
  return clamp(score, 1, 10);
}

// LKI loopt van 1 (goed) t/m 11 (zeer slecht).
function scoreFromLki(lki) {
  if (lki == null) return null;
  return clamp(11 - lki.value, 1, 10);
}

// Jaargemiddelden: op de WHO-advieswaarde een 10, daarboven lineair omlaag
// (NO₂ 40 µg/m³ en PM2,5 25 µg/m³ zijn een 1).
const scoreFromNo2 = (v) => clamp(10 - ((v - SCORING.whoNo2) * 9) / 30, 1, 10);
const scoreFromPm25 = (v) => clamp(10 - ((v - SCORING.whoPm25) * 9) / 20, 1, 10);

function scoreFromAnnualAir(annual) {
  if (!annual) return null;
  const parts = [];
  if (annual.no2 != null) parts.push(scoreFromNo2(annual.no2));
  if (annual.pm25 != null) parts.push(scoreFromPm25(annual.pm25));
  return parts.length ? parts.reduce((a, b) => a + b) / parts.length : null;
}

// Luchtscore op het jaargemiddelde: dat zegt iets over er wonen. De actuele
// index (LKI) wisselt per uur en telt daarom niet mee; anders zou de
// leefscore met het weer veranderen. Zonder jaargemiddelde valt de score
// terug op de actuele index.
function scoreFromAir(lucht) {
  return scoreFromAnnualAir(lucht.annual) ?? scoreFromLki(lucht.lki);
}

// Goed ervaren gezondheid ligt landelijk rond 74%; buurten lopen ruwweg
// van 55% tot 85%. Absolute sterfte telt niet mee in de score, omdat die
// vooral leeftijdsopbouw weerspiegelt. Een aandeel kanker of ademhalings-
// ziekten dat duidelijk (> 3 procentpunt) boven landelijk ligt, geeft wel
// een punt aftrek per signaal; dat wijst mogelijk op omgevingsfactoren.
function scoreFromHealth(monitor, causes) {
  if (monitor?.goodHealth == null) return null;
  let score = 1 + ((monitor.goodHealth - 55) * 9) / 30;
  if (causes?.cancer != null && causes.cancer - causes.cancerNl > 0.03) score -= 1;
  if (causes?.respiratory != null && causes.respiratory - causes.respiratoryNl > 0.03) score -= 1;
  return clamp(score, 1, 10);
}

function scoreFromCrime(crime) {
  if (crime?.per1000 == null) return null;
  return clamp(10 - crime.per1000 / SCORING.crimeDivisor, 1, 10);
}

// Binnen 50 km telt de afstand mee; verder weg is het effect verwaarloosbaar.
function scoreFromNuclear(nuclear) {
  if (!nuclear) return null;
  return clamp(10 - (50 - nuclear.km) * 0.12, 4, 10);
}

// Binnen 25 km van een militair complex telt de afstand licht mee.
function scoreFromMilitary(military) {
  if (!military) return null;
  return clamp(10 - (25 - military.km) * 0.2, 5, 10);
}

// Straling van hoogspanningslijnen: binnen de magneetveldzone is er een
// RIVM-voorzorgadvies, daarbuiten neemt het veld snel af.
function scoreFromPowerline(pl) {
  if (!pl) return null;                       // fout bij ophalen
  if (!pl.found) return 10;                    // gezocht, geen lijn binnen 600 m
  if (pl.inZone) return 3.5;                   // binnen de indicatieve magneetveldzone
  if (pl.meters <= Math.max(pl.zone * 2, 100)) return 6.5; // vlakbij
  return 8.5;                                  // lijn in de buurt, ruim buiten de zone
}

// Externe veiligheid: binnen de risicocontour is de overlijdenskans bij een
// ongeval hoger dan de norm; vlakbij een contour telt licht mee.
function scoreFromExternalSafety(ext) {
  if (!ext) return null;               // fout bij ophalen
  if (!ext.found) return 10;            // gezocht, geen contour binnen 1,2 km
  if (ext.inside) return 2;             // binnen de plaatsgebonden risicocontour
  if (ext.meters <= 250) return 6.5;    // vlakbij een risicocontour
  return 9;                             // contour in de buurt, ruim erbuiten
}

function omgevingScore({ flood, nuclear, industry, military, powerline, external }) {
  const parts = [
    flood?.score ?? null,
    scoreFromNuclear(nuclear),
    industry ? scoreFromLden(industry) : null,
    scoreFromMilitary(military),
    scoreFromPowerline(powerline),
    scoreFromExternalSafety(external),
  ].filter((v) => v != null);
  return parts.length ? parts.reduce((a, b) => a + b) / parts.length : null;
}

function totalScore(subscores) {
  let sum = 0;
  let weightSum = 0;
  for (const [key, score] of Object.entries(subscores)) {
    if (score == null) continue; // ontbrekende data telt niet mee
    sum += score * SCORING.weights[key];
    weightSum += SCORING.weights[key];
  }
  return weightSum ? sum / weightSum : null;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- Labels ----------

const SUBSCORE_LABELS = {
  lucht: 'lucht',
  geluid: 'geluid',
  verkeer: 'verkeer',
  veiligheid: 'veiligheid',
  gezondheid: 'gezondheid',
  omgeving: 'de omgeving',
};

// Kort zinnetje bij de leefscore: wat tilt het cijfer, wat drukt het
function scoreReason(subscores) {
  const entries = Object.entries(subscores).filter(([, v]) => v != null);
  if (entries.length < 2) return '';
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const [bestKey, bestVal] = sorted[0];
  const [worstKey, worstVal] = sorted.at(-1);
  if (worstVal >= 7) {
    return `Alle onderdelen scoren hier ruim voldoende; ${SUBSCORE_LABELS[bestKey]} springt eruit met een ${fmtNum(bestVal)}.`;
  }
  if (bestVal - worstVal < 1.5) {
    return 'Geen grote uitschieters: alle onderdelen liggen dicht bij elkaar.';
  }
  return `Het cijfer leunt op ${SUBSCORE_LABELS[bestKey]} (${fmtNum(bestVal)}), maar ${SUBSCORE_LABELS[worstKey]} drukt het met een ${fmtNum(worstVal)}.`;
}

function scoreLabel(score) {
  if (score >= 8.5) return 'Uitstekend';
  if (score >= 7) return 'Goed';
  if (score >= 5.5) return 'Redelijk';
  if (score >= 4) return 'Matig';
  return 'Slecht';
}

function scoreColor(score) {
  // Drie merk-tierkleuren uit de BrightHouse ai-scan: groen, amber, rood.
  // Afronden op één decimaal zodat de kleur nooit een getoond getal
  // tegenspreekt (een 5,0 mag geen "rode" kleur van 4,96 krijgen).
  const s = Math.round(score * 10) / 10;
  if (s >= 7) return '#0a8a4a'; // goed
  if (s >= 5) return '#e08a00'; // matig
  return '#d64545'; // zwak
}

function lkiLabel(value) {
  if (value <= 3) return 'goed';
  if (value <= 6) return 'matig';
  if (value <= 8) return 'onvoldoende';
  if (value <= 10) return 'slecht';
  return 'zeer slecht';
}

function ldenLabel(lden) {
  if (lden.belowFloor || lden.db < 45) return 'stil';
  if (lden.db < 50) return 'rustig';
  if (lden.db < 55) return 'redelijk';
  if (lden.db < 60) return 'matig';
  if (lden.db < 65) return 'lawaaiig';
  return 'zeer lawaaiig';
}

// Nederlandse notatie: komma als decimaalteken
const fmtNum = (v, dec = 1) => v.toFixed(dec).replace('.', ',');
const fmtDb = (lden) => (lden.belowFloor ? '< 45 dB' : `${Math.round(lden.db)} dB`);
const fmtTime = (date) =>
  date.toLocaleString('nl-NL', { hour: '2-digit', minute: '2-digit' });

// ---------- Rendering ----------

function render(place, data) {
  $('#location-name').textContent = place.name;

  const subscores = {
    lucht: scoreFromAir(data.lucht),
    geluid: scoreFromLden(data.geluid.lden),
    verkeer: scoreFromLden(loudestTrafficSource(data.verkeer)),
    veiligheid: scoreFromCrime(data.veiligheid.crime),
    gezondheid: scoreFromHealth(data.gezondheid?.monitor, data.gezondheid?.causes),
    omgeving: omgevingScore(data.omgeving),
  };

  const total = totalScore(subscores);
  lastResult = { name: place.name, score: total };
  updateShareUrl(place);
  const box = $('#total-score');
  if (total == null) {
    box.textContent = '?';
    box.style.color = 'var(--muted)';
    $('#total-label').textContent = 'Geen data beschikbaar';
  } else {
    // Groot getal, gekleurd naar tier (groen/amber/rood)
    box.style.color = scoreColor(total);
    animateNumber(box, total);
    $('#total-label').textContent = scoreLabel(total);
  }
  $('#score-reason').textContent = total != null ? scoreReason(subscores) : '';

  renderCard('#card-lucht', subscores.lucht, luchtMain(data.lucht), luchtExplain(data.lucht), luchtDetails(data.lucht));
  renderCard('#card-geluid', subscores.geluid, geluidMain(data.geluid), geluidExplain(data.geluid), geluidDetails(data.geluid));
  renderCard('#card-verkeer', subscores.verkeer, verkeerMain(data.verkeer), verkeerExplain(data.verkeer), verkeerDetails(data.verkeer));
  renderCard('#card-veiligheid', subscores.veiligheid, veiligheidMain(data.veiligheid), veiligheidExplain(data.veiligheid), veiligheidDetails(data.veiligheid));
  renderCard('#card-gezondheid', subscores.gezondheid, gezondheidMain(data.gezondheid), gezondheidExplain(data.gezondheid), gezondheidDetails(data.gezondheid));
  renderCard('#card-omgeving', subscores.omgeving, omgevingMain(data.omgeving), omgevingExplain(data.omgeving), omgevingDetails(data.omgeving));

  renderAffiliate();
  resultEl.hidden = false;
  renderMap(place.lon, place.lat); // na het tonen, anders is de breedte nog 0
  renderRanking(data.veiligheid.buurt, data.veiligheid.crime, data.gezondheid?.causes); // laadt asynchroon verder
}

function renderAffiliate() {
  const section = $('#affiliate');
  if (!AFFILIATE.enabled || !AFFILIATE.url) {
    section.hidden = true;
    return;
  }
  $('#affiliate-title').textContent = AFFILIATE.title;
  $('#affiliate-text').textContent = AFFILIATE.text;
  const link = $('#affiliate-link');
  link.textContent = AFFILIATE.button;
  link.href = AFFILIATE.url;
  section.hidden = false;
}

// ---------- Ranglijst beste buurten van de gemeente ----------
// Gewogen cijfer per buurt uit de onderdelen die per gemeente in bulk op te
// vragen zijn: veiligheid (misdrijven per 1.000 inwoners, zelfde 12 maanden)
// en gezondheid (ervaren gezondheid 2024). Zelfde scorefuncties en onderlinge
// weging als het rapport zelf. Buurten met minder dan 200 inwoners doen niet
// mee; daar maakt één incident de cijfers al onbruikbaar.

const RANKING_MIN_RESIDENTS = 200;
// Zo veel kandidaten uit de voorselectie rekenen we volledig door
const RANKING_SHORTLIST = 24;

async function renderRanking(buurt, crime, causes) {
  const section = $('#ranking');
  section.hidden = true;
  if (!buurt || !crime?.periods?.length) return;
  const prefix = `BU${buurt.gemeente.code.slice(2)}`;

  // Structureel skelet zolang de gemeentedata laadt
  $('#ranking-title').textContent = `Beste buurten van gemeente ${buurt.gemeente.name}`;
  $('#ranking-sub').textContent = 'Kansrijkste buurten selecteren en volledig doorrekenen, dit duurt even…';
  renderSkeletonRows($('#ranking-list'), 8);
  section.hidden = false;

  try {
    const periodFilter = crime.periods.map((p) => `Perioden eq '${p}'`).join(' or ');
    const crimeFilter = `startswith(WijkenEnBuurten,'${prefix}') and SoortMisdrijf eq '0.0.0 ' and (${periodFilter})`;
    const healthFilter = `startswith(WijkenEnBuurten,'${prefix}') and Leeftijd eq '20300' and Marges eq 'MW00000' and Perioden eq '2024JJ00'`;
    const [crimeJson, namesJson, popJson, healthJson] = await Promise.all([
      fetchJson(`${POLICE_URL}/TypedDataSet?$filter=${encodeURIComponent(crimeFilter)}&$format=json`),
      fetchJson(`${KERN_BUURT_URL}/WijkenEnBuurten?$filter=${encodeURIComponent(`startswith(Key,'${prefix}')`)}&$format=json`),
      fetchJson(`${KERN_BUURT_URL}/TypedDataSet?$filter=${encodeURIComponent(`startswith(WijkenEnBuurten,'${prefix}')`)}&$select=WijkenEnBuurten,AantalInwoners_5&$format=json`),
      fetchJson(`${HEALTH_URL}/TypedDataSet?$filter=${encodeURIComponent(healthFilter)}&$select=WijkenEnBuurten,GoedErvarenGezondheid_4&$format=json`),
    ]);

    const names = new Map((namesJson.value ?? []).map((v) => [v.Key.trim(), v.Title]));
    const residents = new Map((popJson.value ?? []).map((v) => [v.WijkenEnBuurten.trim(), v.AantalInwoners_5]));
    const health = new Map((healthJson.value ?? [])
      .filter((v) => v.GoedErvarenGezondheid_4 != null)
      .map((v) => [v.WijkenEnBuurten.trim(), v.GoedErvarenGezondheid_4]));
    const totals = new Map();
    for (const row of crimeJson.value ?? []) {
      const code = row.WijkenEnBuurten.trim();
      totals.set(code, (totals.get(code) ?? 0) + (row.GeregistreerdeMisdrijven_1 ?? 0));
    }

    // Voorselectie op de onderdelen die in bulk beschikbaar zijn (veiligheid
    // en gezondheid, zelfde weging als het rapport); de kansrijkste
    // kandidaten rekenen we daarna volledig door.
    const candidates = [...totals.entries()]
      .map(([code, total]) => ({ code, total, residents: residents.get(code), name: names.get(code) ?? code }))
      .filter((b) => b.residents >= RANKING_MIN_RESIDENTS)
      .map((b) => {
        const per1000 = (b.total / b.residents) * 1000;
        const healthPct = health.get(b.code) ?? null;
        const parts = [
          { score: scoreFromCrime({ per1000 }), weight: SCORING.weights.veiligheid },
          { score: scoreFromHealth({ goodHealth: healthPct }), weight: SCORING.weights.gezondheid },
        ].filter((p) => p.score != null);
        const weightSum = parts.reduce((s, p) => s + p.weight, 0);
        return {
          ...b,
          per1000,
          healthPct,
          compareScore: weightSum ? parts.reduce((s, p) => s + p.score * p.weight, 0) / weightSum : null,
        };
      })
      .filter((b) => b.compareScore != null)
      .sort((a, b) => b.compareScore - a.compareScore);
    if (candidates.length < 2) { section.hidden = true; return; } // niets te vergelijken

    const shortlist = candidates.slice(0, RANKING_SHORTLIST);
    if (!shortlist.some((b) => b.code === buurt.code)) {
      const current = candidates.find((b) => b.code === buurt.code);
      if (current) shortlist.push(current);
    }

    // Volledige leefscore per kandidaat, in kleine groepjes om de kaartservers te sparen
    for (let i = 0; i < shortlist.length; i += 3) {
      await Promise.all(shortlist.slice(i, i + 3).map(async (b) => {
        b.leefscore = await computeBuurtLeefscore(b, causes);
      }));
    }

    const ranked = shortlist
      .filter((b) => b.leefscore != null)
      .sort((a, b) => b.leefscore - a.leefscore);
    if (ranked.length < 2) { section.hidden = true; return; }

    $('#ranking-sub').textContent = `De ${ranked.length} kansrijkste van ${candidates.length} buurten `
      + `(minstens ${RANKING_MIN_RESIDENTS} inwoners) volledig doorgerekend op alle zes onderdelen, `
      + 'op het middelpunt van elke buurt. Jouw rapport hierboven rekent op je eigen adres of postcode; '
      + 'dat kan iets afwijken van het buurtmiddelpunt. Klik op een buurt voor het rapport.';

    const rows = ranked.slice(0, 20).map((b, i) => ({ ...b, rank: i + 1 }));
    const currentIndex = ranked.findIndex((b) => b.code === buurt.code);
    if (currentIndex >= 20) rows.push({ ...ranked[currentIndex], rank: currentIndex + 1, gap: true });

    const list = $('#ranking-list');
    list.innerHTML = '';
    for (const b of rows) {
      const tr = document.createElement('tr');
      if (b.code === buurt.code) tr.classList.add('current');
      if (b.gap) tr.classList.add('gap');

      const rank = document.createElement('td');
      rank.className = 'rank';
      // Buiten de top 20 is de positie binnen de doorgerekende selectie
      // geen echte gemeentepositie; toon dan geen nummer.
      rank.textContent = b.gap ? '…' : `${b.rank}.`;

      const nameCell = document.createElement('td');
      nameCell.className = 'rank-name-cell';
      if (b.code === buurt.code) {
        nameCell.textContent = `${b.name} (deze buurt)`;
      } else {
        // Andere buurten zijn aanklikbaar en openen hun eigen rapport
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'rank-name';
        link.textContent = b.name;
        link.addEventListener('click', () => {
          window.scrollTo({ top: 0 });
          lookupBuurt(b.code);
        });
        nameCell.append(link);
      }

      const scoreCell = document.createElement('td');
      scoreCell.className = 'num leefscore';
      scoreCell.textContent = fmtNum(b.leefscore);
      scoreCell.style.color = scoreColor(b.leefscore);

      const crimeCell = document.createElement('td');
      crimeCell.className = 'num extra';
      crimeCell.textContent = fmtNum(b.per1000, 0);

      const healthCell = document.createElement('td');
      healthCell.className = 'num extra';
      healthCell.textContent = b.healthPct != null ? `${fmtNum(b.healthPct, 0)}%` : 'geen data';

      tr.append(rank, nameCell, scoreCell, crimeCell, healthCell);
      list.append(tr);
    }
  } catch (err) {
    section.hidden = true;
    console.warn('Buurtenranglijst mislukt:', err);
  }
}

// Volledige leefscore voor het middelpunt van een buurt, met dezelfde
// scorefuncties en weging als het rapport. Veiligheid en gezondheid komen
// uit de bulkdata; de kaartlagen worden per buurt geprikt.
async function computeBuurtLeefscore(candidate, causes) {
  try {
    const place = await geocodeBuurt(candidate.code);
    const [annual, ldenWind, ldenRoad, ldenRail, ldenAir, flood, industry, nuclear, powerline, external] = await Promise.all([
      fetchAnnualAir(place.lon, place.lat),
      fetchLden(NOISE_LAYERS.wind, place.lon, place.lat),
      fetchLden(NOISE_LAYERS.road, place.lon, place.lat),
      fetchLden(NOISE_LAYERS.rail, place.lon, place.lat),
      fetchLden(NOISE_LAYERS.air, place.lon, place.lat),
      fetchFlood(place.lon, place.lat),
      fetchLden(NOISE_LAYERS.industry, place.lon, place.lat),
      fetchNearestNuclear(place.rd),
      fetchNearestPowerline(place.rd),
      fetchExternalSafety(place.rd),
    ]);
    const ldenTotal = combineLden([ldenRoad, ldenRail, ldenAir, industry, ldenWind]);
    const subscores = {
      lucht: scoreFromAnnualAir(annual),
      geluid: scoreFromLden(ldenTotal),
      verkeer: scoreFromLden(loudestTrafficSource({ road: ldenRoad, rail: ldenRail, air: ldenAir })),
      veiligheid: scoreFromCrime({ per1000: candidate.per1000 }),
      gezondheid: scoreFromHealth({ goodHealth: candidate.healthPct }, causes),
      omgeving: omgevingScore({ flood, nuclear, industry, military: nearestMilitary(place.lon, place.lat), powerline, external }),
    };
    return totalScore(subscores);
  } catch (err) {
    console.warn(`Leefscore voor ${candidate.code} mislukt:`, err);
    return null;
  }
}

function renderSkeletonRows(list, count) {
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.className = 'skeleton';
    const rank = document.createElement('td');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const cell = document.createElement('td');
    cell.colSpan = 4;
    const bar = document.createElement('span');
    bar.className = 'skeleton-bar';
    cell.append(bar);
    tr.append(rank, cell);
    list.append(tr);
  }
}

// ---------- Kaart ----------
// Zelf getekend uit PDOK-tegels (grijze BRT-achtergrondkaart) met een
// doorzichtige RIVM-laag eroverheen. Slepen om te verschuiven, knoppen om
// te zoomen, laagkeuze via radioknopjes. Geen kaartlibrary nodig.

const MAP_MIN_ZOOM = 11;
const MAP_MAX_ZOOM = 17;

const MAP_OVERLAYS = {
  geluid: NOISE_LAYERS.total,
  lucht: ANNUAL_NO2_LAYER,
  overstroming: FLOOD_LAYER,
};

const mapState = {
  marker: null, // { lon, lat } van de postcode
  center: null, // { lon, lat } van het kaartmidden
  zoom: MAP_ZOOM,
  overlay: 'geluid',
};

// Legenda's per laag, overgenomen uit de RIVM-stijlen (GetLegendGraphic)
const MAP_LEGENDS = {
  geluid: [
    ['#FFFFFF', '45 dB of minder'],
    ['#FFFFB2', '46 tot 50'],
    ['#FFFF00', '51 tot 55'],
    ['#FFD200', '56 tot 60'],
    ['#FFA500', '61 tot 65'],
    ['#FF0000', '66 tot 70'],
    ['#800000', '71 dB of meer'],
  ],
  lucht: [
    ['#305FCF', 'minder dan 10 µg/m³'],
    ['#697FCF', '10 tot 12'],
    ['#97A1CC', '12 tot 14'],
    ['#BFC3C7', '14 tot 16'],
    ['#ECEDD2', '16 tot 18'],
    ['#FAE7AC', '18 tot 20'],
    ['#F0BC8B', '20 tot 25'],
    ['#E3926D', '25 tot 30'],
    ['#D66C51', '30 tot 35'],
    ['#C44539', '35 tot 39'],
    ['#B01D1B', '39 of meer'],
  ],
  overstroming: [
    ['#FFFFCC', 'overstroomt niet'],
    ['#A1DAB4', '1x per 100.000 jaar'],
    ['#41B6C4', '1x per 1.000 jaar'],
    ['#2C7FB8', '1x per 100 jaar'],
    ['#253494', '1x per 10 jaar'],
    ['#E1E1E1', 'oppervlaktewater'],
  ],
};

function renderLegend() {
  const legend = $('#map-legend');
  legend.innerHTML = '';
  const entries = MAP_LEGENDS[mapState.overlay];
  legend.hidden = !entries;
  if (!entries) return;
  for (const [color, label] of entries) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('i');
    swatch.style.background = color;
    item.append(swatch, label);
    legend.append(item);
  }
}

// Web-Mercator: lon/lat naar wereldpixels op dit zoomniveau, en terug
function lonLatToWorld(lon, lat, worldPx) {
  const latRad = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * worldPx,
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * worldPx,
  ];
}

function worldToLonLat(x, y, worldPx) {
  return {
    lon: (x / worldPx) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx))) * 180) / Math.PI,
  };
}

function renderMap(lon, lat) {
  mapState.marker = { lon, lat };
  mapState.center = { lon, lat };
  mapState.zoom = MAP_ZOOM;
  drawMap();
  renderLegend();
}

function drawMap() {
  const map = $('#map');
  const canvas = $('#map .map-canvas');
  canvas.innerHTML = '';
  canvas.style.transform = '';
  const w = map.clientWidth;
  const h = map.clientHeight;

  const worldPx = 2 ** mapState.zoom * TILE_SIZE;
  const [cx, cy] = lonLatToWorld(mapState.center.lon, mapState.center.lat, worldPx);
  const originX = Math.round(cx - w / 2);
  const originY = Math.round(cy - h / 2);

  for (let tx = Math.floor(originX / TILE_SIZE); tx <= Math.floor((originX + w - 1) / TILE_SIZE); tx++) {
    for (let ty = Math.floor(originY / TILE_SIZE); ty <= Math.floor((originY + h - 1) / TILE_SIZE); ty++) {
      const img = document.createElement('img');
      img.src = `${TILE_URL}/${mapState.zoom}/${tx}/${ty}.png`;
      img.alt = '';
      img.className = 'map-tile';
      img.style.left = `${tx * TILE_SIZE - originX}px`;
      img.style.top = `${ty * TILE_SIZE - originY}px`;
      canvas.append(img);
    }
  }

  // RIVM-laag in exact dezelfde uitsnede opvragen (EPSG:3857, meters)
  const overlayLayer = MAP_OVERLAYS[mapState.overlay];
  if (overlayLayer) {
    const R = 6378137;
    const res = (2 * Math.PI * R) / worldPx;
    const toX = (px) => px * res - Math.PI * R;
    const toY = (py) => Math.PI * R - py * res;
    const overlay = document.createElement('img');
    const params = new URLSearchParams({
      service: 'WMS', version: '1.3.0', request: 'GetMap',
      layers: overlayLayer,
      crs: 'EPSG:3857',
      bbox: `${toX(originX)},${toY(originY + h)},${toX(originX + w)},${toY(originY)}`,
      width: w, height: h,
      format: 'image/png', transparent: 'true', styles: '',
    });
    overlay.src = `${WMS_URL}?${params}`;
    overlay.alt = `Kaartlaag ${mapState.overlay}`;
    overlay.className = 'map-overlay';
    canvas.append(overlay);
  }

  if (mapState.marker) {
    const [mx, my] = lonLatToWorld(mapState.marker.lon, mapState.marker.lat, worldPx);
    const marker = document.createElement('div');
    marker.className = 'map-marker';
    marker.style.left = `${mx - originX}px`;
    marker.style.top = `${my - originY}px`;
    canvas.append(marker);
  }
}

function zoomMap(delta) {
  const zoom = clamp(mapState.zoom + delta, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  if (zoom === mapState.zoom || !mapState.center) return;
  mapState.zoom = zoom;
  drawMap();
}

function initMapControls() {
  const map = $('#map');
  const canvas = $('#map .map-canvas');
  let drag = null;

  // Slepen: tijdens de beweging alleen de canvas verschuiven (transform),
  // pas bij loslaten het middelpunt herrekenen en opnieuw tekenen.
  map.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.map-zoom') || !mapState.center) return;
    drag = { x: e.clientX, y: e.clientY };
    map.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  map.addEventListener('pointermove', (e) => {
    if (!drag) return;
    canvas.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
  });
  map.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag = null;
    const worldPx = 2 ** mapState.zoom * TILE_SIZE;
    const [cx, cy] = lonLatToWorld(mapState.center.lon, mapState.center.lat, worldPx);
    mapState.center = worldToLonLat(cx - dx, cy - dy, worldPx);
    drawMap();
  });
  map.addEventListener('pointercancel', () => {
    drag = null;
    canvas.style.transform = '';
  });

  $('#zoom-in').addEventListener('click', () => zoomMap(1));
  $('#zoom-out').addEventListener('click', () => zoomMap(-1));
  for (const radio of document.querySelectorAll('input[name="overlay"]')) {
    radio.addEventListener('change', () => {
      mapState.overlay = radio.value;
      if (mapState.center) drawMap();
      renderLegend();
    });
  }
}

function animateNumber(el, target, duration = 800) {
  // Eindwaarde direct zetten: in een achtergrondtab komen er geen frames
  // en zou de score anders leeg blijven.
  el.textContent = fmtNum(target);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtNum(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Meterbalkje voor een Lden-waarde, op een schaal van 40 tot 75 dB.
function ldenMeter(lden) {
  const db = lden.belowFloor ? SCORING.ldenQuiet - 1 : lden.db;
  const pct = clamp(((db - 40) / (75 - 40)) * 100, 4, 100);
  return { pct, color: scoreColor(scoreFromLden(lden)) };
}

function loudestTrafficSource({ road, rail, air }) {
  const present = [road, rail, air].filter(Boolean);
  if (!present.length) return null;
  return present.reduce((a, b) => (a.db >= b.db ? a : b));
}

function luchtMain({ lki, annual }) {
  const raw = scoreFromAnnualAir(annual);
  if (raw == null) {
    return lki ? `Luchtkwaliteit nu: ${lkiLabel(lki.value)}` : 'Geen actuele meting beschikbaar';
  }
  // Zelfde afronding als het getoonde cijfer, anders spreekt het label de badge tegen
  const score = Math.round(raw * 10) / 10;
  const label = score >= 8 ? 'schoon' : score >= 6.5 ? 'redelijk schoon' : score >= 5 ? 'matig' : 'ongezond';
  return { text: `De lucht is hier over het jaar ${label}`, label };
}

function luchtDetails({ lki, annual }) {
  const rows = [];
  if (lki) {
    rows.push(['LKI-index (nu)', `${fmtNum(lki.value)} / 11`, {
      pct: clamp((lki.value / 11) * 100, 4, 100),
      color: scoreColor(scoreFromLki(lki)),
    }]);
  }
  if (annual?.no2 != null) {
    rows.push([`NO₂ jaargemiddelde ${annual.year}`, `${fmtNum(annual.no2)} µg/m³`, {
      pct: clamp((annual.no2 / 40) * 100, 4, 100),
      color: scoreColor(scoreFromNo2(annual.no2)),
    }]);
  }
  if (annual?.pm25 != null) {
    rows.push([`PM2,5 jaargemiddelde ${annual.year}`, `${fmtNum(annual.pm25)} µg/m³`, {
      pct: clamp((annual.pm25 / 25) * 100, 4, 100),
      color: scoreColor(scoreFromPm25(annual.pm25)),
    }]);
  }
  if (annual) rows.push(['WHO-advies NO₂ en PM2,5', `${SCORING.whoNo2} en ${SCORING.whoPm25} µg/m³`]);
  if (lki) rows.push(['Gemeten om', fmtTime(lki.time)]);
  return rows;
}

function geluidMain({ lden }) {
  if (!lden) return 'Geen data voor deze locatie';
  const label = ldenLabel(lden);
  return { text: `Alle geluidsbronnen samen: ${label}`, label };
}

function geluidDetails({ lden, industry, wind }) {
  if (!lden) return [];
  const rows = [
    ['Alle bronnen samen (Lden)', fmtDb(lden), ldenMeter(lden)],
    ['WHO-advies wegverkeer', '53 dB'],
  ];
  // Verkeersbronnen staan uitgesplitst onder 03 Verkeer; hier de rest
  if (industry) rows.push(['Industrie', industry.belowFloor ? 'niet hoorbaar' : fmtDb(industry)]);
  if (wind) rows.push(['Windturbines', wind.belowFloor ? 'niet hoorbaar' : fmtDb(wind)]);
  return rows;
}

function verkeerMain(traffic) {
  const loudest = loudestTrafficSource(traffic);
  if (!loudest) return 'Geen data voor deze locatie';
  const label = ldenLabel(loudest);
  return { text: `Luidste bron: ${label}`, label };
}

function verkeerDetails({ road, rail, air }) {
  const rows = [];
  if (road) rows.push(['Wegverkeer', fmtDb(road), ldenMeter(road)]);
  if (rail) rows.push(['Treinverkeer', fmtDb(rail), ldenMeter(rail)]);
  if (air) rows.push(['Vliegverkeer', fmtDb(air), ldenMeter(air)]);
  return rows;
}

function crimeLabel(per1000) {
  if (per1000 < 20) return 'weinig misdaad';
  if (per1000 < 45) return 'gemiddelde misdaad';
  if (per1000 < 80) return 'veel misdaad';
  return 'zeer veel misdaad';
}

function veiligheidMain({ buurt, crime }) {
  if (!crime) return 'Geen misdaadcijfers voor deze buurt';
  if (crime.per1000 == null) return `${crime.total} misdrijven in een jaar, inwonertal onbekend`;
  const label = crimeLabel(crime.per1000);
  return { text: `Buurt ${buurt.name}: ${label}`, label };
}

function veiligheidDetails({ buurt, crime }) {
  if (!crime) return [];
  const rows = [[`Misdrijven (${crime.months} mnd)`, String(crime.total)]];
  if (crime.per1000 != null) {
    rows.push(['Per 1.000 inwoners', fmtNum(crime.per1000, 0), {
      pct: clamp((crime.per1000 / 150) * 100, 4, 100),
      color: scoreColor(scoreFromCrime(crime)),
    }]);
  }
  if (buurt?.residents) rows.push(['Inwoners buurt', String(buurt.residents)]);
  return rows;
}

const fmtPct = (fraction) => `${fmtNum(fraction * 100, 0)}%`;

function gezondheidMain(gezondheid) {
  if (!gezondheid) return 'Geen gezondheidscijfers voor deze locatie';
  const { monitor, causes } = gezondheid;
  // Duidelijk verhoogd aandeel kanker of ademhalingsziekten? Dan dat melden.
  if (causes?.cancer != null && causes.cancer - causes.cancerNl > 0.03) {
    return `Let op: kankersterfte in de gemeente boven landelijk (${fmtPct(causes.cancer)} om ${fmtPct(causes.cancerNl)})`;
  }
  if (causes?.respiratory != null && causes.respiratory - causes.respiratoryNl > 0.03) {
    return `Let op: sterfte aan ademhalingsziekten boven landelijk (${fmtPct(causes.respiratory)} om ${fmtPct(causes.respiratoryNl)})`;
  }
  if (monitor?.goodHealth == null) return 'Geen buurtcijfers, alleen gemeentecijfers beschikbaar';
  return `${fmtNum(monitor.goodHealth, 0)}% van de buurt voelt zich gezond`;
}

function gezondheidDetails(gezondheid) {
  if (!gezondheid) return [];
  const { monitor, mortality, causes } = gezondheid;
  const rows = [];
  if (monitor?.goodHealth != null) {
    rows.push(['Goed ervaren gezondheid', `${fmtNum(monitor.goodHealth, 0)}%`, {
      pct: clamp(monitor.goodHealth, 4, 100),
      color: scoreColor(scoreFromHealth(monitor, causes)),
    }]);
  }
  if (monitor?.chronic != null) rows.push(['Langdurige aandoening', `${fmtNum(monitor.chronic, 0)}%`]);
  if (mortality) rows.push([`Sterfte gemeente (${mortality.year})`, `${fmtNum(mortality.perMille)} per 1.000`]);
  const withNl = (value, nl) => (nl != null ? `${fmtPct(value)} (NL ${fmtPct(nl)})` : fmtPct(value));
  if (causes?.cancer != null) {
    rows.push(['Kanker in sterfgevallen', withNl(causes.cancer, causes.cancerNl)]);
  }
  if (causes?.respiratory != null) {
    rows.push(['Ademhaling in sterfgevallen', withNl(causes.respiratory, causes.respiratoryNl)]);
  }
  return rows;
}

function omgevingMain({ flood, nuclear, industry, military, powerline, external }) {
  const risks = [];
  const extScore = scoreFromExternalSafety(external);
  if (extScore != null && extScore < 8) {
    risks.push({
      score: extScore,
      text: external.inside
        ? `binnen de risicocontour van ${external.name} (gevaarlijke stoffen)`
        : `risicocontour gevaarlijke stoffen op ${fmtNum(external.meters, 0)} m`,
    });
  }
  if (flood && flood.score < 8) risks.push({ score: flood.score, text: `overstromingskans ${flood.label}` });
  const nuclearScore = scoreFromNuclear(nuclear);
  if (nuclearScore != null && nuclearScore < 8) {
    risks.push({ score: nuclearScore, text: `${nuclear.name} op ${fmtNum(nuclear.km, 0)} km` });
  }
  const industryScore = industry ? scoreFromLden(industry) : null;
  if (industryScore != null && industryScore < 8) {
    risks.push({ score: industryScore, text: 'zware industrie duidelijk hoorbaar' });
  }
  const militaryScore = scoreFromMilitary(military);
  if (militaryScore != null && militaryScore < 8) {
    risks.push({ score: militaryScore, text: `${military.name} op ${fmtNum(military.km, 0)} km (mogelijk doelwit)` });
  }
  const powerScore = scoreFromPowerline(powerline);
  if (powerScore != null && powerScore < 8) {
    risks.push({
      score: powerScore,
      text: powerline.inZone
        ? `binnen de magneetveldzone van een ${powerline.voltage} hoogspanningslijn`
        : `hoogspanningslijn (${powerline.voltage}) op ${fmtNum(powerline.meters, 0)} m`,
    });
  }
  if (!risks.length) {
    return (flood || nuclear || industry || military || powerline || external) ? 'Geen opvallende risico’s in de omgeving' : 'Geen data voor deze locatie';
  }
  risks.sort((a, b) => a.score - b.score);
  return `Let op: ${risks[0].text}`;
}

function omgevingDetails({ flood, nuclear, industry, military, powerline, external }) {
  const rows = [];
  if (flood) {
    rows.push(['Overstromingskans', flood.label, {
      pct: clamp(flood.score * 10, 4, 100),
      color: scoreColor(flood.score),
    }]);
  }
  if (nuclear) rows.push(['Kerninstallatie', `${nuclear.name}, ${fmtNum(nuclear.km, 0)} km`]);
  if (military) {
    const label = military.note ? `${military.name} (${military.note})` : military.name;
    rows.push(['Militair complex', `${label}, ${fmtNum(military.km, 0)} km`]);
  }
  if (powerline) {
    rows.push(['Hoogspanningslijn', powerline.found
      ? `${powerline.voltage} op ${fmtNum(powerline.meters, 0)} m${powerline.inZone ? ' (in magneetveldzone)' : ''}`
      : 'geen binnen 600 m']);
  }
  if (external) {
    rows.push(['Gevaarlijke stoffen', external.found
      ? (external.inside ? `binnen contour ${external.name}` : `contour op ${fmtNum(external.meters, 0)} m`)
      : 'geen contour binnen 1,2 km']);
  }
  rows.push(['Industriegeluid', industry ? (industry.belowFloor ? 'niet hoorbaar' : fmtDb(industry)) : 'geen data']);
  return rows;
}

// ---------- Uitleg per onderdeel, over de cijfers die er echt staan ----------

function luchtExplain({ lki, annual }) {
  const parts = [];
  if (annual?.pm25 != null) {
    const above = annual.pm25 > SCORING.whoPm25;
    parts.push(`Over heel ${annual.year} hing er gemiddeld ${fmtNum(annual.pm25)} µg/m³ fijnstof, `
      + (above
        ? `boven het WHO-advies van ${SCORING.whoPm25}; dat geldt overigens voor bijna heel Nederland.`
        : `onder het WHO-advies van ${SCORING.whoPm25}.`));
  }
  if (annual?.no2 != null && annual.no2 > 20) {
    parts.push(`De stikstofdioxide (${fmtNum(annual.no2)} µg/m³) verraadt veel verkeer in de buurt.`);
  }
  if (lki) {
    parts.push(`Op dit moment is de lucht ${lkiLabel(lki.value)} (index ${fmtNum(lki.value)} van 11); `
      + 'dat wisselt per uur en telt niet mee in het cijfer.');
  }
  return parts.join(' ') || 'Voor deze plek zijn geen luchtgegevens beschikbaar.';
}

function geluidExplain({ lden }) {
  if (!lden) return 'Voor deze plek zijn geen geluidgegevens beschikbaar.';
  if (lden.belowFloor || lden.db < 46) {
    return 'Gemiddeld is het hier stiller dan 45 dB over het etmaal. Dat is echt rustig.';
  }
  const db = Math.round(lden.db);
  const diff = db - 53;
  if (diff <= 0) {
    return `Gemiddeld ${db} dB over het etmaal. Dat blijft binnen de 53 dB die de WHO als grens voor gezond wonen aanhoudt.`;
  }
  const feel = db < 60 ? 'een drukke straat op een afstandje'
    : db < 67 ? 'aanhoudend verkeer vlakbij'
      : 'wonen aan een drukke hoofdweg';
  return `Gemiddeld ${db} dB over het etmaal, ${diff} dB boven het WHO-advies van 53. Dat voelt als ${feel}.`;
}

function verkeerExplain(traffic) {
  const loudest = loudestTrafficSource(traffic);
  if (!loudest) return 'Voor deze plek zijn geen verkeersgegevens beschikbaar.';
  if (loudest.belowFloor || loudest.db < 46) {
    return 'Weg, spoor noch vliegtuig is hier gemiddeld goed te horen.';
  }
  const names = [['wegverkeer', traffic.road], ['treinverkeer', traffic.rail], ['vliegverkeer', traffic.air]];
  const source = names.find(([, v]) => v === loudest)?.[0] ?? 'verkeer';
  const others = names.filter(([, v]) => v && v !== loudest);
  const rest = others.every(([, v]) => v.belowFloor || v.db <= loudest.db - 8)
    ? ' De andere bronnen zijn daarnaast nauwelijks hoorbaar.'
    : '';
  return `Het meeste geluid komt hier van ${source} (${Math.round(loudest.db)} dB).${rest}`;
}

function veiligheidExplain({ buurt, crime }) {
  if (!crime) return 'De politie publiceert voor deze buurt geen cijfers.';
  if (crime.per1000 == null) {
    return `${crime.total} geregistreerde misdrijven in een jaar; zonder inwonertal valt dat niet eerlijk te vergelijken.`;
  }
  const rate = crime.per1000;
  const rel = rate < 30 ? 'flink onder' : rate < 60 ? 'rond' : rate < 100 ? 'boven' : 'ver boven';
  return `De politie registreerde ${crime.total} misdrijven in een jaar in ${buurt.name}, `
    + `oftewel ${fmtNum(rate, 0)} per 1.000 inwoners. Dat ligt ${rel} het landelijk gemiddelde van ongeveer 45.`;
}

function gezondheidExplain(gezondheid) {
  if (!gezondheid) return 'Voor deze plek zijn geen gezondheidsgegevens beschikbaar.';
  const { monitor, causes } = gezondheid;
  const parts = [];
  if (monitor?.goodHealth != null) {
    const diff = monitor.goodHealth - 74;
    const rel = diff > 3 ? 'meer dan' : diff < -3 ? 'minder dan' : 'ongeveer evenveel als';
    parts.push(`${fmtNum(monitor.goodHealth, 0)}% van deze buurt voelt zich gezond, ${rel} landelijk (74%).`);
  }
  if (causes?.cancer != null && causes.cancerNl != null) {
    parts.push(causes.cancer - causes.cancerNl > 0.03
      ? `Het aandeel kanker in de sterfte (${fmtPct(causes.cancer)}) ligt duidelijk boven landelijk (${fmtPct(causes.cancerNl)}); dat kan met de omgeving te maken hebben.`
      : `Het aandeel kanker in de sterfte (${fmtPct(causes.cancer)}) wijkt niet opvallend af van landelijk (${fmtPct(causes.cancerNl)}).`);
  }
  return parts.join(' ') || 'Voor deze plek zijn geen gezondheidsgegevens beschikbaar.';
}

function omgevingExplain({ flood, nuclear, industry, military, powerline, external }) {
  const parts = [];
  if (external?.found) {
    parts.push(external.inside
      ? `Je woont binnen de risicocontour van ${external.name}: daar is de kans om te overlijden bij een ongeval met gevaarlijke stoffen hoger dan de wettelijke norm.`
      : `De dichtstbijzijnde risicocontour voor gevaarlijke stoffen ligt op ${fmtNum(external.meters, 0)} m, dus je woont er ruim buiten.`);
  }
  if (flood) {
    parts.push(flood.class === 1
      ? 'Overstromen doet dit gebied volgens de kaarten niet.'
      : `De kans op een overstroming is hier ${flood.label}.`);
  }
  if (nuclear) parts.push(`De dichtstbijzijnde kerninstallatie is ${nuclear.name}, op ${fmtNum(nuclear.km, 0)} km.`);
  if (military) {
    parts.push(`Het dichtstbijzijnde militaire complex is ${military.name} op ${fmtNum(military.km, 0)} km`
      + (military.km < 15 ? ', in een conflict een mogelijk doelwit.' : '.'));
  }
  if (powerline?.found) {
    parts.push(powerline.inZone
      ? `Je zit binnen de magneetveldzone van een ${powerline.voltage} hoogspanningslijn (${fmtNum(powerline.meters, 0)} m); RIVM adviseert daar langdurige blootstelling van kinderen te beperken.`
      : `Er loopt een ${powerline.voltage} hoogspanningslijn op ${fmtNum(powerline.meters, 0)} m, ruim buiten de magneetveldzone.`);
  }
  if (industry && !industry.belowFloor) parts.push(`Zware industrie is hier hoorbaar (${Math.round(industry.db)} dB).`);
  return parts.join(' ') || 'Voor deze plek zijn geen omgevingsgegevens beschikbaar.';
}

// Zet de conclusiezin. Is het een object met een kwaliteitswoord (bijv.
// "schoon", "stil", "lawaaiig"), dan kleurt dat woord mee met de scorekleur.
function renderMainText(el, main, score) {
  el.textContent = '';
  if (!main || typeof main === 'string' || !main.label) {
    el.textContent = typeof main === 'string' ? main : (main?.text ?? '');
    return;
  }
  const idx = main.text.lastIndexOf(main.label);
  if (idx === -1) { el.textContent = main.text; return; }
  el.append(document.createTextNode(main.text.slice(0, idx)));
  const span = document.createElement('span');
  span.className = 'quality';
  span.textContent = main.label;
  if (score != null) span.style.color = scoreColor(score);
  el.append(span, document.createTextNode(main.text.slice(idx + main.label.length)));
}

function renderCard(sel, score, main, explain, details) {
  const card = $(sel);
  const badge = $('[data-score]', card);
  if (score == null) {
    badge.textContent = 'geen data';
    badge.style.background = 'var(--muted)';
  } else {
    badge.textContent = fmtNum(score);
    badge.style.background = scoreColor(score);
  }
  renderMainText($('[data-main]', card), main, score);
  $('[data-explain]', card).textContent = explain;
  const list = $('[data-details]', card);
  list.innerHTML = '';
  for (const [label, value, meter] of details) {
    const li = document.createElement('li');
    const top = document.createElement('div');
    top.className = 'row-top';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    top.append(l, v);
    li.append(top);
    if (meter) {
      const bar = document.createElement('div');
      bar.className = 'meter';
      const fill = document.createElement('i');
      fill.style.width = `${meter.pct}%`;
      fill.style.background = meter.color;
      bar.append(fill);
      li.append(bar);
    }
    list.append(li);
  }
}

// ---------- Status ----------

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
  statusEl.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
}

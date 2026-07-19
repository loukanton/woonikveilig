// Snapshot builder for the programmatic-SEO data layer (see SEO-PLAN.md, fase 1).
//
// Runs OFFLINE, locally, on Node 18+. NOT part of the site and NOT deployed
// (tools/ is in .assetsignore). Pulls the bulk-available open data and writes
// static JSON to ../data/, which ships as a static asset and is at the same
// time the public API v0.
//
// The leefscore itself is never computed here; this only assembles the raw
// data blocks (demografie, veiligheid met trend, gezondheid met trend, plus a
// selection of CBS kerncijfers). Pages render text from these blocks later.
//
// Usage:
//   node tools/build-data.mjs                 # full national build (resumable)
//   node tools/build-data.mjs --province Utrecht
//   node tools/build-data.mjs --gemeente GM0344
//   node tools/build-data.mjs --limit 5       # first N gemeenten (smoke test)
//   node tools/build-data.mjs --force         # rebuild even if the file exists
//
// Resumable: per-gemeente files are skipped when they already exist (unless
// --force). Re-running after an interruption continues where it stopped.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

// ---------- config ----------
const SCHEMA_VERSION = 1;
const PEILDATUM = '2026-07-19';            // stamp on every file
const CBS = 'https://opendata.cbs.nl/ODataApi/odata';
const DERDEN = 'https://dataderden.cbs.nl/ODataApi/odata';
const T = {
  areas: `${CBS}/85755NED`,     // Gebieden in Nederland 2024 (gemeente -> provincie)
  kern: `${CBS}/85984NED`,      // Kerncijfers wijken en buurten 2024
  crime: `${DERDEN}/47022NED`,  // geregistreerde misdrijven per buurt per maand
  health: `${DERDEN}/50150NED`, // RIVM Gezondheidsmonitor per buurt
  mortality: `${CBS}/70072ned`, // sterfte per gemeente
  causes: `${CBS}/80142ned`,    // doodsoorzaken per gemeente
};
const CRIME_TREND_YEARS = 5;    // aantal jaren voor de misdaadtrend
// Buurten onder deze grens krijgen geen eigen (indexeerbare) pagina: CBS
// onderdrukt daar veel cijfers en één incident vertekent het beeld.
const BUURT_MIN_RESIDENTS = 200;
const HEALTH_YEARS = ['2012JJ00', '2016JJ00', '2020JJ00', '2022JJ00', '2024JJ00'];
const CONCURRENCY = 3;          // gelijktijdige gemeente-builds (bronservers sparen)
const RETRIES = 4;

// Selection of 85984NED kerncijfers we keep (raw material for unique text).
// key = CBS veldnaam, out = onze veldnaam. Missing/negative -> null.
const KERN_FIELDS = {
  AantalInwoners_5: 'inwoners',
  k_65JaarOfOuder_12: 'inwoners65plus',
  k_0Tot15Jaar_8: 'inwoners0tot15',
  Bevolkingsdichtheid_34: 'dichtheid',
  GemiddeldeHuishoudensgrootte_33: 'huishoudensgrootte',
  HuishoudensTotaal_29: 'huishoudens',
  GemiddeldeWOZWaardeVanWoningen_39: 'wozWaarde',       // x1000 euro
  Koopwoningen_47: 'koopwoningen',
  PercentageEengezinswoning_40: 'eengezinswoning',
  GemiddeldInkomenPerInwoner_78: 'inkomenPerInwoner',   // x1000 euro
  MateVanStedelijkheid_120: 'stedelijkheid',            // 1 (zeer sterk) .. 5 (niet)
  Omgevingsadressendichtheid_121: 'adressendichtheid',
  OppervlakteLand_116: 'oppervlakteLandHa',
  AfstandTotHuisartsenpraktijk_110: 'afstandHuisarts',
  AfstandTotGroteSupermarkt_111: 'afstandSupermarkt',
  AfstandTotSchool_113: 'afstandSchool',
  ScholenBinnen3Km_114: 'scholenBinnen3km',
  MeestVoorkomendePostcode_118: 'postcode', // PC4; string, '.' = onbekend
};

const STEDELIJKHEID_LABELS = {
  1: 'zeer sterk stedelijk',
  2: 'sterk stedelijk',
  3: 'matig stedelijk',
  4: 'weinig stedelijk',
  5: 'niet stedelijk',
};

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const has = (name) => args.includes(name);
const OPT = {
  province: flag('--province'),
  gemeente: flag('--gemeente'),
  limit: flag('--limit') ? Number(flag('--limit')) : null,
  force: has('--force'),
  // Bestaande gemeentebestanden opnieuw verwerken (dedup slugs, afgeleide
  // bestanden herbouwen) zonder de bron-API's opnieuw te bevragen.
  reprocess: has('--reprocess'),
};

// ---------- helpers ----------
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = RETRIES) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === tries) throw new Error(`fetch faalde na ${tries} pogingen: ${url}\n  ${err.message}`);
      await sleep(500 * attempt * attempt); // 0.5s, 2s, 4.5s
    }
  }
}

// OData pagineert op 10.000 rijen; volg de @odata.nextLink / odata.nextLink.
async function fetchAll(url) {
  let rows = [];
  let next = url;
  while (next) {
    const json = await fetchJson(next);
    rows = rows.concat(json.value ?? []);
    next = json['@odata.nextLink'] || json['odata.nextLink'] || null;
  }
  return rows;
}

const trim = (s) => (typeof s === 'string' ? s.trim() : s);
const pos = (v) => (typeof v === 'number' && v > 0 ? v : null); // CBS: negatief = geheim/onbekend
const num = (v) => (typeof v === 'number' ? v : (v == null ? null : Number(v)));

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accenten weg
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Laatste N kalenderjaren aan maandperioden (t/m het meest recente hele jaar
// dat de crime-tabel biedt), als CBS-Perioden-keys ('2024MM01' ...).
function recentCrimePeriods(availableMonths) {
  const years = [...new Set(availableMonths.map((p) => p.slice(0, 4)))].sort();
  // Alleen jaren met 12 maanden meenemen voor eerlijke jaartotalen.
  const complete = years.filter((y) => availableMonths.filter((p) => p.startsWith(y)).length === 12);
  const keep = complete.slice(-CRIME_TREND_YEARS);
  return { years: keep, periods: availableMonths.filter((p) => keep.includes(p.slice(0, 4))) };
}

// ---------- main ----------
async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(join(DATA_DIR, 'gemeente'), { recursive: true });
  await mkdir(join(DATA_DIR, 'provincie'), { recursive: true });

  log('1/5  Gebiedsindeling ophalen (gemeente -> provincie)…');
  const areaRows = await fetchAll(
    `${T.areas}/TypedDataSet?$filter=${encodeURIComponent("startswith(RegioS,'GM')")}`
    + '&$select=RegioS,Naam_2,Code_28,Naam_29&$format=json',
  );
  let gemeenten = areaRows.map((r) => ({
    code: trim(r.RegioS),
    name: trim(r.Naam_2),
    provinceName: trim(r.Naam_29),
    provinceCode: trim(r.Code_28),
  })).filter((g) => g.provinceName);
  log(`     ${gemeenten.length} gemeenten in ${new Set(gemeenten.map((g) => g.provinceName)).size} provincies`);

  // filters
  if (OPT.province) gemeenten = gemeenten.filter((g) => slugify(g.provinceName) === slugify(OPT.province));
  if (OPT.gemeente) gemeenten = gemeenten.filter((g) => g.code === OPT.gemeente);
  if (OPT.limit) gemeenten = gemeenten.slice(0, OPT.limit);
  if (!gemeenten.length) { log('Geen gemeenten na filter; stop.'); return; }

  log('2/5  Landelijke referentiewaarden ophalen…');
  const nl = await buildNational();
  await writeJson(join(DATA_DIR, 'nl.json'), nl);

  log(`3/5  ${gemeenten.length} gemeenten doorrekenen (concurrency ${CONCURRENCY})…`);
  const crimeMonths = await fetchAll(`${T.crime}/Perioden?$select=Key&$format=json`)
    .then((rows) => rows.map((r) => trim(r.Key)).filter((k) => k.includes('MM')));
  const crimeWindow = recentCrimePeriods(crimeMonths);
  log(`     misdaadtrend over jaren: ${crimeWindow.years.join(', ')}`);

  const built = [];   // summaries voor index + provincie-aggregatie
  let done = 0;
  for (let i = 0; i < gemeenten.length; i += CONCURRENCY) {
    const batch = gemeenten.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((g) => buildGemeente(g, crimeWindow, nl)));
    built.push(...results.filter(Boolean));
    done += batch.length;
    log(`     ${done}/${gemeenten.length}`);
  }

  log('4/5  Provinciebestanden schrijven…');
  const provinces = await buildProvinces(built);

  log('5/5  Index schrijven…');
  await buildIndex(built, provinces, nl);

  log(`Klaar. Data in ${DATA_DIR}`);
}

// ---------- national reference ----------
async function buildNational() {
  const [kernRows, healthRows] = await Promise.all([
    fetchAll(`${T.kern}/TypedDataSet?$filter=${encodeURIComponent("WijkenEnBuurten eq 'NL00      '")}`
      + `&$select=WijkenEnBuurten,${Object.keys(KERN_FIELDS).join(',')}&$format=json`),
    fetchAll(`${T.health}/TypedDataSet?$filter=${encodeURIComponent("startswith(WijkenEnBuurten,'NL01') and Leeftijd eq '20300' and Marges eq 'MW00000'")}`
      + '&$select=Perioden,GoedErvarenGezondheid_4,EenOfMeerLangdurigeAandoeningen_5&$format=json'),
  ]);
  const kern = pickKern(kernRows[0]);
  // Landelijke misdaad per 1.000: som van alle GM-buurten is duur; we gebruiken
  // de bekende referentie uit de methode (~45) niet hard, maar rekenen 'm uit
  // de gemeente-aggregatie achteraf. Hier alleen gezondheid + demografie.
  const healthByYear = {};
  for (const r of healthRows) {
    const y = trim(r.Perioden).slice(0, 4);
    if (r.GoedErvarenGezondheid_4 != null) {
      healthByYear[y] = { goedErvarenGezondheid: num(r.GoedErvarenGezondheid_4), langdurigeAandoening: num(r.EenOfMeerLangdurigeAandoeningen_5) };
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    type: 'land',
    code: 'NL00',
    name: 'Nederland',
    slug: 'nederland',
    demografie: kern,
    gezondheid: {
      goedErvarenGezondheid: healthByYear['2024']?.goedErvarenGezondheid ?? null,
      langdurigeAandoening: healthByYear['2024']?.langdurigeAandoening ?? null,
      trend: healthByYear,
      bron: 'RIVM Gezondheidsmonitor (tabel 50150NED)',
    },
    // veiligheid.per1000 wordt in buildIndex ingevuld uit de aggregatie
    veiligheid: { per1000: null, bron: 'Politie via CBS (tabel 47022NED)' },
  };
}

function pickKern(row) {
  if (!row) return {};
  const out = {};
  for (const [key, name] of Object.entries(KERN_FIELDS)) {
    const raw = row[key];
    if (name === 'postcode') {
      const pc = trim(raw);
      out.postcode = pc && pc !== '.' ? pc : null;
    } else if (name === 'stedelijkheid') {
      out.stedelijkheid = num(raw) ?? null;
    } else {
      out[name] = pos(num(raw));
    }
  }
  if (out.stedelijkheid != null) out.stedelijkheidLabel = STEDELIJKHEID_LABELS[out.stedelijkheid] ?? null;
  if (out.oppervlakteLandHa != null) out.oppervlakteLandKm2 = Math.round(out.oppervlakteLandHa / 100 * 10) / 10;
  return out;
}

// ---------- per gemeente ----------
async function buildGemeente(g, crimeWindow, nl) {
  const file = join(DATA_DIR, 'gemeente', `${g.code}.json`);
  if (!OPT.force && existsSync(file)) {
    // Resumable: lees de summary terug voor de index/provincie-aggregatie.
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      if (OPT.reprocess) {
        // Transformaties opnieuw toepassen op de cache, zonder de API's te
        // bevragen (dedup slugs), en het bestand terugschrijven.
        dedupeSlugs(cached.buurten || []);
        await writeJson(file, cached);
      }
      return summarize(cached);
    } catch { /* corrupt: opnieuw bouwen */ }
  }

  const digits = g.code.slice(2); // '0344'
  const kernFilter = `startswith(WijkenEnBuurten,'GM${digits}') or startswith(WijkenEnBuurten,'WK${digits}') or startswith(WijkenEnBuurten,'BU${digits}')`;
  const healthFilter = `startswith(WijkenEnBuurten,'BU${digits}') and Leeftijd eq '20300' and Marges eq 'MW00000'`;

  let kernRows, crimeRows, healthRows, gmHealthRows, mortality, causes;
  try {
    [kernRows, crimeRows, healthRows, gmHealthRows, mortality, causes] = await Promise.all([
      fetchAll(`${T.kern}/TypedDataSet?$filter=${encodeURIComponent(kernFilter)}`
        + `&$select=WijkenEnBuurten,Gemeentenaam_1,SoortRegio_2,${Object.keys(KERN_FIELDS).join(',')}&$format=json`),
      // Crime per jaar apart ophalen: één reuzenquery met 60 Perioden-clausules
      // laat de CBS-server bij grote gemeenten (Amsterdam) met HTTP 500 vallen.
      fetchCrimeYears(digits, crimeWindow.years),
      fetchAll(`${T.health}/TypedDataSet?$filter=${encodeURIComponent(healthFilter)}`
        + '&$select=WijkenEnBuurten,Perioden,GoedErvarenGezondheid_4,EenOfMeerLangdurigeAandoeningen_5&$format=json'),
      fetchAll(`${T.health}/TypedDataSet?$filter=${encodeURIComponent(`startswith(WijkenEnBuurten,'GM${digits}') and Leeftijd eq '20300' and Marges eq 'MW00000'`)}`
        + '&$select=Perioden,GoedErvarenGezondheid_4,EenOfMeerLangdurigeAandoeningen_5&$format=json'),
      fetchMortality(g.code),
      fetchDeathCauses(g.code),
    ]);
  } catch (err) {
    log(`     ! ${g.code} ${g.name} overgeslagen: ${err.message}`);
    return null;
  }

  // kerncijfers indexeren op code
  const kernByCode = new Map();
  const nameByCode = new Map();
  const typeByCode = new Map();
  for (const r of kernRows) {
    const code = trim(r.WijkenEnBuurten);
    kernByCode.set(code, pickKern(r));
    typeByCode.set(code, soortToType(trim(r.SoortRegio_2)));
  }

  // namen komen uit de metadata (Title); haal ze voor deze gemeente op
  const meta = await fetchAll(`${T.kern}/WijkenEnBuurten?$filter=${encodeURIComponent(
    `startswith(Key,'GM${digits}') or startswith(Key,'WK${digits}') or startswith(Key,'BU${digits}')`,
  )}&$select=Key,Title,Municipality,DetailRegionCode&$format=json`);
  for (const m of meta) nameByCode.set(trim(m.Key), trim(m.Title));

  // crime: som per buurt per jaar
  const crimeByBuurt = aggregateCrime(crimeRows, crimeWindow.years);
  // health: per buurt per jaar
  const healthByBuurt = aggregateHealth(healthRows);

  // wijk -> welke buurten (uit de codestructuur: BU + 6 = wijkdeel)
  const buurten = [];
  const wijken = [];
  for (const [code, kern] of kernByCode) {
    const type = typeByCode.get(code);
    if (type === 'gemeente') continue;
    const entity = {
      code,
      type,
      name: nameByCode.get(code) ?? code,
      slug: slugify(nameByCode.get(code) ?? code),
      wijkCode: type === 'buurt' ? `WK${code.slice(2, 10)}` : undefined,
      demografie: kern,
    };
    if (type === 'buurt') {
      const cr = crimeByBuurt.get(code);
      entity.veiligheid = cr ? {
        per1000: kern.inwoners ? Math.round((cr.laatste12 / kern.inwoners) * 1000 * 10) / 10 : null,
        laatste12Maanden: cr.laatste12,
        trend: cr.perJaar,
        bron: 'Politie via CBS (tabel 47022NED)',
      } : null;
      const he = healthByBuurt.get(code);
      entity.gezondheid = he ? {
        goedErvarenGezondheid: he.laatste,
        trend: he.perJaar,
        bron: 'RIVM Gezondheidsmonitor (tabel 50150NED)',
      } : null;
      buurten.push(entity);
    } else {
      wijken.push(entity);
    }
  }

  dedupeSlugs(buurten);
  const gmKern = pickKern(kernRows.find((r) => trim(r.WijkenEnBuurten) === g.code));
  // Voorbeeldpostcode: PC4 van de grootste buurt (gemeente-rij heeft er geen).
  const voorbeeldPostcode = buurten
    .filter((b) => b.demografie?.postcode)
    .sort((a, b) => (b.demografie.inwoners || 0) - (a.demografie.inwoners || 0))[0]?.demografie.postcode ?? null;
  const gmHealth = aggregateHealth(gmHealthRows.map((r) => ({ ...r, WijkenEnBuurten: g.code }))).get(g.code);
  // Gemeente-misdaad rechtstreeks uit de ruwe politierijen optellen, niet via de
  // gekoppelde buurten. Bij sommige gemeenten (bijv. Best) verschilt de
  // buurtindeling tussen de politietabel en de kerncijfertabel, waardoor de
  // per-buurt-koppeling faalt; het gemeentetotaal blijft dan wel correct.
  const gmCrime = aggregateGemeenteCrime(crimeRows);
  const gmCrimePer1000 = (gmCrime.total != null && gmKern.inwoners)
    ? Math.round((gmCrime.total / gmKern.inwoners) * 1000 * 10) / 10 : null;

  const record = {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    type: 'gemeente',
    code: g.code,
    name: g.name,
    slug: slugify(g.name),
    provincie: { code: g.provinceCode, name: g.provinceName, slug: slugify(g.provinceName) },
    voorbeeldPostcode,
    demografie: gmKern,
    veiligheid: {
      per1000: gmCrimePer1000,
      laatste12Maanden: gmCrime.total ?? 0,
      trend: gmCrime.perJaar,
      bron: 'Politie via CBS (tabel 47022NED)',
    },
    gezondheid: {
      goedErvarenGezondheid: gmHealth?.laatste ?? null,
      trend: gmHealth?.perJaar ?? {},
      bron: 'RIVM Gezondheidsmonitor (tabel 50150NED)',
    },
    sterfte: mortality,
    doodsoorzaken: causes,
    bronnen: {
      kerncijfers: 'CBS Kerncijfers wijken en buurten 2024 (tabel 85984NED)',
      gebiedsindeling: 'CBS Gebieden in Nederland 2024 (tabel 85755NED)',
    },
    wijken: wijken.sort((a, b) => a.name.localeCompare(b.name)),
    buurten: buurten.sort((a, b) => a.name.localeCompare(b.name)),
  };

  await writeJson(file, record);
  return summarize(record);
}

// Sommige gemeenten hebben meerdere buurten met dezelfde naam (bijv. twee
// "Centrum" in verschillende wijken, of meerdere "Verspreide huizen"). Maak de
// slugs uniek binnen de gemeente met een codesuffix, deterministisch en stabiel
// (niet afhankelijk van volgorde), zodat elke buurt een eigen URL houdt.
function dedupeSlugs(buurten) {
  const count = {};
  for (const b of buurten) count[b.slug] = (count[b.slug] || 0) + 1;
  for (const b of buurten) {
    if (count[b.slug] > 1) b.slug = `${b.slug}-${b.code.slice(-4)}`;
  }
}

function soortToType(soort) {
  const s = (soort || '').toLowerCase();
  if (s.startsWith('gemeente')) return 'gemeente';
  if (s.startsWith('wijk')) return 'wijk';
  if (s.startsWith('buurt')) return 'buurt';
  return 'onbekend';
}

// Crime per kalenderjaar apart ophalen (startswith op Perioden), zodat elke
// response klein blijft en de filter simpel; concat over de jaren.
async function fetchCrimeYears(digits, years) {
  let rows = [];
  for (const y of years) {
    const filter = `startswith(WijkenEnBuurten,'BU${digits}') and startswith(Perioden,'${y}MM') and SoortMisdrijf eq '0.0.0 '`;
    rows = rows.concat(await fetchAll(`${T.crime}/TypedDataSet?$filter=${encodeURIComponent(filter)}`
      + '&$select=WijkenEnBuurten,Perioden,GeregistreerdeMisdrijven_1&$format=json'));
  }
  return rows;
}

function aggregateCrime(rows, years) {
  const byBuurt = new Map();
  for (const r of rows) {
    const code = trim(r.WijkenEnBuurten);
    const year = trim(r.Perioden).slice(0, 4);
    const val = r.GeregistreerdeMisdrijven_1 ?? 0;
    if (!byBuurt.has(code)) byBuurt.set(code, { perJaar: {}, months: {} });
    const b = byBuurt.get(code);
    b.perJaar[year] = (b.perJaar[year] ?? 0) + val;
    b.months[trim(r.Perioden)] = val;
  }
  // laatste12 = som van de 12 recentste maanden
  for (const b of byBuurt.values()) {
    const recent = Object.keys(b.months).sort().slice(-12);
    b.laatste12 = recent.reduce((s, m) => s + b.months[m], 0);
    delete b.months;
  }
  return byBuurt;
}

// Gemeentetotaal uit de ruwe politierijen: som over alle buurtcodes per maand
// en per jaar. Robuust tegen buurtcode-mismatch (de politietabel en de
// kerncijfertabel gebruiken bij sommige gemeenten een andere buurtindeling).
// total = som van de 12 recentste maanden; null als er geen enkele rij is.
function aggregateGemeenteCrime(rows) {
  if (!rows.length) return { total: null, perJaar: {} };
  const monthly = {}, perJaar = {};
  for (const r of rows) {
    const p = trim(r.Perioden), y = p.slice(0, 4), v = r.GeregistreerdeMisdrijven_1 ?? 0;
    monthly[p] = (monthly[p] ?? 0) + v;
    perJaar[y] = (perJaar[y] ?? 0) + v;
  }
  const recent = Object.keys(monthly).sort().slice(-12);
  const total = recent.reduce((s, p) => s + monthly[p], 0);
  return { total, perJaar };
}

function aggregateHealth(rows) {
  const byCode = new Map();
  for (const r of rows) {
    if (r.GoedErvarenGezondheid_4 == null) continue;
    const code = trim(r.WijkenEnBuurten);
    const year = trim(r.Perioden).slice(0, 4);
    if (!byCode.has(code)) byCode.set(code, { perJaar: {} });
    byCode.get(code).perJaar[year] = num(r.GoedErvarenGezondheid_4);
  }
  for (const v of byCode.values()) {
    const years = Object.keys(v.perJaar).sort();
    v.laatste = years.length ? v.perJaar[years.at(-1)] : null;
  }
  return byCode;
}

async function fetchMortality(gmCode) {
  try {
    const rows = await fetchAll(`${T.mortality}/TypedDataSet?$filter=${encodeURIComponent(`RegioS eq '${gmCode}'`)}`
      + '&$select=Perioden,OverledenenRelatief_61&$format=json');
    const last = rows.filter((r) => r.OverledenenRelatief_61 != null)
      .sort((a, b) => trim(a.Perioden).localeCompare(trim(b.Perioden))).at(-1);
    return last ? { perMille: num(last.OverledenenRelatief_61), jaar: trim(last.Perioden).slice(0, 4) } : null;
  } catch { return null; }
}

async function fetchDeathCauses(gmCode) {
  try {
    const rows = await fetchAll(`${T.causes}/TypedDataSet?$filter=${encodeURIComponent(`RegioS eq '${gmCode}' or RegioS eq 'NL01  '`)}&$format=json`);
    const share = (r, f) => (r && r.TotaalAlleOnderliggendeDoodsoorzaken_1 > 0 ? r[f] / r.TotaalAlleOnderliggendeDoodsoorzaken_1 : null);
    const local = rows.filter((r) => trim(r.RegioS).startsWith('GM') && r.TotaalAlleOnderliggendeDoodsoorzaken_1 != null)
      .sort((a, b) => trim(a.Perioden).localeCompare(trim(b.Perioden))).at(-1);
    if (!local) return null;
    const nl = rows.find((r) => trim(r.RegioS).startsWith('NL') && r.Perioden === local.Perioden);
    return {
      jaar: trim(local.Perioden).slice(0, 4),
      kanker: round3(share(local, 'Nieuwvormingen_2')),
      kankerNl: round3(share(nl, 'Nieuwvormingen_2')),
      ademhaling: round3(share(local, 'ZiektenVanAdemhalingsstelsel_4')),
      ademhalingNl: round3(share(nl, 'ZiektenVanAdemhalingsstelsel_4')),
    };
  } catch { return null; }
}

const round3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

// Kleine samenvatting per gemeente voor index + provincie-aggregatie.
function summarize(record) {
  // Betrouwbaarheid van de buurt-koppeling: als de som van de buurtmisdrijven
  // ver onder het (uit de ruwe rijen berekende) gemeentetotaal ligt, gebruiken
  // de politie- en kerncijfertabel een andere buurtindeling en zijn de
  // buurt-per1000's te laag. Die buurten horen niet in de landelijke ranglijst.
  const gmTotal = record.veiligheid?.laatste12Maanden || 0;
  const sumBuurt = (record.buurten ?? []).reduce((s, b) => s + (b.veiligheid?.laatste12Maanden || 0), 0);
  const buurtCrimeBetrouwbaar = gmTotal > 0 ? sumBuurt >= gmTotal * 0.9 : true;
  return {
    code: record.code,
    name: record.name,
    slug: record.slug,
    provincie: record.provincie,
    inwoners: record.demografie?.inwoners ?? null,
    veiligheidPer1000: record.veiligheid?.per1000 ?? null,
    goedErvarenGezondheid: record.gezondheid?.goedErvarenGezondheid ?? null,
    aantalBuurten: record.buurten?.length ?? 0,
    aantalWijken: record.wijken?.length ?? 0,
    buurtCrimeBetrouwbaar,
    buurten: (record.buurten ?? []).map((b) => ({
      code: b.code, name: b.name, slug: b.slug,
      inwoners: b.demografie?.inwoners ?? null,
      per1000: b.veiligheid?.per1000 ?? null,
    })),
  };
}

// ---------- provincies ----------
async function buildProvinces(built) {
  const byProv = new Map();
  for (const g of built) {
    const p = g.provincie;
    if (!p) continue;
    if (!byProv.has(p.slug)) byProv.set(p.slug, { code: p.code, name: p.name, slug: p.slug, gemeenten: [] });
    byProv.get(p.slug).gemeenten.push(g);
  }
  const provinces = [];
  for (const prov of byProv.values()) {
    const inwoners = sum(prov.gemeenten.map((g) => g.inwoners));
    const record = {
      schemaVersion: SCHEMA_VERSION,
      peildatum: PEILDATUM,
      type: 'provincie',
      code: prov.code,
      name: prov.name,
      slug: prov.slug,
      demografie: { inwoners },
      veiligheid: { per1000: weightedAvg(prov.gemeenten, 'veiligheidPer1000', 'inwoners'), bron: 'Politie via CBS (tabel 47022NED)' },
      gezondheid: { goedErvarenGezondheid: weightedAvg(prov.gemeenten, 'goedErvarenGezondheid', 'inwoners'), bron: 'RIVM Gezondheidsmonitor (tabel 50150NED)' },
      aantalGemeenten: prov.gemeenten.length,
      gemeenten: prov.gemeenten
        .map((g) => ({ code: g.code, name: g.name, slug: g.slug, inwoners: g.inwoners, veiligheidPer1000: g.veiligheidPer1000, goedErvarenGezondheid: g.goedErvarenGezondheid }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    await writeJson(join(DATA_DIR, 'provincie', `${prov.slug}.json`), record);
    provinces.push({
      code: prov.code, name: prov.name, slug: prov.slug, inwoners,
      aantalGemeenten: prov.gemeenten.length,
      veiligheidPer1000: record.veiligheid.per1000,
      goedErvarenGezondheid: record.gezondheid.goedErvarenGezondheid,
    });
  }
  return provinces.sort((a, b) => a.name.localeCompare(b.name));
}

const sum = (arr) => arr.reduce((s, v) => s + (v ?? 0), 0);
function weightedAvg(items, valKey, wKey) {
  let ws = 0, s = 0;
  for (const it of items) {
    const v = it[valKey], w = it[wKey];
    if (v == null || !w) continue;
    s += v * w; ws += w;
  }
  return ws ? Math.round((s / ws) * 10) / 10 : null;
}

// ---------- index ----------
async function buildIndex(built, provinces, nl) {
  const entities = [];
  entities.push({ type: 'land', code: 'NL00', name: 'Nederland', slug: 'nederland' });
  for (const p of provinces) entities.push({ type: 'provincie', code: p.code, name: p.name, slug: p.slug });
  for (const g of built) {
    entities.push({ type: 'gemeente', code: g.code, name: g.name, slug: g.slug, provincie: g.provincie.slug });
    for (const b of g.buurten) entities.push({ type: 'buurt', code: b.code, name: b.name, slug: b.slug, gemeente: g.code, inwoners: b.inwoners });
  }

  // Landelijke misdaad per 1.000 uit de aggregatie. Alleen bij een volledige
  // run: bij een deel-run (--province/--gemeente/--limit) zou dit de landelijke
  // referentie met een deelverzameling overschrijven.
  const fullRun = !OPT.province && !OPT.gemeente && !OPT.limit;
  const nlCrime = weightedAvg(built, 'veiligheidPer1000', 'inwoners');
  if (fullRun && nlCrime != null) {
    nl.veiligheid.per1000 = nlCrime;
    await writeJson(join(DATA_DIR, 'nl.json'), nl);
  }

  await writeJson(join(DATA_DIR, 'index.json'), {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    aantal: { provincies: provinces.length, gemeenten: built.length, buurten: entities.filter((e) => e.type === 'buurt').length },
    provincies: provinces,
    entities,
  });

  // Compacte lookups die de paginafuncties gebruiken om een slug op te lossen
  // zonder de volledige index (met alle buurten) te laden.
  await writeJson(join(DATA_DIR, 'gemeenten.json'), {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    gemeenten: built
      .map((g) => ({
        code: g.code, slug: g.slug, name: g.name,
        provincie: g.provincie.slug, provincieNaam: g.provincie.name,
        inwoners: g.inwoners,
        veiligheidPer1000: g.veiligheidPer1000,
        goedErvarenGezondheid: g.goedErvarenGezondheid,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  await writeJson(join(DATA_DIR, 'provincies.json'), {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    provincies: provinces,
  });

  // Buurten die de kwaliteitsdrempel halen (>=200 inwoners en een misdaadcijfer):
  // alleen die krijgen een indexeerbare pagina en staan in de sitemap. Compact
  // ({g:gemeenteslug, s:buurtslug}) zodat de sitemap-functie één klein bestand
  // leest in plaats van alle gemeentebestanden.
  const buurten = [];
  for (const g of built) {
    for (const b of (g.buurten || [])) {
      if ((b.inwoners || 0) >= BUURT_MIN_RESIDENTS && b.per1000 != null) {
        buurten.push({ g: g.slug, s: b.slug });
      }
    }
  }
  await writeJson(join(DATA_DIR, 'buurten.json'), {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    buurten,
  });

  // Vooraf berekende ranglijst voor het jaarlijkse onderzoek: de veiligste
  // buurten van Nederland. Minimaal 1.000 inwoners zodat het om substantiële
  // buurten gaat (kleine buurten schommelen te sterk voor een landelijke lijst).
  const nationaalBuurten = [];
  for (const g of built) {
    if (!g.buurtCrimeBetrouwbaar) continue; // buurtindeling wijkt af, per1000 te laag
    for (const b of (g.buurten || [])) {
      if ((b.inwoners || 0) >= 1000 && b.per1000 != null) {
        nationaalBuurten.push({
          buurt: b.name, buurtSlug: b.slug,
          gemeente: g.name, gemeenteSlug: g.slug,
          provincie: g.provincie.name, provincieSlug: g.provincie.slug,
          inwoners: b.inwoners, per1000: b.per1000,
        });
      }
    }
  }
  nationaalBuurten.sort((a, b) => a.per1000 - b.per1000);
  await writeJson(join(DATA_DIR, 'onderzoek-buurten.json'), {
    schemaVersion: SCHEMA_VERSION,
    peildatum: PEILDATUM,
    minInwoners: 1000,
    aantalMeegenomen: nationaalBuurten.length,
    veiligste: nationaalBuurten.slice(0, 100),
  });
}

async function writeJson(path, obj) {
  await writeFile(path, JSON.stringify(obj), 'utf8');
}

main().catch((err) => { console.error(err); process.exit(1); });

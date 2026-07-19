// Geometry builder for the visual maps (province + gemeente choropleth).
// Runs OFFLINE (Node 18+), NOT deployed (tools/ in .assetsignore). Fetches
// boundary geometry from PDOK in RD (EPSG:28992), simplifies it (Douglas-
// Peucker, tolerance in meters) and projects it to SVG paths in a shared
// viewBox, so the province and gemeente maps line up. Writes:
//   data/geo-provincies.json  { viewBox, features: [{slug, naam, d}] }
//   data/geo-gemeenten.json   { viewBox, features: [{slug, code, naam, provincie, d}] }
//
// Usage: node tools/build-geo.mjs            (both)
//        node tools/build-geo.mjs --provincies-only
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
// CBS gebiedsindelingen: de "gegeneraliseerde" lagen zijn op de kustlijn
// geknipt (land only), dus IJsselmeer, Waddenzee en de Zeeuwse delta blijven
// open water. De bestuurlijke-gebieden-laag rekent water mee en maakt van NL
// een blok; die gebruiken we daarom NIET.
const GEB_WFS = 'https://service.pdok.nl/cbs/gebiedsindelingen/2024/wfs/v1_0';
const TARGET_W = 1000; // viewBox breedte in SVG-eenheden

const args = process.argv.slice(2);
const provinciesOnly = args.includes('--provincies-only');

function slugify(name) {
  return String(name).toLowerCase().replace(/['’]/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchJson(url, tries = 4) {
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (a === tries) throw err;
      await new Promise((r) => setTimeout(r, 500 * a * a));
    }
  }
}

// Alle features van een WFS-laag ophalen, met paginering.
async function fetchLayer(typeName, propertyName) {
  let features = [];
  let start = 0;
  const count = 1000;
  for (;;) {
    const url = `${GEB_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeName}`
      + `&outputFormat=application/json&srsName=EPSG:28992&count=${count}&startIndex=${start}`
      + (propertyName ? `&propertyName=${propertyName}` : '');
    const json = await fetchJson(url);
    const f = json.features || [];
    features = features.concat(f);
    if (f.length < count) break;
    start += count;
  }
  return features;
}

// Douglas-Peucker vereenvoudiging op [x,y]-punten (meters).
function simplify(points, tol) {
  if (points.length < 3) return points;
  const sqTol = tol * tol;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0, idx = -1;
    const [ax, ay] = points[first], [bx, by] = points[last];
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      const sq = (px - cx) ** 2 + (py - cy) ** 2;
      if (sq > maxSq) { maxSq = sq; idx = i; }
    }
    if (maxSq > sqTol && idx > -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// bbox over alle features (RD-meters)
function computeBbox(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
    } else coords.forEach(walk);
  };
  for (const f of features) walk(f.geometry.coordinates);
  return { minX, minY, maxX, maxY };
}

// Bouw een SVG-pad voor één feature; simplificeert elke ring, projecteert en
// laat te kleine ringen (eilandjes) vallen.
function featureToPath(geometry, tol, project, minAreaSq) {
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const sub = [];
  for (const poly of polys) {
    for (const ring of poly) {
      let pts = ring.map(([x, y]) => [x, y]);
      // ringoppervlak (shoelace) om kleine eilandjes over te slaan
      let area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
      }
      if (Math.abs(area / 2) < minAreaSq) continue;
      pts = simplify(pts, tol);
      if (pts.length < 3) continue;
      const d = pts.map((p, i) => {
        const [sx, sy] = project(p[0], p[1]);
        return `${i === 0 ? 'M' : 'L'}${sx} ${sy}`;
      }).join('') + 'Z';
      sub.push(d);
    }
  }
  return sub.join('');
}

async function build() {
  console.log('Provinciegeometrie ophalen…');
  const provFeatures = await fetchLayer('gebiedsindelingen:provincie_gegeneraliseerd', 'statnaam,statcode');
  // Gedeelde viewBox uit de provincie-bbox (heel NL).
  const bbox = computeBbox(provFeatures);
  const scale = TARGET_W / (bbox.maxX - bbox.minX);
  const H = Math.round((bbox.maxY - bbox.minY) * scale);
  const viewBox = `0 0 ${TARGET_W} ${H}`;
  const project = (x, y) => [
    Math.round((x - bbox.minX) * scale),
    Math.round((bbox.maxY - y) * scale),
  ];

  const provincies = provFeatures.map((f) => ({
    slug: slugify(f.properties.statnaam),
    naam: f.properties.statnaam,
    d: featureToPath(f.geometry, 400, project, 1e6),
  })).sort((a, b) => a.naam.localeCompare(b.naam));
  await writeFile(join(DATA_DIR, 'geo-provincies.json'),
    JSON.stringify({ schemaVersion: 1, viewBox, features: provincies }), 'utf8');
  console.log(`  ${provincies.length} provincies -> geo-provincies.json`);

  if (provinciesOnly) return;

  console.log('Gemeentegeometrie ophalen (kan even duren)…');
  const gemFeatures = await fetchLayer('gebiedsindelingen:gemeente_gegeneraliseerd', 'statnaam,statcode');
  const gemeenten = gemFeatures.map((f) => ({
    slug: slugify(f.properties.statnaam),
    naam: f.properties.statnaam,
    d: featureToPath(f.geometry, 200, project, 5e5),
  })).sort((a, b) => a.naam.localeCompare(b.naam));
  await writeFile(join(DATA_DIR, 'geo-gemeenten.json'),
    JSON.stringify({ schemaVersion: 1, viewBox, features: gemeenten }), 'utf8');
  console.log(`  ${gemeenten.length} gemeenten -> geo-gemeenten.json`);
}

build().catch((e) => { console.error(e); process.exit(1); });

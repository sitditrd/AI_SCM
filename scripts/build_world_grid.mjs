// 세계 육지 도트 그리드 생성기 (2026-08-19 히어로 지도 실데이터화)
// 원천: world.geo.json (johan/world.geo.json — Natural Earth 파생, public domain)
//   https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json
// 실행: node scripts/build_world_grid.mjs <geojson경로>
// 출력: js/data_world.js — 1.1° 격자 육지 비트맵(base64 행 패킹, ~7KB)
// 히어로 캔버스(landing.js)가 이 그리드를 점묘한다 — 수제 폴리곤 대비 실제 해안선.
import fs from 'fs';

const src = process.argv[2];
if (!src) { console.error('usage: node build_world_grid.mjs <countries.geo.json>'); process.exit(1); }
const geo = JSON.parse(fs.readFileSync(src, 'utf8'));

const LNG0 = -180, LNG1 = 180, LAT0 = 75, LAT1 = -56, STEP = 1.1;
const COLS = Math.round((LNG1 - LNG0) / STEP);
const ROWS = Math.round((LAT0 - LAT1) / STEP);

function pipRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(lat, lng, poly) {          // poly = [outer, hole, hole...]
  if (!pipRing(lat, lng, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (pipRing(lat, lng, poly[h])) return false;
  return true;
}

// 성능: 폴리곤별 바운딩박스 선계산
const shapes = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) {
    let minx = 999, maxx = -999, miny = 999, maxy = -999;
    for (const [x, y] of poly[0]) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    shapes.push({ poly, minx, maxx, miny, maxy });
  }
}

const rows = [];
let landCount = 0;
for (let r = 0; r < ROWS; r++) {
  const lat = LAT0 - (r + 0.5) * STEP;
  const bytes = Buffer.alloc(Math.ceil(COLS / 8));
  for (let c = 0; c < COLS; c++) {
    const lng = LNG0 + (c + 0.5) * STEP;
    let land = false;
    for (const s of shapes) {
      if (lng < s.minx || lng > s.maxx || lat < s.miny || lat > s.maxy) continue;
      if (inPolygon(lat, lng, s.poly)) { land = true; break; }
    }
    if (land) { bytes[c >> 3] |= 128 >> (c & 7); landCount++; }
  }
  rows.push(bytes.toString('base64'));
}

const out = `/* 세계 육지 도트 그리드 — scripts/build_world_grid.mjs 로 생성 (원천: Natural Earth 파생 countries.geo.json)
   격자 ${STEP}° · 경도 ${LNG0}..${LNG1} · 위도 ${LAT0}..${LAT1} · 육지 셀 ${landCount}개 */
window.TWL_WORLD = {
  lng0: ${LNG0}, lat0: ${LAT0}, step: ${STEP}, cols: ${COLS}, rows: ${ROWS},
  data: [
${rows.map(r => `    '${r}'`).join(',\n')}
  ]
};
`;
fs.writeFileSync('js/data_world.js', out);
console.log(`OK — ${ROWS}x${COLS} 격자, 육지 ${landCount}셀, js/data_world.js ${(out.length / 1024).toFixed(1)}KB`);

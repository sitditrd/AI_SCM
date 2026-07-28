import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchPorts, slugOf, type Port } from '../lib/ports';
import './RouteView.css';

const ROUTES_BASE = 'https://sitditrd.github.io/AI_SCM/routes';

type SimResult = { p10: number; p50: number; p90: number; min: number; max: number; all: number[] };
function randn() { const u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function simulate(nm: number, meanKn: number): SimResult {
  const N = 10000, days: number[] = new Array(N);
  for (let i = 0; i < N; i++) {
    const kn = Math.min(23, Math.max(11, meanKn + randn() * 1.5));
    const sail = nm / (kn * 24);
    const buffer = Math.min(8, Math.max(0.2, Math.exp(Math.log(1.2) + randn() * 0.5)));
    days[i] = sail + buffer;
  }
  days.sort((a, b) => a - b);
  return { p10: days[N * 0.1 | 0], p50: days[N * 0.5 | 0], p90: days[N * 0.9 | 0], min: days[0], max: days[N - 1], all: days };
}

/* SVG 히스토그램 (레거시 route.js drawHisto 이식)
   cw=컨테이너 실제 px 폭 → viewBox 좌표계를 px로 잡아 텍스트 왜곡 없이 반응형(모바일도 충분한 높이) */
function histoSvg(r: SimResult, cw: number): string {
  const N = r.all.length;
  let lo = Math.max(r.min, r.p10 - 1.6 * (r.p50 - r.p10));
  let hi = Math.min(r.max, r.p90 + 1.6 * (r.p90 - r.p50));
  if (!(hi > lo)) { lo = r.min; hi = r.max; }
  const bins = 34, bw = (hi - lo) / bins, counts = new Array(bins).fill(0);
  r.all.forEach((d) => { if (d < lo || d > hi) return; let b = Math.floor((d - lo) / bw); if (b === bins) b = bins - 1; if (b >= 0 && b < bins) counts[b]++; });
  const mx = Math.max(...counts) || 1;
  const W = Math.max(320, Math.round(cw || 900)), H = Math.max(240, Math.min(360, Math.round(W * 0.42))), padL = 48, padR = 18, padT = 44, padB = 44;
  const x0 = padL, x1 = W - padR, pw = x1 - x0, y0 = padT, y1 = H - padB, ph = y1 - y0;
  const xOf = (day: number) => x0 + (day - lo) / (hi - lo) * pw;
  const yOf = (c: number) => y1 - c / mx * ph;
  const f1 = (n: number) => n.toFixed(1);
  let s = `<svg class="histo-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="도착 소요일 분포"><defs><linearGradient id="histoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="hg0"/><stop offset="1" class="hg1"/></linearGradient></defs>`;
  s += `<rect class="histo-band" x="${f1(xOf(r.p10))}" y="${y0}" width="${f1(xOf(r.p90) - xOf(r.p10))}" height="${ph}" rx="4"/>`;
  [0.25, 0.5, 0.75, 1].forEach((fr) => { const yy = yOf(mx * fr); s += `<line class="histo-grid" x1="${x0}" y1="${f1(yy)}" x2="${x1}" y2="${f1(yy)}"/><text class="histo-ylabel" x="${x0 - 7}" y="${f1(yy + 3)}" text-anchor="end">${(mx * fr / N * 100).toFixed(1)}%</text>`; });
  s += `<line class="histo-baseline" x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}"/>`;
  for (let i = 0; i < bins; i++) { const c = counts[i]; if (!c) continue; const bx = xOf(lo + bw * i), bx2 = xOf(lo + bw * (i + 1)), center = lo + bw * (i + 0.5); const inP = center >= r.p10 && center <= r.p90, by = yOf(c); s += `<rect class="histo-bar${inP ? ' in' : ''}" x="${f1(bx + 0.9)}" y="${f1(by)}" width="${f1(Math.max(1, bx2 - bx - 1.8))}" height="${f1(y1 - by)}" rx="2"><title>${center.toFixed(1)}일 · ${c}회 (${(c / N * 100).toFixed(1)}%)</title></rect>`; }
  const sm = counts.map((c, i) => ((counts[i - 1] || 0) + 2 * c + (counts[i + 1] || 0)) / 4);
  const pts = sm.map((c, i) => [xOf(lo + bw * (i + 0.5)), yOf(c)]);
  let path = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let k = 1; k < pts.length; k++) { const mxp = (pts[k - 1][0] + pts[k][0]) / 2, myp = (pts[k - 1][1] + pts[k][1]) / 2; path += ` Q${f1(pts[k - 1][0])} ${f1(pts[k - 1][1])} ${f1(mxp)} ${f1(myp)}`; }
  s += `<path class="histo-curve" d="${path}"/>`;
  ([['p10', r.p10, 'P10'], ['p50', r.p50, 'P50'], ['p90', r.p90, 'P90']] as const).forEach((p) => { const px = xOf(p[1]); s += `<line class="histo-pline ${p[0]}" x1="${f1(px)}" y1="${y0 - 4}" x2="${f1(px)}" y2="${y1}"/><text class="histo-plabel ${p[0]}" x="${f1(px)}" y="${y0 - 12}" text-anchor="middle">${p[2]} ${p[1].toFixed(1)}일</text>`; });
  for (let t = 0; t <= 5; t++) { const day = lo + (hi - lo) * t / 5, tx = xOf(day); s += `<line class="histo-grid" x1="${f1(tx)}" y1="${y1}" x2="${f1(tx)}" y2="${y1 + 5}"/><text class="histo-tick" x="${f1(tx)}" y="${y1 + 21}" text-anchor="middle">${day.toFixed(0)}일</text>`; }
  return s + '</svg>';
}

export default function RouteView() {
  const [ports, setPorts] = useState<Port[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [kn, setKn] = useState(16.5);
  const [res, setRes] = useState<{ nm: number; sim: SimResult; oKo: string; dKo: string } | null>(null);
  const [msg, setMsg] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const histoBox = useRef<HTMLDivElement>(null);
  const [histoW, setHistoW] = useState(900);

  useEffect(() => {
    const measure = () => { const b = histoBox.current; if (b && b.clientWidth > 0) setHistoW(b.clientWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [res]);

  useEffect(() => {
    const ac = new AbortController();
    fetchPorts(ac.signal).then((ps) => {
      const sorted = ps.slice().sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
      setPorts(sorted);
      const busan = sorted.find((p) => p.en === 'Busan'), rtm = sorted.find((p) => p.en === 'Rotterdam');
      if (busan) setFrom(busan.en); if (rtm) setTo(rtm.en);
    }).catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const m = L.map(mapRef.current, { worldCopyJump: true, minZoom: 1, scrollWheelZoom: false }).setView([25, 60], 2);
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' }).addTo(m);
    layer.current = L.layerGroup().addTo(m); mapObj.current = m;
    return () => { m.remove(); mapObj.current = null; };
  }, []);

  async function run() {
    const o = ports.find((p) => p.en === from), d = ports.find((p) => p.en === to);
    if (!o || !d || o === d) { setMsg('출발·도착 항만을 다르게 선택하십시오.'); return; }
    setMsg('항로 계산 중…'); setRes(null);
    try {
      const all = await (await fetch(`${ROUTES_BASE}/${slugOf(o.en)}.json`)).json();
      const rt = all[slugOf(d.en)];
      if (!rt) throw new Error('해당 구간의 사전계산 항로가 없습니다');
      const sim = simulate(rt.nm, kn);
      setRes({ nm: rt.nm, sim, oKo: o.ko, dKo: d.ko }); setMsg('');
      const mp = mapObj.current, lg = layer.current;
      if (mp && lg) {
        lg.clearLayers();
        const line = L.polyline(rt.line as [number, number][], { color: '#3987e5', weight: 3, opacity: 0.85 }).addTo(lg);
        L.circleMarker([o.lat, o.lng], { radius: 6, color: '#00b8a9', fillOpacity: 0.9 }).bindPopup(o.ko).addTo(lg);
        L.circleMarker([d.lat, d.lng], { radius: 6, color: '#d03b3b', fillOpacity: 0.9 }).bindPopup(d.ko).addTo(lg);
        mp.fitBounds(line.getBounds(), { padding: [30, 30] });
      }
    } catch (e) { setMsg('계산 실패: ' + (e as Error).message); }
  }
  useEffect(() => { if (ports.length && from && to && !res) run(); /* 초기 1회 */ // eslint-disable-next-line
  }, [ports, from, to]);

  const kpis = useMemo(() => {
    if (!res) return null; const r = res.sim;
    return [
      ['항로 거리', `${Number(res.nm).toLocaleString('ko-KR')} 해리(nm)`, `${res.oKo} → ${res.dKo} · 항로망 최단경로`],
      ['예상 소요일 P50', `${r.p50.toFixed(1)} 일`, `중앙값 · 평균 속력 ${kn}kn 기준`],
      ['신뢰 구간 P10~P90', `${r.p10.toFixed(1)}~${r.p90.toFixed(1)} 일`, '10회 중 8회는 이 구간 내 도착'],
      ['지연 리스크', `${(r.p90 - r.p50).toFixed(1)} 일`, 'P50 대비 P90 추가 소요(버퍼 권장)'],
    ];
  }, [res, kn]);

  return (
    <div className="container">
      <div className="page-head">
        <h1>경로 분석 <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 해상 항로·소요일 시뮬레이터</span></h1>
        <p>주요 항만 93개 간 항로 거리 + 몬테카를로 1만 회로 소요일 분포를 추정합니다</p>
      </div>

      <div className="card route-form">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="출발항">{ports.map((p) => <option key={p.en} value={p.en}>{p.ko} ({p.en})</option>)}</select>
        <span className="arrow">→</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="도착항">{ports.map((p) => <option key={p.en} value={p.en}>{p.ko} ({p.en})</option>)}</select>
        <label>평균 속력 <input type="number" value={kn} min={10} max={24} step={0.5} onChange={(e) => setKn(parseFloat(e.target.value) || 16.5)} /> kn</label>
        <button className="btn btn-primary" onClick={run}>시뮬레이션 실행</button>
      </div>

      {msg && <div className="card" style={{ marginBottom: 14 }}>{msg}</div>}
      {kpis && <div className="route-kpis">{kpis.map((k) => (<div className="src-card" key={k[0]}><div className="sc-top"><b>{k[0]}</b></div><div className="sc-big">{k[1]}</div><div className="sc-sub">{k[2]}</div></div>))}</div>}

      <div className="card" style={{ padding: 6, marginBottom: 14 }}><div ref={mapRef} style={{ height: 420, borderRadius: 12 }} /></div>

      {res && (
        <div className="card">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>도착 소요일 분포 <span className="muted" style={{ fontSize: 12 }}>몬테카를로 10,000회</span></h3>
          <div ref={histoBox} dangerouslySetInnerHTML={{ __html: histoSvg(res.sim, histoW) }} />
          <div id="histoAxis">
            <span className="hl"><i className="hl-sw in" />P10~P90 (80% 구간)</span>
            <span className="hl"><i className="hl-sw out" />그 외</span>
            <span className="hl"><i className="hl-sw curve" />밀도 곡선</span>
            <span className="hl hl-r">중앙값 P50 {res.sim.p50.toFixed(1)}일 · 표본 10,000회</span>
          </div>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        항로망 최단경로 거리에 속력 변동(정규)과 항만 버퍼(로그정규)를 적용한 확률 추정입니다. 기항지·운하 대기·스케줄 윈도우는 미반영, 선사 공표 스케줄과 함께 참고하십시오.
      </p>
    </div>
  );
}

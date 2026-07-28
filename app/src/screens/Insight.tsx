import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchPorts, fetchSnapshot, LEVEL_KO, LEVEL_COLOR, type Port, type Snapshot } from '../lib/ports';
import { LOCODE, CC_KO } from '../lib/locode';
import './Insight.css';

function Gauge({ v }: { v: number }) {
  const cx = 75, cy = 84, r = 62, PI = Math.PI;
  const arc = (a0: number, a1: number, color: string, w: number) => {
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > PI ? 1 : 0;
    return <path d={`M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />;
  };
  const ang = (p: number) => PI + (p / 100) * PI;
  const lv = v >= 75 ? 'CONGESTED' : v >= 50 ? 'BUSY' : v >= 25 ? 'STABLE' : 'LOW';
  return (
    <svg width="150" height="92" viewBox="0 0 150 92" role="img" aria-label="종합 PCI 게이지">
      {arc(ang(0), ang(25), 'rgba(12,163,12,0.28)', 9)}{arc(ang(25.5), ang(50), 'rgba(250,178,25,0.30)', 9)}
      {arc(ang(50.5), ang(75), 'rgba(236,131,90,0.32)', 9)}{arc(ang(75.5), ang(100), 'rgba(208,59,59,0.32)', 9)}
      {arc(ang(0), ang(Math.max(2, v)), LEVEL_COLOR[lv as keyof typeof LEVEL_COLOR], 9)}
    </svg>
  );
}

export default function Insight() {
  const [ports, setPorts] = useState<Port[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Port | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const hi = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([fetchPorts(ac.signal), fetchSnapshot(ac.signal)]).then(([p, s]) => { setPorts(p); setSnap(s); }).catch(() => {});
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const m = L.map(mapRef.current, { worldCopyJump: true, minZoom: 2, maxZoom: 10, scrollWheelZoom: false }).setView([22, 15], 2);
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd' }).addTo(m);
    layer.current = L.layerGroup().addTo(m); mapObj.current = m;
    return () => { m.remove(); mapObj.current = null; };
  }, []);

  useEffect(() => {
    const lg = layer.current; if (!lg || !ports.length) return;
    lg.clearLayers();
    ports.forEach((p) => {
      const mk = L.circleMarker([p.lat, p.lng], { radius: 4 + p.tpfs / 100 * 12, color: LEVEL_COLOR[p.level], weight: 1.5, fillColor: LEVEL_COLOR[p.level], fillOpacity: 0.55 });
      mk.bindPopup(`<b>${p.ko}</b> <small>${p.en}</small><br>PCI ${p.tpfs} · ${LEVEL_KO[p.level]}<br>지연 ${p.delay}h · 대기/접안 ${p.waiting}/${p.berthed}`, { closeButton: false });
      mk.on('mouseover', () => mk.openPopup()); mk.on('mouseout', () => mk.closePopup());
      lg.addLayer(mk);
    });
  }, [ports]);

  const idx = useMemo(() => ports.map((p) => ({ p, loc: LOCODE[p.en.toLowerCase()] || '', hay: (p.ko + ' ' + p.en + ' ' + (LOCODE[p.en.toLowerCase()] || '')).toLowerCase() })), [ports]);
  const hits = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 ? [] : idx.filter((x) => x.hay.includes(s)).slice(0, 8); }, [q, idx]);

  function focus(p: Port) {
    setQ(p.ko + (LOCODE[p.en.toLowerCase()] ? ` (${LOCODE[p.en.toLowerCase()]})` : '')); setDetail(p);
    const m = mapObj.current, lg = layer.current; if (!m || !lg) return;
    m.setView([p.lat, p.lng], 6, { animate: true });
    if (hi.current) lg.removeLayer(hi.current);
    hi.current = L.circleMarker([p.lat, p.lng], { radius: 16, color: '#00b8a9', weight: 3, fill: false }).addTo(lg);
  }

  const top10 = useMemo(() => ports.slice().sort((a, b) => b.tpfs - a.tpfs).slice(0, 10), [ports]);
  const kCritical = ports.filter((p) => p.level === 'CONGESTED').length;
  const avgDelay = ports.length ? (ports.reduce((s, p) => s + p.delay, 0) / ports.length).toFixed(1) : '—';

  return (
    <div className="container">
      <div className="page-head">
        <h1>Port Insight <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 글로벌 항만 혼잡도</span></h1>
        <p>중점 모니터링 항만(Focus Port) 93개의 혼잡도를 IMF PortWatch(위성 AIS)로 산출 · 기준일 {snap?.period_end || '—'}</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi"><div className="k">종합 PCI (Port Congestion Index)</div>
          <div className="gauge-wrap"><Gauge v={snap?.tpfs || 0} /><div className="gauge-meta"><div className="v">{snap?.tpfs ?? '—'}<small>/100</small></div></div></div></div>
        <div className="kpi"><div className="k">혼잡(CONGESTED) 항만</div><div className="v">{kCritical}<small>개</small></div><div className="sub">Focus Port 93개 중</div></div>
        <div className="kpi"><div className="k">글로벌 리스크</div><div className="v risk">{snap?.global_risk || '—'}</div><div className="sub">종합 판정</div></div>
        <div className="kpi"><div className="k">평균 접안 지연</div><div className="v">{avgDelay}<small>h</small></div><div className="sub">Focus Port 평균(추정)</div></div>
      </div>

      {snap && (
        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 14 }}>혼잡 레벨 분포</b>
          <div className="dist-bar">{snap.distribution.map((d) => <div key={d.level} className="dist-seg" style={{ flex: d.ratio, background: LEVEL_COLOR[d.level] }} title={`${d.level} ${d.ratio}% (${d.count})`}><span>{d.level} {d.ratio}%</span></div>)}</div>
        </div>
      )}

      <div className="port-search" role="search" style={{ marginTop: 18 }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="관심 포트 검색 — 항구명 또는 LOCODE (예: 부산, Savannah, USSAV)" aria-label="포트 검색" />
        {hits.length > 0 && (
          <div className="port-ac">{hits.map((x) => (
            <button key={x.p.en} className="port-ac-item" onClick={() => focus(x.p)}>
              <span className="pai-ko">{x.p.ko}</span><span className="pai-en">{x.p.en}</span>{x.loc && <span className="pai-loc">{x.loc}</span>}<span className="pai-cc">{CC_KO[x.p.cc] || x.p.cc}</span>
            </button>))}
          </div>
        )}
      </div>

      <div className="card map-card" style={{ padding: 6, marginTop: 12, position: 'relative' }}>
        <div ref={mapRef} style={{ height: 460, borderRadius: 12 }} />
        {detail && (
          <div className="port-detail">
            <div className="pd-head"><b>{detail.ko}</b> <small>{detail.en}</small>{LOCODE[detail.en.toLowerCase()] && <span className="pd-loc">{LOCODE[detail.en.toLowerCase()]}</span>}<button className="pd-x" onClick={() => { setDetail(null); if (hi.current && layer.current) layer.current.removeLayer(hi.current); }}>×</button></div>
            <div className="pd-rows">
              <div className="row"><span>PCI</span><b>{detail.tpfs}</b></div>
              <div className="row"><span>레벨</span><b>{LEVEL_KO[detail.level]}</b></div>
              <div className="row"><span>접안 지연</span><b>{detail.delay}h</b></div>
              <div className="row"><span>대기 / 접안</span><b>{detail.waiting} / {detail.berthed}척</b></div>
            </div>
          </div>
        )}
      </div>

      <h2 className="sec-h" style={{ marginTop: 24 }}>최고 혼잡 Top 10</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="ins-tbl">
          <thead><tr><th>#</th><th>항만</th><th>레벨</th><th className="num">PCI</th><th className="num">접안 지연</th><th className="num">대기/접안</th></tr></thead>
          <tbody>{top10.map((p, i) => (<tr key={p.en}><td>{i + 1}</td><td><b>{p.ko}</b> <span className="muted">{p.en}</span></td><td><span className="st" style={{ color: LEVEL_COLOR[p.level] }}>{LEVEL_KO[p.level]}</span></td><td className="num">{p.tpfs}</td><td className="num">{p.delay}h</td><td className="num">{p.waiting}/{p.berthed}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        PCI(Port Congestion Index) — IMF PortWatch 오픈데이터(위성 AIS) 기반 TWL 자체 산출. 원천은 주간 갱신(7~10일 지연).
      </p>
    </div>
  );
}

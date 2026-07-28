import { useEffect, useMemo, useState } from 'react';
import { fetchBerth, type BerthRow } from '../lib/berth';
import './Vessel.css';

const PORTS: Record<string, { ko: string; lat: number; lng: number; zoom: number }> = {
  busan: { ko: '부산신항', lat: 35.03, lng: 128.83, zoom: 12 },
  busanport: { ko: '부산북항', lat: 35.10, lng: 129.06, zoom: 12 },
  gwangyang: { ko: '광양항', lat: 34.88, lng: 127.72, zoom: 12 },
  incheon: { ko: '인천항', lat: 37.42, lng: 126.60, zoom: 11 },
};
const TERMINAL_VIEW: Record<string, { port: string; lat: number; lng: number; zoom: number }> = {
  PNIT: { port: 'busan', lat: 35.083, lng: 128.826, zoom: 15 }, PNC: { port: 'busan', lat: 35.079, lng: 128.821, zoom: 15 },
  HJNC: { port: 'busan', lat: 35.064, lng: 128.815, zoom: 15 }, HPNT: { port: 'busan', lat: 35.058, lng: 128.807, zoom: 15 },
  BNCT: { port: 'busan', lat: 35.054, lng: 128.798, zoom: 15 }, DGT: { port: 'busan', lat: 35.075, lng: 128.775, zoom: 15 },
  GWCT: { port: 'gwangyang', lat: 34.887, lng: 127.700, zoom: 15 }, E1CT: { port: 'incheon', lat: 37.443, lng: 126.607, zoom: 14 },
  ICON: { port: 'incheon', lat: 37.420, lng: 126.615, zoom: 13 },
};

export default function Vessel() {
  const [view, setView] = useState({ lat: PORTS.busan.lat, lng: PORTS.busan.lng, zoom: PORTS.busan.zoom });
  const [portKey, setPortKey] = useState('busan');
  const [rows, setRows] = useState<BerthRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => { const ac = new AbortController(); fetchBerth(ac.signal).then((r) => setRows(r.rows)).catch(() => {}); return () => ac.abort(); }, []);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return rows.filter((r) => (r.vessel_name + ' ' + r.voyage + ' ' + r.carrier).toLowerCase().includes(s)).slice(0, 8);
  }, [q, rows]);

  function selectPort(k: string) { setPortKey(k); const p = PORTS[k]; setView({ lat: p.lat, lng: p.lng, zoom: p.zoom }); }
  function focusVessel(r: BerthRow) {
    const tv = TERMINAL_VIEW[r.terminal_cd];
    if (tv) { setPortKey(tv.port); setView({ lat: tv.lat, lng: tv.lng, zoom: tv.zoom }); }
    document.getElementById('vf-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const src = `https://www.vesselfinder.com/aismap?zoom=${view.zoom}&lat=${view.lat}&lon=${view.lng}&width=100%25&height=560&names=true&clicktoact=false&store_pos=false`;

  return (
    <div className="container">
      <div className="page-head">
        <h1>선박 위치 <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 실시간 AIS 지도</span></h1>
        <p>항만 주변 선박의 현재 위치를 실시간으로 표시합니다 (VesselFinder Live AIS · 참고용)</p>
      </div>

      <div className="vf-search">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="선명 / 모선항차 검색 (선석배정 DB 기준)" aria-label="선박 검색" />
        {hits.length > 0 && (
          <div className="vf-hits">
            {hits.map((r) => (
              <button key={r.id} className="vf-hit" onClick={() => focusVessel(r)}>
                <b>{r.vessel_name}</b><span>{r.terminal_cd} · {r.carrier}</span>
                <em>지도에서 보기 →</em>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chip-row">
        {Object.entries(PORTS).map(([k, p]) => (
          <button key={k} className={`f-chip${portKey === k ? '' : ' off'}`} onClick={() => selectPort(k)}>{p.ko}</button>
        ))}
      </div>

      <div className="card" id="vf-map" style={{ padding: 6, marginTop: 12 }}>
        <iframe title="VesselFinder AIS 지도" src={src} width="100%" height="560" style={{ border: 0, borderRadius: 12, display: 'block' }} loading="lazy" />
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        지도는 VesselFinder 공개 AIS 임베드로, 위치는 수 분 지연될 수 있습니다. 운항·안전 판단이 아닌 업무 참고용입니다.
      </p>
    </div>
  );
}

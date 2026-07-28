import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataGrid, type CtxItem } from '../components/DataGrid';
import { fetchBerth, fmtDT, STATUS_KO, type BerthRow } from '../lib/berth';

const PORT_KEY: Record<string, string> = { 부산신항: 'busan', 광양항: 'gwangyang', 인천항: 'incheon' };

const LABELS: Record<string, string> = {
  terminal: '터미널', berth: '선석', vessel: '선명/항차', carrier: '선사', route: '항로',
  cct: '반입마감(CCT)', eta: '접안(ETB)', etd: '출항(ETD)', discharge_qty: '양하', load_qty: '적하', status: '상태',
};

export default function Berth() {
  const [rows, setRows] = useState<BerthRow[]>([]);
  const [day, setDay] = useState('—');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetchBerth(ac.signal)
      .then(({ rows, collectedDate }) => { setRows(rows); setDay(collectedDate); setErr(null); })
      .catch((e) => setErr(String(e?.message || e)))
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  const columns = useMemo<ColumnDef<BerthRow, unknown>[]>(() => [
    { id: 'terminal', header: '터미널', accessorFn: (r) => r.terminal_cd, cell: (c) => {
        const r = c.row.original;
        return <div><b>{r.terminal_cd}{r.sub_terminal ? ` · ${r.sub_terminal}` : ''}</b><div className="sub">{r.terminalName}</div></div>;
      } },
    { id: 'berth', header: '선석', accessorKey: 'berth' },
    { id: 'vessel', header: '선명 / 항차', accessorFn: (r) => r.vessel_name, cell: (c) => {
        const r = c.row.original;
        return <div><b>{r.vessel_name}</b><div className="sub">{r.voyage}</div></div>;
      } },
    { id: 'carrier', header: '선사', accessorKey: 'carrier' },
    { id: 'route', header: '항로', accessorKey: 'route' },
    { id: 'cct', header: '반입마감', accessorFn: (r) => r.cct, cell: (c) => fmtDT(c.getValue() as number | null), enableColumnFilter: false },
    { id: 'eta', header: '접안(ETB)', accessorFn: (r) => r.eta, cell: (c) => fmtDT(c.getValue() as number | null), enableColumnFilter: false },
    { id: 'etd', header: '출항(ETD)', accessorFn: (r) => r.etd, cell: (c) => fmtDT(c.getValue() as number | null), enableColumnFilter: false },
    { id: 'discharge_qty', header: '양하', accessorKey: 'discharge_qty', enableColumnFilter: false, cell: (c) => (c.getValue() as number).toLocaleString() },
    { id: 'load_qty', header: '적하', accessorKey: 'load_qty', enableColumnFilter: false, cell: (c) => (c.getValue() as number).toLocaleString() },
    { id: 'status', header: '상태', accessorFn: (r) => r.status, cell: (c) => {
        const st = c.getValue() as string;
        return <span className={`st st-${st.toLowerCase()}`}>{STATUS_KO[st] || st}</span>;
      } },
  ], []);

  const rowMenu = (r: BerthRow): CtxItem[] => {
    const pk = PORT_KEY[r.port] || 'busan';
    const q = encodeURIComponent(r.vessel_name);
    return [
      { label: '🗺 선박 위치 지도에서 보기', href: `../vessel.html?port=${pk}&q=${q}#livemap`, newTab: true },
      { label: '🔎 VesselFinder 실시간 조회', href: `https://www.vesselfinder.com/vessels?name=${q}`, newTab: true },
      { label: '🧭 경로 분석 열기', href: '#/route' },
      { label: '📦 화물 추적 열기', href: '#/cargo' },
      { label: '📋 선명·항차 복사', onClick: () => navigator.clipboard?.writeText(`${r.vessel_name} ${r.voyage === '—' ? '' : r.voyage}`.trim()) },
    ];
  };

  return (
    <div className="container">
      <div className="page-head">
        <h1>선석배정현황 <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 국내 터미널 통합</span></h1>
        <p>부산신항·광양·인천 9개 터미널 · 수집일 {day} · 총 {rows.length}건 {loading && '· 불러오는 중…'}</p>
      </div>
      {err ? (
        <div className="card">데이터 조회 실패: {err}</div>
      ) : (
        <DataGrid<BerthRow>
          columns={columns}
          data={rows}
          excelName={`선석배정_${day}`}
          columnLabels={LABELS}
          rowContextMenu={rowMenu}
        />
      )}
    </div>
  );
}

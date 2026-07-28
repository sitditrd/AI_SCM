import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataGrid } from '../components/DataGrid';
import { fetchStatus, ST, ageText, fmtTs, dstr, type StatusData, type SourceState, type CollectLog } from '../lib/status';
import './Status.css';

const LABELS: Record<string, string> = {
  collected_date: '수집일', file_name: '파일', total_rows: '적재 건수', status: '상태', message: '비고', created_at: '적재 시각',
};

type Card = { name: string; state: SourceState; big: string; sub: string; next: string };

function buildCards(d: StatusData, now: number): { cards: Card[]; overall: SourceState } {
  const cards: Card[] = [];
  let berthState: SourceState = 'off';
  if (d.berth) {
    const age = now - new Date(d.berth.date + 'T06:00:00+09:00').getTime();
    berthState = age < 26 * 3600000 ? 'ok' : age < 30 * 3600000 ? 'warn' : 'late';
    cards.push({ name: '선석배정', state: berthState, big: `${d.berth.count}건 · ${d.berth.date}`,
      sub: `9개 터미널 · ${ageText(age)} 수집 · 갱신 24시간`, next: '내일 06:00 수집' });
  } else cards.push({ name: '선석배정', state: 'off', big: '—', sub: '연결 실패', next: '—' });

  let piState: SourceState = 'off';
  if (d.pi) {
    const age = now - new Date(d.pi.updated_at).getTime();
    piState = age < 26 * 3600000 ? 'ok' : age < 50 * 3600000 ? 'warn' : 'late';
    cards.push({ name: 'Port Insight (PCI)', state: piState, big: `PCI ${d.pi.tpfs} · 기준일 ${d.pi.period_end}`,
      sub: `최종 산출 ${ageText(age)} · 산출 24시간(원천 주간)`, next: '내일 06시대 산출' });
  } else cards.push({ name: 'Port Insight', state: 'off', big: '—', sub: '연결 실패', next: '—' });

  if (d.fx) {
    const age = now - new Date(d.fx.date + 'T00:00:00+09:00').getTime();
    const fxState: SourceState = age < 9 * 86400000 ? 'ok' : 'warn';
    cards.push({ name: '해상운임지수 (SCFI·CCFI)', state: fxState,
      big: d.fx.scfi != null ? `SCFI ${Number(d.fx.scfi).toLocaleString('ko-KR')} · ${d.fx.date}` : `— · ${d.fx.date}`,
      sub: `${ageText(age)} 발표분 · 주간 공표(금요일)`, next: '월요일 07시 수집' });
  } else cards.push({ name: '해상운임지수', state: 'off', big: '—', sub: '데이터 없음', next: '월요일 07시' });

  const key = [berthState, piState];
  const overall: SourceState = key.includes('late') || key.includes('off') ? 'late' : key.includes('warn') ? 'warn' : 'ok';
  return { cards, overall };
}

export default function Status() {
  const [data, setData] = useState<StatusData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const load = () => fetchStatus(ac.signal).then(setData).catch((e) => setErr(String(e?.message || e)));
    load();
    const t = setInterval(load, 45000);
    return () => { clearInterval(t); ac.abort(); };
  }, []);

  const columns = useMemo<ColumnDef<CollectLog, unknown>[]>(() => [
    { id: 'collected_date', header: '수집일', accessorKey: 'collected_date' },
    { id: 'file_name', header: '파일', accessorFn: (r) => r.file_name || '—' },
    { id: 'total_rows', header: '적재 건수', accessorKey: 'total_rows', enableColumnFilter: false, cell: (c) => (c.getValue() as number).toLocaleString() },
    { id: 'status', header: '상태', accessorFn: (r) => r.status, cell: (c) => {
        const ok = c.getValue() === 'SUCCESS';
        return <span className={`st st-${ok ? 'working' : 'departed'}`} style={ok ? undefined : { color: 'var(--lv-congested)', background: 'color-mix(in srgb, var(--lv-congested) 18%, transparent)' }}>{ok ? 'SUCCESS' : 'FAIL'}</span>;
      } },
    { id: 'message', header: '비고', accessorFn: (r) => r.message || '' },
    { id: 'created_at', header: '적재 시각', accessorFn: (r) => r.created_at, cell: (c) => fmtTs(c.getValue() as string), enableColumnFilter: false },
  ], []);

  const now = Date.now();
  const { cards, overall } = data ? buildCards(data, now) : { cards: [], overall: 'off' as SourceState };

  // 최근 7일 타임라인
  const timeline = useMemo(() => {
    if (!data) return [];
    const byDate: Record<string, CollectLog> = {};
    data.logs.forEach((l) => { const c = byDate[l.collected_date]; if (!c || l.status === 'SUCCESS') byDate[l.collected_date] = l; });
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000); const ds = dstr(d); const log = byDate[ds];
      out.push({ ds, today: i === 0, cls: log ? (log.status === 'SUCCESS' ? 'ok' : 'fail') : 'none',
        mark: log ? (log.status === 'SUCCESS' ? `✓ ${log.total_rows}건` : '✗ 실패') : '· 없음' });
    }
    return out;
  }, [data, now]);

  return (
    <div className="container">
      <div className="page-head">
        <h1>데이터 현황 <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 파이프라인 모니터링</span></h1>
        <p>선석배정·Port Insight·운임지수 수집 파이프라인의 적재·최신성·이력</p>
      </div>

      {err && <div className="card">데이터 조회 실패: {err}</div>}

      {data && (
        <>
          <div className={`health-banner hb-${overall}`}>
            <span className="hb-dot" />
            <b>{overall === 'ok' ? '모든 파이프라인 정상' : overall === 'warn' ? '일부 파이프라인 확인 필요' : '파이프라인 점검 필요'}</b>
            <span className="hb-sub">{overall === 'ok' ? '선석배정 최신분 적재 완료 · Port Insight 24시간 내 산출' : '아래 최신성 카드에서 주의/지연 항목을 확인하십시오'}</span>
          </div>

          <div className="src-grid">
            {cards.map((c) => (
              <div className="src-card" key={c.name}>
                <div className="sc-top"><b>{c.name}</b>
                  <span className="lv-badge" style={{ color: ST[c.state].varc, background: `color-mix(in srgb, ${ST[c.state].varc} 13%, transparent)` }}><i className="lv-dot" />{ST[c.state].ko}</span>
                </div>
                <div className="sc-big">{c.big}</div>
                <div className="sc-sub">{c.sub}</div>
                <div className="sc-next">다음 갱신 · {c.next}</div>
              </div>
            ))}
          </div>

          <h2 className="sec-h">최근 7일 적재 기록</h2>
          <div className="day-grid">
            {timeline.map((t) => (
              <div className={`day-chip dg-${t.cls}`} key={t.ds}><small>{t.ds.slice(5)}{t.today ? ' (오늘)' : ''}</small><b>{t.mark}</b></div>
            ))}
          </div>

          <h2 className="sec-h">적재 이력 상세 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 정렬·컬럼 이동·그룹·엑셀 지원</span></h2>
          <DataGrid<CollectLog>
            columns={columns}
            data={data.logs}
            excelName="적재이력"
            columnLabels={LABELS}
          />
        </>
      )}
    </div>
  );
}

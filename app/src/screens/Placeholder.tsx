/* 레거시(정적 HTML) 화면으로 연결되는 자리표시자 — React 이관 진행 중 */
const LEGACY: Record<string, { title: string; file: string; desc: string }> = {
  insight: { title: 'Port Insight', file: 'insight.html', desc: '항만 혼잡도 대시보드(PCI) — 게이지·분포·권역·지도·순위' },
  vessel: { title: '선박 위치', file: 'vessel.html', desc: '실시간 AIS 지도 · 선명 검색→터미널 확대 이동' },
  cargo: { title: '화물 추적', file: 'cargo.html', desc: 'MBL/HBL/AWB 통관 진행 · 무료 조회 채널 딥링크' },
  route: { title: '경로 분석', file: 'route.html', desc: '해상 항로 + 몬테카를로 소요일 시뮬레이터' },
  status: { title: '데이터 현황', file: 'status.html', desc: '파이프라인 적재·최신성·이력 운영 보드' },
};

export default function Placeholder({ id }: { id: string }) {
  const it = LEGACY[id] || { title: id, file: 'index.html', desc: '' };
  return (
    <div className="container">
      <div className="placeholder card">
        <h2>{it.title}</h2>
        <p>{it.desc}</p>
        <p className="muted" style={{ marginTop: 16 }}>
          이 화면은 React 이관 진행 중입니다. 현재는 기존 운영 화면에서 제공됩니다.
        </p>
        <a className="btn btn-primary" style={{ marginTop: 14 }} href={`../${it.file}`}>기존 화면 열기 →</a>
      </div>
    </div>
  );
}

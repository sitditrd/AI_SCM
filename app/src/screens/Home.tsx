import { Link } from 'react-router-dom';

const CARDS = [
  { to: '/insight', title: 'Port Insight', desc: 'IMF PortWatch(위성 AIS) 기반 주요 항만 93개 혼잡도 — PCI 지수, 매일 산출.' },
  { to: '/berth', title: '선석배정', desc: '부산신항·광양·인천 9개 터미널 · 고급 그리드(정렬·컬럼 이동·트리·엑셀).' },
  { to: '/vessel', title: '선박 위치', desc: '실시간 AIS 지도(VesselFinder) · 선명 검색→터미널 확대 이동.' },
  { to: '/cargo', title: '화물 추적', desc: 'MBL/HBL/AWB 통관 진행 조회 · 선사·항공사 자동 감지 딥링크.' },
  { to: '/route', title: '경로 분석', desc: '해상 항로 거리 + 몬테카를로 소요일(P10/P50/P90) 시뮬레이터.' },
  { to: '/status', title: '데이터 현황', desc: '파이프라인 적재·최신성·이력 운영 보드.' },
];

export default function Home() {
  return (
    <div className="container">
      <section className="hero card" style={{ background: 'var(--hero-grad)', color: '#eaf1fb', border: 'none', padding: '48px 40px', marginBottom: 24 }}>
        <div style={{ fontWeight: 800, letterSpacing: 2, color: '#8fc0f7', fontSize: 13 }}>TWL CONTROL TOWER</div>
        <h1 style={{ fontSize: 40, margin: '10px 0 8px', color: '#fff' }}>태웅로직스 물류 관제 포털</h1>
        <p style={{ fontSize: 17, color: '#c7d2e4', margin: 0 }}>항만 혼잡·선석배정·선박 위치·화물 추적·경로 분석을 한 화면에서.</p>
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="card" style={{ display: 'block' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{c.title}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

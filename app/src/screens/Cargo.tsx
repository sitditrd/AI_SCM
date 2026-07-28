import { useMemo, useState } from 'react';
import './Cargo.css';

/* 해상 SCAC(선사) 프리픽스 → 트래킹 딥링크 */
const SCAC: Record<string, { name: string; url: (b: string) => string }> = {
  HDMU: { name: 'HMM', url: (b) => `https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do?blNo=${b}` },
  MSCU: { name: 'MSC', url: (b) => `https://www.msc.com/track-a-shipment?agencyPath=twhq&trackingNumber=${b}` },
  MAEU: { name: 'Maersk', url: (b) => `https://www.maersk.com/tracking/${b}` },
  ONEY: { name: 'ONE', url: (b) => `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?bl=${b}` },
  EGLV: { name: 'Evergreen', url: () => 'https://www.shipmentlink.com/servlet/TDB1_CargoTracking.do' },
  KMTC: { name: '고려해운', url: () => 'https://www.ekmtc.com' },
  SKLU: { name: '장금상선', url: () => 'https://ebiz.sinokor.co.kr' },
};
/* 항공 AWB 프리픽스(3자리) → 항공사 */
const AWB: Record<string, string> = { '180': '대한항공', '988': '아시아나', '020': '루프트한자', '176': 'EK', '057': 'AF', '235': 'TK' };

const CHANNELS: { title: string; note: string; links: [string, string][] }[] = [
  { title: '부산신항 터미널 반출입·본선작업', note: '컨테이너·모선항차로 터미널 직접 조회', links: [['HJNC', 'https://www.hjnc.co.kr'], ['PNIT', 'https://www.pnitl.com'], ['PNC', 'https://svc.pncport.com'], ['BNCT', 'https://info.bnctkorea.com'], ['HPNT', 'https://www.hpnt.co.kr'], ['DGT', 'https://www.dgtbusan.com'], ['BPA 체인포털', 'https://www.chainportal.co.kr']] },
  { title: '선사 컨테이너 트래킹', note: 'MBL 입력 시 선사 자동 감지 · 주요 선사 직접 링크', links: [['HMM', 'https://www.hmm21.com'], ['MSC', 'https://www.msc.com/en/track-a-shipment'], ['Maersk', 'https://www.maersk.com/tracking'], ['ONE', 'https://ecomm.one-line.com'], ['Evergreen', 'https://www.shipmentlink.com'], ['KMTC', 'https://www.ekmtc.com'], ['장금상선', 'https://ebiz.sinokor.co.kr']] },
  { title: '항공 화물 (AWB)', note: 'AWB 번호로 항공사 공식 추적', links: [['대한항공 Cargo', 'https://cargo.koreanair.com'], ['아시아나 Cargo', 'https://asianacargo.com'], ['CHAMP 범용조회', 'https://track.champ.aero'], ['track-trace.com', 'https://www.track-trace.com/aircargo']] },
];

export default function Cargo() {
  const [type, setType] = useState<'mbl' | 'hbl'>('mbl');
  const [no, setNo] = useState('');

  const detect = useMemo(() => {
    const v = no.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (v.length >= 4) {
      const p4 = v.slice(0, 4);
      if (SCAC[p4]) return { kind: 'sea' as const, name: SCAC[p4].name, url: SCAC[p4].url(v) };
    }
    const p3 = v.slice(0, 3);
    if (/^\d{3}/.test(v) && AWB[p3]) return { kind: 'air' as const, name: AWB[p3], url: `https://track.champ.aero/${v}` };
    return null;
  }, [no]);

  return (
    <div className="container">
      <div className="page-head">
        <h1>화물 추적 <span className="muted" style={{ fontWeight: 400, fontSize: 18 }}>— 해상·항공 통관 진행</span></h1>
        <p>MBL / HBL / AWB 번호로 통관 진행 상태 조회 · 선사·항공사 자동 감지 딥링크</p>
      </div>

      <div className="card cargo-form">
        <div className="chip-row">
          <button className={`f-chip${type === 'mbl' ? '' : ' off'}`} onClick={() => setType('mbl')}>MBL / AWB</button>
          <button className={`f-chip${type === 'hbl' ? '' : ' off'}`} onClick={() => setType('hbl')}>HBL</button>
        </div>
        <input type="search" value={no} onChange={(e) => setNo(e.target.value)} placeholder="B/L 번호 (예: HDMU1234567 / 180-12345675)" aria-label="B/L 번호" />
        {detect ? (
          <a className="btn btn-primary" href={detect.url} target="_blank" rel="noopener">
            {detect.kind === 'sea' ? '🚢' : '✈'} {detect.name} 트래킹 열기 →
          </a>
        ) : (
          <span className="cargo-hint">번호를 입력하면 선사/항공사를 자동 감지합니다. 통관 타임라인 실조회는 UNIPASS 키 연동 후 제공됩니다.</span>
        )}
      </div>

      <h2 className="sec-h">터미널·선사·항공 무료 조회 채널 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· 키 없이 즉시 조회</span></h2>
      <div className="cargo-channels">
        {CHANNELS.map((c) => (
          <div className="card" key={c.title}>
            <h3>{c.title}</h3>
            <p className="muted">{c.note}</p>
            <div className="ch-links">
              {c.links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener">{label}</a>)}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        무료 API 확충 로드맵: UNIPASS(통관 타임라인)·선사 DCSA API·해수부 PORT-MIS·AISStream은 키 발급 즉시 연동되도록 준비되어 있습니다.
      </p>
    </div>
  );
}
